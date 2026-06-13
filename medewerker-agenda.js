/* global window, document */
/**
 * medewerker-agenda.js — agenda-perspectief van een specifieke medewerker.
 *
 * BS1-feature (PR #4 Tijdregistratie, 2026-05-27). BS2 had "Bekijken in
 * agenda"-knop kapot (routet naar /home). Wij bouwen dit zelf:
 *   - Week-/maand-kalender vanuit medewerker-perspectief
 *   - Werkuren (uit public.werkuren) + geplande diensten (uit public.planning)
 *     naast elkaar, met dag-totalen
 *   - Klik op dag → detail-tabel onder de kalender
 *
 * URL-pattern: medewerker-agenda.html?id=<medewerker-uuid>
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
  function getQueryParam(name) {
    var u = new URL(window.location.href);
    return u.searchParams.get(name) || "";
  }

  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  function initialsFromName(naam) {
    var parts = String(naam || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function fmtTime(t) {
    if (!t) return "";
    var s = String(t);
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    return m ? pad2(m[1]) + ":" + m[2] : s;
  }
  function fmtIsoTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function fmtDuur(minutes) {
    var n = Number(minutes || 0);
    if (n <= 0) return "0u";
    var h = Math.floor(n / 60);
    var m = n % 60;
    if (m === 0) return h + "u";
    return h + "u " + m + "m";
  }
  function fmtHoursDecimal(minutes) {
    var v = Math.round((Number(minutes || 0) / 60) * 100) / 100;
    return v.toFixed(2).replace(".", ",");
  }
  function getClientNaam(id) {
    if (!id) return "";
    if (window.clientenDB && typeof window.clientenDB.getByIdSync === "function") {
      var c = window.clientenDB.getByIdSync(id);
      if (c) return ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
    }
    return "";
  }
  function dateKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // -------- State --------
  var today = new Date();
  var state = {
    medewerkerId: getQueryParam("id") || "",
    medewerker: null,
    medewerkerNaam: "",
    year: today.getFullYear(),
    month: today.getMonth() + 1, // 1..12
    selectedDateKey: null,
  };

  function toast(msg) {
    var t = $("med-ag-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 1800);
  }

  function loadMedewerker() {
    if (!state.medewerkerId) {
      $("med-ag-name").textContent = "Geen medewerker geselecteerd";
      $("med-ag-sub").textContent = "Voeg ?id=<uuid> toe aan de URL.";
      return;
    }
    if (!window.medewerkersDB) {
      $("med-ag-name").textContent = "Bezig met laden…";
      return;
    }
    var mw = window.medewerkersDB.getByIdSync(state.medewerkerId);
    if (!mw) {
      $("med-ag-name").textContent = "Medewerker niet gevonden";
      return;
    }
    state.medewerker = mw;
    var naam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim() || "(zonder naam)";
    state.medewerkerNaam = naam;
    $("med-ag-name").textContent = naam;
    $("med-ag-avatar").textContent = initialsFromName(naam);
    $("med-ag-sub").textContent = "Persoonlijke agenda — registreerde uren + geplande diensten";
  }

  function getWerkurenForMonth() {
    if (!window.werkurenDB || typeof window.werkurenDB.getForMedewerkerMonthSync !== "function") return [];
    return window.werkurenDB.getForMedewerkerMonthSync(state.medewerkerId, state.year, state.month) || [];
  }
  function getPlanningForMonth() {
    if (!window.planningDB || typeof window.planningDB.getAllSync !== "function") return [];
    var naam = state.medewerkerNaam.toLowerCase().trim();
    if (!naam) return [];
    var monthStart = new Date(state.year, state.month - 1, 1);
    var monthEnd = new Date(state.year, state.month, 0, 23, 59, 59, 999);
    return window.planningDB.getAllSync().filter(function (p) {
      if (!p || p.archived) return false;
      var tl = String(p.teamlid || "").toLowerCase().trim();
      if (!tl || tl !== naam) return false;
      var s = p.startIso || p.start_iso;
      if (!s) return false;
      var d = new Date(s);
      if (isNaN(d.getTime())) return false;
      return d >= monthStart && d <= monthEnd;
    });
  }

  function buildDayMap(werkuren, planning) {
    var map = {}; // dateKey → { werkuren: [], planning: [] }
    werkuren.forEach(function (r) {
      if (!r.datum) return;
      var d = new Date(r.datum);
      if (isNaN(d.getTime())) return;
      var k = dateKey(d);
      if (!map[k]) map[k] = { werkuren: [], planning: [] };
      map[k].werkuren.push(r);
    });
    planning.forEach(function (p) {
      var s = p.startIso || p.start_iso;
      if (!s) return;
      var d = new Date(s);
      if (isNaN(d.getTime())) return;
      var k = dateKey(d);
      if (!map[k]) map[k] = { werkuren: [], planning: [] };
      map[k].planning.push(p);
    });
    return map;
  }

  function renderHeader() {
    var monthName = MONTHS_NL[state.month - 1] || "—";
    var monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    $("med-ag-month").textContent = monthCap + " " + state.year;
  }

  function renderGrid() {
    var grid = $("med-ag-grid");
    if (!grid) return;
    var werkuren = getWerkurenForMonth();
    var planning = getPlanningForMonth();
    var map = buildDayMap(werkuren, planning);

    // Maand-info: dagen + week-start (maandag = 0)
    var firstOfMonth = new Date(state.year, state.month - 1, 1);
    // JS: getDay() 0=zondag..6=zaterdag. Wij willen maandag=0..zondag=6
    var startDow = (firstOfMonth.getDay() + 6) % 7;
    var daysInMonth = new Date(state.year, state.month, 0).getDate();
    var daysInPrev = new Date(state.year, state.month - 1, 0).getDate();

    var html = "";

    // Lege cellen vóór dag 1 (vorige maand)
    for (var i = startDow; i > 0; i--) {
      var prevDay = daysInPrev - i + 1;
      html += '<div class="med-ag-cell med-ag-cell--out">' +
        '<div class="med-ag-cell-day">' + prevDay + '</div>' +
        '</div>';
    }

    var todayKey = dateKey(new Date());
    for (var d = 1; d <= daysInMonth; d++) {
      var dateObj = new Date(state.year, state.month - 1, d);
      var k = dateKey(dateObj);
      var entry = map[k] || { werkuren: [], planning: [] };
      var wuCount = entry.werkuren.length;
      var plCount = entry.planning.length;
      var totMin = entry.werkuren.reduce(function (acc, r) { return acc + Number(r.duur_minuten || 0); }, 0);

      var classes = "med-ag-cell";
      if (k === todayKey) classes += " med-ag-cell--today";
      if (k === state.selectedDateKey) classes += " med-ag-cell--selected";
      if (!wuCount && !plCount) classes += " med-ag-cell--empty";

      var badges = "";
      if (wuCount > 0) {
        badges += '<span class="med-ag-badge med-ag-badge--wu" title="' + wuCount + ' werkuur-registratie(s) — ' + fmtDuur(totMin) + '">' + fmtDuur(totMin) + '</span>';
      }
      if (plCount > 0) {
        badges += '<span class="med-ag-badge med-ag-badge--pl" title="' + plCount + ' geplande dienst(en)">' + plCount + ' dienst' + (plCount === 1 ? "" : "en") + '</span>';
      }

      html += '<button type="button" class="' + classes + '" data-key="' + k + '">' +
        '<div class="med-ag-cell-day">' + d + '</div>' +
        '<div class="med-ag-cell-body">' + badges + '</div>' +
        '</button>';
    }

    // Trail: opvullen tot een vol aantal weken (multiple of 7)
    var totalCells = startDow + daysInMonth;
    var trail = (7 - (totalCells % 7)) % 7;
    for (var t = 1; t <= trail; t++) {
      html += '<div class="med-ag-cell med-ag-cell--out">' +
        '<div class="med-ag-cell-day">' + t + '</div>' +
        '</div>';
    }

    grid.innerHTML = html;
    grid.querySelectorAll(".med-ag-cell[data-key]").forEach(function (c) {
      c.addEventListener("click", function () {
        var k = c.getAttribute("data-key");
        state.selectedDateKey = state.selectedDateKey === k ? null : k;
        renderGrid();
        renderDetail();
      });
    });

    // Totals
    var totMin = werkuren.reduce(function (acc, r) { return acc + Number(r.duur_minuten || 0); }, 0);
    var uniqClients = {};
    werkuren.forEach(function (r) { if (r.client_id) uniqClients[r.client_id] = 1; });
    $("med-ag-total-hours").textContent = fmtHoursDecimal(totMin);
    $("med-ag-total-entries").textContent = String(werkuren.length);
    $("med-ag-total-clients").textContent = String(Object.keys(uniqClients).length);
    $("med-ag-total-shifts").textContent = String(planning.length);
  }

  function renderDetail() {
    var det = $("med-ag-detail");
    if (!det) return;
    if (!state.selectedDateKey) {
      det.hidden = true;
      return;
    }
    var werkuren = getWerkurenForMonth();
    var planning = getPlanningForMonth();
    var map = buildDayMap(werkuren, planning);
    var entry = map[state.selectedDateKey] || { werkuren: [], planning: [] };
    var parts = state.selectedDateKey.split("-");
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var label = d.getDate() + " " + MONTHS_NL[d.getMonth()] + " " + d.getFullYear();
    $("med-ag-detail-title").textContent = "Details van " + label;

    var tbody = $("med-ag-detail-tbody");
    if (!tbody) return;

    var html = "";
    if (!entry.werkuren.length && !entry.planning.length) {
      html = '<tr><td colspan="6" class="incident-empty">Geen werkuren of geplande diensten op deze dag</td></tr>';
    } else {
      entry.werkuren.sort(function (a, b) { return String(a.starttijd || "").localeCompare(String(b.starttijd || "")); });
      entry.werkuren.forEach(function (r) {
        var cnaam = r.client_label || getClientNaam(r.client_id) || "—";
        var tijd = (r.starttijd || r.eindtijd) ? (fmtTime(r.starttijd) + " - " + fmtTime(r.eindtijd)) : "—";
        html += '<tr class="med-ag-row med-ag-row--wu">' +
          '<td><span class="med-ag-type med-ag-type--wu">Werkuren</span></td>' +
          '<td>' + escHtml(tijd) + '</td>' +
          '<td>' + escHtml(fmtDuur(r.duur_minuten)) + '</td>' +
          '<td>' + escHtml(cnaam) + '</td>' +
          '<td>' + escHtml(r.label || "—") + '</td>' +
          '<td>' + escHtml(r.beschrijving || "—") + '</td>' +
          '</tr>';
      });
      entry.planning.sort(function (a, b) {
        var sa = a.startIso || a.start_iso || "";
        var sb = b.startIso || b.start_iso || "";
        return String(sa).localeCompare(String(sb));
      });
      entry.planning.forEach(function (p) {
        var s = p.startIso || p.start_iso;
        var e = p.eindeIso || p.einde_iso;
        var tijd = (s || e) ? (fmtIsoTime(s) + " - " + fmtIsoTime(e)) : "—";
        var dur = "";
        if (s && e) {
          var ds = new Date(s).getTime();
          var de = new Date(e).getTime();
          if (ds && de && de > ds) dur = fmtDuur(Math.round((de - ds) / 60000));
        }
        var locDienst = (p.client || "") + (p.locatie ? " · " + p.locatie : "") + (p.diensttype ? " · " + p.diensttype : "");
        html += '<tr class="med-ag-row med-ag-row--pl">' +
          '<td><span class="med-ag-type med-ag-type--pl">Geplande dienst</span></td>' +
          '<td>' + escHtml(tijd) + '</td>' +
          '<td>' + escHtml(dur) + '</td>' +
          '<td>' + escHtml(locDienst.trim() || "—") + '</td>' +
          '<td>—</td>' +
          '<td>' + escHtml(p.functie || "—") + '</td>' +
          '</tr>';
      });
    }
    tbody.innerHTML = html;
    det.hidden = false;
  }

  function renderAll() {
    renderHeader();
    renderGrid();
    renderDetail();
  }

  // -------- Wire-up --------
  function setupNav() {
    $("med-ag-prev").addEventListener("click", function () {
      if (state.month === 1) { state.month = 12; state.year -= 1; }
      else state.month -= 1;
      state.selectedDateKey = null;
      renderAll();
    });
    $("med-ag-next").addEventListener("click", function () {
      if (state.month === 12) { state.month = 1; state.year += 1; }
      else state.month += 1;
      state.selectedDateKey = null;
      renderAll();
    });
    $("med-ag-today").addEventListener("click", function () {
      var n = new Date();
      state.year = n.getFullYear();
      state.month = n.getMonth() + 1;
      state.selectedDateKey = dateKey(n);
      renderAll();
    });
    $("med-ag-back-btn").addEventListener("click", function () {
      if (state.medewerkerId) {
        window.location.href = "medewerker-detail.html?id=" + encodeURIComponent(state.medewerkerId);
      } else {
        window.history.back();
      }
    });
  }

  // Re-render bij data-updates
  function setupEvents() {
    ["ff:werkuren-updated", "ff:planning-updated", "ff:medewerkers-updated", "ff:clienten-updated"].forEach(function (evt) {
      window.addEventListener(evt, function () {
        if (!state.medewerker) loadMedewerker();
        renderAll();
      });
    });
  }

  // Init
  function init() {
    setupNav();
    setupEvents();
    loadMedewerker();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
