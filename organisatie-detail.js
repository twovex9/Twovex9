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

  var notForm = document.getElementById("od-not-form");
  var notText = document.getElementById("od-not-text");
  var notList = document.getElementById("od-not-list");
  var notEmpty = document.getElementById("od-not-empty");
  var notWired = false;

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatDateTimeNl(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return String(iso).slice(0, 16).replace("T", " "); }
  }

  function currentAuteur() {
    try {
      if (global_besaProfile()) {
        var p = global_besaProfile();
        var nm = ((p.voornaam || "") + " " + (p.achternaam || "")).trim();
        return nm || p.email || "";
      }
    } catch (e) { /* */ }
    return "";
  }
  function global_besaProfile() {
    if (window.besaCurrentProfile) return window.besaCurrentProfile;
    if (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function") return window.profilesDB.getCurrentSync();
    return null;
  }

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

  // ---- Verwijzer-notities ----
  function renderNotities(orgId) {
    if (!notList) return;
    var rows = [];
    try {
      if (window.organisatieNotitiesDB && typeof window.organisatieNotitiesDB.getForOrganisatieSync === "function") {
        rows = window.organisatieNotitiesDB.getForOrganisatieSync(orgId) || [];
      }
    } catch (e) { rows = []; }
    notList.innerHTML = "";
    if (!rows.length) {
      if (notEmpty) notEmpty.hidden = false;
      return;
    }
    if (notEmpty) notEmpty.hidden = true;
    rows.forEach(function (n) {
      var li = document.createElement("li");
      li.className = "od-not-item";
      li.setAttribute("data-id", n.id);
      var meta = formatDateTimeNl(n.aanmaakdatum) + (n.auteur ? " · " + escHtml(n.auteur) : "");
      li.innerHTML =
        '<div class="od-not-item-body">' +
        '<p class="od-not-item-text">' + escHtml(n.tekst).replace(/\n/g, "<br>") + "</p>" +
        '<span class="od-not-item-meta">' + meta + "</span>" +
        "</div>" +
        '<button type="button" class="employee-delete-btn od-not-del-btn" data-id="' + n.id + '" aria-label="Notitie verwijderen">' +
        '<svg class="cl-trash-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>' +
        "</button>";
      notList.appendChild(li);
    });
  }

  function wireNotities(orgId) {
    if (notWired) { renderNotities(orgId); return; }
    notWired = true;

    if (notForm) {
      notForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var tekst = notText && notText.value ? notText.value.trim() : "";
        if (!tekst) { showToast("Schrijf eerst een notitie."); return; }
        if (!window.organisatieNotitiesDB) { showToast("Notities-laag niet geladen."); return; }
        window.organisatieNotitiesDB.add({ organisatieId: orgId, tekst: tekst, auteur: currentAuteur() })
          .then(function () {
            if (notText) notText.value = "";
            if (window.showActionFeedback) window.showActionFeedback("saved", "Notitie");
          })
          .catch(function (err) {
            if (window.showError) window.showError("Notitie opslaan mislukt: " + (err && err.message ? err.message : err));
            else showToast("Notitie opslaan mislukt.");
          });
      });
    }

    if (notList) {
      notList.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".od-not-del-btn");
        if (!btn) return;
        e.preventDefault();
        var nid = btn.getAttribute("data-id");
        if (!nid) return;
        var doDelete = function () {
          window.organisatieNotitiesDB.delete(nid)
            .then(function () { if (window.showActionFeedback) window.showActionFeedback("deleted", "Notitie"); })
            .catch(function (err) {
              if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message ? err.message : err));
            });
        };
        if (typeof window.showSliderConfirmModal === "function") {
          window.showSliderConfirmModal({
            title: "Bent u zeker dat deze notitie verwijderd wordt?",
            preview: "Notitie",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren",
          }).then(function (ok) { if (ok) doDelete(); });
        } else {
          doDelete();
        }
      });
    }

    window.addEventListener("besa:organisatie-notities-updated", function () { renderNotities(orgId); });
    if (window.organisatieNotitiesDB && window.organisatieNotitiesDB.ready) {
      window.organisatieNotitiesDB.ready.then(function () { renderNotities(orgId); });
    }
    renderNotities(orgId);
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
    wireNotities(id);

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

  // Wanneer de Supabase-bootstrap de cache vult (eerste page-load op een
  // nieuwe browser), proberen we opnieuw te initialiseren zodat de
  // detailpagina alsnog de juiste organisatie kan ophalen.
  window.addEventListener("besa:organisaties-updated", function () {
    try { init(); } catch (e) { /* */ }
  });
})();
