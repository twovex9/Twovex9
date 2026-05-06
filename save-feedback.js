/* Gecentreerde bevestiging na opslaan — huisstijl (.modal-overlay + .cl-add-dialog) */
(function (w) {
  "use strict";

  var BOUND = false;
  var AUTO_MS = 2000;
  var _autoCloseId = null;

  function clearAutoClose() {
    if (_autoCloseId == null) return;
    w.clearTimeout(_autoCloseId);
    _autoCloseId = null;
  }

  function el(id) {
    return w.document.getElementById(id);
  }

  function closeModal() {
    clearAutoClose();
    var m = el("app-save-feedback-modal");
    if (!m) return;
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
  }

  function bindOnce() {
    if (BOUND) return;
    var m = el("app-save-feedback-modal");
    if (!m) return;
    BOUND = true;
    var onClose = function (e) {
      e.preventDefault();
      closeModal();
    };
    el("app-save-feedback-x") && el("app-save-feedback-x").addEventListener("click", onClose);
    m.addEventListener("click", function (e) {
      if (e.target === m) onClose(e);
    });
    w.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && m && !m.hasAttribute("hidden")) {
        e.preventDefault();
        closeModal();
      }
    });
  }

  function ensureModal() {
    if (el("app-save-feedback-modal")) {
      bindOnce();
      return;
    }
    var wrap = w.document.createElement("div");
    wrap.id = "app-save-feedback-modal";
    wrap.className = "modal-overlay";
    wrap.setAttribute("hidden", "");
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="modal-dialog cl-add-dialog" role="dialog" aria-modal="true" aria-labelledby="app-save-feedback-h2" tabindex="-1">' +
      '<div class="modal-header">' +
      '<h2 class="modal-title" id="app-save-feedback-h2">Opgeslagen</h2>' +
      '<button type="button" class="modal-close" id="app-save-feedback-x" aria-label="Sluiten"><span aria-hidden="true">&times;</span></button>' +
      "</div>" +
      '<div class="modal-body"><p class="app-save-feedback-text" id="app-save-feedback-msg" role="status"></p></div>' +
      "</div>";
    w.document.body.appendChild(wrap);
    bindOnce();
  }

  /**
   * @param {string} [message] — hoofdtekst; standaard vaste zin
   * @param {string} [title] — modaltitel; standaard "Opgeslagen"
   */
  function showSaveModal(message, title) {
    ensureModal();
    clearAutoClose();
    var t = title == null || String(title).trim() === "" ? "Opgeslagen" : String(title).trim();
    var body =
      message == null || String(message).trim() === ""
        ? "De wijzigingen zijn opgeslagen."
        : String(message).trim();
    var h2 = el("app-save-feedback-h2");
    var p = el("app-save-feedback-msg");
    if (h2) h2.textContent = t;
    if (p) p.textContent = body;
    var m = el("app-save-feedback-modal");
    if (m) {
      m.removeAttribute("hidden");
      m.setAttribute("aria-hidden", "false");
      _autoCloseId = w.setTimeout(function () {
        _autoCloseId = null;
        closeModal();
      }, AUTO_MS);
    }
  }

  /**
   * Hogere-orde helper boven showSaveModal: kiest titel en tekst op basis van actie.
   * @param {string} action — "saved" | "added" | "updated" | "deleted" | "archived"
   *                          | "restored" | "exported" | "downloaded" | "info" | "error"
   * @param {string} target — onderwerp van de actie ("Medewerker gegevens", "facturen.csv", ...)
   *                          of bij "info"/"error": de titel van de popup.
   * @param {string} [extra] — optionele extra tekst (gebruikt voor info/error details).
   */
  function showActionFeedback(action, target, extra) {
    var t = String(action || "").toLowerCase();
    var s = String(target == null ? "" : target);
    var e = extra == null ? "" : String(extra);
    var title = "";
    var text = "";
    switch (t) {
      case "saved":
        title = "Opgeslagen";
        text = (s ? s + " " : "") + "opgeslagen.";
        break;
      case "added":
        title = "Toegevoegd";
        text = (s ? s + " " : "") + "toegevoegd.";
        break;
      case "updated":
        title = "Bijgewerkt";
        text = (s ? s + " " : "") + "bijgewerkt.";
        break;
      case "deleted":
        title = "Verwijderd";
        text = (s ? s + " " : "") + "verwijderd.";
        break;
      case "archived":
        title = "Gearchiveerd";
        text = (s ? s + " " : "") + "gearchiveerd.";
        break;
      case "restored":
        title = "Hersteld";
        text = (s ? s + " " : "") + "hersteld.";
        break;
      case "exported":
        title = "Geëxporteerd";
        text = (s ? s + " " : "") + "is geëxporteerd.";
        break;
      case "downloaded":
        title = "Gedownload";
        text = (s ? s + " " : "") + "is gedownload.";
        break;
      case "info":
        title = s || "Let op";
        text = e || "";
        break;
      case "error":
        title = s || "Er ging iets mis";
        text = e || "Onbekende fout.";
        break;
      default:
        title = s || "";
        text = e || "";
    }
    showSaveModal(text, title);
  }

  /**
   * Slider-bevestigingsmodal voor destructieve acties (in plaats van window.confirm).
   * Gebruikt dezelfde huisstijl als employee-delete-dialog: gebruiker moet de
   * slider helemaal naar rechts schuiven om de actie-knop te activeren.
   * @param {{title?: string, message?: string, preview?: string,
   *          okLabel?: string, cancelLabel?: string}} [opts]
   * @returns {Promise<boolean>} resolves true als bevestigd, false bij annuleren/sluit.
   */
  function showSliderConfirmModal(opts) {
    var o = opts || {};
    var title = o.title || "Bevestigen";
    var message = o.message || "Weet je zeker dat je dit wilt doen?";
    var preview = o.preview == null ? "" : String(o.preview);
    var okLabel = o.okLabel || "Verwijderen";
    var cancelLabel = o.cancelLabel || "Annuleren";

    return new Promise(function (resolve) {
      var overlay = w.document.createElement("div");
      overlay.className = "modal-overlay modal-overlay--confirm";
      overlay.setAttribute("aria-hidden", "false");
      overlay.innerHTML =
        '<div class="modal-dialog employee-delete-dialog" role="dialog" aria-modal="true" tabindex="-1">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title"></h2>' +
            '<button type="button" class="modal-close" aria-label="Sluiten"><span aria-hidden="true">&times;</span></button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<p class="employee-delete-msg"></p>' +
            '<p class="employee-delete-preview" aria-live="polite"></p>' +
            '<div class="employee-delete-slider-block">' +
              '<label class="employee-delete-slider-label">Schuif helemaal naar rechts om te bevestigen</label>' +
              '<div class="employee-delete-slider-wrap">' +
                '<input type="range" class="employee-delete-slider" min="0" max="100" value="0" step="1" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Bevestig actie" />' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn-outline"></button>' +
            '<button type="button" class="btn-primary" disabled></button>' +
          '</div>' +
        '</div>';

      var titleEl = overlay.querySelector(".modal-title");
      var msgEl = overlay.querySelector(".employee-delete-msg");
      var previewEl = overlay.querySelector(".employee-delete-preview");
      var slider = overlay.querySelector(".employee-delete-slider");
      var closeBtn = overlay.querySelector(".modal-close");
      var cancelBtn = overlay.querySelector(".btn-outline");
      var okBtn = overlay.querySelector(".btn-primary");

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (previewEl) previewEl.textContent = preview;
      if (cancelBtn) cancelBtn.textContent = cancelLabel;
      if (okBtn) okBtn.textContent = okLabel;

      function syncSlider() {
        if (!slider) return;
        var v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
        slider.value = String(v);
        slider.style.setProperty("--employee-slider-pct", v + "%");
        slider.setAttribute("aria-valuenow", String(v));
        if (okBtn) okBtn.disabled = v < 100;
      }
      function settle(result) {
        w.document.removeEventListener("keydown", onKey);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(result);
      }
      function onCancel() { settle(false); }
      function onConfirm() {
        if (okBtn && okBtn.disabled) return;
        settle(true);
      }
      function onBackdrop(e) { if (e.target === overlay) settle(false); }
      function onKey(e) { if (e.key === "Escape") settle(false); }

      if (slider) {
        slider.addEventListener("input", syncSlider);
        slider.addEventListener("change", syncSlider);
      }
      if (closeBtn) closeBtn.addEventListener("click", onCancel);
      if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
      if (okBtn) okBtn.addEventListener("click", onConfirm);
      overlay.addEventListener("click", onBackdrop);
      w.document.addEventListener("keydown", onKey);

      w.document.body.appendChild(overlay);
      syncSlider();
      if (slider) {
        try { slider.focus(); } catch (e) { /* noop */ }
      }
    });
  }

  /**
   * Shorthand om bij archiveren altijd dezelfde slider-bevestiging te tonen
   * als bij verwijderen. Geeft een Promise<boolean> terug (true = bevestigd).
   *
   * Gebruik:
   *   var ok = await window.showArchiveConfirm({ preview: "Naam document" });
   *   if (!ok) return;
   *
   * Optionele opts:
   *   - title         (default: "Bent u zeker dat dit gearchiveerd wordt?")
   *   - message       (default: "Het item verdwijnt uit de actieve lijst en is
   *                    altijd terug te vinden via de Gearchiveerd-toggle.")
   *   - preview       (string die boven de slider verschijnt, bv. de naam)
   *   - okLabel       (default: "Archiveren")
   *   - cancelLabel   (default: "Annuleren")
   */
  function showArchiveConfirm(opts) {
    var o = opts || {};
    return showSliderConfirmModal({
      title: o.title || "Bent u zeker dat dit gearchiveerd wordt?",
      message: o.message ||
        "Het item verdwijnt uit de actieve lijst en is altijd terug te vinden via de Gearchiveerd-toggle.",
      preview: o.preview,
      okLabel: o.okLabel || "Archiveren",
      cancelLabel: o.cancelLabel || "Annuleren",
    });
  }

  w.showSaveModal = showSaveModal;
  w.showActionFeedback = showActionFeedback;
  w.showSliderConfirmModal = showSliderConfirmModal;
  w.showArchiveConfirm = showArchiveConfirm;
})(window);
