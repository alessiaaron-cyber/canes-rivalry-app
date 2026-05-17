window.CR = window.CR || {};

(() => {
  const SIDE_KEYS = ['first', 'second'];

  function compact(value) {
    return String(value || '').trim();
  }

  function sideIndex(sideOrIndex) {
    if (typeof sideOrIndex === 'number') return sideOrIndex === 1 ? 1 : 0;
    const text = compact(sideOrIndex).toLowerCase();
    return ['1', 'second', 'player-2', 'player 2'].includes(text) ? 1 : 0;
  }

  function sideName(index) {
    return SIDE_KEYS[sideIndex(index)] || SIDE_KEYS[0];
  }

  function userForSide(users = [], sideOrIndex = 0) {
    return users[sideIndex(sideOrIndex)] || {};
  }

  function profileLookupKeys(user = {}, sideOrIndex = 0) {
    const index = sideIndex(sideOrIndex);
    return [
      user.profileKey,
      user.profile_key,
      user.id,
      user.user_id,
      user.scoreKey,
      user.score_key,
      user.username,
      user.displayName,
      user.display_name,
      sideName(index)
    ].filter(Boolean);
  }

  function pickKeysForSide(users = [], sideOrIndex = 0) {
    return profileLookupKeys(userForSide(users, sideOrIndex), sideOrIndex);
  }

  function camelScoreKey(value) {
    const text = compact(value);
    if (!text) return '';
    return `${text.charAt(0).toLowerCase()}${text.slice(1)}Score`;
  }

  function scoreKeysForSide(users = [], sideOrIndex = 0) {
    const index = sideIndex(sideOrIndex);
    const genericKey = index === 1 ? 'secondScore' : 'firstScore';
    return pickKeysForSide(users, sideOrIndex).map(camelScoreKey).filter(Boolean).concat(genericKey);
  }

  function sideScore(row = {}, sideOrIndex = 0, users = []) {
    const key = scoreKeysForSide(users, sideOrIndex).find((candidate) => row?.[candidate] !== undefined && row?.[candidate] !== null);
    return Number(row?.[key] ?? 0);
  }

  function picksForSide(game = {}, sideOrIndex = 0, users = []) {
    const key = pickKeysForSide(users, sideOrIndex).find((candidate) => Array.isArray(game.picks?.[candidate]));
    return game.picks?.[key] || [];
  }

  function ownerForWinner(winner, users = []) {
    const text = compact(winner).toLowerCase();
    if (!text || text === 'tie') return text ? 'Tie' : '';

    for (let index = 0; index < 2; index += 1) {
      const keys = pickKeysForSide(users, index).map((key) => compact(key).toLowerCase());
      if (keys.includes(text)) return sideName(index);
    }

    return '';
  }

  function scoreWinner(game = {}, users = []) {
    const normalized = ownerForWinner(game?.winner, users);
    if (normalized) return normalized;

    const first = sideScore(game, 0, users);
    const second = sideScore(game, 1, users);
    if (first > second) return sideName(0);
    if (second > first) return sideName(1);
    return 'Tie';
  }

  window.CR.historySideUtils = {
    SIDE_KEYS,
    sideIndex,
    sideName,
    userForSide,
    profileLookupKeys,
    pickKeysForSide,
    scoreKeysForSide,
    sideScore,
    picksForSide,
    ownerForWinner,
    scoreWinner
  };
})();
