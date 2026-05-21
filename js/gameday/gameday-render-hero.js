window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const utils = () => CR.gameDayRenderUtils;

  function currentUserId() {
    return String(CR.currentUser?.id || CR.currentProfile?.id || '').trim();
  }

  function draftTurnText({ draft, fallbackPicker, pickNumber, hasScheduledGame }) {
    if (!hasScheduledGame) return '';
    if (!draft || draft.status === 'complete' || Number(draft.currentPickNumber || 0) > 4) return 'Picks ready for puck drop';

    const pickerName = draft.currentPicker?.displayName || fallbackPicker || 'Next player';
    const isCurrentUserTurn = Boolean(draft.currentPicker?.id && currentUserId() && draft.currentPicker.id === currentUserId());
    const prefix = isCurrentUserTurn ? 'Your pick' : `Waiting on ${pickerName}`;

    return `${prefix} • Pick ${pickNumber} of 4`;
  }

  function liveContext(game) {
    const opponent = game?.opponent || '';
    return opponent ? `${opponent} • Live` : 'Live';
  }

  function renderPickCount(count) {
    return `<div class="gd-pregame-count"><span>${count}</span><span class="gd-pregame-slash">/</span><span class="gd-pregame-total">2</span></div>`;
  }

  function renderHeroSection({
    mode,
    game,
    pregameUsers,
    live,
    final,
    isPlayoffs,
    winnerText,
    nextDraftSide,
    draft
  }) {
    const pregame = mode === 'pregame';
    const liveMode = mode === 'live';
    const finalMode = mode === 'final';
    const scheduleText = game?.scheduleText || 'Schedule pending';
    const compactInfo = game?.compactInfo || scheduleText;
    const hasScheduledGame = Boolean(game?.hasGame && scheduleText !== 'Schedule pending');

    const scoreSource = pregame ? {} : (finalMode ? final.scores : live.scores);

    const left = utils().getSideContext(0, {
      users: pregameUsers,
      scores: scoreSource
    });

    const right = utils().getSideContext(1, {
      users: pregameUsers,
      scores: scoreSource
    });

    const period = pregame ? compactInfo : (liveMode ? liveContext(game) : compactInfo);

    const delta = left.score - right.score;
    const momentum = Math.min(Math.abs(delta) * 12, 48);
    const momentumLeft = delta > 0 ? `calc(50% - ${momentum}%)` : '50%';
    const totalPicks = left.picks.length + right.picks.length;
    const currentPickNumber = Number(draft?.currentPickNumber || totalPicks + 1 || 1);

    const subline = pregame
      ? (!hasScheduledGame
          ? (game?.headline || 'Next game not scheduled yet')
          : draftTurnText({
              draft,
              fallbackPicker: nextDraftSide,
              pickNumber: Math.min(currentPickNumber, 4),
              hasScheduledGame
            }))
      : '';

    const leftBadge = finalMode ? 'Final' : (liveMode ? 'Live' : (hasScheduledGame ? 'Pregame' : 'Pending'));
    const playoffPill = isPlayoffs && hasScheduledGame ? '<span class="gd-pill gd-pill-playoff">Playoff Mode</span>' : '';
    const playoffSubline = isPlayoffs && pregame && hasScheduledGame ? '<div class="gd-playoff-copy">Postseason stakes are up tonight.</div>' : '';
    const finalBanner = finalMode ? `<div class="gd-final-banner ${isPlayoffs ? 'gd-final-banner-playoff' : ''}">${winnerText(scoreSource)}</div>` : '';

    return `
      <section class="gd-hero ${finalMode ? 'gd-hero-final' : ''} ${isPlayoffs && hasScheduledGame ? 'gd-hero-playoff' : ''}">
        <div class="gd-hero-topline">
          <div class="gd-hero-top-left">
            <span class="gd-pill gd-pill-state ${liveMode ? 'live' : finalMode ? 'final' : 'pregame'}">
              ${leftBadge}
            </span>
          </div>

          <div class="gd-hero-top-right">
            ${playoffPill}
          </div>
        </div>

        ${period ? `
          <div class="gd-hero-time-row">
            <span class="gd-period">${period}</span>
          </div>
        ` : ''}

        <div class="gd-score-grid">
          <div class="gd-side">
            <div class="gd-side-label ${left.ownerClass}">${left.name}</div>

            ${pregame
              ? `
                ${renderPickCount(left.picks.length)}
                <div class="gd-pregame-meta">Picks Locked</div>
              `
              : `<div class="gd-side-value gd-score-pop">${left.score}</div>`}
          </div>

          <div class="gd-center">
            <img class="gd-logo ${isPlayoffs && hasScheduledGame ? 'gd-logo-playoff' : ''}" src="./assets/app-icon.png" alt="Canes Rivalry">
          </div>

          <div class="gd-side">
            <div class="gd-side-label ${right.ownerClass}">${right.name}</div>

            ${pregame
              ? `
                ${renderPickCount(right.picks.length)}
                <div class="gd-pregame-meta">Picks Locked</div>
              `
              : `<div class="gd-side-value gd-score-pop">${right.score}</div>`}
          </div>
        </div>

        ${subline ? `<div class="gd-subline ${isPlayoffs && hasScheduledGame ? 'gd-subline-playoff' : ''}">${subline}</div>` : ''}
        ${playoffSubline}
        ${finalBanner}

        ${liveMode
          ? `
            <div class="gd-momentum-label ${isPlayoffs ? 'gd-momentum-label-playoff' : ''}">Momentum</div>
            <div class="gd-track ${isPlayoffs ? 'gd-track-playoff' : ''}">
              <div class="gd-track-fill gd-momentum-fill ${isPlayoffs ? 'gd-track-fill-playoff' : ''}" style="left:${momentumLeft};width:${momentum}%"></div>
            </div>
          `
          : ''}
      </section>
    `;
  }

  CR.gameDayHeroRender = {
    renderHeroSection
  };
})();