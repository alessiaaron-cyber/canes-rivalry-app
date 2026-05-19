window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function users(source) {
    if (Array.isArray(source?.users) && source.users.length) return source.users;
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
    const profile = user(index, source);
    return profile.displayName || profile.display_name || CR.identity?.getDisplayName?.(index, source) || `Player ${index + 1}`;
  }

  function sideKeys(source) {
    return [profileKey(0, source), profileKey(1, source)];
  }

  function pickLabel(pick) {
    if (typeof pick === 'string') return pick;
    if (!pick || typeof pick !== 'object') return '';
    return pick.player || pick.name || pick.playerName || pick.player_name || '';
  }

  function pickLabels(picks = []) {
    return picks.map(pickLabel).filter(Boolean);
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
      acc[key] = pickLabels(gameDay.pregame?.[key] || []).map((player) => ({ player }));
      return acc;
    }, {});
  }

  function selectedPregamePlayers(gameDay = {}) {
    const source = { users: gameDay.users };
    return sideKeys(source).flatMap((key) => pickLabels(gameDay.pregame?.[key] || []));
  }

  function nextDraftSide(gameDay = {}) {
    const source = { users: gameDay.users };
    const keys = sideKeys(source);
    const total = keys.reduce((sum, key) => sum + pickLabels(gameDay.pregame?.[key] || []).length, 0);
    return draftOrder(source)[total] || null;
  }

  function claimedOwner(gameDay = {}, playerName = '') {
    const source = { users: gameDay.users };
    const keys = sideKeys(source);
    const key = keys.find((candidate) => pickLabels(gameDay.pregame?.[candidate] || []).includes(playerName));
    if (!key) return '';
    return displayName(keys.indexOf(key), source);
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

  CR.gameDayStateUtils = { users, user, profileKey, displayName, sideKeys, pickLabel, pickLabels, emptyPickBuckets, emptyScoreBuckets, draftOrder, structuredPregame, selectedPregamePlayers, nextDraftSide, claimedOwner, scoreForIndex, winnerText };
})();