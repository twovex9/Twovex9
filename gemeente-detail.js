/* gemeente-detail.js — detailpagina gemeente (Supabase data-laag via window.gemeentenDB) */
/* global showSaveModal */
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

  function findGemeenteCached(id) {
    if (!id || !window.gemeentenDB) return null;
    var list = window.gemeentenDB.getAllSync() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
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

  var gemeenteId = queryId();
  var listenersAttached = false;

  function showLoading() {
    if (heroName) heroName.textContent = "Laden…";
    if (pageTitle) pageTitle.textContent = "Gemeente";
  }

  function showError(message) {
    if (missingBody) missingBody.textContent = message;
    if (missingEl) missingEl.hidden = false;
    if (rootEl) rootEl.hidden = true;
  }

  function attachInteractions() {
    if (listenersAttached) return;
    listenersAttached = true;

    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var idu = idInput && idInput.value ? idInput.value.trim() : "";
        var nm = naamInput && naamInput.value ? naamInput.value.trim() : "";
        if (!idu) return;
        if (!nm) {
          showToast("Vul een naam in.");
          return;
        }
        var done;
        try {
          done = await window.gemeentenDB.update(idu, { naam: nm });
        } catch (err) {
          if (err && err.code === "duplicate_naam") {
            showToast("Opslaan mislukt. Bestaat de naam al?");
          } else {
            console.error("Gemeente opslaan mislukt:", err);
            showToast("Opslaan is niet gelukt");
          }
          return;
        }
        if (!done) {
          showToast("Opslaan is niet gelukt");
          return;
        }
        applyFromRecord(done);
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

  function init() {
    if (!window.gemeentenDB) {
      showError("Gegevens konden niet worden geladen.");
      return;
    }
    if (!gemeenteId) {
      showError("Geen gemeente geselecteerd.");
      return;
    }

    var r = findGemeenteCached(gemeenteId);
    if (r) {
      if (missingEl) missingEl.hidden = true;
      if (rootEl) rootEl.hidden = false;
      applyFromRecord(r);
      attachInteractions();
    } else {
      showLoading();
    }

    window.addEventListener("besa:gemeenten-updated", function () {
      var r2 = findGemeenteCached(gemeenteId);
      if (!r2) {
        showError("Gemeente niet gevonden.");
        return;
      }
      if (missingEl) missingEl.hidden = true;
      if (rootEl) rootEl.hidden = false;
      applyFromRecord(r2);
      attachInteractions();
    });

    Promise.resolve(window.gemeentenDB.ready).catch(function () { /* error reeds gelogd */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
