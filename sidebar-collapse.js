/* sidebar-collapse.js — inklapbare sectie-zijbalk.
 * Standaard UITGEKLAPT. Keuze onthouden in localStorage (ff-sidebar:
 * expanded|collapsed). FOUC-preventie: een kleine inline-snippet in de
 * <head> zet data-sidebar vóór de eerste paint (zie codemod). Dit bestand
 * injecteert de inklap-pijl (alleen op pagina's MET .sidebar — dus niet
 * op home/login) + een vaste uitklap-handle, en handelt het toggelen af.
 * Volledig additief; verwijdert/wijzigt geen bestaande inhoud.
 */
(function () {
  "use strict";

  var KEY = "ff-sidebar";
  var root = document.documentElement;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* */ } }
  function apply(state) {
    root.setAttribute("data-sidebar", state === "collapsed" ? "collapsed" : "expanded");
  }

  // Fallback (mocht de inline head-snippet ontbreken): standaard uitgeklapt.
  apply(get() === "collapsed" ? "collapsed" : "expanded");

  var SVG_LEFT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  var SVG_RIGHT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  function init() {
    var sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;                          // home/login: geen toggle
    if (document.getElementById("ff-sidebar-collapse")) return;

    var btn = document.createElement("button");
    btn.id = "ff-sidebar-collapse";
    btn.type = "button";
    btn.className = "sidebar-collapse-btn";
    btn.setAttribute("aria-label", "Zijbalk inklappen");
    btn.setAttribute("title", "Zijbalk inklappen");
    btn.innerHTML = SVG_LEFT + "<span>Inklappen</span>";
    sidebar.insertBefore(btn, sidebar.firstChild);

    var handle = document.createElement("button");
    handle.id = "ff-sidebar-expand";
    handle.type = "button";
    handle.className = "sidebar-expand-handle";
    handle.setAttribute("aria-label", "Zijbalk uitklappen");
    handle.setAttribute("title", "Zijbalk uitklappen");
    handle.innerHTML = SVG_RIGHT;
    document.body.appendChild(handle);

    btn.addEventListener("click", function () { apply("collapsed"); set("collapsed"); });
    handle.addEventListener("click", function () { apply("expanded"); set("expanded"); });
  }

  // Herbruikbaar maken: sidebar-mirror.js injecteert op sommige pagina's pas ná
  // DOMContentLoaded een .sidebar in de (lege) sidebar-kolom. Die moet dan alsnog
  // de inklap-knop + uitklap-handle krijgen. init() is idempotent (checkt op een
  // bestaande knop), dus een tweede aanroep is veilig.
  window.ffInitSidebarCollapse = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
