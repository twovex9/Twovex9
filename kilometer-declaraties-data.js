/* global window, localStorage */
/**
 * Kilometer-declaraties — Supabase data-laag, 1-op-1 BS2.
 *
 * BS2-model (mileage-declarations): één DECLARATIE = 1 medewerker × 1 maand
 * (status, total_kilometers, total_reimbursement, submitted_at,
 * submission_status, …) met per-dag RECORDS als losse rijen.
 * Bron-van-waarheid: public.kilometer_declaraties + public.kilometer_records.
 * Totalen/vergoeding komen VERBATIM uit BS2 (niet herrekenen).
 *
 * DATA-SLIM + _mem (bindende les): zware BS2-raw niet in de localStorage-
 * cache; in-memory bron zodat de pagina ook bij volle quota werkt.
 *
 * Public API:
 *   kilometerDeclaratiesDB.ready
 *   kilometerDeclaratiesDB.refresh()
 *   kilometerDeclaratiesDB.getAllSync()                  → declaraties
 *   kilometerDeclaratiesDB.getByIdSync(id)
 *   kilometerDeclaratiesDB.getForMedewerkerSync(mwId)    → declaraties v/d mw
 *   kilometerDeclaratiesDB.getRecordsForDeclaratieSync(declId) → per-dag
 *   kilometerDeclaratiesDB.getRawBs2(id)  → volledige BS2-declaratie (on-demand)
 *
 * Events: "besa:kilometer-declaraties-updated" op window.
 */
(function (global) {
  "use strict";

  var T_DECL = "kilometer_declaraties";
  var T_REC = "kilometer_records";
  var CACHE_DECL = "km_decl_v2";
  var CACHE_REC = "km_rec_v2";

  function reportSilent(action, err) {
    try { console.error("[kilometerDeclaratiesDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Kilometer-declaraties — " + action, err);
    }
  }

  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(key, items) {
    try { localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* quota vol — _mem is de bron */ }
  }
  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:kilometer-declaraties-updated", {
        detail: { source: source || "kilometer-declaraties-data" },
      }));
    } catch (e) { /* */ }
  }

  // In-memory bron-van-waarheid (sessie); localStorage best-effort.
  var _decl = null, _rec = null;
  function setDecl(items) { _decl = Array.isArray(items) ? items : []; writeCache(CACHE_DECL, _decl); }
  function setRec(items) { _rec = Array.isArray(items) ? items : []; writeCache(CACHE_REC, _rec); }
  function declList() { return (_decl !== null) ? _decl : readCache(CACHE_DECL); }
  function recList() { return (_rec !== null) ? _rec : readCache(CACHE_REC); }

  function declRowToObj(row) {
    if (!row) return null;
    var d = (row.data && typeof row.data === "object") ? row.data : {};
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || null,
      jaar: row.jaar,
      maand: row.maand,
      monthDisplay: d.bs2_month_display || null,
      status: row.status || "draft",
      totalKilometers: row.total_kilometers == null ? 0 : Number(row.total_kilometers),
      totalReimbursement: row.total_reimbursement == null ? 0 : Number(row.total_reimbursement),
      submittedAt: row.submitted_at || null,
      submissionStatus: row.submission_status || null,
      isEditable: !!row.is_editable,
      canBeSubmitted: !!row.can_be_submitted,
      isDeadlinePassed: !!row.is_deadline_passed,
      bs2Id: d.bs2_id || null,
      bs2Employee: d.bs2_employee || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }
  function recRowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      declaratieId: row.declaratie_id || null,
      datum: row.datum || null,
      beschrijving: row.beschrijving || "",
      kilometers: row.kilometers == null ? 0 : Number(row.kilometers),
      type: row.type || null,
      typeDisplay: row.type_display || (row.type === "office" ? "Naar kantoor" : row.type || ""),
      isAutomatic: !!row.is_automatic,
      locatieNaam: row.locatie_naam || "",
      locatieBs2Id: row.locatie_bs2_id || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var dRes = await global.besaSupabase
      .from(T_DECL)
      .select("id,medewerker_id,jaar,maand,status,total_kilometers,total_reimbursement,submitted_at,submission_status,is_editable,can_be_submitted,is_deadline_passed,data,aanmaakdatum,laatst_gewijzigd")
      .order("jaar", { ascending: false })
      .order("maand", { ascending: false });
    if (dRes.error) throw dRes.error;
    var rRes = await global.besaSupabase
      .from(T_REC)
      .select("id,declaratie_id,datum,beschrijving,kilometers,type,type_display,is_automatic,locatie_naam,locatie_bs2_id,aanmaakdatum,laatst_gewijzigd")
      .order("datum", { ascending: true });
    if (rRes.error) throw rRes.error;
    return {
      decl: (dRes.data || []).map(declRowToObj).filter(Boolean),
      rec: (rRes.data || []).map(recRowToObj).filter(Boolean),
    };
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readCache(CACHE_DECL).length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var r = await fetchAll();
        setDecl(r.decl);
        setRec(r.rec);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("Bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var r = await fetchAll();
    setDecl(r.decl);
    setRec(r.rec);
    dispatchUpdated("refresh");
    return r.decl;
  }

  function getAllSync() { return declList(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var f = declList().find(function (r) { return r && String(r.id) === s; });
    return f ? Object.assign({}, f) : null;
  }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return declList().filter(function (r) { return r && String(r.medewerkerId) === s; });
  }

  function getRecordsForDeclaratieSync(declId) {
    if (declId == null) return [];
    var s = String(declId);
    return recList()
      .filter(function (r) { return r && String(r.declaratieId) === s; })
      .sort(function (a, b) {
        return String(a.datum || "").localeCompare(String(b.datum || ""));
      });
  }

  // Volledige BS2-raw on-demand (NIET gecachet — DATA-SLIM).
  async function getRawBs2(id) {
    if (!global.besaSupabase || id == null) return null;
    var res = await global.besaSupabase
      .from(T_DECL).select("data").eq("id", id).single();
    if (res.error) throw res.error;
    var d = res.data && res.data.data;
    return (d && d.bs2_scrape) || null;
  }

  global.kilometerDeclaratiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
    getRecordsForDeclaratieSync: getRecordsForDeclaratieSync,
    getRawBs2: getRawBs2,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
