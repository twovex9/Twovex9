/* global window, document */
/**
 * besa-filter-chips.js — herbruikbare filter-chip-componenten in HR-huisstijl.
 *
 * Gebruikt EXACT dezelfde CSS classes als de officiële Functie/Opleiding-chips
 * op HR > Medewerkers (.filter-chip--radio, .filter-chip-plus,
 * .filter-functie-panel, .filter-functie-search, .filter-functie-input,
 * .filter-functie-clear, .filter-functie-list, .filter-functie-option).
 *
 * API:
 *   createSearchSelectChip({ button, label, options, onChange, clearLabel })
 *   createDateRangeChip({ button, label, onChange })
 *
 * De button die je doorgeeft krijgt de HR-classes opgelegd en wordt in een
 * .filter-dropdown-wrap geplaatst; het panel komt direct daaronder.
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
  function fmtNl(d) { return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  /**
   * Wrap een bestaande button in een .filter-dropdown-wrap en geef de button
   * de officiële HR-classes. Returns de wrap-div.
   */
  function makeWrap(button) {
    if (button.parentNode && button.parentNode.classList.contains("filter-dropdown-wrap")) {
      return button.parentNode;
    }
    var wrap = document.createElement("div");
    wrap.className = "filter-dropdown-wrap";
    button.parentNode.insertBefore(wrap, button);
    wrap.appendChild(button);
    return wrap;
  }

  /**
   * Render de label + optionele "+" plus-icon binnen de button.
   * Bij actieve waarde: alleen label-tekst (geen +).
   */
  function renderButtonContent(button, label, valueText) {
    if (valueText) {
      button.innerHTML = '<span class="filter-chip-text">' + escHtml(valueText) + '</span>';
      button.classList.add("is-active");
    } else {
      button.innerHTML = '<span class="filter-chip-plus" aria-hidden="true">+</span> ' + escHtml(label);
      button.classList.remove("is-active");
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Search-select chip — HR-stijl (matcht Functie/Opleiding op index.html)
  // ---------------------------------------------------------------------------
  function createSearchSelectChip(opts) {
    var btn = opts.button;
    var label = opts.label || "Filter";
    var options = opts.options || []; // [{value, label}]
    var onChange = opts.onChange || function () {};
    var clearLabel = opts.clearLabel || ("Alle " + label.toLowerCase().replace(/^[+\s]+/, "") + " tonen");
    var current = null;

    // Setup button-stijl + wrap + panel
    btn.classList.add("filter-chip", "filter-chip--radio", "filter-chip-functie-btn");
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    var wrap = makeWrap(btn);

    var panel = document.createElement("div");
    panel.className = "filter-functie-panel";
    panel.setAttribute("role", "listbox");
    panel.hidden = true;
    panel.innerHTML =
      '<div class="filter-functie-search">' +
        '<svg class="filter-functie-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
        '<input type="search" class="filter-functie-input" placeholder="Zoeken..." autocomplete="off" />' +
      '</div>' +
      '<button type="button" class="filter-functie-clear">' + escHtml(clearLabel) + '</button>' +
      '<ul class="filter-functie-list" role="listbox"></ul>';
    wrap.appendChild(panel);

    var input = panel.querySelector(".filter-functie-input");
    var clearBtn = panel.querySelector(".filter-functie-clear");
    var list = panel.querySelector(".filter-functie-list");

    function getCurrentLabel() {
      if (!current) return null;
      var o = options.find(function (x) { return x.value === current; });
      return o ? o.label : current;
    }

    function renderList(filter) {
      var q = (filter || "").toLowerCase();
      var filtered = options.filter(function (o) { return o.label.toLowerCase().indexOf(q) !== -1; });
      if (filtered.length === 0) {
        list.innerHTML = '<li><div class="filter-functie-option" style="color:var(--text-muted);cursor:default">Geen resultaten</div></li>';
        return;
      }
      list.innerHTML = filtered.map(function (o) {
        return '<li><button type="button" class="filter-functie-option' + (current === o.value ? " is-selected" : "") + '" data-val="' + escHtml(o.value) + '">' + escHtml(o.label) + '</button></li>';
      }).join("");
      list.querySelectorAll(".filter-functie-option[data-val]").forEach(function (b) {
        b.addEventListener("click", function () {
          current = b.getAttribute("data-val");
          onChange(current);
          renderButtonContent(btn, label, getCurrentLabel());
          closePanel();
        });
      });
    }

    function openPanel() {
      panel.hidden = false;
      btn.classList.add("is-panel-open");
      btn.setAttribute("aria-expanded", "true");
      input.value = "";
      renderList("");
      setTimeout(function () { try { input.focus(); } catch (e) { /* */ } }, 0);
      setTimeout(function () {
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("keydown", onKey);
      }, 50);
    }
    function closePanel() {
      panel.hidden = true;
      btn.classList.remove("is-panel-open");
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    }
    function onDocClick(e) {
      if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePanel();
    }
    function onKey(e) { if (e.key === "Escape") closePanel(); }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (panel.hidden) openPanel(); else closePanel();
    });
    input.addEventListener("input", function () { renderList(input.value); });
    clearBtn.addEventListener("click", function () {
      current = null;
      onChange(null);
      renderButtonContent(btn, label, null);
      closePanel();
    });

    renderButtonContent(btn, label, null);
    return {
      get value() { return current; },
      set value(v) { current = v || null; renderButtonContent(btn, label, getCurrentLabel()); },
      clear: function () { current = null; renderButtonContent(btn, label, null); },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Date-range chip — zelfde button-stijl, panel met 2-maand kalender
  // ---------------------------------------------------------------------------
  var DAY_NL = ["Z", "M", "D", "W", "D", "V", "Z"];
  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  function createDateRangeChip(opts) {
    var btn = opts.button;
    var label = opts.label || "Periode";
    var onChange = opts.onChange || function () {};
    var range = { from: null, to: null };
    var hover = null;
    var anchorMonth = new Date(); anchorMonth.setDate(1);

    btn.classList.add("filter-chip", "filter-chip--radio", "filter-chip-functie-btn");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    var wrap = makeWrap(btn);

    var panel = document.createElement("div");
    panel.className = "filter-functie-panel filter-functie-panel--cal";
    panel.setAttribute("role", "dialog");
    panel.hidden = true;
    panel.innerHTML =
      '<div class="bs-cal-head">' +
        '<button type="button" class="bs-cal-nav bs-cal-prev" aria-label="Vorige maand">‹</button>' +
        '<span class="bs-cal-head-spacer"></span>' +
        '<button type="button" class="bs-cal-nav bs-cal-next" aria-label="Volgende maand">›</button>' +
      '</div>' +
      '<div class="bs-cal-months"></div>' +
      '<div class="bs-cal-foot">' +
        '<button type="button" class="filter-functie-clear bs-cal-clear">Periode wissen</button>' +
      '</div>';
    wrap.appendChild(panel);

    function getValueText() {
      if (range.from && range.to) return fmtNl(range.from) + " – " + fmtNl(range.to);
      if (range.from) return "Vanaf " + fmtNl(range.from);
      return null;
    }
    function syncBtn() { renderButtonContent(btn, label, getValueText()); }

    function renderMonth(year, month) {
      var first = new Date(year, month, 1);
      var firstDow = first.getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var daysInPrev = new Date(year, month, 0).getDate();
      var monthLabel = MONTHS_NL[month].charAt(0).toUpperCase() + MONTHS_NL[month].slice(1) + " " + year;
      var html = '<div class="bs-cal-month">' +
        '<div class="bs-cal-month-label">' + escHtml(monthLabel) + '</div>' +
        '<div class="bs-cal-grid">';
      DAY_NL.forEach(function (d) { html += '<div class="bs-cal-dowh">' + d + '</div>'; });
      for (var i = firstDow; i > 0; i -= 1) {
        var pd = daysInPrev - i + 1;
        html += '<button type="button" class="bs-cal-day bs-cal-day--out" data-y="' + (month === 0 ? year - 1 : year) + '" data-m="' + (month === 0 ? 11 : month - 1) + '" data-d="' + pd + '">' + pd + '</button>';
      }
      for (var d2 = 1; d2 <= daysInMonth; d2 += 1) {
        var dt = new Date(year, month, d2);
        var classes = ["bs-cal-day"];
        if (range.from && sameDay(dt, range.from)) classes.push("bs-cal-day--start");
        if (range.to && sameDay(dt, range.to)) classes.push("bs-cal-day--end");
        if (range.from && range.to && dt > range.from && dt < range.to) classes.push("bs-cal-day--in");
        if (range.from && !range.to && hover && dt > range.from && dt < hover) classes.push("bs-cal-day--in");
        if (range.from && !range.to && hover && sameDay(dt, hover)) classes.push("bs-cal-day--end");
        html += '<button type="button" class="' + classes.join(" ") + '" data-y="' + year + '" data-m="' + month + '" data-d="' + d2 + '">' + d2 + '</button>';
      }
      var totalCells = firstDow + daysInMonth;
      var trail = (7 - (totalCells % 7)) % 7;
      for (var t = 1; t <= trail; t += 1) {
        html += '<button type="button" class="bs-cal-day bs-cal-day--out" data-y="' + (month === 11 ? year + 1 : year) + '" data-m="' + (month === 11 ? 0 : month + 1) + '" data-d="' + t + '">' + t + '</button>';
      }
      html += '</div></div>';
      return html;
    }

    function renderPanel() {
      if (panel.hidden) return;
      var ay = anchorMonth.getFullYear(), am = anchorMonth.getMonth();
      var ny = am === 11 ? ay + 1 : ay, nm = am === 11 ? 0 : am + 1;
      panel.querySelector(".bs-cal-months").innerHTML = renderMonth(ay, am) + renderMonth(ny, nm);
      panel.querySelectorAll(".bs-cal-day").forEach(function (db) {
        db.addEventListener("click", function () {
          var d = new Date(parseInt(db.dataset.y, 10), parseInt(db.dataset.m, 10), parseInt(db.dataset.d, 10));
          if (!range.from || (range.from && range.to)) {
            range.from = d; range.to = null; hover = null;
          } else {
            if (d < range.from) { range.to = range.from; range.from = d; }
            else { range.to = d; }
            onChange({ from: fmtIso(range.from), to: fmtIso(range.to) });
            syncBtn();
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
      if (range.from) anchorMonth = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
      panel.hidden = false;
      btn.classList.add("is-panel-open");
      btn.setAttribute("aria-expanded", "true");
      renderPanel();
      setTimeout(function () {
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("keydown", onKey);
      }, 50);
    }
    function closePanel() {
      panel.hidden = true;
      btn.classList.remove("is-panel-open");
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    }
    function onDocClick(e) { if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePanel(); }
    function onKey(e) { if (e.key === "Escape") closePanel(); }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (panel.hidden) openPanel(); else closePanel();
    });
    panel.querySelector(".bs-cal-prev").addEventListener("click", function (e) {
      e.stopPropagation();
      anchorMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 1, 1);
      renderPanel();
    });
    panel.querySelector(".bs-cal-next").addEventListener("click", function (e) {
      e.stopPropagation();
      anchorMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 1);
      renderPanel();
    });
    panel.querySelector(".bs-cal-clear").addEventListener("click", function () {
      range.from = null; range.to = null; hover = null;
      onChange(null);
      syncBtn();
      closePanel();
    });

    syncBtn();
    return {
      get value() { return range.from && range.to ? { from: fmtIso(range.from), to: fmtIso(range.to) } : null; },
      set value(v) {
        if (!v) { range.from = null; range.to = null; }
        else { range.from = parseIso(v.from); range.to = parseIso(v.to); }
        syncBtn();
      },
      clear: function () { range.from = null; range.to = null; syncBtn(); },
    };
  }

  w.besaFilterChips = {
    createSearchSelectChip: createSearchSelectChip,
    createDateRangeChip: createDateRangeChip,
  };
})(window);
