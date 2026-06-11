/* global window, document */
/**
 * bezetting.js — single-page Bezetting & kamerbeheer (hotel-stijl bezettingslijst).
 *
 * Drie weergaven:
 *   - Overzicht : kamer-board per locatie, kleur-gecodeerd op status (vrij/bezet/
 *                 deels/schoonmaak/onderhoud/buiten gebruik), met filters.
 *   - Bezettingslijst : real-time tabel met bewoners, capaciteit en status.
 *   - Kamerbeheer : kamers toevoegen (los/bulk), bewerken, archiveren (rol-gegate).
 *
 * Data uit bezetting_overzicht() (SECURITY DEFINER). Mutaties via de bezetting_*-RPC's.
 * Real-time multi-user via realtime-sync.js (besa:bezetting-updated → re-render).
 */
(function (global) {
  "use strict";
  var doc = global.document;
  function $(id) { return doc.getElementById(id); }

  var intFmt = new Intl.NumberFormat("nl-NL");
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmtInt(v) { return intFmt.format(Math.round(num(v))); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDatum(iso) {
    if (!iso) return "—";
    var m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "-" + m[2] + "-" + m[1]) : iso;
  }
  function isoToday() {
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  // ── Status-labels + filterlogica ─────────────────────────────────────────────
  var STATUS_LABEL = {
    vrij: "Vrij", vol: "Bezet", deels_bezet: "Deels bezet",
    schoonmaak_nodig: "Schoonmaak nodig", onderhoud_nodig: "Onderhoud (facilitair)",
    buiten_gebruik: "Buiten gebruik", gereed: "Gereed",
  };
  function matchStatus(k, filter) {
    if (!filter) return true;
    if (filter === "bezet") return num(k.aantal_bewoners) > 0;
    if (filter === "vrij") return k.effectieve_status === "vrij";
    return k.schoonmaak_status === filter;
  }

  // ── Toegang per rol ────────────────────────────────────────────────────────
  var TAB_ROLES = {
    overzicht: "*",
    lijst: "*",
    kamerbeheer: ["Facilitair", "Planner", "Zorgcoördinator"],
  };
  var TAB_ORDER = ["overzicht", "lijst", "kamerbeheer"];
  var visibleTabs = [];
  var activeTab = null;

  function adminTier() { try { return !!(global.besaIsAdminTier && global.besaIsAdminTier()); } catch (e) { return false; } }
  function hasAnyRole(roles) {
    try { return !!(global.besaPermissions && global.besaPermissions.hasAnyRole(roles)); } catch (e) { return false; }
  }
  function canSeeTab(tab) {
    var r = TAB_ROLES[tab];
    if (r === "*") return true;
    if (adminTier()) return true;
    return hasAnyRole(r || []);
  }
  function canAssign() { return adminTier() || hasAnyRole(["Zorgcoördinator", "Gedragswetenschapper", "Cliëntbeheer"]); }
  // Kamers toevoegen / bewerken / archiveren — alleen admin-tier (Eigenaar/Admin/Directeur)
  // + Zorgcoördinator. (Eigenaar-besluit 2026-06-11: Facilitair/Planner mogen dit niet meer.)
  function canManageKamers() { return adminTier() || hasAnyRole(["Zorgcoördinator"]); }
  // Housekeeping/schoonmaak-status zetten — bredere set zodat Facilitair (en Planner) hun
  // onderhoud/schoonmaak-taak houden, zonder kamers te kunnen toevoegen/verwijderen.
  function canSetStatus() { return adminTier() || hasAnyRole(["Facilitair", "Planner", "Zorgcoördinator"]); }

  // ── State ────────────────────────────────────────────────────────────────────
  var state = {
    statusFilter: "",   // overzicht + lijst delen filter
    locFilter: "",
    search: "",
    showArchived: false,
    archivedRooms: [],
  };

  function getData() { return (global.bezettingDB && global.bezettingDB.getData()) || null; }
  function allKamers() { var d = getData(); return (d && d.kamers) || []; }
  function locaties() { var d = getData(); return (d && d.locaties) || []; }
  function toewijsbaar() { var d = getData(); return (d && d.toewijsbare_clienten) || []; }
  function perLocatie() { var d = getData(); return (d && d.per_locatie) || []; }
  function totals() { var d = getData(); return (d && d.totals) || {}; }
  function kamerById(id) { return allKamers().filter(function (k) { return k.id === id; })[0] || null; }

  function filteredKamers() {
    var q = state.search.trim().toLowerCase();
    return allKamers().filter(function (k) {
      if (state.locFilter && k.locatie_naam !== state.locFilter) return false;
      if (!matchStatus(k, state.statusFilter)) return false;
      if (q) {
        var hay = (k.nummer + " " + k.locatie_naam + " " + (k.verdieping || "")).toLowerCase();
        var inBew = (k.bewoners || []).some(function (b) { return String(b.naam || "").toLowerCase().indexOf(q) !== -1; });
        if (hay.indexOf(q) === -1 && !inBew) return false;
      }
      return true;
    });
  }

  // ── KPI's ──────────────────────────────────────────────────────────────────
  function renderKpis() {
    var t = totals();
    $("bz-kpi-kamers").textContent = fmtInt(t.kamers);
    $("bz-kpi-kamers-sub").textContent = fmtInt(t.capaciteit) + " bedden capaciteit";
    $("bz-kpi-graad").textContent = fmtInt(t.bezettingsgraad_pct) + "%";
    $("bz-kpi-graad-sub").textContent = fmtInt(t.bezette_bedden) + " van " + fmtInt(t.capaciteit) + " bedden";
    $("bz-kpi-vrij").textContent = fmtInt(t.vrije_bedden);
    $("bz-kpi-vrij-sub").textContent = fmtInt(t.vrije_kamers) + " volledig vrije kamers";
    $("bz-kpi-schoonmaak").textContent = fmtInt(t.schoonmaak_nodig);
    $("bz-kpi-onderhoud").textContent = fmtInt(t.onderhoud_nodig);
    $("bz-kpi-onderhoud-sub").textContent = fmtInt(t.buiten_gebruik) + " buiten gebruik";
    $("bz-kpi-zonder").textContent = fmtInt(t.clienten_zonder_kamer);
    $("bz-kpi-zonder-sub").textContent = "van " + fmtInt(t.in_zorg_totaal) + " in zorg";
  }

  // ── Board ──────────────────────────────────────────────────────────────────
  function capDots(k) {
    var on = num(k.aantal_bewoners), tot = num(k.capaciteit), out = "";
    for (var i = 0; i < tot; i++) out += '<span class="bz-dot' + (i < on ? " bz-dot--on" : "") + '"></span>';
    return '<span class="bz-dots" title="' + on + " van " + tot + ' bezet">' + out + "</span>";
  }
  function roomCard(k) {
    var st = k.effectieve_status;
    var bewoner = (k.bewoners && k.bewoners.length)
      ? k.bewoners.map(function (b) { return esc(b.naam); }).join(", ")
      : "Vrij";
    var secondary = "";
    if (num(k.aantal_bewoners) > 0 && (k.schoonmaak_status === "schoonmaak_nodig" || k.schoonmaak_status === "onderhoud_nodig")) {
      secondary = '<span class="bz-room-flag bz-room-flag--' + esc(k.schoonmaak_status) + '">' +
        (k.schoonmaak_status === "schoonmaak_nodig" ? "Schoonmaak" : "Onderhoud") + "</span>";
    }
    return '<button type="button" class="bz-room bz-room--' + esc(st) + '" data-id="' + esc(k.id) + '">' +
      '<span class="bz-room-top"><span class="bz-room-nr">' + esc(k.nummer) + "</span>" +
        (k.verdieping ? '<span class="bz-room-floor">' + esc(k.verdieping) + "</span>" : "") + "</span>" +
      '<span class="bz-room-status">' + esc(STATUS_LABEL[st] || st) + "</span>" +
      '<span class="bz-room-bewoner">' + bewoner + "</span>" +
      '<span class="bz-room-foot">' + capDots(k) + secondary + "</span>" +
      "</button>";
  }
  function renderBoard() {
    var board = $("bz-board"), empty = $("bz-board-empty");
    if (!board) return;
    var rows = filteredKamers();
    if (!allKamers().length) { board.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    if (!rows.length) { board.innerHTML = '<p class="bz-empty">Geen kamers gevonden voor de huidige filters.</p>'; return; }
    // Groepeer per locatie (volgorde uit per_locatie / data).
    var byLoc = {}, order = [];
    rows.forEach(function (k) {
      if (!byLoc[k.locatie_naam]) { byLoc[k.locatie_naam] = []; order.push(k.locatie_naam); }
      byLoc[k.locatie_naam].push(k);
    });
    var locMeta = {};
    perLocatie().forEach(function (l) { locMeta[l.locatie] = l; });
    board.innerHTML = order.map(function (loc) {
      var m = locMeta[loc] || {};
      var kleur = (byLoc[loc][0] && byLoc[loc][0].kleur) || m.kleur || "#64748b";
      var summary = (m.bezette_bedden != null)
        ? fmtInt(m.bezette_bedden) + "/" + fmtInt(m.capaciteit) + " bedden · " + fmtInt(m.bezettingsgraad_pct) + "% bezet"
        : byLoc[loc].length + " kamers";
      return '<section class="bz-loc-block">' +
        '<div class="bz-loc-head"><span class="bz-loc-dot" style="background:' + esc(kleur) + '"></span>' +
          '<span class="bz-loc-name">' + esc(loc) + "</span>" +
          '<span class="bz-loc-sum">' + esc(summary) + "</span></div>" +
        '<div class="bz-room-grid">' + byLoc[loc].map(roomCard).join("") + "</div>" +
        "</section>";
    }).join("");
  }

  // ── Bezettingslijst (tabel) ──────────────────────────────────────────────────
  function statusPill(k) {
    return '<span class="bz-pill bz-pill--' + esc(k.effectieve_status) + '">' + esc(STATUS_LABEL[k.effectieve_status] || k.effectieve_status) + "</span>" +
      (num(k.aantal_bewoners) > 0 && (k.schoonmaak_status === "schoonmaak_nodig" || k.schoonmaak_status === "onderhoud_nodig")
        ? ' <span class="bz-pill bz-pill--' + esc(k.schoonmaak_status) + '">' + (k.schoonmaak_status === "schoonmaak_nodig" ? "Schoonmaak" : "Onderhoud") + "</span>"
        : "");
  }
  function bewonerCell(k) {
    if (!k.bewoners || !k.bewoners.length) return '<span class="bz-muted">—</span>';
    return k.bewoners.map(function (b) {
      return esc(b.naam) + (b.clientnummer ? ' <span class="bz-muted">#' + esc(b.clientnummer) + "</span>" : "");
    }).join("<br>");
  }
  function sindsCell(k) {
    if (!k.bewoners || !k.bewoners.length) return "—";
    var dates = k.bewoners.map(function (b) { return b.ingangsdatum; }).filter(Boolean).sort();
    return dates.length ? fmtDatum(dates[0]) : "—";
  }
  function renderLijst() {
    var tb = $("bz-list-tbody"), empty = $("bz-list-empty");
    if (!tb) return;
    var rows = filteredKamers();
    if (!rows.length) { tb.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var canAct = canAssign() || canManageKamers() || canSetStatus();
    tb.innerHTML = rows.map(function (k) {
      var acties = canAct
        ? '<button type="button" class="btn-outline bz-rowbtn" data-room="' + esc(k.id) + '">Beheer</button>'
        : '<button type="button" class="btn-outline bz-rowbtn" data-room="' + esc(k.id) + '">Details</button>';
      return "<tr>" +
        "<td>" + esc(k.locatie_naam) + "</td>" +
        "<td>" + esc(k.nummer) + "</td>" +
        "<td>" + (k.verdieping ? esc(k.verdieping) : '<span class="bz-muted">—</span>') + "</td>" +
        '<td class="bz-num">' + fmtInt(k.capaciteit) + "</td>" +
        "<td>" + bewonerCell(k) + "</td>" +
        '<td class="bz-num">' + fmtInt(k.vrije_plekken) + "</td>" +
        "<td>" + statusPill(k) + "</td>" +
        "<td>" + sindsCell(k) + "</td>" +
        '<td class="bz-acties-cel">' + acties + "</td>" +
      "</tr>";
    }).join("");
  }

  // ── Kamerbeheer (tabel) ────────────────────────────────────────────────────
  function renderKamerbeheer() {
    var tb = $("bz-beheer-tbody"), empty = $("bz-beheer-empty");
    if (!tb) return;
    var actief = allKamers().filter(function (k) { return !state.locFilter || k.locatie_naam === state.locFilter; });
    var rows = [];
    actief.forEach(function (k) { rows.push({ k: k, archived: false }); });
    if (state.showArchived) {
      state.archivedRooms.filter(function (k) { return !state.locFilter || k.locatie_naam === state.locFilter; })
        .forEach(function (k) { rows.push({ k: k, archived: true }); });
    }
    if (!rows.length) { tb.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var canCrud = canManageKamers();   // toevoegen / bewerken / archiveren / herstellen
    var canStat = canSetStatus();       // housekeeping/schoonmaak-status
    tb.innerHTML = rows.map(function (r) {
      var k = r.k;
      var bew = r.archived ? '<span class="bz-muted">—</span>' : bewonerCell(k);
      var statusTxt = r.archived
        ? '<span class="bz-pill bz-pill--buiten_gebruik">Gearchiveerd</span>'
        : statusPill(k);
      var acties;
      if (!canCrud && !canStat) {
        acties = '<span class="bz-muted">—</span>';
      } else if (r.archived) {
        // Herstellen uit archief = kamerbeheer (CRUD); status-only rollen zien hier niets.
        acties = canCrud
          ? '<div class="hr-row-actions"><button type="button" class="btn-outline hr-restore-btn bz-restore" data-id="' + esc(k.id) + '">Herstel</button></div>'
          : '<span class="bz-muted">—</span>';
      } else {
        var parts = [];
        if (canCrud) parts.push('<button type="button" class="btn-outline bz-edit" data-id="' + esc(k.id) + '">Bewerken</button>');
        if (canStat) parts.push('<button type="button" class="btn-outline bz-status" data-id="' + esc(k.id) + '">Status</button>');
        if (canCrud) parts.push('<button type="button" class="employee-delete-btn bz-archive" data-id="' + esc(k.id) + '" aria-label="Archiveren">' + TRASH_SVG + "</button>");
        acties = '<div class="bz-beheer-actions">' + parts.join("") + "</div>";
      }
      return "<tr>" +
        "<td>" + esc(k.locatie_naam) + "</td>" +
        "<td>" + esc(k.nummer) + "</td>" +
        "<td>" + (k.verdieping ? esc(k.verdieping) : '<span class="bz-muted">—</span>') + "</td>" +
        '<td class="bz-num">' + fmtInt(k.capaciteit) + "</td>" +
        "<td>" + bew + "</td>" +
        "<td>" + statusTxt + "</td>" +
        '<td class="bz-acties-cel">' + acties + "</td>" +
      "</tr>";
    }).join("");
  }

  var TRASH_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function renderActive() {
    renderKpis();
    if (activeTab === "overzicht") renderBoard();
    else if (activeTab === "lijst") renderLijst();
    else if (activeTab === "kamerbeheer") renderKamerbeheer();
  }
  function renderAll() {
    populateLocSelects();
    renderActive();
  }

  // ── Locatie-selects vullen ───────────────────────────────────────────────────
  function populateLocSelects() {
    var locs = locaties();
    [["bz-board-loc", true], ["bz-list-loc", true], ["bz-beheer-loc", true]].forEach(function (pair) {
      var sel = $(pair[0]); if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">Alle locaties</option>' +
        locs.map(function (l) { return '<option value="' + esc(l.naam) + '">' + esc(l.naam) + "</option>"; }).join("");
      sel.value = cur;
    });
    // Modal-selects (alleen locatienaam, geen "alle").
    ["bz-kamer-loc", "bz-bulk-loc"].forEach(function (id) {
      var sel = $(id); if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">— Kies locatie —</option>' +
        locs.map(function (l) { return '<option value="' + esc(l.naam) + '">' + esc(l.naam) + "</option>"; }).join("");
      sel.value = cur;
    });
  }

  // ── Modal-helpers ────────────────────────────────────────────────────────────
  function openModal(id) { var m = $(id); if (m) { m.hidden = false; m.setAttribute("aria-hidden", "false"); } }
  function closeModal(id) { var m = $(id); if (m) { m.hidden = true; m.setAttribute("aria-hidden", "true"); } }
  function showErr(id, msg) { var e = $(id); if (e) { e.textContent = msg; e.hidden = !msg; } }

  // ── Room hub-modal ───────────────────────────────────────────────────────────
  var activeRoomId = null;
  function openRoomModal(id) {
    var k = kamerById(id);
    if (!k) return;
    activeRoomId = id;
    $("bz-room-title").textContent = k.locatie_naam + " · " + k.nummer;
    var metaParts = [];
    metaParts.push('<div class="bz-meta-row"><span>Status</span><span>' + statusPill(k) + "</span></div>");
    metaParts.push('<div class="bz-meta-row"><span>Capaciteit</span><span>' + fmtInt(k.aantal_bewoners) + " / " + fmtInt(k.capaciteit) + " bedden bezet</span></div>");
    if (k.verdieping) metaParts.push('<div class="bz-meta-row"><span>Verdieping</span><span>' + esc(k.verdieping) + "</span></div>");
    if (k.status_notitie) metaParts.push('<div class="bz-meta-row"><span>Toelichting status</span><span>' + esc(k.status_notitie) + "</span></div>");
    if (k.notitie) metaParts.push('<div class="bz-meta-row"><span>Notitie</span><span>' + esc(k.notitie) + "</span></div>");
    $("bz-room-meta").innerHTML = metaParts.join("");

    var bewEl = $("bz-room-bewoners");
    if (!k.bewoners || !k.bewoners.length) {
      bewEl.innerHTML = '<p class="bz-muted">Geen bewoner — deze plek is vrij.</p>';
    } else {
      bewEl.innerHTML = k.bewoners.map(function (b) {
        var ontk = canAssign()
          ? '<button type="button" class="btn-outline bz-bew-ontkoppel" data-client="' + esc(b.client_id) + '">Ontkoppelen</button>'
          : "";
        return '<div class="bz-bew-row"><div class="bz-bew-info"><span class="bz-bew-naam">' + esc(b.naam) + "</span>" +
          (b.clientnummer ? ' <span class="bz-muted">#' + esc(b.clientnummer) + "</span>" : "") +
          '<span class="bz-muted bz-bew-sinds">sinds ' + esc(fmtDatum(b.ingangsdatum)) + "</span></div>" + ontk + "</div>";
      }).join("");
    }

    var foot = [];
    if (canAssign() && num(k.vrije_plekken) > 0 && k.schoonmaak_status !== "buiten_gebruik") {
      foot.push('<button type="button" class="btn-primary" id="bz-room-assign">Cliënt toewijzen</button>');
    }
    if (canSetStatus()) {
      foot.push('<button type="button" class="btn-outline" id="bz-room-status">Status wijzigen</button>');
    }
    if (canManageKamers()) {
      foot.push('<button type="button" class="btn-outline" id="bz-room-edit">Kamer bewerken</button>');
    }
    foot.push('<button type="button" class="btn-outline" id="bz-room-dismiss">Sluiten</button>');
    $("bz-room-footer").innerHTML = foot.join("");

    openModal("bz-room-modal");
  }

  // ── Assign-modal ─────────────────────────────────────────────────────────────
  function openAssignModal(kamerId) {
    var k = kamerById(kamerId);
    if (!k) return;
    $("bz-assign-context").textContent = "Kamer toewijzen aan " + k.locatie_naam + " · " + k.nummer +
      " (" + fmtInt(k.vrije_plekken) + " plek" + (num(k.vrije_plekken) === 1 ? "" : "ken") + " vrij)";
    var sel = $("bz-assign-client");
    sel.innerHTML = '<option value="">— Kies cliënt —</option>' +
      toewijsbaar().map(function (c) {
        var label = c.naam + (c.clientnummer ? " (#" + c.clientnummer + ")" : "");
        if (c.huidige_kamer_id) label += " — nu: " + c.huidige_kamer_label;
        return '<option value="' + esc(c.id) + '">' + esc(label) + "</option>";
      }).join("");
    $("bz-assign-datum").value = isoToday();
    $("bz-assign-notitie").value = "";
    $("bz-assign-hint").textContent = "Een cliënt die al op een andere kamer staat, wordt automatisch verplaatst.";
    showErr("bz-assign-err", "");
    $("bz-assign-modal").setAttribute("data-kamer", kamerId);
    openModal("bz-assign-modal");
    setTimeout(function () { sel.focus(); }, 30);
  }
  function wireAssign() {
    $("bz-assign-close").addEventListener("click", function () { closeModal("bz-assign-modal"); });
    $("bz-assign-cancel").addEventListener("click", function () { closeModal("bz-assign-modal"); });
    $("bz-assign-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var kamerId = $("bz-assign-modal").getAttribute("data-kamer");
      var clientId = $("bz-assign-client").value;
      if (!clientId) { showErr("bz-assign-err", "Kies eerst een cliënt."); return; }
      var btn = $("bz-assign-save"); btn.disabled = true;
      global.bezettingDB.wijsToe(kamerId, clientId, $("bz-assign-datum").value || null, $("bz-assign-notitie").value)
        .then(function () {
          closeModal("bz-assign-modal"); closeModal("bz-room-modal");
          if (global.showActionFeedback) global.showActionFeedback("saved", "Toewijzing");
        })
        .catch(function (err) { showErr("bz-assign-err", (err && err.message) || "Toewijzen mislukt."); })
        .finally(function () { btn.disabled = false; });
    });
  }

  // ── Status-modal ─────────────────────────────────────────────────────────────
  function openStatusModal(kamerId) {
    var k = kamerById(kamerId);
    if (!k) return;
    $("bz-status-context").textContent = k.locatie_naam + " · " + k.nummer;
    $("bz-status-select").value = k.schoonmaak_status || "gereed";
    $("bz-status-notitie").value = k.status_notitie || "";
    showErr("bz-status-err", "");
    $("bz-status-modal").setAttribute("data-kamer", kamerId);
    openModal("bz-status-modal");
  }
  function wireStatus() {
    $("bz-status-close").addEventListener("click", function () { closeModal("bz-status-modal"); });
    $("bz-status-cancel").addEventListener("click", function () { closeModal("bz-status-modal"); });
    $("bz-status-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var kamerId = $("bz-status-modal").getAttribute("data-kamer");
      var btn = $("bz-status-save"); btn.disabled = true;
      global.bezettingDB.zetStatus(kamerId, $("bz-status-select").value, $("bz-status-notitie").value)
        .then(function () {
          closeModal("bz-status-modal"); closeModal("bz-room-modal");
          if (global.showActionFeedback) global.showActionFeedback("saved", "Status");
        })
        .catch(function (err) { showErr("bz-status-err", (err && err.message) || "Opslaan mislukt."); })
        .finally(function () { btn.disabled = false; });
    });
  }

  // ── Kamer toevoegen/bewerken-modal ────────────────────────────────────────────
  function openKamerModal(kamerId) {
    populateLocSelects();
    var k = kamerId ? kamerById(kamerId) : null;
    $("bz-kamer-title").textContent = k ? "Kamer bewerken" : "Kamer toevoegen";
    $("bz-kamer-loc").value = k ? k.locatie_naam : "";
    $("bz-kamer-nummer").value = k ? k.nummer : "";
    $("bz-kamer-verdieping").value = (k && k.verdieping) || "";
    $("bz-kamer-cap").value = k ? k.capaciteit : 1;
    $("bz-kamer-notitie").value = (k && k.notitie) || "";
    showErr("bz-kamer-err", "");
    $("bz-kamer-modal").setAttribute("data-id", kamerId || "");
    openModal("bz-kamer-modal");
  }
  function wireKamer() {
    $("bz-kamer-close").addEventListener("click", function () { closeModal("bz-kamer-modal"); });
    $("bz-kamer-cancel").addEventListener("click", function () { closeModal("bz-kamer-modal"); });
    $("bz-kamer-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var id = $("bz-kamer-modal").getAttribute("data-id") || null;
      var payload = {
        id: id,
        locatie: $("bz-kamer-loc").value,
        nummer: $("bz-kamer-nummer").value,
        verdieping: $("bz-kamer-verdieping").value,
        capaciteit: $("bz-kamer-cap").value,
        notitie: $("bz-kamer-notitie").value,
      };
      if (!payload.locatie) { showErr("bz-kamer-err", "Kies een locatie."); return; }
      if (!payload.nummer.trim()) { showErr("bz-kamer-err", "Vul een kamernummer in."); return; }
      var btn = $("bz-kamer-save"); btn.disabled = true;
      global.bezettingDB.kamerUpsert(payload)
        .then(function () {
          closeModal("bz-kamer-modal");
          if (global.showActionFeedback) global.showActionFeedback("saved", "Kamer");
        })
        .catch(function (err) { showErr("bz-kamer-err", (err && err.message) || "Opslaan mislukt."); })
        .finally(function () { btn.disabled = false; });
    });
  }

  // ── Bulk-modal ───────────────────────────────────────────────────────────────
  function bulkPreview() {
    var prefix = $("bz-bulk-prefix").value || "";
    var start = parseInt($("bz-bulk-start").value, 10); if (!isFinite(start)) start = 1;
    var aantal = parseInt($("bz-bulk-aantal").value, 10); if (!isFinite(aantal)) aantal = 0;
    if (aantal < 1) { $("bz-bulk-preview").textContent = ""; return; }
    var first = (prefix + start).trim();
    var last = (prefix + (start + aantal - 1)).trim();
    $("bz-bulk-preview").textContent = "Maakt aan: " + first + (aantal > 1 ? " t/m " + last : "") + " (" + aantal + " kamer" + (aantal === 1 ? "" : "s") + ").";
  }
  function openBulkModal() {
    populateLocSelects();
    $("bz-bulk-loc").value = state.locFilter || "";
    $("bz-bulk-prefix").value = "Kamer ";
    $("bz-bulk-start").value = 1;
    $("bz-bulk-aantal").value = 10;
    $("bz-bulk-cap").value = 1;
    showErr("bz-bulk-err", "");
    bulkPreview();
    openModal("bz-bulk-modal");
  }
  function wireBulk() {
    $("bz-bulk-close").addEventListener("click", function () { closeModal("bz-bulk-modal"); });
    $("bz-bulk-cancel").addEventListener("click", function () { closeModal("bz-bulk-modal"); });
    ["bz-bulk-prefix", "bz-bulk-start", "bz-bulk-aantal"].forEach(function (id) {
      $(id).addEventListener("input", bulkPreview);
    });
    $("bz-bulk-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        locatie: $("bz-bulk-loc").value,
        prefix: $("bz-bulk-prefix").value,
        start: $("bz-bulk-start").value,
        aantal: $("bz-bulk-aantal").value,
        capaciteit: $("bz-bulk-cap").value,
      };
      if (!payload.locatie) { showErr("bz-bulk-err", "Kies een locatie."); return; }
      var btn = $("bz-bulk-save"); btn.disabled = true;
      global.bezettingDB.kamersBulk(payload)
        .then(function (d) {
          closeModal("bz-bulk-modal");
          var n = (d && d.aangemaakt) || 0;
          if (global.showActionFeedback) global.showActionFeedback("saved", n + " kamer" + (n === 1 ? "" : "s"));
        })
        .catch(function (err) { showErr("bz-bulk-err", (err && err.message) || "Aanmaken mislukt."); })
        .finally(function () { btn.disabled = false; });
    });
  }

  // ── Archiveren / ontkoppelen (met bevestiging) ────────────────────────────────
  function archiveKamer(id) {
    var k = kamerById(id);
    var doArch = function () {
      global.bezettingDB.kamerArchiveren(id)
        .then(function () { if (global.showActionFeedback) global.showActionFeedback("archived", "Kamer"); })
        .catch(function (err) { if (global.showError) global.showError((err && err.message) || "Archiveren mislukt."); });
    };
    if (global.showArchiveConfirm) {
      global.showArchiveConfirm({ preview: k ? (k.locatie_naam + " · " + k.nummer) : "" }).then(function (ok) { if (ok) doArch(); });
    } else { doArch(); }
  }
  function ontkoppelClient(clientId) {
    global.bezettingDB.ontkoppel(clientId)
      .then(function () {
        closeModal("bz-room-modal");
        if (global.showActionFeedback) global.showActionFeedback("saved", "Ontkoppeld");
      })
      .catch(function (err) { if (global.showError) global.showError((err && err.message) || "Ontkoppelen mislukt."); });
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  function exportLijst() {
    var rows = filteredKamers();
    var head = ["Locatie", "Kamer", "Verdieping", "Capaciteit", "Bewoners", "Vrije plekken", "Status", "Schoonmaakstatus", "Sinds"];
    var lines = [head.join(";")];
    rows.forEach(function (k) {
      var bew = (k.bewoners || []).map(function (b) { return b.naam; }).join(" / ");
      var cells = [
        k.locatie_naam, k.nummer, k.verdieping || "", k.capaciteit, bew, k.vrije_plekken,
        STATUS_LABEL[k.effectieve_status] || k.effectieve_status, STATUS_LABEL[k.schoonmaak_status] || k.schoonmaak_status, sindsCell(k),
      ];
      lines.push(cells.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(";"));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement("a");
    a.href = url; a.download = "bezettingslijst-" + isoToday() + ".csv";
    doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (global.showActionFeedback) global.showActionFeedback("exported", "Bezettingslijst");
  }

  // ── Tab-besturing ──────────────────────────────────────────────────────────
  function showView(tab) {
    activeTab = tab;
    TAB_ORDER.forEach(function (t) {
      var view = $("bz-view-" + t), btn = $("bz-tab-" + t);
      if (view) view.hidden = (t !== tab);
      if (btn) { btn.classList.toggle("filter-chip--active", t === tab); btn.setAttribute("aria-selected", t === tab ? "true" : "false"); }
    });
    // KPI's tonen bij overzicht + lijst, verbergen bij kamerbeheer.
    var kpis = $("bz-kpis"); if (kpis) kpis.hidden = (tab === "kamerbeheer");
    // Header-knoppen per tab.
    var exp = $("bz-export"); if (exp) exp.hidden = (tab !== "lijst");
    var addK = $("bz-add-kamer"); if (addK) addK.hidden = !(tab === "kamerbeheer" && canManageKamers());
    if (tab === "kamerbeheer" && state.showArchived && !state.archivedRooms.length) loadArchived();
    renderActive();
  }

  function loadArchived() {
    if (!global.bezettingDB) return;
    global.bezettingDB.listArchived().then(function (rows) {
      state.archivedRooms = rows || [];
      if (activeTab === "kamerbeheer") renderKamerbeheer();
    });
  }

  // ── Filter-chips ───────────────────────────────────────────────────────────
  function wireStatusChips() {
    doc.querySelectorAll(".bz-status-chips .filter-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.statusFilter = btn.getAttribute("data-status") || "";
        doc.querySelectorAll(".bz-status-chips .filter-chip").forEach(function (b) {
          var on = (b.getAttribute("data-status") || "") === state.statusFilter;
          b.classList.toggle("filter-chip--active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderActive();
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    try { if (global.besaPermissionsReady) await global.besaPermissionsReady; } catch (e) { /* */ }
    try { if (global.profilesDB && global.profilesDB.ready) await global.profilesDB.ready; } catch (e) { /* */ }

    visibleTabs = TAB_ORDER.filter(canSeeTab);
    if (!visibleTabs.length) {
      var na = $("bz-noaccess"); if (na) na.hidden = false;
      var tabs = $("bz-tabs"); if (tabs) tabs.hidden = true;
      return;
    }
    visibleTabs.forEach(function (t) { var b = $("bz-tab-" + t); if (b) b.hidden = false; });

    // Tab-klik
    TAB_ORDER.forEach(function (t) {
      var b = $("bz-tab-" + t);
      if (b) b.addEventListener("click", function () { showView(t); });
    });

    // Filters
    wireStatusChips();
    ["bz-board-loc", "bz-list-loc", "bz-beheer-loc"].forEach(function (id) {
      var sel = $(id);
      if (sel) sel.addEventListener("change", function () { state.locFilter = sel.value; syncLocSelects(sel.value); renderActive(); });
    });
    ["bz-board-search", "bz-list-search"].forEach(function (id) {
      var inp = $(id);
      if (inp) inp.addEventListener("input", function () { state.search = inp.value; syncSearch(inp.value); renderActive(); });
    });
    var arch = $("bz-show-archived");
    if (arch) arch.addEventListener("change", function () {
      state.showArchived = arch.checked;
      if (arch.checked && !state.archivedRooms.length) loadArchived();
      else renderKamerbeheer();
    });

    // Header-knoppen
    $("bz-refresh").addEventListener("click", function () { global.bezettingDB.refresh(); });
    $("bz-export").addEventListener("click", exportLijst);
    if (canManageKamers()) {
      $("bz-add-kamer").addEventListener("click", function () { openKamerModal(null); });
      $("bz-beheer-add").addEventListener("click", function () { openKamerModal(null); });
      $("bz-beheer-bulk").addEventListener("click", openBulkModal);
    } else {
      ["bz-beheer-add", "bz-beheer-bulk"].forEach(function (id) { var b = $(id); if (b) b.hidden = true; });
    }

    // Modals bedraden
    wireAssign(); wireStatus(); wireKamer(); wireBulk();
    $("bz-room-close").addEventListener("click", function () { closeModal("bz-room-modal"); });
    // Overlay-klik sluit modal
    doc.querySelectorAll(".modal-overlay").forEach(function (ov) {
      ov.addEventListener("click", function (e) { if (e.target === ov) closeModal(ov.id); });
    });

    // Klik-delegatie: board, lijst, kamerbeheer, room-modal-footer/bewoners
    $("bz-board").addEventListener("click", function (e) {
      var card = e.target.closest(".bz-room[data-id]"); if (card) openRoomModal(card.getAttribute("data-id"));
    });
    $("bz-list-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest(".bz-rowbtn[data-room]"); if (btn) openRoomModal(btn.getAttribute("data-room"));
    });
    $("bz-beheer-tbody").addEventListener("click", function (e) {
      var edit = e.target.closest(".bz-edit[data-id]");
      var stat = e.target.closest(".bz-status[data-id]");
      var arch2 = e.target.closest(".bz-archive[data-id]");
      var rest = e.target.closest(".bz-restore[data-id]");
      if (edit) openKamerModal(edit.getAttribute("data-id"));
      else if (stat) openStatusModal(stat.getAttribute("data-id"));
      else if (arch2) archiveKamer(arch2.getAttribute("data-id"));
      else if (rest) {
        global.bezettingDB.kamerHerstellen(rest.getAttribute("data-id"))
          .then(function () {
            state.archivedRooms = state.archivedRooms.filter(function (k) { return k.id !== rest.getAttribute("data-id"); });
            if (global.showActionFeedback) global.showActionFeedback("restored", "Kamer");
          })
          .catch(function (err) { if (global.showError) global.showError((err && err.message) || "Herstellen mislukt."); });
      }
    });
    $("bz-room-footer").addEventListener("click", function (e) {
      if (e.target.id === "bz-room-assign") openAssignModal(activeRoomId);
      else if (e.target.id === "bz-room-status") openStatusModal(activeRoomId);
      else if (e.target.id === "bz-room-edit") openKamerModal(activeRoomId);
      else if (e.target.id === "bz-room-dismiss") closeModal("bz-room-modal");
    });
    $("bz-room-bewoners").addEventListener("click", function (e) {
      var btn = e.target.closest(".bz-bew-ontkoppel[data-client]"); if (btn) ontkoppelClient(btn.getAttribute("data-client"));
    });

    // Live re-render bij data-updates (eigen mutatie + realtime van andere users)
    global.addEventListener("besa:bezetting-updated", renderAll);

    // Data laden + eerste render
    try { if (global.bezettingDB && global.bezettingDB.ready) await global.bezettingDB.ready; } catch (e) { /* */ }
    renderAll();
    showView(visibleTabs[0]);
  }

  // Helpers om de gedeelde filters tussen overzicht/lijst-toolbars te syncen.
  function syncLocSelects(val) {
    ["bz-board-loc", "bz-list-loc", "bz-beheer-loc"].forEach(function (id) { var s = $(id); if (s && s.value !== val) s.value = val; });
  }
  function syncSearch(val) {
    ["bz-board-search", "bz-list-search"].forEach(function (id) { var s = $(id); if (s && s.value !== val) s.value = val; });
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
