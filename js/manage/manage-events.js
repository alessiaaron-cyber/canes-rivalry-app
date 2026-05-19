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

      const routed = [
        data.routed_count,
        data.routing_count,
        data.devices_routed,
        data.total_routed
      ].find((value) => value !== undefined && value !== null);

      const pushed = [
        data.push_sent,
        data.push_count,
        data.sent_count,
        data.pushes_sent
      ].find((value) => value !== undefined && value !== null);

      test.routingCounts = routed !== undefined ? String(routed) : '—';
      test.pushCounts = pushed !== undefined ? String(pushed) : '—';
      test.visibleAfter = data.visible_after || data.visibleAt || data.delayed_until || '—';

      rerender();
    } catch (error) {
      console.error('Temporary notification test failed', error);
      test.status = 'error';
      test.response = {
        error: error?.message || String(error || 'Unknown error')
      };
      test.routingCounts = '—';
      test.pushCounts = '—';
      test.visibleAfter = '—';
      rerender();
      CR.showToast?.({ message: error?.message || 'Notification test failed', tier: 'warning' });
    }
  }

  async function saveProfile(button) { const current = state(); const profile = CR.currentProfile || {}; const draft = current.profileDraft || currentProfileDraft(); const displayName = String(draft.displayName || '').trim(); const colorHex = String(draft.colorHex || '').trim().toLowerCase(); const colorOption = colorOptionFor(colorHex, current); if (!profile.id) throw new Error('No profile is loaded.'); if (!displayName) throw new Error('Display name is required.'); if (!colorOption) throw new Error('Choose an available profile color.'); if (!isColorAvailable(colorHex, current)) throw new Error('That color is already used or too similar to another player.'); CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' }); const db = await CR.getSupabase(); const result = await db.from('user_profiles').update({ display_name: displayName, color_hex: colorOption.hex, color_label: colorOption.label, updated_at: new Date().toISOString() }).eq('id', profile.id).select('*').single(); if (result.error) throw result.error; CR.currentProfile = result.data; try { CR.currentProfiles = await CR.auth?.loadActiveProfiles?.() || [result.data]; } catch (_) {} current.profileEditOpen = false; current.profileDraft = null; rerender(); CR.showToast?.({ message: 'Profile updated' }); CR.identity?.applyUserColorVariables?.(); CR.renderAccountIdentity?.(); await refreshManageAndGameDay(); }
  function resetRosterDraft() { const current = state(); current.rosterDraft = { name: '', position: 'F' }; current.editingRosterPlayerId = null; }
  function resetScheduleDraft() { const current = state(); const firstUser = (current.users || [])[0] || null; current.scheduleDraft = { date: '', opponent: '', type: 'Regular Season', firstPicker: firstUser ? userDisplayName(firstUser) : current.season.firstPicker, firstPickerUserId: firstUser?.id || '' }; current.editingScheduleGameId = null; }
  function resetNewSeasonDraft() { const current = state(); const firstUser = (current.users || [])[0] || null; current.newSeasonDraft = { ...(current.newSeasonDraft || {}), seasonLabel: '', firstPicker: firstUser ? userDisplayName(firstUser) : current.season?.firstPicker, firstPickerUserId: firstUser?.id || '' }; }
  function rerender(options = {}) { const current = state(); CR.manageState = current; CR.manageStore?.replaceState?.(current, { render: false }); CR.renderManage?.({ scrollTop: options.scrollTop }); }
  function scoringIsLocked(profile, current = state()) { if (profile === 'Regular') return current?.season?.regularScoringLocked === true; return current?.season?.playoffScoringLocked === true; }
  function setWatchSaveState(value) { const current = state(); if (!current?.watchExperience) return; current.watchExperience.saveState = value; rerender(); }
  function scheduleWatchSaveReset(sequence, delay = 1400) { window.clearTimeout(watchSaveTimer); watchSaveTimer = window.setTimeout(() => { if (sequence !== watchSaveSequence) return; const latest = state(); if (!latest?.watchExperience) return; latest.watchExperience.saveState = 'idle'; rerender(); }, delay); }
  async function persistWatchExperience() { const current = state(); const watch = current?.watchExperience; if (!watch || !CR.userSettingsService?.save) return; watchSaveSequence += 1; const sequence = watchSaveSequence; window.clearTimeout(watchSaveTimer); setWatchSaveState('saving'); try { const saved = await CR.userSettingsService.save({ stream_settings: { push_delay_seconds: watch.pushDelaySeconds, toast_delay_seconds: watch.toastDelaySeconds }, notification_settings: { push_enabled: watch.pushEnabled !== false, toast_enabled: watch.toastEnabled !== false } }); if (sequence !== watchSaveSequence) return; const latest = state(); if (latest?.watchExperience) { latest.watchExperience.pushDelaySeconds = Number(saved.stream_settings?.push_delay_seconds ?? latest.watchExperience.pushDelaySeconds); latest.watchExperience.toastDelaySeconds = Number(saved.stream_settings?.toast_delay_seconds ?? latest.watchExperience.toastDelaySeconds); latest.watchExperience.pushEnabled = saved.notification_settings?.push_enabled !== false; latest.watchExperience.toastEnabled = saved.notification_settings?.toast_enabled !== false; latest.watchExperience.saveState = 'saved'; } if (latest?.notifications) { latest.notifications.pushEnabled = saved.notification_settings?.push_enabled !== false; latest.notifications.toastsEnabled = saved.notification_settings?.toast_enabled !== false; } CR.userSettings = saved; rerender(); scheduleWatchSaveReset(sequence); } catch (error) { console.error('Watch Experience save failed', error); if (sequence !== watchSaveSequence) return; const latest = state(); if (latest?.watchExperience) latest.watchExperience.saveState = 'error'; rerender(); scheduleWatchSaveReset(sequence, 2600); CR.showToast?.({ message: error?.message || 'Could not save notification settings', tier: 'warning' }); } }
  function refreshGameDayAfterMockChange() { CR.refreshGameDayData?.({ flash: true }); CR.renderGameDayState?.(); }
  function setMockOptions(patch = {}) { const service = CR.gameDayMockService; if (!service) return; service.setMockOptions?.({ enabled: patch.enabled ?? service.isEnabled?.(), mode: patch.mode || service.currentMode?.() || 'pregame', playoffs: patch.playoffs ?? service.isPlayoffs?.(), carryover: patch.carryover ?? service.isCarryover?.() }); refreshGameDayAfterMockChange(); rerender(); }
  function schedulePayloadFromDraft(current) { const draft = current.scheduleDraft || {}; const opponent = String(draft.opponent || '').trim().toUpperCase(); const date = String(draft.date || '').trim(); if (!date || !opponent) throw new Error('Add a date and opponent first'); return { date, opponent, type: draft.type || 'Regular Season', firstPicker: pickerLabelFromDraft(draft, current), firstPickerUserId: draft.firstPickerUserId || null }; }
  async function saveGame(button) { const current = state(); const wasEditing = Boolean(current.editingScheduleGameId); const payload = schedulePayloadFromDraft(current); CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' }); if (wasEditing) await CR.manageDataService.updateGame(current.editingScheduleGameId, payload); else await CR.manageDataService.createGame(payload); resetScheduleDraft(); current.scheduleSheetOpen = false; rerender(); await refreshManageAndGameDay(); CR.showToast?.({ message: `${payload.opponent} game ${wasEditing ? 'updated' : 'added'}` }); }

  function bindManageEvents() {
    const root = document.querySelector('#manageContent');
    const editProfileButton = document.querySelector('#manageEditProfileButton');
    editProfileButton?.addEventListener('click', () => { const current = state(); closeAllSheets(); current.profileDraft = currentProfileDraft(); current.profileEditOpen = true; rerender(); });
    if (!root) return;

    root.addEventListener('click', async (event) => {
      const tempNotificationTest = event.target.closest('[data-manage-temp-notification-test]');
      if (tempNotificationTest) {
        await runTempNotificationTest(tempNotificationTest.dataset.manageTempNotificationTest || 'immediate');
        return;
      }
    });
  }

  CR.manageEvents = { bindManageEvents };
})();