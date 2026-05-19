window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function hasScheduledGame() {
    const game = CR.gameDay?.game || {};
    return Boolean(game.hasGame && game.scheduleText && game.scheduleText !== 'Schedule pending');
  }

  function currentUserId() {
    return String(CR.currentUser?.id || CR.currentProfile?.id || '').trim();
  }

  function stateUtils() {
    return CR.gameDayStateUtils || {};
  }

  function users() {
    const source = { users: CR.gameDay?.users };
    const resolved = stateUtils().users?.(source) || CR.identity?.getUsers?.(source) || [];
    return resolved.slice(0, 2);
  }

  function profileKey(profile = {}, index = 0) {
    return String(profile.profileKey || profile.profile_key || profile.id || `player-${index + 1}`).trim();
  }

  function profileDisplayName(profile = {}, index = 0) {
    return profile.displayName || profile.display_name || profile.username || `Player ${index + 1}`;
  }

  function ownerValue(profile = {}, index = 0) {
    return profileDisplayName(profile, index) || profile.username || profileKey(profile, index);
  }

  function profileById(id) {
    const lookup = String(id || '').trim();
    if (!lookup) return null;
    return users().find((user) => String(user.id || '').trim() === lookup) || null;
  }

  function profileByKey(key) {
    const lookup = String(key || '').trim();
    if (!lookup) return null;
    return users().find((user, index) => profileKey(user, index) === lookup) || null;
  }

  function firstPickerProfile() {
    const draft = CR.gameDay?.draft || {};
    const firstPicker = draft.firstPicker || draft.currentPicker?.profileKey || draft.currentPicker?.id || '';
    return profileById(firstPicker) || profileByKey(firstPicker) || users()[0] || null;
  }

  function otherProfile(firstProfile) {
    const firstId = String(firstProfile?.id || '').trim();
    const firstKey = profileKey(firstProfile);
    return users().find((user, index) => {
      const userId = String(user.id || '').trim();
      const userKey = profileKey(user, index);
      if (firstId && userId) return userId !== firstId;
      return userKey !== firstKey;
    }) || users()[1] || null;
  }

  function draftTurnProfile(pickNumber = 1) {
    const first = firstPickerProfile();
    const second = otherProfile(first);
    return Number(pickNumber || 1) % 2 === 1 ? first : second;
  }

  function draftPickSlot(pickNumber = 1) {
    return Number(pickNumber || 1) <= 2 ? 1 : 2;
  }

  function nextDraftStateAfterPick(pickNumber = 1) {
    const nextPickNumber = Number(pickNumber || 1) + 1;
    if (nextPickNumber > 4) {
      return { draft_status: 'complete', current_pick_number: 5, current_pick_user_id: null };
    }
    const nextProfile = draftTurnProfile(nextPickNumber);
    return { draft_status: 'open', current_pick_number: nextPickNumber, current_pick_user_id: nextProfile?.id || null };
  }

  function rollbackDraftStateToPick(pickNumber = 1) {
    const rollbackPickNumber = Math.max(1, Math.min(Number(pickNumber || 1), 4));
    const picker = draftTurnProfile(rollbackPickNumber);
    return { draft_status: 'open', current_pick_number: rollbackPickNumber, current_pick_user_id: picker?.id || null };
  }

  function rowForSlot(gameId, ownerProfile, pickSlot, playerName = '', index = 0) {
    return {
      game_id: gameId,
      owner: ownerValue(ownerProfile, index),
      owner_user_id: ownerProfile?.id || null,
      pick_slot: pickSlot,
      player_name: playerName || '',
      original_pick_text: playerName || null,
      goals: 0,
      assists: 0,
      points: 0,
      picked_by_user_id: playerName ? (currentUserId() || null) : null,
      updated_by_user_id: currentUserId() || null,
      updated_at: new Date().toISOString()
    };
  }

  function rowsFromPregameState(gameId, pregame = {}) {
    return users().flatMap((profile, profileIndex) => {
      const key = profileKey(profile, profileIndex);
      return [0, 1].map((pickIndex) => rowForSlot(gameId, profile, pickIndex + 1, pregame[key]?.[pickIndex] || '', profileIndex));
    });
  }

  async function savePregamePicks(gameId, pregame) {
    if (!hasScheduledGame()) throw new Error('Picks cannot be saved until a game is scheduled.');
    if (!gameId) throw new Error('No active game is available for saving picks.');
    const db = await CR.getSupabase();
    const nextRows = rowsFromPregameState(gameId, pregame);
    const upsertRes = await db.from('picks').upsert(nextRows, { onConflict: 'game_id,owner_user_id,pick_slot' }).select('*');
    if (upsertRes.error) throw upsertRes.error;
    const savedRows = upsertRes.data || nextRows;
    savedRows.forEach((row) => CR.realtime?.markLocalWrite?.('picks', row, 3000));
    return { savedRows };
  }

  async function saveDraftPick(gameId, playerName) {
    if (!hasScheduledGame()) throw new Error('Picks cannot be made until a game is scheduled.');
    if (!gameId) throw new Error('No active game is available for saving picks.');
    if (!playerName) throw new Error('Choose a player first.');
    const draft = CR.gameDay?.draft || {};
    const pickNumber = Number(draft.currentPickNumber || 1);
    const ownerProfile = draftTurnProfile(pickNumber);
    const userId = currentUserId();
    if (!profileDisplayName(ownerProfile)) throw new Error('Could not determine current picker.');
    if (!userId || ownerProfile.id !== userId) throw new Error(`It is ${profileDisplayName(ownerProfile)}'s turn to pick.`);
    const db = await CR.getSupabase();
    const existingRes = await db.from('picks').select('id').eq('game_id', gameId).neq('player_name', '').ilike('player_name', playerName).limit(1);
    if (existingRes.error) throw existingRes.error;
    if ((existingRes.data || []).length) throw new Error('That player has already been picked.');
    const slot = draftPickSlot(pickNumber);
    const ownerIndex = users().findIndex((profile) => String(profile.id || '') === String(ownerProfile?.id || ''));
    const row = rowForSlot(gameId, ownerProfile, slot, playerName, Math.max(0, ownerIndex));
    row.picked_by_user_id = userId;
    const upsertRes = await db.from('picks').upsert(row, { onConflict: 'game_id,owner_user_id,pick_slot' }).select('*').single();
    if (upsertRes.error) throw upsertRes.error;
    const gamePatch = nextDraftStateAfterPick(pickNumber);
    const gameUpdateRes = await db.from('games').update(gamePatch).eq('id', gameId).select('*').single();
    if (gameUpdateRes.error) throw gameUpdateRes.error;
    CR.realtime?.markLocalWrite?.('picks', upsertRes.data || row, 3000);
    CR.realtime?.markLocalWrite?.('games', gameUpdateRes.data || { id: gameId, ...gamePatch }, 3000);
    return { savedRow: upsertRes.data || row, game: gameUpdateRes.data || gamePatch };
  }

  async function undoLastDraftPick(gameId) {
    if (!hasScheduledGame()) throw new Error('Picks cannot be changed until a game is scheduled.');
    if (!gameId) throw new Error('No active game is available for undo.');
    const draft = CR.gameDay?.draft || {};
    const currentPickNumber = Number(draft.currentPickNumber || 1);
    const undoPickNumber = currentPickNumber > 4 ? 4 : currentPickNumber - 1;
    if (undoPickNumber < 1) throw new Error('There are no draft picks to undo.');
    const ownerProfile = draftTurnProfile(undoPickNumber);
    const slot = draftPickSlot(undoPickNumber);
    const ownerIndex = users().findIndex((profile) => String(profile.id || '') === String(ownerProfile?.id || ''));
    const ownerUserId = ownerProfile?.id || null;
    if (!profileDisplayName(ownerProfile)) throw new Error('Could not determine pick to undo.');
    const db = await CR.getSupabase();
    const existingRes = await db.from('picks').select('*').eq('game_id', gameId).eq('owner_user_id', ownerUserId).eq('pick_slot', slot).maybeSingle();
    if (existingRes.error) throw existingRes.error;
    if (!existingRes.data || !String(existingRes.data.player_name || '').trim()) throw new Error('There is no drafted player in the last pick slot.');
    const clearPatch = rowForSlot(gameId, ownerProfile, slot, '', Math.max(0, ownerIndex));
    const pickUpdateRes = await db.from('picks').update(clearPatch).eq('id', existingRes.data.id).select('*').single();
    if (pickUpdateRes.error) throw pickUpdateRes.error;
    const gamePatch = rollbackDraftStateToPick(undoPickNumber);
    const gameUpdateRes = await db.from('games').update(gamePatch).eq('id', gameId).select('*').single();
    if (gameUpdateRes.error) throw gameUpdateRes.error;
    CR.realtime?.markLocalWrite?.('picks', pickUpdateRes.data || { id: existingRes.data.id, ...clearPatch }, 3000);
    CR.realtime?.markLocalWrite?.('games', gameUpdateRes.data || { id: gameId, ...gamePatch }, 3000);
    return { clearedRow: pickUpdateRes.data, game: gameUpdateRes.data, undonePickNumber: undoPickNumber };
  }

  CR.gameDaySaveService = { savePregamePicks, saveDraftPick, undoLastDraftPick, rowsFromPregameState, hasScheduledGame, draftTurnProfile, draftPickSlot, nextDraftStateAfterPick, rollbackDraftStateToPick };
})();