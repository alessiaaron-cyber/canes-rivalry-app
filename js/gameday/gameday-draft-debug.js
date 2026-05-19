window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const $ = (selector) => document.querySelector(selector);

  function safe(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  function userSummary() {
    return (CR.gameDay?.users || []).map((user, index) => ({
      index,
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.display_name,
      profileKey: user.profileKey || user.profile_key,
      colorHex: user.colorHex || user.color_hex
    }));
  }

  function draftContext() {
    const game = CR.gameDay?.game || {};
    const draft = CR.gameDay?.draft || {};
    return {
      fromGame: {
        first_picker: game.first_picker,
        first_picker_user_id: game.first_picker_user_id,
        current_pick_user_id: game.current_pick_user_id,
        current_pick_number: game.current_pick_number,
        draft_status: game.draft_status
      },
      fromDraft: draft,
      users: userSummary(),
      orderedUsers: CR.gameDayDraftService?.orderedUsers?.(CR.gameDay?.users || [], { ...game, ...draft }),
      draftSlots: CR.gameDayDraftService?.draftSlots?.(CR.gameDay?.users || [], { ...game, ...draft }),
      firstUnfilledSlot: CR.gameDayDraftService?.firstUnfilledSlot?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [], { ...game, ...draft }),
      computedDraft: CR.gameDayDraftService?.computeDraftState?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [], { ...game, ...draft }),
      pregame: CR.gameDay?.pregame || {}
    };
  }

  function renderPanel() {
    const existing = $('#draftDebugPanel');
    if (existing) existing.remove();
    const container = $('#gameDayContent');
    if (!container) return;
    const panel = document.createElement('details');
    panel.id = 'draftDebugPanel';
    panel.style.cssText = 'margin:16px 0;padding:12px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;font-size:12px;white-space:pre-wrap;overflow:auto;max-height:420px;';
    panel.innerHTML = `<summary style="font-weight:800;cursor:pointer;">Debug Draft State</summary><pre style="white-space:pre-wrap;font-size:11px;line-height:1.35;">${safe(draftContext())}</pre>`;
    container.appendChild(panel);
  }

  function install() {
    const originalRender = CR.renderGameDayState;
    if (typeof originalRender === 'function' && !originalRender.__draftDebugWrapped) {
      const wrapped = function(...args) {
        const result = originalRender.apply(this, args);
        window.setTimeout(renderPanel, 0);
        return result;
      };
      wrapped.__draftDebugWrapped = true;
      CR.renderGameDayState = wrapped;
    }
    window.setTimeout(renderPanel, 0);
  }

  document.addEventListener('DOMContentLoaded', install);
  window.setTimeout(install, 500);
  CR.gameDayDraftDebug = { renderPanel, draftContext };
})();