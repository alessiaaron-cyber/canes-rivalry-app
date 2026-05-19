window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  let watchSaveTimer = null;
  let watchSaveSequence = 0;

  function state() { return CR.manageStore?.getState?.() || CR.manageState; }
  function getNestedValue(target, path) { return String(path || '').split('.').reduce((acc, key) => (acc ? acc[key] : undefined), target); }
  function setNestedValue(target, path, value) { const keys = String(path || '').split('.').filter(Boolean); if (!keys.length) return; let cursor = target; for (let i = 0; i < keys.length - 1; i += 1) { cursor = cursor[keys[i]]; if (!cursor) return; } cursor[keys[keys.length - 1]] = value; }
  function closeAllSheets() { const current = state(); if (!current) return; current.activeEditField = null; current.profileEditOpen = false; current.startSeasonOpen = false; current.scoringEditOpen = false; current.rosterSheetOpen = false; current.scheduleSheetOpen = false; current.confirmRemove = null; }
  function currentProfileDraft() { const profile = CR.currentProfile || {}; return { displayName: profile.display_name || profile.username || '', colorHex: profile.color_hex || '#111827' }; }
  function colorOptionFor(hex, current = state()) { const normalized = String(hex || '').trim().toLowerCase(); return current?.profileColorOptions?.find((option) => String(option.hex || '').toLowerCase() === normalized) || null; }
  function isColorAvailable(hex, current = state()) { const option = colorOptionFor(hex, current); if (!option) return false; const profile = CR.currentProfile || {}; const currentId = String(profile.id || ''); const normalized = String(hex || '').trim().toLowerCase(); return !(current.users || []).some((user) => { if (String(user.id || '') === currentId) return false; const userHex = String(user.colorHex || user.color_hex || '').trim().toLowerCase(); const userOption = colorOptionFor(userHex, current); return userHex === normalized || (userOption?.family && userOption.family === option.family); }); }
  function rerender(options = {}) { const current = state(); CR.manageState = current; CR.manageStore?.replaceState?.(current, { render: false }); CR.renderManage?.({ scrollTop: options.scrollTop }); }

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

  async function handleManageSignOut() {
    try { await CR.auth?.signOut?.(); } catch (error) { console.error('Manage sign out failed', error); }
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
      const activeGame = games.find((game) => ['live', 'in progress'].includes(String(game.status || '').toLowerCase()));
      const fallbackGame = games[0] || null;
      const gameId = Number(activeGame?.dbId || activeGame?.id || fallbackGame?.dbId || fallbackGame?.id || 0);
      const body = mode === 'delayed'
        ? { game_id: gameId, title: 'Canes Rivalry Spoiler Test', message: 'Delayed notify-rivalry-event test.', event_key: `v2-test-delayed-${Date.now()}`, suppress_self: false, delay_visible: true }
        : { game_id: gameId, title: 'Canes Rivalry Test', message: 'Immediate notify-rivalry-event test.', event_key: `v2-test-immediate-${Date.now()}`, suppress_self: false, delay_visible: false, bypass_delay: true, bypass_active_device_check: true };

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

    root.addEventListener('input', (event) => {
      const profileInput = event.target.closest('[data-manage-profile-input]');
      if (profileInput) {
        const current = state();
        current.profileDraft = current.profileDraft || currentProfileDraft();
        setNestedValue(current.profileDraft, profileInput.dataset.manageProfileInput, profileInput.value);
        return;
      }
    });

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

      if (event.target.closest('[data-manage-close-profile]')) {
        const current = state();
        current.profileEditOpen = false;
        current.profileDraft = null;
        rerender();
        return;
      }

      const colorButton = event.target.closest('[data-manage-profile-color]');
      if (colorButton) {
        const current = state();
        current.profileDraft = current.profileDraft || currentProfileDraft();
        current.profileDraft.colorHex = colorButton.dataset.manageProfileColor;
        rerender();
        return;
      }

      const saveProfileButton = event.target.closest('[data-manage-save-profile]');
      if (saveProfileButton) {
        try { await saveProfile(saveProfileButton); }
        catch (error) { console.error('Profile save failed', error); CR.showToast?.({ message: error?.message || 'Could not save profile', tier: 'warning' }); }
        finally { CR.ui?.setActionBusy?.(saveProfileButton, false); }
        return;
      }

      const signOutButton = event.target.closest('[data-manage-sign-out]');
      if (signOutButton) { await handleManageSignOut(); return; }

      const tempNotificationTest = event.target.closest('[data-manage-temp-notification-test]');
      if (tempNotificationTest) { await runTempNotificationTest(tempNotificationTest.dataset.manageTempNotificationTest || 'immediate'); }
    });
  }

  CR.manageEvents = { bindManageEvents };
})();