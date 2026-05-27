// Supabase Edge Function: notify-vervallen-wettelijk-verlof
//
// Schiet een in-app notificatie naar elke medewerker met openstaande
// wettelijke verlofuren (medewerker_verlof_overgedragen.wet_beschikbaar > 0).
// Wettelijke uren vervallen wettelijk per 1 juli — deze notificatie is
// bedoeld om in april 3 maanden van tevoren te waarschuwen.
//
// Idempotent: skip als er al een notificatie van type
// 'verlof_vervalt_warning' bestaat voor de user in het lopende jaar.
//
// AANROEP:
//   - Handmatig vanaf Supabase dashboard ("Run function")
//   - Of via pg_cron job (1 april jaarlijks 09:00) — zie SQL-snippet in PR
//   - Of HTTP POST met optionele body `{ "dry_run": true }` voor preview
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (door Supabase auto-injected).

// @ts-expect-error Deno-only import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-expect-error Deno-only import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(k: string): string | undefined } };

interface RequestBody {
  dry_run?: boolean;
}

interface OvergedragenRow {
  id: string;
  medewerker_id: string;
  wet_beschikbaar: number;
  bovenwet_beschikbaar: number;
}

interface MedewerkerRow {
  id: string;
  email: string | null;
  voornaam: string | null;
  achternaam: string | null;
}

interface ProfileRow {
  id: string;
  email: string | null;
}

interface NotifRow {
  user_id: string;
  related_entity_id: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function fmtDagen(n: number): string {
  if (!isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1).replace(".", ",");
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let body: RequestBody = {};
  if (req.method === "POST") {
    try {
      body = await req.json() as RequestBody;
    } catch (_e) {
      body = {};
    }
  }
  const dryRun = !!body.dry_run;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return jsonResp({ error: "Missing env" }, 500);
  }
  const supa = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Alle overdrachten met openstaande wettelijke uren
  const overdrachtResp = await supa
    .from("medewerker_verlof_overgedragen")
    .select("id, medewerker_id, wet_beschikbaar, bovenwet_beschikbaar")
    .gt("wet_beschikbaar", 0);
  if (overdrachtResp.error) {
    return jsonResp({ error: overdrachtResp.error.message }, 500);
  }
  const overdrachten = (overdrachtResp.data || []) as OvergedragenRow[];
  if (overdrachten.length === 0) {
    return jsonResp({ ok: true, processed: 0, message: "Geen openstaande wettelijke uren." });
  }

  // 2) Medewerkers (HR-tabel) → email per medewerker_id
  const empIds = Array.from(new Set(overdrachten.map((o) => o.medewerker_id))).filter(Boolean);
  const mwResp = await supa
    .from("medewerkers")
    .select("id, email, voornaam, achternaam")
    .in("id", empIds)
    .eq("archived", false);
  if (mwResp.error) {
    return jsonResp({ error: mwResp.error.message }, 500);
  }
  const mwById = new Map<string, MedewerkerRow>();
  (mwResp.data || []).forEach((m) => mwById.set(String(m.id), m as MedewerkerRow));

  // 3) Profielen — match op email (lower-case)
  const emails = Array.from(new Set(
    Array.from(mwById.values())
      .map((m) => (m.email || "").trim().toLowerCase())
      .filter(Boolean),
  ));
  const profById = new Map<string, ProfileRow>();
  if (emails.length > 0) {
    const profResp = await supa
      .from("profiles")
      .select("id, email")
      .in("email", emails);
    if (profResp.error) {
      return jsonResp({ error: profResp.error.message }, 500);
    }
    (profResp.data || []).forEach((p) => {
      const key = (p.email || "").trim().toLowerCase();
      if (key) profById.set(key, p as ProfileRow);
    });
  }

  // 4) Bestaande notificaties van dit jaar (idempotency)
  const year = new Date().getUTCFullYear();
  const yearStart = `${year}-01-01T00:00:00Z`;
  const existResp = await supa
    .from("notifications")
    .select("user_id, related_entity_id")
    .eq("type", "verlof_vervalt_warning")
    .gte("created_at", yearStart);
  if (existResp.error) {
    return jsonResp({ error: existResp.error.message }, 500);
  }
  const existKey = new Set<string>(
    ((existResp.data || []) as NotifRow[]).map((n) => `${n.user_id}:${n.related_entity_id}`),
  );

  // 5) Bouw inserts
  const inserts: Array<Record<string, unknown>> = [];
  const skipped: Array<{ medewerker_id: string; reason: string }> = [];
  for (const o of overdrachten) {
    const mw = mwById.get(String(o.medewerker_id));
    if (!mw) {
      skipped.push({ medewerker_id: o.medewerker_id, reason: "medewerker niet gevonden of gearchiveerd" });
      continue;
    }
    const emailKey = (mw.email || "").trim().toLowerCase();
    const prof = emailKey ? profById.get(emailKey) : null;
    if (!prof) {
      skipped.push({ medewerker_id: o.medewerker_id, reason: "geen matchend profiel op email" });
      continue;
    }
    const key = `${prof.id}:${o.id}`;
    if (existKey.has(key)) {
      skipped.push({ medewerker_id: o.medewerker_id, reason: "dit jaar al gewaarschuwd" });
      continue;
    }
    inserts.push({
      user_id: prof.id,
      type: "verlof_vervalt_warning",
      title: "Wettelijk verlof vervalt 1 juli",
      body: `Je hebt nog ${fmtDagen(o.wet_beschikbaar)} dagen wettelijk verlof open uit het vorige jaar. Plan ze in vóór 1 juli, anders vervallen ze.`,
      related_entity_type: "medewerker_verlof_overgedragen",
      related_entity_id: o.id,
    });
  }

  if (dryRun) {
    return jsonResp({
      ok: true,
      dry_run: true,
      would_insert: inserts.length,
      skipped: skipped.length,
      skipped_details: skipped.slice(0, 20),
      sample_insert: inserts[0] || null,
    });
  }

  let inserted = 0;
  if (inserts.length > 0) {
    const insResp = await supa.from("notifications").insert(inserts);
    if (insResp.error) {
      return jsonResp({ error: insResp.error.message }, 500);
    }
    inserted = inserts.length;
  }

  return jsonResp({
    ok: true,
    processed: overdrachten.length,
    inserted,
    skipped: skipped.length,
  });
});
