// =========================
// AUTO SYNC CURRENT GAME
// GAME-DAY SAFE VERSION
// =========================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const NHL_BASE = "https://api-web.nhle.com/v1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);


const ALLOWED_NHL_STATES = ["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"];
const FORCE_SYNC_STATES = ["LIVE", "CRIT", "FINAL", "OFF"];

const PRE_GAME_WINDOW_MS = 30 * 60 * 1000;
const POST_GAME_WINDOW_MS = 4.5 * 60 * 60 * 1000;
const PICK_REMINDER_WINDOW_MS = 75 * 60 * 1000;
const ACTIVE_DEVICE_SUPPRESS_MS = 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function toTime(value: any) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseDateOnlyAsNoonEastern(dateOnly: any) {
  if (!dateOnly) return null;
  const raw = String(dateOnly).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  // Noon UTC fallback keeps date-only games sortable without pretending we know puck drop.
  const t = new Date(`${raw}T12:00:00Z`).getTime();
  return Number.isFinite(t) ? t : null;
}

function gameStartMs(game: any) {
  return toTime(game?.game_start_time) ?? parseDateOnlyAsNoonEastern(game?.game_date);
}

function isInsideGameWindow(game: any) {
  const start = gameStartMs(game);
  if (!start) return false;

  const now = Date.now();
  return now >= start - PRE_GAME_WINDOW_MS && now <= start + POST_GAME_WINDOW_MS;
}

function isInsidePickReminderWindow(game: any) {
  const start = gameStartMs(game);
  if (!start) return false;

  const now = Date.now();
  return now >= start - PICK_REMINDER_WINDOW_MS && now < start;
}

function minutesUntilStart(game: any) {
  const start = gameStartMs(game);
  if (!start) return null;

  return Math.max(0, Math.round((start - Date.now()) / 60000));
}

function formatReminderBody(game: any) {
  const mins = minutesUntilStart(game);

  if (mins === null) return "Puck drop is coming up. Get your picks in.";
  if (mins >= 65) return "About 1 hour to puck drop. Get your picks in.";
  if (mins >= 45) return "Less than 1 hour to puck drop. Get your picks in.";
  if (mins >= 20) return `${mins} minutes to puck drop. Get your picks in.`;
  return "Puck drop is close. Get your picks in.";
}

// =========================
// NAME MATCHING
// Mirrors manual sync-style tolerant matching.
// =========================

function normalizeName(name: any) {
  return String(name || "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameParts(name: any) {
  return normalizeName(name).split(" ").filter(Boolean);
}

function sortedNameKey(name: any) {
  return [...nameParts(name)].sort().join(" ");
}

function lastName(name: any) {
  const parts = nameParts(name);
  return parts.length ? parts[parts.length - 1] : "";
}

function nameMatches(a: any, b: any) {
  const aNormal = normalizeName(a);
  const bNormal = normalizeName(b);

  if (!aNormal || !bNormal) return false;
  if (aNormal === bNormal) return true;
  if (sortedNameKey(aNormal) === sortedNameKey(bNormal)) return true;

  const aLast = lastName(aNormal);
  const bLast = lastName(bNormal);

  return !!aLast && !!bLast && aLast === bLast;
}

function resolveRosterName(raw: string, roster: string[]) {
  if (!raw) return "";
  return roster.find((r) => nameMatches(r, raw)) || raw;
}

function shortName(name: any) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : String(name || "").trim();
}

// =========================
// NHL PARSING
// =========================

function buildPlayerMap(pbp: any, box: any) {
  const map = new Map<number, string>();

  function walk(obj: any) {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    if (typeof obj !== "object") return;

    const id = obj.playerId ?? obj.id;
    const name =
      obj.fullName?.default ||
      obj.fullName ||
      `${obj.firstName?.default || ""} ${obj.lastName?.default || ""}`.trim();

    if (id && name) map.set(Number(id), name);

    Object.values(obj).forEach(walk);
  }

  walk(pbp);
  walk(box);

  return map;
}

function parseScoring(pbp: any, box: any) {
  const map = buildPlayerMap(pbp, box);

  const stats = new Map<string, { goals: number; assists: number }>();
  let firstGoal = "";

  for (const play of pbp?.plays || []) {
    if (play?.typeDescKey !== "goal") continue;

    const d = play.details || {};

    const team =
      d.eventOwnerTeamId === pbp?.homeTeam?.id
        ? pbp?.homeTeam?.abbrev
        : d.eventOwnerTeamId === pbp?.awayTeam?.id
          ? pbp?.awayTeam?.abbrev
          : "";

    if (team !== "CAR") continue;

    const scorer =
      map.get(Number(d.scoringPlayerId)) ||
      map.get(Number(d.shootingPlayerId));

    if (!scorer) continue;

    if (!firstGoal) firstGoal = scorer;

    if (!stats.has(scorer)) stats.set(scorer, { goals: 0, assists: 0 });
    stats.get(scorer)!.goals += 1;

    const assists = [d.assist1PlayerId, d.assist2PlayerId]
      .map((id: any) => map.get(Number(id)))
      .filter(Boolean) as string[];

    for (const assist of assists) {
      if (!stats.has(assist)) stats.set(assist, { goals: 0, assists: 0 });
      stats.get(assist)!.assists += 1;
    }
  }

  return { stats, firstGoal };
}

function findStatForPick(stats: Map<string, { goals: number; assists: number }>, pickName: string) {
  for (const [nhlName, stat] of stats.entries()) {
    if (nameMatches(nhlName, pickName)) return { nhlName, ...stat };
  }

  return { nhlName: "", goals: 0, assists: 0 };
}

// =========================
// POINTS / SCORE
// =========================

function pickPoints(playerName: string, goals: number, assists: number, firstGoal: string) {
  const g = Number(goals || 0);
  const a = Number(assists || 0);
  const bonus = playerName && firstGoal && nameMatches(playerName, firstGoal) && g > 0 ? 1 : 0;

  return g * 2 + a + bonus;
}

function bonusIncluded(playerName: string, goals: number, firstGoal: string) {
  return !!playerName && !!firstGoal && nameMatches(playerName, firstGoal) && Number(goals || 0) > 0;
}

function winner(a: number, j: number) {
  return a > j ? "Aaron" : j > a ? "Julie" : "Tie";
}

function buildRecap(game: any, a: number, j: number) {
  const w = winner(a, j);
  const matchup = game?.opponent && game.opponent !== "Next Game" ? `vs ${game.opponent}` : "Final Result";

  if (w === "Tie") {
    return `Tie ${a}-${j}. ${matchup}. Nobody gets bragging rights, which frankly feels illegal.`;
  }

  const loser = w === "Aaron" ? "Julie" : "Aaron";
  return `${w} wins ${a}-${j}. ${matchup}. ${loser} may file a formal complaint with the Department of Rivalry Affairs.`;
}

// =========================
// EVENT LOG / DEDUPE
// =========================

async function logOnce(gameId: number, eventKey: string, payload: Record<string, unknown> = {}) {
  const { error } = await db.from("rivalry_events").insert({
    game_id: gameId,
    event_type: "push_notification",
    event_key: eventKey,
    payload,
  });

  if (!error) return true;

  if ((error as any).code === "23505") return false;

  console.error("rivalry_events insert failed:", error);
  return false;
}

// =========================
// PUSH
// =========================

async function sendPush(
  title: string,
  body: string,
  tag: string,
  options: {
    gameId?: number;
    bypassActiveDeviceSuppression?: boolean;
    triggeredBy?: string | null;
    triggeredByName?: string | null;
  } = {},
) {
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("*");

  if (error) {
    console.error("push_subscriptions lookup failed:", error);
    return { attempted: 0, sent: 0, suppressed: 0, removed: 0 };
  }

  const now = Date.now();
  let attempted = 0;
  let sent = 0;
  let suppressed = 0;
  let removed = 0;

  for (const sub of subs || []) {
    attempted += 1;

    if (!options.bypassActiveDeviceSuppression && sub.last_seen_at) {
      const last = new Date(sub.last_seen_at).getTime();
      if (Number.isFinite(last) && now - last < ACTIVE_DEVICE_SUPPRESS_MS) {
        suppressed += 1;
        continue;
      }
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify({
          title,
          body,
          tag,
          url: "/",
          game_id: options.gameId ?? null,
          triggered_by: options.triggeredBy ?? "auto-sync",
          triggered_by_name: options.triggeredByName ?? "Auto Sync",
        }),
      );

      sent += 1;
    } catch (err: any) {
      console.error("push send failed:", err?.statusCode || err?.message || err);

      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.from("push_subscriptions").delete().eq("id", sub.id);
        removed += 1;
      }
    }
  }

  return { attempted, sent, suppressed, removed };
}

async function emitPushOnce(
  gameId: number,
  eventKey: string,
  title: string,
  body: string,
  options: {
    bypassActiveDeviceSuppression?: boolean;
  } = {},
) {
  const payload = {
    title,
    message: body,
    tag: eventKey,
    url: "/",
    game_id: gameId,
    triggered_by: "auto-sync",
    triggered_by_name: "Auto Sync",
  };

  const inserted = await logOnce(gameId, eventKey, payload);

  if (!inserted) {
    return {
      deduped: true,
      title,
      body,
      push: { attempted: 0, sent: 0, suppressed: 0, removed: 0 },
    };
  }

  const push = await sendPush(title, body, eventKey, {
    gameId,
    bypassActiveDeviceSuppression: !!options.bypassActiveDeviceSuppression,
    triggeredBy: "auto-sync",
    triggeredByName: "Auto Sync",
  });

  return {
    deduped: false,
    title,
    body,
    push,
  };
}

// =========================
// MESSAGE BUILDER
// =========================

function buildNotification({
  changes,
  oldA,
  oldJ,
  newA,
  newJ,
  firstGoalBonusHit,
  state,
}: {
  changes: string[];
  oldA: number;
  oldJ: number;
  newA: number;
  newJ: number;
  firstGoalBonusHit: boolean;
  state: string;
}) {
  const oldW = winner(oldA, oldJ);
  const newW = winner(newA, newJ);
  const score = `Aaron ${newA} – Julie ${newJ}`;

  if (state === "FINAL" || state === "OFF") {
    if (newW === "Tie") {
      return {
        title: "Final",
        body: `Tie game. ${score}. Chaos.`,
      };
    }

    return {
      title: "Final",
      body: `${newW} takes it. ${score}.`,
    };
  }

  if (oldW !== newW && newW !== "Tie") {
    return {
      title: "LEAD CHANGE 👀",
      body: `${newW} takes it. ${score}.`,
    };
  }

  if (firstGoalBonusHit) {
    return {
      title: "FIRST GOAL BONUS 💰",
      body: `Bonus hits. ${score}.`,
    };
  }

  if (changes.length > 1) {
    return {
      title: "Rivalry Update 🔥",
      body: `${changes.join(" • ")}. ${score}.`,
    };
  }

  return {
    title: "Rivalry Update 🔥",
    body: `${changes[0] || "Score updated"}. ${score}.`,
  };
}

// =========================
// GAME SELECTION
// =========================

async function getCurrentCandidateGame(seasonId: number) {
  const { data: games, error } = await db
    .from("games")
    .select("*")
    .eq("season_id", seasonId)
    .neq("status", "Final")
    .neq("status", "Hidden");

  if (error) throw error;

  const sorted = (games || []).slice().sort((a: any, b: any) => {
    const at = gameStartMs(a) ?? Number.MAX_SAFE_INTEGER;
    const bt = gameStartMs(b) ?? Number.MAX_SAFE_INTEGER;

    if (at !== bt) return at - bt;

    return Number(a.game_number || 0) - Number(b.game_number || 0);
  });

  return sorted[0] || null;
}

// =========================
// FINALIZATION
// =========================

async function callFinalizeGame(gameId: number) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/finalize-game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
      "x-cron-secret": CRON_SECRET,
    },
    body: JSON.stringify({
      game_id: gameId,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `finalize-game failed with status ${res.status}`);
  }

  return data;
}

// =========================
// MAIN
// =========================

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const { data: season, error: seasonError } = await db
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .single();

    if (seasonError) throw seasonError;
    if (!season) return json({ ok: true, skipped: "no-active-season" });

    const game = await getCurrentCandidateGame(Number(season.id));

    if (!game) return json({ ok: true, skipped: "no-current-game" });

    const { data: picks, error: picksError } = await db
      .from("picks")
      .select("*")
      .eq("game_id", game.id)
      .order("pick_slot");

    if (picksError) throw picksError;

    const pickedCount = (picks || []).filter((p: any) => String(p.player_name || "").trim()).length;

    let reminderNotification = null;

    if (isInsidePickReminderWindow(game) && pickedCount < 4) {
      const reminderKey = `reminder-${game.id}`;

      reminderNotification = await emitPushOnce(
        game.id,
        reminderKey,
        "Picks Reminder",
        formatReminderBody(game),
      );
    }

    if (!game.nhl_game_id) {
      return json({
        ok: true,
        game_id: game.id,
        skipped: "missing-nhl-game-id",
        pickedCount,
        reminderNotification,
      });
    }

    const [pbpRes, boxRes] = await Promise.all([
      fetch(`${NHL_BASE}/gamecenter/${game.nhl_game_id}/play-by-play`),
      fetch(`${NHL_BASE}/gamecenter/${game.nhl_game_id}/boxscore`),
    ]);

    if (!pbpRes.ok) throw new Error(`NHL play-by-play fetch failed: ${pbpRes.status}`);
    if (!boxRes.ok) throw new Error(`NHL boxscore fetch failed: ${boxRes.status}`);

    const pbp = await pbpRes.json();
    const box = await boxRes.json();

    const state = String(pbp?.gameState || game.nhl_game_state || "").toUpperCase();

    if (!ALLOWED_NHL_STATES.includes(state)) {
      await db.from("games").update({
        nhl_game_state: state || null,
        last_synced_at: nowIso(),
      }).eq("id", game.id);

      return json({
        ok: true,
        game_id: game.id,
        state,
        skipped: "unsupported-nhl-state",
        reminderNotification,
      });
    }

    const inWindow = isInsideGameWindow(game);
    const forceSync = FORCE_SYNC_STATES.includes(state);

    if (!inWindow && !forceSync) {
      await db.from("games").update({
        nhl_game_state: state,
        last_synced_at: nowIso(),
      }).eq("id", game.id);

      return json({
        ok: true,
        game_id: game.id,
        state,
        skipped: "outside-game-window",
        inWindow,
        forceSync,
        reminderNotification,
      });
    }

    const { data: players, error: playersError } = await db
      .from("players")
      .select("player_name")
      .neq("is_active", false);

    if (playersError) throw playersError;

    const roster = (players || []).map((p: any) => p.player_name).filter(Boolean);

    const { data: profiles, error: profilesError } = await db
      .from("user_profiles")
      .select("id, display_name, legacy_owner_key, rivalry_slot")
      .eq("is_active", true)
      .order("rivalry_slot", { ascending: true });

    if (profilesError) throw profilesError;

    const slot1 = (profiles || []).find(
      (p: any) => Number(p.rivalry_slot) === 1,
    );

    const slot2 = (profiles || []).find(
      (p: any) => Number(p.rivalry_slot) === 2,
    );

    if (!slot1 || !slot2) {
      throw new Error("Missing rivalry slot profiles");
    }

    const { stats, firstGoal } = parseScoring(pbp, box);
    const firstGoalResolved = resolveRosterName(firstGoal, roster);

    let oldA = 0;
    let oldJ = 0;
    let newA = 0;
    let newJ = 0;
    let changed = false;
    let firstGoalBonusHit = false;

    const changes: string[] = [];
    const changedKeys: string[] = [];

    for (const pick of picks || []) {
      const playerName = String(pick.player_name || "").trim();
      if (!playerName) continue;

      const stat = findStatForPick(stats, playerName);

      const oldGoals = Number(pick.goals || 0);
      const oldAssists = Number(pick.assists || 0);
      const oldPoints = Number(pick.points || 0);

      const goals = Number(stat.goals || 0);
      const assists = Number(stat.assists || 0);
      const points = pickPoints(playerName, goals, assists, firstGoalResolved);

      const oldHadBonus = bonusIncluded(playerName, oldGoals, firstGoalResolved);
      const newHasBonus = bonusIncluded(playerName, goals, firstGoalResolved);

      const ownerUserId = String(pick.owner_user_id || "").trim();

      if (ownerUserId === slot1.id) {
        oldA += oldPoints;
        newA += points;
      }

      if (ownerUserId === slot2.id) {
        oldJ += oldPoints;
        newJ += points;
      }

      if (points !== oldPoints || goals !== oldGoals || assists !== oldAssists) {
        changed = true;

        const delta = points - oldPoints;
        if (delta !== 0) {
          changes.push(`${shortName(playerName)} ${delta >= 0 ? "+" : ""}${delta}`);
        } else {
          changes.push(`${shortName(playerName)} updated`);
        }

        if (!oldHadBonus && newHasBonus) {
          firstGoalBonusHit = true;
        }

        changedKeys.push(`${pick.id}:${goals}:${assists}:${points}`);

        const { error: pickUpdateError } = await db
          .from("picks")
          .update({
            goals,
            assists,
            points,
          })
          .eq("id", pick.id);

        if (pickUpdateError) throw pickUpdateError;
      }
    }

    const gamePatch: Record<string, unknown> = {
      first_goal_scorer: firstGoalResolved || null,
      last_synced_at: nowIso(),
      nhl_game_state: state,
    };

    if (pbp?.startTimeUTC) {
      gamePatch.game_start_time = pbp.startTimeUTC;
    }

    if (game.status === "Scheduled" && (state === "LIVE" || state === "CRIT")) {
      gamePatch.status = "In Progress";
    }

    const { error: gameUpdateError } = await db
      .from("games")
      .update(gamePatch)
      .eq("id", game.id);

    if (gameUpdateError) throw gameUpdateError;

    const effectiveGame = {
      ...game,
      ...gamePatch,
      nhl_game_state: state,
    };

    let notification = null;
    let finalized = null;

    if (state === "FINAL" || state === "OFF") {
      finalized = await callFinalizeGame(game.id);
      notification = finalized?.notification || null;
    } else if (changed && changes.length) {
      const message = buildNotification({
        changes,
        oldA,
        oldJ,
        newA,
        newJ,
        firstGoalBonusHit,
        state,
      });

      const updateKey = `update-${game.id}-${changedKeys.sort().join("|")}-${newA}-${newJ}`;

      notification = await emitPushOnce(
        game.id,
        updateKey,
        message.title,
        message.body,
      );
    }

    return json({
      ok: true,
      game_id: game.id,
      state,
      inWindow,
      forceSync,
      pickedCount,
      firstGoalRaw: firstGoal,
      firstGoalSaved: firstGoalResolved,
      changed,
      changes,
      firstGoalBonusHit,
      oldScore: { Aaron: oldA, Julie: oldJ },
      newScore: { Aaron: newA, Julie: newJ },
      reminderNotification,
      notification,
      finalized,
    });
  } catch (err: any) {
    console.error("auto-sync failed:", err);

    return json({
      ok: false,
      error: err?.message || String(err),
    }, 500);
  }
});