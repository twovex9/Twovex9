(function () {
  var CF_STORAGE_KEY = "comp_feestdagen_config_rows";

  var tbody = document.getElementById("cf-tbody");
  var searchInput = document.getElementById("cf-search");
  var rangeEl = document.getElementById("cf-pager-range");
  var pageEl = document.getElementById("cf-pager-page");
  var rowsSelect = document.getElementById("cf-rows-per-page");
  var table = document.getElementById("cf-table");
  var addBtn = document.getElementById("cf-add-btn");
  var addModal = document.getElementById("cf-add-modal");
  var addCloseBtn = document.getElementById("cf-add-close-btn");
  var addCancelBtn = document.getElementById("cf-add-cancel-btn");
  var addForm = document.getElementById("cf-add-form");
  var addNaam = document.getElementById("cf-add-naam");
  var addDatum = document.getElementById("cf-add-datum");
  var addDatumNative = document.getElementById("cf-add-datum-native");
  var addTarief = document.getElementById("cf-add-tarief");
  var cfTitle = document.getElementById("cf-config-title");
  var cfSub = document.getElementById("cf-config-sub");
  var cfSubmit = document.getElementById("cf-config-submit");

  var delModal = document.getElementById("cf-delete-modal");
  var delSlider = document.getElementById("cf-delete-slider");
  var delConfirmBtn = document.getElementById("cf-delete-confirm-btn");
  var delCancelBtn = document.getElementById("cf-delete-cancel-btn");
  var delCloseBtn = document.getElementById("cf-delete-close-btn");
  var delPreview = document.getElementById("cf-delete-preview");
  var deleteTargetId = null;

  var modalMode = "add";
  var editingId = null;

  var TXT_ADD_TITLE = "Nieuwe configuratie toevoegen";
  var TXT_EDIT_TITLE = "Configuratie bewerken";
  var TXT_MODAL_SUB = "Een nieuw vakantie of diensttype configuratie aanmaken";
  var TXT_SUBMIT_ADD = "Toevoegen";
  var TXT_SUBMIT_EDIT = "Opslaan";

  if (!tbody || !table) return;

  var MONTHS_EN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  function fmtDatumScherm(ts) {
    var d = new Date(ts);
    return MONTHS_EN[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function fmtTarief(x) {
    var v = Math.round(Number(x) * 10) / 10;
    return String(v).replace(/\.0$/, "") + "x";
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDdMmYyyyFromTs(ts) {
    var d = new Date(ts);
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function formatTariefInputNl(t) {
    var n = Math.round(Number(t) * 10) / 10;
    var s = String(n);
    if (s.indexOf(".") >= 0) s = s.replace(".", ",");
    return s;
  }

  function setNativeDateFromTs(ts) {
    if (!addDatumNative || !isFinite(ts)) return;
    var d = new Date(ts);
    addDatumNative.value =
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseDdMmYyyy(str) {
    if (!str || !String(str).trim()) return NaN;
    var p = String(str).trim().replace(/\./g, "/").split("/");
    if (p.length !== 3) return NaN;
    var day = parseInt(p[0], 10);
    var month = parseInt(p[1], 10);
    var year = parseInt(p[2], 10);
    if (!year || !month || !day) return NaN;
    if (year < 100) year += 2000;
    var dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return NaN;
    return dt.getTime();
  }

  function defaultRows() {
    return [
      { id: "cf_0", naam: "1 april", datumTs: new Date(2026, 0, 1).getTime(), tarief: 1.6 },
      { id: "cf_1", naam: "Koningsdag", datumTs: new Date(2026, 3, 27).getTime(), tarief: 1.5 },
      { id: "cf_2", naam: "Bevrijdingsdag", datumTs: new Date(2026, 4, 5).getTime(), tarief: 1.5 },
      { id: "cf_3", naam: "Hemelvaart", datumTs: new Date(2026, 4, 14).getTime(), tarief: 1.6 },
      { id: "cf_4", naam: "Pinksteren", datumTs: new Date(2026, 4, 24).getTime(), tarief: 1.6 },
      { id: "cf_5", naam: "Eerste kerstdag", datumTs: new Date(2026, 11, 25).getTime(), tarief: 2 },
      { id: "cf_6", naam: "Tweede kerstdag", datumTs: new Date(2026, 11, 26).getTime(), tarief: 2 },
      { id: "cf_7", naam: "Nieuwjaar", datumTs: new Date(2027, 0, 1).getTime(), tarief: 2 },
      { id: "cf_8", naam: "Goede vrijdag", datumTs: new Date(2026, 3, 3).getTime(), tarief: 1.5 },
      { id: "cf_9", naam: "Pasen", datumTs: new Date(2026, 3, 5).getTime(), tarief: 1.6 },
      { id: "cf_10", naam: "Tweede paasdag", datumTs: new Date(2026, 3, 6).getTime(), tarief: 1.6 },
      { id: "cf_11", naam: "Prinsjesdag", datumTs: new Date(2026, 8, 15).getTime(), tarief: 1 }
    ];
  }

  function loadRows() {
    try {
      var raw = localStorage.getItem(CF_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("comp_feestdagen_config_rows:", e);
    }
    return defaultRows();
  }

  function saveRows() {
    try {
      localStorage.setItem(CF_STORAGE_KEY, JSON.stringify(allRows));
    } catch (e) {
      console.warn("saveRows feestdagen:", e);
    }
    if (window.compFeestdagenDB && typeof window.compFeestdagenDB.pushAll === "function") {
      try { window.compFeestdagenDB.pushAll(allRows); } catch (e) { /* */ }
    }
  }

  var allRows = loadRows();

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "15", 10) || 15;
  }

  function getVal(row, key) {
    if (key === "naam") return row.naam || "";
    if (key === "datum") return row.datumTs;
    if (key === "tarief") return row.tarief;
    return "";
  }

  function getFiltered() {
    var items = allRows.slice();
    var q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        return (
          (r.naam || "").toLowerCase().includes(q) ||
          fmtDatumScherm(r.datumTs).toLowerCase().includes(q) ||
          fmtTarief(r.tarief).toLowerCase().includes(q)
        );
      });
    }

    if (sortKey) {
      var sk = sortKey;
      var numCol = sk === "datum" || sk === "tarief";
      items.sort(function (a, b) {
        var av = getVal(a, sk);
        var bv = getVal(b, sk);
        if (numCol) {
          av = Number(av);
          bv = Number(bv);
        } else {
          av = String(av).toLowerCase();
          bv = String(bv).toLowerCase();
        }
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#cf-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#cf-columns-panel .column-toggle").forEach(function (btn) {
      var colId = btn.dataset.col;
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  function syncSortHeaders() {
    document.querySelectorAll("#cf-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc");
      if (sortKey && th.dataset.col === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  function render() {
    var items = getFiltered();
    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var page = items.slice(start, start + pageSize);

    tbody.innerHTML = "";
    if (!page.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 4;
      td0.textContent = "Geen resultaten";
      td0.style.textAlign = "center";
      td0.style.padding = "24px";
      td0.style.color = "var(--text-muted)";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    } else {
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.dataset.cfId = r.id;

        var tdN = document.createElement("td");
        tdN.dataset.col = "naam";
        var naamEl = document.createElement("span");
        naamEl.className = "comp-feestdagen-naam";
        naamEl.textContent = r.naam;
        tdN.appendChild(naamEl);
        tr.appendChild(tdN);

        var tdD = document.createElement("td");
        tdD.dataset.col = "datum";
        tdD.textContent = fmtDatumScherm(r.datumTs);
        tr.appendChild(tdD);

        var tdT = document.createElement("td");
        tdT.dataset.col = "tarief";
        tdT.textContent = fmtTarief(r.tarief);
        tr.appendChild(tdT);

        var tdAct = document.createElement("td");
        tdAct.dataset.col = "acties";
        tdAct.className = "cf-feest-td-acties";
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "cf-feest-delete-btn";
        delBtn.setAttribute("aria-label", "Vakantieconfiguratie verwijderen");
        delBtn.setAttribute("data-cf-id", r.id || "");
        delBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
        tdAct.appendChild(delBtn);
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();
    syncSortHeaders();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 of 0 total.";
      } else {
        rangeEl.textContent = page.length + " of " + total + " total.";
      }
    }
    if (pageEl) pageEl.textContent = "Page " + (currentPage + 1) + " of " + totalPages;

    var first = document.getElementById("cf-pager-first");
    var prev = document.getElementById("cf-pager-prev");
    var next = document.getElementById("cf-pager-next");
    var last = document.getElementById("cf-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;
  }

  function resetAddForm() {
    if (addForm) addForm.reset();
    if (addDatumNative) addDatumNative.value = "";
  }

  function applyModalTexts() {
    if (cfTitle) cfTitle.textContent = modalMode === "edit" ? TXT_EDIT_TITLE : TXT_ADD_TITLE;
    if (cfSub) cfSub.textContent = TXT_MODAL_SUB;
    if (cfSubmit) cfSubmit.textContent = modalMode === "edit" ? TXT_SUBMIT_EDIT : TXT_SUBMIT_ADD;
  }

  function openAddModal() {
    if (!addModal) return;
    modalMode = "add";
    editingId = null;
    applyModalTexts();
    resetAddForm();
    addModal.style.display = "flex";
    addModal.setAttribute("aria-hidden", "false");
    if (addNaam) addNaam.focus();
  }

  function openEditModal(row) {
    if (!addModal || !row) return;
    modalMode = "edit";
    editingId = row.id;
    applyModalTexts();
    if (addNaam) addNaam.value = row.naam || "";
    if (addDatum) addDatum.value = formatDdMmYyyyFromTs(row.datumTs);
    setNativeDateFromTs(row.datumTs);
    if (addTarief) addTarief.value = formatTariefInputNl(row.tarief);
    addModal.style.display = "flex";
    addModal.setAttribute("aria-hidden", "false");
    if (addNaam) {
      addNaam.focus();
      try {
        addNaam.select();
      } catch (err) {
        /* ignore */
      }
    }
  }

  function closeAddModal() {
    if (!addModal) return;
    addModal.style.display = "none";
    addModal.setAttribute("aria-hidden", "true");
    modalMode = "add";
    editingId = null;
    applyModalTexts();
    resetAddForm();
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("cf-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var filtered = getFiltered();
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

  if (addBtn) addBtn.addEventListener("click", openAddModal);
  if (addCloseBtn) addCloseBtn.addEventListener("click", closeAddModal);
  if (addCancelBtn) addCancelBtn.addEventListener("click", closeAddModal);
  if (addModal) {
    addModal.addEventListener("click", function (e) {
      if (e.target === addModal) closeAddModal();
    });
  }

  function deleteRowById(id) {
    if (!id) return;
    var next = allRows.filter(function (r) {
      return r.id !== id;
    });
    if (next.length === allRows.length) return;
    allRows = next;
    saveRows();
    render();
  }

  function syncCfDelSlider() {
    if (!delSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetCfDelSlider() {
    if (delSlider) {
      delSlider.value = "0";
      syncCfDelSlider();
    }
  }

  function openCfDeleteModal(id, previewLabel) {
    deleteTargetId = id;
    if (delPreview) delPreview.textContent = previewLabel || "";
    resetCfDelSlider();
    if (delModal) {
      delModal.removeAttribute("hidden");
      delModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeCfDeleteModal() {
    if (delModal) {
      delModal.setAttribute("hidden", "");
      delModal.setAttribute("aria-hidden", "true");
    }
    deleteTargetId = null;
    resetCfDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  function confirmCfDelete() {
    if (!deleteTargetId || (delConfirmBtn && delConfirmBtn.disabled)) return;
    deleteRowById(deleteTargetId);
    closeCfDeleteModal();
  }

  if (delSlider) {
    delSlider.addEventListener("input", syncCfDelSlider);
    delSlider.addEventListener("change", syncCfDelSlider);
  }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmCfDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeCfDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeCfDeleteModal);
  if (delModal) {
    delModal.addEventListener("click", function (e) {
      if (e.target === delModal) closeCfDeleteModal();
    });
  }
  syncCfDelSlider();

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && delModal && !delModal.hasAttribute("hidden")) {
      closeCfDeleteModal();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && addModal && addModal.style.display === "flex") closeAddModal();
  });

  if (addDatumNative && addDatum) {
    addDatumNative.addEventListener("change", function () {
      if (!addDatumNative.value) return;
      var p = addDatumNative.value.split("-");
      if (p.length !== 3) return;
      var ts = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)).getTime();
      addDatum.value = formatDdMmYyyyFromTs(ts);
    });
  }

  if (addForm) {
    addForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var naam = addNaam ? addNaam.value.trim() : "";
      var datumStr = addDatum ? addDatum.value.trim() : "";
      var tariefStr = addTarief ? addTarief.value.trim().replace(",", ".") : "";
      var datumTs = parseDdMmYyyy(datumStr);
      var tarief = parseFloat(tariefStr);

      if (!naam) {
        if (addNaam) addNaam.focus();
        return;
      }
      if (!isFinite(datumTs)) {
        if (addDatum) addDatum.focus();
        return;
      }
      if (!isFinite(tarief) || tarief <= 0) {
        if (addTarief) addTarief.focus();
        return;
      }

      if (modalMode === "edit" && editingId) {
        var idx = -1;
        var ei;
        for (ei = 0; ei < allRows.length; ei++) {
          if (allRows[ei].id === editingId) {
            idx = ei;
            break;
          }
        }
        if (idx >= 0) {
          allRows[idx] = {
            id: editingId,
            naam: naam,
            datumTs: datumTs,
            tarief: tarief
          };
          saveRows();
        }
      } else {
        allRows.push({
          id: "cf_n_" + Date.now(),
          naam: naam,
          datumTs: datumTs,
          tarief: tarief
        });
        saveRows();
        currentPage = 0;
      }
      closeAddModal();
      render();
    });
  }

  var columnsBtn = document.getElementById("cf-columns-menu-btn");
  var columnsPanel = document.getElementById("cf-columns-panel");

  document.querySelectorAll("#cf-columns-panel .column-toggle").forEach(function (btn) {
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
    document.querySelectorAll("#cf-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    document.querySelectorAll("#cf-table thead th.th-sort").forEach(function (th) { th.classList.remove("th-sort-open"); });
  });

  document.querySelectorAll("#cf-table .th-sort-trigger").forEach(function (trigger) {
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var th = trigger.closest("th");
      var menu = th ? th.querySelector(".th-sort-menu") : null;
      if (!menu) return;
      var wasHidden = menu.hasAttribute("hidden");
      document.querySelectorAll("#cf-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll("#cf-table thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
      if (wasHidden) {
        menu.removeAttribute("hidden");
        if (th) th.classList.add("th-sort-open");
      }
    });
  });

  document.querySelectorAll("#cf-table .th-sort-opt").forEach(function (opt) {
    opt.addEventListener("click", function (e) {
      e.stopPropagation();
      var action = opt.dataset.action;
      var th = opt.closest("th");
      var colId = th ? th.dataset.col : null;
      if (!colId) return;

      if (action === "hide") {
        var toggle = document.querySelector('#cf-columns-panel .column-toggle[data-col="' + colId + '"]');
        if (toggle) {
          toggle.classList.remove("is-checked");
          toggle.setAttribute("aria-checked", "false");
        }
        setColumnVisible(colId, false);
      } else {
        sortKey = colId;
        sortDir = action;
        currentPage = 0;
        render();
      }
      document.querySelectorAll("#cf-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll("#cf-table thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
    });
  });

  tbody.addEventListener("click", function (e) {
    var delBtn = e.target.closest(".cf-feest-delete-btn");
    if (delBtn && tbody.contains(delBtn)) {
      e.preventDefault();
      e.stopPropagation();
      var id = delBtn.getAttribute("data-cf-id");
      if (!id) return;
      var row = null;
      var ri;
      for (ri = 0; ri < allRows.length; ri++) {
        if (allRows[ri].id === id) {
          row = allRows[ri];
          break;
        }
      }
      var label = row ? row.naam || "" : "";
      openCfDeleteModal(id, label);
      return;
    }
    var tr = e.target.closest("tr");
    if (!tr || !tbody.contains(tr) || !tr.dataset.cfId) return;
    var rid = tr.dataset.cfId;
    var row = null;
    var ri;
    for (ri = 0; ri < allRows.length; ri++) {
      if (allRows[ri].id === rid) {
        row = allRows[ri];
        break;
      }
    }
    if (row) openEditModal(row);
  });

  render();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de cache
  // ververst.
  window.addEventListener("besa:comp-feestdagen-updated", function () {
    try {
      allRows = loadRows();
      render();
    } catch (e) { /* */ }
  });
})();
