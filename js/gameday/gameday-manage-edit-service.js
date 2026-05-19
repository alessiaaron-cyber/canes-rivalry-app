window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function ensureState() {
    CR.gameDayEditState = CR.gameDayEditState || {};
    return CR.gameDayEditState;
  }

  function openBuffer(pregame = {}) {
    const state = ensureState();
    state.isEditing = true;
    state.bufferPregame = clone(pregame);
    return state.bufferPregame;
  }

  function getBuffer() {
    return ensureState().bufferPregame || {};
  }

  function updatePick(sideKey, pickIndex, value) {
    const state = ensureState();
    const buffer = state.bufferPregame || {};
    const current = Array.isArray(buffer?.[sideKey]) ? [...buffer[sideKey]] : [];
    current[pickIndex] = value;
    buffer[sideKey] = current.filter(Boolean);
    state.bufferPregame = buffer;
    state.isEditing = true;
    return state.bufferPregame;
  }

  function clear() {
    CR.gameDayEditState = {
      isEditing: false,
      bufferPregame: null
    };
  }

  CR.gameDayManageEditService = {
    openBuffer,
    getBuffer,
    updatePick,
    clear
  };
})();