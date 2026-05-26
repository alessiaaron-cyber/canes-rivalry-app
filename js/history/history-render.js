window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const escapeHtml = CR.ui?.escapeHtml || ((value) => String(value ?? ''));
  const HISTORY_DEBUG_LABELS = false;

  function pickLine(pick) {
    const points = Number(pick.points || 0);
    return `${pick.playerName} • ${pick.goals}G ${pick.assists}A • ${points} pts`;
  }

  function getUser(data, index) {
    return data?.users?.[index] || CR.identity?.getUser?.(index, data) || {};
  }

  function userName(data, index) {
    const user = getUser(data, index);
    return user.displayName || user.display_name || user.username || `Player ${index + 1}`;
  }

  function userId(data, index) {
    return String(getUser(data, index).id || '').trim();
  }

  function userThemeClass(data, indexOrWinner) {
    if (typeof indexOrWinner === 'number') return getUser(data, indexOrWinner).themeClass || (indexOrWinner === 1 ? 'owner-secondary' : 'owner-primary');
    const winner = String(indexOrWinner || '');
    const index = (data?.users || []).findIndex((user) => String(user.id || user.displayName || user.display_name || user.username) === winner);
    return index === 1 ? 'owner-secondary' : 'owner-primary';
  }

  function gameScores(data, game) {
    return {
      first: Number(game?.scoresByUserId?.[userId(data, 0)] ?? game?.firstScore ?? 0),
      second: Number(game?.scoresByUserId?.[userId(data, 1)] ?? game?.secondScore ?? 0)
    };
  }

  function rowScores(data, row) {
    return {
      first: Number(row?.firstScore ?? row?.totalsByUserId?.[userId(data, 0)] ?? row?.scoresByUserId?.[userId(data, 0)] ?? 0),
      second: Number(row?.secondScore ?? row?.totalsByUserId?.[userId(data, 1)] ?? row?.scoresByUserId?.[userId(data, 1)] ?? 0)
    };
  }

  function picksFor(data, game, index) {
    return game.picks?.[userId(data, index)] || game.picksByUserId?.[userId(data, index)] || [];
  }

  function winnerDisplayName(data, winner) {
    const value = String(winner || '').trim();
    if (!value || value.toLowerCase() === 'tie') return 'Tie';
    const user = (data?.users || []).find((item) => String(item.id) === value || String(item.displayName || item.display_name || item.username) === value);
    return user?.displayName || user?.display_name || user?.username || value;
  }

  function winnerThemeClass(data, winner) {
    const value = String(winner || '').trim();
    if (!value || value.toLowerCase() === 'tie') return 'winner-tie';
    const index = (data?.users || []).findIndex((item) => String(item.id) === value || String(item.displayName || item.display_name || item.username) === value);
    if (index === 0) return 'winner-primary';
    if (index === 1) return 'winner-secondary';
    return CR.identity?.winnerClass?.(winner, data) || 'winner-tie';
  }

  function outcomeText(data, game) {
    const winnerId = game.winnerUserId || game.winner_user_id || game.winner;
    if (!winnerId || String(winnerId).toLowerCase() === 'tie') return 'Even finish';
    return `${winnerDisplayName(data, winnerId)} won`;
  }

  function seasonWinner(data, totals) {
    if (totals.first > totals.second) return userId(data, 0);
    if (totals.second > totals.first) return userId(data, 1);
    return 'Tie';
  }

  function seasonOutcomeText(data, winner, isCurrent) {
    if (String(winner || '').toLowerCase() === 'tie') return isCurrent ? 'Tied' : 'Season tied';
    return isCurrent ? `${winnerDisplayName(data, winner)} leads` : `${winnerDisplayName(data, winner)} won`;
  }

  function leaderClassFromRecord(data, recordText = '') {
    const match = String(recordText).match(/(\d+)\s*[–-]\s*(\d+)/);
    if (!match) return 'leader-tie';
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > second) return userThemeClass(data, 0).replace('owner-', 'leader-');
    if (second > first) return userThemeClass(data, 1).replace('owner-', 'leader-');
    return 'leader-tie';
  }

  function highlightCopy(data, card) {
    const owner = card.owner ? winnerDisplayName(data, card.owner) : '';
    return owner ? `${owner} ${card.copy}` : card.copy;
  }

  function ownerPerformersOnly(data, performers = []) {
    return [userId(data, 0), userId(data, 1)]
      .map((id) => performers.find((player) => String(player.owner || '').toLowerCase() === String(id).toLowerCase()))
      .filter(Boolean);
  }

  function gameLabel(game) {
    return [game?.date, game?.opponent ? `vs ${game.opponent}` : ''].filter(Boolean).join(' • ') || game?.title || 'Game';
  }

  function hasScoredResult(data, game) {
    const scores = gameScores(data, game);
    return scores.first + scores.second > 0;
  }

  function debugSummary(data) {
    if (!HISTORY_DEBUG_LABELS) return '';
    const allGames = data?.games || [];
    const scopedGames = data?.gameLog || data?.selectedGames || [];
    const scoredGames = scopedGames.filter((game) => hasScoredResult(data, game));
    const gamesWithPicks = scopedGames.filter((game) => picksFor(data, game, 0).length || picksFor(data, game, 1).length).length;
    const winnerLeaks = allGames.filter((game) => ['first', 'second'].includes(String(game.winner || '').toLowerCase())).length;
    const source = data?.source || CR.historySource || 'model';
    const users = [userName(data, 0), userName(data, 1)].join(' / ');
    const status = winnerLeaks ? ` • Needs winner cleanup: ${winnerLeaks}` : ' • OK';
    return `<div class="history-debug-label" style="margin-top:10px;padding:8px 10px;border:1px dashed rgba(148,163,184,.7);border-radius:12px;font-size:12px;line-height:1.35;color:#64748b;background:rgba(248,250,252,.85);">Verify: ${escapeHtml(source)} • Users: ${escapeHtml(users)} • Games: ${escapeHtml(String(allGames.length))} final / ${escapeHtml(String(scoredGames.length))} scored • Picks: ${escapeHtml(String(gamesWithPicks))} games${escapeHtml(status)}</div>`;
  }

  function cardDebugLabel(data, card) {
    if (!HISTORY_DEBUG_LABELS) return '';
    const scopedGames = data?.gameLog || data?.selectedGames || [];
    const scoredCount = scopedGames.filter((game) => hasScoredResult(data, game)).length;
    const pickGameCount = scopedGames.filter((game) => picksFor(data, game, 0).length || picksFor(data, game, 1).length).length;
    const label = String(card?.label || '').toLowerCase();
    let source = `${scoredCount} scored games`;
    if (label.includes('games logged')) source = `${scoredCount} scored games`;
    if (label.includes('first-goal')) source = `${pickGameCount} pick-data games`;
    return `<div class="history-debug-card-label" style="margin-top:8px;font-size:11px;line-height:1.3;color:#94a3b8;">Verify source: ${escapeHtml(source)}</div>`;
  }

  function seasonFeaturedResult(data, summary, games) {
    const scoredGames = (games || []).filter((game) => hasScoredResult(data, game)).map((game) => {
      const scores = gameScores(data, game);
      return { ...game, scores, label: gameLabel(game), margin: Math.abs(scores.first - scores.second), combined: scores.first + scores.second };
    });
    if (!scoredGames.length) return '';
    const playoff = scoredGames.find((game) => game.playoff);
    if (playoff) return `${playoff.label}: playoff result (${playoff.scores.first}-${playoff.scores.second}).`;
    const biggest = scoredGames.slice().sort((a, b) => b.margin - a.margin)[0];
    if (biggest && biggest.margin >= 3) {
      const winner = biggest.scores.first === biggest.scores.second ? 'Tie' : biggest.scores.first > biggest.scores.second ? userName(data, 0) : userName(data, 1);
      return `${biggest.label}: biggest margin (${winner} +${biggest.margin}).`;
    }
    const wildest = scoredGames.slice().sort((a, b) => b.combined - a.combined)[0];
    return `${wildest.label}: highest combined score (${wildest.combined} pts).`;
  }

  function currentSeasonFeaturedResult(data) {
    const seasonData = data.hqSeasonData || data;
    const board = seasonData.seasonBoard || {};
    const seasonId = String(seasonData.currentSeasonId || data.currentSeasonId || data.selectedSeason?.id || '').trim();
    const season = (data.seasons || []).find((item) => String(item.id) === seasonId) || data.selectedSeason || null;
    const summary = (data.seasonSummaries || []).find((item) => String(item.seasonId || item.id) === seasonId) || { seasonId, id: seasonId, label: board.seasonLabel, recordText: board.recordText, bestGameTitle: board.bestGameTitle };
    const games = data.seasonGames?.[seasonId] || seasonData.gameLog || seasonData.selectedGames || data.gameLog || [];
    return seasonFeaturedResult(data, summary, games) || board.bestGameTitle || '';
  }

  function momentumInitial(data, winner) {
    if (String(winner || '').toLowerCase() === 'tie') return 'T';
    return String(winnerDisplayName(data, winner) || '').slice(0, 1);
  }

  function renderRootShell() {
    return `<div class="history-shell"><div id="historyPanelHq"></div><div id="historyPanelSeasons" hidden></div><div id="historyPanelAllGames" hidden></div><div id="historyAdminLayer"></div></div>`;
  }

  function renderHighlights(data) {
    const seasonData = data.hqSeasonData || data;
    const cards = (data.highlights?.cards || []).slice(0, 4);
    const performers = ownerPerformersOnly(data, seasonData.playerSpotlights || []);
    const performerCards = performers.map((player) => `<article class="rivalry-highlight-item history-highlight-performer"><div class="eyebrow ${userThemeClass(data, player.owner)}">${escapeHtml(player.position || 'Player')} • ${escapeHtml(winnerDisplayName(data, player.owner))} standout</div><div class="rivalry-highlight-value">${escapeHtml(player.name)}</div><p>Picked ${escapeHtml(String(player.gamesPicked || 0))} times • Best game: ${escapeHtml(String(player.bestGame?.points || 0))} pts</p></article>`).join('');
    return `<section class="panel-card rivalry-highlights-card"><div class="history-section-head"><div><div class="eyebrow">Highlights</div><h3>Rivalry notes</h3></div></div>${debugSummary(data)}<div class="rivalry-highlight-grid compact-grid">${cards.map((card) => `<article class="rivalry-highlight-item panel-card"><div class="eyebrow ${card.owner ? userThemeClass(data, card.owner) : ''}">${escapeHtml(card.label)}</div><div class="rivalry-highlight-value">${escapeHtml(card.value)}</div><p>${escapeHtml(card.meta || highlightCopy(data, card))}</p>${cardDebugLabel(data, card)}</article>`).join('')}${performerCards}</div></section>`;
  }

  CR.historyRender = { renderHighlights };
})();