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
    [/^\/?(rollen|rol-detail)/, "Rol"],
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
    if (inflight > 16) return; // burst-bescherming bij bulk-acties
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
  // ⚠️ BEWUST UITGESCHAKELD (hotfix 2026-05-18). Eerder abonneerde dit op
  // supabase.auth.onAuthStateChange en deed daarin een audit_log-insert.
  // Een Supabase-call in/naar aanleiding van de auth-state-callback laat
  // de Supabase auth-client HANGEN (gedocumenteerde valkuil) → auth-guard's
  // getSession() lost niet op → "geen sessie" → redirect-loop naar login.
  // (Trad pas op nadat #276 de te strenge CHECK verwijderde, waardoor de
  // insert nu écht uitgevoerd werd i.p.v. meteen te falen.)
  // Inloggen/uitloggen wordt later veilig gelogd vanuit login.html
  // (na succesvolle signIn) en de uitlog-knop in auth-guard.js —
  // BUITEN de onAuthStateChange-callback. besa-audit raakt de auth-flow
  // nooit meer aan.
  function wireAuth() { /* opzettelijk leeg — zie comment hierboven */ }

  // ---------------------------------------------------------------------------
  // Uitbreiding 2026-05-19: ALLES loggen (user-eis: elke navigatie, elke
  // klik, elke wijziging — niet alleen CRUD via showActionFeedback).
  // Centraal hier zodat we geen 67 pagina's hoeven te wijzigen. Alles
  // fire-and-forget, deduped, en NOOIT in een auth-state-callback (de
  // gedocumenteerde hang-valkuil) — enkel op DOMContentLoaded + DOM-events.
  // ---------------------------------------------------------------------------

  function profileReady() {
    try {
      var p = (global.profilesDB && global.profilesDB.getCurrentSync && global.profilesDB.getCurrentSync())
        || global.besaCurrentProfile || null;
      return !!(p && (p.id || p.email));
    } catch (e) { return false; }
  }
  // Wacht tot het echte profiel geladen is zodat gebruiker_label "Jason
  // Sonck" is i.p.v. "Onbekend"/e-mail. Logt na maxMs sowieso (liever een
  // entry met minder mooie naam dan géén entry).
  function whenProfileReady(cb, maxMs) {
    var start = Date.now(), done = false;
    function fin() { if (done) return; done = true; try { cb(); } catch (e) { /* */ } }
    if (profileReady()) return fin();
    try {
      global.addEventListener("besa:profile-updated", function h() {
        try { global.removeEventListener("besa:profile-updated", h); } catch (e) { /* */ }
        fin();
      });
    } catch (e) { /* */ }
    (function poll() {
      if (done) return;
      if (profileReady()) return fin();
      if (Date.now() - start > (maxMs || 6000)) return fin();
      setTimeout(poll, 300);
    })();
  }

  function pageTitleClean() {
    try {
      return String(document.title || "")
        .replace(/\s*[—|·-]\s*(Future Flow|Besa Suite|HR|Organisatie|ETF).*$/i, "").trim();
    } catch (e) { return ""; }
  }
  function pageLabel() {
    return pageTitleClean() || String((global.location.pathname || "")).replace(/^\//, "").replace(/\.html$/, "") || "pagina";
  }

  // ---- haak 3: navigatie / page-view (elke geopende pagina) ----
  function logPageView() {
    try {
      var key = (global.location.pathname || "") + (global.location.search || "");
      var now = Date.now();
      var lastKey = global.sessionStorage.getItem("__besaAuditNavKey") || "";
      var lastAt = Number(global.sessionStorage.getItem("__besaAuditNavAt") || 0);
      if (lastKey === key && (now - lastAt) < 4000) return; // redirect/reload-dedupe
      global.sessionStorage.setItem("__besaAuditNavKey", key);
      global.sessionStorage.setItem("__besaAuditNavAt", String(now));
    } catch (e) { /* */ }
    whenProfileReady(function () {
      log({ actie: "bekijken", details: ("Pagina geopend: " + pageLabel()) });
    }, 6000);
  }

  // ---- haak 4: betekenisvolle klikken (elke klik op een interactief el.) ----
  var INTERACTIVE_SEL = "a,button,[role=button],[role=menuitem],[role=menuitemcheckbox]," +
    "summary,label,.top-link,.side-link,.top-dropdown-link,.rollen-card,.column-toggle," +
    ".filter-chip,.btn-primary,.btn-outline,.hr-restore-btn,[data-id],[data-role-id]," +
    "[onclick],tr[data-id],li[data-id]";
  var lastSig = "", lastSigAt = 0;

  function elText(el) {
    if (!el || !el.getAttribute) return "";
    var t = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    if (!t) t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t && (el.tagName === "INPUT" || el.tagName === "SELECT")) {
      t = el.getAttribute("name") || el.getAttribute("placeholder") || el.getAttribute("data-col") || el.id || "veld";
    }
    if (!t) t = el.getAttribute("name") || el.getAttribute("data-col") || el.id || "";
    return String(t).slice(0, 80);
  }
  function onGlobalClick(ev) {
    try {
      var tgt = ev.target;
      if (!tgt || tgt.nodeType !== 1) return;
      var el = tgt.closest ? tgt.closest(INTERACTIVE_SEL) : null;
      if (!el) return; // alleen betekenisvolle interactie, geen lege ruimte
      // password-velden nooit: geen labels/inhoud loggen
      if (el.tagName === "INPUT" && /password/i.test(el.getAttribute("type") || "")) return;
      var label = elText(el);
      if (!label) return;
      var sig = (el.tagName || "") + "|" + label + "|" + (global.location.pathname || "");
      var now = Date.now();
      if (sig === lastSig && (now - lastSigAt) < 1200) return; // dubbel-fire/spam-dedupe
      lastSig = sig; lastSigAt = now;
      if (/^\s*(uitloggen|log\s*out)\s*$/i.test(label)) {
        log({ resource: "Gebruiker", actie: "uitloggen", details: "Uitgelogd" });
        return;
      }
      log({ actie: "klik", details: ("Klik: " + label + " — " + pageLabel()) });
    } catch (e) { /* */ }
  }

  // ---- haak 5: control-wijzigingen (elke gewijzigde dropdown/checkbox) ----
  function onGlobalChange(ev) {
    try {
      var el = ev.target;
      if (!el || el.nodeType !== 1) return;
      var tag = el.tagName;
      if (tag !== "SELECT" && tag !== "INPUT" && tag !== "TEXTAREA") return;
      var type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "password") return; // nooit wachtwoord-velden
      var name = el.getAttribute("aria-label") || el.getAttribute("name") || el.id || el.getAttribute("data-col") || "veld";
      var val = "";
      if (tag === "SELECT") {
        var op = el.options && el.options[el.selectedIndex];
        val = op ? (op.textContent || op.value || "").trim() : "";
      } else if (type === "checkbox" || type === "radio") {
        val = el.checked ? "aan" : "uit";
      } else {
        // tekst/datum: alleen DAT het gewijzigd is, niet de inhoud (privacy)
        val = el.value ? "(ingevuld)" : "(leeg)";
      }
      var sig = "chg|" + name + "|" + val + "|" + (global.location.pathname || "");
      var now = Date.now();
      if (sig === lastSig && (now - lastSigAt) < 1200) return;
      lastSig = sig; lastSigAt = now;
      log({ actie: "bijwerken", details: ("Veld gewijzigd: " + String(name).slice(0, 60) + " → " + String(val).slice(0, 60) + " — " + pageLabel()) });
    } catch (e) { /* */ }
  }

  // ---- haak 6: login per browser-sessie (1×, BUITEN auth-callback) ----
  function logSessionLoginOnce() {
    try {
      var hasSess = false;
      try { hasSess = !!global.localStorage.getItem("sb-besa-auth"); } catch (e) { /* */ }
      if (!hasSess) return; // login.html / uitgelogd → niet loggen
      if (global.sessionStorage.getItem("__besaAuditLogin")) return; // al gelogd deze tab-sessie
      global.sessionStorage.setItem("__besaAuditLogin", "1");
      whenProfileReady(function () {
        log({ resource: "Gebruiker", actie: "inloggen", details: "Ingelogd" });
      }, 6000);
    } catch (e) { /* */ }
  }

  function wireFullAudit() {
    try { document.addEventListener("click", onGlobalClick, true); } catch (e) { /* */ }
    try { document.addEventListener("change", onGlobalChange, true); } catch (e) { /* */ }
    logSessionLoginOnce();
    logPageView();
  }

  global.besaAudit = { log: log };

  function init() {
    wrapFeedback();              // haak 1: alle CRUD via showActionFeedback
    wireFullAudit();             // haak 3-6: nav + klik + change + login
    /* geen wireAuth — auth-flow niet aanraken (hang-valkuil) */
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // Vangnet: als save-feedback.js later (defer) klaar is, alsnog wrappen.
  setTimeout(wrapFeedback, 1500);
  setTimeout(wrapFeedback, 4000);
})(typeof window !== "undefined" ? window : this);
