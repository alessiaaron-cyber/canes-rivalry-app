window.CR = window.CR || {};
window.CR.ui = window.CR.ui || {};

window.CR.$ = (selector) => document.querySelector(selector);

window.CR.ui.escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

window.CR.ui.setActionBusy = (button, isBusy, options = {}) => {
  if (!button) return;

  if (isBusy) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent || '';
    button.disabled = true;
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');
    button.textContent = options.label || 'Working…';
    return;
  }

  button.disabled = false;
  button.classList.remove('is-busy');
  button.removeAttribute('aria-busy');
  if (button.dataset.idleLabel) {
    button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }
};

window.CR.ui.changedKeys = window.CR.ui.changedKeys || new Set();
window.CR.ui.changedTimers = window.CR.ui.changedTimers || new Map();

window.CR.ui.markChanged = (keys, options = {}) => {
  const list = Array.isArray(keys) ? keys : [keys];
  const cleanKeys = list.map((key) => String(key || '').trim()).filter(Boolean);
  if (!cleanKeys.length) return;

  const ttl = Number(options.ttl || 1200);
  const onChange = typeof options.onChange === 'function' ? options.onChange : null;

  cleanKeys.forEach((key) => {
    window.CR.ui.changedKeys.add(key);
    clearTimeout(window.CR.ui.changedTimers.get(key));
    window.CR.ui.changedTimers.set(key, setTimeout(() => {
      window.CR.ui.changedKeys.delete(key);
      window.CR.ui.changedTimers.delete(key);
      if (onChange) onChange({ key, active: false });
    }, ttl));
  });

  if (onChange) onChange({ keys: cleanKeys, active: true });
};

window.CR.ui.clearChanged = (keys) => {
  const list = keys ? (Array.isArray(keys) ? keys : [keys]) : Array.from(window.CR.ui.changedKeys);
  list.forEach((key) => {
    clearTimeout(window.CR.ui.changedTimers.get(key));
    window.CR.ui.changedTimers.delete(key);
    window.CR.ui.changedKeys.delete(key);
  });
};

window.CR.ui.isChanged = (key) => window.CR.ui.changedKeys.has(String(key || '').trim());

window.CR.ui.changedClass = (key, className = 'is-realtime-changed') => (
  window.CR.ui.isChanged(key) ? className : ''
);

window.CR.ui.lockBodyScroll = (className = 'sheet-open') => {
  const lock = window.CR.__bodyScrollLock || { locked: false, scrollY: 0, classes: new Set() };
  lock.classes.add(className);

  if (!lock.locked) {
    lock.scrollY = window.scrollY || window.pageYOffset || 0;
    lock.locked = true;
    document.body.style.top = `-${lock.scrollY}px`;
  }

  document.body.classList.add(className);
  document.documentElement.classList.add(className);
  window.CR.__bodyScrollLock = lock;
};

window.CR.ui.unlockBodyScroll = (className = 'sheet-open') => {
  const lock = window.CR.__bodyScrollLock;
  if (!lock?.locked) return;

  lock.classes.delete(className);
  document.body.classList.remove(className);
  document.documentElement.classList.remove(className);

  if (lock.classes.size > 0) {
    window.CR.__bodyScrollLock = lock;
    return;
  }

  const scrollY = lock.scrollY || 0;
  document.body.style.top = '';
  lock.locked = false;
  lock.scrollY = 0;
  window.CR.__bodyScrollLock = lock;
  window.scrollTo(0, scrollY);
};

window.CR.ui.createViewStore = ({ initialState = {}, render, onAfterRender } = {}) => {
  let state = { ...initialState };
  let scheduled = false;

  function getState() { return state; }

  function setState(patch = {}, options = {}) {
    const nextPatch = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...(nextPatch || {}) };
    if (options.render === false) return state;
    scheduleRender();
    return state;
  }

  function replaceState(nextState = {}, options = {}) {
    state = { ...(nextState || {}) };
    if (options.render === false) return state;
    scheduleRender();
    return state;
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; renderNow(); });
  }

  function renderNow() {
    if (typeof render === 'function') render(state);
    if (typeof onAfterRender === 'function') onAfterRender(state);
  }

  return { getState, setState, replaceState, render: renderNow, scheduleRender };
};

window.CR.showToast = (input) => {
  const toast = window.CR.$('#toast');
  if (!toast) return;

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const payload = typeof input === 'string' ? { message: input, tier: 'light' } : (input || {});
  const message = payload.message || '';
  const tier = payload.tier || 'light';

  toast.textContent = message;
  toast.dataset.tier = tier;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), prefersReducedMotion ? 1800 : 2400);
};

window.CR.flashSync = () => {};

window.CR.initPullRefresh = () => {
  const indicator = window.CR.$('#pullRefresh');
  const label = window.CR.$('#pullRefreshLabel');

  if (!indicator || window.CR.__pullRefreshBound) return;
  window.CR.__pullRefreshBound = true;

  let pulling = false;
  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let refreshTriggered = false;
  let blockedTarget = false;

  const THRESHOLD = 84;
  const MAX_PULL = 120;

  function resetPull() {
    pulling = false;
    refreshTriggered = false;
    blockedTarget = false;
    indicator.classList.remove('visible', 'ready', 'refreshing');
    indicator.style.setProperty('--pull-distance', '0px');
    if (label) label.textContent = 'Pull to refresh';
  }

  function isFormControl(target) { return Boolean(target?.closest?.('input, textarea, select, button, [contenteditable="true"]')); }
  function isSheetInteraction(target) { return Boolean(target?.closest?.('.gd-sheet, .history-admin-sheet, .history-admin-sheet-card, .history-sheet-panel, .history-sheet-form, .history-admin-sheet-details')); }

  function findScrollableAncestor(target) {
    let node = target instanceof Element ? target : null;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      if (canScrollY) return node;
      node = node.parentElement;
    }
    return null;
  }

  function shouldIgnorePull(event) {
    const target = event.target;
    if (window.CR.__bodyScrollLock?.locked) return true;
    if (isFormControl(target)) return true;
    if (isSheetInteraction(target)) return true;
    if (findScrollableAncestor(target)) return true;
    return false;
  }

  window.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    blockedTarget = shouldIgnorePull(event);
    if (blockedTarget) return;
    pulling = true;
    startY = event.touches[0].clientY;
    startX = event.touches[0].clientX;
    currentY = startY;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (blockedTarget) return;
    if (!pulling || refreshTriggered) return;
    if (window.scrollY > 0) return;
    if (event.touches.length !== 1) return;

    currentY = event.touches[0].clientY;
    const deltaY = currentY - startY;
    const deltaX = event.touches[0].clientX - startX;

    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) { resetPull(); return; }

    const delta = Math.max(0, Math.min(MAX_PULL, deltaY));
    if (delta < 8) return;

    indicator.classList.add('visible');
    indicator.style.setProperty('--pull-distance', `${delta}px`);

    if (delta >= THRESHOLD) {
      indicator.classList.add('ready');
      if (label) label.textContent = 'Release to refresh';
    } else {
      indicator.classList.remove('ready');
      if (label) label.textContent = 'Pull to refresh';
    }
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (blockedTarget) { resetPull(); return; }
    if (!pulling) return;

    const delta = Math.max(0, Math.min(MAX_PULL, currentY - startY));
    if (delta >= THRESHOLD && !refreshTriggered) {
      refreshTriggered = true;
      indicator.classList.add('refreshing');
      indicator.classList.remove('ready');
      if (label) label.textContent = 'Refreshing…';
      try {
        window.CR.showToast?.('Refreshing rivalry data');
        if (typeof window.CR.refreshApp === 'function') await window.CR.refreshApp();
        else window.location.reload();
      } catch (error) { console.error('Pull refresh failed', error); }
    }
    setTimeout(resetPull, 420);
  });

  window.addEventListener('touchcancel', resetPull, { passive: true });
};
