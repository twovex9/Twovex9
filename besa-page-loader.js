/* besa-page-loader.js — globale laad-animatie (FOUC-preventie).
 *
 * Achtergrond: dit is een multi-page app. Elke pagina is statische HTML die
 * daarna door JS met data wordt gevuld. Daardoor flitste heel even de rauwe
 * skeleton/lege staat in beeld vóór de juiste inhoud verscheen ("eerst iets
 * anders, dan het juiste"). Dat is klassieke FOUC.
 *
 * Oplossing — zelfde patroon als de thema-FOUC-preventie:
 *   1. Een inline <head>-snippet zet `data-loading="1"` op <html> VÓÓR de
 *      eerste paint. styles.css is render-blocking in de <head>, dus de
 *      overlay-spinner is al actief bij de allereerste paint → de gebruiker
 *      ziet nooit meer de flits, alleen de spinner.
 *   2. Dit bestand haalt het attribuut weg zodra de ECHTE lay-out minstens
 *      één keer geschilderd is (dubbele requestAnimationFrame), met een
 *      minimale zichttijd zodat de spinner niet flikkert op snelle pagina's
 *      en een harde fallback-timeout zodat de overlay NOOIT blijft hangen.
 *
 * Pagina's met zwaar databladen kunnen de overlay langer tonen via
 * `window.FFLoader.show()` / `.hide()` — zuiver additief, niets verplicht.
 *
 * Volledig additief; één verwijdering van dit script + de CSS + het inline
 * snippet zet alles terug.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var MIN_MS = 180;       // minimale zichttijd → geen spinner-flikker
  var FALLBACK_MS = 8000; // veiligheidsklep → overlay nooit laten hangen

  var start = Date.now();
  var hidden = false;
  var fallbackTimer = null;

  function clearFallback() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function doHide() {
    if (hidden) return;
    hidden = true;
    clearFallback();
    try { root.removeAttribute("data-loading"); } catch (e) { /* noop */ }
  }

  function hide() {
    var elapsed = Date.now() - start;
    if (elapsed >= MIN_MS) {
      doHide();
    } else {
      setTimeout(doHide, MIN_MS - elapsed);
    }
  }

  function show() {
    hidden = false;
    start = Date.now();
    clearFallback();
    try { root.setAttribute("data-loading", "1"); } catch (e) { /* noop */ }
    fallbackTimer = setTimeout(doHide, FALLBACK_MS);
  }

  // Veiligheidsklep meteen aanzetten: ook als hide() nooit wordt aangeroepen
  // (bijv. een script-fout op de pagina) verdwijnt de overlay vanzelf.
  fallbackTimer = setTimeout(doHide, FALLBACK_MS);

  // Opt-in API voor pagina's die de spinner langer willen tonen.
  window.FFLoader = { show: show, hide: hide };

  // Verberg zodra de browser de echte lay-out minstens één keer heeft
  // geschilderd. Dubbele rAF garandeert dat de paint achter de rug is.
  function whenPainted() {
    requestAnimationFrame(function () {
      requestAnimationFrame(hide);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", whenPainted, { once: true });
  } else {
    whenPainted();
  }
})();
/* deploy-marker: globale laad-animatie live op productie */
