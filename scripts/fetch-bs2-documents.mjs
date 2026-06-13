#!/usr/bin/env node
/**
 * BS2 BELEID/DOCUMENTEN — STRIKT READ-ONLY fetch via Node (geen CORS).
 *
 * ⚠️ PRODUCTIE: https://api.etf.besasuite.nl — alleen LEZEN.
 *   - Uitsluitend HTTP GET. NOOIT POST/PATCH/PUT/DELETE. Wijzigt niets op BS2.
 *   - Node heeft geen browser-CORS → de presigned S3-PDF's lukken hier wél.
 *   - Token = jouw eigen sessie-JWT (bs2-token.txt of env BS2_PROD_TOKEN).
 *     Alleen lokaal gebruikt, nergens heen gestuurd, nooit gecommit.
 *
 * GEBRUIK (vanuit de map future-flow):
 *   node scripts/fetch-bs2-documents.mjs
 *     -> leest C:\Users\sonck\Downloads\bs2-token.txt
 *   (of:  $env:BS2_PROD_TOKEN="<jwt>"; node scripts/fetch-bs2-documents.mjs )
 *
 * Output (lokaal, NIET in git): scripts/_bs2-documents/
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

console.log("=== BS2 documenten read-only fetch ===");
console.log("Node:", process.version, "| cwd:", process.cwd());

if (typeof fetch !== "function") {
  console.error("FOUT: deze Node-versie heeft geen global fetch (Node 18+ nodig). Jouw versie: " + process.version);
  process.exit(1);
}

const API = "https://api.etf.besasuite.nl/api/documents";
const FILTER = "filter[target][type]=policy&filter[target][id]=policy";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // robuust, ook met spaties in pad
const OUTDIR = path.join(SCRIPT_DIR, "_bs2-documents");

function readToken() {
  let t = process.env.BS2_PROD_TOKEN || "";
  let src = "env BS2_PROD_TOKEN";
  if (!t) {
    const f = path.join(os.homedir(), "Downloads", "bs2-token.txt");
    if (fs.existsSync(f)) { t = fs.readFileSync(f, "utf8"); src = f; }
  }
  t = String(t || "").replace(/^Bearer\s+/i, "").trim();
  return { t, src };
}

async function getJSON(url) {
  const r = await fetch(url, { method: "GET", headers: { Authorization: "Bearer " + TOKEN, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) {
    console.error("FOUT: token verlopen/ongeldig (HTTP " + r.status + "). Download 'bs2-token.txt' opnieuw via het token-snippet en draai dit script meteen daarna.");
    process.exit(1);
  }
  if (!r.ok) throw new Error("API HTTP " + r.status + " — " + url);
  return r.json();
}
async function getFile(url) {
  const r = await fetch(url, { method: "GET" }); // presigned S3: GEEN auth-header
  if (!r.ok) throw new Error("S3 HTTP " + r.status);
  return Buffer.from(await r.arrayBuffer());
}
function safe(s, fb) {
  s = String(s == null ? "" : s).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
  return s || fb;
}

const { t: TOKEN, src: TOKSRC } = readToken();
if (!TOKEN || TOKEN.split(".").length !== 3) {
  console.error("FOUT: geen geldige token gevonden (gezocht: env BS2_PROD_TOKEN, dan " + path.join(os.homedir(), "Downloads", "bs2-token.txt") + ").");
  console.error("Draai eerst het token-snippet in de browser (downloadt bs2-token.txt), dan dit script.");
  process.exit(1);
}
console.log("Token-bron:", TOKSRC, "| lengte:", TOKEN.length);
console.log("Output-map:", OUTDIR);

async function main() {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  console.log("\nDocumentenlijst ophalen (GET, read-only)…");
  const recs = [];
  const byId = {};
  let page = 1, total = null;
  while (page <= 50) {
    const j = await getJSON(API + "?" + encodeURI(FILTER) + "&page=" + page + "&limit=15");
    if (j && j.meta && typeof j.meta.total === "number") total = j.meta.total;
    const rows = (j && j.data) || [];
    rows.forEach((r) => { const k = r && r.id != null ? String(r.id) : JSON.stringify(r); if (!byId[k]) { byId[k] = 1; recs.push(r); } });
    console.log("  pagina " + page + " → " + recs.length + (total != null ? "/" + total : "") + " documenten");
    const lp = j && j.meta && j.meta.last_page ? j.meta.last_page : null;
    if (!rows.length || (total != null && recs.length >= total) || (lp && page >= lp)) break;
    page++; await new Promise((r) => setTimeout(r, 150));
  }
  if (!recs.length) { console.error("FOUT: 0 documenten — token ongeldig of geen toegang."); process.exit(1); }

  let ok = 0, fail = 0;
  const used = {};
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i], f = rec && rec.file;
    if (!f || !f.url) { fail++; rec.__file = { ok: false, reason: "geen file.url" }; console.log(`  [${i + 1}/${recs.length}] ✖ ${rec && rec.name}: geen file.url`); continue; }
    try {
      const buf = await getFile(f.url);
      const ext = (f.extension || (String(f.name).match(/\.([a-z0-9]+)$/i) || [, "pdf"])[1] || "pdf").toLowerCase();
      let bn = safe(f.name || rec.name || ("document-" + i), "document-" + i);
      if (!bn.toLowerCase().endsWith("." + ext)) bn += "." + ext;
      if (used[bn]) bn = bn.replace(/(\.[a-z0-9]+)$/i, "-" + (rec.id || i) + "$1");
      used[bn] = 1;
      fs.writeFileSync(path.join(OUTDIR, bn), buf);
      rec.__file = { ok: true, local: bn, bytes: buf.length, path: f.path };
      ok++;
      console.log(`  [${i + 1}/${recs.length}] ✔ ${bn} (${buf.length} bytes)`);
    } catch (e) {
      fail++; rec.__file = { ok: false, reason: e.message, path: f.path };
      console.log(`  [${i + 1}/${recs.length}] ✖ ${rec && rec.name}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const payload = {
    scraped_at: new Date().toISOString(),
    source: "BS2 PRODUCTIE /api/documents (policy) via Node, read-only",
    endpoint: API,
    counts: { documents: recs.length, bs2_meta_total: total, files_ok: ok, files_fail: fail },
    documents: recs,
  };
  fs.writeFileSync(path.join(OUTDIR, "bs2-documents.json"), JSON.stringify(payload, null, 2));

  console.log(`\n=== KLAAR ===`);
  console.log(`Documenten: ${recs.length} | PDF's ok: ${ok} | mislukt: ${fail}`);
  console.log(`Output: ${OUTDIR}`);
  console.log(`Niets gewijzigd op BS2 (alleen GET).`);
}

main().catch((e) => { console.error("ONVERWACHTE FOUT:", e && e.stack || e); process.exit(1); });
