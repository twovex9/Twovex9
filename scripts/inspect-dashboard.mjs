#!/usr/bin/env node
/**
 * Inspecteer bs2-dashboard-calls.json (schrijft NIETS). Haalt de volledige
 * /api/rpc KPI-responses + alle unieke widget-query-vormen eruit, zodat ik
 * het BS1-beschikkingen-dashboard 100% kan namaken + verifiëren.
 *   node scripts/inspect-dashboard.mjs
 */
import fs from "fs";
import path from "path";
const DL = "C:/Users/sonck/Downloads";
const files = fs.readdirSync(DL).filter(f => /^bs2-dashboard-calls.*\.json$/i.test(f));
if (!files.length) { console.error("FOUT: geen bs2-dashboard-calls*.json in " + DL); process.exit(1); }
let calls = [], gekozen = "";
for (const f of files) {
  try { const arr = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8")); if (Array.isArray(arr) && arr.length >= calls.length) { calls = arr; gekozen = f; } }
  catch (e) { console.error("Parse-fout", f, e.message); }
}
console.log("Bestanden gevonden:", files.join(", "));
console.log("Gekozen (meeste calls):", gekozen, "→", calls.length, "API-calls\n");

// 1. /api/rpc — de KPI-bron. Toon élke unieke response volledig.
const rpc = calls.filter(c => /\/api\/rpc/.test(c.u));
const seen = new Set();
console.log("================ /api/rpc KPI-RESPONSES (" + rpc.length + " calls) ================");
for (const c of rpc) {
  const key = (c.body || "").slice(0, 120);
  if (seen.has(key)) continue; seen.add(key);
  let pretty = c.body;
  try { pretty = JSON.stringify(JSON.parse(c.body), null, 1); } catch (_) {}
  console.log("\n--- rpc response (" + (c.body || "").length + " bytes) ---\n" + pretty);
}

// 2. Alle overige endpoints → unieke query-vorm (pad + gesorteerde filterkeys, zonder waarden/paginering)
function shape(u) {
  try {
    const url = new URL(u.replace('besasuite.nl:', 'besasuite.nl'));
    const keys = [...url.searchParams.keys()]
      .filter(k => !/^(page|limit|sort)$/.test(k))
      .map(k => k.replace(/\d+/g, "N"))
      .sort();
    return url.pathname + "  ?" + [...new Set(keys)].join("&");
  } catch (_) { return u; }
}
const groups = {};
for (const c of calls) {
  if (/\/api\/rpc/.test(c.u)) continue;
  const s = shape(c.u);
  if (!groups[s]) groups[s] = { n: 0, u: c.u, body: c.body };
  groups[s].n++;
}
console.log("\n\n================ UNIEKE WIDGET-QUERIES (" + Object.keys(groups).length + ") ================");
for (const [s, g] of Object.entries(groups).sort()) {
  console.log("\n[" + g.n + "x] " + s);
  console.log("  voorbeeld: " + g.u.replace('besasuite.nl:', 'besasuite.nl'));
  console.log("  → " + (g.body ? g.body.slice(0, 240) : "(geen body)"));
}
console.log("\nPlak ALLES hierboven in de chat. Daarna bouw ik het BS1-dashboard 1-op-1 + verifieer elk getal.");
