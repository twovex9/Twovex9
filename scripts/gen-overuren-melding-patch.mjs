#!/usr/bin/env node
/**
 * gen-overuren-melding-patch.mjs — genereert een idempotente migratie die:
 *  1. de "Overuren te beoordelen"-melding (zzp_factuur_opslaan) óók naar
 *     planner + directeur stuurt (was alleen teamleider/zorgcoördinator);
 *  2. de planner toegang geeft tot het beoordelen (zzp_overuren_open +
 *     zzp_overuren_beoordelen).
 *
 * Werkwijze: haalt de LIVE functiedefinitie op (Management API), doet een
 * exacte string-replace met assertie (precies 1 match), schrijft het resultaat
 * naar een .sql. Zo blijft de rest van de functie 1-op-1 gelijk.
 *
 * Run: node scripts/gen-overuren-melding-patch.mjs  (schrijft de .sql naar stdout-pad)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
});
const REF = env.SUPABASE_PROJECT_REF || "ukjflilnhigozfoxowmj";
const PAT = env.SUPABASE_ACCESS_TOKEN;

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Management API ${r.status}: ${text}`);
  return JSON.parse(text);
}

async function getDef(name) {
  const rows = await q(`select pg_get_functiondef(oid) as def from pg_proc where proname='${name}';`);
  if (!rows.length) throw new Error(`functie ${name} niet gevonden`);
  return rows[0].def;
}

function replaceOnce(src, find, repl, label) {
  const idx = src.indexOf(find);
  if (idx === -1) throw new Error(`[${label}] zoektekst niet gevonden:\n${find}`);
  if (src.indexOf(find, idx + find.length) !== -1) throw new Error(`[${label}] zoektekst komt meer dan 1× voor`);
  return src.slice(0, idx) + repl + src.slice(idx + find.length);
}

const parts = [];

// 1) zzp_overuren_open — planner toevoegen aan de toegangsgate
{
  let def = await getDef("zzp_overuren_open");
  def = replaceOnce(def,
    "where p.id=auth.uid() and r.slug='teamleider'))",
    "where p.id=auth.uid() and r.slug in ('teamleider','planner')))",
    "open-gate");
  parts.push(def.trim() + ";");
}

// 2) zzp_overuren_beoordelen — planner toevoegen aan de gate + nettere foutmelding
{
  let def = await getDef("zzp_overuren_beoordelen");
  def = replaceOnce(def,
    "where p.id=auth.uid() and r.slug='teamleider');",
    "where p.id=auth.uid() and r.slug in ('teamleider','planner'));",
    "beoordeel-gate");
  def = replaceOnce(def,
    "return jsonb_build_object('error','alleen een teamleider/zorgcoördinator kan dit beoordelen'); end if;",
    "return jsonb_build_object('error','alleen een zorgcoördinator, planner of directeur kan dit beoordelen'); end if;",
    "beoordeel-msg");
  parts.push(def.trim() + ";");
}

// 3) zzp_factuur_opslaan — melding óók naar planner + directeur (distinct per gebruiker)
{
  let def = await getDef("zzp_factuur_opslaan");
  def = replaceOnce(def,
    "    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)\n" +
    "    select p.id, 'zzp_overuren', 'Uren-wijziging ter goedkeuring',\n" +
    "      coalesce(v_fac.medewerker_naam,'Een ZZP''er') || ' heeft de uren aangepast op de factuur van ' ||\n" +
    "        coalesce(v_fac.locatie,'?') || '. Controleer en keur goed of af.',\n" +
    "      'zzp_factuur', p_factuur_id::text\n" +
    "    from public.profiles p\n" +
    "    join public.bs2_role_users ru on lower(btrim(p.email)) = lower(btrim(ru.user_email))\n" +
    "    join public.bs2_roles r on r.id = ru.role_id\n" +
    "    where r.slug = 'teamleider';",
    "    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)\n" +
    "    select distinct p.id, 'zzp_overuren', 'Overuren te beoordelen',\n" +
    "      coalesce(v_fac.medewerker_naam,'Een ZZP''er') || ' heeft de uren aangepast op de factuur van ' ||\n" +
    "        coalesce(v_fac.locatie,'?') || '. Beoordeel de overuren: keur goed of af.',\n" +
    "      'zzp_factuur', p_factuur_id::text\n" +
    "    from public.profiles p\n" +
    "    join public.bs2_role_users ru on lower(btrim(p.email)) = lower(btrim(ru.user_email))\n" +
    "    join public.bs2_roles r on r.id = ru.role_id\n" +
    "    where r.slug in ('teamleider','planner','directeur');",
    "melding-ontvangers");
  parts.push(def.trim() + ";");
}

const header =
  "-- overuren-melding-planner-directeur.sql (gegenereerd uit live defs)\n" +
  "-- 1) melding 'Overuren te beoordelen' → teamleider/zorgcoördinator + planner + directeur\n" +
  "-- 2) planner mag overuren beoordelen (open + beoordelen RPC)\n" +
  "-- Idempotent: CREATE OR REPLACE.\n\n";

const outPath = resolve(__dirname, "..", "supabase", "migrations", "overuren-melding-planner-directeur.sql");
writeFileSync(outPath, header + parts.join("\n\n") + "\n", "utf8");
console.log("Geschreven naar: " + outPath);
console.log("Aantal statements: " + parts.length);
