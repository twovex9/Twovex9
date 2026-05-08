/* global window, document, showSaveModal */
/**
 * werkuren-labels.js — page-script voor werkuren-labels.html.
 *
 * Beheert de labels die in werkuren-modals als select-keuze gebruikt worden.
 * Volledige CRUD via werkurenLabelsDB met live-refresh via
 * "besa:werkuren-labels-updated" event.
 */
(function () {
  "use strict";

  var tbody = document.getElementById("wl-tbody");
  var table = document.getElementById("wl-table");
  var searchInput = document.getElementById("wl-search");
  var archivedToggle = document.getElementById("wl-archived-toggle");
  var rangeEl = document.getElementById("wl-pager-range");
  var pageEl = document.getElementById("wl-pager-page");
  var rowsSelect = document.getElementById("wl-rows-per-page");
  var checkAll = document.getElementById("wl-check-all");
  var toastEl = document.getElementById("wl-toast");

  var TRASH_SVG =
    '<svg class="cl-trash-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var EDIT_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

  var pendingArchiveId = "";
  var pendingPurgeId = "";

  if (!tbody || !table) return;
  if (!window.werkurenLabelsDB) {
    console.error("werkurenLabelsDB ontbreekt — laad werkuren-data.js vóór werkuren-labels.js.");
    return;
  }

  function getCached() { return window.werkurenLabelsDB.getAllSync() || []; }

  var sortKey = "naam";
  var sortDir = "asc";
  var currentPage = 0;

  function pad2(n) { return ("0" + n).slice(-2); }
  function fmtDate(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear()
      + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function showToast(msg) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.removeAttribute("hidden");
    toastEl.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
      toastEl.setAttribute("hidden", "");
    }, 2400);
  }

  // ---- Add/Edit modal ---------------------------------------------------
  var addModal = document.getElementById("wl-add-modal");
  var addForm = document.getElementById("wl-add-form");
  var addClose = document.getElementById("wl-add-close");
  var addCancel = document.getElementById("wl-add-cancel");
  var addNaam = document.getElementById("wl-add-naam");
  var addBeschr = document.getElementById("wl-add-beschrijving");
  var addError = document.getElementById("wl-add-error");
  var addTitle = document.getElementById("wl-add-title");
  var addSubmit = document.getElementById("wl-add-submit");
  var editIdInput = document.getElementById("wl-edit-id");

  function openAddModal(editingRec) {
    if (!addModal || !addForm) return;
    addForm.reset();
    if (addError) { addError.hidden = true; addError.textContent = ""; }
    if (editingRec) {
      addTitle.textContent = "Label bewerken";
      addSubmit.textContent = "Opslaan";
      editIdInput.value = editingRec.id;
      addNaam.value = editingRec.naam || "";
      addBeschr.value = editingRec.beschrijving || "";
    } else {
      addTitle.textContent = "Label toevoegen";
      addSubmit.textContent = "Aanmaken";
      editIdInput.value = "";
    }
    addModal.removeAttribute("hidden");
    addModal.setAttribute("aria-hidden", "false");
    window.setTimeout(function () { if (addNaam) addNaam.focus(); }, 10);
  }
  function closeAddModal() {
    if (!addModal) return;
    addModal.setAttribute("hidden", "");
    addModal.setAttribute("aria-hidden", "true");
    if (addForm) addForm.reset();
    if (editIdInput) editIdInput.value = "";
    if (addError) { addError.hidden = true; addError.textContent = ""; }
  }

  function getPageSize() {
    return Math.max(5, parseInt(rowsSelect && rowsSelect.value ? rowsSelect.value : "15", 10) || 15);
  }

  function getSortValue(item, key) {
    if (!item) return "";
    if (key === "naam") return String(item.naam || "").toLowerCase();
    if (key === "status") return item.archived ? "1" : "0";
    if (key === "aangemaakt") return String(item.aanmaakdatum || "");
    if (key === "gewijzigd") return String(item.laatstGewijzigd || "");
    return "";
  }

  function findById(id) {
    var items = getCached();
    for (var i = 0; i < items.length; i++) if (items[i] && items[i].id === id) return items[i];
    return null;
  }

  function getFiltered() {
    var items = getCached();
    var showArch = archivedToggle && archivedToggle.checked;
    items = items.filter(function (r) {
      if (!r) return false;
      return showArch ? r.archived === true : !r.archived;
    });
    var q = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        var n = String(r.naam || "").toLowerCase();
        var b = String(r.beschrijving || "").toLowerCase();
        return n.indexOf(q) !== -1 || b.indexOf(q) !== -1;
      });
    }
    items = items.slice();
    items.sort(function (a, b) {
      var av = getSortValue(a, sortKey);
      var bv = getSortValue(b, sortKey);
      var as = String(av);
      var bs = String(bv);
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#wl-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyColumnVisibility() {
    document.querySelectorAll("#wl-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setColumnVisible(colId, isOn);
    });
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function render() {
    var items = getFiltered();
    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var end = Math.min(start + pageSize, total);
    var page = items.slice(start, end);

    tbody.innerHTML = "";
    if (!page.length) {
      var trE = document.createElement("tr");
      var tdE = document.createElement("td");
      tdE.colSpan = 7;
      tdE.className = "cl-empty-cell";
      tdE.textContent = "Geen resultaten gevonden";
      trE.appendChild(tdE);
      tbody.appendChild(trE);
    } else {
      var showArch = archivedToggle && archivedToggle.checked;
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-id", r.id);
        tr.className = "wl-data-row";
        var statusHtml = r.archived
          ? '<span class="status-pill status-pill--archived">Gearchiveerd</span>'
          : '<span class="status-pill status-pill--active">Actief</span>';
        var actionsHtml;
        if (showArch) {
          actionsHtml =
            '<div class="hr-row-actions">'
            + '<button type="button" class="btn-outline hr-restore-btn wl-restore-btn" data-id="' + escHtml(r.id) + '">Herstel</button>'
            + '<button type="button" class="employee-delete-btn wl-purge-btn" data-id="' + escHtml(r.id) + '" aria-label="Definitief verwijderen">' + TRASH_SVG + '</button>'
            + '</div>';
        } else {
          actionsHtml =
            '<div class="hr-row-actions wl-row-actions">'
            + '<button type="button" class="wl-row-edit" data-id="' + escHtml(r.id) + '" aria-label="Bewerken">' + EDIT_SVG + '</button>'
            + '<button type="button" class="employee-delete-btn wl-archive-btn" data-id="' + escHtml(r.id) + '" aria-label="Label archiveren">' + TRASH_SVG + '</button>'
            + '</div>';
        }
        tr.innerHTML =
          '<td data-col="select"><input type="checkbox" class="table-checkbox wl-row-check" aria-label="Selecteer rij" data-id="' + escHtml(r.id) + '" /></td>'
          + '<td data-col="naam">' + escHtml(r.naam || "—") + '</td>'
          + '<td data-col="beschrijving">' + escHtml(r.beschrijving || "—") + '</td>'
          + '<td data-col="status">' + statusHtml + '</td>'
          + '<td data-col="aangemaakt">' + escHtml(fmtDate(r.aanmaakdatum)) + '</td>'
          + '<td data-col="gewijzigd">' + escHtml(fmtDate(r.laatstGewijzigd)) + '</td>'
          + '<td data-col="acties" class="cl-actions-cell">' + actionsHtml + '</td>';
        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) {
      rangeEl.textContent = total === 0 ? "0 van 0" : (start + 1) + "–" + end + " van " + total;
    }
    if (pageEl) {
      pageEl.textContent = total === 0 ? "Pagina 0 van 0" : "Pagina " + (currentPage + 1) + " van " + totalPages;
    }
    var first = document.getElementById("wl-pager-first");
    var prev = document.getElementById("wl-pager-prev");
    var next = document.getElementById("wl-pager-next");
    var last = document.getElementById("wl-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;

    if (checkAll) checkAll.checked = false;
    syncSortTh();
  }

  function syncSortTh() {
    table.querySelectorAll("thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc", "th-sort-open");
      var c = th.getAttribute("data-col");
      if (c && c === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });
  if (archivedToggle) archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });
  if (rowsSelect) rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });

  if (checkAll) {
    checkAll.addEventListener("change", function () {
      var on = checkAll.checked;
      tbody.querySelectorAll(".wl-row-check").forEach(function (c) { c.checked = on; });
    });
  }
  tbody.addEventListener("change", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("wl-row-check") && checkAll) {
      checkAll.checked = false;
    }
  });

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("wl-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var items = getFiltered();
      var pageSize = getPageSize();
      var tot = items.length;
      var totalPages = Math.max(1, Math.ceil(tot / pageSize));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  // ---- Kolommen-dropdown ------------------------------------------------
  var colBtn = document.getElementById("wl-columns-menu-btn");
  var colPanel = document.getElementById("wl-columns-panel");
  document.querySelectorAll("#wl-columns-list .column-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      var on = btn.getAttribute("aria-checked") === "true";
      btn.setAttribute("aria-checked", on ? "false" : "true");
      btn.classList.toggle("is-checked", !on);
      applyColumnVisibility();
    });
  });
  if (colBtn && colPanel) {
    colBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (colPanel.hasAttribute("hidden")) {
        colPanel.removeAttribute("hidden");
        colBtn.setAttribute("aria-expanded", "true");
      } else {
        colPanel.setAttribute("hidden", "");
        colBtn.setAttribute("aria-expanded", "false");
      }
    });
    colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  }
  document.addEventListener("click", function () {
    if (colPanel) {
      colPanel.setAttribute("hidden", "");
      if (colBtn) colBtn.setAttribute("aria-expanded", "false");
    }
    document.querySelectorAll("#wl-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
  });

  // ---- Sort-menu in header --------------------------------------------
  if (table) {
    table.querySelectorAll(".th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#wl-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
        if (wasHidden) menu.removeAttribute("hidden");
      });
    });
    table.querySelectorAll(".th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = opt.getAttribute("data-action");
        var th = opt.closest("th");
        var colId = th ? th.getAttribute("data-col") : null;
        if (!colId) return;
        if (action === "hide") {
          var toggle = document.querySelector('#wl-columns-list .column-toggle[data-col="' + colId + '"]');
          if (toggle) {
            toggle.classList.remove("is-checked");
            toggle.setAttribute("aria-checked", "false");
            setColumnVisible(colId, false);
          }
        } else {
          sortKey = colId;
          sortDir = action;
          currentPage = 0;
          render();
        }
        document.querySelectorAll("#wl-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      });
    });
  }

  // ---- Add/Edit modal handlers ----------------------------------------
  var addBtn = document.getElementById("wl-add-btn");
  if (addBtn) addBtn.addEventListener("click", function (e) { e.preventDefault(); openAddModal(null); });
  if (addForm) {
    addForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var nm = addNaam ? (addNaam.value || "").trim() : "";
      var beschr = addBeschr ? (addBeschr.value || "").trim() : "";
      if (!nm) {
        if (addError) { addError.hidden = false; addError.textContent = "Naam is verplicht."; }
        return;
      }
      var editing = editIdInput && editIdInput.value;
      addSubmit.disabled = true;
      var origLabel = addSubmit.textContent;
      addSubmit.textContent = "Bezig…";
      try {
        if (editing) {
          await window.werkurenLabelsDB.update(editing, { naam: nm, beschrijving: beschr });
          if (typeof showSaveModal === "function") showSaveModal("Label is bijgewerkt.", "Opgeslagen");
          else showToast("Label opgeslagen");
        } else {
          await window.werkurenLabelsDB.add({ naam: nm, beschrijving: beschr });
          if (typeof showSaveModal === "function") showSaveModal("Label is opgeslagen.", "Opgeslagen");
          else showToast("Label opgeslagen");
        }
        closeAddModal();
        currentPage = 0;
        render();
      } catch (err) {
        console.error("Label opslaan mislukt:", err);
        if (addError) { addError.hidden = false; addError.textContent = "Opslaan mislukt: " + (err && err.message ? err.message : String(err)); }
      } finally {
        addSubmit.disabled = false;
        addSubmit.textContent = origLabel;
      }
    });
  }
  [addClose, addCancel].forEach(function (btn) {
    if (btn) btn.addEventListener("click", function () { closeAddModal(); });
  });
  if (addModal) {
    addModal.addEventListener("click", function (e) {
      if (e.target === addModal) closeAddModal();
    });
  }

  // ---- Slider-confirm modals (archive + purge) ------------------------
  function syncSlider(sliderId, btnId) {
    var s = document.getElementById(sliderId);
    var c = document.getElementById(btnId);
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    s.setAttribute("aria-valuenow", String(v));
    c.disabled = v < 100;
  }
  function syncArSlider() { syncSlider("wl-ar-slider", "wl-ar-confirm"); }
  function syncPurgeSlider() { syncSlider("wl-purge-slider", "wl-purge-confirm"); }

  function closeArchive() {
    var m = document.getElementById("wl-archive-modal");
    var s = document.getElementById("wl-ar-slider");
    pendingArchiveId = "";
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
    if (s) s.value = "0";
    syncArSlider();
  }
  function openArchive(id) {
    var r = findById(id);
    if (!r) return;
    pendingArchiveId = id;
    var pr = document.getElementById("wl-ar-preview");
    if (pr) pr.textContent = r.naam || "—";
    var m = document.getElementById("wl-archive-modal");
    if (m) { m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false"); }
    var s = document.getElementById("wl-ar-slider");
    if (s) s.value = "0";
    syncArSlider();
  }
  function closePurge() {
    var m = document.getElementById("wl-purge-modal");
    var s = document.getElementById("wl-purge-slider");
    pendingPurgeId = "";
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
    if (s) s.value = "0";
    syncPurgeSlider();
  }
  function openPurge(id) {
    var r = findById(id);
    if (!r) return;
    pendingPurgeId = id;
    var pr = document.getElementById("wl-purge-preview");
    if (pr) pr.textContent = r.naam || "—";
    var m = document.getElementById("wl-purge-modal");
    if (m) { m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false"); }
    var s = document.getElementById("wl-purge-slider");
    if (s) s.value = "0";
    syncPurgeSlider();
  }

  var arModal = document.getElementById("wl-archive-modal");
  var purgeModal = document.getElementById("wl-purge-modal");
  var arSlider = document.getElementById("wl-ar-slider");
  var purgeSlider = document.getElementById("wl-purge-slider");
  if (arSlider) {
    arSlider.addEventListener("input", syncArSlider);
    arSlider.addEventListener("change", syncArSlider);
  }
  if (purgeSlider) {
    purgeSlider.addEventListener("input", syncPurgeSlider);
    purgeSlider.addEventListener("change", syncPurgeSlider);
  }
  document.getElementById("wl-ar-confirm") && document.getElementById("wl-ar-confirm").addEventListener("click", async function () {
    if (!pendingArchiveId) return;
    var s = document.getElementById("wl-ar-slider");
    if (s && parseInt(s.value, 10) < 100) return;
    var idToArchive = pendingArchiveId;
    closeArchive();
    try {
      await window.werkurenLabelsDB.archive(idToArchive);
      if (typeof showSaveModal === "function") showSaveModal("Label is gearchiveerd.", "Gearchiveerd");
      else showToast("Label gearchiveerd");
    } catch (err) {
      console.error("Archiveren mislukt:", err);
      showToast("Archiveren is niet gelukt");
    }
    render();
  });
  document.getElementById("wl-purge-confirm") && document.getElementById("wl-purge-confirm").addEventListener("click", async function () {
    if (!pendingPurgeId) return;
    var s = document.getElementById("wl-purge-slider");
    if (s && parseInt(s.value, 10) < 100) return;
    var idToPurge = pendingPurgeId;
    closePurge();
    try {
      await window.werkurenLabelsDB.delete(idToPurge);
      if (typeof showSaveModal === "function") showSaveModal("Label is definitief verwijderd.", "Verwijderd");
      else showToast("Label verwijderd");
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
      showToast("Verwijderen is niet gelukt");
    }
    render();
  });
  document.getElementById("wl-ar-close") && document.getElementById("wl-ar-close").addEventListener("click", closeArchive);
  document.getElementById("wl-ar-cancel") && document.getElementById("wl-ar-cancel").addEventListener("click", closeArchive);
  document.getElementById("wl-purge-close") && document.getElementById("wl-purge-close").addEventListener("click", closePurge);
  document.getElementById("wl-purge-cancel") && document.getElementById("wl-purge-cancel").addEventListener("click", closePurge);
  if (arModal) arModal.addEventListener("click", function (e) { if (e.target === arModal) closeArchive(); });
  if (purgeModal) purgeModal.addEventListener("click", function (e) { if (e.target === purgeModal) closePurge(); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (addModal && !addModal.hasAttribute("hidden")) { e.preventDefault(); closeAddModal(); }
    else if (purgeModal && !purgeModal.hasAttribute("hidden")) { e.preventDefault(); closePurge(); }
    else if (arModal && !arModal.hasAttribute("hidden")) { e.preventDefault(); closeArchive(); }
  });

  // ---- Row actions (delegated) ---------------------------------------
  tbody.addEventListener("click", async function (e) {
    var t = e.target;
    var elRestore = t && t.closest && t.closest(".wl-restore-btn");
    var elPurge = t && t.closest && t.closest(".wl-purge-btn");
    var elArchive = t && t.closest && t.closest(".wl-archive-btn");
    var elEdit = t && t.closest && t.closest(".wl-row-edit");
    if (elRestore) {
      e.preventDefault();
      var id = elRestore.getAttribute("data-id");
      if (id) {
        try {
          await window.werkurenLabelsDB.restore(id);
          if (typeof showSaveModal === "function") showSaveModal("Label is hersteld.", "Hersteld");
          else showToast("Label hersteld");
        } catch (err) {
          console.error("Herstellen mislukt:", err);
          showToast("Herstellen is niet gelukt");
        }
        render();
      }
      return;
    }
    if (elPurge) {
      e.preventDefault();
      var pid = elPurge.getAttribute("data-id");
      if (pid) openPurge(pid);
      return;
    }
    if (elArchive) {
      e.preventDefault();
      var aid = elArchive.getAttribute("data-id");
      if (aid) openArchive(aid);
      return;
    }
    if (elEdit) {
      e.preventDefault();
      var eid = elEdit.getAttribute("data-id");
      if (eid) {
        var rec = findById(eid);
        if (rec) openAddModal(rec);
      }
      return;
    }
  });

  function initialRender() {
    var cached = getCached();
    if (cached.length > 0) render();
    else if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="cl-empty-cell">Labels laden…</td></tr>';
  }

  window.addEventListener("besa:werkuren-labels-updated", render);
  initialRender();
})();
