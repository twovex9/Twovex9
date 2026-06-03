/* global window, document, zzpFacturenDB */
/**
 * zzp-factuur-detail.js — detail van één FF-native ZZP-proforma-factuur.
 * Fase 1: toont de proforma (kop + totalen + diensten als regels).
 * (Fase 2 = ZZP-bewerken; fase 3 = side-by-side proforma ↔ ingediend.)
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
  function ymLabel(jaar, maand) {
    if (jaar == null || maand == null) return "";
    return (MAANDEN[maand - 1] ? MAANDEN[maand - 1].charAt(0).toUpperCase() + MAANDEN[maand - 1].slice(1) : maand) + " " + jaar;
  }
  function fmtDate(d) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : d; }
  function fmtTime(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }); }
    catch (e) { return ""; }
  }

  function getParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }

  function render(detail) {
    if (!detail || !detail.factuur) {
      $("zd-titel").textContent = "Proforma-factuur niet gevonden";
      $("zd-meta").innerHTML = '<span>Deze factuur bestaat niet of is niet (meer) beschikbaar.</span>';
      return;
    }
    var f = detail.factuur, regels = detail.regels || [];

    $("zd-titel").textContent = f.medewerkerNaam || "Proforma-factuur";
    var metaBits = [];
    metaBits.push("<span><strong>" + esc(f.locatie || "—") + "</strong> · locatie</span>");
    metaBits.push("<span><strong>" + esc(ymLabel(f.jaar, f.maand)) + "</strong> · werk-maand</span>");
    if (f.bureau) metaBits.push("<span>via bureau <strong>" + esc(f.bureau) + "</strong></span>");
    else metaBits.push("<span>directe ZZP'er</span>");
    if (f.eigenFactuurnummer) metaBits.push("<span>factuurnr. <strong>" + esc(f.eigenFactuurnummer) + "</strong></span>");
    $("zd-meta").innerHTML = metaBits.join("");

    var lbl = STATUS_LABEL[f.status] || f.status;
    $("zd-status-wrap").innerHTML = '<span class="zf-pill zf-pill--' + esc(f.status) + '">' + esc(lbl) + "</span>";

    $("zd-totaal").textContent = fmtEur(f.proformaBedrag);
    $("zd-uren").textContent = fmtUren(f.proformaUren);
    $("zd-tarief").textContent = fmtTarief(f.proformaTarief);
    $("zd-diensten").textContent = f.proformaDiensten;

    var tb = $("zd-regels");
    if (!regels.length) {
      tb.innerHTML = '<tr><td colspan="7" class="table-empty">Geen diensten in deze proforma.</td></tr>';
    } else {
      tb.innerHTML = regels.map(function (r) {
        var tijd = (fmtTime(r.startIso) && fmtTime(r.eindeIso)) ? (fmtTime(r.startIso) + "–" + fmtTime(r.eindeIso)) : "—";
        return "<tr>" +
          "<td>" + esc(r.dag || "") + "</td>" +
          "<td>" + esc(fmtDate(r.datum)) + "</td>" +
          "<td>" + tijd + "</td>" +
          '<td class="zd-num">' + (r.pauzeUren ? fmtUren(r.pauzeUren) : "—") + "</td>" +
          '<td class="zd-num">' + fmtUren(r.proformaUren) + "</td>" +
          '<td class="zd-num">' + fmtTarief(r.proformaTarief) + "</td>" +
          '<td class="zd-num"><strong>' + fmtEur(r.proformaBedrag) + "</strong></td>" +
          "</tr>";
      }).join("");
    }
    var totUren = regels.reduce(function (s, r) { return s + (r.proformaUren || 0); }, 0);
    var totBedrag = regels.reduce(function (s, r) { return s + (r.proformaBedrag || 0); }, 0);
    $("zd-foot-uren").textContent = fmtUren(totUren);
    $("zd-foot-bedrag").textContent = fmtEur(totBedrag);
  }

  async function start() {
    var id = getParam("id");
    if (!id) { render(null); return; }
    if (!window.zzpFacturenDB) return;
    try {
      var detail = await zzpFacturenDB.getDetail(id);
      render(detail);
    } catch (e) {
      render(null);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
