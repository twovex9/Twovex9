#!/usr/bin/env node
/**
 * rol-zichtbaarheid-video-grants.mjs — DB-permissie-grants voor de rol-zichtbaarheid
 * volgens de video-rondleidingen van de eigenaar (WhatsApp 2026-06-07: HR-medewerker,
 * hoofdfacilitair) + de spraakmemo.
 *
 * Grants (bs2_role_permissions, is_hierarchical=false net als de leaf-rollen):
 *   HR         + view-planning                      → Planning als KIJK-overzicht (read-only;
 *                                                      planning.js gate't bewerken eruit)
 *              + view-employee-hour-registrations    → Urenregistratie als KIJK-overzicht
 *   Facilitair + view-employee-hour-registrations    → Urenregistratie kijk-overzicht
 *              + browse-mileage-declarations
 *              + view-mileage-declarations
 *              + manage-mileage-declarations         → eigen kilometers zien + invoeren
 *   Beleid     + view-mileage-declarations
 *              + manage-mileage-declarations         → eigen kilometers invoeren (spraakmemo;
 *                                                      browse-mileage-declarations had Beleid al)
 *
 * UNION-VEILIG: alle multi-rol-houders (Medine HR+Planner, orpheo Beleid+Fac+Planner,
 * irvinbonsma16 Fac+Med) hebben deze slugs al via hun andere rol of via Medewerker; de
 * grant raakt enkel de zuivere rol-accounts. Andere rollen blijven ongemoeid.
 *
 * Read-only/zichtbaarheid wordt verder client-side afgedwongen via permissions-page-map.js
 * (kilometers/taken/beleid/instellingen open; mijn-uren/mijn-beschikbaarheid deniedRoles
 * +HR/Facilitair; Facturen-items −HR) en de page-scripts. Geen DELETE van bestaande perms
 * nodig (de Facturen-afscherming voor HR loopt via allowedRoles in de page-map, niet via
 * rol-permissies).
 *
 * Productie-project: ukjflilnhigozfoxowmj (service-key uit scripts/.env). NIET via MCP.
 *
 * Gebruik:
 *   node scripts/rol-zichtbaarheid-video-grants.mjs            # toepassen
 *   node scripts/rol-zichtbaarheid-video-grants.mjs --check    # alleen tonen
 *   node scripts/rol-zichtbaarheid-video-grants.mjs --rollback # grants terugdraaien
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
  HR: "66410d7e-7984-432c-801f-6a4b6fcf2f2e",
  Facilitair: "3a4c47f8-1d49-458c-9f8e-861e032a3a0d",
  Beleid: "653d0a8c-7939-4b06-a81c-8972d80974e7",
};
const GRANTS = {
  HR: ["view-planning", "view-employee-hour-registrations"],
  Facilitair: ["view-employee-hour-registrations", "browse-mileage-declarations", "view-mileage-declarations", "manage-mileage-declarations"],
  Beleid: ["view-mileage-declarations", "manage-mileage-declarations"],
};

const mode = process.argv.slice(2).find((a) => a.startsWith("--")) || "--apply";

async function current(roleId, slugs) {
  const q = `${REST}?role_id=eq.${roleId}&permission_slug=in.(${slugs.join(",")})&select=permission_slug`;
  const r = await fetch(q, { headers });
  if (!r.ok) { console.error("GET faalde", r.status, await r.text()); process.exit(1); }
  return (await r.json()).map((x) => x.permission_slug);
}
async function ins(rows) {
  if (!rows.length) return;
  const r = await fetch(REST, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) { console.error("INSERT faalde", r.status, await r.text()); process.exit(1); }
}
async function del(roleId, slugs) {
  if (!slugs.length) return;
  const q = `${REST}?role_id=eq.${roleId}&permission_slug=in.(${slugs.join(",")})`;
  const r = await fetch(q, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
  if (!r.ok) { console.error("DELETE faalde", r.status, await r.text()); process.exit(1); }
  return (await r.json()).map((x) => x.permission_slug);
}

for (const role of Object.keys(GRANTS)) {
  const roleId = ROLES[role], slugs = GRANTS[role];
  const before = await current(roleId, slugs);
  console.log(`\n=== ${role} ===`);
  console.log("  doel-slugs vóór:", slugs.map((s) => `${s}=${before.includes(s) ? "JA" : "nee"}`).join(", "));
  if (mode === "--check") continue;
  if (mode === "--rollback") {
    const removed = await del(roleId, slugs);
    console.log("  ROLLBACK verwijderd:", (removed || []).join(", ") || "(niets)");
  } else {
    await ins(slugs.map((s) => ({ role_id: roleId, permission_slug: s, is_hierarchical: false })));
    const after = await current(roleId, slugs);
    console.log("  ná:", slugs.map((s) => `${s}=${after.includes(s) ? "JA" : "nee"}`).join(", "));
  }
}
console.log("\nKlaar (" + mode + ").");
