#!/usr/bin/env node
/**
 * Inspecteer bs2-medewerkers-full.json (schrijft NIETS). STAP 3 van de
 * hardcore methodiek — toont totalen + exacte datastructuur van controle-
 * medewerker Samra, zodat de writer 1x goed wordt.
 *   node scripts/inspect-medewerkers.mjs
 */
import fs from "fs";
const P = "C:/Users/sonck/Downloads/bs2-medewerkers-full.json";
if (!fs.existsSync(P)) { console.error("FOUT: " + P + " niet gevonden."); process.exit(1); }
const recs = JSON.parse(fs.readFileSync(P, "utf8"));
const cut = (o, n = 1800) => { try { return JSON.stringify(o).slice(0, n); } catch { return String(o); } };

console.log("============================================================");
console.log("MEDEWERKERS:", recs.length, "| scrape-fouten:", recs.filter(r => r.error).length);

const tabs = ["certifications", "notes", "documents", "absence_short", "absence_long"];
const sum = {}, metN = {};
for (const t of tabs) { sum[t] = 0; metN[t] = 0; }
for (const r of recs) for (const t of tabs) { const n = Array.isArray(r[t]) ? r[t].length : 0; sum[t] += n; if (n) metN[t]++; }
console.log("\n--- TOTALEN PER TAB (records / bij hoeveel medewerkers) ---");
for (const t of tabs) console.log(`${t}: ${sum[t]} records, bij ${metN[t]}/${recs.length} medewerkers`);
const leaveYears = {};
for (const r of recs) for (const y of Object.keys(r.leave || {})) { if (r.leave[y] && Object.keys(r.leave[y]).length) leaveYears[y] = (leaveYears[y] || 0) + 1; }
console.log("verlof (departure-leave) gevuld per jaar:", JSON.stringify(leaveYears));

const s = recs.find(r => /akaazoun/i.test(r.naam || "") || /samra/i.test(r.naam || "")) || recs[0];
const d = s.detail || {};
console.log("\n============================================================");
console.log("CONTROLE-MEDEWERKER:", s.naam, "| #", s.employee_number, "| id", s.id);
console.log("\n--- detail TOP-LEVEL keys (" + Object.keys(d).length + ") ---\n", Object.keys(d).join(", "));
console.log("\n--- detail VOLLEDIG (afgekapt 6000) ---\n", cut(d, 6000));

// nested relatie-objecten apart tonen (vorm bepaalt mapping)
for (const k of ["address", "user", "organization", "professional", "details", "education", "skj", "trainings", "salary_scale", "salary_step", "shift_type_rates", "competencies", "locations", "teams", "agency", "caoType", "schedule_template"]) {
  if (d[k] !== undefined) console.log(`\n--- detail.${k} ---\n`, cut(d[k], 1400));
}
for (const t of tabs) {
  const arr = s[t] || [];
  console.log(`\n--- ${t} (${arr.length}) eerste record ---\n`, arr.length ? cut(arr[0], 1400) : "(leeg)");
}
console.log("\n--- leave[2026] ---\n", cut((s.leave || {})["2026"], 1400));

// voorbeeld van elke tab waar wél data is (om vorm te zien)
for (const t of tabs) {
  if ((s[t] || []).length) continue;
  const c = recs.find(x => Array.isArray(x[t]) && x[t].length > 0);
  console.log(`\n--- voorbeeld ${t}${c ? " (" + c.naam + ")" : ""} ---\n`, c ? cut(c[t][0], 1400) : "(bij GEEN medewerker data — leeg in BS2)");
}
console.log("\nPlak ALLES hierboven in de chat. Daarna bouw ik write-medewerkers-full.mjs.");
