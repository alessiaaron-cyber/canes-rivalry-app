window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  let watchSaveTimer = null;
  let watchSaveSequence = 0;

  function state() { return CR.manageStore?.getState?.() || CR.manageState; }
  function getNestedValue(target, path) { return String(path || '').split('.').reduce((acc, key) => (acc ? acc[key] : undefined), target); }
  function setNestedValue(target, path, value) { const keys = String(path || '').split('.').filter(Boolean); if (!keys.length) return; let cursor = target; for (let i = 0; i < keys.length - 1; i += 1) { cursor = cursor[keys[i]]; if (!cursor) return; } cursor[keys[keys.length - 1]] = value; }
  function closeAllSheets() { const current = state(); if (!current) return; current.activeEditField = null; current.profileEditOpen = false; current.startSeasonOpen = false; current.scoringEditOpen = false; current.rosterSheetOpen = false; current.scheduleSheetOpen = false; current.confirmRemove = null; }
  function rerender(options = {}) { const current = state(); CR.manageState = current; CR.manageStore?.replaceState?.(current, { render: false }); CR.renderManage?.({ scrollTop: options.scrollTop }); }
  function currentProfileDraft() { const profile = CR.currentProfile || {}; return { displayName: profile.display_name || profile.username || '', colorHex: profile.color_hex || '#111827' }; }
  function userDisplayName(user) { return user?.displayName || user?.display_name || user?.username || 'Player'; }
  function userById(id, current = state()) { return (current?.users || []).find((user) => String(user.id || '') === String(id || '')) || null; }
  function colorOptionFor(hex, current = state()) { const normalized = String(hex || '').trim().toLowerCase(); return current?.profileColorOptions?.find((option) => String(option.hex || '').toLowerCase() === normalized) || null; }
  function isColorAvailable(hex, current = state()) { const option = colorOptionFor(hex, current); if (!option) return false; const profile = CR.currentProfile || {}; const currentId = String(profile.id || ''); const normalized = String(hex || '').trim().toLowerCase(); return !(current.users || []).some((user) => { if (String(user.id || '') === currentId) return false; const userHex = String(user.colorHex || user.color_hex || '').trim().toLowerCase(); const userOption = colorOptionFor(userHex, current); return userHex === normalized || (userOption?.family && userOption.family === option.family); }); }
  function resetRosterDraft() { const current = state(); current.rosterDraft = { name: '', position: 'F' }; current.editingRosterPlayerId = null; }
  function pickerLabelFromDraft(draft, current = state()) { const selectedUser = userById(draft?.firstPickerUserId, current); return selectedUser ? userDisplayName(selectedUser) : (draft?.firstPicker || current?.season?.firstPicker || 'TBD'); }
  function resetScheduleDraft() { const current = state(); current.scheduleDraft = { date: '', opponent: '', type: 'Regular Season', firstPicker: current.season.firstPicker, firstPickerUserId: current.season.firstPickerUserId || '' }; current.editingScheduleGameId = null; }

  async function refreshManageAndGameDay() { if (typeof CR.hydrateManageData === 'function') await CR.hydrateManageData(); try { if (typeof CR.refreshGameDayData === 'function') await CR.refreshGameDayData({ skipIfEditing: true, flash: false }); else CR.renderGameDayState?.(); } catch (error) { console.warn('Game Day refresh after Manage change failed', error); } }

  async function saveProfile(button) {
    const current = state();
    const profile = CR.currentProfile || {};
    const draft = current.profileDraft || currentProfileDraft();
    const displayName = String(draft.displayName || '').trim();
    const colorHex = String(draft.colorHex || '').trim().toLowerCase();
    const colorOption = colorOptionFor(colorHex, current);
    if (!profile.id) throw new Error('No profile is loaded.');
    if (!displayName) throw new Error('Display name is required.');
    if (!colorOption) throw new Error('Choose an available profile color.');
    if (!isColorAvailable(colorHex, current)) throw new Error('That color is already used or too similar to another player.');
    CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' });
    const db = await CR.getSupabase();
    const result = await db.from('user_profiles').update({ display_name: displayName, color_hex: colorOption.hex, color_label: colorOption.label, updated_at: new Date().toISOString() }).eq('id', profile.id).select('*').single();
    if (result.error) throw result.error;
    CR.currentProfile = result.data;
    try { CR.currentProfiles = await CR.auth?.loadActiveProfiles?.() || [result.data]; } catch (_) {}
    current.profileEditOpen = false;
    current.profileDraft = null;
    rerender();
    CR.showToast?.({ message: 'Profile updated' });
    CR.identity?.applyUserColorVariables?.();
    CR.renderAccountIdentity?.();
    await refreshManageAndGameDay();
  }

  async function handleManageSignOut() { try { await CR.auth?.signOut?.(); } catch (error) { console.error('Manage sign out failed', error); } CR.currentUser = null; CR.currentProfile = null; CR.currentProfiles = []; CR.session = null; window.location.reload(); }

  async function runTempNotificationTest(mode = 'immediate') {
    const current = state(); const test = current.tempNotificationTest || {};
    try {
      test.status = 'running'; test.response = null; test.routingCounts = ''; test.pushCounts = ''; test.visibleAfter = ''; rerender();
      const db = await CR.getSupabase();
      const games = Array.isArray(current.schedule) ? current.schedule : [];
      const activeGame = games.find((game) => ['live', 'in progress'].includes(String(game.status || '').toLowerCase()));
      const fallbackGame = games[0] || null;
      const gameId = Number(activeGame?.dbId || activeGame?.id || fallbackGame?.dbId || fallbackGame?.id || 0);
      const body = mode === 'delayed' ? { game_id: gameId, title: 'Canes Rivalry Spoiler Test', message: 'Delayed notify-rivalry-event test.', event_key: `v2-test-delayed-${Date.now()}`, suppress_self: false, delay_visible: true } : { game_id: gameId, title: 'Canes Rivalry Test', message: 'Immediate notify-rivalry-event test.', event_key: `v2-test-immediate-${Date.now()}`, suppress_self: false, delay_visible: false, bypass_delay: true, bypass_active_device_check: true };
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

  async function removeGame(id, button) { try { CR.ui?.setActionBusy?.(button, true, { label: 'Removing…' }); await CR.manageDataService.removeGame(id); const current = state(); current.confirmRemove = null; rerender(); await refreshManageAndGameDay(); CR.showToast?.({ message: 'Game removed' }); } catch (error) { console.error('Game remove failed', error); CR.showToast?.({ message: error?.message || 'Could not remove game', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(button, false); } }

  async function importSchedule(button) { try { CR.ui?.setActionBusy?.(button, true, { label: 'Importing…' }); const result = await CR.manageDataService.importNhlSchedule(); await refreshManageAndGameDay(); CR.showToast?.({ message: result?.message || 'Schedule sync complete' }); } catch (error) { console.error('Schedule import failed', error); CR.showToast?.({ message: error?.message || 'Schedule import failed', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(button, false); } }

  async function saveScoringRules(button) { const current = state(); try { CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' }); await CR.manageDataService.saveScoringRules(current.season); current.scoringEditOpen = false; rerender(); await refreshManageAndGameDay(); CR.showToast?.({ message: 'Scoring rules saved' }); } catch (error) { console.error('Scoring save failed', error); CR.showToast?.({ message: error?.message || 'Could not save scoring rules', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(button, false); } }

  async function startNewSeason(button) { const current = state(); const draft = current.newSeasonDraft || {}; const displayName = String(draft.seasonLabel || '').trim(); if (!displayName) { CR.showToast?.({ message: 'Add a season name first' }); return; } try { CR.ui?.setActionBusy?.(button, true, { label: 'Starting…' }); await CR.manageDataService.startNewSeason({ displayName, seasonKey: displayName, firstPickerUserId: draft.firstPickerUserId || null, scoringSystems: current.season.scoringSystems }); current.startSeasonOpen = false; rerender(); await refreshManageAndGameDay(); CR.showToast?.({ message: `${displayName} season started` }); } catch (error) { console.error('Start season failed', error); CR.showToast?.({ message: error?.message || 'Could not start season', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(button, false); } }

  function bindManageEvents() {
    const root = document.querySelector('#manageContent');
    if (!root || root.dataset.eventsBound === 'true') return;
    root.dataset.eventsBound = 'true';

    root.addEventListener('input', (event) => {
      const current = state();
      const profileInput = event.target.closest('[data-manage-profile-input]'); if (profileInput) { current.profileDraft = current.profileDraft || currentProfileDraft(); setNestedValue(current.profileDraft, profileInput.dataset.manageProfileInput, profileInput.value); return; }
      const newSeasonInput = event.target.closest('[data-manage-new-season-input]'); if (newSeasonInput) { current.newSeasonDraft.seasonLabel = newSeasonInput.value; return; }
      const rosterInput = event.target.closest('[data-manage-roster-input]'); if (rosterInput) { current.rosterDraft[rosterInput.dataset.manageRosterInput] = rosterInput.value; return; }
      const scheduleInput = event.target.closest('[data-manage-schedule-input]'); if (scheduleInput) { const key = scheduleInput.dataset.manageScheduleInput; current.scheduleDraft[key] = scheduleInput.value; if (key === 'firstPickerUserId') { const selected = scheduleInput.options?.[scheduleInput.selectedIndex]; current.scheduleDraft.firstPicker = selected?.dataset?.pickerLabel || selected?.textContent || current.scheduleDraft.firstPicker; } return; }
    });

    root.addEventListener('click', async (event) => {
      const current = state();
      const profileButton = event.target.closest('[data-manage-open-profile-editor]'); if (profileButton) { closeAllSheets(); current.profileDraft = currentProfileDraft(); current.profileEditOpen = true; rerender(); return; }
      if (event.target.closest('[data-manage-close-profile]')) { current.profileEditOpen = false; current.profileDraft = null; rerender(); return; }
      const colorButton = event.target.closest('[data-manage-profile-color]'); if (colorButton && !colorButton.disabled) { current.profileDraft = current.profileDraft || currentProfileDraft(); current.profileDraft.colorHex = colorButton.dataset.manageProfileColor; rerender(); return; }
      const saveProfileButton = event.target.closest('[data-manage-save-profile]'); if (saveProfileButton) { try { await saveProfile(saveProfileButton); } catch (error) { console.error('Profile save failed', error); CR.showToast?.({ message: error?.message || 'Could not save profile', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(saveProfileButton, false); } return; }
      const signOutButton = event.target.closest('[data-manage-sign-out]'); if (signOutButton) { await handleManageSignOut(); return; }
      const tempNotificationTest = event.target.closest('[data-manage-temp-notification-test]'); if (tempNotificationTest) { await runTempNotificationTest(tempNotificationTest.dataset.manageTempNotificationTest || 'immediate'); return; }

      const viewTrigger = event.target.closest('[data-manage-view]'); if (viewTrigger) { closeAllSheets(); current.activeManageView = viewTrigger.dataset.manageView || 'main'; rerender({ scrollTop: true }); return; }

      const mockToggle = event.target.closest('[data-manage-mock-toggle]'); if (mockToggle) { setMockOptions({ enabled: !CR.gameDayMockService?.isEnabled?.() }); CR.showToast?.({ message: CR.gameDayMockService?.isEnabled?.() ? 'Mock Game Day on' : 'Mock Game Day off' }); return; }
      const mockClear = event.target.closest('[data-manage-mock-clear]'); if (mockClear) { CR.gameDayMockService?.clearMockOptions?.(); refreshGameDayAfterMockChange(); rerender(); CR.showToast?.({ message: 'Mock settings cleared' }); return; }
      const mockMode = event.target.closest('[data-manage-mock-mode]'); if (mockMode) { setMockOptions({ enabled: true, mode: mockMode.dataset.manageMockMode }); CR.showToast?.({ message: `Mock mode: ${mockMode.dataset.manageMockMode}` }); return; }

      const toggleButton = event.target.closest('[data-manage-toggle]'); if (toggleButton) { const key = toggleButton.dataset.manageToggle; if (key === 'mock.playoffs') { setMockOptions({ enabled: true, playoffs: !CR.gameDayMockService?.isPlayoffs?.() }); CR.showToast?.({ message: 'Mock playoff setting updated' }); return; } if (key === 'mock.carryover') { setMockOptions({ enabled: true, carryover: !CR.gameDayMockService?.isCarryover?.() }); CR.showToast?.({ message: 'Mock carryover setting updated' }); return; } const currentValue = Boolean(getNestedValue(current, key)); setNestedValue(current, key, !currentValue); if (String(key).startsWith('watchExperience.')) scheduleWatchSave(); else rerender(); return; }
      const delayButton = event.target.closest('[data-manage-delay-group]'); if (delayButton) { const group = delayButton.dataset.manageDelayGroup; const seconds = Number(delayButton.dataset.manageDelaySeconds || 0); if (group === 'push') current.watchExperience.pushDelaySeconds = seconds; if (group === 'toast') current.watchExperience.toastDelaySeconds = seconds; scheduleWatchSave(); return; }

      const openPlayerSheet = event.target.closest('[data-manage-open-player-sheet]'); if (openPlayerSheet) { closeAllSheets(); resetRosterDraft(); current.rosterSheetOpen = true; rerender(); return; }
      const closePlayerSheet = event.target.closest('[data-manage-close-player-sheet]'); if (closePlayerSheet) { resetRosterDraft(); current.rosterSheetOpen = false; rerender(); return; }
      const editPlayer = event.target.closest('[data-manage-edit-player]'); if (editPlayer) { const player = current.roster.find((item) => String(item.id) === String(editPlayer.dataset.manageEditPlayer)); if (player) { closeAllSheets(); current.editingRosterPlayerId = player.id; current.rosterDraft = { name: player.name, position: player.position }; current.rosterSheetOpen = true; rerender(); } return; }
      const savePlayer = event.target.closest('[data-manage-save-player]'); if (savePlayer) { await CR.manageActions?.roster?.savePlayer?.(savePlayer); return; }
      const restorePlayer = event.target.closest('[data-manage-restore-player]'); if (restorePlayer) { await CR.manageActions?.roster?.restorePlayer?.(restorePlayer.dataset.manageRestorePlayer, restorePlayer); return; }

      const confirmRemovePlayer = event.target.closest('[data-manage-confirm-remove-player]'); if (confirmRemovePlayer) { const player = current.roster.find((item) => String(item.id) === String(confirmRemovePlayer.dataset.manageConfirmRemovePlayer)); if (player) { closeAllSheets(); current.confirmRemove = { type: 'player', id: player.id, label: player.name }; rerender(); } return; }
      const cancelRemove = event.target.closest('[data-manage-cancel-remove]'); if (cancelRemove) { current.confirmRemove = null; rerender(); return; }
      const confirmRemove = event.target.closest('[data-manage-confirm-remove]'); if (confirmRemove) { const item = current.confirmRemove; if (item?.type === 'player') await CR.manageActions?.roster?.removePlayer?.(item.id, confirmRemove); if (item?.type === 'game') await removeGame(item.id, confirmRemove); return; }

      const openGameSheet = event.target.closest('[data-manage-open-game-sheet]'); if (openGameSheet) { closeAllSheets(); resetScheduleDraft(); current.scheduleSheetOpen = true; rerender(); return; }
      const closeGameSheet = event.target.closest('[data-manage-close-game-sheet]'); if (closeGameSheet) { resetScheduleDraft(); current.scheduleSheetOpen = false; rerender(); return; }
      const editGame = event.target.closest('[data-manage-edit-game]'); if (editGame) { const game = current.schedule.find((item) => String(item.id) === String(editGame.dataset.manageEditGame)); if (game && !game.locked) { closeAllSheets(); current.editingScheduleGameId = game.id; current.scheduleDraft = { date: game.date, opponent: game.opponent, type: game.type, firstPicker: game.firstPicker, firstPickerUserId: game.firstPickerUserId || '' }; current.scheduleSheetOpen = true; rerender(); } return; }
      const saveGameButton = event.target.closest('[data-manage-save-game]'); if (saveGameButton) { await saveGame(saveGameButton); return; }
      const confirmRemoveGame = event.target.closest('[data-manage-confirm-remove-game]'); if (confirmRemoveGame) { const game = current.schedule.find((item) => String(item.id) === String(confirmRemoveGame.dataset.manageConfirmRemoveGame)); if (game && !game.locked) { closeAllSheets(); current.confirmRemove = { type: 'game', id: game.id, label: `${game.date} · ${game.opponent}` }; rerender(); } return; }
      const importScheduleButton = event.target.closest('[data-manage-import-schedule]'); if (importScheduleButton) { await importSchedule(importScheduleButton); return; }

      const startSeason = event.target.closest('[data-manage-start-season]'); if (startSeason) { closeAllSheets(); current.newSeasonDraft = { seasonLabel: '', firstPicker: current.season.firstPicker, firstPickerUserId: current.season.firstPickerUserId || '' }; current.startSeasonOpen = true; rerender(); return; }
      const closeStartSeason = event.target.closest('[data-manage-close-start-season]'); if (closeStartSeason) { current.startSeasonOpen = false; rerender(); return; }
      const newSeasonPicker = event.target.closest('[data-manage-new-season-picker]'); if (newSeasonPicker) { current.newSeasonDraft.firstPickerUserId = newSeasonPicker.dataset.manageNewSeasonPicker; current.newSeasonDraft.firstPicker = newSeasonPicker.dataset.pickerLabel || newSeasonPicker.textContent || current.newSeasonDraft.firstPicker; rerender(); return; }
      const confirmStartSeason = event.target.closest('[data-manage-confirm-start-season]'); if (confirmStartSeason) { await startNewSeason(confirmStartSeason); return; }

      const editScoring = event.target.closest('[data-manage-edit-scoring]'); if (editScoring) { closeAllSheets(); current.scoringEditProfile = editScoring.dataset.manageEditScoring || current.season.scoringProfile || 'Regular'; current.scoringEditOpen = true; rerender(); return; }
      const closeScoring = event.target.closest('[data-manage-close-scoring]'); if (closeScoring) { current.scoringEditOpen = false; rerender(); return; }
      const scoreStep = event.target.closest('[data-manage-score-step]'); if (scoreStep) { const profile = current.scoringEditProfile || current.season.scoringProfile || 'Regular'; const key = scoreStep.dataset.manageScoreStep; const delta = Number(scoreStep.dataset.step || 0); const scoring = current.season.scoringSystems?.[profile]; if (scoring && Object.prototype.hasOwnProperty.call(scoring, key)) { scoring[key] = Math.max(0, Number(scoring[key] || 0) + delta); rerender(); } return; }
      const saveScoring = event.target.closest('[data-manage-save-scoring]'); if (saveScoring) { await saveScoringRules(saveScoring); return; }

      const editTrigger = event.target.closest('[data-manage-edit]'); if (editTrigger) { closeAllSheets(); current.activeEditField = editTrigger.dataset.manageEdit; rerender(); return; }
      const closeEdit = event.target.closest('[data-manage-close-edit]'); if (closeEdit) { current.activeEditField = null; rerender(); return; }
      const editOption = event.target.closest('[data-manage-edit-value]'); if (editOption) { const field = current.activeEditField; const value = editOption.dataset.manageEditValue; if (field && Object.prototype.hasOwnProperty.call(current.season, field)) { current.season[field] = value; current.activeEditField = null; rerender(); CR.showToast?.({ message: `${value} selected` }); } return; }
    });
  }

  CR.manageEvents = { bindManageEvents };
})();