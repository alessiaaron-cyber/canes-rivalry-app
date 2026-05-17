window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function profileKey(profile = {}, index = 0) {
    return String(profile.profileKey || profile.profile_key || profile.id || `player-${index + 1}`).trim();
  }

  function displayName(profile = {}, fallback = 'Player') {
    return String(profile.displayName || profile.display_name || profile.username || fallback).trim();
  }

  function profilesById(profiles = []) {
    return profiles.reduce((acc, profile) => {
      const id = String(profile?.id || '').trim();
      if (id) acc[id] = profile;
      return acc;
    }, {});
  }

  function normalizedScoreByUserId(rows = [], valueKey = 'points') {
    return (rows || []).reduce((acc, row) => {
      const userId = String(row?.user_id || '').trim();
      if (userId) acc[userId] = toNumber(row?.[valueKey]);
      return acc;
    }, {});
  }

  function scoreForProfile({ profile, normalizedScores = {}, fallbackScore = 0, index = 0 }) {
    const id = String(profile?.id || '').trim();
    const key = profileKey(profile, index);
    if (id && Object.prototype.hasOwnProperty.call(normalizedScores, id)) return toNumber(normalizedScores[id]);
    if (key && Object.prototype.hasOwnProperty.call(normalizedScores, key)) return toNumber(normalizedScores[key]);
    return toNumber(fallbackScore);
  }

  CR.profileScoreUtils = {
    toNumber,
    normalizeText,
    profileKey,
    displayName,
    profilesById,
    normalizedScoreByUserId,
    scoreForProfile
  };
})();
