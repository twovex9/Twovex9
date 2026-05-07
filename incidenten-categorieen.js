/* global window, document */
/**
 * incidenten-categorieen.js — page-script voor incidenten-categorieen.html.
 *
 * Bron-van-waarheid: window.incidentCategorieenDB (Supabase via
 * incident-categorieen-data.js).
 *
 * Functionaliteit:
 *   - Lijst alle categorieën met status-pill (Actief/Gedeactiveerd).
 *   - Zoeken (naam + beschrijving).
 *   - Toggle "Gedeactiveerd tonen".
 *   - Sortering kan later toegevoegd; voor nu: alfabetisch op naam.
 *   - Paginatie (15/30/50/100 rijen).
 *   - Kolom-zichtbaarheid via Kolommen-knop (data-col patroon).
 *   - Modal toevoegen.
 *   - Modal bewerken.
 *   - Slider-confirm modal voor deactiveren / definitief verwijderen.
 *   - Live re-render bij `besa:incident-categorieen-updated`.
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

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    search: "",
    showArchived: false,
    page: 1,
    pageSize: 15,
    editingId: null,
    deactivatingId: null,
    sortKey: "naam",   // Default sort: alfabetisch op naam.
    sortDir: "asc",    // "asc" of "desc"
  };

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------
  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("ic-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 500);
  }

  // ---------------------------------------------------------------------------
  // Date formatting (NL)
  // ---------------------------------------------------------------------------
  var MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function formatNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return d.getDate() + " " + MONTHS_NL[d.getMonth()] + " " + d.getFullYear();
  }

  // ---------------------------------------------------------------------------
  // Filtered data
  // ---------------------------------------------------------------------------
  function getAll() {
    if (!window.incidentCategorieenDB) return [];
    try { return window.incidentCategorieenDB.getAllSync() || []; } catch (e) { return []; }
  }
  function sortValue(cat, key) {
    if (!cat) return "";
    if (key === "status") return cat.archived ? 1 : 0; // Actief vóór Gedeactiveerd bij asc
    if (key === "bijgewerkt") {
      var t = Date.parse(cat.laatstGewijzigd || "");
      return isFinite(t) ? t : 0;
    }
    if (key === "beschrijving") return (cat.beschrijving || "").toLowerCase();
    return (cat.naam || "").toLowerCase();
  }

  function getFiltered() {
    var items = getAll().slice();
    if (!state.showArchived) {
      items = items.filter(function (c) { return c && !c.archived; });
    }
    var q = state.search.trim().toLowerCase();
    if (q) {
      items = items.filter(function (c) {
        if (!c) return false;
        var pack = ((c.naam || "") + " " + (c.beschrijving || "")).toLowerCase();
        return pack.indexOf(q) !== -1;
      });
    }
    var key = state.sortKey || "naam";
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
      // Tie-breaker: altijd op naam alfabetisch zodat de volgorde stabiel is.
      return (a.naam || "").localeCompare(b.naam || "", "nl", { sensitivity: "base" });
    });
    return items;
  }

  // Update de sorted-asc / sorted-desc class op de juiste header zodat de
  // pijltjes zichtbaar in de juiste richting wijzen (CSS handelt 't visueel af).
  function applySortIndicators() {
    document.querySelectorAll("#ic-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      var col = th.getAttribute("data-col");
      if (col === state.sortKey) {
        th.classList.add(state.sortDir === "desc" ? "is-sorted-desc" : "is-sorted-asc");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function statusPill(cat) {
    if (cat && cat.archived) {
      return '<span class="ic-status-pill ic-status-pill--inactief"><span class="ic-status-dot"></span>Gedeactiveerd</span>';
    }
    return '<span class="ic-status-pill ic-status-pill--actief"><span class="ic-status-dot"></span>Actief</span>';
  }

  function actionsHtml(cat) {
    if (!cat) return "";
    var bewerken = '<button type="button" class="btn-outline ic-action-btn" data-action="edit" data-id="' + escAttr(cat.id) + '">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      + ' Bewerken</button>';
    if (cat.archived) {
      return bewerken
        + ' <button type="button" class="btn-outline hr-restore-btn ic-action-btn" data-action="restore" data-id="' + escAttr(cat.id) + '">Activeren</button>';
    }
    var deact = '<button type="button" class="btn-outline btn-danger-outline ic-action-btn" data-action="deactivate" data-id="' + escAttr(cat.id) + '">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'
      + ' Deactiveren</button>';
    return bewerken + " " + deact;
  }

  function renderRowHtml(cat) {
    return '<tr data-id="' + escAttr(cat.id) + '">'
      + '<td data-col="status">' + statusPill(cat) + '</td>'
      + '<td data-col="naam"><strong>' + escHtml(cat.naam || "—") + '</strong></td>'
      + '<td data-col="beschrijving" class="ic-cell-beschr">' + escHtml(cat.beschrijving || "—") + '</td>'
      + '<td data-col="bijgewerkt">' + escHtml(formatNlDate(cat.laatstGewijzigd)) + '</td>'
      + '<td data-col="acties" class="incident-action-cell">' + actionsHtml(cat) + '</td>'
      + '</tr>';
  }

  function renderTable() {
    var tbody = $("ic-tbody");
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
      tbody.innerHTML = '<tr><td colspan="5" class="incident-empty">Geen categorieën gevonden</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(renderRowHtml).join("");
    }

    var rangeFrom = total === 0 ? 0 : start + 1;
    var rangeTo = Math.min(start + pageSize, total);
    $("ic-pager-range").textContent = total === 0
      ? "0 van 0"
      : rangeFrom + "–" + rangeTo + " van " + total;
    $("ic-pager-page").textContent = "Pagina " + state.page + " van " + maxPage;

    applyColumnVisibility();
    applySortIndicators();
  }

  // ---------------------------------------------------------------------------
  // Column visibility (Kolommen-knop)
  // ---------------------------------------------------------------------------
  var COLUMN_CONFIG = [
    { id: "status", label: "Status", defaultOn: true },
    { id: "naam", label: "Categorie naam", defaultOn: true, skipToggle: true },
    { id: "beschrijving", label: "Beschrijving", defaultOn: true },
    { id: "bijgewerkt", label: "Laatst bijgewerkt", defaultOn: true },
    { id: "acties", label: "Acties", defaultOn: true, skipToggle: true },
  ];

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#ic-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyColumnVisibility() {
    document.querySelectorAll("#ic-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setColumnVisible(colId, isOn);
    });
  }
  function buildColumnsPanel() {
    var list = $("ic-columns-list");
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
    var colBtn = $("ic-columns-menu-btn");
    var colPanel = $("ic-columns-panel");
    var colList = $("ic-columns-list");
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
    $("ic-add-naam").value = "";
    $("ic-add-beschr").value = "";
    var err = $("ic-add-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("ic-add-modal");
  }
  function closeAddModal() { hideModal("ic-add-modal"); }
  async function submitAddForm(ev) {
    ev.preventDefault();
    var naam = ($("ic-add-naam").value || "").trim();
    var beschr = ($("ic-add-beschr").value || "").trim();
    var err = $("ic-add-error");
    if (!naam) {
      if (err) { err.hidden = false; err.textContent = "Naam is verplicht."; }
      return;
    }
    var btn = $("ic-add-submit");
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = "Bezig…";
    try {
      await window.incidentCategorieenDB.add({ naam: naam, beschrijving: beschr });
      toast("saved", "Categorie toegevoegd");
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
    var rec = window.incidentCategorieenDB && window.incidentCategorieenDB.getByIdSync(id);
    if (!rec) return;
    state.editingId = id;
    $("ic-edit-id").value = id;
    $("ic-edit-naam").value = rec.naam || "";
    $("ic-edit-beschr").value = rec.beschrijving || "";
    var err = $("ic-edit-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("ic-edit-modal");
  }
  function closeEditModal() { state.editingId = null; hideModal("ic-edit-modal"); }
  async function submitEditForm(ev) {
    ev.preventDefault();
    if (!state.editingId) return;
    var naam = ($("ic-edit-naam").value || "").trim();
    var beschr = ($("ic-edit-beschr").value || "").trim();
    var err = $("ic-edit-error");
    if (!naam) {
      if (err) { err.hidden = false; err.textContent = "Naam is verplicht."; }
      return;
    }
    var btn = $("ic-edit-submit");
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = "Bezig…";
    try {
      await window.incidentCategorieenDB.update(state.editingId, { naam: naam, beschrijving: beschr });
      toast("saved", "Categorie bijgewerkt");
      closeEditModal();
    } catch (e) {
      if (err) { err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e)); }
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // Deactivate modal (slider-confirm)
  // ---------------------------------------------------------------------------
  function openDeactivateModal(id) {
    var rec = window.incidentCategorieenDB && window.incidentCategorieenDB.getByIdSync(id);
    if (!rec) return;
    state.deactivatingId = id;
    $("ic-deact-preview").textContent = rec.naam || "";
    var slider = $("ic-deact-slider");
    var confirm = $("ic-deact-confirm");
    if (slider) {
      slider.value = 0;
      slider.style.setProperty("--employee-slider-pct", "0%");
    }
    if (confirm) confirm.disabled = true;
    showModal("ic-deact-modal");
  }
  function closeDeactivateModal() { state.deactivatingId = null; hideModal("ic-deact-modal"); }
  async function confirmDeactivate() {
    if (!state.deactivatingId) return;
    var id = state.deactivatingId;
    closeDeactivateModal();
    try {
      await window.incidentCategorieenDB.archive(id);
      toast("archived", "Categorie gedeactiveerd");
    } catch (e) {
      toast("error", "Deactiveren mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Restore (direct, geen confirm — herstellen is altijd vrij per werkpatronen)
  // ---------------------------------------------------------------------------
  async function restoreCategorie(id) {
    try {
      await window.incidentCategorieenDB.restore(id);
      toast("restored", "Categorie geactiveerd");
    } catch (e) {
      toast("error", "Activeren mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireUp() {
    $("ic-add-open-btn").addEventListener("click", openAddModal);
    $("ic-add-close").addEventListener("click", closeAddModal);
    $("ic-add-cancel").addEventListener("click", closeAddModal);
    $("ic-add-form").addEventListener("submit", submitAddForm);

    $("ic-edit-close").addEventListener("click", closeEditModal);
    $("ic-edit-cancel").addEventListener("click", closeEditModal);
    $("ic-edit-form").addEventListener("submit", submitEditForm);

    $("ic-deact-close").addEventListener("click", closeDeactivateModal);
    $("ic-deact-cancel").addEventListener("click", closeDeactivateModal);
    var slider = $("ic-deact-slider");
    var confirmBtn = $("ic-deact-confirm");
    if (slider && confirmBtn) {
      slider.addEventListener("input", function () {
        var v = Number(slider.value);
        slider.style.setProperty("--employee-slider-pct", v + "%");
        confirmBtn.disabled = v < 100;
      });
      confirmBtn.addEventListener("click", confirmDeactivate);
    }

    // Close modals on overlay click
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute("aria-hidden", "true");
        }
      });
    });

    // Search
    var search = $("ic-search");
    if (search) search.addEventListener("input", function () {
      state.search = search.value || ""; state.page = 1; renderTable();
    });

    // Show archived toggle
    var archToggle = $("ic-show-archived");
    if (archToggle) archToggle.addEventListener("change", function () {
      state.showArchived = !!archToggle.checked; state.page = 1; renderTable();
    });

    // Page size + pager
    var pageSize = $("ic-page-size");
    if (pageSize) pageSize.addEventListener("change", function () {
      state.pageSize = parseInt(pageSize.value, 10) || 15;
      state.page = 1;
      renderTable();
    });
    $("ic-pager-first").addEventListener("click", function () { state.page = 1; renderTable(); });
    $("ic-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page--; renderTable(); } });
    $("ic-pager-next").addEventListener("click", function () { state.page++; renderTable(); });
    $("ic-pager-last").addEventListener("click", function () {
      var total = getFiltered().length;
      state.page = Math.max(1, Math.ceil(total / state.pageSize));
      renderTable();
    });

    // Table actions delegation
    $("ic-tbody").addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".ic-action-btn");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (action === "edit") openEditModal(id);
      else if (action === "deactivate") openDeactivateModal(id);
      else if (action === "restore") restoreCategorie(id);
    });

    // Sort-menu triggers (pijltjes naast elke kolom-titel)
    document.querySelectorAll("#ic-table .th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        // Sluit eerst alle andere menu's (max 1 tegelijk open).
        document.querySelectorAll("#ic-table .th-sort-menu").forEach(function (m) {
          m.setAttribute("hidden", "");
        });
        document.querySelectorAll("#ic-table thead th.th-sort").forEach(function (h) {
          h.classList.remove("th-sort-open");
        });
        if (wasHidden) {
          menu.removeAttribute("hidden");
          if (th) th.classList.add("th-sort-open");
        }
      });
    });
    // Sort-menu opties (Asc / Desc / Hide)
    document.querySelectorAll("#ic-table .th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = opt.getAttribute("data-action");
        var th = opt.closest("th");
        var colId = th ? th.getAttribute("data-col") : null;
        if (!action || !colId) return;
        if (action === "hide") {
          // Reuse columns-knop logic: zet de toggle uit en verberg de kolom.
          var toggle = document.querySelector('#ic-columns-list .column-toggle[data-col="' + colId + '"]');
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
        document.querySelectorAll("#ic-table .th-sort-menu").forEach(function (m) {
          m.setAttribute("hidden", "");
        });
        document.querySelectorAll("#ic-table thead th.th-sort").forEach(function (h) {
          h.classList.remove("th-sort-open");
        });
      });
    });
    // Klik buiten sluit eventuele open sort-menu.
    document.addEventListener("click", function () {
      document.querySelectorAll("#ic-table .th-sort-menu").forEach(function (m) {
        m.setAttribute("hidden", "");
      });
      document.querySelectorAll("#ic-table thead th.th-sort").forEach(function (h) {
        h.classList.remove("th-sort-open");
      });
    });

    // Live re-render bij data-changes
    window.addEventListener("besa:incident-categorieen-updated", renderTable);
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
