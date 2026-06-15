window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function deps() {
    const utils = CR.manageRenderUtils || {};
    return {
      escapeHtml: utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? '')),
      iconButton: utils.iconButton,
      renderCardHeader: utils.renderCardHeader
    };
  }


  function liveDataStatus(state) {
    const { renderCardHeader } = deps();
    const error = String(state.manageDataError || '').trim();
    const title = error ? 'Live season failed to load' : 'Loading live season…';
    const copy = error ? 'Season and scoring edits are disabled until live data loads successfully.' : 'Season and scoring settings will be available after live Manage data finishes loading.';
    return `
      <section class="panel-card manage-card">
        ${renderCardHeader('Season setup', title, copy, { className: error ? 'warning' : 'neutral', label: error ? 'Load failed' : 'Loading' })}
      </section>
    `;
  }

  function scoringLockLabel(profile, state) {
    if (profile === 'Regular') {
      return state.season.regularScoringLocked ? 'Locked' : 'Unlocked';
    }
    return state.season.playoffScoringLocked ? 'Locked' : 'Unlocked';
  }

  function renderScoringCard(profile, state) {
    const { escapeHtml, iconButton } = deps();
    const scoring = state.season.scoringSystems?.[profile] || {};
    const locked = scoringLockLabel(profile, state);
    const editAction = iconButton({
      icon: 'pencil',
      label: `Edit ${profile} scoring`,
      attrs: `data-manage-edit-scoring="${escapeHtml(profile)}"`
    });

    return `
      <div class="manage-score-card">
        <div class="manage-score-card-header">
          <div>
            <span class="eyebrow">${escapeHtml(profile)} scoring · ${escapeHtml(locked)}</span>
            <strong>Point values</strong>
          </div>
          <div class="cr-card-actions">${editAction}</div>
        </div>
        <div class="manage-score-rule-row">
          <div class="manage-score-rule"><span class="eyebrow">First goal</span><strong>${escapeHtml(scoring.firstGoal ?? '—')}</strong></div>
          <div class="manage-score-rule"><span class="eyebrow">Goal</span><strong>${escapeHtml(scoring.goal ?? '—')}</strong></div>
          <div class="manage-score-rule"><span class="eyebrow">Assist</span><strong>${escapeHtml(scoring.assist ?? '—')}</strong></div>
        </div>
      </div>
    `;
  }

  function renderScoringSummary(state) {
    return `
      <div class="manage-score-stack">
        ${renderScoringCard('Regular', state)}
        ${renderScoringCard('Playoffs', state)}
      </div>
    `;
  }

  function renderSeasonSetup(state) {
    if (!state.manageDataLoaded) return liveDataStatus(state);

    const { escapeHtml, renderCardHeader } = deps();
    const activeSeasonLabel = state.season.activeSeasonLabel || 'Active season';

    return `
      <section class="panel-card manage-card">
        ${renderCardHeader('Season setup', 'Season defaults', 'Game type controls whether regular or playoff scoring applies. Scoring rules below are stored on the active season.', { className: 'neutral', label: 'Season' })}
        <div class="manage-readonly-grid">
          <div class="manage-readonly-field is-wide">
            <span>Active season</span>
            <strong>${escapeHtml(activeSeasonLabel)}</strong>
          </div>
        </div>
        ${renderScoringSummary(state)}
        <div class="manage-action-row">
          <button class="cr-button secondary" type="button" data-manage-start-season>Start new season</button>
        </div>
      </section>
    `;
  }

  CR.manageRenderModules.season = {
    renderSeasonSetup,
    renderScoringSummary,
    renderScoringCard
  };
})();
