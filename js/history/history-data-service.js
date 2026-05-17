window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const SIDE_ONE = 'first';
  const SIDE_TWO = 'second';

  const FALLBACK_USERS = [
    { id: 'player-1', username: 'Player 1', displayName: 'Player 1', display_name: 'Player 1', rivalrySlot: 1, rivalry_slot: 1, themeClass: 'owner-primary', avatarClass: 'avatar-primary', scoreKey: SIDE_ONE, score_key: SIDE_ONE, profileKey: 'player-1', profile_key: 'player-1' },
    { id: 'player-2', username: 'Player 2', displayName: 'Player 2', display_name: 'Player 2', rivalrySlot: 2, rivalry_slot: 2, themeClass: 'owner-secondary', avatarClass: 'avatar-secondary', scoreKey: SIDE_TWO, score_key: SIDE_TWO, profileKey: 'player-2', profile_key: 'player-2' }
  ];

  let historyUsers = FALLBACK_USERS;

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
    return String(row?.status || '').trim().toLowerCase() === 'final';
  }

  function playerIdForName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  function sideKeyForSlot(slot) {
    return Number(slot) === 2 ? SIDE_TWO : SIDE_ONE;
  }

  function sideIndexForKey(sideKey) {
    return String(sideKey) === SIDE_TWO ? 1 : 0;
  }

  function normalizeProfiles(rows = []) {
    const mapped = rows
      .filter((user) => user?.is_active !== false && String(user?.id || '').trim())
      .sort((a, b) => toNumber(a.rivalry_slot, 99) - toNumber(b.rivalry_slot, 99))
      .slice(0, 2)
      .map((user, index) => {
        const slot = toNumber(user.rivalry_slot, index + 1);
        const sideKey = sideKeyForSlot(slot);
        const displayName = user.display_name || user.username || user.email || `Player ${slot}`;
        const id = String(user.id || '').trim();
        return {
          ...user,
          id,
          username: user.username || displayName,
          displayName,
          display_name: displayName,
          rivalrySlot: slot,
          rivalry_slot: slot,
          scoreKey: sideKey,
          score_key: sideKey,
          profileKey: id,
          profile_key: id,
          themeClass: slot === 2 ? 'owner-secondary' : 'owner-primary',
          theme_class: slot === 2 ? 'owner-secondary' : 'owner-primary',
          avatarClass: slot === 2 ? 'avatar-secondary' : 'avatar-primary',
          avatar_class: slot === 2 ? 'avatar-secondary' : 'avatar-primary',
          colorHex: user.color_hex || '',
          color_hex: user.color_hex || '',
          colorLabel: user.color_label || '',
          color_label: user.color_label || ''
        };
      });
    return mapped.length === 2 ? mapped : FALLBACK_USERS;
  }

  function users() {
    return historyUsers;
  }

  function userBySlot(slot) {
    return users().find((user) => Number(user.rivalrySlot || user.rivalry_slot) === Number(slot)) || users()[Number(slot) - 1] || FALLBACK_USERS[Number(slot) - 1] || null;
  }

  function rowsByKey(rows = [], keyName) {
    return rows.reduce((acc, row) => {
      const key = String(row?.[keyName] || '');
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(row);
      return acc;
    }, {});
  }

  function normalizedScoreByUserId(rows = [], valueKey = 'points') {
    return (rows || []).reduce((acc, row) => {
      const userId = String(row?.user_id || '').trim();
      if (userId) acc[userId] = toNumber(row?.[valueKey]);
      return acc;
    }, {});
  }

  function scoreForUser(user, normalizedScores) {
    const id = String(user?.id || '').trim();
    return id && Object.prototype.hasOwnProperty.call(normalizedScores, id) ? toNumber(normalizedScores[id]) : 0;
  }

  function scoresByUserIdFromValues(firstScore, secondScore) {
    return {
      [userBySlot(1)?.id || 'player-1']: toNumber(firstScore),
      [userBySlot(2)?.id || 'player-2']: toNumber(secondScore)
    };
  }

  function mapPlayers(rows) {
    const byId = new Map();
    (rows || []).forEach((row) => {
      const name = row.player_name || row.name;
      if (!name) return;
      const id = String(row.id || playerIdForName(name));
      byId.set(id, { id, name, position: row.position || row.pos || '—', vibe: row.vibe || '' });
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

  function ownerSideKey(ownerUserId) {
    const owner = users().find((user) => String(user.id) === String(ownerUserId));
    return sideKeyForSlot(owner?.rivalrySlot || owner?.rivalry_slot);
  }

  function mapPicksForGame(game, picks, playerLookup) {
    const bySide = { [SIDE_ONE]: [], [SIDE_TWO]: [] };
    const byUserId = users().reduce((acc, user) => {
      acc[user.id] = [];
      return acc;
    }, {});

    sortPicks(picks || [])
      .filter((pick) => Number(pick.game_id) === Number(game.id))
      .forEach((pick) => {
        const ownerUserId = String(pick.owner_user_id || '').trim();
        const sideKey = pick.owner ? String(pick.owner) : ownerSideKey(ownerUserId);
        const owner = users().find((user) => String(user.id) === ownerUserId) || userBySlot(sideIndexForKey(sideKey) + 1);
        const name = pick.player_name || '';
        const fallbackId = playerIdForName(name);
        const playerId = playerLookup.get(String(name).toLowerCase()) || playerLookup.get(String(pick.player_id || '')) || fallbackId;
        const normalizedPick = {
          id: pick.id ? String(pick.id) : '',
          playerId,
          playerName: name,
          player: name,
          goals: toNumber(pick.goals),
          assists: toNumber(pick.assists),
          firstGoal: Boolean(game.first_goal_scorer && name === game.first_goal_scorer && toNumber(pick.goals) > 0),
          points: toNumber(pick.points, pickPoints(pick, game.first_goal_scorer)),
          ownerUserId: owner?.id || ownerUserId,
          owner_user_id: owner?.id || ownerUserId
        };
        if (sideKey === SIDE_TWO) bySide[SIDE_TWO].push(normalizedPick);
        else bySide[SIDE_ONE].push(normalizedPick);
        if (owner?.id) byUserId[owner.id] = (byUserId[owner.id] || []).concat(normalizedPick);
      });

    return { bySide, byUserId };
  }

  function winnerSideFromUserId(userId) {
    const winner = users().find((user) => String(user.id) === String(userId));
    if (!winner) return '';
    return sideKeyForSlot(winner.rivalrySlot || winner.rivalry_slot);
  }

  function mapGames(rows, picks, playerLookup, scoresByGame) {
    return sortGames(rows || [])
      .filter((row) => row && row.status !== 'Hidden' && isFinalGame(row))
      .map((row) => {
        const normalizedScores = normalizedScoreByUserId(scoresByGame[String(row.id)] || []);
        const firstScore = scoreForUser(userBySlot(1), normalizedScores);
        const secondScore = scoreForUser(userBySlot(2), normalizedScores);
        const winnerSide = row.winner_user_id ? winnerSideFromUserId(row.winner_user_id) : (firstScore > secondScore ? SIDE_ONE : secondScore > firstScore ? SIDE_TWO : 'Tie');
        const firstGoal = row.first_goal_scorer ? [`First goal: ${row.first_goal_scorer}`] : [];
        const gameType = row.game_type || 'Regular Season';
        const mappedPicks = mapPicksForGame(row, picks, playerLookup);

        return {
          id: String(row.id),
          seasonId: String(row.season_id),
          season_id: String(row.season_id),
          displayNumber: row.game_number ?? row.display_number ?? '',
          display_number: row.game_number ?? row.display_number ?? '',
          date: row.game_date || row.date || '',
          opponent: row.opponent || '',
          firstPick: row.first_picker || row.first_picker_user_id || '',
          firstPickerUserId: row.first_picker_user_id || '',
          first_picker_user_id: row.first_picker_user_id || '',
          firstGoalScorer: row.first_goal_scorer || '',
          first_goal_scorer: row.first_goal_scorer || '',
          title: gameTitle(row),
          gameType,
          game_type: gameType,
          playoff: isPlayoffGame(row),
          firstScore,
          secondScore,
          scoresByUserId: scoresByUserIdFromValues(firstScore, secondScore),
          winner: winnerSide || 'Tie',
          winnerUserId: row.winner_user_id || '',
          winner_user_id: row.winner_user_id || '',
          summary: `${gameTitle(row)} finished ${firstScore}-${secondScore}.`,
          tags: [gameType, winnerSide === 'Tie' ? 'Tie' : `${winnerSide} win`].filter(Boolean),
          moments: firstGoal.length ? firstGoal : [`${winnerSide === 'Tie' ? 'Tie game' : `${winnerSide} took the result`}`],
          picks: mappedPicks.bySide,
          picksByUserId: mappedPicks.byUserId
        };
      });
  }

  function mapSeasons(rows, currentSeasonId, totalsBySeason) {
    return sortSeasons(rows || []).map((row) => {
      const normalizedTotals = normalizedScoreByUserId(totalsBySeason[String(row.id)] || [], 'total_points');
      const firstScore = scoreForUser(userBySlot(1), normalizedTotals);
      const secondScore = scoreForUser(userBySlot(2), normalizedTotals);
      return {
        id: String(row.id),
        label: seasonLabel(row),
        shortLabel: seasonShortLabel(row),
        isCurrent: String(row.id) === String(currentSeasonId),
        note: row.note || (row.is_active ? 'Current season.' : 'Completed season.'),
        firstScore,
        secondScore,
        totalsByUserId: scoresByUserIdFromValues(firstScore, secondScore),
        scoresByUserId: scoresByUserIdFromValues(firstScore, secondScore)
      };
    });
  }

  async function fetchHistoryData() {
    const db = await CR.getSupabase();
    const [profilesRes, seasonsRes] = await Promise.all([
      db.from('user_profiles').select('id, email, username, display_name, role, is_active, color_hex, color_label, rivalry_slot').eq('is_active', true),
      db.from('seasons').select('*')
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (seasonsRes.error) throw seasonsRes.error;

    historyUsers = normalizeProfiles(profilesRes.data || []);

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
    if (gameScoresRes.error) console.warn('History normalized game scores unavailable', gameScoresRes.error);
    if (seasonTotalsRes.error) console.warn('History normalized season totals unavailable', seasonTotalsRes.error);

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
    const scoresByGame = rowsByKey(gameScoresRes.error ? [] : gameScoresRes.data || [], 'game_id');
    const totalsBySeason = rowsByKey(seasonTotalsRes.error ? [] : seasonTotalsRes.data || [], 'season_id');

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