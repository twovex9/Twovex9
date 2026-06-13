/* global window, document */
/**
 * werkuren.js — page-script voor werkuren.html (Geregistreerde uren).
 *
 * Toont geregistreerde werkuren per kalendermaand/week/dag. Functies:
 *   - Kalender (maandag-eerst, weeknummers) met periode-modus maand/week/dag.
 *   - Groeperen Per medewerker OF Per cliënt; groepen standaard ingeklapt,
 *     klik om uit te klappen. Subtotaal per groep.
 *   - Kolommen: Datum, Tijd, Duur, Medewerker, Cliënt, Dienst, Locatie, Label,
 *     Beschrijving (Medewerker/Cliënt-kolom volgt de groeperingsmodus).
 *   - Filters: gebruiker / cliënt / dienst-type / zorgsoort / label.
 *   - Locatie wordt afgeleid: 1-op-1 via de cliënt-locatie, groepsdiensten via
 *     de straat in de beschrijving (geen datawijziging).
 *   - Zorgsoort (WLZ/ambulant) afgeleid via de beschikkingen van de cliënt.
 *   - Loondienst: per week gewerkt vs. contracturen (weekstaat per medewerker +
 *     los matrix-paneel). ZZP/inhuur tellen niet mee voor contracturen.
 *   - Bewerken/verwijderen via row-acties; Mij/Maand vergrendelen via knop.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return ("0" + n).slice(-2); }
  // Sommige beschrijvingen bevatten HTML (bv "<p>inwerk dienst</p>") — strip tags
  // + decodeer entities zodat de tekst leesbaar toont (en daarna pas escHtml).
  function stripHtml(s) {
    return String(s == null ? "" : s)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'").replace(/&apos;/gi, "'")
      .replace(/\s+/g, " ").trim();
  }

  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  // Maandag-eerst (NL-standaard) — sluit aan op ISO-weeknummers.
  var DOW_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"];

  function capMonth(m) { var s = MONTHS_NL[m]; return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- datum-helpers ------------------------------------------------------
  function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function entryDay(r) { return String(r && r.datum != null ? r.datum : "").slice(0, 10); }
  function dateFromYmd(s) {
    var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function formatNlDate(value) {
    var d = value instanceof Date ? value : dateFromYmd(value);
    if (!d || isNaN(d.getTime())) return "—";
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function formatNlDateLong(value) {
    var d = value instanceof Date ? value : dateFromYmd(value);
    if (!d || isNaN(d.getTime())) return "—";
    return d.getDate() + " " + MONTHS_NL[d.getMonth()] + " " + d.getFullYear();
  }
  function formatTime(t) {
    if (!t) return "—";
    var s = String(t);
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    return m ? pad2(m[1]) + ":" + m[2] : s;
  }
  function formatDuur(minutes) {
    var n = Number(minutes || 0);
    if (n <= 0) return "0u";
    var h = Math.floor(n / 60);
    var m = n % 60;
    if (m === 0) return h + "u";
    return h + "u " + m + "m";
  }
  function durHoursDecimal(minutes) { return Math.round((Number(minutes || 0) / 60) * 100) / 100; }
  function durFormatHours(minutes) { return durHoursDecimal(minutes).toFixed(2).replace(".", ","); }
  function fmtHours(h) { return (Math.round(h * 100) / 100).toFixed(2).replace(".", ","); }

  // ---- ISO-week helpers (maandag = dag 0) --------------------------------
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x;
  }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function isoWeekNum(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow + 3); // donderdag van deze week
    var firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    var firstDow = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
    return 1 + Math.round((t - firstThu) / (7 * 86400000));
  }
  function weekKey(d) { var m = mondayOf(d); return ymd(m); }

  function initialsFromName(naam) {
    var parts = String(naam || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ---- entity lookups -----------------------------------------------------
  function getMedewerker(id) {
    if (id && window.medewerkersDB && window.medewerkersDB.getByIdSync) return window.medewerkersDB.getByIdSync(id) || null;
    return null;
  }
  function getMedewerkerNaam(id) {
    if (!id) return "(onbekend)";
    var m = getMedewerker(id);
    if (m) return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "(zonder naam)";
    return "(onbekend)";
  }
  function getClient(id) {
    if (id && window.clientenDB && window.clientenDB.getByIdSync) return window.clientenDB.getByIdSync(id) || null;
    return null;
  }
  function getClientNaam(id, fallback) {
    if (!id) return fallback || "—";
    var c = getClient(id);
    if (c) return ((c.voornaam || "") + " " + (c.achternaam || "")).trim() || (fallback || "—");
    return fallback || "—";
  }

  function isLoondienst(mw) { return !!mw && String(mw.dienstverband || "").trim().toLowerCase() === "loondienst"; }
  function contractUrenWeek(mw) {
    if (!mw) return 0;
    var n = parseFloat(String(mw.contracturen == null ? "" : mw.contracturen).replace(",", "."));
    return isFinite(n) && n > 0 ? n : 0;
  }

  // ---------------------------------------------------------------------------
  // Afgeleide lookups (locatie + zorgsoort) — herbouwd bij data-changes
  // ---------------------------------------------------------------------------
  var locMatchers = [];      // [{needle, naam}] gesorteerd op needle-lengte (langste eerst)
  var clientZorg = {};       // clientId -> [zorgsoortLabel]
  var clientLocCache = {};   // clientId -> locatie-naam

  function buildLocMatchers() {
    locMatchers = [];
    var locs = (window.locatiesDB && window.locatiesDB.getAllSync) ? (window.locatiesDB.getAllSync() || []) : [];
    locs.forEach(function (l) {
      if (!l) return;
      var naam = String(l.naam || "").trim();
      [l.straat, l.naam].forEach(function (raw) {
        var needle = String(raw || "").trim().toLowerCase();
        if (needle.length >= 4 && needle !== "satelliet woning") {
          locMatchers.push({ needle: needle, naam: naam || raw });
        }
      });
    });
    locMatchers.sort(function (a, b) { return b.needle.length - a.needle.length; });
  }

  function parseClientLocatie(client) {
    if (!client) return "";
    if (client.locatie && String(client.locatie).trim()) return String(client.locatie).trim();
    var bl = client.bs2_location;
    if (bl) {
      try {
        var o = typeof bl === "string" ? JSON.parse(bl) : bl;
        if (o && o.name) return String(o.name).trim();
      } catch (e) { /* */ }
    }
    return "";
  }
  function clientLocatie(clientId) {
    if (!clientId) return "";
    if (Object.prototype.hasOwnProperty.call(clientLocCache, clientId)) return clientLocCache[clientId];
    var v = parseClientLocatie(getClient(clientId));
    clientLocCache[clientId] = v;
    return v;
  }

  function buildClientZorg() {
    clientZorg = {};
    if (!window.beschikkingenDB || !window.beschikkingenDB.getAllSync) return;
    // bs2_id -> clientId (werkuren.client_id = clienten.id; beschikking.clientId = clienten.bs2_id)
    var byBs2 = {};
    var cs = (window.clientenDB && window.clientenDB.getAllSync) ? (window.clientenDB.getAllSync() || []) : [];
    cs.forEach(function (c) { if (c && c.bs2_id) byBs2[String(c.bs2_id)] = c.id; });
    (window.beschikkingenDB.getAllSync() || []).forEach(function (b) {
      if (!b) return;
      var clId = byBs2[String(b.clientId)];
      if (!clId) return;
      var lbl = b.zorgsoortLabel || b.zorgsoortKey || "";
      if (!lbl || lbl === "overig") return;
      if (!clientZorg[clId]) clientZorg[clId] = [];
      if (clientZorg[clId].indexOf(lbl) < 0) clientZorg[clId].push(lbl);
    });
  }

  function deriveLocatie(r) {
    if (!r) return "";
    if (r.client_id) {
      var l = clientLocatie(r.client_id);
      if (l) return l;
    }
    var hay = (stripHtml(r.beschrijving) + " " + String(r.dienst || "")).toLowerCase();
    for (var i = 0; i < locMatchers.length; i += 1) {
      if (hay.indexOf(locMatchers[i].needle) >= 0) return locMatchers[i].naam;
    }
    return "";
  }
  function deriveZorg(r) {
    if (!r || !r.client_id) return [];
    return clientZorg[String(r.client_id)] || [];
  }

  function rebuildLookups() {
    clientLocCache = {};
    buildLocMatchers();
    buildClientZorg();
  }

  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("wu-toast");
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 1500);
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var today = new Date();
  var state = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    mode: "month",            // month | week | day
    selectedDate: null,       // Date — anker voor week/day
    groupBy: "medewerker",    // medewerker | client
    filterUser: null,
    filterClient: null,
    filterDienst: null,
    filterZorg: null,
    filterLabel: null,
    expanded: {},             // groep-key -> true (ingeklapt = default)
    editingId: null,
    purgingId: null,
    chips: {},
    optionArrays: {},
  };

  // ---------------------------------------------------------------------------
  // Periode-berekening
  // ---------------------------------------------------------------------------
  function periodRange() {
    var y = state.year, m = state.month;
    if (state.mode === "day" && state.selectedDate) {
      return { start: new Date(state.selectedDate), end: new Date(state.selectedDate) };
    }
    if (state.mode === "week" && state.selectedDate) {
      var mon = mondayOf(state.selectedDate);
      return { start: mon, end: addDays(mon, 6) };
    }
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  function periodLabel() {
    var r = periodRange();
    if (state.mode === "day") return formatNlDateLong(r.start);
    if (state.mode === "week") {
      return "Week " + isoWeekNum(r.start) + " · " + r.start.getDate() + " " + MONTHS_NL[r.start.getMonth()]
        + " – " + r.end.getDate() + " " + MONTHS_NL[r.end.getMonth()] + " " + r.end.getFullYear();
    }
    return "1 " + MONTHS_NL[state.month - 1] + " – " + new Date(state.year, state.month, 0).getDate() + " " + MONTHS_NL[state.month - 1] + " " + state.year;
  }
  // Lijst van week-starts (maandagen) die de actieve periode raken.
  function weeksInPeriod() {
    var r = periodRange();
    var out = [], cur = mondayOf(r.start);
    while (cur <= r.end) { out.push(new Date(cur)); cur = addDays(cur, 7); }
    if (!out.length) out.push(mondayOf(r.start));
    return out;
  }

  function allEntries() {
    if (!window.werkurenDB || !window.werkurenDB.getAllSync) return [];
    return window.werkurenDB.getAllSync() || [];
  }
  function entriesInRange(start, end) {
    var s = ymd(start), e = ymd(end);
    return allEntries().filter(function (r) {
      var d = entryDay(r);
      return d && d >= s && d <= e;
    });
  }

  // ---------------------------------------------------------------------------
  // Kalender (zijbalk) — maandag-eerst, weeknummers, week/dag-selectie
  // ---------------------------------------------------------------------------
  function renderCalendar() {
    var year = state.year, month = state.month;
    $("wu-cal-label").textContent = capMonth(month - 1) + " " + year;
    var grid = $("wu-cal-grid");
    if (!grid) return;

    var sel = state.selectedDate;
    var selWeekStart = (state.mode === "week" && sel) ? +mondayOf(sel) : null;
    var selDay = (state.mode === "day" && sel) ? ymd(sel) : null;

    var html = '<div class="wu-cal-wkh" aria-hidden="true">wk</div>';
    DOW_NL.forEach(function (d) { html += '<div class="wu-cal-dowh">' + d + '</div>'; });

    var first = new Date(year, month - 1, 1);
    var last = new Date(year, month, 0);
    var cur = mondayOf(first);
    var guard = 0;
    while (cur <= last && guard < 8) {
      guard += 1;
      var wkStart = new Date(cur);
      var wkSelClass = (selWeekStart === +wkStart) ? " wu-cal-wk--sel" : "";
      html += '<button type="button" class="wu-cal-wk' + wkSelClass + '" data-week="' + ymd(wkStart) + '" title="Week ' + isoWeekNum(wkStart) + ' selecteren">' + isoWeekNum(wkStart) + '</button>';
      for (var i = 0; i < 7; i += 1) {
        var day = new Date(cur);
        var inMonth = day.getMonth() === (month - 1);
        var cls = "wu-cal-day";
        if (!inMonth) cls += " wu-cal-day--out";
        if (selDay && ymd(day) === selDay) cls += " wu-cal-day--sel";
        if (selWeekStart === +wkStart) cls += " wu-cal-day--wsel";
        html += '<button type="button" class="' + cls + '" data-date="' + ymd(day) + '">' + day.getDate() + '</button>';
        cur = addDays(cur, 1);
      }
    }
    grid.innerHTML = html;

    grid.querySelectorAll(".wu-cal-day[data-date]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = dateFromYmd(b.getAttribute("data-date"));
        if (!d) return;
        if (state.mode === "week") {
          state.selectedDate = d;
        } else if (state.mode === "day") {
          // toggle dezelfde dag = terug naar maand
          if (state.selectedDate && ymd(state.selectedDate) === ymd(d)) { state.mode = "month"; state.selectedDate = null; }
          else state.selectedDate = d;
        } else {
          state.mode = "day"; state.selectedDate = d;
        }
        syncModeButtons(); renderCalendar(); renderAll();
      });
    });
    grid.querySelectorAll(".wu-cal-wk[data-week]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = dateFromYmd(b.getAttribute("data-week"));
        if (!d) return;
        state.mode = "week"; state.selectedDate = d;
        syncModeButtons(); renderCalendar(); renderAll();
      });
    });

    updateLockButton();
    updatePeriodTitle();
    updateGlobalLockBanner();
    updateFiltersClearBtn();
  }

  function syncModeButtons() {
    [["wu-mode-month", "month"], ["wu-mode-week", "week"], ["wu-mode-day", "day"]].forEach(function (p) {
      var el = $(p[0]); if (el) el.classList.toggle("is-active", state.mode === p[1]);
    });
    [["wu-group-medewerker", "medewerker"], ["wu-group-client", "client"]].forEach(function (p) {
      var el = $(p[0]); if (el) el.classList.toggle("is-active", state.groupBy === p[1]);
    });
  }

  function updatePeriodTitle() {
    var el = $("wu-period-title"); if (el) el.textContent = periodLabel();
  }

  // ---------------------------------------------------------------------------
  // Globale maand-vergrendeling (Pauline, urendeclaraties.html beheert dit)
  // ---------------------------------------------------------------------------
  function isCurrentMonthGloballyLocked() {
    if (!window.lockedMonthsDB) return false;
    return window.lockedMonthsDB.isLockedSync(state.year, state.month);
  }
  function ensureLockBannerEl() {
    var el = document.getElementById("wu-global-lock-banner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "wu-global-lock-banner";
    el.className = "wu-global-lock-banner";
    el.setAttribute("role", "status");
    el.hidden = true;
    var title = document.getElementById("wu-period-title");
    if (title && title.parentNode) title.parentNode.insertBefore(el, title.nextSibling);
    return el;
  }
  function updateGlobalLockBanner() {
    var el = ensureLockBannerEl();
    if (!el) return;
    if (!isCurrentMonthGloballyLocked()) { el.hidden = true; el.innerHTML = ""; return; }
    var lock = window.lockedMonthsDB.getLockSync(state.year, state.month);
    var monthCap = capMonth(state.month - 1);
    var byName = lock && lock.vergrendeldDoorNaam ? lock.vergrendeldDoorNaam : "";
    var dateStr = "";
    if (lock && lock.vergrendeldOp) {
      var d = new Date(lock.vergrendeldOp);
      if (!isNaN(d.getTime())) dateStr = formatNlDate(d.toISOString().slice(0, 10));
    }
    var byPart = byName ? (" door " + escHtml(byName)) : "";
    var datePart = dateStr ? (" op " + escHtml(dateStr)) : "";
    el.innerHTML =
      '<svg class="wu-glb-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
      + '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      + ' <strong>' + escHtml(monthCap) + ' ' + state.year + ' is vergrendeld</strong>'
      + byPart + datePart + '. Werkuren kunnen niet gewijzigd, toegevoegd of verwijderd worden. Ontgrendel eerst via Urendeclaraties.';
    el.hidden = false;
  }
  window.addEventListener("ff:locked-months-updated", function () { updateGlobalLockBanner(); renderAll(); });

  function updateLockButton() {
    var btn = $("wu-lock-btn"); var label = $("wu-lock-btn-label");
    if (!btn || !label) return;
    // Kijkfunctie (HR/Facilitair): geen vergrendel-/ontgrendel-knop.
    if (!wuCanEdit()) { btn.style.display = "none"; return; }
    btn.style.display = "";
    var monthLabel = capMonth(state.month - 1);
    var profile = window.profilesDB && window.profilesDB.getCurrentSync ? window.profilesDB.getCurrentSync() : null;
    var medId = profile ? (profile.medewerkerId || profile.medewerker_id || null) : null;
    var isLocked = medId && window.werkurenVergrendeldDB
      ? window.werkurenVergrendeldDB.isLockedSync(medId, state.year, state.month) : false;
    if (isLocked) { label.textContent = monthLabel + " ontgrendelen"; btn.classList.add("wu-lock-btn--locked"); }
    else { label.textContent = monthLabel + " vergrendelen"; btn.classList.remove("wu-lock-btn--locked"); }
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  function getFilteredEntries() {
    var r = periodRange();
    var entries = entriesInRange(r.start, r.end);
    if (state.filterUser) entries = entries.filter(function (e) { return String(e.medewerker_id) === String(state.filterUser); });
    if (state.filterClient) entries = entries.filter(function (e) { return String(e.client_id || "") === String(state.filterClient); });
    if (state.filterDienst) entries = entries.filter(function (e) { return String(e.dienst || "") === String(state.filterDienst); });
    if (state.filterLabel) entries = entries.filter(function (e) { return e.label === state.filterLabel; });
    if (state.filterZorg) entries = entries.filter(function (e) { return deriveZorg(e).indexOf(state.filterZorg) >= 0; });
    return entries;
  }

  // ---------------------------------------------------------------------------
  // Tabel render
  // ---------------------------------------------------------------------------
  var EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  var TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  var LOCK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var CAL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var COLSPAN = 10;

  // Bewerk-recht voor urenregistratie: alleen wie manage-employee-registered-hours heeft
  // (= dezelfde 6 rollen die view-employee-hour-registrations hebben: admin-tier + Finance/
  // Planner/Zorgcoördinator). HR + Facilitair krijgen view-only → kijkfunctie i.p.v.
  // bewerkfunctie (video-eis eigenaar 2026-06-07).
  function wuCanEdit() {
    try {
      if (typeof window.ffIsAdminTier === "function" && window.ffIsAdminTier()) return true;
      return (typeof window.ffCan === "function") && window.ffCan("manage", "employee-registered-hours");
    } catch (e) { return false; }
  }

  function entryRowHtml(r, monthLocked) {
    var clientLabel = r.client_label || getClientNaam(r.client_id, "—");
    var medNaam = getMedewerkerNaam(r.medewerker_id);
    var loc = deriveLocatie(r);
    var beschr = stripHtml(r.beschrijving);
    var tijd = (r.starttijd || r.eindtijd) ? (formatTime(r.starttijd) + " - " + formatTime(r.eindtijd)) : "—";
    return '<tr class="wu-entry-row" data-id="' + escHtml(r.id) + '">'
      + '<td data-col="datum">' + escHtml(formatNlDate(r.datum)) + '</td>'
      + '<td data-col="tijd">' + escHtml(tijd) + '</td>'
      + '<td data-col="duur">' + escHtml(formatDuur(r.duur_minuten)) + '</td>'
      + '<td data-col="medewerker">' + escHtml(medNaam) + '</td>'
      + '<td data-col="client">' + escHtml(clientLabel) + '</td>'
      + '<td data-col="dienst">' + escHtml(r.dienst || "—") + '</td>'
      + '<td data-col="locatie">' + (loc ? escHtml(loc) : '<span class="wu-loc-none">—</span>') + '</td>'
      + '<td data-col="label">' + escHtml(r.label || "—") + '</td>'
      + '<td data-col="beschrijving">' + escHtml(beschr || "—") + '</td>'
      + '<td data-col="acties" class="wu-row-actions">'
      +   (!wuCanEdit()
            ? '<span class="wu-row-readonly" title="Alleen-lezen">—</span>'
            : (monthLocked
              ? '<span class="wu-row-locked" title="Maand vergrendeld">' + LOCK_SVG + '</span>'
              : ('<button type="button" class="wu-row-edit" data-id="' + escHtml(r.id) + '" aria-label="Bewerken">' + EDIT_SVG + '</button>'
                 + '<button type="button" class="employee-delete-btn wu-row-purge" data-id="' + escHtml(r.id) + '" aria-label="Verwijderen">' + TRASH_SVG + '</button>')))
      + '</td>'
      + '</tr>';
  }

  // Contracturen-weekstaat voor één loondienst-medewerker over de periode.
  function weekstaatHtml(mwId) {
    var mw = getMedewerker(mwId);
    if (!isLoondienst(mw)) return "";
    var norm = contractUrenWeek(mw);
    if (norm <= 0) return "";
    var weeks = weeksInPeriod();
    var cells = weeks.map(function (ws) {
      var we = addDays(ws, 6);
      var s = ymd(ws), e = ymd(we);
      var min = 0;
      allEntries().forEach(function (r) {
        if (String(r.medewerker_id) !== String(mwId)) return;
        var d = entryDay(r); if (d >= s && d <= e) min += Number(r.duur_minuten || 0);
      });
      var h = min / 60;
      var pct = norm > 0 ? (h / norm) : 0;
      var cls = pct >= 1 ? "ok" : (pct >= 0.9 ? "warn" : "low");
      return '<span class="wu-ws-cell wu-ws-cell--' + cls + '">Wk ' + isoWeekNum(ws) + ': <strong>' + fmtHours(h) + '</strong> / ' + fmtHours(norm) + ' u</span>';
    }).join("");
    return '<tr class="wu-weekstaat-row"><td colspan="' + COLSPAN + '">'
      + '<div class="wu-weekstaat"><span class="wu-ws-label">Contracturen (' + fmtHours(norm) + ' u/week):</span>' + cells + '</div>'
      + '</td></tr>';
  }

  function renderTable() {
    var tbody = $("wu-tbody"); if (!tbody) return;
    var table = $("wu-table");
    if (table) table.classList.toggle("wu-table--by-client", state.groupBy === "client");

    var entries = getFilteredEntries();
    var byClient = state.groupBy === "client";
    var monthLocked = isCurrentMonthGloballyLocked();

    var groups = new Map();
    entries.forEach(function (r) {
      var key = byClient ? (r.client_id ? "c:" + r.client_id : "_geen") : (r.medewerker_id || "_unknown");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    function groupName(key) {
      if (key === "_unknown") return "(zonder medewerker)";
      if (key === "_geen") return "Groepsdienst / geen cliënt";
      if (byClient) {
        var cid = key.slice(2);
        var rows = groups.get(key);
        var lbl = rows && rows[0] && rows[0].client_label;
        return getClientNaam(cid, lbl || "(cliënt)");
      }
      return getMedewerkerNaam(key);
    }

    var sortedKeys = Array.from(groups.keys()).sort(function (a, b) {
      // "geen cliënt" altijd onderaan
      if (a === "_geen") return 1; if (b === "_geen") return -1;
      return groupName(a).localeCompare(groupName(b), "nl", { sensitivity: "base" });
    });

    if (sortedKeys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="' + COLSPAN + '" class="incident-empty">Geen werkuren-registraties in deze periode</td></tr>';
    } else {
      var html = sortedKeys.map(function (key) {
        var rows = groups.get(key);
        rows.sort(function (a, b) { return (entryDay(a) < entryDay(b) ? -1 : (entryDay(a) > entryDay(b) ? 1 : (String(a.starttijd || "")).localeCompare(String(b.starttijd || "")))); });
        var naam = groupName(key);
        var ini = byClient ? null : initialsFromName(naam);
        var groupMin = 0; rows.forEach(function (r) { groupMin += Number(r.duur_minuten || 0); });
        var isOpen = !!state.expanded[key];
        var mwForContract = (!byClient && key !== "_unknown") ? key : null;
        var mw = mwForContract ? getMedewerker(mwForContract) : null;
        var loonBadge = (mw && isLoondienst(mw) && contractUrenWeek(mw) > 0)
          ? '<span class="wu-group-loon" title="Loondienst — contract ' + fmtHours(contractUrenWeek(mw)) + ' u/week">' + fmtHours(contractUrenWeek(mw)) + ' u/wk</span>' : '';

        var avatarHtml = byClient
          ? '<span class="wu-group-avatar wu-group-avatar--client">' + CAL_SVG + '</span>'
          : '<span class="wu-group-avatar">' + escHtml(ini) + '</span>';

        var agendaBtn = (!byClient && key !== "_unknown")
          ? '<button type="button" class="btn-outline wu-agenda-btn" data-emp="' + escHtml(key) + '">' + CAL_SVG + ' Bekijken in agenda</button>'
          : '';

        var groupHeader =
          '<tr class="wu-group-row' + (isOpen ? " is-open" : "") + '" data-key="' + escHtml(key) + '">'
          + '<td colspan="' + COLSPAN + '">'
          +   '<div class="wu-group-cell">'
          +     '<button type="button" class="wu-group-toggle" aria-expanded="' + (isOpen ? "true" : "false") + '">' + (isOpen ? "▾" : "▸") + '</button>'
          +     avatarHtml
          +     '<span class="wu-group-naam">' + escHtml(naam) + '</span>'
          +     '<span class="wu-group-count">(' + rows.length + ')</span>'
          +     loonBadge
          +     '<span class="wu-group-spacer"></span>'
          +     '<span class="wu-group-hours"><strong>' + fmtHours(groupMin / 60) + '</strong> uur</span>'
          +     agendaBtn
          +   '</div>'
          + '</td>'
          + '</tr>';

        var body = "";
        if (isOpen) {
          if (mwForContract) body += weekstaatHtml(mwForContract);
          body += rows.map(function (r) { return entryRowHtml(r, monthLocked); }).join("");
          body += '<tr class="wu-subtotal-row"><td colspan="' + COLSPAN + '">'
            + '<div class="wu-subtotal"><span>Subtotaal ' + escHtml(naam) + '</span>'
            + '<strong>' + fmtHours(groupMin / 60) + ' uur</strong> · ' + rows.length + ' ' + (rows.length === 1 ? "dienst" : "diensten") + '</div>'
            + '</td></tr>';
        }
        return groupHeader + body;
      }).join("");
      tbody.innerHTML = html;
    }

    // Totalen
    var totMin = 0; entries.forEach(function (r) { totMin += Number(r.duur_minuten || 0); });
    var distinctMw = new Set(); var distinctCl = new Set();
    entries.forEach(function (r) { if (r.medewerker_id) distinctMw.add(String(r.medewerker_id)); if (r.client_id) distinctCl.add(String(r.client_id)); });
    $("wu-total-hours").textContent = durFormatHours(totMin);
    $("wu-total-meds").textContent = byClient ? distinctCl.size : distinctMw.size;
    $("wu-total-entries").textContent = entries.length;
    var medsLabel = document.getElementById("wu-total-meds-label");
    if (medsLabel) medsLabel.textContent = byClient ? "Totaal cliënten:" : "Totaal medewerkers:";

    wireTableActions(tbody);
  }

  function wireTableActions(tbody) {
    tbody.querySelectorAll(".wu-row-edit").forEach(function (b) {
      b.addEventListener("click", function () { openEdit(b.getAttribute("data-id")); });
    });
    tbody.querySelectorAll(".wu-row-purge").forEach(function (b) {
      b.addEventListener("click", function () { openPurge(b.getAttribute("data-id")); });
    });
    tbody.querySelectorAll(".wu-group-row").forEach(function (row) {
      var key = row.getAttribute("data-key");
      var toggleBtn = row.querySelector(".wu-group-toggle");
      function toggle(e) {
        if (e) e.stopPropagation();
        state.expanded[key] = !state.expanded[key];
        renderTable();
      }
      if (toggleBtn) toggleBtn.addEventListener("click", toggle);
      row.querySelector(".wu-group-cell").addEventListener("click", function (e) {
        if (e.target.closest(".wu-agenda-btn") || e.target.closest(".wu-group-toggle")) return;
        toggle(e);
      });
    });
    tbody.querySelectorAll(".wu-agenda-btn").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var empId = b.getAttribute("data-emp");
        if (!empId || empId === "_unknown") return;
        window.location.href = "medewerker-agenda.html?id=" + encodeURIComponent(empId);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Contracturen-matrix-paneel (loondienst)
  // ---------------------------------------------------------------------------
  function renderContractPanel() {
    var panel = $("wu-contract-panel");
    var body = $("wu-contract-body");
    var sub = $("wu-contract-sub");
    if (!panel || !body) return;

    var weeks = weeksInPeriod();
    var r = periodRange();
    // Loondienst-medewerkers die in de periode uren hebben (respecteert gebruikersfilter).
    var periodEntries = entriesInRange(r.start, r.end);
    var mwIds = {};
    periodEntries.forEach(function (e) {
      if (state.filterUser && String(e.medewerker_id) !== String(state.filterUser)) return;
      if (e.medewerker_id) mwIds[String(e.medewerker_id)] = true;
    });
    var loonList = Object.keys(mwIds).map(getMedewerker).filter(function (m) { return isLoondienst(m) && contractUrenWeek(m) > 0; });
    loonList.sort(function (a, b) {
      return ((a.voornaam || "") + " " + (a.achternaam || "")).localeCompare((b.voornaam || "") + " " + (b.achternaam || ""), "nl");
    });

    if (loonList.length === 0) { panel.hidden = true; return; }
    panel.hidden = false;
    sub.textContent = "(" + loonList.length + " " + (loonList.length === 1 ? "medewerker" : "medewerkers") + " · " + weeks.length + " " + (weeks.length === 1 ? "week" : "weken") + ")";

    // Voorbereken uren per (mw, week)
    function minutesFor(mwId, ws) {
      var s = ymd(ws), e = ymd(addDays(ws, 6)), min = 0;
      allEntries().forEach(function (row) {
        if (String(row.medewerker_id) !== String(mwId)) return;
        var d = entryDay(row); if (d >= s && d <= e) min += Number(row.duur_minuten || 0);
      });
      return min;
    }

    var head = '<tr><th class="wu-cm-name">Medewerker</th><th class="wu-cm-norm">Contract</th>'
      + weeks.map(function (ws) { return '<th class="wu-cm-wk">Wk ' + isoWeekNum(ws) + '</th>'; }).join("")
      + '<th class="wu-cm-tot">Totaal</th></tr>';

    var rowsHtml = loonList.map(function (mw) {
      var norm = contractUrenWeek(mw);
      var naam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();
      var totMin = 0, normTot = 0;
      var cells = weeks.map(function (ws) {
        var min = minutesFor(mw.id, ws); totMin += min; normTot += norm;
        var h = min / 60; var pct = norm > 0 ? h / norm : 0;
        var cls = pct >= 1 ? "ok" : (pct >= 0.9 ? "warn" : "low");
        return '<td class="wu-cm-cell wu-cm-cell--' + cls + '" title="' + escHtml(naam) + ' — Wk ' + isoWeekNum(ws) + '">' + fmtHours(h) + '<span class="wu-cm-norm-s">/' + fmtHours(norm) + '</span></td>';
      }).join("");
      var totH = totMin / 60; var totPct = normTot > 0 ? totH / normTot : 0;
      var totCls = totPct >= 1 ? "ok" : (totPct >= 0.9 ? "warn" : "low");
      return '<tr><td class="wu-cm-name">' + escHtml(naam) + '</td>'
        + '<td class="wu-cm-norm">' + fmtHours(norm) + ' u/wk</td>'
        + cells
        + '<td class="wu-cm-tot wu-cm-cell--' + totCls + '"><strong>' + fmtHours(totH) + '</strong>/' + fmtHours(normTot) + '</td></tr>';
    }).join("");

    body.innerHTML = '<div class="wu-cm-scroll"><table class="wu-cm-table"><thead>' + head + '</thead><tbody>' + rowsHtml + '</tbody></table>'
      + '<div class="wu-cm-legend"><span class="wu-cm-dot wu-cm-dot--ok"></span>Contract gehaald'
      + '<span class="wu-cm-dot wu-cm-dot--warn"></span>Net niet (≥90%)'
      + '<span class="wu-cm-dot wu-cm-dot--low"></span>Tekort (&lt;90%)</div></div>';
  }

  function renderAll() { renderTable(); renderContractPanel(); }

  // ---------------------------------------------------------------------------
  // Filter chips
  // ---------------------------------------------------------------------------
  function sortByLabel(a, b) { return a.label.localeCompare(b.label, "nl"); }
  function buildUserOptions() {
    if (!window.medewerkersDB) return [];
    return (window.medewerkersDB.getAllSync() || []).filter(function (m) { return m && !m.archived; })
      .map(function (m) { return { value: m.id, label: ((m.voornaam || "") + " " + (m.achternaam || "")).trim() }; })
      .filter(function (o) { return o.label; }).sort(sortByLabel);
  }
  function buildClientOptions() {
    if (!window.clientenDB) return [];
    return (window.clientenDB.getAllSync() || []).filter(function (c) { return c && !c.archived; })
      .map(function (c) { return { value: c.id, label: ((c.voornaam || "") + " " + (c.achternaam || "")).trim() }; })
      .filter(function (o) { return o.label; }).sort(sortByLabel);
  }
  function buildDienstOptions() {
    var set = {};
    allEntries().forEach(function (e) { if (e.dienst) set[e.dienst] = true; });
    return Object.keys(set).sort().map(function (d) { return { value: d, label: d }; });
  }
  function buildZorgOptions() {
    // Alleen zorgsoorten tonen die daadwerkelijk bij cliënten-met-werkuren horen,
    // anders verschijnen "dode" opties (bv WLZ) die altijd 0 resultaten geven.
    var clientIds = {};
    allEntries().forEach(function (e) { if (e.client_id) clientIds[String(e.client_id)] = true; });
    var set = {};
    Object.keys(clientIds).forEach(function (cid) { (clientZorg[cid] || []).forEach(function (z) { set[z] = true; }); });
    return Object.keys(set).sort().map(function (z) { return { value: z, label: z }; });
  }
  function buildLabelOptions() {
    if (!window.werkurenLabelsDB) return [];
    return (window.werkurenLabelsDB.getAllSync() || []).filter(function (l) { return l && !l.archived; })
      .map(function (l) { return { value: l.naam, label: l.naam }; });
  }

  function refreshOptionArray(name, opts) {
    var arr = state.optionArrays[name]; if (!arr) return;
    arr.length = 0; opts.forEach(function (o) { arr.push(o); });
  }
  function refreshAllOptions() {
    refreshOptionArray("user", buildUserOptions());
    refreshOptionArray("client", buildClientOptions());
    refreshOptionArray("dienst", buildDienstOptions());
    refreshOptionArray("zorg", buildZorgOptions());
    refreshOptionArray("label", buildLabelOptions());
  }

  function initChips() {
    if (!window.ffFilterChips) return;
    var defs = [
      { name: "user", btn: "wu-filter-user-btn", label: "Selecteer Gebruiker", clear: "Alle gebruikers tonen", set: function (v) { state.filterUser = v; } },
      { name: "client", btn: "wu-filter-client-btn", label: "Selecteer Cliënt", clear: "Alle cliënten tonen", set: function (v) { state.filterClient = v; } },
      { name: "dienst", btn: "wu-filter-dienst-btn", label: "Selecteer Dienst", clear: "Alle diensten tonen", set: function (v) { state.filterDienst = v; } },
      { name: "zorg", btn: "wu-filter-zorg-btn", label: "Selecteer Zorgsoort", clear: "Alle zorgsoorten tonen", set: function (v) { state.filterZorg = v; } },
      { name: "label", btn: "wu-filter-label-btn", label: "Selecteer Label", clear: "Alle labels tonen", set: function (v) { state.filterLabel = v; } },
    ];
    defs.forEach(function (d) {
      var btn = $(d.btn); if (!btn || btn.dataset.chipInited) return;
      var arr = []; state.optionArrays[d.name] = arr;
      state.chips[d.name] = window.ffFilterChips.createSearchSelectChip({
        button: btn, label: d.label, options: arr, clearLabel: d.clear,
        onChange: function (v) { d.set(v); renderAll(); updateFiltersClearBtn(); updateAgendaLink(); },
      });
      btn.dataset.chipInited = "1";
    });
    refreshAllOptions();
  }

  function anyFilterActive() {
    return !!(state.filterUser || state.filterClient || state.filterDienst || state.filterZorg || state.filterLabel);
  }
  function updateFiltersClearBtn() {
    var b = $("wu-filters-clear"); if (b) b.hidden = !anyFilterActive();
  }
  function clearAllFilters() {
    ["user", "client", "dienst", "zorg", "label"].forEach(function (n) {
      if (state.chips[n] && state.chips[n].clear) state.chips[n].clear();
    });
    state.filterUser = state.filterClient = state.filterDienst = state.filterZorg = state.filterLabel = null;
    renderAll(); updateFiltersClearBtn(); updateAgendaLink();
  }

  function updateAgendaLink() {
    var btn = document.getElementById("wu-open-agenda-btn");
    if (!btn) return;
    if (!state.filterUser) { btn.hidden = true; btn.removeAttribute("href"); return; }
    btn.hidden = false;
    btn.setAttribute("href", "medewerker-agenda.html?id=" + encodeURIComponent(state.filterUser));
  }

  // ---------------------------------------------------------------------------
  // Edit modal
  // ---------------------------------------------------------------------------
  function populateClientSelect(selectId, currentId) {
    var sel = $(selectId);
    sel.innerHTML = '<option value="">— Geen cliënt —</option>';
    var cs = window.clientenDB ? window.clientenDB.getAllSync() : [];
    cs.filter(function (c) { return c && !c.archived; })
      .sort(function (a, b) { return ((a.voornaam || "") + " " + (a.achternaam || "")).localeCompare((b.voornaam || "") + " " + (b.achternaam || ""), "nl"); })
      .forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id; opt.textContent = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
        sel.appendChild(opt);
      });
    if (currentId) sel.value = currentId;
  }
  function populateLabelSelect(selectId, currentLabel) {
    var sel = $(selectId);
    sel.innerHTML = '<option value="">Selecteer Label</option>';
    var ls = window.werkurenLabelsDB ? window.werkurenLabelsDB.getAllSync() : [];
    ls.filter(function (l) { return l && !l.archived; }).forEach(function (l) {
      var opt = document.createElement("option");
      opt.value = l.naam; opt.textContent = l.naam; sel.appendChild(opt);
    });
    if (currentLabel) sel.value = currentLabel;
  }

  function openEdit(id) {
    if (!wuCanEdit()) { toast("error", "Je hebt alleen een kijkfunctie voor de urenregistratie"); return; }
    if (isCurrentMonthGloballyLocked()) { toast("error", "Deze maand is vergrendeld — wijzigen niet mogelijk"); return; }
    var rec = window.werkurenDB.getByIdSync(id);
    if (!rec) return;
    state.editingId = id;
    var naam = getMedewerkerNaam(rec.medewerker_id);
    $("wu-edit-emp-avatar").textContent = initialsFromName(naam);
    $("wu-edit-emp-naam").textContent = naam;
    $("wu-edit-id").value = id;
    $("wu-edit-datum").value = entryDay(rec) || "";
    $("wu-edit-start").value = rec.starttijd ? String(rec.starttijd).slice(0, 5) : "";
    $("wu-edit-eind").value = rec.eindtijd ? String(rec.eindtijd).slice(0, 5) : "";
    $("wu-edit-duur").value = rec.duur_minuten ? durHoursDecimal(rec.duur_minuten) : "";
    populateClientSelect("wu-edit-client", rec.client_id);
    populateLabelSelect("wu-edit-label", rec.label);
    $("wu-edit-beschr").value = rec.beschrijving || "";
    var err = $("wu-edit-error"); err.hidden = true; err.textContent = "";
    showModal("wu-edit-modal");
  }
  async function submitEdit(ev) {
    ev.preventDefault();
    var id = state.editingId; if (!id) return;
    var datum = $("wu-edit-datum").value;
    var start = $("wu-edit-start").value || "";
    var eind = $("wu-edit-eind").value || "";
    var duur = parseFloat($("wu-edit-duur").value);
    var client_id = $("wu-edit-client").value || null;
    var clientNaam = client_id ? getClientNaam(client_id, "") : "";
    var label = $("wu-edit-label").value || "";
    var beschr = $("wu-edit-beschr").value || "";
    var err = $("wu-edit-error");
    if (!datum) { err.hidden = false; err.textContent = "Datum is verplicht."; return; }

    var duur_minuten = 0;
    if (isFinite(duur) && duur > 0) {
      duur_minuten = Math.round(duur * 60);
    } else if (start && eind) {
      var sm = start.split(":"), em = eind.split(":");
      var startMin = parseInt(sm[0], 10) * 60 + parseInt(sm[1], 10);
      var eindMin = parseInt(em[0], 10) * 60 + parseInt(em[1], 10);
      if (eindMin < startMin) eindMin += 24 * 60;
      duur_minuten = eindMin - startMin;
    }

    var btn = $("wu-edit-submit"); btn.disabled = true;
    var orig = btn.textContent; btn.textContent = "Bezig…";
    try {
      await window.werkurenDB.update(id, {
        datum: datum, starttijd: start || null, eindtijd: eind || null, duur_minuten: duur_minuten,
        client_id: client_id, client_label: clientNaam, label: label, beschrijving: beschr,
      });
      toast("saved", "Werkuren bijgewerkt");
      hideModal("wu-edit-modal");
      state.editingId = null;
    } catch (e) {
      err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  function openPurge(id) {
    if (!wuCanEdit()) { toast("error", "Je hebt alleen een kijkfunctie voor de urenregistratie"); return; }
    if (isCurrentMonthGloballyLocked()) { toast("error", "Deze maand is vergrendeld — verwijderen niet mogelijk"); return; }
    var rec = window.werkurenDB.getByIdSync(id);
    if (!rec) return;
    state.purgingId = id;
    var naam = getMedewerkerNaam(rec.medewerker_id);
    $("wu-purge-preview").textContent = formatNlDateLong(rec.datum) + " — " + naam;
    var s = $("wu-purge-slider"); s.value = 0; s.style.setProperty("--employee-slider-pct", "0%");
    $("wu-purge-confirm").disabled = true;
    showModal("wu-purge-modal");
  }
  async function confirmPurge() {
    var id = state.purgingId; if (!id) return;
    hideModal("wu-purge-modal");
    state.purgingId = null;
    try { await window.werkurenDB.delete(id); toast("deleted", "Werkuren verwijderd"); }
    catch (e) { toast("error", "Verwijderen mislukt: " + (e && e.message ? e.message : String(e))); }
  }

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function showModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = false; m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var first = m.querySelector("input, textarea, select");
    if (first) { try { first.focus(); first.select && first.select(); } catch (e) { /* */ } }
  }
  function hideModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = true; m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  function doExport() {
    if (typeof window.ffExport !== "function") { toast("error", "Export-helper niet geladen"); return; }
    var entries = getFilteredEntries();
    var data = entries.map(function (r) {
      return {
        "Medewerker": getMedewerkerNaam(r.medewerker_id),
        "Datum": formatNlDate(r.datum),
        "Starttijd": formatTime(r.starttijd),
        "Eindtijd": formatTime(r.eindtijd),
        "Duur": formatDuur(r.duur_minuten),
        "Cliënt": r.client_label || getClientNaam(r.client_id, ""),
        "Dienst": r.dienst || "",
        "Locatie": deriveLocatie(r) || "",
        "Zorgsoort": deriveZorg(r).join(", "),
        "Label": r.label || "",
        "Beschrijving": stripHtml(r.beschrijving),
      };
    });
    window.ffExport({
      filename: "geregistreerde-uren",
      title: "Geregistreerde uren — " + periodLabel(),
      columns: ["Medewerker", "Datum", "Starttijd", "Eindtijd", "Duur", "Cliënt", "Dienst", "Locatie", "Zorgsoort", "Label", "Beschrijving"],
      data: data,
    });
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireSliderConfirm(sliderId, btnId) {
    var slider = $(sliderId), btn = $(btnId);
    if (!slider || !btn) return;
    slider.addEventListener("input", function () {
      var v = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", v + "%");
      btn.disabled = v < 100;
    });
  }

  function setMode(mode) {
    state.mode = mode;
    if (mode === "month") { state.selectedDate = null; }
    else if (!state.selectedDate) {
      // Kies een zinvol anker binnen de getoonde maand.
      var anchor = (today.getFullYear() === state.year && today.getMonth() + 1 === state.month)
        ? today : new Date(state.year, state.month - 1, 1);
      state.selectedDate = anchor;
    }
    syncModeButtons(); renderCalendar(); renderAll();
  }

  function wireUp() {
    // Kalender-nav
    $("wu-cal-prev").addEventListener("click", function () {
      if (state.month === 1) { state.month = 12; state.year -= 1; } else { state.month -= 1; }
      state.selectedDate = null; if (state.mode !== "month") state.mode = "month";
      syncModeButtons(); renderCalendar(); renderAll();
    });
    $("wu-cal-next").addEventListener("click", function () {
      if (state.month === 12) { state.month = 1; state.year += 1; } else { state.month += 1; }
      state.selectedDate = null; if (state.mode !== "month") state.mode = "month";
      syncModeButtons(); renderCalendar(); renderAll();
    });

    // Periode-modus
    $("wu-mode-month").addEventListener("click", function () { setMode("month"); });
    $("wu-mode-week").addEventListener("click", function () { setMode("week"); });
    $("wu-mode-day").addEventListener("click", function () { setMode("day"); });

    // Groeperen
    $("wu-group-medewerker").addEventListener("click", function () {
      if (state.groupBy === "medewerker") return;
      state.groupBy = "medewerker"; state.expanded = {}; syncModeButtons(); renderTable();
    });
    $("wu-group-client").addEventListener("click", function () {
      if (state.groupBy === "client") return;
      state.groupBy = "client"; state.expanded = {}; syncModeButtons(); renderTable();
    });

    // Filters wissen
    var clearBtn = $("wu-filters-clear");
    if (clearBtn) clearBtn.addEventListener("click", clearAllFilters);

    // Contracturen-paneel toggle
    var ctToggle = $("wu-contract-toggle");
    if (ctToggle) ctToggle.addEventListener("click", function () {
      var body = $("wu-contract-body");
      var open = body.hidden;
      body.hidden = !open;
      ctToggle.setAttribute("aria-expanded", open ? "true" : "false");
      var chev = ctToggle.querySelector(".wu-contract-chev");
      if (chev) chev.textContent = open ? "▾" : "▸";
    });

    // Lock/unlock
    $("wu-lock-btn").addEventListener("click", async function () {
      if (!wuCanEdit()) { toast("error", "Je hebt alleen een kijkfunctie voor de urenregistratie"); return; }
      var profile = window.profilesDB && window.profilesDB.getCurrentSync ? window.profilesDB.getCurrentSync() : null;
      var medId = profile ? (profile.medewerkerId || profile.medewerker_id || null) : null;
      if (!medId) { toast("error", "Geen gekoppelde medewerker bij dit profiel"); return; }
      var locked = window.werkurenVergrendeldDB.isLockedSync(medId, state.year, state.month);
      try {
        if (locked) { await window.werkurenVergrendeldDB.unlock(medId, state.year, state.month); toast("info", "Maand ontgrendeld"); }
        else { await window.werkurenVergrendeldDB.lock(medId, state.year, state.month); toast("saved", "Maand vergrendeld"); }
        updateLockButton();
      } catch (e) { toast("error", "Mislukt: " + (e && e.message ? e.message : String(e))); }
    });

    // Export
    $("wu-export-btn").addEventListener("click", doExport);

    // Edit form
    $("wu-edit-close").addEventListener("click", function () { hideModal("wu-edit-modal"); });
    $("wu-edit-cancel").addEventListener("click", function () { hideModal("wu-edit-modal"); });
    $("wu-edit-form").addEventListener("submit", submitEdit);

    // Purge slider
    $("wu-purge-close").addEventListener("click", function () { hideModal("wu-purge-modal"); });
    $("wu-purge-cancel").addEventListener("click", function () { hideModal("wu-purge-modal"); });
    wireSliderConfirm("wu-purge-slider", "wu-purge-confirm");
    $("wu-purge-confirm").addEventListener("click", confirmPurge);

    // Escape sluit topmost open modal
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var openModals = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"));
      if (openModals.length === 0) return;
      var topmost = openModals[openModals.length - 1];
      topmost.hidden = true; topmost.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
    });

    // Overlay-click sluit
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          overlay.hidden = true; overlay.setAttribute("aria-hidden", "true");
          if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
        }
      });
    });

    // Live re-render bij data-changes
    window.addEventListener("ff:werkuren-updated", function () { refreshAllOptions(); renderAll(); });
    window.addEventListener("ff:werkuren-vergrendeld-updated", updateLockButton);
    window.addEventListener("ff:medewerkers-updated", function () { refreshAllOptions(); renderAll(); });
    window.addEventListener("ff:clienten-updated", function () { rebuildLookups(); refreshAllOptions(); renderAll(); });
    window.addEventListener("ff:beschikkingen-updated", function () { rebuildLookups(); refreshAllOptions(); renderAll(); });
    window.addEventListener("beschikkingen:changed", function () { rebuildLookups(); refreshAllOptions(); renderAll(); });
    window.addEventListener("ff:locaties-updated", function () { rebuildLookups(); renderAll(); });
    window.addEventListener("ff:werkuren-labels-updated", refreshAllOptions);
    // Re-render zodra permissies geladen zijn → kijkfunctie (HR/Facilitair) krijgt geen
    // bewerk-knoppen, bewerkers (manage-employee-registered-hours) wél.
    try { if (window.ffPermissionsReady && window.ffPermissionsReady.then) window.ffPermissionsReady.then(renderAll); } catch (e) { /* */ }
  }

  function init() {
    wireUp();
    rebuildLookups();
    syncModeButtons();
    renderCalendar();
    renderAll();
    initChips();
    updateFiltersClearBtn();

    // Zodra alle data-lagen geladen zijn: lookups + opties + re-render.
    var readies = [
      window.medewerkersDB && window.medewerkersDB.ready,
      window.clientenDB && window.clientenDB.ready,
      window.werkurenDB && window.werkurenDB.ready,
      window.werkurenLabelsDB && window.werkurenLabelsDB.ready,
      window.beschikkingenDB && window.beschikkingenDB.ready,
      window.locatiesDB && window.locatiesDB.ready,
    ].filter(Boolean);
    Promise.all(readies.map(function (p) { return Promise.resolve(p).catch(function () {}); })).then(function () {
      rebuildLookups();
      initChips();
      refreshAllOptions();
      renderCalendar();
      renderAll();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
