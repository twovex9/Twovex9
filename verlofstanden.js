/* global window, document */
/**
 * verlofstanden.js — overzicht van verlof-overdracht per medewerker.
 *
 * Bron: window.medewerkerVerlofOvergedragenDB (1-op-1 met medewerker).
 *  Toont per rij wet/bovenwet (totaal/gebruikt/beschikbaar) + reden.
 *  Klik op rij → opent medewerker-detail in een nieuwe pagina via
 *  `medewerker?id=<empId>` (de HR-medewerker-detailpagina).
 *
 * Filters:
 *  - Zoeken op medewerkersnaam
 *  - Tab: alle / wettelijk / bovenwettelijk (kolom-zichtbaarheid)
 *  - Toggle "Vervalt binnen 3 maanden": alleen rijen waar wet_beschikbaar > 0
 *    EN huidige datum >= 1 april van het lopende jaar EN < 1 juli
 *
 * Geen mutaties op deze pagina — bewerken gaat via medewerker-detail.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    typeFilter: "alle", // 'alle' | 'wet' | 'bovenwet'
    onlyVervalt: false,
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    sortBy: "medewerker",
    sortDir: "asc",
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtNum(v) {
    var n = Number(v || 0);
    if (!isFinite(n)) return "0";
    // Toon hele getallen zonder decimalen, anders 1 decimaal
    if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
    return n.toFixed(1).replace(".", ",");
  }

  function medewerkerById(id) {
    if (!id || !window.medewerkersDB) return null;
    return window.medewerkersDB.getByIdSync(id);
  }
  function medewerkerLabel(id) {
    var m = medewerkerById(id);
    if (!m) return "Onbekende medewerker";
    return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "Onbekende medewerker";
  }
  function medewerkerArchived(id) {
    var m = medewerkerById(id);
    return !!(m && m.archived);
  }

  function isVervaltPeriode() {
    // Wettelijk verlof vervalt op 1 juli. Vanaf 1 april (3 maanden ervoor)
    // toont de toggle dit als 'binnen 3 maanden'. Buiten april-juni heeft
    // de toggle geen extra filter-effect (toont alles).
    var now = new Date();
    var m = now.getMonth(); // 0=jan
    return m >= 3 && m < 6; // april (3) t/m juni (5) inclusief
  }

  function getVisible() {
    if (!window.medewerkerVerlofOvergedragenDB) return [];
    var items = (window.medewerkerVerlofOvergedragenDB.getAllSync() || []).slice();
    var q = state.search.trim().toLowerCase();
    var vervaltActief = state.onlyVervalt && isVervaltPeriode();

    items = items.filter(function (r) {
      if (!r) return false;
      if (medewerkerArchived(r.medewerkerId)) return false;
      // Bij wettelijk-tab: minstens iets in wettelijk
      if (state.typeFilter === "wet") {
        if (!(r.wetTotaal || r.wetGebruikt || r.wetBeschikbaar)) return false;
      }
      if (state.typeFilter === "bovenwet") {
        if (!(r.bovenwetTotaal || r.bovenwetGebruikt || r.bovenwetBeschikbaar)) return false;
      }
      if (vervaltActief && !(Number(r.wetBeschikbaar || 0) > 0)) return false;
      if (q) {
        var hay = medewerkerLabel(r.medewerkerId) + " " + (r.reden || "");
        if (hay.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });

    // Sortering
    var dir = state.sortDir === "desc" ? -1 : 1;
    items.sort(function (a, b) {
      var av, bv;
      if (state.sortBy === "medewerker") {
        av = medewerkerLabel(a.medewerkerId).toLowerCase();
        bv = medewerkerLabel(b.medewerkerId).toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }
      av = Number(a[state.sortBy] || 0);
      bv = Number(b[state.sortBy] || 0);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    return items;
  }

  function renderRow(r) {
    var vervaltVlag = state.onlyVervalt || isVervaltPeriode()
      ? (Number(r.wetBeschikbaar || 0) > 0
          ? ' <span title="Wettelijke uren vervallen op 1 juli" style="color:var(--yellow);font-size:14px;">&#9888;</span>'
          : "")
      : "";
    var naam = '<button class="link-button" data-action="open-mw" data-id="' + escapeHtml(r.medewerkerId) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' +
      escapeHtml(medewerkerLabel(r.medewerkerId)) + '</button>' + vervaltVlag;
    return '<tr data-id="' + escapeHtml(r.medewerkerId) + '">' +
      '<td>' + naam + '</td>' +
      '<td class="vs-col-wet">' + escapeHtml(fmtNum(r.wetTotaal)) + '</td>' +
      '<td class="vs-col-wet">' + escapeHtml(fmtNum(r.wetGebruikt)) + '</td>' +
      '<td class="vs-col-wet" style="font-weight:600;">' + escapeHtml(fmtNum(r.wetBeschikbaar)) + '</td>' +
      '<td class="vs-col-bovenwet">' + escapeHtml(fmtNum(r.bovenwetTotaal)) + '</td>' +
      '<td class="vs-col-bovenwet">' + escapeHtml(fmtNum(r.bovenwetGebruikt)) + '</td>' +
      '<td class="vs-col-bovenwet" style="font-weight:600;">' + escapeHtml(fmtNum(r.bovenwetBeschikbaar)) + '</td>' +
      '<td>' + escapeHtml(r.reden || "—") + '</td>' +
    '</tr>';
  }

  function applyTypeColumnVisibility() {
    var showWet = state.typeFilter === "alle" || state.typeFilter === "wet";
    var showBoven = state.typeFilter === "alle" || state.typeFilter === "bovenwet";
    document.querySelectorAll(".vs-col-wet").forEach(function (el) { el.style.display = showWet ? "" : "none"; });
    document.querySelectorAll(".vs-col-bovenwet").forEach(function (el) { el.style.display = showBoven ? "" : "none"; });
  }

  function render() {
    var tbody = document.getElementById("vs-tbody");
    if (!tbody) return;
    applyTypeColumnVisibility();
    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);
    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text-muted);">Geen verlofstanden gevonden.</td></tr>';
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
    }
    document.getElementById("vs-pager-range").textContent = total === 0 ? "0 van 0" : (start + 1) + "-" + Math.min(total, start + pageItems.length) + " van " + total;
    document.getElementById("vs-pager-page").textContent = "Pagina " + state.page + " van " + totalPages;
    document.getElementById("vs-pager-first").disabled = state.page <= 1;
    document.getElementById("vs-pager-prev").disabled = state.page <= 1;
    document.getElementById("vs-pager-next").disabled = state.page >= totalPages;
    document.getElementById("vs-pager-last").disabled = state.page >= totalPages;
  }

  function setTab(which) {
    state.typeFilter = which;
    state.page = 1;
    ["alle", "wet", "bovenwet"].forEach(function (key) {
      var el = document.getElementById("vs-tab-" + key);
      if (!el) return;
      var active = key === which;
      el.classList.toggle("filter-chip--active", active);
      el.setAttribute("aria-selected", active ? "true" : "false");
    });
    render();
  }

  function wireSortHeaders() {
    document.querySelectorAll("#vs-thead-row [data-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-sort");
        if (state.sortBy === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortBy = key;
          state.sortDir = "asc";
        }
        render();
      });
    });
  }

  function wireEvents() {
    document.getElementById("vs-search").addEventListener("input", function (e) {
      state.search = e.target.value || "";
      state.page = 1;
      render();
    });
    document.getElementById("vs-tab-alle").addEventListener("click", function () { setTab("alle"); });
    document.getElementById("vs-tab-wet").addEventListener("click", function () { setTab("wet"); });
    document.getElementById("vs-tab-bovenwet").addEventListener("click", function () { setTab("bovenwet"); });
    document.getElementById("vs-vervalt-toggle").addEventListener("change", function (e) {
      state.onlyVervalt = !!e.target.checked;
      state.page = 1;
      render();
    });
    document.getElementById("vs-rows-per-page").addEventListener("change", function (e) {
      state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT;
      state.page = 1;
      render();
    });
    document.getElementById("vs-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("vs-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("vs-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("vs-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    document.getElementById("vs-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action='open-mw']");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      if (id) window.location.href = "medewerker?id=" + encodeURIComponent(id);
    });

    window.addEventListener("besa:medewerker-verlof-overgedragen-updated", render);
    window.addEventListener("besa:medewerkers-updated", render);
  }

  function init() {
    if (!window.medewerkerVerlofOvergedragenDB) {
      console.error("[verlofstanden] medewerkerVerlofOvergedragenDB niet geladen");
      return;
    }
    wireEvents();
    render();
    Promise.all([
      window.medewerkerVerlofOvergedragenDB.ready,
      window.medewerkersDB ? window.medewerkersDB.ready : Promise.resolve(),
    ]).then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
