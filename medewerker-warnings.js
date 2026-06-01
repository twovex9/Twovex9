/* global window, document */
/**
 * medewerker-warnings.js — bereken errors + warnings voor een medewerker
 * volgens BS2's driehoek-systeem (rood = blokkering, oranje = waarschuwing).
 *
 * BS2-bron: POST /api/rpc met signature "get:employee-document-status"
 *   → response { errors: [...], warnings: [...] }
 *
 * Document-statusregels (geijkt op BS2, geverifieerd 2026-06-01):
 *  - GROEN  = geen blokkering en niets vervalt binnen 3 maanden
 *  - ORANJE = WAARSCHUWING: iets vervalt binnen 3 maanden (90 dagen), OF een
 *             niet-blokkerend document (opleiding/ID/addendum/arbeidsvoorwaarden)
 *             is verlopen → medewerker blijft planbaar, met aantekening
 *  - ROOD   = BLOKKERING: een kerndocument ontbreekt of is verlopen waardoor de
 *             medewerker niet planbaar is
 *
 * Welke documenten BLOKKEREN (rood) — exact zoals BS2:
 *  - VOG ontbreekt of (alle exemplaren) verlopen → ERROR (rood)   [iedereen]
 *  - Contract ontbreekt of (alle exemplaren) verlopen → ERROR (rood)
 *      MAAR alléén als ETF zelf de contractpartij is (loondienst / rechtstreekse
 *      inhuur). Bij inhuur "Via bureau" levert het bureau het contract → het
 *      ETF-contract blokkeert NIET en geeft geen waarschuwing. Alleen het meest
 *      recente/geldende contract telt: een oud verlopen contract dat al door een
 *      geldig is vervangen, blokkeert niet.
 *
 * Welke documenten alleen WAARSCHUWEN (oranje), nooit blokkeren — exact zoals BS2:
 *  - VOG / Contract verloopt binnen 90 dagen → WARNING (oranje)
 *  - Opleiding (BHV) / ID / addendum / arbeidsvoorwaarden verlopen óf vervalt
 *    binnen 90 dagen → WARNING (oranje). Een verlopen opleiding maakt iemand
 *    dus NIET rood (dit week eerder af van BS2 en is nu gelijkgetrokken).
 *
 * Geen DB-tabel, pure compute. Resultaat wordt per medewerker geheugen-
 * gecached zodat herhaalde renders snel zijn.
 *
 * Public API:
 *  - window.medewerkerWarnings.compute(employee, docs) → { errors, warnings }
 *  - window.medewerkerWarnings.computeForId(employeeId) → Promise<{errors, warnings}>
 *  - window.medewerkerWarnings.computeStatus(employee, docs) → { status, errors, warnings }
 *  - window.medewerkerWarnings.computeStatusForIdSync(employeeId) → { status, errors, warnings }
 *  - window.medewerkerWarnings.hasErrors(employeeId) → bool
 *  - window.medewerkerWarnings.hasWarnings(employeeId) → bool
 *
 * status = "green" | "orange" | "red"
 * Event "besa:medewerker-warnings-updated" met { medewerkerId } in detail.
 */
(function (global) {
  "use strict";

  var WARN_DAYS = 90; // vervalt binnen 3 maanden (90 dagen) = oranje (user-eis Lionel)

  var _cache = {}; // empId → { errors, warnings, ts }

  function parseDate(v) {
    if (!v) return null;
    var s = String(v).trim();
    if (!s) return null;
    // NL-formaat DD-MM-YYYY expliciet afhandelen — Date.parse interpreteert dat
    // onbetrouwbaar (bv. "09-06-2027"). ISO (YYYY-MM-DD) en overige via Date.parse.
    var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (m) {
      var nl = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return isFinite(nl.getTime()) ? nl : null;
    }
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

    // Inhuurtype bepalen. Bij inhuur "Via bureau" levert het uitzend-/
    // detacheringsbureau het contract; een ontbrekend of verlopen ETF-contract
    // is dan GEEN blokkering en geen waarschuwing — exact zoals BS2. (Het emp-
    // object spreidt de jsonb `data` naar top-level, dus emp.inhuurtype; we
    // checken voor de zekerheid ook emp.data.inhuurtype.)
    var inhuurtype = String(
      (employee && (employee.inhuurtype || (employee.data && employee.data.inhuurtype))) || ""
    ).toLowerCase();
    var viaBureau = inhuurtype.indexOf("bureau") !== -1; // "Via bureau"

    // Hulpfunctie: bepaal of een verzameling documenten van één type een geldig
    // exemplaar bevat (geen vervaldatum = geldig, toekomstige datum = geldig) en
    // verzamel intussen een "vervalt binnenkort"-waarschuwing. Een verlopen
    // exemplaar telt niet als geldig — alleen het meest recente/geldende telt,
    // dus een oud verlopen document dat al door een geldig is vervangen, blokkeert niet.
    function evalBlocking(typeKey, label, missingNaam, missingReden) {
      var items = list.filter(function (d) { return String(d.type || "").toLowerCase() === typeKey; });
      var hasValid = false;
      items.forEach(function (it) {
        var vd = parseDate(it.vervaldatum);
        if (!vd) { hasValid = true; return; } // zonder datum = aanwezig & geldig
        var dd = daysBetween(now, vd);
        if (dd < 0) return; // verlopen exemplaar — telt niet als geldig
        hasValid = true;
        if (dd <= WARN_DAYS) {
          warnings.push({
            id: it.id, type: typeKey, kind: "expiry-soon",
            label: label, naam: it.naam || label,
            datum: it.vervaldatum, datumLabel: fmtDate(vd),
            reden: "Verloopt op " + fmtDate(vd) + " (over " + dd + " dagen)",
          });
        }
      });
      if (items.length === 0) {
        errors.push({
          id: null, type: typeKey, kind: typeKey + "-missing",
          label: label, naam: missingNaam, datum: null, datumLabel: "",
          reden: missingReden,
        });
      } else if (!hasValid) {
        var laatste = items.reduce(function (best, it) {
          var d = parseDate(it.vervaldatum);
          return (!best || (d && best.d && d > best.d)) ? { it: it, d: d } : best;
        }, null);
        errors.push({
          id: laatste && laatste.it.id, type: typeKey, kind: "expired",
          label: label, naam: (laatste && laatste.it.naam) || label,
          datum: laatste && laatste.it.vervaldatum,
          datumLabel: laatste && laatste.d ? fmtDate(laatste.d) : "",
          reden: "Verlopen op " + (laatste && laatste.d ? fmtDate(laatste.d) : "onbekende datum"),
        });
      }
    }

    // ---- VOG: blokkerend kerndocument voor IEDEREEN ----
    evalBlocking("vog", "VOG", "VOG ontbreekt", "Er is geen VOG-document geüpload");

    // ---- Contract: blokkerend kerndocument, maar alléén als ETF zelf de
    //      contractpartij is (loondienst / rechtstreekse inhuur). Bij "Via
    //      bureau" volledig negeren (geen error, geen warning). ----
    if (!viaBureau) {
      evalBlocking("contract", "Contract", "Contract ontbreekt", "Er is geen geldig contract");
    }

    // ---- Opleiding (BHV) / ID / addendum / arbeidsvoorwaarden: NOOIT
    //      blokkerend. Verlopen óf binnenkort vervallend = alleen WARNING
    //      (oranje); medewerker blijft planbaar — exact zoals BS2. ----
    var WARN_ONLY_TYPES = ["addendum", "id", "education", "employment_conditions"];
    list.forEach(function (d) {
      var t = String(d.type || "").toLowerCase();
      if (WARN_ONLY_TYPES.indexOf(t) < 0) return;
      var vd = parseDate(d.vervaldatum);
      if (!vd) return;
      var dd = daysBetween(now, vd);
      if (dd < 0) {
        warnings.push({
          id: d.id, type: t, kind: "expired-warn",
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

  // Vertaal errors/warnings naar één driehoek-status: rood > oranje > groen.
  function statusFromResult(result) {
    if (result && result.errors && result.errors.length > 0) return "red";
    if (result && result.warnings && result.warnings.length > 0) return "orange";
    return "green";
  }

  function computeStatus(employee, docs) {
    var r = compute(employee, docs);
    return { status: statusFromResult(r), errors: r.errors, warnings: r.warnings };
  }

  function computeStatusForIdSync(employeeId) {
    var r = computeForIdSync(employeeId);
    return { status: statusFromResult(r), errors: r.errors, warnings: r.warnings };
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
    computeStatus: computeStatus,
    computeStatusForIdSync: computeStatusForIdSync,
    hasErrors: hasErrors,
    hasWarnings: hasWarnings,
    invalidate: invalidate,
  };
})(window);
