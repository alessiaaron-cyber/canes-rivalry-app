window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const INTERVAL_MS = 60 * 1000;
  const SERVICE_WORKER_READY_TIMEOUT_MS = 1800;
  let timer = null;
  let lastStatus = null;

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
      lastSeenAt: lastStatus?.lastSeenAt || null,
      lastActiveUpdateOk: Boolean(lastStatus?.ok),
      lastActiveError: lastStatus?.error || errorMessage,
      checkedAt: new Date().toISOString()
    };
  }

  async function markActive() {
    if (document.hidden) return null;

    try {
      const email = await getEmail();
      const userId = await getUserId();
      const endpoint = await getEndpoint();
      if (!endpoint || (!email && !userId)) return null;

      const db = await CR.getSupabase();
      const payload = { last_seen_at: new Date().toISOString() };
      let result = null;

      if (userId) {
        result = await db
          .from('push_subscriptions')
          .update(payload)
          .eq('endpoint', endpoint)
          .eq('user_id', userId);
      }

      if (!result?.error && email) {
        result = await db
          .from('push_subscriptions')
          .update(payload)
          .eq('endpoint', endpoint)
          .eq('user_email', email);
      }

      if (result?.error) throw result.error;

      lastStatus = {
        ok: true,
        lastSeenAt: payload.last_seen_at,
        error: ''
      };

      return lastStatus;
    } catch (error) {
      console.warn('Active device update failed', error);
      lastStatus = {
        ok: false,
        lastSeenAt: lastStatus?.lastSeenAt || null,
        error: error?.message || String(error || 'Active device update failed')
      };
      return lastStatus;
    }
  }

  function start() {
    if (timer) return;
    markActive();
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
      if (!document.hidden) markActive();
    });
    window.addEventListener('focus', markActive);
    window.addEventListener('pageshow', markActive);
  }

  CR.activeDeviceService = {
    bind,
    start,
    stop,
    markActive,
    getDeviceStatus,
    canCheckPush,
    permissionState
  };
})();
