/* global window, document, localStorage */
/**
 * beleid-documenten.js — page-script voor /beleid-documenten.html.
 *
 * TOP-BAR Beleid (BS2 PRODUCTIE /documents). APART van beleid.html.
 * 1-op-1 BS2: kolommen Naam · Uploaddatum · Laatst gewijzigd · Acties
 * (3 icoontjes naast elkaar: 👁 bekijken · ✏️ Document bewerken · 🗑
 * verwijderen via slider-bevestiging). "Zoeken..." + Reset + Kolommen.
 * Footer "X of Y total." / "Rows per page" / "Page N of M" (15/pagina).
 * Default-volgorde = nieuwste upload eerst (created_at desc) = BS2.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 15;
  var COLS_KEY = "beleid_documenten_cols_v1";
  var ALL_COLS = ["naam", "uploaddatum", "gewijzigd"];

  var state = { search: "", page: 1, rowsPerPage: ROWS_PER_PAGE_DEFAULT, sortKey: "uploaddatum", sortDir: "desc", cols: null, editId: null, delId: null, pendingFile: null, pendingRemove: false };

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
  var SVG_EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SVG_PEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var SVG_TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';

  function getVisible() {
    var items = (window.beleidDocumentenDB && window.beleidDocumentenDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    var list = items.filter(function (r) {
      if (!r) return false;
      if (!q) return true;
      return String(r.name || "").toLowerCase().indexOf(q) >= 0;
    });
    var dir = state.sortDir === "desc" ? -1 : 1;
    var f = { name: "name", uploaddatum: "uploaddatum", gewijzigd: "laatstGewijzigd" }[state.sortKey] || "name";
    list.sort(function (a, b) {
      var av = String(a[f] || "").toLowerCase(), bv = String(b[f] || "").toLowerCase();
      if (av !== bv) return av < bv ? -dir : dir;
      var an = String(a.name || "").toLowerCase(), bn = String(b.name || "").toLowerCase();
      return an < bn ? 1 : an > bn ? -1 : 0;
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
    var id = escapeHtml(r.id);
    var actions = '<div class="bd-acties-cell">' +
      '<button class="bd-act-btn" data-action="view" data-id="' + id + '" title="Bekijken" aria-label="Bekijken">' + SVG_EYE + '</button>' +
      '<button class="bd-act-btn" data-action="edit" data-id="' + id + '" title="Document bewerken" aria-label="Document bewerken">' + SVG_PEN + '</button>' +
      '<button class="bd-act-btn bd-act-btn--del" data-action="delete" data-id="' + id + '" title="Verwijderen" aria-label="Verwijderen">' + SVG_TRASH + '</button>' +
      '</div>';
    return '<tr data-id="' + id + '" class="me-row" style="cursor:pointer">' +
      '<td data-col="naam"><span style="font-weight:600;color:var(--blue);">' + escapeHtml(r.name || "—") + '</span></td>' +
      '<td data-col="uploaddatum">' + escapeHtml(fmtDateTime(r.uploaddatum)) + '</td>' +
      '<td data-col="gewijzigd">' + escapeHtml(fmtDateTime(r.laatstGewijzigd)) + '</td>' +
      '<td data-col="acties" class="bd-acties-cell">' + actions + '</td>' +
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

  // ---- Document bewerken ----
  function openEdit(item) {
    state.editId = item.id; state.pendingFile = null; state.pendingRemove = false;
    document.getElementById("bd-edit-naam").value = item.name || "";
    var fb = document.getElementById("bd-edit-filename");
    fb.textContent = item.fileName || (item.name ? item.name + (item.fileExtension ? "." + item.fileExtension : "") : "(geen bestand)");
    var box = document.getElementById("bd-edit-filebox");
    if (box) box.style.display = "";
    var m = document.getElementById("bd-edit-modal");
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
    setTimeout(function () { var n = document.getElementById("bd-edit-naam"); if (n) n.focus(); }, 50);
  }
  function closeEdit() {
    state.editId = null; state.pendingFile = null; state.pendingRemove = false;
    var m = document.getElementById("bd-edit-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function saveEdit() {
    var id = state.editId;
    if (!id) return;
    var item = window.beleidDocumentenDB.getByIdSync(id);
    if (!item) { closeEdit(); return; }
    var btn = document.getElementById("bd-edit-save-btn");
    btn.disabled = true;
    try {
      var patch = { name: (document.getElementById("bd-edit-naam").value || "").trim() };
      if (state.pendingRemove && item.storagePath) {
        try { await window.besaSupabase.storage.from("beleid-documenten").remove([item.storagePath]); } catch (e) {}
        patch.storagePath = null; patch.fileName = null; patch.fileExtension = null; patch.fileSize = null;
      } else if (state.pendingFile) {
        var file = state.pendingFile;
        var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        var sp = id + "/" + file.name.replace(/[\\/:*?"<>|]+/g, "_");
        var ab = await file.arrayBuffer();
        var upl = await window.besaSupabase.storage.from("beleid-documenten").upload(sp, new Blob([ab], { type: file.type || "application/octet-stream" }), { upsert: true, contentType: file.type || "application/octet-stream" });
        if (upl.error) throw upl.error;
        if (item.storagePath && item.storagePath !== sp) { try { await window.besaSupabase.storage.from("beleid-documenten").remove([item.storagePath]); } catch (e) {} }
        patch.storagePath = sp; patch.fileName = file.name; patch.fileExtension = ext; patch.fileSize = file.size;
      }
      await window.beleidDocumentenDB.update(id, patch);
      if (window.showActionFeedback) window.showActionFeedback("saved", patch.name || "Document");
      closeEdit(); render();
    } catch (e) {
      if (window.showError) window.showError("Opslaan mislukt: " + (e && e.message || e));
    } finally { btn.disabled = false; }
  }

  // ---- Verwijderen (slider-bevestiging) ----
  function setupSlider(sliderId, btnId) {
    var s = document.getElementById(sliderId), b = document.getElementById(btnId);
    if (!s || !b) return;
    s.addEventListener("input", function () { var p = Number(s.value); s.style.setProperty("--employee-slider-pct", p + "%"); b.disabled = p < 100; });
  }
  function openDel(item) {
    state.delId = item.id;
    var m = document.getElementById("bd-purge-modal");
    document.getElementById("bd-purge-preview").textContent = item.name || "";
    var sl = document.getElementById("bd-purge-slider");
    sl.value = 0; sl.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("bd-purge-confirm-btn").disabled = true;
    m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false");
  }
  function closeDel() {
    state.delId = null;
    var m = document.getElementById("bd-purge-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function confirmDel() {
    var id = state.delId; if (!id) return;
    var item = window.beleidDocumentenDB.getByIdSync(id);
    try {
      await window.beleidDocumentenDB.delete(id); // verwijdert ook het Storage-bestand
      if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.name || "");
      closeDel(); render();
    } catch (e) {
      if (window.showError) window.showError("Verwijderen mislukt: " + (e && e.message || e));
      closeDel();
    }
  }

  function doUpload(file) {
    if (!file) return;
    file.arrayBuffer().then(async function (ab) {
      try {
        var id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ("d_" + Date.now());
        var ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
        var sp = id + "/" + file.name.replace(/[\\/:*?"<>|]+/g, "_");
        var upl = await window.besaSupabase.storage.from("beleid-documenten").upload(sp, new Blob([ab], { type: file.type || "application/octet-stream" }), { upsert: true, contentType: file.type || "application/octet-stream" });
        if (upl.error) throw upl.error;
        await window.beleidDocumentenDB.add({ id: id, name: file.name.replace(/\.[a-z0-9]+$/i, ""), storagePath: sp, fileName: file.name, fileExtension: ext, fileSize: file.size });
        if (window.showActionFeedback) window.showActionFeedback("saved", file.name);
        render();
      } catch (e) { if (window.showError) window.showError("Uploaden mislukt: " + (e && e.message || e)); }
    });
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
        else { state.sortKey = key; state.sortDir = key === "name" ? "asc" : "desc"; }
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
        else if (act === "edit") openEdit(item);
        else if (act === "delete") openDel(item);
        return;
      }
      var tr = e.target.closest("tr[data-id]");
      if (tr) openDoc(tr.getAttribute("data-id"));
    });

    // edit-modal
    document.getElementById("bd-edit-close-btn").addEventListener("click", closeEdit);
    document.getElementById("bd-edit-cancel-btn").addEventListener("click", closeEdit);
    document.getElementById("bd-edit-save-btn").addEventListener("click", saveEdit);
    var efi = document.getElementById("bd-edit-fileinput");
    document.getElementById("bd-edit-change").addEventListener("click", function () { efi.click(); });
    efi.addEventListener("change", function () {
      if (efi.files && efi.files[0]) {
        state.pendingFile = efi.files[0]; state.pendingRemove = false;
        document.getElementById("bd-edit-filename").textContent = efi.files[0].name + "  (nieuw)";
      }
    });
    document.getElementById("bd-edit-remove").addEventListener("click", function () {
      state.pendingRemove = true; state.pendingFile = null;
      document.getElementById("bd-edit-filename").textContent = "(bestand wordt verwijderd)";
    });
    var em = document.getElementById("bd-edit-modal");
    if (em) em.addEventListener("click", function (e) { if (e.target === em) closeEdit(); });

    // delete-modal (slider)
    setupSlider("bd-purge-slider", "bd-purge-confirm-btn");
    document.getElementById("bd-purge-close-btn").addEventListener("click", closeDel);
    document.getElementById("bd-purge-cancel-btn").addEventListener("click", closeDel);
    document.getElementById("bd-purge-confirm-btn").addEventListener("click", confirmDel);
    var dm = document.getElementById("bd-purge-modal");
    if (dm) dm.addEventListener("click", function (e) { if (e.target === dm) closeDel(); });

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var d = document.getElementById("bd-purge-modal"), ed = document.getElementById("bd-edit-modal");
      if (d && !d.hasAttribute("hidden")) { ev.stopPropagation(); closeDel(); }
      else if (ed && !ed.hasAttribute("hidden")) { ev.stopPropagation(); closeEdit(); }
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
