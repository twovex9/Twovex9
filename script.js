const topLinks = document.querySelectorAll(".top-link");
const sideLinks = document.querySelectorAll(".side-link");

function setActive(items, clicked) {
  items.forEach((item) => item.classList.remove("is-active"));
  clicked.classList.add("is-active");
}

topLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = (link.getAttribute("href") || "").trim();
    if (href === "#" || href === "") {
      event.preventDefault();
      setActive(topLinks, link);
    }
  });
});

sideLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = (link.getAttribute("href") || "").trim();
    if (href === "#" || href === "") {
      event.preventDefault();
      setActive(sideLinks, link);
      return;
    }
    /* Navigatie naar echte pagina's (bijv. nieuws.html) niet blokkeren */
  });
});

document.querySelectorAll(".filter-chip").forEach((chip) => {
  if (chip.id === "btn-functie-filter" || chip.id === "btn-opleiding-filter") return;
  chip.addEventListener("click", () => {
    chip.classList.toggle("is-active");
  });
});

const FUNCTIE_OPTIONS = [
  "Facilitair Medewerker",
  "Medewerker Financiële administratie",
  "Hoofd facilitair",
  "Planner",
  "Teamleider",
  "Financieel Directeur",
  "Operationeel Directeur",
  "Gedragswetenschapper",
  "Medewerker Kwaliteit en beleid",
  "Stagiair",
  "Coördinator Ambulant",
  "Ambulant Medewerker",
  "HR medewerker",
  "Leerling Pedagogisch medewerker",
  "Pedagogisch medewerker",
  "Sr. Pedagogisch medewerker",
];

function getCompetentiesFromStorage() {
  try {
    var raw = localStorage.getItem("competenties");
    var list = raw ? JSON.parse(raw) : [];
    return list.filter(function (c) { return !c.archived; }).map(function (c) { return c.naam; }).sort(function (a, b) { return a.localeCompare(b, "nl", { sensitivity: "base" }); });
  } catch (e) { return []; }
}

function getOpleidingenFromStorage() {
  try {
    var raw = localStorage.getItem("opleidingen");
    var list = raw ? JSON.parse(raw) : [];
    return list.filter(function (o) { return !o.archived; }).map(function (o) { return o.naam; }).sort(function (a, b) { return a.localeCompare(b, "nl", { sensitivity: "base" }); });
  } catch (e) { return []; }
}

function populateSelectFromList(selectId, options, placeholder) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  var ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  sel.appendChild(ph);
  options.forEach(function (name) {
    var opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

let filterFunctie = null;
let filterOpleiding = null;
// Werkende filter-chips voor Locatie/Bureau/Contracttype/Fase/Dienstverband/Competenties
// (gebouwd via window.besaFilterChips.createSearchSelectChip — HR-stijl).
let filterLocatie = null;
let filterBureau = null;
let filterContracttype = null;
let filterFase = null;
let filterDienstverband = null;
let filterCompetentie = null;

const OPLEIDING_OPTIONS_RAW =
  typeof window !== "undefined" && window.OPLEIDINGEN_DEFAULT_NAMEN && window.OPLEIDINGEN_DEFAULT_NAMEN.length
    ? window.OPLEIDINGEN_DEFAULT_NAMEN.slice()
    : [];

const OPLEIDING_OPTIONS = [...new Set(OPLEIDING_OPTIONS_RAW)].sort((a, b) =>
  a.localeCompare(b, "nl", { sensitivity: "base" })
);

let refreshEmployeesPagination = () => {};
let applyEmployeesPaginationOnly = () => {};
const EMPLOYEE_EDITS_STORAGE_KEY = "employeeEditsById";
const EMPLOYEE_ITEMS_STORAGE_KEY = "employeeItems";
const BESA_BULK_IMPORT_KEY = "besaEmpBulkV2026a";

function mergeBesuBulkEmployeesOnce() {
  if (typeof BESA_EMPLOYEES_BULK === "undefined" || !Array.isArray(BESA_EMPLOYEES_BULK) || BESA_EMPLOYEES_BULK.length === 0) {
    return;
  }
  try {
    if (window.localStorage.getItem(BESA_BULK_IMPORT_KEY)) return;
  } catch {
    return;
  }
  const existing = readEmployeeItems();
  const seen = new Set(
    existing.map((x) => String(x.email || "").toLowerCase().trim()).filter(Boolean)
  );
  const toAdd = [];
  BESA_EMPLOYEES_BULK.forEach((row) => {
    const em = String(row.email || "").toLowerCase().trim();
    if (!em || seen.has(em)) return;
    seen.add(em);
    toAdd.push({ ...row, id: row.id || makeEmployeeId() });
  });
  if (toAdd.length) {
    writeEmployeeItems([...existing, ...toAdd]);
  }
  try {
    window.localStorage.setItem(BESA_BULK_IMPORT_KEY, "1");
  } catch {
    /* */
  }
}

function readEmployeeEdits() {
  // Stage 6: Supabase (medewerkersDB) is bron-van-waarheid voor medewerker-
  // velden. localStorage["employeeEditsById"] is alleen nog fallback voor
  // pre-migratie state of korte momenten dat de DB-cache niet leeg is.
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
  try {
    window.localStorage.setItem(EMPLOYEE_EDITS_STORAGE_KEY, JSON.stringify(edits || {}));
  } catch {
    // Ignore quota/storage errors in demo mode.
  }
}

function readEmployeeItems() {
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEmployeeItems(items) {
  try {
    window.localStorage.setItem(EMPLOYEE_ITEMS_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // Ignore storage errors in demo mode.
  }
}

function makeEmployeeId() {
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateNL(date = new Date()) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

function isoToNlDate(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return "";
  const [y, m, d] = str.split("-");
  return `${d}-${m}-${y}`;
}

function createStatusPill(label) {
  const raw = (label || "In dienst").trim() || "In dienst";
  const normalized = raw.replace(/[_-]/g, " ").trim().toLowerCase();
  const isOut = normalized === "uit dienst";
  const cls = isOut ? "status-pill status-pill--uit-dienst" : "status-pill status-pill--in-dienst";
  const display = isOut ? "Uit dienst" : "In dienst";
  return `<span class="${cls}">${display}</span>`;
}

function createEmployeeRow(item) {
  const tr = document.createElement("tr");
  tr.dataset.empId = item.id || makeEmployeeId();
  tr.dataset.verjaardag = item.verjaardag || "";
  tr.dataset.overigeInfo = item.overigeInfo || "";
  tr.dataset.competentie = item.competentie || "";

  tr.innerHTML = `
    <td data-col="avatar"><span class="avatar"></span></td>
    <td data-col="voornaam">${item.voornaam || ""}</td>
    <td data-col="achternaam">${item.achternaam || ""}</td>
    <td data-col="email">${item.email || ""}</td>
    <td data-col="tel">${item.tel || ""}</td>
    <td data-col="fase">${createStatusPill(item.fase)}</td>
    <td data-col="dienstverband">${item.dienstverband || "—"}</td>
    <td data-col="functie">${item.functie || "—"}</td>
    <td data-col="opleiding">${item.opleiding || "—"}</td>
    <td data-col="werktype">${item.werktype || "—"}</td>
    <td data-col="startdatum">${item.startdatum || "—"}</td>
    <td data-col="periodieke-maand">${item.periodiekeMaand || "—"}</td>
    <td data-col="einde-contract">${item.eindeContract || "—"}</td>
    <td data-col="contracten">${item.contracten || "1"}</td>
    <td data-col="contracttype">${item.contracttype || "Onbepaalde tijd"}</td>
    <td data-col="uit-dienst">${item.uitDienst || "—"}</td>
    <td data-col="laatst-gewijzigd">${item.laatstGewijzigd || formatDateNL()}</td>
  `;
  if (item.archived) tr.dataset.archived = "1";
  return tr;
}

function rowToEmployeeItem(tr) {
  if (!tr) return null;
  const read = (col) => tr.querySelector(`td[data-col="${col}"]`)?.textContent?.trim() || "";
  const fase = tr.querySelector('td[data-col="fase"] .status-pill')?.textContent?.trim() || read("fase") || "In dienst";
  const item = {
    id: tr.dataset.empId || makeEmployeeId(),
    voornaam: read("voornaam"),
    achternaam: read("achternaam"),
    email: read("email"),
    tel: read("tel"),
    fase,
    dienstverband: read("dienstverband"),
    functie: read("functie"),
    opleiding: read("opleiding"),
    werktype: read("werktype"),
    startdatum: read("startdatum"),
    periodiekeMaand: read("periodieke-maand"),
    eindeContract: read("einde-contract"),
    contracten: read("contracten"),
    contracttype: read("contracttype"),
    uitDienst: read("uit-dienst"),
    laatstGewijzigd: read("laatst-gewijzigd"),
    verjaardag: tr.dataset.verjaardag || read("verjaardag"),
    overigeInfo: tr.dataset.overigeInfo || read("overige-info"),
    competentie: tr.dataset.competentie || "",
    archived: tr.dataset.archived === "1" || tr.dataset.archived === "true",
  };
  if (!item.voornaam && !item.achternaam && !item.email) return null;
  return item;
}

function persistEmployeesFromTable(tbody) {
  if (!tbody) return;
  const fromTable = Array.from(tbody.querySelectorAll("tr"))
    .map((tr) => rowToEmployeeItem(tr))
    .filter(Boolean);
  const byId = new Map(readEmployeeItems().map((x) => [x.id, { ...x }]));
  fromTable.forEach((item) => {
    const prev = byId.get(item.id) || {};
    byId.set(item.id, { ...prev, ...item });
  });
  writeEmployeeItems(Array.from(byId.values()));
}

function loadEmployeesFromStorage(tbody) {
  if (!tbody) return;
  const archivedToggle = document.getElementById("employees-archived-toggle");
  const showArchived = archivedToggle ? archivedToggle.checked : false;
  const all = readEmployeeItems();
  if (all.length === 0) return;
  const items = all.filter((item) => (showArchived ? item.archived === true : !item.archived));
  tbody.innerHTML = "";
  items.forEach((item) => {
    tbody.appendChild(createEmployeeRow(item));
  });
}

function ensureEmployeeRowIds(tbody) {
  if (!tbody) return;
  Array.from(tbody.querySelectorAll("tr")).forEach((tr, idx) => {
    if (!tr.dataset.empId) tr.dataset.empId = `emp-${idx + 1}`;
  });
}

function applySavedEmployeeEditsToTable(tbody) {
  if (!tbody) return;
  const editsById = readEmployeeEdits();
  if (!editsById || typeof editsById !== "object") return;

  const setCell = (tr, col, value) => {
    if (value == null || value === "") return;
    const td = tr.querySelector(`td[data-col="${col}"]`);
    if (!td) return;
    if (col === "fase") {
      td.innerHTML = createStatusPill(value);
      return;
    }
    td.textContent = value;
  };

  const rows = Array.from(tbody.querySelectorAll("tr"));
  Object.values(editsById).forEach((edit) => {
    if (!edit || typeof edit !== "object") return;
    let tr = null;

    if (edit.empId) {
      tr = rows.find((row) => row.dataset.empId === edit.empId) || null;
    }

    if (!tr && edit.__match) {
      tr =
        rows.find((row) => {
          const v = row.querySelector('[data-col="voornaam"]')?.textContent?.trim() || "";
          const a = row.querySelector('[data-col="achternaam"]')?.textContent?.trim() || "";
          const e = row.querySelector('[data-col="email"]')?.textContent?.trim() || "";
          return v === (edit.__match.voornaam || "") && a === (edit.__match.achternaam || "") && e === (edit.__match.email || "");
        }) || null;
    }

    if (!tr) return;

    setCell(tr, "voornaam", edit.voornaam);
    setCell(tr, "achternaam", edit.achternaam);
    setCell(tr, "email", edit.email);
    setCell(tr, "tel", edit.tel);
    setCell(tr, "fase", edit.fase);
    setCell(tr, "dienstverband", edit.dienstverband);
    setCell(tr, "functie", edit.functie);
    setCell(tr, "opleiding", edit.opleiding);
    setCell(tr, "startdatum", edit.startdatum);

    if (edit.competentie) {
      tr.dataset.competentie = edit.competentie;
    }
    if (edit.verjaardag) {
      tr.dataset.verjaardag = edit.verjaardag;
      setCell(tr, "verjaardag", edit.verjaardag);
    }
    if (edit.overigeInfo) {
      tr.dataset.overigeInfo = edit.overigeInfo;
      setCell(tr, "overige-info", edit.overigeInfo);
    }
  });
}

let appToastTimer = null;
function showAppToast(message) {
  if (!message) return;
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");

  if (appToastTimer) window.clearTimeout(appToastTimer);
  appToastTimer = window.setTimeout(() => {
    toast?.classList.remove("is-visible");
  }, 2800);
}

const EMP_ACTION_TRASH_SVG =
  '<svg class="employee-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

function isEmployeesArchivedView() {
  const t = document.getElementById("employees-archived-toggle");
  return !!(t && t.checked);
}

function fillEmployeeActionCell(td, empId) {
  td.setAttribute("data-col", "acties");
  td.textContent = "";
  if (isEmployeesArchivedView()) {
    const wrap = document.createElement("div");
    wrap.className = "hr-row-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn-outline hr-restore-btn";
    if (empId) restore.setAttribute("data-emp-id", empId);
    restore.textContent = "Herstel";
    const purge = document.createElement("button");
    purge.type = "button";
    purge.className = "employee-delete-btn emp-purge-btn";
    purge.setAttribute("aria-label", "Definitief verwijderen");
    purge.innerHTML = EMP_ACTION_TRASH_SVG;
    wrap.appendChild(restore);
    wrap.appendChild(purge);
    td.appendChild(wrap);
  } else {
    const arch = document.createElement("button");
    arch.type = "button";
    arch.className = "employee-delete-btn emp-archive-btn";
    arch.setAttribute("aria-label", "Medewerker archiveren");
    arch.innerHTML = EMP_ACTION_TRASH_SVG;
    td.appendChild(arch);
  }
}

function ensureEmployeesActionsColumn() {
  const employeesTable = document.querySelector("table.employees-table:not(.nieuws-table)");
  if (!employeesTable) return;

  const headRow = employeesTable.querySelector("thead tr");
  if (headRow && !headRow.querySelector('th[data-col="acties"]')) {
    const th = document.createElement("th");
    th.setAttribute("data-col", "acties");
    th.className = "th-acties";
    th.innerHTML = '<span class="th-acties-label">Acties</span>';
    headRow.appendChild(th);
  }

  const bodyRows = employeesTable.querySelectorAll("tbody tr");
  bodyRows.forEach((tr) => {
    let td = tr.querySelector('td[data-col="acties"]');
    if (!td) {
      td = document.createElement("td");
      tr.appendChild(td);
    }
    fillEmployeeActionCell(td, tr.dataset.empId || "");
  });
}

function defaultBirthdayByRow(rowIndex) {
  const day = String(((rowIndex * 3) % 28) + 1).padStart(2, "0");
  const month = String(((rowIndex * 5) % 12) + 1).padStart(2, "0");
  const year = String(1980 + (rowIndex % 25));
  return `${day}-${month}-${year}`;
}

function ensureEmployeesProfileColumns() {
  const employeesTable = document.querySelector("table.employees-table:not(.nieuws-table)");
  if (!employeesTable) return;

  const headRow = employeesTable.querySelector("thead tr");
  const lastChangedHead = headRow?.querySelector('th[data-col="laatst-gewijzigd"]');

  if (headRow && !headRow.querySelector('th[data-col="verjaardag"]')) {
    const th = document.createElement("th");
    th.setAttribute("data-col", "verjaardag");
    th.className = "th-sort";
    th.innerHTML = '<div class="th-sort-inner"><span class="th-label">Verjaardag</span></div>';
    if (lastChangedHead) headRow.insertBefore(th, lastChangedHead);
    else headRow.appendChild(th);
  }

  if (headRow && !headRow.querySelector('th[data-col="overige-info"]')) {
    const th = document.createElement("th");
    th.setAttribute("data-col", "overige-info");
    th.className = "th-sort";
    th.innerHTML = '<div class="th-sort-inner"><span class="th-label">Overige info</span></div>';
    const insertBeforeEl = headRow.querySelector('th[data-col="laatst-gewijzigd"]');
    if (insertBeforeEl) headRow.insertBefore(th, insertBeforeEl);
    else headRow.appendChild(th);
  }

  const bodyRows = employeesTable.querySelectorAll("tbody tr");
  bodyRows.forEach((tr, idx) => {
    if (!tr.dataset.verjaardag) tr.dataset.verjaardag = defaultBirthdayByRow(idx + 1);
    if (!tr.dataset.overigeInfo) tr.dataset.overigeInfo = `Medewerkernummer ${100 + idx + 1}`;

    let birthdayCell = tr.querySelector('td[data-col="verjaardag"]');
    if (!birthdayCell) {
      birthdayCell = document.createElement("td");
      birthdayCell.setAttribute("data-col", "verjaardag");
      const lastChanged = tr.querySelector('td[data-col="laatst-gewijzigd"]');
      if (lastChanged) tr.insertBefore(birthdayCell, lastChanged);
      else tr.appendChild(birthdayCell);
    }
    birthdayCell.textContent = tr.dataset.verjaardag;

    let infoCell = tr.querySelector('td[data-col="overige-info"]');
    if (!infoCell) {
      infoCell = document.createElement("td");
      infoCell.setAttribute("data-col", "overige-info");
      const lastChanged = tr.querySelector('td[data-col="laatst-gewijzigd"]');
      if (lastChanged) tr.insertBefore(infoCell, lastChanged);
      else tr.appendChild(infoCell);
    }
    infoCell.textContent = tr.dataset.overigeInfo;
  });
}

function initEmployeeRowNavigation(tbody) {
  if (!tbody) return;

  tbody.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea, label")) {
      return;
    }

    const tr = event.target.closest("tr");
    if (!tr || !tbody.contains(tr)) return;
    const stored = readEmployeeItems().find((x) => x.id === (tr.dataset.empId || "")) || {};

    const employee = {
      ...stored,
      empId: tr.dataset.empId || "",
      voornaam: tr.querySelector('[data-col="voornaam"]')?.textContent?.trim() || "",
      achternaam: tr.querySelector('[data-col="achternaam"]')?.textContent?.trim() || "",
      email: tr.querySelector('[data-col="email"]')?.textContent?.trim() || "",
      tel: tr.querySelector('[data-col="tel"]')?.textContent?.trim() || "",
      fase: tr.querySelector('[data-col="fase"]')?.textContent?.replace(/\s+/g, " ").trim() || "",
      dienstverband: tr.querySelector('[data-col="dienstverband"]')?.textContent?.trim() || "",
      functie: tr.querySelector('[data-col="functie"]')?.textContent?.trim() || "",
      opleiding: tr.querySelector('[data-col="opleiding"]')?.textContent?.trim() || "",
      startdatum: tr.querySelector('[data-col="startdatum"]')?.textContent?.trim() || "",
      verjaardag: tr.dataset.verjaardag || tr.querySelector('[data-col="verjaardag"]')?.textContent?.trim() || "—",
      overigeInfo: tr.dataset.overigeInfo || tr.querySelector('[data-col="overige-info"]')?.textContent?.trim() || "—",
    };

    window.sessionStorage.setItem("selectedEmployee", JSON.stringify(employee));
    window.location.href = "medewerker.html";
  });
}

function initEmployeeDeleteModal(tbody) {
  const modal = document.getElementById("employee-delete-modal");
  const slider = document.getElementById("employee-delete-slider");
  const confirmBtn = document.getElementById("employee-delete-confirm-btn");
  const cancelBtn = document.getElementById("employee-delete-cancel-btn");
  const closeBtn = document.getElementById("employee-delete-close-btn");
  const preview = document.getElementById("employee-delete-preview");
  const columnsPanelEl = document.getElementById("columns-panel");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");
  if (!modal || !slider || !confirmBtn || !tbody) return;

  let rowToDelete = null;

  function syncSlider() {
    const v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
    slider.value = String(v);
    slider.style.setProperty("--employee-slider-pct", `${v}%`);
    slider.setAttribute("aria-valuenow", String(v));
    confirmBtn.disabled = v < 100;
  }

  function resetSlider() {
    slider.value = "0";
    syncSlider();
  }

  function openDeleteModal(tr) {
    rowToDelete = tr;
    const first = tr.querySelector('[data-col="voornaam"]')?.textContent?.trim() || "";
    const last = tr.querySelector('[data-col="achternaam"]')?.textContent?.trim() || "";
    if (preview) preview.textContent = `${first} ${last}`.trim();
    resetSlider();
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (columnsPanelEl) columnsPanelEl.setAttribute("hidden", "");
    if (columnsMenuBtn) columnsMenuBtn.setAttribute("aria-expanded", "false");
    cancelBtn?.focus();
  }

  function closeDeleteModal() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    rowToDelete = null;
    resetSlider();
    if (preview) preview.textContent = "";
  }

  async function confirmDelete() {
    if (!rowToDelete || confirmBtn.disabled) return;
    const deletedName = `${rowToDelete.querySelector('[data-col="voornaam"]')?.textContent?.trim() || ""} ${
      rowToDelete.querySelector('[data-col="achternaam"]')?.textContent?.trim() || ""
    }`.trim();
    const id = rowToDelete.dataset.empId || "";
    if (id) {
      const items = readEmployeeItems().map((x) =>
        x.id === id ? { ...x, archived: true, laatstGewijzigd: formatDateNL() } : x
      );
      writeEmployeeItems(items);
      if (window.medewerkersDB) {
        try { await window.medewerkersDB.archive(id); }
        catch (err) { console.error("Archiveren mislukt:", err); }
      }
    }
    rowToDelete.remove();
    rowToDelete = null;
    closeDeleteModal();
    refreshEmployeesPagination();
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("archived", deletedName ? `Medewerker “${deletedName}”` : "Medewerker");
    } else {
      showAppToast(`Medewerker${deletedName ? ` "${deletedName}"` : ""} is gearchiveerd`);
    }
  }

  tbody.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".emp-archive-btn");
    if (!deleteBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const tr = deleteBtn.closest("tr");
    if (tr) openDeleteModal(tr);
  });

  slider.addEventListener("input", syncSlider);
  slider.addEventListener("change", syncSlider);
  confirmBtn.addEventListener("click", confirmDelete);
  cancelBtn?.addEventListener("click", closeDeleteModal);
  closeBtn?.addEventListener("click", closeDeleteModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeDeleteModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    const pmod = document.getElementById("employee-purge-modal");
    if (pmod && !pmod.hasAttribute("hidden")) return;
    closeDeleteModal();
    event.preventDefault();
  });

  syncSlider();
}

function initEmployeePurgeModal(tbody) {
  const modal = document.getElementById("employee-purge-modal");
  const slider = document.getElementById("employee-purge-slider");
  const confirmBtn = document.getElementById("employee-purge-confirm-btn");
  const cancelBtn = document.getElementById("employee-purge-cancel-btn");
  const closeBtn = document.getElementById("employee-purge-close-btn");
  const preview = document.getElementById("employee-purge-preview");
  if (!modal || !slider || !confirmBtn || !tbody) return;

  let rowToPurge = null;

  function syncPurgeSlider() {
    const v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
    slider.value = String(v);
    slider.style.setProperty("--employee-slider-pct", `${v}%`);
    slider.setAttribute("aria-valuenow", String(v));
    confirmBtn.disabled = v < 100;
  }

  function closePurgeModal() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    rowToPurge = null;
    slider.value = "0";
    syncPurgeSlider();
    if (preview) preview.textContent = "";
  }

  function openPurgeModal(tr) {
    rowToPurge = tr;
    const first = tr.querySelector('[data-col="voornaam"]')?.textContent?.trim() || "";
    const last = tr.querySelector('[data-col="achternaam"]')?.textContent?.trim() || "";
    if (preview) preview.textContent = `${first} ${last}`.trim();
    slider.value = "0";
    syncPurgeSlider();
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    cancelBtn?.focus();
  }

  async function confirmPurge() {
    if (!rowToPurge || confirmBtn.disabled) return;
    const id = rowToPurge.dataset.empId || "";
    const deletedName = `${rowToPurge.querySelector('[data-col="voornaam"]')?.textContent?.trim() || ""} ${
      rowToPurge.querySelector('[data-col="achternaam"]')?.textContent?.trim() || ""
    }`.trim();
    if (id) {
      const items = readEmployeeItems().filter((x) => x.id !== id);
      writeEmployeeItems(items);
      if (window.medewerkersDB) {
        try { await window.medewerkersDB.delete(id); }
        catch (err) { console.error("Verwijderen mislukt:", err); }
      }
    }
    rowToPurge.remove();
    rowToPurge = null;
    closePurgeModal();
    refreshEmployeesPagination();
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("deleted", deletedName ? `Medewerker “${deletedName}”` : "Medewerker", "Definitief verwijderd.");
    } else {
      showAppToast(`Medewerker${deletedName ? ` "${deletedName}"` : ""} definitief verwijderd`);
    }
  }

  tbody.addEventListener("click", (event) => {
    const pur = event.target.closest(".emp-purge-btn");
    if (!pur) return;
    event.preventDefault();
    event.stopPropagation();
    const tr = pur.closest("tr");
    if (tr) openPurgeModal(tr);
  });

  slider.addEventListener("input", syncPurgeSlider);
  confirmBtn.addEventListener("click", confirmPurge);
  cancelBtn?.addEventListener("click", closePurgeModal);
  closeBtn?.addEventListener("click", closePurgeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePurgeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    closePurgeModal();
    event.preventDefault();
  });
  syncPurgeSlider();
}

function initEmployeeRestore(tbody) {
  if (!tbody) return;
  tbody.addEventListener("click", async (event) => {
    const btn = event.target.closest(".hr-restore-btn");
    if (!btn || !tbody.contains(btn)) return;
    event.preventDefault();
    event.stopPropagation();
    const tr = btn.closest("tr");
    const id = (tr && tr.dataset.empId) || btn.getAttribute("data-emp-id") || "";
    if (!id) return;
    const items = readEmployeeItems().map((x) =>
      x.id === id ? { ...x, archived: false, laatstGewijzigd: formatDateNL() } : x
    );
    writeEmployeeItems(items);
    if (window.medewerkersDB) {
      try { await window.medewerkersDB.restore(id); }
      catch (err) { console.error("Herstellen mislukt:", err); }
    }
    loadEmployeesFromStorage(tbody);
    ensureEmployeeRowIds(tbody);
    applySavedEmployeeEditsToTable(tbody);
    persistEmployeesFromTable(tbody);
    ensureEmployeesProfileColumns();
    ensureEmployeesActionsColumn();
    applyTableFilters();
    refreshEmployeesPagination();
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("restored", "Medewerker");
    } else {
      showAppToast("Medewerker hersteld");
    }
  });
}

function initEmployeeAddModal(tbody) {
  const modal = document.getElementById("employee-add-modal");
  const openBtn = document.getElementById("employee-add-open-btn");
  const closeBtn = document.getElementById("employee-add-close-btn");
  const cancelBtn = document.getElementById("employee-add-cancel-btn");
  const form = document.getElementById("employee-add-form");
  const columnsPanelEl = document.getElementById("columns-panel");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");
  if (!modal || !openBtn || !form || !tbody) return;

  const val = (id) => document.getElementById(id)?.value?.trim() || "";

  function openModal() {
    populateSelectFromList("employee-add-competentie", getCompetentiesFromStorage(), "Selecteer Competenties");
    populateSelectFromList("employee-add-opleiding", getOpleidingenFromStorage(), "Selecteer Opleiding");
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (columnsPanelEl) columnsPanelEl.setAttribute("hidden", "");
    if (columnsMenuBtn) columnsMenuBtn.setAttribute("aria-expanded", "false");
    document.getElementById("employee-add-voornaam")?.focus();
  }

  function closeModal() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    form.reset();
    form.querySelectorAll("[aria-invalid='true']").forEach((el) => el.removeAttribute("aria-invalid"));
  }

  openBtn.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    const purgeEl = document.getElementById("employee-purge-modal");
    if (purgeEl && !purgeEl.hasAttribute("hidden")) return;
    const deleteModal = document.getElementById("employee-delete-modal");
    if (deleteModal && !deleteModal.hasAttribute("hidden")) return;
    closeModal();
    event.preventDefault();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const voornaamEl = document.getElementById("employee-add-voornaam");
    const achternaamEl = document.getElementById("employee-add-achternaam");
    const emailEl = document.getElementById("employee-add-email");
    [voornaamEl, achternaamEl, emailEl].forEach((el) => el?.removeAttribute("aria-invalid"));

    const voornaam = val("employee-add-voornaam");
    const achternaam = val("employee-add-achternaam");
    const email = val("employee-add-email");
    if (!voornaam) {
      voornaamEl?.setAttribute("aria-invalid", "true");
      voornaamEl?.focus();
      return;
    }
    if (!achternaam) {
      achternaamEl?.setAttribute("aria-invalid", "true");
      achternaamEl?.focus();
      return;
    }
    if (!email) {
      emailEl?.setAttribute("aria-invalid", "true");
      emailEl?.focus();
      return;
    }

    const verjaardag = isoToNlDate(val("employee-add-verjaardag"));
    const draft = {
      voornaam,
      achternaam,
      email,
      tel: val("employee-add-tel"),
      fase: val("employee-add-fase") || "In dienst",
      dienstverband: val("employee-add-dienstverband") || "Loondienst",
      functie: "—",
      competentie: val("employee-add-competentie") || "—",
      opleiding: val("employee-add-opleiding") || "—",
      werktype: "—",
      startdatum: formatDateNL(),
      periodiekeMaand: "—",
      eindeContract: "—",
      contracten: "1",
      contracttype: "Onbepaalde tijd",
      uitDienst: "—",
      laatstGewijzigd: formatDateNL(),
      verjaardag: verjaardag || "—",
      overigeInfo: `Medewerkernummer ${100 + tbody.querySelectorAll("tr").length + 1}`,
      taal: val("employee-add-taal") || "Nederland",
      postcode: val("employee-add-postcode"),
      huisnummer: val("employee-add-huisnummer"),
      toevoeging: val("employee-add-toevoeging"),
      straat: val("employee-add-straat"),
      plaats: val("employee-add-plaats"),
      archived: false,
    };

    let item;
    if (window.medewerkersDB) {
      try {
        item = await window.medewerkersDB.add(draft);
      } catch (err) {
        console.error("Medewerker toevoegen mislukt:", err);
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Toevoegen mislukt", err && err.message ? err.message : "Probeer het opnieuw.");
        } else {
          showAppToast("Toevoegen niet gelukt — probeer opnieuw");
        }
        return;
      }
    } else {
      item = { id: makeEmployeeId(), ...draft };
    }

    const tr = createEmployeeRow(item);
    tbody.insertBefore(tr, tbody.firstChild);
    ensureEmployeesProfileColumns();
    ensureEmployeesActionsColumn();
    persistEmployeesFromTable(tbody);
    refreshEmployeesPagination();
    closeModal();
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("added", `Medewerker “${voornaam} ${achternaam}”`);
    } else {
      showAppToast(`Medewerker "${voornaam} ${achternaam}" toegevoegd`);
    }
  });
}

function initEmployeesArchivedToggle(tbody) {
  const toggle = document.getElementById("employees-archived-toggle");
  if (!toggle || !tbody) return;
  toggle.addEventListener("change", () => {
    loadEmployeesFromStorage(tbody);
    ensureEmployeeRowIds(tbody);
    applySavedEmployeeEditsToTable(tbody);
    persistEmployeesFromTable(tbody);
    ensureEmployeesProfileColumns();
    ensureEmployeesActionsColumn();
    applyTableFilters();
    refreshEmployeesPagination();
  });
}

const tbody = document.querySelector("table.employees-table:not(.nieuws-table) tbody");
if (tbody) {
  mergeBesuBulkEmployeesOnce();
  loadEmployeesFromStorage(tbody);
  const baseRows = Array.from(tbody.querySelectorAll("tr"));
  if (baseRows.length && readEmployeeItems().length === 0) {
    persistEmployeesFromTable(tbody);
  }

  ensureEmployeeRowIds(tbody);
  applySavedEmployeeEditsToTable(tbody);
  persistEmployeesFromTable(tbody);
  ensureEmployeesProfileColumns();
  ensureEmployeesActionsColumn();
  initEmployeeAddModal(tbody);
  initEmployeeDeleteModal(tbody);
  initEmployeePurgeModal(tbody);
  initEmployeeRestore(tbody);
  initEmployeeRowNavigation(tbody);
  initEmployeesArchivedToggle(tbody);

  // Bij Supabase-bootstrap of mutatie elders: cache opnieuw inladen.
  window.addEventListener("besa:medewerkers-updated", () => {
    loadEmployeesFromStorage(tbody);
    ensureEmployeeRowIds(tbody);
    applySavedEmployeeEditsToTable(tbody);
    ensureEmployeesProfileColumns();
    ensureEmployeesActionsColumn();
    refreshEmployeesPagination();
  });
}

function initEmployeesPagination() {
  const tableBody = document.querySelector("table.employees-table:not(.nieuws-table) tbody");
  const rangeEl = document.getElementById("employees-pager-range");
  const pageLabel = document.getElementById("employees-pager-page");
  const select = document.getElementById("employees-rows-per-page");
  const btnFirst = document.getElementById("employees-pager-first");
  const btnPrev = document.getElementById("employees-pager-prev");
  const btnNext = document.getElementById("employees-pager-next");
  const btnLast = document.getElementById("employees-pager-last");
  if (!tableBody || !rangeEl || !pageLabel || !select) return;

  let currentPage = 1;
  let rowsPerPage = parseInt(select.value, 10);

  function rowIsVisible(tr) {
    return !tr.classList.contains("tr-filter-hidden");
  }

  function apply(resetPage) {
    if (resetPage) currentPage = 1;
    const allRows = Array.from(tableBody.querySelectorAll("tr"));
    const eligible = allRows.filter(rowIsVisible);
    const total = eligible.length;
    const totalPages = Math.max(1, Math.ceil(total / rowsPerPage) || 1);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, total);

    allRows.forEach((tr) => {
      if (!rowIsVisible(tr)) {
        tr.classList.remove("tr-pager-hidden");
        return;
      }
      const idx = eligible.indexOf(tr);
      if (idx === -1) return;
      const onPage = idx >= startIdx && idx < endIdx;
      tr.classList.toggle("tr-pager-hidden", !onPage);
    });

    if (total === 0) {
      rangeEl.textContent = "0 van 0";
    } else {
      rangeEl.textContent = `${startIdx + 1}–${endIdx} van ${total}`;
    }
    pageLabel.textContent = `Pagina ${currentPage} van ${totalPages}`;

    const atFirst = currentPage <= 1 || total === 0;
    const atLast = currentPage >= totalPages || total === 0;
    [btnFirst, btnPrev].forEach((b) => {
      if (b) b.disabled = atFirst;
    });
    [btnNext, btnLast].forEach((b) => {
      if (b) b.disabled = atLast;
    });
  }

  refreshEmployeesPagination = () => apply(true);
  applyEmployeesPaginationOnly = () => apply(false);

  select.addEventListener("change", () => {
    rowsPerPage = parseInt(select.value, 10);
    apply(true);
  });

  btnFirst?.addEventListener("click", () => {
    currentPage = 1;
    apply(false);
  });
  btnPrev?.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    apply(false);
  });
  btnNext?.addEventListener("click", () => {
    const eligible = Array.from(tableBody.querySelectorAll("tr")).filter(rowIsVisible);
    const totalPages = Math.max(1, Math.ceil(eligible.length / rowsPerPage));
    currentPage = Math.min(currentPage + 1, totalPages);
    apply(false);
  });
  btnLast?.addEventListener("click", () => {
    const eligible = Array.from(tableBody.querySelectorAll("tr")).filter(rowIsVisible);
    const totalPages = Math.max(1, Math.ceil(eligible.length / rowsPerPage));
    currentPage = totalPages;
    apply(false);
  });

  apply(true);
}

initEmployeesPagination();

const columnsBtn = document.getElementById("columns-menu-btn");
const columnsPanel = document.getElementById("columns-panel");

function setColumnVisible(colId, visible) {
  document.querySelectorAll(`.employees-table [data-col="${colId}"]`).forEach((cell) => {
    cell.classList.toggle("col-hidden", !visible);
  });
}

function syncColumnVisibilityFromMenu() {
  document.querySelectorAll(".column-toggle").forEach((btn) => {
    const colId = btn.dataset.col;
    const visible = btn.classList.contains("is-checked");
    btn.setAttribute("aria-checked", visible);
    setColumnVisible(colId, visible);
  });
}

document.querySelectorAll(".column-toggle").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    btn.classList.toggle("is-checked");
    const visible = btn.classList.contains("is-checked");
    btn.setAttribute("aria-checked", visible);
    setColumnVisible(btn.dataset.col, visible);
  });
});

function closeAllSortMenus() {
  document.querySelectorAll(".th-sort-menu").forEach((m) => m.setAttribute("hidden", ""));
  document.querySelectorAll(".th-sort-trigger").forEach((t) => t.setAttribute("aria-expanded", "false"));
  document.querySelectorAll("thead th.th-sort").forEach((th) => th.classList.remove("th-sort-open"));
}

if (columnsBtn && columnsPanel) {
  columnsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !columnsPanel.hasAttribute("hidden");
    if (isOpen) {
      columnsPanel.setAttribute("hidden", "");
      columnsBtn.setAttribute("aria-expanded", "false");
    } else {
      columnsPanel.removeAttribute("hidden");
      columnsBtn.setAttribute("aria-expanded", "true");
    }
  });

  columnsPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", () => {
    columnsPanel.setAttribute("hidden", "");
    columnsBtn.setAttribute("aria-expanded", "false");
    closeAllSortMenus();
    closeAllFilterPanels();
    closeHeaderActionsOverflow();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      columnsPanel.setAttribute("hidden", "");
      columnsBtn.setAttribute("aria-expanded", "false");
      closeAllSortMenus();
      closeAllFilterPanels();
      closeHeaderActionsOverflow();
    }
  });
}

syncColumnVisibilityFromMenu();

function closeAllFilterPanels() {
  const pf = document.getElementById("panel-functie-filter");
  const po = document.getElementById("panel-opleiding-filter");
  const bf = document.getElementById("btn-functie-filter");
  const bo = document.getElementById("btn-opleiding-filter");
  if (pf) pf.setAttribute("hidden", "");
  if (po) po.setAttribute("hidden", "");
  bf?.classList.remove("is-panel-open");
  bo?.classList.remove("is-panel-open");
  bf?.setAttribute("aria-expanded", "false");
  bo?.setAttribute("aria-expanded", "false");
}

function getCellSortText(colId, row) {
  const cell = row.querySelector(`td[data-col="${colId}"]`);
  if (!cell) return "";
  return cell.textContent.replace(/\s+/g, " ").trim();
}

/** DD-MM-JJJJ → timestamp voor chronologische sortering */
function parseNlDate(str) {
  if (!str || str === "—") return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str.trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

function compareSortValues(colId, ta, tb) {
  const dateCols = ["startdatum", "einde-contract", "laatst-gewijzigd"];
  if (dateCols.includes(colId)) {
    const da = parseNlDate(ta);
    const db = parseNlDate(tb);
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    return 0;
  }
  if (colId === "contracten") {
    const na = parseInt(ta, 10);
    const nb = parseInt(tb, 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  }
  return ta.localeCompare(tb, "nl", { sensitivity: "base", numeric: true });
}

function sortTableByColumn(colId, direction) {
  const tableBody = document.querySelector("table.employees-table:not(.nieuws-table) tbody");
  if (!tableBody) return;
  const rows = Array.from(tableBody.querySelectorAll("tr"));
  const factor = direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const ta = getCellSortText(colId, a);
    const tb = getCellSortText(colId, b);
    return compareSortValues(colId, ta, tb) * factor;
  });
  rows.forEach((row) => tableBody.appendChild(row));
  applyEmployeesPaginationOnly();
}

/** Toont één pijl (↑ asc / ↓ desc) bij de actieve kolom; andere kolommen tonen weer ⇅ */
function setSortIndicator(colId, direction) {
  document.querySelectorAll("thead th.th-sort").forEach((th) => {
    th.classList.remove("th-sort--asc", "th-sort--desc");
    th.removeAttribute("aria-sort");
  });
  const th = document.querySelector(`thead th.th-sort[data-col="${colId}"]`);
  if (!th || !direction) return;
  if (direction === "asc") {
    th.classList.add("th-sort--asc");
    th.setAttribute("aria-sort", "ascending");
  } else {
    th.classList.add("th-sort--desc");
    th.setAttribute("aria-sort", "descending");
  }
}

function hideColumnFromSortMenu(colId) {
  setColumnVisible(colId, false);
  const toggle = document.querySelector(`.column-toggle[data-col="${colId}"]`);
  if (toggle) {
    toggle.classList.remove("is-checked");
    toggle.setAttribute("aria-checked", "false");
  }
}

document.querySelectorAll("thead th.th-sort").forEach((th) => {
  const colId = th.dataset.col;
  const trigger = th.querySelector(".th-sort-trigger");
  const menu = th.querySelector(".th-sort-menu");
  if (!trigger || !menu || !colId) return;

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const wasOpen = !menu.hasAttribute("hidden");
    closeAllSortMenus();
    if (!wasOpen) {
      menu.removeAttribute("hidden");
      trigger.setAttribute("aria-expanded", "true");
      th.classList.add("th-sort-open");
    }
  });

  menu.addEventListener("click", (event) => event.stopPropagation());

  menu.querySelectorAll(".th-sort-opt").forEach((opt) => {
    opt.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = opt.dataset.action;
      if (action === "asc") {
        sortTableByColumn(colId, "asc");
        setSortIndicator(colId, "asc");
      } else if (action === "desc") {
        sortTableByColumn(colId, "desc");
        setSortIndicator(colId, "desc");
      } else if (action === "hide") {
        const hadSort =
          th.classList.contains("th-sort--asc") || th.classList.contains("th-sort--desc");
        hideColumnFromSortMenu(colId);
        if (hadSort) {
          document.querySelectorAll("thead th.th-sort").forEach((h) => {
            h.classList.remove("th-sort--asc", "th-sort--desc");
            h.removeAttribute("aria-sort");
          });
        }
      }
      closeAllSortMenus();
    });
  });
});

function applyTableFilters() {
  // Module 04 Bug #18 fix: toolbar search-input filtert nu medewerker-rijen
  // op voornaam/achternaam/email/functie/locatie. Geen event-listener was
  // gebonden — typing deed niets.
  const searchInput = document.querySelector(".toolbar input.search, .toolbar input[type=search]");
  const searchQ = (searchInput && searchInput.value || "").trim().toLowerCase();
  document.querySelectorAll("table.employees-table:not(.nieuws-table) tbody tr").forEach((tr) => {
    const empId = tr.dataset && tr.dataset.empId;
    let emp = null;
    if (empId && window.medewerkersDB && typeof window.medewerkersDB.getByIdSync === "function") {
      try { emp = window.medewerkersDB.getByIdSync(empId); } catch (e) { /* */ }
    }
    if (!emp && empId) {
      // Fallback: lokale items (oudere data-flow vóór Stage 6).
      try { emp = readEmployeeItems().find((x) => x.id === empId) || null; } catch (e) { /* */ }
    }

    // Search-input filter: match op voornaam/achternaam/email/functie/locatie
    if (searchQ) {
      const data = emp || {};
      const dataExt = data.data || data._data || {};
      const haystack = [
        data.voornaam, data.achternaam, data.email,
        dataExt.functie, dataExt.locatie, dataExt.dienstverband,
        dataExt.werktype, dataExt.contracttype, dataExt.fase,
        dataExt.bureau, dataExt.telefoon
      ].filter(Boolean).join(" ").toLowerCase();
      if (haystack.indexOf(searchQ) === -1) {
        tr.classList.add("tr-filter-hidden");
        return;
      }
    }

    // DOM-based filters (kolommen bestaan in tabel) — Functie + Opleiding.
    const cellF = tr.querySelector('td[data-col="functie"]');
    const cellO = tr.querySelector('td[data-col="opleiding"]');
    const okF = !filterFunctie || (cellF && cellF.textContent.trim() === filterFunctie);
    const okO = !filterOpleiding || (cellO && cellO.textContent.trim() === filterOpleiding);

    // Data-based filters voor 6 nieuwe chips. Lege filter = match.
    const data = emp || {};
    // Competentie kan singular (string) OF plural (array) zijn afhankelijk
    // van data-bron — accepteer beide.
    const empCompList = Array.isArray(data.competenties) ? data.competenties
      : (data.competentie ? [data.competentie] : []);
    // Locatie/bureau: kan in jsonb 'data', oude '_data', of als losse velden zitten.
    const dataExt = data.data || data._data || {};
    const empLoc = data.locatie || dataExt.locatie || (Array.isArray(dataExt.locaties) && dataExt.locaties[0]) || "";
    const empBur = data.bureau || dataExt.bureau || (Array.isArray(dataExt.bureaus) && dataExt.bureaus[0]) || "";
    // Locaties/bureaus kan ook array zijn — accepteer ook array contains.
    const locList = Array.isArray(dataExt.locaties) ? dataExt.locaties
      : (Array.isArray(data.locaties) ? data.locaties : (empLoc ? [empLoc] : []));
    const burList = Array.isArray(dataExt.bureaus) ? dataExt.bureaus
      : (Array.isArray(data.bureaus) ? data.bureaus : (empBur ? [empBur] : []));

    const okLoc = !filterLocatie || locList.indexOf(filterLocatie) !== -1;
    const okBur = !filterBureau || burList.indexOf(filterBureau) !== -1;
    const okCT = !filterContracttype || data.contracttype === filterContracttype;
    const okFs = !filterFase || (data.fase || "").trim() === filterFase;
    const okDV = !filterDienstverband || data.dienstverband === filterDienstverband;
    const okCp = !filterCompetentie || empCompList.indexOf(filterCompetentie) !== -1;

    tr.classList.toggle("tr-filter-hidden", !(okF && okO && okLoc && okBur && okCT && okFs && okDV && okCp));
  });
  refreshEmployeesPagination();
}

/**
 * Initialiseer de 6 simpele filter-chips (Locatie, Bureau, Contracttype, Fase,
 * Dienstverband, Competenties) via window.besaFilterChips.createSearchSelectChip.
 * Opties komen uit:
 *   - locatiesDB / bureausDB / competentiesDB (live Supabase-data)
 *   - unieke waarden uit medewerkersDB voor Contracttype/Fase/Dienstverband
 *
 * Wordt aangeroepen na medewerker- en lookup-data-bootstrap, en re-runt
 * automatisch bij relevante updates zodat verse data direct in de chips zit.
 */
function initEmployeeChips() {
  if (!window.besaFilterChips || typeof window.besaFilterChips.createSearchSelectChip !== "function") return;

  // Filter ook lege placeholders ("—", "-", "n.v.t.") en orphan-achtige
  // strings (bv. base64 / "[object" rommel) eruit, zodat de dropdown alleen
  // bruikbare opties toont.
  const isPlaceholder = (s) => !s || /^[—–\-]+$/.test(s) || s === "n.v.t." || s === "—" ||
    /^\[(object|BLOCKED)/i.test(s) || /^[A-Za-z0-9+/=]{40,}$/.test(s);
  const dedupSorted = (arr) => [...new Set(
    arr.filter(Boolean).map((s) => String(s).trim()).filter((s) => s && !isPlaceholder(s))
  )].sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));

  const allEmps = (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function")
    ? window.medewerkersDB.getAllSync() || []
    : [];

  const optsFromDB = (db, key) => {
    const items = (db && typeof db.getAllSync === "function") ? db.getAllSync() || [] : [];
    return dedupSorted(items.filter((i) => i && !i.archived).map((i) => i[key] || "")).map((v) => ({ value: v, label: v }));
  };
  const optsFromEmp = (key) => dedupSorted(allEmps.map((e) => e && e[key])).map((v) => ({ value: v, label: v }));

  const wireOne = (btnId, label, options, setter, clearLabel) => {
    const btn = document.getElementById(btnId);
    if (!btn) return null;
    // Voorkom dubbele init bij re-run: detecteer aanwezige wrap.
    if (btn.dataset.chipInited === "1") return null;
    btn.dataset.chipInited = "1";
    return window.besaFilterChips.createSearchSelectChip({
      button: btn,
      label: label,
      options: options,
      clearLabel: clearLabel,
      onChange: (v) => { setter(v || null); applyTableFilters(); },
    });
  };

  wireOne("filter-chip-locatie", "Locatie",
    optsFromDB(window.locatiesDB, "naam"),
    (v) => { filterLocatie = v; }, "Alle locaties tonen");
  wireOne("filter-chip-bureau", "Bureau",
    optsFromDB(window.bureausDB, "naam"),
    (v) => { filterBureau = v; }, "Alle bureaus tonen");
  wireOne("filter-chip-contracttype", "Contracttype",
    optsFromEmp("contracttype"),
    (v) => { filterContracttype = v; }, "Alle contracttypes tonen");
  wireOne("filter-chip-fase", "Fase",
    optsFromEmp("fase"),
    (v) => { filterFase = v; }, "Alle fases tonen");
  wireOne("filter-chip-dienstverband", "Dienstverband",
    optsFromEmp("dienstverband"),
    (v) => { filterDienstverband = v; }, "Alle dienstverbanden tonen");
  wireOne("filter-chip-competenties", "Competenties",
    optsFromDB(window.competentiesDB, "naam"),
    (v) => { filterCompetentie = v; }, "Alle competenties tonen");
}

// Init zodra alle data-lagen bootstrappped zijn. We luisteren op de relevante
// 'besa:*-updated' events zodat nieuwe locaties/bureaus/competenties direct in
// de chips komen zonder pagina-refresh. Eerste init: zodra de eerste relevante
// update binnenkomt OF na DOMContentLoaded met een korte vertraging.
function setupChipsInitialization() {
  let inited = false;
  const tryInit = () => {
    if (inited) return;
    if (typeof initEmployeeChips !== "function") return;
    initEmployeeChips();
    // Markeer als geslaagd zodra alle 6 chips een wrap hebben gekregen.
    const allWrapped = ["locatie", "bureau", "contracttype", "fase", "dienstverband", "competenties"]
      .every((k) => {
        const b = document.getElementById("filter-chip-" + k);
        return b && b.parentNode && b.parentNode.classList.contains("filter-dropdown-wrap");
      });
    if (allWrapped) inited = true;
  };
  ["besa:locaties-updated", "besa:bureaus-updated", "besa:competenties-updated", "besa:medewerkers-updated"].forEach((ev) => {
    window.addEventListener(ev, tryInit);
  });
  // Initiële poging na DOMContentLoaded + kleine vertraging zodat data-lagen klaar zijn.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(tryInit, 200));
  } else {
    setTimeout(tryInit, 200);
  }
}
setupChipsInitialization();

function applyFunctieFilter(selectedLabel) {
  filterFunctie = selectedLabel;
  document.querySelectorAll(".filter-functie-option").forEach((opt) => {
    opt.classList.toggle("is-selected", opt.dataset.functie === selectedLabel);
  });
  applyTableFilters();
  const btn = document.getElementById("btn-functie-filter");
  if (btn) {
    btn.classList.toggle("is-active", Boolean(selectedLabel));
  }
}

function applyOpleidingFilter(selectedLabel) {
  filterOpleiding = selectedLabel;
  document.querySelectorAll(".filter-opleiding-option").forEach((opt) => {
    opt.classList.toggle("is-selected", opt.dataset.opleiding === selectedLabel);
  });
  applyTableFilters();
  const btn = document.getElementById("btn-opleiding-filter");
  if (btn) {
    btn.classList.toggle("is-active", Boolean(selectedLabel));
  }
}

function initFunctieFilter() {
  const list = document.getElementById("list-functie-options");
  const panel = document.getElementById("panel-functie-filter");
  const btn = document.getElementById("btn-functie-filter");
  const search = document.getElementById("input-functie-search");
  if (!list || !panel || !btn) return;

  FUNCTIE_OPTIONS.forEach((label) => {
    const li = document.createElement("li");
    const optBtn = document.createElement("button");
    optBtn.type = "button";
    optBtn.className = "filter-functie-option";
    optBtn.textContent = label;
    optBtn.dataset.functie = label;
    optBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyFunctieFilter(label);
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-panel-open");
    });
    li.appendChild(optBtn);
    list.appendChild(li);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
      closeAllFilterPanels();
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("is-panel-open");
    } else {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-panel-open");
    }
  });

  if (search) {
    search.addEventListener("click", (e) => e.stopPropagation());
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll(".filter-functie-option").forEach((opt) => {
        const t = opt.textContent.toLowerCase();
        opt.hidden = q !== "" && !t.includes(q);
      });
    });
  }

  const clearBtn = document.getElementById("btn-functie-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyFunctieFilter(null);
      if (search) search.value = "";
      list.querySelectorAll(".filter-functie-option").forEach((opt) => {
        opt.hidden = false;
      });
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-panel-open");
    });
  }

  panel.addEventListener("click", (e) => e.stopPropagation());
}

function initOpleidingFilter() {
  const list = document.getElementById("list-opleiding-options");
  const panel = document.getElementById("panel-opleiding-filter");
  const btn = document.getElementById("btn-opleiding-filter");
  const search = document.getElementById("input-opleiding-search");
  if (!list || !panel || !btn) return;

  var dynamicOpl = getOpleidingenFromStorage();
  var allOplOptions = [...new Set([...OPLEIDING_OPTIONS, ...dynamicOpl])].sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
  allOplOptions.forEach((label) => {
    const li = document.createElement("li");
    const optBtn = document.createElement("button");
    optBtn.type = "button";
    optBtn.className = "filter-opleiding-option";
    optBtn.textContent = label;
    optBtn.dataset.opleiding = label;
    optBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyOpleidingFilter(label);
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-panel-open");
    });
    li.appendChild(optBtn);
    list.appendChild(li);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
      closeAllFilterPanels();
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("is-panel-open");
    } else {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-panel-open");
    }
  });

  if (search) {
    search.addEventListener("click", (e) => e.stopPropagation());
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll(".filter-opleiding-option").forEach((opt) => {
        const t = opt.textContent.toLowerCase();
        opt.hidden = q !== "" && !t.includes(q);
      });
    });
  }

  const clearBtn = document.getElementById("btn-opleiding-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyOpleidingFilter(null);
      if (search) search.value = "";
      list.querySelectorAll(".filter-opleiding-option").forEach((opt) => {
        opt.hidden = false;
      });
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-panel-open");
    });
  }

  panel.addEventListener("click", (e) => e.stopPropagation());
}

initFunctieFilter();
initOpleidingFilter();

// Module 04 Bug #18 fix: bind toolbar search-input → applyTableFilters
(function initEmployeeSearchInput() {
  function attach() {
    const searchInput = document.querySelector(".toolbar input.search, .toolbar input[type=search]");
    if (!searchInput || searchInput.dataset.bound === "1") return;
    searchInput.dataset.bound = "1";
    searchInput.addEventListener("input", function () {
      try { applyTableFilters(); } catch (e) { /* */ }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
  // Re-try na korte delay als toolbar later in render is ingevoegd
  setTimeout(attach, 500);
})();

function closeHeaderActionsOverflow() {
  const panel = document.getElementById("header-actions-overflow-panel");
  const btn = document.getElementById("header-actions-overflow-btn");
  if (panel) panel.setAttribute("hidden", "");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function initHeaderActionsOverflow() {
  const toggle = document.getElementById("header-actions-overflow-btn");
  const panel = document.getElementById("header-actions-overflow-panel");
  const colItem = document.getElementById("header-actions-overflow-col");
  const exportItem = document.getElementById("header-actions-overflow-export");
  const addItem = document.getElementById("header-actions-overflow-add");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");
  const exportBtn = document.getElementById("employee-export-btn");
  const addBtn = document.getElementById("employee-add-open-btn");
  if (!toggle || !panel) return;

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = !panel.hasAttribute("hidden");
    if (open) {
      closeHeaderActionsOverflow();
    } else {
      panel.removeAttribute("hidden");
      toggle.setAttribute("aria-expanded", "true");
    }
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  colItem?.addEventListener("click", (event) => {
    event.stopPropagation();
    closeHeaderActionsOverflow();
    columnsMenuBtn?.click();
  });

  exportItem?.addEventListener("click", (event) => {
    event.stopPropagation();
    closeHeaderActionsOverflow();
    exportBtn?.click();
  });

  addItem?.addEventListener("click", (event) => {
    event.stopPropagation();
    closeHeaderActionsOverflow();
    addBtn?.click();
  });
}

initHeaderActionsOverflow();

// ---------------------------------------------------------------------------
// Medewerker export (CSV/TXT/Excel/PDF) via besa-export.js
// ---------------------------------------------------------------------------
function initEmployeeExport() {
  const btn = document.getElementById("employee-export-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (typeof window.besaExport !== "function") {
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", "Export-helper niet geladen");
      }
      return;
    }
    const all = window.medewerkersDB ? window.medewerkersDB.getAllSync() : [];
    const data = all.filter((m) => m && !m.archived).map((m) => ({
      "Voornaam": m.voornaam || "",
      "Achternaam": m.achternaam || "",
      "E-mailadres": m.email || "",
      "Telefoon": m.telefoon || m.tel || "",
      "Fase": m.fase || "",
      "Dienstverband": m.dienstverband || "",
      "Functie": m.functie || "",
      "Opleiding": Array.isArray(m.opleidingen) ? m.opleidingen.join(", ") : (m.opleiding || ""),
      "Contracttype": m.contracttype || "",
      "Werktype": m.werktype || "",
      "Startdatum": m.startdatum || "",
      "Einde contract": m.einddatum || m.eindeContract || "",
    }));
    window.besaExport({
      filename: "medewerkers",
      title: "Medewerkers",
      columns: ["Voornaam", "Achternaam", "E-mailadres", "Telefoon", "Fase", "Dienstverband", "Functie", "Opleiding", "Contracttype", "Werktype", "Startdatum", "Einde contract"],
      data,
    });
  });
}
initEmployeeExport();
