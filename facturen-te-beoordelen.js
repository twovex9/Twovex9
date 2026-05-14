/* global window, document */
/**
 * facturen-te-beoordelen.js — page-script voor facturen-te-beoordelen.html.
 *
 * Toont alleen facturen die actie vereisen ("te beoordelen": Concept,
 * Ingediend, In beoordeling, Afgewezen, Verlopen) — geen Goedgekeurd /
 * Betaald (die zijn afgehandeld).
 *
 * Filters via besa-filter-chips.js: Status (zoek+select) + Periode (date-range).
 * Plus: zoekveld, gearchiveerd-toggle, kolommen-menu, sortering, paginering.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var STATUS_OPTIONS = [
    { value: "Concept", label: "Concept" },
    { value: "Ingediend", label: "Ingediend" },
    { value: "In beoordeling", label: "In beoordeling" },
    { value: "Goedgekeurd", label: "Goedgekeurd" },
    { value: "Afgewezen", label: "Afgewezen" },
    { value: "Betaald", label: "Betaald" },
    { value: "Verlopen", label: "Verlopen" },
  ];

  // "Te beoordelen" = alle statussen behalve Goedgekeurd + Betaald.
  var TODO_STATUSES = ["Concept", "Ingediend", "In beoordeling", "Afgewezen", "Verlopen"];
  var DONE_STATUSES = ["Goedgekeurd", "Betaald"];

  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  function formatNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  function formatMaand(value) {
    if (!value) return "—";
    var t = Date.parse(value); if (!isFinite(t)) return "—";
    var d = new Date(t);
    return MONTHS_NL[d.getMonth()].charAt(0).toUpperCase() + MONTHS_NL[d.getMonth()].slice(1) + " " + d.getFullYear();
  }
  function formatEur(n) {
    var v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/\.(\d{2})$/, ",$1");
  }

  function getMedewerkerNaamFromBeschOrClient(rec) {
    // De facturen tabel heeft geen direct medewerker_id. Voor demo: gebruik
    // 'client' label als 'Medewerker' (workaround tot er een medewerker_id-FK
    // is op facturen). Komt overeen met screenshot: namen als "Feyza Ozdemir".
    return rec.client || rec.besch || "—";
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    search: "",
    showArchived: false,
    statusFilter: null,
    periodFilter: null, // { from: 'yyyy-mm-dd', to: 'yyyy-mm-dd' }
    page: 1,
    pageSize: 50,
    sortKey: "datum",
    sortDir: "desc",
  };

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  function getAll() {
    if (!window.facturenDB) return [];
    try { return window.facturenDB.getAllSync() || []; } catch (e) { return []; }
  }

  function inPeriod(rec, period) {
    if (!period || !period.from || !period.to) return true;
    var d = rec.aanmaakdatum ? Date.parse(rec.aanmaakdatum) : 0;
    if (!isFinite(d) || !d) return false;
    var from = Date.parse(period.from + "T00:00:00");
    var to = Date.parse(period.to + "T23:59:59");
    return d >= from && d <= to;
  }

  function getFiltered() {
    var items = getAll().slice();
    // Default: 'te beoordelen' = niet goedgekeurd/betaald (tenzij specifiek statusFilter)
    if (state.statusFilter) {
      items = items.filter(function (r) { return r && r.st === state.statusFilter; });
    } else {
      items = items.filter(function (r) { return r && TODO_STATUSES.indexOf(r.st) !== -1; });
    }
    // Archived
    if (state.showArchived) {
      items = items.filter(function (r) { return r.archived; });
    } else {
      items = items.filter(function (r) { return !r.archived; });
    }
    // Period
    if (state.periodFilter) items = items.filter(function (r) { return inPeriod(r, state.periodFilter); });
    // Search
    var q = state.search.trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        var pack = ((r.fn || "") + " " + (r.client || "") + " " + (r.besch || "") + " " + (r.st || "")).toLowerCase();
        return pack.indexOf(q) !== -1;
      });
    }
    // Sort
    var dir = state.sortDir === "desc" ? -1 : 1;
    var sk = state.sortKey;
    items.sort(function (a, b) {
      if (sk === "maand") {
        var am = a.aanmaakdatum ? Date.parse(a.aanmaakdatum) : 0;
        var bm = b.aanmaakdatum ? Date.parse(b.aanmaakdatum) : 0;
        return (am - bm) * dir;
      }
      if (sk === "datum") {
        var ad = a.aanmaakdatum ? Date.parse(a.aanmaakdatum) : 0;
        var bd = b.aanmaakdatum ? Date.parse(b.aanmaakdatum) : 0;
        return (ad - bd) * dir;
      }
      if (sk === "factuurnr") return (a.fn || "").localeCompare(b.fn || "", "nl") * dir;
      if (sk === "status") return (a.st || "").localeCompare(b.st || "", "nl") * dir;
      if (sk === "bedrag") return ((a.bedragNum || 0) - (b.bedragNum || 0)) * dir;
      return 0;
    });
    return items;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function statusPillClass(st) {
    var s = (st || "").toLowerCase();
    if (s.indexOf("ingediend") !== -1) return "ftb-status-pill ftb-status-pill--ingediend";
    if (s.indexOf("beoordeling") !== -1) return "ftb-status-pill ftb-status-pill--beoordeling";
    if (s.indexOf("goedgekeurd") !== -1) return "ftb-status-pill ftb-status-pill--goedgekeurd";
    if (s.indexOf("afgewezen") !== -1) return "ftb-status-pill ftb-status-pill--afgewezen";
    if (s.indexOf("betaald") !== -1) return "ftb-status-pill ftb-status-pill--betaald";
    if (s.indexOf("verlopen") !== -1) return "ftb-status-pill ftb-status-pill--verlopen";
    return "ftb-status-pill ftb-status-pill--concept";
  }

  function render() {
    var items = getFiltered();
    var ps = state.pageSize;
    var total = items.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * ps;
    var pageRows = items.slice(start, start + ps);

    // Stats — over ALLE niet-gearchiveerde facturen (niet alleen huidige filter)
    var allActive = getAll().filter(function (r) { return r && !r.archived; });
    var todoSum = 0, todoCount = 0, okSum = 0, okCount = 0;
    allActive.forEach(function (r) {
      if (TODO_STATUSES.indexOf(r.st) !== -1) { todoSum += r.bedragNum || 0; todoCount += 1; }
      else if (DONE_STATUSES.indexOf(r.st) !== -1) { okSum += r.bedragNum || 0; okCount += 1; }
    });
    $("fact-tb-stat-amount-todo").textContent = formatEur(todoSum);
    $("fact-tb-stat-count-todo").textContent = todoCount;
    $("fact-tb-stat-amount-ok").textContent = formatEur(okSum);
    $("fact-tb-stat-count-ok").textContent = okCount;

    var tbody = $("fact-tb-tbody");
    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen facturen gevonden voor deze filters</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(function (r) {
        return '<tr data-id="' + escHtml(r.id) + '">'
          + '<td data-col="select"><input type="checkbox" class="table-checkbox ftb-row-check" aria-label="Selecteer" /></td>'
          + '<td data-col="maand">' + escHtml(formatMaand(r.aanmaakdatum)) + '</td>'
          + '<td data-col="medewerker">' + escHtml(getMedewerkerNaamFromBeschOrClient(r)) + '</td>'
          + '<td data-col="factuurnr">' + escHtml(r.fn || "—") + '</td>'
          + '<td data-col="status"><span class="' + statusPillClass(r.st) + '">' + escHtml(r.st || "—") + '</span></td>'
          + '<td data-col="datum">' + escHtml(formatNlDate(r.aanmaakdatum)) + '</td>'
          + '<td data-col="bedrag" class="td-num"><strong>' + escHtml(formatEur(r.bedragNum)) + '</strong></td>'
          + '</tr>';
      }).join("");
    }
    var rangeFrom = total === 0 ? 0 : start + 1;
    var rangeTo = Math.min(start + ps, total);
    $("fact-tb-range").textContent = total === 0 ? "0 van 0" : (rangeFrom + "–" + rangeTo + " van " + total);
    $("fact-tb-page").textContent = "Pagina " + state.page + " van " + maxPage;
    $("fact-tb-pager-first").disabled = state.page <= 1;
    $("fact-tb-pager-prev").disabled = state.page <= 1;
    $("fact-tb-pager-next").disabled = state.page >= maxPage;
    $("fact-tb-pager-last").disabled = state.page >= maxPage;

    applySortIndicators();
    applyColumnVisibility();
  }

  function applySortIndicators() {
    document.querySelectorAll("#fact-tb-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      var col = th.getAttribute("data-col");
      if (col === state.sortKey) {
        th.classList.add(state.sortDir === "desc" ? "is-sorted-desc" : "is-sorted-asc");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Kolommen
  // ---------------------------------------------------------------------------
  var COLUMN_CONFIG = [
    { id: "select", label: "Selectie", defaultOn: true, skipToggle: true },
    { id: "maand", label: "Maand", defaultOn: true },
    { id: "medewerker", label: "Medewerker", defaultOn: true },
    { id: "factuurnr", label: "Factuurnummer", defaultOn: true },
    { id: "status", label: "Status", defaultOn: true },
    { id: "datum", label: "Aanmaakdatum", defaultOn: true },
    { id: "bedrag", label: "Bedrag", defaultOn: true },
  ];
  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#fact-tb-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyColumnVisibility() {
    document.querySelectorAll("#fact-tb-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      setColumnVisible(colId, btn.getAttribute("aria-checked") === "true");
    });
  }
  function buildColumnsPanel() {
    var list = $("fact-tb-columns-list");
    list.innerHTML = "";
    COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle is-checked";
      b.setAttribute("data-col", c.id);
      b.setAttribute("aria-checked", "true");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireUp() {
    // Search
    $("fact-tb-search").addEventListener("input", function () {
      state.search = this.value || ""; state.page = 1; render();
    });
    // Archived
    $("fact-tb-archived").addEventListener("change", function () {
      state.showArchived = this.checked; state.page = 1; render();
    });
    // Page size + pager
    $("fact-tb-page-size").addEventListener("change", function () {
      state.pageSize = parseInt(this.value, 10) || 50; state.page = 1; render();
    });
    $("fact-tb-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    $("fact-tb-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page--; render(); } });
    $("fact-tb-pager-next").addEventListener("click", function () { state.page++; render(); });
    $("fact-tb-pager-last").addEventListener("click", function () { state.page = 99999; render(); });

    // Filter chips: Status + Periode (besa-filter-chips.js)
    // Bug #55 fix: label zonder leading "+" — renderButtonContent voegt de "+" zelf toe
    if (window.besaFilterChips) {
      window.besaFilterChips.createSearchSelectChip({
        button: $("fact-tb-status-chip"),
        label: "Status",
        options: STATUS_OPTIONS,
        onChange: function (val) { state.statusFilter = val; state.page = 1; render(); },
      });
      window.besaFilterChips.createDateRangeChip({
        button: $("fact-tb-period-chip"),
        label: "Periode",
        onChange: function (range) { state.periodFilter = range; state.page = 1; render(); },
      });
    }

    // Kolommen-menu
    var colBtn = $("fact-tb-columns-menu-btn");
    var colPanel = $("fact-tb-columns-panel");
    colBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var hidden = colPanel.hasAttribute("hidden");
      if (hidden) { colPanel.removeAttribute("hidden"); colBtn.setAttribute("aria-expanded", "true"); }
      else { colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false"); }
    });
    colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    $("fact-tb-columns-list").addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest(".column-toggle");
      if (!t) return;
      t.classList.toggle("is-checked");
      t.setAttribute("aria-checked", t.classList.contains("is-checked") ? "true" : "false");
      applyColumnVisibility();
    });
    document.addEventListener("click", function () {
      if (colPanel) { colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false"); }
    });

    // Check-all
    $("fact-tb-check-all").addEventListener("change", function () {
      var on = this.checked;
      document.querySelectorAll(".ftb-row-check").forEach(function (cb) { cb.checked = on; });
    });

    // Sort menus
    document.querySelectorAll("#fact-tb-table .th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th.querySelector(".th-sort-menu");
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
        if (wasHidden) menu.removeAttribute("hidden");
      });
    });
    document.querySelectorAll("#fact-tb-table .th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = opt.getAttribute("data-action");
        var th = opt.closest("th");
        var col = th ? th.getAttribute("data-col") : null;
        if (col && (action === "asc" || action === "desc")) {
          state.sortKey = col;
          state.sortDir = action;
          state.page = 1;
          render();
        }
        document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      });
    });
    document.addEventListener("click", function () {
      document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    });

    // Live re-render bij data-changes
    window.addEventListener("besa:facturen-updated", render);
  }

  function init() {
    buildColumnsPanel();
    wireUp();
    render();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
