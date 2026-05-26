#!/usr/bin/env node
/**
 * TESTFASE-modus: zet alle testfase-accounts op één gedeeld wachtwoord
 * 'Embrace2026!' zonder verplichte wachtwoord-wijziging en zonder 2FA.
 *
 * Doel: één collega kan in elk account inloggen om te testen — direct home,
 * geen first-login modal, geen authenticator-app. Iedereen gebruikt
 * `Embrace2026!`.
 *
 * Voor productie-launch: gebruik `reset-all-to-welkom123.mjs` om iedereen
 * weer naar Welkom123 + must_change_password=true te zetten.
 *
 * VEREIST: SUPABASE_SERVICE_ROLE_KEY env-var.
 *
 * GEBRUIK:
 *   node --env-file=scripts/.env scripts/reset-to-embrace2026.mjs --dry-run
 *   node --env-file=scripts/.env scripts/reset-to-embrace2026.mjs
 */

import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://boscwvojcggkbdxhlfys.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const TEST_PASSWORD = "Embrace2026!";

if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY env-var ontbreekt.");
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

async function unenrollAllMfaFactors(userId) {
  // Lijst factoren van deze user en verwijder elke factor zodat hij geen MFA-prompt krijgt
  const list = await fetch(SUPABASE_URL + `/auth/v1/admin/users/${userId}/factors`, { headers: HEADERS });
  if (!list.ok) return 0;
  const data = await list.json().catch(() => ({}));
  const factors = (data && (data.factors || data)) || [];
  let removed = 0;
  for (const f of factors) {
    if (!f || !f.id) continue;
    const del = await fetch(SUPABASE_URL + `/auth/v1/admin/users/${userId}/factors/${f.id}`, { method: "DELETE", headers: HEADERS });
    if (del.ok) removed++;
  }
  return removed;
}

async function main() {
  console.log("🧪 TESTFASE-reset script → Embrace2026!");
  console.log("URL:", SUPABASE_URL);
  console.log("Mode:", DRY_RUN ? "DRY-RUN (geen wijzigingen)" : "LIVE");
  console.log("");

  // Doelgroep: union van main_employees + bs2_role_users (zelfde scope als productie-reset)
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

  const usersResp = await adminListUsers(1, 1000);
  const users = (usersResp && usersResp.users) || [];
  console.log(`✓ ${users.length} auth.users totaal`);

  const toReset = users.filter((u) => validEmails.has((u.email || "").toLowerCase()));
  console.log(`✓ ${toReset.length} accounts worden gereset naar TEST-modus`);
  console.log("");

  if (toReset.length === 0) {
    console.log("⚠️  Geen overlap. Stop.");
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
      // A: wachtwoord op Embrace2026!
      await adminUpdateUser(u.id, { password: TEST_PASSWORD });
      // B: profile-flags: GEEN modal, GEEN 2FA
      await restPatch(`profiles?id=eq.${u.id}`, {
        must_change_password: false,
        must_setup_2fa: false,
      });
      // C: bestaande MFA-factoren verwijderen (mocht iemand er al een gezet hebben)
      const mfaRemoved = await unenrollAllMfaFactors(u.id);

      console.log(`reset ✓${mfaRemoved ? " (mfa-" + mfaRemoved + ")" : ""}`);
      results.reset++;
      results.details.push({ email: u.email, id: u.id, status: "reset", mfaRemoved });
    } catch (e) {
      console.log("ERROR:", e.message);
      results.errored++;
      results.details.push({ email: u.email, id: u.id, status: "error", err: e.message });
    }
  }

  console.log("");
  console.log("=== EINDREPORT — TESTFASE-modus ===");
  console.log(`Reset:   ${results.reset}`);
  console.log(`Errored: ${results.errored}`);
  console.log(`Wachtwoord voor alle accounts: ${TEST_PASSWORD}`);
  console.log("");

  try {
    const dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (!fs.existsSync("scripts/bs2-exports")) fs.mkdirSync("scripts/bs2-exports", { recursive: true });
    const csvPath = `scripts/bs2-exports/testfase-reset-${dt}.csv`;
    const header = "email,id,status,mfaRemoved,err\n";
    const rows = results.details
      .map((d) =>
        [d.email, d.id, d.status, d.mfaRemoved || 0, d.err || ""]
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
