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

  w.showSaveModal = showSaveModal;
})(window);
