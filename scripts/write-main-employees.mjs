#!/usr/bin/env node
/**
 * Schrijf bs2-medewerkers-full.json → BS1 tabel public.main_employees.
 * TOP-BAR Medewerkers (BS2 /main-employee/employees → /api/employees-basic).
 * APART van HR-medewerkers — raakt public.medewerkers NIET aan.
 *
 *   node --env-file=scripts/.env scripts/write-main-employees.mjs
 *
 * Niet-destructief & idempotent: upsert op id (= BS2 employee uuid).
 * 14 BS2-velden verbatim → kolommen; VOLLEDIGE ruwe record (incl. detail)
 * → data.bs2_scrape (100% behoud, redding bij datacorruptie).
 * Pakt automatisch het nieuwste bs2-medewerkers-full*.json in Downloads.
 */
import fs from "fs";
import path from "path";
import os from "os";

const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt (--env-file=scripts/.env)."); process.exit(1); }

const DL = path.join(os.homedir(), "Downloads");
// Robuust: kies het NIEUWSTE bestand dat ook echt de TOP-BAR employees-basic
// scrape is. Een stale `bs2-medewerkers-full.json` van een oudere/HR-scrape
// (andere structuur, geen first_name/is_sick) wordt overgeslagen.
function isTopbarScrape(file) {
  try {
    const root = JSON.parse(fs.readFileSync(file, "utf8"));
    const src = String((root && root.source) || "");
    const E = Array.isArray(root) ? root : (root.employees || []);
    const e0 = E[0] || {};
    return /employees-basic/i.test(src)
      && Object.prototype.hasOwnProperty.call(e0, "first_name")
      && Object.prototype.hasOwnProperty.call(e0, "is_sick");
  } catch (e) { return false; }
}
function resolveInput() {
  const all = fs.readdirSync(DL)
    .filter((f) => /^bs2-medewerkers-full.*\.json$/i.test(f))
    .map((f) => ({ p: path.join(DL, f), f, m: fs.statSync(path.join(DL, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  const valid = all.filter((x) => isTopbarScrape(x.p));
  if (!valid.length) {
    console.error("FOUT: geen geldige TOP-BAR employees-basic scrape in " + DL + ".");
    console.error("Gevonden bs2-medewerkers-full*.json: " + (all.map((x) => x.f).join(", ") || "(geen)"));
    console.error("Verwacht: source bevat 'employees-basic' + records met first_name & is_sick.");
    console.error("Draai scripts/bs2-console-scrape-medewerkers.js opnieuw op /main-employee/employees.");
    process.exit(1);
  }
  if (all[0] && !isTopbarScrape(all[0].p)) {
    console.warn("LET OP: nieuwste bestand " + all[0].f + " is GEEN top-bar scrape (stale) — overgeslagen.");
  }
  return valid[0].p; // nieuwste GELDIGE
}
const INPUT = resolveInput();
console.log("Bestand:", INPUT);

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

async function must(resOrP, what) {
  const res = await resOrP;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(what + " → HTTP " + res.status + " " + t.slice(0, 600));
  }
  return res;
}

const root = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const E = Array.isArray(root) ? root : (root.employees || []);
console.log(`Geladen: ${E.length} BS2-medewerkers (top-bar employees-basic)\n`);
if (!E.length) { console.error("FOUT: 0 records in bestand."); process.exit(1); }

const isoDate = (v) => { const m = (v || "").toString().match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const scrapedAt = root.scraped_at || new Date().toISOString();

const rows = E.map((r) => ({
  id: r.id,
  first_name: r.first_name == null ? "" : String(r.first_name),
  last_name: r.last_name == null ? "" : String(r.last_name),
  is_plannable: r.is_plannable === true,
  email: r.email == null ? null : String(r.email),
  phone: r.phone == null ? null : String(r.phone),
  employee_number: Number.isFinite(+r.employee_number) ? +r.employee_number : null,
  employment_end_date: isoDate(r.employment_end_date),
  date_of_birth: isoDate(r.date_of_birth),
  notes: r.notes == null ? null : String(r.notes),
  employment_type: r.employment_type == null ? null : String(r.employment_type), // verbatim
  avatar: r.avatar == null ? null : String(r.avatar),
  is_sick: r.is_sick === true,
  sickness_start_date: r.sickness_start_date || null,
  archived: false,
  laatst_gewijzigd: new Date().toISOString(),
  data: { bs2_id: r.id, bs2_scrape: r, bs2_scrape_at: scrapedAt },
}));

let done = 0;
for (let i = 0; i < rows.length; i += 100) {
  const slice = rows.slice(i, i + 100);
  await must(
    fetch(`${SUPABASE_URL}/rest/v1/main_employees?on_conflict=id`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(slice),
    }),
    "upsert main_employees [" + i + "]"
  );
  done = Math.min(i + 100, rows.length);
  console.log(`  geüpsert ${done}/${rows.length}`);
}

const cnt = await must(
  fetch(`${SUPABASE_URL}/rest/v1/main_employees?select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } }),
  "count main_employees"
);
const cr = cnt.headers.get("content-range");
console.log(`\n=== EINDREPORT ===`);
console.log(`BS2-records: ${E.length}  | upsert klaar: ${done}`);
console.log(`Supabase main_employees count (content-range): ${cr}`);
console.log(`Raw 100% bewaard in data.bs2_scrape (incl. detail). public.medewerkers NIET aangeraakt.`);
