/* global getClientenItems, setClientenItems, upsertClienten, deleteClientenById, generateClientenId, showSaveModal */
(function () {
  "use strict";

  var tbody = document.getElementById("cl-tbody");
  var table = document.getElementById("cl-table");
  var searchInput = document.getElementById("cl-search");
  var archivedToggle = document.getElementById("cl-archived-toggle");
  var inzorgDate = document.getElementById("cl-inzorg-datum");
  var rangeEl = document.getElementById("cl-pager-range");
  var pageEl = document.getElementById("cl-pager-page");
  var rowsSelect = document.getElementById("cl-rows-per-page");
  var checkAll = document.getElementById("cl-check-all");
  var toastEl = document.getElementById("cl-toast");

  if (!tbody || !table) return;

  var sortKey = "achternaam";
  var sortDir = "asc";
  var currentPage = 0;
  var pendingArchiveId = "";
  var pendingPurgeId = "";
  var SS_CL_OV = "cl_ov_ui_v1";

  function clGetMainScroll() {
    return document.querySelector("main.content");
  }
  function clGetScrollTop() {
    var m = clGetMainScroll();
    return m ? m.scrollTop : window.scrollY || 0;
  }
  function clSetScrollTop(y) {
    if (y == null || isNaN(y)) return;
    var m = clGetMainScroll();
    if (m) m.scrollTop = y;
    else window.scrollTo(0, y);
  }
  function clReadSession() {
    try {
      var r = sessionStorage.getItem(SS_CL_OV);
      if (!r) return null;
      return JSON.parse(r);
    } catch (e) {
      return null;
    }
  }
  function clPersistSession() {
    try {
      var cols = {};
      document.querySelectorAll("#cl-columns-list .column-toggle").forEach(function (btn) {
        var id = btn.getAttribute("data-col");
        if (id) cols[id] = btn.getAttribute("aria-checked") === "true";
      });
      var o = {
        search: searchInput && searchInput.value != null ? searchInput.value : "",
        arch: archivedToggle && !!archivedToggle.checked,
        inzorg: inzorgDate && inzorgDate.value != null ? inzorgDate.value : "",
        sortKey: sortKey,
        sortDir: sortDir,
        currentPage: currentPage,
        pageSize: rowsSelect && rowsSelect.value != null ? rowsSelect.value : "",
        scrollY: clGetScrollTop(),
        cols: cols,
      };
      sessionStorage.setItem(SS_CL_OV, JSON.stringify(o));
    } catch (e) { /* */ }
  }
  function clApplySession(s) {
    if (!s || typeof s !== "object") return;
    if (searchInput && s.search != null) searchInput.value = s.search;
    if (archivedToggle && typeof s.arch === "boolean") archivedToggle.checked = s.arch;
    if (inzorgDate && s.inzorg != null) inzorgDate.value = s.inzorg;
    if (s.sortKey) sortKey = s.sortKey;
    if (s.sortDir === "asc" || s.sortDir === "desc") sortDir = s.sortDir;
    if (typeof s.currentPage === "number" && s.currentPage >= 0) currentPage = s.currentPage;
    if (rowsSelect && s.pageSize != null) rowsSelect.value = s.pageSize;
  }
  function clApplySessionColumns(s) {
    if (!s || !s.cols || typeof s.cols !== "object") return;
    Object.keys(s.cols).forEach(function (id) {
      var btn = document.querySelector('#cl-columns-list .column-toggle[data-col="' + id + '"]');
      if (!btn) return;
      var on = !!s.cols[id];
      btn.classList.toggle("is-checked", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  function clScheduleScrollRestore(y) {
    if (y == null || isNaN(y)) return;
    requestAnimationFrame(function () {
      clSetScrollTop(y);
      requestAnimationFrame(function () {
        clSetScrollTop(y);
      });
    });
  }

  var COLUMN_CONFIG = [
    { id: "select", label: "Selectie", defaultOn: true, skipToggle: true },
    { id: "voornaam", label: "Voornaam", defaultOn: true },
    { id: "achternaam", label: "Achternaam", defaultOn: true },
    { id: "clientnummer", label: "Cliëntnummer", defaultOn: true },
    { id: "locatie", label: "Locatie", defaultOn: true },
    { id: "fase", label: "Fase", defaultOn: true },
    { id: "gemeente", label: "Gemeente", defaultOn: true },
    { id: "organisatie", label: "Organisatie", defaultOn: true },
    { id: "req", label: "Required forms", defaultOn: true },
    { id: "uit", label: "Uit zorg datum", defaultOn: true },
    { id: "acties", label: "Acties", defaultOn: true, skipToggle: true },
  ];

  var TRASH_SVG =
    '<svg class="cl-trash-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

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

  function disp(s) {
    s = s == null ? "" : String(s).trim();
    return s || "—";
  }

  function getSortValue(c, key) {
    if (!c || !key) return "";
    if (key === "req") return c.requiredForms == null ? "" : String(c.requiredForms);
    if (key === "uit") return c.uitZorgDatum == null ? "" : String(c.uitZorgDatum).trim();
    if (key === "clientnummer") return Number(c.clientnummer) || 0;
    var v = c[key];
    return v == null ? "" : String(v);
  }

  function fasePillClass(f) {
    if (typeof window.besaFaseClientPillClass === "function") {
      return window.besaFaseClientPillClass(f);
    }
    var t = String(f || "").toLowerCase();
    if (t === "in zorg") return "cl-fase-pill cl-fase-pill--in-zorg";
    if (t === "in aanvraag") return "cl-fase-pill cl-fase-pill--in-aanvraag";
    if (t === "uit zorg") return "cl-fase-pill cl-fase-pill--uit-zorg";
    return "cl-fase-pill cl-fase-pill--in-zorg";
  }

  function faseLabel(f) {
    var t = String(f || "").toLowerCase();
    if (t === "in zorg") return "In zorg";
    if (t === "in aanvraag") return "In aanvraag";
    if (t === "uit zorg") return "Uit zorg";
    return disp(f);
  }

  function getPageSize() {
    return Math.max(5, parseInt(rowsSelect && rowsSelect.value ? rowsSelect.value : "50", 10) || 50);
  }

  function getFiltered() {
    if (typeof getClientenItems !== "function") return [];
    var items = getClientenItems() || [];
    var showArch = archivedToggle && archivedToggle.checked;
    items = items.filter(function (c) {
      if (!c) return false;
      return showArch ? c.archived === true : !c.archived;
    });
    var q = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (c) {
        var pack = [c.voornaam, c.achternaam, String(c.clientnummer), c.locatie, c.fase, c.gemeente, c.organisatie, c.requiredForms, c.uitZorgDatum, c.inZorgDatum]
          .map(function (x) {
            return (x == null ? "" : String(x)).toLowerCase();
          })
          .join(" ");
        return pack.indexOf(q) !== -1;
      });
    }
    if (inzorgDate && inzorgDate.value) {
      var d0 = inzorgDate.value;
      items = items.filter(function (c) {
        return c.inZorgDatum && String(c.inZorgDatum).slice(0, 10) === d0;
      });
    }
    items = items.slice();
    items.sort(function (a, b) {
      var av = getSortValue(a, sortKey);
      var bv = getSortValue(b, sortKey);
      if (sortKey === "clientnummer") {
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      var as = String(av).toLowerCase();
      var bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#cl-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#cl-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setColumnVisible(colId, isOn);
    });
  }

  function buildColumnsPanel() {
    var list = document.getElementById("cl-columns-list");
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
      tdE.colSpan = 11;
      trE.appendChild(tdE);
      tdE.className = "cl-empty-cell";
      tdE.textContent = "Geen cliënten gevonden.";
      tbody.appendChild(trE);
    } else {
      var showArch = archivedToggle && archivedToggle.checked;
      page.forEach(function (c) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-id", c.id);
        tr.className = "cl-table-row--client";
        tr.innerHTML = "";
        var cbTd = document.createElement("td");
        cbTd.setAttribute("data-col", "select");
        cbTd.innerHTML = '<input type="checkbox" class="table-checkbox cl-row-check" aria-label="Selecteer rij" data-id="' + c.id + '" />';
        tr.appendChild(cbTd);
        var tdVn = document.createElement("td");
        tdVn.setAttribute("data-col", "voornaam");
        tdVn.className = "cl-name";
        tdVn.textContent = c.voornaam || "—";
        tr.appendChild(tdVn);
        var tdAn = document.createElement("td");
        tdAn.setAttribute("data-col", "achternaam");
        tdAn.className = "cl-name";
        tdAn.textContent = c.achternaam || "—";
        tr.appendChild(tdAn);
        var tdNr = document.createElement("td");
        tdNr.setAttribute("data-col", "clientnummer");
        tdNr.className = "cl-num";
        tdNr.textContent = String(c.clientnummer != null ? c.clientnummer : "—");
        tr.appendChild(tdNr);
        var tdLoc = document.createElement("td");
        tdLoc.setAttribute("data-col", "locatie");
        tdLoc.textContent = disp(c.locatie);
        tr.appendChild(tdLoc);
        var tdF = document.createElement("td");
        tdF.setAttribute("data-col", "fase");
        tdF.innerHTML = '<span class="' + fasePillClass(c.fase) + '">' + faseLabel(c.fase) + "</span>";
        tr.appendChild(tdF);
        var tdGem = document.createElement("td");
        tdGem.setAttribute("data-col", "gemeente");
        tdGem.textContent = disp(c.gemeente);
        tr.appendChild(tdGem);
        var tdOrg = document.createElement("td");
        tdOrg.setAttribute("data-col", "organisatie");
        tdOrg.textContent = disp(c.organisatie);
        tr.appendChild(tdOrg);
        var tdReq = document.createElement("td");
        tdReq.setAttribute("data-col", "req");
        tdReq.textContent = disp(c.requiredForms);
        tr.appendChild(tdReq);
        var tdUit = document.createElement("td");
        tdUit.setAttribute("data-col", "uit");
        tdUit.textContent = disp(c.uitZorgDatum);
        tr.appendChild(tdUit);
        var tdA = document.createElement("td");
        tdA.setAttribute("data-col", "acties");
        tdA.className = "cl-actions-cell";
        if (showArch) {
          tdA.innerHTML =
            '<div class="hr-row-actions">' +
            '<button type="button" class="btn-outline cl-restore-btn" data-id="' +
            c.id +
            '">Herstel</button>' +
            '<button type="button" class="employee-delete-btn cl-purge-btn" data-id="' +
            c.id +
            '" aria-label="Definitief verwijderen">' +
            TRASH_SVG +
            "</button></div>";
        } else {
          tdA.innerHTML = '<button type="button" class="employee-delete-btn cl-archive-btn" data-id="' + c.id + '" aria-label="Cliënt archiveren">' + TRASH_SVG + "</button>";
        }
        tr.appendChild(tdA);
        tbody.appendChild(tr);
      });
    }

    if (checkAll) checkAll.checked = false;
    syncSortHeaders();
    applyColumnVisibility();
    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        rangeEl.textContent = start + 1 + "–" + end + " van " + total;
      }
    }
    if (pageEl) {
      pageEl.textContent = "Pagina " + (currentPage + 1) + " van " + totalPages;
    }
    var first = document.getElementById("cl-pager-first");
    var prev = document.getElementById("cl-pager-prev");
    var next = document.getElementById("cl-pager-next");
    var last = document.getElementById("cl-pager-last");
    if (first) first.disabled = currentPage <= 0;
    if (prev) prev.disabled = currentPage <= 0;
    if (next) next.disabled = currentPage >= totalPages - 1;
    if (last) last.disabled = currentPage >= totalPages - 1;
    clPersistSession();
  }

  function syncSortHeaders() {
    document.querySelectorAll("#cl-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc");
      var col = th.getAttribute("data-col");
      if (col && col === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  function exportCsv() {
    var items = getFiltered();
    if (!items.length) {
      showToast("Niets te exporteren");
      return;
    }
    // Generieke export-keuzemodal (CSV/TXT/Excel/PDF). Helper in besa-export.js.
    if (typeof window.besaExport === "function") {
      window.besaExport({
        filename: "clienten",
        title: "Cliënten",
        columns: ["Voornaam", "Achternaam", "Cliëntnummer", "Locatie", "Fase", "Gemeente", "Organisatie", "Required forms", "Uit zorg datum", "Gearchiveerd"],
        data: items.map(function (c) {
          return {
            "Voornaam": c.voornaam || "",
            "Achternaam": c.achternaam || "",
            "Cliëntnummer": c.clientnummer || "",
            "Locatie": c.locatie || "",
            "Fase": c.fase || "",
            "Gemeente": c.gemeente || "",
            "Organisatie": c.organisatie || "",
            "Required forms": c.requiredForms || "",
            "Uit zorg datum": c.uitZorgDatum || "",
            "Gearchiveerd": c.archived ? "ja" : "nee",
          };
        }),
      });
      return;
    }
    // Fallback (oude CSV-only export) als besa-export.js niet geladen is.
    var headers = ["Voornaam", "Achternaam", "Cliëntnummer", "Locatie", "Fase", "Gemeente", "Organisatie", "Required forms", "Uit zorg datum", "Gearchiveerd"];
    var rows = items.map(function (c) {
      return [
        c.voornaam,
        c.achternaam,
        c.clientnummer,
        c.locatie,
        c.fase,
        c.gemeente,
        c.organisatie,
        c.requiredForms,
        c.uitZorgDatum,
        c.archived ? "ja" : "nee",
      ]
        .map(function (f) {
          return '"' + String(f == null ? "" : f).replace(/"/g, '""') + '"';
        })
        .join(";");
    });
    var blob = new Blob([headers.join(";") + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    var filename = "clienten-" + new Date().toISOString().slice(0, 10) + ".csv";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("exported", filename);
    } else {
      showToast("Export gestart");
    }
  }

  function refreshClOrgDatalist() {
    var dl = document.getElementById("cl-add-org-dl");
    if (!dl || typeof getOrganisatieNamenVoorSelectie !== "function") return;
    var names = getOrganisatieNamenVoorSelectie();
    dl.innerHTML = "";
    names.forEach(function (n) {
      var o = document.createElement("option");
      o.value = n;
      dl.appendChild(o);
    });
  }

  function openAdd() {
    var m = document.getElementById("cl-add-modal");
    var f = document.getElementById("cl-add-form");
    if (f) f.reset();
    refreshClOrgDatalist();
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
    }
  }

  function closeAdd() {
    var m = document.getElementById("cl-add-modal");
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
  }

  function closeArchive() {
    var m = document.getElementById("cl-archive-modal");
    var s = document.getElementById("cl-ar-slider");
    pendingArchiveId = "";
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
    if (s) {
      s.value = "0";
      s.classList.add("is-reset");
    }
  }

  function openArchive(id) {
    var items = getClientenItems() || [];
    var c = items.find(function (x) {
      return x.id === id;
    });
    if (!c) return;
    pendingArchiveId = id;
    var pr = document.getElementById("cl-ar-preview");
    if (pr) pr.textContent = (c.voornaam || "") + " " + (c.achternaam || "");
    var m = document.getElementById("cl-archive-modal");
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
    }
    var s = document.getElementById("cl-ar-slider");
    if (s) s.value = "0";
    syncArSlider();
  }

  function closePurge() {
    var m = document.getElementById("cl-purge-modal");
    pendingPurgeId = "";
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
  }

  function openPurge(id) {
    var items = getClientenItems() || [];
    var c = items.find(function (x) {
      return x.id === id;
    });
    if (!c) return;
    pendingPurgeId = id;
    var pr = document.getElementById("cl-purge-preview");
    if (pr) pr.textContent = (c.voornaam || "") + " " + (c.achternaam || "");
    var m = document.getElementById("cl-purge-modal");
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
    }
    var s = document.getElementById("cl-purge-slider");
    if (s) s.value = "0";
    syncPurgeSlider();
  }

  var _clSess = clReadSession();
  if (_clSess) clApplySession(_clSess);
  buildColumnsPanel();
  if (_clSess) clApplySessionColumns(_clSess);
  render();
  if (_clSess && typeof _clSess.scrollY === "number") {
    clScheduleScrollRestore(_clSess.scrollY);
  }
  window.addEventListener("pagehide", clPersistSession);

  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });
  if (archivedToggle) archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });
  if (inzorgDate) inzorgDate.addEventListener("change", function () { currentPage = 0; render(); });
  if (rowsSelect) rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });
  if (checkAll) {
    checkAll.addEventListener("change", function () {
      var on = checkAll.checked;
      tbody.querySelectorAll(".cl-row-check").forEach(function (c) { c.checked = on; });
    });
  }

  var colBtn = document.getElementById("cl-columns-menu-btn");
  var colPanel = document.getElementById("cl-columns-panel");
  if (colBtn && colPanel) {
    colBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var o = colPanel.getAttribute("hidden");
      if (o == null) {
        colPanel.setAttribute("hidden", "");
      } else {
        colPanel.removeAttribute("hidden");
      }
    });
    colPanel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    document.getElementById("cl-columns-list") &&
      document.getElementById("cl-columns-list").addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        applyColumnVisibility();
      });
  }
  document.addEventListener("click", function () {
    if (colPanel) colPanel.setAttribute("hidden", "");
    document.querySelectorAll("#cl-table .th-sort-menu").forEach(function (m) {
      m.setAttribute("hidden", "");
    });
    document.querySelectorAll("#cl-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort-open");
    });
  });

  document.getElementById("cl-export-btn") && document.getElementById("cl-export-btn").addEventListener("click", exportCsv);
  document.querySelectorAll("#cl-table .th-sort-trigger").forEach(function (trigger) {
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var th = trigger.closest("th");
      var menu = th ? th.querySelector(".th-sort-menu") : null;
      if (!menu) return;
      var wasHidden = menu.hasAttribute("hidden");
      document.querySelectorAll("#cl-table .th-sort-menu").forEach(function (m) {
        m.setAttribute("hidden", "");
      });
      document.querySelectorAll("#cl-table thead th.th-sort").forEach(function (h) {
        h.classList.remove("th-sort-open");
      });
      if (wasHidden) {
        menu.removeAttribute("hidden");
        if (th) th.classList.add("th-sort-open");
      }
    });
  });
  document.querySelectorAll("#cl-table .th-sort-opt").forEach(function (opt) {
    opt.addEventListener("click", function (e) {
      e.stopPropagation();
      var action = opt.getAttribute("data-action");
      var th = opt.closest("th");
      var colId = th ? th.getAttribute("data-col") : null;
      if (!action || !colId) return;
      if (action === "hide") {
        var toggle = document.querySelector('#cl-columns-list .column-toggle[data-col="' + colId + '"]');
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
      document.querySelectorAll("#cl-table .th-sort-menu").forEach(function (m) {
        m.setAttribute("hidden", "");
      });
      document.querySelectorAll("#cl-table thead th.th-sort").forEach(function (h) {
        h.classList.remove("th-sort-open");
      });
    });
  });

  function pagerFirst() { currentPage = 0; render(); }
  function pagerPrev() { if (currentPage > 0) { currentPage--; render(); } }
  function pagerNext() { var items = getFiltered(); var ps = getPageSize(); var tp = Math.max(1, Math.ceil(items.length / ps)); if (currentPage < tp - 1) { currentPage++; render(); } }
  function pagerLast() {
    var items = getFiltered();
    var ps = getPageSize();
    var tp = Math.max(1, Math.ceil(items.length / ps));
    currentPage = tp - 1;
    render();
  }
  document.getElementById("cl-pager-first") && document.getElementById("cl-pager-first").addEventListener("click", pagerFirst);
  document.getElementById("cl-pager-prev") && document.getElementById("cl-pager-prev").addEventListener("click", pagerPrev);
  document.getElementById("cl-pager-next") && document.getElementById("cl-pager-next").addEventListener("click", pagerNext);
  document.getElementById("cl-pager-last") && document.getElementById("cl-pager-last").addEventListener("click", pagerLast);

  document.getElementById("cl-add-open-btn") && document.getElementById("cl-add-open-btn").addEventListener("click", openAdd);
  document.getElementById("cl-add-close") && document.getElementById("cl-add-close").addEventListener("click", closeAdd);
  document.getElementById("cl-add-cancel") && document.getElementById("cl-add-cancel").addEventListener("click", closeAdd);
  document.getElementById("cl-add-form") &&
    document.getElementById("cl-add-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nr = parseInt(document.getElementById("cl-add-nr").value, 10);
      if (Number.isNaN(nr) || nr < 1) return;
      if (typeof upsertClienten !== "function") return;
      var client = {
        id: "cl_" + String(nr),
        voornaam: document.getElementById("cl-add-vn").value.trim(),
        achternaam: document.getElementById("cl-add-an").value.trim(),
        clientnummer: nr,
        locatie: document.getElementById("cl-add-loc").value.trim(),
        fase: document.getElementById("cl-add-fase").value,
        gemeente: document.getElementById("cl-add-gem").value.trim(),
        organisatie: document.getElementById("cl-add-org").value.trim(),
        requiredForms: "",
        uitZorgDatum: "",
        inZorgDatum: "",
        medewerkerZoek: "",
        gedragswetenschapperZoek: "",
        zijbalkNotities: "",
        tabNotities: "",
        medewerkerEmpId: "",
        detailNotities: [],
        archived: false,
      };
      upsertClienten(client);
      if (typeof showSaveModal === "function") showSaveModal("Cliënt is opgeslagen.");
      else showToast("Cliënt opgeslagen");
      closeAdd();
      render();
    });

  tbody.addEventListener("click", function (e) {
    var t = e.target;
    var openRow = t && t.closest && t.closest("tr.cl-table-row--client[data-id]");
    if (openRow && t.closest) {
        if (t.closest('td[data-col="acties"]') || t.closest(".cl-row-check") || t.closest('input[type="checkbox"]') || t.closest("button") || t.closest("a")) {
        /* doorgave naar acties / selectie */
      } else {
        var oid = openRow.getAttribute("data-id");
        if (oid) {
          clPersistSession();
          window.location.href = "client-detail.html?id=" + encodeURIComponent(oid);
        }
        return;
      }
    }
    if (t && t.closest && t.closest(".cl-restore-btn")) {
      e.preventDefault();
      var id = t.closest(".cl-restore-btn").getAttribute("data-id");
      var list = (getClientenItems() || []).map(function (x) {
        if (x.id !== id) return x;
        return Object.assign({}, x, { archived: false });
      });
      if (typeof setClientenItems === "function") setClientenItems(list);
      if (typeof showSaveModal === "function") showSaveModal("Cliënt is hersteld.", "Hersteld");
      else showToast("Cliënt hersteld");
      render();
      return;
    }
    if (t && t.closest && t.closest(".cl-purge-btn")) {
      e.preventDefault();
      openPurge(t.closest(".cl-purge-btn").getAttribute("data-id"));
      return;
    }
    if (t && t.closest && t.closest(".cl-archive-btn")) {
      e.preventDefault();
      openArchive(t.closest(".cl-archive-btn").getAttribute("data-id"));
    }
  });

  function syncArSlider() {
    var s = document.getElementById("cl-ar-slider");
    var c = document.getElementById("cl-ar-confirm");
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    c.disabled = v < 100;
  }
  function syncPurgeSlider() {
    var s = document.getElementById("cl-purge-slider");
    var c = document.getElementById("cl-purge-confirm");
    if (!s || !c) return;
    var v = Math.min(100, Math.max(0, parseInt(s.value, 10) || 0));
    s.value = String(v);
    s.style.setProperty("--employee-slider-pct", v + "%");
    c.disabled = v < 100;
  }
  document.getElementById("cl-ar-slider") && document.getElementById("cl-ar-slider").addEventListener("input", syncArSlider);
  document.getElementById("cl-purge-slider") && document.getElementById("cl-purge-slider").addEventListener("input", syncPurgeSlider);
  document.getElementById("cl-ar-confirm") && document.getElementById("cl-ar-confirm").addEventListener("click", function () {
    if (!pendingArchiveId) return;
    var s = document.getElementById("cl-ar-slider");
    if (s && parseInt(s.value, 10) < 100) return;
    var list = (getClientenItems() || []).map(function (x) {
      if (x.id !== pendingArchiveId) return x;
      return Object.assign({}, x, { archived: true });
    });
    if (typeof setClientenItems === "function") setClientenItems(list);
    if (typeof showSaveModal === "function") showSaveModal("Cliënt is gearchiveerd.", "Gearchiveerd");
    else showToast("Cliënt gearchiveerd");
    closeArchive();
    render();
  });
  document.getElementById("cl-purge-confirm") && document.getElementById("cl-purge-confirm").addEventListener("click", function () {
    if (!pendingPurgeId) return;
    var s = document.getElementById("cl-purge-slider");
    if (s && parseInt(s.value, 10) < 100) return;
    if (typeof deleteClientenById === "function") deleteClientenById(pendingPurgeId);
    if (typeof showSaveModal === "function") showSaveModal("Cliënt is definitief verwijderd.", "Verwijderd");
    else showToast("Cliënt verwijderd");
    closePurge();
    render();
  });
  document.getElementById("cl-ar-close") && document.getElementById("cl-ar-close").addEventListener("click", closeArchive);
  document.getElementById("cl-ar-cancel") && document.getElementById("cl-ar-cancel").addEventListener("click", closeArchive);
  document.getElementById("cl-purge-close") && document.getElementById("cl-purge-close").addEventListener("click", closePurge);
  document.getElementById("cl-purge-cancel") && document.getElementById("cl-purge-cancel").addEventListener("click", closePurge);

  // Bug #40 fix: Escape + Overlay close voor alle 3 modals (add/archive/purge)
  // - Overlay-click sluit alleen wanneer op de overlay zelf geklikt (niet op modal-card)
  // - Escape sluit de bovenste open modal
  function clIsOpen(modalId) {
    var m = document.getElementById(modalId);
    return m && !m.hasAttribute("hidden");
  }
  ["cl-add-modal", "cl-archive-modal", "cl-purge-modal"].forEach(function (modalId) {
    var m = document.getElementById(modalId);
    if (!m) return;
    m.addEventListener("click", function (e) {
      if (e.target === m) {
        if (modalId === "cl-add-modal") closeAdd();
        else if (modalId === "cl-archive-modal") closeArchive();
        else if (modalId === "cl-purge-modal") closePurge();
      }
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    // Purge en archive eerst (kunnen open zijn boven add)
    if (clIsOpen("cl-purge-modal")) { closePurge(); e.stopPropagation(); return; }
    if (clIsOpen("cl-archive-modal")) { closeArchive(); e.stopPropagation(); return; }
    if (clIsOpen("cl-add-modal")) { closeAdd(); e.stopPropagation(); return; }
  });

  refreshClOrgDatalist();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de cache
  // heeft bijgewerkt. Zorgt dat een nieuwe browser/sessie ook direct alle
  // cliënten ziet zonder handmatige refresh.
  window.addEventListener("besa:clienten-updated", function () {
    try { render(); refreshClOrgDatalist(); } catch (e) { /* */ }
  });
})();
