// Edge function: onboarding-inwerken
//
// Publieke, token-gevalideerde inwerk-pagina voor nieuwe medewerkers
// (onboarding-inwerken.html). De medewerker is NIET ingelogd; validatie loopt
// via het upload_token uit onboarding_trajecten (de link = het geheim). Toont de
// inwerk-onderdelen voor de doelgroep van de medewerker en legt per onderdeel
// "gelezen + akkoord" vast in `inwerk_voortgang` (met IP-audit). Draait met de
// service-role key; verify_jwt blijft aan (de pagina stuurt de publieke anon-key mee).
//
//   { action: "info",    token }                     → { voornaam, doelgroep, items[] }
//   { action: "akkoord", token, itemId, akkoord }    → { ok, akkoord }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Spiegelt onbRequiredDocsKey() in medewerker.js — bepaalt de doelgroep van de medewerker.
function doelgroepKey(dienstverband: string, inhuurtype: string): string {
  const dv = String(dienstverband || "").toLowerCase();
  if (dv.indexOf("loondienst") !== -1) return "loondienst";
  if (dv.indexOf("stagi") !== -1) return "stagiair";
  if (dv.indexOf("inhuur") !== -1) {
    const it = String(inhuurtype || "").toLowerCase();
    if (it.indexOf("zzp") !== -1) return "zzp";
    return "inhuur";
  }
  return "loondienst";
}

function itemMatchesDoelgroep(itemDoelgroep: string, key: string): boolean {
  const d = String(itemDoelgroep || "alle");
  return d === "alle" || d === key;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan." }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }

  const action = String(body.action || "");
  const token = String(body.token || "");
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return json({ error: "Ongeldige link." }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Token valideren tegen onboarding_trajecten (de link = het geheim).
  const tRes = await supabase
    .from("onboarding_trajecten")
    .select("id, medewerker_id, status")
    .eq("upload_token", token)
    .maybeSingle();
  if (tRes.error || !tRes.data) return json({ error: "Deze link is niet (meer) geldig." }, 404);
  const traject = tRes.data as { id: string; medewerker_id: string; status: string };

  const mwRes = await supabase
    .from("medewerkers")
    .select("voornaam, achternaam, dienstverband, data")
    .eq("id", traject.medewerker_id)
    .maybeSingle();
  const mw = (mwRes.data || {}) as { voornaam?: string; achternaam?: string; dienstverband?: string; data?: Record<string, unknown> };
  const inhuurtype = String((mw.data && (mw.data as Record<string, unknown>).inhuurtype) || "");
  const key = doelgroepKey(mw.dienstverband || "", inhuurtype);

  // Alle (niet-gearchiveerde) items voor deze doelgroep, gesorteerd op volgorde.
  const iRes = await supabase
    .from("inwerk_items")
    .select("id, titel, type, url, beschrijving, doelgroep, verplicht, volgorde, archived")
    .eq("archived", false)
    .order("volgorde", { ascending: true });
  const allItems = (iRes.data || []) as Array<{
    id: string; titel: string; type: string; url: string; beschrijving: string;
    doelgroep: string; verplicht: boolean; volgorde: number; archived: boolean;
  }>;
  const items = allItems.filter((it) => itemMatchesDoelgroep(it.doelgroep, key));

  // Voortgang van deze medewerker.
  const vRes = await supabase
    .from("inwerk_voortgang")
    .select("inwerk_item_id, gelezen_akkoord, akkoord_op")
    .eq("medewerker_id", String(traject.medewerker_id));
  const voortgang = (vRes.data || []) as Array<{ inwerk_item_id: string; gelezen_akkoord: boolean; akkoord_op: string | null }>;
  const akkoordMap = new Map<string, { akkoord: boolean; op: string | null }>();
  for (const v of voortgang) akkoordMap.set(String(v.inwerk_item_id), { akkoord: !!v.gelezen_akkoord, op: v.akkoord_op });

  if (action === "info") {
    return json({
      voornaam: mw.voornaam || "",
      doelgroep: key,
      items: items.map((it) => {
        const a = akkoordMap.get(String(it.id));
        return {
          id: it.id,
          titel: it.titel || "",
          type: it.type || "video",
          url: it.url || "",
          beschrijving: it.beschrijving || "",
          verplicht: it.verplicht !== false,
          akkoord: a ? a.akkoord : false,
          akkoordOp: a ? a.op : null,
        };
      }),
    });
  }

  if (action === "akkoord") {
    const itemId = String(body.itemId || "");
    const akkoord = body.akkoord !== false; // default true
    if (!/^[0-9a-fA-F-]{36}$/.test(itemId)) return json({ error: "Ongeldig onderdeel." }, 400);

    // Het item moet bestaan, niet gearchiveerd zijn én bij deze doelgroep horen.
    const match = items.find((it) => String(it.id) === itemId);
    if (!match) return json({ error: "Dit onderdeel hoort niet bij jouw inwerktraject." }, 400);

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const naam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();

    const up = await supabase
      .from("inwerk_voortgang")
      .upsert({
        medewerker_id: String(traject.medewerker_id),
        inwerk_item_id: itemId,
        gelezen_akkoord: akkoord,
        akkoord_naam: akkoord ? naam : "",
        akkoord_op: akkoord ? new Date().toISOString() : null,
        ip_adres: akkoord ? (ip || null) : null,
      }, { onConflict: "medewerker_id,inwerk_item_id" });
    if (up.error) return json({ error: "Opslaan mislukt: " + up.error.message }, 500);

    return json({ ok: true, akkoord });
  }

  return json({ error: "Onbekende actie." }, 400);
});
