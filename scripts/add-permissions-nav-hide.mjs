#!/usr/bin/env node
/**
 * Voegt `permissions-nav-hide.js` toe direct na `permissions-gate.js` op alle
 * 66 HTML-pagina's. Idempotent.
 *
 * Run:
 *   node scripts/add-permissions-nav-hide.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const ANCHOR = '<script src="permissions-gate.js?v=permgate1" defer></script>';
const NEW_LINE = '  <script src="permissions-nav-hide.js?v=permhide1" defer></script>';

const htmlFiles = fs.readdirSync(repoRoot).filter((f) => f.endsWith(".html"));

let touched = 0;
let already = 0;
let noAnchor = 0;

for (const file of htmlFiles) {
  const full = path.join(repoRoot, file);
  const src = fs.readFileSync(full, "utf8");

  if (src.includes("permissions-nav-hide.js")) {
    already++;
    continue;
  }
  if (!src.includes(ANCHOR)) {
    noAnchor++;
    continue;
  }
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

console.log(`Codemod permissions-nav-hide-include:`);
console.log(`  Touched (nav-hide toegevoegd): ${touched}`);
console.log(`  Already had it:                ${already}`);
console.log(`  No anchor (skip):              ${noAnchor}`);
