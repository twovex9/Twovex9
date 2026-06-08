#!/usr/bin/env node
/**
 * Schrijf Locaties + Kernteam (uit bs2-console-scrape-locaties.js) naar BS1.
 * Input: C:/Users/sonck/Downloads/bs2-locaties.json
 * VEREIST: node --env-file=scripts/.env scripts/write-locaties.mjs
 */
import fs from "fs";
const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT = "C:/Users/sonck/Downloads/bs2-locaties.json";
if (!KEY) { console.error("FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt."); process.exit(1); }
if (!fs.existsSync(INPUT)) { console.error("FOUT: input niet gevonden:", INPUT); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const records = JSON.parse(fs.readFileSync(INPUT, "utf8"));
console.log(`Geladen: ${records.length} gescrapete medewerkers\n`);

let ok = 0, skip = 0, err = 0, leeg = 0;
const errors = [];
for (const rec of records) {
  if (rec.error || !rec.email) { skip++; continue; }
  const locaties = Array.isArray(rec.locaties) ? rec.locaties.filter(Boolean) : [];
  const kernteam = rec.kernteam || "";
  if (locaties.length === 0 && !kernteam) { leeg++; }
  try {
    let rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,data&data->>bs2_id=eq.${rec.id}`, { headers: H });
    let rows = await rr.json();
    if (!rows.length && rec.email) {
      rr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?select=id,data&data->>email=ilike.${encodeURIComponent(rec.email)}`, { headers: H });
      rows = await rr.json();
    }
    if (!rows.length) { skip++; console.log(`SKIP geen match: ${rec.name}`); continue; }
    const m = rows[0];
    const merged = {
      ...(m.data || {}),
      locatiesSelected: locaties,
      locatiesTags: locaties.join(", "),
      kernteam: kernteam,
      locaties_synced_at: new Date().toISOString(),
    };
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/medewerkers?id=eq.${m.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ data: merged, laatst_gewijzigd: new Date().toISOString() }),
    });
    if (!pr.ok) throw new Error(`${pr.status}: ${(await pr.text()).substring(0, 200)}`);
    ok++;
    if (ok % 10 === 0) console.log(`  ... ${ok} locaties geschreven`);
  } catch (e) { err++; errors.push(`${rec.name}: ${e.message}`); console.log(`FOUT ${rec.name}: ${e.message}`); }
}
console.log(`\n=== EINDREPORT ===\nOK: ${ok}\nSkipped: ${skip}\nErrors: ${err}\n(waarvan ${leeg} medewerkers zonder locaties/kernteam in scrape — controleer of dat klopt)`);
if (errors.length) { console.log("\nFouten:"); errors.forEach(e => console.log("  - " + e)); }
