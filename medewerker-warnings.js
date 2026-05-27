/* global window, document */
/**
 * medewerker-warnings.js — bereken errors + warnings voor een medewerker
 * volgens BS2's driehoek-systeem (rood = blokkering, oranje = waarschuwing).
 *
 * BS2-bron: POST /api/rpc met signature "get:employee-document-status"
 *   → response { errors: [...], warnings: [...] }
 *
 * BS1 bouwt dit pure compute-only uit `medewerker_documenten`:
 *  - VOG ontbreekt of verlopen op NU → ERROR (rood)
 *  - VOG verloopt binnen 30 dagen → WARNING (oranje)
 *  - Contract / addendum met vervaldatum < NU → WARNING (was eerder error,
 *    per user-eis F3 niet meer blokkerend voor planbaarheid)
 *  - Contract / addendum met vervaldatum binnen 30 dagen → WARNING
 *  - Education (BHV/opleiding) verlopen → WARNING
 *  - ID verlopen → WARNING
 *
 * Geen DB-tabel, pure compute. Resultaat wordt per medewerker geheugen-
 * gecached zodat herhaalde renders snel zijn.
 *
 * Public API:
 *  - window.medewerkerWarnings.compute(employee, docs) → { errors, warnings }
 *  - window.medewerkerWarnings.computeForId(employeeId) → Promise<{errors, warnings}>
 *  - window.medewerkerWarnings.hasErrors(employeeId) → bool
 *  - window.medewerkerWarnings.hasWarnings(employeeId) → bool
 *
 * Event "besa:medewerker-warnings-updated" met { medewerkerId } in detail.
 */
(function (global) {
  "use strict";

  var WARN_DAYS = 30; // verloopt binnen 30 dagen = warning (BS2-patroon)

  var _cache = {}; // empId → { errors, warnings, ts }

  function parseDate(v) {
    if (!v) return null;
    var s = String(v).trim();
    if (!s) return null;
    var t = Date.parse(s);
    if (!isFinite(t)) return null;
    return new Date(t);
  }

  function daysBetween(a, b) {
    return Math.floor((b.getTime() - a.getTime()) / 86400000);
  }

  function fmtDate(d) {
    if (!d) return "";
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "-" + mm + "-" + d.getFullYear();
  }

  function typeLabel(t) {
    switch (String(t || "").toLowerCase()) {
      case "vog": return "VOG";
      case "contract": return "Contract";
      case "addendum": return "Addendum";
      case "id": return "ID-bewijs";
      case "education": return "Opleiding";
      case "employment_conditions": return "Arbeidsvoorwaarden";
      default: return "Document";
    }
  }

  /**
   * Compute errors + warnings voor 1 medewerker.
   * @param employee {object} — uit medewerkersDB.getByIdSync
   * @param docs {Array} — uit medewerkerDocsDB.listSync(empId)
   * @returns {{errors: Array, warnings: Array}}
   */
  function compute(employee, docs) {
    var errors = [];
    var warnings = [];
    var now = new Date();
    var list = (docs || []).filter(function (d) { return d && !d.archived; });

    // VOG-check: bestaat er een geldige VOG?
    var vogs = list.filter(function (d) { return String(d.type || "").toLowerCase() === "vog"; });
    var hasValidVog = false;
    vogs.forEach(function (v) {
      var vd = parseDate(v.vervaldatum);
      if (!vd) {
        // VOG zonder datum = telt als aanwezig maar zonder warning
        hasValidVog = true;
        return;
      }
      var d = daysBetween(now, vd);
      if (d < 0) {
        // verlopen → kandidaat voor error, maar pas error als geen geldige VOG bestaat
      } else {
        hasValidVog = true;
        if (d <= WARN_DAYS) {
          warnings.push({
            id: v.id, type: v.type, kind: "vog-expiry-soon",
            label: typeLabel(v.type), naam: v.naam || typeLabel(v.type),
            datum: v.vervaldatum, datumLabel: fmtDate(vd),
            reden: "Verloopt binnen " + d + " dagen",
          });
        }
      }
    });

    if (vogs.length === 0) {
      errors.push({
        id: null, type: "vog", kind: "vog-missing",
        label: "VOG", naam: "VOG ontbreekt",
        datum: null, datumLabel: "",
        reden: "Er is geen VOG-document geüpload",
      });
    } else if (!hasValidVog) {
      // alle aanwezige VOGs verlopen → pak de meest recente verloopdatum
      var laatste = vogs.reduce(function (best, v) {
        var d = parseDate(v.vervaldatum);
        return (!best || (d && d > best.d)) ? { v: v, d: d } : best;
      }, null);
      errors.push({
        id: laatste && laatste.v.id, type: "vog", kind: "vog-expired",
        label: "VOG", naam: (laatste && laatste.v.naam) || "VOG",
        datum: laatste && laatste.v.vervaldatum,
        datumLabel: laatste && laatste.d ? fmtDate(laatste.d) : "",
        reden: "Verlopen op " + (laatste && laatste.d ? fmtDate(laatste.d) : "onbekende datum"),
      });
    }

    // Contract / addendum / id / education met vervaldatum: alleen warnings
    var WARN_TYPES = ["contract", "addendum", "id", "education", "employment_conditions"];
    list.forEach(function (d) {
      var t = String(d.type || "").toLowerCase();
      if (WARN_TYPES.indexOf(t) < 0) return;
      var vd = parseDate(d.vervaldatum);
      if (!vd) return;
      var dd = daysBetween(now, vd);
      if (dd < 0) {
        warnings.push({
          id: d.id, type: t, kind: "expired",
          label: typeLabel(t), naam: d.naam || typeLabel(t),
          datum: d.vervaldatum, datumLabel: fmtDate(vd),
          reden: "Verlopen op " + fmtDate(vd),
        });
      } else if (dd <= WARN_DAYS) {
        warnings.push({
          id: d.id, type: t, kind: "expiry-soon",
          label: typeLabel(t), naam: d.naam || typeLabel(t),
          datum: d.vervaldatum, datumLabel: fmtDate(vd),
          reden: "Verloopt op " + fmtDate(vd) + " (over " + dd + " dagen)",
        });
      }
      // > WARN_DAYS: geen waarschuwing (nog ruim geldig)
    });

    return { errors: errors, warnings: warnings };
  }

  function computeForId(employeeId) {
    if (!employeeId) return Promise.resolve({ errors: [], warnings: [] });
    var emp = null;
    try { if (global.medewerkersDB) emp = global.medewerkersDB.getByIdSync(employeeId); } catch (e) { /* */ }

    var docsP = (global.medewerkerDocsDB && typeof global.medewerkerDocsDB.list === "function")
      ? global.medewerkerDocsDB.list(employeeId).catch(function () {
          try { return global.medewerkerDocsDB.listSync(employeeId) || []; } catch (e) { return []; }
        })
      : Promise.resolve(global.medewerkerDocsDB && global.medewerkerDocsDB.listSync
          ? global.medewerkerDocsDB.listSync(employeeId) || [] : []);

    return Promise.resolve(docsP).then(function (docs) {
      var result = compute(emp, docs);
      _cache[employeeId] = { errors: result.errors, warnings: result.warnings, ts: Date.now() };
      return result;
    });
  }

  function computeForIdSync(employeeId) {
    if (!employeeId) return { errors: [], warnings: [] };
    var emp = null, docs = [];
    try { if (global.medewerkersDB) emp = global.medewerkersDB.getByIdSync(employeeId); } catch (e) { /* */ }
    try { if (global.medewerkerDocsDB) docs = global.medewerkerDocsDB.listSync(employeeId) || []; } catch (e) { /* */ }
    var result = compute(emp, docs);
    _cache[employeeId] = { errors: result.errors, warnings: result.warnings, ts: Date.now() };
    return result;
  }

  function hasErrors(employeeId) {
    var r = _cache[employeeId] || computeForIdSync(employeeId);
    return r.errors.length > 0;
  }
  function hasWarnings(employeeId) {
    var r = _cache[employeeId] || computeForIdSync(employeeId);
    return r.warnings.length > 0;
  }

  // Invalidatie wanneer documenten/medewerker wijzigen
  function invalidate(employeeId) {
    if (employeeId == null) {
      _cache = {};
    } else {
      delete _cache[employeeId];
    }
    try {
      global.dispatchEvent(new CustomEvent("besa:medewerker-warnings-updated", {
        detail: { medewerkerId: employeeId || null },
      }));
    } catch (e) { /* */ }
  }

  global.addEventListener("besa:medewerker-documenten-updated", function (e) {
    invalidate(e && e.detail ? e.detail.medewerkerId : null);
  });
  global.addEventListener("besa:medewerkers-updated", function () {
    invalidate(null);
  });

  global.medewerkerWarnings = {
    compute: compute,
    computeForId: computeForId,
    computeForIdSync: computeForIdSync,
    hasErrors: hasErrors,
    hasWarnings: hasWarnings,
    invalidate: invalidate,
  };
})(window);
