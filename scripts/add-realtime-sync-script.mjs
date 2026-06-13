#!/usr/bin/env node
/**
 * v3 Fase E.7 — Wire realtime-sync.js naar alle HTML pagina's
 * met `ff-sync-reporter.js` (de standaard load-sequence-anchor).
 *
 * Idempotent: skipt als script al aanwezig.
 * Plaatst NA optimistic-lock.js zodat ffRealtime + ffOptimisticLock
 * beide klaar zijn voor data-lagen.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const ANCHOR = '<script src="optimistic-lock.js?v=ol1"';
const NEW_LINE = '  <script src="realtime-sync.js?v=rt1" defer></script>';

const htmlFiles = fs.readdirSync(repoRoot)
  .filter((f) => f.endsWith(".html"));

let touched = 0, skipped = 0, notmatch = 0;

for (const file of htmlFiles) {
  const full = path.join(repoRoot, file);
  const src = fs.readFileSync(full, "utf8");

  if (src.includes("realtime-sync.js")) { skipped++; continue; }
  if (!src.includes(ANCHOR)) { notmatch++; continue; }

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

console.log(`Touched: ${touched}, Skipped: ${skipped}, No-match: ${notmatch}`);
