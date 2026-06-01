/* global window, document */
/**
 * Kilometer-afwijkingen — HR-overzicht.
 *
 * Toont afwijkingen op automatisch berekende ritten (medewerker wijzigde/
 * verwijderde een auto-rit + reden). HR handelt af na uitzoeken.
 * Bron: window.kmAfwijkingenDB (tabel kilometer_afwijkingen).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var state = { search: "", showDone: false };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nlNum(n) {
    if (n == null || n === "") return "—";
    var v = Math.round(Number(n) * 10) / 10;
    return isFinite(v) ? String(v).replace(".", ",") + " km" : "—";
  }
  function nlDate(iso) {
    if (!iso) return "—";
    var s = String(iso).slice(0, 10), p = s.split("-");
    return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : s;
  }
  function mwNaam(mwId) {
    if (!mwId || !window.medewerkersDB || !window.medewerkersDB.getByIdSync) return "Onbekend";
    var m = window.medewerkersDB.getByIdSync(mwId);
    if (!m) return "Onbekend";
    return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "Onbekend";
  }
  function currentProfileId() {
    try {
      if (window.profilesDB && window.profilesDB.getCurrentSync) {
        var p = window.profilesDB.getCurrentSync();
        if (p && p.id) return p.id;
      }
    } catch (e) { /* */ }
    return (window.besaCurrentProfile && window.besaCurrentProfile.id) || null;
  }

  function rows() {
    var all = (window.kmAfwijkingenDB && window.kmAfwijkingenDB.getAllSync)
      ? window.kmAfwijkingenDB.getAllSync() : [];
    return all.filter(function (a) {
      if (!state.showDone && a.status !== "open") return false;
      if (state.search) {
        return mwNaam(a.medewerkerId).toLowerCase().indexOf(state.search.toLowerCase()) >= 0;
      }
      return true;
    });
  }

  function render() {
    var tbody = $("kmafw-tbody"), empty = $("kmafw-empty");
    if (!tbody) return;
    var list = rows();
    if (!list.length) {
      tbody.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var html = "";
    list.forEach(function (a) {
      var done = a.status === "afgehandeld";
      var nieuw = a.actie === "verwijderd" ? '<span class="kmafw-del">verwijderd</span>' : esc(nlNum(a.kmNieuw));
      html += "<tr>";
      html += "<td>" + esc(mwNaam(a.medewerkerId)) + "</td>";
      html += "<td>" + esc(nlDate(a.datum)) + "</td>";
      html += "<td>" + esc(a.locatie || "—") + "</td>";
      html += "<td>" + esc(a.actie) + "</td>";
      html += "<td>" + esc(nlNum(a.kmBerekend)) + "</td>";
      html += "<td>" + nieuw + "</td>";
      html += '<td class="kmafw-reden" title="' + esc(a.reden) + '">' + esc(a.reden || "—") + "</td>";
      html += '<td><span class="kmafw-status ' + (done ? "kmafw-status--done" : "kmafw-status--open") + '">'
        + (done ? "Afgehandeld" : "Open") + "</span></td>";
      html += "<td>" + (done ? "" : '<button type="button" class="btn-outline kmafw-handle-btn" data-id="' + esc(a.id) + '">Afgehandeld</button>') + "</td>";
      html += "</tr>";
    });
    tbody.innerHTML = html;
  }

  async function handle(id) {
    try {
      await window.kmAfwijkingenDB.markAfgehandeld(id, currentProfileId());
      if (window.showActionFeedback) window.showActionFeedback("saved", "Afwijking");
    } catch (err) {
      if (window.showError) window.showError("Afhandelen mislukt: " + (err && err.message ? err.message : err));
    }
  }

  function bind() {
    var s = $("kmafw-search");
    if (s) s.addEventListener("input", function () { state.search = s.value || ""; render(); });
    var d = $("kmafw-show-done");
    if (d) d.addEventListener("change", function () { state.showDone = !!d.checked; render(); });
    var tb = $("kmafw-tbody");
    if (tb) tb.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".kmafw-handle-btn") : null;
      if (btn) handle(btn.getAttribute("data-id"));
    });
    window.addEventListener("besa:km-afwijkingen-updated", render);
    window.addEventListener("besa:medewerkers-updated", render);
  }

  async function boot() {
    bind();
    var waits = [];
    if (window.medewerkersDB && window.medewerkersDB.ready) waits.push(window.medewerkersDB.ready);
    if (window.kmAfwijkingenDB && window.kmAfwijkingenDB.ready) waits.push(window.kmAfwijkingenDB.ready);
    try { await Promise.all(waits); } catch (e) { /* */ }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
