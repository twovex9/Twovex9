/* global window, document */
/**
 * mfa-challenge.js — Bug #79 fix
 *
 * Forceer 2FA-challenge bij élke pagina-load wanneer:
 *   currentAAL === "aal1"  (alleen-password sessie)
 *   nextAAL    === "aal2"  (user heeft een verified TOTP factor)
 *
 * Zonder dit kan een Medewerker na enrollment inloggen met
 * alleen wachtwoord — user-keuze #20 ("2FA verplicht voor iedereen")
 * is dan inactief.
 *
 * Werking:
 *   - Loadt op alle pagina's (NA auth-guard, onboarding-flow).
 *   - 500ms na DOMContentLoaded: getAuthenticatorAssuranceLevel()
 *   - AAL upgrade nodig → blocking modal met 6-cijfer-code input
 *   - Submit → mfa.challenge + mfa.verify → upgrade sessie naar aal2
 *   - Uitloggen-knop → signOut + redirect naar login
 */
(function (global) {
  "use strict";

  var CHECKED_FLAG = "besa-mfa-challenge-running";

  async function getAAL() {
    if (!global.besaSupabase) return null;
    try {
      var res = await global.besaSupabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return res.data || null;
    } catch (e) {
      return null;
    }
  }

  async function getVerifiedTotpFactor() {
    if (!global.besaSupabase) return null;
    try {
      var res = await global.besaSupabase.auth.mfa.listFactors();
      if (res.error || !res.data) return null;
      var totp = (res.data.totp || []).find(function (f) { return f.status === "verified"; });
      return totp || null;
    } catch (e) {
      return null;
    }
  }

  function buildOverlay() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "besa-mfa-challenge-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;" +
      "align-items:center;justify-content:center;";

    var dialog = document.createElement("div");
    dialog.style.cssText =
      "background:var(--surface,#fff);border-radius:var(--r-xl,16px);max-width:420px;width:90%;padding:0;" +
      "box-shadow:0 12px 48px rgba(0,0,0,0.28);";
    overlay.appendChild(dialog);
    return { overlay: overlay, dialog: dialog };
  }

  function showChallengeModal(factor) {
    var built = buildOverlay();
    built.dialog.innerHTML = "" +
      '<div style="padding:22px 26px;border-bottom:1px solid var(--line,#e5e7eb);">' +
        '<h2 style="margin:0;font-size:19px;color:var(--text,#1a1a1a);">Voer 2FA-code in</h2>' +
        '<p style="margin:8px 0 0;color:var(--text-secondary,#444);font-size:13px;">' +
          'Open je authenticator-app en voer de 6-cijferige code in voor BESA Suite ETF.' +
        '</p>' +
      '</div>' +
      '<div style="padding:22px 26px;display:flex;flex-direction:column;gap:14px;">' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">' +
          '6-cijferige code' +
          '<input type="text" id="besa-mfa-ch-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" required ' +
            'style="padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);font:inherit;letter-spacing:3px;text-align:center;font-size:20px;">' +
        '</label>' +
        '<p id="besa-mfa-ch-err" style="margin:0;color:var(--red);font-size:13px;display:none;"></p>' +
        '<div style="display:flex;gap:8px;justify-content:space-between;align-items:center;">' +
          '<button type="button" class="btn-outline" id="besa-mfa-ch-logout">Uitloggen</button>' +
          '<button type="button" class="btn-primary" id="besa-mfa-ch-submit">Verifieer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(built.overlay);

    // Auto-focus input
    setTimeout(function () {
      var input = document.getElementById("besa-mfa-ch-code");
      if (input) input.focus();
    }, 80);

    return new Promise(function (resolve) {
      var submitBtn = document.getElementById("besa-mfa-ch-submit");
      var input = document.getElementById("besa-mfa-ch-code");
      var errEl = document.getElementById("besa-mfa-ch-err");
      var logoutBtn = document.getElementById("besa-mfa-ch-logout");

      async function doVerify() {
        var code = String(input.value || "").trim();
        errEl.style.display = "none";
        if (!/^\d{6}$/.test(code)) {
          errEl.textContent = "Voer 6 cijfers in.";
          errEl.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "Verifieren…";
        try {
          var ch = await global.besaSupabase.auth.mfa.challenge({ factorId: factor.id });
          if (ch.error) throw ch.error;
          var ver = await global.besaSupabase.auth.mfa.verify({
            factorId: factor.id,
            challengeId: ch.data.id,
            code: code,
          });
          if (ver.error) throw ver.error;
          built.overlay.remove();
          resolve(true);
        } catch (err) {
          errEl.textContent = "Code onjuist of verlopen. Probeer opnieuw.";
          errEl.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Verifieer";
          input.value = "";
          input.focus();
        }
      }

      submitBtn.addEventListener("click", doVerify);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); doVerify(); }
      });
      logoutBtn.addEventListener("click", async function () {
        try { await global.besaSupabase.auth.signOut(); } catch (e) { /* ignore */ }
        try { if (global.clearLocalCaches) global.clearLocalCaches(); } catch (e) { /* */ }
        window.location.replace("login.html");
      });
    });
  }

  async function checkAndChallenge() {
    if (window[CHECKED_FLAG]) return;
    window[CHECKED_FLAG] = true;
    try {
      var aal = await getAAL();
      if (!aal) return; // niet ingelogd
      // currentLevel = wat we hebben, nextLevel = wat haalbaar is (factor enrolled)
      if (aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
        var factor = await getVerifiedTotpFactor();
        if (factor) {
          await showChallengeModal(factor);
        }
      }
    } catch (e) {
      console.error("[mfa-challenge] error:", e);
    } finally {
      window[CHECKED_FLAG] = false;
    }
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        setTimeout(checkAndChallenge, 500);
      });
    } else {
      setTimeout(checkAndChallenge, 500);
    }
  }

  global.besaMfaChallenge = { check: checkAndChallenge };

  init();
})(typeof window !== "undefined" ? window : this);
