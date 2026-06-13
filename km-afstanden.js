/* global window, document */
/**
 * Woon-werk afstanden — HR-beheerpagina.
 *
 * Toont een matrix loondienst-medewerker x werklocatie met de enkele-reis-
 * afstand (km). HR kan automatisch berekenen (geo-distance.js: PDOK + OSRM,
 * gratis) of een cel handmatig corrigeren. Een handmatige waarde blijft bij
 * her-berekenen staan (zie kmAfstandenDB.upsert).
 *
 * Bron-van-waarheid: window.kmAfstandenDB (tabel medewerker_locatie_afstanden).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  var state = {
    mws: [],          // loondienst-medewerkers (gesorteerd)
    locs: [],         // actieve locaties met bruikbaar adres
    search: "",
    onlyMissing: false,
    edit: null,       // {mwId, locId}
    busy: false,
  };

  // --- Helpers ---------------------------------------------------------------
  // Zelfde regel als salarisadministratie-exporter.js zodat dezelfde set
  // medewerkers in de km-vergoeding én de salaris-export meekomt.
  function isLoondienst(mw) {
    if (!mw) return false;
    var dv = String(mw.dienstverband || mw.employment_type || "").toLowerCase();
    return dv === "loondienst" || dv === "permanent" || dv === "vast";
  }

  function homeAdres(mw) {
    return {
      postcode: mw && mw.postcode ? String(mw.postcode) : "",
      huisnummer: mw && mw.huisnummer ? String(mw.huisnummer) : "",
      toevoeging: mw && mw.toevoeging ? String(mw.toevoeging) : "",
      plaats: mw && mw.plaats ? String(mw.plaats) : "",
    };
  }
  function locAdres(loc) {
    return {
      postcode: loc && loc.postcode ? String(loc.postcode) : "",
      huisnummer: loc && loc.huisnummer ? String(loc.huisnummer) : "",
      toevoeging: loc && loc.toevoeging ? String(loc.toevoeging) : "",
      plaats: loc && loc.plaats ? String(loc.plaats) : "",
    };
  }
  function hasHomeAdres(mw) {
    var a = homeAdres(mw);
    return !!(a.postcode && a.huisnummer);
  }
  function hasLocAdres(loc) {
    if (!loc) return false;
    var a = locAdres(loc);
    if (a.postcode && a.huisnummer) return true;
    return !!(loc.straat && a.plaats);
  }

  function nlNum(n) {
    if (n == null || n === "") return "";
    var v = Math.round(Number(n) * 10) / 10;
    if (!isFinite(v)) return "";
    return String(v).replace(".", ",");
  }
  function fullName(mw) {
    return ((mw && mw.voornaam ? mw.voornaam : "") + " " + (mw && mw.achternaam ? mw.achternaam : "")).trim();
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // --- Data laden ------------------------------------------------------------
  function loadData() {
    var allMw = (window.medewerkersDB && window.medewerkersDB.getAllSync)
      ? (window.medewerkersDB.getAllSync() || []) : [];
    state.mws = allMw
      .filter(function (m) { return m && !m.archived && isLoondienst(m); })
      .sort(function (a, b) {
        return String(a.achternaam || "").localeCompare(String(b.achternaam || ""), "nl")
          || String(a.voornaam || "").localeCompare(String(b.voornaam || ""), "nl");
      });

    var allLoc = (window.locatiesDB && window.locatiesDB.getAllSync)
      ? (window.locatiesDB.getAllSync() || []) : [];
    state.locs = allLoc
      .filter(function (l) { return l && !l.archived && hasLocAdres(l); })
      .sort(function (a, b) { return String(a.naam || "").localeCompare(String(b.naam || ""), "nl"); });
  }

  // --- Render ----------------------------------------------------------------
  function cellFor(mwId, locId) {
    return (window.kmAfstandenDB && window.kmAfstandenDB.getCell)
      ? window.kmAfstandenDB.getCell(mwId, locId) : null;
  }

  function rowMatchesSearch(mw) {
    if (!state.search) return true;
    return fullName(mw).toLowerCase().indexOf(state.search.toLowerCase()) >= 0;
  }
  function rowHasMissing(mw) {
    for (var i = 0; i < state.locs.length; i++) {
      var c = cellFor(mw.id, state.locs[i].id);
      if (!c || c.kmEnkel == null) return true;
    }
    return false;
  }

  function render() {
    loadData();
    var thead = $("kma-thead"), tbody = $("kma-tbody"), empty = $("kma-empty");
    if (!thead || !tbody) return;

    if (!state.mws.length) {
      thead.innerHTML = ""; tbody.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    // Kop
    var head = '<tr><th class="kma-col-mw">Medewerker</th><th class="kma-col-plaats">Woonplaats</th>';
    state.locs.forEach(function (loc) {
      head += '<th class="kma-col-loc" title="' + esc(loc.naam) + '">' + esc(loc.naam) + "</th>";
    });
    head += "</tr>";
    thead.innerHTML = head;

    // Rijen
    var rows = state.mws.filter(rowMatchesSearch).filter(function (mw) {
      return state.onlyMissing ? rowHasMissing(mw) : true;
    });

    var html = "";
    rows.forEach(function (mw) {
      var noAdres = !hasHomeAdres(mw);
      html += "<tr>";
      html += '<td class="kma-col-mw"><span class="kma-mw-name">' + esc(fullName(mw)) + "</span>"
        + (noAdres ? ' <span class="kma-badge kma-badge--warn" title="Geen postcode + huisnummer in HR — kan niet automatisch berekenen">geen adres</span>' : "")
        + "</td>";
      html += '<td class="kma-col-plaats">' + esc(mw.plaats || "—") + "</td>";
      state.locs.forEach(function (loc) {
        var c = cellFor(mw.id, loc.id);
        var has = c && c.kmEnkel != null;
        var manual = c && c.bron === "handmatig";
        var cls = "kma-cell" + (has ? "" : " kma-cell--empty") + (manual ? " kma-cell--manual" : "");
        var label = has ? nlNum(c.kmEnkel) : "—";
        var title = (manual ? "Handmatig" : (has ? "Automatisch berekend" : "Nog niet berekend"))
          + " — klik om te bewerken";
        html += '<td class="kma-col-loc">'
          + '<button type="button" class="' + cls + '" data-mw="' + esc(mw.id) + '" data-loc="' + esc(loc.id) + '" title="' + esc(title) + '">'
          + esc(label) + (manual ? '<span class="kma-cell-dot" aria-hidden="true"></span>' : "")
          + "</button></td>";
      });
      html += "</tr>";
    });
    tbody.innerHTML = html;
  }

  // --- Bewerk-modal ----------------------------------------------------------
  function mwById(id) { return state.mws.find(function (m) { return String(m.id) === String(id); }) || null; }
  function locById(id) { return state.locs.find(function (l) { return String(l.id) === String(id); }) || null; }

  function openEdit(mwId, locId) {
    var mw = mwById(mwId), loc = locById(locId);
    if (!mw || !loc) return;
    state.edit = { mwId: mwId, locId: locId };
    var c = cellFor(mwId, locId);
    $("kma-edit-sub").textContent = fullName(mw) + "  →  " + (loc.naam || "");
    $("kma-edit-km").value = (c && c.kmEnkel != null) ? c.kmEnkel : "";
    var hint = c
      ? (c.bron === "handmatig" ? "Huidige waarde is handmatig ingesteld." : "Huidige waarde is automatisch berekend.")
      : "Nog geen afstand bekend.";
    if (!hasHomeAdres(mw)) hint = "Let op: deze medewerker heeft geen postcode + huisnummer in HR — automatisch berekenen lukt niet.";
    $("kma-edit-hint").textContent = hint;
    setEditError("");
    var modal = $("kma-edit-modal");
    if (modal) modal.hidden = false;
    var inp = $("kma-edit-km");
    if (inp) { try { inp.focus(); } catch (e) {} }
  }
  function closeEdit() {
    state.edit = null;
    var modal = $("kma-edit-modal");
    if (modal) modal.hidden = true;
  }
  function setEditError(msg) {
    var el = $("kma-edit-error");
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; } else { el.textContent = ""; el.hidden = true; }
  }

  async function saveEditManual() {
    if (!state.edit) return;
    var val = $("kma-edit-km").value;
    if (val === "" || val == null) { setEditError("Vul een afstand in (km), of verwijder de waarde."); return; }
    var km = Number(String(val).replace(",", "."));
    if (!isFinite(km) || km < 0) { setEditError("Ongeldige afstand."); return; }
    try {
      await window.kmAfstandenDB.upsert({ medewerkerId: state.edit.mwId, locatieId: state.edit.locId, kmEnkel: km, bron: "handmatig" });
      closeEdit();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Afstand");
    } catch (err) {
      setEditError("Opslaan mislukt: " + (err && err.message ? err.message : err));
    }
  }

  async function recalcInModal() {
    if (!state.edit) return;
    var mw = mwById(state.edit.mwId), loc = locById(state.edit.locId);
    if (!mw || !loc) return;
    if (!hasHomeAdres(mw)) { setEditError("Geen postcode + huisnummer bekend voor deze medewerker."); return; }
    setEditError("");
    var btn = $("kma-edit-recalc");
    if (btn) { btn.disabled = true; btn.textContent = "Berekenen…"; }
    try {
      var r = await window.ffGeoDistance.calculateEnkeleReis(homeAdres(mw), locAdres(loc));
      if (r && r.km != null) {
        $("kma-edit-km").value = r.km;
        $("kma-edit-hint").textContent = "Berekend: " + nlNum(r.km) + " km (enkele reis). Klik Opslaan om over te nemen.";
      } else {
        setEditError((r && r.error) || "Route kon niet berekend worden.");
      }
    } catch (err) {
      setEditError("Berekening mislukt: " + (err && err.message ? err.message : err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Automatisch berekenen"; }
    }
  }

  // --- Batch-berekening ------------------------------------------------------
  function showProgress(done, total) {
    var wrap = $("kma-progress"), fill = $("kma-progress-fill"), txt = $("kma-progress-text");
    if (wrap) wrap.hidden = false;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (fill) fill.style.width = pct + "%";
    if (txt) txt.textContent = done + " / " + total + " berekend…";
  }
  function hideProgress() { var w = $("kma-progress"); if (w) w.hidden = true; }

  function setBusy(busy) {
    state.busy = busy;
    ["kma-recalc-all-btn", "kma-recalc-missing-btn"].forEach(function (id) {
      var b = $(id); if (b) b.disabled = busy;
    });
  }

  async function recalcBatch(onlyMissing) {
    if (state.busy) return;
    if (!window.ffGeoDistance) { if (window.showError) window.showError("Kaartservice niet geladen."); return; }
    loadData();
    var pairs = [];
    state.mws.forEach(function (mw) {
      if (!hasHomeAdres(mw)) return; // zonder adres niets te berekenen
      state.locs.forEach(function (loc) {
        var c = cellFor(mw.id, loc.id);
        if (onlyMissing) { if (c && c.kmEnkel != null) return; }
        else { if (c && c.bron === "handmatig") return; } // handmatig nooit overschrijven
        pairs.push({ mw: mw, loc: loc });
      });
    });
    if (!pairs.length) {
      if (window.showSaveModal) window.showSaveModal("Alle afstanden zijn al bekend.", "Niets te berekenen");
      else if (window.showActionFeedback) window.showActionFeedback("saved", "Afstanden");
      return;
    }
    setBusy(true);
    var total = pairs.length, done = 0, ok = 0, fail = 0;
    showProgress(0, total);
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      try {
        var r = await window.ffGeoDistance.calculateEnkeleReis(homeAdres(p.mw), locAdres(p.loc));
        if (r && r.km != null) {
          await window.kmAfstandenDB.upsert({ medewerkerId: p.mw.id, locatieId: p.loc.id, kmEnkel: r.km, bron: "auto" });
          ok++;
        } else { fail++; }
      } catch (e) { fail++; }
      done++;
      showProgress(done, total);
    }
    hideProgress();
    setBusy(false);
    render();
    var msg = ok + " afstand(en) berekend" + (fail ? ", " + fail + " mislukt (kaartservice/adres)." : ".");
    if (window.showSaveModal) window.showSaveModal(msg, "Klaar");
    else if (window.showActionFeedback) window.showActionFeedback("saved", "Afstanden");
  }

  // --- Events ----------------------------------------------------------------
  function bindEvents() {
    var search = $("kma-search");
    if (search) search.addEventListener("input", function () { state.search = search.value || ""; render(); });
    var only = $("kma-only-missing");
    if (only) only.addEventListener("change", function () { state.onlyMissing = !!only.checked; render(); });

    var tbody = $("kma-tbody");
    if (tbody) tbody.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".kma-cell") : null;
      if (!btn) return;
      openEdit(btn.getAttribute("data-mw"), btn.getAttribute("data-loc"));
    });

    var all = $("kma-recalc-all-btn");
    if (all) all.addEventListener("click", function () { recalcBatch(false); });
    var miss = $("kma-recalc-missing-btn");
    if (miss) miss.addEventListener("click", function () { recalcBatch(true); });

    $("kma-edit-close") && $("kma-edit-close").addEventListener("click", closeEdit);
    $("kma-edit-cancel") && $("kma-edit-cancel").addEventListener("click", closeEdit);
    $("kma-edit-save") && $("kma-edit-save").addEventListener("click", saveEditManual);
    $("kma-edit-recalc") && $("kma-edit-recalc").addEventListener("click", recalcInModal);

    var modal = $("kma-edit-modal");
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeEdit(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { var m = $("kma-edit-modal"); if (m && !m.hidden) closeEdit(); }
    });

    // Live re-render na elke matrix-mutatie.
    window.addEventListener("ff:km-afstanden-updated", function () { if (!state.busy) render(); });
  }

  // --- Boot ------------------------------------------------------------------
  async function boot() {
    bindEvents();
    var waits = [];
    if (window.medewerkersDB && window.medewerkersDB.ready) waits.push(window.medewerkersDB.ready);
    if (window.locatiesDB && window.locatiesDB.ready) waits.push(window.locatiesDB.ready);
    if (window.kmAfstandenDB && window.kmAfstandenDB.ready) waits.push(window.kmAfstandenDB.ready);
    try { await Promise.all(waits); } catch (e) { /* render toont wat er is */ }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
