window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function identity() {
    return CR.identity || {};
  }

  function user(index) {
    return identity().getUser?.(index) || {};
  }

  function userName(index) {
    return identity().getDisplayName?.(index) || (index === 0 ? 'Aaron' : 'Julie');
  }

  function scoreKey(index) {
    return identity().getScoreKey?.(index) || legacyOwner(index) || userName(index);
  }

  function legacyOwner(index) {
    const profileUser = user(index);
    return profileUser.legacyOwner || profileUser.legacy_owner || profileUser.legacy_owner_key || (index === 0 ? 'Aaron' : 'Julie');
  }

  function ownerClass(index) {
    return identity().ownerClass?.(index) || (index === 0 ? 'owner-primary' : 'owner-secondary');
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
      profileUser.id,
      profileUser.user_id,
      scoreKey(index),
      profileUser.scoreKey,
      profileUser.score_key,
      legacyOwner(index),
      profileUser.username,
      profileUser.displayName,
      profileUser.display_name,
      userName(index),
      index === 0 ? 'Aaron' : 'Julie'
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
      key: scoreKey(index),
      legacyOwner: legacyOwner(index),
      ownerClass: ownerClass(index),
      picks: getUserPicks(data.users, index),
      score: getUserScore(data.scores, index)
    };
  }

  function sides(data = {}) {
    return [getSideContext(0, data), getSideContext(1, data)];
  }

  CR.gameDayRenderUtils = {
    user,
    userName,
    scoreKey,
    legacyOwner,
    ownerClass,
    changedClass,
    normalizeKeyPart,
    scoreChangedKey,
    pickChangedKey,
    firstGoalChangedKey,
    feedChangedKey,
    lookupKeys,
    getUserPicks,
    getUserScore,
    getSideContext,
    sides
  };
})();