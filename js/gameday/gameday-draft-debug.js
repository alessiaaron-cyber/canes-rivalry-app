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
    const context = { ...game, ...draft };
    return {
      loadedAt: new Date().toISOString(),
      script: 'gameday-draft-debug v2draftdebug2',
      fromGame: {
        first_picker: game.first_picker,
        first_picker_user_id: game.first_picker_user_id,
        current_pick_user_id: game.current_pick_user_id,
        current_pick_number: game.current_pick_number,
        draft_status: game.draft_status
      },
      fromDraft: draft,
      users: userSummary(),
      orderedUsers: CR.gameDayDraftService?.orderedUsers?.(CR.gameDay?.users || [], context),
      draftSlots: CR.gameDayDraftService?.draftSlots?.(CR.gameDay?.users || [], context),
      firstUnfilledSlot: CR.gameDayDraftService?.firstUnfilledSlot?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [], context),
      computedDraft: CR.gameDayDraftService?.computeDraftState?.(CR.gameDay?.pregame || {}, CR.gameDay?.users || [], context),
      pregame: CR.gameDay?.pregame || {}
    };
  }

  function renderPanel() {
    const existing = $('#draftDebugPanel');
    if (existing) existing.remove();
    const container = $('#gameDayContent') || document.body;
    const panel = document.createElement('details');
    panel.id = 'draftDebugPanel';
    panel.open = true;
    panel.style.cssText = 'margin:16px 0 96px;padding:12px;border:2px solid #c8102e;border-radius:14px;background:#fff;font-size:12px;white-space:pre-wrap;overflow:auto;max-height:70vh;position:relative;z-index:9999;';
    panel.innerHTML = `<summary style="font-weight:900;cursor:pointer;">Debug Draft State</summary><pre style="white-space:pre-wrap;font-size:11px;line-height:1.35;">${safe(draftContext())}</pre>`;
    container.appendChild(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function installButton() {
    if ($('#draftDebugButton')) return;
    const button = document.createElement('button');
    button.id = 'draftDebugButton';
    button.type = 'button';
    button.textContent = 'Draft Debug';
    button.style.cssText = 'position:fixed;right:12px;bottom:86px;z-index:10000;border:0;border-radius:999px;background:#111827;color:white;font-weight:800;padding:10px 12px;box-shadow:0 10px 24px rgba(0,0,0,.25);';
    button.addEventListener('click', renderPanel);
    document.body.appendChild(button);
  }

  function install() {
    installButton();
    window.setTimeout(installButton, 1000);
  }

  document.addEventListener('DOMContentLoaded', install);
  window.setTimeout(install, 500);
  window.setTimeout(installButton, 2000);
  CR.gameDayDraftDebug = { renderPanel, draftContext, installButton };
})();