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
    /* Navigatie naar echte pagina's (bijv. index.html) niet blokkeren */
  });
});

const tableSel = "table.nieuws-table";
let refreshNewsPagination = () => {};
let applyNewsPaginationOnly = () => {};
let syncNewsSelectAllHeader = () => {};
const columnsBtn = document.getElementById("columns-menu-btn");
const columnsPanel = document.getElementById("columns-panel");

// --- Supabase data-laag wrappers --------------------------------------------
// nieuwsDB komt uit nieuws-data.js. Source of truth: tabel public.nieuws.
// Lokale "newsItems"-key wordt eenmalig gemigreerd door de data-laag.

function getNieuwsDB() {
  return (typeof window !== "undefined" && window.nieuwsDB) || null;
}

function readNewsItems() {
  const db = getNieuwsDB();
  if (!db) return [];
  try { return db.getAllSync() || []; } catch { return []; }
}

function reportNewsError(action, err) {
  const msg = err && err.message ? err.message : String(err || "onbekende fout");
  console.error(`[nieuws] ${action} mislukt:`, err);
  if (typeof window.showSaveModal === "function") {
    window.showSaveModal({ title: `Opslaan in database mislukt`, message: msg });
  } else {
    showNewsToast(`Opslaan mislukt: ${msg}`);
  }
}

function makeTempNewsId() {
  // Tijdelijke client-side id voor optimistic UI tot Supabase een UUID retourneert.
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getNewsTableBody() {
  return document.querySelector(`${tableSel} tbody`);
}

function rowToNewsItem(tr) {
  if (!tr) return null;
  if (!tr.dataset.newsId) tr.dataset.newsId = makeTempNewsId();
  const titel = tr.querySelector('td[data-col="titel"]')?.textContent?.trim() || "";
  if (!titel) return null;
  const status = tr.querySelector('td[data-col="status"] .status-pill')?.textContent?.trim() || "Published";
  const aanmaakdatum = tr.querySelector('td[data-col="aanmaakdatum"]')?.textContent?.trim() || formatNlDateTimeNow();
  const inhoud = tr.getAttribute("data-news-inhoud") || "";
  const auteur = tr.dataset.newsAuthor?.trim() || "HR team";
  const item = {
    id: tr.dataset.newsId,
    titel,
    status,
    aanmaakdatum,
    auteur,
    inhoud,
    archived: tr.dataset.newsArchived === "1",
  };
  if (tr.dataset.newsImage) item.image = tr.dataset.newsImage;
  if (tr.dataset.newsImage2) item.image2 = tr.dataset.newsImage2;
  return item;
}

function createNewsRow(item, isArchivedView = false) {
  const tr = document.createElement("tr");
  tr.dataset.newsId = item.id || makeTempNewsId();
  if (item.inhoud) tr.setAttribute("data-news-inhoud", item.inhoud);
  if (item.auteur) tr.dataset.newsAuthor = item.auteur;
  if (item.image) tr.dataset.newsImage = item.image;
  if (item.image2) tr.dataset.newsImage2 = item.image2;
  if (item.archived) tr.dataset.newsArchived = "1";

  const tdSel = document.createElement("td");
  tdSel.setAttribute("data-col", "select");
  tdSel.innerHTML = '<input type="checkbox" class="table-checkbox" aria-label="Selecteer rij" />';

  const tdTitel = document.createElement("td");
  tdTitel.setAttribute("data-col", "titel");
  const link = document.createElement("a");
  link.href = "#";
  link.className = "news-title-link";
  link.textContent = item.titel || "";
  tdTitel.appendChild(link);

  const tdStatus = document.createElement("td");
  tdStatus.setAttribute("data-col", "status");
  tdStatus.innerHTML = `<span class="status-pill">${item.status || "Published"}</span>`;

  const tdDatum = document.createElement("td");
  tdDatum.setAttribute("data-col", "aanmaakdatum");
  tdDatum.textContent = formatNlDateTimeFromAny(item.aanmaakdatum);

  tr.append(tdSel, tdTitel, tdStatus, tdDatum, createNewsActiesCell(!!isArchivedView));
  return tr;
}

const NEWS_TRASH_SVG =
  '<svg class="news-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

function createNewsActiesCell(isArchivedView) {
  const td = document.createElement("td");
  td.setAttribute("data-col", "acties");
  if (isArchivedView) {
    td.classList.add("news-td-acties");
    const wrap = document.createElement("div");
    wrap.className = "hr-row-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn-outline hr-restore-btn";
    restore.textContent = "Herstel";
    const purge = document.createElement("button");
    purge.type = "button";
    purge.className = "news-delete-btn news-purge-btn";
    purge.setAttribute("aria-label", "Definitief verwijderen");
    purge.innerHTML = NEWS_TRASH_SVG;
    wrap.appendChild(restore);
    wrap.appendChild(purge);
    td.appendChild(wrap);
  } else {
    td.innerHTML = `<button type="button" class="news-delete-btn news-archive-btn" aria-label="Nieuwsbericht archiveren">${NEWS_TRASH_SVG}</button>`;
  }
  return td;
}

// persistTableToNewsStorage is een no-op geworden: de DOM is geen source of truth
// meer. Toegevoegde / gewijzigde items gaan direct via nieuwsDB naar Supabase
// en de tabel wordt herbouwd uit de cache na elk besa:nieuws-updated event.
function persistTableToNewsStorage() { /* no-op - data zit in Supabase via nieuwsDB */ }

// Voegt een nieuw item toe (als het nog geen serverside-id heeft) of werkt een
// bestaand item bij. Retourneert de bewaarde rij (met definitieve uuid).
async function upsertNewsItem(item) {
  if (!item) return null;
  const db = getNieuwsDB();
  if (!db) {
    reportNewsError("opslaan", new Error("Supabase data-laag (nieuwsDB) niet geladen."));
    return null;
  }
  const isExistingServerRow = item.id && !String(item.id).startsWith("tmp-") && !String(item.id).startsWith("news-");
  try {
    if (isExistingServerRow) {
      return await db.update(item.id, item);
    }
    // Nieuwe rij: client-id (tmp/legacy) wegfilteren zodat Supabase een uuid kiest.
    const { id: _drop, ...rest } = item;
    return await db.add(rest);
  } catch (err) {
    reportNewsError("opslaan", err);
    return null;
  }
}

async function archiveNewsItem(id) {
  if (!id) return;
  const db = getNieuwsDB();
  if (!db) { reportNewsError("archiveren", new Error("nieuwsDB niet geladen.")); return; }
  try { await db.archive(id); }
  catch (err) { reportNewsError("archiveren", err); }
}

async function deleteNewsItem(id) {
  if (!id) return;
  const db = getNieuwsDB();
  if (!db) { reportNewsError("verwijderen", new Error("nieuwsDB niet geladen.")); return; }
  try { await db.delete(id); }
  catch (err) { reportNewsError("verwijderen", err); }
}

async function restoreNewsItem(id) {
  if (!id) return;
  const db = getNieuwsDB();
  if (!db) { reportNewsError("herstellen", new Error("nieuwsDB niet geladen.")); return; }
  try { await db.restore(id); }
  catch (err) { reportNewsError("herstellen", err); }
}

let newsAppToastTimer = null;
function showNewsToast(message) {
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
  if (newsAppToastTimer) window.clearTimeout(newsAppToastTimer);
  newsAppToastTimer = window.setTimeout(() => {
    toast?.classList.remove("is-visible");
  }, 2800);
}

function loadNewsTableFromStorage() {
  const tableBody = getNewsTableBody();
  if (!tableBody) return;
  const archivedToggle = document.getElementById("news-archived-toggle");
  const showArchived = archivedToggle ? archivedToggle.checked : false;
  const stored = readNewsItems();

  tableBody.innerHTML = "";
  stored
    .filter((item) => (showArchived ? item.archived === true : !item.archived))
    .forEach((item) => {
      tableBody.appendChild(createNewsRow(item, showArchived));
    });
}

function setColumnVisible(colId, visible) {
  document.querySelectorAll(`${tableSel} [data-col="${colId}"]`).forEach((cell) => {
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
  document.querySelectorAll(`${tableSel} .th-sort-menu`).forEach((m) => m.setAttribute("hidden", ""));
  document.querySelectorAll(`${tableSel} .th-sort-trigger`).forEach((t) => t.setAttribute("aria-expanded", "false"));
  document.querySelectorAll(`${tableSel} thead th.th-sort`).forEach((th) => th.classList.remove("th-sort-open"));
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
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      columnsPanel.setAttribute("hidden", "");
      columnsBtn.setAttribute("aria-expanded", "false");
      closeAllSortMenus();
    }
  });
}

syncColumnVisibilityFromMenu();

function getCellSortText(colId, row) {
  const cell = row.querySelector(`td[data-col="${colId}"]`);
  if (!cell) return "";
  return cell.textContent.replace(/\s+/g, " ").trim();
}

function applyNewsSearch() {
  const input = document.getElementById("news-search-input");
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  document.querySelectorAll(`${tableSel} tbody tr`).forEach((tr) => {
    const titel = getCellSortText("titel", tr);
    const status = getCellSortText("status", tr);
    const datum = getCellSortText("aanmaakdatum", tr);
    const haystack = `${titel} ${status} ${datum}`.toLowerCase();
    const match = q === "" || haystack.includes(q);
    tr.classList.toggle("tr-news-search-hidden", !match);
  });
  refreshNewsPagination();
  syncNewsSelectAllHeader();
}

function parseNlDateTime(str) {
  if (!str || str === "—") return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}

function compareSortValues(colId, ta, tb) {
  if (colId === "aanmaakdatum") {
    const da = parseNlDateTime(ta);
    const db = parseNlDateTime(tb);
    if (da != null && db != null) return da - db;
    if (da != null) return -1;
    if (db != null) return 1;
    return 0;
  }
  return ta.localeCompare(tb, "nl", { sensitivity: "base", numeric: true });
}

function sortTableByColumn(colId, direction) {
  const tableBody = document.querySelector(`${tableSel} tbody`);
  if (!tableBody) return;
  const rows = Array.from(tableBody.querySelectorAll("tr"));
  const factor = direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const ta = getCellSortText(colId, a);
    const tb = getCellSortText(colId, b);
    return compareSortValues(colId, ta, tb) * factor;
  });
  rows.forEach((row) => tableBody.appendChild(row));
  applyNewsPaginationOnly();
}

function setSortIndicator(colId, direction) {
  document.querySelectorAll(`${tableSel} thead th.th-sort`).forEach((th) => {
    th.classList.remove("th-sort--asc", "th-sort--desc");
    th.removeAttribute("aria-sort");
  });
  const th = document.querySelector(`${tableSel} thead th.th-sort[data-col="${colId}"]`);
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

document.querySelectorAll(`${tableSel} thead th.th-sort`).forEach((th) => {
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
          document.querySelectorAll(`${tableSel} thead th.th-sort`).forEach((h) => {
            h.classList.remove("th-sort--asc", "th-sort--desc");
            h.removeAttribute("aria-sort");
          });
        }
      }
      closeAllSortMenus();
    });
  });
});

function initNewsSelectAll() {
  const selectAll = document.getElementById("news-select-all");
  const tableBody = document.querySelector(`${tableSel} tbody`);
  if (!selectAll || !tableBody) return;

  function rowIsSelectable(tr) {
    return !tr.classList.contains("tr-pager-hidden") && !tr.classList.contains("tr-news-search-hidden");
  }

  function getSelectableCheckboxes() {
    return Array.from(tableBody.querySelectorAll("tr"))
      .filter(rowIsSelectable)
      .map((tr) => tr.querySelector('td[data-col="select"] input.table-checkbox'))
      .filter(Boolean);
  }

  function syncHeaderFromRows() {
    const boxes = getSelectableCheckboxes();
    if (boxes.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }
    const checked = boxes.filter((c) => c.checked).length;
    selectAll.checked = checked === boxes.length && boxes.length > 0;
    selectAll.indeterminate = checked > 0 && checked < boxes.length;
  }

  syncNewsSelectAllHeader = syncHeaderFromRows;

  selectAll.addEventListener("change", () => {
    const on = selectAll.checked;
    getSelectableCheckboxes().forEach((cb) => {
      cb.checked = on;
    });
    selectAll.indeterminate = false;
  });

  tableBody.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;
    if (!t.closest('td[data-col="select"]')) return;
    syncHeaderFromRows();
  });
}

function initNewsPagination() {
  const tableBody = document.querySelector(`${tableSel} tbody`);
  const rangeEl = document.getElementById("news-pager-range");
  const pageLabel = document.getElementById("news-pager-page");
  const select = document.getElementById("news-rows-per-page");
  const btnFirst = document.getElementById("news-pager-first");
  const btnPrev = document.getElementById("news-pager-prev");
  const btnNext = document.getElementById("news-pager-next");
  const btnLast = document.getElementById("news-pager-last");
  if (!tableBody || !rangeEl || !pageLabel || !select) return;

  let currentPage = 1;
  let rowsPerPage = parseInt(select.value, 10);

  function rowIsVisible(tr) {
    return !tr.classList.contains("tr-news-search-hidden");
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

    syncNewsSelectAllHeader();
  }

  refreshNewsPagination = () => apply(true);
  applyNewsPaginationOnly = () => apply(false);

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

loadNewsTableFromStorage();
const newsArchivedToggle = document.getElementById("news-archived-toggle");
if (newsArchivedToggle) {
  newsArchivedToggle.addEventListener("change", () => {
    loadNewsTableFromStorage();
    applyNewsSearch();
    refreshNewsPagination();
  });
}
initNewsSelectAll();
initNewsPagination();

const newsSearchInput = document.getElementById("news-search-input");
if (newsSearchInput) {
  newsSearchInput.addEventListener("input", applyNewsSearch);
}

function formatNlDateTimeNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Formatteert een ISO-string of legacy "dd-mm-yyyy hh:mm" naar "dd-mm-yyyy hh:mm".
// Lege/ongeldige input → huidige tijd.
function formatNlDateTimeFromAny(value) {
  if (!value) return formatNlDateTimeNow();
  if (typeof value === "string" && /^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (!isFinite(d.getTime())) return formatNlDateTimeNow();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getPreferredUserName() {
  try {
    const explicitName = (window.localStorage.getItem("currentUserName") || "").trim();
    if (explicitName) return explicitName;

    const selectedEmployeeRaw = window.sessionStorage.getItem("selectedEmployee");
    if (selectedEmployeeRaw) {
      const selectedEmployee = JSON.parse(selectedEmployeeRaw);
      const first = (selectedEmployee?.voornaam || "").trim();
      const last = (selectedEmployee?.achternaam || "").trim();
      const full = `${first} ${last}`.trim();
      if (full) return full;
      if (first) return first;
    }
  } catch {
    // Ignore malformed session/local storage values.
  }
  return "HR team";
}

function initNewsAddModal() {
  const modal = document.getElementById("news-add-modal");
  const openBtn = document.getElementById("news-add-open-btn");
  const closeBtn = document.getElementById("news-add-close-btn");
  const cancelBtn = document.getElementById("news-add-cancel-btn");
  const form = document.getElementById("news-add-form");
  const naamInput = document.getElementById("news-add-naam");
  const auteurInput = document.getElementById("news-add-auteur");
  const editor = document.getElementById("news-add-inhoud");
  const imageInput = document.getElementById("news-add-image-input");
  const imagePreview = document.getElementById("news-add-image-preview");
  const imageZone = document.querySelector(".news-add-image-zone");
  const imageRemove = document.getElementById("news-add-image-remove");
  const columnsPanelEl = document.getElementById("columns-panel");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");

  if (!modal || !form || !naamInput || !editor) return;

  let imageObjectUrl = null;

  function revokeImageUrl() {
    if (imageObjectUrl) {
      URL.revokeObjectURL(imageObjectUrl);
      imageObjectUrl = null;
    }
  }

  function syncEditorEmpty() {
    const empty = !editor.textContent.trim();
    editor.classList.toggle("rte-editor--empty", empty);
  }

  function resetForm() {
    form.reset();
    editor.innerHTML = "";
    editor.classList.add("rte-editor--empty");
    revokeImageUrl();
    if (imagePreview) {
      imagePreview.src = "";
      imagePreview.hidden = true;
    }
    if (imageZone) imageZone.classList.remove("has-preview");
    if (imageRemove) imageRemove.hidden = true;
    naamInput.removeAttribute("aria-invalid");
  }

  function openModal() {
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (columnsPanelEl) columnsPanelEl.setAttribute("hidden", "");
    if (columnsMenuBtn) columnsMenuBtn.setAttribute("aria-expanded", "false");
    if (auteurInput && !auteurInput.value.trim()) {
      auteurInput.value = getPreferredUserName();
    }
    naamInput.focus();
  }

  function closeModal() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    resetForm();
  }

  editor.classList.add("rte-editor--empty");
  editor.addEventListener("input", syncEditorEmpty);
  editor.addEventListener("blur", syncEditorEmpty);

  if (imageInput && imagePreview && imageZone) {
    imageInput.addEventListener("change", () => {
      revokeImageUrl();
      const file = imageInput.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      imageObjectUrl = URL.createObjectURL(file);
      imagePreview.src = imageObjectUrl;
      imagePreview.hidden = false;
      imageZone.classList.add("has-preview");
      if (imageRemove) imageRemove.hidden = false;
    });
  }

  if (imageRemove && imageInput) {
    imageRemove.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      imageInput.value = "";
      revokeImageUrl();
      imagePreview.src = "";
      imagePreview.hidden = true;
      imageZone.classList.remove("has-preview");
      imageRemove.hidden = true;
    });
  }

  modal.querySelectorAll(".rte-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      editor.focus();
      const cmd = btn.dataset.cmd;
      if (!cmd) return;
      if (cmd === "createLink") {
        // Bewaar de selectie vóór de modal opent (focus zou hem anders verliezen).
        let savedRange = null;
        try {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
        } catch (err) { /* */ }
        const url = typeof window.showPromptModal === "function"
          ? await window.showPromptModal({
              title: "Link toevoegen",
              label: "URL van de link",
              placeholder: "https://",
              defaultValue: "https://",
              inputType: "url",
              okLabel: "Toevoegen",
            })
          : window.prompt("URL van de link:", "https://");
        if (!url) return;
        // Selectie restoren + focus terug naar editor vóór execCommand.
        try {
          editor.focus();
          if (savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        } catch (err) { /* */ }
        document.execCommand("createLink", false, String(url).trim());
        return;
      }
      document.execCommand(cmd, false, null);
    });
  });

  openBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titel = naamInput.value.trim();
    if (!titel) {
      naamInput.setAttribute("aria-invalid", "true");
      naamInput.focus();
      return;
    }

    const tableBody = document.querySelector(`${tableSel} tbody`);
    if (!tableBody) return;

    const bodyHtml = editor.innerHTML.trim();
    const auteur = auteurInput?.value?.trim() || getPreferredUserName();
    const file = imageInput?.files?.[0];

    async function finishAdd(imgBase64) {
      const item = {
        titel,
        status: "Published",
        aanmaakdatum: new Date().toISOString(),
        auteur,
        inhoud: bodyHtml,
        archived: false,
      };
      if (imgBase64) item.image = imgBase64;
      closeModal();
      const saved = await upsertNewsItem(item);
      if (!saved) return; // fout is al gemeld door upsertNewsItem
      // Tabel re-rendert automatisch via besa:nieuws-updated event.
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("added", `Nieuwsbericht “${titel}”`);
      }
    }

    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => finishAdd(reader.result);
      reader.readAsDataURL(file);
    } else {
      finishAdd("");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const editModal = document.getElementById("news-edit-modal");
    if (editModal && !editModal.hasAttribute("hidden")) return;
    if (modal.hasAttribute("hidden")) return;
    const purgeModalEl = document.getElementById("news-purge-modal");
    if (purgeModalEl && !purgeModalEl.hasAttribute("hidden")) return;
    const delModal = document.getElementById("news-delete-modal");
    if (delModal && !delModal.hasAttribute("hidden")) return;
    closeModal();
    event.preventDefault();
  });
}

initNewsAddModal();

const NEWS_EDIT_DEFAULT_HTML = `<p><strong>Waarom is dit belangrijk?</strong></p><p>Dit bericht heeft nog geen vaste inhoud in het systeem. U kunt hieronder tekst toevoegen of aanpassen.</p><ul><li>Gebruik <strong>H1</strong> / <strong>H2</strong> voor koppen.</li><li>Gebruik de werkbalk voor lijsten en links.</li></ul>`;

function initNewsEditPanel() {
  const modal = document.getElementById("news-edit-modal");
  const backBtn = document.getElementById("news-edit-back-btn");
  const asideTitle = document.getElementById("news-edit-aside-title");
  const naamInput = document.getElementById("news-edit-naam");
  const editor = document.getElementById("news-edit-inhoud");
  const publishBtn = document.getElementById("news-edit-publish-btn");
  const columnsPanelEl = document.getElementById("columns-panel");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");
  const primaryBox = document.getElementById("news-edit-img-primary-box");
  const primaryInput = document.getElementById("news-edit-img-primary-input");
  const primaryPreview = document.getElementById("news-edit-img-primary-preview");
  const primaryTrash = document.getElementById("news-edit-img-primary-trash");
  const secondaryInput = document.getElementById("news-edit-img-secondary-input");
  const secondaryPreview = document.getElementById("news-edit-img-secondary-preview");
  const secondaryTrash = document.getElementById("news-edit-img-secondary-trash");
  const secondaryFrame = document.getElementById("news-edit-img-second-slot")?.querySelector(".news-edit-img-frame--small");
  const tableBody = document.querySelector(`${tableSel} tbody`);

  if (!modal || !editor || !naamInput || !tableBody) return;

  let currentRow = null;
  let primaryObjectUrl = null;
  let secondaryObjectUrl = null;

  function syncEditEditorEmpty() {
    const empty = !editor.textContent.trim();
    editor.classList.toggle("rte-editor--empty", empty);
  }

  function revokePrimary() {
    if (primaryObjectUrl) {
      URL.revokeObjectURL(primaryObjectUrl);
      primaryObjectUrl = null;
    }
  }

  function revokeSecondary() {
    if (secondaryObjectUrl) {
      URL.revokeObjectURL(secondaryObjectUrl);
      secondaryObjectUrl = null;
    }
  }

  function clearEditImages() {
    revokePrimary();
    revokeSecondary();
    if (primaryInput) primaryInput.value = "";
    if (secondaryInput) secondaryInput.value = "";
    if (primaryPreview) {
      primaryPreview.src = "";
      primaryPreview.hidden = true;
    }
    if (secondaryPreview) {
      secondaryPreview.src = "";
      secondaryPreview.hidden = true;
    }
    primaryBox?.classList.remove("has-image");
    secondaryFrame?.classList.remove("has-image");
    if (primaryTrash) primaryTrash.hidden = true;
    if (secondaryTrash) secondaryTrash.hidden = true;
  }

  function openNewsEdit(tr) {
    currentRow = tr;
    const link = tr.querySelector(".news-title-link");
    const title = link?.textContent?.trim() || "";
    if (asideTitle) asideTitle.textContent = title;
    naamInput.value = title;

    const inhoud = tr.getAttribute("data-news-inhoud");
    editor.innerHTML = inhoud && inhoud.trim() ? inhoud : NEWS_EDIT_DEFAULT_HTML;
    syncEditEditorEmpty();

    clearEditImages();

    if (tr.dataset.newsImage && primaryPreview && primaryBox) {
      primaryPreview.src = tr.dataset.newsImage;
      primaryPreview.hidden = false;
      primaryBox.classList.add("has-image");
      if (primaryTrash) primaryTrash.hidden = false;
    }
    if (tr.dataset.newsImage2 && secondaryPreview && secondaryFrame) {
      secondaryPreview.src = tr.dataset.newsImage2;
      secondaryPreview.hidden = false;
      secondaryFrame.classList.add("has-image");
      if (secondaryTrash) secondaryTrash.hidden = false;
    }

    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (columnsPanelEl) columnsPanelEl.setAttribute("hidden", "");
    if (columnsMenuBtn) columnsMenuBtn.setAttribute("aria-expanded", "false");
    naamInput.focus();
  }

  function closeNewsEdit() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    currentRow = null;
    clearEditImages();
  }

  function saveNewsEdit() {
    if (!currentRow) return;
    const naam = naamInput.value.trim();
    if (!naam) {
      naamInput.focus();
      return;
    }
    if (document.activeElement === editor) editor.blur();
    const html = editor.innerHTML.trim();
    const link = currentRow.querySelector(".news-title-link");
    if (link) link.textContent = naam;
    if (asideTitle) asideTitle.textContent = naam;
    if (html) currentRow.setAttribute("data-news-inhoud", html);
    else currentRow.removeAttribute("data-news-inhoud");

    const filesToRead = [];
    const pFile = primaryInput?.files?.[0];
    const sFile = secondaryInput?.files?.[0];
    if (pFile && pFile.type.startsWith("image/")) filesToRead.push({ key: "newsImage", file: pFile });
    if (sFile && sFile.type.startsWith("image/")) filesToRead.push({ key: "newsImage2", file: sFile });

    let remaining = filesToRead.length;

    async function finishSave() {
      const updatedItem = rowToNewsItem(currentRow);
      closeNewsEdit();
      if (!updatedItem) return;
      const saved = await upsertNewsItem(updatedItem);
      if (!saved) return; // fout al gemeld
      // Tabel re-rendert automatisch via besa:nieuws-updated event.
      if (typeof window.showActionFeedback === "function") {
        const titel = updatedItem.titel ? `Nieuwsbericht “${updatedItem.titel}”` : "Nieuwsbericht";
        window.showActionFeedback("saved", titel);
      }
    }

    if (!remaining) { finishSave(); return; }
    filesToRead.forEach(({ key, file }) => {
      const reader = new FileReader();
      reader.onload = () => {
        currentRow.dataset[key] = reader.result;
        remaining--;
        if (remaining <= 0) finishSave();
      };
      reader.readAsDataURL(file);
    });
  }

  function wireRteToolbar() {
    modal.querySelectorAll(".rte--news-edit .rte-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        editor.focus();
        const cmd = btn.dataset.cmd;
        if (!cmd) return;
        if (cmd === "createLink") {
          let savedRange = null;
          try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
          } catch (err) { /* */ }
          const url = typeof window.showPromptModal === "function"
            ? await window.showPromptModal({
                title: "Link toevoegen",
                label: "URL van de link",
                placeholder: "https://",
                defaultValue: "https://",
                inputType: "url",
                okLabel: "Toevoegen",
              })
            : window.prompt("URL van de link:", "https://");
          if (!url) return;
          try {
            editor.focus();
            if (savedRange) {
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(savedRange);
            }
          } catch (err) { /* */ }
          document.execCommand("createLink", false, String(url).trim());
          return;
        }
        if (cmd === "formatBlock") {
          const block = btn.dataset.block;
          if (block) {
            document.execCommand("formatBlock", false, block);
            return;
          }
        }
        document.execCommand(cmd, false, null);
      });
    });
  }

  wireRteToolbar();

  editor.addEventListener("input", syncEditEditorEmpty);
  editor.addEventListener("blur", syncEditEditorEmpty);

  if (primaryInput && primaryBox && primaryPreview && primaryTrash) {
    primaryInput.addEventListener("change", () => {
      revokePrimary();
      const file = primaryInput.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      primaryObjectUrl = URL.createObjectURL(file);
      primaryPreview.src = primaryObjectUrl;
      primaryPreview.hidden = false;
      primaryBox.classList.add("has-image");
      primaryTrash.hidden = false;
    });
    primaryTrash.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      revokePrimary();
      primaryInput.value = "";
      primaryPreview.src = "";
      primaryPreview.hidden = true;
      primaryBox.classList.remove("has-image");
      primaryTrash.hidden = true;
      if (currentRow) delete currentRow.dataset.newsImage;
    });
  }

  if (secondaryInput && secondaryFrame && secondaryPreview && secondaryTrash) {
    secondaryInput.addEventListener("change", () => {
      revokeSecondary();
      const file = secondaryInput.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      secondaryObjectUrl = URL.createObjectURL(file);
      secondaryPreview.src = secondaryObjectUrl;
      secondaryPreview.hidden = false;
      secondaryFrame.classList.add("has-image");
      secondaryTrash.hidden = false;
    });
    secondaryTrash.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      revokeSecondary();
      secondaryInput.value = "";
      secondaryPreview.src = "";
      secondaryPreview.hidden = true;
      secondaryFrame.classList.remove("has-image");
      secondaryTrash.hidden = true;
      if (currentRow) delete currentRow.dataset.newsImage2;
    });
  }

  tableBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    if (e.target.closest('td[data-col="acties"] button')) return;
    if (e.target.closest('input[type="checkbox"]')) return;
    if (e.target.closest("a.news-title-link")) e.preventDefault();
    openNewsEdit(tr);
  });

  backBtn?.addEventListener("click", closeNewsEdit);

  publishBtn?.addEventListener("click", () => {
    if (!currentRow) return;
    const pill = currentRow.querySelector('td[data-col="status"] .status-pill');
    if (pill) pill.textContent = "Published";
    const updatedItem = rowToNewsItem(currentRow);
    if (updatedItem) upsertNewsItem(updatedItem);
  });

  modal.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target : e.target.parentElement;
    if (el?.closest("#news-edit-save-btn")) {
      e.preventDefault();
      e.stopPropagation();
      saveNewsEdit();
      return;
    }
    if (e.target === modal) closeNewsEdit();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    closeNewsEdit();
    event.preventDefault();
  });
}

function initNewsPurgeModal() {
  const modal = document.getElementById("news-purge-modal");
  const slider = document.getElementById("news-purge-slider");
  const confirmBtn = document.getElementById("news-purge-confirm-btn");
  const cancelBtn = document.getElementById("news-purge-cancel-btn");
  const closeBtn = document.getElementById("news-purge-close-btn");
  const preview = document.getElementById("news-purge-preview");
  const columnsPanelEl = document.getElementById("columns-panel");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");
  const tableBody = document.querySelector(`${tableSel} tbody`);

  if (!modal || !slider || !confirmBtn || !tableBody) return;

  let rowToPurge = null;

  function syncPurgeSlider() {
    const v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
    slider.value = String(v);
    slider.style.setProperty("--news-slider-pct", `${v}%`);
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
    const title = tr.querySelector('td[data-col="titel"]')?.textContent?.trim() || "";
    if (preview) preview.textContent = title;
    slider.value = "0";
    syncPurgeSlider();
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (columnsPanelEl) columnsPanelEl.setAttribute("hidden", "");
    if (columnsMenuBtn) columnsMenuBtn.setAttribute("aria-expanded", "false");
    cancelBtn?.focus();
  }

  function confirmPurge() {
    if (!rowToPurge || confirmBtn.disabled) return;
    const deletedTitle = rowToPurge.querySelector('td[data-col="titel"]')?.textContent?.trim() || "";
    const deletedId = rowToPurge.dataset.newsId || "";
    rowToPurge = null;
    closePurgeModal();
    if (deletedId) {
      deleteNewsItem(deletedId);
      // Tabel re-rendert automatisch via besa:nieuws-updated event.
    }
    showNewsToast(`Nieuws${deletedTitle ? ` "${deletedTitle}"` : ""} definitief verwijderd`);
  }

  tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".news-purge-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const tr = btn.closest("tr");
    if (tr) openPurgeModal(tr);
  });

  slider.addEventListener("input", syncPurgeSlider);
  slider.addEventListener("change", syncPurgeSlider);
  confirmBtn.addEventListener("click", confirmPurge);
  cancelBtn?.addEventListener("click", closePurgeModal);
  closeBtn?.addEventListener("click", closePurgeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closePurgeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const editModal = document.getElementById("news-edit-modal");
    if (editModal && !editModal.hasAttribute("hidden")) return;
    if (modal.hasAttribute("hidden")) return;
    closePurgeModal();
    event.preventDefault();
  });
  syncPurgeSlider();
}

function initNewsRestore() {
  const tableBody = document.querySelector(`${tableSel} tbody`);
  if (!tableBody) return;
  tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".hr-restore-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const tr = btn.closest("tr");
    const id = tr?.dataset?.newsId;
    if (!id) return;
    restoreNewsItem(id);
    // Tabel re-rendert automatisch via besa:nieuws-updated event.
    showNewsToast("Nieuwsbericht hersteld");
  });
}

function initNewsDeleteModal() {
  const modal = document.getElementById("news-delete-modal");
  const slider = document.getElementById("news-delete-slider");
  const confirmBtn = document.getElementById("news-delete-confirm-btn");
  const cancelBtn = document.getElementById("news-delete-cancel-btn");
  const closeBtn = document.getElementById("news-delete-close-btn");
  const preview = document.getElementById("news-delete-preview");
  const columnsPanelEl = document.getElementById("columns-panel");
  const columnsMenuBtn = document.getElementById("columns-menu-btn");
  const tableBody = document.querySelector(`${tableSel} tbody`);

  if (!modal || !slider || !confirmBtn || !tableBody) return;

  let rowToDelete = null;

  function syncSlider() {
    const v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
    slider.value = String(v);
    slider.style.setProperty("--news-slider-pct", `${v}%`);
    slider.setAttribute("aria-valuenow", String(v));
    confirmBtn.disabled = v < 100;
  }

  function resetSlider() {
    slider.value = "0";
    syncSlider();
  }

  function openDeleteModal(tr) {
    rowToDelete = tr;
    const title = tr.querySelector('td[data-col="titel"]')?.textContent?.trim() || "";
    if (preview) preview.textContent = title;
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

  function confirmDelete() {
    if (!rowToDelete || confirmBtn.disabled) return;
    const deletedTitle = rowToDelete.querySelector('td[data-col="titel"]')?.textContent?.trim() || "";
    const deletedId = rowToDelete.dataset.newsId || "";
    rowToDelete = null;
    closeDeleteModal();
    if (deletedId) {
      archiveNewsItem(deletedId);
      // Tabel re-rendert automatisch via besa:nieuws-updated event.
    }
    showNewsToast(`Nieuws${deletedTitle ? ` "${deletedTitle}"` : ""} is gearchiveerd`);
  }

  tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".news-archive-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const tr = btn.closest("tr");
    if (tr) openDeleteModal(tr);
  });

  slider.addEventListener("input", syncSlider);
  slider.addEventListener("change", syncSlider);

  confirmBtn.addEventListener("click", confirmDelete);
  cancelBtn?.addEventListener("click", closeDeleteModal);
  closeBtn?.addEventListener("click", closeDeleteModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDeleteModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const editModal = document.getElementById("news-edit-modal");
    if (editModal && !editModal.hasAttribute("hidden")) return;
    if (modal.hasAttribute("hidden")) return;
    const purgeModal = document.getElementById("news-purge-modal");
    if (purgeModal && !purgeModal.hasAttribute("hidden")) return;
    closeDeleteModal();
    event.preventDefault();
  });

  syncSlider();
}

initNewsDeleteModal();
initNewsPurgeModal();
initNewsRestore();
initNewsEditPanel();

// Re-render de tabel telkens als de Supabase data-laag een wijziging meldt
// (na bootstrap-fetch, na add/update/archive/restore/delete door deze of een
// andere tab/sessie).
window.addEventListener("besa:nieuws-updated", () => {
  loadNewsTableFromStorage();
  syncColumnVisibilityFromMenu();
  applyNewsSearch();
  refreshNewsPagination();
});
