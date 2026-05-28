// Edge function: contract-sign
//
// Token-gevalideerd digitaal ondertekenen van een contract. Token in de URL
// (teken_token_medewerker of teken_token_werkgever op `contracten`) bepaalt de
// rol. Legt de handtekening + IP vast in `contract_handtekeningen`, routeert
// medewerker → werkgever, en zet bij voltooiing het getekende contract als PDF
// in `medewerker_documenten`. Draait met service role; verify_jwt blijft aan
// (de teken-pagina stuurt de publieke anon-key mee).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BUCKET = "medewerker-documenten";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Verwijder tekens die StandardFonts (WinAnsi) niet kan coderen.
function pdfSafe(s: string): string {
  return String(s || "")
    .replace(/—/g, "-").replace(/–/g, "-")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/…/g, "...").replace(/ /g, " ");
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

async function buildPdf(contractNaam: string, tekst: string, handtekeningen: any[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageW = 595, pageH = 842, margin = 56, size = 10, lh = 14;
  const maxW = pageW - margin * 2;
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;
  const draw = (txt: string, f: any, sz: number) => {
    if (y < margin + 40) { page = pdf.addPage([pageW, pageH]); y = pageH - margin; }
    try { page.drawText(txt, { x: margin, y: y, size: sz, font: f, color: rgb(0.1, 0.1, 0.1) }); } catch { /* skip onrender */ }
    y -= lh;
  };
  draw(pdfSafe(contractNaam), bold, 13);
  y -= 6;
  for (const ln of wrapLines(tekst, font, size, maxW)) draw(ln, font, size);
  y -= 10;
  draw("Ondertekening", bold, 11);
  for (const h of handtekeningen) {
    const d = h.getekend_op ? new Date(h.getekend_op).toLocaleString("nl-NL") : "";
    draw(pdfSafe((h.rol === "werkgever" ? "Werkgever: " : "Medewerker: ") + (h.ondertekenaar_naam || "") + "  -  " + (h.methode === "getekend" ? "digitaal getekend" : "akkoord") + "  -  " + d + (h.ip_adres ? "  -  IP " + h.ip_adres : "")), font, 9);
  }
  return await pdf.save();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan." }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }

  const action = String(body.action || "");
  const token = String(body.token || "");
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return json({ error: "Ongeldige link." }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cRes = await supabase.from("contracten")
    .select("id, medewerker_id, naam, type, gegenereerde_tekst, status, teken_token_medewerker, teken_token_werkgever")
    .or(`teken_token_medewerker.eq.${token},teken_token_werkgever.eq.${token}`)
    .maybeSingle();
  if (cRes.error || !cRes.data) return json({ error: "Deze teken-link is niet (meer) geldig." }, 404);
  const c = cRes.data as any;
  const rol = String(c.teken_token_werkgever) === token ? "werkgever" : "medewerker";

  const kanTekenen = (rol === "medewerker" && c.status === "wacht_op_ondertekening")
    || (rol === "werkgever" && c.status === "wacht_op_werkgever");

  const mwRes = await supabase.from("medewerkers").select("voornaam, achternaam").eq("id", c.medewerker_id).maybeSingle();
  const mw = (mwRes.data || {}) as any;
  const medewerkerNaam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();

  const sigRes = await supabase.from("contract_handtekeningen").select("rol, ondertekenaar_naam, methode, getekend_op").eq("contract_id", c.id);
  const reeds = (sigRes.data || []) as any[];

  if (action === "info") {
    return json({
      ok: true, rol, status: c.status, kanTekenen,
      contractNaam: c.naam, medewerkerNaam, tekst: c.gegenereerde_tekst,
      reedsGetekend: reeds.map((r) => ({ rol: r.rol, naam: r.ondertekenaar_naam })),
      reden: kanTekenen ? "" : (c.status === "getekend" ? "Dit contract is al volledig getekend." : (rol === "werkgever" && c.status === "wacht_op_ondertekening" ? "De medewerker moet eerst tekenen." : "Dit contract kan nu niet getekend worden.")),
    });
  }

  if (action === "sign") {
    if (!kanTekenen) return json({ error: "Dit contract kan nu niet (meer) door jou getekend worden." }, 409);
    const naam = String(body.naam || "").trim();
    const methode = String(body.methode || "akkoord");
    const png = body.handtekeningPng ? String(body.handtekeningPng) : null;
    if (!naam) return json({ error: "Vul je naam in." }, 400);
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

    const ins = await supabase.from("contract_handtekeningen").insert({
      contract_id: c.id, rol, ondertekenaar_naam: naam, methode: methode === "getekend" ? "getekend" : "akkoord",
      handtekening_png: png, ip_adres: ip || null,
    });
    if (ins.error) return json({ error: "Ondertekenen mislukt: " + ins.error.message }, 500);

    if (rol === "medewerker") {
      await supabase.from("contracten").update({ status: "wacht_op_werkgever" }).eq("id", c.id);
      return json({ ok: true, status: "wacht_op_werkgever", done: false });
    }

    // werkgever tekent als laatste → getekend + PDF in documenten
    await supabase.from("contracten").update({ status: "getekend" }).eq("id", c.id);
    try {
      const allSigs = ((await supabase.from("contract_handtekeningen").select("rol, ondertekenaar_naam, methode, getekend_op, ip_adres").eq("contract_id", c.id)).data || []) as any[];
      const pdfBytes = await buildPdf(c.naam, c.gegenereerde_tekst, allSigs);
      const docId = crypto.randomUUID();
      const safe = String(c.naam || "contract").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const path = `${c.medewerker_id}/${docId}-${safe}-getekend.pdf`;
      const up = await supabase.storage.from(BUCKET).upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
      if (!up.error) {
        await supabase.from("medewerker_documenten").insert({
          id: docId, medewerker_id: String(c.medewerker_id), naam: c.naam + " (getekend)",
          type: "Contract", file_name: safe + "-getekend.pdf", file_mime: "application/pdf", storage_path: path,
        });
        await supabase.from("contracten").update({ pdf_storage_path: path }).eq("id", c.id);
      }
    } catch (e) { /* PDF-fout mag het tekenen niet blokkeren; status blijft getekend */ }
    return json({ ok: true, status: "getekend", done: true });
  }

  return json({ error: "Onbekende actie." }, 400);
});
