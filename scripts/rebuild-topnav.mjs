#!/usr/bin/env node
/**
 * rebuild-topnav.mjs — schrijf één canonieke top-navigatie naar ALLE *.html.
 *
 * Achtergrond:
 *  - De topbar stond als statische HTML in elke pagina gedupliceerd en was over
 *    92 pagina's uit sync gelopen (verschillende items/hrefs/dropdowns per
 *    pagina). Dat veroorzaakte het "verspringen / verdwijnen" van onderwerpen
 *    bij navigatie.
 *  - Dit script vervangt het volledige `<nav class="top-nav">…</nav>`-blok in
 *    elke pagina door één bron-van-waarheid die hieronder is gedefinieerd.
 *
 * Belangrijke keuzes:
 *  - GEEN `is-active` bakken in de statische HTML → de topbar is daardoor
 *    byte-identiek op elke pagina (geen drift meer). `top-nav-overflow.js` zet
 *    de actieve markering op basis van de huidige URL, vóór de eerste paint.
 *  - De dropdown-inhoud is per onderwerp compleet gemaakt en gelijkgetrokken
 *    met de linker-sidebar-submenu's. HR en Cliënten hebben veel items en
 *    krijgen daarom een meerkoloms mega-menu (`top-dropdown--mega`) zodat álle
 *    opties zichtbaar zijn zonder onderaan het scherm afgekapt te worden.
 *
 * Idempotent: meermaals draaien levert exact hetzelfde resultaat.
 *
 * Aanroepen:
 *   node scripts/rebuild-topnav.mjs            # schrijf naar alle HTML
 *   node scripts/rebuild-topnav.mjs --check    # dry-run (toon wat zou wijzigen)
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const dryRun = process.argv.slice(2).some((a) => a === "--check" || a === "--dry-run");

// --- HTML-builders -------------------------------------------------------

const I = "            "; // basis-inspringing van top-level nav-kinderen

function standalone(href, label) {
  return `${I}<a href="${href}" class="top-link">${label}</a>`;
}

// Klein dropdown-menu: gestapelde titel + subtitel (huisstijl voor weinig items).
function smallDropdown(topHref, topLabel, ariaLabel, items) {
  const links = items
    .map(
      (it) =>
        `${I}    <a href="${it.href}" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">${it.title}</span><span class="top-dropdown-subtitle">${it.sub}</span></a>`
    )
    .join("\n");
  return `${I}<div class="top-nav-item top-nav-item--dropdown">
${I}  <a href="${topHref}" class="top-link top-link--dropdown">${topLabel}<span class="top-link-chev" aria-hidden="true"></span></a>
${I}  <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="${ariaLabel}">
${links}
${I}  </div>
${I}</div>`;
}

// Mega-menu: meerdere kolommen met groepkoppen + compacte (titel-only) links.
// `columns` = array van kolommen; elke kolom = array van delen
//   { group: "Kop" }  → groepkop
//   { href, title }   → link
function megaDropdown(topHref, topLabel, ariaLabel, columns) {
  const cols = columns
    .map((col) => {
      const inner = col
        .map((part) =>
          part.group
            ? `${I}      <span class="top-dropdown-group-title">${part.group}</span>`
            : `${I}      <a href="${part.href}" class="top-dropdown-link" role="menuitem">${part.title}</a>`
        )
        .join("\n");
      return `${I}    <div class="top-dropdown-col">\n${inner}\n${I}    </div>`;
    })
    .join("\n");
  return `${I}<div class="top-nav-item top-nav-item--dropdown">
${I}  <a href="${topHref}" class="top-link top-link--dropdown">${topLabel}<span class="top-link-chev" aria-hidden="true"></span></a>
${I}  <div class="top-dropdown top-dropdown--mega" role="menu" aria-label="${ariaLabel}">
${cols}
${I}  </div>
${I}</div>`;
}

// --- Canonieke navigatie -------------------------------------------------

const PLANNING = smallDropdown("planning", "Planning", "Planning opties", [
  { href: "planning", title: "Overzicht planning", sub: "Bekijk planningsoverzicht" },
  { href: "open-diensten", title: "Open diensten", sub: "Aanmeldingen op open diensten" },
  { href: "locaties", title: "Locaties", sub: "Beheer locaties" },
  { href: "hr-diensttypes", title: "Diensttypes", sub: "Beheer eigen diensttypes" },
  { href: "beschikbaarheid-overzicht", title: "Beschikbaarheid ZZP'ers", sub: "Wie vulde zijn beschikbaarheid in" },
  { href: "planning-beheer", title: "Beheer planningbeheer", sub: "Beheer planninginstellingen" },
]);

const URENREGISTRATIE = smallDropdown("werkuren", "Urenregistratie", "Urenregistratie opties", [
  { href: "werkuren", title: "Geregistreerde uren", sub: "Overzicht geregistreerde uren" },
  { href: "werkuren-labels", title: "Labels", sub: "Beheer labels voor urenregistraties" },
]);

const HR = megaDropdown("hr", "HR", "HR opties", [
  [
    { group: "Medewerkers" },
    { href: "hr", title: "Medewerkers" },
    { href: "competenties", title: "Competenties" },
    { href: "opleidingen", title: "Opleidingen" },
    { href: "contract-sjablonen", title: "Contractsjablonen" },
    { href: "inwerk-items", title: "Inwerken" },
  ],
  [
    { group: "Salarishuis" },
    { href: "salarishuis", title: "Salarishuis" },
    { href: "salarishuis-wijzigingsgeschiedenis", title: "Wijzigingsgeschiedenis" },
    { href: "bureaus", title: "Bureau's" },
    { href: "salarisadministratie-exporter", title: "Salarisadministratie" },
    { href: "loonstroken", title: "Loonstroken" },
  ],
  [
    { group: "Verlof" },
    { href: "verlof", title: "Verlofaanvragen" },
    { href: "verlofstanden", title: "Verlofstanden" },
    { href: "verlof-uitdienst", title: "Uitdiensttreding" },
    { href: "plus-minuren", title: "Plus-/minuren" },
    { href: "verloftypes", title: "Verloftypes" },
  ],
  [
    { group: "Compensatie" },
    { href: "compensatie-saldi", title: "Saldi" },
    { href: "compensatie-berekeningen", title: "Berekeningen" },
    { href: "compensatie-feestdagen", title: "Feestdagen" },
    { href: "compensatie-diensttypes", title: "Diensttypes" },
    { group: "Overig" },
    { href: "verzuim", title: "Verzuim" },
    { href: "nieuws", title: "Nieuws" },
  ],
]);

const CLIENTEN = megaDropdown("clienten", "Cliënten", "Cliënten opties", [
  [
    { group: "Cliënten" },
    { href: "clienten", title: "Cliënten" },
    { href: "zorgsoorten", title: "Zorgsoorten" },
    { href: "organisatie", title: "Organisaties" },
    { href: "gemeenten", title: "Gemeenten" },
  ],
  [
    { group: "Beschikkingen" },
    { href: "beschikkingen-dashboard", title: "Dashboard" },
    { href: "beschikkingen", title: "Overzicht" },
    { href: "facturen", title: "Facturen" },
    { group: "Uren &amp; facturatie" },
    { href: "urendeclaraties", title: "Uren declaraties" },
    { href: "uren-budgettering", title: "Uren budgettering" },
    { href: "facturen-importeren", title: "Facturen importeren" },
  ],
  [
    { group: "Incidenten &amp; klachten" },
    { href: "incidenten", title: "Incidenten overzicht" },
    { href: "incidenten-dashboard", title: "Dashboard" },
    { href: "incidenten-categorieen", title: "Categorieën" },
    { href: "verbeteringsmaatregelen", title: "Verbeteringsmaatregelen" },
    { href: "klachten", title: "Klachten" },
  ],
]);

const KILOMETERS = smallDropdown("kilometers", "Kilometers", "Kilometers opties", [
  { href: "kilometers", title: "Kilometer declaraties", sub: "Bekijk alle kilometer declaraties" },
  { href: "km-afstanden", title: "Woon-werk afstanden", sub: "Beheer woon-werk afstanden" },
  { href: "km-afwijkingen", title: "Afwijkingen", sub: "Kilometer-afwijkingen beoordelen" },
]);

const FACTUREN = smallDropdown("facturen-te-beoordelen", "Facturen", "Facturen opties", [
  { href: "zzp-facturen", title: "Proforma's per locatie", sub: "ZZP-proforma's o.b.v. de planning" },
  { href: "zzp-overuren", title: "Overuren te beoordelen", sub: "Uren-wijzigingen → planning" },
  { href: "zzp-reconciliatie", title: "Reconciliatie per locatie", sub: "Verwacht vs binnen/goedgekeurd/nog te komen" },
  { href: "zzp-bureau-facturen", title: "Detacheringsbureaus", sub: "Bureau-portaal: uren per locatie + accorderen" },
  { href: "facturen-te-beoordelen", title: "Te beoordelen", sub: "Bekijk en beheer facturen te beoordelen" },
  { href: "facturen-alle", title: "Alle facturen", sub: "Alle medewerker-facturen bekijken en beheren" },
  { href: "facturen-indiening", title: "Indiening per maand", sub: "Wie heeft wel/niet ingediend + reconciliatie" },
]);

const FINANCIEN = smallDropdown("financien-locaties", "Financiën", "Financiën opties", [
  { href: "financien-locaties", title: "Locaties", sub: "Kosten, opbrengst &amp; resultaat per locatie" },
  { href: "financien-overhead", title: "Overhead / kantoor", sub: "Personeel &amp; kantoorkosten buiten de groepen" },
  { href: "financien-zorgsoorten", title: "Zorgsoorten", sub: "Kosten, opbrengst &amp; resultaat per zorgsoort" },
]);

const ORGANISATIE = smallDropdown("teams", "Organisatie", "Organisatie opties", [
  { href: "rollen", title: "Rollen", sub: "Beheer rollen en permissies" },
  { href: "teams", title: "Teams", sub: "Team structuur beheer" },
  { href: "gebruikers", title: "Gebruikers", sub: "Beheer login-accounts (admin-tier)" },
]);

const NAV_ITEMS = [
  standalone("home", "Home"),
  standalone("management-dashboard", "Dashboard"),
  standalone("mijn-proforma-facturen", "Mijn facturen"),
  standalone("mijn-beschikbaarheid", "Mijn beschikbaarheid"),
  standalone("mijn-uren", "Mijn uren"),
  PLANNING,
  URENREGISTRATIE,
  HR,
  CLIENTEN,
  KILOMETERS,
  FACTUREN,
  standalone("taken", "Taken"),
  standalone("beleid-documenten", "Beleid"),
  standalone("sharepoint", "SharePoint"),
  FINANCIEN,
  standalone("audit", "Audit"),
  ORGANISATIE,
  standalone("instellingen", "Instellingen"),
];

const CANONICAL_NAV =
  `<nav class="top-nav" aria-label="Hoofdnavigatie">\n` +
  NAV_ITEMS.join("\n") +
  `\n          </nav>`;

// --- Toepassen op alle HTML ----------------------------------------------

// Vervangt het hele <nav class="top-nav" …>…</nav>-blok (er is precies één per
// pagina en geen geneste <nav>, dus non-greedy tot de eerste </nav> klopt).
const NAV_RE = /<nav class="top-nav"[^>]*>[\s\S]*?<\/nav>/;

const files = readdirSync(projectRoot).filter((f) => f.endsWith(".html"));
let changed = 0;
let skipped = 0;
const noNav = [];

for (const file of files) {
  const full = join(projectRoot, file);
  const src = readFileSync(full, "utf8");
  if (!NAV_RE.test(src)) {
    noNav.push(file);
    continue;
  }
  const out = src.replace(NAV_RE, CANONICAL_NAV);
  if (out === src) {
    skipped++;
    continue;
  }
  if (!dryRun) writeFileSync(full, out, "utf8");
  changed++;
}

console.log(`${dryRun ? "[dry-run] " : ""}top-nav herschreven: ${changed} gewijzigd, ${skipped} al gelijk, ${noNav.length} zonder top-nav.`);
if (noNav.length) console.log("Zonder top-nav (overgeslagen):", noNav.join(", "));
