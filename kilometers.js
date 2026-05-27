/* global window, document */
/**
 * kilometers.js — page-script voor kilometers.html. 1-op-1 BS2.
 *
 * BS2-model: één DECLARATIE = 1 medewerker × 1 maand
 * (submission_status drie-staat: submitted/draft/locked) met per-dag
 * RECORDS. Bron: window.kilometerDeclaratiesDB.
 *
 * Twee views: Overzicht (declaraties) en Detail (?decl=<id> → per-dag).
 * Een DRAFT (geel "Nog niet ingediend", deadline niet verstreken) is
 * bewerkbaar: ritten toevoegen/bewerken/verwijderen → de data-laag
 * herrekent + persist de totalen (Σ min(rit,100)×€0,39, 1-op-1 BS2).
 * submitted (groen) en locked (rood "Vergrendeld") zijn read-only en
 * houden de VERBATIM BS2-totalen.
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
  // Bewerkbaar = 1-op-1 BS2: alleen een draft die NIET ingediend en NIET
  // vergrendeld is (deadline niet verstreken). submitted/locked = read-only.
  // BS1-uitbreiding (user-eis 2026-05-26 "te laat is te laat"): client-side
  // checken we ook of de 10e-deadline al gepasseerd is. Daarna geen mutaties.
  function isDeclEditable(d) {
    if (!d) return false;
    if (statusMeta(d).status !== "draft") return false;
    var db = window.kilometerDeclaratiesDB;
    if (db && typeof db.isDeadlinePassed === "function") {
      if (db.isDeadlinePassed(d.jaar, d.maand)) return false;
    }
    return true;
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

    var editable = isDeclEditable(d);
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
          + '<td data-col="acties" class="km-detail-actions">'
          + (editable
            ? '<button type="button" class="km-row-edit" data-rec="' + escAttr(r.id) + '" aria-label="Bewerken" title="Bewerken"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
              + '<button type="button" class="employee-delete-btn km-row-del" data-rec="' + escAttr(r.id) + '" aria-label="Verwijderen" title="Verwijderen"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>'
            : '')
          + '</td>'
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

    // Totalen op declaratie-niveau. Bewerkbare (draft) declaraties worden
    // door de data-laag herrekend + gepersist (Σ min(rit,100)×€0,39);
    // ingediend/vergrendeld blijven VERBATIM BS2. Toon altijd de
    // opgeslagen declaratie-waarde.
    $("km-totals-km").textContent = formatKm(d.totalKilometers);
    $("km-totals-bedrag").textContent = formatEur(d.totalReimbursement);

    var addBtn = $("km-add-open-btn");
    if (addBtn) {
      addBtn.hidden = false;
      addBtn.disabled = !editable;
      addBtn.classList.toggle("is-disabled", !editable);
    }

    renderDeadlineAndSubmit(d, editable);
    applyDetailSortIndicators();
  }

  // ---------------------------------------------------------------------------
  // Indien-knop + deadline-banner (Fase 1).
  // Deadline = 10e van de volgende maand. Hard: na deadline kan niet meer
  // ingediend worden (user-eis 2026-05-26 "te laat is te laat").
  // ---------------------------------------------------------------------------
  function renderDeadlineAndSubmit(d, editable) {
    var banner = $("km-deadline-banner");
    var submitBtn = $("km-submit-btn");
    if (!banner || !submitBtn || !d) return;

    var db = window.kilometerDeclaratiesDB;
    if (!db || typeof db.getDeadlineFor !== "function") {
      banner.hidden = true; submitBtn.hidden = true; return;
    }

    var deadline = db.getDeadlineFor(d.jaar, d.maand);
    var now = new Date();
    var deadlinePassed = db.isDeadlinePassed(d.jaar, d.maand, now);
    var isSubmitted = d.status === "submitted" || (d.submissionStatus && d.submissionStatus.status === "submitted");
    var recs = (db.getRecordsForDeclaratieSync && db.getRecordsForDeclaratieSync(d.id)) || [];

    banner.className = "km-deadline-banner";
    if (isSubmitted) {
      banner.classList.add("km-deadline-banner--info");
      banner.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        + ' Ingediend op ' + formatNlDate(d.submittedAt) + '. Verdere wijzigingen zijn niet meer mogelijk.';
      banner.hidden = false;
      submitBtn.hidden = true;
    } else if (deadlinePassed) {
      banner.classList.add("km-deadline-banner--locked");
      banner.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        + ' Deadline verstreken op ' + formatNlDate(deadline.toISOString()) + '. Te laat is te laat — deze maand-declaratie is definitief gesloten.';
      banner.hidden = false;
      submitBtn.hidden = true;
    } else {
      banner.classList.add("km-deadline-banner--warning");
      banner.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        + ' Deze declaratie moet uiterlijk <strong>' + formatNlDate(deadline.toISOString()) + '</strong> worden ingediend. Daarna is wijzigen niet meer mogelijk.';
      banner.hidden = false;
      // Indien-knop tonen als er records zijn en editable
      submitBtn.hidden = false;
      submitBtn.disabled = !(editable && recs.length > 0);
      submitBtn.title = recs.length === 0 ? "Voeg eerst minimaal 1 rit toe voor je kunt indienen" : "";
    }
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

  // ---------------------------------------------------------------------------
  // Record-CRUD voor bewerkbare (draft) declaraties — 1-op-1 BS2-flow:
  // Toevoegen → keuze (Handmatige invoer / Naar kantoor) → formulier;
  // per rij Bewerken (potlood) + Verwijderen (prullenbak, slider-confirm).
  // De data-laag herrekent + persist de totalen (Σ min(rit,100)×€0,39).
  // ---------------------------------------------------------------------------
  function openModal(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = false;
    el.removeAttribute("hidden");
    el.setAttribute("aria-hidden", "false");
    var f = el.querySelector("input, select, textarea, button");
    if (f) { try { f.focus(); } catch (e) { /* */ } }
  }
  function closeModal(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
  }
  function setErr(id, msg) {
    var e = $(id);
    if (!e) return;
    if (msg) { e.textContent = msg; e.hidden = false; }
    else { e.textContent = ""; e.hidden = true; }
  }
  function currentDecl() {
    return state.detail.decl
      ? window.kilometerDeclaratiesDB.getByIdSync(state.detail.decl)
      : null;
  }
  function recordById(recId) {
    var d = currentDecl();
    if (!d) return null;
    var recs = window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync(d.id) || [];
    return recs.find(function (r) { return r && String(r.id) === String(recId); }) || null;
  }
  function fillLocatieSelect() {
    var sel = $("km-add-kantoor-locatie");
    if (!sel) return;
    var locs = [];
    try {
      if (window.locatiesDB && window.locatiesDB.getAllSync) {
        locs = (window.locatiesDB.getAllSync() || []).filter(function (l) { return l && !l.archived; });
      }
    } catch (e) { /* */ }
    sel.innerHTML = '<option value="">Selecteer Locaties</option>'
      + locs.map(function (l) {
        return '<option value="' + escAttr(l.id) + '">' + escHtml(l.naam || l.name || "Locatie") + '</option>';
      }).join("");
  }

  // ---------------------------------------------------------------------------
  // Indienen-flow (Fase 1)
  // ---------------------------------------------------------------------------
  function handleSubmitDeclaratie() {
    var d = currentDecl();
    if (!d) return;
    var db = window.kilometerDeclaratiesDB;
    if (!db || typeof db.submitDecl !== "function") {
      toast("error", "Indienen niet beschikbaar — data-laag mist submitDecl");
      return;
    }
    if (!db.isSubmittable(d)) {
      toast("error", "Deze declaratie kan niet (meer) ingediend worden.");
      return;
    }
    var recs = db.getRecordsForDeclaratieSync(d.id) || [];
    var totalKm = recs.reduce(function (s, r) { return s + (Number(r.kilometers) || 0); }, 0);
    var preview = recs.length + " rit(en) · " + formatKm(totalKm) + " · " + formatEur(d.totalReimbursement);
    Promise.resolve(
      typeof window.showSliderConfirmModal === "function"
        ? window.showSliderConfirmModal({
          title: "Declaratie indienen?",
          message: "Na indienen kun je geen ritten meer wijzigen of toevoegen voor deze maand.",
          preview: preview,
          okLabel: "Indienen",
          cancelLabel: "Annuleren",
        })
        : window.confirm("Declaratie indienen?")
    ).then(function (ok) {
      if (!ok) return;
      return db.submitDecl(d.id).then(function () {
        toast("info", "Declaratie ingediend");
        renderDetail();
        renderOverview();
      });
    }).catch(function (err) {
      toast("error", "Indienen mislukt: " + (err && err.message ? err.message : err));
    });
  }

  // ---------------------------------------------------------------------------
  // Woon-werk dag-aanvink modal (Fase 2)
  //
  // Toont een kalender van de huidige declaratie-maand. Per aangevinkte dag
  // wordt bij submit een woon-werk record toegevoegd met km =
  // medewerker.location_distance × 2 (heen + terug). Dagen die al een
  // bestaand record hebben (type=office of automatic) worden pre-checked en
  // disabled (om dubbele invoer te voorkomen).
  // ---------------------------------------------------------------------------
  var _wwState = { selectedDates: {}, perDayKm: 0, distance: null, mw: null, locked: {} };

  function openWoonwerkModal() {
    var d = currentDecl();
    if (!d) return;
    var mw = window.medewerkersDB && window.medewerkersDB.getByIdSync
      ? window.medewerkersDB.getByIdSync(d.medewerkerId)
      : null;
    var distance = mw && mw.location_distance != null ? Number(mw.location_distance) : null;
    _wwState.mw = mw;
    _wwState.distance = distance;
    _wwState.perDayKm = distance != null ? distance * 2 : 0;
    _wwState.selectedDates = {};
    _wwState.locked = {};

    // Reeds bestaande office-records → pre-selected + disabled
    var existing = (window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync(d.id) || [])
      .filter(function (r) { return r && (r.type === "office" || r.isAutomatic); });
    existing.forEach(function (r) {
      if (r.datum) { _wwState.selectedDates[r.datum] = true; _wwState.locked[r.datum] = true; }
    });

    var distEl = $("km-woonwerk-distance");
    var retEl = $("km-woonwerk-retour");
    var hint = $("km-woonwerk-hint");
    var noDist = $("km-woonwerk-no-distance");
    if (distance == null) {
      distEl.textContent = "Niet ingesteld";
      retEl.textContent = "—";
      noDist.hidden = false;
      hint.style.opacity = "0.5";
    } else {
      distEl.textContent = nlNum(distance) + " km";
      retEl.textContent = nlNum(_wwState.perDayKm) + " km";
      noDist.hidden = true;
      hint.style.opacity = "1";
    }

    buildWoonwerkGrid(d.jaar, d.maand);
    refreshWoonwerkTotals();
    setErr("km-add-woonwerk-error", "");
    openModal("km-add-woonwerk-modal");
  }

  function buildWoonwerkGrid(jaar, maand) {
    var grid = $("km-woonwerk-grid");
    if (!grid) return;
    grid.innerHTML = "";
    // Header-rij
    ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].forEach(function (lbl) {
      var h = document.createElement("div");
      h.className = "km-woonwerk-grid-header";
      h.textContent = lbl;
      grid.appendChild(h);
    });
    var firstOfMonth = new Date(jaar, maand - 1, 1);
    var daysInMonth = new Date(jaar, maand, 0).getDate();
    // JS getDay: zo=0,ma=1,…,za=6 — wij willen ma=0,…,zo=6
    var pad = (firstOfMonth.getDay() + 6) % 7;
    for (var i = 0; i < pad; i++) {
      var empty = document.createElement("button");
      empty.type = "button";
      empty.className = "km-woonwerk-day is-empty";
      empty.tabIndex = -1;
      grid.appendChild(empty);
    }
    var enabled = _wwState.distance != null;
    for (var day = 1; day <= daysInMonth; day++) {
      var dateObj = new Date(jaar, maand - 1, day);
      var iso = dateObj.getFullYear() + "-" + ("0" + (dateObj.getMonth() + 1)).slice(-2) + "-" + ("0" + dateObj.getDate()).slice(-2);
      var weekday = (dateObj.getDay() + 6) % 7; // 0=ma..6=zo
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "km-woonwerk-day";
      btn.setAttribute("data-iso", iso);
      if (weekday >= 5) btn.classList.add("is-weekend");
      if (_wwState.selectedDates[iso]) btn.classList.add("is-selected");
      if (_wwState.locked[iso]) {
        btn.classList.add("is-disabled");
        btn.title = "Reeds geregistreerd";
      } else if (!enabled) {
        btn.classList.add("is-disabled");
      }
      var num = document.createElement("span");
      num.className = "km-woonwerk-day-num";
      num.textContent = String(day);
      btn.appendChild(num);
      if (_wwState.locked[iso]) {
        var lbl = document.createElement("span");
        lbl.className = "km-woonwerk-day-label";
        lbl.textContent = "✓ al";
        btn.appendChild(lbl);
      }
      btn.addEventListener("click", function (e) {
        var t = e.currentTarget;
        var d = t.getAttribute("data-iso");
        if (_wwState.locked[d] || _wwState.distance == null) return;
        if (_wwState.selectedDates[d]) {
          delete _wwState.selectedDates[d];
          t.classList.remove("is-selected");
        } else {
          _wwState.selectedDates[d] = true;
          t.classList.add("is-selected");
        }
        refreshWoonwerkTotals();
      });
      grid.appendChild(btn);
    }
  }

  function refreshWoonwerkTotals() {
    var newDates = Object.keys(_wwState.selectedDates).filter(function (d) { return !_wwState.locked[d]; });
    var nDays = newDates.length;
    var perDay = _wwState.perDayKm || 0;
    var totalKm = nDays * perDay;
    // Cap 100 km per rit voor vergoeding
    var totalEur = nDays * Math.min(perDay, 100) * 0.39;
    $("km-woonwerk-days-count").textContent = String(nDays);
    $("km-woonwerk-km-total").textContent = nlNum(totalKm) + " km";
    $("km-woonwerk-eur-total").textContent = formatEur(totalEur);
    var btn = $("km-add-woonwerk-submit");
    if (btn) btn.disabled = (nDays === 0 || _wwState.distance == null);
  }

  // Multi-locatie-helper: voor een gegeven datum, zoek welke geplande shift de
  // medewerker heeft en geef de bijbehorende woon-werk-afstand (enkele reis)
  // terug uit medewerkers.data.locatie_afstanden[shift.locatie]. Fallback:
  // mw.location_distance (default). Geen match → null.
  function getDistanceForDay(mw, iso) {
    if (!mw || !iso) return null;
    var fallback = mw.location_distance != null ? Number(mw.location_distance) : null;
    if (!window.planningDB || typeof window.planningDB.getAllSync !== "function") return fallback;
    var fullName = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();
    if (!fullName) return fallback;
    var shifts = window.planningDB.getAllSync() || [];
    var shift = null;
    for (var i = 0; i < shifts.length; i++) {
      var s = shifts[i];
      if (!s || s.archived) continue;
      var startIso = String(s.start || "").slice(0, 10);
      if (startIso !== iso) continue;
      if (s.teamlid === fullName || s.teamlead === fullName) { shift = s; break; }
    }
    if (!shift || !shift.locatie) return fallback;
    var afstanden = mw.locatie_afstanden && typeof mw.locatie_afstanden === "object" ? mw.locatie_afstanden : null;
    if (afstanden && afstanden[shift.locatie] != null) {
      var v = Number(afstanden[shift.locatie]);
      if (isFinite(v)) return v;
    }
    return fallback;
  }

  function submitWoonwerkSelection() {
    var d = currentDecl();
    if (!d) return;
    var newDates = Object.keys(_wwState.selectedDates).filter(function (dd) { return !_wwState.locked[dd]; });
    if (newDates.length === 0) return;
    if (_wwState.distance == null) {
      setErr("km-add-woonwerk-error", "Geen afstand bekend — vraag HR om je location_distance in te vullen.");
      return;
    }
    var btn = $("km-add-woonwerk-submit");
    if (btn) btn.disabled = true;
    newDates.sort();
    // Sequentieel toevoegen om dubbele totaal-herrekening te voorkomen
    var ok = 0, errs = 0;
    var promise = Promise.resolve();
    newDates.forEach(function (iso) {
      // Multi-locatie: per dag kijken of er een geplande shift is met andere
      // locatie + cached afstand. Anders fallback naar de medewerker-default.
      var enkeleReis = getDistanceForDay(_wwState.mw, iso);
      if (enkeleReis == null) enkeleReis = _wwState.distance;
      var perDay = enkeleReis * 2; // heen + terug
      promise = promise.then(function () {
        return window.kilometerDeclaratiesDB.addRecord({
          declaratieId: d.id, datum: iso,
          beschrijving: "Woon-werk (auto, dag aangevinkt)",
          kilometers: perDay, type: "office", typeDisplay: "Naar kantoor",
          locatieNaam: "", locatieBs2Id: null,
        }).then(function () { ok++; }, function (err) {
          errs++;
          console.error("[km-woonwerk] add fail " + iso, err);
        });
      });
    });
    promise.then(function () {
      if (errs > 0) {
        setErr("km-add-woonwerk-error", ok + " van " + newDates.length + " dagen toegevoegd; " + errs + " mislukt — zie console.");
      } else {
        closeModal("km-add-woonwerk-modal");
        toast("saved", ok + " woon-werk dag(en) toegevoegd");
      }
    }).catch(function (err) {
      setErr("km-add-woonwerk-error", "Toevoegen mislukt: " + (err && err.message ? err.message : err));
    }).finally(function () { if (btn) btn.disabled = false; });
  }

  function nlNum(n) {
    var v = Number(n) || 0;
    if (v === Math.floor(v)) return v.toFixed(0);
    return v.toFixed(2).replace(".", ",");
  }

  function wireRecordCrud() {
    var addBtn = $("km-add-open-btn");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var d = currentDecl();
        if (!d || !isDeclEditable(d)) return;
        openModal("km-add-choice-modal");
      });
    }
    // Keuze-modal
    [["km-add-choice-close"], ["km-add-choice-cancel"]].forEach(function (p) {
      var b = $(p[0]); if (b) b.addEventListener("click", function () { closeModal("km-add-choice-modal"); });
    });
    var cH = $("km-choice-handmatig");
    if (cH) cH.addEventListener("click", function () {
      closeModal("km-add-choice-modal");
      var f = $("km-add-manual-form"); if (f) f.reset();
      setErr("km-add-manual-error", "");
      openModal("km-add-manual-modal");
    });
    var cK = $("km-choice-kantoor");
    if (cK) cK.addEventListener("click", function () {
      closeModal("km-add-choice-modal");
      var f = $("km-add-kantoor-form"); if (f) f.reset();
      setErr("km-add-kantoor-error", "");
      fillLocatieSelect();
      openModal("km-add-kantoor-modal");
    });
    // Woon-werk dagen aanvinken (Fase 2)
    var cW = $("km-choice-woonwerk-dagen");
    if (cW) cW.addEventListener("click", function () {
      closeModal("km-add-choice-modal");
      openWoonwerkModal();
    });
    [["km-add-woonwerk-close"], ["km-add-woonwerk-cancel"]].forEach(function (p) {
      var b = $(p[0]); if (b) b.addEventListener("click", function () { closeModal("km-add-woonwerk-modal"); });
    });
    var wwSubmit = $("km-add-woonwerk-submit");
    if (wwSubmit) wwSubmit.addEventListener("click", submitWoonwerkSelection);

    // Indienen-knop (Fase 1)
    var subBtn = $("km-submit-btn");
    if (subBtn) subBtn.addEventListener("click", handleSubmitDeclaratie);

    // Handmatige invoer — opslaan
    [["km-add-manual-close"], ["km-add-manual-cancel"]].forEach(function (p) {
      var b = $(p[0]); if (b) b.addEventListener("click", function () { closeModal("km-add-manual-modal"); });
    });
    var mForm = $("km-add-manual-form");
    // Toggle inzittendenverzekering-waarschuwing zichtbaarheid (PR-C)
    var metCliCb = $("km-add-manual-met-clienten");
    var inzWarn = $("km-add-manual-inzittenden-warn");
    if (metCliCb && inzWarn) {
      metCliCb.addEventListener("change", function () { inzWarn.hidden = !metCliCb.checked; });
    }
    // Reset bij heropenen van de modal
    function resetManualForm() {
      if (metCliCb) metCliCb.checked = false;
      if (inzWarn) inzWarn.hidden = true;
    }
    var manualOpenBtn = $("km-add-manual-choice-btn") || $("km-add-choice-manual");
    if (manualOpenBtn) manualOpenBtn.addEventListener("click", resetManualForm);
    if (mForm) mForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = currentDecl();
      if (!d || !isDeclEditable(d)) { closeModal("km-add-manual-modal"); return; }
      var datum = ($("km-add-manual-datum").value || "").trim();
      var beschr = ($("km-add-manual-beschr").value || "").trim();
      var kmv = parseFloat(($("km-add-manual-km").value || "").replace(",", "."));
      var metCli = !!(metCliCb && metCliCb.checked);
      if (!datum) { setErr("km-add-manual-error", "Datum is verplicht."); return; }
      if (!beschr) { setErr("km-add-manual-error", "Beschrijving is verplicht."); return; }
      if (!isFinite(kmv) || kmv < 0) { setErr("km-add-manual-error", "Vul een geldig aantal kilometers in."); return; }
      var btn = $("km-add-manual-submit"); if (btn) btn.disabled = true;
      window.kilometerDeclaratiesDB.addRecord({
        declaratieId: d.id, datum: datum, beschrijving: beschr,
        kilometers: kmv, type: "manual", typeDisplay: "Handmatig",
        metClienten: metCli,
      }).then(function () {
        closeModal("km-add-manual-modal");
        toast("saved", metCli ? "Rit toegevoegd — let op inzittendenverzekering" : "Rit toegevoegd");
        resetManualForm();
      }).catch(function (err) {
        setErr("km-add-manual-error", "Opslaan mislukt: " + (err && err.message ? err.message : err));
      }).finally(function () { if (btn) btn.disabled = false; });
    });

    // Naar kantoor — opslaan
    [["km-add-kantoor-close"], ["km-add-kantoor-cancel"]].forEach(function (p) {
      var b = $(p[0]); if (b) b.addEventListener("click", function () { closeModal("km-add-kantoor-modal"); });
    });
    var kForm = $("km-add-kantoor-form");
    if (kForm) kForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = currentDecl();
      if (!d || !isDeclEditable(d)) { closeModal("km-add-kantoor-modal"); return; }
      var datum = ($("km-add-kantoor-datum").value || "").trim();
      var locSel = $("km-add-kantoor-locatie");
      var locId = locSel ? locSel.value : "";
      var locNaam = locSel && locSel.selectedIndex > 0 ? locSel.options[locSel.selectedIndex].text : "";
      var beschr = ($("km-add-kantoor-beschr").value || "").trim();
      var kmRaw = ($("km-add-kantoor-km").value || "").replace(",", ".");
      var kmv = kmRaw === "" ? 0 : parseFloat(kmRaw);
      if (!datum) { setErr("km-add-kantoor-error", "Datum is verplicht."); return; }
      if (!locId) { setErr("km-add-kantoor-error", "Locatie is verplicht."); return; }
      if (!isFinite(kmv) || kmv < 0) { setErr("km-add-kantoor-error", "Vul een geldig aantal kilometers in."); return; }
      var btn = $("km-add-kantoor-submit"); if (btn) btn.disabled = true;
      window.kilometerDeclaratiesDB.addRecord({
        declaratieId: d.id, datum: datum,
        beschrijving: beschr || "Woon-werkverkeer (heen en terug)",
        kilometers: kmv, type: "office", typeDisplay: "Naar kantoor",
        locatieNaam: locNaam, locatieBs2Id: locId,
      }).then(function () {
        closeModal("km-add-kantoor-modal");
        toast("saved", "Rit toegevoegd");
      }).catch(function (err) {
        setErr("km-add-kantoor-error", "Opslaan mislukt: " + (err && err.message ? err.message : err));
      }).finally(function () { if (btn) btn.disabled = false; });
    });

    // Bewerken
    [["km-edit-close"], ["km-edit-cancel"]].forEach(function (p) {
      var b = $(p[0]); if (b) b.addEventListener("click", function () { closeModal("km-edit-modal"); });
    });
    var eForm = $("km-edit-form");
    if (eForm) eForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("km-edit-id").value;
      var datum = ($("km-edit-datum").value || "").trim();
      var beschr = ($("km-edit-beschr").value || "").trim();
      var kmv = parseFloat(($("km-edit-km").value || "").replace(",", "."));
      if (!datum) { setErr("km-edit-error", "Datum is verplicht."); return; }
      if (!beschr) { setErr("km-edit-error", "Beschrijving is verplicht."); return; }
      if (!isFinite(kmv) || kmv < 0) { setErr("km-edit-error", "Vul een geldig aantal kilometers in."); return; }
      var btn = $("km-edit-submit"); if (btn) btn.disabled = true;
      window.kilometerDeclaratiesDB.updateRecord(id, {
        datum: datum, beschrijving: beschr, kilometers: kmv,
      }).then(function () {
        closeModal("km-edit-modal");
        toast("saved", "Rit bijgewerkt");
      }).catch(function (err) {
        setErr("km-edit-error", "Opslaan mislukt: " + (err && err.message ? err.message : err));
      }).finally(function () { if (btn) btn.disabled = false; });
    });

    // Delegated: rij-acties (Bewerken / Verwijderen) in detail-tabel
    var tb = $("km-detail-tbody");
    if (tb) tb.addEventListener("click", function (e) {
      var editBtn = e.target && e.target.closest && e.target.closest(".km-row-edit");
      var delBtn = e.target && e.target.closest && e.target.closest(".km-row-del");
      if (editBtn) {
        var rec = recordById(editBtn.getAttribute("data-rec"));
        if (!rec) return;
        $("km-edit-id").value = rec.id;
        $("km-edit-datum").value = (rec.datum ? String(rec.datum).slice(0, 10) : "");
        $("km-edit-beschr").value = rec.beschrijving || "";
        $("km-edit-km").value = rec.kilometers;
        setErr("km-edit-error", "");
        openModal("km-edit-modal");
        return;
      }
      if (delBtn) {
        var r = recordById(delBtn.getAttribute("data-rec"));
        if (!r) return;
        var preview = formatNlDate(r.datum) + " · " + (r.beschrijving || r.typeDisplay || "Rit") + " · " + formatKm(r.kilometers);
        Promise.resolve(
          typeof window.showSliderConfirmModal === "function"
            ? window.showSliderConfirmModal({
              title: "Bent u zeker dat deze rit verwijderd wordt?",
              preview: preview, okLabel: "Verwijderen", cancelLabel: "Annuleren",
            })
            : window.confirm("Rit verwijderen?")
        ).then(function (ok) {
          if (!ok) return;
          return window.kilometerDeclaratiesDB.deleteRecord(r.id).then(function () {
            toast("deleted", "Rit verwijderd");
          });
        }).catch(function (err) {
          toast("error", "Verwijderen mislukt: " + (err && err.message ? err.message : err));
        });
      }
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
          Status: statusShortLabel(statusMeta(a)),
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

    wireRecordCrud();

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
