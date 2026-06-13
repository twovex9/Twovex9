#!/usr/bin/env node
/**
 * beleid-rol-permissies.mjs — stem de zichtbaarheid van de rol "Beleid"
 * (de beleidsmedewerker) af op de video-feedback van de eigenaar (WhatsApp
 * 2026-06-07, "beleidsmedewerker-rondleiding").
 *
 * Gewenste eindstand pure Beleid-rol (top-nav):
 *   zichtbaar: Home, Mijn facturen, Kilometers, Taken, "Incidenten en klachten"
 *              (incl. dashboard; cliënt komt binnen een incident naar voren),
 *              Beleid (mag hij bewerken), SharePoint.
 *   verborgen: Mijn beschikbaarheid, Mijn uren, Planning, Urenregistratie, HR,
 *              Cliënten (als los kopje), Facturen (kantoor) en alle bestuur/beheer.
 *
 * Wat dit script in de DB (`bs2_role_permissions`, rol Beleid) doet:
 *   - VERWIJDER `browse-clients`    → Cliënten-dropdown verdwijnt (de kop + het
 *                                     "Cliënten"-item keyen hierop).
 *   - VERWIJDER `browse-care-types` → het "Zorgsoorten"-item verdwijnt; samen met
 *                                     browse-clients valt de hele Cliënten-mega weg.
 *   - BEHOUD    `view-clients`      → NIET aanraken: cliënt-detail blijft bereikbaar
 *                                     vanuit een incident ("cliënt naar voren laten
 *                                     komen / naar de cliënt kijken"). incidenten.js
 *                                     leest clientenDB sowieso direct, niet via ffCan.
 *   - TOEVOEG   `browse-mileage-declarations` → Kilometers-dropdown ("Kilometer
 *                                     declaraties") wordt zichtbaar ("die kan je wel
 *                                     laten staan"). De 2 beheer-subpagina's blijven
 *                                     verborgen (page-map allowedRoles zonder Beleid).
 *
 * UNION-VEILIG: er zijn maar 2 Beleid-users — `orpheo.parker` (Beleid+Facilitair+
 * Planner) en `qa-beleid` (puur). Geen van orpheo's andere rollen geeft browse-clients/
 * browse-care-types, dus beiden verliezen de Cliënten-kop (gewenst). browse-mileage-
 * declarations heeft orpheo al via Planner; alleen qa-beleid krijgt Kilometers erbij.
 * Andere rollen blijven volledig ongemoeid (we bewerken enkel de Beleid-rol-rijen).
 *
 * Productie-project: ukjflilnhigozfoxowmj (service-key uit scripts/.env).
 * NIET via de Supabase-MCP (die wijst naar het oude project).
 *
 * Gebruik:
 *   node scripts/beleid-rol-permissies.mjs            # toepassen
 *   node scripts/beleid-rol-permissies.mjs --check    # alleen tonen (geen mutatie)
 *   node scripts/beleid-rol-permissies.mjs --rollback # terugdraaien naar oorspronkelijk
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
} catch (e) {
  console.error("Kan scripts/.env niet lezen:", e.message);
  process.exit(1);
}
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL/SERVICE_ROLE_KEY ontbreekt in scripts/.env"); process.exit(1); }

const ROLE_ID = "653d0a8c-7939-4b06-a81c-8972d80974e7"; // bs2_roles.name = "Beleid"
const REMOVE = ["browse-clients", "browse-care-types"];  // weghalen → Cliënten/Zorgsoorten weg
const ADD = ["browse-mileage-declarations"];             // toevoegen → Kilometers zichtbaar
const ALL = [...REMOVE, ...ADD];
const REST = `${URL}/rest/v1/bs2_role_permissions`;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const mode = process.argv.slice(2).find((a) => a.startsWith("--")) || "--apply";

async function listCurrent() {
  const q = `${REST}?role_id=eq.${ROLE_ID}&permission_slug=in.(${ALL.join(",")})&select=permission_slug,is_hierarchical`;
  const r = await fetch(q, { headers });
  return r.json();
}

async function del(slugs) {
  if (!slugs.length) return [];
  const q = `${REST}?role_id=eq.${ROLE_ID}&permission_slug=in.(${slugs.join(",")})`;
  const r = await fetch(q, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
  if (!r.ok) { console.error("DELETE faalde:", r.status, await r.text()); process.exit(1); }
  return r.json();
}

async function ins(rows) {
  if (!rows.length) return;
  const r = await fetch(REST, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) { console.error("INSERT faalde:", r.status, await r.text()); process.exit(1); }
}

async function main() {
  const before = await listCurrent();
  const has = (s) => before.some((x) => x.permission_slug === s);
  console.log("Beleid-rol — doel-slugs vóór:",
    ALL.map((s) => `${s}=${has(s) ? "JA" : "nee"}`).join(", "));

  if (mode === "--check") return;

  if (mode === "--rollback") {
    // Terug naar oorspronkelijk: REMOVE weer erin (is_hierarchical=true zoals origineel),
    // ADD er weer uit.
    await ins(REMOVE.map((s) => ({ role_id: ROLE_ID, permission_slug: s, is_hierarchical: true })));
    await del(ADD);
    console.log("Rollback toegepast: browse-clients/browse-care-types terug, browse-mileage-declarations weg.");
  } else {
    // Apply: REMOVE eruit, ADD erin (is_hierarchical=false, zoals de leaf-rollen
    // Planner/Medewerker die deze slug al hebben — ffCan negeert is_hierarchical sowieso).
    const removed = await del(REMOVE);
    console.log(`Verwijderd (${removed.length}):`, removed.map((x) => x.permission_slug).join(", ") || "(niets — al weg)");
    await ins(ADD.map((s) => ({ role_id: ROLE_ID, permission_slug: s, is_hierarchical: false })));
    console.log(`Toegevoegd:`, ADD.join(", "));
  }

  const after = await listCurrent();
  const hasA = (s) => after.some((x) => x.permission_slug === s);
  console.log("Beleid-rol — doel-slugs ná:",
    ALL.map((s) => `${s}=${hasA(s) ? "JA" : "nee"}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
