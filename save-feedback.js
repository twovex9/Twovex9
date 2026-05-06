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

  w.showSaveModal = showSaveModal;
  w.showActionFeedback = showActionFeedback;
})(window);
