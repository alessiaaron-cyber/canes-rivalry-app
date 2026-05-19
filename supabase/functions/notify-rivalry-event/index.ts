import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const authDb = createClient(SUPABASE_URL, ANON_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ACTIVE_DEVICE_SKIP_SECONDS = 75;
const DEFAULT_PUSH_DELAY_SECONDS = 90;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(value: unknown) {
  return String(value || "").toLowerCase().trim();
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
  const userEmail = cleanEmail(user?.email);
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

function isRecentlyActive(lastSeenAt: unknown) {
  if (!lastSeenAt) return false;

  const lastSeenMs = new Date(String(lastSeenAt)).getTime();
  if (!Number.isFinite(lastSeenMs)) return false;

  const ageSeconds = (Date.now() - lastSeenMs) / 1000;
  return ageSeconds >= 0 && ageSeconds <= ACTIVE_DEVICE_SKIP_SECONDS;
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

function isTestNotification(eventKey: string, title: string) {
  const key = String(eventKey || "").toLowerCase().trim();
  const t = String(title || "").toLowerCase().trim();

  return (
    key === "test-push" ||
    key.startsWith("test-push-") ||
    key.includes("test-settings-push") ||
    t.includes("test")
  );
}

async function loadRecipients(): Promise<Recipient[]> {
  const { data, error } = await serviceDb
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

  const { data, error } = await serviceDb
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

async function logOnce(gameId: number, eventKey: string, payload: Record<string, unknown>) {
  const { error } = await serviceDb.from("rivalry_events").insert({
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

async function enqueueDelayedNotification(
  gameId: number,
  eventKey: string,
  title: string,
  message: string,
  payload: Record<string, unknown>,
  triggeredBy: string,
  suppressSelf: boolean,
  recipient: Recipient,
  delaySeconds: number,
) {
  const visibleAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { error } = await serviceDb.from("delayed_notifications").insert({
    game_id: gameId,
    event_key: eventKey,
    title,
    message,
    payload: {
      ...payload,
      target_user_id: recipient.user_id,
      target_user_email: recipient.user_email,
      delay_seconds_applied: delaySeconds,
    },
    triggered_by: triggeredBy,
    suppress_self: suppressSelf,
    visible_after: visibleAfter,
    target_user_id: recipient.user_id,
  });

  if (!error) return { inserted: true, visible_after: visibleAfter };
  if ((error as any).code === "23505") return { inserted: false, visible_after: visibleAfter };

  console.error("delayed_notifications insert failed:", error);
  throw error;
}

async function loadSubscriptions(targetUserId: string | null, targetEmail: string | null) {
  if (targetUserId) {
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
  }

  if (targetEmail) {
    const { data: emailSubs, error: emailError } = await serviceDb
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
  triggeredBy: string,
  suppressSelf: boolean,
  payload: Record<string, unknown>,
  recipient: Recipient,
  bypassActiveDeviceCheck = false,
) {
  const { subs, error } = await loadSubscriptions(recipient.user_id, recipient.user_email);

  if (error) {
    return { attempted: 0, sent: 0, skipped_self: 0, skipped_active: 0, removed: 0 };
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

    if (!bypassActiveDeviceCheck && isRecentlyActive(sub.last_seen_at)) {
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
          target_user_id: recipient.user_id,
          target_user_email: recipient.user_email,
          bypass_active_device_check: bypassActiveDeviceCheck,
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

  return { attempted, sent, skipped_self: skippedSelf, skipped_active: skippedActive, removed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const user = await getUser(req);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const allowed = await requireAllowedUser(user);
  if (!allowed.ok) {
    return json({ ok: false, error: allowed.error }, allowed.status as number);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const gameId = Number(body?.game_id);
    const title = String(body?.title || "").trim();
    const message = String(body?.message || "").trim();
    const eventKey = String(body?.event_key || "").trim();
    const suppressSelf = body?.suppress_self === true;

    const delayVisible = body?.delay_visible === true;
    const testNotification = isTestNotification(eventKey, title);

    const bypassDelay =
      body?.bypass_delay === true ||
      !delayVisible;

    const bypassActiveDeviceCheck =
      body?.bypass_active_device_check === true ||
      (testNotification && bypassDelay);

    if (!gameId) return json({ ok: false, error: "Missing game_id" }, 400);
    if (!title) return json({ ok: false, error: "Missing title" }, 400);
    if (!message) return json({ ok: false, error: "Missing message" }, 400);
    if (!eventKey) return json({ ok: false, error: "Missing event_key" }, 400);

    const triggeredBy = allowed.email as string;

    const basePayload = {
      title,
      message,
      tag: eventKey,
      url: "/",
      game_id: gameId,
      triggered_by: triggeredBy,
      triggered_by_name: "App",
      suppress_self: suppressSelf,
      delay_visible: delayVisible,
      bypass_delay: bypassDelay,
      bypass_active_device_check: bypassActiveDeviceCheck,
      test_notification: testNotification,
    };

    const recipients = await loadRecipients();
    const userIds = recipients.map((r) => r.user_id).filter(Boolean) as string[];
    const settingsByUserId = await loadSettingsByUserId(userIds);

    let delayedCount = 0;
    let delayedDeduped = 0;
    let skippedDisabled = 0;
    let skippedSelf = 0;
    let immediateRecipients = 0;

    let pushAttempted = 0;
    let pushSent = 0;
    let pushSkippedSelf = 0;
    let pushSkippedActive = 0;
    let pushRemoved = 0;

    let visibleAfter: string | null = null;
    let insertedVisibleEvent = false;
    let dedupedVisibleEvent = false;

    const immediateQueue: Recipient[] = [];

    for (const recipient of recipients) {
      const recipientEmail = cleanEmail(recipient.user_email);

      if (suppressSelf && recipientEmail && recipientEmail === triggeredBy) {
        skippedSelf += 1;
        continue;
      }

      const settings = recipient.user_id
        ? settingsByUserId.get(recipient.user_id) || normalizeSettings(null)
        : normalizeSettings(null);

      if (!settings.push_enabled) {
        skippedDisabled += 1;
        continue;
      }

      const delaySeconds = bypassDelay ? 0 : settings.push_delay_seconds;

      if (delayVisible && delaySeconds > 0) {
        const queued = await enqueueDelayedNotification(
          gameId,
          eventKey,
          title,
          message,
          basePayload,
          triggeredBy,
          suppressSelf,
          recipient,
          delaySeconds,
        );

        delayedCount += queued.inserted ? 1 : 0;
        delayedDeduped += queued.inserted ? 0 : 1;
        visibleAfter = visibleAfter || queued.visible_after;
      } else {
        immediateQueue.push(recipient);
      }
    }

    if (immediateQueue.length > 0) {
      insertedVisibleEvent = await logOnce(gameId, eventKey, basePayload);
      dedupedVisibleEvent = !insertedVisibleEvent;

      if (insertedVisibleEvent) {
        for (const recipient of immediateQueue) {
          const push = await sendPushToRecipient(
            title,
            message,
            eventKey,
            gameId,
            triggeredBy,
            suppressSelf,
            basePayload,
            recipient,
            bypassActiveDeviceCheck,
          );

          immediateRecipients += 1;
          pushAttempted += Number(push.attempted || 0);
          pushSent += Number(push.sent || 0);
          pushSkippedSelf += Number(push.skipped_self || 0);
          pushSkippedActive += Number(push.skipped_active || 0);
          pushRemoved += Number(push.removed || 0);
        }
      }
    }

    return json({
      ok: true,
      delayed: delayedCount > 0,
      deduped: dedupedVisibleEvent && delayedDeduped > 0,
      notification: {
        title,
        message,
        event_key: eventKey,
        visible_after: visibleAfter,
        routing: {
          recipients: recipients.length,
          immediate_recipients: immediateRecipients,
          delayed_recipients: delayedCount,
          delayed_deduped: delayedDeduped,
          skipped_disabled: skippedDisabled,
          skipped_self: skippedSelf,
          bypass_delay: bypassDelay,
          bypass_active_device_check: bypassActiveDeviceCheck,
          test_notification: testNotification,
        },
        push: {
          attempted: pushAttempted,
          sent: pushSent,
          skipped_self: pushSkippedSelf,
          skipped_active: pushSkippedActive,
          removed: pushRemoved,
        },
      },
    });
  } catch (err: any) {
    console.error("notify-rivalry-event failed:", err);
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});