/* global window, document, zzpFacturenDB, profilesDB */
/**
 * mijn-proforma-facturen.js — ZZP self-service: lijst van EIGEN proforma-facturen
 * (gefilterd op de ingelogde medewerker; RLS dwingt dit ook server-side af).
 * Klik op een factuur → detail/editor (zzp-factuur-detail).
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
  function fmtDatumNL(d) {
    if (!d) return "";
    var dt = new Date(d); if (isNaN(dt.getTime())) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(dt.getDate()) + "-" + p(dt.getMonth() + 1) + "-" + dt.getFullYear();
  }
  function ymLabel(ym) {
    if (!ym) return "";
    var p = ym.split("-"); var m = parseInt(p[1], 10);
    return (MAANDEN[m - 1] ? MAANDEN[m - 1].charAt(0).toUpperCase() + MAANDEN[m - 1].slice(1) : p[1]) + " " + p[0];
  }

  function ownFacs() {
    var mij = zzpFacturenDB.currentMedewerkerId && zzpFacturenDB.currentMedewerkerId();
    return (zzpFacturenDB.getAllSync() || []).filter(function (f) {
      return f && !f.archived && f.medewerkerId && mij && String(f.medewerkerId) === String(mij);
    });
  }

  function render() {
    var tb = $("mp-tbody"); if (!tb) return;
    var facs = ownFacs();
    if (!facs.length) {
      tb.innerHTML = '<tr><td colspan="6" class="table-empty">Je hebt nog geen proforma-facturen. Zodra je gepland staat, verschijnen ze hier rond de 1e van de maand.</td></tr>';
      return;
    }
    facs.sort(function (a, b) { if (a.ym !== b.ym) return a.ym < b.ym ? 1 : -1; return b.proformaBedrag - a.proformaBedrag; });
    var html = "", lastYm = null;
    facs.forEach(function (f) {
      if (f.ym !== lastYm) { lastYm = f.ym; html += '<tr class="mp-monthhead"><td colspan="6">' + esc(ymLabel(f.ym)) + "</td></tr>"; }
      var lbl = STATUS_LABEL[f.status] || f.status;
      var sig = (f.heeftBedragAfwijking ? '<span class="mp-sig mp-sig--rood" title="je hebt een tarief/bedrag gewijzigd"></span>' : "") +
        (f.heeftVerwijderdeDienst ? '<span class="mp-sig mp-sig--oranje" title="je hebt een dienst verwijderd"></span>' : "");
      var betaalInfo = (f.betaaldatum && (f.status === "goedgekeurd" || f.status === "klaar_voor_betaling"))
        ? '<div style="font-size:11px;opacity:.75;margin-top:2px">Betaling op ' + esc(fmtDatumNL(f.betaaldatum)) + "</div>" : "";
      html += '<tr class="mp-row" data-id="' + esc(f.id) + '" tabindex="0">' +
        "<td>" + esc(ymLabel(f.ym)) + "</td>" +
        "<td>" + esc(f.locatie) + "</td>" +
        '<td class="mp-num">' + f.proformaDiensten + "</td>" +
        '<td class="mp-num">' + fmtUren(f.proformaUren) + "</td>" +
        '<td class="mp-num"><strong>' + fmtEur(f.proformaBedrag) + "</strong></td>" +
        '<td><span class="zf-pill zf-pill--' + esc(f.status) + '">' + esc(lbl) + "</span>" + sig + betaalInfo + "</td>" +
        "</tr>";
    });
    tb.innerHTML = html;
  }

  function openRow(tr) { var id = tr && tr.getAttribute("data-id"); if (id) location.href = "zzp-factuur-detail?id=" + encodeURIComponent(id); }

  function start() {
    var tb = $("mp-tbody");
    if (tb) {
      tb.addEventListener("click", function (e) { var tr = e.target.closest(".mp-row"); if (tr) openRow(tr); });
      tb.addEventListener("keydown", function (e) { if (e.key === "Enter") { var tr = e.target.closest(".mp-row"); if (tr) openRow(tr); } });
    }
    window.addEventListener("besa:zzp-facturen-updated", render);
    function go() { if (window.zzpFacturenDB) { zzpFacturenDB.ready.then(render); render(); } }
    if (window.profilesDB && window.profilesDB.ready) { window.profilesDB.ready.then(go); go(); }
    else go();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
