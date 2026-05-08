/* global window, document */
/**
 * besa-filter-chips.js — herbruikbare filter-chip-componenten.
 *
 * Twee componenten:
 *
 * 1. createSearchSelectChip({ button, label, options, onChange })
 *    - Een button-chip met "+ Label" text.
 *    - Bij klik: opent floating panel met search-input + lijst met opties.
 *    - User kiest één optie; chip wordt vol blauw met de gekozen waarde.
 *    - Klik nogmaals op chip toggles panel; klik op chip met waarde toont 'X' om te clearen.
 *
 * 2. createDateRangeChip({ button, label, onChange })
 *    - Een button-chip met "+ Label" (bv. "+ Periode") tekst.
 *    - Bij klik: opent floating 2-month-calendar.
 *    - User klikt 1e datum (start), 2e datum (eind). Alle dagen tussenin krijgen
 *      blauwe highlight. Klik op chip met waarde toont 'X' om te clearen.
 *    - onChange krijgt {from: 'yyyy-mm-dd', to: 'yyyy-mm-dd'} of null bij clear.
 *
 * Beide componenten gebruiken huisstijl-tokens (--blue, --line, --r-pill).
 */
(function (w) {
  "use strict";

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function pad2(n) { return ("0" + n).slice(-2); }
  function fmtIso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseIso(s) { if (!s) return null; var p = s.split("-"); if (p.length !== 3) return null; return new Date(parseInt(p[0],10), parseInt(p[1],10) - 1, parseInt(p[2],10)); }

  function positionPanel(panel, anchor) {
    var rect = anchor.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = (rect.bottom + 6) + "px";
    panel.style.left = rect.left + "px";
    panel.style.zIndex = "9999";
    // Houd binnen viewport
    setTimeout(function () {
      var pr = panel.getBoundingClientRect();
      if (pr.right > w.innerWidth - 8) {
        panel.style.left = Math.max(8, w.innerWidth - pr.width - 8) + "px";
      }
      if (pr.bottom > w.innerHeight - 8) {
        panel.style.top = Math.max(8, rect.top - pr.height - 6) + "px";
      }
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // 1. Search-select chip
  // ---------------------------------------------------------------------------
  function createSearchSelectChip(opts) {
    var btn = opts.button;
    var label = opts.label || "Filter";
    var options = opts.options || []; // [{value, label}]
    var onChange = opts.onChange || function () {};
    var current = null;
    var panel = null;

    function renderBtnLabel() {
      btn.classList.toggle("filter-chip--active", !!current);
      if (current) {
        var opt = options.find(function (o) { return o.value === current; });
        btn.innerHTML =
          '<span class="filter-chip-text">' + escHtml(opt ? opt.label : current) + '</span>' +
          '<span class="filter-chip-clear" aria-label="Wissen">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
      } else {
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
          '<span class="filter-chip-text">' + escHtml(label) + '</span>';
      }
    }

    function closePanel() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    }
    function onDocClick(e) { if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePanel(); }
    function onKey(e) { if (e.key === "Escape") closePanel(); }

    function renderOptionList(filter) {
      var list = panel.querySelector(".bs-chip-list");
      var q = (filter || "").toLowerCase();
      var filtered = options.filter(function (o) { return o.label.toLowerCase().indexOf(q) !== -1; });
      list.innerHTML = filtered.length === 0
        ? '<li class="bs-chip-empty">Geen resultaten</li>'
        : filtered.map(function (o) {
          return '<li><button type="button" class="bs-chip-opt' + (current === o.value ? " is-selected" : "") + '" data-val="' + escHtml(o.value) + '">' + escHtml(o.label) + '</button></li>';
        }).join("");
      list.querySelectorAll(".bs-chip-opt").forEach(function (b) {
        b.addEventListener("click", function () {
          current = b.getAttribute("data-val");
          onChange(current);
          renderBtnLabel();
          closePanel();
        });
      });
    }

    function openPanel() {
      if (panel) { closePanel(); return; }
      panel = document.createElement("div");
      panel.className = "bs-chip-panel bs-chip-panel--search";
      panel.innerHTML =
        '<div class="bs-chip-search-wrap">' +
          '<svg class="bs-chip-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input type="search" class="bs-chip-search" placeholder="Zoeken..." autocomplete="off" />' +
        '</div>' +
        '<ul class="bs-chip-list" role="listbox"></ul>';
      document.body.appendChild(panel);
      positionPanel(panel, btn);
      var input = panel.querySelector(".bs-chip-search");
      input.addEventListener("input", function () { renderOptionList(input.value); });
      renderOptionList("");
      setTimeout(function () { try { input.focus(); } catch (e) { /* */ } }, 0);
      setTimeout(function () {
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("keydown", onKey);
      }, 50);
    }

    btn.addEventListener("click", function (e) {
      // Klik op clear-icoontje binnen chip → wist filter, opent geen panel.
      if (current && e.target && e.target.closest && e.target.closest(".filter-chip-clear")) {
        e.stopPropagation();
        current = null;
        onChange(null);
        renderBtnLabel();
        return;
      }
      openPanel();
    });

    renderBtnLabel();
    return {
      get value() { return current; },
      set value(v) { current = v || null; renderBtnLabel(); },
      clear: function () { current = null; renderBtnLabel(); },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Date-range chip
  // ---------------------------------------------------------------------------
  var DAY_NL = ["Z", "M", "D", "W", "D", "V", "Z"]; // Zo Ma Di Wo Do Vr Za
  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function dayKey(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function fmtNl(d) { return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear(); }

  function createDateRangeChip(opts) {
    var btn = opts.button;
    var label = opts.label || "Periode";
    var onChange = opts.onChange || function () {};
    var range = { from: null, to: null }; // Date objects (start of day)
    var hover = null;
    var anchorMonth = new Date(); anchorMonth.setDate(1); // 1e van de maand
    var panel = null;

    function renderBtnLabel() {
      btn.classList.toggle("filter-chip--active", !!(range.from || range.to));
      if (range.from && range.to) {
        btn.innerHTML =
          '<span class="filter-chip-text">' + fmtNl(range.from) + ' – ' + fmtNl(range.to) + '</span>' +
          '<span class="filter-chip-clear" aria-label="Wissen">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
      } else if (range.from) {
        btn.innerHTML =
          '<span class="filter-chip-text">Vanaf ' + fmtNl(range.from) + '</span>' +
          '<span class="filter-chip-clear" aria-label="Wissen">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
      } else {
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
          '<span class="filter-chip-text">' + escHtml(label) + '</span>';
      }
    }

    function closePanel() {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    }
    function onDocClick(e) { if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePanel(); }
    function onKey(e) { if (e.key === "Escape") closePanel(); }

    function renderMonth(year, month) {
      var first = new Date(year, month, 1);
      var firstDow = first.getDay(); // 0 = zo
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var daysInPrev = new Date(year, month, 0).getDate();
      var monthLabel = MONTHS_NL[month].charAt(0).toUpperCase() + MONTHS_NL[month].slice(1) + " " + year;

      var html = '<div class="bs-cal-month">' +
        '<div class="bs-cal-month-label">' + escHtml(monthLabel) + '</div>' +
        '<div class="bs-cal-grid">';
      // Day-of-week header
      DAY_NL.forEach(function (d) { html += '<div class="bs-cal-dowh">' + d + '</div>'; });
      // Leading days from previous month (greyed)
      for (var i = firstDow; i > 0; i -= 1) {
        var pd = daysInPrev - i + 1;
        html += '<button type="button" class="bs-cal-day bs-cal-day--out" data-y="' + (month === 0 ? year - 1 : year) + '" data-m="' + (month === 0 ? 11 : month - 1) + '" data-d="' + pd + '">' + pd + '</button>';
      }
      // Days in this month
      for (var d2 = 1; d2 <= daysInMonth; d2 += 1) {
        var dt = new Date(year, month, d2);
        var classes = ["bs-cal-day"];
        if (range.from && sameDay(dt, range.from)) classes.push("bs-cal-day--start");
        if (range.to && sameDay(dt, range.to)) classes.push("bs-cal-day--end");
        if (range.from && range.to && dt > range.from && dt < range.to) classes.push("bs-cal-day--in");
        // Hover-preview range
        if (range.from && !range.to && hover && dt > range.from && dt < hover) classes.push("bs-cal-day--in");
        if (range.from && !range.to && hover && sameDay(dt, hover)) classes.push("bs-cal-day--end");
        html += '<button type="button" class="' + classes.join(" ") + '" data-y="' + year + '" data-m="' + month + '" data-d="' + d2 + '">' + d2 + '</button>';
      }
      // Trailing days from next month (greyed) — fill grid to multiple of 7
      var totalCells = firstDow + daysInMonth;
      var trail = (7 - (totalCells % 7)) % 7;
      for (var t = 1; t <= trail; t += 1) {
        html += '<button type="button" class="bs-cal-day bs-cal-day--out" data-y="' + (month === 11 ? year + 1 : year) + '" data-m="' + (month === 11 ? 0 : month + 1) + '" data-d="' + t + '">' + t + '</button>';
      }
      html += '</div></div>';
      return html;
    }

    function renderPanel() {
      if (!panel) return;
      var ay = anchorMonth.getFullYear();
      var am = anchorMonth.getMonth();
      var ny = am === 11 ? ay + 1 : ay;
      var nm = am === 11 ? 0 : am + 1;
      panel.querySelector(".bs-cal-months").innerHTML = renderMonth(ay, am) + renderMonth(ny, nm);
      panel.querySelectorAll(".bs-cal-day").forEach(function (db) {
        db.addEventListener("click", function () {
          var d = new Date(parseInt(db.dataset.y, 10), parseInt(db.dataset.m, 10), parseInt(db.dataset.d, 10));
          if (!range.from || (range.from && range.to)) {
            range.from = d; range.to = null; hover = null;
          } else {
            if (d < range.from) {
              range.to = range.from;
              range.from = d;
            } else if (sameDay(d, range.from)) {
              range.to = d;
            } else {
              range.to = d;
            }
            // Voltooid → notify + sluit panel
            onChange({ from: fmtIso(range.from), to: fmtIso(range.to) });
            renderBtnLabel();
            closePanel();
            return;
          }
          renderPanel();
        });
        db.addEventListener("mouseenter", function () {
          if (range.from && !range.to) {
            hover = new Date(parseInt(db.dataset.y, 10), parseInt(db.dataset.m, 10), parseInt(db.dataset.d, 10));
            renderPanel();
          }
        });
      });
    }

    function openPanel() {
      if (panel) { closePanel(); return; }
      // Anchor op de maand van range.from of huidige maand
      if (range.from) { anchorMonth = new Date(range.from.getFullYear(), range.from.getMonth(), 1); }
      panel = document.createElement("div");
      panel.className = "bs-chip-panel bs-chip-panel--cal";
      panel.innerHTML =
        '<div class="bs-cal-head">' +
          '<button type="button" class="bs-cal-nav bs-cal-prev" aria-label="Vorige maand">‹</button>' +
          '<button type="button" class="bs-cal-nav bs-cal-next" aria-label="Volgende maand">›</button>' +
        '</div>' +
        '<div class="bs-cal-months"></div>';
      document.body.appendChild(panel);
      positionPanel(panel, btn);
      panel.querySelector(".bs-cal-prev").addEventListener("click", function () {
        anchorMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 1, 1);
        renderPanel();
      });
      panel.querySelector(".bs-cal-next").addEventListener("click", function () {
        anchorMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 1);
        renderPanel();
      });
      renderPanel();
      setTimeout(function () {
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("keydown", onKey);
      }, 50);
    }

    btn.addEventListener("click", function (e) {
      if ((range.from || range.to) && e.target && e.target.closest && e.target.closest(".filter-chip-clear")) {
        e.stopPropagation();
        range.from = null; range.to = null;
        onChange(null);
        renderBtnLabel();
        return;
      }
      openPanel();
    });

    renderBtnLabel();
    return {
      get value() { return range.from && range.to ? { from: fmtIso(range.from), to: fmtIso(range.to) } : null; },
      set value(v) {
        if (!v) { range.from = null; range.to = null; }
        else {
          range.from = parseIso(v.from);
          range.to = parseIso(v.to);
        }
        renderBtnLabel();
      },
      clear: function () { range.from = null; range.to = null; renderBtnLabel(); },
    };
  }

  w.besaFilterChips = {
    createSearchSelectChip: createSearchSelectChip,
    createDateRangeChip: createDateRangeChip,
  };
})(window);
