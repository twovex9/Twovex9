#!/usr/bin/env node
/**
 * medewerker-rol-permissies.mjs — verscherp de zichtbaarheid van de rol "Medewerker".
 *
 * Achtergrond (video-feedback eigenaar 2026-06-07): een zuivere zorgmedewerker zag
 * van oudsher HR, Cliënten en de Labels-beheerpagina (Urenregistratie) plus de
 * planner-only "Locaties" in zijn menu. Dat komt doordat de rol "Medewerker" deze
 * vier permissie-slugs had die het menu ontsluiten:
 *
 *   - browse-employees  → HR-dropdown (Medewerkers-overzicht)
 *   - browse-clients    → Cliënten-dropdown
 *   - browse-labels     → Urenregistratie → "Labels" (labelbeheer)
 *   - browse-locations  → Planning → "Locaties" (locatiebeheer)
 *
 * Deze slugs worden van de Medewerker-rol verwijderd. UNION-VEILIG: van de 105
 * gebruikers met deze rol zijn er 103 puur-Medewerker (verliezen de toegang, gewenst)
 * en 2 multi-rol (Finance+Medewerker / Facilitair+Medewerker) — die houden wat hun
 * ANDERE rol toekent (permissie-unie in permissions.js), dus geen onbedoeld verlies.
 *
 * De medewerker houdt: home/nieuws, mijn-gegevens, mijn-beschikbaarheid, mijn-uren
 * (self-service uren mét toevoeg-knop), planning (eigen diensten, read-only),
 * incidenten (eigen meldingen), kilometers, taken en — nieuw — beleid (read-only).
 *
 * Productie-project: ukjflilnhigozfoxowmj (service-key uit scripts/.env).
 * NIET via de Supabase-MCP (die wijst naar het oude project).
 *
 * Gebruik:
 *   node scripts/medewerker-rol-permissies.mjs            # toepassen (DELETE)
 *   node scripts/medewerker-rol-permissies.mjs --check    # alleen tonen (geen mutatie)
 *   node scripts/medewerker-rol-permissies.mjs --rollback # terugdraaien (re-insert)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env inlezen (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
const env = {};
try {
  readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  });
} catch (e) {
  console.error("Kan scripts/.env niet lezen:", e.message);
  process.exit(1);
}
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL/SERVICE_ROLE_KEY ontbreekt in scripts/.env"); process.exit(1); }

const ROLE_ID = "15153cc8-46ae-4d01-ba03-7ff9418c22af"; // bs2_roles.name = "Medewerker"
const SLUGS = ["browse-employees", "browse-clients", "browse-labels", "browse-locations"];
const REST = `${URL}/rest/v1/bs2_role_permissions`;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const mode = process.argv.slice(2).find((a) => a.startsWith("--")) || "--apply";

async function listCurrent() {
  const q = `${REST}?role_id=eq.${ROLE_ID}&permission_slug=in.(${SLUGS.join(",")})&select=permission_slug,is_hierarchical`;
  const r = await fetch(q, { headers });
  return r.json();
}

async function main() {
  const before = await listCurrent();
  console.log(`Medewerker-rol heeft nu ${before.length}/4 doel-slugs:`, before.map((x) => x.permission_slug).join(", ") || "(geen)");

  if (mode === "--check") return;

  if (mode === "--rollback") {
    // Re-insert (is_hierarchical=true zoals de oorspronkelijke rijen).
    const rows = SLUGS.map((s) => ({ role_id: ROLE_ID, permission_slug: s, is_hierarchical: true }));
    const r = await fetch(REST, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows),
    });
    if (!r.ok) { console.error("Rollback (insert) faalde:", r.status, await r.text()); process.exit(1); }
    console.log("Rollback toegepast — 4 slugs terug op de Medewerker-rol.");
  } else {
    // Apply: DELETE de 4 slugs.
    const q = `${REST}?role_id=eq.${ROLE_ID}&permission_slug=in.(${SLUGS.join(",")})`;
    const r = await fetch(q, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
    if (!r.ok) { console.error("DELETE faalde:", r.status, await r.text()); process.exit(1); }
    const removed = await r.json();
    console.log(`Verwijderd: ${removed.length} rij(en) —`, removed.map((x) => x.permission_slug).join(", "));
  }

  const after = await listCurrent();
  console.log(`Na afloop: ${after.length}/4 doel-slugs aanwezig.`, after.map((x) => x.permission_slug).join(", ") || "(geen — verscherping actief)");
}

main().catch((e) => { console.error(e); process.exit(1); });
