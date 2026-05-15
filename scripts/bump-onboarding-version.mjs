#!/usr/bin/env node
/**
 * Bug #75 fix — Bump cache-buster `onboarding-flow.js?v=onb1` → `?v=onb2`
 * in alle HTML pagina's + add-fase-g-scripts.mjs (zodat toekomstige insert ook v=onb2 gebruikt).
 *
 * Idempotent: alleen pagina's met v=onb1 worden gewijzigd.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const OLD = "onboarding-flow.js?v=onb2";
const NEW = "onboarding-flow.js?v=onb3";

let touched = 0, unchanged = 0;

// HTML files in repo root
for (const f of fs.readdirSync(repoRoot)) {
  if (!f.endsWith(".html")) continue;
  const full = path.join(repoRoot, f);
  const src = fs.readFileSync(full, "utf8");
  if (!src.includes(OLD)) { unchanged++; continue; }
  fs.writeFileSync(full, src.split(OLD).join(NEW), "utf8");
  touched++;
}

// Update add-fase-g-scripts.mjs (used to wire future pages)
const wireScript = path.join(repoRoot, "scripts", "add-fase-g-scripts.mjs");
if (fs.existsSync(wireScript)) {
  const s = fs.readFileSync(wireScript, "utf8");
  if (s.includes(OLD)) {
    fs.writeFileSync(wireScript, s.split(OLD).join(NEW), "utf8");
    touched++;
  } else {
    unchanged++;
  }
}

console.log(`Touched: ${touched}, Unchanged: ${unchanged}`);
