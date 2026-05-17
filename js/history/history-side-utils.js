window.CR = window.CR || {};

(() => {
  const SIDE_KEYS = ['first', 'second'];

  function compact(value) {
    return String(value || '').trim();
  }

  function sideIndex(sideOrIndex) {
    if (typeof sideOrIndex === 'number') return sideOrIndex === 1 ? 1 : 0;
    const text = compact(sideOrIndex).toLowerCase();
    return text === 'second' || text === '1' ? 1 : 0;
  }

  function sideName(sideOrIndex) {
    return SIDE_KEYS[sideIndex(sideOrIndex)] || SIDE_KEYS[0];
  }

  function userForSide(users = [], sideOrIndex = 0) {
    return users[sideIndex(sideOrIndex)] || {};
  }

  function pickKeysForSide(users = [], sideOrIndex = 0) {
    const user = userForSide(users, sideOrIndex);
    return [user.id, sideName(sideOrIndex)].filter(Boolean);
  }

  window.CR.historySideUtils = {
    SIDE_KEYS,
    sideIndex,
    sideName,
    userForSide,
    pickKeysForSide
  };
})();
