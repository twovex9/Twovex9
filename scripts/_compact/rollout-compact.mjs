// Eenmalige uitrol: voeg .table-card--compact toe aan de hoofd-lijst-sectie van
// elke echte lijst-overzichtspagina + bump styles.css?v= zodat browsers de
// (al gemergede) compacte CSS ververs ophalen. Idempotent: draait veilig 2x.
//
// Scope = alleen LIJST-OVERZICHTEN. Detail-/dashboard-/samenvattingspagina's
// (factuur-detail, beschikking-detail, *-dashboard, planning-beheer, nieuws,
// facturen-importeren, instellingen, *-detail) blijven bewust ongemoeid.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NEW_VER = "compact1";

// file -> exacte <section ...> openingstag van de te compacteren lijst.
const MAP = {
  // Plain <section class="table-card"> (precies 1 lijst per pagina, m.u.v. kilometers = 2)
  "audit.html": '<section class="table-card">',
  "beleid.html": '<section class="table-card">',
  "beleid-documenten.html": '<section class="table-card">',
  "competenties.html": '<section class="table-card">',
  "contract-sjablonen.html": '<section class="table-card">',
  "facturen-alle.html": '<section class="table-card">',
  "facturen-te-beoordelen.html": '<section class="table-card">',
  "gebruikers.html": '<section class="table-card">',
  "hr-diensttypes.html": '<section class="table-card">',
  "inwerk-items.html": '<section class="table-card">',
  "notifications.html": '<section class="table-card">',
  "plus-minuren.html": '<section class="table-card">',
  "taken.html": '<section class="table-card">',
  "teams.html": '<section class="table-card">',
  "verlof.html": '<section class="table-card">',
  "verlofstanden.html": '<section class="table-card">',
  "verloftypes.html": '<section class="table-card">',
  "medewerkers-overzicht.html": '<section class="table-card">',
  "kilometers.html": '<section class="table-card">', // 2 lijsten -> beide

  // Specifieke modifier-classes
  "beschikkingen.html": '<section class="table-card besc-ov-card">',
  "bureaus.html": '<section class="table-card table-card--bureaus">',
  "clienten.html": '<section class="table-card table-card--clienten">',
  "gemeenten.html": '<section class="table-card table-card--clienten">',
  "organisatie.html": '<section class="table-card table-card--clienten">',
  "zorgsoorten.html": '<section class="table-card table-card--clienten">',
  "werkuren-labels.html": '<section class="table-card table-card--clienten">',
  "compensatie-berekeningen.html": '<section class="table-card table-card--comp-berekeningen">',
  "compensatie-diensttypes.html": '<section class="table-card table-card--comp-diensttypes">',
  "compensatie-feestdagen.html": '<section class="table-card table-card--comp-feestdagen">',
  "compensatie-saldi.html": '<section class="table-card table-card--comp-saldi">',
  "facturen.html": '<section class="table-card table-card--clienten fact-ov-card">',
  "incidenten.html": '<section class="table-card table-card--incidenten">',
  "incidenten-categorieen.html": '<section class="table-card table-card--inc-cat">',
  "verbeteringsmaatregelen.html": '<section class="table-card table-card--inc-cat">',
  "locaties.html": '<section class="table-card table-card--locaties">',
  "opleidingen.html": '<section class="table-card table-card--opleidingen">',
  "urendeclaraties.html": '<section class="table-card table-card--clienten cl-ud-tablecard">',
  "uren-budgettering.html": '<section class="table-card table-card--clienten ub-card">',
  "verzuim.html": '<section class="table-card table-card--comp-verzuim">',
  "werkuren.html": '<section class="table-card wu-table-card">',
  "salarishuis-wijzigingsgeschiedenis.html": '<section class="table-card table-card--sal sal-hist-card">',
  "salarisadministratie-exporter.html": '<section class="table-card" aria-labelledby="sa-history-heading">',
};

function addCompact(tag) {
  // Voeg table-card--compact toe binnen het class-attribuut (positie maakt niet uit).
  return tag.replace(/class="([^"]*)"/, (_m, cls) =>
    cls.split(/\s+/).includes("table-card--compact")
      ? `class="${cls}"`
      : `class="${cls} table-card--compact"`
  );
}

let okClass = 0, skipClass = 0, okVer = 0, errors = [];
for (const [file, find] of Object.entries(MAP)) {
  const path = join(ROOT, file);
  let src;
  try { src = readFileSync(path, "utf8"); }
  catch (e) { errors.push(`${file}: READ FAIL ${e.message}`); continue; }

  let out = src;

  // 1) class toevoegen op alle voorkomens van de exacte sectie-tag
  const repl = addCompact(find);
  const occ = out.split(find).length - 1;
  if (occ === 0) {
    if (out.includes(repl)) { skipClass++; console.log(`~ ${file}: al compact`); }
    else errors.push(`${file}: sectie-tag NIET gevonden -> ${find}`);
  } else {
    out = out.split(find).join(repl);
    okClass++; console.log(`+ ${file}: class toegevoegd (${occ}x)`);
  }

  // 2) styles.css versie bumpen
  const before = out;
  out = out.replace(/styles\.css\?v=[a-z0-9]+/g, `styles.css?v=${NEW_VER}`);
  if (out !== before) okVer++;
  else if (!/styles\.css\?v=/.test(out)) errors.push(`${file}: geen styles.css?v= gevonden`);

  if (out !== src) writeFileSync(path, out, "utf8");
}

console.log(`\nKLAAR: class+${okClass} (skip ${skipClass}), versie-bump ${okVer}, files ${Object.keys(MAP).length}`);
if (errors.length) { console.log("\nFOUTEN:"); errors.forEach((e) => console.log("  ! " + e)); process.exit(1); }
