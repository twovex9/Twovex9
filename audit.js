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
    // Sprint 16 / S16 — BS2 parity uitbreidingen
    filterVeroorzaker: "",
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

  var ACTIE_LABELS = {
    aanmaken: "Aanmaken",
    bewerken: "Bewerken",
    bekijken: "Bekijken",
    verwijderen: "Verwijderen",
    archiveren: "Archiveren",
    herstellen: "Herstellen",
    status_wijziging: "Status",
  };

  function actieBadge(actie) {
    var label = ACTIE_LABELS[actie] || actie || "";
    var style = "padding:2px 8px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;";
    if (actie === "aanmaken") style += "color:var(--green);background:var(--green-soft);";
    else if (actie === "bekijken") style += "color:var(--blue);background:var(--blue-soft);";
    else if (actie === "bewerken") style += "color:var(--yellow);background:var(--yellow-soft);";
    else if (actie === "verwijderen") style += "color:var(--red);background:var(--red-soft);";
    else if (actie === "archiveren") style += "color:var(--yellow);background:var(--yellow-soft);";
    else if (actie === "herstellen") style += "color:var(--green);background:var(--green-soft);";
    else if (actie === "status_wijziging") style += "color:var(--blue);background:var(--blue-soft);";
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
      // Sprint 16 / S16 — veroorzaker filter (mirror BS2)
      if (state.filterVeroorzaker && String(a.gebruiker || "") !== state.filterVeroorzaker) return false;
      if (!q) return true;
      var hay = (a.gebruiker || "") + " " + (a.resourceType || "") + " " + (a.resourceId || "") + " " + (a.actieType || "") + " " + (a.details || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  // Sprint 16 / S16 — vul Veroorzaker dropdown met unieke gebruikers uit data
  function populateVeroorzakerFilter() {
    var sel = document.getElementById("audit-filter-veroorzaker");
    if (!sel) return;
    var prev = sel.value || "";
    var items = (window.auditDB && window.auditDB.getAllSync()) || [];
    var users = [...new Set(items.map(function (a) { return a && a.gebruiker; }).filter(Boolean))].sort(function (a, b) {
      return String(a).localeCompare(String(b), "nl", { sensitivity: "base" });
    });
    sel.innerHTML = '<option value="">Alle veroorzakers</option>';
    users.forEach(function (u) {
      var opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  function renderRow(a) {
    // Bug #64 fix: data-col op elke <td> zodat Kolommen-kiezer-hide
    // ook de data-cellen verbergt (niet alleen de <th> headers).
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

  // --------------------------------------------------------------------------
  // Audit detail modal — toont volledige info voor één event
  // --------------------------------------------------------------------------
  function buildDetailRow(label, valueHtml) {
    return '<div class="audit-detail-row">'
      + '<dt class="audit-detail-label">' + escapeHtml(label) + '</dt>'
      + '<dd class="audit-detail-value">' + valueHtml + '</dd>'
      + '</div>';
  }

  function renderDetailBody(a) {
    if (!a) return '<p style="color:var(--text-muted);">Geen data.</p>';
    var rows = '';
    rows += buildDetailRow("Tijdstip", escapeHtml(fmtTime(a.tijdstip)) + ' <span style="color:var(--text-muted);font-size:12px;">(' + escapeHtml(a.tijdstip || "") + ')</span>');
    rows += buildDetailRow("Gebruiker", escapeHtml(a.gebruiker || "—"));
    rows += buildDetailRow("Resource", escapeHtml(a.resourceType || "—"));
    rows += buildDetailRow("Resource ID", '<span style="font-family:monospace;font-size:12px;">' + escapeHtml(a.resourceId || "—") + '</span>');
    rows += buildDetailRow("Actie", actieBadge(a.actieType));
    rows += buildDetailRow("Status", statusBadge(a.status));
    rows += buildDetailRow("Bron", escapeHtml(a.bron === "beschikking" ? "beschikking_audit_log (legacy)" : "audit_log (generic)"));

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
    var items = (window.auditDB && window.auditDB.getAllSync()) || [];
    var entry = items.find(function (x) { return x && String(x.id) === String(auditId); });
    var overlay = document.getElementById("audit-detail-overlay");
    var body = document.getElementById("audit-detail-body");
    var title = document.getElementById("audit-detail-title");
    if (!overlay || !body) return;
    if (entry && title) {
      title.textContent = (entry.resourceType || "Audit-event") + (entry.actieType ? " — " + entry.actieType : "");
    }
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
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeDetailModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && !overlay.hidden) closeDetailModal();
    });

    var tbody = document.getElementById("audit-tbody");
    if (!tbody) return;
    tbody.addEventListener("click", function (e) {
      var row = e.target.closest("tr.audit-row");
      if (!row) return;
      var id = row.getAttribute("data-audit-id");
      if (id) openDetailModal(id);
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

    // Sprint 16 / S16 — veroorzaker + reset + kolommen
    var verSel = document.getElementById("audit-filter-veroorzaker");
    if (verSel) {
      populateVeroorzakerFilter();
      verSel.addEventListener("change", function (e) { state.filterVeroorzaker = e.target.value || ""; state.page = 1; render(); });
      window.addEventListener("besa:audit-updated", populateVeroorzakerFilter);
    }
    var resetBtn = document.getElementById("audit-filter-reset");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      state.search = ""; state.filterResource = ""; state.filterActie = ""; state.filterVeroorzaker = ""; state.page = 1;
      ["audit-search", "audit-filter-resource", "audit-filter-actie", "audit-filter-veroorzaker"].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = "";
      });
      render();
      if (window.showActionFeedback) window.showActionFeedback("info", "Filters gewist", "Alle audit-filters zijn teruggezet.");
    });
    buildAuditColumnsPanel();
    wireAuditColumnsPanel();
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

  /**
   * Sprint 16 / S16 — Kolommen-kiezer (zelfde pattern als beleid.js).
   * Configureerbare zichtbaarheid van audit-tabel kolommen.
   */
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
      btn.className = "column-toggle";
      btn.innerHTML = '<span class="column-toggle-check" aria-hidden="true">' +
        (on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
        '</span><span class="column-toggle-label">' + c.label + '</span>';
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOn = btn.getAttribute("aria-checked") === "true";
        var nextOn = !isOn;
        btn.setAttribute("aria-checked", nextOn ? "true" : "false");
        btn.querySelector(".column-toggle-check").innerHTML = nextOn
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : "";
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
      var open = btn.getAttribute("aria-expanded") === "true";
      if (open) { panel.setAttribute("hidden", ""); btn.setAttribute("aria-expanded", "false"); }
      else { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
    });
    document.addEventListener("click", function () {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    });
    applyAuditColumnVisibility();
  }

  function init() {
    if (!window.auditDB) { console.error("[audit] auditDB niet geladen"); return; }
    wireEvents();
    wireDetailModal();
    render();
    window.auditDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
