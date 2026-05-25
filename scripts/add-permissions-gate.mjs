#!/usr/bin/env node
/**
 * Voegt `permissions-page-map.js` + `permissions-gate.js` toe aan alle HTML's
 * direct na de bestaande `permissions.js`-include. Bumpt tevens de `?v=` van
 * permissions.js zodat browsers de DB-bron variant ophalen.
 *
 * Idempotent: slaat bestanden over die de gate-include al hebben.
 *
 * Run:
 *   node scripts/add-permissions-gate.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const OLD_PERM = '<script src="permissions.js?v=perm1" defer></script>';
const NEW_PERM = '<script src="permissions.js?v=perm2" defer></script>';
const PAGE_MAP_LINE = '  <script src="permissions-page-map.js?v=permmap1" defer></script>';
const GATE_LINE = '  <script src="permissions-gate.js?v=permgate1" defer></script>';

const htmlFiles = fs.readdirSync(repoRoot).filter((f) => f.endsWith(".html"));

let touched = 0;
let alreadyHasGate = 0;
let noPermissions = 0;

for (const file of htmlFiles) {
  if (file === "login.html") continue; // login zonder gate
  if (file === "footer-pagination-snippet.html") continue;

  const full = path.join(repoRoot, file);
  let src = fs.readFileSync(full, "utf8");

  if (!src.includes("permissions.js")) {
    noPermissions++;
    continue;
  }
  if (src.includes("permissions-gate.js")) {
    alreadyHasGate++;
    continue;
  }

  // Bump permissions.js version
  if (src.includes(OLD_PERM)) {
    src = src.split(OLD_PERM).join(NEW_PERM);
  }

  const anchor = src.includes(NEW_PERM) ? NEW_PERM : OLD_PERM;
  const lines = src.split("\n");
  const out = [];
  let inserted = false;
  for (const line of lines) {
    out.push(line);
    if (!inserted && line.includes(anchor)) {
      out.push(PAGE_MAP_LINE);
      out.push(GATE_LINE);
      inserted = true;
    }
  }
  if (inserted) {
    fs.writeFileSync(full, out.join("\n"), "utf8");
    touched++;
  }
}

console.log(`Codemod permissions-gate-include:`);
console.log(`  Touched (gate toegevoegd): ${touched}`);
console.log(`  Already had gate:          ${alreadyHasGate}`);
console.log(`  No permissions.js (skip):  ${noPermissions}`);
