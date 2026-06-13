/* global window, document */
/**
 * tijd-klok.js — herbruikbare analoge-klok-tijdkiezer (24-uurs).
 *
 * Eén modal met een wijzerplaat waarop je het uur en daarna de minuut kiest
 * (klikken óf slepen), én twee invoervelden waarin je de cijfers direct kunt
 * typen. Bedoeld voor het invoeren van beschikbaarheid-tijden ("ik ben
 * beschikbaar van 07:00 tot 23:00"), zowel op de self-service pagina als in de
 * office-invoer van het kantoor-overzicht.
 *
 * Publieke API (window.FfKlok):
 *   kies({ titel, waarde, nuKnop }) -> Promise<string|null>
 *       Opent de picker. Resolved met "HH:MM" bij OK, of null bij annuleren.
 *   enhance(inputEl, { titel })
 *       Plaatst een klok-knopje ná een bestaand tijd-veld; klikken opent de
 *       picker en schrijft het resultaat terug (+ 'change'-event). De input
 *       blijft gewoon typbaar als fallback.
 *
 * Geen dependencies. Thema via tijd-klok.css.
 */
(function (global) {
  "use strict";
  var doc = global.document;
  var SVGNS = "http://www.w3.org/2000/svg";

  var R_OUT = 106;   // straal buitenring (uren 1–12 / minuten)
  var R_IN = 66;     // straal binnenring (uren 0, 13–23)
  var CENTER = 132;  // viewBox is 264×264

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }
  function onlyDigits(s) { return String(s == null ? "" : s).replace(/[^0-9]/g, ""); }

  /** "HH:MM" → {u,m}; ongeldig → null. */
  function parseWaarde(s) {
    var m = String(s == null ? "" : s).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var u = clamp(parseInt(m[1], 10), 0, 23);
    var mi = clamp(parseInt(m[2], 10), 0, 59);
    return { u: u, m: mi };
  }

  // Hoek (rad) voor een klok-index (0 = boven), kloksgewijs.
  function idxAngle(idx) { return (idx * 30) * Math.PI / 180; }
  function posX(angle, r) { return CENTER + r * Math.sin(angle); }
  function posY(angle, r) { return CENTER - r * Math.cos(angle); }

  function el(tag, cls, txt) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function svgEl(tag) { return doc.createElementNS(SVGNS, tag); }

  /**
   * Opent de picker en resolved met "HH:MM" (OK) of null (annuleren/Escape).
   */
  function kies(opts) {
    opts = opts || {};
    var init = parseWaarde(opts.waarde) || { u: 9, m: 0 };
    var uur = init.u, min = init.m;
    var mode = "uur";          // "uur" → daarna automatisch "min"

    return new Promise(function (resolve) {
      var settled = false;
      function finish(val) {
        if (settled) return;
        settled = true;
        doc.removeEventListener("keydown", onKey, true);
        try { overlay.remove(); } catch (e) { /* ok */ }
        resolve(val);
      }

      // ── DOM opbouwen ──────────────────────────────────────────────────
      var overlay = el("div", "klok-overlay");
      overlay.setAttribute("role", "presentation");
      var card = el("div", "klok-card");
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-label", opts.titel || "Tijd kiezen");
      overlay.appendChild(card);

      card.appendChild(el("div", "klok-titel", opts.titel || "Kies een tijd"));

      // Cijfer-invoervelden
      var display = el("div", "klok-display");
      var uurInp = el("input", "klok-veld klok-veld--uur");
      var minInp = el("input", "klok-veld klok-veld--min");
      [uurInp, minInp].forEach(function (i) {
        i.type = "text";
        i.inputMode = "numeric";
        i.setAttribute("maxlength", "2");
        i.autocomplete = "off";
      });
      uurInp.setAttribute("aria-label", "Uur");
      minInp.setAttribute("aria-label", "Minuut");
      display.appendChild(uurInp);
      display.appendChild(el("span", "klok-colon", ":"));
      display.appendChild(minInp);
      card.appendChild(display);

      // Wijzerplaat
      var face = el("div", "klok-face");
      var svg = svgEl("svg");
      svg.setAttribute("class", "klok-face__svg");
      svg.setAttribute("viewBox", "0 0 264 264");
      var hand = svgEl("line");
      hand.setAttribute("class", "klok-hand");
      hand.setAttribute("x1", CENTER); hand.setAttribute("y1", CENTER);
      var knob = svgEl("circle");
      knob.setAttribute("class", "klok-knob");
      knob.setAttribute("r", "17");
      var center = svgEl("circle");
      center.setAttribute("class", "klok-center");
      center.setAttribute("cx", CENTER); center.setAttribute("cy", CENTER);
      center.setAttribute("r", "3.5");
      svg.appendChild(hand); svg.appendChild(knob); svg.appendChild(center);
      face.appendChild(svg);
      card.appendChild(face);

      // Acties
      var acties = el("div", "klok-acties");
      if (opts.nuKnop) {
        var nuBtn = el("button", "klok-nu", "Nu");
        nuBtn.type = "button";
        nuBtn.addEventListener("click", function () {
          var d = new Date();
          uur = d.getHours(); min = d.getMinutes();
          mode = "uur"; syncInputs(); renderFace();
        });
        acties.appendChild(nuBtn);
      }
      var annuleer = el("button", "btn-outline klok-annuleer", "Annuleren");
      annuleer.type = "button";
      var ok = el("button", "btn-primary klok-ok", "OK");
      ok.type = "button";
      acties.appendChild(annuleer);
      acties.appendChild(ok);
      card.appendChild(acties);

      // ── Render ────────────────────────────────────────────────────────
      function setActiveField() {
        uurInp.classList.toggle("klok-veld--active", mode === "uur");
        minInp.classList.toggle("klok-veld--active", mode === "min");
      }
      function syncInputs() {
        // Werk de velden bij zonder de cursor te storen tijdens typen.
        if (doc.activeElement !== uurInp) uurInp.value = pad2(uur);
        if (doc.activeElement !== minInp) minInp.value = pad2(min);
        setActiveField();
      }

      function makeNum(label, x, y, inner, selected) {
        var b = el("button", "klok-num" + (inner ? " klok-num--inner" : "") + (selected ? " klok-num--sel" : ""), label);
        b.type = "button";
        b.style.left = (x / 264 * 100) + "%";
        b.style.top = (y / 264 * 100) + "%";
        b.setAttribute("data-skip", "1"); // klikken handelen we via de face af
        return b;
      }

      function renderFace() {
        // Verwijder oude getallen (alles behalve de svg).
        Array.prototype.slice.call(face.querySelectorAll(".klok-num")).forEach(function (n) { n.remove(); });

        if (mode === "uur") {
          // Buitenring 1–12
          for (var h = 1; h <= 12; h++) {
            var i = h % 12;                         // 12 → 0 (boven)
            var a = idxAngle(i);
            face.appendChild(makeNum(String(h), posX(a, R_OUT), posY(a, R_OUT), false, uur === h));
          }
          // Binnenring 00, 13–23
          var innerVals = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
          innerVals.forEach(function (v) {
            var ii = v % 12;
            var aa = idxAngle(ii);
            face.appendChild(makeNum(v === 0 ? "00" : String(v), posX(aa, R_IN), posY(aa, R_IN), true, uur === v));
          });
          // Hand
          var isInner = (uur === 0 || uur >= 13);
          var hr = isInner ? R_IN : R_OUT;
          var ha = idxAngle(uur % 12);
          setHand(ha, hr);
        } else {
          // Minuten: labels op 5-tallen.
          for (var mq = 0; mq < 60; mq += 5) {
            var im = mq / 5;
            var am = idxAngle(im);
            face.appendChild(makeNum(pad2(mq), posX(am, R_OUT), posY(am, R_OUT), false, min === mq));
          }
          setHand(min * 6 * Math.PI / 180, R_OUT);
        }
        syncInputs();
      }

      function setHand(angle, r) {
        var hx = posX(angle, r), hy = posY(angle, r);
        hand.setAttribute("x2", hx); hand.setAttribute("y2", hy);
        knob.setAttribute("cx", hx); knob.setAttribute("cy", hy);
      }

      // ── Interactie op de wijzerplaat (klik + sleep) ───────────────────
      function valueFromPoint(clientX, clientY) {
        var rect = face.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = clientX - cx, dy = clientY - cy;
        var deg = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0 = boven, kloksgewijs
        if (deg < 0) deg += 360;
        var frac = Math.hypot(dx, dy) / (rect.width / 2);  // 0..1 (straal-fractie)
        if (mode === "uur") {
          var idx = Math.round(deg / 30) % 12;             // 0 = boven
          var inner = frac < 0.66;
          if (inner) uur = (idx === 0) ? 0 : idx + 12;     // 00, 13–23
          else uur = (idx === 0) ? 12 : idx;               // 1–12
        } else {
          min = Math.round(deg / 6) % 60;                  // elke minuut
        }
      }

      var dragging = false;
      function onDown(e) {
        dragging = true;
        try { face.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        valueFromPoint(e.clientX, e.clientY);
        renderFace();
        e.preventDefault();
      }
      function onMove(e) {
        if (!dragging) return;
        valueFromPoint(e.clientX, e.clientY);
        renderFace();
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        if (mode === "uur") { mode = "min"; renderFace(); }   // door naar minuten
      }
      face.addEventListener("pointerdown", onDown);
      face.addEventListener("pointermove", onMove);
      face.addEventListener("pointerup", onUp);
      face.addEventListener("pointercancel", onUp);

      // ── Typen in de velden ────────────────────────────────────────────
      uurInp.addEventListener("focus", function () { mode = "uur"; setActiveField(); uurInp.select(); });
      minInp.addEventListener("focus", function () { mode = "min"; setActiveField(); minInp.select(); });
      uurInp.addEventListener("input", function () {
        var d = onlyDigits(uurInp.value).slice(0, 2);
        uurInp.value = d;
        var n = parseInt(d, 10);
        if (!isNaN(n)) { uur = clamp(n, 0, 23); renderFace(); }
        if (d.length === 2) { mode = "min"; minInp.focus(); }
      });
      minInp.addEventListener("input", function () {
        var d = onlyDigits(minInp.value).slice(0, 2);
        minInp.value = d;
        var n = parseInt(d, 10);
        if (!isNaN(n)) { min = clamp(n, 0, 59); renderFace(); }
      });
      function bumpKeys(inp, isUur) {
        inp.addEventListener("keydown", function (e) {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            var step = e.key === "ArrowUp" ? 1 : -1;
            if (isUur) uur = (uur + step + 24) % 24; else min = (min + step + 60) % 60;
            renderFace();
          } else if (e.key === "Enter") { finish(pad2(uur) + ":" + pad2(min)); }
        });
      }
      bumpKeys(uurInp, true); bumpKeys(minInp, false);

      // ── Sluiten ───────────────────────────────────────────────────────
      ok.addEventListener("click", function () { finish(pad2(uur) + ":" + pad2(min)); });
      annuleer.addEventListener("click", function () { finish(null); });
      overlay.addEventListener("pointerdown", function (e) { if (e.target === overlay) finish(null); });
      function onKey(e) {
        if (e.key === "Escape") { e.stopPropagation(); finish(null); }
      }
      doc.addEventListener("keydown", onKey, true);

      // ── Tonen ─────────────────────────────────────────────────────────
      (doc.body || doc.documentElement).appendChild(overlay);
      renderFace();
      // Geen autofocus op het uur-veld: laat de wijzerplaat de hoofdinteractie
      // zijn (focus zou op mobiel meteen het toetsenbord openen).
    });
  }

  // Klein klok-icoon (inline SVG) voor de enhance-knop.
  var KLOK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

  /**
   * Plaatst een klok-knop ná een bestaand tijd-veld. Klik opent de picker en
   * schrijft "HH:MM" terug naar de input (+ change-event). De input zelf blijft
   * werken (typen of native picker), de knop is een extra ingang.
   */
  function enhance(input, opts) {
    if (!input || input.__klokEnhanced) return;
    input.__klokEnhanced = true;
    opts = opts || {};
    var btn = el("button", "klok-trigger");
    btn.type = "button";
    btn.title = "Kies tijd via klok";
    btn.setAttribute("aria-label", "Kies tijd via klok");
    btn.innerHTML = KLOK_ICON;
    btn.addEventListener("click", function () {
      kies({ titel: opts.titel || "Kies een tijd", waarde: input.value, nuKnop: opts.nuKnop })
        .then(function (val) {
          if (val == null) return;
          input.value = val;
          try { input.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { /* ok */ }
        });
    });
    if (input.nextSibling) input.parentNode.insertBefore(btn, input.nextSibling);
    else input.parentNode.appendChild(btn);
    return btn;
  }

  global.FfKlok = { kies: kies, enhance: enhance };
})(window);
