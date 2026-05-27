window.CR = window.CR || {};

(() => {
  function safeText(value, fallback = '—') {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function initialsFromProfile(profile) {
    const source = safeText(profile?.display_name || profile?.username || profile?.email, 'C');
    const parts = source.split(/\s+/).filter(Boolean);

    if (!parts.length) return 'C';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  function roleLabel(profile) {
    const role = String(profile?.role || '').trim().toLowerCase();
    return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : 'Member';
  }

  function avatarThemeClass(profile) {
    const identityClass = window.CR.identity?.getAvatarClass?.(profile?.id || profile?.display_name || profile?.username);
    if (identityClass) return identityClass;

    const explicit = String(profile?.avatar_class || profile?.avatarClass || profile?.theme_class || profile?.themeClass || '').trim();
    if (explicit === 'avatar-primary' || explicit === 'avatar-secondary') return explicit;
    if (explicit === 'owner-primary') return 'avatar-primary';
    if (explicit === 'owner-secondary') return 'avatar-secondary';

    return 'avatar-primary';
  }

  function applyAvatarTheme(element, themeClass) {
    if (!element) return;
    element.classList.remove('avatar-primary', 'avatar-secondary');
    element.classList.add(themeClass);
  }

  function renderAccountIdentity() {
    const profile = window.CR.currentProfile || {};
    const user = window.CR.currentUser || {};

    window.CR.identity?.applyUserColorVariables?.();

    const displayName = safeText(profile.display_name || profile.username, 'Canes Rivalry');
    const username = safeText(profile.username, 'member');
    const email = safeText(user.email || profile.email, '—');
    const role = roleLabel(profile);
    const initials = initialsFromProfile({
      display_name: displayName,
      username,
      email
    });

    const avatarClass = avatarThemeClass(profile);

    const chipAvatar = document.querySelector('#accountChipAvatar');
    const chipName = document.querySelector('#accountChipName');
    const chipMeta = document.querySelector('#accountChipMeta');
    const manageTitle = document.querySelector('#manageAccountTitle');
    const manageRole = document.querySelector('#manageAccountRole');
    const manageAvatar = document.querySelector('#manageAccountAvatar');
    const manageName = document.querySelector('#manageAccountName');
    const manageMeta = document.querySelector('#manageAccountMeta');
    const manageEmail = document.querySelector('#manageAccountEmail');

    if (chipAvatar) {
      chipAvatar.textContent = initials;
      applyAvatarTheme(chipAvatar, avatarClass);
    }

    if (chipName) chipName.textContent = displayName;
    if (chipMeta) chipMeta.textContent = role;

    if (manageTitle) manageTitle.textContent = displayName;
    if (manageRole) manageRole.textContent = role;

    if (manageAvatar) {
      manageAvatar.textContent = initials;
      applyAvatarTheme(manageAvatar, avatarClass);
    }

    if (manageName) manageName.textContent = displayName;
    if (manageMeta) manageMeta.textContent = `@${username}`;
    if (manageEmail) manageEmail.textContent = email;
  }

  async function handleManageSignOut() {
    try {
      await window.CR.auth?.signOut?.();
    } catch (error) {
      console.error('Manage sign out failed', error);
    }

    window.CR.currentUser = null;
    window.CR.currentProfile = null;
    window.CR.currentProfiles = [];
    window.CR.session = null;
    window.location.reload();
  }

  function bindAccountUi() {
    document.querySelector('#accountChip')?.addEventListener('click', () => {
      window.CR.switchTab?.('manage');
    });

    document.querySelector('#manageSignOutButton')?.addEventListener('click', handleManageSignOut);
  }

  async function runRefreshStep(label, fn) {
    if (typeof fn !== 'function') return null;

    try {
      await fn();
      return null;
    } catch (error) {
      console.error(`${label} refresh step failed`, error);
      return label;
    }
  }

  window.CR.refreshApp = async () => {
    window.CR.flashSync?.();

    const failures = [];

    const identityFailure = await runRefreshStep('Identity', async () => {
      window.CR.identity?.applyUserColorVariables?.();
      window.CR.renderAccountIdentity?.();
    });
    if (identityFailure) failures.push(identityFailure);

    const gameDayFailure = await runRefreshStep('Game Day', async () => {
      if (window.CR.refreshGameDayData) await window.CR.refreshGameDayData({ skipIfEditing: true });
      else window.CR.renderGameDayState?.();
    });
    if (gameDayFailure) failures.push(gameDayFailure);

    const historyFailure = await runRefreshStep('History', async () => {
      await window.CR.refreshHistoryData?.({ force: true });
    });
    if (historyFailure) failures.push(historyFailure);

    const manageFailure = await runRefreshStep('Manage', async () => {
      if (window.CR.hydrateManageData) await window.CR.hydrateManageData();
      else window.CR.renderManage?.();
    });
    if (manageFailure) failures.push(manageFailure);

    if (failures.length) {
      window.CR.showToast?.({ message: `Refresh partly failed: ${failures.join(', ')}`, tier: 'warning' });
      return;
    }

    window.CR.showToast?.('Rivalry refresh complete');
  };

  window.CR.startApp = () => {
    try {
      window.CR.identity?.applyUserColorVariables?.();
      renderAccountIdentity();
      bindAccountUi();

      window.CR.realtime?.start?.();
      window.CR.realtimeRefreshHandler?.register?.();

      window.CR.initTabs?.();
      window.CR.initGameDay?.();
      window.CR.initHistory?.();
      window.CR.initManage?.();
      window.CR.initPullRefresh?.();

      window.CR.rivalryEventsConsumer?.register?.();
      window.CR.activeDeviceService?.bind?.();
      window.CR.activeDeviceService?.start?.();

      const savedTab = window.CR.getSavedTab?.() || 'gameday';
      window.CR.switchTab?.(savedTab);
    } catch (error) {
      console.error('V2 bootstrap failed', error);
      const root = document.querySelector('#appRoot') || document.body;
      root.insertAdjacentHTML('afterbegin', '<div style="padding:16px;background:#fee;color:#900;font-weight:800">V2 preview render failed. Check console.</div>');
    }
  };

  window.CR.renderAccountIdentity = renderAccountIdentity;
})();