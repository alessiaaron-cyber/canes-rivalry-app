window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const DATA_TABLES = [
    'games',
    'picks',
    'seasons',
    'players',
    'game_user_scores',
    'season_user_totals'
  ];

  function historyEditing() {
    return Boolean(CR.historyState?.sheet?.open || document.querySelector('.history-edit-sheet.is-open, [data-history-edit-sheet].is-open'));
  }

  function manageEditing() {
    return Boolean(document.querySelector('.manage-sheet.is-open, .manage-modal.is-open, #manageSheet[aria-hidden="false"]'));
  }

  async function refreshGameDay() {
    if (typeof CR.refreshGameDayData === 'function') {
      await CR.refreshGameDayData({ skipIfEditing: true, silent: true });
    }
  }

  async function refreshHistory() {
    if (historyEditing()) {
      CR.historyNeedsRefresh = true;
      return;
    }

    if (typeof CR.refreshHistoryData === 'function') {
      await CR.refreshHistoryData({ silent: true, force: true });
    }
  }

  async function refreshManage() {
    if (manageEditing()) {
      CR.manageNeedsRefresh = true;
      return;
    }

    if (typeof CR.hydrateManageData === 'function') {
      await CR.hydrateManageData();
    }
    CR.renderManage?.();
  }

  async function refreshFromRealtime(payloads = []) {
    const tables = [...new Set(payloads.map((payload) => payload?.table).filter(Boolean))];

    if (!tables.length) return;

    try {
      CR.flashSync?.();

      await Promise.all([
        refreshGameDay(),
        refreshHistory(),
        refreshManage()
      ]);

      console.log('Realtime refresh applied for tables:', tables.join(', '));
    } catch (error) {
      console.error('Realtime refresh failed', error);
    }
  }

  function register() {
    CR.realtime?.register?.('app-data-refresh', {
      tables: DATA_TABLES,
      debounceMs: 600,
      onChange: refreshFromRealtime
    });
  }

  CR.realtimeRefreshHandler = {
    register,
    refreshFromRealtime
  };
})();