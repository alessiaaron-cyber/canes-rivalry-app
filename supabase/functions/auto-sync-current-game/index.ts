// =========================
// AUTO SYNC CURRENT GAME
// GAME-DAY SAFE VERSION
// Settings-aware notification routing
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

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ALLOWED_NHL_STATES = ["FUT", "PRE", "LIVE", "CRIT", "FINAL", "OFF"];
const FORCE_SYNC_STATES = ["LIVE", "CRIT", "FINAL", "OFF"];

const PRE_GAME_WINDOW_MS = 30 * 60 * 1000;
const POST_GAME_WINDOW_MS = 4.5 * 60 * 60 * 1000;
const PICK_REMINDER_WINDOW_MS = 75 * 60 * 1000;
const ACTIVE_DEVICE_SUPPRESS_MS = 60 * 1000;
const DEFAULT_PUSH_DELAY_SECONDS = 90;
const DEFAULT_SCORING_RULES = {
  regular: { goal: 2, assist: 1, first_goal_bonus: 1 },
  playoffs: { goal: 2, assist: 1, first_goal_bonus: 1 },
};

type Recipient = {
  user_id: string | null;
  user_email: string;
};

type NotificationSettings = {
  push_enabled: boolean;
  push_delay_seconds: number;
};

type ScoringRules = typeof DEFAULT_SCORING_RULES;
type ScoringProfile = ScoringRules["regular"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function cleanEmail(value: unknown) {
  return String(value || "").toLowerCase().trim();
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

function safeNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeScoringRules(value: any): ScoringRules {
  const rules = value && typeof value === "object" ? value : {};
  const regular = rules.regular && typeof rules.regular === "object" ? rules.regular : {};
  const playoffs = rules.playoffs && typeof rules.playoffs === "object" ? rules.playoffs : {};

  return {
    regular: {
      goal: safeNumber(regular.goal, DEFAULT_SCORING_RULES.regular.goal),
      assist: safeNumber(regular.assist, DEFAULT_SCORING_RULES.regular.assist),
      first_goal_bonus: safeNumber(
        regular.first_goal_bonus,
        DEFAULT_SCORING_RULES.regular.first_goal_bonus,
      ),
    },
    playoffs: {
      goal: safeNumber(playoffs.goal, DEFAULT_SCORING_RULES.playoffs.goal),
      assist: safeNumber(playoffs.assist, DEFAULT_SCORING_RULES.playoffs.assist),
      first_goal_bonus: safeNumber(
        playoffs.first_goal_bonus,
        DEFAULT_SCORING_RULES.playoffs.first_goal_bonus,
      ),
    },
  };
}

function scoringProfileForGame(game: any, rules: ScoringRules) {
  const profile = String(game?.game_type || "").toLowerCase().includes("playoff")
    ? "playoffs"
    : "regular";

  return {
    profile,
    scoring: rules[profile],
  };
}

function pickPoints(
  playerName: string,
  goals: number,
  assists: number,
  firstGoal: string,
  scoring: ScoringProfile,
) {
  const g = Number(goals || 0);
  const a = Number(assists || 0);
  const bonus = playerName && firstGoal && nameMatches(playerName, firstGoal) && g > 0
    ? Number(scoring.first_goal_bonus || 0)
    : 0;

  return g * Number(scoring.goal || 0) + a * Number(scoring.assist || 0) + bonus;
}

function bonusIncluded(playerName: string, goals: number, firstGoal: string) {
  return !!playerName && !!firstGoal && nameMatches(playerName, firstGoal) && Number(goals || 0) > 0;
}

function winner(a: number, j: number, slot1?: any, slot2?: any) {
  const slot1Name = String(slot1?.display_name || slot1?.legacy_owner_key || "Player 1").trim();
  const slot2Name = String(slot2?.display_name || slot2?.legacy_owner_key || "Player 2").trim();

  return a > j ? slot1Name : j > a ? slot2Name : "Tie";
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
// SETTINGS-AWARE NOTIFICATIONS
// =========================

function normalizeDelaySeconds(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PUSH_DELAY_SECONDS;
  return Math.max(0, Math.min(600, Math.round(n)));
}

function normalizeSettings(row: any): NotificationSettings {
  const stream =
    row?.stream_settings && typeof row.stream_settings === "object"
      ? row.stream_settings
      : {};

  const notifications =
    row?.notification_settings && typeof row.notification_settings === "object"
      ? row.notification_settings
      : {};

  return {
    push_enabled: notifications.push_enabled !== false,
    push_delay_seconds: normalizeDelaySeconds(stream.push_delay_seconds),
  };
}

function isRecentlyActive(lastSeenAt: unknown) {
  if (!lastSeenAt) return false;

  const lastSeenMs = new Date(String(lastSeenAt)).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;

  const ageMs = Date.now() - lastSeenMs;
  return ageMs >= 0 && ageMs <= ACTIVE_DEVICE_SUPPRESS_MS;
}

async function loadRecipients(): Promise<Recipient[]> {
  const { data, error } = await db
    .from("push_subscriptions")
    .select("user_id, user_email");

  if (error) {
    console.error("push_subscriptions recipient lookup failed:", error);
    throw error;
  }

  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const row of data || []) {
    const userId = row.user_id ? String(row.user_id) : "";
    const email = cleanEmail(row.user_email);

    if (!userId && !email) continue;

    const key = userId || email;
    if (seen.has(key)) continue;

    seen.add(key);
    recipients.push({
      user_id: userId || null,
      user_email: email,
    });
  }

  return recipients;
}

async function loadSettingsByUserId(userIds: string[]) {
  const map = new Map<string, NotificationSettings>();

  if (!userIds.length) return map;

  const { data, error } = await db
    .from("user_settings")
    .select("user_id, stream_settings, notification_settings")
    .in("user_id", userIds);

  if (error) {
    console.error("user_settings lookup failed:", error);
    throw error;
  }

  for (const row of data || []) {
    map.set(String(row.user_id), normalizeSettings(row));
  }

  return map;
}

async function loadSubscriptions(targetUserId: string | null, targetEmail: string | null) {
  if (targetUserId) {
    const { data: idSubs, error: idError } = await db
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", targetUserId);

    if (idError) {
      console.error("push_subscriptions user_id lookup failed:", idError);
      return { subs: [], error: idError };
    }

    if ((idSubs || []).length > 0) {
      return { subs: idSubs || [], error: null };
    }
  }

  if (targetEmail) {
    const { data: emailSubs, error: emailError } = await db
      .from("push_subscriptions")
      .select("*")
      .ilike("user_email", targetEmail);

    if (emailError) {
      console.error("push_subscriptions email lookup failed:", emailError);
      return { subs: [], error: emailError };
    }

    return { subs: emailSubs || [], error: null };
  }

  return { subs: [], error: null };
}

async function sendPushToRecipient(
  title: string,
  body: string,
  tag: string,
  gameId: number,
  payload: Record<string, unknown>,
  recipient: Recipient,
) {
  const { subs, error } = await loadSubscriptions(recipient.user_id, recipient.user_email);

  if (error) {
    return { attempted: 0, sent: 0, suppressed: 0, removed: 0, matched_subscriptions: 0 };
  }

  let attempted = 0;
  let sent = 0;
  let suppressed = 0;
  let removed = 0;

  for (const sub of subs || []) {
    if (isRecentlyActive(sub.last_seen_at)) {
      suppressed += 1;
      continue;
    }

    attempted += 1;

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
          ...payload,
          title,
          body,
          tag,
          url: String(payload.url || "/"),
          game_id: gameId,
          triggered_by: String(payload.triggered_by || "auto-sync"),
          triggered_by_name: String(payload.triggered_by_name || "Auto Sync"),
          target_user_id: recipient.user_id,
          target_user_email: recipient.user_email,
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

  return {
    attempted,
    sent,
    suppressed,
    removed,
    matched_subscriptions: (subs || []).length,
  };
}

async function enqueueDelayedForRecipient(
  gameId: number,
  eventKey: string,
  title: string,
  body: string,
  payload: Record<string, unknown>,
  recipient: Recipient,
  delaySeconds: number,
) {
  const visibleAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { error } = await db.from("delayed_notifications").insert({
    game_id: gameId,
    event_key: eventKey,
    title,
    message: body,
    payload: {
      ...payload,
      target_user_id: recipient.user_id,
      target_user_email: recipient.user_email,
      delay_seconds_applied: delaySeconds,
    },
    triggered_by: String(payload.triggered_by || "auto-sync"),
    suppress_self: false,
    visible_after: visibleAfter,
    target_user_id: recipient.user_id,
    target_user_email: recipient.user_email,
  });

  if (!error) return { inserted: true, visible_after: visibleAfter };
  if ((error as any).code === "23505") return { inserted: false, visible_after: visibleAfter };

  console.error("delayed notification insert failed:", error);
  throw error;
}

async function emitNotificationOnce(
  gameId: number,
  eventKey: string,
  title: string,
  body: string,
  options: {
    spoilerSensitive?: boolean;
    bypassActiveDeviceSuppression?: boolean;
    triggeredBy?: string;
    triggeredByName?: string;
  } = {},
) {
  const spoilerSensitive = options.spoilerSensitive === true;

  const basePayload = {
    title,
    message: body,
    tag: eventKey,
    url: "/",
    game_id: gameId,
    triggered_by: options.triggeredBy || "auto-sync",
    triggered_by_name: options.triggeredByName || "Auto Sync",
    delay_visible: spoilerSensitive,
    spoiler_sensitive: spoilerSensitive,
  };

  const recipients = await loadRecipients();
  const userIds = recipients.map((r) => r.user_id).filter(Boolean) as string[];
  const settingsByUserId = await loadSettingsByUserId(userIds);

  let delayedRecipients = 0;
  let delayedDeduped = 0;
  let skippedDisabled = 0;
  let immediateRecipients = 0;
  let pushAttempted = 0;
  let pushSent = 0;
  let pushSuppressed = 0;
  let pushRemoved = 0;
  let matchedSubscriptions = 0;
  let firstVisibleAfter: string | null = null;

  const immediateQueue: Recipient[] = [];

  for (const recipient of recipients) {
    const settings = recipient.user_id
      ? settingsByUserId.get(recipient.user_id) || normalizeSettings(null)
      : normalizeSettings(null);

    if (!settings.push_enabled) {
      skippedDisabled += 1;
      continue;
    }

    if (spoilerSensitive && settings.push_delay_seconds > 0) {
      const queued = await enqueueDelayedForRecipient(
        gameId,
        eventKey,
        title,
        body,
        basePayload,
        recipient,
        settings.push_delay_seconds,
      );

      delayedRecipients += queued.inserted ? 1 : 0;
      delayedDeduped += queued.inserted ? 0 : 1;
      firstVisibleAfter = firstVisibleAfter || queued.visible_after;
    } else {
      immediateQueue.push(recipient);
    }
  }

  let insertedVisibleEvent = false;
  let dedupedVisibleEvent = false;

  if (immediateQueue.length > 0) {
    insertedVisibleEvent = await logOnce(gameId, eventKey, basePayload);
    dedupedVisibleEvent = !insertedVisibleEvent;

    if (insertedVisibleEvent) {
      for (const recipient of immediateQueue) {
        const push = await sendPushToRecipient(
          title,
          body,
          eventKey,
          gameId,
          basePayload,
          recipient,
        );

        immediateRecipients += 1;
        pushAttempted += Number(push.attempted || 0);
        pushSent += Number(push.sent || 0);
        pushSuppressed += Number(push.suppressed || 0);
        pushRemoved += Number(push.removed || 0);
        matchedSubscriptions += Number(push.matched_subscriptions || 0);
      }
    }
  }

  return {
    deduped: dedupedVisibleEvent && delayedDeduped > 0,
    delayed: delayedRecipients > 0,
    title,
    body,
    event_key: eventKey,
    visible_after: firstVisibleAfter,
    routing: {
      recipients: recipients.length,
      immediate_recipients: immediateRecipients,
      delayed_recipients: delayedRecipients,
      delayed_deduped: delayedDeduped,
      skipped_disabled: skippedDisabled,
    },
    push: {
      attempted: pushAttempted,
      sent: pushSent,
      suppressed: pushSuppressed,
      removed: pushRemoved,
      matched_subscriptions: matchedSubscriptions,
    },
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
  slot1,
  slot2,
}: {
  changes: string[];
  oldA: number;
  oldJ: number;
  newA: number;
  newJ: number;
  firstGoalBonusHit: boolean;
  state: string;
  slot1: any;
  slot2: any;
}) {
  const oldW = winner(oldA, oldJ, slot1, slot2);
  const newW = winner(newA, newJ, slot1, slot2);

  const slot1Name = String(slot1?.display_name || slot1?.legacy_owner_key || "Player 1").trim();
  const slot2Name = String(slot2?.display_name || slot2?.legacy_owner_key || "Player 2").trim();

  const score = `${slot1Name} ${newA} – ${slot2Name} ${newJ}`;

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
// CARRY FORWARD PICKS
// =========================

function filledPickCount(rows: any[] = []) {
  return rows.filter((p: any) => String(p.player_name || "").trim()).length;
}

async function loadPreviousGameWithFourPicks(seasonId: number, game: any) {
  const currentNumber = Number(game?.game_number || 0);

  let query = db
    .from("games")
    .select("id, game_number, game_date")
    .eq("season_id", seasonId)
    .neq("status", "Hidden")
    .order("game_number", { ascending: false })
    .limit(12);

  if (currentNumber > 0) {
    query = query.lt("game_number", currentNumber);
  } else if (game?.game_date) {
    query = query.lt("game_date", game.game_date);
  } else {
    query = query.neq("id", game.id);
  }

  const { data: previousGames, error } = await query;
  if (error) throw error;

  for (const previousGame of previousGames || []) {
    const { data: previousPicks, error: picksError } = await db
      .from("picks")
      .select("*")
      .eq("game_id", previousGame.id)
      .order("owner_user_id", { ascending: true, nullsFirst: false })
      .order("pick_slot", { ascending: true });

    if (picksError) throw picksError;

    const filled = (previousPicks || [])
      .filter((pick: any) => String(pick.player_name || "").trim())
      .slice(0, 4);

    if (filled.length >= 4) {
      return { game: previousGame, picks: filled };
    }
  }

  return { game: null, picks: [] };
}

function carryForwardRows(gameId: number, sourcePicks: any[]) {
  return sourcePicks.slice(0, 4).map((pick: any) => ({
    game_id: gameId,
    owner: pick.owner,
    owner_user_id: pick.owner_user_id || null,
    pick_slot: Number(pick.pick_slot || 1),
    player_name: String(pick.player_name || "").trim(),
    original_pick_text: pick.original_pick_text || pick.player_name || null,
    goals: 0,
    assists: 0,
    points: 0,
    is_carry_forward: true,
    picked_by_user_id: null,
    updated_by_user_id: null,
    updated_at: nowIso(),
  }));
}

async function maybeApplyCarryForwardPicks({
  seasonId,
  game,
  firstGoalResolved,
  picks,
}: {
  seasonId: number;
  game: any;
  firstGoalResolved: string;
  picks: any[];
}) {
  const currentFilledCount = filledPickCount(picks);

  if (!firstGoalResolved || currentFilledCount >= 4) {
    return {
      applied: false,
      reason: !firstGoalResolved ? "no-first-goal" : "current-game-has-four-picks",
      from_game_id: null,
      replaced_pick_count: 0,
      picks,
    };
  }

  const previous = await loadPreviousGameWithFourPicks(seasonId, game);

  if (!previous.game || previous.picks.length < 4) {
    return {
      applied: false,
      reason: "no-previous-game-with-four-picks",
      from_game_id: null,
      replaced_pick_count: currentFilledCount,
      picks,
    };
  }

  const { error: deleteError } = await db
    .from("picks")
    .delete()
    .eq("game_id", game.id);

  if (deleteError) throw deleteError;

  const rows = carryForwardRows(game.id, previous.picks);

  const { data: inserted, error: insertError } = await db
    .from("picks")
    .insert(rows)
    .select("*");

  if (insertError) throw insertError;

  const { error: gameDraftError } = await db
    .from("games")
    .update({
      draft_status: "complete",
      current_pick_number: 5,
      current_pick_user_id: null,
    })
    .eq("id", game.id);

  if (gameDraftError) throw gameDraftError;

  return {
    applied: true,
    reason: "first-goal-before-complete-picks",
    from_game_id: previous.game.id,
    replaced_pick_count: currentFilledCount,
    picks: inserted || rows,
  };
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
      .select("id, scoring_rules")
      .eq("is_active", true)
      .single();

    if (seasonError) throw seasonError;
    if (!season) return json({ ok: true, skipped: "no-active-season" });

    const game = await getCurrentCandidateGame(Number(season.id));

    if (!game) return json({ ok: true, skipped: "no-current-game" });

    const scoringRules = normalizeScoringRules(season.scoring_rules);
    const { profile: scoringProfile, scoring } = scoringProfileForGame(game, scoringRules);

    const { data: initialPicks, error: picksError } = await db
      .from("picks")
      .select("*")
      .eq("game_id", game.id)
      .order("pick_slot");

    if (picksError) throw picksError;

    let picks = initialPicks || [];

    const pickedCount = filledPickCount(picks);

    let reminderNotification = null;

    if (isInsidePickReminderWindow(game) && pickedCount < 4) {
      const reminderKey = `reminder-${game.id}`;

      reminderNotification = await emitNotificationOnce(
        game.id,
        reminderKey,
        "Picks Reminder",
        formatReminderBody(game),
        {
          spoilerSensitive: false,
          triggeredBy: "auto-sync",
          triggeredByName: "Auto Sync",
        },
      );
    }

    if (!game.nhl_game_id) {
      return json({
        ok: true,
        game_id: game.id,
        skipped: "missing-nhl-game-id",
        pickedCount,
        scoringProfile,
        scoringRulesUsed: scoring,
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
        scoringProfile,
        scoringRulesUsed: scoring,
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
        scoringProfile,
        scoringRulesUsed: scoring,
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

    const slot1 = (profiles || []).find((p: any) => Number(p.rivalry_slot) === 1);
    const slot2 = (profiles || []).find((p: any) => Number(p.rivalry_slot) === 2);

    if (!slot1 || !slot2) {
      throw new Error("Missing rivalry slot profiles");
    }

    const { stats, firstGoal } = parseScoring(pbp, box);
    const firstGoalResolved = resolveRosterName(firstGoal, roster);

    let carryForward = {
      applied: false,
      reason: "not-checked",
      from_game_id: null,
      replaced_pick_count: 0,
    };

    const carryForwardResult = await maybeApplyCarryForwardPicks({
      seasonId: Number(season.id),
      game,
      firstGoalResolved,
      picks,
    });

    carryForward = {
      applied: carryForwardResult.applied,
      reason: carryForwardResult.reason,
      from_game_id: carryForwardResult.from_game_id,
      replaced_pick_count: carryForwardResult.replaced_pick_count,
    };

    if (carryForwardResult.applied) {
      picks = carryForwardResult.picks;
    }

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
      const points = pickPoints(playerName, goals, assists, firstGoalResolved, scoring);

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
        slot1,
        slot2,
      });

      const updateKey = `update-${game.id}-${changedKeys.sort().join("|")}-${newA}-${newJ}`;

      notification = await emitNotificationOnce(
        game.id,
        updateKey,
        message.title,
        message.body,
        {
          spoilerSensitive: true,
          triggeredBy: "auto-sync",
          triggeredByName: "Auto Sync",
        },
      );
    }

    return json({
      ok: true,
      game_id: game.id,
      state,
      inWindow,
      forceSync,
      pickedCount,
      scoringProfile,
      scoringRulesUsed: scoring,
      firstGoalRaw: firstGoal,
      firstGoalSaved: firstGoalResolved,
      carryForward,
      changed,
      changes,
      firstGoalBonusHit,
      oldScore: {
        [slot1.display_name]: oldA,
        [slot2.display_name]: oldJ,
      },
      newScore: {
        [slot1.display_name]: newA,
        [slot2.display_name]: newJ,
      },
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