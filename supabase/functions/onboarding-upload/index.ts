// Edge function: onboarding-upload
//
// Publieke, token-gevalideerde document-upload voor de zelfservice-uploadpagina
// (onboarding-upload.html). De nieuwe medewerker is NIET ingelogd; validatie
// gebeurt via het upload_token uit onboarding_trajecten (de link = het geheim).
// Draait met de service-role key zodat hij voorbij RLS in de bucket + tabel mag
// schrijven. verify_jwt blijft aan (de pagina stuurt de publieke anon-key mee).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TYPES = ["Contract", "Opleiding", "VOG", "ID", "Addendum", "Overig"];
const MAX_BYTES = 20 * 1024 * 1024;
const BUCKET = "medewerker-documenten";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ongeldige aanvraag." }, 400);
  }

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
    .select("voornaam, dienstverband")
    .eq("id", traject.medewerker_id)
    .maybeSingle();
  const mw = (mwRes.data || {}) as { voornaam?: string; dienstverband?: string };

  if (action === "info") {
    const dRes = await supabase
      .from("medewerker_documenten")
      .select("naam, type, archived")
      .eq("medewerker_id", String(traject.medewerker_id));
    const uploaded = (dRes.data || [])
      .filter((d: { archived?: boolean }) => !d.archived)
      .map((d: { naam?: string; type?: string }) => ({ naam: d.naam || "", type: d.type || "" }));
    return json({
      voornaam: mw.voornaam || "",
      dienstverband: mw.dienstverband || "",
      status: traject.status,
      allowedTypes: ALLOWED_TYPES,
      uploaded,
    });
  }

  if (action === "upload") {
    const naam = String(body.naam || "").trim();
    const type = String(body.type || "").trim();
    const fileName = String(body.fileName || "bestand").trim() || "bestand";
    const fileMime = String(body.fileMime || "application/octet-stream");
    const fileBase64 = String(body.fileBase64 || "");
    const vervaldatum = String(body.vervaldatum || "");

    if (!naam) return json({ error: "Geef het document een naam." }, 400);
    if (ALLOWED_TYPES.indexOf(type) === -1) return json({ error: "Kies een geldig type." }, 400);
    if (!fileBase64) return json({ error: "Selecteer een bestand." }, 400);

    let bytes: Uint8Array;
    try {
      const bin = atob(fileBase64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return json({ error: "Bestand kon niet verwerkt worden." }, 400);
    }
    if (bytes.byteLength === 0) return json({ error: "Leeg bestand." }, 400);
    if (bytes.byteLength > MAX_BYTES) return json({ error: "Bestand te groot (max 20 MB)." }, 400);

    const docId = crypto.randomUUID();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "bestand";
    const path = `${traject.medewerker_id}/${docId}-${safeName}`;

    const upRes = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: fileMime,
      upsert: false,
    });
    if (upRes.error) return json({ error: "Upload mislukt: " + upRes.error.message }, 500);

    const insRes = await supabase.from("medewerker_documenten").insert({
      id: docId,
      medewerker_id: String(traject.medewerker_id),
      naam: naam,
      type: type,
      vervaldatum: vervaldatum,
      file_name: fileName,
      file_mime: fileMime,
      storage_path: path,
    });
    if (insRes.error) return json({ error: "Opslaan mislukt: " + insRes.error.message }, 500);

    return json({ ok: true });
  }

  return json({ error: "Onbekende actie." }, 400);
});
