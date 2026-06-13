/* besa-lazy-libs.js — laadt zware export-bibliotheken (SheetJS/XLSX, jsPDF +
 * autotable) NIET render-blokkerend, maar tijdens browser-idle ná de eerste
 * paint. Pagina's declareren welke libs ze nodig hebben via een data-attribuut:
 *
 *   <script src="besa-lazy-libs.js" data-libs="xlsx20" defer></script>
 *   <script src="besa-lazy-libs.js" data-libs="jspdf,xlsx18" defer></script>
 *
 * Achtergrond: deze libs (xlsx ~290 KB) werden voorheen via een gewone
 * <script src>-tag geladen — soms render-blokkerend (de sheetjs-tags zonder
 * defer), altijd meeladend op het kritieke pad. Ze worden echter uitsluitend
 * gebruikt in export-functies achter een knop. Door ze pas op idle te laden
 * wordt de pagina sneller interactief; tegen de tijd dat een mens op "Export"
 * klikt, zijn ze al binnen.
 *
 * Elke export-functie heeft bovendien al een `typeof XLSX === "undefined"` /
 * `jspdf`-guard die het zeldzame "klik vóór idle-load klaar"-geval netjes
 * afvangt ("Vernieuw de pagina") — exact hetzelfde gedrag als wanneer de CDN
 * traag was. GEEN ENKELE export-functie is gewijzigd; dit is puur een
 * laad-strategie-wijziging.
 *
 * Exposeert window.besaLazyLibs.ensure(token) → Promise voor eventueel
 * toekomstig on-demand gebruik; dedupliceert reeds geladen libs.
 */
(function (global) {
  "use strict";

  // Exact dezelfde CDN-URL's/versies als de oude <script>-tags, zodat het
  // export-gedrag identiek blijft.
  var REGISTRY = {
    xlsx20: ["https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"],
    xlsx18: ["https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js"],
    jspdf: [
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js",
    ],
  };

  var scriptPromises = {}; // url   -> Promise
  var tokenPromises = {};  // token -> Promise

  function loadScript(url) {
    if (scriptPromises[url]) return scriptPromises[url];
    var existing = document.querySelector('script[data-besa-lazy="' + url + '"]');
    if (existing && existing.getAttribute("data-loaded") === "1") {
      scriptPromises[url] = Promise.resolve();
      return scriptPromises[url];
    }
    scriptPromises[url] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.setAttribute("data-besa-lazy", url);
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = function () { reject(new Error("Kon lib niet laden: " + url)); };
      document.head.appendChild(s);
    });
    return scriptPromises[url];
  }

  function ensure(token) {
    if (tokenPromises[token]) return tokenPromises[token];
    var urls = REGISTRY[token];
    if (!urls) {
      tokenPromises[token] = Promise.reject(new Error("Onbekende lib-token: " + token));
      return tokenPromises[token];
    }
    // Sequentieel laden — jspdf MOET vóór de autotable-plugin geladen zijn.
    var p = Promise.resolve();
    urls.forEach(function (u) { p = p.then(function () { return loadScript(u); }); });
    tokenPromises[token] = p;
    return p;
  }

  global.besaLazyLibs = { ensure: ensure };

  // Welke libs heeft deze pagina nodig? (data-libs op de eigen script-tag.)
  var selfTag = document.currentScript
    || document.querySelector('script[data-libs][src*="besa-lazy-libs"]');
  var tokens = [];
  if (selfTag && selfTag.getAttribute("data-libs")) {
    tokens = selfTag.getAttribute("data-libs").split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }

  function preload() {
    tokens.forEach(function (t) {
      ensure(t).catch(function () { /* stil: de guards in de export-functies vangen dit af */ });
    });
  }

  // Op idle ná de 'load'-event: niet concurreren met kritieke resources.
  function schedulePreload() {
    if (global.requestIdleCallback) {
      global.requestIdleCallback(preload, { timeout: 3000 });
    } else {
      global.setTimeout(preload, 1200);
    }
  }

  if (!tokens.length) {
    // Niets te preloaden; ensure() blijft beschikbaar voor on-demand gebruik.
    return;
  }
  if (document.readyState === "complete") {
    schedulePreload();
  } else {
    global.addEventListener("load", schedulePreload, { once: true });
  }
})(typeof window !== "undefined" ? window : this);
