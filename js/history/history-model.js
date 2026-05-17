window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const pointsForPick = (pick) => ((pick.goals || 0) * 2) + (pick.assists || 0) + (pick.firstGoal ? 2 : 0);

  const FALLBACK_USERS = [
    { username: 'player-1', displayName: 'Player 1', themeClass: 'owner-primary', avatarClass: 'avatar-primary', scoreKey: 'player-1', profileKey: 'player-1' },
    { username: 'player-2', displayName: 'Player 2', themeClass: 'owner-secondary', avatarClass: 'avatar-secondary', scoreKey: 'player-2', profileKey: 'player-2' }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getUsers(raw) {
    const identityUsers = CR.identity?.getUsers?.(raw);
    const source = Array.isArray(identityUsers) && identityUsers.length
      ? identityUsers
      : (Array.isArray(raw?.users) && raw.users.length ? raw.users : FALLBACK_USERS);

    return source.map((user, index) => ({
      ...user,
      username: user.username || user.displayName || FALLBACK_USERS[index]?.username || `Player ${index + 1}`,
      displayName: user.displayName || user.display_name || user.username || FALLBACK_USERS[index]?.displayName || `Player ${index + 1}`,
      display_name: user.displayName || user.display_name || user.username || FALLBACK_USERS[index]?.displayName || `Player ${index + 1}`,
      themeClass: user.themeClass || user.theme_class || FALLBACK_USERS[index]?.themeClass || (index === 0 ? 'owner-primary' : 'owner-secondary'),
      avatarClass: user.avatarClass || user.avatar_class || FALLBACK_USERS[index]?.avatarClass || (index === 0 ? 'avatar-primary' : 'avatar-secondary'),
      scoreKey: user.scoreKey || user.score_key || user.id || user.username || FALLBACK_USERS[index]?.scoreKey || `player-${index + 1}`,
      profileKey: user.profileKey || user.profile_key || user.id || FALLBACK_USERS[index]?.profileKey || `player-${index + 1}`,
      profile_key: user.profileKey || user.profile_key || user.id || FALLBACK_USERS[index]?.profileKey || `player-${index + 1}`
    }));
  }

  function scoreFor(game, users, index) {
    if (index === 0 && game?.firstScore !== undefined) return Number(game.firstScore || 0);
    if (index === 1 && game?.secondScore !== undefined) return Number(game.secondScore || 0);
    const user = users[index] || FALLBACK_USERS[index];
    const userId = String(user?.id || '').trim();
    const profileKey = String(user?.profileKey || user?.profile_key || '').trim();
    if (userId && game?.scoresByUserId?.[userId] !== undefined) return Number(game.scoresByUserId[userId] || 0);
    if (profileKey && game?.scoresByUserId?.[profileKey] !== undefined) return Number(game.scoresByUserId[profileKey] || 0);
    return 0;
  }

  function pickKeyOptions(user, index) {
    return [
      user?.profileKey,
      user?.profile_key,
      user?.id,
      user?.scoreKey,
      user?.score_key,
      user?.username,
      user?.displayName,
      user?.display_name,
      index === 0 ? 'first' : 'second'
    ].filter(Boolean);
  }

  function winner(game, users = FALLBACK_USERS) {
    if (String(game?.winner || '').toLowerCase() === 'tie') return 'Tie';
    const matched = users.find((user, index) => pickKeyOptions(user, index).map((key) => String(key).toLowerCase()).includes(String(game?.winner || '').toLowerCase()));
    if (matched) return matched.displayName || matched.username || 'Player';
    const firstScore = scoreFor(game, users, 0);
    const secondScore = scoreFor(game, users, 1);
    if (firstScore > secondScore) return users[0]?.displayName || users[0]?.username || 'Player 1';
    if (secondScore > firstScore) return users[1]?.displayName || users[1]?.username || 'Player 2';
    return 'Tie';
  }

  function isPlayoffGame(game) {
    const typeText = String(game?.gameType || game?.game_type || '').trim().toLowerCase();
    return Boolean(game?.playoff) || typeText.includes('playoff');
  }

  function playerMap(players) {
    return new Map((players || []).map((player) => [player.id, player]));
  }

  function enrichGame(game, map, users) {
    const picks = users.slice(0, 2).reduce((acc, user, index) => {
      const targetKey = user.displayName || user.username || (index === 0 ? 'Player 1' : 'Player 2');
      const sourceKey = pickKeyOptions(user, index).find((key) => Array.isArray(game.picks?.[key]));

      acc[targetKey] = (game.picks?.[sourceKey] || []).map((pick) => {
        const player = map.get(pick.playerId) || { name: pick.playerName || pick.playerId, position: '—', vibe: '' };
        return {
          ...pick,
          playerName: player.name,
          position: player.position,
          vibe: player.vibe,
          points: pointsForPick(pick)
        };
      });

      return acc;
    }, {});

    const firstScore = scoreFor(game, users, 0);
    const secondScore = scoreFor(game, users, 1);
    const gameWinner = winner(game, users);

    return {
      ...game,
      firstScore,
      secondScore,
      playoff: isPlayoffGame(game),
      winner: gameWinner,
      margin: Math.abs(firstScore - secondScore),
      picks,
      isOneGoal: Math.abs(firstScore - secondScore) <= 1,
      resultLabel: gameWinner === 'Tie' ? 'Tie' : `${gameWinner} wins`,
      tagSummary: (game.tags || []).slice(0, 3).join(' • ')
    };
  }

  function buildSeasonSummary(season, seasonGames, users) {
    const first = users[0]?.displayName || users[0]?.username || 'Player 1';
    const second = users[1]?.displayName || users[1]?.username || 'Player 2';
    const totals = { first: 0, second: 0, playoffFirst: 0, playoffSecond: 0 };
    const moments = [];

    seasonGames.forEach((game) => {
      const gameWinner = winner(game, users);
      if (gameWinner === first) totals.first += 1;
      if (gameWinner === second) totals.second += 1;
      if (game.playoff && gameWinner === first) totals.playoffFirst += 1;
      if (game.playoff && gameWinner === second) totals.playoffSecond += 1;
      (game.moments || []).slice(0, 1).forEach((moment) => moments.push(moment));
    });

    const bestGame = seasonGames.slice().sort((a, b) => Math.abs(scoreFor(b, users, 0) - scoreFor(b, users, 1)) - Math.abs(scoreFor(a, users, 0) - scoreFor(a, users, 1)))[0] || null;
    const closestGame = seasonGames.slice().sort((a, b) => Math.abs(scoreFor(a, users, 0) - scoreFor(a, users, 1)) - Math.abs(scoreFor(b, users, 0) - Math.abs(scoreFor(a, users, 0) - scoreFor(a, users, 1))))[0] || null;

    return {
      seasonId: season.id,
      label: season.label,
      isCurrent: season.isCurrent,
      note: season.note,
      totals: {
        [first]: totals.first,
        [second]: totals.second,
        playoffFirst: totals.playoffFirst,
        playoffSecond: totals.playoffSecond
      },
      recordText: `${totals.first}–${totals.second}`,
      playoffText: `${totals.playoffFirst}–${totals.playoffSecond}`,
      bestMoment: moments[0] || 'Season still writing itself.',
      bestGameTitle: bestGame?.title || '—',
      closestGameTitle: closestGame?.title || '—'
    };
  }

  CR.historyModel = {
    build(rawInput) {
      const raw = clone(rawInput || CR.historyMockData || {});
      const users = getUsers(raw);
      const seasons = raw.seasons || [];
      const players = raw.players || [];
      const map = playerMap(players);
      const games = (raw.games || []).map((game) => enrichGame(game, map, users)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const currentSeasonId = raw.currentSeasonId || seasons.find((season) => season.isCurrent)?.id || seasons[0]?.id || '';
      const seasonGames = Object.fromEntries(seasons.map((season) => [season.id, games.filter((game) => game.seasonId === season.id)]));
      const seasonSummaries = seasons.map((season) => buildSeasonSummary(season, seasonGames[season.id] || [], users));

      return {
        currentSeasonId,
        users,
        seasons,
        games,
        seasonGames,
        seasonSummaries
      };
    }
  };
})();