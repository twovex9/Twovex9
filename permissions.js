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
 * Admin-tier (Eigenaar/Admin/Directeur) wint altijd in ffCan.
 *
 * Gebruik:
 *   await window.ffPermissionsReady;          // wacht tot DB-load klaar is
 *   if (ffCan("view", "employees")) { ... }   // → checkt slug "view-employees"
 *   if (ffIsAdminTier()) { ... }
 *
 * Geen eager bootstrap-race (les 2026-05-19, PR #293): wacht eerst op
 * `ffSupabaseReady` voordat we de DB benaderen. Falende reads gaan via
 * console.warn — NIET via ffReportSyncFailure (anders auth-logout-cascade).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "ff-permissions-v2";
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
      if (global.ffSupabaseReady && typeof global.ffSupabaseReady.then === "function") {
        await global.ffSupabaseReady;
      }
    } catch (e) { /* doorgaan; supabase kan tóch werken */ }
    return global.ffSupabase || null;
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

  function ffIsAdminTier() {
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
   *   ffCan("view", "employees")  →  permissionSlugs.has("view-employees")
   *   ffCan("manage-clients")     →  permissionSlugs.has("manage-clients")
   *
   * Admin-tier (Eigenaar/Admin/Directeur) krijgt altijd true.
   *
   * @param {string} action - bv. "view", "manage", "browse"
   * @param {string} [entity] - bv. "employees". Optioneel als de slug al volledig is in `action`.
   * @returns {boolean}
   */
  function ffCan(action, entity) {
    if (!state.loaded) return false;
    if (ffIsAdminTier()) return true;
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
      adminTier: ffIsAdminTier(),
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
  global.ffCan = ffCan;
  global.ffIsAdminTier = ffIsAdminTier;
  global.ffPermissionsReady = bootPromise;
  global.ffPermissions = {
    can: ffCan,
    isAdminTier: ffIsAdminTier,
    hasRole: hasRole,
    hasAnyRole: hasAnyRole,
    getRoleNames: getRoleNames,
    getPermissionSlugs: getPermissionSlugs,
    debug: getDebugInfo,
    reload: reload,
    clearCache: clearCache,
    ready: bootPromise,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // G57 — herbruikbare alleen-lezen-modus per rol.
  //
  //   ffApplyReadOnly(["HR", "Facilitair"])                  // hele pagina
  //   ffApplyReadOnly(["HR"], { scope: "#planning-root",
  //                               banner: "Kijkmodus: alleen-lezen voor HR" })
  //
  // Heeft de ingelogde gebruiker een van de opgegeven rollen (admin-tier wint
  // en blijft volledig), dan worden alle invoervelden en muterende knoppen
  // binnen de scope uitgeschakeld + komt er één duidelijke banner. Een
  // MutationObserver houdt dynamisch gerenderde content ook read-only.
  // Idempotent; geeft true terug als de kijkmodus actief is.
  // Opt-outs per element: data-ro-keep (blijft bruikbaar), data-ro-hide
  // (extra te verbergen element).
  // ──────────────────────────────────────────────────────────────────────────
  function ffApplyReadOnly(roles, opts) {
    var doc = global.document;
    if (!doc || !Array.isArray(roles) || !roles.length) return false;
    if (!state.loaded) {
      // Permissies nog niet geladen → opnieuw zodra ze er zijn (de gate-laag
      // blijft intussen fail-closed voor strikte pagina's).
      bootPromise.then(function () { ffApplyReadOnly(roles, opts); });
      return false;
    }
    if (ffIsAdminTier()) return false;
    var mine = getRoleNames();
    var match = roles.some(function (r) { return mine.indexOf(r) !== -1; });
    if (!match) return false;

    var o = opts || {};
    var root = o.scope ? doc.querySelector(o.scope) : (doc.querySelector("main.content") || doc.body);
    if (!root) return false;

    function lock(scopeEl) {
      var ctrls = scopeEl.querySelectorAll(
        "input:not([type=hidden]):not([data-ro-keep]), select:not([data-ro-keep]), textarea:not([data-ro-keep])"
      );
      Array.prototype.forEach.call(ctrls, function (el) {
        // zoekvelden/filters blijven bruikbaar (lezen ≠ muteren)
        if (el.classList.contains("search") || el.type === "search") return;
        el.disabled = true;
      });
      var btns = scopeEl.querySelectorAll(
        ".btn-primary:not([data-ro-keep]), .employee-delete-btn, .hr-restore-btn, [data-ro-hide]"
      );
      Array.prototype.forEach.call(btns, function (el) { el.hidden = true; });
    }

    lock(root);
    try {
      var mo = new MutationObserver(function () { lock(root); });
      mo.observe(root, { childList: true, subtree: true });
    } catch (e) { /* zonder observer blijft de eerste lock staan */ }

    if (!doc.getElementById("ff-readonly-banner")) {
      var b = doc.createElement("div");
      b.id = "ff-readonly-banner";
      b.className = "ff-readonly-banner";
      b.setAttribute("role", "note");
      b.textContent = o.banner || "Kijkmodus — je rol heeft alleen-lezen toegang tot deze pagina.";
      root.insertBefore(b, root.firstChild);
    }
    return true;
  }
  global.ffApplyReadOnly = ffApplyReadOnly;
  global.ffPermissions.applyReadOnly = ffApplyReadOnly;

  // Achterwaartse compat: een aantal docs/oude code-fragmenten gebruikt
  // `ffPermissions.getCurrentRol()`. Geef de "primaire" rol terug (admin-tier
  // wint, anders eerste in lijst). Niet gebruikt door nieuwe gate-laag.
  global.ffPermissions.getCurrentRol = function () {
    if (!state.loaded) return null;
    if (ffIsAdminTier()) {
      for (var i = 0; i < ADMIN_TIER_NAMES.length; i++) {
        if (state.roleNames.indexOf(ADMIN_TIER_NAMES[i]) !== -1) return ADMIN_TIER_NAMES[i];
      }
    }
    return state.roleNames[0] || null;
  };
})(typeof window !== "undefined" ? window : this);
