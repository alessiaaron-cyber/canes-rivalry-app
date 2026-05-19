window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const render = () => CR.gameDayRender || {};
  const state = () => CR.gameDayStateUtils || {};
  const draft = () => CR.gameDayDraftService || {};
  const edit = () => CR.gameDayManageEditService || {};

  const $ = (selector) => document.querySelector(selector);
  const clone = (value) => JSON.parse(JSON.stringify(value || {}));

  function source() {
    return { users: CR.gameDay?.users || [] };
  }

  function emptyState() {
    const users = CR.identity?.getUsers?.() || [];
    const userSource = { users };
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
      users,
      pregame: state().emptyPickBuckets?.(userSource) || {},
      live: {
        scores: state().emptyScoreBuckets?.(userSource) || {},
        period: 'Schedule pending',
        users: state().emptyPickBuckets?.(userSource) || {},
        feed: []
      },
      roster: []
    };
  }

  function ensureState() {
    CR.gameDay = {
      ...emptyState(),
      ...(CR.gameDay || {})
    };
    CR.gameDay.carryover = CR.gameDay.carryover || { active: false };
    CR.gameDay.live = CR.gameDay.live || emptyState().live;
    CR.gameDay.pregame = CR.gameDay.pregame || {};
    CR.gameDay.users = CR.gameDay.users || [];
    CR.gameDay.roster = CR.gameDay.roster || [];
    CR.gameDayRoster = CR.gameDay.roster || CR.gameDayRoster || [];
  }

  function hasScheduledGame() {
    const game = CR.gameDay?.game || {};
    return Boolean(game.hasGame && game.scheduleText && game.scheduleText !== 'Schedule pending');
  }

  function canManagePicks() {
    return hasScheduledGame() && CR.gameDay?.mode !== 'final';
  }

  function isEditing() {
    return Boolean(CR.gameDayEditState?.isEditing);
  }

  function isPlayoffs() {
    return CR.gameDay?.playoffMode === 'playoffs';
  }

  function modeLabel(mode) {
    if (mode === 'pregame') return 'Pregame';
    if (mode === 'live') return 'Live';
    return 'Final';
  }

  function pickLabel(value) {
    return draft().pickLabel?.(value) || state().pickLabel?.(value) || (typeof value === 'string' ? value.trim() : '');
  }

  function pickLabels(values = []) {
    return (Array.isArray(values) ? values : []).map(pickLabel).filter(Boolean);
  }

  function currentPregameForSheet() {
    return edit().getBuffer?.() || CR.gameDay?.pregame || {};
  }

  function pregameStructured() {
    return state().structuredPregame?.(CR.gameDay) || {};
  }

  function finalData() {
    return {
      scores: clone(CR.gameDay?.live?.scores || {}),
      users: clone(CR.gameDay?.live?.users || {})
    };
  }

  function pointsFor(pick = {}) {
    return CR.gameDayModel?.pointsFor?.(pick) || ((Number(pick.goals || 0) * 2) + Number(pick.assists || 0) + (pick.firstGoal ? 2 : 0));
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

  function firstGoalSummary(users = {}, mode = CR.gameDay?.mode) {
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

  function winnerText(scores = {}) {
    return state().winnerText?.(scores, source()) || 'Rivalry Tie';
  }

  function nextDraftSide() {
    return draft().firstUnfilledSlot?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [])?.sideKey || null;
  }

  function claimedOwner(name) {
    return state().claimedOwner?.(CR.gameDay, name) || '';
  }

  function roster() {
    return CR.gameDay?.roster || CR.gameDayRoster || [];
  }

  function renderPlayerCard(args = {}) {
    return render().renderPlayerCard?.({ ...args, pointsFor }) || '';
  }

  function applyGameDayData(data = {}) {
    if (!data || typeof data !== 'object') return CR.gameDay;
    ensureState();
    CR.gameDay = {
      ...CR.gameDay,
      ...data,
      game: { ...(CR.gameDay.game || {}), ...(data.game || {}) },
      carryover: { ...(CR.gameDay.carryover || {}), ...(data.carryover || {}) },
      draft: { ...(CR.gameDay.draft || {}), ...(data.draft || {}) },
      live: {
        ...(CR.gameDay.live || {}),
        ...(data.live || {}),
        scores: { ...(CR.gameDay.live?.scores || {}), ...(data.live?.scores || {}) },
        users: data.live?.users || CR.gameDay.live?.users || {}
      },
      pregame: data.pregame || CR.gameDay.pregame || {},
      roster: data.roster || CR.gameDay.roster || []
    };
    CR.gameDayRoster = CR.gameDay.roster || CR.gameDayRoster || [];
    CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users });
    return CR.gameDay;
  }

  async function refreshGameDayData(options = {}) {
    if (options.skipIfEditing && isEditing()) return CR.gameDay;
    try {
      const data = await CR.gameDayDataService?.fetchGameDayData?.();
      if (data) applyGameDayData(data);
      edit().clear?.();
      renderGameDayState(data?.mode || CR.gameDay?.mode || 'pregame');
      if (options.flash) CR.flashSync?.();
      if (options.toast) CR.showToast?.('Game Day updated');
      return CR.gameDay;
    } catch (error) {
      console.error('Game Day refresh failed', error);
      if (options.toast) CR.showToast?.({ message: 'Could not refresh Game Day', tier: 'warning' });
      return CR.gameDay;
    }
  }

  function setModalOpen(isOpen) {
    const modal = $('#manageSheet');
    if (!modal) return;
    if (isOpen) {
      edit().openBuffer?.(CR.gameDay?.pregame || {});
      modal.classList.add('is-open');
      CR.ui?.lockBodyScroll?.('manage-sheet-open');
      renderManageSheet();
    } else {
      edit().clear?.();
      modal.classList.remove('is-open');
      CR.ui?.unlockBodyScroll?.('manage-sheet-open');
    }
  }

  function statusCopy(picksEnabled) {
    if (!hasScheduledGame()) return { title: 'Schedule pending', detail: 'Picks can be managed after the next game is scheduled.', saveLabel: 'Schedule Pending' };
    if (CR.gameDay?.mode === 'live') return { title: 'Live game pick management', detail: 'Pick swaps are allowed here; live stats remain read-only and come from NHL sync.', saveLabel: picksEnabled ? 'Save Live Picks' : 'Locked' };
    if (CR.gameDay?.mode === 'final') return { title: 'Final game locked', detail: 'Finalized games are read-only on Game Day. Use History for stat corrections.', saveLabel: 'Final Locked' };
    return { title: 'Admin override', detail: 'Use this only to fix mistakes or draft for someone unavailable.', saveLabel: picksEnabled ? 'Save Override' : 'Locked' };
  }

  function renderManageSheet() {
    const actions = $('#manageSheetActions');
    const saveButton = $('#saveSheet');
    if (!actions) return;

    const picksEnabled = canManagePicks();
    const bufferPregame = currentPregameForSheet();
    const sideKeys = draft().sideKeys?.(CR.gameDay?.users || []) || state().sideKeys?.(source()) || [];
    const selectedPlayers = sideKeys.flatMap((key) => pickLabels(bufferPregame?.[key] || []));
    const status = statusCopy(picksEnabled);

    if (saveButton) {
      saveButton.disabled = !picksEnabled;
      saveButton.textContent = status.saveLabel;
    }

    const statusHtml = `<div class="gd-sheet-pick ${!picksEnabled ? 'is-disabled' : ''}"><strong>${status.title}</strong><small>${status.detail}</small></div>`;
    const undoHtml = `<button class="cr-button secondary gd-inline-action" id="undoDraftPick" type="button" ${picksEnabled ? '' : 'disabled'}>Undo Last Draft Pick</button>`;
    const controlsHtml = sideKeys.flatMap((sideKey, sideIndex) => [0, 1].map((index) => {
      const selected = pickLabel(bufferPregame?.[sideKey]?.[index] || '');
      const options = [''].concat(roster().map((player) => player.name)).map((name) => {
        const disabled = !picksEnabled || (name && selectedPlayers.includes(name) && name !== selected);
        return `<option value="${name}" ${name === selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${name || 'Open slot'}</option>`;
      }).join('');
      return `<div class="gd-sheet-pick ${!picksEnabled ? 'is-disabled' : ''}"><strong>${state().displayName?.(sideIndex, source()) || `Player ${sideIndex + 1}`} Pick ${index + 1}</strong><small>${picksEnabled ? (CR.gameDay?.mode === 'live' ? 'Swap picked player only' : 'Override locked player') : 'Locked'}</small><select class="gd-sheet-select" data-side-key="${sideKey}" data-index="${index}" ${picksEnabled ? '' : 'disabled'}>${options}</select></div>`;
    }).join('')).join('');

    actions.innerHTML = statusHtml + undoHtml + controlsHtml;
    $('#undoDraftPick')?.addEventListener('click', undoLastDraftPick);
    actions.querySelectorAll('.gd-sheet-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        if (!canManagePicks()) return;
        edit().updatePick?.(event.target.dataset.sideKey, Number(event.target.dataset.index), event.target.value);
        renderManageSheet();
      });
    });
  }

  async function saveGameDayPicks() {
    const button = $('#saveSheet');
    try {
      if (!canManagePicks()) throw new Error('Picks cannot be saved right now.');
      CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' });
      const nextPregame = clone(edit().getBuffer?.() || CR.gameDay?.pregame || {});
      const nextDraft = draft().computeDraftState?.(nextPregame, CR.gameDay?.users || [], CR.gameDay?.draft || {}) || CR.gameDay?.draft;
      CR.gameDay.pregame = nextPregame;
      CR.gameDay.draft = nextDraft;
      await CR.gameDaySaveService?.savePregamePicks?.(CR.gameDay.currentGameId, nextPregame, nextDraft);
      edit().clear?.();
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
      edit().clear?.();
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

  function updateGlobalIndicators() {
    $('#globalLiveIndicator')?.classList.toggle('is-hidden', CR.gameDay?.mode !== 'live');
    $('#globalMockIndicator')?.classList.toggle('is-hidden', !CR.gameDayMockService?.isEnabled?.());
  }

  function renderHero() {
    return render().renderHeroSection?.({ mode: CR.gameDay.mode, game: CR.gameDay.game, pregameUsers: pregameStructured(), live: CR.gameDay.live, final: finalData(), isPlayoffs: isPlayoffs(), winnerText, nextDraftSide: nextDraftSide(), draft: CR.gameDay.draft }) || '';
  }

  function renderPregame() {
    return render().renderPregameSection?.({ users: pregameStructured(), roster: roster(), claimedOwner, isPlayoffs: isPlayoffs() }) || '';
  }

  function renderLive() {
    return render().renderLiveSection?.({ state: CR.gameDay.live, renderPlayerCard, carryover: CR.gameDay.carryover, isPlayoffs: isPlayoffs() }) || '';
  }

  function renderFinal() {
    const final = finalData();
    return render().renderFinalSection?.({ state: final, bonusText: firstGoalSummary(final.users, 'final'), mvpText: mvpText(final.users), edgeText: leadingStatType(final.users), totalEventsText: totalEventsText(final.users), renderPlayerCard: (args) => renderPlayerCard({ ...args, isFinal: true }), carryover: CR.gameDay.carryover, isPlayoffs: isPlayoffs() }) || '';
  }

  function renderGameDayState(mode = CR.gameDay?.mode || 'pregame') {
    ensureState();
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
    updateGlobalIndicators();
    bindInteractions();
  }

  function payloadBelongsToCurrentGame(payload) {
    const row = payload.new || payload.old || {};
    if (!CR.gameDay?.currentGameId) return true;
    if (payload.table === 'games') return String(row.id || '') === String(CR.gameDay.currentGameId);
    if (payload.table === 'picks') return String(row.game_id || '') === String(CR.gameDay.currentGameId);
    return true;
  }

  function registerRealtime() {
    if (CR.__gameDayRealtimeRegistered || !CR.realtime?.register) return;
    CR.__gameDayRealtimeRegistered = true;
    CR.realtime.register('gameday', {
      tables: ['games', 'picks'],
      debounceMs: 250,
      onChange: async (payloads = []) => {
        if (!payloads.some(payloadBelongsToCurrentGame)) return;
        if (isEditing()) return;
        await refreshGameDayData({ flash: true, skipIfEditing: true });
      }
    });
    CR.realtime.start?.();
  }

  function bindInteractions() {
    CR.gameDayEvents?.bind?.({ claimedOwner, draftOrder: state().draftOrder?.(source()) || [], nextDraftSide, renderManageSheet, setModalOpen, rerender: renderGameDayState });
  }

  function initGameDay() {
    ensureState();
    $('#refreshButton')?.addEventListener('click', () => refreshGameDayData({ toast: true, flash: true }));
    $('#closeSheet')?.addEventListener('click', () => setModalOpen(false));
    $('#saveSheet')?.addEventListener('click', saveGameDayPicks);
    $('#manageSheet')?.addEventListener('click', (event) => { if (event.target.id === 'manageSheet') setModalOpen(false); });
    CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users });
    renderGameDayState(CR.gameDay.mode || 'pregame');
    refreshGameDayData();
    registerRealtime();
  }

  CR.applyGameDayData = applyGameDayData;
  CR.refreshGameDayData = refreshGameDayData;
  CR.renderGameDayState = renderGameDayState;
  CR.initGameDay = initGameDay;
  CR.registerGameDayRealtime = registerRealtime;
})();