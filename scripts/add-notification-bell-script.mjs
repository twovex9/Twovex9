#!/usr/bin/env node
/**
 * add-notification-bell-script.mjs
 *
 * Voegt `<script src="notification-bell.js"></script>` toe na auth-guard.js
 * in alle HTML pages. Idempotent: skip als al aanwezig.
 *
 * Usage: node scripts/add-notification-bell-script.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TAG = '<script src="notification-bell.js?v=nb1" defer></script>';
const MARKER = /<script\s+src="auth-guard\.js[^"]*"[^>]*>\s*<\/script>/i;
const ALREADY = /notification-bell\.js/i;
const EXCLUDE = new Set(["login.html"]);

const files = readdirSync(ROOT)
  .filter((f) => f.endsWith(".html") && !EXCLUDE.has(f))
  .sort();

let updated = 0;
let skipped = 0;
let missing = 0;

for (const file of files) {
  const full = join(ROOT, file);
  let html = readFileSync(full, "utf8");

  if (ALREADY.test(html)) {
    skipped += 1;
    continue;
  }

  const m = MARKER.exec(html);
  if (!m) {
    missing += 1;
    console.warn(`[skip] ${file}: geen auth-guard.js gevonden`);
    continue;
  }

  const insertAt = m.index + m[0].length;
  const before = html.slice(0, insertAt);
  const after = html.slice(insertAt);
  const sep = after.startsWith("\n") ? "\n" : "\n";
  html = before + sep + "  " + TAG + after;

  writeFileSync(full, html, "utf8");
  updated += 1;
  console.log(`[ok]   ${file}`);
}

console.log(`\nKlaar: ${updated} bijgewerkt, ${skipped} al aanwezig, ${missing} zonder auth-guard.js.`);
