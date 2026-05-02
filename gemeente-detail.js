/* global getGemeentenItems, updateGemeenteById, showSaveModal */
(function () {
  "use strict";

  var missingEl = document.getElementById("gd-missing");
  var missingBody = document.getElementById("gd-missing-body");
  var rootEl = document.getElementById("gd-root");
  var pageTitle = document.getElementById("gd-page-title");
  var heroName = document.getElementById("gd-hero-name");
  var form = document.getElementById("gd-form");
  var idInput = document.getElementById("gd-id");
  var naamInput = document.getElementById("gd-naam");
  var saveBtn = document.getElementById("gd-save");
  var archHint = document.getElementById("gd-arch-hint");
  var toastEl = document.getElementById("gd-toast");
  var kebabBtn = document.getElementById("gd-kebab-btn");
  var kebabPanel = document.getElementById("gd-kebab-panel");

  function queryId() {
    try {
      var q = new URLSearchParams(window.location.search).get("id");
      return q ? String(q).trim() : "";
    } catch (e) {
      return "";
    }
  }

  function showToast(msg) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.removeAttribute("hidden");
    toastEl.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
      toastEl.setAttribute("hidden", "");
    }, 2400);
  }

  function findGemeente(id) {
    if (!id || typeof getGemeentenItems !== "function") return null;
    return (getGemeentenItems() || []).find(function (g) {
      return g && g.id === id;
    }) || null;
  }

  function closeKebab() {
    if (kebabPanel) kebabPanel.setAttribute("hidden", "");
    if (kebabBtn) kebabBtn.setAttribute("aria-expanded", "false");
  }

  function applyFromRecord(r) {
    if (!r) return;
    var nm = r.naam != null ? String(r.naam) : "";
    if (heroName) heroName.textContent = nm || "—";
    if (pageTitle) pageTitle.textContent = nm ? nm + " — Gemeente" : "Gemeente";
    document.title = nm ? nm + " — Gemeente — HR" : "Gemeente — HR";
    if (idInput) idInput.value = r.id;
    if (naamInput) naamInput.value = nm;
    var arch = r.archived === true;
    if (archHint) archHint.hidden = !arch;
    if (naamInput) naamInput.disabled = arch;
    if (saveBtn) saveBtn.disabled = arch;
  }

  function init() {
    if (typeof getGemeentenItems !== "function" || typeof updateGemeenteById !== "function") {
      if (missingBody) missingBody.textContent = "Gegevens konden niet worden geladen.";
      if (missingEl) missingEl.hidden = false;
      return;
    }

    var id = queryId();
    if (!id) {
      if (missingBody) missingBody.textContent = "Geen gemeente geselecteerd.";
      if (missingEl) missingEl.hidden = false;
      return;
    }

    var r = findGemeente(id);
    if (!r) {
      if (missingBody) missingBody.textContent = "Gemeente niet gevonden.";
      if (missingEl) missingEl.hidden = false;
      return;
    }

    if (missingEl) missingEl.hidden = true;
    if (rootEl) rootEl.hidden = false;
    applyFromRecord(r);

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var idu = idInput && idInput.value ? idInput.value.trim() : "";
        var nm = naamInput && naamInput.value ? naamInput.value.trim() : "";
        if (!idu) return;
        if (!nm) {
          showToast("Vul een naam in.");
          return;
        }
        var done = updateGemeenteById(idu, nm);
        if (!done) {
          showToast("Opslaan mislukt. Bestaat de naam al?");
          return;
        }
        var next = findGemeente(idu);
        if (next) applyFromRecord(next);
        if (typeof showSaveModal === "function") showSaveModal("De wijzigingen zijn opgeslagen.");
        else showToast("Opgeslagen.");
      });
    }

    if (kebabBtn && kebabPanel) {
      kebabBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var open = kebabPanel.hasAttribute("hidden");
        if (open) {
          kebabPanel.removeAttribute("hidden");
          kebabBtn.setAttribute("aria-expanded", "true");
        } else {
          closeKebab();
        }
      });
      kebabPanel.addEventListener("click", function (ev) { ev.stopPropagation(); });
    }
    document.addEventListener("click", closeKebab);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
