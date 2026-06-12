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

  // Tekst-gebaseerde variant: voor plekken die alleen vrije tekst leveren (geen
  // issue_type), zoals de Samenvatting-kaart ("Geen actief zorgplan", "Geen
  // lopende beschikking", "Nog geen rapportages", …). Leidt de bestemming af uit
  // trefwoorden en hergebruikt waar mogelijk de uitleg uit CLIENT_FIXES.
  function clientFixByText(tekst) {
    var t = String(tekst || "").toLowerCase();
    if (!t) return null;
    if (t.indexOf("zorgplan") !== -1) {
      return clientFix(t.indexOf("evaluatie") !== -1 ? "zorgplan_evaluatie_verlopen" : "zorgplan_ontbreekt");
    }
    if (t.indexOf("signalering") !== -1) return clientFix("signaleringsplan_ontbreekt");
    if (t.indexOf("beschikking") !== -1) {
      return clientFix(t.indexOf("verlopen") !== -1 ? "beschikking_verlopen" : "beschikking_ontbreekt");
    }
    if (t.indexOf("identiteit") !== -1 || t.indexOf("document") !== -1) {
      return clientFix("verplichte_documenten_ontbreken");
    }
    if (t.indexOf("verklaring") !== -1 || t.indexOf("onderteken") !== -1 || t.indexOf("handteken") !== -1) {
      return clientFix("handtekening_ontbreekt");
    }
    if (t.indexOf("rapportage") !== -1) {
      return { uitleg: "Er zijn nog geen rapportages vastgelegd. Voeg een rapportage toe op het tabblad Rapportages.", knop: "Ga naar Rapportages", tab: "r" };
    }
    if (t.indexOf("incident") !== -1) {
      return { uitleg: "Bekijk en behandel de incidenten van deze cliënt op het tabblad Incidenten.", knop: "Ga naar Incidenten", tab: "i" };
    }
    if (t.indexOf("contact") !== -1) {
      return { uitleg: "Leg een contactmoment vast op het tabblad Contactlogboek.", knop: "Ga naar Contactlogboek", tab: "g" };
    }
    if (t.indexOf("intake") !== -1) {
      return { uitleg: "Start of vervolg de intake op het tabblad Intake.", knop: "Ga naar Intake", tab: "k" };
    }
    return null;
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
  // 2b. Dashboard-signalen → oplossing (cross-page navigatie)
  //    Dashboards tonen signalen {domein/dom, ernst, tekst}. Anders dan de
  //    detail-pagina's (tabs) navigeert een dashboard-fix naar een ANDERE
  //    pagina. We leiden de bestemming af uit domein + trefwoorden in de tekst.
  //    Retour: {uitleg, knop, url} — onGaNaar doet window.location = url.
  // ============================================================
  function signalFix(domein, tekst) {
    var s = (String(domein || "") + " " + String(tekst || "")).toLowerCase();
    function nav(url, knop, uitleg) { return { url: url, knop: knop, uitleg: uitleg }; }
    // Afgekeurde / af te handelen declaraties → Facturen te beoordelen
    if (s.indexOf("afgekeurd") !== -1 || s.indexOf("afgewezen") !== -1 ||
        (s.indexOf("declarati") !== -1 && (s.indexOf("open") !== -1 || s.indexOf("beoordel") !== -1))) {
      return nav("facturen-te-beoordelen", "Naar Facturen", "Bekijk en (her)beoordeel de betreffende declaraties op de pagina Facturen te beoordelen.");
    }
    // Open/onstaande diensten of bezetting → Planning
    if (s.indexOf("open dienst") !== -1 || s.indexOf("openstaande dienst") !== -1 ||
        s.indexOf("bezetting") !== -1 || s.indexOf("planningsgat") !== -1) {
      return nav("planning", "Naar Planning", "Vul de openstaande diensten in op de planning.");
    }
    // Verlies / resultaat / liquiditeit / marge → Financiën per locatie
    if (s.indexOf("verlies") !== -1 || s.indexOf("resultaat") !== -1 ||
        s.indexOf("liquiditeit") !== -1 || s.indexOf("marge") !== -1) {
      return nav("financien-locaties", "Naar Financiën", "Bekijk de kosten en opbrengsten per locatie om het resultaat te verbeteren.");
    }
    // VOG / documenten / compliance → Compliance-dashboard
    if (s.indexOf("vog") !== -1 || s.indexOf("document") !== -1 || s.indexOf("complian") !== -1) {
      return nav("compliance-dashboard", "Naar Compliance", "Bekijk welke medewerkers documenten missen of verlopen documenten hebben.");
    }
    // Verzuim / ziek → HR-dashboard
    if (s.indexOf("verzuim") !== -1 || s.indexOf("ziek") !== -1) {
      return nav("hr-dashboard", "Naar HR-dashboard", "Bekijk het ziekteverzuim en de betrokken medewerkers.");
    }
    // Contracten → HR
    if (s.indexOf("contract") !== -1) {
      return nav("hr", "Naar HR", "Verleng of werk de aflopende contracten bij in HR.");
    }
    // Beschikkingen → Beschikkingen
    if (s.indexOf("beschikking") !== -1) {
      return nav("beschikkingen", "Naar Beschikkingen", "Werk de betreffende beschikking(en) bij.");
    }
    // Incidenten → Incidenten
    if (s.indexOf("incident") !== -1 || s.indexOf("klacht") !== -1) {
      return nav("incidenten", "Naar Incidenten", "Behandel de openstaande incidenten en klachten.");
    }
    // Domein-fallbacks: vang signalen waarvan de tekst geen trefwoord bevat,
    // op basis van het domein-label (bv. "4 diensten vandaag niet ingevuld").
    var d = String(domein || "").toLowerCase();
    if (d.indexOf("planning") !== -1 || s.indexOf("dienst") !== -1 || s.indexOf("ingevuld") !== -1) {
      return nav("planning", "Naar Planning", "Vul de openstaande diensten in op de planning.");
    }
    if (d.indexOf("financ") !== -1) {
      return nav("financien-locaties", "Naar Financiën", "Bekijk de financiën per locatie.");
    }
    if (d.indexOf("hr") !== -1 || d.indexOf("personeel") !== -1) {
      return nav("hr-dashboard", "Naar HR-dashboard", "Bekijk de HR-signalen en betrokken medewerkers.");
    }
    if (d.indexOf("incident") !== -1 || d.indexOf("klacht") !== -1) {
      return nav("incidenten", "Naar Incidenten", "Behandel de openstaande incidenten en klachten.");
    }
    return null;
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

    // Positioneer onder het anker. Anker-coördinaten door de zoom delen (zie
    // effectiveZoom) zodat ze in dezelfde layout-ruimte zitten als offsetWidth.
    // HORIZONTAAL (user-eis 2026-06-12): standaard lijnt de LINKERkant van de
    // popover uit met de linkerkant van de "Oplossen"-knop. Zou de popover
    // daardoor rechts buiten beeld vallen, dan lijnt in plaats daarvan de
    // RECHTERkant van de popover uit met de rechterkant van de knop — zo blijft
    // hij altijd aan de knop verankerd én volledig in beeld.
    var z = effectiveZoom(pop) || 1;
    var r = anchorEl.getBoundingClientRect();
    var aLeft = r.left / z;
    var aRight = r.right / z;
    var aTop = r.top / z;
    var aBottom = r.bottom / z;
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = aLeft + global.scrollX;
    // Valt de links-uitgelijnde popover rechts buiten beeld? → rechts-uitlijnen
    // op de knop (rechterkant popover = rechterkant knop).
    if (aLeft + pw > vw - 8) {
      left = aRight - pw + global.scrollX;
    }
    // Veiligheidsondergrens: nooit links buiten beeld.
    if (left < global.scrollX + 8) left = global.scrollX + 8;
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

  // Herbruikbare bind voor dashboard-signaalstrips: klik op "Oplossen →" opent de
  // popover en navigeert naar de andere pagina (data-sig-url/-knop/-uitleg op de
  // knop). Eénmalig per container.
  function bindSignals(container) {
    if (!container || container.__oplosSigBound) return;
    container.__oplosSigBound = true;
    container.addEventListener("click", function (ev) {
      var btn = ev.target.closest && ev.target.closest(".besa-oplossen-trigger");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (isOpenFor(btn)) { closePopover(); return; }
      var url = btn.getAttribute("data-sig-url");
      if (!url) return;
      openPopover(btn, {
        uitleg: btn.getAttribute("data-sig-uitleg") || "",
        knopLabel: btn.getAttribute("data-sig-knop") || "Naar de juiste pagina",
        onGaNaar: function () { try { global.location.href = url; } catch (e) { /* */ } },
      });
    });
  }

  // Huidige paginanaam (zonder pad/extensie) — om self-links te onderdrukken.
  function currentPageName() {
    try {
      var p = (global.location.pathname || "").replace(/\/+$/, "").split("/").pop() || "";
      return p.replace(/\.html$/, "");
    } catch (e) { return ""; }
  }

  // Bouw de signaal-fix-knop (of "") voor een {domein, tekst}-signaal. Geen knop
  // als de bestemming de huidige pagina is (zinloze self-link).
  function signalBtn(domein, tekst) {
    var fix = signalFix(domein, tekst);
    if (!fix || fix.url === currentPageName()) return "";
    return triggerHtml({ "data-sig-url": fix.url, "data-sig-knop": fix.knop, "data-sig-uitleg": fix.uitleg });
  }

  global.besaOplossen = {
    clientFix: clientFix,
    clientFixByText: clientFixByText,
    medewerkerFix: medewerkerFix,
    signalFix: signalFix,
    signalBtn: signalBtn,
    bindSignals: bindSignals,
    openPopover: openPopover,
    closePopover: closePopover,
    isOpenFor: isOpenFor,
    triggerHtml: triggerHtml,
    esc: esc,
  };
})(window);
