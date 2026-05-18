window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function deps() {
    const utils = CR.manageRenderUtils || {};
    return {
      escapeHtml: utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? '')),
      renderActionRow: utils.renderActionRow,
      renderCardHeader: utils.renderCardHeader,
      renderHealthItem: utils.renderHealthItem
    };
  }

  function renderManageTools(state) {
    const { renderActionRow, renderCardHeader } = deps();
    const activeRosterCount = (state.roster || []).filter((player) => player.active).length;

    return `
      <section class="panel-card manage-card">
        ${renderCardHeader('Manage data', 'Roster and schedule', 'Add, update, or deactivate future-facing roster and schedule data without touching history.', { className: 'neutral', label: 'Tools' })}
        <div class="cr-list-stack">
          ${renderActionRow({
            title: 'Roster',
            meta: `${activeRosterCount} active players · add, edit, remove`,
            attrs: 'data-manage-view="roster"',
            chevron: true
          })}
          ${renderActionRow({
            title: 'Schedule',
            meta: `${(state.schedule || []).length} games · import, add, edit`,
            attrs: 'data-manage-view="schedule"',
            chevron: true
          })}
        </div>
      </section>
    `;
  }

  function renderStatus(state) {
    const { renderCardHeader, renderHealthItem } = deps();
    const health = state.appHealth || {};
    const realtimeTone = String(health.realtimeStatus || '').toLowerCase() === 'connected' ? 'good' : 'neutral';
    const notificationTone = String(health.notificationStatus || '').toLowerCase() === 'ready' ? 'good' : 'neutral';

    return `
      <section class="panel-card manage-card">
        ${renderCardHeader('Status center', 'System status', 'Read-only health for realtime, notifications, install state, and sync timing.', { className: 'success', label: health.syncStatus })}
        <div class="manage-health-grid">
          ${renderHealthItem('Realtime', health.realtimeStatus, realtimeTone)}
          ${renderHealthItem('Notifications', health.notificationStatus, notificationTone)}
          ${renderHealthItem('PWA', health.pwaStatus, 'neutral')}
          ${renderHealthItem('Last sync', health.lastSyncLabel, 'neutral')}
        </div>
      </section>
    `;
  }

  CR.manageRenderModules.dashboard = {
    renderManageTools,
    renderStatus
  };
})();
