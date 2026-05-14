#!/usr/bin/env node
/**
 * v3 Fase G.2 — Bulk-onboarding 102 medewerker-profielen
 *
 * Per user-keuze: maakt voor élke actieve medewerker (uit public.medewerkers)
 * met email-adres:
 *   1. auth.user via auth.admin.createUser({email, password: 'Welkom123', email_confirm: true})
 *   2. public.profiles rij (auto-create-trigger) krijgt:
 *      - rol_id = medewerker.data->>'bs2_rol' OR default 'Medewerker' org_role
 *      - medewerker_id FK
 *      - must_change_password = true (forceert G.3 first-login flow)
 *      - must_setup_2fa = true (forceert G.4 enrollment)
 *   3. Output CSV: created / skipped (already exists) / errored
 *
 * VEREIST:
 *   - SUPABASE_SERVICE_ROLE_KEY env-var (uit Supabase Dashboard → API → service_role)
 *   - SUPABASE_URL env-var = https://boscwvojcggkbdxhlfys.supabase.co
 *
 * GEBRUIK:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/onboard-bs2-employees.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/onboard-bs2-employees.mjs --dry-run
 *
 * SAFETY:
 *   - Skipt medewerkers zonder email
 *   - Skipt gearchiveerde medewerkers
 *   - Skipt ZZZ-CLAUDE-TEST records
 *   - Stopt bij eerste auth-error (geen partial-state)
 *
 * @see docs/phase4/v3-fase-g-part2-status.md
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const DEFAULT_PASSWORD = "Welkom123";

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY env-var ontbreekt.");
  console.error("   Haal de key uit: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api");
  console.error("   Run: SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/onboard-bs2-employees.mjs");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("🔐 v3 Fase G.2 Bulk-onboarding script");
  console.log("URL:", SUPABASE_URL);
  console.log("Mode:", DRY_RUN ? "DRY-RUN (no changes)" : "LIVE");
  console.log("");

  // 1. Get default Medewerker org_role
  const { data: defaultRole, error: roleErr } = await supa
    .from("org_roles")
    .select("id, naam")
    .eq("naam", "Medewerker")
    .single();
  if (roleErr || !defaultRole) {
    console.error("❌ 'Medewerker' org_role niet gevonden:", roleErr);
    process.exit(1);
  }
  console.log(`✓ Default rol = ${defaultRole.naam} (${defaultRole.id})`);

  // 2. Get medewerkers met email
  const { data: medewerkers, error: medErr } = await supa
    .from("medewerkers")
    .select("id, voornaam, achternaam, data")
    .or("archived.is.null,archived.eq.false");
  if (medErr) {
    console.error("❌ medewerkers fetch failed:", medErr);
    process.exit(1);
  }

  const withEmail = medewerkers.filter((m) => {
    if (m.id && m.id.startsWith && m.id.startsWith("ZZZ-CLAUDE-TEST")) return false;
    const email = (m.data && (m.data.email || m.data.emailadres)) || null;
    return !!email;
  });

  console.log(`✓ ${medewerkers.length} actieve medewerkers, ${withEmail.length} hebben email`);
  console.log("");

  const results = { created: 0, skipped: 0, errored: 0, details: [] };

  // 3. Per medewerker: createUser + link profile
  for (const med of withEmail) {
    const email = med.data.email || med.data.emailadres;
    const naam = `${med.voornaam || ""} ${med.achternaam || ""}`.trim();
    const bs2_rol = (med.data && (med.data.bs2_rol || med.data.rol)) || "Medewerker";

    process.stdout.write(`  ${naam.padEnd(40)} ${email.padEnd(40)} ... `);

    if (DRY_RUN) {
      console.log("DRY-RUN ok");
      results.details.push({ email, naam, status: "dry-run" });
      continue;
    }

    // Resolve rol_id from bs2_rol naam
    let rolId = defaultRole.id;
    if (bs2_rol && bs2_rol !== "Medewerker") {
      const { data: r } = await supa.from("org_roles").select("id").eq("naam", bs2_rol).maybeSingle();
      if (r) rolId = r.id;
    }

    try {
      const { data: created, error: cErr } = await supa.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { onboarded_via: "bulk-script", naam, bs2_rol },
      });

      if (cErr) {
        if ((cErr.message || "").includes("already") || cErr.code === "email_exists") {
          console.log("skipped (already exists)");
          results.skipped++;
          results.details.push({ email, naam, status: "skipped" });
          continue;
        }
        throw cErr;
      }

      // Profile auto-created by trigger; update with extras
      await supa
        .from("profiles")
        .update({
          voornaam: med.voornaam || "",
          achternaam: med.achternaam || "",
          rol_id: rolId,
          medewerker_id: med.id,
          must_change_password: true,
          must_setup_2fa: true,
        })
        .eq("id", created.user.id);

      console.log("created");
      results.created++;
      results.details.push({ email, naam, status: "created", rol: bs2_rol });
    } catch (e) {
      console.log("ERROR:", e.message);
      results.errored++;
      results.details.push({ email, naam, status: "error", err: e.message });
    }
  }

  // 4. Final report
  console.log("");
  console.log("=== EINDREPORT ===");
  console.log(`Created: ${results.created}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Errored: ${results.errored}`);
  console.log("");
  console.log("Per user actie:");
  console.log("  - Stuur email naar 102 medewerkers met URL + login + 'Welkom123'");
  console.log("  - Eerste login → forceert wachtwoord-wijziging (G.3) + 2FA enroll (G.4)");
  console.log("");

  // Write CSV
  const fs = await import("fs");
  const dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const csvPath = `scripts/bs2-exports/onboarding-result-${dt}.csv`;
  const header = "email,naam,status,rol,err\n";
  const rows = results.details
    .map((d) => [d.email, d.naam, d.status, d.rol || "", d.err || ""].map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  try {
    fs.writeFileSync(csvPath, header + rows);
    console.log(`📋 Result CSV: ${csvPath}`);
  } catch (e) {
    console.log("⚠️ Could not write CSV:", e.message);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
