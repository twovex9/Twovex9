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
      return '<div class="md-signal ' + cls + '">'
        + '<span class="md-signal-dom">' + escHtml(s.domein || "") + "</span>"
        + '<span class="md-signal-txt">' + escHtml(s.tekst || "") + "</span></div>";
    }).join("");
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
  function metricCard(label, value, sub, accent) {
    return '<div class="md-metric' + (accent ? " md-metric--" + accent : "") + '">'
      + '<span class="md-metric-lbl">' + escHtml(label) + "</span>"
      + '<span class="md-metric-val">' + value + "</span>"
      + (sub ? '<span class="md-metric-sub">' + sub + "</span>" : "")
      + "</div>";
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
      grid.innerHTML = [
        metricCard("Omzet — " + monthLabel(fin.omzet_ref_ym), eur(fin.omzet_maand), deltaHtml(d)),
        metricCard("Open declaraties", eur(fin.open_declaraties_bedrag), intl(fin.open_declaraties_aantal) + " stuks bij de gemeente", fin.open_declaraties_aantal > 0 ? "oranje" : null),
        metricCard("Afgekeurde declaraties", intl(fin.afgekeurd_aantal), eur(fin.afgekeurd_bedrag), fin.afgekeurd_aantal > 0 ? "rood" : null),
        metricCard("Nog te declareren", eur(fin.nog_te_declareren), "achterstand zorg → declaratie"),
        metricCard("Liquiditeit", escHtml(liq.status || "—"), "te ontvangen " + eur(liq.te_ontvangen) + " · te betalen " + eur(liq.te_betalen), liqAccent),
      ].join("");
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
    grid.innerHTML = [
      metricCard("Actieve medewerkers", intl(hr.actief_totaal), intl(hr.loondienst) + " loondienst · " + intl(hr.zzp) + " inhuur · " + intl(hr.stage) + " stage"),
      metricCard("Ziekteverzuim", intl(hr.verzuim_pct) + "%", trend + " · vorige maand " + intl(hr.verzuim_pct_vorige) + "%", num(hr.verzuim_pct) > 8 ? "rood" : num(hr.verzuim_pct) >= 5 ? "oranje" : "groen"),
      metricCard("Contracten verlopen", intl(hr.contract_30d), "binnen 30 dagen · " + intl(hr.contract_7d) + " binnen 7 dagen", hr.contract_7d > 0 ? "rood" : hr.contract_30d > 0 ? "oranje" : null),
      metricCard("Verlof deze week", intl(hr.verlof_deze_week), "goedgekeurd in de lopende week"),
    ].join("");
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
    grid.innerHTML = [
      metricCard("Bezettingsgraad vandaag", pct + "%", bar + intl(pl.ingevuld) + " van " + intl(pl.vereist) + " plekken ingevuld", pct < 85 ? "rood" : pct < 95 ? "oranje" : "groen"),
      metricCard("Openstaande diensten", intl(pl.openstaande_diensten), "vandaag niet ingevuld", pl.openstaande_diensten >= 3 ? "rood" : pl.openstaande_diensten > 0 ? "oranje" : "groen"),
      metricCard("Oproepen uitstaand", intl(pl.oproepen_uitstaand), "wachten op bevestiging medewerker"),
      metricCard("Diensten vandaag", intl(pl.diensten_vandaag), "totaal ingepland"),
    ].join("");
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
      grid.innerHTML = [
        metricCard("Nieuwe incidenten", intl(inc.nieuw_7d), "afgelopen 7 dagen"),
        metricCard("Zonder opvolging >48u", intl(inc.zonder_opvolging_48u), "kritieke indicator", inc.zonder_opvolging_48u >= 3 ? "rood" : inc.zonder_opvolging_48u > 0 ? "oranje" : "groen"),
        metricCard("Klachten in behandeling", intl(inc.klachten_in_behandeling), intl(inc.klachten_open) + " open klacht(en)", inc.klachten_open >= 2 ? "rood" : inc.klachten_open > 0 ? "oranje" : "groen"),
        metricCard("Totaal openstaand", intl(inc.totaal_open), "alle openstaande incidenten"),
      ].join("");
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

  // ─── Render alles ────────────────────────────────────────────────────────
  function render() {
    renderGreeting();
    renderNews();
    var d = (window.managementDashboardDB && window.managementDashboardDB.getData) ? window.managementDashboardDB.getData() : null;
    if (!d) return;
    renderSignals(d.signalering);
    renderTilesAndStats(d);
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
