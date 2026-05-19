/* theme.js — BESA Suite light/dark theme-switcher.
 *
 * De FOUC-preventie (data-theme zetten vóór eerste paint) gebeurt door een
 * kleine inline <script> in de <head> van elke pagina. Dit bestand voegt
 * alleen de toggle-knop toe in de topbar en handelt het wisselen +
 * onthouden af. Volledig additief; verwijdert/wijzigt geen bestaande
 * inhoud. Eén `git revert` van de commit verwijdert het hele systeem.
 */
(function () {
  "use strict";

  var KEY = "besa-theme";
  var root = document.documentElement;

  function safeGet() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function safeSet(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode e.d. */ }
  }

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }

  // Zorg dat het attribuut sowieso staat (fallback als de inline-snippet ontbreekt).
  (function ensureInitial() {
    var stored = safeGet();
    applyTheme(stored === "dark" ? "dark" : "light");
  })();

  var SVG_MOON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SVG_SUN =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg>';

  function syncButton(btn) {
    var theme = currentTheme();
    // Light actief → toon maan (klik → donker). Dark actief → toon zon.
    if (theme === "dark") {
      btn.innerHTML = SVG_SUN;
      btn.setAttribute("aria-label", "Wissel naar licht thema");
      btn.setAttribute("title", "Wissel naar licht thema");
    } else {
      btn.innerHTML = SVG_MOON;
      btn.setAttribute("aria-label", "Wissel naar donker thema");
      btn.setAttribute("title", "Wissel naar donker thema");
    }
  }

  function createButton() {
    var btn = document.createElement("button");
    btn.id = "besa-theme-toggle";
    btn.type = "button";
    btn.className = "icon-btn";
    syncButton(btn);
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      safeSet(next);
      syncButton(btn);
    });
    return btn;
  }

  function inject() {
    if (document.getElementById("besa-theme-toggle")) return true;
    // Voorkeur: in de bestaande icon-cluster (naast Help/bel), vóór het avatar.
    var host = document.querySelector(".topbar-icons") || document.querySelector(".topbar");
    if (!host) return false;
    host.appendChild(createButton());
    return true;
  }

  function start() {
    if (inject()) return;
    // Topbar kan iets later renderen — kort observeren, dan stoppen.
    var tries = 0;
    var obs = new MutationObserver(function () {
      if (inject() || ++tries > 40) obs.disconnect();
    });
    obs.observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
    setTimeout(function () { try { obs.disconnect(); } catch (e) {} }, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
