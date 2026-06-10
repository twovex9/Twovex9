/* global window, document */
/**
 * verbeteringsmaatregelen.js — page-script voor verbeteringsmaatregelen.html.
 *
 * Bron-van-waarheid: window.verbeteringsmaatregelenDB (Supabase via
 * verbeteringsmaatregelen-data.js).
 *
 * Functionaliteit:
 *   - Lijst alle verbeteringsmaatregelen.
 *   - Zoeken (titel + beschrijving).
 *   - Toggle "Gearchiveerd" (toont gearchiveerde items).
 *   - Toggle "Afgerond" (toont afgeronde items).
 *   - Sortering per kolom (titel/beschrijving/cliënt/status/aangemaakt).
 *   - Optionele cliënt-koppeling (select in toevoeg/bewerk-modal, kolom Cliënt).
 *   - Paginatie (15/30/50/100).
 *   - Kolom-zichtbaarheid via Kolommen-knop.
 *   - Modal toevoegen / bewerken.
 *   - Slider-confirm voor archiveren / definitief verwijderen.
 *   - Live re-render bij `besa:verbeteringsmaatregelen-updated`.
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

  var state = {
    search: "",
    showArchived: false,
    showAfgerond: false,
    page: 1,
    pageSize: 15,
    editingId: null,
    archivingId: null,
    purgingId: null,
    sortKey: "aangemaakt",
    sortDir: "desc",
  };

  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("vm-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 500);
  }

  var MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function formatNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return d.getDate() + " " + MONTHS_NL[d.getMonth()] + " " + d.getFullYear();
  }

  function getAll() {
    if (!window.verbeteringsmaatregelenDB) return [];
    try { return window.verbeteringsmaatregelenDB.getAllSync() || []; } catch (e) { return []; }
  }

  // ---------------------------------------------------------------------------
  // Cliënten (optionele koppeling)
  // ---------------------------------------------------------------------------
  function getAllClienten() {
    if (!window.clientenDB) return [];
    try { return window.clientenDB.getAllSync() || []; } catch (e) { return []; }
  }
  function getClientById(id) {
    if (!id) return null;
    var s = String(id);
    return getAllClienten().find(function (c) { return c && String(c.id) === s; }) || null;
  }
  function clientSelectLabel(c) {
    if (!c) return "—";
    var nm = ((c.achternaam || "") + ", " + (c.voornaam || "")).replace(/^,\s*|,\s*$/g, "").trim();
    if (!nm) nm = "—";
    if (c.clientnummer) nm += " (" + c.clientnummer + ")";
    return nm;
  }
  function clientCellLabel(c) {
    if (!c) return "—";
    var nm = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
    return nm || "—";
  }
  function fillClientSelect(selectEl, selectedId) {
    if (!selectEl) return;
    var sel = selectedId ? String(selectedId) : "";
    var clients = getAllClienten()
      .filter(function (c) { return c && (!c.archived || String(c.id) === sel); })
      .sort(function (a, b) {
        var cmp = (a.achternaam || "").localeCompare(b.achternaam || "", "nl", { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return (a.voornaam || "").localeCompare(b.voornaam || "", "nl", { sensitivity: "base" });
      });
    selectEl.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "— Geen cliënt —";
    selectEl.appendChild(noneOpt);
    clients.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = clientSelectLabel(c);
      selectEl.appendChild(opt);
    });
    selectEl.value = sel && getClientById(sel) ? sel : "";
  }

  function sortValue(rec, key) {
    if (!rec) return "";
    if (key === "status") {
      if (rec.archived) return 2;
      if (rec.afgerond) return 1;
      return 0;
    }
    if (key === "aangemaakt") {
      var t = Date.parse(rec.aanmaakdatum || "");
      return isFinite(t) ? t : 0;
    }
    if (key === "beschrijving") return (rec.beschrijving || "").toLowerCase();
    if (key === "client") {
      var cl = getClientById(rec.clientId);
      return cl ? clientCellLabel(cl).toLowerCase() : "";
    }
    return (rec.titel || "").toLowerCase();
  }

  function getFiltered() {
    var items = getAll().slice();
    if (!state.showArchived) {
      items = items.filter(function (r) { return r && !r.archived; });
    }
    if (!state.showAfgerond) {
      items = items.filter(function (r) { return r && !r.afgerond; });
    }
    var q = state.search.trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        if (!r) return false;
        var pack = ((r.titel || "") + " " + (r.beschrijving || "")).toLowerCase();
        return pack.indexOf(q) !== -1;
      });
    }
    var key = state.sortKey || "aangemaakt";
    var dir = state.sortDir === "desc" ? -1 : 1;
    items.sort(function (a, b) {
      var av = sortValue(a, key);
      var bv = sortValue(b, key);
      if (typeof av === "number" && typeof bv === "number") {
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
      } else {
        var as = String(av);
        var bs = String(bv);
        var cmp = as.localeCompare(bs, "nl", { sensitivity: "base" });
        if (cmp !== 0) return cmp * dir;
      }
      return (a.titel || "").localeCompare(b.titel || "", "nl", { sensitivity: "base" });
    });
    return items;
  }

  function applySortIndicators() {
    document.querySelectorAll("#vm-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      var col = th.getAttribute("data-col");
      if (col === state.sortKey) {
        th.classList.add(state.sortDir === "desc" ? "is-sorted-desc" : "is-sorted-asc");
      }
    });
  }

  function statusPill(rec) {
    if (rec && rec.archived) {
      return '<span class="ic-status-pill ic-status-pill--inactief"><span class="ic-status-dot"></span>Gearchiveerd</span>';
    }
    if (rec && rec.afgerond) {
      return '<span class="ic-status-pill ic-status-pill--actief"><span class="ic-status-dot"></span>Afgerond</span>';
    }
    return '<span class="ic-status-pill ic-status-pill--actief"><span class="ic-status-dot"></span>Open</span>';
  }

  var TRASH_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function actionsHtml(rec) {
    if (!rec) return "";
    var bewerken = '<button type="button" class="btn-outline ic-action-btn" data-action="edit" data-id="' + escAttr(rec.id) + '">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      + ' Bewerken</button>';
    if (rec.archived) {
      return '<div class="hr-row-actions">'
        + '<button type="button" class="btn-outline hr-restore-btn vm-action-btn" data-action="restore" data-id="' + escAttr(rec.id) + '">Herstel</button>'
        + '<button type="button" class="employee-delete-btn vm-action-btn" data-action="purge" data-id="' + escAttr(rec.id) + '" aria-label="Definitief verwijderen">' + TRASH_SVG + '</button>'
        + '</div>';
    }
    return bewerken
      + ' <button type="button" class="employee-delete-btn vm-action-btn" data-action="archive" data-id="' + escAttr(rec.id) + '" aria-label="Archiveren">' + TRASH_SVG + '</button>';
  }

  function renderRowHtml(rec) {
    return '<tr data-id="' + escAttr(rec.id) + '">'
      + '<td data-col="select"><input type="checkbox" class="table-checkbox vm-row-check" data-id="' + escAttr(rec.id) + '" aria-label="Selecteer" /></td>'
      + '<td data-col="titel"><strong>' + escHtml(rec.titel || "—") + '</strong></td>'
      + '<td data-col="beschrijving" class="ic-cell-beschr">' + escHtml(rec.beschrijving || "—") + '</td>'
      + '<td data-col="client">' + escHtml(clientCellLabel(getClientById(rec.clientId))) + '</td>'
      + '<td data-col="status">' + statusPill(rec) + '</td>'
      + '<td data-col="aangemaakt">' + escHtml(formatNlDate(rec.aanmaakdatum)) + '</td>'
      + '<td data-col="acties" class="incident-action-cell">' + actionsHtml(rec) + '</td>'
      + '</tr>';
  }

  function renderTable() {
    var tbody = $("vm-tbody");
    if (!tbody) return;
    var items = getFiltered();
    var total = items.length;
    var pageSize = state.pageSize;
    var maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * pageSize;
    var pageRows = items.slice(start, start + pageSize);

    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen resultaten gevonden</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(renderRowHtml).join("");
    }

    var rangeFrom = total === 0 ? 0 : start + 1;
    var rangeTo = Math.min(start + pageSize, total);
    $("vm-pager-range").textContent = total === 0
      ? "0 van 0"
      : rangeFrom + "–" + rangeTo + " van " + total;
    $("vm-pager-page").textContent = "Pagina " + state.page + " van " + maxPage;

    applyColumnVisibility();
    applySortIndicators();
  }

  // ---------------------------------------------------------------------------
  // Kolommen
  // ---------------------------------------------------------------------------
  var COLUMN_CONFIG = [
    { id: "select", label: "Selectie", defaultOn: true, skipToggle: true },
    { id: "titel", label: "Titel", defaultOn: true, skipToggle: true },
    { id: "beschrijving", label: "Beschrijving", defaultOn: true },
    { id: "client", label: "Cliënt", defaultOn: true },
    { id: "status", label: "Status", defaultOn: true },
    { id: "aangemaakt", label: "Aangemaakt op", defaultOn: true },
    { id: "acties", label: "Acties", defaultOn: true, skipToggle: true },
  ];

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#vm-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyColumnVisibility() {
    document.querySelectorAll("#vm-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setColumnVisible(colId, isOn);
    });
  }
  function buildColumnsPanel() {
    var list = $("vm-columns-list");
    if (!list) return;
    list.innerHTML = "";
    COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle" + (c.defaultOn ? " is-checked" : "");
      b.setAttribute("data-col", c.id);
      b.setAttribute("role", "menuitemcheckbox");
      b.setAttribute("aria-checked", c.defaultOn ? "true" : "false");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }
  function wireColumnsPanel() {
    var colBtn = $("vm-columns-menu-btn");
    var colPanel = $("vm-columns-panel");
    var colList = $("vm-columns-list");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var hidden = colPanel.hasAttribute("hidden");
        if (hidden) {
          colPanel.removeAttribute("hidden");
          colBtn.setAttribute("aria-expanded", "true");
        } else {
          colPanel.setAttribute("hidden", "");
          colBtn.setAttribute("aria-expanded", "false");
        }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    if (colList) {
      colList.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        applyColumnVisibility();
      });
    }
    document.addEventListener("click", function () {
      if (colPanel) {
        colPanel.setAttribute("hidden", "");
        if (colBtn) colBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function showModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var firstInput = m.querySelector("input, textarea, select");
    if (firstInput) {
      try { firstInput.focus(); firstInput.select && firstInput.select(); } catch (e) { /* */ }
    }
  }
  function hideModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }

  // ---------------------------------------------------------------------------
  // Add modal
  // ---------------------------------------------------------------------------
  function openAddModal() {
    $("vm-add-titel").value = "";
    $("vm-add-beschr").value = "";
    fillClientSelect($("vm-add-client"), "");
    $("vm-add-vervaldatum").value = "";
    $("vm-add-afgerond").checked = false;
    var err = $("vm-add-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("vm-add-modal");
  }
  function closeAddModal() { hideModal("vm-add-modal"); }
  async function submitAddForm(ev) {
    ev.preventDefault();
    var titel = ($("vm-add-titel").value || "").trim();
    var beschr = ($("vm-add-beschr").value || "").trim();
    var clientId = $("vm-add-client").value || null;
    var vervaldatum = $("vm-add-vervaldatum").value || null;
    var afgerond = !!$("vm-add-afgerond").checked;
    var err = $("vm-add-error");
    if (!titel) {
      if (err) { err.hidden = false; err.textContent = "Titel is verplicht."; }
      return;
    }
    var btn = $("vm-add-submit");
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = "Bezig…";
    try {
      await window.verbeteringsmaatregelenDB.add({
        titel: titel,
        beschrijving: beschr,
        clientId: clientId,
        vervaldatum: vervaldatum,
        afgerond: afgerond,
      });
      toast("saved", "Verbeteringsmaatregel toegevoegd");
      closeAddModal();
    } catch (e) {
      if (err) { err.hidden = false; err.textContent = "Toevoegen mislukt: " + (e && e.message ? e.message : String(e)); }
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // Edit modal
  // ---------------------------------------------------------------------------
  function openEditModal(id) {
    var rec = window.verbeteringsmaatregelenDB && window.verbeteringsmaatregelenDB.getByIdSync(id);
    if (!rec) return;
    state.editingId = id;
    $("vm-edit-id").value = id;
    $("vm-edit-titel").value = rec.titel || "";
    $("vm-edit-beschr").value = rec.beschrijving || "";
    fillClientSelect($("vm-edit-client"), rec.clientId || "");
    $("vm-edit-vervaldatum").value = rec.vervaldatum ? String(rec.vervaldatum).slice(0, 10) : "";
    $("vm-edit-afgerond").checked = !!rec.afgerond;
    var err = $("vm-edit-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("vm-edit-modal");
  }
  function closeEditModal() { state.editingId = null; hideModal("vm-edit-modal"); }
  async function submitEditForm(ev) {
    ev.preventDefault();
    if (!state.editingId) return;
    var titel = ($("vm-edit-titel").value || "").trim();
    var beschr = ($("vm-edit-beschr").value || "").trim();
    var clientId = $("vm-edit-client").value || null;
    var vervaldatum = $("vm-edit-vervaldatum").value || null;
    var afgerond = !!$("vm-edit-afgerond").checked;
    var err = $("vm-edit-error");
    if (!titel) {
      if (err) { err.hidden = false; err.textContent = "Titel is verplicht."; }
      return;
    }
    var btn = $("vm-edit-submit");
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = "Bezig…";
    try {
      await window.verbeteringsmaatregelenDB.update(state.editingId, {
        titel: titel,
        beschrijving: beschr,
        clientId: clientId,
        vervaldatum: vervaldatum,
        afgerond: afgerond,
      });
      toast("saved", "Verbeteringsmaatregel bijgewerkt");
      closeEditModal();
    } catch (e) {
      if (err) { err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e)); }
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // Archive (slider)
  // ---------------------------------------------------------------------------
  function openArchiveModal(id) {
    var rec = window.verbeteringsmaatregelenDB && window.verbeteringsmaatregelenDB.getByIdSync(id);
    if (!rec) return;
    state.archivingId = id;
    $("vm-archive-preview").textContent = rec.titel || "";
    var slider = $("vm-archive-slider");
    var confirmBtn = $("vm-archive-confirm");
    if (slider) {
      slider.value = 0;
      slider.style.setProperty("--employee-slider-pct", "0%");
    }
    if (confirmBtn) confirmBtn.disabled = true;
    showModal("vm-archive-modal");
  }
  function closeArchiveModal() { state.archivingId = null; hideModal("vm-archive-modal"); }
  async function confirmArchive() {
    if (!state.archivingId) return;
    var id = state.archivingId;
    closeArchiveModal();
    try {
      await window.verbeteringsmaatregelenDB.archive(id);
      toast("archived", "Verbeteringsmaatregel gearchiveerd");
    } catch (e) {
      toast("error", "Archiveren mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Permanent delete (slider)
  // ---------------------------------------------------------------------------
  function openPurgeModal(id) {
    var rec = window.verbeteringsmaatregelenDB && window.verbeteringsmaatregelenDB.getByIdSync(id);
    if (!rec) return;
    state.purgingId = id;
    $("vm-purge-preview").textContent = rec.titel || "";
    var slider = $("vm-purge-slider");
    var confirmBtn = $("vm-purge-confirm");
    if (slider) {
      slider.value = 0;
      slider.style.setProperty("--employee-slider-pct", "0%");
    }
    if (confirmBtn) confirmBtn.disabled = true;
    showModal("vm-purge-modal");
  }
  function closePurgeModal() { state.purgingId = null; hideModal("vm-purge-modal"); }
  async function confirmPurge() {
    if (!state.purgingId) return;
    var id = state.purgingId;
    closePurgeModal();
    try {
      await window.verbeteringsmaatregelenDB.delete(id);
      toast("deleted", "Verbeteringsmaatregel verwijderd");
    } catch (e) {
      toast("error", "Verwijderen mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Restore (geen confirm)
  // ---------------------------------------------------------------------------
  async function restoreRec(id) {
    try {
      await window.verbeteringsmaatregelenDB.restore(id);
      toast("restored", "Verbeteringsmaatregel hersteld");
    } catch (e) {
      toast("error", "Herstellen mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireSliderConfirm(sliderId, btnId) {
    var slider = $(sliderId);
    var btn = $(btnId);
    if (!slider || !btn) return;
    slider.addEventListener("input", function () {
      var v = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", v + "%");
      btn.disabled = v < 100;
    });
  }

  function wireUp() {
    $("vm-add-open-btn").addEventListener("click", openAddModal);
    $("vm-add-close").addEventListener("click", closeAddModal);
    $("vm-add-cancel").addEventListener("click", closeAddModal);
    $("vm-add-form").addEventListener("submit", submitAddForm);

    $("vm-edit-close").addEventListener("click", closeEditModal);
    $("vm-edit-cancel").addEventListener("click", closeEditModal);
    $("vm-edit-form").addEventListener("submit", submitEditForm);

    $("vm-archive-close").addEventListener("click", closeArchiveModal);
    $("vm-archive-cancel").addEventListener("click", closeArchiveModal);
    wireSliderConfirm("vm-archive-slider", "vm-archive-confirm");
    $("vm-archive-confirm").addEventListener("click", confirmArchive);

    $("vm-purge-close").addEventListener("click", closePurgeModal);
    $("vm-purge-cancel").addEventListener("click", closePurgeModal);
    wireSliderConfirm("vm-purge-slider", "vm-purge-confirm");
    $("vm-purge-confirm").addEventListener("click", confirmPurge);

    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute("aria-hidden", "true");
          if (!document.querySelector(".modal-overlay:not([hidden])")) {
            document.body.classList.remove("modal-open");
          }
        }
      });
    });

    var search = $("vm-search");
    if (search) search.addEventListener("input", function () {
      state.search = search.value || ""; state.page = 1; renderTable();
    });

    var archToggle = $("vm-show-archived");
    if (archToggle) archToggle.addEventListener("change", function () {
      state.showArchived = !!archToggle.checked; state.page = 1; renderTable();
    });

    var afgToggle = $("vm-show-afgerond");
    if (afgToggle) afgToggle.addEventListener("change", function () {
      state.showAfgerond = !!afgToggle.checked; state.page = 1; renderTable();
    });

    var pageSize = $("vm-page-size");
    if (pageSize) pageSize.addEventListener("change", function () {
      state.pageSize = parseInt(pageSize.value, 10) || 15;
      state.page = 1;
      renderTable();
    });
    $("vm-pager-first").addEventListener("click", function () { state.page = 1; renderTable(); });
    $("vm-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page--; renderTable(); } });
    $("vm-pager-next").addEventListener("click", function () { state.page++; renderTable(); });
    $("vm-pager-last").addEventListener("click", function () {
      var total = getFiltered().length;
      state.page = Math.max(1, Math.ceil(total / state.pageSize));
      renderTable();
    });

    $("vm-tbody").addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".vm-action-btn, .ic-action-btn");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (action === "edit") openEditModal(id);
      else if (action === "archive") openArchiveModal(id);
      else if (action === "purge") openPurgeModal(id);
      else if (action === "restore") restoreRec(id);
    });

    var checkAll = $("vm-check-all");
    if (checkAll) checkAll.addEventListener("change", function () {
      var on = !!checkAll.checked;
      document.querySelectorAll(".vm-row-check").forEach(function (cb) { cb.checked = on; });
    });

    document.querySelectorAll("#vm-table .th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#vm-table .th-sort-menu").forEach(function (m) {
          m.setAttribute("hidden", "");
        });
        document.querySelectorAll("#vm-table thead th.th-sort").forEach(function (h) {
          h.classList.remove("th-sort-open");
        });
        if (wasHidden) {
          menu.removeAttribute("hidden");
          if (th) th.classList.add("th-sort-open");
        }
      });
    });
    document.querySelectorAll("#vm-table .th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = opt.getAttribute("data-action");
        var th = opt.closest("th");
        var colId = th ? th.getAttribute("data-col") : null;
        if (!action || !colId) return;
        if (action === "hide") {
          var toggle = document.querySelector('#vm-columns-list .column-toggle[data-col="' + colId + '"]');
          if (toggle) {
            toggle.classList.remove("is-checked");
            toggle.setAttribute("aria-checked", "false");
          }
          setColumnVisible(colId, false);
        } else if (action === "asc" || action === "desc") {
          state.sortKey = colId;
          state.sortDir = action;
          state.page = 1;
          renderTable();
        }
        document.querySelectorAll("#vm-table .th-sort-menu").forEach(function (m) {
          m.setAttribute("hidden", "");
        });
        document.querySelectorAll("#vm-table thead th.th-sort").forEach(function (h) {
          h.classList.remove("th-sort-open");
        });
      });
    });
    document.addEventListener("click", function () {
      document.querySelectorAll("#vm-table .th-sort-menu").forEach(function (m) {
        m.setAttribute("hidden", "");
      });
      document.querySelectorAll("#vm-table thead th.th-sort").forEach(function (h) {
        h.classList.remove("th-sort-open");
      });
    });

    window.addEventListener("besa:verbeteringsmaatregelen-updated", renderTable);
    window.addEventListener("besa:clienten-updated", renderTable);
  }

  function init() {
    buildColumnsPanel();
    wireColumnsPanel();
    wireUp();
    renderTable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
