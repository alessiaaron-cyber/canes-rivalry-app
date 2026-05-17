window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const params = new URLSearchParams(window.location.search || '');

  function setting(name, fallback = '') {
    const queryValue = params.get(name);
    if (queryValue !== null) return queryValue;
    try { return window.localStorage.getItem(`cr.${name}`) || fallback; } catch (_) { return fallback; }
  }

  function setSetting(name, value) {
    try {
      if (value === null || value === undefined || value === '') window.localStorage.removeItem(`cr.${name}`);
      else window.localStorage.setItem(`cr.${name}`, String(value));
    } catch (_) {}
  }

  function isEnabled() { return setting('mockGameDay') === '1'; }
  function currentMode() { return setting('mockMode', 'pregame') || 'pregame'; }
  function isPlayoffs() { return setting('mockPlayoffs') === '1'; }
  function isCarryover() { return setting('mockCarryover') === '1'; }

  const mockUsers = [
    { id: '00000000-0000-4000-8000-000000000001', username: 'player-1', displayName: 'Player 1', display_name: 'Player 1', rivalrySlot: 1, rivalry_slot: 1, profileKey: '00000000-0000-4000-8000-000000000001', profile_key: '00000000-0000-4000-8000-000000000001', scoreKey: '00000000-0000-4000-8000-000000000001', score_key: '00000000-0000-4000-8000-000000000001', themeClass: 'owner-primary', avatarClass: 'avatar-primary', colorHex: '#c8102e', color_hex: '#c8102e', colorLabel: 'Canes Red', color_label: 'Canes Red' },
    { id: '00000000-0000-4000-8000-000000000002', username: 'player-2', displayName: 'Player 2', display_name: 'Player 2', rivalrySlot: 2, rivalry_slot: 2, profileKey: '00000000-0000-4000-8000-000000000002', profile_key: '00000000-0000-4000-8000-000000000002', scoreKey: '00000000-0000-4000-8000-000000000002', score_key: '00000000-0000-4000-8000-000000000002', themeClass: 'owner-secondary', avatarClass: 'avatar-secondary', colorHex: '#111827', color_hex: '#111827', colorLabel: 'Graphite', color_label: 'Graphite' }
  ];

  const roster = [
    { id: 'sebastian-aho', name: 'Sebastian Aho', displayName: 'Aho, Sebastian', detail: 'F' },
    { id: 'seth-jarvis', name: 'Seth Jarvis', displayName: 'Jarvis, Seth', detail: 'F' },
    { id: 'andrei-svechnikov', name: 'Andrei Svechnikov', displayName: 'Svechnikov, Andrei', detail: 'F' },
    { id: 'jaccob-slavin', name: 'Jaccob Slavin', displayName: 'Slavin, Jaccob', detail: 'D' },
    { id: 'shayne-gostisbehere', name: 'Shayne Gostisbehere', displayName: 'Gostisbehere, Shayne', detail: 'D' },
    { id: 'pyotr-kochetkov', name: 'Pyotr Kochetkov', displayName: 'Kochetkov, Pyotr', detail: 'G' }
  ];

  let mockState = null;
  function key(index) { return mockUsers[index].profileKey; }

  function buildState(mode = currentMode()) {
    const pregame = { [key(0)]: [], [key(1)]: [] };
    const liveUsers = {
      [key(0)]: [
        { player: 'Sebastian Aho', goals: 1, assists: 1, firstGoal: true, points: 5, ownerUserId: mockUsers[0].id, profileKey: key(0) },
        { player: 'Jaccob Slavin', goals: 0, assists: 1, firstGoal: false, points: 1, ownerUserId: mockUsers[0].id, profileKey: key(0) }
      ],
      [key(1)]: [
        { player: 'Seth Jarvis', goals: 1, assists: 0, firstGoal: false, points: 2, ownerUserId: mockUsers[1].id, profileKey: key(1) },
        { player: 'Andrei Svechnikov', goals: 0, assists: 2, firstGoal: false, points: 2, ownerUserId: mockUsers[1].id, profileKey: key(1) }
      ]
    };
    return {
      source: 'mock',
      currentGameId: 'mock-game-day',
      mode,
      playoffMode: isPlayoffs() ? 'playoffs' : 'regular',
      carryover: { active: isCarryover() },
      game: { hasGame: true, scheduleText: 'Tonight 7:00 PM', opponent: 'NYR', headline: 'Canes vs NYR' },
      draft: { status: 'open', currentPickNumber: 1, currentPicker: { id: mockUsers[0].id, displayName: mockUsers[0].displayName, profileKey: key(0) }, firstPicker: mockUsers[0].id },
      users: mockUsers,
      pregame,
      live: { scores: { [key(0)]: 6, [key(1)]: 4 }, period: mode === 'pregame' ? 'Tonight 7:00 PM' : '2nd • 08:32', users: liveUsers, feed: [
        { icon: '👑', title: 'Sebastian Aho first Canes goal', detail: 'Player 1 gets the first goal bonus', points: 2, tier: 'heavy' },
        { icon: '🚨', title: 'Seth Jarvis goal', detail: 'Player 2 scores through a picked player', points: 2, tier: 'medium' },
        { icon: '🎯', title: 'Andrei Svechnikov assists', detail: 'Player 2 adds assist points', points: 2, tier: 'light' }
      ] },
      roster
    };
  }

  function setMockOptions(options = {}) {
    setSetting('mockGameDay', options.enabled ? '1' : '');
    setSetting('mockMode', options.mode || 'pregame');
    setSetting('mockPlayoffs', options.playoffs ? '1' : '');
    setSetting('mockCarryover', options.carryover ? '1' : '');
    mockState = null;
  }

  function clearMockOptions() {
    ['mockGameDay', 'mockMode', 'mockPlayoffs', 'mockCarryover'].forEach((name) => setSetting(name, ''));
    mockState = null;
  }

  function syncDraftState() {
    mockState = mockState || buildState(currentMode());
    const total = (mockState.pregame[key(0)] || []).length + (mockState.pregame[key(1)] || []).length;
    const nextPick = total + 1;
    const pickerIndex = total % 2;
    mockState.draft.currentPickNumber = Math.min(nextPick, 5);
    mockState.draft.status = nextPick > 4 ? 'complete' : 'open';
    mockState.draft.currentPicker = nextPick > 4 ? { id: '', displayName: '', profileKey: '' } : { id: mockUsers[pickerIndex].id, displayName: mockUsers[pickerIndex].displayName, profileKey: key(pickerIndex) };
  }

  async function fetchGameDayData() {
    mockState = mockState || buildState(currentMode());
    mockState.mode = currentMode();
    mockState.playoffMode = isPlayoffs() ? 'playoffs' : 'regular';
    mockState.carryover = { active: isCarryover() };
    syncDraftState();
    return JSON.parse(JSON.stringify(mockState));
  }

  async function savePregamePicks(gameId, pregame) {
    mockState = mockState || buildState('pregame');
    mockState.pregame = JSON.parse(JSON.stringify(pregame || {}));
    syncDraftState();
    return { savedRows: [], mock: true };
  }

  async function saveDraftPick(gameId, playerName) {
    mockState = mockState || buildState('pregame');
    if (!playerName) throw new Error('Choose a player first.');
    if (Object.values(mockState.pregame || {}).flat().includes(playerName)) throw new Error('That player has already been picked.');
    syncDraftState();
    const pickNumber = Number(mockState.draft.currentPickNumber || 1);
    if (pickNumber > 4) throw new Error('Draft is already complete.');
    const pickerIndex = (pickNumber - 1) % 2;
    const bucket = key(pickerIndex);
    mockState.pregame[bucket] = mockState.pregame[bucket] || [];
    mockState.pregame[bucket].push(playerName);
    syncDraftState();
    return { savedRow: null, game: mockState.game, mock: true };
  }

  async function undoLastDraftPick() {
    mockState = mockState || buildState('pregame');
    const order = [key(0), key(1), key(0), key(1)];
    for (let i = 3; i >= 0; i -= 1) {
      const bucket = order[i];
      const picks = mockState.pregame[bucket] || [];
      if (picks.length) {
        picks.pop();
        syncDraftState();
        return { clearedRow: null, game: mockState.game, undonePickNumber: i + 1, mock: true };
      }
    }
    throw new Error('There are no draft picks to undo.');
  }

  CR.gameDayMockService = { isEnabled, currentMode, isPlayoffs, isCarryover, setMockOptions, clearMockOptions, fetchGameDayData, savePregamePicks, saveDraftPick, undoLastDraftPick, buildState };
})();
