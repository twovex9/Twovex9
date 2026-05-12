/* global window, document */
/**
 * instellingen.js — page-script voor /instellingen.html.
 * Tabs: Mijn profiel (edit voornaam/achternaam) + Notificatietypes (admin CRUD).
 */
(function () {
  "use strict";

  var state = {
    activeTab: "profiel",
    ntSearch: "",
    ntShowArchived: false,
    ntEditingId: null,
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function trashSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  function setTab(name) {
    state.activeTab = name;
    document.getElementById("inst-tab-profiel").classList.toggle("filter-chip--active", name === "profiel");
    document.getElementById("inst-tab-notificaties").classList.toggle("filter-chip--active", name === "notificaties");
    document.getElementById("inst-tab-profiel").setAttribute("aria-selected", name === "profiel" ? "true" : "false");
    document.getElementById("inst-tab-notificaties").setAttribute("aria-selected", name === "notificaties" ? "true" : "false");
    document.getElementById("inst-panel-profiel").style.display = name === "profiel" ? "" : "none";
    document.getElementById("inst-panel-notificaties").style.display = name === "notificaties" ? "" : "none";
    if (name === "notificaties") renderNt();
  }

  // ---------------------------------------------------------------------------
  // Tab: Mijn profiel
  // ---------------------------------------------------------------------------

  function loadProfielForm() {
    var profile = null;
    try {
      if (window.profilesDB && window.profilesDB.getCurrentSync) {
        profile = window.profilesDB.getCurrentSync();
      }
      if (!profile && window.besaCurrentProfile) profile = window.besaCurrentProfile;
    } catch (e) { /* */ }
    if (!profile) return;
    document.getElementById("inst-profiel-voornaam").value = profile.voornaam || "";
    document.getElementById("inst-profiel-achternaam").value = profile.achternaam || "";
    document.getElementById("inst-profiel-email").value = profile.email || "";
    document.getElementById("inst-profiel-rol").value = profile.rol || "";
  }

  async function submitProfielForm(evt) {
    evt.preventDefault();
    var fb = document.getElementById("inst-profiel-feedback");
    var btn = document.getElementById("inst-profiel-save-btn");
    fb.textContent = "";
    fb.style.color = "var(--green)";

    var voornaam = document.getElementById("inst-profiel-voornaam").value.trim();
    var achternaam = document.getElementById("inst-profiel-achternaam").value.trim();

    var profile = window.profilesDB && window.profilesDB.getCurrentSync ? window.profilesDB.getCurrentSync() : null;
    if (!profile || !profile.id) {
      fb.style.color = "var(--red)";
      fb.textContent = "Geen profiel geladen — log opnieuw in.";
      return;
    }

    btn.disabled = true;
    try {
      await window.profilesDB.update(profile.id, { voornaam: voornaam, achternaam: achternaam });
      fb.textContent = "Opgeslagen ✓";
      if (window.showActionFeedback) window.showActionFeedback("saved", "Profiel bijgewerkt");
    } catch (err) {
      fb.style.color = "var(--red)";
      fb.textContent = "Opslaan mislukt: " + (err && err.message || err);
    } finally {
      btn.disabled = false;
      setTimeout(function () { fb.textContent = ""; }, 4000);
    }
  }

  // ---------------------------------------------------------------------------
  // Tab: Notificatietypes
  // ---------------------------------------------------------------------------

  var KANAAL_LABELS = { in_app: "In-app", email: "E-mail", sms: "SMS", push: "Push" };

  function getVisibleNt() {
    var items = (window.notificationTypesDB && window.notificationTypesDB.getAllSync()) || [];
    var q = state.ntSearch.trim().toLowerCase();
    return items.filter(function (n) {
      if (!n) return false;
      if (!!n.archived !== !!state.ntShowArchived) return false;
      if (!q) return true;
      var hay = (n.naam || "") + " " + (n.beschrijving || "") + " " + (n.kanaal || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderNtRow(n) {
    var actions = n.archived
      ? '<div class="hr-row-actions">' +
        '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(n.id) + '">Herstel</button>' +
        '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(n.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button>' +
        '</div>'
      : '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(n.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';
    var nameBtn = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(n.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' + escapeHtml(n.naam) + '</button>';
    return '<tr>' +
      '<td>' + nameBtn + '</td>' +
      '<td style="color:var(--text-secondary);">' + escapeHtml(n.beschrijving || "") + '</td>' +
      '<td>' + escapeHtml(KANAAL_LABELS[n.kanaal] || n.kanaal) + '</td>' +
      '<td>' + (n.defaultAan ? '<span style="color:var(--green);">✓</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
      '<td class="hr-actions-cell">' + actions + '</td>' +
    '</tr>';
  }

  function renderNt() {
    var tbody = document.getElementById("inst-nt-tbody");
    if (!tbody) return;
    var items = getVisibleNt();
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-muted);">Geen notificatietypes gevonden.</td></tr>';
    } else {
      tbody.innerHTML = items.map(renderNtRow).join("");
    }
  }

  function openNtModal(item) {
    state.ntEditingId = item ? item.id : null;
    var modal = document.getElementById("inst-nt-modal");
    document.getElementById("inst-nt-modal-title").textContent = item ? "Notificatietype bewerken" : "Notificatietype toevoegen";
    document.getElementById("inst-nt-edit-id").value = item ? item.id : "";
    document.getElementById("inst-nt-naam").value = item ? item.naam : "";
    document.getElementById("inst-nt-beschrijving").value = item ? (item.beschrijving || "") : "";
    document.getElementById("inst-nt-kanaal").value = item ? (item.kanaal || "in_app") : "in_app";
    document.getElementById("inst-nt-default-aan").checked = item ? !!item.defaultAan : true;
    document.getElementById("inst-nt-submit-btn").textContent = item ? "Opslaan" : "Toevoegen";
    modal.style.display = "flex";
  }
  function closeNtModal() {
    state.ntEditingId = null;
    document.getElementById("inst-nt-modal").style.display = "none";
  }

  async function submitNtForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("inst-nt-submit-btn");
    var idVal = document.getElementById("inst-nt-edit-id").value;
    var naam = document.getElementById("inst-nt-naam").value.trim();
    if (!naam) {
      document.getElementById("inst-nt-naam").focus();
      return;
    }
    var payload = {
      naam: naam,
      beschrijving: document.getElementById("inst-nt-beschrijving").value,
      kanaal: document.getElementById("inst-nt-kanaal").value,
      defaultAan: document.getElementById("inst-nt-default-aan").checked,
    };
    submit.disabled = true;
    try {
      if (idVal) await window.notificationTypesDB.update(idVal, payload);
      else await window.notificationTypesDB.add(payload);
      if (window.showActionFeedback) window.showActionFeedback("saved", payload.naam);
      closeNtModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    } finally {
      submit.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Wire events
  // ---------------------------------------------------------------------------

  function wireEvents() {
    document.getElementById("inst-tab-profiel").addEventListener("click", function () { setTab("profiel"); });
    document.getElementById("inst-tab-notificaties").addEventListener("click", function () { setTab("notificaties"); });

    document.getElementById("inst-profiel-form").addEventListener("submit", submitProfielForm);

    document.getElementById("inst-nt-add-btn").addEventListener("click", function () { openNtModal(null); });
    document.getElementById("inst-nt-close-btn").addEventListener("click", closeNtModal);
    document.getElementById("inst-nt-cancel-btn").addEventListener("click", closeNtModal);
    document.getElementById("inst-nt-form").addEventListener("submit", submitNtForm);
    document.getElementById("inst-nt-search").addEventListener("input", function (e) { state.ntSearch = e.target.value || ""; renderNt(); });
    document.getElementById("inst-nt-archived-toggle").addEventListener("change", function (e) { state.ntShowArchived = !!e.target.checked; renderNt(); });

    document.getElementById("inst-nt-tbody").addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = window.notificationTypesDB.getByIdSync(id);
      if (!item) return;
      var action = btn.getAttribute("data-action");
      try {
        if (action === "edit") openNtModal(item);
        else if (action === "archive") { await window.notificationTypesDB.archive(id); }
        else if (action === "restore") { await window.notificationTypesDB.restore(id); }
        else if (action === "purge") {
          if (window.confirm("Definitief verwijderen?")) await window.notificationTypesDB.delete(id);
        }
      } catch (err) {
        if (window.showError) window.showError("Actie mislukt: " + (err && err.message || err));
      }
    });

    window.addEventListener("besa:notification-types-updated", renderNt);
    window.addEventListener("besa:profile-updated", loadProfielForm);
  }

  function init() {
    wireEvents();
    loadProfielForm();
    if (window.profilesDB && window.profilesDB.ready) {
      window.profilesDB.ready.then(loadProfielForm);
    }
    if (window.notificationTypesDB) {
      renderNt();
      window.notificationTypesDB.ready.then(renderNt);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
