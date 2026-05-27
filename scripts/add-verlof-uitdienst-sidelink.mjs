// Voegt de "Uitdiensttreding"-link toe aan de Verlof-side-group in álle HTML's
// die de HR-sidebar hebben. Idempotent: skip files die de link al bevatten.
//
// Plaats: ná `<a href="verlofstanden" ...>Verlofstanden</a>`, vóór `<a href="plus-minuren" ...>Plus-/minuren</a>`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const FILES = [
  "bureau-detail.html",
  "bureaus.html",
  "compensatie-berekeningen.html",
  "compensatie-diensttypes.html",
  "compensatie-feestdagen.html",
  "compensatie-saldi.html",
  "competenties.html",
  "competentie-detail.html",
  "hr.html",
  "locaties.html",
  "locatie-detail.html",
  "medewerker.html",
  "nieuws.html",
  "opleidingen.html",
  "opleiding-detail.html",
  "plus-minuren.html",
  "salarisadministratie-exporter.html",
  "salarishuis.html",
  "salarishuis-wijzigingsgeschiedenis.html",
  "verlof.html",
  "verlofstanden.html",
  "verloftypes.html",
  "verzuim.html",
];

// Het op te zoeken regel-paar en wat ertussen komt.
// Werkt in zowel `is-active` als niet-actieve varianten van Verlofstanden,
// omdat we matchen op het href-attribuut.
const NEEDLE_RE = /(<a href="verlofstanden"[^>]*>Verlofstanden<\/a>)(\s*)(<a href="plus-minuren")/;
const NEW_LINK = '<a href="verlof-uitdienst" class="side-link side-link--nested">Uitdiensttreding</a>';

let touched = 0;
let skipped = 0;
let missing = 0;

for (const name of FILES) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) {
    console.warn("[skip] niet gevonden:", name);
    missing++;
    continue;
  }
  let src = fs.readFileSync(p, "utf8");
  if (src.includes('href="verlof-uitdienst"')) {
    skipped++;
    continue;
  }
  if (!NEEDLE_RE.test(src)) {
    console.warn("[warn] anker niet gevonden in:", name);
    missing++;
    continue;
  }
  src = src.replace(NEEDLE_RE, (_m, a, ws, c) => `${a}${ws}${NEW_LINK}${ws}${c}`);
  fs.writeFileSync(p, src, "utf8");
  touched++;
  console.log("[ok]  ", name);
}

console.log(`\nKlaar — touched=${touched} skipped=${skipped} missing=${missing}`);
