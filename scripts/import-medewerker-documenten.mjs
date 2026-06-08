#!/usr/bin/env node
/**
 * BS2 PRODUCTIE → BS1 — medewerker-documenten (PDF's) overzetten.
 *
 * ⚠️ BS2 = PRODUCTIE https://api.etf.besasuite.nl — STRIKT READ-ONLY.
 *   - Uitsluitend HTTP GET naar BS2. NOOIT POST/PATCH/PUT/DELETE op BS2.
 *   - Node heeft geen browser-CORS → de presigned S3-PDF's lukken hier wél.
 *   - BS2-token = jouw eigen sessie-JWT (bs2-token.txt of env BS2_PROD_TOKEN);
 *     alleen lokaal gebruikt, nooit gecommit (zie .gitignore).
 *
 * Schrijft ALLEEN naar Supabase (service_role): Storage-bucket
 * 'medewerker-documenten' + tabel 'medewerker_documenten'. Niet-destructief
 * & idempotent: bestaande metadata-rij (zelfde medewerker + naam/bestand)
 * wordt geüpdatet met de PDF; ontbrekende docs worden toegevoegd
 * (id = BS2-doc-id). Nooit een rij verwijderd.
 *
 * Koppeling BS2-medewerker → BS1: medewerkers.data->>'bs2_id'
 * (fallback: e-mail; voornaam+achternaam als tiebreaker).
 *
 * GEBRUIK (vanuit de map besa-suite-etf), nadat je het token-snippet hebt
 * gedraaid (downloadt bs2-token.txt naar Downloads):
 *   node --env-file=scripts/.env scripts/import-medewerker-documenten.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

console.log("=== BS2→BS1 import: medewerker-documenten ===");
console.log("Node:", process.version, "| cwd:", process.cwd());
if (typeof fetch !== "function") {
  console.error("FOUT: Node 18+ nodig (geen global fetch). Versie: " + process.version);
  process.exit(1);
}

const API = "https://api.etf.besasuite.nl/api";
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const BUCKET = "medewerker-documenten";
const TABLE = "medewerker_documenten";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTDIR = path.join(SCRIPT_DIR, "_bs2-mw-documents");

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("SUPABASE_SERVICE_ROLE_KEY:", KEY ? "aanwezig (len " + KEY.length + ")" : "ONTBREEKT");
if (!KEY) {
  console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt. Draai met:");
  console.error("  node --env-file=scripts/.env scripts/import-medewerker-documenten.mjs");
  process.exit(1);
}

function readBs2Token() {
  let t = process.env.BS2_PROD_TOKEN || "";
  let src = "env BS2_PROD_TOKEN";
  if (!t) {
    // Browser hernoemt herhaalde downloads naar "bs2-token (5).txt" e.d.
    // Pak ALTIJD de NIEUWSTE bs2-token*.txt in Downloads (de verse), niet
    // per ongeluk een oude verlopen (les: nieuwste bestand = de juiste).
    const dl = path.join(os.homedir(), "Downloads");
    try {
      const cands = fs.readdirSync(dl)
        .filter((f) => /^bs2-token.*\.txt$/i.test(f))
        .map((f) => { const fp = path.join(dl, f); return { fp, m: fs.statSync(fp).mtimeMs }; })
        .sort((a, b) => b.m - a.m);
      if (cands.length) { t = fs.readFileSync(cands[0].fp, "utf8"); src = cands[0].fp; }
    } catch (e) { /* */ }
  }
  t = String(t || "").replace(/^Bearer\s+/i, "").trim();
  return { t, src };
}
const { t: BS2TOKEN, src: TOKSRC } = readBs2Token();
if (!BS2TOKEN || BS2TOKEN.split(".").length !== 3) {
  console.error("FOUT: geen geldige BS2-token (gezocht: env BS2_PROD_TOKEN, dan "
    + path.join(os.homedir(), "Downloads", "bs2-token.txt") + ").");
  console.error("Draai eerst het token-snippet in de BS2-console (downloadt bs2-token.txt).");
  process.exit(1);
}
console.log("BS2-token-bron:", TOKSRC, "| lengte:", BS2TOKEN.length);

const SB_HEADERS = { apikey: KEY, Authorization: "Bearer " + KEY };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Supabase Storage-keys accepteren alleen veilige tekens. Spaties, %, (),
// [], accenten/niet-ASCII (Özkaraaslan, "Adobe%20Scan (3) kopie.pdf")
// gaven HTTP 400 InvalidKey. Strikt naar [A-Za-z0-9._-] — exact zoals
// safeFileName() in medewerker-documenten-data.js (bewezen op deze bucket).
function safe(s, fb) {
  s = String(s == null ? "" : s)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  if (s.length > 120) s = s.slice(0, 120);
  return s || fb;
}
function isoDate(v) { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; }
function mimeFor(ext) {
  ext = String(ext || "").toLowerCase();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })[ext]
    || "application/octet-stream";
}
function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }

async function bs2GET(url) {
  const r = await fetch(url, { method: "GET", headers: { Authorization: "Bearer " + BS2TOKEN, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) {
    console.error("\nFOUT: BS2-token verlopen/ongeldig (HTTP " + r.status + ").");
    console.error("Draai het token-snippet opnieuw (verse bs2-token.txt) en start dit script direct daarna.");
    console.error("Het is idempotent — al overgezette PDF's worden gewoon opnieuw bevestigd, geen duplicaten.");
    process.exit(1);
  }
  if (!r.ok) throw new Error("BS2 API HTTP " + r.status + " — " + url);
  return r.json();
}
async function bs2GetFile(url) { // presigned S3: GEEN auth-header
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error("S3 HTTP " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
async function sbSelectAll(table, select) {
  const out = [];
  let from = 0; const step = 1000;
  for (;;) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
      headers: { ...SB_HEADERS, Range: `${from}-${from + step - 1}` },
    });
    if (!r.ok) throw new Error(`Supabase select ${table} → HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < step) break;
    from += step;
  }
  return out;
}
async function sbUpsertRow(payload) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Supabase upsert → HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
async function sbUploadFile(storagePath, buf, mime) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encPath(storagePath)}`, {
    method: "POST",
    headers: { ...SB_HEADERS, "Content-Type": mime || "application/octet-stream", "x-upsert": "true" },
    body: buf,
  });
  if (!r.ok) throw new Error(`Storage upload → HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function main() {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  // 1) BS1 mapping ophalen
  console.log("\n[1/4] BS1 medewerkers + bestaande documenten ophalen (Supabase)…");
  const mw = await sbSelectAll("medewerkers", "id,email,voornaam,achternaam,data");
  const byBs2 = new Map(), byEmail = new Map();
  for (const m of mw) {
    const bs2 = m && m.data && m.data.bs2_id;
    if (bs2) byBs2.set(String(bs2), m);
    const e = String(m.email || "").trim().toLowerCase();
    if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e).push(m); }
  }
  const existing = await sbSelectAll(TABLE, "id,medewerker_id,naam,file_name,storage_path");
  const exByEmp = new Map();
  for (const d of existing) {
    const k = String(d.medewerker_id);
    if (!exByEmp.has(k)) exByEmp.set(k, []);
    exByEmp.get(k).push(d);
  }
  console.log(`  medewerkers=${mw.length} (bs2_id=${byBs2.size}) | bestaande doc-rijen=${existing.length}`);

  // 2) BS2 medewerkers enumereren (read-only)
  console.log("\n[2/4] BS2 medewerkers enumereren (GET, read-only)…");
  const emps = [];
  let page = 1;
  for (;;) {
    const j = await bs2GET(`${API}/employees?page=${page}&limit=50&sort=first_name`);
    const rows = (j && j.data) || [];
    rows.forEach((e) => emps.push(e));
    const lp = j && j.meta && j.meta.last_page ? j.meta.last_page : null;
    const total = j && j.meta && j.meta.total;
    console.log(`  pagina ${page} → ${emps.length}${total != null ? "/" + total : ""}`);
    if (!rows.length || (lp && page >= lp)) break;
    page++; await sleep(150);
  }
  console.log(`  BS2-medewerkers: ${emps.length}`);

  // 3) Per medewerker docs ophalen + PDF overzetten
  console.log("\n[3/4] Per medewerker documenten ophalen + PDF naar Supabase…");
  const report = { ran_at: new Date().toISOString(), employees: emps.length, ok: 0, fail: 0, orphan_emps: [], details: [] };
  for (let ei = 0; ei < emps.length; ei++) {
    const be = emps[ei];
    const m = byBs2.get(String(be.id)) || (function () {
      const arr = byEmail.get(String(be.email || "").trim().toLowerCase()) || [];
      if (arr.length === 1) return arr[0];
      if (arr.length > 1) {
        const vn = String(be.first_name || "").trim().toLowerCase();
        const an = String(be.last_name || "").trim().toLowerCase();
        return arr.find((x) => String(x.voornaam || "").trim().toLowerCase() === vn
          && String(x.achternaam || "").trim().toLowerCase() === an) || arr[0];
      }
      return null;
    })();
    if (!m) {
      report.orphan_emps.push({ bs2_id: be.id, email: be.email, name: be.name });
      console.log(`  [${ei + 1}/${emps.length}] ⚠ geen BS1-match: ${be.name} (${be.email})`);
      continue;
    }
    const mwId = String(m.id);
    const exRows = (exByEmp.get(mwId) || []).slice();

    // docs ophalen (verse presigned urls), evt. pagineren
    let docs = [], dpage = 1;
    for (;;) {
      const qs = `filter[target][type]=employee&filter[target][id]=${be.id}`
        + `&filter[trashed]=false&page=${dpage}&limit=100`;
      const j = await bs2GET(`${API}/documents?${encodeURI(qs)}`);
      const rows = (j && j.data) || [];
      docs = docs.concat(rows);
      const lp = j && j.meta && j.meta.last_page ? j.meta.last_page : null;
      if (!rows.length || (lp && dpage >= lp)) break;
      dpage++; await sleep(120);
    }

    let eo = 0, ef = 0;
    for (const doc of docs) {
      const f = doc && doc.file;
      let bytes = null;
      try {
        if (!f || !f.url) throw new Error("geen file.url");
        const ext = String(f.extension || (String(f.name).match(/\.([a-z0-9]+)$/i) || [, "pdf"])[1] || "pdf").toLowerCase();
        const mime = mimeFor(ext);
        let fname = safe(f.name || doc.name || ("document-" + doc.id), "document-" + doc.id);
        if (!fname.toLowerCase().endsWith("." + ext)) fname += "." + ext;
        const buf = await bs2GetFile(f.url);
        bytes = buf.length;
        const storagePath = `${mwId}/${doc.id}-${fname}`;
        await sbUploadFile(storagePath, buf, mime);

        // bestaande rij matchen (zelfde medewerker + naam of bestandsnaam)
        const nm = String(doc.name || "").trim().toLowerCase();
        const fn = String(f.name || "").trim().toLowerCase();
        let match = exRows.find((r) => !r.storage_path
          && (String(r.naam || "").trim().toLowerCase() === nm
            || String(r.file_name || "").trim().toLowerCase() === fn));
        if (!match) match = exRows.find((r) =>
          String(r.naam || "").trim().toLowerCase() === nm
          || String(r.file_name || "").trim().toLowerCase() === fn);
        const rowId = match ? match.id : String(doc.id);
        if (match) match.storage_path = storagePath; // claim zodat 2 docs niet dezelfde rij pakken

        const payload = {
          id: rowId,
          medewerker_id: mwId,
          naam: doc.name || fname,
          type: doc.type || "other",
          vervaldatum: isoDate(doc.expiration_date) || isoDate(doc.contract_end_date) || "",
          uploaddatum: doc.created_at || new Date().toISOString(),
          laatst_gewijzigd: doc.updated_at || new Date().toISOString(),
          archived: false,
          file_name: f.name || fname,
          file_mime: mime,
          file_data: "",
          storage_path: storagePath,
        };
        await sbUpsertRow(payload);
        eo++; report.ok++;
        await sleep(80);
      } catch (e) {
        ef++; report.fail++;
        report.details.push({
          emp: be.name, mw_id: mwId, doc: doc && doc.name,
          bytes: bytes, mb: bytes != null ? +(bytes / 1048576).toFixed(2) : null,
          err: String(e && e.message || e),
        });
      }
    }
    console.log(`  [${ei + 1}/${emps.length}] ${be.name}: ${docs.length} docs → ok=${eo} fail=${ef}`);
    await sleep(100);
  }

  // 4) rapport
  fs.writeFileSync(path.join(OUTDIR, "import-report.json"), JSON.stringify(report, null, 2));
  console.log("\n[4/4] === KLAAR ===");
  console.log(`PDF's overgezet ok=${report.ok} | mislukt=${report.fail} | medewerkers zonder BS1-match=${report.orphan_emps.length}`);
  console.log(`Rapport: ${path.join(OUTDIR, "import-report.json")}`);
  console.log("BS2: alleen GET (niets gewijzigd). Supabase: niet-destructief upsert.");
  if (report.fail) console.log("Let op: zie import-report.json voor de mislukte items (vaak verlopen presigned → script opnieuw draaien).");
}

main().catch((e) => { console.error("ONVERWACHTE FOUT:", (e && e.stack) || e); process.exit(1); });
