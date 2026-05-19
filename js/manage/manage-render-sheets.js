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

  function profileColorAvailability(option, state) {
    const profile = CR.currentProfile || {};
    const currentId = String(profile.id || '');
    const optionHex = String(option?.hex || '').toLowerCase();
    const usedBy = (state.users || []).find((user) => {
      if (String(user.id || '') === currentId) return false;
      return String(user.colorHex || user.color_hex || '').toLowerCase() === optionHex;
    });

    if (usedBy) return { disabled: true, reason: `${userDisplayName(usedBy)} is using this color` };

    const familyUsedBy = (state.users || []).find((user) => {
      if (String(user.id || '') === currentId) return false;
      const userHex = String(user.colorHex || user.color_hex || '').toLowerCase();
      const userOption = (state.profileColorOptions || []).find((item) => String(item.hex || '').toLowerCase() === userHex);
      return userOption?.family && option?.family && userOption.family === option.family;
    });

    if (familyUsedBy) return { disabled: true, reason: `Too close to ${userDisplayName(familyUsedBy)}'s color` };

    return { disabled: false, reason: 'Available' };
  }

  function renderProfileSheet(state) {
    if (!state.profileEditOpen) return '';
    const profile = CR.currentProfile || {};
    const user = CR.currentUser || {};
    const draft = state.profileDraft || { displayName: profile.display_name || profile.username || '', colorHex: profile.color_hex || '#111827' };
    const selectedHex = String(draft.colorHex || profile.color_hex || '#111827').toLowerCase();
    const selectedOption = (state.profileColorOptions || []).find((option) => String(option.hex || '').toLowerCase() === selectedHex) || null;
    const colorButtons = (state.profileColorOptions || []).map((option) => {
      const active = String(option.hex || '').toLowerCase() === selectedHex;
      const availability = profileColorAvailability(option, state);
      const disabled = availability.disabled && !active;
      return `<button class="manage-color-option ${active ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}" type="button" style="--profile-color:${escapeHtml(option.hex)}" data-manage-profile-color="${escapeHtml(option.hex)}" ${disabled ? 'disabled aria-disabled="true"' : ''}><span class="manage-color-swatch"></span><span class="manage-color-copy"><strong>${escapeHtml(option.label)}</strong><small>${active ? 'Selected' : escapeHtml(availability.reason)}</small></span></button>`;
    }).join('');

    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="manageProfileTitle"><div class="manage-edit-backdrop" data-manage-close-profile></div><section class="manage-edit-card profile-edit-card">${renderSheetHeader('Profile', 'Edit profile', 'Update your display name and rivalry color. Email is read-only.', 'data-manage-close-profile')}<div class="manage-profile-form"><div class="manage-readonly-grid"><div class="manage-readonly-field is-wide"><span>Email</span><strong>${escapeHtml(user.email || profile.email || '—')}</strong></div></div><label class="cr-form-field"><span class="eyebrow">Display name</span><input class="cr-input" value="${escapeHtml(draft.displayName || '')}" placeholder="Display name" data-manage-profile-input="displayName" /></label><section class="manage-color-section" style="--profile-color:${escapeHtml(selectedHex)}"><div class="manage-color-section-head"><div><span class="eyebrow">Profile color</span><strong>${escapeHtml(selectedOption?.label || 'Profile color')}</strong></div><span class="manage-color-current">Preview</span></div><p class="manage-color-note">Colors must stay visually distinct so the rivalry views are easy to scan.</p><div class="manage-color-grid">${colorButtons}</div></section><button class="cr-button save" type="button" data-manage-save-profile>Save Profile</button></div></section></div>`;
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
    const locked = String(profile || '').toLowerCase().includes('playoff')
      ? state.season?.playoffScoringLocked === true
      : state.season?.regularScoringLocked === true;
    const hint = locked
      ? 'This scoring profile is locked because finalized games already use it.'
      : 'Edit point values for first goal scorer, goals, and assists.';
    const lockNote = locked ? '<p class="manage-color-note">Locked scoring can be changed only by starting a new scoring profile/season.</p>' : '';
    const disabledAttrs = locked ? 'disabled aria-disabled="true"' : '';
    const fields = [{ key: 'firstGoal', label: 'First goal scorer' }, { key: 'goal', label: 'Goal' }, { key: 'assist', label: 'Assist' }];
    return `<div class="manage-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="manageScoringTitle"><div class="manage-edit-backdrop" data-manage-close-scoring></div><section class="manage-edit-card">${renderSheetHeader(profile, locked ? 'Scoring values locked' : 'Scoring values', hint, 'data-manage-close-scoring')}${lockNote}<div class="manage-score-edit-list">${fields.map((field) => `<div class="manage-score-edit-row"><div><span class="eyebrow">${escapeHtml(field.label)}</span><strong>${escapeHtml(scoring[field.key] ?? '—')} pts</strong></div><div class="manage-stepper"><button type="button" data-manage-score-step="${field.key}" data-step="-1" ${disabledAttrs}>−</button><button type="button" data-manage-score-step="${field.key}" data-step="1" ${disabledAttrs}>+</button></div></div>`).join('')}</div></section></div>`;
  }

  CR.manageRenderSheets = {
    renderProfileSheet,
    renderRosterSheet,
    renderScheduleSheet,
    renderConfirmSheet,
    renderEditSheet,
    renderStartSeasonSheet,
    renderScoringSheet
  };
})();