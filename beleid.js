/* global window, document, FileReader */
/**
 * beleid.js — page-script voor /beleid.html (BS2-port: Beleidsdocumenten).
 *
 * Toont een lijst van `beleidsdocumentenDB` items met search, archive-toggle,
 * pagination en add/edit/archive/restore/delete modals. Volgt de
 * huisstijl + werkpatronen van competenties.html / nieuws.html.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    showArchived: false,
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    editingId: null,
    archivingId: null,
    purgingId: null,
  };

  function fmtNlDateTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "";
    var d = new Date(t);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function trashSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  }

  function getVisible() {
    var items = (window.beleidsdocumentenDB && window.beleidsdocumentenDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    return items.filter(function (it) {
      if (!it) return false;
      if (!!it.archived !== !!state.showArchived) return false;
      if (!q) return true;
      var hay = (it.naam || "") + " " + (it.type || "") + " " + String(it.volgnummer || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderRow(it) {
    var fileCell = it.fileUrl
      ? '<a class="btn-outline" href="' + escapeHtml(it.fileUrl) + '" target="_blank" rel="noopener">Bekijk</a>'
      : '<span class="text-muted" style="color:var(--text-muted);font-style:italic;">geen bestand</span>';

    var actionsCell = it.archived
      ? '<div class="hr-row-actions">' +
        '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(it.id) + '">Herstel</button>' +
        '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(it.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button>' +
        '</div>'
      : '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(it.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';

    var nameButton = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(it.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;">' + escapeHtml(it.naam) + '</button>';

    return '<tr data-id="' + escapeHtml(it.id) + '">' +
      '<td data-col="volgnummer">' + (it.volgnummer != null ? escapeHtml(String(it.volgnummer)) : "") + '</td>' +
      '<td data-col="naam">' + nameButton + '</td>' +
      '<td data-col="type">' + escapeHtml(it.type || "") + '</td>' +
      '<td data-col="uploaddatum">' + escapeHtml(fmtNlDateTime(it.uploaddatum)) + '</td>' +
      '<td data-col="laatst-gewijzigd">' + escapeHtml(fmtNlDateTime(it.laatstGewijzigd)) + '</td>' +
      '<td data-col="bestand">' + fileCell + '</td>' +
      '<td class="hr-actions-cell">' + actionsCell + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("beleid-tbody");
    if (!tbody) return;

    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;

    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);

    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-muted);">Geen beleidsdocumenten gevonden.</td></tr>';
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
    }

    var rangeEl = document.getElementById("beleid-pager-range");
    if (rangeEl) {
      if (total === 0) rangeEl.textContent = "0 van 0";
      else rangeEl.textContent = (start + 1) + "-" + Math.min(total, start + pageItems.length) + " van " + total;
    }
    var pageEl = document.getElementById("beleid-pager-page");
    if (pageEl) pageEl.textContent = "Pagina " + state.page + " van " + totalPages;

    document.getElementById("beleid-pager-first").disabled = state.page <= 1;
    document.getElementById("beleid-pager-prev").disabled = state.page <= 1;
    document.getElementById("beleid-pager-next").disabled = state.page >= totalPages;
    document.getElementById("beleid-pager-last").disabled = state.page >= totalPages;
  }

  // ---------------------------------------------------------------------------
  // Add / Edit modal
  // ---------------------------------------------------------------------------

  function openAddModal(item) {
    state.editingId = item ? item.id : null;
    var modal = document.getElementById("beleid-add-modal");
    var title = document.getElementById("beleid-add-title");
    var idInput = document.getElementById("beleid-edit-id");
    var volg = document.getElementById("beleid-add-volgnummer");
    var naam = document.getElementById("beleid-add-naam");
    var type = document.getElementById("beleid-add-type");
    var file = document.getElementById("beleid-add-file");
    var fileInfo = document.getElementById("beleid-existing-file-info");
    var submit = document.getElementById("beleid-add-submit-btn");
    if (!modal || !idInput || !volg || !naam || !type || !file) return;

    if (item) {
      title.textContent = "Beleidsdocument bewerken";
      idInput.value = item.id;
      volg.value = item.volgnummer != null ? String(item.volgnummer) : "";
      naam.value = item.naam || "";
      type.value = item.type || "";
      submit.textContent = "Opslaan";
      fileInfo.textContent = item.fileName ? "Huidig bestand: " + item.fileName + " (kies een nieuw bestand om te vervangen)" : "Nog geen bestand geüpload";
    } else {
      title.textContent = "Beleidsdocument toevoegen";
      idInput.value = "";
      volg.value = "";
      naam.value = "";
      type.value = "";
      submit.textContent = "Toevoegen";
      fileInfo.textContent = "";
    }
    file.value = "";
    modal.style.display = "flex";
    setTimeout(function () { naam.focus(); }, 50);
  }

  function closeAddModal() {
    state.editingId = null;
    var modal = document.getElementById("beleid-add-modal");
    if (modal) modal.style.display = "none";
  }

  function readFileAsDataUrl(fileBlob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(fileBlob);
    });
  }

  async function submitAddForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("beleid-add-submit-btn");
    var idInput = document.getElementById("beleid-edit-id");
    var volg = document.getElementById("beleid-add-volgnummer");
    var naam = document.getElementById("beleid-add-naam");
    var type = document.getElementById("beleid-add-type");
    var file = document.getElementById("beleid-add-file");

    var payload = {
      naam: naam.value.trim(),
      type: type.value.trim(),
      volgnummer: volg.value !== "" ? Number(volg.value) : null,
    };

    if (!payload.naam) {
      naam.focus();
      return;
    }

    if (file.files && file.files[0]) {
      try {
        payload.fileData = await readFileAsDataUrl(file.files[0]);
        payload.fileName = file.files[0].name;
        payload.fileMime = file.files[0].type || "";
      } catch (e) {
        if (window.showError) window.showError("Bestand lezen mislukt: " + (e && e.message || e));
        return;
      }
    }

    submit.disabled = true;
    try {
      if (idInput.value) {
        await window.beleidsdocumentenDB.update(idInput.value, payload);
        if (window.showSaveModal) window.showSaveModal({ title: "Bijgewerkt", message: payload.naam });
      } else {
        await window.beleidsdocumentenDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", payload.naam);
      }
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
      else console.error("[beleid] save failed", err);
    } finally {
      submit.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Archive / Purge slider modals
  // ---------------------------------------------------------------------------

  function setupSliderModal(modalId, sliderId, confirmBtnId) {
    var slider = document.getElementById(sliderId);
    var confirm = document.getElementById(confirmBtnId);
    if (!slider || !confirm) return;
    slider.addEventListener("input", function () {
      var pct = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", pct + "%");
      confirm.disabled = pct < 100;
    });
  }

  function openArchiveModal(item) {
    state.archivingId = item.id;
    var modal = document.getElementById("beleid-archive-modal");
    var preview = document.getElementById("beleid-archive-preview");
    var slider = document.getElementById("beleid-archive-slider");
    var confirm = document.getElementById("beleid-archive-confirm-btn");
    if (!modal) return;
    preview.textContent = item.naam || "";
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    confirm.disabled = true;
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeArchiveModal() {
    state.archivingId = null;
    var modal = document.getElementById("beleid-archive-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  function openPurgeModal(item) {
    state.purgingId = item.id;
    var modal = document.getElementById("beleid-purge-modal");
    var preview = document.getElementById("beleid-purge-preview");
    var slider = document.getElementById("beleid-purge-slider");
    var confirm = document.getElementById("beleid-purge-confirm-btn");
    if (!modal) return;
    preview.textContent = item.naam || "";
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    confirm.disabled = true;
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closePurgeModal() {
    state.purgingId = null;
    var modal = document.getElementById("beleid-purge-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  function wireEvents() {
    document.getElementById("beleid-add-btn").addEventListener("click", function () { openAddModal(null); });
    document.getElementById("beleid-add-close-btn").addEventListener("click", closeAddModal);
    document.getElementById("beleid-add-cancel-btn").addEventListener("click", closeAddModal);
    document.getElementById("beleid-add-form").addEventListener("submit", submitAddForm);

    document.getElementById("beleid-search").addEventListener("input", function (e) {
      state.search = e.target.value || "";
      state.page = 1;
      render();
    });

    document.getElementById("beleid-archived-toggle").addEventListener("change", function (e) {
      state.showArchived = !!e.target.checked;
      state.page = 1;
      render();
    });

    // Sprint 9 / S9 — Reset-knop (mirror BS2 /documents)
    var resetBtn = document.getElementById("beleid-reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      state.search = "";
      state.showArchived = false;
      state.page = 1;
      var s = document.getElementById("beleid-search");
      if (s) s.value = "";
      var a = document.getElementById("beleid-archived-toggle");
      if (a) a.checked = false;
      render();
      if (window.showActionFeedback) {
        window.showActionFeedback("info", "Filters gewist", "Zoek en archief-toggle zijn teruggezet.");
      }
    });

    // Sprint 9 / S9 — Kolommen-kiezer (mirror BS2 /documents)
    buildBeleidColumnsPanel();
    wireBeleidColumnsPanel();

    document.getElementById("beleid-rows-per-page").addEventListener("change", function (e) {
      state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT;
      state.page = 1;
      render();
    });

    document.getElementById("beleid-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("beleid-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("beleid-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("beleid-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    // Action delegation on tbody
    document.getElementById("beleid-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = window.beleidsdocumentenDB.getByIdSync(id);
      if (!item) return;
      var action = btn.getAttribute("data-action");
      if (action === "edit") openAddModal(item);
      else if (action === "archive") openArchiveModal(item);
      else if (action === "restore") {
        window.beleidsdocumentenDB.restore(id).then(function () {
          if (window.showActionFeedback) window.showActionFeedback("restored", item.naam);
        }).catch(function (err) { if (window.showError) window.showError("Herstellen mislukt: " + err.message); });
      }
      else if (action === "purge") openPurgeModal(item);
    });

    // Archive modal handlers
    setupSliderModal("beleid-archive-modal", "beleid-archive-slider", "beleid-archive-confirm-btn");
    document.getElementById("beleid-archive-close-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("beleid-archive-cancel-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("beleid-archive-confirm-btn").addEventListener("click", function () {
      var id = state.archivingId;
      if (!id) return;
      var item = window.beleidsdocumentenDB.getByIdSync(id);
      window.beleidsdocumentenDB.archive(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("archived", item && item.naam || "");
        closeArchiveModal();
      }).catch(function (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        closeArchiveModal();
      });
    });

    // Purge modal handlers
    setupSliderModal("beleid-purge-modal", "beleid-purge-slider", "beleid-purge-confirm-btn");
    document.getElementById("beleid-purge-close-btn").addEventListener("click", closePurgeModal);
    document.getElementById("beleid-purge-cancel-btn").addEventListener("click", closePurgeModal);
    document.getElementById("beleid-purge-confirm-btn").addEventListener("click", function () {
      var id = state.purgingId;
      if (!id) return;
      var item = window.beleidsdocumentenDB.getByIdSync(id);
      window.beleidsdocumentenDB.delete(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.naam || "");
        closePurgeModal();
      }).catch(function (err) {
        if (window.showError) window.showError("Verwijderen mislukt: " + err.message);
        closePurgeModal();
      });
    });

    // Re-render on data updates
    window.addEventListener("besa:beleidsdocumenten-updated", render);
  }

  /**
   * Sprint 9 / S9 — Kolommen-kiezer (mirror BS2 /documents Kolommen-knop).
   * Configureerbare zichtbaarheid van tabel-kolommen. Per-user voorkeuren via
   * localStorage zodat keuze persistent is.
   */
  var BELEID_COLUMN_CONFIG = [
    { id: "volgnummer", label: "Nr.", defaultOn: true },
    { id: "naam", label: "Naam", defaultOn: true, skipToggle: true },
    { id: "type", label: "Type", defaultOn: true },
    { id: "uploaddatum", label: "Uploaddatum", defaultOn: true },
    { id: "laatst-gewijzigd", label: "Laatst gewijzigd", defaultOn: true },
    { id: "bestand", label: "Bestand", defaultOn: true },
  ];
  var BELEID_COLUMNS_PREFS_KEY = "beleid_columns_v1";

  function readBeleidColumnPrefs() {
    try {
      var raw = localStorage.getItem(BELEID_COLUMNS_PREFS_KEY);
      var p = raw ? JSON.parse(raw) : {};
      return p && typeof p === "object" ? p : {};
    } catch (e) { return {}; }
  }
  function writeBeleidColumnPrefs(prefs) {
    try { localStorage.setItem(BELEID_COLUMNS_PREFS_KEY, JSON.stringify(prefs || {})); } catch (e) { /* */ }
  }
  function setBeleidColumnVisible(colId, visible) {
    document.querySelectorAll('#beleid-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyBeleidColumnVisibility() {
    var prefs = readBeleidColumnPrefs();
    BELEID_COLUMN_CONFIG.forEach(function (c) {
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      setBeleidColumnVisible(c.id, on);
    });
  }
  function buildBeleidColumnsPanel() {
    var list = document.getElementById("beleid-columns-list");
    if (!list) return;
    var prefs = readBeleidColumnPrefs();
    list.innerHTML = "";
    BELEID_COLUMN_CONFIG.forEach(function (c) {
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
        var p = readBeleidColumnPrefs();
        p[c.id] = nextOn;
        writeBeleidColumnPrefs(p);
        applyBeleidColumnVisibility();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }
  function wireBeleidColumnsPanel() {
    var btn = document.getElementById("beleid-columns-menu-btn");
    var panel = document.getElementById("beleid-columns-panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = btn.getAttribute("aria-expanded") === "true";
      if (open) {
        panel.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      } else {
        panel.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
      }
    });
    document.addEventListener("click", function () {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    });
    applyBeleidColumnVisibility();
  }

  function init() {
    if (!window.beleidsdocumentenDB) {
      console.error("[beleid] beleidsdocumentenDB niet geladen");
      return;
    }
    wireEvents();
    render();
    // ensure freshest after bootstrap
    window.beleidsdocumentenDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
