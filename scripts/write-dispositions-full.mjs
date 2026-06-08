#!/usr/bin/env node
/**
 * STAP 4 — schrijf de VOLLEDIGE BS2-dashboardbron naar BS1.
 * NIET-destructief: vult ALLEEN de nieuwe tabellen public.bs2_dispositions
 * (155) + public.bs2_disposition_payments (956). Raakt de reeds-geverifieerde
 * beschikkingen(134)/facturen(911) NIET aan.
 *
 *   node --env-file=scripts/.env scripts/write-dispositions-full.mjs
 *
 * - Leest ÁLLE C:/Users/sonck/Downloads/bs2-dispositions-full*.json (incl.
 *   " (1)" dedup-variant) en kiest de rijkste.
 * - Idempotent: per tabel DELETE-all → bulk INSERT (batch 200).
 * - Elke rij bevat de BS2 per-rij-velden als kolom + de VOLLEDIGE ruwe rij
 *   in `raw` jsonb (100% behoud, methodiek STAP 4).
 */
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DL = "C:/Users/sonck/Downloads";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt (--env-file=scripts/.env)."); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

// ---- rijkste bestand kiezen ----
const files = fs.readdirSync(DL).filter(f => /^bs2-dispositions-full.*\.json$/i.test(f));
if (!files.length) { console.error("FOUT: geen bs2-dispositions-full*.json in " + DL); process.exit(1); }
let DATA = null, gekozen = "", best = -1;
for (const f of files) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8"));
    const n = (o.dispositions_active || []).length + (o.dispositions_trashed || []).length + (o.payments || []).length;
    if (n >= best) { best = n; DATA = o; gekozen = f; }
  } catch (e) { console.error("Parse-fout", f, e.message); }
}
const active = DATA.dispositions_active || [];
const trashed = DATA.dispositions_trashed || [];
const payments = DATA.payments || [];
console.log(`Bestanden: ${files.join(", ")}`);
console.log(`Gekozen (rijkste): ${gekozen}`);
console.log(`Geladen: active=${active.length} trashed=${trashed.length} payments=${payments.length}\n`);
if (active.length + trashed.length !== 155 || payments.length !== 956) {
  console.log("⚠️  LET OP: verwacht 155 dispositions + 956 payments. Ga toch door met wat aanwezig is.\n");
}

// ---- helpers ----
const num = v => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[€\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const ts = v => { const s = v == null ? "" : String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null; };       // timestamptz
const dt = v => { const s = ts(v); return s ? s.slice(0, 10) : null; };                                          // date

function mapDisp(r, isTrashed) {
  return {
    id: r.id,
    is_trashed: !!isTrashed,
    name: r.name ?? null,
    phase_id: r.phase ? r.phase.id : null,
    phase_name: r.phase ? r.phase.name : null,
    care_type_name: r.care_type ? r.care_type.name : null,
    declaration_method: r.declaration_method ?? null,
    client_id: r.client ? r.client.id : null,
    client_name: r.client ? r.client.name : null,
    client_location_name: r.client && r.client.location ? r.client.location.name : null,
    not_yet_declared: num(r.not_yet_declared),
    current_total_amount_not_paid: num(r.current_total_amount_not_paid),
    to_be_declared_current_month: num(r.to_be_declared_current_month),
    outstanding_to_declare: num(r.outstanding_to_declare),
    already_paid: num(r.already_paid),
    already_declared: num(r.already_declared),
    total_expected_amount: num(r.total_expected_amount),
    start_date: dt(r.start_date),
    end_date: dt(r.end_date),
    bs2_created_at: ts(r.created_at),
    raw: r,
  };
}
function mapPay(p) {
  return {
    id: p.id,
    disposition_id: p.disposition ? p.disposition.id : null,
    client_id: p.disposition && p.disposition.client ? p.disposition.client.id : null,
    status: p.status ?? null,
    amount: num(p.amount),
    invoice_number: p.invoice_number ?? null,
    paid_at: ts(p.paid_at),
    starts_at: dt(p.starts_at),
    ends_at: dt(p.ends_at),
    bs2_created_at: ts(p.created_at),
    is_overdue: p.is_overdue === true,
    raw: p,
  };
}

async function wipe(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${table}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function insertBatched(table, rows) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(chunk) });
    if (!r.ok) throw new Error(`INSERT ${table} @${i}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    done += chunk.length;
    process.stdout.write(`  ${table}: ${done}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${done}/${rows.length}  ✅`);
}

const dispRows = [...active.map(r => mapDisp(r, false)), ...trashed.map(r => mapDisp(r, true))];
const payRows = payments.map(mapPay);

// dedup op id (BS2 kan zelden dubbel teruggeven)
const uniq = arr => { const m = new Map(); for (const x of arr) if (x.id) m.set(x.id, x); return [...m.values()]; };
const D = uniq(dispRows), P = uniq(payRows);
console.log(`Te schrijven: ${D.length} dispositions, ${P.length} payments (na dedup)\n`);

try {
  console.log("DELETE bestaande rijen (idempotent, alleen deze 2 nieuwe tabellen)...");
  await wipe("bs2_disposition_payments");
  await wipe("bs2_dispositions");
  console.log("INSERT...");
  await insertBatched("bs2_dispositions", D);
  await insertBatched("bs2_disposition_payments", P);
} catch (e) {
  console.error("\nFOUT:", e.message);
  process.exit(1);
}

// ---- snelle zelf-verificatie van de KPI's ----
async function q(sql) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, { method: "POST", headers: H, body: JSON.stringify({ q: sql }) });
  return r.ok ? r.json() : null;
}
const cnt = async (t) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
  return r.headers.get("content-range");
};
console.log("\n=== EINDREPORT ===");
console.log("bs2_dispositions count-range:", await cnt("bs2_dispositions"), "(verwacht …/155)");
console.log("bs2_disposition_payments count-range:", await cnt("bs2_disposition_payments"), "(verwacht …/956)");
console.log("\nKlaar. Verifieer KPI's via Supabase MCP (active=89 pending=10 overdue=8 nyd=600738.98 tbd=63503.64 out=664242.62 paid=764204.59/67 dp=273614.13/11).");
