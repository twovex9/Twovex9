#!/usr/bin/env node
/**
 * qa-client-access-check.mjs — meet hoeveel cliënten elke QA-rol via RLS kan SELECTEN
 * (met hun eigen user-JWT). Gebruik vóór én na een clienten-RLS-wijziging om regressie
 * te detecteren: office-rollen moeten ALLE cliënten blijven zien, de pure Medewerker
 * moet locatie-gescoped (of 0) zijn.
 *
 * Gebruik: node scripts/qa-client-access-check.mjs
 */
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
  "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";
const PASSWORD = "FutureFlow!QA-2026-x7K9";

const ROLES = ["eigenaar", "hr", "planner", "gedragswetenschapper", "beleid",
  "zorgcoordinator", "clientbeheer", "facilitair", "finance", "medewerker"];

async function jwtFor(slug) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `qa-${slug}@embracethefuture.nl`, password: PASSWORD }),
  });
  if (!r.ok) return null;
  return (await r.json()).access_token;
}

async function clientCount(jwt) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/clienten?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = r.headers.get("content-range") || "";
  const total = cr.split("/")[1];
  return { status: r.status, total: total === "*" ? "?" : total };
}

const out = {};
for (const slug of ROLES) {
  const jwt = await jwtFor(slug);
  if (!jwt) { out[slug] = "LOGIN FAALDE"; continue; }
  const c = await clientCount(jwt);
  out[slug] = `${c.total} (http ${c.status})`;
}
console.log(JSON.stringify(out, null, 2));
