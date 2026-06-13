/* global window, document, zzpFacturenDB */
/**
 * zzp-overuren.js — teamleider beoordeelt uren-wijzigingen van ZZP'ers.
 * Goedkeuren → de dienst-eindtijd in de planning wordt gericht aangepast (omkeerbaar);
 * Afwijzen (reden) → de uren gaan terug naar de planning-waarde.
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
  function fmtUren(n) { return (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function ymLabel(jaar, maand) { return (MAANDEN[maand - 1] ? MAANDEN[maand - 1].charAt(0).toUpperCase() + MAANDEN[maand - 1].slice(1) : maand) + " " + jaar; }
  function fmtDate(d) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : d; }
  function toast(msg) { var t = $("zo-toast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 3400); }

  var state = { items: [], busy: false };

  async function laad() {
    try {
      var res = await zzpFacturenDB.getOpenOveruren();
      if (res && res.unauthorized) {
        $("zo-tbody").innerHTML = '<tr><td colspan="7" class="zo-empty">Je hebt geen rechten om uren-wijzigingen te beoordelen (alleen zorgcoördinator, planner of directeur).</td></tr>';
        return;
      }
      state.items = (res && res.items) || [];
      render();
    } catch (e) {
      $("zo-tbody").innerHTML = '<tr><td colspan="7" class="zo-empty">Laden mislukt: ' + esc(e && e.message ? e.message : e) + "</td></tr>";
    }
  }

  function render() {
    var tb = $("zo-tbody"), intro = $("zo-intro");
    if (!state.items.length) {
      tb.innerHTML = '<tr><td colspan="7" class="zo-empty">Geen openstaande uren-wijzigingen. 👍</td></tr>';
      if (intro) intro.textContent = "";
      return;
    }
    if (intro) intro.textContent = state.items.length + " uren-wijziging(en) wachten op je akkoord.";
    tb.innerHTML = state.items.map(function (it) {
      var bureau = it.bureau ? '<span class="zo-bureau">' + esc(it.bureau) + "</span>" : "";
      var verschil = Number(it.verschil) || 0;
      var vCls = verschil > 0 ? "zo-meer" : (verschil < 0 ? "zo-minder" : "");
      var vTxt = (verschil > 0 ? "+" : "") + fmtUren(verschil) + " u";
      return '<tr data-rid="' + esc(it.regel_id) + '">' +
        "<td>" + esc(it.medewerker || "—") + bureau + "</td>" +
        "<td>" + esc(it.locatie || "—") + "</td>" +
        "<td>" + esc(it.dag || "") + " " + esc(fmtDate(it.datum)) + " <span style=\"color:var(--text-muted,#64748b)\">· " + esc(ymLabel(it.jaar, it.maand)) + "</span></td>" +
        '<td class="zo-num">' + fmtUren(it.proforma_uren) + " u</td>" +
        '<td class="zo-num">' + fmtUren(it.ingediend_uren) + " u</td>" +
        '<td class="zo-num ' + vCls + '">' + vTxt + "</td>" +
        '<td><div class="zo-act"><button type="button" class="zo-btn zo-btn--no" data-act="afwijzen" data-rid="' + esc(it.regel_id) + '">Afwijzen</button>' +
        '<button type="button" class="zo-btn zo-btn--ok" data-act="goedkeuren" data-rid="' + esc(it.regel_id) + '">Goedkeuren</button></div></td>' +
        "</tr>";
    }).join("");
  }

  async function beoordeel(rid, actie, reden) {
    if (state.busy) return;
    state.busy = true;
    try {
      await zzpFacturenDB.overurenBeoordelen(rid, actie, reden);
      toast(actie === "goedkeuren" ? "Goedgekeurd — planning bijgewerkt." : "Afgewezen — geplande uren blijven gelden.");
      await laad();
    } catch (e) { toast("Mislukt: " + (e && e.message ? e.message : e)); }
    finally { state.busy = false; }
  }

  function startAfwijzen(tr, rid) {
    if (tr.querySelector(".zo-reden")) return;
    var cell = tr.lastElementChild;
    var div = document.createElement("div");
    div.className = "zo-reden";
    div.innerHTML = '<input type="text" placeholder="Reden (de ZZP\'er ziet deze)" aria-label="Reden" />' +
      '<button type="button" class="zo-btn zo-btn--ok">Bevestig</button>';
    cell.appendChild(div);
    var inp = div.querySelector("input");
    inp.focus();
    div.querySelector("button").addEventListener("click", function () {
      var reden = (inp.value || "").trim();
      if (!reden) { toast("Geef een reden op."); inp.focus(); return; }
      beoordeel(rid, "afwijzen", reden);
    });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { var reden = (inp.value || "").trim(); if (reden) beoordeel(rid, "afwijzen", reden); } });
  }

  function wire() {
    var tb = $("zo-tbody");
    if (tb) tb.addEventListener("click", function (e) {
      var btn = e.target.closest(".zo-btn[data-act]"); if (!btn) return;
      var rid = btn.getAttribute("data-rid"), act = btn.getAttribute("data-act");
      if (act === "goedkeuren") beoordeel(rid, "goedkeuren", null);
      else startAfwijzen(btn.closest("tr"), rid);
    });
  }

  function start() {
    wire();
    if (window.zzpFacturenDB) {
      if (window.ffSupabaseReady) window.ffSupabaseReady.then(laad); else laad();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
