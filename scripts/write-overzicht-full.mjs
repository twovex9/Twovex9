#!/usr/bin/env node
/**
 * STAP 4 — schrijf de VOLLEDIGE overzicht-scrape naar BS1. NIET-destructief:
 * vult ALLEEN bs2_dispositions / bs2_disposition_payments / _rates / _audit.
 * Raakt de gebruikers-tabellen beschikkingen(134)/facturen(911) NIET aan.
 *
 *   node --env-file=scripts/.env scripts/write-overzicht-full.mjs
 *
 * - Leest de rijkste C:/Users/sonck/Downloads/bs2-overzicht-full*.json.
 * - 100% behoud: de VOLLEDIGE ruwe disposition (incl. payments/rates/notes/
 *   audit tabs) gaat in bs2_dispositions.raw. Sub-tabs ook in eigen tabellen.
 * - Idempotent: per tabel DELETE-all → bulk INSERT (batch 200).
 */
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DL = "C:/Users/sonck/Downloads";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt (--env-file=scripts/.env)."); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const files = fs.readdirSync(DL).filter(f => /^bs2-overzicht-full.*\.json$/i.test(f));
if (!files.length) { console.error("FOUT: geen bs2-overzicht-full*.json in " + DL); process.exit(1); }
let DATA = null, gekozen = "", best = -1;
for (const f of files) {
  try { const o = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8")); const n = (o.dispositions || []).length; if (n >= best) { best = n; DATA = o; gekozen = f; } }
  catch (e) { console.error("Parse-fout", f, e.message); }
}
const D = DATA.dispositions || [];
console.log(`Gekozen: ${gekozen}  | dispositions=${D.length}  counts=${JSON.stringify(DATA.counts)}\n`);

const num = v => { if (v == null || v === "") return 0; if (typeof v === "number") return v; let s = String(v).replace(/[€\s]/g, ""); if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); else if (s.includes(",")) s = s.replace(",", "."); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const numOrNull = v => (v == null || v === "" ? null : num(v));
const ts = v => { const s = v == null ? "" : String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null; };
const dt = v => { const s = ts(v); return s ? s.slice(0, 10) : null; };

const dispRows = [], payRows = [], rateRows = [], audRows = [];
const seenPay = new Set(), seenRate = new Set(), seenAud = new Set();
for (const d of D) {
  dispRows.push({
    id: d.id, is_trashed: !!d.__trashed, name: d.name ?? null,
    phase_id: d.phase ? d.phase.id : null, phase_name: d.phase ? d.phase.name : null,
    care_type_name: d.care_type ? d.care_type.name : null,
    declaration_method: d.declaration_method ?? null,
    client_id: d.client ? d.client.id : null, client_name: d.client ? d.client.name : null,
    client_location_name: d.client && d.client.location ? d.client.location.name : null,
    not_yet_declared: num(d.not_yet_declared),
    current_total_amount_not_paid: num(d.current_total_amount_not_paid),
    to_be_declared_current_month: num(d.to_be_declared_current_month),
    outstanding_to_declare: num(d.outstanding_to_declare),
    already_paid: num(d.already_paid), already_declared: num(d.already_declared),
    total_expected_amount: num(d.total_expected_amount),
    start_date: dt(d.start_date), end_date: dt(d.end_date),
    bs2_created_at: ts(d.created_at),
    raw: d, // VOLLEDIG incl. payments/rates/notes/audit = 100% behoud
  });
  for (const p of (d.payments || [])) {
    if (!p || !p.id || seenPay.has(p.id)) continue; seenPay.add(p.id);
    payRows.push({
      id: p.id, disposition_id: d.id, client_id: d.client ? d.client.id : null,
      status: p.status ?? null, amount: num(p.amount), invoice_number: p.invoice_number ?? null,
      paid_at: ts(p.paid_at), starts_at: dt(p.starts_at), ends_at: dt(p.ends_at),
      bs2_created_at: ts(p.created_at), is_overdue: p.is_overdue === true, raw: p,
    });
  }
  for (const r of (d.rates || [])) {
    if (!r || !r.id || seenRate.has(r.id)) continue; seenRate.add(r.id);
    rateRows.push({
      id: r.id, disposition_id: r.disposition_id || d.id, effective_from: ts(r.effective_from),
      stay_rate_day: numOrNull(r.stay_rate_day), ambulatory_rate_hourly: numOrNull(r.ambulatory_rate_hourly),
      ambulatory_hours_per_week: numOrNull(r.ambulatory_hours_per_week), weekly_rate: numOrNull(r.weekly_rate),
      change_reason: r.change_reason ?? null, is_currently_effective: r.is_currently_effective === true,
      rate_description: r.rate_description ?? null, raw: r,
    });
  }
  for (const a of (d.audit || [])) {
    if (!a || a.id == null || seenAud.has(a.id)) continue; seenAud.add(a.id);
    audRows.push({
      id: a.id, disposition_id: d.id, ts: ts(a.timestamp) || ts(a.created_at),
      action_type: a.action_type ?? null, resource_type: a.resource_type ?? null,
      resource_id: a.resource_id == null ? null : String(a.resource_id),
      ip_address: a.ip_address ?? null,
      causer_name: a.causer ? a.causer.name : null, causer_email: a.causer ? a.causer.email : null,
      raw: a,
    });
  }
}
console.log(`Te schrijven: dispositions=${dispRows.length} payments=${payRows.length} rates=${rateRows.length} audit=${audRows.length}\n`);

async function wipe(t) { const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?id=not.is.null`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }); if (!r.ok && r.status !== 404) throw new Error(`DELETE ${t}: ${r.status} ${(await r.text()).slice(0, 200)}`); }
async function ins(t, rows) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const c = rows.slice(i, i + 200);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(c) });
    if (!r.ok) throw new Error(`INSERT ${t} @${i}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    done += c.length; process.stdout.write(`  ${t}: ${done}/${rows.length}\r`);
  }
  console.log(`  ${t}: ${done}/${rows.length}  ✅`);
}

try {
  console.log("DELETE (alleen bs2_* dashboard/overzicht-tabellen)…");
  await wipe("bs2_disposition_payments");
  await wipe("bs2_disposition_rates");
  await wipe("bs2_disposition_audit");
  await wipe("bs2_dispositions");
  console.log("INSERT…");
  await ins("bs2_dispositions", dispRows);
  await ins("bs2_disposition_payments", payRows);
  await ins("bs2_disposition_rates", rateRows);
  await ins("bs2_disposition_audit", audRows);
} catch (e) { console.error("\nFOUT:", e.message); process.exit(1); }

const cnt = async (t) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } }); return r.headers.get("content-range"); };
console.log("\n=== EINDREPORT ===");
console.log("bs2_dispositions:", await cnt("bs2_dispositions"), "(verwacht …/" + dispRows.length + ")");
console.log("bs2_disposition_payments:", await cnt("bs2_disposition_payments"), "(…/" + payRows.length + ")");
console.log("bs2_disposition_rates:", await cnt("bs2_disposition_rates"), "(…/" + rateRows.length + ")");
console.log("bs2_disposition_audit:", await cnt("bs2_disposition_audit"), "(…/" + audRows.length + ")");
console.log("\nKlaar (niet-destructief). Volledige ruwe tabs in bs2_dispositions.raw.");
