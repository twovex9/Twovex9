/* global window, document */
/**
 * medewerker-doc-status.js — toont de document-status (groen/oranje/rood) per
 * medewerker op de HR-medewerkerslijst (hr.html), conform user-eis Lionel
 * 2026-05-28.
 *
 *   GROEN  = alle documenten compleet en geldig (niets vervalt binnen 3 maanden)
 *   ORANJE = een document vervalt binnen 3 maanden → driehoekje, blijft planbaar
 *   ROOD   = documentatie mist (document ontbreekt of is verlopen)
 *
 * De berekening komt uit window.medewerkerWarnings.computeStatusForIdSync (de
 * driehoek-statuslaag), op basis van window.medewerkerDocsDB (alle documenten).
 * Dit script raakt de bestaande lijst-render (script.js) niet aan: het injecteert
 * alleen een indicator in de avatar-cel en herberekent bij elke her-render.
 *
 * Vereist op de pagina (vóór dit script): medewerkers-data.js,
 * medewerker-documenten-data.js, medewerker-warnings.js.
 */
(function (global) {
  "use strict";

  var IND_CLASS = "doc-status-ind";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // SVG: driehoek voor oranje/rood (waarschuwing), cirkel voor groen (compleet).
  function indSvg(status) {
    if (status === "green") {
      return '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 3 L22 20 L2 20 Z"/></svg>';
  }

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

    var result;
    try { result = global.medewerkerWarnings.computeStatusForIdSync(empId); }
    catch (e) { return; }
    if (!result) return;

    var ind = cell.querySelector("." + IND_CLASS);
    if (!ind) {
      ind = document.createElement("span");
      ind.className = IND_CLASS;
      cell.appendChild(ind);
    }
    ind.className = IND_CLASS + " " + IND_CLASS + "--" + result.status;
    ind.setAttribute("title", buildTitle(result));
    ind.setAttribute("aria-label", statusLabel(result.status));
    ind.innerHTML = indSvg(result.status);
  }

  function paintAll() {
    var rows = document.querySelectorAll("tr[data-emp-id]");
    for (var i = 0; i < rows.length; i++) paintRow(rows[i]);
  }

  // Debounce zodat snelle opeenvolgende mutaties/events niet 100× herrekenen.
  var rafPending = false;
  function schedulePaint() {
    if (rafPending) return;
    rafPending = true;
    (global.requestAnimationFrame || function (cb) { setTimeout(cb, 16); })(function () {
      rafPending = false;
      paintAll();
    });
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
