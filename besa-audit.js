/* global window, document */
/**
 * besa-audit.js — centrale audit-logger (wie deed wat, wanneer).
 *
 * Probleem: public.audit_log werd alléén door DB-triggers gevuld → alles
 * "Systeem", geen echte gebruiker, geen login/logout. Deze module logt
 * vanuit de BS1-app zélf elke betekenisvolle gebruikersactie met de ECHTE
 * ingelogde gebruiker, 1-op-1 in de stijl van BS2's Audit Logs.
 *
 * Aanpak zonder 40 bestanden te wijzigen: haak in op de twee centrale
 * punten die in de hele app al bij elke actie draaien:
 *   1. window.showActionFeedback(kind, target, extra) — wordt overal
 *      aangeroepen na opslaan/aanmaken/bewerken/verwijderen/archiveren/
 *      herstellen/exporteren (save-feedback.js, op elke pagina geladen).
 *   2. supabase auth-state → inloggen / uitloggen.
 *
 * Schrijft naar public.audit_log (bestaande tabel). Fire-and-forget:
 * audit mag NOOIT de UI breken of de actie blokkeren. Geen recursie
 * (insert in audit_log roept showActionFeedback niet aan).
 */
(function (global) {
  "use strict";
  if (global.besaAudit) return;

  var TABLE = "audit_log";
  var inflight = 0;

  function currentUser() {
    var id = null, label = "Onbekend";
    try {
      var p = (global.profilesDB && global.profilesDB.getCurrentSync && global.profilesDB.getCurrentSync())
        || global.besaCurrentProfile || null;
      if (p) {
        id = p.id || null;
        var nm = [p.voornaam, p.achternaam].filter(Boolean).join(" ").trim();
        label = nm || p.naam || p.email || "Onbekend";
      }
    } catch (e) { /* */ }
    return { id: id, label: label };
  }

  function pageResourceId() {
    try {
      var u = new URL(global.location.href);
      var keys = ["id", "bescId", "beschikkingId", "clientId", "empId", "medewerkerId",
        "factuurId", "invoiceId", "taakId", "docId", "incidentId", "kmId"];
      for (var i = 0; i < keys.length; i++) {
        var v = u.searchParams.get(keys[i]);
        if (v) return String(v);
      }
      return (global.location.pathname || "").replace(/^\//, "").replace(/\.html$/, "") || "-";
    } catch (e) { return "-"; }
  }

  async function write(row) {
    if (!global.besaSupabase) return;
    if (inflight > 8) return; // burst-bescherming bij bulk-acties
    inflight++;
    try {
      var u = currentUser();
      var payload = {
        resource: String(row.resource || "Onbekend"),
        resource_id: String(row.resourceId == null || row.resourceId === "" ? pageResourceId() : row.resourceId),
        actie: String(row.actie || "bewerken"),
        gebruiker_id: u.id,
        gebruiker_label: u.label,
        details: String(row.details == null ? "" : row.details).slice(0, 500),
        status: row.status || "succes",
        user_agent: (global.navigator && global.navigator.userAgent) || null,
      };
      await global.besaSupabase.from(TABLE).insert(payload);
    } catch (e) { /* audit mag de UI nooit breken */ }
    finally { inflight--; }
  }

  function log(opts) { try { write(opts || {}); } catch (e) { /* */ } }

  // ---- haak 1: showActionFeedback ----
  var KIND_TO_ACTIE = {
    added: "aanmaken", created: "aanmaken", saved: "bewerken", updated: "bewerken",
    deleted: "verwijderen", archived: "archiveren", restored: "herstellen",
    exported: "exporteren", downloaded: "downloaden", status: "status_wijziging",
  };
  // info/error = geen data-actie (bv. "Filters gewist") → niet loggen.
  var SKIP_KINDS = { info: 1, error: 1, "": 1 };

  function wrapFeedback() {
    var orig = global.showActionFeedback;
    if (typeof orig !== "function" || orig.__besaAuditWrapped) return;
    var wrapped = function (action, target, extra) {
      try {
        var k = String(action || "").toLowerCase();
        if (!SKIP_KINDS[k]) {
          log({
            resource: String(target || "Actie"),
            actie: KIND_TO_ACTIE[k] || "bewerken",
            details: [target, extra].filter(Boolean).join(" — ") || k,
          });
        }
      } catch (e) { /* */ }
      return orig.apply(this, arguments);
    };
    wrapped.__besaAuditWrapped = true;
    global.showActionFeedback = wrapped;
  }

  // ---- haak 2: inloggen / uitloggen ----
  function wireAuth() {
    var sb = global.besaSupabase;
    if (!sb || !sb.auth || typeof sb.auth.onAuthStateChange !== "function") return;
    try {
      sb.auth.onAuthStateChange(function (event, session) {
        try {
          var uid = session && session.user && session.user.id;
          if (event === "SIGNED_IN" && uid) {
            var key = "besa_audit_login_" + uid;
            if (!global.sessionStorage.getItem(key)) {
              global.sessionStorage.setItem(key, "1");
              // korte delay zodat het profiel (naam) geladen is
              setTimeout(function () { log({ resource: "Gebruiker", resourceId: uid, actie: "inloggen", details: "Ingelogd" }); }, 800);
            }
          } else if (event === "SIGNED_OUT") {
            log({ resource: "Gebruiker", resourceId: "-", actie: "uitloggen", details: "Uitgelogd" });
            try {
              var rm = [];
              for (var i = 0; i < global.sessionStorage.length; i++) {
                var sk = global.sessionStorage.key(i);
                if (sk && sk.indexOf("besa_audit_login_") === 0) rm.push(sk);
              }
              rm.forEach(function (sk) { global.sessionStorage.removeItem(sk); });
            } catch (e) { /* */ }
          }
        } catch (e) { /* */ }
      });
    } catch (e) { /* */ }
  }

  global.besaAudit = { log: log };

  function init() { wrapFeedback(); wireAuth(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // Vangnet: als save-feedback.js later (defer) klaar is, alsnog wrappen.
  setTimeout(wrapFeedback, 1500);
  setTimeout(wrapFeedback, 4000);
})(typeof window !== "undefined" ? window : this);
