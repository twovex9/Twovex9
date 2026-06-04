/* global window, document */
/**
 * medewerker-warnings.js — bereken errors + warnings voor een medewerker
 * volgens BS2's driehoek-systeem (rood = blokkering, oranje = waarschuwing).
 *
 * BS2-bron: POST /api/rpc met signature "get:employee-document-status"
 *   → response { errors: [...], warnings: [...] }
 *
 * Document-statusregels (user-eis Lionel 2026-06-04 — STRIKTE 7-puntseis):
 *  - GROEN  = alle 7 verplichte gegevens aanwezig & geldig, niets vervalt <90 dgn
 *  - ORANJE = een verplicht document is geldig maar vervalt binnen 3 maanden (90 dgn)
 *  - ROOD   = een verplicht gegeven ONTBREEKT, of alle exemplaren ervan zijn verlopen
 *
 * De 7 verplichte gegevens (gelden voor ÁLLE medewerkers, geen uitzonderingen):
 *   1. VOG                          (documenttype 'vog')
 *   2. Arbeidsovereenkomst/contract (documenttype 'contract' — óók bij inhuur via bureau)
 *   3. ID-kaart                     (documenttype 'id')
 *   4. BHV                          (document met "bhv" in de naam)
 *   5. Medicatietraining            (document met "medicat" in de naam)
 *   6. Meldcode huiselijk geweld    (document met "meldcode"/"huiselijk" in de naam)
 *   7. Bankrekeningnummer (IBAN)    (data-veld profIban; geen vervaldatum)
 *
 * BHV/medicatie/meldcode hebben in de DB geen eigen documenttype maar staan als
 * 'education'/'other' met een vrije naam → daarom matchen we op trefwoord in de
 * naam. Per document: ontbreekt → rood; alle exemplaren verlopen → rood; geldig
 * maar vervalt <90 dgn → oranje; een exemplaar zonder vervaldatum = aanwezig & geldig.
 *
 * NB De doc-status staat LOS van planbaarheid: een rode/oranje medewerker kan
 * handmatig planbaar worden gezet (medewerker.js → isPlannable); de melding blijft
 * staan tot de documentatie is aangeleverd. Groen = automatisch planbaar.
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

    // Matcher-helpers. Een verplicht document wordt herkend op TYPE
    // (vog/contract/id) óf op NAAM. BHV/medicatie/meldcode hebben in de DB geen
    // eigen documenttype maar staan als 'education'/'other' met een vrije naam,
    // dus die matchen we op trefwoord(en) in de naam.
    function byType(typeKey) {
      return function (d) { return String(d.type || "").toLowerCase() === typeKey; };
    }
    function nameContains(keywords) {
      return function (d) {
        var n = String(d.naam || "").toLowerCase();
        for (var i = 0; i < keywords.length; i++) {
          if (n.indexOf(keywords[i]) !== -1) return true;
        }
        return false;
      };
    }

    // Evalueer één verplicht document (geïdentificeerd door matchFn):
    //  - ontbreekt volledig            → ERROR (rood)
    //  - bestaat maar ALLE verlopen    → ERROR (rood)
    //  - geldig maar vervalt <WARN_DAYS→ WARNING (oranje)
    // Een exemplaar zonder vervaldatum telt als aanwezig & geldig. Alleen het
    // meest recente exemplaar telt: een oud verlopen document dat al door een
    // geldig is vervangen, blokkeert niet.
    function evalRequiredDoc(matchFn, label, missingNaam, missingReden) {
      var items = list.filter(matchFn);
      var hasValid = false;
      items.forEach(function (it) {
        var vd = parseDate(it.vervaldatum);
        if (!vd) { hasValid = true; return; } // zonder datum = aanwezig & geldig
        var dd = daysBetween(now, vd);
        if (dd < 0) return; // verlopen exemplaar — telt niet als geldig
        hasValid = true;
        if (dd <= WARN_DAYS) {
          warnings.push({
            id: it.id, type: label, kind: "expiry-soon",
            label: label, naam: it.naam || label,
            datum: it.vervaldatum, datumLabel: fmtDate(vd),
            reden: "Verloopt op " + fmtDate(vd) + " (over " + dd + " dagen)",
          });
        }
      });
      if (items.length === 0) {
        errors.push({
          id: null, type: label, kind: "missing",
          label: label, naam: missingNaam, datum: null, datumLabel: "",
          reden: missingReden,
        });
      } else if (!hasValid) {
        var laatste = items.reduce(function (best, it) {
          var d = parseDate(it.vervaldatum);
          return (!best || (d && best.d && d > best.d)) ? { it: it, d: d } : best;
        }, null);
        errors.push({
          id: laatste && laatste.it.id, type: label, kind: "expired",
          label: label, naam: (laatste && laatste.it.naam) || label,
          datum: laatste && laatste.it.vervaldatum,
          datumLabel: laatste && laatste.d ? fmtDate(laatste.d) : "",
          reden: "Verlopen op " + (laatste && laatste.d ? fmtDate(laatste.d) : "onbekende datum"),
        });
      }
    }

    // ---- De 7 strikt verplichte gegevens (user-eis Lionel 2026-06-04). ----
    // Ontbreekt = rood; vervalt binnenkort = oranje; alles geldig = groen.
    // Geldt voor ÁLLE medewerkers; géén uitzondering voor inhuur "via bureau".
    evalRequiredDoc(byType("vog"), "VOG",
      "VOG ontbreekt", "Er is geen VOG geüpload");
    evalRequiredDoc(byType("contract"), "Arbeidsovereenkomst / contract",
      "Contract ontbreekt", "Er is geen arbeidsovereenkomst/contract geüpload");
    evalRequiredDoc(byType("id"), "ID-kaart",
      "ID-kaart ontbreekt", "Er is geen ID-bewijs geüpload");
    evalRequiredDoc(nameContains(["bhv"]), "BHV",
      "BHV ontbreekt", "Er is geen BHV-certificaat geüpload");
    evalRequiredDoc(nameContains(["medicat"]), "Medicatietraining",
      "Medicatietraining ontbreekt", "Er is geen medicatietraining-certificaat geüpload");
    evalRequiredDoc(nameContains(["meldcode", "huiselijk"]), "Meldcode huiselijk geweld",
      "Meldcode huiselijk geweld ontbreekt", "Er is geen certificaat 'meldcode huiselijk geweld' geüpload");

    // ---- Bankrekeningnummer (IBAN): data-veld (profIban), geen document en
    //      geen vervaldatum. Leeg/ontbreekt → ROOD. ----
    var iban = String(
      (employee && (employee.profIban || (employee.data && employee.data.profIban))) || ""
    ).trim();
    if (!iban) {
      errors.push({
        id: null, type: "iban", kind: "missing",
        label: "Bankrekeningnummer", naam: "Bankrekeningnummer ontbreekt",
        datum: null, datumLabel: "",
        reden: "Er is geen bankrekeningnummer (IBAN) ingevuld",
      });
    }

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
