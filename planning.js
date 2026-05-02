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
const PLANNING_LOCATIE_VOLGORDE = [
  "Openstaande diensten",
  "Breedstraat",
  "Leonard Bramerstraat",
  "Zijperstraat",
  "Voorburggracht",
  "Varnebroek",
  "Magdalenenstraat",
  "Achterwacht",
  "Ambulant Extern",
  "WLZ",
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
  moveId: null,
  tarief: 45,
  prefillStartDay: null,
  viewingId: null,
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
  try {
    window.localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* demo */
  }
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
  return o;
}

function readPlanningItems() {
  return readJsonArray(PLANNING_STORAGE_KEY).map(normalizeItem);
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
      color: DIENSTTYPE_COLORS[v] || "#94a3b8",
    });
  });
  if (out.length === 0) {
    return DIENSTTYPE_ORDER.map((k) => ({
      value: k,
      label: DIENSTTYPE_LABELS[k],
      color: DIENSTTYPE_COLORS[k] || "#94a3b8",
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
    .filter((l) => !l?.archived)
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

function comparePlanningItemsByTime(a, b) {
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
  const da = String(a.diensttype || "").toLowerCase();
  const db = String(b.diensttype || "").toLowerCase();
  if (da !== db) return da.localeCompare(db, "nl", { sensitivity: "base" });
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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
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

function getRowKey(it) {
  const ax = ui.rowAxis || "afdeling";
  if (ax === "vestiging") return (it.vestiging || "").trim() || "Onbekende locatie";
  if (ax === "medewerker") return (it.teamlid || "—").trim() || "—";
  if (ax === "functie") return (it.functie || it.diensttype || "—").trim() || "—";
  return (it.afdeling || it.diensttype || "Overig").trim() || "Overig";
}

function makePlanningId() {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDataState() {
  const employees = readEmployees();
  const medewerkers = employees.map(getEmployeeName).filter(Boolean);
  const teamlead = employees
    .filter((emp) => /teamlead|teamleider/i.test(String(emp?.functie || "")))
    .map(getEmployeeName)
    .filter(Boolean);
  const teamleden = employees
    .filter((emp) => !/teamlead|teamleider/i.test(String(emp?.functie || "")))
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

function ensurePlanningSeed(dataState) {
  const existing = readJsonArray(PLANNING_STORAGE_KEY);
  if (existing.length > 0) return existing;
  try {
    if (window.localStorage.getItem(PLANNING_NO_DEMO_SEED_KEY) === "1") {
      return [];
    }
  } catch {
    /* */
  }
  const tm = (i) => dataState.teamleden[i % Math.max(1, dataState.teamleden.length)] || dataState.medewerkers[i] || "Medewerker";
  const teamleadFallback = dataState.teamlead[0] || dataState.medewerkers[0] || "Teamlead";
  const types = dataState.diensttypes;
  const t0 = (i) => types[i % types.length] || "Dienst";
  const cl = (i) => dataState.clienten[i % dataState.clienten.length] || "Cliënt";
  const afdL = dataState.afdelingen;
  const afd = (i) => afdL[i % afdL.length] || "Overig";
  const v0 = dataState.vestigingen[0] || "";
  const w0 = getMonday(new Date());
  const mk = (dayOffset, startHour, hoursDur, extra) => {
    const d = addDays(w0, dayOffset);
    d.setHours(startHour, 0, 0, 0);
    const de = new Date(d.getTime() + hoursDur * 3600000);
    return {
      id: makePlanningId(),
      afdeling: extra.afdeling,
      diensttype: extra.diensttype,
      functie: extra.functie,
      teamlead: teamleadFallback,
      teamlid: extra.teamlid,
      client: extra.client,
      vestiging: v0,
      locatie: extra.locatie,
      leer: extra.leer,
      sterren: extra.sterren,
      conflict: extra.conflict,
      start: toIsoLocal(d),
      einde: toIsoLocal(de),
    };
  };
  const seed = [
    mk(0, 8, 8, { afdeling: afd(0), diensttype: t0(0), functie: "Verzorging", teamlid: tm(0), client: cl(0), locatie: "A1", leer: 1, sterren: 2, conflict: false }),
    /* Bewuste overlap: zelfde medewerker, overlappende tijd (voor autodetect) */
    mk(0, 9, 2, { afdeling: afd(2), diensttype: t0(2), functie: "Extra afspraak", teamlid: tm(0), client: cl(1), locatie: "A1", leer: 0, sterren: 0, conflict: false }),
    mk(0, 15, 5, { afdeling: afd(1), diensttype: t0(1), functie: "Backoffice", teamlid: tm(1), client: cl(1), locatie: "B0", leer: 0, sterren: 1, conflict: false }),
    mk(1, 9, 6, { afdeling: afd(2), diensttype: t0(2), functie: "Verkoop vloer", teamlid: tm(2), client: cl(0), locatie: "Showroom", leer: 1, sterren: 3, conflict: true }),
    mk(1, 14, 3, { afdeling: afd(3), diensttype: t0(0), functie: "Magazijn", teamlid: tm(0), client: cl(1), locatie: "Docks", leer: 0, sterren: 0, conflict: false }),
    mk(2, 7, 4, { afdeling: afd(4), diensttype: t0(1), functie: "Logistiek ochtend", teamlid: tm(3), client: cl(0), locatie: "Gates", leer: 0, sterren: 2, conflict: false }),
    mk(2, 13, 4, { afdeling: afd(0), diensttype: t0(2), functie: "Planning call", teamlid: tm(4), client: cl(1), locatie: "Remote", leer: 2, sterren: 1, conflict: false }),
    mk(3, 8, 8, { afdeling: afd(5), diensttype: t0(0), functie: "1-op-1 begeleiding", teamlid: tm(1), client: cl(0), locatie: "Client", leer: 1, sterren: 2, conflict: false }),
    mk(3, 17, 2, { afdeling: afd(1), diensttype: t0(1), functie: "Late shifters", teamlid: tm(2), client: cl(1), locatie: "Nachtpunt", leer: 0, sterren: 3, conflict: true }),
    mk(4, 6, 7, { afdeling: afd(2), diensttype: t0(2), functie: "Openingsdienst", teamlid: tm(0), client: cl(0), locatie: "Kassa", leer: 0, sterren: 0, conflict: false }),
    mk(4, 15, 5, { afdeling: afd(3), diensttype: t0(0), functie: "Opleiding (starters)", teamlid: tm(5) || tm(0), client: cl(0), locatie: "Klaslokaal", leer: 3, sterren: 3, conflict: false }),
    mk(5, 8, 6, { afdeling: afd(4), diensttype: t0(1), functie: "Winkel weekend", teamlid: tm(3), client: cl(1), locatie: "Shop", leer: 0, sterren: 1, conflict: false }),
    mk(5, 15, 4, { afdeling: afd(5), diensttype: t0(2), functie: "Distributie", teamlid: tm(4), client: cl(0), locatie: "HUB", leer: 0, sterren: 1, conflict: false }),
  ];
  writePlanningItems(seed);
  return seed;
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

  /* Toolbar-locatiefilter (single select), gelijk aan vestigingsnaam in HR. */
  if (filterState.locatieToolbar) {
    const v = String(row.vestiging || "").trim();
    if (v !== filterState.locatieToolbar) return false;
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

function getBaseFiltered() {
  return readPlanningItems().filter(rowMatchesFilters);
}

function getItemsForView() {
  const all = getBaseFiltered();
  const { start, end } = getVisibleRange();
  return all.filter((row) => itemOverlapsRange(row, start, end));
}

/** Schat ZZP-kosten: alleen meetellen wanneer medewerker als ZZP gemarkeerd is in HR. */
function isZzpEmployeeName(name) {
  if (!name) return false;
  const want = String(name).trim().toLowerCase();
  if (!want) return false;
  const list = readEmployees();
  return list.some((emp) => {
    const n = getEmployeeName(emp).toLowerCase();
    if (n !== want) return false;
    const flags = [
      emp?.zzp,
      emp?.isZzp,
      emp?.zzper,
      emp?.dienstverband,
      emp?.contracttype,
      emp?.contractsoort,
    ];
    return flags.some((f) => /zzp/i.test(String(f || "")));
  });
}

function getMetrics(items) {
  let hours = 0;
  let zzpHours = 0;
  let kmKosten = 0;
  items.forEach((r) => {
    const h = durationHours(r.start, r.einde);
    const pauze = Math.max(0, Number(r.pauzeUren) || 0);
    const net = Math.max(0, h - pauze);
    hours += net;
    if (isZzpEmployeeName(r.teamlid)) zzpHours += net;
    const km = Number(r.kilometers) || 0;
    const kmTar = Number(r.kmTarief) || 0.23;
    if (km > 0) kmKosten += km * kmTar;
  });
  const uren = formatHoursShort(hours);
  const kosten = hours * ui.tarief;
  const zzpKosten = zzpHours * ui.tarief;
  const per = items.length > 0 ? kosten / items.length : 0;
  return {
    count: items.length,
    hours,
    uren,
    kosten,
    zzpKosten,
    kmKosten,
    per,
    tarief: ui.tarief,
  };
}

function renderSummary(items) {
  const el = document.getElementById("planning-summary");
  if (!el) return;
  const m = getMetrics(items);
  el.innerHTML = `
    <div class="planning-kpi planning-kpi--v3 planning-kpi--zzp">
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
    <div class="planning-kpi planning-kpi--v3 planning-kpi--km">
      <span class="planning-kpi-ico" aria-hidden="true">€</span>
      <div class="planning-kpi-txt">
        <span class="planning-stat-label">Kilometerkosten</span>
        <strong class="planning-stat-value planning-stat-value--money">${formatEuro(m.kmKosten)}</strong>
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
  return [...groups].sort((a, b) => {
    const ka = String(a || "").trim().toLowerCase();
    const kb = String(b || "").trim().toLowerCase();
    const ra = rank.has(ka) ? rank.get(ka) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(kb) ? rank.get(kb) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return String(a || "").localeCompare(String(b || ""), "nl", { sensitivity: "base" });
  });
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
      ui.dayDate = new Date(d);
      setListMode(false);
      setCalMode("day");
      renderAllViews();
    });
    el.appendChild(b);
  }
}

function renderMonthCalendar(host, items, overlapIds) {
  const monthStart = startOfMonth(ui.monthDate || new Date());
  const monthEnd = addDays(monthStart, daysInMonth(monthStart));
  const gridStart = getMonday(monthStart);
  const lastVisible = addDays(getMonday(addDays(monthEnd, 6)), 7);
  const days = [];
  for (let d = new Date(gridStart); d < lastVisible; d = addDays(d, 1)) days.push(new Date(d));

  const board = document.createElement("div");
  board.className = "planning-month-board";
  board.style.gridTemplateColumns = "42px repeat(7, minmax(132px, 1fr))";

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

    weekDays.forEach((day, dayIdx) => {
      const cell = document.createElement("div");
      cell.className = "planning-month-cell";
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
      head.innerHTML = `<span>${day.getDate()}</span>${inDay.length ? `<strong>${inDay.length}</strong>` : ""}`;
      cell.appendChild(head);

      const list = document.createElement("div");
      list.className = "planning-month-cell-list";
      inDay.slice(0, 4).forEach((it) => list.appendChild(buildShiftCardEl(it, dayIdx, overlapIds)));
      if (inDay.length > 4) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "planning-month-more";
        more.textContent = `+${inDay.length - 4} meer`;
        more.addEventListener("click", () => {
          ui.dayDate = new Date(day);
          setCalMode("day");
          renderAllViews();
        });
        list.appendChild(more);
      }
      cell.appendChild(list);
      board.appendChild(cell);
    });
  }

  host.appendChild(board);
}

function buildShiftCardEl(it, gi, overlapIds) {
  const card = document.createElement("div");
  card.className = "planning-erm-card";
  card.dataset.id = it.id;
  const autoOverlap = overlapIds && overlapIds.has(it.id);
  if (it.conflict || autoOverlap) card.classList.add("planning-erm-card--conflict");
  if (ui.selectedId === it.id) card.classList.add("is-selected");
  /* Streep-kleur volgt het diensttype (zoals in screenshot per dienst). */
  const dtParts = rowDiensttypeLabels(it);
  const firstLabel = dtParts[0];
  const dtKey = resolveDiensttypeKey(firstLabel || it.diensttype || it.functie);
  const accent = (dtKey && DIENSTTYPE_COLORS[dtKey]) || GRID_ACCENT[gi % GRID_ACCENT.length];
  card.style.setProperty("--erv-stripe", accent);
  const overlapTag =
    autoOverlap && !it.conflict
      ? '<span class="planning-erm-overlap" title="Overlap: zelfde medewerker, overlappende tijd">!</span>'
      : "";
  const cardTitle = it.conflict
    ? "Handmatig gemarkeerd als aandacht"
    : autoOverlap
      ? "Overlap: zelfde medewerker, overlappende periode (automatisch)"
      : "";
  if (cardTitle) card.setAttribute("title", cardTitle);
  else card.removeAttribute("title");
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
      <span class="planning-erm-when-w">${overlapTag}<span class="planning-erm-when">${formatTimeShort(it.start)} – ${formatTimeShort(it.einde)}</span></span>
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
    if (t.closest(".planning-erm-hbtn")) {
      const act = t.closest("[data-a]")?.getAttribute("data-a");
      if (act === "view") {
        openViewModal(it.id);
        ev.stopPropagation();
        return;
      }
      if (act === "edit") {
        openEditModal(it.id, false);
        ev.stopPropagation();
        return;
      }
      if (act === "del") {
        if (window.confirm("Deze planningsregel verwijderen?")) {
          const arr = readJsonArray(PLANNING_STORAGE_KEY).filter((x) => x.id !== it.id);
          writePlanningItems(arr);
          ui.selectedId = null;
          renderAllViews();
        }
        ev.stopPropagation();
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

function copyItem(it) {
  const s = parseStartDate(it.start);
  const e = parseStartDate(it.einde);
  if (!s || !e) return;
  const dur = e - s;
  s.setTime(s.getTime() + 3600000);
  e.setTime(s.getTime() + dur);
  const n = { ...it, id: makePlanningId(), start: toIsoLocal(s), einde: toIsoLocal(e) };
  const arr = readJsonArray(PLANNING_STORAGE_KEY);
  arr.unshift(n);
  writePlanningItems(arr);
  renderAllViews();
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
  const items = getItemsForView();
  host.classList.add("planning-erm--dense");
  host.classList.toggle("planning-erm--locations", ui.rowAxis === "vestiging");
  host.classList.toggle("planning-erm--month", ui.calMode === "month");
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
    // Neem extra locaties uit items mee (bijv. legacy-data of nieuwe import).
    groupItems(items).forEach((g) => {
      if (!seen.has(g)) {
        seen.add(g);
        groups.push(g);
      }
    });
    groups = sortLocatieGroepen(groups);
  } else {
    groups = items.length > 0 ? groupItems(items) : getEmptyWeekGroups();
  }
  groups.forEach((g) => byGroup.set(g, items.filter((x) => getRowKey(x) === g)));
  const colTotals = getDayHourTotals(cols, items);
  const totalWeek = colTotals.reduce((a, b) => a + b, 0);
  /* Korte dagcodes voor board-weergave ("ma 20", "di 21", …). */
  const dayShort = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const dayNames = dayShort;
  const colMin =
    ui.rowAxis === "vestiging"
      ? 168
      : ui.calMode === "month"
        ? 104
        : ui.calMode === "week"
          ? 92
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
    c.innerHTML = `<span class="planning-erm-dh-dow">${dayNames[d.getDay()]}</span><span class="planning-erm-dh-dom">${d.getDate()}</span>`;
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
      locBar.setAttribute("title", `Locatie: ${g}`);
      const count = list.length;
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
          <span class="planning-erm-glabel-chip planning-erm-glabel-chip--km" title="Kilometerkosten in deze rij">
            <span class="planning-erm-glabel-chip-ico" aria-hidden="true">€</span>
            <span>KM ${formatEuro(m.kmKosten)}</span>
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
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderListTable() {
  const body = document.getElementById("planning-table-body");
  const empty = document.getElementById("planning-empty");
  if (!body) return;
  const items = getItemsForView().slice().sort(comparePlanningItemsByTime);
  const overlapIds = buildOverlapConflictIds(items);
  body.innerHTML = "";
  items.forEach((item) => {
    const tr = document.createElement("tr");
    const h = durationHours(item.start, item.einde);
    const autoO = overlapIds.has(item.id);
    let risk = "—";
    if (item.conflict && autoO) risk = "Aandacht + overlap";
    else if (item.conflict) risk = "Aandacht";
    else if (autoO) risk = "Overlap (auto)";
    tr.innerHTML = `
      <td>${escapeHtml(item.afdeling || "—")}</td>
      <td>${escapeHtml(item.diensttype || "—")}</td>
      <td>${escapeHtml(item.functie || "—")}</td>
      <td>${escapeHtml(item.teamlead || "—")}</td>
      <td>${escapeHtml(item.teamlid || "—")}</td>
      <td>${escapeHtml(item.client || "—")}</td>
      <td>${escapeHtml(String(item.vestiging || "")) || "—"}</td>
      <td>${escapeHtml(String(item.locatie || "")) || "—"}</td>
      <td>${formatDateTime(item.start)}</td>
      <td>${formatDateTime(item.einde)}</td>
      <td>${h > 0 ? h.toFixed(1).replace(".", ",") : "—"}</td>
      <td>${item.leer}</td>
      <td>${item.sterren}</td>
      <td>${escapeHtml(risk)}</td>
    `;
    body.appendChild(tr);
  });
  if (empty) empty.hidden = items.length > 0;
}

function countOverlapInView(items) {
  return buildOverlapConflictIds(items).size;
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
  if (!ui.weekStart) ui.weekStart = getMonday(new Date());
  if (!ui.dayDate) ui.dayDate = new Date();
  if (!ui.monthDate) ui.monthDate = new Date();
  if (ui.dayDate) ui.dayDate = new Date(ui.dayDate);
  if (ui.monthDate) ui.monthDate = new Date(ui.monthDate);

  /* Vereenvoudigd filter-UI uit screenshot: enkel de zichtbare filters wiren. */
  renderFilterDiensttypeMultiselect();
  renderSimpleSelect("filter-teamlid", dataState.medewerkers, filterState.teamlid, "Selecteer een teamlid");
  renderSimpleSelect("filter-client", dataState.clienten, filterState.client, "Selecteer Cliënt");
  renderSimpleSelect("planning-loc-select", dataState.hrVestigingen, filterState.locatieToolbar, "Selecteer Locatie");
  syncAssignStatusRadios();

  const items = getItemsForView();
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

function fillSelect(selectId, items, withEmpty) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = "";
  if (withEmpty) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— kies —";
    sel.appendChild(o);
  }
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    sel.appendChild(opt);
  });
  if (current && (items || []).map(String).includes(String(current))) sel.value = current;
}

function fillLegacyPlanningLocationSelects(data) {
  const locaties = getVestigingOptiesVoorForm(data || buildDataState());
  fillSelect("plan-add-vestiging", locaties, true);
  fillSelect("plan-add-locatie", locaties, true);
}

function getItemById(id) {
  return readPlanningItems().find((x) => x.id === id);
}

function openAddModal() {
  ui.editingId = null;
  ui.moveId = null;
  const h = document.getElementById("planning-add-title");
  if (h) h.textContent = "Nieuwe planning";
  const b = document.getElementById("planning-add-submit");
  if (b) b.textContent = "Opslaan";
  return openModalWithState(buildDataState());
}

function openModalWithState(data) {
  const modal = document.getElementById("planning-add-modal");
  fillSelect("plan-add-afdeling", data.afdelingen, false);
  fillSelect("plan-add-diensttype", data.diensttypes, true);
  fillLegacyPlanningLocationSelects(data);
  fillSelect("plan-add-teamlead", data.teamlead, true);
  fillSelect("plan-add-teamlid", data.teamleden, true);
  fillSelect("plan-add-client", data.clienten, true);
  const si0 = document.getElementById("plan-add-start");
  const ei0 = document.getElementById("plan-add-einde");
  if (ui.prefillStartDay) {
    const p = new Date(ui.prefillStartDay);
    p.setHours(8, 0, 0, 0);
    const pEnd = new Date(p.getTime() + 8 * 3600000);
    if (si0) si0.value = toIsoLocal(p);
    if (ei0) ei0.value = toIsoLocal(pEnd);
    ui.prefillStartDay = null;
  } else {
  const w = getVisibleRange();
  const now = new Date();
  let start = new Date(now);
  if (ui.calMode === "day") {
    const d0 = new Date(ui.dayDate || now);
    d0.setHours(8, 0, 0, 0);
    if (!sameCalendarDay(d0, start)) start = d0;
  } else if (ui.calMode === "week") {
    if (!itemOverlapsRange({ start: toIsoLocal(start) }, w.start, w.end)) {
      start = new Date(w.start);
      start.setHours(8, 0, 0, 0);
    }
  } else {
    if (!itemOverlapsRange({ start: toIsoLocal(start) }, w.start, w.end)) {
      start = new Date(w.start);
      start.setHours(8, 0, 0, 0);
    }
  }
  const end = new Date(start.getTime() + 8 * 3600000);
  const si = document.getElementById("plan-add-start");
  const ei = document.getElementById("plan-add-einde");
  if (si) si.value = toIsoLocal(start);
  if (ei) ei.value = toIsoLocal(end);
  }
  if (modal) {
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
}

function openEditModal(id, isMove) {
  if (!isMove) {
    openDienstPanel(id);
    return;
  }
  const it = getItemById(id);
  if (!it) return;
  ui.editingId = id;
  const modal = document.getElementById("planning-add-modal");
  const h = document.getElementById("planning-add-title");
  if (h) h.textContent = isMove ? "Verplaatsen" : "Planning bewerken";
  const b = document.getElementById("planning-add-submit");
  if (b) b.textContent = "Bijwerken";
  const data = buildDataState();
  fillSelect("plan-add-afdeling", data.afdelingen, false);
  fillSelect("plan-add-diensttype", data.diensttypes, true);
  fillLegacyPlanningLocationSelects(data);
  fillSelect("plan-add-teamlead", data.teamlead, true);
  fillSelect("plan-add-teamlid", data.teamleden, true);
  fillSelect("plan-add-client", data.clienten, true);
  const v = (id) => document.getElementById(id);
  if (v("plan-add-afdeling")) v("plan-add-afdeling").value = it.afdeling || "";
  if (v("plan-add-diensttype")) v("plan-add-diensttype").value = it.diensttype || "";
  if (v("plan-add-functie")) v("plan-add-functie").value = it.functie || "";
  if (v("plan-add-vestiging")) v("plan-add-vestiging").value = it.vestiging || "";
  if (v("plan-add-locatie")) v("plan-add-locatie").value = it.locatie || "";
  if (v("plan-add-teamlead")) v("plan-add-teamlead").value = it.teamlead || "";
  if (v("plan-add-teamlid")) v("plan-add-teamlid").value = it.teamlid || "";
  if (v("plan-add-client")) v("plan-add-client").value = it.client || "";
  if (v("plan-add-start")) v("plan-add-start").value = it.start || "";
  if (v("plan-add-einde")) v("plan-add-einde").value = it.einde || "";
  if (v("plan-add-leer")) v("plan-add-leer").value = String(it.leer ?? 0);
  if (v("plan-add-sterren")) v("plan-add-sterren").value = String(it.sterren ?? 0);
  if (v("plan-add-conflict")) v("plan-add-conflict").checked = Boolean(it.conflict);
  if (modal) {
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
}

function readForm() {
  const locatie = document.getElementById("plan-add-locatie")?.value || "";
  const vestiging = document.getElementById("plan-add-vestiging")?.value || locatie;
  return {
    afdeling: document.getElementById("plan-add-afdeling")?.value || "",
    diensttype: document.getElementById("plan-add-diensttype")?.value || "",
    functie: document.getElementById("plan-add-functie")?.value?.trim() || "",
    vestiging,
    locatie,
    teamlead: document.getElementById("plan-add-teamlead")?.value || "",
    teamlid: document.getElementById("plan-add-teamlid")?.value || "",
    client: document.getElementById("plan-add-client")?.value || "",
    start: document.getElementById("plan-add-start")?.value || "",
    einde: document.getElementById("plan-add-einde")?.value || "",
    leer: parseInt(document.getElementById("plan-add-leer")?.value, 10) || 0,
    sterren: parseInt(document.getElementById("plan-add-sterren")?.value, 10) || 0,
    conflict: Boolean(document.getElementById("plan-add-conflict")?.checked),
  };
}

function closeModal() {
  const modal = document.getElementById("planning-add-modal");
  if (modal) {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
  }
  ui.editingId = null;
  document.getElementById("planning-add-form")?.reset();
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
    label.innerHTML = 'Jongere voor 1-op-1 begeleiding <span class="req">*</span>';
    if (hint) hint.hidden = false;
    if (select) select.setAttribute("aria-label", "Jongere voor 1-op-1 begeleiding");
  } else {
    label.innerHTML = 'Cliënt <span class="req">*</span>';
    if (hint) hint.hidden = true;
    if (select) select.setAttribute("aria-label", "Cliënt");
  }
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
  const wanted = new Set(
    rowDiensttypeLabels({ diensttype: value })
      .map((label) => resolveDiensttypeKey(label))
      .filter(Boolean)
  );
  renderPlanningDiensttypeMultiselect(wanted);
  applyDienstFormOneOnOneState();
}

function syncDienstRepeatOptions() {
  const checked = Boolean(document.getElementById("dienst-herhaal")?.checked);
  const options = document.getElementById("dienst-repeat-options");
  if (options) options.hidden = !checked;
}

function addRepeatInterval(date, freq, index) {
  const d = new Date(date);
  if (freq === "daily") d.setDate(d.getDate() + index);
  else if (freq === "monthly") d.setMonth(d.getMonth() + index);
  else d.setDate(d.getDate() + index * 7);
  return d;
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
  if (repeatCount) repeatCount.value = "1";
  if (repeatFreq) repeatFreq.value = "weekly";
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
  if (rt) rt.innerHTML = item.beschrijving || "";
  const h = document.getElementById("dienst-herhaal");
  if (h) h.checked = Boolean(item.herhaal);
  syncDienstRepeatOptions();
  applyDienstFormOneOnOneState();
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
    }
  });
  openBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openDienstPanel();
  });
  closeBtn?.addEventListener("click", () => closeDienstPanel());
  cancel?.addEventListener("click", () => closeDienstPanel());
  back?.addEventListener("click", () => closeDienstPanel());
  herhaal?.addEventListener("change", syncDienstRepeatOptions);
  form?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const diensttype = getSelectedDiensttypeFieldString().trim();
    const locHr = document.getElementById("dienst-locatie-hr")?.value || "";
    const teamlid = document.getElementById("dienst-mw")?.value || "";
    const client = document.getElementById("dienst-client")?.value || "";
    const sd = document.getElementById("dienst-startdate")?.value;
    const st = document.getElementById("dienst-starttime")?.value;
    const ed = document.getElementById("dienst-einddate")?.value;
    const et = document.getElementById("dienst-eindtime")?.value;
    if (!diensttype || !locHr || !teamlid || !client || !sd || !st || !ed || !et) {
      window.alert(
        !diensttype
          ? "Selecteer minstens één diensttype (de lijst volgt de compensatie-instellingen)."
          : "Vul alle verplichte velden in (met *)."
      );
      return;
    }
    const startIso = combineDateTimeToLocalIso(sd, st);
    const endIso = combineDateTimeToLocalIso(ed, et);
    if (!startIso || !endIso) {
      window.alert("Ongeldige start- of eindtijd.");
      return;
    }
    if (parseStartDate(endIso) <= parseStartDate(startIso)) {
      window.alert("Eindtijd moet na starttijd liggen.");
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
    const items = readJsonArray(PLANNING_STORAGE_KEY);
    if (ui.editingId) {
      const updated = items.map((x) =>
        x.id === ui.editingId
          ? normalizeItem({
              ...x,
              ...item,
              id: ui.editingId,
              conflict: Boolean(x.conflict),
              leer: x.leer ?? 0,
              sterren: x.sterren ?? 0,
            })
          : x
      );
      writePlanningItems(updated);
      closeDienstPanel();
      renderAllViews();
      return;
    }
    const toAdd = [normalizeItem(item)];
    if (her) {
      const s0 = parseStartDate(startIso);
      const e0 = parseStartDate(endIso);
      const freq = document.getElementById("dienst-repeat-frequency")?.value || "weekly";
      const count = Math.max(1, Math.min(52, parseInt(document.getElementById("dienst-repeat-count")?.value, 10) || 1));
      const untilRaw = document.getElementById("dienst-repeat-until")?.value || "";
      const until = untilRaw ? combineDateTimeToLocalIso(untilRaw, "23:59") : "";
      const untilDate = until ? parseStartDate(until) : null;
      if (s0 && e0) {
        for (let i = 1; i <= count; i++) {
          const rs = addRepeatInterval(s0, freq, i);
          const re = addRepeatInterval(e0, freq, i);
          if (untilDate && rs > untilDate) break;
          toAdd.push(
            normalizeItem({
              ...item,
              id: makePlanningId(),
              start: toIsoLocal(rs),
              einde: toIsoLocal(re),
              herhaal: true,
              herhaalFrequentie: freq,
            })
          );
        }
      }
    }
    toAdd.forEach((o) => items.unshift(o));
    writePlanningItems(items);
    closeDienstPanel();
    renderAllViews();
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

function exportPlanningCsv() {
  const items = getItemsForView();
  if (items.length === 0) {
    window.alert("Geen gegevens om te exporteren.");
    return;
  }
  const cols = [
    "afdeling",
    "diensttype",
    "functie",
    "teamlid",
    "client",
    "vestiging",
    "locatie",
    "start",
    "einde",
  ];
  const head = cols.join(";");
  const body = items
    .map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `planning-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function initAddModal() {
  const form = document.getElementById("planning-add-form");
  const closeBtn = document.getElementById("planning-add-close-btn");
  const cancelBtn = document.getElementById("planning-add-cancel-btn");
  const modal = document.getElementById("planning-add-modal");
  if (!form || !modal) return;
  function close() {
    closeModal();
  }
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const f = readForm();
    if (!f.afdeling || !f.teamlid || !f.client || !f.start || !f.einde) {
      window.alert("Vul de verplichte velden in (afdeling, teamlid, cliënt, start, einde).");
      return;
    }
    if (ui.editingId) {
      const items = readJsonArray(PLANNING_STORAGE_KEY).map((x) =>
        x.id === ui.editingId
          ? normalizeItem({
              ...x,
              ...f,
            })
          : x
      );
      writePlanningItems(items);
    } else {
      const items = readJsonArray(PLANNING_STORAGE_KEY);
      items.unshift(
        normalizeItem({ id: makePlanningId(), ...f })
      );
      writePlanningItems(items);
    }
    renderAllViews();
    close();
  });
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
    setListMode(false);
    setCalMode("day");
    renderAllViews();
  });
  document.getElementById("planning-cal-week")?.addEventListener("click", () => {
    setListMode(false);
    setCalMode("week");
    renderAllViews();
  });
  document.getElementById("planning-cal-month")?.addEventListener("click", () => {
    setListMode(false);
    setCalMode("month");
    renderAllViews();
  });
  document.getElementById("planning-view-list")?.addEventListener("click", () => {
    setListMode(true);
    renderAllViews();
  });
  document.getElementById("planning-view-roster")?.addEventListener("click", () => {
    setListMode(false);
    renderAllViews();
  });
  document.getElementById("planning-export-btn")?.addEventListener("click", exportPlanningCsv);
  document.getElementById("planning-clear-all-btn")?.addEventListener("click", () => {
    const ok = window.confirm(
      "Weet u zeker dat u alle geplande diensten uit het rooster wilt verwijderen?\n\n" +
        "Dit wist alle huidige planning (alle medewerkers/diensten). Niet ongedaan te maken. Demodata wordt daarna ook niet opnieuw ingeladen."
    );
    if (!ok) return;
    clearAllPlannedDiensten();
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

  /* Sidebar: Diensttype filter dropdown */
  document.getElementById("filter-diensttype-trigger")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFilterDtList();
  });

  /* Voorinstellingen (placeholder) */
  document.getElementById("planning-presets-new-btn")?.addEventListener("click", () => {
    const naam = window.prompt("Geef een naam voor deze voorinstelling (placeholder):");
    if (!naam) return;
    window.alert(
      `Voorinstelling “${naam}” opgeslagen (lokaal). Voorinstellingen-beheer komt in een vervolgrelease.`
    );
  });

  /* Toolbar: Genereren + Optimaliseren (placeholders, bevestigen + log) */
  document.getElementById("planning-gen-btn")?.addEventListener("click", () => {
    window.alert(
      "Genereren: dit pakt straks vrije diensten en wijst automatisch ZZP/medewerkers toe op basis van competenties en beschikbaarheid. (Nog niet actief)"
    );
  });
  document.getElementById("planning-opt-btn")?.addEventListener("click", () => {
    window.alert(
      "Optimaliseren: schuift bestaande planning zodat overlap, kosten en uren beter verdeeld worden. (Nog niet actief)"
    );
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
    filterState.teamlid = "";
    filterState.client = "";
    filterState.locatieToolbar = "";
    renderAllViews();
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

function openViewModal(id) {
  const it = getItemById(id);
  if (!it) return;
  const oids = buildOverlapConflictIds(getItemsForView());
  const autoOv = oids.has(it.id);
  let risk = "—";
  if (it.conflict && autoOv) risk = "Aandacht + overlappende tijd";
  else if (it.conflict) risk = "Aandacht / risico (handmatig)";
  else if (autoOv) risk = "Overlap (zelfde medewerker, automatisch)";
  else risk = "Geen";
  const h = durationHours(it.start, it.einde);
  const body = document.getElementById("planning-view-body");
  const modal = document.getElementById("planning-view-modal");
  if (!body || !modal) return;
  body.innerHTML = `
    <dl class="planning-view-dl">
      <div><dt>Teamlid</dt><dd>${escapeHtml(it.teamlid || "—")}</dd></div>
      <div><dt>Functie / rol</dt><dd>${escapeHtml(it.functie || "—")}</dd></div>
      <div><dt>Afdeling</dt><dd>${escapeHtml(it.afdeling || "—")}</dd></div>
      <div><dt>Diensttype</dt><dd>${escapeHtml(it.diensttype || "—")}</dd></div>
      <div><dt>Teamlead</dt><dd>${escapeHtml(it.teamlead || "—")}</dd></div>
      <div><dt>Cliënt</dt><dd>${escapeHtml(it.client || "—")}</dd></div>
      <div><dt>Vestiging</dt><dd>${escapeHtml(String(it.vestiging || "—"))}</dd></div>
      <div><dt>Locatie (zone)</dt><dd>${escapeHtml(String(it.locatie || "—"))}</dd></div>
      <div><dt>Start</dt><dd>${formatDateTime(it.start)}</dd></div>
      <div><dt>Einde</dt><dd>${formatDateTime(it.einde)}</dd></div>
      <div><dt>Duur</dt><dd>${h > 0 ? `${h.toFixed(1).replace(".", ",")} u` : "—"}</dd></div>
      <div><dt>Leer (niveau)</dt><dd>${it.leer}</dd></div>
      <div><dt>Sterren</dt><dd>${it.sterren}</dd></div>
      <div><dt>Risico / overlap</dt><dd>${escapeHtml(risk)}</dd></div>
    </dl>`;
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
    const id = ui.viewingId;
    if (id) {
      closeViewModal();
      openEditModal(id, false);
    }
  });
}

function initPlanningPage() {
  ui.dayDate = new Date();
  ui.monthDate = new Date();
  ui.weekStart = getMonday(new Date());
  setCalMode("week");
  setListMode(false);
  const ax = document.querySelector('input[name="planning-row-axis"]:checked');
  if (ax) ui.rowAxis = ax.value;
  renderAllViews();
  initDienstPanel();
  initAddModal();
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
      if (event.key === LOCATIES_STORAGE_KEY && !document.getElementById("planning-add-modal")?.hidden) {
        fillLegacyPlanningLocationSelects(buildDataState());
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
    if (!document.getElementById("planning-add-modal")?.hidden) {
      fillLegacyPlanningLocationSelects(buildDataState());
    }
    renderAllViews();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderAllViews();
  });
}

initPlanningPage();
