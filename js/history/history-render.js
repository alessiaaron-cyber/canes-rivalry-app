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

  function renderBoard(data) {
    const board = data.allTimeBoard || {};
    return `<section class="panel-card rivalry-board-card history-legacy-card"><div class="rivalry-board-topline"><span class="eyebrow">All-Time Rivalry</span></div><h2 class="rivalry-board-title">${escapeHtml(board.lead || 'Rivalry tied')}</h2><div class="history-scoreboard-banner"><div class="history-scoreboard-grid"><div class="history-scoreboard-team"><span class="history-scoreboard-name ${userThemeClass(data, 0)}">${escapeHtml(userName(data, 0))}</span><strong>${escapeHtml(String(board.first ?? 0))}</strong></div><span class="history-scoreboard-divider" aria-hidden="true">—</span><div class="history-scoreboard-team is-right"><span class="history-scoreboard-name ${userThemeClass(data, 1)}">${escapeHtml(userName(data, 1))}</span><strong>${escapeHtml(String(board.second ?? 0))}</strong></div></div></div><p class="history-hero-copy">All completed season and game totals feed this card.</p></section>`;
  }

  function renderSeasonSnapshot(data) {
    const seasonData = data.hqSeasonData || data;
    const board = seasonData.seasonBoard || {};
    const leaderClass = leaderClassFromRecord(data, board.recordText);
    const featuredResult = currentSeasonFeaturedResult(data);
    return `<section class="panel-card history-hq-card"><div class="history-season-overview-topline history-hq-topline"><div><div class="eyebrow">Current Season</div><h3 class="history-hq-title">${escapeHtml(board.seasonLabel || 'Season')}</h3></div><button class="cr-button secondary" type="button" data-history-access="seasons">View All</button></div><div class="history-season-score-grid"><article class="rivalry-score-card"><div class="eyebrow ${userThemeClass(data, 0)}">${escapeHtml(userName(data, 0))}</div><div class="rivalry-score-value">${escapeHtml(String(board.first ?? 0))}</div></article><article class="rivalry-score-card"><div class="eyebrow ${userThemeClass(data, 1)}">${escapeHtml(userName(data, 1))}</div><div class="rivalry-score-value">${escapeHtml(String(board.second ?? 0))}</div></article></div><div class="history-season-meta-row"><span class="history-meta-pill history-record-pill ${leaderClass}">Record ${escapeHtml(board.recordText || '—')}</span><span class="history-meta-pill">${escapeHtml(board.recentText || 'Form still developing')}</span></div>${featuredResult ? `<p class="history-meta-note"><strong>Featured result:</strong> ${escapeHtml(featuredResult)}</p>` : ''}</section>`;
  }

  function renderMomentum(data) {
    const seasonData = data.hqSeasonData || data;
    const results = (seasonData.momentum || []).slice(0, 10);
    return `<section class="panel-card history-momentum-card"><div class="history-section-head"><div><div class="eyebrow">Momentum</div><h3>Last 10 results</h3></div></div><div class="history-momentum-strip">${results.map((item) => `<div class="history-momentum-node ${winnerThemeClass(data, item.winner)} ${item.playoff ? 'is-playoff' : ''}"><span>${escapeHtml(momentumInitial(data, item.winner))}</span></div>`).join('')}</div><p class="history-support-copy">${escapeHtml(data.highlights?.heater?.copy || 'Momentum is still shifting.')}</p></section>`;
  }

  function renderHighlights(data) {
    const seasonData = data.hqSeasonData || data;
    const cards = (data.highlights?.cards || []).slice(0, 4);
    const performers = ownerPerformersOnly(data, seasonData.playerSpotlights || []);
    const performerCards = performers.map((player) => `<article class="rivalry-highlight-item history-highlight-performer"><div class="eyebrow ${userThemeClass(data, player.owner)}">${escapeHtml(player.position || 'Player')} • ${escapeHtml(winnerDisplayName(data, player.owner))} standout</div><div class="rivalry-highlight-value">${escapeHtml(player.name)}</div><p>${escapeHtml(player.totalPoints)} pts • ${escapeHtml(player.clutch)}</p></article>`).join('');
    return `<section class="panel-card rivalry-highlights-card"><div class="history-section-head"><div><div class="eyebrow">Highlights</div><h3>Rivalry notes</h3></div></div>${debugSummary(data)}<div class="rivalry-highlight-grid compact-grid">${cards.map((card) => `<article class="rivalry-highlight-item panel-card"><div class="eyebrow ${card.owner ? userThemeClass(data, card.owner) : ''}">${escapeHtml(card.label)}</div><div class="rivalry-highlight-value">${escapeHtml(card.value)}</div><p>${escapeHtml(highlightCopy(data, card))}</p>${cardDebugLabel(data, card)}</article>`).join('')}${performerCards}</div></section>`;
  }

  function renderRecentGames(data) {
    const seasonData = data.hqSeasonData || data;
    return `<section class="panel-card history-recent-card"><div class="history-section-head"><div><div class="eyebrow">Recent Games</div><h3>Latest rivalry results</h3></div><button class="cr-button secondary" type="button" data-history-access="all_games">View All</button></div><div class="history-log-stack recap-log-stack">${(seasonData.recentGames || []).map((game) => renderGameCard(data, game, false)).join('')}</div></section>`;
  }

  function renderGameCard(data, game, isArchive) {
    const scores = gameScores(data, game);
    const winnerId = game.winnerUserId || game.winner_user_id || game.winner;
    const winnerClass = winnerThemeClass(data, winnerId);
    const context = isArchive ? 'archive' : 'recent';
    const gameChangedClass = CR.ui?.changedClass?.(`history:game:${game.id}`) || '';
    const scoreChangedClass = CR.ui?.changedClass?.(`history:game:${game.id}:score`) || '';
    const gameTypeBadge = game.playoff ? '<span class="cr-pill playoff">Playoffs</span>' : '<span class="cr-pill regular">Regular</span>';
    const gameNumber = game.displayNumber || game.display_number || '';
    return `<article class="history-log-card rivalry-recap-card ${winnerClass} ${gameChangedClass} ${isArchive ? 'is-archive' : ''}" id="history-game-${escapeHtml(game.id)}"><div class="history-log-topline"><div><div class="history-log-kicker-row"><span class="history-log-kicker">${gameNumber ? `Game ${escapeHtml(String(gameNumber))}` : 'Game'}</span>${gameTypeBadge}<span class="history-outcome-pill ${winnerClass}">${escapeHtml(outcomeText(data, game))}</span></div><div class="history-log-subtitle">${escapeHtml(game.subtitle || game.date)}</div></div></div><div class="history-recap-sides"><section class="history-recap-side"><div class="history-recap-side-head ${scoreChangedClass}"><strong class="${userThemeClass(data, 0)}">${escapeHtml(userName(data, 0))}</strong><span>${escapeHtml(String(scores.first))}</span></div><div class="history-recap-picks">${picksFor(data, game, 0).map((pick) => `<div class="history-recap-pick">${escapeHtml(pickLine(pick))}</div>`).join('')}</div></section><section class="history-recap-side"><div class="history-recap-side-head ${scoreChangedClass}"><strong class="${userThemeClass(data, 1)}">${escapeHtml(userName(data, 1))}</strong><span>${escapeHtml(String(scores.second))}</span></div><div class="history-recap-picks">${picksFor(data, game, 1).map((pick) => `<div class="history-recap-pick">${escapeHtml(pickLine(pick))}</div>`).join('')}</div></section></div><div class="history-recap-footer"><span class="history-recap-first-goal">First goal: ${escapeHtml(game.firstGoalScorer || '—')}</span><div class="history-recap-actions"><button class="cr-button edit" type="button" data-history-edit-game="${escapeHtml(game.id)}" data-history-edit-context="${context}">Edit</button></div></div></article>`;
  }

  function renderSeasonCard(data, summary) {
    const seasonId = String(summary?.seasonId || summary?.id || '').trim();
    const season = (data.seasons || []).find((item) => String(item.id) === seasonId) || null;
    const games = data.seasonGames?.[seasonId] || [];
    const summaryTotals = rowScores(data, summary);
    const gameTotals = games.reduce((acc, game) => { const scores = gameScores(data, game); acc.first += scores.first; acc.second += scores.second; return acc; }, { first: 0, second: 0 });
    const seasonTotals = rowScores(data, season);
    const totals = {
      first: summaryTotals.first || gameTotals.first || seasonTotals.first,
      second: summaryTotals.second || gameTotals.second || seasonTotals.second
    };
    const winner = seasonWinner(data, totals);
    const winnerClass = winnerThemeClass(data, winner);
    const leaderClass = leaderClassFromRecord(data, summary.recordText);
    const playoffCount = games.filter((game) => game.playoff).length;
    const featuredResult = seasonFeaturedResult(data, summary, games);
    const isCurrent = Boolean(season?.isCurrent || summary.isCurrent);
    const completionClass = isCurrent ? 'is-current' : 'is-complete';
    return `<button class="history-season-overview-card ${winnerClass} ${completionClass}" type="button" data-history-open-season="${escapeHtml(seasonId)}" aria-label="View ${escapeHtml(summary.label || season?.label || seasonId)} season details"><div class="history-season-overview-topline"><div><div class="eyebrow">${escapeHtml(isCurrent ? 'Current season' : 'Completed season')}</div><h3>${escapeHtml(summary.label || season?.label || seasonId)}</h3></div><span class="history-outcome-pill ${winnerClass}">${escapeHtml(seasonOutcomeText(data, winner, isCurrent))}</span></div><div class="history-season-overview-score"><div class="history-season-overview-side"><span class="history-season-overview-name ${userThemeClass(data, 0)}">${escapeHtml(userName(data, 0))}</span><strong>${escapeHtml(String(totals.first))}</strong></div><div class="history-season-overview-divider" aria-hidden="true">—</div><div class="history-season-overview-side is-right"><span class="history-season-overview-name ${userThemeClass(data, 1)}">${escapeHtml(userName(data, 1))}</span><strong>${escapeHtml(String(totals.second))}</strong></div></div><div class="history-season-overview-meta"><span class="history-meta-pill history-record-pill ${leaderClass}">Record ${escapeHtml(summary.recordText || '—')}</span><span class="history-meta-pill">${escapeHtml(String(games.length))} games</span><span class="history-meta-pill">${escapeHtml(playoffCount ? `${playoffCount} playoff games` : 'No playoff games')}</span></div>${featuredResult ? `<p class="history-meta-note"><strong>Featured result:</strong> ${escapeHtml(featuredResult)}</p>` : ''}</button>`;
  }

  function renderSeasonsOverview(data) {
    const summaries = (data.seasonSummaries || []).slice().sort((a, b) => String(b.label || '').localeCompare(String(a.label || '')));
    return `<section class="history-seasons-view"><section class="panel-card history-all-games-header-card history-seasons-header-card"><div class="history-section-head history-all-games-head"><div><div class="eyebrow">Seasons</div><h2>All Seasons</h2></div><button class="cr-button back" type="button" data-history-back-hq="1">Back</button></div><p class="history-support-copy">Tap any season to revisit the scoreline, swings, and rivalry details.</p></section><div class="history-seasons-stack">${summaries.map((summary) => renderSeasonCard(data, summary)).join('')}</div></section>`;
  }

  function renderAllGames(data) {
    const playoffCount = (data.gameLog || []).filter((game) => game.playoff).length;
    const regularCount = Math.max(0, (data.gameLog?.length || 0) - playoffCount);
    const leaderClass = leaderClassFromRecord(data, data.seasonBoard?.recordText);
    return `<section class="history-all-games-view"><section class="panel-card history-all-games-header-card"><div class="history-section-head history-all-games-head"><div><div class="eyebrow">Season archive</div><h2>${escapeHtml(data.selectedSeason?.label || 'Season')} Games</h2></div><button class="cr-button back" type="button" data-history-back="1">Back</button></div><p class="history-support-copy">Browse every rivalry game for the active season and make commissioner edits where needed.</p><div class="history-season-meta-row history-archive-meta-row"><span class="history-meta-pill">${escapeHtml(String(data.gameLog?.length || 0))} games</span><span class="history-meta-pill">${escapeHtml(String(regularCount))} regular</span><span class="history-meta-pill">${escapeHtml(String(playoffCount))} playoff</span><span class="history-meta-pill history-record-pill ${leaderClass}">Record ${escapeHtml(data.seasonBoard?.recordText || '—')}</span></div></section><section class="panel-card history-all-games-list-card"><div class="history-section-head"><div><div class="eyebrow">Game archive</div><h3>Games</h3><p class="history-support-copy">${escapeHtml(String(data.gameLog?.length || 0))} games in this season</p></div></div><div class="history-log-stack archive-log-stack">${(data.gameLog || []).map((game) => renderGameCard(data, game, true)).join('')}</div></section></section>`;
  }

  function renderHQ(data) {
    return `<div class="history-feed rivalry-command-feed">${renderBoard(data)}${renderSeasonSnapshot(data)}${renderMomentum(data)}${renderHighlights(data)}${renderRecentGames(data)}</div>`;
  }

  function renderAdminSheet(state) {
    if (!state.sheet?.open) return '';
    const primary = state.sheet.primaryAction ? `<button class="cr-button save" type="button" data-history-sheet-apply="1">${escapeHtml(state.sheet.primaryAction)}</button>` : '';
    return `<div class="history-admin-sheet is-open" id="historyAdminSheet"><div class="history-admin-sheet-card"><div class="gd-sheet-handle"></div><div class="history-admin-sheet-head"><div class="gd-sheet-title">${escapeHtml(state.sheet.title || 'History tools')}</div><button class="cr-sheet-close" type="button" data-history-sheet-close="1" aria-label="Close">×</button></div>${state.sheet.message ? `<div class="gd-sheet-copy">${escapeHtml(state.sheet.message)}</div>` : ''}${state.sheet.detailsHtml ? `<div class="history-admin-sheet-details">${state.sheet.detailsHtml}</div>` : ''}${primary ? `<div class="cr-sheet-actions single">${primary}</div>` : ''}</div></div>`;
  }

  CR.historyRender = { renderRootShell, renderHQ, renderSeasonsOverview, renderAllGames, renderAdminSheet };
})();