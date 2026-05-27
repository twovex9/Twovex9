/* global window, document */
/**
 * planning-beheer.js — alle 5 sub-tabs van /planning/management.
 *
 * BS2-equivalent: 5 sub-pages onder /planning/management/*
 *   - availability-types → Beschikbaarheidstypes
 *   - shift-types → Diensttypes
 *   - switch-shifts → Dienstwissels
 *   - employees → Medewerkers (planning-context)
 *   - settings → Planning instellingen
 */
(function () {
  "use strict";

  var currentTab = (window.location.hash || "#availability-types").replace("#", "");
  var atEditingId = null;
  var stEditingId = null;

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".pb-tab").forEach(function (s) {
      s.hidden = s.dataset.tab !== tab;
    });
    document.querySelectorAll(".side-link").forEach(function (a) {
      a.classList.toggle("is-active", a.dataset.tab === tab);
    });
    window.location.hash = "#" + tab;
    if (tab === "availability-types") renderAT();
    if (tab === "shift-types") renderST();
    if (tab === "switch-shifts") renderSW();
    if (tab === "employees") renderEmp();
    if (tab === "settings") renderSettings();
  }

  function attachSidebar() {
    document.querySelectorAll(".side-link").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        switchTab(a.dataset.tab);
      });
    });
  }

  // ===== Beschikbaarheidstypes =====
  function renderAT() {
    var tbody = document.getElementById("pb-at-tbody");
    var search = (document.getElementById("pb-at-search").value || "").toLowerCase();
    var archived = document.getElementById("pb-at-archived").checked;
    var rows = (window.beschikbaarheidstypesDB ? window.beschikbaarheidstypesDB.getAllSync() : [])
      .filter(function (r) { return !!r.archived === archived; })
      .filter(function (r) { return !search || (r.naam || "").toLowerCase().indexOf(search) >= 0; });
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="planning-detail-empty" style="text-align:center;padding:24px">Geen resultaten gevonden</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-id="' + escapeHtml(r.id) + '"><td><input type="checkbox" /></td>'
        + '<td>' + escapeHtml(r.naam || "") + '</td>'
        + '<td>' + escapeHtml(r.starttijd || "") + '</td>'
        + '<td>' + escapeHtml(r.eindtijd || "") + '</td>'
        + '<td class="hr-row-actions">'
        + (r.archived
            ? '<button class="btn-outline hr-restore-btn" data-action="restore">Herstel</button><button class="employee-delete-btn" data-action="purge" aria-label="Definitief verwijderen">' + trashSvg() + '</button>'
            : '<button class="employee-delete-btn" data-action="archive" aria-label="Archiveren">' + trashSvg() + '</button>')
        + '</td></tr>';
    }).join("");
  }

  function attachAT() {
    document.getElementById("pb-at-add").addEventListener("click", function () { atEditingId = null; openATModal(); });
    document.getElementById("pb-at-search").addEventListener("input", renderAT);
    document.getElementById("pb-at-archived").addEventListener("change", renderAT);
    document.getElementById("pb-at-tbody").addEventListener("click", async function (e) {
      var btn = e.target.closest("button");
      var tr = e.target.closest("tr");
      if (!tr) return;
      var id = tr.dataset.id;
      if (btn) {
        var act = btn.dataset.action;
        if (act === "archive") {
          var ok = await window.showArchiveConfirm({ preview: (tr.querySelector("td:nth-child(2)") || {}).textContent });
          if (ok) { await window.beschikbaarheidstypesDB.archive(id); window.showActionFeedback && window.showActionFeedback("archived", "Beschikbaarheidstype"); }
        } else if (act === "restore") {
          await window.beschikbaarheidstypesDB.restore(id);
          window.showActionFeedback && window.showActionFeedback("restored", "Beschikbaarheidstype");
        } else if (act === "purge") {
          var ok2 = await window.showSliderConfirmModal({ title: "Definitief verwijderen?", preview: (tr.querySelector("td:nth-child(2)") || {}).textContent, okLabel: "Verwijderen", cancelLabel: "Annuleren" });
          if (ok2) { await window.beschikbaarheidstypesDB.delete(id); window.showActionFeedback && window.showActionFeedback("deleted", "Beschikbaarheidstype"); }
        }
        return;
      }
      // Row-click = edit
      atEditingId = id;
      var row = window.beschikbaarheidstypesDB.getAllSync().find(function (r) { return String(r.id) === String(id); });
      if (row) openATModal(row);
    });

    document.getElementById("pb-at-modal-close").addEventListener("click", closeATModal);
    document.getElementById("pb-at-modal-cancel").addEventListener("click", closeATModal);
    document.getElementById("pb-at-modal-save").addEventListener("click", async function () {
      var payload = {
        naam: document.getElementById("pb-at-naam").value.trim(),
        starttijd: document.getElementById("pb-at-start").value || "00:00",
        eindtijd: document.getElementById("pb-at-eind").value || "00:00",
      };
      if (!payload.naam) { window.showError && window.showError("Naam is verplicht"); return; }
      try {
        if (atEditingId) await window.beschikbaarheidstypesDB.update(atEditingId, payload);
        else await window.beschikbaarheidstypesDB.add(payload);
        window.showActionFeedback && window.showActionFeedback("saved", "Beschikbaarheidstype");
        closeATModal();
      } catch (err) { window.showError && window.showError("Opslaan mislukt: " + err.message); }
    });
  }

  function openATModal(row) {
    document.getElementById("pb-at-modal-title").textContent = row ? "Beschikbaarheidstype bewerken" : "Beschikbaarheidstype toevoegen";
    document.getElementById("pb-at-naam").value = row ? (row.naam || "") : "";
    document.getElementById("pb-at-start").value = row ? (row.starttijd || "00:00").slice(0, 5) : "00:00";
    document.getElementById("pb-at-eind").value = row ? (row.eindtijd || "00:00").slice(0, 5) : "00:00";
    document.getElementById("pb-at-modal-save").textContent = row ? "Bijwerken" : "Toevoegen";
    var m = document.getElementById("pb-at-modal");
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
  }
  function closeATModal() {
    var m = document.getElementById("pb-at-modal");
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
    atEditingId = null;
  }

  // ===== Diensttypes (gebruikt comp-diensttypes-data.js van BS1) =====
  function renderST() {
    var tbody = document.getElementById("pb-st-tbody");
    if (!window.compDiensttypesDB) {
      tbody.innerHTML = '<tr><td colspan="4" class="planning-detail-empty">Module niet geladen</td></tr>';
      return;
    }
    var search = (document.getElementById("pb-st-search").value || "").toLowerCase();
    var archived = document.getElementById("pb-st-archived").checked;
    var rows = window.compDiensttypesDB.getAllSync()
      .filter(function (r) { return !!r.archived === archived; })
      .filter(function (r) { return !search || (r.naam || "").toLowerCase().indexOf(search) >= 0; });
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="planning-detail-empty" style="text-align:center;padding:24px">Geen resultaten gevonden</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var kleur = r.kleur || "#5c73e6";
      var uurtarief = r.configureerbaar_uurtarief || (r.data && r.data.configureerbaar_uurtarief);
      var pauzeStd = Number(r.standaard_pauze_uren) || 0;
      return '<tr data-id="' + escapeHtml(r.id) + '"><td>' + escapeHtml(r.naam || "") + '</td>'
        + '<td>' + escapeHtml(kleur) + ' <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:' + escapeHtml(kleur) + ';vertical-align:middle;margin-left:6px"></span></td>'
        + '<td>' + (uurtarief ? "Ja" : "Nee") + '</td>'
        + '<td>' + (pauzeStd > 0 ? pauzeStd : "—") + '</td>'
        + '<td class="hr-row-actions">' + (r.archived
            ? '<button class="btn-outline hr-restore-btn" data-action="restore">Herstel</button><button class="employee-delete-btn" data-action="purge" aria-label="Definitief verwijderen">' + trashSvg() + '</button>'
            : '<button class="employee-delete-btn" data-action="archive" aria-label="Archiveren">' + trashSvg() + '</button>') + '</td></tr>';
    }).join("");
  }

  function attachST() {
    document.getElementById("pb-st-add").addEventListener("click", function () { stEditingId = null; openSTModal(); });
    document.getElementById("pb-st-search").addEventListener("input", renderST);
    document.getElementById("pb-st-archived").addEventListener("change", renderST);
    document.getElementById("pb-st-tbody").addEventListener("click", async function (e) {
      var btn = e.target.closest("button");
      var tr = e.target.closest("tr");
      if (!tr) return;
      var id = tr.dataset.id;
      if (btn && window.compDiensttypesDB) {
        var act = btn.dataset.action;
        if (act === "archive") { await window.compDiensttypesDB.archive(id); window.showActionFeedback && window.showActionFeedback("archived", "Diensttype"); }
        else if (act === "restore") { await window.compDiensttypesDB.restore(id); window.showActionFeedback && window.showActionFeedback("restored", "Diensttype"); }
        else if (act === "purge" && window.compDiensttypesDB.delete) { await window.compDiensttypesDB.delete(id); window.showActionFeedback && window.showActionFeedback("deleted", "Diensttype"); }
        return;
      }
      stEditingId = id;
      var row = window.compDiensttypesDB.getAllSync().find(function (r) { return String(r.id) === String(id); });
      if (row) openSTModal(row);
    });
    document.getElementById("pb-st-modal-close").addEventListener("click", closeSTModal);
    document.getElementById("pb-st-modal-cancel").addEventListener("click", closeSTModal);
    document.getElementById("pb-st-modal-save").addEventListener("click", async function () {
      var pauzeRaw = document.getElementById("pb-st-pauze") ? document.getElementById("pb-st-pauze").value : "0";
      var payload = {
        naam: document.getElementById("pb-st-naam").value.trim(),
        kleur: document.getElementById("pb-st-kleur").value || "#5c73e6",
        configureerbaar_uurtarief: document.getElementById("pb-st-uurtarief").checked,
        standaard_pauze_uren: Math.max(0, parseFloat(pauzeRaw) || 0),
      };
      if (!payload.naam) { window.showError && window.showError("Naam is verplicht"); return; }
      try {
        if (stEditingId) await window.compDiensttypesDB.update(stEditingId, payload);
        else await window.compDiensttypesDB.add(payload);
        window.showActionFeedback && window.showActionFeedback("saved", "Diensttype");
        closeSTModal();
      } catch (err) { window.showError && window.showError("Opslaan mislukt: " + err.message); }
    });
  }

  function openSTModal(row) {
    document.getElementById("pb-st-modal-title").textContent = row ? "Diensttype bewerken" : "Diensttype toevoegen";
    document.getElementById("pb-st-naam").value = row ? (row.naam || "") : "";
    document.getElementById("pb-st-kleur").value = row ? (row.kleur || "#5c73e6") : "#5c73e6";
    document.getElementById("pb-st-uurtarief").checked = row ? !!(row.configureerbaar_uurtarief || (row.data && row.data.configureerbaar_uurtarief)) : false;
    var pauzeIn = document.getElementById("pb-st-pauze");
    if (pauzeIn) pauzeIn.value = row ? (Number(row.standaard_pauze_uren) || 0) : 0;
    document.getElementById("pb-st-modal-save").textContent = row ? "Bijwerken" : "Toevoegen";
    var m = document.getElementById("pb-st-modal");
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
  }
  function closeSTModal() {
    var m = document.getElementById("pb-st-modal");
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
    stEditingId = null;
  }

  // ===== Dienstwissels =====
  function renderSW() {
    var tbody = document.getElementById("pb-sw-tbody");
    if (!window.dienstwisselsDB) return;
    var rows = window.dienstwisselsDB.getAllSync();
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="planning-detail-empty" style="text-align:center;padding:32px">Geen resultaten gevonden</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr><td>' + escapeHtml(r.status) + '</td><td>' + escapeHtml(r.van_dienst_id || "-") + '</td>'
        + '<td>' + escapeHtml(r.naar_dienst_id || "-") + '</td><td>' + escapeHtml(r.requested_by || "-") + '</td>'
        + '<td>-</td><td>' + escapeHtml((r.created_at || "").slice(0, 16)) + '</td><td>€ ' + (r.cost_difference || 0) + '</td></tr>';
    }).join("");
  }

  // ===== Medewerkers planning-context =====
  function attachEmp() {
    var s = document.getElementById("pb-emp-search");
    var a = document.getElementById("pb-emp-archived");
    var v = document.getElementById("pb-emp-vereist-actie");
    var exp = document.getElementById("pb-emp-export");
    if (s) s.addEventListener("input", renderEmp);
    if (a) a.addEventListener("change", renderEmp);
    if (v) v.addEventListener("change", renderEmp);
    if (exp) exp.addEventListener("click", exportEmp);
  }
  function exportEmp() {
    var rows = (window.medewerkersDB ? window.medewerkersDB.getAllSync() : []);
    var header = "Voornaam,Achternaam,E-mail,Telefoon,Fase,Dienstverband,Werktype,Startdatum\n";
    var body = rows.map(function (m) {
      var d = m.data || {};
      return [m.voornaam, m.achternaam, m.email, d.telefoon || "", d.fase || "In dienst", d.dienstverband || "Loondienst", d.werktype || "", d.startdatum || ""].map(function (v) { return '"' + String(v || "").replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "medewerkers-export-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    if (window.showActionFeedback) window.showActionFeedback("exported", "Medewerkers");
  }
  function attachSW() {
    var s = document.getElementById("pb-sw-search");
    var a = document.getElementById("pb-sw-archived");
    if (s) s.addEventListener("input", renderSW);
    if (a) a.addEventListener("change", renderSW);
  }
  function renderEmp() {
    var tbody = document.getElementById("pb-emp-tbody");
    if (!window.medewerkersDB) {
      tbody.innerHTML = '<tr><td colspan="8" class="planning-detail-empty">Module niet geladen</td></tr>';
      return;
    }
    var search = (document.getElementById("pb-emp-search").value || "").toLowerCase();
    var archived = document.getElementById("pb-emp-archived").checked;
    var rows = window.medewerkersDB.getAllSync()
      .filter(function (r) { return !!r.archived === archived; })
      .filter(function (r) {
        if (!search) return true;
        return (r.voornaam + " " + r.achternaam + " " + (r.email || "")).toLowerCase().indexOf(search) >= 0;
      });
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="planning-detail-empty" style="text-align:center;padding:24px">Geen medewerkers gevonden</td></tr>';
      return;
    }
    tbody.innerHTML = rows.slice(0, 200).map(function (m) {
      var d = m.data || {};
      return '<tr><td>' + escapeHtml(m.voornaam || "") + '</td><td>' + escapeHtml(m.achternaam || "") + '</td>'
        + '<td>' + escapeHtml(m.email || "") + '</td><td>' + escapeHtml(d.telefoon || "-") + '</td>'
        + '<td><span class="cl-fase-pill cl-fase-pill--fase-1">' + escapeHtml(d.fase || "In dienst") + '</span></td>'
        + '<td>' + escapeHtml(d.dienstverband || "Loondienst") + '</td>'
        + '<td>' + escapeHtml(d.werktype || "-") + '</td>'
        + '<td>' + escapeHtml(d.startdatum || "-") + '</td></tr>';
    }).join("");
  }

  // ===== Settings =====
  function renderSettings() {
    if (!window.planningSettingsDB) return;
    var s = window.planningSettingsDB.getSync();
    if (!s) return;
    document.getElementById("pb-min-uren").value = s.min_compensatie_uren;
    document.getElementById("pb-max-uren").value = s.max_compensatie_uren;
    document.getElementById("pb-preview-min").textContent = s.min_compensatie_uren;
    document.getElementById("pb-preview-max").textContent = s.max_compensatie_uren;
    var kmIn = document.getElementById("pb-km-tarief");
    if (kmIn) kmIn.value = (s.km_tarief != null ? s.km_tarief : 0.23);
  }

  function attachSettings() {
    document.getElementById("pb-settings-save").addEventListener("click", async function () {
      try {
        var kmIn = document.getElementById("pb-km-tarief");
        var patch = {
          min_compensatie_uren: parseInt(document.getElementById("pb-min-uren").value, 10),
          max_compensatie_uren: parseInt(document.getElementById("pb-max-uren").value, 10),
        };
        if (kmIn) {
          var kmVal = parseFloat(kmIn.value);
          if (!isFinite(kmVal) || kmVal < 0) kmVal = 0.23;
          patch.km_tarief = kmVal;
        }
        await window.planningSettingsDB.update(patch);
        window.showActionFeedback && window.showActionFeedback("saved", "Planning instellingen");
        renderSettings();
      } catch (err) { window.showError && window.showError("Opslaan mislukt: " + err.message); }
    });
    document.getElementById("pb-settings-cancel").addEventListener("click", renderSettings);
  }

  function trashSvg() {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  }

  function init() {
    attachSidebar();
    attachAT();
    attachST();
    attachEmp();
    attachSW();
    attachSettings();
    switchTab(currentTab);

    window.addEventListener("besa:beschikbaarheidstypes-updated", renderAT);
    window.addEventListener("besa:comp-diensttypes-updated", renderST);
    window.addEventListener("besa:dienstwissels-updated", renderSW);
    window.addEventListener("besa:medewerkers-updated", renderEmp);
    window.addEventListener("besa:planning-settings-updated", renderSettings);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
