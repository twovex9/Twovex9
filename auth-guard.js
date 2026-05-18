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
      // sb-besa-auth NIET wissen: een (vals-positieve) logout mag de nog
      // geldige Supabase-sessie nooit slopen → anders kan de user niet meer
      // terug inloggen (cascade). Een ECHTE logout doet auth.signOut() dat
      // de GoTrue-sessie zelf netjes verwijdert.
      var keysToKeep = { theme: 1, locale: 1, "sb-besa-auth": 1 };
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
    // TIJDELIJKE DIAGNOSE: leg vast WAAROM + vanaf welk pad we uitloggen,
    // zodat we het na de redirect (op login/home) kunnen uitlezen.
    try {
      window.sessionStorage.setItem("__ag_bc", JSON.stringify({
        t: new Date().toISOString(),
        path: window.location.pathname + window.location.search,
        via: "performLogoutAndRedirect",
        reason: options.reason || "?",
        stack: String((new Error()).stack || "").split("\n").slice(1, 6).join(" | "),
      }));
    } catch (e) { /* */ }
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

  // ---------------------------------------------------------------------------
  // Robuuste check: is de sessie ÉCHT weg?
  //
  // ⚠️ NOOIT zelf auth.refreshSession() aanroepen: dat ROTEERT de
  // refresh-token. Bij het laden van een pagina vuren meerdere data-calls
  // tegelijk; één transiënte 401 → besaHandleAuthFailure → een handmatige
  // refreshSession racet met Supabase's eigen autoRefreshToken én met
  // andere triggers → "Invalid Refresh Token" → ECHTE logout-loop
  // (precies wat #284 per ongeluk veroorzaakte op /rollen).
  //
  // Daarom: alléén getSession() (roteert NIET; geeft het opgeslagen
  // sessie-object terug, ook als het access-token net verloopt — Supabase
  // ververst dat zelf veilig op de achtergrond). Eén korte retry zodat
  // die achtergrond-refresh even tijd krijgt. Single-flight: alle
  // gelijktijdige triggers delen één check.
  // ---------------------------------------------------------------------------
  // GEBLEKEN ROOT CAUSE (breadcrumb-diagnose): op zwaardere pagina's
  // (rollen.html) lost auth-guard's getSession() OP vóór de Supabase-client
  // de sessie uit localStorage heeft gehydrateerd (navigator-lock-race) →
  // getSession() geeft transient null terwijl `sb-besa-auth` mét geldige
  // refresh_token gewoon in localStorage staat → onterechte logout.
  // Daarom: localStorage is de autoritatieve bron. Staat er een geldige
  // opgeslagen sessie → je bent NIET uitgelogd (Supabase hydrateert/ververst
  // zelf). NOOIT refreshSession (rotatie). Enkel ÉCHT uitgelogd als er
  // helemaal geen bruikbare opgeslagen sessie is.
  function storedSessionLooksValid() {
    try {
      var raw = window.localStorage.getItem("sb-besa-auth");
      if (!raw) return false;
      var o = JSON.parse(raw);
      var sess = o && (o.currentSession || o.session || o);
      var rt = sess && sess.refresh_token;
      if (!rt) return false;
      // expires_at in seconden; refresh_token aanwezig = Supabase kan
      // herstellen, ook als het access-token verlopen is.
      return true;
    } catch (e) { return false; }
  }
  var _logoutCheckP = null;
  function confirmReallyLoggedOut() {
    if (_logoutCheckP) return _logoutCheckP;
    _logoutCheckP = (async function () {
      try {
        var s = await window.besaSupabase.auth.getSession();
        if (s && s.data && s.data.session && s.data.session.user) return false;
      } catch (e) { /* */ }
      if (storedSessionLooksValid()) return false; // sessie in storage → niet uitloggen
      await new Promise(function (r) { setTimeout(r, 1500); });
      try {
        var s2 = await window.besaSupabase.auth.getSession();
        if (s2 && s2.data && s2.data.session && s2.data.session.user) return false;
      } catch (e) { /* */ }
      if (storedSessionLooksValid()) return false;
      return true; // geen sessie + geen bruikbare opgeslagen sessie = echt weg
    })();
    _logoutCheckP.then(function () { _logoutCheckP = null; }, function () { _logoutCheckP = null; });
    return _logoutCheckP;
  }

  // Stage 8d: globaal beschikbaar voor besa-sync-reporter en eventueel
  // andere modules die een verlopen sessie willen melden.
  window.besaHandleAuthFailure = function (err) {
    if (redirectInFlight) return;
    confirmReallyLoggedOut().then(function (really) {
      if (really) {
        try { console.warn("[auth-guard] sessie écht verlopen, ga uitloggen:", err); } catch (e) { /* */ }
        performLogoutAndRedirect({ reason: "expired" });
      } else {
        try { console.warn("[auth-guard] auth-fout maar sessie hersteld — NIET uitgelogd:", err); } catch (e) { /* */ }
      }
    });
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

  function getInitials(user) {
    if (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function") {
      try {
        var p = window.profilesDB.getCurrentSync();
        if (p) {
          var first = (p.voornaam || "").trim();
          var last = (p.achternaam || "").trim();
          if (first && last) return (first[0] + last[0]).toUpperCase();
          if (first) return first.slice(0, 2).toUpperCase();
        }
      } catch (e) { /* */ }
    }
    var email = (user && user.email) || "";
    if (!email) return "?";
    return email.slice(0, 2).toUpperCase();
  }

  function getFullName(user) {
    if (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function") {
      try {
        var p = window.profilesDB.getCurrentSync();
        if (p) {
          var first = (p.voornaam || "").trim();
          var last = (p.achternaam || "").trim();
          if (first || last) return (first + " " + last).trim();
        }
      } catch (e) { /* */ }
    }
    return (user && user.email) || "";
  }

  var dropdownOpen = false;

  function closeAvatarDropdown() {
    var dd = document.getElementById("besa-avatar-dropdown");
    if (dd) dd.remove();
    var avatar = document.getElementById("besa-avatar-btn");
    if (avatar) avatar.setAttribute("aria-expanded", "false");
    dropdownOpen = false;
  }

  function buildAvatarDropdown(user) {
    var dd = document.createElement("div");
    dd.id = "besa-avatar-dropdown";
    dd.setAttribute("role", "menu");
    dd.setAttribute("aria-label", "Gebruikersmenu");
    dd.style.cssText = [
      "position:absolute",
      "top:calc(100% + 8px)",
      "right:0",
      "min-width:240px",
      "background:var(--surface,#fff)",
      "border:1px solid var(--line)",
      "border-radius:var(--r-lg)",
      "box-shadow:0 8px 24px rgba(0,0,0,0.12)",
      "z-index:1000",
      "overflow:hidden",
    ].join(";");

    // Header met naam + email
    var header = document.createElement("div");
    header.style.cssText = "padding:14px 16px;border-bottom:1px solid var(--line);background:var(--surface-alt,#fafbfc)";
    var nameEl = document.createElement("div");
    nameEl.style.cssText = "font-size:14px;font-weight:600;color:var(--text);line-height:1.3";
    nameEl.textContent = getFullName(user) || "Gebruiker";
    var emailEl = document.createElement("div");
    emailEl.style.cssText = "font-size:12px;color:var(--text-muted);margin-top:2px";
    emailEl.textContent = user.email || "";
    header.appendChild(nameEl);
    header.appendChild(emailEl);
    dd.appendChild(header);

    // Mijn profiel link → instellingen.html (waar voornaam/achternaam beheerd worden)
    var profielLink = document.createElement("a");
    profielLink.href = "instellingen.html";
    profielLink.setAttribute("role", "menuitem");
    profielLink.style.cssText = "display:block;padding:10px 16px;color:var(--text);text-decoration:none;font-size:13px;transition:background 0.15s ease";
    profielLink.textContent = "Mijn profiel";
    profielLink.addEventListener("mouseover", function () { profielLink.style.background = "var(--surface-alt,#f7f8fa)"; });
    profielLink.addEventListener("mouseout", function () { profielLink.style.background = "transparent"; });
    dd.appendChild(profielLink);

    // Uitloggen knop met shortcut
    var logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.setAttribute("role", "menuitem");
    logoutBtn.style.cssText = "display:flex;justify-content:space-between;align-items:center;width:100%;padding:10px 16px;border:0;background:transparent;color:var(--text);font:inherit;font-size:13px;cursor:pointer;text-align:left;transition:background 0.15s ease";
    var lblSpan = document.createElement("span");
    lblSpan.textContent = "Uitloggen";
    var shortcutSpan = document.createElement("span");
    var isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || "");
    shortcutSpan.textContent = isMac ? "⇧⌘Q" : "Shift+Ctrl+Q";
    shortcutSpan.style.cssText = "color:var(--text-muted);font-size:11px;font-family:monospace";
    logoutBtn.appendChild(lblSpan);
    logoutBtn.appendChild(shortcutSpan);
    logoutBtn.addEventListener("mouseover", function () { logoutBtn.style.background = "var(--surface-alt,#f7f8fa)"; });
    logoutBtn.addEventListener("mouseout", function () { logoutBtn.style.background = "transparent"; });
    logoutBtn.addEventListener("click", function () {
      closeAvatarDropdown();
      performLogoutAndRedirect({ reason: "manual", preserveNext: false });
    });
    dd.appendChild(logoutBtn);

    return dd;
  }

  function avatarOutsideClick(e) {
    var avatar = document.getElementById("besa-auth-badge");
    if (avatar && !avatar.contains(e.target)) {
      closeAvatarDropdown();
    } else {
      document.addEventListener("click", avatarOutsideClick, { once: true });
    }
  }

  function injectUserBadge(user) {
    if (!user || !user.email) return;
    if (document.getElementById("besa-auth-badge")) return;

    var topbar = document.querySelector(".topbar");
    if (!topbar) return;

    var wrap = document.createElement("div");
    wrap.id = "besa-auth-badge";
    wrap.style.cssText = "position:relative;display:inline-flex;align-items:center;margin-left:auto;padding:0 14px";

    var avatarBtn = document.createElement("button");
    avatarBtn.type = "button";
    avatarBtn.id = "besa-avatar-btn";
    avatarBtn.title = user.email;
    avatarBtn.setAttribute("aria-label", "Gebruikersmenu " + (user.email || ""));
    avatarBtn.setAttribute("aria-haspopup", "menu");
    avatarBtn.setAttribute("aria-expanded", "false");
    avatarBtn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:36px",
      "height:36px",
      "border:0",
      "border-radius:var(--r-pill)",
      "background:var(--blue)",
      "color:#fff",
      "font-weight:700",
      "font-size:13px",
      "cursor:pointer",
      "transition:filter 0.15s ease",
    ].join(";");
    avatarBtn.textContent = getInitials(user);

    avatarBtn.addEventListener("mouseover", function () { avatarBtn.style.filter = "brightness(1.1)"; });
    avatarBtn.addEventListener("mouseout", function () { avatarBtn.style.filter = ""; });

    avatarBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (dropdownOpen) {
        closeAvatarDropdown();
      } else {
        var dd = buildAvatarDropdown(user);
        wrap.appendChild(dd);
        dropdownOpen = true;
        avatarBtn.setAttribute("aria-expanded", "true");
        setTimeout(function () {
          document.addEventListener("click", avatarOutsideClick, { once: true });
        }, 0);
      }
    });

    window.addEventListener("besa:profile-updated", function () {
      avatarBtn.textContent = getInitials(user);
      // Update dropdown header if open
      var dd = document.getElementById("besa-avatar-dropdown");
      if (dd) {
        var nameEl = dd.querySelector("div div");
        if (nameEl) nameEl.textContent = getFullName(user) || "Gebruiker";
      }
    });

    wrap.appendChild(avatarBtn);
    topbar.appendChild(wrap);

    // Keyboard shortcut: Shift+Cmd+Q (Mac) / Shift+Ctrl+Q (Win/Linux) → logout
    document.addEventListener("keydown", function (e) {
      var key = (e.key || "").toLowerCase();
      var mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform || "") ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && key === "q") {
        e.preventDefault();
        closeAvatarDropdown();
        performLogoutAndRedirect({ reason: "manual", preserveNext: false });
      }
    });

    // Escape sluit dropdown
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dropdownOpen) {
        closeAvatarDropdown();
      }
    });
  }

  function listenForAuthChange() {
    try {
      window.besaSupabase.auth.onAuthStateChange(function (event, session) {
        // Alleen reageren op een ECHTE SIGNED_OUT (niet op transiënte
        // null-sessie-events tijdens een token-refresh — die clause gaf
        // willekeurig uitloggen + flikker). En zelfs SIGNED_OUT eerst
        // verifiëren: een mislukte refresh emit SIGNED_OUT, maar een
        // expliciete refresh kan de sessie alsnog herstellen.
        if (event !== "SIGNED_OUT" || redirectInFlight) return;
        confirmReallyLoggedOut().then(function (really) {
          if (really) performLogoutAndRedirect({ reason: "expired" });
          else { try { console.warn("[auth-guard] SIGNED_OUT maar sessie hersteld — NIET uitgelogd"); } catch (e) {} }
        });
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
        // Niet meteen uitloggen bij een lege getSession — eerst een
        // refresh-poging via confirmReallyLoggedOut (refresh-race-proof).
        if (await confirmReallyLoggedOut()) {
          performLogoutAndRedirect({ reason: "expired" });
        }
      } catch (e) {
        /* netwerk-hapering: NIET uitloggen, volgende focus/visibility
           probeert het opnieuw. */
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
      // getSession kan bij page-init transient null geven door de
      // Supabase-hydratie/navigator-lock-race terwijl er wél een geldige
      // sessie in localStorage staat (bewezen root cause op /rollen).
      // confirmReallyLoggedOut() checkt nu OOK de opgeslagen sessie →
      // alleen ECHT weg = redirect. Anders: NIET redirecten, sessie
      // afwachten (Supabase hydrateert/ververst zelf).
      var really = await confirmReallyLoggedOut();
      if (really) {
        redirectInFlight = true;
        try { window.location.replace(buildLoginUrl()); }
        catch (e) { window.location.href = buildLoginUrl(); }
        return;
      }
      // Niet uitgelogd: poll getSession enkele keren voor de badge,
      // maar redirect NOOIT (de sessie staat in storage).
      for (var attempt = 0; attempt < 16 && (!session || !session.user); attempt += 1) {
        await new Promise(function (r) { setTimeout(r, 350); });
        try {
          var resN = await window.besaSupabase.auth.getSession();
          session = resN && resN.data ? resN.data.session : null;
        } catch (e) { /* */ }
      }
    }

    if (session && session.user) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { injectUserBadge(session.user); });
      } else {
        injectUserBadge(session.user);
      }
    }
    listenForAuthChange();
    attachVisibilityChecks();
    attachIdleTimeout();  // Fase E.12 — session-timeout idle-detector
  })();

  // =================================================================
  // Fase E.12 — Session-timeout idle-detector
  // =================================================================
  //
  // Logt user uit na X minuten inactiviteit. Spiegelt BS2-gedrag.
  // Default: 30 minuten (user-keuze #23 "zoals BS2").
  //
  // Detect activity: mousemove, keydown, click, scroll, touchstart.
  // Throttled tot 1× per 30s om CPU te sparen.
  function attachIdleTimeout() {
    var IDLE_MINUTES = 30;
    var IDLE_MS = IDLE_MINUTES * 60 * 1000;
    var WARNING_MS = IDLE_MS - 60 * 1000;  // 1 min vóór logout
    var lastActivityAt = Date.now();
    var warningShown = false;
    var warningEl = null;
    var idleCheckTimer = null;
    var throttleMs = 30000;
    var lastResetAt = 0;

    function resetIdleTimer() {
      var now = Date.now();
      if (now - lastResetAt < throttleMs) return;  // throttle
      lastResetAt = now;
      lastActivityAt = now;
      if (warningShown && warningEl) {
        warningEl.remove();
        warningShown = false;
        warningEl = null;
      }
    }

    function showWarning(secondsLeft) {
      if (warningShown) return;
      warningShown = true;
      warningEl = document.createElement("div");
      warningEl.id = "besa-idle-warning";
      warningEl.style.cssText = "position:fixed;top:20px;right:20px;background:var(--yellow-soft,#fef9c3);color:var(--text,#1a1a1a);" +
        "padding:14px 18px;border-radius:var(--r-md,8px);box-shadow:0 6px 24px rgba(0,0,0,0.18);" +
        "z-index:99999;font-family:var(--font-base,sans-serif);font-size:13px;max-width:320px;" +
        "border-left:3px solid var(--yellow,#facc15);";
      warningEl.innerHTML = '<strong>Sessie verloopt bijna</strong><br>' +
        '<span id="besa-idle-countdown">Je wordt over ' + secondsLeft + ' seconden uitgelogd.</span><br>' +
        '<span style="color:var(--text-muted,#666);font-size:12px;">Beweeg muis of toets om te blijven ingelogd.</span>';
      document.body.appendChild(warningEl);
    }

    function checkIdle() {
      var now = Date.now();
      var elapsed = now - lastActivityAt;
      if (elapsed >= IDLE_MS) {
        // Force logout
        console.info("[auth-guard] Session-timeout: idle " + (elapsed / 1000).toFixed(0) + "s, force logout");
        if (warningEl) warningEl.remove();
        try {
          if (global.besaAuth && typeof global.besaAuth.signOut === "function") {
            global.besaAuth.signOut().finally(function () { window.location.replace(buildLoginUrl() + "&idle=1"); });
          } else {
            window.location.replace(buildLoginUrl() + "&idle=1");
          }
        } catch (e) { window.location.href = buildLoginUrl() + "&idle=1"; }
      } else if (elapsed >= WARNING_MS) {
        var secondsLeft = Math.max(0, Math.ceil((IDLE_MS - elapsed) / 1000));
        if (!warningShown) showWarning(secondsLeft);
        else {
          var cd = document.getElementById("besa-idle-countdown");
          if (cd) cd.textContent = "Je wordt over " + secondsLeft + " seconden uitgelogd.";
        }
      }
    }

    ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(function (evt) {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    // Check every 10s
    idleCheckTimer = setInterval(checkIdle, 10000);
  }
})();
