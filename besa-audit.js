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

  // Canonieke resources (1-op-1 BS2 — zoals in de Audit-filter). De
  // logger schrijft deze exacte waarden zodat de filter klopt.
  var PAGE_RESOURCE = [
    [/^\/?(clienten|client-detail)/, "Client"],
    [/^\/?(index|medewerker|medewerker-detail|medewerkers-overzicht)/, "Medewerker"],
    [/^\/?(beschikking|beschikkingen)/, "Beschikking"],
    [/^\/?(facturen|factuur-detail|invoice-detail)/, "Disposition betaling"],
    [/^\/?(taken)/, "Taak.toewijzen"],
    [/^\/?(teams|organisatie)/, "Team.Fase"],
    [/^\/?(gemeente)/, "Gemeente"],
    [/^\/?(rollen)/, "Rol"],
    [/^\/?(gebruikers|mijn-gegevens)/, "Gebruiker"],
    [/^\/?(planning|werkuren|urendeclaraties|kilometers|verlof|plus-minuren)/, "Dienst"],
    [/^\/?(nieuws|notifications)/, "Notitie"],
  ];
  var CANON_RESOURCES = ["Client", "Product", "Medewerker", "Beschikking",
    "Disposition betaling", "Gebruiker", "Dienst", "Evenement", "Voorraadoverdracht",
    "Voorraad aanpassen", "Taak.toewijzen", "Team.Fase", "Notitie", "Gemeente", "Rol"];

  function resolveResource(explicit) {
    if (explicit && CANON_RESOURCES.indexOf(String(explicit)) >= 0) return String(explicit);
    var path = "";
    try { path = (global.location.pathname || "").toLowerCase(); } catch (e) {}
    for (var i = 0; i < PAGE_RESOURCE.length; i++) {
      if (PAGE_RESOURCE[i][0].test(path)) return PAGE_RESOURCE[i][1];
    }
    return explicit ? String(explicit) : "Gebruiker";
  }

  async function write(row) {
    if (!global.besaSupabase) return;
    if (inflight > 8) return; // burst-bescherming bij bulk-acties
    inflight++;
    try {
      var u = currentUser();
      var payload = {
        resource: resolveResource(row.resource),
        resource_id: String(row.resourceId == null || row.resourceId === "" ? pageResourceId() : row.resourceId),
        actie: String(row.actie || "bijwerken"),
        gebruiker_id: u.id,
        gebruiker_label: u.label,
        details: String(row.details == null ? "" : row.details).slice(0, 500),
        status: row.status || "succes",
        user_agent: (global.navigator && global.navigator.userAgent) || null,
      };
      var res = await global.besaSupabase.from(TABLE).insert(payload);
      // Audit mag de UI nooit breken, maar een mislukte insert NIET volledig
      // stil slikken (anders zie je nooit dat er iets misging — zoals de
      // CHECK-constraint die alles weigerde). Alleen console, geen toast.
      if (res && res.error) console.warn("[besa-audit] insert geweigerd:", res.error.message || res.error, payload);
    } catch (e) {
      console.warn("[besa-audit] log-exception (UI niet beïnvloed):", e && e.message || e);
    }
    finally { inflight--; }
  }

  function log(opts) { try { write(opts || {}); } catch (e) { /* */ } }

  // ---- haak 1: showActionFeedback ----
  // → canonieke actie-codes (1-op-1 met de Audit-filter; user gebruikt
  // "bijwerken", niet "bewerken").
  var KIND_TO_ACTIE = {
    added: "aanmaken", created: "aanmaken", saved: "bijwerken", updated: "bijwerken",
    deleted: "verwijderen", archived: "archiveren", restored: "herstellen",
    exported: "exporteren", downloaded: "downloaden", status: "bijwerken",
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
