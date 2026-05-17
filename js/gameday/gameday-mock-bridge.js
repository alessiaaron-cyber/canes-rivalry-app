window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const mock = () => CR.gameDayMockService;

  function shouldMock() {
    return Boolean(mock()?.isEnabled?.());
  }

  function wrapDataService() {
    const service = CR.gameDayDataService;
    if (!service || service.__mockBridgeWrapped) return;

    const realFetch = service.fetchGameDayData?.bind(service);
    service.fetchGameDayData = async (...args) => {
      if (shouldMock()) return mock().fetchGameDayData(...args);
      return realFetch?.(...args);
    };

    service.__mockBridgeWrapped = true;
  }

  function wrapSaveService() {
    const service = CR.gameDaySaveService;
    if (!service || service.__mockBridgeWrapped) return;

    const realSavePregamePicks = service.savePregamePicks?.bind(service);
    const realUndoLastDraftPick = service.undoLastDraftPick?.bind(service);

    service.savePregamePicks = async (...args) => {
      if (shouldMock()) return mock().savePregamePicks(...args);
      return realSavePregamePicks?.(...args);
    };

    service.undoLastDraftPick = async (...args) => {
      if (shouldMock()) return mock().undoLastDraftPick(...args);
      return realUndoLastDraftPick?.(...args);
    };

    service.__mockBridgeWrapped = true;
  }

  function install() {
    wrapDataService();
    wrapSaveService();
  }

  CR.gameDayMockBridge = { install, shouldMock };
  install();
})();
