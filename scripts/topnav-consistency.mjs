// topnav-consistency.mjs — vervang de bestaande top-nav-track block in de 6 nieuwe
// BS1 pages met de canonical full-dropdown variant (gelijk aan competenties.html).
// Per page wordt is-active op de juiste anchor gezet.
//
// Run vanuit besa-suite-etf/: `node scripts/topnav-consistency.mjs`

import fs from "node:fs";
import path from "node:path";

const CANONICAL = `<div class="top-nav-track">
          <nav class="top-nav" aria-label="Hoofdnavigatie">
            <a href="home.html" class="top-link">Home</a>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="planning.html" class="top-link top-link--dropdown">Planning<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Planning opties">
                <a href="planning.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Overzicht planning</span><span class="top-dropdown-subtitle">Bekijk planningsoverzicht</span></a>
                <a href="planning.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Beheer planningbeheer</span><span class="top-dropdown-subtitle">Beheer planninginstellingen</span></a>
              </div>
            </div>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="werkuren.html" class="top-link top-link--dropdown">Urenregistratie<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Urenregistratie opties">
                <a href="werkuren.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Geregistreerde uren</span><span class="top-dropdown-subtitle">Overzicht geregistreerde uren</span></a>
                <a href="werkuren-labels.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Labels</span><span class="top-dropdown-subtitle">Beheer labels voor urenregistraties</span></a>
              </div>
            </div>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="hr" class="top-link top-link--dropdown">HR<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="HR opties">
                <a href="hr" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Medewerkers</span><span class="top-dropdown-subtitle">Beheer je medewerkers</span></a>
                <a href="competenties.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Competenties</span><span class="top-dropdown-subtitle">Beheer competenties</span></a>
                <a href="locaties.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Locaties</span><span class="top-dropdown-subtitle">Beheer locaties</span></a>
                <a href="salarishuis.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Salarishuis</span><span class="top-dropdown-subtitle">Beheer het salarishuis</span></a>
                <a href="bureaus.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Bureau's</span><span class="top-dropdown-subtitle">Beheer bureau's</span></a>
              </div>
            </div>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="clienten.html" class="top-link top-link--dropdown">Cliënten<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Cliënten opties">
                <a href="clienten.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Cliënten</span><span class="top-dropdown-subtitle">Cliëntbeheer</span></a>
                <a href="zorgsoorten.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Zorgsoorten</span><span class="top-dropdown-subtitle">Beheer Zorgsoorten</span></a>
                <a href="beschikkingen.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Beschikkingen</span><span class="top-dropdown-subtitle">Beschikkingen overzicht</span></a>
                <a href="facturen.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Facturen</span><span class="top-dropdown-subtitle">Factuuroverzicht</span></a>
                <a href="incidenten.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Incidenten</span><span class="top-dropdown-subtitle">Incidenten overzicht</span></a>
              </div>
            </div>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="kilometers.html" class="top-link top-link--dropdown">Kilometers<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Kilometers opties">
                <a href="kilometers.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Kilometer declaraties</span><span class="top-dropdown-subtitle">Bekijk alle kilometer declaraties</span></a>
              </div>
            </div>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="facturen-te-beoordelen.html" class="top-link top-link--dropdown">Facturen<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Facturen opties">
                <a href="facturen-te-beoordelen.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Te beoordelen</span><span class="top-dropdown-subtitle">Bekijk en beheer facturen te beoordelen</span></a>
                <a href="facturen.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Alle facturen</span><span class="top-dropdown-subtitle">Maandelijkse facturen bekijken en beheren</span></a>
              </div>
            </div>            <a href="taken.html" class="top-link">Taken</a>
            <a href="hr" class="top-link">Medewerkers</a>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="verlof.html" class="top-link top-link--dropdown">Verlof<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Verlof opties">
                <a href="verlof.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Verlofaanvragen</span><span class="top-dropdown-subtitle">Verlofaanvragen bekijken en beheren</span></a>
              </div>
            </div>
            <a href="beleid.html" class="top-link">Beleid</a>
            <a href="audit.html" class="top-link">Audit</a>
            <div class="top-nav-item top-nav-item--dropdown">
              <a href="teams.html" class="top-link top-link--dropdown">Organisatie<span class="top-link-chev" aria-hidden="true"></span></a>
              <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Organisatie opties">
                <a href="teams.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Rollen</span><span class="top-dropdown-subtitle">Beheer rollen en permissies</span></a>
                <a href="teams.html" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Teams</span><span class="top-dropdown-subtitle">Team structuur beheer</span></a>
              </div>
            </div>
            <a href="instellingen.html" class="top-link">Instellingen</a>
          </nav>
          <button type="button" class="top-nav-overflow" id="top-nav-overflow-btn" aria-label="Meer navigatie" aria-expanded="false">
            <span class="top-nav-overflow-chev" aria-hidden="true"></span>
            <div class="top-nav-overflow-panel" id="top-nav-overflow-panel"></div>
          </button>
        </div>`;

// Per pagina: (filename, find-pattern-in-canonical, replace-met-is-active)
const PAGES = [
  ["audit.html",
    '<a href="audit.html" class="top-link">Audit</a>',
    '<a href="audit.html" class="top-link is-active">Audit</a>'],
  ["instellingen.html",
    '<a href="instellingen.html" class="top-link">Instellingen</a>',
    '<a href="instellingen.html" class="top-link is-active">Instellingen</a>'],
  ["beleid.html",
    '<a href="beleid.html" class="top-link">Beleid</a>',
    '<a href="beleid.html" class="top-link is-active">Beleid</a>'],
  ["taken.html",
    '<a href="taken.html" class="top-link">Taken</a>',
    '<a href="taken.html" class="top-link is-active">Taken</a>'],
  ["verlof.html",
    '<a href="verlof.html" class="top-link top-link--dropdown">Verlof<span',
    '<a href="verlof.html" class="top-link top-link--dropdown is-active">Verlof<span'],
  ["teams.html",
    '<a href="teams.html" class="top-link top-link--dropdown">Organisatie<span',
    '<a href="teams.html" class="top-link top-link--dropdown is-active">Organisatie<span'],
];

// Regex die het hele top-nav-track block matcht (start tot eind van de div)
const blockRegex = /<div class="top-nav-track">[\s\S]*?<\/button>\s*<\/div>/;

let totalUpdates = 0;
for (const [filename, findStr, replaceStr] of PAGES) {
  const filepath = path.resolve(filename);
  if (!fs.existsSync(filepath)) {
    console.error(`SKIP: ${filename} bestaat niet`);
    continue;
  }
  const content = fs.readFileSync(filepath, "utf8");
  const match = content.match(blockRegex);
  if (!match) {
    console.error(`WARN: ${filename}: geen top-nav-track block gevonden`);
    continue;
  }
  // Bouw nieuwe nav-block met is-active op de juiste anchor
  const newNav = CANONICAL.replace(findStr, replaceStr);
  if (newNav === CANONICAL) {
    console.error(`WARN: ${filename}: find-string niet vervangen in canonical (typo?)`);
    continue;
  }
  const newContent = content.replace(blockRegex, newNav);
  fs.writeFileSync(filepath, newContent, "utf8");
  totalUpdates++;
  console.log(`✓ ${filename} bijgewerkt`);
}
console.log(`\n${totalUpdates}/${PAGES.length} bestanden bijgewerkt.`);
