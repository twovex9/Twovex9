/* ff-page-loader.js — globale laad-animatie (FOUC-preventie).
 *
 * Achtergrond: dit is een multi-page app. Elke pagina is statische HTML die
 * daarna door JS met data wordt gevuld. Daardoor flitste heel even de rauwe
 * skeleton/lege staat in beeld vóór de juiste inhoud verscheen ("eerst iets
 * anders, dan het juiste"). Dat is klassieke FOUC.
 *
 * Oplossing — zelfde patroon als de thema-FOUC-preventie, maar nu wachtend op
 * de ECHTE data in plaats van enkel op de eerste paint:
 *   1. Een inline <head>-snippet zet `data-loading="1"` op <html> VÓÓR de
 *      eerste paint en installeert een lichte netwerk-teller (`window.__ffNet`)
 *      die elke `fetch`/XHR telt. styles.css is render-blocking in de <head>,
 *      dus de overlay-spinner is al actief bij de allereerste paint → de
 *      gebruiker ziet nooit meer de flits, alleen de spinner.
 *   2. Dit bestand haalt het attribuut pas weg wanneer (a) de lay-out minstens
 *      één keer geschilderd is ÉN (b) het netwerk tot rust is gekomen — d.w.z.
 *      alle initiële data-fetches (Supabase) binnen zijn en de bijbehorende
 *      her-render heeft plaatsgevonden. Pas dán staat "direct het juiste".
 *      Een minimale zichttijd voorkomt flikker op snelle pagina's; een harde
 *      fallback-timeout zorgt dat de overlay NOOIT blijft hangen.
 *
 * Waarom netwerk-stilte als signaal? Elke data-laag in deze app haalt zijn data
 * via de Supabase JS-client op, die onder de motorkap `fetch` gebruikt. Door
 * `fetch`/XHR centraal te tellen weten we generiek — zonder per-pagina-bedrading
 * — wanneer de initiële data binnen is. Dat dekt alle 100+ pagina's tegelijk.
 *
 * Pagina's kunnen de overlay expliciet sluiten via `window.FFLoader.ready()`
 * (alles klaar) of `.done()` (hard verbergen). Zuiver additief.
 *
 * Volledig additief; één verwijdering van dit script + de CSS + het inline
 * snippet zet alles terug.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var MIN_MS = 150;        // minimale zichttijd → geen spinner-flikker
  var SETTLE_MS = 120;     // hoe lang het netwerk stil moet zijn vóór "klaar"
  var POLL_MS = 50;        // frequentie van de netwerk-stilte-check
  var FALLBACK_MS = 12000; // veiligheidsklep → overlay nooit laten hangen

  var start = Date.now();
  var hidden = false;
  var painted = false;
  var releasing = false;
  var fallbackTimer = null;
  var pollTimer = null;

  function clearTimers() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function doHide() {
    if (hidden) return;
    hidden = true;
    clearTimers();
    try { root.removeAttribute("data-loading"); } catch (e) { /* noop */ }
  }

  // Is alle initiële netwerkactiviteit tot rust gekomen? Wanneer de teller niet
  // beschikbaar is (oud inline snippet / fout) blokkeren we niet — dan valt het
  // terug op "verbergen zodra geschilderd", net als de oude versie.
  function netSettled() {
    try {
      var n = window.__ffNet;
      if (!n) return true;
      if (n.p > 0) return false;
      return (Date.now() - (n.last || n.t0 || start)) >= SETTLE_MS;
    } catch (e) {
      return true;
    }
  }

  function afterPaint(fn) {
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }

  // Alles klaar: respecteer de flicker-floor, schilder de echte inhoud, verberg.
  function ready() {
    if (hidden || releasing) return;
    releasing = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    var elapsed = Date.now() - start;
    var wait = elapsed >= MIN_MS ? 0 : (MIN_MS - elapsed);
    setTimeout(function () { afterPaint(doHide); }, wait);
  }

  function tick() {
    if (hidden || releasing) return;
    if (painted && netSettled()) ready();
  }

  // Begin pas met de netwerk-stilte-check zodra de eerste paint achter de rug is.
  function beginPolling() {
    painted = true;
    tick();
    if (!hidden && !releasing && !pollTimer) {
      pollTimer = setInterval(tick, POLL_MS);
    }
  }

  function armPaintWatch() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        afterPaint(beginPolling);
      }, { once: true });
    } else {
      afterPaint(beginPolling);
    }
  }

  // Opt-in API voor pagina's die de spinner expliciet willen sturen.
  window.FFLoader = {
    // Opnieuw tonen (bijv. bij een client-side navigatie).
    show: function () {
      hidden = false;
      painted = false;
      releasing = false;
      start = Date.now();
      clearTimers();
      try { root.setAttribute("data-loading", "1"); } catch (e) { /* noop */ }
      fallbackTimer = setTimeout(doHide, FALLBACK_MS);
      armPaintWatch();
    },
    // Alles is binnen → netjes wegfaden (respecteert flicker-floor + paint).
    ready: ready,
    hide: ready,
    // Hard verbergen, ongeacht netwerk-stilte.
    done: doHide,
  };

  // Veiligheidsklep meteen aanzetten: ook als de netwerk-stilte nooit intreedt
  // (trage/hangende request) verdwijnt de overlay vanzelf na FALLBACK_MS.
  fallbackTimer = setTimeout(doHide, FALLBACK_MS);

  armPaintWatch();
})();
