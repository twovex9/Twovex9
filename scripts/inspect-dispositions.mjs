#!/usr/bin/env node
/**
 * STAP 3 — Inspecteer bs2-dispositions-full.json (schrijft NIETS).
 * Leest ÁLLE C:/Users/sonck/Downloads/bs2-dispositions-full*.json (incl. " (1)"
 * dedup-variant), kiest de rijkste, toont de exacte rij-structuur en REKENT
 * elke dashboard-KPI na uit de volledige 155-dispositions-set + 956 payments.
 *
 * Doel: bewijzen dat we de KPI's exact uit BS2's eigen per-rij-velden kunnen
 * reproduceren VOORDAT we iets bouwen/reconciliëren:
 *   active=89  pending=10  overdue_60d=8
 *   paid=764204.59/67  declared_pending=273614.13/11
 *   not_yet_declared=600738.98  to_be_declared_current_month=63503.64
 *   outstanding=664242.62  + care_types/locations/payment_methods/processing_time
 *
 *   node scripts/inspect-dispositions.mjs
 */
import fs from "fs";
import path from "path";

const DL = "C:/Users/sonck/Downloads";
const PHASE_ACTIEF = "d2b9186d-8335-49f4-b030-5b5d76f12a69";
const PHASE_AANVRAAG = "4d5bde08-2a9e-4509-bee5-e50feabf0340";
const PERIOD = { start: "2026-01-01", end: "2026-12-31" }; // dashboard default = lopend jaar

const T = {
  active: 89, pending: 10, overdue60: 8,
  paid: 764204.59, paidInv: 67,
  declPending: 273614.13, pendInv: 11,
  notYetDeclared: 600738.98,
  toDeclareThisMonth: 63503.64,
  outstanding: 664242.62,
};

// ---------- bestand kiezen (rijkste = meeste active dispositions) ----------
const files = fs.readdirSync(DL).filter(f => /^bs2-dispositions-full.*\.json$/i.test(f));
if (!files.length) { console.error("FOUT: geen bs2-dispositions-full*.json in " + DL); process.exit(1); }
let DATA = null, gekozen = "", best = -1;
for (const f of files) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8"));
    const n = (o.dispositions_active || o.active || []).length + (o.dispositions_trashed || o.trashed || []).length;
    if (n >= best) { best = n; DATA = o; gekozen = f; }
  } catch (e) { console.error("Parse-fout", f, e.message); }
}
console.log("Bestanden:", files.join(", "));
console.log("Gekozen (rijkste):", gekozen, "\n");

const active = DATA.dispositions_active || DATA.active || [];
const trashed = DATA.dispositions_trashed || DATA.trashed || [];
const payments = DATA.payments || [];
const careTypes = DATA.care_types || [];
const phases = DATA.phases || [];
const ALL = [...active, ...trashed];

console.log("============================================================");
console.log(`active=${active.length}  trashed=${trashed.length}  TOTAAL=${ALL.length}  payments=${payments.length}  care_types=${careTypes.length}  phases=${phases.length}`);
console.log("Top-level keys JSON:", Object.keys(DATA).join(", "));

// ---------- helpers ----------
const cut = (o, n = 2600) => { try { return JSON.stringify(o, null, 1).slice(0, n); } catch { return String(o); } };
function get(o, p) { return p.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[€\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const eur = n => "€" + n.toFixed(2);
const ok = (got, exp, tol = 0.05) => (typeof exp === "number" && typeof got === "number" && Math.abs(got - exp) <= tol) ? "✅" : (got === exp ? "✅" : "❌");
const within = (d, a, b) => { if (!d) return false; const x = String(d).slice(0, 10); return x >= a && x <= b; };

// ---------- structuur tonen ----------
const d0 = ALL[0] || {};
console.log("\n============================================================");
console.log("DISPOSITION rij — alle " + Object.keys(d0).length + " keys:\n", Object.keys(d0).sort().join(", "));
console.log("\n--- dispositions[0] VOLLEDIG (afgekapt) ---\n", cut(d0, 5000));
for (const k of ["client", "care_type", "careType", "phase", "current_phase", "location", "rates", "amounts"]) {
  if (d0[k] !== undefined) console.log(`\n--- dispositions[0].${k} ---\n`, cut(d0[k], 1500));
}
// rij met meeste keys (rijkste vorm) ook tonen
const richest = ALL.reduce((a, b) => (Object.keys(b || {}).length > Object.keys(a || {}).length ? b : a), d0);
if (richest !== d0) console.log("\n--- RIJKSTE disposition-rij (" + Object.keys(richest).length + " keys) ---\n", cut(richest, 4000));

const p0 = payments[0] || {};
console.log("\n============================================================");
console.log("PAYMENT rij — alle " + Object.keys(p0).length + " keys:\n", Object.keys(p0).sort().join(", "));
console.log("\n--- payments[0] VOLLEDIG ---\n", cut(p0, 2600));
console.log("\n--- care_types[] ---\n", cut(careTypes, 1800));
console.log("\n--- phases[] ---\n", cut(phases, 1800));

// ---------- KPI-reconstructie ----------
console.log("\n============================================================");
console.log("KPI-RECONSTRUCTIE (per-rij-veld scommeren/tellen over de volledige set)");
console.log("============================================================");

// fase-detectie: probeer meerdere veldpaden
const phasePaths = ["phase_uuid", "phase.id", "phase.uuid", "phase", "current_phase.id", "current_phase_id", "current_phase", "status", "phase_id"];
console.log("\n[FASE] kandidaat-velden → telling Actief / In aanvraag:");
let bestPhasePath = null;
for (const pp of phasePaths) {
  const vals = ALL.map(r => get(r, pp)).filter(v => v != null);
  if (!vals.length) continue;
  const a = ALL.filter(r => get(r, pp) === PHASE_ACTIEF).length;
  const p = ALL.filter(r => get(r, pp) === PHASE_AANVRAAG).length;
  const sample = [...new Set(vals.map(v => (typeof v === "object" ? JSON.stringify(v) : v)))].slice(0, 6);
  console.log(`  ${pp.padEnd(20)} Actief=${a} Aanvraag=${p}  | sample: ${sample.join(" , ").slice(0, 120)}`);
  if (a === T.active && p === T.pending && !bestPhasePath) bestPhasePath = pp;
}
const apActief = bestPhasePath ? ALL.filter(r => get(r, bestPhasePath) === PHASE_ACTIEF).length : -1;
const apAanvraag = bestPhasePath ? ALL.filter(r => get(r, bestPhasePath) === PHASE_AANVRAAG).length : -1;
console.log(`\n  active_dispositions   = ${apActief}  (verwacht ${T.active})  ${ok(apActief, T.active)}  via "${bestPhasePath}"`);
console.log(`  pending_dispositions  = ${apAanvraag}  (verwacht ${T.pending})  ${ok(apAanvraag, T.pending)}`);

// scommeerbare per-rij bedragen: probeer meerdere veldnamen
function probeSum(label, paths, expected) {
  console.log(`\n[${label}] kandidaat-velden → som over ${ALL.length} dispositions:`);
  let bestVal = null, bestPath = null;
  for (const pp of paths) {
    const present = ALL.filter(r => get(r, pp) != null).length;
    if (!present) { console.log(`  ${pp.padEnd(34)} (niet aanwezig)`); continue; }
    const s = ALL.reduce((a, r) => a + num(get(r, pp)), 0);
    const mark = (expected != null && Math.abs(s - expected) <= 0.05) ? "  ← MATCH ✅" : "";
    console.log(`  ${pp.padEnd(34)} som=${s.toFixed(2)}  (${present}/${ALL.length} gevuld)${mark}`);
    if (expected != null && Math.abs(s - expected) <= 0.05 && bestPath == null) { bestVal = s; bestPath = pp; }
  }
  return { bestVal, bestPath };
}
const ny = probeSum("not_yet_declared", ["not_yet_declared", "not_yet_declared_amount", "amounts.not_yet_declared"], T.notYetDeclared);
const tm = probeSum("to_be_declared_current_month", ["to_be_declared_current_month", "amounts.to_be_declared_current_month"], T.toDeclareThisMonth);
const ot = probeSum("outstanding_to_declare", ["outstanding_to_declare", "outstanding", "amounts.outstanding_to_declare"], T.outstanding);

// overdue 60d: is_overdue + dagen > 60
console.log("\n[overdue_60d] kandidaat-combinaties:");
const overduePaths = ["is_overdue", "overdue", "amounts.is_overdue"];
const dayPaths = ["overdue_days", "days_overdue", "days_since_due", "overdue_since_days", "days_outstanding"];
for (const op of overduePaths) {
  const flagged = ALL.filter(r => get(r, op) === true || get(r, op) === 1);
  if (!flagged.length && ALL.filter(r => get(r, op) != null).length === 0) { console.log(`  ${op}: (niet aanwezig)`); continue; }
  console.log(`  ${op}: ${flagged.length} rijen met flag=true`);
  for (const dp of dayPaths) {
    const has = flagged.filter(r => get(r, dp) != null).length;
    if (!has) continue;
    const c = flagged.filter(r => num(get(r, dp)) > 60).length;
    console.log(`     & ${dp} > 60  → ${c}  ${ok(c, T.overdue60)}`);
  }
  console.log(`     (alleen flag, geen dagen-filter) → ${flagged.length}  ${ok(flagged.length, T.overdue60)}`);
}

// ---------- periode-afhankelijke KPI's uit payments ----------
console.log("\n============================================================");
console.log(`PAYMENTS — periode ${PERIOD.start} .. ${PERIOD.end}`);
const statusPaths = ["status", "state", "payment_status"];
let sp = statusPaths.find(s => payments.some(p => get(p, s) != null)) || "status";
const stats = {};
for (const p of payments) { const s = get(p, sp) || "(leeg)"; stats[s] = (stats[s] || 0) + 1; }
console.log(`status-veld = "${sp}"  | verdeling:`, JSON.stringify(stats));
const amtPaths = ["amount", "total_amount", "amount_incl", "total", "value"];
let ap = amtPaths.find(a => payments.some(p => get(p, a) != null)) || "amount";
const datePaths = ["paid_at", "paidAt", "payment_date", "paid_on", "settled_at"];
let dp = datePaths.find(d => payments.some(p => get(p, d) != null)) || "paid_at";
console.log(`bedrag-veld = "${ap}"  betaaldatum-veld = "${dp}"`);

function payAgg(statusVal, dateField) {
  const rows = payments.filter(p => String(get(p, sp)) === statusVal && within(get(p, dateField), PERIOD.start, PERIOD.end));
  return { sum: rows.reduce((a, r) => a + num(get(r, ap)), 0), count: rows.length };
}
// 'paid' status
const paidStatus = Object.keys(stats).find(s => /paid|betaald/i.test(s) && !/pending|declared/i.test(s)) || "paid";
const declStatus = Object.keys(stats).find(s => /declared_pending|pending|gedeclareerd/i.test(s)) || "declared_pending";
const paidAgg = payAgg(paidStatus, dp);
console.log(`\npaid_amount      status="${paidStatus}" datum∈periode → ${eur(paidAgg.sum)} / ${paidAgg.count}  (verwacht ${eur(T.paid)} / ${T.paidInv})  ${ok(paidAgg.sum, T.paid)} ${ok(paidAgg.count, T.paidInv)}`);
// declared_pending: probeer paid_at én andere datumvelden
for (const df of [dp, "declared_at", "declaration_date", "created_at", "period_end", "period.end"]) {
  if (!payments.some(p => get(p, df) != null)) continue;
  const a = payAgg(declStatus, df);
  const m = (Math.abs(a.sum - T.declPending) <= 0.05 && a.count === T.pendInv) ? "  ← MATCH ✅" : "";
  console.log(`declared_pending status="${declStatus}" datum="${df}"∈periode → ${eur(a.sum)} / ${a.count}${m}`);
}

// ---------- breakdowns ----------
function breakdown(label, paths) {
  const pp = paths.find(p => ALL.some(r => get(r, p) != null));
  console.log(`\n[breakdown ${label}] via "${pp}":`);
  if (!pp) { console.log("  (geen veld gevonden, kandidaten:", paths.join(", "), ")"); return; }
  const m = {};
  for (const r of ALL) { const v = get(r, pp); const key = (v && typeof v === "object" ? (v.name || v.label || JSON.stringify(v)) : (v == null ? "(leeg)" : String(v))); m[key] = (m[key] || 0) + 1; }
  for (const [k, v] of Object.entries(m).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(34)} ${v}`);
  console.log(`  som=${Object.values(m).reduce((a, b) => a + b, 0)}`);
}
breakdown("care_types", ["care_type.name", "care_type", "careType.name", "care_type_name", "careType"]);
breakdown("locations", ["client.location.name", "client.location", "location.name", "location", "client.location_name"]);
breakdown("payment_methods", ["declaration_method", "declarationMethod", "client.declaration_method", "payment_method", "declaration_method.name"]);

// processing_time: BS2 toonde 30+ d 587 / 21-30 d 54 / 11-20 d 131 / 0-10 d 133 (som 905)
console.log("\n[breakdown processing_time] zoek bron die 587/54/131/133 (som 905) geeft:");
const procDayCandidates = [
  { src: "payments", paths: ["processing_days", "days_to_pay", "processing_time", "lead_time_days"] },
  { src: "dispositions", paths: ["processing_days", "avg_processing_days", "processing_time"] },
];
for (const cand of procDayCandidates) {
  const set = cand.src === "payments" ? payments : ALL;
  for (const pth of cand.paths) {
    if (!set.some(r => get(r, pth) != null)) continue;
    const b = { "0-10": 0, "11-20": 0, "21-30": 0, "30+": 0 };
    for (const r of set) { const v = get(r, pth); if (v == null) continue; const n = num(v); if (n <= 10) b["0-10"]++; else if (n <= 20) b["11-20"]++; else if (n <= 30) b["21-30"]++; else b["30+"]++; }
    console.log(`  ${cand.src}.${pth}: 0-10=${b["0-10"]} 11-20=${b["11-20"]} 21-30=${b["21-30"]} 30+=${b["30+"]} (som ${b["0-10"]+b["11-20"]+b["21-30"]+b["30+"]})`);
  }
}

console.log("\n============================================================");
console.log("SAMENVATTING (verwacht ← → berekend):");
console.log(`  active_dispositions   89  ← ${apActief}  ${ok(apActief, T.active)}`);
console.log(`  pending_dispositions  10  ← ${apAanvraag}  ${ok(apAanvraag, T.pending)}`);
console.log(`  not_yet_declared      ${eur(T.notYetDeclared)}  ← ${ny.bestVal != null ? eur(ny.bestVal) : "(?)"}  ${ny.bestVal != null ? "✅" : "❌"}  veld="${ny.bestPath || "?"}"`);
console.log(`  to_be_declared_month  ${eur(T.toDeclareThisMonth)}  ← ${tm.bestVal != null ? eur(tm.bestVal) : "(?)"}  ${tm.bestVal != null ? "✅" : "❌"}  veld="${tm.bestPath || "?"}"`);
console.log(`  outstanding_to_declare ${eur(T.outstanding)}  ← ${ot.bestVal != null ? eur(ot.bestVal) : "(?)"}  ${ot.bestVal != null ? "✅" : "❌"}  veld="${ot.bestPath || "?"}"`);
console.log(`  paid_amount           ${eur(T.paid)}/${T.paidInv}  ← ${eur(paidAgg.sum)}/${paidAgg.count}  ${ok(paidAgg.sum, T.paid)}`);
console.log("\nPlak ALLES hierboven in de chat. Dan map ik elk veld 1-op-1 in write-dispositions-full.mjs + bouw het BS1-dashboard.");
