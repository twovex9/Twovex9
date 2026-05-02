/* global getOrganisatiesItems, updateOrganisatieById, showSaveModal */
(function () {
  "use strict";

  var missingEl = document.getElementById("od-missing");
  var missingBody = document.getElementById("od-missing-body");
  var rootEl = document.getElementById("od-root");
  var pageTitle = document.getElementById("od-page-title");
  var heroName = document.getElementById("od-hero-name");
  var form = document.getElementById("od-form");
  var idInput = document.getElementById("od-id");
  var naamInput = document.getElementById("od-naam");
  var saveBtn = document.getElementById("od-save");
  var archHint = document.getElementById("od-arch-hint");
  var toastEl = document.getElementById("od-toast");
  var kebabBtn = document.getElementById("od-kebab-btn");
  var kebabPanel = document.getElementById("od-kebab-panel");

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
    }, 4000);
  }

  function findOrganisatie(id) {
    if (!id || typeof getOrganisatiesItems !== "function") return null;
    return (getOrganisatiesItems() || []).find(function (g) {
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
    if (pageTitle) pageTitle.textContent = nm ? nm + " — Organisatie" : "Organisatie";
    document.title = nm ? nm + " — Organisatie — HR" : "Organisatie — HR";
    if (idInput) idInput.value = r.id;
    if (naamInput) naamInput.value = nm;
    var arch = r.archived === true;
    if (archHint) archHint.hidden = !arch;
    if (naamInput) naamInput.disabled = arch;
    if (saveBtn) saveBtn.disabled = arch;
  }

  function init() {
    if (typeof getOrganisatiesItems !== "function" || typeof updateOrganisatieById !== "function") {
      if (missingBody) missingBody.textContent = "Gegevens konden niet worden geladen.";
      if (missingEl) missingEl.hidden = false;
      return;
    }

    var id = queryId();
    if (!id) {
      if (missingBody) missingBody.textContent = "Geen organisatie geselecteerd.";
      if (missingEl) missingEl.hidden = false;
      return;
    }

    var r = findOrganisatie(id);
    if (!r) {
      if (missingBody) missingBody.textContent = "Organisatie niet gevonden.";
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
        var done = updateOrganisatieById(idu, nm);
        if (!done) {
          showToast("Opslaan mislukt. Bestaat de naam al?");
          return;
        }
        var next = findOrganisatie(idu);
        if (next) applyFromRecord(next);
        if (typeof showSaveModal === "function") {
          showSaveModal("De naam is overal in cliëntgegevens doorgevoerd waar deze organisatie stond.");
        } else {
          showToast("Opgeslagen. De naam is overal in cliëntgegevens doorgevoerd waar deze organisatie stond.");
        }
      });
    }

    if (kebabBtn && kebabPanel) {
      kebabBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var willOpen = kebabPanel.hasAttribute("hidden");
        if (willOpen) {
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
