/* global window, document */
/**
 * verzuim.js — Professioneel verzuim-dashboard.
 *
 * Bron-van-waarheid: window.verzuimDB (tabel `verzuim`) + de sub-data-lagen
 * verzuimMijlpalenDB (Wet-Poortwachter), verzuimContactmomentenDB (rapportages)
 * en verzuimDocsDB (privé documenten, signed URLs).
 *
 * Twee weergaven binnen dezelfde pagina:
 *   1. Dashboard  — KPI-strip + filterbare lijst van lopende verzuimcasussen.
 *   2. Detail     — één casus opengeklapt: verzuimduur, Wet-Poortwachter-tijdlijn
 *                   met "aangeleverd"-status, contactmomenten en documenten.
 *
 * Verwijderen kan alleen op SUB-items (mijlpaal / contactmoment / document) en
 * altijd met slider-bevestiging. Een verzuimcasus zelf wordt nooit verwijderd
 * (DIEHARD: data van een persoon) — de levensloop verloopt via status → Hersteld.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var dashView = $("vz-dash-view");
  var detailView = $("vz-detail-view");
  var caseListEl = $("vz-case-list");
  var searchInput = $("vz-search");

  if (!caseListEl || !detailView) return;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var filters = { status: "actief", type: "alle", q: "" };
  var currentId = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Vandaag op UTC-middernacht (consistent met verzuimMijlpalenDB).
  function todayMid() {
    var t = new Date();
    t.setUTCHours(0, 0, 0, 0);
    return t;
  }
  function parseISO(iso) {
    if (!iso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    var d = new Date(iso.length <= 10 ? (iso + "T00:00:00Z") : iso);
    return isFinite(d.getTime()) ? d : null;
  }
  function fmtNl(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return "—";
    return m[3] + "-" + m[2] + "-" + m[1];
  }
  var DAY = 86400000;
  function daysUntil(iso) {
    var d = parseISO(iso);
    if (!d) return null;
    return Math.floor((d.getTime() - todayMid().getTime()) / DAY);
  }
  function dagenZiek(c) {
    var start = parseISO(c.eerstZiektedag);
    if (!start) return null;
    var end = c.werkelijkeTerug ? parseISO(c.werkelijkeTerug) : todayMid();
    if (!end) end = todayMid();
    var d = Math.floor((end.getTime() - start.getTime()) / DAY);
    return d < 0 ? 0 : d;
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  function hue(name) {
    var s = String(name || "x"), h = 0, i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  // De BS2-import zette "Geïmporteerd vanuit Excel" als placeholder-beschrijving.
  // Die tonen we niet als echte toelichting — de data blijft ongemoeid (DIEHARD).
  function isPlaceholderBeschr(s) {
    return /^\s*ge[iï]mporteerd\s+vanuit\s+excel\s*$/i.test(String(s || ""));
  }
  function cleanBeschr(s) {
    return isPlaceholderBeschr(s) ? "" : String(s || "");
  }
  function isHersteld(c) { return String(c.status || "") === "Hersteld"; }
  function isActiveCase(c) {
    if (isHersteld(c)) return false;
    if (c.werkelijkeTerug && String(c.werkelijkeTerug).length >= 8) return false;
    return true;
  }
  function typeLabel(t) { return String(t) === "kort" ? "Kort" : "Langdurig"; }
  function statusMods(status) {
    var t = String(status || "").toLowerCase();
    if (t === "hersteld") return "hersteld";
    if (t === "in behandeling") return "behandeling";
    if (t === "afgekeurd" || t === "afgewezen") return "afgekeurd";
    if (t === "goedgekeurd") return "goedgekeurd";
    return "actief";
  }
  function fileSizeFmt(bytes) {
    var b = Number(bytes || 0);
    if (b <= 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return Math.round(b / 1024) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ---------------------------------------------------------------------------
  // Wet-Poortwachter-templates (1-op-1 BS2: template_id 1..9)
  // ---------------------------------------------------------------------------
  var WP_TEMPLATES = [
    { templateId: 1, type: "notification", week: 0,    naam: "Ziekmelding" },
    // G33 — week-1-melding bij arbodienst/bedrijfsarts als eigen mijlpaal.
    { templateId: 10, type: "notification", week: 1,   naam: "Ziekmelding arbodienst / bedrijfsarts (week 1)" },
    { templateId: 2, type: "action_plan",  week: 6,    naam: "Probleemanalyse" },
    { templateId: 3, type: "action_plan",  week: 8,    naam: "Plan van Aanpak" },
    // G33 — de wettelijke 42e-weeksmelding UWV los van de eerstejaarsevaluatie.
    { templateId: 11, type: "report",      week: 42,   naam: "42e-weeksmelding UWV" },
    { templateId: 4, type: "evaluation",   week: 42,   naam: "Eerstejaarsevaluatie" },
    { templateId: 5, type: "evaluation",   week: 52,   naam: "Eindevaluatie Eerste Ziektejaar" },
    { templateId: 6, type: "evaluation",   week: 88,   naam: "Tweedejaarsevaluatie" },
    { templateId: 7, type: "report",       week: 93,   naam: "WIA-aanvraag" },
    { templateId: 8, type: "assessment",   week: 104,  naam: "Einde Loondoorbetalingsverplichting" },
    { templateId: 9, type: "report",       week: null, naam: "Melding Beëindiging Ziekteverlof bij UWV" },
  ];
  var MP_LABELS = {
    notification: "Ziekmelding", action_plan: "Plan van Aanpak",
    evaluation: "Evaluatie", report: "Melding / rapportage", assessment: "Beoordeling",
  };
  var CM_LABELS = {
    contact_moment: "Contactmoment", company_doctor_visit: "Bezoek bedrijfsarts",
    company_doctor_feedback: "Terugkoppeling bedrijfsarts", other: "Anders",
  };
  function wpTemplateById(id) {
    var n = Number(id);
    for (var i = 0; i < WP_TEMPLATES.length; i++) if (WP_TEMPLATES[i].templateId === n) return WP_TEMPLATES[i];
    return null;
  }
  function mpDisplayName(it) {
    if (it && it.data && it.data.naam) return String(it.data.naam);
    return MP_LABELS[it && it.mijlpaalType] || (it && it.mijlpaalType) || "Mijlpaal";
  }
  function wpDeadlineFor(eersteZiektedag, week) {
    if (week == null || !eersteZiektedag) return "";
    var base = parseISO(eersteZiektedag);
    if (!base) return "";
    base = new Date(base.getTime());
    base.setUTCDate(base.getUTCDate() + Number(week) * 7);
    return base.toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------------------
  // Data getters
  // ---------------------------------------------------------------------------
  function allCases() {
    try { return (window.verzuimDB && window.verzuimDB.getAllSync()) || []; } catch (e) { return []; }
  }
  function caseById(id) {
    try { return (window.verzuimDB && window.verzuimDB.getByIdSync(id)) || null; } catch (e) { return null; }
  }
  function milestonesFor(id) {
    try {
      var arr = (window.verzuimMijlpalenDB && window.verzuimMijlpalenDB.getForVerzuimSync(id)) || [];
      return arr.slice().sort(function (a, b) {
        var da = a.deadlineDatum || "9999", db = b.deadlineDatum || "9999";
        return String(da).localeCompare(String(db));
      });
    } catch (e) { return []; }
  }
  function contactsFor(id) {
    try {
      var arr = (window.verzuimContactmomentenDB && window.verzuimContactmomentenDB.getForVerzuimSync(id)) || [];
      return arr.slice().sort(function (a, b) { return String(b.datum || "").localeCompare(String(a.datum || "")); });
    } catch (e) { return []; }
  }
  function docsFor(id) {
    try {
      var arr = (window.verzuimDocsDB && window.verzuimDocsDB.listSync(id)) || [];
      return arr.filter(function (d) { return d && !d.archived; })
        .sort(function (a, b) { return String(b.uploaddatum || "").localeCompare(String(a.uploaddatum || "")); });
    } catch (e) { return []; }
  }

  // Afgeleide cijfers per casus
  function derive(c) {
    var ms = milestonesFor(c.id);
    var open = ms.filter(function (m) { return !m.voltooidOp; });
    var done = ms.length - open.length;
    var overdue = 0, soon = 0, next = null;
    open.forEach(function (m) {
      if (!m.deadlineDatum) return;
      var du = daysUntil(m.deadlineDatum);
      if (du == null) return;
      if (du < 0) overdue++;
      else if (du <= 30) soon++;
      if (next == null || String(m.deadlineDatum) < String(next.deadlineDatum)) next = m;
    });
    return {
      total: ms.length, done: done, openCount: open.length,
      overdue: overdue, soon: soon, next: next,
      dagen: dagenZiek(c),
      docs: (function () { try { return window.verzuimDocsDB ? window.verzuimDocsDB.countSync(c.id) : 0; } catch (e) { return 0; } })(),
      contacts: contactsFor(c.id).length,
    };
  }

  // ---------------------------------------------------------------------------
  // KPI's
  // ---------------------------------------------------------------------------
  function renderKPIs() {
    var cases = allCases();
    var active = cases.filter(isActiveCase);
    var actief = active.length;
    var langdurig = active.filter(function (c) { return c.type === "lang" && (dagenZiek(c) || 0) > 42; }).length;
    var sumDagen = 0, nDagen = 0;
    active.forEach(function (c) { var d = dagenZiek(c); if (d != null) { sumDagen += d; nDagen++; } });
    var gem = nDagen ? Math.round(sumDagen / nDagen) : 0;
    var telaat = 0, komend = 0;
    active.forEach(function (c) {
      milestonesFor(c.id).forEach(function (m) {
        if (m.voltooidOp || !m.deadlineDatum) return;
        var du = daysUntil(m.deadlineDatum);
        if (du == null) return;
        if (du < 0) telaat++;
        else if (du <= 30) komend++;
      });
    });
    var hersteld = cases.filter(isHersteld).length;

    // G31 — Bradford-factor per medewerker over de laatste 52 weken:
    // B = S² × D (S = aantal ziekmeldingen, D = totaal ziektedagen).
    // "Frequent verzuim" = medewerkers met B ≥ 125 (gangbare aandachtsdrempel).
    var grens = new Date(todayMid().getTime() - 365 * 86400000);
    var perMw = {};
    cases.forEach(function (c) {
      var start = parseISO(c.eerstZiektedag);
      if (!start || start < grens) return;
      var naam = String(c.medewerker || "").trim().toLowerCase();
      if (!naam) return;
      if (!perMw[naam]) perMw[naam] = { s: 0, d: 0, label: String(c.medewerker || "").trim() };
      perMw[naam].s += 1;
      perMw[naam].d += Math.max(1, dagenZiek(c) || 1);
    });
    var frequent = [];
    Object.keys(perMw).forEach(function (k) {
      var e = perMw[k];
      var b = e.s * e.s * e.d;
      if (b >= 125) frequent.push(e.label + " (B=" + b + ")");
    });
    setText("vz-kpi-bradford", frequent.length);
    var bfTile = $("vz-kpi-bradford-tile");
    if (bfTile) bfTile.title = frequent.length ? ("Frequent verzuim: " + frequent.join(", ")) : "Geen medewerkers boven de Bradford-drempel.";

    setText("vz-kpi-actief", actief);
    setText("vz-kpi-langdurig", langdurig);
    setText("vz-kpi-duur", gem);
    setText("vz-kpi-telaat", telaat);
    setText("vz-kpi-komend", komend);
    setText("vz-kpi-hersteld", hersteld);
    var sub = $("vz-kpi-actief-sub");
    if (sub) sub.textContent = cases.length + " casussen totaal";
  }
  function setText(id, v) { var el = $(id); if (el) el.textContent = String(v); }

  // ---------------------------------------------------------------------------
  // Case list
  // ---------------------------------------------------------------------------
  function getFilteredCases() {
    var q = (filters.q || "").trim().toLowerCase();
    return allCases().filter(function (c) {
      if (filters.status === "actief" && !isActiveCase(c)) return false;
      if (filters.status === "hersteld" && !isHersteld(c)) return false;
      if (filters.type !== "alle" && c.type !== filters.type) return false;
      if (q && String(c.medewerker || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) {
      // Lopende casussen met te-late momenten bovenaan, dan op langste verzuim.
      var da = derive(a), db = derive(b);
      if (db.overdue !== da.overdue) return db.overdue - da.overdue;
      return (db.dagen || 0) - (da.dagen || 0);
    });
  }

  function nextMomentChip(d) {
    if (!d.next) {
      if (d.total > 0 && d.openCount === 0) return '<span class="vz-chip vz-chip--ok">Traject compleet</span>';
      return '<span class="vz-chip vz-chip--muted">Geen openstaand moment</span>';
    }
    var naam = mpDisplayName(d.next);
    var du = daysUntil(d.next.deadlineDatum);
    if (du == null) return '<span class="vz-chip vz-chip--muted">' + escHtml(naam) + '</span>';
    if (du < 0) return '<span class="vz-chip vz-chip--late">⚠ ' + escHtml(naam) + ' · ' + Math.abs(du) + ' d te laat</span>';
    if (du <= 30) return '<span class="vz-chip vz-chip--warn">' + escHtml(naam) + ' · over ' + du + ' d</span>';
    return '<span class="vz-chip vz-chip--soft">' + escHtml(naam) + ' · ' + fmtNl(d.next.deadlineDatum) + '</span>';
  }

  function renderCaseList() {
    var list = getFilteredCases();
    caseListEl.innerHTML = "";
    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "vz-empty";
      empty.innerHTML = '<div class="vz-empty-ico" aria-hidden="true">🗂️</div>'
        + '<p class="vz-empty-title">Geen verzuimcasussen gevonden</p>'
        + '<p class="vz-empty-sub">Pas de filters aan of meld een nieuw verzuim.</p>';
      caseListEl.appendChild(empty);
      return;
    }
    list.forEach(function (c) {
      var d = derive(c);
      var card = document.createElement("div");
      card.className = "vz-case-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("data-id", c.id);
      card.setAttribute("aria-label", "Open verzuimcasus van " + (c.medewerker || "onbekend"));

      var dagenTxt = d.dagen == null ? "—" : (d.dagen + " dag" + (d.dagen === 1 ? "" : "en"));
      var sinds = c.eerstZiektedag ? fmtNl(c.eerstZiektedag) : "onbekend";
      var prog = d.total ? (d.done + "/" + d.total + " aangeleverd") : "geen traject";

      card.innerHTML =
        '<div class="vz-case-av" style="--vz-h:' + hue(c.medewerker) + '">' + escHtml(initials(c.medewerker)) + '</div>'
        + '<div class="vz-case-main">'
        + '  <div class="vz-case-top">'
        + '    <span class="vz-case-name">' + escHtml(c.medewerker || "Onbekend") + '</span>'
        + '    <span class="vz-badge vz-badge--' + (c.type === "kort" ? "kort" : "lang") + '">' + typeLabel(c.type) + '</span>'
        + '    <span class="vz-pill vz-pill--' + statusMods(c.status) + '">' + escHtml(c.status || "Actief") + '</span>'
        + '  </div>'
        + '  <div class="vz-case-meta">'
        + '    <span class="vz-meta-it"><b>Ziek sinds</b> ' + sinds + '</span>'
        + '    <span class="vz-meta-it"><b>' + dagenTxt + '</b></span>'
        + '    <span class="vz-meta-it vz-meta-docs" title="Documenten">📎 ' + d.docs + '</span>'
        + '    <span class="vz-meta-it vz-meta-cm" title="Contactmomenten">💬 ' + d.contacts + '</span>'
        + '    <span class="vz-meta-it vz-meta-prog" title="Verplichte momenten">✓ ' + prog + '</span>'
        + '  </div>'
        + '</div>'
        + '<div class="vz-case-right">' + nextMomentChip(d)
        + '  <span class="vz-case-chev" aria-hidden="true">›</span>'
        + '</div>';
      caseListEl.appendChild(card);
    });
  }

  // ---------------------------------------------------------------------------
  // View switching
  // ---------------------------------------------------------------------------
  function showDash() {
    currentId = null;
    if (dashView) dashView.hidden = false;
    if (detailView) detailView.hidden = true;
    renderDash();
    try { window.scrollTo(0, 0); } catch (e) { /* */ }
  }
  function renderDash() {
    renderKPIs();
    renderCaseList();
  }
  function openCase(id) {
    var c = caseById(id);
    if (!c) return;
    currentId = id;
    if (dashView) dashView.hidden = true;
    if (detailView) detailView.hidden = false;
    renderDetail();
    try { window.scrollTo(0, 0); } catch (e) { /* */ }
    // Documenten zijn privé en worden lazy opgehaald bij openen van de casus.
    if (window.verzuimDocsDB) {
      window.verzuimDocsDB.list(id).then(function () { if (currentId === id) renderDocs(); }).catch(function () { /* */ });
    }
  }

  // ---------------------------------------------------------------------------
  // Detail render
  // ---------------------------------------------------------------------------
  function renderDetail() {
    if (!currentId) return;
    renderCaseHead();
    renderPoort();
    renderContacts();
    renderActies();
    renderDocs();
  }

  // G35 — naam-lookup voor uitgevoerd_door (profiel-uuid → weergavenaam).
  function profielNaamById(uid) {
    if (!uid) return "";
    try {
      var all = (window.profilesDB && window.profilesDB.getAllSync) ? (window.profilesDB.getAllSync() || []) : [];
      var p = all.find(function (x) { return x && String(x.id) === String(uid); });
      if (p) return ((p.voornaam || "") + " " + (p.achternaam || "")).trim() || p.email || "";
    } catch (e) { /* */ }
    return "";
  }
  function currentUserId() {
    try {
      var p = (window.profilesDB && window.profilesDB.getCurrentSync) ? window.profilesDB.getCurrentSync() : window.besaCurrentProfile;
      return p && p.id ? p.id : null;
    } catch (e) { return null; }
  }

  function renderCaseHead() {
    var head = $("vz-case-head");
    var c = caseById(currentId);
    if (!head || !c) return;
    var d = derive(c);
    var beschr = cleanBeschr(c.beschrijving);
    var chips = [];
    chips.push('<span class="vz-stat"><span class="vz-stat-lbl">Ziek sinds</span><span class="vz-stat-val">' + fmtNl(c.eerstZiektedag) + '</span></span>');
    chips.push('<span class="vz-stat"><span class="vz-stat-lbl">Verzuimduur</span><span class="vz-stat-val">' + (d.dagen == null ? "—" : (d.dagen + " dagen")) + '</span></span>');
    chips.push('<span class="vz-stat"><span class="vz-stat-lbl">Verwachte terugkeer</span><span class="vz-stat-val">' + fmtNl(c.verwachteTerug) + '</span></span>');
    if (c.werkelijkeTerug) chips.push('<span class="vz-stat"><span class="vz-stat-lbl">Werkelijke terugkeer</span><span class="vz-stat-val">' + fmtNl(c.werkelijkeTerug) + '</span></span>');

    head.innerHTML =
      '<div class="vz-case-av vz-case-av--lg" style="--vz-h:' + hue(c.medewerker) + '">' + escHtml(initials(c.medewerker)) + '</div>'
      + '<div class="vz-case-head-body">'
      + '  <div class="vz-case-head-top">'
      + '    <h2 class="vz-case-head-name">' + escHtml(c.medewerker || "Onbekend") + '</h2>'
      + '    <span class="vz-badge vz-badge--' + (c.type === "kort" ? "kort" : "lang") + '">' + typeLabel(c.type) + ' verzuim</span>'
      + '    <span class="vz-pill vz-pill--' + statusMods(c.status) + '">' + escHtml(c.status || "Actief") + '</span>'
      + '  </div>'
      + '  <div class="vz-stat-row">' + chips.join("") + '</div>'
      + (beschr ? '<p class="vz-case-head-note">' + escHtml(beschr) + '</p>' : '<p class="vz-case-head-note vz-case-head-note--muted">Geen toelichting toegevoegd.</p>')
      + '</div>'
      + '<div class="vz-case-head-actions">'
      + '  <button type="button" class="btn-outline" id="vz-case-edit-btn">Bewerken</button>'
      + '</div>';
    var editBtn = $("vz-case-edit-btn");
    if (editBtn) editBtn.addEventListener("click", function () { openCaseModal(c); });
  }

  function poortStatusBadge(m) {
    if (m.voltooidOp) {
      return '<span class="vz-ms-badge vz-ms-badge--done">✓ Aangeleverd op ' + fmtNl(m.voltooidOp) + '</span>';
    }
    var du = daysUntil(m.deadlineDatum);
    if (du == null) return '<span class="vz-ms-badge vz-ms-badge--open">Openstaand (geen deadline)</span>';
    if (du < 0) return '<span class="vz-ms-badge vz-ms-badge--late">⚠ ' + Math.abs(du) + ' dagen te laat</span>';
    if (du === 0) return '<span class="vz-ms-badge vz-ms-badge--warn">Vandaag</span>';
    if (du <= 30) return '<span class="vz-ms-badge vz-ms-badge--warn">Over ' + du + ' dagen</span>';
    return '<span class="vz-ms-badge vz-ms-badge--open">Over ' + du + ' dagen</span>';
  }

  function renderPoort() {
    var listEl = $("vz-poort-list");
    var progEl = $("vz-poort-progress");
    if (!listEl) return;
    var ms = milestonesFor(currentId);
    var done = ms.filter(function (m) { return m.voltooidOp; }).length;
    var total = ms.length;
    if (progEl) {
      var pct = total ? Math.round((done / total) * 100) : 0;
      progEl.innerHTML =
        '<div class="vz-prog-head"><span class="vz-prog-txt"><b>' + done + ' van ' + total + '</b> aangeleverd</span>'
        + '<span class="vz-prog-pct">' + pct + '%</span></div>'
        + '<div class="vz-prog-track"><span class="vz-prog-fill" style="width:' + pct + '%"></span></div>';
      progEl.hidden = total === 0;
    }
    if (!total) {
      listEl.innerHTML = '<div class="vz-inline-empty">Nog geen verplichte momenten. Klik op <b>Genereer traject</b> om het Wet-Poortwachter-traject aan te maken op basis van de eerste ziektedag.</div>';
      return;
    }
    listEl.innerHTML = ms.map(function (m) {
      var done = !!m.voltooidOp;
      var markBtn = done ? "" :
        '<button type="button" class="vz-mini-btn vz-mini-btn--ok" data-mp-done="' + escHtml(m.id) + '">Markeer aangeleverd</button>';
      return ''
        + '<div class="vz-ms-row ' + (done ? "is-done" : "") + '">'
        + '  <span class="vz-ms-dot" aria-hidden="true"></span>'
        + '  <div class="vz-ms-body">'
        + '    <div class="vz-ms-top"><span class="vz-ms-name">' + escHtml(mpDisplayName(m)) + '</span>'
        + poortStatusBadge(m) + '</div>'
        + '    <div class="vz-ms-meta">Deadline: ' + fmtNl(m.deadlineDatum) + '</div>'
        + '  </div>'
        + '  <div class="vz-ms-actions">'
        + markBtn
        + '    <button type="button" class="vz-icon-btn" title="Bewerken" data-mp-edit="' + escHtml(m.id) + '" aria-label="Mijlpaal bewerken">' + ICON_EDIT + '</button>'
        + '    <button type="button" class="vz-icon-btn vz-icon-btn--del" title="Verwijderen" data-mp-del="' + escHtml(m.id) + '" aria-label="Mijlpaal verwijderen">' + ICON_DEL + '</button>'
        + '  </div>'
        + '</div>';
    }).join("");
  }

  function renderContacts() {
    var listEl = $("vz-cm-list");
    if (!listEl) return;
    var items = contactsFor(currentId);
    if (!items.length) {
      listEl.innerHTML = '<div class="vz-inline-empty">Nog geen contactmomenten vastgelegd. Leg gesprekken en terugkoppelingen vast via <b>+ Contactmoment</b>.</div>';
      return;
    }
    listEl.innerHTML = items.map(function (it) {
      var note = it.notitie ? '<p class="vz-cm-note">' + escHtml(it.notitie) + '</p>' : '';
      // G35 — toon wie het contactmoment heeft uitgevoerd/geregistreerd.
      var doorNaam = profielNaamById(it.uitgevoerdDoor);
      var doorHtml = doorNaam ? '<span class="vz-cm-date">door ' + escHtml(doorNaam) + '</span>' : '';
      return ''
        + '<div class="vz-cm-item">'
        + '  <div class="vz-cm-itop">'
        + '    <span class="vz-cm-type">' + escHtml(CM_LABELS[it.type] || it.type) + '</span>'
        + '    <span class="vz-cm-date">' + fmtNl(it.datum) + '</span>'
        + doorHtml
        + '    <span class="vz-cm-acts">'
        + '      <button type="button" class="vz-icon-btn" title="Bewerken" data-cm-edit="' + escHtml(it.id) + '" aria-label="Contactmoment bewerken">' + ICON_EDIT + '</button>'
        + '      <button type="button" class="vz-icon-btn vz-icon-btn--del" title="Verwijderen" data-cm-del="' + escHtml(it.id) + '" aria-label="Contactmoment verwijderen">' + ICON_DEL + '</button>'
        + '    </span>'
        + '  </div>'
        + note
        + '</div>';
    }).join("");
  }

  // G35 — Acties (re-integratie-acties met deadline en eigenaar).
  function actiesFor(id) {
    try {
      var arr = (window.verzuimActiesDB && window.verzuimActiesDB.getForVerzuimSync(id)) || [];
      return arr.slice().sort(function (a, b) {
        if (!!a.voltooidOp !== !!b.voltooidOp) return a.voltooidOp ? 1 : -1;
        return String(a.deadline || "9999").localeCompare(String(b.deadline || "9999"));
      });
    } catch (e) { return []; }
  }
  function renderActies() {
    var listEl = $("vz-act-list");
    if (!listEl) return;
    var items = actiesFor(currentId);
    if (!items.length) {
      listEl.innerHTML = '<div class="vz-inline-empty">Nog geen acties vastgelegd. Leg afgesproken re-integratie-acties vast via <b>+ Actie</b>.</div>';
      return;
    }
    listEl.innerHTML = items.map(function (it) {
      var status;
      if (it.voltooidOp) {
        status = '<span class="vz-cm-date">✓ uitgevoerd ' + fmtNl(it.voltooidOp) + '</span>';
      } else if (it.deadline) {
        var du = daysUntil(it.deadline);
        status = du != null && du < 0
          ? '<span class="vz-cm-date" title="Deadline verstreken">⚠ deadline ' + fmtNl(it.deadline) + '</span>'
          : '<span class="vz-cm-date">deadline ' + fmtNl(it.deadline) + '</span>';
      } else {
        status = '<span class="vz-cm-date">geen deadline</span>';
      }
      var doorNaam = profielNaamById(it.uitgevoerdDoor);
      var doorHtml = doorNaam ? '<span class="vz-cm-date">door ' + escHtml(doorNaam) + '</span>' : '';
      return ''
        + '<div class="vz-cm-item">'
        + '  <div class="vz-cm-itop">'
        + '    <span class="vz-cm-type">' + escHtml(it.omschrijving) + '</span>'
        + status
        + doorHtml
        + '    <span class="vz-cm-acts">'
        + (it.voltooidOp ? '' : '      <button type="button" class="vz-icon-btn" title="Markeer uitgevoerd" data-act-done="' + escHtml(it.id) + '" aria-label="Actie uitgevoerd">✓</button>')
        + '      <button type="button" class="vz-icon-btn" title="Bewerken" data-act-edit="' + escHtml(it.id) + '" aria-label="Actie bewerken">' + ICON_EDIT + '</button>'
        + '      <button type="button" class="vz-icon-btn vz-icon-btn--del" title="Verwijderen" data-act-del="' + escHtml(it.id) + '" aria-label="Actie verwijderen">' + ICON_DEL + '</button>'
        + '    </span>'
        + '  </div>'
        + '</div>';
    }).join("");
  }
  function openActModal(it) {
    var isNew = !it;
    $("vz-act-title").textContent = isNew ? "Actie toevoegen" : "Actie bewerken";
    $("vz-act-id").value = isNew ? "" : it.id;
    $("vz-act-omschrijving").value = isNew ? "" : (it.omschrijving || "");
    $("vz-act-deadline").value = isNew ? "" : (it.deadline || "");
    $("vz-act-voltooid").value = isNew ? "" : (it.voltooidOp || "");
    openModal("vz-act-modal");
    setTimeout(function () { $("vz-act-omschrijving").focus(); }, 30);
  }
  async function submitActie(e) {
    e.preventDefault();
    if (!currentId || !window.verzuimActiesDB) return;
    var id = $("vz-act-id").value;
    var omschrijving = ($("vz-act-omschrijving").value || "").trim();
    if (!omschrijving) { $("vz-act-omschrijving").focus(); return; }
    var payload = {
      verzuimId: currentId,
      omschrijving: omschrijving,
      deadline: $("vz-act-deadline").value || null,
      voltooidOp: $("vz-act-voltooid").value || null,
    };
    if (!id) payload.uitgevoerdDoor = currentUserId();
    try {
      if (id) { await window.verzuimActiesDB.update(id, payload); if (window.showActionFeedback) window.showActionFeedback("saved", "Actie"); }
      else { await window.verzuimActiesDB.add(payload); if (window.showActionFeedback) window.showActionFeedback("added", "Actie"); }
      closeModal("vz-act-modal");
      renderActies();
    } catch (err) { if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err)); }
  }

  function fileIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }
  function renderDocs() {
    var listEl = $("vz-doc-list");
    if (!listEl) return;
    var docs = docsFor(currentId);
    if (!docs.length) {
      listEl.innerHTML = '<div class="vz-inline-empty">Nog geen documenten geüpload. Klik op <b>Uploaden</b> om bv. de probleemanalyse of het bedrijfsartsrapport toe te voegen.</div>';
      return;
    }
    listEl.innerHTML = docs.map(function (doc) {
      var size = fileSizeFmt(doc.fileSize);
      var meta = fmtNl(doc.uploaddatum) + (size ? " · " + size : "");
      return ''
        + '<div class="vz-doc-item">'
        + '  <span class="vz-doc-ico" aria-hidden="true">' + fileIcon() + '</span>'
        + '  <div class="vz-doc-body">'
        + '    <span class="vz-doc-name">' + escHtml(doc.naam || doc.fileName || "Document") + '</span>'
        + '    <span class="vz-doc-meta">' + escHtml(meta) + '</span>'
        + '  </div>'
        + '  <div class="vz-doc-acts">'
        + '    <button type="button" class="vz-mini-btn" data-doc-open="' + escHtml(doc.id) + '">Openen</button>'
        + '    <button type="button" class="vz-icon-btn vz-icon-btn--del" title="Verwijderen" data-doc-del="' + escHtml(doc.id) + '" aria-label="Document verwijderen">' + ICON_DEL + '</button>'
        + '  </div>'
        + '</div>';
    }).join("");
  }

  var ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
  var ICON_DEL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function openModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = false; m.setAttribute("aria-hidden", "false");
    var card = m.querySelector(".modal-card"); if (card) try { card.focus(); } catch (e) { /* */ }
  }
  function closeModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = true; m.setAttribute("aria-hidden", "true");
  }

  // ---- Casus-modal (nieuw / bewerken) ----
  function openCaseModal(c) {
    var isNew = !c;
    $("vz-case-title").textContent = isNew ? "Verzuim melden" : "Verzuim bewerken";
    $("vz-case-id").value = isNew ? "" : c.id;
    var mw = $("vz-case-medewerker");
    mw.value = isNew ? "" : (c.medewerker || "");
    mw.readOnly = !isNew; // bestaande casus: naam niet wijzigen
    $("vz-case-type").value = isNew ? "lang" : (c.type === "kort" ? "kort" : "lang");
    var statusSel = $("vz-case-status");
    var prevExtra = statusSel.querySelector("option[data-vz-extra]");
    if (prevExtra) prevExtra.remove();
    var stdStatus = ["Actief", "In behandeling", "Hersteld"];
    if (isNew) {
      statusSel.value = "Actief";
    } else if (stdStatus.indexOf(c.status) >= 0) {
      statusSel.value = c.status;
    } else {
      // Niet-standaard (bv. oude BS2-)status: voeg toe als optie zodat bewerken
      // hem niet stil overschrijft naar Actief (DIEHARD: geen stille datamutatie).
      var opt = document.createElement("option");
      opt.value = c.status || "Actief"; opt.textContent = c.status || "Actief"; opt.setAttribute("data-vz-extra", "1");
      statusSel.appendChild(opt);
      statusSel.value = c.status || "Actief";
    }
    $("vz-case-eerst").value = isNew ? "" : (c.eerstZiektedag || "");
    $("vz-case-verwacht").value = isNew ? "" : (c.verwachteTerug || "");
    $("vz-case-werkelijk").value = isNew ? "" : (c.werkelijkeTerug || "");
    $("vz-case-beschrijving").value = isNew ? "" : cleanBeschr(c.beschrijving);
    updateBeschrCounter();
    openModal("vz-case-modal");
    setTimeout(function () { (isNew ? mw : $("vz-case-eerst")).focus(); }, 30);
  }
  function updateBeschrCounter() {
    var ta = $("vz-case-beschrijving"), cnt = $("vz-case-beschr-counter");
    if (!ta || !cnt) return;
    var len = (ta.value || "").length;
    cnt.textContent = len + " / 500";
  }
  async function submitCase(e) {
    e.preventDefault();
    var id = $("vz-case-id").value;
    var medewerker = ($("vz-case-medewerker").value || "").trim();
    var eerst = $("vz-case-eerst").value || "";
    if (!medewerker) { $("vz-case-medewerker").focus(); return; }
    if (!eerst) { $("vz-case-eerst").focus(); return; }
    var payload = {
      medewerker: medewerker,
      type: $("vz-case-type").value,
      status: $("vz-case-status").value,
      eerstZiektedag: eerst,
      verwachteTerug: $("vz-case-verwacht").value || "",
      werkelijkeTerug: $("vz-case-werkelijk").value || "",
      beschrijving: ($("vz-case-beschrijving").value || "").trim(),
    };
    try {
      if (id) {
        await window.verzuimDB.update(id, payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Verzuimcasus");
      } else {
        var saved = await window.verzuimDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("added", "Verzuimcasus");
        currentId = saved && saved.id ? saved.id : currentId;
        // G34 — Wet-Poortwachter-traject automatisch aanmaken bij de ziekmelding
        // (geen confirm: dit ís de wettelijke verplichting; HR kan losse
        // mijlpalen daarna gewoon bewerken/verwijderen).
        if (saved && saved.id && payload.eerstZiektedag) {
          try { await seedTraject(saved.id, payload.eerstZiektedag); }
          catch (errSeed) { console.error("[verzuim] auto-traject mislukt:", errSeed); }
        }
      }
      closeModal("vz-case-modal");
      if (currentId && !detailView.hidden) renderDetail();
      renderDash();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    }
  }

  // ---- Mijlpaal-modal ----
  function openMpModal(m) {
    var isNew = !m;
    $("vz-mp-title").textContent = isNew ? "Mijlpaal toevoegen" : "Mijlpaal bewerken";
    $("vz-mp-id").value = isNew ? "" : m.id;
    var tmplId = "";
    if (!isNew) {
      tmplId = (m.data && (m.data.template_id || m.data.templateId)) || "";
      if (!tmplId && m.mijlpaalType) {
        for (var ti = 0; ti < WP_TEMPLATES.length; ti++) if (WP_TEMPLATES[ti].type === m.mijlpaalType) { tmplId = WP_TEMPLATES[ti].templateId; break; }
      }
    }
    $("vz-mp-type").value = String(tmplId || WP_TEMPLATES[0].templateId);
    $("vz-mp-deadline").value = isNew ? "" : (m.deadlineDatum || "");
    $("vz-mp-voltooid").value = isNew ? "" : (m.voltooidOp || "");
    if (isNew) autofillMpDeadline();
    openModal("vz-mp-modal");
  }
  function autofillMpDeadline() {
    var sel = $("vz-mp-type"), dl = $("vz-mp-deadline");
    if (!sel || !dl) return;
    var tmpl = wpTemplateById(sel.value);
    var c = caseById(currentId);
    if (!tmpl || !c) return;
    var berekend = wpDeadlineFor(c.eerstZiektedag, tmpl.week);
    if (berekend) dl.value = berekend;
  }
  async function submitMp(e) {
    e.preventDefault();
    if (!currentId || !window.verzuimMijlpalenDB) return;
    var id = $("vz-mp-id").value;
    var tmpl = wpTemplateById($("vz-mp-type").value);
    var bestaandeData = {};
    if (id) {
      var cur = milestonesFor(currentId).find(function (x) { return String(x.id) === String(id); });
      if (cur && cur.data) bestaandeData = Object.assign({}, cur.data);
    }
    if (tmpl) { bestaandeData.naam = tmpl.naam; bestaandeData.week_number = tmpl.week; bestaandeData.template_id = tmpl.templateId; }
    var payload = {
      verzuimId: currentId,
      mijlpaalType: tmpl ? tmpl.type : $("vz-mp-type").value,
      deadlineDatum: $("vz-mp-deadline").value || null,
      voltooidOp: $("vz-mp-voltooid").value || null,
      data: bestaandeData,
    };
    try {
      if (id) { await window.verzuimMijlpalenDB.update(id, payload); if (window.showActionFeedback) window.showActionFeedback("saved", "Mijlpaal"); }
      else { await window.verzuimMijlpalenDB.add(payload); if (window.showActionFeedback) window.showActionFeedback("added","Mijlpaal"); }
      closeModal("vz-mp-modal");
      renderPoort();
      renderDash();
    } catch (err) { if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err)); }
  }
  // G34 — seed ontbrekende WP-mijlpalen voor een casus (zonder confirm; wordt
  // automatisch aangeroepen bij de ziekmelding en hergebruikt door de knop).
  async function seedTraject(caseId, eersteZiektedag) {
    if (!caseId || !window.verzuimMijlpalenDB) return 0;
    var existing = milestonesFor(caseId);
    var have = {};
    existing.forEach(function (x) { var t = x.data && (x.data.template_id || x.data.templateId); if (t) have[Number(t)] = true; });
    var toAdd = WP_TEMPLATES.filter(function (t) { return !have[t.templateId]; });
    for (var i = 0; i < toAdd.length; i++) {
      var t = toAdd[i];
      await window.verzuimMijlpalenDB.add({
        verzuimId: caseId, mijlpaalType: t.type,
        deadlineDatum: wpDeadlineFor(eersteZiektedag, t.week) || null, voltooidOp: null,
        data: { naam: t.naam, week_number: t.week, template_id: t.templateId },
      });
    }
    return toAdd.length;
  }

  async function generateTraject() {
    if (!currentId || !window.verzuimMijlpalenDB) return;
    var c = caseById(currentId);
    if (!c || !c.eerstZiektedag) {
      if (window.showError) window.showError("Geen eerste ziektedag bekend — vul die eerst in via Bewerken.");
      return;
    }
    var existing = milestonesFor(currentId);
    var have = {};
    existing.forEach(function (x) { var t = x.data && (x.data.template_id || x.data.templateId); if (t) have[Number(t)] = true; });
    var toAdd = WP_TEMPLATES.filter(function (t) { return !have[t.templateId]; });
    if (!toAdd.length) { if (window.showActionFeedback) window.showActionFeedback("saved", "Traject is al compleet"); return; }
    var ok = true;
    if (typeof window.showSliderConfirmModal === "function") {
      ok = await window.showSliderConfirmModal({
        title: "Wet-Poortwachter-traject genereren?",
        preview: toAdd.length + " wettelijke mijlpa" + (toAdd.length === 1 ? "al wordt" : "len worden") + " toegevoegd op basis van de eerste ziektedag.",
        okLabel: "Genereren", cancelLabel: "Annuleren",
      });
    }
    if (!ok) return;
    try {
      var n = await seedTraject(currentId, c.eerstZiektedag);
      if (window.showActionFeedback) window.showActionFeedback("added", n + " mijlpalen");
      renderPoort();
      renderDash();
    } catch (err) { if (window.showError) window.showError("Genereren mislukt: " + (err && err.message || err)); }
  }
  async function markMpDone(id) {
    if (!id || !window.verzuimMijlpalenDB) return;
    try {
      await window.verzuimMijlpalenDB.markVoltooid(id, todayMid().toISOString().slice(0, 10));
      if (window.showActionFeedback) window.showActionFeedback("saved", "Aangeleverd");
      renderPoort();
      renderDash();
    } catch (err) { if (window.showError) window.showError("Bijwerken mislukt: " + (err && err.message || err)); }
  }

  // ---- Contactmoment-modal ----
  function openCmModal(it) {
    var isNew = !it;
    $("vz-cm-title").textContent = isNew ? "Contactmoment toevoegen" : "Contactmoment bewerken";
    $("vz-cm-id").value = isNew ? "" : it.id;
    $("vz-cm-type").value = isNew ? "contact_moment" : (it.type || "contact_moment");
    $("vz-cm-datum").value = isNew ? todayMid().toISOString().slice(0, 10) : (it.datum || "");
    $("vz-cm-notitie").value = isNew ? "" : (it.notitie || "");
    openModal("vz-cm-modal");
    setTimeout(function () { $("vz-cm-datum").focus(); }, 30);
  }
  async function submitCm(e) {
    e.preventDefault();
    if (!currentId || !window.verzuimContactmomentenDB) return;
    var id = $("vz-cm-id").value;
    var datum = $("vz-cm-datum").value;
    if (!datum) { $("vz-cm-datum").focus(); return; }
    var payload = {
      verzuimId: currentId, type: $("vz-cm-type").value,
      datum: datum, notitie: ($("vz-cm-notitie").value || "").trim(),
    };
    // G35 — registreer wie het contactmoment uitvoert (de ingelogde gebruiker).
    if (!id) payload.uitgevoerdDoor = currentUserId();
    try {
      if (id) { await window.verzuimContactmomentenDB.update(id, payload); if (window.showActionFeedback) window.showActionFeedback("saved", "Contactmoment"); }
      else { await window.verzuimContactmomentenDB.add(payload); if (window.showActionFeedback) window.showActionFeedback("added","Contactmoment"); }
      closeModal("vz-cm-modal");
      renderContacts();
      renderDash();
    } catch (err) { if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err)); }
  }

  // ---- Documenten ----
  function triggerDocUpload() {
    var input = $("vz-doc-file");
    if (input) input.click();
  }
  function onDocFileChosen(e) {
    var input = e.target;
    var file = input.files && input.files[0];
    if (!file || !currentId || !window.verzuimDocsDB) { if (input) input.value = ""; return; }
    var MAX = 25 * 1024 * 1024;
    if (file.size > MAX) {
      if (window.showError) window.showError("Bestand is te groot (max 25 MB).");
      input.value = ""; return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      window.verzuimDocsDB.add({
        verzuimId: currentId,
        fileData: reader.result,
        fileName: file.name,
        fileMime: file.type || "application/octet-stream",
        fileSize: file.size,
        naam: file.name,
      }).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("added","Document");
        renderDocs();
        renderDash();
      }).catch(function (err) {
        if (window.showError) window.showError("Uploaden mislukt: " + (err && err.message || err));
      });
    };
    reader.onerror = function () { if (window.showError) window.showError("Bestand lezen mislukt."); };
    reader.readAsDataURL(file);
    input.value = "";
  }
  async function openDoc(id) {
    if (!window.verzuimDocsDB) return;
    try {
      var url = await window.verzuimDocsDB.getFileUrl(id);
      if (url) window.open(url, "_blank", "noopener");
      else if (window.showError) window.showError("Document kon niet worden geopend.");
    } catch (err) { if (window.showError) window.showError("Openen mislukt: " + (err && err.message || err)); }
  }

  // ---- Generieke verwijder-bevestiging (slider) ----
  async function confirmDelete(opts, doDelete) {
    var ok = true;
    if (typeof window.showSliderConfirmModal === "function") {
      ok = await window.showSliderConfirmModal({
        title: opts.title, preview: opts.preview,
        okLabel: "Verwijderen", cancelLabel: "Annuleren",
      });
    } else { ok = window.confirm(opts.title); }
    if (!ok) return;
    try {
      await doDelete();
      if (window.showActionFeedback) window.showActionFeedback("deleted", opts.label);
    } catch (err) { if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message || err)); }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  // Filters
  function setSeg(group, value, attr) {
    [].forEach.call(document.querySelectorAll('.vz-seg[data-' + attr + ']'), function (b) {
      if (b.closest(".vz-segmented") !== group) return;
      var on = b.getAttribute("data-" + attr) === value;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  [].forEach.call(document.querySelectorAll(".vz-segmented"), function (grp) {
    grp.addEventListener("click", function (e) {
      var b = e.target.closest(".vz-seg");
      if (!b || !grp.contains(b)) return;
      if (b.hasAttribute("data-status")) { filters.status = b.getAttribute("data-status"); setSeg(grp, filters.status, "status"); }
      else if (b.hasAttribute("data-type")) { filters.type = b.getAttribute("data-type"); setSeg(grp, filters.type, "type"); }
      renderCaseList();
    });
  });
  if (searchInput) searchInput.addEventListener("input", function () { filters.q = searchInput.value; renderCaseList(); });

  // Case-list: open casus (klik + toetsenbord)
  caseListEl.addEventListener("click", function (e) {
    var card = e.target.closest(".vz-case-card");
    if (card && caseListEl.contains(card)) openCase(card.getAttribute("data-id"));
  });
  caseListEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".vz-case-card");
    if (card && caseListEl.contains(card)) { e.preventDefault(); openCase(card.getAttribute("data-id")); }
  });

  // Terug
  var backBtn = $("vz-detail-back");
  if (backBtn) backBtn.addEventListener("click", showDash);

  // Nieuw verzuim
  var newBtn = $("vz-new-btn");
  if (newBtn) newBtn.addEventListener("click", function () { openCaseModal(null); });

  // Poortwachter-knoppen
  var genBtn = $("vz-poort-generate"); if (genBtn) genBtn.addEventListener("click", generateTraject);
  var mpAddBtn = $("vz-poort-add"); if (mpAddBtn) mpAddBtn.addEventListener("click", function () { openMpModal(null); });
  var cmAddBtn = $("vz-cm-add"); if (cmAddBtn) cmAddBtn.addEventListener("click", function () { openCmModal(null); });
  var docAddBtn = $("vz-doc-add"); if (docAddBtn) docAddBtn.addEventListener("click", triggerDocUpload);
  var docFile = $("vz-doc-file"); if (docFile) docFile.addEventListener("change", onDocFileChosen);

  // Detail-acties via event-delegation
  detailView.addEventListener("click", function (e) {
    var t = e.target.closest("[data-mp-done],[data-mp-edit],[data-mp-del],[data-cm-edit],[data-cm-del],[data-doc-open],[data-doc-del]");
    if (!t) return;
    var id;
    if ((id = t.getAttribute("data-mp-done"))) { markMpDone(id); return; }
    if ((id = t.getAttribute("data-mp-edit"))) {
      var m = milestonesFor(currentId).find(function (x) { return String(x.id) === String(id); });
      if (m) openMpModal(m); return;
    }
    if ((id = t.getAttribute("data-mp-del"))) {
      var md = milestonesFor(currentId).find(function (x) { return String(x.id) === String(id); });
      confirmDelete({ title: "Mijlpaal verwijderen?", preview: md ? mpDisplayName(md) : "", label: "Mijlpaal" },
        function () { return window.verzuimMijlpalenDB.delete(id).then(function () { renderPoort(); renderDash(); }); });
      return;
    }
    if ((id = t.getAttribute("data-cm-edit"))) {
      var cm = contactsFor(currentId).find(function (x) { return String(x.id) === String(id); });
      if (cm) openCmModal(cm); return;
    }
    if ((id = t.getAttribute("data-cm-del"))) {
      confirmDelete({ title: "Contactmoment verwijderen?", preview: "Deze actie kan niet ongedaan worden gemaakt.", label: "Contactmoment" },
        function () { return window.verzuimContactmomentenDB.delete(id).then(function () { renderContacts(); renderDash(); }); });
      return;
    }
    // G35 — acties
    if ((id = t.getAttribute("data-act-done"))) {
      window.verzuimActiesDB.update(id, { voltooidOp: todayMid().toISOString().slice(0, 10) })
        .then(function () { if (window.showActionFeedback) window.showActionFeedback("saved", "Actie uitgevoerd"); renderActies(); })
        .catch(function (err) { if (window.showError) window.showError("Bijwerken mislukt: " + (err && err.message || err)); });
      return;
    }
    if ((id = t.getAttribute("data-act-edit"))) {
      var act = actiesFor(currentId).find(function (x) { return String(x.id) === String(id); });
      if (act) openActModal(act); return;
    }
    if ((id = t.getAttribute("data-act-del"))) {
      var actD = actiesFor(currentId).find(function (x) { return String(x.id) === String(id); });
      confirmDelete({ title: "Actie verwijderen?", preview: actD ? actD.omschrijving : "", label: "Actie" },
        function () { return window.verzuimActiesDB.delete(id).then(function () { renderActies(); }); });
      return;
    }
    if ((id = t.getAttribute("data-doc-open"))) { openDoc(id); return; }
    if ((id = t.getAttribute("data-doc-del"))) {
      var doc = docsFor(currentId).find(function (x) { return String(x.id) === String(id); });
      confirmDelete({ title: "Document verwijderen?", preview: doc ? (doc.naam || doc.fileName || "") : "", label: "Document" },
        function () { return window.verzuimDocsDB.remove(id).then(function () { renderDocs(); renderDash(); }); });
      return;
    }
  });

  // Modal-wiring
  function wireModal(modalId, closeId, cancelId, formId, onSubmit) {
    var close = $(closeId); if (close) close.addEventListener("click", function () { closeModal(modalId); });
    var cancel = $(cancelId); if (cancel) cancel.addEventListener("click", function () { closeModal(modalId); });
    var modal = $(modalId);
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(modalId); });
    var form = $(formId); if (form && onSubmit) form.addEventListener("submit", onSubmit);
  }
  wireModal("vz-case-modal", "vz-case-close", "vz-case-cancel", "vz-case-form", submitCase);
  wireModal("vz-mp-modal", "vz-mp-close", "vz-mp-cancel", "vz-mp-form", submitMp);
  wireModal("vz-cm-modal", "vz-cm-close", "vz-cm-cancel", "vz-cm-form", submitCm);
  wireModal("vz-act-modal", "vz-act-close", "vz-act-cancel", "vz-act-form", submitActie);
  var actAddBtn = $("vz-act-add"); if (actAddBtn) actAddBtn.addEventListener("click", function () { openActModal(null); });

  var beschrTa = $("vz-case-beschrijving");
  if (beschrTa) beschrTa.addEventListener("input", updateBeschrCounter);
  var mpTypeSel = $("vz-mp-type");
  if (mpTypeSel) mpTypeSel.addEventListener("change", function () {
    if ($("vz-mp-id").value) return; // bestaande mijlpaal: deadline niet overschrijven
    autofillMpDeadline();
  });

  // Escape sluit een open modal (en anders de detail-weergave)
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var modals = ["vz-case-modal", "vz-mp-modal", "vz-cm-modal", "vz-act-modal"];
    for (var i = 0; i < modals.length; i++) {
      var m = $(modals[i]);
      if (m && !m.hidden) { closeModal(modals[i]); e.stopPropagation(); return; }
    }
    if (currentId && detailView && !detailView.hidden) { showDash(); }
  });

  // ---------------------------------------------------------------------------
  // Live re-render bij externe wijzigingen
  // ---------------------------------------------------------------------------
  window.addEventListener("besa:verzuim-updated", function () {
    if (currentId && detailView && !detailView.hidden) renderCaseHead();
    renderDash();
  });
  window.addEventListener("besa:verzuim-mijlpalen-updated", function () {
    if (currentId && detailView && !detailView.hidden) renderPoort();
    renderKPIs();
    if (dashView && !dashView.hidden) renderCaseList();
  });
  window.addEventListener("besa:verzuim-contactmomenten-updated", function () {
    if (currentId && detailView && !detailView.hidden) renderContacts();
    if (dashView && !dashView.hidden) renderCaseList();
  });
  window.addEventListener("besa:verzuim-documenten-updated", function () {
    if (currentId && detailView && !detailView.hidden) renderDocs();
    if (dashView && !dashView.hidden) renderCaseList();
  });
  window.addEventListener("besa:verzuim-acties-updated", function () {
    if (currentId && detailView && !detailView.hidden) renderActies();
  });

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  renderDash();
  if (window.verzuimDB && window.verzuimDB.ready) {
    window.verzuimDB.ready.then(function () {
      renderDash();
      // Documenttellingen voor de lijst: haal alle docs één keer op.
      if (window.verzuimDocsDB && window.verzuimDocsDB.refreshAll) {
        window.verzuimDocsDB.refreshAll().then(function () { renderDash(); }).catch(function () { /* */ });
      }
    }).catch(function () { /* */ });
  }
})();
