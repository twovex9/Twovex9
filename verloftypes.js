/* global window, document */
/**
 * verloftypes.js — beheerpagina voor verloftypes (G25). HR beheert welke
 * verloftypen bestaan, hun label, volgorde en actief-status. De aanvraag-
 * formulieren (mijn-verlof) lezen de actieve typen uit verloftypesDB.
 * Verwijderen via slider-modal; actief/inactief via switch (direct).
 */
(function () {
  "use strict";

  var query = "";

  function $(id) { return document.getElementById(id); }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }

  var TRASH_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function rows() {
    var all = (window.verloftypesDB && window.verloftypesDB.getAllSync) ? window.verloftypesDB.getAllSync() : [];
    var q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(function (r) {
      return String(r.label).toLowerCase().indexOf(q) !== -1 || String(r.code).toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    var tb = $("vt-tbody");
    if (!tb) return;
    var list = rows();
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="5" class="mu-empty">Geen verloftypes gevonden.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      return '<tr data-id="' + esc(r.id) + '">'
        + '<td>' + esc(r.label) + "</td>"
        + '<td><code>' + esc(r.code) + "</code></td>"
        + "<td>" + esc(String(r.volgorde)) + "</td>"
        + '<td><label class="switch"><input type="checkbox" class="vt-actief-cb" data-id="' + esc(r.id) + '"' + (r.actief ? " checked" : "") + '><span class="switch-slider"></span></label></td>'
        + '<td class="vt-actions-cell">'
        + '<button type="button" class="btn-outline vt-edit-btn" data-id="' + esc(r.id) + '">Bewerken</button> '
        + '<button type="button" class="employee-delete-btn vt-delete-btn" data-id="' + esc(r.id) + '" aria-label="Verwijderen">' + TRASH_SVG + "</button>"
        + "</td></tr>";
    }).join("");
  }

  function openModal(item) {
    var modal = $("vt-edit-modal");
    if (!modal) return;
    $("vt-edit-title").textContent = item ? "Verloftype bewerken" : "Verloftype toevoegen";
    $("vt-edit-label").value = item ? item.label : "";
    $("vt-edit-volgorde").value = item ? String(item.volgorde) : "0";
    $("vt-edit-id").value = item ? item.id : "";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    try { $("vt-edit-label").focus(); } catch (e) { /* */ }
  }
  function closeModal() {
    var modal = $("vt-edit-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function byId(id) {
    return rows().concat(window.verloftypesDB.getAllSync()).find(function (r) { return String(r.id) === String(id); }) || null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    var id = $("vt-edit-id").value;
    var label = $("vt-edit-label").value.trim();
    var volgorde = Number($("vt-edit-volgorde").value) || 0;
    if (!label) return;
    try {
      if (id) {
        await window.verloftypesDB.update(id, { label: label, volgorde: volgorde });
        if (window.showActionFeedback) window.showActionFeedback("saved", "Verloftype");
      } else {
        await window.verloftypesDB.add({ label: label, volgorde: volgorde });
        if (window.showActionFeedback) window.showActionFeedback("created", "Verloftype");
      }
      closeModal();
      render();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message ? err.message : "onbekende fout"));
    }
  }

  function wire() {
    if ($("vt-add-btn")) $("vt-add-btn").addEventListener("click", function () { openModal(null); });
    if ($("vt-edit-close")) $("vt-edit-close").addEventListener("click", closeModal);
    if ($("vt-edit-cancel")) $("vt-edit-cancel").addEventListener("click", closeModal);
    if ($("vt-edit-form")) $("vt-edit-form").addEventListener("submit", onSubmit);
    if ($("vt-search")) $("vt-search").addEventListener("input", function () { query = $("vt-search").value || ""; render(); });

    var tb = $("vt-tbody");
    if (tb) {
      tb.addEventListener("click", async function (e) {
        var editBtn = e.target.closest && e.target.closest(".vt-edit-btn");
        if (editBtn) { openModal(byId(editBtn.getAttribute("data-id"))); return; }
        var delBtn = e.target.closest && e.target.closest(".vt-delete-btn");
        if (delBtn) {
          var item = byId(delBtn.getAttribute("data-id"));
          if (!item) return;
          var ok = await window.showSliderConfirmModal({
            title: "Bent u zeker dat dit verwijderd wordt?",
            preview: item.label,
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren",
          });
          if (!ok) return;
          try {
            await window.verloftypesDB.delete(item.id);
            if (window.showActionFeedback) window.showActionFeedback("deleted", "Verloftype");
            render();
          } catch (err) {
            if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message ? err.message : "onbekende fout"));
          }
        }
      });
      tb.addEventListener("change", async function (e) {
        var cb = e.target.closest && e.target.closest(".vt-actief-cb");
        if (!cb) return;
        try {
          await window.verloftypesDB.update(cb.getAttribute("data-id"), { actief: cb.checked });
          if (window.showActionFeedback) window.showActionFeedback("saved", "Verloftype");
        } catch (err) {
          cb.checked = !cb.checked;
          if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message ? err.message : "onbekende fout"));
        }
        render();
      });
    }

    window.addEventListener("besa:verloftypes-updated", render);
  }

  async function start() {
    wire();
    try { await window.verloftypesDB.ready; } catch (e) { /* render uit cache */ }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
