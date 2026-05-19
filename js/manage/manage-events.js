window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function state() { return CR.manageStore?.getState?.() || CR.manageState; }
  function currentProfileDraft() { const profile = CR.currentProfile || {}; return { displayName: profile.display_name || profile.username || '', colorHex: profile.color_hex || '#111827' }; }
  function closeAllSheets() { const current = state(); if (!current) return; current.activeEditField = null; current.profileEditOpen = false; current.startSeasonOpen = false; current.scoringEditOpen = false; current.rosterSheetOpen = false; current.scheduleSheetOpen = false; current.confirmRemove = null; }
  function rerender(options = {}) { const current = state(); CR.manageState = current; CR.manageStore?.replaceState?.(current, { render: false }); CR.renderManage?.({ scrollTop: options.scrollTop }); }

  async function refreshManageAndGameDay() {
    if (typeof CR.hydrateManageData === 'function') await CR.hydrateManageData();
    try {
      if (typeof CR.refreshGameDayData === 'function') await CR.refreshGameDayData({ skipIfEditing: true, flash: false });
      else CR.renderGameDayState?.();
    } catch (error) {
      console.warn('Game Day refresh after Manage change failed', error);
    }
  }

  async function handleQuickProfileEdit() {
    const current = state();
    const profile = CR.currentProfile || {};
    const draft = currentProfileDraft();

    closeAllSheets();
    if (current) {
      current.profileDraft = null;
      current.profileEditOpen = false;
      rerender();
    }

    const displayName = window.prompt('Display name', draft.displayName || '');
    if (displayName === null) return;

    const cleanName = String(displayName || '').trim();
    if (!cleanName) {
      CR.showToast?.({ message: 'Display name is required', tier: 'warning' });
      return;
    }

    if (!profile.id) {
      CR.showToast?.({ message: 'No profile is loaded', tier: 'warning' });
      return;
    }

    try {
      const db = await CR.getSupabase();
      const result = await db
        .from('user_profiles')
        .update({ display_name: cleanName, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
        .select('*')
        .single();

      if (result.error) throw result.error;

      CR.currentProfile = result.data;
      try { CR.currentProfiles = await CR.auth?.loadActiveProfiles?.() || [result.data]; } catch (_) {}
      CR.identity?.applyUserColorVariables?.();
      CR.renderAccountIdentity?.();
      rerender();
      await refreshManageAndGameDay();
      CR.showToast?.({ message: 'Profile updated' });
    } catch (error) {
      console.error('Profile update failed', error);
      CR.showToast?.({ message: error?.message || 'Could not update profile', tier: 'warning' });
    }
  }

  async function handleManageSignOut() {
    try {
      await CR.auth?.signOut?.();
    } catch (error) {
      console.error('Manage sign out failed', error);
    }

    CR.currentUser = null;
    CR.currentProfile = null;
    CR.currentProfiles = [];
    CR.session = null;
    window.location.reload();
  }

  async function runTempNotificationTest(mode = 'immediate') {
    const current = state();
    const test = current.tempNotificationTest || {};

    try {
      test.status = 'running';
      test.response = null;
      test.routingCounts = '';
      test.pushCounts = '';
      test.visibleAfter = '';
      rerender();

      const db = await CR.getSupabase();
      const games = Array.isArray(current.schedule) ? current.schedule : [];
      const activeGame = games.find((game) => {
        const status = String(game.status || '').toLowerCase();
        return status === 'live' || status === 'in progress';
      });
      const fallbackGame = games[0] || null;
      const gameId = Number(activeGame?.dbId || activeGame?.id || fallbackGame?.dbId || fallbackGame?.id || 0);

      const body = mode === 'delayed'
        ? {
            game_id: gameId,
            title: 'Canes Rivalry Spoiler Test',
            message: 'Delayed notify-rivalry-event test.',
            event_key: `v2-test-delayed-${Date.now()}`,
            suppress_self: false,
            delay_visible: true
          }
        : {
            game_id: gameId,
            title: 'Canes Rivalry Test',
            message: 'Immediate notify-rivalry-event test.',
            event_key: `v2-test-immediate-${Date.now()}`,
            suppress_self: false,
            delay_visible: false,
            bypass_delay: true,
            bypass_active_device_check: true
          };

      const result = await db.functions.invoke('notify-rivalry-event', { body });
      if (result.error) throw result.error;

      const data = result.data || {};
      test.status = data.ok ? 'ok' : 'error';
      test.response = data;
      rerender();
    } catch (error) {
      console.error('Temporary notification test failed', error);
      test.status = 'error';
      test.response = { error: error?.message || String(error || 'Unknown error') };
      rerender();
      CR.showToast?.({ message: error?.message || 'Notification test failed', tier: 'warning' });
    }
  }

  function bindManageEvents() {
    const root = document.querySelector('#manageContent');
    if (!root || root.dataset.eventsBound === 'true') return;

    root.dataset.eventsBound = 'true';

    root.addEventListener('click', async (event) => {
      const profileButton = event.target.closest('[data-manage-open-profile-editor]');
      if (profileButton) {
        await handleQuickProfileEdit();
        return;
      }

      const signOutButton = event.target.closest('[data-manage-sign-out]');
      if (signOutButton) {
        await handleManageSignOut();
        return;
      }

      const tempNotificationTest = event.target.closest('[data-manage-temp-notification-test]');
      if (tempNotificationTest) {
        await runTempNotificationTest(tempNotificationTest.dataset.manageTempNotificationTest || 'immediate');
      }
    });
  }

  CR.manageEvents = { bindManageEvents };
})();