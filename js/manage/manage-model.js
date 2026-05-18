window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  const DELAY_OPTIONS = [
    { value: 0, label: 'Realtime', note: 'Show spoiler-sensitive alerts immediately.' },
    { value: 30, label: '30 seconds', note: 'Small spoiler buffer for near-live streams.' },
    { value: 60, label: '60 seconds', note: 'Balanced protection without feeling far behind.' },
    { value: 90, label: '90 seconds', note: 'Recommended for most delayed broadcasts.' },
    { value: 120, label: '120 seconds', note: 'Extra protection for laggier streams.' }
  ];

  const PROFILE_COLOR_OPTIONS = [
    { label: 'Canes Red', hex: '#c8102e', family: 'red' },
    { label: 'Graphite', hex: '#111827', family: 'neutral' },
    { label: 'Storm Blue', hex: '#1d4ed8', family: 'blue' },
    { label: 'Ice Navy', hex: '#1e3a8a', family: 'blue' },
    { label: 'Royal Purple', hex: '#6d28d9', family: 'purple' },
    { label: 'Deep Violet', hex: '#581c87', family: 'purple' }
  ];

  const DEFAULT_USERS = [
    { id: 'player-1', username: 'player-1', displayName: 'Player 1', themeClass: 'owner-primary', avatarClass: 'avatar-primary', profileKey: 'player-1', colorHex: '#c8102e', colorLabel: 'Canes Red' },
    { id: 'player-2', username: 'player-2', displayName: 'Player 2', themeClass: 'owner-secondary', avatarClass: 'avatar-secondary', profileKey: 'player-2', colorHex: '#111827', colorLabel: 'Graphite' }
  ];

  const MOCK_ROSTER = [
    { id: 'aho', name: 'Sebastian Aho', position: 'F', active: true },
    { id: 'jarvis', name: 'Seth Jarvis', position: 'F', active: true },
    { id: 'svechnikov', name: 'Andrei Svechnikov', position: 'F', active: true },
    { id: 'slavin', name: 'Jaccob Slavin', position: 'D', active: true },
    { id: 'chatfield', name: 'Jalen Chatfield', position: 'D', active: true }
  ];

  function getManageUsers() {
    const identityUsers = CR.identity?.getUsers?.();
    const source = Array.isArray(identityUsers) && identityUsers.length ? identityUsers : DEFAULT_USERS;
    return source.slice(0, 2).map((user, index) => {
      const fallback = DEFAULT_USERS[index] || DEFAULT_USERS[0];
      const displayName = user.displayName || user.display_name || user.username || fallback.displayName;
      const username = user.username || fallback.username || displayName;
      const profileKey = user.profileKey || user.profile_key || user.id || fallback.profileKey || username;

      return {
        id: user.id || fallback.id || `player-${index + 1}`,
        username,
        displayName,
        label: displayName,
        profileKey,
        profile_key: profileKey,
        themeClass: user.themeClass || user.theme_class || fallback.themeClass || (index === 0 ? 'owner-primary' : 'owner-secondary'),
        avatarClass: user.avatarClass || user.avatar_class || fallback.avatarClass || (index === 0 ? 'avatar-primary' : 'avatar-secondary'),
        colorHex: user.colorHex || user.color_hex || fallback.colorHex || '#111827',
        colorLabel: user.colorLabel || user.color_label || fallback.colorLabel || 'Profile color'
      };
    });
  }

  function buildSchedule(users) {
    const first = users[0]?.displayName || 'Player 1';
    const second = users[1]?.displayName || 'Player 2';
    return [
      { id: 'game-1', date: '2026-03-08', opponent: 'NYR', type: 'Playoffs', firstPicker: first },
      { id: 'game-2', date: '2026-03-10', opponent: 'FLA', type: 'Regular', firstPicker: second }
    ];
  }

  function buildEditOptions(users) {
    return {
      activeSeasonLabel: {
        title: 'Active season',
        hint: 'Choose which season Manage should treat as current.',
        options: ['2025-26', '2026-27', '2027-28']
      },
      scoringProfile: {
        title: 'Scoring profile',
        hint: 'Choose the scoring system used for new rivalry matchups.',
        options: ['Classic', 'Playoff Boost']
      },
      firstPicker: {
        title: 'First picker',
        hint: 'Choose who picks first next game. Picks alternate after that.',
        options: users.map((user) => user.displayName)
      }
    };
  }

  function getNextSeasonLabel(currentLabel) {
    const match = String(currentLabel || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return '2026-27';

    const startYear = Number(match[1]) + 1;
    const endYear = String((startYear + 1) % 100).padStart(2, '0');
    return `${startYear}-${endYear}`;
  }

  function buildWatchExperience() {
    const settings = CR.userSettingsService?.get?.() || CR.userSettingsService?.defaults?.() || {};
    const stream = settings.stream_settings || {};
    const notifications = settings.notification_settings || {};

    return {
      pushDelaySeconds: Number(stream.push_delay_seconds ?? 90),
      toastDelaySeconds: Number(stream.toast_delay_seconds ?? 90),
      pushEnabled: notifications.push_enabled !== false,
      toastEnabled: notifications.toast_enabled !== false,
      delayOptions: DELAY_OPTIONS,
      saveState: 'idle'
    };
  }

  function build() {
    const users = getManageUsers();
    const firstPicker = users[0]?.displayName || 'Player 1';
    const currentSeason = '2025-26';
    const nextSeason = getNextSeasonLabel(currentSeason);
    const watchExperience = buildWatchExperience();

    return {
      activeManageView: 'main',
      activeEditField: null,
      profileColorOpen: false,
      editingScheduleGameId: null,
      editingRosterPlayerId: null,
      watchExperience,
      streamMode: {
        selected: `${watchExperience.toastDelaySeconds}s`,
        options: DELAY_OPTIONS.map((option) => ({
          ...option,
          value: option.value,
          label: option.label
        })),
        delayPush: watchExperience.pushDelaySeconds > 0,
        delayToasts: watchExperience.toastDelaySeconds > 0,
        delayFeed: false
      },
      notifications: {
        pushEnabled: watchExperience.pushEnabled,
        toastsEnabled: watchExperience.toastEnabled
      },
      season: {
        activeSeasonLabel: currentSeason,
        playoffMode: false,
        scoringProfile: 'Classic',
        firstPicker,
        scoringSystems: {
          Classic: {
            firstGoal: 3,
            goal: 2,
            assist: 1
          },
          'Playoff Boost': {
            firstGoal: 5,
            goal: 3,
            assist: 2
          }
        }
      },
      newSeasonDraft: {
        seasonLabel: nextSeason,
        firstPicker
      },
      newSeasonOptions: [nextSeason],
      roster: MOCK_ROSTER,
      schedule: buildSchedule(users),
      rosterDraft: {
        name: '',
        position: 'F'
      },
      scheduleDraft: {
        date: '',
        opponent: '',
        type: 'Regular',
        firstPicker
      },
      appHealth: {
        realtimeStatus: 'Connected',
        syncStatus: 'Healthy',
        notificationStatus: 'Ready',
        pwaStatus: 'Installed',
        lastSyncLabel: '2 minutes ago'
      },
      users,
      profileColorOptions: PROFILE_COLOR_OPTIONS,
      editOptions: buildEditOptions(users)
    };
  }

  window.CR.manageModel = { build, PROFILE_COLOR_OPTIONS, DELAY_OPTIONS };
})();
