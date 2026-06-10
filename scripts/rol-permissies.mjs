#!/usr/bin/env node
/**
 * rol-permissies.mjs — generiek per-rol slug-plan-gereedschap (G55).
 *
 * Dumpt, vergelijkt en past permissie-slugs per bs2-rol toe op PRODUCTIE
 * (ukjflilnhigozfoxowmj, service-key uit scripts/.env — NIET de Supabase-MCP).
 * Vervangt losse one-off scripts (medewerker-/beleid-rol-permissies.mjs blijven
 * als historie staan); nieuwe rol-aanscherpingen gaan via een JSON-plan zodat
 * elke wijziging reproduceerbaar en omkeerbaar is.
 *
 * Gebruik:
 *   node scripts/rol-permissies.mjs --list
 *       Alle rollen met naam, slug en aantal permissie-slugs.
 *   node scripts/rol-permissies.mjs --dump <rolslug> [> plan.json]
 *       Het volledige slug-plan van een rol als JSON ({ role, slugs: [...] }).
 *   node scripts/rol-permissies.mjs --diff <rolslug> --file plan.json
 *       Verschil tussen live en plan (toe te voegen / te verwijderen).
 *   node scripts/rol-permissies.mjs --apply <rolslug> --file plan.json --yes
 *       Maakt live gelijk aan het plan (insert ontbrekende, delete overtollige).
 *       Zonder --yes: dry-run (toont wat er zou gebeuren).
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
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, opts) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers, ...opts });
  if (!r.ok) { throw new Error(`${path}: ${r.status} ${await r.text()}`); }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function roleBySlug(slug) {
  const rows = await rest(`bs2_roles?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug`);
  if (!rows.length) { console.error(`Rol '${slug}' niet gevonden. Gebruik --list.`); process.exit(1); }
  return rows[0];
}

async function slugsForRole(roleId) {
  const rows = await rest(`bs2_role_permissions?role_id=eq.${roleId}&select=permission_slug&limit=2000`);
  return rows.map((r) => r.permission_slug).sort();
}

const args = process.argv.slice(2);
const fileArgIdx = args.indexOf("--file");
const planFile = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;
const yes = args.includes("--yes");

if (args[0] === "--list" || args.length === 0) {
  const roles = await rest("bs2_roles?select=id,name,slug&order=name");
  for (const r of roles) {
    const n = (await slugsForRole(r.id)).length;
    console.log(`${r.slug.padEnd(24)} ${String(n).padStart(4)} slugs   (${r.name})`);
  }
} else if (args[0] === "--dump") {
  const role = await roleBySlug(args[1]);
  const slugs = await slugsForRole(role.id);
  console.log(JSON.stringify({ role: role.slug, name: role.name, slugs }, null, 2));
} else if (args[0] === "--diff" || args[0] === "--apply") {
  if (!planFile) { console.error("Geef het plan op met --file plan.json"); process.exit(1); }
  const role = await roleBySlug(args[1]);
  const plan = JSON.parse(readFileSync(resolve(process.cwd(), planFile), "utf8"));
  const wanted = new Set(plan.slugs || []);
  const live = new Set(await slugsForRole(role.id));
  const toAdd = [...wanted].filter((s) => !live.has(s)).sort();
  const toRemove = [...live].filter((s) => !wanted.has(s)).sort();
  console.log(`Rol: ${role.slug} (${role.name}) — live ${live.size}, plan ${wanted.size}`);
  console.log(`+ toe te voegen (${toAdd.length}):`, toAdd.join(", ") || "(geen)");
  console.log(`- te verwijderen (${toRemove.length}):`, toRemove.join(", ") || "(geen)");
  if (args[0] === "--apply") {
    if (!yes) { console.log("\nDry-run. Voeg --yes toe om toe te passen."); process.exit(0); }
    if (toAdd.length) {
      await rest("bs2_role_permissions", {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(toAdd.map((s) => ({ role_id: role.id, permission_slug: s, is_hierarchical: true }))),
      });
      console.log(`✓ ${toAdd.length} slug(s) toegevoegd.`);
    }
    if (toRemove.length) {
      await rest(`bs2_role_permissions?role_id=eq.${role.id}&permission_slug=in.(${toRemove.map(encodeURIComponent).join(",")})`, { method: "DELETE" });
      console.log(`✓ ${toRemove.length} slug(s) verwijderd.`);
    }
    console.log("Klaar. Verifieer met --dump en test met het bijbehorende qa-account.");
  }
} else {
  console.error("Onbekend commando. Zie de header van dit script voor gebruik.");
  process.exit(1);
}
