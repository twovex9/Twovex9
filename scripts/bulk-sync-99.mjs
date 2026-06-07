#!/usr/bin/env node
/**
 * Bulk-sync 99 BS2-medewerkers → BS1 Supabase via service_role REST API.
 * Input: C:/Users/sonck/Downloads/bs2-99-employees.json
 *
 * VEREIST (env, NIET hardcoden / NIET committen):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = '...'
 *   node scripts/bulk-sync-99.mjs
 *
 * Per medewerker (gematcht via data.bs2_id of email, case-insensitive):
 *  - PATCH medewerkers: top-level voornaam/achternaam/email/dienstverband + data jsonb merge
 *  - DELETE+POST medewerker_notities (per note, FULL HTML behouden)
 *  - DELETE+POST medewerker_documenten (per doc, metadata-only)
 *  - DELETE+POST medewerker_verzuim_perioden (kort+lang)
 */
import fs from "fs";

const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT = "C:/Users/sonck/Downloads/bs2-99-employees.json";

if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt in env."); process.exit(1); }
if (!fs.existsSync(INPUT)) { console.error("FOUT: input niet gevonden:", INPUT); process.exit(1); }

const H = {
  apikey: KEY,
  Authorization: "Bearer " + KEY,
  "Content-Type": "application/json",
};

function isoToNl(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
  const p = iso.substring(0, 10).split("-");
  return `${p[2]}-${p[1]}-${p[0]}`;
}
function dienstverbandLabel(t) {
  return t === "hiring" ? "Inhuur" : t === "permanent" ? "Loondienst" : t === "intern" ? "Stagiair" : "";
}
function hiringTypeLabel(ht) {
  return ht === "direct_hire" ? "Rechtstreekse plaatsing" : ht === "via_agency" ? "Via bureau" : (ht || "");
}

async function rest(method, path, body) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method,
    headers: { ...H, Prefer: method === "PATCH" ? "return=minimal" : "return=minimal" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${path} → ${r.status}: ${t.substring(0, 300)}`);
  }
  return r;
}

async function findMedewerker(bs2Id, email) {
  // Probeer eerst op bs2_id, anders op email (case-insensitive via ilike)
  let r = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,data&data->>bs2_id=eq.${bs2Id}`, { headers: H });
  let rows = await r.json();
  if (rows && rows.length) return rows[0];
  if (email) {
    const enc = encodeURIComponent(email.toLowerCase());
    r = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,data&data->>email=ilike.${enc}`, { headers: H });
    rows = await r.json();
    if (rows && rows.length) return rows[0];
  }
  return null;
}

const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${raw.length} medewerkers\n`);

let okCount = 0, skipCount = 0, errCount = 0;
const errors = [];

for (const rec of raw) {
  const d = rec.detail;
  if (!d) { skipCount++; continue; }
  const naam = `${d.first_name || ""} ${d.last_name || ""}`.trim();
  try {
    const found = await findMedewerker(d.id, d.email);
    if (!found) { skipCount++; console.log(`SKIP (geen BS1-match): ${naam} <${d.email}>`); continue; }
    const mid = found.id;
    const addr = d.address || {};
    const cao = d.cao_type;
    const phase = d.phase;
    const rates = {};
    (d.shift_type_rates || []).forEach(r => { rates[r.name] = parseFloat(r.rate); });
    const dienstverband = dienstverbandLabel(d.employment_type);
    const competentieNamen = (rec.competencies || []).map(c => c.name);
    const certificaten = (rec.certifications || []).map(c => ({ id: c.id, name: c.name, is_skj: c.is_skj, date_of_issue: c.date_of_issue }));

    // jsonb merge: bestaande data + patch (patch wint)
    const patch = {
      email: d.email, tel: d.phone || "", taal: (d.language || "NL").toUpperCase(),
      verjaardag: isoToNl(d.date_of_birth),
      initialen: ((d.first_name || "")[0] || "") + ((d.last_name || "")[0] || ""),
      straat: addr.street || "", huisnummer: addr.house_number || "", toevoeging: addr.house_number_addition || "",
      postcode: addr.postcode || "", plaats: addr.city || "",
      provincie: addr.province || "", gemeente: addr.municipality || "", land: addr.country_code || "",
      address_lat: addr.lat || "", address_lng: addr.lng || "",
      cao: cao ? cao.name : "", cao_slug: cao ? cao.slug : "", cao_id: cao ? cao.id : "",
      dienstverband, inhuurtype: hiringTypeLabel(d.hiring_type),
      bs2_id: d.id, bs2_employee_number: d.employee_number, bs2_employment_type: d.employment_type,
      bs2_hiring_type: d.hiring_type, bs2_phase_slug: phase ? phase.slug : "",
      bs2_phase_name: phase ? phase.name : "", bs2_phase_color: phase ? phase.color : "",
      bs2_is_plannable: !!d.is_plannable, bs2_is_flexible: !!d.is_flexible,
      bs2_is_2fa_verified: d.user ? !!d.user.is_2fa_verified : false,
      bs2_has_required_documents: !!d.has_required_documents, bs2_has_warnings: !!d.has_warnings, bs2_has_errors: !!d.has_errors,
      bs2_user_id: d.user ? d.user.id : "",
      shift_type_rates: rates,
      competentie: competentieNamen[0] || "",
      bs2_certifications: certificaten,
      bs2_leave_balance: rec.leave_balance || null,
      uitDienst: "", userSetting: "Standaard",
      bs2_synced_at: new Date().toISOString(),
    };
    const mergedData = { ...(found.data || {}), ...patch };

    await rest("PATCH", `medewerkers?id=eq.${mid}`, {
      voornaam: d.first_name || "",
      achternaam: d.last_name || "",
      email: d.email || "",
      dienstverband,
      data: mergedData,
      laatst_gewijzigd: new Date().toISOString(),
    });

    // Notes: delete bestaand + insert nieuw met FULL HTML
    await rest("DELETE", `medewerker_notities?medewerker_id=eq.${mid}`);
    const notes = (rec.notes || []).map(n => {
      const uname = n.user ? (n.user.name || ((n.user.first_name || "") + " " + (n.user.last_name || "")).trim()) : "";
      const dl = (n.created_at || "").substring(0, 10);
      return {
        medewerker_id: mid,
        body_html: `<p><strong>${uname}</strong> — ${dl}</p>${n.comment || ""}`,
        aanmaakdatum: n.created_at || new Date().toISOString(),
      };
    });
    if (notes.length) await rest("POST", "medewerker_notities", notes);

    // Documenten: delete + insert metadata
    await rest("DELETE", `medewerker_documenten?medewerker_id=eq.${mid}`);
    const docs = (rec.docs || []).map(dc => {
      const f = dc.file || {};
      return {
        id: dc.id,
        medewerker_id: mid,
        naam: dc.name || "",
        type: dc.type || "other",
        vervaldatum: isoToNl(dc.expiration_date || ""),
        uploaddatum: dc.created_at || new Date().toISOString(),
        file_name: f.name || "",
        file_mime: "application/pdf",
        archived: false,
      };
    });
    if (docs.length) await rest("POST", "medewerker_documenten?on_conflict=id", docs);

    // Verzuim: delete + insert kort+lang
    await rest("DELETE", `medewerker_verzuim_perioden?medewerker_id=eq.${mid}`);
    const verzuim = [
      ...(rec.verzuim_short || []).map(v => ({ ...v, _t: "kort" })),
      ...(rec.verzuim_long || []).map(v => ({ ...v, _t: "lang" })),
    ].map(v => ({
      medewerker_id: mid,
      type: v._t,
      eerst_ziektedag: v.first_day_of_sickness || v.eerst_ziektedag || null,
      verwachte_terug: v.expected_return_date || v.verwachte_terug || null,
      werkelijke_terug: v.actual_return_date || v.werkelijke_terug || null,
      beschrijving: v.description || v.beschrijving || "",
      status: v.status || "",
    }));
    if (verzuim.length) await rest("POST", "medewerker_verzuim_perioden", verzuim);

    okCount++;
    if (okCount % 10 === 0) console.log(`  ... ${okCount} medewerkers gesynct`);
  } catch (e) {
    errCount++;
    errors.push(`${naam}: ${e.message}`);
    console.log(`FOUT ${naam}: ${e.message}`);
  }
}

console.log(`\n=== EINDREPORT ===`);
console.log(`OK: ${okCount} / ${raw.length}`);
console.log(`Skipped (geen BS1-match): ${skipCount}`);
console.log(`Errors: ${errCount}`);
if (errors.length) { console.log("\nFouten:"); errors.forEach(e => console.log("  - " + e)); }
