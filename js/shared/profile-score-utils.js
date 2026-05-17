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

  function ownerKey(profile = {}) {
    return profile.legacyOwner || profile.legacy_owner || profile.legacy_owner_key || profile.displayName || profile.display_name || profile.username || '';
  }

  function displayName(profile = {}, fallback = 'Player') {
    return String(profile.displayName || profile.display_name || profile.username || ownerKey(profile) || fallback).trim();
  }

  function profilesById(profiles = []) {
    return profiles.reduce((acc, profile) => {
      const id = String(profile?.id || '').trim();
      if (id) acc[id] = profile;
      return acc;
    }, {});
  }

  function profilesByLegacyOwner(profiles = []) {
    return profiles.reduce((acc, profile) => {
      const key = normalizeText(ownerKey(profile));
      if (key) acc[key] = profile;
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

  function legacyGameScore(game = {}, profile = {}) {
    const legacy = normalizeText(ownerKey(profile));
    if (legacy === 'aaron') return toNumber(game.aaron_points);
    if (legacy === 'julie') return toNumber(game.julie_points);
    return null;
  }

  function legacySeasonTotal(season = {}, profile = {}) {
    const legacy = normalizeText(ownerKey(profile));
    if (legacy === 'aaron') return toNumber(season.aaron_final_total ?? season.aaron_points ?? season.aaron_total);
    if (legacy === 'julie') return toNumber(season.julie_final_total ?? season.julie_points ?? season.julie_total);
    return null;
  }

  function scoreForProfile({ profile, normalizedScores = {}, fallbackScore = 0, legacyScore = null }) {
    const id = String(profile?.id || '').trim();
    if (id && Object.prototype.hasOwnProperty.call(normalizedScores, id)) return toNumber(normalizedScores[id]);
    if (legacyScore !== null && legacyScore !== undefined) return toNumber(legacyScore);
    return toNumber(fallbackScore);
  }

  function resolveProfileFromOwner(owner, profiles = []) {
    const lookup = normalizeText(owner);
    if (!lookup) return null;
    return profiles.find((profile) => [profile.id, profile.username, profile.displayName, profile.display_name, ownerKey(profile)]
      .some((value) => normalizeText(value) === lookup)) || null;
  }

  CR.profileScoreUtils = {
    toNumber,
    normalizeText,
    ownerKey,
    displayName,
    profilesById,
    profilesByLegacyOwner,
    normalizedScoreByUserId,
    legacyGameScore,
    legacySeasonTotal,
    scoreForProfile,
    resolveProfileFromOwner
  };
})();
