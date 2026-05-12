#!/usr/bin/env node
/**
 * bust-cache.mjs — voeg `?v=<commit-sha>` toe aan alle lokale .js / .css references
 * in HTML-bestanden. Voorkomt dat browser-cache stale assets gebruikt na een deploy.
 *
 * Hoe het werkt:
 *  - Loopt door alle *.html in project-root (geen recursie naar /docs of /scripts).
 *  - Vervangt elke `src="foo.js"` of `href="foo.css"` (met of zonder bestaande
 *    `?v=...`) door `src="foo.js?v=<sha>"` resp. `href="foo.css?v=<sha>"`.
 *  - Externe URLs (https://, //, data:, #) worden overgeslagen.
 *
 * Versie-bron:
 *  - VERCEL_GIT_COMMIT_SHA (op Vercel build), eerste 7 chars
 *  - Anders: `git rev-parse --short HEAD` (lokaal)
 *  - Anders: timestamp fallback
 *
 * Idempotent — kan ongelimiteerd vaak uitgevoerd worden.
 *
 * Aanroepen:
 *   node scripts/bust-cache.mjs            # rewrite alle HTML files
 *   node scripts/bust-cache.mjs --check    # dry-run, print zonder wijzigingen
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--check") || args.includes("--dry-run");

function getCommitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return Date.now().toString(36); // fallback wanneer git niet beschikbaar
  }
}

const sha = getCommitSha();
console.log(`[bust-cache] versie: ${sha}${dryRun ? " (dry-run)" : ""}`);

// Match `src="local.js"` of `href="local.css"`, met optionele bestaande ?v=...
// Negative lookahead voor https://, //, data:, # voor externe / inline refs
const REGEX = /(\s(?:src|href)=["'])((?!https?:\/\/|\/\/|data:|#)[^"'?\s]+\.(?:js|css))(?:\?[^"']*)?(["'])/g;

const htmlFiles = readdirSync(projectRoot)
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(projectRoot, f))
  .filter((f) => statSync(f).isFile());

let totalReplacements = 0;
let filesChanged = 0;

for (const file of htmlFiles) {
  const original = readFileSync(file, "utf8");
  let count = 0;

  const updated = original.replace(REGEX, (match, prefix, path, suffix) => {
    count++;
    return `${prefix}${path}?v=${sha}${suffix}`;
  });

  if (count > 0 && updated !== original) {
    if (!dryRun) {
      writeFileSync(file, updated, "utf8");
    }
    const rel = file.replace(projectRoot, "").replace(/^[\\/]/, "");
    console.log(`  ${rel}: ${count} refs versioned`);
    totalReplacements += count;
    filesChanged++;
  }
}

console.log(
  `[bust-cache] klaar — ${htmlFiles.length} HTML files, ` +
  `${filesChanged} gewijzigd, ${totalReplacements} replacements${dryRun ? " (dry-run, niets opgeslagen)" : ""}.`
);
