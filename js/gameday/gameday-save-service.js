window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function hasScheduledGame() {
    const game = CR.gameDay?.game || {};
    return Boolean(game.hasGame && game.scheduleText && game.scheduleText !== 'Schedule pending');
  }

  function currentUserId() { return String(CR.currentUser?.id || CR.currentProfile?.id || '').trim(); }
  function stateUtils() { return CR.gameDayStateUtils || {}; }
  function pickLabel(value) { const helper = stateUtils().pickLabel; if (typeof helper === 'function') return helper(value); if (typeof value === 'string') { const trimmed = value.trim(); if (trimmed.startsWith('{') && trimmed.endsWith('}')) { try { return pickLabel(JSON.parse(trimmed)); } catch (error) { return trimmed; } } return trimmed; } if (!value || typeof value !== 'object') return ''; return value.player || value.name || value.playerName || value.player_name || ''; }
  function users() { const source = { users: CR.gameDay?.users }; const resolved = stateUtils().users?.(source) || CR.identity?.getUsers?.(source) || []; return resolved.slice(0, 2); }
  function profileKey(profile = {}, index = 0) { return String(profile.profileKey || profile.profile_key || profile.id || `player-${index + 1}`).trim(); }
  function profileDisplayName(profile = {}, index = 0) { return profile.displayName || profile.display_name || profile.username || `Player ${index + 1}`; }
  function ownerValue(profile = {}, index = 0) { return profileDisplayName(profile, index) || profile.username || profileKey(profile, index); }
  function profileById(id) { const lookup = String(id || '').trim(); if (!lookup) return null; return users().find((user) => String(user.id || '').trim() === lookup) || null; }
  function profileByKey(key) { const lookup = String(key || '').trim(); if (!lookup) return null; return users().find((user, index) => profileKey(user, index) === lookup) || null; }
  function firstPickerProfile() { const draft = CR.gameDay?.draft || {}; const firstPicker = draft.first_picker_user_id || draft.firstPickerUserId || draft.firstPicker || draft.currentPicker?.profileKey || draft.currentPicker?.id || ''; return profileById(firstPicker) || profileByKey(firstPicker) || users()[0] || null; }
  function otherProfile(firstProfile) { const firstId = String(firstProfile?.id || '').trim(); const firstKey = profileKey(firstProfile); return users().find((user, index) => { const userId = String(user.id || '').trim(); const userKey = profileKey(user, index); if (firstId && userId) return userId !== firstId; return userKey !== firstKey; }) || users()[1] || null; }
  function draftTurnProfile(pickNumber = 1) { const first = firstPickerProfile(); const second = otherProfile(first); return Number(pickNumber || 1) % 2 === 1 ? first : second; }
  function draftPickSlot(pickNumber = 1) { return Number(pickNumber || 1) <= 2 ? 1 : 2; }
  function nextDraftStateAfterPick(pickNumber = 1) { const nextPickNumber = Number(pickNumber || 1) + 1; if (nextPickNumber > 4) return { draft_status: 'complete', current_pick_number: 5, current_pick_user_id: null }; const nextProfile = draftTurnProfile(nextPickNumber); return { draft_status: 'open', current_pick_number: nextPickNumber, current_pick_user_id: nextProfile?.id || null }; }
  function rollbackDraftStateToPick(pickNumber = 1) { const rollbackPickNumber = Math.max(1, Math.min(Number(pickNumber || 1), 4)); const picker = draftTurnProfile(rollbackPickNumber); return { draft_status: 'open', current_pick_number: rollbackPickNumber, current_pick_user_id: picker?.id || null }; }
  function gamePatchFromDraft(draft = {}) { const currentPickerId = draft.currentPicker?.id || draft.current_pick_user_id || null; const currentPickNumber = Number(draft.currentPickNumber || draft.current_pick_number || 1); const status = draft.status || draft.draft_status || (currentPickNumber > 4 ? 'complete' : 'open'); return { draft_status: status, current_pick_number: currentPickNumber, current_pick_user_id: status === 'complete' ? null : currentPickerId }; }
  function draftContext() { return { ...(CR.gameDay?.game || {}), ...(CR.gameDay?.draft || {}) }; }
  function shortPlayerName(name) { const parts = String(name || '').trim().split(/\s+/).filter(Boolean); return parts.length >= 2 ? parts[parts.length - 1] : String(name || '').trim(); }

  async function sendPickNotification(gameId, ownerProfile, pickSlot, playerName, savedRow = {}) {
    const cleanPlayerName = pickLabel(playerName);
    if (!gameId || !cleanPlayerName) return;

    try {
      const db = await CR.getSupabase();
      const ownerName = profileDisplayName(ownerProfile) || savedRow.owner || 'Someone';
      const rowId = savedRow.id ? `row-${savedRow.id}` : `${ownerName}-${pickSlot}-${cleanPlayerName}`;

      await db.functions.invoke('notify-rivalry-event', {
        body: {
          game_id: gameId,
          title: 'Canes Rivalry Pick',
          message: `${ownerName} picked ${shortPlayerName(cleanPlayerName)}.`,
          event_key: `ui-pick-${gameId}-${rowId}`,
          suppress_self: true,
          delay_visible: false,
          bypass_delay: true
        }
      });
    } catch (error) {
      console.warn('Pick notification failed', error);
    }
  }

  function rowForSlot(gameId, ownerProfile, pickSlot, playerName = '', index = 0) { const cleanPlayerName = pickLabel(playerName); return { game_id: gameId, owner_user_id: ownerProfile?.id || null, pick_slot: pickSlot, player_name: cleanPlayerName, original_pick_text: cleanPlayerName || null, goals: 0, assists: 0, points: 0, is_carry_forward: false, picked_by_user_id: cleanPlayerName ? (currentUserId() || null) : null, updated_by_user_id: currentUserId() || null, updated_at: new Date().toISOString() }; }
  function rowsFromPregameState(gameId, pregame = {}) { return users().flatMap((profile, profileIndex) => { const key = profileKey(profile, profileIndex); return [0, 1].map((pickIndex) => rowForSlot(gameId, profile, pickIndex + 1, pregame[key]?.[pickIndex] || '', profileIndex)); }); }
  function pregameFromRows(rows = []) { const buckets = {}; users().forEach((profile, index) => { buckets[profileKey(profile, index)] = []; }); rows.forEach((row) => { const profileIndex = users().findIndex((profile) => String(profile.id || '') === String(row.owner_user_id || '')); if (profileIndex < 0) return; const key = profileKey(users()[profileIndex], profileIndex); const slotIndex = Math.max(0, Number(row.pick_slot || 1) - 1); const label = pickLabel(row.player_name || row.original_pick_text || ''); if (label) buckets[key][slotIndex] = label; }); Object.keys(buckets).forEach((key) => { buckets[key] = buckets[key].filter(Boolean); }); return buckets; }
  function lastFilledDraftRow(rows = []) { const service = CR.gameDayDraftService; const slots = service?.draftSlots?.(users(), draftContext()) || []; for (let index = slots.length - 1; index >= 0; index -= 1) { const slot = slots[index]; const profile = users()[slot.sideIndex]; const row = rows.find((candidate) => String(candidate.owner_user_id || '') === String(profile?.id || '') && Number(candidate.pick_slot || 0) === Number(slot.pickSlot || slot.pickIndex + 1)); if (row && pickLabel(row.player_name || row.original_pick_text || '')) return row; } return null; }

  async function savePregamePicks(gameId, pregame, draft = null) { if (!hasScheduledGame()) throw new Error('Picks cannot be saved until a game is scheduled.'); if (!gameId) throw new Error('No active game is available for saving picks.'); const db = await CR.getSupabase(); const nextRows = rowsFromPregameState(gameId, pregame); const upsertRes = await db.from('picks').upsert(nextRows, { onConflict: 'game_id,owner_user_id,pick_slot' }).select('*'); if (upsertRes.error) throw upsertRes.error; const savedRows = upsertRes.data || nextRows; savedRows.forEach((row) => CR.realtime?.markLocalWrite?.('picks', row, 3000)); let game = null; if (draft) { const gamePatch = gamePatchFromDraft(draft); const gameUpdateRes = await db.from('games').update(gamePatch).eq('id', gameId).select('*').single(); if (gameUpdateRes.error) throw gameUpdateRes.error; game = gameUpdateRes.data || { id: gameId, ...gamePatch }; CR.realtime?.markLocalWrite?.('games', game, 3000); } return { savedRows, game }; }

  async function saveDraftPick(gameId, playerName) {
    const cleanPlayerName = pickLabel(playerName);
    if (!hasScheduledGame()) throw new Error('Picks cannot be made until a game is scheduled.');
    if (!gameId) throw new Error('No active game is available for saving picks.');
    if (!cleanPlayerName) throw new Error('Choose a player first.');
    const userId = currentUserId();
    const currentUsers = users();
    const currentPregame = CR.gameDay?.pregame || {};
    const nextSlot = CR.gameDayDraftService?.firstUnfilledSlot?.(currentPregame, currentUsers, draftContext());
    if (!nextSlot) throw new Error('The draft is already complete.');
    const ownerProfile = nextSlot.user || currentUsers[nextSlot.sideIndex];
    if (!profileDisplayName(ownerProfile)) throw new Error('Could not determine current picker.');
    if (!userId || String(ownerProfile.id || '') !== userId) throw new Error(`It is ${profileDisplayName(ownerProfile)}'s turn to pick.`);
    const db = await CR.getSupabase();
    const existingRes = await db.from('picks').select('id').eq('game_id', gameId).neq('player_name', '').ilike('player_name', cleanPlayerName).limit(1);
    if (existingRes.error) throw existingRes.error;
    if ((existingRes.data || []).length) throw new Error('That player has already been picked.');
    const ownerIndex = currentUsers.findIndex((profile) => String(profile.id || '') === String(ownerProfile?.id || ''));
    const row = rowForSlot(gameId, ownerProfile, nextSlot.pickSlot, cleanPlayerName, Math.max(0, ownerIndex));
    row.picked_by_user_id = userId;
    const upsertRes = await db.from('picks').upsert(row, { onConflict: 'game_id,owner_user_id,pick_slot' }).select('*').single();
    if (upsertRes.error) throw upsertRes.error;
    const nextPregame = clonePregameWithPick(currentPregame, ownerProfile, Math.max(0, ownerIndex), nextSlot.pickIndex, cleanPlayerName);
    const nextDraft = CR.gameDayDraftService?.computeDraftState?.(nextPregame, currentUsers, draftContext()) || {};
    const gamePatch = gamePatchFromDraft(nextDraft);
    const gameUpdateRes = await db.from('games').update(gamePatch).eq('id', gameId).select('*').single();
    if (gameUpdateRes.error) throw gameUpdateRes.error;
    CR.realtime?.markLocalWrite?.('picks', upsertRes.data || row, 3000);
    CR.realtime?.markLocalWrite?.('games', gameUpdateRes.data || { id: gameId, ...gamePatch }, 3000);
    await sendPickNotification(gameId, ownerProfile, nextSlot.pickSlot, cleanPlayerName, upsertRes.data || row);
    return { savedRow: upsertRes.data || row, game: gameUpdateRes.data || gamePatch };
  }

  function clonePregameWithPick(pregame = {}, ownerProfile, ownerIndex, pickIndex, playerName) { const next = JSON.parse(JSON.stringify(pregame || {})); const key = profileKey(ownerProfile, ownerIndex); const picks = Array.isArray(next[key]) ? [...next[key]] : []; picks[pickIndex] = playerName; next[key] = picks.filter(Boolean); return next; }

  async function undoLastDraftPick(gameId) { if (!hasScheduledGame()) throw new Error('Picks cannot be changed until a game is scheduled.'); if (!gameId) throw new Error('No active game is available for undo.'); const db = await CR.getSupabase(); const rowsRes = await db.from('picks').select('*').eq('game_id', gameId).order('pick_slot'); if (rowsRes.error) throw rowsRes.error; const rows = rowsRes.data || []; const rowToClear = lastFilledDraftRow(rows); if (!rowToClear) throw new Error('There are no draft picks to undo.'); const profileIndex = users().findIndex((profile) => String(profile.id || '') === String(rowToClear.owner_user_id || '')); const ownerProfile = users()[profileIndex]; const clearPatch = rowForSlot(gameId, ownerProfile, Number(rowToClear.pick_slot || 1), '', Math.max(0, profileIndex)); const pickUpdateRes = await db.from('picks').update(clearPatch).eq('id', rowToClear.id).select('*').single(); if (pickUpdateRes.error) throw pickUpdateRes.error; const remainingRows = rows.map((row) => row.id === rowToClear.id ? { ...row, ...clearPatch } : row); const nextPregame = pregameFromRows(remainingRows); const nextDraft = CR.gameDayDraftService?.computeDraftState?.(nextPregame, users(), draftContext()) || CR.gameDay?.draft || {}; const gamePatch = gamePatchFromDraft(nextDraft); const gameUpdateRes = await db.from('games').update(gamePatch).eq('id', gameId).select('*').single(); if (gameUpdateRes.error) throw gameUpdateRes.error; CR.realtime?.markLocalWrite?.('picks', pickUpdateRes.data || { id: rowToClear.id, ...clearPatch }, 3000); CR.realtime?.markLocalWrite?.('games', gameUpdateRes.data || { id: gameId, ...gamePatch }, 3000); return { clearedRow: pickUpdateRes.data, game: gameUpdateRes.data || gamePatch }; }

  CR.gameDaySaveService = { savePregamePicks, saveDraftPick, undoLastDraftPick, rowsFromPregameState, hasScheduledGame, draftTurnProfile, draftPickSlot, nextDraftStateAfterPick, rollbackDraftStateToPick, gamePatchFromDraft };
})();