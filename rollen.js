/* global window, document */
/**
 * rollen.js — render hiërarchisch organogram met secties + rollen + counts.
 *
 * Sprint 1 / item 42-A. Mirror van BS2 /organization/roles maar read-only
 * (drag-drop voor v3). Live-refresh op `besa:org-rollen-updated` event.
 */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function $(id) { return document.getElementById(id); }

  function renderTotaal(rolesCount, usersCount) {
    var el = $("rollen-totaal");
    if (!el) return;
    el.textContent = rolesCount + " rollen, " + usersCount + " gebruikers";
  }

  function renderOrganogram() {
    var container = $("rollen-organogram");
    if (!container) return;
    if (!window.orgRollenDB || typeof window.orgRollenDB.getOrganogramSync !== "function") {
      container.innerHTML = '<div class="rollen-loading">Data-laag niet geladen.</div>';
      return;
    }
    var query = ($("rollen-search") && $("rollen-search").value || "").trim().toLowerCase();
    var organogram = window.orgRollenDB.getOrganogramSync();

    if (organogram.length === 0) {
      container.innerHTML = '<div class="rollen-loading">Nog geen rollen aangemaakt.</div>';
      container.setAttribute("aria-busy", "false");
      renderTotaal(0, 0);
      return;
    }

    // Filter op zoek-query (matcht sectie-naam of rol-naam)
    var matchesQuery = function (text) {
      if (!query) return true;
      return String(text || "").toLowerCase().indexOf(query) >= 0;
    };

    var totalRoles = 0;
    var totalUsers = 0;
    var html = "";

    organogram.forEach(function (group) {
      var matchSection = matchesQuery(group.section.naam);
      var matchingRoles = group.roles.filter(function (r) {
        return matchSection || matchesQuery(r.naam);
      });
      if (!matchSection && matchingRoles.length === 0) return;
      var rolesToShow = matchSection ? group.roles : matchingRoles;

      totalRoles += rolesToShow.length;
      var sectionUsers = rolesToShow.reduce(function (sum, r) {
        return sum + (r.gebruikers_count || 0);
      }, 0);
      totalUsers += sectionUsers;

      html += '<div class="rollen-section">'
        + '<div class="rollen-section-head">'
        +   '<h2 class="rollen-section-title">' + escapeHtml(group.section.naam) + '</h2>'
        +   '<span class="rollen-section-meta">' + rolesToShow.length + ' rollen · ' + sectionUsers + ' gebruikers</span>'
        + '</div>';
      if (group.section.beschrijving) {
        html += '<p class="rollen-section-desc">' + escapeHtml(group.section.beschrijving) + '</p>';
      }
      html += '<div class="rollen-cards">';
      rolesToShow.forEach(function (r) {
        var cnt = r.gebruikers_count || 0;
        var emptyClass = cnt === 0 ? " rollen-card--empty" : "";
        html += '<article class="rollen-card' + emptyClass + '" data-role-id="' + escapeHtml(r.id) + '">'
          + '<div class="rollen-card-head">'
          +   '<h3 class="rollen-card-title">' + escapeHtml(r.naam) + '</h3>'
          +   '<span class="rollen-card-badge">' + cnt + ' gebruikers</span>'
          + '</div>'
          + (r.beschrijving
              ? '<p class="rollen-card-desc">' + escapeHtml(r.beschrijving) + '</p>'
              : '')
          + '</article>';
      });
      html += '</div></div>';
    });

    if (!html) {
      container.innerHTML = '<div class="rollen-loading">Geen rollen of secties matchen "' + escapeHtml(query) + '".</div>';
      container.setAttribute("aria-busy", "false");
      renderTotaal(0, 0);
      return;
    }

    container.innerHTML = html;
    container.setAttribute("aria-busy", "false");
    renderTotaal(totalRoles, totalUsers);
  }

  // Initial render (toont cache direct als er is, daarna re-render na bootstrap)
  document.addEventListener("DOMContentLoaded", function () {
    renderOrganogram(); // 1e poging — toont cache als die er is

    // Wacht op data-laag bootstrap en re-render (fix voor lege cache op first-load)
    if (window.orgRollenDB && window.orgRollenDB.ready) {
      Promise.resolve(window.orgRollenDB.ready).then(renderOrganogram, renderOrganogram);
    }

    // Search input
    var search = $("rollen-search");
    if (search) {
      var debounce = null;
      search.addEventListener("input", function () {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(renderOrganogram, 150);
      });
    }
  });

  // Live refresh wanneer data-laag iets verandert
  window.addEventListener("besa:org-rollen-updated", function () {
    renderOrganogram();
  });
})();
