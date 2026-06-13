/* global window, document */
/**
 * FfDateRange — één herbruikbare datum-range-kalender (dubbele maand +
 * preset-keuze), BS2-conform qua UX maar in BS1-huisstijl + Nederlandse
 * labels (BS1 is een volledig NL-product).
 *
 * Werking: het component houdt twee verborgen <input type="hidden"> (ISO
 * yyyy-mm-dd) als bron van waarheid. Bij een keuze schrijft het die waarden
 * en dispatcht een "change"-event, zodat bestaande pagina-logica die al op
 * die inputs luisterde ongewijzigd blijft werken.
 *
 *   window.FfDateRange.mount({
 *     container, startInput, endInput,
 *     allowEmpty, emptyLabel, year, onApply
 *   }) -> { open, close, setRange, getRange, destroy }
 */
(function (global) {
  "use strict";

  var MONTHS = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"
  ];
  // Zondag-eerst, net als BS2 (S M T W T F S → Z M D W D V Z).
  var WEEKDAYS = ["Z", "M", "D", "W", "D", "V", "Z"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function toISO(d) {
    if (!d) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function parseISO(s) {
    if (!s) return null;
    var m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtNL(d) {
    if (!d) return "";
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function mount(opts) {
    opts = opts || {};
    var container = opts.container;
    var startInput = opts.startInput;
    var endInput = opts.endInput;
    if (!container || !startInput || !endInput) {
      throw new Error("FfDateRange.mount: container/startInput/endInput vereist");
    }
    var allowEmpty = !!opts.allowEmpty;
    var emptyLabel = opts.emptyLabel || "Alle periodes";
    var presetYear = opts.year || new Date().getFullYear();

    // Huidige selectie (Date of null).
    var selStart = parseISO(startInput.value);
    var selEnd = parseISO(endInput.value);
    // Linker zichtbare maand.
    var viewMonth = new Date((selStart || new Date()).getFullYear(),
      (selStart || new Date()).getMonth(), 1);

    // ---- DOM ----
    var pill = el("button", "ff-dr-pill");
    pill.type = "button";
    pill.setAttribute("aria-haspopup", "dialog");
    pill.setAttribute("aria-expanded", "false");
    var pillIco = el("span", "ff-dr-pill-ico");
    pillIco.setAttribute("aria-hidden", "true");
    pillIco.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    var pillSep = el("span", "ff-dr-pill-sep");
    pillSep.setAttribute("aria-hidden", "true");
    var pillTxt = el("span", "ff-dr-pill-txt");
    pill.appendChild(pillIco);
    pill.appendChild(pillSep);
    pill.appendChild(pillTxt);

    var pop = el("div", "ff-dr-pop");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Periode kiezen");
    pop.hidden = true;

    // Preset-keuze ("Select" in BS2).
    var presetWrap = el("div", "ff-dr-preset");
    var presetSel = el("select", "ff-dr-preset-sel");
    presetSel.setAttribute("aria-label", "Snelkeuze periode");
    function addOpt(val, label) {
      var o = el("option", null, label);
      o.value = val;
      presetSel.appendChild(o);
    }
    addOpt("", "Kies een periode…");
    addOpt("this-month", "Deze maand");
    addOpt("last-month", "Vorige maand");
    addOpt("this-year", "Dit jaar (" + presetYear + ")");
    for (var mi = 0; mi < 12; mi += 1) {
      var lbl = MONTHS[mi].charAt(0).toUpperCase() + MONTHS[mi].slice(1) + " " + presetYear;
      addOpt("m" + mi, lbl);
    }
    presetWrap.appendChild(presetSel);

    // Navigatie + dubbele-maand titel.
    var nav = el("div", "ff-dr-nav");
    var prevBtn = el("button", "ff-dr-navbtn ff-dr-navbtn--prev");
    prevBtn.type = "button";
    prevBtn.setAttribute("aria-label", "Vorige maanden");
    prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
    var navTitle = el("div", "ff-dr-title");
    var nextBtn = el("button", "ff-dr-navbtn ff-dr-navbtn--next");
    nextBtn.type = "button";
    nextBtn.setAttribute("aria-label", "Volgende maanden");
    nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
    nav.appendChild(prevBtn);
    nav.appendChild(navTitle);
    nav.appendChild(nextBtn);

    var grids = el("div", "ff-dr-grids");

    var footer = el("div", "ff-dr-footer");
    var clearBtn = el("button", "btn-outline ff-dr-clear", "Wissen");
    clearBtn.type = "button";
    var applyBtn = el("button", "btn-primary ff-dr-apply", "Toepassen");
    applyBtn.type = "button";
    if (allowEmpty) footer.appendChild(clearBtn);
    footer.appendChild(applyBtn);

    pop.appendChild(presetWrap);
    pop.appendChild(nav);
    pop.appendChild(grids);
    pop.appendChild(footer);

    container.classList.add("ff-dr");
    container.appendChild(pill);
    container.appendChild(pop);

    // ---- Render ----
    function buildMonth(base) {
      var wrap = el("div", "ff-dr-month");
      var cap = el("div", "ff-dr-mcap",
        MONTHS[base.getMonth()].charAt(0).toUpperCase()
        + MONTHS[base.getMonth()].slice(1) + " " + base.getFullYear());
      wrap.appendChild(cap);
      var head = el("div", "ff-dr-wk");
      WEEKDAYS.forEach(function (w) { head.appendChild(el("span", "ff-dr-wkd", w)); });
      wrap.appendChild(head);

      var grid = el("div", "ff-dr-days");
      var first = new Date(base.getFullYear(), base.getMonth(), 1);
      var startWeekday = first.getDay(); // 0 = zondag
      var daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      var today = startOfDay(new Date());

      // leidende dagen vorige maand (grijs, niet klikbaar — net als BS2)
      for (var lead = 0; lead < startWeekday; lead += 1) {
        var pd = new Date(base.getFullYear(), base.getMonth(), 1 - (startWeekday - lead));
        grid.appendChild(el("span", "ff-dr-day ff-dr-day--out", String(pd.getDate())));
      }
      for (var dnum = 1; dnum <= daysInMonth; dnum += 1) {
        var dd = new Date(base.getFullYear(), base.getMonth(), dnum);
        var cell = el("button", "ff-dr-day", String(dnum));
        cell.type = "button";
        cell.setAttribute("data-iso", toISO(dd));
        if (sameDay(dd, today)) cell.classList.add("is-today");
        if (selStart && sameDay(dd, selStart)) cell.classList.add("is-start", "is-edge");
        if (selEnd && sameDay(dd, selEnd)) cell.classList.add("is-end", "is-edge");
        if (selStart && selEnd && dd > selStart && dd < selEnd) cell.classList.add("is-inrange");
        cell.addEventListener("click", function (ev) {
          onDayClick(parseISO(ev.currentTarget.getAttribute("data-iso")));
        });
        grid.appendChild(cell);
      }
      // sluitende dagen volgende maand (grijs)
      var totalCells = startWeekday + daysInMonth;
      var trail = (7 - (totalCells % 7)) % 7;
      for (var t = 1; t <= trail; t += 1) {
        grid.appendChild(el("span", "ff-dr-day ff-dr-day--out", String(t)));
      }
      wrap.appendChild(grid);
      return wrap;
    }

    function renderGrids() {
      var m1 = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
      var m2 = addMonths(m1, 1);
      navTitle.textContent =
        MONTHS[m1.getMonth()].charAt(0).toUpperCase() + MONTHS[m1.getMonth()].slice(1)
        + " - "
        + MONTHS[m2.getMonth()].charAt(0).toUpperCase() + MONTHS[m2.getMonth()].slice(1)
        + " " + m2.getFullYear();
      grids.innerHTML = "";
      grids.appendChild(buildMonth(m1));
      grids.appendChild(buildMonth(m2));
    }

    function renderPill() {
      if (selStart && selEnd) {
        pillTxt.textContent = fmtNL(selStart) + " - " + fmtNL(selEnd);
        pill.classList.add("is-set");
      } else if (selStart && !selEnd) {
        pillTxt.textContent = fmtNL(selStart) + " - …";
        pill.classList.add("is-set");
      } else {
        pillTxt.textContent = emptyLabel;
        pill.classList.remove("is-set");
      }
    }

    function onDayClick(d) {
      if (!d) return;
      if (!selStart || (selStart && selEnd)) {
        selStart = startOfDay(d);
        selEnd = null;
      } else if (d < selStart) {
        selStart = startOfDay(d);
      } else {
        selEnd = startOfDay(d);
      }
      presetSel.value = "";
      renderGrids();
      renderPill();
    }

    function applyPreset(v) {
      var now = new Date();
      var y, mo;
      if (v === "this-month") { y = now.getFullYear(); mo = now.getMonth(); }
      else if (v === "last-month") {
        var lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        y = lm.getFullYear(); mo = lm.getMonth();
      } else if (v === "this-year") {
        selStart = new Date(presetYear, 0, 1);
        selEnd = new Date(presetYear, 11, 31);
        viewMonth = new Date(presetYear, 0, 1);
        renderGrids(); renderPill();
        return;
      } else if (/^m(\d{1,2})$/.test(v)) {
        mo = parseInt(v.slice(1), 10); y = presetYear;
      } else { return; }
      selStart = new Date(y, mo, 1);
      selEnd = new Date(y, mo + 1, 0);
      viewMonth = new Date(y, mo, 1);
      renderGrids();
      renderPill();
    }

    function commit() {
      startInput.value = selStart ? toISO(selStart) : "";
      endInput.value = selEnd ? toISO(selEnd) : "";
      try {
        startInput.dispatchEvent(new Event("change", { bubbles: true }));
        endInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) { /* */ }
      if (typeof opts.onApply === "function") {
        opts.onApply(startInput.value, endInput.value);
      }
    }

    // Houd de popover altijd volledig binnen het scherm: standaard links
    // uitgelijnd op de pill, maar bij overflow rechts schuift hij naar links
    // (en klapt omhoog als hij onderaan niet past).
    function positionPop() {
      pop.style.left = "0px";
      pop.style.right = "auto";
      pop.style.top = "calc(100% + 8px)";
      pop.style.bottom = "auto";
      var margin = 8;
      var crect = container.getBoundingClientRect();
      var prect = pop.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var leftPx = 0;
      if (crect.left + prect.width > vw - margin) {
        leftPx = (vw - margin) - prect.width - crect.left;
      }
      if (crect.left + leftPx < margin) {
        leftPx = margin - crect.left;
      }
      pop.style.left = Math.round(leftPx) + "px";
      var prect2 = pop.getBoundingClientRect();
      if (prect2.bottom > vh - margin && (crect.top - prect2.height - margin) > 0) {
        pop.style.top = "auto";
        pop.style.bottom = "calc(100% + 8px)";
      }
    }

    function open() {
      // sync vanuit inputs (kan extern gewijzigd zijn)
      selStart = parseISO(startInput.value);
      selEnd = parseISO(endInput.value);
      viewMonth = new Date((selStart || new Date()).getFullYear(),
        (selStart || new Date()).getMonth(), 1);
      renderGrids();
      renderPill();
      pop.hidden = false;
      pill.setAttribute("aria-expanded", "true");
      container.classList.add("ff-dr--open");
      positionPop();
    }
    function close() {
      pop.hidden = true;
      pill.setAttribute("aria-expanded", "false");
      container.classList.remove("ff-dr--open");
    }

    // ---- events ----
    pill.addEventListener("click", function (e) {
      e.stopPropagation();
      if (pop.hidden) open(); else close();
    });
    prevBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      viewMonth = addMonths(viewMonth, -1);
      renderGrids();
    });
    nextBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      viewMonth = addMonths(viewMonth, 1);
      renderGrids();
    });
    presetSel.addEventListener("change", function () {
      if (presetSel.value) applyPreset(presetSel.value);
    });
    presetSel.addEventListener("click", function (e) { e.stopPropagation(); });
    clearBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      selStart = null; selEnd = null; presetSel.value = "";
      renderGrids(); renderPill();
      commit();
      close();
    });
    applyBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (selStart && !selEnd) selEnd = selStart; // één dag → zelfde start/eind
      commit();
      close();
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function (e) {
      if (pop.hidden) return;
      if (!e.target || !e.target.closest || !e.target.closest(".ff-dr")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden) close();
    });
    window.addEventListener("resize", function () {
      if (!pop.hidden) positionPop();
    });

    renderPill();

    return {
      open: open,
      close: close,
      getRange: function () { return { start: startInput.value, end: endInput.value }; },
      setRange: function (s, e) {
        startInput.value = s || "";
        endInput.value = e || "";
        selStart = parseISO(startInput.value);
        selEnd = parseISO(endInput.value);
        renderPill();
      },
      refreshPill: renderPill,
      destroy: function () {
        try { container.removeChild(pill); container.removeChild(pop); } catch (e) { /* */ }
      }
    };
  }

  global.FfDateRange = { mount: mount };
})(typeof window !== "undefined" ? window : this);
