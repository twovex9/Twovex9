#!/usr/bin/env node
/**
 * add-preconnect.mjs — voeg preconnect-hints toe aan <head> van alle HTML files.
 *
 * Voegt deze twee regels toe direct na de <meta name="viewport"> regel:
 *   <link rel="preconnect" href="https://boscwvojcggkbdxhlfys.supabase.co">
 *   <link rel="preconnect" href="https://cdn.jsdelivr.net">
 *
 * Bespaart 50-100ms DNS+TLS handshake per page-load (aanbeveling uit
 * docs/phase4/open-items/30-performance-benchmarks.md).
 *
 * Idempotent — skipt files die al een preconnect-link hebben.
 *
 * Aanroepen:
 *   node scripts/add-preconnect.mjs              # write
 *   node scripts/add-preconnect.mjs --check      # dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--check") || args.includes("--dry-run");

const PRECONNECTS = [
  '<link rel="preconnect" href="https://boscwvojcggkbdxhlfys.supabase.co">',
  '<link rel="preconnect" href="https://cdn.jsdelivr.net">',
];

const VIEWPORT_REGEX = /(<meta\s+name=["']viewport["'][^>]*>)/i;

const htmlFiles = readdirSync(projectRoot)
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(projectRoot, f))
  .filter((f) => statSync(f).isFile());

let added = 0;
let skipped = 0;
let noViewport = 0;

for (const file of htmlFiles) {
  const original = readFileSync(file, "utf8");

  // Skip als er al preconnect is
  if (/<link\s+rel=["']preconnect["']/i.test(original)) {
    skipped++;
    continue;
  }

  // Vind viewport meta en voeg preconnects daaronder toe (zelfde indent)
  const match = original.match(VIEWPORT_REGEX);
  if (!match) {
    noViewport++;
    continue;
  }

  // Bepaal indent van viewport-regel
  const viewportIdx = original.indexOf(match[1]);
  const lineStart = original.lastIndexOf("\n", viewportIdx) + 1;
  const indent = original.slice(lineStart, viewportIdx);

  const replacement =
    match[1] +
    "\n" +
    indent + PRECONNECTS[0] +
    "\n" +
    indent + PRECONNECTS[1];

  const updated = original.replace(VIEWPORT_REGEX, replacement);

  if (!dryRun) {
    writeFileSync(file, updated, "utf8");
  }
  const rel = file.replace(projectRoot, "").replace(/^[\\/]/, "");
  console.log(`  ${rel}: 2 preconnects added`);
  added++;
}

console.log(
  `\n[add-preconnect] ${htmlFiles.length} HTML files. ` +
  `Added: ${added}, Skipped (already had): ${skipped}, No viewport: ${noViewport}` +
  `${dryRun ? " (dry-run, niets opgeslagen)" : ""}.`
);
