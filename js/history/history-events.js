window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function openHistorySheet(config) {
    CR.historyState.sheet = {
      open: true,
      title: config.title,
      message: config.message,
      primaryAction: config.primaryAction || '',
      detailsHtml: config.detailsHtml || ''
    };
    CR.renderHistory?.();
  }

  function scrollHistoryToTop() {
    const container = document.querySelector('#historyView');
    if (container) container.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function navigate(view, options = {}) {
    if (options.returnView) CR.historyState.returnView = options.returnView;
    if (options.trackPrevious !== false) CR.historyState.previousView = CR.historyState.view;
    CR.historyState.view = view;
    CR.renderHistory?.();
    scrollHistoryToTop();
  }

  function ownerClass(side) {
    return side === 'Julie' ? 'owner-secondary' : 'owner-primary';
  }

  function sideIndex(side) {
    return side === 'Julie' ? 1 : 0;
  }

  function sideDisplayName(side) {
    const index = sideIndex(side);
    return CR.identity?.getDisplayName?.(index, CR.historyData)
      || CR.identity?.getUser?.(index, CR.historyData)?.displayName
      || CR.historyData?.users?.[index]?.displayName
      || CR.historyData?.users?.[index]?.username
      || side;
  }

  function scoringRules(isPlayoff) {
    return isPlayoff
      ? { goal: 2, assist: 1, firstGoalBonus: 1 }
      : { goal: 1, assist: 1, firstGoalBonus: 1 };
  }

  function win(aaron, julie) {
    return Number(aaron) > Number(julie) ? 'Aaron' : Number(julie) > Number(aaron) ? 'Julie' : 'Tie';
  }

  function normalizeGameType(value) {
    return value === 'playoffs' ? 'Playoffs' : 'Regular Season';
  }

  function buildFirstGoalOptions(game) {
    const names = new Set();
    ['Aaron', 'Julie'].forEach((side) => {
      (game.picks?.[side] || []).forEach((pick) => names.add(pick.playerName));
    });
    (CR.historyData?.players || []).forEach((player) => {
      if (player?.name) names.add(player.name);
    });
    if (game.firstGoalScorer) names.add(game.firstGoalScorer);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  function renderPickCards(picks, sideKey) {
    const sideLabel = sideDisplayName(sideKey);
    return (picks || []).map((pick, index) => `
      <article class="history-sheet-pick-card" data-history-pick-card="1" data-history-pick-slot="${index + 1}">
        <div class="history-sheet-pick-card-topline">
          <span class="eyebrow">Pick ${index + 1}</span>
          <span class="history-sheet-ga-head">G / A</span>
        </div>
        <div class="history-sheet-pick-grid">
          <label class="history-sheet-pick-name-wrap">
            <input
              class="history-sheet-input history-sheet-pick-name"
              type="text"
              value="${escapeHtml(pick.playerName)}"
              data-history-pick-name="1"
              aria-label="${escapeHtml(sideLabel)} pick ${index + 1} player"
            />
          </label>
          <label class="history-sheet-mini-stat">
            <span>G</span>
            <input
              class="history-sheet-input history-sheet-mini-input"
              type="number"
              min="0"
              step="1"
              value="${escapeHtml(String(Number(pick.goals || 0)))}"
              data-history-goals="1"
              aria-label="${escapeHtml(sideLabel)} pick ${index + 1} goals"
            />
          </label>
          <label class="history-sheet-mini-stat">
            <span>A</span>
            <input
              class="history-sheet-input history-sheet-mini-input"
              type="number"
              min="0"
              step="1"
              value="${escapeHtml(String(Number(pick.assists || 0)))}"
              data-history-assists="1"
              aria-label="${escapeHtml(sideLabel)} pick ${index + 1} assists"
            />
          </label>
        </div>
        <div class="history-sheet-pick-points-row">
          <span class="history-sheet-pick-points-label">Points</span>
          <strong data-history-pick-points="1">${escapeHtml(String(Number(pick.points || 0)))} pts</strong>
        </div>
      </article>
    `).join('');
  }

  function openGameEditSheet(gameId, context) {
    const games = CR.historyData?.games || [];
    const game = games.find((item) => String(item.id) === String(gameId));
    if (!game) {
      openHistorySheet({ title: 'Edit Game', message: 'Could not load this game.' });
      return;
    }

    const firstGoalOptions = buildFirstGoalOptions(game);
    const firstLabel = sideDisplayName('Aaron');
    const secondLabel = sideDisplayName('Julie');
    const firstPickLabel = game.firstPick === 'Julie' ? secondLabel : game.firstPick === 'Aaron' ? firstLabel : game.firstPick || '—';

    const detailsHtml = `
      <form class="history-sheet-form history-sheet-form-v2" data-history-edit-form="1" data-history-game-id="${escapeHtml(game.id)}" onsubmit="return false;">
        <div class="history-sheet-summary">
          <div>
            <div class="history-sheet-summary-title">Game ${escapeHtml(String(game.displayNumber || ''))} • ${escapeHtml(game.playoff ? 'Playoffs' : 'Regular')}</div>
            <div class="history-sheet-summary-copy">${escapeHtml(game.date)} • ${escapeHtml(game.opponent || 'Opponent TBD')}</div>
            <div class="history-sheet-summary-copy">First pick: ${escapeHtml(firstPickLabel)}</div>
            <div class="history-sheet-summary-copy">First goal: <span data-history-first-goal-readout="1">${escapeHtml(game.firstGoalScorer || '—')}</span></div>
            <div class="history-sheet-summary-copy">${escapeHtml(firstLabel)}: ${(game.picks?.Aaron || []).map((pick) => escapeHtml(pick.playerName)).join(' / ')}</div>
            <div class="history-sheet-summary-copy">${escapeHtml(secondLabel)}: ${(game.picks?.Julie || []).map((pick) => escapeHtml(pick.playerName)).join(' / ')}</div>
          </div>
        </div>

        <div class="history-sheet-tabs" role="tablist" aria-label="Edit game sections">
          <button class="history-sheet-tab is-active" type="button" data-history-sheet-tab="info">Info</button>
          <button class="history-sheet-tab" type="button" data-history-sheet-tab="picks">Picks</button>
          <button class="history-sheet-tab" type="button" data-history-sheet-tab="result">Result</button>
        </div>

        <section class="history-sheet-panel is-active" data-history-sheet-panel="info">
          <div class="history-sheet-field-grid">
            <label class="history-sheet-field">
              <span>Date</span>
              <input class="history-sheet-input" type="text" value="${escapeHtml(game.date)}" data-history-game-date="1" aria-label="Game date" />
            </label>
            <label class="history-sheet-field">
              <span>Opponent</span>
              <input class="history-sheet-input" type="text" value="${escapeHtml(game.opponent || '')}" data-history-game-opponent="1" aria-label="Opponent" />
            </label>
          </div>
          <div class="history-sheet-field-grid">
            <label class="history-sheet-field">
              <span>Type</span>
              <select class="history-sheet-select" data-history-game-type="1" aria-label="Game type">
                <option value="regular" ${game.playoff ? '' : 'selected'}>Regular Season</option>
                <option value="playoffs" ${game.playoff ? 'selected' : ''}>Playoffs</option>
              </select>
            </label>
            <label class="history-sheet-field">
              <span>First pick</span>
              <select class="history-sheet-select" data-history-first-picker="1" aria-label="First pick">
                <option value="Aaron" ${game.firstPick === 'Aaron' ? 'selected' : ''}>${escapeHtml(firstLabel)}</option>
                <option value="Julie" ${game.firstPick === 'Julie' ? 'selected' : ''}>${escapeHtml(secondLabel)}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="history-sheet-panel" data-history-sheet-panel="picks" hidden>
          <div class="history-sheet-side-section">
            <div class="history-sheet-side-section-head">
              <h3>${escapeHtml(firstLabel)} Picks</h3>
              <span class="history-sheet-ga-head">G / A</span>
            </div>
            <div class="history-sheet-pick-stack" data-history-side="Aaron">
              ${renderPickCards(game.picks?.Aaron, 'Aaron')}
            </div>
          </div>

          <div class="history-sheet-side-section">
            <div class="history-sheet-side-section-head">
              <h3>${escapeHtml(secondLabel)} Picks</h3>
              <span class="history-sheet-ga-head">G / A</span>
            </div>
            <div class="history-sheet-pick-stack" data-history-side="Julie">
              ${renderPickCards(game.picks?.Julie, 'Julie')}
            </div>
          </div>
        </section>

        <section class="history-sheet-panel" data-history-sheet-panel="result" hidden>
          <label class="history-sheet-field">
            <span>First goal scorer</span>
            <input class="history-sheet-input" list="history-first-goal-options-${escapeHtml(game.id)}" value="${escapeHtml(game.firstGoalScorer || '')}" data-history-first-goal="1" aria-label="First goal scorer" />
            <datalist id="history-first-goal-options-${escapeHtml(game.id)}">
              ${firstGoalOptions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}
            </datalist>
          </label>

          <div class="history-sheet-score-preview-grid">
            <article class="history-sheet-score-preview-card">
              <div class="eyebrow ${ownerClass('Aaron')}">${escapeHtml(firstLabel)}</div>
              <div class="history-sheet-score-preview-value" data-history-side-total="Aaron">${escapeHtml(String(game.aaronScore || 0))}</div>
            </article>
            <article class="history-sheet-score-preview-card">
              <div class="eyebrow ${ownerClass('Julie')}">${escapeHtml(secondLabel)}</div>
              <div class="history-sheet-score-preview-value" data-history-side-total="Julie">${escapeHtml(String(game.julieScore || 0))}</div>
            </article>
          </div>

          <div class="history-sheet-actions-note">Scores update automatically from goals, assists, game type, and first-goal bonus.</div>
        </section>

        <div class="history-sheet-footer-note">First goal can be any roster player. Bonus applies only if that player was picked and has a goal logged.</div>
      </form>
    `;

    openHistorySheet({
      title: `Edit Game ${game.displayNumber || ''}`.trim(),
      message: '',
      primaryAction: 'Save',
      detailsHtml
    });
  }

  function parseNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function collectSheetPicks(form, side) {
    return Array.from(form.querySelectorAll(`[data-history-side="${side}"] [data-history-pick-card="1"]`)).map((card, index) => ({
      owner: side,
      slot: Number(card.dataset.historyPickSlot || index + 1),
      playerName: (card.querySelector('[data-history-pick-name="1"]')?.value || '').trim(),
      goals: parseNumber(card.querySelector('[data-history-goals="1"]')?.value),
      assists: parseNumber(card.querySelector('[data-history-assists="1"]')?.value),
      points: 0
    }));
  }

  function calculatePickPoints(pick, firstGoal, rules) {
    if (!pick.playerName) return 0;
    let points = pick.goals * rules.goal + pick.assists * rules.assist;
    if (firstGoal && pick.playerName.trim().toLowerCase() === firstGoal.trim().toLowerCase() && pick.goals > 0) {
      points += rules.firstGoalBonus;
    }
    return points;
  }

  function collectEditPayload(form) {
    const isPlayoff = form.querySelector('[data-history-game-type="1"]')?.value === 'playoffs';
    const rules = scoringRules(isPlayoff);
    const firstGoal = (form.querySelector('[data-history-first-goal="1"]')?.value || '').trim();
    const picks = [...collectSheetPicks(form, 'Aaron'), ...collectSheetPicks(form, 'Julie')];
    const chosen = picks.map((pick) => pick.playerName).filter(Boolean);
    if (new Set(chosen).size !== chosen.length) {
      throw new Error('Each player can only be picked once for a game.');
    }

    picks.forEach((pick) => {
      pick.points = calculatePickPoints(pick, firstGoal, rules);
    });

    const aaronPoints = picks.filter((pick) => pick.owner === 'Aaron').reduce((total, pick) => total + pick.points, 0);
    const juliePoints = picks.filter((pick) => pick.owner === 'Julie').reduce((total, pick) => total + pick.points, 0);

    return {
      gameId: form.dataset.historyGameId,
      gameDate: (form.querySelector('[data-history-game-date="1"]')?.value || '').trim(),
      opponent: (form.querySelector('[data-history-game-opponent="1"]')?.value || '').trim(),
      gameType: normalizeGameType(form.querySelector('[data-history-game-type="1"]')?.value),
      firstPicker: (form.querySelector('[data-history-first-picker="1"]')?.value || '').trim(),
      firstGoal,
      aaronPoints,
      juliePoints,
      winner: win(aaronPoints, juliePoints),
      picks
    };
  }

  async function upsertHistoryPick(db, gameId, pick) {
    const existing = (CR.historyRawPicks || []).find((row) =>
      String(row.game_id) === String(gameId) &&
      row.owner === pick.owner &&
      Number(row.pick_slot) === Number(pick.slot)
    );

    const row = {
      game_id: gameId,
      owner: pick.owner,
      pick_slot: pick.slot,
      player_name: pick.playerName || null,
      goals: pick.playerName ? pick.goals : 0,
      assists: pick.playerName ? pick.assists : 0,
      points: pick.playerName ? pick.points : 0
    };

    if (existing?.id) {
      const res = await db.from('picks').update(row).eq('id', existing.id);
      if (res.error) throw res.error;
      return;
    }

    const res = await db.from('picks').upsert(row, { onConflict: 'game_id,owner,pick_slot' });
    if (res.error) throw res.error;
  }

  async function reloadHistoryAfterSave() {
    const source = await CR.historyDataService.fetchHistoryData();
    CR.historyData = CR.historyModel.build(source);
    CR.historyCache = { staticData: null, seasons: {} };
    CR.historyPanelKeys = { hq: '', seasons: '', all_games: '', admin: '' };
  }

  async function saveHistoryEdit() {
    const form = document.querySelector('[data-history-edit-form="1"]');
    if (!form) return;
    const payload = collectEditPayload(form);
    const db = await CR.getSupabase();

    const gamePatch = {
      game_date: payload.gameDate || null,
      opponent: payload.opponent || null,
      game_type: payload.gameType,
      first_picker: payload.firstPicker || null,
      status: 'Final',
      first_goal_scorer: payload.firstGoal || null,
      aaron_points: payload.aaronPoints,
      julie_points: payload.juliePoints,
      winner: payload.winner,
      recap: `Edited historical record. Aaron ${payload.aaronPoints}, Julie ${payload.juliePoints}.`
    };

    const gameRes = await db.from('games').update(gamePatch).eq('id', payload.gameId);
    if (gameRes.error) throw gameRes.error;

    for (const pick of payload.picks) {
      await upsertHistoryPick(db, payload.gameId, pick);
    }

    await reloadHistoryAfterSave();
    CR.historyState.sheet = { open: false };
    CR.showToast?.({ message: 'History updated', tier: 'light' });
    CR.renderHistory?.();
  }

  function refreshSheetTotals(form) {
    if (!form) return;
    const isPlayoff = form.querySelector('[data-history-game-type="1"]')?.value === 'playoffs';
    const rules = scoringRules(isPlayoff);
    const firstGoalName = (form.querySelector('[data-history-first-goal="1"]')?.value || '').trim().toLowerCase();
    const totals = { Aaron: 0, Julie: 0 };

    ['Aaron', 'Julie'].forEach((side) => {
      const stack = form.querySelector(`[data-history-side="${side}"]`);
      stack?.querySelectorAll('[data-history-pick-card="1"]').forEach((card) => {
        const goals = parseNumber(card.querySelector('[data-history-goals="1"]')?.value);
        const assists = parseNumber(card.querySelector('[data-history-assists="1"]')?.value);
        const playerName = (card.querySelector('[data-history-pick-name="1"]')?.value || '').trim().toLowerCase();
        let points = goals * rules.goal + assists * rules.assist;
        if (firstGoalName && playerName === firstGoalName && goals > 0) points += rules.firstGoalBonus;
        totals[side] += points;
        const pointNode = card.querySelector('[data-history-pick-points="1"]');
        if (pointNode) pointNode.textContent = `${points} pts`;
      });
    });

    form.querySelector('[data-history-side-total="Aaron"]')?.replaceChildren(document.createTextNode(String(totals.Aaron)));
    form.querySelector('[data-history-side-total="Julie"]')?.replaceChildren(document.createTextNode(String(totals.Julie)));
    form.querySelector('[data-history-first-goal-readout="1"]')?.replaceChildren(document.createTextNode(form.querySelector('[data-history-first-goal="1"]')?.value || '—'));
  }

  function switchSheetTab(form, tabId) {
    if (!form) return;
    form.querySelectorAll('[data-history-sheet-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.historySheetTab === tabId);
    });
    form.querySelectorAll('[data-history-sheet-panel]').forEach((panel) => {
      const isActive = panel.dataset.historySheetPanel === tabId;
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
    });
  }

  function handleSeasonSelect(event) {
    const target = event.target;
    if (!target.matches('#historySeasonSelect, #historySeasonSelectArchive')) return;
    CR.historyState.seasonId = target.value;
    CR.renderHistory?.();
    scrollHistoryToTop();
  }

  function handleChange(event) {
    handleSeasonSelect(event);
    const form = event.target.closest('[data-history-edit-form="1"]');
    if (form && event.target.matches('[data-history-goals="1"], [data-history-assists="1"], [data-history-pick-name="1"], [data-history-first-goal="1"], [data-history-game-type="1"]')) {
      refreshSheetTotals(form);
    }
  }

  function handleInput(event) {
    const form = event.target.closest('[data-history-edit-form="1"]');
    if (form && event.target.matches('[data-history-goals="1"], [data-history-assists="1"], [data-history-pick-name="1"], [data-history-first-goal="1"]')) {
      refreshSheetTotals(form);
    }
  }

  async function handleClick(event) {
    const tab = event.target.closest('[data-history-sheet-tab]');
    if (tab) {
      switchSheetTab(tab.closest('[data-history-edit-form="1"]'), tab.dataset.historySheetTab);
      return;
    }

    const editGame = event.target.closest('[data-history-edit-game]');
    if (editGame) {
      openGameEditSheet(editGame.dataset.historyEditGame, editGame.dataset.historyEditContext || 'recent');
      return;
    }

    const seasonOverview = event.target.closest('[data-history-open-season]');
    if (seasonOverview) {
      CR.historyState.seasonId = seasonOverview.dataset.historyOpenSeason;
      navigate('all_games', { returnView: 'seasons' });
      return;
    }

    const seasonJump = event.target.closest('button[data-history-season]');
    if (seasonJump) {
      CR.historyState.seasonId = seasonJump.dataset.historySeason;
      CR.renderHistory?.();
      scrollHistoryToTop();
      return;
    }

    const back = event.target.closest('button[data-history-back]');
    if (back) {
      navigate(CR.historyState.returnView || 'hq', { trackPrevious: false });
      return;
    }

    const backHq = event.target.closest('button[data-history-back-hq]');
    if (backHq) {
      navigate('hq', { trackPrevious: false });
      return;
    }

    const access = event.target.closest('button[data-history-access]');
    if (access) {
      const id = access.dataset.historyAccess;
      if (id === 'all_games') {
        navigate('all_games', { returnView: 'hq' });
        return;
      }
      if (id === 'seasons') {
        navigate('seasons');
        return;
      }
      openHistorySheet({ title: 'History', message: 'Mock detail view.' });
      return;
    }

    const sheetClose = event.target.closest('[data-history-sheet-close]');
    if (sheetClose || event.target.id === 'historyAdminSheet') {
      CR.historyState.sheet = { open: false };
      CR.renderHistory?.();
      return;
    }

    const sheetApply = event.target.closest('[data-history-sheet-apply]');
    if (sheetApply) {
      try {
        CR.ui.setActionBusy?.(sheetApply, true, { label: 'Saving…' });
        await saveHistoryEdit();
      } catch (error) {
        console.error('History save failed', error);
        CR.showToast?.({ message: error.message || 'Could not save history', tier: 'warning' });
        CR.ui.setActionBusy?.(sheetApply, false);
      }
    }
  }

  function bindHistoryEvents() {
    const root = document.querySelector('#historyView');
    if (!root || root.dataset.historyBound === 'true') return;
    root.addEventListener('change', handleChange);
    root.addEventListener('input', handleInput);
    root.addEventListener('click', handleClick);
    root.dataset.historyBound = 'true';
  }

  CR.historyEvents = { bindHistoryEvents };
})();