#!/usr/bin/env node
/**
 * Schrijf bs2-clients-full.json naar BS1.  NIET-destructief:
 *   node --env-file=scripts/.env scripts/write-clients.mjs
 *
 * - clienten: detail/verwijzer/zorgdata in kolommen+data; VOLLEDIGE ruwe scrape
 *   van alle 9 tabs in data.bs2_scrape (100% behoud); client-notities in data.
 * - client_contacten + client_documents: per cliënt vervangen (tabellen leeg/ongebruikt).
 * - Beschikkingen/Betalingen/Incidenten: alleen ruw bewaard in data.bs2_scrape
 *   (aparte reconciliatie-fase met akkoord — die tabellen zijn al gevuld).
 * Match BS1-cliënt op data->>'bs2_id' = BS2 client id.
 */
import fs from "fs";
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT = "C:/Users/sonck/Downloads/bs2-clients-full.json";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt (--env-file=scripts/.env)."); process.exit(1); }
if (!fs.existsSync(INPUT)) { console.error("FOUT: " + INPUT + " niet gevonden."); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const recs = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${recs.length} BS2-cliënten\n`);

const isoDate = v => { const m = (v || "").toString().match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const nn = v => (v == null ? "" : String(v).trim());

let ok = 0, skip = 0, err = 0, cIns = 0, dIns = 0, nNotes = 0;
const errors = [];

for (const r of recs) {
  if (r.error && !r.detail) { skip++; continue; }
  const d = r.detail || {};
  try {
    // 1. BS1-cliënt zoeken op bs2_id
    const rr = await fetch(`${SUPABASE_URL}/rest/v1/clienten?select=id,data,gemeente,locatie,fase&data->>bs2_id=eq.${r.id}`, { headers: H });
    const rows = await rr.json();
    if (!Array.isArray(rows) || !rows.length) { skip++; console.log(`SKIP geen BS1-match: ${r.naam} (${r.clientnummer})`); continue; }
    const m = rows[0];
    const cur = m.data || {};

    // 2. clienten: detail + volledige ruwe scrape + notities in data
    const mergedData = {
      ...cur,
      bs2_detail: d,
      bs2_referrer: { naam: d.referrer_name || "", telefoon: d.referrer_phone || "", email: d.referrer_email || "" },
      bs2_care_start: d.care_start_date || "",
      bs2_care_end: d.care_end_date || "",
      bs2_client_notes: Array.isArray(r.notes) ? r.notes : [],
      bs2_scrape: {
        dispositions: r.dispositions || [], payments: r.payments || [], contacts: r.contacts || [],
        notes: r.notes || [], documents: r.documents || [], reports: r.reports || [],
        client_forms: r.client_forms || [], incidents: r.incidents || [],
      },
      bs2_scrape_at: new Date().toISOString(),
    };
    const body = { data: mergedData, laatst_gewijzigd: new Date().toISOString() };
    if (d.municipality && d.municipality.name && !nn(m.gemeente)) body.gemeente = d.municipality.name;
    if (d.location && d.location.name) body.locatie = d.location.name;
    if (d.phase && d.phase.name) body.fase = d.phase.name;
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/clienten?id=eq.${encodeURIComponent(m.id)}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
    });
    if (!pr.ok) throw new Error(`clienten PATCH ${pr.status}: ${(await pr.text()).slice(0, 160)}`);
    ok++;
    if (Array.isArray(r.notes) && r.notes.length) nNotes += r.notes.length;

    // 3. client_contacten: vervang per cliënt (tabel leeg/ongebruikt)
    if (Array.isArray(r.contacts) && r.contacts.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/client_contacten?client_id=eq.${encodeURIComponent(m.id)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
      const payload = r.contacts.map(c => ({
        client_id: m.id,
        naam: (nn(c.first_name) + " " + nn(c.last_name)).trim() || nn(c.name),
        relatie: (c.contact_type && (c.contact_type.label || c.contact_type.value)) || "",
        telefoon: nn(c.phone), email: nn(c.email),
        is_primair: c.decision_maker == 1 || c.decision_maker === true,
        notitie: nn(c.job_title),
        archived: !!c.deleted_at,
      }));
      const ci = await fetch(`${SUPABASE_URL}/rest/v1/client_contacten`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      if (ci.ok) cIns += payload.length; else throw new Error(`contacten ${ci.status}: ${(await ci.text()).slice(0, 160)}`);
    }

    // 4. client_documents: vervang per cliënt (metadata; binaries handmatig later)
    if (Array.isArray(r.documents) && r.documents.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/client_documents?client_id=eq.${encodeURIComponent(m.id)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
      const payload = r.documents.map(doc => ({
        id: doc.id, client_id: m.id, naam: nn(doc.name),
        type: nn(doc.type), vervaldatum: nn(doc.expiration_date),
        file_name: (doc.file && doc.file.name) || "", file_mime: (doc.file && doc.file.extension) || "",
        storage_path: (doc.file && doc.file.path) || "",
        archived: !!doc.deleted_at,
      }));
      const di = await fetch(`${SUPABASE_URL}/rest/v1/client_documents`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      if (di.ok) dIns += payload.length; else throw new Error(`documenten ${di.status}: ${(await di.text()).slice(0, 160)}`);
    }
    if (ok % 15 === 0) console.log(`  ... ${ok} cliënten bijgewerkt`);
  } catch (e) { err++; errors.push(`${r.naam}: ${e.message}`); console.log(`FOUT ${r.naam}: ${e.message}`); }
}

console.log(`\n=== EINDREPORT ===`);
console.log(`Clienten bijgewerkt: ${ok}  | Skipped: ${skip}  | Errors: ${err}`);
console.log(`client_contacten ingevoegd: ${cIns}  | client_documents ingevoegd: ${dIns}  | client-notities bewaard: ${nNotes}`);
console.log(`Beschikkingen/Betalingen/Incidenten: ruw bewaard in data.bs2_scrape (aparte reconciliatie-fase).`);
if (errors.length) { console.log("\nFouten:"); errors.forEach(e => console.log("  - " + e)); }
