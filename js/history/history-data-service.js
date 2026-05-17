window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const FALLBACK_USERS = [
    { id: 'user-1', username: 'player-1', displayName: 'Player 1', themeClass: 'owner-primary', avatarClass: 'avatar-primary', scoreKey: 'user-1' },
    { id: 'user-2', username: 'player-2', displayName: 'Player 2', themeClass: 'owner-secondary', avatarClass: 'avatar-secondary', scoreKey: 'user-2' }
  ];

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function seasonLabel(row) {
    return row?.display_name || row?.label || row?.season_key || row?.name || String(row?.id || 'Season');
  }

  function seasonShortLabel(row) {
    return row?.short_label || row?.season_key || seasonLabel(row).replace(/^20/, '');
  }

  function gameTitle(row) {
    if (row?.title) return row.title;
    const number = row?.game_number ? `Game ${row.game_number}` : 'Game';
    const opponent = row?.opponent && row.opponent !== 'Next Game' ? ` vs ${row.opponent}` : '';
    return `${number}${opponent}`;
  }

  function isPlayoffGame(row) {
    return String(row?.game_type || '').toLowerCase().includes('playoff');
  }

  function isFinalGame(row) {
    return String(row?.status || '').toLowerCase() === 'final';
  }

  function playerIdForName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function sortSeasons(rows = []) {
    return rows.slice().sort((a, b) => String(a.season_key || a.display_name || a.id || '').localeCompare(String(b.season_key || b.display_name || b.id || '')));
  }

  function sortGames(rows = []) {
    return rows.slice().sort((a, b) => toNumber(a.game_number, 9999) - toNumber(b.game_number, 9999));
  }

  function sortPicks(rows = []) {
    return rows.slice().sort((a, b) => toNumber(a.pick_slot, 9999) - toNumber(b.pick_slot, 9999));
  }

  function users() {
    return CR.identity?.getUsers?.() || FALLBACK_USERS;
  }

  function userAtSlot(slot) {
    return users().find((user) => Number(user.rivalrySlot || user.rivalry_slot) === Number(slot)) || users()[Number(slot) - 1] || FALLBACK_USERS[Number(slot) - 1] || null;
  }

  function displayName(profile = {}) {
    return CR.profileScoreUtils?.displayName?.(profile) || profile.displayName || profile.display_name || profile.username || 'Player';
  }

  function scoreRowsByGameId(rows = []) {
    return rows.reduce((acc, row) => {
      const gameId = String(row.game_id || '');
      if (!gameId) return acc;
      acc[gameId] = acc[gameId] || [];
      acc[gameId].push(row);
      return acc;
    }, {});
  }

  function totalsRowsBySeasonId(rows = []) {
    return rows.reduce((acc, row) => {
      const seasonId = String(row.season_id || '');
      if (!seasonId) return acc;
      acc[seasonId] = acc[seasonId] || [];
      acc[seasonId].push(row);
      return acc;
    }, {});
  }

  function normalizedScores(rows = [], valueKey = 'points') {
    return CR.profileScoreUtils?.normalizedScoreByUserId?.(rows, valueKey) || {};
  }

  function scoreForSlot(slot, scoreMap) {
    const profile = userAtSlot(slot);
    return CR.profileScoreUtils?.scoreForProfile?.(profile, scoreMap) || 0;
  }

  function winnerForGame(row, aScore, bScore) {
    const winnerProfile = row.winner_user_id ? users().find((user) => String(user.id) === String(row.winner_user_id)) : null;
    if (winnerProfile) return displayName(winnerProfile);
    if (aScore === bScore) return 'Tie';
    return aScore > bScore ? displayName(userAtSlot(1)) : displayName(userAtSlot(2));
  }

  function mapPlayers(rows) {
    const byId = new Map();

    (rows || []).forEach((row) => {
      const name = row.player_name || row.name;
      if (!name) return;
      const id = String(row.id || playerIdForName(name));
      byId.set(id, {
        id,
        name,
        position: row.position || row.pos || '—',
        vibe: row.vibe || ''
      });
    });

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function buildPlayerLookup(players) {
    const lookup = new Map();
    (players || []).forEach((player) => {
      lookup.set(String(player.id), player.id);
      lookup.set(String(player.name || '').toLowerCase(), player.id);
    });
    return lookup;
  }

  function pickPoints(pick, firstGoalScorer) {
    const goals = toNumber(pick.goals);
    const assists = toNumber(pick.assists);
    const firstGoal = Boolean(firstGoalScorer && pick.player_name === firstGoalScorer && goals > 0);
    return (goals * 2) + assists + (firstGoal ? 2 : 0);
  }

  function mapPicksForGame(game, picks, playerLookup) {
    const byId = CR.profileScoreUtils?.profilesById?.(users()) || {};
    return sortPicks(picks || [])
      .filter((pick) => Number(pick.game_id) === Number(game.id))
      .reduce((acc, pick) => {
        const ownerProfile = byId[String(pick.owner_user_id || '')] || null;
        const owner = ownerProfile ? (CR.profileScoreUtils?.scoreKey?.(ownerProfile) || ownerProfile.id) : String(pick.owner_user_id || 'unknown');
        const name = pick.player_name || '';
        const fallbackId = playerIdForName(name);
        const playerId = playerLookup.get(String(name).toLowerCase()) || playerLookup.get(String(pick.player_id || '')) || fallbackId;

        acc[owner] = acc[owner] || [];
        acc[owner].push({
          playerId,
          playerName: name,
          player: name,
          goals: toNumber(pick.goals),
          assists: toNumber(pick.assists),
          firstGoal: Boolean(game.first_goal_scorer && name === game.first_goal_scorer && toNumber(pick.goals) > 0),
          points: toNumber(pick.points, pickPoints(pick, game.first_goal_scorer)),
          ownerUserId: pick.owner_user_id || ''
        });
        return acc;
      }, {});
  }

  function mapGames(rows, picks, playerLookup, scoresByGame) {
    return sortGames(rows || [])
      .filter((row) => row && row.status !== 'Hidden' && isFinalGame(row))
      .map((row) => {
        const scoreMap = normalizedScores(scoresByGame[String(row.id)] || []);
        const aaronScore = scoreForSlot(1, scoreMap);
        const julieScore = scoreForSlot(2, scoreMap);
        const winner = winnerForGame(row, aaronScore, julieScore);
        const firstGoal = row.first_goal_scorer ? [`First goal: ${row.first_goal_scorer}`] : [];
        const resultTag = winner === 'Tie' ? 'Tie' : `${winner} win`;
        const gameType = row.game_type || 'Regular Season';

        return {
          id: String(row.id),
          seasonId: String(row.season_id),
          date: row.game_date || row.date || '',
          opponent: row.opponent || '',
          firstPick: row.first_picker_user_id || '',
          firstGoalScorer: row.first_goal_scorer || '',
          title: gameTitle(row),
          gameType,
          game_type: gameType,
          playoff: isPlayoffGame(row),
          aaronScore,
          julieScore,
          winner,
          summary: `${gameTitle(row)} finished ${aaronScore}-${julieScore}.`,
          tags: [gameType, resultTag].filter(Boolean),
          moments: firstGoal.length ? firstGoal : [`${winner === 'Tie' ? 'Tie game' : `${winner} took the result`}`],
          picks: mapPicksForGame(row, picks, playerLookup)
        };
      });
  }

  function mapSeasons(rows, currentSeasonId, totalsBySeason) {
    return sortSeasons(rows || []).map((row) => {
      const totalMap = normalizedScores(totalsBySeason[String(row.id)] || [], 'total_points');
      return {
        id: String(row.id),
        label: seasonLabel(row),
        shortLabel: seasonShortLabel(row),
        isCurrent: String(row.id) === String(currentSeasonId),
        note: row.note || (row.is_active ? 'Current season.' : 'Completed season.'),
        aaronScore: scoreForSlot(1, totalMap),
        julieScore: scoreForSlot(2, totalMap)
      };
    });
  }

  async function fetchHistoryData() {
    const db = await CR.getSupabase();

    const seasonsRes = await db.from('seasons').select('*');
    if (seasonsRes.error) throw seasonsRes.error;

    const seasons = sortSeasons(seasonsRes.data || []);
    const activeSeason = seasons.find((season) => season.is_active) || seasons[seasons.length - 1] || null;
    const currentSeasonId = activeSeason?.id ? String(activeSeason.id) : '';

    const [gamesRes, playersRes, gameScoresRes, seasonTotalsRes] = await Promise.all([
      db.from('games').select('*'),
      db.from('players').select('*'),
      db.from('game_user_scores').select('game_id, user_id, points'),
      db.from('season_user_totals').select('season_id, user_id, total_points')
    ]);

    if (gamesRes.error) throw gamesRes.error;
    if (playersRes.error) throw playersRes.error;
    if (gameScoresRes.error) throw gameScoresRes.error;
    if (seasonTotalsRes.error) throw seasonTotalsRes.error;

    const gamesRows = sortGames(gamesRes.data || []);
    let picksRows = [];

    if (gamesRows.length) {
      const gameIds = gamesRows.map((game) => game.id);
      const picksRes = await db.from('picks').select('*').in('game_id', gameIds);
      if (picksRes.error) throw picksRes.error;
      picksRows = sortPicks(picksRes.data || []);
    }

    const players = mapPlayers(playersRes.data || []);
    const playerLookup = buildPlayerLookup(players);
    const scoresByGame = scoreRowsByGameId(gameScoresRes.data || []);
    const totalsBySeason = totalsRowsBySeasonId(seasonTotalsRes.data || []);

    return {
      source: 'supabase',
      currentSeasonId,
      users: users(),
      seasons: mapSeasons(seasons, currentSeasonId, totalsBySeason),
      players,
      games: mapGames(gamesRows, picksRows, playerLookup, scoresByGame)
    };
  }

  CR.historyDataService = { fetchHistoryData };
})();