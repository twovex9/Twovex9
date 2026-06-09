#!/usr/bin/env node
// Dump rollen, permissie-catalogus en huidige rol→permissie-mappings voor HR/Facilitair/Beleid/Medewerker.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((l) => {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) env[m[1]] = m[2];
});
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(p + " " + r.status + " " + await r.text()); return r.json(); };

const roles = await get("bs2_roles?select=*&order=name");
console.log("=== ROLLEN (" + roles.length + ") ===  kolommen: " + Object.keys(roles[0] || {}).join(","));
roles.forEach((r) => console.log(`  ${String(r.name).padEnd(22)} ${r.id}`));
const roleName = Object.fromEntries(roles.map((r) => [r.id, r.name]));

// alle permissie-slugs in de catalogus
let catalog = [];
try { catalog = await get("bs2_permissions?select=slug,label,category&order=category,slug&limit=2000"); } catch (e) { console.log("(bs2_permissions niet beschikbaar: " + e.message + ")"); }
if (catalog.length) {
  console.log(`\n=== PERMISSIE-CATALOGUS (${catalog.length}) ===`);
  let cat = null;
  catalog.forEach((p) => { if (p.category !== cat) { cat = p.category; console.log(`  [${cat}]`); } console.log(`     ${p.slug.padEnd(38)} ${p.label || ""}`); });
}

// rol→permissies voor de 4 doelrollen
const targets = ["Medewerker", "Facilitair", "HR", "Beleid"];
const rp = await get("bs2_role_permissions?select=role_id,permission_slug,is_hierarchical&limit=20000");
const byRole = {}; rp.forEach((x) => { (byRole[x.role_id] ||= []).push(x); });
for (const t of targets) {
  const rid = roles.find((r) => r.name === t)?.id;
  const list = (byRole[rid] || []).map((x) => x.permission_slug).sort();
  console.log(`\n=== ${t} (${list.length} permissies) ===`);
  console.log("  " + list.join(", "));
}

// users per doelrol (incl. multi-rol detectie)
const ru = await get("bs2_role_users?select=role_id,user_email,status&limit=20000");
const rolesByEmail = {}; ru.forEach((x) => { (rolesByEmail[x.user_email] ||= []).push(roleName[x.role_id] || x.role_id); });
for (const t of targets) {
  const rid = roles.find((r) => r.name === t)?.id;
  const emails = [...new Set(ru.filter((x) => x.role_id === rid).map((x) => x.user_email))];
  console.log(`\n=== ${t}: ${emails.length} users ===`);
  emails.forEach((e) => { const all = [...new Set(rolesByEmail[e])]; console.log(`  ${e}  [${all.join("+")}]${all.length === 1 ? "  PUUR" : ""}`); });
}
