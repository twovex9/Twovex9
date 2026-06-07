/* global window, document */
/**
 * incidenten-dashboard.js — Live dashboard voor incidenten.
 *
 * Bron-van-waarheid: window.incidentenDB (Supabase). Alle visualisaties
 * worden gerenderd uit de in-memory cache van de data-layer en automatisch
 * opnieuw getekend zodra er een mutatie is (besa:incidenten-updated).
 *
 * Geen externe charting library: alle charts zijn pure SVG / HTML / CSS.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    rangePreset: "30",     // '7' | '30' | '90' | '365' | 'all' | 'custom'
    dateFrom: null,         // Date | null  (start of day, inclusive)
    dateTo: null,           // Date | null  (end of day, inclusive)
    filterClient: "",
    filterMedewerker: "",
    filterLocatie: "",
    filterCategorie: "",
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, "0"); }

  function getAllIncidenten() {
    if (!window.incidentenDB) return [];
    try { return window.incidentenDB.getAllSync() || []; } catch (e) { return []; }
  }
  function getAllClienten() {
    if (!window.clientenDB) return [];
    try { return window.clientenDB.getAllSync() || []; } catch (e) { return []; }
  }
  function getAllMedewerkers() {
    if (!window.medewerkersDB) return [];
    try { return window.medewerkersDB.getAllSync() || []; } catch (e) { return []; }
  }
  function getAllLocaties() {
    if (!window.locatiesDB) return [];
    try { return window.locatiesDB.getAllSync() || []; } catch (e) { return []; }
  }
  function findById(arr, id) {
    if (!id) return null;
    var s = String(id);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === s) return arr[i];
    }
    return null;
  }
  function clientLabel(c) {
    if (!c) return "—";
    var nm = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
    if (c.clientnummer) nm += " (" + c.clientnummer + ")";
    return nm || "—";
  }
  function medewerkerLabel(m) {
    if (!m) return "—";
    return (((m.voornaam || "") + " " + (m.achternaam || "")).trim()) || "—";
  }
  function locatieLabel(l) { return l && l.naam ? l.naam : "—"; }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(value); if (!isFinite(t)) return "—";
    var d = new Date(t);
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function formatNlDateTime(value) {
    if (!value) return "—";
    var t = Date.parse(value); if (!isFinite(t)) return "—";
    var d = new Date(t);
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear()
      + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function isoToInputDate(d) {
    if (!d) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function inputDateToDate(s, endOfDay) {
    if (!s) return null;
    var d = new Date(s + (endOfDay ? "T23:59:59" : "T00:00:00"));
    return isFinite(d.getTime()) ? d : null;
  }
  function startOfDay(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return x;
  }

  function statusInfo(status) {
    var rec = (window.incidentenDB && window.incidentenDB.STATUSES || []).find(function (s) {
      return s.value === status;
    });
    return rec || { value: status, label: status, className: "incident-status--default" };
  }

  // ---------------------------------------------------------------------------
  // Date-range presets
  // ---------------------------------------------------------------------------
  // BS1-huisstijl datum-range component (besa-daterange.js). De preset-
  // knoppen (7d/30d/…) zetten de verborgen inputs direct; daarna syncen we
  // de pill zodat hij de gekozen periode toont.
  var drWidget = null;
  function syncDateWidget() {
    if (!drWidget) return;
    var f = $("id-date-from"), t = $("id-date-to");
    drWidget.setRange(f ? f.value : "", t ? t.value : "");
  }

  function applyPreset(preset) {
    state.rangePreset = preset;
    if (preset === "all") {
      state.dateFrom = null;
      state.dateTo = null;
    } else if (preset === "month") {
      // Standaard bij openen/refresh: 1e t/m laatste dag van de HUIDIGE
      // maand (dynamisch uit de datum van dat moment) — user-keuze.
      var nu = new Date();
      state.dateFrom = startOfDay(new Date(nu.getFullYear(), nu.getMonth(), 1));
      state.dateTo = new Date(nu.getFullYear(), nu.getMonth() + 1, 0, 23, 59, 59);
    } else {
      var days = parseInt(preset, 10) || 30;
      var to = new Date();
      var from = new Date();
      from.setDate(to.getDate() - (days - 1));
      state.dateFrom = startOfDay(from);
      state.dateTo = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);
    }
    var fromEl = $("id-date-from"), toEl = $("id-date-to");
    if (fromEl) fromEl.value = state.dateFrom ? isoToInputDate(state.dateFrom) : "";
    if (toEl) toEl.value = state.dateTo ? isoToInputDate(state.dateTo) : "";
    renderPresetButtons();
    syncDateWidget();
  }

  function renderPresetButtons() {
    var btns = document.querySelectorAll(".id-range-preset");
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-range") === state.rangePreset);
    });
  }

  // ---------------------------------------------------------------------------
  // Filter pipeline
  // ---------------------------------------------------------------------------
  // 1-op-1 BS2 (recorder-bewijs 2026-05-17): BS2's dashboard filtert op
  // created_at (= BS1 `aanmaakdatum`, registratiedatum), NIET op
  // incident_date (gebeurtenisdatum). Met aanmaakdatum matchen april=104,
  // 14-30apr=90, maart=0, feb=1 exact. Vergelijk op kalenderdatum-string
  // (YYYY-MM-DD) i.p.v. timestamp-math — voorkomt tijdzone-off-by-one.
  function ymd(dOrStr) {
    if (!dOrStr) return "";
    if (typeof dOrStr === "string") return dOrStr.slice(0, 10);
    var d = dOrStr;
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function getFilteredIncidenten() {
    var rows = getAllIncidenten().filter(function (i) { return i && !i.archived; });

    if (state.dateFrom) {
      var fromY = ymd(state.dateFrom);
      rows = rows.filter(function (i) {
        var d = ymd(i.aanmaakdatum);
        return d && d >= fromY;
      });
    }
    if (state.dateTo) {
      var toY = ymd(state.dateTo);
      rows = rows.filter(function (i) {
        var d = ymd(i.aanmaakdatum);
        return d && d <= toY;
      });
    }
    if (state.filterClient) rows = rows.filter(function (i) { return String(i.clientId || "") === state.filterClient; });
    if (state.filterLocatie) rows = rows.filter(function (i) { return ((i.locatieBs2 && i.locatieBs2.name) || "") === state.filterLocatie; });
    if (state.filterCategorie) rows = rows.filter(function (i) { return i.categorie === state.filterCategorie; });
    if (state.filterMedewerker) {
      var m = state.filterMedewerker;
      rows = rows.filter(function (i) {
        return String(i.melderId || "") === m || String(i.beoordelaarId || "") === m;
      });
    }
    return rows;
  }

  // average_resolution_time: gem. uren tussen created_at (aanmaakdatum) en
  // resolved_at (afgehandeld_op) over afgehandelde (status 'opgelost')
  // incidenten IN DE PERIODE — exact BS2's formule (null als er geen zijn).
  function computeAvgResolutionHours(set) {
    var spans = [];
    set.forEach(function (i) {
      if (!i || i.status !== "opgelost") return;
      var created = Date.parse(i.aanmaakdatum || "");
      var resolved = Date.parse(i.afgehandeldOp || "");
      if (!isFinite(created) || !isFinite(resolved) || resolved < created) return;
      spans.push((resolved - created) / 3600000);
    });
    if (spans.length === 0) return { hours: 0, count: 0 };
    var sum = spans.reduce(function (a, b) { return a + b; }, 0);
    return { hours: sum / spans.length, count: spans.length };
  }

  // ---------------------------------------------------------------------------
  // KPI's — 1-op-1 BS2 /api/incidents/dashboard
  // ---------------------------------------------------------------------------
  function renderKpis() {
    // 1-op-1 BS2 /api/incidents/dashboard: overview + status_distribution +
    // average_resolution_time zijn PERIODE-AFHANKELIJK — ze filteren op de
    // incident-datum in [start,end] (+ client/medewerker/locatie/categorie),
    // exact zoals BS2 server-side doet. (Recorder 2026-05-17 bewees dit:
    // april=104, mei=40, maart=0, feb=1, client-filter=4, …)
    var rows = getFilteredIncidenten();
    var total = rows.length;
    var afw = rows.filter(function (i) { return i.status === "in_afwachting"; }).length;
    var beh = rows.filter(function (i) { return i.status === "in_behandeling"; }).length;
    var op  = rows.filter(function (i) { return i.status === "opgelost"; }).length;
    // BS2: percentage = count / total * 100.
    var pct = function (n) { return total === 0 ? "0%" : Math.round((n * 100) / total) + "%"; };

    $("id-kpi-total").textContent = String(total);
    $("id-kpi-afwachting").textContent = String(afw);
    $("id-kpi-behandeling").textContent = String(beh);
    $("id-kpi-opgelost").textContent = String(op);
    $("id-kpi-rate").textContent = pct(op);
    $("id-kpi-afwachting-sub").textContent = pct(afw) + " van totaal";
    $("id-kpi-behandeling-sub").textContent = pct(beh) + " van totaal";
    $("id-kpi-opgelost-sub").textContent = pct(op) + " van totaal";

    // average_resolution_time { hours, note } — 1-op-1 BS2. hours = null als
    // er geen afgehandelde incidenten in de periode zijn (BS2 geeft dan
    // null terug); de note is BS2's vaste metric-omschrijving en wordt
    // áltijd getoond (zoals BS2).
    var ar = computeAvgResolutionHours(rows);
    var arEl = $("id-kpi-resolution");
    var arSub = $("id-kpi-resolution-sub");
    if (arEl) {
      arEl.textContent = (ar.count === 0)
        ? "—"
        : (Math.round(ar.hours * 10) / 10).toLocaleString("nl-NL") + " u";
    }
    if (arSub) {
      arSub.textContent = "Gemiddelde tijd tussen het aanmaken van een incident en de afhandeling ervan.";
    }

    // Trend laatste 7 dagen (binnen filter — vaste 7d ongeacht preset)
    var allInRange = getAllIncidenten().filter(function (i) {
      if (!i || i.archived) return false;
      if (state.filterClient && String(i.clientId || "") !== state.filterClient) return false;
      if (state.filterLocatie && ((i.locatieBs2 && i.locatieBs2.name) || "") !== state.filterLocatie) return false;
      if (state.filterCategorie && i.categorie !== state.filterCategorie) return false;
      if (state.filterMedewerker) {
        var m = state.filterMedewerker;
        if (String(i.melderId || "") !== m && String(i.beoordelaarId || "") !== m) return false;
      }
      return true;
    });
    var now = Date.now();
    var sevenDays = 7 * 86400 * 1000;
    var prev7 = allInRange.filter(function (i) {
      var t = Date.parse(i.aanmaakdatum || 0);
      return isFinite(t) && t < (now - sevenDays) && t >= (now - 2 * sevenDays);
    }).length;
    var last7 = allInRange.filter(function (i) {
      var t = Date.parse(i.aanmaakdatum || 0);
      return isFinite(t) && t >= (now - sevenDays) && t <= now;
    }).length;
    $("id-kpi-week").textContent = String(last7);
    var delta = last7 - prev7;
    var sub = $("id-kpi-week-sub");
    var rel = prev7 === 0 ? (last7 === 0 ? "geen verandering" : "+" + last7 + " (nieuw)")
                          : (delta > 0 ? "+" + delta + " vs vorige 7d"
                            : delta < 0 ? delta + " vs vorige 7d"
                            : "gelijk aan vorige 7d");
    sub.textContent = rel;
    sub.classList.toggle("is-up", delta > 0);
    sub.classList.toggle("is-down", delta < 0);

    // Periode-afhankelijk (1-op-1 BS2): toon het actieve datumbereik.
    var totalSub = $("id-kpi-total-sub");
    if (totalSub) {
      totalSub.textContent = (state.dateFrom && state.dateTo)
        ? (formatNlDate(state.dateFrom) + " — " + formatNlDate(state.dateTo))
        : "alle incidenten";
    }
  }

  // ---------------------------------------------------------------------------
  // Trend chart (line, last N days based on range)
  // ---------------------------------------------------------------------------
  function renderTrend() {
    var rows = getFilteredIncidenten();
    // 1-op-1 BS2 last_7_days: exact één bucket per dag van start t/m eind
    // (inclusief, GEEN minimum van 7). Met een datumbereik (alle presets
    // behalve 'Alles', plus custom) loopt de trend over precies dat bereik.
    var bucketDays, endDay, spanAll = false;
    if (state.dateFrom && state.dateTo) {
      bucketDays = Math.round(
        (startOfDay(state.dateTo) - startOfDay(state.dateFrom)) / 86400000
      ) + 1;
      endDay = startOfDay(state.dateTo);
    } else {
      // 'Alles' (geen datumbereik): span de trend over álle aanwezige
      // incidenten (oudste t/m nieuwste aanmaakdatum) i.p.v. een vaste week,
      // zodat het totaal-trendbeeld klopt i.p.v. een lege grafiek wanneer de
      // recentste incidenten ouder dan 7 dagen zijn. Geen data → laatste 7
      // dagen t/m vandaag (zoals voorheen).
      var stamps = [];
      rows.forEach(function (r) {
        var t = Date.parse(r.aanmaakdatum || 0);
        if (isFinite(t)) stamps.push(t);
      });
      if (stamps.length) {
        var minDay = startOfDay(new Date(Math.min.apply(null, stamps)));
        endDay = startOfDay(new Date(Math.max.apply(null, stamps)));
        bucketDays = Math.round((endDay - minDay) / 86400000) + 1;
        spanAll = true;
      } else {
        endDay = startOfDay(new Date());
        bucketDays = 7;
      }
    }
    if (bucketDays < 1) bucketDays = 1;
    if (bucketDays > 366) bucketDays = 366;

    var labels = [];
    var counts = [];
    for (var i = bucketDays - 1; i >= 0; i--) {
      var d = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - i);
      labels.push(d);
      counts.push(0);
    }
    // Tel per kalenderdatum op created_at (aanmaakdatum), exact zoals BS2
    // last_7_days — tijdzone-veilig (geen Date→local conversie van de stamp).
    var keyIdx = {};
    for (var k = 0; k < labels.length; k += 1) keyIdx[ymd(labels[k])] = k;
    rows.forEach(function (r) {
      var idx = keyIdx[ymd(r.aanmaakdatum)];
      if (idx != null) counts[idx] += 1;
    });

    var sub = $("id-trend-sub");
    if (sub) sub.textContent = spanAll
      ? ("Alle incidenten · " + formatNlDate(labels[0]) + " — " + formatNlDate(labels[labels.length - 1]))
      : ("Laatste " + bucketDays + " dagen");

    var summary = $("id-trend-summary");
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var avg = (total / bucketDays).toFixed(1);
    var max = Math.max.apply(null, counts);
    var maxIdx = counts.indexOf(max);
    summary.innerHTML = '<span class="id-trend-badge"><b>' + total + '</b> totaal</span>'
      + '<span class="id-trend-badge"><b>' + avg + '</b> /dag gemid.</span>'
      + '<span class="id-trend-badge"><b>' + max + '</b> piek (' + formatNlDate(labels[maxIdx]) + ')</span>';

    drawLineChart($("id-trend-wrap"), labels, counts);
  }

  function drawLineChart(host, labels, counts) {
    if (!host) return;
    var w = host.clientWidth || 800;
    var h = 240;
    var padL = 36, padR = 18, padT = 14, padB = 28;
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var n = counts.length;
    if (n === 0) { host.innerHTML = ""; return; }
    var max = Math.max.apply(null, counts);
    var yMax = Math.max(4, Math.ceil(max * 1.2));
    var stepX = n > 1 ? innerW / (n - 1) : 0;

    function x(i) { return padL + i * stepX; }
    function y(v) { return padT + innerH - (v / yMax) * innerH; }

    // Build path strings
    var linePts = counts.map(function (v, i) { return (i === 0 ? "M" : "L") + x(i) + " " + y(v); }).join(" ");
    var areaPts = "M" + x(0) + " " + y(0)
      + " " + counts.map(function (v, i) { return "L" + x(i) + " " + y(v); }).join(" ")
      + " L" + x(n - 1) + " " + y(0) + " Z";

    // Y-grid lines (4 segments)
    var grid = [];
    for (var g = 0; g <= 4; g++) {
      var gv = (yMax / 4) * g;
      var gy = y(gv);
      grid.push('<line class="id-grid-line" x1="' + padL + '" x2="' + (w - padR) + '" y1="' + gy + '" y2="' + gy + '" />');
      grid.push('<text class="id-axis" x="' + (padL - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + Math.round(gv) + '</text>');
    }

    // X-axis ticks (max 6 labels evenly spread)
    var tickCount = Math.min(6, n);
    var ticks = [];
    for (var t = 0; t < tickCount; t++) {
      var idx = Math.round((n - 1) * (t / (tickCount - 1 || 1)));
      var d = labels[idx];
      var lbl = pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
      ticks.push('<text class="id-axis" x="' + x(idx) + '" y="' + (h - padB + 18) + '" text-anchor="middle">' + lbl + '</text>');
    }

    // Markers (geen kale browser-title; custom tooltip hieronder).
    var markers = counts.map(function (v, i) {
      return '<circle class="id-line-pt" cx="' + x(i) + '" cy="' + y(v) + '" r="3.5"></circle>';
    }).join("");

    host.style.position = "relative";
    host.innerHTML = '<svg class="id-line-svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">'
      + '<defs><linearGradient id="id-line-grad" x1="0" x2="0" y1="0" y2="1">'
      + '<stop offset="0%" stop-color="var(--blue)" stop-opacity="0.28"/>'
      + '<stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/>'
      + '</linearGradient></defs>'
      + grid.join("")
      + '<path class="id-line-area" d="' + areaPts + '" fill="url(#id-line-grad)"/>'
      + '<path class="id-line-path" d="' + linePts + '" />'
      + markers
      + '<line class="id-trend-cursor-line" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + innerH) + '" style="display:none"/>'
      + '<circle class="id-trend-cursor-dot" r="5" style="display:none"/>'
      + ticks.join("")
      + '</svg>'
      + '<div class="id-trend-tip" role="status" hidden></div>';

    // Custom hover-tooltip: hover ergens over de grafiek → toont de
    // dichtstbijzijnde dag, bv. "17-05-2026 — 9 incidenten".
    var svgEl = host.querySelector(".id-line-svg");
    var tip = host.querySelector(".id-trend-tip");
    var curLine = host.querySelector(".id-trend-cursor-line");
    var curDot = host.querySelector(".id-trend-cursor-dot");
    if (svgEl && tip) {
      var showAt = function (clientX) {
        var r = svgEl.getBoundingClientRect();
        if (r.width <= 0) return;
        var svgX = ((clientX - r.left) / r.width) * w;
        var i = Math.round((svgX - padL) / (stepX || 1));
        if (i < 0) i = 0;
        if (i > n - 1) i = n - 1;
        var v = counts[i];
        tip.innerHTML = '<span class="id-trend-tip-d">' + formatNlDate(labels[i]) + '</span>'
          + '<span class="id-trend-tip-v">' + v + (v === 1 ? " incident" : " incidenten") + "</span>";
        tip.hidden = false;
        var px = (x(i) / w) * r.width;
        var py = (y(v) / h) * r.height;
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = px - tw / 2;
        if (left < 4) left = 4;
        if (left + tw > r.width - 4) left = r.width - 4 - tw;
        var top = py - th - 12;
        if (top < 2) top = py + 14;
        tip.style.left = Math.round(left) + "px";
        tip.style.top = Math.round(top) + "px";
        curLine.setAttribute("x1", x(i));
        curLine.setAttribute("x2", x(i));
        curLine.style.display = "";
        curDot.setAttribute("cx", x(i));
        curDot.setAttribute("cy", y(v));
        curDot.style.display = "";
      };
      var hide = function () {
        tip.hidden = true;
        if (curLine) curLine.style.display = "none";
        if (curDot) curDot.style.display = "none";
      };
      svgEl.addEventListener("pointermove", function (e) { showAt(e.clientX); });
      svgEl.addEventListener("pointerdown", function (e) { showAt(e.clientX); });
      svgEl.addEventListener("pointerleave", hide);
    }
  }

  // ---------------------------------------------------------------------------
  // Status donut
  // ---------------------------------------------------------------------------
  function renderDonut() {
    // 1-op-1 BS2 status_distribution — periode-afhankelijk, consistent met
    // de status-KPI's (zelfde gefilterde set).
    var rows = getFilteredIncidenten();
    var afw = rows.filter(function (i) { return i.status === "in_afwachting"; }).length;
    var beh = rows.filter(function (i) { return i.status === "in_behandeling"; }).length;
    var op  = rows.filter(function (i) { return i.status === "opgelost"; }).length;
    var total = afw + beh + op;
    var segments = [
      { key: "in_afwachting", label: "In afwachting", value: afw, color: "var(--yellow, #f59e0b)" },
      { key: "in_behandeling", label: "In behandeling", value: beh, color: "var(--blue, #2563eb)" },
      { key: "opgelost", label: "Opgelost", value: op, color: "var(--green, #16a34a)" },
    ];

    var size = 200, r = 70, c = size / 2, sw = 28;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var arcs = "";
    if (total > 0) {
      arcs = segments.map(function (s) {
        if (s.value === 0) return "";
        var len = (s.value / total) * circ;
        var dasharray = len + " " + (circ - len);
        var dashoffset = -offset;
        offset += len;
        return '<circle class="id-donut-arc" cx="' + c + '" cy="' + c + '" r="' + r
          + '" fill="none" stroke="' + s.color + '" stroke-width="' + sw
          + '" stroke-dasharray="' + dasharray + '" stroke-dashoffset="' + dashoffset
          + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>';
      }).join("");
    } else {
      arcs = '<circle cx="' + c + '" cy="' + c + '" r="' + r
        + '" fill="none" stroke="var(--bg-muted, #f0f1f4)" stroke-width="' + sw + '"/>';
    }

    var legend = segments.map(function (s) {
      var pct = total === 0 ? 0 : Math.round((s.value * 100) / total);
      return '<div class="id-legend-row">'
        + '<span class="id-legend-dot" style="background:' + s.color + '"></span>'
        + '<span class="id-legend-lbl">' + s.label + '</span>'
        + '<span class="id-legend-val">' + s.value + ' <span class="id-legend-pct">(' + pct + '%)</span></span>'
        + '</div>';
    }).join("");

    $("id-donut-wrap").innerHTML =
      '<div class="id-donut-svg-wrap">'
      + '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' + arcs + '</svg>'
      + '<div class="id-donut-center"><span class="id-donut-num">' + total + '</span><span class="id-donut-lbl">incidenten</span></div>'
      + '</div>'
      + '<div class="id-legend">' + legend + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Bar charts (categorie + locatie)
  // ---------------------------------------------------------------------------
  function renderBars(targetId, groupFn, opts) {
    var rows = getFilteredIncidenten();
    var counts = {};
    rows.forEach(function (r) {
      var k = groupFn(r); if (k == null) return;
      counts[k] = (counts[k] || 0) + 1;
    });
    var arr = Object.keys(counts).map(function (k) {
      return { key: k, label: opts.labelFn ? opts.labelFn(k) : k, value: counts[k] };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, opts.top || 5);

    var max = arr.reduce(function (m, x) { return Math.max(m, x.value); }, 0);
    var total = rows.length;
    var host = $(targetId);
    if (!host) return;
    if (arr.length === 0) {
      host.innerHTML = '<div class="id-empty">Geen data in deze periode</div>';
      return;
    }
    host.innerHTML = arr.map(function (it) {
      var pct = total === 0 ? 0 : Math.round((it.value * 100) / total);
      var w = max === 0 ? 0 : (it.value / max) * 100;
      return '<div class="id-bar-row" title="' + escHtml(it.label) + ': ' + it.value + ' (' + pct + '%)">'
        + '<div class="id-bar-lbl">' + escHtml(it.label) + '</div>'
        + '<div class="id-bar-track"><div class="id-bar-fill" style="width:' + w.toFixed(1) + '%;background:' + (opts.color || "var(--blue)") + '"></div></div>'
        + '<div class="id-bar-val">' + it.value + ' <span class="id-bar-pct">(' + pct + '%)</span></div>'
        + '</div>';
    }).join("");
  }

  // ---------------------------------------------------------------------------
  // Heatmap: dagdeel × dag van de week
  // Y: 4 dagdelen (00-06 nacht / 06-12 ochtend / 12-18 middag / 18-24 avond)
  // X: 7 dagen (ma–zo)
  // ---------------------------------------------------------------------------
  var DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  var SLOTS = [
    { lbl: "Nacht (00–06)", from: 0, to: 6 },
    { lbl: "Ochtend (06–12)", from: 6, to: 12 },
    { lbl: "Middag (12–18)", from: 12, to: 18 },
    { lbl: "Avond (18–24)", from: 18, to: 24 },
  ];

  function renderHeatmap() {
    var rows = getFilteredIncidenten();
    var grid = [];
    for (var s = 0; s < SLOTS.length; s++) {
      grid.push([0, 0, 0, 0, 0, 0, 0]);
    }
    rows.forEach(function (r) {
      var t = Date.parse(r.incidentDatum || 0);
      if (!isFinite(t)) return;
      var d = new Date(t);
      var dow = (d.getDay() + 6) % 7; // 0=Mon
      var hour = d.getHours();
      for (var i = 0; i < SLOTS.length; i++) {
        if (hour >= SLOTS[i].from && hour < SLOTS[i].to) { grid[i][dow]++; break; }
      }
    });
    var max = 0;
    grid.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });

    var html = '<div class="id-hm-grid">';
    html += '<div class="id-hm-corner"></div>';
    DAY_LABELS.forEach(function (d) { html += '<div class="id-hm-col-lbl">' + d + '</div>'; });
    for (var r = 0; r < SLOTS.length; r++) {
      html += '<div class="id-hm-row-lbl">' + SLOTS[r].lbl + '</div>';
      for (var c = 0; c < 7; c++) {
        var v = grid[r][c];
        var alpha = max === 0 ? 0 : 0.10 + (v / max) * 0.85;
        var bg = v === 0 ? "var(--bg-muted, #f3f4f6)" : "rgba(37, 99, 235, " + alpha.toFixed(2) + ")";
        var fg = (max > 0 && v / max > 0.5) ? "#fff" : "var(--text)";
        html += '<div class="id-hm-cell" title="' + SLOTS[r].lbl + ' — ' + DAY_LABELS[c] + ': ' + v + ' incident' + (v === 1 ? '' : 'en') + '" style="background:' + bg + ';color:' + fg + '">' + (v || "") + '</div>';
      }
    }
    html += '</div>';
    if (max === 0) {
      html += '<div class="id-empty id-empty--hm">Geen data om te visualiseren</div>';
    } else {
      html += '<div class="id-hm-legend">'
        + '<span>Minder</span>'
        + '<span class="id-hm-scale" aria-hidden="true"></span>'
        + '<span>Meer</span>'
        + '</div>';
    }
    $("id-heatmap").innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Top lists (cliënten + melders)
  // ---------------------------------------------------------------------------
  function renderTopList(targetId, groupFn, lookupFn, labelFn, opts) {
    var rows = getFilteredIncidenten();
    var counts = {};
    rows.forEach(function (r) {
      var id = groupFn(r); if (!id) return;
      counts[id] = (counts[id] || 0) + 1;
    });
    var arr = Object.keys(counts).map(function (id) {
      return { id: id, label: labelFn(lookupFn(id)), value: counts[id] };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, opts.top || 5);

    var host = $(targetId); if (!host) return;
    if (arr.length === 0) {
      host.innerHTML = '<div class="id-empty">Nog geen data</div>';
      return;
    }
    var max = arr[0].value;
    host.innerHTML = arr.map(function (it, idx) {
      var w = max === 0 ? 0 : (it.value / max) * 100;
      var initials = (it.label || "").trim().split(" ").map(function (s) { return s[0] || ""; }).join("").slice(0, 2).toUpperCase();
      return '<div class="id-toplist-row">'
        + '<span class="id-toplist-rank">' + (idx + 1) + '</span>'
        + '<span class="id-toplist-avatar">' + escHtml(initials || "—") + '</span>'
        + '<div class="id-toplist-body">'
        + '<div class="id-toplist-lbl">' + escHtml(it.label) + '</div>'
        + '<div class="id-toplist-bar"><div class="id-toplist-bar-fill" style="width:' + w.toFixed(1) + '%"></div></div>'
        + '</div>'
        + '<span class="id-toplist-val">' + it.value + '</span>'
        + '</div>';
    }).join("");
  }

  // ---------------------------------------------------------------------------
  // Recent activity (laatste 8 in periode op laatstGewijzigd)
  // ---------------------------------------------------------------------------
  function renderRecent() {
    var rows = getFilteredIncidenten().slice().sort(function (a, b) {
      return (Date.parse(b.laatstGewijzigd || 0) || 0) - (Date.parse(a.laatstGewijzigd || 0) || 0);
    }).slice(0, 8);
    var host = $("id-recent");
    if (!rows.length) {
      host.innerHTML = '<div class="id-empty">Geen activiteit in deze periode</div>';
      return;
    }
    host.innerHTML = rows.map(function (i) {
      var c = findById(getAllClienten(), i.clientId);
      var melder = findById(getAllMedewerkers(), i.melderId);
      var stat = statusInfo(i.status);
      return '<div class="id-recent-row" data-id="' + escHtml(i.id) + '">'
        + '<div class="id-recent-main">'
        + '<div class="id-recent-title">' + escHtml(clientLabel(c)) + ' <span class="id-recent-cat">· ' + escHtml(i.categorie || "Overig") + '</span></div>'
        + '<div class="id-recent-meta">' + escHtml(medewerkerLabel(melder)) + ' · ' + escHtml(formatNlDateTime(i.laatstGewijzigd)) + '</div>'
        + '</div>'
        + '<span class="incident-status-pill ' + stat.className + '">' + escHtml(stat.label) + '</span>'
        + '</div>';
    }).join("");

    Array.prototype.forEach.call(host.querySelectorAll(".id-recent-row"), function (row) {
      row.addEventListener("click", function () {
        var id = row.getAttribute("data-id");
        if (id) window.location.href = "incidenten.html?id=" + encodeURIComponent(id);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Dropdowns
  // ---------------------------------------------------------------------------
  function populateDropdowns() {
    fillSelect($("id-filter-client"), getAllClienten().filter(function (c) { return c && !c.archived; }), "Filter op cliënt", clientLabel, state.filterClient);
    fillSelect($("id-filter-medewerker"), getAllMedewerkers().filter(function (m) { return m && !m.archived; }), "Filter op medewerker", medewerkerLabel, state.filterMedewerker);
    // 1-op-1 BS2: filter op de BS2-locatienaam (de BS1-FK locatie_id is bij
    // gereconcilieerde incidenten leeg) — vul met de locaties die feitelijk
    // in de incidentendata voorkomen.
    var locNames = {};
    getAllIncidenten().forEach(function (i) {
      var n = i && i.locatieBs2 && i.locatieBs2.name;
      if (n) locNames[n] = 1;
    });
    var locItems = Object.keys(locNames).sort().map(function (n) { return { id: n, label: n }; });
    fillSelect($("id-filter-locatie"), locItems, "Filter op locatie", function (o) { return o.label; }, state.filterLocatie);
    var cats = (window.incidentenDB && window.incidentenDB.CATEGORIES) || [];
    fillSelect($("id-filter-categorie"), cats.map(function (c) { return { id: c, label: c }; }), "Filter op categorie", function (o) { return o.label; }, state.filterCategorie);
  }
  function fillSelect(sel, items, placeholder, labelFn, current) {
    if (!sel) return;
    sel.innerHTML = '<option value="">' + placeholder + '</option>';
    items.forEach(function (it) {
      var o = document.createElement("option");
      o.value = String(it.id); o.textContent = labelFn(it);
      sel.appendChild(o);
    });
    if (current != null) sel.value = String(current);
  }

  // ---------------------------------------------------------------------------
  // Slimme default-periode
  // ---------------------------------------------------------------------------
  // De default is de lopende maand (user-keuze, zie init). Bevat die maand nog
  // geen incidenten terwijl er wél data bestaat, schakel dan automatisch naar
  // 'Alles' — anders toont het dashboard een leeg totaaloverzicht (de
  // BS2-import loopt t/m mei en de lopende maand is doorgaans nog leeg). Zelf-
  // stoppend: na het schakelen is rangePreset !== 'month', dus latere renders
  // (én de data-load die async binnenkomt) laten de keuze ongemoeid en
  // overschrijven nooit een handmatig gekozen periode.
  function fallbackToAllIfMonthEmpty() {
    if (state.rangePreset !== "month") return;
    var all = getAllIncidenten().filter(function (i) { return i && !i.archived; });
    if (all.length === 0) return;                 // data nog niet geladen → later opnieuw
    if (getFilteredIncidenten().length === 0) applyPreset("all");
  }

  // ---------------------------------------------------------------------------
  // Master render
  // ---------------------------------------------------------------------------
  function renderAll() {
    fallbackToAllIfMonthEmpty();
    populateDropdowns();
    renderKpis();
    renderTrend();
    renderDonut();
    // 1-op-1 BS2 by_category / by_location: counts over de gefilterde
    // (periode) set. BS2 geeft alle categorieën/locaties terug → toon ze
    // allemaal (geen top-5-afkapping). by_location komt uit de BS2-locatie
    // (data.bs2_scrape.location → locatieBs2); de BS1-FK locatie_id is bij
    // de gereconcilieerde incidenten leeg.
    renderBars("id-bars-categorie", function (r) { return r.categorie || "Overig"; }, { top: 99, color: "var(--blue, #2563eb)" });
    renderBars("id-bars-locatie", function (r) { return (r.locatieBs2 && r.locatieBs2.name) || null; }, {
      top: 99, color: "var(--green, #16a34a)",
      labelFn: function (k) { return k; },
    });
    renderHeatmap();
    renderTopList("id-top-clienten", function (r) { return r.clientId; },
      function (id) { return findById(getAllClienten(), id); }, clientLabel, { top: 5 });
    renderTopList("id-top-melders", function (r) { return r.melderId; },
      function (id) { return findById(getAllMedewerkers(), id); }, medewerkerLabel, { top: 5 });
    renderRecent();
  }

  // ---------------------------------------------------------------------------
  // 3-maanden incidentrapport (downloadbaar Word-document)
  // ---------------------------------------------------------------------------
  // Repliceert BS2's "Genereer 3-maanden rapport": kies een jaar + 3
  // aaneengesloten maanden, krijg een kant-en-klare standaard-analyse als
  // downloadbaar bestand (Word .doc, opent direct in Word/LibreOffice).
  // De maand-indeling gebruikt — net als het dashboard en BS2 — de
  // aanmaakdatum (registratiedatum), op kalendermaand-string (tijdzone-veilig).
  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  var MONTHS_NL_SHORT = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
  function capMonth(i) { var m = MONTHS_NL[i] || ""; return m.charAt(0).toUpperCase() + m.slice(1); }

  // 1-op-1 BS2: nieuw-vanaf-nul = +100,00%; terug-naar-nul = -100,00%;
  // beide 0 = "—"; anders ((cur-prev)/prev)*100 met NL-komma + 2 decimalen.
  function pctChange(prev, cur) {
    if (prev === 0 && cur === 0) return "—";
    if (prev === 0) return "+100,00%";
    if (cur === 0) return "-100,00%";
    var v = ((cur - prev) / prev) * 100;
    return (v > 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + "%";
  }
  function pctOfTotal(n, total) {
    if (!total) return "0,0%";
    return (Math.round((n * 1000) / total) / 10).toFixed(1).replace(".", ",") + "%";
  }
  function monthKey(year, monthIdx) { return year + "-" + pad(monthIdx + 1); }
  function incidentsInMonth(all, year, monthIdx) {
    var key = monthKey(year, monthIdx);
    return all.filter(function (i) {
      return i && !i.archived && String(i.aanmaakdatum || "").slice(0, 7) === key;
    });
  }
  function isOpen(i) { return i && i.status !== "opgelost"; }

  // Verzamel het volledige analyse-model voor 3 aaneengesloten maanden.
  function buildReportModel(year, startMonth) {
    var all = getAllIncidenten();
    var clientsById = {};
    getAllClienten().forEach(function (c) { if (c) clientsById[String(c.id)] = c; });

    var monthIdxs = [startMonth, startMonth + 1, startMonth + 2];
    var months = monthIdxs.map(function (mi, pos) {
      var set = incidentsInMonth(all, year, mi);
      return {
        idx: mi, pos: pos, name: capMonth(mi), nameLower: MONTHS_NL[mi],
        set: set, total: set.length, open: set.filter(isOpen).length,
      };
    });
    var grandTotal = months.reduce(function (a, m) { return a + m.total; }, 0);

    // Incident type (categorie) × maand
    var typeKeys = {};
    months.forEach(function (m) {
      m.set.forEach(function (i) { typeKeys[i.categorie || "Overig"] = true; });
    });
    var types = Object.keys(typeKeys).sort(function (a, b) {
      return a.localeCompare(b, "nl", { sensitivity: "base" });
    }).map(function (t) {
      var perMonth = months.map(function (m) {
        return m.set.filter(function (i) { return (i.categorie || "Overig") === t; }).length;
      });
      return { naam: t, perMonth: perMonth, m2: perMonth[1], m3: perMonth[2], totaal: perMonth[0] + perMonth[1] + perMonth[2] };
    });

    // Locatie × maand (locaties zonder naam overslaan, zoals BS2 by_location)
    var locKeys = {};
    months.forEach(function (m) {
      m.set.forEach(function (i) {
        var n = i.locatieBs2 && i.locatieBs2.name;
        if (n) locKeys[n] = true;
      });
    });
    var locaties = Object.keys(locKeys).map(function (n) {
      var perMonth = months.map(function (m) {
        return m.set.filter(function (i) { return (i.locatieBs2 && i.locatieBs2.name) === n; }).length;
      });
      return { naam: n, perMonth: perMonth, verschil: perMonth[2] - perMonth[1], m2: perMonth[1], m3: perMonth[2] };
    }).sort(function (a, b) { return b.perMonth[2] - a.perMonth[2]; });

    // Cliëntnummers met meeste incidenten in de laatste maand
    var laatste = months[2];
    var clientCounts = {};
    laatste.set.forEach(function (i) {
      var c = clientsById[String(i.clientId)];
      var nr = c && c.clientnummer;
      if (!nr) return;
      clientCounts[nr] = (clientCounts[nr] || 0) + 1;
    });
    var topClienten = Object.keys(clientCounts).map(function (nr) {
      return { clientnummer: nr, aantal: clientCounts[nr] };
    }).sort(function (a, b) { return b.aantal - a.aantal; }).slice(0, 10);

    return {
      year: year, months: months, grandTotal: grandTotal,
      types: types, locaties: locaties, topClienten: topClienten,
    };
  }

  // Bouw het Word-document (HTML met Office-namespaces → opent in Word).
  function buildReportDoc(model) {
    var m = model.months;
    var title = "Incidentanalyse – " + m[0].name + " t/m " + m[2].name + " " + model.year;

    function tbl(headers, rows, numCols) {
      var thead = "<tr>" + headers.map(function (h) { return "<th>" + escHtml(h) + "</th>"; }).join("") + "</tr>";
      var tbody = rows.map(function (r) {
        return "<tr>" + r.map(function (c, ci) {
          var cls = (numCols && numCols.indexOf(ci) !== -1) ? " class='num'" : "";
          return "<td" + cls + ">" + escHtml(c) + "</td>";
        }).join("") + "</tr>";
      }).join("");
      return "<table><thead>" + thead + "</thead><tbody>" + tbody + "</tbody></table>";
    }
    function dash(n) { return n === 0 ? "—" : String(n); }

    var html = [];
    html.push("<h1>" + escHtml(title) + "</h1>");
    html.push("<p class='intro'>In de periode " + escHtml(m[0].name) + " tot en met "
      + escHtml(m[2].nameLower) + " " + model.year + " zijn er in totaal <b>"
      + model.grandTotal + "</b> incidentmeldingen geregistreerd.</p>");

    // 1. Aantal incidenten per maand
    html.push("<h2>1. Aantal incidenten per maand</h2>");
    html.push("<ul>" + m.map(function (mm, pos) {
      var extra = pos === 0 ? "" : " (" + pctChange(m[pos - 1].total, mm.total) + " t.o.v. " + m[pos - 1].nameLower + ")";
      return "<li><b>" + escHtml(mm.name) + "</b>: " + mm.total + " meldingen" + extra + "</li>";
    }).join("") + "</ul>");

    // 2. Openstaande meldingen per maand
    html.push("<h2>2. Openstaande meldingen per maand</h2>");
    html.push("<ul>" + m.map(function (mm, pos) {
      var extra = pos === 0 ? "" : " (" + pctChange(m[pos - 1].open, mm.open) + " t.o.v. " + m[pos - 1].nameLower + ")";
      return "<li><b>" + escHtml(mm.name) + "</b>: " + mm.open + " openstaande meldingen" + extra + "</li>";
    }).join("") + "</ul>");

    html.push(tbl(
      ["Maand", "Totaal", "Openstaand", "% t.o.v. vorige maand"],
      m.map(function (mm, pos) {
        return [mm.name, mm.total, mm.open, pos === 0 ? "—" : pctChange(m[pos - 1].total, mm.total)];
      }),
      [1, 2, 3]
    ));

    // 3. Incident type
    html.push("<h2>3. Incident type</h2>");
    if (model.types.length === 0) {
      html.push("<p class='muted'>Geen incidenten in deze periode.</p>");
    } else {
      html.push(tbl(
        ["Incident type", m[0].name, m[1].name, m[2].name],
        model.types.map(function (t) {
          return [t.naam, dash(t.perMonth[0]), dash(t.perMonth[1]), dash(t.perMonth[2])];
        }),
        [1, 2, 3]
      ));

      var top3 = model.types.slice().filter(function (t) { return t.m3 > 0; })
        .sort(function (a, b) { return b.m3 - a.m3; }).slice(0, 5);
      html.push("<h3>3.1 Top incidenten " + escHtml(m[2].nameLower) + "</h3>");
      if (top3.length) {
        html.push("<p>De meest voorkomende incidenttypes in " + escHtml(m[2].nameLower) + " zijn:</p>");
        html.push("<ul>" + top3.map(function (t) {
          return "<li><b>" + escHtml(t.naam) + "</b>: " + t.m3 + "</li>";
        }).join("") + "</ul>");
      } else {
        html.push("<p class='muted'>Geen incidenten in " + escHtml(m[2].nameLower) + ".</p>");
      }

      html.push("<h3>3.2 Belangrijke trend t.o.v. " + escHtml(m[1].nameLower) + "</h3>");
      if (top3.length) {
        html.push("<ul>" + top3.map(function (t) {
          var arrow = t.m3 > t.m2 ? "↑" : (t.m3 < t.m2 ? "↓" : "→");
          return "<li>" + escHtml(t.naam) + " " + arrow + " (" + t.m2 + " → " + t.m3 + ")</li>";
        }).join("") + "</ul>");
      } else {
        html.push("<p class='muted'>Geen trend om te tonen.</p>");
      }
    }

    // 4. Aantal incidenten per locatie
    html.push("<h2>4. Aantal incidenten per locatie</h2>");
    if (model.locaties.length === 0) {
      html.push("<p class='muted'>Geen locatiegegevens in deze periode.</p>");
    } else {
      html.push(tbl(
        ["Locatie", m[0].name, m[1].name, m[2].name, "Verschil", "% verandering"],
        model.locaties.map(function (l) {
          var v = l.verschil;
          return [l.naam, dash(l.perMonth[0]), dash(l.perMonth[1]), dash(l.perMonth[2]),
            (v > 0 ? "+" : "") + v, pctChange(l.m2, l.m3)];
        }),
        [1, 2, 3, 4, 5]
      ));
    }

    // 5. Cliëntnummers meeste incidenten (laatste maand)
    html.push("<h2>5. Cliëntnummers meeste incidenten (" + escHtml(m[2].name) + ")</h2>");
    if (model.topClienten.length === 0) {
      html.push("<p class='muted'>Geen cliëntgebonden incidenten in " + escHtml(m[2].nameLower) + ".</p>");
    } else {
      html.push(tbl(
        ["Cliëntnummer", "Aantal incidenten", "% van totaal"],
        model.topClienten.map(function (c) {
          return [c.clientnummer, c.aantal, pctOfTotal(c.aantal, m[2].total)];
        }),
        [1, 2]
      ));
    }

    var genStamp = formatNlDateTime(new Date().toISOString());
    var styles = "@page{size:A4;margin:2cm;}"
      + "body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1f2937;}"
      + "h1{font-size:18pt;margin:0 0 4pt;color:#111827;}"
      + "h2{font-size:13pt;margin:18pt 0 6pt;color:#111827;border-bottom:1px solid #d1d5db;padding-bottom:2pt;}"
      + "h3{font-size:11.5pt;margin:12pt 0 4pt;color:#374151;}"
      + "p{margin:4pt 0;}p.intro{margin:0 0 6pt;}p.muted{color:#6b7280;}"
      + "ul{margin:4pt 0 8pt;padding-left:18pt;}li{margin:2pt 0;}"
      + "table{border-collapse:collapse;width:100%;margin:6pt 0 10pt;font-size:10pt;}"
      + "th,td{border:1px solid #9ca3af;padding:4pt 7pt;text-align:left;vertical-align:top;}"
      + "th{background:#e5e7eb;font-weight:700;}"
      + "td.num{text-align:right;}"
      + ".meta{color:#6b7280;font-size:8.5pt;margin-top:14pt;}";

    return "<!doctype html><html xmlns:o='urn:schemas-microsoft-com:office:office' "
      + "xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>"
      + "<head><meta charset='utf-8'><title>" + escHtml(title) + "</title>"
      + "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->"
      + "<style>" + styles + "</style></head><body>"
      + html.join("")
      + "<p class='meta'>Automatisch gegenereerd op " + escHtml(genStamp) + " · ETF incidenten-dashboard</p>"
      + "</body></html>";
  }

  function downloadDoc(html, filename) {
    var blob = new Blob(["﻿", html], { type: "application/msword" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); } catch (e) { /* */ }
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 0);
  }

  function generateReport(year, startMonth) {
    var model = buildReportModel(year, startMonth);
    var doc = buildReportDoc(model);
    var fn = "incidentanalyse-" + MONTHS_NL[model.months[0].idx] + "-"
      + MONTHS_NL[model.months[2].idx] + "-" + year + ".doc";
    downloadDoc(doc, fn);
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("exported", fn);
    }
  }

  // Modal: jaar + 3-aaneengesloten-maanden kiezen, dan genereren.
  function openReportModal() {
    // Idempotent: een tweede klik (bv. dubbelklik op de knop) opent geen
    // tweede overlay bovenop de eerste.
    if (document.querySelector(".id-report-modal")) return;
    // Focus terugzetten bij sluiten (a11y): val terug op de rapportknop als er
    // geen zinnig actief element is (bv. bij een muisklik die niet focust).
    var trigger = document.activeElement;
    if (!trigger || trigger === document.body || !trigger.focus) trigger = $("id-report-btn");
    var now = new Date();
    var curYear = now.getFullYear();
    var years = [];
    for (var y = curYear; y >= curYear - 5; y--) years.push(y);
    var sel = { year: curYear, start: Math.min(9, Math.max(0, now.getMonth() - 2)) };

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay modal-overlay--confirm";
    overlay.setAttribute("aria-hidden", "false");
    overlay.innerHTML =
      "<div class='modal-dialog cl-add-dialog id-report-modal' role='dialog' aria-modal='true' aria-labelledby='id-report-title' tabindex='-1'>"
      + "<div class='modal-header'><h2 class='modal-title' id='id-report-title'>Genereer 3-maanden rapport</h2>"
      + "<button type='button' class='modal-close' data-close aria-label='Sluiten'><span aria-hidden='true'>&times;</span></button></div>"
      + "<div class='modal-body'>"
      + "<div class='id-rep-section'><div class='id-rep-lbl'>Jaar</div><div class='id-rep-chips' id='id-rep-years'></div></div>"
      + "<div class='id-rep-section'><div class='id-rep-lbl'>Periode (3 aaneengesloten maanden)</div>"
      + "<div class='id-rep-chips' id='id-rep-months'></div>"
      + "<p class='id-rep-hint'>Klik op een maand om de beginmaand te kiezen. De twee volgende maanden worden automatisch geselecteerd.</p>"
      + "<p class='id-rep-period' id='id-rep-period'></p></div>"
      + "</div>"
      + "<div class='modal-footer'>"
      + "<button type='button' class='btn-outline' data-close>Annuleren</button>"
      + "<button type='button' class='btn-primary' id='id-rep-go'>Rapport genereren</button>"
      + "</div></div>";

    function renderChips() {
      var yc = overlay.querySelector("#id-rep-years");
      yc.innerHTML = years.map(function (yy) {
        return "<button type='button' class='id-rep-chip" + (yy === sel.year ? " is-active" : "")
          + "' data-year='" + yy + "'>" + yy + "</button>";
      }).join("");
      var mc = overlay.querySelector("#id-rep-months");
      mc.innerHTML = MONTHS_NL_SHORT.map(function (nm, i) {
        var inRange = i >= sel.start && i <= sel.start + 2;
        var cls = i === sel.start ? "is-active" : (inRange ? "is-range" : "");
        return "<button type='button' class='id-rep-chip" + (cls ? " " + cls : "")
          + "' data-month='" + i + "'>" + nm + "</button>";
      }).join("");
      overlay.querySelector("#id-rep-period").textContent =
        capMonth(sel.start) + " – " + capMonth(sel.start + 2) + " " + sel.year;
    }

    function close() {
      document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (!document.querySelector(".modal-overlay:not([hidden])")) {
        document.body.classList.remove("modal-open");
      }
      try { if (trigger && trigger.focus) trigger.focus(); } catch (e) { /* */ }
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.closest("[data-close]")) { close(); return; }
      var yBtn = e.target.closest("[data-year]");
      if (yBtn) { sel.year = parseInt(yBtn.getAttribute("data-year"), 10); renderChips(); return; }
      var mBtn = e.target.closest("[data-month]");
      if (mBtn) {
        // Beginmaand zo dat de 3 maanden binnen het jaar blijven (max start = okt).
        sel.start = Math.min(9, parseInt(mBtn.getAttribute("data-month"), 10));
        renderChips();
        return;
      }
    });
    overlay.querySelector("#id-rep-go").addEventListener("click", function () {
      generateReport(sel.year, sel.start);
      close();
    });

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    renderChips();
    try { overlay.querySelector(".modal-dialog").focus(); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireUp() {
    var reportBtn = $("id-report-btn");
    if (reportBtn) reportBtn.addEventListener("click", openReportModal);

    Array.prototype.forEach.call(document.querySelectorAll(".id-range-preset"), function (b) {
      b.addEventListener("click", function () {
        applyPreset(b.getAttribute("data-range"));
        renderAll();
      });
    });

    var fromEl = $("id-date-from"), toEl = $("id-date-to");
    function onDateChange() {
      state.rangePreset = "custom";
      state.dateFrom = inputDateToDate(fromEl.value, false);
      state.dateTo = inputDateToDate(toEl.value, true);
      renderPresetButtons();
      renderAll();
    }
    fromEl.addEventListener("change", onDateChange);
    toEl.addEventListener("change", onDateChange);

    [
      ["id-filter-client", "filterClient"],
      ["id-filter-medewerker", "filterMedewerker"],
      ["id-filter-locatie", "filterLocatie"],
      ["id-filter-categorie", "filterCategorie"],
    ].forEach(function (p) {
      var el = $(p[0]); if (!el) return;
      el.addEventListener("change", function () {
        state[p[1]] = el.value || "";
        renderAll();
      });
    });

    $("id-filter-reset").addEventListener("click", function () {
      state.filterClient = state.filterMedewerker = state.filterLocatie = state.filterCategorie = "";
      // Reset = terug naar de openings-default (lopende maand). renderAll past
      // dezelfde slimme fallback toe: is die maand leeg, dan 'Alles'. Zo toont
      // Reset nooit een leeg overzicht — ook niet wanneer de lopende maand (nog)
      // geen incidenten bevat (vroeger sprong dit hard naar '30d').
      applyPreset("month");
      renderAll();
    });

    // Live updates
    ["besa:incidenten-updated", "besa:clienten-updated",
     "besa:medewerkers-updated", "besa:locaties-updated"].forEach(function (evt) {
      window.addEventListener(evt, renderAll);
    });

    // Re-render trend op resize (line chart is breedte-afhankelijk)
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderTrend, 150);
    });
  }

  function init() {
    // User-keuze: dashboard opent/refresht ALTIJD op de huidige maand
    // (1e t/m laatste dag). De berekening zelf blijft 1-op-1 BS2; alleen
    // het default-bereik wijkt bewust af van BS2 (BS2 opent zonder filter).
    applyPreset("month");
    wireUp();
    var box = $("id-period-range");
    var sEl = $("id-date-from"), eEl = $("id-date-to");
    if (box && sEl && eEl && window.BesaDateRange) {
      drWidget = window.BesaDateRange.mount({
        container: box,
        startInput: sEl,
        endInput: eEl,
        allowEmpty: true,
        emptyLabel: "Alle periodes",
        year: new Date().getFullYear(),
      });
    }
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
