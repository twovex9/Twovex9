/* global window, document */
/**
 * werkuren.js — page-script voor werkuren.html (Geregistreerde uren).
 *
 * Toont per kalendermaand alle geregistreerde werkuren, gegroepeerd per
 * medewerker. Drie filters in de zijbalk (gebruiker / cliënt / label) +
 * datum-bereik via kalender (klik op een dag = filter op die dag; default
 * = hele maand).
 *
 * Bewerken/verwijderen via row-acties; Mij/Maand vergrendelen via knop.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return ("0" + n).slice(-2); }

  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  var MONTHS_EN = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  var DAY_NL = ["S", "M", "T", "W", "T", "F", "S"]; // Zo Ma Di Wo Do Vr Za zoals in screenshot

  function formatNlDate(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function formatNlDateLong(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.getDate() + " " + MONTHS_NL[d.getMonth()] + " " + d.getFullYear();
  }
  function formatTime(t) {
    if (!t) return "—";
    var s = String(t);
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    return m ? pad2(m[1]) + ":" + m[2] : s;
  }
  function formatDuur(minutes) {
    var n = Number(minutes || 0);
    if (n <= 0) return "0u";
    var h = Math.floor(n / 60);
    var m = n % 60;
    if (m === 0) return h + "u";
    return h + "u " + m + "m";
  }
  function durHoursDecimal(minutes) {
    return Math.round((Number(minutes || 0) / 60) * 100) / 100;
  }
  function durFormatHours(minutes) {
    var v = durHoursDecimal(minutes);
    return v.toFixed(2).replace(".", ",");
  }
  function initialsFromName(naam) {
    var parts = String(naam || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "??";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getMedewerkerNaam(id) {
    if (!id) return "(onbekend)";
    if (window.medewerkersDB && typeof window.medewerkersDB.getByIdSync === "function") {
      var m = window.medewerkersDB.getByIdSync(id);
      if (m) return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "(zonder naam)";
    }
    return "(onbekend)";
  }
  function getClientNaam(id, fallback) {
    if (!id) return fallback || "—";
    if (window.clientenDB && typeof window.clientenDB.getByIdSync === "function") {
      var c = window.clientenDB.getByIdSync(id);
      if (c) return ((c.voornaam || "") + " " + (c.achternaam || "")).trim() || (fallback || "—");
    }
    return fallback || "—";
  }
  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("wu-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 1500);
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var today = new Date();
  var state = {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    selectedDay: null, // null = hele maand; anders specifieke dag (1..31)
    filterUser: null,
    filterClient: null,
    filterLabel: null,
    editingId: null,
    purgingId: null,
    chips: { user: null, client: null, label: null },
  };

  // ---------------------------------------------------------------------------
  // Kalender (zijbalk)
  // ---------------------------------------------------------------------------
  function renderCalendar() {
    var year = state.year, month = state.month;
    $("wu-cal-label").textContent = MONTHS_EN[month - 1] + " " + year;
    var grid = $("wu-cal-grid");
    var first = new Date(year, month - 1, 1);
    var firstDow = first.getDay();
    var daysInMonth = new Date(year, month, 0).getDate();
    var daysInPrev = new Date(year, month - 1, 0).getDate();
    var html = "";
    DAY_NL.forEach(function (d) { html += '<div class="wu-cal-dowh">' + d + '</div>'; });
    for (var i = firstDow; i > 0; i -= 1) {
      var pd = daysInPrev - i + 1;
      html += '<button type="button" class="wu-cal-day wu-cal-day--out">' + pd + '</button>';
    }
    for (var d2 = 1; d2 <= daysInMonth; d2 += 1) {
      var sel = state.selectedDay === d2 ? " wu-cal-day--sel" : "";
      html += '<button type="button" class="wu-cal-day' + sel + '" data-day="' + d2 + '">' + d2 + '</button>';
    }
    var totalCells = firstDow + daysInMonth;
    var trail = (7 - (totalCells % 7)) % 7;
    for (var t = 1; t <= trail; t += 1) {
      html += '<button type="button" class="wu-cal-day wu-cal-day--out">' + t + '</button>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll(".wu-cal-day[data-day]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = parseInt(b.getAttribute("data-day"), 10);
        state.selectedDay = state.selectedDay === d ? null : d;
        renderCalendar();
        renderTable();
      });
    });

    // Update lock-button label en state
    updateLockButton();
    // Update period title + filter chip-options
    updatePeriodTitle();
  }

  function updatePeriodTitle() {
    var year = state.year, month = state.month;
    var monthLabel = MONTHS_NL[month - 1];
    var daysInMonth = new Date(year, month, 0).getDate();
    if (state.selectedDay) {
      $("wu-period-title").textContent = state.selectedDay + " " + monthLabel + " " + year;
    } else {
      $("wu-period-title").textContent = "1 " + monthLabel + " - " + daysInMonth + " " + monthLabel;
    }
  }

  function updateLockButton() {
    var btn = $("wu-lock-btn");
    var label = $("wu-lock-btn-label");
    var monthLabel = MONTHS_NL[state.month - 1].charAt(0).toUpperCase() + MONTHS_NL[state.month - 1].slice(1);
    // Voor "Mij vergrendelen": gebruik huidige profiel medewerker_id
    var profile = window.profilesDB && window.profilesDB.getCurrentSync ? window.profilesDB.getCurrentSync() : null;
    var medId = profile && profile.medewerker_id ? profile.medewerker_id : null;
    var isLocked = medId && window.werkurenVergrendeldDB
      ? window.werkurenVergrendeldDB.isLockedSync(medId, state.year, state.month) : false;
    if (isLocked) {
      label.textContent = monthLabel + " ontgrendelen";
      btn.classList.add("wu-lock-btn--locked");
    } else {
      label.textContent = monthLabel + " vergrendelen";
      btn.classList.remove("wu-lock-btn--locked");
    }
  }

  // ---------------------------------------------------------------------------
  // Tabel render
  // ---------------------------------------------------------------------------
  function getFilteredEntries() {
    if (!window.werkurenDB) return [];
    var entries = window.werkurenDB.getForMonthSync(state.year, state.month);
    if (state.selectedDay) {
      entries = entries.filter(function (r) {
        if (!r.datum) return false;
        var d = new Date(r.datum);
        return d.getDate() === state.selectedDay;
      });
    }
    if (state.filterUser) entries = entries.filter(function (r) { return String(r.medewerker_id) === String(state.filterUser); });
    if (state.filterClient) entries = entries.filter(function (r) { return String(r.client_id || "") === String(state.filterClient); });
    if (state.filterLabel) entries = entries.filter(function (r) { return r.label === state.filterLabel; });
    return entries;
  }

  function renderTable() {
    var entries = getFilteredEntries();
    var tbody = $("wu-tbody");
    if (!tbody) return;

    // Group per medewerker
    var groups = new Map();
    entries.forEach(function (r) {
      var key = r.medewerker_id || "_unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    var sortedKeys = Array.from(groups.keys()).sort(function (a, b) {
      return getMedewerkerNaam(a).localeCompare(getMedewerkerNaam(b), "nl", { sensitivity: "base" });
    });

    if (sortedKeys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="incident-empty">Geen werkuren-registraties in deze periode</td></tr>';
    } else {
      var EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      var TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

      var html = sortedKeys.map(function (key) {
        var rows = groups.get(key);
        rows.sort(function (a, b) { return (Date.parse(a.datum) || 0) - (Date.parse(b.datum) || 0); });
        var naam = key === "_unknown" ? "(zonder medewerker)" : getMedewerkerNaam(key);
        var ini = initialsFromName(naam);
        var groupHeader =
          '<tr class="wu-group-row" data-emp="' + escHtml(key) + '">'
          + '<td colspan="7" class="wu-group-cell">'
          +   '<button type="button" class="wu-group-toggle" aria-expanded="true">▾</button>'
          +   '<span class="wu-group-avatar">' + escHtml(ini) + '</span>'
          +   '<span class="wu-group-naam">' + escHtml(naam) + '</span>'
          +   '<span class="wu-group-count">(' + rows.length + ')</span>'
          + '</td>'
          + '<td class="wu-group-actions">'
          +   '<button type="button" class="btn-outline wu-agenda-btn" data-emp="' + escHtml(key) + '">'
          +     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
          +     ' Bekijken in agenda</button>'
          + '</td>'
          + '</tr>';
        var entryRows = rows.map(function (r) {
          var clientLabel = r.client_label || getClientNaam(r.client_id, "—");
          var tijd = (r.starttijd || r.eindtijd) ? (formatTime(r.starttijd) + " - " + formatTime(r.eindtijd)) : "—";
          return '<tr class="wu-entry-row" data-emp="' + escHtml(key) + '" data-id="' + escHtml(r.id) + '">'
            + '<td data-col="datum">' + escHtml(formatNlDate(r.datum)) + '</td>'
            + '<td data-col="tijd">' + escHtml(tijd) + '</td>'
            + '<td data-col="duur">' + escHtml(formatDuur(r.duur_minuten)) + '</td>'
            + '<td data-col="client">' + escHtml(clientLabel) + '</td>'
            + '<td data-col="dienst">' + escHtml(r.dienst || "--") + '</td>'
            + '<td data-col="label">' + escHtml(r.label || "--") + '</td>'
            + '<td data-col="beschrijving">' + escHtml(r.beschrijving || "--") + '</td>'
            + '<td data-col="acties" class="wu-row-actions">'
            +   '<button type="button" class="wu-row-edit" data-id="' + escHtml(r.id) + '" aria-label="Bewerken">' + EDIT_SVG + '</button>'
            +   '<button type="button" class="employee-delete-btn wu-row-purge" data-id="' + escHtml(r.id) + '" aria-label="Verwijderen">' + TRASH_SVG + '</button>'
            + '</td>'
            + '</tr>';
        }).join("");
        return groupHeader + entryRows;
      }).join("");
      tbody.innerHTML = html;
    }

    // Totalen
    var totMin = 0;
    entries.forEach(function (r) { totMin += Number(r.duur_minuten || 0); });
    $("wu-total-hours").textContent = durFormatHours(totMin);
    $("wu-total-meds").textContent = sortedKeys.length;
    $("wu-total-entries").textContent = entries.length;

    // Wire row actions
    tbody.querySelectorAll(".wu-row-edit").forEach(function (b) {
      b.addEventListener("click", function () { openEdit(b.getAttribute("data-id")); });
    });
    tbody.querySelectorAll(".wu-row-purge").forEach(function (b) {
      b.addEventListener("click", function () { openPurge(b.getAttribute("data-id")); });
    });
    tbody.querySelectorAll(".wu-group-toggle").forEach(function (b) {
      b.addEventListener("click", function () {
        var groupRow = b.closest("tr.wu-group-row");
        var empKey = groupRow.getAttribute("data-emp");
        var collapsed = b.classList.toggle("is-collapsed");
        b.textContent = collapsed ? "▸" : "▾";
        b.setAttribute("aria-expanded", collapsed ? "false" : "true");
        tbody.querySelectorAll('tr.wu-entry-row[data-emp="' + (empKey || "").replace(/"/g, '\\"') + '"]').forEach(function (er) {
          er.classList.toggle("wu-entry-collapsed", collapsed);
        });
      });
    });
    tbody.querySelectorAll(".wu-agenda-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var empId = b.getAttribute("data-emp");
        // Open planning.html (agenda) gefilterd op deze medewerker — best-effort link.
        var url = "planning.html?med=" + encodeURIComponent(empId)
          + "&jaar=" + state.year + "&maand=" + state.month;
        window.open(url, "_blank");
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Filter chips (gebruiker / cliënt / label)
  // ---------------------------------------------------------------------------
  function buildUserOptions() {
    if (!window.medewerkersDB) return [];
    var meds = window.medewerkersDB.getAllSync() || [];
    return meds.filter(function (m) { return m && !m.archived; })
      .map(function (m) {
        return { value: m.id, label: ((m.voornaam || "") + " " + (m.achternaam || "")).trim() };
      })
      .filter(function (o) { return o.label; })
      .sort(function (a, b) { return a.label.localeCompare(b.label, "nl"); });
  }
  function buildClientOptions() {
    if (!window.clientenDB) return [];
    var cs = window.clientenDB.getAllSync() || [];
    return cs.filter(function (c) { return c && !c.archived; })
      .map(function (c) {
        return { value: c.id, label: ((c.voornaam || "") + " " + (c.achternaam || "")).trim() };
      })
      .filter(function (o) { return o.label; })
      .sort(function (a, b) { return a.label.localeCompare(b.label, "nl"); });
  }
  function buildLabelOptions() {
    if (!window.werkurenLabelsDB) return [];
    return (window.werkurenLabelsDB.getAllSync() || [])
      .filter(function (l) { return l && !l.archived; })
      .map(function (l) { return { value: l.naam, label: l.naam }; });
  }

  function rebuildFilterChips() {
    if (!window.besaFilterChips) return;
    var userBtn = $("wu-filter-user-btn");
    var clientBtn = $("wu-filter-client-btn");
    var labelBtn = $("wu-filter-label-btn");

    // Init chips één keer; daarna alleen opties bijwerken.
    if (!userBtn.dataset.chipInited) {
      state.chips.user = window.besaFilterChips.createSearchSelectChip({
        button: userBtn, label: "Selecteer Gebruiker",
        options: buildUserOptions(),
        clearLabel: "Alle gebruikers tonen",
        onChange: function (v) { state.filterUser = v; renderTable(); },
      });
      userBtn.dataset.chipInited = "1";
    }
    if (!clientBtn.dataset.chipInited) {
      state.chips.client = window.besaFilterChips.createSearchSelectChip({
        button: clientBtn, label: "Selecteer Cliënt",
        options: buildClientOptions(),
        clearLabel: "Alle cliënten tonen",
        onChange: function (v) { state.filterClient = v; renderTable(); },
      });
      clientBtn.dataset.chipInited = "1";
    }
    if (!labelBtn.dataset.chipInited) {
      state.chips.label = window.besaFilterChips.createSearchSelectChip({
        button: labelBtn, label: "Selecteer Label",
        options: buildLabelOptions(),
        clearLabel: "Alle labels tonen",
        onChange: function (v) { state.filterLabel = v; renderTable(); },
      });
      labelBtn.dataset.chipInited = "1";
    }
  }

  // ---------------------------------------------------------------------------
  // Edit modal
  // ---------------------------------------------------------------------------
  function populateClientSelect(selectId, currentId) {
    var sel = $(selectId);
    sel.innerHTML = '<option value="">— Geen cliënt —</option>';
    var cs = window.clientenDB ? window.clientenDB.getAllSync() : [];
    cs.filter(function (c) { return c && !c.archived; })
      .sort(function (a, b) { return ((a.voornaam || "") + " " + (a.achternaam || "")).localeCompare((b.voornaam || "") + " " + (b.achternaam || ""), "nl"); })
      .forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
        sel.appendChild(opt);
      });
    if (currentId) sel.value = currentId;
  }
  function populateLabelSelect(selectId, currentLabel) {
    var sel = $(selectId);
    sel.innerHTML = '<option value="">Selecteer Label</option>';
    var ls = window.werkurenLabelsDB ? window.werkurenLabelsDB.getAllSync() : [];
    ls.filter(function (l) { return l && !l.archived; })
      .forEach(function (l) {
        var opt = document.createElement("option");
        opt.value = l.naam;
        opt.textContent = l.naam;
        sel.appendChild(opt);
      });
    if (currentLabel) sel.value = currentLabel;
  }

  function openEdit(id) {
    var rec = window.werkurenDB.getByIdSync(id);
    if (!rec) return;
    state.editingId = id;
    var naam = getMedewerkerNaam(rec.medewerker_id);
    $("wu-edit-emp-avatar").textContent = initialsFromName(naam);
    $("wu-edit-emp-naam").textContent = naam;
    $("wu-edit-id").value = id;
    $("wu-edit-datum").value = rec.datum || "";
    $("wu-edit-start").value = rec.starttijd ? String(rec.starttijd).slice(0, 5) : "";
    $("wu-edit-eind").value = rec.eindtijd ? String(rec.eindtijd).slice(0, 5) : "";
    $("wu-edit-duur").value = rec.duur_minuten ? durHoursDecimal(rec.duur_minuten) : "";
    populateClientSelect("wu-edit-client", rec.client_id);
    populateLabelSelect("wu-edit-label", rec.label);
    $("wu-edit-beschr").value = rec.beschrijving || "";
    var err = $("wu-edit-error"); err.hidden = true; err.textContent = "";
    showModal("wu-edit-modal");
  }
  async function submitEdit(ev) {
    ev.preventDefault();
    var id = state.editingId; if (!id) return;
    var datum = $("wu-edit-datum").value;
    var start = $("wu-edit-start").value || "";
    var eind = $("wu-edit-eind").value || "";
    var duur = parseFloat($("wu-edit-duur").value);
    var client_id = $("wu-edit-client").value || null;
    var clientNaam = client_id ? getClientNaam(client_id, "") : "";
    var label = $("wu-edit-label").value || "";
    var beschr = $("wu-edit-beschr").value || "";
    var err = $("wu-edit-error");
    if (!datum) { err.hidden = false; err.textContent = "Datum is verplicht."; return; }

    // Bereken duur_minuten: gebruik 'duur' als die ingevuld, anders bereken uit start+eind.
    var duur_minuten = 0;
    if (isFinite(duur) && duur > 0) {
      duur_minuten = Math.round(duur * 60);
    } else if (start && eind) {
      var sm = start.split(":"), em = eind.split(":");
      var startMin = parseInt(sm[0], 10) * 60 + parseInt(sm[1], 10);
      var eindMin = parseInt(em[0], 10) * 60 + parseInt(em[1], 10);
      if (eindMin < startMin) eindMin += 24 * 60;
      duur_minuten = eindMin - startMin;
    }

    var btn = $("wu-edit-submit"); btn.disabled = true;
    var orig = btn.textContent; btn.textContent = "Bezig…";
    try {
      await window.werkurenDB.update(id, {
        datum: datum, starttijd: start || null, eindtijd: eind || null, duur_minuten: duur_minuten,
        client_id: client_id, client_label: clientNaam, label: label, beschrijving: beschr,
      });
      toast("saved", "Werkuren bijgewerkt");
      hideModal("wu-edit-modal");
      state.editingId = null;
    } catch (e) {
      err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  function openPurge(id) {
    var rec = window.werkurenDB.getByIdSync(id);
    if (!rec) return;
    state.purgingId = id;
    var naam = getMedewerkerNaam(rec.medewerker_id);
    $("wu-purge-preview").textContent = formatNlDateLong(rec.datum) + " — " + naam;
    var s = $("wu-purge-slider"); s.value = 0; s.style.setProperty("--employee-slider-pct", "0%");
    $("wu-purge-confirm").disabled = true;
    showModal("wu-purge-modal");
  }
  async function confirmPurge() {
    var id = state.purgingId; if (!id) return;
    hideModal("wu-purge-modal");
    state.purgingId = null;
    try {
      await window.werkurenDB.delete(id);
      toast("deleted", "Werkuren verwijderd");
    } catch (e) {
      toast("error", "Verwijderen mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function showModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = false; m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var first = m.querySelector("input, textarea, select");
    if (first) { try { first.focus(); first.select && first.select(); } catch (e) { /* */ } }
  }
  function hideModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = true; m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
  }

  // ---------------------------------------------------------------------------
  // Wire-up
  // ---------------------------------------------------------------------------
  function wireSliderConfirm(sliderId, btnId) {
    var slider = $(sliderId), btn = $(btnId);
    if (!slider || !btn) return;
    slider.addEventListener("input", function () {
      var v = Number(slider.value);
      slider.style.setProperty("--employee-slider-pct", v + "%");
      btn.disabled = v < 100;
    });
  }

  function wireUp() {
    // Kalender-nav
    $("wu-cal-prev").addEventListener("click", function () {
      if (state.month === 1) { state.month = 12; state.year -= 1; }
      else { state.month -= 1; }
      state.selectedDay = null;
      renderCalendar(); renderTable();
    });
    $("wu-cal-next").addEventListener("click", function () {
      if (state.month === 12) { state.month = 1; state.year += 1; }
      else { state.month += 1; }
      state.selectedDay = null;
      renderCalendar(); renderTable();
    });

    // Lock/unlock
    $("wu-lock-btn").addEventListener("click", async function () {
      var profile = window.profilesDB && window.profilesDB.getCurrentSync ? window.profilesDB.getCurrentSync() : null;
      var medId = profile && profile.medewerker_id ? profile.medewerker_id : null;
      if (!medId) { toast("error", "Geen gekoppelde medewerker bij dit profiel"); return; }
      var locked = window.werkurenVergrendeldDB.isLockedSync(medId, state.year, state.month);
      try {
        if (locked) { await window.werkurenVergrendeldDB.unlock(medId, state.year, state.month); toast("info", "Maand ontgrendeld"); }
        else { await window.werkurenVergrendeldDB.lock(medId, state.year, state.month); toast("saved", "Maand vergrendeld"); }
        updateLockButton();
      } catch (e) {
        toast("error", "Mislukt: " + (e && e.message ? e.message : String(e)));
      }
    });

    // Export
    $("wu-export-btn").addEventListener("click", function () {
      if (typeof window.besaExport !== "function") { toast("error", "Export-helper niet geladen"); return; }
      var entries = getFilteredEntries();
      var data = entries.map(function (r) {
        return {
          "Medewerker": getMedewerkerNaam(r.medewerker_id),
          "Datum": formatNlDate(r.datum),
          "Starttijd": formatTime(r.starttijd),
          "Eindtijd": formatTime(r.eindtijd),
          "Duur": formatDuur(r.duur_minuten),
          "Cliënt": r.client_label || getClientNaam(r.client_id, ""),
          "Dienst": r.dienst || "",
          "Label": r.label || "",
          "Beschrijving": r.beschrijving || "",
        };
      });
      window.besaExport({
        filename: "geregistreerde-uren",
        title: "Geregistreerde uren",
        columns: ["Medewerker", "Datum", "Starttijd", "Eindtijd", "Duur", "Cliënt", "Dienst", "Label", "Beschrijving"],
        data: data,
      });
    });

    // Edit form
    $("wu-edit-close").addEventListener("click", function () { hideModal("wu-edit-modal"); });
    $("wu-edit-cancel").addEventListener("click", function () { hideModal("wu-edit-modal"); });
    $("wu-edit-form").addEventListener("submit", submitEdit);

    // Purge slider
    $("wu-purge-close").addEventListener("click", function () { hideModal("wu-purge-modal"); });
    $("wu-purge-cancel").addEventListener("click", function () { hideModal("wu-purge-modal"); });
    wireSliderConfirm("wu-purge-slider", "wu-purge-confirm");
    $("wu-purge-confirm").addEventListener("click", confirmPurge);

    // Modal overlay click sluit
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          overlay.hidden = true;
          overlay.setAttribute("aria-hidden", "true");
          if (!document.querySelector(".modal-overlay:not([hidden])")) document.body.classList.remove("modal-open");
        }
      });
    });

    // Live re-render bij data-changes
    window.addEventListener("besa:werkuren-updated", renderTable);
    window.addEventListener("besa:werkuren-vergrendeld-updated", updateLockButton);
    window.addEventListener("besa:medewerkers-updated", function () { rebuildFilterChips(); renderTable(); });
    window.addEventListener("besa:clienten-updated", function () { rebuildFilterChips(); renderTable(); });
    window.addEventListener("besa:werkuren-labels-updated", rebuildFilterChips);
  }

  function init() {
    wireUp();
    renderCalendar();
    renderTable();
    rebuildFilterChips();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
