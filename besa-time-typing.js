/**
 * besa-time-typing.js — vlot typbare tijdvelden (uu:mm)
 *
 * Probleem: een native <input type="time"> dwingt de gebruiker om eerst het
 * uren-segment te vullen en daarna apart op het minuten-segment te klikken.
 * De eigenaar wil de tijd gewoon als losse cijfers achter elkaar kunnen typen:
 *   "2205"  -> 22:05
 *   "905"   -> 09:05
 *   "1300"  -> 13:00
 * zonder ooit op het minuten-gedeelte te hoeven klikken.
 *
 * Oplossing: vervang het native time-veld door een gemaskeerd tekstveld dat
 * cijfers links-naar-rechts als HHMM interpreteert en na de uren automatisch
 * naar de minuten doorspringt. De `.value` blijft exact "HH:MM" (of leeg), dus
 * alle bestaande uitleescode (split op ":") werkt ongewijzigd door.
 *
 * Gebruik:
 *   - Markeer een veld met `data-besa-timetype` (of laat het een
 *     `<input type="time">` zijn binnen een container met `[data-besa-timetype]`).
 *   - Roep `window.BesaTimeTyping.enhance(inputEl)` aan voor dynamisch
 *     toegevoegde velden, of laat de MutationObserver het automatisch oppikken.
 *
 * Het veld is volledig deterministisch: er kan nooit een ongeldige tijd
 * ontstaan (uren 00-23, minuten 00-59), en op blur wordt altijd genormaliseerd
 * naar een complete "HH:MM" (of leeg gelaten als er niets is ingevuld).
 */
(function (global) {
  "use strict";

  var ENHANCED_FLAG = "__besaTimeTyping";

  /**
   * Vorm een string losse cijfers (max 4) om naar een (mogelijk partiële)
   * weergave "H", "HH", "HH:M" of "HH:MM" met slimme auto-advance.
   *
   * Regels (links-naar-rechts als HHMM):
   *   - 1e cijfer 3-9  -> uur = 0X, uren meteen vergrendeld (door naar minuten)
   *   - 1e cijfer 0-2  -> mogelijk twee-cijferig uur; wacht op 2e cijfer
   *       - is 1e == 2 en 2e == 4..9 -> ongeldig 2e uurcijfer: behandel 1e als
   *         los uur (0X) en het 2e cijfer start de minuten
   *   - minuten: 1e cijfer 6-9 -> minuut = 0X (compleet); 0-5 -> twee-cijferig
   */
  function formatDigits(digits) {
    digits = String(digits || "").replace(/\D/g, "").slice(0, 4);
    if (!digits) return "";

    var d = digits.split("");
    var hourStr = "";
    var consumed = 0;
    var hourLocked = false;

    if (d[0] >= "3") {
      // 3..9 kan nooit het tiental van een geldig uur zijn -> los uur 0X
      hourStr = "0" + d[0];
      consumed = 1;
      hourLocked = true;
    } else {
      // d[0] is 0, 1 of 2
      if (d.length >= 2) {
        if (d[0] === "2" && d[1] > "3") {
          // "2" gevolgd door 4..9 is geen geldig uur -> 02 + minuten
          hourStr = "0" + d[0];
          consumed = 1;
        } else {
          hourStr = d[0] + d[1];
          consumed = 2;
        }
        hourLocked = true;
      } else {
        // enkel uurcijfer, nog niet vergrendeld
        return d[0];
      }
    }

    var rest = d.slice(consumed);
    if (rest.length === 0) {
      // uren vergrendeld maar nog geen minuten -> toon "HH" (zonder dubbele punt
      // zodat backspace netjes het laatste uurcijfer kan wissen)
      return hourStr;
    }

    var minStr;
    if (rest[0] >= "6") {
      minStr = "0" + rest[0];
    } else if (rest.length >= 2) {
      minStr = rest[0] + rest[1];
    } else {
      minStr = rest[0];
    }
    return hourStr + ":" + minStr;
  }

  /** Normaliseer naar een complete, geldige "HH:MM" of "" (gebruikt bij blur). */
  function normalize(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    // Interpreteer via dezelfde formatter, daarna aanvullen + clampen.
    var formatted = formatDigits(digits);
    var parts = formatted.split(":");
    var h = parseInt(parts[0], 10);
    var m = parts.length > 1 && parts[1] !== "" ? parseInt(parts[1], 10) : 0;
    if (isNaN(h)) return "";
    if (h > 23) h = 23;
    if (m > 59) m = 59;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(h) + ":" + pad(m);
  }

  function dispatch(input, type) {
    try {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    } catch (e) {
      var ev = document.createEvent("Event");
      ev.initEvent(type, true, false);
      input.dispatchEvent(ev);
    }
  }

  function enhance(input) {
    if (!input || input[ENHANCED_FLAG]) return;
    // Alleen velden die een tijd voorstellen.
    var wasTime = input.getAttribute("type") === "time";
    input[ENHANCED_FLAG] = true;

    var startValue = input.value || "";

    // Native time-segmenten loslaten: word een gewoon tekstveld dat wij maskeren.
    input.setAttribute("type", "text");
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("maxlength", "5");
    input.setAttribute("data-besa-timetype", "");
    if (!input.getAttribute("placeholder")) {
      input.setAttribute("placeholder", "uu:mm");
    }
    if (!input.getAttribute("aria-label") && !input.id) {
      input.setAttribute("aria-label", "Tijd (uu:mm)");
    }
    input.classList.add("besa-time-input");

    // Bestaande waarde netjes tonen (bv. bij bewerken van een dienst).
    if (startValue) {
      input.value = normalize(startValue);
    }

    var reformat = function () {
      var digits = (input.value || "").replace(/\D/g, "").slice(0, 4);
      var formatted = formatDigits(digits);
      if (formatted !== input.value) {
        input.value = formatted;
      }
      // Caret altijd aan het einde houden (we typen links-naar-rechts).
      try {
        var end = input.value.length;
        input.setSelectionRange(end, end);
      } catch (e) { /* sommige browsers verbieden dit op niet-tekst types */ }
    };

    input.addEventListener("input", function () {
      reformat();
    });

    input.addEventListener("blur", function () {
      var normalized = normalize(input.value);
      if (normalized !== input.value) {
        input.value = normalized;
      }
      dispatch(input, "change");
    });

    // Selecteer alles bij focus zodat opnieuw typen meteen overschrijft.
    input.addEventListener("focus", function () {
      try { input.select(); } catch (e) { /* noop */ }
    });

    return wasTime;
  }

  function enhanceWithin(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll(
      'input[data-besa-timetype], [data-besa-timetype] input[type="time"]'
    );
    Array.prototype.forEach.call(nodes, enhance);
    // Ook het root-element zelf als het een te verrijken input is.
    if (root.matches && root.matches('input[data-besa-timetype]')) enhance(root);
  }

  function init() {
    enhanceWithin(document);
    // Dynamisch toegevoegde velden (zoals koppeling-tijden) automatisch oppikken.
    if (typeof MutationObserver === "function") {
      var obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches('input[data-besa-timetype]')) {
              enhance(node);
            } else {
              enhanceWithin(node);
            }
          }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  global.BesaTimeTyping = {
    enhance: enhance,
    enhanceWithin: enhanceWithin,
    formatDigits: formatDigits,
    normalize: normalize,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
