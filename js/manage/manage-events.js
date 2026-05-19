window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  let watchSaveTimer = null;
  let watchSaveSequence = 0;

  function state() { return CR.manageStore?.getState?.() || CR.manageState; }
  function getNestedValue(target, path) { return String(path || '').split('.').reduce((acc, key) => (acc ? acc[key] : undefined), target); }
  function setNestedValue(target, path, value) { const keys = String(path || '').split('.').filter(Boolean); if (!keys.length) return; let cursor = target; for (let i = 0; i < keys.length - 1; i += 1) { cursor = cursor[keys[i]]; if (!cursor) return; } cursor[keys[keys.length - 1]] = value; }
  function labelForStreamOption(value) { const option = state()?.streamMode?.options?.find((item) => item.value === value); return option?.label || 'Updated'; }
  function closeAllSheets() { const current = state(); if (!current) return; current.activeEditField = null; current.profileEditOpen = false; current.startSeasonOpen = false; current.scoringEditOpen = false; current.rosterSheetOpen = false; current.scheduleSheetOpen = false; current.confirmRemove = null; }
  function userDisplayName(user) { return user?.displayName || user?.display_name || user?.username || 'Player'; }
  function userById(id, current = state()) { return (current?.users || []).find((user) => String(user.id || '') === String(id || '')) || null; }
  function pickerLabelFromDraft(draft, current = state()) { const selectedUser = userById(draft?.firstPickerUserId, current); return selectedUser ? userDisplayName(selectedUser) : (draft?.firstPicker || current?.season?.firstPicker || 'TBD'); }
  function currentProfileDraft() { const profile = CR.currentProfile || {}; return { displayName: profile.display_name || profile.username || '', colorHex: profile.color_hex || '#111827' }; }
  function colorOptionFor(hex, current = state()) { const normalized = String(hex || '').trim().toLowerCase(); return current?.profileColorOptions?.find((option) => option.hex.toLowerCase() === normalized) || null; }
  function isColorAvailable(hex, current = state()) { const option = colorOptionFor(hex, current); if (!option) return false; const profile = CR.currentProfile || {}; const currentId = String(profile.id || ''); const normalized = String(hex || '').trim().toLowerCase(); return !(current.users || []).some((user) => { if (String(user.id || '') === currentId) return false; const userHex = String(user.colorHex || user.color_hex || '').trim().toLowerCase(); const userOption = colorOptionFor(userHex, current); return userHex === normalized || (userOption?.family && userOption.family === option.family); }); }
  async function refreshManageAndGameDay() { if (typeof CR.hydrateManageData === 'function') await CR.hydrateManageData(); try { if (typeof CR.refreshGameDayData === 'function') await CR.refreshGameDayData({ skipIfEditing: true, flash: false }); else CR.renderGameDayState?.(); } catch (error) { console.warn('Game Day refresh after Manage change failed', error); } }

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
      test.response = {
        error: error?.message || String(error || 'Unknown error')
      };
      rerender();
      CR.showToast?.({ message: error?.message || 'Notification test failed', tier: 'warning' });
    }
  }

  function rerender(options = {}) { const current = state(); CR.manageState = current; CR.manageStore?.replaceState?.(current, { render: false }); CR.renderManage?.({ scrollTop: options.scrollTop }); }

  function bindManageEvents() {
    const root = document.querySelector('#manageContent');
    if (!root || root.dataset.eventsBound === 'true') return;

    root.dataset.eventsBound = 'true';

    root.addEventListener('click', async (event) => {
      const profileButton = event.target.closest('[data-manage-open-profile-editor]');
      if (profileButton) {
        const current = state();
        closeAllSheets();
        current.profileDraft = currentProfileDraft();
        current.profileEditOpen = true;
        rerender();
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