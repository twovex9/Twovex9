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
  function applyPreset(preset) {
    state.rangePreset = preset;
    if (preset === "all") {
      state.dateFrom = null;
      state.dateTo = null;
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
  function getFilteredIncidenten() {
    var rows = getAllIncidenten().filter(function (i) { return i && !i.archived; });

    if (state.dateFrom) {
      var fromMs = state.dateFrom.getTime();
      rows = rows.filter(function (i) {
        var t = Date.parse(i.incidentDatum || 0);
        return isFinite(t) && t >= fromMs;
      });
    }
    if (state.dateTo) {
      var toMs = state.dateTo.getTime();
      rows = rows.filter(function (i) {
        var t = Date.parse(i.incidentDatum || 0);
        return isFinite(t) && t <= toMs;
      });
    }
    if (state.filterClient) rows = rows.filter(function (i) { return String(i.clientId || "") === state.filterClient; });
    if (state.filterLocatie) rows = rows.filter(function (i) { return String(i.locatieId || "") === state.filterLocatie; });
    if (state.filterCategorie) rows = rows.filter(function (i) { return i.categorie === state.filterCategorie; });
    if (state.filterMedewerker) {
      var m = state.filterMedewerker;
      rows = rows.filter(function (i) {
        return String(i.melderId || "") === m || String(i.beoordelaarId || "") === m;
      });
    }
    return rows;
  }

  // ---------------------------------------------------------------------------
  // BS2 /api/incidents/dashboard — core set (PERIODE-ONAFHANKELIJK)
  // ---------------------------------------------------------------------------
  // BS2's dashboard-endpoint kent géén periode-parameter: overview,
  // status_counts/-distribution en average_resolution_time worden server-side
  // over de VOLLEDIGE actieve set berekend. Voor 1-op-1 dezelfde getallen
  // negeren deze blokken dus het BS1-datumfilter (zelfde patroon als het
  // beschikkingen-dashboard). Het datumfilter + de extra filters sturen
  // alléén de BS1-eigen visualisaties (trend/donut-detail/bars/heatmap/…).
  function getBs2CoreSet() {
    return getAllIncidenten().filter(function (i) { return i && !i.archived; });
  }

  // average_resolution_time: gem. uren tussen created_at (aanmaakdatum) en
  // resolved_at (afgehandeld_op) over afgehandelde (status 'opgelost')
  // incidenten — exact BS2's formule.
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
    // overview + status_distribution + average_resolution_time = hele set.
    var rows = getBs2CoreSet();
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

    // average_resolution_time { hours, note }
    var ar = computeAvgResolutionHours(rows);
    var arEl = $("id-kpi-resolution");
    var arSub = $("id-kpi-resolution-sub");
    if (arEl) {
      if (ar.count === 0) {
        arEl.textContent = "—";
        if (arSub) arSub.textContent = "Geen afgehandelde incidenten";
      } else {
        arEl.textContent = (Math.round(ar.hours * 10) / 10).toLocaleString("nl-NL") + " u";
        if (arSub) arSub.textContent = "gem. aanmaak → afhandeling (" + ar.count + ")";
      }
    }

    // Trend laatste 7 dagen (binnen filter — vaste 7d ongeacht preset)
    var allInRange = getAllIncidenten().filter(function (i) {
      if (!i || i.archived) return false;
      if (state.filterClient && String(i.clientId || "") !== state.filterClient) return false;
      if (state.filterLocatie && String(i.locatieId || "") !== state.filterLocatie) return false;
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
      var t = Date.parse(i.incidentDatum || 0);
      return isFinite(t) && t < (now - sevenDays) && t >= (now - 2 * sevenDays);
    }).length;
    var last7 = allInRange.filter(function (i) {
      var t = Date.parse(i.incidentDatum || 0);
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

    // 1-op-1 BS2: overview telt de hele set (periode-onafhankelijk).
    var totalSub = $("id-kpi-total-sub");
    if (totalSub) totalSub.textContent = "alle incidenten";
  }

  // ---------------------------------------------------------------------------
  // Trend chart (line, last N days based on range)
  // ---------------------------------------------------------------------------
  function renderTrend() {
    var rows = getFilteredIncidenten();
    var bucketDays;
    if (state.dateFrom && state.dateTo) {
      bucketDays = Math.max(7, Math.round((state.dateTo - state.dateFrom) / 86400000) + 1);
    } else {
      bucketDays = 90;
    }
    if (bucketDays > 365) bucketDays = 365;

    var now = state.dateTo || new Date();
    var endDay = startOfDay(now);
    var labels = [];
    var counts = [];
    for (var i = bucketDays - 1; i >= 0; i--) {
      var d = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - i);
      labels.push(d);
      counts.push(0);
    }
    rows.forEach(function (r) {
      var t = Date.parse(r.incidentDatum || 0);
      if (!isFinite(t)) return;
      var d = startOfDay(new Date(t));
      var idx = Math.floor((d - labels[0]) / 86400000);
      if (idx >= 0 && idx < counts.length) counts[idx]++;
    });

    var sub = $("id-trend-sub");
    if (sub) sub.textContent = "Laatste " + bucketDays + " dagen";

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

    // Markers + tooltips
    var markers = counts.map(function (v, i) {
      return '<circle class="id-line-pt" cx="' + x(i) + '" cy="' + y(v) + '" r="3.5">'
        + '<title>' + formatNlDate(labels[i]) + ': ' + v + '</title></circle>';
    }).join("");

    host.innerHTML = '<svg class="id-line-svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none">'
      + '<defs><linearGradient id="id-line-grad" x1="0" x2="0" y1="0" y2="1">'
      + '<stop offset="0%" stop-color="var(--blue)" stop-opacity="0.28"/>'
      + '<stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/>'
      + '</linearGradient></defs>'
      + grid.join("")
      + '<path class="id-line-area" d="' + areaPts + '" fill="url(#id-line-grad)"/>'
      + '<path class="id-line-path" d="' + linePts + '" />'
      + markers
      + ticks.join("")
      + '</svg>';
  }

  // ---------------------------------------------------------------------------
  // Status donut
  // ---------------------------------------------------------------------------
  function renderDonut() {
    // 1-op-1 BS2 status_distribution = hele set (periode-onafhankelijk),
    // consistent met de status-KPI's.
    var rows = getBs2CoreSet();
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
    fillSelect($("id-filter-locatie"), getAllLocaties().filter(function (l) { return l && !l.archived; }), "Filter op locatie", locatieLabel, state.filterLocatie);
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
  // Master render
  // ---------------------------------------------------------------------------
  function renderAll() {
    populateDropdowns();
    renderKpis();
    renderTrend();
    renderDonut();
    renderBars("id-bars-categorie", function (r) { return r.categorie || "Overig"; }, { top: 5, color: "var(--blue, #2563eb)" });
    renderBars("id-bars-locatie", function (r) { return r.locatieId || ""; }, {
      top: 5, color: "var(--green, #16a34a)",
      labelFn: function (id) {
        var l = findById(getAllLocaties(), id);
        return l ? locatieLabel(l) : "Onbekend";
      },
    });
    renderHeatmap();
    renderTopList("id-top-clienten", function (r) { return r.clientId; },
      function (id) { return findById(getAllClienten(), id); }, clientLabel, { top: 5 });
    renderTopList("id-top-melders", function (r) { return r.melderId; },
      function (id) { return findById(getAllMedewerkers(), id); }, medewerkerLabel, { top: 5 });
    renderRecent();
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireUp() {
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
      applyPreset("30");
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
    applyPreset("30");
    wireUp();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
