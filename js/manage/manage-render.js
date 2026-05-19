window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function fallback(name) {
    return () => {
      console.warn(`Manage render module missing: ${name}`);
      return '';
    };
  }

  function renderDeveloperTools() {
    const utils = CR.manageRenderUtils || {};
    const renderCardHeader = utils.renderCardHeader || fallback('renderCardHeader');
    const renderToggleRow = utils.renderToggleRow || fallback('renderToggleRow');
    const currentProfile = CR.currentProfile || {};
    const isAdmin = String(currentProfile.role || '').toLowerCase() === 'admin';

    if (!isAdmin || !CR.gameDayMockService) return '';

    const enabled = CR.gameDayMockService.isEnabled?.();
    const mode = CR.gameDayMockService.currentMode?.() || 'pregame';
    const playoffs = CR.gameDayMockService.isPlayoffs?.();
    const carryover = CR.gameDayMockService.isCarryover?.();
    const badge = enabled ? { className: 'warning', label: 'Mock on' } : { className: 'neutral', label: 'Off' };
    const toggleLabel = enabled ? 'Disable Mock' : 'Enable Mock';
    const toggleClass = enabled ? 'secondary' : 'primary';
    const modeButton = (value, label) => `<button class="manage-segment-button ${enabled && mode === value ? 'is-active' : ''}" type="button" data-manage-mock-mode="${value}">${label}</button>`;

    return `
      <section class="panel-card manage-card manage-dev-card">
        ${renderCardHeader('Developer/Test Mode', 'Mock Game Day', 'Frontend-only Game Day testing. Manage data/profile tools still use live data.', badge)}
        <div class="manage-dev-section">
          <span class="eyebrow">Mock state</span>
          <div class="manage-dev-button-row">
            <button class="cr-button ${toggleClass}" type="button" data-manage-mock-toggle>${toggleLabel}</button>
            <button class="cr-button secondary" type="button" data-manage-mock-clear>Clear</button>
          </div>
        </div>
        <div class="manage-dev-section">
          <span class="eyebrow">Game phase</span>
          <div class="manage-segmented-control" role="group" aria-label="Mock game phase">
            ${modeButton('pregame', 'Pregame')}
            ${modeButton('live', 'Live')}
            ${modeButton('final', 'Final')}
          </div>
        </div>
        <div class="manage-setting-stack manage-dev-toggles">
          ${renderToggleRow({ key: 'mock.playoffs', label: 'Playoff mock', hint: 'Test playoff styling and labels.', checked: playoffs })}
          ${renderToggleRow({ key: 'mock.carryover', label: 'Mock carryover', hint: 'Test carryover presentation safely.', checked: carryover })}
        </div>
      </section>
    `;
  }

  function renderProfileSummary() {
    const utils = CR.manageRenderUtils || {};
    const renderCardHeader = utils.renderCardHeader || fallback('renderCardHeader');
    const escapeHtml = utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? ''));
    const profile = CR.currentProfile || {};
    const user = CR.currentUser || {};
    const displayName = profile.display_name || profile.username || 'Player';
    const username = profile.username ? `@${profile.username}` : 'Profile';
    const color = profile.color_hex || '#111827';

    return `
      <section class="panel-card manage-card manage-profile-card">
        ${renderCardHeader('Profile', username, 'Personalize your rivalry identity and display color.', { className: 'neutral', label: 'Account' })}
        <div class="account-panel-body manage-profile-summary-body">
          <div class="account-panel-avatar" style="--profile-color:${escapeHtml(color)}">${escapeHtml(String(displayName).charAt(0).toUpperCase())}</div>
          <div class="account-panel-copy">
            <div class="account-panel-name">${escapeHtml(displayName)}</div>
            <div class="account-panel-meta">${escapeHtml(profile.role || 'member')}</div>
            <div class="account-panel-email">${escapeHtml(user.email || profile.email || '—')}</div>
          </div>
        </div>
        <button class="mini-button cr-button secondary" id="manageEditProfileButtonInline" type="button" data-manage-open-profile-editor>Edit Profile</button>
      </section>
    `;
  }

  function renderMain(state) {
    const modules = CR.manageRenderModules || {};
    const notifications = modules.notifications || {};
    const dashboard = modules.dashboard || {};
    const season = modules.season || {};
    const sheets = CR.manageRenderSheets || {};

    const renderWatchExperience = notifications.renderWatchExperience || fallback('notifications.renderWatchExperience');
    const renderTempNotificationTest = notifications.renderTempNotificationTest || fallback('notifications.renderTempNotificationTest');
    const renderNotificationDeviceStatus = notifications.renderNotificationDeviceStatus || fallback('notifications.renderNotificationDeviceStatus');
    const renderManageTools = dashboard.renderManageTools || fallback('dashboard.renderManageTools');
    const renderSeasonSetup = season.renderSeasonSetup || fallback('season.renderSeasonSetup');
    const renderEditSheet = sheets.renderEditSheet || fallback('sheets.renderEditSheet');
    const renderStartSeasonSheet = sheets.renderStartSeasonSheet || fallback('sheets.renderStartSeasonSheet');
    const renderScoringSheet = sheets.renderScoringSheet || fallback('sheets.renderScoringSheet');

    return `
      <div class="content-stack manage-stack">
        ${renderProfileSummary()}
        ${renderWatchExperience(state)}
        ${renderTempNotificationTest(state)}
        ${renderSeasonSetup(state)}
        ${renderManageTools(state)}
        ${renderNotificationDeviceStatus(state)}
        ${renderDeveloperTools(state)}
      </div>
      ${renderEditSheet(state)}
      ${renderStartSeasonSheet(state)}
      ${renderScoringSheet(state)}
    `;
  }

  function renderRoot(state) {
    const modules = CR.manageRenderModules || {};

    if (state.activeManageView === 'roster') {
      return (modules.roster?.renderRosterView || fallback('roster.renderRosterView'))(state);
    }

    if (state.activeManageView === 'schedule') {
      return (modules.schedule?.renderScheduleView || fallback('schedule.renderScheduleView'))(state);
    }

    return renderMain(state);
  }

  CR.manageRender = {
    renderRoot
  };
})();