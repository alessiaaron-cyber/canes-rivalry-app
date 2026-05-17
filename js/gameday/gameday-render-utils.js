window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function identity() {
    return CR.identity || {};
  }

  function stateUser(index) {
    return CR.gameDay?.users?.[index] || null;
  }

  function user(index) {
    return stateUser(index) || identity().getUser?.(index) || {};
  }

  function userName(index) {
    const profileUser = user(index);
    return profileUser.displayName || profileUser.display_name || identity().getDisplayName?.(index) || `Player ${index + 1}`;
  }

  function profileKey(index) {
    const profileUser = user(index);
    return profileUser.profileKey || profileUser.profile_key || profileUser.id || identity().getProfileKey?.(index) || `player-${index + 1}`;
  }

  function scoreKey(index) {
    const profileUser = user(index);
    return profileUser.scoreKey || profileUser.score_key || identity().getScoreKey?.(index) || profileKey(index);
  }

  function ownerClass(index) {
    const profileUser = user(index);
    return profileUser.themeClass || profileUser.theme_class || identity().ownerClass?.(index) || (index === 0 ? 'owner-primary' : 'owner-secondary');
  }

  function changedClass(key, className = 'is-realtime-changed') {
    return CR.ui?.changedClass?.(key, className) || '';
  }

  function normalizeKeyPart(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
  }

  function scoreChangedKey(owner) {
    return `gameday:score:${normalizeKeyPart(owner)}`;
  }

  function pickChangedKey(player, stat) {
    return `gameday:pick:${normalizeKeyPart(player)}:${normalizeKeyPart(stat)}`;
  }

  function firstGoalChangedKey() {
    return 'gameday:first-goal';
  }

  function feedChangedKey() {
    return 'gameday:feed';
  }

  function lookupKeys(index) {
    const profileUser = user(index);
    return [
      profileKey(index),
      profileUser.profileKey,
      profileUser.profile_key,
      profileUser.id,
      profileUser.user_id,
      scoreKey(index),
      profileUser.scoreKey,
      profileUser.score_key,
      profileUser.username,
      profileUser.displayName,
      profileUser.display_name,
      userName(index)
    ].filter(Boolean);
  }

  function getUserPicks(users, index) {
    const source = users && typeof users === 'object' ? users : {};
    const keys = lookupKeys(index);
    const key = keys.find((candidate) => Array.isArray(source?.[candidate]));
    return Array.isArray(source?.[key]) ? source[key] : [];
  }

  function getUserScore(scores, index) {
    const source = scores && typeof scores === 'object' ? scores : {};
    const keys = lookupKeys(index);
    const key = keys.find((candidate) => source?.[candidate] !== undefined && source?.[candidate] !== null);
    return Number(source?.[key] ?? 0);
  }

  function getSideContext(index, data = {}) {
    return {
      index,
      name: userName(index),
      key: profileKey(index),
      profileKey: profileKey(index),
      ownerClass: ownerClass(index),
      picks: getUserPicks(data.users, index),
      score: getUserScore(data.scores, index)
    };
  }

  function sides(data = {}) {
    return [getSideContext(0, data), getSideContext(1, data)];
  }

  CR.gameDayRenderUtils = { user, userName, profileKey, scoreKey, ownerClass, changedClass, normalizeKeyPart, scoreChangedKey, pickChangedKey, firstGoalChangedKey, feedChangedKey, lookupKeys, getUserPicks, getUserScore, getSideContext, sides };
})();