/* global window, document */
/**
 * mijn-beschikbaarheid.js — self-service kalender voor de INGELOGDE ZZP'er.
 *
 * Spiegel van de Future Flow mobiele beschikbaarheid-pagina, nu op de PC-site:
 * per dag doorgeven of je beschikbaar bent (hele dag, tussen bepaalde tijden via
 * de analoge klok, of niet beschikbaar). Schrijft uitsluitend je eigen rijen via
 * mijnBeschikbaarheidDB (zelfde tabel als mobiel; geen planner-RPC).
 *
 * Doelgroep: ingehuurde ZZP'ers (dienstverband "Inhuur"). Loondienst wordt via
 * het rooster ingepland en krijgt hier een vriendelijke uitleg i.p.v. de kalender.
 */
(function () {
  "use strict";

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  // ── Datum-helpers (lokale tijd) ─────────────────────────────────────────
  function pad2(n) { return String(n).padStart(2, "0"); }
  function iso(y, m, d) { return y + "-" + pad2(m + 1) + "-" + pad2(d); }
  function isoToday() { var t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); }

  // ── State ───────────────────────────────────────────────────────────────
  var userId = null, medewerkerId = null;
  var today = new Date();
  var year = today.getFullYear();
  var month = today.getMonth();          // 0-based

  // Editor
  var editDatum = null;
  var editMode = "beschikbaar";          // "beschikbaar" | "tijden" | "niet"
  var editBegin = "09:00";
  var editEind = "17:00";

  function $(id) { return document.getElementById(id); }

  // ── Gate-meldingen ──────────────────────────────────────────────────────
  function showGate(titel, tekst) {
    var gate = $("mb-gate");
    var app = $("mb-app");
    if ($("mb-gate-titel")) $("mb-gate-titel").textContent = titel;
    if ($("mb-gate-tekst")) $("mb-gate-tekst").textContent = tekst;
    if (gate) gate.style.display = "block";
    if (app) app.hidden = true;
  }
  function showApp() {
    var gate = $("mb-gate");
    var app = $("mb-app");
    if (gate) gate.style.display = "none";
    if (app) app.hidden = false;
  }

  // ── Kalender renderen ───────────────────────────────────────────────────
  function render() {
    var label = $("mb-maandlabel");
    if (label) label.textContent = MAANDEN[month] + " " + year;

    var grid = $("mb-grid");
    if (!grid) return;
    var map = (window.mijnBeschikbaarheidDB && window.mijnBeschikbaarheidDB.getMapSync)
      ? window.mijnBeschikbaarheidDB.getMapSync() : {};

    var aantalDagen = new Date(year, month + 1, 0).getDate();
    var startWd = (new Date(year, month, 1).getDay() + 6) % 7;  // 0 = maandag
    var tIso = isoToday();

    var html = "";
    for (var e = 0; e < startWd; e++) html += '<div class="mb-cell mb-cell--empty"></div>';
    for (var d = 1; d <= aantalDagen; d++) {
      var datum = iso(year, month, d);
      var dag = map[datum];
      var cls = "mb-cell";
      if (dag && dag.status === "beschikbaar") cls += " mb-cell--beschikbaar";
      else if (dag && dag.status === "niet_beschikbaar") cls += " mb-cell--niet_beschikbaar";
      if (datum === tIso) cls += " mb-cell--today";
      if (datum < tIso) cls += " mb-cell--past";
      var tijd = (dag && dag.status === "beschikbaar" && dag.begin)
        ? '<span class="mb-cell__t">' + dag.begin + "</span>" : "";
      html += '<button type="button" class="' + cls + '" data-datum="' + datum + '">'
        + '<span class="mb-cell__d">' + d + "</span>" + tijd + "</button>";
    }
    grid.innerHTML = html;
  }

  // ── Editor ──────────────────────────────────────────────────────────────
  function syncEditorUi() {
    document.querySelectorAll(".mb-choice").forEach(function (b) {
      b.classList.toggle("mb-choice--active", b.getAttribute("data-mode") === editMode);
    });
    var times = $("mb-times");
    if (times) times.hidden = editMode !== "tijden";
    var hint = $("mb-hint");
    if (hint) {
      hint.textContent = editMode === "tijden"
        ? "Kies je begin- en eindtijd via de klok."
        : (editMode === "niet"
          ? "Je geeft door dat je deze dag niet beschikbaar bent."
          : "Je bent de hele dag beschikbaar.");
    }
    var beginLbl = $("mb-begin-lbl"); if (beginLbl) beginLbl.textContent = editBegin;
    var eindLbl = $("mb-eind-lbl"); if (eindLbl) eindLbl.textContent = editEind;
  }

  function datumLabel(datum) {
    var d = new Date(datum + "T00:00:00");
    try {
      return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(d);
    } catch (e) { return datum; }
  }

  function openEditor(datum) {
    editDatum = datum;
    var dag = (window.mijnBeschikbaarheidDB && window.mijnBeschikbaarheidDB.getDagSync)
      ? window.mijnBeschikbaarheidDB.getDagSync(datum) : null;
    if (!dag) { editMode = "beschikbaar"; editBegin = "09:00"; editEind = "17:00"; }
    else if (dag.status === "niet_beschikbaar") { editMode = "niet"; }
    else if (dag.begin) { editMode = "tijden"; editBegin = dag.begin; editEind = dag.eind || "17:00"; }
    else { editMode = "beschikbaar"; }

    var titel = $("mb-modal-titel");
    if (titel) titel.textContent = datumLabel(datum);
    var err = $("mb-error"); if (err) { err.hidden = true; err.textContent = ""; }
    var wis = $("mb-wis"); if (wis) wis.hidden = !dag;   // alleen wisbaar als er iets staat
    syncEditorUi();
    var modal = $("mb-modal"); if (modal) modal.hidden = false;
  }
  function closeEditor() {
    var modal = $("mb-modal"); if (modal) modal.hidden = true;
    editDatum = null;
  }

  function showErr(msg) {
    var err = $("mb-error");
    if (err) { err.textContent = msg; err.hidden = false; }
  }

  async function save() {
    if (!editDatum || !userId) return;
    var status = editMode === "niet" ? "niet_beschikbaar" : "beschikbaar";
    var begin = null, eind = null;
    if (editMode === "tijden") {
      begin = editBegin; eind = editEind;
      if (begin && eind && eind <= begin) { showErr("De eindtijd moet ná de begintijd liggen."); return; }
    }
    var card = document.querySelector(".mb-modal-card");
    if (card) card.classList.add("mb-busy");
    try {
      await window.mijnBeschikbaarheidDB.zet(userId, medewerkerId, editDatum, status, begin, eind);
      render();
      closeEditor();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Beschikbaarheid opgeslagen", "");
    } catch (e) {
      showErr("Opslaan mislukt: " + (e && e.message ? e.message : e));
    } finally {
      if (card) card.classList.remove("mb-busy");
    }
  }

  async function wissen() {
    if (!editDatum || !userId) return;
    var card = document.querySelector(".mb-modal-card");
    if (card) card.classList.add("mb-busy");
    try {
      await window.mijnBeschikbaarheidDB.wis(userId, editDatum);
      render();
      closeEditor();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Dag leeggemaakt", "");
    } catch (e) {
      showErr("Wissen mislukt: " + (e && e.message ? e.message : e));
    } finally {
      if (card) card.classList.remove("mb-busy");
    }
  }

  // ── Tijd kiezen via de analoge klok ─────────────────────────────────────
  function kiesTijd(welke) {
    if (!window.BesaKlok || !window.BesaKlok.kies) return;
    var huidig = welke === "begin" ? editBegin : editEind;
    window.BesaKlok.kies({
      titel: welke === "begin" ? "Begintijd" : "Eindtijd",
      waarde: huidig,
      nuKnop: true,
    }).then(function (val) {
      if (val == null) return;
      if (welke === "begin") editBegin = val; else editEind = val;
      // Houd de eindtijd logisch ná de begintijd.
      if (editMode === "tijden" && editEind <= editBegin) {
        if (welke === "begin") {
          // schuif eind een uur op
          var h = Math.min(23, parseInt(editBegin.slice(0, 2), 10) + 1);
          editEind = pad2(h) + ":" + editBegin.slice(3);
        }
      }
      syncEditorUi();
    });
  }

  // ── Maand-navigatie ─────────────────────────────────────────────────────
  async function laadMaand() {
    if (!userId || !window.mijnBeschikbaarheidDB) return;
    var aantalDagen = new Date(year, month + 1, 0).getDate();
    await window.mijnBeschikbaarheidDB.fetchMaand(userId, iso(year, month, 1), iso(year, month, aantalDagen));
    render();
  }
  function prevMaand() { if (month === 0) { year--; month = 11; } else month--; render(); laadMaand(); }
  function nextMaand() { if (month === 11) { year++; month = 0; } else month++; render(); laadMaand(); }
  function naarVandaag() { year = today.getFullYear(); month = today.getMonth(); render(); laadMaand(); }

  // ── Events ──────────────────────────────────────────────────────────────
  function bindEvents() {
    if ($("mb-prev")) $("mb-prev").addEventListener("click", prevMaand);
    if ($("mb-next")) $("mb-next").addEventListener("click", nextMaand);
    if ($("mb-today")) $("mb-today").addEventListener("click", naarVandaag);

    var grid = $("mb-grid");
    if (grid) grid.addEventListener("click", function (e) {
      var cel = e.target.closest(".mb-cell");
      if (cel && cel.getAttribute("data-datum")) openEditor(cel.getAttribute("data-datum"));
    });

    document.querySelectorAll(".mb-choice").forEach(function (b) {
      b.addEventListener("click", function () { editMode = b.getAttribute("data-mode"); syncEditorUi(); });
    });
    if ($("mb-begin")) $("mb-begin").addEventListener("click", function () { kiesTijd("begin"); });
    if ($("mb-eind")) $("mb-eind").addEventListener("click", function () { kiesTijd("eind"); });

    if ($("mb-save")) $("mb-save").addEventListener("click", save);
    if ($("mb-wis")) $("mb-wis").addEventListener("click", wissen);
    if ($("mb-cancel")) $("mb-cancel").addEventListener("click", closeEditor);
    if ($("mb-modal-close")) $("mb-modal-close").addEventListener("click", closeEditor);
    var modal = $("mb-modal");
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeEditor(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { var m = $("mb-modal"); if (m && !m.hidden) closeEditor(); }
    });

    // Externe wijzigingen (bv. realtime) → her-render.
    window.addEventListener("besa:mijn-beschikbaarheid-updated", render);
  }

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    bindEvents();
    showGate("Even geduld…", "Je beschikbaarheid wordt geladen.");

    try { if (window.besaSupabaseReady) await window.besaSupabaseReady; } catch (e) { /* doorgaan */ }
    try { if (window.profilesDB && window.profilesDB.ready) await window.profilesDB.ready; } catch (e) { /* doorgaan */ }

    var prof = (window.profilesDB && window.profilesDB.getCurrentSync) ? window.profilesDB.getCurrentSync() : null;
    userId = prof && prof.id;
    medewerkerId = prof && prof.medewerkerId;

    if (!userId) { showGate("Niet ingelogd", "Log opnieuw in om je beschikbaarheid te beheren."); return; }
    if (!medewerkerId) {
      showGate("Account nog niet gekoppeld",
        "Je account is nog niet aan een medewerker gekoppeld. Vraag de planner of HR om je te koppelen, dan kun je hier je beschikbaarheid doorgeven.");
      return;
    }

    // ZZP-check (gericht, licht): alleen ingehuurde ZZP'ers krijgen de kalender.
    // Uitzondering: admin-tier (Eigenaar/Directeur/HR/…) mag de pagina altijd zien,
    // voor beheer en om de ZZP-ervaring te kunnen bekijken/demonstreren.
    var adminTier = false;
    try { adminTier = (typeof window.besaIsAdminTier === "function" && window.besaIsAdminTier()); } catch (e) { /* */ }
    if (!adminTier) {
      try {
        var r = await window.besaSupabase.from("medewerkers")
          .select("dienstverband").eq("id", medewerkerId).maybeSingle();
        var dv = r && r.data ? (r.data.dienstverband || "") : "";
        if (dv === "Loondienst" || dv === "Stagiair") {
          showGate("Beschikbaarheid is voor ZZP'ers",
            "Deze pagina is bedoeld voor ingehuurde ZZP'ers. Als loondienstmedewerker word je via het rooster ingepland — je hoeft hier niets door te geven.");
          return;
        }
        // Inhuur of onbekend dienstverband → kalender tonen (niet onterecht blokkeren).
      } catch (e) {
        // Bij twijfel: toon de kalender (functionaliteit boven gate).
        console.warn("[mijn-beschikbaarheid] dienstverband-check overgeslagen:", e);
      }
    }

    showApp();
    render();
    await laadMaand();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
