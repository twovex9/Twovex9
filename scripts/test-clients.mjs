#!/usr/bin/env node
/**
 * Controle vóór wegschrijven (schrijft NIETS).
 *   node scripts/test-clients.mjs
 * Toont per-tab totalen + wat de writer per cliënt zou mappen + welke cliënten
 * contacten/notities/documenten krijgen.
 */
import fs from "fs";
const P = "C:/Users/sonck/Downloads/bs2-clients-full.json";
if (!fs.existsSync(P)) { console.error("FOUT: " + P + " niet gevonden."); process.exit(1); }
const recs = JSON.parse(fs.readFileSync(P, "utf8"));
const nn = v => (v == null ? "" : String(v).trim());

const tabs = ["dispositions", "payments", "contacts", "notes", "documents", "reports", "client_forms", "incidents"];
const sum = {}; for (const t of tabs) sum[t] = 0;
for (const r of recs) for (const t of tabs) sum[t] += Array.isArray(r[t]) ? r[t].length : 0;

console.log("============================================================");
console.log("BS2-cliënten:", recs.length, "| scrape-fouten:", recs.filter(r => r.error).length);
console.log("\n--- WAT WORDT WEGGESCHREVEN ---");
console.log("clienten.data.bs2_scrape (ALLE 9 tabs, 100% ruw) : " + recs.length + " cliënten");
console.log("Details/verwijzer/zorgdata/gemeente/locatie/fase  : " + recs.filter(r => r.detail).length + " cliënten");
console.log("client_contacten (nieuw)  : " + sum.contacts + " records bij " + recs.filter(r => (r.contacts || []).length).length + " cliënten");
console.log("client_documents (nieuw)  : " + sum.documents + " records bij " + recs.filter(r => (r.documents || []).length).length + " cliënten");
console.log("client-notities → data    : " + sum.notes + " records bij " + recs.filter(r => (r.notes || []).length).length + " cliënten");
console.log("RUW bewaard (aparte fase) : beschikkingen " + sum.dispositions + " | betalingen " + sum.payments + " | incidenten " + sum.incidents + " | rapportages " + sum.reports + " | vragenlijsten " + sum.client_forms);

const rich = recs.find(r => r.clientnummer == 278) || recs[0];
const d = rich.detail || {};
console.log("\n--- CONTROLE-CLIËNT: " + rich.naam + " (nr " + rich.clientnummer + ") ---");
console.log("gemeente :", d.municipality && d.municipality.name);
console.log("locatie  :", d.location && d.location.name);
console.log("fase     :", d.phase && d.phase.name);
console.log("verwijzer:", d.referrer_name, "|", d.referrer_phone, "|", d.referrer_email);
console.log("zorg     :", d.care_start_date, "→", d.care_end_date || "(open)");
console.log("bs2_scrape bevat:", JSON.stringify(tabs.map(t => t + ":" + (rich[t] || []).length).join("  ")));

const wc = recs.filter(r => (r.contacts || []).length).map(r => r.naam + "(" + r.contacts.length + ")");
const wn = recs.filter(r => (r.notes || []).length).map(r => r.naam + "(" + r.notes.length + ")");
const wd = recs.filter(r => (r.documents || []).length).map(r => r.naam + "(" + r.documents.length + ")");
console.log("\nContacten bij :", wc.join(", ") || "(geen)");
console.log("Notities bij  :", wn.join(", ") || "(geen)");
console.log("Documenten bij:", wd.join(", ") || "(geen)");
console.log("\nPlak ALLES hierboven in de chat. Daarna pas write-clients.mjs.");
