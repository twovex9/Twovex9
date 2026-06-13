/**
 * unify-facturen-sidebar.mjs
 *
 * Maakt de linker zijbalk (`<nav class="side-nav" aria-label="Facturen module">`)
 * van ALLE Facturen-/Inkopen-pagina's identiek: dezelfde onderwerpen, dezelfde
 * volgorde, dezelfde labels en iconen. Alleen het actieve item verschilt per
 * pagina (`is-active` + `aria-current="page"`).
 *
 * Achtergrond: elke pagina had een eigen, hardgecodeerde subset van het menu in
 * een eigen volgorde. `sidebar-mirror.js` vulde de rest puur additief aan
 * (onderaan), waardoor de zijbalk per pagina van inhoud én volgorde verschilde.
 * Dat is verwarrend — de gebruiker wil dat het submenu altijd hetzelfde blijft.
 *
 * De volgorde volgt het top-nav "Facturen"-uitklapmenu (de canonieke volgorde),
 * zodat hover-menu en zijbalk exact overeenkomen. Rol-afscherming blijft werken:
 * permissions-nav-hide.js verbergt side-links die een rol niet mag zien.
 *
 * Idempotent: meermaals draaien geeft hetzelfde resultaat.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Canonieke volgorde = volgorde van het top-nav "Facturen"-uitklapmenu.
const LINKS = [
  {
    href: "zzp-facturen",
    label: "Proforma's",
    ico: '<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  },
  {
    href: "zzp-overuren",
    label: "Overuren",
    ico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  },
  {
    href: "zzp-reconciliatie",
    label: "Reconciliatie",
    ico: '<path d="M3 3v18h18"/><path d="M7 14l3-4 3 3 4-6"/>',
  },
  {
    href: "zzp-bureau-facturen",
    label: "Detacheringsbureaus",
    ico: '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>',
  },
  {
    href: "facturen-te-beoordelen",
    label: "Te beoordelen",
    ico: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  },
  {
    href: "facturen-alle",
    label: "Alle facturen",
    ico: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  },
  {
    href: "facturen-indiening",
    label: "Indiening per maand",
    ico: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  },
];

// Welk item is actief per pagina (detailpagina's volgen hun bovenliggende lijst).
const ACTIVE_BY_FILE = {
  "zzp-facturen.html": "zzp-facturen",
  "zzp-overuren.html": "zzp-overuren",
  "zzp-reconciliatie.html": "zzp-reconciliatie",
  "zzp-bureau-facturen.html": "zzp-bureau-facturen",
  "facturen-te-beoordelen.html": "facturen-te-beoordelen",
  "facturen-alle.html": "facturen-alle",
  "facturen-indiening.html": "facturen-indiening",
  "invoice-detail.html": "facturen-alle",
  "zzp-factuur-detail.html": "zzp-facturen",
};

function buildNav(activeHref) {
  let s = '      <nav class="side-nav" aria-label="Facturen module">\n';
  for (const l of LINKS) {
    const isA = l.href === activeHref;
    const cls = isA ? "side-link is-active" : "side-link";
    const aria = isA ? ' aria-current="page"' : "";
    s += `        <a href="${l.href}" class="${cls}"${aria}>\n`;
    s += `          <svg class="side-link-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${l.ico}</svg>\n`;
    s += `          ${l.label}\n`;
    s += "        </a>\n";
  }
  s += "      </nav>";
  return s;
}

// Consumeer ook de leading whitespace op de <nav>-regel, zodat de hele blok-
// indentatie door buildNav() wordt bepaald (idempotent — geen oplopende inspring).
const NAV_RE = /[ \t]*<nav class="side-nav" aria-label="Facturen module">[\s\S]*?<\/nav>/;

let changed = 0;
for (const [file, active] of Object.entries(ACTIVE_BY_FILE)) {
  const path = join(ROOT, file);
  const before = readFileSync(path, "utf8");
  if (!NAV_RE.test(before)) {
    console.warn(`!! ${file}: geen Facturen-module nav gevonden — overgeslagen`);
    continue;
  }
  const after = before.replace(NAV_RE, () => buildNav(active));
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
    console.log(`✓ ${file} (actief: ${active})`);
  } else {
    console.log(`= ${file} (al gelijk)`);
  }
}
console.log(`\nKlaar — ${changed} bestand(en) gewijzigd.`);
