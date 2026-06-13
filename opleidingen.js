/**
 * Opleidingen — lijstpagina (HR module).
 *
 * Reads gaan via window.opleidingenDB.getAllSync() (cache).
 * Writes gaan via de async API van window.opleidingenDB en worden door die
 * module ook in Supabase weggeschreven. Re-render gebeurt automatisch via
 * het "ff:opleidingen-updated" event.
 *
 * Backward-compatibility: voor pagina's die opleidingen.js inlezen voor de
 * helper-functies (zoals oude opleiding-detail.html dat deed), exposen we
 * ook getOpleidingen()/saveOpleidingen()/oplFmtDate() globaal. Deze gebruiken
 * de cache zodat alle synchrone callers hetzelfde data zien.
 */

var OPL_STORAGE_KEY = "opleidingen";

function getOpleidingen() {
  if (window.opleidingenDB && typeof window.opleidingenDB.getAllSync === "function") {
    return window.opleidingenDB.getAllSync();
  }
  try {
    var raw = localStorage.getItem(OPL_STORAGE_KEY);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

// Behouden als compatibility-shim. Schrijven hoort via opleidingenDB te
// gebeuren; deze functie schrijft alleen naar de cache en wordt door de
// data-laag zelf gebruikt na succesvolle Supabase-writes.
function saveOpleidingen(list) {
  try { localStorage.setItem(OPL_STORAGE_KEY, JSON.stringify(list)); }
  catch (e) { console.error("saveOpleidingen fout:", e); }
}

function oplFmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  var dd = String(d.getDate()).padStart(2, "0");
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var yy = d.getFullYear();
  var hh = String(d.getHours()).padStart(2, "0");
  var mi = String(d.getMinutes()).padStart(2, "0");
  return dd + "-" + mm + "-" + yy + " " + hh + ":" + mi;
}

(function () {
  var tbody = document.getElementById("opl-tbody");
  var searchInput = document.getElementById("opl-search");
  var archivedToggle = document.getElementById("opl-archived-toggle");
  var rangeEl = document.getElementById("opl-pager-range");
  var pageEl = document.getElementById("opl-pager-page");
  var rowsSelect = document.getElementById("opl-rows-per-page");
  var checkAll = document.getElementById("opl-check-all");

  if (!tbody) return;

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "15", 10);
  }

  function sortFieldFromThCol(col) {
    if (col === "laatst-gewijzigd") return "laatstGewijzigd";
    return col;
  }

  function getFilteredOpleidingen() {
    var items = getOpleidingen();
    var showArchived = archivedToggle ? archivedToggle.checked : false;

    items = items.filter(function (o) {
      if (showArchived) return o.archived === true;
      return !o.archived;
    });

    var query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (query) {
      items = items.filter(function (o) {
        return (o.naam || "").toLowerCase().includes(query) || (o.skj ? "ja" : "nee").includes(query);
      });
    }

    if (sortKey) {
      var sk = sortFieldFromThCol(sortKey);
      items = items.slice();
      items.sort(function (a, b) {
        var av = a[sk] || "";
        var bv = b[sk] || "";
        if (sk === "skj") {
          av = a.skj ? "Ja" : "Nee";
          bv = b.skj ? "Ja" : "Nee";
        }
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  function renderEmptyState(message) {
    tbody.innerHTML = "";
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = message;
    td.style.textAlign = "center";
    td.style.padding = "24px";
    td.style.color = "#9ca3af";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function render() {
    var items = getFilteredOpleidingen();

    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var page = items.slice(start, start + pageSize);

    tbody.innerHTML = "";
    if (!page.length) {
      renderEmptyState("Geen opleidingen gevonden");
    } else {
      page.forEach(function (o) {
        var tr = document.createElement("tr");
        tr.className = "opl-table-row";
        tr.dataset.oplId = o.id;
        tr.dataset.oplNaam = o.naam;

        var tdCheck = document.createElement("td");
        tdCheck.className = "opl-td-check";
        tdCheck.innerHTML = '<input type="checkbox" class="opl-row-check" />';
        tr.appendChild(tdCheck);

        var tdNaam = document.createElement("td");
        tdNaam.dataset.col = "naam";
        tdNaam.textContent = o.naam;
        tr.appendChild(tdNaam);

        var tdSkj = document.createElement("td");
        tdSkj.dataset.col = "skj";
        tdSkj.textContent = o.skj ? "Ja" : "Nee";
        tr.appendChild(tdSkj);

        var tdAanmaak = document.createElement("td");
        tdAanmaak.dataset.col = "aanmaakdatum";
        tdAanmaak.textContent = oplFmtDate(o.aanmaakdatum);
        tr.appendChild(tdAanmaak);

        var tdGewijzigd = document.createElement("td");
        tdGewijzigd.dataset.col = "laatst-gewijzigd";
        tdGewijzigd.textContent = oplFmtDate(o.laatstGewijzigd);
        tr.appendChild(tdGewijzigd);

        var tdDel = document.createElement("td");
        tdDel.className = "opl-td-acties";
        tdDel.style.textAlign = "center";
        var showArcO = archivedToggle ? archivedToggle.checked : false;
        var trashSvgO = '<svg class="employee-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        if (showArcO) {
          var wrapO = document.createElement("div");
          wrapO.className = "hr-row-actions";
          var resO = document.createElement("button");
          resO.type = "button";
          resO.className = "btn-outline hr-restore-btn";
          resO.setAttribute("data-opl-id", o.id);
          resO.textContent = "Herstel";
          var pO = document.createElement("button");
          pO.type = "button";
          pO.className = "employee-delete-btn opl-purge-btn";
          pO.setAttribute("aria-label", "Definitief verwijderen");
          pO.innerHTML = trashSvgO;
          wrapO.appendChild(resO);
          wrapO.appendChild(pO);
          tdDel.appendChild(wrapO);
        } else {
          var delBtnO = document.createElement("button");
          delBtnO.type = "button";
          delBtnO.className = "employee-delete-btn opl-archive-btn";
          delBtnO.setAttribute("aria-label", "Opleiding archiveren");
          delBtnO.innerHTML = trashSvgO;
          tdDel.appendChild(delBtnO);
        }
        tr.appendChild(tdDel);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        var endIdx = Math.min(start + pageSize, total);
        rangeEl.textContent = (start + 1) + "–" + endIdx + " van " + total;
      }
    }
    if (pageEl) pageEl.textContent = "Pagina " + (currentPage + 1) + " van " + totalPages;

    var first = document.getElementById("opl-pager-first");
    var prev = document.getElementById("opl-pager-prev");
    var next = document.getElementById("opl-pager-next");
    var last = document.getElementById("opl-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;

    if (checkAll) checkAll.checked = false;
  }

  function initialRender() {
    if (getOpleidingen().length === 0) {
      renderEmptyState("Opleidingen worden geladen…");
    } else {
      render();
    }
  }

  window.addEventListener("ff:opleidingen-updated", function () {
    render();
  });

  // Pagination
  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("opl-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var filtered = getFilteredOpleidingen();
      var pageSize = getPageSize();
      var total = filtered.length;
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  if (rowsSelect) rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });
  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });
  if (archivedToggle) archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });

  // Column toggle
  var columnsBtn = document.getElementById("columns-menu-btn");
  var columnsPanel = document.getElementById("columns-panel");

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#opl-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll(".column-toggle").forEach(function (btn) {
      var colId = btn.dataset.col;
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  document.querySelectorAll(".column-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      btn.classList.toggle("is-checked");
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(btn.dataset.col, visible);
    });
  });

  if (columnsBtn && columnsPanel) {
    columnsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !columnsPanel.hidden;
      columnsPanel.hidden = open;
      columnsBtn.setAttribute("aria-expanded", !open);
    });
    columnsPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  document.addEventListener("click", function () {
    if (columnsPanel) { columnsPanel.hidden = true; if (columnsBtn) columnsBtn.setAttribute("aria-expanded", "false"); }
    document.querySelectorAll(".th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
  });

  document.querySelectorAll(".th-sort-trigger").forEach(function (trigger) {
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var th = trigger.closest("th");
      var menu = th ? th.querySelector(".th-sort-menu") : null;
      if (!menu) return;
      var wasHidden = menu.hasAttribute("hidden");
      document.querySelectorAll(".th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      if (wasHidden) menu.removeAttribute("hidden");
    });
  });

  document.querySelectorAll(".th-sort-opt").forEach(function (opt) {
    opt.addEventListener("click", function (e) {
      e.stopPropagation();
      var action = opt.dataset.action;
      var th = opt.closest("th");
      var colId = th ? th.dataset.col : null;
      if (!colId) return;

      if (action === "hide") {
        var toggle = document.querySelector('.column-toggle[data-col="' + colId + '"]');
        if (toggle) {
          toggle.classList.remove("is-checked");
          toggle.setAttribute("aria-checked", "false");
        }
        setColumnVisible(colId, false);
      } else {
        sortKey = colId;
        sortDir = action;
        render();
      }
      document.querySelectorAll(".th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    });
  });

  if (checkAll) {
    checkAll.addEventListener("change", function () {
      tbody.querySelectorAll(".opl-row-check").forEach(function (cb) { cb.checked = checkAll.checked; });
    });
  }

  // ── Add opleiding modal ──
  var addBtn = document.getElementById("opl-add-btn");
  var addModal = document.getElementById("opl-add-modal");
  var addCloseBtn = document.getElementById("opl-add-close-btn");
  var addCancelBtn = document.getElementById("opl-add-cancel-btn");
  var addForm = document.getElementById("opl-add-form");

  function openAddModal() { if (addModal) addModal.style.display = ""; }
  function closeAddModal() { if (addModal) addModal.style.display = "none"; }

  if (addBtn) addBtn.addEventListener("click", openAddModal);
  if (addCloseBtn) addCloseBtn.addEventListener("click", closeAddModal);
  if (addCancelBtn) addCancelBtn.addEventListener("click", closeAddModal);
  if (addModal) addModal.addEventListener("click", function (e) { if (e.target === addModal) closeAddModal(); });

  if (addForm) {
    addForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var naamInput = document.getElementById("opl-add-naam");
      var skjInput = document.getElementById("opl-add-skj");
      var naam = naamInput ? naamInput.value.trim() : "";
      if (!naam) { if (naamInput) naamInput.focus(); return; }
      var submitBtn = addForm.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await window.opleidingenDB.add({ naam: naam, skj: skjInput ? !!skjInput.checked : false });
        if (naamInput) naamInput.value = "";
        if (skjInput) skjInput.checked = false;
        closeAddModal();
      } catch (err) {
        console.error("Toevoegen mislukt:", err);
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Toevoegen mislukt", err && err.message ? err.message : "Onbekende fout.");
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ── Archive modal ──
  var delModal = document.getElementById("opl-delete-modal");
  var delSlider = document.getElementById("opl-delete-slider");
  var delConfirmBtn = document.getElementById("opl-delete-confirm-btn");
  var delCancelBtn = document.getElementById("opl-delete-cancel-btn");
  var delCloseBtn = document.getElementById("opl-delete-close-btn");
  var delPreview = document.getElementById("opl-delete-preview");
  var deleteTarget = null;

  // ── Purge (definitief verwijderen) modal ──
  var opPurgeModal = document.getElementById("opl-purge-modal");
  var opPurgeSlider = document.getElementById("opl-purge-slider");
  var opPurgeConfirm = document.getElementById("opl-purge-confirm-btn");
  var opPurgeCancel = document.getElementById("opl-purge-cancel-btn");
  var opPurgeClose = document.getElementById("opl-purge-close-btn");
  var opPurgePreview = document.getElementById("opl-purge-preview");
  var oplPurgeTarget = null;

  function syncOplPurgeSlider() {
    if (!opPurgeSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(opPurgeSlider.value, 10) || 0));
    opPurgeSlider.value = String(v);
    opPurgeSlider.style.setProperty("--employee-slider-pct", v + "%");
    opPurgeSlider.setAttribute("aria-valuenow", String(v));
    if (opPurgeConfirm) opPurgeConfirm.disabled = v < 100;
  }

  function resetOplPurgeSlider() {
    if (opPurgeSlider) { opPurgeSlider.value = "0"; syncOplPurgeSlider(); }
  }

  function openOplPurgeModal(id, naam) {
    oplPurgeTarget = id;
    if (opPurgePreview) opPurgePreview.textContent = naam;
    resetOplPurgeSlider();
    if (opPurgeModal) { opPurgeModal.removeAttribute("hidden"); opPurgeModal.setAttribute("aria-hidden", "false"); }
  }

  function closeOplPurgeModal() {
    if (opPurgeModal) { opPurgeModal.setAttribute("hidden", ""); opPurgeModal.setAttribute("aria-hidden", "true"); }
    oplPurgeTarget = null;
    resetOplPurgeSlider();
    if (opPurgePreview) opPurgePreview.textContent = "";
  }

  async function confirmOplPurge() {
    if (!oplPurgeTarget || (opPurgeConfirm && opPurgeConfirm.disabled)) return;
    var target = oplPurgeTarget;
    if (opPurgeConfirm) opPurgeConfirm.disabled = true;
    try {
      await window.opleidingenDB.delete(target);
      closeOplPurgeModal();
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", "Verwijderen mislukt", err && err.message ? err.message : "Onbekende fout.");
      }
      if (opPurgeConfirm) opPurgeConfirm.disabled = false;
    }
  }

  function syncDelSlider() {
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetDelSlider() {
    if (delSlider) { delSlider.value = "0"; syncDelSlider(); }
  }

  function openDeleteModal(id, naam) {
    deleteTarget = id;
    if (delPreview) delPreview.textContent = naam;
    resetDelSlider();
    if (delModal) { delModal.removeAttribute("hidden"); delModal.setAttribute("aria-hidden", "false"); }
  }

  function closeDeleteModal() {
    if (delModal) { delModal.setAttribute("hidden", ""); delModal.setAttribute("aria-hidden", "true"); }
    deleteTarget = null;
    resetDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  async function confirmDelete() {
    if (!deleteTarget || (delConfirmBtn && delConfirmBtn.disabled)) return;
    var target = deleteTarget;
    if (delConfirmBtn) delConfirmBtn.disabled = true;
    try {
      await window.opleidingenDB.archive(target);
      closeDeleteModal();
    } catch (err) {
      console.error("Archiveren mislukt:", err);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", "Archiveren mislukt", err && err.message ? err.message : "Onbekende fout.");
      }
      if (delConfirmBtn) delConfirmBtn.disabled = false;
    }
  }

  tbody.addEventListener("click", async function (e) {
    var resOpl = e.target.closest(".hr-restore-btn");
    if (resOpl && resOpl.getAttribute("data-opl-id")) {
      e.preventDefault();
      e.stopPropagation();
      var rido = resOpl.getAttribute("data-opl-id");
      try { await window.opleidingenDB.restore(rido); }
      catch (err) {
        console.error("Herstellen mislukt:", err);
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Herstellen mislukt", err && err.message ? err.message : "Onbekende fout.");
        }
      }
      return;
    }
    var purO = e.target.closest(".opl-purge-btn");
    if (purO) {
      e.preventDefault();
      e.stopPropagation();
      var trPo = purO.closest("tr");
      if (trPo && trPo.dataset.oplId) openOplPurgeModal(trPo.dataset.oplId, trPo.dataset.oplNaam || "");
      return;
    }
    var delBtnEl = e.target.closest(".opl-archive-btn");
    if (delBtnEl) {
      e.preventDefault();
      e.stopPropagation();
      var tr = delBtnEl.closest("tr");
      if (tr && tr.dataset.oplId) openDeleteModal(tr.dataset.oplId, tr.dataset.oplNaam || "");
      return;
    }
    if (e.target.closest(".opl-td-check") || e.target.closest(".opl-row-check")) return;
    if (e.target.closest(".opl-td-acties")) return;
    var row = e.target.closest("tr");
    if (!row || !row.dataset.oplId) return;
    window.location.href = "opleiding-detail.html?id=" + encodeURIComponent(row.dataset.oplId);
  });

  if (delSlider) { delSlider.addEventListener("input", syncDelSlider); delSlider.addEventListener("change", syncDelSlider); }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeDeleteModal);
  if (delModal) delModal.addEventListener("click", function (e) { if (e.target === delModal) closeDeleteModal(); });

  if (opPurgeSlider) {
    opPurgeSlider.addEventListener("input", syncOplPurgeSlider);
    opPurgeSlider.addEventListener("change", syncOplPurgeSlider);
  }
  if (opPurgeConfirm) opPurgeConfirm.addEventListener("click", confirmOplPurge);
  if (opPurgeCancel) opPurgeCancel.addEventListener("click", closeOplPurgeModal);
  if (opPurgeClose) opPurgeClose.addEventListener("click", closeOplPurgeModal);
  if (opPurgeModal) {
    opPurgeModal.addEventListener("click", function (e) {
      if (e.target === opPurgeModal) closeOplPurgeModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // Module 06 Bug #21 fix: generic Escape sluit topmost open modal
    // (op-purge, opl-delete, opl-add, opl-edit, etc.)
    const openModals = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"));
    if (openModals.length === 0) return;
    const topmost = openModals[openModals.length - 1];
    if (opPurgeModal && topmost.id === opPurgeModal.id) {
      closeOplPurgeModal();
    } else {
      topmost.setAttribute("hidden", "");
      topmost.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
    }
    e.preventDefault();
  });

  initialRender();
})();
