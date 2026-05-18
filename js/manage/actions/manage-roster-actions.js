window.CR = window.CR || {};
window.CR.manageActions = window.CR.manageActions || {};

(() => {
  const CR = window.CR;

  function getState() {
    return CR.manageStore?.getState?.() || CR.manageState;
  }

  function setActionBusy(button, busy, options) {
    CR.ui?.setActionBusy?.(button, busy, options);
  }

  function closeRosterSheet(state) {
    state.rosterSheetOpen = false;
    state.editingRosterPlayerId = null;
    state.rosterDraft = { name: '', position: 'F' };
  }

  async function refreshManageAndGameDay() {
    if (typeof CR.hydrateManageData === 'function') {
      await CR.hydrateManageData();
    }

    try {
      if (typeof CR.refreshGameDayData === 'function') {
        await CR.refreshGameDayData({ skipIfEditing: true, flash: false });
      } else {
        CR.renderGameDayState?.();
      }
    } catch (error) {
      console.warn('Game Day refresh after roster change failed', error);
    }
  }

  function renderManage() {
    CR.renderManage?.();
  }

  async function savePlayer(button) {
    const state = getState();
    const draft = state.rosterDraft || {};
    const name = String(draft.name || '').trim();

    if (!name) {
      CR.showToast?.({ message: 'Add a player name first' });
      return;
    }

    const payload = {
      name,
      position: draft.position || 'F'
    };

    try {
      setActionBusy(button, true, { label: 'Saving…' });

      if (state.editingRosterPlayerId) {
        await CR.manageDataService.updatePlayer(state.editingRosterPlayerId, payload);
        closeRosterSheet(state);
        renderManage();
        await refreshManageAndGameDay();
        const latest = getState();
        if (latest) closeRosterSheet(latest);
        renderManage();
        CR.showToast?.({ message: `${name} updated` });
        return;
      }

      await CR.manageDataService.createPlayer(payload);
      closeRosterSheet(state);
      renderManage();
      await refreshManageAndGameDay();
      const latest = getState();
      if (latest) closeRosterSheet(latest);
      renderManage();
      CR.showToast?.({ message: `${name} added` });
    } catch (error) {
      console.error('Player save failed', error);
      CR.showToast?.({ message: error?.message || 'Could not save player', tier: 'warning' });
    } finally {
      setActionBusy(button, false);
    }
  }

  async function restorePlayer(playerId, button) {
    const state = getState();
    const player = (state.roster || []).find((item) => String(item.id) === String(playerId));
    const name = player?.name || 'Player';

    try {
      setActionBusy(button, true, { label: 'Restoring…' });
      await CR.manageDataService.activatePlayer(playerId);
      await refreshManageAndGameDay();
      CR.showToast?.({ message: `${name} restored` });
    } catch (error) {
      console.error('Player restore failed', error);
      CR.showToast?.({ message: error?.message || 'Could not restore player', tier: 'warning' });
    } finally {
      setActionBusy(button, false);
    }
  }

  async function removePlayer(playerId, button) {
    try {
      setActionBusy(button, true, { label: 'Removing…' });
      await CR.manageDataService.deactivatePlayer(playerId);
      const state = getState();
      if (state) state.confirmRemove = null;
      renderManage();
      await refreshManageAndGameDay();
      CR.showToast?.({ message: 'Player removed from active roster' });
    } catch (error) {
      console.error('Player remove failed', error);
      CR.showToast?.({ message: error?.message || 'Could not remove player', tier: 'warning' });
    } finally {
      setActionBusy(button, false);
    }
  }

  CR.manageActions.roster = {
    savePlayer,
    restorePlayer,
    removePlayer,
    refreshManageAndGameDay
  };
})();
