window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const INTERVAL_MS = 25 * 1000;
  const SERVICE_WORKER_READY_TIMEOUT_MS = 1800;
  const ACTIVITY_THROTTLE_MS = 8000;
  let timer = null;
  let lastStatus = null;
  let lastActivityWriteMs = 0;

  function canCheckPush() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function permissionState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission || 'default';
  }

  function timeoutAfter(ms, label) {
    return new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
  }

  async function getReadyServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    return Promise.race([
      navigator.serviceWorker.ready,
      timeoutAfter(SERVICE_WORKER_READY_TIMEOUT_MS, 'Service worker readiness')
    ]);
  }

  async function getSwDebug() {
    const debug = {
      controller: Boolean(navigator.serviceWorker?.controller),
      path: window.location.pathname,
      registrationCount: 0,
      scopes: '',
      matchingScope: '',
      readyScope: '',
      readyTimedOut: false
    };

    if (!('serviceWorker' in navigator)) return debug;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations?.() || [];
      const scopes = registrations.map((registration) => registration.scope || '').filter(Boolean);
      debug.registrationCount = scopes.length;
      debug.scopes = scopes.map((scope) => scope.replace(window.location.origin, '')).join('|');
      debug.matchingScope = (scopes.find((scope) => window.location.href.startsWith(scope)) || '').replace(window.location.origin, '');
    } catch (error) {
      debug.scopes = `err:${error?.message || String(error)}`;
    }

    try {
      const ready = await getReadyServiceWorker();
      debug.readyScope = (ready?.scope || '').replace(window.location.origin, '');
    } catch (error) {
      debug.readyTimedOut = true;
    }

    return debug;
  }

  async function getEmail() {
    if (CR.currentUser?.email) return CR.currentUser.email;
    const session = await CR.auth?.getSession?.();
    return session?.user?.email || '';
  }

  async function getUserId() {
    if (CR.currentUser?.id) return CR.currentUser.id;
    const session = await CR.auth?.getSession?.();
    return session?.user?.id || '';
  }

  async function getSubscription() {
    if (!canCheckPush()) return null;
    const registration = await getReadyServiceWorker();
    return registration?.pushManager?.getSubscription?.() || null;
  }

  async function getEndpoint() {
    const subscription = await getSubscription();
    return subscription?.endpoint || '';
  }

  async function getDeviceStatus() {
    const supported = canCheckPush();
    const permission = permissionState();
    let subscription = null;
    let endpoint = '';
    let errorMessage = '';
    const swDebug = await getSwDebug();

    try {
      subscription = supported ? await getSubscription() : null;
      endpoint = subscription?.endpoint || '';
    } catch (error) {
      errorMessage = error?.message || String(error || 'Could not read push subscription status');
      console.warn('Could not read push subscription status', error);
    }

    return {
      supported,
      permission,
      subscribed: Boolean(endpoint),
      endpoint,
      swDebug,
      lastSeenAt: lastStatus?.lastSeenAt || null,
      lastActiveUpdateOk: Boolean(lastStatus?.ok),
      lastActiveError: lastStatus?.error || errorMessage,
      checkedAt: new Date().toISOString()
    };
  }

  async function updateRows(queryBuilder, payload) {
    const result = await queryBuilder.select('id, last_seen_at');
    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data : [];
  }

  async function markActive(options = {}) {
    if (document.hidden && !options.force) return null;

    try {
      const email = await getEmail();
      const userId = await getUserId();
      const endpoint = await getEndpoint().catch(() => '');
      if (!email && !userId && !endpoint) return null;

      const db = await CR.getSupabase();
      const payload = { last_seen_at: new Date().toISOString() };
      let updatedRows = [];

      if (endpoint) {
        updatedRows = await updateRows(
          db.from('push_subscriptions').update(payload).eq('endpoint', endpoint),
          payload
        );
      }

      if (!updatedRows.length && userId) {
        updatedRows = await updateRows(
          db.from('push_subscriptions').update(payload).eq('user_id', userId),
          payload
        );
      }

      if (!updatedRows.length && email) {
        updatedRows = await updateRows(
          db.from('push_subscriptions').update(payload).ilike('user_email', email),
          payload
        );
      }

      if (!updatedRows.length) {
        throw new Error('No push subscription rows matched active heartbeat update');
      }

      lastStatus = {
        ok: true,
        lastSeenAt: payload.last_seen_at,
        updatedRows: updatedRows.length,
        error: ''
      };

      return lastStatus;
    } catch (error) {
      console.warn('Active device update failed', error);
      lastStatus = {
        ok: false,
        lastSeenAt: lastStatus?.lastSeenAt || null,
        updatedRows: 0,
        error: error?.message || String(error || 'Active device update failed')
      };
      return lastStatus;
    }
  }

  function markActiveFromActivity() {
    const now = Date.now();
    if (now - lastActivityWriteMs < ACTIVITY_THROTTLE_MS) return;
    lastActivityWriteMs = now;
    markActive();
  }

  function start() {
    if (timer) return;
    markActive({ force: true });
    timer = setInterval(markActive, INTERVAL_MS);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function bind() {
    if (CR.__activeDeviceBound) return;
    CR.__activeDeviceBound = true;

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) markActive({ force: true });
    });
    window.addEventListener('focus', () => markActive({ force: true }));
    window.addEventListener('pageshow', () => markActive({ force: true }));
    window.addEventListener('pointerdown', markActiveFromActivity, { passive: true });
    window.addEventListener('touchstart', markActiveFromActivity, { passive: true });
  }

  CR.activeDeviceService = {
    bind,
    start,
    stop,
    markActive,
    getDeviceStatus,
    getSwDebug,
    canCheckPush,
    permissionState
  };
})();