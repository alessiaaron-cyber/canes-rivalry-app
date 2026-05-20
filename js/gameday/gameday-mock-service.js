window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const params = new URLSearchParams(window.location.search || '');
  const STORAGE_KEY = 'cr.mockGameDayState';

  function setting(name, fallback = '') { const queryValue = params.get(name); if (queryValue !== null) return queryValue; try { return window.localStorage.getItem(`cr.${name}`) || fallback; } catch (_) { return fallback; } }
  function setSetting(name, value) { try { if (value === null || value === undefined || value === '') window.localStorage.removeItem(`cr.${name}`); else window.localStorage.setItem(`cr.${name}`, String(value)); } catch (_) {} }
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
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function saveState() { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockState)); } catch (_) {} }
  function loadState() { try { const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'); return parsed && parsed.source === 'mock' ? parsed : null; } catch (_) { return null; } }
  function draftOrder() { return [key(0), key(1), key(0), key(1)]; }
  function normalizePregameBuckets(pregame = {}) { const normalized = { [key(0)]: [], [key(1)]: [] }; [key(0), key(1)].forEach((bucketKey) => { normalized[bucketKey] = Array.from(new Set((pregame[bucketKey] || []).filter(Boolean))).slice(0, 2); }); return normalized; }
  function tomorrowAt(hour = 19, minute = 0) { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(hour, minute, 0, 0); return date; }
  function scheduleTextFor(date) { return CR.gameDayDataService?.formatScheduleText ? CR.gameDayDataService.formatScheduleText({ game_start_time: date.toISOString() }) : 'Tomorrow 7:00 PM'; }
  function compactInfoFor(opponent, date) { return `${opponent} • ${scheduleTextFor(date)}`; }

  function buildState(mode = currentMode()) {
    const pregame = { [key(0)]: [], [key(1)]: [] };
    const liveUsers = { [key(0)]: [ { player: 'Sebastian Aho', goals: 1, assists: 1, firstGoal: true, points: 5, ownerUserId: mockUsers[0].id, profileKey: key(0) }, { player: 'Jaccob Slavin', goals: 0, assists: 1, firstGoal: false, points: 1, ownerUserId: mockUsers[0].id, profileKey: key(0) } ], [key(1)]: [ { player: 'Seth Jarvis', goals: 1, assists: 0, firstGoal: false, points: 2, ownerUserId: mockUsers[1].id, profileKey: key(1) }, { player: 'Andrei Svechnikov', goals: 0, assists: 2, firstGoal: false, points: 2, ownerUserId: mockUsers[1].id, profileKey: key(1) } ] };
    const mockGameStart = mode === 'pregame' ? tomorrowAt(19, 0).toISOString() : new Date().toISOString();
    const scheduleText = CR.gameDayDataService?.formatScheduleText ? CR.gameDayDataService.formatScheduleText({ game_start_time: mockGameStart }) : 'Tomorrow 7:00 PM';
    const nextGameDate = tomorrowAt(19, 0);
    const nextGame = { hasGame: true, opponent: 'MTL', scheduleText: scheduleTextFor(nextGameDate), compactInfo: compactInfoFor('MTL', nextGameDate), headline: 'Canes vs MTL', game_start_time: nextGameDate.toISOString() };
    return { source: 'mock', currentGameId: 'mock-game-day', mode, playoffMode: isPlayoffs() ? 'playoffs' : 'regular', carryover: { active: isCarryover() }, game: { hasGame: true, game_start_time: mockGameStart, scheduleText, compactInfo: `NYR • ${scheduleText}`, opponent: 'NYR', headline: 'Canes vs NYR' }, nextGame, draft: { status: 'open', currentPickNumber: 1, currentPicker: { id: mockUsers[0].id, displayName: mockUsers[0].displayName, profileKey: key(0) }, firstPicker: mockUsers[0].id }, users: mockUsers, pregame, live: { scores: { [key(0)]: 6, [key(1)]: 4 }, period: mode === 'pregame' ? `NYR • ${scheduleText}` : '2nd • 08:32', users: liveUsers, feed: [ { icon: '👑', title: 'Sebastian Aho first Canes goal', detail: 'Player 1 gets the first goal bonus', points: 2, tier: 'heavy' }, { icon: '🚨', title: 'Seth Jarvis goal', detail: 'Player 2 scores through a picked player', points: 2, tier: 'medium' }, { icon: '🎯', title: 'Andrei Svechnikov assists', detail: 'Player 2 adds assist points', points: 2, tier: 'light' } ] }, roster };
  }

  function ensureState() { mockState = mockState || loadState() || buildState(currentMode()); mockState.users = mockUsers; mockState.roster = roster; mockState.pregame = normalizePregameBuckets(mockState.pregame || {}); mockState.nextGame = mockState.nextGame || buildState(currentMode()).nextGame; return mockState; }
  function setMockOptions(options = {}) { setSetting('mockGameDay', options.enabled ? '1' : ''); setSetting('mockMode', options.mode || currentMode() || 'pregame'); setSetting('mockPlayoffs', options.playoffs ? '1' : ''); setSetting('mockCarryover', options.carryover ? '1' : ''); mockState = buildState(currentMode()); saveState(); }
  function clearMockOptions() { ['mockGameDay', 'mockMode', 'mockPlayoffs', 'mockCarryover'].forEach((name) => setSetting(name, '')); try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {} mockState = null; }
  function resetDraft() { mockState = buildState(currentMode()); saveState(); }
  function pickCountByDraftOrder() { ensureState(); const buckets = mockState.pregame || {}; const order = draftOrder(); let count = 0; for (let i = 0; i < order.length; i += 1) { const bucket = buckets[order[i]] || []; const occurrence = order.slice(0, i + 1).filter((ownerKey) => ownerKey === order[i]).length; if (bucket[occurrence - 1]) count += 1; else break; } return count; }
  function syncDraftState() { ensureState(); const total = pickCountByDraftOrder(); const nextPick = total + 1; const order = draftOrder(); const nextOwnerKey = order[total] || ''; const picker = mockUsers.find((user) => user.profileKey === nextOwnerKey); mockState.draft.currentPickNumber = Math.min(nextPick, 5); mockState.draft.status = nextPick > 4 ? 'complete' : 'open'; mockState.draft.currentPicker = nextPick > 4 || !picker ? { id: '', displayName: '', profileKey: '' } : { id: picker.id, displayName: picker.displayName, profileKey: picker.profileKey }; saveState(); }
  async function fetchGameDayData() { ensureState(); mockState.mode = currentMode(); mockState.playoffMode = isPlayoffs() ? 'playoffs' : 'regular'; mockState.carryover = { active: isCarryover() }; mockState.nextGame = buildState(currentMode()).nextGame; syncDraftState(); return clone(mockState); }
  async function savePregamePicks(gameId, pregame) { ensureState(); mockState.pregame = normalizePregameBuckets(pregame || {}); syncDraftState(); return { savedRows: [], mock: true }; }
  async function saveDraftPick(gameId, playerName) { ensureState(); if (!playerName) throw new Error('Choose a player first.'); if ([key(0), key(1)].flatMap((bucketKey) => mockState.pregame[bucketKey] || []).includes(playerName)) throw new Error('That player has already been picked.'); syncDraftState(); const pickNumber = Number(mockState.draft.currentPickNumber || 1); if (pickNumber > 4) throw new Error('Draft is already complete.'); const bucket = draftOrder()[pickNumber - 1]; mockState.pregame[bucket].push(playerName); syncDraftState(); return { savedRow: null, game: mockState.game, mock: true }; }
  async function undoLastDraftPick() { ensureState(); const total = pickCountByDraftOrder(); if (!total) throw new Error('There are no draft picks to undo.'); const order = draftOrder(); const bucket = order[total - 1]; if (!(mockState.pregame[bucket] || []).length) throw new Error('There are no draft picks to undo.'); mockState.pregame[bucket].pop(); syncDraftState(); return { clearedRow: null, game: mockState.game, undonePickNumber: total, mock: true }; }

  CR.gameDayMockService = { isEnabled, currentMode, isPlayoffs, isCarryover, setMockOptions, clearMockOptions, resetDraft, fetchGameDayData, savePregamePicks, saveDraftPick, undoLastDraftPick, buildState };
})();