/* global window */
/**
 * permissions-gate.js — pagina-gate per rol/permissie.
 *
 * Werkt op basis van `window.BESA_PAGE_PERMISSIONS` (uit permissions-page-map.js)
 * en `window.besaCan` / `window.besaPermissions` (uit permissions.js).
 *
 * Flow:
 *   1. Skip op login.html en als geen pathname (root).
 *   2. Wacht op `besaPermissionsReady` zodat rol/permissies geladen zijn.
 *   3. Lookup de pagina in de map. Geen entry of `null` → toegang OK.
 *   4. Admin-tier wint altijd.
 *   5. `{allowedRoles}` → controleer rol-namen.
 *      `{action, entity}` → `besaCan(action, entity)`.
 *   6. Geen toegang → `sessionStorage`-flash + `location.replace('home.html')`.
 *
 * Laad NA permissions.js en permissions-page-map.js, vóór page-script.
 */
(function (global) {
  "use strict";

  function currentPageName() {
    try {
      var path = (global.location && global.location.pathname) || "";
      if (!path) return "";
      var parts = path.split("/").filter(Boolean);
      if (parts.length === 0) return "home.html";
      var last = parts[parts.length - 1].toLowerCase();
      // Strip query/hash (location.pathname doet dat al, maar voor zekerheid):
      var qIdx = last.indexOf("?");
      if (qIdx !== -1) last = last.substring(0, qIdx);
      var hIdx = last.indexOf("#");
      if (hIdx !== -1) last = last.substring(0, hIdx);
      // Vercel clean URLs (/audit i.p.v. /audit.html) — voeg .html toe
      // zodat de lookup in BESA_PAGE_PERMISSIONS werkt.
      if (last && last.indexOf(".") === -1) last += ".html";
      return last;
    } catch (e) {
      return "";
    }
  }

  function setFlash(msg) {
    try {
      global.sessionStorage && global.sessionStorage.setItem("besa-flash", msg);
    } catch (e) { /* ok */ }
  }

  async function run() {
    var page = currentPageName();
    if (!page) return;                        // root / onbekend → laat door
    if (page === "login.html") return;        // login mag nooit redirecten

    // Wacht op auth + permissions
    try {
      if (global.besaSupabaseReady && typeof global.besaSupabaseReady.then === "function") {
        await global.besaSupabaseReady;
      }
    } catch (e) { /* doorgaan; permissions.js handelt eigen exceptie */ }
    try {
      if (global.besaPermissionsReady && typeof global.besaPermissionsReady.then === "function") {
        await global.besaPermissionsReady;
      }
    } catch (e) { /* doorgaan */ }

    // auth-guard.js doet de login-redirect bij geen sessie. Wij gaten alleen
    // op rol/permissie. Als er geen rollen geladen zijn en de pagina is gevoelig,
    // dan blokkeren we tenzij admin.

    var map = global.BESA_PAGE_PERMISSIONS || {};
    var req = map[page];
    if (req === null) return;                 // expliciet open
    if (req === undefined) return;            // niet-gemapt → default open

    // Admin-tier wint altijd — BEHALVE bij strict-gemarkeerde pagina's (bv. Financiën),
    // waar uitsluitend de opgegeven allowedRoles tellen (geen admin-bypass).
    try {
      if (!req.strict && typeof global.besaIsAdminTier === "function" && global.besaIsAdminTier()) return;
    } catch (e) { /* doorgaan met normale check */ }

    var allowed = false;

    // Mode A: allowedRoles
    if (Array.isArray(req.allowedRoles)) {
      try {
        var roles = (global.besaPermissions && typeof global.besaPermissions.getRoleNames === "function")
          ? global.besaPermissions.getRoleNames()
          : [];
        for (var i = 0; i < req.allowedRoles.length; i++) {
          if (roles.indexOf(req.allowedRoles[i]) !== -1) { allowed = true; break; }
        }
      } catch (e) { allowed = false; }
    }
    // Mode B: besaCan(action, entity)
    else if (req.action && (req.entity || req.action)) {
      try {
        allowed = (typeof global.besaCan === "function") && global.besaCan(req.action, req.entity);
      } catch (e) { allowed = false; }
    }

    if (!allowed) {
      var label = (req.allowedRoles && req.allowedRoles.length)
        ? ("rollen: " + req.allowedRoles.join(", "))
        : ("permissie: " + req.action + (req.entity ? ("-" + req.entity) : ""));
      setFlash("Geen toegang tot " + page + " (vereist " + label + ").");
      try {
        global.location.replace("home.html");
      } catch (e) {
        global.location.href = "home.html";
      }
    }
  }

  // Start zodra het script geladen is — de Promises binnen run() wachten zelf.
  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})(typeof window !== "undefined" ? window : this);
