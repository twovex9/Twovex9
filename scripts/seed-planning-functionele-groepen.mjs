#!/usr/bin/env node
/**
 * seed-planning-functionele-groepen.mjs
 *
 * Achtergrond (user-eis 2026-06-11): Locatiebeheer (`public.locaties`) is dé bron van
 * waarheid voor het locatie-overzicht in de planning. De planning bundelt echter ook
 * twee *functionele* groepen — "Eén op één / Ambulant" (alle 1-op-1/ambulant-diensten)
 * en "Achterwacht" — onder een eigen kop, los van hun woonlocatie. Die kop-namen zijn
 * hardcoded in planning.js (EEN_OP_EEN_GROEP / ACHTERWACHT_GROEP).
 *
 * Probleem dat dit script oplost: die functionele groepen verschenen wél in het
 * planning-overzicht maar NIET in Locatiebeheer → de eigenaar kon ze daar niet
 * terugzien/beheren, terwijl Locatiebeheer juist de basis hoort te zijn. "Achterwacht"
 * bestond al als locatie-rij; "Eén op één / Ambulant" ontbrak.
 *
 * Oplossing: zorg dat beide groep-namen ook als rij in `public.locaties` bestaan, met
 * EXACT dezelfde naam als de constante in planning.js. Dan:
 *   - ziet de eigenaar ze in Locatiebeheer en kan hij ze beheren;
 *   - valt de planning-kop samen met de HR-locatierij (zelfde string → één groep,
 *     geen dubbele rij).
 *
 * Idempotent: voegt een rij alleen toe als er nog GEEN rij met die naam bestaat (actief
 * óf gearchiveerd). Een bewust gearchiveerde/verwijderde rij wordt dus niet teruggezet.
 *
 * Run:  node scripts/seed-planning-functionele-groepen.mjs
 * Vereist scripts/.env met SUPABASE_ACCESS_TOKEN (zie db-exec.mjs).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  });
} catch (e) { /* .env optioneel */ }

const REF = env.SUPABASE_PROJECT_REF || "ukjflilnhigozfoxowmj";
const PAT = env.SUPABASE_ACCESS_TOKEN;

if (!PAT) {
  console.error("SUPABASE_ACCESS_TOKEN ontbreekt in scripts/.env — zie db-exec.mjs.");
  process.exit(2);
}

// Canonieke functionele planning-groepen. Naam = EXACT de constante in planning.js.
const GROEPEN = [
  { naam: "Eén op één / Ambulant", kleur: "#2dd4bf" },
  { naam: "Achterwacht", kleur: "#fb923c" },
];

// Idempotente upsert-via-insert: alleen toevoegen als er nog geen gelijknamige rij is
// (case-insensitief, trim) — actief of gearchiveerd.
const values = GROEPEN.map(
  (g) =>
    `(select '${g.naam.replace(/'/g, "''")}'::text, '${g.kleur}'::text where not exists (` +
    `select 1 from public.locaties where lower(trim(naam)) = lower('${g.naam.replace(/'/g, "''")}')))`
).join("\nunion all\n");

const sql = `
with kandidaten(naam, kleur) as (
${values}
)
insert into public.locaties (naam, kleur, niet_in_planning, archived)
select naam, kleur, false, false from kandidaten
returning naam, kleur;
`;

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await r.text();
if (!r.ok) {
  console.error(`Management API ${r.status}: ${text}`);
  process.exit(1);
}
let out;
try { out = JSON.parse(text); } catch { out = text; }
const toegevoegd = Array.isArray(out) ? out : [];
if (!toegevoegd.length) {
  console.log("✓ Niets toegevoegd — alle functionele planning-groepen bestaan al in Locatiebeheer.");
} else {
  console.log("✓ Toegevoegd aan Locatiebeheer:");
  toegevoegd.forEach((row) => console.log(`   • ${row.naam} (${row.kleur})`));
}
