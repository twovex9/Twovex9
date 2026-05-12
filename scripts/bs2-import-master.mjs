#!/usr/bin/env node
/**
 * bs2-import-master.mjs
 *
 * Leest scripts/bs2-exports/bs2-export-full.json en genereert SQL INSERT
 * statements voor de master-data tabellen.
 *
 * Usage:
 *   node scripts/bs2-import-master.mjs <resource>
 *
 *   resource = zorgsoorten | locaties | bureaus | competenties | opleidingen
 *            | gemeenten | organisaties | salarisschalen | incident_categorieen
 *
 * Output: SQL naar stdout. Pipe naar bestand:
 *   node scripts/bs2-import-master.mjs zorgsoorten > scripts/_tmp_zorgsoorten.sql
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const JSON_PATH = join(__dirname, "bs2-exports", "bs2-export-full.json");

function readJson() {
  return JSON.parse(readFileSync(JSON_PATH, "utf8"));
}

function quote(v) {
  if (v == null || v === "") return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function quoteNum(v) {
  if (v == null || v === "") return "NULL";
  return Number(v).toString();
}
function quoteBool(v) {
  if (v == null) return "FALSE";
  return v ? "TRUE" : "FALSE";
}
function quoteUuid(v) {
  if (!v) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'::uuid";
}

const generators = {
  zorgsoorten: (data) => {
    // BS1 check constraint: tarieftype IN ('dag', 'uur', 'week')
    const tarMap = { daily: "dag", hourly: "uur", weekly: "week" };
    const arr = data["/api/care-types"] || [];
    const rows = arr.map(r => `(${quoteUuid(r.id)}, ${quote(r.name)}, ${quote(tarMap[r.tariff_type] || null)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.zorgsoorten (id, naam, tarieftype, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  locaties: (data) => {
    const arr = data["/api/locations"] || [];
    const rows = arr.map(r => {
      const a = r.address || {};
      const adres = [a.street, a.house_number, a.house_number_addition].filter(Boolean).join(" ");
      return `(${quoteUuid(r.id)}, ${quote(r.name)}, ${quote(adres)}, ${quote(r.color)}, ${quote(a.postcode)}, ${quote(a.house_number)}, ${quote(a.house_number_addition)}, ${quote(a.street)}, ${quote(a.city)}, FALSE)`;
    }).join(",\n  ");
    return `INSERT INTO public.locaties (id, naam, adres, kleur, postcode, huisnummer, toevoeging, straat, plaats, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  bureaus: (data) => {
    const arr = data["/api/agency"] || [];
    const rows = arr.map(r => `(${quoteUuid(r.id)}, ${quote(r.name)}, ${quoteNum(r.default_hourly_rate)}, ${quoteNum(r.default_hourly_fee)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.bureaus (id, naam, standaard_uurtarief, fee_per_uur, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  competenties: (data) => {
    const arr = data["/api/competencies"] || [];
    const rows = arr.map(r => `(${quoteUuid(r.id)}, ${quote(r.name)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.competenties (id, naam, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  opleidingen: (data) => {
    const arr = data["/api/certifications"] || [];
    const rows = arr.map(r => `(${quoteUuid(r.id)}, ${quote(r.name)}, ${quoteBool(r.is_skj)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.opleidingen (id, naam, skj, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  gemeenten: (data) => {
    const arr = data["/api/municipalities"] || [];
    const rows = arr.map(r => `(${quoteUuid(r.id)}, ${quote(r.name)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.gemeenten (id, naam, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  organisaties: (data) => {
    const arr = data["/api/organizations"] || [];
    const rows = arr.map(r => `(${quote(r.id)}, ${quote(r.name)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.organisaties (id, naam, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  salarisschalen: (data) => {
    const arr = data["/api/salary-scales"] || [];
    const rows = arr.map((r, idx) => `(${quote(r.id)}, ${quote(r.title || r.name)}, '${JSON.stringify(r.rows || r.steps || []).replace(/'/g, "''")}'::jsonb, ${idx})`).join(",\n  ");
    return `INSERT INTO public.salarisschalen (id, title, rows, sort_order) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
  incident_categorieen: (data) => {
    const arr = data["/api/incident-categories"] || [];
    const rows = arr.map(r => `(${quote(r.id)}, ${quote(r.name)}, ${quote(r.description)}, FALSE)`).join(",\n  ");
    return `INSERT INTO public.incident_categorieen (id, naam, beschrijving, archived) VALUES\n  ${rows}\nON CONFLICT (id) DO NOTHING;`;
  },
};

function main() {
  const resource = process.argv[2];
  if (!resource) {
    console.error("Usage: node bs2-import-master.mjs <resource>");
    console.error("Resources: " + Object.keys(generators).join(", "));
    process.exit(1);
  }
  const gen = generators[resource];
  if (!gen) {
    console.error("Onbekende resource: " + resource);
    process.exit(2);
  }
  const data = readJson().data;
  const sql = gen(data);
  console.log(sql);
  console.error("[" + resource + "] SQL gegenereerd");
}

main();
