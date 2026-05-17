window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const model = CR.gameDayModel || {};
  const render = CR.gameDayRender || {};
  const events = CR.gameDayEvents || {};
  const state = () => CR.gameDayStateUtils || {};

  const fallbackRoster = model.roster || [];
  const $ = (selector) => document.querySelector(selector);
  const clone = (value) => model.clone ? model.clone(value) : JSON.parse(JSON.stringify(value || {}));

  function currentSource() {
    return { users: CR.gameDay?.users };
  }

  function emptyState() {
    const source = { users: CR.identity?.getUsers?.() || [] };
    return {
      source: 'empty',
      currentGameId: '',
      mode: 'pregame',
      playoffMode: 'regular',
      carryover: { active: false },
      game: {
        hasGame: false,
        scheduleText: 'Schedule pending',
        opponent: '',
        headline: 'Next game not scheduled yet'
      },
      draft: {
        status: 'pending',
        currentPickNumber: 0,
        currentPicker: { id: '', displayName: '', profileKey: '' },
        firstPicker: ''
      },
      users: source.users,
      pregame: state().emptyPickBuckets?.(source) || {},
      live: {
        scores: state().emptyScoreBuckets?.(source) || {},
        period: 'Schedule pending',
        users: state().emptyPickBuckets?.(source) || {},
        feed: []
      },
      roster: []
    };
  }

  CR.gameDay = { ...emptyState(), ...(model.createInitialState?.() || {}) };
  CR.gameDay.carryover = CR.gameDay.carryover || { active: false };
  CR.gameDay.draft = CR.gameDay.draft || emptyState().draft;
  CR.gameDay.users = CR.gameDay.users || CR.identity?.getUsers?.() || [];
  CR.gameDay.pregame = CR.gameDay.pregame || state().emptyPickBuckets?.(currentSource()) || {};
  CR.gameDay.live = CR.gameDay.live || emptyState().live;
  CR.gameDay.live.scores = CR.gameDay.live.scores || state().emptyScoreBuckets?.(currentSource()) || {};
  CR.gameDay.live.users = CR.gameDay.live.users || state().emptyPickBuckets?.(currentSource()) || {};
  CR.gameDayRoster = CR.gameDay.roster || fallbackRoster;

  function pointsFor(pick = {}) {
    if (model.pointsFor) return model.pointsFor(pick);
    return (Number(pick.goals || 0) * 2) + Number(pick.assists || 0) + (pick.firstGoal ? 2 : 0);
  }

  function isPlayoffs() {
    return CR.gameDay.playoffMode === 'playoffs';
  }

  function isUserEditing() {
    return Boolean(CR.gameDayEditState?.isEditing);
  }

  function hasScheduledGame() {
    const game = CR.gameDay?.game || {};
    return Boolean(game.hasGame && game.scheduleText && game.scheduleText !== 'Schedule pending');
  }

  function canManagePicks() {
    return hasScheduledGame() && CR.gameDay.mode !== 'final';
  }

  function getRoster() {
    return CR.gameDay.roster || CR.gameDayRoster || fallbackRoster;
  }

  function modeLabel(mode) {
    if (mode === 'pregame') return 'Pregame';
    if (mode === 'live') return 'Live';
    return 'Final';
  }

  function getPregameStructured() {
    return state().structuredPregame?.(CR.gameDay) || {};
  }

  function getFinalData() {
    return {
      scores: clone(CR.gameDay.live?.scores),
      users: clone(CR.gameDay.live?.users)
    };
  }

  function winnerText(scores = {}) {
    return state().winnerText?.(scores, currentSource()) || 'Rivalry Tie';
  }

  function nextDraftSide() {
    if (!hasScheduledGame()) return null;
    return state().nextDraftSide?.(CR.gameDay) || null;
  }

  function claimedOwner(name) {
    return state().claimedOwner?.(CR.gameDay, name) || '';
  }

  function allLivePicks(users = {}) {
    return Object.values(users || {}).flat();
  }

  function totalGoals(users = {}) {
    return allLivePicks(users).reduce((total, pick) => total + Number(pick.goals || 0), 0);
  }

  function totalAssists(users = {}) {
    return allLivePicks(users).reduce((total, pick) => total + Number(pick.assists || 0), 0);
  }

  function firstGoalHit(users = {}) {
    return allLivePicks(users).find((pick) => pick.firstGoal);
  }

  function firstGoalSummary(users = {}, mode = CR.gameDay.mode) {
    const bonus = firstGoalHit(users);
    if (bonus) return `${bonus.player} hit the first goal bonus.`;
    return mode === 'final' ? 'No first goal bonus recorded.' : 'First goal bonus still live.';
  }

  function leadingStatType(users = {}) {
    const goals = totalGoals(users);
    const assists = totalAssists(users);
    if (goals > assists) return 'Goals carried the night.';
    if (assists > goals) return 'Assists drove the scoring.';
    return 'Goals and assists stayed balanced.';
  }

  function totalEventsText(users = {}) {
    return `${totalGoals(users)} goals • ${totalAssists(users)} assists`;
  }

  function mvpText(users = {}) {
    const picks = allLivePicks(users).slice().sort((a, b) => pointsFor(b) - pointsFor(a));
    return picks[0]?.player ? `${picks[0].player} led the rivalry card.` : 'No player separated yet.';
  }

  function payloadBelongsToCurrentGame(payload) {
    const row = payload.new || payload.old || {};
    if (!CR.gameDay.currentGameId) return true;
    if (payload.table === 'games') return String(row.id || '') === String(CR.gameDay.currentGameId);
    if (payload.table === 'picks') return String(row.game_id || '') === String(CR.gameDay.currentGameId);
    return true;
  }

  function markRealtimeChanged(payloads = []) {
    const keys = ['gameday:sync'];
    payloads.forEach((payload) => {
      const row = payload.new || payload.old || {};
      if (payload.table === 'games') {
        if ('first_goal_scorer' in row) keys.push('gameday:first-goal');
        if ('status' in row) keys.push('gameday:feed');
      }
      if (payload.table === 'picks') {
        const player = row.player_name || row.player || row.id;
        if (player) {
          ['goals', 'assists', 'points'].forEach((stat) => keys.push(`gameday:pick:${CR.gameDayRenderUtils?.normalizeKeyPart?.(player) || player}:${stat}`));
        }
        keys.push('gameday:feed');
      }
    });
    CR.ui?.markChanged?.(Array.from(new Set(keys)));
  }

  function applyGameDayData(data = {}) {
    if (!data || typeof data !== 'object') return CR.gameDay;
    CR.gameDay = {
      ...CR.gameDay,
      ...data,
      game: { ...CR.gameDay.game, ...(data.game || {}) },
      carryover: { ...CR.gameDay.carryover, ...(data.carryover || {}) },
      draft: { ...CR.gameDay.draft, ...(data.draft || {}) },
      live: {
        ...CR.gameDay.live,
        ...(data.live || {}),
        scores: { ...(CR.gameDay.live?.scores || {}), ...(data.live?.scores || {}) },
        users: data.live?.users || CR.gameDay.live?.users || {}
      },
      pregame: data.pregame || CR.gameDay.pregame || {},
      roster: data.roster || CR.gameDay.roster || []
    };
    CR.gameDayRoster = CR.gameDay.roster || CR.gameDayRoster || fallbackRoster;
    CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users });
    return CR.gameDay;
  }

  async function refreshGameDayData(options = {}) {
    if (options.skipIfEditing && isUserEditing()) return CR.gameDay;
    if (!CR.gameDayDataService?.fetchGameDayData) {
      CR.renderGameDayState?.();
      return CR.gameDay;
    }
    try {
      const data = await CR.gameDayDataService.fetchGameDayData();
      applyGameDayData(data);
      CR.gameDayEdit?.clearEditing?.();
      CR.renderGameDayState(data.mode || CR.gameDay.mode);
      if (options.flash) CR.flashSync?.();
      if (options.toast) CR.showToast?.('Game Day updated');
      return CR.gameDay;
    } catch (error) {
      console.error('Game Day refresh failed', error);
      if (options.toast) CR.showToast?.({ message: 'Could not refresh Game Day', tier: 'warning' });
      return CR.gameDay;
    }
  }

  async function saveGameDayPicks() {
    const button = $('#saveSheet');
    try {
      if (!hasScheduledGame()) throw new Error('Picks cannot be saved until a game is scheduled.');
      if (CR.gameDay.mode === 'final') throw new Error('Final games are locked. Use History to correct finalized stats.');
      CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' });
      await CR.gameDaySaveService?.savePregamePicks?.(CR.gameDay.currentGameId, CR.gameDay.pregame);
      CR.gameDayEdit?.clearEditing?.();
      setModalOpen(false);
      await refreshGameDayData({ flash: true });
      CR.showToast?.('Picks saved');
    } catch (error) {
      console.error('Game Day pick save failed', error);
      CR.showToast?.({ message: error?.message || 'Could not save picks', tier: 'warning' });
    } finally {
      CR.ui?.setActionBusy?.(button, false);
    }
  }

  async function undoLastDraftPick() {
    const button = $('#undoDraftPick');
    try {
      if (!canManagePicks()) throw new Error('Draft undo is not available right now.');
      CR.ui?.setActionBusy?.(button, true, { label: 'Undoing…' });
      await CR.gameDaySaveService?.undoLastDraftPick?.(CR.gameDay.currentGameId);
      CR.gameDayEdit?.clearEditing?.();
      setModalOpen(false);
      await refreshGameDayData({ flash: true });
      CR.showToast?.('Last draft pick undone');
    } catch (error) {
      console.error('Draft undo failed', error);
      CR.showToast?.({ message: error?.message || 'Could not undo last pick', tier: 'warning' });
    } finally {
      CR.ui?.setActionBusy?.(button, false);
    }
  }

  function registerRealtime() {
    if (CR.__gameDayRealtimeRegistered || !CR.realtime?.register) return;
    CR.__gameDayRealtimeRegistered = true;
    CR.realtime.register('gameday', {
      tables: ['games', 'picks'],
      debounceMs: 250,
      onChange: async (payloads = []) => {
        if (!payloads.some(payloadBelongsToCurrentGame)) return;
        if (isUserEditing()) return;
        markRealtimeChanged(payloads);
        await refreshGameDayData({ flash: true, skipIfEditing: true });
      }
    });
    CR.realtime.start?.();
  }

  function renderPlayerCard(args = {}) {
    return render.renderPlayerCard({ ...args, pointsFor });
  }

  function setModalOpen(isOpen) {
    const modal = $('#manageSheet');
    if (!modal) return;
    modal.classList.toggle('is-open', isOpen);
    if (isOpen) CR.ui?.lockBodyScroll?.('manage-sheet-open');
    else CR.ui?.unlockBodyScroll?.('manage-sheet-open');
  }

  function updateGlobalIndicators() {
    $('#globalLiveIndicator')?.classList.toggle('is-hidden', CR.gameDay.mode !== 'live');
    $('#globalMockIndicator')?.classList.toggle('is-hidden', !CR.gameDayMockService?.isEnabled?.());
  }

  function renderHero() {
    return render.renderHeroSection({
      mode: CR.gameDay.mode,
      game: CR.gameDay.game,
      pregameUsers: getPregameStructured(),
      live: CR.gameDay.live,
      final: getFinalData(),
      isPlayoffs: isPlayoffs(),
      winnerText,
      nextDraftSide: nextDraftSide(),
      draft: CR.gameDay.draft
    });
  }

  function renderPregame() {
    return render.renderPregameSection({
      users: getPregameStructured(),
      roster: getRoster(),
      claimedOwner,
      isPlayoffs: isPlayoffs()
    });
  }

  function renderLive() {
    return render.renderLiveSection({
      state: CR.gameDay.live,
      renderPlayerCard,
      carryover: CR.gameDay.carryover,
      isPlayoffs: isPlayoffs()
    });
  }

  function renderFinal() {
    const final = getFinalData();
    return render.renderFinalSection({
      state: final,
      bonusText: firstGoalSummary(final.users, 'final'),
      mvpText: mvpText(final.users),
      edgeText: leadingStatType(final.users),
      totalEventsText: totalEventsText(final.users),
      renderPlayerCard: (args) => renderPlayerCard({ ...args, isFinal: true }),
      carryover: CR.gameDay.carryover,
      isPlayoffs: isPlayoffs()
    });
  }

  function manageSheetStatusCopy(picksEnabled) {
    if (!hasScheduledGame()) return { title: 'Schedule pending', detail: 'Picks can be managed after the next game is scheduled.', saveLabel: 'Schedule Pending' };
    if (CR.gameDay.mode === 'live') return { title: 'Live game pick management', detail: 'Pick swaps are allowed here; live stats remain read-only and come from NHL sync.', saveLabel: picksEnabled ? 'Save Live Picks' : 'Locked' };
    if (CR.gameDay.mode === 'final') return { title: 'Final game locked', detail: 'Finalized games are read-only on Game Day. Use History for stat corrections.', saveLabel: 'Final Locked' };
    return { title: 'Admin override', detail: 'Use this only to fix mistakes or draft for someone unavailable.', saveLabel: picksEnabled ? 'Save Override' : 'Locked' };
  }

  function renderManageSheet() {
    const actions = $('#manageSheetActions');
    const saveButton = $('#saveSheet');
    if (!actions) return;
    const picksEnabled = canManagePicks();
    const selectedPlayers = state().selectedPregamePlayers?.(CR.gameDay) || [];
    const status = manageSheetStatusCopy(picksEnabled);
    if (saveButton) {
      saveButton.disabled = !picksEnabled;
      saveButton.textContent = status.saveLabel;
    }
    const statusCopy = `<div class="gd-sheet-pick ${!picksEnabled ? 'is-disabled' : ''}"><strong>${status.title}</strong><small>${status.detail}</small></div>`;
    const undoAction = `<button class="cr-button secondary gd-inline-action" id="undoDraftPick" type="button" ${picksEnabled ? '' : 'disabled'}>Undo Last Draft Pick</button>`;
    const pickControls = (state().sideKeys?.(currentSource()) || []).flatMap((sideKey, sideIndex) => [0, 1].map((index) => {
      const selected = CR.gameDay.pregame?.[sideKey]?.[index] || '';
      const options = [''].concat(getRoster().map((player) => player.name)).map((name) => {
        const disabled = !picksEnabled || (name && selectedPlayers.includes(name) && name !== selected);
        return `<option value="${name}" ${name === selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${name || 'Open slot'}</option>`;
      }).join('');
      return `<div class="gd-sheet-pick ${!picksEnabled ? 'is-disabled' : ''}"><strong>${state().displayName?.(sideIndex, currentSource()) || `Player ${sideIndex + 1}`} Pick ${index + 1}</strong><small>${picksEnabled ? (CR.gameDay.mode === 'live' ? 'Swap picked player only' : 'Override locked player') : 'Locked'}</small><select class="gd-sheet-select" data-side-key="${sideKey}" data-index="${index}" ${picksEnabled ? '' : 'disabled'}>${options}</select></div>`;
    }).join('')).join('');
    actions.innerHTML = statusCopy + undoAction + pickControls;
    $('#undoDraftPick')?.addEventListener('click', undoLastDraftPick);
    actions.querySelectorAll('.gd-sheet-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        if (!canManagePicks()) return;
        const sideKey = event.target.dataset.sideKey;
        const index = Number(event.target.dataset.index);
        const updated = (CR.gameDay.pregame?.[sideKey] || []).slice();
        updated[index] = event.target.value;
        CR.gameDay.pregame[sideKey] = updated.filter(Boolean);
        if (CR.gameDay.carryover?.active) CR.gameDay.carryover.active = false;
        CR.gameDayEdit?.markEditing?.();
        renderManageSheet();
      });
    });
  }

  function bindInteractions() {
    events.bind?.({
      claimedOwner,
      draftOrder: state().draftOrder?.(currentSource()) || [],
      nextDraftSide,
      renderManageSheet,
      setModalOpen,
      rerender: CR.renderGameDayState
    });
  }

  CR.renderGameDayState = (mode = CR.gameDay.mode) => {
    CR.gameDay.mode = mode;
    CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users });
    const container = $('#gameDayContent');
    const view = $('#gameDayView');
    if (!container || !view) return;
    view.classList.toggle('mode-playoffs', isPlayoffs());
    view.classList.toggle('is-realtime-changed', CR.ui?.isChanged?.('gameday:sync'));
    container.innerHTML = [renderHero(), mode === 'pregame' ? renderPregame() : '', mode === 'live' ? renderLive() : '', mode === 'final' ? renderFinal() : ''].join('');
    const stateTitle = $('#stateTitle');
    const stateBadge = $('#stateBadge');
    if (stateTitle) stateTitle.textContent = modeLabel(mode);
    if (stateBadge) stateBadge.textContent = isPlayoffs() ? 'Playoffs' : (mode === 'pregame' ? 'Regular' : modeLabel(mode));
    $('#phaseSwitcher')?.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.phase === mode));
    $('#modeSwitcher')?.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.playoffMode === CR.gameDay.playoffMode));
    $('#carryoverSwitcher')?.querySelectorAll('button').forEach((button) => button.classList.toggle('active', (button.dataset.carryover === 'on') === Boolean(CR.gameDay.carryover?.active)));
    updateGlobalIndicators();
    bindInteractions();
  };

  CR.initGameDay = () => {
    $('#phaseSwitcher')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-phase]');
      if (button) CR.renderGameDayState(button.dataset.phase);
    });
    $('#modeSwitcher')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-playoff-mode]');
      if (!button) return;
      CR.gameDay.playoffMode = button.dataset.playoffMode;
      CR.renderGameDayState();
    });
    $('#carryoverSwitcher')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-carryover]');
      if (!button) return;
      CR.gameDay.carryover = { active: button.dataset.carryover === 'on' };
      CR.renderGameDayState();
    });
    $('#refreshButton')?.addEventListener('click', () => CR.refreshGameDayData?.({ toast: true, flash: true }));
    $('#closeSheet')?.addEventListener('click', () => setModalOpen(false));
    $('#saveSheet')?.addEventListener('click', saveGameDayPicks);
    $('#manageSheet')?.addEventListener('click', (event) => { if (event.target.id === 'manageSheet') setModalOpen(false); });
    CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users });
    CR.renderGameDayState(CR.gameDay.mode || 'pregame');
    refreshGameDayData();
    registerRealtime();
  };

  CR.applyGameDayData = applyGameDayData;
  CR.refreshGameDayData = refreshGameDayData;
  CR.registerGameDayRealtime = registerRealtime;
})();
