/* global window, document */
/**
 * permissions-nav-hide.js — verberg topbar/sidebar links waar de huidige
 * user geen permissie voor heeft.
 *
 * Werkt naast permissions-gate.js (die redirect bij directe URL); deze script
 * doet pure UI-opruiming zodat menu-items voor niet-bevoegde rollen niet
 * eens zichtbaar zijn.
 *
 * Admin-tier wint altijd → niets verbergen.
 *
 * Pagina-conventie volgt top-nav-overflow.js: clean URLs zonder `.html` worden
 * automatisch genormaliseerd (`href="hr"` → `hr.html`).
 *
 * Laad NA permissions.js, permissions-page-map.js en permissions-gate.js.
 */
(function (global) {
  "use strict";

  function normalizeFileName(href) {
    var cleaned = String(href || "").split("?")[0].split("#")[0];
    var parts = cleaned.split("/").filter(Boolean);
    var last = (parts[parts.length - 1] || "").toLowerCase();
    if (last && last.indexOf(".") === -1) last += ".html";
    return last;
  }

  function pageAccessible(page, adminTier) {
    if (!page) return true;
    var map = global.BESA_PAGE_PERMISSIONS || {};
    var req = map[page];
    if (req === null || req === undefined) return true;

    // Rol-uitsluiting (deniedRoles): bepaalde rollen mogen deze pagina NIET zien —
    // geldt ook voor admin-tier (Eigenaar/Directeur), dus check vóór de admin-bypass.
    // Bv. persoonlijke werkvloer-tabs (Mijn beschikbaarheid/Mijn facturen) voor bestuur.
    if (Array.isArray(req.deniedRoles)) {
      try {
        var dRoles = (global.besaPermissions && typeof global.besaPermissions.getRoleNames === "function")
          ? global.besaPermissions.getRoleNames()
          : [];
        for (var d = 0; d < req.deniedRoles.length; d++) {
          if (dRoles.indexOf(req.deniedRoles[d]) !== -1) return false;
        }
      } catch (e) { /* bij twijfel niets verbergen */ }
      // Niet uitgesloten én geen verdere allowedRoles/action-eis → open voor de rest.
      if (!Array.isArray(req.allowedRoles) && !req.action) return true;
    }

    // Admin-tier ziet alles — behalve expliciet strict-gemarkeerde pagina's (bv. Financiën).
    if (adminTier && !req.strict) return true;

    if (Array.isArray(req.allowedRoles)) {
      try {
        var roles = (global.besaPermissions && typeof global.besaPermissions.getRoleNames === "function")
          ? global.besaPermissions.getRoleNames()
          : [];
        for (var i = 0; i < req.allowedRoles.length; i++) {
          if (roles.indexOf(req.allowedRoles[i]) !== -1) return true;
        }
        return false;
      } catch (e) { return false; }
    }
    if (req.action) {
      try {
        return (typeof global.besaCan === "function") && global.besaCan(req.action, req.entity);
      } catch (e) { return false; }
    }
    return true;
  }

  function hideEl(el) {
    if (!el) return;
    try { el.style.display = "none"; el.setAttribute("aria-hidden", "true"); } catch (e) {}
  }

  function isHidden(el) {
    return !el || el.style.display === "none";
  }

  function linkOk(a, adminTier) {
    var href = a && a.getAttribute("href");
    if (!href || href === "#") return true;        // geen echte target → laat staan
    return pageAccessible(normalizeFileName(href), adminTier);
  }

  // Onthul de topnav (zet de visibility:hidden uit styles.css uit). Idempotent.
  function reveal() {
    try { global.document.documentElement.classList.add("besa-nav-ready"); } catch (e) {}
  }

  // Zijn de permissies al geladen (uit de localStorage-cache of de DB)? Zo ja,
  // dan kunnen we de nav SYNCHROON — vóór de eerste paint — opschonen, zodat er
  // geen niet-toegekende items flitsen.
  function permsLoaded() {
    try {
      return !!(global.besaPermissions && typeof global.besaPermissions.debug === "function"
        && global.besaPermissions.debug().loaded);
    } catch (e) { return false; }
  }

  // ZZP-self-service-tabs (Mijn facturen / Mijn beschikbaarheid / Mijn uitnodigingen)
  // zijn niet relevant voor loondienst/stagiair: zij worden via het rooster ingepland
  // en voeren geen eigen proforma/beschikbaarheid in. Hun pagina's gate'n al op
  // dienstverband; hier verbergen we ook de top-links. (Video-feedback eigenaar
  // 2026-06-07, loondienst-medewerker-rondleiding.) Onbekend dienstverband (bv. een
  // niet-gekoppeld account) → niets verbergen, niet onterecht blokkeren.
  function isLoondienstLike() {
    try {
      var dv = global.besaCurrentDienstverband
        || (global.besaCurrentProfile && global.besaCurrentProfile.dienstverband) || "";
      return dv === "Loondienst" || dv === "Stagiair";
    } catch (e) { return false; }
  }
  var ZZP_SELF_SERVICE = ["mijn-proforma-facturen.html", "mijn-beschikbaarheid.html", "mijn-uitnodigingen.html"];

  function applyHiding() {
    // Admin-tier ziet alles — behalve strict-gemarkeerde pagina's, die hieronder
    // per link alsnog op rol worden gecontroleerd (zie pageAccessible).
    var adminTier = false;
    try {
      adminTier = (typeof global.besaIsAdminTier === "function" && global.besaIsAdminTier());
    } catch (e) { /* bij twijfel niets verbergen — behoud bestaand gedrag */ return; }

    var doc = global.document;
    if (!doc) return;

    // 1. Top-nav DROPDOWNS: filter de items én de kop integraal.
    //    - Niet-toegankelijke dropdown-items worden uit de DOM verwijderd, zodat
    //      ze ook niet in het "meer"-overflowmenu opduiken (top-nav-overflow.js
    //      bouwt dat menu opnieuw uit de overgebleven .top-dropdown-link's).
    //    - Heeft de rol GEEN enkel item én de kop-pagina ook niet → hele
    //      dropdown weg. Mag de kop-pagina niet maar zijn er wél items → de kop
    //      wijst voortaan naar het eerste toegankelijke item (blijft menu-opener).
    doc.querySelectorAll(".top-nav-item--dropdown").forEach(function (wrap) {
      var kop = wrap.querySelector(".top-link--dropdown");
      var items = wrap.querySelectorAll(".top-dropdown-link[href]");
      var zichtbaar = [];
      items.forEach(function (a) {
        if (linkOk(a, adminTier)) zichtbaar.push(a);
        else { try { a.remove(); } catch (e) { hideEl(a); } }
      });
      var kopOk = linkOk(kop, adminTier);
      if (zichtbaar.length === 0 && !kopOk) {
        hideEl(wrap);
      } else if (kop && !kopOk && zichtbaar.length > 0) {
        var firstHref = zichtbaar[0].getAttribute("href");
        if (firstHref) kop.setAttribute("href", firstHref);
      }
    });

    // 2. Losse top-links (directe kinderen van .top-nav, geen dropdown-kop).
    doc.querySelectorAll(".top-nav > .top-link[href]:not(.top-link--dropdown)").forEach(function (a) {
      if (!linkOk(a, adminTier)) hideEl(a);
    });

    // 3. Verberg sidebar links (`.side-link[href]`) waar de target niet toegankelijk is
    var sideLinks = doc.querySelectorAll(".side-link[href], .side-link--sub[href], .side-link--nested[href]");
    sideLinks.forEach(function (a) {
      if (!linkOk(a, adminTier)) hideEl(a);
    });

    // 4. Sidebar collapsibles — als alle nested links verborgen zijn, verberg de toggle
    var toggles = doc.querySelectorAll(".side-group__toggle, .side-link.side-link--sub[aria-controls]");
    toggles.forEach(function (btn) {
      var subId = btn.getAttribute("aria-controls");
      if (!subId) return;
      var sub = doc.getElementById(subId);
      if (!sub) return;
      var nested = sub.querySelectorAll("a[href]");
      if (nested.length === 0) return;
      var anyVisible = false;
      for (var i = 0; i < nested.length; i++) {
        if (!isHidden(nested[i])) { anyVisible = true; break; }
      }
      if (!anyVisible) {
        hideEl(btn);
        hideEl(sub);
      }
    });

    // 4b. Dienstverband-afscherming: verberg de ZZP-self-service top-links voor
    //     loondienst/stagiair (los van rol/permissie — een loondienst-Medewerker en
    //     een ingehuurde ZZP'er delen dezelfde rol, maar alleen de ZZP'er heeft deze
    //     tabs nodig). Geldt ook voor admin-tier-loondienst: zij hebben evenmin eigen
    //     proforma's/beschikbaarheid. Bestuur is daarnaast al via deniedRoles geweerd.
    if (isLoondienstLike()) {
      doc.querySelectorAll(".top-nav > .top-link[href]").forEach(function (a) {
        if (ZZP_SELF_SERVICE.indexOf(normalizeFileName(a.getAttribute("href"))) !== -1) hideEl(a);
      });
      doc.querySelectorAll(".side-link[href], .side-link--sub[href], .side-link--nested[href]").forEach(function (a) {
        if (ZZP_SELF_SERVICE.indexOf(normalizeFileName(a.getAttribute("href"))) !== -1) hideEl(a);
      });
    }

    // 5. Top-nav overflow opnieuw laten meten (links/dropdowns zijn gewijzigd).
    //    top-nav-overflow.js luistert op resize + ResizeObserver; een resize-tik
    //    laat het z'n "meer"-menu herbouwen uit de overgebleven items.
    try {
      if (typeof global.recomputeTopNavOverflow === "function") global.recomputeTopNavOverflow();
      else global.dispatchEvent(new Event("resize"));
    } catch (e) {}
  }

  function run() {
    // 1) Warme cache: pas de afscherming DIRECT (synchroon) toe vóór de eerste
    //    paint en onthul de nav. Geen `await` → geen flits van extra items.
    //    (besaCurrentDienstverband staat na de eerste bootstrap óók in de cache,
    //    dus ook de dienstverband-afscherming is hier al meegenomen.)
    if (permsLoaded()) { applyHiding(); reveal(); }
    // 2) Na de DB-load opnieuw toepassen (bij koude cache wordt hier voor het eerst
    //    afgeschermd + onthuld). We wachten óók op profilesDB.ready zodat het
    //    dienstverband bekend is vóór de eerste reveal → geen flits van de
    //    ZZP-self-service-tabs bij een koude cache.
    try {
      var navReady = (global.besaPermissionsReady && typeof global.besaPermissionsReady.then === "function")
        ? global.besaPermissionsReady : global.Promise.resolve();
      var profReady = (global.profilesDB && global.profilesDB.ready && typeof global.profilesDB.ready.then === "function")
        ? global.profilesDB.ready : global.Promise.resolve();
      global.Promise.all([navReady, profReady]).then(function () { applyHiding(); reveal(); });
    } catch (e) { reveal(); }
    // 2b) Dienstverband kan ná de eerste afscherming binnenkomen (koude cache); pas
    //     dan opnieuw toe zodat de ZZP-tabs alsnog verdwijnen voor loondienst.
    try { global.addEventListener("besa:profile-updated", function () { applyHiding(); }); } catch (e) {}
    // 3) Fail-safe: onthul sowieso na korte tijd, zodat een eventuele scriptfout
    //    de topnav nooit permanent verborgen laat.
    try { global.setTimeout(reveal, 3000); } catch (e) {}
  }

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})(typeof window !== "undefined" ? window : this);
