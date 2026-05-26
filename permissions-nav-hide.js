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

  function pageAccessible(page) {
    if (!page) return true;
    var map = global.BESA_PAGE_PERMISSIONS || {};
    var req = map[page];
    if (req === null || req === undefined) return true;

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

  async function run() {
    try {
      if (global.besaPermissionsReady && typeof global.besaPermissionsReady.then === "function") {
        await global.besaPermissionsReady;
      }
    } catch (e) { /* doorgaan */ }

    // Admin-tier ziet alles
    try {
      if (typeof global.besaIsAdminTier === "function" && global.besaIsAdminTier()) return;
    } catch (e) { /* doorgaan zonder hide bij twijfel */ return; }

    var doc = global.document;
    if (!doc) return;

    // 1. Verberg topbar `.top-link[href]` waar de target-pagina niet toegankelijk is
    var topLinks = doc.querySelectorAll(".top-link[href]");
    topLinks.forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var page = normalizeFileName(href);
      if (!pageAccessible(page)) hideEl(a);
    });

    // 2. Verberg sidebar links (`.side-link[href]`) waar de target niet toegankelijk is
    var sideLinks = doc.querySelectorAll(".side-link[href], .side-link--sub[href], .side-link--nested[href]");
    sideLinks.forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var page = normalizeFileName(href);
      if (!pageAccessible(page)) hideEl(a);
    });

    // 3. Sidebar collapsibles — als alle nested links verborgen zijn, verberg de toggle
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

    // 4. Top-nav overflow herberekenen (als top-nav-overflow.js dat exposed)
    try {
      if (typeof global.recomputeTopNavOverflow === "function") global.recomputeTopNavOverflow();
    } catch (e) {}
  }

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})(typeof window !== "undefined" ? window : this);
