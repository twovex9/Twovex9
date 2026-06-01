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
    hideDone: false,
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
    threadTaakId: null,
    threadFile: null,
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
  var PRIORITEIT_LABELS = { Low: "Laag", Medium: "Middel", High: "Hoog" };
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

  // Maker = auth.users.id → via profiel naar medewerker-naam (fallback e-mail).
  function makerLabel(authId, fallbackNaam) {
    if (fallbackNaam) return fallbackNaam;
    if (!authId) return "—";
    try {
      var profs = (window.profilesDB && window.profilesDB.getAllSync && window.profilesDB.getAllSync()) || [];
      var p = profs.find(function (x) { return x && String(x.id) === String(authId); });
      if (p) {
        if (p.medewerker_id) {
          var lbl = medewerkerLabel(p.medewerker_id);
          if (lbl && lbl !== "—") return lbl;
        }
        if (p.voornaam || p.achternaam) return ((p.voornaam || "") + " " + (p.achternaam || "")).trim();
        if (p.email) return p.email;
      }
    } catch (e) { /* */ }
    return "—";
  }

  function getCurrentMedewerkerId() {
    try {
      var p = window.besaCurrentProfile || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync());
      return p && p.medewerker_id ? p.medewerker_id : null;
    } catch (e) { return null; }
  }

  // auth.users.id van de ingelogde gebruiker (= profiles.id) — om de maker te herkennen.
  function getCurrentAuthUserId() {
    try {
      var p = window.besaCurrentProfile || (window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync());
      return p && p.id ? p.id : null;
    } catch (e) { return null; }
  }

  // Mag de huidige gebruiker de goedkeuring doen? = de aanmaker zelf, of een admin.
  // (De RLS staat ook hiërarchisch-hogeren toe; de knop tonen we aan maker + admin —
  //  in de praktijk keurt de aanmaker goed.)
  function magGoedkeuren(t) {
    if (!t) return false;
    var uid = getCurrentAuthUserId();
    if (uid && t.aangemaaktDoorId && String(uid) === String(t.aangemaaktDoorId)) return true;
    try { if (window.profilesDB && window.profilesDB.isAdmin && window.profilesDB.isAdmin()) return true; } catch (e) { /* */ }
    return false;
  }

  // Een voltooide, niet-gearchiveerde taak wacht op goedkeuring van de aanmaker.
  function wachtOpGoedkeuring(t) {
    return !!t && t.status === "Voltooid" && !t.archived && !t.goedgekeurdOp;
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
      var hay = (t.naam || "") + " " + (t.beschrijving || "") + " " + (t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId)) + " " + makerLabel(t.aangemaaktDoorId, t.aangemaaktDoorNaam);
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function statusPill(t) {
    var label = STATUS_LABELS[t.status] || t.status;
    var style = STATUS_CLASS[t.status] || "";
    // Niet klikbaar: status wijzig je enkel via de taak openen → Opslaan.
    var html = '<span class="badge" ' +
           'style="display:inline-block;padding:4px 10px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;' + style + '">' +
           escapeHtml(label) + '</span>';
    // Voltooid maar nog niet goedgekeurd → de aanmaker moet nog controleren.
    if (wachtOpGoedkeuring(t)) {
      html += ' <span class="taak-wacht-badge" title="Wacht op goedkeuring van de aanmaker">Wacht op goedkeuring</span>';
    }
    return html;
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

    return '<tr data-id="' + escapeHtml(t.id) + '" class="taken-row" style="cursor:pointer">' +
      '<td data-col="naam">' + nameButton + (t.beschrijving ? '<br><span style="color:var(--text-muted);font-size:12px;">' + escapeHtml(t.beschrijving.slice(0, 80)) + (t.beschrijving.length > 80 ? "…" : "") + '</span>' : '') + '</td>' +
      '<td data-col="toegewezen">' + escapeHtml(t.toegewezenAanNaam || medewerkerLabel(t.toegewezenAanId) || "—") + '</td>' +
      '<td data-col="aangemaakt_door">' + escapeHtml(makerLabel(t.aangemaaktDoorId, t.aangemaaktDoorNaam)) + '</td>' +
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
    state.hideDone = false;
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
    if (hide) hide.checked = false;
    render();
    if (window.showActionFeedback) {
      window.showActionFeedback("info", "Filters gewist", "Alle taken-filters zijn teruggezet.");
    }
  }

  // Cache van wie ik mag toewijzen (gelijk niveau of lager) — uit RPC.
  var _assignableIds = null;
  async function loadAssignableIds() {
    if (_assignableIds !== null) return _assignableIds;
    try {
      if (window.besaSupabase) {
        var r = await window.besaSupabase.rpc("taken_toewijsbare_mw_ids");
        if (!r.error && Array.isArray(r.data)) {
          var map = {};
          r.data.forEach(function (row) { if (row && row.id) map[row.id] = true; });
          _assignableIds = map;
          return _assignableIds;
        }
      }
    } catch (e) { /* val terug op 'alles' bij fout */ }
    _assignableIds = null; // onbekend → geen restrictie in de UI (RLS blijft de echte gate)
    return _assignableIds;
  }

  async function fillMedewerkerSelect(keepCurrentId) {
    var sel = document.getElementById("taken-add-toegewezen");
    if (!sel || !window.medewerkersDB) return;
    var allowed = await loadAssignableIds();
    var keep = keepCurrentId != null ? keepCurrentId : sel.value;
    var items = (window.medewerkersDB.getAllSync() || []).filter(function (m) {
      if (!m || m.archived) return false;
      // Toon altijd de reeds-toegewezene (ook als die hoger staat), zodat een
      // bestaande taak correct getoond wordt; verder enkel gelijk-niveau-of-lager.
      if (allowed && !allowed[m.id] && String(m.id) !== String(keep)) return false;
      return true;
    });
    items.sort(function (a, b) {
      return (a.voornaam + " " + a.achternaam).localeCompare(b.voornaam + " " + b.achternaam);
    });
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

    if (item) {
      fillMedewerkerSelect(item.toegewezenAanId || "");
      title.textContent = "Taak bewerken";
      idInput.value = item.id;
      naam.value = item.naam || "";
      beschrijving.value = item.beschrijving || "";
      toegewezen.value = item.toegewezenAanId || "";
      status.value = item.status || "--";
      prioriteit.value = item.prioriteit || "Low";
      deadline.value = item.deadline ? String(item.deadline).slice(0, 10) : "";
      submit.textContent = "Opslaan";
      showThread(item.id);
    } else {
      fillMedewerkerSelect("");
      title.textContent = "Taak toevoegen";
      idInput.value = "";
      naam.value = "";
      beschrijving.value = "";
      toegewezen.value = "";
      status.value = "--";
      prioriteit.value = "Low";
      deadline.value = "";
      submit.textContent = "Toevoegen";
      hideThread();
    }
    renderApproveBlock(item);
    modal.style.display = "flex";
    setTimeout(function () { naam.focus(); }, 50);
  }

  function closeAddModal() {
    state.editingId = null;
    state.threadTaakId = null;
    state.threadFile = null;
    var modal = document.getElementById("taken-add-modal");
    if (modal) modal.style.display = "none";
    var block = document.getElementById("taken-approve-block");
    if (block) block.setAttribute("hidden", "");
  }

  // ─── Goedkeuren / afkeuren door de aanmaker ────────────────────────────────

  // Toon het goedkeur-blok alleen bij een voltooide, niet-gearchiveerde taak die
  // de huidige gebruiker mag goedkeuren (aanmaker of admin). Reset het reden-veld.
  function renderApproveBlock(item) {
    var block = document.getElementById("taken-approve-block");
    if (!block) return;
    var reasonWrap = document.getElementById("taken-reject-reason-wrap");
    var reason = document.getElementById("taken-reject-reason");
    if (reason) reason.value = "";
    if (reasonWrap) reasonWrap.setAttribute("hidden", "");
    if (item && wachtOpGoedkeuring(item) && magGoedkeuren(item)) {
      block.removeAttribute("hidden");
    } else {
      block.setAttribute("hidden", "");
    }
  }

  // Akkoord → goedkeuren + archiveren (slider-bevestiging conform huisstijl).
  // Server-trigger C stuurt dan een melding (+ push) naar de medewerker.
  function approveCurrentTaak() {
    var id = state.editingId;
    if (!id) return;
    var item = window.takenDB.getByIdSync(id);
    if (!item) return;
    window.showSliderConfirmModal({
      title: "Taak goedkeuren en afronden?",
      message: "De taak wordt goedgekeurd en gearchiveerd. De medewerker krijgt hiervan een melding.",
      preview: item.naam || "",
      okLabel: "Akkoord",
      cancelLabel: "Annuleren",
    }).then(function (ok) {
      if (!ok) return;
      return window.takenDB.approve(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("info", "Goedgekeurd", (item.naam || "Taak") + " is afgerond en gearchiveerd.");
        closeAddModal();
      });
    }).catch(function (err) {
      if (window.showError) window.showError("Goedkeuren mislukt: " + (err && err.message || err));
    });
  }

  // Afkeuren → toon het (optionele) reden-veld en de bevestigknop.
  function showRejectReason() {
    var wrap = document.getElementById("taken-reject-reason-wrap");
    if (wrap) wrap.removeAttribute("hidden");
    var reason = document.getElementById("taken-reject-reason");
    if (reason) { try { reason.focus(); } catch (e) { /* */ } }
  }

  // Afkeuren bevestigen → status terug naar "In behandeling" (trigger D meldt de
  // medewerker); een ingevulde reden komt als opmerking in de gespreksdraad.
  async function submitReject() {
    var id = state.editingId;
    if (!id) return;
    var item = window.takenDB.getByIdSync(id);
    if (!item) return;
    var reasonEl = document.getElementById("taken-reject-reason");
    var reden = (reasonEl && reasonEl.value || "").trim();
    var btn = document.getElementById("taken-reject-confirm-btn");
    if (btn) btn.disabled = true;
    try {
      await window.takenDB.reject(id);
      if (reden && window.taakCommentsDB && typeof window.taakCommentsDB.add === "function") {
        try { await window.taakCommentsDB.add({ taakId: id, tekst: "Afgekeurd: " + reden }); } catch (e) { /* opmerking is best-effort */ }
      }
      if (window.showActionFeedback) window.showActionFeedback("info", "Teruggestuurd", "De medewerker krijgt een melding om de taak opnieuw te bekijken.");
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Afkeuren mislukt: " + (err && err.message || err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ─── Gespreksdraad + bijlagen ──────────────────────────────────────────────

  function fileIsImage(mime) { return /^image\//.test(String(mime || "")); }

  function bijlageChip(b) {
    var icon = fileIsImage(b.fileMime)
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
    return '<a class="taak-bijlage-chip" href="' + escapeHtml(b.url || "#") + '" target="_blank" rel="noopener" title="' + escapeHtml(b.naam) + '">' +
      icon + '<span>' + escapeHtml(b.naam) + '</span></a>';
  }

  function renderThread() {
    var taakId = state.threadTaakId;
    var list = document.getElementById("taken-thread-list");
    var countEl = document.getElementById("taken-thread-count");
    if (!list || !taakId) return;
    var comments = (window.taakCommentsDB && window.taakCommentsDB.listSync(taakId)) || [];
    var bijlagen = (window.taakBijlagenDB && window.taakBijlagenDB.listSync(taakId)) || [];
    // Bijlagen zonder comment-koppeling tonen we als losse "bestand toegevoegd"-items.
    var losseBijlagen = bijlagen.filter(function (b) { return !b.commentId; });

    var totaal = comments.length + losseBijlagen.length;
    if (countEl) countEl.textContent = totaal ? "(" + totaal + ")" : "";

    if (!totaal) {
      list.innerHTML = '<div class="taak-thread-empty">Nog geen opmerkingen. Schrijf de eerste hieronder.</div>';
      return;
    }

    // Bouw een gecombineerde, chronologische lijst.
    var items = [];
    comments.forEach(function (c) {
      var att = bijlagen.filter(function (b) { return b.commentId === c.id; });
      items.push({ t: c.createdAt, kind: "comment", c: c, att: att });
    });
    losseBijlagen.forEach(function (b) {
      items.push({ t: b.createdAt, kind: "bijlage", b: b });
    });
    items.sort(function (a, b) { return String(a.t || "").localeCompare(String(b.t || "")); });

    list.innerHTML = items.map(function (it) {
      if (it.kind === "comment") {
        var attHtml = it.att.length
          ? '<div class="taak-thread-att">' + it.att.map(bijlageChip).join("") + '</div>'
          : "";
        return '<div class="taak-thread-item">' +
          '<div class="taak-thread-meta"><span class="taak-thread-auteur">' + escapeHtml(it.c.auteurNaam || "Onbekend") + '</span>' +
          '<span class="taak-thread-time">' + escapeHtml(fmtNlDateTime(it.c.createdAt)) + '</span></div>' +
          '<div class="taak-thread-tekst">' + escapeHtml(it.c.tekst).replace(/\n/g, "<br>") + '</div>' +
          attHtml + '</div>';
      }
      return '<div class="taak-thread-item taak-thread-item--file">' +
        '<div class="taak-thread-meta"><span class="taak-thread-auteur">' + escapeHtml(it.b.uploaderNaam || "Onbekend") + '</span>' +
        '<span class="taak-thread-time">' + escapeHtml(fmtNlDateTime(it.b.createdAt)) + '</span></div>' +
        '<div class="taak-thread-att">' + bijlageChip(it.b) + '</div></div>';
    }).join("");
    list.scrollTop = list.scrollHeight;
  }

  function showThread(taakId) {
    state.threadTaakId = taakId;
    state.threadFile = null;
    var section = document.getElementById("taken-thread");
    if (section) section.removeAttribute("hidden");
    var fnameEl = document.getElementById("taken-thread-file-name");
    if (fnameEl) fnameEl.textContent = "";
    var input = document.getElementById("taken-thread-input");
    if (input) input.value = "";
    renderThread();
    if (window.taakThreadDB) {
      window.taakThreadDB.load(taakId).then(function () {
        if (state.threadTaakId === taakId) renderThread();
      }).catch(function () { /* reporter doet zijn werk */ });
    }
  }

  function hideThread() {
    state.threadTaakId = null;
    state.threadFile = null;
    var section = document.getElementById("taken-thread");
    if (section) section.setAttribute("hidden", "");
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error("Lezen mislukt")); };
      reader.readAsDataURL(file);
    });
  }

  async function submitThreadMessage() {
    var taakId = state.threadTaakId;
    if (!taakId) return;
    var input = document.getElementById("taken-thread-input");
    var sendBtn = document.getElementById("taken-thread-send");
    var tekst = (input && input.value || "").trim();
    var file = state.threadFile;
    if (!tekst && !file) { if (input) input.focus(); return; }

    if (sendBtn) sendBtn.disabled = true;
    try {
      var commentId = null;
      if (tekst) {
        var c = await window.taakCommentsDB.add({ taakId: taakId, tekst: tekst });
        commentId = c && c.id;
      }
      if (file) {
        var dataUrl = await readFileAsDataUrl(file);
        await window.taakBijlagenDB.add({
          taakId: taakId,
          commentId: commentId,
          fileData: dataUrl,
          fileName: file.name,
          fileMime: file.type,
          fileSize: file.size,
        });
      }
      if (input) input.value = "";
      state.threadFile = null;
      var fnameEl = document.getElementById("taken-thread-file-name");
      if (fnameEl) fnameEl.textContent = "";
      var fileInput = document.getElementById("taken-thread-file");
      if (fileInput) fileInput.value = "";
      renderThread();
    } catch (err) {
      if (window.showError) window.showError("Plaatsen mislukt: " + (err && err.message || err));
      else console.error("[taken] thread send failed", err);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
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

    // Goedkeuren / afkeuren door de aanmaker (knoppen in het goedkeur-blok).
    var approveBtn = document.getElementById("taken-approve-btn");
    if (approveBtn) approveBtn.addEventListener("click", approveCurrentTaak);
    var rejectBtn = document.getElementById("taken-reject-btn");
    if (rejectBtn) rejectBtn.addEventListener("click", showRejectReason);
    var rejectConfirmBtn = document.getElementById("taken-reject-confirm-btn");
    if (rejectConfirmBtn) rejectConfirmBtn.addEventListener("click", submitReject);

    // Gespreksdraad: bestand kiezen, plaatsen, Enter-to-send, live update.
    var threadFileBtn = document.getElementById("taken-thread-file-btn");
    var threadFileInput = document.getElementById("taken-thread-file");
    var threadFileName = document.getElementById("taken-thread-file-name");
    var threadSend = document.getElementById("taken-thread-send");
    var threadInput = document.getElementById("taken-thread-input");
    if (threadFileBtn && threadFileInput) {
      threadFileBtn.addEventListener("click", function () { threadFileInput.click(); });
      threadFileInput.addEventListener("change", function () {
        var f = threadFileInput.files && threadFileInput.files[0];
        state.threadFile = f || null;
        if (threadFileName) threadFileName.textContent = f ? f.name : "";
      });
    }
    if (threadSend) threadSend.addEventListener("click", submitThreadMessage);
    if (threadInput) {
      threadInput.addEventListener("keydown", function (e) {
        // Ctrl/Cmd+Enter = plaatsen (Enter alleen = nieuwe regel).
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitThreadMessage(); }
      });
    }
    window.addEventListener("besa:taak-thread-updated", function (e) {
      var d = e && e.detail;
      if (d && d.taakId && state.threadTaakId && String(d.taakId) === String(state.threadTaakId)) {
        renderThread();
      }
    });

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
      if (btn) {
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
        return;
      }
      // Hele rij klikbaar → taak openen (bewerken). Status wijzig je daar,
      // niet in de tabel. Groep-/lege rijen hebben geen data-id.
      var tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      var ritem = window.takenDB.getByIdSync(tr.getAttribute("data-id"));
      if (ritem) openAddModal(ritem);
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
