/* global window, document */
/**
 * helpdesk-modal.js — Fase G.8 — Helpdesk-modal voor topbar Help-button
 *
 * Per user-keuze #27 + Module 36: topbar Help-button → modal met admin-contactinfo.
 * Configureerbaar via `public.helpdesk_settings` tabel (1 row singleton).
 *
 * BS1 verstuurt zelf niets — mailto opent user's eigen mail-client.
 */
(function (global) {
  "use strict";

  var modalEl = null;
  var settings = null;

  async function loadSettings() {
    if (!global.ffSupabase) return null;
    var res = await global.ffSupabase.from("helpdesk_settings").select("*").limit(1).maybeSingle();
    return res.data || null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function buildModal() {
    var s = settings || {};
    var beschrijving = s.beschrijving || "Hulp nodig? Neem contact op met je admin/eigenaar/directeur.";
    var tel = s.telefoonnummer || "";
    var email = s.email_adres || "";

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "ff-helpdesk-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99997;" +
      "align-items:center;justify-content:center;";

    var dialog = document.createElement("div");
    dialog.style.cssText = "background:var(--surface,#fff);border-radius:var(--r-xl,16px);" +
      "max-width:440px;width:90%;padding:0;box-shadow:0 12px 48px rgba(0,0,0,0.24);";

    dialog.innerHTML = '' +
      '<div class="modal-header" style="padding:18px 22px;border-bottom:1px solid var(--line,#e5e7eb);display:flex;align-items:center;justify-content:space-between;">' +
        '<h2 style="margin:0;font-size:17px;color:var(--text,#1a1a1a);">Hulp nodig?</h2>' +
        '<button type="button" id="ff-helpdesk-close" aria-label="Sluiten" style="background:none;border:0;font-size:22px;cursor:pointer;color:var(--text-muted,#666);line-height:1;">&times;</button>' +
      '</div>' +
      '<div class="modal-body" style="padding:18px 22px;color:var(--text,#1a1a1a);">' +
        '<p style="margin:0 0 14px;color:var(--text-secondary,#444);">' + escapeHtml(beschrijving) + '</p>' +
        (tel ? '<p style="margin:6px 0;"><strong>Telefoon:</strong> <a href="tel:' + escapeHtml(tel.replace(/[^+\d]/g, "")) + '" style="color:var(--blue);">' + escapeHtml(tel) + '</a></p>' : "") +
        (email ? '<p style="margin:6px 0;"><strong>E-mail:</strong> <a href="mailto:' + escapeHtml(email) + '" style="color:var(--blue);">' + escapeHtml(email) + '</a></p>' : "") +
        '<p style="margin-top:14px;color:var(--text-muted,#666);font-size:12px;">' +
          'BS1 verstuurt zelf geen e-mails. De mailto-link opent jouw eigen mail-client.' +
        '</p>' +
      '</div>';

    overlay.appendChild(dialog);
    return overlay;
  }

  function show() {
    if (modalEl) return;  // al open
    if (!settings) {
      // Try lazy-load
      loadSettings().then(function (s) { settings = s || {}; show(); });
      return;
    }
    modalEl = buildModal();
    document.body.appendChild(modalEl);

    var closeBtn = document.getElementById("ff-helpdesk-close");
    if (closeBtn) closeBtn.addEventListener("click", close);
    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) close();
    });
    document.addEventListener("keydown", escapeHandler);
  }

  function close() {
    document.removeEventListener("keydown", escapeHandler);
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
    }
  }

  function escapeHandler(e) {
    if (e.key === "Escape") close();
  }

  function wireHelpButton() {
    var btn = document.querySelector('button[aria-label="Help"]');
    if (!btn) return;
    if (btn.dataset.ffHelpdeskWired === "1") return;
    btn.dataset.ffHelpdeskWired = "1";
    btn.addEventListener("click", show);
  }

  function init() {
    // Pre-load settings async
    loadSettings().then(function (s) { settings = s || {}; });
    // Wire Help-button (mogelijk nog niet in DOM bij script-load)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireHelpButton);
    } else {
      wireHelpButton();
    }
    // Re-wire na 1.5s voor pages die topbar later injecteren
    setTimeout(wireHelpButton, 1500);
  }

  global.ffHelpdesk = {
    show: show,
    close: close,
    reloadSettings: function () { return loadSettings().then(function (s) { settings = s || {}; }); },
  };

  init();
})(typeof window !== "undefined" ? window : this);
