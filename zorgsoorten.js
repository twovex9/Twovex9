/* global showSaveModal */
(function () {
  "use strict";

  var tbody = document.getElementById("zs-tbody");
  var table = document.getElementById("zs-table");
  var searchInput = document.getElementById("zs-search");
  var archivedToggle = document.getElementById("zs-archived-toggle");
  var rangeEl = document.getElementById("zs-pager-range");
  var pageEl = document.getElementById("zs-pager-page");
  var rowsSelect = document.getElementById("zs-rows-per-page");
  var checkAll = document.getElementById("zs-check-all");
  var toastEl = document.getElementById("zs-toast");

  var TRASH_SVG =
    '<svg class="cl-trash-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  var pendingArchiveId = "";
  var pendingPurgeId = "";

  if (!tbody || !table) return;
  if (!window.zorgsoortenDB) {
    console.error("zorgsoortenDB ontbreekt — laad supabase-client.js + zorgsoorten-data.js vóór zorgsoorten.js.");
    return;
  }

  function getZorgsoortenCached() {
    return window.zorgsoortenDB.getAllSync();
  }

  var sortKey = "naam";
  var sortDir = "asc";
  var currentPage = 0;

  var TARIEF_LABEL = { week: "Week", uur: "Uur", dag: "Dag" };

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

  var zsAddModal = document.getElementById("zs-add-modal");
  var zsAddForm = document.getElementById("zs-add-form");
  var zsAddClose = document.getElementById("zs-add-close");
  var zsAddCancel = document.getElementById("zs-add-cancel");
  var zsAddNaam = document.getElementById("zs-add-naam");
  var zsAddTarief = document.getElementById("zs-add-tarief");
  var zsAddTariefBedrag = document.getElementById("zs-add-tarief-bedrag");

  var EENHEID_KORT = { uur: "uur", dag: "dag", week: "week" };
  function fmtTariefBedrag(r) {
    if (!r || r.tarief == null || r.tarief === "") return "—";
    var n = Number(r.tarief);
    if (!isFinite(n)) return "—";
    var eenheid = EENHEID_KORT[String(r.tarieftype || "").toLowerCase()] || "";
    var bedrag = "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return eenheid ? bedrag + " / " + eenheid : bedrag;
  }

  function openZsAddModal() {
    if (!zsAddModal || !zsAddForm) return;
    zsAddForm.reset();
    zsAddModal.removeAttribute("hidden");
    zsAddModal.setAttribute("aria-hidden", "false");
    window.setTimeout(function () {
      if (zsAddNaam) zsAddNaam.focus();
    }, 10);
  }

  function closeZsAddModal() {
    if (!zsAddModal) return;
    zsAddModal.setAttribute("hidden", "");
    zsAddModal.setAttribute("aria-hidden", "true");
    if (zsAddForm) zsAddForm.reset();
  }

  function tariefLabel(key) {
    return TARIEF_LABEL[key] || (key == null ? "—" : String(key));
  }

  function getPageSize() {
    return Math.max(5, parseInt(rowsSelect && rowsSelect.value ? rowsSelect.value : "15", 10) || 15);
  }

  function getSortValue(item, key) {
    if (!item) return "";
    if (key === "tarieftype") return String(item.tarieftype || "");
    if (key === "tarief") return item.tarief == null ? null : Number(item.tarief);
    if (key === "naam") return String(item.naam || "").toLowerCase();
    return "";
  }

  function findZorgsoortById(id) {
    var items = getZorgsoortenCached() || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) return items[i];
    }
    return null;
  }

  function getFiltered() {
    var items = getZorgsoortenCached() || [];
    var showArch = archivedToggle && archivedToggle.checked;
    items = items.filter(function (r) {
      if (!r) return false;
      return showArch ? r.archived === true : !r.archived;
    });
    var q = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        var n = (r.naam == null ? "" : String(r.naam)).toLowerCase();
        var t = (r.tarieftype == null ? "" : String(r.tarieftype)).toLowerCase();
        return n.indexOf(q) !== -1 || t.indexOf(q) !== -1 || tariefLabel(r.tarieftype).toLowerCase().indexOf(q) !== -1;
      });
    }
    items = items.slice();
    items.sort(function (a, b) {
      var av = getSortValue(a, sortKey);
      var bv = getSortValue(b, sortKey);
      if (sortKey === "tarieftype") {
        var order = { week: 0, uur: 1, dag: 2 };
        var an = order[av] != null ? order[av] : 99;
        var bn = order[bv] != null ? order[bv] : 99;
        if (an !== bn) return sortDir === "asc" ? an - bn : bn - an;
      }
      if (sortKey === "tarief") {
        // Numeriek sorteren; lege tarieven altijd onderaan.
        var ae = av == null, be = bv == null;
        if (ae && be) return 0;
        if (ae) return 1;
        if (be) return -1;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      var as = String(av);
      var bs = String(bv);
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#zs-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#zs-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setColumnVisible(colId, isOn);
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
      tdE.colSpan = 5;
      tdE.className = "cl-empty-cell";
      tdE.textContent = "Geen zorgsoorten gevonden.";
      trE.appendChild(tdE);
      tbody.appendChild(trE);
    } else {
      var showArch = archivedToggle && archivedToggle.checked;
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-id", r.id);
        tr.className = "zs-data-row";
        var td0 = document.createElement("td");
        td0.setAttribute("data-col", "select");
        td0.innerHTML = '<input type="checkbox" class="table-checkbox zs-row-check" aria-label="Selecteer rij" data-id="' + r.id + '" />';
        tr.appendChild(td0);
        var td1 = document.createElement("td");
        td1.setAttribute("data-col", "naam");
        td1.textContent = r.naam != null ? String(r.naam) : "—";
        tr.appendChild(td1);
        var td2 = document.createElement("td");
        td2.setAttribute("data-col", "tarieftype");
        td2.textContent = tariefLabel(r.tarieftype);
        tr.appendChild(td2);
        var td3 = document.createElement("td");
        td3.setAttribute("data-col", "tarief");
        td3.textContent = fmtTariefBedrag(r);
        tr.appendChild(td3);
        var tdA = document.createElement("td");
        tdA.setAttribute("data-col", "acties");
        tdA.className = "cl-actions-cell";
        if (showArch) {
          tdA.innerHTML =
            '<div class="hr-row-actions">' +
            '<button type="button" class="btn-outline hr-restore-btn zs-restore-btn" data-id="' +
            r.id +
            '">Herstel</button>' +
            '<button type="button" class="employee-delete-btn zs-purge-btn" data-id="' +
            r.id +
            '" aria-label="Definitief verwijderen">' +
            TRASH_SVG +
            "</button></div>";
        } else {
          tdA.innerHTML =
            '<button type="button" class="employee-delete-btn zs-archive-btn" data-id="' + r.id + '" aria-label="Zorgsoort archiveren">' + TRASH_SVG + "</button>";
        }
        tr.appendChild(tdA);
        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        rangeEl.textContent = (start + 1) + "–" + end + " van " + total;
      }
    }
    if (pageEl) {
      pageEl.textContent = total === 0 ? "Pagina 0 van 0" : "Pagina " + (currentPage + 1) + " van " + totalPages;
    }

    var first = document.getElementById("zs-pager-first");
    var prev = document.getElementById("zs-pager-prev");
    var next = document.getElementById("zs-pager-next");
    var last = document.getElementById("zs-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;

    if (checkAll) checkAll.checked = false;

    zsSyncSortTh();
  }

  function zsSyncSortTh() {
    table.querySelectorAll("thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc", "th-sort-open");
      var c = th.getAttribute("data-col");
      if (c && c === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () { currentPage = 0; render(); });
  }
  if (archivedToggle) {
    archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });
  }
  if (rowsSelect) {
    rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });
  }

  if (checkAll) {
    checkAll.addEventListener("change", function () {
      var on = checkAll.checked;
      tbody.querySelectorAll(".zs-row-check").forEach(function (c) { c.checked = on; });
    });
  }
  tbody.addEventListener("change", function (e) {
    if (e.target && e.target.classList && e.target.classList.contains("zs-row-check") && checkAll) {
      checkAll.checked = false;
    }
  });

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("zs-pager-" + action);
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

  var zsColBtn = document.getElementById("zs-columns-menu-btn");
  var zsColPanel = document.getElementById("zs-columns-panel");

  document.querySelectorAll("#zs-columns-list .column-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      var on = btn.getAttribute("aria-checked") === "true";
      btn.setAttribute("aria-checked", on ? "false" : "true");
      btn.classList.toggle("is-checked", !on);
      applyColumnVisibility();
    });
  });

  if (zsColBtn && zsColPanel) {
    zsColBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (zsColPanel.hasAttribute("hidden")) {
        zsColPanel.removeAttribute("hidden");
        zsColBtn.setAttribute("aria-expanded", "true");
      } else {
        zsColPanel.setAttribute("hidden", "");
        zsColBtn.setAttribute("aria-expanded", "false");
      }
    });
    zsColPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  document.addEventListener("click", function () {
    if (zsColPanel) {
      zsColPanel.setAttribute("hidden", "");
      if (zsColBtn) zsColBtn.setAttribute("aria-expanded", "false");
    }
    document.querySelectorAll("#zs-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
  });

  if (table) {
    table.querySelectorAll(".th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#zs-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
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
          var toggle = document.querySelector('#zs-columns-list .column-toggle[data-col="' + colId + '"]');
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
        document.querySelectorAll("#zs-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      });
    });
  }

  var zsAdd = document.getElementById("zs-add-btn");
  if (zsAdd) {
    zsAdd.addEventListener("click", function (e) {
      e.preventDefault();
      openZsAddModal();
    });
  }
  if (zsAddForm) {
    zsAddForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var nm = zsAddNaam ? (zsAddNaam.value || "").trim() : "";
      var tr = zsAddTarief && zsAddTarief.value ? zsAddTarief.value : "";
      if (!nm) {
        showToast("Vul een naam in");
        return;
      }
      if (!tr) {
        showToast("Kies een tarieftype (Dag, Uur of Week)");
        return;
      }
      var tariefVal = zsAddTariefBedrag && zsAddTariefBedrag.value !== "" ? zsAddTariefBedrag.value : null;
      try {
        await window.zorgsoortenDB.add({ naam: nm, tarieftype: tr, tarief: tariefVal });
      } catch (err) {
        console.error("Zorgsoort toevoegen mislukt:", err);
        showToast("Opslaan is niet gelukt");
        return;
      }
      closeZsAddModal();
      if (typeof showSaveModal === "function") showSaveModal("Zorgsoort is opgeslagen.");
      else showToast("Zorgsoort opgeslagen");
      currentPage = 0;
      render();
    });
  }
  [zsAddClose, zsAddCancel].forEach(function (btn) {
    if (btn) btn.addEventListener("click", function () { closeZsAddModal(); });
  });
  if (zsAddModal) {
    zsAddModal.addEventListener("click", function (e) {
      if (e.target === zsAddModal) closeZsAddModal();
    });
  }

  function syncZsArSlider() {
    var s = document.getElementById("zs-ar-slider");
    var c = document.getElementById("zs-ar-confirm");
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    s.setAttribute("aria-valuenow", String(v));
    c.disabled = v < 100;
  }

  function syncZsPurgeSlider() {
    var s = document.getElementById("zs-purge-slider");
    var c = document.getElementById("zs-purge-confirm");
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    s.setAttribute("aria-valuenow", String(v));
    c.disabled = v < 100;
  }

  function closeZsArchive() {
    var m = document.getElementById("zs-archive-modal");
    var s = document.getElementById("zs-ar-slider");
    pendingArchiveId = "";
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
    if (s) {
      s.value = "0";
      s.classList.add("is-reset");
    }
    syncZsArSlider();
  }

  function openZsArchive(id) {
    var r = findZorgsoortById(id);
    if (!r) return;
    pendingArchiveId = id;
    var pr = document.getElementById("zs-ar-preview");
    if (pr) pr.textContent = r.naam != null ? String(r.naam) : "—";
    var m = document.getElementById("zs-archive-modal");
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
    }
    var s = document.getElementById("zs-ar-slider");
    if (s) s.value = "0";
    syncZsArSlider();
  }

  function closeZsPurge() {
    var m = document.getElementById("zs-purge-modal");
    var s = document.getElementById("zs-purge-slider");
    pendingPurgeId = "";
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
    if (s) {
      s.value = "0";
      s.classList.add("is-reset");
    }
    syncZsPurgeSlider();
  }

  function openZsPurge(id) {
    var r = findZorgsoortById(id);
    if (!r) return;
    pendingPurgeId = id;
    var pr = document.getElementById("zs-purge-preview");
    if (pr) pr.textContent = r.naam != null ? String(r.naam) : "—";
    var m = document.getElementById("zs-purge-modal");
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
    }
    var s = document.getElementById("zs-purge-slider");
    if (s) s.value = "0";
    syncZsPurgeSlider();
  }

  var zsArModal = document.getElementById("zs-archive-modal");
  var zsPurgeModal = document.getElementById("zs-purge-modal");
  var zsArSlider = document.getElementById("zs-ar-slider");
  var zsPurgeSlider = document.getElementById("zs-purge-slider");

  if (zsArSlider) {
    zsArSlider.addEventListener("input", syncZsArSlider);
    zsArSlider.addEventListener("change", syncZsArSlider);
  }
  if (zsPurgeSlider) {
    zsPurgeSlider.addEventListener("input", syncZsPurgeSlider);
    zsPurgeSlider.addEventListener("change", syncZsPurgeSlider);
  }

  document.getElementById("zs-ar-confirm") && document.getElementById("zs-ar-confirm").addEventListener("click", async function () {
    if (!pendingArchiveId) return;
    var s = document.getElementById("zs-ar-slider");
    if (s && parseInt(s.value, 10) < 100) return;
    var idToArchive = pendingArchiveId;
    closeZsArchive();
    try {
      await window.zorgsoortenDB.archive(idToArchive);
      if (typeof showSaveModal === "function") showSaveModal("Zorgsoort is gearchiveerd.", "Gearchiveerd");
      else showToast("Zorgsoort gearchiveerd");
    } catch (err) {
      console.error("Archiveren mislukt:", err);
      showToast("Archiveren is niet gelukt");
    }
    render();
  });
  document.getElementById("zs-purge-confirm") && document.getElementById("zs-purge-confirm").addEventListener("click", async function () {
    if (!pendingPurgeId) return;
    var s = document.getElementById("zs-purge-slider");
    if (s && parseInt(s.value, 10) < 100) return;
    var idToPurge = pendingPurgeId;
    closeZsPurge();
    try {
      await window.zorgsoortenDB.delete(idToPurge);
      if (typeof showSaveModal === "function") showSaveModal("Zorgsoort is definitief verwijderd.", "Verwijderd");
      else showToast("Zorgsoort verwijderd");
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
      showToast("Verwijderen is niet gelukt");
    }
    render();
  });
  document.getElementById("zs-ar-close") && document.getElementById("zs-ar-close").addEventListener("click", closeZsArchive);
  document.getElementById("zs-ar-cancel") && document.getElementById("zs-ar-cancel").addEventListener("click", closeZsArchive);
  document.getElementById("zs-purge-close") && document.getElementById("zs-purge-close").addEventListener("click", closeZsPurge);
  document.getElementById("zs-purge-cancel") && document.getElementById("zs-purge-cancel").addEventListener("click", closeZsPurge);

  if (zsArModal) {
    zsArModal.addEventListener("click", function (e) {
      if (e.target === zsArModal) closeZsArchive();
    });
  }
  if (zsPurgeModal) {
    zsPurgeModal.addEventListener("click", function (e) {
      if (e.target === zsPurgeModal) closeZsPurge();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (zsAddModal && !zsAddModal.hasAttribute("hidden")) {
      e.preventDefault();
      closeZsAddModal();
    } else if (zsPurgeModal && !zsPurgeModal.hasAttribute("hidden")) {
      e.preventDefault();
      closeZsPurge();
    } else if (zsArModal && !zsArModal.hasAttribute("hidden")) {
      e.preventDefault();
      closeZsArchive();
    }
  });

  tbody.addEventListener("click", async function (e) {
    var t = e.target;
    if (t && t.closest && t.closest(".zs-restore-btn")) {
      e.preventDefault();
      var id = t.closest(".zs-restore-btn").getAttribute("data-id");
      if (id) {
        try {
          await window.zorgsoortenDB.restore(id);
          if (typeof showSaveModal === "function") showSaveModal("Zorgsoort is hersteld.", "Hersteld");
          else showToast("Zorgsoort hersteld");
        } catch (err) {
          console.error("Herstellen mislukt:", err);
          showToast("Herstellen is niet gelukt");
        }
      }
      render();
      return;
    }
    if (t && t.closest && t.closest(".zs-purge-btn")) {
      e.preventDefault();
      var pid = t.closest(".zs-purge-btn").getAttribute("data-id");
      if (pid) openZsPurge(pid);
      return;
    }
    if (t && t.closest && t.closest(".zs-archive-btn")) {
      e.preventDefault();
      var aid = t.closest(".zs-archive-btn").getAttribute("data-id");
      if (aid) openZsArchive(aid);
      return;
    }

    if (t && t.closest && (t.closest("input[type='checkbox']") || t.closest("button") || t.closest("a"))) {
      return;
    }
    var row = t && t.closest ? t.closest("tr.zs-data-row") : null;
    if (row) {
      var rid = row.getAttribute("data-id");
      if (rid) {
        window.location.href = "zorgsoort-detail.html?id=" + encodeURIComponent(rid);
      }
    }
  });

  function initialRender() {
    var cached = getZorgsoortenCached();
    if (cached.length > 0) {
      render();
    } else if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="cl-empty-cell">Zorgsoorten laden…</td></tr>';
    }
  }

  window.addEventListener("besa:zorgsoorten-updated", render);
  initialRender();
})();
