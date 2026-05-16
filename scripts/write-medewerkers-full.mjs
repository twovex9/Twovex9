#!/usr/bin/env node
/**
 * STAP 4 — schrijf bs2-medewerkers-full.json naar BS1. NIET-destructief.
 *   node --env-file=scripts/.env scripts/write-medewerkers-full.mjs
 *
 * - medewerkers.data.bs2_scrape = VOLLEDIGE ruwe inhoud van ALLE tabs
 *   (detail + certifications + leave + notes + documents + verzuim) → 100% behoud.
 * - Schone API-velden → data jsonb (CORRIGEERT eerdere DOM-scrape: startdatum,
 *   locaties+kernteam via is_primary, uurtarief, salaris, opleidingen, etc.).
 * - Top-level kolommen alleen vullen, nooit met leeg overschrijven.
 * - Match op data->>'bs2_id' = detail.id (fallback employee_number / email).
 * - Sub-tabellen (notities/documenten/verzuim) NIET hier — aparte STAP 5.
 */
import fs from "fs";
const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT = "C:/Users/sonck/Downloads/bs2-medewerkers-full.json";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt (--env-file=scripts/.env)."); process.exit(1); }
if (!fs.existsSync(INPUT)) { console.error("FOUT: " + INPUT + " niet gevonden."); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const recs = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${recs.length} BS2-medewerkers\n`);

const nn = v => (v == null ? "" : String(v).trim());
const toNL = v => { const m = nn(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : nn(v); };
const DV = { hiring: "Inhuur", permanent: "Loondienst", intern: "Stagiair" };
const INH = { direct_hire: "Rechtstreekse plaatsing", via_agency: "Via bureau" };
const FUNC = { pedagogy_worker: "Pedagogisch medewerker", senior_pedagogy_worker: "Sr. Pedagogisch medewerker", behavioral_scientist: "Gedragswetenschapper", team_leader: "Teamleider", hr: "HR", planner: "Planner", director: "Directeur", admin: "Admin", owner: "Eigenaar" };

let ok = 0, skip = 0, err = 0;
const T = { uur: 0, start: 0, loc: 0, kern: 0, opl: 0, sal: 0, org: 0 };
const errors = [];

for (const r of recs) {
  if (r.error && !r.detail) { skip++; continue; }
  const d = r.detail || {};
  const det = d.details || {}, pro = d.professional || {}, edu = d.education || {}, adr = d.address || {}, org = d.organization || {};
  const locs = Array.isArray(d.locations) ? d.locations : [];
  const locNames = [...new Set(locs.map(l => nn(l.name)).filter(Boolean))];
  const kern = nn((locs.find(l => l.is_primary === true || l.is_primary === 1) || {}).name);
  const rates = Array.isArray(d.shift_type_rates) ? d.shift_type_rates : [];
  const certs = Array.isArray(r.certifications) ? r.certifications : [];
  const opl = certs.filter(c => c && !c.is_skj).map(c => ({ naam: nn(c.name), datum: toNL(c.date_of_issue) }));
  try {
    let rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,voornaam,achternaam,email,functie,dienstverband,data&data->>bs2_id=eq.${d.id}`, { headers: H });
    let rows = await rr.json();
    if ((!Array.isArray(rows) || !rows.length) && r.id) {
      rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,voornaam,achternaam,email,functie,dienstverband,data&data->>bs2_id=eq.${r.id}`, { headers: H });
      rows = await rr.json();
    }
    if ((!Array.isArray(rows) || !rows.length) && d.email) {
      rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,voornaam,achternaam,email,functie,dienstverband,data&data->>email=ilike.${encodeURIComponent(d.email)}`, { headers: H });
      rows = await rr.json();
    }
    if (!Array.isArray(rows) || !rows.length) { skip++; console.log(`SKIP geen BS1-match: ${r.naam} (#${r.employee_number})`); continue; }
    const m = rows[0]; const cur = m.data || {};

    const set = {}; const put = (k, v) => { v = (Array.isArray(v) ? v : nn(v)); if ((Array.isArray(v) ? v.length : v !== "")) set[k] = v; };
    // schone API-velden (BS2 = waarheid; corrigeert eerdere DOM-scrape)
    put("bsn", det.bsn); put("initialen", det.initials); put("roepnaam", det.nickname);
    put("contactNaam", det.emergency_contact_name); put("contactTel", det.emergency_contact_phone_number);
    put("verjaardag", toNL(d.date_of_birth)); put("taal", d.language); put("cao", d.cao_type && d.cao_type.name);
    put("inhuurtype", INH[d.hiring_type] || d.hiring_type);
    put("inhuurBedrijfsnaam", org.name); put("inhuurKvk", org.kvk); put("inhuurBtw", org.btw);
    put("inhuurVerzekering", det.self_insurance_policy);
    if (org.address) { put("inhuurStraat", org.address.street); put("inhuurHuisnummer", org.address.house_number); put("inhuurToevoeging", org.address.house_number_addition); put("inhuurPostcode", org.address.postcode); put("inhuurStad", org.address.city); if (org.name) T.org++; }
    put("straat", adr.street); put("huisnummer", adr.house_number); put("toevoeging", adr.house_number_addition);
    put("postcode", adr.postcode); put("plaats", adr.city); put("gemeente", adr.municipality);
    if (nn(pro.default_hourly_rate)) { set.uurAlgemeen = nn(pro.default_hourly_rate).replace(/[€\s]/g, "").replace(",", "."); T.uur++; }
    if (nn(pro.start_date)) { set.startdatum = toNL(pro.start_date); T.start++; }
    put("profEmail", pro.email); put("profTel", pro.phone); put("profIban", pro.iban);
    put("periodiekeMaand", pro.periodic_month); put("beoordelingsdatum", toNL(pro.performance_review_date));
    put("salarisschaal", pro.salary_scale); put("salaristrede", pro.salary_step);
    put("contracturen", pro.contract_hours); put("salaris", pro.salary); put("salaris36uur", pro.hour_salary_36);
    if (nn(pro.salary_scale) || nn(pro.salary)) T.sal++;
    set.urenVerleentzorg = pro.provides_care === true;
    set.urenHandmatigRegistreren = pro.can_register_time_manually === true;
    set.trainingBhv = edu.bhv === true; if (edu.bhv_date) set.trainingBhvDatum = toNL(edu.bhv_date);
    set.trainingGvVg = edu.gv_vg === true; if (edu.gv_vg_date) set.trainingGvVgDatum = toNL(edu.gv_vg_date);
    set.trainingMedicatie = edu.medication_training === true; if (edu.medication_training_date) set.trainingMedicatieDatum = toNL(edu.medication_training_date);
    set.skjRegistratie = edu.skj === true; put("skjNummer", edu.skj_registration_number);
    if (locNames.length) { set.locatiesSelected = locNames; set.locatiesTags = locNames.join(", "); T.loc++; }
    if (kern) { set.kernteam = kern; T.kern++; }
    if (rates.length) { set.shift_type_rates = Object.fromEntries(rates.filter(x => x.rate != null).map(x => [nn(x.name), Number(nn(x.rate).replace(",", ".")) || nn(x.rate)])); }
    if (opl.length) { set.opleidingItems = opl; T.opl++; }
    if (Array.isArray(pro.company_assets) && pro.company_assets.length) set.bs2_company_assets = pro.company_assets;

    const mergedData = {
      ...cur, ...set,
      bs2_detail: d,
      bs2_scrape: { detail: d, certifications: certs, leave: r.leave || {}, notes: r.notes || [], documents: r.documents || [], absence_short: r.absence_short || [], absence_long: r.absence_long || [] },
      bs2_scrape_at: new Date().toISOString(),
    };
    const body = { data: mergedData, laatst_gewijzigd: new Date().toISOString() };
    const func = FUNC[pro.job_function] || pro.job_function;
    if (nn(d.first_name) && !nn(m.voornaam)) body.voornaam = d.first_name;
    if (nn(d.last_name) && !nn(m.achternaam)) body.achternaam = d.last_name;
    if (nn(d.email) && !nn(m.email)) body.email = d.email;
    if (nn(func) && !nn(m.functie)) body.functie = func;
    if (DV[d.employment_type] && !nn(m.dienstverband)) body.dienstverband = DV[d.employment_type];

    const pr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?id=eq.${m.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });
    if (!pr.ok) throw new Error(`${pr.status}: ${(await pr.text()).slice(0, 180)}`);
    ok++;
    if (ok % 15 === 0) console.log(`  ... ${ok} medewerkers bijgewerkt`);
  } catch (e) { err++; errors.push(`${r.naam}: ${e.message}`); console.log(`FOUT ${r.naam}: ${e.message}`); }
}

console.log(`\n=== EINDREPORT ===`);
console.log(`Bijgewerkt: ${ok}  | Skipped: ${skip}  | Errors: ${err}`);
console.log(`Gevuld -> uurAlgemeen:${T.uur} startdatum:${T.start} locaties:${T.loc} kernteam:${T.kern} opleidingen:${T.opl} salaris:${T.sal} inhuur-org:${T.org}`);
console.log(`Volledige ruwe scrape (alle tabs) in data.bs2_scrape voor alle ${ok}.`);
console.log(`Sub-tabellen notities/documenten/verzuim: STAP 5 (aparte reconciliatie).`);
if (errors.length) { console.log("\nFouten:"); errors.forEach(e => console.log("  - " + e)); }
