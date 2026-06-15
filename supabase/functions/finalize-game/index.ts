import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const authDb = createClient(SUPABASE_URL, ANON_KEY);

const DEFAULT_PUSH_DELAY_SECONDS = 90;
const DEFAULT_SCORING_RULES = {
  regular: { goal: 2, assist: 1, first_goal_bonus: 1 },
  playoffs: { goal: 2, assist: 1, first_goal_bonus: 1 },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(value: unknown) {
  return String(value || "").toLowerCase().trim();
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function profileName(profile: any | null | undefined, fallback = "Player") {
  return cleanText(profile?.display_name) || fallback;
}

async function isAuthorized(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === CRON_SECRET) {
    return { ok: true, via: "cron", user: null, email: "finalize-game" };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, via: "none", user: null, email: null, error: "Unauthorized", status: 401 };
  }

  const { data, error } = await authDb.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, via: "auth", user: null, email: null, error: "Unauthorized", status: 401 };
  }

  const userEmail = cleanEmail(data.user.email);
  if (!userEmail) {
    return { ok: false, via: "auth", user: data.user, email: null, error: "Missing user email", status: 401 };
  }

  const { data: allowedUser, error: allowedError } = await serviceDb
    .from("allowed_users")
    .select("email")
    .ilike("email", userEmail)
    .maybeSingle();

  if (allowedError) {
    console.error("allowed_users lookup failed:", allowedError);
    return { ok: false, via: "auth", user: data.user, email: userEmail, error: "Authorization check failed", status: 500 };
  }

  if (!allowedUser) {
    return { ok: false, via: "auth", user: data.user, email: userEmail, error: "Forbidden", status: 403 };
  }

  return { ok: true, via: "auth", user: data.user, email: userEmail };
}

function normalizeName(name: any) {
  return String(name || "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatches(a: any, b: any) {
  const aa = normalizeName(a);
  const bb = normalizeName(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;

  const ap = aa.split(" ").filter(Boolean);
  const bp = bb.split(" ").filter(Boolean);

  if ([...ap].sort().join(" ") === [...bp].sort().join(" ")) return true;

  return !!ap.at(-1) && !!bp.at(-1) && ap.at(-1) === bp.at(-1);
}

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
  const bonus =
    playerName && firstGoal && nameMatches(playerName, firstGoal) && g > 0
      ? Number(scoring.first_goal_bonus || 0)
      : 0;

  return g * Number(scoring.goal || 0) + a * Number(scoring.assist || 0) + bonus;
}

function buildScoreLabel(slot1: any, slot2: any, slot1Points: number, slot2Points: number) {
  return `${profileName(slot1, "Player 1")} ${slot1Points} – ${profileName(slot2, "Player 2")} ${slot2Points}`;
}

function getWinnerProfile(slot1: any, slot2: any, slot1Points: number, slot2Points: number) {
  if (slot1Points > slot2Points) return slot1;
  if (slot2Points > slot1Points) return slot2;
  return null;
}

function buildRecap(
  game: any,
  winnerProfile: any | null,
  slot1: any,
  slot2: any,
  slot1Points: number,
  slot2Points: number,
) {
  const matchup =
    game?.opponent && game.opponent !== "Next Game"
      ? `vs ${game.opponent}`
      : "Final Result";

  if (!winnerProfile) {
    return `Tie ${slot1Points}-${slot2Points}. ${matchup}. Nobody gets bragging rights, which frankly feels illegal.`;
  }

  const winnerName = profileName(winnerProfile, "Winner");
  const loserProfile = winnerProfile.id === slot1.id ? slot2 : slot1;
  const loserName = profileName(loserProfile, "the loser");

  return `${winnerName} wins ${slot1Points}-${slot2Points}. ${matchup}. ${loserName} may file a formal complaint with the Department of Rivalry Affairs.`;
}

function buildFinalMessage(winnerProfile: any | null, scoreLabel: string) {
  if (!winnerProfile) {
    return {
      title: "Final",
      body: `Tie game. ${scoreLabel}. Chaos.`,
    };
  }

  return {
    title: "Final",
    body: `${profileName(winnerProfile, "Winner")} takes it. ${scoreLabel}.`,
  };
}

async function loadRecipients(): Promise<Recipient[]> {
  const { data, error } = await serviceDb
    .from("push_subscriptions")
    .select("user_id, user_email");

  if (error) throw error;

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

async function loadSettingsByUserId(userIds: string[]) {
  const map = new Map<string, NotificationSettings>();

  if (!userIds.length) return map;

  const { data, error } = await serviceDb
    .from("user_settings")
    .select("user_id, stream_settings, notification_settings")
    .in("user_id", userIds);

  if (error) throw error;

  for (const row of data || []) {
    map.set(String(row.user_id), normalizeSettings(row));
  }

  return map;
}

async function enqueueFinalNotifications(gameId: number, title: string, body: string) {
  const eventKey = `final-${gameId}`;
  const recipients = await loadRecipients();
  const userIds = recipients.map((r) => r.user_id).filter(Boolean) as string[];
  const settingsByUserId = await loadSettingsByUserId(userIds);

  let inserted = 0;
  let deduped = 0;
  let skippedDisabled = 0;
  let firstVisibleAfter: string | null = null;

  for (const recipient of recipients) {
    const settings = recipient.user_id
      ? settingsByUserId.get(recipient.user_id) || normalizeSettings(null)
      : normalizeSettings(null);

    if (!settings.push_enabled) {
      skippedDisabled += 1;
      continue;
    }

    const delaySeconds = settings.push_delay_seconds;
    const visibleAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();

    const payload = {
      title,
      message: body,
      tag: eventKey,
      url: "/",
      game_id: gameId,
      triggered_by: "finalize-game",
      triggered_by_name: "Finalize Game",
      delay_visible: true,
      suppress_self: false,
      target_user_id: recipient.user_id,
      target_user_email: recipient.user_email,
      delay_seconds_applied: delaySeconds,
    };

    const { error } = await serviceDb.from("delayed_notifications").insert({
      game_id: gameId,
      event_key: eventKey,
      title,
      message: body,
      payload,
      triggered_by: "finalize-game",
      suppress_self: false,
      visible_after: visibleAfter,
      target_user_id: recipient.user_id,
      target_user_email: recipient.user_email,
    });

    if (!error) {
      inserted += 1;
      firstVisibleAfter = firstVisibleAfter || visibleAfter;
      continue;
    }

    if ((error as any).code === "23505") {
      deduped += 1;
      firstVisibleAfter = firstVisibleAfter || visibleAfter;
      continue;
    }

    console.error("delayed final notification insert failed:", error);
    throw error;
  }

  return {
    delayed: inserted > 0,
    deduped: inserted === 0 && deduped > 0,
    title,
    body,
    event_key: eventKey,
    visible_after: firstVisibleAfter,
    routing: {
      recipients: recipients.length,
      delayed_recipients: inserted,
      delayed_deduped: deduped,
      skipped_disabled: skippedDisabled,
    },
    push: { attempted: 0, sent: 0, removed: 0 },
  };
}

async function loadGameScores(gameId: number) {
  const { data, error } = await serviceDb
    .from("game_user_scores")
    .select("user_id, points")
    .eq("game_id", gameId);

  if (error) throw error;

  return new Map((data || []).map((row: any) => [String(row.user_id), Number(row.points || 0)]));
}

function scorePayload(slot1: any, slot2: any, totalsByUserId: Map<string, number>) {
  return {
    [slot1.id]: Number(totalsByUserId.get(slot1.id) || 0),
    [slot2.id]: Number(totalsByUserId.get(slot2.id) || 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const auth = await isAuthorized(req);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error || "Unauthorized" }, auth.status || 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const gameId = Number(body?.game_id);

    if (!gameId) {
      return json({ ok: false, error: "Missing game_id" }, 400);
    }

    const { data: profiles, error: profilesError } = await serviceDb
      .from("user_profiles")
      .select("id, display_name, rivalry_slot")
      .eq("is_active", true)
      .order("rivalry_slot", { ascending: true });

    if (profilesError) throw profilesError;

    const slot1 = (profiles || []).find((p: any) => Number(p.rivalry_slot) === 1);
    const slot2 = (profiles || []).find((p: any) => Number(p.rivalry_slot) === 2);

    if (!slot1 || !slot2) {
      return json({ ok: false, error: "Missing rivalry slot profiles" }, 500);
    }

    const { data: game, error: gameError } = await serviceDb
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (gameError) throw gameError;
    if (!game) return json({ ok: false, error: "Game not found" }, 404);

    if (game.status === "Final") {
      const existingScores = await loadGameScores(gameId);
      const existingWinnerProfile = game.winner_user_id
        ? (profiles || []).find((p: any) => p.id === game.winner_user_id) || null
        : null;

      return json({
        ok: true,
        alreadyFinal: true,
        authorizedVia: auth.via,
        game_id: gameId,
        score: scorePayload(slot1, slot2, existingScores),
        winner_user_id: game.winner_user_id || null,
        winner: existingWinnerProfile ? profileName(existingWinnerProfile, "Winner") : "Tie",
        recap: game.recap || "",
        notification: {
          skipped: "already-final",
          sent: false,
        },
      });
    }

    const { data: season, error: seasonError } = await serviceDb
      .from("seasons")
      .select("id, scoring_rules, regular_scoring_locked_at, playoff_scoring_locked_at")
      .eq("id", game.season_id)
      .single();

    if (seasonError) throw seasonError;

    const scoringRules = normalizeScoringRules(season?.scoring_rules);
    const { profile: scoringProfile, scoring } = scoringProfileForGame(game, scoringRules);

    const { data: picks, error: picksError } = await serviceDb
      .from("picks")
      .select("*")
      .eq("game_id", gameId)
      .order("owner_user_id", { ascending: true, nullsFirst: false })
      .order("pick_slot");

    if (picksError) throw picksError;

    const filledPicks = (picks || []).filter((p: any) =>
      String(p.player_name || "").trim(),
    );

    if (filledPicks.length < 4) {
      const recap = "No Canes goals. Rivalry ends scoreless. Nobody gets bragging rights, which frankly feels illegal.";

      const { data: finalizedGame, error: updateError } = await serviceDb
        .from("games")
        .update({
          status: "Final",
          winner_user_id: null,
          recap,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", gameId)
        .neq("status", "Final")
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;

      for (const userId of [slot1.id, slot2.id]) {
        const { error: scoreError } = await serviceDb
          .from("game_user_scores")
          .upsert(
            {
              game_id: gameId,
              user_id: userId,
              points: 0,
            },
            { onConflict: "game_id,user_id" },
          );

        if (scoreError) throw scoreError;
      }

      const scoreLabel = buildScoreLabel(slot1, slot2, 0, 0);
      const finalMessage = buildFinalMessage(null, scoreLabel);
      const notification = finalizedGame
        ? await enqueueFinalNotifications(gameId, finalMessage.title, finalMessage.body)
        : {
            skipped: "already-final-race",
            sent: false,
          };

      return json({
        ok: true,
        alreadyFinal: !finalizedGame,
        authorizedVia: auth.via,
        game_id: gameId,
        scoringProfile,
        scoringRulesUsed: scoring,
        score: {
          [slot1.id]: 0,
          [slot2.id]: 0,
        },
        winner_user_id: null,
        winner: "Tie",
        recap,
        noContest: true,
        notification,
      });
    }

    const names = filledPicks.map((p: any) => normalizeName(p.player_name));
    if (new Set(names).size !== names.length) {
      return json(
        {
          ok: false,
          error: "Each player can only be picked once for this game.",
          game_id: gameId,
          scoringProfile,
          scoringRulesUsed: scoring,
        },
        400,
      );
    }

    const totalsByUserId = new Map<string, number>();
    totalsByUserId.set(slot1.id, 0);
    totalsByUserId.set(slot2.id, 0);

    for (const pick of picks || []) {
      const points = pickPoints(
        String(pick.player_name || ""),
        Number(pick.goals || 0),
        Number(pick.assists || 0),
        String(game.first_goal_scorer || ""),
        scoring,
      );

      if (Number(points) !== Number(pick.points || 0)) {
        const { error: pickUpdateError } = await serviceDb
          .from("picks")
          .update({ points })
          .eq("id", pick.id);

        if (pickUpdateError) throw pickUpdateError;
      }

      const ownerUserId = String(pick.owner_user_id || "").trim();

      if (ownerUserId) {
        totalsByUserId.set(ownerUserId, Number(totalsByUserId.get(ownerUserId) || 0) + points);
      }
    }

    const slot1Points = Number(totalsByUserId.get(slot1.id) || 0);
    const slot2Points = Number(totalsByUserId.get(slot2.id) || 0);

    const winnerProfile = getWinnerProfile(slot1, slot2, slot1Points, slot2Points);
    const recap = buildRecap(game, winnerProfile, slot1, slot2, slot1Points, slot2Points);

    const { data: finalizedGame, error: updateError } = await serviceDb
      .from("games")
      .update({
        status: "Final",
        winner_user_id: winnerProfile?.id || null,
        recap,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", gameId)
      .neq("status", "Final")
      .select("id")
      .maybeSingle();

    if (updateError) throw updateError;

    if (!finalizedGame) {
      return json({
        ok: true,
        alreadyFinal: true,
        raceProtected: true,
        authorizedVia: auth.via,
        game_id: gameId,
        scoringProfile,
        scoringRulesUsed: scoring,
        score: scorePayload(slot1, slot2, totalsByUserId),
        winner_user_id: winnerProfile?.id || null,
        winner: winnerProfile ? profileName(winnerProfile, "Winner") : "Tie",
        recap,
        notification: {
          skipped: "already-final-race",
          sent: false,
        },
      });
    }

    const scoringLockPatch = scoringProfile === "playoffs"
  ? {
      playoff_scoring_locked: true,
      playoff_scoring_locked_at: season?.playoff_scoring_locked_at || new Date().toISOString(),
    }
  : {
      regular_scoring_locked: true,
      regular_scoring_locked_at: season?.regular_scoring_locked_at || new Date().toISOString(),
    };

    const { error: lockError } = await serviceDb
      .from("seasons")
      .update(scoringLockPatch)
      .eq("id", game.season_id);

    if (lockError) throw lockError;

    for (const [userId, totalPoints] of totalsByUserId.entries()) {
      const { error: scoreError } = await serviceDb
        .from("game_user_scores")
        .upsert(
          {
            game_id: gameId,
            user_id: userId,
            points: totalPoints,
          },
          { onConflict: "game_id,user_id" },
        );

      if (scoreError) throw scoreError;
    }

    const scoreLabel = buildScoreLabel(slot1, slot2, slot1Points, slot2Points);
    const finalMessage = buildFinalMessage(winnerProfile, scoreLabel);
    const notification = await enqueueFinalNotifications(
      gameId,
      finalMessage.title,
      finalMessage.body,
    );

    return json({
      ok: true,
      alreadyFinal: false,
      authorizedVia: auth.via,
      game_id: gameId,
      scoringProfile,
      scoringRulesUsed: scoring,
      scoringLockUpdated: scoringProfile,
      score: scorePayload(slot1, slot2, totalsByUserId),
      winner_user_id: winnerProfile?.id || null,
      winner: winnerProfile ? profileName(winnerProfile, "Winner") : "Tie",
      recap,
      notification,
    });
  } catch (err: any) {
    console.error("finalize-game failed:", err);

    return json(
      {
        ok: false,
        error: err?.message || String(err),
      },
      500,
    );
  }
});
