window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function getDeps() {
    const utils = CR.manageRenderUtils || {};
    const sheets = CR.manageRenderSheets || {};

    return {
      escapeHtml: utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? '')),
      iconButton: utils.iconButton,
      renderActionRow: utils.renderActionRow,
      renderCardHeader: utils.renderCardHeader,
      renderSubviewHeader: utils.renderSubviewHeader,
      renderRosterSheet: sheets.renderRosterSheet || (() => ''),
      renderConfirmSheet: sheets.renderConfirmSheet || (() => '')
    };
  }

  function renderRosterActions(player, deps) {
    const { escapeHtml, iconButton } = deps;
    const playerId = escapeHtml(player.id);
    const playerName = escapeHtml(player.name);

    const editAction = iconButton({
      icon: 'pencil',
      label: `Edit ${player.name}`,
      attrs: `data-manage-edit-player="${playerId}"`
    });

    const activeAction = player.active
      ? iconButton({
          icon: 'trash',
          label: `Remove ${player.name}`,
          className: 'cr-icon-button--danger',
          attrs: `data-manage-confirm-remove-player="${playerId}"`
        })
      : iconButton({
          icon: 'refresh',
          label: `Restore ${player.name}`,
          attrs: `data-manage-restore-player="${playerId}" title="Restore ${playerName}"`
        });

    return `<div class="cr-row-icon-actions">${editAction}${activeAction}</div>`;
  }

  function renderRosterView(state) {
    const deps = getDeps();
    const {
      escapeHtml,
      iconButton,
      renderActionRow,
      renderCardHeader,
      renderSubviewHeader,
      renderRosterSheet,
      renderConfirmSheet
    } = deps;

    const activeCount = state.roster.filter((player) => player.active).length;
    const totalCount = state.roster.length;

    const addAction = iconButton({
      icon: 'plus',
      label: 'Add player',
      className: 'cr-icon-button--primary cr-section-action',
      attrs: 'data-manage-open-player-sheet="add"'
    });

    const rosterRows = state.roster.map((player) => {
      return renderActionRow({
        title: player.name,
        meta: `${player.position} · ${player.active ? 'Active' : 'Inactive'}`,
        actionsHtml: renderRosterActions(player, deps),
        muted: !player.active,
        tag: 'article'
      });
    }).join('');

    return `
      <div class="content-stack manage-stack">
        ${renderSubviewHeader('Roster', 'Roster', 'Active pick list for future games. Removed players stay available in history records.')}
        <section class="panel-card manage-card">
          ${renderCardHeader('Players', 'Roster list', `${activeCount} active · ${totalCount} total`, null, addAction)}
          <div class="cr-list-stack">${rosterRows}</div>
        </section>
        ${renderRosterSheet(state)}
        ${renderConfirmSheet(state)}
      </div>
    `;
  }

  CR.manageRenderModules.roster = {
    renderRosterView
  };
})();
