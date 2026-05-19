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

  async function runTempNotificationTest(mode = 'immediate') {
    const current = state(); const test = current.tempNotificationTest || {};
    try {
      test.status = 'running'; test.response = null; test.routingCounts = ''; test.pushCounts = ''; test.visibleAfter = ''; rerender();
      const db = await CR.getSupabase();
      const games = Array.isArray(current.schedule) ? current.schedule : [];
      const activeGame = games.find((game) => ['live', 'in progress'].includes(String(game.status || '').toLowerCase()));
      const fallbackGame = games[0] || null;
      const gameId = Number(activeGame?.dbId || activeGame?.id || fallbackGame?.dbId || fallbackGame?.id || 0);

      let body;

      if (mode === 'delayed') {
        body = {
          game_id: gameId,
          title: 'Canes Rivalry Spoiler Test',
          message: 'Delayed notify-rivalry-event test.',
          event_key: `v2-test-delayed-${Date.now()}`,
          suppress_self: false,
          delay_visible: true
        };
      } else if (mode === 'active') {
        body = {
          game_id: gameId,
          title: 'Canes Rivalry Active Check',
          message: 'Active device suppression check.',
          event_key: `v2-active-check-${Date.now()}`,
          suppress_self: false,
          delay_visible: false
        };
      } else {
        body = {
          game_id: gameId,
          title: 'Canes Rivalry Test',
          message: 'Immediate notify-rivalry-event test.',
          event_key: `v2-test-immediate-${Date.now()}`,
          suppress_self: false,
          delay_visible: false,
          bypass_delay: true,
          bypass_active_device_check: true
        };
      }

      const result = await db.functions.invoke('notify-rivalry-event', { body });
      if (result.error) throw result.error;
      const data = result.data || {};
      test.status = data.ok ? 'ok' : 'error'; test.response = data; rerender();
    } catch (error) { console.error('Temporary notification test failed', error); test.status = 'error'; test.response = { error: error?.message || String(error || 'Unknown error') }; rerender(); CR.showToast?.({ message: error?.message || 'Notification test failed', tier: 'warning' }); }
  }

  function scheduleWatchSave() {
    const current = state();
    if (!current?.watchExperience) return;
    clearTimeout(watchSaveTimer);
    const sequence = ++watchSaveSequence;
    current.watchExperience.saveState = 'saving';
    rerender();
    watchSaveTimer = setTimeout(async () => {
      try {
        const latest = state();
        await CR.userSettingsService?.saveWatchExperience?.(latest.watchExperience);
        if (sequence !== watchSaveSequence) return;
        latest.watchExperience.saveState = 'saved';
        rerender();
      } catch (error) {
        console.error('Watch experience save failed', error);
        const latest = state();
        if (latest?.watchExperience) latest.watchExperience.saveState = 'error';
        rerender();
        CR.showToast?.({ message: error?.message || 'Could not save notification timing', tier: 'warning' });
      }
    }, 450);
  }

  function refreshGameDayAfterMockChange() { CR.refreshGameDayData?.({ flash: true }); CR.renderGameDayState?.(); }
  function setMockOptions(patch = {}) { const service = CR.gameDayMockService; if (!service) return; service.setMockOptions?.({ enabled: patch.enabled ?? service.isEnabled?.(), mode: patch.mode || service.currentMode?.() || 'pregame', playoffs: patch.playoffs ?? service.isPlayoffs?.(), carryover: patch.carryover ?? service.isCarryover?.() }); refreshGameDayAfterMockChange(); rerender(); }

  async function saveGame(button) {
    const current = state(); const draft = current.scheduleDraft || {}; const opponent = String(draft.opponent || '').trim().toUpperCase(); const date = String(draft.date || '').trim();
    if (!date || !opponent) { CR.showToast?.({ message: 'Add a date and opponent first' }); return; }
    const payload = { date, opponent, type: draft.type || 'Regular Season', firstPicker: pickerLabelFromDraft(draft, current), firstPickerUserId: draft.firstPickerUserId || null };
    try { CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' }); if (current.editingScheduleGameId) await CR.manageDataService.updateGame(current.editingScheduleGameId, payload); else await CR.manageDataService.createGame(payload); resetScheduleDraft(); current.scheduleSheetOpen = false; rerender(); await refreshManageAndGameDay(); CR.showToast?.({ message: `${opponent} game ${current.editingScheduleGameId ? 'updated' : 'added'}` }); }
    catch (error) { console.error('Game save failed', error); CR.showToast?.({ message: error?.message || 'Could not save game', tier: 'warning' }); }
    finally { CR.ui?.setActionBusy?.(button, false); }
  }
