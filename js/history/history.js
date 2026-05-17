window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function userForSide(users, side) {
    const index = side === 'Julie' ? 1 : 0;
    return users?.[index] || {};
  }

  function pickKeysForSide(users, side) {
    const user = userForSide(users, side);
    return [
      user.scoreKey,
      user.score_key,
      user.legacyOwner,
      user.legacy_owner,
      user.legacyOwnerKey,
      user.legacy_owner_key,
      user.username,
      user.displayName,
      user.display_name,
      side
    ].filter(Boolean);
  }

  function scoreKeysForSide(users, side) {
    const legacyKey = side === 'Julie' ? 'julieScore' : 'aaronScore';
    return pickKeysForSide(users, side)
      .map((key) => `${String(key).trim().toLowerCase()}Score`)
      .concat(legacyKey);
  }

  function sideScore(row, side, users) {
    const key = scoreKeysForSide(users, side).find((candidate) => row?.[candidate] !== undefined && row?.[candidate] !== null);
    return Number(row?.[key] ?? 0);
  }

  function ownerForWinner(winner, users) {
    const text = String(winner || '').trim().toLowerCase();
    if (!text || text === 'tie') return text ? 'Tie' : '';
    for (const side of ['Aaron', 'Julie']) {
      const keys = pickKeysForSide(users, side).map((key) => String(key).trim().toLowerCase());
      if (keys.includes(text)) return side;
    }
    if (text === 'aaron') return 'Aaron';
    if (text === 'julie') return 'Julie';
    return '';
  }

  function scoreTotal(games, side, users) {
    return games.reduce((total, game) => total + sideScore(game, side, users), 0);
  }

  function seasonTotals(season, seasonGames, users) {
    const gameAaron = scoreTotal(seasonGames, 'Aaron', users);
    const gameJulie = scoreTotal(seasonGames, 'Julie', users);
    const seasonAaron = sideScore(season, 'Aaron', users);
    const seasonJulie = sideScore(season, 'Julie', users);

    return {
      aaron: gameAaron || seasonAaron,
      julie: gameJulie || seasonJulie,
      hasGameTotals: Boolean(gameAaron || gameJulie),
      hasSeasonTotals: Boolean(seasonAaron || seasonJulie)
    };
  }

  function picksForSide(game, side, users) {
    const key = pickKeysForSide(users, side).find((candidate) => Array.isArray(game.picks?.[candidate]));
    return game.picks?.[key] || [];
  }

  function firstGoalScorer(game, users) {
    if (game.firstGoalScorer) return game.firstGoalScorer;
    for (const side of ['Aaron', 'Julie']) {
      const hit = picksForSide(game, side, users).find((pick) => pick.firstGoal);
      if (hit) return hit.playerName;
    }
    return '—';
  }

  function hasRealScore(game, users) {
    return sideScore(game, 'Aaron', users) + sideScore(game, 'Julie', users) > 0;
  }

  function scoredGames(games = [], users) {
    return games.filter((game) => hasRealScore(game, users));
  }

  function scoreWinner(game, users) {
    const normalized = ownerForWinner(game?.winner, users);
    if (normalized) return normalized;
    const aaron = sideScore(game, 'Aaron', users);
    const julie = sideScore(game, 'Julie', users);
    if (aaron > julie) return 'Aaron';
    if (julie > aaron) return 'Julie';
    return 'Tie';
  }

  function gameLabel(game) {
    return [game?.date, game?.opponent ? `vs ${game.opponent}` : ''].filter(Boolean).join(' • ') || game?.title || 'Game';
  }

  function buildSeasonPlayerSpotlights(selectedGames, users) {
    const byPlayer = new Map();

    selectedGames.forEach((game) => {
      ['Aaron', 'Julie'].forEach((side) => {
        picksForSide(game, side, users).forEach((pick) => {
          const existing = byPlayer.get(pick.playerName) || {
            name: pick.playerName,
            position: pick.position,
            vibe: pick.vibe,
            owner: 'Split',
            totalPoints: 0,
            gamesPicked: 0,
            pickedByAaron: 0,
            pickedByJulie: 0,
            winsWhenPicked: 0,
            recordWhenPicked: '0-0',
            bestGame: null,
            clutch: 'Quietly clutch'
          };

          existing.totalPoints += Number(pick.points || 0);
          existing.gamesPicked += 1;
          if (side === 'Aaron') existing.pickedByAaron += 1;
          if (side === 'Julie') existing.pickedByJulie += 1;
          if (scoreWinner(game, users) === side) existing.winsWhenPicked += 1;
          if (!existing.bestGame || Number(pick.points || 0) > Number(existing.bestGame.points || 0)) {
            existing.bestGame = { title: game.title, points: Number(pick.points || 0) };
          }

          existing.owner = existing.pickedByAaron === existing.pickedByJulie
            ? 'Split'
            : existing.pickedByAaron > existing.pickedByJulie ? 'Aaron' : 'Julie';

          existing.recordWhenPicked = `${existing.winsWhenPicked}-${Math.max(0, existing.gamesPicked - existing.winsWhenPicked)}`;
          existing.clutch = existing.totalPoints >= 10 ? 'Season-shaping chaos' : existing.totalPoints >= 6 ? 'Reliable momentum piece' : 'Quietly clutch';
          byPlayer.set(pick.playerName, existing);
        });
      });
    });

    return Array.from(byPlayer.values()).sort((a, b) => b.totalPoints - a.totalPoints || b.gamesPicked - a.gamesPicked).slice(0, 3);
  }

  function buildRecentTen(gameLog, users) {
    return scoredGames(gameLog, users).slice(0, 10);
  }

  function buildRecentRecord(games, users) {
    return buildRecentTen(games, users).reduce((acc, game) => {
      const winner = scoreWinner(game, users);
      if (winner === 'Aaron') acc.aaron += 1;
      else if (winner === 'Julie') acc.julie += 1;
      else acc.ties += 1;
      return acc;
    }, { aaron: 0, julie: 0, ties: 0 });
  }

  function recentRecordText(games, users) {
    const recent = buildRecentRecord(games, users);
    const base = `Last 10 ${recent.aaron}-${recent.julie}`;
    return recent.ties ? `${base}-${recent.ties}` : base;
  }

  function buildAllTimeBoard(model) {
    const bySeason = model.seasons || [];
    const users = model.users || [];
    let aaron = 0;
    let julie = 0;
    bySeason.forEach((season) => {
      const games = model.seasonGames?.[season.id] || [];
      const totals = seasonTotals(season, games, users);
      aaron += totals.aaron;
      julie += totals.julie;
    });
    const lead = aaron === julie ? 'Rivalry tied all-time' : aaron > julie ? `Aaron leads the rivalry by ${aaron - julie}` : `Julie leads the rivalry by ${julie - aaron}`;
    return { aaron, julie, lead, totalGames: model.games?.length || 0 };
  }

  function buildHighlights(games, users) {
    const ordered = scoredGames(games, users).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let longest = { owner: 'Tie', count: 0 };
    let current = { owner: '', count: 0 };
    let biggestBlowout = null;
    const firstGoalCounts = new Map();
    ordered.forEach((game) => {
      const winner = scoreWinner(game, users);
      if (winner !== 'Tie') {
        if (current.owner === winner) current.count += 1;
        else current = { owner: winner, count: 1 };
        if (current.count > longest.count) longest = { ...current };
      } else {
        current = { owner: '', count: 0 };
      }
      const margin = Math.abs(sideScore(game, 'Aaron', users) - sideScore(game, 'Julie', users));
      if (!biggestBlowout || margin > biggestBlowout.margin) biggestBlowout = { owner: winner, margin, title: gameLabel(game) };
      const scorer = firstGoalScorer(game, users);
      if (scorer && scorer !== '—') firstGoalCounts.set(scorer, (firstGoalCounts.get(scorer) || 0) + 1);
    });
    const topFirstGoal = Array.from(firstGoalCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    return { longest, biggestBlowout, topFirstGoal, scoredCount: ordered.length };
  }

  function buildHighlightCards(highlights, games = [], users) {
    const completedCount = scoredGames(games, users).length;
    const cards = [];
    if (highlights.longest?.count) cards.push({ label: 'Longest run', value: `${highlights.longest.count} straight`, owner: highlights.longest.owner, copy: 'built the longest winning streak.' });
    if (highlights.biggestBlowout?.margin) cards.push({ label: 'Biggest swing', value: `+${highlights.biggestBlowout.margin}`, owner: highlights.biggestBlowout.owner, copy: `owned ${highlights.biggestBlowout.title}.` });
    if (highlights.topFirstGoal?.[0]) cards.push({ label: 'First-goal magnet', value: highlights.topFirstGoal[0], owner: null, copy: `${highlights.topFirstGoal[1]} first-goal bonus hit${highlights.topFirstGoal[1] === 1 ? '' : 's'}.` });
    cards.push({ label: 'Games logged', value: String(completedCount || games.length || 0), owner: null, copy: 'Completed rivalry games in the archive.' });
    return cards.slice(0, 4);
  }

  function buildMomentum(gameLog, users) {
    return buildRecentTen(gameLog, users).map((game) => ({ winner: scoreWinner(game, users), playoff: Boolean(game.playoff), id: game.id }));
  }

  function buildGameLog(games) { return games.slice().sort((a, b) => Number(b.displayNumber || 0) - Number(a.displayNumber || 0)); }

  function buildSeasonBoard(season, gameLog, summary, users, recentGameLog = gameLog) {
    const totals = seasonTotals(season, gameLog, users);
    const aaron = totals.aaron;
    const julie = totals.julie;
    return { seasonLabel: season?.label || summary?.label || 'Season', aaron, julie, recordText: `${aaron}-${julie}`, recentText: recentRecordText(recentGameLog, users), bestGameTitle: buildRecentTen(gameLog, users)[0]?.title || '' };
  }

  function buildSeasonScopedData(model, seasonId, hqRecentGameLog) {
    const selectedSeason = model.seasons.find((season) => season.id === seasonId) || model.seasons[0] || null;
    const resolvedSeasonId = selectedSeason?.id || seasonId;
    const selectedGames = model.seasonGames?.[resolvedSeasonId] || [];
    const selectedSummary = model.seasonSummaries?.find((season) => season.seasonId === resolvedSeasonId) || null;
    const users = model.users || [];
    const gameLog = buildGameLog(selectedGames);
    const recentLog = hqRecentGameLog || gameLog;
    const recentTen = buildRecentTen(recentLog, users);
    const playerSpotlights = buildSeasonPlayerSpotlights(scoredGames(selectedGames, users), users);
    return { selectedSeason, selectedSummary, selectedGames, seasonBoard: buildSeasonBoard(selectedSeason, gameLog, selectedSummary, users, recentLog), momentum: buildMomentum(recentLog, users), recentGames: buildRecentTen(gameLog, users).slice(0, 4), gameLog, playerSpotlights };
  }

  function buildStaticHistoryData(model) {
    const users = model.users || [];
    const highlights = buildHighlights(model.games || [], users);
    return { allTimeBoard: buildAllTimeBoard(model), highlights: { ...highlights, cards: buildHighlightCards(highlights, model.games || [], users) }, seasonSummaries: model.seasonSummaries || [] };
  }

  function getScopedData(model, state) {
    const cache = CR.historyCache || (CR.historyCache = { staticData: null, seasons: {} });
    const hqSeasonId = model.currentSeasonId || state.seasonId;
    const hqRecentGameLog = buildGameLog(model.games || []);
    if (!cache.staticData) cache.staticData = buildStaticHistoryData(model);
    if (!cache.seasons[state.seasonId]) cache.seasons[state.seasonId] = buildSeasonScopedData(model, state.seasonId);
    if (!cache.seasons[hqSeasonId]) cache.seasons[hqSeasonId] = buildSeasonScopedData(model, hqSeasonId, hqRecentGameLog);
    else cache.seasons[hqSeasonId] = { ...cache.seasons[hqSeasonId], seasonBoard: buildSeasonBoard(cache.seasons[hqSeasonId].selectedSeason, cache.seasons[hqSeasonId].gameLog, cache.seasons[hqSeasonId].selectedSummary, model.users || [], hqRecentGameLog), momentum: buildMomentum(hqRecentGameLog, model.users || []) };
    return { ...model, ...cache.staticData, ...cache.seasons[state.seasonId], hqSeasonData: cache.seasons[hqSeasonId] };
  }

  function ensureHistoryShell(root) {
    if (CR.historyDom?.root === root) return;
    root.innerHTML = CR.historyRender.renderRootShell();
    CR.historyDom = { root, hq: root.querySelector('#historyPanelHq'), seasons: root.querySelector('#historyPanelSeasons'), allGames: root.querySelector('#historyPanelAllGames'), admin: root.querySelector('#historyAdminLayer') };
    CR.historyPanelKeys = { hq: '', seasons: '', all_games: '', admin: '' };
  }

  function syncPanelVisibility(view) {
    if (!CR.historyDom) return;
    CR.historyDom.hq.hidden = view !== 'hq';
    CR.historyDom.seasons.hidden = view !== 'seasons';
    CR.historyDom.allGames.hidden = view !== 'all_games';
  }

  function renderPanel(name, key, html, target) { if (CR.historyPanelKeys[name] === key) return; target.innerHTML = html; CR.historyPanelKeys[name] = key; }

  function lockSheetScroll() {
    if (CR.historyScrollLock?.locked) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    CR.historyScrollLock = { locked: true, scrollY };
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add('history-sheet-open');
    document.documentElement.classList.add('history-sheet-open');
  }

  function unlockSheetScroll() {
    const scrollY = CR.historyScrollLock?.scrollY || 0;
    CR.historyScrollLock = { locked: false, scrollY: 0 };
    document.body.classList.remove('history-sheet-open');
    document.documentElement.classList.remove('history-sheet-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
  }

  function syncSheetScrollLock() { const isOpen = Boolean(CR.historyState?.sheet?.open); if (isOpen) lockSheetScroll(); else if (CR.historyScrollLock?.locked) unlockSheetScroll(); }

  function renderHistoryUnavailable(message = 'History data could not be loaded.') {
    const root = document.querySelector('#historyView');
    if (!root) return;
    root.innerHTML = `<section class="panel-card history-hq-card"><div class="history-section-head"><div><div class="eyebrow">History</div><h3>Unavailable</h3></div></div><p class="history-support-copy">${message}</p></section>`;
  }

  function renderHistory() {
    const root = document.querySelector('#historyView');
    if (!root || !CR.historyData || !CR.historyState) return;
    CR.identity?.applyUserColorVariables?.({ users: CR.historyData.users });
    ensureHistoryShell(root);
    const scoped = getScopedData(CR.historyData, CR.historyState);
    const hqMomentumKey = momentumSignature(scoped.hqSeasonData?.momentum || []);
    const hqKey = `${CR.historyData.currentSeasonId}:${hqMomentumKey}`;
    const seasonKey = `${CR.historyState.seasonId}`;
    renderPanel('hq', `hq:${hqKey}`, CR.historyRender.renderHQ(scoped), CR.historyDom.hq);
    renderPanel('seasons', 'seasons:static', CR.historyRender.renderSeasonsOverview(scoped), CR.historyDom.seasons);
    renderPanel('all_games', `all_games:${seasonKey}`, CR.historyRender.renderAllGames(scoped), CR.historyDom.allGames);
    const sheetState = CR.historyState.sheet?.open ? `${CR.historyState.sheet.title}|${CR.historyState.sheet.message}|${CR.historyState.sheet.primaryAction}` : 'closed';
    renderPanel('admin', `admin:${sheetState}`, CR.historyRender.renderAdminSheet(CR.historyState), CR.historyDom.admin);
    syncPanelVisibility(CR.historyState.view);
    syncSheetScrollLock();
    if (!CR.historyEventsBound) { CR.historyEvents.bindHistoryEvents(); CR.historyEventsBound = true; }
  }

  function momentumSignature(momentum = []) { return momentum.map((item) => `${item.id}:${item.winner}:${item.playoff}`).join('|'); }
  function changedKeysFromRealtimePayloads(payloads = []) {
    const keys = [];
    payloads.forEach((payload) => { const row = payload.new || payload.old || {}; if (payload.table === 'games' && row.id) { keys.push(`history:game:${row.id}`); keys.push(`history:game:${row.id}:score`); } if (payload.table === 'picks') { const gameId = row.game_id; if (gameId) keys.push(`history:game:${gameId}`); if (row.id) keys.push(`history:pick:${row.id}`); } });
    return Array.from(new Set(keys));
  }

  function registerHistoryRealtime() {
    if (!CR.realtime?.register || CR.historyRealtimeRegistered) return;
    CR.historyRealtimeRegistered = true;
    CR.realtime.register('history', { tables: ['games', 'picks'], debounceMs: 220, onChange: async (payloads) => { const keys = changedKeysFromRealtimePayloads(payloads); if (keys.length) CR.ui?.markChanged?.(keys, { onChange: () => renderHistory() }); await refreshHistoryData(); } });
    CR.realtime.start?.();
  }

  async function refreshHistoryData(options = {}) {
    if (CR.historyState?.sheet?.open && !options.force) { CR.historyNeedsRefresh = true; return; }
    try {
      const previousState = CR.historyState || {};
      const source = await CR.historyDataService.fetchHistoryData();
      CR.historyData = CR.historyModel.build(source);
      CR.identity?.applyUserColorVariables?.({ users: CR.historyData.users });
      CR.historyCache = { staticData: null, seasons: {} };
      CR.historyPanelKeys = { hq: '', seasons: '', all_games: '', admin: '' };
      const validSeason = CR.historyData.seasons?.some((season) => season.id === previousState.seasonId);
      CR.historyState = { seasonId: validSeason ? previousState.seasonId : CR.historyData.currentSeasonId, view: previousState.view || 'hq', previousView: previousState.previousView || 'hq', returnView: previousState.returnView || 'hq', sheet: previousState.sheet?.open && !options.closeSheet ? previousState.sheet : { open: false } };
      CR.historyNeedsRefresh = false;
      renderHistory();
    } catch (error) { console.error('History refresh failed', error); CR.showToast?.({ message: 'Could not refresh History', tier: 'warning' }); }
  }

  async function initHistory() {
    try {
      const source = await CR.historyDataService.fetchHistoryData();
      CR.historyData = CR.historyModel.build(source);
      CR.identity?.applyUserColorVariables?.({ users: CR.historyData.users });
      CR.historyCache = { staticData: null, seasons: {} };
      CR.historyDom = null;
      CR.historyEventsBound = false;
      CR.historyPanelKeys = { hq: '', seasons: '', all_games: '', admin: '' };
      CR.historyScrollLock = { locked: false, scrollY: 0 };
      CR.historyState = { seasonId: CR.historyData.currentSeasonId, view: 'hq', previousView: 'hq', returnView: 'hq', sheet: { open: false } };
      registerHistoryRealtime();
      renderHistory();
    } catch (error) { console.error('History load failed', error); renderHistoryUnavailable('Real rivalry history is currently unavailable. Check Supabase access or schema mapping.'); }
  }

  CR.initHistory = initHistory;
  CR.refreshHistoryData = refreshHistoryData;
  CR.renderHistory = renderHistory;
})();