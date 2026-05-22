window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const utils = () => CR.gameDayRenderUtils;

  function allPicks(state = {}) {
    return Object.values(state.users || {}).flat();
  }

  function firstGoalPick(state = {}) {
    return allPicks(state).find((pick) => pick.firstGoal);
  }

  function firstGoalStatus(state = {}) {
    const hit = firstGoalPick(state);
    if (!hit) {
      return { icon: '👑', title: 'First goal bonus still open', detail: 'The first picked Canes goal will light this up.', points: '—' };
    }
    return { icon: '👑', title: `${hit.player} hit first goal`, detail: 'First goal bonus has been awarded.', points: '+1' };
  }

  function renderFirstGoalStatus(state = {}, isPlayoffs) {
    const status = firstGoalStatus(state);
    return `<section class="gd-card gd-feed-item gd-feed-tier-heavy ${isPlayoffs ? 'gd-feed-item-playoff' : ''}"><div class="gd-feed-icon">${status.icon}</div><div class="gd-feed-main"><strong>${status.title}</strong><div class="gd-feed-sub">${status.detail}</div></div><div class="gd-feed-points">${status.points}</div></section>`;
  }

  function renderSectionHeader({ title, carryover, isPlayoffs, playoffLabel = 'Playoffs', stakesLabel = 'High Stakes', manage = true }) {
    const pills = [
      carryover?.active ? '<span class="gd-inline-note gd-inline-note-warning">Carryover</span>' : '',
      isPlayoffs ? `<span class="gd-inline-note gd-inline-note-playoff">${stakesLabel || playoffLabel}</span>` : ''
    ].filter(Boolean).join('');
    return `<div class="gd-section-header"><div class="gd-section-title-row"><div class="gd-label">${title}</div>${manage ? '<button class="gd-manage-tiny gd-header-action" data-action="open-manage" type="button">Manage</button>' : ''}</div>${pills ? `<div class="gd-section-meta-row">${pills}</div>` : ''}</div>`;
  }

  function renderLiveSection({ state, renderPlayerCard, carryover, isPlayoffs }) {
    const left = utils().getSideContext(0, state);
    const right = utils().getSideContext(1, state);
    return `${renderSectionHeader({ title: isPlayoffs ? 'Playoff Picks' : 'Picked Players', carryover, isPlayoffs, stakesLabel: 'High Stakes' })}<section class="gd-picks-grid">${renderPlayerCard({ side: left.name, picks: left.picks, score: left.score, themeClass: left.ownerClass, isPlayoffs })}${renderPlayerCard({ side: right.name, picks: right.picks, score: right.score, themeClass: right.ownerClass, isPlayoffs })}</section><div class="gd-label-row"><div class="gd-label">First Goal</div></div>${renderFirstGoalStatus(state, isPlayoffs)}<div class="gd-label-row"><div class="gd-label">${isPlayoffs ? 'Playoff Rivalry Feed' : 'Rivalry Feed'}</div></div><section class="gd-feed-list">${state.feed.map((item, index) => `<article class="gd-card gd-feed-item gd-feed-tier-${item.tier || 'light'} ${index === 0 ? 'gd-feed-item-latest' : ''} ${isPlayoffs ? 'gd-feed-item-playoff' : ''}"><div class="gd-feed-icon">${item.icon}</div><div class="gd-feed-main"><strong>${item.title}</strong><div class="gd-feed-sub">${item.detail}</div></div><div class="gd-feed-points">+${item.points}</div></article>`).join('')}</section>`;
  }

  CR.gameDayLiveRender = { renderLiveSection };
})();