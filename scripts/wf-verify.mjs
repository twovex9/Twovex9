#!/usr/bin/env node
/**
 * wf-verify.mjs — verifieer de workforce_*-RPC's met echte QA-JWT's (rol-gating).
 * Gebruik: node scripts/wf-verify.mjs
 */
const URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
  "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";
const PW = "FutureFlow!QA-2026-x7K9";

async function login(slug) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `qa-${slug}@embracethefuture.nl`, password: PW }),
  });
  if (!r.ok) throw new Error(`login ${slug}: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
async function rpc(jwt, fn, body) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { ok: r.ok, status: r.status, data: d };
}

const PERIOD = { p_start: "2026-06-01", p_end: "2026-06-30" };

for (const slug of ["planner", "directeur", "medewerker"]) {
  const jwt = await login(slug);
  console.log(`\n========== qa-${slug} ==========`);
  const ctx = await rpc(jwt, "workforce_mijn_context", {});
  console.log("context:", JSON.stringify(ctx.data));
  const cap = await rpc(jwt, "workforce_capaciteit", PERIOD);
  console.log("capaciteit rows:", Array.isArray(cap.data) ? cap.data.length : cap.data, Array.isArray(cap.data) && cap.data[0] ? "| eerste: " + JSON.stringify(cap.data[0]) : "");
  const aanb = await rpc(jwt, "workforce_aanbevelingen", PERIOD);
  console.log("aanbevelingen rows:", Array.isArray(aanb.data) ? aanb.data.length : aanb.data);
  if (Array.isArray(aanb.data)) aanb.data.forEach(a => console.log("   -", a.prioriteit, "|", a.type, "|", a.titel, "| €" + a.impact_eur, "| status=" + a.status));
  const kpi = await rpc(jwt, "workforce_kpis", PERIOD);
  console.log("kpis:", JSON.stringify(kpi.data));
  const sk = await rpc(jwt, "workforce_skills_dekking", {});
  console.log("skills rows:", Array.isArray(sk.data) ? sk.data.length : sk.data, Array.isArray(sk.data) && sk.data[0] ? "| eerste: " + JSON.stringify(sk.data[0]) : "");
  const fc = await rpc(jwt, "workforce_forecast", { p_weken: 6 });
  console.log("forecast rows:", Array.isArray(fc.data) ? fc.data.length : fc.data, Array.isArray(fc.data) && fc.data[0] ? "| eerste: " + JSON.stringify(fc.data[0]) : "");
}
