window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeId(value) {
    return String(value || '').trim();
  }

  function getUsers(raw) {
    const source = Array.isArray(raw?.users) && raw.users.length ? raw.users : [];
    return source.slice(0, 2).map((user, index) => ({
      ...user,
      id: String(user.id || '').trim(),
      displayName: user.displayName || user.display_name || user.username || `Player ${index + 1}`,
      display_name: user.displayName || user.display_name || user.username || `Player ${index + 1}`,
      themeClass: user.themeClass || user.theme_class || (index === 0 ? 'owner-primary' : 'owner-secondary'),
      avatarClass: user.avatarClass || user.avatar_class || (index === 0 ? 'avatar-primary' : 'avatar-secondary')
    })).filter((user) => user.id);
  }

  function userAt(users, index) {
    return users[index] || { id: `player-${index + 1}`, displayName: `Player ${index + 1}`, themeClass: index === 0 ? 'owner-primary' : 'owner-secondary' };
  }

  function userName(users, index) {
    const user = userAt(users, index);
    return user.displayName || user.display_name || user.username || `Player ${index + 1}`;
  }

  function scoreFor(row, users, index) {
    const user = userAt(users, index);
    const sideValue = index === 1 ? row?.secondScore : row?.firstScore;
    return toNumber(row?.totalsByUserId?.[user.id] ?? row?.scoresByUserId?.[user.id] ?? sideValue);
  }

  function normalizeSeason(season, users) {
    const firstUser = userAt(users, 0);
    const secondUser = userAt(users, 1);
    const sourceTotals = season.totalsByUserId || season.scoresByUserId || {};
    const firstScore = toNumber(sourceTotals[firstUser.id] ?? season.firstScore);
    const secondScore = toNumber(sourceTotals[secondUser.id] ?? season.secondScore);
    const totalsByUserId = {
      [firstUser.id]: firstScore,
      [secondUser.id]: secondScore
    };
    return {
      ...season,
      id: normalizeId(season.id),
      firstScore,
      secondScore,
      totalsByUserId,
      scoresByUserId: totalsByUserId
    };
  }

  function scoreMapFromPicks(picks, users) {
    return users.reduce((acc, user) => {
      acc[user.id] = (picks?.[user.id] || []).reduce((total, pick) => total + toNumber(pick.points), 0);
      return acc;
    }, {});
  }

  function winnerName(game, users, scoresByUserId) {
    const winnerId = String(game?.winnerUserId || game?.winner_user_id || '').trim();
    if (winnerId) {
      const user = users.find((item) => item.id === winnerId);
      if (user) return user.displayName || user.display_name || user.username || 'Player';
    }
    const first = toNumber(scoresByUserId?.[userAt(users, 0).id]);
    const second = toNumber(scoresByUserId?.[userAt(users, 1).id]);
    if (first > second) return userName(users, 0);
    if (second > first) return userName(users, 1);
    return 'Tie';
  }

  function isPlayoffGame(game) {
    const typeText = String(game?.gameType || game?.game_type || '').trim().toLowerCase();
    return Boolean(game?.playoff) || typeText.includes('playoff');
  }

  function playerMap(players) {
    return new Map((players || []).map((player) => [String(player.id), player]));
  }

  function enrichPick(pick, map) {
    const player = map.get(String(pick.playerId || pick.player_id || '')) || { name: pick.playerName || pick.player || '—', position: pick.position || '—', vibe: pick.vibe || '' };
    return {
      ...pick,
      playerName: pick.playerName || pick.player || player.name,
      position: pick.position || player.position || '—',
      vibe: pick.vibe || player.vibe || '',
      goals: toNumber(pick.goals),
      assists: toNumber(pick.assists),
      points: toNumber(pick.points)
    };
  }

  function enrichGame(game, map, users) {
    const picks = users.reduce((acc, user) => {
      acc[user.id] = (game.picksByUserId?.[user.id] || []).map((pick) => enrichPick(pick, map));
      return acc;
    }, {});
    const derivedScores = scoreMapFromPicks(picks, users);
    const sourceScores = game.scoresByUserId || {};
    const scoresByUserId = users.reduce((acc, user, index) => {
      const sideValue = index === 1 ? game.secondScore : game.firstScore;
      const hasSource = Object.prototype.hasOwnProperty.call(sourceScores, user.id);
      const hasDerived = Object.prototype.hasOwnProperty.call(derivedScores, user.id);
      acc[user.id] = hasSource ? toNumber(sourceScores[user.id]) : hasDerived ? toNumber(derivedScores[user.id]) : toNumber(sideValue);
      return acc;
    }, {});
    const firstScore = toNumber(scoresByUserId[userAt(users, 0).id]);
    const secondScore = toNumber(scoresByUserId[userAt(users, 1).id]);
    const gameWinner = winnerName(game, users, scoresByUserId);

    return {
      ...game,
      seasonId: normalizeId(game.seasonId || game.season_id),
      season_id: normalizeId(game.seasonId || game.season_id),
      scoresByUserId,
      picksByUserId: picks,
      playoff: isPlayoffGame(game),
      firstScore,
      secondScore,
      winner: gameWinner,
      margin: Math.abs(firstScore - secondScore),
      picks,
      isOneGoal: Math.abs(firstScore - secondScore) <= 1,
      resultLabel: gameWinner === 'Tie' ? 'Tie' : `${gameWinner} wins`,
      tagSummary: (game.tags || []).slice(0, 3).join(' • ')
    };
  }

  function buildSeasonSummary(season, seasonGames, users) {
    const first = userName(users, 0);
    const second = userName(users, 1);
    const firstScore = scoreFor(season, users, 0) || seasonGames.reduce((total, game) => total + scoreFor(game, users, 0), 0);
    const secondScore = scoreFor(season, users, 1) || seasonGames.reduce((total, game) => total + scoreFor(game, users, 1), 0);
    const totals = { first: 0, second: 0, playoffFirst: 0, playoffSecond: 0 };
    const moments = [];

    seasonGames.forEach((game) => {
      const gameWinner = winnerName(game, users, game.scoresByUserId);
      if (gameWinner === first) totals.first += 1;
      if (gameWinner === second) totals.second += 1;
      if (game.playoff && gameWinner === first) totals.playoffFirst += 1;
      if (game.playoff && gameWinner === second) totals.playoffSecond += 1;
      (game.moments || []).slice(0, 1).forEach((moment) => moments.push(moment));
    });

    const bestGame = seasonGames.slice().sort((a, b) => Math.abs(scoreFor(b, users, 0) - scoreFor(b, users, 1)) - Math.abs(scoreFor(a, users, 0) - scoreFor(a, users, 1)))[0] || null;
    const closestGame = seasonGames.slice().sort((a, b) => Math.abs(scoreFor(a, users, 0) - scoreFor(a, users, 1)) - Math.abs(scoreFor(b, users, 0) - scoreFor(b, users, 1)))[0] || null;

    return {
      seasonId: normalizeId(season.id),
      id: normalizeId(season.id),
      label: season.label,
      isCurrent: season.isCurrent,
      note: season.note,
      firstScore,
      secondScore,
      totalsByUserId: {
        [userAt(users, 0).id]: firstScore,
        [userAt(users, 1).id]: secondScore
      },
      scoresByUserId: {
        [userAt(users, 0).id]: firstScore,
        [userAt(users, 1).id]: secondScore
      },
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
      const raw = clone(rawInput || {});
      const users = getUsers(raw);
      const seasons = (raw.seasons || []).map((season) => normalizeSeason(season, users));
      const players = raw.players || [];
      const map = playerMap(players);
      const games = (raw.games || []).map((game) => enrichGame(game, map, users)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const currentSeasonId = normalizeId(raw.currentSeasonId || seasons.find((season) => season.isCurrent)?.id || seasons[0]?.id || '');
      const seasonGames = Object.fromEntries(seasons.map((season) => [season.id, games.filter((game) => normalizeId(game.seasonId || game.season_id) === season.id)]));
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
