/* Node-logicatest voor de rooster-groepering (user-eis 2026-06-06):
 *  - per locatie gegroepeerd, binnen locatie: Vroeg → Tussen → Late/avond → Waak
 *  - 1-op-1/ambulant in één apart kopje "Eén op één / Ambulant"
 *  - Achterwacht in een apart kopje, helemaal onderaan
 * Laadt de ECHTE planning.js via een export-patch met gestubde DOM/window globals,
 * zodat we de echte code (geen kopie) testen. Geen DB, geen browser.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "planning.js"), "utf8");

// 1) initPlanningPage()-aanroep eruit (DOM-side-effects), 2) exports erachter.
const patched =
  src.replace(/\ninitPlanningPage\(\);\s*$/, "\n") +
  "\nmodule.exports = { diensttypeRangIndex, isEenOpEenDienst, isAchterwachtDienst," +
  " getRowKey, groupItems, sortLocatieGroepen, comparePlanningItemsByTime, ui," +
  " EEN_OP_EEN_GROEP, ACHTERWACHT_GROEP };\n";

const tmp = path.join(__dirname, "_tmp_planning_logic.cjs");
fs.writeFileSync(tmp, patched);

// Stub-globals (genoeg om het bestand te laden zonder echte DOM).
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.localStorage = localStorage;
globalThis.window = {
  localStorage,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  location: { href: "", search: "" }, name: "",
};
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, appendChild() {}, set innerHTML(_) {}, get innerHTML() { return ""; } }),
  body: {},
};

const require = createRequire(import.meta.url);
const P = require(pathToFileURL(tmp).pathname.replace(/^\//, process.platform === "win32" ? "" : "/"));

let pass = 0, fail = 0;
const eq = (got, exp, msg) => {
  const a = JSON.stringify(got), b = JSON.stringify(exp);
  if (a === b) { pass++; }
  else { fail++; console.error(`✗ ${msg}\n    verwacht: ${b}\n    kreeg:    ${a}`); }
};
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`✗ ${msg}`); } };

// ---- A. diensttype-rang ----
const R = {
  vroeg: P.diensttypeRangIndex("Vroege dienst"),
  tussen: P.diensttypeRangIndex("Tussendienst"),
  late: P.diensttypeRangIndex("Late dienst"),
  waak: P.diensttypeRangIndex("Waakdienst"),
  achterwacht: P.diensttypeRangIndex("Achterwacht"),
  eenopeen: P.diensttypeRangIndex("Kiyaro 1 op 1"),
  rest: P.diensttypeRangIndex("Vergadering"),
};
ok(R.vroeg < R.tussen, "Vroeg vóór Tussen");
ok(R.tussen < R.late, "Tussen vóór Late (avond)");
ok(R.late < R.waak, "Late vóór Waak");
ok(R.waak < R.achterwacht, "Waak vóór Achterwacht");
ok(R.eenopeen > R.waak, "1-op-1 ná de dagdelen");
ok(R.rest > R.eenopeen, "Rest (Vergadering) helemaal achteraan");

// ---- B. categorie-detectie ----
ok(P.isEenOpEenDienst("Kiyaro 1 op 1"), "Kiyaro 1 op 1 = één-op-één");
ok(P.isEenOpEenDienst("1 op 1"), "kale '1 op 1' = één-op-één");
ok(!P.isEenOpEenDienst("Late dienst"), "Late dienst is GEEN één-op-één");
ok(!P.isEenOpEenDienst("Vroege dienst"), "Vroege dienst is GEEN één-op-één");
ok(P.isAchterwachtDienst("Achterwacht"), "Achterwacht herkend");
ok(!P.isAchterwachtDienst("Late dienst"), "Late dienst is GEEN achterwacht");

// ---- C. getRowKey routeert speciale categorieën naar eigen kop ----
P.ui.rowAxis = "vestiging";
eq(P.getRowKey({ diensttype: "Kiyaro 1 op 1", locatie: "Magdalenenstraat" }), P.EEN_OP_EEN_GROEP, "1-op-1 → Eén-op-één-groep (niet de woonlocatie)");
eq(P.getRowKey({ diensttype: "Achterwacht", locatie: "Achterwacht" }), P.ACHTERWACHT_GROEP, "Achterwacht → Achterwacht-groep");
eq(P.getRowKey({ diensttype: "Vroege dienst", locatie: "Magdalenenstraat" }), "Magdalenenstraat", "Vroege dienst → woonlocatie");

// ---- D. echte dag (2026-06-06), in-memory item-vorm ----
const D = "2026-06-06T";
const items = [
  { diensttype: "Achterwacht", locatie: "Achterwacht", start: D + "17:00", einde: "2026-06-07T09:00", teamlid: "Johnathan Imperator" },
  { diensttype: "Achterwacht", locatie: "Achterwacht", start: D + "17:00", einde: "2026-06-07T07:00" },
  { diensttype: "Noufel 1 op 1", locatie: "Breedstraat", start: D + "07:00", einde: D + "23:00", client: "Noufel" },
  { diensttype: "Vroege dienst", locatie: "Breedstraat", start: D + "07:30", einde: D + "15:30", teamlid: "Fouad Faiz" },
  { diensttype: "Dano 1 op 1", locatie: "Breedstraat", start: D + "08:30", einde: "2026-06-07T00:30", client: "Dano de Wagt" },
  { diensttype: "Tussendienst", locatie: "Breedstraat", start: D + "11:00", einde: D + "19:00", teamlid: "Mouad Aouir" },
  { diensttype: "Late dienst", locatie: "Breedstraat", start: D + "15:00", einde: D + "23:00", teamlid: "Youssef Maroufi" },
  { diensttype: "Waakdienst", locatie: "Breedstraat", start: D + "22:45", einde: "2026-06-07T07:45", teamlid: "Fouad Faiz" },
  { diensttype: "Lisanne 1 op 1", locatie: "Leonard Bramerstraat", start: D + "10:00", einde: D + "18:00", client: "Lisanne de Zeeuw" },
  { diensttype: "Vroege dienst", locatie: "Magdalenenstraat", start: D + "07:00", einde: D + "15:00", teamlid: "Sanne Lute" },
  { diensttype: "Kiyaro 1 op 1", locatie: "Magdalenenstraat", start: D + "07:00", einde: D + "15:15", client: "Kiyaro Lambert" },
  { diensttype: "Late dienst", locatie: "Magdalenenstraat", start: D + "14:30", einde: D + "23:00", teamlid: "Ahmed Faridi Blazquez" },
  { diensttype: "Waakdienst", locatie: "Magdalenenstraat", start: D + "22:45", einde: "2026-06-07T07:15", teamlid: "Yassir Aznag" },
  { diensttype: "Vroege dienst", locatie: "Varnebroek", start: D + "07:00", einde: D + "15:00" },
  { diensttype: "Late dienst", locatie: "Varnebroek", start: D + "14:30", einde: D + "23:00", teamlid: "Justin van Loenen" },
  { diensttype: "Waakdienst", locatie: "Varnebroek", start: D + "22:45", einde: "2026-06-07T07:15", teamlid: "Sofyan Amenchar" },
  // Onbekende (niet-vaste) woonlocatie: moet ná de bekende woonlocaties komen,
  // maar vóór de Eén-op-één- en Achterwacht-kopjes.
  { diensttype: "Vroege dienst", locatie: "satelliet woning", start: D + "08:00", einde: D + "16:00", teamlid: "Test Mw" },
];

// Groep-volgorde zoals renderWeekGrid: alle voorkomende groepen, geordend.
const groups = P.sortLocatieGroepen(P.groupItems(items));
// Woonlocaties eerst (in PLANNING_LOCATIE_VOLGORDE), dan onbekende locaties,
// dan Eén-op-één, dan Achterwacht helemaal laatst.
eq(groups, ["Breedstraat", "Leonard Bramerstraat", "Voorburggracht", "Varnebroek", "Magdalenenstraat", "satelliet woning", P.EEN_OP_EEN_GROEP, P.ACHTERWACHT_GROEP].filter((g) => groups.includes(g)), "Groep-volgorde: woonlocaties → onbekend → Eén-op-één → Achterwacht");
ok(groups[groups.length - 1] === P.ACHTERWACHT_GROEP, "Achterwacht staat HELEMAAL onderaan (ook ná onbekende locaties)");
ok(groups[groups.length - 2] === P.EEN_OP_EEN_GROEP, "Eén-op-één staat direct vóór Achterwacht");
ok(groups.indexOf("satelliet woning") < groups.indexOf(P.EEN_OP_EEN_GROEP), "Onbekende locatie komt vóór de speciale kopjes");
ok(groups.indexOf("Magdalenenstraat") < groups.indexOf("satelliet woning"), "Onbekende locatie komt ná de bekende woonlocaties");

// Magdalenenstraat bevat GEEN 1-op-1 meer (die zit in de Eén-op-één-groep).
const magd = items.filter((it) => P.getRowKey(it) === "Magdalenenstraat").sort(P.comparePlanningItemsByTime);
eq(magd.map((x) => x.diensttype), ["Vroege dienst", "Late dienst", "Waakdienst"], "Magdalenenstraat: Vroeg → Late → Waak (zonder 1-op-1)");

// Breedstraat bewijst de Tussendienst-volgorde tussen Vroeg en Late.
const bree = items.filter((it) => P.getRowKey(it) === "Breedstraat").sort(P.comparePlanningItemsByTime);
eq(bree.map((x) => x.diensttype), ["Vroege dienst", "Tussendienst", "Late dienst", "Waakdienst"], "Breedstraat: Vroeg → Tussen → Late → Waak");

// Eén-op-één-groep bundelt alle 1-op-1's van álle locaties.
const een = items.filter((it) => P.getRowKey(it) === P.EEN_OP_EEN_GROEP);
ok(een.length === 4, `Eén-op-één-groep bundelt alle 1-op-1's (verwacht 4, kreeg ${een.length})`);
ok(een.every((it) => P.isEenOpEenDienst(it.diensttype)), "Alleen 1-op-1's in de Eén-op-één-groep");

// Achterwacht-groep bevat enkel achterwacht.
const aw = items.filter((it) => P.getRowKey(it) === P.ACHTERWACHT_GROEP);
ok(aw.length === 2 && aw.every((it) => it.diensttype === "Achterwacht"), "Achterwacht-groep bevat enkel achterwacht");

fs.unlinkSync(tmp);
console.log(`\n${fail === 0 ? "✓ ALLE" : "✗"} tests: ${pass} geslaagd, ${fail} gefaald`);
process.exit(fail === 0 ? 0 : 1);
