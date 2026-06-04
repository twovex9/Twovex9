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

  async function run() {
    try {
      if (global.besaPermissionsReady && typeof global.besaPermissionsReady.then === "function") {
        await global.besaPermissionsReady;
      }
    } catch (e) { /* doorgaan */ }

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

    // 5. Top-nav overflow opnieuw laten meten (links/dropdowns zijn gewijzigd).
    //    top-nav-overflow.js luistert op resize + ResizeObserver; een resize-tik
    //    laat het z'n "meer"-menu herbouwen uit de overgebleven items.
    try {
      if (typeof global.recomputeTopNavOverflow === "function") global.recomputeTopNavOverflow();
      else global.dispatchEvent(new Event("resize"));
    } catch (e) {}
  }

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})(typeof window !== "undefined" ? window : this);
