#!/usr/bin/env node
/**
 * Bug #79 fix — Wire mfa-challenge.js naar alle HTML pagina's
 * NA onboarding-flow.js (must-flag modals → 2FA-challenge-modal volgorde).
 *
 * Idempotent.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Anchor moet onboarding-flow.js zijn met de huidige cache-bust versie (?v=onb3).
// We zoeken naar het pattern zonder versie zodat toekomstige cache-busts blijven werken.
const ANCHOR_PREFIX = '<script src="onboarding-flow.js';
const NEW_LINE = '  <script src="mfa-challenge.js?v=mfa1" defer></script>';

const htmlFiles = fs.readdirSync(repoRoot).filter((f) => f.endsWith(".html"));

let touched = 0, skipped = 0, notmatch = 0;

for (const file of htmlFiles) {
  const full = path.join(repoRoot, file);
  const src = fs.readFileSync(full, "utf8");
  if (src.includes("mfa-challenge.js")) { skipped++; continue; }
  if (!src.includes(ANCHOR_PREFIX)) { notmatch++; continue; }
  const lines = src.split("\n");
  const out = [];
  let inserted = false;
  for (const line of lines) {
    out.push(line);
    if (!inserted && line.includes(ANCHOR_PREFIX)) {
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
