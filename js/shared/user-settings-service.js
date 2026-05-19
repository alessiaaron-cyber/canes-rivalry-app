window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const ALLOWED_DELAY_SECONDS = [0, 30, 60, 90, 120];

  const DEFAULT_SETTINGS = Object.freeze({
    stream_settings: Object.freeze({
      push_delay_seconds: 90,
      toast_delay_seconds: 90
    }),
    notification_settings: Object.freeze({
      push_enabled: true,
      toast_enabled: true
    }),
    ui_settings: Object.freeze({})
  });

  let cache = null;
  let repairInFlight = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function normalizeDelay(value, fallback = 90) {
    const n = Number(value);
    return ALLOWED_DELAY_SECONDS.includes(n) ? n : fallback;
  }

  function normalizeSettings(row = {}) {
    const stream = row.stream_settings || {};
    const notifications = row.notification_settings || {};

    return {
      user_id: row.user_id || CR.currentUser?.id || null,
      stream_settings: {
        push_delay_seconds: normalizeDelay(stream.push_delay_seconds, DEFAULT_SETTINGS.stream_settings.push_delay_seconds),
        toast_delay_seconds: normalizeDelay(stream.toast_delay_seconds, DEFAULT_SETTINGS.stream_settings.toast_delay_seconds)
      },
      notification_settings: {
        push_enabled: notifications.push_enabled !== false,
        toast_enabled: notifications.toast_enabled !== false
      },
      ui_settings: clone(row.ui_settings || DEFAULT_SETTINGS.ui_settings),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  }

  function defaults(userId = CR.currentUser?.id || null) {
    return normalizeSettings({
      user_id: userId,
      stream_settings: clone(DEFAULT_SETTINGS.stream_settings),
      notification_settings: clone(DEFAULT_SETTINGS.notification_settings),
      ui_settings: clone(DEFAULT_SETTINGS.ui_settings)
    });
  }

  function get() {
    return normalizeSettings(cache || defaults());
  }

  async function repairMissingRow(userId) {
    if (!userId) return null;
    if (repairInFlight) return repairInFlight;

    repairInFlight = (async () => {
      try {
        const db = await CR.getSupabase();
        const payload = defaults(userId);
        const { data, error } = await db
          .from('user_settings')
          .upsert({
            user_id: userId,
            stream_settings: payload.stream_settings,
            notification_settings: payload.notification_settings,
            ui_settings: payload.ui_settings
          }, { onConflict: 'user_id' })
          .select('*')
          .single();

        if (error) throw error;
        cache = normalizeSettings(data);
        CR.userSettings = cache;
        return cache;
      } catch (error) {
        console.warn('Could not repair missing user_settings row', error);
        return null;
      } finally {
        repairInFlight = null;
      }
    })();

    return repairInFlight;
  }

  async function load(user = CR.currentUser) {
    const userId = user?.id || null;
    cache = defaults(userId);
    CR.userSettings = cache;

    if (!userId) return cache;

    try {
      const db = await CR.getSupabase();
      const { data, error } = await db
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        await repairMissingRow(userId);
        return get();
      }

      cache = normalizeSettings(data);
      CR.userSettings = cache;
      return cache;
    } catch (error) {
      console.warn('Could not load user_settings; using defaults', error);
      cache = defaults(userId);
      CR.userSettings = cache;
      return cache;
    }
  }

  async function save(patch = {}) {
    const userId = CR.currentUser?.id || cache?.user_id;
    if (!userId) throw new Error('No signed-in user for settings save.');

    const current = get();
    const next = normalizeSettings({
      user_id: userId,
      stream_settings: {
        ...current.stream_settings,
        ...(patch.stream_settings || {})
      },
      notification_settings: {
        ...current.notification_settings,
        ...(patch.notification_settings || {})
      },
      ui_settings: {
        ...current.ui_settings,
        ...(patch.ui_settings || {})
      }
    });

    const db = await CR.getSupabase();
    const { data, error } = await db
      .from('user_settings')
      .upsert({
        user_id: userId,
        stream_settings: next.stream_settings,
        notification_settings: next.notification_settings,
        ui_settings: next.ui_settings
      }, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw error;

    cache = normalizeSettings(data);
    CR.userSettings = cache;
    return cache;
  }

  async function saveWatchExperience(watchExperience = {}) {
    return save({
      stream_settings: {
        push_delay_seconds: normalizeDelay(watchExperience.pushDelaySeconds, DEFAULT_SETTINGS.stream_settings.push_delay_seconds),
        toast_delay_seconds: normalizeDelay(watchExperience.toastDelaySeconds, DEFAULT_SETTINGS.stream_settings.toast_delay_seconds)
      },
      notification_settings: {
        push_enabled: watchExperience.pushEnabled !== false,
        toast_enabled: watchExperience.toastEnabled !== false
      }
    });
  }

  function clear() {
    cache = null;
    CR.userSettings = defaults(null);
  }

  CR.userSettingsService = {
    ALLOWED_DELAY_SECONDS,
    DEFAULT_SETTINGS,
    defaults,
    get,
    load,
    save,
    saveWatchExperience,
    clear,
    normalizeDelay,
    normalizeSettings
  };

  CR.userSettings = CR.userSettings || defaults(null);
})();
