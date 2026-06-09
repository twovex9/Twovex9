#!/usr/bin/env node
// Welke rollen hebben elk van deze slugs? (impact-analyse voor read-only gating)
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
const get = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); };

const roles = await get("bs2_roles?select=id,name");
const roleName = Object.fromEntries(roles.map((r) => [r.id, r.name]));

const SLUGS = [
  "view-employee-hour-registrations", "manage-employee-registered-hours",
  "view-planning", "manage-shifts", "create-shifts", "assign-employees-to-shift",
  "browse-mileage-declarations", "view-mileage-declarations", "view-all-mileage-declarations", "manage-mileage-declarations",
  "view-monthly-hour-declarations", "manage-monthly-hour-declarations",
  "edit-settings",
];
const rp = await get(`bs2_role_permissions?select=role_id,permission_slug&permission_slug=in.(${SLUGS.join(",")})&limit=20000`);
const bySlug = {}; SLUGS.forEach((s) => (bySlug[s] = []));
rp.forEach((x) => { if (bySlug[x.permission_slug]) bySlug[x.permission_slug].push(roleName[x.role_id]); });
for (const s of SLUGS) {
  console.log(`${s.padEnd(38)} → ${(bySlug[s].sort().join(", ")) || "(NIEMAND)"}`);
}
