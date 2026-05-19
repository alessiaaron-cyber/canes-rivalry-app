window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const defaultUsers = [
    { id: 'player-1', username: 'player-1', displayName: 'Player 1', display_name: 'Player 1', rivalrySlot: 1, rivalry_slot: 1, themeClass: 'owner-primary', avatarClass: 'avatar-primary', profileKey: 'player-1', colorHex: '#c8102e', colorLabel: 'Canes Red' },
    { id: 'player-2', username: 'player-2', displayName: 'Player 2', display_name: 'Player 2', rivalrySlot: 2, rivalry_slot: 2, themeClass: 'owner-secondary', avatarClass: 'avatar-secondary', profileKey: 'player-2', colorHex: '#111827', colorLabel: 'Graphite' }
  ];

  function normalizeHex(value, fallback = '#111827') {
    const hex = String(value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toLowerCase() : fallback;
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex).slice(1);
    return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
  }

  function rgbString(hex) {
    const rgb = hexToRgb(hex);
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  }

  function shade(hex, percent = -18) {
    const rgb = hexToRgb(hex);
    const adjust = (channel) => {
      const next = percent < 0 ? channel * (1 + percent / 100) : channel + (255 - channel) * (percent / 100);
      return Math.max(0, Math.min(255, Math.round(next)));
    };
    return `#${[adjust(rgb.r), adjust(rgb.g), adjust(rgb.b)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
  }

  function compact(value) { return String(value || '').trim(); }
  function slotOf(value) { const n = Number(value); return n === 1 || n === 2 ? n : 0; }

  function liveProfiles() {
    return Array.isArray(CR.currentProfiles) ? CR.currentProfiles.filter((profile) => profile?.is_active !== false) : [];
  }

  function findProfileForSlot(index, seedUser) {
    const profiles = liveProfiles();
    const slot = index + 1;
    const seedId = compact(seedUser?.id);

    if (seedId) {
      const byId = profiles.find((profile) => compact(profile.id) === seedId);
      if (byId) return byId;
    }

    return profiles.find((profile) => slotOf(profile?.rivalry_slot || profile?.rivalrySlot) === slot) || null;
  }

  function normalizeUser(user, index) {
    const fallback = defaultUsers[index] || defaultUsers[0];
    const profile = findProfileForSlot(index, user);
    const source = { ...(user || {}), ...(profile || {}) };

    const username = compact(source.username) || fallback.username;
    const displayName = compact(source.display_name) || compact(source.displayName) || username || fallback.displayName;
    const slot = slotOf(source.rivalry_slot || source.rivalrySlot) || fallback.rivalrySlot;
    const themeClass = slot === 2 ? 'owner-secondary' : 'owner-primary';
    const avatarClass = slot === 2 ? 'avatar-secondary' : 'avatar-primary';
    const colorHex = normalizeHex(profile?.color_hex || profile?.colorHex || source.color_hex || source.colorHex, fallback.colorHex);
    const profileKey = compact(source.id) || compact(source.profileKey) || compact(source.profile_key) || fallback.profileKey || username;

    return {
      ...source,
      username,
      displayName,
      display_name: displayName,
      rivalrySlot: slot,
      rivalry_slot: slot,
      themeClass,
      theme_class: themeClass,
      avatarClass,
      avatar_class: avatarClass,
      profileKey,
      profile_key: profileKey,
      scoreKey: profileKey,
      score_key: profileKey,
      colorHex,
      color_hex: colorHex,
      colorLabel: compact(profile?.color_label || profile?.colorLabel || source.color_label || source.colorLabel) || fallback.colorLabel || 'User color'
    };
  }

  function getUsers(source) {
    const candidates = source?.users || liveProfiles() || defaultUsers;
    const seedUsers = Array.isArray(candidates) && candidates.length ? candidates : defaultUsers;
    const bySlot = [0, 1].map((index) => {
      const slot = index + 1;
      return seedUsers.find((user) => slotOf(user?.rivalry_slot || user?.rivalrySlot) === slot) || seedUsers[index] || defaultUsers[index];
    });
    return bySlot.map((seed, index) => normalizeUser(seed, index));
  }

  function getUser(index = 0, source) { return getUsers(source)[index] || normalizeUser(null, index); }

  function findUser(indexOrName = 0, source) {
    if (typeof indexOrName === 'number') return getUser(indexOrName, source);
    const lookup = compact(indexOrName).toLowerCase();
    return getUsers(source).find((user) => [user.id, user.profileKey, user.profile_key, user.username, user.display_name, user.displayName, user.scoreKey, user.score_key]
      .some((value) => compact(value).toLowerCase() === lookup)) || null;
  }

  function getDisplayName(index = 0, source) { return getUser(index, source).displayName; }
  function getThemeClass(indexOrName = 0, source) { return findUser(indexOrName, source)?.themeClass || ''; }
  function getAvatarClass(indexOrName = 0, source) { return findUser(indexOrName, source)?.avatarClass || 'avatar-primary'; }
  function getColor(indexOrName = 0, source) { return findUser(indexOrName, source)?.colorHex || normalizeUser(null, typeof indexOrName === 'number' ? indexOrName : 0).colorHex; }
  function getScoreKey(index = 0, source) { return getUser(index, source).scoreKey; }
  function getProfileKey(index = 0, source) { return getUser(index, source).profileKey; }
  function ownerClass(indexOrName = 0, source) { return getThemeClass(indexOrName, source); }
  function leaderClass(indexOrName = 0, source) { const owner = ownerClass(indexOrName, source); return owner ? owner.replace('owner-', 'leader-') : 'leader-tie'; }
  function winnerClass(indexOrName = 0, source) { if (String(indexOrName || '').toLowerCase() === 'tie') return 'winner-tie'; const owner = ownerClass(indexOrName, source); return owner ? owner.replace('owner-', 'winner-') : 'winner-tie'; }
  function setVar(root, name, value) { root?.style?.setProperty?.(name, value); }

  function applyUserColorVariables(source) {
    const root = document.documentElement;
    const users = getUsers(source);

    users.slice(0, 2).forEach((user, index) => {
      const slot = slotOf(user.rivalry_slot || user.rivalrySlot) || index + 1;
      const fallback = defaultUsers[slot - 1] || defaultUsers[index] || defaultUsers[0];
      const color = normalizeHex(user.colorHex || user.color_hex, fallback.colorHex);
      const dark = shade(color, -30);
      const rgb = rgbString(color);
      setVar(root, `--cr-user-${slot}-color`, color);
      setVar(root, `--cr-user-${slot}-color-dark`, dark);
      setVar(root, `--cr-user-${slot}-rgb`, rgb);
      setVar(root, `--cr-user-${slot}-soft`, `rgba(${rgb}, 0.08)`);
      setVar(root, `--cr-user-${slot}-border`, `rgba(${rgb}, 0.16)`);
    });

    const currentColor = normalizeHex(CR.currentProfile?.color_hex || CR.currentProfile?.colorHex, users[0]?.colorHex || defaultUsers[0].colorHex);
    const currentRgb = rgbString(currentColor);
    setVar(root, '--cr-current-user-color', currentColor);
    setVar(root, '--cr-current-user-color-dark', shade(currentColor, -30));
    setVar(root, '--cr-current-user-rgb', currentRgb);
    setVar(root, '--cr-current-user-soft', `rgba(${currentRgb}, 0.08)`);
    setVar(root, '--cr-current-user-border', `rgba(${currentRgb}, 0.16)`);
  }

  CR.identity = { getUsers, getUser, findUser, getDisplayName, getThemeClass, getAvatarClass, getColor, getScoreKey, getProfileKey, ownerClass, leaderClass, winnerClass, applyUserColorVariables, normalizeUser, normalizeHex, shade, rgbString };
})();