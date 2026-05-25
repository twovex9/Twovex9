/* global window */
/**
 * permissions.js — DB-bron variant (herzien 2026-05-25)
 *
 * Permissies komen uit Supabase, niet uit een hardcoded matrix:
 *   - `public.bs2_role_users` (M2M user_email ↔ role_id) → welke rollen heeft current user
 *   - `public.bs2_role_permissions` (role_id → permission_slug) → unie van permissies
 *
 * Conventie:
 *   - Rol-identifier = `bs2_roles.name` (bv. "Eigenaar", "Planner", "HR")
 *   - Permissie-slug = `bs2_permissions.slug` (bv. "view-employees", "manage-clients")
 *
 * Multi-rol = unie van rechten (user-keuze 2026-05-25):
 *   iemand met [Beleid, Facilitair, Planner] krijgt ALLE permissies van die drie rollen.
 *
 * Admin-tier (Eigenaar/Admin/Directeur) wint altijd in besaCan.
 *
 * Gebruik:
 *   await window.besaPermissionsReady;          // wacht tot DB-load klaar is
 *   if (besaCan("view", "employees")) { ... }   // → checkt slug "view-employees"
 *   if (besaIsAdminTier()) { ... }
 *
 * Geen eager bootstrap-race (les 2026-05-19, PR #293): wacht eerst op
 * `besaSupabaseReady` voordat we de DB benaderen. Falende reads gaan via
 * console.warn — NIET via besaReportSyncFailure (anders auth-logout-cascade).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "besa-permissions-v2";
  var TTL_MS = 60 * 60 * 1000; // 1 uur cache
  var ADMIN_TIER_NAMES = ["Eigenaar", "Admin", "Directeur"];

  var state = {
    email: null,
    roleNames: [],              // bv. ["Beleid", "Planner"]
    permissionSlugs: new Set(), // bv. {"view-employees", "manage-clients"}
    loaded: false,
    fetchedAt: 0,
  };

  function readCache() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if ((Date.now() - (obj.fetchedAt || 0)) > TTL_MS) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function writeCache(obj) {
    try {
      global.localStorage && global.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) { /* quota / disabled — geen probleem */ }
  }

  function clearCache() {
    try { global.localStorage && global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function applyCache(obj) {
    state.email = obj.email || null;
    state.roleNames = Array.isArray(obj.roleNames) ? obj.roleNames.slice() : [];
    state.permissionSlugs = new Set(Array.isArray(obj.permissionSlugs) ? obj.permissionSlugs : []);
    state.fetchedAt = obj.fetchedAt || Date.now();
    state.loaded = true;
  }

  async function waitForClient() {
    try {
      if (global.besaSupabaseReady && typeof global.besaSupabaseReady.then === "function") {
        await global.besaSupabaseReady;
      }
    } catch (e) { /* doorgaan; supabase kan tóch werken */ }
    return global.besaSupabase || null;
  }

  async function loadFromDb() {
    var supabase = await waitForClient();
    if (!supabase) {
      console.warn("[permissions] geen supabase client — load skip");
      return false;
    }

    var userResp;
    try {
      userResp = await supabase.auth.getUser();
    } catch (e) {
      console.warn("[permissions] auth.getUser fout:", e && e.message);
      return false;
    }
    var user = userResp && userResp.data && userResp.data.user;
    if (!user || !user.email) {
      // niemand ingelogd — leeg, klaar
      state.email = null;
      state.roleNames = [];
      state.permissionSlugs = new Set();
      state.fetchedAt = Date.now();
      state.loaded = true;
      clearCache();
      return true;
    }
    var emailKey = String(user.email).toLowerCase();

    // 1) Alle rol-toewijzingen voor deze user (M2M op email)
    var rolesQ;
    try {
      rolesQ = await supabase
        .from("bs2_role_users")
        .select("role_id, bs2_roles!inner(slug, name)")
        .ilike("user_email", emailKey);
    } catch (e) {
      console.warn("[permissions] bs2_role_users exception:", e && e.message);
      return false;
    }
    if (rolesQ && rolesQ.error) {
      console.warn("[permissions] bs2_role_users fetch:", rolesQ.error.message);
      return false;
    }
    var rows = (rolesQ && rolesQ.data) || [];

    var roleNames = [];
    var roleIds = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var meta = r && r.bs2_roles;
      if (meta && meta.name && roleNames.indexOf(meta.name) === -1) {
        roleNames.push(meta.name);
      }
      if (r && r.role_id) roleIds.push(r.role_id);
    }

    // 2) Unie van permissie-slugs over alle rollen
    var permSlugs = new Set();
    if (roleIds.length > 0) {
      var permsQ;
      try {
        permsQ = await supabase
          .from("bs2_role_permissions")
          .select("permission_slug")
          .in("role_id", roleIds);
      } catch (e) {
        console.warn("[permissions] bs2_role_permissions exception:", e && e.message);
        return false;
      }
      if (permsQ && permsQ.error) {
        console.warn("[permissions] bs2_role_permissions fetch:", permsQ.error.message);
        return false;
      }
      var permRows = (permsQ && permsQ.data) || [];
      for (var j = 0; j < permRows.length; j++) {
        var slug = permRows[j] && permRows[j].permission_slug;
        if (slug) permSlugs.add(slug);
      }
    }

    state.email = emailKey;
    state.roleNames = roleNames;
    state.permissionSlugs = permSlugs;
    state.fetchedAt = Date.now();
    state.loaded = true;

    writeCache({
      email: emailKey,
      roleNames: roleNames,
      permissionSlugs: Array.from(permSlugs),
      fetchedAt: state.fetchedAt,
    });
    return true;
  }

  function besaIsAdminTier() {
    if (!state.loaded) return false;
    for (var i = 0; i < ADMIN_TIER_NAMES.length; i++) {
      if (state.roleNames.indexOf(ADMIN_TIER_NAMES[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * Check of huidige user een BS2-permissie heeft.
   *
   * Slug-conventie: `<action>-<entity>` (zoals BS2's bs2_permissions.slug).
   *   besaCan("view", "employees")  →  permissionSlugs.has("view-employees")
   *   besaCan("manage-clients")     →  permissionSlugs.has("manage-clients")
   *
   * Admin-tier (Eigenaar/Admin/Directeur) krijgt altijd true.
   *
   * @param {string} action - bv. "view", "manage", "browse"
   * @param {string} [entity] - bv. "employees". Optioneel als de slug al volledig is in `action`.
   * @returns {boolean}
   */
  function besaCan(action, entity) {
    if (!state.loaded) return false;
    if (besaIsAdminTier()) return true;
    if (!action) return false;
    var slug = entity ? (action + "-" + entity) : action;
    return state.permissionSlugs.has(slug);
  }

  function hasRole(roleName) {
    if (!state.loaded || !roleName) return false;
    return state.roleNames.indexOf(roleName) !== -1;
  }

  function hasAnyRole(roleNames) {
    if (!state.loaded || !Array.isArray(roleNames)) return false;
    for (var i = 0; i < roleNames.length; i++) {
      if (state.roleNames.indexOf(roleNames[i]) !== -1) return true;
    }
    return false;
  }

  function getRoleNames() {
    return state.roleNames.slice();
  }

  function getPermissionSlugs() {
    return Array.from(state.permissionSlugs);
  }

  function getDebugInfo() {
    return {
      email: state.email,
      loaded: state.loaded,
      fetchedAt: state.fetchedAt,
      roleNames: state.roleNames.slice(),
      permissionSlugs: Array.from(state.permissionSlugs),
      adminTier: besaIsAdminTier(),
    };
  }

  /**
   * Forceer herlading uit DB (na bv. rol-wijziging in beheer-scherm).
   */
  async function reload() {
    clearCache();
    return loadFromDb();
  }

  // Boot — eerst cache (snelle eerste render), dan DB-refresh op achtergrond
  var bootPromise = (async function () {
    var cached = readCache();
    if (cached) applyCache(cached);
    var ok = await loadFromDb();
    if (!ok && !state.loaded) {
      // DB faalt en geen cache → toch als geladen markeren met lege rechten,
      // zodat pagina-gates niet eeuwig blijven hangen. Auth-guard zorgt voor
      // de login-redirect bij ontbrekende sessie.
      state.loaded = true;
      state.fetchedAt = Date.now();
    }
    return getDebugInfo();
  })();

  // Public API
  global.besaCan = besaCan;
  global.besaIsAdminTier = besaIsAdminTier;
  global.besaPermissionsReady = bootPromise;
  global.besaPermissions = {
    can: besaCan,
    isAdminTier: besaIsAdminTier,
    hasRole: hasRole,
    hasAnyRole: hasAnyRole,
    getRoleNames: getRoleNames,
    getPermissionSlugs: getPermissionSlugs,
    debug: getDebugInfo,
    reload: reload,
    clearCache: clearCache,
    ready: bootPromise,
  };

  // Achterwaartse compat: een aantal docs/oude code-fragmenten gebruikt
  // `besaPermissions.getCurrentRol()`. Geef de "primaire" rol terug (admin-tier
  // wint, anders eerste in lijst). Niet gebruikt door nieuwe gate-laag.
  global.besaPermissions.getCurrentRol = function () {
    if (!state.loaded) return null;
    if (besaIsAdminTier()) {
      for (var i = 0; i < ADMIN_TIER_NAMES.length; i++) {
        if (state.roleNames.indexOf(ADMIN_TIER_NAMES[i]) !== -1) return ADMIN_TIER_NAMES[i];
      }
    }
    return state.roleNames[0] || null;
  };
})(typeof window !== "undefined" ? window : this);
