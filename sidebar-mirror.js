/* global window, document */
/**
 * sidebar-mirror.js — zorgt dat de linker zijbalk ALLE onderwerpen bevat die
 * in het bijbehorende top-nav uitklapmenu (hover) van de actieve sectie staan.
 *
 * Achtergrond: elke pagina heeft een hardgecodeerde, met de hand samengestelde
 * sectie-zijbalk. Die bleek vaak een SUBSET van het hover-menu bovenaan: items
 * die je ziet als je over een onderwerp hovert, ontbraken in de linkerbalk als
 * je erop klikt. Deze module vult de zijbalk aan zodat hover-menu en zijbalk
 * dezelfde onderwerpen tonen.
 *
 * Gedrag (bewust):
 *  - PUUR ADDITIEF. Bestaande zijbalk-items worden nooit verwijderd, verplaatst
 *    of hernoemd. We voegen alleen ontbrekende onderwerpen toe (onderaan de
 *    sectie-nav). Zo blijven de zorgvuldig samengestelde modulemenu's intact.
 *  - Alleen op ECHTE modulenav-zijbalken. Een <aside class="sidebar"> die in
 *    werkelijkheid in-pagina-ankers (href="#...") of tabs (data-tab) bevat
 *    (bv. dashboards, planning-beheer, planning-filterpaneel) wordt overgeslagen:
 *    we raken alleen een zijbalk aan die minstens één paginalink deelt met het
 *    actieve uitklapmenu.
 *  - Permissie-bewust: een onderwerp dat de huidige rol niet mag zien wordt niet
 *    toegevoegd. De toegangscheck spiegelt permissions-nav-hide.js (zelfde
 *    BESA_PAGE_PERMISSIONS / besaCan / admin-tier-logica), zodat de zijbalk
 *    consistent is met het (eveneens afgeschermde) hover-menu.
 *  - Idempotent + zoom-veilig: kan meermaals draaien (na perm-load, na
 *    profiel-update) zonder dubbele items.
 *
 * Laad NA permissions.js, permissions-page-map.js en permissions-nav-hide.js
 * (defer), zodat de helper-globals en de hover-menu-pruning beschikbaar zijn.
 */
(function (global) {
  "use strict";

  var doc = global.document;
  if (!doc) return;

  var MARK = "data-sidebar-mirror"; // markeert door ons toegevoegde links

  function normalizeFileName(href) {
    var raw = String(href || "");
    if (!raw || raw.charAt(0) === "#") return ""; // in-pagina anker → geen paginalink
    var cleaned = raw.split("?")[0].split("#")[0];
    var parts = cleaned.split("/").filter(Boolean);
    var last = (parts[parts.length - 1] || "").toLowerCase();
    if (last && last.indexOf(".") === -1) last += ".html";
    return last;
  }

  function currentPage() {
    try {
      var parts = String(global.location.pathname || "").split("/").filter(Boolean);
      var last = (parts[parts.length - 1] || "").toLowerCase();
      if (!last) return "";
      if (last.indexOf(".") === -1) last += ".html";
      return last;
    } catch (e) { return ""; }
  }

  function roleNames() {
    try {
      if (global.besaPermissions && typeof global.besaPermissions.getRoleNames === "function") {
        return global.besaPermissions.getRoleNames() || [];
      }
    } catch (e) {}
    return [];
  }

  function adminTier() {
    try {
      return !!(typeof global.besaIsAdminTier === "function" && global.besaIsAdminTier());
    } catch (e) { return false; }
  }

  // Spiegelt permissions-nav-hide.js pageAccessible(): bepaalt of de huidige rol
  // deze pagina mag zien. Bij twijfel/onbekend → true (zichtbaar laten), exact
  // zoals de afscherming dat doet.
  function pageAccessible(page) {
    if (!page) return true;
    var map = global.BESA_PAGE_PERMISSIONS || {};
    var req = map[page];
    if (req === null || req === undefined) return true;

    if (Array.isArray(req.deniedRoles)) {
      var dRoles = roleNames();
      for (var d = 0; d < req.deniedRoles.length; d++) {
        if (dRoles.indexOf(req.deniedRoles[d]) !== -1) return false;
      }
      if (!Array.isArray(req.allowedRoles) && !req.action) return true;
    }

    if (adminTier() && !req.strict) return true;

    if (Array.isArray(req.allowedRoles)) {
      var roles = roleNames();
      for (var i = 0; i < req.allowedRoles.length; i++) {
        if (roles.indexOf(req.allowedRoles[i]) !== -1) return true;
      }
      return false;
    }
    if (req.action) {
      try {
        return (typeof global.besaCan === "function") && global.besaCan(req.action, req.entity);
      } catch (e) { return false; }
    }
    return true;
  }

  // Permissies geladen? (zelfde signaal als permissions-nav-hide.js.) Voordat ze
  // geladen zijn geeft pageAccessible voor strikte pagina's mogelijk een verkeerd
  // antwoord; we draaien onze definitieve pass daarom ná besaPermissionsReady.
  function permsLoaded() {
    try {
      return !!(global.besaPermissions && typeof global.besaPermissions.debug === "function"
        && global.besaPermissions.debug().loaded);
    } catch (e) { return false; }
  }

  // Label voor een uitklapmenu-link: bij "stacked" items (titel + subtitel) enkel
  // de titel; anders de zichtbare tekst.
  function dropdownLabel(a) {
    var titleEl = a.querySelector(".top-dropdown-title");
    var txt = (titleEl ? titleEl.textContent : a.textContent) || "";
    return txt.replace(/\s+/g, " ").trim();
  }

  // Het actieve uitklapmenu = de dropdown-kop met .is-active.
  function activeDropdownLinks() {
    var kop = doc.querySelector(".top-nav-item--dropdown .top-link--dropdown.is-active");
    var wrap = kop && kop.closest(".top-nav-item--dropdown");
    if (!wrap) return [];
    var out = [];
    wrap.querySelectorAll(".top-dropdown-link[href]").forEach(function (a) {
      var page = normalizeFileName(a.getAttribute("href"));
      if (!page) return;
      out.push({ page: page, label: dropdownLabel(a) });
    });
    return out;
  }

  // Vind de modulenav-zijbalk: een <aside …sidebar…> waarvan de paginalinks
  // (geen #-ankers) minstens één overlap hebben met het actieve uitklapmenu.
  // Tab-zijbalken (data-tab) en anker-/filterzijbalken vallen zo automatisch af.
  function findModuleSidebar(ddPages) {
    var asides = doc.querySelectorAll('aside[class*="sidebar"]');
    for (var i = 0; i < asides.length; i++) {
      var aside = asides[i];
      var links = aside.querySelectorAll(".side-link[href]");
      if (!links.length) continue;
      var hasTab = false, overlap = false, container = null;
      for (var j = 0; j < links.length; j++) {
        var a = links[j];
        if (a.hasAttribute("data-tab")) { hasTab = true; break; }
        var page = normalizeFileName(a.getAttribute("href"));
        if (page && ddPages.indexOf(page) !== -1) {
          overlap = true;
          // container = directe ouder-nav waarin de top-level links zitten
          if (!container) container = a.closest(".side-nav") || a.parentElement;
        }
      }
      if (hasTab || !overlap) continue;
      if (!container) container = aside.querySelector(".side-nav") || aside;
      return { aside: aside, container: container };
    }
    return null;
  }

  function existingSidebarPages(aside) {
    var set = {};
    aside.querySelectorAll(".side-link[href]").forEach(function (a) {
      var p = normalizeFileName(a.getAttribute("href"));
      if (p) set[p] = true;
    });
    return set;
  }

  // Label van de actieve dropdown-kop (bv. "Organisatie") voor de aria-label.
  function activeSectionLabel() {
    var kop = doc.querySelector(".top-nav-item--dropdown .top-link--dropdown.is-active");
    if (!kop) return "Sectie";
    return (kop.textContent || "Sectie").replace(/\s+/g, " ").trim();
  }

  // Sommige pagina's hebben wél de standaard 2-koloms app-shell-grid (met een
  // gereserveerde sidebar-kolom) maar GEEN zijbalk-element — de linkerkolom is
  // dan een lege strook (bv. Organisatie: teams/rollen/gebruikers). Daar maken we
  // een echte modulenav-zijbalk aan die de lege plek vult. We doen dit alleen als
  // de sidebar-plek écht leeg is (geen enkele <aside> in de app-shell), zodat we
  // nooit een full-width/aangepaste layout (planning, dashboards) verstoren.
  function createSidebarIfSlotEmpty() {
    var appShell = doc.querySelector(".app-shell");
    if (!appShell) return null;
    if (appShell.querySelector("aside")) return null; // plek al bezet
    var main = appShell.querySelector("main.content") || appShell.querySelector(".content");
    if (!main || main.parentElement !== appShell) return null; // onbekende layout → niet ingrijpen

    var aside = doc.createElement("aside");
    aside.className = "sidebar";
    aside.setAttribute("data-sidebar-mirror-created", "1");
    aside.setAttribute("aria-label", activeSectionLabel());
    var nav = doc.createElement("nav");
    nav.className = "side-nav";
    aside.appendChild(nav);
    appShell.insertBefore(aside, main);

    // Inklap-knop + uitklap-handle toevoegen (anders mist deze zijbalk de toggle
    // en is hij bij een ingeklapte voorkeur onbereikbaar).
    try {
      if (typeof global.besaInitSidebarCollapse === "function") global.besaInitSidebarCollapse();
    } catch (e) {}

    return { aside: aside, container: nav };
  }

  function shouldAdd(item, present, permsReady) {
    if (present[item.page]) return false;        // staat al in de zijbalk
    // Alleen toevoegen wat de huidige rol mag zien. Vóór perm-load slaan we
    // strikte/afgeschermde pagina's over en vullen ze in de latere pass aan
    // (geen flits van niet-toegestane items).
    if (permsReady && !pageAccessible(item.page)) return false;
    if (!permsReady) {
      var map = global.BESA_PAGE_PERMISSIONS || {};
      if (map[item.page]) return false; // gegate pagina → wachten tot perms geladen
    }
    return true;
  }

  function appendLink(container, item, present, curPage) {
    var a = doc.createElement("a");
    a.setAttribute("href", item.page.replace(/\.html$/, "")); // clean URL, zoals de rest
    a.className = "side-link";
    a.setAttribute(MARK, "1");
    a.textContent = item.label || item.page.replace(/\.html$/, "");
    if (item.page === curPage) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
    present[item.page] = true;
    container.appendChild(a);
  }

  function sync() {
    var dd = activeDropdownLinks();
    if (!dd.length) return;
    var ddPages = dd.map(function (d) { return d.page; });
    var curPage = currentPage();
    var permsReady = permsLoaded();

    var found = findModuleSidebar(ddPages);

    if (!found) {
      // Geen bestaande modulenav-zijbalk. Bepaal eerst of er iets toe te voegen is
      // (zo nee, géén lege zijbalk aanmaken). Dan de lege sidebar-plek vullen.
      var present0 = {};
      var toAdd = dd.filter(function (it) { return shouldAdd(it, present0, permsReady); });
      if (!toAdd.length) return;
      var created = createSidebarIfSlotEmpty();
      if (!created) return;
      var present = {};
      toAdd.forEach(function (it) { appendLink(created.container, it, present, curPage); });
      return toAdd.length;
    }

    var presentE = existingSidebarPages(found.aside);
    var appended = 0;
    dd.forEach(function (item) {
      if (!shouldAdd(item, presentE, permsReady)) return;
      appendLink(found.container, item, presentE, curPage);
      appended++;
    });
    return appended;
  }

  function run() {
    // 1) Warme cache / vroege pass: voeg direct toe wat zonder permissie-check al
    //    mag (ongegate pagina's), zodat de zijbalk meteen compleet oogt.
    try { sync(); } catch (e) {}

    // 2) Definitieve pass ná permissie- + profiel-load: nu kunnen we ook de
    //    gegate onderwerpen permissie-correct toevoegen.
    try {
      var navReady = (global.besaPermissionsReady && typeof global.besaPermissionsReady.then === "function")
        ? global.besaPermissionsReady : global.Promise.resolve();
      var profReady = (global.profilesDB && global.profilesDB.ready && typeof global.profilesDB.ready.then === "function")
        ? global.profilesDB.ready : global.Promise.resolve();
      global.Promise.all([navReady, profReady]).then(function () { try { sync(); } catch (e) {} });
    } catch (e) {}

    // 3) Dienstverband/rol kan ná de eerste pass binnenkomen (koude cache).
    try { global.addEventListener("besa:profile-updated", function () { try { sync(); } catch (e) {} }); } catch (e) {}
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})(typeof window !== "undefined" ? window : this);
