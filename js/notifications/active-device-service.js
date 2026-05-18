window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const INTERVAL_MS = 60 * 1000;
  let timer = null;
  let lastStatus = null;

  function canCheckPush() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function permissionState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission || 'default';
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
    const registration = await navigator.serviceWorker.ready;
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

    try {
      subscription = supported ? await getSubscription() : null;
      endpoint = subscription?.endpoint || '';
    } catch (error) {
      console.warn('Could not read push subscription status', error);
    }

    const status = {
      supported,
      permission,
      subscribed: Boolean(endpoint),
      endpoint,
      lastSeenAt: lastStatus?.lastSeenAt || null,
      lastActiveUpdateOk: Boolean(lastStatus?.ok),
      lastActiveError: lastStatus?.error || '',
      checkedAt: new Date().toISOString()
    };

    return status;
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
