/* global window, document */
/**
 * verlof.js — page-script voor /verlof.html (BS2-port: Verlofaanvragen).
 * Goedkeuren/afwijzen via beoordeel-modal.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    showArchived: false,
    onlyMine: false,
    filterStatus: "",
    filterType: "",
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    editingId: null,
    beoordeleningId: null,
  };

  var STATUS_LABELS = {
    concept: "Concept",
    ingediend: "Ingediend",
    goedgekeurd: "Goedgekeurd",
    afgewezen: "Afgewezen",
    geannuleerd: "Geannuleerd",
  };
  var STATUS_STYLE = {
    concept: "color:var(--text-muted);background:var(--line);",
    ingediend: "color:var(--yellow);background:var(--yellow-soft);",
    goedgekeurd: "color:var(--green);background:var(--green-soft);",
    afgewezen: "color:var(--red);background:var(--red-soft);",
    geannuleerd: "color:var(--text-muted);background:var(--line);",
  };
  var TYPE_LABELS = {
    wettelijk: "Wettelijk",
    bovenwettelijk: "Bovenwettelijk",
    ouderschap: "Ouderschap",
    calamiteit: "Calamiteit",
    doktersbezoek: "Doktersbezoek",
    onbetaald: "Onbetaald",
    anders: "Anders",
  };

  function fmtDate(iso) {
    if (!iso) return "—";
    var s = String(iso);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return s;
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear() + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function medewerkerLabel(id) {
    if (!id || !window.medewerkersDB) return "—";
    var m = window.medewerkersDB.getByIdSync(id);
    if (!m) return "—";
    return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "—";
  }
  function getCurrentMedewerkerId() {
    try {
      var p = window.besaCurrentProfile || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync());
      return p && p.medewerker_id ? p.medewerker_id : null;
    } catch (e) { return null; }
  }

  function getVisible() {
    var items = (window.verlofDB && window.verlofDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    var myId = state.onlyMine ? getCurrentMedewerkerId() : null;
    return items.filter(function (v) {
      if (!v) return false;
      if (!!v.archived !== !!state.showArchived) return false;
      if (state.filterStatus && v.status !== state.filterStatus) return false;
      if (state.filterType && v.type !== state.filterType) return false;
      if (state.onlyMine) {
        if (!myId || String(v.medewerkerId) !== String(myId)) return false;
      }
      if (!q) return true;
      var hay = medewerkerLabel(v.medewerkerId) + " " + (v.beschrijving || "") + " " + (v.type || "") + " " + (v.status || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function statusBadge(status) {
    var label = STATUS_LABELS[status] || status;
    var style = "padding:2px 10px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;" + (STATUS_STYLE[status] || "");
    return '<span style="' + style + '">' + escapeHtml(label) + '</span>';
  }

  function actionsForRow(v) {
    var acts = [];
    if (v.archived) {
      acts.push('<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(v.id) + '">Herstel</button>');
      acts.push('<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(v.id) + '" aria-label="Definitief verwijderen">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg></button>');
      return '<div class="hr-row-actions">' + acts.join("") + '</div>';
    }
    if (v.status === "concept") {
      acts.push('<button class="btn-primary" data-action="indienen" data-id="' + escapeHtml(v.id) + '" style="font-size:12px;padding:4px 10px;">Indienen</button>');
    }
    if (v.status === "ingediend") {
      acts.push('<button class="btn-primary" data-action="beoordeel" data-id="' + escapeHtml(v.id) + '" style="font-size:12px;padding:4px 10px;">Beoordeel</button>');
    }
    if (v.status === "concept" || v.status === "ingediend") {
      acts.push('<button class="btn-outline" data-action="annuleer" data-id="' + escapeHtml(v.id) + '" style="font-size:12px;padding:4px 10px;">Annuleer</button>');
    }
    acts.push('<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(v.id) + '" aria-label="Archiveren">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg></button>');
    return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' + acts.join("") + '</div>';
  }

  function renderRow(v) {
    var periode = fmtDate(v.startDatum);
    if (v.eindDatum && v.eindDatum !== v.startDatum) periode += " — " + fmtDate(v.eindDatum);
    var medewerker = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(v.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' +
      escapeHtml(medewerkerLabel(v.medewerkerId)) + '</button>';
    return '<tr data-id="' + escapeHtml(v.id) + '">' +
      '<td>' + medewerker + (v.beschrijving ? '<br><span style="color:var(--text-muted);font-size:12px;">' + escapeHtml(v.beschrijving.slice(0, 60)) + (v.beschrijving.length > 60 ? "…" : "") + '</span>' : '') + '</td>' +
      '<td>' + escapeHtml(TYPE_LABELS[v.type] || v.type) + '</td>' +
      '<td>' + escapeHtml(periode) + '</td>' +
      '<td>' + escapeHtml(String(v.aantalDagen)) + '</td>' +
      '<td>' + statusBadge(v.status) + '</td>' +
      '<td>' + escapeHtml(fmtDateTime(v.ingediendOp)) + '</td>' +
      '<td>' + escapeHtml(fmtDateTime(v.beoordeeldOp)) + (v.beoordelingOpmerking ? '<br><span style="color:var(--text-muted);font-size:12px;font-style:italic;">"' + escapeHtml(v.beoordelingOpmerking.slice(0, 50)) + '"</span>' : '') + '</td>' +
      '<td class="hr-actions-cell">' + actionsForRow(v) + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("verlof-tbody");
    if (!tbody) return;
    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);
    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text-muted);">Geen verlofaanvragen gevonden.</td></tr>';
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
    }
    document.getElementById("verlof-pager-range").textContent = total === 0 ? "0 van 0" : (start + 1) + "-" + Math.min(total, start + pageItems.length) + " van " + total;
    document.getElementById("verlof-pager-page").textContent = "Pagina " + state.page + " van " + totalPages;
    document.getElementById("verlof-pager-first").disabled = state.page <= 1;
    document.getElementById("verlof-pager-prev").disabled = state.page <= 1;
    document.getElementById("verlof-pager-next").disabled = state.page >= totalPages;
    document.getElementById("verlof-pager-last").disabled = state.page >= totalPages;
  }

  function fillMedewerkerSelect() {
    var sel = document.getElementById("verlof-add-medewerker");
    if (!sel || !window.medewerkersDB) return;
    var items = (window.medewerkersDB.getAllSync() || []).filter(function (m) { return m && !m.archived; });
    items.sort(function (a, b) { return (((a.voornaam || "") + " " + (a.achternaam || "")).localeCompare(((b.voornaam || "") + " " + (b.achternaam || "")))); });
    var keep = sel.value;
    sel.innerHTML = '<option value="">— Kies medewerker —</option>' + items.map(function (m) {
      return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(((m.voornaam || "") + " " + (m.achternaam || "")).trim()) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }

  // Add/Edit modal
  function openAddModal(item) {
    state.editingId = item ? item.id : null;
    var modal = document.getElementById("verlof-add-modal");
    fillMedewerkerSelect();
    document.getElementById("verlof-add-title").textContent = item ? "Verlofaanvraag bewerken" : "Verlofaanvraag indienen";
    document.getElementById("verlof-edit-id").value = item ? item.id : "";
    document.getElementById("verlof-add-medewerker").value = item ? (item.medewerkerId || "") : (getCurrentMedewerkerId() || "");
    document.getElementById("verlof-add-type").value = item ? item.type : "wettelijk";
    document.getElementById("verlof-add-start").value = item ? (item.startDatum || "") : "";
    document.getElementById("verlof-add-eind").value = item ? (item.eindDatum || "") : "";
    document.getElementById("verlof-add-dagen").value = item ? item.aantalDagen : 1;
    document.getElementById("verlof-add-beschrijving").value = item ? (item.beschrijving || "") : "";
    document.getElementById("verlof-add-status").value = item ? item.status : "ingediend";
    document.getElementById("verlof-add-submit-btn").textContent = item ? "Opslaan" : "Indienen";
    modal.style.display = "flex";
  }
  function closeAddModal() {
    state.editingId = null;
    document.getElementById("verlof-add-modal").style.display = "none";
  }

  async function submitAddForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("verlof-add-submit-btn");
    var idVal = document.getElementById("verlof-edit-id").value;
    var medewerkerId = document.getElementById("verlof-add-medewerker").value;
    var startDatum = document.getElementById("verlof-add-start").value;
    var eindDatum = document.getElementById("verlof-add-eind").value;
    if (!medewerkerId || !startDatum || !eindDatum) {
      if (window.showError) window.showError("Vul medewerker, start- en einddatum in.");
      return;
    }
    var payload = {
      medewerkerId: medewerkerId,
      type: document.getElementById("verlof-add-type").value,
      startDatum: startDatum,
      eindDatum: eindDatum,
      aantalDagen: Number(document.getElementById("verlof-add-dagen").value || 1),
      beschrijving: document.getElementById("verlof-add-beschrijving").value,
      status: document.getElementById("verlof-add-status").value,
    };
    submit.disabled = true;
    try {
      if (idVal) {
        await window.verlofDB.update(idVal, payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Verlof bijgewerkt");
      } else {
        await window.verlofDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Verlof " + (payload.status === "ingediend" ? "ingediend" : "opgeslagen"));
      }
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    } finally {
      submit.disabled = false;
    }
  }

  // Beoordeel modal
  function openBeoordeelModal(item) {
    state.beoordeleningId = item.id;
    document.getElementById("verlof-beoordeel-id").value = item.id;
    var periode = fmtDate(item.startDatum) + (item.eindDatum && item.eindDatum !== item.startDatum ? " — " + fmtDate(item.eindDatum) : "");
    document.getElementById("verlof-beoordeel-preview").innerHTML =
      '<strong>' + escapeHtml(medewerkerLabel(item.medewerkerId)) + '</strong> &middot; ' +
      escapeHtml(TYPE_LABELS[item.type] || item.type) + '<br>' +
      '<span style="color:var(--text-secondary);">Periode: ' + escapeHtml(periode) + ' (' + item.aantalDagen + ' dagen)</span>' +
      (item.beschrijving ? '<br><span style="color:var(--text-secondary);">"' + escapeHtml(item.beschrijving) + '"</span>' : '');
    document.getElementById("verlof-beoordeel-opmerking").value = "";
    document.getElementById("verlof-beoordeel-modal").style.display = "flex";
  }
  function closeBeoordeelModal() {
    state.beoordeleningId = null;
    document.getElementById("verlof-beoordeel-modal").style.display = "none";
  }

  function wireEvents() {
    document.getElementById("verlof-add-btn").addEventListener("click", function () { openAddModal(null); });
    document.getElementById("verlof-add-close-btn").addEventListener("click", closeAddModal);
    document.getElementById("verlof-add-cancel-btn").addEventListener("click", closeAddModal);
    document.getElementById("verlof-add-form").addEventListener("submit", submitAddForm);

    document.getElementById("verlof-search").addEventListener("input", function (e) { state.search = e.target.value || ""; state.page = 1; render(); });

    var tabMine = document.getElementById("verlof-tab-mine");
    var tabAll = document.getElementById("verlof-tab-all");
    function setTab(mine) {
      state.onlyMine = !!mine; state.page = 1;
      tabMine.classList.toggle("filter-chip--active", mine);
      tabAll.classList.toggle("filter-chip--active", !mine);
      tabMine.setAttribute("aria-selected", mine ? "true" : "false");
      tabAll.setAttribute("aria-selected", mine ? "false" : "true");
      render();
    }
    tabMine.addEventListener("click", function () { setTab(true); });
    tabAll.addEventListener("click", function () { setTab(false); });

    document.getElementById("verlof-archived-toggle").addEventListener("change", function (e) { state.showArchived = !!e.target.checked; state.page = 1; render(); });
    document.getElementById("verlof-filter-status").addEventListener("change", function (e) { state.filterStatus = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("verlof-filter-type").addEventListener("change", function (e) { state.filterType = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("verlof-rows-per-page").addEventListener("change", function (e) { state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render(); });
    document.getElementById("verlof-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("verlof-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("verlof-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("verlof-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    document.getElementById("verlof-tbody").addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = window.verlofDB.getByIdSync(id);
      if (!item) return;
      var action = btn.getAttribute("data-action");
      try {
        if (action === "edit") openAddModal(item);
        else if (action === "indienen") {
          await window.verlofDB.indienen(id);
          if (window.showActionFeedback) window.showActionFeedback("saved", "Aanvraag ingediend");
        }
        else if (action === "beoordeel") openBeoordeelModal(item);
        else if (action === "annuleer") {
          await window.verlofDB.annuleren(id);
          if (window.showActionFeedback) window.showActionFeedback("saved", "Aanvraag geannuleerd");
        }
        else if (action === "archive") {
          await window.verlofDB.archive(id);
          if (window.showActionFeedback) window.showActionFeedback("archived", "Aanvraag gearchiveerd");
        }
        else if (action === "restore") {
          await window.verlofDB.restore(id);
          if (window.showActionFeedback) window.showActionFeedback("restored", "Aanvraag hersteld");
        }
        else if (action === "purge") {
          var ok = await window.showSliderConfirmModal({
            title: "Bent u zeker dat dit verwijderd wordt?",
            preview: (item && (item.medewerker_naam || item.medewerkerNaam)) || "Verlofaanvraag",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren",
          });
          if (ok) {
            await window.verlofDB.delete(id);
            if (window.showActionFeedback) window.showActionFeedback("deleted", "Aanvraag verwijderd");
          }
        }
      } catch (err) {
        if (window.showError) window.showError("Actie mislukt: " + (err && err.message || err));
      }
    });

    // Beoordeel modal handlers
    document.getElementById("verlof-beoordeel-close-btn").addEventListener("click", closeBeoordeelModal);
    document.getElementById("verlof-beoordeel-cancel-btn").addEventListener("click", closeBeoordeelModal);
    document.getElementById("verlof-beoordeel-goedkeuren-btn").addEventListener("click", async function () {
      var id = state.beoordeleningId; if (!id) return;
      var opmerking = document.getElementById("verlof-beoordeel-opmerking").value;
      try {
        await window.verlofDB.goedkeuren(id, opmerking);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Aanvraag goedgekeurd");
        closeBeoordeelModal();
      } catch (err) {
        if (window.showError) window.showError("Goedkeuren mislukt: " + (err && err.message || err));
      }
    });
    document.getElementById("verlof-beoordeel-afwijzen-btn").addEventListener("click", async function () {
      var id = state.beoordeleningId; if (!id) return;
      var opmerking = document.getElementById("verlof-beoordeel-opmerking").value;
      try {
        await window.verlofDB.afwijzen(id, opmerking);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Aanvraag afgewezen");
        closeBeoordeelModal();
      } catch (err) {
        if (window.showError) window.showError("Afwijzen mislukt: " + (err && err.message || err));
      }
    });

    window.addEventListener("besa:verlof-updated", render);
    window.addEventListener("besa:medewerkers-updated", function () { fillMedewerkerSelect(); render(); });
  }

  function init() {
    if (!window.verlofDB) { console.error("[verlof] verlofDB niet geladen"); return; }
    wireEvents();
    render();
    window.verlofDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
