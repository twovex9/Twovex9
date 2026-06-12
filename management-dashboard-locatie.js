/* global window, document */
/**
 * management-dashboard-locatie.js — per-locatie uitbreiding + verkeerslicht voor
 * het Eigenaar/Directie-dashboard. Draait náást management-dashboard.js (laat de
 * bestaande org-brede domeinen ongemoeid) en vult de extra secties:
 *
 *   1. Verkeerslicht-overzicht  — per locatie: open diensten · incidenten ·
 *      personeelsbezetting · verzuim · resultaat → groen/oranje/rood (directie-spec).
 *   2. Personeel per locatie    — totaal + loondienst/zzp/stage, verdeling per locatie.
 *   3. Planning per locatie      — open diensten per locatie + kritieke diensten (24/48u).
 *   4. Incidenten per locatie    — per locatie + per type/status (doorklik) + weektrend.
 *   5. Financieel per locatie    — omzet · personeelskosten · ZZP-kosten · resultaat
 *      per locatie + organisatiebreed totaal.
 *
 * Bronnen (alle read-only, via window.ffDash):
 *   - RPC financien_locaties_dashboard  → per-locatie omzet/kosten/zzp/loondienst/resultaat
 *   - medewerkers (data.locatiesSelected) → personeel per locatie
 *   - incidenten (betrokken_partijen.clients[].location.name) → incidenten per locatie
 *   - planning (vandaag + 48u, data.is_open) → bezetting + kritieke diensten
 *   - verzuim → ziekmeldingen
 */
(function (global) {
  "use strict";

  var F = global.ffDash;
  function $(id) { return document.getElementById(id); }
  var MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  var model = null;

  // ─── Laden ───────────────────────────────────────────────────────────────────
  async function loadAll() {
    var now = new Date();
    var todayStart = F.startOfDay(now);
    var in48 = new Date(now.getTime() + 48 * 3600 * 1000);

    var results = await Promise.allSettled([
      F.rpc("financien_locaties_dashboard", {}),
      F.select("medewerkers", { select: "voornaam,achternaam,dienstverband,functie,fase,archived,data" }),
      F.select("incidenten", { select: "id,categorie,status,locatie_id,betrokken_partijen,incident_datum,archived", filters: [["archived", "eq", false]] }),
      F.select("locaties", { select: "id,naam,kleur,niet_in_planning,archived" }),
      F.select("planning", {
        select: "id,start_iso,einde_iso,locatie,vestiging,teamlid,diensttype,functie,vereist_aantal_medewerkers,data,archived",
        filters: [["archived", "eq", false], ["start_iso", "gte", todayStart.toISOString()], ["start_iso", "lte", in48.toISOString()]],
        order: ["start_iso", true],
      }),
      F.select("verzuim", { select: "status,werkelijke_terug,medewerker" }),
    ]);

    var fin = results[0].status === "fulfilled" ? results[0].value : null;
    var medewerkers = results[1].status === "fulfilled" ? results[1].value : [];
    var incidenten = results[2].status === "fulfilled" ? results[2].value : [];
    var locaties = results[3].status === "fulfilled" ? results[3].value : [];
    var planning48 = results[4].status === "fulfilled" ? results[4].value : [];
    var verzuim = results[5].status === "fulfilled" ? results[5].value : [];

    model = buildModel({ fin: fin, medewerkers: medewerkers, incidenten: incidenten, locaties: locaties, planning48: planning48, verzuim: verzuim, now: now, todayStart: todayStart, in48: in48 });
    return model;
  }

  // ─── Model bouwen ──────────────────────────────────────────────────────────────
  function buildModel(d) {
    var locById = {};
    (d.locaties || []).forEach(function (l) { if (l && l.id) locById[l.id] = l.naam; });
    var kleurByNaam = {};
    (d.locaties || []).forEach(function (l) { if (l && l.naam) kleurByNaam[String(l.naam).trim().toLowerCase()] = l.kleur; });

    // Canonieke locatie-rijenset: de operationele zorglocaties. Primair de fin-RPC
    // (sluit kantoor/overhead al uit, exact zoals de financiën-per-locatie-pagina);
    // valt terug op de planbare locaties als de RPC niet beschikbaar is (bv. andere rol).
    var finLocs = (d.fin && Array.isArray(d.fin.locations)) ? d.fin.locations : [];
    var rowSet = {};
    finLocs.forEach(function (l) { if (l && l.name) rowSet[String(l.name).trim()] = true; });
    if (!Object.keys(rowSet).length) {
      (d.locaties || []).forEach(function (l) {
        if (l && l.naam && l.archived !== true && l.niet_in_planning !== true) rowSet[String(l.naam).trim()] = true;
      });
    }
    var perLoc = {};
    var byKey = {}; // lowercase → rij (voor case-insensitieve mapping)
    function makeRow(naam) {
      var key = String(naam || "").trim();
      if (!key) return null;
      if (!perLoc[key]) {
        perLoc[key] = {
          naam: key, kleur: kleurByNaam[key.toLowerCase()] || null,
          fin: null,
          personeel: { totaal: 0, loondienst: 0, zzp: 0, stage: 0 },
          incidenten: { totaal: 0, nieuw30: 0, perStatus: {}, perCategorie: {} },
          planning: { vereistVandaag: 0, ingevuldVandaag: 0, openVandaag: 0, kritiek: [] },
          verzuim: 0,
        };
        byKey[key.toLowerCase()] = perLoc[key];
      }
      return perLoc[key];
    }
    Object.keys(rowSet).forEach(makeRow);
    // Resolver: map een willekeurige locatienaam op een canonieke rij (of null → drop).
    function ensure(naam) {
      var key = String(naam || "").trim().toLowerCase();
      return key ? (byKey[key] || null) : null;
    }

    // 1. Financiën per locatie
    finLocs.forEach(function (l) {
      var r = ensure(l.name); if (!r) return;
      r.fin = {
        omzet: F.num(l.omzet), kosten: F.num(l.kosten), kosten_zzp: F.num(l.kosten_zzp),
        loondienst: F.num(l.loondienst), resultaat: F.num(l.resultaat), marge_pct: F.num(l.marge_pct),
        open_diensten: F.num(l.open_diensten), open_diensten_week: F.num(l.open_diensten_week),
        zzpers: F.num(l.zzpers), uren: F.num(l.uren),
      };
    });

    // 2. Personeel per locatie + org-totalen
    var org = { mwTotaal: 0, loondienst: 0, zzp: 0, stage: 0 };
    (d.medewerkers || []).forEach(function (mw) {
      if (!F.mwActief(mw)) return;
      var klasse = F.classifyDienstverband(mw);
      org.mwTotaal++; org[klasse] = (org[klasse] || 0) + 1;
      var locs = F.mwLocaties(mw);
      locs.forEach(function (ln) {
        var r = ensure(ln); if (!r) return;
        r.personeel.totaal++; r.personeel[klasse] = (r.personeel[klasse] || 0) + 1;
      });
    });

    // 3. Incidenten per locatie + status/categorie + trend (12 weken) + 30d
    var nu = d.now.getTime();
    var trendWeeks = {};      // weekKey → count (org-breed)
    var incOrg = { totaal: 0, nieuw30: 0, perStatus: {}, perCategorie: {} };
    (d.incidenten || []).forEach(function (inc) {
      var dt = inc.incident_datum ? new Date(inc.incident_datum) : null;
      var naam = F.incLocatie(inc, locById);
      var status = inc.status || "onbekend";
      var cat = inc.categorie || "Overig";
      incOrg.totaal++;
      incOrg.perStatus[status] = (incOrg.perStatus[status] || 0) + 1;
      incOrg.perCategorie[cat] = (incOrg.perCategorie[cat] || 0) + 1;
      var nieuw = dt && (nu - dt.getTime()) <= 30 * 86400000;
      if (nieuw) incOrg.nieuw30++;
      if (dt) { var wk = F.isoWeekKey(dt); trendWeeks[wk] = (trendWeeks[wk] || 0) + 1; }
      if (naam) {
        var r = ensure(naam); if (!r) return;
        r.incidenten.totaal++;
        r.incidenten.perStatus[status] = (r.incidenten.perStatus[status] || 0) + 1;
        r.incidenten.perCategorie[cat] = (r.incidenten.perCategorie[cat] || 0) + 1;
        if (nieuw) r.incidenten.nieuw30++;
      }
    });

    // 4. Planning vandaag (bezetting) + kritieke open diensten (24/48u)
    (d.planning48 || []).forEach(function (p) {
      var naam = F.dienstLocatie(p);
      var r = ensure(naam); if (!r) return;
      var st = p.start_iso ? new Date(p.start_iso) : null;
      var open = F.dienstIsOpen(p);
      var vereist = F.num(p.vereist_aantal_medewerkers) || 1;
      var isVandaag = st && st >= d.todayStart && st.getTime() < d.todayStart.getTime() + 86400000;
      if (isVandaag) {
        r.planning.vereistVandaag += vereist;
        if (open) r.planning.openVandaag += 1; else r.planning.ingevuldVandaag += vereist;
      }
      if (open && st && st.getTime() <= d.in48.getTime() && st.getTime() >= nu) {
        var urenTot = Math.round((st.getTime() - nu) / 3600000);
        r.planning.kritiek.push({
          id: p.id, start: st, locatie: naam,
          diensttype: p.diensttype || p.functie || "Dienst",
          urenTot: urenTot, binnen24: urenTot <= 24,
        });
      }
    });

    // 5. Verzuim per locatie (naam → medewerker.locatiesSelected)
    var mwLocByNaam = {};
    (d.medewerkers || []).forEach(function (mw) {
      if (!F.mwActief(mw)) return;
      mwLocByNaam[F.mwNaam(mw).toLowerCase()] = F.mwLocaties(mw);
    });
    var verzuimActief = 0;
    (d.verzuim || []).forEach(function (v) {
      if (!(v.status === "Actief" && !v.werkelijke_terug)) return;
      verzuimActief++;
      var locs = mwLocByNaam[String(v.medewerker || "").toLowerCase()] || [];
      locs.forEach(function (ln) { var r = ensure(ln); if (r) r.verzuim++; });
    });

    // Org-brede financiën + planning-totalen
    var finTot = (d.fin && d.fin.totals) || {};
    var rijen = Object.keys(perLoc).map(function (k) { return perLoc[k]; });
    // Verkeerslicht-status per locatie
    rijen.forEach(function (r) {
      var bez = r.planning.vereistVandaag > 0 ? Math.round((r.planning.ingevuldVandaag / r.planning.vereistVandaag) * 100) : null;
      r.bezettingPct = bez;
      var openWeek = r.fin ? r.fin.open_diensten_week : (r.planning.openVandaag);
      r.status = {
        open: F.vlOpenDiensten(openWeek),
        incidenten: F.vlIncidenten(r.incidenten.nieuw30, 5),
        bezetting: bez == null ? "groen" : F.vlBezetting(bez),
        verzuim: F.vlVerzuim(org.mwTotaal ? (r.verzuim / Math.max(1, r.personeel.totaal)) * 100 : 0),
        resultaat: r.fin ? F.vlResultaat(r.fin.resultaat, r.fin.omzet) : "groen",
      };
      r.statusOverall = F.worstStatus([r.status.open, r.status.incidenten, r.status.bezetting, r.status.resultaat]);
    });
    // Sorteer: meest urgente eerst, dan op omzet.
    rijen.sort(function (a, b) {
      var sa = F.statusRank(a.statusOverall), sb = F.statusRank(b.statusOverall);
      if (sa !== sb) return sa - sb;
      return (b.fin ? b.fin.omzet : 0) - (a.fin ? a.fin.omzet : 0);
    });

    return {
      perLoc: perLoc, rijen: rijen, org: org, finTot: finTot,
      verzuimActief: verzuimActief, incOrg: incOrg, trendWeeks: trendWeeks,
      finPeriod: (d.fin && d.fin.period) || null, finMonths: (d.fin && d.fin.months) || [],
      finUnauthorized: !!(d.fin && d.fin.unauthorized),
    };
  }

  // ─── Render-helpers ────────────────────────────────────────────────────────────
  function dot(status) { return '<span class="vl-dot ' + F.statusClass(status) + '" aria-hidden="true"></span>'; }
  function cell(status, txt) {
    return '<span class="vl-cell">' + dot(status) + '<span class="vl-cell-txt">' + F.escHtml(txt) + "</span></span>";
  }
  // "Oplossen →"-knop voor een verkeerslicht-rij die op rood/oranje staat. Kiest de
  // bestemming op de zwaarste deelstatus: resultaat → financiën, anders open diensten
  // → planning, anders incidenten → incidenten. Geen knop bij groene rijen.
  function isWarn(s) { return s === "rood" || s === "oranje"; }
  function vlFixBtn(r) {
    if (!global.besaOplossen || !isWarn(r.statusOverall)) return "";
    var st = r.status || {};
    var url, knop, uitleg;
    if (isWarn(st.resultaat)) {
      url = "financien-locaties"; knop = "Naar Financiën";
      uitleg = "Deze locatie is verliesgevend. Bekijk omzet, kosten en resultaat per locatie in Financiën.";
    } else if (isWarn(st.open)) {
      url = "planning"; knop = "Naar Planning";
      uitleg = "Deze locatie heeft open diensten deze week. Wijs medewerkers toe via de Planning.";
    } else if (isWarn(st.incidenten)) {
      url = "incidenten"; knop = "Naar Incidenten";
      uitleg = "Deze locatie heeft openstaande incidenten. Pak de opvolging op via Incidenten.";
    } else if (isWarn(st.bezetting)) {
      url = "planning"; knop = "Naar Planning";
      uitleg = "De bezetting van deze locatie is te laag. Vul de plekken in via de Planning.";
    } else {
      return "";
    }
    return global.besaOplossen.navBtn(url, knop, uitleg);
  }

  // ─── 1. Verkeerslicht-tabel ─────────────────────────────────────────────────────
  function renderVerkeerslicht() {
    var box = $("md-vl-body"); if (!box || !model) return;
    if (!model.rijen.length) { box.innerHTML = '<p class="md-news-empty">Geen locatiegegevens beschikbaar.</p>'; return; }
    var head = '<thead><tr>'
      + '<th>Locatie</th><th>Open diensten</th><th>Incidenten (30d)</th><th>Bezetting vandaag</th><th>Verzuim</th><th>Resultaat (maand)</th><th></th>'
      + '</tr></thead>';
    var rows = model.rijen.map(function (r) {
      var openWeek = r.fin ? r.fin.open_diensten_week : r.planning.openVandaag;
      var bezTxt = r.bezettingPct == null ? "—" : r.bezettingPct + "%";
      var verzPct = r.personeel.totaal ? (r.verzuim / r.personeel.totaal) * 100 : 0;
      var verzTxt = r.verzuim + (r.personeel.totaal ? " (" + F.pct(verzPct) + ")" : "");
      var resTxt = r.fin ? F.eur(r.fin.resultaat) : "—";
      return '<tr class="vl-row vl-row--' + r.statusOverall + '">'
        + '<td class="vl-loc">' + dot(r.statusOverall) + '<span>' + F.escHtml(r.naam) + "</span></td>"
        + "<td>" + cell(r.status.open, F.intl(openWeek) + " deze week") + "</td>"
        + "<td>" + cell(r.status.incidenten, F.intl(r.incidenten.nieuw30) + " nieuw · " + F.intl(r.incidenten.totaal) + " open") + "</td>"
        + "<td>" + cell(r.status.bezetting, bezTxt) + "</td>"
        + "<td>" + cell(r.status.verzuim, verzTxt) + "</td>"
        + "<td>" + cell(r.status.resultaat, resTxt) + "</td>"
        + '<td class="vl-fix">' + vlFixBtn(r) + "</td>"
        + "</tr>";
    }).join("");
    box.innerHTML = '<div class="table-wrapper"><table class="employees-table vl-table">' + head + "<tbody>" + rows + "</tbody></table></div>";
    if (global.besaOplossen) global.besaOplossen.bindSignals(box);
    // Legenda-teller
    var counts = { groen: 0, oranje: 0, rood: 0 };
    model.rijen.forEach(function (r) { counts[r.statusOverall]++; });
    var leg = $("md-vl-legend");
    if (leg) {
      leg.innerHTML =
        '<span class="vl-leg-item">' + dot("rood") + F.intl(counts.rood) + " rood</span>"
        + '<span class="vl-leg-item">' + dot("oranje") + F.intl(counts.oranje) + " oranje</span>"
        + '<span class="vl-leg-item">' + dot("groen") + F.intl(counts.groen) + " groen</span>";
    }
  }

  // ─── 2. Personeel per locatie ────────────────────────────────────────────────────
  function renderPersoneel() {
    var grid = $("md-perspers-grid");
    if (grid && model) {
      var o = model.org;
      var zzpPct = o.mwTotaal ? Math.round((o.zzp / o.mwTotaal) * 100) : 0;
      grid.innerHTML = [
        metric("Totaal medewerkers", F.intl(o.mwTotaal), F.intl(o.loondienst) + " loondienst · " + F.intl(o.zzp) + " zzp/inhuur · " + F.intl(o.stage) + " stage"),
        metric("Loondienst", F.intl(o.loondienst), F.pct(o.mwTotaal ? (o.loondienst / o.mwTotaal) * 100 : 0) + " van het totaal"),
        metric("ZZP / inhuur", F.intl(o.zzp), F.pct(zzpPct) + " van het totaal", zzpPct >= 60 ? "oranje" : null),
        metric("Verhouding loondienst : zzp", verhoudingBar(o.loondienst, o.zzp), ""),
      ].join("");
    }
    var box = $("md-perspers-loc"); if (!box || !model) return;
    var rijen = model.rijen.filter(function (r) { return r.personeel.totaal > 0; })
      .slice().sort(function (a, b) { return b.personeel.totaal - a.personeel.totaal; });
    var max = rijen.reduce(function (m, r) { return Math.max(m, r.personeel.totaal); }, 0) || 1;
    box.innerHTML = '<h3 class="md-cat-title">Verdeling medewerkers per locatie</h3>'
      + rijen.map(function (r) {
        var w = Math.round((r.personeel.totaal / max) * 100);
        return '<div class="md-cat-row"><span class="md-cat-lbl">' + F.escHtml(r.naam) + "</span>"
          + '<span class="md-cat-bar"><span class="md-cat-fill" style="width:' + w + '%"></span></span>'
          + '<span class="md-cat-val">' + F.intl(r.personeel.totaal) + " <span class=\"vl-sub\">(" + F.intl(r.personeel.loondienst) + "L · " + F.intl(r.personeel.zzp) + "Z)</span></span></div>";
      }).join("");
  }
  function verhoudingBar(a, b) {
    var tot = a + b || 1; var pa = Math.round((a / tot) * 100);
    return '<span class="vl-split"><span class="vl-split-bar"><span class="vl-split-a" style="width:' + pa + '%"></span></span>'
      + '<span class="vl-split-lbl">' + pa + "% L · " + (100 - pa) + "% Z</span></span>";
  }

  // ─── 3. Planning per locatie + kritieke diensten ──────────────────────────────────
  function renderPlanning() {
    var box = $("md-perplan-loc");
    if (box && model) {
      var rijen = model.rijen.slice().sort(function (a, b) {
        return (b.fin ? b.fin.open_diensten_week : 0) - (a.fin ? a.fin.open_diensten_week : 0);
      });
      var max = rijen.reduce(function (m, r) { return Math.max(m, r.fin ? r.fin.open_diensten_week : 0); }, 0) || 1;
      box.innerHTML = '<h3 class="md-cat-title">Open diensten per locatie (deze week)</h3>'
        + rijen.map(function (r) {
          var n = r.fin ? r.fin.open_diensten_week : 0;
          var w = Math.round((n / max) * 100);
          var st = F.vlOpenDiensten(n);
          var bez = r.bezettingPct == null ? "" : ' <span class="vl-sub">· bezetting ' + r.bezettingPct + "%</span>";
          return '<div class="md-cat-row"><span class="md-cat-lbl">' + dot(st) + F.escHtml(r.naam) + "</span>"
            + '<span class="md-cat-bar"><span class="md-cat-fill ' + F.statusClass(st) + '" style="width:' + w + '%"></span></span>'
            + '<span class="md-cat-val">' + F.intl(n) + bez + "</span></div>";
        }).join("");
    }
    var kb = $("md-perplan-kritiek"); if (!kb || !model) return;
    var kritiek = [];
    model.rijen.forEach(function (r) { r.planning.kritiek.forEach(function (k) { kritiek.push(k); }); });
    kritiek.sort(function (a, b) { return a.start - b.start; });
    var titel = '<h3 class="md-cat-title">Kritieke open diensten — starten binnen 48 uur (' + F.intl(kritiek.length) + ")</h3>";
    if (!kritiek.length) { kb.innerHTML = titel + '<p class="md-news-empty">Geen open diensten binnen 48 uur. 👍</p>'; return; }
    kb.innerHTML = titel + '<div class="vl-krit-list">' + kritiek.slice(0, 12).map(function (k) {
      var st = k.binnen24 ? "rood" : "oranje";
      var dtxt = "";
      try { dtxt = k.start.toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { dtxt = ""; }
      return '<a class="vl-krit-item" href="planning?dienst=' + encodeURIComponent(k.id) + '">'
        + dot(st) + '<span class="vl-krit-loc">' + F.escHtml(k.locatie) + "</span>"
        + '<span class="vl-krit-type">' + F.escHtml(k.diensttype) + "</span>"
        + '<span class="vl-krit-tijd">' + F.escHtml(dtxt) + " · over " + F.intl(k.urenTot) + "u</span></a>";
    }).join("") + "</div>";
  }

  // ─── 4. Incidenten per locatie + type/status + trend ──────────────────────────────
  function renderIncidenten() {
    var box = $("md-perinc-loc");
    if (box && model) {
      var rijen = model.rijen.filter(function (r) { return r.incidenten.totaal > 0; })
        .slice().sort(function (a, b) { return b.incidenten.totaal - a.incidenten.totaal; });
      var max = rijen.reduce(function (m, r) { return Math.max(m, r.incidenten.totaal); }, 0) || 1;
      box.innerHTML = '<h3 class="md-cat-title">Incidenten per locatie (openstaand)</h3>'
        + rijen.map(function (r) {
          var w = Math.round((r.incidenten.totaal / max) * 100);
          var st = F.vlIncidenten(r.incidenten.nieuw30, 5);
          return '<a class="md-cat-row md-cat-row--link" href="incidenten?locatie=' + encodeURIComponent(r.naam) + '">'
            + '<span class="md-cat-lbl">' + dot(st) + F.escHtml(r.naam) + "</span>"
            + '<span class="md-cat-bar"><span class="md-cat-fill ' + F.statusClass(st) + '" style="width:' + w + '%"></span></span>'
            + '<span class="md-cat-val">' + F.intl(r.incidenten.totaal) + ' <span class="vl-sub">(' + F.intl(r.incidenten.nieuw30) + " nw)</span></span></a>";
        }).join("");
    }
    var tb = $("md-perinc-trend");
    if (tb && model) {
      var weeks = Object.keys(model.trendWeeks).sort().slice(-10);
      var maxw = weeks.reduce(function (m, k) { return Math.max(m, model.trendWeeks[k]); }, 0) || 1;
      tb.innerHTML = '<h3 class="md-cat-title">Weektrend (laatste 10 weken)</h3>'
        + '<div class="vl-trend">' + weeks.map(function (k) {
          var v = model.trendWeeks[k]; var h = Math.max(4, Math.round((v / maxw) * 64));
          var wk = k.split("-W")[1] || k;
          return '<div class="vl-trend-col" title="' + F.escHtml(k) + ": " + v + ' incidenten"><span class="vl-trend-bar" style="height:' + h + 'px"></span><span class="vl-trend-lbl">w' + F.escHtml(wk) + "</span><span class=\"vl-trend-val\">" + v + "</span></div>";
        }).join("") + "</div>";
    }
    var sb = $("md-perinc-status"); if (!sb || !model) return;
    var STATUS_LBL = { in_afwachting: "In afwachting", in_behandeling: "In behandeling", opgelost: "Opgelost", afgehandeld: "Afgehandeld" };
    var statusKeys = Object.keys(model.incOrg.perStatus).sort(function (a, b) { return model.incOrg.perStatus[b] - model.incOrg.perStatus[a]; });
    var catKeys = Object.keys(model.incOrg.perCategorie).sort(function (a, b) { return model.incOrg.perCategorie[b] - model.incOrg.perCategorie[a]; }).slice(0, 8);
    var maxCat = catKeys.reduce(function (m, k) { return Math.max(m, model.incOrg.perCategorie[k]); }, 0) || 1;
    sb.innerHTML = '<h3 class="md-cat-title">Naar status</h3>'
      + '<div class="vl-chips">' + statusKeys.map(function (k) {
        return '<a class="vl-chip" href="incidenten?status=' + encodeURIComponent(k) + '">' + F.escHtml(STATUS_LBL[k] || k) + ' <strong>' + F.intl(model.incOrg.perStatus[k]) + "</strong></a>";
      }).join("") + "</div>"
      + '<h3 class="md-cat-title" style="margin-top:14px">Naar type (doorklik)</h3>'
      + catKeys.map(function (k) {
        var v = model.incOrg.perCategorie[k]; var w = Math.round((v / maxCat) * 100);
        return '<a class="md-cat-row md-cat-row--link" href="incidenten?categorie=' + encodeURIComponent(k) + '">'
          + '<span class="md-cat-lbl">' + F.escHtml(k) + "</span>"
          + '<span class="md-cat-bar"><span class="md-cat-fill" style="width:' + w + '%"></span></span>'
          + '<span class="md-cat-val">' + F.intl(v) + "</span></a>";
      }).join("");
  }

  // ─── 5. Personeelskosten (loondienst vs ZZP) per locatie ────────────────────────────
  // Complementair aan de "Resultaat per locatie"-tabel (#md-locaties): splitst de
  // personeelskosten uit in loondienst- en ZZP-kosten per locatie (directie-spec).
  function renderFinancieel() {
    var box = $("md-perfin-body"); if (!box || !model) return;
    if (model.finUnauthorized) { box.innerHTML = '<p class="md-news-empty">Geen toegang tot de financiële cijfers.</p>'; return; }
    var rijen = model.rijen.filter(function (r) { return r.fin; })
      .slice().sort(function (a, b) { return (b.fin.loondienst + b.fin.kosten_zzp) - (a.fin.loondienst + a.fin.kosten_zzp); });
    if (!rijen.length) { box.innerHTML = '<p class="md-news-empty">Geen financiële locatiegegevens beschikbaar.</p>'; return; }
    var head = '<thead><tr><th>Locatie</th><th class="vl-num">Loondienst-kosten</th><th class="vl-num">ZZP-kosten</th><th class="vl-num">Totaal personeelskosten</th><th class="vl-num">ZZP-aandeel</th><th class="vl-num">% van omzet</th></tr></thead>';
    var rows = rijen.map(function (r) {
      var f = r.fin;
      var persKosten = f.loondienst + f.kosten_zzp;
      var zzpAandeel = persKosten ? (f.kosten_zzp / persKosten) * 100 : 0;
      var vanOmzet = f.omzet ? (persKosten / f.omzet) * 100 : null;
      var st = vanOmzet == null ? "groen" : (vanOmzet > 100 ? "rood" : vanOmzet > 85 ? "oranje" : "groen");
      return "<tr>"
        + '<td class="vl-loc"><span>' + F.escHtml(r.naam) + "</span></td>"
        + '<td class="vl-num">' + F.eur(f.loondienst) + "</td>"
        + '<td class="vl-num">' + F.eur(f.kosten_zzp) + "</td>"
        + '<td class="vl-num">' + F.eur(persKosten) + "</td>"
        + '<td class="vl-num">' + F.pct(zzpAandeel) + "</td>"
        + '<td class="vl-num ' + F.statusClass(st).replace("md--", "vl-txt--") + '">' + (vanOmzet == null ? "—" : F.pct(vanOmzet)) + "</td>"
        + "</tr>";
    }).join("");
    var t = model.finTot;
    var totLoon = F.num(t.loondienst), totZzp = F.num(t.kosten_zzp);
    var totPers = totLoon + totZzp;
    var totZzpAandeel = totPers ? (totZzp / totPers) * 100 : 0;
    var totVanOmzet = F.num(t.omzet) ? (totPers / F.num(t.omzet)) * 100 : null;
    var foot = '<tfoot><tr class="vl-total">'
      + "<td>Organisatie totaal</td>"
      + '<td class="vl-num">' + F.eur(totLoon) + "</td>"
      + '<td class="vl-num">' + F.eur(totZzp) + "</td>"
      + '<td class="vl-num">' + F.eur(totPers) + "</td>"
      + '<td class="vl-num">' + F.pct(totZzpAandeel) + "</td>"
      + '<td class="vl-num">' + (totVanOmzet == null ? "—" : F.pct(totVanOmzet)) + "</td>"
      + "</tr></tfoot>";
    box.innerHTML = '<div class="table-wrapper"><table class="employees-table vl-table">' + head + "<tbody>" + rows + "</tbody>" + foot + "</table></div>";
    var note = $("md-perfin-note");
    if (note && model.finPeriod) {
      var p = model.finPeriod;
      note.textContent = "Periode: " + maandLabel(p.start) + (p.end && p.end !== p.start ? " t/m " + maandLabel(p.end) : "")
        + ". Loondienst-kosten zijn indicatief (salaris × werkgeverslasten, toegerekend o.b.v. de locaties van de medewerker); ZZP-kosten komen uit de ingezette diensten. Omzet/resultaat per locatie staat in de tabel hierboven.";
    }
  }
  function maandLabel(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "";
    var p = ym.split("-"); return MONTHS[Number(p[1]) - 1] + " " + p[0];
  }

  function metric(label, value, sub, accent) {
    return '<div class="md-metric' + (accent ? " md-metric--" + accent : "") + '">'
      + '<span class="md-metric-lbl">' + F.escHtml(label) + "</span>"
      + '<span class="md-metric-val">' + value + "</span>"
      + (sub ? '<span class="md-metric-sub">' + sub + "</span>" : "") + "</div>";
  }

  function renderAll() {
    if (!model) return;
    renderVerkeerslicht();
    renderPersoneel();
    renderPlanning();
    renderIncidenten();
    renderFinancieel();
  }

  // ─── Init ───────────────────────────────────────────────────────────────────────
  async function init() {
    if (!global.ffDash) { console.error("[md-locatie] ffDash niet geladen"); return; }
    try {
      await loadAll();
      renderAll();
    } catch (e) {
      console.error("[md-locatie] laden mislukt", e);
    }
    var btn = $("md-refresh");
    if (btn) btn.addEventListener("click", function () { loadAll().then(renderAll).catch(function (e) { console.error(e); }); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
