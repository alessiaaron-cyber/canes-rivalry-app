window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  let watchSaveTimer = null;
  let watchSaveSequence = 0;

  function state() {
    return CR.manageStore?.getState?.() || CR.manageState;
  }

  function getNestedValue(target, path) {
    return String(path || '').split('.').reduce((acc, key) => (acc ? acc[key] : undefined), target);
  }

  function setNestedValue(target, path, value) {
    const keys = String(path || '').split('.').filter(Boolean);
    if (!keys.length) return;
    let cursor = target;
    for (let i = 0; i < keys.length - 1; i += 1) {
      cursor = cursor[keys[i]];
      if (!cursor) return;
    }
    cursor[keys[keys.length - 1]] = value;
  }

  function labelForStreamOption(value) {
    const option = state()?.streamMode?.options?.find((item) => item.value === value);
    return option?.label || 'Updated';
  }

  function closeAllSheets() {
    const current = state();
    if (!current) return;
    current.activeEditField = null;
    current.profileEditOpen = false;
    current.startSeasonOpen = false;
    current.scoringEditOpen = false;
    current.rosterSheetOpen = false;
    current.scheduleSheetOpen = false;
    current.confirmRemove = null;
  }

  function userDisplayName(user) {
    return user?.displayName || user?.display_name || user?.username || 'Player';
  }

  function userById(id, current = state()) {
    return (current?.users || []).find((user) => String(user.id || '') === String(id || '')) || null;
  }

  function pickerLabelFromDraft(draft, current = state()) {
    const selectedUser = userById(draft?.firstPickerUserId, current);
    return selectedUser ? userDisplayName(selectedUser) : (draft?.firstPicker || current?.season?.firstPicker || 'TBD');
  }

  function currentProfileDraft() {
    const profile = CR.currentProfile || {};
    return {
      displayName: profile.display_name || profile.username || '',
      colorHex: profile.color_hex || '#111827'
    };
  }

  function colorOptionFor(hex, current = state()) {
    const normalized = String(hex || '').trim().toLowerCase();
    return current?.profileColorOptions?.find((option) => option.hex.toLowerCase() === normalized) || null;
  }

  function isColorAvailable(hex, current = state()) {
    const option = colorOptionFor(hex, current);
    if (!option) return false;

    const profile = CR.currentProfile || {};
    const currentId = String(profile.id || '');
    const normalized = String(hex || '').trim().toLowerCase();

    return !(current.users || []).some((user) => {
      if (String(user.id || '') === currentId) return false;
      const userHex = String(user.colorHex || user.color_hex || '').trim().toLowerCase();
      const userOption = colorOptionFor(userHex, current);
      return userHex === normalized || (userOption?.family && userOption.family === option.family);
    });
  }

  async function refreshManageAndGameDay() {
    if (typeof CR.hydrateManageData === 'function') await CR.hydrateManageData();
    try {
      if (typeof CR.refreshGameDayData === 'function') await CR.refreshGameDayData({ skipIfEditing: true, flash: false });
      else CR.renderGameDayState?.();
    } catch (error) {
      console.warn('Game Day refresh after Manage change failed', error);
    }
  }

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
    const result = await db
      .from('user_profiles')
      .update({ display_name: displayName, color_hex: colorOption.hex, color_label: colorOption.label, updated_at: new Date().toISOString() })
      .eq('id', profile.id)
      .select('*')
      .single();

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

  function resetRosterDraft() {
    const current = state();
    current.rosterDraft = { name: '', position: 'F' };
    current.editingRosterPlayerId = null;
  }

  function resetScheduleDraft() {
    const current = state();
    const firstUser = (current.users || [])[0] || null;
    current.scheduleDraft = {
      date: '',
      opponent: '',
      type: 'Regular Season',
      firstPicker: firstUser ? userDisplayName(firstUser) : current.season.firstPicker,
      firstPickerUserId: firstUser?.id || ''
    };
    current.editingScheduleGameId = null;
  }

  function rerender(options = {}) {
    const current = state();
    CR.manageState = current;
    CR.manageStore?.replaceState?.(current, { render: false });
    CR.renderManage?.({ scrollTop: options.scrollTop });
  }

  function scoringIsLocked(profile, current = state()) {
    if (profile === 'Regular') return current?.season?.regularScoringLocked === true;
    return current?.season?.playoffScoringLocked === true;
  }

  function setWatchSaveState(value) {
    const current = state();
    if (!current?.watchExperience) return;
    current.watchExperience.saveState = value;
    rerender();
  }

  function scheduleWatchSaveReset(sequence, delay = 1400) {
    window.clearTimeout(watchSaveTimer);
    watchSaveTimer = window.setTimeout(() => {
      if (sequence !== watchSaveSequence) return;
      const latest = state();
      if (!latest?.watchExperience) return;
      latest.watchExperience.saveState = 'idle';
      rerender();
    }, delay);
  }

  async function persistWatchExperience() {
    const current = state();
    const watch = current?.watchExperience;
    if (!watch || !CR.userSettingsService?.save) return;
    watchSaveSequence += 1;
    const sequence = watchSaveSequence;
    window.clearTimeout(watchSaveTimer);
    setWatchSaveState('saving');
    try {
      const saved = await CR.userSettingsService.save({
        stream_settings: { push_delay_seconds: watch.pushDelaySeconds, toast_delay_seconds: watch.toastDelaySeconds },
        notification_settings: { push_enabled: watch.pushEnabled !== false, toast_enabled: watch.toastEnabled !== false }
      });
      if (sequence !== watchSaveSequence) return;
      const latest = state();
      if (latest?.watchExperience) {
        latest.watchExperience.pushDelaySeconds = Number(saved.stream_settings?.push_delay_seconds ?? latest.watchExperience.pushDelaySeconds);
        latest.watchExperience.toastDelaySeconds = Number(saved.stream_settings?.toast_delay_seconds ?? latest.watchExperience.toastDelaySeconds);
        latest.watchExperience.pushEnabled = saved.notification_settings?.push_enabled !== false;
        latest.watchExperience.toastEnabled = saved.notification_settings?.toast_enabled !== false;
        latest.watchExperience.saveState = 'saved';
      }
      if (latest?.notifications) {
        latest.notifications.pushEnabled = saved.notification_settings?.push_enabled !== false;
        latest.notifications.toastsEnabled = saved.notification_settings?.toast_enabled !== false;
      }
      CR.userSettings = saved;
      rerender();
      scheduleWatchSaveReset(sequence);
    } catch (error) {
      console.error('Watch Experience save failed', error);
      if (sequence !== watchSaveSequence) return;
      const latest = state();
      if (latest?.watchExperience) latest.watchExperience.saveState = 'error';
      rerender();
      scheduleWatchSaveReset(sequence, 2600);
      CR.showToast?.({ message: error?.message || 'Could not save notification settings', tier: 'warning' });
    }
  }

  function refreshGameDayAfterMockChange() {
    CR.refreshGameDayData?.({ flash: true });
    CR.renderGameDayState?.();
  }

  function setMockOptions(patch = {}) {
    const service = CR.gameDayMockService;
    if (!service) return;
    service.setMockOptions?.({ enabled: patch.enabled ?? service.isEnabled?.(), mode: patch.mode || service.currentMode?.() || 'pregame', playoffs: patch.playoffs ?? service.isPlayoffs?.(), carryover: patch.carryover ?? service.isCarryover?.() });
    refreshGameDayAfterMockChange();
    rerender();
  }

  function schedulePayloadFromDraft(current) {
    const draft = current.scheduleDraft || {};
    const opponent = String(draft.opponent || '').trim().toUpperCase();
    const date = String(draft.date || '').trim();
    if (!date || !opponent) throw new Error('Add a date and opponent first');
    return { date, opponent, type: draft.type || 'Regular Season', firstPicker: pickerLabelFromDraft(draft, current), firstPickerUserId: draft.firstPickerUserId || null };
  }

  async function saveGame(button) {
    const current = state();
    const payload = schedulePayloadFromDraft(current);
    CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' });
    if (current.editingScheduleGameId) await CR.manageDataService.updateGame(current.editingScheduleGameId, payload);
    else await CR.manageDataService.createGame(payload);
    resetScheduleDraft();
    current.scheduleSheetOpen = false;
    rerender();
    await refreshManageAndGameDay();
    CR.showToast?.({ message: `${payload.opponent} game ${current.editingScheduleGameId ? 'updated' : 'added'}` });
  }

  async function removeGame(id, button) {
    const current = state();
    const game = current.schedule.find((entry) => String(entry.id) === String(id));
    if (game?.locked) throw new Error('Finalized games are protected from deletion');
    CR.ui?.setActionBusy?.(button, true, { label: 'Removing…' });
    await CR.manageDataService.removeGame(id);
    current.confirmRemove = null;
    rerender();
    await refreshManageAndGameDay();
    CR.showToast?.({ message: 'Game removed from schedule' });
  }

  async function importSchedule(button) {
    CR.ui?.setActionBusy?.(button, true, { label: 'Importing…' });
    const result = await CR.manageDataService.importNhlSchedule();
    await refreshManageAndGameDay();
    CR.showToast?.({ message: `Imported ${Number(result.imported ?? result.count ?? 0)} games` });
  }

  async function saveScoring(button) {
    const current = state();
    const profile = current.scoringEditProfile || 'Regular';
    if (scoringIsLocked(profile, current)) throw new Error(`${profile} scoring is locked`);
    CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' });
    const saved = await CR.manageDataService.saveScoringRules(current.season);
    current.season = { ...current.season, ...saved };
    current.scoringEditOpen = false;
    current.scoringEditProfile = null;
    rerender();
    await refreshManageAndGameDay();
    CR.showToast?.({ message: `${profile} scoring saved` });
  }

  function bindManageEvents() {
    const root = document.querySelector('#manageContent');
    const editProfileButton = document.querySelector('#manageEditProfileButton');

    editProfileButton?.addEventListener('click', () => { const current = state(); closeAllSheets(); current.profileDraft = currentProfileDraft(); current.profileEditOpen = true; rerender(); });
    if (!root) return;

    root.addEventListener('input', (event) => {
      const current = state();
      const profileInput = event.target.closest('[data-manage-profile-input]');
      if (profileInput) { current.profileDraft = current.profileDraft || currentProfileDraft(); current.profileDraft[profileInput.dataset.manageProfileInput] = profileInput.value; return; }
      const newSeasonInput = event.target.closest('[data-manage-new-season-input]');
      if (newSeasonInput) { current.newSeasonDraft.seasonLabel = newSeasonInput.value; return; }
      const rosterInput = event.target.closest('[data-manage-roster-input]');
      if (rosterInput) { current.rosterDraft[rosterInput.dataset.manageRosterInput] = rosterInput.value; return; }
      const scheduleInput = event.target.closest('[data-manage-schedule-input]');
      if (scheduleInput) {
        current.scheduleDraft[scheduleInput.dataset.manageScheduleInput] = event.target.value;
        if (scheduleInput.dataset.manageScheduleInput === 'firstPickerUserId') current.scheduleDraft.firstPicker = pickerLabelFromDraft(current.scheduleDraft, current);
      }
    });

    root.addEventListener('click', async (event) => {
      const current = state();
      const mockToggle = event.target.closest('[data-manage-mock-toggle]');
      if (mockToggle) { setMockOptions({ enabled: !CR.gameDayMockService?.isEnabled?.() }); CR.showToast?.({ message: CR.gameDayMockService?.isEnabled?.() ? 'Mock Game Day on' : 'Mock Game Day off' }); return; }
      const mockClear = event.target.closest('[data-manage-mock-clear]');
      if (mockClear) { CR.gameDayMockService?.clearMockOptions?.(); refreshGameDayAfterMockChange(); rerender(); CR.showToast?.({ message: 'Mock settings cleared' }); return; }
      const mockMode = event.target.closest('[data-manage-mock-mode]');
      if (mockMode) { setMockOptions({ enabled: true, mode: mockMode.dataset.manageMockMode }); CR.showToast?.({ message: `Mock mode: ${mockMode.dataset.manageMockMode}` }); return; }
      const closeProfile = event.target.closest('[data-manage-close-profile-editor]');
      if (closeProfile) { current.profileEditOpen = false; current.profileDraft = null; rerender(); return; }
      const profileColor = event.target.closest('[data-manage-profile-color]');
      if (profileColor && !profileColor.disabled) { current.profileDraft = current.profileDraft || currentProfileDraft(); current.profileDraft.colorHex = profileColor.dataset.manageProfileColor; rerender(); return; }
      const saveProfileButton = event.target.closest('[data-manage-save-profile]');
      if (saveProfileButton) { try { await saveProfile(saveProfileButton); } catch (error) { console.error('Profile save failed', error); CR.showToast?.({ message: error?.message || String(error || 'Could not save profile'), tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(saveProfileButton, false); } return; }
      const viewTrigger = event.target.closest('[data-manage-view]');
      if (viewTrigger) { closeAllSheets(); current.activeManageView = viewTrigger.dataset.manageView || 'main'; rerender({ scrollTop: true }); return; }
      const openPlayerSheet = event.target.closest('[data-manage-open-player-sheet]');
      if (openPlayerSheet) { closeAllSheets(); resetRosterDraft(); current.rosterSheetOpen = true; rerender(); return; }
      const closePlayerSheet = event.target.closest('[data-manage-close-player-sheet]');
      if (closePlayerSheet) { resetRosterDraft(); current.rosterSheetOpen = false; rerender(); return; }
      const editPlayer = event.target.closest('[data-manage-edit-player]');
      if (editPlayer) { const player = current.roster.find((item) => item.id === editPlayer.dataset.manageEditPlayer); if (player) { closeAllSheets(); current.editingRosterPlayerId = player.id; current.rosterDraft = { name: player.name, position: player.position }; current.rosterSheetOpen = true; rerender(); } return; }
      const restorePlayer = event.target.closest('[data-manage-restore-player]');
      if (restorePlayer) { await CR.manageActions?.roster?.restorePlayer?.(restorePlayer.dataset.manageRestorePlayer, restorePlayer); return; }
      const savePlayer = event.target.closest('[data-manage-save-player]');
      if (savePlayer) { await CR.manageActions?.roster?.savePlayer?.(savePlayer); return; }
      const openGameSheet = event.target.closest('[data-manage-open-game-sheet]');
      if (openGameSheet) { closeAllSheets(); resetScheduleDraft(); current.scheduleSheetOpen = true; rerender(); return; }
      const closeGameSheet = event.target.closest('[data-manage-close-game-sheet]');
      if (closeGameSheet) { resetScheduleDraft(); current.scheduleSheetOpen = false; rerender(); return; }
      const editGame = event.target.closest('[data-manage-edit-game]');
      if (editGame) { const game = current.schedule.find((item) => item.id === editGame.dataset.manageEditGame); if (game) { if (game.locked) { CR.showToast?.({ message: 'Finalized games are protected from editing', tier: 'warning' }); return; } closeAllSheets(); current.editingScheduleGameId = game.id; current.scheduleDraft = { date: game.date, opponent: game.opponent, type: game.type, firstPicker: game.firstPicker, firstPickerUserId: game.firstPickerUserId || '' }; current.scheduleSheetOpen = true; rerender(); } return; }
      const saveGameButton = event.target.closest('[data-manage-save-game]');
      if (saveGameButton) { try { await saveGame(saveGameButton); } catch (error) { console.error('Game save failed', error); CR.showToast?.({ message: error?.message || 'Could not save game', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(saveGameButton, false); } return; }
      const confirmRemovePlayer = event.target.closest('[data-manage-confirm-remove-player]');
      if (confirmRemovePlayer) { const player = current.roster.find((item) => item.id === confirmRemovePlayer.dataset.manageConfirmRemovePlayer); if (player) { closeAllSheets(); current.confirmRemove = { type: 'player', id: player.id, label: player.name }; rerender(); } return; }
      const confirmRemoveGame = event.target.closest('[data-manage-confirm-remove-game]');
      if (confirmRemoveGame) { const game = current.schedule.find((item) => item.id === confirmRemoveGame.dataset.manageConfirmRemoveGame); if (game?.locked) { CR.showToast?.({ message: 'Finalized games are protected from deletion', tier: 'warning' }); return; } if (game) { closeAllSheets(); current.confirmRemove = { type: 'game', id: game.id, label: `${game.date || 'Date TBD'} · ${game.opponent}` }; rerender(); } return; }
      const cancelRemove = event.target.closest('[data-manage-cancel-remove]');
      if (cancelRemove) { current.confirmRemove = null; rerender(); return; }
      const confirmRemove = event.target.closest('[data-manage-confirm-remove]');
      if (confirmRemove) { const item = current.confirmRemove; try { if (item?.type === 'player') { await CR.manageActions?.roster?.removePlayer?.(item.id, confirmRemove); return; } if (item?.type === 'game') await removeGame(item.id, confirmRemove); } catch (error) { console.error('Remove failed', error); CR.showToast?.({ message: error?.message || 'Could not remove', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(confirmRemove, false); } return; }
      const startSeason = event.target.closest('[data-manage-start-season]');
      if (startSeason) { closeAllSheets(); current.startSeasonOpen = true; rerender(); return; }
      const closeStartSeason = event.target.closest('[data-manage-close-start-season]');
      if (closeStartSeason) { current.startSeasonOpen = false; rerender(); return; }
      const newSeasonPicker = event.target.closest('[data-manage-new-season-picker]');
      if (newSeasonPicker) { current.newSeasonDraft.firstPickerUserId = newSeasonPicker.dataset.manageNewSeasonPicker; current.newSeasonDraft.firstPicker = newSeasonPicker.dataset.pickerLabel || current.newSeasonDraft.firstPicker; rerender(); return; }
      const confirmStartSeason = event.target.closest('[data-manage-confirm-start-season]');
      if (confirmStartSeason) { const draft = current.newSeasonDraft; const seasonLabel = String(draft.seasonLabel || '').trim(); if (!seasonLabel) { CR.showToast?.({ message: 'Add a season name first' }); return; } current.season.activeSeasonLabel = seasonLabel; current.season.firstPicker = draft.firstPicker; current.schedule = []; resetScheduleDraft(); current.startSeasonOpen = false; rerender(); CR.showToast?.({ message: `${seasonLabel} season started` }); return; }
      const editScoring = event.target.closest('[data-manage-edit-scoring]');
      if (editScoring) { const profile = editScoring.dataset.manageEditScoring || 'Regular'; if (scoringIsLocked(profile, current)) { CR.showToast?.({ message: `${profile} scoring is locked`, tier: 'warning' }); return; } closeAllSheets(); current.scoringEditProfile = profile; current.scoringEditOpen = true; rerender(); return; }
      const closeScoring = event.target.closest('[data-manage-close-scoring]');
      if (closeScoring) { current.scoringEditOpen = false; current.scoringEditProfile = null; rerender(); return; }
      const scoreStep = event.target.closest('[data-manage-score-step]');
      if (scoreStep) { const profile = current.scoringEditProfile || 'Regular'; if (scoringIsLocked(profile, current)) { CR.showToast?.({ message: `${profile} scoring is locked`, tier: 'warning' }); return; } const key = scoreStep.dataset.manageScoreStep; const delta = Number(scoreStep.dataset.step || 0); const scoring = current.season.scoringSystems?.[profile]; if (scoring && Object.prototype.hasOwnProperty.call(scoring, key)) { scoring[key] = Math.max(0, Number(scoring[key] || 0) + delta); rerender(); } return; }
      const saveScoringButton = event.target.closest('[data-manage-save-scoring]');
      if (saveScoringButton) { try { await saveScoring(saveScoringButton); } catch (error) { console.error('Scoring save failed', error); CR.showToast?.({ message: error?.message || 'Could not save scoring', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(saveScoringButton, false); } return; }
      const editTrigger = event.target.closest('[data-manage-edit]');
      if (editTrigger) { closeAllSheets(); current.activeEditField = editTrigger.dataset.manageEdit; rerender(); return; }
      const closeEdit = event.target.closest('[data-manage-close-edit]');
      if (closeEdit) { current.activeEditField = null; rerender(); return; }
      const editOption = event.target.closest('[data-manage-edit-value]');
      if (editOption) { const field = current.activeEditField; const value = editOption.dataset.manageEditValue; if (field && Object.prototype.hasOwnProperty.call(current.season, field)) { current.season[field] = value; current.activeEditField = null; rerender(); CR.showToast?.({ message: `${value} selected` }); } return; }
      const importScheduleButton = event.target.closest('[data-manage-import-schedule]');
      if (importScheduleButton) { try { await importSchedule(importScheduleButton); } catch (error) { console.error('Schedule import failed', error); CR.showToast?.({ message: error?.message || 'Could not import schedule', tier: 'warning' }); } finally { CR.ui?.setActionBusy?.(importScheduleButton, false); } return; }
      const toggleButton = event.target.closest('[data-manage-toggle]');
      if (toggleButton) { const key = toggleButton.dataset.manageToggle; if (key === 'mock.playoffs') { setMockOptions({ enabled: true, playoffs: !CR.gameDayMockService?.isPlayoffs?.() }); CR.showToast?.({ message: 'Mock playoff setting updated' }); return; } if (key === 'mock.carryover') { setMockOptions({ enabled: true, carryover: !CR.gameDayMockService?.isCarryover?.() }); CR.showToast?.({ message: 'Mock carryover setting updated' }); return; } if (key === 'watchExperience.pushEnabled' || key === 'watchExperience.toastEnabled') { const currentValue = Boolean(getNestedValue(current, key)); setNestedValue(current, key, !currentValue); rerender(); persistWatchExperience(); return; } const currentValue = Boolean(getNestedValue(current, key)); setNestedValue(current, key, !currentValue); rerender(); CR.showToast?.({ message: `${toggleButton.querySelector('.manage-toggle-label')?.textContent || 'Setting'} ${!currentValue ? 'on' : 'off'}` }); return; }
      const delayOption = event.target.closest('[data-manage-delay-group][data-manage-delay-seconds]');
      if (delayOption) { const seconds = CR.userSettingsService?.normalizeDelay?.(delayOption.dataset.manageDelaySeconds, 90) ?? 90; const group = delayOption.dataset.manageDelayGroup; if (group === 'push') current.watchExperience.pushDelaySeconds = seconds; if (group === 'toast') current.watchExperience.toastDelaySeconds = seconds; rerender(); persistWatchExperience(); return; }
      const streamOption = event.target.closest('[data-manage-stream-option]');
      if (streamOption) { const nextValue = streamOption.dataset.manageStreamOption; current.streamMode.selected = nextValue; rerender(); CR.showToast?.({ message: `Stream Mode set to ${labelForStreamOption(nextValue)}` }); }
    });
  }

  CR.manageEvents = { bindManageEvents };
})();