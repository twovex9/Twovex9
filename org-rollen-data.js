/* global window, localStorage */
/**
 * Org rollen — Supabase data-laag voor rollen-organogram (BS2 parity).
 *
 * Sprint 1 / item 42-A. Hierarchie zoals BS2 op /organization/roles.
 *
 * Schema:
 *  - org_role_sections (id, naam, volgorde, beschrijving)
 *  - org_roles (id, section_id FK, naam, beschrijving, volgorde)
 *  - view org_roles_with_counts: rollen + section info + gebruikers_count
 *  - profiles.rol_id FK → org_roles
 *
 * Gebruik:
 *   await window.orgRollenDB.ready;
 *   var sections = window.orgRollenDB.getSectionsSync();   // [{id, naam, volgorde, ...}]
 *   var roles = window.orgRollenDB.getRolesSync();         // met gebruikers_count
 *   var grouped = window.orgRollenDB.getOrganogramSync();  // [{section, roles[]}]
 *
 * Voor v2 alleen read-only. CRUD voor admin komt v3 (drag-drop).
 */
(function (global) {
  "use strict";

  var CACHE_KEY_SECTIONS = "org_role_sections_v1";
  var CACHE_KEY_ROLES = "org_roles_with_counts_v1";

  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(key, items) {
    try { localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:org-rollen-updated", {
        detail: { source: source || "org-rollen-data" }
      }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[orgRollenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Rollen — " + action, err);
    }
  }

  async function fetchSections() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from("org_role_sections")
      .select("*")
      .order("volgorde", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function fetchRolesWithCounts() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from("org_roles_with_counts")
      .select("*")
      .order("section_volgorde", { ascending: true })
      .order("volgorde", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cachedSec = readCache(CACHE_KEY_SECTIONS);
    var cachedRol = readCache(CACHE_KEY_ROLES);
    if (cachedSec.length || cachedRol.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var [sections, roles] = await Promise.all([fetchSections(), fetchRolesWithCounts()]);
        writeCache(CACHE_KEY_SECTIONS, sections);
        writeCache(CACHE_KEY_ROLES, roles);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("bootstrap fetchAll", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var [sections, roles] = await Promise.all([fetchSections(), fetchRolesWithCounts()]);
    writeCache(CACHE_KEY_SECTIONS, sections);
    writeCache(CACHE_KEY_ROLES, roles);
    dispatchUpdated("refresh");
    return { sections: sections, roles: roles };
  }

  function getSectionsSync() { return readCache(CACHE_KEY_SECTIONS); }
  function getRolesSync() { return readCache(CACHE_KEY_ROLES); }

  function getOrganogramSync() {
    var sections = getSectionsSync();
    var roles = getRolesSync();
    return sections.map(function (s) {
      var rolesInSection = roles.filter(function (r) { return r.section_id === s.id; });
      return {
        section: s,
        roles: rolesInSection,
        totalUsers: rolesInSection.reduce(function (sum, r) { return sum + (r.gebruikers_count || 0); }, 0),
      };
    });
  }

  function getRoleByIdSync(id) {
    if (!id) return null;
    return getRolesSync().find(function (r) { return r.id === id; }) || null;
  }

  global.orgRollenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchSections: fetchSections,
    fetchRolesWithCounts: fetchRolesWithCounts,
    getSectionsSync: getSectionsSync,
    getRolesSync: getRolesSync,
    getOrganogramSync: getOrganogramSync,
    getRoleByIdSync: getRoleByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
