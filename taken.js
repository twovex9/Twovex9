/* global window, document */
/**
 * taken.js — page-script voor /taken.html (BS2-port: Taken).
 *
 * Volgt het beleid.js patroon: render + filters + add/edit/archive/purge slider-modals.
 * Status-pills zijn klikbaar voor quick-advance: open → in_progress → voltooid.
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    showArchived: false,
    hideDone: true,
    onlyMine: false,
    filterStatus: "",
    filterPrioriteit: "",
    // Sprint 8 / S8 — BS2 parity uitbreidingen
    filterTeamlid: "",          // medewerker_id van toegewezenAanId
    filterDeadline: "",         // YYYY-MM-DD
    filterAanmaakdatum: "",     // YYYY-MM-DD (matcht op datum-deel van aanmaakdatum)
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    editingId: null,
    archivingId: null,
    purgingId: null,
  };

  // 1-op-1 BS2: verbatim status/priority-waarden.
  var STATUS_LABELS = {
    "--": "—",
    "In behandeling": "In behandeling",
    "Voltooid": "Voltooid",
  };
  var STATUS_NEXT = { "--": "In behandeling", "In behandeling": "Voltooid", "Voltooid": "--" };
  var STATUS_CLASS = {
    "--": "color:var(--text-muted);background:var(--line);",
    "In behandeling": "color:var(--yellow);background:var(--yellow-soft);",
    "Voltooid": "color:var(--green);background:var(--green-soft);",
  };
  var PRIORITEIT_LABELS = { Low: "Low", Medium: "Medium", High: "High" };
  var PRIORITEIT_CLASS = {
    Low: "color:var(--text-muted);",
    Medium: "color:var(--blue);",
    High: "color:var(--red);",
  };

  function fmtNlDate(iso) {
    if (!iso) return "";
    var s = String(iso);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    var t = Date.parse(s);
    if (!isFinite(t)) return "";
    var d = new Date(t);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function fmtNlDateTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "";
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

  function trashSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  }

  function medewerkerLabel(id) {
    if (!id || !window.medewerkersDB) return "—";
    var m = window.medewerkersDB.getByIdSync(id);
    if (!m) return "—";
    return (m.voornaam || "") + " " + (m.achternaam || "");
  }

  function getCurrentMedewerkerId() {
    try {
      var p = window.besaCurrentProfile || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync());
      return p && p.medewerker_id ? p.medewerker_id : null;
    } catch (e) { return null; }
  }

  function getVisible() {
    var items = (window.takenDB && window.takenDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    var myId = state.onlyMine ? getCurrentMedewerkerId() : null;
    return items.filter(function (t) {
      if (!t) return false;
      if (!!t.archived !== !!state.showArchived) return false;
      if (state.hideDone && t.status === "Voltooid") return false;
      if (state.filterStatus && t.status !== state.filterStatus) return false;
      if (state.filterPrioriteit && t.prioriteit !== state.filterPrioriteit) return false;
      // Sprint 8 / S8 — teamlid + deadline + aanmaakdatum filters
      if (state.filterTeamlid && String(t.toegewezenAanId) !== String(state.filterTeamlid)) return false;
      if (state.filterDeadline) {
        var dl = String(t.deadline || "").slice(0, 10);
        if (dl !== state.filterDeadline) return false;
      }
      if (state.filterAanmaakdatum) {
        var ad = String(t.aanmaakdatum || "").slice(0, 10);
        if (ad !== state.filterAanmaakdatum) return false;
      }
      if (state.onlyMine) {
        if (!myId) return false;
        if (String(t.toegewezenAanId) !== String(myId)) return false;
      }
      if (!q) return true;
      var hay = (t.naam || "") + " " + (t.beschrijving || "") + " " + (t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId)) + " " + (t.aangemaaktDoorNaam || medewerkerLabel(t.aangemaaktDoorId));
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function statusPill(t) {
    var label = STATUS_LABELS[t.status] || t.status;
    var style = STATUS_CLASS[t.status] || "";
    return '<button class="badge" data-action="advance-status" data-id="' + escapeHtml(t.id) + '" ' +
           'style="padding:4px 10px;border-radius:var(--r-pill);border:0;cursor:pointer;font-size:var(--font-ui-badge);font-weight:600;' + style + '" ' +
           'title="Klik om status door te zetten">' + escapeHtml(label) + '</button>';
  }

  function prioriteitPill(t) {
    var label = PRIORITEIT_LABELS[t.prioriteit] || t.prioriteit;
    var style = PRIORITEIT_CLASS[t.prioriteit] || "";
    return '<span style="font-weight:600;font-size:var(--font-table-cell);' + style + '">' + escapeHtml(label) + '</span>';
  }

  function renderRow(t) {
    var actionsCell = t.archived
      ? '<div class="hr-row-actions">' +
        '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(t.id) + '">Herstel</button>' +
        '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(t.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button>' +
        '</div>'
      : '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(t.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';

    var nameButton = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(t.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' + escapeHtml(t.naam) + '</button>';

    return '<tr data-id="' + escapeHtml(t.id) + '">' +
      '<td data-col="naam">' + nameButton + (t.beschrijving ? '<br><span style="color:var(--text-muted);font-size:12px;">' + escapeHtml(t.beschrijving.slice(0, 80)) + (t.beschrijving.length > 80 ? "…" : "") + '</span>' : '') + '</td>' +
      '<td data-col="toegewezen">' + escapeHtml(t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId) || "—") + '</td>' +
      '<td data-col="aangemaakt_door">' + escapeHtml(t.aangemaaktDoorNaam || medewerkerLabel(t.aangemaaktDoorId) || "—") + '</td>' +
      '<td data-col="status">' + statusPill(t) + '</td>' +
      '<td data-col="deadline">' + escapeHtml(fmtNlDate(t.deadline)) + '</td>' +
      '<td data-col="prioriteit">' + prioriteitPill(t) + '</td>' +
      '<td class="hr-actions-cell">' + actionsCell + '</td>' +
    '</tr>';
  }

  // 1-op-1 BS2: geen paginatie — alle taken, gegroepeerd op deadline-bucket.
  function deadlineBucket(t) {
    var dl = String(t && t.deadline || "").slice(0, 10);
    if (!dl) return "geen";
    var now = new Date();
    var today = now.getFullYear() + "-"
      + ("0" + (now.getMonth() + 1)).slice(-2) + "-"
      + ("0" + now.getDate()).slice(-2);
    if (dl < today) return "telaat";
    if (dl === today) return "vandaag";
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dow = end.getDay(); // 0=zo
    var toSun = (7 - dow) % 7; // dagen tot zondag
    end.setDate(end.getDate() + toSun);
    var endStr = end.getFullYear() + "-"
      + ("0" + (end.getMonth() + 1)).slice(-2) + "-"
      + ("0" + end.getDate()).slice(-2);
    if (dl <= endStr) return "dezeweek";
    return "later";
  }

  var BUCKETS = [
    { key: "vandaag", label: "Vandaag" },
    { key: "telaat", label: "Te laat" },
    { key: "dezeweek", label: "Deze week" },
    { key: "later", label: "Later" },
    { key: "geen", label: "Geen deadline" },
  ];

  function render() {
    var tbody = document.getElementById("taken-tbody");
    if (!tbody) return;

    var visible = getVisible();
    var groups = { vandaag: [], telaat: [], dezeweek: [], later: [], geen: [] };
    visible.forEach(function (t) {
      var b = deadlineBucket(t);
      (groups[b] || groups.geen).push(t);
    });

    var html = "";
    BUCKETS.forEach(function (bk) {
      var rows = groups[bk.key] || [];
      html += '<tr class="taken-group-row"><td colspan="7">'
        + '<span class="taken-group-name">' + escapeHtml(bk.label) + '</span> '
        + '<span class="taken-group-count">(' + rows.length + ')</span></td></tr>';
      if (!rows.length) {
        html += '<tr class="taken-group-empty"><td colspan="7">Geen taken</td></tr>';
      } else {
        html += rows.map(renderRow).join("");
      }
    });
    tbody.innerHTML = html;

    var rangeEl = document.getElementById("taken-pager-range");
    if (rangeEl) rangeEl.textContent = visible.length + " " + (visible.length === 1 ? "taak" : "taken");
    var pageEl = document.getElementById("taken-pager-page");
    if (pageEl) pageEl.textContent = "";
    ["taken-pager-first", "taken-pager-prev", "taken-pager-next", "taken-pager-last"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.disabled = true; el.style.display = "none"; }
    });
    var rppWrap = document.querySelector('label[for="taken-rows-per-page"]');
    if (rppWrap) rppWrap.style.display = "none";
  }

  /**
   * Sprint 8 / S8 — vul Teamlid-filter dropdown met alle actieve medewerkers.
   * Wordt herstellen na medewerkers-data update via besa:medewerkers-updated event.
   */
  // 1-op-1 BS2: "Selecteer een teamlid" filtert op assignee (user-id uit de
  // taak zelf), niet op medewerker-id. Vul uit de distinct assignees.
  function populateTeamlidFilter(sel) {
    if (!sel) return;
    var prev = sel.value || "";
    sel.innerHTML = '<option value="">Alle teamleden</option>';
    var items = (window.takenDB && window.takenDB.getAllSync && window.takenDB.getAllSync()) || [];
    var byId = {};
    items.forEach(function (t) {
      if (t && t.toegewezenAanId && !byId[t.toegewezenAanId]) {
        byId[t.toegewezenAanId] = t.toegewezenAanNaam || t.toegewezenAanId;
      }
    });
    Object.keys(byId)
      .sort(function (a, b) { return String(byId[a]).localeCompare(String(byId[b]), "nl", { sensitivity: "base" }); })
      .forEach(function (id) {
        var opt = document.createElement("option");
        opt.value = id;
        opt.textContent = byId[id] || "Onbekend";
        sel.appendChild(opt);
      });
    if (prev) sel.value = prev;
  }

  /**
   * Sprint 8 / S8 — reset alle filters (mirror BS2 Reset-knop).
   */
  function resetAllFilters() {
    state.search = "";
    state.filterStatus = "";
    state.filterPrioriteit = "";
    state.filterTeamlid = "";
    state.filterDeadline = "";
    state.filterAanmaakdatum = "";
    state.showArchived = false;
    state.hideDone = true;
    state.page = 1;
    var ids = [
      "taken-search",
      "taken-filter-status",
      "taken-filter-prioriteit",
      "taken-filter-teamlid",
      "taken-filter-deadline",
      "taken-filter-aanmaakdatum",
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    var arch = document.getElementById("taken-archived-toggle");
    if (arch) arch.checked = false;
    var hide = document.getElementById("taken-hide-done-toggle");
    if (hide) hide.checked = true;
    render();
    if (window.showActionFeedback) {
      window.showActionFeedback("info", "Filters gewist", "Alle taken-filters zijn teruggezet.");
    }
  }

  function fillMedewerkerSelect() {
    var sel = document.getElementById("taken-add-toegewezen");
    if (!sel || !window.medewerkersDB) return;
    var items = (window.medewerkersDB.getAllSync() || []).filter(function (m) { return m && !m.archived; });
    items.sort(function (a, b) {
      return (a.voornaam + " " + a.achternaam).localeCompare(b.voornaam + " " + b.achternaam);
    });
    var keep = sel.value;
    sel.innerHTML = '<option value="">— Niemand —</option>' + items.map(function (m) {
      return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml((m.voornaam || "") + " " + (m.achternaam || "")) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }

  function openAddModal(item) {
    state.editingId = item ? item.id : null;
    var modal = document.getElementById("taken-add-modal");
    var title = document.getElementById("taken-add-title");
    var idInput = document.getElementById("taken-edit-id");
    var naam = document.getElementById("taken-add-naam");
    var beschrijving = document.getElementById("taken-add-beschrijving");
    var toegewezen = document.getElementById("taken-add-toegewezen");
    var status = document.getElementById("taken-add-status");
    var prioriteit = document.getElementById("taken-add-prioriteit");
    var deadline = document.getElementById("taken-add-deadline");
    var submit = document.getElementById("taken-add-submit-btn");
    if (!modal) return;

    fillMedewerkerSelect();

    if (item) {
      title.textContent = "Taak bewerken";
      idInput.value = item.id;
      naam.value = item.naam || "";
      beschrijving.value = item.beschrijving || "";
      toegewezen.value = item.toegewezenAanId || "";
      status.value = item.status || "--";
      prioriteit.value = item.prioriteit || "Low";
      deadline.value = item.deadline ? String(item.deadline).slice(0, 10) : "";
      submit.textContent = "Opslaan";
    } else {
      title.textContent = "Taak toevoegen";
      idInput.value = "";
      naam.value = "";
      beschrijving.value = "";
      toegewezen.value = "";
      status.value = "--";
      prioriteit.value = "Low";
      deadline.value = "";
      submit.textContent = "Toevoegen";
    }
    modal.style.display = "flex";
    setTimeout(function () { naam.focus(); }, 50);
  }

  function closeAddModal() {
    state.editingId = null;
    var modal = document.getElementById("taken-add-modal");
    if (modal) modal.style.display = "none";
  }

  async function submitAddForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("taken-add-submit-btn");
    var idInput = document.getElementById("taken-edit-id");
    var naam = document.getElementById("taken-add-naam");
    var beschrijving = document.getElementById("taken-add-beschrijving");
    var toegewezen = document.getElementById("taken-add-toegewezen");
    var status = document.getElementById("taken-add-status");
    var prioriteit = document.getElementById("taken-add-prioriteit");
    var deadline = document.getElementById("taken-add-deadline");

    if (!naam.value.trim()) {
      naam.focus();
      return;
    }

    var payload = {
      naam: naam.value.trim(),
      beschrijving: beschrijving.value,
      toegewezenAanId: toegewezen.value || null,
      status: status.value,
      prioriteit: prioriteit.value,
      deadline: deadline.value || null,
    };

    submit.disabled = true;
    try {
      if (idInput.value) {
        await window.takenDB.update(idInput.value, payload);
        if (window.showSaveModal) window.showSaveModal({ title: "Bijgewerkt", message: payload.naam });
      } else {
        await window.takenDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", payload.naam);
      }
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
      else console.error("[taken] save failed", err);
    } finally {
      submit.disabled = false;
    }
  }

  function setupSliderModal(modalId, sliderId, confirmBtnId) {
    var slider = document.getElementById(sliderId);
    var confirm = document.getElementById(confirmBtnId);
    if (!slider || !confirm) return;
    slider.addEventListener("input", function () {
      var pct = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", pct + "%");
      confirm.disabled = pct < 100;
    });
  }

  function openArchiveModal(item) {
    state.archivingId = item.id;
    var modal = document.getElementById("taken-archive-modal");
    var preview = document.getElementById("taken-archive-preview");
    var slider = document.getElementById("taken-archive-slider");
    var confirm = document.getElementById("taken-archive-confirm-btn");
    preview.textContent = item.naam || "";
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    confirm.disabled = true;
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closeArchiveModal() {
    state.archivingId = null;
    var modal = document.getElementById("taken-archive-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  function openPurgeModal(item) {
    state.purgingId = item.id;
    var modal = document.getElementById("taken-purge-modal");
    var preview = document.getElementById("taken-purge-preview");
    var slider = document.getElementById("taken-purge-slider");
    var confirm = document.getElementById("taken-purge-confirm-btn");
    preview.textContent = item.naam || "";
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    confirm.disabled = true;
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closePurgeModal() {
    state.purgingId = null;
    var modal = document.getElementById("taken-purge-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  function wireEvents() {
    document.getElementById("taken-add-btn").addEventListener("click", function () { openAddModal(null); });
    document.getElementById("taken-add-close-btn").addEventListener("click", closeAddModal);
    document.getElementById("taken-add-cancel-btn").addEventListener("click", closeAddModal);
    document.getElementById("taken-add-form").addEventListener("submit", submitAddForm);

    document.getElementById("taken-search").addEventListener("input", function (e) { state.search = e.target.value || ""; state.page = 1; render(); });

    var tabMine = document.getElementById("taken-tab-mine");
    var tabAll = document.getElementById("taken-tab-all");
    function setTab(mine) {
      state.onlyMine = !!mine;
      state.page = 1;
      tabMine.classList.toggle("filter-chip--active", mine);
      tabAll.classList.toggle("filter-chip--active", !mine);
      tabMine.setAttribute("aria-selected", mine ? "true" : "false");
      tabAll.setAttribute("aria-selected", mine ? "false" : "true");
      render();
    }
    tabMine.addEventListener("click", function () { setTab(true); });
    tabAll.addEventListener("click", function () { setTab(false); });

    document.getElementById("taken-archived-toggle").addEventListener("change", function (e) { state.showArchived = !!e.target.checked; state.page = 1; render(); });
    document.getElementById("taken-hide-done-toggle").addEventListener("change", function (e) { state.hideDone = !!e.target.checked; state.page = 1; render(); });
    document.getElementById("taken-filter-status").addEventListener("change", function (e) { state.filterStatus = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("taken-filter-prioriteit").addEventListener("change", function (e) { state.filterPrioriteit = e.target.value || ""; state.page = 1; render(); });

    // Sprint 8 / S8 — nieuwe filters
    var teamlidSel = document.getElementById("taken-filter-teamlid");
    if (teamlidSel) {
      populateTeamlidFilter(teamlidSel);
      teamlidSel.addEventListener("change", function (e) { state.filterTeamlid = e.target.value || ""; state.page = 1; render(); });
      window.addEventListener("besa:medewerkers-updated", function () { populateTeamlidFilter(teamlidSel); });
    }
    var dlInput = document.getElementById("taken-filter-deadline");
    if (dlInput) dlInput.addEventListener("change", function (e) { state.filterDeadline = e.target.value || ""; state.page = 1; render(); });
    var adInput = document.getElementById("taken-filter-aanmaakdatum");
    if (adInput) adInput.addEventListener("change", function (e) { state.filterAanmaakdatum = e.target.value || ""; state.page = 1; render(); });
    var resetBtn = document.getElementById("taken-filter-reset");
    if (resetBtn) resetBtn.addEventListener("click", resetAllFilters);

    document.getElementById("taken-rows-per-page").addEventListener("change", function (e) { state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render(); });
    document.getElementById("taken-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("taken-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("taken-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("taken-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    document.getElementById("taken-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = window.takenDB.getByIdSync(id);
      if (!item) return;
      var action = btn.getAttribute("data-action");
      if (action === "edit") openAddModal(item);
      else if (action === "archive") openArchiveModal(item);
      else if (action === "restore") {
        window.takenDB.restore(id).then(function () {
          if (window.showActionFeedback) window.showActionFeedback("restored", item.naam);
        }).catch(function (err) { if (window.showError) window.showError("Herstellen mislukt: " + err.message); });
      }
      else if (action === "purge") openPurgeModal(item);
      else if (action === "advance-status") {
        var next = STATUS_NEXT[item.status] || "open";
        window.takenDB.setStatus(id, next).catch(function (err) { if (window.showError) window.showError("Status wijzigen mislukt: " + err.message); });
      }
    });

    setupSliderModal("taken-archive-modal", "taken-archive-slider", "taken-archive-confirm-btn");
    document.getElementById("taken-archive-close-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("taken-archive-cancel-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("taken-archive-confirm-btn").addEventListener("click", function () {
      var id = state.archivingId;
      if (!id) return;
      var item = window.takenDB.getByIdSync(id);
      window.takenDB.archive(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("archived", item && item.naam || "");
        closeArchiveModal();
      }).catch(function (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        closeArchiveModal();
      });
    });

    setupSliderModal("taken-purge-modal", "taken-purge-slider", "taken-purge-confirm-btn");
    document.getElementById("taken-purge-close-btn").addEventListener("click", closePurgeModal);
    document.getElementById("taken-purge-cancel-btn").addEventListener("click", closePurgeModal);
    document.getElementById("taken-purge-confirm-btn").addEventListener("click", function () {
      var id = state.purgingId;
      if (!id) return;
      var item = window.takenDB.getByIdSync(id);
      window.takenDB.delete(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.naam || "");
        closePurgeModal();
      }).catch(function (err) {
        if (window.showError) window.showError("Verwijderen mislukt: " + err.message);
        closePurgeModal();
      });
    });

    window.addEventListener("besa:taken-updated", function () {
      populateTeamlidFilter(document.getElementById("taken-filter-teamlid"));
      render();
    });
    window.addEventListener("besa:medewerkers-updated", function () { fillMedewerkerSelect(); render(); });

    // Bug #59 fix: Escape + Overlay close-ways voor alle 3 taken-modals
    function isAddModalOpen() {
      var m = document.getElementById("taken-add-modal");
      return m && getComputedStyle(m).display !== "none";
    }
    function isArchiveModalOpen() {
      var m = document.getElementById("taken-archive-modal");
      return m && !m.hasAttribute("hidden");
    }
    function isPurgeModalOpen() {
      var m = document.getElementById("taken-purge-modal");
      return m && !m.hasAttribute("hidden");
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      // Priority: purge → archive → add
      if (isPurgeModalOpen()) { ev.stopPropagation(); closePurgeModal(); return; }
      if (isArchiveModalOpen()) { ev.stopPropagation(); closeArchiveModal(); return; }
      if (isAddModalOpen()) { ev.stopPropagation(); closeAddModal(); return; }
    });

    // Overlay click handlers
    ["taken-add-modal", "taken-archive-modal", "taken-purge-modal"].forEach(function (id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.addEventListener("click", function (e) {
        if (e.target !== m) return;
        if (id === "taken-add-modal") closeAddModal();
        else if (id === "taken-archive-modal") closeArchiveModal();
        else if (id === "taken-purge-modal") closePurgeModal();
      });
    });
  }

  function init() {
    if (!window.takenDB) { console.error("[taken] takenDB niet geladen"); return; }
    wireEvents();
    render();
    window.takenDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
