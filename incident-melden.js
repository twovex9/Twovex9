/* global window, document */
/**
 * incident-melden.js — page-script voor incident-melden.html.
 *
 * Beheert de uitgebreide melding (Stage 9e):
 *  - Cliënt + extra betrokken partijen (cliënten/medewerkers)
 *  - Tijd en plaats (datum, tijdstip, locatie, binnen/buiten)
 *  - Actor type
 *  - Incident details (categorie, beschrijving, veiligheid, status, melder, beoordelaar)
 *
 * Bron-van-waarheid: window.incidentenDB (Supabase). Bewaart via add()/update().
 * URL pattern:
 *  - incident-melden.html               -> nieuw incident
 *  - incident-melden.html?id=<uuid>     -> bewerk bestaand incident
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var state = {
    editingId: null,
    rec: null,                   // bestaand record bij edit
    betrokken: [],               // [{type:'client'|'medewerker', id:'<uuid>'}]
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
  function getAllLocaties() {
    if (!window.locatiesDB) return [];
    try { return window.locatiesDB.getAllSync() || []; } catch (e) { return []; }
  }
  function findById(arr, id) {
    if (!id) return null;
    var s = String(id);
    for (var i = 0; i < arr.length; i++) {
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
  function locatieLabel(l) { return l && l.naam ? l.naam : "—"; }
  function partijLabel(p) {
    if (!p) return "—";
    if (p.type === "client") return clientLabel(findById(getAllClienten(), p.id));
    if (p.type === "medewerker") return medewerkerLabel(findById(getAllMedewerkers(), p.id));
    return "—";
  }
  function partijTypeLabel(t) {
    return t === "medewerker" ? "Medewerker" : "Cliënt";
  }

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
    setTimeout(function () { t.hidden = true; }, 3500);
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
    var keepFirst = placeholder != null;
    sel.innerHTML = "";
    if (keepFirst) {
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
    var locaties = getAllLocaties().filter(function (l) { return l && !l.archived; });

    fillSelect($("im-client"), clienten, "Selecteer cliënt", clientLabel, $("im-client").value);
    fillSelect($("im-locatie"), locaties, "Selecteer locatie (optioneel)", locatieLabel, $("im-locatie").value);
    fillSelect($("im-melder"), medewerkers, "Selecteer melder", medewerkerLabel, $("im-melder").value);
    fillSelect($("im-beoordelaar"), medewerkers, "Selecteer beoordelaar", medewerkerLabel, $("im-beoordelaar").value);

    var cats = (window.incidentenDB && window.incidentenDB.CATEGORIES) || [];
    fillSelect($("im-categorie"), cats.map(function (c) { return { id: c, label: c }; }),
      "Selecteer een incident categorie", function (o) { return o.label; }, $("im-categorie").value);

    var tijdstippen = (window.incidentenDB && window.incidentenDB.TIJDSTIPPEN) || [];
    fillSelect($("im-tijdstip"), tijdstippen.map(function (t) { return { id: t.value, label: t.label }; }),
      "Selecteer tijdstip van de dag", function (o) { return o.label; }, $("im-tijdstip").value);

    refreshBetrokkenPersonSelect();
  }

  // ---------------------------------------------------------------------------
  // Actor type: render radio-cards
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
        + (t.desc ? '<span class="im-actor-desc">' + escHtml(t.desc) + '</span>' : '')
        + '</span>'
        + '</label>';
    }).join("");
    Array.prototype.forEach.call(host.querySelectorAll(".im-actor-card"), function (card) {
      card.addEventListener("click", function () {
        // visual selected state via :has would be nicer, maar we doen't via JS-toggle
        Array.prototype.forEach.call(host.querySelectorAll(".im-actor-card"), function (c) {
          c.classList.remove("is-selected");
        });
        card.classList.add("is-selected");
      });
    });
  }
  function getSelectedActorType() {
    var checked = document.querySelector('input[name="im-actor-type"]:checked');
    return checked ? checked.value : null;
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
  // Betrokken partijen toevoegen / verwijderen
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
    // Niet de hoofd-cliënt nogmaals als betrokkene
    if (type === "client" && String($("im-client").value) === String(id)) {
      toast("error", "Deze cliënt is al de hoofd-cliënt van het incident.");
      return;
    }
    // Geen duplicaten
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
    // Bewaar het tijd-deel van het bestaande record als die er is, anders 12:00.
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

  function populateForm(rec) {
    $("im-id").value = rec ? rec.id : "";
    $("im-client").value = rec && rec.clientId ? rec.clientId : "";
    $("im-locatie").value = rec && rec.locatieId ? rec.locatieId : "";
    $("im-categorie").value = rec && rec.categorie ? rec.categorie : "Overig";
    $("im-status").value = rec && rec.status ? rec.status : "in_afwachting";
    $("im-tijdstip").value = rec && rec.tijdstipVanDag ? rec.tijdstipVanDag : "";
    $("im-buiten").checked = !!(rec && rec.isBuiten);
    $("im-omschrijving").value = rec && rec.omschrijving ? rec.omschrijving : "";
    $("im-maatregelen").value = rec && rec.genomenMaatregelen ? rec.genomenMaatregelen : "";

    if (rec && rec.incidentDatum) {
      $("im-datum").value = isoToInputDate(rec.incidentDatum);
    } else {
      var d = new Date();
      $("im-datum").value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    if (rec && rec.melderId) {
      $("im-melder").value = rec.melderId;
    } else {
      var profile = window.profilesDB ? window.profilesDB.getCurrentSync() : null;
      $("im-melder").value = profile && profile.medewerkerId ? String(profile.medewerkerId) : "";
    }
    $("im-beoordelaar").value = rec && rec.beoordelaarId ? rec.beoordelaarId : "";

    setSelectedActorType(rec && rec.actorType ? rec.actorType : "alleen_client");

    state.betrokken = (rec && Array.isArray(rec.betrokkenPartijen)) ? rec.betrokkenPartijen.slice() : [];
    renderBetrokkenList();

    var archiveBtn = $("im-archive-btn");
    if (archiveBtn) archiveBtn.hidden = !rec || !!rec.archived;
  }

  function readForm() {
    return {
      clientId: $("im-client").value || null,
      categorie: $("im-categorie").value || "Overig",
      status: $("im-status").value || "in_afwachting",
      incidentDatum: inputDateToIso($("im-datum").value, state.rec && state.rec.incidentDatum),
      locatieId: $("im-locatie").value || null,
      melderId: $("im-melder").value || null,
      beoordelaarId: $("im-beoordelaar").value || null,
      omschrijving: $("im-omschrijving").value || "",
      genomenMaatregelen: $("im-maatregelen").value || "",
      tijdstipVanDag: $("im-tijdstip").value || null,
      isBuiten: !!$("im-buiten").checked,
      actorType: getSelectedActorType(),
      betrokkenPartijen: state.betrokken.slice(),
    };
  }

  function validate(payload) {
    if (!payload.clientId) return "Selecteer een cliënt.";
    if (!payload.incidentDatum) return "Vul een geldige incident-datum in.";
    if (!payload.tijdstipVanDag) return "Selecteer een tijdstip van de dag.";
    if (!payload.actorType) return "Selecteer een actor type.";
    if (!payload.categorie) return "Selecteer een type incident.";
    if (!String(payload.omschrijving).trim()) return "Vul een beschrijving in.";
    return null;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  async function onSubmit(ev) {
    ev.preventDefault();
    showError(null);
    var payload = readForm();
    var err = validate(payload);
    if (err) { showError(err); return; }

    var btn = $("im-submit");
    btn.disabled = true;
    var orig = btn.textContent;
    btn.textContent = "Bezig…";
    try {
      if (state.editingId) {
        await window.incidentenDB.update(state.editingId, payload);
        toast("saved", "Incident bijgewerkt");
      } else {
        await window.incidentenDB.add(payload);
        toast("saved", "Incident toegevoegd");
      }
      // Korte vertraging zodat de toast aan de overkant zichtbaar is
      setTimeout(function () { window.location.href = "incidenten.html"; }, 350);
    } catch (e) {
      showError("Opslaan mislukt: " + (e && e.message ? e.message : String(e)));
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  // ---------------------------------------------------------------------------
  // Archive (slider modal)
  // ---------------------------------------------------------------------------
  function setupArchiveModal() {
    var slider = $("im-ar-slider");
    var confirm = $("im-ar-confirm");
    if (!slider || !confirm) return;
    function reset() { slider.value = 0; confirm.disabled = true; }
    function close() { var m = $("im-archive-modal"); if (m) { m.hidden = true; m.setAttribute("aria-hidden", "true"); } reset(); }
    function open() {
      reset();
      var rec = state.rec;
      $("im-ar-preview").textContent = rec
        ? (rec.categorie || "Overig") + " — " + isoToInputDate(rec.incidentDatum || "")
        : "";
      var m = $("im-archive-modal");
      if (m) { m.hidden = false; m.setAttribute("aria-hidden", "false"); }
    }
    slider.addEventListener("input", function () { confirm.disabled = Number(slider.value) < 100; });
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
    $("im-submit").textContent = "Opslaan";
    populateForm(rec);
  }

  function applyAddMode() {
    state.editingId = null;
    state.rec = null;
    populateForm(null);
  }

  function wireUp() {
    $("im-form").addEventListener("submit", onSubmit);

    // Betrokken partijen wiring
    Array.prototype.forEach.call(document.querySelectorAll('input[name="im-betrokken-type"]'), function (r) {
      r.addEventListener("change", refreshBetrokkenPersonSelect);
    });
    $("im-betrokken-add").addEventListener("click", addBetrokken);

    setupArchiveModal();

    // Live updates: als externe partijen wijzigen, ververs dropdowns en chip-labels
    ["besa:clienten-updated", "besa:medewerkers-updated", "besa:locaties-updated",
     "besa:profile-updated"].forEach(function (evt) {
      window.addEventListener(evt, function () {
        populateDropdowns();
        renderBetrokkenList();
      });
    });
    // Als het record dat we bewerken in-flight wijzigt door een andere user,
    // herladen en behoud onze ongewijzigde waardes? Voor nu: alleen herladen
    // als we (nog) niets hebben getypt. Eenvoudiger: ververs alleen wanneer
    // we in 'add' mode zijn.
    window.addEventListener("besa:incidenten-updated", function () {
      if (!state.editingId) return;
      // niets — gebruiker kan submitten en update merge'd in data-layer
    });
  }

  function init() {
    populateDropdowns();
    renderActorTypes();

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
