/* global window, document */
/**
 * contract-sjablonen.js — beheer-pagina voor contractsjablonen.
 *
 * Gebruikt `window.contractSjablonenDB` (tabel `contract_sjablonen`). HR beheert
 * de standaard blanco-contracten; merge-velden {{...}} worden bij het opstellen
 * van een contract (release 4) ingevuld. CRUD via slider-confirm voor
 * archive/delete, direct voor restore.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var TYPE_LABELS = {
    arbeidsovereenkomst: "Arbeidsovereenkomst",
    bbl: "BBL-arbeidsovereenkomst",
    opdracht: "Overeenkomst van opdracht (ZZP)",
    stage: "Stageovereenkomst",
    oproep: "Oproepovereenkomst",
    geldlening: "Geldleningsovereenkomst",
    bruikleen: "Bruikleenovereenkomst",
    reglement: "Personeelsreglement",
    overig: "Overig",
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  function typeLabel(t) { return TYPE_LABELS[t] || (t ? t : "—"); }

  var state = { showArchived: false, search: "", rowsPerPage: 15, page: 1 };

  function db() { return window.contractSjablonenDB; }

  function getRows() {
    if (!db() || typeof db().getAllSync !== "function") return [];
    var all = db().getAllSync() || [];
    var filtered = all.filter(function (r) {
      if (state.showArchived) return r && r.archived;
      return r && !r.archived;
    });
    if (state.search) {
      var q = state.search.toLowerCase();
      filtered = filtered.filter(function (r) {
        return (r.naam || "").toLowerCase().indexOf(q) >= 0
          || typeLabel(r.type).toLowerCase().indexOf(q) >= 0
          || (r.beschrijving || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    filtered.sort(function (a, b) {
      var d = (a.volgorde || 0) - (b.volgorde || 0);
      if (d !== 0) return d;
      return (a.naam || "").localeCompare(b.naam || "");
    });
    return filtered;
  }

  var TRASH_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function render() {
    var tbody = $("cs-tbody");
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
        + (state.showArchived ? "Geen gearchiveerde sjablonen." : "Geen sjablonen — klik op \"+ Sjabloon toevoegen\" om er één aan te maken.")
        + '</td></tr>';
    } else {
      tbody.innerHTML = slice.map(function (r) {
        var naam = escapeHtml(r.naam || "—");
        var besch = escapeHtml(r.beschrijving || "");
        var actiesHtml = r.archived
          ? '<div class="hr-row-actions">'
            + '  <button type="button" class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(r.id) + '">Herstel</button>'
            + '  <button type="button" class="employee-delete-btn cs-purge-btn" data-action="purge" data-id="' + escapeHtml(r.id) + '" aria-label="Definitief verwijderen">' + TRASH_SVG + '</button>'
            + '</div>'
          : '<button type="button" class="employee-delete-btn cs-archive-btn" data-action="archive" data-id="' + escapeHtml(r.id) + '" aria-label="Archiveren">' + TRASH_SVG + '</button>';
        var rowClickAttr = r.archived ? "" : ' data-row-id="' + escapeHtml(r.id) + '"';
        return '<tr' + rowClickAttr + ' class="cs-row' + (r.archived ? " cs-row--archived" : "") + '">'
          + '  <td data-col="naam"><span class="cs-naam">' + naam + '</span></td>'
          + '  <td data-col="type">' + escapeHtml(typeLabel(r.type)) + '</td>'
          + '  <td data-col="beschrijving"><span class="cs-besch">' + besch + '</span></td>'
          + '  <td data-col="aanmaakdatum">' + fmtDate(r.aanmaakdatum) + '</td>'
          + '  <td data-col="acties" class="cs-actions-cell">' + actiesHtml + '</td>'
          + '</tr>';
      }).join("");
    }

    var rangeEl = $("cs-pager-range");
    if (rangeEl) {
      var to = Math.min(total, start + perPage);
      rangeEl.textContent = total === 0 ? "0 of 0 total." : (start + 1) + "-" + to + " of " + total + " total.";
    }
    var pageEl = $("cs-pager-page");
    if (pageEl) pageEl.textContent = "Pagina " + state.page + " van " + totalPages;
    var first = $("cs-pager-first"), prev = $("cs-pager-prev"), next = $("cs-pager-next"), last = $("cs-pager-last");
    if (first) first.disabled = state.page <= 1;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
    if (last) last.disabled = state.page >= totalPages;
  }

  function openModal(prefill) {
    var modal = $("cs-edit-modal");
    if (!modal) return;
    var title = $("cs-edit-title");
    if (title) title.textContent = prefill ? "Sjabloon bewerken" : "Sjabloon toevoegen";
    $("cs-edit-id").value = (prefill && prefill.id) || "";
    $("cs-edit-naam").value = (prefill && prefill.naam) || "";
    $("cs-edit-type").value = (prefill && prefill.type) || "arbeidsovereenkomst";
    $("cs-edit-beschrijving").value = (prefill && prefill.beschrijving) || "";
    $("cs-edit-body").value = (prefill && prefill.body) || "";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    setTimeout(function () { $("cs-edit-naam").focus(); }, 30);
  }
  function closeModal() {
    var modal = $("cs-edit-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  async function saveForm(e) {
    e.preventDefault();
    if (!db()) return;
    var id = $("cs-edit-id").value;
    var naam = $("cs-edit-naam").value.trim();
    var payload = {
      naam: naam,
      type: $("cs-edit-type").value || "overig",
      beschrijving: $("cs-edit-beschrijving").value.trim(),
      body: $("cs-edit-body").value,
    };
    if (!naam) {
      if (window.showError) window.showError("Naam is verplicht.");
      else if (window.showActionFeedback) window.showActionFeedback("error", "Naam is verplicht.");
      return;
    }
    try {
      if (id) {
        await db().update(id, payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Sjabloon");
      } else {
        await db().add(payload);
        if (window.showActionFeedback) window.showActionFeedback("created", "Sjabloon");
      }
      closeModal();
      render();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
      else if (window.showActionFeedback) window.showActionFeedback("error", "Opslaan mislukt: " + (err && err.message || err));
    }
  }

  async function archiveItem(id) {
    var row = (db().getAllSync() || []).find(function (r) { return String(r.id) === String(id); });
    if (!row) return;
    var ok = (typeof window.showArchiveConfirm === "function")
      ? await window.showArchiveConfirm({ preview: row.naam })
      : true;
    if (!ok) return;
    try {
      await db().archive(id);
      if (window.showActionFeedback) window.showActionFeedback("archived", "Sjabloon");
      render();
    } catch (err) {
      if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
    }
  }

  async function restoreItem(id) {
    try {
      await db().restore(id);
      if (window.showActionFeedback) window.showActionFeedback("restored", "Sjabloon");
      render();
    } catch (err) {
      if (window.showError) window.showError("Herstellen mislukt: " + (err && err.message || err));
    }
  }

  async function purgeItem(id) {
    var row = (db().getAllSync() || []).find(function (r) { return String(r.id) === String(id); });
    if (!row) return;
    var ok = (typeof window.showSliderConfirmModal === "function")
      ? await window.showSliderConfirmModal({
        title: "Sjabloon definitief verwijderen?",
        preview: row.naam,
        okLabel: "Verwijderen",
        cancelLabel: "Annuleren",
      })
      : true;
    if (!ok) return;
    try {
      await db().remove(id);
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Sjabloon");
      render();
    } catch (err) {
      if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message || err));
    }
  }

  function wire() {
    var addBtn = $("cs-add-btn");
    if (addBtn) addBtn.addEventListener("click", function () { openModal(null); });

    var closeBtn = $("cs-edit-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    var cancelBtn = $("cs-edit-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    var modal = $("cs-edit-modal");
    if (modal) {
      modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && !modal.hidden) closeModal();
    });

    var form = $("cs-edit-form");
    if (form) form.addEventListener("submit", saveForm);

    var search = $("cs-search");
    if (search) search.addEventListener("input", function () {
      state.search = search.value; state.page = 1; render();
    });

    var archToggle = $("cs-archived-toggle");
    if (archToggle) archToggle.addEventListener("change", function () {
      state.showArchived = archToggle.checked; state.page = 1; render();
    });

    var rpp = $("cs-rows-per-page");
    if (rpp) rpp.addEventListener("change", function () {
      state.rowsPerPage = parseInt(rpp.value, 10) || 15; state.page = 1; render();
    });

    var first = $("cs-pager-first"), prev = $("cs-pager-prev"), next = $("cs-pager-next"), last = $("cs-pager-last");
    if (first) first.addEventListener("click", function () { state.page = 1; render(); });
    if (prev) prev.addEventListener("click", function () { state.page--; render(); });
    if (next) next.addEventListener("click", function () { state.page++; render(); });
    if (last) last.addEventListener("click", function () {
      state.page = Math.max(1, Math.ceil(getRows().length / state.rowsPerPage)); render();
    });

    var tbody = $("cs-tbody");
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
        var row = e.target;
        while (row && row !== tbody && row.tagName !== "TR") row = row.parentNode;
        if (row && row.hasAttribute && row.hasAttribute("data-row-id")) {
          var rid = row.getAttribute("data-row-id");
          var item = (db().getAllSync() || []).find(function (r) { return String(r.id) === String(rid); });
          if (item) openModal(item);
        }
      });
    }

    window.addEventListener("besa:contract-sjablonen-updated", render);
  }

  function bootstrap() {
    wire();
    render();
    if (db() && db().ready) {
      Promise.resolve(db().ready).then(render).catch(function () { render(); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
