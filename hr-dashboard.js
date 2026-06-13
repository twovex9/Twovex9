/* global window, document */
/**
 * hr-dashboard.js — HR-stuurdashboard. Leest medewerkers + verzuim rechtstreeks uit
 * de productie-Supabase (via window.ffDash) en toont:
 *   - Personeelssamenstelling: totaal · loondienst vs zzp · stage · verhouding;
 *   - In- en uitstroom: nieuwe medewerkers · uit dienst · contracten die aflopen;
 *   - Documenten, VOG & certificering: documentstatus (groen/oranje/rood);
 *   - Ziekteverzuim: percentage + actieve ziekmeldingen + per locatie;
 *   - Verdeling medewerkers per locatie en per functie.
 *
 * Alle cijfers live; geen schrijf-acties.
 */
(function (global) {
  "use strict";

  var F = global.ffDash;
  function $(id) { return document.getElementById(id); }
  var model = null;

  async function loadAll() {
    var res = await Promise.allSettled([
      F.select("medewerkers", { select: "voornaam,achternaam,dienstverband,functie,fase,archived,data" }),
      F.select("verzuim", { select: "status,werkelijke_terug,medewerker,eerst_ziektedag,verwachte_terug,type" }),
    ]);
    var medewerkers = res[0].status === "fulfilled" ? res[0].value : [];
    var verzuim = res[1].status === "fulfilled" ? res[1].value : [];
    model = buildModel(medewerkers, verzuim);
    return model;
  }

  function isUitDienst(mw) {
    return String(mw.fase || F.mwData(mw).fase || "").toLowerCase().indexOf("uit dienst") !== -1;
  }

  function buildModel(medewerkers, verzuim) {
    var actief = medewerkers.filter(F.mwActief);
    var samenstelling = { totaal: actief.length, loondienst: 0, zzp: 0, stage: 0 };
    var perLoc = {}, perFunctie = {};
    var docs = { green: 0, orange: 0, red: 0, onbekend: 0, ontbrekend: 0, waarschuwing: 0, fouten: 0 };
    var nieuw90 = [], contractAflopen = [];

    actief.forEach(function (mw) {
      var d = F.mwData(mw);
      var klasse = F.classifyDienstverband(mw);
      samenstelling[klasse] = (samenstelling[klasse] || 0) + 1;

      // Verdeling locatie
      F.mwLocaties(mw).forEach(function (ln) { perLoc[ln] = (perLoc[ln] || 0) + 1; });
      // Verdeling functie
      var fn = String((mw.functie || d.functie || "") || "Onbekend").trim() || "Onbekend";
      if (fn === "—") fn = "Onbekend";
      perFunctie[fn] = (perFunctie[fn] || 0) + 1;

      // Documentstatus
      var st = (d.bs2_doc_status && d.bs2_doc_status.status) || "";
      if (st === "green") docs.green++;
      else if (st === "orange" || st === "yellow") docs.orange++;
      else if (st === "red") docs.red++;
      else docs.onbekend++;
      if (d.bs2_has_required_documents === false) docs.ontbrekend++;
      if (d.bs2_has_warnings) docs.waarschuwing++;
      if (d.bs2_has_errors) docs.fouten++;

      // Nieuwe medewerkers (in dienst < 90 dagen)
      var startV = d.startdatum || d.bs2_start_date || d.inDienst;
      var startD = F.parseDate(startV);
      if (startD) {
        var dagenIn = Math.round((Date.now() - startD.getTime()) / 86400000);
        if (dagenIn >= 0 && dagenIn <= 90) nieuw90.push({ naam: F.mwNaam(mw), datum: startD, dagen: dagenIn, functie: fn });
      }
      // Contracten die aflopen
      var einde = d.eindeContract || d.uitDienst;
      var dagenTot = F.daysFromNow(einde);
      if (dagenTot != null && dagenTot >= 0 && dagenTot <= 365) {
        contractAflopen.push({ naam: F.mwNaam(mw), datum: F.parseDate(einde), dagen: dagenTot, type: d.contracttype || "", functie: fn });
      }
    });

    var uitDienst = medewerkers.filter(isUitDienst);

    // Verzuim
    var verzuimActief = verzuim.filter(function (v) { return v.status === "Actief" && !v.werkelijke_terug; });
    var mwLocByNaam = {};
    actief.forEach(function (mw) { mwLocByNaam[F.mwNaam(mw).toLowerCase()] = F.mwLocaties(mw); });
    var verzuimPerLoc = {};
    verzuimActief.forEach(function (v) {
      (mwLocByNaam[String(v.medewerker || "").toLowerCase()] || []).forEach(function (ln) { verzuimPerLoc[ln] = (verzuimPerLoc[ln] || 0) + 1; });
    });
    var verzuimPct = samenstelling.totaal ? (verzuimActief.length / samenstelling.totaal) * 100 : 0;

    nieuw90.sort(function (a, b) { return b.datum - a.datum; });
    contractAflopen.sort(function (a, b) { return a.dagen - b.dagen; });

    return {
      samenstelling: samenstelling, perLoc: perLoc, perFunctie: perFunctie, docs: docs,
      nieuw90: nieuw90, contractAflopen: contractAflopen, uitDienst: uitDienst,
      verzuimActief: verzuimActief, verzuimPct: verzuimPct, verzuimPerLoc: verzuimPerLoc,
      contract30: contractAflopen.filter(function (c) { return c.dagen <= 30; }).length,
      contract90: contractAflopen.filter(function (c) { return c.dagen <= 90; }).length,
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
  function fmtDate(d) { try { return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function verhoudingBar(a, b) {
    var tot = a + b || 1; var pa = Math.round((a / tot) * 100);
    return '<span class="vl-split"><span class="vl-split-bar"><span class="vl-split-a" style="width:' + pa + '%"></span></span>'
      + '<span class="vl-split-lbl">' + pa + "% loondienst · " + (100 - pa) + "% zzp</span></span>";
  }
  function catList(box, titel, obj, opts) {
    opts = opts || {};
    var keys = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    if (opts.limit) keys = keys.slice(0, opts.limit);
    var max = keys.reduce(function (m, k) { return Math.max(m, obj[k]); }, 0) || 1;
    box.innerHTML = '<h3 class="md-cat-title">' + F.escHtml(titel) + "</h3>"
      + keys.map(function (k) {
        var w = Math.round((obj[k] / max) * 100);
        return '<div class="md-cat-row"><span class="md-cat-lbl">' + F.escHtml(k) + "</span>"
          + '<span class="md-cat-bar"><span class="md-cat-fill" style="width:' + w + '%"></span></span>'
          + '<span class="md-cat-val">' + F.intl(obj[k]) + "</span></div>";
      }).join("");
  }

  function render() {
    if (!model) return;
    var s = model.samenstelling;
    var zzpPct = s.totaal ? Math.round((s.zzp / s.totaal) * 100) : 0;

    // Quickstats
    $("hrd-qs-totaal").textContent = F.intl(s.totaal);
    $("hrd-qs-verzuim").textContent = F.pct(model.verzuimPct, 1);
    var docAandacht = model.docs.orange + model.docs.red;
    $("hrd-qs-docs").textContent = F.intl(docAandacht);

    // Datum
    try { $("md-date").textContent = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { /* */ }

    // Samenstelling
    $("hrd-sam-grid").innerHTML = [
      metric("Totaal medewerkers", F.intl(s.totaal), F.intl(s.loondienst) + " loondienst · " + F.intl(s.zzp) + " zzp/inhuur · " + F.intl(s.stage) + " stage"),
      metric("Loondienst", F.intl(s.loondienst), F.pct(s.totaal ? (s.loondienst / s.totaal) * 100 : 0) + " van het totaal"),
      metric("ZZP / inhuur", F.intl(s.zzp), F.pct(zzpPct) + " van het totaal", zzpPct >= 60 ? "oranje" : null),
      metric("Verhouding loondienst : zzp", verhoudingBar(s.loondienst, s.zzp), ""),
    ].join("");

    // In/uitstroom
    $("hrd-stroom-grid").innerHTML = [
      metric("Nieuwe medewerkers", F.intl(model.nieuw90.length), "in dienst < 90 dagen"),
      metric("Uit dienst", F.intl(model.uitDienst.length), "fase “Uit dienst”"),
      metric("Contracten aflopen", F.intl(model.contract90), F.intl(model.contract30) + " binnen 30 dagen", model.contract30 > 0 ? "rood" : model.contract90 > 0 ? "oranje" : "groen"),
    ].join("");
    var cb = $("hrd-contracten");
    if (!model.contractAflopen.length) {
      cb.innerHTML = '<h3 class="md-cat-title">Eerstvolgende aflopende contracten</h3><p class="md-news-empty">Geen contracten die binnen 12 maanden aflopen.</p>';
    } else {
      cb.innerHTML = '<h3 class="md-cat-title">Eerstvolgende aflopende contracten (12 mnd)</h3><div class="vl-krit-list">'
        + model.contractAflopen.slice(0, 10).map(function (c) {
          var st = c.dagen <= 30 ? "rood" : c.dagen <= 90 ? "oranje" : "groen";
          var btn = window.ffOplossen ? window.ffOplossen.navBtn("hr", "Naar HR", "Verleng of werk het aflopende contract van " + c.naam + " bij in HR.") : "";
          return '<div class="vl-krit-item">' + dot(st) + '<span class="vl-krit-loc">' + F.escHtml(c.naam) + "</span>"
            + '<span class="vl-krit-type">' + F.escHtml(c.functie) + (c.type ? " · " + F.escHtml(c.type) : "") + "</span>"
            + '<span class="vl-krit-tijd">' + fmtDate(c.datum) + " · over " + F.intl(c.dagen) + " dagen</span>"
            + btn + "</div>";
        }).join("") + "</div>";
      if (window.ffOplossen) window.ffOplossen.bindSignals(cb);
    }

    // Documenten / VOG
    $("hrd-docs-grid").innerHTML = [
      metric("Documentstatus groen", F.intl(model.docs.green), "compleet", "groen"),
      metric("Documentstatus oranje", F.intl(model.docs.orange), "waarschuwing / bijna verlopen", model.docs.orange > 0 ? "oranje" : null),
      metric("Documentstatus rood", F.intl(model.docs.red), "ontbrekend / verlopen", model.docs.red > 0 ? "rood" : null),
      metric("Ontbrekende verplichte docs", F.intl(model.docs.ontbrekend), F.intl(model.docs.waarschuwing) + " met waarschuwing", model.docs.ontbrekend > 0 ? "rood" : null),
    ].join("");

    // Verzuim
    $("hrd-verzuim-grid").innerHTML = [
      metric("Ziekteverzuim", F.pct(model.verzuimPct, 1), F.intl(model.verzuimActief.length) + " actieve ziekmelding(en)", F.statusClass(F.vlVerzuim(model.verzuimPct)).replace("md--", "")),
      metric("Actieve ziekmeldingen", F.intl(model.verzuimActief.length), F.intl(model.verzuimActief.filter(function (v) { return v.type === "lang"; }).length) + " langdurig"),
    ].join("");
    var vb = $("hrd-verzuim-list");
    if (!model.verzuimActief.length) {
      vb.innerHTML = '<h3 class="md-cat-title">Actieve ziekmeldingen</h3><p class="md-news-empty">Geen actieve ziekmeldingen.</p>';
    } else {
      vb.innerHTML = '<h3 class="md-cat-title">Actieve ziekmeldingen</h3><div class="vl-krit-list">'
        + model.verzuimActief.map(function (v) {
          var st = v.type === "lang" ? "rood" : "oranje";
          var sinds = F.parseDate(v.eerst_ziektedag);
          var btn = window.ffOplossen ? window.ffOplossen.navBtn("hr", "Naar HR", "Bekijk de ziekmelding van " + (v.medewerker || "deze medewerker") + " en werk het verzuim bij in HR.") : "";
          return '<div class="vl-krit-item">' + dot(st) + '<span class="vl-krit-loc">' + F.escHtml(v.medewerker || "—") + "</span>"
            + '<span class="vl-krit-type">' + (v.type === "lang" ? "Langdurig" : "Kortdurend") + "</span>"
            + '<span class="vl-krit-tijd">' + (sinds ? "sinds " + fmtDate(sinds) : "") + "</span>"
            + btn + "</div>";
        }).join("") + "</div>";
      if (window.ffOplossen) window.ffOplossen.bindSignals(vb);
    }

    // Verdeling
    catList($("hrd-loc"), "Per locatie", model.perLoc, {});
    catList($("hrd-functie"), "Per functie", model.perFunctie, { limit: 10 });
  }

  async function init() {
    if (!global.ffDash) { console.error("[hr-dashboard] ffDash niet geladen"); return; }
    try { await loadAll(); render(); } catch (e) { console.error("[hr-dashboard] laden mislukt", e); }
    var btn = $("md-refresh");
    if (btn) btn.addEventListener("click", function () { loadAll().then(render).catch(function (e) { console.error(e); }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
