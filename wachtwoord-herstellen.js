/* global window, document */
/**
 * wachtwoord-herstellen.js — Landingspagina voor de "wachtwoord vergeten"-mail.
 *
 * Flow:
 *  1. Gebruiker klikt op login.html → "Wachtwoord vergeten?" → vult e-mail in.
 *     Supabase verstuurt een reset-mail (resetPasswordForEmail) met een link
 *     die hierheen wijst (redirectTo = <origin>/wachtwoord-herstellen).
 *  2. supabase-client.js heeft detectSessionInUrl:true, dus de recovery-token
 *     in de URL-hash wordt automatisch omgezet naar een tijdelijke sessie en
 *     onAuthStateChange vuurt het event "PASSWORD_RECOVERY".
 *  3. Deze pagina toont dan een formulier; bij submit zetten we het nieuwe
 *     wachtwoord via auth.updateUser({ password }). Daarna loggen we uit en
 *     sturen we terug naar login.html.
 *
 * Geen auth-guard / onboarding-flow op deze pagina: het is — net als
 * login.html — een losse auth-pagina die de Supabase-client direct gebruikt.
 * De gebruiker is tijdens deze flow alleen "recovery-geauthenticeerd"; we
 * sturen hem na het opslaan bewust terug naar de normale login.
 */
(function () {
  "use strict";

  var sub = document.getElementById("pw-sub");
  var checking = document.getElementById("pw-checking");
  var form = document.getElementById("pw-form");
  var invalid = document.getElementById("pw-invalid");
  var newEl = document.getElementById("pw-new");
  var confirmEl = document.getElementById("pw-confirm");
  var submitBtn = document.getElementById("pw-submit");
  var errEl = document.getElementById("pw-error");
  var okEl = document.getElementById("pw-ok");

  var MIN_LEN = 8;
  var resolved = false; // voorkomt dubbele toestand-wissels

  function showError(msg) {
    okEl.hidden = true;
    errEl.textContent = msg || "Onbekende fout";
    errEl.hidden = false;
  }
  function clearMsg() {
    errEl.hidden = true;
    errEl.textContent = "";
    okEl.hidden = true;
    okEl.textContent = "";
  }
  function showOk(msg) {
    errEl.hidden = true;
    okEl.textContent = msg || "";
    okEl.hidden = false;
  }

  function showForm() {
    if (resolved) return;
    resolved = true;
    checking.hidden = true;
    invalid.hidden = true;
    form.hidden = false;
    setTimeout(function () { try { newEl.focus(); } catch (e) { /* */ } }, 50);
  }

  function showInvalid() {
    if (resolved) return;
    resolved = true;
    checking.hidden = true;
    form.hidden = true;
    sub.hidden = true;
    invalid.hidden = false;
  }

  // ---- URL-hash inspecteren -------------------------------------------------
  // Bij een verlopen/ongeldige link zet Supabase een #error=...&error_code=...
  // in de hash i.p.v. een token. Die willen we netjes opvangen.
  function hashHasError() {
    try {
      var h = window.location.hash || "";
      if (h.charAt(0) === "#") h = h.slice(1);
      var p = new URLSearchParams(h);
      return !!(p.get("error") || p.get("error_code") || p.get("error_description"));
    } catch (e) { return false; }
  }
  function hashHasRecoveryToken() {
    try {
      var h = window.location.hash || "";
      if (h.charAt(0) === "#") h = h.slice(1);
      var p = new URLSearchParams(h);
      // Implicit flow: #access_token=...&type=recovery
      // PKCE flow: ?code=... (in de query) — door supabase-js afgehandeld
      return !!p.get("access_token") || !!p.get("code");
    } catch (e) { return false; }
  }
  function queryHasCode() {
    try {
      var p = new URLSearchParams(window.location.search || "");
      return !!p.get("code");
    } catch (e) { return false; }
  }

  // ---- Hoofd-flow -----------------------------------------------------------
  (async function init() {
    if (!window.besaSupabase) {
      showInvalid();
      return;
    }

    // Direct foutieve link? (verlopen token e.d.) → toon meteen "ongeldig".
    if (hashHasError()) {
      showInvalid();
      return;
    }

    // Luister op het PASSWORD_RECOVERY-event: supabase-js verwerkt de
    // recovery-hash automatisch (detectSessionInUrl) en vuurt dit event zodra
    // de tijdelijke sessie staat.
    try {
      window.besaSupabase.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
          showForm();
        }
      });
    } catch (e) { /* val terug op de poll hieronder */ }

    // Vangnet: het event kan al gevuurd zijn vóór onze listener stond, of de
    // sessie is al hersteld door de rehydratie-guard. Pollen we kort op een
    // bestaande sessie. Is er na de wachttijd geen sessie én geen token in de
    // URL, dan is de link ongeldig/afwezig.
    var hadToken = hashHasRecoveryToken() || queryHasCode();
    var tries = 0;
    var maxTries = hadToken ? 25 : 6; // ~5s bij token, ~1,2s zonder
    (function poll() {
      if (resolved) return;
      window.besaSupabase.auth.getSession().then(function (res) {
        if (resolved) return;
        if (res && res.data && res.data.session) {
          showForm();
          return;
        }
        tries++;
        if (tries >= maxTries) {
          showInvalid();
          return;
        }
        setTimeout(poll, 200);
      }).catch(function () {
        if (resolved) return;
        tries++;
        if (tries >= maxTries) { showInvalid(); return; }
        setTimeout(poll, 200);
      });
    })();
  })();

  // ---- Submit: nieuw wachtwoord opslaan -------------------------------------
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearMsg();

    var pw = String(newEl.value || "");
    var pw2 = String(confirmEl.value || "");

    if (pw.length < MIN_LEN) {
      showError("Kies een wachtwoord van minimaal " + MIN_LEN + " tekens.");
      newEl.focus();
      return;
    }
    if (pw !== pw2) {
      showError("De twee wachtwoorden komen niet overeen.");
      confirmEl.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Bezig met opslaan…";

    try {
      var res = await window.besaSupabase.auth.updateUser({ password: pw });
      if (res.error) {
        var msg = res.error.message || "Wachtwoord opslaan mislukt.";
        if (/should be different|same.*password/i.test(msg)) {
          msg = "Kies een ander wachtwoord dan je vorige.";
        } else if (/at least|minimum|weak|short/i.test(msg)) {
          msg = "Dit wachtwoord is te zwak of te kort. Kies een sterker wachtwoord.";
        } else if (/session|expired|missing/i.test(msg)) {
          msg = "De herstel-link is verlopen. Vraag op de inlogpagina een nieuwe aan.";
        }
        showError(msg);
        submitBtn.disabled = false;
        submitBtn.textContent = "Wachtwoord opslaan";
        return;
      }

      // Best-effort: als dit account nog een verplichte wachtwoord-wijziging
      // open had staan (na een admin-reset), is die nu vervuld. Niet blokkeren
      // als het faalt — de wachtwoord-wijziging zelf is al geslaagd.
      try {
        var u = res.data && res.data.user;
        if (u && u.id) {
          await window.besaSupabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", u.id);
        }
      } catch (e2) { /* niet kritiek */ }

      // Recovery-sessie afsluiten zodat de gebruiker bewust opnieuw inlogt met
      // het nieuwe wachtwoord (en de normale auth-guard/onboarding-flow draait).
      try { window.localStorage.setItem("besa-logout", "1"); } catch (e3) { /* */ }
      try { await window.besaSupabase.auth.signOut(); } catch (e4) { /* */ }

      form.hidden = true;
      sub.hidden = true;
      showOk("Je wachtwoord is gewijzigd. Je wordt naar de inlogpagina gestuurd…");
      setTimeout(function () { window.location.replace("login.html"); }, 1800);
    } catch (err) {
      showError(err && err.message ? err.message : "Er ging iets mis bij het opslaan.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Wachtwoord opslaan";
    }
  });
})();
