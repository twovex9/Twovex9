/* Management-dashboard: actieve zijbalk-markering (scroll-spy).
 *
 * Spraakmemo eigenaar 2026-06-12: na een klik op een zijbalk-link (Verkeerslicht,
 * Financiën, ...) is niet meer te zien in welke sectie je zit — de blauwe
 * markering blijft op "Overzicht" staan. De vorige scroll-spy (PR #86) is in
 * PR #88 samen met de spacer-JS verwijderd omdat de ResizeObserver daar de
 * pagina kon bevriezen.
 *
 * Deze herimplementatie kan dat per constructie niet:
 *  - GEEN ResizeObserver en GEEN enkele mutatie van layout-afmetingen — het
 *    script LEEST alleen posities (rects) en toggelt een class op de
 *    zijbalk-links. Er bestaat dus geen meet→muteer→meet-lus.
 *  - Scroll-listener is passief en rAF-gethrotteld (max 1 meting per frame).
 *  - De sticky-offset wordt gemeten als de onderkant van de echte topbar-rect,
 *    in dezelfde coördinatenruimte als de sectie-rects — daardoor is de
 *    vergelijking ongevoelig voor de globale html{zoom:1.1}.
 *
 * Alleen actief op de management-dashboard pagina.
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    if (!document.body.classList.contains("page-management-dashboard")) return;

    var links = Array.prototype.slice.call(
      document.querySelectorAll(".side-nav .side-link[href^='#']")
    );
    var sections = links
      .map(function (a) {
        var id = (a.getAttribute("href") || "").slice(1);
        return { link: a, id: id, el: id ? document.getElementById(id) : null };
      })
      .filter(function (s) { return s.el; });
    if (!sections.length) return;

    var topbar = document.querySelector(".topbar");
    function stickyOffset() {
      // Onderkant van de sticky topbar in viewport-coördinaten: zelfde ruimte
      // als getBoundingClientRect() van de secties, dus zoom-/DPI-proof.
      if (topbar) {
        var b = topbar.getBoundingClientRect().bottom;
        if (isFinite(b) && b > 0) return b + 12;
      }
      return 64;
    }

    var activeId = null;
    function setActive(id) {
      if (id === activeId) return;
      activeId = id;
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
      // Zijbalk-volgorde ≠ visuele volgorde (sub-secties kunnen visueel vóór
      // hun parent staan) → kies op werkelijke positie: de sectie waarvan de
      // top de sticky-lijn al passeerde en daar het dichtst onder zit.
      var current = null;
      var bestTop = -Infinity;
      for (var i = 0; i < sections.length; i++) {
        var top = sections[i].el.getBoundingClientRect().top;
        if (top - off <= 1 && top > bestTop) {
          bestTop = top;
          current = sections[i].id;
        }
      }
      setActive(current || sections[0].id);
    }
    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(computeActive);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Klik: bestemming meteen blauw markeren en de spy heel kort pauzeren,
    // zodat de markering tijdens de sprong niet "terugflikkert".
    var pauseTimer = null;
    function activateHash(id) {
      if (!id) return;
      setActive(id);
      spying = false;
      if (pauseTimer) clearTimeout(pauseTimer);
      pauseTimer = setTimeout(function () {
        spying = true;
        computeActive();
      }, 700);
    }
    links.forEach(function (a) {
      a.addEventListener("click", function () {
        activateHash((a.getAttribute("href") || "").slice(1));
      });
    });
    window.addEventListener("hashchange", function () {
      activateHash((location.hash || "").slice(1));
    });

    // Startstand: deep-link met hash wint, anders meten.
    if (location.hash && document.getElementById(location.hash.slice(1))) {
      activateHash(location.hash.slice(1));
    } else {
      computeActive();
    }
  });
})();
