window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function rosterDisplayName(player) { return player?.player_name || player?.name || 'Player'; }
  function lastNameFirstName(name) { const value = String(name || '').trim(); if (!value || !value.includes(' ')) return value || 'Player'; const parts = value.split(/\s+/).filter(Boolean); const first = parts.shift(); const last = parts.join(' '); return last && first ? `${last}, ${first}` : value; }
  function slotOf(value, fallback = 0) { const n = Number(value); return n === 1 || n === 2 ? n : fallback; }
  function compact(value) { return String(value || '').trim(); }
  function normalizeLookup(value) { return compact(value).toLowerCase(); }

  function mapRoster(players = []) {
    return players.map((player) => { const fullName = rosterDisplayName(player); const displayName = lastNameFirstName(fullName); return { id: String(player.id), name: fullName, displayName, sortName: displayName.toLowerCase(), position: player.position || 'F', detail: player.position || 'F', active: player.is_active !== false }; }).sort((a, b) => a.sortName.localeCompare(b.sortName));
  }

  function mapProfiles(profiles = []) {
    return profiles.map((profile, index) => { const rivalrySlot = slotOf(profile.rivalry_slot, index + 1); return { id: String(profile.id), username: profile.username || '', displayName: profile.display_name || profile.username || `Player ${rivalrySlot}`, display_name: profile.display_name || profile.username || `Player ${rivalrySlot}`, role: profile.role || 'player', email: profile.email || '', colorHex: profile.color_hex || '', color_hex: profile.color_hex || '', colorLabel: profile.color_label || '', color_label: profile.color_label || '', rivalrySlot, rivalry_slot: rivalrySlot, profileKey: String(profile.id), profile_key: String(profile.id) }; }).sort((a, b) => a.rivalrySlot - b.rivalrySlot);
  }

  function emptyBuckets(users = [], factory = () => null) { return users.reduce((acc, user) => { acc[user.profileKey] = factory(user); return acc; }, {}); }
  function startOfLocalDay(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function relativeDayLabel(date) {
    if (!date || Number.isNaN(date.getTime())) return '';
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((startOfLocalDay(date) - startOfLocalDay(new Date())) / dayMs);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return '';
  }
  function formatScheduleText(game) {
    const value = game?.game_start_time || game?.game_date || null;
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Game scheduled';
    const relative = relativeDayLabel(date);
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (relative) return `${relative} ${time}`;
    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function matchupHeadline(game) { const homeAway = String(game?.home_away || '').toLowerCase(); const opponent = game?.opponent || 'Opponent TBD'; return homeAway === 'away' ? `Canes at ${opponent}` : `Canes vs ${opponent}`; }

  function gameMeta(game) {
    if (!game) return { id: '', hasGame: false, scheduleText: 'Schedule pending', opponent: 'Opponent TBD', homeAway: 'Home', startTime: null, gameType: 'Regular Season', gameState: 'PRE', headline: 'Next game not scheduled yet', first_picker: '', first_picker_user_id: null, current_pick_user_id: null, current_pick_number: 0, draft_status: 'pending' };
    return { id: String(game.id), hasGame: true, scheduleText: formatScheduleText(game), opponent: game.opponent || 'Opponent TBD', homeAway: game.home_away || 'Home', startTime: game.game_start_time || null, gameType: game.game_type || 'Regular Season', gameState: game.nhl_game_state || game.status || 'PRE', headline: matchupHeadline(game), first_picker: game.first_picker || '', first_picker_user_id: game.first_picker_user_id || null, current_pick_user_id: game.current_pick_user_id || null, current_pick_number: Number(game.current_pick_number || 0), draft_status: game.draft_status || 'open' };
  }

  function gameTimestamp(game) { const value = game?.game_start_time || game?.game_date || null; const time = value ? new Date(value).getTime() : 0; return Number.isFinite(time) ? time : 0; }
  function isFinalGame(game) { return String(game?.status || '').toLowerCase() === 'final' || String(game?.nhl_game_state || '').toUpperCase() === 'FINAL'; }
  function isHiddenGame(game) { return String(game?.status || '').toLowerCase() === 'hidden'; }
  function isLiveGame(game) { const state = String(game?.nhl_game_state || '').toUpperCase(); return !isFinalGame(game) && ['LIVE', 'CRIT'].includes(state); }
  function modeFromGame(game) { if (isFinalGame(game)) return 'final'; if (isLiveGame(game)) return 'live'; return 'pregame'; }

  function selectGameForGameDay(games = []) {
    const visibleGames = games.filter((game) => !isHiddenGame(game)); const now = Date.now();
    const liveGames = visibleGames.filter(isLiveGame).sort((a, b) => gameTimestamp(b) - gameTimestamp(a)); if (liveGames[0]) return liveGames[0];
    const upcomingGames = visibleGames.filter((game) => !isFinalGame(game) && gameTimestamp(game) >= now).sort((a, b) => gameTimestamp(a) - gameTimestamp(b)); if (upcomingGames[0]) return upcomingGames[0];
    const recentOpenGames = visibleGames.filter((game) => !isFinalGame(game)).sort((a, b) => gameTimestamp(b) - gameTimestamp(a)); if (recentOpenGames[0]) return recentOpenGames[0];
    return visibleGames.filter(isFinalGame).sort((a, b) => gameTimestamp(b) - gameTimestamp(a))[0] || null;
  }

  function findProfileForPick(pick = {}, profiles = []) { const ownerUserId = compact(pick.owner_user_id || pick.user_id); if (ownerUserId) { const byId = profiles.find((profile) => compact(profile.id) === ownerUserId); if (byId) return byId; } const owner = normalizeLookup(pick.owner); if (owner) return profiles.find((profile) => [profile.displayName, profile.display_name, profile.username, profile.profileKey, profile.profile_key, profile.id].some((value) => normalizeLookup(value) === owner)) || null; return null; }
  function normalizePick(pick, roster = [], profiles = []) { const player = roster.find((item) => String(item.id) === String(pick.player_id)); const profile = findProfileForPick(pick, profiles); const playerName = pick.player_name || pick.original_pick_text || player?.name || ''; return { id: String(pick.id), slot: pick.pick_slot || 0, round: pick.round_number || 1, playerId: String(pick.player_id || ''), playerName, userId: String(profile?.id || pick.owner_user_id || pick.user_id || ''), userName: profile?.displayName || pick.owner || 'Player', profileKey: profile?.profileKey || profile?.profile_key || String(profile?.id || '') }; }

  function normalizeGameDayState({ game, picks = [], roster = [], profiles = [], gameUserScores = [] }) {
    const users = profiles; const normalizedPicks = picks.map((pick) => normalizePick(pick, roster, profiles));
    const pregame = emptyBuckets(users, () => []);
    normalizedPicks.forEach((pick) => { const profile = users.find((user) => user.id === pick.userId || user.profileKey === pick.profileKey); if (!profile || !pick.playerName) return; pregame[profile.profileKey].push({ id: pick.playerId, name: pick.playerName, player: pick.playerName, slot: pick.slot, round: pick.round }); });
    Object.keys(pregame).forEach((key) => { pregame[key].sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0)); });
    const liveScores = emptyBuckets(users, () => 0); gameUserScores.forEach((score) => { const profile = users.find((user) => user.id === String(score.user_id)); if (!profile) return; liveScores[profile.profileKey] = Number(score.points || 0); });
    const gameInfo = gameMeta(game);
    return { source: 'supabase', currentGameId: String(game.id), mode: modeFromGame(game), game: gameInfo, playoffMode: String(game.game_type || '').toLowerCase().includes('playoff') ? 'playoffs' : 'regular', carryover: { active: false }, draft: { status: game.draft_status || 'open', draft_status: game.draft_status || 'open', currentPickNumber: Number(game.current_pick_number || 0), current_pick_number: Number(game.current_pick_number || 0), current_pick_user_id: game.current_pick_user_id || null, first_picker_user_id: game.first_picker_user_id || null, currentPicker: users.find((user) => user.id === String(game.current_pick_user_id)) || users[0] || { id: '', displayName: '', profileKey: '' }, firstPicker: game.first_picker || users[0]?.displayName || 'Player', firstPickerUserId: game.first_picker_user_id || null }, users, pregame, live: { scores: liveScores, period: game.nhl_game_state || 'Pregame', users: emptyBuckets(users, () => []), feed: [] }, roster };
  }

  async function fetchActiveSeason(db) { const result = await db.from('seasons').select('id').eq('is_active', true).maybeSingle(); if (result.error) throw result.error; if (!result.data?.id) throw new Error('No active season found.'); return result.data; }
  async function fetchCurrentGame() { const db = await CR.getSupabase(); const activeSeason = await fetchActiveSeason(db); const gamesRes = await db.from('games').select('*').eq('season_id', activeSeason.id).neq('status', 'Hidden').order('game_date', { ascending: true, nullsFirst: false }).order('game_number', { ascending: true }); if (gamesRes.error) throw gamesRes.error; return selectGameForGameDay(gamesRes.data || []); }
  async function safeLoadProfiles(db) { const res = await db.from('user_profiles').select('id, email, username, display_name, role, is_active, color_hex, color_label, rivalry_slot').eq('is_active', true).order('rivalry_slot', { ascending: true, nullsFirst: false }); if (res.error) throw res.error; return mapProfiles(res.data || []); }

  async function fetchGameDayData() {
    const db = await CR.getSupabase(); const game = await fetchCurrentGame(); const playersPromise = db.from('players').select('*').eq('is_active', true).order('player_name'); const profilesPromise = safeLoadProfiles(db); const picksPromise = game?.id ? db.from('picks').select('*').eq('game_id', game.id).order('pick_slot') : Promise.resolve({ data: [], error: null }); const scoresPromise = game?.id ? db.from('game_user_scores').select('game_id, user_id, points').eq('game_id', game.id) : Promise.resolve({ data: [], error: null });
    const [playersRes, profiles, picksRes, scoresRes] = await Promise.all([playersPromise, profilesPromise, picksPromise, scoresPromise]);
    if (playersRes.error) throw playersRes.error; if (picksRes.error) throw picksRes.error; if (scoresRes.error) throw scoresRes.error;
    const roster = mapRoster(playersRes.data || []); const gameUserScores = scoresRes.data || [];
    if (!game) return { source: 'supabase', currentGameId: '', mode: 'pregame', game: gameMeta(null), playoffMode: 'regular', carryover: { active: false }, draft: { status: 'pending', currentPickNumber: 0, currentPicker: { id: '', displayName: '', profileKey: '' }, firstPicker: '' }, users: profiles, pregame: emptyBuckets(profiles, () => []), live: { scores: emptyBuckets(profiles, () => 0), period: 'Schedule pending', users: emptyBuckets(profiles, () => []), feed: [] }, roster };
    return normalizeGameDayState({ game, picks: picksRes.data || [], roster, profiles, gameUserScores });
  }

  CR.gameDayDataService = { fetchGameDayData, normalizeGameDayState, rosterDisplayName, selectGameForGameDay, modeFromGame, formatScheduleText };
})();