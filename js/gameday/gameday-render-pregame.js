window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const utils = () => CR.gameDayRenderUtils;

  function canEditPicks() {
    const game = CR.gameDay?.game || {};
    return Boolean(game.hasGame && game.scheduleText && game.scheduleText !== 'Schedule pending');
  }

  function currentUserId() {
    return String(CR.currentUser?.id || CR.currentProfile?.id || '').trim();
  }

  function isAdmin() {
    return String(CR.currentProfile?.role || '').trim().toLowerCase() === 'admin';
  }

  function isCurrentUserTurn() {
    const draft = CR.gameDay?.draft || {};
    const pickerId = String(draft.currentPicker?.id || '').trim();
    if (CR.gameDayMockBridge?.shouldMock?.()) return true;
    if (!pickerId || !currentUserId()) return false;
    return pickerId === currentUserId();
  }

  function canUsePublicDraftControls() {
    const draft = CR.gameDay?.draft || {};
    if (!canEditPicks()) return false;
    if (draft.status === 'complete' || Number(draft.currentPickNumber || 0) > 4) return false;
    return isCurrentUserTurn();
  }

  function draftDisabledLabel() {
    if (!canEditPicks()) return 'Schedule pending';

    const draft = CR.gameDay?.draft || {};
    if (draft.status === 'complete' || Number(draft.currentPickNumber || 0) > 4) return 'Draft complete';

    const picker = draft.currentPicker?.displayName || 'other player';
    return `Waiting on ${picker}`;
  }

  function renderAdminOverrideButton(scheduled) {
    if (!scheduled || !isAdmin()) return '';

    return `<button class="mini-button cr-button secondary gd-header-action" data-action="open-manage" type="button">Manage Picks</button>`;
  }

  function renderPickSlot({ pick, isPlayoffs, isFocus, picksEnabled }) {
    if (!pick) {
      return `
        <div class="gd-pick-row is-empty ${!picksEnabled ? 'is-disabled' : ''}">
          <div class="gd-pick-icon">…</div>
          <div class="gd-pick-main">
            <strong>Open slot</strong>
            <small>${picksEnabled ? (isPlayoffs ? 'Waiting for the next playoff pick' : 'Waiting for next pick') : draftDisabledLabel()}</small>
          </div>
        </div>
      `;
    }

    return `
      <div
        class="gd-pick-row ${isFocus ? 'gd-pick-row-focus' : ''} ${!picksEnabled ? 'is-disabled' : ''}"
        data-pick-player="${pick.player}"
      >
        <div class="gd-pick-icon">✓</div>
        <div class="gd-pick-main">
          <strong>${pick.player}</strong>
          <small>${picksEnabled ? (isPlayoffs ? 'Locked for playoff night' : 'Locked pick') : 'Pick locked'}</small>
        </div>
      </div>
    `;
  }

  function renderOwnerPanel(index, users, isPlayoffs, lastDrafted, scheduled) {
    const side = utils().getSideContext(index, { users });

    return `
      <article class="gd-panel ${isPlayoffs && scheduled ? 'gd-panel-playoff' : ''}">
        <div class="gd-panel-head ${side.ownerClass} ${isPlayoffs && scheduled ? 'gd-panel-head-playoff' : ''}">
          <span>${side.name}</span>
          <span>${side.picks.length}/2</span>
        </div>

        ${[0, 1].map((pickIndex) => {
          const pick = side.picks[pickIndex];
          return renderPickSlot({
            pick,
            isPlayoffs,
            isFocus: scheduled && pick && pick.player === lastDrafted,
            picksEnabled: scheduled
          });
        }).join('')}
      </article>
    `;
  }

  function renderRosterRow(entry, claimedOwner, isPlayoffs, picksEnabled) {
    const owner = claimedOwner(entry.name);
    const ownerClass = owner ? (CR.identity?.ownerClass?.(owner) || '') : '';
    const displayName = entry.displayName || entry.name;
    const label = picksEnabled ? 'Draft' : draftDisabledLabel();

    return `
      <div class="gd-roster-row ${owner ? 'claimed' : ''} ${!picksEnabled ? 'is-disabled' : ''}">
        <div class="gd-pick-main">
          <strong>${displayName}</strong>
          <small>${entry.detail}</small>
        </div>

        ${owner
          ? `<span class="gd-tag ${ownerClass}">${owner}</span>`
          : `<button class="gd-draft-btn ${isPlayoffs && picksEnabled ? 'gd-draft-btn-playoff' : ''}" data-player="${entry.name}" type="button" ${picksEnabled ? '' : 'disabled'}>${label}</button>`}
      </div>
    `;
  }

  function renderPregameSection({ users, roster, claimedOwner, isPlayoffs }) {
    const lastDrafted = CR.gameDay?.lastDraftedPlayer || '';
    const scheduled = canEditPicks();
    const picksEnabled = canUsePublicDraftControls();
    const waitingCopy = scheduled && !picksEnabled ? `<span class="gd-inline-note">${draftDisabledLabel()}</span>` : '';

    return `
      <div class="gd-label-row gd-picks-label-row" id="gdPregamePicksAnchor">
        <div class="gd-label">${isPlayoffs && scheduled ? 'Playoff Picks' : 'Picks'}</div>
        <div class="gd-label-group gd-label-group-compact">
          ${!scheduled ? '<span class="gd-inline-note">Pick controls unlock when a game is scheduled.</span>' : waitingCopy}
          ${renderAdminOverrideButton(scheduled)}
        </div>
      </div>

      <section class="gd-picks-grid" id="gdPregamePicksGrid">
        ${renderOwnerPanel(0, users, isPlayoffs, lastDrafted, scheduled)}
        ${renderOwnerPanel(1, users, isPlayoffs, lastDrafted, scheduled)}
      </section>

      <div class="gd-label-row">
        <div class="gd-label">Current Canes Roster</div>
      </div>

      <section class="gd-panel gd-roster ${isPlayoffs && scheduled ? 'gd-panel-playoff' : ''}">
        ${roster.map((entry) => renderRosterRow(entry, claimedOwner, isPlayoffs, picksEnabled)).join('')}
      </section>
    `;
  }

  CR.gameDayPregameRender = {
    renderPregameSection
  };
})();