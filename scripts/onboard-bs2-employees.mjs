#!/usr/bin/env node
/**
 * Bulk-onboarding voor BS2-medewerkers (v3 Fase G.2 — herzien 2026-05-25).
 *
 * Doel: alle medewerkers uit `main_employees` (100 rijen, leidende waarheid uit BS2)
 * krijgen een auth.users-account + profiles-rij + rol-koppeling.
 *
 * Bronnen:
 *   - `public.main_employees` voor wie er een account hoort te krijgen (op email)
 *   - `public.bs2_role_users` (M2M user_email ↔ role_id) voor wie welke rol(len) krijgt
 *   - `public.bs2_roles` voor admin-tier-detectie (slug = Eigenaar/Admin/Directeur)
 *
 * Schrijft naar profiles:
 *   - rol = 'admin' indien admin-tier-rol, anders 'medewerker'
 *   - must_change_password = true (first-login flow)
 *   - must_setup_2fa = false (UIT voor testfase; vóór productie weer aan)
 *   - rol_id wordt voor backward-compat op de "Medewerker" org_role gezet (legacy)
 *
 * Idempotent: bestaande auth.users worden niet opnieuw aangemaakt.
 *
 * VEREIST: SUPABASE_SERVICE_ROLE_KEY env-var.
 *
 * GEBRUIK:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...'
 *   node scripts/onboard-bs2-employees.mjs --dry-run
 *   node scripts/onboard-bs2-employees.mjs
 */

import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ukjflilnhigozfoxowmj.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const DEFAULT_PASSWORD = "Welkom123";
const ADMIN_TIER_SLUGS = ["Eigenaar", "Admin", "Directeur"];

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY env-var ontbreekt.");
  console.error("   Haal de key uit: https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj/settings/api");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: "Bearer " + SERVICE_KEY,
  "Content-Type": "application/json",
};

async function restGet(path) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: { ...HEADERS, Prefer: "count=exact" } });
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
  return r.ok;
}

async function adminCreateUser(email, password, metadata) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata || {} }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.msg || data.error_description || data.message || `${r.status}`);
    err.code = data.code || data.error_code;
    err.status = r.status;
    throw err;
  }
  return data;
}

async function main() {
  console.log("🔐 v3 Fase G.2 Bulk-onboarding script (herzien 2026-05-25)");
  console.log("URL:", SUPABASE_URL);
  console.log("Mode:", DRY_RUN ? "DRY-RUN (geen wijzigingen)" : "LIVE");
  console.log("");

  // 1. Default org_role (legacy `rol_id` veld in profiles)
  const orgRoles = await restGet("org_roles?naam=eq.Medewerker&select=id,naam&limit=1");
  const defaultOrgRoleId = (orgRoles[0] && orgRoles[0].id) || null;
  if (!defaultOrgRoleId) {
    console.warn("⚠️  org_roles 'Medewerker' niet gevonden; rol_id wordt NULL gelaten.");
  } else {
    console.log(`✓ Default org_role 'Medewerker' = ${defaultOrgRoleId}`);
  }

  // 2. Main_employees ophalen (BS2-leidende waarheid; 100 rijen)
  const employees = await restGet("main_employees?select=id,email,first_name,last_name&order=email.asc&limit=500");
  const withEmail = employees.filter((e) => !!(e.email && String(e.email).includes("@")));
  console.log(`✓ ${employees.length} main_employees, ${withEmail.length} hebben geldig e-mailadres`);

  // 3. BS2-rolkoppeling per email (M2M): bs2_role_users join bs2_roles
  const roleUsers = await restGet(
    "bs2_role_users?select=user_email,bs2_roles!inner(slug,name)&limit=1000"
  );
  // Index op email-lowercase → array van { slug, name }
  const roleByEmail = new Map();
  for (const ru of roleUsers) {
    const key = (ru.user_email || "").toLowerCase();
    if (!key) continue;
    const role = ru.bs2_roles || {};
    const arr = roleByEmail.get(key) || [];
    arr.push({ slug: role.slug, name: role.name });
    roleByEmail.set(key, arr);
  }
  console.log(`✓ ${roleUsers.length} BS2-rol-toekenningen geladen (${roleByEmail.size} unieke emails)`);
  console.log("");

  if (withEmail.length === 0) {
    console.log("⚠️  Geen main_employees met e-mailadres. Stop.");
    process.exit(0);
  }

  const results = { created: 0, skipped: 0, errored: 0, details: [] };

  for (const me of withEmail) {
    const email = String(me.email).trim();
    const emailKey = email.toLowerCase();
    const naam = `${me.first_name || ""} ${me.last_name || ""}`.trim() || email;
    const userRoles = roleByEmail.get(emailKey) || [];
    const userRoleNames = userRoles.map((r) => r.name).filter(Boolean);
    const isAdminTier = userRoles.some((r) => ADMIN_TIER_SLUGS.includes(r.name));
    const rolValue = isAdminTier ? "admin" : "medewerker";

    const pad = (s, n) => String(s || "").substring(0, n).padEnd(n);
    process.stdout.write(`  ${pad(naam, 32)} ${pad(email, 36)} [${pad(rolValue, 10)}] [${userRoleNames.join(",") || "(geen)"}] ... `);

    if (DRY_RUN) {
      console.log("DRY-RUN ok");
      results.details.push({ email, naam, status: "dry-run", rol: rolValue, bs2_rollen: userRoleNames.join(",") });
      results.created++;
      continue;
    }

    try {
      const created = await adminCreateUser(email, DEFAULT_PASSWORD, {
        onboarded_via: "bulk-script-v2",
        naam,
        bs2_rollen: userRoleNames,
      });

      const profilePatch = {
        voornaam: me.first_name || "",
        achternaam: me.last_name || "",
        rol: rolValue,
        medewerker_id: null, // main_employees.id is geen FK-target voor profiles.medewerker_id (dat verwijst naar HR-medewerkers)
        must_change_password: true,
        must_setup_2fa: false,
      };
      if (defaultOrgRoleId) profilePatch.rol_id = defaultOrgRoleId;

      await restPatch(`profiles?id=eq.${created.id}`, profilePatch);

      console.log("created");
      results.created++;
      results.details.push({ email, naam, status: "created", rol: rolValue, bs2_rollen: userRoleNames.join(",") });
    } catch (e) {
      const msg = e.message || String(e);
      const lower = msg.toLowerCase();
      if (lower.includes("already") || lower.includes("exists") || e.code === "email_exists") {
        console.log("skipped (bestaat al)");
        results.skipped++;
        results.details.push({ email, naam, status: "skipped", rol: rolValue, bs2_rollen: userRoleNames.join(",") });
      } else {
        console.log("ERROR:", msg);
        results.errored++;
        results.details.push({ email, naam, status: "error", err: msg, rol: rolValue, bs2_rollen: userRoleNames.join(",") });
      }
    }
  }

  console.log("");
  console.log("=== EINDREPORT ===");
  console.log(`Created: ${results.created}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Errored: ${results.errored}`);
  console.log("");

  // CSV
  try {
    const dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (!fs.existsSync("scripts/bs2-exports")) fs.mkdirSync("scripts/bs2-exports", { recursive: true });
    const csvPath = `scripts/bs2-exports/onboarding-result-${dt}.csv`;
    const header = "email,naam,status,rol,bs2_rollen,err\n";
    const rows = results.details
      .map((d) =>
        [d.email, d.naam, d.status, d.rol || "", d.bs2_rollen || "", d.err || ""]
          .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    fs.writeFileSync(csvPath, header + rows);
    console.log(`📋 Result CSV: ${csvPath}`);
  } catch (e) {
    console.log("⚠️ CSV-write mislukt:", e.message);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
