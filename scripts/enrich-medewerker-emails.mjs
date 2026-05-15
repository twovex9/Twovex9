#!/usr/bin/env node
/**
 * v3 Fase G.2 — Enrich medewerkers.data met email uit bs2-user-emails.json
 *
 * Match-strategie:
 *   1. employee_uuid / employee_id → match op medewerkers.id of data.bs2_id
 *   2. Fallback: full_name match (case-insensitive)
 *
 * VEREIST:
 *   - scripts/bs2-exports/bs2-user-emails.json (uit bs2-fetch-user-emails.js)
 *   - SUPABASE_SERVICE_ROLE_KEY env-var
 *
 * GEBRUIK:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...'
 *   node scripts/enrich-medewerker-emails.mjs --dry-run
 *   node scripts/enrich-medewerker-emails.mjs
 */

import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const INPUT = "scripts/bs2-exports/bs2-user-emails.json";

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY env-var ontbreekt.");
  process.exit(1);
}
if (!fs.existsSync(INPUT)) {
  console.error(`❌ ${INPUT} niet gevonden. Run eerst bs2-fetch-user-emails.js in BS2 console.`);
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: "Bearer " + SERVICE_KEY,
  "Content-Type": "application/json",
};

async function restGet(path) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function restPatch(path, body) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} ${r.status}: ${await r.text()}`);
}

function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

async function main() {
  console.log("🔧 v3 Fase G.2 Email-enrichment");
  console.log("Mode:", DRY_RUN ? "DRY-RUN" : "LIVE");
  console.log("");

  const users = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  console.log(`✓ ${users.length} BS2 users in ${INPUT}`);
  const withEmail = users.filter((u) => u.email);
  console.log(`✓ ${withEmail.length} hebben email`);

  const medewerkers = await restGet("medewerkers?or=(archived.is.null,archived.eq.false)&select=id,voornaam,achternaam,data&limit=500");
  console.log(`✓ ${medewerkers.length} actieve medewerkers in BS1`);
  console.log("");

  let matched = 0, alreadyHas = 0, noMatch = 0, errored = 0;
  const noMatchList = [];

  for (const med of medewerkers) {
    if (typeof med.id === "string" && med.id.startsWith("ZZZ-CLAUDE-TEST")) continue;
    if (med.data && med.data.email) { alreadyHas++; continue; }

    const fullName = `${med.voornaam || ""} ${med.achternaam || ""}`.trim();
    const bs2_id = med.data && med.data.bs2_id;

    // Match strategie
    let hit = null;
    if (bs2_id) {
      hit = withEmail.find((u) => String(u.employee_uuid) === String(bs2_id) || String(u.employee_id) === String(bs2_id));
    }
    if (!hit) {
      hit = withEmail.find((u) => norm(u.full_name) === norm(fullName) || (norm(u.first_name) === norm(med.voornaam) && norm(u.last_name) === norm(med.achternaam)));
    }

    if (!hit) {
      noMatch++;
      noMatchList.push(fullName);
      continue;
    }

    const pad = (s, n) => String(s || "").substring(0, n).padEnd(n);
    process.stdout.write(`  ${pad(fullName, 35)} → ${pad(hit.email, 38)} ... `);

    if (DRY_RUN) { console.log("DRY-RUN"); matched++; continue; }

    try {
      const newData = { ...(med.data || {}), email: hit.email };
      await restPatch(`medewerkers?id=eq.${encodeURIComponent(med.id)}`, { data: newData });
      console.log("✓");
      matched++;
    } catch (e) {
      console.log("ERROR:", e.message);
      errored++;
    }
  }

  console.log("");
  console.log("=== EINDREPORT ===");
  console.log(`Matched (email toegevoegd): ${matched}`);
  console.log(`Already had email: ${alreadyHas}`);
  console.log(`No match: ${noMatch}`);
  console.log(`Errored: ${errored}`);
  if (noMatch > 0 && noMatch < 30) {
    console.log("\nGeen match voor:");
    noMatchList.forEach((n) => console.log("  - " + n));
  }
}

main().catch((e) => { console.error("\n❌ Fatal:", e.message); process.exit(1); });
