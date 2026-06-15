import { createClient } from "npm:@supabase/supabase-js@2";

const NHL_BASE = "https://api-web.nhle.com/v1";
const TEAM = "CAR";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const authDb = createClient(SUPABASE_URL, ANON_KEY);
const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ActiveSeason = {
  id: number;
  season_key: string;
  first_picker_user_id: string | null;
};

type RivalryProfile = {
  id: string;
  display_name: string | null;
  rivalry_slot: number | null;
};

type ImportedGame = {
  nhl_game_id: string;
  game_date: string;
  game_start_time: string | null;
  opponent: string;
  home_away: string;
  game_type: string;
  nhl_game_state: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return String(value || "").trim();
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

  if (!data) return { ok: false, error: "Forbidden", status: 403 };

  return { ok: true, email: userEmail };
}

async function getActiveSeason(): Promise<ActiveSeason> {
  const { data, error } = await serviceDb
    .from("seasons")
    .select("id, season_key, first_picker_user_id")
    .eq("is_active", true)
    .single();

  if (error) throw error;
  if (!data?.id || !data?.season_key) throw new Error("No active season found.");

  return data as ActiveSeason;
}

function nhlSeasonKey(seasonKey: string) {
  const season = String(seasonKey).replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(season)) throw new Error(`Invalid active season_key: ${seasonKey}`);
  return season;
}

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function gameKey(game: ImportedGame) {
  return `${game.game_date}|${game.opponent}|${game.home_away}`;
}

async function loadProfiles() {
  const { data, error } = await serviceDb
    .from("user_profiles")
    .select("id, display_name, rivalry_slot")
    .eq("is_active", true)
    .order("rivalry_slot", { ascending: true });

  if (error) throw error;
  return (data || []) as RivalryProfile[];
}

function profileById(profiles: RivalryProfile[], id: string | null | undefined) {
  return profiles.find((profile) => String(profile.id || "") === String(id || "")) || null;
}

function otherProfile(profiles: RivalryProfile[], profile: RivalryProfile | null | undefined) {
  const selectedId = String(profile?.id || "");
  return profiles.find((candidate) => String(candidate.id || "") !== selectedId) || profile || profiles[0] || null;
}

function pickerPayload(profile: RivalryProfile | null | undefined) {
  return {
    first_picker_user_id: profile?.id || null,
    current_pick_user_id: profile?.id || null,
  };
}

function latestScheduleGame(games: any[]) {
  return games
    .slice()
    .filter((game) => String(game.status || "").toLowerCase() !== "hidden")
    .sort((a, b) => Number(b.game_number || 0) - Number(a.game_number || 0))[0] || null;
}

async function loadCarryForwardGameIds(gameIds: number[]) {
  if (!gameIds.length) return new Set<number>();

  const { data, error } = await serviceDb
    .from("picks")
    .select("game_id")
    .in("game_id", gameIds)
    .eq("is_carry_forward", true);

  if (error) throw error;

  return new Set((data || []).map((row: any) => Number(row.game_id)).filter(Boolean));
}

function nextFirstPicker({
  activeSeason,
  profiles,
  existingGames,
  carryForwardGameIds,
}: {
  activeSeason: ActiveSeason;
  profiles: RivalryProfile[];
  existingGames: any[];
  carryForwardGameIds: Set<number>;
}) {
  const seasonStarter = profileById(profiles, activeSeason.first_picker_user_id) || profiles[0] || null;
  const previousGame = latestScheduleGame(existingGames);

  if (!previousGame) return pickerPayload(seasonStarter);

  const previousPicker = profileById(profiles, previousGame.first_picker_user_id) || seasonStarter;
  const usedCarryForward = carryForwardGameIds.has(Number(previousGame.id));
  const selected = usedCarryForward ? previousPicker : otherProfile(profiles, previousPicker);

  return pickerPayload(selected);
}

async function nextGameNumber(seasonId: number) {
  const { data, error } = await serviceDb
    .from("games")
    .select("game_number")
    .eq("season_id", seasonId)
    .order("game_number", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Number(data?.[0]?.game_number || 0) + 1;
}

async function loadExistingGames(seasonId: number) {
  const { data, error } = await serviceDb
    .from("games")
    .select("id, season_id, game_number, game_date, opponent, home_away, game_type, status, draft_status, nhl_game_id, first_picker_user_id")
    .eq("season_id", seasonId);

  if (error) throw error;
  return data || [];
}

function findExisting(existingGames: any[], imported: ImportedGame) {
  const byNhlId = existingGames.find((g) => cleanText(g.nhl_game_id) && cleanText(g.nhl_game_id) === imported.nhl_game_id);
  if (byNhlId) return byNhlId;

  const key = gameKey(imported);
  return existingGames.find((g) => {
    const existingKey = `${String(g.game_date || "").slice(0, 10)}|${cleanText(g.opponent).toUpperCase()}|${cleanText(g.home_away)}`;
    return existingKey === key;
  }) || null;
}

function isProtectedFinal(game: any) {
  return String(game?.status || "").toLowerCase() === "final" || String(game?.draft_status || "").toLowerCase() === "complete";
}

async function fetchNhlGames(season: string, from: string, to: string): Promise<ImportedGame[]> {
  const url = `${NHL_BASE}/club-schedule-season/${TEAM}/${season}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Canes-Rivalry-App/1.0",
    },
  });

  if (!res.ok) throw new Error(`NHL API failed: ${res.status}`);

  const data = await res.json();

  return (data.games || [])
    .filter((g: any) => {
      const d = String(g.gameDate || "").slice(0, 10);
      return d >= from && d <= to;
    })
    .map((g: any) => {
      const isHome = g.homeTeam?.abbrev === TEAM;
      const opponent = isHome ? g.awayTeam?.abbrev : g.homeTeam?.abbrev;
      const gameType = Number(g.gameType) === 3 || String(g.gameType || "").toLowerCase().includes("playoff") ? "Playoffs" : "Regular Season";

      return {
        nhl_game_id: String(g.id),
        game_date: String(g.gameDate || "").slice(0, 10),
        game_start_time: g.startTimeUTC || null,
        opponent: cleanText(opponent).toUpperCase(),
        home_away: isHome ? "Home" : "Away",
        game_type: gameType,
        nhl_game_state: g.gameState || "PRE",
      };
    })
    .filter((game: ImportedGame) => game.nhl_game_id && game.game_date && game.opponent);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const allowed = await requireAllowedUser(user);
  if (!allowed.ok) return json({ ok: false, error: allowed.error }, allowed.status as number);

  try {
    const today = new Date();
    const from = formatDate(addDays(today, -1));
    const to = formatDate(addDays(today, 60));

    const activeSeason = await getActiveSeason();
    const season = nhlSeasonKey(activeSeason.season_key);
    const profiles = await loadProfiles();
    const importedGames = await fetchNhlGames(season, from, to);
    const existingGames = await loadExistingGames(activeSeason.id);
    const carryForwardGameIds = await loadCarryForwardGameIds(existingGames.map((game: any) => Number(game.id)).filter(Boolean));

    let nextNumber = await nextGameNumber(activeSeason.id);
    let inserted = 0;
    let updated = 0;
    let skippedFinal = 0;
    let unchanged = 0;
    const importedRows: any[] = [];

    for (const imported of importedGames) {
      const existing = findExisting(existingGames, imported);

      if (existing && isProtectedFinal(existing)) {
        skippedFinal += 1;
        importedRows.push({ ...imported, action: "skipped-final", id: existing.id, game_number: existing.game_number });
        continue;
      }

      if (existing) {
        const patch = {
          nhl_game_id: imported.nhl_game_id,
          game_date: imported.game_date,
          game_start_time: imported.game_start_time,
          opponent: imported.opponent,
          home_away: imported.home_away,
          game_type: imported.game_type,
          nhl_game_state: imported.nhl_game_state,
          status: String(existing.status || "").toLowerCase() === "hidden" ? "Scheduled" : existing.status || "Scheduled",
          last_synced_at: new Date().toISOString(),
        };

        const { data, error } = await serviceDb
          .from("games")
          .update(patch)
          .eq("id", existing.id)
          .select("id, game_number")
          .single();

        if (error) throw error;
        updated += 1;
        importedRows.push({ ...imported, action: "updated", id: data.id, game_number: data.game_number });
        continue;
      }

      const picker = nextFirstPicker({ activeSeason, profiles, existingGames, carryForwardGameIds });
      const insertRow = {
        season_id: activeSeason.id,
        game_number: nextNumber,
        game_date: imported.game_date,
        game_start_time: imported.game_start_time,
        opponent: imported.opponent,
        home_away: imported.home_away,
        game_type: imported.game_type,
        nhl_game_id: imported.nhl_game_id,
        nhl_game_state: imported.nhl_game_state,
        status: "Scheduled",
        draft_status: "open",
        current_pick_number: 1,
        ...picker,
      };

      const { data, error } = await serviceDb
        .from("games")
        .insert(insertRow)
        .select("id, game_number")
        .single();

      if (error) {
        if ((error as any).code === "23505") {
          unchanged += 1;
          continue;
        }
        throw error;
      }

      inserted += 1;
      importedRows.push({ ...imported, action: "inserted", id: data.id, game_number: data.game_number });
      existingGames.push({ ...insertRow, id: data.id });
      nextNumber += 1;
    }

    return json({
      ok: true,
      authorizedVia: "allowed_user",
      authorizedEmail: allowed.email,
      season,
      season_id: activeSeason.id,
      from,
      to,
      count: importedGames.length,
      imported: inserted,
      updated,
      skippedFinal,
      unchanged,
      games: importedRows,
    });
  } catch (err) {
    console.error("import-nhl-schedule failed:", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
