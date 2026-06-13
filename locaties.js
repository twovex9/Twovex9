/* Data: locaties-data.js (Supabase-backed via window.locatiesDB) */

(function () {
  var tbody = document.getElementById("loc-tbody");
  var table = document.getElementById("loc-table");
  var searchInput = document.getElementById("loc-search");
  var archivedToggle = document.getElementById("loc-archived-toggle");
  var rangeEl = document.getElementById("loc-pager-range");
  var pageEl = document.getElementById("loc-pager-page");
  var rowsSelect = document.getElementById("loc-rows-per-page");
  var checkAll = document.getElementById("loc-check-all");

  if (!tbody || !table) return;
  if (!window.locatiesDB) {
    console.error("locatiesDB ontbreekt — laad supabase-client.js + locaties-data.js vóór locaties.js.");
    return;
  }

  function getLocatiesCached() {
    return window.locatiesDB.getAllSync();
  }

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "50", 10);
  }

  function sortFieldFromThCol(col) {
    if (col === "laatst-gewijzigd") return "laatstGewijzigd";
    if (col === "aanmaakdatum") return "aanmaakdatum";
    return col;
  }

  function getFilteredLocaties() {
    var items = getLocatiesCached();
    var showArchived = archivedToggle ? archivedToggle.checked : false;

    items = items.filter(function (o) {
      if (showArchived) return o.archived === true;
      return !o.archived;
    });

    var query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (query) {
      items = items.filter(function (o) {
        return (
          (o.naam || "").toLowerCase().includes(query) ||
          (o.adres || "").toLowerCase().includes(query)
        );
      });
    }

    if (sortKey) {
      var sk = sortFieldFromThCol(sortKey);
      items = items.slice();
      items.sort(function (a, b) {
        var av = a[sk] || "";
        var bv = b[sk] || "";
        if (sk === "aanmaakdatum" || sk === "laatstGewijzigd") {
          av = new Date(av).getTime() || 0;
          bv = new Date(bv).getTime() || 0;
        } else {
          if (typeof av === "string") av = av.toLowerCase();
          if (typeof bv === "string") bv = bv.toLowerCase();
        }
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#loc-table [data-col="' + colId + '"]').forEach(function (cell) {
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

  function render() {
    var items = getFilteredLocaties();
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
      tdE.colSpan = 6;
      tdE.textContent = "Geen locaties gevonden";
      tdE.style.textAlign = "center";
      tdE.style.padding = "24px";
      tdE.style.color = "#9ca3af";
      trE.appendChild(tdE);
      tbody.appendChild(trE);
    } else {
      page.forEach(function (o) {
        var tr = document.createElement("tr");
        tr.dataset.locId = o.id;
        tr.dataset.locNaam = o.naam;
        tr.className = "loc-table-row";
        tr.style.cursor = "pointer";

        var tdCheck = document.createElement("td");
        tdCheck.className = "loc-td-check";
        tdCheck.innerHTML = '<input type="checkbox" class="loc-row-check" aria-label="Selecteer rij" />';
        tr.appendChild(tdCheck);

        var tdNaam = document.createElement("td");
        tdNaam.dataset.col = "naam";
        tdNaam.textContent = o.naam || "";
        if (o.nietInPlanning) {
          var nipBadge = document.createElement("span");
          nipBadge.textContent = "Niet in planning";
          nipBadge.title = "Kantoor-/overheadlocatie — telt niet mee voor planning-zichtbaarheid";
          nipBadge.style.cssText = "margin-left:8px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(234,179,8,.16);color:var(--text);border:1px solid rgba(234,179,8,.45);white-space:nowrap;vertical-align:middle";
          tdNaam.appendChild(nipBadge);
        }
        tr.appendChild(tdNaam);

        var tdAdres = document.createElement("td");
        tdAdres.dataset.col = "adres";
        tdAdres.textContent = o.adres || "";
        tr.appendChild(tdAdres);

        var tdAanmaak = document.createElement("td");
        tdAanmaak.dataset.col = "aanmaakdatum";
        tdAanmaak.textContent = locFmtDate(o.aanmaakdatum);
        tr.appendChild(tdAanmaak);

        var tdGewijzigd = document.createElement("td");
        tdGewijzigd.dataset.col = "laatst-gewijzigd";
        tdGewijzigd.textContent = locFmtDate(o.laatstGewijzigd);
        tr.appendChild(tdGewijzigd);

        var tdAct = document.createElement("td");
        tdAct.className = "loc-td-acties";
        var showArcL = archivedToggle ? archivedToggle.checked : false;
        var trashSvgL = '<svg class="employee-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        if (showArcL) {
          var wrapL = document.createElement("div");
          wrapL.className = "hr-row-actions";
          var resBtnL = document.createElement("button");
          resBtnL.type = "button";
          resBtnL.className = "btn-outline hr-restore-btn";
          resBtnL.setAttribute("data-loc-id", o.id);
          resBtnL.textContent = "Herstel";
          var pBtnL = document.createElement("button");
          pBtnL.type = "button";
          pBtnL.className = "employee-delete-btn loc-purge-btn";
          pBtnL.setAttribute("aria-label", "Definitief verwijderen");
          pBtnL.innerHTML = trashSvgL;
          wrapL.appendChild(resBtnL);
          wrapL.appendChild(pBtnL);
          tdAct.appendChild(wrapL);
        } else {
          var delBtnL = document.createElement("button");
          delBtnL.type = "button";
          delBtnL.className = "employee-delete-btn loc-archive-btn";
          delBtnL.setAttribute("aria-label", "Locatie archiveren");
          delBtnL.innerHTML = trashSvgL;
          tdAct.appendChild(delBtnL);
        }
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        var startIdx = currentPage * pageSize;
        var endIdx = Math.min(startIdx + pageSize, total);
        rangeEl.textContent = (startIdx + 1) + "–" + endIdx + " van " + total;
      }
    }
    if (pageEl) pageEl.textContent = "Pagina " + (currentPage + 1) + " van " + totalPages;

    var first = document.getElementById("loc-pager-first");
    var prev = document.getElementById("loc-pager-prev");
    var next = document.getElementById("loc-pager-next");
    var last = document.getElementById("loc-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;

    if (checkAll) checkAll.checked = false;
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("loc-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var filtered = getFilteredLocaties();
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
      tbody.querySelectorAll(".loc-row-check").forEach(function (cb) { cb.checked = checkAll.checked; });
    });
  }

  var addBtn = document.getElementById("loc-add-btn");
  var addModal = document.getElementById("loc-add-modal");
  var addCloseBtn = document.getElementById("loc-add-close-btn");
  var addCancelBtn = document.getElementById("loc-add-cancel-btn");
  var addForm = document.getElementById("loc-add-form");
  var aantalKamersEl = document.getElementById("loc-add-aantal-kamers");
  var kamersListEl = document.getElementById("loc-add-kamers-list");
  var addErrEl = document.getElementById("loc-add-err");

  function showLocAddErr(msg) {
    if (!addErrEl) return;
    addErrEl.textContent = msg || "";
    addErrEl.hidden = !msg;
  }

  function fieldVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Standaard-adres per kamer = het zojuist ingevulde locatie-adres (overschrijfbaar).
  function defaultKamerAdres() {
    var o = {
      postcode: fieldVal("loc-add-postcode"),
      huisnummer: fieldVal("loc-add-huisnummer"),
      toevoeging: fieldVal("loc-add-toevoeging"),
      straat: fieldVal("loc-add-straat"),
      plaats: fieldVal("loc-add-plaats"),
    };
    var a = (typeof locComposeAdres === "function") ? locComposeAdres(o) : "";
    return (a && a !== "N/A") ? a : "";
  }

  function readKamerRows() {
    if (!kamersListEl) return [];
    return Array.prototype.map.call(kamersListEl.querySelectorAll(".loc-kamer-row"), function (row) {
      var n = row.querySelector(".loc-kamer-naam");
      var a = row.querySelector(".loc-kamer-adres");
      return {
        naam: n ? n.value : "",
        adres: a ? a.value : "",
        naamEdited: row.dataset.naamEdited === "1",
        adresEdited: row.dataset.adresEdited === "1",
      };
    });
  }

  // (Her)teken de per-kamer rijen. Bewaart wat de gebruiker al typte.
  function renderKamerRows() {
    if (!kamersListEl || !aantalKamersEl) return;
    var n = parseInt(aantalKamersEl.value, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 200) { n = 200; aantalKamersEl.value = "200"; }
    var prev = readKamerRows();
    var def = defaultKamerAdres();
    var html = "";
    for (var i = 0; i < n; i++) {
      var p = prev[i];
      var naam = p ? p.naam : "Kamer " + (i + 1);
      var adres = p ? p.adres : def;
      html += '<div class="loc-kamer-row" data-naam-edited="' + (p && p.naamEdited ? "1" : "") +
        '" data-adres-edited="' + (p && p.adresEdited ? "1" : "") + '">' +
        '<span class="loc-kamer-num">' + (i + 1) + "</span>" +
        '<input type="text" class="comp-modal-input loc-kamer-naam" placeholder="Kamernaam" value="' + escAttr(naam) + '">' +
        '<input type="text" class="comp-modal-input loc-kamer-adres" placeholder="Adres (optioneel)" autocomplete="off" value="' + escAttr(adres) + '">' +
        "</div>";
    }
    kamersListEl.innerHTML = html;
  }

  // Adresvelden gewijzigd → ververs alleen kamers waar de gebruiker het adres
  // nog niet zelf heeft aangepast.
  function refreshDefaultKamerAdres() {
    if (!kamersListEl) return;
    var def = defaultKamerAdres();
    kamersListEl.querySelectorAll(".loc-kamer-row").forEach(function (row) {
      if (row.dataset.adresEdited === "1") return;
      var a = row.querySelector(".loc-kamer-adres");
      if (a) a.value = def;
    });
  }

  if (aantalKamersEl) aantalKamersEl.addEventListener("input", renderKamerRows);
  if (kamersListEl) {
    kamersListEl.addEventListener("input", function (e) {
      var row = e.target.closest(".loc-kamer-row");
      if (!row) return;
      if (e.target.classList.contains("loc-kamer-naam")) row.dataset.naamEdited = "1";
      else if (e.target.classList.contains("loc-kamer-adres")) row.dataset.adresEdited = "1";
    });
  }
  ["loc-add-postcode", "loc-add-huisnummer", "loc-add-toevoeging", "loc-add-straat", "loc-add-plaats"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", refreshDefaultKamerAdres);
  });

  function resetLocAddForm() {
    ["loc-add-naam", "loc-add-postcode", "loc-add-huisnummer", "loc-add-toevoeging", "loc-add-straat", "loc-add-plaats"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    var nip = document.getElementById("loc-add-niet-in-planning");
    if (nip) nip.checked = false;
    if (aantalKamersEl) aantalKamersEl.value = "1";
    if (kamersListEl) kamersListEl.innerHTML = "";
    renderKamerRows();
    showLocAddErr("");
  }

  function openAddModal() {
    if (!addModal) return;
    resetLocAddForm();
    addModal.style.display = "";
    addModal.setAttribute("aria-hidden", "false");
  }

  function closeAddModal() {
    if (!addModal) return;
    addModal.style.display = "none";
    addModal.setAttribute("aria-hidden", "true");
    resetLocAddForm();
  }

  if (addBtn) addBtn.addEventListener("click", openAddModal);
  if (addCloseBtn) addCloseBtn.addEventListener("click", closeAddModal);
  if (addCancelBtn) addCancelBtn.addEventListener("click", closeAddModal);
  if (addModal) addModal.addEventListener("click", function (e) { if (e.target === addModal) closeAddModal(); });

  var delModal = document.getElementById("loc-delete-modal");
  var delSlider = document.getElementById("loc-delete-slider");
  var delConfirmBtn = document.getElementById("loc-delete-confirm-btn");
  var delCancelBtn = document.getElementById("loc-delete-cancel-btn");
  var delCloseBtn = document.getElementById("loc-delete-close-btn");
  var delPreview = document.getElementById("loc-delete-preview");
  var deleteTargetId = null;

  var lpModal = document.getElementById("loc-purge-modal");
  var lpSlider = document.getElementById("loc-purge-slider");
  var lpConfirmBtn = document.getElementById("loc-purge-confirm-btn");
  var lpCancelBtn = document.getElementById("loc-purge-cancel-btn");
  var lpCloseBtn = document.getElementById("loc-purge-close-btn");
  var lpPreview = document.getElementById("loc-purge-preview");
  var locPurgeTargetId = null;

  function syncLocPurgeSlider() {
    if (!lpSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(lpSlider.value, 10) || 0));
    lpSlider.value = String(v);
    lpSlider.style.setProperty("--employee-slider-pct", v + "%");
    lpSlider.setAttribute("aria-valuenow", String(v));
    if (lpConfirmBtn) lpConfirmBtn.disabled = v < 100;
  }

  function resetLocPurgeSlider() {
    if (lpSlider) {
      lpSlider.value = "0";
      syncLocPurgeSlider();
    }
  }

  function openLocPurgeModal(id, naam) {
    locPurgeTargetId = id;
    if (lpPreview) lpPreview.textContent = naam || "";
    resetLocPurgeSlider();
    if (lpModal) {
      lpModal.removeAttribute("hidden");
      lpModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeLocPurgeModal() {
    if (lpModal) {
      lpModal.setAttribute("hidden", "");
      lpModal.setAttribute("aria-hidden", "true");
    }
    locPurgeTargetId = null;
    resetLocPurgeSlider();
    if (lpPreview) lpPreview.textContent = "";
  }

  async function confirmLocPurge() {
    if (!locPurgeTargetId || (lpConfirmBtn && lpConfirmBtn.disabled)) return;
    var idToPurge = locPurgeTargetId;
    closeLocPurgeModal();
    try {
      await window.locatiesDB.delete(idToPurge);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("deleted", "Locatie", "Definitief verwijderd.");
      }
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", "Verwijderen mislukt", err && err.message ? err.message : "Onbekende fout.");
      }
    }
    render();
  }

  function syncLocDelSlider() {
    if (!delSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetLocDelSlider() {
    if (delSlider) {
      delSlider.value = "0";
      syncLocDelSlider();
    }
  }

  function openLocDeleteModal(id, naam) {
    deleteTargetId = id;
    if (delPreview) delPreview.textContent = naam || "";
    resetLocDelSlider();
    if (delModal) {
      delModal.removeAttribute("hidden");
      delModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeLocDeleteModal() {
    if (delModal) {
      delModal.setAttribute("hidden", "");
      delModal.setAttribute("aria-hidden", "true");
    }
    deleteTargetId = null;
    resetLocDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  async function confirmLocArchive() {
    if (!deleteTargetId || (delConfirmBtn && delConfirmBtn.disabled)) return;
    var idToArchive = deleteTargetId;
    closeLocDeleteModal();
    try {
      await window.locatiesDB.archive(idToArchive);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("archived", "Locatie");
      }
    } catch (err) {
      console.error("Archiveren mislukt:", err);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", "Archiveren mislukt", err && err.message ? err.message : "Onbekende fout.");
      }
    }
    render();
  }

  if (delSlider) {
    delSlider.addEventListener("input", syncLocDelSlider);
    delSlider.addEventListener("change", syncLocDelSlider);
  }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmLocArchive);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeLocDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeLocDeleteModal);
  if (delModal) {
    delModal.addEventListener("click", function (e) {
      if (e.target === delModal) closeLocDeleteModal();
    });
  }

  if (lpSlider) {
    lpSlider.addEventListener("input", syncLocPurgeSlider);
    lpSlider.addEventListener("change", syncLocPurgeSlider);
  }
  if (lpConfirmBtn) lpConfirmBtn.addEventListener("click", confirmLocPurge);
  if (lpCancelBtn) lpCancelBtn.addEventListener("click", closeLocPurgeModal);
  if (lpCloseBtn) lpCloseBtn.addEventListener("click", closeLocPurgeModal);
  if (lpModal) {
    lpModal.addEventListener("click", function (e) {
      if (e.target === lpModal) closeLocPurgeModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // Module 07 Bug #23 fix: generic Escape sluit topmost open modal
    const openModals = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"));
    if (openModals.length === 0) return;
    const topmost = openModals[openModals.length - 1];
    if (lpModal && topmost.id === lpModal.id) {
      closeLocPurgeModal();
    } else {
      topmost.setAttribute("hidden", "");
      topmost.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
    }
    e.preventDefault();
  });

  tbody.addEventListener("click", async function (e) {
    var resL = e.target.closest(".hr-restore-btn");
    if (resL && resL.getAttribute("data-loc-id")) {
      e.preventDefault();
      e.stopPropagation();
      var rida = resL.getAttribute("data-loc-id");
      try {
        await window.locatiesDB.restore(rida);
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("restored", "Locatie");
        }
      } catch (err) {
        console.error("Herstellen mislukt:", err);
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Herstellen mislukt", err && err.message ? err.message : "Onbekende fout.");
        }
      }
      render();
      return;
    }
    var purL = e.target.closest(".loc-purge-btn");
    if (purL) {
      e.preventDefault();
      e.stopPropagation();
      var trLp = purL.closest("tr");
      if (trLp && trLp.dataset.locId) openLocPurgeModal(trLp.dataset.locId, trLp.dataset.locNaam || "");
      return;
    }
    var delBtnEl = e.target.closest(".loc-archive-btn");
    if (delBtnEl) {
      e.preventDefault();
      e.stopPropagation();
      var tr = delBtnEl.closest("tr");
      if (tr && tr.dataset.locId) openLocDeleteModal(tr.dataset.locId, tr.dataset.locNaam || "");
      return;
    }
    if (e.target.closest(".loc-td-check") || e.target.closest(".loc-row-check") || e.target.closest("input[type=\"checkbox\"]")) return;
    if (e.target.closest(".loc-td-acties")) return;
    var trNav = e.target.closest("tr.loc-table-row");
    if (!trNav || !trNav.dataset.locId) return;
    window.location.href = "locatie-detail.html?id=" + encodeURIComponent(trNav.dataset.locId);
  });

  if (addForm) {
    addForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      showLocAddErr("");
      var naamInput = document.getElementById("loc-add-naam");
      var pcEl = document.getElementById("loc-add-postcode");
      var hnEl = document.getElementById("loc-add-huisnummer");
      var tvEl = document.getElementById("loc-add-toevoeging");
      var stEl = document.getElementById("loc-add-straat");
      var plEl = document.getElementById("loc-add-plaats");
      var naam = naamInput ? naamInput.value.trim() : "";
      if (!naam) {
        showLocAddErr("Naam is verplicht.");
        if (naamInput) naamInput.focus();
        return;
      }

      // Kamers valideren (verplicht ≥1, unieke namen) vóór we de locatie aanmaken.
      var rows = readKamerRows();
      var kamers = [];
      var seen = {};
      for (var i = 0; i < rows.length; i++) {
        var rn = (rows[i].naam || "").trim();
        if (!rn) continue;
        var key = rn.toLowerCase();
        if (seen[key]) {
          showLocAddErr('Kamernaam “' + rn + '” komt dubbel voor. Geef elke kamer een unieke naam.');
          return;
        }
        seen[key] = true;
        kamers.push({ nummer: rn, adres: (rows[i].adres || "").trim() });
      }
      if (kamers.length < 1) {
        showLocAddErr("Geef minstens één kamer met een naam op.");
        if (aantalKamersEl) aantalKamersEl.focus();
        return;
      }

      var nipEl = document.getElementById("loc-add-niet-in-planning");
      var input = {
        naam: naam,
        kleur: "#64748b",
        postcode: pcEl ? pcEl.value.trim() : "",
        huisnummer: hnEl ? hnEl.value.trim() : "",
        toevoeging: tvEl ? tvEl.value.trim() : "",
        straat: stEl ? stEl.value.trim() : "",
        plaats: plEl ? plEl.value.trim() : "",
        nietInPlanning: nipEl ? nipEl.checked : false,
      };

      var newItem;
      try {
        newItem = await window.locatiesDB.add(input);
      } catch (err) {
        console.error("Locatie toevoegen mislukt:", err);
        showLocAddErr("Locatie opslaan mislukt: " + (err && err.message ? err.message : "Onbekende fout."));
        return;
      }

      // Kamers van de nieuwe locatie aanmaken → verschijnen direct bij Bezettingen.
      var locNaam = (newItem && newItem.naam) || naam;
      try {
        if (!window.bezettingDB || typeof window.bezettingDB.kamersAanmaken !== "function") {
          throw new Error("Bezetting-module niet geladen.");
        }
        await window.bezettingDB.kamersAanmaken(locNaam, kamers);
      } catch (err) {
        console.error("Kamers aanmaken mislukt:", err);
        closeAddModal();
        currentPage = 0;
        render();
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Locatie toegevoegd — kamers mislukt",
            (err && err.message ? err.message : "Onbekende fout.") + " Voeg de kamers toe via Bezettingen.");
        }
        return;
      }

      closeAddModal();
      currentPage = 0;
      render();
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("added",
          "Locatie “" + naam + "” met " + kamers.length + " kamer" + (kamers.length === 1 ? "" : "s"));
      }
    });
  }

  function initialRender() {
    var cached = getLocatiesCached();
    if (cached.length > 0) {
      render();
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#9ca3af;">Locaties laden…</td></tr>';
    }
  }

  window.addEventListener("ff:locaties-updated", render);
  initialRender();
})();
