/* Management-dashboard: sectie-navigatie in de zijbalk robuust maken.
 *
 * Probleem (spraakmemo eigenaar 2026-06-12): in de linkerbalk "werkt niets" /
 * sommige links wel, sommige niet. Oorzaak: de zijbalk-links zijn anker-links
 * (#md-...) en de hele pagina scrollt. De ONDERSTE secties (o.a. "Nieuws",
 * "Incidenten per locatie") kunnen niet tot onder de sticky topbar scrollen
 * omdat er te weinig inhoud ONDER ze staat — de pagina zit dan al op de maximale
 * scrollpositie. Klikken op die links doet dan zichtbaar niets → voelt kapot.
 *
 * Oplossing:
 *  1. Een dynamische "trailing spacer" onderaan de inhoud, precies hoog genoeg
 *     zodat ook de laatste sectie naar de sticky-offset kan scrollen. Alle
 *     metingen gebeuren in de SCROLL-ruimte (window.scrollY + rect + innerHeight)
 *     zodat de globale html{zoom:1.1} de berekening niet breekt (géén mix met
 *     offsetTop/clientHeight, die in een ongezoomde ruimte zitten).
 *  2. Scroll-spy: markeer de zijbalk-link van de sectie die in beeld is, zodat
 *     de actieve markering meeloopt en een klik altijd zichtbaar feedback geeft.
 *
 * Alleen actief op de management-dashboard pagina.
 */
(function () {
  "use strict";

  if (!document.body || !document.body.classList.contains("page-management-dashboard")) {
    return;
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var content = document.querySelector(".content--mgmt-dashboard");
    var links = Array.prototype.slice.call(
      document.querySelectorAll(".side-nav .side-link[href^='#']")
    );
    if (!content || !links.length) return;

    var sections = links
      .map(function (a) {
        var id = (a.getAttribute("href") || "").slice(1);
        return { link: a, id: id, el: id ? document.getElementById(id) : null };
      })
      .filter(function (s) {
        return s.el;
      });
    if (!sections.length) return;

    // --- 1. Trailing spacer -------------------------------------------------
    var spacer = document.createElement("div");
    spacer.className = "md-scroll-spacer";
    spacer.setAttribute("aria-hidden", "true");
    content.appendChild(spacer);

    function stickyOffset() {
      var raw = getComputedStyle(document.body).getPropertyValue("--md-topbar-h");
      var px = parseFloat(raw);
      if (!isFinite(px)) px = 52;
      return px + 12; // gelijk aan scroll-margin-top: calc(--md-topbar-h + 12px)
    }

    // BELANGRIJK i.v.m. de globale html{zoom:1.1}: reken volledig in de
    // SCROLL-ruimte, d.w.z. met window.scrollY + getBoundingClientRect() +
    // window.innerHeight. Die drie zitten in dezelfde (gezoomde) ruimte
    // — in tegenstelling tot offsetTop/clientHeight (ongezoomde layout-px),
    // die hier een factor 1,1 verschillen en de berekening zouden breken.
    var applying = false;
    function recalcSpacer() {
      if (applying) return;
      applying = true;
      try {
        var scrollEl = document.scrollingElement || document.documentElement;
        var cur = parseFloat(
          getComputedStyle(content).getPropertyValue("--md-spacer-h")
        );
        if (!isFinite(cur)) cur = 0;

        var last = sections[sections.length - 1].el;
        // Absolute top van de laatste sectie in scroll-ruimte (onafhankelijk van
        // de huidige scrollpositie en van de spacer, die ná de sectie staat):
        var absTop = last.getBoundingClientRect().top + window.scrollY;
        // Scrollpositie waarop die top net onder de sticky topbar landt:
        var targetScroll = absTop - stickyOffset();
        // Huidige maximale scrollpositie (bevat de huidige spacer):
        var maxScroll = scrollEl.scrollHeight - window.innerHeight;
        // Nieuwe spacer = huidige + tekort. Bij teveel spacer wordt 't kleiner;
        // nooit negatief.
        var next = Math.max(0, Math.round(cur + (targetScroll - maxScroll)));
        if (Math.abs(next - cur) > 1) {
          content.style.setProperty("--md-spacer-h", next + "px");
        }
      } finally {
        applying = false;
      }
    }

    recalcSpacer();

    // Herbereken bij viewport-resize en wanneer async-geladen data de
    // sectiehoogtes verandert.
    window.addEventListener("resize", recalcSpacer);
    if (typeof ResizeObserver === "function") {
      var ro = new ResizeObserver(function () {
        recalcSpacer();
      });
      ro.observe(content);
    } else {
      setTimeout(recalcSpacer, 1200);
      setTimeout(recalcSpacer, 4000);
    }

    // --- 2. Scroll-spy ------------------------------------------------------
    function setActive(id) {
      for (var i = 0; i < sections.length; i++) {
        var on = sections[i].id === id;
        sections[i].link.classList.toggle("is-active", on);
        if (on) sections[i].link.setAttribute("aria-current", "page");
        else sections[i].link.removeAttribute("aria-current");
      }
    }

    var spying = true;
    var rafPending = false;
    function computeActive() {
      rafPending = false;
      if (!spying) return;
      var off = stickyOffset() + 6;
      // De zijbalk-volgorde is NIET gelijk aan de visuele volgorde van de
      // secties (een sub-sectie kan visueel boven zijn parent staan). Daarom
      // sorteren we op werkelijke positie: actief = de sectie waarvan de top
      // de sticky-lijn al is gepasseerd én daar het dichtst onder zit.
      var passed = sections.filter(function (s) {
        return s.el.getBoundingClientRect().top - off <= 1;
      });
      var current;
      if (!passed.length) {
        current = sections[0].id;
      } else {
        passed.sort(function (a, b) {
          return a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top;
        });
        current = passed[passed.length - 1].id;
      }
      setActive(current);
    }
    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(computeActive);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    computeActive();

    // Klik: direct de bestemming actief tonen en scroll-spy kort pauzeren zodat
    // de markering niet onderweg "terugspringt".
    links.forEach(function (a) {
      a.addEventListener("click", function () {
        var id = (a.getAttribute("href") || "").slice(1);
        if (!id) return;
        setActive(id);
        spying = false;
        setTimeout(function () {
          spying = true;
          computeActive();
        }, 650);
      });
    });
  });
})();
