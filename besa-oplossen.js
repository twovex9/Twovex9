/* global window, document, getComputedStyle */
/**
 * besa-oplossen.js — centraal "oplos-register" + herbruikbare popover.
 *
 * User-eis (spraakmemo 2026-06-12): bij elke foutmelding/issue in de app een
 * knop "Oplossen →". Klik opent een klein popover met (a) een korte uitleg
 * "zo los je dit op" én (b) een knop die je direct naar de juiste tab/plek
 * brengt. De combinatie van uitleg + spring-knop.
 *
 * Dit bestand is de ENE bron-van-waarheid voor "welke foutmelding hoort bij
 * welke oplossing". Drie inhaakpunten gebruiken het:
 *   1. Cliëntdossier  → "Dossier-issues"-kaart (client-detail.js), per
 *      issue_type een vaste tab-bestemming.
 *   2. Medewerker     → "Waarschuwingen"-sectie (medewerker.js), VOG/contract/
 *      ID/BHV/opleiding → Documenten- of Opleiding-tab.
 *   3. Planning        → reden-popover op het "!"-icoon (planning.js), open
 *      dienst → medewerker toewijzen.
 *
 * Een nieuw fouttype koppel je hier in één regel. De popover is zoom-bewust
 * (de interface draait op `html { zoom: 1.1 }`, zie planningEffectiveZoom).
 *
 * Geen losse stijl: alle opmaak via classes/tokens in styles.css.
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ============================================================
  // 1. Register — cliëntdossier issue_type → oplossing
  //    issue_type-waarden komen 1-op-1 uit de DB-check
  //    public.client_dossier_controle() (clientmodule_v2_fase4.sql).
  //    `tab` = data-cd-panel-sleutel van het cliëntdossier-tabblad.
  // ============================================================
  var CLIENT_FIXES = {
    beschikking_ontbreekt: {
      uitleg: "Er is nog geen beschikking gekoppeld. Voeg op het tabblad Beschikkingen een geldige beschikking toe.",
      knop: "Ga naar Beschikkingen",
      tab: "b",
    },
    beschikking_verlopen: {
      uitleg: "De beschikking is verlopen. Voeg op het tabblad Beschikkingen een nieuwe (verlengde) beschikking toe.",
      knop: "Ga naar Beschikkingen",
      tab: "b",
    },
    zorgplan_ontbreekt: {
      uitleg: "Er is geen actief zorgplan. Maak op het tabblad Zorgplannen een zorgplan aan en zet de status op 'Actief'.",
      knop: "Ga naar Zorgplannen",
      tab: "z",
    },
    zorgplan_evaluatie_verlopen: {
      uitleg: "Het evaluatiemoment is verstreken. Evalueer het zorgplan op het tabblad Zorgplannen en leg een nieuw evaluatiemoment vast.",
      knop: "Ga naar Zorgplannen",
      tab: "z",
    },
    evaluatie_te_laat: {
      uitleg: "Een evaluatie is te laat. Werk de evaluatie bij op het tabblad Zorgplannen.",
      knop: "Ga naar Zorgplannen",
      tab: "z",
    },
    signaleringsplan_ontbreekt: {
      uitleg: "Er is geen actief signaleringsplan. Maak er een aan op het tabblad Signalering.",
      knop: "Ga naar Signalering",
      tab: "s",
    },
    handtekening_ontbreekt: {
      uitleg: "De verplichte verklaringen (privacy, toestemming, huisregels) zijn niet (volledig) ondertekend. Verstuur of registreer de ondertekening op het tabblad Intake.",
      knop: "Ga naar Intake",
      tab: "k",
    },
    verplichte_documenten_ontbreken: {
      uitleg: "Het identiteitsbewijs ontbreekt in het dossier. Upload een kopie van het ID-bewijs op het tabblad Documenten.",
      knop: "Ga naar Documenten",
      tab: "j",
    },
  };

  function clientFix(issueType) {
    return CLIENT_FIXES[String(issueType || "")] || null;
  }

  // ============================================================
  // 2. Medewerker-waarschuwingen → oplossing
  //    De warning-items komen uit medewerker-warnings.js. Het `type`/`label`
  //    is niet helemaal uniform (errors: lowercase keys, warnings: het label),
  //    dus we leiden de bestemming af uit type+label+kind:
  //      - opleiding/training/SKJ → Opleiding-tab
  //      - alle overige documenten (VOG/contract/ID/BHV/verzekering) → Documenten-tab
  //    `tab` = data-tab van het medewerkerdetail-tabblad.
  // ============================================================
  function medewerkerFix(item) {
    if (!item) return null;
    var key = String(item.type || item.label || "").toLowerCase();
    var isEdu =
      key.indexOf("opleid") !== -1 ||
      key.indexOf("training") !== -1 ||
      key.indexOf("education") !== -1;
    var naam = String(item.label || item.naam || "dit document");
    var kind = String(item.kind || "");
    var uitleg;
    if (isEdu) {
      uitleg = "Werk de opleiding/training bij op het tabblad Opleiding: voeg een geldig certificaat toe of werk de vervaldatum bij.";
    } else if (kind === "missing") {
      uitleg = naam + " ontbreekt. Upload het document op het tabblad Documenten.";
    } else if (kind === "expired") {
      uitleg = naam + " is verlopen. Upload een nieuw, geldig exemplaar op het tabblad Documenten.";
    } else {
      uitleg = naam + " verloopt binnenkort. Vraag tijdig een nieuw exemplaar aan en upload het op het tabblad Documenten.";
    }
    return {
      uitleg: uitleg,
      knop: isEdu ? "Ga naar Opleiding" : "Ga naar Documenten",
      tab: isEdu ? "opleiding" : "documenten",
    };
  }

  // ============================================================
  // 3. Herbruikbare popover — "uitleg + spring-knop"
  // ============================================================

  var _pop = null;

  function closePopover() {
    if (_pop) {
      try { _pop._cleanup && _pop._cleanup(); } catch (e) { /* */ }
      try { _pop.remove(); } catch (e) { /* */ }
      _pop = null;
    }
  }

  function isOpenFor(anchorEl) {
    return !!(_pop && anchorEl && _pop._anchor === anchorEl);
  }

  // Effectieve CSS-`zoom` van de keten boven een element (product van alle
  // `zoom`-waarden van de voorouders). Identiek aan planningEffectiveZoom — de
  // interface draait standaard op `html { zoom: 1.1 }`. getBoundingClientRect()
  // geeft VISUELE coördinaten; style.left/top zijn CSS-layout-lengtes die bij
  // het renderen nóg eens met de zoom worden vermenigvuldigd. Delen door de
  // zoom houdt de popover recht onder het anker.
  function effectiveZoom(el) {
    var z = 1;
    for (var n = el ? el.parentElement : null; n; n = n.parentElement) {
      var cz = parseFloat(getComputedStyle(n).zoom);
      if (cz && cz !== 1) z *= cz;
    }
    return z || 1;
  }

  /**
   * Open de oplos-popover, geankerd onder `anchorEl`.
   * @param {Element} anchorEl  het "Oplossen →"-knopje
   * @param {{uitleg:string, knopLabel:string, onGaNaar:Function}} opts
   */
  function openPopover(anchorEl, opts) {
    closePopover();
    if (!anchorEl || !opts) return;
    var pop = document.createElement("div");
    pop.className = "besa-oplossen-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Hoe los ik dit op");
    pop.innerHTML =
      '<div class="besa-oplossen-pop-head">Hoe los ik dit op?</div>' +
      '<div class="besa-oplossen-pop-body">' + esc(opts.uitleg || "") + "</div>" +
      '<button type="button" class="btn-primary besa-oplossen-pop-go">' +
        esc(opts.knopLabel || "Ga naar de juiste plek") + " →" +
      "</button>";
    document.body.appendChild(pop);

    // Positioneer onder het anker; val terug naar boven als het buiten beeld
    // valt. Anker-coördinaten door de zoom delen (zie effectiveZoom).
    var z = effectiveZoom(pop) || 1;
    var r = anchorEl.getBoundingClientRect();
    var aLeft = r.left / z;
    var aTop = r.top / z;
    var aBottom = r.bottom / z;
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = aLeft + global.scrollX;
    var maxLeft = global.scrollX + vw - pw - 8;
    if (left > maxLeft) left = Math.max(global.scrollX + 8, maxLeft);
    var top = aBottom + global.scrollY + 6;
    if (aBottom + ph + 10 > vh) {
      top = Math.max(global.scrollY + 8, aTop + global.scrollY - ph - 6);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    var goBtn = pop.querySelector(".besa-oplossen-pop-go");
    if (goBtn) {
      goBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
        try { if (typeof opts.onGaNaar === "function") opts.onGaNaar(); } catch (err) { /* */ }
      });
    }

    var onDoc = function (e) {
      if (pop.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
      closePopover();
    };
    var onKey = function (e) { if (e.key === "Escape") closePopover(); };
    pop._cleanup = function () {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
      global.removeEventListener("resize", closePopover, true);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    global.addEventListener("resize", closePopover, true);
    pop._anchor = anchorEl;
    _pop = pop;
    try { goBtn && goBtn.focus({ preventScroll: true }); } catch (e) { /* */ }
  }

  // HTML voor het trigger-knopje (her te gebruiken in render-functies). De
  // extra data-attributen kun je in je click-handler weer uitlezen.
  function triggerHtml(dataAttrs) {
    var attrs = "";
    if (dataAttrs && typeof dataAttrs === "object") {
      Object.keys(dataAttrs).forEach(function (k) {
        attrs += " " + k + '="' + esc(dataAttrs[k]) + '"';
      });
    }
    return '<button type="button" class="besa-oplossen-trigger"' + attrs +
      ' aria-label="Hoe los ik dit op?">Oplossen →</button>';
  }

  global.besaOplossen = {
    clientFix: clientFix,
    medewerkerFix: medewerkerFix,
    openPopover: openPopover,
    closePopover: closePopover,
    isOpenFor: isOpenFor,
    triggerHtml: triggerHtml,
    esc: esc,
  };
})(window);
