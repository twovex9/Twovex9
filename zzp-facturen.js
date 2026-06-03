/* global window, document, zzpFacturenDB */
/**
 * zzp-facturen.js — reviewer-overzicht van de FF-native ZZP-proforma-facturen.
 * Maand-selector → KPI's + per-locatie kostensplitsing + tabel. Klik op een
 * factuur → detail. "Genereer" draait genereer_zzp_proforma voor de maand
 * (idempotent). Leest uitsluitend zzpFacturenDB (één bron).
 */
(function () {
  "use strict";

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  var STATUS_LABEL = {
    klaargezet: "Klaargezet", ingediend: "Ingediend", in_behandeling: "In behandeling",
    goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen", klaar_voor_betaling: "Klaar voor betaling",
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtEur(n) { return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtUren(n) { return (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmtTarief(n) { return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function ymLabel(ym) {
    if (!ym) return "";
    var p = ym.split("-"); var m = parseInt(p[1], 10);
    return (MAANDEN[m - 1] ? MAANDEN[m - 1].charAt(0).toUpperCase() + MAANDEN[m - 1].slice(1) : p[1]) + " " + p[0];
  }

  var state = { selectedYm: null, selectedLocatie: null, search: "" };

  function activeFacs() {
    return (zzpFacturenDB.getAllSync() || []).filter(function (f) { return f && !f.archived; });
  }
  function monthsAvailable() {
    var set = {};
    activeFacs().forEach(function (f) { if (f.ym) set[f.ym] = true; });
    return Object.keys(set).sort().reverse();
  }

  function populateMonths() {
    var sel = $("zf-maand"); if (!sel) return;
    var months = monthsAvailable();
    if (!months.length) { sel.innerHTML = '<option value="">— geen —</option>'; return; }
    if (!state.selectedYm || months.indexOf(state.selectedYm) < 0) state.selectedYm = months[0];
    sel.innerHTML = months.map(function (ym) {
      return '<option value="' + ym + '"' + (ym === state.selectedYm ? " selected" : "") + ">" + esc(ymLabel(ym)) + "</option>";
    }).join("");
  }

  function monthFacs() {
    return activeFacs().filter(function (f) { return f.ym === state.selectedYm; });
  }

  function renderKpis(facs) {
    var totaal = 0, uren = 0, zzpers = {};
    var sKlaar = { n: 0, eur: 0 }, sInd = { n: 0, eur: 0 }, sOk = { n: 0, eur: 0 };
    facs.forEach(function (f) {
      totaal += f.proformaBedrag; uren += f.proformaUren;
      if (f.medewerkerNaam) zzpers[f.medewerkerNaam] = true;
      if (f.status === "klaargezet") { sKlaar.n++; sKlaar.eur += f.proformaBedrag; }
      else if (f.status === "ingediend" || f.status === "in_behandeling") { sInd.n++; sInd.eur += (f.ingediendBedrag != null ? f.ingediendBedrag : f.proformaBedrag); }
      else if (f.status === "goedgekeurd" || f.status === "klaar_voor_betaling") { sOk.n++; sOk.eur += (f.ingediendBedrag != null ? f.ingediendBedrag : f.proformaBedrag); }
    });
    $("zf-lbl-maand").textContent = state.selectedYm ? "· " + ymLabel(state.selectedYm) : "";
    $("zf-v-totaal").textContent = fmtEur(totaal);
    $("zf-sub-totaal").textContent = facs.length + " proforma" + (facs.length === 1 ? "" : "'s") +
      " · " + Object.keys(zzpers).length + " ZZP'ers · " + fmtUren(uren) + " uur";
    $("zf-v-klaar").textContent = fmtEur(sKlaar.eur); $("zf-c-klaar").textContent = sKlaar.n;
    $("zf-v-ingediend").textContent = fmtEur(sInd.eur); $("zf-c-ingediend").textContent = sInd.n;
    $("zf-v-ok").textContent = fmtEur(sOk.eur); $("zf-c-ok").textContent = sOk.n;
  }

  function renderLocStrip(facs) {
    var strip = $("zf-loc-strip"); if (!strip) return;
    var byLoc = {};
    facs.forEach(function (f) {
      var k = f.locatie || "(geen locatie)";
      if (!byLoc[k]) byLoc[k] = { naam: k, bedrag: 0, facturen: 0, diensten: 0 };
      byLoc[k].bedrag += f.proformaBedrag; byLoc[k].facturen++; byLoc[k].diensten += f.proformaDiensten;
    });
    var locs = Object.keys(byLoc).map(function (k) { return byLoc[k]; }).sort(function (a, b) { return b.bedrag - a.bedrag; });
    var totaal = facs.reduce(function (s, f) { return s + f.proformaBedrag; }, 0);
    var html = '<button type="button" class="zf-loc zf-loc--all' + (state.selectedLocatie == null ? " is-active" : "") +
      '" data-loc="" role="listitem">' +
      '<span class="zf-loc-naam">Alle locaties</span>' +
      '<span class="zf-loc-bedrag">' + fmtEur(totaal) + "</span>" +
      '<span class="zf-loc-sub">' + facs.length + " proforma's</span></button>";
    html += locs.map(function (l) {
      return '<button type="button" class="zf-loc' + (state.selectedLocatie === l.naam ? " is-active" : "") +
        '" data-loc="' + esc(l.naam) + '" role="listitem">' +
        '<span class="zf-loc-naam">' + esc(l.naam) + "</span>" +
        '<span class="zf-loc-bedrag">' + fmtEur(l.bedrag) + "</span>" +
        '<span class="zf-loc-sub">' + l.facturen + " fact. · " + l.diensten + " diensten</span></button>";
    }).join("");
    strip.innerHTML = html;
  }

  function statusPill(f) {
    var lbl = STATUS_LABEL[f.status] || f.status;
    var sig = "";
    if (f.heeftBedragAfwijking) sig += '<span class="zf-sig zf-sig--rood" title="Bedrag/tarief gewijzigd t.o.v. proforma"></span>';
    if (f.heeftVerwijderdeDienst) sig += '<span class="zf-sig zf-sig--oranje" title="Dienst verwijderd door ZZP\'er"></span>';
    return '<span class="zf-pill zf-pill--' + esc(f.status) + '">' + esc(lbl) + "</span>" + sig;
  }

  function renderTable(facs) {
    var tb = $("zf-tbody"); if (!tb) return;
    var rows = facs.slice();
    if (state.selectedLocatie != null) rows = rows.filter(function (f) { return (f.locatie || "(geen locatie)") === state.selectedLocatie; });
    var q = state.search.trim().toLowerCase();
    if (q) rows = rows.filter(function (f) {
      return (f.medewerkerNaam || "").toLowerCase().indexOf(q) >= 0 ||
        (f.bureau || "").toLowerCase().indexOf(q) >= 0 ||
        (f.locatie || "").toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) { return b.proformaBedrag - a.proformaBedrag; });

    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="table-empty">Geen proforma-facturen voor deze selectie.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (f) {
        var bureau = f.bureau ? '<span class="zf-bureau-tag" title="Via bureau">' + esc(f.bureau) + "</span>" : "";
        return '<tr class="zf-row" data-id="' + esc(f.id) + '" tabindex="0">' +
          "<td>" + esc(f.medewerkerNaam) + bureau + "</td>" +
          "<td>" + esc(f.locatie) + "</td>" +
          '<td class="zf-num">' + f.proformaDiensten + "</td>" +
          '<td class="zf-num">' + fmtUren(f.proformaUren) + "</td>" +
          '<td class="zf-num">' + fmtTarief(f.proformaTarief) + "</td>" +
          '<td class="zf-num"><strong>' + fmtEur(f.proformaBedrag) + "</strong></td>" +
          "<td>" + statusPill(f) + "</td>" +
          "</tr>";
      }).join("");
    }
    var totaal = rows.reduce(function (s, f) { return s + f.proformaBedrag; }, 0);
    $("zf-range").textContent = rows.length + " van " + facs.length;
    $("zf-foot-totaal").textContent = "Totaal weergegeven: " + fmtEur(totaal);
  }

  function renderAll() {
    populateMonths();
    var facs = monthFacs();
    // selectedLocatie opschonen als locatie niet meer voorkomt in deze maand
    if (state.selectedLocatie != null) {
      var has = facs.some(function (f) { return (f.locatie || "(geen locatie)") === state.selectedLocatie; });
      if (!has) state.selectedLocatie = null;
    }
    renderKpis(facs);
    renderLocStrip(facs);
    renderTable(facs);
    var note = $("zf-gen-note");
    if (note) {
      var gen = facs[0] && facs[0].proformaGegenereerdOp;
      note.textContent = gen ? "Gegenereerd op " + new Date(gen).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "";
    }
  }

  function toast(msg) {
    var t = $("zf-toast"); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function selectMonthDelta(delta) {
    var months = monthsAvailable(); if (!months.length) return;
    var i = months.indexOf(state.selectedYm);
    if (i < 0) i = 0;
    var ni = i + delta;
    if (ni < 0 || ni >= months.length) return;
    state.selectedYm = months[ni]; state.selectedLocatie = null; renderAll();
  }

  async function doGenereer() {
    if (!state.selectedYm) return;
    var btn = $("zf-genereer"); var p = state.selectedYm.split("-");
    var jaar = parseInt(p[0], 10), maand = parseInt(p[1], 10);
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }
    try {
      var res = await zzpFacturenDB.genereer(jaar, maand);
      var n = (res && res.aangemaakt) || 0, ov = (res && res.overgeslagen) || 0;
      toast(n > 0 ? (n + " nieuwe proforma's aangemaakt voor " + ymLabel(state.selectedYm) + ".")
        : ("Alles was al aanwezig (" + ov + " bestaande proforma's, niets overschreven)."));
      renderAll();
    } catch (e) {
      toast("Genereren mislukt: " + (e && e.message ? e.message : e));
    } finally {
      if (btn) { btn.disabled = false; btn.style.opacity = ""; }
    }
  }

  function wire() {
    var sel = $("zf-maand");
    if (sel) sel.addEventListener("change", function () { state.selectedYm = sel.value; state.selectedLocatie = null; renderAll(); });
    var prev = $("zf-prev"), next = $("zf-next");
    if (prev) prev.addEventListener("click", function () { selectMonthDelta(1); });   // ouder = lager in lijst? lijst is desc → +1 = ouder
    if (next) next.addEventListener("click", function () { selectMonthDelta(-1); });
    var gen = $("zf-genereer");
    if (gen) gen.addEventListener("click", doGenereer);
    var search = $("zf-search");
    if (search) search.addEventListener("input", function () { state.search = search.value; renderTable(monthFacs()); });
    var strip = $("zf-loc-strip");
    if (strip) strip.addEventListener("click", function (e) {
      var btn = e.target.closest(".zf-loc"); if (!btn) return;
      var loc = btn.getAttribute("data-loc");
      state.selectedLocatie = (loc === "" ? null : loc);
      renderLocStrip(monthFacs()); renderTable(monthFacs());
    });
    var tb = $("zf-tbody");
    function openRow(tr) { var id = tr && tr.getAttribute("data-id"); if (id) location.href = "zzp-factuur-detail?id=" + encodeURIComponent(id); }
    if (tb) {
      tb.addEventListener("click", function (e) { var tr = e.target.closest(".zf-row"); if (tr) openRow(tr); });
      tb.addEventListener("keydown", function (e) { if (e.key === "Enter") { var tr = e.target.closest(".zf-row"); if (tr) openRow(tr); } });
    }
    window.addEventListener("besa:zzp-facturen-updated", renderAll);
  }

  function start() {
    wire();
    if (window.zzpFacturenDB) {
      zzpFacturenDB.ready.then(renderAll);
      renderAll(); // direct uit cache (snel), daarna ververst bootstrap
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
