#!/usr/bin/env node
/**
 * Build SQL chunks voor 99 BS2-medewerkers naar BS1.
 * Input: C:/Users/sonck/Downloads/bs2-99-employees.json
 * Output: scripts/out/99/*.sql (chunks van ~5 medewerkers)
 *
 * Per medewerker:
 *  - 1 UPDATE op public.medewerkers (top-level voornaam/achternaam/email/fase/dienstverband/functie + data jsonb merge)
 *  - INSERT op public.medewerker_notities (per note)
 *  - INSERT op public.medewerker_documenten (per doc, metadata-only)
 *  - INSERT op public.medewerker_verzuim_perioden (per verzuim short+long)
 *
 * Mapping per veld: zie docs/bs2-sync/METHODOLOGIE.md
 */
import fs from "fs";
import path from "path";

const INPUT = "C:/Users/sonck/Downloads/bs2-99-employees.json";
const OUT_DIR = path.resolve("scripts/out/99");
const CHUNK_SIZE = 10; // 10 medewerkers per chunk (compacter)

if (!fs.existsSync(INPUT)) { console.error("INPUT niet gevonden:", INPUT); process.exit(1); }
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.readdirSync(OUT_DIR).filter(f => f.endsWith(".sql")).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${raw.length} medewerkers`);

function sqlStr(s) {
  if (s === null || s === undefined) return "NULL";
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function sqlJsonb(obj) { return sqlStr(JSON.stringify(obj)) + "::jsonb"; }
function isoToNl(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
  const p = iso.substring(0, 10).split("-");
  return `${p[2]}-${p[1]}-${p[0]}`;
}

// Map BS2 employment_type → BS1 dienstverband label
function dienstverbandLabel(emp_type) {
  if (emp_type === "hiring") return "Inhuur";
  if (emp_type === "permanent") return "Loondienst";
  if (emp_type === "intern") return "Stagiair";
  return "";
}
function hiringTypeLabel(ht) {
  if (ht === "direct_hire") return "Rechtstreekse plaatsing";
  if (ht === "via_agency") return "Via bureau";
  return ht || "";
}

// Build SQL voor employees-update (chunks van 5)
function buildEmployeeUpdates(rows) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const stmts = [];
    chunk.forEach((rec) => {
      const d = rec.detail;
      if (!d) return;
      const addr = d.address || {};
      const cao = d.cao_type;
      const phase = d.phase;
      const rates = {};
      (d.shift_type_rates || []).forEach(r => { rates[r.name] = parseFloat(r.rate); });
      const dienstverband = dienstverbandLabel(d.employment_type);
      const competentieNamen = (rec.competencies || []).map(c => c.name);
      const certificaten = (rec.certifications || []).map(c => ({ id: c.id, name: c.name, is_skj: c.is_skj, date_of_issue: c.date_of_issue }));
      const verlofSaldo = rec.leave_balance;

      // Compact patch (geen lege strings, geen grote nested objects)
      const patch = {
        email: d.email, tel: d.phone || "", taal: (d.language || "NL").toUpperCase(),
        verjaardag: isoToNl(d.date_of_birth),
        initialen: ((d.first_name || "")[0] || "") + ((d.last_name || "")[0] || ""),
        straat: addr.street, huisnummer: addr.house_number, toevoeging: addr.house_number_addition,
        postcode: addr.postcode, plaats: addr.city, provincie: addr.province, gemeente: addr.municipality, land: addr.country_code,
        cao: cao ? cao.name : null, cao_slug: cao ? cao.slug : null,
        dienstverband, inhuurtype: hiringTypeLabel(d.hiring_type),
        bs2_id: d.id, bs2_employee_number: d.employee_number, bs2_employment_type: d.employment_type,
        bs2_hiring_type: d.hiring_type, bs2_phase_slug: phase ? phase.slug : null, bs2_phase_name: phase ? phase.name : null,
        bs2_is_plannable: !!d.is_plannable, bs2_is_2fa_verified: d.user ? !!d.user.is_2fa_verified : false,
        bs2_has_required_documents: !!d.has_required_documents, bs2_has_warnings: !!d.has_warnings, bs2_has_errors: !!d.has_errors,
        shift_type_rates: rates,
        competentie: competentieNamen[0] || "",
        userSetting: "Standaard",
      };
      // Remove null/undefined to keep JSON compact
      Object.keys(patch).forEach(k => { if (patch[k] === null || patch[k] === undefined) delete patch[k]; });

      // Top-level + data patch in 1 UPDATE
      stmts.push(`UPDATE public.medewerkers SET
  voornaam = ${sqlStr(d.first_name || "")},
  achternaam = ${sqlStr(d.last_name || "")},
  email = ${sqlStr(d.email || "")},
  dienstverband = ${sqlStr(dienstverband)},
  functie = COALESCE(functie, ''),
  data = COALESCE(data, '{}'::jsonb) || ${sqlJsonb(patch)},
  laatst_gewijzigd = now()
WHERE data->>'bs2_id' = ${sqlStr(d.id)} OR LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())};`);
    });
    chunks.push(stmts.join("\n\n"));
  }
  return chunks;
}

// Build notes SQL (per chunk van 5 medewerkers)
function buildNotesInserts(rows) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const stmts = [];
    chunk.forEach((rec) => {
      const d = rec.detail;
      if (!d) return;
      const notes = rec.notes || [];
      // Delete bestaand voor deze medewerker (match via email)
      stmts.push(`DELETE FROM public.medewerker_notities WHERE medewerker_id IN (SELECT id::text FROM public.medewerkers WHERE LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())});`);
      if (notes.length === 0) return;
      const values = notes.map(n => {
        const userName = n.user ? (n.user.name || ((n.user.first_name || "") + " " + (n.user.last_name || "")).trim()) : "";
        const dateLabel = (n.created_at || "").substring(0, 10);
        const html = `<p><strong>${userName}</strong> — ${dateLabel}</p>${n.comment || ""}`;
        return `((SELECT id::text FROM public.medewerkers WHERE LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())} LIMIT 1), ${sqlStr(html)}, ${sqlStr(n.created_at)})`;
      }).join(",\n");
      stmts.push(`INSERT INTO public.medewerker_notities (medewerker_id, body_html, aanmaakdatum) VALUES\n${values};`);
    });
    chunks.push(stmts.join("\n\n"));
  }
  return chunks;
}

// Build docs SQL
function buildDocsInserts(rows) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const stmts = [];
    chunk.forEach((rec) => {
      const d = rec.detail;
      if (!d) return;
      const docs = rec.docs || [];
      stmts.push(`DELETE FROM public.medewerker_documenten WHERE medewerker_id IN (SELECT id::text FROM public.medewerkers WHERE LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())});`);
      if (docs.length === 0) return;
      const values = docs.map(dc => {
        const file = dc.file || {};
        return `(${sqlStr(dc.id)}, (SELECT id::text FROM public.medewerkers WHERE LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())} LIMIT 1), ${sqlStr(dc.name || "")}, ${sqlStr(dc.type || "other")}, ${sqlStr(isoToNl(dc.expiration_date || ""))}, ${sqlStr(dc.created_at)}, ${sqlStr(file.name || "")}, 'application/pdf', false)`;
      }).join(",\n");
      stmts.push(`INSERT INTO public.medewerker_documenten (id, medewerker_id, naam, type, vervaldatum, uploaddatum, file_name, file_mime, archived) VALUES\n${values}\nON CONFLICT (id) DO NOTHING;`);
    });
    chunks.push(stmts.join("\n\n"));
  }
  return chunks;
}

// Build verzuim SQL
function buildVerzuimInserts(rows) {
  const stmts = [];
  rows.forEach((rec) => {
    const d = rec.detail;
    if (!d) return;
    const verzuimen = [...(rec.verzuim_short || []).map(v => ({...v, _term: 'kort'})), ...(rec.verzuim_long || []).map(v => ({...v, _term: 'lang'}))];
    stmts.push(`DELETE FROM public.medewerker_verzuim_perioden WHERE medewerker_id IN (SELECT id::text FROM public.medewerkers WHERE LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())});`);
    if (verzuimen.length === 0) return;
    const values = verzuimen.map(v => {
      return `((SELECT id::text FROM public.medewerkers WHERE LOWER(data->>'email') = ${sqlStr((d.email || "").toLowerCase())} LIMIT 1), ${sqlStr(v._term)}, ${sqlStr(v.first_day_of_sickness || v.eerst_ziektedag || null)}, ${sqlStr(v.expected_return_date || v.verwachte_terug || null)}, ${sqlStr(v.actual_return_date || v.werkelijke_terug || null)}, ${sqlStr(v.description || v.beschrijving || '')}, ${sqlStr(v.status || '')})`;
    }).join(",\n");
    stmts.push(`INSERT INTO public.medewerker_verzuim_perioden (medewerker_id, type, eerst_ziektedag, verwachte_terug, werkelijke_terug, beschrijving, status) VALUES\n${values};`);
  });
  return [stmts.join("\n\n")];
}

const empChunks = buildEmployeeUpdates(raw);
const notesChunks = buildNotesInserts(raw);
const docsChunks = buildDocsInserts(raw);
const verzuimChunks = buildVerzuimInserts(raw);

empChunks.forEach((sql, i) => { fs.writeFileSync(path.join(OUT_DIR, `99-emp-${String(i+1).padStart(2,"0")}.sql`), sql, "utf8"); });
notesChunks.forEach((sql, i) => { fs.writeFileSync(path.join(OUT_DIR, `99-notes-${String(i+1).padStart(2,"0")}.sql`), sql, "utf8"); });
docsChunks.forEach((sql, i) => { fs.writeFileSync(path.join(OUT_DIR, `99-docs-${String(i+1).padStart(2,"0")}.sql`), sql, "utf8"); });
verzuimChunks.forEach((sql, i) => { fs.writeFileSync(path.join(OUT_DIR, `99-verzuim-${String(i+1).padStart(2,"0")}.sql`), sql, "utf8"); });

console.log(`SQL chunks: emp=${empChunks.length}, notes=${notesChunks.length}, docs=${docsChunks.length}, verzuim=${verzuimChunks.length}`);
console.log(`Output: ${OUT_DIR}`);
