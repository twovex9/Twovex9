/* global window, document */
/**
 * audit.js — Audit Logs (read-only viewer), server-side.
 *
 * Bron = public.audit_log via auditDB.fetchPage (server-side paginatie +
 * sortering + filtering → toont ALLE rijen, niet meer de oude 500-cap).
 * Klikbare sorteerkoppen. Filters (Resource / Veroorzaker / Actie type)
 * + zoeken, server-side. besa-audit.js vult deze tabel met de echte
 * ingelogde gebruiker per actie + in-/uitloggen.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    filterResource: "",
    filterActie: "",
    filterVeroorzaker: "",
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    sortKey: "tijdstip",
    sortDir: "desc",
  };

  var currentRows = [];
  var currentTotal = 0;
  var loadToken = 0;
  var searchTimer = null;

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

  var ACTIE_LABELS = {
    aanmaken: "Aanmaken", bewerken: "Bewerken", bekijken: "Bekijken",
    verwijderen: "Verwijderen", archiveren: "Archiveren", herstellen: "Herstellen",
    status_wijziging: "Status wijziging", inloggen: "Inloggen", uitloggen: "Uitloggen",
    exporteren: "Exporteren", downloaden: "Downloaden",
    RolGewijzigd: "Rol gewijzigd", WachtwoordGereset: "Wachtwoord gereset",
    Gedeactiveerd: "Gedeactiveerd", Geactiveerd: "Geactiveerd", "2FAGereset": "2FA gereset",
  };
  function actieLabel(a) { return ACTIE_LABELS[a] || a || ""; }

  function actieBadge(actie) {
    var label = actieLabel(actie);
    var style = "padding:2px 8px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;";
    if (actie === "aanmaken" || actie === "herstellen" || actie === "Geactiveerd") style += "color:var(--green);background:var(--green-soft);";
    else if (actie === "bekijken" || actie === "inloggen" || actie === "status_wijziging" || actie === "exporteren" || actie === "downloaden") style += "color:var(--blue);background:var(--blue-soft);";
    else if (actie === "bewerken" || actie === "archiveren") style += "color:var(--yellow);background:var(--yellow-soft);";
    else if (actie === "verwijderen" || actie === "Gedeactiveerd") style += "color:var(--red);background:var(--red-soft);";
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

  function renderRow(a) {
    return '<tr class="audit-row" data-audit-id="' + escapeHtml(a.id) + '" tabindex="0" role="button" aria-label="Open audit-detail">' +
      '<td data-col="tijdstip" style="white-space:nowrap;">' + escapeHtml(fmtTime(a.tijdstip)) + '</td>' +
      '<td data-col="gebruiker">' + escapeHtml(a.gebruiker) + '</td>' +
      '<td data-col="resource">' + escapeHtml(a.resourceType) + '</td>' +
      '<td data-col="resource_id" style="font-family:monospace;font-size:12px;color:var(--text-secondary);">' + escapeHtml(a.resourceId) + '</td>' +
      '<td data-col="actie">' + actieBadge(a.actieType) + '</td>' +
      '<td data-col="details" style="color:var(--text-secondary);">' + escapeHtml(a.details) + '</td>' +
      '<td data-col="status">' + statusBadge(a.status) + '</td>' +
    '</tr>';
  }

  // ---- detail modal ----
  function buildDetailRow(label, valueHtml) {
    return '<div class="audit-detail-row"><dt class="audit-detail-label">' + escapeHtml(label) +
      '</dt><dd class="audit-detail-value">' + valueHtml + '</dd></div>';
  }
  function renderDetailBody(a) {
    if (!a) return '<p style="color:var(--text-muted);">Geen data.</p>';
    var rows = "";
    rows += buildDetailRow("Tijdstip", escapeHtml(fmtTime(a.tijdstip)) + ' <span style="color:var(--text-muted);font-size:12px;">(' + escapeHtml(a.tijdstip || "") + ')</span>');
    rows += buildDetailRow("Gebruiker", escapeHtml(a.gebruiker || "—"));
    rows += buildDetailRow("Resource", escapeHtml(a.resourceType || "—"));
    rows += buildDetailRow("Resource ID", '<span style="font-family:monospace;font-size:12px;">' + escapeHtml(a.resourceId || "—") + '</span>');
    rows += buildDetailRow("Actie", actieBadge(a.actieType));
    rows += buildDetailRow("Status", statusBadge(a.status));
    var detailsRaw = a.details || "";
    var detailsHtml;
    try {
      var parsed = JSON.parse(detailsRaw);
      detailsHtml = '<pre class="audit-detail-pre">' + escapeHtml(JSON.stringify(parsed, null, 2)) + '</pre>';
    } catch (e) {
      detailsHtml = detailsRaw
        ? '<pre class="audit-detail-pre">' + escapeHtml(detailsRaw) + '</pre>'
        : '<span style="color:var(--text-muted);">— geen details —</span>';
    }
    rows += buildDetailRow("Details", detailsHtml);
    if (a.ipAdres) rows += buildDetailRow("IP-adres", '<span style="font-family:monospace;font-size:12px;">' + escapeHtml(a.ipAdres) + '</span>');
    if (a.userAgent) rows += buildDetailRow("User-agent", '<span style="font-family:monospace;font-size:12px;word-break:break-all;">' + escapeHtml(a.userAgent) + '</span>');
    return '<dl class="audit-detail-dl">' + rows + '</dl>';
  }
  function openDetailModal(auditId) {
    var entry = currentRows.find(function (x) { return x && String(x.id) === String(auditId); });
    var overlay = document.getElementById("audit-detail-overlay");
    var body = document.getElementById("audit-detail-body");
    var title = document.getElementById("audit-detail-title");
    if (!overlay || !body) return;
    if (entry && title) title.textContent = (entry.resourceType || "Audit-event") + (entry.actieType ? " — " + actieLabel(entry.actieType) : "");
    body.innerHTML = renderDetailBody(entry);
    overlay.hidden = false;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeDetailModal() {
    var overlay = document.getElementById("audit-detail-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  function wireDetailModal() {
    var overlay = document.getElementById("audit-detail-overlay");
    var closeBtn = document.getElementById("audit-detail-close");
    if (closeBtn) closeBtn.addEventListener("click", closeDetailModal);
    if (overlay) overlay.addEventListener("click", function (e) { if (e.target === overlay) closeDetailModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay && !overlay.hidden) closeDetailModal(); });
    var tbody = document.getElementById("audit-tbody");
    if (!tbody) return;
    tbody.addEventListener("click", function (e) {
      var row = e.target.closest("tr.audit-row");
      if (row) { var id = row.getAttribute("data-audit-id"); if (id) openDetailModal(id); }
    });
    tbody.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target.closest("tr.audit-row");
      if (!row) return;
      e.preventDefault();
      var id = row.getAttribute("data-audit-id");
      if (id) openDetailModal(id);
    });
  }

  // ---- sorteerkoppen ----
  function applySortIndicators() {
    document.querySelectorAll('#audit-table thead th[data-col]').forEach(function (th) {
      var col = th.getAttribute("data-col");
      var inner = th.querySelector(".th-sort-inner");
      if (!inner) return;
      var old = inner.querySelector(".audit-sort-arrow");
      if (old) old.remove();
      th.style.cursor = "pointer";
      th.setAttribute("title", "Sorteer op " + (th.textContent || col).trim());
      var span = document.createElement("span");
      span.className = "audit-sort-arrow";
      span.style.cssText = "margin-left:6px;font-size:11px;color:var(--text-muted);";
      span.textContent = (col === state.sortKey) ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
      inner.appendChild(span);
    });
  }
  function wireSortHeaders() {
    document.querySelectorAll('#audit-table thead th[data-col]').forEach(function (th) {
      th.addEventListener("click", function () {
        var col = th.getAttribute("data-col");
        if (!col) return;
        if (state.sortKey === col) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = col;
          state.sortDir = (col === "tijdstip") ? "desc" : "asc";
        }
        state.page = 1;
        loadAndRender();
      });
    });
  }

  function setPagerDisabled(totalPages) {
    [["audit-pager-first", state.page <= 1], ["audit-pager-prev", state.page <= 1],
     ["audit-pager-next", state.page >= totalPages], ["audit-pager-last", state.page >= totalPages]
    ].forEach(function (x) { var el = document.getElementById(x[0]); if (el) el.disabled = x[1]; });
  }

  function renderRows() {
    var tbody = document.getElementById("audit-tbody");
    if (!tbody) return;
    if (!currentRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-muted);">Geen audit-entries gevonden.</td></tr>';
    } else {
      tbody.innerHTML = currentRows.map(renderRow).join("");
    }
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(currentTotal / rpp));
    var start = (state.page - 1) * rpp;
    var rangeEl = document.getElementById("audit-pager-range");
    if (rangeEl) rangeEl.textContent = currentTotal === 0 ? "0 van 0" : (start + 1) + "-" + (start + currentRows.length) + " van " + currentTotal;
    var pageEl = document.getElementById("audit-pager-page");
    if (pageEl) pageEl.textContent = "Pagina " + state.page + " van " + totalPages;
    setPagerDisabled(totalPages);
    applySortIndicators();
    if (window.applyAuditColumnVisibility) window.applyAuditColumnVisibility();
  }

  function loadAndRender() {
    var tbody = document.getElementById("audit-tbody");
    var myToken = ++loadToken;
    if (tbody && !currentRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-muted);">Laden…</td></tr>';
    }
    if (!window.auditDB || !window.auditDB.fetchPage) { console.error("[audit] auditDB.fetchPage niet beschikbaar"); return; }
    window.auditDB.fetchPage({
      page: state.page, perPage: state.rowsPerPage,
      sortKey: state.sortKey, sortDir: state.sortDir,
      search: state.search, resource: state.filterResource,
      actie: state.filterActie, veroorzaker: state.filterVeroorzaker,
    }).then(function (res) {
      if (myToken !== loadToken) return; // verouderde respons negeren
      currentRows = (res && res.rows) || [];
      currentTotal = (res && res.total) || 0;
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      var totalPages = Math.max(1, Math.ceil(currentTotal / rpp));
      if (state.page > totalPages) { state.page = totalPages; loadAndRender(); return; }
      renderRows();
    }).catch(function (err) {
      if (myToken !== loadToken) return;
      console.error("[audit] laden mislukt", err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--red);">Laden mislukt: ' + escapeHtml(err && err.message || err) + '</td></tr>';
    });
  }

  function fillSelect(id, values, allLabel, labelFn) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var prev = sel.value || "";
    sel.innerHTML = '<option value="">' + allLabel + '</option>';
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = labelFn ? labelFn(v) : v;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  function loadFilterOptions() {
    if (!window.auditDB || !window.auditDB.fetchFilterOptions) return;
    window.auditDB.fetchFilterOptions().then(function (o) {
      fillSelect("audit-filter-resource", o.resources || [], "Alle resources");
      fillSelect("audit-filter-veroorzaker", o.veroorzakers || [], "Alle veroorzakers");
      fillSelect("audit-filter-actie", o.acties || [], "Alle actie-types", actieLabel);
    }).catch(function (e) { console.warn("[audit] filter-opties:", e); });
  }

  function wireEvents() {
    var refreshBtn = document.getElementById("audit-refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { loadFilterOptions(); loadAndRender(); });

    document.getElementById("audit-search").addEventListener("input", function (e) {
      state.search = e.target.value || "";
      state.page = 1;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(loadAndRender, 300);
    });
    document.getElementById("audit-filter-resource").addEventListener("change", function (e) { state.filterResource = e.target.value || ""; state.page = 1; loadAndRender(); });
    document.getElementById("audit-filter-actie").addEventListener("change", function (e) { state.filterActie = e.target.value || ""; state.page = 1; loadAndRender(); });
    var verSel = document.getElementById("audit-filter-veroorzaker");
    if (verSel) verSel.addEventListener("change", function (e) { state.filterVeroorzaker = e.target.value || ""; state.page = 1; loadAndRender(); });

    var resetBtn = document.getElementById("audit-filter-reset");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      state.search = ""; state.filterResource = ""; state.filterActie = ""; state.filterVeroorzaker = ""; state.page = 1;
      ["audit-search", "audit-filter-resource", "audit-filter-actie", "audit-filter-veroorzaker"].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = "";
      });
      loadAndRender();
    });

    buildAuditColumnsPanel();
    wireAuditColumnsPanel();
    wireSortHeaders();

    document.getElementById("audit-rows-per-page").addEventListener("change", function (e) {
      state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; loadAndRender();
    });
    document.getElementById("audit-pager-first").addEventListener("click", function () { if (state.page !== 1) { state.page = 1; loadAndRender(); } });
    document.getElementById("audit-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; loadAndRender(); } });
    document.getElementById("audit-pager-next").addEventListener("click", function () { state.page += 1; loadAndRender(); });
    document.getElementById("audit-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(currentTotal / rpp));
      loadAndRender();
    });
  }

  // ---- Kolommen-kiezer (ongewijzigd patroon) ----
  var AUDIT_COLUMN_CONFIG = [
    { id: "tijdstip", label: "Tijdstip", defaultOn: true },
    { id: "gebruiker", label: "Gebruiker", defaultOn: true },
    { id: "resource", label: "Resource", defaultOn: true },
    { id: "resource_id", label: "Resource ID", defaultOn: true },
    { id: "actie", label: "Actie", defaultOn: true, skipToggle: true },
    { id: "details", label: "Details", defaultOn: true },
    { id: "status", label: "Status", defaultOn: true },
  ];
  var AUDIT_COLUMNS_PREFS_KEY = "audit_columns_v1";
  function readAuditColumnPrefs() {
    try { var raw = localStorage.getItem(AUDIT_COLUMNS_PREFS_KEY); return raw ? JSON.parse(raw) || {} : {}; }
    catch (e) { return {}; }
  }
  function writeAuditColumnPrefs(p) {
    try { localStorage.setItem(AUDIT_COLUMNS_PREFS_KEY, JSON.stringify(p || {})); } catch (e) { /* */ }
  }
  function setAuditColumnVisible(colId, visible) {
    document.querySelectorAll('#audit-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyAuditColumnVisibility() {
    var prefs = readAuditColumnPrefs();
    AUDIT_COLUMN_CONFIG.forEach(function (c) {
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      setAuditColumnVisible(c.id, on);
    });
  }
  window.applyAuditColumnVisibility = applyAuditColumnVisibility;
  function buildAuditColumnsPanel() {
    var list = document.getElementById("audit-columns-list");
    if (!list) return;
    var prefs = readAuditColumnPrefs();
    list.innerHTML = "";
    AUDIT_COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitemcheckbox");
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.setAttribute("data-col", c.id);
      btn.className = "column-toggle" + (on ? " is-checked" : "");
      btn.innerHTML = '<span class="column-check" aria-hidden="true">' + (on ? "✓" : "") + '</span> ' + c.label;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOn = btn.getAttribute("aria-checked") === "true";
        var nextOn = !isOn;
        btn.setAttribute("aria-checked", nextOn ? "true" : "false");
        btn.classList.toggle("is-checked", nextOn);
        btn.querySelector(".column-check").textContent = nextOn ? "✓" : "";
        var p = readAuditColumnPrefs();
        p[c.id] = nextOn;
        writeAuditColumnPrefs(p);
        applyAuditColumnVisibility();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }
  function wireAuditColumnsPanel() {
    var btn = document.getElementById("audit-columns-menu-btn");
    var panel = document.getElementById("audit-columns-panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !panel.hasAttribute("hidden");
      if (open) { panel.setAttribute("hidden", ""); btn.setAttribute("aria-expanded", "false"); }
      else { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
    });
    document.addEventListener("click", function (e) {
      if (panel.hasAttribute("hidden")) return;
      if (e.target.closest("#audit-columns-panel") || e.target.closest("#audit-columns-menu-btn")) return;
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    });
    applyAuditColumnVisibility();
  }

  function init() {
    if (!window.auditDB) { console.error("[audit] auditDB niet geladen"); return; }
    wireEvents();
    wireDetailModal();
    loadFilterOptions();
    loadAndRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
