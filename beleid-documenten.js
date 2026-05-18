/* global window, document, localStorage */
/**
 * beleid-documenten.js — page-script voor /beleid-documenten.html.
 *
 * TOP-BAR Beleid (BS2 PRODUCTIE /documents). APART van beleid.html.
 * 1-op-1 BS2: kolommen Naam · Uploaddatum · Laatst gewijzigd · Acties;
 * "Zoeken..." + Reset + Kolommen-chooser; footer "X of Y total." /
 * "Rows per page" / "Page N of M" (15/pagina = BS2). Hele rij klikbaar →
 * document openen (signed URL). Archiveren/verwijderen via slider-modals.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 15; // BS2 documents per_page = 15
  var COLS_KEY = "beleid_documenten_cols_v1";
  var ALL_COLS = ["naam", "uploaddatum", "gewijzigd"];

  var state = { search: "", page: 1, rowsPerPage: ROWS_PER_PAGE_DEFAULT, sortKey: "name", sortDir: "asc", cols: null, archivingId: null, purgingId: null };

  function loadCols() {
    var on = {}; ALL_COLS.forEach(function (c) { on[c] = true; });
    try { var raw = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); if (raw && typeof raw === "object") ALL_COLS.forEach(function (c) { if (c in raw) on[c] = !!raw[c]; }); } catch (e) {}
    return on;
  }
  function saveCols() { try { localStorage.setItem(COLS_KEY, JSON.stringify(state.cols)); } catch (e) {} }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var t = Date.parse(iso);
    if (!isFinite(t)) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? m[3] + "-" + m[2] + "-" + m[1] : "—"; }
    try {
      var p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(t));
      var g = {}; p.forEach(function (x) { g[x.type] = x.value; });
      return g.day + "-" + g.month + "-" + g.year + " " + g.hour + ":" + g.minute;
    } catch (e) {
      var d = new Date(t), pad = function (n) { return String(n).padStart(2, "0"); };
      return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }
  }
  function trashSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  }
  function eyeSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function getVisible() {
    var items = (window.beleidDocumentenDB && window.beleidDocumentenDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    var list = items.filter(function (r) {
      if (!r) return false;
      if (r.archived) return false;
      if (!q) return true;
      return String(r.name || "").toLowerCase().indexOf(q) >= 0;
    });
    var dir = state.sortDir === "desc" ? -1 : 1;
    var f = { name: "name", uploaddatum: "uploaddatum", gewijzigd: "laatstGewijzigd" }[state.sortKey] || "name";
    list.sort(function (a, b) {
      var av = String(a[f] || "").toLowerCase(), bv = String(b[f] || "").toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return list;
  }

  function applyColVisibility() {
    var c = state.cols, tbl = document.getElementById("bd-table");
    if (!tbl) return;
    tbl.querySelectorAll("[data-col]").forEach(function (el) {
      var col = el.getAttribute("data-col");
      if (col in c) el.style.display = c[col] ? "" : "none";
    });
  }

  function renderRow(r) {
    var actions = r.archived
      ? '<div class="hr-row-actions">'
        + '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(r.id) + '">Herstel</button>'
        + '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(r.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button></div>'
      : '<button class="icon-btn" data-action="view" data-id="' + escapeHtml(r.id) + '" title="Bekijken" aria-label="Bekijken" style="margin-right:6px">' + eyeSvg() + '</button>'
        + '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(r.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';
    return '<tr data-id="' + escapeHtml(r.id) + '" class="me-row" style="cursor:pointer">' +
      '<td data-col="naam"><span style="font-weight:600;color:var(--blue);">' + escapeHtml(r.name || "—") + '</span></td>' +
      '<td data-col="uploaddatum">' + escapeHtml(fmtDateTime(r.uploaddatum)) + '</td>' +
      '<td data-col="gewijzigd">' + escapeHtml(fmtDateTime(r.laatstGewijzigd)) + '</td>' +
      '<td data-col="acties" class="hr-actions-cell" style="text-align:right">' + actions + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("bd-tbody");
    if (!tbody) return;
    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);
    tbody.innerHTML = pageItems.length ? pageItems.map(renderRow).join("")
      : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Geen documenten</td></tr>';
    applyColVisibility();
    var to = Math.min(start + rpp, total);
    var cnt = document.getElementById("bd-pager-count");
    if (cnt) cnt.textContent = (total ? (to - start) : 0) + " of " + total + " total.";
    var pg = document.getElementById("bd-pager-page");
    if (pg) pg.textContent = "Page " + state.page + " of " + totalPages;
    [["bd-pager-first", state.page <= 1], ["bd-pager-prev", state.page <= 1], ["bd-pager-next", state.page >= totalPages], ["bd-pager-last", state.page >= totalPages]].forEach(function (x) {
      var el = document.getElementById(x[0]); if (el) el.disabled = x[1];
    });
    document.querySelectorAll("#bd-table th.me-th-sort").forEach(function (th) {
      var key = th.getAttribute("data-sort");
      th.classList.toggle("me-sorted-asc", key === state.sortKey && state.sortDir === "asc");
      th.classList.toggle("me-sorted-desc", key === state.sortKey && state.sortDir === "desc");
    });
  }

  async function openDoc(id) {
    try {
      var url = await window.beleidDocumentenDB.getFileUrl(id);
      if (url) window.open(url, "_blank", "noopener");
      else if (window.showError) window.showError("Geen bestand gekoppeld aan dit document.");
    } catch (e) { if (window.showError) window.showError("Openen mislukt: " + (e && e.message || e)); }
  }

  function setupSlider(sliderId, btnId) {
    var s = document.getElementById(sliderId), b = document.getElementById(btnId);
    if (!s || !b) return;
    s.addEventListener("input", function () { var p = Number(s.value); s.style.setProperty("--employee-slider-pct", p + "%"); b.disabled = p < 100; });
  }
  function openModal(which, item) {
    state[which === "archive" ? "archivingId" : "purgingId"] = item.id;
    var m = document.getElementById("bd-" + which + "-modal");
    document.getElementById("bd-" + which + "-preview").textContent = item.name || "";
    var sl = document.getElementById("bd-" + which + "-slider");
    sl.value = 0; sl.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("bd-" + which + "-confirm-btn").disabled = true;
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
  }
  function closeModal(which) {
    var m = document.getElementById("bd-" + which + "-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }

  function doUpload(file) {
    if (!file) return;
    // BS1-huisstijl "+ toevoegen": upload bestand → Storage + rij.
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        var id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ("d_" + Date.now());
        var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        var sp = id + "/" + file.name.replace(/[\\/:*?"<>|]+/g, "_");
        var blob = new Blob([reader.result], { type: file.type || "application/octet-stream" });
        var upl = await window.besaSupabase.storage.from("beleid-documenten").upload(sp, blob, { upsert: true, contentType: file.type || "application/octet-stream" });
        if (upl.error) throw upl.error;
        await window.beleidDocumentenDB.add({ id: id, name: file.name.replace(/\.[a-z0-9]+$/i, ""), storagePath: sp, fileName: file.name, fileExtension: ext, fileSize: file.size });
        if (window.showActionFeedback) window.showActionFeedback("saved", file.name);
        render();
      } catch (e) { if (window.showError) window.showError("Uploaden mislukt: " + (e && e.message || e)); }
    };
    reader.readAsArrayBuffer(file);
  }

  function wire() {
    var fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx"; fileInput.style.display = "none";
    document.body.appendChild(fileInput);
    fileInput.addEventListener("change", function () { if (fileInput.files && fileInput.files[0]) { doUpload(fileInput.files[0]); fileInput.value = ""; } });
    document.getElementById("bd-upload-btn").addEventListener("click", function () { fileInput.click(); });

    document.getElementById("bd-search").addEventListener("input", function (e) { state.search = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("bd-reset").addEventListener("click", function () { state.search = ""; var s = document.getElementById("bd-search"); if (s) s.value = ""; state.page = 1; render(); });

    document.querySelectorAll("#bd-table th.me-th-sort").forEach(function (th) {
      th.style.cursor = "pointer";
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = "asc"; }
        state.page = 1; render();
      });
    });

    var colsBtn = document.getElementById("bd-cols-btn");
    if (colsBtn) colsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var p = document.getElementById("bd-cols-panel");
      if (p.hasAttribute("hidden")) { p.removeAttribute("hidden"); colsBtn.setAttribute("aria-expanded", "true"); }
      else { p.setAttribute("hidden", ""); colsBtn.setAttribute("aria-expanded", "false"); }
    });
    document.querySelectorAll("#bd-cols-panel input[type=checkbox]").forEach(function (cb) {
      cb.checked = !!state.cols[cb.getAttribute("data-col")];
      cb.addEventListener("change", function () { state.cols[cb.getAttribute("data-col")] = cb.checked; saveCols(); applyColVisibility(); });
    });
    document.addEventListener("click", function (e) {
      var p = document.getElementById("bd-cols-panel");
      if (!p || p.hasAttribute("hidden")) return;
      if (e.target.closest("#bd-cols-panel") || e.target.closest("#bd-cols-btn")) return;
      p.setAttribute("hidden", ""); if (colsBtn) colsBtn.setAttribute("aria-expanded", "false");
    });

    document.getElementById("bd-rows-per-page").addEventListener("change", function (e) { state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render(); });
    document.getElementById("bd-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("bd-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("bd-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("bd-pager-last").addEventListener("click", function () { state.page = Math.max(1, Math.ceil(getVisible().length / (state.rowsPerPage || ROWS_PER_PAGE_DEFAULT))); render(); });

    document.getElementById("bd-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (btn) {
        e.stopPropagation();
        var id = btn.getAttribute("data-id");
        var item = window.beleidDocumentenDB.getByIdSync(id);
        if (!item) return;
        var act = btn.getAttribute("data-action");
        if (act === "view") openDoc(id);
        else if (act === "archive") openModal("archive", item);
        else if (act === "purge") openModal("purge", item);
        else if (act === "restore") window.beleidDocumentenDB.restore(id).then(function () { if (window.showActionFeedback) window.showActionFeedback("restored", item.name); }).catch(function (err) { if (window.showError) window.showError("Herstellen mislukt: " + err.message); });
        return;
      }
      var tr = e.target.closest("tr[data-id]");
      if (tr) openDoc(tr.getAttribute("data-id"));
    });

    setupSlider("bd-archive-slider", "bd-archive-confirm-btn");
    setupSlider("bd-purge-slider", "bd-purge-confirm-btn");
    document.getElementById("bd-archive-close-btn").addEventListener("click", function () { closeModal("archive"); });
    document.getElementById("bd-archive-cancel-btn").addEventListener("click", function () { closeModal("archive"); });
    document.getElementById("bd-purge-close-btn").addEventListener("click", function () { closeModal("purge"); });
    document.getElementById("bd-purge-cancel-btn").addEventListener("click", function () { closeModal("purge"); });
    document.getElementById("bd-archive-confirm-btn").addEventListener("click", function () {
      var id = state.archivingId; if (!id) return;
      var item = window.beleidDocumentenDB.getByIdSync(id);
      window.beleidDocumentenDB.archive(id).then(function () { if (window.showActionFeedback) window.showActionFeedback("archived", item && item.name || ""); closeModal("archive"); })
        .catch(function (err) { if (window.showError) window.showError("Archiveren mislukt: " + err.message); closeModal("archive"); });
    });
    document.getElementById("bd-purge-confirm-btn").addEventListener("click", function () {
      var id = state.purgingId; if (!id) return;
      var item = window.beleidDocumentenDB.getByIdSync(id);
      window.beleidDocumentenDB.delete(id).then(function () { if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.name || ""); closeModal("purge"); })
        .catch(function (err) { if (window.showError) window.showError("Verwijderen mislukt: " + err.message); closeModal("purge"); });
    });
    ["bd-archive-modal", "bd-purge-modal"].forEach(function (mid) {
      var m = document.getElementById(mid);
      if (m) m.addEventListener("click", function (e) { if (e.target === m) closeModal(mid === "bd-archive-modal" ? "archive" : "purge"); });
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var pm = document.getElementById("bd-purge-modal"), am = document.getElementById("bd-archive-modal");
      if (pm && !pm.hasAttribute("hidden")) { ev.stopPropagation(); closeModal("purge"); }
      else if (am && !am.hasAttribute("hidden")) { ev.stopPropagation(); closeModal("archive"); }
    });

    window.addEventListener("besa:beleid-documenten-updated", render);
  }

  function init() {
    if (!window.beleidDocumentenDB) { console.error("[beleid] beleidDocumentenDB niet geladen"); return; }
    state.cols = loadCols();
    wire();
    render();
    window.beleidDocumentenDB.ready.then(render);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
