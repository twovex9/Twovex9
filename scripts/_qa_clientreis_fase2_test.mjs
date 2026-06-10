#!/usr/bin/env node
// Tijdelijk QA-script fase 2 Cliëntmodule 2.0 — intake/ondertekening/wachtlijst/status-RPC's.
// Gebruik: node scripts/_qa_clientreis_fase2_test.mjs <client_id_met_lopende_intake>
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
  "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";
const PASSWORD = "FutureFlow!QA-2026-x7K9";
const CLIENT_ID = process.argv[2];
if (!CLIENT_ID) { console.error("geef client_id mee"); process.exit(1); }

async function login(slug) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `qa-${slug}@embracethefuture.nl`, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${slug} faalde: ${r.status}`);
  return (await r.json()).access_token;
}
async function rpc(token, fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
async function rest(token, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
}
let fails = 0;
function check(naam, cond, extra) {
  if (cond) console.log(`  PASS  ${naam}`);
  else { console.log(`  FAIL  ${naam} ${extra ? JSON.stringify(extra).slice(0, 250) : ""}`); fails++; }
}

const gw = await login("gedragswetenschapper");
const mw = await login("medewerker");
const zc = await login("zorgcoordinator");

console.log("— intake (GW) —");
const intakes = await rest(gw, `client_intakes?client_id=eq.${encodeURIComponent(CLIENT_ID)}&status=eq.lopend&select=id`);
check("lopende intake via REST leesbaar", intakes.status === 200 && intakes.body.length === 1, intakes);
const intakeId = intakes.body[0].id;
const onderdelen = await rest(gw, `client_intake_onderdelen?intake_id=eq.${intakeId}&select=id,onderdeel,afgerond&order=volgorde`);
check("7 onderdelen leesbaar", onderdelen.status === 200 && onderdelen.body.length === 7, onderdelen.body.length);

// alle 7 onderdelen invullen + afronden
let alleOk = true;
for (const o of onderdelen.body) {
  const r = await rpc(gw, "intake_onderdeel_opslaan", { p_id: o.id, p_inhoud: `QA fase2: ${o.onderdeel} ingevuld.`, p_afgerond: true });
  if (!(r.status === 200 && r.body.ok === true)) { alleOk = false; console.log("   onderdeel-fout", o.onderdeel, r.status); }
}
check("alle 7 onderdelen opgeslagen+afgerond", alleOk);

console.log("— intake afronden te vroeg geweigerd? (eerst 1 heropenen) —");
const eerste = onderdelen.body[0];
await rpc(gw, "intake_onderdeel_opslaan", { p_id: eerste.id, p_inhoud: "QA: heropend", p_afgerond: false });
const teVroeg = await rpc(gw, "intake_afronden", { p_intake_id: intakeId });
check("afronden met open onderdeel geweigerd", teVroeg.status >= 400, teVroeg.status);
await rpc(gw, "intake_onderdeel_opslaan", { p_id: eerste.id, p_inhoud: "QA: weer afgerond", p_afgerond: true });

console.log("— medewerker geweigerd op intake-mutaties —");
const mwMut = await rpc(mw, "intake_onderdeel_opslaan", { p_id: eerste.id, p_inhoud: "hack", p_afgerond: true });
check("medewerker intake-mutatie geweigerd", mwMut.status >= 400, mwMut.status);
const mwWl = await rpc(mw, "wachtlijst_overzicht", {});
check("medewerker wachtlijst geweigerd", mwWl.status >= 400, mwWl.status);

console.log("— ondertekening (zorgcoördinator) —");
const verzoek = await rpc(zc, "ondertekening_maak_verzoek", {
  p_client_id: CLIENT_ID, p_verklaring_type: "privacy", p_ondertekenaar_type: "ouder",
  p_ondertekenaar_naam: "QA Ouder Fase2", p_intake_id: intakeId,
});
check("verzoek aangemaakt (token)", verzoek.status === 200 && verzoek.body.ok === true && verzoek.body.token, verzoek);
const mwVerzoek = await rpc(mw, "ondertekening_maak_verzoek", { p_client_id: CLIENT_ID, p_verklaring_type: "privacy", p_ondertekenaar_type: "ouder", p_ondertekenaar_naam: "X" });
check("medewerker verzoek geweigerd", mwVerzoek.status >= 400, mwVerzoek.status);
const fouteVerkl = await rpc(zc, "ondertekening_maak_verzoek", { p_client_id: CLIENT_ID, p_verklaring_type: "bestaat_niet", p_ondertekenaar_type: "ouder", p_ondertekenaar_naam: "X" });
check("onbekende verklaring geweigerd", fouteVerkl.status >= 400, fouteVerkl.status);
// service-role-only functies niet aanroepbaar als user
const infoAlsUser = await rpc(gw, "ondertekening_info", { p_token: verzoek.body.token });
check("ondertekening_info als user geweigerd", infoAlsUser.status >= 400, infoAlsUser.status);

console.log("— edge function client-ondertekening (publiek) —");
const infoR = await fetch(`${SUPABASE_URL}/functions/v1/client-ondertekening?token=${verzoek.body.token}`);
const infoB = await infoR.json();
check("GET info ok + titel", infoR.status === 200 && infoB.ok === true && /privacy/i.test(infoB.titel || ""), infoB);
// 1x1 zwarte PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const signR = await fetch(`${SUPABASE_URL}/functions/v1/client-ondertekening`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: verzoek.body.token, handtekening_png_base64: PNG }),
});
const signB = await signR.json();
check("POST ondertekenen ok", signR.status === 200 && signB.ok === true, { status: signR.status, body: signB });
const infoNa = await fetch(`${SUPABASE_URL}/functions/v1/client-ondertekening?token=${verzoek.body.token}`);
const infoNaB = await infoNa.json();
check("token na ondertekenen niet meer open", infoNaB.ok === false, infoNaB);
const rec = await rest(gw, `client_ondertekeningen?id=eq.${verzoek.body.id}&select=status,storage_path_pdf,storage_path_png`);
check("record ondertekend + pdf-pad", rec.body[0] && rec.body[0].status === "ondertekend" && !!rec.body[0].storage_path_pdf, rec.body[0]);

console.log("— wachtlijst (zorgcoördinator) —");
const wl = await rpc(zc, "wachtlijst_overzicht", {});
check("wachtlijst kpis+rijen", wl.status === 200 && wl.body.kpis && Array.isArray(wl.body.rijen) && wl.body.kpis.aantal >= 1, wl.body && wl.body.kpis);

console.log("— statusovergangen (zorgcoördinator) —");
const fout1 = await rpc(zc, "clientreis_zet_status", { p_client_id: CLIENT_ID, p_status: "actief" });
check("intake_gepland→actief geweigerd (allowlist)", fout1.status >= 400, fout1.status);
const afr = await rpc(gw, "intake_afronden", { p_intake_id: intakeId });
check("intake afronden ok", afr.status === 200 && afr.body.ok === true, afr);
const naAfr = await rest(gw, `clienten?id=eq.${encodeURIComponent(CLIENT_ID)}&select=reis_status`);
check("reis_status=intake_afgerond", naAfr.body[0] && naAfr.body[0].reis_status === "intake_afgerond", naAfr.body[0]);
const pl1 = await rpc(zc, "clientreis_zet_status", { p_client_id: CLIENT_ID, p_status: "plaatsing_gepland", p_toelichting: "QA: plek beschikbaar per 1 juli." });
check("→plaatsing_gepland ok", pl1.status === 200 && pl1.body.ok === true, pl1);
const pl2 = await rpc(zc, "clientreis_zet_status", { p_client_id: CLIENT_ID, p_status: "actief" });
check("→actief ok", pl2.status === 200 && pl2.body.ok === true, pl2);
const naActief = await rest(gw, `clienten?id=eq.${encodeURIComponent(CLIENT_ID)}&select=reis_status,fase,data`);
check("fase=in zorg + inZorgDatum gezet", naActief.body[0] && naActief.body[0].fase === "in zorg" && !!naActief.body[0].data.inZorgDatum, naActief.body[0] && naActief.body[0].fase);
const mwStatus = await rpc(mw, "clientreis_zet_status", { p_client_id: CLIENT_ID, p_status: "tijdelijk_gepauzeerd" });
check("medewerker statuswijziging geweigerd", mwStatus.status >= 400, mwStatus.status);

console.log("— beschikking-verloop dry-run (90d-mijlpaal) —");
// via REST niet mogelijk (definer-cron); alleen aanwezigheid checken is db-exec-werk — hier skippen.

console.log(fails === 0 ? "\nALLE TESTS GESLAAGD" : `\n${fails} TEST(S) GEFAALD`);
process.exit(fails === 0 ? 0 : 1);
