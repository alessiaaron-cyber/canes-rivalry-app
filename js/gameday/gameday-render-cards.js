window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function utils() {
    return CR.gameDayRenderUtils || {};
  }

  function renderStatChips(pick) {
    const goalsKey = utils().pickChangedKey?.(pick.player, 'goals');
    const assistsKey = utils().pickChangedKey?.(pick.player, 'assists');
    const firstGoalKey = utils().firstGoalChangedKey?.();

    return `
      <div class="gd-player-stats">
        <span class="gd-stat ${pick.goals ? 'live' : ''} ${utils().changedClass?.(goalsKey)}">G ${pick.goals}</span>
        <span class="gd-stat ${pick.assists ? 'live' : ''} ${utils().changedClass?.(assistsKey)}">A ${pick.assists}</span>
        <span class="gd-stat ${pick.firstGoal ? 'live' : ''} ${utils().changedClass?.(firstGoalKey)}">FG</span>
      </div>
    `;
  }

  function renderEmptyPickState(isFinal) {
    return `
      <div class="gd-player-card gd-player-card-empty">
        <div class="gd-player-main">
          <strong>No picks locked</strong>
          <small>${isFinal ? 'No pick results were recorded for this side.' : 'Pick slots will appear here after players are selected.'}</small>
        </div>
        <div class="gd-player-total">0</div>
      </div>
    `;
  }

  function renderPlayerCard({ side, sideIndex = 0, picks = [], themeClass, pointsFor, isPlayoffs, isFinal = false }) {
    const resolvedTheme = themeClass || 'owner-primary';
    const total = picks.reduce((sum, pick) => sum + pointsFor(pick), 0);
    const scoreKey = utils().scoreChangedKey?.(side);
    const colorStyle = utils().colorStyle?.(sideIndex) || '';

    const pickRows = picks.length
      ? picks.map((pick) => `
          <div class="gd-player-card">
            <div class="gd-player-main">
              <strong>${pick.player}</strong>
              ${renderStatChips(pick)}
            </div>
            <div class="gd-player-total">+${pointsFor(pick)}</div>
          </div>
        `).join('')
      : renderEmptyPickState(isFinal);

    return `
      <article class="gd-card gd-score-card ${isPlayoffs ? 'gd-card-playoff' : ''} ${utils().changedClass?.(scoreKey)}">
        <div class="gd-pick-card-head">
          <strong class="${resolvedTheme}" ${colorStyle}>${side}</strong>
          <span class="gd-pick-card-score">${total} pts</span>
        </div>

        ${pickRows}
      </article>
    `;
  }

  CR.gameDayCardRender = {
    renderStatChips,
    renderPlayerCard
  };
})();