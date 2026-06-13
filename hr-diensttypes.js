/* global window, document */
/**
 * hr-diensttypes.js — eenvoudige beheer-pagina voor diensttypes.
 *
 * Gebruikt `window.compDiensttypesDB` (tabel `comp_diensttypes`). Toont alleen
 * de essentiële velden voor een diensttype-DEFINITIE:
 *   - naam
 *   - kleur (hex)
 *   - standaard_pauze_uren
 *
 * Compensatie-specifieke velden (basis/overuren/regels/teams) worden hier
 * niet getoond — die blijven beheer via `compensatie-diensttypes.html`.
 *
 * CRUD via slider-confirm voor archive/delete, direct voor restore.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtNlNum(v) {
    var n = Number(v || 0);
    if (!isFinite(n)) n = 0;
    if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
    return n.toFixed(2).replace(".", ",");
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  function isValidHex(s) { return /^#[0-9a-fA-F]{6}$/.test(String(s || "")); }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    showArchived: false,
    search: "",
    rowsPerPage: 15,
    page: 1,
  };

  function getRows() {
    if (!window.compDiensttypesDB || typeof window.compDiensttypesDB.getAllSync !== "function") return [];
    var all = window.compDiensttypesDB.getAllSync() || [];
    var filtered = all.filter(function (r) {
      if (state.showArchived) return r && r.archived;
      return r && !r.archived;
    });
    if (state.search) {
      var q = state.search.toLowerCase();
      filtered = filtered.filter(function (r) {
        return (r.naam || r.diensttype || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    // Sort op naam asc
    filtered.sort(function (a, b) {
      return (a.naam || a.diensttype || "").localeCompare(b.naam || b.diensttype || "");
    });
    return filtered;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render() {
    var tbody = $("dt-tbody");
    if (!tbody) return;
    var rows = getRows();
    var total = rows.length;
    var perPage = state.rowsPerPage;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * perPage;
    var slice = rows.slice(start, start + perPage);

    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="employees-empty-cell">'
        + (state.showArchived ? "Geen gearchiveerde diensttypes." : "Geen diensttypes — klik op \"+ Diensttype toevoegen\" om er één aan te maken.")
        + '</td></tr>';
    } else {
      tbody.innerHTML = slice.map(function (r) {
        var naam = escapeHtml(r.naam || r.diensttype || "—");
        var kleur = isValidHex(r.kleur) ? r.kleur : "#5c73e6";
        var pauze = fmtNlNum(r.standaard_pauze_uren || 0) + " uur";
        var actiesHtml = r.archived
          ? '<div class="hr-row-actions">'
            + '  <button type="button" class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(r.id) + '">Herstel</button>'
            + '  <button type="button" class="employee-delete-btn dt-purge-btn" data-action="purge" data-id="' + escapeHtml(r.id) + '" aria-label="Definitief verwijderen">'
            + '    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '  </button>'
            + '</div>'
          : '<button type="button" class="employee-delete-btn dt-archive-btn" data-action="archive" data-id="' + escapeHtml(r.id) + '" aria-label="Archiveren">'
            + '  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '</button>';
        var rowClickAttr = r.archived ? "" : ' data-row-id="' + escapeHtml(r.id) + '"';
        return '<tr' + rowClickAttr + ' class="dt-row' + (r.archived ? " dt-row--archived" : "") + '">'
          + '  <td data-col="naam"><span class="dt-naam">' + naam + '</span></td>'
          + '  <td data-col="kleur"><span class="dt-color-swatch" style="background:' + kleur + '" title="' + kleur + '"></span> <span class="dt-color-hex-text">' + escapeHtml(kleur) + '</span></td>'
          + '  <td data-col="pauze">' + pauze + '</td>'
          + '  <td data-col="aanmaakdatum">' + fmtDate(r.aanmaakdatum) + '</td>'
          + '  <td data-col="acties" class="dt-actions-cell">' + actiesHtml + '</td>'
          + '</tr>';
      }).join("");
    }

    // Footer pager
    var rangeEl = $("dt-pager-range");
    if (rangeEl) {
      var to = Math.min(total, start + perPage);
      rangeEl.textContent = total === 0 ? "0 of 0 total." : (start + 1) + "-" + to + " of " + total + " total.";
    }
    var pageEl = $("dt-pager-page");
    if (pageEl) pageEl.textContent = "Pagina " + state.page + " van " + totalPages;
    var first = $("dt-pager-first"), prev = $("dt-pager-prev"), next = $("dt-pager-next"), last = $("dt-pager-last");
    if (first) first.disabled = state.page <= 1;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
    if (last) last.disabled = state.page >= totalPages;
  }

  // ---------------------------------------------------------------------------
  // Modal handlers
  // ---------------------------------------------------------------------------
  function openModal(prefill) {
    var modal = $("dt-edit-modal");
    if (!modal) return;
    var title = $("dt-edit-title");
    if (title) title.textContent = prefill ? "Diensttype bewerken" : "Diensttype toevoegen";
    $("dt-edit-id").value = (prefill && prefill.id) || "";
    $("dt-edit-naam").value = (prefill && (prefill.naam || prefill.diensttype)) || "";
    var kleur = (prefill && isValidHex(prefill.kleur)) ? prefill.kleur : "#5c73e6";
    $("dt-edit-kleur").value = kleur;
    $("dt-edit-kleur-hex").value = kleur;
    $("dt-edit-pauze").value = (prefill && Number(prefill.standaard_pauze_uren)) || 0;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    setTimeout(function () { $("dt-edit-naam").focus(); }, 30);
  }
  function closeModal() {
    var modal = $("dt-edit-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  async function saveForm(e) {
    e.preventDefault();
    if (!window.compDiensttypesDB) return;
    var id = $("dt-edit-id").value;
    var naam = $("dt-edit-naam").value.trim();
    var kleur = $("dt-edit-kleur-hex").value.trim();
    var pauze = Number($("dt-edit-pauze").value || 0);
    if (!naam) {
      if (window.showError) window.showError("Naam is verplicht.");
      return;
    }
    if (!isValidHex(kleur)) kleur = $("dt-edit-kleur").value || "#5c73e6";
    var payload = {
      naam: naam,
      diensttype: naam, // legacy-veld in tabel; houden gelijk aan naam
      kleur: kleur,
      standaard_pauze_uren: isFinite(pauze) ? pauze : 0,
    };
    try {
      if (id) {
        await window.compDiensttypesDB.update(id, payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Diensttype");
      } else {
        await window.compDiensttypesDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("created", "Diensttype");
      }
      closeModal();
      render();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    }
  }

  async function archiveItem(id) {
    var row = (window.compDiensttypesDB.getAllSync() || []).find(function (r) { return String(r.id) === String(id); });
    if (!row) return;
    var ok = false;
    if (typeof window.showArchiveConfirm === "function") {
      ok = await window.showArchiveConfirm({ preview: row.naam || row.diensttype });
    } else { ok = true; }
    if (!ok) return;
    try {
      await window.compDiensttypesDB.update(id, { archived: true });
      if (window.showActionFeedback) window.showActionFeedback("archived", "Diensttype");
      render();
    } catch (err) {
      if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
    }
  }

  async function restoreItem(id) {
    try {
      await window.compDiensttypesDB.update(id, { archived: false });
      if (window.showActionFeedback) window.showActionFeedback("restored", "Diensttype");
      render();
    } catch (err) {
      if (window.showError) window.showError("Herstellen mislukt: " + (err && err.message || err));
    }
  }

  async function purgeItem(id) {
    var row = (window.compDiensttypesDB.getAllSync() || []).find(function (r) { return String(r.id) === String(id); });
    if (!row) return;
    var ok = false;
    if (typeof window.showSliderConfirmModal === "function") {
      ok = await window.showSliderConfirmModal({
        title: "Diensttype definitief verwijderen?",
        preview: row.naam || row.diensttype,
        okLabel: "Verwijderen",
        cancelLabel: "Annuleren",
      });
    } else { ok = true; }
    if (!ok) return;
    try {
      if (typeof window.compDiensttypesDB.delete === "function") {
        await window.compDiensttypesDB.delete(id);
      } else {
        await window.compDiensttypesDB.update(id, { archived: true });
      }
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Diensttype");
      render();
    } catch (err) {
      if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message || err));
    }
  }

  function wire() {
    // Add-knop
    var addBtn = $("dt-add-btn");
    if (addBtn) addBtn.addEventListener("click", function () { openModal(null); });

    // Modal sluiten
    var closeBtn = $("dt-edit-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    var cancelBtn = $("dt-edit-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    var modal = $("dt-edit-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
    }

    // Form submit
    var form = $("dt-edit-form");
    if (form) form.addEventListener("submit", saveForm);

    // Kleur-picker ↔ hex-veld sync
    var color = $("dt-edit-kleur");
    var hex = $("dt-edit-kleur-hex");
    if (color && hex) {
      color.addEventListener("input", function () { hex.value = color.value; });
      hex.addEventListener("input", function () {
        if (isValidHex(hex.value)) color.value = hex.value;
      });
    }

    // Search
    var search = $("dt-search");
    if (search) search.addEventListener("input", function () {
      state.search = search.value;
      state.page = 1;
      render();
    });

    // Gearchiveerd-toggle
    var archToggle = $("dt-archived-toggle");
    if (archToggle) archToggle.addEventListener("change", function () {
      state.showArchived = archToggle.checked;
      state.page = 1;
      render();
    });

    // Rows per page
    var rpp = $("dt-rows-per-page");
    if (rpp) rpp.addEventListener("change", function () {
      state.rowsPerPage = parseInt(rpp.value, 10) || 15;
      state.page = 1;
      render();
    });

    // Pager
    var first = $("dt-pager-first"), prev = $("dt-pager-prev"), next = $("dt-pager-next"), last = $("dt-pager-last");
    if (first) first.addEventListener("click", function () { state.page = 1; render(); });
    if (prev) prev.addEventListener("click", function () { state.page--; render(); });
    if (next) next.addEventListener("click", function () { state.page++; render(); });
    if (last) last.addEventListener("click", function () {
      state.page = Math.max(1, Math.ceil(getRows().length / state.rowsPerPage));
      render();
    });

    // Row delegation: klik op rij = bewerken; archive/restore/purge via knoppen
    var tbody = $("dt-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var btn = e.target;
        while (btn && btn !== tbody) {
          if (btn.hasAttribute && btn.hasAttribute("data-action")) break;
          btn = btn.parentNode;
        }
        if (btn && btn !== tbody && btn.hasAttribute("data-action")) {
          e.stopPropagation();
          var action = btn.getAttribute("data-action");
          var id = btn.getAttribute("data-id");
          if (action === "archive") archiveItem(id);
          else if (action === "restore") restoreItem(id);
          else if (action === "purge") purgeItem(id);
          return;
        }
        // Klik op rij → open edit
        var row = e.target;
        while (row && row !== tbody && row.tagName !== "TR") row = row.parentNode;
        if (row && row.hasAttribute && row.hasAttribute("data-row-id")) {
          var rid = row.getAttribute("data-row-id");
          var item = (window.compDiensttypesDB.getAllSync() || []).find(function (r) { return String(r.id) === String(rid); });
          if (item) openModal(item);
        }
      });
    }

    // Re-render bij externe updates
    window.addEventListener("ff:comp-diensttypes-updated", render);
  }

  function bootstrap() {
    wire();
    render();
    if (window.compDiensttypesDB && window.compDiensttypesDB.ready) {
      Promise.resolve(window.compDiensttypesDB.ready).then(render).catch(function () { render(); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
