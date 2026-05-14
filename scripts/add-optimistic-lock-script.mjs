#!/usr/bin/env node
/**
 * v3 Fase E.11 — Wire optimistic-lock.js naar alle HTML pagina's
 * met `besa-sync-reporter.js` (de standaard load-sequence-anchor).
 *
 * Idempotent: skipt als script al aanwezig.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const ANCHOR = '<script src="besa-sync-reporter.js"';
const NEW_LINE = '  <script src="optimistic-lock.js?v=ol1" defer></script>';

const htmlFiles = fs.readdirSync(repoRoot)
  .filter((f) => f.endsWith(".html"));

let touched = 0;
let skipped = 0;
let notmatch = 0;

for (const file of htmlFiles) {
  const full = path.join(repoRoot, file);
  const src = fs.readFileSync(full, "utf8");

  if (src.includes("optimistic-lock.js")) {
    skipped++;
    continue;
  }
  if (!src.includes(ANCHOR)) {
    notmatch++;
    continue;
  }

  // Insert NEW_LINE immediately after the line containing ANCHOR
  const lines = src.split("\n");
  const out = [];
  let inserted = false;
  for (const line of lines) {
    out.push(line);
    if (!inserted && line.includes(ANCHOR)) {
      out.push(NEW_LINE);
      inserted = true;
    }
  }
  if (inserted) {
    fs.writeFileSync(full, out.join("\n"), "utf8");
    touched++;
  }
}

console.log(`Touched: ${touched}, Skipped (already had): ${skipped}, No-match: ${notmatch}`);
