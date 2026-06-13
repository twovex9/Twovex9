/* global window, document */
/**
 * mijn-uren.js — Self-service: de ingelogde MEDEWERKER registreert/bewerkt zijn
 * EIGEN gewerkte uren per maand. Schrijft naar Supabase via window.werkurenDB
 * (tabel public.werkuren), gescoped op het eigen profiel (profiles.medewerker_id).
 * Bestuur (Eigenaar/Directeur) ziet deze pagina niet (permissions-page-map.js).
 */
(function () {
  "use strict";

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  var state = { y: 0, m: 0, meId: null, editingId: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDatumNL(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d.getTime())) return String(iso);
    return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function entryDay(r) {
    var v = r && r.datum; if (!v) return "";
    var s = String(v); return s.length >= 10 ? s.slice(0, 10) : s;
  }
  function fmtTime(t) { return t ? String(t).slice(0, 5) : ""; }
  function formatDuur(min) {
    min = Number(min) || 0;
    if (min <= 0) return "—";
    var h = Math.floor(min / 60), m = min % 60;
    return h + "u" + (m ? " " + m + "m" : "");
  }
  function durHoursDecimal(min) {
    var h = (Number(min) || 0) / 60;
    return (Math.round(h * 100) / 100).toString();
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "MW";
    return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function ownNaam() {
    if (!state.meId || !window.medewerkersDB || !window.medewerkersDB.getByIdSync) return "";
    var mw = window.medewerkersDB.getByIdSync(state.meId);
    if (!mw) return "";
    return [mw.voornaam, mw.achternaam].filter(Boolean).join(" ").trim() || String(mw.naam || "").trim();
  }
  function getClientNaam(id) {
    if (!id || !window.clientenDB || !window.clientenDB.getByIdSync) return "";
    var c = window.clientenDB.getByIdSync(id);
    if (!c) return "";
    return ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
  }

  function monthLabel() {
    return (MAANDEN[state.m - 1] ? MAANDEN[state.m - 1].charAt(0).toUpperCase() + MAANDEN[state.m - 1].slice(1) : state.m) + " " + state.y;
  }

  function ownRows() {
    if (!state.meId || !window.werkurenDB) return [];
    return (window.werkurenDB.getForMedewerkerMonthSync(state.meId, state.y, state.m) || [])
      .slice()
      .sort(function (a, b) { return entryDay(a) < entryDay(b) ? -1 : entryDay(a) > entryDay(b) ? 1 : 0; });
  }

  // --- Maand-vergrendeling (optioneel: alleen als de data-laag aanwezig is) -----
  function isMonthLocked() {
    try {
      if (state.meId && window.lockedMonthsDB && window.lockedMonthsDB.isLockedSync) {
        return !!window.lockedMonthsDB.isLockedSync(state.meId, state.y, state.m);
      }
    } catch (e) { /* */ }
    return false;
  }

  var TRASH_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function render() {
    var tb = $("mu-tbody"); if (!tb) return;
    $("mu-month-label").textContent = monthLabel();

    var locked = isMonthLocked();
    var note = $("mu-locked-note"); if (note) note.hidden = !locked;
    var addBtn = $("mu-add-btn"); if (addBtn) addBtn.hidden = locked || !state.meId;

    if (!state.meId) {
      tb.innerHTML = '<tr><td colspan="9" class="mu-empty">Je account is nog niet aan een medewerker gekoppeld. Vraag de planner of HR om je te koppelen, dan kun je hier je uren registreren.</td></tr>';
      $("mu-total-uren").textContent = "0";
      $("mu-total-aantal").textContent = "0";
      return;
    }

    var rows = ownRows();
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9" class="mu-empty">Nog geen geregistreerde uren in ' + esc(monthLabel()) + '. Klik op "+ Uren toevoegen" om te beginnen.</td></tr>';
    } else {
      var html = "";
      rows.forEach(function (r) {
        var actie = locked
          ? ""
          : '<button type="button" class="employee-delete-btn mu-del-btn" data-id="' + esc(r.id) + '" aria-label="Verwijderen">' + TRASH_SVG + "</button>";
        html += '<tr class="mu-row" data-id="' + esc(r.id) + '" tabindex="0">' +
          "<td>" + esc(fmtDatumNL(entryDay(r))) + "</td>" +
          "<td>" + esc(fmtTime(r.starttijd)) + "</td>" +
          "<td>" + esc(fmtTime(r.eindtijd)) + "</td>" +
          '<td class="mu-num">' + esc(formatDuur(r.duur_minuten)) + "</td>" +
          "<td>" + esc(r.client_label || getClientNaam(r.client_id) || "") + "</td>" +
          "<td>" + esc(r.begeleidingstype || "") + "</td>" +
          "<td>" + esc(r.label || "") + "</td>" +
          "<td>" + esc(r.beschrijving || "") + "</td>" +
          '<td data-col="acties" class="mu-acties-cell">' + actie + "</td>" +
          "</tr>";
      });
      tb.innerHTML = html;
    }

    var totMin = 0; rows.forEach(function (r) { totMin += Number(r.duur_minuten || 0); });
    $("mu-total-uren").textContent = (Math.round((totMin / 60) * 100) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    $("mu-total-aantal").textContent = String(rows.length);
  }

  // --- Modal -------------------------------------------------------------------
  function showModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = false; m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var f = m.querySelector("input, select, textarea, [tabindex]"); if (f) try { f.focus(); } catch (e) {}
  }
  function hideModal(id) {
    var m = $(id); if (!m) return;
    m.hidden = true; m.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function populateClientSelect(currentId) {
    var sel = $("mu-edit-client");
    sel.innerHTML = '<option value="">— Geen cliënt —</option>';
    var cs = (window.clientenDB && window.clientenDB.getAllSync) ? (window.clientenDB.getAllSync() || []) : [];
    cs.filter(function (c) { return c && !c.archived; })
      .sort(function (a, b) { return ((a.voornaam || "") + " " + (a.achternaam || "")).localeCompare((b.voornaam || "") + " " + (b.achternaam || ""), "nl"); })
      .forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.id; opt.textContent = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
        sel.appendChild(opt);
      });
    sel.value = currentId || "";
  }
  function populateLabelSelect(currentLabel) {
    var sel = $("mu-edit-label");
    sel.innerHTML = '<option value="">Selecteer Label</option>';
    var ls = (window.werkurenLabelsDB && window.werkurenLabelsDB.getAllSync) ? (window.werkurenLabelsDB.getAllSync() || []) : [];
    ls.filter(function (l) { return l && !l.archived; }).forEach(function (l) {
      var opt = document.createElement("option");
      opt.value = l.naam; opt.textContent = l.naam; sel.appendChild(opt);
    });
    sel.value = currentLabel || "";
  }

  function fillEmp() {
    var naam = ownNaam() || "—";
    $("mu-edit-emp-avatar").textContent = initials(naam);
    $("mu-edit-emp-naam").textContent = naam;
  }
  function clearError() { var e = $("mu-edit-error"); e.hidden = true; e.textContent = ""; }

  function openAdd() {
    if (isMonthLocked() || !state.meId) return;
    state.editingId = null;
    $("mu-edit-title").textContent = "Uren toevoegen";
    $("mu-edit-id").value = "";
    // Default-datum: vandaag als die in de gekozen maand valt, anders de 1e van die maand.
    var today = new Date();
    var defDatum = (today.getFullYear() === state.y && (today.getMonth() + 1) === state.m)
      ? today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate())
      : state.y + "-" + pad(state.m) + "-01";
    $("mu-edit-datum").value = defDatum;
    $("mu-edit-start").value = "";
    $("mu-edit-eind").value = "";
    $("mu-edit-duur").value = "";
    $("mu-edit-begeleiding").value = "";
    $("mu-edit-beschr").value = "";
    fillEmp();
    populateClientSelect("");
    populateLabelSelect("");
    clearError();
    showModal("mu-edit-modal");
  }

  function openEdit(id) {
    if (isMonthLocked()) return;
    var rec = window.werkurenDB.getByIdSync(id);
    if (!rec) return;
    state.editingId = id;
    $("mu-edit-title").textContent = "Uren bewerken";
    $("mu-edit-id").value = id;
    $("mu-edit-datum").value = entryDay(rec) || "";
    $("mu-edit-start").value = fmtTime(rec.starttijd);
    $("mu-edit-eind").value = fmtTime(rec.eindtijd);
    $("mu-edit-duur").value = rec.duur_minuten ? durHoursDecimal(rec.duur_minuten) : "";
    $("mu-edit-begeleiding").value = rec.begeleidingstype || "";
    $("mu-edit-beschr").value = rec.beschrijving || "";
    fillEmp();
    populateClientSelect(rec.client_id);
    populateLabelSelect(rec.label);
    clearError();
    showModal("mu-edit-modal");
  }

  function computeDuurMinuten(duur, start, eind) {
    var d = parseFloat(duur);
    if (isFinite(d) && d > 0) return Math.round(d * 60);
    if (start && eind) {
      var sm = start.split(":"), em = eind.split(":");
      var startMin = parseInt(sm[0], 10) * 60 + parseInt(sm[1], 10);
      var eindMin = parseInt(em[0], 10) * 60 + parseInt(em[1], 10);
      if (eindMin < startMin) eindMin += 24 * 60;
      return eindMin - startMin;
    }
    return 0;
  }

  async function submitEdit(ev) {
    ev.preventDefault();
    if (!state.meId) return;
    var datum = $("mu-edit-datum").value;
    var start = $("mu-edit-start").value || "";
    var eind = $("mu-edit-eind").value || "";
    var client_id = $("mu-edit-client").value || null;
    var clientNaam = client_id ? getClientNaam(client_id) : "";
    var label = $("mu-edit-label").value || "";
    var begeleiding = $("mu-edit-begeleiding").value || "";
    var beschr = $("mu-edit-beschr").value || "";
    var err = $("mu-edit-error");
    if (!datum) { err.hidden = false; err.textContent = "Datum is verplicht."; return; }
    var duur_minuten = computeDuurMinuten($("mu-edit-duur").value, start, eind);

    var btn = $("mu-edit-submit"); btn.disabled = true;
    var orig = btn.textContent; btn.textContent = "Bezig…";
    var payload = {
      datum: datum, starttijd: start || null, eindtijd: eind || null, duur_minuten: duur_minuten,
      client_id: client_id, client_label: clientNaam, label: label, beschrijving: beschr,
      begeleidingstype: begeleiding,
    };
    try {
      if (state.editingId) {
        await window.werkurenDB.update(state.editingId, payload);
      } else {
        payload.medewerker_id = state.meId;
        await window.werkurenDB.add(payload);
      }
      if (window.showActionFeedback) window.showActionFeedback(state.editingId ? "saved" : "saved", "Uren");
      hideModal("mu-edit-modal");
      state.editingId = null;
      render();
    } catch (e) {
      err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e));
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  async function confirmDelete(id) {
    var rec = window.werkurenDB.getByIdSync(id);
    if (!rec) return;
    var preview = fmtDatumNL(entryDay(rec)) + " · " + formatDuur(rec.duur_minuten);
    var ok = true;
    if (window.showSliderConfirmModal) {
      ok = await window.showSliderConfirmModal({
        title: "Werkuren verwijderen", preview: preview,
        okLabel: "Verwijderen", cancelLabel: "Annuleren",
      });
    }
    if (!ok) return;
    try {
      await window.werkurenDB.delete(id);
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Uren");
      render();
    } catch (e) {
      if (window.showError) window.showError("Verwijderen mislukt: " + (e && e.message ? e.message : String(e)));
    }
  }

  function stepMonth(delta) {
    var d = new Date(state.y, state.m - 1 + delta, 1);
    state.y = d.getFullYear(); state.m = d.getMonth() + 1;
    render();
  }

  // --- Init --------------------------------------------------------------------
  function wire() {
    var now = new Date();
    state.y = now.getFullYear(); state.m = now.getMonth() + 1;

    $("mu-prev").addEventListener("click", function () { stepMonth(-1); });
    $("mu-next").addEventListener("click", function () { stepMonth(1); });
    $("mu-add-btn").addEventListener("click", openAdd);

    var tb = $("mu-tbody");
    tb.addEventListener("click", function (e) {
      var del = e.target.closest(".mu-del-btn");
      if (del) { e.stopPropagation(); confirmDelete(del.getAttribute("data-id")); return; }
      var tr = e.target.closest(".mu-row"); if (tr) openEdit(tr.getAttribute("data-id"));
    });
    tb.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var tr = e.target.closest(".mu-row"); if (tr) openEdit(tr.getAttribute("data-id")); }
    });

    $("mu-edit-form").addEventListener("submit", submitEdit);
    $("mu-edit-close").addEventListener("click", function () { hideModal("mu-edit-modal"); });
    $("mu-edit-cancel").addEventListener("click", function () { hideModal("mu-edit-modal"); });
    $("mu-edit-modal").addEventListener("click", function (e) { if (e.target === this) hideModal("mu-edit-modal"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("mu-edit-modal").hidden) hideModal("mu-edit-modal");
    });

    window.addEventListener("ff:werkuren-updated", render);
    window.addEventListener("ff:profile-updated", function () { refreshMe(); render(); });
    window.addEventListener("ff:medewerkers-updated", render);
    window.addEventListener("ff:clienten-updated", function () { /* dropdown ververst bij openen */ });
  }

  function refreshMe() {
    try {
      var prof = (window.profilesDB && window.profilesDB.getCurrentSync) ? window.profilesDB.getCurrentSync() : null;
      state.meId = prof ? (prof.medewerkerId || prof.medewerker_id || null) : null;
    } catch (e) { state.meId = null; }
  }

  function start() {
    wire();
    refreshMe();
    render();
    var waits = [];
    if (window.profilesDB && window.profilesDB.ready) waits.push(window.profilesDB.ready);
    if (window.werkurenDB && window.werkurenDB.ready) waits.push(window.werkurenDB.ready);
    if (window.medewerkersDB && window.medewerkersDB.ready) waits.push(window.medewerkersDB.ready);
    if (window.clientenDB && window.clientenDB.ready) waits.push(window.clientenDB.ready);
    Promise.all(waits.map(function (p) { return Promise.resolve(p).catch(function () {}); }))
      .then(function () { refreshMe(); render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
