/* global window, document */
/**
 * facturen-te-beoordelen.js — top-bar Facturen → "Te beoordelen".
 * Employee-invoice model (invoicesDB / public.invoices), 1-op-1 BS2
 * `/api/invoices?filter[status][0]=submitted`. STRIKT LOS van de
 * Cliënten→Beschikkingen→Facturen disposition-facturen (facturen.html).
 *
 * "Te beoordelen" = facturen met status `submitted` (wachten op
 * beoordeling: kan goedgekeurd/afgewezen/in beoordeling). Bedragen
 * VERBATIM uit BS2 (total = Σ regels price×amount). Geen herrekening.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escAttr(s) { return escHtml(s); }

  var STATUS_LABEL = {
    draft: "Concept", submitted: "Ingediend", under_review: "In beoordeling",
    approved: "Goedgekeurd", rejected: "Afgewezen",
  };
  var STATUS_CLR = {
    draft: "yellow", submitted: "blue", under_review: "yellow",
    approved: "green", rejected: "red",
  };
  // "Te beoordelen" = status submitted (BS2: filter[status][0]=submitted).
  var TODO = ["submitted"];

  function formatNlDate(v) {
    if (!v) return "—";
    var t = Date.parse(v); if (!isFinite(t)) return "—";
    var d = new Date(t);
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  function formatEur(n) {
    var v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/\.(\d{2})$/, ",$1");
  }
  function invNaam(r) {
    return (r && r.employee && r.employee.name) || (r && r.organization && r.organization.name) || "—";
  }

  var state = {
    search: "", showArchived: false, period: null,
    page: 1, pageSize: 50, sortKey: "datum", sortDir: "desc",
  };

  function getAll() {
    try { return (window.invoicesDB && window.invoicesDB.getAllSync()) || []; }
    catch (e) { return []; }
  }
  function inPeriod(r, p) {
    if (!p || !p.from || !p.to) return true;
    var ref = r.submittedAt || r.invoiceDate || r.aanmaakdatum;
    var d = ref ? Date.parse(ref) : 0;
    if (!isFinite(d) || !d) return false;
    return d >= Date.parse(p.from + "T00:00:00") && d <= Date.parse(p.to + "T23:59:59");
  }

  function filtered() {
    var rows = getAll().filter(function (r) { return r && TODO.indexOf(r.status) >= 0; });
    rows = rows.filter(function (r) { return state.showArchived ? r.gearchiveerd : !r.gearchiveerd; });
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function (r) {
        return (r.number || "").toLowerCase().indexOf(q) >= 0
          || invNaam(r).toLowerCase().indexOf(q) >= 0
          || (r.periodFormatted || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    rows = rows.filter(function (r) { return inPeriod(r, state.period); });
    var dir = state.sortDir === "desc" ? -1 : 1;
    rows.sort(function (a, b) {
      var k = state.sortKey, av, bv;
      if (k === "bedrag") { av = a.total; bv = b.total; return (av - bv) * dir; }
      if (k === "factuurnr") { av = a.number || ""; bv = b.number || ""; return av.localeCompare(bv, "nl") * dir; }
      if (k === "status") { av = controlRank(a); bv = controlRank(b); return (av - bv) * dir; }
      if (k === "maand") { av = (a.jaar || 0) * 100 + (a.maand || 0); bv = (b.jaar || 0) * 100 + (b.maand || 0); return (av - bv) * dir; }
      av = a.submittedAt || a.aanmaakdatum || ""; bv = b.submittedAt || b.aanmaakdatum || "";
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }

  function renderStats() {
    var all = getAll().filter(function (r) { return !r.gearchiveerd; });
    var todo = all.filter(function (r) { return r.status === "submitted"; });
    var ok = all.filter(function (r) { return r.status === "approved"; });
    var sum = function (a) { return a.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0); };
    $("fact-tb-stat-amount-todo").textContent = formatEur(sum(todo));
    $("fact-tb-stat-count-todo").textContent = todo.length;
    $("fact-tb-stat-amount-ok").textContent = formatEur(sum(ok));
    $("fact-tb-stat-count-ok").textContent = ok.length;
  }

  function statusPill(st) {
    return '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + (STATUS_CLR[st] || "yellow") + '">'
      + escHtml(STATUS_LABEL[st] || st) + '</span>';
  }
  function pill(clr, label, title) {
    return '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + clr + '"'
      + (title ? ' title="' + escAttr(title) + '"' : "") + '>' + escHtml(label) + '</span>';
  }
  // Controle-status (4-kleurenschema uit het facturatie-document):
  // blauw = ingediend & één-op-één met systeemfactuur; roze = wijkt af van
  // systeemfactuur; geel = niet in systeemfactuur; rood = afgewezen.
  function sysTotalOf(r) {
    var s = r && r.systemGeneratedSummary;
    var t = s && s.totals && s.totals.total != null ? Number(s.totals.total) : null;
    return (t != null && isFinite(t)) ? t : null;
  }
  function controlPill(r) {
    if (r.status && r.status !== "submitted") return statusPill(r.status);
    var sysTotal = sysTotalOf(r);
    if (sysTotal == null) return pill("yellow", "Niet in systeem", "Geen systeemfactuur aanwezig");
    var diff = Math.round(((Number(r.total) || 0) - sysTotal) * 100) / 100;
    if (Math.abs(diff) >= 0.01) return pill("pink", "Wijkt af", "Verschil met systeemfactuur: " + formatEur(diff));
    return pill("blue", "Ingediend", "Eén-op-één met systeemfactuur");
  }
  // Sorteer-/aandacht-rang: geel (0) en roze (1) eerst, blauw (2) daarna.
  function controlRank(r) {
    if (r.status && r.status !== "submitted") return 3;
    var sysTotal = sysTotalOf(r);
    if (sysTotal == null) return 0;
    return (Math.abs((Number(r.total) || 0) - sysTotal) >= 0.01) ? 1 : 2;
  }

  function render() {
    renderStats();
    var rows = filtered();
    var ps = state.pageSize, total = rows.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * ps;
    var pageRows = rows.slice(start, start + ps);
    var tb = $("fact-tb-tbody");
    if (!pageRows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen facturen te beoordelen</td></tr>';
    } else {
      tb.innerHTML = pageRows.map(function (r) {
        return '<tr class="fact-tb-row" data-id="' + escAttr(r.id) + '" tabindex="0" role="link">'
          + '<td data-col="select"><input type="checkbox" class="table-checkbox fact-tb-rowcheck" data-id="' + escAttr(r.id) + '" aria-label="Selecteer" /></td>'
          + '<td data-col="maand">' + escHtml(r.periodFormatted || "—") + '</td>'
          + '<td data-col="medewerker">' + escHtml(invNaam(r)) + '</td>'
          + '<td data-col="factuurnr">' + escHtml(r.number || "—") + '</td>'
          + '<td data-col="status">' + controlPill(r) + '</td>'
          + '<td data-col="datum">' + escHtml(formatNlDate(r.submittedAt || r.aanmaakdatum)) + '</td>'
          + '<td data-col="bedrag" class="td-num">' + formatEur(r.total) + '</td>'
          + '</tr>';
      }).join("");
    }
    $("fact-tb-range").textContent = total === 0 ? "0 van 0"
      : (start + 1) + "–" + Math.min(start + ps, total) + " van " + total;
    $("fact-tb-page").textContent = "Pagina " + state.page + " van " + maxPage;
    $("fact-tb-pager-first").disabled = state.page <= 1;
    $("fact-tb-pager-prev").disabled = state.page <= 1;
    $("fact-tb-pager-next").disabled = state.page >= maxPage;
    $("fact-tb-pager-last").disabled = state.page >= maxPage;
    applyColumnVisibility();
  }

  // Kolomkiezer (huisstijl, zoals Kilometers): toggle .col-hidden per data-col.
  var COLUMNS = [
    { id: "maand", label: "Maand" },
    { id: "medewerker", label: "Medewerker" },
    { id: "factuurnr", label: "Factuurnummer" },
    { id: "status", label: "Status" },
    { id: "datum", label: "Aanmaakdatum" },
    { id: "bedrag", label: "Bedrag" },
  ];
  function buildColumnsPanel() {
    var list = $("fact-tb-columns-list");
    if (!list) return;
    list.innerHTML = "";
    COLUMNS.forEach(function (c) {
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle is-checked";
      b.setAttribute("data-col", c.id);
      b.setAttribute("role", "menuitemcheckbox");
      b.setAttribute("aria-checked", "true");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }
  function applyColumnVisibility() {
    document.querySelectorAll("#fact-tb-columns-list .column-toggle").forEach(function (btn) {
      var visible = btn.getAttribute("aria-checked") === "true";
      document.querySelectorAll('#fact-tb-table [data-col="' + btn.getAttribute("data-col") + '"]')
        .forEach(function (cell) { cell.classList.toggle("col-hidden", !visible); });
    });
  }

  function openDetail(id) {
    if (id) window.location.href = "invoice-detail.html?id=" + encodeURIComponent(id);
  }

  function wire() {
    var s = $("fact-tb-search");
    if (s) s.addEventListener("input", function () { state.search = this.value || ""; state.page = 1; render(); });
    var arch = $("fact-tb-archived");
    if (arch) arch.addEventListener("change", function () { state.showArchived = this.checked; state.page = 1; render(); });
    $("fact-tb-page-size").addEventListener("change", function () { state.pageSize = parseInt(this.value, 10) || 50; state.page = 1; render(); });
    $("fact-tb-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    $("fact-tb-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page--; render(); } });
    $("fact-tb-pager-next").addEventListener("click", function () { state.page++; render(); });
    $("fact-tb-pager-last").addEventListener("click", function () { state.page = 99999; render(); });
    var tb = $("fact-tb-tbody");
    tb.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".fact-tb-rowcheck")) return;
      var row = e.target && e.target.closest && e.target.closest("tr.fact-tb-row");
      if (row) openDetail(row.getAttribute("data-id"));
    });
    tb.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target && e.target.closest && e.target.closest("tr.fact-tb-row");
      if (row) { e.preventDefault(); openDetail(row.getAttribute("data-id")); }
    });
    // Sorteer-menus (hergebruik bestaand .th-sort patroon)
    document.querySelectorAll("#fact-tb-table .th-sort-trigger").forEach(function (t) {
      t.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = t.closest("th"), menu = th && th.querySelector(".th-sort-menu");
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
        if (wasHidden) menu.removeAttribute("hidden");
      });
    });
    document.querySelectorAll("#fact-tb-table .th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = opt.closest("th"), col = th && th.getAttribute("data-col");
        if (col) { state.sortKey = col; state.sortDir = opt.getAttribute("data-action") === "asc" ? "asc" : "desc"; state.page = 1; render(); }
        document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      });
    });
    document.addEventListener("click", function () {
      document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    });
    // Periode-filter = BS1-huisstijl BesaDateRange. mount() verwacht DOM-
    // elementen (niet id-strings). Fout hier mag de tabel NOOIT breken.
    var pStart = $("fact-tb-period-start"), pEnd = $("fact-tb-period-end");
    var pCont = $("fact-tb-period");
    if (pStart && pEnd && pCont && window.BesaDateRange && window.BesaDateRange.mount) {
      try {
        window.BesaDateRange.mount({
          container: pCont, startInput: pStart, endInput: pEnd,
          allowEmpty: true, emptyLabel: "Periode",
        });
        var onPer = function () {
          var f = pStart.value, t = pEnd.value;
          state.period = (f && t) ? { from: f, to: t } : null;
          state.page = 1; render();
        };
        pStart.addEventListener("change", onPer);
        pEnd.addEventListener("change", onPer);
      } catch (e) { /* date-picker optioneel — tabel blijft werken */ }
    }
    var colBtn = $("fact-tb-columns-menu-btn"), colPanel = $("fact-tb-columns-panel");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (colPanel.hasAttribute("hidden")) { colPanel.removeAttribute("hidden"); colBtn.setAttribute("aria-expanded", "true"); }
        else { colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false"); }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
      var colList = $("fact-tb-columns-list");
      if (colList) colList.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        var on = t.getAttribute("aria-checked") !== "true";
        t.setAttribute("aria-checked", on ? "true" : "false");
        t.classList.toggle("is-checked", on);
        applyColumnVisibility();
      });
      document.addEventListener("click", function () {
        colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false");
      });
    }
    window.addEventListener("besa:invoices-updated", render);
  }

  function init() {
    buildColumnsPanel();
    render();
    wire();
    if (window.invoicesDB && window.invoicesDB.ready) window.invoicesDB.ready.then(render).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
