window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function userKey(user = {}, index = 0) {
    return user.legacyOwner || user.legacy_owner || user.legacy_owner_key || user.scoreKey || user.score_key || user.displayName || user.display_name || user.username || `Player ${index + 1}`;
  }

  function ownerKeys() {
    const users = CR.identity?.getUsers?.() || [];
    const keys = [0, 1].map((index) => userKey(users[index], index)).filter(Boolean);
    return keys.length === 2 ? keys : ['Aaron', 'Julie'];
  }

  function emptyBuckets(keys, valueFactory) {
    return keys.reduce((acc, key) => {
      acc[key] = valueFactory();
      return acc;
    }, {});
  }

  const createBaseState = () => {
    const keys = ownerKeys();

    return {
      source: 'empty',
      currentGameId: '',
      mode: 'pregame',
      playoffMode: 'regular',
      carryover: {
        active: false
      },
      game: {
        hasGame: false,
        scheduleText: 'Schedule pending',
        opponent: '',
        headline: 'Next game not scheduled yet'
      },
      pregame: emptyBuckets(keys, () => []),
      live: {
        scores: emptyBuckets(keys, () => 0),
        period: 'Schedule pending',
        users: emptyBuckets(keys, () => []),
        feed: []
      },
      roster: []
    };
  };

  CR.gameDayModel = {
    roster: [],
    get draftOrder() {
      const keys = ownerKeys();
      return [keys[0], keys[1], keys[0], keys[1]];
    },
    ownerKeys,
    createInitialState() {
      return JSON.parse(JSON.stringify(createBaseState()));
    },
    clone(value) {
      return JSON.parse(JSON.stringify(value));
    },
    pointsFor(pick = {}) {
      return (Number(pick.goals || 0) * 2) + Number(pick.assists || 0) + (pick.firstGoal ? 2 : 0);
    },
    momentTier(kind) {
      if (kind === 'assist') return 'light';
      if (kind === 'goal') return 'medium';
      if (kind === 'first') return 'heavy';
      return 'light';
    }
  };
})();
