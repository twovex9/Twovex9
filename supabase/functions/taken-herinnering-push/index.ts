// Supabase Edge Function: taken-herinnering-push
// Gerichte Web Push voor taak-deadline-herinneringen. Wordt server-side
// getriggerd door public.taken_deadline_herinneringen() via pg_net met een
// gedeelde cron-secret (GEEN user-JWT -> verify_jwt = false). Pusht per
// notificatie naar de push_subscriptions van DIE ene gebruiker (de toegewezen
// medewerker). De in-app notificatie bestaat dan al; dit is enkel het
// telefoon-signaal er bovenop. Patroon gekopieerd van `send-push`.

// @ts-expect-error Deno-only import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-expect-error Deno-only import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error npm import
import webpush from "npm:web-push@3.6.7";

declare const Deno: { env: { get(k: string): string | undefined } };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } });
}

interface RequestBody { notification_ids?: string[]; dry_run?: boolean; }
interface NotifRow { id: string; user_id: string; title: string; body: string | null; related_entity_id: string | null; }
interface SubRow { user_id: string; endpoint: string; p256dh: string; auth: string; }

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return jsonResp({ error: "Missing env" }, 500);
  const supa = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Cron-secret check (geen user-JWT; deze functie draait alleen server-side).
  const provided = req.headers.get("x-cron-secret") || "";
  const secResp = await supa.from("private_app_config").select("waarde").eq("sleutel", "taken_push_cron_secret").maybeSingle();
  if (secResp.error) return jsonResp({ error: secResp.error.message }, 500);
  const expected = (secResp.data && secResp.data.waarde) || "";
  if (!expected || provided !== expected) return jsonResp({ error: "Niet geautoriseerd" }, 401);

  // 2. Input.
  let body: RequestBody = {};
  try { body = (await req.json()) as RequestBody; } catch (_e) { body = {}; }
  const dryRun = !!body.dry_run;
  const ids = Array.isArray(body.notification_ids) ? body.notification_ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) return jsonResp({ ok: true, push_verstuurd: 0, message: "Geen notification_ids meegegeven" });

  // 3. De betreffende notificaties (alleen taak-deadline-herinneringen).
  const nResp = await supa.from("notifications").select("id, user_id, title, body, related_entity_id, type").in("id", ids).eq("type", "taak_deadline_herinnering");
  if (nResp.error) return jsonResp({ error: nResp.error.message }, 500);
  const notifs = (nResp.data || []) as NotifRow[];
  if (notifs.length === 0) return jsonResp({ ok: true, push_verstuurd: 0, message: "Geen passende notificaties" });

  // 4. Push-subscriptions van de betrokken gebruikers.
  const userIds = Array.from(new Set(notifs.map((n) => n.user_id).filter(Boolean)));
  const subsResp = await supa.from("push_subscriptions").select("user_id, endpoint, p256dh, auth").in("user_id", userIds);
  if (subsResp.error) return jsonResp({ error: subsResp.error.message }, 500);
  const subsByUser = new Map<string, SubRow[]>();
  (subsResp.data || []).forEach((s) => {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push(s as SubRow);
    subsByUser.set(s.user_id, arr);
  });

  if (dryRun) {
    let zou = 0;
    notifs.forEach((n) => { zou += (subsByUser.get(n.user_id) || []).length; });
    return jsonResp({ ok: true, dry_run: true, notificaties: notifs.length, betrokken_users: userIds.length, users_met_subscription: subsByUser.size, zou_push_versturen: zou });
  }

  // 5. VAPID.
  const cfgResp = await supa.from("private_app_config").select("sleutel, waarde").in("sleutel", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
  if (cfgResp.error) return jsonResp({ error: cfgResp.error.message }, 500);
  const cfg: Record<string, string> = {};
  (cfgResp.data || []).forEach((r: { sleutel: string; waarde: string }) => { cfg[r.sleutel] = r.waarde; });
  if (!cfg.vapid_public_key || !cfg.vapid_private_key) return jsonResp({ error: "VAPID niet geconfigureerd" }, 500);
  webpush.setVapidDetails(cfg.vapid_subject || "mailto:info@embracethefuture.nl", cfg.vapid_public_key, cfg.vapid_private_key);

  // 6. Versturen: per notificatie naar de subs van die ene gebruiker.
  let verstuurd = 0;
  let mislukt = 0;
  for (const n of notifs) {
    const subs = subsByUser.get(n.user_id) || [];
    if (subs.length === 0) continue;
    const payload = JSON.stringify({ title: n.title, body: n.body || "", url: "/taken", tag: "taak-" + (n.related_entity_id || n.id) });
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); verstuurd++; }
      catch (_e) { mislukt++; }
    }
  }

  return jsonResp({ ok: true, notificaties: notifs.length, push_verstuurd: verstuurd, push_mislukt: mislukt });
});
