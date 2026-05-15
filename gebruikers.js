/* global window, document */
/**
 * gebruikers.js — v3 Fase G.5 + G.6 + G.7
 *
 * Pagina-logica voor `gebruikers.html`.
 * - Toegankelijk alleen voor admin-tier (Eigenaar/Admin/Directeur).
 * - Roept Edge Function `admin-user-mgmt` via window.gebruikersDB.
 * - Server-side audit-log per actie.
 */
(function () {
  "use strict";

  var state = {
    users: [],
    roles: [],
    actorId: null,
    search: "",
    showArchived: false,
    rolFilter: "",
  };

  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtNaam(u) {
    var n = (u.voornaam || "") + " " + (u.achternaam || "");
    return n.trim() || u.email || u.id;
  }

  // ---- Access control: alleen admin-tier ----
  function ensureAdminTier() {
    var tries = 0;
    function check() {
      tries++;
      var available = typeof window.besaIsAdminTier === "function" && typeof window.besaCurrentProfile !== "undefined";
      if (!available) {
        if (tries < 30) return setTimeout(check, 200);
        // Profile niet geladen — fallback: blokkeer
        showNoAccess();
        return;
      }
      if (!window.besaIsAdminTier()) {
        showNoAccess();
        return;
      }
      // Admin-tier — laad gebruikers
      loadUsers();
    }
    check();
  }

  function showNoAccess() {
    el("gebr-no-access").hidden = false;
    var tbody = el("gebr-tbody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="gebr-loading">Geen toegang.</td></tr>';
  }

  // ---- Render ----
  function setTotaal() {
    var totalEl = el("gebr-totaal");
    if (!totalEl) return;
    var filtered = filterUsers();
    totalEl.textContent = filtered.length + " gebruiker" + (filtered.length === 1 ? "" : "s");
  }

  function filterUsers() {
    var q = state.search.trim().toLowerCase();
    return state.users.filter(function (u) {
      if (!state.showArchived && u.archived) return false;
      if (state.showArchived && !u.archived) return false;
      if (q) {
        var hay = (fmtNaam(u) + " " + (u.email || "") + " " + (u.rol_naam || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function rolSelectHtml(currentRolId, userId, isSelf) {
    var opts = state.roles.map(function (r) {
      var sel = r.id === currentRolId ? " selected" : "";
      return '<option value="' + escapeHtml(r.id) + '"' + sel + '>' + escapeHtml(r.naam) + '</option>';
    }).join("");
    var disabled = isSelf ? " disabled title=\"Je kunt je eigen rol niet wijzigen\"" : "";
    return '<select class="gebr-rol-select" data-user="' + escapeHtml(userId) + '"' + disabled + '>' + opts + '</select>';
  }

  function renderRow(u) {
    var isSelf = u.id === state.actorId;
    var naam = escapeHtml(fmtNaam(u));
    var email = escapeHtml(u.email || "");
    var pwBadge = u.must_change_password
      ? '<span class="gebr-badge gebr-badge--warn" title="Tijdelijk wachtwoord, wijzigen verplicht">tijdelijk</span>'
      : '<span class="gebr-badge gebr-badge--ok" title="Eigen wachtwoord gekozen">ok</span>';
    var fa = u.has_2fa
      ? '<span class="gebr-badge gebr-badge--ok" title="2FA actief">actief</span>'
      : (u.must_setup_2fa
        ? '<span class="gebr-badge gebr-badge--warn" title="Nog niet ingesteld">setup nodig</span>'
        : '<span class="gebr-badge gebr-badge--muted">geen</span>');
    var status = u.archived
      ? '<span class="gebr-badge gebr-badge--archived">Gedeactiveerd</span>'
      : '<span class="gebr-badge gebr-badge--ok">Actief</span>';
    var rolCell = rolSelectHtml(u.rol_id, u.id, isSelf);

    var acties;
    if (u.archived) {
      acties = '' +
        '<div class="hr-row-actions">' +
          '<button type="button" class="btn-outline gebr-activate-btn" data-user="' + escapeHtml(u.id) + '">Activeer</button>' +
        '</div>';
    } else {
      var disableArch = isSelf ? " disabled title=\"Je kunt jezelf niet deactiveren\"" : "";
      acties = '' +
        '<div class="hr-row-actions gebr-actions">' +
          '<button type="button" class="btn-outline gebr-reset-pw-btn" data-user="' + escapeHtml(u.id) + '" data-naam="' + naam + '">Reset wachtwoord</button>' +
          '<button type="button" class="btn-outline gebr-reset-2fa-btn" data-user="' + escapeHtml(u.id) + '" data-naam="' + naam + '">Reset 2FA</button>' +
          '<button type="button" class="btn-outline gebr-deactivate-btn" data-user="' + escapeHtml(u.id) + '" data-naam="' + naam + '"' + disableArch + '>Deactiveer</button>' +
        '</div>';
    }

    return '<tr data-user="' + escapeHtml(u.id) + '"' + (u.archived ? ' class="is-archived"' : '') + '>' +
      '<td>' + naam + (isSelf ? ' <span class="gebr-self">(jij)</span>' : '') + '</td>' +
      '<td>' + email + '</td>' +
      '<td>' + rolCell + '</td>' +
      '<td>' + fa + '</td>' +
      '<td>' + pwBadge + '</td>' +
      '<td>' + status + '</td>' +
      '<td>' + acties + '</td>' +
      '</tr>';
  }

  function render() {
    var tbody = el("gebr-tbody");
    if (!tbody) return;
    var rows = filterUsers();
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="gebr-loading">Geen gebruikers gevonden.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(renderRow).join("");
    }
    setTotaal();
    populateAddRolDropdown();
  }

  function populateAddRolDropdown() {
    var select = el("gebr-add-rol");
    if (!select) return;
    if (select.options.length > 0 && select.options.length === state.roles.length + 1) return;
    select.innerHTML = '<option value="">— kies rol —</option>' +
      state.roles.map(function (r) {
        return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.naam) + '</option>';
      }).join("");
  }

  // ---- Data load ----
  async function loadUsers() {
    var tbody = el("gebr-tbody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="gebr-loading">Gebruikers laden…</td></tr>';
    try {
      var data = await window.gebruikersDB.listUsers();
      state.users = data.users || [];
      state.roles = data.roles || [];
      state.actorId = data.actor_id || null;
      render();
    } catch (err) {
      console.error("[gebruikers] load failed:", err);
      var msg = (err && err.message) || "Onbekende fout bij laden van gebruikers.";
      if (/forbidden/i.test(msg) || /admin-tier/i.test(msg)) {
        showNoAccess();
        return;
      }
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="gebr-loading gebr-error">Fout: ' + escapeHtml(msg) + '</td></tr>';
    }
  }

  // ---- Confirm modal helper ----
  function showConfirm(title, text, okLabel) {
    return new Promise(function (resolve) {
      var modal = el("gebr-confirm-modal");
      el("gebr-confirm-title").textContent = title || "Bevestigen";
      el("gebr-confirm-text").textContent = text || "";
      var okBtn = el("gebr-confirm-ok");
      okBtn.textContent = okLabel || "Bevestigen";
      modal.hidden = false;
      function cleanup(result) {
        modal.hidden = true;
        okBtn.removeEventListener("click", onOk);
        el("gebr-confirm-cancel").removeEventListener("click", onCancel);
        el("gebr-confirm-close").removeEventListener("click", onCancel);
        modal.removeEventListener("click", onOverlay);
        document.removeEventListener("keydown", onKey);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlay(e) { if (e.target === modal) cleanup(false); }
      function onKey(e) { if (e.key === "Escape") cleanup(false); }
      okBtn.addEventListener("click", onOk);
      el("gebr-confirm-cancel").addEventListener("click", onCancel);
      el("gebr-confirm-close").addEventListener("click", onCancel);
      modal.addEventListener("click", onOverlay);
      document.addEventListener("keydown", onKey);
      setTimeout(function () { okBtn.focus(); }, 50);
    });
  }

  function toast(kind, msg) {
    if (window.showActionFeedback) {
      window.showActionFeedback(kind, msg);
    } else if (window.showSaveModal) {
      window.showSaveModal({ title: msg });
    } else {
      console.log("[gebr toast]", kind, msg);
    }
  }

  // ---- Actions ----
  async function onResetPassword(userId, naam) {
    var ok = await showConfirm(
      "Reset wachtwoord",
      "Wachtwoord van " + naam + " wordt gereset naar 'Welkom123'. De gebruiker moet bij eerstvolgende login een nieuw wachtwoord kiezen.",
      "Reset"
    );
    if (!ok) return;
    try {
      var r = await window.gebruikersDB.resetPassword(userId);
      toast("saved", r.message || "Wachtwoord gereset.");
      await loadUsers();
    } catch (err) {
      toast("error", "Reset mislukt: " + (err.message || err));
    }
  }

  async function onReset2fa(userId, naam) {
    var ok = await showConfirm(
      "Reset 2FA",
      "Alle 2FA-factoren van " + naam + " worden verwijderd. Bij volgende login krijgt deze gebruiker opnieuw de 2FA enrollment-wizard.",
      "Reset 2FA"
    );
    if (!ok) return;
    try {
      var r = await window.gebruikersDB.reset2fa(userId);
      toast("saved", r.message || "2FA gereset.");
      await loadUsers();
    } catch (err) {
      toast("error", "Reset mislukt: " + (err.message || err));
    }
  }

  async function onDeactivate(userId, naam) {
    var ok;
    if (window.showArchiveConfirm) {
      ok = await window.showArchiveConfirm({ preview: naam, title: "Deactiveer gebruiker?" });
    } else {
      ok = await showConfirm(
        "Deactiveer gebruiker",
        naam + " wordt gedeactiveerd. De gebruiker kan niet meer inloggen. Records blijven behouden (audit-trail intact).",
        "Deactiveer"
      );
    }
    if (!ok) return;
    try {
      var r = await window.gebruikersDB.deactivate(userId);
      toast("archived", r.message || "Gedeactiveerd.");
      await loadUsers();
    } catch (err) {
      toast("error", "Deactiveren mislukt: " + (err.message || err));
    }
  }

  async function onActivate(userId) {
    try {
      var r = await window.gebruikersDB.activate(userId);
      toast("restored", r.message || "Geactiveerd.");
      await loadUsers();
    } catch (err) {
      toast("error", "Activeren mislukt: " + (err.message || err));
    }
  }

  async function onChangeRol(userId, newRolId, oldRolId, naam, newRolNaam) {
    var ok = await showConfirm(
      "Rol wijzigen",
      "Rol van " + naam + " wijzigen naar " + newRolNaam + "?",
      "Wijzig rol"
    );
    if (!ok) {
      // Revert select
      var sel = document.querySelector('select.gebr-rol-select[data-user="' + userId + '"]');
      if (sel) sel.value = oldRolId;
      return;
    }
    try {
      var r = await window.gebruikersDB.changeRol(userId, newRolId);
      toast("saved", r.message || "Rol gewijzigd.");
      await loadUsers();
    } catch (err) {
      toast("error", "Rol wijzigen mislukt: " + (err.message || err));
      var sel2 = document.querySelector('select.gebr-rol-select[data-user="' + userId + '"]');
      if (sel2) sel2.value = oldRolId;
    }
  }

  // ---- Add user modal ----
  function openAddModal() {
    var modal = el("gebr-add-modal");
    modal.hidden = false;
    el("gebr-add-voornaam").value = "";
    el("gebr-add-achternaam").value = "";
    el("gebr-add-email").value = "";
    el("gebr-add-rol").value = "";
    el("gebr-add-err").hidden = true;
    el("gebr-add-err").textContent = "";
    setTimeout(function () { el("gebr-add-voornaam").focus(); }, 50);
  }
  function closeAddModal() {
    el("gebr-add-modal").hidden = true;
  }

  async function onAddSubmit(e) {
    e.preventDefault();
    var voornaam = el("gebr-add-voornaam").value.trim();
    var achternaam = el("gebr-add-achternaam").value.trim();
    var email = el("gebr-add-email").value.trim();
    var rol_id = el("gebr-add-rol").value;
    var errEl = el("gebr-add-err");
    errEl.hidden = true;
    if (!voornaam || !achternaam) { errEl.textContent = "Voor- en achternaam zijn verplicht."; errEl.hidden = false; return; }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errEl.textContent = "Ongeldig emailadres."; errEl.hidden = false; return; }
    if (!rol_id) { errEl.textContent = "Selecteer een rol."; errEl.hidden = false; return; }

    var btn = el("gebr-add-submit");
    btn.disabled = true; btn.textContent = "Bezig…";
    try {
      var r = await window.gebruikersDB.createUser({ voornaam: voornaam, achternaam: achternaam, email: email, rol_id: rol_id });
      toast("saved", r.message || "Gebruiker aangemaakt.");
      closeAddModal();
      await loadUsers();
    } catch (err) {
      var msg = (err && err.message) || String(err);
      errEl.textContent = msg;
      errEl.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Aanmaken";
    }
  }

  // ---- Event delegation ----
  function bindEvents() {
    el("gebr-search").addEventListener("input", function (e) {
      state.search = e.target.value;
      render();
    });
    el("gebr-show-archived").addEventListener("change", function (e) {
      state.showArchived = e.target.checked;
      render();
    });
    el("gebr-add-btn").addEventListener("click", openAddModal);
    el("gebr-add-close").addEventListener("click", closeAddModal);
    el("gebr-add-cancel").addEventListener("click", closeAddModal);
    el("gebr-add-modal").addEventListener("click", function (e) {
      if (e.target === el("gebr-add-modal")) closeAddModal();
    });
    el("gebr-add-form").addEventListener("submit", onAddSubmit);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !el("gebr-add-modal").hidden) closeAddModal();
    });

    var tbody = el("gebr-tbody");
    tbody.addEventListener("click", function (e) {
      var t = e.target;
      if (t.classList.contains("gebr-reset-pw-btn")) {
        onResetPassword(t.dataset.user, t.dataset.naam);
      } else if (t.classList.contains("gebr-reset-2fa-btn")) {
        onReset2fa(t.dataset.user, t.dataset.naam);
      } else if (t.classList.contains("gebr-deactivate-btn")) {
        onDeactivate(t.dataset.user, t.dataset.naam);
      } else if (t.classList.contains("gebr-activate-btn")) {
        onActivate(t.dataset.user);
      }
    });
    tbody.addEventListener("change", function (e) {
      var t = e.target;
      if (t.classList.contains("gebr-rol-select")) {
        var userId = t.dataset.user;
        var newRolId = t.value;
        var u = state.users.find(function (x) { return x.id === userId; });
        if (!u) return;
        var newRol = state.roles.find(function (r) { return r.id === newRolId; });
        onChangeRol(userId, newRolId, u.rol_id, fmtNaam(u), newRol ? newRol.naam : newRolId);
      }
    });
  }

  function init() {
    bindEvents();
    ensureAdminTier();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
