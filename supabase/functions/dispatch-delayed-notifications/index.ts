import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ACTIVE_DEVICE_SKIP_SECONDS = 75;
const BATCH_LIMIT = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function cleanEmail(value: unknown) {
  return String(value || "").toLowerCase().trim();
}

function isRecentlyActive(lastSeenAt: unknown) {
  if (!lastSeenAt) return false;

  const lastSeenMs = new Date(String(lastSeenAt)).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;

  const ageSeconds = (Date.now() - lastSeenMs) / 1000;
  return ageSeconds >= 0 && ageSeconds <= ACTIVE_DEVICE_SKIP_SECONDS;
}

async function logVisibleEvent(
  gameId: number,
  eventKey: string,
  payload: Record<string, unknown>,
) {
  const { error } = await serviceDb.from("rivalry_events").insert({
    game_id: gameId,
    event_type: "push_notification",
    event_key: eventKey,
    payload,
  });

  if (!error) return true;
  if ((error as any).code === "23505") return false;

  console.error("rivalry_events insert failed:", error);
  throw error;
}

async function loadSubscriptions(
  targetUserId: string | null,
  targetUserEmail: string | null,
) {
  // Legacy/global v1 path: no target user means broadcast to all subscriptions.
  if (!targetUserId) {
    const { data, error } = await serviceDb.from("push_subscriptions").select("*");

    if (error) {
      console.error("push_subscriptions global lookup failed:", error);
      return { subs: [], error };
    }

    return { subs: data || [], error: null };
  }

  // Preferred v2 path: user_id first.
  const { data: idSubs, error: idError } = await serviceDb
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

  // V1 compatibility fallback: email if user_id has no subscription match.
  if (targetUserEmail) {
    const { data: emailSubs, error: emailError } = await serviceDb
      .from("push_subscriptions")
      .select("*")
      .ilike("user_email", targetUserEmail);

    if (emailError) {
      console.error("push_subscriptions email fallback lookup failed:", emailError);
      return { subs: [], error: emailError };
    }

    return { subs: emailSubs || [], error: null };
  }

  return { subs: [], error: null };
}

async function sendPush(
  title: string,
  body: string,
  tag: string,
  gameId: number,
  triggeredBy: string,
  suppressSelf: boolean,
  payload: Record<string, unknown> = {},
  targetUserId: string | null = null,
  targetUserEmail: string | null = null,
) {
  const { subs, error } = await loadSubscriptions(targetUserId, targetUserEmail);

  if (error) {
    return {
      attempted: 0,
      sent: 0,
      skipped_self: 0,
      skipped_active: 0,
      removed: 0,
      matched_subscriptions: 0,
    };
  }

  const triggerEmail = cleanEmail(triggeredBy);

  let attempted = 0;
  let sent = 0;
  let skippedSelf = 0;
  let skippedActive = 0;
  let removed = 0;

  for (const sub of subs || []) {
    const subEmail = cleanEmail(sub.user_email);

    if (suppressSelf && triggerEmail && subEmail && subEmail === triggerEmail) {
      skippedSelf += 1;
      continue;
    }

    // Important: active-device suppression stays at actual send time.
    if (isRecentlyActive(sub.last_seen_at)) {
      skippedActive += 1;
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
          triggered_by: triggeredBy,
          triggered_by_name: String(payload.triggered_by_name || "App"),
          target_user_id: targetUserId,
          target_user_email: targetUserEmail,
        }),
      );

      sent += 1;
    } catch (err: any) {
      console.error("push send failed:", err?.statusCode || err?.message || err);

      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await serviceDb.from("push_subscriptions").delete().eq("id", sub.id);
        removed += 1;
      }
    }
  }

  return {
    attempted,
    sent,
    skipped_self: skippedSelf,
    skipped_active: skippedActive,
    removed,
    matched_subscriptions: (subs || []).length,
  };
}

function extractTargetEmail(payload: Record<string, unknown>) {
  return (
    cleanEmail(payload.target_user_email) ||
    cleanEmail(payload.recipient_email) ||
    cleanEmail(payload.user_email) ||
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const suppliedSecret = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || suppliedSecret !== CRON_SECRET) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await serviceDb
      .from("delayed_notifications")
      .select(
        "id, game_id, event_key, title, message, payload, triggered_by, suppress_self, visible_after, sent_at, created_at, target_user_id",
      )
      .is("sent_at", null)
      .lte("visible_after", nowIso)
      .order("visible_after", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) {
      console.error("delayed_notifications lookup failed:", error);
      return json({ ok: false, error: "Failed to load delayed notifications" }, 500);
    }

    if (!rows || rows.length === 0) {
      return json({
        ok: true,
        processed: 0,
        skipped: 0,
        deduped: 0,
        failed: 0,
        push_attempted: 0,
        push_sent: 0,
        push_skipped_active: 0,
        matched_subscriptions: 0,
      });
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let deduped = 0;
    let pushAttempted = 0;
    let pushSent = 0;
    let pushSkippedActive = 0;
    let matchedSubscriptions = 0;

    for (const row of rows) {
      const claimTime = new Date().toISOString();

      const { data: claimedRow, error: claimError } = await serviceDb
        .from("delayed_notifications")
        .update({ sent_at: claimTime })
        .eq("id", row.id)
        .is("sent_at", null)
        .select("id")
        .maybeSingle();

      if (claimError) {
        console.error(`failed to claim delayed notification ${row.id}:`, claimError);
        failed += 1;
        continue;
      }

      if (!claimedRow) {
        skipped += 1;
        continue;
      }

      try {
        const title = cleanString(row.title);
        const message = cleanString(row.message);
        const eventKey = cleanString(row.event_key);
        const gameId = Number(row.game_id || 0);
        const triggeredBy = cleanString(row.triggered_by);
        const suppressSelf = row.suppress_self === true;
        const targetUserId = row.target_user_id ? String(row.target_user_id) : null;

        const storedPayload =
          row.payload && typeof row.payload === "object"
            ? (row.payload as Record<string, unknown>)
            : {};

        const targetUserEmail = extractTargetEmail(storedPayload);

        const visiblePayload = {
          ...storedPayload,
          title,
          message,
          tag: eventKey,
          visible_event_key: eventKey,
          url: String(storedPayload.url || "/"),
          game_id: gameId,
          triggered_by: triggeredBy,
          triggered_by_name: String(storedPayload.triggered_by_name || "App"),
          suppress_self: suppressSelf,
          target_user_id: targetUserId,
          target_user_email: targetUserEmail,
        };

        const insertedVisibleEvent = await logVisibleEvent(gameId, eventKey, visiblePayload);

        if (!insertedVisibleEvent) {
          deduped += 1;

          // Legacy/global row already visible means no more push needed.
          // Targeted rows may share a visible event, so still send the user-specific push.
          if (!targetUserId) {
            processed += 1;
            continue;
          }
        }

        const push = await sendPush(
          title,
          message,
          eventKey,
          gameId,
          triggeredBy,
          suppressSelf,
          visiblePayload,
          targetUserId,
          targetUserEmail,
        );

        processed += 1;
        pushAttempted += Number(push.attempted || 0);
        pushSent += Number(push.sent || 0);
        pushSkippedActive += Number(push.skipped_active || 0);
        matchedSubscriptions += Number(push.matched_subscriptions || 0);
      } catch (err) {
        console.error(`failed to dispatch delayed notification ${row.id}:`, err);

        await serviceDb
          .from("delayed_notifications")
          .update({ sent_at: null })
          .eq("id", row.id);

        failed += 1;
      }
    }

    return json({
      ok: true,
      processed,
      skipped,
      deduped,
      failed,
      push_attempted: pushAttempted,
      push_sent: pushSent,
      push_skipped_active: pushSkippedActive,
      matched_subscriptions: matchedSubscriptions,
    });
  } catch (err: any) {
    console.error("dispatch-delayed-notifications failed:", err);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});