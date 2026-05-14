/* global window, document */
/**
 * read-audit.js — Fase E.6 — Read-audit voor GDPR Art. 15 compliance
 *
 * Per user-keuze #22: read-audit logt wie wanneer welke gevoelige data zag.
 * Specifiek voor cliënt-detail en medewerker-detail (PII-bevattende pagina's).
 *
 * Server-side helper: public.log_read_audit(resource, resource_id, user_id, user_label)
 * → INSERT row in audit_log met actie='bekijken'.
 *
 * Throttling: max 1× per resource-id per 5 minuten, om audit-spam te voorkomen
 * bij page-refresh / tab-switch.
 *
 * Gebruik vanuit page-script:
 *   window.besaReadAudit.log("Cliënt", clientId);
 *   window.besaReadAudit.log("Medewerker", empId);
 */
(function (global) {
  "use strict";

  var THROTTLE_MS = 5 * 60 * 1000;  // 5 min per (resource + id)
  var lastLogged = {};

  function makeKey(resource, resourceId) {
    return resource + "|" + resourceId;
  }

  async function log(resource, resourceId) {
    if (!resource || !resourceId) return;
    if (!global.besaSupabase) {
      console.warn("[read-audit] besaSupabase niet geladen, skip");
      return;
    }
    var key = makeKey(resource, resourceId);
    var now = Date.now();
    if (lastLogged[key] && (now - lastLogged[key] < THROTTLE_MS)) {
      return;  // throttled
    }
    lastLogged[key] = now;

    // Gebruiker-label uit profile (indien beschikbaar)
    var userLabel = "Onbekend";
    try {
      if (global.profilesDB && global.profilesDB.getCurrentSync) {
        var p = global.profilesDB.getCurrentSync();
        if (p && p.email) userLabel = p.email;
      }
    } catch (e) { /* swallow */ }

    try {
      var res = await global.besaSupabase.rpc("log_read_audit", {
        p_resource: resource,
        p_resource_id: String(resourceId),
        p_user_label: userLabel,
      });
      if (res.error) {
        console.error("[read-audit] RPC error:", res.error.message);
      }
    } catch (err) {
      console.error("[read-audit] exception:", err);
    }
  }

  global.besaReadAudit = {
    log: log,
  };
})(typeof window !== "undefined" ? window : this);
