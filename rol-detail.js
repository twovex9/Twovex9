/* global window, document */
/**
 * rol-detail.js — aparte rol-detailpagina (geen modal) 1-op-1 BS2.
 * URL: rol-detail.html?id=<bs2_roles.id>. Toont hiërarchie-niveau,
 * toegewezen gebruikers (direct opslaan) en het volledige rechten-scherm
 * (17 groepen NL, cumulatief, per-groep selecteren, vereiste permissies,
 * "buiten hiërarchisch bereik"-toggle, GEBATCHTE opslag).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fb(kind, target, extra) { if (window.showActionFeedback) { try { window.showActionFeedback(kind, target, extra); } catch (e) {} } }
  function err(msg) { if (window.showError) window.showError(msg); else console.error(msg); }
  function DB() { return window.bs2RolesDB; }
  function META() { return window.BS2_PERM_META || {}; }
  function GROUPS() { return window.BS2_PERM_GROUPS || []; }
  function pLabel(slug) { var x = META()[slug]; return x ? x.label : slug; }

  var roleId = null, pending = null, original = null, users = [];

  function getRoleId() {
    try { return new URL(location.href).searchParams.get("id"); } catch (e) { return null; }
  }
  function role() { return (DB().getRolesSync() || []).find(function (r) { return r.id === roleId; }); }
  function backToRollen() { window.location.href = "rollen.html"; }

  function permsByGroup() {
    var by = {};
    DB().getPermissionsSync().forEach(function (p) { (by[p.perm_group] = by[p.perm_group] || []).push(p); });
    return by;
  }
  function permObj(slug) { return DB().getPermissionsSync().find(function (p) { return p.slug === slug; }); }
  function siblings(slug) {
    var p = permObj(slug);
    if (!p || !p.model) return [];
    return DB().getPermissionsSync().filter(function (x) { return x.perm_group === p.perm_group && x.model === p.model; })
      .sort(function (a, b) { return (a.perm_order || 0) - (b.perm_order || 0); });
  }
  function applyCumulative(slug, on) {
    var sib = siblings(slug);
    if (!sib.length) return;
    var idx = sib.findIndex(function (x) { return x.slug === slug; });
    if (on) { for (var i = 0; i < idx; i++) pending[sib[i].slug] = { on: true, hier: (pending[sib[i].slug] || {}).hier || false }; }
    else { for (var j = idx + 1; j < sib.length; j++) if (pending[sib[j].slug]) pending[sib[j].slug].on = false; }
  }
  function dirty() {
    var keys = {};
    Object.keys(original).forEach(function (k) { keys[k] = 1; });
    Object.keys(pending).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).some(function (s) {
      var o = original[s] && original[s].on, n = pending[s] && pending[s].on;
      if (!!o !== !!n) return true;
      if (o && n && (!!(original[s].hier) !== !!(pending[s].hier))) return true;
      return false;
    });
  }
  function refreshSaveBtns() {
    var d = !dirty();
    [$("role-save-btn"), $("role-save-btn-bottom")].forEach(function (b) { if (b) b.disabled = d; });
  }

  function rightsHtml() {
    var q = (($("role-rights-search") && $("role-rights-search").value) || "").trim().toLowerCase();
    var by = permsByGroup(), html = "";
    GROUPS().forEach(function (grp) {
      var list = (by[grp.key] || []);
      if (!list.length) return;
      var shown = list.filter(function (p) {
        if (!q) return true;
        var meta = META()[p.slug] || {};
        return (meta.label || p.slug).toLowerCase().indexOf(q) >= 0 || String(meta.desc || "").toLowerCase().indexOf(q) >= 0;
      });
      if (!shown.length) return;
      var on = shown.filter(function (p) { return pending[p.slug] && pending[p.slug].on; }).length;
      html += '<div class="role-perm-group" data-group="' + esc(grp.key) + '">'
        + '<div class="role-perm-group-head">'
        + '<span class="role-perm-group-title">' + esc(grp.label) + '</span>'
        + '<span class="role-perm-group-count">' + on + '/' + shown.length + '</span>'
        + '<span class="role-perm-group-actions">'
        + '<button type="button" class="role-perm-grpbtn" data-grp="' + esc(grp.key) + '" data-on="1">Selecteer alles</button>'
        + '<button type="button" class="role-perm-grpbtn" data-grp="' + esc(grp.key) + '" data-on="0">Deselecteer alles</button>'
        + '</span></div><ul class="role-perm-list">';
      shown.forEach(function (p) {
        var meta = META()[p.slug] || { label: p.slug, desc: "" };
        var st = pending[p.slug] || { on: false, hier: false };
        var req = (p.required_permissions || []).map(pLabel).join(", ");
        html += '<li class="role-perm-item' + (st.on ? " is-on" : "") + '">'
          + '<label class="role-perm-main2"><input type="checkbox" class="role-perm-cb" data-slug="' + esc(p.slug) + '"' + (st.on ? " checked" : "") + '>'
          + '<span class="role-perm-text"><span class="role-perm-label">' + esc(meta.label) + '</span>'
          + '<span class="role-perm-desc">' + esc(meta.desc) + '</span>'
          + (req ? '<span class="role-perm-req">Vereiste permissies: ' + esc(req) + '</span>' : '')
          + '</span></label>'
          + (p.allows_hierarchical_configuration
              ? '<label class="role-perm-hier' + (st.on ? "" : " is-disabled") + '">'
                + '<input type="checkbox" class="role-perm-hcb" data-slug="' + esc(p.slug) + '"' + (st.hier ? " checked" : "") + (st.on ? "" : " disabled") + '>'
                + '<span><b>Buiten hiërarchisch bereik toegang verlenen</b><br>'
                + 'Wanneer ingeschakeld, kunnen gebruikers met deze toestemming deze bron buiten de hiërarchie van hun rol bekijken.</span></label>'
              : '')
          + '</li>';
      });
      html += '</ul></div>';
    });
    return html || '<div class="rollen-loading">Geen rechten matchen de zoekopdracht.</div>';
  }
  function renderRights() { $("role-perm-wrap").innerHTML = rightsHtml(); refreshSaveBtns(); }

  function buildUsers() {
    var h = '<div class="role-users-head"><strong>Toegewezen gebruikers</strong> <span class="role-users-count">' + users.length + '</span></div><ul class="role-users-list">';
    if (!users.length) h += '<li class="role-users-empty">Nog niemand toegewezen.</li>';
    users.forEach(function (x) {
      h += '<li class="role-user-row"><span class="role-user-name">' + esc(x.user_name || "—")
        + '</span> <span class="role-user-email">' + esc(x.user_email) + '</span>'
        + '<button type="button" class="role-user-remove" data-email="' + esc(x.user_email) + '" aria-label="Verwijder uit rol" title="Verwijder uit rol">✕</button></li>';
    });
    h += '</ul>';
    var assigned = {}; users.forEach(function (x) { assigned[(x.user_email || "").toLowerCase()] = 1; });
    var profs = DB().getProfilesSync().filter(function (p) { return !assigned[p.email.toLowerCase()]; });
    h += '<div class="role-user-add"><select id="role-user-select" class="search"><option value="">— kies medewerker —</option>'
      + profs.map(function (p) { return '<option value="' + esc(p.email) + '" data-naam="' + esc(p.naam) + '">' + esc(p.naam) + ' (' + esc(p.email) + ')</option>'; }).join("")
      + '</select> <button type="button" class="btn-primary" id="role-user-add-btn">+ Toevoegen</button></div>';
    return h;
  }

  function fillPage(r) {
    var levels = DB().getLevelsSync();
    document.title = r.name + " — Rol";
    $("role-modal-title").textContent = r.name;
    $("role-modal-sub").textContent = (r.user_count || 0) + " gebruikers"
      + (r.slug ? " · " + r.slug : "") + (r.description ? " — " + r.description : "");
    var sel = $("role-level-select");
    sel.innerHTML = '<option value="">Niet ingedeeld</option>'
      + levels.map(function (l) { return '<option value="' + esc(l.id) + '"' + (r.hierarchy_level_id === l.id ? " selected" : "") + '>' + esc(l.name) + '</option>'; }).join("");
    $("role-users-wrap").innerHTML = buildUsers();
    renderRights();
    $("rd-page").setAttribute("aria-busy", "false");
  }

  async function load() {
    roleId = getRoleId();
    if (!roleId) { backToRollen(); return; }
    try {
      await DB().ready;
      var r = role();
      if (!r) { err("Rol niet gevonden."); backToRollen(); return; }
      var d = await DB().loadRoleDetail(roleId);
      original = {}; pending = {};
      DB().getPermissionsSync().forEach(function (p) {
        var v = d.perms[p.slug];
        original[p.slug] = { on: !!(v && v.on), hier: !!(v && v.hier) };
        pending[p.slug] = { on: !!(v && v.on), hier: !!(v && v.hier) };
      });
      users = d.users || [];
      fillPage(r);
    } catch (e) { err("Rol laden mislukt: " + (e && e.message || e)); }
  }

  async function saveRights() {
    var r = role(); if (!r) return;
    var add = [], remove = [], hier = [];
    Object.keys(pending).forEach(function (s) {
      var o = original[s] || { on: false, hier: false }, n = pending[s];
      if (n.on && !o.on) add.push({ slug: s, hier: !!n.hier });
      else if (!n.on && o.on) remove.push(s);
      else if (n.on && o.on && (!!n.hier !== !!o.hier)) hier.push({ slug: s, hier: !!n.hier });
    });
    if (!add.length && !remove.length && !hier.length) { backToRollen(); return; }
    [$("role-save-btn"), $("role-save-btn-bottom")].forEach(function (b) { if (b) b.disabled = true; });
    try {
      await DB().applyPermDiff(r.id, add, remove, hier);
      fb("updated", "Rechten van rol " + r.name);
      backToRollen();
    } catch (e) { err("Opslaan mislukt: " + (e && e.message || e)); refreshSaveBtns(); }
  }

  function wire() {
    [$("role-save-btn"), $("role-save-btn-bottom")].forEach(function (b) { if (b) b.addEventListener("click", saveRights); });

    $("role-level-select").addEventListener("change", async function (e) {
      var r = role(); if (!r) return;
      try { await DB().setLevel(r.id, e.target.value || null); fb("updated", "Rol-niveau: " + r.name); }
      catch (ex) { err("Niveau opslaan mislukt: " + (ex && ex.message || ex)); }
    });

    var rs = $("role-rights-search");
    if (rs) { var d = null; rs.addEventListener("input", function () { if (d) clearTimeout(d); d = setTimeout(renderRights, 120); }); }

    $("role-perm-wrap").addEventListener("change", function (e) {
      var cb = e.target.closest(".role-perm-cb");
      if (cb) {
        var s = cb.getAttribute("data-slug");
        if (!pending[s]) pending[s] = { on: false, hier: false };
        pending[s].on = cb.checked;
        if (!cb.checked) pending[s].hier = false;
        applyCumulative(s, cb.checked);
        renderRights();
        return;
      }
      var hc = e.target.closest(".role-perm-hcb");
      if (hc) {
        var s2 = hc.getAttribute("data-slug");
        if (pending[s2]) { pending[s2].hier = hc.checked; refreshSaveBtns(); }
      }
    });
    $("role-perm-wrap").addEventListener("click", function (e) {
      var b = e.target.closest(".role-perm-grpbtn"); if (!b) return;
      var grp = b.getAttribute("data-grp"), on = b.getAttribute("data-on") === "1";
      DB().getPermissionsSync().filter(function (p) { return p.perm_group === grp; }).forEach(function (p) {
        if (!pending[p.slug]) pending[p.slug] = { on: false, hier: false };
        pending[p.slug].on = on;
        if (!on) pending[p.slug].hier = false;
      });
      renderRights();
    });

    $("role-users-wrap").addEventListener("click", async function (e) {
      var r = role(); if (!r) return;
      var rm = e.target.closest(".role-user-remove");
      if (rm) {
        var email = rm.getAttribute("data-email");
        try {
          await DB().removeUser(r.id, email);
          users = users.filter(function (u) { return u.user_email !== email; });
          $("role-users-wrap").innerHTML = buildUsers();
          fb("deleted", "Gebruiker uit rol " + r.name);
        } catch (ex) { err("Verwijderen mislukt: " + (ex && ex.message || ex)); }
        return;
      }
      var add = e.target.closest("#role-user-add-btn");
      if (add) {
        var sEl = $("role-user-select"); if (!sEl || !sEl.value) return;
        var em = sEl.value, naam = sEl.options[sEl.selectedIndex] ? sEl.options[sEl.selectedIndex].getAttribute("data-naam") : "";
        add.disabled = true;
        try {
          await DB().addUser(r.id, em, naam);
          users.push({ user_email: em, user_name: naam, status: null });
          users.sort(function (a, b) { return String(a.user_name || "").localeCompare(String(b.user_name || ""), "nl"); });
          $("role-users-wrap").innerHTML = buildUsers();
          fb("added", "Gebruiker aan rol " + r.name, naam);
        } catch (ex) { err("Toevoegen mislukt: " + (ex && ex.message || ex)); }
        finally { add.disabled = false; }
      }
    });

    // waarschuw bij weg-navigeren met niet-opgeslagen wijzigingen
    window.addEventListener("beforeunload", function (e) {
      if (pending && original && dirty()) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  document.addEventListener("DOMContentLoaded", function () { wire(); load(); });
})();
