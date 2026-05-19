window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const INTERVAL_MS = 30 * 1000;
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

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
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

  async function updateRows(queryBuilder) {
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
          db.from('push_subscriptions').update(payload).eq('endpoint', endpoint)
        );
      }

      if (!updatedRows.length && userId) {
        updatedRows = await updateRows(
          db.from('push_subscriptions').update(payload).eq('user_id', userId)
        );
      }

      if (!updatedRows.length && email) {
        updatedRows = await updateRows(
          db.from('push_subscriptions').update(payload).ilike('user_email', email)
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

  async function saveSubscription(subscription) {
    const email = await getEmail();
    const userId = await getUserId();
    const json = subscription?.toJSON?.() || {};
    const endpoint = subscription?.endpoint || json.endpoint || '';
    const p256dh = json.keys?.p256dh || '';
    const auth = json.keys?.auth || '';

    if (!endpoint || !p256dh || !auth) {
      throw new Error('Push subscription is incomplete.');
    }

    if (!email && !userId) {
      throw new Error('Sign in before enabling notifications.');
    }

    const db = await CR.getSupabase();
    const payload = {
      endpoint,
      p256dh,
      auth,
      user_email: email || null,
      user_id: userId || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await db
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' })
      .select('id, user_email, user_id, last_seen_at')
      .single();

    if (result.error) throw result.error;

    lastStatus = {
      ok: true,
      lastSeenAt: payload.last_seen_at,
      updatedRows: 1,
      error: ''
    };

    return result.data;
  }

  async function enableNotifications() {
    if (!canCheckPush()) {
      throw new Error('Push notifications are not supported on this device/browser.');
    }

    if (!('Notification' in window)) {
      throw new Error('Notifications are not supported on this device/browser.');
    }

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted.');
    }

    const registration = await getReadyServiceWorker();
    if (!registration?.pushManager) {
      throw new Error('Service worker push manager is unavailable.');
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const vapidPublicKey = CR.config?.vapidPublicKey || CR.config?.VAPID_PUBLIC_KEY || '';
      if (!vapidPublicKey) {
        throw new Error('Missing VAPID public key in app config.');
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }

    const saved = await saveSubscription(subscription);
    await markActive({ force: true });
    return saved;
  }

  async function sendTestNotification() {
    const db = await CR.getSupabase();
    const games = Array.isArray(CR.manageState?.schedule) ? CR.manageState.schedule : [];
    const activeGame = games.find((game) => ['live', 'in progress'].includes(String(game.status || '').toLowerCase()));
    const fallbackGame = games[0] || null;
    const gameId = Number(activeGame?.dbId || activeGame?.id || fallbackGame?.dbId || fallbackGame?.id || 0);

    if (!gameId) {
      throw new Error('No game available for notification test.');
    }

    const result = await db.functions.invoke('notify-rivalry-event', {
      body: {
        game_id: gameId,
        title: 'Canes Rivalry Test',
        message: 'Manage current device test notification.',
        event_key: `manage-device-test-${Date.now()}`,
        suppress_self: false,
        delay_visible: false,
        bypass_delay: true,
        bypass_active_device_check: true
      }
    });

    if (result.error) throw result.error;
    if (result.data && result.data.ok === false) throw new Error(result.data.error || 'Test notification failed.');

    return result.data;
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
    enableNotifications,
    sendTestNotification,
    getDeviceStatus,
    getSwDebug,
    canCheckPush,
    permissionState
  };
})();