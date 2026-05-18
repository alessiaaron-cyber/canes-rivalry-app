window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const utils = CR.manageRenderUtils || {};
  const escapeHtml = utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? ''));
  const renderSheetHeader = utils.renderSheetHeader;

  function userDisplayName(user) {
    return user?.displayName || user?.display_name || user?.username || 'Player';
  }

  function selectedPickerMatches(draft, user) {
    const displayName = userDisplayName(user);
    return String(draft?.firstPickerUserId || '') === String(user?.id || '') || String(draft?.firstPicker || '') === displayName || String(draft?.firstPicker || '') === String(user?.username || '');
  }

  function renderRosterSheet(state) {
    if (!state.rosterSheetOpen) return '';
    const isEditing = Boolean(state.editingRosterPlayerId);
    const title = isEditing ? 'Edit Player' : 'Add Player';
    const actionLabel = isEditing ? 'Save Player' : 'Add Player';
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true"><div class="manage-edit-backdrop" data-manage-close-player-sheet></div><section class="manage-edit-card">${renderSheetHeader('Roster', title, 'Manage future pick eligibility without changing historical records.', 'data-manage-close-player-sheet')}<div class="cr-form-grid"><label><span class="eyebrow">Name</span><input class="cr-input" value="${escapeHtml(state.rosterDraft.name)}" placeholder="Player name" data-manage-roster-input="name" /></label><label><span class="eyebrow">Position</span><select class="cr-input" data-manage-roster-input="position"><option ${state.rosterDraft.position === 'F' ? 'selected' : ''}>F</option><option ${state.rosterDraft.position === 'D' ? 'selected' : ''}>D</option></select></label></div><button class="cr-button save" type="button" data-manage-save-player>${actionLabel}</button></section></div>`;
  }

  function renderScheduleSheet(state) {
    if (!state.scheduleSheetOpen) return '';
    const isEditing = Boolean(state.editingScheduleGameId);
    const title = isEditing ? 'Edit Game' : 'Add Game';
    const actionLabel = isEditing ? 'Save Game' : 'Add Game';
    const pickerOptions = (state.users || []).map((user) => {
      const displayName = userDisplayName(user);
      const selected = selectedPickerMatches(state.scheduleDraft, user);
      return `<option value="${escapeHtml(user.id || displayName)}" data-picker-label="${escapeHtml(displayName)}" ${selected ? 'selected' : ''}>${escapeHtml(displayName)}</option>`;
    }).join('');
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true"><div class="manage-edit-backdrop" data-manage-close-game-sheet></div><section class="manage-edit-card">${renderSheetHeader('Schedule', title, 'Manage future schedule data without changing finalized history.', 'data-manage-close-game-sheet')}<div class="cr-form-grid"><label><span class="eyebrow">Date</span><input class="cr-input" value="${escapeHtml(state.scheduleDraft.date)}" placeholder="YYYY-MM-DD" data-manage-schedule-input="date" /></label><label><span class="eyebrow">Opponent</span><input class="cr-input" value="${escapeHtml(state.scheduleDraft.opponent)}" placeholder="NYR, FLA, etc." data-manage-schedule-input="opponent" /></label><label><span class="eyebrow">Type</span><select class="cr-input" data-manage-schedule-input="type"><option ${state.scheduleDraft.type === 'Regular Season' || state.scheduleDraft.type === 'Regular' ? 'selected' : ''}>Regular Season</option><option ${state.scheduleDraft.type === 'Playoffs' ? 'selected' : ''}>Playoffs</option></select></label><label><span class="eyebrow">First pick</span><select class="cr-input" data-manage-schedule-input="firstPickerUserId">${pickerOptions}</select></label></div><button class="cr-button save" type="button" data-manage-save-game>${actionLabel}</button></section></div>`;
  }

  function renderConfirmSheet(state) {
    if (!state.confirmRemove) return '';
    const item = state.confirmRemove;
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true"><div class="manage-edit-backdrop" data-manage-cancel-remove></div><section class="manage-edit-card">${renderSheetHeader('Confirm remove', item.type === 'player' ? 'Remove Player?' : 'Remove Game?', 'This removes the item from future setup while preserving existing history.', 'data-manage-cancel-remove')}<div class="manage-confirm-copy"><strong>${escapeHtml(item.label)}</strong><span>This cannot be restored from this screen.</span></div><div class="cr-sheet-actions single"><button class="cr-button remove full" type="button" data-manage-confirm-remove>Remove</button></div></section></div>`;
  }

  function renderEditSheet(state) {
    const field = state.activeEditField;
    if (!field) return '';
    const editConfig = state.editOptions?.[field];
    if (!editConfig) return '';
    const currentValue = state.season?.[field];
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="manageEditSheetTitle"><div class="manage-edit-backdrop" data-manage-close-edit></div><section class="manage-edit-card">${renderSheetHeader('Season setup', editConfig.title, editConfig.hint, 'data-manage-close-edit')}<div class="manage-edit-options">${editConfig.options.map((option) => `<button class="manage-edit-option ${option === currentValue ? 'is-active' : ''}" type="button" data-manage-edit-value="${escapeHtml(option)}"><span>${escapeHtml(option)}</span>${option === currentValue ? '<strong>Selected</strong>' : ''}</button>`).join('')}</div></section></div>`;
  }

  function renderStartSeasonSheet(state) {
    if (!state.startSeasonOpen) return '';
    const draft = state.newSeasonDraft;
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="manageStartSeasonTitle"><div class="manage-edit-backdrop" data-manage-close-start-season></div><section class="manage-edit-card">${renderSheetHeader('Season setup', 'Start new season', 'Creates a blank current season for History while all-time rivalry data stays intact.', 'data-manage-close-start-season')}<label class="cr-form-field"><span class="eyebrow">Season name</span><input class="cr-input" value="${escapeHtml(draft?.seasonLabel || '')}" placeholder="2026-27" data-manage-new-season-input /></label><div class="manage-edit-options manage-edit-options-spaced">${(state.users || []).map((user) => { const displayName = userDisplayName(user); const selected = String(user.id || '') === String(draft?.firstPickerUserId || '') || displayName === draft?.firstPicker || user.username === draft?.firstPicker; return `<button class="manage-edit-option ${selected ? 'is-active' : ''}" type="button" data-manage-new-season-picker="${escapeHtml(user.id || displayName)}" data-picker-label="${escapeHtml(displayName)}"><span>${escapeHtml(displayName)} picks first</span>${selected ? '<strong>Selected</strong>' : ''}</button>`; }).join('')}</div><button class="cr-button primary" type="button" data-manage-confirm-start-season>Start ${escapeHtml(draft?.seasonLabel || 'season')}</button></section></div>`;
  }

  function renderScoringSheet(state) {
    if (!state.scoringEditOpen) return '';
    const profile = state.scoringEditProfile || state.season.scoringProfile || 'Regular';
    const scoring = state.season.scoringSystems?.[profile] || {};
    const fields = [{ key: 'firstGoal', label: 'First goal scorer' }, { key: 'goal', label: 'Goal' }, { key: 'assist', label: 'Assist' }];
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="manageScoringTitle"><div class="manage-edit-backdrop" data-manage-close-scoring></div><section class="manage-edit-card">${renderSheetHeader(profile, 'Scoring values', 'Edit point values for first goal scorer, goals, and assists.', 'data-manage-close-scoring')}<div class="manage-score-edit-list">${fields.map((field) => `<div class="manage-score-edit-row"><div><span class="eyebrow">${escapeHtml(field.label)}</span><strong>${escapeHtml(scoring[field.key] ?? '—')} pts</strong></div><div class="manage-stepper"><button type="button" data-manage-score-step="${field.key}" data-step="-1">−</button><button type="button" data-manage-score-step="${field.key}" data-step="1">+</button></div></div>`).join('')}</div></section></div>`;
  }

  CR.manageRenderSheets = {
    renderRosterSheet,
    renderScheduleSheet,
    renderConfirmSheet,
    renderEditSheet,
    renderStartSeasonSheet,
    renderScoringSheet
  };
})();