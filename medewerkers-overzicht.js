/* global window, document, localStorage */
/**
 * medewerkers-overzicht.js — page-script voor /medewerkers-overzicht.html.
 *
 * TOP-BAR Medewerkers (BS2 /main-employee/employees → /api/employees-basic).
 * 1-op-1 BS2: 5 kolommen (Avatar+status-dot · Voornaam · Achternaam ·
 * E-mailadres · Tel.), sorteerbare headers, "Zoeken...", Kolommen-chooser,
 * footer "X of Y total." / "Rows per page" / "Page N of M". Geen
 * add/archive/filter (BS2 heeft die niet op deze pagina). Hele rij klikbaar
 * → detailpagina (BS2: /main-employee/employee-details/{id}/sickness).
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 15; // BS2 employees-basic per_page = 15
  var COLS_KEY = "main_employees_cols_v1";
  var ALL_COLS = ["avatar", "voornaam", "achternaam", "email", "tel"];

  var state = {
    search: "",
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    sortKey: "first_name", // BS2-default sort=first_name
    sortDir: "asc",
    cols: null,
  };

  function loadCols() {
    var on = {};
    ALL_COLS.forEach(function (c) { on[c] = true; });
    try {
      var raw = JSON.parse(localStorage.getItem(COLS_KEY) || "null");
      if (raw && typeof raw === "object") ALL_COLS.forEach(function (c) { if (c in raw) on[c] = !!raw[c]; });
    } catch (e) { /* */ }
    return on;
  }
  function saveCols() {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(state.cols)); } catch (e) { /* */ }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function personSvg() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>';
  }

  function avatarCell(m) {
    var dotClass = m.isSick ? "me-avatar-dot me-avatar-dot--sick" : "me-avatar-dot me-avatar-dot--ok";
    return '<div class="me-avatar">' + personSvg() +
      '<span class="' + dotClass + '" title="' + (m.isSick ? "Ziek" : "Actief") + '"></span></div>';
  }

  function getVisible() {
    var items = (window.mainEmployeesDB && window.mainEmployeesDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    var list = items.filter(function (m) {
      if (!m) return false;
      if (m.archived) return false; // BS2 toont actieve medewerkers
      if (!q) return true;
      var hay = (m.firstName || "") + " " + (m.lastName || "") + " " + (m.email || "") + " " + (m.phone || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
    var k = state.sortKey, dir = state.sortDir === "desc" ? -1 : 1;
    var map = { first_name: "firstName", last_name: "lastName", email: "email", phone: "phone" };
    var f = map[k] || "firstName";
    list.sort(function (a, b) {
      var av = String(a[f] || "").toLowerCase();
      var bv = String(b[f] || "").toLowerCase();
      if (av !== bv) return av < bv ? -dir : dir;
      return 0;
    });
    return list;
  }

  function applyColVisibility() {
    var c = state.cols;
    var tbl = document.getElementById("me-table");
    if (!tbl) return;
    tbl.querySelectorAll("[data-col]").forEach(function (el) {
      var col = el.getAttribute("data-col");
      if (col in c) el.style.display = c[col] ? "" : "none";
    });
  }

  function renderRow(m) {
    return '<tr data-id="' + escapeHtml(m.id) + '" class="me-row" style="cursor:pointer">' +
      '<td data-col="avatar">' + avatarCell(m) + '</td>' +
      '<td data-col="voornaam">' + escapeHtml(m.firstName || "") + '</td>' +
      '<td data-col="achternaam">' + escapeHtml(m.lastName || "") + '</td>' +
      '<td data-col="email">' + escapeHtml(m.email || "") + '</td>' +
      '<td data-col="tel">' + escapeHtml(m.phone || "") + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("me-tbody");
    if (!tbody) return;

    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);

    tbody.innerHTML = pageItems.length
      ? pageItems.map(renderRow).join("")
      : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">Geen medewerkers</td></tr>';
    applyColVisibility();

    var to = Math.min(start + rpp, total);
    var cntEl = document.getElementById("me-pager-count");
    if (cntEl) cntEl.textContent = (total ? (to - start) : 0) + " of " + total + " total.";
    var pageEl = document.getElementById("me-pager-page");
    if (pageEl) pageEl.textContent = "Page " + state.page + " of " + totalPages;

    var first = document.getElementById("me-pager-first");
    var prev = document.getElementById("me-pager-prev");
    var next = document.getElementById("me-pager-next");
    var last = document.getElementById("me-pager-last");
    if (first) first.disabled = state.page <= 1;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
    if (last) last.disabled = state.page >= totalPages;

    // sorteer-indicatie op headers
    document.querySelectorAll("#me-table th.me-th-sort").forEach(function (th) {
      var key = th.getAttribute("data-sort");
      th.classList.toggle("me-sorted-asc", key === state.sortKey && state.sortDir === "asc");
      th.classList.toggle("me-sorted-desc", key === state.sortKey && state.sortDir === "desc");
    });
  }

  function toggleColsPanel(force) {
    var panel = document.getElementById("me-cols-panel");
    var btn = document.getElementById("me-cols-btn");
    if (!panel) return;
    var open = force != null ? force : panel.hasAttribute("hidden");
    if (open) { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
    else { panel.setAttribute("hidden", ""); btn.setAttribute("aria-expanded", "false"); }
  }

  function wireEvents() {
    document.getElementById("me-search").addEventListener("input", function (e) {
      state.search = e.target.value || ""; state.page = 1; render();
    });

    document.querySelectorAll("#me-table th.me-th-sort").forEach(function (th) {
      th.style.cursor = "pointer";
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = "asc"; }
        state.page = 1; render();
      });
    });

    var colsBtn = document.getElementById("me-cols-btn");
    if (colsBtn) colsBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleColsPanel(); });
    document.querySelectorAll("#me-cols-panel input[type=checkbox]").forEach(function (cb) {
      cb.checked = !!state.cols[cb.getAttribute("data-col")];
      cb.addEventListener("change", function () {
        state.cols[cb.getAttribute("data-col")] = cb.checked;
        saveCols(); applyColVisibility();
      });
    });
    document.addEventListener("click", function (e) {
      var panel = document.getElementById("me-cols-panel");
      if (!panel || panel.hasAttribute("hidden")) return;
      if (e.target.closest("#me-cols-panel") || e.target.closest("#me-cols-btn")) return;
      toggleColsPanel(false);
    });

    document.getElementById("me-rows-per-page").addEventListener("change", function (e) {
      state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render();
    });
    document.getElementById("me-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("me-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("me-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("me-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    document.getElementById("me-tbody").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      window.location.href = "medewerker-detail.html?id=" + encodeURIComponent(tr.getAttribute("data-id"));
    });

    window.addEventListener("besa:main-employees-updated", render);
  }

  function init() {
    if (!window.mainEmployeesDB) { console.error("[medewerkers] mainEmployeesDB niet geladen"); return; }
    state.cols = loadCols();
    wireEvents();
    render();
    window.mainEmployeesDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
