/* global window, document */
/**
 * incidenten.js — page-script voor het Incidenten overzicht.
 *
 * Bron-van-waarheid:
 *   - window.incidentenDB (Supabase tabel `public.incidenten`)
 *   - window.clientenDB / window.medewerkersDB / window.locatiesDB voor
 *     dropdown-opties en het tonen van namen i.p.v. UUID's.
 *   - window.profilesDB voor de "Mijn cliënten"-tab (filter op
 *     incidenten waar de huidige user melder of beoordelaar is).
 *
 * Re-render triggers:
 *   - besa:incidenten-updated
 *   - besa:medewerkers-updated, besa:clienten-updated (om dropdowns vers te houden)
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    tab: "alle",          // 'alle' | 'mijn'
    search: "",
    filterStatus: "",
    filterLocatie: "",
    filterMedewerker: "",
    filterCategorie: "",
    filterClient: "",
    filterDatumVan: "",
    filterDatumTot: "",
    showArchived: false,
    page: 1,
    pageSize: 50,
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function getAllIncidenten() {
    if (!window.incidentenDB) return [];
    try { return window.incidentenDB.getAllSync() || []; } catch (e) { return []; }
  }

  function getAllClienten() {
    if (!window.clientenDB) return [];
    try { return window.clientenDB.getAllSync() || []; } catch (e) { return []; }
  }

  function getAllMedewerkers() {
    if (!window.medewerkersDB) return [];
    try { return window.medewerkersDB.getAllSync() || []; } catch (e) { return []; }
  }

  function getAllLocaties() {
    if (!window.locatiesDB) return [];
    try { return window.locatiesDB.getAllSync() || []; } catch (e) { return []; }
  }

  function clientLabel(c) {
    if (!c) return "—";
    var nm = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
    if (c.clientnummer) nm += " (" + c.clientnummer + ")";
    return nm || "—";
  }

  function medewerkerLabel(m) {
    if (!m) return "—";
    var nm = ((m.voornaam || "") + " " + (m.achternaam || "")).trim();
    return nm || "—";
  }

  function locatieLabel(l) {
    if (!l) return "—";
    return l.naam || "—";
  }

  function findClientById(id) {
    if (!id) return null;
    return getAllClienten().find(function (c) { return c && String(c.id) === String(id); }) || null;
  }
  function findMedewerkerById(id) {
    if (!id) return null;
    return getAllMedewerkers().find(function (m) { return m && String(m.id) === String(id); }) || null;
  }
  function findLocatieById(id) {
    if (!id) return null;
    return getAllLocaties().find(function (l) { return l && String(l.id) === String(id); }) || null;
  }

  function statusInfo(status) {
    var rec = (window.incidentenDB && window.incidentenDB.STATUSES || []).find(function (s) {
      return s.value === status;
    });
    return rec || { value: status, label: status, className: "incident-status--default" };
  }

  // Datum helpers
  function pad(n) { return String(n).padStart(2, "0"); }
  function formatNlDateTime(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear()
      + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function formatNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(value);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function isoToLocalInput(value) {
    if (!value) return "";
    var t = Date.parse(value);
    if (!isFinite(t)) return "";
    var d = new Date(t);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
      + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function localInputToIso(value) {
    if (!value) return null;
    var d = new Date(value);
    return isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // ---------------------------------------------------------------------------
  // Toast (gebruikt save-feedback.js als beschikbaar, anders fallback)
  // ---------------------------------------------------------------------------
  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("inc-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---------------------------------------------------------------------------
  // Filter + sort
  // ---------------------------------------------------------------------------
  function getFilteredIncidenten() {
    var all = getAllIncidenten();
    var profile = window.profilesDB ? window.profilesDB.getCurrentSync() : null;
    var myMedId = profile && profile.medewerkerId ? String(profile.medewerkerId) : null;

    return all
      .filter(function (i) { return i && (state.showArchived ? i.archived : !i.archived); })
      .filter(function (i) {
        if (state.tab !== "mijn") return true;
        if (!myMedId) return false;
        return String(i.melderId || "") === myMedId || String(i.beoordelaarId || "") === myMedId;
      })
      .filter(function (i) {
        if (state.filterStatus && i.status !== state.filterStatus) return false;
        if (state.filterCategorie && i.categorie !== state.filterCategorie) return false;
        if (state.filterClient && String(i.clientId || "") !== state.filterClient) return false;
        if (state.filterLocatie && String(i.locatieId || "") !== state.filterLocatie) return false;
        if (state.filterMedewerker) {
          var fm = state.filterMedewerker;
          if (String(i.melderId || "") !== fm && String(i.beoordelaarId || "") !== fm) return false;
        }
        if (state.filterDatumVan) {
          var van = Date.parse(state.filterDatumVan + "T00:00:00");
          var d = Date.parse(i.incidentDatum || 0);
          if (isFinite(van) && (!isFinite(d) || d < van)) return false;
        }
        if (state.filterDatumTot) {
          var tot = Date.parse(state.filterDatumTot + "T23:59:59");
          var d2 = Date.parse(i.incidentDatum || 0);
          if (isFinite(tot) && (!isFinite(d2) || d2 > tot)) return false;
        }
        if (state.search) {
          var q = state.search.toLowerCase();
          var hay = [
            i.omschrijving, i.genomenMaatregelen, i.categorie, i.status,
            clientLabel(findClientById(i.clientId)),
            medewerkerLabel(findMedewerkerById(i.beoordelaarId)),
            medewerkerLabel(findMedewerkerById(i.melderId)),
            locatieLabel(findLocatieById(i.locatieId)),
          ].join(" ").toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        var ta = Date.parse(a.incidentDatum || 0) || 0;
        var tb = Date.parse(b.incidentDatum || 0) || 0;
        return tb - ta;
      });
  }

  // ---------------------------------------------------------------------------
  // Render: stats, tabel, paginatie
  // ---------------------------------------------------------------------------
  function renderStats() {
    var all = getAllIncidenten().filter(function (i) { return i && !i.archived; });
    $("inc-stat-total").textContent = String(all.length);
    $("inc-stat-afwachting").textContent = String(all.filter(function (i) { return i.status === "in_afwachting"; }).length);
    $("inc-stat-behandeling").textContent = String(all.filter(function (i) { return i.status === "in_behandeling"; }).length);
    $("inc-stat-opgelost").textContent = String(all.filter(function (i) { return i.status === "opgelost"; }).length);
  }

  function renderTable() {
    var tbody = $("inc-tbody");
    if (!tbody) return;
    var rows = getFilteredIncidenten();

    var total = rows.length;
    var pageSize = state.pageSize;
    var maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (state.page > maxPage) state.page = maxPage;

    var start = (state.page - 1) * pageSize;
    var pageRows = rows.slice(start, start + pageSize);

    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="incident-empty">Geen resultaten gevonden</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(renderRowHtml).join("");
    }

    // Paginatie footer
    $("inc-pager-range").textContent = total + " van " + total;
    $("inc-pager-page").textContent = "Pagina " + state.page + " van " + maxPage;
    $("inc-pager-first").disabled = state.page <= 1;
    $("inc-pager-prev").disabled = state.page <= 1;
    $("inc-pager-next").disabled = state.page >= maxPage;
    $("inc-pager-last").disabled = state.page >= maxPage;

    // Click & action wiring
    Array.prototype.forEach.call(tbody.querySelectorAll("tr[data-id]"), function (tr) {
      var id = tr.getAttribute("data-id");

      tr.addEventListener("click", function (e) {
        if (e.target.closest("button, input")) return;
        openEditModal(id);
      });

      var archBtn = tr.querySelector(".inc-archive-btn");
      if (archBtn) archBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openArchiveModal(id); });

      var restoreBtn = tr.querySelector(".inc-restore-btn");
      if (restoreBtn) restoreBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        window.incidentenDB.restore(id).then(function () {
          toast("restored", "Incident hersteld");
        }).catch(function (err) { toast("error", "Herstellen mislukt: " + (err.message || err)); });
      });

      var purgeBtn = tr.querySelector(".inc-purge-btn");
      if (purgeBtn) purgeBtn.addEventListener("click", function (ev) { ev.stopPropagation(); openPurgeModal(id); });
    });
  }

  function renderRowHtml(i) {
    var cli = findClientById(i.clientId);
    var bo = findMedewerkerById(i.beoordelaarId);
    var stat = statusInfo(i.status);

    var actionsHtml;
    if (i.archived) {
      actionsHtml = '<div class="hr-row-actions">'
        + '<button type="button" class="btn-outline hr-restore-btn inc-restore-btn">Herstel</button>'
        + '<button type="button" class="employee-delete-btn inc-purge-btn" aria-label="Definitief verwijderen">'
        + trashSvg() + '</button>'
        + '</div>';
    } else {
      actionsHtml = '<button type="button" class="employee-delete-btn inc-archive-btn" aria-label="Archiveren">'
        + trashSvg() + '</button>';
    }

    return '<tr data-id="' + escAttr(i.id) + '">'
      + '<td class="th-check"><input type="checkbox" class="table-checkbox" aria-label="Selecteer rij" /></td>'
      + '<td>' + escHtml(clientLabel(cli)) + '</td>'
      + '<td>' + escHtml(i.categorie || "Overig") + '</td>'
      + '<td><span class="incident-status-pill ' + stat.className + '">' + escHtml(stat.label) + '</span></td>'
      + '<td>' + escHtml(medewerkerLabel(bo)) + '</td>'
      + '<td>' + escHtml(formatNlDateTime(i.laatstGewijzigd)) + '</td>'
      + '<td>' + escHtml(formatNlDate(i.incidentDatum)) + '</td>'
      + '<td class="cl-actions-th">' + actionsHtml + '</td>'
      + '</tr>';
  }

  function trashSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
      + '<polyline points="3 6 5 6 21 6"/>'
      + '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
      + '<path d="M10 11v6M14 11v6"/>'
      + '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escAttr(s) { return escHtml(s); }

  function renderAll() {
    populateDropdowns();
    renderStats();
    renderTable();
  }

  // ---------------------------------------------------------------------------
  // Dropdown options (filter-bar + form)
  // ---------------------------------------------------------------------------
  function populateDropdowns() {
    populateFilterDropdowns();
    populateFormDropdowns();
  }

  function populateFilterDropdowns() {
    populateSelect($("inc-filter-locatie"), getAllLocaties().filter(function (l) { return l && !l.archived; }), {
      keepFirst: true,
      idKey: "id",
      labelFn: locatieLabel,
      currentValue: state.filterLocatie,
    });
    populateSelect($("inc-filter-medewerker"), getAllMedewerkers().filter(function (m) { return m && !m.archived; }), {
      keepFirst: true,
      idKey: "id",
      labelFn: medewerkerLabel,
      currentValue: state.filterMedewerker,
    });
    populateSelect($("inc-filter-client"), getAllClienten().filter(function (c) { return c && !c.archived; }), {
      keepFirst: true,
      idKey: "id",
      labelFn: clientLabel,
      currentValue: state.filterClient,
    });
    var cats = (window.incidentenDB && window.incidentenDB.CATEGORIES) || [];
    populateSelect($("inc-filter-categorie"), cats.map(function (c) { return { id: c, label: c }; }), {
      keepFirst: true,
      idKey: "id",
      labelFn: function (o) { return o.label; },
      currentValue: state.filterCategorie,
    });
  }

  function populateFormDropdowns() {
    populateSelect($("inc-form-client"), getAllClienten().filter(function (c) { return c && !c.archived; }), {
      keepFirst: true, idKey: "id", labelFn: clientLabel,
    });
    populateSelect($("inc-form-locatie"), getAllLocaties().filter(function (l) { return l && !l.archived; }), {
      keepFirst: true, idKey: "id", labelFn: locatieLabel,
    });
    populateSelect($("inc-form-melder"), getAllMedewerkers().filter(function (m) { return m && !m.archived; }), {
      keepFirst: true, idKey: "id", labelFn: medewerkerLabel,
    });
    populateSelect($("inc-form-beoordelaar"), getAllMedewerkers().filter(function (m) { return m && !m.archived; }), {
      keepFirst: true, idKey: "id", labelFn: medewerkerLabel,
    });
    var cats = (window.incidentenDB && window.incidentenDB.CATEGORIES) || [];
    var catSel = $("inc-form-categorie");
    if (catSel && catSel.options.length === 0) {
      cats.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c; o.textContent = c;
        catSel.appendChild(o);
      });
    }
  }

  function populateSelect(sel, items, opts) {
    if (!sel) return;
    var first = opts.keepFirst && sel.options.length ? sel.options[0].cloneNode(true) : null;
    sel.innerHTML = "";
    if (first) sel.appendChild(first);
    items.forEach(function (it) {
      var o = document.createElement("option");
      o.value = String(it[opts.idKey]);
      o.textContent = opts.labelFn(it);
      sel.appendChild(o);
    });
    if (opts.currentValue != null) sel.value = String(opts.currentValue);
  }

  // ---------------------------------------------------------------------------
  // Add / Edit modal
  // ---------------------------------------------------------------------------
  var editingId = null;

  function openAddModal() {
    editingId = null;
    $("inc-form-title").textContent = "Incident melden";
    $("inc-form-submit").textContent = "Indienen";
    $("inc-form-id").value = "";
    populateFormDropdowns();

    // Defaults
    var nowIso = new Date().toISOString();
    $("inc-form-datum").value = isoToLocalInput(nowIso);
    $("inc-form-status").value = "in_afwachting";
    $("inc-form-categorie").value = "Overig";
    $("inc-form-client").value = "";
    $("inc-form-locatie").value = "";
    $("inc-form-omschrijving").value = "";
    $("inc-form-maatregelen").value = "";

    var profile = window.profilesDB ? window.profilesDB.getCurrentSync() : null;
    if (profile && profile.medewerkerId) {
      $("inc-form-melder").value = String(profile.medewerkerId);
    } else {
      $("inc-form-melder").value = "";
    }
    $("inc-form-beoordelaar").value = "";

    $("inc-form-error").hidden = true;
    showModal("inc-form-modal");
  }

  function openEditModal(id) {
    var rec = window.incidentenDB.getByIdSync(id);
    if (!rec) return;
    editingId = id;
    $("inc-form-title").textContent = "Incident bewerken";
    $("inc-form-submit").textContent = "Opslaan";
    $("inc-form-id").value = id;
    populateFormDropdowns();

    $("inc-form-client").value = rec.clientId || "";
    $("inc-form-categorie").value = rec.categorie || "Overig";
    $("inc-form-status").value = rec.status || "in_afwachting";
    $("inc-form-datum").value = isoToLocalInput(rec.incidentDatum);
    $("inc-form-locatie").value = rec.locatieId || "";
    $("inc-form-melder").value = rec.melderId || "";
    $("inc-form-beoordelaar").value = rec.beoordelaarId || "";
    $("inc-form-omschrijving").value = rec.omschrijving || "";
    $("inc-form-maatregelen").value = rec.genomenMaatregelen || "";
    $("inc-form-error").hidden = true;
    showModal("inc-form-modal");
  }

  function closeFormModal() { hideModal("inc-form-modal"); }

  async function submitForm(ev) {
    ev.preventDefault();
    var clientId = $("inc-form-client").value;
    if (!clientId) { showFormError("Kies een cliënt."); return; }

    var datumLocal = $("inc-form-datum").value;
    if (!datumLocal) { showFormError("Vul een datum in."); return; }

    var payload = {
      clientId: clientId,
      categorie: $("inc-form-categorie").value || "Overig",
      status: $("inc-form-status").value || "in_afwachting",
      incidentDatum: localInputToIso(datumLocal),
      locatieId: $("inc-form-locatie").value || null,
      melderId: $("inc-form-melder").value || null,
      beoordelaarId: $("inc-form-beoordelaar").value || null,
      omschrijving: $("inc-form-omschrijving").value || "",
      genomenMaatregelen: $("inc-form-maatregelen").value || "",
    };

    var btn = $("inc-form-submit");
    btn.disabled = true;
    var origLabel = btn.textContent;
    btn.textContent = "Bezig…";
    try {
      if (editingId) {
        await window.incidentenDB.update(editingId, payload);
        toast("saved", "Incident bijgewerkt");
      } else {
        await window.incidentenDB.add(payload);
        toast("saved", "Incident toegevoegd");
      }
      closeFormModal();
    } catch (err) {
      showFormError("Opslaan mislukt: " + (err && err.message ? err.message : String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = origLabel;
    }
  }

  function showFormError(msg) {
    var el = $("inc-form-error");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Archive / Purge slider modals
  // ---------------------------------------------------------------------------
  function setupSliderModal(modalId, sliderId, confirmId, cancelId, closeId, onConfirm) {
    var slider = $(sliderId);
    var confirm = $(confirmId);
    if (!slider || !confirm) return;

    function reset() { slider.value = 0; confirm.disabled = true; }
    function close() { hideModal(modalId); reset(); }
    function open(previewText, ctx) {
      reset();
      $(modalId.replace("-modal", "-preview")).textContent = previewText || "";
      slider.dataset.ctx = ctx || "";
      showModal(modalId);
    }

    slider.addEventListener("input", function () {
      confirm.disabled = Number(slider.value) < 100;
    });
    confirm.addEventListener("click", function () {
      var ctx = slider.dataset.ctx;
      close();
      onConfirm(ctx);
    });
    $(cancelId).addEventListener("click", close);
    $(closeId).addEventListener("click", close);

    return { open: open, close: close };
  }

  var archiveSlider, purgeSlider;

  function openArchiveModal(id) {
    var rec = window.incidentenDB.getByIdSync(id);
    var preview = rec
      ? clientLabel(findClientById(rec.clientId)) + " — " + (rec.categorie || "Overig")
      : "";
    archiveSlider.open(preview, id);
  }

  function openPurgeModal(id) {
    var rec = window.incidentenDB.getByIdSync(id);
    var preview = rec
      ? clientLabel(findClientById(rec.clientId)) + " — " + (rec.categorie || "Overig")
      : "";
    purgeSlider.open(preview, id);
  }

  // ---------------------------------------------------------------------------
  // Modal show/hide
  // ---------------------------------------------------------------------------
  function showModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
  }
  function hideModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
  }

  // ---------------------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------------------
  function setActiveTab(tabName) {
    state.tab = tabName;
    state.page = 1;
    var mijn = $("inc-tab-mijn");
    var alle = $("inc-tab-alle");
    if (mijn && alle) {
      mijn.classList.toggle("is-active", tabName === "mijn");
      mijn.setAttribute("aria-selected", tabName === "mijn" ? "true" : "false");
      alle.classList.toggle("is-active", tabName === "alle");
      alle.setAttribute("aria-selected", tabName === "alle" ? "true" : "false");
    }
    var t = $("inc-section-title");
    if (t) t.textContent = tabName === "mijn" ? "Mijn cliënten" : "Alle incidenten";
    renderTable();
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireUp() {
    $("inc-add-open-btn").addEventListener("click", openAddModal);
    $("inc-form-cancel").addEventListener("click", closeFormModal);
    $("inc-form-close").addEventListener("click", closeFormModal);
    $("inc-form").addEventListener("submit", submitForm);

    archiveSlider = setupSliderModal(
      "inc-archive-modal", "inc-ar-slider", "inc-ar-confirm",
      "inc-ar-cancel", "inc-ar-close",
      async function (id) {
        try { await window.incidentenDB.archive(id); toast("archived", "Incident gearchiveerd"); }
        catch (err) { toast("error", "Archiveren mislukt: " + (err.message || err)); }
      }
    );
    purgeSlider = setupSliderModal(
      "inc-purge-modal", "inc-purge-slider", "inc-purge-confirm",
      "inc-purge-cancel", "inc-purge-close",
      async function (id) {
        try { await window.incidentenDB.delete(id); toast("deleted", "Incident verwijderd"); }
        catch (err) { toast("error", "Verwijderen mislukt: " + (err.message || err)); }
      }
    );

    $("inc-tab-mijn").addEventListener("click", function () { setActiveTab("mijn"); });
    $("inc-tab-alle").addEventListener("click", function () { setActiveTab("alle"); });

    var search = $("inc-search");
    if (search) search.addEventListener("input", function () {
      state.search = search.value || ""; state.page = 1; renderTable();
    });

    [
      ["inc-filter-status", "filterStatus"],
      ["inc-filter-locatie", "filterLocatie"],
      ["inc-filter-medewerker", "filterMedewerker"],
      ["inc-filter-categorie", "filterCategorie"],
      ["inc-filter-client", "filterClient"],
      ["inc-filter-datum-van", "filterDatumVan"],
      ["inc-filter-datum-tot", "filterDatumTot"],
    ].forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;
      el.addEventListener("change", function () {
        state[p[1]] = el.value || "";
        state.page = 1;
        renderTable();
      });
    });

    var arch = $("inc-archived-toggle");
    if (arch) arch.addEventListener("change", function () {
      state.showArchived = !!arch.checked; state.page = 1; renderTable();
    });

    var rows = $("inc-rows-per-page");
    if (rows) rows.addEventListener("change", function () {
      state.pageSize = Number(rows.value) || 50;
      state.page = 1;
      renderTable();
    });

    $("inc-pager-first").addEventListener("click", function () { state.page = 1; renderTable(); });
    $("inc-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page--; renderTable(); } });
    $("inc-pager-next").addEventListener("click", function () { state.page++; renderTable(); });
    $("inc-pager-last").addEventListener("click", function () {
      var total = getFilteredIncidenten().length;
      state.page = Math.max(1, Math.ceil(total / state.pageSize));
      renderTable();
    });

    // Re-render zodra Supabase iets pusht.
    ["besa:incidenten-updated", "besa:clienten-updated", "besa:medewerkers-updated",
     "besa:locaties-updated", "besa:profile-updated"].forEach(function (evt) {
      window.addEventListener(evt, renderAll);
    });
  }

  function init() {
    wireUp();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
