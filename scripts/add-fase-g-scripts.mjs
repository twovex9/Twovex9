#!/usr/bin/env node
/**
 * v3 Fase G — Wire helpdesk-modal.js + onboarding-flow.js naar alle HTML pagina's
 * NA permissions.js (Fase F load-sequence anchor).
 *
 * Idempotent.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const ANCHOR = '<script src="permissions.js?v=perm1"';
const NEW_LINES = [
  '  <script src="helpdesk-modal.js?v=help1" defer></script>',
  '  <script src="onboarding-flow.js?v=onb2" defer></script>',
];

const htmlFiles = fs.readdirSync(repoRoot).filter((f) => f.endsWith(".html"));

let touched = 0, skipped = 0, notmatch = 0;

for (const file of htmlFiles) {
  const full = path.join(repoRoot, file);
  const src = fs.readFileSync(full, "utf8");
  if (src.includes("helpdesk-modal.js") || src.includes("onboarding-flow.js")) { skipped++; continue; }
  if (!src.includes(ANCHOR)) { notmatch++; continue; }
  const lines = src.split("\n");
  const out = [];
  let inserted = false;
  for (const line of lines) {
    out.push(line);
    if (!inserted && line.includes(ANCHOR)) {
      NEW_LINES.forEach((l) => out.push(l));
      inserted = true;
    }
  }
  if (inserted) {
    fs.writeFileSync(full, out.join("\n"), "utf8");
    touched++;
  }
}

console.log(`Touched: ${touched}, Skipped: ${skipped}, No-match: ${notmatch}`);
