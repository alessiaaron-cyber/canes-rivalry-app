window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function modeForGame(game) {
    const status = normalizeStatus(game?.status);
    if (status === 'final') return 'final';
    if (['live', 'in_progress', 'in progress', 'active', 'crit'].includes(status)) return 'live';
    return 'pregame';
  }

  function isLiveStatus(status) {
    return ['live', 'in_progress', 'in progress', 'active', 'crit'].includes(normalizeStatus(status));
  }

  function isFinalStatus(status) {
    return normalizeStatus(status) === 'final';
  }

  function isHiddenStatus(status) {
    return normalizeStatus(status) === 'hidden';
  }

  function isPlayoffGame(game) {
    return String(game?.game_type || game?.gameType || '').toLowerCase().includes('playoff');
  }

  function playerIdForName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function rosterDisplayName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return String(name || '').trim();
    return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
  }

  function rosterSortKey(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return String(name || '').trim().toLowerCase();
    return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`.toLowerCase();
  }

  function mapRoster(rows = []) {
    return rows.map((row) => {
      const name = row.player_name || row.name || '';
      if (!name) return null;
      const position = row.position || row.pos || '';
      return { id: String(row.id || playerIdForName(name)), name, displayName: rosterDisplayName(name), sortKey: rosterSortKey(name), detail: position || 'Canes roster' };
    }).filter(Boolean).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  function profileKey(profile = {}, index = 0) {
    return String(profile.id || profile.profileKey || profile.profile_key || `player-${index + 1}`).trim();
  }

  function mapProfiles(rows = []) {
    const source = rows.filter((profile) => profile?.is_active !== false);
    const mapped = source.map((profile, index) => {
      const slot = toNumber(profile.rivalry_slot, index + 1);
      const key = profileKey(profile, index);
      const displayName = profile.display_name || profile.username || profile.email || `Player ${slot}`;
      return {
        id: String(profile.id || key),
        email: profile.email || '',
        username: profile.username || '',
        displayName,
        display_name: displayName,
        role: profile.role || 'member',
        colorHex: profile.color_hex || '',
        color_hex: profile.color_hex || '',
        colorLabel: profile.color_label || '',
        color_label: profile.color_label || '',
        rivalrySlot: slot,
        rivalry_slot: slot,
        profileKey: key,
        profile_key: key,
        scoreKey: key,
        score_key: key,
        themeClass: slot === 2 ? 'owner-secondary' : 'owner-primary',
        avatarClass: slot === 2 ? 'avatar-secondary' : 'avatar-primary'
      };
    }).sort((a, b) => toNumber(a.rivalrySlot, 99) - toNumber(b.rivalrySlot, 99));

    if (mapped.length) return mapped;

    return [1, 2].map((slot) => ({
      id: `player-${slot}`,
      username: `player-${slot}`,
      displayName: `Player ${slot}`,
      display_name: `Player ${slot}`,
      role: 'member',
      rivalrySlot: slot,
      rivalry_slot: slot,
      profileKey: `player-${slot}`,
      profile_key: `player-${slot}`,
      scoreKey: `player-${slot}`,
      score_key: `player-${slot}`,
      themeClass: slot === 2 ? 'owner-secondary' : 'owner-primary',
      avatarClass: slot === 2 ? 'avatar-secondary' : 'avatar-primary'
    }));
  }

  function profileById(profiles = []) {
    return profiles.reduce((acc, profile) => {
      if (profile.id) acc[String(profile.id)] = profile;
      return acc;
    }, {});
  }

  function profileByKey(profiles = []) {
    return profiles.reduce((acc, profile, index) => {
      const key = profileKey(profile, index);
      if (key) acc[key] = profile;
      if (profile.username) acc[normalizeText(profile.username)] = profile;
      if (profile.displayName) acc[normalizeText(profile.displayName)] = profile;
      if (profile.display_name) acc[normalizeText(profile.display_name)] = profile;
      return acc;
    }, {});
  }

  function orderedProfileKeys(profiles = []) {
    return profiles.slice(0, 2).map((profile, index) => profileKey(profile, index));
  }

  function emptyBuckets(profiles = [], valueFactory = () => []) {
    return orderedProfileKeys(profiles).reduce((acc, key) => {
      acc[key] = valueFactory();
      return acc;
    }, {});
  }

  function resolveProfile(pick = {}, context = {}) {
    const byId = context.profilesById || {};
    const byKey = context.profilesByKey || {};
    return byId[String(pick.owner_user_id || '')] || byKey[String(pick.owner_user_id || '')] || byKey[normalizeText(pick.owner)] || null;
  }

  function resolveCurrentPicker(game = {}, context = {}) {
    const byId = context.profilesById || {};
    const byKey = context.profilesByKey || {};
    const profile = byId[String(game.current_pick_user_id || game.first_picker_user_id || '')] || byKey[normalizeText(game.first_picker)] || null;
    return profile ? { id: profile.id, displayName: profile.displayName, profileKey: profile.profileKey || profile.profile_key || profile.id } : { id: '', displayName: '', profileKey: '' };
  }

  function pointsForPick(pick, firstGoalScorer) {
    const goals = toNumber(pick.goals);
    const assists = toNumber(pick.assists);
    const isFirstGoal = Boolean(firstGoalScorer && pick.player_name === firstGoalScorer && goals > 0);
    return (goals * 2) + assists + (isFirstGoal ? 2 : 0);
  }

  function mapPregamePicks(picks = [], context = {}) {
    const buckets = emptyBuckets(context.profiles, () => []);
    picks.slice().sort((a, b) => toNumber(a.pick_slot) - toNumber(b.pick_slot)).forEach((pick) => {
      const profile = resolveProfile(pick, context);
      const key = profile ? profileKey(profile) : '';
      const name = pick.player_name || '';
      if (!key || !name) return;
      buckets[key] = buckets[key] || [];
      buckets[key].push(name);
    });
    return buckets;
  }

  function mapLiveUsers(game, picks = [], context = {}) {
    const buckets = emptyBuckets(context.profiles, () => []);
    const firstGoalScorer = game?.first_goal_scorer || '';
    picks.slice().sort((a, b) => toNumber(a.pick_slot) - toNumber(b.pick_slot)).forEach((pick) => {
      const profile = resolveProfile(pick, context);
      const key = profile ? profileKey(profile) : '';
      const player = pick.player_name || '';
      if (!key || !player) return;
      const goals = toNumber(pick.goals);
      const assists = toNumber(pick.assists);
      const firstGoal = Boolean(firstGoalScorer && player === firstGoalScorer && goals > 0);
      buckets[key] = buckets[key] || [];
      buckets[key].push({ player, goals, assists, firstGoal, points: toNumber(pick.points, pointsForPick(pick, firstGoalScorer)), ownerUserId: pick.owner_user_id || '', profileKey: key });
    });
    return buckets;
  }

  function buildFeed(game, users, profiles = []) {
    const feed = [];
    const byKey = profileByKey(profiles);
    const firstGoalScorer = game?.first_goal_scorer || '';
    Object.entries(users || {}).forEach(([key, picks]) => {
      const ownerDisplay = byKey[key]?.displayName || byKey[key]?.display_name || 'Player';
      (picks || []).forEach((pick) => {
        if (pick.firstGoal || pick.player === firstGoalScorer) feed.push({ icon: '👑', title: `${pick.player} first Canes goal`, detail: `${ownerDisplay} gets the first goal bonus`, points: 2, tier: 'heavy' });
        if (toNumber(pick.goals) > 0) feed.push({ icon: '🚨', title: `${pick.player} goal${toNumber(pick.goals) > 1 ? 's' : ''}`, detail: `${ownerDisplay} scores through a picked player`, points: toNumber(pick.goals) * 2, tier: 'medium' });
        if (toNumber(pick.assists) > 0) feed.push({ icon: '🎯', title: `${pick.player} assist${toNumber(pick.assists) > 1 ? 's' : ''}`, detail: `${ownerDisplay} adds assist points`, points: toNumber(pick.assists), tier: 'light' });
      });
    });
    return feed.length ? feed : [{ icon: '🏒', title: 'Waiting for rivalry moments', detail: 'Live scoring updates will appear here.', points: 0, tier: 'light' }];
  }

  function scoreFromUsers(users, key) {
    return (users?.[key] || []).reduce((sum, pick) => Number.isFinite(Number(pick.points)) ? sum + Number(pick.points) : sum + (toNumber(pick.goals) * 2) + toNumber(pick.assists) + (pick.firstGoal ? 2 : 0), 0);
  }

  function normalizedScoreByUserId(rows = []) {
    return (rows || []).reduce((acc, row) => {
      const userId = String(row.user_id || '').trim();
      if (userId) acc[userId] = toNumber(row.points);
      return acc;
    }, {});
  }

  function scoreForProfile(profile, liveUsers, scoreByUserId, index = 0) {
    const id = String(profile?.id || '').trim();
    const key = profileKey(profile, index);
    if (id && Object.prototype.hasOwnProperty.call(scoreByUserId, id)) return scoreByUserId[id];
    if (key && Object.prototype.hasOwnProperty.call(scoreByUserId, key)) return scoreByUserId[key];
    return scoreFromUsers(liveUsers, key);
  }

  function periodText(game) {
    return game?.game_clock || game?.clock || game?.period || game?.game_state || 'Live';
  }

  function gameDateValue(game) {
    return game?.game_date || game?.game_time || game?.start_time || game?.scheduled_at || game?.gameDate || '';
  }

  function scheduleDate(game) {
    const value = gameDateValue(game);
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatScheduleText(game) {
    const date = scheduleDate(game);
    if (!date) return 'Schedule pending';
    return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function isSameLocalDay(a, b) {
    return Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
  }

  function gameMeta(game) {
    const date = scheduleDate(game);
    const scheduleText = date ? formatScheduleText(game) : 'Schedule pending';
    if (!game || !date) return { hasGame: false, scheduleText, opponent: '', headline: 'Next game not scheduled yet' };
    return { hasGame: true, scheduleText, opponent: game.opponent || game.away_team || game.home_team || '', headline: game.opponent ? `Canes vs ${game.opponent}` : 'Canes game' };
  }

  function normalizeGameDayState({ game, picks, roster, profiles, gameUserScores }) {
    const context = { profiles, profilesById: profileById(profiles), profilesByKey: profileByKey(profiles) };
    const mode = modeForGame(game);
    const liveUsers = mapLiveUsers(game, picks, context);
    const scoreByUserId = normalizedScoreByUserId(gameUserScores);
    const scores = (profiles || []).slice(0, 2).reduce((acc, profile, index) => {
      const key = profileKey(profile, index);
      if (!key) return acc;
      acc[key] = scoreForProfile(profile, liveUsers, scoreByUserId, index);
      return acc;
    }, {});

    return {
      source: 'supabase',
      currentGameId: game?.id ? String(game.id) : '',
      mode,
      game: gameMeta(game),
      playoffMode: isPlayoffGame(game) ? 'playoffs' : 'regular',
      carryover: { active: Boolean(game?.carryover_active || game?.is_carryover) },
      draft: {
        status: game?.draft_status || 'open',
        currentPickNumber: toNumber(game?.current_pick_number, 1),
        currentPicker: resolveCurrentPicker(game, context),
        firstPicker: game?.first_picker_user_id || ''
      },
      users: profiles || [],
      pregame: mapPregamePicks(picks, context),
      live: { scores, period: mode === 'pregame' ? formatScheduleText(game) : periodText(game), users: liveUsers, feed: buildFeed(game, liveUsers, profiles) },
      roster: roster?.length ? roster : []
    };
  }

  function sortByGameNumber(games = []) {
    return games.slice().sort((a, b) => toNumber(a.game_number, 9999) - toNumber(b.game_number, 9999));
  }

  function selectGameForGameDay(games = []) {
    const visibleGames = sortByGameNumber(games).filter((game) => !isHiddenStatus(game.status));
    const now = new Date();

    const liveGame = visibleGames.find((game) => isLiveStatus(game.status));
    if (liveGame) return liveGame;

    const sameDayFinal = visibleGames.find((game) => isFinalStatus(game.status) && isSameLocalDay(scheduleDate(game), now));
    if (sameDayFinal) return sameDayFinal;

    const nonFinalGame = visibleGames.find((game) => !isFinalStatus(game.status));
    return nonFinalGame || null;
  }

  async function fetchCurrentGame() {
    const db = await CR.getSupabase();
    const seasonsRes = await db.from('seasons').select('*').eq('is_active', true).limit(1).maybeSingle();
    if (seasonsRes.error) throw seasonsRes.error;
    let query = db.from('games').select('*').neq('status', 'Hidden');
    if (seasonsRes.data?.id) query = query.eq('season_id', seasonsRes.data.id);
    const gamesRes = await query.order('game_number', { ascending: true });
    if (gamesRes.error) throw gamesRes.error;
    return selectGameForGameDay(gamesRes.data || []);
  }

  async function safeLoadProfiles(db) {
    const res = await db
      .from('user_profiles')
      .select('id, email, username, display_name, role, is_active, color_hex, color_label, rivalry_slot')
      .eq('is_active', true);
    if (res.error) throw res.error;
    return mapProfiles(res.data || []);
  }

  async function fetchGameDayData() {
    const db = await CR.getSupabase();
    const game = await fetchCurrentGame();
    const playersPromise = db.from('players').select('*').order('player_name');
    const profilesPromise = safeLoadProfiles(db);
    const picksPromise = game?.id ? db.from('picks').select('*').eq('game_id', game.id).order('pick_slot') : Promise.resolve({ data: [], error: null });
    const scoresPromise = game?.id ? db.from('game_user_scores').select('game_id, user_id, points').eq('game_id', game.id) : Promise.resolve({ data: [], error: null });
    const [playersRes, profiles, picksRes, scoresRes] = await Promise.all([playersPromise, profilesPromise, picksPromise, scoresPromise]);
    if (playersRes.error) throw playersRes.error;
    if (picksRes.error) throw picksRes.error;
    if (scoresRes.error) throw scoresRes.error;
    const roster = mapRoster(playersRes.data || []);
    const gameUserScores = scoresRes.data || [];
    if (!game) return { source: 'supabase', currentGameId: '', mode: 'pregame', game: gameMeta(null), playoffMode: 'regular', carryover: { active: false }, draft: { status: 'pending', currentPickNumber: 0, currentPicker: { id: '', displayName: '', profileKey: '' }, firstPicker: '' }, users: profiles, pregame: emptyBuckets(profiles, () => []), live: { scores: emptyBuckets(profiles, () => 0), period: 'Schedule pending', users: emptyBuckets(profiles, () => []), feed: [] }, roster };
    return normalizeGameDayState({ game, picks: picksRes.data || [], roster, profiles, gameUserScores });
  }

  CR.gameDayDataService = { fetchGameDayData, normalizeGameDayState, rosterDisplayName, selectGameForGameDay };
})();