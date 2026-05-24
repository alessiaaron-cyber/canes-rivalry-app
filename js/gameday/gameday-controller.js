window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const render = () => CR.gameDayRender || {};
  const state = () => CR.gameDayStateUtils || {};
  const draft = () => CR.gameDayDraftService || {};

  const $ = (selector) => document.querySelector(selector);
  const clone = (value) => JSON.parse(JSON.stringify(value || {}));

  function source() { return { users: CR.gameDay?.users || [] }; }

  function emptyState() {
    const users = CR.identity?.getUsers?.() || [];
    const userSource = { users };
    return { source: 'empty', currentGameId: '', mode: 'pregame', playoffMode: 'regular', carryover: { active: false }, game: { hasGame: false, scheduleText: 'Schedule pending', opponent: '', headline: 'Next game not scheduled yet' }, nextGame: null, draft: { status: 'pending', currentPickNumber: 0, currentPicker: { id: '', displayName: '', profileKey: '' }, firstPicker: '' }, users, pregame: state().emptyPickBuckets?.(userSource) || {}, live: { scores: state().emptyScoreBuckets?.(userSource) || {}, period: 'Schedule pending', users: state().emptyPickBuckets?.(userSource) || {}, feed: [] }, roster: [] };
  }

  function ensureState() {
    CR.gameDay = { ...emptyState(), ...(CR.gameDay || {}) };
    CR.gameDay.carryover = CR.gameDay.carryover || { active: false };
    CR.gameDay.live = CR.gameDay.live || emptyState().live;
    CR.gameDay.pregame = CR.gameDay.pregame || {};
    CR.gameDay.users = CR.gameDay.users || [];
    CR.gameDay.roster = CR.gameDay.roster || [];
    CR.gameDayRoster = CR.gameDay.roster || CR.gameDayRoster || [];
  }

  function isEditing() { return Boolean(CR.gameDayEditState?.isEditing); }
  function isPlayoffs() { return CR.gameDay?.playoffMode === 'playoffs'; }
  function modeLabel(mode) { if (mode === 'pregame') return 'Pregame'; if (mode === 'live') return 'Live'; return 'Final'; }
  function pickLabel(value) { return draft().pickLabel?.(value) || state().pickLabel?.(value) || (typeof value === 'string' ? value.trim() : ''); }
  function pickLabels(values = []) { return (Array.isArray(values) ? values : []).map(pickLabel).filter(Boolean); }
  function sideKeys() { return draft().sideKeys?.(CR.gameDay?.users || []) || state().sideKeys?.(source()) || []; }

  function pregameStructuredFrom(pregame = CR.gameDay?.pregame || {}) { return sideKeys().reduce((acc, key) => { acc[key] = pickLabels(pregame?.[key] || []).map((player) => ({ player })); return acc; }, {}); }
  function derivedDraft() { return draft().computeDraftState?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [], CR.gameDay?.draft || {}) || CR.gameDay?.draft || {}; }
  function pregameStructured() { return pregameStructuredFrom(CR.gameDay?.pregame || {}); }
  function finalData() { return { scores: clone(CR.gameDay?.live?.scores || {}), users: clone(CR.gameDay?.live?.users || {}) }; }
  function pointsFor(pick = {}) { const explicit = Number(pick.points); if (Number.isFinite(explicit)) return explicit; return CR.gameDayModel?.pointsFor?.(pick) || ((Number(pick.goals || 0) * 2) + Number(pick.assists || 0) + (pick.firstGoal ? 1 : 0)); }
  function allLivePicks(users = {}) { return Object.values(users || {}).flat(); }
  function totalGoals(users = {}) { return allLivePicks(users).reduce((total, pick) => total + Number(pick.goals || 0), 0); }
  function totalAssists(users = {}) { return allLivePicks(users).reduce((total, pick) => total + Number(pick.assists || 0), 0); }
  function firstGoalHit(users = {}) { return allLivePicks(users).find((pick) => pick.firstGoal); }
  function firstGoalSummary(users = {}, mode = CR.gameDay?.mode) { const bonus = firstGoalHit(users); if (bonus) return `${bonus.player} hit the first goal bonus.`; return mode === 'final' ? 'No first goal bonus recorded.' : 'First goal bonus still live.'; }
  function leadingStatType(users = {}) { const goals = totalGoals(users); const assists = totalAssists(users); if (goals > assists) return 'Goals carried the night.'; if (assists > goals) return 'Assists drove the scoring.'; return 'Goals and assists stayed balanced.'; }
  function totalEventsText(users = {}) { return `${totalGoals(users)} goals • ${totalAssists(users)} assists`; }
  function mvpText(users = {}) { const picks = allLivePicks(users).slice().sort((a, b) => pointsFor(b) - pointsFor(a)); const topPick = picks[0]; return topPick?.player && pointsFor(topPick) > 0 ? `${topPick.player} led the rivalry card.` : 'No MVP earned.'; }
  function winnerText(scores = {}) { return state().winnerText?.(scores, source()) || 'Rivalry Tie'; }
  function nextDraftSide() { return draft().firstUnfilledSlot?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [])?.sideKey || null; }
  function claimedOwner(name) { return state().claimedOwner?.(CR.gameDay, name) || ''; }
  function roster() { return CR.gameDay?.roster || CR.gameDayRoster || []; }
  function renderPlayerCard(args = {}) { return render().renderPlayerCard?.({ ...args, pointsFor }) || ''; }

  function applyGameDayData(data = {}) { if (!data || typeof data !== 'object') return CR.gameDay; ensureState(); CR.gameDay = { ...CR.gameDay, ...data, game: { ...(CR.gameDay.game || {}), ...(data.game || {}) }, nextGame: data.nextGame || null, carryover: { ...(CR.gameDay.carryover || {}), ...(data.carryover || {}) }, draft: { ...(CR.gameDay.draft || {}), ...(data.draft || {}) }, live: { ...(CR.gameDay.live || {}), ...(data.live || {}), scores: { ...(CR.gameDay.live?.scores || {}), ...(data.live?.scores || {}) }, users: data.live?.users || CR.gameDay.live?.users || {} }, pregame: data.pregame || CR.gameDay.pregame || {}, roster: data.roster || CR.gameDay.roster || [] }; CR.gameDay.draft = derivedDraft(); CR.gameDayRoster = CR.gameDay.roster || CR.gameDayRoster || []; CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users }); return CR.gameDay; }
  async function refreshGameDayData(options = {}) { if (options.skipIfEditing && isEditing()) return CR.gameDay; try { const data = await CR.gameDayDataService?.fetchGameDayData?.(); if (data) applyGameDayData(data); CR.gameDayManageEditService?.clear?.(); renderGameDayState(data?.mode || CR.gameDay?.mode || 'pregame'); if (options.flash) CR.flashSync?.(); if (options.toast) CR.showToast?.('Game Day updated'); return CR.gameDay; } catch (error) { console.error('Game Day refresh failed', error); if (options.toast) CR.showToast?.({ message: 'Could not refresh Game Day', tier: 'warning' }); return CR.gameDay; } }

  function updateGlobalIndicators() { $('#globalLiveIndicator')?.classList.toggle('is-hidden', CR.gameDay?.mode !== 'live'); $('#globalMockIndicator')?.classList.toggle('is-hidden', !CR.gameDayMockService?.isEnabled?.()); }
  function renderHero() { const visibleDraft = derivedDraft(); return render().renderHeroSection?.({ mode: CR.gameDay.mode, game: CR.gameDay.game, pregameUsers: pregameStructured(), live: CR.gameDay.live, final: finalData(), isPlayoffs: isPlayoffs(), winnerText, nextDraftSide: nextDraftSide(), draft: visibleDraft }) || ''; }
  function renderPregame() { return render().renderPregameSection?.({ users: pregameStructured(), roster: roster(), claimedOwner, isPlayoffs: isPlayoffs() }) || ''; }
  function renderLive() { return render().renderLiveSection?.({ state: { ...(CR.gameDay.live || {}), game: CR.gameDay.game || {} }, renderPlayerCard, carryover: CR.gameDay.carryover, isPlayoffs: isPlayoffs() }) || ''; }
  function renderFinal() { const final = finalData(); return render().renderFinalSection?.({ state: final, bonusText: firstGoalSummary(final.users, 'final'), mvpText: mvpText(final.users), edgeText: leadingStatType(final.users), totalEventsText: totalEventsText(final.users), renderPlayerCard: (args) => renderPlayerCard({ ...args, isFinal: true }), carryover: CR.gameDay.carryover, isPlayoffs: isPlayoffs(), nextGame: CR.gameDay.nextGame }) || ''; }

  function renderGameDayState(mode = CR.gameDay?.mode || 'pregame') { ensureState(); CR.gameDay.mode = mode; CR.gameDay.draft = derivedDraft(); CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users }); const container = $('#gameDayContent'); const view = $('#gameDayView'); if (!container || !view) return; view.classList.toggle('mode-playoffs', isPlayoffs()); view.classList.toggle('is-realtime-changed', CR.ui?.isChanged?.('gameday:sync')); container.innerHTML = [renderHero(), mode === 'pregame' ? renderPregame() : '', mode === 'live' ? renderLive() : '', mode === 'final' ? renderFinal() : ''].join(''); const stateTitle = $('#stateTitle'); const stateBadge = $('#stateBadge'); if (stateTitle) stateTitle.textContent = modeLabel(mode); if (stateBadge) stateBadge.textContent = isPlayoffs() ? 'Playoffs' : (mode === 'pregame' ? 'Regular' : modeLabel(mode)); updateGlobalIndicators(); bindInteractions(); }
  function shouldRealtimeRefreshGameDay(payload) { const row = payload.new || payload.old || {}; if (payload.table === 'games') return true; if (!CR.gameDay?.currentGameId) return true; if (payload.table === 'picks') return String(row.game_id || '') === String(CR.gameDay.currentGameId); return true; }
  function registerRealtime() { if (CR.__gameDayRealtimeRegistered || !CR.realtime?.register) return; CR.__gameDayRealtimeRegistered = true; CR.realtime.register('gameday', { tables: ['games', 'picks'], debounceMs: 250, onChange: async (payloads = []) => { if (!payloads.some(shouldRealtimeRefreshGameDay)) return; if (isEditing()) return; await refreshGameDayData({ flash: true, skipIfEditing: true }); } }); CR.realtime.start?.(); }
  function registerFocusRefresh() { if (CR.__gameDayFocusRefreshRegistered) return; CR.__gameDayFocusRefreshRegistered = true; let lastRefreshAt = 0; const maybeRefresh = async () => { if (document.hidden || isEditing()) return; const now = Date.now(); if (now - lastRefreshAt < 45000) return; lastRefreshAt = now; await refreshGameDayData({ skipIfEditing: true }); }; document.addEventListener('visibilitychange', maybeRefresh); window.addEventListener('focus', maybeRefresh); }
  function bindInteractions() { CR.gameDayEvents?.bind?.({ claimedOwner, draftOrder: state().draftOrder?.(source()) || [], nextDraftSide, renderManageSheet: CR.gameDayManageSheet?.render, setModalOpen: CR.gameDayManageSheet?.setOpen, rerender: renderGameDayState }); }
  function initGameDay() { ensureState(); $('#refreshButton')?.addEventListener('click', () => refreshGameDayData({ toast: true, flash: true })); CR.gameDayManageSheet?.bind?.({ refreshGameDayData }); CR.identity?.applyUserColorVariables?.({ users: CR.gameDay.users }); renderGameDayState(CR.gameDay.mode || 'pregame'); if (CR.__initialGameDayPrimed) CR.__initialGameDayPrimed = false; else refreshGameDayData(); registerRealtime(); registerFocusRefresh(); }

  CR.applyGameDayData = applyGameDayData; CR.refreshGameDayData = refreshGameDayData; CR.renderGameDayState = renderGameDayState; CR.initGameDay = initGameDay; CR.registerGameDayRealtime = registerRealtime;
})();
