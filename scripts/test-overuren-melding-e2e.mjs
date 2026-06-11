#!/usr/bin/env node
/**
 * test-overuren-melding-e2e.mjs — ECHTE, volledig omkeerbare productie-test:
 *  1. snapshot een 'klaargezet' ZZP-factuur + 1 regel
 *  2. dien hem in via qa-directeur (reviewer-JWT) met +0,5u overuren (echte RPC zzp_factuur_opslaan)
 *  3. controleer dat er meldingen 'Overuren te beoordelen' zijn aangemaakt voor planner+zorgco+directeur
 *  4. controleer dat qa-planner de regel nu in zzp_overuren_open ziet
 *  5. REVERT alles: meldingen + transitions weg, regel + status hersteld, totalen herberekend
 *
 * Niets blijft achter. Geen echte mails (in-app notificaties, die we verwijderen).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
readFileSync(resolve(__dirname, ".env"), "utf8").split(/\r?\n/).forEach((l) => {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) env[m[1]] = m[2];
});
const REF = env.SUPABASE_PROJECT_REF || "ukjflilnhigozfoxowmj";
const PAT = env.SUPABASE_ACCESS_TOKEN;
const URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const src = readFileSync(resolve(__dirname, "..", "supabase-client.js"), "utf8");
const ANON = (src.match(/"(eyJ[^"]+)"\s*\+\s*\n\s*"(eyJ[^"]+)"\s*\+\s*\n\s*"([^"]+)"/) || []).slice(1).join("");
const PW = "FutureFlow!QA-2026-x7K9";

async function mgmt(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text(); if (!r.ok) throw new Error(`Mgmt ${r.status}: ${t}`);
  return JSON.parse(t);
}
async function login(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json(); if (!j.access_token) throw new Error(email + " login: " + JSON.stringify(j));
  return j.access_token;
}
async function rpc(jwt, fn, body) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, data: await r.json() };
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

let snap = null;
async function revert() {
  if (!snap) return;
  const f = snap.factuur, rg = snap.regel;
  await mgmt(`delete from public.notifications where related_entity_id=${q(f.id)} and type='zzp_overuren' and created_at >= ${q(snap.boundary)};`);
  await mgmt(`delete from public.zzp_factuur_transitions where factuur_id=${q(f.id)}::uuid and created_at >= ${q(snap.boundary)};`);
  await mgmt(`update public.zzp_factuur_regels set
      ingediend_uren=${rg.ingediend_uren === null ? "null" : rg.ingediend_uren},
      ingediend_tarief=${rg.ingediend_tarief === null ? "null" : rg.ingediend_tarief},
      ingediend_bedrag=${rg.ingediend_bedrag === null ? "null" : rg.ingediend_bedrag},
      gewijzigd=${rg.gewijzigd === null ? "false" : rg.gewijzigd},
      overuren_status=${rg.overuren_status === null ? "null" : q(rg.overuren_status)},
      laatst_gewijzigd=${q(rg.laatst_gewijzigd)}
     where id=${q(rg.id)}::uuid;`);
  await mgmt(`update public.zzp_facturen set status=${q(f.status)},
      submitted_at=${f.submitted_at === null ? "null" : q(f.submitted_at)}
     where id=${q(f.id)}::uuid;`);
  await mgmt(`select public.zzp_factuur_herbereken(${q(f.id)}::uuid);`);
}

try {
  // 1) kies factuur + regel
  const pick = await mgmt(`select rg.id::text as regel_id, rg.factuur_id::text as factuur_id, rg.proforma_uren, rg.proforma_tarief
     from public.zzp_factuur_regels rg join public.zzp_facturen f on f.id=rg.factuur_id
     where f.status='klaargezet' and not rg.verwijderd and rg.proforma_uren>0 and rg.planning_dienst_id is not null
     order by rg.id limit 1;`);
  if (!pick.length) throw new Error("geen geschikte regel");
  const sel = pick[0];
  const fid = sel.factuur_id, rid = sel.regel_id;
  const fSnap = (await mgmt(`select to_jsonb(f) j from public.zzp_facturen f where id=${q(fid)}::uuid;`))[0].j;
  const rSnap = (await mgmt(`select to_jsonb(rg) j from public.zzp_factuur_regels rg where id=${q(rid)}::uuid;`))[0].j;
  const boundary = (await mgmt(`select now() as n;`))[0].n;
  snap = { factuur: fSnap, regel: rSnap, boundary };
  console.log(`Doel-factuur ${fid} (${fSnap.medewerker_naam} · ${fSnap.locatie}) status=${fSnap.status}`);
  console.log(`Doel-regel  ${rid} proforma_uren=${sel.proforma_uren} tarief=${sel.proforma_tarief}`);

  // 2) indienen via qa-directeur met +0,5u overuren
  const dirJwt = await login("qa-directeur@embracethefuture.nl");
  const nieuwUren = Number(sel.proforma_uren) + 0.5;
  const res = await rpc(dirJwt, "zzp_factuur_opslaan", {
    p_factuur_id: fid, p_indienen: true,
    p_regels: [{ id: rid, ingediend_uren: String(nieuwUren), ingediend_tarief: String(sel.proforma_tarief) }],
  });
  console.log(`\nIndienen RPC status=${res.status} → factuur-status nu = ${res.data && res.data.status}`);
  if (res.data && res.data.error) throw new Error("opslaan-RPC error: " + res.data.error);

  // 3) controleer meldingen
  const notifs = await mgmt(`select n.title, count(*) as aantal,
       array_agg(distinct r.slug order by r.slug) as rollen
     from public.notifications n
     join public.profiles p on p.id=n.user_id
     left join public.bs2_role_users ru on lower(btrim(p.email))=lower(btrim(ru.user_email))
     left join public.bs2_roles r on r.id=ru.role_id
     where n.related_entity_id=${q(fid)} and n.type='zzp_overuren' and n.created_at >= ${q(boundary)}
       and r.slug in ('teamleider','planner','directeur')
     group by n.title;`);
  const totalNotifs = await mgmt(`select count(*) c, count(distinct user_id) du from public.notifications
     where related_entity_id=${q(fid)} and type='zzp_overuren' and created_at >= ${q(boundary)};`);
  console.log("\nMeldingen aangemaakt:", JSON.stringify(notifs));
  console.log(`Totaal rijen=${totalNotifs[0].c}, unieke ontvangers=${totalNotifs[0].du} (verwacht 9 distinct)`);

  // 4) qa-planner ziet de regel in de beoordeel-lijst
  const plJwt = await login("qa-planner@embracethefuture.nl");
  const open = await rpc(plJwt, "zzp_overuren_open", {});
  const items = (open.data && open.data.items) || [];
  const mine = items.find((x) => x.regel_id === rid);
  console.log(`\nqa-planner zzp_overuren_open: ${items.length} item(s); doel-regel zichtbaar = ${!!mine}` +
    (mine ? ` (verschil ${mine.verschil}u)` : ""));

  // verdict
  const okNotif = totalNotifs[0].du === 9 && notifs.length === 1 && notifs[0].title === "Overuren te beoordelen";
  const okPlanner = !!mine && Math.abs(Number(mine.verschil) - 0.5) < 0.001;
  console.log(`\nRESULTAAT: meldingen ${okNotif ? "OK" : "FOUT"}, planner-zicht ${okPlanner ? "OK" : "FOUT"}`);
} catch (e) {
  console.error("TESTFOUT:", e.message);
} finally {
  await revert();
  // revert-controle
  const after = await mgmt(`select f.status, f.submitted_at,
      (select count(*) from public.notifications where related_entity_id=f.id::text and type='zzp_overuren' and created_at >= ${q(snap?snap.boundary:"now()")}) as rest_notifs,
      (select count(*) from public.zzp_factuur_transitions t where t.factuur_id=f.id and t.created_at >= ${q(snap?snap.boundary:"now()")}) as rest_trans
    from public.zzp_facturen f where f.id=${q(snap?snap.factuur.id:"00000000-0000-0000-0000-000000000000")}::uuid;`).catch(() => null);
  if (after) console.log("\nREVERT-CONTROLE:", JSON.stringify(after[0]), "(status moet klaargezet zijn, rest_* = 0)");
}
