/* global window, document */
/**
 * taken.js — page-script voor /taken.html — Takenmodule v2 (Embrace the Future).
 *
 * Drie itemtypes (taak / verzoek / besluitpunt), vier rol-gegate views
 * (Mijn taken / Afdelingstaken / Managementoverzicht / Organisatie-dashboard),
 * hiërarchie-gestuurde toewijzing en de verzoek→taak- + besluit-flows.
 *
 * Rol-context komt uit de RPC public.taken_mijn_context (niveau / afdelingen /
 * kan_beheren / is_directie). De RLS op public.taken is de echte poort; de UI
 * verbergt enkel wat niet relevant is.
 */
(function () {
  "use strict";

  // ─── Type- en status-metadata ──────────────────────────────────────────────
  var TYPE_META = {
    taak:        { label: "Taak",        style: "color:var(--blue);background:var(--blue-soft);" },
    verzoek:     { label: "Verzoek",     style: "color:var(--yellow);background:var(--yellow-soft);" },
    goedkeuring: { label: "Besluitpunt", style: "color:var(--text-secondary);background:var(--line);" },
  };

  var STATUS_META = {
    taak: {
      "--":               { label: "Nieuw",            style: "color:var(--text-muted);background:var(--line);" },
      "In behandeling":   { label: "In behandeling",   style: "color:var(--yellow);background:var(--yellow-soft);" },
      "Wacht op reactie": { label: "Wacht op reactie", style: "color:var(--blue);background:var(--blue-soft);" },
      "Voltooid":         { label: "Afgerond",         style: "color:var(--green);background:var(--green-soft);" },
      "Geannuleerd":      { label: "Geannuleerd",      style: "color:var(--text-muted);background:var(--line);text-decoration:line-through;" },
    },
    verzoek: {
      "Ingediend":     { label: "Ingediend",     style: "color:var(--blue);background:var(--blue-soft);" },
      "In beoordeling":{ label: "In beoordeling",style: "color:var(--yellow);background:var(--yellow-soft);" },
      "Goedgekeurd":   { label: "Goedgekeurd",   style: "color:var(--green);background:var(--green-soft);" },
      "Afgewezen":     { label: "Afgewezen",     style: "color:var(--red);background:var(--red-soft);" },
      "Teruggestuurd": { label: "Teruggestuurd", style: "color:var(--yellow);background:var(--yellow-soft);" },
    },
    goedkeuring: {
      "Open":           { label: "Open",           style: "color:var(--blue);background:var(--blue-soft);" },
      "In behandeling": { label: "In behandeling", style: "color:var(--yellow);background:var(--yellow-soft);" },
      "Goedgekeurd":    { label: "Goedgekeurd",    style: "color:var(--green);background:var(--green-soft);" },
      "Afgekeurd":      { label: "Afgekeurd",      style: "color:var(--red);background:var(--red-soft);" },
    },
  };

  var PRIORITEIT_LABELS = { Low: "Laag", Medium: "Middel", High: "Hoog" };
  var PRIORITEIT_CLASS = { Low: "color:var(--text-muted);", Medium: "color:var(--blue);", High: "color:var(--red);" };
  var AFDELINGEN = (window.takenDB && window.takenDB.AFDELINGEN) ||
    ["HR", "Facilitair", "Beleid & Kwaliteit", "Financiën", "Gedragswetenschap", "Planning & Zorg", "Directie", "Algemeen"];
  var STATUS_BY_TYPE = (window.takenDB && window.takenDB.STATUS_BY_TYPE) || {
    taak: ["--", "In behandeling", "Wacht op reactie", "Voltooid", "Geannuleerd"],
    verzoek: ["Ingediend", "In beoordeling", "Goedgekeurd", "Afgewezen", "Teruggestuurd"],
    goedkeuring: ["Open", "In behandeling", "Goedgekeurd", "Afgekeurd"],
  };

  var state = {
    view: "mijn",           // mijn | afdeling | management | organisatie
    typeFilter: "",         // "" | taak | verzoek | goedkeuring
    search: "",
    showArchived: false,
    hideDone: false,
    filterStatus: "",
    filterPrioriteit: "",
    filterAfdeling: "",
    filterTeamlid: "",
    filterDeadline: "",
    editingId: null,
    editingItem: null,
    modalType: "taak",
    archivingId: null,
    purgingId: null,
    threadTaakId: null,
    threadFile: null,
  };

  var ctx = null; // { niveau, afdelingen[], kan_beheren, is_directie }

  // ─── Generieke helpers ──────────────────────────────────────────────────────
  function fmtNlDate(iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    var t = Date.parse(iso);
    if (!isFinite(t)) return "";
    var d = new Date(t), pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function fmtNlDateTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "";
    var d = new Date(t), pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function trashSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function medewerkerLabel(id) {
    if (!id || !window.medewerkersDB) return "—";
    var m = window.medewerkersDB.getByIdSync(id);
    if (!m) return "—";
    return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "—";
  }
  function makerLabel(authId, fallbackNaam) {
    if (fallbackNaam) return fallbackNaam;
    if (!authId) return "—";
    try {
      var profs = (window.profilesDB && window.profilesDB.getAllSync && window.profilesDB.getAllSync()) || [];
      var p = profs.find(function (x) { return x && String(x.id) === String(authId); });
      if (p) {
        if (p.medewerker_id) { var lbl = medewerkerLabel(p.medewerker_id); if (lbl && lbl !== "—") return lbl; }
        if (p.voornaam || p.achternaam) return ((p.voornaam || "") + " " + (p.achternaam || "")).trim();
        if (p.email) return p.email;
      }
    } catch (e) { /* */ }
    return "—";
  }
  function getCurrentMedewerkerId() {
    try { var p = window.besaCurrentProfile || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync()); return p ? (p.medewerkerId || p.medewerker_id || null) : null; } catch (e) { return null; }
  }
  function getCurrentAuthUserId() {
    try { var p = window.besaCurrentProfile || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync()); return p && p.id ? p.id : null; } catch (e) { return null; }
  }

  // ─── Rol-/permissie-helpers (server-context met veilige fallback) ────────────
  function canManage() {
    if (ctx && typeof ctx.kan_beheren === "boolean") return ctx.kan_beheren;
    try { if (window.besaIsAdminTier && window.besaIsAdminTier()) return true; } catch (e) { /* */ }
    try { if (window.besaCan && window.besaCan("manage", "tasks")) return true; } catch (e) { /* */ }
    return false;
  }
  function isDirectie() {
    if (ctx && typeof ctx.is_directie === "boolean") return ctx.is_directie;
    try { return !!(window.besaIsAdminTier && window.besaIsAdminTier()); } catch (e) { return false; }
  }
  function myAfdelingen() { return (ctx && Array.isArray(ctx.afdelingen)) ? ctx.afdelingen : []; }
  function isMaker(t) { var uid = getCurrentAuthUserId(); return !!(t && uid && t.aangemaaktDoorId && String(t.aangemaaktDoorId) === String(uid)); }
  function isAssignee(t) { var mw = getCurrentMedewerkerId(); return !!(t && mw && t.toegewezenAanId && String(t.toegewezenAanId) === String(mw)); }

  // Mag de huidige gebruiker een (voltooide) taak goedkeuren? = aanmaker of admin.
  function magGoedkeuren(t) {
    if (!t) return false;
    if (isMaker(t)) return true;
    try { if (window.profilesDB && window.profilesDB.isAdmin && window.profilesDB.isAdmin()) return true; } catch (e) { /* */ }
    try { if (window.besaIsAdminTier && window.besaIsAdminTier()) return true; } catch (e) { /* */ }
    return false;
  }
  function wachtOpGoedkeuring(t) { return !!t && t.type === "taak" && t.status === "Voltooid" && !t.archived && !t.goedgekeurdOp; }
  // Mag een verzoek beoordelen: management/hoger dat het verzoek ziet (niet de indiener zelf).
  function magBeoordelen(t) { return !!t && t.type === "verzoek" && canManage() && !isMaker(t) && ["Ingediend", "In beoordeling", "Teruggestuurd"].indexOf(t.status) >= 0; }
  // Mag een besluit nemen: directie/eigenaar of de aanmaker van het besluitpunt.
  function magBeslissen(t) { return !!t && t.type === "goedkeuring" && (isDirectie() || isMaker(t)) && ["Open", "In behandeling"].indexOf(t.status) >= 0; }

  // ─── Status/type-statushelpers ───────────────────────────────────────────────
  function statusLabel(t) { var m = (STATUS_META[t.type] || STATUS_META.taak)[t.status]; return m ? m.label : (t.status || "—"); }
  function statusStyle(t) { var m = (STATUS_META[t.type] || STATUS_META.taak)[t.status]; return m ? m.style : ""; }
  function isTerminal(t) {
    if (t.type === "taak") return t.status === "Voltooid" || t.status === "Geannuleerd";
    if (t.type === "verzoek") return ["Goedgekeurd", "Afgewezen"].indexOf(t.status) >= 0;
    if (t.type === "goedkeuring") return ["Goedgekeurd", "Afgekeurd"].indexOf(t.status) >= 0;
    return false;
  }
  function isTaakOpen(t) { return t.type === "taak" && !isTerminal(t); }
  function isVerzoekTeBeoordelen(t) { return t.type === "verzoek" && ["Ingediend", "In beoordeling", "Teruggestuurd"].indexOf(t.status) >= 0; }
  function isBesluitOpen(t) { return t.type === "goedkeuring" && ["Open", "In behandeling"].indexOf(t.status) >= 0; }
  function isAchterstallig(t) { return isTaakOpen(t) && t.deadline && String(t.deadline).slice(0, 10) < todayStr(); }
  function isKritiek(t) { return isTaakOpen(t) && t.prioriteit === "High"; }

  // ─── Type/status pills ───────────────────────────────────────────────────────
  function typePill(t) {
    var m = TYPE_META[t.type] || TYPE_META.taak;
    return '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;' + m.style + '">' + escapeHtml(m.label) + '</span>';
  }
  function statusPill(t) {
    var html = '<span class="badge" style="display:inline-block;padding:4px 10px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;' + statusStyle(t) + '">' + escapeHtml(statusLabel(t)) + '</span>';
    if (wachtOpGoedkeuring(t)) html += ' <span class="taak-wacht-badge" title="Wacht op goedkeuring van de aanmaker">Wacht op goedkeuring</span>';
    if (isAchterstallig(t)) html += ' <span class="taak-wacht-badge taak-late-badge" title="Over de deadline">Achterstallig</span>';
    return html;
  }
  function prioriteitPill(t) {
    var label = PRIORITEIT_LABELS[t.prioriteit] || t.prioriteit;
    return '<span style="font-weight:600;font-size:var(--font-table-cell);' + (PRIORITEIT_CLASS[t.prioriteit] || "") + '">' + escapeHtml(label) + '</span>';
  }

  // ─── Lijst (Mijn taken / Afdelingstaken) ─────────────────────────────────────
  function allItems() { return (window.takenDB && window.takenDB.getAllSync()) || []; }

  function listItems() {
    var myMw = getCurrentMedewerkerId();
    var myAuth = getCurrentAuthUserId();
    var q = state.search.trim().toLowerCase();
    return allItems().filter(function (t) {
      if (!t) return false;
      if (!!t.archived !== !!state.showArchived) return false;
      // View-scope
      if (state.view === "mijn") {
        var mine = (myMw && String(t.toegewezenAanId) === String(myMw)) || (myAuth && String(t.aangemaaktDoorId) === String(myAuth));
        if (!mine) return false;
      } else if (state.view === "afdeling") {
        if (t.type !== "taak") return false;
        if (state.filterAfdeling && t.afdeling !== state.filterAfdeling) return false;
      }
      // Type-filter (chips)
      if (state.typeFilter && t.type !== state.typeFilter) return false;
      // Toggles
      if (state.hideDone && isTerminal(t)) return false;
      // Selectie-filters
      if (state.filterStatus && t.status !== state.filterStatus) return false;
      if (state.filterPrioriteit && t.prioriteit !== state.filterPrioriteit) return false;
      if (state.view !== "afdeling" && state.filterAfdeling && t.afdeling !== state.filterAfdeling) return false;
      if (state.filterTeamlid && String(t.toegewezenAanId) !== String(state.filterTeamlid)) return false;
      if (state.filterDeadline && String(t.deadline || "").slice(0, 10) !== state.filterDeadline) return false;
      // Zoeken
      if (q) {
        var hay = (t.naam || "") + " " + (t.beschrijving || "") + " " + (t.afdeling || "") + " " +
          (t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId)) + " " + makerLabel(t.aangemaaktDoorId, t.aangemaaktDoorNaam);
        if (hay.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function deadlineBucket(t) {
    var dl = String(t && t.deadline || "").slice(0, 10);
    if (!dl) return "geen";
    var today = todayStr();
    if (dl < today) return "telaat";
    if (dl === today) return "vandaag";
    var now = new Date();
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
    var endStr = end.getFullYear() + "-" + ("0" + (end.getMonth() + 1)).slice(-2) + "-" + ("0" + end.getDate()).slice(-2);
    return dl <= endStr ? "dezeweek" : "later";
  }
  var BUCKETS = [
    { key: "telaat", label: "Te laat" }, { key: "vandaag", label: "Vandaag" },
    { key: "dezeweek", label: "Deze week" }, { key: "later", label: "Later" }, { key: "geen", label: "Geen deadline" },
  ];

  function renderRow(t) {
    var manage = canManage();
    var actionsCell = "";
    if (manage) {
      actionsCell = t.archived
        ? '<div class="hr-row-actions"><button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(t.id) + '">Herstel</button>' +
          '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(t.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button></div>'
        : '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(t.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';
    }
    var nameButton = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(t.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' + escapeHtml(t.naam) + '</button>';
    var sub = t.beschrijving ? '<br><span style="color:var(--text-muted);font-size:12px;">' + escapeHtml(t.beschrijving.slice(0, 80)) + (t.beschrijving.length > 80 ? "…" : "") + '</span>' : "";
    return '<tr data-id="' + escapeHtml(t.id) + '" class="taken-row" style="cursor:pointer">' +
      '<td data-col="type">' + typePill(t) + '</td>' +
      '<td data-col="naam">' + nameButton + sub + '</td>' +
      '<td data-col="afdeling">' + escapeHtml(t.afdeling || "—") + '</td>' +
      '<td data-col="toegewezen">' + escapeHtml(t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId) || "—") + '</td>' +
      '<td data-col="aangemaakt_door">' + escapeHtml(makerLabel(t.aangemaaktDoorId, t.aangemaaktDoorNaam)) + '</td>' +
      '<td data-col="status">' + statusPill(t) + '</td>' +
      '<td data-col="deadline">' + escapeHtml(fmtNlDate(t.deadline)) + '</td>' +
      '<td data-col="prioriteit">' + prioriteitPill(t) + '</td>' +
      '<td class="hr-actions-cell">' + actionsCell + '</td></tr>';
  }

  function renderList() {
    var tbody = document.getElementById("taken-tbody");
    if (!tbody) return;
    var visible = listItems().slice().sort(function (a, b) {
      var aDone = isTerminal(a) ? 1 : 0, bDone = isTerminal(b) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      var ad = a.deadline ? String(a.deadline) : "9999", bd = b.deadline ? String(b.deadline) : "9999";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return String(a.naam || "").localeCompare(String(b.naam || ""), "nl");
    });
    var groups = { telaat: [], vandaag: [], dezeweek: [], later: [], geen: [] };
    visible.forEach(function (t) { (groups[deadlineBucket(t)] || groups.geen).push(t); });
    var html = "";
    BUCKETS.forEach(function (bk) {
      var rows = groups[bk.key] || [];
      if (!rows.length) return;
      html += '<tr class="taken-group-row"><td colspan="9"><span class="taken-group-name">' + escapeHtml(bk.label) + '</span> <span class="taken-group-count">(' + rows.length + ')</span></td></tr>';
      html += rows.map(renderRow).join("");
    });
    if (!html) html = '<tr class="taken-group-empty"><td colspan="9">Geen items gevonden.</td></tr>';
    tbody.innerHTML = html;
    var rangeEl = document.getElementById("taken-pager-range");
    if (rangeEl) rangeEl.textContent = visible.length + " " + (visible.length === 1 ? "item" : "items");
  }

  // ─── Managementoverzicht ─────────────────────────────────────────────────────
  function mgmtRow(t) {
    return '<button type="button" class="taken-mgmt-item" data-action="edit" data-id="' + escapeHtml(t.id) + '">' +
      '<span class="taken-mgmt-item-name">' + escapeHtml(t.naam) + '</span>' +
      '<span class="taken-mgmt-item-meta">' +
        (t.afdeling ? '<span class="taken-mgmt-chip">' + escapeHtml(t.afdeling) + '</span>' : '') +
        '<span class="taken-mgmt-status" style="' + statusStyle(t) + '">' + escapeHtml(statusLabel(t)) + '</span>' +
        (t.deadline ? '<span class="taken-mgmt-date">' + escapeHtml(fmtNlDate(t.deadline)) + '</span>' : '') +
      '</span></button>';
  }
  function renderMgmt() {
    var items = allItems().filter(function (t) { return t && !t.archived; });
    var verzoeken = items.filter(isVerzoekTeBeoordelen);
    var besluiten = items.filter(isBesluitOpen);
    var achterstallig = items.filter(isAchterstallig);
    var kritiek = items.filter(isKritiek);
    function fill(id, arr, leeg) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = arr.length ? arr.map(mgmtRow).join("") : '<div class="taken-mgmt-empty">' + leeg + '</div>';
    }
    fill("taken-mgmt-verzoeken", verzoeken, "Geen openstaande verzoeken.");
    fill("taken-mgmt-besluiten", besluiten, "Geen open besluitpunten.");
    fill("taken-mgmt-achterstallig", achterstallig, "Geen achterstallige taken. 👍");
    fill("taken-mgmt-kritiek", kritiek, "Geen kritieke taken.");
    var counts = { verzoeken: verzoeken.length, besluiten: besluiten.length, achterstallig: achterstallig.length, kritiek: kritiek.length };
    Object.keys(counts).forEach(function (k) {
      var c = document.querySelector('[data-count="' + k + '"]');
      if (c) c.textContent = counts[k];
    });
  }

  // ─── Organisatie-dashboard ───────────────────────────────────────────────────
  function renderOrg() {
    var items = allItems().filter(function (t) { return t && !t.archived; });
    var taken = items.filter(function (t) { return t.type === "taak"; });
    var open = taken.filter(isTaakOpen);
    var afgerond = taken.filter(function (t) { return t.status === "Voltooid"; });
    var achterstallig = taken.filter(isAchterstallig);
    var kritiek = taken.filter(isKritiek);
    var verzoeken = items.filter(isVerzoekTeBeoordelen);

    function setVal(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
    setVal("tk-kpi-open", open.length);
    setVal("tk-kpi-afgerond", afgerond.length);
    setVal("tk-kpi-achterstallig", achterstallig.length);
    setVal("tk-kpi-kritiek", kritiek.length);
    setVal("tk-kpi-verzoeken", verzoeken.length);

    // Gemiddelde afhandeltijd (aanmaak → afronding) in dagen, over afgeronde taken.
    var som = 0, n = 0;
    afgerond.forEach(function (t) {
      var start = Date.parse(t.aanmaakdatum), eind = Date.parse(t.goedgekeurdOp || t.laatstGewijzigd || "");
      if (isFinite(start) && isFinite(eind) && eind >= start) { som += (eind - start) / 86400000; n++; }
    });
    setVal("tk-kpi-afhandeltijd", n ? (Math.round((som / n) * 10) / 10).toString().replace(".", ",") : "—");

    // Per afdeling.
    var perAfd = {};
    AFDELINGEN.forEach(function (a) { perAfd[a] = { open: 0, achterstallig: 0, afgerond: 0, verzoeken: 0 }; });
    perAfd["(geen)"] = { open: 0, achterstallig: 0, afgerond: 0, verzoeken: 0 };
    function bucketOf(a) { return (a && perAfd[a]) ? a : "(geen)"; }
    taken.forEach(function (t) {
      var b = perAfd[bucketOf(t.afdeling)];
      if (isTaakOpen(t)) b.open++;
      if (isAchterstallig(t)) b.achterstallig++;
      if (t.status === "Voltooid") b.afgerond++;
    });
    verzoeken.forEach(function (t) { perAfd[bucketOf(t.afdeling)].verzoeken++; });
    var tbody = document.getElementById("taken-org-afdeling-tbody");
    if (tbody) {
      var rows = Object.keys(perAfd).filter(function (a) {
        var d = perAfd[a]; return d.open || d.achterstallig || d.afgerond || d.verzoeken;
      }).map(function (a) {
        var d = perAfd[a];
        return '<tr><td>' + escapeHtml(a === "(geen)" ? "— Geen afdeling —" : a) + '</td>' +
          '<td>' + d.open + '</td><td>' + (d.achterstallig ? '<strong style="color:var(--red)">' + d.achterstallig + '</strong>' : '0') + '</td>' +
          '<td>' + d.afgerond + '</td><td>' + d.verzoeken + '</td></tr>';
      }).join("");
      tbody.innerHTML = rows || '<tr><td colspan="5" style="color:var(--text-muted)">Nog geen taken.</td></tr>';
    }
  }

  // ─── View-orchestratie ───────────────────────────────────────────────────────
  function applyView() {
    var listV = document.getElementById("taken-list-view");
    var mgmtV = document.getElementById("taken-mgmt-view");
    var orgV = document.getElementById("taken-org-view");
    var isList = state.view === "mijn" || state.view === "afdeling";
    if (listV) listV.hidden = !isList;
    if (mgmtV) mgmtV.hidden = state.view !== "management";
    if (orgV) orgV.hidden = state.view !== "organisatie";
    // Afdeling-filter alleen relevant in afdeling-view.
    var afdWrap = document.getElementById("taken-filter-afdeling");
    if (afdWrap) afdWrap.parentElement.style.display = "";
    render();
  }

  function render() {
    if (state.view === "management") { renderMgmt(); return; }
    if (state.view === "organisatie") { renderOrg(); return; }
    renderList();
  }

  // ─── Filters vullen ──────────────────────────────────────────────────────────
  function populateAfdelingFilter() {
    var sel = document.getElementById("taken-filter-afdeling");
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '<option value="">Alle afdelingen</option>' + AFDELINGEN.map(function (a) {
      return '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>';
    }).join("");
    sel.value = prev || "";
  }
  function populateStatusFilter() {
    var sel = document.getElementById("taken-filter-status");
    if (!sel) return;
    var prev = sel.value;
    var statuses = state.typeFilter ? (STATUS_BY_TYPE[state.typeFilter] || []) : STATUS_BY_TYPE.taak;
    sel.innerHTML = '<option value="">Alle statussen</option>' + statuses.map(function (s) {
      var meta = (STATUS_META[state.typeFilter || "taak"] || STATUS_META.taak)[s];
      return '<option value="' + escapeHtml(s) + '">' + escapeHtml(meta ? meta.label : s) + '</option>';
    }).join("");
    sel.value = statuses.indexOf(prev) >= 0 ? prev : "";
    if (sel.value !== prev) state.filterStatus = sel.value;
  }
  function populateTeamlidFilter() {
    var sel = document.getElementById("taken-filter-teamlid");
    if (!sel) return;
    var prev = sel.value;
    var byId = {};
    allItems().forEach(function (t) {
      if (t && t.toegewezenAanId && !byId[t.toegewezenAanId]) byId[t.toegewezenAanId] = t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId);
    });
    sel.innerHTML = '<option value="">Alle teamleden</option>' + Object.keys(byId)
      .sort(function (a, b) { return String(byId[a]).localeCompare(String(byId[b]), "nl", { sensitivity: "base" }); })
      .map(function (id) { return '<option value="' + escapeHtml(id) + '">' + escapeHtml(byId[id] || "Onbekend") + '</option>'; }).join("");
    sel.value = prev || "";
  }

  // ─── Toewijs-dropdown (hiërarchie-gefilterd via RPC) ─────────────────────────
  var _assignableIds = null;
  async function loadAssignableIds() {
    if (_assignableIds !== null) return _assignableIds;
    try {
      if (window.besaSupabase) {
        var r = await window.besaSupabase.rpc("taken_toewijsbare_mw_ids");
        if (!r.error && Array.isArray(r.data)) {
          var map = {}; r.data.forEach(function (row) { if (row && row.id) map[row.id] = true; });
          _assignableIds = map; return _assignableIds;
        }
      }
    } catch (e) { /* */ }
    _assignableIds = null;
    return _assignableIds;
  }
  async function fillMedewerkerSelect(selectId, keepCurrentId) {
    var sel = document.getElementById(selectId);
    if (!sel || !window.medewerkersDB) return;
    var allowed = await loadAssignableIds();
    var keep = keepCurrentId != null ? keepCurrentId : sel.value;
    var items = (window.medewerkersDB.getAllSync() || []).filter(function (m) {
      if (!m || m.archived) return false;
      if (allowed && !allowed[m.id] && String(m.id) !== String(keep)) return false;
      return true;
    }).sort(function (a, b) { return ((a.voornaam || "") + " " + (a.achternaam || "")).localeCompare((b.voornaam || "") + " " + (b.achternaam || ""), "nl"); });
    sel.innerHTML = '<option value="">— Niemand —</option>' + items.map(function (m) {
      return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(((m.voornaam || "") + " " + (m.achternaam || "")).trim()) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }

  // ─── Modal ───────────────────────────────────────────────────────────────────
  function fillAfdelingSelect(selectId, keep) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Kies afdeling —</option>' + AFDELINGEN.map(function (a) {
      return '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }
  function fillStatusSelect(type, keep) {
    var sel = document.getElementById("taken-add-status");
    if (!sel) return;
    var statuses = STATUS_BY_TYPE[type] || STATUS_BY_TYPE.taak;
    sel.innerHTML = statuses.map(function (s) {
      var meta = (STATUS_META[type] || STATUS_META.taak)[s];
      return '<option value="' + escapeHtml(s) + '">' + escapeHtml(meta ? meta.label : s) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }

  function setModalType(type, lockReason) {
    state.modalType = type;
    var picks = document.querySelectorAll(".taken-typepick .filter-chip");
    picks.forEach(function (b) {
      var on = b.getAttribute("data-mtype") === type;
      b.classList.toggle("filter-chip--active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var lock = document.getElementById("taken-type-locklabel");
    var pickWrap = document.querySelector(".taken-typepick");
    if (lockReason) {
      if (pickWrap) pickWrap.style.display = "none";
      if (lock) { lock.hidden = false; lock.textContent = lockReason; }
    } else {
      if (pickWrap) pickWrap.style.display = "";
      if (lock) lock.hidden = true;
    }
    // Veld-zichtbaarheid per type.
    var toegewezenField = document.getElementById("taken-toegewezen-field");
    var statusField = document.getElementById("taken-status-field");
    var naamLbl = document.getElementById("taken-add-naam-label");
    var beschrLbl = document.getElementById("taken-add-beschrijving-label");
    var deadlineLbl = document.getElementById("taken-add-deadline-label");
    if (toegewezenField) toegewezenField.style.display = (type === "taak") ? "" : "none";
    if (statusField) statusField.style.display = (type === "taak") ? "" : "none";
    if (naamLbl) naamLbl.textContent = type === "verzoek" ? "Onderwerp" : (type === "goedkeuring" ? "Besluitpunt" : "Titel");
    if (beschrLbl) beschrLbl.textContent = type === "verzoek" ? "Toelichting op je verzoek" : (type === "goedkeuring" ? "Waarover moet besloten worden?" : "Beschrijving");
    if (deadlineLbl) deadlineLbl.textContent = type === "goedkeuring" ? "Besluit nodig vóór" : "Deadline";
    fillStatusSelect(type, "--");
  }

  function openAddModal(item) {
    state.editingId = item ? item.id : null;
    state.editingItem = item || null;
    var modal = document.getElementById("taken-add-modal");
    if (!modal) return;
    var title = document.getElementById("taken-add-title");
    var idInput = document.getElementById("taken-edit-id");
    var naam = document.getElementById("taken-add-naam");
    var beschrijving = document.getElementById("taken-add-beschrijving");
    var prioriteit = document.getElementById("taken-add-prioriteit");
    var deadline = document.getElementById("taken-add-deadline");
    var submit = document.getElementById("taken-add-submit-btn");
    var typeField = document.getElementById("taken-type-field");

    fillAfdelingSelect("taken-add-afdeling", item ? (item.afdeling || "") : "");

    if (item) {
      // Bewerken — type vast.
      if (typeField) typeField.style.display = "";
      setModalType(item.type, "Type: " + (TYPE_META[item.type] || TYPE_META.taak).label);
      title.textContent = (TYPE_META[item.type] || TYPE_META.taak).label + " bekijken";
      idInput.value = item.id;
      naam.value = item.naam || "";
      beschrijving.value = item.beschrijving || "";
      prioriteit.value = item.prioriteit || "Low";
      deadline.value = item.deadline ? String(item.deadline).slice(0, 10) : "";
      fillStatusSelect(item.type, item.status);
      if (item.type === "taak") fillMedewerkerSelect("taken-add-toegewezen", item.toegewezenAanId || "");
      submit.textContent = "Opslaan";
      submit.style.display = (canManage() || isMaker(item) || isAssignee(item)) ? "" : "none";
      showThread(item.id);
    } else {
      // Aanmaken — medewerkers kunnen enkel verzoeken indienen.
      var defaultType = canManage() ? "taak" : "verzoek";
      if (typeField) typeField.style.display = canManage() ? "" : "none";
      setModalType(defaultType, canManage() ? null : null);
      title.textContent = canManage() ? "Nieuw item" : "Verzoek indienen";
      idInput.value = "";
      naam.value = ""; beschrijving.value = ""; prioriteit.value = "Low"; deadline.value = "";
      fillMedewerkerSelect("taken-add-toegewezen", "");
      submit.textContent = canManage() ? "Toevoegen" : "Verzoek indienen";
      submit.style.display = "";
      hideThread();
    }
    renderActionBlocks(item);
    modal.style.display = "flex";
    setTimeout(function () { naam.focus(); }, 50);
  }

  function closeAddModal() {
    state.editingId = null; state.editingItem = null; state.threadTaakId = null; state.threadFile = null;
    var modal = document.getElementById("taken-add-modal");
    if (modal) modal.style.display = "none";
    ["taken-approve-block", "taken-verzoek-block", "taken-besluit-block"].forEach(function (id) {
      var b = document.getElementById(id); if (b) b.setAttribute("hidden", "");
    });
  }

  function renderActionBlocks(item) {
    var approve = document.getElementById("taken-approve-block");
    var verzoek = document.getElementById("taken-verzoek-block");
    var besluit = document.getElementById("taken-besluit-block");
    [approve, verzoek, besluit].forEach(function (b) { if (b) b.setAttribute("hidden", ""); });
    // reset reden-velden
    ["taken-reject-reason", "taken-verzoek-reden", "taken-besluit-reden"].forEach(function (id) { var e = document.getElementById(id); if (e) e.value = ""; });
    var rw = document.getElementById("taken-reject-reason-wrap"); if (rw) rw.setAttribute("hidden", "");
    if (!item) return;
    if (wachtOpGoedkeuring(item) && magGoedkeuren(item)) { if (approve) approve.removeAttribute("hidden"); }
    else if (magBeoordelen(item)) {
      if (verzoek) verzoek.removeAttribute("hidden");
      fillMedewerkerSelect("taken-verzoek-toegewezen", "");
    }
    else if (magBeslissen(item)) { if (besluit) besluit.removeAttribute("hidden"); }
  }

  async function submitAddForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("taken-add-submit-btn");
    var idVal = document.getElementById("taken-edit-id").value;
    var naam = document.getElementById("taken-add-naam");
    var beschrijving = document.getElementById("taken-add-beschrijving").value;
    var afdeling = document.getElementById("taken-add-afdeling").value || null;
    var prioriteit = document.getElementById("taken-add-prioriteit").value;
    var deadline = document.getElementById("taken-add-deadline").value || null;
    var type = state.modalType;
    if (!naam.value.trim()) { naam.focus(); return; }

    var payload = { type: type, naam: naam.value.trim(), beschrijving: beschrijving, afdeling: afdeling, prioriteit: prioriteit, deadline: deadline };
    if (type === "taak") {
      payload.toegewezenAanId = document.getElementById("taken-add-toegewezen").value || null;
      payload.status = document.getElementById("taken-add-status").value || "--";
    } else {
      payload.toegewezenAanId = null;
      // Status niet uit een (verborgen) veld lezen: behoud bij bewerken, default bij aanmaken.
      payload.status = idVal && state.editingItem ? state.editingItem.status : (type === "verzoek" ? "Ingediend" : "Open");
    }

    submit.disabled = true;
    try {
      if (idVal) {
        await window.takenDB.update(idVal, payload);
        if (window.showSaveModal) window.showSaveModal(payload.naam, "Bijgewerkt");
      } else if (type === "verzoek") {
        await window.takenDB.submitVerzoek(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Verzoek ingediend");
      } else if (type === "goedkeuring") {
        await window.takenDB.addBesluit(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Besluitpunt aangemaakt");
      } else {
        await window.takenDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", payload.naam);
      }
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
      else console.error("[taken] save failed", err);
    } finally { submit.disabled = false; }
  }

  // ─── Goedkeuren/afkeuren taak (door de aanmaker) ─────────────────────────────
  function approveCurrentTaak() {
    var id = state.editingId; if (!id) return;
    var item = window.takenDB.getByIdSync(id); if (!item) return;
    window.showSliderConfirmModal({
      title: "Taak goedkeuren en afronden?",
      message: "De taak wordt goedgekeurd en gearchiveerd. De medewerker krijgt hiervan een melding.",
      preview: item.naam || "", okLabel: "Akkoord", cancelLabel: "Annuleren",
    }).then(function (ok) {
      if (!ok) return;
      return window.takenDB.approve(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("info", "Goedgekeurd", (item.naam || "Taak") + " is afgerond en gearchiveerd.");
        closeAddModal();
      });
    }).catch(function (err) { if (window.showError) window.showError("Goedkeuren mislukt: " + (err && err.message || err)); });
  }
  function showRejectReason() {
    var wrap = document.getElementById("taken-reject-reason-wrap"); if (wrap) wrap.removeAttribute("hidden");
    var reason = document.getElementById("taken-reject-reason"); if (reason) { try { reason.focus(); } catch (e) { /* */ } }
  }
  async function submitReject() {
    var id = state.editingId; if (!id) return;
    var reden = (document.getElementById("taken-reject-reason").value || "").trim();
    var btn = document.getElementById("taken-reject-confirm-btn"); if (btn) btn.disabled = true;
    try {
      await window.takenDB.reject(id);
      if (reden && window.taakCommentsDB) { try { await window.taakCommentsDB.add({ taakId: id, tekst: "Afgekeurd: " + reden }); } catch (e) { /* */ } }
      if (window.showActionFeedback) window.showActionFeedback("info", "Teruggestuurd", "De medewerker krijgt een melding om de taak opnieuw te bekijken.");
      closeAddModal();
    } catch (err) { if (window.showError) window.showError("Afkeuren mislukt: " + (err && err.message || err)); }
    finally { if (btn) btn.disabled = false; }
  }

  // ─── Verzoek beoordelen ──────────────────────────────────────────────────────
  async function verzoekActie(actie) {
    var id = state.editingId; if (!id) return;
    var item = window.takenDB.getByIdSync(id); if (!item) return;
    var reden = (document.getElementById("taken-verzoek-reden").value || "").trim();
    var toegewezen = document.getElementById("taken-verzoek-toegewezen").value || null;
    try {
      if (actie === "goedkeuren") {
        await window.takenDB.beoordeelVerzoek(id, "goedkeuren", { toegewezenAanId: toegewezen });
        if (reden && window.taakCommentsDB) { try { await window.taakCommentsDB.add({ taakId: id, tekst: "Goedgekeurd: " + reden }); } catch (e) { /* */ } }
        if (window.showActionFeedback) window.showActionFeedback("info", "Goedgekeurd", "Verzoek omgezet naar een taak.");
      } else if (actie === "terugsturen") {
        await window.takenDB.beoordeelVerzoek(id, "terugsturen");
        if (reden && window.taakCommentsDB) { try { await window.taakCommentsDB.add({ taakId: id, tekst: "Teruggestuurd: " + reden }); } catch (e) { /* */ } }
        if (window.showActionFeedback) window.showActionFeedback("info", "Teruggestuurd", "De indiener krijgt een melding.");
      } else if (actie === "afwijzen") {
        await window.takenDB.beoordeelVerzoek(id, "afwijzen");
        if (reden && window.taakCommentsDB) { try { await window.taakCommentsDB.add({ taakId: id, tekst: "Afgewezen: " + reden }); } catch (e) { /* */ } }
        if (window.showActionFeedback) window.showActionFeedback("info", "Afgewezen", "De indiener krijgt een melding.");
      }
      closeAddModal();
    } catch (err) { if (window.showError) window.showError("Actie mislukt: " + (err && err.message || err)); }
  }

  // ─── Besluit nemen ───────────────────────────────────────────────────────────
  async function besluitActie(besluit) {
    var id = state.editingId; if (!id) return;
    var reden = (document.getElementById("taken-besluit-reden").value || "").trim();
    try {
      await window.takenDB.neemBesluit(id, besluit);
      if (reden && window.taakCommentsDB) { try { await window.taakCommentsDB.add({ taakId: id, tekst: "Besluit (" + besluit + "): " + reden }); } catch (e) { /* */ } }
      if (window.showActionFeedback) window.showActionFeedback("info", "Besluit vastgelegd", besluit);
      closeAddModal();
    } catch (err) { if (window.showError) window.showError("Besluit mislukt: " + (err && err.message || err)); }
  }

  // ─── Gespreksdraad + bijlagen (ongewijzigd patroon) ──────────────────────────
  function fileIsImage(mime) { return /^image\//.test(String(mime || "")); }
  function bijlageChip(b) {
    var icon = fileIsImage(b.fileMime)
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
    return '<a class="taak-bijlage-chip" href="' + escapeHtml(b.url || "#") + '" target="_blank" rel="noopener" title="' + escapeHtml(b.naam) + '">' + icon + '<span>' + escapeHtml(b.naam) + '</span></a>';
  }
  function renderThread() {
    var taakId = state.threadTaakId;
    var list = document.getElementById("taken-thread-list");
    var countEl = document.getElementById("taken-thread-count");
    if (!list || !taakId) return;
    var comments = (window.taakCommentsDB && window.taakCommentsDB.listSync(taakId)) || [];
    var bijlagen = (window.taakBijlagenDB && window.taakBijlagenDB.listSync(taakId)) || [];
    var losseBijlagen = bijlagen.filter(function (b) { return !b.commentId; });
    var totaal = comments.length + losseBijlagen.length;
    if (countEl) countEl.textContent = totaal ? "(" + totaal + ")" : "";
    if (!totaal) { list.innerHTML = '<div class="taak-thread-empty">Nog geen opmerkingen. Schrijf de eerste hieronder.</div>'; return; }
    var items = [];
    comments.forEach(function (c) { items.push({ t: c.createdAt, kind: "comment", c: c, att: bijlagen.filter(function (b) { return b.commentId === c.id; }) }); });
    losseBijlagen.forEach(function (b) { items.push({ t: b.createdAt, kind: "bijlage", b: b }); });
    items.sort(function (a, b) { return String(a.t || "").localeCompare(String(b.t || "")); });
    list.innerHTML = items.map(function (it) {
      if (it.kind === "comment") {
        var attHtml = it.att.length ? '<div class="taak-thread-att">' + it.att.map(bijlageChip).join("") + '</div>' : "";
        return '<div class="taak-thread-item"><div class="taak-thread-meta"><span class="taak-thread-auteur">' + escapeHtml(it.c.auteurNaam || "Onbekend") + '</span><span class="taak-thread-time">' + escapeHtml(fmtNlDateTime(it.c.createdAt)) + '</span></div><div class="taak-thread-tekst">' + escapeHtml(it.c.tekst).replace(/\n/g, "<br>") + '</div>' + attHtml + '</div>';
      }
      return '<div class="taak-thread-item taak-thread-item--file"><div class="taak-thread-meta"><span class="taak-thread-auteur">' + escapeHtml(it.b.uploaderNaam || "Onbekend") + '</span><span class="taak-thread-time">' + escapeHtml(fmtNlDateTime(it.b.createdAt)) + '</span></div><div class="taak-thread-att">' + bijlageChip(it.b) + '</div></div>';
    }).join("");
    list.scrollTop = list.scrollHeight;
  }
  function showThread(taakId) {
    state.threadTaakId = taakId; state.threadFile = null;
    var section = document.getElementById("taken-thread"); if (section) section.removeAttribute("hidden");
    var fnameEl = document.getElementById("taken-thread-file-name"); if (fnameEl) fnameEl.textContent = "";
    var input = document.getElementById("taken-thread-input"); if (input) input.value = "";
    renderThread();
    if (window.taakThreadDB) window.taakThreadDB.load(taakId).then(function () { if (state.threadTaakId === taakId) renderThread(); }).catch(function () { /* */ });
  }
  function hideThread() {
    state.threadTaakId = null; state.threadFile = null;
    var section = document.getElementById("taken-thread"); if (section) section.setAttribute("hidden", "");
  }
  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = function () { reject(reader.error || new Error("Lezen mislukt")); }; reader.readAsDataURL(file); });
  }
  async function submitThreadMessage() {
    var taakId = state.threadTaakId; if (!taakId) return;
    var input = document.getElementById("taken-thread-input");
    var sendBtn = document.getElementById("taken-thread-send");
    var tekst = (input && input.value || "").trim();
    var file = state.threadFile;
    if (!tekst && !file) { if (input) input.focus(); return; }
    if (sendBtn) sendBtn.disabled = true;
    try {
      var commentId = null;
      if (tekst) { var c = await window.taakCommentsDB.add({ taakId: taakId, tekst: tekst }); commentId = c && c.id; }
      if (file) {
        var dataUrl = await readFileAsDataUrl(file);
        await window.taakBijlagenDB.add({ taakId: taakId, commentId: commentId, fileData: dataUrl, fileName: file.name, fileMime: file.type, fileSize: file.size });
      }
      if (input) input.value = "";
      state.threadFile = null;
      var fnameEl = document.getElementById("taken-thread-file-name"); if (fnameEl) fnameEl.textContent = "";
      var fileInput = document.getElementById("taken-thread-file"); if (fileInput) fileInput.value = "";
      renderThread();
    } catch (err) { if (window.showError) window.showError("Plaatsen mislukt: " + (err && err.message || err)); }
    finally { if (sendBtn) sendBtn.disabled = false; }
  }

  // ─── Slider-modals (archiveren / verwijderen) ────────────────────────────────
  function setupSliderModal(sliderId, confirmBtnId) {
    var slider = document.getElementById(sliderId), confirm = document.getElementById(confirmBtnId);
    if (!slider || !confirm) return;
    slider.addEventListener("input", function () { var pct = Number(slider.value); slider.style.setProperty("--employee-slider-pct", pct + "%"); confirm.disabled = pct < 100; });
  }
  function openArchiveModal(item) {
    state.archivingId = item.id;
    var modal = document.getElementById("taken-archive-modal");
    document.getElementById("taken-archive-preview").textContent = item.naam || "";
    var slider = document.getElementById("taken-archive-slider"); slider.value = 0; slider.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("taken-archive-confirm-btn").disabled = true;
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closeArchiveModal() { state.archivingId = null; var m = document.getElementById("taken-archive-modal"); if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); } }
  function openPurgeModal(item) {
    state.purgingId = item.id;
    var modal = document.getElementById("taken-purge-modal");
    document.getElementById("taken-purge-preview").textContent = item.naam || "";
    var slider = document.getElementById("taken-purge-slider"); slider.value = 0; slider.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("taken-purge-confirm-btn").disabled = true;
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closePurgeModal() { state.purgingId = null; var m = document.getElementById("taken-purge-modal"); if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); } }

  // ─── Rol-bewuste headerknop + view-tabs ──────────────────────────────────────
  function renderHeaderActions() {
    var wrap = document.getElementById("taken-header-actions");
    if (!wrap) return;
    var label = canManage() ? "+ Toevoegen" : "+ Verzoek indienen";
    wrap.innerHTML = '<button class="btn-primary" type="button" id="taken-add-btn">' + label + '</button>';
    document.getElementById("taken-add-btn").addEventListener("click", function () { openAddModal(null); });
  }
  function applyRoleVisibility() {
    var manage = canManage();
    ["afdeling", "management", "organisatie"].forEach(function (v) {
      var tab = document.getElementById("taken-view-" + v);
      if (tab) tab.hidden = !manage;
    });
    // Afdelingstaken toont standaard álle zichtbare team-taken (RLS scoped het al);
    // de afdeling-dropdown is een optioneel filter, geen verborgen voorinstelling.
    renderHeaderActions();
  }

  function setView(view) {
    if ((view === "afdeling" || view === "management" || view === "organisatie") && !canManage()) view = "mijn";
    state.view = view;
    document.querySelectorAll(".taken-viewtabs .filter-chip").forEach(function (b) {
      var on = b.getAttribute("data-view") === view;
      b.classList.toggle("filter-chip--active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    applyView();
  }
  function setTypeFilter(type) {
    state.typeFilter = type || "";
    document.querySelectorAll(".taken-typefilter .filter-chip").forEach(function (b) {
      var on = (b.getAttribute("data-type") || "") === state.typeFilter;
      b.classList.toggle("filter-chip--active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    populateStatusFilter();
    render();
  }

  function resetAllFilters() {
    state.search = ""; state.filterStatus = ""; state.filterPrioriteit = ""; state.filterTeamlid = "";
    state.filterDeadline = ""; state.showArchived = false; state.hideDone = false;
    ["taken-search", "taken-filter-status", "taken-filter-prioriteit", "taken-filter-teamlid", "taken-filter-deadline"].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
    var arch = document.getElementById("taken-archived-toggle"); if (arch) arch.checked = false;
    var hide = document.getElementById("taken-hide-done-toggle"); if (hide) hide.checked = false;
    render();
    if (window.showActionFeedback) window.showActionFeedback("info", "Filters gewist", "De filters zijn teruggezet.");
  }

  // ─── Event-bedrading ─────────────────────────────────────────────────────────
  function wireEvents() {
    // View-tabs
    document.querySelectorAll(".taken-viewtabs .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });
    // Type-filter
    document.querySelectorAll(".taken-typefilter .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () { setTypeFilter(b.getAttribute("data-type") || ""); });
    });
    // Modal type-pick
    document.querySelectorAll(".taken-typepick .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () { if (!state.editingId) setModalType(b.getAttribute("data-mtype"), null); });
    });

    document.getElementById("taken-add-close-btn").addEventListener("click", closeAddModal);
    document.getElementById("taken-add-cancel-btn").addEventListener("click", closeAddModal);
    document.getElementById("taken-add-form").addEventListener("submit", submitAddForm);

    // Goedkeuren/afkeuren taak
    document.getElementById("taken-approve-btn").addEventListener("click", approveCurrentTaak);
    document.getElementById("taken-reject-btn").addEventListener("click", showRejectReason);
    document.getElementById("taken-reject-confirm-btn").addEventListener("click", submitReject);
    // Verzoek-acties
    document.getElementById("taken-verzoek-approve-btn").addEventListener("click", function () { verzoekActie("goedkeuren"); });
    document.getElementById("taken-verzoek-return-btn").addEventListener("click", function () { verzoekActie("terugsturen"); });
    document.getElementById("taken-verzoek-reject-btn").addEventListener("click", function () { verzoekActie("afwijzen"); });
    // Besluit-acties
    document.getElementById("taken-besluit-approve-btn").addEventListener("click", function () { besluitActie("Goedgekeurd"); });
    document.getElementById("taken-besluit-reject-btn").addEventListener("click", function () { besluitActie("Afgekeurd"); });
    document.getElementById("taken-besluit-progress-btn").addEventListener("click", function () { besluitActie("In behandeling"); });

    // Gespreksdraad
    var threadFileBtn = document.getElementById("taken-thread-file-btn");
    var threadFileInput = document.getElementById("taken-thread-file");
    var threadFileName = document.getElementById("taken-thread-file-name");
    if (threadFileBtn && threadFileInput) {
      threadFileBtn.addEventListener("click", function () { threadFileInput.click(); });
      threadFileInput.addEventListener("change", function () { var f = threadFileInput.files && threadFileInput.files[0]; state.threadFile = f || null; if (threadFileName) threadFileName.textContent = f ? f.name : ""; });
    }
    document.getElementById("taken-thread-send").addEventListener("click", submitThreadMessage);
    var threadInput = document.getElementById("taken-thread-input");
    if (threadInput) threadInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitThreadMessage(); } });
    window.addEventListener("besa:taak-thread-updated", function (e) { var d = e && e.detail; if (d && d.taakId && state.threadTaakId && String(d.taakId) === String(state.threadTaakId)) renderThread(); });

    // Toolbar
    document.getElementById("taken-search").addEventListener("input", function (e) { state.search = e.target.value || ""; render(); });
    document.getElementById("taken-archived-toggle").addEventListener("change", function (e) { state.showArchived = !!e.target.checked; render(); });
    document.getElementById("taken-hide-done-toggle").addEventListener("change", function (e) { state.hideDone = !!e.target.checked; render(); });
    document.getElementById("taken-filter-status").addEventListener("change", function (e) { state.filterStatus = e.target.value || ""; render(); });
    document.getElementById("taken-filter-prioriteit").addEventListener("change", function (e) { state.filterPrioriteit = e.target.value || ""; render(); });
    document.getElementById("taken-filter-afdeling").addEventListener("change", function (e) { state.filterAfdeling = e.target.value || ""; render(); });
    document.getElementById("taken-filter-teamlid").addEventListener("change", function (e) { state.filterTeamlid = e.target.value || ""; render(); });
    document.getElementById("taken-filter-deadline").addEventListener("change", function (e) { state.filterDeadline = e.target.value || ""; render(); });
    document.getElementById("taken-filter-reset").addEventListener("click", resetAllFilters);

    // Rij-acties (lijst + managementoverzicht delegeren naar dezelfde handler)
    function rowClickHandler(e) {
      var btn = e.target.closest("[data-action]");
      if (btn) {
        var id = btn.getAttribute("data-id");
        var item = window.takenDB.getByIdSync(id);
        if (!item) return;
        var action = btn.getAttribute("data-action");
        if (action === "edit") openAddModal(item);
        else if (action === "archive") openArchiveModal(item);
        else if (action === "purge") openPurgeModal(item);
        else if (action === "restore") {
          window.takenDB.restore(id).then(function () { if (window.showActionFeedback) window.showActionFeedback("restored", item.naam); }).catch(function (err) { if (window.showError) window.showError("Herstellen mislukt: " + err.message); });
        }
        return;
      }
      var tr = e.target.closest("tr[data-id]");
      if (tr) { var ritem = window.takenDB.getByIdSync(tr.getAttribute("data-id")); if (ritem) openAddModal(ritem); }
    }
    document.getElementById("taken-tbody").addEventListener("click", rowClickHandler);
    document.getElementById("taken-mgmt-view").addEventListener("click", rowClickHandler);

    // Slider-modals
    setupSliderModal("taken-archive-slider", "taken-archive-confirm-btn");
    document.getElementById("taken-archive-close-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("taken-archive-cancel-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("taken-archive-confirm-btn").addEventListener("click", function () {
      var id = state.archivingId; if (!id) return;
      var item = window.takenDB.getByIdSync(id);
      window.takenDB.archive(id).then(function () { if (window.showActionFeedback) window.showActionFeedback("archived", item && item.naam || ""); closeArchiveModal(); }).catch(function (err) { if (window.showError) window.showError("Archiveren mislukt: " + err.message); closeArchiveModal(); });
    });
    setupSliderModal("taken-purge-slider", "taken-purge-confirm-btn");
    document.getElementById("taken-purge-close-btn").addEventListener("click", closePurgeModal);
    document.getElementById("taken-purge-cancel-btn").addEventListener("click", closePurgeModal);
    document.getElementById("taken-purge-confirm-btn").addEventListener("click", function () {
      var id = state.purgingId; if (!id) return;
      var item = window.takenDB.getByIdSync(id);
      window.takenDB.delete(id).then(function () { if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.naam || ""); closePurgeModal(); }).catch(function (err) { if (window.showError) window.showError("Verwijderen mislukt: " + err.message); closePurgeModal(); });
    });

    // Data-events
    window.addEventListener("besa:taken-updated", function () { populateTeamlidFilter(); render(); });
    window.addEventListener("besa:medewerkers-updated", function () { populateTeamlidFilter(); render(); });

    // Escape + overlay sluiten
    function isOpen(id, byDisplay) { var m = document.getElementById(id); if (!m) return false; return byDisplay ? getComputedStyle(m).display !== "none" : !m.hasAttribute("hidden"); }
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (isOpen("taken-purge-modal")) { ev.stopPropagation(); closePurgeModal(); return; }
      if (isOpen("taken-archive-modal")) { ev.stopPropagation(); closeArchiveModal(); return; }
      if (isOpen("taken-add-modal", true)) { ev.stopPropagation(); closeAddModal(); return; }
    });
    ["taken-add-modal", "taken-archive-modal", "taken-purge-modal"].forEach(function (id) {
      var m = document.getElementById(id); if (!m) return;
      m.addEventListener("click", function (e) { if (e.target !== m) return; if (id === "taken-add-modal") closeAddModal(); else if (id === "taken-archive-modal") closeArchiveModal(); else closePurgeModal(); });
    });
  }

  function init() {
    if (!window.takenDB) { console.error("[taken] takenDB niet geladen"); return; }
    wireEvents();
    populateAfdelingFilter();
    populateStatusFilter();
    applyRoleVisibility();
    applyView();
    // Context ophalen → rol-zichtbaarheid en headerknop bijwerken.
    window.takenDB.getContext().then(function (c) { if (c) { ctx = c; applyRoleVisibility(); render(); } }).catch(function () { /* */ });
    window.takenDB.ready.then(function () { populateTeamlidFilter(); render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
