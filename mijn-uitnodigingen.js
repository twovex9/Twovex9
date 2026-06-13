/* global window, document */
/**
 * mijn-uitnodigingen.js — ZZP self-service: openstaande uitnodigingen van de
 * ingelogde medewerker. Accepteren (→ je staat ingepland) of weigeren, via de
 * SECURITY DEFINER RPC dienst_uitnodiging_antwoord (planners worden gemeld).
 */
(function () {
  "use strict";
  var NL_DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  var NL_MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtDatum(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return "";
    return NL_DAG[d.getDay()] + " " + d.getDate() + " " + NL_MND[d.getMonth()] + " " + d.getFullYear();
  }
  function fmtTijdvak(s, e) {
    var a = new Date(s), b = new Date(e);
    if (isNaN(a.getTime())) return "";
    var sa = pad2(a.getHours()) + ":" + pad2(a.getMinutes());
    if (isNaN(b.getTime())) return sa;
    return sa + "–" + pad2(b.getHours()) + ":" + pad2(b.getMinutes());
  }

  var meId = null;
  var rowsCache = [];

  function setEmpty(msg) {
    var tb = $("mu-tbody"); if (tb) tb.innerHTML = '<tr><td colspan="4" class="table-empty">' + esc(msg) + "</td></tr>";
  }

  async function load() {
    var tb = $("mu-tbody"); if (!tb) return;
    var prof = window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync();
    meId = prof && prof.medewerkerId;
    if (!meId) { setEmpty("Je account is niet aan een medewerker gekoppeld. Vraag de planner om je te koppelen."); return; }
    if (!window.dienstUitnodigingenDB || !window.dienstUitnodigingenDB.fetchVoorMedewerker) { setEmpty("Kon uitnodigingen niet laden."); return; }

    var invs = await window.dienstUitnodigingenDB.fetchVoorMedewerker(meId, ["uitgenodigd"]);
    if (!invs.length) { rowsCache = []; setEmpty("Je hebt op dit moment geen openstaande uitnodigingen."); return; }

    var ids = invs.map(function (x) { return x.dienst_id; });
    var planById = {};
    try {
      var r = await window.ffSupabase.from("planning")
        .select("id, start_iso, einde_iso, diensttype, locatie, client, teamlid")
        .in("id", ids);
      if (!r.error) (r.data || []).forEach(function (p) { planById[p.id] = p; });
    } catch (e) { console.error("[mijn-uitnodigingen] planning-join mislukt:", e); }

    rowsCache = invs
      .map(function (inv) { return { inv: inv, dienst: planById[inv.dienst_id] || null }; })
      .filter(function (x) { return x.dienst; });
    render();
  }

  function render() {
    var tb = $("mu-tbody"); if (!tb) return;
    if (!rowsCache.length) { setEmpty("Je hebt op dit moment geen openstaande uitnodigingen."); return; }
    rowsCache.sort(function (a, b) { return new Date(a.dienst.start_iso) - new Date(b.dienst.start_iso); });
    tb.innerHTML = rowsCache.map(function (x) {
      var d = x.dienst;
      return '<tr data-dienst="' + esc(d.id) + '">' +
        "<td>" + esc(fmtDatum(d.start_iso)) + ' <span class="mu-time">' + esc(fmtTijdvak(d.start_iso, d.einde_iso)) + "</span></td>" +
        "<td>" + esc(d.diensttype || "Dienst") + (x.inv.notitie ? '<div class="mu-note">' + esc(x.inv.notitie) + "</div>" : "") + "</td>" +
        "<td>" + esc(d.locatie || "") + "</td>" +
        '<td class="mu-actions">' +
          '<button type="button" class="btn-primary mu-btn" data-act="toegewezen">Accepteren</button>' +
          '<button type="button" class="btn-outline mu-btn" data-act="geweigerd">Weigeren</button>' +
        "</td></tr>";
    }).join("");
  }

  async function answer(dienstId, keuze, tr) {
    var btns = tr.querySelectorAll("button"); btns.forEach(function (b) { b.disabled = true; });
    try {
      var res = await window.dienstUitnodigingenDB.antwoord(dienstId, keuze);
      var titel = keuze === "toegewezen" ? "Geaccepteerd" : "Geweigerd";
      var msg = keuze === "toegewezen"
        ? (res && res.already_taken ? "Geaccepteerd, maar de dienst was al door iemand anders bezet." : "Je staat nu ingepland voor deze dienst.")
        : "Je hebt de uitnodiging geweigerd.";
      if (window.showActionFeedback) window.showActionFeedback("saved", titel, msg);
      rowsCache = rowsCache.filter(function (x) { return x.dienst.id !== dienstId; });
      render();
    } catch (e) {
      btns.forEach(function (b) { b.disabled = false; });
      if (window.showError) window.showError("Kon niet verwerken: " + (e && e.message ? e.message : e));
    }
  }

  function start() {
    var tb = $("mu-tbody");
    if (tb) {
      tb.addEventListener("click", function (e) {
        var b = e.target.closest(".mu-btn"); if (!b) return;
        var tr = b.closest("tr"); var id = tr && tr.getAttribute("data-dienst");
        if (id) answer(id, b.getAttribute("data-act"), tr);
      });
    }
    function go() { load(); }
    if (window.profilesDB && window.profilesDB.ready) { window.profilesDB.ready.then(go); go(); }
    else go();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
