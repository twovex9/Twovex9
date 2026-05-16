#!/usr/bin/env node
/**
 * STAP 4 — verrijk bs2_disposition_payments met de volledige factuur-detail
 * (920 objecten incl. disposition.client + care_type + statistieken).
 * NIET-destructief: UPDATE per id (raw vervangen door de rijkere detail +
 * snel-bevraagbare kolommen). Raakt facturen/beschikkingen NIET.
 *
 *   node --env-file=scripts/.env scripts/write-facturen-detail.mjs
 */
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DL = "C:/Users/sonck/Downloads";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt."); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const files = fs.readdirSync(DL).filter(f => /^bs2-facturen-detail-full.*\.json$/i.test(f));
if (!files.length) { console.error("FOUT: geen bs2-facturen-detail-full*.json"); process.exit(1); }
let DATA = null, gekozen = "", best = -1;
for (const f of files) {
  try { const o = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8")); const n = (o.facturen || []).length; if (n >= best) { best = n; DATA = o; gekozen = f; } }
  catch (e) { console.error("Parse-fout", f, e.message); }
}
const F = DATA.facturen || [];
console.log(`Gekozen: ${gekozen} | facturen=${F.length} counts=${JSON.stringify(DATA.counts)}\n`);

const num = v => { if (v == null || v === "") return null; if (typeof v === "number") return v; let s = String(v).replace(/[€\s]/g, ""); if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); else if (s.includes(",")) s = s.replace(",", "."); const n = parseFloat(s); return isNaN(n) ? null : n; };

let ok = 0, skip = 0, err = 0;
const errs = [];
for (let i = 0; i < F.length; i += 1) {
  const f = F[i];
  if (!f || !f.id) { skip++; continue; }
  const d = f.disposition || {};
  const c = d.client || {};
  const body = {
    raw: f, // VOLLEDIG detail incl. disposition.client + care_type = 100% behoud
    client_name: c.name || null,
    client_number: c.client_number || null,
    beschikking_naam: d.name || null,
    al_betaald: num(d.already_paid),
    nog_niet_ontvangen: num(d.out_standing_amount),
    ons_message: f.ons_message || null,
    detail_at: new Date().toISOString(),
  };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bs2_disposition_payments?id=eq.${f.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 160)}`);
    ok++;
    if (ok % 100 === 0) console.log(`  ... ${ok}/${F.length} verrijkt`);
  } catch (e) { err++; errs.push(`${f.id}: ${e.message}`); }
}

const cnt = async (q) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/bs2_disposition_payments?select=id&${q}`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } }); return r.headers.get("content-range"); };
console.log(`\n=== EINDREPORT ===`);
console.log(`Verrijkt: ${ok} | Skipped: ${skip} | Errors: ${err}`);
console.log(`bs2_disposition_payments met client_name:`, await cnt("client_name=not.is.null"), "(verwacht …/" + ok + ")");
console.log(`Volledige factuur-detail (incl. cliënt + statistieken) niet-destructief opgeslagen.`);
if (errs.length) { console.log("\nFouten (eerste 10):"); errs.slice(0, 10).forEach(e => console.log("  - " + e)); }
