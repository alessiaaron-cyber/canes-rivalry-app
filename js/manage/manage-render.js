window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const utils = CR.manageRenderUtils || {};
  const sheets = CR.manageRenderSheets || {};
  const escapeHtml = utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? ''));
  const iconButton = utils.iconButton;
  const renderActionRow = utils.renderActionRow;
  const renderToggleRow = utils.renderToggleRow;
  const renderPill = utils.renderPill;
  const renderHealthItem = utils.renderHealthItem;
  const renderEditableMetaCard = utils.renderEditableMetaCard;
  const renderCardHeader = utils.renderCardHeader;
  const renderSubviewHeader = utils.renderSubviewHeader;
  const renderRosterSheet = sheets.renderRosterSheet || (() => '');
  const renderScheduleSheet = sheets.renderScheduleSheet || (() => '');
  const renderConfirmSheet = sheets.renderConfirmSheet || (() => '');
  const renderEditSheet = sheets.renderEditSheet || (() => '');
  const renderStartSeasonSheet = sheets.renderStartSeasonSheet || (() => '');
  const renderScoringSheet = sheets.renderScoringSheet || (() => '');

  function currentProfile() { return CR.currentProfile || {}; }
  function currentUser() { return CR.currentUser || {}; }
  function isAdmin() { return String(currentProfile().role || '').toLowerCase() === 'admin'; }

  function profileDraft(state) {
    const profile = currentProfile();
    return state.profileDraft || { displayName: profile.display_name || profile.username || '', colorHex: profile.color_hex || profile.colorHex || '#111827' };
  }

  function colorFamilyFor(hex, state) {
    const normalized = String(hex || '').trim().toLowerCase();
    return state.profileColorOptions?.find((option) => option.hex.toLowerCase() === normalized)?.family || '';
  }

  function colorDisabledReason(option, state, draft) {
    const currentId = String(currentProfile().id || '');
    const optionHex = String(option.hex || '').toLowerCase();
    const optionFamily = option.family;
    const currentHex = String(draft.colorHex || '').toLowerCase();
    if (optionHex === currentHex) return '';
    const conflict = (state.users || []).find((user) => {
      if (String(user.id || '') === currentId) return false;
      const userHex = String(user.colorHex || user.color_hex || '').toLowerCase();
      if (!userHex) return false;
      return userHex === optionHex || colorFamilyFor(userHex, state) === optionFamily;
    });
    if (!conflict) return '';
    const conflictHex = String(conflict.colorHex || conflict.color_hex || '').toLowerCase();
    if (conflictHex === optionHex) return `Already used by ${escapeHtml(conflict.displayName || conflict.username || 'another player')}`;
    return `Too similar to ${escapeHtml(conflict.displayName || conflict.username || 'another player')}`;
  }

  function renderProfileColorButton(option, state, draft) {
    const selected = String(option.hex).toLowerCase() === String(draft.colorHex || '').toLowerCase();
    const reason = colorDisabledReason(option, state, draft);
    const disabled = Boolean(reason);
    return `<button class="manage-color-option ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}" type="button" data-manage-profile-color="${escapeHtml(option.hex)}" ${disabled ? 'disabled' : ''} style="--profile-color:${escapeHtml(option.hex)}"><span class="manage-color-swatch"></span><span class="manage-color-copy"><strong>${escapeHtml(option.label)}</strong><small>${selected ? 'Current color' : (reason || 'Available')}</small></span></button>`;
  }

  function renderProfileEditSheet(state) {
    if (!state.profileEditOpen) return '';
    const profile = currentProfile();
    const user = currentUser();
    const draft = profileDraft(state);
    const role = profile.role || 'member';
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="profileEditTitle"><div class="manage-edit-backdrop" data-manage-close-profile-editor></div><div class="manage-edit-card profile-edit-card"><div class="manage-edit-header"><div><div class="eyebrow">Account</div><h2 id="profileEditTitle">Edit Profile</h2><p>Personalize how you appear across Game Day, History, and Manage.</p></div><button class="manage-edit-close" type="button" data-manage-close-profile-editor aria-label="Close">×</button></div><div class="manage-profile-form"><label class="history-sheet-field"><span>Display name</span><input class="history-sheet-input" type="text" maxlength="40" value="${escapeHtml(draft.displayName)}" data-manage-profile-input="displayName" /></label><div class="manage-readonly-grid"><div class="manage-readonly-field"><span>Username</span><strong>@${escapeHtml(profile.username || 'member')}</strong></div><div class="manage-readonly-field"><span>Role</span><strong>${escapeHtml(String(role).charAt(0).toUpperCase() + String(role).slice(1))}</strong></div></div><div class="manage-readonly-field is-wide"><span>Email</span><strong>${escapeHtml(user.email || profile.email || '—')}</strong></div><div class="manage-color-section"><div class="manage-color-section-head"><div><span class="eyebrow">Profile color</span><strong>Choose your rivalry color</strong></div><span class="manage-color-current" style="--profile-color:${escapeHtml(draft.colorHex)}">${escapeHtml(draft.colorHex)}</span></div><p class="manage-color-note">Colors already used by another player, or too visually similar to theirs, are unavailable.</p><div class="manage-color-grid">${(state.profileColorOptions || []).map((option) => renderProfileColorButton(option, state, draft)).join('')}</div></div></div><button class="cr-button save" type="button" data-manage-save-profile>Save Profile</button></div></div>`;
  }

  function renderNotifications(state) {
    const enabledCount = [state.notifications.pushEnabled, state.notifications.toastsEnabled].filter(Boolean).length;
    return `<section class="panel-card manage-card">${renderCardHeader('Notifications', 'Rivalry alerts', 'Simple notification controls while the smarter rivalry logic runs automatically behind the scenes.', { className: 'neutral', label: `${enabledCount} on` })}<div class="manage-setting-stack">${renderToggleRow({ key: 'notifications.pushEnabled', label: 'Push alerts', hint: 'Send rivalry moments to your phone.', checked: state.notifications.pushEnabled })}${renderToggleRow({ key: 'notifications.toastsEnabled', label: 'In-app toasts', hint: 'Show quick banners while the app is open.', checked: state.notifications.toastsEnabled })}</div></section>`;
  }

  function renderManageTools(state) {
    return `<section class="panel-card manage-card">${renderCardHeader('Manage data', 'Roster and schedule', 'Add, update, or deactivate future-facing roster and schedule data without touching history.', { className: 'neutral', label: 'Tools' })}<div class="cr-list-stack">${renderActionRow({ title: 'Roster', meta: `${state.roster.filter((player) => player.active).length} active players · add, edit, remove`, attrs: 'data-manage-view="roster"', chevron: true })}${renderActionRow({ title: 'Schedule', meta: `${state.schedule.length} games · import, add, edit`, attrs: 'data-manage-view="schedule"', chevron: true })}</div></section>`;
  }

  function renderWatchExperience(state) {
    const selected = state.streamMode.options.find((option) => option.value === state.streamMode.selected);
    return `<section class="panel-card manage-card manage-watch-card">${renderCardHeader('Watch experience', 'Stream Mode', 'Protect against broadcast spoilers without changing the underlying rivalry engine.', { className: 'neutral', label: selected?.label || 'Custom' })}<div class="manage-option-grid">${state.streamMode.options.map((option) => renderPill(option.value, option.label, option.value === state.streamMode.selected, option.note)).join('')}</div><div class="manage-setting-stack">${renderToggleRow({ key: 'streamMode.delayPush', label: 'Delay push notifications', hint: 'Keep lock-screen alerts aligned with your spoiler buffer.', checked: state.streamMode.delayPush })}${renderToggleRow({ key: 'streamMode.delayToasts', label: 'Delay in-app toasts too', hint: 'Useful if you keep the app open while watching.', checked: state.streamMode.delayToasts })}${renderToggleRow({ key: 'streamMode.delayFeed', label: 'Delay visible feed moments', hint: 'Internal scoring stays realtime while visible updates wait.', checked: state.streamMode.delayFeed })}</div></section>`;
  }

  function renderDeveloperTools() {
    if (!isAdmin() || !CR.gameDayMockService) return '';
    const enabled = CR.gameDayMockService.isEnabled?.();
    const mode = CR.gameDayMockService.currentMode?.() || 'pregame';
    const playoffs = CR.gameDayMockService.isPlayoffs?.();
    const carryover = CR.gameDayMockService.isCarryover?.();
    const badge = enabled ? { className: 'warning', label: 'Mock on' } : { className: 'neutral', label: 'Off' };
    const modeButton = (value, label) => `<button class="mini-button cr-button ${enabled && mode === value ? 'primary' : 'secondary'}" type="button" data-manage-mock-mode="${value}">${label}</button>`;
    return `<section class="panel-card manage-card manage-dev-card">${renderCardHeader('Developer/Test Mode', 'Mock Game Day', 'Frontend-only testing tools. No Supabase writes, notifications, or real game records are touched.', badge)}<div class="manage-dev-section"><span class="eyebrow">Mock state</span><div class="manage-action-row manage-dev-actions"><button class="cr-button ${enabled ? 'secondary' : 'primary'}" type="button" data-manage-mock-toggle>${enabled ? 'Turn Off' : 'Turn On'}</button><button class="cr-button secondary" type="button" data-manage-mock-clear>Clear</button></div></div><div class="manage-dev-section"><span class="eyebrow">Game phase</span><div class="manage-action-row manage-dev-actions">${modeButton('pregame', 'Pregame')}${modeButton('live', 'Live')}${modeButton('final', 'Final')}</div></div><div class="manage-setting-stack manage-dev-toggles">${renderToggleRow({ key: 'mock.playoffs', label: 'Playoff mock', hint: 'Test playoff styling and labels.', checked: playoffs })}${renderToggleRow({ key: 'mock.carryover', label: 'Carryover mock', hint: 'Test carryover presentation safely.', checked: carryover })}</div></section>`;
  }

  function renderScoringSummary(state) {
    const selectedProfile = state.season.scoringProfile;
    const scoring = state.season.scoringSystems?.[selectedProfile] || {};
    const editAction = iconButton({ icon: 'pencil', label: 'Edit scoring', attrs: 'data-manage-edit-scoring' });
    return `<div class="manage-score-card"><div class="manage-score-card-header"><div><span class="eyebrow">${escapeHtml(selectedProfile)} scoring</span><strong>Point values</strong></div><div class="cr-card-actions">${editAction}</div></div><div class="manage-score-rule-row"><div class="manage-score-rule"><span class="eyebrow">First goal</span><strong>${escapeHtml(scoring.firstGoal ?? '—')}</strong></div><div class="manage-score-rule"><span class="eyebrow">Goal</span><strong>${escapeHtml(scoring.goal ?? '—')}</strong></div><div class="manage-score-rule"><span class="eyebrow">Assist</span><strong>${escapeHtml(scoring.assist ?? '—')}</strong></div></div></div>`;
  }

  function renderSeasonSetup(state) {
    const seasonBadge = state.season.playoffMode ? { className: 'playoff', label: 'Playoffs' } : { className: 'regular', label: 'Regular' };
    return `<section class="panel-card manage-card">${renderCardHeader('Season setup', 'Playoffs and defaults', 'Core rivalry settings for season behavior, scoring, and first-pick order.', seasonBadge)}<div class="manage-meta-grid">${renderEditableMetaCard({ field: 'activeSeasonLabel', label: 'Active season', value: state.season.activeSeasonLabel })}${renderEditableMetaCard({ field: 'scoringProfile', label: 'Scoring profile', value: state.season.scoringProfile })}${renderEditableMetaCard({ field: 'firstPicker', label: 'First picker', value: state.season.firstPicker })}</div>${renderScoringSummary(state)}<div class="manage-setting-stack">${renderToggleRow({ key: 'season.playoffMode', label: 'Playoff mode', hint: 'Use postseason behavior and settings language.', checked: state.season.playoffMode })}</div><div class="manage-action-row"><button class="cr-button secondary" type="button" data-manage-start-season>Start new season</button></div></section>`;
  }

  function renderStatus(state) {
    const realtimeTone = String(state.appHealth.realtimeStatus || '').toLowerCase() === 'connected' ? 'good' : 'neutral';
    const notificationTone = String(state.appHealth.notificationStatus || '').toLowerCase() === 'ready' ? 'good' : 'neutral';
    return `<section class="panel-card manage-card">${renderCardHeader('Status center', 'System status', 'Read-only health for realtime, notifications, install state, and sync timing.', { className: 'success', label: state.appHealth.syncStatus })}<div class="manage-health-grid">${renderHealthItem('Realtime', state.appHealth.realtimeStatus, realtimeTone)}${renderHealthItem('Notifications', state.appHealth.notificationStatus, notificationTone)}${renderHealthItem('PWA', state.appHealth.pwaStatus, 'neutral')}${renderHealthItem('Last sync', state.appHealth.lastSyncLabel, 'neutral')}</div></section>`;
  }

  function renderRosterView(state) {
    const activeCount = state.roster.filter((p) => p.active).length;
    const addAction = iconButton({ icon: 'plus', label: 'Add player', className: 'cr-icon-button--primary cr-section-action', attrs: 'data-manage-open-player-sheet="add"' });
    const rosterRows = state.roster.map((player) => {
      const actionsHtml = `<div class="cr-row-icon-actions">${iconButton({ icon: 'pencil', label: `Edit ${player.name}`, attrs: `data-manage-edit-player="${escapeHtml(player.id)}"` })}${player.active ? iconButton({ icon: 'trash', label: `Remove ${player.name}`, className: 'cr-icon-button--danger', attrs: `data-manage-confirm-remove-player="${escapeHtml(player.id)}"` }) : ''}</div>`;
      return renderActionRow({ title: player.name, meta: `${player.position} · ${player.active ? 'Active' : 'Inactive'}`, actionsHtml, muted: !player.active, tag: 'article' });
    }).join('');
    return `<div class="content-stack manage-stack">${renderSubviewHeader('Roster', 'Roster', 'Active pick list for future games. Removed players stay available in history records.')}<section class="panel-card manage-card">${renderCardHeader('Active players', 'Roster list', `${activeCount} active players`, null, addAction)}<div class="cr-list-stack">${rosterRows}</div></section>${renderRosterSheet(state)}${renderConfirmSheet(state)}</div>`;
  }

  function renderScheduleView(state) {
    const addAction = iconButton({ icon: 'plus', label: 'Add game', className: 'cr-icon-button--primary cr-section-action', attrs: 'data-manage-open-game-sheet="add"' });
    const scheduleRows = state.schedule.map((game) => {
      const actionsHtml = `<div class="cr-row-icon-actions">${iconButton({ icon: 'pencil', label: `Edit ${game.opponent} game`, attrs: `data-manage-edit-game="${escapeHtml(game.id)}"` })}${iconButton({ icon: 'trash', label: `Remove ${game.opponent} game`, className: 'cr-icon-button--danger', attrs: `data-manage-confirm-remove-game="${escapeHtml(game.id)}"` })}</div>`;
      return renderActionRow({ title: `${game.date} · ${game.opponent}`, meta: `${game.type} · ${game.firstPicker} picks first`, actionsHtml, tag: 'article' });
    }).join('');
    return `<div class="content-stack manage-stack">${renderSubviewHeader('Schedule', 'Schedule', 'Manage all games. Finalized history stays protected until explicitly edited.')}<section class="panel-card manage-card">${renderCardHeader('NHL schedule import', 'Safe sync', 'Import Canes games while preserving finalized history.', null)}<button class="cr-button primary" type="button" data-manage-import-schedule>Import NHL Schedule</button></section><section class="panel-card manage-card">${renderCardHeader('Games', 'All games', `${state.schedule.length} games`, null, addAction)}<div class="cr-list-stack">${scheduleRows}</div></section>${renderScheduleSheet(state)}${renderConfirmSheet(state)}</div>`;
  }

  function renderMain(state) {
    return `<div class="content-stack manage-stack">${renderNotifications(state)}${renderWatchExperience(state)}${renderManageTools(state)}${renderSeasonSetup(state)}${renderStatus(state)}${renderDeveloperTools()}</div>${renderProfileEditSheet(state)}${renderEditSheet(state)}${renderStartSeasonSheet(state)}${renderScoringSheet(state)}`;
  }

  function renderRoot(state) {
    if (state.activeManageView === 'roster') return renderRosterView(state);
    if (state.activeManageView === 'schedule') return renderScheduleView(state);
    return renderMain(state);
  }

  CR.manageRender = { renderRoot, renderProfileEditSheet };
})();