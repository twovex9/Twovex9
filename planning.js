/* ERM-achtig planning: dag / week / maand, filters, rooster-kaartjes (leer + sterren) */
const PLANNING_STORAGE_KEY = "planningItems";
/** Als gezet, wordt bij lege planning geen demodata meer ingeladen (na “rooster leegmaken”). */
const PLANNING_NO_DEMO_SEED_KEY = "planningNoDemoSeed";
const EMPLOYEE_ITEMS_STORAGE_KEY = "employeeItems";
const DIENSTTYPES_STORAGE_KEY = "comp_diensttypes_configs";
const BUREAUS_STORAGE_KEY = "hr_bureaus";
const LOCATIES_STORAGE_KEY = "hr_locaties";

const DIENSTTYPE_LABELS = {
  training: "Training",
  boventallig: "Boventallig",
  vergadering: "Vergadering",
  waakdienst: "WAK-dienst",
  achterwacht: "Achterwacht",
  slaapdienst: "Slaapdienst",
  late_dienst: "Late dienst",
  tussendienst: "Tussendienst",
  vroege_dienst: "Vroege dienst",
  mdo: "M, D, O",
  "1_op_1": "Eén op één",
};

/** Vaste weergavevolgorde: gelijk aan HR → Compensatie → Diensttype en planning (meerkeuze) */
const DIENSTTYPE_ORDER = [
  "training",
  "boventallig",
  "vergadering",
  "waakdienst",
  "achterwacht",
  "slaapdienst",
  "late_dienst",
  "tussendienst",
  "vroege_dienst",
  "mdo",
  "1_op_1",
];

/** Zelfde kleuren als compensatie / diensttype-config (UI-dots) */
const DIENSTTYPE_COLORS = {
  training: "#ff5a0a",
  boventallig: "#6867d6",
  vergadering: "#a72c4f",
  waakdienst: "#bcc66e",
  achterwacht: "#3f9738",
  slaapdienst: "#7a3a92",
  late_dienst: "#d4001a",
  tussendienst: "#ddbb88",
  vroege_dienst: "#6eb6dc",
  mdo: "#c98a8a",
  "1_op_1": "#546ed8",
};

const DEFAULT_AFDELINGEN = [
  "Klantendienst",
  "Verkoop binnendienst",
  "Magazijn",
  "Logistiek",
  "Winkel",
  "Zorg & dienstverlening",
];

const GRID_ACCENT = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#db2777"];
/** Vaste groep-kopjes voor 1-op-1/ambulant en achterwacht. Deze diensten worden
 *  — los van hun woonlocatie — onder één eigen kop gebundeld (user-eis 2026-06-06):
 *  alle 1-op-1's bij elkaar in één kopje, en de achterwacht helemaal onderaan
 *  (1 persoon die verantwoordelijk is voor àlle locaties).
 *
 *  🔗 Koppeling met Locatiebeheer (user-eis 2026-06-11): Locatiebeheer is dé bron
 *  van het locatie-overzicht in de planning. Daarom MOETEN deze twee functionele
 *  groep-namen ook als rij in `public.locaties` bestaan (exact dezelfde naam), zodat
 *  de eigenaar ze terugziet/beheert in Locatiebeheer en de planning-kop met de
 *  HR-locatierij samenvalt (zelfde string → één groep, geen dubbel). De seed staat
 *  in `scripts/seed-planning-functionele-groepen.mjs`. Voeg je hier een nieuwe
 *  functionele groep toe, seed 'm dan óók in `locaties`. */
const EEN_OP_EEN_GROEP = "Eén op één / Ambulant";
const ACHTERWACHT_GROEP = "Achterwacht";
const OPENSTAANDE_GROEP = "Openstaande diensten";
const PLANNING_LOCATIE_VOLGORDE = [
  OPENSTAANDE_GROEP,
  "Breedstraat",
  "Leonard Bramerstraat",
  "Zijperstraat",
  "Voorburggracht",
  "Varnebroek",
  "Magdalenenstraat",
  "WLZ",
  EEN_OP_EEN_GROEP,
  ACHTERWACHT_GROEP,
];

const filterState = {
  search: "",
  afdeling: new Set(),
  diensttypes: new Set(),
  teamlead: new Set(),
  teamleden: new Set(),
  clienten: new Set(),
  medewerkers: new Set(),
  vestiging: new Set(),
  locatie: new Set(),
  /** Toewijzingsstatus uit screenshot (Toegewezen / Niet toegewezen / Vervanging vereist / Alle). */
  assignStatus: "alle",
  /** Module 2 Bug #87: Dienstverband filter (Inhuur / Loondienst / alle = beide). */
  employmentType: "alle",
  /** Single-select Teamlid (uit medewerkers van HR). */
  teamlid: "",
  /** Single-select Cliënt (uit hr_bureaus). */
  client: "",
  /** Single-select Locatie filter uit toolbar bovenaan (uit hr_locaties). */
  locatieToolbar: "",
};

const ui = {
  weekStart: null,
  dayDate: null,
  monthDate: null,
  calMode: "week",
  isList: false,
  rowAxis: "vestiging",
  selectedId: null,
  editingId: null,
  dienstModus: "groep", // "groep" = klassieke dienst (1 medewerker) | "individueel" = 1-op-1/ambulant met cliënt↔teamlid-koppelingen
  moveId: null,
  tarief: 45,
  prefillStartDay: null,
  viewingId: null,
  // Spraakmemo 2026-06-11: "Toon in lijst" vanaf de rode overlap-banner toont ALLEEN
  // de dubbel-ingeroosterde diensten (de details die niet kloppen), niet het volledige
  // rooster. lastAdjustedId onthoudt de laatst aangepaste dienst zodat we na het
  // aanpassen direct (zonder herladen) terug naar het rooster kunnen springen op de
  // locatie waar de aanpassing is gedaan.
  overlapOnly: false,
  lastAdjustedId: null,
};

function readJsonArray(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePlanningItems(items) {
  // De data-laag (planningDB) is de bron-van-waarheid: pushFullCache werkt _mem +
  // de best-effort localStorage-cache bij én synct naar Supabase (met delete-guard
  // tegen accidentele massa-verwijdering door een stale/partiële cache).
  if (window.planningDB && typeof window.planningDB.pushFullCache === "function") {
    try { window.planningDB.pushFullCache(items); } catch (e) { /* */ }
    return;
  }
  // Fallback zonder data-laag: best-effort localStorage.
  try { window.localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* */ }
}

function normalizeItem(raw) {
  const o = { ...raw };
  if (!o.afdeling) o.afdeling = o.diensttype || "Overig";
  if (o.vestiging == null) o.vestiging = "";
  if (o.locatie == null) o.locatie = "";
  if (o.functie == null || o.functie === "") o.functie = o.diensttype || "—";
  o.conflict = Boolean(o.conflict);
  o.leer = Math.min(3, Math.max(0, parseInt(String(o.leer), 10) || 0));
  o.sterren = Math.min(3, Math.max(0, parseInt(String(o.sterren), 10) || 0));
  o.pauzeUren = o.pauzeUren != null ? Math.max(0, Number(o.pauzeUren) || 0) : 0;
  o.vereistAantalMedewerkers = Math.max(
    1,
    parseInt(String(o.vereistAantalMedewerkers != null ? o.vereistAantalMedewerkers : 1), 10) || 1
  );
  o.competenties = o.competenties != null ? String(o.competenties) : "";
  o.beschrijving = o.beschrijving != null ? String(o.beschrijving) : "";
  o.herhaal = Boolean(o.herhaal);
  // Zorgsoort (cliëntzorg-classificatie voor financiën): behoud indien aanwezig, voeg niet toe
  // aan bestaande diensten zonder waarde (zodat een normale top-level patch hem niet leeg wegschrijft).
  if (o.zorgsoort != null) o.zorgsoort = String(o.zorgsoort);
  return o;
}

function readPlanningItems() {
  // Bron-van-waarheid is de Supabase-gesyncde data-laag (planningDB, met _mem in
  // RAM). getAllSync valt zelf terug op de localStorage-cache zolang de data-laag
  // nog niet klaar is; alleen als planningDB ontbreekt lezen we localStorage direct.
  var src = (window.planningDB && typeof window.planningDB.getAllSync === "function")
    ? window.planningDB.getAllSync()
    : readJsonArray(PLANNING_STORAGE_KEY);
  return (Array.isArray(src) ? src : []).map(normalizeItem);
}

function getEmployeeName(emp) {
  if (!emp) return "";
  const first = String(emp.voornaam || emp.firstName || "").trim();
  const last = String(emp.achternaam || emp.lastName || "").trim();
  const full = `${first} ${last}`.trim();
  return full || String(emp.naam || "").trim();
}

function readEmployees() {
  const modern = readJsonArray(EMPLOYEE_ITEMS_STORAGE_KEY).filter((e) => !e.archived);
  if (modern.length > 0) return modern;
  return readJsonArray("employees").filter((e) => !e.archived);
}

// Release 7 — "Vrijgeven voor planning": verberg ALLEEN medewerkers met een
// lopend onboarding-traject dat nog niet is vrijgegeven. Iedereen zonder traject
// (alle bestaande medewerkers) blijft altijd zichtbaar. Faalt veilig: als de
// data nog niet geladen is of een naam niet matcht, blijft de persoon zichtbaar.
function getHeldBackPlanningNames() {
  const names = new Set();
  if (!window.onboardingDB || typeof window.onboardingDB.getAllSync !== "function") return names;
  if (!window.medewerkersDB || typeof window.medewerkersDB.getByIdSync !== "function") return names;
  let trajecten = [];
  try { trajecten = window.onboardingDB.getAllSync() || []; } catch (e) { return names; }
  trajecten.forEach((t) => {
    if (!t || t.status !== "lopend") return;
    const vrijgegeven = t.data && t.data.vrijgegevenVoorPlanning === true;
    if (vrijgegeven) return;
    const mw = window.medewerkersDB.getByIdSync(t.medewerkerId);
    if (!mw) return;
    const full = `${String(mw.voornaam || "").trim()} ${String(mw.achternaam || "").trim()}`.trim();
    if (full) names.add(full.toLowerCase());
  });
  return names;
}

function readDiensttypes() {
  const configs = readJsonArray(DIENSTTYPES_STORAGE_KEY);
  const labels = new Set();
  configs.forEach((item) => {
    const rawType = String(item?.diensttype || item?.type || item?.value || "").trim();
    const labelFromType = DIENSTTYPE_LABELS[rawType] || rawType;
    const explicitLabel = String(item?.label || item?.naam || "").trim();
    const finalLabel = explicitLabel || labelFromType;
    if (finalLabel) labels.add(finalLabel);
  });
  if (labels.size === 0) {
    DIENSTTYPE_ORDER.forEach((k) => labels.add(DIENSTTYPE_LABELS[k] || k));
  }
  return Array.from(labels).sort((a, b) => {
    const ia = DIENSTTYPE_ORDER.findIndex((k) => DIENSTTYPE_LABELS[k] === a);
    const ib = DIENSTTYPE_ORDER.findIndex((k) => DIENSTTYPE_LABELS[k] === b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "nl", { sensitivity: "base" });
  });
}

/** Module 2 Bug #90 fix: kleur per diensttype komt uit `comp_diensttypes.kleur`
 *  (Supabase, centrale config). Fallback op hardcoded DIENSTTYPE_COLORS.
 *  Zo matchen filter-chips en schedule-cards 1-op-1, en past admin-config in
 *  Compensatie → Diensttypes automatisch overal toe. */
function colorForDiensttype(naam) {
  if (!naam) return "#94a3b8";
  const trimmed = String(naam).trim();
  try {
    if (window.compDiensttypesDB && typeof window.compDiensttypesDB.getAllSync === "function") {
      const list = window.compDiensttypesDB.getAllSync() || [];
      const dt = list.find((d) => {
        const n = String(d.naam || d.diensttype || "").trim();
        return n.toLowerCase() === trimmed.toLowerCase();
      });
      if (dt && dt.kleur) return dt.kleur;
    }
  } catch (e) { /* fallback */ }
  // Fallback: slug-normalisatie naar hardcoded constants
  const slug = trimmed.toLowerCase().replace(/\s+/g, "_");
  return DIENSTTYPE_COLORS[slug] || DIENSTTYPE_COLORS[trimmed.toLowerCase()] || "#94a3b8";
}

/** Unieke diensttypes uit compensatie (comp_diensttypes_configs), zelfde volgorde als in compensatie-UI. */
function readCompensatieDiensttypeOptions() {
  const configs = readJsonArray(DIENSTTYPES_STORAGE_KEY);
  const seen = new Set();
  const out = [];
  configs.forEach((c) => {
    const v = String(c?.diensttype || "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({
      value: v,
      label: DIENSTTYPE_LABELS[v] || v,
      color: colorForDiensttype(v),
    });
  });
  if (out.length === 0) {
    return DIENSTTYPE_ORDER.map((k) => ({
      value: k,
      label: DIENSTTYPE_LABELS[k],
      color: colorForDiensttype(DIENSTTYPE_LABELS[k] || k),
    }));
  }
  return out.sort(
    (a, b) =>
      (DIENSTTYPE_ORDER.indexOf(a.value) === -1 ? 999 : DIENSTTYPE_ORDER.indexOf(a.value)) -
      (DIENSTTYPE_ORDER.indexOf(b.value) === -1 ? 999 : DIENSTTYPE_ORDER.indexOf(b.value))
  );
}

function rowDiensttypeLabels(row) {
  const s = String(row?.diensttype ?? "").trim();
  if (!s) return [];
  return s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
}

function normalizeDiensttypeToken(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Vaste, herkenbare kleur per locatie (huisstijl-palet). Onbekende
 *  locaties krijgen een deterministische kleur uit hetzelfde palet. */
const PLANNING_LOCATIE_KLEUREN = {
  "magdalenenstraat": "#ec4899",
  "magdalenstraat": "#ec4899",
  "breedstraat": "#3b82f6",
  "leonard bramerstraat": "#16a34a",
  "leonard-bramerstraat": "#16a34a",
  "zijperstraat": "#f97316",
  "voorburggracht": "#8b5cf6",
  "varnebroek": "#0891b2",
  "achterwacht": "#dc2626",
  "openstaande diensten": "#64748b",
  "ambulant extern": "#ca8a04",
  "wlz": "#10b981",
};

function readHrLocaties() {
  const seen = new Set();
  return readJsonArray(LOCATIES_STORAGE_KEY)
    // Alleen cliëntwoningen die in de planning horen: gearchiveerde én als
    // "buiten planning" gemarkeerde locaties (kantoor/showroom/shop/satelliet-
    // woning) blijven volledig uit het rooster — eigenaarseis 2026-06-11.
    .filter((l) => !l?.archived && !l?.nietInPlanning)
    .map((l) => ({
      naam: String(l?.naam || "").trim(),
      kleur: String(l?.kleur || "").trim(),
    }))
    .filter((l) => {
      if (!l.naam) return false;
      const key = l.naam.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" }));
}

function getLocatieKleur(name) {
  const raw = String(name || "").trim();
  if (!raw) return "#94a3b8";
  const k = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]+/g, "")
    .trim();
  const hrMatch = readHrLocaties().find((l) => {
    const lk = l.naam
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 -]+/g, "")
      .trim();
    return lk === k;
  });
  if (hrMatch?.kleur) return hrMatch.kleur;
  if (PLANNING_LOCATIE_KLEUREN[k]) return PLANNING_LOCATIE_KLEUREN[k];
  let hash = 0;
  for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) | 0;
  const palette = [
    "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4",
    "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#84cc16"
  ];
  return palette[Math.abs(hash) % palette.length];
}

function getClientFirstName(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] || t;
}

function resolveDiensttypeKey(raw) {
  const t = normalizeDiensttypeToken(raw);
  if (!t) return null;
  if (t === "training") return "training";
  if (t === "boventallig") return "boventallig";
  if (t === "vergadering") return "vergadering";
  if (t === "waakdienst" || t === "wak dienst" || t === "wakdienst") return "waakdienst";
  if (t === "achterwacht") return "achterwacht";
  if (t === "slaapdienst") return "slaapdienst";
  if (t === "late dienst" || t === "latedienst") return "late_dienst";
  if (t === "tussendienst") return "tussendienst";
  if (t === "vroege dienst" || t === "vroegedienst") return "vroege_dienst";
  if (t === "m d o" || t === "mdo") return "mdo";
  if (t === "een op een" || t === "1 op 1" || t === "1op1") return "1_op_1";
  return null;
}

function readClienten() {
  // Module 2 Bug #92 fix: gebruik centrale clientenDB (individuele cliënten),
  // NIET bureaus (organisaties). Sync automatisch via besa:clienten-updated event.
  try {
    if (window.clientenDB && typeof window.clientenDB.getAllSync === "function") {
      const all = window.clientenDB.getAllSync() || [];
      const names = all
        .filter((c) => !c.archived)
        .map((c) => {
          const v = String(c.voornaam || "").trim();
          const a = String(c.achternaam || "").trim();
          const naam = `${v} ${a}`.trim();
          return naam || c.naam || "";
        })
        .filter(Boolean);
      if (names.length) return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "nl"));
    }
  } catch (e) { /* fallback */ }
  // Fallback 1: unique waardes uit planning.client kolom (live data)
  try {
    if (window.planningDB && typeof window.planningDB.getAllSync === "function") {
      const all = window.planningDB.getAllSync() || [];
      const names = Array.from(new Set(all.map((r) => String(r.client || "").trim()).filter(Boolean)));
      if (names.length) return names.sort((a, b) => a.localeCompare(b, "nl"));
    }
  } catch (e) { /* fallback */ }
  // Fallback 2: legacy bureaus (organisaties — minder ideaal)
  const bureaus = readJsonArray(BUREAUS_STORAGE_KEY).filter((b) => !b.archived);
  const names = bureaus.map((b) => String(b.naam || "").trim()).filter(Boolean);
  if (names.length) return names;
  return ["Onbekende cliënt"];
}

function readVestigingsNamen() {
  return readHrLocaties().map((l) => l.naam);
}

/** Altijd minstens één optie voor planningsformulieren wanneer HR-locaties leeg is */
function getVestigingOptiesVoorForm(dataState) {
  const v = (dataState && dataState.hrVestigingen) || readVestigingsNamen();
  if (v.length) return v;
  return ["(Voeg eerst locaties toe onder HR → Locaties)"];
}

function getMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function isToday(d) {
  return sameCalendarDay(d, new Date());
}

function parseStartDate(iso) {
  if (!iso) return null;
  // Diensten worden als "fake-UTC" opgeslagen: de wandklok-tijd met +00-offset
  // (BS2-import "2026-12-31T22:45:00+00" + app-saves via toIsoOrNull). Parse de
  // wandklok-componenten als LOKALE Date zodat dag-plaatsing, duur én weergave de
  // bedoelde wandklok tonen i.p.v. +1/+2u door tijdzone-conversie. Consistent met
  // open-diensten.js en de mobiele app (die de ISO-string slicen).
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t;
}

function itemOverlapsRange(item, rangeStart, rangeEnd) {
  const s = parseStartDate(item.start);
  if (!s) return false;
  return s >= rangeStart && s < rangeEnd;
}

function durationHours(startIso, endIso) {
  const a = parseStartDate(startIso);
  const b = parseStartDate(endIso);
  if (!a || !b) return 0;
  return Math.max(0, (b - a) / 3600000);
}

// F6: vliegtuig-icoon bovenaan dag-cel als ≥1 medewerker goedgekeurd verlof
// heeft op die dag (week-, dag-, en maand-view). Hover-tooltip toont namen.
function getApprovedLeavesOnDate(dateObj) {
  if (!window.verlofDB || typeof window.verlofDB.getAllSync !== "function") return [];
  let rows;
  try { rows = window.verlofDB.getAllSync() || []; } catch (e) { return []; }
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${d}`;
  return rows.filter((r) => {
    if (!r || r.status !== "goedgekeurd") return false;
    if (!r.startDatum || !r.eindDatum) return false;
    return String(r.startDatum) <= iso && iso <= String(r.eindDatum);
  });
}
function leaveTooltipText(leaves) {
  if (!leaves || leaves.length === 0) return "";
  const meds = (window.medewerkersDB && window.medewerkersDB.getAllSync()) || [];
  function fmt(s) {
    if (!s) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s);
  }
  function nameOf(empId) {
    const e = meds.find((x) => String(x.id) === String(empId));
    if (!e) return "Medewerker";
    return `${e.voornaam || ""} ${e.achternaam || ""}`.trim() || "Medewerker";
  }
  return leaves.map((l) => `${nameOf(l.medewerkerId)} · ${fmt(l.startDatum)} t/m ${fmt(l.eindDatum)}`).join("\n");
}
function renderLeavePlaneHtml(dateObj) {
  const leaves = getApprovedLeavesOnDate(dateObj);
  if (leaves.length === 0) return "";
  const tooltip = escapeHtml(leaveTooltipText(leaves));
  // SVG vliegtuig (24x24 outline, kleur via stroke=currentColor) — past in dag-cel
  return `<span class="planning-erm-leave-plane" title="${tooltip}" aria-label="${leaves.length} medewerker(s) op verlof"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.5 11.5-1.5-1.5-5 5-5-5-1.5 1.5 5 5-5 5 1.5 1.5 5-5 5 5 1.5-1.5-5-5z" style="display:none"/><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>${leaves.length > 1 ? `<span class="planning-erm-leave-count">${leaves.length}</span>` : ""}</span>`;
}

// Vaste dagdeel-/diensttype-volgorde binnen een locatie (user-eis 2026-06-06):
// Vroege dienst → Tussendienst → Late/avonddienst → Waakdienst → rest.
// Achterwacht en 1-op-1/ambulant krijgen elk hun éigen kop-groep (zie getRowKey),
// maar houden hier ook een rang: voor de lijst-view en als veilige fallback.
// Binnen elke groep: 1-op-1 per cliënt, rest alfabetisch, daarna oplopend op start-tijd.
const DIENSTRANG = {
  VROEG: 0,
  TUSSEN: 1,
  LATE: 2,
  WAAK: 3,
  ACHTERWACHT: 4,
  EEN_OP_EEN: 5,
  REST: 6,
};

/** Herkent een 1-op-1/ambulante dienst aan het diensttype (bv. "Kiyaro 1 op 1"). */
function isEenOpEenDienst(dt) {
  const s = String(dt || "").trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes("1 op 1") ||
    s === "1-op-1" ||
    s === "1op1" ||
    s === "een op een" ||
    s.includes("ambulant")
  );
}

/** Herkent de achterwacht-dienst aan het diensttype. */
function isAchterwachtDienst(dt) {
  return String(dt || "").trim().toLowerCase() === "achterwacht";
}

function diensttypeRangIndex(dt) {
  const s = String(dt || "").trim().toLowerCase();
  if (!s) return DIENSTRANG.REST + 1; // onbekend: helemaal achteraan
  // 1-op-1 en achterwacht eerst herkennen (vóór de dagdeel-substrings),
  // want een cliëntnaam in "<naam> 1 op 1" mag niet per ongeluk als dagdeel matchen.
  if (isAchterwachtDienst(s)) return DIENSTRANG.ACHTERWACHT;
  if (isEenOpEenDienst(s)) return DIENSTRANG.EEN_OP_EEN;
  if (s.includes("vroeg")) return DIENSTRANG.VROEG;
  if (s.includes("tussen")) return DIENSTRANG.TUSSEN;
  if (s.includes("avond") || s.includes("late")) return DIENSTRANG.LATE;
  if (s.includes("waak") || s.includes("wak-dienst") || s.includes("slaap")) return DIENSTRANG.WAAK;
  return DIENSTRANG.REST; // Vergadering, Boventallig, Training, MDO, ...
}

function comparePlanningItemsByTime(a, b) {
  // Eerst groeperen op vaste dagdeel-/diensttype-volgorde (user-eis)
  const ra = diensttypeRangIndex(a.diensttype || a.functie);
  const rb = diensttypeRangIndex(b.diensttype || b.functie);
  if (ra !== rb) return ra - rb;
  // Binnen 1-op-1-groep: alfabetisch op cliënt-naam (gegroepeerd per cliënt)
  if (ra === DIENSTRANG.EEN_OP_EEN) {
    const ca = String(a.client || a.clientNaam || a.cliënt || "").toLowerCase();
    const cb = String(b.client || b.clientNaam || b.cliënt || "").toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb, "nl", { sensitivity: "base" });
  }
  // Binnen "rest"-groep: alfabetisch op diensttype-naam
  if (ra === DIENSTRANG.REST) {
    const da = String(a.diensttype || "").toLowerCase();
    const db = String(b.diensttype || "").toLowerCase();
    if (da !== db) return da.localeCompare(db, "nl", { sensitivity: "base" });
  }
  // Binnen elke groep: tijd-volgorde
  const sa = parseStartDate(a.start);
  const sb = parseStartDate(b.start);
  const ta = sa ? sa.getTime() : Number.POSITIVE_INFINITY;
  const tb = sb ? sb.getTime() : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  const ea = parseStartDate(a.einde);
  const eb = parseStartDate(b.einde);
  const tea = ea ? ea.getTime() : Number.POSITIVE_INFINITY;
  const teb = eb ? eb.getTime() : Number.POSITIVE_INFINITY;
  if (tea !== teb) return tea - teb;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function getIsoWeek(weekStart) {
  const d = new Date(Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y) / 86400000 + 1) / 7);
}

function toIsoLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateTimeToLocalIso(dateStr, timeStr) {
  if (!dateStr || timeStr == null || timeStr === "") return "";
  const [Y, M, D] = dateStr.split("-").map((x) => parseInt(x, 10));
  const p = timeStr.split(":");
  const h = parseInt(p[0] || 0, 10);
  const m = parseInt(p[1] || 0, 10);
  if (Number.isNaN(Y) || Number.isNaN(M) || Number.isNaN(D)) return "";
  return toIsoLocal(new Date(Y, M - 1, D, h, m, 0, 0));
}

function readCompetentieNamen() {
  return readJsonArray("competenties")
    .filter((c) => !c.archived)
    .map((c) => String(c?.naam || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
}

function formatDateTime(value) {
  if (!value) return "—";
  // Via parseStartDate => wandklok (fake-UTC), niet +1/+2u door tz-conversie.
  const d = parseStartDate(value);
  if (!d) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeShort(value) {
  if (!value) return "";
  // Via parseStartDate => wandklok (fake-UTC), niet +1/+2u door tz-conversie.
  const d = parseStartDate(value);
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatHoursShort(h) {
  if (h <= 0) return "0u";
  const u = Math.floor(h);
  const m = Math.round((h - u) * 60);
  if (m === 0) return `${u}u`;
  return `${u}u ${m}m`;
}

function formatCompactHours(h) {
  if (h <= 0) return "0u";
  return `${h.toFixed(1).replace(".", ",")}u`;
}

function formatEuro(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function getPeriodLine() {
  if (ui.calMode === "day") {
    const d = ui.dayDate || new Date();
    return d.toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (ui.calMode === "week") {
    const w0 = ui.weekStart || getMonday(new Date());
    /* Stijl screenshot: "Week 17 April 2026" — week + maandnaam + jaar van de maandag */
    const month = w0.toLocaleString("nl-NL", { month: "long" });
    const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
    return `Week ${getIsoWeek(w0)} ${monthCap} ${w0.getFullYear()}`;
  }
  const m0 = startOfMonth(ui.monthDate || new Date());
  return m0.toLocaleString("nl-NL", { month: "long", year: "numeric" });
}

function getVisibleRange() {
  const now = new Date();
  if (ui.calMode === "day") {
    const d = new Date(ui.dayDate || now);
    d.setHours(0, 0, 0, 0);
    const e = addDays(d, 1);
    return { start: d, end: e };
  }
  if (ui.calMode === "week") {
    const s = new Date(ui.weekStart || getMonday(now));
    s.setHours(0, 0, 0, 0);
    return { start: s, end: addDays(s, 7) };
  }
  const m0 = startOfMonth(ui.monthDate || now);
  return { start: m0, end: addDays(m0, daysInMonth(m0)) };
}

function getColumnDates() {
  const r = getVisibleRange();
  if (ui.calMode === "day") {
    return [r.start];
  }
  if (ui.calMode === "week") {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(addDays(r.start, i));
    return out;
  }
  const n = daysInMonth(r.start);
  const out = [];
  for (let i = 0; i < n; i++) out.push(addDays(r.start, i));
  return out;
}

/** Open dienst = er is nog geen medewerker (teamlid) op de dienst ingepland. */
function isOpenDienst(it) {
  return !String((it && it.teamlid) || "").trim();
}

/** Bepaalt waaróm een dienst rood/aandacht is — voert de klikbare uitleg op het
 *  "!"-icoon (user-eis 2026-06-11: "als je op het uitroepteken drukt moet je zien
 *  wat het probleem is, niet zomaar 'open' terwijl er een medewerker ingepland zit").
 *  Geeft een lijst {type,label,detail} terug; leeg = geen waarschuwing. */
function getDienstWaarschuwingen(it, overlapIds) {
  const out = [];
  if (isOpenDienst(it)) {
    out.push({
      type: "open",
      label: "Openstaande dienst",
      detail: "Er is nog geen medewerker op deze dienst ingepland.",
    });
  }
  if (overlapIds && it && overlapIds.has(it.id)) {
    out.push({
      type: "overlap",
      label: "Dubbel ingeroosterd",
      detail: "Deze medewerker staat in dezelfde periode op meer dan één dienst ingepland.",
    });
  }
  if (it && it.conflict) {
    out.push({
      type: "aandacht",
      label: "Gemarkeerd als aandacht",
      detail: "Deze dienst is handmatig gemarkeerd als aandachtspunt.",
    });
  }
  return out;
}

function getRowKey(it) {
  const ax = ui.rowAxis || "afdeling";
  // BS2-parity: groupering op locatie (BS2 toont locatie-namen als group-headers).
  // Fallback naar locatie als vestiging leeg is (Phase 3 import vult vestiging niet).
  if (ax === "vestiging") {
    // Open diensten (nog geen medewerker ingepland) worden — los van hun locatie —
    // gebundeld onder "Openstaande diensten" zodat ze direct opvallen (user-eis
    // 2026-06-11: "open dienst → rood + onder het kopje Openstaande diensten, i.p.v.
    // alleen een rood vakje op de locatie").
    if (isOpenDienst(it)) return OPENSTAANDE_GROEP;
    // 1-op-1/ambulant en achterwacht krijgen — los van hun woonlocatie — een eigen
    // kop-groep, zodat ze gebundeld onder één kopje verschijnen (user-eis 2026-06-06).
    const dt = it.diensttype || it.functie;
    if (isAchterwachtDienst(dt)) return ACHTERWACHT_GROEP;
    if (isEenOpEenDienst(dt)) return EEN_OP_EEN_GROEP;
    return (it.vestiging || it.locatie || "").trim() || "Onbekende locatie";
  }
  if (ax === "medewerker") return (it.teamlid || "—").trim() || "—";
  if (ax === "functie") return (it.functie || it.diensttype || "—").trim() || "—";
  return (it.afdeling || it.diensttype || "Overig").trim() || "Overig";
}

/** Effectieve locatie-groep van een dienst — identiek aan de rooster-groepering in
 *  getRowKey (vestiging-as): open diensten, 1-op-1/ambulant en achterwacht krijgen
 *  hun eigen kop-groep, de rest valt op (vestiging || locatie). Het toolbar-
 *  locatiefilter matcht hierop, zodat elke geselecteerde locatie exact de rijen toont
 *  die ook onder die kop in het rooster verschijnen. (Spraakmemo eigenaar 2026-06-11:
 *  het filter matchte alleen op `vestiging` — vrijwel altijd leeg bij de BS2-import —
 *  waardoor één locatie kiezen NIETS toonde; de locatienaam zit in `locatie`.) */
function effectiveLocatie(row) {
  if (isOpenDienst(row)) return OPENSTAANDE_GROEP;
  const dt = row.diensttype || row.functie;
  if (isAchterwachtDienst(dt)) return ACHTERWACHT_GROEP;
  if (isEenOpEenDienst(dt)) return EEN_OP_EEN_GROEP;
  return (row.vestiging || row.locatie || "").trim() || "Onbekende locatie";
}

function makePlanningId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDataState() {
  const heldBack = getHeldBackPlanningNames();
  // Verberg medewerkers die uitsluitend op kantoor/overhead-locaties zijn ingedeeld.
  const zichtbaar = (typeof window.besaMwZichtbaarInPlanning === "function") ? window.besaMwZichtbaarInPlanning : () => true;
  const employees = readEmployees().filter((e) => !heldBack.has(getEmployeeName(e).toLowerCase()) && zichtbaar(e));
  const medewerkers = employees.map(getEmployeeName).filter(Boolean);
  const teamlead = employees
    .filter((emp) => /teamlead|teamleider|zorgco.?rdinator/i.test(String(emp?.functie || "")))
    .map(getEmployeeName)
    .filter(Boolean);
  const teamleden = employees
    .filter((emp) => !/teamlead|teamleider|zorgco.?rdinator/i.test(String(emp?.functie || "")))
    .map(getEmployeeName)
    .filter(Boolean);
  const mSorted = [...new Set(medewerkers)].sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
  const tl = teamlead.length > 0 ? [...new Set(teamlead)] : mSorted.slice(0, 1);
  const tm = teamleden.length > 0 ? [...new Set(teamleden)] : mSorted;
  const items = readPlanningItems();
  const afd = new Set(DEFAULT_AFDELINGEN);
  items.forEach((it) => afd.add(it.afdeling || "Overig"));
  const locs = new Set();
  const vest = new Set();
  const hrVestigingen = readVestigingsNamen();
  hrVestigingen.forEach((v) => vest.add(v));
  items.forEach((it) => {
    if (it.vestiging) vest.add(it.vestiging);
    const loc = String(it.locatie || "").trim();
    locs.add(loc || "—");
  });
  if (locs.size === 0) locs.add("—");

  return {
    diensttypes: readDiensttypes(),
    clienten: readClienten(),
    medewerkers: mSorted,
    teamlead: tl.sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" })),
    teamleden: tm.sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" })),
    afdelingen: Array.from(afd).sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" })),
    hrVestigingen,
    vestigingen: Array.from(vest).sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" })),
    locaties: Array.from(locs).sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" })),
  };
}

function ensurePlanningSeed() {
  // GEEN demo-seed meer. De planning toont uitsluitend de echte Supabase-data via
  // planningDB. De oude demo-seed genereerde nep retail-diensten (Winkel/Logistiek/
  // Kassa/Shop … + een bewuste dubbele inroostering) die de echte planning verborgen
  // én via pushFullCache als 'plan-…'-rijen in Supabase belandden. Bewust verwijderd.
  return readPlanningItems();
}

function clearAllPlannedDiensten() {
  try {
    window.localStorage.setItem(PLANNING_NO_DEMO_SEED_KEY, "1");
  } catch {
    /* */
  }
  writePlanningItems([]);
  renderAllViews();
}

function renderFilterList(containerId, type, values) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const list = values.length ? values : ["(geen gegevens)"];
  list.forEach((value) => {
    if (value === "(geen gegevens)") {
      const p = document.createElement("p");
      p.className = "planning-filter-hint";
      p.textContent = "Nog geen data — voeg in HR of planning toe.";
      container.appendChild(p);
      return;
    }
    const id = `pf-${type}-${String(value)
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 48)}`;
    const wrap = document.createElement("label");
    wrap.className = "planning-filter-option";
    wrap.htmlFor = id;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = filterState[type].has(value);
    cb.addEventListener("change", () => {
      if (cb.checked) filterState[type].add(value);
      else filterState[type].delete(value);
      renderAllViews();
    });
    const txt = document.createElement("span");
    txt.textContent = value;
    wrap.append(cb, txt);
    container.appendChild(wrap);
  });
}

function rowMatchesFilters(row) {
  if (filterState.afdeling.size && !filterState.afdeling.has(row.afdeling)) return false;
  if (filterState.diensttypes.size) {
    const parts = rowDiensttypeLabels(row);
    const has = parts.some((p) => filterState.diensttypes.has(p));
    if (!has) return false;
  }
  if (filterState.teamlead.size && !filterState.teamlead.has(row.teamlead)) return false;
  if (filterState.teamleden.size && !filterState.teamleden.has(row.teamlid)) return false;
  if (filterState.clienten.size && !filterState.clienten.has(row.client)) return false;
  if (filterState.vestiging.size && !filterState.vestiging.has(String(row.vestiging || "").trim())) return false;
  if (filterState.locatie.size) {
    const locLabel = String(row.locatie || "").trim() || "—";
    if (!filterState.locatie.has(locLabel)) return false;
  }
  if (filterState.medewerkers.size) {
    const okM =
      filterState.medewerkers.has(row.teamlid) || filterState.medewerkers.has(row.teamlead);
    if (!okM) return false;
  }

  /* Toolbar-locatiefilter (single select). Matcht op de effectieve locatie-groep
     (vestiging || locatie + speciale groepen), consistent met de rooster-indeling —
     niet enkel op `vestiging`, dat bij de BS2-import vrijwel altijd leeg is. */
  if (filterState.locatieToolbar) {
    if (effectiveLocatie(row) !== filterState.locatieToolbar) return false;
  }
  /* Single-select Teamlid (uit zijbalk). */
  if (filterState.teamlid) {
    if (String(row.teamlid || "").trim() !== filterState.teamlid) return false;
  }
  /* Single-select Cliënt (uit zijbalk). */
  if (filterState.client) {
    if (String(row.client || "").trim() !== filterState.client) return false;
  }
  /* Toewijzingsstatus radio. */
  const st = filterState.assignStatus || "alle";
  if (st !== "alle") {
    const teamlid = String(row.teamlid || "").trim();
    const isAssigned = teamlid !== "";
    const wantsReplacement = Boolean(row.vervangingVereist);
    if (st === "toegewezen" && !isAssigned) return false;
    if (st === "niet" && isAssigned) return false;
    if (st === "vervanging" && !wantsReplacement) return false;
  }

  /* Module 2 Bug #87 fix: Dienstverband filter (Inhuur / Loondienst / alle).
   * Gebruikt nieuwe getDienstverbandForName() helper die BS2 employment_type leest. */
  const empType = filterState.employmentType || "alle";
  if (empType !== "alle") {
    const dv = getDienstverbandForName(row.teamlid);
    if (empType === "inhuur" && dv !== "inhuur") return false;
    if (empType === "loondienst" && dv !== "loondienst") return false;
  }

  const q = filterState.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.afdeling,
    row.diensttype,
    row.functie,
    row.teamlead,
    row.teamlid,
    row.client,
    row.vestiging,
    row.locatie,
    row.start,
    row.einde,
  ]
    .map((x) => String(x || ""))
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/* ── Eigen-diensten-scope voor de werkvloer (video-eis eigenaar 2026-06-07) ───
 * Een zuivere Medewerker-rol (géén kantoor-/planner-/admin-rol) mag in de
 * planning UITSLUITEND zijn eigen diensten zien — een read-only rooster, niet
 * de volledige planner-view. Kantoor/planner/admin houden de volledige planning.
 * Fail-safe: kan de eigen naam niet bepaald worden (ontkoppeld profiel of rollen
 * nog niet geladen) → geen scope-filter (status quo), zodat niemand met een lege
 * planning achterblijft. RLS blijft op termijn de echte muur. */
var PLANNING_FULL_ROLES = [
  "Eigenaar", "Admin", "Directeur", "HR", "Planner", "Zorgcoördinator",
  "Finance", "Salarisadministratie", "Beleid", "Facilitair",
  "Gedragswetenschapper", "Cliëntbeheer",
];

/* ── Bewerk-recht los van zie-recht (video-eis eigenaar 2026-06-07) ───────────
 * HR + Facilitair moeten de planning als KIJK-overzicht van álle medewerkers
 * zien ("een overzicht van alle medewerkers op de locaties, meer een kijkfunctie
 * in plaats van een bewerkfunctie" / "alleen overzicht van de planning, wie er
 * werkt"). Daarom blijven ze in PLANNING_FULL_ROLES (volledige SCOPE = alles
 * zien) maar staan ze NIET in PLANNING_EDIT_ROLES, zodat de read-only-modus
 * aangaat: dienst aanmaken/genereren + de detail-paneel-acties (toewijzen/
 * uitnodigen/bewerken/verwijderen) worden verborgen en gegate. Alle overige
 * full-planner-rollen behouden hun huidige bewerk-UI (geen regressie). */
var PLANNING_EDIT_ROLES = [
  "Eigenaar", "Admin", "Directeur", "Planner", "Zorgcoördinator",
  "Finance", "Salarisadministratie", "Beleid",
  "Gedragswetenschapper", "Cliëntbeheer",
];

function planningCanEdit() {
  try {
    if (typeof window.besaIsAdminTier === "function" && window.besaIsAdminTier()) return true;
    var roles = (window.besaPermissions && typeof window.besaPermissions.getRoleNames === "function")
      ? (window.besaPermissions.getRoleNames() || []) : [];
    if (!roles.length) return true; // rollen nog niet geladen → niet onterecht afschermen
    for (var i = 0; i < roles.length; i++) {
      if (PLANNING_EDIT_ROLES.indexOf(roles[i]) !== -1) return true;
    }
    return false;
  } catch (e) { return true; }
}
// Globaal beschikbaar zodat dienst-detail.js de paneel-acties kan gaten.
try { window.besaPlanningCanEdit = planningCanEdit; } catch (e) { /* */ }

function planningIsFullPlanner() {
  try {
    if (typeof window.besaIsAdminTier === "function" && window.besaIsAdminTier()) return true;
    var roles = (window.besaPermissions && typeof window.besaPermissions.getRoleNames === "function")
      ? (window.besaPermissions.getRoleNames() || []) : [];
    if (!roles.length) return true; // rollen nog niet geladen → niet onterecht afschermen
    for (var i = 0; i < roles.length; i++) {
      if (PLANNING_FULL_ROLES.indexOf(roles[i]) !== -1) return true;
    }
    return false;
  } catch (e) { return true; }
}

function planningOwnName() {
  if (planningIsFullPlanner()) return "";
  try {
    var prof = (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function")
      ? window.profilesDB.getCurrentSync() : null;
    var medId = prof && (prof.medewerkerId || prof.medewerker_id);
    if (!medId || !window.medewerkersDB || typeof window.medewerkersDB.getByIdSync !== "function") return "";
    var mw = window.medewerkersDB.getByIdSync(medId);
    if (!mw) return "";
    var naam = [mw.voornaam, mw.achternaam].filter(Boolean).join(" ").trim() || String(mw.naam || "").trim();
    return naam.toLowerCase();
  } catch (e) { return ""; }
}

/* ── Locatie-scope voor de werkvloer (spraakmemo eigenaar 2026-06-11) ──────────
 * Een zuivere Medewerker moet niet langer enkel zíjn eigen diensten zien, maar het
 * VOLLEDIGE rooster van de locatie(s) waar hij bevoegd is te werken: alle collega's
 * die er staan ingepland (ook op dagen dat hij zelf vrij is) én alle openstaande
 * diensten op die locaties, zodat hij daarop kan reageren. De koppeling
 * medewerker→locatie staat server-side in `medewerker_locaties` (dezelfde tabel die
 * de cliënten-RLS al locatie-scoopt). De planning-data is client-side niet
 * RLS-gescoopt, dus we halen de toegestane locatie-namen apart op en filteren het
 * rooster daarop. Fail-safe: zolang de koppeling (nog) niet bekend is, valt
 * getBaseFiltered terug op de eigen-diensten-scope (status quo) — nooit het hele
 * org-rooster lekken, nooit met een lege planning achterblijven. */
var planningOwnLocaties = null;        // Set<string> (lowercased locatie-namen) of null = nog niet geladen
var planningOwnLocatiesForMed = null;  // medewerker-id waarvoor de set geladen is (dedup)

function planningOwnMedId() {
  try {
    var prof = (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function")
      ? window.profilesDB.getCurrentSync() : null;
    return (prof && (prof.medewerkerId || prof.medewerker_id)) || null;
  } catch (e) { return null; }
}

/* Async: laad de locatie-namen waar de ingelogde medewerker aan gekoppeld is en
 * her-render zodra ze binnen zijn. Voor full-planners (alles-zien-rollen) is dit
 * een no-op — die houden de volledige planner-view. */
function loadPlanningOwnLocaties() {
  try {
    if (planningIsFullPlanner()) { planningOwnLocaties = null; planningOwnLocatiesForMed = null; return; }
    var medId = planningOwnMedId();
    if (!medId) return;                                   // profiel nog niet geladen → later opnieuw
    if (planningOwnLocatiesForMed === medId && planningOwnLocaties) return; // al geladen voor deze medewerker
    var sb = window.besaSupabase;
    if (!sb || typeof sb.from !== "function") return;     // client nog niet klaar → later opnieuw
    planningOwnLocatiesForMed = medId;
    sb.from("medewerker_locaties")
      .select("locaties(naam)")
      .eq("medewerker_id", medId)
      .then(function (res) {
        if (res && res.error) { planningOwnLocatiesForMed = null; return; }
        var names = new Set();
        (res && res.data ? res.data : []).forEach(function (row) {
          var naam = row && row.locaties && row.locaties.naam;
          if (naam) names.add(String(naam).toLowerCase().trim());
        });
        planningOwnLocaties = names;
        try { renderAllViews(); } catch (e) { /* */ }
      }, function () { planningOwnLocatiesForMed = null; });
  } catch (e) { /* stil: fallback op eigen-scope blijft gelden */ }
}

/* De set toegestane locatie-namen (lowercased) of null wanneer (nog) onbekend. */
function planningOwnLocatieSet() {
  if (planningIsFullPlanner()) return null;
  return (planningOwnLocaties && planningOwnLocaties.size) ? planningOwnLocaties : null;
}

/* Toggelt de read-only-rooster-modus (verbergt planner-UI: dienst aanmaken,
 * KPI-strip, beschikking-overschrijdingsbanner én de detail-paneel-acties) voor
 * rollen zonder bewerk-recht. SCOPE (alles vs eigen) blijft op planningIsFullPlanner
 * (HR/Facilitair zien alles); BEWERKEN op planningCanEdit (HR/Facilitair niet).
 *
 * VEILIGE DEFAULT: zolang de permissies nog NIET geladen zijn (koude cache /
 * eerste login) blijft de planning READ-ONLY. Pas wanneer de DB-permissies geladen
 * zijn ÉN bewerk-recht bevestigen, wordt read-only opgeheven. Zo kan een rol zonder
 * bewerk-recht (HR/Facilitair/werkvloer) NOOIT — ook niet kortstondig tijdens de
 * async permissie-load — de planner-bewerk-UI te zien krijgen. De functie wordt
 * her-aangeroepen zodra permissies/planning-data binnen zijn (besaPermissionsReady,
 * besa:planning-updated, besa:profile-updated, besa:medewerkers-updated). */
function applyPlanningRoleMode() {
  try {
    var loaded = !!(window.besaPermissions && typeof window.besaPermissions.debug === "function"
      && window.besaPermissions.debug().loaded);
    var canEdit = loaded ? planningCanEdit() : false; // niet-geladen → read-only (veilig)
    document.body.classList.toggle("planning-readonly", !canEdit);
  } catch (e) {
    try { document.body.classList.add("planning-readonly"); } catch (e2) { /* */ }
  }
}

function getBaseFiltered() {
  var rows = readPlanningItems().filter(rowMatchesFilters);
  if (planningIsFullPlanner()) return rows; // kantoor/planner/admin: volledige planner-view
  var locs = planningOwnLocatieSet();        // Set<string> locatie-namen, of null
  var own = planningOwnName();               // eigen naam (lowercased), of ""
  if (locs) {
    // Werkvloer met bekende locatie-koppeling: toon het VOLLEDIGE rooster van die
    // locatie(s) — alle ingeplande collega's én openstaande diensten — plus de
    // eigen diensten (ook als die op een andere locatie vallen).
    rows = rows.filter(function (row) {
      var loc = String(row.locatie || row.vestiging || "").toLowerCase().trim();
      if (loc && locs.has(loc)) return true;
      if (own && String(row.teamlid || "").toLowerCase().trim() === own) return true;
      return false;
    });
  } else if (own) {
    // Geen locatie-koppeling bekend (ontkoppeld profiel, of nog niet geladen):
    // veilige terugval op de eigen-diensten-scope (status quo).
    rows = rows.filter(function (row) {
      return String(row.teamlid || "").toLowerCase().trim() === own;
    });
  }
  return rows;
}

function getItemsForView() {
  const all = getBaseFiltered();
  const { start, end } = getVisibleRange();
  return all.filter((row) => itemOverlapsRange(row, start, end));
}

/** Schat ZZP-kosten: alleen meetellen wanneer medewerker als ZZP gemarkeerd is in HR.
 *  Module 2 Bug #88 fix: BS2-import-data zit in `bs2_employment_type` veld
 *  (waardes: hiring/permanent/intern). 'hiring' = inhuur/ZZP. */
function isZzpEmployeeName(name) {
  if (!name) return false;
  const want = String(name).trim().toLowerCase();
  if (!want) return false;
  const list = readEmployees();
  return list.some((emp) => {
    const n = getEmployeeName(emp).toLowerCase();
    if (n !== want) return false;
    const empType = String(emp?.bs2_employment_type || emp?.employmentType || "").trim().toLowerCase();
    if (empType === "hiring") return true;
    const flags = [
      emp?.zzp,
      emp?.isZzp,
      emp?.zzper,
      emp?.dienstverband,
      emp?.contracttype,
      emp?.contractsoort,
      emp?.bs2_worker_type,
      emp?.bs2_hiring_type,
    ];
    // 'inhuur' meenemen: in de medewerker-cache staat het dienstverband als "Inhuur"
    // (uit bs2_employment_type=hiring), terwijl dit gate-filter dat woord eerder niet
    // herkende — waardoor ZZP-diensten niet als ZZP telden en de ZZP-kosten op 0 bleven.
    // Nu consistent met getDienstverbandForName/getZzpHourlyRateForName (/inhuur|zzp|agency/).
    return flags.some((f) => /zzp|hiring|agency|inhuur/i.test(String(f || "")));
  });
}

/** Module 2 Bug #87 helper: bepaal Inhuur vs Loondienst voor medewerker-naam.
 *  Returns "inhuur" / "loondienst" / "" (onbekend). */
function getDienstverbandForName(name) {
  if (!name) return "";
  const want = String(name).trim().toLowerCase();
  if (!want) return "";
  const list = readEmployees();
  const emp = list.find((e) => getEmployeeName(e).toLowerCase() === want);
  if (!emp) return "";
  const t = String(emp.bs2_employment_type || emp.employmentType || emp.dienstverband || "").trim().toLowerCase();
  if (t === "hiring") return "inhuur";
  if (t === "permanent") return "loondienst";
  if (/inhuur|zzp|agency/.test(t)) return "inhuur";
  if (/loondienst|loon|vast/.test(t)) return "loondienst";
  return "";
}

/** Robuust uurtarief uit een HR-veld lezen. De data staat doorgaans als schone
 *  punt-decimaal ("42.00"), maar HR kan ook vrij typen ("€ 47,50", "1.234,56").
 *  Komma aanwezig → NL-notatie (punt = duizendtal, komma = decimaal); anders is de
 *  punt het decimaalteken (zodat "42.00" 42 blijft, niet 4200 wordt). */
function parseUurtarief(v) {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : 0;
  let t = String(v).replace(/€/gi, "").replace(/\s/g, "").trim();
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? n : 0;
}

// F8: zoek ZZP-uurtarief per medewerker-naam uit medewerkers.data.uurAlgemeen
function getZzpHourlyRateForName(name) {
  if (!name) return 0;
  const list = readEmployees();
  const want = String(name).trim().toLowerCase();
  if (!want) return 0;
  const emp = list.find((e) => getEmployeeName(e).toLowerCase() === want);
  if (!emp) return 0;
  // BS2: hiring=ZZP. Alleen ZZP-tarief tellen.
  const empType = String(emp.bs2_employment_type || emp.employmentType || emp.dienstverband || "").toLowerCase();
  const isHiring = empType === "hiring" || /inhuur|zzp|agency/.test(empType);
  if (!isHiring) return 0;
  const r = parseUurtarief(emp.uurAlgemeen != null && emp.uurAlgemeen !== "" ? emp.uurAlgemeen : emp.uurTarief);
  return r > 0 ? r : 0;
}

// G5: personeelskostprijs per uur per medewerker (werkelijke werkgeverskost, niet
// het diensttype-charge-tarief). Loondienst: uurkostprijsNum (bruto × werkgevers-
// lasten / uren). ZZP: uurAlgemeen/uurTarief. 0 als onbekend → die uren tellen niet
// mee in de personeelskosten (indicatief; groeit naarmate HR salarisdata invult).
function getPersoneelsUurkostForName(name) {
  if (!name) return 0;
  const list = readEmployees();
  const want = String(name).trim().toLowerCase();
  if (!want) return 0;
  const emp = list.find((e) => getEmployeeName(e).toLowerCase() === want);
  if (!emp) return 0;
  const dv = getDienstverbandForName(name);
  if (dv === "inhuur") {
    const r = parseUurtarief(emp.uurAlgemeen != null && emp.uurAlgemeen !== "" ? emp.uurAlgemeen : emp.uurTarief);
    return r > 0 ? r : 0;
  }
  // loondienst (of onbekend): werkelijke uurkostprijs uit het dossier
  const k = Number(emp.uurkostprijsNum != null ? emp.uurkostprijsNum : (emp.data && emp.data.uurkostprijsNum));
  return isFinite(k) && k > 0 ? k : 0;
}

/* De functie in de planning moet de HR-functie van de ingeroosterde medewerker
 * zijn (zoals ingevoerd bij HR onder Professioneel), niet een los dienst-veld.
 * Bouw één keer per render een naam→functie-index uit de canonieke medewerkers-
 * bron. Faalt veilig: bij ontbrekende data een lege map → kolom toont "—". */
function buildNaamFunctieMap() {
  const map = new Map();
  try {
    const meds = (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function")
      ? (window.medewerkersDB.getAllSync() || [])
      : [];
    meds.forEach((m) => {
      const naam = getEmployeeName(m).toLowerCase();
      if (!naam) return;
      const f = String(m.functie || "").trim();
      if (f && f !== "—") map.set(naam, f);
    });
  } catch (e) { /* lege map = veilige fallback */ }
  return map;
}

/** HR-functie van de medewerker die op deze dienst staat (op naam gematcht). */
function functieVoorTeamlid(naam, map) {
  const want = String(naam || "").trim().toLowerCase();
  if (!want) return "";
  const m = map || buildNaamFunctieMap();
  return m.get(want) || "";
}

function getMetrics(items) {
  let hours = 0;
  let zzpHours = 0;
  let zzpKostenAccum = 0;   // Module 2 Bug #88: ZZP-kosten per-diensttype via comp_diensttypes.basis
  let kostenAccum = 0;       // Totaal kosten per-diensttype (alle medewerkers)
  let kmKosten = 0;
  let kmTotaal = 0;          // Totaal gereden kilometers (aantal, niet kosten)
  let openHours = 0;
  let openCount = 0;
  let zzpRateWeighted = 0;   // F8: som(uren × medewerker.uurAlgemeen) voor ZZP'ers
  let zzpRateHours = 0;      // F8: som(uren waar medewerker-tarief bekend)
  let personeelsKosten = 0;  // G5: werkelijke werkgeverskost (uurkostprijsNum / ZZP-tarief)
  let personeelsKostenHours = 0; // uren met bekende uurkostprijs (voor dekkingsindicatie)

  // Diensttype-tarief lookup via comp_diensttypes.basis (per-type uurtarief).
  function tariefForDiensttype(dtNaam) {
    if (!dtNaam) return ui.tarief || 0;
    try {
      if (window.compDiensttypesDB && typeof window.compDiensttypesDB.getAllSync === "function") {
        const list = window.compDiensttypesDB.getAllSync() || [];
        const dt = list.find((d) => String(d.naam || d.diensttype || "").trim().toLowerCase() === String(dtNaam).trim().toLowerCase());
        const basis = Number(dt?.basis);
        if (basis > 0) return basis;
      }
    } catch (e) { /* */ }
    return ui.tarief || 0;
  }

  items.forEach((r) => {
    const h = durationHours(r.start, r.einde);
    const pauze = Math.max(0, Number(r.pauzeUren) || 0);
    const net = Math.max(0, h - pauze);
    hours += net;

    const tarief = tariefForDiensttype(r.diensttype);
    kostenAccum += net * tarief;
    if (isZzpEmployeeName(r.teamlid)) {
      zzpHours += net;
      // ZZP-kosten = het in HR ingevoerde uurtarief van de ZZP'er × de gewerkte
      // (netto) uren — overgenomen uit HR (medewerker.uurAlgemeen), niet het
      // diensttype-charge-tarief (spraakmemo eigenaar 2026-06-11: "de kosten van de
      // ZZP'ers zoals ingevoerd in HR moeten in de planning verrekend worden met de
      // uren die ze werken"). Valt op 0 terug als er voor die ZZP'er nog geen tarief
      // in HR staat, zodat het bedrag meegroeit naarmate HR de tarieven invult.
      const zzpRate = getZzpHourlyRateForName(r.teamlid);
      zzpKostenAccum += net * zzpRate;
      if (zzpRate > 0 && net > 0) {
        zzpRateWeighted += net * zzpRate;
        zzpRateHours += net;
      }
    }
    // G5: werkelijke personeelskosten op basis van uurkostprijs per medewerker.
    if (r.teamlid && String(r.teamlid).trim()) {
      const pk = getPersoneelsUurkostForName(r.teamlid);
      if (pk > 0 && net > 0) {
        personeelsKosten += net * pk;
        personeelsKostenHours += net;
      }
    }
    if (!r.teamlid || !String(r.teamlid).trim()) {
      openHours += net;
      openCount += 1;
    }
    const km = Number(r.kilometers) || 0;
    // PR-F: km-tarief uit planning_settings i.p.v. hardcoded 0.23
    const settingsTar = (window.planningSettingsDB && window.planningSettingsDB.getSync && window.planningSettingsDB.getSync())?.km_tarief;
    const kmTar = Number(r.kmTarief) || Number(settingsTar) || 0.23;
    if (km > 0) { kmKosten += km * kmTar; kmTotaal += km; }
  });
  const uren = formatHoursShort(hours);
  const openUren = formatHoursShort(openHours);
  const kosten = kostenAccum;
  const zzpKosten = zzpKostenAccum;
  const per = items.length > 0 ? kosten / items.length : 0;
  const gemTarief = hours > 0 ? kosten / hours : ui.tarief;
  // F8: gemiddeld ZZP-uurtarief (null als geen ZZP-uren met bekend tarief)
  const gemZzpTarief = zzpRateHours > 0 ? zzpRateWeighted / zzpRateHours : null;
  return {
    count: items.length,
    hours,
    uren,
    zzpHours,
    zzpUren: formatHoursShort(zzpHours),
    openHours,
    openUren,
    openCount,
    kosten,
    zzpKosten,
    kmKosten,
    kmTotaal,
    per,
    gemTarief,
    gemZzpTarief,
    personeelsKosten,
    personeelsKostenHours,
    tarief: ui.tarief,
  };
}

/** Toon kilometers als afgerond geheel getal met "km"-suffix (bv. "128 km"). */
function formatKmCount(km) {
  const n = Math.round(Number(km) || 0);
  return `${n.toLocaleString("nl-NL")} km`;
}

function renderSummary(items) {
  const el = document.getElementById("planning-summary");
  if (!el) return;
  const m = getMetrics(items);
  // Sprint 6 / S6: 5 KPI cards (mirror BS2). Volgorde: ZZP, Geplande uren,
  // Openstaande uren, Kilometerkosten, Gem. tarief.
  el.innerHTML = `
    <div class="planning-kpi planning-kpi--v3 planning-kpi--zzp" title="ZZP-kosten = het in HR ingevoerde uurtarief per ZZP'er × de gewerkte uren in deze periode. Groeit mee naarmate HR de tarieven invult.">
      <span class="planning-kpi-ico" aria-hidden="true">€</span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">ZZP Kosten</span>
        <strong class="planning-stat-value planning-stat-value--money">${formatEuro(m.zzpKosten)}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--uren">
      <span class="planning-kpi-ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
        </svg>
      </span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Geplande uren</span>
        <strong class="planning-stat-value">${m.uren}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--zzpuren" title="Uren die door ZZP'ers / inhuur worden ingezet in deze periode.">
      <span class="planning-kpi-ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
        </svg>
      </span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">ZZP-uren</span>
        <strong class="planning-stat-value">${m.zzpUren}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--open">
      <span class="planning-kpi-ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="currentColor"/>
        </svg>
      </span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Openstaande uren</span>
        <strong class="planning-stat-value">${m.openUren}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--opencount${m.openCount > 0 ? " is-actief" : ""}" title="Aantal diensten zonder ingeplande medewerker in deze periode — direct in te vullen onder het kopje 'Openstaande diensten'.">
      <span class="planning-kpi-ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
        </svg>
      </span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Open diensten</span>
        <strong class="planning-stat-value">${m.openCount}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--km">
      <span class="planning-kpi-ico" aria-hidden="true">€</span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Kilometerkosten</span>
        <strong class="planning-stat-value planning-stat-value--money">${formatEuro(m.kmKosten)}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--kmcount" title="Totaal aantal gereden kilometers in deze periode.">
      <span class="planning-kpi-ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 17h2l1-5h12l1 5h2"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/>
        </svg>
      </span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Kilometers</span>
        <strong class="planning-stat-value">${formatKmCount(m.kmTotaal)}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--tarief">
      <span class="planning-kpi-ico" aria-hidden="true">€/u</span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Gem. tarief</span>
        <strong class="planning-stat-value planning-stat-value--money">${formatEuro(m.gemTarief)}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--zzptarief">
      <span class="planning-kpi-ico" aria-hidden="true">€/u</span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Gem. ZZP-tarief</span>
        <strong class="planning-stat-value planning-stat-value--money">${m.gemZzpTarief != null ? formatEuro(m.gemZzpTarief) : "—"}</strong>
      </div>
    </div>
    <div class="planning-kpi planning-kpi--v3 planning-kpi--personeelskosten" title="Werkelijke werkgeverskost op basis van de ingevulde uurkostprijs per medewerker (indicatief; groeit naarmate salarisgegevens compleet zijn).">
      <span class="planning-kpi-ico" aria-hidden="true">€</span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Personeelskosten (indicatief)</span>
        <strong class="planning-stat-value planning-stat-value--money">${m.personeelsKostenHours > 0 ? formatEuro(m.personeelsKosten) : "—"}</strong>
      </div>
    </div>
  `;
}

/** Per-locatie KPI's voor in de rij-label (ZZP-kosten, uren, KK). */
function getRowMetrics(rowItems) {
  return getMetrics(rowItems);
}

function updatePeriodUI() {
  const el = document.getElementById("planning-erm-period-line");
  if (el) el.textContent = getPeriodLine();
}

function groupItems(items) {
  const m = new Map();
  items.forEach((it) => {
    const g = getRowKey(it);
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(it);
  });
  return Array.from(m.keys()).sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
}

function sortLocatieGroepen(groups) {
  const rank = new Map();
  PLANNING_LOCATIE_VOLGORDE.forEach((name, idx) => rank.set(name.toLowerCase(), idx));
  // Eén-op-één en Achterwacht horen ALTIJD als laatste twee — ook ná onbekende
  // locaties (bijv. kantoor/satelliet die niet in de vaste volgorde staan).
  const BIG = Number.MAX_SAFE_INTEGER;
  const rangVan = (g) => {
    const k = String(g || "").trim().toLowerCase();
    if (k === ACHTERWACHT_GROEP.toLowerCase()) return BIG;       // allerlaatste
    if (k === EEN_OP_EEN_GROEP.toLowerCase()) return BIG - 1;    // net daarvoor
    return rank.has(k) ? rank.get(k) : BIG - 2;                  // onbekend: vóór de speciale groepen
  };
  return [...groups].sort((a, b) => {
    const ra = rangVan(a);
    const rb = rangVan(b);
    if (ra !== rb) return ra - rb;
    return String(a || "").localeCompare(String(b || ""), "nl", { sensitivity: "base" });
  });
}

/** Set van locatienamen (lowercase) die de planning mag tonen: de niet-verborgen,
 *  niet-gearchiveerde cliëntwoningen uit de Locaties-module. */
function planningZichtbareLocatieSet() {
  const s = new Set();
  readHrLocaties().forEach((l) => {
    const k = String(l.naam || "").trim().toLowerCase();
    if (k) s.add(k);
  });
  return s;
}

/** Mag deze locatie-/groep-naam als rij in het rooster verschijnen? Alleen de
 *  cliëntwoningen plus de vaste functionele groepen (Openstaande diensten,
 *  Eén-op-één/Ambulant, Achterwacht). Houdt test-/overhead-locaties (showroom,
 *  shop, kantoor, satellietwoning, …) volledig uit de planner-weergave —
 *  eigenaarseis 2026-06-11. */
function isPlanningZichtbareGroep(name) {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return false;
  if (k === "openstaande diensten") return true;
  if (k === EEN_OP_EEN_GROEP.toLowerCase()) return true;
  if (k === ACHTERWACHT_GROEP.toLowerCase()) return true;
  return planningZichtbareLocatieSet().has(k);
}

/** Dienst overlapt op tijdlijn (zelfde medewerker) — duidt risico in het rooster. */
function buildOverlapConflictIds(scopeItems) {
  const ids = new Set();
  const norm = (s) => String(s || "").trim().toLowerCase();
  const rows = scopeItems
    .map((it) => {
      const s = parseStartDate(it.start);
      const e = parseStartDate(it.einde);
      return { it, s, e, who: norm(it.teamlid) };
    })
    .filter((r) => r.s && r.e && r.who);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].who !== rows[j].who) continue;
      if (rows[i].s < rows[j].e && rows[j].s < rows[i].e) {
        ids.add(rows[i].it.id);
        ids.add(rows[j].it.id);
      }
    }
  }
  return ids;
}

function renderMonthStrip() {
  const wrap = document.getElementById("planning-erm-monthstrip-wrap");
  const el = document.getElementById("planning-erm-monthstrip");
  if (!wrap || !el) return;
  if (ui.isList || ui.calMode !== "month") {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  el.innerHTML = "";
  const m0 = startOfMonth(ui.monthDate || new Date());
  const n = daysInMonth(m0);
  for (let i = 0; i < n; i++) {
    const d = addDays(m0, i);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "planning-erm-monthstrip-day";
    b.textContent = String(d.getDate());
    if (isToday(d)) b.classList.add("is-today");
    b.addEventListener("click", () => {
      ui.overlapOnly = false;
      ui.dayDate = new Date(d);
      setListMode(false);
      setCalMode("day");
      renderAllViews();
    });
    el.appendChild(b);
  }
}

/* Window-resize-handler die de maand-board-hoogte herberekent en fitMonthCells
   opnieuw draait, zodat de hele maand in beeld blijft bij venster-resize. */
let monthFitResizeHandler = null;

function renderMonthCalendar(host, items, overlapIds) {
  const monthStart = startOfMonth(ui.monthDate || new Date());
  const monthEnd = addDays(monthStart, daysInMonth(monthStart));
  const gridStart = getMonday(monthStart);
  /* Alleen de weken tonen die een dag van déze maand bevatten (4, 5 of 6 rijen,
     afhankelijk van de maand) — geen lege trailing-week. Zo krijgt elke weekrij meer
     hoogte en blijven de dagen beter leesbaar binnen het ene-scherm-beeld. */
  const lastVisible = addDays(getMonday(addDays(monthEnd, -1)), 7);
  const days = [];
  for (let d = new Date(gridStart); d < lastVisible; d = addDays(d, 1)) days.push(new Date(d));
  const weekCount = Math.max(1, Math.round(days.length / 7));

  const board = document.createElement("div");
  /* Volledige maand in één beeld (gebruikerseis 2026-06-11): het kalender-board
     vult de beschikbare hoogte onder de toolbar en de weekrijen delen die hoogte
     gelijk (1fr), zodat álle weken — dag 1 t/m einde maand — samen op het scherm
     passen zonder pagina-scroll. De 7 dagkolommen krimpen mee in de breedte
     (minmax(0,1fr) → geen horizontale schuif). Elke dagcel clipt zijn diensten en
     fitMonthCells() toont per dag zoveel compacte dienst-chips als passen + "+N meer". */
  board.className = "planning-month-board planning-month-board--fit";
  board.style.gridTemplateColumns = "minmax(34px, 42px) repeat(7, minmax(0, 1fr))";
  board.style.gridTemplateRows = `auto repeat(${weekCount}, minmax(0, 1fr))`;

  const corner = document.createElement("div");
  corner.className = "planning-month-head planning-month-head--week";
  corner.textContent = "Week";
  board.appendChild(corner);

  ["ma", "di", "wo", "do", "vr", "za", "zo"].forEach((label) => {
    const h = document.createElement("div");
    h.className = "planning-month-head";
    h.textContent = label;
    board.appendChild(h);
  });

  for (let i = 0; i < days.length; i += 7) {
    const weekDays = days.slice(i, i + 7);
    const weekLabel = document.createElement("div");
    weekLabel.className = "planning-month-week";
    weekLabel.textContent = `W${getIsoWeek(weekDays[0])}`;
    board.appendChild(weekLabel);

    weekDays.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = "planning-month-cell";
      cell.dataset.day = String(day.getTime());
      if (day.getMonth() !== monthStart.getMonth()) cell.classList.add("is-outside-month");
      if (isToday(day)) cell.classList.add("is-today");

      const inDay = items
        .filter((it) => {
          const s = parseStartDate(it.start);
          return s && sameCalendarDay(s, day);
        })
        .sort(comparePlanningItemsByTime);

      const head = document.createElement("div");
      head.className = "planning-month-cell-head";
      head.innerHTML = `<span>${day.getDate()}</span>${inDay.length ? `<strong>${inDay.length}</strong>` : ""}${renderLeavePlaneHtml(day)}`;
      cell.appendChild(head);

      const list = document.createElement("div");
      list.className = "planning-month-cell-list";
      inDay.forEach((it) => list.appendChild(buildMonthChipEl(it, overlapIds)));
      cell.appendChild(list);
      board.appendChild(cell);
    });
  }

  host.appendChild(board);

  /* Het board exact tot de onderkant van de viewport laten reiken. De app-shell
     rendert bewust ~80px hoger dan de viewport (en de pagina-scroll is vergrendeld),
     dus puur meegroeien met de kaart zou de onderste week net buiten beeld duwen.
     Daarom zetten we de hoogte expliciet op "viewport-onderkant − board-top", zodat
     álle weken (dag 1 t/m einde maand) binnen het scherm vallen. Daarna trimt
     fitMonthCells() per dagcel de chips die niet in de rij-hoogte passen. */
  const applyFit = () => {
    if (!board.isConnected) return;
    /* De hele interface staat op html{zoom:1.1}. getBoundingClientRect()/innerHeight
       leveren zichtbare (gezoomde) pixels, maar een via style.height gezette waarde
       wordt nóg eens met de zoom geschaald. Daarom delen we de beschikbare zichtbare
       ruimte door de zoomfactor — anders rendert het board ~zoom× te hoog en valt de
       onderste week alsnog buiten beeld (op productie ~84px). */
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const top = board.getBoundingClientRect().top;
    const h = Math.max(320, Math.floor((window.innerHeight - top - 8) / zoom));
    board.style.height = h + "px";
    fitMonthCells(board);
  };
  // Synchroon (board staat al in de DOM) + na de volgende frame + kort daarna,
  // zodat een async her-render of late layout-pas de hoogte niet mist.
  applyFit();
  requestAnimationFrame(applyFit);
  setTimeout(applyFit, 120);
  if (monthFitResizeHandler) {
    window.removeEventListener("resize", monthFitResizeHandler);
    monthFitResizeHandler = null;
  }
  monthFitResizeHandler = () => requestAnimationFrame(applyFit);
  window.addEventListener("resize", monthFitResizeHandler);
}

/* Compacte dienst-chip voor de maandweergave: één regel met kleur-stip + tijd +
   diensttype. Klik springt naar de dagweergave van die datum (inzoomen op de dag),
   consistent met de "+N meer"-chip; daar staan de volledige dienstkaarten met de
   bekijk-/bewerk-/verwijder-acties. (De directe "Dienst bekijken"-modal werd vanuit
   de maand-chip niet betrouwbaar geopend — open-dan-direct-dicht — dus drillen we
   door naar de dag.) */
function buildMonthChipEl(it, overlapIds) {
  const autoOverlap = overlapIds && overlapIds.has(it.id);
  const labels = rowDiensttypeLabels(it);
  const firstLabel = labels[0] || it.diensttype || it.functie || "";
  const dtKey = resolveDiensttypeKey(firstLabel);
  const accent = colorForDiensttype(firstLabel) || (dtKey && DIENSTTYPE_COLORS[dtKey]) || GRID_ACCENT[0];
  const clientLabel = String(it.client || "").trim();
  const title = (dtKey === "1_op_1" && clientLabel)
    ? `${getClientFirstName(clientLabel)} 1 op 1`
    : (firstLabel || "Dienst");
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "planning-month-chip";
  if (it.conflict || autoOverlap) chip.classList.add("planning-month-chip--conflict");
  chip.style.setProperty("--erv-stripe", accent);
  const timeRange = `${formatTimeShort(it.start)} – ${formatTimeShort(it.einde)}`;
  chip.title = `${title} · ${timeRange}${it.teamlid ? " · " + String(it.teamlid).trim() : ""}`;
  chip.innerHTML = `
    <span class="planning-month-chip-dot" style="background:${accent}" aria-hidden="true"></span>
    <span class="planning-month-chip-time">${formatTimeShort(it.start)}</span>
    <span class="planning-month-chip-name">${escapeHtml(title)}</span>`;
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    const s = parseStartDate(it.start);
    if (!s) return;
    ui.dayDate = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    setCalMode("day");
    renderAllViews();
  });
  return chip;
}

/* Trim per dagcel het aantal zichtbare dienst-chips zodat ze binnen de
   (gelijk verdeelde) rij-hoogte passen. De verborgen chips worden samengevat in
   een "+N meer"-chip die naar de dagweergave springt. Idempotent: kan na elke
   resize opnieuw draaien. */
function fitMonthCells(board) {
  if (!board || !board.isConnected) return;
  board.querySelectorAll(".planning-month-cell").forEach((cell) => {
    const list = cell.querySelector(".planning-month-cell-list");
    if (!list) return;
    const prevMore = list.querySelector(".planning-month-more");
    if (prevMore) prevMore.remove();
    const chips = [...list.querySelectorAll(".planning-month-chip")];
    chips.forEach((c) => { c.hidden = false; });
    if (!chips.length) return;
    const avail = list.clientHeight;
    if (avail <= 0) return;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const chipH = (c) => c.offsetHeight;
    let used = 0;
    let shown = 0;
    for (let i = 0; i < chips.length; i++) {
      const h = chipH(chips[i]) + (i > 0 ? gap : 0);
      if (used + h > avail) break;
      used += h;
      shown++;
    }
    if (shown >= chips.length) return; // alles past al
    // Reserveer ruimte voor de "+N meer"-chip; haal zo nodig één zichtbare chip weg.
    const reserve = chipH(chips[0]) + gap;
    while (shown > 0 && used + reserve > avail) {
      shown--;
      used -= chipH(chips[shown]) + gap;
    }
    let hiddenCount = chips.length - shown;
    for (let i = shown; i < chips.length; i++) chips[i].hidden = true;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "planning-month-more";
    more.textContent = `+${hiddenCount} meer`;
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const ts = parseInt(cell.dataset.day || "0", 10);
      if (!ts) return;
      ui.dayDate = new Date(ts);
      setCalMode("day");
      renderAllViews();
    });
    list.appendChild(more);
    /* Correctie: past de "+N meer"-chip er nét niet bij (die kan iets hoger zijn dan
       een gewone chip, plus sub-pixel afronding bij zoom), verberg dan telkens nog
       één zichtbare chip tot de lijst exact binnen de rij-hoogte valt — geen clipping. */
    let guard = chips.length;
    while (shown > 0 && list.scrollHeight > list.clientHeight + 1 && guard-- > 0) {
      shown--;
      chips[shown].hidden = true;
      hiddenCount++;
      more.textContent = `+${hiddenCount} meer`;
    }
  });
}

function buildShiftCardEl(it, gi, overlapIds) {
  const card = document.createElement("div");
  card.className = "planning-erm-card";
  card.dataset.id = it.id;
  const warnings = getDienstWaarschuwingen(it, overlapIds);
  const heeftWaarschuwing = warnings.length > 0;
  if (heeftWaarschuwing) card.classList.add("planning-erm-card--conflict");
  if (ui.selectedId === it.id) card.classList.add("is-selected");
  /* Streep-kleur volgt het diensttype (zoals in screenshot per dienst).
   * Module 2 Bug #90 fix: gebruik colorForDiensttype() helper die eerst
   * comp_diensttypes.kleur leest (sync met filter-chip-kleur). */
  const dtParts = rowDiensttypeLabels(it);
  const firstLabel = dtParts[0];
  const dtKey = resolveDiensttypeKey(firstLabel || it.diensttype || it.functie);
  const dtNaam = firstLabel || it.diensttype || it.functie || "";
  const accent = colorForDiensttype(dtNaam) || (dtKey && DIENSTTYPE_COLORS[dtKey]) || GRID_ACCENT[gi % GRID_ACCENT.length];
  card.style.setProperty("--erv-stripe", accent);
  // Eén klikbaar "!"-icoon dat álle waarschuwingen (open/dubbel/aandacht) bundelt;
  // de reden wordt bij klikken in een popover getoond (geen vage tooltip meer).
  const warnTitle = warnings.map((w) => w.label).join(" · ");
  const warnBadge = heeftWaarschuwing
    ? `<button type="button" class="planning-erm-overlap planning-erm-warnbtn" data-a="warn" title="${escapeHtml(warnTitle)} — klik voor uitleg" aria-label="Waarom is deze dienst gemarkeerd? ${escapeHtml(warnTitle)} — klik voor uitleg">!</button>`
    : "";
  card.removeAttribute("title");
  /* Kaartstijl volgens screenshot:
     1) titel: diensttype OF "{Voornaam} 1 op 1" + tijd
     2) locatie met locatie-kleurbolletje
     3) (alleen 1-op-1) cliëntregel met persoon-icoon
     4) medewerker-chip */
  const dtLabelFirst = (rowDiensttypeLabels(it)[0] || it.functie || it.diensttype || "Dienst").trim();
  const locLabel = String(it.locatie || "").trim() || String(it.vestiging || "").trim();
  const clientLabel = String(it.client || "").trim();
  const employeeLabel = String(it.teamlid || "").trim();
  const isOneOnOne = dtKey === "1_op_1";
  const dtTitle = isOneOnOne && clientLabel
    ? `${getClientFirstName(clientLabel)} 1 op 1`
    : dtLabelFirst;
  const locKleur = getLocatieKleur(locLabel);
  const locLine = `
    <div class="planning-erm-card-loc">
      <span class="planning-erm-card-loc-dot" style="background:${locKleur}" aria-hidden="true"></span>
      <span>${escapeHtml(locLabel || "Locatie onbekend")}</span>
    </div>`;
  const clientLine = isOneOnOne && clientLabel
    ? `<div class="planning-erm-card-clientrow">
         <svg class="planning-erm-card-pers-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
           <circle cx="12" cy="8" r="4"/>
           <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
         </svg>
         <span>${escapeHtml(clientLabel)}</span>
       </div>`
    : "";
  const employeeChip = employeeLabel
    ? `<div class="planning-erm-card-person">${escapeHtml(employeeLabel)}</div>`
    : "";
  card.innerHTML = `
    <div class="planning-erm-card__top">
      <strong class="planning-erm-name">${escapeHtml(dtTitle)}</strong>
      <span class="planning-erm-when-w">${warnBadge}<span class="planning-erm-when">${formatTimeShort(it.start)} – ${formatTimeShort(it.einde)}</span></span>
    </div>
    ${locLine}
    ${clientLine}
    ${employeeChip}
    <div class="planning-erm-hoverbar" role="group" aria-label="Acties op deze dienst (verschijnt bij hover)">
      <div class="planning-erm-hoverbar-inner">
        <span class="planning-erm-hoverbar-stripe" style="background:${accent}" aria-hidden="true"></span>
        <div class="planning-erm-hoverbar-btns">
          <button type="button" class="planning-erm-hbtn" data-a="view" title="Bekijken" aria-label="Dienst bekijken">
            <svg class="planning-erm-hic planning-erm-hic--view" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" fill="none"/>
            </svg>
          </button>
          <button type="button" class="planning-erm-hbtn" data-a="edit" title="Bewerken" aria-label="Bewerken">
            <svg class="planning-erm-hic planning-erm-hic--edit" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button type="button" class="planning-erm-hbtn" data-a="del" title="Verwijderen" aria-label="Verwijderen">
            <svg class="planning-erm-hic planning-erm-hic--del" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
  card.addEventListener("click", (ev) => {
    const t = ev.target;
    const warnBtn = t.closest && t.closest(".planning-erm-warnbtn");
    if (warnBtn) {
      ev.stopPropagation();
      // Toggle: staat de popover al open voor ditzelfde "!" → sluiten i.p.v. heropenen.
      if (__dienstReasonPop && __dienstReasonPop._anchor === warnBtn) {
        closeDienstReasonPopover();
      } else {
        showDienstReasonPopover(warnBtn, getDienstWaarschuwingen(it, overlapIds));
      }
      return;
    }
    if (t.closest(".planning-erm-hbtn")) {
      const act = t.closest("[data-a]")?.getAttribute("data-a");
      if (act === "view") {
        openViewModal(it.id);
        ev.stopPropagation();
        return;
      }
      if (act === "edit") {
        openDienstPanel(it.id);
        ev.stopPropagation();
        return;
      }
      if (act === "del") {
        ev.stopPropagation();
        var planSummary = "";
        try {
          var st = it.start ? new Date(it.start) : null;
          var dateStr = st && !isNaN(st) ? st.toLocaleDateString("nl-NL") : "";
          planSummary = [it.teamlid, it.client, dateStr].filter(Boolean).join(" — ");
        } catch (_e) { /* noop */ }
        var confirmFn;
        if (typeof window.showSliderConfirmModal === "function") {
          confirmFn = window.showSliderConfirmModal({
            title: "Planningsregel verwijderen",
            message: "Weet je zeker dat je deze planningsregel wilt verwijderen?",
            preview: planSummary,
            okLabel: "Verwijderen",
          });
        } else {
          // Fallback zonder browser-popup: bevestigingsdialoog ontbreekt → cancel.
          console.warn("[planning] showSliderConfirmModal niet beschikbaar — actie geannuleerd.");
          confirmFn = Promise.resolve(false);
        }
        confirmFn.then(function (ok) {
          if (!ok) return;
          ui.selectedId = null;
          const feedback = function () {
            if (typeof window.showActionFeedback === "function") window.showActionFeedback("deleted", "Planningsregel");
          };
          // Gerichte delete via de data-laag (werkt _mem + Supabase bij, dispatcht
          // besa:planning-updated → re-render). Geen bulk-overwrite meer.
          if (window.planningDB && window.planningDB.delete) {
            window.planningDB.delete(it.id).then(feedback).catch(function (e) { console.error("[planning] verwijderen mislukt:", e); });
          } else { feedback(); }
        });
        return;
      }
    }
    ev.stopPropagation();
    ui.selectedId = ui.selectedId === it.id ? null : it.id;
    document.querySelectorAll(".planning-erm-card.is-selected").forEach((c) => c.classList.remove("is-selected"));
    if (ui.selectedId) card.classList.add("is-selected");
    else card.classList.remove("is-selected");
  });
  return card;
}

// Effectieve CSS-`zoom` van de keten boven een element (product van alle `zoom`-
// waarden van de voorouders). De interface draait standaard op `html { zoom: 1.1 }`.
function planningEffectiveZoom(el) {
  let z = 1;
  for (let n = el ? el.parentElement : null; n; n = n.parentElement) {
    const cz = parseFloat(getComputedStyle(n).zoom);
    if (cz && cz !== 1) z *= cz;
  }
  return z || 1;
}

// Reden-uitleg popover voor het "!"-icoon op een dienstkaart. Eén tegelijk open.
let __dienstReasonPop = null;
function closeDienstReasonPopover() {
  if (__dienstReasonPop) {
    try { __dienstReasonPop._cleanup && __dienstReasonPop._cleanup(); } catch (e) { /* */ }
    try { __dienstReasonPop.remove(); } catch (e) { /* */ }
    __dienstReasonPop = null;
  }
}
function showDienstReasonPopover(anchorEl, warnings) {
  closeDienstReasonPopover();
  if (!anchorEl || !warnings || !warnings.length) return;
  const pop = document.createElement("div");
  pop.className = "planning-reason-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Waarom is deze dienst gemarkeerd");
  pop.innerHTML = `
    <div class="planning-reason-pop-head">Waarom is deze dienst gemarkeerd?</div>
    <ul class="planning-reason-pop-list">
      ${warnings
        .map(
          (w) => `
        <li class="planning-reason-pop-item planning-reason-pop-item--${escapeHtml(w.type)}">
          <span class="planning-reason-pop-dot" aria-hidden="true"></span>
          <span class="planning-reason-pop-txt">
            <strong>${escapeHtml(w.label)}</strong>
            <span>${escapeHtml(w.detail)}</span>
          </span>
        </li>`
        )
        .join("")}
    </ul>`;
  document.body.appendChild(pop);
  // Positioneer onder het anker; val terug naar boven/links als het buiten beeld valt.
  // De interface draait op `html { zoom: 1.1 }`. getBoundingClientRect() geeft VISUELE
  // (gezoomde) coördinaten, terwijl style.left/top CSS-layout-lengtes zijn die bij het
  // renderen NÓG eens met de zoom worden vermenigvuldigd. Zonder correctie landt de
  // popover daarom verder naar rechts/onder dan het "!" (afwijking groeit met de
  // afstand tot de oorsprong). We delen de gemeten anker-coördinaten door de zoom zodat
  // ze in dezelfde layout-ruimte zitten als offsetWidth/clientWidth/scroll.
  const z = planningEffectiveZoom(pop) || 1;
  const r = anchorEl.getBoundingClientRect();
  const aLeft = r.left / z;
  const aTop = r.top / z;
  const aBottom = r.bottom / z;
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let left = aLeft + window.scrollX;
  const maxLeft = window.scrollX + vw - pw - 8;
  if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);
  let top = aBottom + window.scrollY + 6;
  if (aBottom + ph + 10 > vh) top = Math.max(window.scrollY + 8, aTop + window.scrollY - ph - 6);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
  const onDoc = (e) => {
    if (pop.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
    closeDienstReasonPopover();
  };
  const onKey = (e) => { if (e.key === "Escape") closeDienstReasonPopover(); };
  pop._cleanup = () => {
    document.removeEventListener("mousedown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", closeDienstReasonPopover, true);
  };
  document.addEventListener("mousedown", onDoc, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", closeDienstReasonPopover, true);
  pop._anchor = anchorEl; // voor de toggle: terugklikken op hetzelfde "!" sluit de popover
  __dienstReasonPop = pop;
}

function copyItem(it) {
  const s = parseStartDate(it.start);
  const e = parseStartDate(it.einde);
  if (!s || !e) return;
  const dur = e - s;
  s.setTime(s.getTime() + 3600000);
  e.setTime(s.getTime() + dur);
  const n = normalizeItem({ ...it, id: makePlanningId(), start: toIsoLocal(s), einde: toIsoLocal(e) });
  // Gericht toevoegen via de data-laag (dispatcht besa:planning-updated → re-render).
  if (window.planningDB && window.planningDB.add) {
    window.planningDB.add(n).catch(function (err) { console.error("[planning] kopiëren mislukt:", err); });
  }
}

function getDayHourTotals(cols, allItems) {
  return cols.map((d) => {
    let h = 0;
    allItems.forEach((it) => {
      const s = parseStartDate(it.start);
      if (s && sameCalendarDay(s, d)) h += durationHours(it.start, it.einde);
    });
    return h;
  });
}

function buildEmptySlotCardEl(dayCol, locatieNaam) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "planning-erm-card planning-erm-card--empty";
  card.setAttribute("aria-label", `Open dienst toevoegen op ${locatieNaam}`);
  card.innerHTML = `
    <div class="planning-erm-empty-top">
      <strong class="planning-erm-empty-title">Open dienst</strong>
      <span class="planning-erm-empty-plus" aria-hidden="true">+</span>
    </div>
    <div class="planning-erm-empty-sub">Nog geen medewerker ingepland</div>
    <div class="planning-erm-empty-meta">${toDateInputValue(dayCol)} · ${escapeHtml(locatieNaam || "Locatie")}</div>
  `;
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    ui.prefillStartDay = new Date(dayCol.getTime());
    openDienstPanel();
    // Voorselectie locatie in het paneel
    const sel = document.getElementById("dienst-locatie-hr");
    if (sel) sel.value = locatieNaam || "";
  });
  return card;
}

function getEmptyWeekGroups() {
  const ds = buildDataState();
  const toFiltered = (arr, set) => {
    if (!set || set.size === 0) return arr;
    return arr.filter((x) => set.has(x));
  };
  if (ui.rowAxis === "medewerker") {
    const meds = toFiltered(ds.medewerkers, filterState.medewerkers);
    return meds.length ? meds.slice(0, 10) : ["Medewerker"];
  }
  if (ui.rowAxis === "vestiging") {
    let locs = toFiltered(ds.vestigingen, filterState.vestiging);
    /* Toolbar single-select location filter (uit screenshot: "Selecteer Locatie") */
    if (filterState.locatieToolbar) {
      locs = locs.filter((l) => l === filterState.locatieToolbar);
      const withOpen = locs.length ? locs : [filterState.locatieToolbar];
      return sortLocatieGroepen([...new Set(withOpen)]);
    }
    const withOpen = ["Openstaande diensten", ...locs];
    const unique = [...new Set(withOpen)];
    return sortLocatieGroepen(unique);
  }
  if (ui.rowAxis === "functie") {
    const fns = toFiltered(readDiensttypes(), filterState.diensttypes);
    return fns.length ? fns.slice(0, 10) : ["Functie"];
  }
  const afds = toFiltered(ds.afdelingen, filterState.afdeling);
  return afds.length ? afds.slice(0, 10) : ["Afdeling"];
}

function renderWeekGrid() {
  const host = document.getElementById("planning-week-grid");
  const empty = document.getElementById("planning-week-empty");
  if (!host) return;
  let items = getItemsForView();
  // In de locatie-weergave alleen diensten op cliëntwoningen meenemen, zodat
  // dagtotalen en cellen niet vervuilen met test-/overhead-locaties.
  if (ui.rowAxis === "vestiging") {
    items = items.filter((it) => isPlanningZichtbareGroep(getRowKey(it)));
  }
  host.classList.add("planning-erm--dense");
  host.classList.toggle("planning-erm--locations", ui.rowAxis === "vestiging");
  host.classList.toggle("planning-erm--month", ui.calMode === "month");
  // Sticky dag-koppen: de datum-rij blijft bovenin staan terwijl je langs de locaties
  // scrolt (spraakmemo eigenaar 2026-06-11). In week-/dagweergave mag de grid-wrap geen
  // eigen verticale scroll-context vormen, anders plakken de sticky dag-kop-cellen aan
  // de niet-scrollende wrap i.p.v. aan de planning-kaart die werkelijk verticaal scrolt
  // — waardoor de datums wegscrollen. De maandweergave houdt z'n eigen horizontaal-
  // scrollende board, dus die laten we ongemoeid.
  const wrap = host.parentElement;
  if (wrap && wrap.classList.contains("planning-week-grid-wrap--v3")) {
    wrap.classList.toggle("planning-week-grid-wrap--freezehead", ui.calMode !== "month");
  }
  /* Maandweergave "volledig in beeld": het view-panel + de wrap groeien mee zodat
     het kalender-board exact de beschikbare hoogte vult (zie .planning-view-panel
     --monthfit in styles.css). Alleen in maandmodus; in week/dag teruggezet. */
  const monthMode = ui.calMode === "month";
  const panel = wrap && wrap.parentElement;
  if (panel && panel.classList.contains("planning-view-panel")) {
    panel.classList.toggle("planning-view-panel--monthfit", monthMode);
  }
  /* In maandmodus wijkt de KPI-strip + de overlap-/beschikking-banner zodat de hele
     maand (dag 1 t/m einde) in één beeld past. Puur presentatie (reversibel via een
     card-class) — de opgeslagen kop-inklap-voorkeur blijft ongemoeid en geldt weer
     zodra je terug naar de weekweergave gaat. */
  const card = panel && panel.closest(".planning-main-card--v3");
  if (card) card.classList.toggle("planning-card--monthfit", monthMode);
  host.innerHTML = "";
  if (empty) empty.hidden = true;
  const overlapIds = buildOverlapConflictIds(items);
  if (ui.calMode === "month") {
    renderMonthCalendar(host, items, overlapIds);
    return;
  }
  const cols = getColumnDates();
  const byGroup = new Map();
  let groups = [];
  if (ui.rowAxis === "vestiging") {
    // Screenshot-achtig gedrag: vaste locatierijen tonen, ook zonder diensten.
    const base = getEmptyWeekGroups();
    const seen = new Set(base);
    groups = [...base];
    // Neem extra locaties uit items mee (bijv. legacy-data of nieuwe import),
    // maar uitsluitend als ze planning-zichtbaar zijn — zo verschijnen test-/
    // overhead-locaties (showroom, shop, kantoor, satellietwoning) niet als rij.
    groupItems(items).forEach((g) => {
      if (!seen.has(g) && isPlanningZichtbareGroep(g)) {
        seen.add(g);
        groups.push(g);
      }
    });
    groups = sortLocatieGroepen(groups);
  } else {
    groups = items.length > 0 ? groupItems(items) : getEmptyWeekGroups();
  }
  groups.forEach((g) => byGroup.set(g, items.filter((x) => getRowKey(x) === g)));
  // Werkvloer (read-only): toon alleen de groepen waar de medewerker zélf is
  // ingeroosterd — geen lege locatierijen en geen "Openstaande diensten"-groep
  // (planner-clutter; video-eis eigenaar 2026-06-07: "open diensten / onnodig te
  // veel info moet een medewerker niet zien"). De diensten zijn al op eigen naam
  // gescoopt via getBaseFiltered(); we verbergen hier alleen de lege rijen.
  if (document.body.classList.contains("planning-readonly")) {
    groups = groups.filter((g) => (byGroup.get(g) || []).length > 0);
    if (groups.length === 0) {
      host.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
  }
  const colTotals = getDayHourTotals(cols, items);
  const totalWeek = colTotals.reduce((a, b) => a + b, 0);
  /* Korte dagcodes voor board-weergave ("ma 20", "di 21", …). */
  const dayShort = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const dayNames = dayShort;
  /* Week-weergave: kolommen krimpen volledig mee (min 0) zodat alle 7 dagen
     samen exact in het paneel passen — geen horizontale schuif nodig. Dag- en
     maandweergave behouden hun leesbare minimumbreedte. */
  const colMin =
    ui.calMode === "week"
      ? 0
      : ui.rowAxis === "vestiging"
        ? 168
        : ui.calMode === "month"
          ? 104
          : 168;
  const table = document.createElement("div");
  table.className = "planning-erm-wg";
  if (ui.rowAxis === "vestiging") table.classList.add("planning-erm-wg--locations");
  table.style.gridTemplateColumns =
    ui.rowAxis === "vestiging"
      ? `repeat(${cols.length}, minmax(${colMin}px,1fr))`
      : `minmax(150px,196px) repeat(${cols.length}, minmax(${colMin}px,1fr))`;
  const head = document.createElement("div");
  head.className = "planning-erm-wg-row planning-erm-wg-row--head";
  if (ui.rowAxis !== "vestiging") {
    const corner = document.createElement("div");
    corner.className = "planning-erm-cell planning-erm-cell--corner planning-erm-sticky-l";
    const cornerLabel =
      ui.rowAxis === "afdeling"
        ? "Afdeling / team"
        : ui.rowAxis === "medewerker"
          ? "Medewerker"
          : "Functie";
    corner.textContent = cornerLabel;
    head.appendChild(corner);
  }
  cols.forEach((d) => {
    const c = document.createElement("div");
    c.className = "planning-erm-cell planning-erm-cell--day";
    if (isToday(d)) c.classList.add("is-today");
    /* Board-stijl: korte dag + dagnummer, zowel week als maand. */
    c.innerHTML = `<span class="planning-erm-dh-dow">${dayNames[d.getDay()]}</span><span class="planning-erm-dh-dom">${d.getDate()}</span>${renderLeavePlaneHtml(d)}`;
    head.appendChild(c);
  });
  table.appendChild(head);
  groups.forEach((g, gi) => {
    const list = byGroup.get(g) || [];
    const row = document.createElement("div");
    row.className = "planning-erm-wg-row planning-erm-wg-data";
    if (ui.rowAxis === "vestiging" && gi % 2 === 1) row.classList.add("planning-erm-wg-row--alt");
    if (gi > 0) row.classList.add("planning-erm-wg-sep");
    if (ui.rowAxis === "vestiging") {
      const m = getRowMetrics(list);
      const locBar = document.createElement("div");
      locBar.className = "planning-erm-locbar";
      locBar.style.gridColumn = "1 / -1";
      const isOpenGroep = g === OPENSTAANDE_GROEP;
      locBar.setAttribute("title", isOpenGroep ? "Diensten zonder ingeplande medewerker" : `Locatie: ${g}`);
      const count = list.length;
      if (isOpenGroep && count > 0) locBar.classList.add("planning-erm-locbar--open");
      locBar.innerHTML = `
        <div class="planning-erm-glabel-head">
          <span class="planning-wg-dot" style="background:${GRID_ACCENT[gi % GRID_ACCENT.length]}"></span>
          <span class="planning-erm-glabel-name">${escapeHtml(g)}</span>
          <span class="planning-erm-row-badge">${count}</span>
        </div>
        <div class="planning-erm-glabel-sum">
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--zzp" title="ZZP-kosten in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">€</span>
            <span>ZZP ${formatEuro(m.zzpKosten)}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--uren" title="Geplande uren in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">⏱</span>
            <span>${formatHoursShort(m.hours)}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--zzpuren" title="Ingezette ZZP-uren in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">⏱</span>
            <span>ZZP ${m.zzpUren}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--open" title="Openstaande uren in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">!</span>
            <span>Open ${formatHoursShort(m.openHours)}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--km" title="Kilometerkosten in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">€</span>
            <span>KM ${formatEuro(m.kmKosten)}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--kmcount" title="Gereden kilometers in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">⛟</span>
            <span>${formatKmCount(m.kmTotaal)}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--tarief" title="Gemiddeld tarief per uur in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">€/u</span>
            <span>${formatEuro(m.gemTarief)}</span>
          </span>
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--zzptarief" title="Gemiddeld ZZP-uurtarief in deze locatie">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">€/u</span>
            <span>ZZP ${m.gemZzpTarief != null ? formatEuro(m.gemZzpTarief) : "—"}</span>
          </span>
        </div>
      `;
      table.appendChild(locBar);
    } else {
      const label = document.createElement("div");
      label.className = "planning-erm-cell planning-erm-glabel planning-erm-sticky-l";
      const head = document.createElement("div");
      head.className = "planning-erm-glabel-head";
      const dot = document.createElement("span");
      dot.className = "planning-wg-dot";
      dot.style.background = GRID_ACCENT[gi % GRID_ACCENT.length];
      const span = document.createElement("span");
      span.className = "planning-erm-glabel-name";
      span.textContent = g;
      const count = list.length;
      const badge = document.createElement("span");
      badge.className = "planning-erm-row-badge";
      badge.textContent = String(count);
      head.append(dot, span, badge);
      label.appendChild(head);
      row.appendChild(label);
    }
    cols.forEach((dayCol) => {
      const cell = document.createElement("div");
      cell.className = "planning-erm-cell planning-erm-cell--body";
      if (isToday(dayCol)) cell.classList.add("is-today");
      const inCell = list
        .filter((it) => {
          const s = parseStartDate(it.start);
          return s && sameCalendarDay(s, dayCol);
        })
        .sort(comparePlanningItemsByTime);
      inCell.forEach((it) => {
        cell.appendChild(buildShiftCardEl(it, gi, overlapIds));
      });
      /* Lege cel blijft expres leeg — diensten worden alleen via
         "Dienst aanmaken" rechtsboven aangemaakt. */
      row.appendChild(cell);
    });
    table.appendChild(row);
  });
  // In locatie-board mode tonen we geen totalen-voet (closer to board screenshot).
  if (ui.rowAxis !== "vestiging") {
    const foot = document.createElement("div");
    foot.className = "planning-erm-wg-row planning-erm-wg-row--foot";
    const footL = document.createElement("div");
    footL.className = "planning-erm-cell planning-erm-foot-l planning-erm-sticky-l";
    footL.innerHTML = `<div class="planning-erm-foot-totalwrap"><span class="planning-erm-foot-ttl">Σ uren (periode)</span><strong class="planning-erm-foot-grand" title="Totaal alle zichtbare diensten">${formatCompactHours(totalWeek)}</strong></div>`;
    foot.appendChild(footL);
    cols.forEach((d, idx) => {
      const fc = document.createElement("div");
      fc.className = `planning-erm-cell planning-erm-foot-col${isToday(d) ? " is-today" : ""}`;
      const th = colTotals[idx] || 0;
      const dIso = d.getTime();
      const icoLup =
        '<svg class="planning-erm-icoact-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.2-4.2"/></svg>';
      const icoPl =
        '<svg class="planning-erm-icoact-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      fc.innerHTML = `
        <div class="planning-erm-foot-total">${formatCompactHours(th)}</div>
        <div class="planning-erm-foot-acts" role="group" aria-label="Dagacties">
          <button type="button" class="planning-erm-icoact" data-zoom="${dIso}" title="Dagweergave voor deze dag" aria-label="Dagweergave voor deze dag">${icoLup}</button>
          <button type="button" class="planning-erm-icoact" data-add="${dIso}" title="Nieuwe dienst op deze dag" aria-label="Nieuwe dienst op deze dag">${icoPl}</button>
        </div>`;
      const zoomBtn = fc.querySelector("[data-zoom]");
      const addBtn = fc.querySelector("[data-add]");
      zoomBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const ts = parseInt(zoomBtn.getAttribute("data-zoom") || "0", 10);
        ui.dayDate = new Date(ts);
        setListMode(false);
        setCalMode("day");
        renderAllViews();
      });
      addBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const ts = parseInt(addBtn.getAttribute("data-add") || "0", 10);
        ui.prefillStartDay = new Date(ts);
        openDienstPanel();
      });
      foot.appendChild(fc);
    });
    table.appendChild(foot);
  }
  host.appendChild(table);
  syncPlanningDayheadHeight();
}

/* Hoogte van de sticky dag-kop-rij meten en als CSS-variabele zetten, zodat de
   locatie-groepkop (.planning-erm-locbar) er precies ónder kan blijven plakken
   tijdens het scrollen — voor élke rol altijd zichtbaar bij welke locatie de
   diensten horen (spraakmemo eigenaar 2026-06-11). */
function syncPlanningDayheadHeight() {
  try {
    const host = document.getElementById("planning-week-grid");
    if (!host) return;
    /* Synchroon meten: het rooster staat na appendChild al in de DOM (geen rAF — die
       wordt in niet-zichtbare/achtergrond-tabs sterk gethrottled).
       offsetHeight i.p.v. getBoundingClientRect: onder de vaste html{zoom:1.1} geeft
       getBoundingClientRect visuele (×1,1) pixels terug, terwijl een sticky `top` in
       CSS-pixels rekent — dat verschil zorgde voor een doorkijk-gat tussen de lagen.
       offsetHeight levert de layout-hoogte in CSS-pixels, dus zoom-vrij en pixel-exact. */
    const cell = host.querySelector(
      ".planning-erm-wg-row--head .planning-erm-cell--day",
    );
    const h = cell ? cell.offsetHeight : 0;
    if (h > 0) host.style.setProperty("--ff-dayhead-h", h + "px");
    /* Toolbar-hoogte: de dag-koprij plakt hier precies ónder, zodat toolbar + dag-kop
       samen één strak gepinde kop vormen (geen overlap, geen doorkijk-gat). */
    const tb = document.querySelector(".planning-erm-toolbar");
    const th = tb ? tb.offsetHeight : 0;
    if (th > 0) host.style.setProperty("--ff-toolbar-h", th + "px");
  } catch (e) {
    /* niet kritiek: de vars hebben een CSS-fallback */
  }
}

/* Breng het rooster (de geselecteerde locatie) naar voren. Bij de volledige planner
   staat het rooster ONDER de KPI-strip + rode overlap-/beschikking-banner; een
   simpele scroll-naar-boven zou juist dát rode blok tonen. Daarom scrollen we het
   rooster-paneel tot net onder de sticky toolbar, zodat de dag-koppen + de gekozen
   locatie meteen in beeld staan — in zowel de read-only kijk-modus (scroll-container
   = .content--planning-erm) als de volledige planner (scroll-container = de kaart). */
function scrollPlanningToRooster() {
  try {
    var target =
      document.querySelector(".planning-week-grid-wrap--v3") ||
      document.querySelector(".planning-view-panel:not([hidden])");
    if (!target) return;
    var sc = target.parentElement;
    while (sc && sc !== document.body && sc !== document.documentElement) {
      var oy = getComputedStyle(sc).overflowY;
      if ((oy === "auto" || oy === "scroll") && sc.scrollHeight > sc.clientHeight + 4) break;
      sc = sc.parentElement;
    }
    /* Synchroon (geen rAF — die wordt in achtergrond-/niet-zichtbare tabs gethrottled,
       waardoor de scroll met verouderde maten zou landen). getBoundingClientRect
       forceert de layout, dus de maten kloppen direct na renderAllViews(). De sticky
       toolbar telt niet mee: de dag-koppen plakken zelf op top:0, dus we brengen de
       rooster-top exact tot de bovenkant van de scroll-container. */
    if (sc && sc !== document.body && sc !== document.documentElement) {
      var d = target.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      sc.scrollTop = Math.max(0, sc.scrollTop + d - 1);
    } else {
      target.scrollIntoView({ block: "start" });
    }
  } catch (e) {
    /* */
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =============================================================================
// Kolommen-knop (column visibility toggle voor de planning-lijstweergave)
// =============================================================================
const PLANNING_COLUMN_CONFIG = [
  { id: "afdeling", label: "Afdeling", defaultOn: true },
  { id: "diensttype", label: "Diensttype", defaultOn: true },
  { id: "functie", label: "Functie (rol)", defaultOn: true },
  { id: "teamlead", label: "Teamlead", defaultOn: true },
  { id: "teamlid", label: "Teamlid", defaultOn: true },
  { id: "client", label: "Cliënt", defaultOn: true },
  { id: "vestiging", label: "Vestiging", defaultOn: true },
  { id: "locatie", label: "Locatie", defaultOn: true },
  { id: "start", label: "Start", defaultOn: true },
  { id: "einde", label: "Einde", defaultOn: true },
  { id: "uren", label: "Uren", defaultOn: true },
  { id: "leer", label: "Leer", defaultOn: true },
  { id: "sterren", label: "Sterren", defaultOn: true },
  { id: "risico", label: "Risico", defaultOn: true },
];

function setPlanningColumnVisible(colId, visible) {
  document
    .querySelectorAll('.planning-table [data-col="' + colId + '"]')
    .forEach((cell) => {
      cell.classList.toggle("col-hidden", !visible);
    });
}

function applyPlanningColumnVisibility() {
  document.querySelectorAll("#plan-columns-list .column-toggle").forEach((btn) => {
    const colId = btn.getAttribute("data-col");
    const isOn = btn.getAttribute("aria-checked") === "true";
    setPlanningColumnVisible(colId, isOn);
  });
}

function buildPlanningColumnsPanel() {
  const list = document.getElementById("plan-columns-list");
  if (!list) return;
  list.innerHTML = "";
  PLANNING_COLUMN_CONFIG.forEach((c) => {
    const li = document.createElement("li");
    li.setAttribute("role", "none");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "column-toggle" + (c.defaultOn ? " is-checked" : "");
    b.setAttribute("data-col", c.id);
    b.setAttribute("role", "menuitemcheckbox");
    b.setAttribute("aria-checked", c.defaultOn ? "true" : "false");
    b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
    li.appendChild(b);
    list.appendChild(li);
  });
}

function wirePlanningColumnsPanel() {
  const colBtn = document.getElementById("plan-columns-menu-btn");
  const colPanel = document.getElementById("plan-columns-panel");
  const colList = document.getElementById("plan-columns-list");
  if (colBtn && colPanel) {
    colBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const hidden = colPanel.hasAttribute("hidden");
      if (hidden) {
        colPanel.removeAttribute("hidden");
        colBtn.setAttribute("aria-expanded", "true");
      } else {
        colPanel.setAttribute("hidden", "");
        colBtn.setAttribute("aria-expanded", "false");
      }
    });
    colPanel.addEventListener("click", (e) => e.stopPropagation());
  }
  if (colList) {
    colList.addEventListener("click", (e) => {
      const t = e.target && e.target.closest && e.target.closest(".column-toggle");
      if (!t) return;
      t.classList.toggle("is-checked");
      const on = t.classList.contains("is-checked");
      t.setAttribute("aria-checked", on ? "true" : "false");
      applyPlanningColumnVisibility();
    });
  }
  document.addEventListener("click", () => {
    if (colPanel) {
      colPanel.setAttribute("hidden", "");
      if (colBtn) colBtn.setAttribute("aria-expanded", "false");
    }
  });
}

function renderListTable() {
  const body = document.getElementById("planning-table-body");
  const empty = document.getElementById("planning-empty");
  if (!body) return;
  const allItems = getItemsForView().slice().sort(comparePlanningItemsByTime);
  // Overlap-conflicten altijd over de VOLLEDIGE view berekenen (zodat een dienst die
  // met een andere botst herkend blijft), daarna pas filteren wanneer de gebruiker via
  // de rode banner "Toon in lijst" alleen de niet-kloppende diensten wil zien.
  const overlapIds = buildOverlapConflictIds(allItems);
  const items = ui.overlapOnly ? allItems.filter((it) => overlapIds.has(it.id)) : allItems;
  updateOverlapListbar(items.length);
  const naamFunctieMap = buildNaamFunctieMap();
  body.innerHTML = "";
  items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = "planning-table-row";
    const h = durationHours(item.start, item.einde);
    const itemWarnings = getDienstWaarschuwingen(item, overlapIds);
    const risk = itemWarnings.length ? itemWarnings.map((w) => w.label).join(" + ") : "—";
    // Functie = HR-functie van de ingeroosterde medewerker. Geen terugval op het
    // diensttype (normalizeItem zet een lege functie op het diensttype) — bij een
    // onbekende/functie-loze medewerker tonen we "—" i.p.v. een misleidend diensttype.
    const functieWeergave = functieVoorTeamlid(item.teamlid, naamFunctieMap) || "";
    tr.innerHTML = `
      <td data-col="afdeling">${escapeHtml(item.afdeling || "—")}</td>
      <td data-col="diensttype">${escapeHtml(item.diensttype || "—")}</td>
      <td data-col="functie">${escapeHtml(functieWeergave || "—")}</td>
      <td data-col="teamlead">${escapeHtml(item.teamlead || "—")}</td>
      <td data-col="teamlid">${escapeHtml(item.teamlid || "—")}</td>
      <td data-col="client">${escapeHtml(item.client || "—")}</td>
      <td data-col="vestiging">${escapeHtml(String(item.vestiging || "")) || "—"}</td>
      <td data-col="locatie">${escapeHtml(String(item.locatie || "")) || "—"}</td>
      <td data-col="start">${formatDateTime(item.start)}</td>
      <td data-col="einde">${formatDateTime(item.einde)}</td>
      <td data-col="uren">${h > 0 ? h.toFixed(1).replace(".", ",") : "—"}</td>
      <td data-col="leer">${item.leer}</td>
      <td data-col="sterren">${item.sterren}</td>
      <td data-col="risico">${escapeHtml(risk)}</td>
    `;
    body.appendChild(tr);
  });
  applyPlanningColumnVisibility();
  if (empty) {
    empty.hidden = items.length > 0;
    empty.textContent = ui.overlapOnly
      ? "Geen dubbel-ingeroosterde diensten meer in deze periode — alle overlappingen zijn opgelost."
      : "Geen items gevonden.";
  }
}

/** Context-balk boven de lijst wanneer alleen de dubbel-ingeroosterde diensten worden
 *  getoond (na "Toon in lijst" op de rode overlap-banner). Toont hoeveel diensten nog
 *  niet kloppen + knoppen om alles te tonen of (zonder herladen) terug te gaan naar het
 *  rooster op de locatie van de laatste aanpassing. */
function updateOverlapListbar(count) {
  const bar = document.getElementById("planning-overlap-listbar");
  if (!bar) return;
  if (!ui.overlapOnly) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const txt = document.getElementById("planning-overlap-listbar-txt");
  if (txt) {
    const n = count || 0;
    txt.textContent = n > 0
      ? `Alleen dubbel-ingeroosterde diensten — ${n} dienst${n === 1 ? "" : "en"} die nog niet ${n === 1 ? "klopt" : "kloppen"}.`
      : "Alle overlappingen zijn opgelost.";
  }
}

/** Spraakmemo 2026-06-11: na het aanpassen van een dienst direct (zonder herladen)
 *  terug naar het rooster, op de locatie/datum waar de aanpassing is gedaan. Verlaat de
 *  overlap-only lijst, springt de kalender naar de datum van de laatst aangepaste dienst
 *  en markeert die kort zodat de gebruiker meteen ziet waar hij gebleven was. */
function returnToRosterAtAdjustment() {
  ui.overlapOnly = false;
  setListMode(false);
  const target = ui.lastAdjustedId ? getItemById(ui.lastAdjustedId) : null;
  if (target) {
    const d = parseStartDate(target.start);
    if (d && !isNaN(d.getTime())) {
      ui.dayDate = new Date(d);
      ui.weekStart = getMonday(d);
      ui.monthDate = new Date(d);
    }
  }
  renderAllViews();
  if (target) {
    // Na de re-render de kaart in beeld scrollen + kort oplichten. Dit is bewust géén
    // "scroll één keer en stop": de grid-DOM + KPI-/banner-kop stromen ná de eerste frames
    // nog her én een sluitende dienst-detail-animatie (~260ms) kan de scrollpositie nét
    // daarna resetten. We scrollen daarom op meerdere vaste momenten over ~0,8s — elke pass
    // zoekt de kaart vers op (de grid-render kan 'm vervangen) en centreert 'm opnieuw, zodat
    // een late reset altijd wordt gecorrigeerd. De scroll-container is bovendien instabiel
    // (soms de kaart-sectie, soms page-main) — scrollIntoView kiest zelf de juiste.
    const sel = '.planning-erm-card[data-id="' + String(target.id).replace(/["\\]/g, "\\$&") + '"]';
    let highlighted = false;
    const scrollPass = () => {
      const card = document.querySelector(sel);
      if (!card) return;
      try { card.scrollIntoView({ block: "center", inline: "center" }); } catch (e) { try { card.scrollIntoView(); } catch (e2) { /* */ } }
      if (!highlighted) {
        highlighted = true;
        card.classList.add("planning-erm-card--justedited");
        setTimeout(() => { const c = document.querySelector(sel); if (c) c.classList.remove("planning-erm-card--justedited"); }, 2600);
      }
    };
    requestAnimationFrame(scrollPass);
    [90, 200, 360, 560, 820].forEach((ms) => setTimeout(scrollPass, ms));
  }
}

function countOverlapInView(items) {
  return buildOverlapConflictIds(items).size;
}

/** Volledige overlap-info in de view: per medewerker de overlappende dienst-paren,
 *  zodat de melding precies toont WELKE diensten botsen en bij WIE. Elke tijdoverlap
 *  telt (ook van één minuut), conform de instelling van de organisatie. */
function overlapConflictsInView(items) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const rows = items
    .map((it) => ({ it, s: parseStartDate(it.start), e: parseStartDate(it.einde), who: String(it.teamlid || "").trim() }))
    .filter((r) => r.s && r.e && r.who);
  const byMember = new Map(); // norm → { naam, pairs: [{a, b}] }
  let pairCount = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (norm(rows[i].who) !== norm(rows[j].who)) continue;
      if (rows[i].s < rows[j].e && rows[j].s < rows[i].e) {
        const key = norm(rows[i].who);
        if (!byMember.has(key)) byMember.set(key, { naam: rows[i].who, pairs: [] });
        const [a, b] = rows[i].s <= rows[j].s ? [rows[i].it, rows[j].it] : [rows[j].it, rows[i].it];
        byMember.get(key).pairs.push({ a, b });
        pairCount++;
      }
    }
  }
  const members = Array.from(byMember.values()).sort((x, y) => x.naam.localeCompare(y.naam, "nl"));
  members.forEach((m) => m.pairs.sort((p, q) => (parseStartDate(p.a.start) - parseStartDate(q.a.start))));
  return { members, pairCount };
}

/** Korte dienst-omschrijving voor de overlap-melding: titel (diensttype of "X 1 op 1") + locatie. */
function overlapShiftLabel(it) {
  const dtParts = rowDiensttypeLabels(it);
  const clientLabel = String(it.client || "").trim();
  const dtKey = resolveDiensttypeKey(dtParts[0] || it.diensttype || it.functie);
  const titel = (dtKey === "1_op_1" && clientLabel)
    ? `${getClientFirstName(clientLabel)} 1 op 1`
    : (dtParts[0] || it.diensttype || it.functie || "Dienst");
  const loc = String(it.locatie || it.vestiging || "").trim();
  return { titel, loc };
}

/** Datum + tijdvak van een dienst, consistent met de kalenderplaatsing (parseStartDate). */
function overlapShiftWhen(it) {
  const d = parseStartDate(it.start);
  const datum = d ? d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }) : "";
  const tijd = `${formatTimeShort(it.start)}–${formatTimeShort(it.einde)}`;
  return `${datum} ${tijd}`.trim();
}

function renderOverlapShiftHtml(it) {
  const { titel, loc } = overlapShiftLabel(it);
  const locHtml = loc ? ` <span class="loc">· ${escapeHtml(loc)}</span>` : "";
  return `<span class="planning-overlap-conf__shift"><span class="ttl">${escapeHtml(titel)}</span>${locHtml}</span>` +
         ` <span class="planning-overlap-conf__when">${escapeHtml(overlapShiftWhen(it))}</span>`;
}

/** Toon/verberg de prominente overlap-waarschuwing met de concrete diensten erbij
 *  (respecteert de AI-instelling ai_overlap_waarschuwing). */
function updateOverlapBanner(items) {
  const banner = document.getElementById("planning-overlap-banner");
  if (!banner) return;
  try {
    let aan = true;
    try {
      const cfg = window.planningSettingsDB?.getSync?.();
      if (cfg && cfg.ai_overlap_waarschuwing === false) aan = false;
    } catch (e) { /* default aan */ }
    const titleEl = document.getElementById("planning-overlap-banner-title");
    const namesEl = document.getElementById("planning-overlap-banner-names");
    const detailsEl = document.getElementById("planning-overlap-banner-details");
    const info = aan ? overlapConflictsInView(items) : { members: [], pairCount: 0 };
    if (!info.members.length) {
      banner.hidden = true;
      if (detailsEl) detailsEl.innerHTML = "";
      if (namesEl) namesEl.textContent = "";
      var hintNone = document.getElementById("planning-top-toggle-hint");
      if (hintNone) hintNone.textContent = "";
      return;
    }
    const m = info.members.length;
    const p = info.pairCount;
    if (titleEl) {
      titleEl.textContent =
        `${m} medewerker${m === 1 ? "" : "s"} dubbel ingeroosterd in deze periode — ${p} overlappende dienst${p === 1 ? "" : "en"}`;
    }
    // Hint op de inklap-toggle: blijft zichtbaar wanneer de kop is ingeklapt, zodat de
    // dubbele-inroostering-waarschuwing niet onopgemerkt blijft.
    var hintEl = document.getElementById("planning-top-toggle-hint");
    if (hintEl) hintEl.textContent = `⚠ ${m} medewerker${m === 1 ? "" : "s"} dubbel ingeroosterd`;
    if (namesEl) namesEl.textContent = "";
    if (detailsEl) {
      // Compacte preview i.p.v. een eigen interne scroll: de banner toont de eerste
      // overlaps inline en blijft zo kort genoeg om als geheel weg te scrollen. De
      // volledige set blijft bereikbaar via "Toon in lijst". (Een eigen overflow-scroll
      // ving voorheen het muiswiel zodat de pagina niet verder scrolde — feedback 2026-06-10.)
      const MAX_PAIRS = 10;
      let shown = 0;
      const blocks = [];
      for (const mem of info.members) {
        if (shown >= MAX_PAIRS) break;
        const memPairs = mem.pairs.slice(0, MAX_PAIRS - shown);
        shown += memPairs.length;
        const pairs = memPairs.map((pr) =>
          `<div class="planning-overlap-conf__pair" data-overlap-shift="${escapeHtml(String(pr.a.id))}" title="Klik om de eerste dienst te openen">` +
            renderOverlapShiftHtml(pr.a) +
            `<span class="planning-overlap-conf__vs" aria-hidden="true">⟷</span>` +
            renderOverlapShiftHtml(pr.b) +
          `</div>`
        ).join("");
        blocks.push(`<div class="planning-overlap-conf"><div class="planning-overlap-conf__who">${escapeHtml(mem.naam)}</div>${pairs}</div>`);
      }
      const remaining = p - shown;
      let html = blocks.join("");
      if (remaining > 0) {
        html += `<div class="planning-overlap-conf__more">+ ${remaining} meer overlappende dienst${remaining === 1 ? "" : "en"} — klik “Toon in lijst” voor alle dubbel-ingeroosterde diensten.</div>`;
      }
      detailsEl.innerHTML = html;
    }
    banner.hidden = false;
  } catch (err) {
    /* Faalt veilig: een fout in de overlap-melding mag de rest van de planning nooit breken. */
    if (window.console) console.warn("Overlap-melding kon niet worden opgebouwd:", err);
    banner.hidden = true;
  }
}

function setListMode(isList) {
  ui.isList = isList;
  const pCal = document.getElementById("planning-view-calendar-panel");
  const pList = document.getElementById("planning-view-list-panel");
  const sec = document.getElementById("planning-calendar-section");
  const listBtn = document.getElementById("planning-view-list");
  const rosterBtn = document.getElementById("planning-view-roster");
  const bDay = document.getElementById("planning-cal-day");
  const bWeek = document.getElementById("planning-cal-week");
  const bMonth = document.getElementById("planning-cal-month");
  [bDay, bWeek, bMonth].forEach((b) => b?.classList.remove("is-disabled"));
  if (listBtn) {
    listBtn.classList.toggle("is-active", isList);
    listBtn.setAttribute("aria-selected", isList ? "true" : "false");
  }
  if (rosterBtn) {
    rosterBtn.classList.toggle("is-active", !isList);
    rosterBtn.setAttribute("aria-selected", !isList ? "true" : "false");
  }
  if (pCal) pCal.hidden = isList;
  if (pList) pList.hidden = !isList;
  if (sec) sec.classList.toggle("planning-main--list", isList);
  const t = document.getElementById("planning-panel-title");
  if (t) t.textContent = isList ? "Lijst" : { day: "Dagrooster", week: "Weekrooster", month: "Maandoverzicht" }[ui.calMode] || "Rooster";
}

function setCalMode(mode) {
  ui.calMode = mode;
  const bDay = document.getElementById("planning-cal-day");
  const bWeek = document.getElementById("planning-cal-week");
  const bMonth = document.getElementById("planning-cal-month");
  const map = { day: bDay, week: bWeek, month: bMonth };
  Object.entries(map).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle("is-active", k === mode);
    el.setAttribute("aria-selected", k === mode ? "true" : "false");
  });
  updatePeriodUI();
}

function renderAllViews() {
  const dataState = buildDataState();
  ensurePlanningSeed(dataState);
  if (filterState.locatieToolbar && !dataState.hrVestigingen.includes(filterState.locatieToolbar)) {
    filterState.locatieToolbar = "";
  }
  if (!ui.weekStart) {
    ui.weekStart = getMonday(new Date());
    // Auto-jump: als huidige week 0 records heeft maar er zijn shifts elders
    // (bv. BS2-imports met oudere data), spring naar week van meest recente shift.
    // Zo ziet user data bij eerste open, ipv lege "deze week"-view.
    try {
      const allShifts = (dataState && Array.isArray(dataState.shifts)) ? dataState.shifts : [];
      if (allShifts.length > 0) {
        const cw = ui.weekStart;
        const cwEnd = new Date(cw); cwEnd.setDate(cw.getDate() + 7);
        let currentWeekHasData = false;
        let latestStart = null;
        for (const s of allShifts) {
          const startStr = s.start || s.start_iso || s.startIso || null;
          if (!startStr) continue;
          const d = new Date(startStr);
          if (!isFinite(d.getTime())) continue;
          if (d >= cw && d < cwEnd) { currentWeekHasData = true; break; }
          if (!latestStart || d > latestStart) latestStart = d;
        }
        if (!currentWeekHasData && latestStart) {
          ui.weekStart = getMonday(latestStart);
        }
      }
    } catch (e) { /* fallback: laat default huidige week */ }
  }
  if (!ui.dayDate) ui.dayDate = new Date();
  if (!ui.monthDate) ui.monthDate = new Date();
  if (ui.dayDate) ui.dayDate = new Date(ui.dayDate);
  if (ui.monthDate) ui.monthDate = new Date(ui.monthDate);

  /* Vereenvoudigd filter-UI uit screenshot: enkel de zichtbare filters wiren. */
  renderFilterDiensttypeMultiselect();
  renderSimpleSelect("filter-teamlid", dataState.medewerkers, filterState.teamlid, "Selecteer een teamlid");
  renderSimpleSelect("filter-client", dataState.clienten, filterState.client, "Selecteer Cliënt");
  // Werkvloer ziet enkel de locatie(s) waar hij bevoegd is — beperk ook de keuzelijst.
  var locOpties = dataState.hrVestigingen;
  var ownLocs = planningOwnLocatieSet();
  if (ownLocs) {
    locOpties = (dataState.hrVestigingen || []).filter(function (n) {
      return ownLocs.has(String(n || "").toLowerCase().trim());
    });
    if (filterState.locatieToolbar && !ownLocs.has(String(filterState.locatieToolbar).toLowerCase().trim())) {
      filterState.locatieToolbar = "";
    }
  }
  renderSimpleSelect("planning-loc-select", locOpties, filterState.locatieToolbar, "Selecteer Locatie");
  syncAssignStatusRadios();

  let items = getItemsForView();
  // Kerngetallen + resultaat-teller volgen de locatie-weergave: alleen diensten
  // op de zichtbare cliëntwoningen tellen mee (geen test-/overhead-locaties).
  if (ui.rowAxis === "vestiging") {
    items = items.filter((it) => isPlanningZichtbareGroep(getRowKey(it)));
  }
  updatePeriodUI();
  renderSummary(items);
  if (!ui.isList) renderWeekGrid();
  renderListTable();
  const meta = document.getElementById("planning-result-meta");
  if (meta) {
    const n = items.length;
    const ov = countOverlapInView(items);
    let t = `${n} dienst${n === 1 ? "" : "en"} in deze periode (filters actief)`;
    if (ov > 0) t += ` — ${ov} betrokken bij overlappende tijd (zelfde medewerker)`;
    meta.textContent = t;
  }
  updateOverlapBanner(items);
  updateBeschikkingBanner();
  renderMonthStrip();
  return dataState;
}

function renderSimpleSelect(selectId, items, selected, placeholder) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cur = String(selected || "");
  sel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder || "Selecteer…";
  sel.appendChild(ph);
  (Array.isArray(items) ? items : []).forEach((value) => {
    if (value == null || String(value).trim() === "") return;
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = String(value);
    if (cur && cur === String(value)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (cur && !Array.from(sel.options).some((o) => o.value === cur)) {
    /* Geselecteerde waarde bestaat niet meer (bv. medewerker uit HR verwijderd) → reset */
    sel.value = "";
  }
}

function syncAssignStatusRadios() {
  const cur = filterState.assignStatus || "alle";
  document.querySelectorAll('input[name="planning-assign-status"]').forEach((r) => {
    r.checked = r.value === cur;
  });
}

function getItemById(id) {
  return readPlanningItems().find((x) => x.id === id);
}

let planningDiensttypeListOpen = false;
let planningDiensttypeDocClose = null;

function closePlanningDiensttypeList() {
  const list = document.getElementById("dienst-diensttype-list");
  const tr = document.getElementById("dienst-diensttype-trigger");
  if (list) list.setAttribute("hidden", "");
  if (tr) {
    tr.setAttribute("aria-expanded", "false");
  }
  planningDiensttypeListOpen = false;
  if (planningDiensttypeDocClose) {
    document.removeEventListener("click", planningDiensttypeDocClose, true);
    planningDiensttypeDocClose = null;
  }
}

function openPlanningDiensttypeList() {
  const list = document.getElementById("dienst-diensttype-list");
  const tr = document.getElementById("dienst-diensttype-trigger");
  const wrap = document.getElementById("dienst-diensttype-wrap");
  if (!list || !tr || !wrap) return;
  closePlanningDiensttypeList();
  list.removeAttribute("hidden");
  tr.setAttribute("aria-expanded", "true");
  planningDiensttypeListOpen = true;
  planningDiensttypeDocClose = (e) => {
    if (wrap.contains(e.target)) return;
    closePlanningDiensttypeList();
  };
  document.addEventListener("click", planningDiensttypeDocClose, true);
}

function togglePlanningDiensttypeList() {
  if (planningDiensttypeListOpen) closePlanningDiensttypeList();
  else openPlanningDiensttypeList();
}

function getSelectedDiensttypeValuesSet() {
  const list = document.getElementById("dienst-diensttype-list");
  if (!list) return new Set();
  const s = new Set();
  list.querySelectorAll('input[type="checkbox"][data-dt-value]:checked').forEach((cb) => {
    s.add(cb.getAttribute("data-dt-value") || "");
  });
  return s;
}

function applyDienstFormOneOnOneState() {
  const list = document.getElementById("dienst-diensttype-list");
  const label = document.getElementById("dienst-client-label");
  const hint = document.getElementById("dienst-client-hint");
  const select = document.getElementById("dienst-client");
  if (!list || !label) return;
  let isOneOnOne = false;
  list.querySelectorAll('input[type="checkbox"][data-dt-value]:checked').forEach((cb) => {
    const v = String(cb.getAttribute("data-dt-value") || "");
    if (resolveDiensttypeKey(v) === "1_op_1") isOneOnOne = true;
  });
  if (isOneOnOne) {
    label.innerHTML = 'Jongere voor 1-op-1 begeleiding <span class="planning-dienst-opt">(optioneel)</span>';
    if (hint) hint.hidden = false;
    if (select) select.setAttribute("aria-label", "Jongere voor 1-op-1 begeleiding");
  } else {
    label.innerHTML = 'Cliënt <span class="planning-dienst-opt">(optioneel)</span>';
    if (hint) hint.hidden = true;
    if (select) select.setAttribute("aria-label", "Cliënt");
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Individuele dienst (1-op-1 / ambulant): cliënt↔teamlid-koppelingen.
 *
 * Bij "Groepsdienst" werkt het paneel zoals vanouds: één dienst → één
 * medewerker (+ optioneel één cliënt). Bij "Individueel" koppel je per cliënt
 * een teamlid, elk met eigen tijden en eigen weekdagen. Elke koppeling × elke
 * geselecteerde dag binnen de periode wordt één planning-rij — exact hetzelfde
 * datamodel als de bestaande "<naam> 1 op 1"-diensten (één rij = één dienst met
 * client + teamlid). Geen schaduwtabel; gericht via planningDB.add().
 * ───────────────────────────────────────────────────────────────────────── */
const PLANNING_WEEKDAGEN = [
  { dow: 1, label: "Ma" }, { dow: 2, label: "Di" }, { dow: 3, label: "Wo" },
  { dow: 4, label: "Do" }, { dow: 5, label: "Vr" }, { dow: 6, label: "Za" }, { dow: 0, label: "Zo" },
];

// Laatst opgebouwde dataState (medewerkers/cliënten-lijsten) zodat een nieuwe
// koppelingsrij zijn selects kan vullen zonder buildDataState opnieuw te draaien.
let lastDienstDataState = null;

function dateOnlyFromInput(dateStr) {
  if (!dateStr) return null;
  const [Y, M, D] = String(dateStr).split("-").map((x) => parseInt(x, 10));
  if (Number.isNaN(Y) || Number.isNaN(M) || Number.isNaN(D)) return null;
  return new Date(Y, M - 1, D, 0, 0, 0, 0);
}

function fillSelectFromArray(sel, arr, placeholder) {
  if (!sel) return;
  sel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder || "Selecteer…";
  sel.appendChild(ph);
  (Array.isArray(arr) ? arr : []).forEach((t) => {
    if (t == null || String(t).trim() === "") return;
    const o = document.createElement("option");
    o.value = String(t);
    o.textContent = String(t);
    sel.appendChild(o);
  });
}

function syncDienstModusButtons() {
  const map = { groep: "dienst-modus-groep", individueel: "dienst-modus-individueel" };
  Object.keys(map).forEach((m) => {
    const btn = document.getElementById(map[m]);
    if (!btn) return;
    const on = ui.dienstModus === m;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function applyDienstModus() {
  const form = document.getElementById("planning-dienst-form");
  if (!form) return;
  const individueel = ui.dienstModus === "individueel";
  form.querySelectorAll(".dienst-only-groep").forEach((el) => { el.hidden = individueel; });
  form.querySelectorAll(".dienst-only-ind").forEach((el) => { el.hidden = !individueel; });
  syncDienstModusButtons();
  if (individueel) {
    // De klassieke "Herhaling / periode" hoort niet bij individueel (die heeft
    // een eigen vanaf/tot-periode): zet 'm uit zodat repeat-options niet zichtbaar blijft.
    const herh = document.getElementById("dienst-herhaal");
    if (herh) herh.checked = false;
    syncDienstRepeatOptions();
    // Neem de (verborgen) hoofd-startdatum over als 'vanaf'-datum zolang die nog leeg is.
    const vanaf = document.getElementById("dienst-ind-vanaf");
    const sd = document.getElementById("dienst-startdate");
    if (vanaf && !vanaf.value && sd && sd.value) vanaf.value = sd.value;
    ensureOneKoppelRow();
    updateKoppelTel();
  }
}

function setDienstModus(modus) {
  ui.dienstModus = modus === "individueel" ? "individueel" : "groep";
  applyDienstModus();
}

function defaultKoppelTijden() {
  const list = document.getElementById("dienst-koppel-list");
  const rows = list ? list.querySelectorAll("[data-koppel-rij]") : [];
  if (rows.length) {
    const last = rows[rows.length - 1];
    const van = last.querySelector('[data-k="van"]')?.value;
    const tot = last.querySelector('[data-k="tot"]')?.value;
    if (van && tot) return { van, tot };
  }
  const hv = document.getElementById("dienst-starttime")?.value;
  const ht = document.getElementById("dienst-eindtime")?.value;
  return { van: hv || "09:00", tot: ht || "17:00" };
}

function defaultKoppelDagen() {
  const vanaf = document.getElementById("dienst-ind-vanaf")?.value || document.getElementById("dienst-startdate")?.value;
  const d = dateOnlyFromInput(vanaf);
  return d ? new Set([d.getDay()]) : new Set();
}

function makeKoppelRow(prefill) {
  const data = lastDienstDataState || buildDataState();
  const tij = (prefill && prefill.van && prefill.tot) ? { van: prefill.van, tot: prefill.tot } : defaultKoppelTijden();
  const dagen = (prefill && prefill.dagen) ? new Set(prefill.dagen) : defaultKoppelDagen();

  const rij = document.createElement("div");
  rij.className = "planning-dienst-koppel-rij";
  rij.setAttribute("data-koppel-rij", "");

  // Rij 1: cliënt + teamlid + verwijderknop
  const top = document.createElement("div");
  top.className = "planning-dienst-koppel-rij-top";

  const cWrap = document.createElement("div");
  cWrap.className = "planning-dienst-koppel-veld";
  const cLab = document.createElement("span");
  cLab.className = "planning-dienst-koppel-mini";
  cLab.textContent = "Cliënt";
  const cSel = document.createElement("select");
  cSel.className = "planning-dienst-input";
  cSel.setAttribute("data-k", "client");
  cSel.setAttribute("data-searchable", "");
  fillSelectFromArray(cSel, data.clienten, "Selecteer cliënt");
  if (prefill && prefill.client) cSel.value = prefill.client;
  cWrap.appendChild(cLab);
  cWrap.appendChild(cSel);

  const tWrap = document.createElement("div");
  tWrap.className = "planning-dienst-koppel-veld";
  const tLab = document.createElement("span");
  tLab.className = "planning-dienst-koppel-mini";
  tLab.textContent = "Teamlid";
  const tSel = document.createElement("select");
  tSel.className = "planning-dienst-input";
  tSel.setAttribute("data-k", "teamlid");
  tSel.setAttribute("data-searchable", "");
  fillSelectFromArray(tSel, data.medewerkers, "Selecteer teamlid");
  if (prefill && prefill.teamlid) tSel.value = prefill.teamlid;
  tWrap.appendChild(tLab);
  tWrap.appendChild(tSel);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "planning-dienst-koppel-del";
  del.setAttribute("aria-label", "Koppeling verwijderen");
  del.innerHTML = '<span aria-hidden="true">×</span>';
  del.addEventListener("click", () => {
    rij.remove();
    ensureOneKoppelRow();
    updateKoppelTel();
  });

  top.appendChild(cWrap);
  top.appendChild(tWrap);
  top.appendChild(del);

  // Rij 2: van/tot tijd
  const tijd = document.createElement("div");
  tijd.className = "planning-dienst-koppel-rij-tijd";
  const mkTime = (k, label, val) => {
    const w = document.createElement("div");
    w.className = "planning-dienst-koppel-veld";
    const l = document.createElement("span");
    l.className = "planning-dienst-koppel-mini";
    l.textContent = label;
    const inp = document.createElement("input");
    inp.type = "time";
    inp.step = "60";
    inp.className = "planning-dienst-input";
    inp.setAttribute("data-k", k);
    inp.setAttribute("data-besa-timetype", "");
    inp.setAttribute("placeholder", "uu:mm");
    inp.value = val || "";
    w.appendChild(l);
    w.appendChild(inp);
    // Direct verrijken (vlot typbaar uu:mm); fallback voor de observer.
    if (window.BesaTimeTyping && typeof window.BesaTimeTyping.enhance === "function") {
      window.BesaTimeTyping.enhance(inp);
    }
    return w;
  };
  tijd.appendChild(mkTime("van", "Van", tij.van));
  tijd.appendChild(mkTime("tot", "Tot", tij.tot));

  // Rij 3: weekdagen
  const dagenWrap = document.createElement("div");
  dagenWrap.className = "planning-dienst-koppel-dagen";
  dagenWrap.setAttribute("role", "group");
  dagenWrap.setAttribute("aria-label", "Dagen van de week");
  PLANNING_WEEKDAGEN.forEach((wd) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "planning-dienst-dag-chip";
    chip.setAttribute("data-dow", String(wd.dow));
    chip.textContent = wd.label;
    const on = dagen.has(wd.dow);
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    chip.addEventListener("click", () => {
      const now = chip.classList.toggle("is-on");
      chip.setAttribute("aria-pressed", now ? "true" : "false");
      updateKoppelTel();
    });
    dagenWrap.appendChild(chip);
  });

  rij.appendChild(top);
  rij.appendChild(tijd);
  rij.appendChild(dagenWrap);
  return rij;
}

function addKoppelRow(prefill) {
  const list = document.getElementById("dienst-koppel-list");
  if (!list) return;
  list.appendChild(makeKoppelRow(prefill));
  updateKoppelTel();
}

function ensureOneKoppelRow() {
  const list = document.getElementById("dienst-koppel-list");
  if (list && list.querySelectorAll("[data-koppel-rij]").length === 0) addKoppelRow();
}

function resetKoppelRows() {
  const list = document.getElementById("dienst-koppel-list");
  if (list) list.innerHTML = "";
  const tel = document.getElementById("dienst-koppel-tel");
  if (tel) { tel.hidden = true; tel.textContent = ""; }
  const vanaf = document.getElementById("dienst-ind-vanaf");
  const tot = document.getElementById("dienst-ind-tot");
  if (vanaf) vanaf.value = "";
  if (tot) tot.value = "";
  const zs = document.getElementById("dienst-zorgsoort");
  if (zs) zs.value = "";
  const tar = document.getElementById("dienst-koppel-tarief");
  if (tar) { tar.hidden = true; tar.innerHTML = ""; }
}

function readKoppelRows() {
  const list = document.getElementById("dienst-koppel-list");
  if (!list) return [];
  return Array.from(list.querySelectorAll("[data-koppel-rij]")).map((rij) => {
    const dagen = new Set();
    rij.querySelectorAll(".planning-dienst-dag-chip.is-on").forEach((c) => {
      const dow = parseInt(c.getAttribute("data-dow"), 10);
      if (!Number.isNaN(dow)) dagen.add(dow);
    });
    return {
      client: (rij.querySelector('[data-k="client"]')?.value || "").trim(),
      teamlid: (rij.querySelector('[data-k="teamlid"]')?.value || "").trim(),
      van: rij.querySelector('[data-k="van"]')?.value || "",
      tot: rij.querySelector('[data-k="tot"]')?.value || "",
      dagen,
    };
  });
}

/**
 * Gedeelde item-bouw voor de individuele modus — gebruikt door de teller, de live
 * beschikking-urencheck én het daadwerkelijk aanmaken (één code-pad). Puur, zonder
 * UI-feedback. Retourneert { items, truncated, error } met error = {title, body} of null.
 */
function buildKoppelItems() {
  const fail = (title, body) => ({ items: [], truncated: false, error: { title, body } });
  const diensttype = getSelectedDiensttypeFieldString().trim();
  const locHr = document.getElementById("dienst-locatie-hr")?.value || "";
  if (!diensttype || !locHr) {
    return fail("Verplichte velden", !diensttype
      ? "Selecteer minstens één diensttype (de lijst volgt de compensatie-instellingen)."
      : "Selecteer een locatie.");
  }
  const zorgsoort = (document.getElementById("dienst-zorgsoort")?.value || "").trim();
  if (!zorgsoort) {
    return fail("Zorgsoort ontbreekt",
      "Kies een zorgsoort (1-op-1, ambulant intern/extern of WLZ) — die bepaalt het tarief en de financiële uitsplitsing.");
  }
  const vanaf = document.getElementById("dienst-ind-vanaf")?.value;
  const totRaw = document.getElementById("dienst-ind-tot")?.value || "";
  if (!vanaf) return fail("Periode ontbreekt", "Kies een 'vanaf'-datum voor de koppelingen.");
  const startD = dateOnlyFromInput(vanaf);
  const endD = totRaw ? dateOnlyFromInput(totRaw) : (startD ? new Date(startD) : null);
  if (!startD || !endD) return fail("Ongeldige datum", "Controleer de 'vanaf'- en 'tot en met'-datum.");
  if (endD < startD) return fail("Ongeldige periode", "De 'tot en met'-datum ligt vóór de 'vanaf'-datum.");

  const rowsAll = readKoppelRows();
  // Tijden zijn NIET verplicht: een koppeling zonder tijd wordt aangemaakt als dienst
  // zonder tijdvak (de planner kan de tijd later met Bewerken invullen).
  const rows = rowsAll.filter((r) => r.client && r.teamlid && r.dagen.size);
  if (!rows.length) {
    return fail("Koppeling onvolledig", rowsAll.length === 0
      ? "Voeg minstens één cliënt↔teamlid-koppeling toe."
      : "Kies per koppeling een cliënt, een teamlid én minstens één dag van de week (de tijden mag je leeg laten en later invullen).");
  }

  const pauze = Math.max(0, parseFloat(document.getElementById("dienst-pauze")?.value) || 0);
  const richt = document.getElementById("dienst-beschrijving");
  const besch = (richt && richt.innerHTML.trim()) || "";
  const dState = buildDataState();
  const afd = dState.afdelingen[0] || "Overig";
  const teamlead = dState.teamlead[0] || "";
  const MAX_REPEAT = 1000;

  const items = [];
  let truncated = false;
  const cur = new Date(startD);
  for (let guard = 0; guard < 4000; guard++) {
    if (cur > endD) break;
    const dow = cur.getDay();
    const dateStr = toDateInputValue(cur);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.dagen.has(dow)) continue;
      let startIso, endIso;
      if (r.van && r.tot) {
        startIso = combineDateTimeToLocalIso(dateStr, r.van);
        endIso = combineDateTimeToLocalIso(dateStr, r.tot);
        if (!startIso || !endIso) continue;
        // Nachtdienst: eindtijd ≤ starttijd → loopt door tot de volgende dag.
        if (parseStartDate(endIso) <= parseStartDate(startIso)) {
          const nd = new Date(cur);
          nd.setDate(nd.getDate() + 1);
          endIso = combineDateTimeToLocalIso(toDateInputValue(nd), r.tot);
        }
      } else {
        // Geen (volledige) tijd opgegeven: dienst zonder tijdvak op deze dag. start=einde
        // → 0 uur, telt (nog) niet mee voor de beschikking-urenbewaking; "tijd nog in te vullen".
        startIso = combineDateTimeToLocalIso(dateStr, "00:00");
        endIso = startIso;
      }
      if (items.length >= MAX_REPEAT) { truncated = true; break; }
      items.push(normalizeItem({
        id: makePlanningId(),
        afdeling: afd,
        diensttype,
        functie: diensttype,
        zorgsoort,
        teamlead,
        teamlid: r.teamlid,
        client: r.client,
        vestiging: locHr,
        locatie: locHr,
        start: startIso,
        einde: endIso,
        pauzeUren: pauze,
        vereistAantalMedewerkers: 1,
        competenties: "",
        beschrijving: besch,
        herhaal: false,
        leer: 0,
        sterren: 0,
        conflict: false,
      }));
    }
    if (truncated) break;
    cur.setDate(cur.getDate() + 1);
  }
  if (!items.length) {
    return fail("Geen diensten", "Binnen de gekozen periode valt geen enkele geselecteerde weekdag. Pas de dagen of de periode aan.");
  }
  return { items, truncated, error: null };
}

function updateKoppelTel() {
  const tel = document.getElementById("dienst-koppel-tel");
  if (ui.dienstModus !== "individueel") {
    if (tel) tel.hidden = true;
    updateKoppelBeschikkingMelding([]);
    updateKoppelTariefIndicatie([]);
    return;
  }
  const res = buildKoppelItems();
  const n = res.items.length;
  if (tel) {
    if (n <= 0) { tel.hidden = true; tel.textContent = ""; }
    else { tel.textContent = n === 1 ? "Dit maakt 1 dienst aan." : ("Dit maakt " + n + " diensten aan."); tel.hidden = false; }
  }
  updateKoppelTariefIndicatie(res.items);
  // Live beschikking-urencheck: bestaande planning + de nieuw te maken diensten,
  // beperkt tot de cliënten die in dit formulier voorkomen.
  const bestaand = (window.planningDB && window.planningDB.getAllSync) ? window.planningDB.getAllSync() : [];
  const formClients = new Set(res.items.map((it) => String(it.client || "").trim().toLowerCase()).filter(Boolean));
  const over = computeBeschikkingOverschrijdingen(bestaand, res.items)
    .filter((o) => formClients.has(o.client.toLowerCase()));
  updateKoppelBeschikkingMelding(over);
}

/** Toont/verbergt de live "meer uren dan beschikt"-melding in het dienst-paneel. */
function updateKoppelBeschikkingMelding(list) {
  const el = document.getElementById("dienst-koppel-beschikking");
  if (!el) return;
  if (!Array.isArray(list) || list.length === 0) { el.hidden = true; el.innerHTML = ""; return; }
  const rows = list.slice(0, 6).map((o) =>
    `<li><strong>${escapeHtml(o.client)}</strong> — ${escapeHtml(o.zorgsoortLabel)}, ${escapeHtml(isoWeekLabel(o.week))}: <strong>${o.gepland} u</strong> gepland t.o.v. <strong>${o.budget} u</strong> beschikt (${o.over} u te veel)</li>`
  ).join("");
  const meer = list.length > 6 ? `<li>… en nog ${list.length - 6} meer</li>` : "";
  el.innerHTML = `<div class="planning-koppel-besch-kop">Meer uren dan beschikt</div><ul class="planning-koppel-besch-list">${rows}${meer}</ul>`;
  el.hidden = false;
}

/** Live geschatte opbrengst & kosten voor de te maken individuele diensten (deze invoer).
 *  Opbrengst = (uren / eenheidfactor) × zorgsoort.tarief; kosten = uren × medewerker-uurkosten
 *  (ZZP-tarief of geschatte loonkosten; open dienst → zorgsoort.kostenTarief indien ingesteld). */
function updateKoppelTariefIndicatie(items) {
  const el = document.getElementById("dienst-koppel-tarief");
  if (!el) return;
  const zsNaam = (document.getElementById("dienst-zorgsoort")?.value || "").trim();
  if (!zsNaam || !Array.isArray(items) || items.length === 0) { el.hidden = true; el.innerHTML = ""; return; }
  let zs = null;
  try {
    const list = (window.zorgsoortenDB && window.zorgsoortenDB.getAllSync()) || [];
    zs = list.find((z) => z && z.naam && z.naam.toLowerCase() === zsNaam.toLowerCase()) || null;
  } catch (e) { zs = null; }
  const eenheid = (zs && zs.tarieftype) ? String(zs.tarieftype).toLowerCase() : "uur";
  const factor = eenheid === "dag" ? 24 : (eenheid === "week" ? 168 : 1);
  const tarief = (zs && zs.tarief != null && isFinite(Number(zs.tarief))) ? Number(zs.tarief) : null;
  const kostenTarief = (zs && zs.kostenTarief != null && isFinite(Number(zs.kostenTarief))) ? Number(zs.kostenTarief) : null;

  let totUren = 0, omzet = 0, kosten = 0, kostenOnbekend = false;
  items.forEach((it) => {
    const u = dienstNettoUren(it);
    if (u <= 0) return;
    totUren += u;
    if (tarief != null) omzet += (u / factor) * tarief;
    const r = geschatteUurkostenVoorTeamlid(it.teamlid);
    if (r != null) kosten += u * r;
    else if (kostenTarief != null) kosten += u * kostenTarief;
    else if (String(it.teamlid || "").trim()) kostenOnbekend = true;
  });

  const eur = (n) => "€ " + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const parts = [`<strong>${(Math.round(totUren * 10) / 10).toLocaleString("nl-NL")} u</strong> gepland`];
  if (tarief != null) parts.push(`opbrengst ± <strong>${eur(omzet)}</strong>`);
  parts.push(`kosten ± <strong>${eur(kosten)}</strong>`);
  if (tarief != null) {
    const res = omzet - kosten;
    parts.push(`resultaat <strong class="${res >= 0 ? "kt-pos" : "kt-neg"}">${eur(res)}</strong>`);
  }
  let html = `<div class="planning-koppel-tarief-kop">Geschat voor deze diensten</div><div class="planning-koppel-tarief-row">${parts.join(" · ")}</div>`;
  const noten = [];
  if (tarief == null) noten.push('Geen opbrengsttarief ingesteld voor "' + zsNaam + '" — stel het in bij Zorgsoorten.');
  if (kostenOnbekend) noten.push("Voor één of meer toegewezen medewerkers is geen uurtarief/salaris bekend (niet in de kosten meegerekend).");
  if (noten.length) html += `<div class="planning-koppel-tarief-note">${noten.map(escapeHtml).join(" ")}</div>`;
  el.innerHTML = html;
  el.hidden = false;
}

/** Bouwt de planning-rijen voor de individuele modus; toont een melding +
 *  retourneert null bij een ongeldige invoer. */
function generateIndividueleDiensten() {
  const res = buildKoppelItems();
  if (res.error) {
    if (typeof window.showActionFeedback === "function") window.showActionFeedback("info", res.error.title, res.error.body);
    return null;
  }
  return { items: res.items, truncated: res.truncated };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Beschikking-urenbewaking (1-op-1 / ambulant).
 *
 * Een cliënt heeft in de beschikking X uur per week (uur-zorgsoorten zoals
 * Ambulant intern / WLZ; veld `data.urenPerWeek`). In het rooster mag voor die
 * cliënt niet méér individuele (1-op-1/ambulante) zorg per week worden ingepland
 * dan beschikt; bij overschrijding → rode melding (banner + in het dienst-paneel).
 *
 * Matching: dienst.client (naam) → cliënt → bs2_id → beschikking.client_id.
 * Elke cliënt heeft in de huidige data max. 1 uur-beschikking, dus de zorgsoort is
 * eenduidig; er wordt tóch per zorgsoort gegroepeerd zodat het klopt blijft als er
 * later meerdere bijkomen. Een lege `urenPerWeek` = geen limiet → geen melding.
 * ───────────────────────────────────────────────────────────────────────── */

/** ISO-8601 weeksleutel "JJJJ-Wnn" (week begint op maandag). */
function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7; // zondag = 7
  date.setUTCDate(date.getUTCDate() + 4 - day); // donderdag van deze ISO-week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

/** Leesbaar weeklabel "wk 24 · 2026" bij een isoWeekKey. */
function isoWeekLabel(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(key || ""));
  if (!m) return String(key || "");
  return "wk " + parseInt(m[2], 10) + " · " + m[1];
}

/** Telt deze dienst als individuele (1-op-1 / ambulant) zorg tegen de beschikking? */
function isIndividueleZorgDienst(it) {
  const t = String((it && (it.diensttype || it.functie)) || "").toLowerCase();
  const loc = String((it && (it.locatie || it.vestiging)) || "").toLowerCase();
  if (/1\s*op\s*1|1op1|een op een/.test(t)) return true;
  if (/ambulant/.test(t) || /ambulant/.test(loc)) return true;
  return false;
}

/** Netto geplande uren van een dienst (duur minus pauze); 0 bij ontbrekende/0-tijd. */
function dienstNettoUren(it) {
  const s = parseStartDate(it && it.start);
  const e = parseStartDate(it && it.einde);
  if (!s || !e) return 0;
  let u = (e.getTime() - s.getTime()) / 3600000 - Math.max(0, Number(it && it.pauzeUren) || 0);
  return u > 0 ? u : 0;
}

/**
 * Index: genormaliseerde cliëntnaam → lopende uur-beschikking(en)
 * { zorgsoortKey, zorgsoortLabel, urenWeek, startISO, eindISO }.
 */
function buildBeschikkingUrenIndex() {
  const byName = new Map();
  if (!window.beschikkingenDB || typeof window.beschikkingenDB.getAllSync !== "function") return byName;
  if (!window.clientenDB || typeof window.clientenDB.getAllSync !== "function") return byName;
  // bs2_id → cliëntnaam (clienten-data.js spreidt `data` top-level → c.bs2_id)
  const idToName = new Map();
  (window.clientenDB.getAllSync() || []).forEach((c) => {
    if (!c) return;
    const naam = (`${String(c.voornaam || "").trim()} ${String(c.achternaam || "").trim()}`.trim()) || String(c.naam || "").trim();
    const bs2 = String(c.bs2_id || (c.data && c.data.bs2_id) || "");
    if (bs2 && naam) idToName.set(bs2, naam);
  });
  (window.beschikkingenDB.getAllSync() || []).forEach((b) => {
    if (!b || b.gearchiveerd) return;
    if (String(b.tariefEenheid || "") !== "uur") return;
    const fase = String(b.fase || "").toLowerCase();
    if (fase === "in aanvraag" || fase === "beëindigd" || fase === "beeindigd" || fase === "afgewezen") return;
    const naam = idToName.get(String(b.clientId || ""));
    if (!naam) return;
    const key = naam.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push({
      zorgsoortKey: b.zorgsoortKey || "uur",
      zorgsoortLabel: b.zorgsoortLabel || b.zorgsoortKey || "Ambulant",
      urenWeek: Number(b._data && b._data.urenPerWeek) || 0,
      startISO: b.startISO || "",
      eindISO: b.eindISO || "",
    });
  });
  return byName;
}

/** Valt datum d binnen de (optionele) periode van de beschikking? */
function dienstBinnenBeschikkingPeriode(d, besch) {
  if (!d) return false;
  const ymd = toDateInputValue(d);
  if (besch.startISO && ymd < String(besch.startISO).slice(0, 10)) return false;
  if (besch.eindISO && ymd > String(besch.eindISO).slice(0, 10)) return false;
  return true;
}

/**
 * Berekent per (cliënt × zorgsoort × ISO-week) de geplande individuele uren en
 * vergelijkt met de beschikte urenWeek. Retourneert de overschrijdingen.
 * `extraItems` = nog niet opgeslagen diensten (live in het paneel) tellen mee.
 */
function computeBeschikkingOverschrijdingen(items, extraItems) {
  const index = buildBeschikkingUrenIndex();
  if (index.size === 0) return [];
  const all = (Array.isArray(items) ? items : []).concat(Array.isArray(extraItems) ? extraItems : []);
  const groep = new Map();
  all.forEach((it) => {
    if (!isIndividueleZorgDienst(it)) return;
    const naam = String(it.client || "").trim();
    if (!naam) return;
    const beschList = index.get(naam.toLowerCase());
    if (!beschList || !beschList.length) return;
    const s = parseStartDate(it.start);
    if (!s) return;
    const uren = dienstNettoUren(it);
    if (uren <= 0) return; // diensten zonder ingevulde tijd tellen niet mee
    const besch = beschList.find((b) => dienstBinnenBeschikkingPeriode(s, b)) || beschList[0];
    if (!besch || besch.urenWeek <= 0) return; // geen limiet ingevuld → geen bewaking
    const wk = isoWeekKey(s);
    const k = naam.toLowerCase() + "|" + besch.zorgsoortKey + "|" + wk;
    if (!groep.has(k)) {
      groep.set(k, { client: naam, zorgsoortLabel: besch.zorgsoortLabel, week: wk, budget: besch.urenWeek, gepland: 0 });
    }
    groep.get(k).gepland += uren;
  });
  const out = [];
  groep.forEach((g) => {
    if (g.gepland > g.budget + 1e-6) {
      out.push(Object.assign({}, g, {
        gepland: Math.round(g.gepland * 100) / 100,
        over: Math.round((g.gepland - g.budget) * 100) / 100,
      }));
    }
  });
  out.sort((a, b) => a.client.localeCompare(b.client, "nl") || a.week.localeCompare(b.week));
  return out;
}

/**
 * Rode banner boven de planning: cliënten die in de zichtbare periode boven hun
 * beschikte uren/week zitten (1-op-1 + ambulant). Werkt op ALLE diensten in de
 * zichtbare periode (ongefilterd), zodat de week-som per cliënt volledig is.
 */
function updateBeschikkingBanner() {
  const banner = document.getElementById("planning-besch-banner");
  if (!banner) return;
  const titleEl = document.getElementById("planning-besch-banner-title");
  const detailsEl = document.getElementById("planning-besch-banner-details");
  let over = [];
  try {
    const range = (typeof getVisibleRange === "function") ? getVisibleRange() : null;
    const alle = readPlanningItems().filter((it) => !range || itemOverlapsRange(it, range.start, range.end));
    over = computeBeschikkingOverschrijdingen(alle, null);
  } catch (e) { over = []; }
  if (!over.length) {
    banner.hidden = true;
    if (detailsEl) detailsEl.innerHTML = "";
    return;
  }
  const clientCount = new Set(over.map((o) => o.client.toLowerCase())).size;
  if (titleEl) {
    titleEl.textContent = `${clientCount} cliënt${clientCount === 1 ? "" : "en"} boven de beschikte uren` +
      ` — ${over.length} ${over.length === 1 ? "week" : "weken"} met overschrijding in deze periode`;
  }
  if (detailsEl) {
    // Compacte preview (geen eigen interne scroll meer, zie planning.html): cap op 12 rijen.
    detailsEl.innerHTML = over.slice(0, 12).map((o) =>
      `<div class="planning-besch-row"><b>${escapeHtml(o.client)}</b> — ${escapeHtml(o.zorgsoortLabel)}, ` +
      `${escapeHtml(isoWeekLabel(o.week))}: <b>${o.gepland} u</b> gepland t.o.v. <b>${o.budget} u</b> beschikt ` +
      `(${o.over} u te veel)</div>`
    ).join("") + (over.length > 12 ? `<div class="planning-besch-row">… en nog ${over.length - 12} meer</div>` : "");
  }
  banner.hidden = false;
}

/**
 * PR-F: bij keuze van exact 1 diensttype dat een `standaard_pauze_uren > 0` heeft,
 * autofillen we het pauze-veld — maar enkel als de gebruiker het zelf nog niet
 * heeft aangepast (huidige waarde = 0). Niet handmatige waarden overschrijven.
 */
function maybeAutofillPauseFromDiensttype() {
  const list = document.getElementById("dienst-diensttype-list");
  if (!list || !window.compDiensttypesDB) return;
  const checked = Array.from(list.querySelectorAll('input[type="checkbox"][data-dt-label]:checked'));
  if (checked.length !== 1) return;
  const dtLabel = checked[0].getAttribute("data-dt-label");
  if (!dtLabel) return;
  const all = window.compDiensttypesDB.getAllSync() || [];
  const dt = all.find((d) => String(d.naam || d.diensttype || "").trim().toLowerCase() === String(dtLabel).trim().toLowerCase());
  if (!dt) return;
  const standaard = Number(dt.standaard_pauze_uren) || 0;
  if (standaard <= 0) return;
  const pauzeEl = document.getElementById("dienst-pauze");
  if (!pauzeEl) return;
  const huidig = Number(pauzeEl.value) || 0;
  if (huidig > 0) return; // niet overschrijven
  pauzeEl.value = standaard;
  // Toon hint dat dit auto-gevuld is
  const hint = document.getElementById("dienst-pauze-hint");
  if (hint) {
    hint.textContent = `Auto-gevuld vanuit diensttype \"${dtLabel}\".`;
    hint.hidden = false;
  }
}

/**
 * PR-F: toon comp_saldi-saldo voor gekozen medewerker, met waarschuwing als saldo
 * onder of boven de min/max-drempel uit planning_settings ligt.
 */
function updateCompensatieSaldoHint() {
  const hintEl = document.getElementById("dienst-mw-saldo-hint");
  if (!hintEl) return;
  const sel = document.getElementById("dienst-mw");
  if (!sel || !sel.value) { hintEl.hidden = true; return; }
  const naam = String(sel.value).trim();
  if (!naam) { hintEl.hidden = true; return; }
  let saldo = null;
  try {
    if (window.compSaldiDB && typeof window.compSaldiDB.getAllSync === "function") {
      const all = window.compSaldiDB.getAllSync() || [];
      const row = all.find((r) => String(r.medewerker || "").trim().toLowerCase() === naam.toLowerCase());
      if (row) saldo = Number(row.saldo) || 0;
    }
  } catch (e) { /* */ }
  if (saldo == null) { hintEl.hidden = true; return; }
  const settings = (window.planningSettingsDB && window.planningSettingsDB.getSync && window.planningSettingsDB.getSync()) || {};
  const minDrempel = Number(settings.min_compensatie_uren);
  const maxDrempel = Number(settings.max_compensatie_uren);
  let cls = "planning-dienst-hint";
  let prefix = "Compensatie-saldo: ";
  let suffix = "";
  if (isFinite(maxDrempel) && saldo > maxDrempel) {
    cls += " planning-dienst-hint--warn";
    suffix = ` — boven drempel (${maxDrempel} u), plan minder voor deze medewerker.`;
  } else if (isFinite(minDrempel) && saldo < minDrempel) {
    cls += " planning-dienst-hint--warn";
    suffix = ` — onder drempel (${minDrempel} u), plan meer of bespreek.`;
  }
  hintEl.className = cls;
  hintEl.innerHTML = `${prefix}<strong>${saldo} u</strong>${suffix}`;
  hintEl.hidden = false;
}

function syncPlanningDiensttypeChips() {
  const el = document.getElementById("dienst-diensttype-trigger-text");
  const list = document.getElementById("dienst-diensttype-list");
  if (!el || !list) return;
  const labels = [];
  list.querySelectorAll('input[type="checkbox"][data-dt-label]:checked').forEach((cb) => {
    const lab = cb.getAttribute("data-dt-label");
    if (lab) labels.push(lab);
  });
  el.textContent = labels.length
    ? labels.join(", ")
    : "Selecteer diensttype (compensatie)…";
}

function clearPlanningDiensttypeMultiselect() {
  const list = document.getElementById("dienst-diensttype-list");
  if (list) {
    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
  }
  syncPlanningDiensttypeChips();
  closePlanningDiensttypeList();
}

function setPlanningDiensttypeSelectionFromString(value) {
  // Bij bewerken moet het diensttype van de bestaande dienst vóóraangevinkt staan.
  // renderPlanningDiensttypeMultiselect vinkt aan op `keep.has(o.value)`, waarbij
  // o.value de ruwe diensttype-label is ("Vroege dienst"). De keep-set moet dus uit
  // die optie-values bestaan — niet uit de canonieke keys van resolveDiensttypeKey
  // ("vroege_dienst"), want die matchten nooit waardoor het type leeg bleef en
  // opslaan op "Selecteer minstens één diensttype" strandde. We matchen de
  // gevraagde labels op de werkelijke opties via canonieke key (vangt aliassen) én
  // als terugval via genormaliseerd token (vangt casing/diacritica/spaties).
  const opts = readCompensatieDiensttypeOptions();
  const wantedLabels = rowDiensttypeLabels({ diensttype: value });
  const wantedKeys = new Set(wantedLabels.map((l) => resolveDiensttypeKey(l)).filter(Boolean));
  const wantedTokens = new Set(wantedLabels.map((l) => normalizeDiensttypeToken(l)).filter(Boolean));
  const wanted = new Set(
    opts
      .filter((o) => {
        const k = resolveDiensttypeKey(o.value) || resolveDiensttypeKey(o.label);
        if (k && wantedKeys.has(k)) return true;
        return wantedTokens.has(normalizeDiensttypeToken(o.value)) ||
          wantedTokens.has(normalizeDiensttypeToken(o.label));
      })
      .map((o) => o.value)
  );
  renderPlanningDiensttypeMultiselect(wanted);
  applyDienstFormOneOnOneState();
}

function syncDienstRepeatOptions() {
  const checked = Boolean(document.getElementById("dienst-herhaal")?.checked);
  const options = document.getElementById("dienst-repeat-options");
  if (options) options.hidden = !checked;
}

function getSelectedDiensttypeFieldString() {
  const list = document.getElementById("dienst-diensttype-list");
  if (!list) return "";
  const parts = [];
  list.querySelectorAll('input[type="checkbox"][data-dt-label]:checked').forEach((cb) => {
    const lab = cb.getAttribute("data-dt-label");
    if (lab) parts.push(lab);
  });
  return parts.join(", ");
}

function renderPlanningDiensttypeMultiselect(keepSet) {
  const list = document.getElementById("dienst-diensttype-list");
  if (!list) return;
  const keep = keepSet instanceof Set ? keepSet : getSelectedDiensttypeValuesSet();
  const opts = readCompensatieDiensttypeOptions();
  list.innerHTML = "";
  opts.forEach((o) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.className = "planning-diensttype-li";
    const lab = document.createElement("label");
    lab.className = "planning-diensttype-option";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.setAttribute("data-dt-value", o.value);
    cb.setAttribute("data-dt-label", o.label);
    if (keep.has(o.value)) cb.checked = true;
    const dot = document.createElement("span");
    dot.className = "planning-diensttype-dot";
    dot.style.backgroundColor = o.color;
    dot.setAttribute("aria-hidden", "true");
    const span = document.createElement("span");
    span.className = "planning-diensttype-option-label";
    span.textContent = o.label;
    lab.appendChild(cb);
    lab.appendChild(dot);
    lab.appendChild(span);
    li.appendChild(lab);
    list.appendChild(li);
  });
  syncPlanningDiensttypeChips();
}

/* ----- Sidebar Diensttype-filter multi-select (gelinkt met compensatie) ----- */
let filterDtListOpen = false;
let filterDtDocClose = null;

function closeFilterDtList() {
  const list = document.getElementById("filter-diensttype-list");
  const tr = document.getElementById("filter-diensttype-trigger");
  if (list) list.setAttribute("hidden", "");
  if (tr) tr.setAttribute("aria-expanded", "false");
  filterDtListOpen = false;
  if (filterDtDocClose) {
    document.removeEventListener("click", filterDtDocClose, true);
    filterDtDocClose = null;
  }
}

function openFilterDtList() {
  const list = document.getElementById("filter-diensttype-list");
  const tr = document.getElementById("filter-diensttype-trigger");
  const wrap = document.getElementById("filter-diensttype-wrap");
  if (!list || !tr || !wrap) return;
  closeFilterDtList();
  list.removeAttribute("hidden");
  tr.setAttribute("aria-expanded", "true");
  filterDtListOpen = true;
  filterDtDocClose = (e) => {
    if (wrap.contains(e.target)) return;
    closeFilterDtList();
  };
  document.addEventListener("click", filterDtDocClose, true);
}

function toggleFilterDtList() {
  if (filterDtListOpen) closeFilterDtList();
  else openFilterDtList();
}

function syncFilterDtTriggerText() {
  const el = document.getElementById("filter-diensttype-trigger-text");
  if (!el) return;
  const labels = Array.from(filterState.diensttypes);
  el.textContent = labels.length ? labels.join(", ") : "Selecteer…";
}

function renderFilterDiensttypeMultiselect() {
  const list = document.getElementById("filter-diensttype-list");
  if (!list) return;
  const opts = readCompensatieDiensttypeOptions();
  list.innerHTML = "";
  opts.forEach((o) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.className = "planning-diensttype-li";
    const lab = document.createElement("label");
    lab.className = "planning-diensttype-option";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.setAttribute("data-fdt-label", o.label);
    cb.checked = filterState.diensttypes.has(o.label);
    cb.addEventListener("change", () => {
      if (cb.checked) filterState.diensttypes.add(o.label);
      else filterState.diensttypes.delete(o.label);
      syncFilterDtTriggerText();
      renderAllViews();
    });
    const dot = document.createElement("span");
    dot.className = "planning-diensttype-dot";
    dot.style.backgroundColor = o.color;
    dot.setAttribute("aria-hidden", "true");
    const span = document.createElement("span");
    span.className = "planning-diensttype-option-label";
    span.textContent = o.label;
    lab.appendChild(cb);
    lab.appendChild(dot);
    lab.appendChild(span);
    li.appendChild(lab);
    list.appendChild(li);
  });
  syncFilterDtTriggerText();
}

function fillDienstFormSelects(data) {
  lastDienstDataState = data; // cache voor nieuwe koppelingsrijen (individuele modus)
  const setOpts = (sel, items, placeholder, phVal) => {
    if (!sel) return;
    const current = sel.value;
    const arr = Array.isArray(items) ? items : [];
    sel.innerHTML = "";
    if (placeholder) {
      const o = document.createElement("option");
      o.value = phVal || "";
      o.textContent = placeholder;
      sel.appendChild(o);
    }
    arr.forEach((t) => {
      if (t == null || String(t).trim() === "") return;
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    if (current && arr.map(String).includes(String(current))) sel.value = current;
  };
  renderPlanningDiensttypeMultiselect();
  setOpts(
    document.getElementById("dienst-locatie-hr"),
    getVestigingOptiesVoorForm(data),
    "Selecteer locatie (uit HR / locaties)",
    ""
  );
  setOpts(
    document.getElementById("dienst-mw"),
    data.medewerkers,
    "Selecteer een teamlid",
    ""
  );
  setOpts(
    document.getElementById("dienst-client"),
    data.clienten,
    "Selecteer cliënt",
    ""
  );
  setOpts(
    document.getElementById("dienst-competentie"),
    readCompetentieNamen(),
    "Selecteer competenties",
    ""
  );
  fillZorgsoortSelect();
}

/** Vul de zorgsoort-keuze (individuele modus) uit de zorgsoorten-data-laag. De vier
 *  cliënt-zorgsoorten (1-op-1, ambulant intern/extern, WLZ) staan bovenaan. Bewaart de
 *  huidige keuze. Het tarief staat als context achter de naam ("Ambulant intern — € 80/uur"). */
function fillZorgsoortSelect() {
  const sel = document.getElementById("dienst-zorgsoort");
  if (!sel) return;
  const current = sel.value;
  let list = [];
  try { list = (window.zorgsoortenDB && window.zorgsoortenDB.getAllSync()) || []; } catch (e) { list = []; }
  const PRIO = ["1 op 1", "ambulant intern", "ambulant extern", "wlz"];
  const actief = list.filter((z) => z && !z.archived && z.naam);
  actief.sort((a, b) => {
    const ia = PRIO.indexOf(String(a.naam).toLowerCase());
    const ib = PRIO.indexOf(String(b.naam).toLowerCase());
    const ra = ia === -1 ? 99 : ia, rb = ib === -1 ? 99 : ib;
    if (ra !== rb) return ra - rb;
    return String(a.naam).localeCompare(String(b.naam), "nl");
  });
  sel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = ""; ph.textContent = "Selecteer zorgsoort…";
  sel.appendChild(ph);
  actief.forEach((z) => {
    const o = document.createElement("option");
    o.value = z.naam;
    let suffix = "";
    if (z.tarief != null && isFinite(Number(z.tarief))) {
      suffix = " — € " + Number(z.tarief).toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + "/" + (z.tarieftype || "");
    }
    o.textContent = z.naam + suffix;
    sel.appendChild(o);
  });
  if (current && actief.some((z) => z.naam === current)) sel.value = current;
}

/** Geschatte uurkosten van een teamlid (naam): ZZP = uurAlgemeen (fallback 45),
 *  loondienst = bruto maandsalaris × 1,30 / (contracturen × 4,33). null = onbekend/open. */
function geschatteUurkostenVoorTeamlid(naam) {
  const want = String(naam || "").trim().toLowerCase();
  if (!want) return null;
  let meds = [];
  try { meds = (window.medewerkersDB && window.medewerkersDB.getAllSync()) || []; } catch (e) { meds = []; }
  const m = meds.find((e) => getEmployeeName(e).toLowerCase() === want);
  if (!m) return null;
  const num = (v) => { const n = Number(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : 0; };
  const empType = String(m.bs2_employment_type || m.employmentType || m.dienstverband || "").toLowerCase();
  const isZzp = empType === "hiring" || /inhuur|zzp|agency/.test(empType);
  if (isZzp) { const r = num(m.uurAlgemeen) || num(m.uurTarief); return r > 0 ? r : 45; }
  const sal = num(m.salaris), cu = num(m.contracturen);
  if (sal > 0 && cu > 0) return (sal * 1.30) / (cu * 4.33);
  return null;
}

function refreshDienstLocatieSelect() {
  const sel = document.getElementById("dienst-locatie-hr");
  if (!sel) return;
  const current = sel.value;
  const locaties = getVestigingOptiesVoorForm(buildDataState());
  sel.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "Selecteer locatie (uit HR / locaties)";
  sel.appendChild(ph);
  locaties.forEach((naam) => {
    if (!naam || String(naam).trim() === "") return;
    const opt = document.createElement("option");
    opt.value = String(naam);
    opt.textContent = String(naam);
    sel.appendChild(opt);
  });
  sel.value = locaties.includes(current) ? current : "";
}

/** Wire het inline "+ Nieuwe locatie"-paneel in het dienst-formulier. Maakt via
 *  window.locatiesDB een nieuwe cliëntwoning aan (planning-zichtbaar) en
 *  selecteert die direct in de locatie-keuze. */
function initNieuweLocatieInline() {
  const btn = document.getElementById("dienst-locatie-nieuw-btn");
  const form = document.getElementById("dienst-locatie-nieuw-form");
  const annuleer = document.getElementById("nieuwe-loc-annuleer");
  const opslaan = document.getElementById("nieuwe-loc-opslaan");
  const msg = document.getElementById("nieuwe-loc-msg");
  if (!btn || !form) return;
  if (form.dataset.wired === "1") return;
  form.dataset.wired = "1";

  const ids = ["nieuwe-loc-naam", "nieuwe-loc-straat", "nieuwe-loc-huisnr", "nieuwe-loc-postcode", "nieuwe-loc-plaats"];
  const setMsg = (txt, kind) => {
    if (!msg) return;
    msg.textContent = txt || "";
    msg.classList.toggle("is-error", kind === "error");
    msg.classList.toggle("is-ok", kind === "ok");
  };
  const toggle = (show) => {
    form.hidden = !show;
    btn.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) {
      setMsg("");
      document.getElementById("nieuwe-loc-naam")?.focus();
    }
  };
  const reset = () => { ids.forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; }); };

  btn.addEventListener("click", () => toggle(form.hidden !== false));
  annuleer?.addEventListener("click", () => { reset(); toggle(false); });

  opslaan?.addEventListener("click", async () => {
    const val = (id) => (document.getElementById(id)?.value || "").trim();
    const naam = val("nieuwe-loc-naam");
    if (!naam) { setMsg("Vul een naam voor de locatie in.", "error"); document.getElementById("nieuwe-loc-naam")?.focus(); return; }
    if (!window.locatiesDB || typeof window.locatiesDB.add !== "function") {
      setMsg("Locatiebeheer is niet beschikbaar op deze pagina.", "error");
      return;
    }
    try {
      opslaan.disabled = true;
      setMsg("Bezig met aanmaken…");
      await window.locatiesDB.add({
        naam,
        straat: val("nieuwe-loc-straat"),
        huisnummer: val("nieuwe-loc-huisnr"),
        postcode: val("nieuwe-loc-postcode"),
        plaats: val("nieuwe-loc-plaats"),
      });
      // Selecteer de nieuwe locatie direct in het dienst-formulier.
      refreshDienstLocatieSelect();
      const sel = document.getElementById("dienst-locatie-hr");
      if (sel) sel.value = naam;
      setMsg(`Locatie "${naam}" aangemaakt en geselecteerd.`, "ok");
      reset();
      // Verberg het sub-paneel na een korte bevestiging.
      setTimeout(() => { if (!form.hidden) toggle(false); }, 1200);
    } catch (e) {
      setMsg("Aanmaken mislukt: " + (e && e.message ? e.message : e), "error");
    } finally {
      opslaan.disabled = false;
    }
  });
}

function setDienstFormDefaults() {
  const sDate = document.getElementById("dienst-startdate");
  const sTime = document.getElementById("dienst-starttime");
  const eDate = document.getElementById("dienst-einddate");
  const eTime = document.getElementById("dienst-eindtime");
  const p = document.getElementById("dienst-pauze");
  const n = document.getElementById("dienst-aantal");
  const rt = document.getElementById("dienst-beschrijving");
  const h = document.getElementById("dienst-herhaal");
  const repeatCount = document.getElementById("dienst-repeat-count");
  const repeatFreq = document.getElementById("dienst-repeat-frequency");
  const repeatUntil = document.getElementById("dienst-repeat-until");
  if (p) p.value = "0";
  if (n) n.value = "1";
  if (h) h.checked = false;
  if (repeatCount) repeatCount.value = "";
  if (repeatFreq) repeatFreq.value = "daily";
  if (repeatUntil) repeatUntil.value = "";
  if (rt) {
    rt.innerHTML = "";
  }
  let start = new Date();
  if (ui.prefillStartDay) {
    start = new Date(ui.prefillStartDay);
  } else {
    const w = getVisibleRange();
    if (!itemOverlapsRange({ start: toIsoLocal(new Date()) }, w.start, w.end)) {
      start = new Date(w.start);
    }
  }
  start.setMinutes(0, 0, 0);
  if (sDate) sDate.value = toDateInputValue(start);
  if (sTime) sTime.value = toTimeInputValue(start);
  const end = new Date(start.getTime() + 60 * 60000);
  if (eDate) eDate.value = toDateInputValue(end);
  if (eTime) eTime.value = toTimeInputValue(end);
  clearPlanningDiensttypeMultiselect();
  syncDienstRepeatOptions();
}

function fillDienstPanelForItem(item) {
  if (!item) return;
  setPlanningDiensttypeSelectionFromString(item.diensttype || item.functie || "");
  const loc = String(item.locatie || "").trim() || String(item.vestiging || "").trim();
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val == null ? "" : String(val);
  };
  setVal("dienst-locatie-hr", loc);
  setVal("dienst-mw", item.teamlid || "");
  setVal("dienst-client", item.client || "");
  const s = parseStartDate(item.start);
  const e = parseStartDate(item.einde);
  if (s) {
    setVal("dienst-startdate", toDateInputValue(s));
    setVal("dienst-starttime", toTimeInputValue(s));
  }
  if (e) {
    setVal("dienst-einddate", toDateInputValue(e));
    setVal("dienst-eindtime", toTimeInputValue(e));
  }
  setVal("dienst-pauze", item.pauzeUren ?? 0);
  setVal("dienst-aantal", item.vereistAantalMedewerkers ?? 1);
  setVal("dienst-competentie", item.competenties || "");
  const rt = document.getElementById("dienst-beschrijving");
  if (rt) rt.innerHTML = window.besaSanitizeHtml(item.beschrijving || "");
  const h = document.getElementById("dienst-herhaal");
  if (h) h.checked = Boolean(item.herhaal);
  // Reset hints; daarna heroverwegen
  const ph = document.getElementById("dienst-pauze-hint");
  if (ph) ph.hidden = true;
  const sh = document.getElementById("dienst-mw-saldo-hint");
  if (sh) sh.hidden = true;
  syncDienstRepeatOptions();
  applyDienstFormOneOnOneState();
  // Toon saldo voor huidige medewerker indien gekozen
  if (typeof updateCompensatieSaldoHint === "function") updateCompensatieSaldoHint();
}

function openDienstPanel(editId = null) {
  const panel = document.getElementById("planning-dienst-panel");
  const back = document.getElementById("planning-dienst-backdrop");
  if (!panel || !back) return;
  ui.editingId = editId || null;
  const data = buildDataState();
  fillDienstFormSelects(data);
  setDienstFormDefaults();
  const title = document.getElementById("planning-dienst-title");
  const submit = document.getElementById("planning-dienst-submit");
  if (title) title.textContent = editId ? "Dienst bewerken" : "Dienst aanmaken";
  if (submit) submit.textContent = editId ? "Bijwerken" : "Toevoegen";
  if (editId) {
    fillDienstPanelForItem(getItemById(editId));
  }
  if (ui.prefillStartDay) {
    const d = new Date(ui.prefillStartDay);
    const ds = toDateInputValue(d);
    const t0 = toTimeInputValue(d);
    const t1 = toTimeInputValue(new Date(d.getTime() + 8 * 3600000));
    const sd = document.getElementById("dienst-startdate");
    const st = document.getElementById("dienst-starttime");
    const ed = document.getElementById("dienst-einddate");
    const et = document.getElementById("dienst-eindtime");
    if (sd) sd.value = ds;
    if (st) st.value = t0;
    if (ed) ed.value = ds;
    if (et) et.value = t1;
    ui.prefillStartDay = null;
  }
  // Type-dienst modus. Bewerken gaat altijd over één bestaande planning-rij →
  // klassieke (groep) weergave met de toggle verborgen. Bij een nieuwe dienst
  // kan de planner kiezen tussen Groepsdienst en Individueel (1-op-1/ambulant).
  const modusToggle = document.getElementById("dienst-modus");
  resetKoppelRows();
  if (modusToggle) modusToggle.hidden = Boolean(editId);
  setDienstModus("groep");
  back.removeAttribute("hidden");
  back.setAttribute("aria-hidden", "false");
  panel.removeAttribute("hidden");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("planning-dienst-open");
  applyDienstFormOneOnOneState();
  document.getElementById("dienst-diensttype-trigger")?.focus();
}

function closeDienstPanel() {
  const panel = document.getElementById("planning-dienst-panel");
  const back = document.getElementById("planning-dienst-backdrop");
  if (back) {
    back.setAttribute("hidden", "");
    back.setAttribute("aria-hidden", "true");
  }
  if (panel) {
    panel.setAttribute("hidden", "");
    panel.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("planning-dienst-open");
  document.getElementById("planning-dienst-form")?.reset();
  ui.editingId = null;
  const rt = document.getElementById("dienst-beschrijving");
  if (rt) rt.innerHTML = "";
  clearPlanningDiensttypeMultiselect();
  syncDienstRepeatOptions();
  resetKoppelRows();
  ui.dienstModus = "groep";
}

function initDienstPanel() {
  const openBtn = document.getElementById("planning-dienst-aanmaken-btn");
  const closeBtn = document.getElementById("planning-dienst-close");
  const cancel = document.getElementById("planning-dienst-cancel");
  const back = document.getElementById("planning-dienst-backdrop");
  const form = document.getElementById("planning-dienst-form");
  const richt = document.getElementById("dienst-beschrijving");
  const herhaal = document.getElementById("dienst-herhaal");
  const dtTrigger = document.getElementById("dienst-diensttype-trigger");
  const dtList = document.getElementById("dienst-diensttype-list");
  dtTrigger?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlanningDiensttypeList();
  });
  dtList?.addEventListener("change", (e) => {
    if (e.target?.matches?.('input[type="checkbox"]')) {
      syncPlanningDiensttypeChips();
      applyDienstFormOneOnOneState();
      maybeAutofillPauseFromDiensttype();
    }
  });

  // Compensatie-saldo badge bij medewerker-keuze
  const mwSel = document.getElementById("dienst-mw");
  mwSel?.addEventListener("change", () => updateCompensatieSaldoHint());

  // Type-dienst modus-toggle (Groepsdienst ↔ Individueel 1-op-1/ambulant)
  document.getElementById("dienst-modus-groep")?.addEventListener("click", () => setDienstModus("groep"));
  document.getElementById("dienst-modus-individueel")?.addEventListener("click", () => setDienstModus("individueel"));
  // Cliënt↔teamlid-koppeling toevoegen
  document.getElementById("dienst-koppel-add")?.addEventListener("click", () => addKoppelRow());
  // Periode/tijden/cliënt-wijzigingen → herbereken hoeveel diensten dit oplevert.
  // (De weekdag-chips hebben een eigen click-handler die updateKoppelTel aanroept.)
  const koppelBlok = document.getElementById("dienst-koppel-blok");
  koppelBlok?.addEventListener("input", () => updateKoppelTel());
  koppelBlok?.addEventListener("change", () => updateKoppelTel());
  // Zorgsoort-keuzelijst verversen zodra de zorgsoorten (incl. tarieven) laden of wijzigen.
  window.addEventListener("besa:zorgsoorten-updated", () => { if (document.getElementById("dienst-zorgsoort")) fillZorgsoortSelect(); });
  // Inline "nieuwe locatie / cliëntwoning" aanmaken vanuit de dienst-flow
  // (eigenaarseis 2026-06-11): planner kan zonder de planning te verlaten een
  // nieuwe woonlocatie aanmaken waar een nieuwe cliënt woont.
  initNieuweLocatieInline();
  openBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openDienstPanel();
  });
  closeBtn?.addEventListener("click", () => closeDienstPanel());
  cancel?.addEventListener("click", () => closeDienstPanel());
  back?.addEventListener("click", () => closeDienstPanel());
  // Escape sluit dienst-panel (Bug #13 fix, CLEAN RUN #1)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const panel = document.getElementById("planning-dienst-panel");
    if (!panel || panel.hasAttribute("hidden")) return;
    // Niet sluiten als diensttype-multiselect open is — die heeft eigen Escape
    if (planningDiensttypeListOpen) return;
    closeDienstPanel();
  });
  herhaal?.addEventListener("change", syncDienstRepeatOptions);
  form?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    // Individuele modus (1-op-1 / ambulant): genereer per cliënt↔teamlid-koppeling ×
    // gekozen weekdag een aparte planning-rij. Alleen bij een NIEUWE dienst — bewerken
    // gaat over één bestaande rij en blijft in groep-modus.
    if (ui.dienstModus === "individueel" && !ui.editingId) {
      const gen = generateIndividueleDiensten();
      if (!gen) return;
      if (gen.truncated && typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Periode ingekort",
          "Er zijn maximaal 1000 diensten in één keer aangemaakt. Verfijn de periode of voeg de rest later toe.");
      }
      if (window.planningDB && window.planningDB.add) {
        Promise.all(gen.items.map((o) => window.planningDB.add(o)))
          .catch(function (e) { console.error("[planning] individuele diensten toevoegen mislukt:", e); });
      }
      if (typeof window.showActionFeedback === "function") {
        const n = gen.items.length;
        window.showActionFeedback("info", "Ingepland",
          n === 1 ? "1 individuele dienst aangemaakt." : (n + " individuele diensten aangemaakt."));
      }
      closeDienstPanel();
      return;
    }
    const diensttype = getSelectedDiensttypeFieldString().trim();
    const locHr = document.getElementById("dienst-locatie-hr")?.value || "";
    // Medewerker en cliënt zijn NIET verplicht: een dienst kan als open dienst
    // worden aangemaakt (alleen type, locatie, tijden en eventueel een periode).
    const teamlid = document.getElementById("dienst-mw")?.value || "";
    const client = document.getElementById("dienst-client")?.value || "";
    const sd = document.getElementById("dienst-startdate")?.value;
    const st = document.getElementById("dienst-starttime")?.value;
    const ed = document.getElementById("dienst-einddate")?.value;
    const et = document.getElementById("dienst-eindtime")?.value;
    if (!diensttype || !locHr || !sd || !st || !ed || !et) {
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback(
          "info",
          "Verplichte velden",
          !diensttype
            ? "Selecteer minstens één diensttype (de lijst volgt de compensatie-instellingen)."
            : "Vul het diensttype, de locatie en de start- en eindtijd in."
        );
      }
      return;
    }
    const startIso = combineDateTimeToLocalIso(sd, st);
    const endIso = combineDateTimeToLocalIso(ed, et);
    if (!startIso || !endIso) {
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Ongeldige tijd", "Vul een geldige start- en eindtijd in.");
      }
      return;
    }
    if (parseStartDate(endIso) <= parseStartDate(startIso)) {
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Ongeldige tijd", "Eindtijd moet na starttijd liggen.");
      }
      return;
    }
    const pauze = Math.max(0, parseFloat(document.getElementById("dienst-pauze")?.value) || 0);
    const aantal = Math.max(1, parseInt(document.getElementById("dienst-aantal")?.value, 10) || 1);
    const comp = document.getElementById("dienst-competentie")?.value || "";
    const besch = (richt && richt.innerHTML.trim()) || "";
    const her = Boolean(document.getElementById("dienst-herhaal")?.checked);
    const dState = buildDataState();
    const afd = dState.afdelingen[0] || "Overig";
    const teamlead = dState.teamlead[0] || "";
    const baseId = ui.editingId || makePlanningId();
    const item = {
      id: baseId,
      afdeling: afd,
      diensttype,
      functie: diensttype,
      teamlead,
      teamlid,
      client,
      vestiging: locHr,
      locatie: locHr,
      start: startIso,
      einde: endIso,
      pauzeUren: pauze,
      vereistAantalMedewerkers: aantal,
      competenties: comp,
      beschrijving: besch,
      herhaal: her,
      leer: 0,
      sterren: 0,
      conflict: false,
    };
    if (ui.editingId) {
      const huidig = (window.planningDB && window.planningDB.getByIdSync) ? (window.planningDB.getByIdSync(ui.editingId) || {}) : {};
      const patch = normalizeItem({ ...huidig, ...item, id: ui.editingId });
      if (window.planningDB && window.planningDB.update) {
        window.planningDB.update(ui.editingId, patch).catch(function (e) { console.error("[planning] bijwerken mislukt:", e); });
      }
      closeDienstPanel();
      return;
    }
    const toAdd = [normalizeItem(item)];
    if (her) {
      const s0 = parseStartDate(startIso);
      const e0 = parseStartDate(endIso);
      const freq = document.getElementById("dienst-repeat-frequency")?.value || "daily";
      const untilRaw = document.getElementById("dienst-repeat-until")?.value || "";
      const until = untilRaw ? combineDateTimeToLocalIso(untilRaw, "23:59") : "";
      const untilDate = until ? parseStartDate(until) : null;
      const countRaw = parseInt(document.getElementById("dienst-repeat-count")?.value, 10);
      const hasCount = Number.isFinite(countRaw) && countRaw > 0;
      // Een periode-dienst heeft een einddatum (t/m) óf een aantal keer nodig;
      // zonder beide is de herhaling betekenisloos.
      if (!untilDate && !hasCount) {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("info", "Periode ontbreekt",
            "Kies een einddatum (t/m) of een aantal keer voor de herhaling, of zet 'Herhaal' uit.");
        }
        return;
      }
      // Veiligheidsgrens: nooit meer dan dit aantal diensten in één keer aanmaken.
      const MAX_REPEAT = 1000;
      if (s0 && e0) {
        const cs = new Date(s0);
        const ce = new Date(e0);
        const advance = (dt) => {
          if (freq === "monthly") dt.setMonth(dt.getMonth() + 1);
          else if (freq === "weekly") dt.setDate(dt.getDate() + 7);
          else dt.setDate(dt.getDate() + 1); // 'daily' én 'workdays': per dag; weekend wordt overgeslagen
        };
        let made = 0;
        let truncated = false;
        for (let guard = 0; guard < 4000; guard++) {
          advance(cs);
          advance(ce);
          if (untilDate && cs > untilDate) break;
          if (freq === "workdays") {
            const dow = cs.getDay(); // 0 = zondag, 6 = zaterdag
            if (dow === 0 || dow === 6) continue;
          }
          if (hasCount && !untilDate && made >= countRaw) break;
          if (made >= MAX_REPEAT) { truncated = true; break; }
          toAdd.push(
            normalizeItem({
              ...item,
              id: makePlanningId(),
              start: toIsoLocal(new Date(cs)),
              einde: toIsoLocal(new Date(ce)),
              herhaal: true,
              herhaalFrequentie: freq,
            })
          );
          made++;
        }
        if (truncated && typeof window.showActionFeedback === "function") {
          window.showActionFeedback("info", "Periode ingekort",
            "Er zijn maximaal " + MAX_REPEAT + " diensten in één keer aangemaakt. Verfijn de periode of voeg de rest later toe.");
        }
      }
    }
    // Gericht toevoegen via de data-laag (dispatcht besa:planning-updated → re-render).
    if (window.planningDB && window.planningDB.add) {
      Promise.all(toAdd.map((o) => window.planningDB.add(o))).catch(function (e) { console.error("[planning] toevoegen mislukt:", e); });
    }
    closeDienstPanel();
  });
  document.querySelector(".planning-dienst-rt-toolbar")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (!b || !richt) return;
    e.preventDefault();
    richt.focus();
    const c = b.getAttribute("data-cmd");
    if (c === "h1" || c === "h2") {
      const tag = c === "h1" ? "h1" : "h2";
      try {
        document.execCommand("formatBlock", false, tag);
      } catch {
        /* oudere browsers */
      }
      return;
    }
    if (c) {
      try {
        document.execCommand(c, false);
      } catch {
        /* ignore */
      }
    }
  });
  richt?.addEventListener("input", () => {
    const h = document.getElementById("dienst-beschrijving-h");
    if (h) h.value = richt.innerHTML;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !document.body.classList.contains("planning-dienst-open")) return;
    if (planningDiensttypeListOpen) {
      e.preventDefault();
      closePlanningDiensttypeList();
      return;
    }
    e.preventDefault();
    closeDienstPanel();
  });
}

/**
 * Module 2 Bug #91 fix — Planning Exporteren XLSX (BS2 parity).
 *
 * 8 kolommen: Cliëntnaam / Cliëntnummer / Diensttype / Startdatum & tijd /
 *             Einddatum & tijd / Pauze (min) / Gewerkte uren / Toegewezen medewerkers
 *
 * Toggle "Splitsen per cliënt aparte tabbladen":
 *   - UIT (default): één sheet 'Planning' met alle rijen
 *   - AAN: één sheet per cliëntnaam (incl. "Geen cliënt" voor open diensten)
 *
 * Gebruikt SheetJS (xlsx-full) vanaf CDN. Filename bevat periode + datum.
 */
function openExportPlanningModal() {
  const items = getItemsForView();
  if (items.length === 0) {
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("info", "Geen gegevens", "Er zijn geen planning-regels om te exporteren.");
    }
    return;
  }
  const modal = document.getElementById("planning-export-modal");
  if (!modal) {
    // Fallback: direct exporteren zonder modal als markup ontbreekt
    return doExportPlanningXlsx(items, false);
  }
  // Reset state
  const splitCb = document.getElementById("planning-export-split");
  const errEl = document.getElementById("planning-export-err");
  if (splitCb) splitCb.checked = false;
  if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
  modal.hidden = false;
}

function closeExportPlanningModal() {
  const modal = document.getElementById("planning-export-modal");
  if (modal) modal.hidden = true;
}

/* ── AI-planning regels modal ────────────────────────────────────────────── */
function closeAiSettingsModal() {
  const modal = document.getElementById("planning-ai-modal");
  if (modal) modal.hidden = true;
}
function openAiSettingsModal() {
  const modal = document.getElementById("planning-ai-modal");
  if (!modal) return;
  const cfg = (window.planningSettingsDB?.getSync?.()) || {};
  const setCb = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v !== false; };
  setCb("plai-overlap", cfg.ai_overlap_waarschuwing);
  setCb("plai-weekend", cfg.ai_weekend_consistentie);
  setCb("plai-avonddag", cfg.ai_geen_avond_naar_dag);
  const grens = document.getElementById("plai-grens");
  if (grens) grens.value = (cfg.ai_avond_grens_uur != null ? cfg.ai_avond_grens_uur : 15);
  const err = document.getElementById("planning-ai-err");
  if (err) err.hidden = true;
  modal.hidden = false;
}
async function saveAiSettings() {
  const err = document.getElementById("planning-ai-err");
  const grens = parseInt(document.getElementById("plai-grens")?.value, 10);
  if (isNaN(grens) || grens < 10 || grens > 23) {
    if (err) { err.textContent = "Vul een grens-uur in tussen 10 en 23."; err.hidden = false; }
    return;
  }
  const patch = {
    ai_overlap_waarschuwing: !!document.getElementById("plai-overlap")?.checked,
    ai_weekend_consistentie: !!document.getElementById("plai-weekend")?.checked,
    ai_geen_avond_naar_dag: !!document.getElementById("plai-avonddag")?.checked,
    ai_avond_grens_uur: grens,
  };
  const saveBtn = document.getElementById("planning-ai-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Bezig…"; }
  try {
    if (!window.planningSettingsDB?.update) throw new Error("Instellingen-data-laag niet beschikbaar.");
    await window.planningSettingsDB.update(patch);
    closeAiSettingsModal();
    if (window.showActionFeedback) {
      window.showActionFeedback("saved", "AI-planregels opgeslagen", "De generator gebruikt deze regels direct.");
    }
    if (typeof renderAllViews === "function") renderAllViews(); // overlap-banner volgt de nieuwe instelling
  } catch (e) {
    console.error("[planning] AI-instellingen opslaan mislukt:", e);
    if (err) { err.textContent = "Opslaan mislukt: " + (e?.message || e); err.hidden = false; }
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Opslaan"; }
  }
}

function buildExportRow(r) {
  const fmtDT = (iso) => {
    if (!iso) return "";
    // Wandklok (fake-UTC): slice de ISO-string i.p.v. new Date().getHours() (+1/+2u fout).
    const s = String(iso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}`;
    return s;
  };
  const pauzeMin = (r.pauzeMinuten != null && r.pauzeMinuten !== "") ? Number(r.pauzeMinuten) : (r.pauze_minuten != null ? Number(r.pauze_minuten) : "");
  const gewerkteUren = (r.start && r.einde) ? durationHours(r.start, r.einde) : "";
  return {
    "Cliëntnaam": r.client || r.cliënt || "Geen cliënt",
    "Cliëntnummer": r.clientNummer || r.client_nummer || r.bs2_id || "",
    "Diensttype": r.diensttype || "",
    "Startdatum & tijd": fmtDT(r.start),
    "Einddatum & tijd": fmtDT(r.einde),
    "Pauze (min)": pauzeMin === "" ? "" : pauzeMin,
    "Gewerkte uren": gewerkteUren === "" ? "" : Number(gewerkteUren.toFixed(2)),
    "Toegewezen medewerkers": r.teamlid || "",
  };
}

function planningExportFilename() {
  let periodeSlug = "";
  try {
    if (ui.calMode === "day" && ui.dayDate) periodeSlug = new Date(ui.dayDate).toISOString().slice(0, 10);
    else if (ui.calMode === "week" && ui.weekStart) periodeSlug = "week-" + getIsoWeek(ui.weekStart);
    else if (ui.calMode === "month" && ui.monthDate) {
      const m = new Date(ui.monthDate);
      periodeSlug = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
    }
  } catch (e) { periodeSlug = ""; }
  return periodeSlug
    ? `planning_export_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}_${periodeSlug}`
    : `planning_export_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`;
}

function doExportPlanningXlsx(items, splitPerClient) {
  if (typeof window.XLSX === "undefined") {
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("error", "Export mislukt", "SheetJS niet geladen. Vernieuw de pagina.");
    }
    return;
  }
  const filename = planningExportFilename();

  if (!splitPerClient) {
    // 1 sheet 'Planning' met alle records
    const data = items.map(buildExportRow);
    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Planning");
    window.XLSX.writeFile(wb, filename + ".xlsx");
  } else {
    // Group by client, één sheet per cliënt
    const groups = new Map();
    items.forEach((r) => {
      const key = (r.client && String(r.client).trim()) || "Geen cliënt";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const wb = window.XLSX.utils.book_new();
    // Sheets gesorteerd alfabetisch, met "Geen cliënt" eerst
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "Geen cliënt") return -1;
      if (b === "Geen cliënt") return 1;
      return a.localeCompare(b, "nl");
    });
    keys.forEach((clientName) => {
      const data = groups.get(clientName).map(buildExportRow);
      const ws = window.XLSX.utils.json_to_sheet(data);
      // Sheet-naam moet ≤ 31 chars en geen :\/?* []
      let sheetName = clientName.replace(/[:\\/?*\[\]]/g, "").slice(0, 31) || "Sheet";
      window.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    window.XLSX.writeFile(wb, filename + ".xlsx");
  }

  if (typeof window.showActionFeedback === "function") {
    window.showActionFeedback("exported", filename + ".xlsx");
  }
}

function exportPlanningCsv() {
  // Module 2 Bug #91 — open modal i.p.v. direct exporteren
  openExportPlanningModal();
}

/* ── Inklapbare kop: KPI-strip + overlap-/beschikking-banner ──
 * Toggle bovenin de planning-kaart om alles boven het rooster weg te klappen.
 * Standaard UITGEKLAPT; de keuze wordt PER ACCOUNT onthouden in localStorage
 * (key met de user-id uit de Supabase-sessie). FOUC-vrij: een head-snippet in
 * planning.html zet html[data-planning-top] vóór de eerste paint. */
function planningTopCollapseKey() {
  var uid = "anon";
  try {
    var raw = localStorage.getItem("sb-besa-auth");
    if (raw) {
      var j = JSON.parse(raw);
      uid = (j && j.user && j.user.id) ||
            (j && j.currentSession && j.currentSession.user && j.currentSession.user.id) || "anon";
    }
  } catch (e) { /* */ }
  return "besa-planning-top-collapsed:" + uid;
}
function planningTopIsCollapsed() {
  return document.documentElement.getAttribute("data-planning-top") === "collapsed";
}
function setPlanningTopCollapsed(collapsed, persist) {
  document.documentElement.setAttribute("data-planning-top", collapsed ? "collapsed" : "expanded");
  var btn = document.getElementById("planning-top-toggle");
  if (btn) {
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.title = collapsed ? "Kerngetallen & signaleringen tonen" : "Kerngetallen & signaleringen verbergen";
  }
  if (persist) {
    try {
      if (collapsed) localStorage.setItem(planningTopCollapseKey(), "1");
      else localStorage.removeItem(planningTopCollapseKey());
    } catch (e) { /* */ }
  }
}
function initPlanningTopToggle() {
  var btn = document.getElementById("planning-top-toggle");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  // Veiligheidsnet als de head-snippet niet draaide: alsnog uit localStorage toepassen.
  if (!document.documentElement.hasAttribute("data-planning-top")) {
    var c = false;
    try { c = localStorage.getItem(planningTopCollapseKey()) === "1"; } catch (e) { /* */ }
    setPlanningTopCollapsed(c, false);
  } else {
    setPlanningTopCollapsed(planningTopIsCollapsed(), false); // aria/title synchroniseren
  }
  btn.addEventListener("click", function () {
    setPlanningTopCollapsed(!planningTopIsCollapsed(), true);
  });
}

/* ── Vaste, nette planning-kop (gebruikerseis 2026-06-11) ──
 * De toolbar (periode, week/maand, knoppen) + de dag-koprij blijven samen ALTIJD
 * strak bovenin staan; alleen de KPI-strip en de overlap-/beschikking-banners scrollen
 * mee weg. Eerder schoof de toolbar weg/terug bij scrollen, maar omdat NIET stabiel is
 * welke container scrolt (soms de kaart zelf, soms .content--planning-erm), bleef hij
 * half hangen / sprong terug — de bovenkant werd er onrustig van en "Week … 2026" dook
 * op en verdween. Nu pinnen we hem gewoon vast.
 *
 * Deze functie houdt alleen nog:
 *   • de subtiele schaduw-cue (.planning-is-scrolled) zodra er iets onder de toolbar is
 *     weggescrold, zodat hij "vastgeplakt" aanvoelt;
 *   • het her-meten van toolbar-/dag-kop-hoogte bij viewport-resize (de toolbar kan op
 *     smalle schermen wrappen → hoger worden), zodat de sticky-offsets blijven kloppen.
 * De toolbar wordt NIET meer verborgen (geen .planning-toolbar-hidden meer gezet). */
function initPlanningToolbarAutohide() {
  var card = document.getElementById("planning-calendar-section");
  if (!card || card.dataset.autohideWired === "1") return;
  card.dataset.autohideWired = "1";
  var main = card.closest(".content--planning-erm") ||
             document.querySelector(".content--planning-erm");
  var pending = null;
  var ticking = false;
  var REVEAL_AT_TOP = 4;      // binnen 4px van de top = geen schaduw
  function update() {
    ticking = false;
    var el = pending;
    if (!el) return;
    card.classList.toggle("planning-is-scrolled", el.scrollTop > REVEAL_AT_TOP);
  }
  function onScroll(e) {
    // Reageer op het element dat scrolde; negeer scroll van b.v. dropdowns.
    var el = e.target === document ? (document.scrollingElement || null) : e.target;
    if (el !== card && el !== main) return;
    pending = el;
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }
  [card, main].forEach(function (el) {
    if (el) el.addEventListener("scroll", onScroll, { passive: true });
  });
  // Toolbar kan bij resize wrappen → her-meet de hoogte zodat de dag-kop strak blijft.
  var rt = null;
  window.addEventListener("resize", function () {
    if (rt) window.clearTimeout(rt);
    rt = window.setTimeout(syncPlanningDayheadHeight, 120);
  }, { passive: true });
}

function initNav() {
  document.getElementById("planning-erm-prev")?.addEventListener("click", () => {
    if (ui.calMode === "day") ui.dayDate = addDays(ui.dayDate, -1);
    else if (ui.calMode === "week") ui.weekStart = addDays(ui.weekStart, -7);
    else {
      const m0 = new Date(ui.monthDate);
      m0.setMonth(m0.getMonth() - 1, 1);
      ui.monthDate = m0;
    }
    renderAllViews();
  });
  document.getElementById("planning-erm-next")?.addEventListener("click", () => {
    if (ui.calMode === "day") ui.dayDate = addDays(ui.dayDate, 1);
    else if (ui.calMode === "week") ui.weekStart = addDays(ui.weekStart, 7);
    else {
      const m0 = new Date(ui.monthDate);
      m0.setMonth(m0.getMonth() + 1, 1);
      ui.monthDate = m0;
    }
    renderAllViews();
  });
  document.getElementById("planning-erm-today")?.addEventListener("click", () => {
    const t = new Date();
    ui.dayDate = t;
    ui.weekStart = getMonday(t);
    ui.monthDate = t;
    renderAllViews();
  });
  document.getElementById("planning-cal-day")?.addEventListener("click", () => {
    ui.overlapOnly = false;
    setListMode(false);
    setCalMode("day");
    renderAllViews();
  });
  document.getElementById("planning-cal-week")?.addEventListener("click", () => {
    ui.overlapOnly = false;
    setListMode(false);
    setCalMode("week");
    renderAllViews();
  });
  document.getElementById("planning-cal-month")?.addEventListener("click", () => {
    ui.overlapOnly = false;
    setListMode(false);
    setCalMode("month");
    renderAllViews();
  });
  document.getElementById("planning-view-list")?.addEventListener("click", () => {
    ui.overlapOnly = false; // handmatige "Lijst" toont het volledige rooster
    setListMode(true);
    renderAllViews();
  });
  document.getElementById("planning-view-roster")?.addEventListener("click", () => {
    ui.overlapOnly = false;
    setListMode(false);
    renderAllViews();
  });
  document.getElementById("planning-export-btn")?.addEventListener("click", exportPlanningCsv);
  document.getElementById("planning-sidebar-export-btn")?.addEventListener("click", exportPlanningCsv);
  document.getElementById("planning-clear-all-btn")?.addEventListener("click", () => {
    var clearConfirm;
    if (typeof window.showSliderConfirmModal === "function") {
      clearConfirm = window.showSliderConfirmModal({
        title: "Hele planning leegmaken",
        message: "Dit wist alle geplande diensten van alle medewerkers. Dit kan niet ongedaan worden gemaakt en demodata wordt niet opnieuw geladen.",
        preview: "",
        okLabel: "Alles verwijderen",
      });
    } else {
      console.warn("[planning] showSliderConfirmModal niet beschikbaar — actie geannuleerd.");
      clearConfirm = Promise.resolve(false);
    }
    clearConfirm.then(function (ok) {
      if (!ok) return;
      clearAllPlannedDiensten();
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("deleted", "Alle geplande diensten");
      }
    });
  });
  document.querySelectorAll('input[name="planning-row-axis"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) ui.rowAxis = r.value;
      renderAllViews();
    });
  });

  /* Toolbar locatiefilter (Selecteer Locatie) */
  document.getElementById("planning-loc-select")?.addEventListener("change", (e) => {
    filterState.locatieToolbar = e.target.value || "";
    renderAllViews();
    /* De gekozen locatie meteen vóóraan in beeld brengen (spraakmemo eigenaar
       2026-06-11: "het overzicht van de locaties moet naar voren komen zodra je
       daar een locatie aan het zoeken bent"): scroll het rooster tot net onder de
       toolbar zodat de geselecteerde locatie direct onder de dag-koppen staat. */
    scrollPlanningToRooster();
  });

  /* Sidebar: Teamlid + Cliënt single-select dropdowns */
  document.getElementById("filter-teamlid")?.addEventListener("change", (e) => {
    filterState.teamlid = e.target.value || "";
    renderAllViews();
  });
  document.getElementById("filter-client")?.addEventListener("change", (e) => {
    filterState.client = e.target.value || "";
    renderAllViews();
  });

  /* Sidebar: Toewijzingsstatus radio */
  document.querySelectorAll('input[name="planning-assign-status"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) filterState.assignStatus = r.value || "alle";
      renderAllViews();
    });
  });

  /* Module 2 Bug #87 fix: Dienstverband filter radio */
  document.querySelectorAll('input[name="planning-employment-type"]').forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) filterState.employmentType = r.value || "alle";
      renderAllViews();
    });
  });

  /* Sidebar: Diensttype filter dropdown */
  document.getElementById("filter-diensttype-trigger")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFilterDtList();
  });

  /* Voorinstellingen — inline naam-input + Supabase data-laag */
  document.getElementById("planning-presets-new-btn")?.addEventListener("click", showPresetNameInput);
  document.getElementById("planning-presets-save-btn")?.addEventListener("click", savePresetFromInput);
  document.getElementById("planning-presets-cancel-btn")?.addEventListener("click", hidePresetNameInput);
  document.getElementById("planning-presets-input")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); savePresetFromInput(); }
    else if (ev.key === "Escape") { ev.preventDefault(); hidePresetNameInput(); }
  });

  /* Overlap-waarschuwing: "Toon in lijst" → lijstweergave met ALLEEN de dubbel-
   * ingeroosterde diensten (de details die niet kloppen), niet het volledige rooster. */
  document.getElementById("planning-overlap-banner-btn")?.addEventListener("click", () => {
    ui.overlapOnly = true;
    setListMode(true);
    renderAllViews();
  });

  /* Context-balk boven de gefilterde lijst: "Terug naar rooster" (springt zonder
   * herladen naar de locatie van de laatste aanpassing) + "Toon alle diensten". */
  document.getElementById("planning-overlap-back")?.addEventListener("click", returnToRosterAtAdjustment);
  document.getElementById("planning-overlap-showall")?.addEventListener("click", () => {
    ui.overlapOnly = false;
    renderAllViews();
  });

  /* Klik op een rij in de lijst opent de dienst-detail om direct aan te passen. */
  document.getElementById("planning-table-body")?.addEventListener("click", (e) => {
    const tr = e.target && e.target.closest && e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.getAttribute("data-id");
    if (id && typeof openViewModal === "function") openViewModal(id);
  });

  /* Inklapbare kop (KPI-strip + overlap-/beschikking-banner) */
  initPlanningTopToggle();

  /* Toolbar auto-verbergen bij scrollen-omlaag, terug bij scrollen-omhoog */
  initPlanningToolbarAutohide();

  /* Klik op een overlappende dienst in de melding → open die dienst meteen (om aan te
   * passen). Delegation op document: robuust ongeacht of de banner-HTML al geparsed is. */
  document.addEventListener("click", (e) => {
    const pair = e.target && e.target.closest && e.target.closest(".planning-overlap-conf__pair");
    if (!pair) return;
    const id = pair.getAttribute("data-overlap-shift");
    if (id && typeof openViewModal === "function") openViewModal(id);
  });

  /* Toolbar: Genereren + Optimaliseren (placeholders, bevestigen + log) */
  document.getElementById("planning-gen-btn")?.addEventListener("click", () => {
    if (!window.planningGenerator || !window.planningGenerator.run) {
      if (window.showError) window.showError("Generator nog niet geladen — herlaad de pagina.");
      return;
    }
    const r = getVisibleRange();
    const toDay = (d) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    window.planningGenerator.run({
      startIso: toDay(r.start),
      eindIso: toDay(r.end),
      periodeLabel: getPeriodLine(),
      locatieFilter: filterState.locatieToolbar || "",
      diensttypeSet: null,
    });
  });
  document.getElementById("planning-opt-btn")?.addEventListener("click", () => {
    if (!window.planningGenerator || !window.planningGenerator.run) {
      if (window.showError) window.showError("Generator nog niet geladen — herlaad de pagina.");
      return;
    }
    const r = getVisibleRange();
    const toDay = (d) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    // Reïntegreren = vrijgekomen diensten (bv. na goedgekeurd verlof) én reeds
    // opengezette diensten opnieuw verdelen / ZZP-suggesties geven.
    window.planningGenerator.run({
      mode: "reintegreren",
      startIso: toDay(r.start),
      eindIso: toDay(r.end),
      periodeLabel: getPeriodLine(),
      locatieFilter: filterState.locatieToolbar || "",
      diensttypeSet: null,
    });
  });

  document.getElementById("planning-clear-filters")?.addEventListener("click", () => {
    filterState.search = "";
    const si = document.getElementById("planning-search");
    if (si) si.value = "";
    [
      "afdeling",
      "diensttypes",
      "teamlead",
      "teamleden",
      "clienten",
      "medewerkers",
      "vestiging",
      "locatie",
    ].forEach((k) => filterState[k].clear());
    filterState.assignStatus = "alle";
    filterState.employmentType = "alle";
    filterState.teamlid = "";
    filterState.client = "";
    filterState.locatieToolbar = "";
    // Reset radio-UI state
    const alleAssign = document.querySelector('input[name="planning-assign-status"][value="alle"]');
    if (alleAssign) alleAssign.checked = true;
    const alleEmp = document.querySelector('input[name="planning-employment-type"][value="alle"]');
    if (alleEmp) alleEmp.checked = true;
    renderAllViews();
  });

  /* Module 2 Bug #91 fix: Export-modal handlers.
     NB: net als de AI-modal hieronder staat de export-modal-HTML ná het
     planning.js-script in de body (planning.html r.803). initPlanningPage() draait
     SYNCHROON top-level, dus directe element-wiring bij init mist de modal-knoppen
     (getElementById = null → addEventListener faalt stil). Daarom via
     event-delegation op document — dat bestaat altijd en vangt de klik ongeacht
     wanneer de knop in de DOM komt. */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("#planning-export-close") || t.closest("#planning-export-cancel")) { closeExportPlanningModal(); return; }
    if (t.id === "planning-export-modal") { closeExportPlanningModal(); return; }
    if (t.closest("#planning-export-go")) {
      const splitCb = document.getElementById("planning-export-split");
      const split = splitCb && splitCb.checked;
      const items = getItemsForView();
      closeExportPlanningModal();
      doExportPlanningXlsx(items, !!split);
      return;
    }
  });
  document.addEventListener("keydown", (e) => {
    const m = document.getElementById("planning-export-modal");
    if (e.key === "Escape" && m && !m.hidden) closeExportPlanningModal();
  });

  /* AI-planning regels modal. NB: deze modal-HTML staat ná het planning.js-script
     in de body, dus directe element-wiring bij init zou de modal-knoppen missen
     (ze bestaan dan nog niet). Daarom via event-delegation op document — dat
     bestaat altijd en vangt de klik ongeacht wanneer de knop in de DOM komt. */
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("#planning-ai-btn")) { openAiSettingsModal(); return; }
    if (t.closest("#planning-ai-save")) { saveAiSettings(); return; }
    if (t.closest("#planning-ai-close") || t.closest("#planning-ai-cancel")) { closeAiSettingsModal(); return; }
    if (t.id === "planning-ai-modal") { closeAiSettingsModal(); return; }
  });
  document.addEventListener("keydown", (e) => {
    const m = document.getElementById("planning-ai-modal");
    if (e.key === "Escape" && m && !m.hidden) closeAiSettingsModal();
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest?.(".planning-erm-card")) return;
    if (ui.selectedId) {
      ui.selectedId = null;
      document.querySelectorAll(".planning-erm-card.is-selected").forEach((c) => c.classList.remove("is-selected"));
    }
  });
}

function initSearch() {
  const searchInput = document.getElementById("planning-search");
  searchInput?.addEventListener("input", () => {
    filterState.search = searchInput.value || "";
    renderAllViews();
  });
}

/* ---------------- Filter-voorinstellingen (Sprint 4 / S4) ---------------- */

function serializeFilterStateForPreset() {
  return {
    diensttypes: Array.from(filterState.diensttypes || []),
    assignStatus: filterState.assignStatus || "alle",
    employmentType: filterState.employmentType || "alle",
    teamlid: filterState.teamlid || "",
    client: filterState.client || "",
    locatieToolbar: filterState.locatieToolbar || "",
  };
}

function applyFilterStateFromPreset(fs) {
  if (!fs || typeof fs !== "object") return;
  filterState.diensttypes.clear();
  (Array.isArray(fs.diensttypes) ? fs.diensttypes : []).forEach((d) => filterState.diensttypes.add(d));
  filterState.assignStatus = fs.assignStatus || "alle";
  filterState.employmentType = fs.employmentType || "alle";
  filterState.teamlid = fs.teamlid || "";
  filterState.client = fs.client || "";
  filterState.locatieToolbar = fs.locatieToolbar || "";
  const teamSel = document.getElementById("filter-teamlid");
  if (teamSel) teamSel.value = filterState.teamlid;
  const cliSel = document.getElementById("filter-client");
  if (cliSel) cliSel.value = filterState.client;
  const locSel = document.getElementById("planning-loc-select");
  if (locSel) locSel.value = filterState.locatieToolbar;
  document.querySelectorAll('input[name="planning-assign-status"]').forEach((r) => {
    r.checked = (r.value === filterState.assignStatus);
  });
  document.querySelectorAll('input[name="planning-employment-type"]').forEach((r) => {
    r.checked = (r.value === filterState.employmentType);
  });
  try { renderFilterDiensttypeMultiselect(); } catch (e) { /* */ }
  syncFilterDtTriggerText();
  renderAllViews();
}

function showPresetNameInput() {
  const form = document.getElementById("planning-presets-form");
  const input = document.getElementById("planning-presets-input");
  const btn = document.getElementById("planning-presets-new-btn");
  if (!form || !input || !btn) return;
  form.removeAttribute("hidden");
  btn.setAttribute("hidden", "");
  input.value = "";
  setTimeout(() => input.focus(), 10);
}

function hidePresetNameInput() {
  const form = document.getElementById("planning-presets-form");
  const btn = document.getElementById("planning-presets-new-btn");
  if (form) form.setAttribute("hidden", "");
  if (btn) btn.removeAttribute("hidden");
}

async function savePresetFromInput() {
  const input = document.getElementById("planning-presets-input");
  if (!input) return;
  const naam = (input.value || "").trim();
  if (!naam) { input.focus(); return; }
  if (!window.planningVoorinstellingenDB) {
    if (window.showError) window.showError("Data-laag voor voorinstellingen niet geladen.");
    return;
  }
  try {
    await window.planningVoorinstellingenDB.add({
      naam,
      filter_state: serializeFilterStateForPreset(),
    });
    if (window.showActionFeedback) window.showActionFeedback("saved", "Voorinstelling");
    hidePresetNameInput();
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/duplicate|unique|23505/i.test(msg)) {
      if (window.showError) window.showError(`Er bestaat al een voorinstelling met naam "${naam}".`);
    } else if (window.showError) {
      window.showError("Opslaan mislukt: " + msg);
    }
  }
}

function renderPresetsList() {
  const ul = document.getElementById("planning-presets-list");
  if (!ul) return;
  const db = window.planningVoorinstellingenDB;
  const items = db && typeof db.getAllSync === "function" ? db.getAllSync() : [];
  ul.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "planning-erm-preset-item";
    li.dataset.presetId = item.id;

    const label = document.createElement("button");
    label.type = "button";
    label.className = "planning-erm-preset-label";
    label.textContent = item.naam;
    label.title = "Klik om voorinstelling toe te passen";
    label.addEventListener("click", () => {
      applyFilterStateFromPreset(item.filter_state || {});
      if (window.showActionFeedback) {
        window.showActionFeedback("info", "Voorinstelling geladen", `"${item.naam}"`);
      }
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "planning-erm-preset-del";
    del.setAttribute("aria-label", `Verwijder ${item.naam}`);
    del.title = "Verwijderen";
    del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    del.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const ok = await (window.showSliderConfirmModal
        ? window.showSliderConfirmModal({
            title: "Bent u zeker dat dit verwijderd wordt?",
            preview: item.naam,
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren",
          })
        : Promise.resolve(window.confirm(`Verwijder "${item.naam}"?`)));
      if (!ok) return;
      try {
        await window.planningVoorinstellingenDB.delete(item.id);
        if (window.showActionFeedback) window.showActionFeedback("deleted", "Voorinstelling");
      } catch (err) {
        if (window.showError) window.showError("Verwijderen mislukt: " + (err.message || err));
      }
    });

    li.appendChild(label);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function openViewModal(id) {
  // BS2-parity: delegeer naar dienst-detail.js voor de uitgebreide modal met 7 secties
  if (window.dienstDetail && typeof window.dienstDetail.open === "function") {
    ui.viewingId = id;
    window.dienstDetail.open(id);
    return;
  }
  // Legacy-fallback: oude minimalistische view-modal (alleen indien dienst-detail.js ontbreekt)
  const it = getItemById(id);
  if (!it) return;
  const body = document.getElementById("planning-view-body");
  const modal = document.getElementById("planning-view-modal");
  if (!body || !modal) return;
  body.innerHTML = '<div class="planning-detail-empty">Dienst-detail module niet geladen — herlaad de pagina.</div>';
  ui.viewingId = id;
  modal.removeAttribute("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeViewModal() {
  const m = document.getElementById("planning-view-modal");
  if (m) {
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
  }
  ui.viewingId = null;
}

function initViewModal() {
  const m = document.getElementById("planning-view-modal");
  const close1 = document.getElementById("planning-view-close-btn");
  const close2 = document.getElementById("planning-view-close-sec");
  const editBtn = document.getElementById("planning-view-edit-btn");
  const close = () => closeViewModal();
  close1?.addEventListener("click", close);
  close2?.addEventListener("click", close);
  m?.addEventListener("click", (e) => {
    if (e.target === m) close();
  });
  editBtn?.addEventListener("click", () => {
    // Read-only rollen (HR/Facilitair/werkvloer) mogen niet bewerken — de knop is in
    // .planning-readonly al verborgen; deze guard blokkeert ook bij DOM-manipulatie.
    if (!planningCanEdit()) {
      if (window.showError) window.showError("Je hebt alleen een kijkfunctie voor de planning.");
      return;
    }
    const id = ui.viewingId;
    if (id) {
      closeViewModal();
      openDienstPanel(id);
    }
  });
}

function initPlanningPage() {
  ui.dayDate = new Date();
  ui.monthDate = new Date();
  ui.weekStart = getMonday(new Date());
  setCalMode("week");
  setListMode(false);
  buildPlanningColumnsPanel();
  wirePlanningColumnsPanel();
  const ax = document.querySelector('input[name="planning-row-axis"]:checked');
  if (ax) ui.rowAxis = ax.value;
  renderAllViews();
  applyPlanningRoleMode();
  loadPlanningOwnLocaties();
  // Eigen-/locatie-scope: zodra rollen/profiel async geladen zijn, de read-only-
  // modus opnieuw bepalen, de locatie-koppeling (her)laden en her-renderen
  // (getBaseFiltered scoopt dan op de eigen locatie(s) + eigen diensten).
  try {
    if (window.besaPermissionsReady && typeof window.besaPermissionsReady.then === "function") {
      window.besaPermissionsReady.then(function () { applyPlanningRoleMode(); loadPlanningOwnLocaties(); renderAllViews(); });
    }
  } catch (e) { /* */ }
  // Supabase-client kan ná de eerste render klaarkomen → locatie-koppeling alsnog laden.
  try {
    if (window.besaSupabaseReady && typeof window.besaSupabaseReady.then === "function") {
      window.besaSupabaseReady.then(function () { loadPlanningOwnLocaties(); });
    }
  } catch (e) { /* */ }
  window.addEventListener("besa:profile-updated", function () { applyPlanningRoleMode(); loadPlanningOwnLocaties(); renderAllViews(); });
  initDienstPanel();
  initViewModal();
  initNav();
  initSearch();
  window.addEventListener("storage", (event) => {
    if (!event.key) return;
    if (
      [EMPLOYEE_ITEMS_STORAGE_KEY, "employees", DIENSTTYPES_STORAGE_KEY, BUREAUS_STORAGE_KEY, LOCATIES_STORAGE_KEY, "competenties", PLANNING_STORAGE_KEY].includes(
        event.key
      )
    ) {
      if (event.key === DIENSTTYPES_STORAGE_KEY && document.body.classList.contains("planning-dienst-open")) {
        const keep = getSelectedDiensttypeValuesSet();
        renderPlanningDiensttypeMultiselect(keep);
      }
      if (event.key === LOCATIES_STORAGE_KEY && document.body.classList.contains("planning-dienst-open")) {
        refreshDienstLocatieSelect();
      }
      renderAllViews();
    }
  });
  window.addEventListener("focus", () => {
    if (document.body.classList.contains("planning-dienst-open")) {
      const keep = getSelectedDiensttypeValuesSet();
      renderPlanningDiensttypeMultiselect(keep);
      refreshDienstLocatieSelect();
    }
    renderAllViews();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderAllViews();
  });
  // Wanneer de Supabase-bootstrap of een externe sync de planning-cache
  // vernieuwt, vragen we het rooster opnieuw te tekenen.
  window.addEventListener("besa:planning-updated", () => {
    // Staat de dienst-detail open terwijl de planning muteert? Dan is dít de dienst die
    // de gebruiker zojuist aanpaste — onthoud 'm zodat "Terug naar rooster" daar landt.
    if (ui.viewingId) ui.lastAdjustedId = ui.viewingId;
    // Her-evalueer ook het read-only-recht: bij koude cache zijn de permissies vaak
    // pas geladen tegen de tijd dat de planning-data binnenkomt → betrouwbare re-apply.
    try { applyPlanningRoleMode(); renderAllViews(); } catch (e) { /* */ }
  });
  // Toewijzen/uitnodigen muteert eerst de uitnodigingen (teamlid-sync volgt async); leg
  // de laatst-aangepaste dienst ook hier vast zodat de terugspring betrouwbaar werkt.
  window.addEventListener("besa:dienst-uitnodigingen-updated", () => {
    if (ui.viewingId) ui.lastAdjustedId = ui.viewingId;
  });
  window.addEventListener("besa:comp-diensttypes-updated", () => {
    try { renderAllViews(); } catch (e) { /* */ }
  });
  // Module 2 Bug #92: cliënt-dropdown sync wanneer cliënten elders in systeem worden gewijzigd
  window.addEventListener("besa:clienten-updated", () => {
    try { renderAllViews(); } catch (e) { /* */ }
  });
  window.addEventListener("besa:medewerkers-updated", () => {
    try { applyPlanningRoleMode(); loadPlanningOwnLocaties(); renderAllViews(); } catch (e) { /* */ }
  });
  // Locaties bepalen welke medewerkers planbaar zijn (kantoor/overhead = verborgen);
  // her-render zodra de locatie-data laadt of wijzigt.
  window.addEventListener("besa:locaties-updated", () => {
    try { renderAllViews(); } catch (e) { /* */ }
  });
  // Release 7: vrijgave-status van onboarders kan de selecteerbare medewerkers wijzigen.
  window.addEventListener("besa:onboarding-updated", () => {
    try { renderAllViews(); } catch (e) { /* */ }
  });
  // Sprint 4 / S4: filter-voorinstellingen lijst rendert direct uit cache + live-refresh
  try { renderPresetsList(); } catch (e) { /* */ }
  window.addEventListener("besa:planning-voorinstellingen-updated", () => {
    try { renderPresetsList(); } catch (e) { /* */ }
  });
  if (window.planningVoorinstellingenDB && window.planningVoorinstellingenDB.ready) {
    Promise.resolve(window.planningVoorinstellingenDB.ready).then(renderPresetsList, renderPresetsList);
  }
}

initPlanningPage();
