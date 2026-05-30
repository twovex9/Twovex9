/* global window, document */
/**
 * onboarding-flow.js — Fase G.3 + G.4 — First-login wachtwoord + 2FA enrollment
 *
 * Per user-keuze: bulk-onboarding zet `must_change_password=true` en
 * `must_setup_2fa=true` op nieuwe profielen. Na eerste login:
 * 1. Forceer wachtwoord-wijziging (G.3)
 * 2. Forceer 2FA enrollment (G.4)
 *
 * Werking:
 *   - Hook na auth-guard sessie-check
 *   - Query profile.must_change_password + must_setup_2fa
 *   - Toon blocking modal in juiste volgorde
 *   - Submit → updateUser/MFA enroll → UPDATE flag false
 */
(function (global) {
  "use strict";

  var BLOCKED_FLAG = "besa-onboarding-blocked";

  async function getProfileFlags() {
    if (!global.besaSupabase) return null;
    var user = await global.besaSupabase.auth.getUser();
    if (!user || !user.data || !user.data.user) return null;
    var res = await global.besaSupabase
      .from("profiles")
      .select("must_change_password, must_setup_2fa")
      .eq("id", user.data.user.id)
      .maybeSingle();
    return res.data || null;
  }

  function buildOverlay() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "besa-onboarding-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;" +
      "align-items:center;justify-content:center;";

    var dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--surface,#fff);border-radius:var(--r-xl,16px);" +
      "max-width:480px;width:90%;padding:0;box-shadow:0 12px 48px rgba(0,0,0,0.28);";
    overlay.appendChild(dialog);
    return { overlay: overlay, dialog: dialog };
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // -------- G.3 — Password change modal --------
  async function showPasswordModal() {
    var built = buildOverlay();
    var dialog = built.dialog;
    dialog.innerHTML = '' +
      '<div style="padding:22px 26px;border-bottom:1px solid var(--line,#e5e7eb);">' +
        '<h2 style="margin:0;font-size:19px;color:var(--text,#1a1a1a);">Welkom! Kies een nieuw wachtwoord</h2>' +
        '<p style="margin:8px 0 0;color:var(--text-secondary,#444);font-size:13px;">Voor je BS1 kunt gebruiken, moet je een eigen wachtwoord kiezen.</p>' +
      '</div>' +
      '<form id="besa-onb-pw-form" style="padding:22px 26px;display:flex;flex-direction:column;gap:14px;">' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">' +
          'Nieuw wachtwoord' +
          '<input type="password" id="besa-onb-pw1" autocomplete="new-password" required minlength="8" style="padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);font:inherit;">' +
        '</label>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">' +
          'Bevestig wachtwoord' +
          '<input type="password" id="besa-onb-pw2" autocomplete="new-password" required minlength="8" style="padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);font:inherit;">' +
        '</label>' +
        '<p style="margin:0;color:var(--text-muted,#666);font-size:12px;">Minimaal 8 tekens, 1 cijfer, 1 hoofdletter.</p>' +
        '<p id="besa-onb-pw-err" style="margin:0;color:var(--red);font-size:13px;display:none;"></p>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:6px;">' +
          '<button type="submit" class="btn-primary" id="besa-onb-pw-submit">Wachtwoord opslaan</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(built.overlay);

    return new Promise(function (resolve, reject) {
      document.getElementById("besa-onb-pw-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var pw1 = document.getElementById("besa-onb-pw1").value;
        var pw2 = document.getElementById("besa-onb-pw2").value;
        var errEl = document.getElementById("besa-onb-pw-err");
        var submitBtn = document.getElementById("besa-onb-pw-submit");
        errEl.style.display = "none";

        if (pw1 !== pw2) { errEl.textContent = "Wachtwoorden komen niet overeen."; errEl.style.display = "block"; return; }
        if (pw1.length < 8) { errEl.textContent = "Minimaal 8 tekens."; errEl.style.display = "block"; return; }
        if (!/[A-Z]/.test(pw1)) { errEl.textContent = "Minimaal 1 hoofdletter vereist."; errEl.style.display = "block"; return; }
        if (!/\d/.test(pw1)) { errEl.textContent = "Minimaal 1 cijfer vereist."; errEl.style.display = "block"; return; }

        submitBtn.disabled = true;
        submitBtn.textContent = "Opslaan…";
        try {
          var upd = await global.besaSupabase.auth.updateUser({ password: pw1 });
          if (upd.error) throw upd.error;
          var user = await global.besaSupabase.auth.getUser();
          await global.besaSupabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", user.data.user.id);
          built.overlay.remove();
          resolve(true);
        } catch (err) {
          errEl.textContent = "Fout: " + (err.message || err);
          errEl.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Wachtwoord opslaan";
        }
      });
    });
  }

  // -------- G.4 — 2FA enrollment modal --------
  async function show2faModal() {
    var built = buildOverlay();
    var dialog = built.dialog;
    dialog.innerHTML = '' +
      '<div style="padding:22px 26px;border-bottom:1px solid var(--line,#e5e7eb);">' +
        '<h2 style="margin:0;font-size:19px;color:var(--text,#1a1a1a);">Beveilig je account met 2FA</h2>' +
        '<p style="margin:8px 0 0;color:var(--text-secondary,#444);font-size:13px;">Scan de QR-code met een authenticator-app (Google Authenticator, Microsoft Authenticator, Authy).</p>' +
      '</div>' +
      '<div style="padding:22px 26px;display:flex;flex-direction:column;gap:14px;">' +
        // Pure #FFFFFF achtergrond verplicht — camera-scanners falen op off-white (#f7f7f7) bij lage contrast.
        '<div id="besa-onb-2fa-qr" style="display:flex;justify-content:center;background:#FFFFFF;padding:20px;border-radius:var(--r-md);min-height:240px;align-items:center;border:1px solid var(--line,#e5e7eb);">Bezig met laden…</div>' +
        '<p id="besa-onb-2fa-secret" style="margin:0;text-align:center;font-family:monospace;font-size:11px;color:var(--text-muted);"></p>' +
        '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">' +
          'Vul 6-cijferige code in' +
          '<input type="text" id="besa-onb-2fa-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required style="padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);font:inherit;letter-spacing:2px;text-align:center;font-size:18px;">' +
        '</label>' +
        '<p id="besa-onb-2fa-err" style="margin:0;color:var(--red);font-size:13px;display:none;"></p>' +
        '<div style="display:flex;justify-content:flex-end;">' +
          '<button type="button" class="btn-primary" id="besa-onb-2fa-submit">Activeer 2FA</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(built.overlay);

    var enrollData = null;
    try {
      // issuer = de label die in de authenticator-app boven de 6-cijfer-code staat.
      // Zonder dit valt Supabase terug op de Site URL (vaak "localhost:3000" in dev).
      // friendlyName = interne label in Supabase admin (geen invloed op de authenticator).
      var en = await global.besaSupabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Future Flow",
        friendlyName: "Future Flow",
      });
      if (en.error) throw en.error;
      enrollData = en.data;
      var qrEl = document.getElementById("besa-onb-2fa-qr");
      // Bug #75 fix: Supabase JS v2 retourneert `totp.qr_code` als raw SVG XML (geen data: URI).
      // Stoppen in `<img src="<svg...">` breekt de img + rendert SVG als sibling zonder viewBox/wit-bg → camera scant niet.
      // Detecteer formaat, voeg expliciete viewBox toe als die ontbreekt, render binnen pure-witte wrapper.
      var qrCode = enrollData.totp.qr_code || "";
      qrEl.innerHTML = "";
      var qrInner = document.createElement("div");
      qrInner.style.cssText = "background:#FFFFFF;padding:12px;display:inline-block;line-height:0;";
      if (qrCode.indexOf("data:image") === 0) {
        // Data URI — gebruik <img>
        var img = document.createElement("img");
        img.src = qrCode;
        img.alt = "QR code voor 2FA";
        img.style.cssText = "display:block;width:200px;height:200px;";
        qrInner.appendChild(img);
      } else if (qrCode.indexOf("<svg") !== -1) {
        // Raw SVG XML — insert direct, normaliseer attributen voor scanability
        qrInner.innerHTML = qrCode;
        var svgEl = qrInner.querySelector("svg");
        if (svgEl) {
          var sW = parseFloat(svgEl.getAttribute("width") || "200");
          var sH = parseFloat(svgEl.getAttribute("height") || sW);
          if (!svgEl.getAttribute("viewBox")) {
            svgEl.setAttribute("viewBox", "0 0 " + sW + " " + sH);
          }
          // Force witte achtergrond ALS eerste child (quiet zone garantie)
          if (!svgEl.querySelector("rect[data-qr-bg]")) {
            var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            bg.setAttribute("data-qr-bg", "1");
            bg.setAttribute("x", "0");
            bg.setAttribute("y", "0");
            bg.setAttribute("width", String(sW));
            bg.setAttribute("height", String(sH));
            bg.setAttribute("fill", "#FFFFFF");
            svgEl.insertBefore(bg, svgEl.firstChild);
          }
          // Schaal SVG naar 200x200 voor consistente scan-grootte
          svgEl.setAttribute("width", "200");
          svgEl.setAttribute("height", "200");
          svgEl.style.display = "block";
        }
      } else {
        qrInner.textContent = "QR-code-formaat niet herkend. Gebruik de handmatige code hieronder.";
      }
      qrEl.appendChild(qrInner);
      var secEl = document.getElementById("besa-onb-2fa-secret");
      secEl.textContent = "Of voer handmatig in: " + enrollData.totp.secret;
    } catch (err) {
      document.getElementById("besa-onb-2fa-qr").textContent = "Fout bij genereren QR: " + (err.message || err);
    }

    return new Promise(function (resolve) {
      document.getElementById("besa-onb-2fa-submit").addEventListener("click", async function () {
        var code = document.getElementById("besa-onb-2fa-code").value.trim();
        var errEl = document.getElementById("besa-onb-2fa-err");
        var btn = document.getElementById("besa-onb-2fa-submit");
        errEl.style.display = "none";
        if (!/^\d{6}$/.test(code)) { errEl.textContent = "Voer 6 cijfers in."; errEl.style.display = "block"; return; }
        if (!enrollData) { errEl.textContent = "Enrollment data ontbreekt."; errEl.style.display = "block"; return; }

        btn.disabled = true; btn.textContent = "Verifieren…";
        try {
          var ch = await global.besaSupabase.auth.mfa.challenge({ factorId: enrollData.id });
          if (ch.error) throw ch.error;
          var ver = await global.besaSupabase.auth.mfa.verify({
            factorId: enrollData.id,
            challengeId: ch.data.id,
            code: code,
          });
          if (ver.error) throw ver.error;
          var user = await global.besaSupabase.auth.getUser();
          await global.besaSupabase
            .from("profiles")
            .update({ must_setup_2fa: false })
            .eq("id", user.data.user.id);
          built.overlay.remove();
          resolve(true);
        } catch (err) {
          errEl.textContent = "Verificatie mislukt: " + (err.message || err);
          errEl.style.display = "block";
          btn.disabled = false; btn.textContent = "Activeer 2FA";
        }
      });
    });
  }

  async function checkAndRun() {
    if (window[BLOCKED_FLAG]) return;
    var flags = await getProfileFlags();
    if (!flags) return;  // niet ingelogd of profile niet gevonden
    if (!flags.must_change_password && !flags.must_setup_2fa) return;

    window[BLOCKED_FLAG] = true;
    try {
      if (flags.must_change_password) {
        await showPasswordModal();
      }
      // Re-fetch flags na password-update
      var flags2 = await getProfileFlags();
      if (flags2 && flags2.must_setup_2fa) {
        await show2faModal();
      }
    } catch (e) {
      console.error("[onboarding-flow] error:", e);
    } finally {
      window[BLOCKED_FLAG] = false;
    }
  }

  function init() {
    // Wacht tot auth-guard sessie heeft + Supabase + profilesDB klaar
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { setTimeout(checkAndRun, 2000); });
    } else {
      setTimeout(checkAndRun, 2000);
    }
  }

  global.besaOnboarding = {
    check: checkAndRun,
    showPasswordModal: showPasswordModal,
    show2faModal: show2faModal,
  };

  init();
})(typeof window !== "undefined" ? window : this);
