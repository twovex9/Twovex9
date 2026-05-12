/* global window, document */
/**
 * audit.js — Read-only viewer voor audit-logs.
 * v1: alleen public.beschikking_audit_log entries.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    filterResource: "",
    filterActie: "",
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
  };

  function fmtTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "";
    var d = new Date(t);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function actieBadge(actie) {
    var label = actie || "";
    var style = "padding:2px 8px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;";
    if (actie === "aanmaken") style += "color:var(--green);background:var(--green-soft);";
    else if (actie === "bekijken") style += "color:var(--blue);background:var(--blue-soft);";
    else if (actie === "bewerken") style += "color:var(--yellow);background:var(--yellow-soft);";
    else style += "color:var(--text-muted);background:var(--line);";
    return '<span style="' + style + '">' + escapeHtml(label) + '</span>';
  }

  function statusBadge(status) {
    var label = status || "";
    var style = "padding:2px 8px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;";
    if (status === "succes" || status === "success") style += "color:var(--green);background:var(--green-soft);";
    else if (status === "fout" || status === "error" || status === "failed") style += "color:var(--red);background:var(--red-soft);";
    else style += "color:var(--text-muted);background:var(--line);";
    return '<span style="' + style + '">' + escapeHtml(label) + '</span>';
  }

  function getVisible() {
    var items = (window.auditDB && window.auditDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    return items.filter(function (a) {
      if (!a) return false;
      if (state.filterResource && a.resourceType !== state.filterResource) return false;
      if (state.filterActie && a.actieType !== state.filterActie) return false;
      if (!q) return true;
      var hay = (a.gebruiker || "") + " " + (a.resourceType || "") + " " + (a.resourceId || "") + " " + (a.actieType || "") + " " + (a.details || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderRow(a) {
    return '<tr>' +
      '<td style="white-space:nowrap;">' + escapeHtml(fmtTime(a.tijdstip)) + '</td>' +
      '<td>' + escapeHtml(a.gebruiker) + '</td>' +
      '<td>' + escapeHtml(a.resourceType) + '</td>' +
      '<td style="font-family:monospace;font-size:12px;color:var(--text-secondary);">' + escapeHtml(a.resourceId) + '</td>' +
      '<td>' + actieBadge(a.actieType) + '</td>' +
      '<td style="color:var(--text-secondary);">' + escapeHtml(a.details) + '</td>' +
      '<td>' + statusBadge(a.status) + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("audit-tbody");
    if (!tbody) return;
    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);
    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-muted);">Geen audit-entries gevonden.</td></tr>';
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
    }
    document.getElementById("audit-pager-range").textContent = total === 0 ? "0 van 0" : (start + 1) + "-" + Math.min(total, start + pageItems.length) + " van " + total;
    document.getElementById("audit-pager-page").textContent = "Pagina " + state.page + " van " + totalPages;
    document.getElementById("audit-pager-first").disabled = state.page <= 1;
    document.getElementById("audit-pager-prev").disabled = state.page <= 1;
    document.getElementById("audit-pager-next").disabled = state.page >= totalPages;
    document.getElementById("audit-pager-last").disabled = state.page >= totalPages;
  }

  function wireEvents() {
    document.getElementById("audit-refresh-btn").addEventListener("click", function () {
      if (window.auditDB && window.auditDB.refresh) {
        window.auditDB.refresh().catch(function (err) { console.error("[audit] refresh failed", err); });
      }
    });
    document.getElementById("audit-search").addEventListener("input", function (e) { state.search = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("audit-filter-resource").addEventListener("change", function (e) { state.filterResource = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("audit-filter-actie").addEventListener("change", function (e) { state.filterActie = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("audit-rows-per-page").addEventListener("change", function (e) { state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render(); });
    document.getElementById("audit-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("audit-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("audit-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("audit-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });
    window.addEventListener("besa:audit-updated", render);
  }

  function init() {
    if (!window.auditDB) { console.error("[audit] auditDB niet geladen"); return; }
    wireEvents();
    render();
    window.auditDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
