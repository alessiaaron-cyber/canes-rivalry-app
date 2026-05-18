window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function deps() {
    const utils = CR.manageRenderUtils || {};
    return {
      escapeHtml: utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? '')),
      iconButton: utils.iconButton,
      renderEditableMetaCard: utils.renderEditableMetaCard,
      renderCardHeader: utils.renderCardHeader
    };
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
    const { renderEditableMetaCard, renderCardHeader } = deps();

    return `
      <section class="panel-card manage-card">
        ${renderCardHeader('Season setup', 'Season defaults', 'Game type controls whether regular or playoff scoring applies. Scoring rules below are stored on the active season.', { className: 'neutral', label: 'Season' })}
        <div class="manage-meta-grid">
          ${renderEditableMetaCard({ field: 'activeSeasonLabel', label: 'Active season', value: state.season.activeSeasonLabel })}
          ${renderEditableMetaCard({ field: 'firstPicker', label: 'First picker', value: state.season.firstPicker })}
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
