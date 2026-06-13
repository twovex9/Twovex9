#!/usr/bin/env node
/**
 * BS2 AUDIT-LOGS — volledige bulk-scrape (STAP 2).  READ-ONLY (alleen GET).
 *
 * SANDBOX: https://api.etf.acceptance.besasuite.nl/api/audit-logs
 *   - Uitsluitend HTTP GET. Niets wordt op BS2 gewijzigd.
 *   - ~160.185 records. BS2 hardcapt vermoedelijk 15/pagina → het script
 *     PROBEERT eerst een grotere `limit` (1000→200→100→15) en gebruikt wat
 *     de API echt teruggeeft (meta.per_page).
 *   - STABIEL & HERVATBAAR: paginatie met `sort=id` (oplopend). De audit
 *     groeit continu (elke LOGIN voegt een rij toe); door op id oplopend te
 *     pagineren komen nieuwe rijen alléén aan de staart bij — al opgehaalde
 *     pagina's verschuiven nooit. Bij stop/crash hervat het script vanaf de
 *     laatst voltooide pagina (state-file). Dedup op `id`. Aan het eind:
 *     unieke telling == server meta.total + gap-check (ontbrekende id's).
 *
 * GEBRUIK (vanuit map future-flow):
 *   1. Draai het token-snippet in de BS2-console → download bs2-token.txt
 *      (naar je Downloads). Dat is je eigen sessie-JWT; lokaal, nooit gecommit.
 *   2.  node scripts/scrape-bs2-audit-logs.mjs
 *      (of:  $env:BS2_TOKEN="<jwt>"; node scripts/scrape-bs2-audit-logs.mjs )
 *   3. Token verlopen tijdens de run (HTTP 401)? Snippet opnieuw draaien,
 *      bs2-token.txt verversen, en exact hetzelfde commando opnieuw — het
 *      script hervat automatisch waar het gebleven was.
 *
 * Output (lokaal, NIET in git — zie .gitignore scripts/_bs2-audit/):
 *   scripts/_bs2-audit/audit-logs.ndjson        (1 record per regel)
 *   scripts/_bs2-audit/_state.json              (hervat-status)
 *   scripts/_bs2-audit/bs2-audit-summary.json   (eindrapport)
 */
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { fileURLToPath } from "url";

console.log("=== BS2 audit-logs bulk-scrape (read-only) ===");
console.log("Node:", process.version, "| cwd:", process.cwd());

if (typeof fetch !== "function") {
  console.error("FOUT: deze Node-versie heeft geen global fetch (Node 18+ nodig). Jouw versie: " + process.version);
  process.exit(1);
}

const API = "https://api.etf.acceptance.besasuite.nl/api/audit-logs";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // robuust, ook met spaties in pad
const OUTDIR = path.join(SCRIPT_DIR, "_bs2-audit");
const NDJSON = path.join(OUTDIR, "audit-logs.ndjson");
const STATE = path.join(OUTDIR, "_state.json");
const SUMMARY = path.join(OUTDIR, "bs2-audit-summary.json");

const DELAY_MS = Number(process.env.BS2_DELAY_MS || 150);
const MAX_RETRY = Number(process.env.BS2_MAX_RETRY || 6);
const LIMIT_CANDIDATES = [1000, 200, 100, 15];

function readToken() {
  let t = process.env.BS2_TOKEN || "";
  let src = "env BS2_TOKEN";
  if (!t) {
    const f = path.join(os.homedir(), "Downloads", "bs2-token.txt");
    if (fs.existsSync(f)) { t = fs.readFileSync(f, "utf8"); src = f; }
  }
  t = String(t || "").replace(/^Bearer\s+/i, "").trim();
  return { t, src };
}

const { t: TOKEN, src: TOKSRC } = readToken();
if (!TOKEN || TOKEN.split(".").length !== 3) {
  console.error("FOUT: geen geldige JWT gevonden (gezocht: env BS2_TOKEN, dan "
    + path.join(os.homedir(), "Downloads", "bs2-token.txt") + ").");
  console.error("Draai eerst het token-snippet in de BS2-console (downloadt bs2-token.txt), dan dit script.");
  process.exit(1);
}
console.log("Token-bron:", TOKSRC, "| lengte:", TOKEN.length);
console.log("Output-map:", OUTDIR);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, attempt) {
  attempt = attempt || 1;
  let r;
  try {
    r = await fetch(url, { method: "GET", headers: { Authorization: "Bearer " + TOKEN, Accept: "application/json" } });
  } catch (e) {
    if (attempt > MAX_RETRY) throw new Error("netwerk-fout na " + MAX_RETRY + " pogingen: " + (e && e.message || e));
    const back = Math.min(30000, 500 * 2 ** attempt);
    console.warn("  netwerkfout (" + (e && e.message || e) + ") — retry " + attempt + " over " + back + "ms");
    await sleep(back);
    return getJSON(url, attempt + 1);
  }
  if (r.status === 401 || r.status === 403) {
    console.error("\nFOUT: token verlopen/ongeldig (HTTP " + r.status + ").");
    console.error("→ Draai het token-snippet opnieuw, ververs bs2-token.txt, en start DIT script "
      + "opnieuw met exact hetzelfde commando. Het hervat automatisch.");
    process.exit(2);
  }
  if (r.status === 429 || r.status >= 500) {
    if (attempt > MAX_RETRY) throw new Error("API HTTP " + r.status + " na " + MAX_RETRY + " pogingen — " + url);
    const back = Math.min(60000, 800 * 2 ** attempt);
    console.warn("  HTTP " + r.status + " — retry " + attempt + " over " + back + "ms");
    await sleep(back);
    return getJSON(url, attempt + 1);
  }
  if (!r.ok) throw new Error("API HTTP " + r.status + " — " + url);
  return r.json();
}

function pageUrl(page, limit) {
  // with[]=causer → volledige "wie deed het"-user mee; sort=id oplopend = stabiel.
  return API + "?with%5B%5D=causer&sort=id&page=" + page + "&limit=" + limit;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { return null; }
}
function saveState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

// Bij hervatten: bestaande ndjson streamen → seen-set + tellingen herstellen.
async function rebuildSeen() {
  const seen = new Set();
  let minId = Infinity, maxId = -Infinity, lines = 0;
  if (!fs.existsSync(NDJSON)) return { seen, minId: null, maxId: null, lines: 0 };
  const rl = readline.createInterface({ input: fs.createReadStream(NDJSON), crlfDelay: Infinity });
  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;
    lines++;
    try {
      const o = JSON.parse(s);
      if (o && o.id != null) {
        const id = Number(o.id);
        seen.add(id);
        if (id < minId) minId = id;
        if (id > maxId) maxId = id;
      }
    } catch (e) { /* corrupte laatste regel negeren */ }
  }
  return { seen, minId: seen.size ? minId : null, maxId: seen.size ? maxId : null, lines };
}

async function main() {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  // Zelf-beschermend: alles in deze map negeren (100MB+ audit-data met
  // IP's + wie-wat-deed mag NOOIT naar git), onafhankelijk van de
  // root-.gitignore of de merge-volgorde van PR's.
  try { fs.writeFileSync(path.join(OUTDIR, ".gitignore"), "*\n"); } catch (e) { /* */ }

  // 1) limit-probe: wat geeft /api/audit-logs echt terug?
  console.log("\nLimit-probe (1000→200→100→15)…");
  let LIMIT = 15, serverTotal = null, lastPage = null;
  for (const cand of LIMIT_CANDIDATES) {
    const j = await getJSON(pageUrl(1, cand));
    const rows = (j && j.data) || [];
    const pp = j && j.meta && j.meta.per_page;
    serverTotal = j && j.meta && typeof j.meta.total === "number" ? j.meta.total : serverTotal;
    lastPage = j && j.meta && j.meta.last_page ? j.meta.last_page : lastPage;
    console.log("  limit=" + cand + " → data.length=" + rows.length + " meta.per_page=" + pp
      + " meta.total=" + serverTotal + " meta.last_page=" + lastPage);
    if (rows.length > 15 || pp > 15) { LIMIT = Math.max(rows.length, Number(pp) || 0); break; }
    LIMIT = 15;
    await sleep(DELAY_MS);
  }
  // Stabiele paginatie-check: is sort=id oplopend gehonoreerd?
  const probe = await getJSON(pageUrl(1, LIMIT));
  const pr = (probe && probe.data) || [];
  serverTotal = probe && probe.meta && typeof probe.meta.total === "number" ? probe.meta.total : serverTotal;
  lastPage = probe && probe.meta && probe.meta.last_page ? probe.meta.last_page : lastPage;
  const ascOK = pr.length >= 2 && Number(pr[0].id) < Number(pr[pr.length - 1].id);
  console.log("Effectieve LIMIT=" + LIMIT + " | server total=" + serverTotal
    + " | last_page=" + lastPage + " | sort=id oplopend gehonoreerd: " + ascOK
    + (ascOK ? "" : "  (val-terug: paginatie blijft werken via dedup; trager maar skip-vrij voor append-only logs)"));
  if (!serverTotal) { console.error("FOUT: geen meta.total — token ongeldig of geen toegang."); process.exit(1); }

  // 2) hervat-status
  let st = loadState();
  const restored = await rebuildSeen();
  const seen = restored.seen;
  let startPage = 1;
  if (st && ascOK && st.limit === LIMIT && restored.lines > 0) {
    startPage = (st.lastDonePage || 0) + 1;
    console.log("HERVAT: " + seen.size + " records al op schijf — verder vanaf pagina " + startPage);
  } else if (restored.lines > 0) {
    console.log("Bestaande ndjson (" + restored.lines + " regels) — alles opnieuw scannen, dedup op id verwijdert dubbels.");
  }

  const out = fs.createWriteStream(NDJSON, { flags: "a" });
  const t0 = Date.now();
  let page = startPage, wrote = 0, emptyStreak = 0;

  while (true) {
    let j;
    try {
      j = await getJSON(pageUrl(page, LIMIT));
    } catch (e) {
      console.error("\nFOUT op pagina " + page + ": " + (e && e.message || e));
      console.error("State opgeslagen — start hetzelfde commando opnieuw om te hervatten.");
      saveState({ limit: LIMIT, lastDonePage: page - 1, seen: seen.size, serverTotal, ascOK, updated: new Date().toISOString() });
      out.end();
      process.exit(3);
    }
    const rows = (j && j.data) || [];
    if (j && j.meta) {
      if (typeof j.meta.total === "number") serverTotal = j.meta.total;
      if (j.meta.last_page) lastPage = j.meta.last_page;
    }
    let newOnPage = 0;
    for (const r of rows) {
      const id = r && r.id != null ? Number(r.id) : null;
      if (id == null) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.write(JSON.stringify(r) + "\n");
      wrote++; newOnPage++;
    }
    saveState({ limit: LIMIT, lastDonePage: page, seen: seen.size, serverTotal, ascOK, updated: new Date().toISOString() });

    if (page % 25 === 0 || rows.length < LIMIT) {
      const el = (Date.now() - t0) / 1000;
      const rate = wrote > 0 ? (wrote / el) : 0;
      const remain = Math.max(0, serverTotal - seen.size);
      const eta = rate > 0 ? Math.round(remain / rate) : null;
      console.log("  pagina " + page + " | uniek " + seen.size + "/" + serverTotal
        + " | +" + newOnPage + " | " + Math.round(rate) + " rec/s"
        + (eta != null ? " | ETA ~" + Math.round(eta / 60) + " min" : ""));
    }

    emptyStreak = rows.length === 0 ? emptyStreak + 1 : 0;
    const reachedAll = seen.size >= serverTotal;
    const pastLast = lastPage && page >= lastPage;
    if (rows.length === 0 && (reachedAll || pastLast || emptyStreak >= 3)) break;
    if (reachedAll && rows.length < LIMIT) break;
    if (pastLast && rows.length < LIMIT && reachedAll) break;
    page++;
    await sleep(DELAY_MS);
  }
  out.end();
  await new Promise((res) => out.on("close", res));

  // 3) verificatie + gap-check (id is sequentieel → ontbrekende id's = bewijs)
  const fin = await rebuildSeen();
  const ids = [...fin.seen].sort((a, b) => a - b);
  const minId = ids[0], maxId = ids[ids.length - 1];
  const gaps = [];
  for (let i = 1; i < ids.length; i++) {
    const d = ids[i] - ids[i - 1];
    if (d > 1) gaps.push([ids[i - 1] + 1, ids[i] - 1, d - 1]);
  }
  const missingCount = gaps.reduce((a, g) => a + g[2], 0);

  // distinct action_type / resource voor het eindrapport
  const actionTypes = {}, resourceTypes = {};
  {
    const rl = readline.createInterface({ input: fs.createReadStream(NDJSON), crlfDelay: Infinity });
    for await (const line of rl) {
      const s = line.trim(); if (!s) continue;
      try {
        const o = JSON.parse(s);
        if (o.action_type) actionTypes[o.action_type] = (actionTypes[o.action_type] || 0) + 1;
        if (o.resource_type) resourceTypes[o.resource_type] = (resourceTypes[o.resource_type] || 0) + 1;
      } catch (e) {}
    }
  }

  const summary = {
    scraped_at: new Date().toISOString(),
    source: "BS2 SANDBOX /api/audit-logs via Node, read-only",
    endpoint: API,
    effective_limit: LIMIT,
    sort_id_asc_honored: ascOK,
    server_total: serverTotal,
    unique_scraped: fin.seen.size,
    complete: fin.seen.size >= serverTotal,
    id_min: minId,
    id_max: maxId,
    id_gaps: gaps.slice(0, 200),
    id_gap_total: missingCount,
    action_types: actionTypes,
    resource_types: resourceTypes,
  };
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));

  console.log("\n=== KLAAR ===");
  console.log("Uniek gescraped: " + fin.seen.size + " / server total " + serverTotal
    + (fin.seen.size >= serverTotal ? "  ✔ COMPLEET" : "  ✖ ONVOLLEDIG — start opnieuw om te hervatten"));
  console.log("id-bereik: " + minId + " … " + maxId + " | gaten: " + gaps.length
    + " (samen " + missingCount + " id's; sommige kunnen echt verwijderde audits zijn)");
  console.log("action_type:", actionTypes);
  console.log("Output: " + NDJSON);
  console.log("Samenvatting: " + SUMMARY);
  console.log("Niets gewijzigd op BS2 (alleen GET).");
}

main().catch((e) => { console.error("ONVERWACHTE FOUT:", e && e.stack || e); process.exit(1); });
