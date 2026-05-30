#!/usr/bin/env node
/**
 * add-pwa-meta.mjs — voeg favicon, apple-touch-icon, web-manifest en de
 * "Future Flow"-startschermnaam toe aan de <head> van alle HTML-pagina's.
 *
 * Lost op dat een telefoon bij "toevoegen aan beginscherm" een gegenereerde
 * letter toont i.p.v. het Embrace the Future-logo, en zet de app-naam
 * ("Future Flow") onder het icoon (iPhone via apple-mobile-web-app-title,
 * Android via manifest short_name).
 *
 *  - Idempotent: bestanden met de marker `ff-pwa` worden overgeslagen.
 *  - Publieke sollicitant-pagina's (Embrace the Future-branding) krijgen alleen
 *    het favicon/apple-touch-icon, geen manifest/app-titel.
 *  - Bestanden zonder </head> (HTML-snippets) worden overgeslagen.
 *
 * Aanroepen:
 *   node scripts/add-pwa-meta.mjs           # patch alle HTML
 *   node scripts/add-pwa-meta.mjs --check   # dry-run, niets opslaan
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const dryRun = process.argv.includes("--check") || process.argv.includes("--dry-run");

// Publieke pagina's voor externen — houden Embrace the Future-branding,
// dus geen "Future Flow" app-installatie (wel een favicon).
const PUBLIC_PAGES = new Set([
  "contract-tekenen.html",
  "onboarding-upload.html",
  "onboarding-inwerken.html",
]);

const MARKER = "ff-pwa";

function blockFor(isPublic, eol) {
  const lines = isPublic
    ? [
        `  <!-- ${MARKER}: app-icoon -->`,
        `  <link rel="icon" type="image/png" href="assets/app-icon-192.png">`,
        `  <link rel="apple-touch-icon" href="assets/app-icon-192.png">`,
      ]
    : [
        `  <!-- ${MARKER}: app-icoon + startscherm-naam (Future Flow) -->`,
        `  <link rel="icon" type="image/png" href="assets/app-icon-192.png">`,
        `  <link rel="apple-touch-icon" href="assets/app-icon-192.png">`,
        `  <link rel="manifest" href="manifest.webmanifest">`,
        `  <meta name="theme-color" content="#2563eb">`,
        `  <meta name="apple-mobile-web-app-capable" content="yes">`,
        `  <meta name="mobile-web-app-capable" content="yes">`,
        `  <meta name="apple-mobile-web-app-title" content="Future Flow">`,
      ];
  return lines.join(eol) + eol;
}

const htmlFiles = readdirSync(projectRoot)
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(projectRoot, f))
  .filter((f) => statSync(f).isFile());

let changed = 0;
let skipped = 0;
let noHead = 0;

for (const file of htmlFiles) {
  const name = file.split(/[\\/]/).pop();
  const content = readFileSync(file, "utf8");

  if (content.includes(MARKER)) {
    skipped++;
    continue;
  }
  if (!content.includes("</head>")) {
    noHead++;
    console.log(`  ${name}: GEEN </head> — overgeslagen`);
    continue;
  }

  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const isPublic = PUBLIC_PAGES.has(name);
  const updated = content.replace("</head>", blockFor(isPublic, eol) + "</head>");

  if (!dryRun) writeFileSync(file, updated, "utf8");
  console.log(`  ${name}: ff-pwa toegevoegd${isPublic ? " (publiek, alleen favicon)" : ""}`);
  changed++;
}

console.log(
  `[add-pwa-meta] ${htmlFiles.length} HTML files — ${changed} gewijzigd, ` +
  `${skipped} al voorzien, ${noHead} zonder </head>${dryRun ? " (dry-run, niets opgeslagen)" : ""}.`
);
