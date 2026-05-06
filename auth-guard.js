/* global window, document */
/**
 * auth-guard.js — Stage 8a authentication-bewaker.
 *
 * Verantwoordelijkheden:
 *   1. Bij elke pagina-load: check of er een actieve Supabase-sessie is.
 *      Geen sessie → redirect naar login.html (met ?next=<huidige-url> zodat
 *      de gebruiker na login op dezelfde plek terugkomt).
 *   2. Wel sessie → injecteert rechtsboven in de top-bar een blok met
 *      "<email> · Uitloggen". De uitlog-knop call'd Supabase signOut() en
 *      stuurt de gebruiker terug naar login.
 *   3. Luistert op auth-state changes: als een sessie elders wordt
 *      ingetrokken (bv. password reset, andere tab uitlogt), wordt deze
 *      tab automatisch naar login gestuurd.
 *
 * Vereisten:
 *   - Wordt geladen NA supabase-client.js maar VÓÓR alle data-layers, zodat
 *     de redirect kan plaatsvinden voordat de app data probeert te tonen.
 *   - Mag NIET op login.html worden geladen (zou een redirect-loop geven).
 *   - Werkt alleen als window.besaAuth.isEnabled() === true.
 */
(function () {
  "use strict";

  if (!window.besaAuth || typeof window.besaAuth.isEnabled !== "function") {
    // supabase-client.js is niet (correct) geladen — niets te bewaken.
    return;
  }
  if (!window.besaAuth.isEnabled()) {
    // Auth staat uit (development/legacy). Geen guard activeren.
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

  // Op login.html niets doen. Voor de zekerheid ook expliciet check'en.
  if (currentPathFile() === "login.html") return;

  function buildLoginUrl() {
    var here = window.location.pathname + window.location.search + window.location.hash;
    return "login.html?next=" + encodeURIComponent(here);
  }

  function redirectToLogin() {
    try { window.location.replace(buildLoginUrl()); }
    catch (e) { window.location.href = buildLoginUrl(); }
  }

  function injectUserBadge(user) {
    if (!user || !user.email) return;
    if (document.getElementById("besa-auth-badge")) return;

    var topbar = document.querySelector(".topbar");
    if (!topbar) return;

    // Container rechts in de top-bar.
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

    var email = document.createElement("span");
    email.textContent = user.email;
    email.style.cssText = "color:#6b7798;max-width:220px;overflow:hidden;text-overflow:ellipsis;";

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

    btn.addEventListener("click", async function () {
      btn.disabled = true;
      btn.textContent = "Uitloggen…";
      try {
        await window.besaSupabase.auth.signOut();
      } catch (e) { /* */ }
      // Wis de lokale caches om data-lekken naar volgende gebruiker te voorkomen.
      try {
        var keysToKeep = { theme: 1, locale: 1 };
        var toRemove = [];
        for (var i = 0; i < window.localStorage.length; i += 1) {
          var k = window.localStorage.key(i);
          if (!k) continue;
          if (keysToKeep[k]) continue;
          // Alle besa-*, employee*, facturen*, beschikkingen*, etc.
          toRemove.push(k);
        }
        toRemove.forEach(function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* */ } });
      } catch (e) { /* */ }
      window.location.replace("login.html");
    });

    wrap.appendChild(email);
    wrap.appendChild(sep);
    wrap.appendChild(btn);

    topbar.appendChild(wrap);
  }

  function listenForAuthChange() {
    try {
      window.besaSupabase.auth.onAuthStateChange(function (event, session) {
        if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
          redirectToLogin();
        }
      });
    } catch (e) { /* */ }
  }

  // Initiële session-check. getSession() is synchroon-snel (uit localStorage),
  // dus we blokkeren de pagina maar even.
  (async function init() {
    var session = null;
    try {
      var res = await window.besaSupabase.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (e) { /* */ }

    if (!session || !session.user) {
      redirectToLogin();
      return;
    }

    // Sessie OK → wacht tot DOM klaar is en injecteer badge.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { injectUserBadge(session.user); });
    } else {
      injectUserBadge(session.user);
    }
    listenForAuthChange();
  })();
})();
