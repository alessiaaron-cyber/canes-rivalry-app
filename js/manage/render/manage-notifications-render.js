window.CR = window.CR || {};
window.CR.manageRenderModules = window.CR.manageRenderModules || {};

(() => {
  const CR = window.CR;

  function deps() {
    const utils = CR.manageRenderUtils || {};
    return {
      escapeHtml: utils.escapeHtml || CR.ui?.escapeHtml || ((value) => String(value ?? '')),
      renderToggleRow: utils.renderToggleRow,
      renderCardHeader: utils.renderCardHeader,
      renderHealthItem: utils.renderHealthItem
    };
  }

  function renderDelayChoice(group, option, selectedValue) {
    const { escapeHtml } = deps();
    const active = Number(option.value) === Number(selectedValue);
    return `
      <button class="manage-option-pill ${active ? 'is-active' : ''}" type="button" data-manage-delay-group="${escapeHtml(group)}" data-manage-delay-seconds="${escapeHtml(option.value)}" aria-pressed="${active ? 'true' : 'false'}">
        <span class="manage-option-pill-label">${escapeHtml(option.label)}</span>
        ${option.note ? `<span class="manage-option-pill-note">${escapeHtml(option.note)}</span>` : ''}
      </button>
    `;
  }

  function renderWatchExperience(state) {
    const { escapeHtml, renderToggleRow, renderCardHeader } = deps();
    const watch = state.watchExperience || {};
    const options = watch.delayOptions || CR.manageModel?.DELAY_OPTIONS || [];
    const saveState = watch.saveState || 'idle';
    const status = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Could not save' : 'Personal';
    const pushLabel = (options.find((option) => Number(option.value) === Number(watch.pushDelaySeconds)) || {}).label || `${watch.pushDelaySeconds || 0}s`;
    const toastLabel = (options.find((option) => Number(option.value) === Number(watch.toastDelaySeconds)) || {}).label || `${watch.toastDelaySeconds || 0}s`;

    return `
      <section class="panel-card manage-card manage-watch-card">
        ${renderCardHeader('Watch Experience', 'Notification timing', 'Choose how long spoiler-sensitive alerts wait before they appear. Internal scoring still updates live.', { className: saveState === 'error' ? 'warning' : 'neutral', label: status })}
        <div class="manage-setting-stack">
          ${renderToggleRow({ key: 'watchExperience.pushEnabled', label: 'Push notifications', hint: 'Allow push notifications when you are away from the active app.', checked: watch.pushEnabled !== false })}
          ${renderToggleRow({ key: 'watchExperience.toastEnabled', label: 'In-app rivalry toasts', hint: 'Show rivalry banners while the app is open.', checked: watch.toastEnabled !== false })}
        </div>
        <div class="manage-delay-group">
          <div class="manage-delay-heading"><span class="eyebrow">Push Notification Delay</span><strong>${escapeHtml(pushLabel)}</strong></div>
          <div class="manage-option-grid">${options.map((option) => renderDelayChoice('push', option, watch.pushDelaySeconds)).join('')}</div>
        </div>
        <div class="manage-delay-group">
          <div class="manage-delay-heading"><span class="eyebrow">In-App Toast Delay</span><strong>${escapeHtml(toastLabel)}</strong></div>
          <div class="manage-option-grid">${options.map((option) => renderDelayChoice('toast', option, watch.toastDelaySeconds)).join('')}</div>
        </div>
        <p class="manage-support-copy">Test pushes and draft reminders are immediate. Scoring/final alerts use these delays.</p>
      </section>
    `;
  }

  function renderTempNotificationTest(state) {
    const { escapeHtml, renderCardHeader, renderHealthItem } = deps();
    const test = state.tempNotificationTest || {};
    const response = test.response ? JSON.stringify(test.response, null, 2) : 'Run a test to see the notify-rivalry-event response here.';
    const badge = test.status === 'ok'
      ? { className: 'success', label: 'ok' }
      : test.status === 'error'
        ? { className: 'warning', label: 'error' }
        : test.status === 'running'
          ? { className: 'neutral', label: 'Running…' }
          : { className: 'neutral', label: 'Temporary' };

    return `
      <section class="panel-card manage-card manage-temp-notification-test-card">
        ${renderCardHeader('TEMP Notification Test — Remove After Testing', 'Direct Edge Function test', 'Verify notify-rivalry-event from the logged-in Supabase session. Remove this card immediately after testing.', badge)}
        <div class="manage-dev-button-row">
          <button class="cr-button primary" type="button" data-manage-temp-notification-test="immediate">Immediate Test Push</button>
          <button class="cr-button secondary" type="button" data-manage-temp-notification-test="delayed">Delayed Spoiler Test</button>
        </div>
        <div class="manage-health-grid">
          ${renderHealthItem('Result', test.status || 'Not run', test.status === 'ok' ? 'good' : test.status === 'error' ? 'bad' : 'neutral')}
          ${renderHealthItem('Routing', test.routingCounts || '—', test.routingCounts ? 'good' : 'neutral')}
          ${renderHealthItem('Push', test.pushCounts || '—', test.pushCounts ? 'good' : 'neutral')}
          ${renderHealthItem('Visible after', test.visibleAfter || '—', test.visibleAfter ? 'neutral' : 'neutral')}
        </div>
        <pre class="manage-json-output" data-manage-temp-notification-response>${escapeHtml(response)}</pre>
      </section>
    `;
  }

  function labelForPermission(permission) {
    if (permission === 'granted') return 'Allowed';
    if (permission === 'denied') return 'Blocked';
    if (permission === 'default') return 'Not asked';
    if (permission === 'unsupported') return 'Unsupported';
    return 'Checking…';
  }

  function isHtmlPreview() {
    return window.location.hostname === 'htmlpreview.github.io';
  }

  function renderNotificationDeviceStatus(state) {
    const { escapeHtml, renderCardHeader, renderHealthItem } = deps();
    const device = state.notificationDevice || {};
    const previewMode = isHtmlPreview();
    const enabled = state.watchExperience?.pushEnabled !== false;
    const hasSwRegistration = Number(device.swDebug?.registrationCount || 0) > 0;
    const canPushHere = !previewMode && hasSwRegistration;
    const badgeLabel = previewMode ? 'Preview' : device.loading ? 'Checking' : device.subscribed && device.permission === 'granted' && enabled ? 'Ready' : 'Review';
    const message = previewMode
      ? 'Push testing is unavailable on htmlpreview.github.io because this preview host cannot use your app service worker. Test push after deploying V2 to GitHub Pages / the installed PWA.'
      : !hasSwRegistration
        ? 'Service worker is not registered in this context yet. Push subscription testing requires the GitHub Pages app or installed PWA.'
        : device.lastActiveError
          ? `Last heartbeat issue: ${escapeHtml(device.lastActiveError)}`
          : 'Active-device suppression uses this heartbeat so an active app session can avoid duplicate push alerts.';

    return `
      <section class="panel-card manage-card manage-notification-device-card">
        ${renderCardHeader('Notification Status', 'Current device', 'Read-only status for this browser/PWA before test push tools are added.', { className: badgeLabel === 'Ready' ? 'success' : 'neutral', label: badgeLabel })}
        <div class="manage-health-grid">
          ${renderHealthItem('Browser support', device.supported ? 'Supported' : 'Unavailable', device.supported ? 'good' : 'neutral')}
          ${renderHealthItem('Permission', previewMode ? 'Preview only' : labelForPermission(device.permission), device.permission === 'granted' ? 'good' : device.permission === 'denied' ? 'bad' : 'neutral')}
          ${renderHealthItem('Push subscription', device.subscribed ? 'Subscribed' : canPushHere ? 'Missing' : 'Unavailable', device.subscribed ? 'good' : 'neutral')}
          ${renderHealthItem('Active heartbeat', device.lastActiveUpdateOk ? 'Active' : canPushHere ? 'Waiting' : 'Unavailable', device.lastActiveUpdateOk ? 'good' : 'neutral')}
        </div>
        <p class="manage-support-copy">${message}</p>
      </section>
    `;
  }

  CR.manageRenderModules.notifications = {
    renderWatchExperience,
    renderTempNotificationTest,
    renderNotificationDeviceStatus
  };
})();
