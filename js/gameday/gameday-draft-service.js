window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function pickLabel(value) {
    const helper = CR.gameDayStateUtils?.pickLabel;
    if (typeof helper === 'function') return helper(value);
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    return value.player || value.name || value.playerName || value.player_name || '';
  }

  function sideKeys(users = []) {
    const helper = CR.gameDayStateUtils?.sideKeys;
    if (typeof helper === 'function') return helper({ users });
    return users.slice(0, 2).map((user, index) => user.profileKey || user.profile_key || user.id || `player-${index + 1}`);
  }

  function draftSlots(users = []) {
    const keys = sideKeys(users);
    return [
      { pickNumber: 1, sideIndex: 0, sideKey: keys[0], pickIndex: 0, pickSlot: 1 },
      { pickNumber: 2, sideIndex: 1, sideKey: keys[1], pickIndex: 0, pickSlot: 1 },
      { pickNumber: 3, sideIndex: 0, sideKey: keys[0], pickIndex: 1, pickSlot: 2 },
      { pickNumber: 4, sideIndex: 1, sideKey: keys[1], pickIndex: 1, pickSlot: 2 }
    ].filter((slot) => slot.sideKey);
  }

  function slotValue(pregame = {}, slot) {
    return pickLabel(pregame?.[slot.sideKey]?.[slot.pickIndex] || '');
  }

  function firstUnfilledSlot(pregame = {}, users = []) {
    return draftSlots(users).find((slot) => !slotValue(pregame, slot)) || null;
  }

  function computeDraftState(pregame = {}, users = [], previousDraft = {}) {
    const nextSlot = firstUnfilledSlot(pregame, users);
    const nextProfile = nextSlot ? users[nextSlot.sideIndex] : null;
    return {
      ...(previousDraft || {}),
      status: nextSlot ? 'open' : 'complete',
      currentPickNumber: nextSlot?.pickNumber || 5,
      currentPicker: nextProfile || { id: '', displayName: '', profileKey: '' }
    };
  }

  function toGamePatch(draft = {}) {
    const status = draft.status || draft.draft_status || 'open';
    const currentPickerId = draft.currentPicker?.id || draft.current_pick_user_id || null;
    return {
      draft_status: status,
      current_pick_number: Number(draft.currentPickNumber || draft.current_pick_number || 1),
      current_pick_user_id: status === 'complete' ? null : currentPickerId
    };
  }

  CR.gameDayDraftService = { pickLabel, sideKeys, draftSlots, firstUnfilledSlot, computeDraftState, toGamePatch };
})();