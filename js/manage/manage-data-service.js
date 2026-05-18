window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  function formatGameDate(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function normalizePlayer(row) {
    return {
      id: String(row.id),
      dbId: row.id,
      name: row.player_name || 'Unnamed player',
      position: row.position || 'F',
      active: row.is_active !== false,
      updatedAt: row.updated_at || null
    };
  }

  function normalizeGame(row, profiles = []) {
    const picker = profiles.find((profile) => String(profile.id) === String(row.first_picker_user_id));
    return {
      id: String(row.id),
      dbId: row.id,
      seasonId: row.season_id,
      gameNumber: row.game_number,
      date: formatGameDate(row.game_date),
      opponent: row.opponent || 'TBD',
      homeAway: row.home_away || '',
      type: row.game_type || 'Regular Season',
      firstPicker: picker?.display_name || row.first_picker || 'TBD',
      firstPickerUserId: row.first_picker_user_id || null,
      status: row.status || 'Scheduled',
      draftStatus: row.draft_status || '',
      nhlGameId: row.nhl_game_id || '',
      gameStartTime: row.game_start_time || null,
      nhlGameState: row.nhl_game_state || '',
      lastSyncedAt: row.last_synced_at || null,
      locked: String(row.status || '').toLowerCase() === 'final' || String(row.draft_status || '').toLowerCase() === 'complete'
    };
  }

  function normalizeSeason(row, profiles = []) {
    if (!row) return null;
    const rules = row.scoring_rules || {};
    const regular = rules.regular || {};
    const playoffs = rules.playoffs || {};
    const firstPicker = profiles[0]?.display_name || profiles[0]?.username || 'Player 1';

    return {
      id: row.id,
      seasonKey: row.season_key,
      activeSeasonLabel: row.display_name || row.season_key || 'Active season',
      playoffMode: false,
      scoringProfile: 'Regular',
      firstPicker,
      regularScoringLocked: row.regular_scoring_locked === true,
      playoffScoringLocked: row.playoff_scoring_locked === true,
      scoringOverrideNote: row.scoring_override_note || '',
      scoringSystems: {
        Regular: {
          firstGoal: Number(regular.first_goal_bonus ?? 1),
          goal: Number(regular.goal ?? 2),
          assist: Number(regular.assist ?? 1)
        },
        Playoffs: {
          firstGoal: Number(playoffs.first_goal_bonus ?? 1),
          goal: Number(playoffs.goal ?? 2),
          assist: Number(playoffs.assist ?? 1)
        }
      }
    };
  }

  function latestSyncLabel(games = []) {
    const latest = games
      .map((game) => game.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    if (!latest) return 'Never';
    const date = new Date(latest);
    if (Number.isNaN(date.getTime())) return 'Synced';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  async function load() {
    const db = await CR.getSupabase();

    const [playersResult, seasonsResult] = await Promise.all([
      db.from('players').select('id, player_name, position, is_active, updated_at').order('is_active', { ascending: false }).order('player_name', { ascending: true }),
      db.from('seasons').select('id, season_key, display_name, is_active, scoring_rules, regular_scoring_locked, playoff_scoring_locked, regular_scoring_locked_at, playoff_scoring_locked_at, scoring_override_note').order('is_active', { ascending: false }).order('id', { ascending: false })
    ]);

    if (playersResult.error) throw playersResult.error;
    if (seasonsResult.error) throw seasonsResult.error;

    const activeSeason = (seasonsResult.data || []).find((season) => season.is_active) || (seasonsResult.data || [])[0] || null;
    let games = [];

    if (activeSeason?.id) {
      const gamesResult = await db
        .from('games')
        .select('id, season_id, game_number, game_date, opponent, home_away, game_type, first_picker, first_picker_user_id, status, draft_status, nhl_game_id, game_start_time, nhl_game_state, last_synced_at')
        .eq('season_id', activeSeason.id)
        .order('game_date', { ascending: false, nullsFirst: true })
        .order('game_number', { ascending: false });

      if (gamesResult.error) throw gamesResult.error;
      games = gamesResult.data || [];
    }

    const profiles = CR.currentProfiles || [];
    const normalizedGames = games.map((game) => normalizeGame(game, profiles));

    return {
      players: (playersResult.data || []).map(normalizePlayer),
      seasons: seasonsResult.data || [],
      activeSeason: normalizeSeason(activeSeason, profiles),
      games: normalizedGames,
      appHealth: {
        realtimeStatus: CR.realtimeService?.isConnected?.() ? 'Connected' : 'Connected',
        syncStatus: 'Live data',
        notificationStatus: 'Ready',
        pwaStatus: window.matchMedia?.('(display-mode: standalone)')?.matches ? 'Installed' : 'Browser',
        lastSyncLabel: latestSyncLabel(normalizedGames)
      }
    };
  }

  function mergeIntoState(state, live) {
    if (!state || !live) return state;
    if (Array.isArray(live.players) && live.players.length) state.roster = live.players;
    if (Array.isArray(live.games)) state.schedule = live.games;
    if (live.activeSeason) {
      state.season = {
        ...state.season,
        ...live.activeSeason
      };
    }
    if (live.appHealth) {
      state.appHealth = {
        ...state.appHealth,
        ...live.appHealth
      };
    }
    state.manageDataLoaded = true;
    state.manageDataError = '';
    return state;
  }

  CR.manageDataService = { load, mergeIntoState };
})();