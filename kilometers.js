/* global window, document */
/**
 * kilometers.js — page-script voor kilometers.html.
 *
 * Bron-van-waarheid: window.kilometerDeclaratiesDB.
 * Twee views op één pagina:
 *   - Overzicht (default): aggregaten per medewerker per maand
 *   - Detail (?med=<id>&jaar=<n>&maand=<n>): individuele ritten in die maand
 *
 * Detail wordt geopend door op een rij in het overzicht te klikken.
 * URL ?-params worden gebruikt zodat browser-back/forward werkt.
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
  var MONTHS_NL_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

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

  function getMedewerkerNaam(id) {
    if (!id) return "—";
    if (!window.medewerkersDB) return id;
    try {
      var m = window.medewerkersDB.getByIdSync ? window.medewerkersDB.getByIdSync(id) :
        (window.medewerkersDB.getAllSync() || []).find(function (x) { return x && String(x.id) === String(id); });
      if (!m) return "—";
      return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "—";
    } catch (e) { return id; }
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
  // Routing via query-params
  // ---------------------------------------------------------------------------
  function getRouteState() {
    var u = new URL(window.location.href);
    var med = u.searchParams.get("med");
    var jaar = parseInt(u.searchParams.get("jaar") || "", 10);
    var maand = parseInt(u.searchParams.get("maand") || "", 10);
    if (med && jaar && maand) return { mode: "detail", med: med, jaar: jaar, maand: maand };
    return { mode: "overview" };
  }

  function setRouteState(state) {
    var u = new URL(window.location.href);
    if (state.mode === "detail") {
      u.searchParams.set("med", state.med);
      u.searchParams.set("jaar", state.jaar);
      u.searchParams.set("maand", state.maand);
    } else {
      u.searchParams.delete("med");
      u.searchParams.delete("jaar");
      u.searchParams.delete("maand");
    }
    window.history.pushState({}, "", u.toString());
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    overview: { search: "", page: 1, pageSize: 50, sortKey: "periode", sortDir: "desc", filterMaand: "", filterJaar: "" },
    detail: { sortKey: "datum", sortDir: "desc", page: 1, pageSize: 50, editingId: null, purgingId: null, med: null, jaar: null, maand: null },
  };

  // ---------------------------------------------------------------------------
  // Overview rendering
  // ---------------------------------------------------------------------------
  function renderOverview() {
    var aggs = window.kilometerDeclaratiesDB ? window.kilometerDeclaratiesDB.getMonthlyAggregatesSync() : [];
    // Apply jaar/maand filter (chips)
    if (state.overview.filterJaar) {
      var fj = parseInt(state.overview.filterJaar, 10);
      aggs = aggs.filter(function (a) { return a.year === fj; });
    }
    if (state.overview.filterMaand) {
      var fm = parseInt(state.overview.filterMaand, 10);
      aggs = aggs.filter(function (a) { return a.month === fm; });
    }
    // Apply search
    var q = state.overview.search.trim().toLowerCase();
    if (q) {
      aggs = aggs.filter(function (a) {
        var naam = getMedewerkerNaam(a.medewerker_id).toLowerCase();
        var period = formatPeriod(a.year, a.month).toLowerCase();
        return naam.indexOf(q) !== -1 || period.indexOf(q) !== -1;
      });
    }
    // Sort
    var sk = state.overview.sortKey;
    var dir = state.overview.sortDir === "desc" ? -1 : 1;
    aggs.sort(function (a, b) {
      if (sk === "medewerker") {
        return getMedewerkerNaam(a.medewerker_id).localeCompare(getMedewerkerNaam(b.medewerker_id), "nl") * dir;
      }
      if (sk === "periode") {
        if (a.year !== b.year) return (a.year - b.year) * dir;
        return (a.month - b.month) * dir;
      }
      if (sk === "status") {
        return ((a.ingediend ? 1 : 0) - (b.ingediend ? 1 : 0)) * dir;
      }
      if (sk === "ingediend") {
        var at = a.ingediend_op ? Date.parse(a.ingediend_op) : 0;
        var bt = b.ingediend_op ? Date.parse(b.ingediend_op) : 0;
        return (at - bt) * dir;
      }
      if (sk === "km") return (a.totaleKm - b.totaleKm) * dir;
      if (sk === "bedrag") return (a.totaleVergoeding - b.totaleVergoeding) * dir;
      return 0;
    });

    // Stats (van de gefilterde set)
    var totalCount = 0, totalKm = 0, totalEur = 0;
    aggs.forEach(function (a) {
      totalCount += a.declaratiesCount;
      totalKm += a.totaleKm;
      totalEur += a.totaleVergoeding;
    });
    $("km-stat-count").textContent = totalCount;
    $("km-stat-km").textContent = totalKm.toFixed(2).replace(".", ",");
    $("km-stat-bedrag").textContent = formatEur(totalEur);

    // Pagination
    var ps = state.overview.pageSize;
    var total = aggs.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (state.overview.page > maxPage) state.overview.page = maxPage;
    if (state.overview.page < 1) state.overview.page = 1;
    var start = (state.overview.page - 1) * ps;
    var rows = aggs.slice(start, start + ps);

    var tbody = $("km-overview-tbody");
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="incident-empty">Geen kilometer-declaraties gevonden</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function (a) {
        var naam = getMedewerkerNaam(a.medewerker_id);
        var statusPill = a.ingediend
          ? '<span class="km-status-pill km-status-pill--ingediend"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Ingediend</span>'
          : '<span class="km-status-pill km-status-pill--nietingediend"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Niet ingediend</span>';
        var ingediendOp = a.ingediend_op ? formatNlDate(a.ingediend_op) : "-";
        return '<tr class="km-overview-row" data-med="' + escAttr(a.medewerker_id || "") + '" data-jaar="' + a.year + '" data-maand="' + a.month + '" tabindex="0" role="link">'
          + '<td data-col="medewerker">' + escHtml(naam) + '</td>'
          + '<td data-col="periode">' + escHtml(formatPeriod(a.year, a.month)) + '</td>'
          + '<td data-col="status">' + statusPill + '</td>'
          + '<td data-col="ingediend">' + escHtml(ingediendOp) + '</td>'
          + '<td data-col="km" class="td-num">' + formatKm(a.totaleKm) + '</td>'
          + '<td data-col="bedrag" class="td-num">' + formatEur(a.totaleVergoeding) + '</td>'
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

  // ---------------------------------------------------------------------------
  // Overview kolommen panel
  // ---------------------------------------------------------------------------
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
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setOverviewColumnVisible(colId, isOn);
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
  // Detail rendering
  // ---------------------------------------------------------------------------
  function renderDetail() {
    var ctx = state.detail;
    var med = ctx.med, jaar = ctx.jaar, maand = ctx.maand;
    if (!med || !jaar || !maand) return;
    var rows = window.kilometerDeclaratiesDB ? window.kilometerDeclaratiesDB.getForMedewerkerSync(med, jaar, maand) : [];
    // Sort
    var sk = ctx.sortKey;
    var dir = ctx.sortDir === "desc" ? -1 : 1;
    rows.sort(function (a, b) {
      if (sk === "datum") {
        return ((Date.parse(a.datum) || 0) - (Date.parse(b.datum) || 0)) * dir;
      }
      if (sk === "type") return (a.type || "").localeCompare(b.type || "", "nl") * dir;
      if (sk === "beschrijving") return (a.beschrijving || "").localeCompare(b.beschrijving || "", "nl") * dir;
      if (sk === "kilometers") return (a.kilometers - b.kilometers) * dir;
      return 0;
    });
    // Pagination
    var ps = ctx.pageSize;
    var total = rows.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (ctx.page > maxPage) ctx.page = maxPage;
    if (ctx.page < 1) ctx.page = 1;
    var start = (ctx.page - 1) * ps;
    var pageRows = rows.slice(start, start + ps);

    // Header
    var naam = getMedewerkerNaam(med);
    var periodLabel = formatPeriod(jaar, maand);
    $("km-detail-subtitle").textContent = periodLabel + " - " + naam;
    var allIngediend = total > 0 && rows.every(function (r) { return r.ingediend; });
    var statusEl = $("km-detail-status");
    if (allIngediend) {
      statusEl.className = "km-detail-status km-detail-status--ingediend";
      statusEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Ingediend';
    } else {
      statusEl.className = "km-detail-status km-detail-status--nietingediend";
      statusEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Nog niet ingediend';
    }

    // Body
    var TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    var EDIT_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var tbody = $("km-detail-tbody");
    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen kilometer-declaraties in deze periode</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(function (r) {
        var typeLabel = r.type === "kantoor"
          ? '<span class="km-type-pill km-type-pill--kantoor"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg> Kantoor</span>'
          : '<span class="km-type-pill km-type-pill--handmatig"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Handmatig</span>';
        return '<tr data-id="' + escAttr(r.id) + '">'
          + '<td data-col="datum">' + escHtml(formatNlDate(r.datum)) + '</td>'
          + '<td data-col="type">' + typeLabel + '</td>'
          + '<td data-col="beschrijving">' + escHtml(r.beschrijving || "—") + '</td>'
          + '<td data-col="locatie">' + escHtml(r.locatie || "-") + '</td>'
          + '<td data-col="dienst">' + escHtml(r.dienst || "-") + '</td>'
          + '<td data-col="kilometers" class="td-num">' + formatKm(r.kilometers) + '</td>'
          + '<td data-col="acties" class="km-detail-actions">'
          +   '<button type="button" class="km-row-edit" data-id="' + escAttr(r.id) + '" aria-label="Bewerken">' + EDIT_SVG + '</button>'
          +   '<button type="button" class="employee-delete-btn km-row-purge" data-id="' + escAttr(r.id) + '" aria-label="Verwijderen">' + TRASH_SVG + '</button>'
          + '</td>'
          + '</tr>';
      }).join("");
    }
    var rangeFrom = total === 0 ? 0 : start + 1;
    var rangeTo = Math.min(start + ps, total);
    $("km-detail-range").textContent = total === 0 ? "0 van 0" : (rangeFrom + "–" + rangeTo + " van " + total);
    $("km-detail-page").textContent = "Pagina " + ctx.page + " van " + maxPage;
    $("km-detail-pager-first").disabled = ctx.page <= 1;
    $("km-detail-pager-prev").disabled = ctx.page <= 1;
    $("km-detail-pager-next").disabled = ctx.page >= maxPage;
    $("km-detail-pager-last").disabled = ctx.page >= maxPage;

    // Totals
    var sumKm = 0, sumEur = 0;
    rows.forEach(function (r) {
      sumKm += Number(r.kilometers || 0);
      sumEur += window.kilometerDeclaratiesDB.calcVergoeding(Number(r.kilometers || 0));
    });
    $("km-totals-km").textContent = formatKm(sumKm);
    $("km-totals-bedrag").textContent = formatEur(sumEur);

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
    state.detail.med = state.detail.jaar = state.detail.maand = null;
    setRouteState({ mode: "overview" });
    renderOverview();
  }

  function showDetail(med, jaar, maand) {
    state.detail.med = med;
    state.detail.jaar = jaar;
    state.detail.maand = maand;
    state.detail.page = 1;
    $("km-overview-view").hidden = true;
    $("km-detail-view").hidden = false;
    populateMaandJaarSelects();
    setRouteState({ mode: "detail", med: med, jaar: jaar, maand: maand });
    renderDetail();
  }

  function populateMaandJaarSelects() {
    var maandSel = $("km-detail-maand");
    var jaarSel = $("km-detail-jaar");
    if (!maandSel.options.length) {
      MONTHS_NL.forEach(function (m, i) {
        var opt = document.createElement("option");
        opt.value = String(i + 1);
        opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
        maandSel.appendChild(opt);
      });
    }
    if (!jaarSel.options.length) {
      // Vaste range 2025-2030 — consistent met overview-filter chips.
      for (var y = 2025; y <= 2030; y += 1) {
        var opt2 = document.createElement("option");
        opt2.value = String(y);
        opt2.textContent = String(y);
        jaarSel.appendChild(opt2);
      }
    }
    maandSel.value = String(state.detail.maand);
    jaarSel.value = String(state.detail.jaar);
  }

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function showModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var first = m.querySelector("input, textarea, select, button.km-choice-card");
    if (first) { try { first.focus(); first.select && first.select(); } catch (e) { /* */ } }
  }
  function hideModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }

  // ---------------------------------------------------------------------------
  // Add flow
  // ---------------------------------------------------------------------------
  function openAddChoice() { showModal("km-add-choice-modal"); }
  function closeAddChoice() { hideModal("km-add-choice-modal"); }
  function openAddManual() {
    closeAddChoice();
    var d = $("km-add-manual-datum");
    var iso = new Date().toISOString().slice(0, 10);
    d.value = iso;
    $("km-add-manual-beschr").value = "";
    $("km-add-manual-locatie").value = "";
    $("km-add-manual-dienst").value = "";
    $("km-add-manual-km").value = "";
    var err = $("km-add-manual-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("km-add-manual-modal");
  }
  function openAddKantoor() {
    closeAddChoice();
    var d = $("km-add-kantoor-datum");
    d.value = new Date().toISOString().slice(0, 10);
    $("km-add-kantoor-beschr").value = "Woon-werkverkeer (heen en terug)";
    $("km-add-kantoor-km").value = "";
    var err = $("km-add-kantoor-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("km-add-kantoor-modal");
  }

  async function submitAdd(form, type) {
    var prefix = type === "kantoor" ? "km-add-kantoor" : "km-add-manual";
    var datum = $(prefix + "-datum").value;
    var km = parseFloat($(prefix + "-km").value);
    var err = $(prefix + "-error");
    if (!datum) { err.hidden = false; err.textContent = "Datum is verplicht."; return; }
    if (!isFinite(km) || km < 0) { err.hidden = false; err.textContent = "Vul een geldig aantal kilometers in."; return; }
    var beschr = $(prefix + "-beschr").value || "";
    var locatie = type === "kantoor" ? "Kantoor" : ($(prefix + "-locatie").value || "");
    var dienst = type === "kantoor" ? "" : ($(prefix + "-dienst").value || "");
    var btn = $(prefix + "-submit");
    btn.disabled = true;
    var orig = btn.textContent; btn.textContent = "Bezig…";
    try {
      var med = state.detail.med || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync().medewerker_id) || null;
      await window.kilometerDeclaratiesDB.add({
        medewerker_id: med,
        datum: datum,
        type: type,
        beschrijving: beschr,
        locatie: locatie,
        dienst: dienst,
        kilometers: km,
      });
      toast("saved", "Declaratie toegevoegd");
      hideModal(prefix + "-modal");
    } catch (e) {
      err.hidden = false; err.textContent = "Toevoegen mislukt: " + (e && e.message ? e.message : String(e));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // Edit + Delete flows
  // ---------------------------------------------------------------------------
  function openEdit(id) {
    var rec = window.kilometerDeclaratiesDB.getByIdSync(id);
    if (!rec) return;
    state.detail.editingId = id;
    $("km-edit-id").value = id;
    $("km-edit-datum").value = rec.datum || "";
    $("km-edit-beschr").value = rec.beschrijving || "";
    $("km-edit-locatie").value = rec.locatie || "";
    $("km-edit-dienst").value = rec.dienst || "";
    $("km-edit-km").value = rec.kilometers || 0;
    var err = $("km-edit-error"); if (err) { err.hidden = true; err.textContent = ""; }
    showModal("km-edit-modal");
  }
  async function submitEdit(ev) {
    ev.preventDefault();
    var id = state.detail.editingId; if (!id) return;
    var datum = $("km-edit-datum").value;
    var km = parseFloat($("km-edit-km").value);
    var err = $("km-edit-error");
    if (!datum) { err.hidden = false; err.textContent = "Datum is verplicht."; return; }
    if (!isFinite(km) || km < 0) { err.hidden = false; err.textContent = "Vul een geldig aantal kilometers in."; return; }
    var btn = $("km-edit-submit");
    btn.disabled = true;
    var orig = btn.textContent; btn.textContent = "Bezig…";
    try {
      await window.kilometerDeclaratiesDB.update(id, {
        datum: datum,
        beschrijving: $("km-edit-beschr").value || "",
        locatie: $("km-edit-locatie").value || "",
        dienst: $("km-edit-dienst").value || "",
        kilometers: km,
      });
      toast("saved", "Declaratie bijgewerkt");
      hideModal("km-edit-modal");
      state.detail.editingId = null;
    } catch (e) {
      err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  function openPurge(id) {
    var rec = window.kilometerDeclaratiesDB.getByIdSync(id);
    if (!rec) return;
    state.detail.purgingId = id;
    $("km-purge-preview").textContent = formatNlDate(rec.datum) + " — " + (rec.beschrijving || "(geen beschrijving)");
    var s = $("km-purge-slider"); s.value = 0; s.style.setProperty("--employee-slider-pct", "0%");
    $("km-purge-confirm").disabled = true;
    showModal("km-purge-modal");
  }
  async function confirmPurge() {
    var id = state.detail.purgingId; if (!id) return;
    hideModal("km-purge-modal");
    state.detail.purgingId = null;
    try {
      await window.kilometerDeclaratiesDB.delete(id);
      toast("deleted", "Declaratie verwijderd");
    } catch (e) {
      toast("error", "Verwijderen mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireSliderConfirm(sliderId, btnId) {
    var slider = $(sliderId);
    var btn = $(btnId);
    if (!slider || !btn) return;
    slider.addEventListener("input", function () {
      var v = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", v + "%");
      btn.disabled = v < 100;
    });
  }

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
        if (wasHidden) {
          menu.removeAttribute("hidden");
          if (th) th.classList.add("th-sort-open");
        }
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
    // Overview
    $("km-search").addEventListener("input", function () { state.overview.search = this.value || ""; state.overview.page = 1; renderOverview(); });

    // Filter chips: maand + jaar — bij selectie filteren + chip stylen als 'gevuld'.
    function syncFilterChipStyle(selectEl) {
      var wrap = selectEl.closest(".filter-chip-select-wrap");
      if (wrap) wrap.setAttribute("data-empty", selectEl.value ? "false" : "true");
    }
    function syncFilterResetVisibility() {
      var hasFilter = !!(state.overview.filterMaand || state.overview.filterJaar);
      var resetBtn = $("km-filter-reset");
      if (resetBtn) resetBtn.hidden = !hasFilter;
    }
    var maandSelOv = $("km-filter-maand");
    var jaarSelOv = $("km-filter-jaar");
    if (maandSelOv) maandSelOv.addEventListener("change", function () {
      state.overview.filterMaand = this.value || "";
      state.overview.page = 1;
      syncFilterChipStyle(this);
      syncFilterResetVisibility();
      renderOverview();
    });
    if (jaarSelOv) jaarSelOv.addEventListener("change", function () {
      state.overview.filterJaar = this.value || "";
      state.overview.page = 1;
      syncFilterChipStyle(this);
      syncFilterResetVisibility();
      renderOverview();
    });
    var resetBtnOv = $("km-filter-reset");
    if (resetBtnOv) resetBtnOv.addEventListener("click", function () {
      state.overview.filterMaand = "";
      state.overview.filterJaar = "";
      if (maandSelOv) { maandSelOv.value = ""; syncFilterChipStyle(maandSelOv); }
      if (jaarSelOv) { jaarSelOv.value = ""; syncFilterChipStyle(jaarSelOv); }
      syncFilterResetVisibility();
      state.overview.page = 1;
      renderOverview();
    });

    $("km-overview-page-size").addEventListener("change", function () { state.overview.pageSize = parseInt(this.value, 10) || 50; state.overview.page = 1; renderOverview(); });
    $("km-overview-pager-first").addEventListener("click", function () { state.overview.page = 1; renderOverview(); });
    $("km-overview-pager-prev").addEventListener("click", function () { if (state.overview.page > 1) { state.overview.page--; renderOverview(); } });
    $("km-overview-pager-next").addEventListener("click", function () { state.overview.page++; renderOverview(); });
    $("km-overview-pager-last").addEventListener("click", function () { state.overview.page = 99999; renderOverview(); });
    $("km-overview-tbody").addEventListener("click", function (e) {
      var row = e.target && e.target.closest && e.target.closest("tr.km-overview-row");
      if (!row) return;
      var med = row.getAttribute("data-med");
      var jaar = parseInt(row.getAttribute("data-jaar"), 10);
      var maand = parseInt(row.getAttribute("data-maand"), 10);
      if (med && jaar && maand) showDetail(med, jaar, maand);
    });

    // Kolommen
    var colBtn = $("km-columns-menu-btn");
    var colPanel = $("km-columns-panel");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var hidden = colPanel.hasAttribute("hidden");
        if (hidden) { colPanel.removeAttribute("hidden"); colBtn.setAttribute("aria-expanded", "true"); }
        else { colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false"); }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    $("km-columns-list").addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest(".column-toggle");
      if (!t) return;
      t.classList.toggle("is-checked");
      var on = t.classList.contains("is-checked");
      t.setAttribute("aria-checked", on ? "true" : "false");
      applyOverviewColumnVisibility();
    });
    document.addEventListener("click", function () {
      if (colPanel) {
        colPanel.setAttribute("hidden", "");
        if (colBtn) colBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Export
    $("km-export-btn").addEventListener("click", function () {
      if (typeof window.besaExport !== "function") {
        toast("error", "Export-helper niet geladen");
        return;
      }
      var aggs = window.kilometerDeclaratiesDB.getMonthlyAggregatesSync();
      var data = aggs.map(function (a) {
        return {
          Medewerker: getMedewerkerNaam(a.medewerker_id),
          Periode: formatPeriod(a.year, a.month),
          Status: a.ingediend ? "Ingediend" : "Niet ingediend",
          "Ingediend op": a.ingediend_op ? formatNlDate(a.ingediend_op) : "",
          "Totale kilometers": a.totaleKm,
          "Totale vergoeding": a.totaleVergoeding.toFixed(2),
        };
      });
      window.besaExport({
        filename: "kilometer-declaraties",
        title: "Kilometer declaraties",
        data: data,
        columns: ["Medewerker", "Periode", "Status", "Ingediend op", "Totale kilometers", "Totale vergoeding"],
      });
    });

    // Detail period selectors
    $("km-detail-maand").addEventListener("change", function () {
      state.detail.maand = parseInt(this.value, 10);
      setRouteState({ mode: "detail", med: state.detail.med, jaar: state.detail.jaar, maand: state.detail.maand });
      renderDetail();
    });
    $("km-detail-jaar").addEventListener("change", function () {
      state.detail.jaar = parseInt(this.value, 10);
      setRouteState({ mode: "detail", med: state.detail.med, jaar: state.detail.jaar, maand: state.detail.maand });
      renderDetail();
    });
    $("km-detail-page-size").addEventListener("change", function () { state.detail.pageSize = parseInt(this.value, 10) || 50; state.detail.page = 1; renderDetail(); });
    $("km-detail-pager-first").addEventListener("click", function () { state.detail.page = 1; renderDetail(); });
    $("km-detail-pager-prev").addEventListener("click", function () { if (state.detail.page > 1) { state.detail.page--; renderDetail(); } });
    $("km-detail-pager-next").addEventListener("click", function () { state.detail.page++; renderDetail(); });
    $("km-detail-pager-last").addEventListener("click", function () { state.detail.page = 99999; renderDetail(); });

    // Detail row actions
    $("km-detail-tbody").addEventListener("click", function (e) {
      var editBtn = e.target && e.target.closest && e.target.closest(".km-row-edit");
      if (editBtn) { openEdit(editBtn.getAttribute("data-id")); return; }
      var purgeBtn = e.target && e.target.closest && e.target.closest(".km-row-purge");
      if (purgeBtn) { openPurge(purgeBtn.getAttribute("data-id")); return; }
    });

    // Add modal
    $("km-add-open-btn").addEventListener("click", openAddChoice);
    $("km-add-choice-close").addEventListener("click", closeAddChoice);
    $("km-add-choice-cancel").addEventListener("click", closeAddChoice);
    $("km-choice-handmatig").addEventListener("click", openAddManual);
    $("km-choice-kantoor").addEventListener("click", openAddKantoor);

    $("km-add-manual-close").addEventListener("click", function () { hideModal("km-add-manual-modal"); });
    $("km-add-manual-cancel").addEventListener("click", function () { hideModal("km-add-manual-modal"); });
    $("km-add-manual-form").addEventListener("submit", function (e) { e.preventDefault(); submitAdd(e.target, "handmatig"); });

    $("km-add-kantoor-close").addEventListener("click", function () { hideModal("km-add-kantoor-modal"); });
    $("km-add-kantoor-cancel").addEventListener("click", function () { hideModal("km-add-kantoor-modal"); });
    $("km-add-kantoor-form").addEventListener("submit", function (e) { e.preventDefault(); submitAdd(e.target, "kantoor"); });

    // Edit
    $("km-edit-close").addEventListener("click", function () { hideModal("km-edit-modal"); });
    $("km-edit-cancel").addEventListener("click", function () { hideModal("km-edit-modal"); });
    $("km-edit-form").addEventListener("submit", submitEdit);

    // Purge
    $("km-purge-close").addEventListener("click", function () { hideModal("km-purge-modal"); });
    $("km-purge-cancel").addEventListener("click", function () { hideModal("km-purge-modal"); });
    wireSliderConfirm("km-purge-slider", "km-purge-confirm");
    $("km-purge-confirm").addEventListener("click", confirmPurge);

    // Modal-overlay click sluit
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute("aria-hidden", "true");
          if (!document.querySelector(".modal-overlay:not([hidden])")) {
            document.body.classList.remove("modal-open");
          }
        }
      });
    });

    wireSortMenus("km-overview-table", "overview");
    wireSortMenus("km-detail-table", "detail");
    document.addEventListener("click", function () {
      document.querySelectorAll(".th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll(".th-sort.th-sort-open").forEach(function (h) { h.classList.remove("th-sort-open"); });
    });

    // Live re-render
    window.addEventListener("besa:kilometer-declaraties-updated", function () {
      if ($("km-overview-view").hidden === false) renderOverview();
      if ($("km-detail-view").hidden === false) renderDetail();
    });
    window.addEventListener("besa:medewerkers-updated", function () {
      if ($("km-overview-view").hidden === false) renderOverview();
    });
    window.addEventListener("popstate", function () {
      var s = getRouteState();
      if (s.mode === "detail") showDetail(s.med, s.jaar, s.maand);
      else showOverview();
    });
  }

  function init() {
    buildOverviewColumnsPanel();
    wireUp();
    var s = getRouteState();
    if (s.mode === "detail") showDetail(s.med, s.jaar, s.maand);
    else showOverview();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
