window.CR = window.CR || {};

(() => {
  const TAB_KEY = 'cr_v2_active_tab';
  const VALID_TABS = ['gameday', 'history', 'manage'];
  const DRAG_THRESHOLD = 5;

  function normalizeTab(tabName) {
    return VALID_TABS.includes(tabName) ? tabName : 'gameday';
  }

  function getNavButtons(bottomNav) {
    return Array.from(bottomNav?.querySelectorAll('button[data-tab]') || []);
  }

  function getIndicatorOffsets(bottomNav) {
    const buttons = getNavButtons(bottomNav);
    const navLeft = bottomNav?.getBoundingClientRect().left || 0;

    return buttons.map((button) => button.getBoundingClientRect().left - navLeft - 6);
  }

  function setIndicatorOffset(bottomNav, offset) {
    bottomNav?.style.setProperty('--nav-indicator-x', `${Math.max(0, offset)}px`);
  }

  function syncIndicatorToActive(bottomNav) {
    const buttons = getNavButtons(bottomNav);
    const offsets = getIndicatorOffsets(bottomNav);
    const activeIndex = Math.max(0, buttons.findIndex((button) => button.classList.contains('active')));
    setIndicatorOffset(bottomNav, offsets[activeIndex] || 0);
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

    syncIndicatorToActive(bottomNav);

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

    if (!bottomNav) return;

    let dragState = null;
    let suppressClick = false;

    const finishDrag = (event, cancelled = false) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const buttons = getNavButtons(bottomNav);
      const offsets = getIndicatorOffsets(bottomNav);
      const currentOffset = Number.parseFloat(bottomNav.style.getPropertyValue('--nav-indicator-x')) || dragState.startOffset;
      const didDrag = dragState.dragging;

      bottomNav.classList.remove('is-dragging');

      if (bottomNav.hasPointerCapture?.(event.pointerId)) {
        bottomNav.releasePointerCapture(event.pointerId);
      }

      if (cancelled || !didDrag) {
        syncIndicatorToActive(bottomNav);
      } else {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        offsets.forEach((offset, index) => {
          const distance = Math.abs(offset - currentOffset);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
          }
        });

        suppressClick = true;
        window.CR.switchTab(buttons[nearestIndex]?.dataset.tab);
      }

      dragState = null;
    };

    bottomNav.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const buttons = getNavButtons(bottomNav);
      const offsets = getIndicatorOffsets(bottomNav);
      const activeIndex = Math.max(0, buttons.findIndex((button) => button.classList.contains('active')));

      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startOffset: offsets[activeIndex] || 0,
        minOffset: offsets[0] || 0,
        maxOffset: offsets[offsets.length - 1] || 0,
        dragging: false
      };

      bottomNav.setPointerCapture?.(event.pointerId);
    });

    bottomNav.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const deltaX = event.clientX - dragState.startX;

      if (!dragState.dragging && Math.abs(deltaX) >= DRAG_THRESHOLD) {
        dragState.dragging = true;
        bottomNav.classList.add('is-dragging');
      }

      if (!dragState.dragging) return;

      const nextOffset = Math.min(
        dragState.maxOffset,
        Math.max(dragState.minOffset, dragState.startOffset + deltaX)
      );

      setIndicatorOffset(bottomNav, nextOffset);
    });

    bottomNav.addEventListener('pointerup', (event) => finishDrag(event));
    bottomNav.addEventListener('pointercancel', (event) => finishDrag(event, true));

    bottomNav.addEventListener('click', (event) => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        return;
      }

      const button = event.target.closest('button[data-tab]');

      if (!button) return;

      window.CR.switchTab(button.dataset.tab);
    });

    window.addEventListener('resize', () => syncIndicatorToActive(bottomNav));
    syncIndicatorToActive(bottomNav);
  };
})();
