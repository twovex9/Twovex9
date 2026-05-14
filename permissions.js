/* global window */
/**
 * permissions.js — Fase F — 13 BS2-rollen permissies-matrix
 *
 * Per user-keuze #14: 1-op-1 BS2-spiegel, 13 rollen (skip medewerkertest).
 *
 * Rollen:
 *   - Eigenaar / Admin / Directeur (admin-tier — alles toegestaan)
 *   - Planner (planning + rooster)
 *   - Cliëntbeheer (cliënt-CRUD)
 *   - Teamleider (eigen team-medewerkers, verlof goedkeuren)
 *   - HR (medewerker-CRUD, verzuim, verlof)
 *   - Gedragswetenschapper (cliënt-detail, rapportages)
 *   - Facilitair (locaties, beheer)
 *   - Finance (facturen, beschikkingen)
 *   - Salarisadministratie (salarishuis, salaris-exports)
 *   - Medewerker (eigen profile, urenregistratie)
 *   - Beleid (beleidsdocumenten CRUD)
 *
 * Gebruik:
 *   if (besaCan("edit", "medewerker")) { ... }
 *   if (besaCan("view", "salarishuis")) { ... }
 *   if (besaCan("manage_users")) { ... }
 *
 * Sidebar-filtering:
 *   if (!besaCan("view", "facturen")) hideSidebarItem("facturen");
 */
(function (global) {
  "use strict";

  // ============================================================================
  // Permission matrix — per rol een Set van toegestane (action+entity) strings
  // ============================================================================
  // Format: "action:entity" of "action" (zonder entity = global action)
  // Wildcard: "*" → alles toegestaan
  // ============================================================================
  var MATRIX = {
    // Admin-tier — alles toegestaan
    "Eigenaar": new Set(["*"]),
    "Admin": new Set(["*"]),
    "Directeur": new Set(["*"]),

    // Planner — planning + rooster
    "Planner": new Set([
      "view:planning", "edit:planning", "add:planning", "delete:planning",
      "view:medewerkers", "view:clienten",
      "view:locaties", "view:teams",
      "view:roosters", "edit:roosters",
      "view:taken", "edit:taken",
    ]),

    // Cliëntbeheer — cliënten CRUD
    "Cliëntbeheer": new Set([
      "view:clienten", "edit:clienten", "add:clienten", "archive:clienten",
      "view:beschikkingen", "edit:beschikkingen", "add:beschikkingen",
      "view:incidenten", "add:incidenten",
      "view:zorgsoorten",
      "view:organisaties",
    ]),

    // Teamleider — eigen team-medewerkers, verlof goedkeuren
    "Teamleider": new Set([
      "view:medewerkers",  // alleen own team in RLS
      "view:teams", "edit:teams",
      "view:verlof", "approve:verlof",
      "view:verzuim",
      "view:planning",
      "view:clienten",
      "view:taken", "edit:taken",
    ]),

    // HR — medewerker-CRUD, verzuim, verlof
    "HR": new Set([
      "view:medewerkers", "edit:medewerkers", "add:medewerkers", "archive:medewerkers",
      "view:verzuim", "edit:verzuim", "add:verzuim",
      "view:verlof", "edit:verlof", "approve:verlof",
      "view:opleidingen", "edit:opleidingen",
      "view:competenties", "edit:competenties",
      "view:locaties", "view:teams",
      "view:salarishuis",
      "view:audit",
    ]),

    // Gedragswetenschapper — cliënt-detail, rapportages
    "Gedragswetenschapper": new Set([
      "view:clienten", "edit:clienten",  // rapportages-tab
      "view:beschikkingen",
      "view:incidenten",
      "view:zorgsoorten",
    ]),

    // Facilitair — locaties, beheer
    "Facilitair": new Set([
      "view:locaties", "edit:locaties", "add:locaties",
      "view:bureaus", "edit:bureaus",
      "view:teams",
      "view:medewerkers",
    ]),

    // Finance — facturen, beschikkingen
    "Finance": new Set([
      "view:facturen", "edit:facturen", "approve:facturen", "export:facturen",
      "view:beschikkingen", "edit:beschikkingen",
      "view:clienten",
      "view:medewerkers",
      "view:kilometers",
      "view:salarishuis",
    ]),

    // Salarisadministratie — salarishuis, salaris-exports
    "Salarisadministratie": new Set([
      "view:salarishuis", "edit:salarishuis", "add:salarishuis",
      "view:medewerkers",
      "view:werkuren", "export:werkuren",
      "view:compensatie", "edit:compensatie",
    ]),

    // Medewerker — eigen profile + urenregistratie
    "Medewerker": new Set([
      "view:eigen_profile", "edit:eigen_profile",
      "view:eigen_werkuren", "edit:eigen_werkuren", "add:eigen_werkuren",
      "view:eigen_verlof", "add:eigen_verlof",
      "view:eigen_kilometers", "add:eigen_kilometers",
      "view:beleidsdocumenten",
      "view:nieuws",
      "view:eigen_planning",
    ]),

    // Beleid — beleidsdocumenten CRUD
    "Beleid": new Set([
      "view:beleidsdocumenten", "edit:beleidsdocumenten", "add:beleidsdocumenten", "archive:beleidsdocumenten",
      "view:audit",
    ]),
  };

  /**
   * Get current user's rol-naam uit profilesDB.
   * Returns null als nog niet geladen of geen rol.
   */
  function getCurrentRol() {
    try {
      if (!global.profilesDB || !global.profilesDB.getCurrentSync) return null;
      var p = global.profilesDB.getCurrentSync();
      if (!p) return null;
      // Probeer eerst rol_id → org_roles-naam
      if (p.rol_id && global.orgRollenDB && global.orgRollenDB.getRoleByIdSync) {
        var rol = global.orgRollenDB.getRoleByIdSync(p.rol_id);
        if (rol && rol.naam) return rol.naam;
      }
      // Fallback: profile.rol text-veld (legacy admin/medewerker/viewer)
      if (p.rol === "admin") return "Admin";
      if (p.rol === "medewerker") return "Medewerker";
      if (p.rol === "viewer") return "Medewerker";  // viewer ≈ read-only medewerker
      return p.rol || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check of huidige user de gegeven actie+entity mag.
   *
   * @param {string} action - bv. "view", "edit", "add", "archive", "approve", "export", "manage_users"
   * @param {string} [entity] - bv. "medewerkers", "facturen". Optioneel voor globale acties.
   * @returns {boolean}
   */
  function besaCan(action, entity) {
    var rol = getCurrentRol();
    if (!rol) return false;
    var perms = MATRIX[rol];
    if (!perms) return false;
    if (perms.has("*")) return true;
    if (entity && perms.has(action + ":" + entity)) return true;
    if (!entity && perms.has(action)) return true;
    return false;
  }

  /**
   * Helper voor admin-tier check.
   * @returns {boolean}
   */
  function besaIsAdminTier() {
    var rol = getCurrentRol();
    return rol === "Eigenaar" || rol === "Admin" || rol === "Directeur";
  }

  /**
   * Voor debugging / docs: list alle rollen en hun permissies.
   */
  function getMatrix() {
    var out = {};
    Object.keys(MATRIX).forEach(function (rol) {
      out[rol] = Array.from(MATRIX[rol]);
    });
    return out;
  }

  global.besaCan = besaCan;
  global.besaIsAdminTier = besaIsAdminTier;
  global.besaPermissions = {
    can: besaCan,
    isAdminTier: besaIsAdminTier,
    getCurrentRol: getCurrentRol,
    getMatrix: getMatrix,
  };
})(typeof window !== "undefined" ? window : this);
