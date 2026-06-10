#!/usr/bin/env node
// Tijdelijk QA-script fase 1 Cliëntmodule 2.0 — RPC-rolmatrix server-side testen.
// Gebruik: node scripts/_qa_clientreis_fase1_test.mjs <aanmelding_id>
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
  "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";
const PASSWORD = "FutureFlow!QA-2026-x7K9";
const AANMELDING_ID = process.argv[2];
if (!AANMELDING_ID) { console.error("geef aanmelding_id mee"); process.exit(1); }

async function login(slug) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `qa-${slug}@embracethefuture.nl`, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${slug} faalde: ${r.status}`);
  return (await r.json()).access_token;
}

async function rpc(token, fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

let fails = 0;
function check(naam, cond, extra) {
  if (cond) console.log(`  PASS  ${naam}`);
  else { console.log(`  FAIL  ${naam} ${extra ? JSON.stringify(extra).slice(0, 300) : ""}`); fails++; }
}

// 1. Gedragswetenschapper: context + lijst + in_behandeling
{
  const t = await login("gedragswetenschapper");
  console.log("— qa-gedragswetenschapper —");
  const ctx = await rpc(t, "clientreis_context");
  check("context kan_beoordelen=true", ctx.status === 200 && ctx.body && ctx.body.kan_beoordelen === true, ctx);
  const lijst = await rpc(t, "aanmeldingen_lijst", { p_status: null });
  check("lijst bevat QA-aanmelding", lijst.status === 200 && Array.isArray(lijst.body) && lijst.body.some((a) => a.id === AANMELDING_ID), { status: lijst.status, n: Array.isArray(lijst.body) ? lijst.body.length : lijst.body });
  const det = await rpc(t, "aanmelding_detail", { p_id: AANMELDING_ID });
  check("detail geeft bsn + geen ip_hash", det.status === 200 && det.body.bsn === "999999990" && !("ip_hash" in det.body), det.status);
  const b1 = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "in_behandeling", p_toelichting: null });
  check("in_behandeling ok", b1.status === 200 && b1.body && b1.body.ok === true && b1.body.reis_status === "in_beoordeling", b1);
}

// 2. Zorgcoördinator: meer_info
{
  const t = await login("zorgcoordinator");
  console.log("— qa-zorgcoordinator —");
  const ctx = await rpc(t, "clientreis_context");
  check("context kan_beoordelen=true", ctx.status === 200 && ctx.body.kan_beoordelen === true, ctx);
  const b = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "meer_info", p_toelichting: "QA: graag recente diagnostiek aanleveren." });
  check("meer_info ok", b.status === 200 && b.body.ok === true && b.body.reis_status === "meer_info_nodig", b);
}

// 3. Medewerker: alles geweigerd
{
  const t = await login("medewerker");
  console.log("— qa-medewerker —");
  const ctx = await rpc(t, "clientreis_context");
  check("context kan_beoordelen=false", ctx.status === 200 && ctx.body.kan_beoordelen === false, ctx);
  const lijst = await rpc(t, "aanmeldingen_lijst", {});
  check("lijst geweigerd", lijst.status >= 400, lijst.status);
  const b = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "goedkeuren" });
  check("beoordelen geweigerd", b.status >= 400, b.status);
  const rest = await fetch(`${SUPABASE_URL}/rest/v1/client_aanmeldingen?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
  const rows = await rest.json();
  check("REST select aanmeldingen leeg (RLS)", Array.isArray(rows) && rows.length === 0, rows.length);
}

// 4. Finance: geweigerd
{
  const t = await login("finance");
  console.log("— qa-finance —");
  const lijst = await rpc(t, "aanmeldingen_lijst", {});
  check("lijst geweigerd", lijst.status >= 400, lijst.status);
}

// 5. Directeur: wachtlijst → goedkeuren (eindstatus) + dubbele beslissing geweigerd
{
  const t = await login("directeur");
  console.log("— qa-directeur —");
  const b0 = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "wachtlijst", p_toelichting: "QA: geen plek per direct." });
  check("wachtlijst ok", b0.status === 200 && b0.body.ok === true && b0.body.reis_status === "wachtlijst", b0);
  const b1 = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "goedkeuren", p_toelichting: "QA: akkoord." });
  check("goedkeuren ok → intake_gepland", b1.status === 200 && b1.body.ok === true && b1.body.reis_status === "intake_gepland", b1);
  const b2 = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "afwijzen" });
  check("dubbele beslissing geweigerd", b2.status >= 400, b2.status);
  const fout = await rpc(t, "aanmelding_beoordeel", { p_id: AANMELDING_ID, p_actie: "bestaat_niet" });
  check("onbekende actie geweigerd", fout.status >= 400, fout.status);
}

// 6. Tijdlijn leesbaar voor GW (RLS via clienten-zichtbaarheid)
{
  const t = await login("gedragswetenschapper");
  console.log("— tijdlijn (GW) —");
  const det = await rpc(t, "aanmelding_detail", { p_id: AANMELDING_ID });
  const clientId = det.body.client_id;
  const rest = await fetch(`${SUPABASE_URL}/rest/v1/client_tijdlijn?client_id=eq.${encodeURIComponent(clientId)}&select=event_type,titel&order=created_at.asc`, { headers: { apikey: ANON, Authorization: `Bearer ${t}` } });
  const rows = await rest.json();
  check("tijdlijn >= 6 events", Array.isArray(rows) && rows.length >= 6, rows.length);
  console.log("  events:", rows.map((r) => r.titel).join(" | "));
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/client_tijdlijn`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId, titel: "hack", event_type: "x" }) });
  check("tijdlijn direct INSERT geweigerd", ins.status >= 400, ins.status);
}

console.log(fails === 0 ? "\nALLE TESTS GESLAAGD" : `\n${fails} TEST(S) GEFAALD`);
process.exit(fails === 0 ? 0 : 1);
