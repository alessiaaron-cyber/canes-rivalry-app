window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function users(source) {
    return CR.identity?.getUsers?.(source) || [];
  }

  function user(index = 0, source) {
    return users(source)[index] || CR.identity?.getUser?.(index, source) || {};
  }

  function profileKey(index = 0, source) {
    const profile = user(index, source);
    return profile.profileKey || profile.profile_key || profile.id || `player-${index + 1}`;
  }

  function displayName(index = 0, source) {
    return CR.identity?.getDisplayName?.(index, source) || user(index, source).displayName || `Player ${index + 1}`;
  }

  function sideKeys(source) {
    return [profileKey(0, source), profileKey(1, source)];
  }

  function emptyPickBuckets(source) {
    return sideKeys(source).reduce((acc, key) => {
      acc[key] = [];
      return acc;
    }, {});
  }

  function emptyScoreBuckets(source) {
    return sideKeys(source).reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
  }

  function draftOrder(source) {
    const keys = sideKeys(source);
    return [keys[0], keys[1], keys[0], keys[1]];
  }

  function structuredPregame(gameDay = {}) {
    const source = { users: gameDay.users };
    return sideKeys(source).reduce((acc, key) => {
      acc[key] = (gameDay.pregame?.[key] || []).map((player) => ({ player }));
      return acc;
    }, {});
  }

  function selectedPregamePlayers(gameDay = {}) {
    const source = { users: gameDay.users };
    return sideKeys(source).flatMap((key) => gameDay.pregame?.[key] || []);
  }

  function nextDraftSide(gameDay = {}) {
    const source = { users: gameDay.users };
    const keys = sideKeys(source);
    const total = keys.reduce((sum, key) => sum + (gameDay.pregame?.[key] || []).length, 0);
    return draftOrder(source)[total] || null;
  }

  function claimedOwner(gameDay = {}, playerName = '') {
    const source = { users: gameDay.users };
    const key = sideKeys(source).find((candidate) => (gameDay.pregame?.[candidate] || []).includes(playerName));
    if (!key) return '';
    const index = sideKeys(source).indexOf(key);
    return displayName(index, source);
  }

  function scoreForIndex(scores = {}, index = 0, source) {
    return Number(scores?.[profileKey(index, source)] || 0);
  }

  function winnerText(scores = {}, source) {
    const first = scoreForIndex(scores, 0, source);
    const second = scoreForIndex(scores, 1, source);
    if (first > second) return `${displayName(0, source)} Wins`;
    if (second > first) return `${displayName(1, source)} Wins`;
    return 'Rivalry Tie';
  }

  CR.gameDayStateUtils = {
    users,
    user,
    profileKey,
    displayName,
    sideKeys,
    emptyPickBuckets,
    emptyScoreBuckets,
    draftOrder,
    structuredPregame,
    selectedPregamePlayers,
    nextDraftSide,
    claimedOwner,
    scoreForIndex,
    winnerText
  };
})();
