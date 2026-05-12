#!/usr/bin/env node
/**
 * bs2-fk-resolve.mjs
 *
 * Voor records die via bs2-full-import.mjs zijn geport: koppel FK's (client_id,
 * locatie_id, melder_id) via naam-match naar BS1 UUIDs.
 *
 * Werkwijze:
 *   1. Bouw naam → BS1 UUID caches (clienten op voornaam+achternaam, medewerkers op email/naam, locaties op naam)
 *   2. Voor elk BS2 record uit JSON:
 *      - Lookup BS1 UUID via naam
 *      - PATCH via Supabase REST API
 *
 * Idempotent: PATCH overschrijft bestaande FK's met zelfde of nieuwe waarde.
 *
 * Usage:
 *   $env:SUPABASE_SERVICE_KEY = "eyJ..."
 *   node scripts/bs2-fk-resolve.mjs           # alle resources
 *   node scripts/bs2-fk-resolve.mjs --only incidenten
 *   node scripts/bs2-fk-resolve.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "bs2-exports", "bs2-export-full.json");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const VERBOSE = args.includes("--verbose");

if (!SUPABASE_KEY && !DRY_RUN) {
  console.error("ERROR: SUPABASE_SERVICE_KEY env var ontbreekt.");
  process.exit(1);
}

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function fetchAll(table, columns) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${columns}&limit=10000`;
  const r = await fetch(url, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) throw new Error(`Fetch ${table} failed: ${r.status}`);
  return r.json();
}

async function patchRecord(table, id, body) {
  if (DRY_RUN) return { ok: true, dry: true };
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, status: r.status, body: txt.slice(0, 300) };
  }
  return { ok: true };
}

async function main() {
  console.log("=== BS2 FK-resolve ===");
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "LIVE PATCH"}`);
  if (ONLY) console.log(`Only: ${ONLY}`);

  // Lees JSON
  const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const data = raw.data;

  // Bouw BS1 lookup-caches
  console.log("\n--- Caches opbouwen ---");
  const bs1Clienten = await fetchAll("clienten", "id,voornaam,achternaam");
  console.log(`BS1 clienten: ${bs1Clienten.length}`);
  const bs1Medewerkers = await fetchAll("medewerkers", "id,voornaam,achternaam,email");
  console.log(`BS1 medewerkers: ${bs1Medewerkers.length}`);
  const bs1Locaties = await fetchAll("locaties", "id,naam");
  console.log(`BS1 locaties: ${bs1Locaties.length}`);

  // Maps: naam → BS1 UUID
  const cliMap = new Map();
  for (const c of bs1Clienten) {
    const key = norm(c.voornaam + " " + c.achternaam);
    if (!cliMap.has(key)) cliMap.set(key, c.id);
  }
  const medMapByEmail = new Map();
  const medMapByName = new Map();
  for (const m of bs1Medewerkers) {
    if (m.email) medMapByEmail.set(norm(m.email), m.id);
    const nameKey = norm(m.voornaam + " " + m.achternaam);
    if (!medMapByName.has(nameKey)) medMapByName.set(nameKey, m.id);
  }
  const locMap = new Map();
  for (const l of bs1Locaties) {
    locMap.set(norm(l.naam), l.id);
  }

  // BS2 clients lookup (uuid → name) — nodig voor beschikkingen/facturen die alleen client_id sturen
  const bs2ClientsArr = Array.isArray(data["/api/clients"]) ? data["/api/clients"] : (data["/api/clients"]?.data || []);
  const bs2ClientById = new Map();
  for (const c of bs2ClientsArr) {
    bs2ClientById.set(c.id, c);
  }
  console.log(`BS2 clients (in JSON): ${bs2ClientsArr.length}`);

  const summary = [];

  // === INCIDENTEN ===
  if (!ONLY || ONLY === "incidenten") {
    console.log("\n--- Incidenten ---");
    const incArr = Array.isArray(data["/api/incidents"]) ? data["/api/incidents"] : (data["/api/incidents"]?.data || []);
    let resolved = 0, missed = 0, errors = 0;
    for (const inc of incArr) {
      const patch = {};
      // client_id via clients[0].name → BS1 cliënt
      const bs2Client = Array.isArray(inc.clients) && inc.clients[0] ? inc.clients[0] : null;
      if (bs2Client) {
        const key = norm((bs2Client.first_name || "") + " " + (bs2Client.last_name || ""));
        const bs1Id = cliMap.get(key);
        if (bs1Id) patch.client_id = bs1Id;
      }
      // locatie_id via location.name → BS1 locatie
      if (inc.location?.name) {
        const bs1LocId = locMap.get(norm(inc.location.name));
        if (bs1LocId) patch.locatie_id = bs1LocId;
      }
      // melder_id via reporter.email → BS1 medewerker
      if (inc.reporter?.email) {
        const bs1MedId = medMapByEmail.get(norm(inc.reporter.email));
        if (bs1MedId) patch.melder_id = bs1MedId;
      } else if (inc.reporter?.name) {
        const bs1MedId = medMapByName.get(norm(inc.reporter.name));
        if (bs1MedId) patch.melder_id = bs1MedId;
      }

      if (Object.keys(patch).length === 0) { missed++; continue; }
      const r = await patchRecord("incidenten", inc.id, patch);
      if (r.ok) resolved++;
      else { errors++; if (VERBOSE) console.log(`  ERR ${inc.id}: ${r.body}`); }
    }
    console.log(`  resolved: ${resolved}, missed: ${missed}, errors: ${errors}`);
    summary.push({ resource: "incidenten", resolved, missed, errors });
  }

  // === BESCHIKKINGEN ===
  if (!ONLY || ONLY === "beschikkingen") {
    console.log("\n--- Beschikkingen ---");
    const arr = Array.isArray(data["/api/dispositions"]) ? data["/api/dispositions"] : (data["/api/dispositions"]?.data || []);
    let resolved = 0, missed = 0, errors = 0;
    for (const d of arr) {
      const patch = {};
      // BS2 disposition.client_id → BS2 client → naam → BS1 cliënt
      const bs2ClientId = d.client_id || d.client?.id;
      if (bs2ClientId) {
        const bs2Client = bs2ClientById.get(bs2ClientId);
        if (bs2Client) {
          const key = norm((bs2Client.first_name || "") + " " + (bs2Client.last_name || ""));
          const bs1Id = cliMap.get(key);
          if (bs1Id) patch.client_id = bs1Id;
        }
      }
      // Daarnaast: locatie via location.name als string
      if (d.location?.name && !patch.locatie) {
        // locatie is een text-kolom in beschikkingen, niet FK — niet patchen
      }
      if (Object.keys(patch).length === 0) { missed++; continue; }
      const r = await patchRecord("beschikkingen", d.id, patch);
      if (r.ok) resolved++;
      else { errors++; if (VERBOSE) console.log(`  ERR ${d.id}: ${r.body}`); }
    }
    console.log(`  resolved: ${resolved}, missed: ${missed}, errors: ${errors}`);
    summary.push({ resource: "beschikkingen", resolved, missed, errors });
  }

  // === FACTUREN ===
  if (!ONLY || ONLY === "facturen") {
    console.log("\n--- Facturen ---");
    const arr = Array.isArray(data["/api/invoices"]) ? data["/api/invoices"] : (data["/api/invoices"]?.data || []);
    let resolved = 0, missed = 0, errors = 0;
    for (const f of arr) {
      const patch = {};
      const bs2ClientId = f.client?.id;
      if (bs2ClientId) {
        const bs2Client = bs2ClientById.get(bs2ClientId);
        if (bs2Client) {
          const key = norm((bs2Client.first_name || "") + " " + (bs2Client.last_name || ""));
          const bs1Id = cliMap.get(key);
          if (bs1Id) {
            patch.client_id = bs1Id;
            patch.client_label = (bs2Client.first_name + " " + bs2Client.last_name).trim();
            if (bs2Client.client_number) patch.clientnummer = String(bs2Client.client_number);
          }
        }
      }
      if (Object.keys(patch).length === 0) { missed++; continue; }
      const r = await patchRecord("facturen", f.id, patch);
      if (r.ok) resolved++;
      else { errors++; if (VERBOSE) console.log(`  ERR ${f.id}: ${r.body}`); }
    }
    console.log(`  resolved: ${resolved}, missed: ${missed}, errors: ${errors}`);
    summary.push({ resource: "facturen", resolved, missed, errors });
  }

  console.log("\n=== Summary ===");
  console.table(summary);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
