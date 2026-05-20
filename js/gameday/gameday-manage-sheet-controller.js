window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const $ = (selector) => document.querySelector(selector);
  const clone = (value) => JSON.parse(JSON.stringify(value || {}));
  const state = () => CR.gameDayStateUtils || {};
  const draft = () => CR.gameDayDraftService || {};
  const edit = () => CR.gameDayManageEditService || {};

  let refreshGameDayData = null;

  function source() { return { users: CR.gameDay?.users || [] }; }
  function pickLabel(value) { return draft().pickLabel?.(value) || state().pickLabel?.(value) || (typeof value === 'string' ? value.trim() : ''); }
  function pickLabels(values = []) { return (Array.isArray(values) ? values : []).map(pickLabel).filter(Boolean); }
  function sideKeys() { return draft().sideKeys?.(CR.gameDay?.users || []) || state().sideKeys?.(source()) || []; }
  function roster() { return CR.gameDay?.roster || CR.gameDayRoster || []; }
  function hasDisplayedGame() { return Boolean(CR.gameDay?.currentGameId); }
  function canManagePicks() { return hasDisplayedGame(); }
  function canUndoDraftPick() { return canManagePicks() && CR.gameDay?.mode === 'pregame'; }
  function hasAnyPicks(buckets = {}) { return sideKeys().some((key, index) => pickLabels(resolveSidePicks(buckets, key, index)).length > 0); }
  function finalData() { return { scores: clone(CR.gameDay?.live?.scores || {}), users: clone(CR.gameDay?.live?.users || {}) }; }

  function userAliases(index) {
    const user = CR.gameDay?.users?.[index] || {};
    return [
      user.profileKey,
      user.profile_key,
      user.id,
      user.user_id,
      user.scoreKey,
      user.score_key,
      user.username,
      user.displayName,
      user.display_name,
      user.userName
    ].map((value) => String(value || '').trim()).filter(Boolean);
  }

  function resolveSidePicks(buckets = {}, sideKey, sideIndex) {
    const aliases = [sideKey].concat(userAliases(sideIndex));
    for (const alias of aliases) {
      const picks = buckets?.[alias];
      if (Array.isArray(picks) && picks.length) return picks;
    }
    return buckets?.[sideKey] || [];
  }

  function normalizeBucketsForSides(buckets = {}) {
    return sideKeys().reduce((acc, key, index) => {
      acc[key] = resolveSidePicks(buckets, key, index);
      return acc;
    }, {});
  }

  function picksFromDisplayedSideContext() {
    const buckets = {};
    const keys = sideKeys();
    const displayState = CR.gameDay?.mode === 'pregame' ? { users: CR.gameDay?.pregame || {} } : finalData();
    keys.forEach((key, index) => {
      const side = CR.gameDayRenderUtils?.getSideContext?.(index, displayState) || {};
      buckets[key] = (side.picks || []).map((pick) => pick.player || pick.playerName || pick.name || '').filter(Boolean);
    });
    return buckets;
  }

  function currentPregameForSheet() {
    const buffered = edit().getBuffer?.();
    if (buffered) return normalizeBucketsForSides(buffered);
    const pregame = normalizeBucketsForSides(CR.gameDay?.pregame || {});
    return hasAnyPicks(pregame) ? pregame : normalizeBucketsForSides(picksFromDisplayedSideContext());
  }

  function sheetHeading() {
    if (CR.gameDay?.mode === 'live') return { title: 'Manage Live Picks', detail: 'Update picks for the live game currently shown.' };
    if (CR.gameDay?.mode === 'final') return { title: 'Manage Final Picks', detail: 'Update picks for the final game currently shown.' };
    return { title: 'Manage Pregame Picks', detail: 'Update picks before puck drop.' };
  }

  function setOpen(isOpen) {
    const modal = $('#manageSheet');
    if (!modal) return;
    if (isOpen) {
      edit().openBuffer?.(currentPregameForSheet());
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      CR.ui?.lockBodyScroll?.('manage-sheet-open');
      renderSheet();
    } else {
      edit().clear?.();
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      CR.ui?.unlockBodyScroll?.('manage-sheet-open');
    }
  }

  function renderSheet() {
    const actions = $('#manageSheetActions');
    const saveButton = $('#saveSheet');
    const title = $('#manageSheetTitle');
    const copy = document.querySelector('.gd-sheet-copy');
    if (!actions) return;

    const picksEnabled = canManagePicks();
    const undoEnabled = canUndoDraftPick();
    const bufferPregame = currentPregameForSheet();
    const keys = sideKeys();
    const selectedPlayers = keys.flatMap((key, index) => pickLabels(resolveSidePicks(bufferPregame, key, index)));
    const heading = sheetHeading();

    if (title) title.textContent = heading.title;
    if (copy) copy.textContent = heading.detail;
    if (saveButton) {
      saveButton.disabled = !picksEnabled;
      saveButton.textContent = CR.gameDay?.mode === 'live' ? 'Save Live Picks' : CR.gameDay?.mode === 'final' ? 'Save Final Picks' : 'Save Picks';
    }

    const undoHtml = undoEnabled ? '<button class="cr-button secondary gd-inline-action" id="undoDraftPick" type="button">Undo Last Draft Pick</button>' : '';
    const controlsHtml = keys.flatMap((sideKey, sideIndex) => [0, 1].map((index) => {
      const sidePicks = resolveSidePicks(bufferPregame, sideKey, sideIndex);
      const selected = pickLabel(sidePicks?.[index] || '');
      const options = [''].concat(roster().map((player) => player.name)).map((name) => {
        const disabled = !picksEnabled || (name && selectedPlayers.includes(name) && name !== selected);
        return `<option value="${name}" ${name === selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${name || 'Open slot'}</option>`;
      }).join('');
      return `<div class="gd-sheet-pick ${!picksEnabled ? 'is-disabled' : ''}"><strong>${state().displayName?.(sideIndex, source()) || `Player ${sideIndex + 1}`} Pick ${index + 1}</strong><small>${picksEnabled ? 'Override displayed player' : 'Locked'}</small><select class="gd-sheet-select" data-side-key="${sideKey}" data-index="${index}" ${picksEnabled ? '' : 'disabled'}>${options}</select></div>`;
    }).join('')).join('');

    actions.innerHTML = undoHtml + controlsHtml;
    $('#undoDraftPick')?.addEventListener('click', undoLastDraftPick);
    actions.querySelectorAll('.gd-sheet-select').forEach((select) => {
      select.addEventListener('change', (event) => {
        if (!canManagePicks()) return;
        edit().updatePick?.(event.target.dataset.sideKey, Number(event.target.dataset.index), event.target.value);
        renderSheet();
      });
    });
  }

  async function savePicks() {
    const button = $('#saveSheet');
    try {
      if (!canManagePicks()) throw new Error('Picks cannot be saved right now.');
      CR.ui?.setActionBusy?.(button, true, { label: 'Saving…' });
      const nextPregame = clone(edit().getBuffer?.() || currentPregameForSheet() || {});
      const nextDraft = draft().computeDraftState?.(nextPregame, CR.gameDay?.users || [], CR.gameDay?.draft || {}) || CR.gameDay?.draft;
      CR.gameDay.pregame = nextPregame;
      CR.gameDay.draft = nextDraft;
      await CR.gameDaySaveService?.savePregamePicks?.(CR.gameDay.currentGameId, nextPregame, nextDraft);
      edit().clear?.();
      setOpen(false);
      await refreshGameDayData?.({ flash: true });
      CR.showToast?.('Picks saved');
    } catch (error) {
      console.error('Game Day pick save failed', error);
      setOpen(false);
      CR.showToast?.({ message: error?.message || 'Could not save picks', tier: 'warning' });
    } finally {
      CR.ui?.setActionBusy?.(button, false);
    }
  }

  async function undoLastDraftPick() {
    const button = $('#undoDraftPick');
    try {
      if (!canUndoDraftPick()) throw new Error('Undo is only available before the game starts.');
      CR.ui?.setActionBusy?.(button, true, { label: 'Undoing…' });
      await CR.gameDaySaveService?.undoLastDraftPick?.(CR.gameDay.currentGameId);
      edit().clear?.();
      setOpen(false);
      await refreshGameDayData?.({ flash: true });
      CR.showToast?.('Last draft pick undone');
    } catch (error) {
      console.error('Draft undo failed', error);
      setOpen(false);
      CR.showToast?.({ message: error?.message || 'Could not undo last pick', tier: 'warning' });
    } finally {
      CR.ui?.setActionBusy?.(button, false);
    }
  }

  function bind(options = {}) {
    refreshGameDayData = options.refreshGameDayData || refreshGameDayData;
    $('#closeSheet')?.addEventListener('click', () => setOpen(false));
    $('#saveSheet')?.addEventListener('click', savePicks);
    $('#manageSheet')?.addEventListener('click', (event) => { if (event.target.id === 'manageSheet') setOpen(false); });
  }

  CR.gameDayManageSheet = { bind, render: renderSheet, setOpen, canManagePicks };
})();
