window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function rosterDisplayName(player) {
    return player?.player_name || player?.name || 'Player';
  }

  function mapRoster(players = []) {
    return players.map((player) => ({
      id: String(player.id),
      name: rosterDisplayName(player),
      displayName: rosterDisplayName(player),
      position: player.position || 'F',
      detail: player.position || 'F',
      active: player.is_active !== false
    }));
  }

  function mapProfiles(profiles = []) {
    return profiles.map((profile, index) => ({
      id: String(profile.id),
      username: profile.username || '',
      displayName: profile.display_name || profile.username || `Player ${index + 1}`,
      role: profile.role || 'player',
      email: profile.email || '',
      colorHex: profile.color_hex || '',
      colorLabel: profile.color_label || '',
      rivalrySlot: profile.rivalry_slot || index + 1,
      profileKey: String(profile.id)
    }));
  }

  function emptyBuckets(users = [], factory = () => null) {
    return users.reduce((acc, user) => {
      acc[user.profileKey] = factory(user);
      return acc;
    }, {});
  }

  function gameMeta(game) {
    if (!game) {
      return {
        id: '',
        opponent: 'Opponent TBD',
        homeAway: 'Home',
        startTime: null,
        gameType: 'Regular Season',
        gameState: 'PRE'
      };
    }

    return {
      id: String(game.id),
      opponent: game.opponent || 'Opponent TBD',
      homeAway: game.home_away || 'Home',
      startTime: game.game_start_time || null,
      gameType: game.game_type || 'Regular Season',
      gameState: game.nhl_game_state || game.status || 'PRE'
    };
  }

  function selectGameForGameDay(games = []) {
    const ranked = [...games].sort((a, b) => {
      const aRank = String(a.status || '').toLowerCase() === 'final' ? 1 : 0;
      const bRank = String(b.status || '').toLowerCase() === 'final' ? 1 : 0;
      if (aRank !== bRank) return aRank - bRank;
      const aDate = new Date(a.game_start_time || a.game_date || 0).getTime();
      const bDate = new Date(b.game_start_time || b.game_date || 0).getTime();
      return bDate - aDate;
    });

    return ranked[0] || null;
  }

  function normalizePick(pick, roster = [], profiles = []) {
    const player = roster.find((item) => String(item.id) === String(pick.player_id));
    const profile = profiles.find((item) => String(item.id) === String(pick.user_id));

    return {
      id: String(pick.id),
      slot: pick.pick_slot || 0,
      round: pick.round_number || 1,
      playerId: String(pick.player_id || ''),
      playerName: player?.name || 'Unknown player',
      userId: String(pick.user_id || ''),
      userName: profile?.displayName || 'Player'
    };
  }

  function normalizeGameDayState({ game, picks = [], roster = [], profiles = [], gameUserScores = [] }) {
    const users = profiles;
    const normalizedPicks = picks.map((pick) => normalizePick(pick, roster, profiles));

    const pregame = emptyBuckets(users, () => []);
    normalizedPicks.forEach((pick) => {
      const profile = users.find((user) => user.id === pick.userId);
      if (!profile) return;
      pregame[profile.profileKey].push({
        id: pick.playerId,
        name: pick.playerName,
        slot: pick.slot,
        round: pick.round
      });
    });

    const liveScores = emptyBuckets(users, () => 0);
    gameUserScores.forEach((score) => {
      const profile = users.find((user) => user.id === String(score.user_id));
      if (!profile) return;
      liveScores[profile.profileKey] = Number(score.points || 0);
    });

    return {
      source: 'supabase',
      currentGameId: String(game.id),
      mode: 'pregame',
      game: gameMeta(game),
      playoffMode: String(game.game_type || '').toLowerCase().includes('playoff') ? 'playoffs' : 'regular',
      carryover: { active: false },
      draft: {
        status: game.draft_status || 'open',
        currentPickNumber: Number(game.current_pick_number || 0),
        currentPicker: users.find((user) => user.id === String(game.current_pick_user_id)) || users[0] || { id: '', displayName: '', profileKey: '' },
        firstPicker: game.first_picker || users[0]?.displayName || 'Player'
      },
      users,
      pregame,
      live: {
        scores: liveScores,
        period: game.nhl_game_state || 'Pregame',
        users: emptyBuckets(users, () => []),
        feed: []
      },
      roster
    };
  }

  async function fetchCurrentGame() {
    const db = await CR.getSupabase();
    const gamesRes = await db
      .from('games')
      .select('*')
      .order('game_date', { ascending: false })
      .order('game_number', { ascending: false });

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
    const playersPromise = db
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('player_name');
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