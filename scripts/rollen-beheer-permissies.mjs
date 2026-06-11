#!/usr/bin/env node
/**
 * rollen-beheer-permissies.mjs — stem de UI-zichtbaarheid van het rol-beheer af
 * op de spraakmemo van de eigenaar (WhatsApp 2026-06-11, 14.20.12):
 *
 *   "Bij instellingen → mijn profiel → het kopje rollen mag de medewerker niet
 *    zelfstandig zijn rol aanpassen. De enige personen die dat mogen aanpassen
 *    zijn de eigenaar, HR, directeur en de admin. De rest van alle andere
 *    rollen mogen deze functie niet kunnen wijzigen of aanpassen."
 *
 * De server-side enforcement zit in de migratie rollen_beheer_authz.sql
 * (RLS write-policies op bs2_role_users/_permissions/_roles → can_manage_roles()
 * = Eigenaar/HR/Directeur/Admin). Dit script lijnt de UI-permissies daarop uit,
 * zodat de Rollen-/Gebruikers-schermen exact voor die 4 rollen zichtbaar/bruikbaar
 * zijn en voor de rest verdwijnen (geen misleidende, server-side toch geblokkeerde
 * knoppen).
 *
 * Gewenste eindstand van de rol-beheer-slugs:
 *   manage-roles  → Admin, Directeur, Eigenaar, HR
 *   view-roles    → Admin, Directeur, Eigenaar, HR   (gate voor rollen.html / rol-detail.html)
 *   browse-roles  → Admin, Directeur, Eigenaar, HR
 *   manage-users  → Admin, Directeur, Eigenaar       (gate voor gebruikers.html — die draait
 *                   op de admin-tier-only Edge Function admin-user-mgmt; HR beheert rollen
 *                   via de Rollen-pagina's, niet via het volledige gebruikersbeheer)
 *
 * Concrete mutaties t.o.v. de huidige stand:
 *   HR (slug hr)              + view-roles, + browse-roles, + manage-roles
 *   Zorgcoördinator (teamleider) − view-roles, − browse-roles, − manage-roles, − manage-users
 *   Planner (planner)         − manage-users
 *
 * Eigenaar/Directeur/Admin hadden alle vier al → ongemoeid.
 * impersonate-users blijft bewust ongemoeid (apart, sensitief, buiten scope memo).
 *
 * Productie-project: ukjflilnhigozfoxowmj (service-key uit scripts/.env).
 * NIET via de Supabase-MCP (die wijst naar het oude project).
 *
 * Gebruik:
 *   node scripts/rollen-beheer-permissies.mjs            # toepassen
 *   node scripts/rollen-beheer-permissies.mjs --check    # alleen tonen (geen mutatie)
 *   node scripts/rollen-beheer-permissies.mjs --rollback # terugdraaien naar oorspronkelijk
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

// bs2_roles.id
const HR = "66410d7e-7984-432c-801f-6a4b6fcf2f2e";          // HR
const ZORGCO = "47bfbbad-ee05-4db4-b8e6-8dd881db4384";      // Zorgcoördinator (slug teamleider)
const PLANNER = "5e200620-a1da-462f-bc8e-7d052f98f21e";     // Planner

// Mutaties: { role_id, add:[slugs], remove:[slugs] }. Origineel was is_hierarchical=true
// voor alle betrokken rijen → add/rollback met hier:true voor getrouwheid.
const PLAN = [
  { name: "HR",              role_id: HR,      add: ["view-roles", "browse-roles", "manage-roles"], remove: [] },
  { name: "Zorgcoördinator", role_id: ZORGCO,  add: [], remove: ["view-roles", "browse-roles", "manage-roles", "manage-users"] },
  { name: "Planner",         role_id: PLANNER, add: [], remove: ["manage-users"] },
];

const REST = `${URL}/rest/v1/bs2_role_permissions`;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const mode = process.argv.slice(2).find((a) => a.startsWith("--")) || "--apply";

async function listFor(roleId, slugs) {
  if (!slugs.length) return [];
  const q = `${REST}?role_id=eq.${roleId}&permission_slug=in.(${slugs.join(",")})&select=permission_slug,is_hierarchical`;
  const r = await fetch(q, { headers });
  if (!r.ok) { console.error("SELECT faalde:", r.status, await r.text()); process.exit(1); }
  return r.json();
}

async function del(roleId, slugs) {
  if (!slugs.length) return [];
  const q = `${REST}?role_id=eq.${roleId}&permission_slug=in.(${slugs.join(",")})`;
  const r = await fetch(q, { method: "DELETE", headers: { ...headers, Prefer: "return=representation" } });
  if (!r.ok) { console.error("DELETE faalde:", r.status, await r.text()); process.exit(1); }
  return r.json();
}

async function ins(roleId, slugs) {
  if (!slugs.length) return;
  const rows = slugs.map((s) => ({ role_id: roleId, permission_slug: s, is_hierarchical: true }));
  const r = await fetch(REST, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) { console.error("INSERT faalde:", r.status, await r.text()); process.exit(1); }
}

async function snapshot(label) {
  for (const p of PLAN) {
    const all = [...new Set([...p.add, ...p.remove])];
    const cur = await listFor(p.role_id, all);
    const has = (s) => cur.some((x) => x.permission_slug === s);
    console.log(`  ${label} ${p.name.padEnd(16)} ` + all.map((s) => `${s}=${has(s) ? "JA" : "nee"}`).join("  "));
  }
}

async function main() {
  console.log(`Rol-beheer-permissies — modus ${mode}\nVÓÓR:`);
  await snapshot("");
  if (mode === "--check") return;

  for (const p of PLAN) {
    if (mode === "--rollback") {
      // Terug: removed weer toevoegen, added weer verwijderen.
      await ins(p.role_id, p.remove);
      await del(p.role_id, p.add);
    } else {
      await del(p.role_id, p.remove);
      await ins(p.role_id, p.add);
    }
  }

  console.log(mode === "--rollback" ? "\nRollback toegepast.\nNÁ:" : "\nApply toegepast.\nNÁ:");
  await snapshot("");
}

main().catch((e) => { console.error(e); process.exit(1); });
