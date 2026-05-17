#!/usr/bin/env node
/**
 * Inspecteer bs2-medewerkers-full.json (schrijft NIETS).
 * TOP-BAR Medewerkers (BS2 /main-employee/employees → /api/employees-basic).
 * APART van HR-medewerkers. STAP 3 van de hardcore methodiek — counts,
 * veld-stats, distributies en of `detail` extra velden heeft.
 *   node scripts/inspect-main-employees.mjs
 *
 * Pakt automatisch het nieuwste bs2-medewerkers-full*.json in Downloads
 * (browser-dedupe " (1)" wordt zo ook gevonden).
 */
import fs from "fs";
import path from "path";
import os from "os";

const DL = path.join(os.homedir(), "Downloads");
function resolveInput() {
  const exact = path.join(DL, "bs2-medewerkers-full.json");
  if (fs.existsSync(exact)) return exact;
  const cands = fs.readdirSync(DL)
    .filter((f) => /^bs2-medewerkers-full.*\.json$/i.test(f))
    .map((f) => ({ f, m: fs.statSync(path.join(DL, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return cands.length ? path.join(DL, cands[0].f) : exact;
}
const P = resolveInput();
if (!fs.existsSync(P)) { console.error("FOUT: geen bs2-medewerkers-full*.json in " + DL); process.exit(1); }
console.log("Bestand:", P);

const root = JSON.parse(fs.readFileSync(P, "utf8"));
const E = Array.isArray(root) ? root : (root.employees || []);
console.log("counts:", JSON.stringify(root.counts || {}));
console.log("diag:", Array.isArray(root.diag) ? root.diag.join(" | ") : root.diag);
console.log("employees:", E.length);

const KEYS = ["id", "first_name", "last_name", "is_plannable", "email", "phone",
  "employee_number", "employment_end_date", "date_of_birth", "notes",
  "employment_type", "avatar", "is_sick", "sickness_start_date"];

const sameKeys = E.every((e) => KEYS.every((k) => k in e));
console.log("alle records hebben de 14 basisvelden:", sameKeys);

const detailExtra = new Set(); let detailDiff = 0; let detailNull = 0;
E.forEach((e) => {
  if (!e.detail) { detailNull++; return; }
  Object.keys(e.detail).forEach((k) => { if (!KEYS.includes(k)) detailExtra.add(k); });
  KEYS.forEach((k) => { if (JSON.stringify(e.detail[k]) !== JSON.stringify(e[k])) detailDiff++; });
});
console.log("detail extra velden:", [...detailExtra].join(",") || "(geen)");
console.log("detail≠basis veld-diffs:", detailDiff, " | detail==null:", detailNull);

console.log("\n--- null/leeg per veld ---");
KEYS.forEach((k) => {
  let nul = 0, leeg = 0;
  E.forEach((e) => { const v = e[k]; if (v == null) nul++; else if (v === "") leeg++; });
  console.log(`  ${k}: null=${nul} leeg=${leeg}`);
});

const dist = (k) => {
  const m = {};
  E.forEach((e) => { const v = String(e[k]); m[v] = (m[v] || 0) + 1; });
  return JSON.stringify(m);
};
console.log("\nemployment_type:", dist("employment_type"));
console.log("is_plannable:", dist("is_plannable"));
console.log("is_sick:", dist("is_sick"));

const ids = E.map((e) => e.id);
const nums = E.map((e) => e.employee_number);
console.log("\nunieke id:", new Set(ids).size, "/", ids.length);
console.log("unieke employee_number:", new Set(nums).size, "/", nums.length,
  "min", Math.min(...nums), "max", Math.max(...nums));
console.log("met employment_end_date:", E.filter((e) => e.employment_end_date).length);
console.log("is_sick=true:", E.filter((e) => e.is_sick).length);
console.log("BS2-testrecords (naam ~ test/zzz/claude):",
  JSON.stringify(E.filter((e) => /zzz|claude|test/i.test((e.first_name || "") + " " + (e.last_name || "")))
    .map((e) => `${e.first_name} ${e.last_name} (#${e.employee_number})`)));

const sample = E[0];
console.log("\n--- voorbeeldrecord[0] ---\n" + JSON.stringify(sample, null, 1).slice(0, 1600));
console.log("\nPlak ALLES hierboven in de chat.");
