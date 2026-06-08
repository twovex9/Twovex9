#!/usr/bin/env node
/**
 * Schrijf DOM-extras (uit bs2-console-scrape-extras.js) naar BS1.
 * Input: C:/Users/sonck/Downloads/bs2-99-extras.json
 * VEREIST: node --env-file=scripts/.env scripts/write-99-extras.mjs
 *
 * Mapt gescrapete DOM-velden → medewerkers.data jsonb (merge, behoudt bestaand).
 */
import fs from "fs";

const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT = "C:/Users/sonck/Downloads/bs2-99-extras.json";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt."); process.exit(1); }
if (!fs.existsSync(INPUT)) { console.error("FOUT: input niet gevonden:", INPUT); process.exit(1); }

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const records = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${records.length} gescrapete medewerkers\n`);

// Helper: zoek waarde in een scrape-object op label-substring (case-insensitive)
function find(obj, ...needles) {
  for (const k of Object.keys(obj || {})) {
    const low = k.toLowerCase();
    if (needles.every(n => low.includes(n.toLowerCase()))) return obj[k];
  }
  return undefined;
}
function cbState(obj, ...needles) {
  for (const k of Object.keys(obj || {})) {
    if (!k.startsWith("CB|")) continue;
    const low = k.toLowerCase();
    if (needles.every(n => low.includes(n.toLowerCase()))) return obj[k] === "checked";
  }
  return false;
}
function euroNum(v) {
  if (!v) return "";
  const m = String(v).replace(",", ".").match(/[\d.]+/);
  return m ? m[0] : "";
}

let ok = 0, skip = 0, err = 0;
const errors = [];

for (const rec of records) {
  if (rec.error || !rec.email) { skip++; continue; }
  const det = rec.details || {};
  const prof = rec.professional || {};
  const edu = rec.education || {};

  const patch = {
    roepnaam: find(det, "roepnaam") || "",
    initialen: find(det, "initialen") || "",
    bsn: find(det, "bsn") || "",
    contactNaam: find(det, "contact", "naam") || "",
    contactTel: find(det, "contactpersoon", "telefoon") || "",
    inhuurKvk: find(det, "inhuur", "kvk") || "",
    inhuurBtw: find(det, "inhuur", "btw") || "",
    inhuurBedrijfsnaam: find(det, "inhuur", "bedrijfsnaam") || "",
    inhuurVerzekering: find(det, "inhuur", "verzekering") || "",
    inhuurPostcode: find(det, "inhuur", "postcode") || "",
    inhuurHuisnummer: find(det, "inhuur", "huisnummer") || "",
    inhuurToevoeging: find(det, "inhuur", "toevoeging") || "",
    inhuurStraat: find(det, "inhuur", "straat") || "",
    inhuurStad: find(det, "inhuur", "stad") || "",
    uurAlgemeen: euroNum(find(prof, "algemeen") || ""),
    startdatum: find(prof, "startdatum") || "",
    periodiekeMaand: find(prof, "periodieke") || "",
    beoordelingsdatum: find(prof, "beoordelingsdatum") || "",
    locatiesSelected: Array.isArray(prof._locaties) ? prof._locaties : [],
    kernteam: Array.isArray(prof._kernteam) && prof._kernteam.length ? prof._kernteam[0] : "",
    urenVerleentzorg: cbState(prof, "verleent zorg"),
    urenHandmatigRegistreren: cbState(prof, "handmatig"),
    voorzLaptop: cbState(prof, "laptop"),
    voorzSleutels: cbState(prof, "sleutels"),
    voorzTelefoon: cbState(prof, "telefoon"),
    voorzSimkaart: cbState(prof, "simkaart"),
    voorzAuto: cbState(prof, "auto"),
    voorzFiets: cbState(prof, "fiets"),
    skjRegistratie: cbState(edu, "skj"),
    trainingBhv: cbState(edu, "bhv"),
    trainingGvVg: cbState(edu, "gv") || cbState(edu, "vg"),
    trainingMedicatie: cbState(edu, "medicatie"),
    extras_synced_at: new Date().toISOString(),
  };

  try {
    // Zoek medewerker via bs2_id of email
    let rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,data&data->>bs2_id=eq.${rec.id}`, { headers: H });
    let rows = await rr.json();
    if (!rows.length && rec.email) {
      rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,data&data->>email=ilike.${encodeURIComponent(rec.email)}`, { headers: H });
      rows = await rr.json();
    }
    if (!rows.length) { skip++; console.log(`SKIP geen match: ${rec.name}`); continue; }
    const m = rows[0];
    const mergedData = { ...(m.data || {}), ...patch };
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?id=eq.${m.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ data: mergedData, laatst_gewijzigd: new Date().toISOString() }),
    });
    if (!pr.ok) throw new Error(`${pr.status}: ${(await pr.text()).substring(0, 200)}`);
    ok++;
    if (ok % 10 === 0) console.log(`  ... ${ok} extras geschreven`);
  } catch (e) { err++; errors.push(`${rec.name}: ${e.message}`); console.log(`FOUT ${rec.name}: ${e.message}`); }
}

console.log(`\n=== EINDREPORT ===\nOK: ${ok}\nSkipped: ${skip}\nErrors: ${err}`);
if (errors.length) { console.log("\nFouten:"); errors.forEach(e => console.log("  - " + e)); }
