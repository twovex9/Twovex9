/* global window, document */
/**
 * facturen-alle.js — top-bar Facturen → "Alle facturen".
 * Employee-invoice model (invoicesDB / public.invoices), 1-op-1 BS2
 * `/api/invoices` (geen status-filter = alle statussen). STRIKT LOS van
 * de Cliënten→Beschikkingen→Facturen disposition-facturen (facturen.html).
 * Bedragen VERBATIM uit BS2 (total = Σ regels price×amount).
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
    search: "", showArchived: false, status: "", period: null,
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
    var rows = getAll().filter(function (r) { return state.showArchived ? r.gearchiveerd : !r.gearchiveerd; });
    if (state.status) rows = rows.filter(function (r) { return r.status === state.status; });
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
      var k = state.sortKey;
      if (k === "bedrag") return ((a.total) - (b.total)) * dir;
      if (k === "factuurnr") return String(a.number || "").localeCompare(String(b.number || ""), "nl") * dir;
      if (k === "status") return String(a.status || "").localeCompare(String(b.status || "")) * dir;
      if (k === "maand") return (((a.jaar || 0) * 100 + (a.maand || 0)) - ((b.jaar || 0) * 100 + (b.maand || 0))) * dir;
      return String(a.submittedAt || a.aanmaakdatum || "").localeCompare(String(b.submittedAt || b.aanmaakdatum || "")) * dir;
    });
    return rows;
  }

  function renderStats() {
    var all = getAll().filter(function (r) { return !r.gearchiveerd; });
    var ok = all.filter(function (r) { return r.status === "approved"; });
    var sum = function (a) { return a.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0); };
    $("fact-tb-stat-amount-todo").textContent = formatEur(sum(all));
    $("fact-tb-stat-count-todo").textContent = all.length;
    $("fact-tb-stat-amount-ok").textContent = formatEur(sum(ok));
    $("fact-tb-stat-count-ok").textContent = ok.length;
  }
  function statusPill(st) {
    return '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + (STATUS_CLR[st] || "yellow") + '">'
      + escHtml(STATUS_LABEL[st] || st) + '</span>';
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
      tb.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen facturen gevonden</td></tr>';
    } else {
      tb.innerHTML = pageRows.map(function (r) {
        return '<tr class="fact-tb-row" data-id="' + escAttr(r.id) + '" tabindex="0" role="link">'
          + '<td data-col="select"><input type="checkbox" class="table-checkbox fact-tb-rowcheck" data-id="' + escAttr(r.id) + '" aria-label="Selecteer" /></td>'
          + '<td data-col="maand">' + escHtml(r.periodFormatted || "—") + '</td>'
          + '<td data-col="medewerker">' + escHtml(invNaam(r)) + '</td>'
          + '<td data-col="factuurnr">' + escHtml(r.number || "—") + '</td>'
          + '<td data-col="status">' + statusPill(r.status) + '</td>'
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
  }

  function openDetail(id) {
    if (id) window.location.href = "invoice-detail.html?id=" + encodeURIComponent(id);
  }

  function wire() {
    var s = $("fact-tb-search");
    if (s) s.addEventListener("input", function () { state.search = this.value || ""; state.page = 1; render(); });
    var arch = $("fact-tb-archived");
    if (arch) arch.addEventListener("change", function () { state.showArchived = this.checked; state.page = 1; render(); });
    var st = $("fact-alle-status");
    if (st) st.addEventListener("change", function () {
      state.status = this.value || ""; state.page = 1;
      var w = this.closest(".filter-chip-select-wrap"); if (w) w.setAttribute("data-empty", this.value ? "false" : "true");
      render();
    });
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
    var pStart = $("fact-tb-period-start"), pEnd = $("fact-tb-period-end");
    if (pStart && pEnd && window.BesaDateRange && window.BesaDateRange.mount) {
      window.BesaDateRange.mount({
        container: "fact-tb-period", startInput: "fact-tb-period-start",
        endInput: "fact-tb-period-end", allowEmpty: true, emptyLabel: "Periode",
      });
      var onPer = function () {
        var f = pStart.value, t = pEnd.value;
        state.period = (f && t) ? { from: f, to: t } : null;
        state.page = 1; render();
      };
      pStart.addEventListener("change", onPer);
      pEnd.addEventListener("change", onPer);
    }
    window.addEventListener("besa:invoices-updated", render);
  }

  function init() {
    wire();
    render();
    if (window.invoicesDB && window.invoicesDB.ready) window.invoicesDB.ready.then(render).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
