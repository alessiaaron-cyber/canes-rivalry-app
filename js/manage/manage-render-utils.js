window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const escapeHtml = CR.ui?.escapeHtml || ((value) => String(value ?? ''));

  function iconSvg(name) {
    const icons = {
      plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
      pencil: '<path d="M21.17 6.4 17.6 2.83a2 2 0 0 0-2.83 0L3 14.6V20h5.4L20.17 8.23a2 2 0 0 0 0-2.83Z"/><path d="m14 4 6 6"/>',
      trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
      arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'
    };
    return `<svg class="cr-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.plus}</svg>`;
  }

  function iconButton({ icon, label, className = 'cr-icon-button--soft', attrs = '' }) {
    return `<button class="cr-icon-button ${className}" type="button" ${attrs} aria-label="${escapeHtml(label)}">${iconSvg(icon)}</button>`;
  }

  function renderActionRow({ title, meta, attrs = '', actionsHtml = '', muted = false, chevron = false, tag = 'button' }) {
    const safeTag = tag === 'article' ? 'article' : 'button';
    const typeAttr = safeTag === 'button' ? 'type="button"' : '';
    const suffix = actionsHtml || (chevron ? '<span class="cr-action-chevron">›</span>' : '');
    return `<${safeTag} class="cr-action-row ${muted ? 'is-muted' : ''}" ${typeAttr} ${attrs}><div class="cr-action-copy"><strong>${escapeHtml(title)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ''}</div>${suffix}</${safeTag}>`;
  }

  function renderToggleRow({ key, label, hint, checked }) {
    return `<button class="manage-toggle-row" type="button" data-manage-toggle="${escapeHtml(key)}" aria-pressed="${checked ? 'true' : 'false'}"><div class="manage-toggle-copy"><span class="manage-toggle-label">${escapeHtml(label)}</span>${hint ? `<span class="manage-toggle-hint">${escapeHtml(hint)}</span>` : ''}</div><span class="manage-switch ${checked ? 'is-on' : ''}" aria-hidden="true"><span class="manage-switch-knob"></span></span></button>`;
  }

  function renderPill(value, label, active, note) {
    return `<button class="manage-option-pill ${active ? 'is-active' : ''}" type="button" data-manage-stream-option="${escapeHtml(value)}" aria-pressed="${active ? 'true' : 'false'}"><span class="manage-option-pill-label">${escapeHtml(label)}</span>${note ? `<span class="manage-option-pill-note">${escapeHtml(note)}</span>` : ''}</button>`;
  }

  function renderHealthItem(label, value, tone = 'neutral') {
    return `<article class="manage-health-item"><div class="manage-health-topline"><span class="eyebrow">${escapeHtml(label)}</span><span class="cr-pill ${escapeHtml(tone)}">${escapeHtml(value)}</span></div></article>`;
  }

  function renderEditableMetaCard({ field, label, value }) {
    return `<button class="manage-meta-card manage-meta-button" type="button" data-manage-edit="${escapeHtml(field)}" aria-label="Edit ${escapeHtml(label)}"><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span class="manage-meta-edit-hint cr-icon-button cr-icon-button--ghost" aria-hidden="true">${iconSvg('pencil')}</span></button>`;
  }

  function renderCardHeader(eyebrow, title, copy, badge, actionHtml = '') {
    const badgeHtml = badge ? `<span class="cr-pill ${escapeHtml(badge.className || 'neutral')}">${escapeHtml(badge.label || '')}</span>` : '';
    return `<div class="panel-header compact-header manage-card-header"><div class="manage-card-header-main"><div class="eyebrow">${escapeHtml(eyebrow)}</div><h2>${escapeHtml(title)}</h2></div><div class="cr-card-actions">${badgeHtml}${actionHtml}</div></div>${copy ? `<div class="manage-card-header-divider"></div><p class="manage-card-header-copy">${escapeHtml(copy)}</p>` : ''}`;
  }

  function renderSubviewHeader(label, title, copy) {
    return `<section class="panel-card cr-subpage-hero manage-subview-hero"><button class="cr-button back cr-back-button" type="button" data-manage-view="main">← Manage</button><span class="cr-pill neutral">${escapeHtml(label)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></section>`;
  }

  function renderSheetHeader(eyebrow, title, copy, closeAttr) {
    return `<div class="gd-sheet-handle"></div><div class="manage-edit-header"><div><div class="eyebrow">${escapeHtml(eyebrow)}</div><h2>${escapeHtml(title)}</h2>${copy ? `<p>${escapeHtml(copy)}</p>` : ''}</div><button class="manage-edit-close" type="button" ${closeAttr} aria-label="Close">×</button></div>`;
  }

  CR.manageRenderUtils = {
    escapeHtml,
    iconSvg,
    iconButton,
    renderActionRow,
    renderToggleRow,
    renderPill,
    renderHealthItem,
    renderEditableMetaCard,
    renderCardHeader,
    renderSubviewHeader,
    renderSheetHeader
  };
})();