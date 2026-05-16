#!/usr/bin/env node
/**
 * TEST de gedownloade v4-scrape VÓÓR wegschrijven. Schrijft NIETS.
 *   node scripts/test-prof-scrape.mjs
 * Negeert oude diagnose-bestanden (samra/0-3), kiest per medewerker het
 * rijkste record, en spiegelt EXACT de writer-logica zodat de dekkingscijfers
 * kloppen met wat write-prof.mjs straks doet. Plus uitsplitsing per dienstverband.
 */
import fs from "fs";
import path from "path";

const DL = "C:/Users/sonck/Downloads";
const files = (fs.existsSync(DL) ? fs.readdirSync(DL) : []).filter(f => /^bs2-prof.*\.json$/i.test(f) && !/samra/i.test(f) && !/^bs2-prof-0-3\b/i.test(f));
if (!files.length) { console.error("FOUT: geen geldige bs2-prof-*.json (volledige run) in " + DL); process.exit(1); }
function richness(r) { const p = (r && r.tabs && r.tabs.professional) || {}; return Object.keys(p.fields || {}).length + (p.checks || []).length + (p.dates || []).length + (r && r.api ? 5 : 0); }
const byId = new Map();
for (const f of files) { let arr; try { arr = JSON.parse(fs.readFileSync(path.join(DL, f), "utf8")); } catch (e) { console.error("Parse-fout", f, e.message); continue; } for (const r of arr) { if (!r || !r.id || !r.tabs || !r.tabs.professional) continue; const ex = byId.get(r.id); if (!ex || richness(r) >= richness(ex)) byId.set(r.id, r); } }
const recs = [...byId.values()];

// ---- exact dezelfde extractie-logica als write-prof.mjs ----
const clean = s => (s ?? "").toString().replace(/\s+/g, " ").trim();
const PLACEHOLDER = /^(selecteer|kies|dd-mm-jjjj|dd-mm-yyyy|—|-|n\.v\.t\.?|geen|selecteer een maand|selecteer competenties|voer .* in)$/i;
const v = x => { x = (x ?? "").toString().trim(); return (!x || PLACEHOLDER.test(x)) ? "" : x; };
function find(F, ...n) { for (const k of Object.keys(F || {})) { const l = k.toLowerCase(); if (n.every(x => l.includes(x.toLowerCase()))) { const val = v(F[k]); if (val) return val; } } return ""; }
function euroNum(x) { x = (x || "").toString(); const m = x.replace(/[€\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".").match(/\d+(\.\d+)?/); return m ? m[0] : ""; }
function toNL(d) { d = (d || "").toString().trim(); let m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; m = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); return m ? `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}` : ""; }
const SKIPD = /verjaardag|geboorte|\bbirth|uit dienst|terugkeer|ziekte|eerste ziektedag|verwachte|werkelijke|beoordel|waarschuw|verloopt|verlopen|contract|opleiding|diploma|aangemaakt|gewijzigd|created|updated/i;
function pickStart(arr, api) { const dob = toNL(api && api.date_of_birth); for (const d of arr || []) { const s = (d.section || "") + " " + (d.label || ""); if (SKIPD.test(s)) continue; if (/professionele|startdatum|start datum|datum in dienst|in dienst sinds/i.test(s)) { const x = toNL(d.date); if (x && x !== dob) return x; } } for (const d of arr || []) { const s = (d.section || "") + " " + (d.label || ""); if (SKIPD.test(s)) continue; const x = toNL(d.date); if (x && x !== dob) return x; } return toNL(api && api.start_date); }
const cl = x => (x || "").replace(/kernteam|locaties|locatie|markeer het primaire team per locatie/gi, "").replace(/\s+/g, " ").trim();
function locOf(Pc) { return [...new Set((Pc || []).filter(c => c.checked && /locatie|kernteam/i.test(c.section || "")).map(c => cl(c.label)).filter(Boolean).filter(x => !/^kernteam$/i.test(x)))]; }
function kernOf(Pc) { for (const c of (Pc || []).filter(c => c.checked && /locatie|kernteam/i.test(c.section || ""))) { if (/kernteam/i.test((c.label || "") + (c.section || ""))) { const k = cl(c.label); if (k) return k; } } return ""; }

console.log("============================================================");
console.log("BESTANDEN     :", files.join(", "));
console.log("MEDEWERKERS   :", recs.length, "uniek");
console.log("SCRAPE-FOUTEN :", recs.filter(r => r.error).length);

const grp = {};
for (const r of recs) {
  const P = r.tabs?.professional?.fields || {}, Pc = r.tabs?.professional?.checks || [], Pt = r.tabs?.professional?.tables || [], Pd = r.tabs?.professional?.dates || [];
  const dv = (r.employment_type === "hiring" ? "Inhuur" : r.employment_type === "permanent" ? "Loondienst" : r.employment_type === "intern" ? "Stagiair" : (r.employment_type || "?"));
  const g = grp[dv] || (grp[dv] = { n: 0, uur: 0, mail: 0, start: 0, loc: 0, kern: 0, rates: 0, api: 0 });
  g.n++;
  if (euroNum(find(P, "algemeen", "uurtarief") || find(P, "algemeen", "tarief"))) g.uur++;
  if (find(P, "professionele", "mail")) g.mail++;
  if (pickStart(Pd, r.api)) g.start++;
  if (locOf(Pc).length) g.loc++;
  if (kernOf(Pc)) g.kern++;
  if (Pt.some(t => /diensttype/i.test((t.headers || []).join(" ") + (t.section || "")))) g.rates++;
  if (r.api && Object.keys(r.api).length) g.api++;
}
console.log("\n--- DEKKING PER DIENSTVERBAND (writer-logica) ---");
console.log("dv | n | uurAlg | profMail | startdat | locaties | kernteam | dienst-tarieftbl | api");
for (const [dv, g] of Object.entries(grp)) console.log(`${dv} | ${g.n} | ${g.uur} | ${g.mail} | ${g.start} | ${g.loc} | ${g.kern} | ${g.rates} | ${g.api}`);
const tot = Object.values(grp).reduce((a, g) => ({ n: a.n + g.n, uur: a.uur + g.uur, mail: a.mail + g.mail, start: a.start + g.start, loc: a.loc + g.loc, kern: a.kern + g.kern, rates: a.rates + g.rates, api: a.api + g.api }), { n: 0, uur: 0, mail: 0, start: 0, loc: 0, kern: 0, rates: 0, api: 0 });
console.log(`TOTAAL | ${tot.n} | ${tot.uur} | ${tot.mail} | ${tot.start} | ${tot.loc} | ${tot.kern} | ${tot.rates} | ${tot.api}`);

const s = recs.find(r => /akaazoun/i.test(r.name || "") || /samra/i.test(r.name || ""));
console.log("\n============================================================");
if (!s) { console.log("⚠️ Samra niet in deze run."); process.exit(0); }
console.log("CONTROLE-MEDEWERKER:", s.name, "| err:", s.error || "geen");
for (const tab of ["details", "professional", "education"]) {
  const t = s.tabs?.[tab] || {};
  console.log(`\n----- TAB: ${tab} -----`);
  for (const [k, val] of Object.entries(t.fields || {})) if (clean(val)) console.log(`  ${k} = ${val}`);
  const ck = (t.checks || []).filter(c => c.checked);
  if (ck.length) console.log("  aangevinkt:", ck.map(c => `[${clean(c.section)}] ${clean(c.label)}`).join(" | "));
  if ((t.dates || []).length) console.log("  datums:", JSON.stringify(t.dates));
  for (const tb of (t.tables || [])) { const rows = tb.rows || tb.rw || []; if (rows.length) console.log(`  tabel (${clean(tb.section || tb.s)}): ${JSON.stringify(rows)}`); }
}
if (s.api) console.log("\n----- API ----- start_date:", s.api.start_date, "| date_of_birth:", s.api.date_of_birth, "| address:", JSON.stringify(s.api.address || null));
const P = s.tabs?.professional?.fields || {}, Pc = s.tabs?.professional?.checks || [], Pt = s.tabs?.professional?.tables || [], Pd = s.tabs?.professional?.dates || [], D = s.tabs?.details?.fields || {}, Ec = s.tabs?.education?.checks || [];
const items = [
  ["Initialen (SA)", find(D, "initialen")],
  ["Algemeen uurtarief (42)", euroNum(find(P, "algemeen", "uurtarief") || find(P, "algemeen", "tarief"))],
  ["Prof e-mail (sakaazoun@gmail.com)", find(P, "professionele", "mail")],
  ["Prof IBAN", find(P, "iban")],
  ["Functie (Pedagogisch medewerker)", find(P, "functie")],
  ["Startdatum (→ 01-11-2023)", pickStart(Pd, s.api)],
  ["Locaties (→ Magdalenenstraat)", locOf(Pc).join(", ")],
  ["Kernteam (→ Magdalenenstraat)", kernOf(Pc)],
  ["Diensttype-tarieftabel (Boventallig 50)", Pt.some(t => /diensttype/i.test((t.headers || []).join(" ") + (t.section || ""))) ? "AANWEZIG" : ""],
  ["BHV aangevinkt", (Ec || []).some(c => c.checked && /\bbhv\b/i.test(c.label)) ? "JA" : ""],
];
console.log("\n----- SAMRA CHECKLIST (writer-uitkomst) -----");
for (const [n, val] of items) console.log(`${val ? "✅" : "❌"}  ${n}: ${val || "(leeg)"}`);
console.log("\nNB: opleidingen + SKJ komen uit data.bs2_certifications (al in BS1) — verifieer ik in de DB ná write.");
console.log("Plak ALLES hierboven in de chat.");
