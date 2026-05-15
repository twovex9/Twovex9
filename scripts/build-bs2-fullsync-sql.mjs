#!/usr/bin/env node
/**
 * BS2 → BS1 fullsync SQL builder (chunked for Supabase MCP execute_sql)
 * Input: C:/Users/sonck/Downloads/bs2-full-sync.json
 * Output: 2 sets of chunks
 *   - scripts/out/detail-chunk-NN.sql (detail + notes, 5 medewerkers/chunk)
 *   - scripts/out/docs-chunk-NN.sql (documents metadata, 5 medewerkers/chunk)
 */
import fs from "fs";
import path from "path";

const INPUT = "C:/Users/sonck/Downloads/bs2-full-sync.json";
const OUT_DIR = path.resolve("scripts/out");
const CHUNK_SIZE = 5;

if (!fs.existsSync(INPUT)) { console.error("INPUT niet gevonden:", INPUT); process.exit(1); }
fs.mkdirSync(OUT_DIR, { recursive: true });

// Wipe oude chunks
fs.readdirSync(OUT_DIR).filter(f => f.endsWith(".sql")).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${raw.length} records`);

function sqlStr(s) {
  if (s === null || s === undefined) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function sqlJsonb(obj) { return sqlStr(JSON.stringify(obj)) + "::jsonb"; }

function buildDetailPatch(rec) {
  const d = rec.detail;
  if (!d) return null;
  const addr = d.address || {};
  const cao = d.cao_type;
  const phase = d.phase;
  const rates = {};
  (d.shift_type_rates || []).forEach((r) => { rates[r.name] = parseFloat(r.rate); });

  const notes = (rec.notes || []).map((n) => ({
    id: n.id,
    created_at: n.created_at,
    comment: n.comment,
    user_name: n.user ? (n.user.name || ((n.user.first_name || "") + " " + (n.user.last_name || "")).trim()) : null,
  }));

  return {
    bs2_id: d.id,
    voornaam: d.first_name,
    achternaam: d.last_name,
    email_match: (d.email || "").toLowerCase(),
    data_patch: {
      email: d.email,
      tel: d.phone,
      taal: d.language,
      verjaardag: d.date_of_birth,
      nationaliteit: d.nationality,
      startdatum: d.start_date,
      straat: addr.street || null,
      huisnummer: addr.house_number || null,
      toevoeging: addr.house_number_addition || null,
      postcode: addr.postcode || null,
      plaats: addr.city || null,
      provincie: addr.province || null,
      gemeente: addr.municipality || null,
      land: addr.country_code || null,
      address_lat: addr.lat || null,
      address_lng: addr.lng || null,
      cao: cao ? cao.name : null,
      cao_slug: cao ? cao.slug : null,
      bs2_id: d.id,
      bs2_employee_number: d.employee_number,
      bs2_employment_type: d.employment_type,
      bs2_hiring_type: d.hiring_type,
      bs2_worker_type: d.worker_type,
      bs2_phase_slug: phase ? phase.slug : null,
      bs2_phase_name: phase ? phase.name : null,
      bs2_phase_color: phase ? phase.color : null,
      bs2_is_plannable: d.is_plannable,
      bs2_is_flexible: d.is_flexible,
      bs2_is_2fa_verified: d.user ? d.user.is_2fa_verified : null,
      bs2_has_required_documents: d.has_required_documents,
      bs2_has_warnings: d.has_warnings,
      bs2_has_errors: d.has_errors,
      bs2_user_id: d.user ? d.user.id : null,
      shift_type_rates: rates,
      bs2_notes: notes,
      bs2_synced_at: new Date().toISOString(),
    },
  };
}

function buildDocsPatch(rec) {
  const d = rec.detail;
  if (!d) return null;
  const docs = (rec.docs || []).map((dc) => ({
    id: dc.id,
    name: dc.name,
    type: dc.type,
    contract_type: dc.contract_type,
    expiration_date: dc.expiration_date,
    created_at: dc.created_at,
    file_name: dc.file ? dc.file.name : null,
    file_size: dc.file ? dc.file.size : null,
    file_ext: dc.file ? dc.file.extension : null,
    file_id: dc.file ? dc.file.id : null,
    file_path: dc.file ? dc.file.path : null,
  }));
  return { bs2_id: d.id, email_match: (d.email || "").toLowerCase(), docs };
}

// Detail chunks
const detailPatches = raw.map(buildDetailPatch).filter(Boolean);
let idx = 0;
for (let i = 0; i < detailPatches.length; i += CHUNK_SIZE) {
  idx++;
  const chunk = detailPatches.slice(i, i + CHUNK_SIZE);
  const values = chunk.map((p) =>
    `  (${sqlStr(p.bs2_id)}, ${sqlStr(p.voornaam)}, ${sqlStr(p.achternaam)}, ${sqlStr(p.email_match)}, ${sqlJsonb(p.data_patch)})`
  ).join(",\n");
  const sql = `-- BS2→BS1 detail chunk ${idx} (${chunk.length} medewerkers)
WITH src(bs2_id, voornaam, achternaam, email_match, data_patch) AS (
  VALUES
${values}
)
UPDATE public.medewerkers m
SET voornaam = src.voornaam, achternaam = src.achternaam,
    data = COALESCE(m.data, '{}'::jsonb) || src.data_patch,
    laatst_gewijzigd = now()
FROM src
WHERE m.data->>'bs2_id' = src.bs2_id OR LOWER(m.data->>'email') = src.email_match
RETURNING m.id, m.voornaam || ' ' || m.achternaam AS naam;
`;
  fs.writeFileSync(path.join(OUT_DIR, `detail-chunk-${String(idx).padStart(2, "0")}.sql`), sql);
}
console.log(`Detail chunks: ${idx}`);

// Docs chunks (per medewerker met >0 docs)
const docsPatches = raw.map(buildDocsPatch).filter(p => p && p.docs.length > 0);
idx = 0;
for (let i = 0; i < docsPatches.length; i += CHUNK_SIZE) {
  idx++;
  const chunk = docsPatches.slice(i, i + CHUNK_SIZE);
  const values = chunk.map((p) =>
    `  (${sqlStr(p.bs2_id)}, ${sqlStr(p.email_match)}, ${sqlJsonb(p.docs)})`
  ).join(",\n");
  const sql = `-- BS2→BS1 docs chunk ${idx} (${chunk.length} medewerkers)
WITH src(bs2_id, email_match, docs) AS (
  VALUES
${values}
)
UPDATE public.medewerkers m
SET data = COALESCE(m.data, '{}'::jsonb) || jsonb_build_object('bs2_documents', src.docs)
FROM src
WHERE m.data->>'bs2_id' = src.bs2_id OR LOWER(m.data->>'email') = src.email_match
RETURNING m.voornaam || ' ' || m.achternaam AS naam, jsonb_array_length(m.data->'bs2_documents') AS docs_count;
`;
  fs.writeFileSync(path.join(OUT_DIR, `docs-chunk-${String(idx).padStart(2, "0")}.sql`), sql);
}
console.log(`Docs chunks: ${idx}`);
