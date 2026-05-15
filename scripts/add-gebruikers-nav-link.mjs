#!/usr/bin/env node
/**
 * v3 Fase G.5 — Wire "Gebruikers" link in Organisatie-dropdown van alle HTML pagina's.
 * Wordt geplaatst NA de Teams-link, in de bestaande Organisatie-dropdown.
 *
 * Idempotent: skipt pagina's die al een gebruikers.html link hebben.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TEAMS_LINE = '<a href="teams.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Teams</span><span class="top-dropdown-subtitle">Team structuur beheer</span></a>';
const GEBRUIKERS_LINE = '                <a href="gebruikers.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Gebruikers</span><span class="top-dropdown-subtitle">Beheer login-accounts (admin-tier)</span></a>';

const htmlFiles = fs.readdirSync(repoRoot).filter((f) => f.endsWith(".html"));

let touched = 0, skipped = 0, notmatch = 0;

for (const file of htmlFiles) {
  const full = path.join(repoRoot, file);
  const src = fs.readFileSync(full, "utf8");
  if (src.includes('href="gebruikers.html"')) { skipped++; continue; }
  if (!src.includes(TEAMS_LINE)) { notmatch++; continue; }

  // Split per regel om indentatie van TEAMS_LINE te detecteren
  const lines = src.split("\n");
  const out = [];
  let inserted = false;
  for (const line of lines) {
    out.push(line);
    if (!inserted && line.includes(TEAMS_LINE)) {
      // Bewaar de indentatie van de Teams-regel
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : "                ";
      out.push(indent + '<a href="gebruikers.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Gebruikers</span><span class="top-dropdown-subtitle">Beheer login-accounts (admin-tier)</span></a>');
      inserted = true;
    }
  }
  if (inserted) {
    fs.writeFileSync(full, out.join("\n"), "utf8");
    touched++;
  }
}

console.log(`Touched: ${touched}, Skipped: ${skipped}, No-match: ${notmatch}`);
