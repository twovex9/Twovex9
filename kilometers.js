/* global window, document */
/**
 * kilometers.js — page-script voor kilometers.html. 1-op-1 BS2.
 *
 * BS2-model: één DECLARATIE = 1 medewerker × 1 maand
 * (status, total_kilometers, total_reimbursement, submitted_at,
 * submission_status) met per-dag RECORDS. Totalen komen VERBATIM uit
 * BS2 — niets herrekenen. Bron: window.kilometerDeclaratiesDB.
 *
 * Twee views: Overzicht (declaraties) en Detail (?decl=<id> → per-dag).
 * Read-only spiegel van BS2 (geen toevoegen/bewerken/verwijderen).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escAttr(s) { return escHtml(s); }

  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  function formatNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  function formatEur(n) {
    var v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(".", ",");
  }
  function formatKm(n) {
    var v = Number(n || 0);
    if (v === Math.floor(v)) return v.toFixed(0) + " km";
    return v.toFixed(2).replace(".", ",") + " km";
  }
  function formatPeriod(year, month) {
    if (!year || !month) return "—";
    return MONTHS_NL[month - 1].charAt(0).toUpperCase() + MONTHS_NL[month - 1].slice(1) + " " + year;
  }

  // Medewerkernaam: BS1-medewerker (via medewerker_id), anders BS2-employee
  // (de 3 declaraties die in BS2 zelf employee=null hebben → "—").
  function declNaam(d) {
    if (!d) return "—";
    if (d.medewerkerId && window.medewerkersDB) {
      try {
        var m = window.medewerkersDB.getByIdSync
          ? window.medewerkersDB.getByIdSync(d.medewerkerId)
          : (window.medewerkersDB.getAllSync() || []).find(function (x) { return x && String(x.id) === String(d.medewerkerId); });
        if (m) {
          var nm = ((m.voornaam || "") + " " + (m.achternaam || "")).trim();
          if (nm) return nm;
        }
      } catch (e) { /* */ }
    }
    if (d.bs2Employee && d.bs2Employee.name) return d.bs2Employee.name;
    return "—";
  }

  // Status komt VERBATIM uit BS2's submission_status (message+color+icon).
  // BS2 kent drie toestanden: submitted (groen "Ingediend op …"),
  // draft (geel "Nog niet ingediend"), locked (rood "Vergrendeld
  // (deadline verstreken)"). "Concept" bestaat NIET in BS2.
  function statusMeta(d) {
    var ss = (d && d.submissionStatus) || null;
    var st = (ss && ss.status) || (d && d.status) || "draft";
    var color = (ss && ss.color)
      || (st === "submitted" ? "green" : st === "locked" ? "red" : "yellow");
    var msg = (ss && ss.message)
      || (st === "submitted" ? "Ingediend"
        : st === "locked" ? "Vergrendeld (deadline verstreken)"
        : "Nog niet ingediend");
    var icon = (ss && ss.icon)
      || (st === "submitted" ? "checkmark" : st === "locked" ? "lock" : "warning");
    if (color !== "green" && color !== "yellow" && color !== "red") color = "yellow";
    return { status: st, color: color, message: msg, icon: icon };
  }
  function statusIconSvg(icon, size) {
    var s = size || 14;
    var head = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
    if (icon === "checkmark") {
      return head + '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    }
    if (icon === "lock") {
      return head + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    }
    return head + '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }
  // Korte label voor de overzicht-statuskolom (1-op-1 BS2-toestand).
  function statusShortLabel(meta) {
    if (meta.status === "submitted") return "Ingediend";
    if (meta.status === "locked") return "Vergrendeld";
    return "Nog niet ingediend";
  }

  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("km-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 1200);
  }

  // ---------------------------------------------------------------------------
  // Routing — ?decl=<declaratie-id>
  // ---------------------------------------------------------------------------
  function getRouteState() {
    var u = new URL(window.location.href);
    var decl = u.searchParams.get("decl");
    if (decl) return { mode: "detail", decl: decl };
    return { mode: "overview" };
  }
  function setRouteState(s) {
    var u = new URL(window.location.href);
    if (s.mode === "detail") {
      u.searchParams.set("decl", s.decl);
      u.searchParams.delete("med"); u.searchParams.delete("jaar"); u.searchParams.delete("maand");
    } else {
      u.searchParams.delete("decl");
      u.searchParams.delete("med"); u.searchParams.delete("jaar"); u.searchParams.delete("maand");
    }
    window.history.pushState({}, "", u.toString());
  }

  var state = {
    overview: { search: "", page: 1, pageSize: 50, sortKey: "periode", sortDir: "desc", filterMaand: "", filterJaar: "" },
    detail: { sortKey: "datum", sortDir: "asc", page: 1, pageSize: 50, decl: null },
  };

  function getDecls() {
    return window.kilometerDeclaratiesDB ? (window.kilometerDeclaratiesDB.getAllSync() || []) : [];
  }

  // ---------------------------------------------------------------------------
  // Overzicht — declaraties (1 rij = medewerker × maand), verbatim BS2-totalen
  // ---------------------------------------------------------------------------
  function renderOverview() {
    var rows = getDecls();
    if (state.overview.filterJaar) {
      var fj = parseInt(state.overview.filterJaar, 10);
      rows = rows.filter(function (a) { return a.jaar === fj; });
    }
    if (state.overview.filterMaand) {
      var fm = parseInt(state.overview.filterMaand, 10);
      rows = rows.filter(function (a) { return a.maand === fm; });
    }
    var q = state.overview.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(function (a) {
        var naam = declNaam(a).toLowerCase();
        var per = (a.monthDisplay || formatPeriod(a.jaar, a.maand)).toLowerCase();
        return naam.indexOf(q) !== -1 || per.indexOf(q) !== -1;
      });
    }
    var sk = state.overview.sortKey;
    var dir = state.overview.sortDir === "desc" ? -1 : 1;
    rows = rows.slice().sort(function (a, b) {
      if (sk === "medewerker") return declNaam(a).localeCompare(declNaam(b), "nl") * dir;
      if (sk === "periode") { if (a.jaar !== b.jaar) return (a.jaar - b.jaar) * dir; return (a.maand - b.maand) * dir; }
      if (sk === "status") return (((a.status === "submitted") ? 1 : 0) - ((b.status === "submitted") ? 1 : 0)) * dir;
      if (sk === "ingediend") return (((a.submittedAt ? Date.parse(a.submittedAt) : 0)) - ((b.submittedAt ? Date.parse(b.submittedAt) : 0))) * dir;
      if (sk === "km") return (a.totalKilometers - b.totalKilometers) * dir;
      if (sk === "bedrag") return (a.totalReimbursement - b.totalReimbursement) * dir;
      return 0;
    });

    var totalCount = rows.length, totalKm = 0, totalEur = 0;
    rows.forEach(function (a) { totalKm += Number(a.totalKilometers || 0); totalEur += Number(a.totalReimbursement || 0); });
    $("km-stat-count").textContent = totalCount;
    $("km-stat-km").textContent = (Math.round(totalKm * 100) / 100).toFixed(2).replace(".", ",");
    $("km-stat-bedrag").textContent = formatEur(totalEur);

    var ps = state.overview.pageSize;
    var total = rows.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (state.overview.page > maxPage) state.overview.page = maxPage;
    if (state.overview.page < 1) state.overview.page = 1;
    var start = (state.overview.page - 1) * ps;
    var pageRows = rows.slice(start, start + ps);

    var tbody = $("km-overview-tbody");
    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="incident-empty">Geen kilometer-declaraties gevonden</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(function (a) {
        var naam = declNaam(a);
        var sm = statusMeta(a);
        var statusPill = '<span class="km-status-pill km-status-pill--' + sm.color + '">'
          + statusIconSvg(sm.icon) + ' ' + escHtml(statusShortLabel(sm)) + '</span>';
        var ingOp = a.submittedAt ? formatNlDate(a.submittedAt) : "-";
        return '<tr class="km-overview-row" data-decl="' + escAttr(a.id) + '" tabindex="0" role="link">'
          + '<td data-col="medewerker">' + escHtml(naam) + '</td>'
          + '<td data-col="periode">' + escHtml(a.monthDisplay || formatPeriod(a.jaar, a.maand)) + '</td>'
          + '<td data-col="status">' + statusPill + '</td>'
          + '<td data-col="ingediend">' + escHtml(ingOp) + '</td>'
          + '<td data-col="km" class="td-num">' + formatKm(a.totalKilometers) + '</td>'
          + '<td data-col="bedrag" class="td-num">' + formatEur(a.totalReimbursement) + '</td>'
          + '</tr>';
      }).join("");
    }
    var rangeFrom = total === 0 ? 0 : start + 1;
    var rangeTo = Math.min(start + ps, total);
    $("km-overview-range").textContent = total === 0 ? "0 van 0" : (rangeFrom + "–" + rangeTo + " van " + total);
    $("km-overview-page").textContent = "Pagina " + state.overview.page + " van " + maxPage;
    $("km-overview-pager-first").disabled = state.overview.page <= 1;
    $("km-overview-pager-prev").disabled = state.overview.page <= 1;
    $("km-overview-pager-next").disabled = state.overview.page >= maxPage;
    $("km-overview-pager-last").disabled = state.overview.page >= maxPage;

    applyOverviewSortIndicators();
    applyOverviewColumnVisibility();
  }

  function applyOverviewSortIndicators() {
    document.querySelectorAll("#km-overview-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      var col = th.getAttribute("data-col");
      if (col === state.overview.sortKey) {
        th.classList.add(state.overview.sortDir === "desc" ? "is-sorted-desc" : "is-sorted-asc");
      }
    });
  }

  var OVERVIEW_COLUMNS = [
    { id: "medewerker", label: "Medewerker", defaultOn: true, skipToggle: true },
    { id: "periode", label: "Periode", defaultOn: true },
    { id: "status", label: "Status", defaultOn: true },
    { id: "ingediend", label: "Ingediend op", defaultOn: true },
    { id: "km", label: "Totale kilometers", defaultOn: true },
    { id: "bedrag", label: "Totale vergoeding", defaultOn: true },
  ];
  function setOverviewColumnVisible(colId, visible) {
    document.querySelectorAll('#km-overview-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyOverviewColumnVisibility() {
    document.querySelectorAll("#km-columns-list .column-toggle").forEach(function (btn) {
      setOverviewColumnVisible(btn.getAttribute("data-col"), btn.getAttribute("aria-checked") === "true");
    });
  }
  function buildOverviewColumnsPanel() {
    var list = $("km-columns-list");
    if (!list) return;
    list.innerHTML = "";
    OVERVIEW_COLUMNS.forEach(function (c) {
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

  // ---------------------------------------------------------------------------
  // Detail — per-dag records van één declaratie (verbatim BS2)
  // ---------------------------------------------------------------------------
  function renderDetail() {
    var declId = state.detail.decl;
    if (!declId) return;
    var d = window.kilometerDeclaratiesDB.getByIdSync(declId);
    if (!d) { $("km-detail-subtitle").textContent = "Declaratie niet gevonden"; return; }
    var recs = window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync(declId) || [];

    var sk = state.detail.sortKey;
    var dir = state.detail.sortDir === "desc" ? -1 : 1;
    recs = recs.slice().sort(function (a, b) {
      if (sk === "datum") return String(a.datum || "").localeCompare(String(b.datum || "")) * dir;
      if (sk === "type") return (a.typeDisplay || "").localeCompare(b.typeDisplay || "", "nl") * dir;
      if (sk === "beschrijving") return (a.beschrijving || "").localeCompare(b.beschrijving || "", "nl") * dir;
      if (sk === "kilometers") return (a.kilometers - b.kilometers) * dir;
      return 0;
    });

    var ps = state.detail.pageSize;
    var total = recs.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (state.detail.page > maxPage) state.detail.page = maxPage;
    if (state.detail.page < 1) state.detail.page = 1;
    var start = (state.detail.page - 1) * ps;
    var pageRows = recs.slice(start, start + ps);

    var naam = declNaam(d);
    var periodLabel = d.monthDisplay || formatPeriod(d.jaar, d.maand);
    $("km-detail-subtitle").textContent = periodLabel + " — " + naam;
    var statusEl = $("km-detail-status");
    var sm = statusMeta(d);
    statusEl.className = "km-detail-status km-detail-status--" + sm.color;
    statusEl.innerHTML = statusIconSvg(sm.icon, 16) + " " + escHtml(sm.message);

    var tbody = $("km-detail-tbody");
    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen ritten in deze maand-declaratie</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(function (r) {
        var typeLabel = (r.type === "office")
          ? '<span class="km-type-pill km-type-pill--kantoor"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg> ' + escHtml(r.typeDisplay || "Naar kantoor") + '</span>'
          : '<span class="km-type-pill km-type-pill--handmatig"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> ' + escHtml(r.typeDisplay || r.type || "Rit") + '</span>';
        return '<tr data-id="' + escAttr(r.id) + '">'
          + '<td data-col="datum">' + escHtml(formatNlDate(r.datum)) + '</td>'
          + '<td data-col="type">' + typeLabel + '</td>'
          + '<td data-col="beschrijving">' + escHtml(r.beschrijving || "—") + '</td>'
          + '<td data-col="locatie">' + escHtml(r.locatieNaam || "-") + '</td>'
          + '<td data-col="dienst">' + (r.isAutomatic ? "Automatisch" : "—") + '</td>'
          + '<td data-col="kilometers" class="td-num">' + formatKm(r.kilometers) + '</td>'
          + '<td data-col="acties" class="km-detail-actions"></td>'
          + '</tr>';
      }).join("");
    }
    var rangeFrom = total === 0 ? 0 : start + 1;
    var rangeTo = Math.min(start + ps, total);
    $("km-detail-range").textContent = total === 0 ? "0 van 0" : (rangeFrom + "–" + rangeTo + " van " + total);
    $("km-detail-page").textContent = "Pagina " + state.detail.page + " van " + maxPage;
    $("km-detail-pager-first").disabled = state.detail.page <= 1;
    $("km-detail-pager-prev").disabled = state.detail.page <= 1;
    $("km-detail-pager-next").disabled = state.detail.page >= maxPage;
    $("km-detail-pager-last").disabled = state.detail.page >= maxPage;

    // Totalen VERBATIM uit BS2 (declaratie-niveau), niet herrekend.
    $("km-totals-km").textContent = formatKm(d.totalKilometers);
    $("km-totals-bedrag").textContent = formatEur(d.totalReimbursement);

    applyDetailSortIndicators();
  }

  function applyDetailSortIndicators() {
    document.querySelectorAll("#km-detail-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      var col = th.getAttribute("data-col");
      if (col === state.detail.sortKey) {
        th.classList.add(state.detail.sortDir === "desc" ? "is-sorted-desc" : "is-sorted-asc");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // View switch
  // ---------------------------------------------------------------------------
  function showOverview() {
    $("km-overview-view").hidden = false;
    $("km-detail-view").hidden = true;
    state.detail.decl = null;
    setRouteState({ mode: "overview" });
    renderOverview();
  }
  function showDetail(declId) {
    state.detail.decl = declId;
    state.detail.page = 1;
    $("km-overview-view").hidden = true;
    $("km-detail-view").hidden = false;
    populateMaandJaarSelects();
    setRouteState({ mode: "detail", decl: declId });
    renderDetail();
  }

  // Maand/jaar-selects in de detail-header tonen de periode van de declaratie
  // (read-only spiegel: wisselen navigeert naar de declaratie van die
  // medewerker voor de gekozen maand/jaar, indien die bestaat).
  function populateMaandJaarSelects() {
    var maandSel = $("km-detail-maand");
    var jaarSel = $("km-detail-jaar");
    if (!maandSel || !jaarSel) return;
    if (!maandSel.options.length) {
      MONTHS_NL.forEach(function (m, i) {
        var opt = document.createElement("option");
        opt.value = String(i + 1);
        opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
        maandSel.appendChild(opt);
      });
    }
    if (!jaarSel.options.length) {
      for (var y = 2025; y <= 2030; y += 1) {
        var o = document.createElement("option");
        o.value = String(y); o.textContent = String(y);
        jaarSel.appendChild(o);
      }
    }
    var d = window.kilometerDeclaratiesDB.getByIdSync(state.detail.decl);
    if (d) { maandSel.value = String(d.maand); jaarSel.value = String(d.jaar); }
  }

  function gotoDeclByPeriode() {
    var d = window.kilometerDeclaratiesDB.getByIdSync(state.detail.decl);
    if (!d) return;
    var maand = parseInt($("km-detail-maand").value, 10);
    var jaar = parseInt($("km-detail-jaar").value, 10);
    var match = getDecls().find(function (x) {
      return x && String(x.medewerkerId) === String(d.medewerkerId)
        && x.jaar === jaar && x.maand === maand;
    });
    if (match) { showDetail(match.id); }
    else { toast("info", "Geen declaratie voor die medewerker in " + formatPeriod(jaar, maand)); populateMaandJaarSelects(); }
  }

  // ---------------------------------------------------------------------------
  // Sort-menus
  // ---------------------------------------------------------------------------
  function wireSortMenus(tableId, ctxKey) {
    document.querySelectorAll("#" + tableId + " .th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#" + tableId + " .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
        document.querySelectorAll("#" + tableId + " thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
        if (wasHidden) { menu.removeAttribute("hidden"); if (th) th.classList.add("th-sort-open"); }
      });
    });
    document.querySelectorAll("#" + tableId + " .th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = opt.getAttribute("data-action");
        var th = opt.closest("th");
        var col = th ? th.getAttribute("data-col") : null;
        if (!col || !action) return;
        if (action === "asc" || action === "desc") {
          state[ctxKey].sortKey = col;
          state[ctxKey].sortDir = action;
          state[ctxKey].page = 1;
          if (ctxKey === "overview") renderOverview(); else renderDetail();
        }
        document.querySelectorAll("#" + tableId + " .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
        document.querySelectorAll("#" + tableId + " thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
      });
    });
  }

  function wireUp() {
    $("km-search").addEventListener("input", function () { state.overview.search = this.value || ""; state.overview.page = 1; renderOverview(); });

    function syncFilterChipStyle(selectEl) {
      var wrap = selectEl.closest(".filter-chip-select-wrap");
      if (wrap) wrap.setAttribute("data-empty", selectEl.value ? "false" : "true");
    }
    function syncFilterResetVisibility() {
      var resetBtn = $("km-filter-reset");
      if (resetBtn) resetBtn.hidden = !(state.overview.filterMaand || state.overview.filterJaar);
    }
    var maandSelOv = $("km-filter-maand");
    var jaarSelOv = $("km-filter-jaar");
    if (maandSelOv) maandSelOv.addEventListener("change", function () {
      state.overview.filterMaand = this.value || ""; state.overview.page = 1;
      syncFilterChipStyle(this); syncFilterResetVisibility(); renderOverview();
    });
    if (jaarSelOv) jaarSelOv.addEventListener("change", function () {
      state.overview.filterJaar = this.value || ""; state.overview.page = 1;
      syncFilterChipStyle(this); syncFilterResetVisibility(); renderOverview();
    });
    var resetBtnOv = $("km-filter-reset");
    if (resetBtnOv) resetBtnOv.addEventListener("click", function () {
      state.overview.filterMaand = ""; state.overview.filterJaar = "";
      if (maandSelOv) { maandSelOv.value = ""; syncFilterChipStyle(maandSelOv); }
      if (jaarSelOv) { jaarSelOv.value = ""; syncFilterChipStyle(jaarSelOv); }
      syncFilterResetVisibility(); state.overview.page = 1; renderOverview();
    });

    $("km-overview-page-size").addEventListener("change", function () { state.overview.pageSize = parseInt(this.value, 10) || 50; state.overview.page = 1; renderOverview(); });
    $("km-overview-pager-first").addEventListener("click", function () { state.overview.page = 1; renderOverview(); });
    $("km-overview-pager-prev").addEventListener("click", function () { if (state.overview.page > 1) { state.overview.page--; renderOverview(); } });
    $("km-overview-pager-next").addEventListener("click", function () { state.overview.page++; renderOverview(); });
    $("km-overview-pager-last").addEventListener("click", function () { state.overview.page = 99999; renderOverview(); });
    $("km-overview-tbody").addEventListener("click", function (e) {
      var row = e.target && e.target.closest && e.target.closest("tr.km-overview-row");
      if (!row) return;
      var declId = row.getAttribute("data-decl");
      if (declId) showDetail(declId);
    });
    $("km-overview-tbody").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target && e.target.closest && e.target.closest("tr.km-overview-row");
      if (!row) return;
      e.preventDefault();
      var declId = row.getAttribute("data-decl");
      if (declId) showDetail(declId);
    });

    var colBtn = $("km-columns-menu-btn");
    var colPanel = $("km-columns-panel");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (colPanel.hasAttribute("hidden")) { colPanel.removeAttribute("hidden"); colBtn.setAttribute("aria-expanded", "true"); }
        else { colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false"); }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    var colList = $("km-columns-list");
    if (colList) colList.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest(".column-toggle");
      if (!t) return;
      t.classList.toggle("is-checked");
      t.setAttribute("aria-checked", t.classList.contains("is-checked") ? "true" : "false");
      applyOverviewColumnVisibility();
    });
    document.addEventListener("click", function () {
      if (colPanel) { colPanel.setAttribute("hidden", ""); if (colBtn) colBtn.setAttribute("aria-expanded", "false"); }
    });

    var exportBtn = $("km-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", function () {
      if (typeof window.besaExport !== "function") { toast("error", "Export-helper niet geladen"); return; }
      var data = getDecls().map(function (a) {
        return {
          Medewerker: declNaam(a),
          Periode: a.monthDisplay || formatPeriod(a.jaar, a.maand),
          Status: a.status === "submitted" ? "Ingediend" : "Concept",
          "Ingediend op": a.submittedAt ? formatNlDate(a.submittedAt) : "",
          "Totale kilometers": a.totalKilometers,
          "Totale vergoeding": Number(a.totalReimbursement || 0).toFixed(2),
        };
      });
      window.besaExport({
        filename: "kilometer-declaraties",
        title: "Kilometer declaraties",
        data: data,
        columns: ["Medewerker", "Periode", "Status", "Ingediend op", "Totale kilometers", "Totale vergoeding"],
      });
    });

    var bk = $("km-detail-back");
    if (bk) bk.addEventListener("click", function (e) { e.preventDefault(); showOverview(); });

    var dm = $("km-detail-maand"), dj = $("km-detail-jaar");
    if (dm) dm.addEventListener("change", gotoDeclByPeriode);
    if (dj) dj.addEventListener("change", gotoDeclByPeriode);
    $("km-detail-page-size").addEventListener("change", function () { state.detail.pageSize = parseInt(this.value, 10) || 50; state.detail.page = 1; renderDetail(); });
    $("km-detail-pager-first").addEventListener("click", function () { state.detail.page = 1; renderDetail(); });
    $("km-detail-pager-prev").addEventListener("click", function () { if (state.detail.page > 1) { state.detail.page--; renderDetail(); } });
    $("km-detail-pager-next").addEventListener("click", function () { state.detail.page++; renderDetail(); });
    $("km-detail-pager-last").addEventListener("click", function () { state.detail.page = 99999; renderDetail(); });

    // Read-only spiegel van BS2: geen toevoegen/bewerken/verwijderen.
    var addBtn = $("km-add-open-btn");
    if (addBtn) addBtn.hidden = true;

    wireSortMenus("km-overview-table", "overview");
    wireSortMenus("km-detail-table", "detail");
    document.addEventListener("click", function () {
      document.querySelectorAll(".th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll(".th-sort.th-sort-open").forEach(function (h) { h.classList.remove("th-sort-open"); });
    });

    window.addEventListener("besa:kilometer-declaraties-updated", function () {
      if ($("km-overview-view").hidden === false) renderOverview();
      if ($("km-detail-view").hidden === false) renderDetail();
    });
    window.addEventListener("besa:medewerkers-updated", function () {
      if ($("km-overview-view").hidden === false) renderOverview();
      if ($("km-detail-view").hidden === false) renderDetail();
    });
    window.addEventListener("popstate", function () {
      var s = getRouteState();
      if (s.mode === "detail") showDetail(s.decl); else showOverview();
    });
  }

  async function init() {
    buildOverviewColumnsPanel();
    wireUp();
    // Toon meteen de juiste view o.b.v. de URL — vóór de await. Anders flitst
    // een deep-link (?decl=<id>) eerst het overzicht: km-overview-view is
    // standaard zichtbaar en de besa:kilometer-declaraties-updated-events
    // renderen dat overzicht terwijl medewerkersDB.ready (traag) nog laadt.
    var s0 = getRouteState();
    if (s0.mode === "detail") {
      state.detail.decl = s0.decl;
      $("km-overview-view").hidden = true;
      $("km-detail-view").hidden = false;
    }
    try {
      await Promise.all([
        window.kilometerDeclaratiesDB && window.kilometerDeclaratiesDB.ready,
        window.medewerkersDB && window.medewerkersDB.ready,
      ]);
    } catch (e) { /* events herstellen de UI */ }
    var s = getRouteState();
    if (s.mode === "detail") showDetail(s.decl); else showOverview();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
