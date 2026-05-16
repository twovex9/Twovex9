#!/usr/bin/env node
/**
 * STAP 3 — Inspecteer bs2-overzicht-full*.json (schrijft NIETS).
 * Leest ÁLLE C:/Users/sonck/Downloads/bs2-overzicht-full*.json (incl. " (N)"
 * dedup-varianten), kiest de rijkste, en toont totalen per tab + de exacte
 * structuur van een controle-beschikking + voorbeeld per tab. Hieruit leid ik
 * de 1-op-1 BS1-mapping af (STAP 4 writer).
 *   node scripts/inspect-overzicht.mjs
 */
import fs from "fs";
import path from "path";

const DL = "C:/Users/sonck/Downloads";
const files = fs.readdirSync(DL).filter(f => /^bs2-overzicht-full.*\.json$/i.test(f));
if (!files.length) { console.error("FOUT: geen bs2-overzicht-full*.json in " + DL); process.exit(1); }
let DATA = null, gekozen = "", best = -1;
for (const f of files) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8"));
    const n = (o.dispositions || []).length;
    if (n >= best) { best = n; DATA = o; gekozen = f; }
  } catch (e) { console.error("Parse-fout", f, e.message); }
}
const D = DATA.dispositions || [];
const cut = (o, n = 2200) => { try { return JSON.stringify(o, null, 1).slice(0, n); } catch { return String(o); } };

console.log("Bestanden:", files.join(", "));
console.log("Gekozen (rijkste):", gekozen);
console.log("scraped_at:", DATA.scraped_at, "| counts:", JSON.stringify(DATA.counts));
console.log("============================================================");
console.log("beschikkingen:", D.length, "| care_types:", (DATA.care_types || []).length, "| phases:", (DATA.phases || []).length);

const tabs = ["payments", "rates", "notes", "audit"];
const sum = {}, metN = {};
tabs.forEach(t => { sum[t] = 0; metN[t] = 0; });
for (const d of D) for (const t of tabs) { const n = Array.isArray(d[t]) ? d[t].length : 0; sum[t] += n; if (n) metN[t] += 1; }
console.log("\n--- TOTAAL PER TAB (records / bij hoeveel beschikkingen) ---");
for (const t of tabs) console.log(`${t}: ${sum[t]} records, bij ${metN[t]}/${D.length} beschikkingen`);

// fase / status / declaratiemethode-verdeling
const by = (arr, f) => { const m = {}; for (const x of arr) { const k = f(x); m[k] = (m[k] || 0) + 1; } return m; };
console.log("\nfase:", JSON.stringify(by(D, d => d.phase && d.phase.name)));
console.log("status:", JSON.stringify(by(D, d => d.status)));
console.log("declaration_method:", JSON.stringify(by(D, d => d.declaration_method)));
console.log("care_type:", JSON.stringify(by(D, d => d.care_type && d.care_type.name)));
console.log("__trashed:", JSON.stringify(by(D, d => !!d.__trashed)));

// rijkste controle-beschikking = die met meeste payments+rates+audit
const score = d => (d.payments || []).length + (d.rates || []).length + (d.notes || []).length + (d.audit || []).length;
const ctrl = D.reduce((a, b) => (score(b) > score(a) ? b : a), D[0]);
console.log("\n============================================================");
console.log("CONTROLE-BESCHIKKING:", ctrl.id, "|", ctrl.name, "| client:", ctrl.client && ctrl.client.name,
  "| payments", (ctrl.payments || []).length, "rates", (ctrl.rates || []).length, "notes", (ctrl.notes || []).length, "audit", (ctrl.audit || []).length);
const top = Object.assign({}, ctrl); delete top.payments; delete top.rates; delete top.notes; delete top.audit;
console.log("\n--- disposition TOP-LEVEL (zonder tabs) ---\n", cut(top, 3000));
console.log("\n--- client ---\n", cut(ctrl.client, 1200));
console.log("\n--- care_type ---\n", cut(ctrl.care_type, 400));
console.log("\n--- phase ---\n", cut(ctrl.phase, 400));

function voorbeeld(tab) {
  const c = D.find(d => Array.isArray(d[tab]) && d[tab].length > 0);
  console.log(`\n--- ${tab.toUpperCase()} voorbeeld${c ? " (" + c.id + ")" : ""} — keys + eerste record ---`);
  if (!c) { console.log("(bij GEEN beschikking data — leeg in BS2)"); return; }
  console.log("keys:", Object.keys(c[tab][0]).join(", "));
  console.log(cut(c[tab][0], 1600));
}
tabs.forEach(voorbeeld);

console.log("\n--- care_types[] ---\n", cut(DATA.care_types, 900));
console.log("\n--- phases[] ---\n", cut(DATA.phases, 900));
console.log("\nKlaar. Hieruit leid ik de exacte BS1-mapping af voor STAP 4 (writer).");
