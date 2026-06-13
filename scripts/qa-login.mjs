#!/usr/bin/env node
/**
 * qa-login.mjs — haal sessie-tokens (access + refresh) op voor een QA-rolaccount via
 * de password-grant, zodat ik die in de browser kan injecteren met
 * window.ffSupabase.auth.setSession(...) (zie memory reference-qa-testaccounts).
 *
 * Gebruik:
 *   node scripts/qa-login.mjs medewerker
 *   node scripts/qa-login.mjs gedragswetenschapper
 *   node scripts/qa-login.mjs beleid
 *
 * Output (JSON): { email, access_token, refresh_token }
 */
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
  "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";
const PASSWORD = "FutureFlow!QA-2026-x7K9";

const slug = (process.argv[2] || "medewerker").trim();
const email = `qa-${slug}@embracethefuture.nl`;

const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: PASSWORD }),
});
if (!r.ok) { console.error("Login faalde", r.status, await r.text()); process.exit(1); }
const j = await r.json();
console.log(JSON.stringify({ email, access_token: j.access_token, refresh_token: j.refresh_token }));
