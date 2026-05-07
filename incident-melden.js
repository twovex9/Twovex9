/* global window, document, FileReader */
/**
 * incident-melden.js — page-script voor incident-melden.html.
 *
 * Beheert de uitgebreide melding (Stage 9f):
 *  - Cliënt + extra betrokken partijen (cliënten/medewerkers)
 *  - Tijd en plaats (datum, tijdstip, binnen/buiten)
 *  - Actor type
 *  - Incident details (categorie, beschrijving, hoe veiligheid gewaarborgd)
 *  - Bijlagen (Supabase Storage bucket "incident-documenten")
 *  - Ouders/vertegenwoordigers geïnformeerd (ja/nee)
 *  - Feedback (gebeld worden + impact op zorgverlener)
 *  - Notificaties (team / specifieke medewerkers)
 *
 * Bron-van-waarheid: window.incidentenDB (Supabase). Bijlagen via
 * window.incidentDocsDB (zie incident-documenten-data.js).
 *
 * URL pattern:
 *  - incident-melden.html               -> nieuw incident
 *  - incident-melden.html?id=<uuid>     -> bewerk bestaand incident
 */
(function () {
  "use strict";

  // Maximale bestandgrootte voor bijlagen (5 MB).
  var MAX_FILE_SIZE = 5 * 1024 * 1024;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    editingId: null,
    rec: null,
    betrokken: [],          // [{type:'client'|'medewerker', id}]
    pendingFiles: [],       // Bijlagen voor nieuw incident, vóór insert.
                            // Element: {tempId, fileName, fileMime, fileSize, fileData(dataUrl)}
    notificeerTeam: false,
    notificeerMedewerkerIds: [], // [uuid]
    showSpecific: false,    // toggle voor "Specifieke medewerkers"-blok
  };

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  // ---------------------------------------------------------------------------
  // Data accessors
  // ---------------------------------------------------------------------------
  function getAllClienten() {
    if (!window.clientenDB) return [];
    try { return window.clientenDB.getAllSync() || []; } catch (e) { return []; }
  }
  function getAllMedewerkers() {
    if (!window.medewerkersDB) return [];
    try { return window.medewerkersDB.getAllSync() || []; } catch (e) { return []; }
  }
  function findById(arr, id) {
    if (!id) return null;
    var s = String(id);
    for (var i = 0; i < arr.length; i += 1) {
      if (arr[i] && String(arr[i].id) === s) return arr[i];
    }
    return null;
  }
  function clientLabel(c) {
    if (!c) return "—";
    var nm = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
    if (c.clientnummer) nm += " (" + c.clientnummer + ")";
    return nm || "—";
  }
  function medewerkerLabel(m) {
    if (!m) return "—";
    return (((m.voornaam || "") + " " + (m.achternaam || "")).trim()) || "—";
  }
  function partijLabel(p) {
    if (!p) return "—";
    if (p.type === "client") return clientLabel(findById(getAllClienten(), p.id));
    if (p.type === "medewerker") return medewerkerLabel(findById(getAllMedewerkers(), p.id));
    return "—";
  }
  function partijTypeLabel(t) { return t === "medewerker" ? "Medewerker" : "Cliënt"; }

  // ---------------------------------------------------------------------------
  // Toast / error
  // ---------------------------------------------------------------------------
  function toast(kind, msg) {
    if (typeof window.showActionFeedback === "function") {
      try { window.showActionFeedback(kind || "info", msg); return; } catch (e) { /* */ }
    }
    var t = $("im-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 500);
  }
  function showError(msg) {
    var el = $("im-error");
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ""; return; }
    el.textContent = msg; el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------------------------------------------------------------------------
  // Dropdown population
  // ---------------------------------------------------------------------------
  function fillSelect(sel, items, placeholder, labelFn, current) {
    if (!sel) return;
    sel.innerHTML = "";
    if (placeholder != null) {
      var o0 = document.createElement("option");
      o0.value = ""; o0.textContent = placeholder;
      sel.appendChild(o0);
    }
    items.forEach(function (it) {
      var o = document.createElement("option");
      o.value = String(it.id != null ? it.id : it.value);
      o.textContent = labelFn ? labelFn(it) : it.label;
      sel.appendChild(o);
    });
    if (current != null) sel.value = String(current);
  }

  function populateDropdowns() {
    var clienten = getAllClienten().filter(function (c) { return c && !c.archived; });
    var medewerkers = getAllMedewerkers().filter(function (m) { return m && !m.archived; });

    fillSelect($("im-client"), clienten, "Selecteer Cliënt", clientLabel, $("im-client").value);

    var cats = (window.incidentenDB && window.incidentenDB.CATEGORIES) || [];
    fillSelect($("im-categorie"), cats.map(function (c) { return { id: c, label: c }; }),
      "Selecteer een incident categorie", function (o) { return o.label; }, $("im-categorie").value);

    var tijdstippen = (window.incidentenDB && window.incidentenDB.TIJDSTIPPEN) || [];
    fillSelect($("im-tijdstip"), tijdstippen.map(function (t) { return { id: t.value, label: t.label }; }),
      "Selecteer tijdstip van de dag", function (o) { return o.label; }, $("im-tijdstip").value);

    fillSelect($("im-notif-medewerker-select"), medewerkers, "Selecteer medewerker", medewerkerLabel);

    refreshBetrokkenPersonSelect();
  }

  // ---------------------------------------------------------------------------
  // Actor type radio cards
  // ---------------------------------------------------------------------------
  function renderActorTypes() {
    var host = $("im-actor-list");
    if (!host) return;
    var types = (window.incidentenDB && window.incidentenDB.ACTOR_TYPES) || [];
    host.innerHTML = types.map(function (t) {
      return '<label class="im-actor-card">'
        + '<input type="radio" name="im-actor-type" value="' + escHtml(t.value) + '" />'
        + '<span class="im-actor-radio" aria-hidden="true"></span>'
        + '<span class="im-actor-body">'
        + '<span class="im-actor-label">' + escHtml(t.label) + '</span>'
        + '</span>'
        + '</label>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".im-actor-card"), function (card) {
      card.addEventListener("click", function () {
        Array.prototype.forEach.call(host.querySelectorAll(".im-actor-card"), function (c) {
          c.classList.remove("is-selected");
        });
        card.classList.add("is-selected");
      });
    });
  }
  function getSelectedActorType() {
    var c = document.querySelector('input[name="im-actor-type"]:checked');
    return c ? c.value : null;
  }
  function setSelectedActorType(value) {
    var el = document.querySelector('input[name="im-actor-type"][value="' + (value || "") + '"]');
    if (el) {
      el.checked = true;
      var card = el.closest(".im-actor-card");
      if (card) {
        Array.prototype.forEach.call(document.querySelectorAll(".im-actor-card"), function (c) { c.classList.remove("is-selected"); });
        card.classList.add("is-selected");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Betrokken partijen
  // ---------------------------------------------------------------------------
  function getSelectedBetrokkenType() {
    var c = document.querySelector('input[name="im-betrokken-type"]:checked');
    return c ? c.value : "client";
  }
  function refreshBetrokkenPersonSelect() {
    var type = getSelectedBetrokkenType();
    var sel = $("im-betrokken-person");
    if (!sel) return;
    if (type === "medewerker") {
      var meds = getAllMedewerkers().filter(function (m) { return m && !m.archived; });
      fillSelect(sel, meds, "Selecteer medewerker", medewerkerLabel);
    } else {
      var clis = getAllClienten().filter(function (c) { return c && !c.archived; });
      fillSelect(sel, clis, "Selecteer cliënt", clientLabel);
    }
  }
  function addBetrokken() {
    var type = getSelectedBetrokkenType();
    var sel = $("im-betrokken-person");
    var id = sel ? sel.value : "";
    if (!id) { toast("error", "Kies eerst een persoon."); return; }
    if (type === "client" && String($("im-client").value) === String(id)) {
      toast("error", "Deze cliënt is al de hoofd-cliënt van het incident.");
      return;
    }
    var exists = state.betrokken.some(function (b) { return b.type === type && String(b.id) === String(id); });
    if (exists) { toast("error", "Deze persoon staat al in de lijst."); return; }
    state.betrokken.push({ type: type, id: String(id) });
    if (sel) sel.value = "";
    renderBetrokkenList();
  }
  function removeBetrokken(idx) {
    state.betrokken.splice(idx, 1);
    renderBetrokkenList();
  }
  function renderBetrokkenList() {
    var host = $("im-betrokken-list");
    if (!host) return;
    if (state.betrokken.length === 0) {
      host.innerHTML = '<p class="im-betrokken-empty">Nog geen extra betrokken partijen toegevoegd.</p>';
      return;
    }
    host.innerHTML = state.betrokken.map(function (p, idx) {
      var dotClass = p.type === "medewerker" ? "im-betrokken-dot--med" : "im-betrokken-dot--cli";
      return '<span class="im-betrokken-chip">'
        + '<span class="im-betrokken-dot ' + dotClass + '" aria-hidden="true"></span>'
        + '<span class="im-betrokken-chip-type">' + partijTypeLabel(p.type) + ':</span> '
        + '<span class="im-betrokken-chip-name">' + escHtml(partijLabel(p)) + '</span>'
        + '<button type="button" class="im-betrokken-chip-x" data-idx="' + idx + '" aria-label="Verwijderen">'
        + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
        + '</span>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".im-betrokken-chip-x"), function (btn) {
      btn.addEventListener("click", function () {
        removeBetrokken(parseInt(btn.getAttribute("data-idx"), 10));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Bijlagen — upload & lijst
  // ---------------------------------------------------------------------------
  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Inlezen mislukt: " + file.name)); };
      fr.readAsDataURL(file);
    });
  }

  function formatFileSize(bytes) {
    var b = Number(bytes || 0);
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getDocsForCurrent() {
    if (!state.editingId) return [];
    if (!window.incidentDocsDB) return [];
    try { return window.incidentDocsDB.listSync(state.editingId) || []; } catch (e) { return []; }
  }

  function renderBijlagen() {
    var host = $("im-bijlagen-list");
    if (!host) return;
    var saved = getDocsForCurrent().filter(function (d) { return !d.archived; });
    var pend = state.pendingFiles;
    if (saved.length === 0 && pend.length === 0) {
      host.innerHTML = "";
      return;
    }
    var html = "";
    saved.forEach(function (d) {
      html += '<div class="im-bijlage-row" data-saved-id="' + escHtml(d.id) + '">'
        + '<span class="im-bijlage-ico" aria-hidden="true">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        + '</span>'
        + '<span class="im-bijlage-info">'
        + '<a class="im-bijlage-name" href="' + escHtml(d.fileData) + '" target="_blank" rel="noopener">' + escHtml(d.fileName || d.naam || "bestand") + '</a>'
        + '<span class="im-bijlage-meta">' + formatFileSize(d.fileSize) + '</span>'
        + '</span>'
        + '<button type="button" class="im-bijlage-x" data-saved-id="' + escHtml(d.id) + '" aria-label="Verwijderen">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
        + '</div>';
    });
    pend.forEach(function (f, idx) {
      html += '<div class="im-bijlage-row im-bijlage-row--pending" data-pending-idx="' + idx + '">'
        + '<span class="im-bijlage-ico" aria-hidden="true">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        + '</span>'
        + '<span class="im-bijlage-info">'
        + '<span class="im-bijlage-name">' + escHtml(f.fileName) + '</span>'
        + '<span class="im-bijlage-meta">' + formatFileSize(f.fileSize) + ' · upload bij opslaan</span>'
        + '</span>'
        + '<button type="button" class="im-bijlage-x" data-pending-idx="' + idx + '" aria-label="Verwijderen">'
        + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
        + '</div>';
    });
    host.innerHTML = html;

    Array.prototype.forEach.call(host.querySelectorAll(".im-bijlage-x"), function (btn) {
      btn.addEventListener("click", function () {
        var savedId = btn.getAttribute("data-saved-id");
        var pendingIdx = btn.getAttribute("data-pending-idx");
        if (savedId) removeSavedDoc(savedId);
        else if (pendingIdx != null) removePendingFile(parseInt(pendingIdx, 10));
      });
    });
  }

  async function addFiles(fileList) {
    if (!fileList || !fileList.length) return;
    var files = Array.prototype.slice.call(fileList);
    for (var i = 0; i < files.length; i += 1) {
      var f = files[i];
      if (!f) continue;
      if (f.size > MAX_FILE_SIZE) {
        toast("error", '"' + f.name + '" is groter dan 5 MB en is overgeslagen.');
        continue;
      }
      try {
        var dataUrl = await readFileAsDataUrl(f);
        if (state.editingId && window.incidentDocsDB) {
          // Direct uploaden naar Storage want we hebben al een incident_id.
          await window.incidentDocsDB.add({
            incidentId: state.editingId,
            naam: f.name,
            fileName: f.name,
            fileMime: f.type || "",
            fileSize: f.size,
            fileData: dataUrl,
          });
        } else {
          // Pending: pas uploaden bij submit.
          state.pendingFiles.push({
            tempId: "p_" + Date.now() + "_" + i,
            fileName: f.name,
            fileMime: f.type || "",
            fileSize: f.size,
            fileData: dataUrl,
          });
        }
      } catch (err) {
        toast("error", "Bijlage '" + f.name + "' niet toegevoegd: " + (err && err.message ? err.message : err));
      }
    }
    renderBijlagen();
  }

  async function removeSavedDoc(id) {
    if (!window.incidentDocsDB) return;
    try {
      await window.incidentDocsDB.remove(id);
      toast("deleted", "Bijlage verwijderd");
      renderBijlagen();
    } catch (err) {
      toast("error", "Verwijderen mislukt: " + (err && err.message ? err.message : err));
    }
  }

  function removePendingFile(idx) {
    state.pendingFiles.splice(idx, 1);
    renderBijlagen();
  }

  function setupBijlagen() {
    var input = $("im-upload-input");
    var label = $("im-upload-label");
    if (!input || !label) return;

    input.addEventListener("change", function () {
      addFiles(input.files);
      input.value = "";
    });

    // Drag & drop
    ["dragenter", "dragover"].forEach(function (evt) {
      label.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        label.classList.add("is-drag");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      label.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        label.classList.remove("is-drag");
      });
    });
    label.addEventListener("drop", function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files) addFiles(dt.files);
    });
  }

  // ---------------------------------------------------------------------------
  // Notificaties
  // ---------------------------------------------------------------------------
  function setNotifTeam(active) {
    state.notificeerTeam = !!active;
    var btn = $("im-notif-team");
    if (btn) {
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("is-active", !!active);
    }
  }
  function setShowSpecific(active) {
    state.showSpecific = !!active;
    var btn = $("im-notif-spec");
    var box = $("im-notif-medewerkers");
    if (btn) {
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.classList.toggle("is-active", !!active);
    }
    if (box) box.hidden = !active;
    if (!active) {
      // Bij uitzetten van toggle laten we de geselecteerde medewerkers bestaan
      // — gebruiker kan hem weer aanzetten zonder verlies. Wel renderen voor consistentie.
      // (Bewust geen reset hier.)
    }
  }
  function addNotifMedewerker() {
    var sel = $("im-notif-medewerker-select");
    var id = sel ? sel.value : "";
    if (!id) { toast("error", "Kies eerst een medewerker."); return; }
    if (state.notificeerMedewerkerIds.indexOf(String(id)) >= 0) {
      toast("error", "Deze medewerker staat al in de lijst.");
      return;
    }
    state.notificeerMedewerkerIds.push(String(id));
    if (sel) sel.value = "";
    renderNotifMedewerkers();
  }
  function removeNotifMedewerker(idx) {
    state.notificeerMedewerkerIds.splice(idx, 1);
    renderNotifMedewerkers();
  }
  function renderNotifMedewerkers() {
    var host = $("im-notif-medewerkers-list");
    if (!host) return;
    if (state.notificeerMedewerkerIds.length === 0) {
      host.innerHTML = '<p class="im-betrokken-empty">Nog geen medewerkers geselecteerd.</p>';
      return;
    }
    var meds = getAllMedewerkers();
    host.innerHTML = state.notificeerMedewerkerIds.map(function (id, idx) {
      var m = findById(meds, id);
      return '<span class="im-betrokken-chip">'
        + '<span class="im-betrokken-dot im-betrokken-dot--med" aria-hidden="true"></span>'
        + '<span class="im-betrokken-chip-type">Medewerker:</span> '
        + '<span class="im-betrokken-chip-name">' + escHtml(medewerkerLabel(m)) + '</span>'
        + '<button type="button" class="im-betrokken-chip-x" data-idx="' + idx + '" aria-label="Verwijderen">'
        + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        + '</button>'
        + '</span>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".im-betrokken-chip-x"), function (btn) {
      btn.addEventListener("click", function () {
        removeNotifMedewerker(parseInt(btn.getAttribute("data-idx"), 10));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Form populate / read
  // ---------------------------------------------------------------------------
  function isoToInputDate(value) {
    if (!value) return "";
    var t = Date.parse(value); if (!isFinite(t)) return "";
    var d = new Date(t);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function inputDateToIso(s, isoTimeFromExisting) {
    if (!s) return null;
    var hh = 12, mm = 0;
    if (isoTimeFromExisting) {
      var t = Date.parse(isoTimeFromExisting);
      if (isFinite(t)) {
        var d = new Date(t);
        hh = d.getHours(); mm = d.getMinutes();
      }
    }
    var d2 = new Date(s + "T" + pad(hh) + ":" + pad(mm) + ":00");
    return isFinite(d2.getTime()) ? d2.toISOString() : null;
  }

  function setOudersValue(v) {
    var val = v === true ? "ja" : v === false ? "nee" : "";
    var radios = document.querySelectorAll('input[name="im-ouders"]');
    Array.prototype.forEach.call(radios, function (r) { r.checked = (r.value === val); });
  }
  function getOudersValue() {
    var c = document.querySelector('input[name="im-ouders"]:checked');
    if (!c) return null;
    if (c.value === "ja") return true;
    if (c.value === "nee") return false;
    return null;
  }

  function populateForm(rec) {
    $("im-id").value = rec ? rec.id : "";
    $("im-client").value = rec && rec.clientId ? rec.clientId : "";
    $("im-categorie").value = rec && rec.categorie ? rec.categorie : "";
    $("im-tijdstip").value = rec && rec.tijdstipVanDag ? rec.tijdstipVanDag : "";
    $("im-buiten").checked = !!(rec && rec.isBuiten);
    $("im-omschrijving").value = rec && rec.omschrijving ? rec.omschrijving : "";
    $("im-maatregelen").value = rec && rec.genomenMaatregelen ? rec.genomenMaatregelen : "";
    $("im-impact").value = rec && rec.impactOpZorgverlener ? rec.impactOpZorgverlener : "";
    $("im-wil-gebeld").checked = !!(rec && rec.wilGebeldWorden);

    if (rec && rec.incidentDatum) {
      $("im-datum").value = isoToInputDate(rec.incidentDatum);
    } else {
      var d = new Date();
      $("im-datum").value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    setSelectedActorType(rec && rec.actorType ? rec.actorType : null);
    setOudersValue(rec ? rec.oudersGeinformeerd : null);

    state.betrokken = (rec && Array.isArray(rec.betrokkenPartijen)) ? rec.betrokkenPartijen.slice() : [];
    renderBetrokkenList();

    state.notificeerTeam = !!(rec && rec.notificeerTeam);
    state.notificeerMedewerkerIds = (rec && Array.isArray(rec.notificeerMedewerkerIds))
      ? rec.notificeerMedewerkerIds.slice() : [];
    setNotifTeam(state.notificeerTeam);
    setShowSpecific(state.notificeerMedewerkerIds.length > 0);
    renderNotifMedewerkers();

    var archiveBtn = $("im-archive-btn");
    if (archiveBtn) archiveBtn.hidden = !rec || !!rec.archived;

    // Bijlagen voor edit-mode laden
    if (rec && rec.id && window.incidentDocsDB) {
      window.incidentDocsDB.list(rec.id).then(renderBijlagen).catch(function (err) {
        console.error("[incident-melden] bijlagen laden mislukt:", err);
        // besa-sync-reporter handelt eventuele auth-fouten en globale toast af.
        if (typeof window.besaReportSyncFailure === "function") {
          window.besaReportSyncFailure("Incidenten — Bijlagen ophalen", err);
        }
        renderBijlagen();
      });
    } else {
      renderBijlagen();
    }
  }

  function readForm() {
    var profile = window.profilesDB ? window.profilesDB.getCurrentSync() : null;
    var melderId = state.rec && state.rec.melderId
      ? state.rec.melderId
      : (profile && profile.medewerkerId ? String(profile.medewerkerId) : null);

    return {
      clientId: $("im-client").value || null,
      categorie: $("im-categorie").value || "Overig",
      status: state.rec && state.rec.status ? state.rec.status : "in_afwachting",
      incidentDatum: inputDateToIso($("im-datum").value, state.rec && state.rec.incidentDatum),
      melderId: melderId,
      beoordelaarId: state.rec && state.rec.beoordelaarId ? state.rec.beoordelaarId : null,
      locatieId: state.rec && state.rec.locatieId ? state.rec.locatieId : null,
      omschrijving: $("im-omschrijving").value || "",
      genomenMaatregelen: $("im-maatregelen").value || "",
      tijdstipVanDag: $("im-tijdstip").value || null,
      isBuiten: !!$("im-buiten").checked,
      actorType: getSelectedActorType(),
      betrokkenPartijen: state.betrokken.slice(),
      oudersGeinformeerd: getOudersValue(),
      wilGebeldWorden: !!$("im-wil-gebeld").checked,
      impactOpZorgverlener: $("im-impact").value || "",
      notificeerTeam: state.notificeerTeam,
      notificeerMedewerkerIds: state.showSpecific ? state.notificeerMedewerkerIds.slice() : [],
    };
  }

  function validate(payload) {
    if (!payload.clientId) return "Selecteer een cliënt.";
    if (!payload.incidentDatum) return "Vul een geldige incident-datum in.";
    if (!payload.tijdstipVanDag) return "Selecteer een tijdstip van de dag.";
    if (!payload.actorType) return "Selecteer een actor type.";
    if (!payload.categorie) return "Selecteer een type incident.";
    if (!String(payload.omschrijving).trim()) return "Vul een beschrijving in.";
    if (payload.oudersGeinformeerd === null) return "Geef aan of ouders/vertegenwoordigers geïnformeerd zijn.";
    return null;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function uploadPendingFiles(incidentId) {
    if (!state.pendingFiles.length) return;
    if (!window.incidentDocsDB) return;
    var files = state.pendingFiles.slice();
    for (var i = 0; i < files.length; i += 1) {
      var f = files[i];
      try {
        await window.incidentDocsDB.add({
          incidentId: incidentId,
          naam: f.fileName,
          fileName: f.fileName,
          fileMime: f.fileMime,
          fileSize: f.fileSize,
          fileData: f.fileData,
        });
      } catch (err) {
        toast("error", "Bijlage '" + f.fileName + "' niet geüpload: " + (err && err.message ? err.message : err));
      }
    }
    state.pendingFiles = [];
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    showError(null);
    var payload = readForm();
    var err = validate(payload);
    if (err) { showError(err); return; }

    var btn = $("im-submit");
    btn.disabled = true;
    var orig = btn.innerHTML;
    btn.textContent = "Bezig…";
    try {
      if (state.editingId) {
        await window.incidentenDB.update(state.editingId, payload);
        toast("saved", "Incident bijgewerkt");
      } else {
        var saved = await window.incidentenDB.add(payload);
        // Pending bijlagen alsnog uploaden met de nieuwe id.
        if (saved && saved.id) {
          await uploadPendingFiles(saved.id);
        }
        toast("saved", "Incident toegevoegd");
      }
      setTimeout(function () { window.location.href = "incidenten.html"; }, 350);
    } catch (e) {
      showError("Opslaan mislukt: " + (e && e.message ? e.message : String(e)));
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // Archive (slider modal)
  // ---------------------------------------------------------------------------
  function setupArchiveModal() {
    var slider = $("im-ar-slider");
    var confirm = $("im-ar-confirm");
    if (!slider || !confirm) return;
    function reset() { slider.value = 0; confirm.disabled = true; setSliderPct(0); }
    function setSliderPct(p) {
      slider.style.setProperty("--employee-slider-pct", p + "%");
    }
    function close() {
      var m = $("im-archive-modal");
      if (m) { m.hidden = true; m.setAttribute("aria-hidden", "true"); }
      reset();
    }
    function open() {
      reset();
      var rec = state.rec;
      $("im-ar-preview").textContent = rec
        ? (rec.categorie || "Overig") + " — " + isoToInputDate(rec.incidentDatum || "")
        : "";
      var m = $("im-archive-modal");
      if (m) { m.hidden = false; m.setAttribute("aria-hidden", "false"); }
    }
    slider.addEventListener("input", function () {
      var v = Number(slider.value);
      setSliderPct(v);
      confirm.disabled = v < 100;
    });
    confirm.addEventListener("click", async function () {
      close();
      try {
        await window.incidentenDB.archive(state.editingId);
        toast("archived", "Incident gearchiveerd");
        setTimeout(function () { window.location.href = "incidenten.html"; }, 350);
      } catch (e) {
        toast("error", "Archiveren mislukt: " + (e && e.message ? e.message : String(e)));
      }
    });
    $("im-ar-cancel").addEventListener("click", close);
    $("im-ar-close").addEventListener("click", close);

    $("im-archive-btn").addEventListener("click", function () {
      if (!state.editingId) return;
      open();
    });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function loadEditTarget() {
    var qs = new URLSearchParams(window.location.search);
    var id = qs.get("id");
    if (!id) return null;
    var rec = window.incidentenDB && window.incidentenDB.getByIdSync(id);
    return rec || null;
  }

  function applyEditMode(rec) {
    state.editingId = rec.id;
    state.rec = rec;
    $("im-title").textContent = "Incident bewerken";
    $("im-subtitle").innerHTML = "Werk de gegevens bij voor dit bestaande incident. Velden met <span class=\"im-req\">*</span> zijn verplicht.";
    var btn = $("im-submit");
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Wijzigingen opslaan';
    populateForm(rec);
  }

  function applyAddMode() {
    state.editingId = null;
    state.rec = null;
    populateForm(null);
  }

  function wireUp() {
    $("im-form").addEventListener("submit", onSubmit);

    Array.prototype.forEach.call(document.querySelectorAll('input[name="im-betrokken-type"]'), function (r) {
      r.addEventListener("change", refreshBetrokkenPersonSelect);
    });
    $("im-betrokken-add").addEventListener("click", addBetrokken);

    setupBijlagen();
    setupArchiveModal();

    $("im-notif-team").addEventListener("click", function () {
      setNotifTeam(!state.notificeerTeam);
    });
    $("im-notif-spec").addEventListener("click", function () {
      setShowSpecific(!state.showSpecific);
    });
    $("im-notif-medewerker-add").addEventListener("click", addNotifMedewerker);

    ["besa:clienten-updated", "besa:medewerkers-updated", "besa:locaties-updated",
     "besa:profile-updated", "besa:incident-categorieen-updated"].forEach(function (evt) {
      window.addEventListener(evt, function () {
        populateDropdowns();
        renderBetrokkenList();
        renderNotifMedewerkers();
      });
    });

    window.addEventListener("besa:incident-documenten-updated", function () {
      renderBijlagen();
    });
  }

  function init() {
    populateDropdowns();
    renderActorTypes();
    renderBijlagen();
    renderNotifMedewerkers();

    var existing = loadEditTarget();
    if (existing) {
      applyEditMode(existing);
    } else {
      applyAddMode();
    }
    wireUp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
