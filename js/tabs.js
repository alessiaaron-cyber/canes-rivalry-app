window.CR = window.CR || {};

(() => {
  const TAB_KEY = 'cr_v2_active_tab';
  const VALID_TABS = ['gameday', 'history', 'manage'];

  function normalizeTab(tabName) {
    return VALID_TABS.includes(tabName) ? tabName : 'gameday';
  }

  window.CR.getSavedTab = () => {
    try {
      return normalizeTab(window.localStorage?.getItem(TAB_KEY) || 'gameday');
    } catch (error) {
      return 'gameday';
    }
  };

  window.CR.switchTab = (tabName) => {
    const targetTab = normalizeTab(tabName);

    document.querySelectorAll('.app-view').forEach((view) => {
      view.classList.toggle('active-view', view.dataset.view === targetTab);
    });

    const bottomNav = document.querySelector('#bottomNav');

    bottomNav?.querySelectorAll('button[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === targetTab);
    });

    const pageTitle = document.querySelector('#pageTitle');

    if (pageTitle) {
      if (targetTab === 'history') {
        pageTitle.textContent = 'History';
      } else if (targetTab === 'manage') {
        pageTitle.textContent = 'Manage';
      } else {
        pageTitle.textContent = 'Game Day';
      }
    }

    try {
      window.localStorage?.setItem(TAB_KEY, targetTab);
    } catch (error) {
      // no-op
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    });
  };

  window.CR.initTabs = () => {
    const bottomNav = document.querySelector('#bottomNav');

    bottomNav?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tab]');

      if (!button) return;

      window.CR.switchTab(button.dataset.tab);
    });
  };
})();
