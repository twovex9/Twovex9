#!/usr/bin/env node
/**
 * rol-zichtbaarheid-medewerker-gedrag-video.mjs — DB-permissie-grants/-revokes voor de
 * rol-zichtbaarheid volgens de video-rondleidingen van de eigenaar (WhatsApp 2026-06-07):
 *   • Video 15.40.40 — "loondienst medewerker"
 *   • Video 15.43.02 — "gedragswetenschapper"
 *   • Spraakmemo 15.41.24 — "alle medewerkers moeten ALTIJD bij Planning → roosteroverzicht"
 *
 * Wijzigingen (bs2_role_permissions):
 *
 *   Gedragswetenschapper  − browse-employees   → HR-dropdown verdwijnt ("HR valt af, die
 *                                                 hoeven ze niet te zien" — video 15.43.02)
 *                         − browse-locations    → Planning toont enkel "Overzicht planning"
 *                                                 i.p.v. ook "Locaties" ("een overzicht van
 *                                                 de planning, dat is goed" — overzicht-only)
 *
 *   Beleid                + view-planning       ┐ Spraakmemo 15.41.24: ELKE interne functie
 *   Salarisadministratie  + view-planning       │ (medewerker, ZZP, hoofdfacilitair, HR,
 *   Cliëntbeheer          + view-planning       ┘ planner, beleidsmedewerker, …) moet
 *                                                 ALTIJD het roosteroverzicht kunnen inzien
 *                                                 (wie wanneer heeft gewerkt). planning.js
 *                                                 gate't bewerken eruit voor view-only rollen.
 *
 * NIET geraakt:
 *   • Detacheringsbureau — extern account, wordt via permissions-gate.js naar het
 *     bureau-portaal geleid; krijgt GEEN intern roosteroverzicht.
 *   • Medewerker Test — QA-artefact (0 permissies), geen echte functie.
 *   • Medewerker / Planner / HR / Facilitair / Zorgcoördinator / Finance / admin-tier —
 *     hebben view-planning al.
 *
 * UNION-VEILIG: multi-rol-houders houden wat hun andere rol toekent (permissie-unie in
 * permissions.js). De revokes raken alleen de zuivere Gedragswetenschapper-accounts.
 *
 * Productie-project: ukjflilnhigozfoxowmj (service-key uit scripts/.env). NIET via de MCP.
 *
 * Gebruik:
 *   node scripts/rol-zichtbaarheid-medewerker-gedrag-video.mjs            # toepassen
 *   node scripts/rol-zichtbaarheid-medewerker-gedrag-video.mjs --check    # alleen tonen
 *   node scripts/rol-zichtbaarheid-medewerker-gedrag-video.mjs --rollback # terugdraaien
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
});
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL/SERVICE_ROLE_KEY ontbreekt in scripts/.env"); process.exit(1); }
const REST = `${URL}/rest/v1/bs2_role_permissions`;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const ROLES = {
  Gedragswetenschapper: "76617491-472a-4304-b329-4a02d390776a",
  Beleid: "653d0a8c-7939-4b06-a81c-8972d80974e7",
  Salarisadministratie: "72a44210-914c-4d99-a812-5fc36d2e0da7",
  "Cliëntbeheer": "ce1c5181-0b88-4f5a-8deb-4c08f6607bc3",
};

// REVOKES = slugs die WEG moeten (apply=DELETE, rollback=INSERT terug)
const REVOKES = {
  Gedragswetenschapper: ["browse-employees", "browse-locations"],
};
// GRANTS = slugs die ERBIJ moeten (apply=INSERT, rollback=DELETE)
const GRANTS = {
  Beleid: ["view-planning"],
  Salarisadministratie: ["view-planning"],
  "Cliëntbeheer": ["view-planning"],
};

const mode = process.argv.slice(2).find((a) => a.startsWith("--")) || "--apply";

async function current(roleId, slugs) {
  const q = `${REST}?role_id=eq.${roleId}&permission_slug=in.(${slugs.join(",")})&select=permission_slug`;
  const r = await fetch(q, { headers });
  if (!r.ok) { console.error("GET faalde", r.status, await r.text()); process.exit(1); }
  return (await r.json()).map((x) => x.permission_slug);
}
async function ins(roleId, slugs) {
  if (!slugs.length) return;
  const rows = slugs.map((s) => ({ role_id: roleId, permission_slug: s, is_hierarchical: false }));
  const r = await fetch(REST, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) { console.error("INSERT faalde", r.status, await r.text()); process.exit(1); }
}
async function del(roleId, slugs) {
  if (!slugs.length) return [];
  const q = `${REST}?role_id=eq.${roleId}&permission_slug=in.(${slugs.join(",")})`;
  const r = await fetch(q, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
  if (!r.ok) { console.error("DELETE faalde", r.status, await r.text()); process.exit(1); }
  return (await r.json()).map((x) => x.permission_slug);
}

// --- REVOKES (Gedragswetenschapper) -----------------------------------------
for (const role of Object.keys(REVOKES)) {
  const roleId = ROLES[role], slugs = REVOKES[role];
  const before = await current(roleId, slugs);
  console.log(`\n=== REVOKE ${role} ===`);
  console.log("  aanwezig vóór:", slugs.map((s) => `${s}=${before.includes(s) ? "JA" : "nee"}`).join(", "));
  if (mode === "--check") continue;
  if (mode === "--rollback") {
    await ins(roleId, slugs);
    console.log("  ROLLBACK: slugs teruggezet:", slugs.join(", "));
  } else {
    const removed = await del(roleId, slugs);
    console.log("  verwijderd:", (removed || []).join(", ") || "(niets — al weg)");
  }
}

// --- GRANTS (view-planning) -------------------------------------------------
for (const role of Object.keys(GRANTS)) {
  const roleId = ROLES[role], slugs = GRANTS[role];
  const before = await current(roleId, slugs);
  console.log(`\n=== GRANT ${role} ===`);
  console.log("  aanwezig vóór:", slugs.map((s) => `${s}=${before.includes(s) ? "JA" : "nee"}`).join(", "));
  if (mode === "--check") continue;
  if (mode === "--rollback") {
    const removed = await del(roleId, slugs);
    console.log("  ROLLBACK verwijderd:", (removed || []).join(", ") || "(niets)");
  } else {
    await ins(roleId, slugs);
    const after = await current(roleId, slugs);
    console.log("  ná:", slugs.map((s) => `${s}=${after.includes(s) ? "JA" : "nee"}`).join(", "));
  }
}

console.log("\nKlaar (" + mode + ").");
