window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  let notificationStatusInFlight = false;
  let manageDataInFlight = false;

  function scrollManageToTop() {
    const manageView = document.querySelector('#manageView');
    const appShell = document.querySelector('.app-shell');

    manageView?.scrollTo?.({ top: 0, behavior: 'auto' });
    appShell?.scrollTo?.({ top: 0, behavior: 'auto' });
    window.scrollTo?.({ top: 0, behavior: 'auto' });
  }

  function syncManageChrome(state = CR.manageState) {
    const manageView = document.querySelector('#manageView');
    const accountPanel = document.querySelector('#manageView .account-panel');
    const isSubpage = state?.activeManageView && state.activeManageView !== 'main';

    manageView?.classList.toggle('is-manage-subpage', Boolean(isSubpage));

    if (accountPanel) {
      accountPanel.hidden = Boolean(isSubpage);
      accountPanel.setAttribute('aria-hidden', isSubpage ? 'true' : 'false');
      accountPanel.classList.toggle('is-hidden', Boolean(isSubpage));
    }
  }

  function hasOpenManageSheet(state = CR.manageState) {
    return Boolean(
      state?.activeEditField ||
      state?.profileEditOpen ||
      state?.startSeasonOpen ||
      state?.scoringEditOpen ||
      state?.rosterSheetOpen ||
      state?.scheduleSheetOpen ||
      state?.confirmRemove
    );
  }

  function syncManageSheetScrollLock(state = CR.manageState) {
    if (hasOpenManageSheet(state)) {
      CR.ui?.lockBodyScroll?.('manage-sheet-open');
    } else {
      CR.ui?.unlockBodyScroll?.('manage-sheet-open');
    }
  }

  function syncWatchExperienceFromSettings(state = CR.manageStore?.getState?.() || CR.manageState, options = {}) {
    if (!state?.watchExperience) return state;
    if (options.skipIfSaving !== false && state.watchExperience.saveState === 'saving') return state;

    const settings = CR.userSettingsService?.get?.() || CR.userSettings || {};
    const stream = settings.stream_settings || {};
    const notifications = settings.notification_settings || {};
    const normalizeDelay = CR.userSettingsService?.normalizeDelay || ((value, fallback) => Number(value ?? fallback));

    state.watchExperience.pushDelaySeconds = normalizeDelay(stream.push_delay_seconds, state.watchExperience.pushDelaySeconds ?? 90);
    state.watchExperience.toastDelaySeconds = normalizeDelay(stream.toast_delay_seconds, state.watchExperience.toastDelaySeconds ?? 90);
    state.watchExperience.pushEnabled = notifications.push_enabled !== false;
    state.watchExperience.toastEnabled = notifications.toast_enabled !== false;
    state.watchExperience.delayOptions = state.watchExperience.delayOptions || CR.manageModel?.DELAY_OPTIONS || [];
    state.watchExperience.saveState = state.watchExperience.saveState || 'idle';

    if (state.notifications) {
      state.notifications.pushEnabled = state.watchExperience.pushEnabled;
      state.notifications.toastsEnabled = state.watchExperience.toastEnabled;
    }

    if (state.streamMode) {
      state.streamMode.selected = `${state.watchExperience.toastDelaySeconds}s`;
      state.streamMode.delayPush = state.watchExperience.pushDelaySeconds > 0;
      state.streamMode.delayToasts = state.watchExperience.toastDelaySeconds > 0;
    }

    return state;
  }

  function replaceManageState(nextState, options = {}) {
    const shouldSyncSettings = options.syncSettings === true;
    const synced = shouldSyncSettings ? syncWatchExperienceFromSettings(nextState, options) : nextState;
    CR.manageState = synced;
    CR.manageStore?.replaceState?.(synced, { render: false });
    if (options.render !== false) CR.manageStore?.render?.();
    return synced;
  }

  async function hydrateNotificationDeviceStatus() {
    if (notificationStatusInFlight) return;
    if (!CR.activeDeviceService?.getDeviceStatus) return;

    notificationStatusInFlight = true;

    try {
      const status = await CR.activeDeviceService.getDeviceStatus();
      const current = CR.manageStore?.getState?.() || CR.manageState;
      if (!current?.notificationDevice) return;

      current.notificationDevice = {
        ...current.notificationDevice,
        ...status,
        loading: false
      };

      replaceManageState(current);
    } catch (error) {
      console.warn('Could not hydrate notification status', error);
      const current = CR.manageStore?.getState?.() || CR.manageState;
      if (current?.notificationDevice) {
        current.notificationDevice.loading = false;
        current.notificationDevice.lastActiveError = error?.message || String(error || 'Could not read notification status');
        replaceManageState(current);
      }
    } finally {
      notificationStatusInFlight = false;
    }
  }

  async function hydrateManageData() {
    if (manageDataInFlight) return;
    if (!CR.manageDataService?.load) return;

    manageDataInFlight = true;

    try {
      const liveData = await CR.manageDataService.load();
      const current = CR.manageStore?.getState?.() || CR.manageState;
      CR.manageDataService.mergeIntoState(current, liveData);
      current.manageDataLoading = false;
      current.manageDataLoaded = true;
      current.manageDataError = '';
      replaceManageState(current);
    } catch (error) {
      console.warn('Could not hydrate Manage live data', error);
      const current = CR.manageStore?.getState?.() || CR.manageState;
      if (current) {
        current.manageDataLoading = false;
        current.manageDataLoaded = false;
        current.manageDataError = error?.message || String(error || 'Could not load Manage data');
        current.appHealth = {
          ...current.appHealth,
          syncStatus: 'Live load failed',
          lastSyncLabel: 'Live load failed'
        };
        replaceManageState(current);
      }
    } finally {
      manageDataInFlight = false;
    }
  }

  function renderManageView(state) {
    const root = document.querySelector('#manageContent');
    if (!root || !CR.manageRender) return;

    syncManageChrome(state);
    root.innerHTML = CR.manageRender.renderRoot(state);
    syncManageChrome(state);
    syncManageSheetScrollLock(state);
  }

  function renderManage(options = {}) {
    if (CR.manageStore) {
      if (options.syncSettings) {
        const current = CR.manageStore.getState?.() || CR.manageState;
        replaceManageState(current, { render: false, syncSettings: true });
      }

      if (options.scrollTop) {
        CR.manageStore.render();
        requestAnimationFrame(scrollManageToTop);
        requestAnimationFrame(hydrateNotificationDeviceStatus);
        return;
      }

      CR.manageStore.scheduleRender();
      requestAnimationFrame(hydrateNotificationDeviceStatus);
      return;
    }

    if (options.syncSettings) syncWatchExperienceFromSettings(CR.manageState);
    renderManageView(CR.manageState);
    requestAnimationFrame(hydrateNotificationDeviceStatus);

    if (options.scrollTop) {
      requestAnimationFrame(scrollManageToTop);
    }
  }

  function initManage() {
    CR.manageState = syncWatchExperienceFromSettings(CR.manageModel.build(), { skipIfSaving: false });
    CR.manageStore = CR.ui?.createViewStore?.({
      initialState: CR.manageState,
      render: renderManageView,
      onAfterRender: (state) => {
        CR.manageState = state;
        syncManageSheetScrollLock(state);
      }
    });

    if (CR.manageStore) {
      CR.manageState = CR.manageStore.getState();
      CR.manageStore.render();
    } else {
      renderManage();
    }

    requestAnimationFrame(hydrateManageData);
    requestAnimationFrame(hydrateNotificationDeviceStatus);
    CR.manageEvents?.bindManageEvents?.();
  }

  CR.renderManage = renderManage;
  CR.scrollManageToTop = scrollManageToTop;
  CR.syncManageSheetScrollLock = syncManageSheetScrollLock;
  CR.syncWatchExperienceFromSettings = syncWatchExperienceFromSettings;
  CR.hydrateNotificationDeviceStatus = hydrateNotificationDeviceStatus;
  CR.hydrateManageData = hydrateManageData;
  CR.initManage = initManage;
})();