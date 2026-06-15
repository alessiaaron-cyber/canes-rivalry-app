import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const authDb = createClient(SUPABASE_URL, ANON_KEY);
const serviceDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DEFAULT_SCORING_RULES = {
  regular: { goal: 2, assist: 1, first_goal_bonus: 1 },
  playoffs: { goal: 2, assist: 1, first_goal_bonus: 1 },
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

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function seasonKeyFromLabel(label: string) {
  const raw = cleanText(label);
  const match = raw.match(/(\d{4})\D?(\d{2,4})/);
  if (!match) return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const start = match[1];
  const end = match[2].length === 2 ? `${start.slice(0, 2)}${match[2]}` : match[2];
  return `${start}${end}`;
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

async function loadActiveSeason() {
  const { data, error } = await serviceDb
    .from("seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function computeSeasonTotals(seasonId: number) {
  const { data, error } = await serviceDb
    .from("season_user_totals")
    .select("user_id, total_points")
    .eq("season_id", seasonId);

  if (error) throw error;

  return (data || []).reduce((acc: Record<string, number>, row: any) => {
    const userId = cleanText(row.user_id);
    if (userId) acc[userId] = Number(row.total_points || 0);
    return acc;
  }, {});
}

async function validateFirstPicker(firstPickerUserId: string | null) {
  if (!firstPickerUserId) return null;

  const { data, error } = await serviceDb
    .from("user_profiles")
    .select("id, display_name")
    .eq("id", firstPickerUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Selected first picker is not an active rivalry profile.");

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const allowed = await requireAllowedUser(user);
  if (!allowed.ok) return json({ ok: false, error: allowed.error }, allowed.status as number);

  try {
    const body = await req.json().catch(() => ({}));
    const displayName = cleanText(body.display_name || body.seasonLabel || body.season_label);
    const firstPickerUserId = cleanText(body.first_picker_user_id || body.firstPickerUserId) || null;

    if (!displayName) return json({ ok: false, error: "Missing season name" }, 400);

    const seasonKey = cleanText(body.season_key) || seasonKeyFromLabel(displayName);
    if (!seasonKey) return json({ ok: false, error: "Could not derive season key" }, 400);

    const firstPicker = await validateFirstPicker(firstPickerUserId);
    const activeSeason = await loadActiveSeason();
    const archivedTotals = activeSeason?.id ? await computeSeasonTotals(Number(activeSeason.id)) : {};

    if (activeSeason?.id) {
      const { error: archiveError } = await serviceDb
        .from("seasons")
        .update({
          is_active: false,
          total_source: "computed",
          regular_scoring_locked: true,
          playoff_scoring_locked: true,
          regular_scoring_locked_at: activeSeason.regular_scoring_locked_at || new Date().toISOString(),
          playoff_scoring_locked_at: activeSeason.playoff_scoring_locked_at || new Date().toISOString(),
        })
        .eq("id", activeSeason.id);

      if (archiveError) throw archiveError;
    }

    const { data: season, error: insertError } = await serviceDb
      .from("seasons")
      .insert({
        season_key: seasonKey,
        display_name: displayName,
        is_active: true,
        first_picker_user_id: firstPicker?.id || null,
        scoring_rules: body.scoring_rules && typeof body.scoring_rules === "object" ? body.scoring_rules : DEFAULT_SCORING_RULES,
        regular_scoring_locked: false,
        playoff_scoring_locked: false,
        total_source: "active",
      })
      .select("*")
      .single();

    if (insertError) {
      if ((insertError as any).code === "23505") {
        return json({ ok: false, error: `Season ${displayName} already exists.` }, 409);
      }
      throw insertError;
    }

    return json({
      ok: true,
      authorizedVia: "allowed_user",
      authorizedEmail: allowed.email,
      archived_season_id: activeSeason?.id || null,
      archived_totals: archivedTotals,
      season,
      first_picker_user_id: firstPicker?.id || null,
      first_picker: cleanText(firstPicker?.display_name) || null,
    });
  } catch (err) {
    console.error("start-new-season failed:", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});