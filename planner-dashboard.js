/* global window, document */
/**
 * planner-dashboard.js — operationeel planner-dashboard. Leest planning, medewerkers
 * en verzuim live uit de productie-Supabase (via window.ffDash) en toont:
 *   - Open diensten per locatie (komende 14 dagen);
 *   - Diensten zonder bezetting die vandaag of morgen starten (klikbaar → toewijzen);
 *   - Over- en onderbezetting per locatie (vandaag);
 *   - Ziekmeldingen met impact op de planning (zieke medewerkers met diensten <7d);
 *   - Beschikbare vervangers (inzetbare, niet-zieke medewerkers).
 *
 * Open dienst = geen teamlid toegewezen (ffDash.dienstIsOpen). Toewijzen gaat via een
 * deep-link planning?dienst=<id> die de dienst direct in de planning-detailmodal opent.
 */
(function (global) {
  "use strict";

  var F = global.ffDash;
  function $(id) { return document.getElementById(id); }
  var model = null;

  async function loadAll() {
    var now = new Date();
    var t0 = F.startOfDay(now);
    var in14 = new Date(t0.getTime() + 14 * 86400000);
    var in7 = new Date(t0.getTime() + 7 * 86400000);

    var res = await Promise.allSettled([
      // Open diensten (teamlid leeg) komende 14 dagen
      F.select("planning", {
        select: "id,start_iso,locatie,vestiging,diensttype,functie,vereist_aantal_medewerkers,teamlid",
        filters: [["archived", "eq", false], ["teamlid", "is", null], ["start_iso", "gte", t0.toISOString()], ["start_iso", "lte", in14.toISOString()]],
        order: ["start_iso", true], limit: 3000,
      }),
      // Alle diensten komende 7 dagen (voor ziekte-impact + bezetting vandaag)
      F.select("planning", {
        select: "id,start_iso,locatie,vestiging,diensttype,functie,vereist_aantal_medewerkers,teamlid",
        filters: [["archived", "eq", false], ["start_iso", "gte", t0.toISOString()], ["start_iso", "lt", in7.toISOString()]],
        order: ["start_iso", true], limit: 4000,
      }),
      F.select("medewerkers", { select: "voornaam,achternaam,dienstverband,functie,fase,archived,data" }),
      F.select("verzuim", { select: "status,werkelijke_terug,medewerker,type,eerst_ziektedag" }),
    ]);

    var open14 = res[0].status === "fulfilled" ? res[0].value : [];
    var next7 = res[1].status === "fulfilled" ? res[1].value : [];
    var medewerkers = res[2].status === "fulfilled" ? res[2].value : [];
    var verzuim = res[3].status === "fulfilled" ? res[3].value : [];

    model = buildModel({ open14: open14, next7: next7, medewerkers: medewerkers, verzuim: verzuim, now: now, t0: t0 });
    return model;
  }

  function buildModel(d) {
    var nu = d.now.getTime();
    var morgenEind = d.t0.getTime() + 2 * 86400000;
    var vandaagEind = d.t0.getTime() + 86400000;

    // Open diensten per locatie + lijst vandaag/morgen
    var openPerLoc = {};
    var onbezetVM = [];
    (d.open14 || []).forEach(function (p) {
      var loc = F.dienstLocatie(p);
      openPerLoc[loc] = (openPerLoc[loc] || 0) + 1;
      var st = p.start_iso ? new Date(p.start_iso) : null;
      if (st && st.getTime() < morgenEind && st.getTime() >= nu) {
        onbezetVM.push({
          id: p.id, start: st, locatie: loc,
          diensttype: p.diensttype || p.functie || "Dienst",
          vandaag: st.getTime() < vandaagEind,
          urenTot: Math.round((st.getTime() - nu) / 3600000),
        });
      }
    });
    onbezetVM.sort(function (a, b) { return a.start - b.start; });

    // Bezetting vandaag per locatie
    var bez = {};
    (d.next7 || []).forEach(function (p) {
      var st = p.start_iso ? new Date(p.start_iso) : null;
      if (!st || st.getTime() >= vandaagEind || st < d.t0) return;
      var loc = F.dienstLocatie(p);
      if (!bez[loc]) bez[loc] = { vereist: 0, ingevuld: 0, open: 0 };
      var vereist = F.num(p.vereist_aantal_medewerkers) || 1;
      bez[loc].vereist += vereist;
      if (F.dienstIsOpen(p)) bez[loc].open += 1; else bez[loc].ingevuld += vereist;
    });

    // Ziekmeldingen met planning-impact: actieve zieken + hun diensten <7d
    var zieken = (d.verzuim || []).filter(function (v) { return v.status === "Actief" && !v.werkelijke_terug; });
    var ziekNamen = {};
    zieken.forEach(function (v) { ziekNamen[String(v.medewerker || "").toLowerCase()] = v; });
    var impact = {}; // naam → { verzuim, diensten:[] }
    (d.next7 || []).forEach(function (p) {
      var tl = String(p.teamlid || "").toLowerCase().trim();
      if (!tl || !ziekNamen[tl]) return;
      if (!impact[tl]) impact[tl] = { naam: p.teamlid, verzuim: ziekNamen[tl], diensten: [] };
      impact[tl].diensten.push({ id: p.id, start: new Date(p.start_iso), locatie: F.dienstLocatie(p), diensttype: p.diensttype || p.functie || "Dienst" });
    });
    var impactList = Object.keys(impact).map(function (k) { return impact[k]; });
    impactList.sort(function (a, b) { return b.diensten.length - a.diensten.length; });
    var impactDienstenTotaal = impactList.reduce(function (s, x) { return s + x.diensten.length; }, 0);

    // Beschikbare vervangers: actief, inzetbaar (bs2_is_plannable), niet ziek
    var actief = (d.medewerkers || []).filter(F.mwActief);
    var vervangers = actief.filter(function (mw) {
      var nm = F.mwNaam(mw).toLowerCase();
      if (ziekNamen[nm]) return false;
      var dd = F.mwData(mw);
      return dd.bs2_is_plannable !== false; // inzetbaar tenzij expliciet niet-planbaar
    });
    var vervPlannable = vervangers.filter(function (mw) { return F.mwData(mw).bs2_is_plannable === true; });
    var vervFlex = vervangers.filter(function (mw) { var dd = F.mwData(mw); return dd.bs2_is_flexible === true || F.classifyDienstverband(mw) === "zzp"; });

    return {
      openPerLoc: openPerLoc, open14Totaal: (d.open14 || []).length, onbezetVM: onbezetVM,
      bez: bez, impactList: impactList, impactDienstenTotaal: impactDienstenTotaal, zieken: zieken,
      vervangers: vervangers, vervPlannable: vervPlannable, vervFlex: vervFlex,
    };
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  function metric(label, value, sub, accent) {
    return '<div class="md-metric' + (accent ? " md-metric--" + accent : "") + '">'
      + '<span class="md-metric-lbl">' + F.escHtml(label) + "</span>"
      + '<span class="md-metric-val">' + value + "</span>"
      + (sub ? '<span class="md-metric-sub">' + sub + "</span>" : "") + "</div>";
  }
  function dot(s) { return '<span class="vl-dot ' + F.statusClass(s) + '" aria-hidden="true"></span>'; }
  function fmtDT(d) { try { return d.toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

  function render() {
    if (!model) return;
    try { $("md-date").textContent = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { /* */ }

    // Quickstats
    $("pld-qs-open").textContent = F.intl(model.open14Totaal);
    $("pld-qs-vandaag").textContent = F.intl(model.onbezetVM.length);
    $("pld-qs-ziek").textContent = F.intl(model.impactList.length);

    // Open per locatie
    var ob = $("pld-open-loc");
    var keys = Object.keys(model.openPerLoc).sort(function (a, b) { return model.openPerLoc[b] - model.openPerLoc[a]; });
    if (!keys.length) {
      ob.innerHTML = '<p class="md-news-empty">Geen open diensten in de komende 14 dagen. 👍</p>';
    } else {
      var max = keys.reduce(function (m, k) { return Math.max(m, model.openPerLoc[k]); }, 0) || 1;
      ob.innerHTML = keys.map(function (k) {
        var n = model.openPerLoc[k]; var w = Math.round((n / max) * 100);
        var st = F.vlOpenDiensten(n);
        return '<div class="md-cat-row"><span class="md-cat-lbl">' + dot(st) + F.escHtml(k) + "</span>"
          + '<span class="md-cat-bar"><span class="md-cat-fill ' + F.statusClass(st) + '" style="width:' + w + '%"></span></span>'
          + '<span class="md-cat-val">' + F.intl(n) + "</span></div>";
      }).join("");
    }

    // Onbezet vandaag/morgen — klikbaar → toewijzen
    var ol = $("pld-onbezet-list");
    if (!model.onbezetVM.length) {
      ol.innerHTML = '<p class="md-news-empty">Alle diensten van vandaag en morgen zijn bezet. 👍</p>';
    } else {
      ol.innerHTML = '<div class="vl-krit-list">' + model.onbezetVM.map(function (k) {
        var st = k.vandaag ? "rood" : "oranje";
        return '<a class="vl-krit-item" href="planning?dienst=' + encodeURIComponent(k.id) + '" title="Open in planning om toe te wijzen">'
          + dot(st) + '<span class="vl-krit-loc">' + F.escHtml(k.locatie) + "</span>"
          + '<span class="vl-krit-type">' + F.escHtml(k.diensttype) + "</span>"
          + '<span class="vl-krit-tijd">' + fmtDT(k.start) + (k.vandaag ? " · vandaag" : " · morgen") + "</span></a>";
      }).join("") + "</div>";
    }

    // Bezetting per locatie (vandaag)
    var bb = $("pld-bezetting-body");
    var blocs = Object.keys(model.bez);
    if (!blocs.length) {
      bb.innerHTML = '<p class="md-news-empty">Geen diensten ingepland voor vandaag.</p>';
    } else {
      blocs.sort(function (a, b) { return (model.bez[b].open) - (model.bez[a].open); });
      var rows = blocs.map(function (loc) {
        var x = model.bez[loc];
        var pct = x.vereist ? Math.round((x.ingevuld / x.vereist) * 100) : 100;
        var st = x.open > 0 ? F.vlBezetting(pct) : "groen";
        var label = x.open > 0 ? "Onderbezet — " + x.open + " open" : (pct > 100 ? "Overbezet" : "Volledig bezet");
        var afwijkend = x.open > 0 || pct > 100;
        var solve = afwijkend && window.ffOplossen
          ? window.ffOplossen.navBtn("planning", "Naar planning", "Vul de openstaande diensten van deze locatie in of herverdeel de bezetting.")
          : "";
        return "<tr>"
          + '<td class="vl-loc">' + dot(st) + "<span>" + F.escHtml(loc) + "</span></td>"
          + '<td class="vl-num">' + F.intl(x.ingevuld) + " / " + F.intl(x.vereist) + "</td>"
          + '<td class="vl-num">' + pct + "%</td>"
          + '<td class="vl-num">' + F.intl(x.open) + "</td>"
          + "<td>" + F.escHtml(label) + "</td>"
          + "<td>" + solve + "</td>"
          + "</tr>";
      }).join("");
      bb.innerHTML = '<div class="table-wrapper"><table class="employees-table vl-table">'
        + '<thead><tr><th>Locatie</th><th class="vl-num">Bezet/vereist</th><th class="vl-num">Bezetting</th><th class="vl-num">Open</th><th>Status</th><th>Oplossen</th></tr></thead>'
        + "<tbody>" + rows + "</tbody></table></div>";
      if (window.ffOplossen) window.ffOplossen.bindSignals(bb);
    }

    // Ziekmeldingen met impact
    var zl = $("pld-ziek-list");
    if (!model.impactList.length) {
      zl.innerHTML = '<p class="md-news-empty">' + (model.zieken.length ? "Geen geplande diensten van zieke medewerkers in de komende 7 dagen." : "Geen actieve ziekmeldingen.") + "</p>";
    } else {
      zl.innerHTML = '<p class="md-note">' + F.intl(model.impactDienstenTotaal) + " geplande dienst(en) van " + F.intl(model.impactList.length) + " zieke medewerker(s) in de komende 7 dagen — controleer of vervanging nodig is.</p>"
        + '<div class="vl-krit-list">' + model.impactList.map(function (x) {
          var st = x.verzuim.type === "lang" ? "rood" : "oranje";
          var eerst = x.diensten[0];
          return '<a class="vl-krit-item" href="planning?dienst=' + encodeURIComponent(eerst.id) + '" title="Open eerstvolgende dienst in planning">'
            + dot(st) + '<span class="vl-krit-loc">' + F.escHtml(x.naam) + "</span>"
            + '<span class="vl-krit-type">' + (x.verzuim.type === "lang" ? "Langdurig ziek" : "Ziek") + " · " + F.intl(x.diensten.length) + " dienst(en)</span>"
            + '<span class="vl-krit-tijd">eerstvolgend: ' + fmtDT(eerst.start) + " · " + F.escHtml(eerst.locatie) + "</span></a>";
        }).join("") + "</div>";
    }

    // Beschikbare vervangers
    $("pld-vervangers-grid").innerHTML = [
      metric("Inzetbare medewerkers", F.intl(model.vervangers.length), "actief &amp; niet ziek"),
      metric("Flex / ZZP-pool", F.intl(model.vervFlex.length), "typische vervangers"),
    ].join("");
    var vl = $("pld-vervangers-list");
    var pool = model.vervFlex.slice().sort(function (a, b) { return F.mwNaam(a).localeCompare(F.mwNaam(b)); });
    if (!pool.length) {
      vl.innerHTML = "";
    } else {
      vl.innerHTML = '<h3 class="md-cat-title">Flex / ZZP-pool (' + F.intl(pool.length) + ")</h3>"
        + '<div class="vl-chips">' + pool.slice(0, 40).map(function (mw) {
          return '<span class="vl-chip">' + F.escHtml(F.mwNaam(mw)) + "</span>";
        }).join("") + "</div>";
    }
  }

  async function init() {
    if (!global.ffDash) { console.error("[planner-dashboard] ffDash niet geladen"); return; }
    try { await loadAll(); render(); } catch (e) { console.error("[planner-dashboard] laden mislukt", e); }
    var btn = $("md-refresh");
    if (btn) btn.addEventListener("click", function () { loadAll().then(render).catch(function (e) { console.error(e); }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
