/* global window, document */
/**
 * auth-guard.js — Stage 8a/8d authentication-bewaker.
 *
 * Verantwoordelijkheden:
 *   1. Bij elke pagina-load: check of er een actieve Supabase-sessie is.
 *      Geen sessie → redirect naar login.html (met ?next=<huidige-url> zodat
 *      de gebruiker na login op dezelfde plek terugkomt).
 *   2. Wel sessie → injecteert rechtsboven in de top-bar een blok met
 *      "<naam | email> · Uitloggen". De uitlog-knop call'd Supabase signOut()
 *      en stuurt de gebruiker terug naar login.
 *   3. Luistert op auth-state changes: als een sessie elders wordt
 *      ingetrokken (bv. password reset, andere tab uitlogt), wordt deze
 *      tab automatisch naar login gestuurd.
 *   4. (Stage 8d) Levert window.besaHandleAuthFailure(err): wordt door
 *      besa-sync-reporter.js aangeroepen zodra een data-call met een
 *      auth-fout (PGRST301, 401, JWT expired, ...) terugkomt. Doet één
 *      nette logout + redirect en is idempotent.
 *   5. (Stage 8d) Pollt actief de sessie wanneer de tab opnieuw zichtbaar
 *      wordt of focus krijgt — voorkomt dat een gebruiker eerst data-calls
 *      ziet falen voordat hij doorheeft dat zijn sessie verlopen is.
 *
 * Vereisten:
 *   - Wordt geladen NA supabase-client.js + besa-sync-reporter.js maar VÓÓR
 *     alle data-layers en page-scripts.
 *   - Mag NIET op login.html worden geladen (zou een redirect-loop geven).
 *   - Werkt alleen als window.besaAuth.isEnabled() === true.
 */
(function () {
  "use strict";

  if (!window.besaAuth || typeof window.besaAuth.isEnabled !== "function") {
    return;
  }
  if (!window.besaAuth.isEnabled()) {
    return;
  }
  if (!window.besaSupabase || !window.besaSupabase.auth) {
    return;
  }

  function currentPathFile() {
    var p = window.location.pathname || "";
    var idx = p.lastIndexOf("/");
    return idx >= 0 ? p.slice(idx + 1).toLowerCase() : p.toLowerCase();
  }

  if (currentPathFile() === "login.html") return;

  function buildLoginUrl() {
    var here = window.location.pathname + window.location.search + window.location.hash;
    return "login.html?next=" + encodeURIComponent(here);
  }

  // ---------------------------------------------------------------------------
  // Centrale logout + redirect helper (gedeeld door uitlog-knop, expired-flow
  // en proactieve session check). Idempotent via redirectInFlight-flag.
  // ---------------------------------------------------------------------------
  var redirectInFlight = false;

  function clearLocalCaches() {
    try {
      var keysToKeep = { theme: 1, locale: 1 };
      var toRemove = [];
      for (var i = 0; i < window.localStorage.length; i += 1) {
        var k = window.localStorage.key(i);
        if (!k) continue;
        if (keysToKeep[k]) continue;
        toRemove.push(k);
      }
      toRemove.forEach(function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* */ } });
    } catch (e) { /* */ }
  }

  function performLogoutAndRedirect(opts) {
    if (redirectInFlight) return;
    redirectInFlight = true;
    var options = opts || {};
    var loginUrl = options.preserveNext === false
      ? "login.html"
      : buildLoginUrl();

    if (options.reason === "expired" && typeof window.showActionFeedback === "function") {
      try {
        window.showActionFeedback(
          "info",
          "Sessie verlopen",
          "Log opnieuw in om door te gaan."
        );
      } catch (e) { /* */ }
    }

    // signOut() kan netwerk doen; we wachten max 1500ms en gaan dan sowieso.
    var done = false;
    function go() {
      if (done) return;
      done = true;
      clearLocalCaches();
      try { window.location.replace(loginUrl); }
      catch (e) { window.location.href = loginUrl; }
    }
    try {
      var p = window.besaSupabase.auth.signOut();
      if (p && typeof p.then === "function") {
        p.then(go).catch(go);
        setTimeout(go, options.reason === "expired" ? 1500 : 1500);
        return;
      }
    } catch (e) { /* */ }
    go();
  }

  // Stage 8d: globaal beschikbaar voor besa-sync-reporter en eventueel
  // andere modules die een verlopen sessie willen melden.
  window.besaHandleAuthFailure = function (err) {
    try { console.warn("[auth-guard] auth-fout, ga uitloggen:", err); } catch (e) { /* */ }
    performLogoutAndRedirect({ reason: "expired" });
  };

  function getDisplayLabel(user) {
    if (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function") {
      try {
        var p = window.profilesDB.getCurrentSync();
        if (p) {
          var nm = window.profilesDB.displayName(p);
          if (nm) return nm;
        }
      } catch (e) { /* fall back to email */ }
    }
    return (user && user.email) || "";
  }

  function injectUserBadge(user) {
    if (!user || !user.email) return;
    if (document.getElementById("besa-auth-badge")) return;

    var topbar = document.querySelector(".topbar");
    if (!topbar) return;

    var wrap = document.createElement("div");
    wrap.id = "besa-auth-badge";
    wrap.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:10px",
      "margin-left:auto",
      "padding:0 14px",
      "font-size:13px",
      "color:#1a2540",
      "white-space:nowrap",
    ].join(";");

    var label = document.createElement("span");
    label.id = "besa-auth-badge-label";
    label.textContent = getDisplayLabel(user);
    label.title = user.email;
    label.style.cssText = "color:#6b7798;max-width:220px;overflow:hidden;text-overflow:ellipsis;";

    window.addEventListener("besa:profile-updated", function () {
      var newLabel = getDisplayLabel(user);
      if (newLabel) label.textContent = newLabel;
    });

    var sep = document.createElement("span");
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    sep.style.cssText = "color:#c7cfe0;";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Uitloggen";
    btn.style.cssText = [
      "background:transparent",
      "border:none",
      "padding:6px 10px",
      "font:inherit",
      "color:#2962ff",
      "cursor:pointer",
      "border-radius:6px",
    ].join(";");
    btn.addEventListener("mouseover", function () { btn.style.background = "rgba(41,98,255,0.08)"; });
    btn.addEventListener("mouseout", function () { btn.style.background = "transparent"; });

    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Uitloggen…";
      // Bewuste handmatige uitlog: geen ?next=, ga gewoon naar login.
      performLogoutAndRedirect({ reason: "manual", preserveNext: false });
    });

    wrap.appendChild(label);
    wrap.appendChild(sep);
    wrap.appendChild(btn);

    topbar.appendChild(wrap);
  }

  function listenForAuthChange() {
    try {
      window.besaSupabase.auth.onAuthStateChange(function (event, session) {
        if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
          performLogoutAndRedirect({ reason: "expired" });
        }
      });
    } catch (e) { /* */ }
  }

  // Stage 8d: actief checken bij visibility/focus changes. Voorkomt dat
  // een tab die uren in de achtergrond stond eerst een paar permission-
  // denied calls produceert voordat de gebruiker doorheeft dat hij is
  // uitgelogd.
  function attachVisibilityChecks() {
    var checking = false;
    async function recheck() {
      if (checking || redirectInFlight) return;
      checking = true;
      try {
        var res = await window.besaSupabase.auth.getSession();
        var session = res && res.data ? res.data.session : null;
        if (!session || !session.user) {
          performLogoutAndRedirect({ reason: "expired" });
        }
      } catch (e) {
        if (window.besaIsAuthError && window.besaIsAuthError(e)) {
          performLogoutAndRedirect({ reason: "expired" });
        }
      } finally {
        checking = false;
      }
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") recheck();
    });
    window.addEventListener("focus", recheck);
  }

  (async function init() {
    var session = null;
    try {
      var res = await window.besaSupabase.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (e) { /* */ }

    if (!session || !session.user) {
      // Geen logout-call (er is geen sessie); ga direct naar login.
      redirectInFlight = true;
      try { window.location.replace(buildLoginUrl()); }
      catch (e) { window.location.href = buildLoginUrl(); }
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { injectUserBadge(session.user); });
    } else {
      injectUserBadge(session.user);
    }
    listenForAuthChange();
    attachVisibilityChecks();
  })();
})();
