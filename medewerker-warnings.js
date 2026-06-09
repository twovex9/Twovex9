/* global window, document */
/**
 * medewerker-warnings.js — bereken errors + warnings voor een medewerker
 * volgens BS2's driehoek-systeem (rood = blokkering, oranje = waarschuwing).
 *
 * BS2-bron: POST /api/rpc met signature "get:employee-document-status"
 *   → response { errors: [...], warnings: [...] }
 *
 * Statusbron (sinds 2026-06-06, user-eis "gelijktrekken met BS2"):
 *  1) Heeft de medewerker een overgenomen BS2-status (data.bs2_doc_status, uit
 *     BS2's eigen get:employee-document-status) → DAT is de bron-van-waarheid;
 *     de errors/warnings + kleur komen 1-op-1 van BS2. (De ~80 medewerkers die
 *     in BS2 staan.)
 *  2) Geen overgenomen status (medewerker staat niet in BS2) → live-berekening
 *     compute() hieronder, die BS2's regel zo dicht mogelijk benadert.
 *
 * compute() — de live-fallbackregel (conform BS2, NIET meer de oude 7-puntseis):
 *  - ROOD   = VOG ontbreekt, of contract ontbreekt/verlopen. Contract is vereist
 *             behalve bij inhuur via een bureau (extern contract; benaderd via
 *             het dienstverband — BS2 doet dit via "via_agency").
 *  - ORANJE = een document (VOG/contract/ID/BHV) vervalt binnen 90 dgn, of een
 *             opleiding/training is verlopen.
 *  - GROEN  = de rest. ID/BHV/medicatie/meldcode/IBAN maken NOOIT rood.
 * Per categorie telt het beste exemplaar; een exemplaar zonder vervaldatum is
 * aanwezig & geldig. (De oude strikte 7-puntseis van Lionel 2026-06-04 is op
 * verzoek losgelaten omdat BS2 milder rekent — zie [[project_besa_hr_doc_status_bs2]].)
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

    function typeOf(d) { return String(d.type || "").toLowerCase(); }
    function nameOf(d) { return String(d.naam || "").toLowerCase(); }

    // Evalueer een categorie documenten en bepaal: bestaat er een exemplaar, is
    // er een GELDIG (niet-verlopen) exemplaar, en zo ja vervalt het beste
    // exemplaar binnen WARN_DAYS? Een exemplaar zonder vervaldatum telt als
    // geldig. Alleen het beste exemplaar telt — een oud verlopen document naast
    // een geldig blokkeert niet.
    function evalCat(matchFn) {
      var items = list.filter(matchFn);
      if (!items.length) return { exists: false, valid: false, expired: false, soon: null };
      var valid = false, best = null;
      items.forEach(function (it) {
        var vd = parseDate(it.vervaldatum);
        if (!vd) { valid = true; return; } // zonder datum = aanwezig & geldig
        var dd = daysBetween(now, vd);
        if (dd < 0) return; // verlopen exemplaar
        valid = true;
        if (dd <= WARN_DAYS && (best === null || dd < best.dd)) best = { vd: vd, dd: dd, it: it };
      });
      return { exists: true, valid: valid, expired: !valid, soon: valid ? best : null };
    }

    var isVog = function (d) { return typeOf(d) === "vog"; };
    var isContract = function (d) { return typeOf(d) === "contract"; };
    var isId = function (d) { return typeOf(d) === "id"; };
    var isBhv = function (d) { return typeOf(d) === "education" && nameOf(d).indexOf("bhv") !== -1; };
    var isSkj = function (d) { return typeOf(d) === "skj" || nameOf(d).indexOf("skj") !== -1; };
    var isVerzekering = function (d) { var n = nameOf(d) + " " + typeOf(d); return n.indexOf("verzeker") !== -1 || n.indexOf("aansprakelijk") !== -1; };
    // Overige opleiding/training: education die GEEN BHV/SKJ/verzekering is (anders dubbel geteld).
    var isOtherEdu = function (d) { return typeOf(d) === "education" && nameOf(d).indexOf("bhv") === -1 && nameOf(d).indexOf("skj") === -1 && !isVerzekering(d); };

    var vog = evalCat(isVog);
    var con = evalCat(isContract);
    var idc = evalCat(isId);
    var bhv = evalCat(isBhv);
    var skj = evalCat(isSkj);
    var verz = evalCat(isVerzekering);

    // 90/60/30-gelaagdheid (G10): bepaal de drempel-bucket voor een soon-warning.
    function tierOf(dd) { return dd <= 30 ? 30 : (dd <= 60 ? 60 : 90); }

    // Regel conform BS2 (zie [[project_besa_hr_doc_status_bs2]]):
    //  ROOD   = VOG ontbreekt, of contract ontbreekt/verlopen.
    //  ORANJE = document (VOG/contract/ID/BHV) vervalt binnen WARN_DAYS, of een
    //           opleiding/training is verlopen.
    //  GROEN  = de rest. ID/BHV/medicatie/meldcode/IBAN maken NOOIT rood.
    // Contract is vereist behalve bij inhuur via een bureau (extern contract) —
    // BS2 doet dit via "via_agency"; wij benaderen het via het dienstverband.
    // NB Voor medewerkers met een overgenomen BS2-status wordt deze berekening
    // overgeslagen (zie computeForId/computeForIdSync); dit is de live-fallback
    // voor medewerkers die niet in BS2 staan.
    var dv = String((employee && (employee.dienstverband || (employee.data && employee.data.dienstverband))) || "").toLowerCase();
    var contractRequired = dv.indexOf("inhuur") === -1;

    // ---- ROOD (errors) ----
    if (!vog.exists) {
      errors.push({ id: null, type: "vog", kind: "missing", label: "VOG",
        naam: "VOG ontbreekt", datum: null, datumLabel: "", reden: "Er is geen VOG aanwezig" });
    }
    if (contractRequired) {
      if (!con.exists) {
        errors.push({ id: null, type: "contract", kind: "missing", label: "Arbeidsovereenkomst / contract",
          naam: "Contract ontbreekt", datum: null, datumLabel: "", reden: "Er is geen arbeidsovereenkomst/contract aanwezig" });
      } else if (con.expired) {
        errors.push({ id: null, type: "contract", kind: "expired", label: "Arbeidsovereenkomst / contract",
          naam: "Contract verlopen", datum: null, datumLabel: "", reden: "Het contract is verlopen" });
      }
    }

    // ---- ORANJE (warnings) ----
    function pushSoon(cat, label) {
      if (cat.exists && cat.soon) {
        warnings.push({ id: cat.soon.it && cat.soon.it.id, type: label, kind: "expiry-soon",
          tier: tierOf(cat.soon.dd), dagen: cat.soon.dd,
          label: label, naam: (cat.soon.it && cat.soon.it.naam) || label,
          datum: cat.soon.it && cat.soon.it.vervaldatum, datumLabel: fmtDate(cat.soon.vd),
          reden: "Verloopt op " + fmtDate(cat.soon.vd) + " (over " + cat.soon.dd + " dagen)" });
      }
    }
    function pushExpiredOrSoon(cat, label, expiredReden) {
      if (cat.exists && cat.expired) {
        warnings.push({ id: null, type: label, kind: "expired", label: label, naam: label,
          datum: null, datumLabel: "", reden: expiredReden });
      } else {
        pushSoon(cat, label);
      }
    }
    pushSoon(vog, "VOG");
    pushSoon(con, "Arbeidsovereenkomst / contract");
    pushSoon(idc, "ID-kaart");
    pushExpiredOrSoon(bhv, "BHV", "BHV-certificaat is verlopen");
    pushExpiredOrSoon(skj, "SKJ-registratie", "SKJ-registratie is verlopen");
    pushExpiredOrSoon(verz, "Verzekering", "Verzekering is verlopen");
    // Overige opleidingen/trainingen: waarschuw zowel bij verloop als 90/60/30 vooraf.
    list.filter(isOtherEdu).forEach(function (d) {
      var vd = parseDate(d.vervaldatum);
      if (!vd) return;
      var dd = daysBetween(now, vd);
      if (dd < 0) {
        warnings.push({ id: d.id, type: "expired_education", kind: "expired",
          label: "Opleiding/training", naam: d.naam || "Opleiding/training",
          datum: d.vervaldatum, datumLabel: fmtDate(vd), reden: "Opleiding/training is verlopen" });
      } else if (dd <= WARN_DAYS) {
        warnings.push({ id: d.id, type: "education_soon", kind: "expiry-soon",
          tier: tierOf(dd), dagen: dd, label: "Opleiding/training", naam: d.naam || "Opleiding/training",
          datum: d.vervaldatum, datumLabel: fmtDate(vd),
          reden: "Verloopt op " + fmtDate(vd) + " (over " + dd + " dagen)" });
      }
    });

    return { errors: errors, warnings: warnings };
  }

  // Overgenomen BS2-documentstatus: als een medewerker een bs2_doc_status heeft
  // (ingelezen uit BS2 — zie [[project_besa_hr_doc_status_bs2]]), is DAT de
  // bron-van-waarheid voor de stoplicht-kleur, exact zoals BS2 'm berekent. We
  // geven de bijbehorende errors/warnings terug; statusFromResult leidt daar de
  // kleur (rood/oranje/groen) consistent uit af. Medewerkers zonder deze status
  // (niet in BS2) vallen terug op de live-berekening compute().
  function bs2Override(emp) {
    if (!emp) return null;
    var bs = emp.bs2_doc_status || (emp.data && emp.data.bs2_doc_status);
    if (!bs || typeof bs !== "object") return null;
    var st = String(bs.status || "");
    if (st !== "red" && st !== "orange" && st !== "green") return null;
    return {
      errors: Array.isArray(bs.errors) ? bs.errors : [],
      warnings: Array.isArray(bs.warnings) ? bs.warnings : [],
    };
  }

  function computeForId(employeeId) {
    if (!employeeId) return Promise.resolve({ errors: [], warnings: [] });
    var emp = null;
    try { if (global.medewerkersDB) emp = global.medewerkersDB.getByIdSync(employeeId); } catch (e) { /* */ }

    var ov = bs2Override(emp);
    if (ov) {
      _cache[employeeId] = { errors: ov.errors, warnings: ov.warnings, ts: Date.now() };
      return Promise.resolve({ errors: ov.errors, warnings: ov.warnings });
    }

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
    var ov = bs2Override(emp);
    if (ov) {
      _cache[employeeId] = { errors: ov.errors, warnings: ov.warnings, ts: Date.now() };
      return { errors: ov.errors, warnings: ov.warnings };
    }
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
