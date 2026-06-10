#!/usr/bin/env node
// Tijdelijk QA-script fase 3 Cliëntmodule 2.0 — zorgplannen/signalering/
// rapportage-RLS/contactlog/team-koppeling/AI-samenvatting/klacht-tijdlijn.
// Gebruik: node scripts/_qa_clientreis_fase3_test.mjs <client_id>
// (fixture: Sam, cl_1781104463120_b8a3bf6 — locatie NULL zodat de
//  koppeling-via-client_medewerkers het enige toegangspad voor qa-medewerker is)
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramZsaWxuaGlnb3pmb3hvd21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MzkwMzEsImV4cCI6MjA5NjQxNTAzMX0." +
  "ePh91-gndGEP8ve169Hq1XWXdtr3G9nEBDuZ0iA1z5U";
const PASSWORD = "FutureFlow!QA-2026-x7K9";
const CLIENT_ID = process.argv[2];
const QA_MEDEWERKER_ID = "fa11c0de-0000-4000-a000-000000000001"; // QA Loondienst-Test
if (!CLIENT_ID) { console.error("geef client_id mee"); process.exit(1); }

// 1x1 transparante PNG (geldige magic bytes voor de edge-validatie)
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let fails = 0;
function check(naam, cond, extra) {
  if (cond) { console.log("PASS  " + naam); }
  else { fails += 1; console.log("FAIL  " + naam + (extra ? " — " + JSON.stringify(extra).slice(0, 300) : "")); }
}

async function login(slug) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `qa-${slug}@embracethefuture.nl`, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("login " + slug + " faalde: " + JSON.stringify(j).slice(0, 200));
  return { token: j.access_token, userId: j.user && j.user.id };
}

async function rpc(sess, fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: r.status, data };
}

async function rest(sess, path, opts) {
  const o = opts || {};
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: o.method || "GET",
    headers: Object.assign({
      apikey: ANON, Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json",
      Prefer: o.method && o.method !== "GET" ? "return=representation" : "count=exact",
    }, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: r.status, data };
}

(async () => {
  console.log("== Fase 3 QA — client " + CLIENT_ID + " ==\n");
  const gw = await login("gedragswetenschapper");
  const zc = await login("zorgcoordinator");
  const mw = await login("medewerker");
  const fin = await login("finance");
  const dir = await login("directeur");

  // ── 0. Uitgangssituatie: medewerker niet gekoppeld → geen toegang ─────────
  // (Sam heeft locatie NULL; koppeling is straks het enige toegangspad.)
  await rest(zc, `client_medewerkers?client_id=eq.${CLIENT_ID}&medewerker_id=eq.${QA_MEDEWERKER_ID}`, { method: "DELETE" });
  const mwClient0 = await rest(mw, `clienten?id=eq.${encodeURIComponent(CLIENT_ID)}&select=id`);
  check("0a medewerker (niet gekoppeld) ziet cliënt niet", Array.isArray(mwClient0.data) && mwClient0.data.length === 0, mwClient0);
  const mwAi0 = await rpc(mw, "client_ai_samenvatting", { p_client_id: CLIENT_ID });
  check("0b AI-samenvatting fail-closed voor niet-gekoppelde medewerker", mwAi0.status === 200 && mwAi0.data && mwAi0.data.ok === false, mwAi0);

  // ── 1. Zorgplan-workflow ──────────────────────────────────────────────────
  const zpIns = await rest(zc, "zorgplannen", {
    method: "POST",
    body: {
      client_id: CLIENT_ID, titel: "QA Zorgplan fase 3", hulpvraag: "QA-hulpvraag: structuur en rust",
      doelen: [
        { id: "qa-doel-1", titel: "Dagritme opbouwen", omschrijving: "", status: "open", streefdatum: null },
        { id: "qa-doel-2", titel: "School hervatten", omschrijving: "2 dagen per week", status: "open", streefdatum: null },
      ],
      acties: "Wekelijkse begeleidingsmomenten", risicoanalyse: "QA-risico: laag", evaluatiemoment: "2026-09-01",
    },
  });
  const zpId = Array.isArray(zpIns.data) && zpIns.data[0] && zpIns.data[0].id;
  check("1a zorgcoördinator maakt zorgplan (concept)", zpIns.status === 201 && !!zpId, zpIns);

  const zpInsMw = await rest(mw, "zorgplannen", { method: "POST", body: { client_id: CLIENT_ID, titel: "MW mag dit niet" } });
  check("1b medewerker mag geen zorgplan aanmaken", zpInsMw.status >= 400, zpInsMw);

  const gwAkkZc = await rpc(zc, "zorgplan_gw_akkoord", { p_id: zpId });
  check("1c zorgcoördinator mag GEEN GW-akkoord geven", gwAkkZc.status >= 400, gwAkkZc);

  const gwAkk = await rpc(gw, "zorgplan_gw_akkoord", { p_id: zpId });
  check("1d GW geeft akkoord", gwAkk.status === 200 && gwAkk.data && gwAkk.data.ok === true, gwAkk);

  const terOnd = await rpc(zc, "zorgplan_ter_ondertekening", {
    p_id: zpId, p_ondertekenaar_type: "gezaghebbende", p_ondertekenaar_naam: "QA Gezaghebbende Fase3",
  });
  const ondToken = terOnd.data && terOnd.data.token;
  check("1e ter ondertekening → token", terOnd.status === 200 && !!ondToken, terOnd);

  // ── 2. Tekenflow-hergebruik (edge function) ───────────────────────────────
  const infoR = await fetch(`${SUPABASE_URL}/functions/v1/client-ondertekening?token=${ondToken}`);
  const info = await infoR.json();
  check("2a onderteken-info bevat zorgplan-inhoud (body_override)",
    infoR.status === 200 && info && info.ok === true && String(info.body_html || "").includes("QA-hulpvraag"), info);

  const signR = await fetch(`${SUPABASE_URL}/functions/v1/client-ondertekening`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ondToken, handtekening_png_base64: PNG_1PX }),
  });
  const sign = await signR.json();
  check("2b digitaal ondertekenen lukt", signR.status === 200 && sign && sign.ok === true, sign);

  const zpNa = await rest(zc, `zorgplannen?id=eq.${zpId}&select=status,actief_sinds,ondertekening_id`);
  check("2c zorgplan automatisch ACTIEF na ondertekening",
    Array.isArray(zpNa.data) && zpNa.data[0] && zpNa.data[0].status === "actief" && !!zpNa.data[0].actief_sinds, zpNa);

  const ondRow = await rest(zc, `client_ondertekeningen?zorgplan_id=eq.${zpId}&select=status,storage_path_pdf`);
  check("2d PDF-akte vastgelegd", Array.isArray(ondRow.data) && ondRow.data[0] && ondRow.data[0].status === "ondertekend" && !!ondRow.data[0].storage_path_pdf, ondRow);

  // ── 3. Tweede plan: direct activeren vervangt het eerste ─────────────────
  const zp2Ins = await rest(zc, "zorgplannen", {
    method: "POST",
    body: { client_id: CLIENT_ID, titel: "QA Zorgplan v2", hulpvraag: "QA v2", doelen: [{ id: "qa-doel-3", titel: "Zelfstandig reizen", status: "open" }] },
  });
  const zp2Id = Array.isArray(zp2Ins.data) && zp2Ins.data[0] && zp2Ins.data[0].id;
  const actVoorAkkoord = await rpc(zc, "zorgplan_activeer", { p_id: zp2Id });
  check("3a activeren zonder GW-akkoord geweigerd", actVoorAkkoord.status >= 400, actVoorAkkoord);
  await rpc(gw, "zorgplan_gw_akkoord", { p_id: zp2Id });
  const act2 = await rpc(zc, "zorgplan_activeer", { p_id: zp2Id });
  check("3b activeren na GW-akkoord lukt", act2.status === 200 && act2.data && act2.data.ok === true, act2);
  const zp1Na = await rest(zc, `zorgplannen?id=eq.${zpId}&select=status,vervangen_door`);
  check("3c eerste plan automatisch VERVANGEN", Array.isArray(zp1Na.data) && zp1Na.data[0] && zp1Na.data[0].status === "vervangen" && zp1Na.data[0].vervangen_door === zp2Id, zp1Na);

  const evalR = await rpc(zc, "zorgplan_evalueer", { p_id: zp2Id, p_verslag: "QA-evaluatie: doelen deels behaald." });
  check("3d evalueren van actief plan lukt", evalR.status === 200 && evalR.data && evalR.data.ok === true, evalR);
  // Herstel: maak v3 actief zodat de live-test een actief plan heeft.
  const zp3Ins = await rest(zc, "zorgplannen", {
    method: "POST",
    body: { client_id: CLIENT_ID, titel: "QA Zorgplan actief (live-fixture)", hulpvraag: "Structuur, rust en schoolgang", doelen: [
      { id: "qa-doel-4", titel: "Dagritme vasthouden", status: "open", streefdatum: "2026-08-01" },
      { id: "qa-doel-5", titel: "School 3 dagen per week", status: "behaald" },
    ], evaluatiemoment: "2026-09-15" },
  });
  const zp3Id = Array.isArray(zp3Ins.data) && zp3Ins.data[0] && zp3Ins.data[0].id;
  await rpc(gw, "zorgplan_gw_akkoord", { p_id: zp3Id });
  const act3 = await rpc(zc, "zorgplan_activeer", { p_id: zp3Id });
  check("3e fixture-plan v3 actief", act3.status === 200 && act3.data && act3.data.ok === true, act3);

  // ── 4. Signaleringsplan ───────────────────────────────────────────────────
  const spIns = await rest(zc, "signaleringsplannen", {
    method: "POST",
    body: {
      client_id: CLIENT_ID, triggers: "Drukte, onverwachte wijzigingen", spanningssignalen: "Terugtrekken, stemverheffing",
      escalatiefases: [
        { fase: "groen", signalen: "Ontspannen, maakt contact", interventies: "Normale begeleiding" },
        { fase: "oranje", signalen: "Onrustig, vermijdt contact", interventies: "Rustige ruimte aanbieden" },
        { fase: "rood", signalen: "Schreeuwen, weglopen", interventies: "Veiligheid eerst, collega oproepen" },
      ],
      veiligheidsafspraken: "Nooit alleen naar buiten bij fase rood",
    },
  });
  const spId = Array.isArray(spIns.data) && spIns.data[0] && spIns.data[0].id;
  check("4a zorgcoördinator maakt signaleringsplan", spIns.status === 201 && !!spId, spIns);
  const spInsMw = await rest(mw, "signaleringsplannen", { method: "POST", body: { client_id: CLIENT_ID } });
  check("4b medewerker mag geen signaleringsplan aanmaken", spInsMw.status >= 400, spInsMw);
  const spAct = await rpc(zc, "signaleringsplan_activeer", { p_id: spId });
  check("4c signaleringsplan activeren lukt", spAct.status === 200 && spAct.data && spAct.data.ok === true, spAct);

  // ── 5. Team-koppeling → toegang voor medewerker ──────────────────────────
  const koppelMw = await rest(mw, "client_medewerkers", { method: "POST", body: { client_id: CLIENT_ID, medewerker_id: QA_MEDEWERKER_ID } });
  check("5a medewerker mag zichzelf NIET koppelen", koppelMw.status >= 400, koppelMw);
  const koppel = await rest(zc, "client_medewerkers", {
    method: "POST",
    body: { client_id: CLIENT_ID, medewerker_id: QA_MEDEWERKER_ID, rol: "begeleider" },
  });
  check("5b zorgcoördinator koppelt medewerker", koppel.status === 201, koppel);
  const mwClient1 = await rest(mw, `clienten?id=eq.${encodeURIComponent(CLIENT_ID)}&select=id`);
  check("5c gekoppelde medewerker ziet cliënt nu WEL", Array.isArray(mwClient1.data) && mwClient1.data.length === 1, mwClient1);
  const mwZp = await rest(mw, `zorgplannen?client_id=eq.${encodeURIComponent(CLIENT_ID)}&select=id,status`);
  check("5d gekoppelde medewerker leest zorgplannen", Array.isArray(mwZp.data) && mwZp.data.length >= 3, mwZp);
  const mwAi1 = await rpc(mw, "client_ai_samenvatting", { p_client_id: CLIENT_ID });
  check("5e AI-samenvatting werkt voor gekoppelde medewerker", mwAi1.status === 200 && mwAi1.data && mwAi1.data.ok === true, mwAi1);

  // ── 6. Rapportages: RLS-aanscherping ─────────────────────────────────────
  const rapMw = await rest(mw, "client_rapportages", {
    method: "POST",
    body: { client_id: CLIENT_ID, titel: "QA dagrapportage (medewerker)", type: "dag", status: "afgerond", rapport_datum: "2026-06-10", tijd: "14:30", inhoud: "QA: rustige dag.", auteur_id: mw.userId, auteur_naam: "QA Medewerker", doel_ids: ["qa-doel-4"] },
  });
  const rapMwId = Array.isArray(rapMw.data) && rapMw.data[0] && rapMw.data[0].id;
  check("6a gekoppelde medewerker schrijft rapportage", rapMw.status === 201 && !!rapMwId, rapMw);

  const rapSpoof = await rest(mw, "client_rapportages", {
    method: "POST",
    body: { client_id: CLIENT_ID, titel: "QA spoof", auteur_id: zc.userId },
  });
  check("6b auteur_id-spoofing geweigerd", rapSpoof.status >= 400, rapSpoof);

  const rapZc = await rest(zc, "client_rapportages", {
    method: "POST",
    body: { client_id: CLIENT_ID, titel: "QA evaluatierapportage (zorgcoördinator)", type: "evaluatie", status: "concept", rapport_datum: "2026-06-10", auteur_id: zc.userId, auteur_naam: "QA Zorgcoördinator" },
  });
  const rapZcId = Array.isArray(rapZc.data) && rapZc.data[0] && rapZc.data[0].id;
  check("6c office schrijft rapportage", rapZc.status === 201 && !!rapZcId, rapZc);

  const updVreemd = await rest(mw, `client_rapportages?id=eq.${rapZcId}`, { method: "PATCH", body: { titel: "GEKAAPT" } });
  check("6d medewerker kan andermans rapportage NIET bewerken",
    updVreemd.status >= 400 || (Array.isArray(updVreemd.data) && updVreemd.data.length === 0), updVreemd);

  const finRap = await rest(fin, `client_rapportages?client_id=eq.${encodeURIComponent(CLIENT_ID)}&select=id`);
  check("6e finance leest GEEN rapportages", Array.isArray(finRap.data) && finRap.data.length === 0, finRap);
  const finZp = await rest(fin, `zorgplannen?client_id=eq.${encodeURIComponent(CLIENT_ID)}&select=id`);
  check("6f finance leest GEEN zorgplannen", Array.isArray(finZp.data) && finZp.data.length === 0, finZp);
  const finAi = await rpc(fin, "client_ai_samenvatting", { p_client_id: CLIENT_ID });
  check("6g AI-samenvatting fail-closed voor finance", finAi.status === 200 && finAi.data && finAi.data.ok === false, finAi);

  // ── 7. Contactlogboek ─────────────────────────────────────────────────────
  const clogMw = await rest(mw, "client_contactlog", {
    method: "POST",
    body: { client_id: CLIENT_ID, type: "oudergesprek", datum: "2026-06-10", tijd: "10:00", met_wie: "Moeder", onderwerp: "QA voortgangsgesprek", verslag: "QA: positief gesprek.", created_by: mw.userId, created_by_naam: "QA Medewerker" },
  });
  check("7a gekoppelde medewerker logt contactmoment", clogMw.status === 201, clogMw);
  const clogSpoof = await rest(mw, "client_contactlog", {
    method: "POST",
    body: { client_id: CLIENT_ID, type: "mdo", onderwerp: "spoof", created_by: zc.userId },
  });
  check("7b created_by-spoofing geweigerd", clogSpoof.status >= 400, clogSpoof);
  const finClog = await rest(fin, `client_contactlog?client_id=eq.${encodeURIComponent(CLIENT_ID)}&select=id`);
  check("7c finance leest GEEN contactlog", Array.isArray(finClog.data) && finClog.data.length === 0, finClog);

  // ── 8. Klacht + tijdlijn-events ───────────────────────────────────────────
  const klacht = await rest(zc, "klachten", {
    method: "POST",
    body: { onderwerp: "QA klacht fase 3", omschrijving: "QA-klacht met cliëntkoppeling", status: "nieuw", prioriteit: "laag", melder_naam: "QA Ouder", melder_type: "familie", client_id: CLIENT_ID, ontvangen_op: "2026-06-10" },
  });
  check("8a klacht met cliëntkoppeling aangemaakt", klacht.status === 201, klacht);

  const tijdlijn = await rest(dir, `client_tijdlijn?client_id=eq.${encodeURIComponent(CLIENT_ID)}&select=event_type&order=created_at.desc&limit=60`);
  const events = Array.isArray(tijdlijn.data) ? tijdlijn.data : [];
  const types = events.map((e) => e.event_type);
  check("8b tijdlijn: zorgplan-events", types.includes("zorgplan"), types.slice(0, 20));
  check("8c tijdlijn: signaleringsplan-event", types.includes("signaleringsplan"), null);
  check("8d tijdlijn: rapportage-event", types.includes("rapportage"), null);
  check("8e tijdlijn: contact-event", types.includes("contact"), null);
  check("8f tijdlijn: klacht-event", types.includes("klacht"), null);
  check("8g tijdlijn: ondertekening-event", types.includes("ondertekening"), null);

  // ── 9. AI-samenvatting inhoudelijk (directeur) ────────────────────────────
  const ai = await rpc(dir, "client_ai_samenvatting", { p_client_id: CLIENT_ID });
  const aiD = ai.data || {};
  check("9a AI: ok + actief zorgplan zichtbaar", ai.status === 200 && aiD.ok === true && aiD.zorgplan && aiD.zorgplan.doelen_totaal === 2, aiD.zorgplan);
  check("9b AI: signaleringsplan actief", aiD.signaleringsplan_actief === true, aiD);
  check("9c AI: aandachtspunten is array", Array.isArray(aiD.aandachtspunten), aiD.aandachtspunten);

  console.log("\n" + (fails === 0 ? "ALLE TESTS GESLAAGD" : fails + " TEST(S) GEFAALD"));
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error("SCRIPT-FOUT:", e); process.exit(1); });
