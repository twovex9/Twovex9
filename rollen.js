/* global window, document */
/**
 * rollen.js — organogram (rollen per hiërarchie-niveau). Klik op een rol
 * → aparte pagina rol-detail.html?id=<id> (geen modal meer).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function DB() { return window.bs2RolesDB; }

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

  function openRole(id) {
    if (id) window.location.href = "rol-detail.html?id=" + encodeURIComponent(id);
  }

  function wire() {
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
    wire(); render();
    if (DB() && DB().ready) Promise.resolve(DB().ready).then(render, render);
  });
  window.addEventListener("ff:bs2-roles-updated", render);
})();
