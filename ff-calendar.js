/*
 * ff-calendar.js
 * -----------------------------------------------------------------------------
 * Vervangt de kleine, niet-stijlbare native browser-datumkiezer door een grote,
 * comfortabele custom kalender-popup (ongeveer twee keer zo groot) — op ELKE
 * pagina en in ELKE rol. Werkt automatisch op iedere <input type="date">.
 *
 * De native <input type="date"> blijft de bron van waarheid: we schrijven de
 * gekozen datum terug als YYYY-MM-DD en dispatchen 'input' + 'change', zodat
 * alle bestaande formulier-logica (validatie, autofill, opslaan) ongewijzigd
 * blijft werken. min/max-attributen worden gerespecteerd.
 *
 * Het script enhanced ook datumvelden die later (in modals) worden toegevoegd,
 * via een MutationObserver. Alle stijl gebruikt design-tokens → licht én donker.
 *
 * Handmatig aanroepen kan ook:  window.ffCalendar.enhance(inputEl);
 */
(function (global) {
  "use strict";

  var DOW = ["ma", "di", "wo", "do", "vr", "za", "zo"]; // maandag-eerst
  var MONTHS = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];

  // ---- datum-helpers (lokale tijd, geen UTC-verschuiving) -------------------
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function fmtValue(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseValue(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  // index 0 = maandag … 6 = zondag
  function mondayIndex(jsDay) { return (jsDay + 6) % 7; }

  // ---- CSS één keer injecteren ---------------------------------------------
  function injectStyles() {
    if (document.getElementById("ff-cal-styles")) return;
    var css = [
      // De native picker-indicator verbergen we; we openen onze eigen kalender.
      "input.ff-cal-input::-webkit-calendar-picker-indicator{display:none;-webkit-appearance:none;}",
      "input.ff-cal-input{cursor:pointer;}",

      ".ff-cal-pop{",
      "  position:fixed;z-index:100000;",
      "  background:var(--bg-card,var(--surface,#fff));",
      "  color:var(--text,#111);",
      "  border:1px solid var(--line,#e5e5e5);",
      "  border-radius:var(--r-md,18px);",
      "  box-shadow:var(--shadow-pop,0 8px 24px rgba(0,0,0,.18));",
      "  padding:16px;",
      "  width:340px;max-width:calc(100vw - 16px);",
      "  font-family:inherit;",
      "  -webkit-user-select:none;user-select:none;",
      "}",
      ".ff-cal-pop[hidden]{display:none;}",

      ".ff-cal-head{display:flex;align-items:center;gap:6px;margin-bottom:12px;}",
      ".ff-cal-title{flex:1;text-align:center;font-size:16px;font-weight:650;color:var(--text,#111);letter-spacing:.01em;}",
      ".ff-cal-nav{",
      "  appearance:none;border:1px solid var(--line,#e5e5e5);",
      "  background:var(--surface,#fff);color:var(--text-secondary,#404040);",
      "  width:34px;height:34px;border-radius:10px;cursor:pointer;",
      "  font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;",
      "  transition:background .12s,border-color .12s;",
      "}",
      ".ff-cal-nav:hover{background:var(--fill-hover,rgba(0,0,0,.05));border-color:var(--line-strong,#d4d4d4);}",
      ".ff-cal-nav:focus-visible{outline:2px solid var(--blue,#2563eb);outline-offset:2px;}",

      ".ff-cal-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px;}",
      ".ff-cal-dow span{text-align:center;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#737373);padding:4px 0;}",

      ".ff-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}",
      ".ff-cal-day{",
      "  appearance:none;border:0;background:transparent;color:var(--text,#111);",
      "  height:40px;border-radius:10px;cursor:pointer;",
      "  font-size:14px;font-weight:500;font-family:inherit;",
      "  display:flex;align-items:center;justify-content:center;",
      "  transition:background .1s,color .1s;",
      "}",
      ".ff-cal-day:hover:not([disabled]){background:var(--fill-hover,rgba(0,0,0,.06));}",
      ".ff-cal-day:focus-visible{outline:2px solid var(--blue,#2563eb);outline-offset:-2px;}",
      ".ff-cal-day.is-other{color:var(--text-muted,#9ca3af);opacity:.55;}",
      ".ff-cal-day.is-today{box-shadow:inset 0 0 0 1.5px var(--blue,#2563eb);font-weight:650;}",
      ".ff-cal-day.is-selected{background:var(--blue,#2563eb)!important;color:#fff!important;font-weight:650;}",
      ".ff-cal-day[disabled]{color:var(--text-muted,#9ca3af);opacity:.35;cursor:not-allowed;}",

      ".ff-cal-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#e5e5e5);}",
      ".ff-cal-btn{",
      "  appearance:none;border:1px solid var(--line,#e5e5e5);background:var(--surface,#fff);",
      "  color:var(--text-secondary,#404040);padding:7px 14px;border-radius:10px;cursor:pointer;",
      "  font-size:13px;font-weight:600;font-family:inherit;transition:background .12s,border-color .12s;",
      "}",
      ".ff-cal-btn:hover{background:var(--fill-hover,rgba(0,0,0,.05));border-color:var(--line-strong,#d4d4d4);}",
      ".ff-cal-btn--clear{color:var(--text-muted,#737373);}",
      ".ff-cal-btn--today{color:var(--blue,#2563eb);border-color:var(--blue-soft,rgba(37,99,235,.4));}",
    ].join("\n");
    var style = document.createElement("style");
    style.id = "ff-cal-styles";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---- singleton popup ------------------------------------------------------
  var pop = null;       // het popup-element
  var els = null;       // referenties naar deelelementen
  var active = null;    // het input dat nu bediend wordt
  var viewYear, viewMonth; // welke maand we tonen

  function buildPopup() {
    if (pop) return;
    pop = document.createElement("div");
    pop.className = "ff-cal-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Kies een datum");
    pop.hidden = true;

    pop.innerHTML =
      '<div class="ff-cal-head">' +
      '  <button type="button" class="ff-cal-nav" data-act="py" aria-label="Vorig jaar">&laquo;</button>' +
      '  <button type="button" class="ff-cal-nav" data-act="pm" aria-label="Vorige maand">&lsaquo;</button>' +
      '  <div class="ff-cal-title" aria-live="polite"></div>' +
      '  <button type="button" class="ff-cal-nav" data-act="nm" aria-label="Volgende maand">&rsaquo;</button>' +
      '  <button type="button" class="ff-cal-nav" data-act="ny" aria-label="Volgend jaar">&raquo;</button>' +
      '</div>' +
      '<div class="ff-cal-dow">' + DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("") + '</div>' +
      '<div class="ff-cal-grid" role="grid"></div>' +
      '<div class="ff-cal-foot">' +
      '  <button type="button" class="ff-cal-btn ff-cal-btn--clear" data-act="clear">Wissen</button>' +
      '  <button type="button" class="ff-cal-btn ff-cal-btn--today" data-act="today">Vandaag</button>' +
      '</div>';

    document.body.appendChild(pop);
    els = {
      title: pop.querySelector(".ff-cal-title"),
      grid: pop.querySelector(".ff-cal-grid"),
    };

    // Dag-selectie + navigatie + voet-acties.
    pop.addEventListener("click", function (e) {
      // Eerst: klik op een dag-cel?
      var day = e.target.closest(".ff-cal-day");
      if (day) {
        if (!day.disabled) commit(new Date(+day.dataset.y, +day.dataset.m, +day.dataset.d));
        return;
      }
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      if (act === "py") { setView(viewYear - 1, viewMonth); }
      else if (act === "pm") { shiftMonth(-1); }
      else if (act === "nm") { shiftMonth(1); }
      else if (act === "ny") { setView(viewYear + 1, viewMonth); }
      else if (act === "today") { var t = new Date(); commit(startOfDay(t)); }
      else if (act === "clear") { commit(null); }
    });

    // Klik binnen de popup mag het input niet laten blur-sluiten.
    pop.addEventListener("mousedown", function (e) { e.preventDefault(); });

    // Toetsenbordnavigatie binnen het raster.
    pop.addEventListener("keydown", onPopKey);
  }

  function shiftMonth(delta) {
    var m = viewMonth + delta, y = viewYear;
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    setView(y, m);
  }

  function setView(y, m) {
    viewYear = y; viewMonth = m;
    render();
  }

  function constraints() {
    return {
      min: active ? parseValue(active.getAttribute("min")) : null,
      max: active ? parseValue(active.getAttribute("max")) : null,
    };
  }

  function isDisabled(d, c) {
    if (c.min && startOfDay(d) < startOfDay(c.min)) return true;
    if (c.max && startOfDay(d) > startOfDay(c.max)) return true;
    return false;
  }

  function render() {
    if (!pop) return;
    var selected = active ? parseValue(active.value) : null;
    var today = startOfDay(new Date());
    var c = constraints();

    els.title.textContent = MONTHS[viewMonth] + " " + viewYear;

    // Eerste dag van de maand → maandag-index → hoeveel cellen vóór de 1e.
    var first = new Date(viewYear, viewMonth, 1);
    var lead = mondayIndex(first.getDay());
    var start = new Date(viewYear, viewMonth, 1 - lead);

    var html = "";
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var other = d.getMonth() !== viewMonth;
      var disabled = isDisabled(d, c);
      var cls = "ff-cal-day";
      if (other) cls += " is-other";
      if (sameDay(d, today)) cls += " is-today";
      if (selected && sameDay(d, selected)) cls += " is-selected";
      var tab = (selected && sameDay(d, selected)) || (!selected && sameDay(d, today)) ? "0" : "-1";
      html +=
        '<button type="button" class="' + cls + '" role="gridcell"' +
        ' data-y="' + d.getFullYear() + '" data-m="' + d.getMonth() + '" data-d="' + d.getDate() + '"' +
        ' tabindex="' + tab + '"' + (disabled ? " disabled" : "") + '>' + d.getDate() + "</button>";
    }
    els.grid.innerHTML = html;
  }

  function focusedDay() {
    return pop.querySelector('.ff-cal-day[tabindex="0"]') || pop.querySelector(".ff-cal-day");
  }

  function onPopKey(e) {
    var cur = document.activeElement;
    if (!cur || !cur.classList || !cur.classList.contains("ff-cal-day")) {
      if (e.key === "Escape") { close(true); }
      return;
    }
    var d = new Date(+cur.dataset.y, +cur.dataset.m, +cur.dataset.d);
    var delta = 0;
    if (e.key === "ArrowLeft") delta = -1;
    else if (e.key === "ArrowRight") delta = 1;
    else if (e.key === "ArrowUp") delta = -7;
    else if (e.key === "ArrowDown") delta = 7;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!cur.disabled) commit(d);
      return;
    } else if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    else if (e.key === "Tab") { return; }
    else { return; }

    e.preventDefault();
    var nd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
    if (nd.getMonth() !== viewMonth || nd.getFullYear() !== viewYear) {
      setView(nd.getFullYear(), nd.getMonth());
    }
    // Zet focus op de nieuwe dag.
    var sel = pop.querySelector('.ff-cal-day[data-y="' + nd.getFullYear() + '"][data-m="' + nd.getMonth() + '"][data-d="' + nd.getDate() + '"]');
    if (sel) { sel.setAttribute("tabindex", "0"); sel.focus(); }
  }

  function commit(d) {
    if (active) {
      active.value = d ? fmtValue(d) : "";
      active.dispatchEvent(new Event("input", { bubbles: true }));
      active.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  }

  function position() {
    if (!active || !pop || pop.hidden) return;
    var r = active.getBoundingClientRect();
    var pw = pop.offsetWidth || 340;
    var ph = pop.offsetHeight || 380;
    var gap = 6;
    var left = r.left;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    var top = r.bottom + gap;
    if (top + ph > window.innerHeight - 8 && r.top - gap - ph > 8) {
      top = r.top - gap - ph; // omklappen naar boven
    }
    if (top < 8) top = 8;
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
  }

  function openFor(input) {
    injectStyles();
    buildPopup();
    if (active === input && !pop.hidden) return; // idempotent
    active = input;
    var cur = parseValue(input.value) || startOfDay(new Date());
    viewYear = cur.getFullYear();
    viewMonth = cur.getMonth();
    render();
    pop.hidden = false;
    position();
    // Focus de geselecteerde/vandaag-cel voor toetsenbordbediening.
    var f = focusedDay();
    if (f) { try { f.focus({ preventScroll: true }); } catch (_) { f.focus(); } }
  }

  function close(returnFocus) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    var a = active;
    active = null;
    if (returnFocus && a) { try { a.focus({ preventScroll: true }); } catch (_) {} }
  }

  // ---- enhance één input ----------------------------------------------------
  function enhance(input) {
    if (!input || input.nodeName !== "INPUT") return;
    if ((input.getAttribute("type") || "").toLowerCase() !== "date") return;
    if (input.__ffCal) return;
    input.__ffCal = true;
    input.classList.add("ff-cal-input");

    // Native picker onderdrukken + onze kalender openen.
    input.addEventListener("mousedown", function (e) {
      // Voorkom dat Chrome zijn eigen picker opent; open de onze.
      e.preventDefault();
      // Houd/zet focus zodat blur-logica klopt.
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      if (active === input && pop && !pop.hidden) { close(true); }
      else { openFor(input); }
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        if (pop && !pop.hidden && active === input) return;
        e.preventDefault();
        openFor(input);
      }
    });

    // Programmatische aanroepen van showPicker() openen onze kalender.
    try {
      input.showPicker = function () { openFor(input); };
    } catch (_) { /* showPicker niet overschrijfbaar — geen probleem */ }
  }

  function enhanceAll(root) {
    var scope = root || document;
    var list = scope.querySelectorAll ? scope.querySelectorAll('input[type="date"]') : [];
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  // ---- globale event-bindingen (één keer) -----------------------------------
  function bindGlobal() {
    // Klik buiten de popup + niet op het actieve input → sluiten.
    document.addEventListener("mousedown", function (e) {
      if (!pop || pop.hidden) return;
      if (pop.contains(e.target)) return;
      if (active && active === e.target) return;
      close(false);
    }, true);

    document.addEventListener("focusin", function (e) {
      if (!pop || pop.hidden) return;
      if (pop.contains(e.target)) return;
      if (active && active === e.target) return;
      // Focus verschoof buiten kalender + bron → sluiten.
      close(false);
    });

    window.addEventListener("resize", position, true);
    window.addEventListener("scroll", position, true);
    document.addEventListener("keydown", function (e) {
      if (pop && !pop.hidden && e.key === "Escape") { e.preventDefault(); close(true); }
    });

    // Nieuw toegevoegde datumvelden (modals) automatisch enhancen.
    if (global.MutationObserver) {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches('input[type="date"]')) enhance(n);
            if (n.querySelectorAll) enhanceAll(n);
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function init() {
    injectStyles();
    enhanceAll(document);
    bindGlobal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.ffCalendar = { enhance: enhance, enhanceAll: enhanceAll, open: openFor, close: close };
})(typeof window !== "undefined" ? window : this);
