/* global window, localStorage */
/**
 * verlof-data.js — Supabase data-laag voor BS2-port "Verlof aanvragen".
 *
 * Tabel: public.verlof_aanvragen (text PK, FK medewerker_id naar medewerkers.uuid).
 * Aanvraag-flow: concept → ingediend → goedgekeurd / afgewezen.
 *
 * Public API:
 *  - verlofDB.ready / refresh / getAllSync / getByIdSync
 *  - verlofDB.add / update / archive / restore / delete
 *  - verlofDB.indienen(id) / goedkeuren(id, opmerking) / afwijzen(id, opmerking) / annuleren(id)
 *  - verlofDB.getForMedewerkerSync(medewerkerId)
 *
 * Events: besa:verlof-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verlof_aanvragen";
  var CACHE_KEY = "verlof_aanvragen_v1";

  var STATUS_VALUES = ["concept", "ingediend", "goedgekeurd", "afgewezen", "geannuleerd"];
  var TYPE_VALUES = ["wettelijk", "bovenwettelijk", "ouderschap", "calamiteit", "doktersbezoek", "onbetaald", "anders"];

  function isoNow() { return new Date().toISOString(); }
  function generateId() { return "v_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || null,
      type: row.type || "wettelijk",
      startDatum: row.start_datum || null,
      eindDatum: row.eind_datum || null,
      aantalDagen: row.aantal_dagen != null ? Number(row.aantal_dagen) : 0,
      status: row.status || "concept",
      beschrijving: row.beschrijving || "",
      ingediendOp: row.ingediend_op || null,
      beoordeeldOp: row.beoordeeld_op || null,
      beoordeeldDoor: row.beoordeeld_door || null,
      beoordelingOpmerking: row.beoordeling_opmerking || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var status = STATUS_VALUES.indexOf(safe.status) >= 0 ? safe.status : "concept";
    var type = TYPE_VALUES.indexOf(safe.type) >= 0 ? safe.type : "wettelijk";
    var payload = {
      id: safe.id,
      medewerker_id: safe.medewerkerId || null,
      type: type,
      start_datum: safe.startDatum || null,
      eind_datum: safe.eindDatum || null,
      aantal_dagen: safe.aantalDagen != null ? Number(safe.aantalDagen) : 1,
      status: status,
      beschrijving: String(safe.beschrijving || ""),
      beoordeling_opmerking: String(safe.beoordelingOpmerking || ""),
      archived: !!safe.archived,
    };
    if (safe.beoordeeldDoor) payload.beoordeeld_door = safe.beoordeeldDoor;
    return payload;
  }

  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) || []) : []; } catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      // Open (concept/ingediend) eerst, dan goedgekeurd/afgewezen
      var aPending = (a.status === "concept" || a.status === "ingediend") ? 0 : 1;
      var bPending = (b.status === "concept" || b.status === "ingediend") ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      // Op start_datum asc
      var as = a.startDatum ? String(a.startDatum) : "9999-12-31";
      var bs = b.startDatum ? String(b.startDatum) : "9999-12-31";
      if (as !== bs) return as < bs ? -1 : 1;
      // Op aanmaakdatum desc
      return String(b.aanmaakdatum || "").localeCompare(String(a.aanmaakdatum || ""));
    });
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:verlof-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*");
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var items = await fetchAll();
        writeCache(sortItems(items));
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[verlofDB] Bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Verlof — bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(sortItems(items));
    dispatchUpdated("refresh");
    return items;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {});
    if (!doc.id) doc.id = generateId();
    var payload = objToPayload(doc);
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(sortItems(readCache().concat([obj])));
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToPayload(merged);
    delete payload.id;
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(sortItems(cache));
    dispatchUpdated("update");
    return obj;
  }

  async function indienen(id) { return update(id, { status: "ingediend" }); }
  async function goedkeuren(id, opmerking) { return update(id, { status: "goedgekeurd", beoordelingOpmerking: opmerking || "" }); }
  async function afwijzen(id, opmerking) { return update(id, { status: "afgewezen", beoordelingOpmerking: opmerking || "" }); }
  async function annuleren(id) { return update(id, { status: "geannuleerd" }); }
  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(readCache().filter(function (r) { return r && String(r.id) !== String(id); }));
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }
  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return readCache().filter(function (r) { return r && String(r.medewerkerId) === s; });
  }

  global.verlofDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    add: add, update: update,
    indienen: indienen, goedkeuren: goedkeuren, afwijzen: afwijzen, annuleren: annuleren,
    archive: archive, restore: restore, delete: remove,
    getAllSync: getAllSync, getByIdSync: getByIdSync, getForMedewerkerSync: getForMedewerkerSync,
    STATUS_VALUES: STATUS_VALUES, TYPE_VALUES: TYPE_VALUES,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
