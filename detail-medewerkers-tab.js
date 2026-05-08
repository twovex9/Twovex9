/* global window, document */
/**
 * detail-medewerkers-tab.js — gedeelde Medewerkers-tab voor de detail-pagina's
 * van competenties, opleidingen en locaties (HR module).
 *
 * Render in `opts.container` een volledige medewerker-tabel (zoals op
 * HR > Medewerkers) maar gefilterd op de medewerkers die aan de geselecteerde
 * competentie / opleiding / locatie gekoppeld zijn.
 *
 * Bron-van-waarheid: window.medewerkersDB. Re-rendert automatisch bij
 * besa:medewerkers-updated, besa:locaties-updated, besa:bureaus-updated,
 * besa:competenties-updated, besa:opleidingen-updated.
 *
 * API:
 *   window.besaDetailMedewerkersTab.init({
 *     container,            // HTMLElement waarin de tab gerenderd wordt
 *     entityType,           // "competentie" | "opleiding" | "locatie"
 *     entityId,             // id van de entity
 *     getEntity,            // () => entityObject of null
 *     onCount,              // (n) => void  (optioneel — voor de kaart-teller)
 *     exportFilename,       // "competentie-stressbestendig" o.i.d.
 *     exportTitle,          // "Stressbestendig — Medewerkers"
 *   });
 */
(function (w) {
  "use strict";

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function normNaam(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function isPlaceholder(s) {
    if (!s) return true;
    if (/^[—–\-]+$/.test(s)) return true;
    if (s === "n.v.t." || s === "—") return true;
    if (/^\[(object|BLOCKED)/i.test(s)) return true;
    if (/^[A-Za-z0-9+/=]{40,}$/.test(s)) return true;
    return false;
  }

  function dedupSorted(arr) {
    var seen = Object.create(null);
    var out = [];
    arr.forEach(function (s) {
      var t = String(s == null ? "" : s).trim();
      if (!t || isPlaceholder(t)) return;
      var k = t.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
    });
    out.sort(function (a, b) { return a.localeCompare(b, "nl", { sensitivity: "base" }); });
    return out;
  }

  function getMedewerkers() {
    if (w.medewerkersDB && typeof w.medewerkersDB.getAllSync === "function") {
      try { return w.medewerkersDB.getAllSync() || []; } catch (e) { /* */ }
    }
    try {
      var raw = localStorage.getItem("employeeItems") || localStorage.getItem("employees");
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function empOpleidingNamen(emp) {
    var names = [];
    function pushFromArr(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(function (x) {
        var n = x && typeof x === "object" ? x.naam : x;
        if (n) names.push(String(n));
      });
    }
    pushFromArr(emp.opleidingItemsSkj);
    pushFromArr(emp.opleidingItemsTraining);
    pushFromArr(emp.opleidingItems);
    if (emp.opleiding) names.push(String(emp.opleiding));
    return names;
  }

  function empLocatieNamen(emp) {
    var names = [];
    if (Array.isArray(emp.locatiesSelected)) {
      emp.locatiesSelected.forEach(function (x) { if (x) names.push(String(x)); });
    } else if (typeof emp.locatiesTags === "string" && emp.locatiesTags) {
      emp.locatiesTags.split(",").forEach(function (x) {
        var t = x.trim(); if (t) names.push(t);
      });
    }
    if (emp.locatie) names.push(String(emp.locatie));
    if (Array.isArray(emp.locaties)) {
      emp.locaties.forEach(function (x) { if (x) names.push(String(x)); });
    }
    var dataExt = emp.data || emp._data || {};
    if (Array.isArray(dataExt.locaties)) {
      dataExt.locaties.forEach(function (x) { if (x) names.push(String(x)); });
    }
    if (dataExt.locatie) names.push(String(dataExt.locatie));
    return names;
  }

  function empBureauNamen(emp) {
    var names = [];
    if (emp.bureau) names.push(String(emp.bureau));
    if (Array.isArray(emp.bureaus)) {
      emp.bureaus.forEach(function (x) { if (x) names.push(String(x)); });
    }
    var dataExt = emp.data || emp._data || {};
    if (dataExt.bureau) names.push(String(dataExt.bureau));
    if (Array.isArray(dataExt.bureaus)) {
      dataExt.bureaus.forEach(function (x) { if (x) names.push(String(x)); });
    }
    return names;
  }

  function empCompList(emp) {
    if (Array.isArray(emp.competenties)) return emp.competenties.map(String);
    if (emp.competentie) return [String(emp.competentie)];
    return [];
  }

  /**
   * Bepaal of medewerker `emp` gekoppeld is aan de gegeven entity.
   *  - competentie: match op id in emp.competenties[] OF naam in emp.competentie
   *  - opleiding:  match op naam in emp.opleidingItems / opleidingItemsSkj / opleidingItemsTraining / emp.opleiding
   *  - locatie:    match op naam in emp.locatiesSelected[] of emp.locatiesTags
   */
  function isLinked(emp, entityType, entity) {
    if (!emp || !entity) return false;
    if (entityType === "competentie") {
      var id = String(entity.id || "");
      var naam = normNaam(entity.naam);
      var list = empCompList(emp);
      for (var i = 0; i < list.length; i += 1) {
        var v = list[i];
        if (v === id) return true;
        if (normNaam(v) === naam) return true;
      }
      return false;
    }
    if (entityType === "opleiding") {
      var n2 = normNaam(entity.naam);
      if (!n2) return false;
      var names = empOpleidingNamen(emp);
      for (var j = 0; j < names.length; j += 1) {
        if (normNaam(names[j]) === n2) return true;
      }
      return false;
    }
    if (entityType === "locatie") {
      var n3 = normNaam(entity.naam);
      if (!n3) return false;
      var lnames = empLocatieNamen(emp);
      for (var k = 0; k < lnames.length; k += 1) {
        if (normNaam(lnames[k]) === n3) return true;
      }
      return false;
    }
    return false;
  }

  function fmtFullName(emp) {
    var v = (emp.voornaam || "").trim();
    var a = (emp.achternaam || "").trim();
    return (v + " " + a).trim() || (emp.email || "Medewerker");
  }

  function buildSelectedEmployeePayload(emp) {
    return {
      empId: emp.id || emp.empId || "",
      voornaam: emp.voornaam || "",
      achternaam: emp.achternaam || "",
      email: emp.email || "",
      tel: emp.tel || "",
      fase: emp.fase || "In dienst",
      dienstverband: emp.dienstverband || "",
      functie: emp.functie || "",
      opleiding: emp.opleiding || "",
      startdatum: emp.startdatum || "",
      verjaardag: emp.verjaardag || "",
      overigeInfo: emp.overigeInfo || "",
    };
  }

  /** Uniek prefix per entity-type voor element-id's. */
  function prefixFor(entityType) {
    if (entityType === "competentie") return "comp-mt";
    if (entityType === "opleiding") return "opl-mt";
    if (entityType === "locatie") return "loc-mt";
    return "ent-mt";
  }

  // ────────────────────────────────────────────────────────────────────────
  // Render-skelet
  // ────────────────────────────────────────────────────────────────────────
  function renderSkeleton(container, prefix) {
    container.innerHTML =
      '<div class="emp-section det-mt-section">' +
        '<div class="det-mt-header">' +
          '<h3>Medewerkers</h3>' +
          '<div class="det-mt-actions">' +
            '<div class="columns-dropdown det-mt-cols">' +
              '<button class="btn-outline columns-btn" type="button" aria-expanded="false" aria-haspopup="true" id="' + prefix + '-cols-btn" aria-label="Kolommen">' +
                '<svg class="btn-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' +
                ' Kolommen' +
              '</button>' +
              '<div class="columns-panel" id="' + prefix + '-cols-panel" role="menu" aria-labelledby="' + prefix + '-cols-btn" hidden>' +
                '<div class="columns-panel-title">Kolommen weergeven</div>' +
                '<ul class="columns-list" role="none">' +
                  '<li role="none"><button type="button" class="column-toggle is-checked" data-col="email" role="menuitemcheckbox" aria-checked="true"><span class="column-check" aria-hidden="true">✓</span> E-mailadres</button></li>' +
                  '<li role="none"><button type="button" class="column-toggle is-checked" data-col="tel" role="menuitemcheckbox" aria-checked="true"><span class="column-check" aria-hidden="true">✓</span> Tel.</button></li>' +
                '</ul>' +
              '</div>' +
            '</div>' +
            '<button class="btn-outline" type="button" id="' + prefix + '-export-btn">' +
              '<svg class="btn-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
              ' Exporteren' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="toolbar det-mt-toolbar">' +
          '<input class="search" type="search" id="' + prefix + '-search" placeholder="Zoeken..." autocomplete="off" />' +
          '<label class="switch switch--yellow">' +
            '<input type="checkbox" id="' + prefix + '-archived" />' +
            '<span class="switch-slider"></span>' +
            '<span class="switch-label">Gearchiveerd</span>' +
          '</label>' +
          '<label class="switch switch--red">' +
            '<input type="checkbox" id="' + prefix + '-vereist-actie" />' +
            '<span class="switch-slider"></span>' +
            '<span class="switch-label">Vereist actie</span>' +
          '</label>' +
          '<div class="filter-chips det-mt-chips">' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-locatie">Locatie</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-bureau">Bureau</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-contracttype">Contracttype</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-fase">Fase</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-dienstverband">Dienstverband</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-competenties">Competenties</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-functie">Functie</button>' +
            '<button type="button" class="filter-chip" id="' + prefix + '-chip-opleiding">Opleiding</button>' +
          '</div>' +
        '</div>' +
        '<section class="table-card">' +
          '<div class="table-wrapper">' +
            '<table class="employees-table det-mt-table" id="' + prefix + '-table">' +
              '<thead>' +
                '<tr>' +
                  '<th data-col="email" class="th-sort">' +
                    '<div class="th-sort-inner">' +
                      '<span class="th-label">E-mailadres</span>' +
                      '<button type="button" class="th-sort-trigger" aria-label="Sorteren E-mailadres"><span class="th-sort-arrows" aria-hidden="true"></span></button>' +
                    '</div>' +
                  '</th>' +
                  '<th data-col="tel" class="th-sort">' +
                    '<div class="th-sort-inner">' +
                      '<span class="th-label">Tel.</span>' +
                      '<button type="button" class="th-sort-trigger" aria-label="Sorteren Tel."><span class="th-sort-arrows" aria-hidden="true"></span></button>' +
                    '</div>' +
                  '</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="' + prefix + '-tbody"></tbody>' +
            '</table>' +
          '</div>' +
          '<div class="table-footer table-footer--pagebar">' +
            '<div class="footer-left">' +
              '<span id="' + prefix + '-pager-range" class="pager-range">50 of 0 total.</span>' +
            '</div>' +
            '<div class="footer-right">' +
              '<label class="footer-rows-wrap" for="' + prefix + '-rows-per-page">' +
                '<span class="footer-rows-label">Rows per page</span>' +
                '<select id="' + prefix + '-rows-per-page" class="footer-rows-select" aria-label="Rijen per pagina">' +
                  '<option value="10">10</option>' +
                  '<option value="15">15</option>' +
                  '<option value="30">30</option>' +
                  '<option value="50" selected>50</option>' +
                '</select>' +
              '</label>' +
              '<span id="' + prefix + '-pager-page" class="pager-page-label">Page 1 of 1</span>' +
              '<span class="pager" role="navigation" aria-label="Paginatie">' +
                '<button type="button" class="pager-btn" id="' + prefix + '-pager-first" disabled>&laquo;</button>' +
                '<button type="button" class="pager-btn" id="' + prefix + '-pager-prev" disabled>&lsaquo;</button>' +
                '<button type="button" class="pager-btn" id="' + prefix + '-pager-next" disabled>&rsaquo;</button>' +
                '<button type="button" class="pager-btn" id="' + prefix + '-pager-last" disabled>&raquo;</button>' +
              '</span>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';
  }

  // ────────────────────────────────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────────────────────────────────
  function init(opts) {
    if (!opts || !opts.container || !opts.entityType || !opts.entityId) return;

    var container = opts.container;
    var entityType = opts.entityType;
    var entityId = String(opts.entityId);
    var getEntity = typeof opts.getEntity === "function" ? opts.getEntity : function () { return null; };
    var onCount = typeof opts.onCount === "function" ? opts.onCount : function () {};
    var exportFilename = opts.exportFilename || (entityType + "-medewerkers");
    var exportTitle = opts.exportTitle || "Medewerkers";

    var prefix = prefixFor(entityType);
    renderSkeleton(container, prefix);

    var $ = function (id) { return document.getElementById(id); };
    var searchEl = $(prefix + "-search");
    var archivedEl = $(prefix + "-archived");
    var vereistEl = $(prefix + "-vereist-actie");
    var tbodyEl = $(prefix + "-tbody");
    var rangeEl = $(prefix + "-pager-range");
    var pageEl = $(prefix + "-pager-page");
    var firstBtn = $(prefix + "-pager-first");
    var prevBtn = $(prefix + "-pager-prev");
    var nextBtn = $(prefix + "-pager-next");
    var lastBtn = $(prefix + "-pager-last");
    var rowsSel = $(prefix + "-rows-per-page");
    var colsBtn = $(prefix + "-cols-btn");
    var colsPanel = $(prefix + "-cols-panel");
    var exportBtn = $(prefix + "-export-btn");
    var tableEl = $(prefix + "-table");

    // State
    var state = {
      page: 1,
      rowsPerPage: 50,
      search: "",
      archived: false,
      vereistActie: false,
      filters: { locatie: null, bureau: null, contracttype: null, fase: null, dienstverband: null, competentie: null, functie: null, opleiding: null },
      sort: { col: null, dir: null },
      visibleCols: { email: true, tel: true },
    };

    var chips = {};

    function getEntityNow() { try { return getEntity(); } catch (e) { return null; } }

    function getLinkedEmployees() {
      var entity = getEntityNow();
      if (!entity) return [];
      return getMedewerkers().filter(function (e) { return isLinked(e, entityType, entity); });
    }

    function applyFilters(list) {
      var q = (state.search || "").trim().toLowerCase();
      var f = state.filters;
      return list.filter(function (e) {
        // Archived toggle: standaard alleen actieven; bij archief alleen archived.
        if (state.archived) { if (!e.archived) return false; }
        else { if (e.archived) return false; }
        // Vereist actie: alleen tonen als die flag aanstaat. Veld kan
        // 'vereistActie' of 'vereist_actie' zijn — we accepteren beide.
        if (state.vereistActie) {
          var va = e.vereistActie || e.vereist_actie || (e.data && (e.data.vereistActie || e.data.vereist_actie));
          if (!va) return false;
        }
        if (q) {
          var hay = [e.voornaam, e.achternaam, e.email, e.tel].join(" ").toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        if (f.locatie && empLocatieNamen(e).map(normNaam).indexOf(normNaam(f.locatie)) === -1) return false;
        if (f.bureau && empBureauNamen(e).map(normNaam).indexOf(normNaam(f.bureau)) === -1) return false;
        if (f.contracttype && (e.contracttype || "") !== f.contracttype) return false;
        if (f.fase && (e.fase || "").trim() !== f.fase) return false;
        if (f.dienstverband && (e.dienstverband || "") !== f.dienstverband) return false;
        if (f.competentie) {
          var cl = empCompList(e).map(normNaam);
          if (cl.indexOf(normNaam(f.competentie)) === -1) return false;
        }
        if (f.functie && (e.functie || "") !== f.functie) return false;
        if (f.opleiding) {
          var ol = empOpleidingNamen(e).map(normNaam);
          if (ol.indexOf(normNaam(f.opleiding)) === -1) return false;
        }
        return true;
      });
    }

    function applySort(list) {
      if (!state.sort.col) return list;
      var col = state.sort.col;
      var dir = state.sort.dir === "desc" ? -1 : 1;
      var copy = list.slice();
      copy.sort(function (a, b) {
        var av = String(a[col] == null ? "" : a[col]).toLowerCase();
        var bv = String(b[col] == null ? "" : b[col]).toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
      return copy;
    }

    function renderTable() {
      var linked = getLinkedEmployees();
      onCount(linked.length);

      var filtered = applyFilters(linked);
      filtered = applySort(filtered);

      // Paginering
      var rpp = state.rowsPerPage;
      var totalPages = Math.max(1, Math.ceil(filtered.length / rpp));
      if (state.page > totalPages) state.page = totalPages;
      if (state.page < 1) state.page = 1;
      var start = (state.page - 1) * rpp;
      var end = Math.min(filtered.length, start + rpp);
      var slice = filtered.slice(start, end);

      // Body
      if (!slice.length) {
        tbodyEl.innerHTML =
          '<tr class="det-mt-empty-row"><td colspan="2" class="det-mt-empty">Geen resultaten gevonden</td></tr>';
      } else {
        tbodyEl.innerHTML = slice.map(function (e) {
          var empId = String(e.id || e.empId || "");
          var emailHtml = state.visibleCols.email
            ? '<td data-col="email" class="det-mt-td det-mt-td-email">' + escHtml(e.email || "") + '</td>'
            : '';
          var telHtml = state.visibleCols.tel
            ? '<td data-col="tel" class="det-mt-td det-mt-td-tel">' + escHtml(e.tel || "") + '</td>'
            : '';
          return '<tr class="det-mt-row" data-emp-id="' + escHtml(empId) + '" tabindex="0" role="link">' + emailHtml + telHtml + '</tr>';
        }).join("");
      }

      // Header kolom-tonen/verbergen
      var thead = tableEl.querySelector("thead");
      if (thead) {
        thead.querySelectorAll("th").forEach(function (th) {
          var col = th.getAttribute("data-col");
          if (!col) return;
          th.classList.toggle("col-hidden", !state.visibleCols[col]);
        });
      }

      // Range / paging labels
      if (rangeEl) {
        if (filtered.length === 0) {
          rangeEl.textContent = "0 of 0 total.";
        } else {
          rangeEl.textContent = (start + 1) + "-" + end + " of " + filtered.length + " total.";
        }
      }
      if (pageEl) pageEl.textContent = "Page " + state.page + " of " + totalPages;
      if (firstBtn) firstBtn.disabled = state.page <= 1;
      if (prevBtn) prevBtn.disabled = state.page <= 1;
      if (nextBtn) nextBtn.disabled = state.page >= totalPages;
      if (lastBtn) lastBtn.disabled = state.page >= totalPages;
    }

    // ── Filter-chips wiring ──
    function rebuildChips() {
      if (!w.besaFilterChips || typeof w.besaFilterChips.createSearchSelectChip !== "function") return;
      var allEmps = getMedewerkers();
      var optsFromDB = function (db, key) {
        var items = (db && typeof db.getAllSync === "function") ? db.getAllSync() || [] : [];
        return dedupSorted(items.filter(function (i) { return i && !i.archived; }).map(function (i) { return i[key] || ""; }))
          .map(function (v) { return { value: v, label: v }; });
      };
      var optsFromEmp = function (key) {
        return dedupSorted(allEmps.map(function (e) { return e && e[key]; }))
          .map(function (v) { return { value: v, label: v }; });
      };

      var defs = [
        { key: "locatie",       btn: prefix + "-chip-locatie",       label: "Locatie",       options: optsFromDB(w.locatiesDB, "naam"),       clearLabel: "Alle locaties tonen" },
        { key: "bureau",        btn: prefix + "-chip-bureau",        label: "Bureau",        options: optsFromDB(w.bureausDB, "naam"),        clearLabel: "Alle bureaus tonen" },
        { key: "contracttype",  btn: prefix + "-chip-contracttype",  label: "Contracttype",  options: optsFromEmp("contracttype"),            clearLabel: "Alle contracttypes tonen" },
        { key: "fase",          btn: prefix + "-chip-fase",          label: "Fase",          options: optsFromEmp("fase"),                    clearLabel: "Alle fases tonen" },
        { key: "dienstverband", btn: prefix + "-chip-dienstverband", label: "Dienstverband", options: optsFromEmp("dienstverband"),           clearLabel: "Alle dienstverbanden tonen" },
        { key: "competentie",   btn: prefix + "-chip-competenties",  label: "Competenties",  options: optsFromDB(w.competentiesDB, "naam"),   clearLabel: "Alle competenties tonen" },
        { key: "functie",       btn: prefix + "-chip-functie",       label: "Functie",       options: optsFromEmp("functie"),                 clearLabel: "Alle functies tonen" },
        { key: "opleiding",     btn: prefix + "-chip-opleiding",     label: "Opleiding",     options: optsFromDB(w.opleidingenDB, "naam"),    clearLabel: "Alle opleidingen tonen" },
      ];

      defs.forEach(function (d) {
        var btn = $(d.btn);
        if (!btn) return;
        if (btn.dataset.chipInited === "1") return;
        btn.dataset.chipInited = "1";
        chips[d.key] = w.besaFilterChips.createSearchSelectChip({
          button: btn,
          label: d.label,
          options: d.options,
          clearLabel: d.clearLabel,
          onChange: function (v) {
            state.filters[d.key] = v || null;
            state.page = 1;
            renderTable();
          },
        });
      });
    }

    // ── Toolbar events ──
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        state.search = searchEl.value || "";
        state.page = 1;
        renderTable();
      });
    }
    if (archivedEl) {
      archivedEl.addEventListener("change", function () {
        state.archived = !!archivedEl.checked;
        state.page = 1;
        renderTable();
      });
    }
    if (vereistEl) {
      vereistEl.addEventListener("change", function () {
        state.vereistActie = !!vereistEl.checked;
        state.page = 1;
        renderTable();
      });
    }
    if (rowsSel) {
      rowsSel.addEventListener("change", function () {
        var n = parseInt(rowsSel.value, 10);
        state.rowsPerPage = isFinite(n) && n > 0 ? n : 50;
        state.page = 1;
        renderTable();
      });
    }
    if (firstBtn) firstBtn.addEventListener("click", function () { state.page = 1; renderTable(); });
    if (prevBtn) prevBtn.addEventListener("click", function () { state.page = Math.max(1, state.page - 1); renderTable(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { state.page = state.page + 1; renderTable(); });
    if (lastBtn) lastBtn.addEventListener("click", function () { state.page = 1e9; renderTable(); });

    // Sortering via th-sort-trigger
    tableEl.querySelectorAll("th.th-sort").forEach(function (th) {
      var trigger = th.querySelector(".th-sort-trigger");
      if (!trigger) return;
      trigger.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var col = th.getAttribute("data-col");
        if (!col) return;
        if (state.sort.col === col) {
          state.sort.dir = state.sort.dir === "asc" ? "desc" : (state.sort.dir === "desc" ? null : "asc");
          if (!state.sort.dir) state.sort.col = null;
        } else {
          state.sort.col = col;
          state.sort.dir = "asc";
        }
        tableEl.querySelectorAll("th.th-sort").forEach(function (h) {
          h.classList.remove("th-sort--asc", "th-sort--desc");
          h.removeAttribute("aria-sort");
        });
        if (state.sort.col === col) {
          th.classList.add(state.sort.dir === "desc" ? "th-sort--desc" : "th-sort--asc");
          th.setAttribute("aria-sort", state.sort.dir === "desc" ? "descending" : "ascending");
        }
        renderTable();
      });
    });

    // Kolommen-dropdown
    if (colsBtn && colsPanel) {
      colsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = !colsPanel.hasAttribute("hidden");
        if (open) { colsPanel.setAttribute("hidden", ""); colsBtn.setAttribute("aria-expanded", "false"); }
        else { colsPanel.removeAttribute("hidden"); colsBtn.setAttribute("aria-expanded", "true"); }
      });
      colsPanel.querySelectorAll(".column-toggle[data-col]").forEach(function (b) {
        b.addEventListener("click", function () {
          var col = b.getAttribute("data-col");
          if (!col) return;
          var nowChecked = !b.classList.contains("is-checked");
          // Voorkom dat beide kolommen tegelijk verborgen worden
          if (!nowChecked) {
            var anyOther = false;
            Object.keys(state.visibleCols).forEach(function (k) {
              if (k !== col && state.visibleCols[k]) anyOther = true;
            });
            if (!anyOther) return;
          }
          b.classList.toggle("is-checked", nowChecked);
          b.setAttribute("aria-checked", nowChecked ? "true" : "false");
          state.visibleCols[col] = nowChecked;
          renderTable();
        });
      });
      // Sluit panel bij klik buiten
      document.addEventListener("click", function (e) {
        if (colsPanel.hasAttribute("hidden")) return;
        if (!colsPanel.contains(e.target) && e.target !== colsBtn && !colsBtn.contains(e.target)) {
          colsPanel.setAttribute("hidden", "");
          colsBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    // Exporteren
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        if (typeof w.besaExport !== "function") {
          if (typeof w.showActionFeedback === "function") {
            w.showActionFeedback("error", "Export niet beschikbaar", "besa-export.js niet geladen.");
          }
          return;
        }
        var rows = applySort(applyFilters(getLinkedEmployees()));
        var data = rows.map(function (e) {
          return {
            "Voornaam": e.voornaam || "",
            "Achternaam": e.achternaam || "",
            "E-mailadres": e.email || "",
            "Tel.": e.tel || "",
            "Fase": e.fase || "",
            "Functie": e.functie || "",
          };
        });
        w.besaExport({
          filename: exportFilename,
          title: exportTitle,
          data: data,
          columns: ["Voornaam", "Achternaam", "E-mailadres", "Tel.", "Fase", "Functie"],
        });
      });
    }

    // Klik op rij = open medewerker
    function openEmpFromRow(tr) {
      if (!tr) return;
      var empId = tr.getAttribute("data-emp-id") || "";
      var all = getMedewerkers();
      var emp = all.find(function (x) { return String(x.id || x.empId || "") === empId; });
      if (!emp) return;
      try {
        w.sessionStorage.setItem("selectedEmployee", JSON.stringify(buildSelectedEmployeePayload(emp)));
      } catch (e) { /* */ }
      w.location.href = "medewerker.html";
    }
    tbodyEl.addEventListener("click", function (e) {
      if (e.target.closest("button, a, input, select, textarea, label")) return;
      var tr = e.target.closest("tr.det-mt-row");
      if (!tr || !tbodyEl.contains(tr)) return;
      openEmpFromRow(tr);
    });
    tbodyEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var tr = e.target.closest("tr.det-mt-row");
      if (!tr || !tbodyEl.contains(tr)) return;
      e.preventDefault();
      openEmpFromRow(tr);
    });

    // Re-render bij relevante data-events
    var REFRESH_EVENTS = [
      "besa:medewerkers-updated",
      "besa:locaties-updated",
      "besa:bureaus-updated",
      "besa:competenties-updated",
      "besa:opleidingen-updated",
    ];
    REFRESH_EVENTS.forEach(function (ev) {
      w.addEventListener(ev, function () { rebuildChips(); renderTable(); });
    });

    // Eerste render + chips
    rebuildChips();
    renderTable();

    return {
      refresh: function () { rebuildChips(); renderTable(); },
    };
  }

  w.besaDetailMedewerkersTab = { init: init };
})(window);
