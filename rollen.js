/* global window, document */
/**
 * rollen.js — Rollen-beheer 1-op-1 BS2 (model uit bs2RolesDB).
 * Rollen per hiërarchie-niveau; rol-detail = machtigingen-matrix
 * (146 permissies, 17 groepen) + toegewezen gebruikers + niveau.
 * Elke mutatie → Supabase + showActionFeedback (auto-audited).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fb(kind, target, extra) {
    if (window.showActionFeedback) { try { window.showActionFeedback(kind, target, extra); } catch (e) { /* */ } }
  }
  function err(msg) {
    if (window.showError) window.showError(msg); else console.error(msg);
  }

  var DB = function () { return window.bs2RolesDB; };
  var openRoleId = null;
  var detailCache = null; // {permSlugs, users}

  // ---------------- lijst ----------------
  function render() {
    var c = $("rollen-body");
    if (!c) return;
    var db = DB();
    if (!db) { c.innerHTML = '<div class="rollen-loading">Data-laag niet geladen.</div>'; return; }
    var q = (($("rollen-search") && $("rollen-search").value) || "").trim().toLowerCase();
    var groups = db.getGroupedSync();
    var totalRoles = 0, totalUsers = 0, html = "";
    groups.forEach(function (g) {
      var roles = g.roles.filter(function (r) {
        if (!q) return true;
        return String(r.name || "").toLowerCase().indexOf(q) >= 0;
      });
      if (!roles.length) return;
      var gu = roles.reduce(function (s, r) { return s + (r.user_count || 0); }, 0);
      totalRoles += roles.length; totalUsers += gu;
      html += '<div class="rollen-section"><div class="rollen-section-head">'
        + '<h2 class="rollen-section-title">' + esc(g.level.name) + '</h2>'
        + '<span class="rollen-section-meta">' + roles.length + ' rollen · ' + gu + ' gebruikers</span>'
        + '</div><div class="rollen-cards">';
      roles.forEach(function (r) {
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

  // ---------------- rol-detail modal ----------------
  function closeModal() {
    var m = $("role-modal");
    if (m) { m.hidden = true; m.classList.remove("is-open"); }
    document.body.style.overflow = "";
    openRoleId = null; detailCache = null;
  }

  function buildPermMatrix(role) {
    var perms = DB().getPermissionsSync();
    var byGroup = {};
    perms.forEach(function (p) { (byGroup[p.perm_group || "overig"] = byGroup[p.perm_group || "overig"] || []).push(p); });
    var groups = Object.keys(byGroup).sort();
    var h = '';
    groups.forEach(function (g) {
      var list = byGroup[g];
      var on = list.filter(function (p) { return detailCache.permSlugs[p.slug]; }).length;
      h += '<div class="role-perm-group" data-group="' + esc(g) + '">'
        + '<div class="role-perm-group-head">'
        + '<button type="button" class="role-perm-grouptoggle" data-group="' + esc(g) + '" data-allon="' + (on === list.length ? "1" : "0") + '">'
        + (on === list.length ? "Alles uit" : "Alles aan") + '</button>'
        + '<span class="role-perm-group-title">' + esc(g) + '</span>'
        + '<span class="role-perm-group-count">' + on + '/' + list.length + '</span></div>'
        + '<ul class="role-perm-list">';
      list.forEach(function (p) {
        var checked = !!detailCache.permSlugs[p.slug];
        h += '<li><label class="role-perm-item"><input type="checkbox" class="role-perm-cb" data-slug="'
          + esc(p.slug) + '"' + (checked ? " checked" : "") + '> <span>' + esc(p.slug)
          + (p.is_main ? ' <em class="role-perm-main">hoofd</em>' : '') + '</span></label></li>';
      });
      h += '</ul></div>';
    });
    return h;
  }

  function buildUsers() {
    var u = detailCache.users || [];
    var h = '<div class="role-users-head"><strong>Toegewezen gebruikers</strong> <span class="role-users-count">'
      + u.length + '</span></div><ul class="role-users-list">';
    if (!u.length) h += '<li class="role-users-empty">Nog niemand toegewezen.</li>';
    u.forEach(function (x) {
      h += '<li class="role-user-row"><span class="role-user-name">' + esc(x.user_name || "—")
        + '</span> <span class="role-user-email">' + esc(x.user_email) + '</span>'
        + '<button type="button" class="role-user-remove" data-email="' + esc(x.user_email)
        + '" aria-label="Verwijder uit rol" title="Verwijder uit rol">✕</button></li>';
    });
    h += '</ul>';
    // toevoegen
    var assigned = {};
    u.forEach(function (x) { assigned[(x.user_email || "").toLowerCase()] = 1; });
    var profs = DB().getProfilesSync().filter(function (p) { return !assigned[p.email.toLowerCase()]; });
    h += '<div class="role-user-add"><select id="role-user-select" class="search">'
      + '<option value="">— kies medewerker —</option>'
      + profs.map(function (p) { return '<option value="' + esc(p.email) + '" data-naam="' + esc(p.naam) + '">' + esc(p.naam) + ' (' + esc(p.email) + ')</option>'; }).join("")
      + '</select> <button type="button" class="btn-primary" id="role-user-add-btn">+ Toevoegen</button></div>';
    return h;
  }

  function fillModal(role) {
    var levels = DB().getLevelsSync();
    $("role-modal-title").textContent = role.name;
    $("role-modal-sub").textContent = (role.slug ? role.slug : "") + (role.description ? " — " + role.description : "");
    var sel = $("role-level-select");
    sel.innerHTML = '<option value="">Niet ingedeeld</option>'
      + levels.map(function (l) { return '<option value="' + esc(l.id) + '"' + (role.hierarchy_level_id === l.id ? " selected" : "") + '>' + esc(l.name) + '</option>'; }).join("");
    $("role-perm-wrap").innerHTML = buildPermMatrix(role);
    $("role-users-wrap").innerHTML = buildUsers();
  }

  function currentRole() { return DB().getRolesSync().find(function (r) { return r.id === openRoleId; }); }

  async function openRole(id) {
    openRoleId = id;
    var role = currentRole();
    if (!role) return;
    var m = $("role-modal");
    $("role-modal-title").textContent = role.name;
    $("role-perm-wrap").innerHTML = '<div class="rollen-loading">Laden…</div>';
    $("role-users-wrap").innerHTML = "";
    m.hidden = false; m.classList.add("is-open");
    document.body.style.overflow = "hidden";
    try {
      detailCache = await DB().loadRoleDetail(id);
      if (openRoleId !== id) return;
      fillModal(role);
    } catch (e) { err("Rol laden mislukt: " + (e && e.message || e)); closeModal(); }
  }

  function refreshPermGroupCount(group) {
    var wrap = $("role-perm-wrap");
    var gEl = wrap.querySelector('.role-perm-group[data-group="' + (window.CSS && CSS.escape ? CSS.escape(group) : group) + '"]');
    if (!gEl) return;
    var cbs = gEl.querySelectorAll(".role-perm-cb");
    var on = 0; cbs.forEach(function (c) { if (c.checked) on++; });
    gEl.querySelector(".role-perm-group-count").textContent = on + "/" + cbs.length;
    var bt = gEl.querySelector(".role-perm-grouptoggle");
    bt.setAttribute("data-allon", on === cbs.length ? "1" : "0");
    bt.textContent = on === cbs.length ? "Alles uit" : "Alles aan";
  }

  function wireModal() {
    var m = $("role-modal");
    if (!m) return;
    $("role-modal-close").addEventListener("click", closeModal);
    m.addEventListener("click", function (e) { if (e.target === m) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) closeModal(); });

    $("role-level-select").addEventListener("change", async function (e) {
      var role = currentRole(); if (!role) return;
      try { await DB().setLevel(role.id, e.target.value || null); fb("updated", "Rol-niveau: " + role.name); render(); }
      catch (ex) { err("Niveau opslaan mislukt: " + (ex && ex.message || ex)); }
    });

    // permissie-toggle (delegated)
    $("role-perm-wrap").addEventListener("change", async function (e) {
      var cb = e.target.closest(".role-perm-cb"); if (!cb) return;
      var role = currentRole(); if (!role) return;
      var slug = cb.getAttribute("data-slug"), on = cb.checked;
      cb.disabled = true;
      try {
        await DB().togglePerm(role.id, slug, on);
        detailCache.permSlugs[slug] = on || undefined;
        if (!on) delete detailCache.permSlugs[slug];
        var grp = cb.closest(".role-perm-group"); if (grp) refreshPermGroupCount(grp.getAttribute("data-group"));
        fb("updated", "Machtiging " + (on ? "aan" : "uit") + ": " + slug, role.name);
        render();
      } catch (ex) { cb.checked = !on; err("Machtiging opslaan mislukt: " + (ex && ex.message || ex)); }
      finally { cb.disabled = false; }
    });

    // groep alles aan/uit
    $("role-perm-wrap").addEventListener("click", async function (e) {
      var bt = e.target.closest(".role-perm-grouptoggle"); if (!bt) return;
      var role = currentRole(); if (!role) return;
      var grp = bt.closest(".role-perm-group");
      var want = bt.getAttribute("data-allon") !== "1"; // true => alles aan
      var cbs = [].slice.call(grp.querySelectorAll(".role-perm-cb"));
      bt.disabled = true;
      try {
        for (var i = 0; i < cbs.length; i++) {
          var cb = cbs[i], slug = cb.getAttribute("data-slug");
          if (cb.checked === want) continue;
          await DB().togglePerm(role.id, slug, want);
          cb.checked = want;
          if (want) detailCache.permSlugs[slug] = true; else delete detailCache.permSlugs[slug];
        }
        refreshPermGroupCount(grp.getAttribute("data-group"));
        fb("updated", "Groep " + grp.getAttribute("data-group") + " " + (want ? "aan" : "uit"), role.name);
        render();
      } catch (ex) { err("Groep opslaan mislukt: " + (ex && ex.message || ex)); }
      finally { bt.disabled = false; }
    });

    // gebruikers toevoegen/verwijderen (delegated)
    $("role-users-wrap").addEventListener("click", async function (e) {
      var role = currentRole(); if (!role) return;
      var rm = e.target.closest(".role-user-remove");
      if (rm) {
        var email = rm.getAttribute("data-email");
        try {
          await DB().removeUser(role.id, email);
          detailCache.users = detailCache.users.filter(function (u) { return u.user_email !== email; });
          $("role-users-wrap").innerHTML = buildUsers();
          fb("deleted", "Gebruiker uit rol " + role.name);
          render();
        } catch (ex) { err("Verwijderen mislukt: " + (ex && ex.message || ex)); }
        return;
      }
      var add = e.target.closest("#role-user-add-btn");
      if (add) {
        var s = $("role-user-select"); if (!s || !s.value) return;
        var email = s.value, naam = s.options[s.selectedIndex] ? s.options[s.selectedIndex].getAttribute("data-naam") : "";
        add.disabled = true;
        try {
          await DB().addUser(role.id, email, naam);
          detailCache.users.push({ user_email: email, user_name: naam, status: null });
          detailCache.users.sort(function (a, b) { return String(a.user_name || "").localeCompare(String(b.user_name || ""), "nl"); });
          $("role-users-wrap").innerHTML = buildUsers();
          fb("added", "Gebruiker aan rol " + role.name, naam);
          render();
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
    if (rb) rb.addEventListener("click", function () { if (DB() && DB().refresh) DB().refresh().catch(function () {}); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireList(); wireModal(); render();
    if (DB() && DB().ready) Promise.resolve(DB().ready).then(render, render);
  });
  window.addEventListener("besa:bs2-roles-updated", render);
})();
