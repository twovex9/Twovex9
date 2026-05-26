/**
 * Stage 6 — bron-van-waarheid voor medewerker-form-data.
 *
 * Vroeger: sessionStorage["selectedEmployee"] + localStorage["employeeEditsById"]
 * werden samengevoegd om de actieve medewerker te bouwen. Dat was lokaal-only
 * en gaf data-divergentie tussen apparaten.
 *
 * Nu: medewerkers-data.js (Supabase tabel `medewerkers`, `data` jsonb voor de
 * niet-top-level velden) is de bron-van-waarheid. localStorage["employeeEditsById"]
 * is alleen nog een fallback voor:
 *   1) data die nog niet gemigreerd is naar Supabase (eenmalige boot-migratie),
 *   2) korte momenten dat de DB-cache nog niet binnen is.
 *
 * Schrijven gaat onverkort via writeEmployeeEdits() + medewerkersDB.syncFromLocalUpsert(),
 * zodat de form-flow niet hoeft te veranderen.
 */
function getSelectedEmployee() {
  try {
    const raw = window.sessionStorage.getItem("selectedEmployee");
    if (!raw) return null;
    const selected = JSON.parse(raw);

    // Voorkeur 1: Supabase medewerkersDB als bron (incl. data jsonb).
    if (selected?.empId && window.medewerkersDB && typeof window.medewerkersDB.getByIdSync === "function") {
      const fromDb = window.medewerkersDB.getByIdSync(selected.empId);
      if (fromDb) {
        // Top-level session-data behouden als fallback (bijv. __match), DB wint
        // voor alle echte data-velden.
        return Object.assign({}, selected, fromDb);
      }
    }

    // Voorkeur 2: legacy localStorage edits (fallback voor pre-migratie state).
    const editsById = readEmployeeEdits();
    if (selected?.empId && editsById[selected.empId]) {
      return Object.assign({}, selected, editsById[selected.empId]);
    }

    const selectedVoornaam = (selected?.voornaam || "").trim();
    const selectedAchternaam = (selected?.achternaam || "").trim();
    const selectedEmail = (selected?.email || "").trim();

    const match = Object.values(editsById).find((edit) => {
      if (!edit || typeof edit !== "object") return false;
      const m = edit.__match || {};
      return (
        (m.voornaam || "") === selectedVoornaam &&
        (m.achternaam || "") === selectedAchternaam &&
        (m.email || "") === selectedEmail
      );
    });

    return match ? Object.assign({}, selected, match) : selected;
  } catch {
    return null;
  }
}

const EMPLOYEE_EDITS_STORAGE_KEY = "employeeEditsById";
const EMPLOYEE_ITEMS_STORAGE_KEY = "employeeItems";
const EMPLOYEE_ACTIVE_TAB_STORAGE_KEY = "employeeActiveTab";
const EMPLOYEE_EDITS_MIGRATION_FLAG = "employeeEditsByIdMigratedToSupabase.v1";

function readEmployeeEdits() {
  // Voorkeur: bouw editsById vanuit medewerkersDB. Dat geeft een consistente
  // multi-device view zonder dat callers iets hoeven te wijzigen aan hun
  // shape-aannames.
  if (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function") {
    try {
      const list = window.medewerkersDB.getAllSync() || [];
      if (list.length) {
        const byId = {};
        for (let i = 0; i < list.length; i += 1) {
          const emp = list[i];
          if (!emp) continue;
          const key = emp.empId || emp.id;
          if (!key) continue;
          byId[key] = emp;
        }
        if (Object.keys(byId).length) return byId;
      }
    } catch (e) { /* fall back to localStorage */ }
  }
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_EDITS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeEmployeeEdits(edits) {
  // Schrijven naar localStorage blijft als korte-termijn cache + offline
  // fallback. De daadwerkelijke persistentie gebeurt via
  // medewerkersDB.syncFromLocalUpsert() in upsertEmployeeItem().
  try {
    window.localStorage.setItem(EMPLOYEE_EDITS_STORAGE_KEY, JSON.stringify(edits || {}));
  } catch {
    // Ignore storage errors in demo mode.
  }
}

/**
 * Eenmalige migratie van localStorage["employeeEditsById"] → Supabase
 * `medewerkers.data` jsonb. Roep aan zodra medewerkersDB beschikbaar is en
 * de cache van Supabase ten minste één keer is gevuld. Doet niets als de
 * vlag al gezet is of als er geen lokale edits zijn.
 */
async function migrateEmployeeEditsByIdToSupabase() {
  try {
    if (window.localStorage.getItem(EMPLOYEE_EDITS_MIGRATION_FLAG) === "1") return 0;
  } catch (e) { return 0; }
  if (!window.medewerkersDB || typeof window.medewerkersDB.update !== "function") return 0;

  let raw;
  try { raw = window.localStorage.getItem(EMPLOYEE_EDITS_STORAGE_KEY); }
  catch (e) { return 0; }
  if (!raw) {
    try { window.localStorage.setItem(EMPLOYEE_EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
    return 0;
  }

  let editsById;
  try { editsById = JSON.parse(raw); }
  catch (e) {
    try { window.localStorage.setItem(EMPLOYEE_EDITS_MIGRATION_FLAG, "1"); } catch (e2) { /* */ }
    return 0;
  }
  if (!editsById || typeof editsById !== "object") {
    try { window.localStorage.setItem(EMPLOYEE_EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
    return 0;
  }

  const keys = Object.keys(editsById);
  if (!keys.length) {
    try { window.localStorage.setItem(EMPLOYEE_EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
    return 0;
  }

  // Lookup: welke medewerkers staan al in de DB?
  let dbList = [];
  try {
    if (typeof window.medewerkersDB.getAllSync === "function") {
      dbList = window.medewerkersDB.getAllSync() || [];
    }
  } catch (e) { /* */ }
  const dbById = new Map();
  for (let i = 0; i < dbList.length; i += 1) {
    const emp = dbList[i];
    if (emp && (emp.id || emp.empId)) dbById.set(String(emp.id || emp.empId), emp);
  }

  let migrated = 0;
  let failed = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const edit = editsById[key];
    if (!edit || typeof edit !== "object") continue;
    if (!key || key.indexOf("legacy:") === 0) continue;
    if (!dbById.has(String(key))) continue;

    try {
      // Strip metadata-velden die niet naar de DB horen.
      const patch = Object.assign({}, edit);
      delete patch.__match;
      delete patch.__origin;
      // eslint-disable-next-line no-await-in-loop
      await window.medewerkersDB.update(key, patch);
      migrated += 1;
    } catch (err) {
      failed += 1;
      console.warn("[employeeEditsById migratie] update mislukt voor " + key + ":", err);
    }
  }

  // Vlag alleen zetten als alles goed ging — anders bij volgende boot opnieuw
  // proberen voor de gefaalde medewerkers.
  if (failed === 0) {
    try { window.localStorage.setItem(EMPLOYEE_EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
  }
  if (migrated > 0) {
    console.info("[employeeEditsById migratie] " + migrated + " medewerker(s) gesynchroniseerd naar Supabase.");
  }
  if (failed > 0) {
    console.warn("[employeeEditsById migratie] " + failed + " medewerker(s) niet gesynced — wordt bij volgende boot opnieuw geprobeerd.");
  }
  return migrated;
}

// Trigger de migratie zodra medewerkersDB klaar is (bootstrap event).
window.addEventListener("besa:medewerkers-updated", function onceForMigrate() {
  window.removeEventListener("besa:medewerkers-updated", onceForMigrate);
  migrateEmployeeEditsByIdToSupabase().catch(function (err) {
    console.error("[employeeEditsById migratie] onverwachte fout:", err);
  });
});

function upsertEmployeeItem(updated) {
  if (!updated) return;
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_ITEMS_STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(items) ? items : [];
    const key = updated.empId || updated.id;
    const idx = list.findIndex((x) => (x.id || x.empId) === key);
    const normalized = Object.assign({}, updated, { id: key || updated.id || updated.empId || "" });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], normalized);
    else list.unshift(normalized);
    window.localStorage.setItem(EMPLOYEE_ITEMS_STORAGE_KEY, JSON.stringify(list));
    // Houd de "employees"-cache (legacy key, voor andere modules) in sync.
    try { window.localStorage.setItem("employees", JSON.stringify(list)); } catch {}
  } catch {
    // Ignore storage errors in demo mode.
  }
  // Schrijf de wijziging asynchroon door naar Supabase. Fire-and-forget:
  // de UI heeft de update al lokaal toegepast, en bij fout verschijnt een
  // foutmelding in de console (geen blokkade voor de gebruiker).
  if (window.medewerkersDB && typeof window.medewerkersDB.syncFromLocalUpsert === "function") {
    window.medewerkersDB.syncFromLocalUpsert(updated);
  }
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "—";
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(value);
}

function getActiveUrenFieldIds() {
  const loondienstVariant = document.querySelector('.emp-prof-variant[data-prof-for="Loondienst"]');
  const isLoondienstVisible = Boolean(loondienstVariant && !loondienstVariant.hidden);
  if (isLoondienstVisible) {
    return {
      verleentzorg: "emp-loondienst-uren-verleentzorg",
      handmatig: "emp-loondienst-uren-handmatig",
    };
  }
  return {
    verleentzorg: "emp-uren-verleentzorg",
    handmatig: "emp-uren-handmatig",
  };
}

function getActiveProfFieldValues() {
  const loondienstVariant = document.querySelector('.emp-prof-variant[data-prof-for="Loondienst"]');
  const isLoondienstVisible = Boolean(loondienstVariant && !loondienstVariant.hidden);
  if (isLoondienstVisible) {
    return {
      profEmail: document.getElementById("emp-loondienst-prof-email")?.value || "",
      profTel: document.getElementById("emp-loondienst-prof-tel")?.value || "",
      profIban: document.getElementById("emp-loondienst-prof-iban")?.value || "",
      functie: document.getElementById("emp-loondienst-functie")?.value || "",
      startdatum: document.getElementById("emp-loondienst-startdatum")?.value || "",
      competentie: document.getElementById("emp-loondienst-competentie")?.value || "",
    };
  }
  return {
    profEmail: document.getElementById("emp-prof-email")?.value || "",
    profTel: document.getElementById("emp-prof-tel")?.value || "",
    profIban: document.getElementById("emp-prof-iban")?.value || "",
    functie: document.getElementById("emp-functie")?.value || "",
    startdatum: document.getElementById("emp-startdatum")?.value || "",
    competentie: document.getElementById("emp-competentie")?.value || "",
  };
}

function getActivePeriodiekeMaandValue() {
  const loondienstVariant = document.querySelector('.emp-prof-variant[data-prof-for="Loondienst"]');
  const isLoondienstVisible = Boolean(loondienstVariant && !loondienstVariant.hidden);
  if (isLoondienstVisible) {
    return document.getElementById("emp-loondienst-periodieke-maand")?.value || "";
  }
  return document.getElementById("emp-periodieke-maand")?.value || "";
}

function getActiveBeoordelingsdatumValue() {
  const loondienstVariant = document.querySelector('.emp-prof-variant[data-prof-for="Loondienst"]');
  const isLoondienstVisible = Boolean(loondienstVariant && !loondienstVariant.hidden);
  if (isLoondienstVisible) {
    return document.getElementById("emp-loondienst-beoordelingsdatum")?.value || "";
  }
  return document.getElementById("emp-beoordelingsdatum")?.value || "";
}

function getActiveVoorzieningenFieldIds() {
  const loondienstVariant = document.querySelector('.emp-prof-variant[data-prof-for="Loondienst"]');
  const isLoondienstVisible = Boolean(loondienstVariant && !loondienstVariant.hidden);
  if (isLoondienstVisible) {
    return {
      laptop: "emp-loondienst-voorz-laptop",
      sleutels: "emp-loondienst-voorz-sleutels",
      telefoon: "emp-loondienst-voorz-telefoon",
      simkaart: "emp-loondienst-voorz-simkaart",
      auto: "emp-loondienst-voorz-auto",
      fiets: "emp-loondienst-voorz-fiets",
      laptopNote: "emp-loondienst-voorz-laptop-note",
      sleutelsNote: "emp-loondienst-voorz-sleutels-note",
      telefoonNote: "emp-loondienst-voorz-telefoon-note",
      simkaartNote: "emp-loondienst-voorz-simkaart-note",
      autoNote: "emp-loondienst-voorz-auto-note",
      fietsNote: "emp-loondienst-voorz-fiets-note",
    };
  }
  return {
    laptop: "emp-voorz-laptop",
    sleutels: "emp-voorz-sleutels",
    telefoon: "emp-voorz-telefoon",
    simkaart: "emp-voorz-simkaart",
    auto: "emp-voorz-auto",
    fiets: "emp-voorz-fiets",
    laptopNote: "emp-voorz-laptop-note",
    sleutelsNote: "emp-voorz-sleutels-note",
    telefoonNote: "emp-voorz-telefoon-note",
    simkaartNote: "emp-voorz-simkaart-note",
    autoNote: "emp-voorz-auto-note",
    fietsNote: "emp-voorz-fiets-note",
  };
}

function getOpleidingState(listKey) {
  if (!window.__empOpleidingStates || typeof window.__empOpleidingStates !== "object") {
    window.__empOpleidingStates = {};
  }
  const key = listKey || "skj";
  if (!window.__empOpleidingStates[key] || typeof window.__empOpleidingStates[key] !== "object") {
    window.__empOpleidingStates[key] = { items: [] };
  }
  if (!Array.isArray(window.__empOpleidingStates[key].items)) {
    window.__empOpleidingStates[key].items = [];
  }
  return window.__empOpleidingStates[key];
}

function updateLoginAsButton(name) {
  const btn = document.getElementById("emp-loginas-btn");
  if (!btn) return;
  const firstName = (name || "").trim().split(/\s+/)[0] || "";
  btn.textContent = firstName ? `Inloggen als ${firstName}  \u2197` : "Inloggen als medewerker  \u2197";
}

function parseDDMMYYYY(str) {
  if (!str || str === "—") return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str.trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function ddmmyyyyToISO(str) {
  const d = parseDDMMYYYY(str);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDDMMYYYY(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return "";
  const [y, m, d] = str.split("-");
  return `${d}-${m}-${y}`;
}

function birthdayCountdown(bdayStr) {
  const bday = parseDDMMYYYY(bdayStr);
  if (!bday) return null;

  const now = new Date();
  let next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
  if (next < now) next = new Date(now.getFullYear() + 1, bday.getMonth(), bday.getDate());

  const diff = next - now;
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30);
  const remainDays = days % 30;
  const hours = Math.floor((diff % 86400000) / 3600000);
  return { months, days: remainDays, hours };
}

const LANDEN = [
  "Afghanistan","Åland","Albanië","Algerije","Amerikaans-Samoa","Amerikaanse Maagdeneilanden",
  "Andorra","Angola","Anguilla","Antarctica","Antigua en Barbuda","Argentinië","Armenië","Aruba",
  "Australië","Azerbeidzjan","Bahama's","Bahrein","Bangladesh","Barbados","België","Belize",
  "Benin","Bermuda","Bhutan","Bolivia","Bosnië en Herzegovina","Botswana","Brazilië","Brunei",
  "Bulgarije","Burkina Faso","Burundi","Cambodja","Canada","Centraal-Afrikaanse Republiek",
  "Chili","China","Colombia","Comoren","Congo","Costa Rica","Cuba","Curaçao","Cyprus",
  "Denemarken","Djibouti","Dominica","Dominicaanse Republiek","Duitsland","Ecuador","Egypte",
  "El Salvador","Equatoriaal-Guinea","Eritrea","Estland","Eswatini","Ethiopië","Fiji","Filipijnen",
  "Finland","Frankrijk","Gabon","Gambia","Georgië","Ghana","Gibraltar","Grenada","Griekenland",
  "Groenland","Guatemala","Guinee","Guinee-Bissau","Guyana","Haïti","Honduras","Hongarije",
  "Ierland","IJsland","India","Indonesië","Irak","Iran","Israël","Italië","Ivoorkust","Jamaica",
  "Japan","Jemen","Jordanië","Kaapverdië","Kameroen","Kazachstan","Kenia","Kirgizië","Kiribati",
  "Koeweit","Kosovo","Kroatië","Laos","Lesotho","Letland","Libanon","Liberia","Libië",
  "Liechtenstein","Litouwen","Luxemburg","Madagascar","Malawi","Maldiven","Maleisië","Mali",
  "Malta","Marokko","Mauritanië","Mauritius","Mexico","Moldavië","Monaco","Mongolië",
  "Montenegro","Mozambique","Myanmar","Namibië","Nauru","Nederland","Nepal","Nicaragua",
  "Nieuw-Zeeland","Niger","Nigeria","Noord-Korea","Noord-Macedonië","Noorwegen","Oeganda",
  "Oekraïne","Oezbekistan","Oman","Oostenrijk","Pakistan","Palau","Palestina","Panama",
  "Papoea-Nieuw-Guinea","Paraguay","Peru","Polen","Portugal","Qatar","Roemenië","Rusland",
  "Rwanda","Saint Lucia","Samoa","San Marino","Saoedi-Arabië","Senegal","Servië","Seychellen",
  "Sierra Leone","Singapore","Slovenië","Slowakije","Soedan","Somalië","Spanje","Sri Lanka",
  "Suriname","Syrië","Tadzjikistan","Tanzania","Thailand","Togo","Tonga","Trinidad en Tobago",
  "Tsjaad","Tsjechië","Tunesië","Turkije","Turkmenistan","Tuvalu","Uruguay","Vanuatu",
  "Vaticaanstad","Venezuela","Verenigde Arabische Emiraten","Verenigde Staten","Verenigd Koninkrijk",
  "Vietnam","Zambia","Zimbabwe","Zuid-Afrika","Zuid-Korea","Zuid-Soedan","Zweden","Zwitserland"
];
const CAO_OPTIONS = ["CAO Jeugdzorg", "CAO VVT"];
const LOCATIE_OPTIONS = [
  { name: "Voorburggracht", color: "#5ecf62" },
  { name: "Varnebroek", color: "#3d55df" },
  { name: "Magdalenenstraat", color: "#bf31bf" },
  { name: "Breedstraat", color: "#f0be4b" },
  { name: "Achterwacht", color: "#0917a8" },
  { name: "satelliet woning", color: "#9f49b9" },
  { name: "satelliet woning", color: "#9f49b9" },
  { name: "satelliet woning", color: "#9f49b9" },
];
const FUNCTIE_OPTIONS = [
  "Stagiair",
  "Coördinator Ambulant",
  "Ambulant Medewerker",
  "HR medewerker",
  "Leerling Pedagogisch medewerker",
  "Pedagogisch medewerker",
  "Sr. Pedagogisch medewerker",
  "Facilitair Medewerker",
  "Medewerker Financiële administratie",
  "Hoofd facilitair",
  "Planner",
  "Teamleider",
  "Financieel Directeur",
  "Operationeel Directeur",
  "Gedragswetenschapper",
  "Medewerker Kwaliteit en beleid",
];
const SALARISSCHAAL_OPTIONS = [
  "Schaal 4",
  "Schaal 5",
  "Schaal 6",
  "Schaal 7",
  "Schaal 8",
  "Schaal 9",
  "Schaal 10",
  "Schaal 11",
  "Schaal 12",
  "Schaal 13",
  "Schaal 14",
  "Stagevergoeding",
];
const SALARISTREDE_OPTIONS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "Stagevergoeding",
  "Omvang periodiek 1",
  "Omvang periodiek 2",
];
const PERIODIEKE_MAAND_OPTIONS = [
  "Januari",
  "Februari",
  "Maart",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Augustus",
  "September",
  "Oktober",
  "November",
  "December",
];
const OPLEIDING_SELECT_OPTIONS =
  typeof window !== "undefined" && window.OPLEIDINGEN_DEFAULT_NAMEN && window.OPLEIDINGEN_DEFAULT_NAMEN.length
    ? window.OPLEIDINGEN_DEFAULT_NAMEN.slice()
    : [];
function getDynamicOpleidingOptions() {
  var extra = [];
  try {
    var raw = localStorage.getItem("opleidingen");
    var list = raw ? JSON.parse(raw) : [];
    extra = list.filter(function (o) { return !o.archived; }).map(function (o) { return o.naam; });
  } catch (e) { /* ignore */ }
  return [...new Set([...OPLEIDING_SELECT_OPTIONS, ...extra])].sort(function (a, b) { return a.localeCompare(b, "nl", { sensitivity: "base" }); });
}

const ROOSTER_DAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function getLocatiesState() {
  if (!window.__empLocatiesState || typeof window.__empLocatiesState !== "object") {
    window.__empLocatiesState = { selected: [], coreMap: {} };
  }
  return window.__empLocatiesState;
}

function normalizeLocatieNames(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((name) => {
    const v = String(name || "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  });
  return out;
}

// Taal-dropdown: BS1-keuze (user 2026-05-15) = 4 vaste talen, geen landen-lijst.
// Opslag-code (in data.taal): "NL" / "ENG" / "FR" / "DE".
// Display-label in span: "Nederlands" / "Engels" / "Frans" / "Duits".
const TAAL_OPTIONS = [
  { code: "NL",  label: "Nederlands" },
  { code: "ENG", label: "Engels" },
  { code: "FR",  label: "Frans" },
  { code: "DE",  label: "Duits" },
];

function taalCodeToLabel(code) {
  if (!code) return "";
  const upper = String(code).toUpperCase();
  // Eerste poging: exact match op code (NL/ENG/FR/DE)
  const byCode = TAAL_OPTIONS.find((t) => t.code === upper);
  if (byCode) return byCode.label;
  // Tweede poging: match op label (case-insensitive, voor migratie van oude waardes)
  const byLabel = TAAL_OPTIONS.find((t) => t.label.toLowerCase() === String(code).toLowerCase());
  if (byLabel) return byLabel.label;
  // Backward-compat: bijv. "Nederland" → map naar "Nederlands"
  if (/^nederland/i.test(code)) return "Nederlands";
  if (/^engel|^english/i.test(code)) return "Engels";
  if (/^frans|^french|^franc/i.test(code)) return "Frans";
  if (/^duits|^german|^deutsch/i.test(code)) return "Duits";
  return String(code);
}

function taalLabelToCode(label) {
  if (!label) return "";
  const found = TAAL_OPTIONS.find((t) => t.label === label);
  return found ? found.code : String(label).toUpperCase();
}

function initTaalDropdown() {
  const btn = document.getElementById("emp-taal-btn");
  const panel = document.getElementById("emp-taal-panel");
  const list = document.getElementById("emp-taal-list");
  const search = document.getElementById("emp-taal-search");
  const valueSpan = document.getElementById("emp-taal-value");
  if (!btn || !panel || !list) return;

  // Search-input is overbodig voor 4 opties — verbergen indien aanwezig.
  if (search) {
    const searchWrap = search.closest("[class*='search'], div, label") || search.parentElement;
    if (searchWrap && searchWrap !== panel) {
      try { searchWrap.style.display = "none"; } catch (e) { /* */ }
    }
  }

  // Wipe eventuele bestaande items (in geval van re-init)
  list.innerHTML = "";

  TAAL_OPTIONS.forEach((opt) => {
    const li = document.createElement("li");
    li.className = "emp-dropdown-option";
    li.dataset.code = opt.code;
    li.textContent = opt.label;
    li.addEventListener("click", () => {
      if (valueSpan) {
        valueSpan.textContent = opt.label;
        valueSpan.dataset.code = opt.code;
      }
      panel.setAttribute("hidden", "");
    });
    list.appendChild(li);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => {
    panel.setAttribute("hidden", "");
  });
}

function initCaoDropdown() {
  const btn = document.getElementById("emp-cao-btn");
  const panel = document.getElementById("emp-cao-panel");
  const list = document.getElementById("emp-cao-list");
  const search = document.getElementById("emp-cao-search");
  const valueSpan = document.getElementById("emp-cao-value");
  if (!btn || !panel || !list || !valueSpan) return;

  function syncSelectedState() {
    const selected = (valueSpan.textContent || "").trim();
    list.querySelectorAll(".emp-dropdown-option").forEach((opt) => {
      opt.classList.toggle("is-selected", (opt.textContent || "").trim() === selected);
    });
  }

  CAO_OPTIONS.forEach((cao) => {
    const li = document.createElement("li");
    li.className = "emp-dropdown-option";
    li.textContent = cao;
    li.addEventListener("click", () => {
      valueSpan.textContent = cao;
      syncSelectedState();
      panel.setAttribute("hidden", "");
    });
    list.appendChild(li);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
      panel.removeAttribute("hidden");
      search?.focus();
      syncSelectedState();
    } else {
      panel.setAttribute("hidden", "");
    }
  });

  if (search) {
    search.addEventListener("click", (e) => e.stopPropagation());
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll(".emp-dropdown-option").forEach((opt) => {
        opt.hidden = q !== "" && !opt.textContent.toLowerCase().includes(q);
      });
    });
  }

  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => panel.setAttribute("hidden", ""));
  syncSelectedState();
}

function populateCompetentieSelects() {
  var comps = [];
  try {
    var raw = localStorage.getItem("competenties");
    var list = raw ? JSON.parse(raw) : [];
    comps = list.filter(function (c) { return !c.archived; }).map(function (c) { return c.naam; }).sort(function (a, b) { return a.localeCompare(b, "nl", { sensitivity: "base" }); });
  } catch (e) { /* ignore */ }
  ["emp-competentie", "emp-loondienst-competentie"].forEach(function (id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Selecteer Competenties";
    sel.appendChild(ph);
    comps.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  });
}

function loadEmployeeIntoForm() {
  populateCompetentieSelects();
  const emp = getSelectedEmployee() || {};

  const fullName = `${emp.voornaam || ""} ${emp.achternaam || ""}`.trim() || "Medewerker";
  setText("emp-fullname", fullName);
  document.title = `${fullName} — HR`;
  updateLoginAsButton(fullName);
  setText("emp-email-display", emp.email);
  setText("emp-tel-display", emp.tel);
  setText("emp-email-display2", emp.email);
  // emp-nr is sinds Loket-payroll-export Fase A een input (BS2-employee_number,
  // = Loket-personeelsnummer in maand-export kolom B). Toon de waarde; legacy
  // tekstveld 'overigeInfo' fungeert nog als fallback voor oudere data.
  (function () {
    var nrEl = document.getElementById("emp-nr");
    if (!nrEl) return;
    var v = emp.personeelsnummer;
    if (v == null || v === "") v = emp.overigeInfo;
    if (nrEl.tagName === "INPUT") nrEl.value = v != null && v !== "—" ? v : "";
    else nrEl.textContent = v != null && v !== "" ? String(v) : "—";
  })();
  const statusInput = document.getElementById("emp-status-input");
  if (statusInput) {
    // Normaliseer fase-varianten ('in_dienst' uit legacy BS2-import, 'Uit dienst', etc.)
    // zodat de waarde matcht met de <option value="In dienst"> / <option value="Uit dienst">.
    const rawFase = (emp.fase || "").trim();
    const normalized = rawFase.replace(/[_-]/g, " ").toLowerCase();
    statusInput.value = normalized === "uit dienst" ? "Uit dienst" : "In dienst";
    updateStatusInputColor();
  }
  setText("emp-bday-date", emp.verjaardag || "—");

  const cd = birthdayCountdown(emp.verjaardag);
  const cdEl = document.getElementById("emp-bday-countdown");
  if (cd && cdEl) {
    cdEl.innerHTML =
      `<span class="emp-bday-unit"><strong>${cd.months}</strong> Maanden</span>` +
      `<span class="emp-bday-unit"><strong>${cd.days}</strong> Dagen</span>` +
      `<span class="emp-bday-unit"><strong>${cd.hours}</strong> Uren</span>`;
  }

  setValue("emp-voornaam", emp.voornaam);
  setValue("emp-achternaam", emp.achternaam);
  setValue("emp-email", emp.email);
  setValue("emp-tel", emp.tel);
  setValue("emp-roepnaam", emp.roepnaam || emp.voornaam);
  setValue("emp-initialen", emp.initialen || ((emp.voornaam?.[0] || "") + (emp.achternaam?.[0] || "")));
  setValue("emp-bsn", emp.bsn);
  const caoValue = document.getElementById("emp-cao-value");
  if (caoValue && emp.cao) caoValue.textContent = emp.cao;
  setValue("emp-postcode", emp.postcode);
  setValue("emp-huisnummer", emp.huisnummer);
  setValue("emp-toevoeging", emp.toevoeging);
  setValue("emp-straat", emp.straat);
  setValue("emp-plaats", emp.plaats);
  setValue("emp-contact-naam", emp.contactNaam);
  setValue("emp-contact-tel", emp.contactTel);
  // notities loaded in initNotitiesSection()
  setValue("emp-inhuur-kvk", emp.inhuurKvk);
  setValue("emp-inhuur-btw", emp.inhuurBtw);
  setValue("emp-inhuur-bedrijfsnaam", emp.inhuurBedrijfsnaam);
  setValue("emp-inhuur-verzekering", emp.inhuurVerzekering);
  setValue("emp-inhuur-postcode", emp.inhuurPostcode);
  setValue("emp-inhuur-huisnummer", emp.inhuurHuisnummer);
  setValue("emp-inhuur-toevoeging", emp.inhuurToevoeging);
  setValue("emp-inhuur-straat", emp.inhuurStraat);
  setValue("emp-inhuur-stad", emp.inhuurStad);

  const gebEl = document.getElementById("emp-geboortedatum");
  if (gebEl) gebEl.value = ddmmyyyyToISO(emp.verjaardag) || "";
  const uitDienstEl = document.getElementById("emp-uitdienst-input");
  if (uitDienstEl) uitDienstEl.value = ddmmyyyyToISO(emp.uitDienst) || "";

  setValue("emp-functie", emp.functie);
  setValue("emp-loondienst-functie", emp.functie);
  const mapItems = (arr) => Array.isArray(arr)
    ? arr.map((x) => ({ naam: String(x?.naam || "").trim(), datum: String(x?.datum || "").trim() })).filter((x) => x.naam)
    : [];
  const savedSkjItems = mapItems(emp.opleidingItemsSkj || emp.opleidingItems);
  const fallbackOpleiding = String(emp.opleiding || "").trim();
  const savedTrainingItems = mapItems(emp.opleidingItemsTraining);
  if (!window.__empOpleidingStates) window.__empOpleidingStates = {};
  window.__empOpleidingStates.skj = {
    items: savedSkjItems.length
      ? savedSkjItems
      : fallbackOpleiding
        ? [{ naam: fallbackOpleiding, datum: "" }]
        : [],
  };
  window.__empOpleidingStates.training = { items: savedTrainingItems };
  if (typeof window.__renderEmpOpleidingen_skj === "function") window.__renderEmpOpleidingen_skj();
  if (typeof window.__renderEmpOpleidingen_training === "function") window.__renderEmpOpleidingen_training();
  setChecked("emp-skj-registratie", emp.skjRegistratie);
  setChecked("emp-training-bhv", emp.trainingBhv);
  setChecked("emp-training-gvvg", emp.trainingGvVg);
  setChecked("emp-training-medicatie", emp.trainingMedicatie);
  setValue("emp-startdatum", emp.startdatum);
  setValue("emp-loondienst-startdatum", emp.startdatum);
  setValue("emp-prof-email", emp.profEmail || emp.email);
  setValue("emp-prof-tel", emp.profTel || emp.tel);
  setValue("emp-prof-iban", emp.profIban);
  setValue("emp-loondienst-prof-email", emp.profEmail || emp.email);
  setValue("emp-loondienst-prof-tel", emp.profTel || emp.tel);
  setValue("emp-loondienst-prof-iban", emp.profIban);
  setValue("emp-competentie", emp.competentie);
  setValue("emp-loondienst-competentie", emp.competentie);
  setValue("emp-loondienst-salarisschaal", emp.salarisschaal);
  setValue("emp-loondienst-salaristrede", emp.salaristrede);
  setValue("emp-loondienst-contracturen", emp.contracturen);
  setValue("emp-loondienst-36uur-salaris", emp.salaris36uur || "€ 0,00");
  setValue("emp-loondienst-salaris", emp.salaris || "€ 0,00");
  setValue("emp-periodieke-maand", emp.periodiekeMaand);
  setValue("emp-loondienst-periodieke-maand", emp.periodiekeMaand);
  setValue("emp-beoordelingsdatum", emp.beoordelingsdatum);
  setValue("emp-loondienst-beoordelingsdatum", emp.beoordelingsdatum);
  if (typeof window.__syncLoondienstPeriodiekeMaandDropdown === "function") {
    window.__syncLoondienstPeriodiekeMaandDropdown();
  }
  const savedRooster = emp.rooster && typeof emp.rooster === "object" ? emp.rooster : null;
  if (savedRooster) {
    ROOSTER_DAYS.forEach((day) => {
      const entry = savedRooster[day];
      if (!entry || typeof entry !== "object") return;
      setChecked(`emp-rooster-${day}-enabled`, entry.enabled);
      setValue(`emp-rooster-${day}-start`, entry.start || "09:00");
      setValue(`emp-rooster-${day}-end`, entry.end || "17:00");
    });
  }
  if (typeof window.__setRoosterWeekendModes === "function") {
    window.__setRoosterWeekendModes(emp.roosterWeekend);
  }
  if (typeof window.__syncLoondienstSalaryDropdowns === "function") {
    window.__syncLoondienstSalaryDropdowns();
  }
  if (typeof window.__syncLoondienstContracturenWarning === "function") {
    window.__syncLoondienstContracturenWarning();
  }
  if (typeof window.__syncLoondienstRooster === "function") {
    window.__syncLoondienstRooster();
  }
  setValue("emp-uur-algemeen", emp.uurAlgemeen);
  setValue("emp-uur-diensttype", "Boventallig");
  setValue("emp-uur-tarief", emp.uurTarief);
  setValue("emp-beoordelingsdatum", emp.beoordelingsdatum);
  const selectedLocaties = normalizeLocatieNames(
    Array.isArray(emp.locatiesSelected)
      ? emp.locatiesSelected
      : String(emp.locatiesTags || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
  );
  const defaultLocaties = ["Voorburggracht", "Varnebroek", "Magdalenenstraat", "Breedstraat"];
  const coreMap =
    emp.locatiesCoreMap && typeof emp.locatiesCoreMap === "object"
      ? Object.assign({}, emp.locatiesCoreMap)
      : {};
  window.__empLocatiesState = {
    selected: selectedLocaties.length ? selectedLocaties : defaultLocaties,
    coreMap,
  };
  if (typeof window.__renderEmpLocaties === "function") {
    window.__renderEmpLocaties();
  }

  const dvEl = document.getElementById("emp-dienstverband");
  if (dvEl && emp.dienstverband) {
    for (const opt of dvEl.options) {
      if (opt.value === emp.dienstverband) { opt.selected = true; break; }
    }
  }
  if (dvEl) {
    dvEl.dataset.persistedValue = dvEl.value || emp.dienstverband || "Loondienst";
  }
  const inhuurEl = document.getElementById("emp-inhuurtype");
  if (inhuurEl && emp.inhuurtype) {
    for (const opt of inhuurEl.options) {
      if (opt.value === emp.inhuurtype) { opt.selected = true; break; }
    }
  }
  setChecked("emp-uren-verleentzorg", emp.urenVerleentzorg);
  setChecked("emp-uren-handmatig", emp.urenHandmatigRegistreren);
  setChecked("emp-loondienst-uren-verleentzorg", emp.urenVerleentzorg);
  setChecked("emp-loondienst-uren-handmatig", emp.urenHandmatigRegistreren);
  setChecked("emp-voorz-laptop", emp.voorzLaptop);
  setChecked("emp-voorz-sleutels", emp.voorzSleutels);
  setChecked("emp-voorz-telefoon", emp.voorzTelefoon);
  setChecked("emp-voorz-simkaart", emp.voorzSimkaart);
  setChecked("emp-voorz-auto", emp.voorzAuto);
  setChecked("emp-voorz-fiets", emp.voorzFiets);
  setChecked("emp-loondienst-voorz-laptop", emp.voorzLaptop);
  setChecked("emp-loondienst-voorz-sleutels", emp.voorzSleutels);
  setChecked("emp-loondienst-voorz-telefoon", emp.voorzTelefoon);
  setChecked("emp-loondienst-voorz-simkaart", emp.voorzSimkaart);
  setChecked("emp-loondienst-voorz-auto", emp.voorzAuto);
  setChecked("emp-loondienst-voorz-fiets", emp.voorzFiets);
  setValue("emp-voorz-laptop-note", emp.voorzLaptopNote);
  setValue("emp-voorz-sleutels-note", emp.voorzSleutelsNote);
  setValue("emp-voorz-telefoon-note", emp.voorzTelefoonNote);
  setValue("emp-voorz-simkaart-note", emp.voorzSimkaartNote);
  setValue("emp-voorz-auto-note", emp.voorzAutoNote);
  setValue("emp-voorz-fiets-note", emp.voorzFietsNote);
  setValue("emp-loondienst-voorz-laptop-note", emp.voorzLaptopNote);
  setValue("emp-loondienst-voorz-sleutels-note", emp.voorzSleutelsNote);
  setValue("emp-loondienst-voorz-telefoon-note", emp.voorzTelefoonNote);
  setValue("emp-loondienst-voorz-simkaart-note", emp.voorzSimkaartNote);
  setValue("emp-loondienst-voorz-auto-note", emp.voorzAutoNote);
  setValue("emp-loondienst-voorz-fiets-note", emp.voorzFietsNote);
  if (inhuurEl) {
    inhuurEl.dataset.persistedValue = inhuurEl.value || emp.inhuurtype || "";
  }

  // Taal: data.taal bewaart de code ("NL"/"ENG"/"FR"/"DE"); span toont label ("Nederlands" etc.)
  const taalValue = document.getElementById("emp-taal-value");
  if (taalValue) {
    const code = (emp.taal || "").toUpperCase();
    const label = taalCodeToLabel(code) || (emp.taal || "");
    if (label) {
      taalValue.textContent = label;
      if (code) taalValue.dataset.code = code;
    }
  }

  const userSetting = document.getElementById("emp-user-setting");
  if (userSetting && emp.userSetting) userSetting.value = emp.userSetting;

  const addressLine1 = document.getElementById("emp-address-line1");
  if (addressLine1) {
    const straat = (emp.straat || "").trim();
    const huisnummer = (emp.huisnummer || "").trim();
    const toevoeging = (emp.toevoeging || "").trim();
    const line1 = [straat, huisnummer, toevoeging].filter(Boolean).join(" ").trim();
    addressLine1.textContent = line1 || "—";
  }
  const addressLine2 = document.getElementById("emp-address-line2");
  if (addressLine2) {
    const postcode = (emp.postcode || "").trim();
    const plaats = (emp.plaats || "").trim();
    const line2 = [postcode, plaats].filter(Boolean).join(" ").trim();
    addressLine2.textContent = line2 || "—";
  }
  const notePreview = document.getElementById("emp-note-preview");
  if (notePreview) notePreview.textContent = (emp.notitie || "").trim() || "Er zijn geen notities.";

  if (typeof window.__syncFunctieDropdown === "function") {
    window.__syncFunctieDropdown();
  }
}

function initTabs() {
  const tabs = document.querySelectorAll(".emp-tab");
  const panels = document.querySelectorAll(".emp-tab-panel");

  function activateTab(target) {
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === target));
    panels.forEach((p) => p.classList.toggle("is-active", p.dataset.panel === target));
  }

  function restoreUnsavedDienstverbandState() {
    const dvEl = document.getElementById("emp-dienstverband");
    if (dvEl) {
      const persistedDienstverband = (dvEl.dataset.persistedValue || "").trim();
      if (persistedDienstverband && dvEl.value !== persistedDienstverband) {
        dvEl.value = persistedDienstverband;
      }
    }

    const inhuurEl = document.getElementById("emp-inhuurtype");
    if (inhuurEl) {
      const persistedInhuurtype = (inhuurEl.dataset.persistedValue || "").trim();
      if (inhuurEl.value !== persistedInhuurtype) {
        inhuurEl.value = persistedInhuurtype;
      }
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (target !== "details") {
        // Leaving Details discards non-saved Dienstverband edits.
        restoreUnsavedDienstverbandState();
      }

      activateTab(target);
      try {
        window.sessionStorage.setItem(EMPLOYEE_ACTIVE_TAB_STORAGE_KEY, target);
      } catch {
        // Ignore storage errors.
      }
    });
  });

  // Restore the last active tab after refresh/navigation.
  try {
    const saved = (window.sessionStorage.getItem(EMPLOYEE_ACTIVE_TAB_STORAGE_KEY) || "").trim();
    if (saved && document.querySelector(`.emp-tab[data-tab="${saved}"]`) && document.querySelector(`.emp-tab-panel[data-panel="${saved}"]`)) {
      activateTab(saved);
    }
  } catch {
    // Ignore storage errors.
  }
}

function initProfessioneelByDienstverband() {
  const dienstverbandSelect = document.getElementById("emp-dienstverband");
  const loondienstVariant = document.querySelector('.emp-prof-variant[data-prof-for="Loondienst"]');
  const inhuurVariant = document.querySelector('.emp-prof-variant[data-prof-for="Inhuur"]');
  const defaultBlock = document.querySelector("[data-prof-default]");
  if (!dienstverbandSelect || !loondienstVariant || !inhuurVariant || !defaultBlock) return;

  function syncProfessioneelVariant() {
    const persisted = (dienstverbandSelect.dataset.persistedValue || dienstverbandSelect.value || "").trim();
    const current = persisted || "Loondienst";
    const showInhuur = current === "Inhuur";
    const showLoondienst = current === "Loondienst";
    inhuurVariant.hidden = !showInhuur;
    loondienstVariant.hidden = !showLoondienst;
    defaultBlock.hidden = showInhuur || showLoondienst;
  }

  // Expose sync function so we can update view only after explicit save click.
  window.__syncProfessioneelVariant = syncProfessioneelVariant;
  syncProfessioneelVariant();
}

function initLocatiesSection() {
  const btn = document.getElementById("emp-locaties-select-btn");
  const chipsEl = document.getElementById("emp-locaties-chips");
  const panel = document.getElementById("emp-locaties-panel");
  const search = document.getElementById("emp-locaties-search");
  const list = document.getElementById("emp-locaties-list");
  const rows = document.getElementById("emp-kernteam-rows");
  const loondienstBtn = document.getElementById("emp-loondienst-locaties-select-btn");
  const loondienstChips = document.getElementById("emp-loondienst-locaties-chips");
  const loondienstPanel = document.getElementById("emp-loondienst-locaties-panel");
  const loondienstSearch = document.getElementById("emp-loondienst-locaties-search");
  const loondienstList = document.getElementById("emp-loondienst-locaties-list");
  const loondienstRows = document.getElementById("emp-loondienst-kernteam-rows");
  if (!btn || !chipsEl || !panel || !search || !list || !rows) return;

  function renderChipsInto(target) {
    if (!target) return;
    const state = getLocatiesState();
    const selected = normalizeLocatieNames(state.selected || []);
    target.innerHTML = "";
    if (!selected.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "emp-loc-chip-placeholder";
      placeholder.textContent = "Selecteer locaties";
      target.appendChild(placeholder);
      return;
    }
    selected.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "emp-loc-chip";
      chip.textContent = name;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "emp-loc-chip-remove";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        const s = getLocatiesState();
        s.selected = normalizeLocatieNames((s.selected || []).filter((x) => x !== name));
        delete s.coreMap[name];
        renderAll();
      });
      chip.appendChild(close);
      target.appendChild(chip);
    });
  }

  function toggleLocatie(name) {
    const s = getLocatiesState();
    const isSelected = (s.selected || []).includes(name);
    if (isSelected) {
      s.selected = normalizeLocatieNames((s.selected || []).filter((x) => x !== name));
      delete s.coreMap[name];
    } else {
      s.selected = normalizeLocatieNames([...(s.selected || []), name]);
      if (!(name in s.coreMap)) s.coreMap[name] = false;
    }
  }

  function renderListInto(targetList, query) {
    const state = getLocatiesState();
    const selectedSet = new Set(normalizeLocatieNames(state.selected || []));
    const q = (query || "").trim().toLowerCase();
    targetList.innerHTML = "";
    LOCATIE_OPTIONS.filter((loc) => loc.name.toLowerCase().includes(q)).forEach((loc) => {
      const item = document.createElement("li");
      item.className = "emp-loc-item";
      const left = document.createElement("span");
      left.className = "emp-loc-item-left";
      const dot = document.createElement("span");
      dot.className = "emp-loc-dot";
      dot.style.backgroundColor = loc.color;
      const txt = document.createElement("span");
      txt.textContent = loc.name;
      left.append(dot, txt);
      const check = document.createElement("span");
      check.className = "emp-loc-check";
      check.textContent = selectedSet.has(loc.name) ? "✓" : "";
      item.append(left, check);
      item.addEventListener("click", () => {
        toggleLocatie(loc.name);
        renderAll();
      });
      targetList.appendChild(item);
    });
  }

  function renderList() {
    renderListInto(list, search.value);
  }

  function renderLoondienstList() {
    if (!loondienstList || !loondienstSearch) return;
    renderListInto(loondienstList, loondienstSearch.value);
  }

  function renderKernteamRowsInto(targetRows) {
    if (!targetRows) return;
    const state = getLocatiesState();
    const selected = normalizeLocatieNames(state.selected || []);
    const colorByName = Object.fromEntries(LOCATIE_OPTIONS.map((x) => [x.name, x.color]));
    targetRows.innerHTML = "";
    selected.forEach((name) => {
      const row = document.createElement("label");
      row.className = "emp-kernteam-row";

      const left = document.createElement("div");
      left.className = "emp-kernteam-left";

      const dot = document.createElement("span");
      dot.className = "emp-kernteam-dot";
      dot.style.backgroundColor = colorByName[name] || "#6b7280";

      const nameEl = document.createElement("span");
      nameEl.className = "emp-kernteam-name";
      nameEl.textContent = name;

      const badge = document.createElement("span");
      badge.className = "emp-kernteam-badge";
      badge.textContent = "Kernteam";

      left.append(dot, nameEl, badge);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "emp-kernteam-checkbox";
      cb.checked = Boolean(state.coreMap[name]);

      function syncCoreVisual() {
        row.classList.toggle("is-core", cb.checked);
      }

      cb.addEventListener("change", () => {
        const s = getLocatiesState();
        s.coreMap[name] = cb.checked;
        syncCoreVisual();
      });
      row.append(left, cb);
      syncCoreVisual();
      targetRows.appendChild(row);
    });
  }

  function renderAll() {
    renderChipsInto(chipsEl);
    renderChipsInto(loondienstChips);
    renderList();
    renderKernteamRowsInto(rows);
    renderKernteamRowsInto(loondienstRows);
    renderLoondienstList();
  }

  window.__renderEmpLocaties = renderAll;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = panel.hasAttribute("hidden");
    if (open) {
      loondienstPanel?.setAttribute("hidden", "");
      loondienstBtn?.setAttribute("aria-expanded", "false");
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      search.focus();
    } else {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  search.addEventListener("input", renderList);
  loondienstBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = loondienstPanel?.hasAttribute("hidden");
    if (open) {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      loondienstPanel?.removeAttribute("hidden");
      loondienstBtn.setAttribute("aria-expanded", "true");
      loondienstSearch?.focus();
    } else {
      loondienstPanel?.setAttribute("hidden", "");
      loondienstBtn.setAttribute("aria-expanded", "false");
    }
  });
  loondienstPanel?.addEventListener("click", (e) => e.stopPropagation());
  loondienstSearch?.addEventListener("input", renderLoondienstList);
  document.addEventListener("click", () => {
    panel.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", "false");
    loondienstPanel?.setAttribute("hidden", "");
    loondienstBtn?.setAttribute("aria-expanded", "false");
  });

  renderAll();
}

function initFunctieScrollableDropdown() {
  const hiddenInput = document.getElementById("emp-functie");
  const btn = document.getElementById("emp-functie-btn");
  const panel = document.getElementById("emp-functie-panel");
  const list = document.getElementById("emp-functie-list");
  const valueEl = document.getElementById("emp-functie-value");
  if (!hiddenInput || !btn || !panel || !list || !valueEl) return;

  function syncValueText() {
    const selected = (hiddenInput.value || "").trim();
    valueEl.textContent = selected || "Selecteer functie";
  }

  function renderList() {
    const selected = (hiddenInput.value || "").trim();
    list.innerHTML = "";
    FUNCTIE_OPTIONS.forEach((opt) => {
      const li = document.createElement("li");
      li.className = "emp-dropdown-option";
      li.textContent = opt;
      li.classList.toggle("is-selected", selected === opt);
      li.addEventListener("click", () => {
        hiddenInput.value = opt;
        syncValueText();
        renderList();
        panel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      });
      list.appendChild(li);
    });
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = panel.hasAttribute("hidden");
    if (willOpen) {
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      renderList();
    } else {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => {
    panel.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", "false");
  });

  window.__syncFunctieDropdown = () => {
    syncValueText();
    renderList();
  };
  window.__syncFunctieDropdown();
}

function initLoondienstSalaryDropdowns() {
  function initSingle(hiddenId, btnId, panelId, listId, valueId, options, placeholder) {
    const hiddenInput = document.getElementById(hiddenId);
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    const list = document.getElementById(listId);
    const valueEl = document.getElementById(valueId);
    if (!hiddenInput || !btn || !panel || !list || !valueEl) return null;

    function syncValueText() {
      const selected = (hiddenInput.value || "").trim();
      valueEl.textContent = selected || placeholder;
    }

    function renderList() {
      const selected = (hiddenInput.value || "").trim();
      list.innerHTML = "";
      options.forEach((opt) => {
        const li = document.createElement("li");
        li.className = "emp-dropdown-option";
        li.textContent = opt;
        li.classList.toggle("is-selected", selected === opt);
        li.addEventListener("click", () => {
          hiddenInput.value = opt;
          syncValueText();
          renderList();
          panel.setAttribute("hidden", "");
          btn.setAttribute("aria-expanded", "false");
        });
        list.appendChild(li);
      });
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = panel.hasAttribute("hidden");
      if (willOpen) {
        panel.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
        renderList();
      } else {
        panel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    panel.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    });

    syncValueText();
    renderList();
    return { syncValueText, renderList };
  }

  const schaal = initSingle(
    "emp-loondienst-salarisschaal",
    "emp-loondienst-salarisschaal-btn",
    "emp-loondienst-salarisschaal-panel",
    "emp-loondienst-salarisschaal-list",
    "emp-loondienst-salarisschaal-value",
    SALARISSCHAAL_OPTIONS,
    "Selecteer Salarisschaal"
  );
  const trede = initSingle(
    "emp-loondienst-salaristrede",
    "emp-loondienst-salaristrede-btn",
    "emp-loondienst-salaristrede-panel",
    "emp-loondienst-salaristrede-list",
    "emp-loondienst-salaristrede-value",
    SALARISTREDE_OPTIONS,
    "Selecteer Salaristrede"
  );

  window.__syncLoondienstSalaryDropdowns = () => {
    schaal?.syncValueText();
    schaal?.renderList();
    trede?.syncValueText();
    trede?.renderList();
  };
}

function initLoondienstContracturenValidation() {
  const contracturenInput = document.getElementById("emp-loondienst-contracturen");
  const warning = document.getElementById("emp-loondienst-contracturen-warning");
  if (!contracturenInput || !warning) return;

  function syncWarning() {
    const raw = (contracturenInput.value || "").trim();
    if (raw === "") {
      warning.hidden = true;
      contracturenInput.removeAttribute("aria-invalid");
      return true;
    }
    const value = Number(raw);
    const isValid = Number.isFinite(value) && value >= 0 && value <= 100;
    warning.hidden = isValid;
    if (isValid) contracturenInput.removeAttribute("aria-invalid");
    else contracturenInput.setAttribute("aria-invalid", "true");
    if (typeof window.__syncLoondienstRooster === "function") {
      window.__syncLoondienstRooster();
    }
    return isValid;
  }

  contracturenInput.addEventListener("input", syncWarning);
  contracturenInput.addEventListener("change", syncWarning);
  window.__syncLoondienstContracturenWarning = syncWarning;
  syncWarning();
}

function initLoondienstRooster() {
  function normalizeTimeValue(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    const m = /^(\d{1,2})(?::?(\d{1,2}))?$/.exec(raw);
    if (!m) return "";
    const hh = Math.max(0, Math.min(23, Number(m[1])));
    const mm = Math.max(0, Math.min(59, Number(m[2] || "0")));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function toMinutes(timeValue) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(timeValue || "").trim());
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function calcHours(startValue, endValue) {
    const start = toMinutes(startValue);
    const end = toMinutes(endValue);
    if (start == null || end == null || end <= start) return 0;
    return (end - start) / 60;
  }

  function getDayEls(day) {
    return {
      enabled: document.getElementById(`emp-rooster-${day}-enabled`),
      state: document.getElementById(`emp-rooster-${day}-state`),
      body: document.getElementById(`emp-rooster-${day}-body`),
      off: document.getElementById(`emp-rooster-${day}-off`),
      start: document.getElementById(`emp-rooster-${day}-start`),
      end: document.getElementById(`emp-rooster-${day}-end`),
      hours: document.getElementById(`emp-rooster-${day}-hours`),
    };
  }

  function readTargetHours() {
    const contractInput = document.getElementById("emp-loondienst-contracturen");
    const value = Number(contractInput?.value || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function renderSummary() {
    const totalEl = document.getElementById("emp-rooster-total");
    const statusEl = document.getElementById("emp-rooster-status");
    const progressEl = document.getElementById("emp-rooster-progress-fill");
    if (!totalEl || !statusEl || !progressEl) return;

    let weeklyHours = 0;
    ROOSTER_DAYS.forEach((day) => {
      const { enabled, start, end } = getDayEls(day);
      if (!enabled || !start || !end) return;
      if (!enabled.checked) return;
      weeklyHours += calcHours(start.value, end.value);
    });

    const targetHours = readTargetHours();
    totalEl.textContent = `${weeklyHours.toFixed(1)} / ${targetHours.toFixed(0)} uur`;

    statusEl.classList.remove("is-low", "is-ok", "is-high");
    if (weeklyHours < targetHours) {
      statusEl.textContent = "Te weinig";
      statusEl.classList.add("is-low");
    } else if (weeklyHours > targetHours) {
      statusEl.textContent = "Te veel";
      statusEl.classList.add("is-high");
    } else {
      statusEl.textContent = "Goed";
      statusEl.classList.add("is-ok");
    }

    const pct = targetHours > 0 ? Math.min(100, Math.max(0, (weeklyHours / targetHours) * 100)) : 0;
    progressEl.style.width = `${pct}%`;
  }

  function renderDay(day) {
    const { enabled, state, body, off, start, end, hours } = getDayEls(day);
    if (!enabled || !state || !body || !off || !start || !end || !hours) return;
    const isOn = enabled.checked;
    state.textContent = isOn ? "Beschikbaar" : "Vrij";
    body.hidden = !isOn;
    off.hidden = isOn;
    const dayHours = isOn ? calcHours(start.value, end.value) : 0;
    hours.textContent = `${dayHours.toFixed(1)}u`;
  }

  function renderAll() {
    ROOSTER_DAYS.forEach((day) => renderDay(day));
    renderSummary();
    if (typeof window.__syncRoosterWeekendFromDays === "function") {
      window.__syncRoosterWeekendFromDays();
    }
  }

  let hasAnyField = false;
  ROOSTER_DAYS.forEach((day) => {
    const { enabled, start, end } = getDayEls(day);
    if (!enabled || !start || !end) return;
    hasAnyField = true;
    const normalizeStart = () => {
      start.value = normalizeTimeValue(start.value) || "00:00";
    };
    const normalizeEnd = () => {
      end.value = normalizeTimeValue(end.value) || "00:00";
    };
    const useCustomNormalize = start.type !== "time" || end.type !== "time";
    enabled.addEventListener("change", renderAll);
    start.addEventListener("input", renderAll);
    end.addEventListener("input", renderAll);
    if (useCustomNormalize) {
      start.addEventListener("blur", () => {
        normalizeStart();
        renderAll();
      });
      end.addEventListener("blur", () => {
        normalizeEnd();
        renderAll();
      });
      normalizeStart();
      normalizeEnd();
    }
  });

  if (!hasAnyField) return;
  window.__syncLoondienstRooster = renderAll;
  renderAll();
}

function initRoosterWeekendAfwisseling() {
  const cards = Array.from(document.querySelectorAll(".emp-rooster-weekend-card"));
  if (!cards.length) return;

  function setMode(day, mode) {
    const card = cards.find((x) => x.dataset.weekendDay === day);
    if (!card) return;
    const nextMode = ["alle", "even", "oneven"].includes(mode) ? mode : "alle";
    card.dataset.weekendMode = nextMode;
    card.querySelectorAll(".emp-rooster-weekend-mode").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.weekendMode === nextMode);
    });
  }

  function syncFromDays() {
    cards.forEach((card) => {
      const day = card.dataset.weekendDay;
      const isActive = Boolean(document.getElementById(`emp-rooster-${day}-enabled`)?.checked);
      const stateEl = card.querySelector(".emp-rooster-weekend-state");
      const dotEl = card.querySelector(".emp-rooster-weekend-dot");
      if (stateEl) stateEl.textContent = isActive ? "(actief)" : "(niet actief)";
      if (dotEl) dotEl.classList.toggle("is-active", isActive);
      card.classList.toggle("is-inactive", !isActive);
      card.querySelectorAll(".emp-rooster-weekend-mode").forEach((btn) => {
        btn.disabled = !isActive;
      });
    });
  }

  cards.forEach((card) => {
    const day = card.dataset.weekendDay;
    setMode(day, card.dataset.weekendMode || "alle");
    card.querySelectorAll(".emp-rooster-weekend-mode").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMode(day, btn.dataset.weekendMode || "alle");
      });
    });
  });

  window.__setRoosterWeekendModes = (value) => {
    const data = value && typeof value === "object" ? value : {};
    setMode("za", data.za || "alle");
    setMode("zo", data.zo || "alle");
    syncFromDays();
  };
  window.__getRoosterWeekendModes = () => ({
    za: cards.find((x) => x.dataset.weekendDay === "za")?.dataset.weekendMode || "alle",
    zo: cards.find((x) => x.dataset.weekendDay === "zo")?.dataset.weekendMode || "alle",
  });
  window.__syncRoosterWeekendFromDays = syncFromDays;
  syncFromDays();
}

function initLoondienstPeriodiekeMaandDropdown() {
  const hiddenInput = document.getElementById("emp-loondienst-periodieke-maand");
  const btn = document.getElementById("emp-loondienst-periodieke-maand-btn");
  const panel = document.getElementById("emp-loondienst-periodieke-maand-panel");
  const list = document.getElementById("emp-loondienst-periodieke-maand-list");
  const valueEl = document.getElementById("emp-loondienst-periodieke-maand-value");
  if (!hiddenInput || !btn || !panel || !list || !valueEl) return;

  function syncValueText() {
    const selected = (hiddenInput.value || "").trim();
    valueEl.textContent = selected || "Selecteer een maand";
  }

  function renderList() {
    const selected = (hiddenInput.value || "").trim();
    list.innerHTML = "";
    PERIODIEKE_MAAND_OPTIONS.forEach((opt) => {
      const li = document.createElement("li");
      li.className = "emp-dropdown-option";
      li.textContent = opt;
      li.classList.toggle("is-selected", selected === opt);
      li.addEventListener("click", () => {
        hiddenInput.value = opt;
        syncValueText();
        renderList();
        panel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      });
      list.appendChild(li);
    });
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = panel.hasAttribute("hidden");
    if (willOpen) {
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      renderList();
    } else {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => {
    panel.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", "false");
  });

  window.__syncLoondienstPeriodiekeMaandDropdown = () => {
    syncValueText();
    renderList();
  };
  window.__syncLoondienstPeriodiekeMaandDropdown();
}

/* ── Verzuim ──────────────────────────── */

// Verzuim-perioden worden in Supabase opgeslagen via window.medewerkerVerzuimDB.
// De legacy localStorage employeeEditsById per-medewerker `.verzuim.kort[]`
// en `.verzuim.lang[]` worden automatisch eenmalig gemigreerd bij eerste boot.

function reportVerzuimError(label, err) {
  try { console.error("[medewerker verzuim]", label, err); } catch (e) { /* */ }
  var msg = "Verzuim opslaan mislukt. Controleer je verbinding en probeer opnieuw.";
  if (err && err.message) msg = "Verzuim opslaan mislukt: " + err.message;
  if (typeof showSaveModal === "function") showSaveModal(msg, "Fout");
  else if (typeof showToast === "function") showToast(msg);
}

function getCurrentEmployeeIdForVerzuim() {
  const emp = getSelectedEmployee();
  if (!emp) return "";
  return String(emp.empId || emp.id || emp.naam || "");
}

function readVerzuimRowsForCurrent(type) {
  const empId = getCurrentEmployeeIdForVerzuim();
  if (!empId) return [];
  if (window.medewerkerVerzuimDB && typeof window.medewerkerVerzuimDB.getForMedewerkerSync === "function") {
    return window.medewerkerVerzuimDB.getForMedewerkerSync(empId, type);
  }
  return [];
}

function initVerzuimSection() {
  let activeModalType = "kort";
  const renderers = {};

  document.querySelectorAll(".emp-verzuim-block[data-verzuim-type]").forEach((block) => {
    const type = block.dataset.verzuimType;
    const tbody = block.querySelector(".emp-verzuim-table tbody");
    const emptyEl = block.querySelector(".emp-verzuim-empty");
    const searchInput = block.querySelector(".emp-verzuim-search");
    const pageInfoEl = block.querySelector(".emp-verzuim-page-info");
    const pageLabelEl = block.querySelector(".emp-verzuim-page-label");
    const pageSizeSelect = block.querySelector(".emp-verzuim-page-size select");
    const colBtn = block.querySelector(".emp-verzuim-col-btn");
    const colDropdown = block.querySelector(".emp-verzuim-col-dropdown");
    const addBtn = block.querySelector(".emp-verzuim-add-btn");

    let sortKey = "";
    let sortDir = "asc";
    let currentPage = 0;

    function getPageSize() {
      return parseInt(pageSizeSelect?.value || "50", 10);
    }

    function getVisibleCols() {
      const cols = {};
      block.querySelectorAll(".emp-verzuim-col-dropdown input[type='checkbox']").forEach((cb) => {
        cols[cb.dataset.col] = cb.checked;
      });
      return cols;
    }

    function applyColumnVisibility() {
      const cols = getVisibleCols();
      block.querySelectorAll("[data-col]").forEach((el) => {
        if (el.closest(".emp-verzuim-col-dropdown")) return;
        const col = el.dataset.col;
        if (col && col in cols) el.style.display = cols[col] ? "" : "none";
      });
    }

    function isoToDisplay(iso) {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}-${m}-${y}`;
    }

    function render() {
      let items = readVerzuimRowsForCurrent(type);
      const q = (searchInput?.value || "").trim().toLowerCase();
      if (q) {
        items = items.filter((it) =>
          [it.eerstZiektedag, it.verwachteTerug, it.werkelijkeTerug, it.beschrijving, it.status]
            .join(" ").toLowerCase().includes(q)
        );
      }
      if (sortKey) {
        items.sort((a, b) => {
          const va = (a[sortKey] || "").toLowerCase();
          const vb = (b[sortKey] || "").toLowerCase();
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }
      const total = items.length;
      const pageSize = getPageSize();
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (currentPage >= totalPages) currentPage = totalPages - 1;
      if (currentPage < 0) currentPage = 0;
      const start = currentPage * pageSize;
      const pageItems = items.slice(start, start + pageSize);

      tbody.innerHTML = "";
      if (!pageItems.length) {
        emptyEl.style.display = "";
      } else {
        emptyEl.style.display = "none";
        pageItems.forEach((item) => {
          const tr = document.createElement("tr");
          tr.dataset.verzuimId = item.id;
          const cols = ["eerstZiektedag", "verwachteTerug", "werkelijkeTerug", "beschrijving", "status"];
          cols.forEach((col) => {
            const td = document.createElement("td");
            td.setAttribute("data-col", col);
            if (col === "status") {
              const span = document.createElement("span");
              span.className = "emp-verzuim-status emp-verzuim-status--" + (item.status === "Hersteld" ? "hersteld" : "actief");
              span.textContent = item.status || "Actief";
              td.appendChild(span);
            } else if (col === "beschrijving") {
              td.innerHTML = item.beschrijving || "";
            } else {
              td.textContent = isoToDisplay(item[col]) || "";
            }
            tr.appendChild(td);
          });
          const tdAct = document.createElement("td");
          tdAct.className = "emp-verzuim-col-acties";
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "emp-verzuim-delete-btn";
          delBtn.title = "Verwijderen";
          delBtn.innerHTML = "&#10005;";
          delBtn.dataset.verzuimId = item.id;
          delBtn.addEventListener("click", async () => {
            if (!window.medewerkerVerzuimDB || typeof window.medewerkerVerzuimDB.remove !== "function") {
              reportVerzuimError("data-laag niet beschikbaar", new Error("medewerkerVerzuimDB ontbreekt"));
              return;
            }
            delBtn.setAttribute("disabled", "");
            try {
              await window.medewerkerVerzuimDB.remove(item.id);
              // UI ververst zichzelf via besa:medewerker-verzuim-updated event.
            } catch (err) {
              reportVerzuimError("verwijderen mislukt", err);
            } finally {
              delBtn.removeAttribute("disabled");
            }
          });
          tdAct.appendChild(delBtn);
          tr.appendChild(tdAct);
          tbody.appendChild(tr);
        });
      }

      if (pageInfoEl) pageInfoEl.textContent = `${pageSize} of ${total} total.`;
      if (pageLabelEl) pageLabelEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;

      applyColumnVisibility();
    }

    block.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = "asc";
        }
        render();
      });
    });

    if (searchInput) searchInput.addEventListener("input", () => { currentPage = 0; render(); });
    if (pageSizeSelect) pageSizeSelect.addEventListener("change", () => { currentPage = 0; render(); });

    block.querySelectorAll(".emp-verzuim-page-nav button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const total = readVerzuimRowsForCurrent(type).length;
        const totalPages = Math.max(1, Math.ceil(total / getPageSize()));
        const action = btn.dataset.page;
        if (action === "first") currentPage = 0;
        else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
        else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
        else if (action === "last") currentPage = totalPages - 1;
        render();
      });
    });

    if (colBtn) {
      colBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = colDropdown.style.display !== "none";
        colDropdown.style.display = open ? "none" : "";
      });
    }
    if (colDropdown) {
      colDropdown.addEventListener("click", (e) => e.stopPropagation());
      colDropdown.querySelectorAll("input[type='checkbox']").forEach((cb) => {
        cb.addEventListener("change", () => applyColumnVisibility());
      });
    }

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        activeModalType = type;
        const modal = document.getElementById("emp-verzuim-modal");
        if (modal) modal.style.display = "";
        const datumEl = document.getElementById("emp-verzuim-datum");
        const editorEl = document.getElementById("emp-verzuim-editor");
        if (datumEl) datumEl.value = "";
        if (editorEl) editorEl.innerHTML = "";
      });
    }

    renderers[type] = render;
    render();
  });

  // Live re-render bij elke wijziging in de Supabase-cache (incl. bootstrap,
  // andere tab, externe sync). Beide blokken (kort + lang) opnieuw renderen.
  window.addEventListener("besa:medewerker-verzuim-updated", function () {
    Object.keys(renderers).forEach(function (t) {
      try { renderers[t](); } catch (e) { /* */ }
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".emp-verzuim-block[data-verzuim-type] .emp-verzuim-col-dropdown").forEach((d) => d.style.display = "none");
  });

  // Modal toolbar
  document.querySelectorAll(".emp-verzuim-modal-toolbar button").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      if (cmd === "formatBlock") {
        document.execCommand(cmd, false, btn.dataset.val || "P");
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  // Modal close
  const modal = document.getElementById("emp-verzuim-modal");
  const closeBtn = document.getElementById("emp-verzuim-modal-close");
  const cancelBtn = document.getElementById("emp-verzuim-modal-cancel");
  const submitBtn = document.getElementById("emp-verzuim-modal-submit");

  function closeModal() { if (modal) modal.style.display = "none"; }
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const datum = document.getElementById("emp-verzuim-datum")?.value || "";
      const beschrijving = (document.getElementById("emp-verzuim-editor")?.innerHTML || "").trim();
      if (!datum) {
        document.getElementById("emp-verzuim-datum")?.focus();
        return;
      }
      if (!window.medewerkerVerzuimDB || typeof window.medewerkerVerzuimDB.add !== "function") {
        reportVerzuimError("data-laag niet beschikbaar", new Error("medewerkerVerzuimDB ontbreekt"));
        return;
      }
      const empId = getCurrentEmployeeIdForVerzuim();
      if (!empId) {
        reportVerzuimError("geen medewerker geselecteerd", new Error("getSelectedEmployee leeg"));
        return;
      }
      submitBtn.setAttribute("disabled", "");
      try {
        await window.medewerkerVerzuimDB.add({
          medewerkerId: empId,
          type: activeModalType,
          eerstZiektedag: datum,
          verwachteTerug: "",
          werkelijkeTerug: "",
          beschrijving: beschrijving,
          status: "Actief",
        });
        closeModal();
        // UI ververst zichzelf via besa:medewerker-verzuim-updated event.
      } catch (err) {
        reportVerzuimError("toevoegen mislukt", err);
      } finally {
        submitBtn.removeAttribute("disabled");
      }
    });
  }
}

/* ── Verlof tables ────────────────────── */

// Verlof-overgedragen wordt in Supabase opgeslagen via
// window.medewerkerVerlofOvergedragenDB. De legacy localStorage
// employeeEditsById per-medewerker `.verlofOvergedragen` object wordt
// automatisch eenmalig gemigreerd bij eerste boot.

function reportVerlofError(label, err) {
  try { console.error("[medewerker verlof-overgedragen]", label, err); } catch (e) { /* */ }
  var msg = "Overgedragen uren opslaan mislukt. Controleer je verbinding en probeer opnieuw.";
  if (err && err.message) msg = "Overgedragen uren opslaan mislukt: " + err.message;
  if (typeof showSaveModal === "function") showSaveModal(msg, "Fout");
  else if (typeof showToast === "function") showToast(msg);
}

const VERLOF_OVERD_DEFAULT = {
  wetTotaal: 0, wetGebruikt: 0, wetBeschikbaar: 0,
  bovenwetTotaal: 0, bovenwetGebruikt: 0, bovenwetBeschikbaar: 0,
  reden: "",
};

function getCurrentEmployeeIdForVerlof() {
  const emp = getSelectedEmployee();
  if (!emp) return "";
  return String(emp.empId || emp.id || emp.naam || "");
}

function readVerlofOvergedragenForCurrent() {
  const empId = getCurrentEmployeeIdForVerlof();
  if (!empId) return Object.assign({}, VERLOF_OVERD_DEFAULT);
  if (window.medewerkerVerlofOvergedragenDB && typeof window.medewerkerVerlofOvergedragenDB.getForMedewerkerSync === "function") {
    const stored = window.medewerkerVerlofOvergedragenDB.getForMedewerkerSync(empId);
    if (stored) return Object.assign({}, VERLOF_OVERD_DEFAULT, stored);
  }
  return Object.assign({}, VERLOF_OVERD_DEFAULT);
}

function initVerlofOverdragenModal() {
  const editBtn = document.querySelector(".emp-verlof-edit-btn");
  const modal = document.getElementById("emp-verlof-overd-modal");
  const closeBtn = document.getElementById("emp-verlof-overd-close");
  const cancelBtn = document.getElementById("emp-verlof-overd-cancel");
  const saveBtn = document.getElementById("emp-verlof-overd-save");
  if (!editBtn || !modal) return;

  function updateCards(st) {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v + "u"; };
    s("verlof-overd-wet", st.wetTotaal);
    s("verlof-overd-wet-gebruikt", st.wetGebruikt);
    s("verlof-overd-bovenwet", st.bovenwetTotaal);
    s("verlof-overd-bovenwet-gebruikt", st.bovenwetGebruikt);
  }

  function openModal() {
    const st = readVerlofOvergedragenForCurrent();
    document.getElementById("verlof-overd-wet-totaal").value = st.wetTotaal;
    document.getElementById("verlof-overd-wet-gebruikt-input").value = st.wetGebruikt;
    document.getElementById("verlof-overd-wet-beschikbaar").value = st.wetBeschikbaar;
    document.getElementById("verlof-overd-bovenwet-totaal").value = st.bovenwetTotaal;
    document.getElementById("verlof-overd-bovenwet-gebruikt-input").value = st.bovenwetGebruikt;
    document.getElementById("verlof-overd-bovenwet-beschikbaar").value = st.bovenwetBeschikbaar;
    // Reden is altijd leeg bij openen — het modal vraagt naar de reden
    // van DEZE wijziging, niet de geschiedenis.
    document.getElementById("verlof-overd-reden").value = "";
    modal.style.display = "";
  }

  function closeModal() { modal.style.display = "none"; }

  editBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  saveBtn.addEventListener("click", async () => {
    const empId = getCurrentEmployeeIdForVerlof();
    if (!empId) {
      reportVerlofError("geen medewerker geselecteerd", new Error("getSelectedEmployee leeg"));
      return;
    }
    if (!window.medewerkerVerlofOvergedragenDB || typeof window.medewerkerVerlofOvergedragenDB.save !== "function") {
      reportVerlofError("data-laag niet beschikbaar", new Error("medewerkerVerlofOvergedragenDB ontbreekt"));
      return;
    }
    const st = {
      wetTotaal: Number(document.getElementById("verlof-overd-wet-totaal").value) || 0,
      wetGebruikt: Number(document.getElementById("verlof-overd-wet-gebruikt-input").value) || 0,
      wetBeschikbaar: Number(document.getElementById("verlof-overd-wet-beschikbaar").value) || 0,
      bovenwetTotaal: Number(document.getElementById("verlof-overd-bovenwet-totaal").value) || 0,
      bovenwetGebruikt: Number(document.getElementById("verlof-overd-bovenwet-gebruikt-input").value) || 0,
      bovenwetBeschikbaar: Number(document.getElementById("verlof-overd-bovenwet-beschikbaar").value) || 0,
      reden: document.getElementById("verlof-overd-reden").value || "",
    };
    saveBtn.setAttribute("disabled", "");
    try {
      await window.medewerkerVerlofOvergedragenDB.save(empId, st);
      // UI ververst zichzelf via besa:medewerker-verlof-overgedragen-updated
      // event (zie listener onderaan deze functie).
      closeModal();
      if (typeof showToast === "function") showToast("Overgedragen uren opgeslagen");
    } catch (err) {
      reportVerlofError("opslaan mislukt", err);
    } finally {
      saveBtn.removeAttribute("disabled");
    }
  });

  // Live re-render bij elke wijziging in de Supabase-cache (incl. bootstrap,
  // andere tab, externe sync).
  window.addEventListener("besa:medewerker-verlof-overgedragen-updated", function () {
    try { updateCards(readVerlofOvergedragenForCurrent()); } catch (e) { /* */ }
  });

  updateCards(readVerlofOvergedragenForCurrent());
}

function initVerlofTables() {

  function closeAllVerlofPanels(except) {
    document.querySelectorAll("[data-verlof-table] .emp-verlof-col-panel").forEach((p) => {
      if (p !== except) p.setAttribute("hidden", "");
    });
    document.querySelectorAll("[data-verlof-table] .emp-verlof-filter-dropdown").forEach((d) => {
      if (d !== except) d.style.display = "none";
    });
  }

  document.querySelectorAll("[data-verlof-table]").forEach((block) => {
    const colBtn = block.querySelector(".emp-verlof-col-btn");
    const colPanel = block.querySelector(".emp-verlof-col-panel");
    const table = block.querySelector(".emp-verzuim-table");
    const thead = table ? table.querySelector("thead") : null;
    const tbody = table ? table.querySelector("tbody") : null;

    let sortCol = null;
    let sortDir = "asc";

    function getColIndex(colKey) {
      if (!thead) return -1;
      const ths = Array.from(thead.querySelectorAll("th"));
      return ths.findIndex((th) => th.dataset.col === colKey);
    }

    function applyColumnVisibility() {
      const cols = {};
      block.querySelectorAll(".column-toggle").forEach((btn) => {
        cols[btn.dataset.col] = btn.classList.contains("is-checked");
      });
      if (thead) {
        thead.querySelectorAll("th[data-col]").forEach((th) => {
          const col = th.dataset.col;
          if (col in cols) th.style.display = cols[col] ? "" : "none";
        });
      }
      if (tbody) {
        tbody.querySelectorAll("tr").forEach((tr) => {
          const tds = tr.querySelectorAll("td");
          if (!thead) return;
          const ths = thead.querySelectorAll("th");
          ths.forEach((th, i) => {
            const col = th.dataset.col;
            if (col && col in cols && tds[i]) {
              tds[i].style.display = cols[col] ? "" : "none";
            }
          });
        });
      }
    }

    function updateSortIcons() {
      if (!thead) return;
      thead.querySelectorAll("th").forEach((th) => {
        const icon = th.querySelector(".emp-sort-icon");
        if (!icon) return;
        if (th.dataset.col === sortCol) {
          icon.textContent = sortDir === "asc" ? "\u2191" : "\u2193";
          icon.style.color = "#111827";
        } else {
          icon.textContent = "\u21C5";
          icon.style.color = "#9ca3af";
        }
      });
    }

    function sortTableRows() {
      if (!tbody || !sortCol) return;
      const rows = Array.from(tbody.querySelectorAll("tr"));
      if (rows.length === 0) return;
      const idx = getColIndex(sortCol);
      if (idx < 0) return;
      rows.sort((a, b) => {
        const aText = (a.querySelectorAll("td")[idx]?.textContent || "").trim().toLowerCase();
        const bText = (b.querySelectorAll("td")[idx]?.textContent || "").trim().toLowerCase();
        const aNum = parseFloat(aText);
        const bNum = parseFloat(bText);
        let cmp;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = aText.localeCompare(bText);
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
      rows.forEach((r) => tbody.appendChild(r));
    }

    if (thead) {
      thead.querySelectorAll("th[data-col]").forEach((th) => {
        const icon = th.querySelector(".emp-sort-icon");
        if (!icon) return;
        th.style.cursor = "pointer";
        th.addEventListener("click", () => {
          const col = th.dataset.col;
          if (sortCol === col) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortCol = col;
            sortDir = "asc";
          }
          updateSortIcons();
          sortTableRows();
        });
      });
    }

    if (colBtn && colPanel) {
      colBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = colPanel.hasAttribute("hidden");
        closeAllVerlofPanels(colPanel);
        if (isHidden) {
          colPanel.removeAttribute("hidden");
        } else {
          colPanel.setAttribute("hidden", "");
        }
      });

      colPanel.addEventListener("click", (e) => e.stopPropagation());

      colPanel.querySelectorAll(".column-toggle").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          btn.classList.toggle("is-checked");
          const visible = btn.classList.contains("is-checked");
          btn.setAttribute("aria-checked", visible);
          applyColumnVisibility();
        });
      });
    }

    block.querySelectorAll(".emp-verlof-filter-dd-wrap").forEach((wrap) => {
      const btn = wrap.querySelector(".emp-verlof-filter-btn");
      const dd = wrap.querySelector(".emp-verlof-filter-dropdown");
      if (!btn || !dd) return;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllVerlofPanels(dd);
        dd.style.display = dd.style.display !== "none" ? "none" : "";
      });

      dd.addEventListener("click", (e) => e.stopPropagation());
    });
  });

  document.addEventListener("click", () => {
    closeAllVerlofPanels(null);
  });
}

// Notities worden in Supabase opgeslagen via window.medewerkerNotitiesDB
// (zie medewerker-notities-data.js). De legacy localStorage employeeEditsById
// per-medewerker `.notities` array wordt automatisch eenmalig gemigreerd
// bij eerste boot. window.__empNotities bestaat niet meer als state-store —
// de data komt direct uit getForMedewerkerSync.

function reportNotitieError(label, err) {
  try { console.error("[medewerker notities]", label, err); } catch (e) { /* */ }
  var msg = "Notitie opslaan mislukt. Controleer je verbinding en probeer opnieuw.";
  if (err && err.message) msg = "Notitie opslaan mislukt: " + err.message;
  if (typeof showSaveModal === "function") showSaveModal(msg, "Fout");
  else if (typeof showToast === "function") showToast(msg);
}

function getCurrentEmployeeIdForNotes() {
  const emp = getSelectedEmployee();
  if (!emp) return "";
  return String(emp.empId || emp.id || emp.naam || "");
}

// Format dd-mm-yyyy hh:mm voor consistente UI-weergave (zelfde als legacy).
function formatNoteDate(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) { return ""; }
}

function initNotitiesSection() {
  const body = document.getElementById("emp-notitie-body");
  const sendBtn = document.getElementById("emp-notitie-send-btn");
  const emptyEl = document.getElementById("emp-notitie-empty");
  const itemsEl = document.getElementById("emp-notitie-items");
  if (!body || !sendBtn || !itemsEl) return;

  document.querySelectorAll(".emp-notitie-toolbar button").forEach((btn) => {
    btn.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      if (cmd === "insertImage") {
        // Bewaar de selectie in het editor-veld vóór de modal opent.
        let savedRange = null;
        try {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
        } catch (err) { /* */ }
        const url = await window.showPromptModal({
          title: "Afbeelding invoegen",
          label: "Afbeelding URL",
          placeholder: "https://",
          inputType: "url",
          okLabel: "Invoegen",
        });
        if (!url) return;
        try {
          if (savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        } catch (err) { /* */ }
        document.execCommand("insertImage", false, String(url).trim());
      } else if (cmd === "formatBlock") {
        document.execCommand(cmd, false, btn.dataset.val || "P");
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

  function getNotesForCurrentEmployee() {
    const empId = getCurrentEmployeeIdForNotes();
    if (!empId) return [];
    if (window.medewerkerNotitiesDB && typeof window.medewerkerNotitiesDB.getForMedewerkerSync === "function") {
      return window.medewerkerNotitiesDB.getForMedewerkerSync(empId);
    }
    return [];
  }

  function renderNotes() {
    const notes = getNotesForCurrentEmployee();
    if (!notes.length) {
      if (emptyEl) emptyEl.style.display = "";
      itemsEl.innerHTML = "";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    itemsEl.innerHTML = "";
    notes.forEach((note) => {
      const item = document.createElement("div");
      item.className = "emp-notitie-item";

      const head = document.createElement("div");
      head.className = "emp-notitie-item-head";

      const dateSpan = document.createElement("span");
      dateSpan.className = "emp-notitie-item-date";
      dateSpan.textContent = formatNoteDate(note.createdAt);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "emp-notitie-item-delete";
      delBtn.textContent = "Verwijderen";
      delBtn.dataset.noteId = note.id;
      delBtn.addEventListener("click", async () => {
        if (!window.medewerkerNotitiesDB || typeof window.medewerkerNotitiesDB.remove !== "function") {
          reportNotitieError("data-laag niet beschikbaar", new Error("medewerkerNotitiesDB ontbreekt"));
          return;
        }
        delBtn.setAttribute("disabled", "");
        try {
          await window.medewerkerNotitiesDB.remove(note.id);
          // UI ververst zichzelf via besa:medewerker-notities-updated event.
        } catch (err) {
          reportNotitieError("verwijderen mislukt", err);
        } finally {
          delBtn.removeAttribute("disabled");
        }
      });

      head.append(dateSpan, delBtn);

      const content = document.createElement("div");
      content.className = "emp-notitie-item-content";
      content.innerHTML = note.bodyHtml || "";

      item.append(head, content);
      itemsEl.appendChild(item);
    });
  }

  sendBtn.addEventListener("click", async () => {
    const html = body.innerHTML.trim();
    if (!html || html === "<br>") return;
    if (!window.medewerkerNotitiesDB || typeof window.medewerkerNotitiesDB.add !== "function") {
      reportNotitieError("data-laag niet beschikbaar", new Error("medewerkerNotitiesDB ontbreekt"));
      return;
    }
    const empId = getCurrentEmployeeIdForNotes();
    if (!empId) {
      reportNotitieError("geen medewerker geselecteerd", new Error("getSelectedEmployee leeg"));
      return;
    }
    sendBtn.setAttribute("disabled", "");
    try {
      await window.medewerkerNotitiesDB.add({
        medewerkerId: empId,
        bodyHtml: html,
        createdAt: new Date().toISOString(),
      });
      body.innerHTML = "";
      // UI ververst zichzelf via besa:medewerker-notities-updated event.
    } catch (err) {
      reportNotitieError("toevoegen mislukt", err);
    } finally {
      sendBtn.removeAttribute("disabled");
    }
  });

  // Live re-render bij elke wijziging in de Supabase-cache (incl. bootstrap,
  // andere tab, externe sync).
  window.addEventListener("besa:medewerker-notities-updated", function () {
    try { renderNotes(); } catch (e) { /* */ }
  });

  renderNotes();
}

function initOpleidingSection() {
  function toIsoDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return ddmmyyyyToISO(raw);
  }

  function initList(listKey) {
    const body = document.querySelector('[data-opleiding-body="' + listKey + '"]');
    const addBtn = document.querySelector('[data-opleiding-list="' + listKey + '"]');
    if (!body || !addBtn) return;

    function render() {
      const state = getOpleidingState(listKey);
      body.innerHTML = "";
      if (!state.items.length) {
        const empty = document.createElement("p");
        empty.className = "emp-opleiding-empty";
        empty.textContent = "Er zijn nog geen opleidingen toegevoegd.";
        body.appendChild(empty);
        return;
      }
      state.items.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "emp-opleiding-edit-row";

        const nameSelect = document.createElement("select");
        nameSelect.className = "emp-select";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Selecteer Opleidingen";
        nameSelect.appendChild(placeholder);
        getDynamicOpleidingOptions().forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          nameSelect.appendChild(option);
        });
        nameSelect.value = item.naam || "";
        nameSelect.addEventListener("change", () => {
          const s = getOpleidingState(listKey);
          if (!s.items[idx]) return;
          s.items[idx].naam = nameSelect.value || "";
        });

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = toIsoDate(item.datum);
        dateInput.addEventListener("change", () => {
          const s = getOpleidingState(listKey);
          if (!s.items[idx]) return;
          s.items[idx].datum = dateInput.value || "";
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "emp-opleiding-remove-btn";
        removeBtn.setAttribute("aria-label", "Verwijder opleiding");
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/></svg>';
        removeBtn.addEventListener("click", () => {
          const s = getOpleidingState(listKey);
          s.items.splice(idx, 1);
          render();
        });

        row.append(nameSelect, dateInput, removeBtn);
        body.appendChild(row);
      });
    }

    addBtn.addEventListener("click", () => {
      const state = getOpleidingState(listKey);
      state.items.push({ naam: "", datum: "" });
      render();
    });

    window["__renderEmpOpleidingen_" + listKey] = render;
    render();
  }

  initList("skj");
  initList("training");
}

// Notities zijn sinds Stage 4a verhuisd naar medewerkerNotitiesDB (eigen tabel).
// Deze stub houdt legacy-aanroepen vanuit gatherFormData()/initSectionSave levend
// (anders crasht elke "Wijzigingen opslaan"-knop op de pagina met ReferenceError).
function getNotitiesState() {
  try {
    const emp = (typeof getSelectedEmployee === "function") ? getSelectedEmployee() : null;
    const empId = emp && (emp.empId || emp.id);
    if (!empId || !window.medewerkerNotitiesDB || typeof window.medewerkerNotitiesDB.getForMedewerkerSync !== "function") return [];
    const rows = window.medewerkerNotitiesDB.getForMedewerkerSync(empId) || [];
    return rows.map((r) => ({ html: r.bodyHtml || r.html || "", date: r.date || "" }));
  } catch (e) {
    return [];
  }
}

function gatherFormData() {
  const val = (id) => document.getElementById(id)?.value || "";
  const bool = (id) => Boolean(document.getElementById(id)?.checked);
  const urenFieldIds = getActiveUrenFieldIds();
  const profFieldValues = getActiveProfFieldValues();
  const rooster = Object.fromEntries(
    ROOSTER_DAYS.map((day) => [
      day,
      {
        enabled: Boolean(document.getElementById(`emp-rooster-${day}-enabled`)?.checked),
        start: document.getElementById(`emp-rooster-${day}-start`)?.value || "09:00",
        end: document.getElementById(`emp-rooster-${day}-end`)?.value || "17:00",
      },
    ])
  );
  const roosterWeekend =
    typeof window.__getRoosterWeekendModes === "function"
      ? window.__getRoosterWeekendModes()
      : { za: "alle", zo: "alle" };
  const periodiekeMaand = getActivePeriodiekeMaandValue();
  const beoordelingsdatum = getActiveBeoordelingsdatumValue();
  const voorzieningenFieldIds = getActiveVoorzieningenFieldIds();
  const collectOplItems = (key) => (getOpleidingState(key).items || [])
    .map((x) => ({ naam: String(x?.naam || "").trim(), datum: String(x?.datum || "").trim() }))
    .filter((x) => x.naam);
  const opleidingItemsSkj = collectOplItems("skj");
  const opleidingItemsTraining = collectOplItems("training");
  const opleidingItems = [...opleidingItemsSkj, ...opleidingItemsTraining];
  const opleiding = opleidingItems.length ? opleidingItems[0].naam : "";
  const selText = (id) => {
    const el = document.getElementById(id);
    if (el && el.tagName === "SELECT") return el.options[el.selectedIndex]?.value || "";
    return el?.value || "";
  };

  const gebISO = val("emp-geboortedatum");
  let gebDDMMYYYY = "";
  if (gebISO) {
    const [y, m, d] = gebISO.split("-");
    gebDDMMYYYY = `${d}-${m}-${y}`;
  }

  const locState = getLocatiesState();
  const selectedLocaties = normalizeLocatieNames(locState.selected || []);
  const locatiesCoreMap = Object.assign({}, locState.coreMap || {});

  return {
    voornaam: val("emp-voornaam"),
    achternaam: val("emp-achternaam"),
    email: val("emp-email"),
    tel: val("emp-tel"),
    roepnaam: val("emp-roepnaam"),
    initialen: val("emp-initialen"),
    bsn: val("emp-bsn"),
    verjaardag: gebDDMMYYYY,
    taal: (() => {
      // Save als code ("NL"/"ENG"/"FR"/"DE"), niet als label
      const span = document.getElementById("emp-taal-value");
      if (!span) return "NL";
      const code = span.dataset && span.dataset.code;
      if (code) return code;
      // Fallback: probeer label → code conversie
      return taalLabelToCode(span.textContent.trim()) || "NL";
    })(),
    cao: document.getElementById("emp-cao-value")?.textContent?.trim() || "CAO Jeugdzorg",
    postcode: val("emp-postcode"),
    huisnummer: val("emp-huisnummer"),
    toevoeging: val("emp-toevoeging"),
    straat: val("emp-straat"),
    plaats: val("emp-plaats"),
    contactNaam: val("emp-contact-naam"),
    contactTel: val("emp-contact-tel"),
    dienstverband: selText("emp-dienstverband"),
    inhuurtype: selText("emp-inhuurtype"),
    functie: profFieldValues.functie,
    startdatum: profFieldValues.startdatum,
    opleiding,
    opleidingItems,
    opleidingItemsSkj,
    opleidingItemsTraining,
    skjRegistratie: bool("emp-skj-registratie"),
    trainingBhv: bool("emp-training-bhv"),
    trainingGvVg: bool("emp-training-gvvg"),
    trainingMedicatie: bool("emp-training-medicatie"),
    competentie: profFieldValues.competentie,
    fase: val("emp-status-input") || "In dienst",
    uitDienst: isoToDDMMYYYY(val("emp-uitdienst-input")),
    personeelsnummer: (function () {
      var v = val("emp-nr");
      if (v == null || String(v).trim() === "") return null;
      var n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    })(),
    // Auto-archive: medewerker met fase "Uit dienst" verhuist naar gearchiveerd,
    // bij "In dienst" terug naar actieve lijst. User-eis 2026-05-26.
    archived: (val("emp-status-input") || "In dienst").trim().toLowerCase().replace(/[_-]/g, " ") === "uit dienst",
    userSetting: val("emp-user-setting") || "Standaard",
    notities: getNotitiesState().map((n) => ({ html: n.html, date: n.date })),
    inhuurKvk: val("emp-inhuur-kvk"),
    inhuurBtw: val("emp-inhuur-btw"),
    inhuurBedrijfsnaam: val("emp-inhuur-bedrijfsnaam"),
    inhuurVerzekering: val("emp-inhuur-verzekering"),
    inhuurPostcode: val("emp-inhuur-postcode"),
    inhuurHuisnummer: val("emp-inhuur-huisnummer"),
    inhuurToevoeging: val("emp-inhuur-toevoeging"),
    inhuurStraat: val("emp-inhuur-straat"),
    inhuurStad: val("emp-inhuur-stad"),
    profEmail: profFieldValues.profEmail,
    profTel: profFieldValues.profTel,
    profIban: profFieldValues.profIban,
    salarisschaal: val("emp-loondienst-salarisschaal"),
    salaristrede: val("emp-loondienst-salaristrede"),
    contracturen: val("emp-loondienst-contracturen"),
    salaris36uur: val("emp-loondienst-36uur-salaris") || "€ 0,00",
    salaris: val("emp-loondienst-salaris") || "€ 0,00",
    rooster,
    roosterWeekend,
    periodiekeMaand,
    uurAlgemeen: val("emp-uur-algemeen"),
    uurDiensttype: "Boventallig",
    uurTarief: val("emp-uur-tarief"),
    locatiesSelected: selectedLocaties,
    locatiesTags: selectedLocaties.join(", "),
    locatiesCoreMap,
    urenVerleentzorg: bool(urenFieldIds.verleentzorg),
    urenHandmatigRegistreren: bool(urenFieldIds.handmatig),
    beoordelingsdatum,
    voorzLaptop: bool(voorzieningenFieldIds.laptop),
    voorzSleutels: bool(voorzieningenFieldIds.sleutels),
    voorzTelefoon: bool(voorzieningenFieldIds.telefoon),
    voorzSimkaart: bool(voorzieningenFieldIds.simkaart),
    voorzAuto: bool(voorzieningenFieldIds.auto),
    voorzFiets: bool(voorzieningenFieldIds.fiets),
    voorzLaptopNote: val(voorzieningenFieldIds.laptopNote),
    voorzSleutelsNote: val(voorzieningenFieldIds.sleutelsNote),
    voorzTelefoonNote: val(voorzieningenFieldIds.telefoonNote),
    voorzSimkaartNote: val(voorzieningenFieldIds.simkaartNote),
    voorzAutoNote: val(voorzieningenFieldIds.autoNote),
    voorzFietsNote: val(voorzieningenFieldIds.fietsNote),
  };
}

function saveToSession() {
  const existing = getSelectedEmployee() || {};
  const origin = existing.__origin || {
    voornaam: (existing.voornaam || "").trim(),
    achternaam: (existing.achternaam || "").trim(),
    email: (existing.email || "").trim(),
  };
  const updated = Object.assign({}, existing, gatherFormData(), { __origin: origin });
  window.sessionStorage.setItem("selectedEmployee", JSON.stringify(updated));
  const editsById = readEmployeeEdits();
  const fallbackKey = `legacy:${origin.voornaam}|${origin.achternaam}|${origin.email}`;
  const key = updated.empId || fallbackKey;
  editsById[key] = Object.assign({}, updated, {
    __match: origin,
  });
  writeEmployeeEdits(editsById);
  upsertEmployeeItem(updated);
}

function showToast(message) {
  const msgStr = String(message);
  if (typeof showSaveModal === "function" && /opgeslagen/i.test(msgStr) && !/niet opgeslagen|mislukt|fout|Controleer/i.test(msgStr)) {
    showSaveModal(msgStr);
    return;
  }
  let toast = document.getElementById("app-toast");
  let backdrop = document.getElementById("app-toast-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "app-toast-backdrop";
    backdrop.className = "app-toast-backdrop";
    document.body.appendChild(backdrop);
  }
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast app-toast--centered";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  backdrop.classList.remove("is-visible");
  toast.classList.remove("is-visible");
  void backdrop.offsetWidth;
  void toast.offsetWidth;
  backdrop.classList.add("is-visible");
  toast.classList.add("is-visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast?.classList.remove("is-visible");
    backdrop?.classList.remove("is-visible");
  }, 2200);
}

function initSectionSave() {
  const sectionLabels = {
    gegevens: "Medewerker gegevens",
    adres: "Adres",
    contact: "Contactpersoon",
    "overige-info": "Overige informatie",
    dienstverband: "Dienstverband",
    inhuur: "Inhuur",
    professioneel: "Professioneel",
    "professioneel-uurtarieven": "Uurtarieven",
    "professioneel-locaties": "Locaties",
    "professioneel-uren": "Urenregistratie",
    "professioneel-gegevens": "Professionele gegevens",
    "professioneel-salaris": "Salaris",
    "professioneel-rooster": "Rooster",
    "professioneel-competenties": "Competenties",
    "professioneel-periodieke-maand": "Periodieke maand",
    "professioneel-beoordelingsdatum": "Beoordelingsdatum",
    "professioneel-bedrijfsvoorzieningen": "Bedrijfsvoorzieningen",
    opleiding: "Opleiding",
    notities: "Notities",
  };

  function clearInvalid(ids) {
    ids.forEach((id) => document.getElementById(id)?.removeAttribute("aria-invalid"));
  }

  function markInvalid(id) {
    const el = document.getElementById(id);
    if (el) el.setAttribute("aria-invalid", "true");
    return el;
  }

  function syncContactWarning() {
    const warning = document.getElementById("emp-contact-warning");
    if (!warning) return true;
    const hasName = Boolean((document.getElementById("emp-contact-naam")?.value || "").trim());
    const hasTel = Boolean((document.getElementById("emp-contact-tel")?.value || "").trim());
    const ok = hasName || hasTel;
    warning.hidden = ok;
    return ok;
  }

  function validateSection(section) {
    if (section === "gegevens") {
      clearInvalid(["emp-voornaam", "emp-achternaam", "emp-email"]);
      const voornaam = (document.getElementById("emp-voornaam")?.value || "").trim();
      const achternaam = (document.getElementById("emp-achternaam")?.value || "").trim();
      const email = (document.getElementById("emp-email")?.value || "").trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!voornaam) return markInvalid("emp-voornaam")?.focus(), false;
      if (!achternaam) return markInvalid("emp-achternaam")?.focus(), false;
      if (!emailOk) return markInvalid("emp-email")?.focus(), false;
      return true;
    }

    if (section === "contact") {
      clearInvalid(["emp-contact-naam", "emp-contact-tel"]);
      const ok = syncContactWarning();
      if (!ok) {
        markInvalid("emp-contact-naam");
        markInvalid("emp-contact-tel");
        document.getElementById("emp-contact-naam")?.focus();
        return false;
      }
      return true;
    }

    if (section === "opleiding") {
      document.querySelectorAll(".emp-opleiding-date-warning").forEach((w) => w.remove());
      document.querySelectorAll('.emp-opleiding-edit-row input[type="date"]').forEach((d) => d.removeAttribute("aria-invalid"));
      let valid = true;
      document.querySelectorAll(".emp-opleiding-edit-row").forEach((row) => {
        const naam = (row.querySelector("select")?.value || "").trim();
        const datum = (row.querySelector('input[type="date"]')?.value || "").trim();
        if (naam && !datum) {
          valid = false;
          const dateEl = row.querySelector('input[type="date"]');
          if (dateEl) dateEl.setAttribute("aria-invalid", "true");
          const warn = document.createElement("p");
          warn.className = "emp-opleiding-date-warning";
          warn.textContent = "Vul een datum in voor deze opleiding. Elke opleiding moet een datum bevatten.";
          row.insertAdjacentElement("afterend", warn);
        }
      });
      if (!valid) return false;
      return true;
    }

    if (section === "professioneel-salaris") {
      const syncWarning = window.__syncLoondienstContracturenWarning;
      if (typeof syncWarning === "function") {
        const ok = syncWarning();
        if (!ok) {
          document.getElementById("emp-loondienst-contracturen")?.focus();
          return false;
        }
      }
      return true;
    }

    return true;
  }

  ["emp-contact-naam", "emp-contact-tel"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      syncContactWarning();
      if ((document.getElementById(id)?.value || "").trim()) {
        document.getElementById("emp-contact-naam")?.removeAttribute("aria-invalid");
        document.getElementById("emp-contact-tel")?.removeAttribute("aria-invalid");
      }
    });
  });

  syncContactWarning();

  document.querySelectorAll(".emp-save-section").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section || "";
      if (!validateSection(section)) {
        showToast("Controleer de verplichte velden");
        return;
      }

      saveToSession();

      if (section === "dienstverband") {
        const dvEl = document.getElementById("emp-dienstverband");
        if (dvEl) {
          dvEl.dataset.persistedValue = dvEl.value || "Loondienst";
        }
        const inhuurEl = document.getElementById("emp-inhuurtype");
        if (inhuurEl) {
          inhuurEl.dataset.persistedValue = inhuurEl.value || "";
        }
        if (typeof window.__syncProfessioneelVariant === "function") {
          window.__syncProfessioneelVariant();
        }
      }

      const fullName = `${document.getElementById("emp-voornaam")?.value || ""} ${document.getElementById("emp-achternaam")?.value || ""}`.trim();
      const nameEl = document.getElementById("emp-fullname");
      if (nameEl && fullName) nameEl.textContent = fullName;
      if (fullName) document.title = `${fullName} — HR`;
      updateLoginAsButton(fullName);
      const emailDisplay = document.getElementById("emp-email-display");
      if (emailDisplay) emailDisplay.textContent = document.getElementById("emp-email")?.value || "—";
      const emailDisplay2 = document.getElementById("emp-email-display2");
      if (emailDisplay2) emailDisplay2.textContent = document.getElementById("emp-email")?.value || "—";
      const telDisplay = document.getElementById("emp-tel-display");
      if (telDisplay) telDisplay.textContent = document.getElementById("emp-tel")?.value || "—";
      const bdayIso = document.getElementById("emp-geboortedatum")?.value || "";
      const bdayDisplay = document.getElementById("emp-bday-date");
      if (bdayDisplay) {
        if (bdayIso) {
          const [y, m, d] = bdayIso.split("-");
          bdayDisplay.textContent = `${d}-${m}-${y}`;
        } else {
          bdayDisplay.textContent = "—";
        }
      }
      const bdayCountdown = document.getElementById("emp-bday-countdown");
      if (bdayCountdown) {
        const cd = birthdayCountdown(bdayDisplay?.textContent || "");
        if (cd) {
          bdayCountdown.innerHTML =
            `<span class="emp-bday-unit"><strong>${cd.months}</strong> Maanden</span>` +
            `<span class="emp-bday-unit"><strong>${cd.days}</strong> Dagen</span>` +
            `<span class="emp-bday-unit"><strong>${cd.hours}</strong> Uren</span>`;
        } else {
          bdayCountdown.innerHTML = "";
        }
      }
      const addressLine1 = document.getElementById("emp-address-line1");
      if (addressLine1) {
        const straat = (document.getElementById("emp-straat")?.value || "").trim();
        const huisnummer = (document.getElementById("emp-huisnummer")?.value || "").trim();
        const toevoeging = (document.getElementById("emp-toevoeging")?.value || "").trim();
        addressLine1.textContent = [straat, huisnummer, toevoeging].filter(Boolean).join(" ") || "—";
      }
      const addressLine2 = document.getElementById("emp-address-line2");
      if (addressLine2) {
        const postcode = (document.getElementById("emp-postcode")?.value || "").trim();
        const plaats = (document.getElementById("emp-plaats")?.value || "").trim();
        addressLine2.textContent = [postcode, plaats].filter(Boolean).join(" ") || "—";
      }
      const notePreview = document.getElementById("emp-note-preview");
      if (notePreview) {
        const notes = getNotitiesState();
        notePreview.textContent = notes.length ? notes.length + " notitie(s)" : "Er zijn geen notities.";
      }
      const statusInput = document.getElementById("emp-status-input");
      if (statusInput) statusInput.setAttribute("title", statusInput.value || "In dienst");

      const label = sectionLabels[section] || "Gegevens";
      showToast(`${label} opgeslagen`);
    });
  });
}

// Zet de juiste kleurmodifier-class op de Status-dropdown in de zijbalk.
// Groen voor 'In dienst', rood voor 'Uit dienst' — consistent met de pill in de HR-lijst.
function updateStatusInputColor() {
  const el = document.getElementById("emp-status-input");
  if (!el) return;
  el.classList.remove("emp-select--status-in-dienst", "emp-select--status-uit-dienst");
  const normalized = (el.value || "").trim().toLowerCase().replace(/[_-]/g, " ");
  el.classList.add(normalized === "uit dienst" ? "emp-select--status-uit-dienst" : "emp-select--status-in-dienst");
}

function initExtraSidebarActions() {
  const loginAsBtn = document.getElementById("emp-loginas-btn");
  loginAsBtn?.addEventListener("click", () => {
    showToast("Ingelogd als medewerker");
  });

  ["emp-user-setting"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      saveToSession();
      showToast("Zijbalkgegevens opgeslagen");
    });
  });

  // Update kleur live wanneer gebruiker een andere status kiest (vóór klik op opslaan).
  document.getElementById("emp-status-input")?.addEventListener("change", updateStatusInputColor);
}

function initLiveContactMirror() {
  const telInput = document.getElementById("emp-tel");
  const emailInput = document.getElementById("emp-email");
  const telDisplay = document.getElementById("emp-tel-display");
  const emailDisplay = document.getElementById("emp-email-display");
  const emailDisplay2 = document.getElementById("emp-email-display2");

  function syncNow() {
    const tel = (telInput?.value || "").trim();
    const email = (emailInput?.value || "").trim();
    if (telDisplay) telDisplay.textContent = tel || "—";
    if (emailDisplay) emailDisplay.textContent = email || "—";
    if (emailDisplay2) emailDisplay2.textContent = email || "—";
  }

  telInput?.addEventListener("input", syncNow);
  emailInput?.addEventListener("input", syncNow);
  syncNow();
}

function initBedrijfsvoorzieningenNotes() {
  const items = Array.from(document.querySelectorAll(".emp-bedrijf-item"));
  if (!items.length) return;

  function hideNote(noteWrap) {
    noteWrap.setAttribute("hidden", "");
  }

  function closeAllExcept(activeItem) {
    items.forEach((item) => {
      if (item === activeItem) return;
      const noteWrap = item.querySelector(".emp-bedrijf-note");
      if (noteWrap) hideNote(noteWrap);
    });
  }

  items.forEach((item) => {
    const noteBtn = item.querySelector(".emp-bedrijf-note-btn");
    const noteWrap = item.querySelector(".emp-bedrijf-note");
    const noteInput = item.querySelector(".emp-bedrijf-note-input");
    const noteSave = item.querySelector(".emp-bedrijf-note-save");
    const noteCancel = item.querySelector(".emp-bedrijf-note-cancel");
    if (!noteBtn || !noteWrap || !noteInput || !noteSave || !noteCancel) return;

    let savedValue = (noteInput.value || "").trim();
    noteBtn.classList.toggle("has-note", Boolean(savedValue));

    function openNote() {
      closeAllExcept(item);
      noteWrap.removeAttribute("hidden");
      noteInput.focus();
      noteInput.setSelectionRange(noteInput.value.length, noteInput.value.length);
    }

    function saveNoteAndClose() {
      savedValue = (noteInput.value || "").trim();
      noteInput.value = savedValue;
      noteBtn.classList.toggle("has-note", Boolean(savedValue));
      hideNote(noteWrap);
    }

    function cancelNoteAndClose() {
      noteInput.value = savedValue;
      hideNote(noteWrap);
    }

    noteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = noteWrap.hasAttribute("hidden");
      if (isHidden) {
        openNote();
      } else {
        saveNoteAndClose();
      }
    });

    noteSave.addEventListener("click", (e) => {
      e.stopPropagation();
      saveNoteAndClose();
    });

    noteCancel.addEventListener("click", (e) => {
      e.stopPropagation();
      cancelNoteAndClose();
    });

    noteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveNoteAndClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelNoteAndClose();
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(".emp-bedrijf-item")) return;
    items.forEach((item) => {
      const noteWrap = item.querySelector(".emp-bedrijf-note");
      const noteInput = item.querySelector(".emp-bedrijf-note-input");
      const noteBtn = item.querySelector(".emp-bedrijf-note-btn");
      if (!noteWrap || !noteInput || !noteBtn || noteWrap.hasAttribute("hidden")) return;
      const savedValue = (noteInput.value || "").trim();
      noteInput.value = savedValue;
      noteBtn.classList.toggle("has-note", Boolean(savedValue));
      hideNote(noteWrap);
    });
  });
}

/* ── Documenten Section ─────────────── */

// medewerker_documenten is gekoppeld op de ECHTE medewerkers.id (uuid).
// De HR-UI selecteert echter met een legacy "emp-bulk-XXXX" id, dus
// listSync(legacyId) gaf 0 → Documenten-tab leeg bij iedereen. Resolve de
// uuid één keer via Supabase (match op e-mail; voornaam+achternaam als
// tiebreaker bij dubbele e-mail) en cache 'm op window.
function resolveDocsEmployeeUuid(emp) {
  try {
    emp = emp || getSelectedEmployee();
    var legacyKey = (emp && (emp.empId || emp.id || emp.naam)) || null;
    if (!legacyKey) return Promise.resolve(null);
    var cached = window.__besaDocsEmpUuid;
    if (cached && cached.key === legacyKey && cached.uuid) return Promise.resolve(cached.uuid);
    var email = String((emp && emp.email) || "").trim();
    if (!window.besaSupabase || !email) return Promise.resolve(null);
    var vn = String((emp && emp.voornaam) || "").trim().toLowerCase();
    var an = String((emp && emp.achternaam) || "").trim().toLowerCase();
    return window.besaSupabase
      .from("medewerkers").select("id,voornaam,achternaam,email").ilike("email", email)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        var rows = res.data, pick = rows[0];
        if (rows.length > 1 && (vn || an)) {
          var m = rows.find(function (r) {
            return String(r.voornaam || "").trim().toLowerCase() === vn
              && String(r.achternaam || "").trim().toLowerCase() === an;
          });
          if (m) pick = m;
        }
        if (pick && pick.id) {
          window.__besaDocsEmpUuid = { key: legacyKey, uuid: String(pick.id) };
          return String(pick.id);
        }
        return null;
      })
      .catch(function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}

function getCurrentEmployeeIdForDocs() {
  var emp = getSelectedEmployee();
  if (!emp) return null;
  var legacyKey = emp.empId || emp.id || emp.naam || null;
  var cached = window.__besaDocsEmpUuid;
  if (cached && cached.key === legacyKey && cached.uuid) return cached.uuid;
  return legacyKey;
}

function reportDocumentError(err, prefix) {
  var msg = (err && err.message) ? err.message : String(err);
  var titel = prefix ? prefix + " mislukt" : "Opslaan mislukt";
  if (typeof window.showActionFeedback === "function") {
    window.showActionFeedback("error", titel, msg);
  } else if (typeof window.showError === "function") {
    window.showError(msg, titel);
  } else if (typeof window.showSaveModal === "function") {
    window.showSaveModal(msg, titel);
  } else {
    // Geen helpers geladen — log naar console; geen alert (huisstijl).
    console.error("[medewerker-documenten] " + titel + ": " + msg);
  }
  console.error("[medewerker-documenten] " + (prefix || ""), err);
}

function initDocumentenSection() {
  if (!window.medewerkerDocsDB) {
    console.warn("medewerker-documenten: medewerkerDocsDB niet beschikbaar — laden de UI niet.");
    return;
  }

  var emp = getSelectedEmployee();
  var empId = getCurrentEmployeeIdForDocs();
  if (!empId) {
    console.warn("medewerker-documenten: geen geselecteerde medewerker.");
    return;
  }

  // Eenmalige migratie van legacy emp.documenten / employeeEditsById[id].documenten
  // naar Supabase + Storage. Daarna verse data ophalen.
  Promise.resolve()
    .then(function () { return resolveDocsEmployeeUuid(emp); })
    .then(function () { return window.medewerkerDocsDB.maybeMigrateFromEmployee(emp); })
    .then(function (migrated) {
      if (migrated > 0) {
        console.info("[medewerker-documenten] " + migrated + " legacy document(en) gemigreerd voor " + empId);
        // Wis de oude lokale kopie zodat hij niet bij volgende sessie weer
        // probeert te migreren.
        if (emp && Array.isArray(emp.documenten) && emp.documenten.length) {
          emp.documenten = [];
          try {
            var allEdits = JSON.parse(localStorage.getItem("employeeEditsById") || "{}");
            if (allEdits[empId] && Array.isArray(allEdits[empId].documenten)) {
              allEdits[empId].documenten = [];
              localStorage.setItem("employeeEditsById", JSON.stringify(allEdits));
            }
          } catch (e) {
            console.warn("[medewerker-documenten] cleanup van legacy documenten mislukt:", e);
          }
        }
      }
      return window.medewerkerDocsDB.list(getCurrentEmployeeIdForDocs());
    })
    .then(function () { try { render(); } catch (e) { /* */ } })
    .catch(function (err) {
      console.error("[medewerker-documenten] initiële sync mislukt:", err);
    });

  function getDocumentenState() {
    var id = getCurrentEmployeeIdForDocs();
    if (!id || !window.medewerkerDocsDB) return [];
    return window.medewerkerDocsDB.listSync(id);
  }

  var pillsContainer = document.getElementById("emp-doc-pills");
  var tbody = document.getElementById("emp-doc-tbody");
  var emptyEl = document.querySelector(".emp-doc-empty");
  var searchInput = document.querySelector(".emp-doc-search");
  var archivedToggle = document.getElementById("emp-doc-archived-toggle");
  var resetBtn = document.getElementById("emp-doc-reset-btn");
  var selectAllCb = document.getElementById("emp-doc-select-all");
  var colBtn = document.querySelector(".emp-doc-col-btn");
  var colDropdown = document.querySelector(".emp-doc-col-dropdown");
  var uploadBtn = document.getElementById("emp-doc-upload-btn");
  var pageInfoEl = document.querySelector(".emp-doc-page-info");
  var pageLabelEl = document.querySelector(".emp-doc-page-label");
  var pageSizeSelect = document.getElementById("emp-doc-page-size");

  var modal = document.getElementById("emp-doc-modal");
  var modalClose = document.getElementById("emp-doc-modal-close");
  var modalCancel = document.getElementById("emp-doc-modal-cancel");
  var modalSave = document.getElementById("emp-doc-modal-save");
  var modalTitle = document.getElementById("emp-doc-modal-title");
  var modalNaam = document.getElementById("emp-doc-modal-naam");
  var modalType = document.getElementById("emp-doc-modal-type");
  var modalVerval = document.getElementById("emp-doc-modal-verval");
  var modalFile = document.getElementById("emp-doc-modal-file");

  if (!tbody) return;

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;
  var activePillType = null;
  var editingDocId = null;

  function getPageSize() {
    return parseInt(pageSizeSelect?.value || "50", 10);
  }

  function getVisibleCols() {
    var cols = {};
    document.querySelectorAll(".emp-doc-col-dropdown input[data-doccol]").forEach(function (cb) {
      cols[cb.dataset.doccol] = cb.checked;
    });
    return cols;
  }

  function applyColumnVisibility() {
    var cols = getVisibleCols();
    document.querySelectorAll("[data-doccol]").forEach(function (el) {
      if (el.closest(".emp-doc-col-dropdown")) return;
      var col = el.dataset.doccol;
      if (col && col in cols) el.style.display = cols[col] ? "" : "none";
    });
  }

  function formatDateTime(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    var hh = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return dd + "-" + mm + "-" + yyyy + " " + hh + ":" + min;
  }

  function formatDate(iso) {
    if (!iso) return "-";
    var parts = iso.split("T")[0].split("-");
    if (parts.length !== 3) return iso;
    return parts[2] + "-" + parts[1] + "-" + parts[0];
  }

  function buildPills() {
    var docs = getDocumentenState();
    var counts = {};
    docs.forEach(function (d) {
      if (d.archived) return;
      var t = d.type || "Overig";
      counts[t] = (counts[t] || 0) + 1;
    });
    if (!pillsContainer) return;
    pillsContainer.innerHTML = "";
    Object.keys(counts).sort().forEach(function (type) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "emp-doc-pill emp-doc-pill--" + type;
      if (activePillType === type) pill.classList.add("is-active");
      pill.textContent = type + " (" + counts[type] + ")";
      pill.addEventListener("click", function () {
        if (activePillType === type) {
          activePillType = null;
        } else {
          activePillType = type;
        }
        currentPage = 0;
        render();
      });
      pillsContainer.appendChild(pill);
    });
  }

  function getFilteredItems() {
    var docs = getDocumentenState();
    var showArchived = archivedToggle ? archivedToggle.checked : false;

    var items = docs.filter(function (d) {
      if (!showArchived && d.archived) return false;
      if (showArchived && !d.archived) return false;
      return true;
    });

    if (activePillType) {
      items = items.filter(function (d) { return d.type === activePillType; });
    }

    var q = (searchInput?.value || "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (d) {
        return [d.naam, d.type, d.vervaldatum, d.uploaddatum, d.laatstGewijzigd].join(" ").toLowerCase().includes(q);
      });
    }

    if (sortKey) {
      items.sort(function (a, b) {
        var va = (a[sortKey] || "").toLowerCase();
        var vb = (b[sortKey] || "").toLowerCase();
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    return items;
  }

  function render() {
    buildPills();
    var items = getFilteredItems();
    var total = items.length;
    var pageSize = getPageSize();
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var pageItems = items.slice(start, start + pageSize);

    tbody.innerHTML = "";
    if (selectAllCb) selectAllCb.checked = false;

    if (!pageItems.length) {
      emptyEl.style.display = "";
    } else {
      emptyEl.style.display = "none";
      pageItems.forEach(function (doc, idx) {
        var tr = document.createElement("tr");

        var tdCheck = document.createElement("td");
        tdCheck.className = "emp-doc-row-check";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.docIdx = String(start + idx);
        tdCheck.appendChild(cb);
        tr.appendChild(tdCheck);

        var tdAct = document.createElement("td");
        tdAct.className = "emp-doc-col-acties";
        var actWrap = document.createElement("div");
        actWrap.className = "emp-doc-actions-cell";

        var viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "emp-doc-action-btn";
        viewBtn.title = "Bekijken";
        viewBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        viewBtn.addEventListener("click", function () {
          if (doc.fileData) {
            var w = window.open("");
            if (w) {
              if (doc.fileMime && doc.fileMime.startsWith("image/")) {
                w.document.write('<html><head><title>' + (doc.fileName || doc.naam) + '</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5"><img src="' + doc.fileData + '" style="max-width:100%;max-height:100vh" /></body></html>');
              } else if (doc.fileMime === "application/pdf") {
                w.document.write('<html><head><title>' + (doc.fileName || doc.naam) + '</title></head><body style="margin:0"><iframe src="' + doc.fileData + '" style="width:100%;height:100vh;border:none"></iframe></body></html>');
              } else {
                var a = w.document.createElement("a");
                a.href = doc.fileData;
                a.download = doc.fileName || doc.naam;
                a.click();
                w.close();
              }
            }
          } else {
            if (typeof window.showActionFeedback === "function") {
              window.showActionFeedback("info", "Geen bestand", "Er is geen bestand beschikbaar voor dit document.");
            }
          }
        });

        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "emp-doc-action-btn";
        editBtn.title = "Bewerken";
        editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        editBtn.addEventListener("click", function () {
          openEditModal(doc.id);
        });

        actWrap.appendChild(viewBtn);
        actWrap.appendChild(editBtn);
        if (!doc.archived) {
          var archiveBtn = document.createElement("button");
          archiveBtn.type = "button";
          archiveBtn.className = "emp-doc-action-btn";
          archiveBtn.title = "Archiveren";
          archiveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
          archiveBtn.addEventListener("click", function () {
            function applyArchive() {
              window.medewerkerDocsDB.archive(doc.id).then(function () {
                if (typeof window.showActionFeedback === "function") {
                  window.showActionFeedback("archived", "Document");
                }
              }).catch(function (err) {
                reportDocumentError(err, "Archiveren");
              });
            }
            if (typeof window.showArchiveConfirm === "function") {
              window.showArchiveConfirm({ preview: doc.naam || "" }).then(function (ok) {
                if (ok) applyArchive();
              });
            } else {
              applyArchive();
            }
          });
          actWrap.appendChild(archiveBtn);
        }
        tdAct.appendChild(actWrap);
        tr.appendChild(tdAct);

        var colDefs = [
          { key: "naam", format: function (v) { return v || ""; } },
          { key: "type", format: function (v) { return v || ""; } },
          { key: "vervaldatum", format: function (v) { return formatDate(v); } },
          { key: "uploaddatum", format: function (v) { return formatDateTime(v); } },
          { key: "laatstGewijzigd", format: function (v) { return formatDateTime(v); } },
        ];

        colDefs.forEach(function (col) {
          var td = document.createElement("td");
          td.setAttribute("data-doccol", col.key);
          td.textContent = col.format(doc[col.key]);
          tr.appendChild(td);
        });

        var tdDel = document.createElement("td");
        tdDel.className = "emp-doc-col-delete";
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "employee-delete-btn";
        delBtn.title = doc.archived ? "Definitief verwijderen" : "Verwijderen";
        delBtn.setAttribute("aria-label", doc.archived ? "Definitief verwijderen" : "Verwijderen");
        delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        delBtn.addEventListener("click", function () {
          openDocDeleteModal(doc);
        });
        if (doc.archived) {
          var delWrap = document.createElement("div");
          delWrap.className = "hr-row-actions";
          var restoreBtn = document.createElement("button");
          restoreBtn.type = "button";
          restoreBtn.className = "btn-outline hr-restore-btn emp-doc-restore-btn";
          restoreBtn.textContent = "Herstel";
          restoreBtn.addEventListener("click", function () {
            window.medewerkerDocsDB.restore(doc.id).then(function () {
              if (typeof window.showActionFeedback === "function") {
                window.showActionFeedback("restored", "Document");
              }
            }).catch(function (err) {
              reportDocumentError(err, "Herstellen");
            });
          });
          delWrap.appendChild(restoreBtn);
          delWrap.appendChild(delBtn);
          tdDel.appendChild(delWrap);
        } else {
          tdDel.appendChild(delBtn);
        }
        tr.appendChild(tdDel);

        tbody.appendChild(tr);
      });
    }

    if (pageInfoEl) pageInfoEl.textContent = pageSize + " of " + total + " total.";
    if (pageLabelEl) pageLabelEl.textContent = "Page " + (currentPage + 1) + " of " + totalPages;

    applyColumnVisibility();
  }

  // Sort
  document.querySelectorAll(".emp-doc-table th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      render();
    });
  });

  // Search
  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });

  // Archived toggle
  if (archivedToggle) archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });

  // Reset
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      if (archivedToggle) archivedToggle.checked = false;
      activePillType = null;
      sortKey = "";
      sortDir = "asc";
      currentPage = 0;
      document.querySelectorAll(".emp-doc-col-dropdown input[data-doccol]").forEach(function (cb) { cb.checked = true; });
      render();
    });
  }

  // Select all
  if (selectAllCb) {
    selectAllCb.addEventListener("change", function () {
      tbody.querySelectorAll("input[type='checkbox']").forEach(function (cb) {
        cb.checked = selectAllCb.checked;
      });
    });
  }

  // Page size
  if (pageSizeSelect) pageSizeSelect.addEventListener("change", function () { currentPage = 0; render(); });

  // Pagination
  document.querySelectorAll(".emp-doc-page-nav button[data-docpage]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var items = getFilteredItems();
      var totalPages = Math.max(1, Math.ceil(items.length / getPageSize()));
      var action = btn.dataset.docpage;
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  // Columns toggle
  if (colBtn) {
    colBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = colDropdown.style.display !== "none";
      colDropdown.style.display = open ? "none" : "";
    });
  }
  if (colDropdown) {
    colDropdown.addEventListener("click", function (e) { e.stopPropagation(); });
    colDropdown.querySelectorAll("input[data-doccol]").forEach(function (cb) {
      cb.addEventListener("change", function () { applyColumnVisibility(); });
    });
  }
  document.addEventListener("click", function () {
    if (colDropdown) colDropdown.style.display = "none";
  });

  // Dropzone
  var dropzone = document.getElementById("emp-doc-dropzone");
  var dropzoneFilename = document.getElementById("emp-doc-dropzone-filename");

  function clearDropzone() {
    if (modalFile) modalFile.value = "";
    if (dropzoneFilename) dropzoneFilename.textContent = "";
    if (dropzone) dropzone.classList.remove("is-dragover");
  }

  function showSelectedFile(file) {
    if (file && dropzoneFilename) dropzoneFilename.textContent = file.name;
  }

  if (dropzone && modalFile) {
    dropzone.addEventListener("click", function () { modalFile.click(); });

    modalFile.addEventListener("change", function () {
      if (modalFile.files && modalFile.files[0]) showSelectedFile(modalFile.files[0]);
    });

    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
    dropzone.addEventListener("dragleave", function () {
      dropzone.classList.remove("is-dragover");
    });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        modalFile.files = e.dataTransfer.files;
        showSelectedFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Modal open/close
  function closeModal() {
    if (modal) modal.style.display = "none";
    editingDocId = null;
    clearDropzone();
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      editingDocId = null;
      if (modalTitle) modalTitle.textContent = "Document uploaden";
      if (modalNaam) modalNaam.value = "";
      if (modalType) modalType.value = "";
      if (modalVerval) modalVerval.value = "";
      clearDropzone();
      if (dropzone) dropzone.style.display = "";
      if (modalSave) modalSave.textContent = "Toevoegen";
      if (modal) modal.style.display = "";
    });
  }

  function openEditModal(docId) {
    var doc = getDocumentenState().find(function (d) { return d && String(d.id) === String(docId); });
    if (!doc) return;
    editingDocId = docId;
    if (modalTitle) modalTitle.textContent = "Document bewerken";
    if (modalNaam) modalNaam.value = doc.naam || "";
    if (modalType) modalType.value = doc.type || "";
    if (modalVerval) modalVerval.value = doc.vervaldatum ? doc.vervaldatum.split("T")[0] : "";
    clearDropzone();
    if (dropzone) dropzone.style.display = "none";
    if (modalSave) modalSave.textContent = "Opslaan";
    if (modal) modal.style.display = "";
  }

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalCancel) modalCancel.addEventListener("click", closeModal);
  if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  function setSavingState(busy) {
    if (!modalSave) return;
    modalSave.disabled = !!busy;
    modalSave.dataset.busy = busy ? "1" : "";
  }

  function commitDocSave(fileData, fileName, fileMime) {
    var naam = (modalNaam?.value || "").trim();
    var type = modalType?.value || "";
    var verval = modalVerval?.value || "";
    if (!naam) { modalNaam?.focus(); return; }

    var empId = getCurrentEmployeeIdForDocs();
    if (!empId) {
      reportDocumentError(new Error("Geen geselecteerde medewerker"), "Opslaan");
      return;
    }

    var isEdit = !!editingDocId;
    setSavingState(true);

    var p;
    if (isEdit) {
      var partial = { naam: naam, type: type, vervaldatum: verval };
      if (fileData) {
        partial.fileData = fileData;
        partial.fileName = fileName;
        partial.fileMime = fileMime;
      }
      p = window.medewerkerDocsDB.update(editingDocId, partial);
    } else {
      p = window.medewerkerDocsDB.add({
        medewerkerId: empId,
        naam: naam,
        type: type,
        vervaldatum: verval,
        archived: false,
        fileData: fileData || "",
        fileName: fileName || "",
        fileMime: fileMime || "",
      });
    }

    p.then(function () {
      closeModal();
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback(isEdit ? "saved" : "added", "Document");
      }
    }).catch(function (err) {
      reportDocumentError(err, isEdit ? "Bewerken" : "Uploaden");
    }).then(function () {
      setSavingState(false);
    });
  }

  if (modalSave) {
    modalSave.addEventListener("click", function () {
      var file = modalFile && modalFile.files && modalFile.files[0];
      if (file) {
        var reader = new FileReader();
        reader.onload = function () {
          commitDocSave(reader.result, file.name, file.type);
        };
        reader.onerror = function () {
          reportDocumentError(new Error("Het bestand kon niet worden ingelezen."), "Bestand inlezen");
        };
        reader.readAsDataURL(file);
      } else {
        commitDocSave("", "", "");
      }
    });
  }

  // Delete confirmation modal
  var delModal = document.getElementById("emp-doc-delete-modal");
  var delSlider = document.getElementById("emp-doc-delete-slider");
  var delConfirmBtn = document.getElementById("emp-doc-delete-confirm");
  var delCancelBtn = document.getElementById("emp-doc-delete-cancel");
  var delCloseBtn = document.getElementById("emp-doc-delete-close");
  var delPreview = document.getElementById("emp-doc-delete-preview");
  var docToDelete = null;

  function syncDelSlider() {
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetDelSlider() {
    if (delSlider) { delSlider.value = "0"; syncDelSlider(); }
  }

  function openDocDeleteModal(doc) {
    docToDelete = doc;
    if (delPreview) delPreview.textContent = doc.naam || "";
    resetDelSlider();
    if (delModal) { delModal.removeAttribute("hidden"); delModal.setAttribute("aria-hidden", "false"); }
  }

  function closeDocDeleteModal() {
    if (delModal) { delModal.setAttribute("hidden", ""); delModal.setAttribute("aria-hidden", "true"); }
    docToDelete = null;
    resetDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  function confirmDocDelete() {
    if (!docToDelete || (delConfirmBtn && delConfirmBtn.disabled)) return;
    var idToDelete = docToDelete.id;
    closeDocDeleteModal();
    window.medewerkerDocsDB.remove(idToDelete).then(function () {
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("deleted", "Document");
      }
    }).catch(function (err) {
      reportDocumentError(err, "Verwijderen");
    });
  }

  if (delSlider) delSlider.addEventListener("input", syncDelSlider);
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmDocDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeDocDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeDocDeleteModal);
  if (delModal) delModal.addEventListener("click", function (e) { if (e.target === delModal) closeDocDeleteModal(); });

  // Download all
  var downloadAllBtn = document.querySelector(".emp-doc-download-all-btn");
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener("click", function () {
      var docs = getDocumentenState().filter(function (d) { return d.fileData && !d.archived; });
      if (!docs.length) {
        if (typeof window.showSaveModal === "function") {
          window.showSaveModal("Er zijn geen bestanden beschikbaar om te downloaden.", "Geen documenten");
        }
        return;
      }
      showDownloadAllConfirm(docs);
    });
  }

  function performDownloadAll(docs) {
    docs.forEach(function (d) {
      var a = document.createElement("a");
      a.href = d.fileData;
      a.download = d.fileName || d.naam || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    if (typeof window.showSaveModal === "function") {
      var msg = docs.length === 1
        ? "1 document is gedownload."
        : docs.length + " documenten zijn gedownload.";
      window.showSaveModal(msg, "Gedownload");
    }
  }

  function ensureDownloadConfirmModal() {
    var existing = document.getElementById("emp-doc-download-confirm-modal");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "emp-doc-download-confirm-modal";
    wrap.className = "modal-overlay";
    wrap.setAttribute("hidden", "");
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="modal-dialog cl-add-dialog" role="dialog" aria-modal="true" aria-labelledby="emp-doc-download-confirm-title" tabindex="-1">' +
        '<div class="modal-header">' +
          '<h2 class="modal-title" id="emp-doc-download-confirm-title">Alles downloaden</h2>' +
          '<button type="button" class="modal-close" id="emp-doc-download-confirm-close" aria-label="Sluiten"><span aria-hidden="true">&times;</span></button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p class="app-save-feedback-text" id="emp-doc-download-confirm-msg" role="status"></p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="btn-outline" id="emp-doc-download-confirm-cancel">Annuleren</button>' +
          '<button type="button" class="btn-primary" id="emp-doc-download-confirm-ok">Downloaden</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function showDownloadAllConfirm(docs) {
    var modal = ensureDownloadConfirmModal();
    var msg = document.getElementById("emp-doc-download-confirm-msg");
    var closeBtn = document.getElementById("emp-doc-download-confirm-close");
    var cancelBtn = document.getElementById("emp-doc-download-confirm-cancel");
    var okBtn = document.getElementById("emp-doc-download-confirm-ok");
    if (msg) {
      msg.textContent = docs.length === 1
        ? "Wil je 1 document downloaden?"
        : "Wil je " + docs.length + " documenten downloaden?";
    }

    function close() {
      modal.setAttribute("hidden", "");
      modal.setAttribute("aria-hidden", "true");
      if (closeBtn) closeBtn.removeEventListener("click", close);
      if (cancelBtn) cancelBtn.removeEventListener("click", close);
      if (okBtn) okBtn.removeEventListener("click", confirm);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
    }
    function confirm() {
      close();
      performDownloadAll(docs);
    }
    function onBackdrop(e) { if (e.target === modal) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (cancelBtn) cancelBtn.addEventListener("click", close);
    if (okBtn) okBtn.addEventListener("click", confirm);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);

    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  // Re-render bij elke wijziging in de Supabase-cache (eigen page-acties +
  // achtergrond-migraties). Filter optioneel op huidige medewerker zodat
  // updates voor andere medewerkers de UI niet onnodig hertekenen.
  window.addEventListener("besa:medewerker-documenten-updated", function (e) {
    var detail = e && e.detail || {};
    var current = getCurrentEmployeeIdForDocs();
    if (detail.medewerkerId && current && String(detail.medewerkerId) !== String(current)) return;
    render();
  });

  render();
}

// Bootstrap: wacht op medewerkersDB fresh fetch uit Supabase voordat we de form
// vullen. Voorkomt het "stale cache toont em-dash/leeg adres"-issue bij eerste
// page-load (fix sub-task 2026-05-15 medewerker-sync testcase Samra).
(function bootstrapEmployeeForm() {
  function fillForm() { try { loadEmployeeIntoForm(); } catch (e) { console.error("[medewerker] loadEmployeeIntoForm fout:", e); } }
  // Run direct met cached data (snelle eerste paint)
  fillForm();
  // Plus run opnieuw zodra Supabase fresh data heeft
  if (window.medewerkersDB && window.medewerkersDB.ready && typeof window.medewerkersDB.ready.then === "function") {
    window.medewerkersDB.ready.then(fillForm).catch(function (e) { console.error("[medewerker] medewerkersDB.ready fout:", e); });
  }
  // En her-render telkens als medewerker-data verandert (real-time + Supabase-sync)
  window.addEventListener("besa:medewerkers-updated", fillForm);
})();

initTabs();
initOpleidingSection();
initNotitiesSection();
initVerzuimSection();
initVerlofTables();
initVerlofOverdragenModal();
initSectionSave();
initTaalDropdown();
initCaoDropdown();
initExtraSidebarActions();
initLiveContactMirror();
initProfessioneelByDienstverband();
initLocatiesSection();
initFunctieScrollableDropdown();
initLoondienstSalaryDropdowns();
initLoondienstPeriodiekeMaandDropdown();
initLoondienstContracturenValidation();
initRoosterWeekendAfwisseling();
initLoondienstRooster();
if (typeof window.__setRoosterWeekendModes === "function") {
  window.__setRoosterWeekendModes(getSelectedEmployee()?.roosterWeekend);
}
initBedrijfsvoorzieningenNotes();
initDocumentenSection();

// Bug #61 fix: globale Escape close-way voor alle 4 emp-modals (defensieve fallback
// die altijd werkt, ook als per-modal init bailout heeft gehad)
(function initGlobalEscapeForEmpModals() {
  var modalIds = ["emp-doc-delete-modal", "emp-doc-modal", "emp-verlof-overd-modal", "emp-verzuim-modal"];
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    for (var i = 0; i < modalIds.length; i++) {
      var m = document.getElementById(modalIds[i]);
      if (!m) continue;
      var visible = m.style.display !== "none" && getComputedStyle(m).display !== "none" && !m.hasAttribute("hidden");
      if (visible) {
        m.style.display = "none";
        m.setAttribute("aria-hidden", "true");
        e.stopPropagation();
        return;
      }
    }
  });
  // Defensieve overlay-click + X-close fallback voor modals die anders niet wired worden
  modalIds.forEach(function (id) {
    var m = document.getElementById(id);
    if (!m) return;
    // Overlay click
    m.addEventListener("click", function (e) {
      if (e.target !== m) return;
      m.style.display = "none";
      m.setAttribute("aria-hidden", "true");
    });
    // X-close (zoek alle bekende close-btn IDs)
    var closeCandidates = [
      id + "-close",
      id.replace("-modal", "") + "-close"
    ];
    closeCandidates.forEach(function (cid) {
      var btn = document.getElementById(cid);
      if (!btn) return;
      btn.addEventListener("click", function () {
        m.style.display = "none";
        m.setAttribute("aria-hidden", "true");
      });
    });
  });
})();
