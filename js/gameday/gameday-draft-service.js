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

  function userId(user = {}) {
    return String(user.id || user.user_id || '').trim();
  }

  function draftPickerId(gameOrDraft = {}) {
    return String(
      gameOrDraft.first_picker_user_id ||
      gameOrDraft.firstPickerUserId ||
      gameOrDraft.firstPicker?.id ||
      gameOrDraft.firstPicker ||
      ''
    ).trim();
  }

  function orderedUsers(users = [], gameOrDraft = {}) {
    const pair = users.slice(0, 2);
    const firstId = draftPickerId(gameOrDraft);
    const first = firstId ? pair.find((user) => userId(user) === firstId) : null;
    if (!first) return pair;
    const second = pair.find((user) => userId(user) !== firstId) || null;
    return [first, second].filter(Boolean);
  }

  function keyForUser(user, allUsers = []) {
    const keys = sideKeys(allUsers);
    const index = allUsers.findIndex((candidate) => userId(candidate) === userId(user));
    return keys[index] || user?.profileKey || user?.profile_key || user?.id || '';
  }

  function draftSlots(users = [], gameOrDraft = {}) {
    const ordered = orderedUsers(users, gameOrDraft);
    const first = ordered[0];
    const second = ordered[1];
    const firstKey = first ? keyForUser(first, users) : '';
    const secondKey = second ? keyForUser(second, users) : '';
    return [
      { pickNumber: 1, sideIndex: users.findIndex((user) => userId(user) === userId(first)), sideKey: firstKey, pickIndex: 0, pickSlot: 1, user: first },
      { pickNumber: 2, sideIndex: users.findIndex((user) => userId(user) === userId(second)), sideKey: secondKey, pickIndex: 0, pickSlot: 1, user: second },
      { pickNumber: 3, sideIndex: users.findIndex((user) => userId(user) === userId(first)), sideKey: firstKey, pickIndex: 1, pickSlot: 2, user: first },
      { pickNumber: 4, sideIndex: users.findIndex((user) => userId(user) === userId(second)), sideKey: secondKey, pickIndex: 1, pickSlot: 2, user: second }
    ].filter((slot) => slot.sideKey && slot.sideIndex >= 0);
  }

  function slotValue(pregame = {}, slot) {
    return pickLabel(pregame?.[slot.sideKey]?.[slot.pickIndex] || '');
  }

  function firstUnfilledSlot(pregame = {}, users = [], gameOrDraft = {}) {
    return draftSlots(users, gameOrDraft).find((slot) => !slotValue(pregame, slot)) || null;
  }

  function computeDraftState(pregame = {}, users = [], previousDraft = {}) {
    const nextSlot = firstUnfilledSlot(pregame, users, previousDraft);
    const nextProfile = nextSlot ? nextSlot.user || users[nextSlot.sideIndex] : null;
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

  CR.gameDayDraftService = { pickLabel, sideKeys, orderedUsers, draftSlots, firstUnfilledSlot, computeDraftState, toGamePatch };
})();