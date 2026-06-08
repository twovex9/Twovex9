#!/usr/bin/env node
/**
 * write-prof.mjs v4 — schrijf de scrape (DOM + BS2-API) + leid opleidingen/SKJ
 * af uit het reeds geïmporteerde data.bs2_certifications, naar BS1.
 *
 *   node --env-file=scripts/.env scripts/write-prof.mjs
 *
 * Bronnen per veld (meest betrouwbare wint):
 *  - DOM-scrape (rec.tabs): uurAlgemeen, prof e-mail/tel/IBAN, functie,
 *    periodieke, locaties+kernteam (mash-fix), voorzieningen, urenregistratie,
 *    contactpersoon, diensttype-tarieven, BHV/GV&VG/Medicatie, status
 *  - rec.tabs.*.dates / rec.api.start_date: startdatum + beoordelingsdatum
 *  - bestaande data.bs2_certifications: opleidingItems + skjRegistratie
 * Regels: nooit een gevuld veld met leeg overschrijven; arrays alleen bij >0;
 * booleans alleen zetten als die tab daadwerkelijk gescrapet is (anti-wipe);
 * volledige ruwe scrape bewaard in data.bs2_scrape.
 */
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DL = "C:/Users/sonck/Downloads";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt (--env-file=scripts/.env)."); process.exit(1); }

const files = fs.readdirSync(DL).filter(f => /^bs2-prof.*\.json$/i.test(f) && !/samra/i.test(f) && !/^bs2-prof-0-3\b/i.test(f));
if (!files.length) { console.error("FOUT: geen geldige bs2-prof-*.json (volledige run) in " + DL); process.exit(1); }
console.log("Inputbestanden:", files.join(", "));
function richness(r) { const p = (r && r.tabs && r.tabs.professional) || {}; return Object.keys(p.fields || {}).length + (p.checks || []).length + (p.dates || []).length + (r && r.api ? 5 : 0); }
const byId = new Map();
for (const f of files) {
  let arr; try { arr = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8")); } catch (e) { console.error("Parse-fout", f, e.message); continue; }
  for (const r of arr) { if (!r || !r.id || !r.tabs || !r.tabs.professional) continue; const ex = byId.get(r.id); if (!ex || richness(r) >= richness(ex)) byId.set(r.id, r); }
}
const records = [...byId.values()];
console.log(`Geladen: ${records.length} unieke medewerkers\n`);

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const PLACEHOLDER = /^(selecteer|kies|dd-mm-jjjj|dd-mm-yyyy|—|-|n\.v\.t\.?|geen|selecteer een maand|selecteer competenties|voer .* in)$/i;
const v = x => { x = (x ?? "").toString().trim(); return (!x || PLACEHOLDER.test(x)) ? "" : x; };
function find(fields, ...needles) {
  for (const k of Object.keys(fields || {})) { const l = k.toLowerCase(); if (needles.every(n => l.includes(n.toLowerCase()))) { const val = v(fields[k]); if (val) return val; } }
  return "";
}
function euroNum(x) { x = (x || "").toString(); const m = x.replace(/[€\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".").match(/\d+(\.\d+)?/); return m ? m[0] : ""; }
function toNL(d) { d = (d || "").toString().trim(); let m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; m = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); return m ? `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}` : ""; }
function dateBy(datesArr, re) { for (const d of datesArr || []) { if (re.test((d.section || "") + " " + (d.label || ""))) { const x = toNL(d.date); if (x) return x; } } return ""; }
const SKIPD = /verjaardag|geboorte|\bbirth|medewerker gegevens|persoonsgegevens|uit dienst|terugkeer|ziekte|eerste ziektedag|verwachte|werkelijke|beoordel|waarschuw|verloopt|verlopen|contract|opleiding|diploma|aangemaakt|gewijzigd|created|updated/i;
// Startdatum ALLEEN uit een "Professionele gegevens / startdatum"-sectie of de
// API start_date. GEEN generieke fallback (pakte anders de geboortedatum onder
// "Medewerker gegevens"). Datum die gelijk is aan DOB wordt altijd geweigerd.
function pickStart(arr, api, dobExtra) {
  const dob = new Set([toNL(api && api.date_of_birth), toNL(dobExtra)].filter(Boolean));
  for (const d of arr || []) {
    const s = (d.section || "") + " " + (d.label || "");
    if (SKIPD.test(s)) continue;
    if (/professionele|startdatum|start datum|datum in dienst|in dienst sinds/i.test(s)) {
      const x = toNL(d.date); if (x && !dob.has(x)) return x;
    }
  }
  const a = toNL(api && api.start_date);
  return a && !dob.has(a) ? a : "";
}
function cb(checks, re) { return (checks || []).some(c => c.checked && re.test((c.label || "") + " " + (c.section || ""))); }
function hasSec(checks, re) { return (checks || []).some(c => re.test((c.section || "") + " " + (c.label || ""))); }
function cleanLoc(s) { return (s || "").replace(/kernteam|locaties|locatie|markeer het primaire team per locatie/gi, "").replace(/\s+/g, " ").trim(); }

let ok = 0, skip = 0, err = 0;
const errors = [];
const T = { uur: 0, start: 0, beoord: 0, func: 0, loc: 0, kern: 0, opl: 0, skj: 0, rates: 0, profmail: 0, bhv: 0, uit: 0, sal: 0, bureau: 0, skjnr: 0 };

for (const rec of records) {
  if (!rec.tabs && rec.error) { skip++; continue; }
  const D = rec.tabs?.details?.fields || {}, P = rec.tabs?.professional?.fields || {}, E = rec.tabs?.education?.fields || {};
  const Pc = rec.tabs?.professional?.checks || [], Ec = rec.tabs?.education?.checks || [];
  const Pt = rec.tabs?.professional?.tables || [];
  const Pd = rec.tabs?.professional?.dates || [], Dd = rec.tabs?.details?.dates || [];
  const api = rec.api || {};
  const allText = [rec.tabs?.details?.pageText, rec.tabs?.professional?.pageText, rec.tabs?.education?.pageText].filter(Boolean).join(" \n ");

  const patch = { bs2_scrape: rec.tabs, bs2_api: api, bs2_scrape_at: new Date().toISOString() };
  const set = (k, val) => { if (val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && !val.length)) patch[k] = val; };

  // Details
  set("roepnaam", find(D, "roepnaam"));
  set("initialen", find(D, "initialen"));
  set("contactNaam", find(D, "contact", "naam"));
  set("contactTel", find(D, "contact", "telefoon"));

  // Professioneel
  const uur = euroNum(find(P, "algemeen", "uurtarief") || find(P, "algemeen", "tarief"));
  if (uur) { set("uurAlgemeen", uur); T.uur++; }
  set("profEmail", find(P, "professionele", "mail")); if (patch.profEmail) T.profmail++;
  set("profTel", find(P, "professionele", "telefoon"));
  set("profIban", find(P, "iban"));
  const functie = find(P, "functie"); if (functie) T.func++;
  set("periodiekeMaand", find(P, "periodieke"));

  // Eerder gemist (uit uitputtende kruiscontrole): Salaris (Loondienst) + Bureau + SKJ-nummer
  const sschaal = find(P, "salaris", "schaal"), strede = find(P, "salaris", "trede"), curen = find(P, "salaris", "contracturen") || find(P, "contracturen");
  if (sschaal) { set("salarisschaal", sschaal); T.sal++; }
  if (strede) set("salaristrede", strede);
  if (curen) set("contracturen", curen);
  const apiAgency = api && api.agency ? (typeof api.agency === "object" ? (api.agency.name || api.agency.naam || "") : api.agency) : "";
  const bureau = find(D, "bureau") || apiAgency;
  if (bureau) { set("bureau", bureau); T.bureau++; }
  const skjnr = find(E, "skj", "registratienummer") || find(E, "skj", "nummer");
  if (skjnr) { set("skjNummer", skjnr); T.skjnr++; }

  // Startdatum wordt ná de row-fetch bepaald (dan kennen we cur.verjaardag
  // als extra DOB-guard).
  const beoord = dateBy(Pd, /beoordel/i); if (beoord) { set("beoordelingsdatum", beoord); T.beoord++; }

  // Locaties + Kernteam (mash-fix: "MagdalenenstraatKernteam" -> Magdalenenstraat + kernteam)
  const locChecks = (Pc || []).filter(c => c.checked && /locatie|kernteam/i.test(c.section || ""));
  const locaties = [...new Set(locChecks.map(c => cleanLoc(c.label)).filter(Boolean).filter(x => !/^kernteam$/i.test(x)))];
  if (locaties.length) { set("locatiesSelected", locaties); set("locatiesTags", locaties.join(", ")); T.loc++; }
  let kern = "";
  for (const c of locChecks) { if (/kernteam/i.test(c.label || "") || /kernteam/i.test(c.section || "")) { kern = cleanLoc(c.label); if (kern) break; } }
  if (kern) { set("kernteam", kern); T.kern++; }

  // Voorzieningen + urenregistratie — alleen zetten als Professioneel-tab echt gescrapet is
  if (hasSec(Pc, /voorziening|laptop|sleutel|simkaart|fiets/i) || Object.keys(P).length) {
    for (const [k, re] of [["voorzLaptop", /laptop/i], ["voorzSleutels", /sleutel/i], ["voorzTelefoon", /telefoon/i], ["voorzSimkaart", /simkaart/i], ["voorzAuto", /\bauto\b/i], ["voorzFiets", /fiets/i], ["urenVerleentzorg", /verleent zorg/i], ["urenHandmatigRegistreren", /handmatig/i]]) patch[k] = cb(Pc, re);
  }

  // Diensttype-specifieke tarieven (tabel) -> map {diensttype: nummer}
  const rateTbl = Pt.find(t => /diensttype/i.test((t.headers || []).join(" ") + " " + (t.section || "")));
  if (rateTbl && rateTbl.rows.length) {
    const map = {};
    for (const r of rateTbl.rows) { const dt = (r[0] || "").trim(); const tr = euroNum(r[1] || r[r.length - 1] || ""); if (dt && !/diensttype/i.test(dt) && tr) map[dt] = Number(tr); }
    if (Object.keys(map).length) { set("shift_type_rates", map); T.rates++; }
  }

  // BHV / GV&VG / Medicatie — alleen als Opleiding-tab echt gescrapet is
  if (hasSec(Ec, /education|training|bhv|medicatie|skj/i) || (rec.tabs?.education?.dates || []).length) {
    patch.trainingBhv = cb(Ec, /\bbhv\b/i);
    patch.trainingGvVg = cb(Ec, /gv\s*&?\s*vg|gv en vg/i);
    patch.trainingMedicatie = cb(Ec, /medicatie/i);
    const bhvDt = dateBy(rec.tabs?.education?.dates, /bhv|education|training/i);
    if (patch.trainingBhv && bhvDt) { set("trainingBhvDatum", bhvDt); T.bhv++; }
  }

  // Status / uit dienst — uitDienst ALLEEN als status echt "Uit dienst" is
  // (anders pakte de regex per ongeluk de verjaardag-datum ernaast op)
  const stM = allText.match(/Status:?\s*(In dienst|Uit dienst)/i);
  if (stM) set("dienstStatus", stM[1]);
  if (stM && /uit dienst/i.test(stM[1])) {
    const uitM = allText.match(/uit dienst[^0-9]{0,12}([0-3]?\d-[01]?\d-\d{4})/i);
    if (uitM) { set("uitDienst", uitM[1]); T.uit++; }
  }

  try {
    let rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,functie,data&data->>bs2_id=eq.${rec.id}`, { headers: H });
    let rows = await rr.json();
    if ((!Array.isArray(rows) || !rows.length) && rec.email) {
      rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,functie,data&data->>email=ilike.${encodeURIComponent(rec.email)}`, { headers: H });
      rows = await rr.json();
    }
    if (!Array.isArray(rows) || !rows.length) { skip++; console.log(`SKIP geen match: ${rec.name}`); continue; }
    const m = rows[0];
    const cur = m.data || {};

    // Startdatum (na fetch: cur.verjaardag = betrouwbare DOB-guard)
    const startd = pickStart(Pd, api, cur.verjaardag) || pickStart(Dd, api, cur.verjaardag);
    if (startd) { patch.startdatum = startd; T.start++; }

    // Opleidingen + SKJ afleiden uit het reeds aanwezige bs2_certifications
    const certs = Array.isArray(cur.bs2_certifications) ? cur.bs2_certifications : [];
    if (certs.length) {
      const opl = [], skjItems = [];
      let skjFlag = false;
      for (const c of certs) {
        const naam = (c.name || c.title || "").trim();
        const dat = toNL(c.date_of_issue || c.issued_at || c.date || "");
        if (c.is_skj === true) { skjFlag = true; if (naam) skjItems.push({ naam, datum: dat }); }
        else if (naam && !/^(bhv|gv\s*&?\s*vg|medicatie)/i.test(naam)) opl.push({ naam, datum: dat });
      }
      // merge met bestaande opleidingItems (dedupe op naam)
      const existing = Array.isArray(cur.opleidingItems) ? cur.opleidingItems : [];
      const seen = new Set(existing.map(o => (o.naam || "").toLowerCase()));
      const merged = existing.concat(opl.filter(o => !seen.has((o.naam || "").toLowerCase())));
      if (merged.length) { patch.opleidingItems = merged; T.opl++; }
      if (skjItems.length) patch.skjItems = skjItems;
      if (skjFlag || cb(Ec, /skj/i)) { patch.skjRegistratie = true; T.skj++; }
    } else if (hasSec(Ec, /skj/i)) {
      patch.skjRegistratie = cb(Ec, /skj/i);
      if (patch.skjRegistratie) T.skj++;
    }

    // address aanvullen uit API als BS1 leeg is
    if (api && api.address) {
      const a = api.address;
      if (!v(cur.straat) && a.street) patch.straat = a.street;
      if (!v(cur.huisnummer) && a.house_number) patch.huisnummer = a.house_number;
      if (!v(cur.toevoeging) && a.house_number_addition) patch.toevoeging = a.house_number_addition;
      if (!v(cur.postcode) && a.postcode) patch.postcode = a.postcode;
      if (!v(cur.plaats) && a.city) patch.plaats = a.city;
    }

    const mergedData = { ...cur, ...patch };
    const body = { data: mergedData, laatst_gewijzigd: new Date().toISOString() };
    if (functie && !v(m.functie)) { body.functie = functie; mergedData.functie = functie; }

    const pr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?id=eq.${m.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });
    if (!pr.ok) throw new Error(`${pr.status}: ${(await pr.text()).substring(0, 200)}`);
    ok++;
    if (ok % 10 === 0) console.log(`  ... ${ok} bijgewerkt`);
  } catch (e) { err++; errors.push(`${rec.name}: ${e.message}`); console.log(`FOUT ${rec.name}: ${e.message}`); }
}

console.log(`\n=== EINDREPORT ===`);
console.log(`OK:${ok}  Skipped:${skip}  Errors:${err}`);
console.log(`Gevuld -> uurAlgemeen:${T.uur} startdatum:${T.start} beoordeling:${T.beoord} functie:${T.func} locaties:${T.loc} kernteam:${T.kern} opleidingen:${T.opl} SKJ:${T.skj} SKJ-nr:${T.skjnr} salaris:${T.sal} bureau:${T.bureau} diensttype-tarieven:${T.rates} profEmail:${T.profmail} BHV-datum:${T.bhv} uit-dienst:${T.uit}`);
console.log(`(volledige ruwe scrape in data.bs2_scrape + API in data.bs2_api)`);
if (errors.length) { console.log("\nFouten:"); errors.forEach(e => console.log("  - " + e)); }
