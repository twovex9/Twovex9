/* Data: bureaus-data.js (Supabase-backed via window.bureausDB) */

(function () {
  var tbody = document.getElementById("bur-tbody");
  var table = document.getElementById("bur-table");
  var searchInput = document.getElementById("bur-search");
  var archivedToggle = document.getElementById("bur-archived-toggle");
  var rangeEl = document.getElementById("bur-pager-range");
  var pageEl = document.getElementById("bur-pager-page");
  var rowsSelect = document.getElementById("bur-rows-per-page");
  var checkAll = document.getElementById("bur-check-all");

  if (!tbody || !table) return;
  if (!window.bureausDB) {
    console.error("bureausDB ontbreekt — laad supabase-client.js + bureaus-data.js vóór bureaus.js.");
    return;
  }

  function getBureausCached() {
    return window.bureausDB.getAllSync();
  }

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "50", 10);
  }

  function getFilteredBureaus() {
    var items = getBureausCached();
    var showArchived = archivedToggle ? archivedToggle.checked : false;

    items = items.filter(function (o) {
      if (showArchived) return o.archived === true;
      return !o.archived;
    });

    var query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (query) {
      items = items.filter(function (o) {
        return (o.naam || "").toLowerCase().includes(query);
      });
    }

    if (sortKey === "naam") {
      items = items.slice();
      items.sort(function (a, b) {
        var av = (a.naam || "").toLowerCase();
        var bv = (b.naam || "").toLowerCase();
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#bur-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#columns-panel .column-toggle").forEach(function (btn) {
      var colId = btn.dataset.col;
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  function render() {
    var items = getFilteredBureaus();
    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var page = items.slice(start, start + pageSize);

    tbody.innerHTML = "";
    if (!page.length) {
      var trE = document.createElement("tr");
      var tdE = document.createElement("td");
      tdE.colSpan = 3;
      tdE.textContent = "Geen bureau's gevonden";
      tdE.style.textAlign = "center";
      tdE.style.padding = "24px";
      tdE.style.color = "#9ca3af";
      trE.appendChild(tdE);
      tbody.appendChild(trE);
    } else {
      page.forEach(function (o) {
        var tr = document.createElement("tr");
        tr.dataset.burId = o.id;
        tr.dataset.burNaam = o.naam;
        tr.className = "bur-table-row";
        tr.style.cursor = "pointer";

        var tdCheck = document.createElement("td");
        tdCheck.className = "bur-td-check";
        tdCheck.innerHTML = '<input type="checkbox" class="bur-row-check" aria-label="Selecteer rij" />';
        tr.appendChild(tdCheck);

        var tdNaam = document.createElement("td");
        tdNaam.dataset.col = "naam";
        tdNaam.textContent = o.naam || "";
        tr.appendChild(tdNaam);

        var tdAct = document.createElement("td");
        tdAct.className = "bur-td-acties";
        var showArc = archivedToggle ? archivedToggle.checked : false;
        var trashSvg = '<svg class="employee-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        if (showArc) {
          var wrap = document.createElement("div");
          wrap.className = "hr-row-actions";
          var resBtn = document.createElement("button");
          resBtn.type = "button";
          resBtn.className = "btn-outline hr-restore-btn";
          resBtn.setAttribute("data-bur-id", o.id);
          resBtn.textContent = "Herstel";
          var pBtn = document.createElement("button");
          pBtn.type = "button";
          pBtn.className = "employee-delete-btn bur-purge-btn";
          pBtn.setAttribute("aria-label", "Definitief verwijderen");
          pBtn.innerHTML = trashSvg;
          wrap.appendChild(resBtn);
          wrap.appendChild(pBtn);
          tdAct.appendChild(wrap);
        } else {
          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "employee-delete-btn bur-archive-btn";
          delBtn.setAttribute("aria-label", "Bureau archiveren");
          delBtn.innerHTML = trashSvg;
          tdAct.appendChild(delBtn);
        }
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 of 0 total.";
      } else {
        rangeEl.textContent = pageSize + " of " + total + " total.";
      }
    }
    if (pageEl) pageEl.textContent = "Page " + (currentPage + 1) + " of " + totalPages;

    var first = document.getElementById("bur-pager-first");
    var prev = document.getElementById("bur-pager-prev");
    var next = document.getElementById("bur-pager-next");
    var last = document.getElementById("bur-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;

    if (checkAll) checkAll.checked = false;
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("bur-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var filtered = getFilteredBureaus();
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

  var columnsBtn = document.getElementById("columns-menu-btn");
  var columnsPanel = document.getElementById("columns-panel");

  document.querySelectorAll("#columns-panel .column-toggle").forEach(function (btn) {
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
    if (columnsPanel) {
      columnsPanel.hidden = true;
      if (columnsBtn) columnsBtn.setAttribute("aria-expanded", "false");
    }
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
      tbody.querySelectorAll(".bur-row-check").forEach(function (cb) { cb.checked = checkAll.checked; });
    });
  }

  var addBtn = document.getElementById("bur-add-btn");
  var addModal = document.getElementById("bur-add-modal");
  var addCloseBtn = document.getElementById("bur-add-close-btn");
  var addCancelBtn = document.getElementById("bur-add-cancel-btn");
  var addForm = document.getElementById("bur-add-form");

  function resetBurAddForm() {
    var el = document.getElementById("bur-add-naam");
    if (el) el.value = "";
  }

  function openAddModal() {
    if (!addModal) return;
    resetBurAddForm();
    addModal.style.display = "";
    addModal.setAttribute("aria-hidden", "false");
  }

  function closeAddModal() {
    if (!addModal) return;
    addModal.style.display = "none";
    addModal.setAttribute("aria-hidden", "true");
    resetBurAddForm();
  }

  if (addBtn) addBtn.addEventListener("click", openAddModal);
  if (addCloseBtn) addCloseBtn.addEventListener("click", closeAddModal);
  if (addCancelBtn) addCancelBtn.addEventListener("click", closeAddModal);
  if (addModal) addModal.addEventListener("click", function (e) { if (e.target === addModal) closeAddModal(); });

  var delModal = document.getElementById("bur-delete-modal");
  var delSlider = document.getElementById("bur-delete-slider");
  var delConfirmBtn = document.getElementById("bur-delete-confirm-btn");
  var delCancelBtn = document.getElementById("bur-delete-cancel-btn");
  var delCloseBtn = document.getElementById("bur-delete-close-btn");
  var delPreview = document.getElementById("bur-delete-preview");
  var deleteTargetId = null;

  var pModal = document.getElementById("bur-purge-modal");
  var pSlider = document.getElementById("bur-purge-slider");
  var pConfirmBtn = document.getElementById("bur-purge-confirm-btn");
  var pCancelBtn = document.getElementById("bur-purge-cancel-btn");
  var pCloseBtn = document.getElementById("bur-purge-close-btn");
  var pPreview = document.getElementById("bur-purge-preview");
  var purgeTargetId = null;

  function syncBurPurgeSlider() {
    if (!pSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(pSlider.value, 10) || 0));
    pSlider.value = String(v);
    pSlider.style.setProperty("--employee-slider-pct", v + "%");
    pSlider.setAttribute("aria-valuenow", String(v));
    if (pConfirmBtn) pConfirmBtn.disabled = v < 100;
  }

  function resetBurPurgeSlider() {
    if (pSlider) {
      pSlider.value = "0";
      syncBurPurgeSlider();
    }
  }

  function openBurPurgeModal(id, naam) {
    purgeTargetId = id;
    if (pPreview) pPreview.textContent = naam || "";
    resetBurPurgeSlider();
    if (pModal) {
      pModal.removeAttribute("hidden");
      pModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeBurPurgeModal() {
    if (pModal) {
      pModal.setAttribute("hidden", "");
      pModal.setAttribute("aria-hidden", "true");
    }
    purgeTargetId = null;
    resetBurPurgeSlider();
    if (pPreview) pPreview.textContent = "";
  }

  async function confirmBurPurge() {
    if (!purgeTargetId || (pConfirmBtn && pConfirmBtn.disabled)) return;
    var idToPurge = purgeTargetId;
    closeBurPurgeModal();
    try {
      await window.bureausDB.delete(idToPurge);
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
    }
    render();
  }

  function syncBurDelSlider() {
    if (!delSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetBurDelSlider() {
    if (delSlider) {
      delSlider.value = "0";
      syncBurDelSlider();
    }
  }

  function openBurDeleteModal(id, naam) {
    deleteTargetId = id;
    if (delPreview) delPreview.textContent = naam || "";
    resetBurDelSlider();
    if (delModal) {
      delModal.removeAttribute("hidden");
      delModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeBurDeleteModal() {
    if (delModal) {
      delModal.setAttribute("hidden", "");
      delModal.setAttribute("aria-hidden", "true");
    }
    deleteTargetId = null;
    resetBurDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  async function confirmBurArchive() {
    if (!deleteTargetId || (delConfirmBtn && delConfirmBtn.disabled)) return;
    var idToArchive = deleteTargetId;
    closeBurDeleteModal();
    try {
      await window.bureausDB.archive(idToArchive);
    } catch (err) {
      console.error("Archiveren mislukt:", err);
    }
    render();
  }

  if (delSlider) {
    delSlider.addEventListener("input", syncBurDelSlider);
    delSlider.addEventListener("change", syncBurDelSlider);
  }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmBurArchive);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeBurDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeBurDeleteModal);
  if (delModal) {
    delModal.addEventListener("click", function (e) {
      if (e.target === delModal) closeBurDeleteModal();
    });
  }

  if (pSlider) {
    pSlider.addEventListener("input", syncBurPurgeSlider);
    pSlider.addEventListener("change", syncBurPurgeSlider);
  }
  if (pConfirmBtn) pConfirmBtn.addEventListener("click", confirmBurPurge);
  if (pCancelBtn) pCancelBtn.addEventListener("click", closeBurPurgeModal);
  if (pCloseBtn) pCloseBtn.addEventListener("click", closeBurPurgeModal);
  if (pModal) {
    pModal.addEventListener("click", function (e) {
      if (e.target === pModal) closeBurPurgeModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (pModal && !pModal.hasAttribute("hidden")) {
      closeBurPurgeModal();
      e.preventDefault();
    }
  });

  tbody.addEventListener("click", async function (e) {
    var resEl = e.target.closest(".hr-restore-btn");
    if (resEl && resEl.getAttribute("data-bur-id")) {
      e.preventDefault();
      e.stopPropagation();
      var rid = resEl.getAttribute("data-bur-id");
      try {
        await window.bureausDB.restore(rid);
      } catch (err) {
        console.error("Herstellen mislukt:", err);
      }
      render();
      return;
    }
    var purEl = e.target.closest(".bur-purge-btn");
    if (purEl) {
      e.preventDefault();
      e.stopPropagation();
      var trP = purEl.closest("tr");
      if (trP && trP.dataset.burId) openBurPurgeModal(trP.dataset.burId, trP.dataset.burNaam || "");
      return;
    }
    var delBtnEl = e.target.closest(".bur-archive-btn");
    if (delBtnEl) {
      e.preventDefault();
      e.stopPropagation();
      var tr = delBtnEl.closest("tr");
      if (tr && tr.dataset.burId) openBurDeleteModal(tr.dataset.burId, tr.dataset.burNaam || "");
      return;
    }
    if (e.target.closest(".bur-td-check") || e.target.closest(".bur-row-check")) return;
    if (e.target.closest(".bur-td-acties")) return;
    var trNav = e.target.closest("tr.bur-table-row");
    if (!trNav || !trNav.dataset.burId) return;
    window.location.href = "bureau-detail.html?id=" + encodeURIComponent(trNav.dataset.burId);
  });

  if (addForm) {
    addForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var naamInput = document.getElementById("bur-add-naam");
      var naam = naamInput ? naamInput.value.trim() : "";
      if (!naam) {
        if (naamInput) naamInput.focus();
        return;
      }
      try {
        await window.bureausDB.add({ naam: naam });
      } catch (err) {
        console.error("Bureau toevoegen mislukt:", err);
        return;
      }
      closeAddModal();
      currentPage = 0;
      render();
    });
  }

  function initialRender() {
    var cached = getBureausCached();
    if (cached.length > 0) {
      render();
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:24px; color:#9ca3af;">Bureau\'s laden…</td></tr>';
    }
  }

  window.addEventListener("besa:bureaus-updated", render);
  initialRender();
})();
