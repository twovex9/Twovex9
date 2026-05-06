(function () {
  var STORAGE_LANG = "hr_verzuim_lang_rows";
  var STORAGE_KORT = "hr_verzuim_kort_rows";

  var tbody = document.getElementById("vz-tbody");
  var table = document.getElementById("vz-table");
  var searchInput = document.getElementById("vz-search");
  var titleEl = document.getElementById("vz-page-title");
  var tabLang = document.getElementById("vz-tab-lang");
  var tabKort = document.getElementById("vz-tab-kort");
  var rangeEl = document.getElementById("vz-pager-range");
  var pageEl = document.getElementById("vz-pager-page");
  var rowsSelect = document.getElementById("vz-rows-per-page");
  var columnsBtn = document.getElementById("vz-columns-menu-btn");
  var columnsPanel = document.getElementById("vz-columns-panel");
  var delModal = document.getElementById("vz-delete-modal");
  var delSlider = document.getElementById("vz-delete-slider");
  var delConfirmBtn = document.getElementById("vz-delete-confirm-btn");
  var delCancelBtn = document.getElementById("vz-delete-cancel-btn");
  var delCloseBtn = document.getElementById("vz-delete-close-btn");
  var delPreview = document.getElementById("vz-delete-preview");
  var deleteTargetId = null;
  var listView = document.getElementById("vz-list-view");
  var detailView = document.getElementById("vz-detail-view");
  var detailCards = document.getElementById("vz-detail-cards");
  var detailHeading = document.getElementById("vz-detail-heading");
  var detailSub = document.getElementById("vz-detail-sub");
  var detailBack = document.getElementById("vz-detail-back");
  var mainEl = document.querySelector("main.content--comp-verzuim");
  var editModal = document.getElementById("vz-edit-modal");
  var editForm = document.getElementById("vz-edit-form");
  var editCloseBtn = document.getElementById("vz-edit-close-btn");
  var editCancelBtn = document.getElementById("vz-edit-cancel-btn");
  var editId = document.getElementById("vz-edit-id");
  var editMedewerker = document.getElementById("vz-edit-medewerker");
  var editEerst = document.getElementById("vz-edit-eerst");
  var editVerwacht = document.getElementById("vz-edit-verwacht");
  var editWerkelijk = document.getElementById("vz-edit-werkelijk");
  var editBeschrijving = document.getElementById("vz-edit-beschrijving");
  var editStatus = document.getElementById("vz-edit-status");

  if (!tbody || !table) return;

  var vzType = "lang";
  var currentPage = 0;
  var selectedEmployee = null;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function fmtDateNl(iso) {
    if (!iso) return "—";
    var d = new Date(iso + (iso.length <= 10 ? "T12:00:00" : ""));
    if (isNaN(d.getTime())) return iso;
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function parseDdMmYyyyToIso(str) {
    if (!str || !String(str).trim()) return "";
    var p = String(str).trim().split(/[-./]/);
    if (p.length !== 3) return null;
    var day = parseInt(p[0], 10);
    var month = parseInt(p[1], 10);
    var year = parseInt(p[2], 10);
    if (!year || !month || !day) return null;
    if (year < 100) year += 2000;
    var dt = new Date(year, month - 1, day);
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function initialsFromName(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function avatarHue(name) {
    var s = String(name || "x");
    var h = 0;
    var i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function vzTypeLabel() {
    return vzType === "lang" ? "Lange termijn verzuim" : "Kort verzuim";
  }

  function defaultLangRows() {
    return [
      {
        id: "vz_l_1",
        medewerker: "Sophie de Vries",
        eerstZiektedag: "2025-10-14",
        verwachteTerug: "2026-04-01",
        werkelijkeTerug: "",
        beschrijving: "Langdurige ziekmelding — traject begeleiding",
        status: "Actief"
      },
      {
        id: "vz_l_2",
        medewerker: "Thomas Bakker",
        eerstZiektedag: "2025-12-02",
        verwachteTerug: "2026-06-15",
        werkelijkeTerug: "",
        beschrijving: "Re-integratie in voorbereiding",
        status: "Actief"
      },
      {
        id: "vz_l_3",
        medewerker: "Marieke Jansen",
        eerstZiektedag: "2026-01-08",
        verwachteTerug: "2026-03-20",
        werkelijkeTerug: "2026-02-28",
        beschrijving: "Hersteld na specialistisch consult",
        status: "Hersteld"
      }
    ];
  }

  function defaultKortRows() {
    return [
      {
        id: "vz_k_1",
        medewerker: "Daan Visser",
        eerstZiektedag: "2026-03-02",
        verwachteTerug: "2026-03-09",
        werkelijkeTerug: "2026-03-08",
        beschrijving: "Griep",
        status: "Hersteld"
      },
      {
        id: "vz_k_2",
        medewerker: "Emma Smit",
        eerstZiektedag: "2026-03-18",
        verwachteTerug: "2026-03-25",
        werkelijkeTerug: "",
        beschrijving: "Mag klachten",
        status: "Actief"
      }
    ];
  }

  function loadRows(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var p = JSON.parse(raw);
        if (Array.isArray(p) && p.length) return p;
      }
    } catch (e) {
      console.warn(key, e);
    }
    return fallback();
  }

  function saveRows(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {
      console.warn("saveRows", e);
    }
    if (window.verzuimDB && typeof window.verzuimDB.pushType === "function") {
      var type = key === STORAGE_LANG ? "lang" : (key === STORAGE_KORT ? "kort" : null);
      if (type) {
        try { window.verzuimDB.pushType(type, arr); } catch (e) { /* */ }
      }
    }
  }

  var rowsLang = loadRows(STORAGE_LANG, defaultLangRows);
  var rowsKort = loadRows(STORAGE_KORT, defaultKortRows);
  if (!localStorage.getItem(STORAGE_LANG)) saveRows(STORAGE_LANG, rowsLang);
  if (!localStorage.getItem(STORAGE_KORT)) saveRows(STORAGE_KORT, rowsKort);

  function getActiveRows() {
    return vzType === "lang" ? rowsLang : rowsKort;
  }

  function setActiveRows(arr) {
    if (vzType === "lang") {
      rowsLang = arr;
      saveRows(STORAGE_LANG, rowsLang);
    } else {
      rowsKort = arr;
      saveRows(STORAGE_KORT, rowsKort);
    }
  }

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "15", 10) || 15;
  }

  function getFiltered() {
    var items = getActiveRows().slice();
    var q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        return [r.medewerker, r.eerstZiektedag, r.verwachteTerug, r.werkelijkeTerug, r.beschrijving, r.status]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
    }
    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#vz-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#vz-columns-panel .column-toggle").forEach(function (btn) {
      var colId = btn.dataset.col;
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  function statusClass(s) {
    var t = (s || "").toLowerCase().trim();
    if (t === "hersteld") return "vz-status-pill vz-status-pill--hersteld";
    if (t === "goedgekeurd") return "vz-status-pill vz-status-pill--goedgekeurd";
    if (t === "afgekeurd" || t === "afgewezen") return "vz-status-pill vz-status-pill--afgekeurd";
    if (t === "in behandeling") return "vz-status-pill vz-status-pill--pending";
    return "vz-status-pill vz-status-pill--actief";
  }

  function getRowsForSelectedEmployee() {
    if (!selectedEmployee) return [];
    return getActiveRows()
      .filter(function (r) {
        return (r.medewerker || "") === selectedEmployee;
      })
      .sort(function (a, b) {
        return String(b.eerstZiektedag || "").localeCompare(String(a.eerstZiektedag || ""));
      });
  }

  function syncListDetailVisibility() {
    if (mainEl) mainEl.classList.toggle("vz-main--detail", !!selectedEmployee);
    if (listView) listView.hidden = !!selectedEmployee;
    if (detailView) detailView.hidden = !selectedEmployee;
  }

  function openEmployeeDetail(name) {
    if (!name) return;
    selectedEmployee = name;
    closeVzEditModal();
    render();
  }

  function closeEmployeeDetail() {
    selectedEmployee = null;
    closeVzEditModal();
    render();
  }

  function renderDetailView() {
    if (!detailCards || !selectedEmployee) return;
    if (detailHeading) detailHeading.textContent = selectedEmployee;
    if (detailSub) detailSub.textContent = vzTypeLabel() + " · " + getRowsForSelectedEmployee().length + " registratie(s)";
    detailCards.innerHTML = "";
    var rows = getRowsForSelectedEmployee();
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "vz-detail-empty";
      empty.textContent = "Geen registraties voor deze medewerker in dit tabblad.";
      detailCards.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var card = document.createElement("article");
      card.className = "vz-reg-card";
      card.dataset.rowId = r.id;

      var left = document.createElement("div");
      left.className = "vz-reg-card-left";
      var av = document.createElement("div");
      av.className = "vz-reg-card-avatar";
      av.style.setProperty("--vz-av-h", String(avatarHue(r.medewerker)));
      av.textContent = initialsFromName(r.medewerker);
      var dateEl = document.createElement("div");
      dateEl.className = "vz-reg-card-date";
      dateEl.textContent = fmtDateNl(r.eerstZiektedag);
      left.appendChild(av);
      left.appendChild(dateEl);

      var body = document.createElement("div");
      body.className = "vz-reg-card-body";
      var titleRow = document.createElement("div");
      titleRow.className = "vz-reg-card-title-row";
      var h3 = document.createElement("h3");
      h3.className = "vz-reg-card-title";
      h3.textContent = vzTypeLabel();
      var pill = document.createElement("span");
      pill.className = statusClass(r.status);
      pill.textContent = r.status || "Actief";
      titleRow.appendChild(h3);
      titleRow.appendChild(pill);
      var meta = document.createElement("p");
      meta.className = "vz-reg-card-meta";
      meta.textContent =
        "Verwacht: " + fmtDateNl(r.verwachteTerug) + " · Werkelijk: " + fmtDateNl(r.werkelijkeTerug);
      var desc = document.createElement("p");
      desc.className = "vz-reg-card-desc";
      desc.textContent = r.beschrijving || "—";
      body.appendChild(titleRow);
      body.appendChild(meta);
      body.appendChild(desc);

      var actions = document.createElement("div");
      actions.className = "vz-reg-card-actions";
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "cs-view-btn vz-card-edit-btn";
      editBtn.setAttribute("aria-label", "Bewerken");
      editBtn.setAttribute("data-row-id", r.id);
      editBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "cd-type-delete-btn vz-card-del-btn";
      delBtn.setAttribute("aria-label", "Verwijderen");
      delBtn.setAttribute("data-row-id", r.id);
      delBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      card.appendChild(left);
      card.appendChild(body);
      card.appendChild(actions);
      detailCards.appendChild(card);
    });
  }

  function findRowById(id) {
    var list = getActiveRows();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function openVzEditModal(row) {
    if (!editModal || !row) return;
    if (editId) editId.value = row.id || "";
    if (editMedewerker) editMedewerker.value = row.medewerker || "";
    if (editEerst) editEerst.value = row.eerstZiektedag ? fmtDateNl(row.eerstZiektedag) : "";
    if (editVerwacht) editVerwacht.value = row.verwachteTerug ? fmtDateNl(row.verwachteTerug) : "";
    if (editWerkelijk) editWerkelijk.value = row.werkelijkeTerug ? fmtDateNl(row.werkelijkeTerug) : "";
    if (editBeschrijving) editBeschrijving.value = row.beschrijving || "";
    if (editStatus) {
      var st = row.status || "Actief";
      editStatus.value = ["Actief", "In behandeling", "Goedgekeurd", "Afgekeurd", "Hersteld"].indexOf(st) >= 0 ? st : "Actief";
    }
    editModal.style.display = "flex";
    editModal.setAttribute("aria-hidden", "false");
    if (editEerst) editEerst.focus();
  }

  function closeVzEditModal() {
    if (!editModal) return;
    editModal.style.display = "none";
    editModal.setAttribute("aria-hidden", "true");
    if (editForm) editForm.reset();
  }

  function renderTable() {
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
      td0.colSpan = 7;
      td0.textContent = "Geen resultaten";
      td0.style.textAlign = "center";
      td0.style.padding = "24px";
      td0.style.color = "var(--text-muted)";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    } else {
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.dataset.rowId = r.id;

        function td(col, text) {
          var cell = document.createElement("td");
          cell.dataset.col = col;
          cell.textContent = text;
          return cell;
        }

        var tdM = document.createElement("td");
        tdM.dataset.col = "medewerker";
        var naamEl = document.createElement("span");
        naamEl.className = "vz-medewerker-naam";
        naamEl.textContent = r.medewerker || "";
        tdM.appendChild(naamEl);
        tr.appendChild(tdM);
        tr.appendChild(td("eerst", fmtDateNl(r.eerstZiektedag)));
        tr.appendChild(td("verwacht", fmtDateNl(r.verwachteTerug)));
        tr.appendChild(td("werkelijk", fmtDateNl(r.werkelijkeTerug)));

        var tdB = document.createElement("td");
        tdB.dataset.col = "beschrijving";
        tdB.textContent = r.beschrijving || "";
        tr.appendChild(tdB);

        var tdS = document.createElement("td");
        tdS.dataset.col = "status";
        var pill = document.createElement("span");
        pill.className = statusClass(r.status);
        pill.textContent = r.status || "Actief";
        tdS.appendChild(pill);
        tr.appendChild(tdS);

        var tdA = document.createElement("td");
        tdA.dataset.col = "acties";
        tdA.className = "vz-td-acties";
        var wrap = document.createElement("div");
        wrap.className = "vz-acties-row";
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "cs-view-btn vz-edit-table-btn";
        editBtn.setAttribute("aria-label", "Bewerken");
        editBtn.setAttribute("data-row-id", r.id || "");
        editBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "cd-type-delete-btn";
        delBtn.setAttribute("aria-label", "Verwijderen");
        delBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
        wrap.appendChild(editBtn);
        wrap.appendChild(delBtn);
        tdA.appendChild(wrap);
        tr.appendChild(tdA);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) {
      rangeEl.textContent = total === 0 ? "0 of 0 total." : page.length + " of " + total + " total.";
    }
    if (pageEl) pageEl.textContent = "Page " + (currentPage + 1) + " of " + totalPages;

    var first = document.getElementById("vz-pager-first");
    var prev = document.getElementById("vz-pager-prev");
    var next = document.getElementById("vz-pager-next");
    var last = document.getElementById("vz-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;
  }

  function render() {
    syncListDetailVisibility();
    if (selectedEmployee) {
      renderDetailView();
    } else {
      renderTable();
    }
  }

  function closeVzDeleteModal() {
    if (delModal) {
      delModal.setAttribute("hidden", "");
      delModal.setAttribute("aria-hidden", "true");
    }
    deleteTargetId = null;
    if (delSlider) {
      delSlider.value = "0";
      syncVzDelSlider();
    }
    if (delPreview) delPreview.textContent = "";
  }

  function syncVzDelSlider() {
    if (!delSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function openVzDeleteModal(id, previewLabel) {
    deleteTargetId = id;
    if (delPreview) delPreview.textContent = previewLabel || "";
    if (delSlider) {
      delSlider.value = "0";
      syncVzDelSlider();
    }
    if (delModal) {
      delModal.removeAttribute("hidden");
      delModal.setAttribute("aria-hidden", "false");
    }
  }

  function deleteRowById(id) {
    if (!id) return;
    var list = getActiveRows().slice();
    var next = list.filter(function (x) {
      return x.id !== id;
    });
    if (next.length === list.length) return;
    setActiveRows(next);
    if (selectedEmployee && !getRowsForSelectedEmployee().length) {
      selectedEmployee = null;
    }
    render();
  }

  function confirmVzDelete() {
    if (!deleteTargetId || (delConfirmBtn && delConfirmBtn.disabled)) return;
    deleteRowById(deleteTargetId);
    closeVzDeleteModal();
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("deleted", "Verzuimregel");
    }
  }

  if (delSlider) {
    delSlider.addEventListener("input", syncVzDelSlider);
    delSlider.addEventListener("change", syncVzDelSlider);
  }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmVzDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeVzDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeVzDeleteModal);
  if (delModal) {
    delModal.addEventListener("click", function (e) {
      if (e.target === delModal) closeVzDeleteModal();
    });
  }
  syncVzDelSlider();

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && editModal && editModal.style.display === "flex") {
      closeVzEditModal();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && selectedEmployee) {
      closeEmployeeDetail();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && delModal && !delModal.hasAttribute("hidden")) {
      closeVzDeleteModal();
      e.stopPropagation();
    }
  });

  function setTab(type) {
    closeVzDeleteModal();
    closeVzEditModal();
    selectedEmployee = null;
    vzType = type;
    currentPage = 0;
    if (titleEl) {
      titleEl.textContent = type === "lang" ? "Lange termijn afwezigheid" : "Korte termijn afwezigheid";
    }
    if (tabLang && tabKort) {
      var isLang = type === "lang";
      tabLang.classList.toggle("is-active", isLang);
      tabKort.classList.toggle("is-active", !isLang);
      tabLang.setAttribute("aria-selected", isLang ? "true" : "false");
      tabKort.setAttribute("aria-selected", isLang ? "false" : "true");
    }
    render();
  }

  if (tabLang) tabLang.addEventListener("click", function () { setTab("lang"); });
  if (tabKort) tabKort.addEventListener("click", function () { setTab("kort"); });

  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });
  if (rowsSelect) rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("vz-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var items = getFiltered();
      var pageSize = getPageSize();
      var total = items.length;
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  document.querySelectorAll("#vz-columns-panel .column-toggle").forEach(function (btn) {
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
  });

  tbody.addEventListener("click", function (e) {
    var del = e.target.closest(".cd-type-delete-btn");
    if (del && tbody.contains(del)) {
      e.preventDefault();
      e.stopPropagation();
      var trDel = del.closest("tr");
      if (!trDel || !trDel.dataset.rowId) return;
      var idDel = trDel.dataset.rowId;
      var rowDel = findRowById(idDel);
      var labelDel = rowDel ? rowDel.medewerker || idDel : idDel;
      openVzDeleteModal(idDel, labelDel);
      return;
    }
    var ed = e.target.closest(".vz-edit-table-btn");
    if (ed && tbody.contains(ed)) {
      e.preventDefault();
      e.stopPropagation();
      var rid = ed.getAttribute("data-row-id");
      var rowEd = rid ? findRowById(rid) : null;
      if (rowEd) openVzEditModal(rowEd);
      return;
    }
    var tr = e.target.closest("tr");
    if (!tr || !tbody.contains(tr) || !tr.dataset.rowId) return;
    var rowOpen = findRowById(tr.dataset.rowId);
    if (rowOpen && rowOpen.medewerker) openEmployeeDetail(rowOpen.medewerker);
  });

  if (detailCards) {
    detailCards.addEventListener("click", function (e) {
      var ed = e.target.closest(".vz-card-edit-btn");
      if (ed && detailCards.contains(ed)) {
        e.preventDefault();
        var rid = ed.getAttribute("data-row-id");
        var row = rid ? findRowById(rid) : null;
        if (row) openVzEditModal(row);
        return;
      }
      var del = e.target.closest(".vz-card-del-btn");
      if (!del || !detailCards.contains(del)) return;
      e.preventDefault();
      var id2 = del.getAttribute("data-row-id");
      if (!id2) return;
      var row2 = findRowById(id2);
      openVzDeleteModal(id2, row2 ? row2.medewerker || id2 : id2);
    });
  }

  if (detailBack) {
    detailBack.addEventListener("click", function () {
      closeEmployeeDetail();
    });
  }

  if (editCloseBtn) editCloseBtn.addEventListener("click", closeVzEditModal);
  if (editCancelBtn) editCancelBtn.addEventListener("click", closeVzEditModal);
  if (editModal) {
    editModal.addEventListener("click", function (e) {
      if (e.target === editModal) closeVzEditModal();
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = editId ? editId.value : "";
      if (!id) return;
      var eerstIso = parseDdMmYyyyToIso(editEerst ? editEerst.value : "");
      if (!eerstIso) {
        if (editEerst) editEerst.focus();
        return;
      }
      var verIso = editVerwacht && editVerwacht.value.trim() ? parseDdMmYyyyToIso(editVerwacht.value) : "";
      if (editVerwacht && editVerwacht.value.trim() && verIso === null) {
        editVerwacht.focus();
        return;
      }
      var werIso = editWerkelijk && editWerkelijk.value.trim() ? parseDdMmYyyyToIso(editWerkelijk.value) : "";
      if (editWerkelijk && editWerkelijk.value.trim() && werIso === null) {
        editWerkelijk.focus();
        return;
      }
      var list = getActiveRows().slice();
      var idx = -1;
      var j;
      for (j = 0; j < list.length; j++) {
        if (list[j].id === id) {
          idx = j;
          break;
        }
      }
      if (idx < 0) return;
      list[idx] = {
        id: id,
        medewerker: list[idx].medewerker,
        eerstZiektedag: eerstIso,
        verwachteTerug: verIso || "",
        werkelijkeTerug: werIso || "",
        beschrijving: editBeschrijving ? editBeschrijving.value.trim() : "",
        status: editStatus ? editStatus.value : "Actief"
      };
      setActiveRows(list);
      closeVzEditModal();
      render();
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("saved", "Verzuimregel");
      }
    });
  }

  render();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de caches
  // ververst (lang + kort).
  window.addEventListener("besa:verzuim-updated", function () {
    try {
      rowsLang = loadRows(STORAGE_LANG, defaultLangRows);
      rowsKort = loadRows(STORAGE_KORT, defaultKortRows);
      render();
    } catch (e) { /* */ }
  });
})();
