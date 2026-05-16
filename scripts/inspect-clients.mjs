#!/usr/bin/env node
/**
 * Inspecteer bs2-clients-full.json (schrijft NIETS). Toont per-tab totalen +
 * de exacte datastructuur van één rijke cliënt, zodat de writer 1x goed wordt.
 *   node scripts/inspect-clients.mjs
 */
import fs from "fs";
const P = "C:/Users/sonck/Downloads/bs2-clients-full.json";
if (!fs.existsSync(P)) { console.error("FOUT: " + P + " niet gevonden."); process.exit(1); }
const data = JSON.parse(fs.readFileSync(P, "utf8"));
const cut = (o) => { try { return JSON.stringify(o).slice(0, 1600); } catch { return String(o); } };

console.log("============================================================");
console.log("CLIËNTEN:", data.length);
const tabs = ["dispositions", "payments", "contacts", "notes", "documents", "reports", "client_forms", "incidents"];
const sum = {}; const metN = {};
for (const t of tabs) { sum[t] = 0; metN[t] = 0; }
let errs = 0;
for (const c of data) {
  if (c.error) errs++;
  for (const t of tabs) { const n = Array.isArray(c[t]) ? c[t].length : 0; sum[t] += n; if (n > 0) metN[t]++; }
}
console.log("scrape-fouten:", errs);
console.log("\n--- TOTALEN PER TAB (records / hoeveel cliënten ermee) ---");
for (const t of tabs) console.log(`${t}: ${sum[t]} records, bij ${metN[t]}/${data.length} cliënten`);

// rijke controle-cliënt
const rich = data.find(c => c.clientnummer == 278) || data.slice().sort((a, b) =>
  ((b.dispositions || []).length + (b.payments || []).length + (b.incidents || []).length) -
  ((a.dispositions || []).length + (a.payments || []).length + (a.incidents || []).length))[0];
console.log("\n============================================================");
console.log("CONTROLE-CLIËNT:", rich.naam, "| nr", rich.clientnummer, "| id", rich.id);
console.log("\n--- DETAIL keys ---\n", Object.keys(rich.detail || {}).join(", "));
console.log("\n--- DETAIL (volledig, afgekapt) ---\n", cut(rich.detail));
for (const t of tabs) {
  const arr = rich[t] || [];
  console.log(`\n--- ${t} (${arr.length}) eerste record ---`);
  console.log(arr.length ? cut(arr[0]) : "(leeg)");
}

// een cliënt zoeken die wél contacten/notes/docs/reports/forms heeft (om vorm te zien)
for (const t of ["contacts", "notes", "documents", "reports", "client_forms"]) {
  const c = data.find(x => Array.isArray(x[t]) && x[t].length > 0);
  if (c) { console.log(`\n--- voorbeeld ${t} (cliënt ${c.naam}) ---\n`, cut(c[t][0])); }
  else console.log(`\n--- ${t}: bij GEEN ENKELE cliënt data (overal leeg in BS2) ---`);
}
console.log("\nPlak ALLES hierboven in de chat.");
