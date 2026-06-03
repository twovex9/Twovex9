/* global window, document, zzpFacturenDB */
/**
 * zzp-reconciliatie.js — per maand, per locatie + totaal: verwacht (planning) vs
 * ingediend / goedgekeurd / afgewezen / nog-te-verwachten. Read-only (RPC zzp_reconciliatie).
 */
(function () {
  "use strict";
  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtEur(n) { return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ymLabel(jaar, maand) { return (MAANDEN[maand - 1] ? MAANDEN[maand - 1].charAt(0).toUpperCase() + MAANDEN[maand - 1].slice(1) : maand) + " " + jaar; }

  var state = { jaar: null, maand: null, months: [], busy: false };

  function ymKey(j, m) { return j * 100 + m; }

  function populateMonths() {
    var sel = $("zr-maand"); if (!sel) return;
    sel.innerHTML = state.months.map(function (mm) {
      var on = mm.jaar === state.jaar && mm.maand === state.maand;
      return '<option value="' + mm.jaar + "-" + mm.maand + '"' + (on ? " selected" : "") + ">" + esc(ymLabel(mm.jaar, mm.maand)) + "</option>";
    }).join("");
  }

  function locCell(eur, cnt, cls) {
    return '<td class="zr-num"><span' + (cls ? ' class="' + cls + '"' : "") + ">" + fmtEur(eur) + "</span>" +
      (cnt != null && cnt > 0 ? ' <span class="zr-cnt">(' + cnt + ")</span>" : "") + "</td>";
  }

  function render(data) {
    state.jaar = data.jaar; state.maand = data.maand;
    state.months = data.months || [];
    populateMonths();
    var t = data.totaal || {};
    $("zr-lbl").textContent = "· " + ymLabel(data.jaar, data.maand);
    $("zr-verwacht").textContent = fmtEur(t.verwacht);
    $("zr-verwacht-sub").textContent = (t.facturen || 0) + " proforma's";
    $("zr-rest").textContent = fmtEur(t.nog_te_verwachten);
    $("zr-ingediend").textContent = fmtEur(t.ingediend);
    $("zr-ingediend-cnt").textContent = t.ingediend_cnt || 0;
    $("zr-goedgekeurd").textContent = fmtEur(t.goedgekeurd);
    $("zr-goedgekeurd-cnt").textContent = t.goedgekeurd_cnt || 0;
    $("zr-afgewezen").textContent = fmtEur(t.afgewezen);
    $("zr-afgewezen-cnt").textContent = t.afgewezen_cnt || 0;

    var tb = $("zr-tbody");
    var locs = data.per_locatie || [];
    if (!locs.length) {
      tb.innerHTML = '<tr><td colspan="6" class="table-empty">Geen proforma-facturen voor deze maand.</td></tr>';
      return;
    }
    var html = locs.map(function (l) {
      return "<tr><td>" + esc(l.locatie) + "</td>" +
        locCell(l.verwacht) +
        locCell(l.ingediend, l.ingediend_cnt, "zr-ok") +
        locCell(l.goedgekeurd, l.goedgekeurd_cnt, "zr-ok") +
        locCell(l.afgewezen, l.afgewezen_cnt, l.afgewezen > 0 ? "zr-no" : "") +
        locCell(l.nog_te_verwachten, null, l.nog_te_verwachten > 0 ? "zr-rest" : "") +
        "</tr>";
    }).join("");
    html += '<tr class="zr-tot"><td>Totaal</td>' +
      locCell(t.verwacht) + locCell(t.ingediend, t.ingediend_cnt) + locCell(t.goedgekeurd, t.goedgekeurd_cnt) +
      locCell(t.afgewezen, t.afgewezen_cnt) + locCell(t.nog_te_verwachten) + "</tr>";
    tb.innerHTML = html;
  }

  async function load(jaar, maand) {
    if (state.busy) return;
    state.busy = true;
    try {
      var data = await zzpFacturenDB.getReconciliatie(jaar, maand);
      render(data);
    } catch (e) {
      $("zr-tbody").innerHTML = '<tr><td colspan="6" class="table-empty">Laden mislukt: ' + esc(e && e.message ? e.message : e) + "</td></tr>";
    } finally { state.busy = false; }
  }

  function stepMonth(delta) {
    var idx = state.months.findIndex(function (mm) { return mm.jaar === state.jaar && mm.maand === state.maand; });
    if (idx < 0) return;
    // months zijn nieuwste-eerst → "vorige" (ouder) = idx+1
    var ni = idx - delta;
    if (ni < 0 || ni >= state.months.length) return;
    var mm = state.months[ni];
    load(mm.jaar, mm.maand);
  }

  function wire() {
    var sel = $("zr-maand");
    if (sel) sel.addEventListener("change", function () { var p = sel.value.split("-"); load(parseInt(p[0], 10), parseInt(p[1], 10)); });
    var prev = $("zr-prev"), next = $("zr-next");
    if (prev) prev.addEventListener("click", function () { stepMonth(-1); }); // ouder
    if (next) next.addEventListener("click", function () { stepMonth(1); });  // nieuwer
  }

  function start() {
    wire();
    if (window.zzpFacturenDB) {
      if (window.besaSupabaseReady) window.besaSupabaseReady.then(function () { load(null, null); });
      else load(null, null);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
