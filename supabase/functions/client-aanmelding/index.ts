// Edge function: client-aanmelding
//
// Publiek aanmeldformulier voor nieuwe cliënten (Cliëntmodule 2.0 fase 1).
// De verwijzer/aanmelder is NIET ingelogd — deze functie draait daarom met
// verify_jwt=false (deploy: node scripts/deploy-functions.mjs client-aanmelding --no-verify-jwt)
// en gebruikt de service-role key om via de RPC `aanmelding_dien_in` (ALLEEN
// service-role) de aanmelding + tijdlijn-event aan te maken en documenten in de
// PRIVATE bucket `aanmelding-documenten` te zetten.
//
// Misbruik-mitigaties:
// - Honeypot-veld "website": gevuld ⇒ stil 200 met nep-referentie, geen insert.
// - ip_hash (SHA-256 van eerste x-forwarded-for-entry) gaat mee naar de RPC,
//   die server-side rate-limit ({ok:false, fout:'rate_limit'} ⇒ 429 hier).
// - Strikte whitelists: alleen bekende aanmelding-/contactpersoon-keys gaan
//   door; documenten met mime-allowlist + max 10 stuks + ~10MB per bestand.
// @ts-expect-error Deno-only remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// Whitelists (spiegelen het DB-contract van aanmelding_dien_in / client_aanmeldingen)
// ---------------------------------------------------------------------------

// Tekstvelden van de aanmelding die 1-op-1 worden doorgegeven aan de RPC.
const AANMELDING_KEYS: string[] = [
  "voornaam", "achternaam", "bsn", "geboortedatum", "geslacht",
  "adres", "postcode", "woonplaats", "gemeente", "nationaliteit",
  "verwijzer_organisatie", "verwijzer_naam", "verwijzer_functie",
  "verwijzer_telefoon", "verwijzer_email",
  "reden_aanmelding", "hulpvraag", "urgentie", "veiligheidsrisicos",
  "diagnoses", "huidige_hulpverlening", "school_dagbesteding",
  "gewenste_zorgvorm", "gewenste_startdatum",
];

const VERPLICHT: string[] = ["voornaam", "achternaam", "reden_aanmelding", "hulpvraag", "verwijzer_naam"];
const DATUM_VELDEN: string[] = ["geboortedatum", "gewenste_startdatum"];
const URGENTIES: string[] = ["laag", "middel", "hoog", "spoed"];

// Korte velden vs. vrije tekst — lengte-caps tegen misbruik op een publiek endpoint.
const LANGE_VELDEN: string[] = [
  "reden_aanmelding", "hulpvraag", "veiligheidsrisicos", "diagnoses",
  "huidige_hulpverlening", "school_dagbesteding",
];
const MAX_KORT = 300;
const MAX_LANG = 8000;

const CONTACT_KEYS: string[] = ["naam", "relatie", "gezaghebbend", "telefoon", "email", "adres", "contact_rol"];
const MAX_CONTACTPERSONEN = 10;

const MAX_DOCUMENTEN = 10;
// Base64 is ~4/3 van de bestandsgrootte: 14MB string ≈ 10MB bestand.
const MAX_BASE64_LEN = 14 * 1024 * 1024;
const MIME_ALLOWLIST: string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const BUCKET = "aanmelding-documenten";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanText(v: unknown, max: number): string {
  if (v === null || v === undefined) return "";
  return String(v).trim().slice(0, max);
}

function isIsoDateOrEmpty(v: string): boolean {
  return v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function safeFileName(raw: string): string {
  const cleaned = String(raw || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return cleaned || "bestand";
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    // Eventuele data-URL-prefix ("data:application/pdf;base64,") wegstrippen.
    const comma = b64.indexOf(",");
    const pure = b64.startsWith("data:") && comma > -1 ? b64.slice(comma + 1) : b64;
    const bin = atob(pure.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

interface DocIn {
  naam?: unknown;
  type?: unknown;
  mime?: unknown;
  size?: unknown;
  data_base64?: unknown;
}

interface ContactIn {
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, fout: "Methode niet toegestaan." }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, fout: "Ongeldige aanvraag." }, 400);
  }

  // Honeypot: bots vullen het verborgen "website"-veld — stil accepteren,
  // niets opslaan, nep-referentie terug zodat het script niets merkt.
  if (cleanText(body.website, 200) !== "") {
    return json({ ok: true, referentie: "AM-0000-0000" });
  }

  const rawAanmelding = (body.aanmelding && typeof body.aanmelding === "object")
    ? (body.aanmelding as Record<string, unknown>)
    : {};

  // 1. Aanmelding-velden whitelisten + normaliseren
  const aanmelding: Record<string, string> = {};
  for (const key of AANMELDING_KEYS) {
    const max = LANGE_VELDEN.includes(key) ? MAX_LANG : MAX_KORT;
    aanmelding[key] = cleanText(rawAanmelding[key], max);
  }

  // 2. Validatie
  for (const key of VERPLICHT) {
    if (!aanmelding[key]) {
      return json({ ok: false, fout: `Veld '${key}' is verplicht.` }, 400);
    }
  }
  for (const key of DATUM_VELDEN) {
    if (!isIsoDateOrEmpty(aanmelding[key])) {
      return json({ ok: false, fout: `Veld '${key}' moet een datum (JJJJ-MM-DD) zijn.` }, 400);
    }
  }
  if (aanmelding.urgentie && !URGENTIES.includes(aanmelding.urgentie)) {
    return json({ ok: false, fout: "Ongeldige urgentie." }, 400);
  }

  // 3. Contactpersonen: max 10, alleen bekende keys
  const rawContacten = Array.isArray(body.contactpersonen) ? (body.contactpersonen as ContactIn[]) : [];
  if (rawContacten.length > MAX_CONTACTPERSONEN) {
    return json({ ok: false, fout: `Maximaal ${MAX_CONTACTPERSONEN} contactpersonen.` }, 400);
  }
  const contactpersonen: Record<string, unknown>[] = [];
  for (const raw of rawContacten) {
    if (!raw || typeof raw !== "object") continue;
    const cp: Record<string, unknown> = {};
    for (const key of CONTACT_KEYS) {
      if (key === "gezaghebbend") cp[key] = raw[key] === true;
      else cp[key] = cleanText(raw[key], MAX_KORT);
    }
    contactpersonen.push(cp);
  }

  // 4. Documenten: max 10, mime-allowlist, base64-grootte-cap
  const rawDocs = Array.isArray(body.documenten) ? (body.documenten as DocIn[]) : [];
  if (rawDocs.length > MAX_DOCUMENTEN) {
    return json({ ok: false, fout: `Maximaal ${MAX_DOCUMENTEN} documenten.` }, 400);
  }
  for (const doc of rawDocs) {
    const mime = cleanText(doc && doc.mime, 120);
    if (!MIME_ALLOWLIST.includes(mime)) {
      return json({ ok: false, fout: "Bestandstype niet toegestaan (alleen PDF, JPG, PNG, Word, Excel)." }, 400);
    }
    const b64 = (doc && typeof doc.data_base64 === "string") ? doc.data_base64 : "";
    if (!b64) return json({ ok: false, fout: "Document zonder inhoud." }, 400);
    if (b64.length > MAX_BASE64_LEN) {
      return json({ ok: false, fout: "Bestand te groot (max 10 MB per document)." }, 400);
    }
  }

  // 5. IP-hash voor server-side rate-limiting in de RPC
  const fwd = String(req.headers.get("x-forwarded-for") || "");
  const ip = fwd.split(",")[0].trim();
  const ipHash = await sha256Hex(ip);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 6. Aanmelding indienen via service-role-RPC
  const p: Record<string, unknown> = { ...aanmelding, contactpersonen, ip_hash: ipHash };
  const rpcRes = await supabase.rpc("aanmelding_dien_in", { p });
  if (rpcRes.error) {
    console.error("[client-aanmelding] aanmelding_dien_in faalde:", rpcRes.error.message);
    return json({ ok: false, fout: "Aanmelding kon niet worden verwerkt." }, 400);
  }
  const result = (rpcRes.data || {}) as {
    ok?: boolean;
    fout?: string;
    aanmelding_id?: string;
    client_id?: string;
    referentie?: string;
  };
  if (!result.ok) {
    if (result.fout === "rate_limit") return json({ ok: false, fout: "rate_limit" }, 429);
    return json({ ok: false, fout: result.fout || "Aanmelding kon niet worden verwerkt." }, 400);
  }
  const aanmeldingId = String(result.aanmelding_id || "");
  const referentie = String(result.referentie || "");

  // 7. Documenten uploaden naar de private bucket. Fouten per bestand loggen
  //    en doorgaan — de aanmelding zelf is al geslaagd.
  const geslaagd: { naam: string; type: string; mime: string; size: number; storage_path: string }[] = [];
  for (let i = 0; i < rawDocs.length; i++) {
    const doc = rawDocs[i];
    const naam = cleanText(doc.naam, 200) || "Document";
    const type = cleanText(doc.type, 100);
    const mime = cleanText(doc.mime, 120);
    const bytes = decodeBase64(String(doc.data_base64 || ""));
    if (!bytes || bytes.byteLength === 0) {
      console.error(`[client-aanmelding] document ${i} (${naam}): base64-decoderen mislukt`);
      continue;
    }
    const path = `${aanmeldingId}/${i}-${safeFileName(naam)}`;
    const upRes = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (upRes.error) {
      console.error(`[client-aanmelding] upload document ${i} (${naam}) mislukt:`, upRes.error.message);
      continue;
    }
    geslaagd.push({ naam, type, mime, size: bytes.byteLength, storage_path: path });
  }

  if (geslaagd.length > 0) {
    const updRes = await supabase
      .from("client_aanmeldingen")
      .update({ documenten: geslaagd })
      .eq("id", aanmeldingId);
    if (updRes.error) {
      console.error("[client-aanmelding] documenten-metadata bijwerken mislukt:", updRes.error.message);
    }
  }

  return json({ ok: true, referentie });
});
