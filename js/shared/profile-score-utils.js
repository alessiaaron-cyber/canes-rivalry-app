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

  function profileId(profile = {}) {
    return String(profile?.id || '').trim();
  }

  function displayName(profile = {}, fallback = 'Player') {
    return String(profile.displayName || profile.display_name || profile.username || fallback).trim();
  }

  function scoreKey(profile = {}) {
    return profileId(profile) || displayName(profile);
  }

  function profilesById(profiles = []) {
    return profiles.reduce((acc, profile) => {
      const id = profileId(profile);
      if (id) acc[id] = profile;
      return acc;
    }, {});
  }

  function profilesByName(profiles = []) {
    return profiles.reduce((acc, profile) => {
      [profile.username, profile.displayName, profile.display_name]
        .map(normalizeText)
        .filter(Boolean)
        .forEach((key) => { acc[key] = profile; });
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

  function scoreForProfile(profile = {}, normalizedScores = {}) {
    const id = profileId(profile);
    return id && Object.prototype.hasOwnProperty.call(normalizedScores, id)
      ? toNumber(normalizedScores[id])
      : 0;
  }

  function requireProfileScore(profile = {}, normalizedScores = {}, context = 'score') {
    const id = profileId(profile);
    if (!id) throw new Error(`Missing user profile id for ${context}.`);
    if (!Object.prototype.hasOwnProperty.call(normalizedScores, id)) return 0;
    return toNumber(normalizedScores[id]);
  }

  function resolveProfile(value, profiles = []) {
    const id = String(value || '').trim();
    if (!id) return null;

    const byId = profilesById(profiles);
    if (byId[id]) return byId[id];

    const byName = profilesByName(profiles);
    return byName[normalizeText(value)] || null;
  }

  CR.profileScoreUtils = {
    toNumber,
    normalizeText,
    profileId,
    displayName,
    scoreKey,
    profilesById,
    profilesByName,
    normalizedScoreByUserId,
    scoreForProfile,
    requireProfileScore,
    resolveProfile
  };
})();
