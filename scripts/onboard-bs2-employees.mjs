#!/usr/bin/env node
/**
 * v3 Fase G.2 — Bulk-onboarding 102 medewerker-profielen
 *
 * Gebruikt built-in fetch (geen npm install nodig).
 *
 * VEREIST:
 *   SUPABASE_SERVICE_ROLE_KEY env-var (uit Supabase Dashboard → API → service_role)
 *
 * GEBRUIK:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...'
 *   node scripts/onboard-bs2-employees.mjs --dry-run
 *   node scripts/onboard-bs2-employees.mjs
 */

import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const DEFAULT_PASSWORD = "Welkom123";

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY env-var ontbreekt.");
  console.error("   Haal de key uit: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api");
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
  console.log("🔐 v3 Fase G.2 Bulk-onboarding script");
  console.log("URL:", SUPABASE_URL);
  console.log("Mode:", DRY_RUN ? "DRY-RUN (no changes)" : "LIVE");
  console.log("");

  // 1. Get default Medewerker org_role
  const roles = await restGet("org_roles?naam=eq.Medewerker&select=id,naam&limit=1");
  if (!roles.length) {
    console.error("❌ 'Medewerker' org_role niet gevonden");
    process.exit(1);
  }
  const defaultRole = roles[0];
  console.log(`✓ Default rol = ${defaultRole.naam} (${defaultRole.id})`);

  // 2. Get actieve medewerkers
  const medewerkers = await restGet("medewerkers?or=(archived.is.null,archived.eq.false)&select=id,voornaam,achternaam,data&limit=500");

  const withEmail = medewerkers.filter((m) => {
    if (m.id && typeof m.id === "string" && m.id.startsWith("ZZZ-CLAUDE-TEST")) return false;
    const email = (m.data && (m.data.email || m.data.emailadres || m.data.e_mail || m.data["e-mail"])) || null;
    return !!email;
  });

  console.log(`✓ ${medewerkers.length} actieve medewerkers, ${withEmail.length} hebben email`);
  console.log("");

  if (withEmail.length === 0) {
    console.log("⚠️  Geen medewerkers met email gevonden. Check medewerkers.data.email kolom.");
    // Print sample voor debug
    if (medewerkers.length > 0) {
      console.log("Sample medewerker.data keys:", Object.keys(medewerkers[0].data || {}).slice(0, 15));
    }
    process.exit(0);
  }

  const results = { created: 0, skipped: 0, errored: 0, details: [] };

  // 3. Per medewerker
  for (const med of withEmail) {
    const email = med.data.email || med.data.emailadres || med.data.e_mail || med.data["e-mail"];
    const naam = `${med.voornaam || ""} ${med.achternaam || ""}`.trim();
    const bs2_rol = (med.data && (med.data.bs2_rol || med.data.rol)) || "Medewerker";

    const pad = (s, n) => String(s || "").substring(0, n).padEnd(n);
    process.stdout.write(`  ${pad(naam, 35)} ${pad(email, 38)} ... `);

    if (DRY_RUN) {
      console.log("DRY-RUN ok");
      results.details.push({ email, naam, status: "dry-run" });
      results.created++;
      continue;
    }

    // Resolve rol_id from bs2_rol naam
    let rolId = defaultRole.id;
    if (bs2_rol && bs2_rol !== "Medewerker") {
      const r = await restGet(`org_roles?naam=eq.${encodeURIComponent(bs2_rol)}&select=id&limit=1`);
      if (r.length) rolId = r[0].id;
    }

    try {
      const created = await adminCreateUser(email, DEFAULT_PASSWORD, { onboarded_via: "bulk-script", naam, bs2_rol });

      // Profile auto-created by trigger; update with extras
      await restPatch(`profiles?id=eq.${created.id}`, {
        voornaam: med.voornaam || "",
        achternaam: med.achternaam || "",
        rol_id: rolId,
        medewerker_id: med.id,
        must_change_password: true,
        must_setup_2fa: true,
      });

      console.log("created");
      results.created++;
      results.details.push({ email, naam, status: "created", rol: bs2_rol });
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists") || e.code === "email_exists") {
        console.log("skipped (already exists)");
        results.skipped++;
        results.details.push({ email, naam, status: "skipped" });
      } else {
        console.log("ERROR:", msg);
        results.errored++;
        results.details.push({ email, naam, status: "error", err: msg });
      }
    }
  }

  // 4. Final report
  console.log("");
  console.log("=== EINDREPORT ===");
  console.log(`Created: ${results.created}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Errored: ${results.errored}`);
  console.log("");

  // Write CSV
  try {
    const dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (!fs.existsSync("scripts/bs2-exports")) fs.mkdirSync("scripts/bs2-exports", { recursive: true });
    const csvPath = `scripts/bs2-exports/onboarding-result-${dt}.csv`;
    const header = "email,naam,status,rol,err\n";
    const rows = results.details
      .map((d) => [d.email, d.naam, d.status, d.rol || "", d.err || ""].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    fs.writeFileSync(csvPath, header + rows);
    console.log(`📋 Result CSV: ${csvPath}`);
  } catch (e) {
    console.log("⚠️ Could not write CSV:", e.message);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
