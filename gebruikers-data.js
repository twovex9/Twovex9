/* global window */
/**
 * gebruikers-data.js — v3 Fase G.5 + G.6 + G.7
 *
 * Data-laag voor admin-only Gebruikers-tab.
 * Wrappert de Edge Function `admin-user-mgmt`.
 *
 * Alle write-acties gaan via de Edge Function (die service_role gebruikt
 * en de actor-rol verifieert). Lezen kan ook via list-users; we cachen
 * de result niet (verse data per page-load).
 *
 * Geen e-mails, geen externe diensten. Audit-log wordt server-side
 * geschreven door de Edge Function.
 */
(function (global) {
  "use strict";

  function reportSilent(action, err) {
    console.error("[gebruikersDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Gebruikers — " + action, err);
  }

  async function callEdge(action, args) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen.");
    var body = Object.assign({ action: action }, args || {});
    var res = await global.ffSupabase.functions.invoke("admin-user-mgmt", { body: body });
    if (res.error) {
      // res.error van .functions.invoke is een FunctionsHttpError; payload zit in .context
      var msg = res.error.message || "Onbekende fout";
      // Probeer de JSON-body uit te lezen voor een betere foutmelding
      try {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === "function") {
          var errBody = await ctx.json();
          if (errBody && errBody.error) msg = errBody.error;
        }
      } catch (e) { /* */ }
      throw new Error(msg);
    }
    if (!res.data || res.data.error) {
      throw new Error((res.data && res.data.error) || "Geen response van server.");
    }
    return res.data;
  }

  async function listUsers() {
    try {
      var data = await callEdge("list-users");
      return data; // { ok, users, roles, actor_id }
    } catch (err) {
      reportSilent("lijst ophalen", err);
      throw err;
    }
  }

  async function resetPassword(targetId) {
    return callEdge("reset-password", { target_id: targetId });
  }

  async function reset2fa(targetId) {
    return callEdge("reset-2fa", { target_id: targetId });
  }

  // Rol-toewijzing (multi-rol) gaat NIET meer via deze Edge Function, maar
  // client-side via window.bs2RolesDB.addUser/removeUser (tabel bs2_role_users) —
  // hetzelfde pad als rol-detail.html. Eén code-pad voor rol-beheer.

  async function deactivate(targetId) {
    return callEdge("deactivate", { target_id: targetId });
  }

  async function activate(targetId) {
    return callEdge("activate", { target_id: targetId });
  }

  async function createUser(input) {
    return callEdge("create-user", { payload: input });
  }

  global.gebruikersDB = {
    listUsers: listUsers,
    resetPassword: resetPassword,
    reset2fa: reset2fa,
    deactivate: deactivate,
    activate: activate,
    createUser: createUser,
  };
})(typeof window !== "undefined" ? window : this);
