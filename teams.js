/* global window, document */
/**
 * teams.js — page-script voor /teams.html (BS2-port: Organisatie/Teams).
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 30;

  var state = {
    search: "",
    showArchived: false,
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    editingId: null,
    archivingId: null,
    purgingId: null,
    membersTeamId: null,
  };

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
    return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "—";
  }
  function locatieLabel(id) {
    // locatiesDB heeft géén getByIdSync → naam opzoeken via getAllSync.
    if (!id || !window.locatiesDB || !window.locatiesDB.getAllSync) return "—";
    var s = String(id);
    var l = (window.locatiesDB.getAllSync() || []).find(function (x) { return x && String(x.id) === s; });
    return (l && l.naam) || "—";
  }

  function getVisible() {
    var items = (window.teamsDB && window.teamsDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    return items.filter(function (t) {
      if (!t) return false;
      if (!!t.archived !== !!state.showArchived) return false;
      if (!q) return true;
      var hay = (t.naam || "") + " " + (t.beschrijving || "") + " " + medewerkerLabel(t.teamLeiderId) + " " + locatieLabel(t.locatieId);
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderRow(t) {
    var members = window.teamsDB.getMembersSync(t.id);
    var actionsCell = t.archived
      ? '<div class="hr-row-actions">' +
        '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(t.id) + '">Herstel</button>' +
        '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(t.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button>' +
        '</div>'
      : '<div style="display:flex;gap:6px;align-items:center;">' +
        '<button class="btn-outline" data-action="members" data-id="' + escapeHtml(t.id) + '" style="font-size:12px;padding:4px 10px;">Leden</button>' +
        '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(t.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>' +
        '</div>';

    var nameButton = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(t.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' + escapeHtml(t.naam) + '</button>';

    return '<tr data-id="' + escapeHtml(t.id) + '">' +
      '<td>' + nameButton + '</td>' +
      '<td style="color:var(--text-secondary);">' + escapeHtml(t.beschrijving || "") + '</td>' +
      '<td>' + escapeHtml(medewerkerLabel(t.teamLeiderId)) + '</td>' +
      '<td>' + escapeHtml(locatieLabel(t.locatieId)) + '</td>' +
      '<td>' + members.length + '</td>' +
      '<td>' + escapeHtml(fmtNlDateTime(t.aanmaakdatum)) + '</td>' +
      '<td class="hr-actions-cell">' + actionsCell + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("teams-tbody");
    if (!tbody) return;
    var visible = getVisible();
    var total = visible.length;
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(total / rpp));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);
    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-muted);">Geen teams gevonden.</td></tr>';
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
    }
    document.getElementById("teams-pager-range").textContent = total === 0 ? "0 van 0" : (start + 1) + "-" + Math.min(total, start + pageItems.length) + " van " + total;
    document.getElementById("teams-pager-page").textContent = "Pagina " + state.page + " van " + totalPages;
    document.getElementById("teams-pager-first").disabled = state.page <= 1;
    document.getElementById("teams-pager-prev").disabled = state.page <= 1;
    document.getElementById("teams-pager-next").disabled = state.page >= totalPages;
    document.getElementById("teams-pager-last").disabled = state.page >= totalPages;

    renderStats();
  }

  // Fase E.2 — 4 stat-cards (BS2 mirror)
  function renderStats() {
    var totaalEl = document.getElementById("teams-stat-totaal");
    var medEl = document.getElementById("teams-stat-medewerkers");
    var leidersEl = document.getElementById("teams-stat-teamleiders");
    var locEl = document.getElementById("teams-stat-locaties");
    if (!totaalEl) return;

    var allTeams = (window.teamsDB && window.teamsDB.getAllSync()) || [];
    var actief = allTeams.filter(function (t) { return t && !t.archived; });
    var teamleiderIds = {};
    var locatieIds = {};
    var uniekeMedewerkers = {};

    actief.forEach(function (t) {
      if (t.teamLeiderId) teamleiderIds[t.teamLeiderId] = true;
      if (t.locatieId) locatieIds[t.locatieId] = true;
      window.teamsDB.getMembersSync(t.id).forEach(function (m) {
        if (m && m.medewerker_id) uniekeMedewerkers[m.medewerker_id] = true;
      });
    });

    totaalEl.textContent = actief.length;
    medEl.textContent = Object.keys(uniekeMedewerkers).length;
    leidersEl.textContent = Object.keys(teamleiderIds).length;
    locEl.textContent = Object.keys(locatieIds).length;
  }

  function fillMedewerkerSelect(selId, excludeIds) {
    var sel = document.getElementById(selId);
    if (!sel || !window.medewerkersDB) return;
    var exclude = excludeIds || {};
    var items = (window.medewerkersDB.getAllSync() || []).filter(function (m) { return m && !m.archived && !exclude[m.id]; });
    items.sort(function (a, b) { return ((a.voornaam + " " + a.achternaam) || "").localeCompare(((b.voornaam + " " + b.achternaam) || "")); });
    var keep = sel.value;
    var firstOpt = sel.querySelector("option");
    var firstHtml = firstOpt ? firstOpt.outerHTML : '<option value="">— Geen —</option>';
    sel.innerHTML = firstHtml + items.map(function (m) {
      return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(((m.voornaam || "") + " " + (m.achternaam || "")).trim()) + '</option>';
    }).join("");
    if (keep && !exclude[keep]) sel.value = keep; else sel.value = "";
  }
  function fillLocatieSelect() {
    var sel = document.getElementById("teams-add-locatie");
    if (!sel || !window.locatiesDB) return;
    var items = (window.locatiesDB.getAllSync() || []).filter(function (l) { return l && !l.archived; });
    items.sort(function (a, b) { return (a.naam || "").localeCompare(b.naam || ""); });
    var keep = sel.value;
    sel.innerHTML = '<option value="">— Geen —</option>' + items.map(function (l) {
      return '<option value="' + escapeHtml(l.id) + '">' + escapeHtml(l.naam) + '</option>';
    }).join("");
    if (keep) sel.value = keep;
  }

  function openAddModal(item) {
    state.editingId = item ? item.id : null;
    var modal = document.getElementById("teams-add-modal");
    var title = document.getElementById("teams-add-title");
    var idInput = document.getElementById("teams-edit-id");
    var naam = document.getElementById("teams-add-naam");
    var beschr = document.getElementById("teams-add-beschrijving");
    var leider = document.getElementById("teams-add-leider");
    var locatie = document.getElementById("teams-add-locatie");
    var submit = document.getElementById("teams-add-submit-btn");
    fillMedewerkerSelect("teams-add-leider");
    fillLocatieSelect();
    if (item) {
      title.textContent = "Team bewerken";
      idInput.value = item.id;
      naam.value = item.naam || "";
      beschr.value = item.beschrijving || "";
      leider.value = item.teamLeiderId || "";
      locatie.value = item.locatieId || "";
      submit.textContent = "Opslaan";
    } else {
      title.textContent = "Team toevoegen";
      idInput.value = "";
      naam.value = ""; beschr.value = ""; leider.value = ""; locatie.value = "";
      submit.textContent = "Toevoegen";
    }
    modal.style.display = "flex";
    setTimeout(function () { naam.focus(); }, 50);
  }
  function closeAddModal() {
    state.editingId = null;
    var modal = document.getElementById("teams-add-modal");
    if (modal) modal.style.display = "none";
  }

  async function submitAddForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("teams-add-submit-btn");
    var idInput = document.getElementById("teams-edit-id");
    var naam = document.getElementById("teams-add-naam");
    var beschr = document.getElementById("teams-add-beschrijving");
    var leider = document.getElementById("teams-add-leider");
    var locatie = document.getElementById("teams-add-locatie");
    if (!naam.value.trim()) { naam.focus(); return; }
    var payload = {
      naam: naam.value.trim(),
      beschrijving: beschr.value,
      teamLeiderId: leider.value || null,
      locatieId: locatie.value || null,
    };
    submit.disabled = true;
    try {
      if (idInput.value) {
        await window.teamsDB.update(idInput.value, payload);
        if (window.showSaveModal) window.showSaveModal(payload.naam, "Bijgewerkt");
      } else {
        await window.teamsDB.add(payload);
        if (window.showActionFeedback) window.showActionFeedback("saved", payload.naam);
      }
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    } finally {
      submit.disabled = false;
    }
  }

  // Members modal
  function renderMembersList() {
    var teamId = state.membersTeamId;
    if (!teamId) return;
    var listEl = document.getElementById("teams-members-list");
    var members = window.teamsDB.getMembersSync(teamId);
    members.sort(function (a, b) {
      return medewerkerLabel(a.medewerker_id).localeCompare(medewerkerLabel(b.medewerker_id), "nl");
    });
    if (members.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px;">Nog geen leden in dit team.</div>';
      return;
    }
    listEl.innerHTML = members.map(function (m) {
      var naam = escapeHtml(medewerkerLabel(m.medewerker_id));
      if (m.bron === "locatie") {
        // Automatisch lid via de locatiekoppeling → read-only (beheer via HR).
        return '<div style="display:flex;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:var(--r-sm,8px);">' +
          '<span style="flex:1;">' + naam + '</span>' +
          '<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:var(--blue-soft);color:var(--blue);white-space:nowrap;">via locatie</span>' +
          '</div>';
      }
      // Handmatig lidmaatschap → rol-keuze + verwijderen.
      return '<div style="display:flex;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:var(--r-sm,8px);">' +
        '<span style="flex:1;">' + naam + '</span>' +
        '<select class="comp-modal-input" data-action="set-role" data-medewerker="' + escapeHtml(m.medewerker_id) + '" style="width:120px;">' +
        '<option value="lid"' + (m.rol_in_team === "lid" ? " selected" : "") + '>Lid</option>' +
        '<option value="leider"' + (m.rol_in_team === "leider" ? " selected" : "") + '>Leider</option>' +
        '<option value="assistent"' + (m.rol_in_team === "assistent" ? " selected" : "") + '>Assistent</option>' +
        '</select>' +
        '<button class="btn-outline" data-action="remove-member" data-medewerker="' + escapeHtml(m.medewerker_id) + '" style="font-size:12px;padding:4px 10px;">Verwijder</button>' +
        '</div>';
    }).join("");
  }

  // Vult de "lid toevoegen"-select, met uitsluiting van wie al lid is
  // (afgeleid via locatie óf handmatig) zodat je niemand dubbel toevoegt.
  function refreshMembersAddSelect() {
    var teamId = state.membersTeamId;
    if (!teamId) return;
    var exclude = {};
    window.teamsDB.getMembersSync(teamId).forEach(function (m) {
      if (m && m.medewerker_id) exclude[m.medewerker_id] = true;
    });
    fillMedewerkerSelect("teams-members-add-medewerker", exclude);
  }
  function openMembersModal(teamId) {
    state.membersTeamId = teamId;
    var team = window.teamsDB.getByIdSync(teamId);
    if (!team) return;
    document.getElementById("teams-members-team-id").value = teamId;
    document.getElementById("teams-members-title").textContent = "Teamleden: " + team.naam;
    // Infobalk: locatie-teams krijgen hun leden automatisch uit de HR-locatiekoppeling.
    var infoEl = document.getElementById("teams-members-info");
    if (infoEl) {
      var locNaam = team.locatieId ? locatieLabel(team.locatieId) : null;
      if (locNaam && locNaam !== "—") {
        infoEl.style.cssText = "display:block;margin-bottom:12px;padding:10px 12px;background:var(--blue-soft);border:1px solid var(--line);border-radius:var(--r-sm,8px);color:var(--text-secondary);font-size:13px;line-height:1.5;";
        infoEl.innerHTML = "Leden met het label <em>via locatie</em> komen automatisch uit locatie <strong>" + escapeHtml(locNaam) + "</strong> — iedereen die daar bij HR &rsaquo; Medewerker aan gekoppeld is. Wijzig de locatie bij de medewerker om iemand toe te voegen of te verwijderen. Hieronder kun je eventueel handmatig extra leden toevoegen.";
      } else {
        infoEl.style.cssText = "display:none;";
        infoEl.innerHTML = "";
      }
    }
    refreshMembersAddSelect();
    renderMembersList();
    document.getElementById("teams-members-modal").style.display = "flex";
  }
  function closeMembersModal() {
    state.membersTeamId = null;
    document.getElementById("teams-members-modal").style.display = "none";
    render();
  }

  function setupSliderModal(sliderId, confirmBtnId) {
    var slider = document.getElementById(sliderId);
    var confirm = document.getElementById(confirmBtnId);
    if (!slider || !confirm) return;
    slider.addEventListener("input", function () {
      var pct = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", pct + "%");
      confirm.disabled = pct < 100;
    });
  }
  function openConfirm(modalId, sliderId, confirmId, previewId, item, idStateKey) {
    state[idStateKey] = item.id;
    var preview = document.getElementById(previewId);
    var slider = document.getElementById(sliderId);
    var confirm = document.getElementById(confirmId);
    preview.textContent = item.naam || "";
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    confirm.disabled = true;
    var modal = document.getElementById(modalId);
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closeConfirm(modalId, idStateKey) {
    state[idStateKey] = null;
    var modal = document.getElementById(modalId);
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  function wireEvents() {
    document.getElementById("teams-add-btn").addEventListener("click", function () { openAddModal(null); });
    document.getElementById("teams-add-close-btn").addEventListener("click", closeAddModal);
    document.getElementById("teams-add-cancel-btn").addEventListener("click", closeAddModal);
    document.getElementById("teams-add-form").addEventListener("submit", submitAddForm);

    document.getElementById("teams-search").addEventListener("input", function (e) { state.search = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("teams-archived-toggle").addEventListener("change", function (e) { state.showArchived = !!e.target.checked; state.page = 1; render(); });
    document.getElementById("teams-rows-per-page").addEventListener("change", function (e) { state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render(); });
    document.getElementById("teams-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("teams-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("teams-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("teams-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    document.getElementById("teams-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = window.teamsDB.getByIdSync(id);
      if (!item) return;
      var action = btn.getAttribute("data-action");
      if (action === "edit") openAddModal(item);
      else if (action === "members") openMembersModal(id);
      else if (action === "archive") openConfirm("teams-archive-modal", "teams-archive-slider", "teams-archive-confirm-btn", "teams-archive-preview", item, "archivingId");
      else if (action === "purge") openConfirm("teams-purge-modal", "teams-purge-slider", "teams-purge-confirm-btn", "teams-purge-preview", item, "purgingId");
      else if (action === "restore") {
        window.teamsDB.restore(id).then(function () {
          if (window.showActionFeedback) window.showActionFeedback("restored", item.naam);
        }).catch(function (err) { if (window.showError) window.showError("Herstellen mislukt: " + err.message); });
      }
    });

    // Members modal events
    document.getElementById("teams-members-close-btn").addEventListener("click", closeMembersModal);
    document.getElementById("teams-members-done-btn").addEventListener("click", closeMembersModal);
    document.getElementById("teams-members-add-btn").addEventListener("click", async function () {
      var teamId = state.membersTeamId;
      var medewerkerSel = document.getElementById("teams-members-add-medewerker");
      var rolSel = document.getElementById("teams-members-add-rol");
      if (!teamId || !medewerkerSel.value) return;
      try {
        await window.teamsDB.addMember(teamId, medewerkerSel.value, rolSel.value);
        rolSel.value = "lid";
        renderMembersList();
        refreshMembersAddSelect();
      } catch (err) {
        if (window.showError) window.showError("Toevoegen lid mislukt: " + (err && err.message || err));
      }
    });
    document.getElementById("teams-members-list").addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-action='remove-member']");
      if (!btn) return;
      var teamId = state.membersTeamId;
      var medewerkerId = btn.getAttribute("data-medewerker");
      if (!teamId || !medewerkerId) return;
      try {
        await window.teamsDB.removeMember(teamId, medewerkerId);
        renderMembersList();
        refreshMembersAddSelect();
      } catch (err) {
        if (window.showError) window.showError("Verwijderen lid mislukt: " + (err && err.message || err));
      }
    });
    document.getElementById("teams-members-list").addEventListener("change", async function (e) {
      var sel = e.target.closest("[data-action='set-role']");
      if (!sel) return;
      var teamId = state.membersTeamId;
      var medewerkerId = sel.getAttribute("data-medewerker");
      if (!teamId || !medewerkerId) return;
      try {
        await window.teamsDB.setMemberRole(teamId, medewerkerId, sel.value);
      } catch (err) {
        if (window.showError) window.showError("Rol wijzigen mislukt: " + (err && err.message || err));
      }
    });

    setupSliderModal("teams-archive-slider", "teams-archive-confirm-btn");
    document.getElementById("teams-archive-close-btn").addEventListener("click", function () { closeConfirm("teams-archive-modal", "archivingId"); });
    document.getElementById("teams-archive-cancel-btn").addEventListener("click", function () { closeConfirm("teams-archive-modal", "archivingId"); });
    document.getElementById("teams-archive-confirm-btn").addEventListener("click", function () {
      var id = state.archivingId; if (!id) return;
      var item = window.teamsDB.getByIdSync(id);
      window.teamsDB.archive(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("archived", item && item.naam || "");
        closeConfirm("teams-archive-modal", "archivingId");
      }).catch(function (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        closeConfirm("teams-archive-modal", "archivingId");
      });
    });

    setupSliderModal("teams-purge-slider", "teams-purge-confirm-btn");
    document.getElementById("teams-purge-close-btn").addEventListener("click", function () { closeConfirm("teams-purge-modal", "purgingId"); });
    document.getElementById("teams-purge-cancel-btn").addEventListener("click", function () { closeConfirm("teams-purge-modal", "purgingId"); });
    document.getElementById("teams-purge-confirm-btn").addEventListener("click", function () {
      var id = state.purgingId; if (!id) return;
      var item = window.teamsDB.getByIdSync(id);
      window.teamsDB.delete(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.naam || "");
        closeConfirm("teams-purge-modal", "purgingId");
      }).catch(function (err) {
        if (window.showError) window.showError("Verwijderen mislukt: " + err.message);
        closeConfirm("teams-purge-modal", "purgingId");
      });
    });

    window.addEventListener("besa:teams-updated", render);
    window.addEventListener("besa:medewerkers-updated", render);
    window.addEventListener("besa:locaties-updated", render);
  }

  function init() {
    if (!window.teamsDB) { console.error("[teams] teamsDB niet geladen"); return; }
    wireEvents();
    render();
    window.teamsDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Bug #66 fix: defensieve globale Escape + Overlay close-ways
  // voor alle 4 teams-modals (add / members / archive / purge).
  // Spiegelt Bug #63 oplossing in beleid.js + Bug #61 in medewerker.js.
  (function initGlobalCloseForTeamsModals() {
    var DISPLAY_IDS = ["teams-add-modal", "teams-members-modal"];   // gebruiken style.display
    var HIDDEN_IDS = ["teams-archive-modal", "teams-purge-modal"];  // gebruiken hidden attr
    var modalIds = DISPLAY_IDS.concat(HIDDEN_IDS);

    function isVisible(m) {
      if (!m) return false;
      if (HIDDEN_IDS.indexOf(m.id) >= 0) {
        return !m.hasAttribute("hidden");
      }
      if (m.style && m.style.display === "none") return false;
      return getComputedStyle(m).display !== "none" && !m.hasAttribute("hidden");
    }
    function closeModal(m) {
      if (!m) return;
      if (HIDDEN_IDS.indexOf(m.id) >= 0) {
        m.setAttribute("hidden", "");
        m.setAttribute("aria-hidden", "true");
      } else {
        m.style.display = "none";
      }
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      for (var i = 0; i < modalIds.length; i++) {
        var m = document.getElementById(modalIds[i]);
        if (m && isVisible(m)) {
          closeModal(m);
          e.stopPropagation();
          return;
        }
      }
    });

    modalIds.forEach(function (id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.addEventListener("click", function (e) {
        if (e.target !== m) return;
        closeModal(m);
      });
    });
  })();
})();
