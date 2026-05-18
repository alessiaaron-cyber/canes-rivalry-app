window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function deps() {
    const utils = CR.manageRenderUtils || {};
    const sheets = CR.manageRenderSheets || {};
    return {
      escapeHtml: utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? '')),
      iconButton: utils.iconButton,
      renderActionRow: utils.renderActionRow,
      renderCardHeader: utils.renderCardHeader,
      renderSubviewHeader: utils.renderSubviewHeader,
      renderScheduleSheet: sheets.renderScheduleSheet || (() => ''),
      renderConfirmSheet: sheets.renderConfirmSheet || (() => '')
    };
  }

  function renderScheduleView(state) {
    const {
      escapeHtml,
      iconButton,
      renderActionRow,
      renderCardHeader,
      renderSubviewHeader,
      renderScheduleSheet,
      renderConfirmSheet
    } = deps();

    const addAction = iconButton({
      icon: 'plus',
      label: 'Add game',
      className: 'cr-icon-button--primary cr-section-action',
      attrs: 'data-manage-open-game-sheet="add"'
    });

    const scheduleRows = (state.schedule || []).map((game) => {
      const locked = Boolean(game.locked);
      const dateLabel = game.date || 'Date TBD';
      const statusLabel = locked ? 'Protected final' : (game.status || 'Scheduled');

      const actionsHtml = `
        <div class="cr-row-icon-actions">
          ${iconButton({
            icon: 'pencil',
            label: `Edit ${game.opponent} game`,
            attrs: `data-manage-edit-game="${escapeHtml(game.id)}"`
          })}
          ${!locked ? iconButton({
            icon: 'trash',
            label: `Remove ${game.opponent} game`,
            className: 'cr-icon-button--danger',
            attrs: `data-manage-confirm-remove-game="${escapeHtml(game.id)}"`
          }) : ''}
        </div>
      `;

      return renderActionRow({
        title: `${dateLabel} · ${game.opponent}`,
        meta: `${game.type} · ${game.firstPicker} picks first · ${statusLabel}`,
        actionsHtml,
        muted: locked,
        tag: 'article'
      });
    }).join('');

    return `
      <div class="content-stack manage-stack">
        ${renderSubviewHeader('Schedule', 'Schedule', 'Manage future games. Finalized history is protected from deletion.')}
        <section class="panel-card manage-card">
          ${renderCardHeader('NHL schedule import', 'Safe sync', 'Import Canes games while preserving finalized history.', null)}
          <button class="cr-button primary" type="button" data-manage-import-schedule>Import NHL Schedule</button>
        </section>
        <section class="panel-card manage-card">
          ${renderCardHeader('Games', 'All games', `${(state.schedule || []).length} games`, null, addAction)}
          <div class="cr-list-stack">${scheduleRows}</div>
        </section>
        ${renderScheduleSheet(state)}
        ${renderConfirmSheet(state)}
      </div>
    `;
  }

  CR.manageRenderModules.schedule = {
    renderScheduleView
  };
})();
