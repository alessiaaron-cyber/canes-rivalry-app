window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const DEFAULT_TOAST_DELAY_SECONDS = 90;
  const pendingToastTimers = new Set();

  function currentUserEmail() {
    return String(CR.currentUser?.email || CR.authState?.user?.email || '').toLowerCase().trim();
  }

  function currentGameId() {
    return String(CR.gameDay?.currentGameId || '');
  }

  function belongsToCurrentGame(row = {}) {
    const gameId = currentGameId();
    if (!gameId) return false;
    return String(row.game_id || '') === gameId;
  }

  function currentToastSettings() {
    const settings = CR.userSettingsService?.get?.() || CR.userSettings || {};
    const stream = settings.stream_settings || {};
    const notifications = settings.notification_settings || {};
    const delay = CR.userSettingsService?.normalizeDelay
      ? CR.userSettingsService.normalizeDelay(stream.toast_delay_seconds, DEFAULT_TOAST_DELAY_SECONDS)
      : Number(stream.toast_delay_seconds ?? DEFAULT_TOAST_DELAY_SECONDS);

    return {
      enabled: notifications.toast_enabled !== false,
      delaySeconds: Number.isFinite(delay) ? Math.max(0, delay) : DEFAULT_TOAST_DELAY_SECONDS
    };
  }

  function shouldDelayToast(row = {}) {
    const payload = row.payload || {};
    return payload.spoiler_sensitive === true || payload.delay_visible === true;
  }

  function shouldToast(row = {}) {
    if (!row || row.event_type !== 'push_notification') return false;
    if (!belongsToCurrentGame(row)) return false;

    const settings = currentToastSettings();
    if (!settings.enabled) return false;

    const payload = row.payload || {};
    const triggeredBy = String(payload.triggered_by || '').toLowerCase().trim();
    const email = currentUserEmail();

    if (triggeredBy && email && triggeredBy === email) return false;
    return true;
  }

  function showToastNow(row = {}) {
    const payload = row.payload || {};
    const title = payload.title || 'Canes Rivalry';
    const message = payload.message || 'Rivalry update.';

    CR.showToast?.(`${title}: ${message}`);
  }

  function toastRow(row = {}) {
    if (!shouldToast(row)) return;

    const settings = currentToastSettings();
    const delayMs = shouldDelayToast(row) ? settings.delaySeconds * 1000 : 0;

    if (delayMs <= 0) {
      showToastNow(row);
      return;
    }

    const timer = window.setTimeout(() => {
      pendingToastTimers.delete(timer);
      if (shouldToast(row)) showToastNow(row);
    }, delayMs);

    pendingToastTimers.add(timer);
  }

  function clearPendingToasts() {
    pendingToastTimers.forEach((timer) => window.clearTimeout(timer));
    pendingToastTimers.clear();
  }

  function register() {
    if (CR.__rivalryEventsConsumerRegistered || !CR.realtime?.register) return;

    CR.__rivalryEventsConsumerRegistered = true;
    CR.realtime.register('rivalry-events-toasts', {
      tables: ['rivalry_events'],
      debounceMs: 0,
      onChange: (payloads = []) => {
        payloads.forEach((payload) => {
          if (payload.eventType === 'DELETE') return;
          toastRow(payload.new || {});
        });
      }
    });

    CR.realtime.start?.();
  }

  CR.rivalryEventsConsumer = {
    register,
    shouldToast,
    toastRow,
    clearPendingToasts
  };
})();
