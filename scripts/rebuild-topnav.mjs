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
 *  - `is-active` wordt PER PAGINA in de statische HTML gebakken (o.b.v.
 *    TOPIC_BY_PAGE), zodat de actieve markering al bij de EERSTE paint klopt en
 *    er geen "verversing" zichtbaar is bij navigatie. `top-nav-overflow.js`
 *    bevestigt dezelfde markering nog op basis van de URL (voor clean-URL's en
 *    sub-pagina's), maar verandert niets meer visueel.
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

function topLinkClass(extra, label, active) {
  return "top-link" + (extra ? " " + extra : "") + (active === label ? " is-active" : "");
}

function standalone(href, label, active) {
  return `${I}<a href="${href}" class="${topLinkClass("", label, active)}">${label}</a>`;
}

// Klein dropdown-menu: gestapelde titel + subtitel (huisstijl voor weinig items).
function smallDropdown(topHref, topLabel, ariaLabel, items, active) {
  const links = items
    .map(
      (it) =>
        `${I}    <a href="${it.href}" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">${it.title}</span><span class="top-dropdown-subtitle">${it.sub}</span></a>`
    )
    .join("\n");
  return `${I}<div class="top-nav-item top-nav-item--dropdown">
${I}  <a href="${topHref}" class="${topLinkClass("top-link--dropdown", topLabel, active)}">${topLabel}<span class="top-link-chev" aria-hidden="true"></span></a>
${I}  <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="${ariaLabel}">
${links}
${I}  </div>
${I}</div>`;
}

// Mega-menu: meerdere kolommen met groepkoppen + compacte (titel-only) links.
function megaDropdown(topHref, topLabel, ariaLabel, columns, active) {
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
${I}  <a href="${topHref}" class="${topLinkClass("top-link--dropdown", topLabel, active)}">${topLabel}<span class="top-link-chev" aria-hidden="true"></span></a>
${I}  <div class="top-dropdown top-dropdown--mega" role="menu" aria-label="${ariaLabel}">
${cols}
${I}  </div>
${I}</div>`;
}

// --- Canonieke navigatie (functie van het actieve onderwerp) -------------

function buildNav(active) {
  const PLANNING = smallDropdown("planning", "Planning", "Planning opties", [
    { href: "planning", title: "Overzicht planning", sub: "Bekijk planningsoverzicht" },
    { href: "open-diensten", title: "Open diensten", sub: "Aanmeldingen op open diensten" },
    { href: "locaties", title: "Locaties", sub: "Beheer locaties" },
    { href: "hr-diensttypes", title: "Diensttypes", sub: "Beheer eigen diensttypes" },
    { href: "beschikbaarheid-overzicht", title: "Beschikbaarheid ZZP'ers", sub: "Wie vulde zijn beschikbaarheid in" },
    { href: "planning-beheer", title: "Beheer planningbeheer", sub: "Beheer planninginstellingen" },
  ], active);

  const URENREGISTRATIE = smallDropdown("werkuren", "Urenregistratie", "Urenregistratie opties", [
    { href: "werkuren", title: "Geregistreerde uren", sub: "Overzicht geregistreerde uren" },
    { href: "werkuren-labels", title: "Labels", sub: "Beheer labels voor urenregistraties" },
  ], active);

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
  ], active);

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
  ], active);

  const KILOMETERS = smallDropdown("kilometers", "Kilometers", "Kilometers opties", [
    { href: "kilometers", title: "Kilometer declaraties", sub: "Bekijk alle kilometer declaraties" },
    { href: "km-afstanden", title: "Woon-werk afstanden", sub: "Beheer woon-werk afstanden" },
    { href: "km-afwijkingen", title: "Afwijkingen", sub: "Kilometer-afwijkingen beoordelen" },
  ], active);

  const FACTUREN = smallDropdown("facturen-te-beoordelen", "Facturen", "Facturen opties", [
    { href: "zzp-facturen", title: "Proforma's per locatie", sub: "ZZP-proforma's o.b.v. de planning" },
    { href: "zzp-overuren", title: "Overuren te beoordelen", sub: "Uren-wijzigingen → planning" },
    { href: "zzp-reconciliatie", title: "Reconciliatie per locatie", sub: "Verwacht vs binnen/goedgekeurd/nog te komen" },
    { href: "zzp-bureau-facturen", title: "Detacheringsbureaus", sub: "Bureau-portaal: uren per locatie + accorderen" },
    { href: "facturen-te-beoordelen", title: "Te beoordelen", sub: "Bekijk en beheer facturen te beoordelen" },
    { href: "facturen-alle", title: "Alle facturen", sub: "Alle medewerker-facturen bekijken en beheren" },
    { href: "facturen-indiening", title: "Indiening per maand", sub: "Wie heeft wel/niet ingediend + reconciliatie" },
  ], active);

  const FINANCIEN = smallDropdown("financien-locaties", "Financiën", "Financiën opties", [
    { href: "financien-locaties", title: "Locaties", sub: "Kosten, opbrengst &amp; resultaat per locatie" },
    { href: "financien-overhead", title: "Overhead / kantoor", sub: "Personeel &amp; kantoorkosten buiten de groepen" },
    { href: "financien-zorgsoorten", title: "Zorgsoorten", sub: "Kosten, opbrengst &amp; resultaat per zorgsoort" },
  ], active);

  const ORGANISATIE = smallDropdown("teams", "Organisatie", "Organisatie opties", [
    { href: "rollen", title: "Rollen", sub: "Beheer rollen en permissies" },
    { href: "teams", title: "Teams", sub: "Team structuur beheer" },
    { href: "gebruikers", title: "Gebruikers", sub: "Beheer login-accounts (admin-tier)" },
  ], active);

  const NAV_ITEMS = [
    standalone("home", "Home", active),
    standalone("management-dashboard", "Dashboard", active),
    standalone("mijn-proforma-facturen", "Mijn facturen", active),
    standalone("mijn-beschikbaarheid", "Mijn beschikbaarheid", active),
    standalone("mijn-uren", "Mijn uren", active),
    PLANNING,
    URENREGISTRATIE,
    HR,
    CLIENTEN,
    KILOMETERS,
    FACTUREN,
    standalone("taken", "Taken", active),
    standalone("beleid-documenten", "Beleid", active),
    standalone("sharepoint", "SharePoint", active),
    FINANCIEN,
    standalone("audit", "Audit", active),
    ORGANISATIE,
    standalone("instellingen", "Instellingen", active),
  ];

  return `<nav class="top-nav" aria-label="Hoofdnavigatie">\n` + NAV_ITEMS.join("\n") + `\n          </nav>`;
}

// --- Pagina → actief onderwerp (label van de top-link) -------------------
// Spiegelt PAGE_TOPIC in top-nav-overflow.js. Labels moeten EXACT matchen.
const TOPIC_BY_PAGE = {
  "home.html": "Home",
  "index.html": "Home",
  "management-dashboard.html": "Dashboard",
  "mijn-proforma-facturen.html": "Mijn facturen",
  "mijn-beschikbaarheid.html": "Mijn beschikbaarheid",
  "mijn-uitnodigingen.html": "Mijn beschikbaarheid",
  "medewerker-agenda.html": "Mijn beschikbaarheid",
  "mijn-uren.html": "Mijn uren",
  "planning.html": "Planning",
  "planning-beheer.html": "Planning",
  "beschikbaarheid-overzicht.html": "Planning",
  "open-diensten.html": "Planning",
  "locaties.html": "Planning",
  "locatie-detail.html": "Planning",
  "hr-diensttypes.html": "Planning",
  "werkuren.html": "Urenregistratie",
  "werkuren-labels.html": "Urenregistratie",
  "hr.html": "HR",
  "medewerker.html": "HR",
  "medewerker-detail.html": "HR",
  "medewerkers-overzicht.html": "HR",
  "competenties.html": "HR",
  "competentie-detail.html": "HR",
  "opleidingen.html": "HR",
  "opleiding-detail.html": "HR",
  "contract-sjablonen.html": "HR",
  "inwerk-items.html": "HR",
  "salarishuis.html": "HR",
  "salarishuis-wijzigingsgeschiedenis.html": "HR",
  "bureaus.html": "HR",
  "bureau-detail.html": "HR",
  "salarisadministratie-exporter.html": "HR",
  "loonstroken.html": "HR",
  "verlof.html": "HR",
  "verlofstanden.html": "HR",
  "verlof-uitdienst.html": "HR",
  "plus-minuren.html": "HR",
  "verloftypes.html": "HR",
  "compensatie-saldi.html": "HR",
  "compensatie-berekeningen.html": "HR",
  "compensatie-feestdagen.html": "HR",
  "compensatie-diensttypes.html": "HR",
  "verzuim.html": "HR",
  "nieuws.html": "HR",
  "clienten.html": "Cliënten",
  "client-detail.html": "Cliënten",
  "zorgsoorten.html": "Cliënten",
  "zorgsoort-detail.html": "Cliënten",
  "organisatie.html": "Cliënten",
  "organisatie-detail.html": "Cliënten",
  "gemeenten.html": "Cliënten",
  "gemeente-detail.html": "Cliënten",
  "beschikkingen.html": "Cliënten",
  "beschikkingen-dashboard.html": "Cliënten",
  "beschikking-detail.html": "Cliënten",
  "facturen.html": "Cliënten",
  "factuur-detail.html": "Cliënten",
  "urendeclaraties.html": "Cliënten",
  "uren-budgettering.html": "Cliënten",
  "facturen-importeren.html": "Cliënten",
  "incidenten.html": "Cliënten",
  "incidenten-dashboard.html": "Cliënten",
  "incidenten-categorieen.html": "Cliënten",
  "incident-melden.html": "Cliënten",
  "verbeteringsmaatregelen.html": "Cliënten",
  "klachten.html": "Cliënten",
  "kilometers.html": "Kilometers",
  "km-afstanden.html": "Kilometers",
  "km-afwijkingen.html": "Kilometers",
  "facturen-te-beoordelen.html": "Facturen",
  "facturen-alle.html": "Facturen",
  "facturen-indiening.html": "Facturen",
  "invoice-detail.html": "Facturen",
  "zzp-facturen.html": "Facturen",
  "zzp-overuren.html": "Facturen",
  "zzp-reconciliatie.html": "Facturen",
  "zzp-bureau-facturen.html": "Facturen",
  "zzp-factuur-detail.html": "Facturen",
  "taken.html": "Taken",
  "beleid-documenten.html": "Beleid",
  "beleid.html": "Beleid",
  "sharepoint.html": "SharePoint",
  "financien-locaties.html": "Financiën",
  "financien-overhead.html": "Financiën",
  "financien-zorgsoorten.html": "Financiën",
  "audit.html": "Audit",
  "teams.html": "Organisatie",
  "rollen.html": "Organisatie",
  "rol-detail.html": "Organisatie",
  "gebruikers.html": "Organisatie",
  "instellingen.html": "Instellingen",
  "mijn-gegevens.html": "Instellingen",
  "notifications.html": "Instellingen",
};

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
  const active = TOPIC_BY_PAGE[file] || null;
  const out = src.replace(NAV_RE, buildNav(active));
  if (out === src) {
    skipped++;
    continue;
  }
  if (!dryRun) writeFileSync(full, out, "utf8");
  changed++;
}

console.log(`${dryRun ? "[dry-run] " : ""}top-nav herschreven: ${changed} gewijzigd, ${skipped} al gelijk, ${noNav.length} zonder top-nav.`);
if (noNav.length) console.log("Zonder top-nav (overgeslagen):", noNav.join(", "));
