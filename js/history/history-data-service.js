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
    return normalizeStatus(row?.status) === 'final';
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

  function normalizedUsers() {
    const source = CR.identity?.getUsers?.() || [];
    const users = source.slice(0, 2).map((user, index) => ({
      ...user,
      id: String(user.id || '').trim(),
      displayName: user.displayName || user.display_name || user.username || `Player ${index + 1}`,
      display_name: user.displayName || user.display_name || user.username || `Player ${index + 1}`,
      rivalrySlot: toNumber(user.rivalrySlot || user.rivalry_slot, index + 1),
      rivalry_slot: toNumber(user.rivalrySlot || user.rivalry_slot, index + 1),
      themeClass: user.themeClass || user.theme_class || (index === 0 ? 'owner-primary' : 'owner-secondary'),
      avatarClass: user.avatarClass || user.avatar_class || (index === 0 ? 'avatar-primary' : 'avatar-secondary')
    })).filter((user) => user.id);

    return users.length ? users : [
      { id: 'player-1', displayName: 'Player 1', display_name: 'Player 1', rivalrySlot: 1, rivalry_slot: 1, themeClass: 'owner-primary', avatarClass: 'avatar-primary' },
      { id: 'player-2', displayName: 'Player 2', display_name: 'Player 2', rivalrySlot: 2, rivalry_slot: 2, themeClass: 'owner-secondary', avatarClass: 'avatar-secondary' }
    ];
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

  function scoreMap(rows = [], valueKey = 'points') {
    return rows.reduce((acc, row) => {
      const userId = String(row.user_id || '').trim();
      if (userId) acc[userId] = toNumber(row[valueKey]);
      return acc;
    }, {});
  }

  function scoreForUser(scoresByUserId, user) {
    return toNumber(scoresByUserId?.[String(user?.id || '')]);
  }

  function userById(users, userId) {
    const lookup = String(userId || '').trim();
    return users.find((user) => String(user.id || '') === lookup) || null;
  }

  function winnerUserIdForGame(row, scoresByUserId, users) {
    if (row.winner_user_id && userById(users, row.winner_user_id)) return String(row.winner_user_id);
    const first = scoreForUser(scoresByUserId, users[0]);
    const second = scoreForUser(scoresByUserId, users[1]);
    if (first > second) return users[0]?.id || '';
    if (second > first) return users[1]?.id || '';
    return '';
  }

  function displayNameForUser(users, userId) {
    const user = userById(users, userId);
    return user?.displayName || user?.display_name || user?.username || '';
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

  function emptyUserMap(users, valueFactory) {
    return users.reduce((acc, user) => {
      acc[user.id] = valueFactory();
      return acc;
    }, {});
  }

  function mapPicksForGame(game, picks, playerLookup, users) {
    return sortPicks(picks || [])
      .filter((pick) => Number(pick.game_id) === Number(game.id))
      .reduce((acc, pick) => {
        const ownerUserId = String(pick.owner_user_id || '').trim();
        const owner = userById(users, ownerUserId);
        const name = pick.player_name || '';
        if (!owner || !name) return acc;
        const fallbackId = playerIdForName(name);
        const playerId = playerLookup.get(String(name).toLowerCase()) || playerLookup.get(String(pick.player_id || '')) || fallbackId;
        acc[owner.id] = acc[owner.id] || [];
        acc[owner.id].push({
          id: pick.id ? String(pick.id) : '',
          pickSlot: toNumber(pick.pick_slot),
          pick_slot: toNumber(pick.pick_slot),
          playerId,
          playerName: name,
          player: name,
          goals: toNumber(pick.goals),
          assists: toNumber(pick.assists),
          firstGoal: Boolean(game.first_goal_scorer && name === game.first_goal_scorer && toNumber(pick.goals) > 0),
          points: toNumber(pick.points, pickPoints(pick, game.first_goal_scorer)),
          ownerUserId: owner.id,
          owner_user_id: owner.id
        });
        return acc;
      }, emptyUserMap(users, () => []));
  }

  function mapGames(rows, picks, playerLookup, scoresByGame, users) {
    return sortGames(rows || [])
      .filter((row) => row && normalizeStatus(row.status) !== 'hidden' && isFinalGame(row))
      .map((row) => {
        const scoresByUserId = scoreMap(scoresByGame[String(row.id)] || []);
        const winnerUserId = winnerUserIdForGame(row, scoresByUserId, users);
        const winnerName = winnerUserId ? displayNameForUser(users, winnerUserId) : 'Tie';
        const firstGoal = row.first_goal_scorer ? [`First goal: ${row.first_goal_scorer}`] : [];
        const gameType = row.game_type || 'Regular Season';
        const title = gameTitle(row);

        return {
          id: String(row.id),
          displayNumber: row.game_number ?? row.display_number ?? '',
          display_number: row.game_number ?? row.display_number ?? '',
          seasonId: String(row.season_id || ''),
          season_id: String(row.season_id || ''),
          date: row.game_date || row.date || '',
          opponent: row.opponent || '',
          firstPickerUserId: String(row.first_picker_user_id || ''),
          first_picker_user_id: String(row.first_picker_user_id || ''),
          firstPick: String(row.first_picker_user_id || ''),
          firstGoalScorer: row.first_goal_scorer || '',
          first_goal_scorer: row.first_goal_scorer || '',
          title,
          gameType,
          game_type: gameType,
          playoff: isPlayoffGame(row),
          scoresByUserId,
          picksByUserId: mapPicksForGame(row, picks, playerLookup, users),
          winnerUserId,
          winner_user_id: winnerUserId,
          winner: winnerUserId || 'Tie',
          winnerDisplayName: winnerName,
          summary: `${title} finished ${scoreForUser(scoresByUserId, users[0])}-${scoreForUser(scoresByUserId, users[1])}.`,
          tags: [gameType, winnerUserId ? `${winnerName} win` : 'Tie'].filter(Boolean),
          moments: firstGoal.length ? firstGoal : [`${winnerUserId ? `${winnerName} took the result` : 'Tie game'}`]
        };
      });
  }

  function mapSeasons(rows, currentSeasonId, totalsBySeason, users) {
    return sortSeasons(rows || []).map((row) => {
      const totalsByUserId = scoreMap(totalsBySeason[String(row.id)] || [], 'total_points');
      return {
        id: String(row.id),
        label: seasonLabel(row),
        shortLabel: seasonShortLabel(row),
        isCurrent: String(row.id) === String(currentSeasonId),
        note: row.note || (row.is_active ? 'Current season.' : 'Completed season.'),
        totalsByUserId,
        scoresByUserId: totalsByUserId
      };
    });
  }

  async function fetchHistoryData() {
    const db = await CR.getSupabase();
    const users = normalizedUsers();

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
    const scoresByGame = rowsByKey(gameScoresRes.data || [], 'game_id');
    const totalsBySeason = rowsByKey(seasonTotalsRes.data || [], 'season_id');

    return {
      source: 'supabase',
      currentSeasonId,
      users,
      seasons: mapSeasons(seasons, currentSeasonId, totalsBySeason, users),
      players,
      games: mapGames(gamesRows, picksRows, playerLookup, scoresByGame, users)
    };
  }

  CR.historyDataService = { fetchHistoryData };
})();