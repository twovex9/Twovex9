#!/usr/bin/env node
/**
 * bust-cache.mjs — voeg `?v=<hash>` toe aan alle lokale .js / .css references
 * in HTML-bestanden. Voorkomt dat browser-cache stale assets gebruikt na een deploy.
 *
 * PER-BESTAND CONTENT-HASH (2026-06-13):
 *  - De `?v=`-waarde is een hash van de INHOUD van elk afzonderlijk bestand,
 *    niet één globale commit-sha voor alles.
 *  - Gevolg: na een deploy verandert alleen de hash van bestanden waarvan de
 *    inhoud daadwerkelijk is gewijzigd. De browser herlaadt dus enkel die
 *    bestanden; al het ongewijzigde JS/CSS (samen veruit het meeste) blijft
 *    uit de cache komen. Bij de oude globale-sha-aanpak invalideerde élke
 *    deploy álle ~50 assets per pagina → volledige her-download elke keer.
 *  - Het uitgeleverde bestand zelf verandert NIET; alleen de query-string in
 *    de HTML. Puur een caching-optimalisatie, geen gedragswijziging.
 *
 * Hoe het werkt:
 *  - Loopt door alle *.html in project-root (geen recursie naar /docs of /scripts).
 *  - Vervangt elke `src="foo.js"` of `href="foo.css"` (met of zonder bestaande
 *    `?v=...`) door `src="foo.js?v=<contenthash>"` resp. idem voor css.
 *  - Externe URLs (https://, //, data:, #) worden overgeslagen.
 *  - Bestaat het bestand niet op schijf (bijv. een at-build gegenereerd pad),
 *    dan valt de hash terug op de commit-sha zodat het tóch ge-bust wordt.
 *
 * Versie-bron voor de fallback:
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
import { createHash } from "node:crypto";

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

const fallbackSha = getCommitSha();
console.log(`[bust-cache] per-bestand content-hash (fallback-sha: ${fallbackSha})${dryRun ? " (dry-run)" : ""}`);

// Cache van reeds berekende hashes per absoluut bestandspad (1 read per bestand,
// ook al wordt het op tientallen pagina's gerefereerd).
const hashCache = new Map();
let fallbackUsed = 0;

/**
 * Bereken een korte content-hash voor het asset waar `assetPath` (zoals in de
 * HTML staat, bv. "foo.js" of "/assets/bar.css") naar verwijst, opgelost t.o.v.
 * de map van het HTML-bestand. Valt terug op de commit-sha als het bestand
 * (nog) niet op schijf staat.
 */
function hashForAsset(assetPath, htmlDir) {
  const abs = assetPath.startsWith("/")
    ? join(projectRoot, assetPath.slice(1))
    : resolve(htmlDir, assetPath);

  if (hashCache.has(abs)) return hashCache.get(abs);

  let hash;
  try {
    const buf = readFileSync(abs);
    hash = createHash("sha1").update(buf).digest("hex").slice(0, 10);
  } catch {
    hash = fallbackSha;
    fallbackUsed += 1;
  }
  hashCache.set(abs, hash);
  return hash;
}

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
  const htmlDir = dirname(file);
  let count = 0;

  const updated = original.replace(REGEX, (match, prefix, path, suffix) => {
    count++;
    const v = hashForAsset(path, htmlDir);
    return `${prefix}${path}?v=${v}${suffix}`;
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
  `${filesChanged} gewijzigd, ${totalReplacements} replacements, ` +
  `${hashCache.size} unieke assets gehasht` +
  (fallbackUsed ? `, ${fallbackUsed} via fallback-sha (bestand niet op schijf)` : "") +
  `${dryRun ? " (dry-run, niets opgeslagen)" : ""}.`
);
