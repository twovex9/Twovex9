#!/usr/bin/env node
/**
 * bs2-uuid-map-populate.mjs — vul public.bs2_uuid_map met name-match
 *
 * Leest scripts/bs2-exports/bs2-export-full.json, neemt elk master-data resource
 * (municipalities, locations, care-types, competencies, certifications, agency,
 *  incident-categories), zoekt BS1 entity met zelfde naam (case-insensitive),
 * en upsert mapping in public.bs2_uuid_map.
 *
 * Gebruik:
 *   $env:SUPABASE_SERVICE_KEY = "eyJ..."   # in PowerShell
 *   node scripts/bs2-uuid-map-populate.mjs
 *
 * Idempotent — kan opnieuw gerund worden zonder side-effects (upsert op PK).
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_KEY env var ontbreekt.");
  console.error("Set: $env:SUPABASE_SERVICE_KEY = \"PLAK_HIER\"");
  process.exit(1);
}

// BS2 resource → BS1 tabel
const MAPPINGS = [
  { bs2: "/api/municipalities",     resource: "municipalities",     bs1Table: "gemeenten",            nameCol: "naam" },
  { bs2: "/api/locations",          resource: "locations",          bs1Table: "locaties",             nameCol: "naam" },
  { bs2: "/api/care-types",         resource: "care-types",         bs1Table: "zorgsoorten",          nameCol: "naam" },
  { bs2: "/api/competencies",       resource: "competencies",       bs1Table: "competenties",         nameCol: "naam" },
  { bs2: "/api/certifications",     resource: "certifications",     bs1Table: "opleidingen",          nameCol: "naam" },
  { bs2: "/api/agency",             resource: "agency",             bs1Table: "bureaus",              nameCol: "naam" },
  { bs2: "/api/incident-categories",resource: "incident-categories",bs1Table: "incident_categorieen", nameCol: "naam" },
];

function loadBS2() {
  const p = resolve(__dirname, "bs2-exports", "bs2-export-full.json");
  const raw = readFileSync(p, "utf8");
  return JSON.parse(raw).data || JSON.parse(raw);
}

async function supaSelect(tabel, select = "id,naam") {
  const url = `${SUPABASE_URL}/rest/v1/${tabel}?select=${select}&limit=10000`;
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`SELECT ${tabel} failed HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

async function supaUpsert(rows) {
  if (rows.length === 0) return { upserted: 0 };
  const url = `${SUPABASE_URL}/rest/v1/bs2_uuid_map`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`UPSERT bs2_uuid_map failed HTTP ${r.status}: ${await r.text()}`);
  return { upserted: rows.length };
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

async function run() {
  const bs2 = loadBS2();
  console.log("[bs2-uuid-map] start populate", new Date().toISOString());

  let totalMatched = 0;
  let totalUnmatched = 0;

  for (const m of MAPPINGS) {
    const bs2Rows = (bs2[m.bs2] || []).filter((x) => x && x.id && !x._error);
    if (bs2Rows.length === 0) {
      console.log(`  [${m.resource}] BS2 export bevat geen records — overslaan`);
      continue;
    }

    let bs1Rows;
    try {
      bs1Rows = await supaSelect(m.bs1Table, `id,${m.nameCol}`);
    } catch (err) {
      console.error(`  [${m.resource}] SELECT ${m.bs1Table} failed:`, err.message);
      continue;
    }

    const bs1ByName = new Map();
    for (const r of bs1Rows) {
      const n = norm(r[m.nameCol]);
      if (n) bs1ByName.set(n, r.id);
    }

    const toUpsert = [];
    let unmatched = 0;
    for (const bs2r of bs2Rows) {
      const n = norm(bs2r.name);
      const bs1Id = bs1ByName.get(n);
      if (bs1Id) {
        toUpsert.push({
          resource: m.resource,
          bs2_uuid: bs2r.id,
          bs1_uuid: bs1Id,
          name: bs2r.name,
        });
      } else {
        unmatched++;
      }
    }

    if (toUpsert.length > 0) {
      const chunkSize = 200;
      let upserted = 0;
      for (let i = 0; i < toUpsert.length; i += chunkSize) {
        const chunk = toUpsert.slice(i, i + chunkSize);
        const r = await supaUpsert(chunk);
        upserted += r.upserted;
      }
      console.log(`  [${m.resource}] ${upserted}/${bs2Rows.length} matched + upserted (${unmatched} no-match)`);
    } else {
      console.log(`  [${m.resource}] 0/${bs2Rows.length} matched (${unmatched} no-match)`);
    }

    totalMatched += toUpsert.length;
    totalUnmatched += unmatched;
  }

  console.log(`\n[bs2-uuid-map] DONE — matched: ${totalMatched}, unmatched: ${totalUnmatched}`);
  console.log(`Verificatie: SELECT resource, count(*) FROM bs2_uuid_map GROUP BY resource ORDER BY resource;`);
}

run().catch((err) => {
  console.error("\n[bs2-uuid-map] FATAL:", err.message);
  process.exit(1);
});
