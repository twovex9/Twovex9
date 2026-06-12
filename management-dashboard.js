/* global window, document */
/**
 * management-dashboard.js — ETF Management Dashboard (bestuurder-overzicht).
 *
 * Leest het server-side aggregaat uit window.managementDashboardDB (RPC
 * management_dashboard_v1) en nieuws uit window.nieuwsDB. Rendert: begroeting,
 * signaleringsstrip, 3 snelle statistieken, 2×2 domeintegels met statuskleur,
 * de 4 domein-detailsecties en de 3 recentste nieuwsberichten.
 *
 * Alles via design-tokens (var(--text)/--green/--red/--yellow/…) zodat dark
 * mode automatisch klopt. Verversing: knop + automatisch elke 5 minuten (spec).
 */
(function () {
  "use strict";

  var REFRESH_MS = 5 * 60 * 1000;
  var MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) { return Number(n) || 0; }
  function eur(n) { return "€ " + Math.round(num(n)).toLocaleString("nl-NL"); }
  function intl(n) { return num(n).toLocaleString("nl-NL"); }
  function statusClass(s) {
    return s === "rood" ? "md--rood" : s === "oranje" ? "md--oranje" : "md--groen";
  }
  function monthLabel(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "";
    var p = ym.split("-");
    return MONTHS[Number(p[1]) - 1] + " " + p[0];
  }
  function stripHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    return (tmp.textContent || "").trim();
  }

  // ─── Begroeting + datum ──────────────────────────────────────────────────
  function firstName() {
    try {
      if (window.profilesDB && window.profilesDB.getCurrentSync) {
        var p = window.profilesDB.getCurrentSync();
        if (p && p.voornaam) return String(p.voornaam).trim();
        if (p && p.medewerkerId && window.medewerkersDB && window.medewerkersDB.getByIdSync) {
          var m = window.medewerkersDB.getByIdSync(p.medewerkerId);
          if (m && m.voornaam) return String(m.voornaam).trim();
        }
      }
    } catch (e) { /* */ }
    return "";
  }
  function renderGreeting() {
    var h = new Date().getHours();
    var groet = (h >= 6 && h < 12) ? "Goedemorgen" : (h >= 12 && h < 18) ? "Goedemiddag" : "Goedenavond";
    var nm = firstName();
    var g = $("md-greeting");
    if (g) g.textContent = nm ? (groet + ", " + nm) : groet;
    var d = $("md-date");
    if (d) {
      try {
        d.textContent = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      } catch (e) { d.textContent = ""; }
    }
  }

  // ─── Signaleringsstrip ───────────────────────────────────────────────────
  function renderSignals(sig) {
    var box = $("md-signals");
    if (!box) return;
    sig = Array.isArray(sig) ? sig : [];
    // Rood eerst, dan oranje.
    var sorted = sig.slice().sort(function (a, b) {
      var rank = function (x) { return x && x.ernst === "rood" ? 0 : 1; };
      return rank(a) - rank(b);
    });
    if (!sorted.length) {
      box.innerHTML = '<div class="md-signal md-signal--ok"><span class="md-signal-ico" aria-hidden="true">✓</span>'
        + '<span class="md-signal-txt"><strong>Geen kritieke signalen.</strong> Alle domeinen binnen de drempelwaarden.</span></div>';
      return;
    }
    box.innerHTML = sorted.map(function (s) {
      var cls = s.ernst === "rood" ? "md-signal--rood" : "md-signal--oranje";
      var btn = window.besaOplossen ? window.besaOplossen.signalBtn(s.domein, s.tekst) : "";
      return '<div class="md-signal ' + cls + '">'
        + '<span class="md-signal-dom">' + escHtml(s.domein || "") + "</span>"
        + '<span class="md-signal-txt">' + escHtml(s.tekst || "") + "</span>"
        + btn + "</div>";
    }).join("");
    if (window.besaOplossen) window.besaOplossen.bindSignals(box);
  }

  // ─── Tegels + snelle statistieken ────────────────────────────────────────
  function setDot(id, status) {
    var el = $(id);
    if (el) el.className = "md-tile-dot " + statusClass(status);
  }
  function setHeadDot(id, status) {
    var el = $(id);
    if (el) el.className = "md-domain-dot " + statusClass(status);
  }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }

  function renderTilesAndStats(d) {
    var fin = d.financien || {}, hr = d.hr || {}, pl = d.planning || {}, inc = d.incidenten || {};

    // Snelle statistieken
    setText("md-qs-bezetting", num(pl.bezetting_pct) + "%");
    setText("md-qs-verzuim", intl(hr.verzuim_pct) + "%");
    setText("md-qs-declaraties", intl(fin.open_declaraties_aantal));

    // Financiën-tegel
    setDot("md-dot-fin", fin.status);
    setText("md-tile-fin-metric", eur(fin.open_declaraties_bedrag));
    setText("md-tile-fin-sub", intl(fin.open_declaraties_aantal) + " open declaraties · " + intl(fin.afgekeurd_aantal) + " afgekeurd");

    // Medewerkers-tegel
    setDot("md-dot-hr", hr.status);
    setText("md-tile-hr-metric", intl(hr.actief_totaal) + " actief");
    setText("md-tile-hr-sub", intl(hr.verzuim_pct) + "% verzuim · " + intl(hr.contract_30d) + " contract(en) <30d");

    // Planning-tegel
    setDot("md-dot-planning", pl.status);
    setText("md-tile-planning-metric", num(pl.bezetting_pct) + "% bezet");
    setText("md-tile-planning-sub", intl(pl.openstaande_diensten) + " open · " + intl(pl.diensten_vandaag) + " diensten vandaag");

    // Incidenten-tegel
    setDot("md-dot-incidenten", inc.status);
    setText("md-tile-incidenten-metric", intl(inc.totaal_open) + " open");
    setText("md-tile-incidenten-sub", intl(inc.zonder_opvolging_48u) + " >48u zonder opvolging");
  }

  // ─── Metric-kaart helper ─────────────────────────────────────────────────
  // btnHtml (optioneel) wordt onderaan de kaart geïnjecteerd (bv. een
  // "Oplossen →"-knop bij rode/oranje accenten). Default "" → bestaande
  // aanroepen blijven ongewijzigd werken.
  function metricCard(label, value, sub, accent, btnHtml) {
    return '<div class="md-metric' + (accent ? " md-metric--" + accent : "") + '">'
      + '<span class="md-metric-lbl">' + escHtml(label) + "</span>"
      + '<span class="md-metric-val">' + value + "</span>"
      + (sub ? '<span class="md-metric-sub">' + sub + "</span>" : "")
      + (btnHtml || "")
      + "</div>";
  }
  // navBtn-shortcut met guard; geeft "" als besa-oplossen ontbreekt.
  function oplosBtn(url, knop, uitleg) {
    return window.besaOplossen ? window.besaOplossen.navBtn(url, knop, uitleg) : "";
  }
  function deltaHtml(d) {
    var fin = d.financien || {};
    if (fin.omzet_delta_pct == null) return "";
    var pct = num(fin.omzet_delta_pct);
    var up = pct >= 0;
    var arrow = up ? "▲" : "▼";
    var cls = up ? "md-delta--up" : "md-delta--down";
    return '<span class="md-delta ' + cls + '">' + arrow + " " + intl(Math.abs(pct)) + "% t.o.v. " + escHtml(monthLabel(fin.omzet_prev_ym)) + "</span>";
  }

  // ─── Domein: Financiën ───────────────────────────────────────────────────
  function renderFin(d) {
    var fin = d.financien || {};
    setHeadDot("md-fin-headdot", fin.status);
    var liq = fin.liquiditeit || {};
    var liqAccent = liq.status === "Kritiek" ? "rood" : liq.status === "Aandacht vereist" ? "oranje" : "groen";
    var grid = $("md-fin-grid");
    if (grid) {
      var openDeclBtn = fin.open_declaraties_aantal > 0
        ? oplosBtn("facturen-te-beoordelen", "Naar Facturen", "Open declaraties staan nog bij de gemeente. Beoordeel en volg ze op via Facturen.")
        : "";
      var afgekeurdBtn = fin.afgekeurd_aantal > 0
        ? oplosBtn("facturen-te-beoordelen", "Naar Facturen", "Afgekeurde declaraties moeten worden gecorrigeerd en opnieuw ingediend. Bekijk de reden via Facturen.")
        : "";
      var nogDeclBtn = num(fin.nog_te_declareren) > 0
        ? oplosBtn("beschikkingen-dashboard", "Naar Beschikkingen-dashboard", "Geleverde zorg is nog niet gedeclareerd. Werk de achterstand bij via het Beschikkingen-dashboard.")
        : "";
      var liqBtn = (liqAccent === "rood" || liqAccent === "oranje")
        ? oplosBtn("financien-locaties", "Naar Financiën", "De liquiditeit vraagt aandacht. Bekijk openstaande posten per locatie in Financiën.")
        : "";
      grid.innerHTML = [
        metricCard("Omzet — " + monthLabel(fin.omzet_ref_ym), eur(fin.omzet_maand), deltaHtml(d)),
        metricCard("Open declaraties", eur(fin.open_declaraties_bedrag), intl(fin.open_declaraties_aantal) + " stuks bij de gemeente", fin.open_declaraties_aantal > 0 ? "oranje" : null, openDeclBtn),
        metricCard("Afgekeurde declaraties", intl(fin.afgekeurd_aantal), eur(fin.afgekeurd_bedrag), fin.afgekeurd_aantal > 0 ? "rood" : null, afgekeurdBtn),
        metricCard("Nog te declareren", eur(fin.nog_te_declareren), "achterstand zorg → declaratie", null, nogDeclBtn),
        metricCard("Liquiditeit", escHtml(liq.status || "—"), "te ontvangen " + eur(liq.te_ontvangen) + " · te betalen " + eur(liq.te_betalen), liqAccent, liqBtn),
      ].join("");
      if (window.besaOplossen) window.besaOplossen.bindSignals(grid);
    }
    var note = $("md-fin-note");
    if (note) {
      note.innerHTML = "Omzet toont de laatste maand met gefactureerde data (de declaratie loopt circa 3 maanden achter, recente maanden zijn nog niet volledig gedeclareerd). "
        + "Budget verbruikt wordt nog niet getoond (geen maandbudget ingesteld). De liquiditeit is een indicatie op basis van openstaande posten, geen banksaldo.";
    }
  }

  // ─── Domein: Medewerkers ─────────────────────────────────────────────────
  function renderHr(d) {
    var hr = d.hr || {};
    setHeadDot("md-hr-headdot", hr.status);
    var trend = hr.verzuim_trend === "stijgend" ? "▲ stijgend" : hr.verzuim_trend === "dalend" ? "▼ dalend" : "● stabiel";
    var grid = $("md-hr-grid");
    if (!grid) return;
    var verzuimAccent = num(hr.verzuim_pct) > 8 ? "rood" : num(hr.verzuim_pct) >= 5 ? "oranje" : "groen";
    var verzuimBtn = (verzuimAccent === "rood" || verzuimAccent === "oranje")
      ? oplosBtn("hr-dashboard", "Naar HR-dashboard", "Het ziekteverzuim ligt boven de drempel. Bekijk de verzuimcijfers en lopende meldingen in het HR-dashboard.")
      : "";
    var contractAccent = hr.contract_7d > 0 ? "rood" : hr.contract_30d > 0 ? "oranje" : null;
    var contractBtn = (contractAccent === "rood" || contractAccent === "oranje")
      ? oplosBtn("hr", "Naar Medewerkers", "Er verlopen binnenkort contracten. Verleng of regel opvolging via Medewerkers (HR).")
      : "";
    var cards = [
      metricCard("Actieve medewerkers", intl(hr.actief_totaal), intl(hr.loondienst) + " loondienst · " + intl(hr.zzp) + " inhuur · " + intl(hr.stage) + " stage"),
      metricCard("Ziekteverzuim", intl(hr.verzuim_pct) + "%", trend + " · vorige maand " + intl(hr.verzuim_pct_vorige) + "%", verzuimAccent, verzuimBtn),
      metricCard("Contracten verlopen", intl(hr.contract_30d), "binnen 30 dagen · " + intl(hr.contract_7d) + " binnen 7 dagen", contractAccent, contractBtn),
      metricCard("Verlof deze week", intl(hr.verlof_deze_week), "goedgekeurd in de lopende week"),
    ];
    // Bestuurs-KPI's (G50/G51/G54) — alleen als de gegate RPC data teruggaf.
    var bk = (window.managementDashboardDB && window.managementDashboardDB.getBestuurKpis) ? window.managementDashboardDB.getBestuurKpis() : null;
    if (bk) {
      var dossierSub = intl(bk.salaris_dossiers_compleet) + " van " + intl(bk.salaris_dossiers_totaal) + " dossiers met salarisgegevens";
      var scoreAcc = num(bk.compliance_score) >= 90 ? "groen" : num(bk.compliance_score) >= 70 ? "oranje" : "rood";
      var dossierAccent = bk.salaris_dossiers_compleet < bk.salaris_dossiers_totaal ? "oranje" : null;
      var dossierBtn = dossierAccent === "oranje"
        ? oplosBtn("compliance-dashboard", "Naar Compliance-dashboard", "Niet alle dossiers hebben volledige salarisgegevens. Vul de ontbrekende documenten aan via het Compliance-dashboard.")
        : "";
      var scoreBtn = (scoreAcc === "rood" || scoreAcc === "oranje")
        ? oplosBtn("compliance-dashboard", "Naar Compliance-dashboard", "De compliance-score ligt onder de norm. Bekijk welke dossiers en documenten ontbreken in het Compliance-dashboard.")
        : "";
      cards.push(
        metricCard("Personeelskosten / maand (indicatief)", eur(bk.personeelskosten_maand_indicatief), dossierSub, dossierAccent, dossierBtn),
        metricCard("ZZP-aandeel", intl(bk.zzp_pct) + "%", intl(bk.zzp) + " inhuur van " + intl(bk.actief) + " actief", num(bk.zzp_pct) >= 60 ? "oranje" : null),
        metricCard("Verloop (uit dienst)", intl(bk.verloop_pct) + "%", intl(bk.uit_dienst_aantal) + " medewerker(s) uit dienst", null),
        metricCard("Compliance-score", intl(bk.compliance_score) + "%", "gewogen index — zie compliance-dashboard", scoreAcc, scoreBtn)
      );
    }
    grid.innerHTML = cards.join("");
    if (window.besaOplossen) window.besaOplossen.bindSignals(grid);
  }

  // ─── Domein: Planning ────────────────────────────────────────────────────
  function renderPlanning(d) {
    var pl = d.planning || {};
    setHeadDot("md-planning-headdot", pl.status);
    var pct = num(pl.bezetting_pct);
    var barCls = pct < 85 ? "md--rood" : pct < 95 ? "md--oranje" : "md--groen";
    var bar = '<div class="md-bar"><div class="md-bar-fill ' + barCls + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></div></div>';
    var grid = $("md-planning-grid");
    if (!grid) return;
    var bezAccent = pct < 85 ? "rood" : pct < 95 ? "oranje" : "groen";
    var bezBtn = (bezAccent === "rood" || bezAccent === "oranje")
      ? oplosBtn("planning", "Naar Planning", "De bezettingsgraad is te laag. Vul de openstaande plekken in via de Planning.")
      : "";
    var openAccent = pl.openstaande_diensten >= 3 ? "rood" : pl.openstaande_diensten > 0 ? "oranje" : "groen";
    var openBtn = (openAccent === "rood" || openAccent === "oranje")
      ? oplosBtn("planning", "Naar Planning", "Er staan diensten open die vandaag niet zijn ingevuld. Wijs medewerkers toe via de Planning.")
      : "";
    grid.innerHTML = [
      metricCard("Bezettingsgraad vandaag", pct + "%", bar + intl(pl.ingevuld) + " van " + intl(pl.vereist) + " plekken ingevuld", bezAccent, bezBtn),
      metricCard("Openstaande diensten", intl(pl.openstaande_diensten), "vandaag niet ingevuld", openAccent, openBtn),
      metricCard("Oproepen uitstaand", intl(pl.oproepen_uitstaand), "wachten op bevestiging medewerker"),
      metricCard("Diensten vandaag", intl(pl.diensten_vandaag), "totaal ingepland"),
    ].join("");
    if (window.besaOplossen) window.besaOplossen.bindSignals(grid);
  }

  // ─── Domein: Incidenten & klachten ───────────────────────────────────────
  function buildCategories(inc) {
    var byCat = Array.isArray(inc.by_category) ? inc.by_category : [];
    var rows = [];
    rows.push({ naam: "Agressie", count: num(inc.agressie) });
    rows.push({ naam: "Medicatie", count: num(inc.medicatie) });
    var skip = { "Fysieke Agressie": 1, "Verbale Agressie": 1, "Medicatie": 1 };
    byCat.forEach(function (c) {
      if (c && !skip[c.naam]) rows.push({ naam: c.naam, count: num(c.count) });
    });
    rows.sort(function (a, b) { return b.count - a.count; });
    return rows.slice(0, 6);
  }
  function renderIncidenten(d) {
    var inc = d.incidenten || {};
    setHeadDot("md-incidenten-headdot", inc.status);
    var grid = $("md-inc-grid");
    if (grid) {
      var opvAccent = inc.zonder_opvolging_48u >= 3 ? "rood" : inc.zonder_opvolging_48u > 0 ? "oranje" : "groen";
      var opvBtn = (opvAccent === "rood" || opvAccent === "oranje")
        ? oplosBtn("incidenten", "Naar Incidenten", "Er zijn incidenten zonder opvolging na 48 uur. Pak de opvolging op via Incidenten.")
        : "";
      var klachtAccent = inc.klachten_open >= 2 ? "rood" : inc.klachten_open > 0 ? "oranje" : "groen";
      var klachtBtn = (klachtAccent === "rood" || klachtAccent === "oranje")
        ? oplosBtn("incidenten", "Naar Incidenten", "Er staan klachten open. Behandel ze via Incidenten.")
        : "";
      grid.innerHTML = [
        metricCard("Nieuwe incidenten", intl(inc.nieuw_7d), "afgelopen 7 dagen"),
        metricCard("Zonder opvolging >48u", intl(inc.zonder_opvolging_48u), "kritieke indicator", opvAccent, opvBtn),
        metricCard("Klachten in behandeling", intl(inc.klachten_in_behandeling), intl(inc.klachten_open) + " open klacht(en)", klachtAccent, klachtBtn),
        metricCard("Totaal openstaand", intl(inc.totaal_open), "alle openstaande incidenten"),
      ].join("");
      if (window.besaOplossen) window.besaOplossen.bindSignals(grid);
    }
    var catBox = $("md-inc-cat");
    if (catBox) {
      var cats = buildCategories(inc);
      var max = cats.reduce(function (m, c) { return Math.max(m, c.count); }, 0) || 1;
      catBox.innerHTML = '<h3 class="md-cat-title">Openstaand per categorie</h3>'
        + cats.map(function (c) {
          var w = Math.round((c.count / max) * 100);
          return '<div class="md-cat-row"><span class="md-cat-lbl">' + escHtml(c.naam) + "</span>"
            + '<span class="md-cat-bar"><span class="md-cat-fill" style="width:' + w + '%"></span></span>'
            + '<span class="md-cat-val">' + intl(c.count) + "</span></div>";
        }).join("");
    }
  }

  // ─── Nieuws (3 recentste) ────────────────────────────────────────────────
  function renderNews() {
    var box = $("md-news-list");
    if (!box) return;
    var items = [];
    try {
      if (window.nieuwsDB && window.nieuwsDB.getAllSync) items = window.nieuwsDB.getAllSync() || [];
    } catch (e) { items = []; }
    var vis = items
      .filter(function (it) { return it && it.archived !== true && it.status !== "Draft"; })
      .sort(function (a, b) { return (Date.parse(b.aanmaakdatum) || 0) - (Date.parse(a.aanmaakdatum) || 0); })
      .slice(0, 3);
    if (!vis.length) {
      box.innerHTML = '<p class="md-news-empty">Er zijn nog geen nieuwsberichten.</p>';
      return;
    }
    box.innerHTML = vis.map(function (it) {
      var intro = stripHtml(it.inhoud).slice(0, 60);
      if (stripHtml(it.inhoud).length > 60) intro += "…";
      var dt = "";
      var t = Date.parse(it.aanmaakdatum);
      if (isFinite(t)) { try { dt = new Date(t).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { dt = ""; } }
      return '<a class="md-news-item" href="home?nieuws=' + encodeURIComponent(it.id) + '">'
        + '<span class="md-news-titel">' + escHtml(it.titel || "Nieuwsbericht") + "</span>"
        + '<span class="md-news-intro">' + escHtml(intro) + "</span>"
        + '<span class="md-news-date">' + escHtml(dt) + "</span></a>";
    }).join("");
  }

  // ─── Per locatie: omzet / kosten / resultaat / open diensten ─────────────
  var OPEN_WEEK_DREMPEL = 5;
  function locFin() { return (window.managementDashboardDB && window.managementDashboardDB.getLocaties) ? window.managementDashboardDB.getLocaties() : null; }
  // Pure overhead-regel = geen omzet én geen ZZP-inzet (kantoor/satelliet). Niet als zorggroep tonen.
  function isOverheadLoc(l) {
    return num(l.omzet) === 0 && num(l.kosten_zzp) === 0
      && (num(l.personeel) > 0 || num(l.onkosten) > 0 || num(l.loondienst) > 0);
  }
  function locSignalen() {
    var fl = locFin();
    var out = [];
    if (!fl || !Array.isArray(fl.locations)) return out;
    fl.locations.forEach(function (l) {
      var res = num(l.resultaat);
      if (res < 0 && !isOverheadLoc(l) && (num(l.omzet) > 0 || num(l.kosten_zzp) > 0)) {
        out.push({ domein: l.name, ernst: "rood", tekst: "Verliesgevend — resultaat " + eur(res) });
      }
      if (num(l.open_diensten_week) >= OPEN_WEEK_DREMPEL) {
        out.push({ domein: l.name, ernst: "oranje", tekst: num(l.open_diensten_week) + " open diensten in de komende 7 dagen" });
      }
    });
    return out;
  }
  function renderLocaties() {
    var fl = locFin();
    var section = $("md-locaties");
    var tb = $("md-loc-tbody");
    if (!tb) return;
    if (!fl || !Array.isArray(fl.locations) || !fl.locations.length) {
      // Geen toegang of geen data → sectie verbergen (gebeurt niet voor Eigenaar/Directeur).
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    var per = fl.period || {};
    setText("md-loc-period", per.start ? (per.start === per.end ? monthLabel(per.start) : monthLabel(per.start) + " – " + monthLabel(per.end)) : "");
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    // Zorggroepen eerst (op omzet), overhead onderaan.
    var rows = fl.locations.slice().sort(function (a, b) {
      var ao = isOverheadLoc(a) ? 1 : 0, bo = isOverheadLoc(b) ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return num(b.omzet) - num(a.omzet);
    });
    var tOmzet = 0, tKosten = 0, tOpen = 0;
    rows.forEach(function (l) {
      tOmzet += num(l.omzet); tKosten += num(l.kosten); tOpen += num(l.open_diensten);
      var res = num(l.resultaat), pos = res >= 0;
      var tr = document.createElement("tr");
      tr.className = "md-loc-row";

      var tdN = document.createElement("td");
      tdN.className = "md-loc-name";
      var dot = document.createElement("span");
      dot.className = "md-loc-dot " + (pos ? "md--groen" : "md--rood");
      tdN.appendChild(dot);
      tdN.appendChild(document.createTextNode(l.name));
      if (isOverheadLoc(l)) { var ob = document.createElement("span"); ob.className = "md-loc-ovh"; ob.textContent = "overhead"; tdN.appendChild(ob); }
      tr.appendChild(tdN);

      tr.appendChild(cell("md-loc-num", eur(l.omzet)));
      tr.appendChild(cell("md-loc-num", eur(l.kosten)));
      tr.appendChild(cell("md-loc-num " + (pos ? "md-loc-pos" : "md-loc-neg"), eur(res)));
      tr.appendChild(cell("md-loc-num " + (pos ? "md-loc-pos" : "md-loc-neg"), l.marge_pct == null ? "—" : intl(l.marge_pct) + "%"));
      var ow = num(l.open_diensten_week);
      var tdO = cell("md-loc-num" + (ow >= OPEN_WEEK_DREMPEL ? " md-loc-neg" : ""), intl(l.open_diensten));
      if (ow > 0) tdO.title = ow + " in de komende 7 dagen";
      tr.appendChild(tdO);
      tb.appendChild(tr);
    });
    setText("md-loc-foot-omzet", eur(tOmzet));
    setText("md-loc-foot-kosten", eur(tKosten));
    var tRes = tOmzet - tKosten;
    var footRes = $("md-loc-foot-result");
    if (footRes) { footRes.textContent = eur(tRes); footRes.className = "md-loc-num md-loc-strong " + (tRes >= 0 ? "md-loc-pos" : "md-loc-neg"); }
    setText("md-loc-foot-marge", tOmzet > 0 ? intl(Math.round(tRes / tOmzet * 1000) / 10) + "%" : "—");
    setText("md-loc-foot-open", intl(tOpen));
    setText("md-loc-note", "Kosten per locatie = ingehuurde ZZP-diensten + loondienst-medewerkers (salaris × werkgeverslasten, gekoppeld via HR) + handmatige personeels- en onkosten. Open diensten = toekomstige, nog niet-toegewezen diensten. Klik op de titel-link voor de volledige uitsplitsing en periodefilters.");
  }
  function cell(cls, txt) { var td = document.createElement("td"); td.className = cls; td.textContent = txt; return td; }

  // ─── Render alles ────────────────────────────────────────────────────────
  function render() {
    renderGreeting();
    renderNews();
    var d = (window.managementDashboardDB && window.managementDashboardDB.getData) ? window.managementDashboardDB.getData() : null;
    if (!d) return;
    renderSignals((Array.isArray(d.signalering) ? d.signalering : []).concat(locSignalen()));
    renderTilesAndStats(d);
    renderLocaties();
    renderFin(d);
    renderHr(d);
    renderPlanning(d);
    renderIncidenten(d);
    var meta = d.meta || {};
    var up = $("md-updated");
    if (up && meta.generated_at) {
      var t = Date.parse(meta.generated_at);
      if (isFinite(t)) {
        try { up.textContent = "Bijgewerkt " + new Date(t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); } catch (e) { up.textContent = ""; }
      }
    }
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    render();
    var btn = $("md-refresh");
    if (btn) {
      btn.addEventListener("click", function () {
        btn.disabled = true;
        var done = function () { btn.disabled = false; };
        if (window.managementDashboardDB && window.managementDashboardDB.refresh) {
          window.managementDashboardDB.refresh().then(done, done);
        } else { done(); }
      });
    }
    window.addEventListener("besa:management-dashboard-updated", render);
    window.addEventListener("besa:nieuws-updated", renderNews);
    window.addEventListener("besa:profile-updated", renderGreeting);
    // Automatisch verversen elke 5 minuten (spec).
    setInterval(function () {
      if (window.managementDashboardDB && window.managementDashboardDB.refresh) window.managementDashboardDB.refresh();
    }, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
