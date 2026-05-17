/* global window, document */
/**
 * medewerkers-overzicht.js — page-script voor /medewerkers-overzicht.html.
 *
 * TOP-BAR Medewerkers (BS2 /main-employee/employees → /api/employees-basic).
 * APART van HR-medewerkers. Volgt het taken.js-patroon: render + filters +
 * paginatie (BS2-default 15/pagina) + add/archive/purge slider-modals.
 * Hele rij klikbaar → detailpagina (BS2 gaat naar /employee-details/{id}).
 */
(function () {
  "use strict";

  var ROWS_PER_PAGE_DEFAULT = 15; // BS2 employees-basic per_page = 15

  var state = {
    search: "",
    showArchived: false,
    filterEmployment: "",
    onlySick: false,
    page: 1,
    rowsPerPage: ROWS_PER_PAGE_DEFAULT,
    archivingId: null,
    purgingId: null,
  };

  // employment_type: BS2-waarde verbatim in data; alleen UI-label in NL.
  var EMPLOYMENT_LABELS = { hiring: "Inhuur", permanent: "Loondienst", intern: "Stage" };

  function fmtNlDate(iso) {
    if (!iso) return "—";
    var s = String(iso);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    var t = Date.parse(s);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
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

  function getVisible() {
    var items = (window.mainEmployeesDB && window.mainEmployeesDB.getAllSync()) || [];
    var q = state.search.trim().toLowerCase();
    return items.filter(function (m) {
      if (!m) return false;
      if (!!m.archived !== !!state.showArchived) return false;
      if (state.filterEmployment && m.employmentType !== state.filterEmployment) return false;
      if (state.onlySick && !m.isSick) return false;
      if (!q) return true;
      var hay = (m.fullName || "") + " " + (m.email || "") + " " + (m.phone || "") + " " + (m.employeeNumber == null ? "" : m.employeeNumber);
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function statusPill(m) {
    if (m.isSick) {
      return '<span class="badge" style="display:inline-block;padding:4px 10px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;color:var(--red);background:var(--red-soft);">Ziek</span>';
    }
    return '<span class="badge" style="display:inline-block;padding:4px 10px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:600;color:var(--green);background:var(--green-soft);">Actief</span>';
  }

  function renderRow(m) {
    var actionsCell = m.archived
      ? '<div class="hr-row-actions">' +
        '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(m.id) + '">Herstel</button>' +
        '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(m.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button>' +
        '</div>'
      : '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(m.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';

    var empLabel = EMPLOYMENT_LABELS[m.employmentType] || (m.employmentType || "—");

    return '<tr data-id="' + escapeHtml(m.id) + '" class="taken-row" style="cursor:pointer">' +
      '<td data-col="naam"><span style="font-weight:600;color:var(--blue);">' + escapeHtml(m.fullName || "—") + '</span></td>' +
      '<td data-col="nummer">' + (m.employeeNumber == null ? "—" : "#" + escapeHtml(m.employeeNumber)) + '</td>' +
      '<td data-col="email">' + escapeHtml(m.email || "—") + '</td>' +
      '<td data-col="telefoon">' + escapeHtml(m.phone || "—") + '</td>' +
      '<td data-col="dienstverband">' + escapeHtml(empLabel) + '</td>' +
      '<td data-col="geboortedatum">' + escapeHtml(fmtNlDate(m.dateOfBirth)) + '</td>' +
      '<td data-col="planbaar">' + (m.isPlannable ? "Ja" : "Nee") + '</td>' +
      '<td data-col="status">' + statusPill(m) + '</td>' +
      '<td class="hr-actions-cell">' + actionsCell + '</td>' +
    '</tr>';
  }

  function render() {
    var tbody = document.getElementById("me-tbody");
    if (!tbody) return;

    var visible = getVisible();
    var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
    var totalPages = Math.max(1, Math.ceil(visible.length / rpp));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * rpp;
    var pageItems = visible.slice(start, start + rpp);

    if (!pageItems.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">Geen medewerkers gevonden</td></tr>';
    } else {
      tbody.innerHTML = pageItems.map(renderRow).join("");
    }

    var rangeEl = document.getElementById("me-pager-range");
    if (rangeEl) {
      var from = visible.length ? start + 1 : 0;
      var to = Math.min(start + rpp, visible.length);
      rangeEl.textContent = from + "–" + to + " van " + visible.length;
    }
    var pageEl = document.getElementById("me-pager-page");
    if (pageEl) pageEl.textContent = "Pagina " + state.page + " van " + totalPages;

    var first = document.getElementById("me-pager-first");
    var prev = document.getElementById("me-pager-prev");
    var next = document.getElementById("me-pager-next");
    var last = document.getElementById("me-pager-last");
    if (first) first.disabled = state.page <= 1;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
    if (last) last.disabled = state.page >= totalPages;
  }

  function resetAllFilters() {
    state.search = "";
    state.filterEmployment = "";
    state.onlySick = false;
    state.showArchived = false;
    state.page = 1;
    var s = document.getElementById("me-search"); if (s) s.value = "";
    var fe = document.getElementById("me-filter-dienstverband"); if (fe) fe.value = "";
    var fs = document.getElementById("me-filter-sick"); if (fs) fs.checked = false;
    var ar = document.getElementById("me-archived-toggle"); if (ar) ar.checked = false;
    render();
    if (window.showActionFeedback) window.showActionFeedback("info", "Filters gewist", "Alle filters zijn teruggezet.");
  }

  function openAddModal() {
    var modal = document.getElementById("me-add-modal");
    if (!modal) return;
    document.getElementById("me-edit-id").value = "";
    ["me-add-voornaam", "me-add-achternaam", "me-add-email", "me-add-phone", "me-add-number", "me-add-dob"].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("me-add-employment").value = "hiring";
    document.getElementById("me-add-plannable").checked = true;
    modal.style.display = "flex";
    setTimeout(function () { var v = document.getElementById("me-add-voornaam"); if (v) v.focus(); }, 50);
  }
  function closeAddModal() {
    var modal = document.getElementById("me-add-modal");
    if (modal) modal.style.display = "none";
  }

  async function submitAddForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("me-add-submit-btn");
    var voornaam = document.getElementById("me-add-voornaam").value.trim();
    var achternaam = document.getElementById("me-add-achternaam").value.trim();
    if (!voornaam || !achternaam) {
      document.getElementById("me-add-voornaam").focus();
      return;
    }
    var payload = {
      firstName: voornaam,
      lastName: achternaam,
      email: document.getElementById("me-add-email").value.trim() || null,
      phone: document.getElementById("me-add-phone").value.trim() || null,
      employeeNumber: document.getElementById("me-add-number").value || null,
      dateOfBirth: document.getElementById("me-add-dob").value || null,
      employmentType: document.getElementById("me-add-employment").value,
      isPlannable: document.getElementById("me-add-plannable").checked,
      isSick: false,
    };
    submit.disabled = true;
    try {
      await window.mainEmployeesDB.add(payload);
      if (window.showActionFeedback) window.showActionFeedback("saved", voornaam + " " + achternaam);
      closeAddModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
      else console.error("[medewerkers] save failed", err);
    } finally {
      submit.disabled = false;
    }
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

  function openArchiveModal(item) {
    state.archivingId = item.id;
    var modal = document.getElementById("me-archive-modal");
    document.getElementById("me-archive-preview").textContent = item.fullName || "";
    var slider = document.getElementById("me-archive-slider");
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("me-archive-confirm-btn").disabled = true;
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closeArchiveModal() {
    state.archivingId = null;
    var modal = document.getElementById("me-archive-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  function openPurgeModal(item) {
    state.purgingId = item.id;
    var modal = document.getElementById("me-purge-modal");
    document.getElementById("me-purge-preview").textContent = item.fullName || "";
    var slider = document.getElementById("me-purge-slider");
    slider.value = 0;
    slider.style.setProperty("--employee-slider-pct", "0%");
    document.getElementById("me-purge-confirm-btn").disabled = true;
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closePurgeModal() {
    state.purgingId = null;
    var modal = document.getElementById("me-purge-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  function wireEvents() {
    document.getElementById("me-add-btn").addEventListener("click", openAddModal);
    document.getElementById("me-add-close-btn").addEventListener("click", closeAddModal);
    document.getElementById("me-add-cancel-btn").addEventListener("click", closeAddModal);
    document.getElementById("me-add-form").addEventListener("submit", submitAddForm);

    document.getElementById("me-search").addEventListener("input", function (e) { state.search = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("me-archived-toggle").addEventListener("change", function (e) { state.showArchived = !!e.target.checked; state.page = 1; render(); });
    document.getElementById("me-filter-dienstverband").addEventListener("change", function (e) { state.filterEmployment = e.target.value || ""; state.page = 1; render(); });
    document.getElementById("me-filter-sick").addEventListener("change", function (e) { state.onlySick = !!e.target.checked; state.page = 1; render(); });
    document.getElementById("me-filter-reset").addEventListener("click", resetAllFilters);

    document.getElementById("me-rows-per-page").addEventListener("change", function (e) { state.rowsPerPage = Number(e.target.value) || ROWS_PER_PAGE_DEFAULT; state.page = 1; render(); });
    document.getElementById("me-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    document.getElementById("me-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page -= 1; render(); } });
    document.getElementById("me-pager-next").addEventListener("click", function () { state.page += 1; render(); });
    document.getElementById("me-pager-last").addEventListener("click", function () {
      var rpp = state.rowsPerPage || ROWS_PER_PAGE_DEFAULT;
      state.page = Math.max(1, Math.ceil(getVisible().length / rpp));
      render();
    });

    document.getElementById("me-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (btn) {
        e.stopPropagation();
        var id = btn.getAttribute("data-id");
        var item = window.mainEmployeesDB.getByIdSync(id);
        if (!item) return;
        var action = btn.getAttribute("data-action");
        if (action === "archive") openArchiveModal(item);
        else if (action === "restore") {
          window.mainEmployeesDB.restore(id).then(function () {
            if (window.showActionFeedback) window.showActionFeedback("restored", item.fullName);
          }).catch(function (err) { if (window.showError) window.showError("Herstellen mislukt: " + err.message); });
        }
        else if (action === "purge") openPurgeModal(item);
        return;
      }
      // Hele rij klikbaar → detailpagina (BS2: /main-employee/employee-details/{id})
      var tr = e.target.closest("tr[data-id]");
      if (!tr) return;
      window.location.href = "medewerker-detail.html?id=" + encodeURIComponent(tr.getAttribute("data-id"));
    });

    setupSliderModal("me-archive-slider", "me-archive-confirm-btn");
    document.getElementById("me-archive-close-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("me-archive-cancel-btn").addEventListener("click", closeArchiveModal);
    document.getElementById("me-archive-confirm-btn").addEventListener("click", function () {
      var id = state.archivingId;
      if (!id) return;
      var item = window.mainEmployeesDB.getByIdSync(id);
      window.mainEmployeesDB.archive(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("archived", item && item.fullName || "");
        closeArchiveModal();
      }).catch(function (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        closeArchiveModal();
      });
    });

    setupSliderModal("me-purge-slider", "me-purge-confirm-btn");
    document.getElementById("me-purge-close-btn").addEventListener("click", closePurgeModal);
    document.getElementById("me-purge-cancel-btn").addEventListener("click", closePurgeModal);
    document.getElementById("me-purge-confirm-btn").addEventListener("click", function () {
      var id = state.purgingId;
      if (!id) return;
      var item = window.mainEmployeesDB.getByIdSync(id);
      window.mainEmployeesDB.delete(id).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("deleted", item && item.fullName || "");
        closePurgeModal();
      }).catch(function (err) {
        if (window.showError) window.showError("Verwijderen mislukt: " + err.message);
        closePurgeModal();
      });
    });

    window.addEventListener("besa:main-employees-updated", render);

    function isAddOpen() { var m = document.getElementById("me-add-modal"); return m && getComputedStyle(m).display !== "none"; }
    function isArchiveOpen() { var m = document.getElementById("me-archive-modal"); return m && !m.hasAttribute("hidden"); }
    function isPurgeOpen() { var m = document.getElementById("me-purge-modal"); return m && !m.hasAttribute("hidden"); }
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (isPurgeOpen()) { ev.stopPropagation(); closePurgeModal(); return; }
      if (isArchiveOpen()) { ev.stopPropagation(); closeArchiveModal(); return; }
      if (isAddOpen()) { ev.stopPropagation(); closeAddModal(); return; }
    });
    ["me-add-modal", "me-archive-modal", "me-purge-modal"].forEach(function (id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.addEventListener("click", function (e) {
        if (e.target !== m) return;
        if (id === "me-add-modal") closeAddModal();
        else if (id === "me-archive-modal") closeArchiveModal();
        else if (id === "me-purge-modal") closePurgeModal();
      });
    });
  }

  function init() {
    if (!window.mainEmployeesDB) { console.error("[medewerkers] mainEmployeesDB niet geladen"); return; }
    wireEvents();
    render();
    window.mainEmployeesDB.ready.then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
