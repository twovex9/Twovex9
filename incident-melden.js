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
    taakCollab: [],         // [uuid] medewerker-ids voor de "Taak toevoegen"-form
    taakEditId: null,       // id van taak die inline bewerkt wordt (of null)
  };

  // BS2 taak-statussen/prioriteiten. BS2 POST /api/tasks gebruikt status "--"
  // als default en priority "Low" (zie spec). De volledige optieset wordt in
  // Stap 5 visueel tegen BS2 geverifieerd; waarden worden verbatim BS2
  // opgeslagen (NL-labels alleen in de UI).
  var TAAK_STATUSSEN = [
    { value: "--", label: "--" },
    { value: "Te doen", label: "Te doen" },
    { value: "Bezig", label: "Bezig" },
    { value: "Afgerond", label: "Afgerond" },
  ];
  var TAAK_PRIORITEITEN = [
    { value: "Low", label: "Laag" },
    { value: "Medium", label: "Middel" },
    { value: "High", label: "Hoog" },
  ];

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
  function getAllLocaties() {
    if (!window.locatiesDB) return [];
    try { return window.locatiesDB.getAllSync() || []; } catch (e) { return []; }
  }
  function locatieLabel(l) {
    if (!l) return "—";
    return (l.naam || l.name || "").trim() || "—";
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
  // Cliënten zijn locatiegebonden: de incident-locatie volgt automatisch uit de
  // gekozen cliënt. De cliënt bewaart de locatie als vrije-tekst naam
  // (clienten.locatie), terwijl de locatie-dropdown locaties.id (uuid) als value
  // gebruikt. We matchen dus op naam (case-insensitive, getrimd) tegen dezelfde
  // niet-gearchiveerde set die de dropdown vult, zodat het gevonden id ook echt
  // als optie bestaat.
  function normLocName(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }
  function findLocatieIdForClient(clientId) {
    var client = findById(getAllClienten(), clientId);
    if (!client) return null;
    var naam = normLocName(client.locatie);
    if (!naam) return null;
    var locaties = getAllLocaties().filter(function (l) { return l && !l.archived; });
    for (var i = 0; i < locaties.length; i += 1) {
      if (normLocName(locaties[i].naam || locaties[i].name) === naam) {
        return String(locaties[i].id);
      }
    }
    return null;
  }
  // Vult het locatie-veld op basis van de gekozen cliënt. Wordt aangeroepen bij
  // het wisselen van cliënt; het veld blijft bewerkbaar zodat de melder kan
  // afwijken als het incident elders plaatsvond. Heeft de cliënt geen herkenbare
  // locatie, dan laten we het veld ongemoeid (geen handmatige keuze wissen).
  function autoFillLocatieFromClient() {
    var locSel = $("im-locatie");
    var clientSel = $("im-client");
    if (!locSel || !clientSel) return;
    var locId = findLocatieIdForClient(clientSel.value);
    if (!locId) return;
    locSel.value = locId;
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
  // Per-veld validatie (F1, PR-1): rood markeren + scroll naar 1e fout + focus.
  // BS2-gedrag: alle ontbrekende verplichte velden worden gelijktijdig rood;
  // pagina scrollt naar het eerste rode veld; cursor komt erin te staan.
  // ---------------------------------------------------------------------------
  function getFieldValidators() {
    return [
      { id: "im-client", label: "Cliënt",
        check: function () { return !!$("im-client").value; } },
      { id: "im-datum", label: "Incident datum",
        check: function () { return !!$("im-datum").value; } },
      { id: "im-tijdstip", label: "Tijdstip van de dag",
        check: function () { return !!$("im-tijdstip").value; } },
      { wrapperId: "im-actor-field", label: "Actor type",
        check: function () { return !!getSelectedActorType(); } },
      { id: "im-categorie", label: "Type incident",
        check: function () { return !!$("im-categorie").value; } },
      { id: "im-omschrijving", label: "Beschrijving",
        check: function () { return String($("im-omschrijving").value || "").trim().length > 0; } },
      { wrapperId: "im-ouders-field", label: "Ouders/vertegenwoordigers geïnformeerd",
        check: function () { return getOudersValue() !== null; } },
      { id: "im-ouders-reden", label: "Reden waarom ouders niet geïnformeerd zijn",
        conditional: function () { return getOudersValue() === false; },
        check: function () { return String($("im-ouders-reden").value || "").trim().length > 0; } },
    ];
  }

  function getWrapperForValidator(v) {
    if (v.wrapperId) return $(v.wrapperId);
    var input = v.id ? $(v.id) : null;
    if (!input) return null;
    return input.closest(".im-field");
  }

  function getInputForValidator(v) {
    if (v.id) return $(v.id);
    var wrapper = $(v.wrapperId);
    if (!wrapper) return null;
    return wrapper.querySelector("input,select,textarea,button");
  }

  function clearAllFieldErrors() {
    document.querySelectorAll("#im-form .im-field--error").forEach(function (f) {
      f.classList.remove("im-field--error");
    });
    document.querySelectorAll("#im-form .im-field-error").forEach(function (e) {
      e.hidden = true; e.textContent = "";
    });
    document.querySelectorAll('#im-form [aria-invalid="true"]').forEach(function (n) {
      n.removeAttribute("aria-invalid");
    });
  }

  function clearFieldErrorByWrapper(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove("im-field--error");
    var errEl = wrapper.querySelector(".im-field-error");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    wrapper.querySelectorAll('[aria-invalid="true"]').forEach(function (n) {
      n.removeAttribute("aria-invalid");
    });
  }

  function showFieldErrors(errors) {
    clearAllFieldErrors();
    if (!errors || errors.length === 0) {
      showError(null);
      return null;
    }
    var firstWrapper = null;
    errors.forEach(function (v) {
      var wrapper = getWrapperForValidator(v);
      if (!wrapper) return;
      wrapper.classList.add("im-field--error");
      var errEl = wrapper.querySelector(":scope > .im-field-error");
      if (!errEl) {
        errEl = document.createElement("p");
        errEl.className = "im-field-error";
        errEl.setAttribute("role", "alert");
        wrapper.appendChild(errEl);
      }
      errEl.textContent = v.label + " is verplicht";
      errEl.hidden = false;
      var input = getInputForValidator(v);
      if (input && input.setAttribute) input.setAttribute("aria-invalid", "true");
      if (!firstWrapper) firstWrapper = wrapper;
    });
    if (firstWrapper) {
      firstWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      var firstInput = getInputForValidator(errors[0]);
      if (firstInput && firstInput.focus) {
        setTimeout(function () {
          try { firstInput.focus({ preventScroll: true }); } catch (e) {
            try { firstInput.focus(); } catch (e2) { /* */ }
          }
        }, 300);
      }
    }
    var banner = $("im-error");
    if (banner) {
      banner.textContent = errors.length === 1
        ? errors[0].label + " is verplicht"
        : "Controleer de " + errors.length + " rood gemarkeerde velden hieronder";
      banner.hidden = false;
    }
    return errors;
  }

  function validateAll() {
    var errors = [];
    getFieldValidators().forEach(function (v) {
      if (v.conditional && !v.conditional()) return;
      if (!v.check()) errors.push(v);
    });
    return errors;
  }

  function wireInputClearErrors() {
    ["im-client", "im-datum", "im-tijdstip", "im-categorie", "im-omschrijving", "im-ouders-reden"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var handler = function () { clearFieldErrorByWrapper(el.closest(".im-field")); };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });
    document.querySelectorAll('input[name="im-actor-type"]').forEach(function (r) {
      r.addEventListener("change", function () {
        clearFieldErrorByWrapper($("im-actor-field"));
      });
    });
    document.querySelectorAll('input[name="im-ouders"]').forEach(function (r) {
      r.addEventListener("change", function () {
        clearFieldErrorByWrapper($("im-ouders-field"));
      });
    });
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

    var locaties = getAllLocaties().filter(function (l) { return l && !l.archived; });
    fillSelect($("im-locatie"), locaties, "Selecteer locatie", locatieLabel,
      $("im-locatie") ? $("im-locatie").value : null);

    var statussen = (window.incidentenDB && window.incidentenDB.STATUSES) || [];
    fillSelect($("im-status"), statussen.map(function (s) { return { id: s.value, label: s.label }; }),
      "Selecteer status", function (o) { return o.label; }, $("im-status") ? $("im-status").value : null);

    fillSelect($("im-taak-status"), TAAK_STATUSSEN.map(function (t) { return { id: t.value, label: t.label }; }),
      null, function (o) { return o.label; }, $("im-taak-status") ? $("im-taak-status").value : null);
    fillSelect($("im-taak-prio"), TAAK_PRIORITEITEN.map(function (t) { return { id: t.value, label: t.label }; }),
      null, function (o) { return o.label; }, $("im-taak-prio") ? $("im-taak-prio").value : null);
    fillSelect($("im-taak-assignee"), medewerkers, "Niet toegewezen", medewerkerLabel,
      $("im-taak-assignee") ? $("im-taak-assignee").value : null);
    fillSelect($("im-taak-collab-select"), medewerkers, "Selecteer medewerker", medewerkerLabel);

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

  // ---------------------------------------------------------------------------
  // Afhandelen — stack-radio helpers + conditionele velden
  // ---------------------------------------------------------------------------
  function setStackRadio(name, v) {
    var val = v === true ? "ja" : v === false ? "nee" : "";
    Array.prototype.forEach.call(
      document.querySelectorAll('input[name="' + name + '"]'),
      function (r) { r.checked = (r.value === val); }
    );
  }
  function getStackRadio(name) {
    var c = document.querySelector('input[name="' + name + '"]:checked');
    if (!c) return null;
    if (c.value === "ja") return true;
    if (c.value === "nee") return false;
    return null;
  }
  function toggleOudersReden() {
    var f = $("im-ouders-reden-field");
    if (f) f.hidden = getOudersValue() !== false; // alleen tonen bij "Nee"
  }
  function toggleAfhandelConditional() {
    var pf = $("im-past-profiel-toel-field");
    if (pf) pf.hidden = getStackRadio("im-past-profiel") === null;
    var zf = $("im-zorgplan-oms-field");
    if (zf) zf.hidden = getStackRadio("im-zorgplan") === null;
  }

  // ---------------------------------------------------------------------------
  // Taken (incident_taken) — 1-op-1 BS2 POST /api/tasks
  // ---------------------------------------------------------------------------
  function taakStatusLabel(v) {
    for (var i = 0; i < TAAK_STATUSSEN.length; i += 1) {
      if (TAAK_STATUSSEN[i].value === v) return TAAK_STATUSSEN[i].label;
    }
    return v || "--";
  }
  function taakPrioLabel(v) {
    for (var i = 0; i < TAAK_PRIORITEITEN.length; i += 1) {
      if (TAAK_PRIORITEITEN[i].value === v) return TAAK_PRIORITEITEN[i].label;
    }
    return v || "—";
  }
  function getTakenForCurrent() {
    if (!state.editingId || !window.incidentTakenDB) return [];
    try {
      return (window.incidentTakenDB.getAllSync() || []).filter(function (t) {
        return t && String(t.incidentId) === String(state.editingId);
      });
    } catch (e) { return []; }
  }

  function renderTaakCollab() {
    var host = $("im-taak-collab-list");
    if (!host) return;
    if (state.taakCollab.length === 0) {
      host.innerHTML = '<p class="im-betrokken-empty">Nog geen medewerkers toegevoegd.</p>';
      return;
    }
    var meds = getAllMedewerkers();
    host.innerHTML = state.taakCollab.map(function (id, idx) {
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
        state.taakCollab.splice(parseInt(btn.getAttribute("data-idx"), 10), 1);
        renderTaakCollab();
      });
    });
  }
  function addTaakCollab() {
    var sel = $("im-taak-collab-select");
    var id = sel ? sel.value : "";
    if (!id) { toast("error", "Kies eerst een medewerker."); return; }
    if (state.taakCollab.indexOf(String(id)) >= 0) {
      toast("error", "Deze medewerker staat al in de lijst."); return;
    }
    state.taakCollab.push(String(id));
    if (sel) sel.value = "";
    renderTaakCollab();
  }

  function resetTaakForm() {
    state.taakEditId = null;
    state.taakCollab = [];
    if ($("im-taak-titel")) $("im-taak-titel").value = "";
    if ($("im-taak-status")) $("im-taak-status").value = "--";
    if ($("im-taak-prio")) $("im-taak-prio").value = "Low";
    if ($("im-taak-due")) $("im-taak-due").value = "";
    if ($("im-taak-assignee")) $("im-taak-assignee").value = "";
    if ($("im-taak-prive")) $("im-taak-prive").checked = false;
    var addBtn = $("im-taak-add");
    if (addBtn) {
      addBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Taak toevoegen';
    }
    renderTaakCollab();
  }

  function readTaakForm() {
    return {
      incidentId: state.editingId,
      titel: ($("im-taak-titel").value || "").trim(),
      status: $("im-taak-status").value || "--",
      prioriteit: $("im-taak-prio").value || null,
      dueDate: $("im-taak-due").value || null,
      assigneeId: $("im-taak-assignee").value || null,
      isPrivate: !!$("im-taak-prive").checked,
      collaborators: state.taakCollab.slice(),
    };
  }

  async function submitTaak() {
    if (!state.editingId) { toast("error", "Sla het incident eerst op voordat je taken toevoegt."); return; }
    if (!window.incidentTakenDB) { toast("error", "Taken-data-laag niet geladen."); return; }
    var payload = readTaakForm();
    if (!payload.titel) { toast("error", "Geef de taak een titel."); return; }
    var btn = $("im-taak-add");
    if (btn) btn.disabled = true;
    try {
      if (state.taakEditId) {
        await window.incidentTakenDB.update(state.taakEditId, payload);
        toast("saved", "Taak bijgewerkt");
      } else {
        await window.incidentTakenDB.add(payload);
        toast("saved", "Taak toegevoegd");
      }
      resetTaakForm();
      renderTaken();
    } catch (err) {
      toast("error", "Taak opslaan mislukt: " + (err && err.message ? err.message : err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function startEditTaak(id) {
    var t = window.incidentTakenDB && window.incidentTakenDB.getByIdSync(id);
    if (!t) return;
    state.taakEditId = id;
    state.taakCollab = Array.isArray(t.collaborators) ? t.collaborators.map(String) : [];
    $("im-taak-titel").value = t.titel || "";
    $("im-taak-status").value = t.status || "--";
    $("im-taak-prio").value = t.prioriteit || "Low";
    $("im-taak-due").value = t.dueDate ? isoToInputDate(t.dueDate) : "";
    $("im-taak-assignee").value = t.assigneeId || "";
    $("im-taak-prive").checked = !!t.isPrivate;
    var addBtn = $("im-taak-add");
    if (addBtn) {
      addBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Wijzigingen opslaan';
    }
    renderTaakCollab();
    var card = $("im-taken-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function archiveTaak(id) {
    var t = window.incidentTakenDB && window.incidentTakenDB.getByIdSync(id);
    if (!t) return;
    var ok = window.showArchiveConfirm
      ? await window.showArchiveConfirm({ preview: t.titel || "Taak" })
      : true;
    if (!ok) return;
    try {
      await window.incidentTakenDB.archive(id);
      toast("archived", "Taak gearchiveerd");
      renderTaken();
    } catch (err) {
      toast("error", "Archiveren mislukt: " + (err && err.message ? err.message : err));
    }
  }
  async function restoreTaak(id) {
    try {
      await window.incidentTakenDB.restore(id);
      toast("restored", "Taak hersteld");
      renderTaken();
    } catch (err) {
      toast("error", "Herstellen mislukt: " + (err && err.message ? err.message : err));
    }
  }
  async function deleteTaak(id) {
    var t = window.incidentTakenDB && window.incidentTakenDB.getByIdSync(id);
    if (!t) return;
    var ok = window.showSliderConfirmModal
      ? await window.showSliderConfirmModal({
          title: "Bent u zeker dat dit verwijderd wordt?",
          preview: t.titel || "Taak",
          okLabel: "Verwijderen",
          cancelLabel: "Annuleren",
        })
      : true;
    if (!ok) return;
    try {
      await window.incidentTakenDB.delete(id);
      toast("deleted", "Taak verwijderd");
      if (state.taakEditId === id) resetTaakForm();
      renderTaken();
    } catch (err) {
      toast("error", "Verwijderen mislukt: " + (err && err.message ? err.message : err));
    }
  }

  function renderTaken() {
    var host = $("im-taken-list");
    if (!host) return;
    var taken = getTakenForCurrent();
    if (taken.length === 0) {
      host.innerHTML = '<p class="im-betrokken-empty">Nog geen taken voor dit incident.</p>';
      return;
    }
    var meds = getAllMedewerkers();
    host.innerHTML = taken.map(function (t) {
      var assignee = t.assigneeId ? medewerkerLabel(findById(meds, t.assigneeId)) : "Niet toegewezen";
      var collabNames = (Array.isArray(t.collaborators) ? t.collaborators : []).map(function (cid) {
        return escHtml(medewerkerLabel(findById(meds, cid)));
      }).join(", ");
      var actions = t.archived
        ? '<div class="hr-row-actions">'
            + '<button type="button" class="btn-outline hr-restore-btn" data-restore="' + escHtml(t.id) + '">Herstel</button>'
            + '<button type="button" class="employee-delete-btn im-taak-purge-btn" data-del="' + escHtml(t.id) + '" aria-label="Definitief verwijderen">'
            + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '</button>'
          + '</div>'
        : '<div class="im-taak-actions">'
            + '<button type="button" class="btn-outline im-taak-edit-btn" data-edit="' + escHtml(t.id) + '">Bewerken</button>'
            + '<button type="button" class="employee-delete-btn im-taak-archive-btn" data-arch="' + escHtml(t.id) + '" aria-label="Archiveren">'
            + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
            + '</button>'
          + '</div>';
      return '<div class="im-taak-row' + (t.archived ? ' im-taak-row--archived' : '') + '">'
        + '<div class="im-taak-main">'
        + '<span class="im-taak-titel">' + escHtml(t.titel || "—") + '</span>'
        + '<span class="im-taak-meta">'
        + '<span class="im-taak-badge">' + escHtml(taakStatusLabel(t.status)) + '</span>'
        + '<span class="im-taak-badge im-taak-badge--prio">' + escHtml(taakPrioLabel(t.prioriteit)) + '</span>'
        + (t.dueDate ? '<span class="im-taak-due">Vervalt: ' + escHtml(isoToInputDate(t.dueDate)) + '</span>' : '')
        + (t.isPrivate ? '<span class="im-taak-badge im-taak-badge--prive">Privé</span>' : '')
        + '</span>'
        + '<span class="im-taak-sub">Toegewezen: ' + escHtml(assignee)
        + (collabNames ? ' · Samen: ' + collabNames : '') + '</span>'
        + '</div>'
        + actions
        + '</div>';
    }).join("");

    Array.prototype.forEach.call(host.querySelectorAll("[data-edit]"), function (b) {
      b.addEventListener("click", function () { startEditTaak(b.getAttribute("data-edit")); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-arch]"), function (b) {
      b.addEventListener("click", function () { archiveTaak(b.getAttribute("data-arch")); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-restore]"), function (b) {
      b.addEventListener("click", function () { restoreTaak(b.getAttribute("data-restore")); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-del]"), function (b) {
      b.addEventListener("click", function () { deleteTaak(b.getAttribute("data-del")); });
    });
  }

  function showEditOnlySections(isEdit) {
    var af = $("im-afhandelen-card");
    var tk = $("im-taken-card");
    if (af) af.hidden = !isEdit;
    if (tk) tk.hidden = !isEdit;
  }

  // Mag de huidige user incidenten afhandelen (status/beoordeling/feedback wijzigen,
  // taken aanmaken)? Office/kwaliteit-rollen (incident-dashboard of handle-incidents)
  // + admin-tier wel; een pure melder (rol Medewerker) niet — die ziet zijn eigen
  // melding read-only inclusief status "opgepakt" en terugkoppeling.
  function incidentUserCanManage() {
    try {
      var adminTier = (typeof window.besaIsAdminTier === "function" && window.besaIsAdminTier());
      var can = (typeof window.besaCan === "function");
      return !!(adminTier
        || (can && window.besaCan("view", "incident-dashboard"))
        || (can && window.besaCan("handle", "incidents")));
    } catch (e) { return true; } // bij twijfel: bestaand gedrag (bewerkbaar)
  }

  // Vergrendel de afhandel-sectie voor een pure melder bij een bestaand incident:
  // status + beoordeling/feedback zijn zichtbaar maar niet te wijzigen, en de
  // taken-sectie (afhandelaar-tool) wordt verborgen.
  function applyAfhandelReadonly(isEdit) {
    if (!isEdit) return;
    if (incidentUserCanManage()) return;
    var sel = $("im-status");
    if (sel) { sel.disabled = true; sel.classList.add("im-readonly"); }
    ["im-beoordeling", "im-past-profiel-toel", "im-zorgplan-oms", "im-advies"].forEach(function (id) {
      var el = $(id);
      if (el) { el.readOnly = true; el.classList.add("im-readonly"); }
    });
    var tk = $("im-taken-card");
    if (tk) tk.hidden = true;
    var af = $("im-afhandelen-card");
    if (af && !$("im-afhandel-readonly-note")) {
      var note = document.createElement("p");
      note.id = "im-afhandel-readonly-note";
      note.className = "im-help";
      note.textContent = "De afhandeling wordt door het team verzorgd. Je ziet hier de status en eventuele terugkoppeling op jouw melding.";
      af.insertBefore(note, af.children.length > 1 ? af.children[1] : null);
    }
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
    if ($("im-locatie")) $("im-locatie").value = rec && rec.locatieId ? rec.locatieId : "";
    if ($("im-vereiste-toelichting")) $("im-vereiste-toelichting").value = rec && rec.vereisteToelichting ? rec.vereisteToelichting : "";
    if ($("im-ouders-reden")) $("im-ouders-reden").value = rec && rec.oudersNietReden ? rec.oudersNietReden : "";

    // Afhandelen-velden (alleen relevant bij bestaand incident).
    if ($("im-status")) $("im-status").value = rec && rec.status ? rec.status : "";
    if ($("im-beoordeling")) $("im-beoordeling").value = rec && rec.beoordeling ? rec.beoordeling : "";
    setStackRadio("im-past-profiel", rec ? rec.pastClientprofiel : null);
    if ($("im-past-profiel-toel")) $("im-past-profiel-toel").value = rec && rec.pastClientprofielToelichting ? rec.pastClientprofielToelichting : "";
    setStackRadio("im-zorgplan", rec ? rec.zorgplanUpdateNodig : null);
    if ($("im-zorgplan-oms")) $("im-zorgplan-oms").value = rec && rec.zorgplanUpdateOmschrijving ? rec.zorgplanUpdateOmschrijving : "";
    if ($("im-advies")) $("im-advies").value = rec && rec.adviesRichtlijnen ? rec.adviesRichtlijnen : "";

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

    // Afhandelen + Taken alleen bij een bestaand incident (BS2: afhandelen
    // en taken bestaan pas na create).
    showEditOnlySections(!!(rec && rec.id));
    applyAfhandelReadonly(!!(rec && rec.id));
    toggleOudersReden();
    toggleAfhandelConditional();
    resetTaakForm();
    if (rec && rec.id) renderTaken();

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

    var isEdit = !!state.editingId;
    var locatieEl = $("im-locatie");
    var statusEl = $("im-status");
    var payload = {
      clientId: $("im-client").value || null,
      categorie: $("im-categorie").value || "Overig",
      // Create → altijd in_afwachting (BS2 pending). Afhandelen (edit) →
      // status uit de afhandelen-select; de data-laag stempelt afgehandeld_op
      // zodra status 'opgelost' wordt (1-op-1 BS2 resolved_at).
      status: isEdit
        ? ((statusEl && statusEl.value) || (state.rec && state.rec.status) || "in_afwachting")
        : "in_afwachting",
      incidentDatum: inputDateToIso($("im-datum").value, state.rec && state.rec.incidentDatum),
      melderId: melderId,
      beoordelaarId: state.rec && state.rec.beoordelaarId ? state.rec.beoordelaarId : null,
      locatieId: locatieEl ? (locatieEl.value || null)
        : (state.rec && state.rec.locatieId ? state.rec.locatieId : null),
      omschrijving: $("im-omschrijving").value || "",
      genomenMaatregelen: $("im-maatregelen").value || "",
      tijdstipVanDag: $("im-tijdstip").value || null,
      isBuiten: !!$("im-buiten").checked,
      actorType: getSelectedActorType(),
      betrokkenPartijen: state.betrokken.slice(),
      oudersGeinformeerd: getOudersValue(),
      oudersNietReden: ($("im-ouders-reden") && $("im-ouders-reden").value) || "",
      vereisteToelichting: ($("im-vereiste-toelichting") && $("im-vereiste-toelichting").value) || "",
      wilGebeldWorden: !!$("im-wil-gebeld").checked,
      impactOpZorgverlener: $("im-impact").value || "",
      notificeerTeam: state.notificeerTeam,
      notificeerMedewerkerIds: state.showSpecific ? state.notificeerMedewerkerIds.slice() : [],
    };

    // Afhandel-velden uitsluitend bij een bestaand incident meesturen, zodat
    // een create ze op de DB-default (null) laat — exact als BS2's server.
    if (isEdit) {
      payload.beoordeling = ($("im-beoordeling") && $("im-beoordeling").value) || "";
      payload.pastClientprofiel = getStackRadio("im-past-profiel");
      payload.pastClientprofielToelichting = ($("im-past-profiel-toel") && $("im-past-profiel-toel").value) || "";
      payload.zorgplanUpdateNodig = getStackRadio("im-zorgplan");
      payload.zorgplanUpdateOmschrijving = ($("im-zorgplan-oms") && $("im-zorgplan-oms").value) || "";
      payload.adviesRichtlijnen = ($("im-advies") && $("im-advies").value) || "";
    }
    return payload;
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
    var errors = validateAll();
    if (errors.length > 0) {
      showFieldErrors(errors);
      return;
    }
    clearAllFieldErrors();
    showError(null);
    var payload = readForm();

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

    // Cliënten zijn locatiegebonden → vul de locatie automatisch in zodra een
    // cliënt gekozen wordt. Blijft handmatig aanpasbaar voor afwijkingen.
    if ($("im-client")) {
      $("im-client").addEventListener("change", autoFillLocatieFromClient);
    }

    // Klik op een datumveld opent meteen de kalender, niet alleen het kleine
    // kalender-icoontje rechts. showPicker() vereist een user-gesture, dus we
    // koppelen 'm aan de klik op de input zelf. Bewust géén focus-handler: de
    // form-validatie focust het eerste lege verplichte veld (waaronder
    // im-datum), wat de kalender ongevraagd over de foutmelding zou openploppen.
    // In try/catch: de browser kan de picker al hebben geopend (klik exact op
    // het icoontje) → InvalidStateError/NotAllowedError, die negeren we stil.
    Array.prototype.forEach.call(document.querySelectorAll('#im-form input[type="date"]'), function (inp) {
      if (typeof inp.showPicker !== "function") return;
      inp.addEventListener("click", function () {
        try { inp.showPicker(); } catch (e) { /* picker al open of niet toegestaan */ }
      });
    });

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

    // Conditionele velden (BS2-gedrag).
    Array.prototype.forEach.call(document.querySelectorAll('input[name="im-ouders"]'), function (r) {
      r.addEventListener("change", toggleOudersReden);
    });

    // F1: zodra user begint te corrigeren, verdwijnt de rode markering.
    wireInputClearErrors();
    Array.prototype.forEach.call(document.querySelectorAll('input[name="im-past-profiel"]'), function (r) {
      r.addEventListener("change", toggleAfhandelConditional);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="im-zorgplan"]'), function (r) {
      r.addEventListener("change", toggleAfhandelConditional);
    });

    // Taken-CRUD.
    if ($("im-taak-add")) $("im-taak-add").addEventListener("click", submitTaak);
    if ($("im-taak-collab-add")) $("im-taak-collab-add").addEventListener("click", addTaakCollab);

    ["besa:clienten-updated", "besa:medewerkers-updated", "besa:locaties-updated",
     "besa:profile-updated", "besa:incident-categorieen-updated"].forEach(function (evt) {
      window.addEventListener(evt, function () {
        populateDropdowns();
        renderBetrokkenList();
        renderNotifMedewerkers();
        renderTaakCollab();
      });
    });

    window.addEventListener("besa:incident-documenten-updated", function () {
      renderBijlagen();
    });
    window.addEventListener("besa:incident-taken-updated", function () {
      if (state.editingId) renderTaken();
    });
  }

  async function init() {
    renderActorTypes();
    // Wacht tot de data-lagen geladen zijn. Cruciaal: de localStorage-cache
    // kan leeg zijn (gedeelde quota vol → incidenten-data leunt op _mem na
    // bootstrap), dus zonder await krijgt loadEditTarget() bij een verse
    // ?id=-load null en valt de pagina ten onrechte terug op "nieuw incident".
    // We wachten ook op clienten/medewerkers/locaties zodat de selecties in
    // edit-mode meteen op de juiste optie blijven staan.
    try {
      await Promise.all([
        window.incidentenDB && window.incidentenDB.ready,
        window.incidentCategorieenDB && window.incidentCategorieenDB.ready,
        window.incidentTakenDB && window.incidentTakenDB.ready,
        window.clientenDB && window.clientenDB.ready,
        window.medewerkersDB && window.medewerkersDB.ready,
        window.locatiesDB && window.locatiesDB.ready,
      ]);
    } catch (e) { /* events herstellen de UI alsnog */ }

    populateDropdowns();
    renderBijlagen();
    renderNotifMedewerkers();

    var existing = loadEditTarget();
    if (existing) {
      applyEditMode(existing);
    } else {
      applyAddMode();
    }
    wireUp();

    // Vangnet: als het incident pas ná init beschikbaar komt (late bootstrap
    // of realtime-update) en we staan nog in add-mode terwijl er een ?id= is,
    // alsnog naar edit-mode schakelen.
    window.addEventListener("besa:incidenten-updated", function () {
      if (state.editingId) return;
      var qs = new URLSearchParams(window.location.search);
      var id = qs.get("id");
      if (!id) return;
      var rec = window.incidentenDB && window.incidentenDB.getByIdSync(id);
      if (rec) applyEditMode(rec);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
