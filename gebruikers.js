/* global window, document */
/**
 * gebruikers.js — Gebruikersbeheer (admin-tier), geconsolideerd op bs2_role_users.
 *
 * - Toegankelijk voor admin-tier (Eigenaar/Admin/Directeur) — gecheckt via ffIsAdminTier()
 *   (permissions.js, leest bs2_role_users) en server-side door de Edge Function.
 * - listUsers/reset/deactivate/create gaan via window.gebruikersDB (Edge Function admin-user-mgmt).
 * - MULTI-ROL: elke gebruiker kan meerdere rollen hebben. Toewijzen/verwijderen gebeurt
 *   client-side via window.bs2RolesDB.addUser/removeUser (tabel bs2_role_users) — hetzelfde
 *   pad als rol-detail.html. De optelsom van permissies volgt automatisch (permissions.js).
 */
(function () {
  "use strict";

  var state = {
    users: [],
    roles: [],        // [{id, name, slug}] — alle toewijsbare bs2-rollen
    actorId: null,
    search: "",
    showArchived: false,
    rolesModalUserId: null,
    rolesModalOriginal: null, // { roleId: true } — rollen bij openen, voor diff bij Opslaan
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
  function rolesOf(u) { return Array.isArray(u.rollen) ? u.rollen : []; }

  // ---- Access control: alleen admin-tier ----
  function ensureAdminTier() {
    var tries = 0;
    function check() {
      tries++;
      var available = typeof window.ffIsAdminTier === "function" && typeof window.ffCurrentProfile !== "undefined";
      if (!available) {
        if (tries < 30) return setTimeout(check, 200);
        showNoAccess();
        return;
      }
      if (!window.ffIsAdminTier()) {
        showNoAccess();
        return;
      }
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
        var rolStr = rolesOf(u).map(function (r) { return r.name; }).join(" ");
        var hay = (fmtNaam(u) + " " + (u.email || "") + " " + rolStr).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function rolesCellHtml(u, isSelf) {
    var rollen = rolesOf(u);
    var chips = rollen.length
      ? rollen.map(function (r) { return '<span class="gebr-rol-chip">' + escapeHtml(r.name) + '</span>'; }).join("")
      : '<span class="gebr-rol-none">— geen rol —</span>';
    // Eigen account: rollen niet bewerkbaar (voorkomt self-lockout). Anders: "Wijzig"-knop.
    var btn = isSelf
      ? '<span class="gebr-self" title="Je kunt je eigen rollen niet wijzigen">(jij)</span>'
      : '<button type="button" class="btn-outline gebr-roles-edit-btn" data-user="' + escapeHtml(u.id) + '">Wijzig</button>';
    return '<div class="gebr-rollen-cell"><div class="gebr-rol-chips">' + chips + '</div>' + btn + '</div>';
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
      '<td>' + rolesCellHtml(u, isSelf) + '</td>' +
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
    renderAddRolesCheckboxes();
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
      window.showSaveModal(undefined, msg);
    } else {
      console.log("[gebr toast]", kind, msg);
    }
  }

  // ---- Actions (auth-admin via Edge Function) ----
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

  // ---- Multi-rol editor (per gebruiker) — client-side via bs2RolesDB ----
  function openRolesModal(userId) {
    var u = state.users.find(function (x) { return x.id === userId; });
    if (!u) return;
    if (u.id === state.actorId) return; // eigen rollen niet bewerkbaar
    state.rolesModalUserId = userId;
    // Originele rolset vastleggen zodat we bij Opslaan kunnen diffen.
    var orig = {};
    rolesOf(u).forEach(function (r) { orig[r.id] = true; });
    state.rolesModalOriginal = orig;
    el("gebr-roles-modal-sub").textContent = fmtNaam(u) + " · " + (u.email || "");
    renderRolesModalList(u);
    var doneBtn = el("gebr-roles-modal-done");
    if (doneBtn) { doneBtn.disabled = false; doneBtn.textContent = "Opslaan"; }
    el("gebr-roles-modal").hidden = false;
  }
  function closeRolesModal() {
    el("gebr-roles-modal").hidden = true;
    state.rolesModalUserId = null;
    state.rolesModalOriginal = null;
  }
  function renderRolesModalList(u) {
    var have = {};
    rolesOf(u).forEach(function (r) { have[r.id] = true; });
    var wrap = el("gebr-roles-modal-list");
    if (!state.roles.length) {
      wrap.innerHTML = '<p class="gebr-roles-empty">Geen rollen beschikbaar.</p>';
      return;
    }
    wrap.innerHTML = state.roles.map(function (r) {
      var on = !!have[r.id];
      return '<label class="gebr-role-opt' + (on ? " is-on" : "") + '">' +
        '<input type="checkbox" class="gebr-role-cb" data-role="' + escapeHtml(r.id) + '"' + (on ? " checked" : "") + ' />' +
        '<span class="gebr-role-opt-name">' + escapeHtml(r.name) + '</span>' +
        '</label>';
    }).join("");
  }

  // Alleen lokaal stagen — nog NIET opslaan. Pas op "Opslaan" wordt gediffd en weggeschreven.
  function onToggleRole(roleId, checked, cb) {
    var lbl = cb.closest(".gebr-role-opt");
    if (lbl) lbl.classList.toggle("is-on", checked);
  }

  // Diff de aangevinkte rollen tegen de originele set en schrijf de wijzigingen weg.
  async function saveRolesModal() {
    var u = state.users.find(function (x) { return x.id === state.rolesModalUserId; });
    if (!u || !u.email) { closeRolesModal(); return; }
    if (!window.bs2RolesDB) { toast("error", "Rollen-module niet geladen."); return; }
    var orig = state.rolesModalOriginal || {};

    // Gewenste rolset uit de checkboxes lezen.
    var desired = {};
    Array.prototype.slice.call(document.querySelectorAll("#gebr-roles-modal-list .gebr-role-cb")).forEach(function (cb) {
      if (cb.checked) desired[cb.getAttribute("data-role")] = true;
    });

    // Bepaal toe te voegen en te verwijderen rollen.
    var toAdd = Object.keys(desired).filter(function (id) { return !orig[id]; });
    var toRemove = Object.keys(orig).filter(function (id) { return !desired[id]; });

    if (!toAdd.length && !toRemove.length) { closeRolesModal(); return; }

    var doneBtn = el("gebr-roles-modal-done");
    var cancelBtn = el("gebr-roles-modal-cancel");
    if (doneBtn) { doneBtn.disabled = true; doneBtn.textContent = "Bezig…"; }
    if (cancelBtn) cancelBtn.disabled = true;

    function roleName(id) {
      var role = state.roles.find(function (r) { return r.id === id; });
      return role ? role.name : "rol";
    }
    function roleObj(id) {
      var role = state.roles.find(function (r) { return r.id === id; });
      return { id: id, name: role ? role.name : "rol", slug: role ? role.slug : null };
    }

    try {
      var i;
      for (i = 0; i < toAdd.length; i++) {
        await window.bs2RolesDB.addUser(toAdd[i], u.email, fmtNaam(u));
        if (!rolesOf(u).some(function (r) { return r.id === toAdd[i]; })) {
          u.rollen = rolesOf(u).concat([roleObj(toAdd[i])]);
        }
      }
      for (i = 0; i < toRemove.length; i++) {
        await window.bs2RolesDB.removeUser(toRemove[i], u.email);
        u.rollen = rolesOf(u).filter(function (r) { return r.id !== toRemove[i]; });
      }
      u.rollen.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "nl"); });
      updateRowChips(u);

      var parts = [];
      if (toAdd.length) parts.push(toAdd.map(roleName).join(", ") + " toegekend");
      if (toRemove.length) parts.push(toRemove.map(roleName).join(", ") + " verwijderd");
      toast("saved", "Rollen opgeslagen — " + parts.join("; ") + " bij " + fmtNaam(u));
      closeRolesModal();
    } catch (err) {
      toast("error", "Rollen opslaan mislukt: " + (err && err.message || err));
      if (doneBtn) { doneBtn.disabled = false; doneBtn.textContent = "Opslaan"; }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function updateRowChips(u) {
    var row = document.querySelector('#gebr-tbody tr[data-user="' + (window.CSS && CSS.escape ? CSS.escape(u.id) : u.id) + '"]');
    if (!row) return;
    var cell = row.children[2];
    if (cell) cell.innerHTML = rolesCellHtml(u, u.id === state.actorId);
  }

  // ---- Add user modal (multi-rol) ----
  function renderAddRolesCheckboxes() {
    var wrap = el("gebr-add-roles");
    if (!wrap) return;
    if (wrap.childElementCount && wrap.getAttribute("data-count") === String(state.roles.length)) return;
    wrap.setAttribute("data-count", String(state.roles.length));
    wrap.innerHTML = state.roles.map(function (r) {
      var def = (r.slug === "medewerker") ? " checked" : "";
      return '<label class="gebr-role-opt"><input type="checkbox" class="gebr-add-role-cb" value="' + escapeHtml(r.id) + '"' + def + ' />' +
        '<span class="gebr-role-opt-name">' + escapeHtml(r.name) + '</span></label>';
    }).join("");
  }

  function openAddModal() {
    var modal = el("gebr-add-modal");
    modal.hidden = false;
    el("gebr-add-voornaam").value = "";
    el("gebr-add-achternaam").value = "";
    el("gebr-add-email").value = "";
    el("gebr-add-err").hidden = true;
    el("gebr-add-err").textContent = "";
    wrap_resetAddRoles();
    setTimeout(function () { el("gebr-add-voornaam").focus(); }, 50);
  }
  function wrap_resetAddRoles() {
    var wrap = el("gebr-add-roles");
    if (!wrap) return;
    wrap.removeAttribute("data-count");
    renderAddRolesCheckboxes();
  }
  function closeAddModal() {
    el("gebr-add-modal").hidden = true;
  }

  async function onAddSubmit(e) {
    e.preventDefault();
    var voornaam = el("gebr-add-voornaam").value.trim();
    var achternaam = el("gebr-add-achternaam").value.trim();
    var email = el("gebr-add-email").value.trim();
    var roleIds = Array.prototype.slice.call(document.querySelectorAll(".gebr-add-role-cb:checked")).map(function (cb) { return cb.value; });
    var errEl = el("gebr-add-err");
    errEl.hidden = true;
    if (!voornaam || !achternaam) { errEl.textContent = "Voor- en achternaam zijn verplicht."; errEl.hidden = false; return; }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errEl.textContent = "Ongeldig emailadres."; errEl.hidden = false; return; }
    if (!roleIds.length) { errEl.textContent = "Selecteer minstens één rol."; errEl.hidden = false; return; }

    var btn = el("gebr-add-submit");
    btn.disabled = true; btn.textContent = "Bezig…";
    try {
      var r = await window.gebruikersDB.createUser({ voornaam: voornaam, achternaam: achternaam, email: email, role_ids: roleIds });
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

    // Rollen-modal
    el("gebr-roles-modal-close").addEventListener("click", closeRolesModal);
    el("gebr-roles-modal-cancel").addEventListener("click", closeRolesModal);
    el("gebr-roles-modal-done").addEventListener("click", saveRolesModal);
    el("gebr-roles-modal").addEventListener("click", function (e) {
      if (e.target === el("gebr-roles-modal")) closeRolesModal();
    });
    el("gebr-roles-modal-list").addEventListener("change", function (e) {
      var cb = e.target.closest(".gebr-role-cb");
      if (cb) onToggleRole(cb.getAttribute("data-role"), cb.checked, cb);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!el("gebr-add-modal").hidden) closeAddModal();
      else if (!el("gebr-roles-modal").hidden) closeRolesModal();
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
      } else if (t.classList.contains("gebr-roles-edit-btn")) {
        openRolesModal(t.dataset.user);
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
