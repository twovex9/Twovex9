#!/usr/bin/env node
/**
 * Reset alle auth.users die in main_employees zitten naar Welkom123
 * + zet profiles.must_change_password=true en must_setup_2fa=false
 *
 * Doel: uniforme testfase — iedere medewerker doorloopt de first-login flow met Welkom123.
 *
 * VEREIST: SUPABASE_SERVICE_ROLE_KEY env-var.
 *
 * GEBRUIK:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...'
 *   node scripts/reset-all-to-welkom123.mjs --dry-run
 *   node scripts/reset-all-to-welkom123.mjs
 */

import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const NEW_PASSWORD = "Welkom123";

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

async function adminListUsers(page = 1, perPage = 1000) {
  const r = await fetch(SUPABASE_URL + `/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`LIST users ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function adminUpdateUser(id, patch) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/admin/users/" + id, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify(patch),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.msg || data.error_description || data.message || `${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function main() {
  console.log("🔄 Reset-all-to-Welkom123 script");
  console.log("URL:", SUPABASE_URL);
  console.log("Mode:", DRY_RUN ? "DRY-RUN (geen wijzigingen)" : "LIVE");
  console.log("");

  // 1. Doelgroep: alle medewerkers die op de testfase meedoen.
  //    - main_employees (100 reguliere medewerkers uit BS2)
  //    - bs2_role_users (127 rol-toewijzingen incl. admin-tier zoals Lionel/Jason die GEEN main_employee zijn)
  //    Union van beide sets, want anders missen we admin-accounts en kunnen ze niet inloggen
  //    (en blijft must_setup_2fa=true voor hen, wat 2FA-modal triggert).
  const employees = await restGet("main_employees?select=email&order=email.asc&limit=500");
  const roleUsers = await restGet("bs2_role_users?select=user_email&limit=500");
  const validEmails = new Set();
  for (const e of employees) {
    const em = (e.email || "").toLowerCase().trim();
    if (em) validEmails.add(em);
  }
  for (const r of roleUsers) {
    const em = (r.user_email || "").toLowerCase().trim();
    if (em) validEmails.add(em);
  }
  console.log(`✓ ${employees.length} main_employees + ${roleUsers.length} bs2_role_users → ${validEmails.size} unieke testfase-emails`);

  // 2. Haal alle auth.users op
  const usersResp = await adminListUsers(1, 1000);
  const users = (usersResp && usersResp.users) || [];
  console.log(`✓ ${users.length} auth.users totaal`);

  // 3. Filter: alleen users wier email in main_employees zit
  const toReset = users.filter((u) => validEmails.has((u.email || "").toLowerCase()));
  console.log(`✓ ${toReset.length} accounts worden gereset`);
  console.log("");

  if (toReset.length === 0) {
    console.log("⚠️  Geen overlap tussen auth.users en main_employees. Stop.");
    process.exit(0);
  }

  const results = { reset: 0, errored: 0, details: [] };

  for (const u of toReset) {
    const pad = (s, n) => String(s || "").substring(0, n).padEnd(n);
    process.stdout.write(`  ${pad(u.email, 45)} ... `);

    if (DRY_RUN) {
      console.log("DRY-RUN ok");
      results.details.push({ email: u.email, id: u.id, status: "dry-run" });
      results.reset++;
      continue;
    }

    try {
      // A: wachtwoord resetten
      await adminUpdateUser(u.id, { password: NEW_PASSWORD });
      // B: profiles-flags zetten
      await restPatch(`profiles?id=eq.${u.id}`, {
        must_change_password: true,
        must_setup_2fa: false,
      });

      console.log("reset ✓");
      results.reset++;
      results.details.push({ email: u.email, id: u.id, status: "reset" });
    } catch (e) {
      console.log("ERROR:", e.message);
      results.errored++;
      results.details.push({ email: u.email, id: u.id, status: "error", err: e.message });
    }
  }

  console.log("");
  console.log("=== EINDREPORT ===");
  console.log(`Reset:   ${results.reset}`);
  console.log(`Errored: ${results.errored}`);
  console.log("");

  // CSV-output
  try {
    const dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (!fs.existsSync("scripts/bs2-exports")) fs.mkdirSync("scripts/bs2-exports", { recursive: true });
    const csvPath = `scripts/bs2-exports/reset-result-${dt}.csv`;
    const header = "email,id,status,err\n";
    const rows = results.details
      .map((d) => [d.email, d.id, d.status, d.err || ""].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))
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
