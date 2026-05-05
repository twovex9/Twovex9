/* global showSaveModal */
(function () {
  "use strict";

  var tbody = document.getElementById("gem-tbody");
  var table = document.getElementById("gem-table");
  var searchInput = document.getElementById("gem-search");
  var archivedToggle = document.getElementById("gem-archived-toggle");
  var rangeEl = document.getElementById("gem-pager-range");
  var pageEl = document.getElementById("gem-pager-page");
  var rowsSelect = document.getElementById("gem-rows-per-page");
  var checkAll = document.getElementById("gem-check-all");
  var toastEl = document.getElementById("gem-toast");
  var colsList = document.getElementById("gem-columns-list");

  var sortKey = "naam";
  var sortDir = "asc";
  var currentPage = 0;
  var pendingArchiveId = "";
  var pendingPurgeId = "";

  var TRASH_SVG =
    '<svg class="cl-trash-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  var COLUMN_CONFIG = [
    { id: "select", label: "Selectie", defaultOn: true, skipToggle: true },
    { id: "naam", label: "Naam", defaultOn: true },
    { id: "acties", label: "Acties", defaultOn: true, skipToggle: true },
  ];

  if (!tbody || !table) return;
  if (!window.gemeentenDB) {
    console.error("gemeentenDB ontbreekt — laad supabase-client.js + gemeenten-data.js vóór gemeenten.js.");
    return;
  }

  function getGemeentenCached() {
    return window.gemeentenDB.getAllSync();
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

  var addModal = document.getElementById("gem-add-modal");
  var addForm = document.getElementById("gem-add-form");
  var addClose = document.getElementById("gem-add-close");
  var addCancel = document.getElementById("gem-add-cancel");
  var addNaam = document.getElementById("gem-add-naam");

  function getPageSize() {
    return Math.max(5, parseInt(rowsSelect && rowsSelect.value ? rowsSelect.value : "15", 10) || 15);
  }

  function findById(id) {
    return (getGemeentenCached() || []).find(function (o) {
      return o && o.id === id;
    }) || null;
  }

  function getSortValue(r, key) {
    if (!r) return "";
    if (key === "naam") return String(r.naam == null ? "" : r.naam).toLowerCase();
    return "";
  }

  function getFiltered() {
    var items = (getGemeentenCached() || []).map(function (x) {
      return x;
    });
    var showArch = archivedToggle && archivedToggle.checked;
    items = items.filter(function (r) {
      if (!r) return false;
      return showArch ? r.archived === true : !r.archived;
    });
    var q = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        return String(r.naam == null ? "" : r.naam)
          .toLowerCase()
          .indexOf(q) !== -1;
      });
    }
    items = items.slice();
    items.sort(function (a, b) {
      var av = getSortValue(a, sortKey);
      var bv = getSortValue(b, sortKey);
      if (as(av) < as(bv)) return sortDir === "asc" ? -1 : 1;
      if (as(av) > as(bv)) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }

  function as(v) {
    return String(v);
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#gem-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    if (!colsList) return;
    colsList.querySelectorAll(".column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      setColumnVisible(colId, btn.getAttribute("aria-checked") === "true");
    });
  }

  function buildColumnsPanel() {
    if (!colsList) return;
    colsList.innerHTML = "";
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
      b.addEventListener("click", function (event) {
        event.stopPropagation();
        var on = b.getAttribute("aria-checked") === "true";
        b.setAttribute("aria-checked", on ? "false" : "true");
        b.classList.toggle("is-checked", !on);
        applyColumnVisibility();
      });
      li.appendChild(b);
      colsList.appendChild(li);
    });
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
      tdE.colSpan = 3;
      tdE.className = "cl-empty-cell";
      tdE.textContent = "Geen gemeenten gevonden.";
      trE.appendChild(tdE);
      tbody.appendChild(trE);
    } else {
      var showArch = archivedToggle && archivedToggle.checked;
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-id", r.id);
        tr.className = "gem-data-row gem-data-row--nav";
        tr.setAttribute("tabindex", "0");
        var nm = r.naam != null ? String(r.naam) : "—";
        tr.setAttribute("aria-label", nm + ", open detail");
        var td0 = document.createElement("td");
        td0.setAttribute("data-col", "select");
        td0.innerHTML = '<input type="checkbox" class="table-checkbox gem-row-check" aria-label="Selecteer rij" data-id="' + r.id + '" />';
        tr.appendChild(td0);
        var td1 = document.createElement("td");
        td1.setAttribute("data-col", "naam");
        td1.className = "cl-name";
        var nameSpan = document.createElement("span");
        nameSpan.className = "gem-detail-name";
        nameSpan.textContent = nm;
        td1.appendChild(nameSpan);
        tr.appendChild(td1);
        var tdA = document.createElement("td");
        tdA.setAttribute("data-col", "acties");
        tdA.className = "cl-actions-cell";
        if (showArch) {
          tdA.innerHTML =
            '<div class="hr-row-actions">' +
            '<button type="button" class="btn-outline hr-restore-btn gem-restore-btn" data-id="' +
            r.id +
            '">Herstel</button>' +
            '<button type="button" class="employee-delete-btn gem-purge-btn" data-id="' +
            r.id +
            '" aria-label="Definitief verwijderen">' +
            TRASH_SVG +
            "</button></div>";
        } else {
          tdA.innerHTML = '<button type="button" class="employee-delete-btn gem-archive-btn" data-id="' + r.id + '" aria-label="Gemeente archiveren">' + TRASH_SVG + "</button>";
        }
        tr.appendChild(tdA);
        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();
    if (table) {
      table.querySelectorAll("thead th.th-sort").forEach(function (th) {
        th.classList.remove("th-sort--asc", "th-sort--desc", "th-sort-open");
        var c = th.getAttribute("data-col");
        if (c && c === sortKey) th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      });
    }

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        rangeEl.textContent = start + 1 + "–" + end + " van " + total + " totaal";
      }
    }
    if (pageEl) {
      pageEl.textContent = total === 0 ? "Pagina 0 van 0" : "Pagina " + (currentPage + 1) + " van " + totalPages;
    }

    var first = document.getElementById("gem-pager-first");
    var prev = document.getElementById("gem-pager-prev");
    var next = document.getElementById("gem-pager-next");
    var last = document.getElementById("gem-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;
    if (checkAll) checkAll.checked = false;
  }

  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });
  if (archivedToggle) archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });
  if (rowsSelect) rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });

  if (checkAll) {
    checkAll.addEventListener("change", function () {
      var on = checkAll.checked;
      tbody.querySelectorAll(".gem-row-check").forEach(function (c) { c.checked = on; });
    });
  }
  tbody.addEventListener("change", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("gem-row-check") && checkAll) {
      checkAll.checked = false;
    }
  });

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("gem-pager-" + action);
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

  var colBtn = document.getElementById("gem-columns-menu-btn");
  var colPanel = document.getElementById("gem-columns-panel");
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
    if (table) {
      table.querySelectorAll(".th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    }
  });

  if (table) {
    table.querySelectorAll(".th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#gem-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
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
          if (colPanel && colBtn) {
            colPanel.setAttribute("hidden", "");
            colBtn.setAttribute("aria-expanded", "false");
          }
          var toggle = document.querySelector('#gem-columns-list .column-toggle[data-col="' + colId + '"]');
          if (toggle) {
            toggle.setAttribute("aria-checked", "false");
            toggle.classList.remove("is-checked");
            setColumnVisible(colId, false);
          }
        } else {
          sortKey = colId;
          sortDir = action;
          currentPage = 0;
          render();
        }
        document.querySelectorAll("#gem-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      });
    });
  }

  function openAdd() {
    if (!addModal || !addForm) return;
    addForm.reset();
    addModal.removeAttribute("hidden");
    addModal.setAttribute("aria-hidden", "false");
    window.setTimeout(function () { if (addNaam) addNaam.focus(); }, 20);
  }

  function closeAdd() {
    if (addModal) {
      addModal.setAttribute("hidden", "");
      addModal.setAttribute("aria-hidden", "true");
    }
    if (addForm) addForm.reset();
  }

  document.getElementById("gem-add-btn") && document.getElementById("gem-add-btn").addEventListener("click", function (e) { e.preventDefault(); openAdd(); });
  if (addForm) {
    addForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var nm = addNaam && addNaam.value ? addNaam.value.trim() : "";
      if (!nm) {
        showToast("Vul een naam in.");
        return;
      }
      try {
        await window.gemeentenDB.add(nm);
      } catch (err) {
        if (err && err.code === "duplicate_naam") {
          showToast("Deze gemeentenaam bestaat al.");
        } else {
          console.error("Gemeente toevoegen mislukt:", err);
          showToast("Opslaan is niet gelukt");
        }
        return;
      }
      closeAdd();
      if (typeof showSaveModal === "function") showSaveModal("Gemeente toegevoegd.");
      else showToast("Gemeente toegevoegd");
      currentPage = 0;
      render();
    });
  }
  [addClose, addCancel].forEach(function (btn) { if (btn) btn.addEventListener("click", function () { closeAdd(); }); });
  if (addModal) {
    addModal.addEventListener("click", function (e) { if (e.target === addModal) closeAdd(); });
  }

  function syncArSlider() {
    var s = document.getElementById("gem-ar-slider");
    var c = document.getElementById("gem-ar-confirm");
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    c.disabled = v < 100;
  }
  function syncPurgeSlider() {
    var s = document.getElementById("gem-purge-slider");
    var c = document.getElementById("gem-purge-confirm");
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    c.disabled = v < 100;
  }
  var arSl = document.getElementById("gem-ar-slider");
  var pSl = document.getElementById("gem-purge-slider");
  if (arSl) { arSl.addEventListener("input", syncArSlider); arSl.addEventListener("change", syncArSlider); }
  if (pSl) { pSl.addEventListener("input", syncPurgeSlider); pSl.addEventListener("change", syncPurgeSlider); }

  function closeArchive() {
    var m = document.getElementById("gem-archive-modal");
    var s = document.getElementById("gem-ar-slider");
    pendingArchiveId = "";
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
    if (s) { s.value = "0"; s.classList.add("is-reset"); }
    syncArSlider();
  }
  function openArchive(id) {
    var r = findById(id);
    if (!r) return;
    pendingArchiveId = id;
    var pr = document.getElementById("gem-ar-preview");
    if (pr) pr.textContent = r.naam != null ? String(r.naam) : "—";
    var m = document.getElementById("gem-archive-modal");
    if (m) { m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false"); }
    if (arSl) arSl.value = "0";
    syncArSlider();
  }
  function closePurge() {
    var m = document.getElementById("gem-purge-modal");
    var s = document.getElementById("gem-purge-slider");
    pendingPurgeId = "";
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
    if (s) { s.value = "0"; s.classList.add("is-reset"); }
    syncPurgeSlider();
  }
  function openPurge(id) {
    var r = findById(id);
    if (!r) return;
    pendingPurgeId = id;
    var pr = document.getElementById("gem-purge-preview");
    if (pr) pr.textContent = r.naam != null ? String(r.naam) : "—";
    var m = document.getElementById("gem-purge-modal");
    if (m) { m.removeAttribute("hidden"); m.setAttribute("aria-hidden", "false"); }
    if (pSl) pSl.value = "0";
    syncPurgeSlider();
  }

  document.getElementById("gem-ar-confirm") && document.getElementById("gem-ar-confirm").addEventListener("click", async function () {
    if (!pendingArchiveId) return;
    if (arSl && parseInt(arSl.value, 10) < 100) return;
    var idToArchive = pendingArchiveId;
    closeArchive();
    try {
      await window.gemeentenDB.archive(idToArchive);
      if (typeof showSaveModal === "function") showSaveModal("De gemeente is gearchiveerd.", "Gearchiveerd");
      else showToast("Gearchiveerd");
    } catch (err) {
      console.error("Archiveren mislukt:", err);
      showToast("Archiveren is niet gelukt");
    }
    render();
  });
  document.getElementById("gem-purge-confirm") && document.getElementById("gem-purge-confirm").addEventListener("click", async function () {
    if (!pendingPurgeId) return;
    if (pSl && parseInt(pSl.value, 10) < 100) return;
    var idToPurge = pendingPurgeId;
    closePurge();
    try {
      await window.gemeentenDB.delete(idToPurge);
      if (typeof showSaveModal === "function") showSaveModal("De gemeente is definitief verwijderd.", "Verwijderd");
      else showToast("Definitief verwijderd");
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
      showToast("Verwijderen is niet gelukt");
    }
    render();
  });
  document.getElementById("gem-ar-close") && document.getElementById("gem-ar-close").addEventListener("click", closeArchive);
  document.getElementById("gem-ar-cancel") && document.getElementById("gem-ar-cancel").addEventListener("click", closeArchive);
  document.getElementById("gem-purge-close") && document.getElementById("gem-purge-close").addEventListener("click", closePurge);
  document.getElementById("gem-purge-cancel") && document.getElementById("gem-purge-cancel").addEventListener("click", closePurge);
  var arM = document.getElementById("gem-archive-modal");
  var pM = document.getElementById("gem-purge-modal");
  if (arM) arM.addEventListener("click", function (e) { if (e.target === arM) closeArchive(); });
  if (pM) pM.addEventListener("click", function (e) { if (e.target === pM) closePurge(); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (addModal && !addModal.hasAttribute("hidden")) { e.preventDefault(); closeAdd(); }
    else if (pM && !pM.hasAttribute("hidden")) { e.preventDefault(); closePurge(); }
    else if (arM && !arM.hasAttribute("hidden")) { e.preventDefault(); closeArchive(); }
  });

  function goGemeenteDetail(id) {
    if (!id) return;
    window.location.href = "gemeente-detail.html?id=" + encodeURIComponent(id);
  }

  tbody.addEventListener("click", async function (e) {
    var t = e.target;
    if (t && t.closest && t.closest(".gem-restore-btn")) {
      e.preventDefault();
      var id0 = t.closest(".gem-restore-btn").getAttribute("data-id");
      if (id0) {
        try {
          await window.gemeentenDB.restore(id0);
          if (typeof showSaveModal === "function") showSaveModal("De gemeente is hersteld.", "Hersteld");
          else showToast("Hersteld");
        } catch (err) {
          console.error("Herstellen mislukt:", err);
          showToast("Herstellen is niet gelukt");
        }
      }
      render();
      return;
    }
    if (t && t.closest && t.closest(".gem-purge-btn")) {
      e.preventDefault();
      var pid = t.closest(".gem-purge-btn").getAttribute("data-id");
      if (pid) openPurge(pid);
      return;
    }
    if (t && t.closest && t.closest(".gem-archive-btn")) {
      e.preventDefault();
      var aid = t.closest(".gem-archive-btn").getAttribute("data-id");
      if (aid) openArchive(aid);
      return;
    }
    if (t && t.closest && t.closest("input, button, a, label")) return;
    var tr = t && t.closest ? t.closest("tr.gem-data-row--nav") : null;
    if (!tr) return;
    goGemeenteDetail(tr.getAttribute("data-id"));
  });

  tbody.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var tr = e.target;
    if (!tr || !tr.classList || !tr.classList.contains("gem-data-row--nav")) return;
    e.preventDefault();
    goGemeenteDetail(tr.getAttribute("data-id"));
  });

  buildColumnsPanel();

  function initialRender() {
    var cached = getGemeentenCached();
    if (cached.length > 0) {
      render();
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" class="cl-empty-cell">Gemeenten laden…</td></tr>';
    }
  }

  window.addEventListener("besa:gemeenten-updated", render);
  initialRender();
})();
