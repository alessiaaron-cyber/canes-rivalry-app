import { createClient } from "npm:@supabase/supabase-js@2";

const NHL_BASE = "https://api-web.nhle.com/v1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const authDb = createClient(SUPABASE_URL, ANON_KEY);
const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type SyncRequest = {
  nhl_game_id?: string | number | null;
  game_date?: string | null;
  opponent?: string | null;
};

type PlayerStat = {
  playerName: string;
  goals: number;
  assists: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) return null;

  const { data, error } = await authDb.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user;
}

async function requireAllowedUser(user: any) {
  const userEmail = String(user?.email || "").toLowerCase().trim();
  if (!userEmail) return { ok: false, error: "Missing user email", status: 401 };

  const { data, error } = await serviceDb
    .from("allowed_users")
    .select("email")
    .ilike("email", userEmail)
    .maybeSingle();

  if (error) {
    console.error("allowed_users lookup failed:", error);
    return { ok: false, error: "Authorization check failed", status: 500 };
  }

  if (!data) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  return { ok: true, email: userEmail };
}

function normalizeName(name: unknown): string {
  return String(name || "").replace(/\s+/g, " ").trim();
}

function fullNameFromObj(obj: any): string {
  if (!obj) return "";
  if (typeof obj === "string") return normalizeName(obj);

  const first = obj.firstName?.default || obj.firstName || obj.first || "";
  const last = obj.lastName?.default || obj.lastName || obj.last || "";

  return normalizeName(
    obj.name?.default ||
      obj.name ||
      obj.fullName?.default ||
      obj.fullName ||
      obj.playerName?.default ||
      obj.playerName ||
      `${first} ${last}`,
  );
}

function toDateOnly(dateStr: string): string {
  return String(dateStr || "").slice(0, 10);
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Canes-Rivalry-App/1.0",
    },
  });

  if (!res.ok) throw new Error(`NHL request failed ${res.status}`);
  return await res.json();
}

async function resolveNhlGameId(input: SyncRequest): Promise<number | null> {
  if (input.nhl_game_id) {
    const n = Number(input.nhl_game_id);
    return Number.isFinite(n) ? n : null;
  }

  if (!input.game_date) return null;

  const date = toDateOnly(input.game_date);
  const schedule = await fetchJson(`${NHL_BASE}/schedule/${date}`);
  const weeks = Array.isArray(schedule.gameWeek) ? schedule.gameWeek : [];
  const games = weeks.flatMap((w: any) => Array.isArray(w.games) ? w.games : []);

  const opponent = String(input.opponent || "").trim().toUpperCase();

  const canesGames = games.filter((g: any) =>
    g?.homeTeam?.abbrev === "CAR" || g?.awayTeam?.abbrev === "CAR"
  );

  if (!canesGames.length) return null;

  if (opponent) {
    const matched = canesGames.find((g: any) =>
      g?.homeTeam?.abbrev === opponent ||
      g?.awayTeam?.abbrev === opponent ||
      String(g?.homeTeam?.placeName?.default || "").toUpperCase().includes(opponent) ||
      String(g?.awayTeam?.placeName?.default || "").toUpperCase().includes(opponent) ||
      String(g?.homeTeam?.commonName?.default || "").toUpperCase().includes(opponent) ||
      String(g?.awayTeam?.commonName?.default || "").toUpperCase().includes(opponent)
    );

    if (matched?.id) return Number(matched.id);
  }

  return Number(canesGames[0]?.id || null);
}

function addPlayerToMap(map: Map<number, string>, obj: any) {
  if (!obj || typeof obj !== "object") return;

  const id = obj.playerId ?? obj.playerID ?? obj.id;
  const name = fullNameFromObj(obj);

  if (Number.isFinite(Number(id)) && name) {
    map.set(Number(id), name);
  }
}

function collectPlayersDeep(map: Map<number, string>, obj: any, depth = 0) {
  if (!obj || depth > 7) return;

  if (Array.isArray(obj)) {
    for (const item of obj) collectPlayersDeep(map, item, depth + 1);
    return;
  }

  if (typeof obj !== "object") return;

  addPlayerToMap(map, obj);

  for (const value of Object.values(obj)) {
    collectPlayersDeep(map, value, depth + 1);
  }
}

function buildPlayerMap(playByPlay: any, boxscore: any) {
  const map = new Map<number, string>();
  collectPlayersDeep(map, playByPlay);
  collectPlayersDeep(map, boxscore);
  return map;
}

function getPlayerNameById(map: Map<number, string>, id: unknown): string {
  const n = Number(id);
  if (!Number.isFinite(n)) return "";
  return map.get(n) || "";
}

function parseScoring(playByPlay: any, boxscore: any) {
  const playerMap = buildPlayerMap(playByPlay, boxscore);
  const plays = Array.isArray(playByPlay.plays) ? playByPlay.plays : [];

  const stats = new Map<string, PlayerStat>();
  let firstCanesGoalScorer = "";

  function ensure(name: string) {
    const clean = normalizeName(name);
    if (!clean) return null;
    if (!stats.has(clean)) stats.set(clean, { playerName: clean, goals: 0, assists: 0 });
    return stats.get(clean)!;
  }

  function addGoal(name: string) {
    const row = ensure(name);
    if (row) row.goals += 1;
  }

  function addAssist(name: string) {
    const row = ensure(name);
    if (row) row.assists += 1;
  }

  const goalPlays = plays.filter((p: any) =>
    p?.periodDescriptor?.periodType !== "SO" &&
    (
      String(p?.typeDescKey || "").toLowerCase() === "goal" ||
      Number(p?.typeCode) === 505
    )
  );

  const allGoalsDebug: any[] = [];

  for (const play of goalPlays) {
    const details = play.details || {};

    const scoringTeam =
      details.eventOwnerTeamId === playByPlay.homeTeam?.id
        ? playByPlay.homeTeam?.abbrev
        : details.eventOwnerTeamId === playByPlay.awayTeam?.id
          ? playByPlay.awayTeam?.abbrev
          : details.teamAbbrev ||
            details.eventOwnerTeamAbbrev ||
            "";

    const scorer =
      getPlayerNameById(playerMap, details.scoringPlayerId) ||
      getPlayerNameById(playerMap, details.shootingPlayerId) ||
      fullNameFromObj(details.scoringPlayer) ||
      fullNameFromObj(details.scoringPlayerName) ||
      fullNameFromObj(details.shooterPlayer) ||
      fullNameFromObj(details.shooterPlayerName);

    allGoalsDebug.push({
      team: scoringTeam,
      scorer,
      period: play.periodDescriptor?.number || null,
      time: play.timeInPeriod || null,
    });

    if (scoringTeam !== "CAR") continue;

    if (scorer) {
      if (!firstCanesGoalScorer) firstCanesGoalScorer = scorer;
      addGoal(scorer);
    }

    const assistNames = [
      getPlayerNameById(playerMap, details.assist1PlayerId),
      getPlayerNameById(playerMap, details.assist2PlayerId),
      fullNameFromObj(details.assist1Player),
      fullNameFromObj(details.assist1PlayerName),
      fullNameFromObj(details.assist2Player),
      fullNameFromObj(details.assist2PlayerName),
    ].filter(Boolean);

    if (Array.isArray(details.assists)) {
      for (const assist of details.assists) {
        const byId = getPlayerNameById(playerMap, assist.playerId ?? assist.id);
        const byName = fullNameFromObj(assist);
        if (byId) assistNames.push(byId);
        else if (byName) assistNames.push(byName);
      }
    }

    [...new Set(assistNames)].forEach(addAssist);
  }

  return {
    firstCanesGoalScorer,
    playerStats: Array.from(stats.values()).sort((a, b) =>
      a.playerName.localeCompare(b.playerName)
    ),
    goalCount: goalPlays.length,
    canesScoringPlayers: stats.size,
    allGoalsDebug,
    playerMapSize: playerMap.size,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const user = await getUser(req);
  if (!user) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const allowed = await requireAllowedUser(user);
  if (!allowed.ok) {
    return json({ ok: false, error: allowed.error }, allowed.status as number);
  }

  try {
    const input = await req.json() as SyncRequest;
    const nhlGameId = await resolveNhlGameId(input);

    if (!nhlGameId) {
      return json({
        ok: false,
        error: "Could not resolve NHL game id. Add nhl_game_id manually or check game date/opponent.",
      }, 400);
    }

    const [playByPlay, boxscore] = await Promise.all([
      fetchJson(`${NHL_BASE}/gamecenter/${nhlGameId}/play-by-play`),
      fetchJson(`${NHL_BASE}/gamecenter/${nhlGameId}/boxscore`),
    ]);

    const parsed = parseScoring(playByPlay, boxscore);

    return json({
      ok: true,
      authorizedVia: "allowed_user",
      authorizedEmail: allowed.email,
      nhl_game_id: String(nhlGameId),
      gameState: playByPlay.gameState || null,
      gameStartTime:
        playByPlay.startTimeUTC ||
        playByPlay.gameDate ||
        boxscore.startTimeUTC ||
        null,
      awayTeam: playByPlay.awayTeam?.abbrev || null,
      homeTeam: playByPlay.homeTeam?.abbrev || null,

      firstGoalScorer: parsed.firstCanesGoalScorer,
      firstCanesGoalScorer: parsed.firstCanesGoalScorer,

      playerStats: parsed.playerStats,
      goalCount: parsed.goalCount,
      canesScoringPlayers: parsed.canesScoringPlayers,
      debug: {
        playerMapSize: parsed.playerMapSize,
        allGoals: parsed.allGoalsDebug,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});