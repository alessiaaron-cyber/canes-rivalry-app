window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const FALLBACK_USERS = [
    { displayName: 'Player 1', rivalrySlot: 1, colorHex: '#c8102e', colorLabel: 'Canes Red' },
    { displayName: 'Player 2', rivalrySlot: 2, colorHex: '#111827', colorLabel: 'Graphite' }
  ];

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeText(value) {
    return CR.profileScoreUtils?.normalizeText?.(value) || String(value || '').trim().toLowerCase();
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

  function fallbackProfiles() {
    return FALLBACK_USERS.map((user, index) => ({
      id: '',
      email: '',
      username: `player-${index + 1}`,
      displayName: user.displayName,
      display_name: user.displayName,
      role: 'member',
      colorHex: user.colorHex,
      color_hex: user.colorHex,
      colorLabel: user.colorLabel,
      color_label: user.colorLabel,
      rivalrySlot: user.rivalrySlot,
      rivalry_slot: user.rivalrySlot,
      themeClass: index === 0 ? 'owner-primary' : 'owner-secondary',
      avatarClass: index === 0 ? 'avatar-primary' : 'avatar-secondary'
    }));
  }

  function mapProfiles(rows = []) {
    const mapped = rows.filter((profile) => profile?.is_active !== false).map((profile, index) => {
      const fallback = FALLBACK_USERS[toNumber(profile.rivalry_slot, index + 1) - 1] || FALLBACK_USERS[index] || FALLBACK_USERS[0];
      const slot = toNumber(profile.rivalry_slot, fallback.rivalrySlot);
      const displayName = profile.display_name || profile.username || profile.email || fallback.displayName;
      return {
        id: String(profile.id || ''),
        email: profile.email || '',
        username: profile.username || '',
        displayName,
        display_name: displayName,
        role: profile.role || 'member',
        colorHex: profile.color_hex || fallback.colorHex,
        color_hex: profile.color_hex || fallback.colorHex,
        colorLabel: profile.color_label || fallback.colorLabel || '',
        color_label: profile.color_label || fallback.colorLabel || '',
        rivalrySlot: slot,
        rivalry_slot: slot,
        scoreKey: String(profile.id || displayName || ''),
        score_key: String(profile.id || displayName || ''),
        themeClass: slot === 2 ? 'owner-secondary' : 'owner-primary',
        avatarClass: slot === 2 ? 'avatar-secondary' : 'avatar-primary'
      };
    }).sort((a, b) => toNumber(a.rivalrySlot, 99) - toNumber(b.rivalrySlot, 99));

    return mapped.length ? mapped : fallbackProfiles();
  }

  function profileById(profiles = []) {
    return CR.profileScoreUtils?.profilesById?.(profiles) || profiles.reduce((acc, profile) => {
      if (profile.id) acc[profile.id] = profile;
      return acc;
    }, {});
  }

  function profileByName(profiles = []) {
    return CR.profileScoreUtils?.profilesByName?.(profiles) || profiles.reduce((acc, profile) => {
      acc[normalizeText(profile.displayName)] = profile;
      acc[normalizeText(profile.username)] = profile;
      return acc;
    }, {});
  }

  function ownerKey(profile = {}) {
    return CR.profileScoreUtils?.scoreKey?.(profile) || profile.id || profile.displayName || profile.display_name || '';
  }

  function ownerList(profiles = []) {
    return profiles.length ? profiles.map(ownerKey).filter(Boolean) : FALLBACK_USERS.map((user) => user.displayName);
  }

  function ownerBuckets(profiles = []) {
    return ownerList(profiles).reduce((acc, owner) => { acc[owner] = []; return acc; }, {});
  }

  function resolveOwner(pick = {}, context = {}) {
    const byId = context.profilesById || {};
    const byName = context.profilesByName || {};
    const profile = byId[String(pick.owner_user_id || '')] || byName[normalizeText(pick.owner)] || null;
    return profile ? ownerKey(profile) : '';
  }

  function resolveCurrentPicker(game = {}, context = {}) {
    const byId = context.profilesById || {};
    const profile = byId[String(game.current_pick_user_id || game.first_picker_user_id || '')] || null;
    return profile ? { id: profile.id, displayName: profile.displayName } : { id: '', displayName: '' };
  }

  function pointsForPick(pick, firstGoalScorer) {
    const goals = toNumber(pick.goals);
    const assists = toNumber(pick.assists);
    const isFirstGoal = Boolean(firstGoalScorer && pick.player_name === firstGoalScorer && goals > 0);
    return (goals * 2) + assists + (isFirstGoal ? 2 : 0);
  }

  function mapPregamePicks(picks = [], context = {}) {
    const buckets = ownerBuckets(context.profiles);
    picks.slice().sort((a, b) => toNumber(a.pick_slot) - toNumber(b.pick_slot)).forEach((pick) => {
      const owner = resolveOwner(pick, context);
      const name = pick.player_name || '';
      if (!owner || !name) return;
      buckets[owner] = buckets[owner] || [];
      buckets[owner].push(name);
    });
    return buckets;
  }

  function mapLiveUsers(game, picks = [], context = {}) {
    const buckets = ownerBuckets(context.profiles);
    const firstGoalScorer = game?.first_goal_scorer || '';
    picks.slice().sort((a, b) => toNumber(a.pick_slot) - toNumber(b.pick_slot)).forEach((pick) => {
      const owner = resolveOwner(pick, context);
      const player = pick.player_name || '';
      if (!owner || !player) return;
      const goals = toNumber(pick.goals);
      const assists = toNumber(pick.assists);
      const firstGoal = Boolean(firstGoalScorer && player === firstGoalScorer && goals > 0);
      buckets[owner] = buckets[owner] || [];
      buckets[owner].push({ player, goals, assists, firstGoal, points: toNumber(pick.points, pointsForPick(pick, firstGoalScorer)), ownerUserId: pick.owner_user_id || '' });
    });
    return buckets;
  }

  function buildFeed(game, users) {
    const feed = [];
    const firstGoalScorer = game?.first_goal_scorer || '';
    Object.entries(users || {}).forEach(([owner, picks]) => {
      const ownerDisplay = CR.identity?.findUser?.(owner)?.displayName || CR.profileScoreUtils?.displayName?.(CR.identity?.findUser?.(owner), owner) || owner;
      (picks || []).forEach((pick) => {
        if (pick.firstGoal || pick.player === firstGoalScorer) feed.push({ icon: '👑', title: `${pick.player} first Canes goal`, detail: `${ownerDisplay} gets the first goal bonus`, points: 2, tier: 'heavy' });
        if (toNumber(pick.goals) > 0) feed.push({ icon: '🚨', title: `${pick.player} goal${toNumber(pick.goals) > 1 ? 's' : ''}`, detail: `${ownerDisplay} scores through a picked player`, points: toNumber(pick.goals) * 2, tier: 'medium' });
        if (toNumber(pick.assists) > 0) feed.push({ icon: '🎯', title: `${pick.player} assist${toNumber(pick.assists) > 1 ? 's' : ''}`, detail: `${ownerDisplay} adds assist points`, points: toNumber(pick.assists), tier: 'light' });
      });
    });
    return feed.length ? feed : [{ icon: '🏒', title: 'Waiting for rivalry moments', detail: 'Live scoring updates will appear here.', points: 0, tier: 'light' }];
  }

  function normalizedScoreByUserId(rows = []) {
    return CR.profileScoreUtils?.normalizedScoreByUserId?.(rows) || (rows || []).reduce((acc, row) => {
      const userId = String(row.user_id || '').trim();
      if (userId) acc[userId] = toNumber(row.points);
      return acc;
    }, {});
  }

  function scoreForProfile(profile, normalizedScores) {
    return CR.profileScoreUtils?.scoreForProfile?.(profile, normalizedScores) || 0;
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
    const context = { profiles, profilesById: profileById(profiles), profilesByName: profileByName(profiles) };
    const mode = modeForGame(game);
    const liveUsers = mapLiveUsers(game, picks, context);
    const normalizedScores = normalizedScoreByUserId(gameUserScores);
    const scores = (profiles || []).reduce((acc, profile) => {
      const owner = ownerKey(profile);
      if (!owner) return acc;
      acc[owner] = scoreForProfile(profile, normalizedScores);
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
      live: { scores, period: mode === 'pregame' ? formatScheduleText(game) : periodText(game), users: liveUsers, feed: buildFeed(game, liveUsers) },
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
    if (res.error) {
      console.warn('Game Day profiles unavailable; using neutral fallback users', res.error);
      return fallbackProfiles();
    }
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
    if (!game) return { source: 'supabase', currentGameId: '', mode: 'pregame', game: gameMeta(null), playoffMode: 'regular', carryover: { active: false }, draft: { status: 'pending', currentPickNumber: 0, currentPicker: { id: '', displayName: '' }, firstPicker: '' }, users: profiles, pregame: ownerBuckets(profiles), live: { scores: ownerList(profiles).reduce((acc, owner) => { acc[owner] = 0; return acc; }, {}), period: 'Schedule pending', users: ownerBuckets(profiles), feed: [] }, roster };
    return normalizeGameDayState({ game, picks: picksRes.data || [], roster, profiles, gameUserScores });
  }

  CR.gameDayDataService = { fetchGameDayData, normalizeGameDayState, rosterDisplayName, selectGameForGameDay };
})();