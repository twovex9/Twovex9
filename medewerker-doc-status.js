/* global window, document */
/**
 * medewerker-doc-status.js — kleurt het avatar-bolletje (het bolletje vóór de
 * naam) per medewerker als een stoplicht op de HR-medewerkerslijst (hr.html),
 * conform user-eis Lionel (2026-05-28) + 2026-05-29 (bolletje zélf kleuren
 * i.p.v. een los driehoekje ernaast).
 *
 *   GROEN  = alle documenten compleet en geldig (niets vervalt binnen 3 maanden)
 *   ORANJE = een document vervalt binnen 3 maanden → bolletje oranje, blijft planbaar
 *   ROOD   = documentatie mist (document ontbreekt of is verlopen)
 *
 * De berekening komt uit window.medewerkerWarnings.computeStatusForIdSync (de
 * driehoek-statuslaag), op basis van window.medewerkerDocsDB (alle documenten).
 * Dit script raakt de bestaande lijst-render (script.js) niet aan: het zet
 * alleen een status-class + tooltip op het bestaande .avatar-bolletje en
 * herberekent bij elke her-render.
 *
 * Vereist op de pagina (vóór dit script): medewerkers-data.js,
 * medewerker-documenten-data.js, medewerker-warnings.js.
 */
(function (global) {
  "use strict";

  var STATUS_CLASSES = ["avatar--status-green", "avatar--status-orange", "avatar--status-red"];

  function statusLabel(status) {
    if (status === "red") return "Documentatie ontbreekt of is verlopen";
    if (status === "orange") return "Document vervalt binnen 3 maanden";
    return "Documenten compleet";
  }

  // Bouw een leesbare tooltip uit de errors/warnings.
  function buildTitle(result) {
    var lines = [statusLabel(result.status)];
    (result.errors || []).forEach(function (e) {
      lines.push("• " + (e.naam || e.label) + ": " + e.reden);
    });
    (result.warnings || []).forEach(function (w) {
      lines.push("• " + (w.naam || w.label) + ": " + w.reden);
    });
    return lines.join("\n");
  }

  function paintRow(tr) {
    if (!tr) return;
    var empId = tr.dataset && tr.dataset.empId;
    if (!empId || !global.medewerkerWarnings || typeof global.medewerkerWarnings.computeStatusForIdSync !== "function") return;
    var cell = tr.querySelector('td[data-col="avatar"]');
    if (!cell) return;
    var avatar = cell.querySelector(".avatar");
    if (!avatar) return;

    var result;
    try { result = global.medewerkerWarnings.computeStatusForIdSync(empId); }
    catch (e) { return; }
    if (!result) return;

    // Kleur het bolletje zelf als stoplicht (rood/oranje/groen) i.p.v. het
    // vaste blauw. Eerst eventuele vorige status-class weghalen.
    avatar.classList.remove("avatar--status-green", "avatar--status-orange", "avatar--status-red");
    avatar.classList.add("avatar--status-" + result.status);
    avatar.setAttribute("title", buildTitle(result));
    avatar.setAttribute("aria-label", statusLabel(result.status));
    // Markeer de rij met de status zodat andere logica (bv. de "Vereist
    // actie"-filter in script.js) de status zonder herberekening kan lezen.
    tr.dataset.docStatus = result.status;
  }

  function paintAll() {
    var rows = document.querySelectorAll("tr[data-emp-id]");
    for (var i = 0; i < rows.length; i++) paintRow(rows[i]);
    // Laat de pagina weten dat de doc-statussen (her)berekend zijn, zodat een
    // actieve "Vereist actie"-filter zich kan herevalueren.
    try {
      global.dispatchEvent(new CustomEvent("besa:doc-status-painted"));
    } catch (e) { /* */ }
  }

  // Debounce zodat snelle opeenvolgende mutaties/events niet 100× herrekenen.
  // BELANGRIJK: setTimeout i.p.v. requestAnimationFrame — rAF wordt door de
  // browser gepauzeerd in achtergrond-tabs (document.hidden), waardoor de
  // indicators niet zouden verschijnen als de HR-lijst in een niet-actieve tab
  // wordt geladen. setTimeout draait ook dan (zij het getthrottled).
  var paintPending = false;
  function schedulePaint() {
    if (paintPending) return;
    paintPending = true;
    setTimeout(function () {
      paintPending = false;
      paintAll();
    }, 0);
  }

  function observeTable() {
    var anyRow = document.querySelector("tr[data-emp-id]");
    var tbody = anyRow ? anyRow.parentNode : document.querySelector(".employees-table tbody");
    if (!tbody || !global.MutationObserver) return;
    var mo = new global.MutationObserver(function () { schedulePaint(); });
    mo.observe(tbody, { childList: true });
  }

  function init() {
    if (!global.medewerkerDocsDB || !global.medewerkerWarnings) {
      console.warn("[medewerker-doc-status] vereiste data-lagen niet geladen");
      return;
    }
    // Eerste verf met wat er al in cache zit, dan opnieuw zodra alle documenten
    // geladen zijn (en de warnings-cache geïnvalideerd is).
    schedulePaint();
    observeTable();

    if (typeof global.medewerkerDocsDB.ready === "function") {
      global.medewerkerDocsDB.ready().then(function () {
        if (global.medewerkerWarnings && typeof global.medewerkerWarnings.invalidate === "function") {
          global.medewerkerWarnings.invalidate(null);
        }
        schedulePaint();
      });
    }

    global.addEventListener("besa:medewerkers-updated", schedulePaint);
    global.addEventListener("besa:medewerker-documenten-updated", schedulePaint);
    global.addEventListener("besa:medewerker-warnings-updated", schedulePaint);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
