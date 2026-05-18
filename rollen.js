/* global window, document */
/**
 * rollen.js — Rollen-beheer 1-op-1 BS2.
 * Lijst = organogram per hiërarchie-niveau. Rol openen → modal met:
 *  - Hiërarchie-niveau (direct opslaan)
 *  - Toegewezen gebruikers (direct toevoegen/verwijderen)
 *  - Rechten: 17 groepen (BS2-volgorde, NL labels/beschrijvingen), cumulatief
 *    model (Beheren ⊇ Bekijken ⊇ Browsen), per-groep Selecteer/Deselecteer
 *    alles, "Vereiste permissies", "Buiten hiërarchisch bereik"-toggle,
 *    GEBATCHTE opslag (Annuleren / Wijzigingen opslaan).
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

  var openRoleId = null;
  var pending = null;   // { slug: {on:bool, hier:bool} }  bewerkbare staat
  var original = null;  // referentiestaat voor diff/annuleren

  // ---------------- organogram ----------------
  function render() {
    var c = $("rollen-body");
    if (!c) return;
    var db = DB();
    if (!db) { c.innerHTML = '<div class="rollen-loading">Data-laag niet geladen.</div>'; return; }
    var q = (($("rollen-search") && $("rollen-search").value) || "").trim().toLowerCase();
    var groups = db.getGroupedSync();
    var totalRoles = 0, totalUsers = 0, html = "";
    groups.forEach(function (g) {
      var roles = g.roles.filter(function (r) { return !q || String(r.name || "").toLowerCase().indexOf(q) >= 0; });
      var gu = roles.reduce(function (s, r) { return s + (r.user_count || 0); }, 0);
      totalRoles += roles.length; totalUsers += gu;
      html += '<div class="rollen-section"><div class="rollen-section-head">'
        + '<h2 class="rollen-section-title">' + esc(g.level.name) + '</h2>'
        + '<span class="rollen-section-meta">' + roles.length + ' rollen · ' + gu + ' gebruikers</span>'
        + '</div><div class="rollen-cards">';
      if (!roles.length) {
        html += '<div class="rollen-loading" style="grid-column:1/-1">Geen rollen in dit niveau</div>';
      } else roles.forEach(function (r) {
        html += '<article class="rollen-card' + ((r.user_count || 0) === 0 ? ' rollen-card--empty' : '')
          + '" data-role-id="' + esc(r.id) + '" tabindex="0" role="button" aria-label="Open rol ' + esc(r.name) + '">'
          + '<div class="rollen-card-head"><h3 class="rollen-card-title">' + esc(r.name) + '</h3>'
          + '<span class="rollen-card-badge">' + (r.user_count || 0) + ' gebruikers</span></div>'
          + '<p class="rollen-card-desc">' + (r.perm_count || 0) + ' machtigingen'
          + (r.description ? ' · ' + esc(r.description) : '') + '</p></article>';
      });
      html += '</div></div>';
    });
    c.innerHTML = html || '<div class="rollen-loading">Geen rollen matchen "' + esc(q) + '".</div>';
    c.setAttribute("aria-busy", "false");
    var t = $("rollen-totaal");
    if (t) t.textContent = totalRoles + " rollen, " + totalUsers + " gebruikers";
  }

  function currentRole() { return DB().getRolesSync().find(function (r) { return r.id === openRoleId; }); }

  // ---------------- modal ----------------
  function closeModal() {
    var m = $("role-modal");
    if (m) { m.hidden = true; m.classList.remove("is-open"); }
    document.body.style.overflow = "";
    openRoleId = null; pending = null; original = null;
  }

  // catalogus gegroepeerd op perm_group (slug-volgorde uit DB = perm_order)
  function permsByGroup() {
    var by = {};
    DB().getPermissionsSync().forEach(function (p) { (by[p.perm_group] = by[p.perm_group] || []).push(p); });
    return by;
  }
  function permObj(slug) { return DB().getPermissionsSync().find(function (p) { return p.slug === slug; }); }

  // cumulatief: Beheren ⊇ Bekijken ⊇ Browsen (zelfde model + groep, op perm_order)
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
  function refreshSaveBtn() {
    var b = $("role-save-btn"); if (b) b.disabled = !dirty();
  }

  function rightsHtml() {
    var q = (($("role-rights-search") && $("role-rights-search").value) || "").trim().toLowerCase();
    var by = permsByGroup();
    var html = "";
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

  function renderRights() { $("role-perm-wrap").innerHTML = rightsHtml(); refreshSaveBtn(); }

  function fillModal(role) {
    var levels = DB().getLevelsSync();
    $("role-modal-title").textContent = role.name;
    $("role-modal-sub").textContent = (role.user_count || 0) + " gebruikers"
      + (role.slug ? " · " + role.slug : "") + (role.description ? " — " + role.description : "");
    var sel = $("role-level-select");
    sel.innerHTML = '<option value="">Niet ingedeeld</option>'
      + levels.map(function (l) { return '<option value="' + esc(l.id) + '"' + (role.hierarchy_level_id === l.id ? " selected" : "") + '>' + esc(l.name) + '</option>'; }).join("");
    $("role-users-wrap").innerHTML = buildUsers();
    renderRights();
  }

  function buildUsers() {
    var u = (window.__roleUsers || []);
    var h = '<div class="role-users-head"><strong>Toegewezen gebruikers</strong> <span class="role-users-count">' + u.length + '</span></div><ul class="role-users-list">';
    if (!u.length) h += '<li class="role-users-empty">Nog niemand toegewezen.</li>';
    u.forEach(function (x) {
      h += '<li class="role-user-row"><span class="role-user-name">' + esc(x.user_name || "—")
        + '</span> <span class="role-user-email">' + esc(x.user_email) + '</span>'
        + '<button type="button" class="role-user-remove" data-email="' + esc(x.user_email) + '" aria-label="Verwijder uit rol" title="Verwijder uit rol">✕</button></li>';
    });
    h += '</ul>';
    var assigned = {}; u.forEach(function (x) { assigned[(x.user_email || "").toLowerCase()] = 1; });
    var profs = DB().getProfilesSync().filter(function (p) { return !assigned[p.email.toLowerCase()]; });
    h += '<div class="role-user-add"><select id="role-user-select" class="search"><option value="">— kies medewerker —</option>'
      + profs.map(function (p) { return '<option value="' + esc(p.email) + '" data-naam="' + esc(p.naam) + '">' + esc(p.naam) + ' (' + esc(p.email) + ')</option>'; }).join("")
      + '</select> <button type="button" class="btn-primary" id="role-user-add-btn">+ Toevoegen</button></div>';
    return h;
  }

  async function openRole(id) {
    openRoleId = id;
    var role = currentRole(); if (!role) return;
    var m = $("role-modal");
    $("role-modal-title").textContent = role.name;
    $("role-perm-wrap").innerHTML = '<div class="rollen-loading">Laden…</div>';
    $("role-users-wrap").innerHTML = "";
    var rs = $("role-rights-search"); if (rs) rs.value = "";
    m.hidden = false; m.classList.add("is-open");
    document.body.style.overflow = "hidden";
    try {
      var d = await DB().loadRoleDetail(id);
      if (openRoleId !== id) return;
      original = {}; pending = {};
      DB().getPermissionsSync().forEach(function (p) {
        var v = d.perms[p.slug];
        original[p.slug] = { on: !!(v && v.on), hier: !!(v && v.hier) };
        pending[p.slug] = { on: !!(v && v.on), hier: !!(v && v.hier) };
      });
      window.__roleUsers = d.users || [];
      fillModal(role);
    } catch (e) { err("Rol laden mislukt: " + (e && e.message || e)); closeModal(); }
  }

  async function saveRights() {
    var role = currentRole(); if (!role) return;
    var add = [], remove = [], hier = [];
    Object.keys(pending).forEach(function (s) {
      var o = original[s] || { on: false, hier: false }, n = pending[s];
      if (n.on && !o.on) add.push({ slug: s, hier: !!n.hier });
      else if (!n.on && o.on) remove.push(s);
      else if (n.on && o.on && (!!n.hier !== !!o.hier)) hier.push({ slug: s, hier: !!n.hier });
    });
    if (!add.length && !remove.length && !hier.length) { closeModal(); return; }
    var btn = $("role-save-btn"); if (btn) btn.disabled = true;
    try {
      await DB().applyPermDiff(role.id, add, remove, hier);
      fb("updated", "Rechten van rol " + role.name);
      original = JSON.parse(JSON.stringify(pending));
      render();
      closeModal();
    } catch (e) { err("Opslaan mislukt: " + (e && e.message || e)); if (btn) btn.disabled = false; }
  }

  function wireModal() {
    var m = $("role-modal"); if (!m) return;
    $("role-modal-close").addEventListener("click", closeModal);
    $("role-cancel-btn").addEventListener("click", closeModal);
    $("role-save-btn").addEventListener("click", saveRights);
    m.addEventListener("click", function (e) { if (e.target === m) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) closeModal(); });

    $("role-level-select").addEventListener("change", async function (e) {
      var role = currentRole(); if (!role) return;
      try { await DB().setLevel(role.id, e.target.value || null); fb("updated", "Rol-niveau: " + role.name); render(); }
      catch (ex) { err("Niveau opslaan mislukt: " + (ex && ex.message || ex)); }
    });

    var rs = $("role-rights-search");
    if (rs) { var d = null; rs.addEventListener("input", function () { if (d) clearTimeout(d); d = setTimeout(renderRights, 120); }); }

    // rechten: checkbox + hiër-toggle + groep-knoppen (gedelegeerd, geen DB tot Opslaan)
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
        if (pending[s2]) { pending[s2].hier = hc.checked; refreshSaveBtn(); }
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

    // gebruikers (direct opslaan)
    $("role-users-wrap").addEventListener("click", async function (e) {
      var role = currentRole(); if (!role) return;
      var rm = e.target.closest(".role-user-remove");
      if (rm) {
        var email = rm.getAttribute("data-email");
        try {
          await DB().removeUser(role.id, email);
          window.__roleUsers = (window.__roleUsers || []).filter(function (u) { return u.user_email !== email; });
          $("role-users-wrap").innerHTML = buildUsers();
          fb("deleted", "Gebruiker uit rol " + role.name); render();
        } catch (ex) { err("Verwijderen mislukt: " + (ex && ex.message || ex)); }
        return;
      }
      var add = e.target.closest("#role-user-add-btn");
      if (add) {
        var sEl = $("role-user-select"); if (!sEl || !sEl.value) return;
        var em = sEl.value, naam = sEl.options[sEl.selectedIndex] ? sEl.options[sEl.selectedIndex].getAttribute("data-naam") : "";
        add.disabled = true;
        try {
          await DB().addUser(role.id, em, naam);
          (window.__roleUsers = window.__roleUsers || []).push({ user_email: em, user_name: naam, status: null });
          window.__roleUsers.sort(function (a, b) { return String(a.user_name || "").localeCompare(String(b.user_name || ""), "nl"); });
          $("role-users-wrap").innerHTML = buildUsers();
          fb("added", "Gebruiker aan rol " + role.name, naam); render();
        } catch (ex) { err("Toevoegen mislukt: " + (ex && ex.message || ex)); }
        finally { add.disabled = false; }
      }
    });
  }

  function wireList() {
    var body = $("rollen-body");
    if (body) {
      body.addEventListener("click", function (e) {
        var card = e.target.closest(".rollen-card[data-role-id]");
        if (card) openRole(card.getAttribute("data-role-id"));
      });
      body.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var card = e.target.closest(".rollen-card[data-role-id]");
        if (card) { e.preventDefault(); openRole(card.getAttribute("data-role-id")); }
      });
    }
    var s = $("rollen-search");
    if (s) { var d = null; s.addEventListener("input", function () { if (d) clearTimeout(d); d = setTimeout(render, 150); }); }
    var rb = $("rollen-refresh");
    if (rb) rb.addEventListener("click", function () { if (DB() && DB().refresh) DB().refresh().then(render).catch(function () {}); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireList(); wireModal(); render();
    if (DB() && DB().ready) Promise.resolve(DB().ready).then(render, render);
  });
  window.addEventListener("besa:bs2-roles-updated", render);
})();
