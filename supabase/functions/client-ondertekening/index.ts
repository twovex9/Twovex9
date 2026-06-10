// Edge function: client-ondertekening
//
// Publieke digitale-ondertekening-flow (Cliëntmodule 2.0 fase 2). De
// ondertekenaar (cliënt/ouder/gezaghebbende/voogd) is NIET ingelogd — deze
// functie draait daarom met verify_jwt=false
// (deploy: node scripts/deploy-functions.mjs client-ondertekening --no-verify-jwt)
// en gebruikt de service-role key voor de SERVICE-ROLE-ONLY RPC's
// `ondertekening_info` (GET ?token=...) en `ondertekening_dien_in` (POST).
//
// Na een geslaagde indiening (best-effort, fouten blokkeren de ondertekening
// nooit): handtekening-PNG + samengestelde PDF naar de PRIVATE bucket
// `client-ondertekeningen` en de storage-paden terugschrijven op
// `client_ondertekeningen`.
// @ts-expect-error Deno-only remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error Deno-only remote import
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const BUCKET = "client-ondertekeningen";
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// Base64 van de PNG-magic-bytes (\x89PNG\r\n\x1a\n) — verplichte prefix.
const PNG_B64_PREFIX = "iVBORw0KGgo";
const MAX_PNG_B64_LEN = 3 * 1024 * 1024; // ~3MB string ≈ ~2,2MB PNG

const TYPE_LABELS: Record<string, string> = {
  client: "cliënt",
  ouder: "ouder",
  gezaghebbende: "gezaghebbende",
  voogd: "voogd",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// fout-slug → HTTP-status voor POST-antwoorden (GET geeft altijd 200 door).
function foutStatus(fout: unknown): number {
  const f = String(fout || "");
  return (f === "verlopen" || f === "ondertekend" || f === "ingetrokken") ? 410 : 400;
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
    const bin = atob(b64.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// body_html (allowlist-gesanitized aan de beheerkant) → platte tekst voor de PDF.
function htmlToText(html: string): string {
  let s = String(html || "");
  s = s.replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/tr|\/ul|\/ol|\/blockquote)\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, "\n- ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// Nu in Europese/Nederlandse tijd als "DD-MM-YYYY HH:MM" (edge draait in UTC).
function nlNuTijd(): string {
  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

// Verwijder tekens die StandardFonts (WinAnsi) niet kan coderen.
function pdfSafe(s: string): string {
  return String(s || "")
    .replace(/—/g, "-").replace(/–/g, "-")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/…/g, "...").replace(/ /g, " ");
}

function wrapLines(text: string, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    if (para.trim() === "") { out.push(""); continue; }
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? line + " " + word : word;
      let w = 0;
      try { w = font.widthOfTextAtSize(test, size); } catch { w = test.length * size * 0.5; }
      if (w > maxWidth && line) { out.push(line); line = word; } else { line = test; }
    }
    out.push(line);
  }
  return out;
}

async function buildVerklaringPdf(opts: {
  titel: string;
  tekst: string;
  ondertekendRegel: string;
  pngBytes: Uint8Array | null;
  referentie: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageW = 595, pageH = 842, margin = 56, size = 10, lh = 14;
  const maxW = pageW - margin * 2;
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;
  const ensureRoom = (need: number) => {
    if (y - need < margin + 30) { page = pdf.addPage([pageW, pageH]); y = pageH - margin; }
  };
  const draw = (txt: string, f: any, sz: number, extra = 0) => {
    ensureRoom(lh);
    try { page.drawText(txt, { x: margin, y, size: sz, font: f, color: rgb(0.1, 0.1, 0.1) }); } catch { /* skip onrenderbaar */ }
    y -= lh + extra;
  };

  draw("Embrace the Future", bold, 14, 4);
  draw(pdfSafe(opts.titel), bold, 12, 6);
  for (const ln of wrapLines(opts.tekst, font, size, maxW)) draw(ln, font, size);
  y -= 12;
  draw(pdfSafe(opts.ondertekendRegel), bold, 10, 2);

  if (opts.pngBytes) {
    try {
      const img = await pdf.embedPng(opts.pngBytes);
      const scale = Math.min(240 / img.width, 90 / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      ensureRoom(h + 8);
      page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
      y -= h + lh;
    } catch (e) {
      console.error("[client-ondertekening] handtekening-PNG embedden in PDF mislukt:", e);
    }
  }

  // Voettekst met referentie-id op elke pagina.
  const foot = pdfSafe("Embrace the Future - digitale ondertekening - referentie " + opts.referentie);
  for (const p of pdf.getPages()) {
    try { p.drawText(foot, { x: margin, y: 28, size: 8, font, color: rgb(0.45, 0.45, 0.45) }); } catch { /* skip */ }
  }

  return await pdf.save();
}

// ---------------------------------------------------------------------------
// GET ?token=<uuid> → ondertekening_info doorgeven (200, ook bij {ok:false}).
// ---------------------------------------------------------------------------

async function handleGet(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!UUID_RE.test(token)) return json({ ok: false, fout: "onbekend" }, 200);

  const supabase = serviceClient();
  const res = await supabase.rpc("ondertekening_info", { p_token: token });
  if (res.error) {
    console.error("[client-ondertekening] ondertekening_info faalde:", res.error.message);
    return json({ ok: false, fout: "server" }, 500);
  }
  return json(res.data ?? { ok: false, fout: "onbekend" }, 200);
}

// ---------------------------------------------------------------------------
// POST {token, handtekening_png_base64} → indienen + PNG/PDF best-effort.
// ---------------------------------------------------------------------------

async function handlePost(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, fout: "ongeldige_aanvraag" }, 400);
  }

  const token = String(body.token || "");
  if (!UUID_RE.test(token)) return json({ ok: false, fout: "onbekend" }, 400);

  const b64 = typeof body.handtekening_png_base64 === "string"
    ? body.handtekening_png_base64.trim()
    : "";
  if (!b64) return json({ ok: false, fout: "handtekening_verplicht" }, 400);
  if (b64.length > MAX_PNG_B64_LEN) return json({ ok: false, fout: "handtekening_te_groot" }, 400);
  if (!b64.startsWith(PNG_B64_PREFIX)) return json({ ok: false, fout: "handtekening_ongeldig" }, 400);
  const pngBytes = decodeBase64(b64);
  if (!pngBytes || pngBytes.byteLength < 8 || pngBytes[0] !== 0x89 || pngBytes[1] !== 0x50) {
    return json({ ok: false, fout: "handtekening_ongeldig" }, 400);
  }

  const supabase = serviceClient();

  // 1. Verklaringtekst vooraf ophalen — dien_in geeft alleen de titel terug,
  //    de PDF heeft de volledige body_html (als platte tekst) nodig.
  const infoRes = await supabase.rpc("ondertekening_info", { p_token: token });
  if (infoRes.error) {
    console.error("[client-ondertekening] ondertekening_info (pre-dien_in) faalde:", infoRes.error.message);
    return json({ ok: false, fout: "server" }, 500);
  }
  const info = (infoRes.data || {}) as Record<string, unknown>;
  if (!info.ok) {
    const fout = String(info.fout || "onbekend");
    return json({ ok: false, fout }, foutStatus(fout));
  }

  // 2. Indienen via de service-role-RPC (zet status, ondertekend_op, audit).
  const fwd = String(req.headers.get("x-forwarded-for") || "");
  const ip = fwd.split(",")[0].trim();
  const ipHash = await sha256Hex(ip);
  const userAgent = String(req.headers.get("user-agent") || "").slice(0, 300);

  const dienRes = await supabase.rpc("ondertekening_dien_in", {
    p: { token, ip_hash: ipHash, user_agent: userAgent },
  });
  if (dienRes.error) {
    console.error("[client-ondertekening] ondertekening_dien_in faalde:", dienRes.error.message);
    return json({ ok: false, fout: "server" }, 500);
  }
  const dien = (dienRes.data || {}) as Record<string, unknown>;
  if (!dien.ok) {
    const fout = String(dien.fout || "onbekend");
    return json({ ok: false, fout }, foutStatus(fout));
  }

  const id = String(dien.id || "");
  const verklaringType = String(dien.verklaring_type || "verklaring");
  const naam = String(dien.ondertekenaar_naam || info.ondertekenaar_naam || "");
  const typeSlug = String(dien.ondertekenaar_type || info.ondertekenaar_type || "");
  const typeLabel = TYPE_LABELS[typeSlug] || typeSlug || "ondertekenaar";
  const titel = String(dien.titel || info.titel || "Verklaring");

  // 3. Best-effort: PNG + PDF uploaden en paden terugschrijven. Fouten hier
  //    worden alleen gelogd — de ondertekening zelf is al geldig vastgelegd.
  const patch: Record<string, string> = {};

  try {
    const pngPath = `${id}/handtekening.png`;
    const upPng = await supabase.storage.from(BUCKET).upload(pngPath, pngBytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (upPng.error) {
      console.error(`[client-ondertekening] PNG-upload mislukt (${id}):`, upPng.error.message);
    } else {
      patch.storage_path_png = pngPath;
    }
  } catch (e) {
    console.error(`[client-ondertekening] PNG-upload exception (${id}):`, e);
  }

  try {
    const tekst = htmlToText(String(info.body_html || ""));
    const ondertekendRegel = `Ondertekend door ${naam} (${typeLabel}) op ${nlNuTijd()}`;
    const pdfBytes = await buildVerklaringPdf({
      titel,
      tekst,
      ondertekendRegel,
      pngBytes,
      referentie: id,
    });
    const safeType = verklaringType.replace(/[^a-z0-9_-]/gi, "_") || "verklaring";
    const pdfPath = `${id}/verklaring-${safeType}.pdf`;
    const upPdf = await supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upPdf.error) {
      console.error(`[client-ondertekening] PDF-upload mislukt (${id}):`, upPdf.error.message);
    } else {
      patch.storage_path_pdf = pdfPath;
    }
  } catch (e) {
    console.error(`[client-ondertekening] PDF bouwen/uploaden exception (${id}):`, e);
  }

  if (Object.keys(patch).length > 0) {
    try {
      const upd = await supabase.from("client_ondertekeningen").update(patch).eq("id", id);
      if (upd.error) {
        console.error(`[client-ondertekening] storage-paden bijwerken mislukt (${id}):`, upd.error.message);
      }
    } catch (e) {
      console.error(`[client-ondertekening] storage-paden update exception (${id}):`, e);
    }
  }

  return json({ ok: true, id, titel, ondertekenaar_naam: naam });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method === "GET") return await handleGet(req);
  if (req.method === "POST") return await handlePost(req);
  return json({ ok: false, fout: "Methode niet toegestaan." }, 405);
});
