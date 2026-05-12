/* global window, localStorage */
/**
 * taken-data.js — Supabase data-laag voor BS2-port "Taken".
 *
 * Tabel `public.taken` (id text PK, FK toegewezen_aan_id naar medewerkers.uuid).
 * Source-of-truth = Supabase. Cache in localStorage["taken_v1"].
 *
 * Public API:
 *  - takenDB.ready (Promise — wacht op bootstrap)
 *  - takenDB.refresh() → Promise<Array>
 *  - takenDB.getAllSync() → Array (gesorteerd op deadline asc, daarna prioriteit desc, naam)
 *  - takenDB.getByIdSync(id) → Object|null
 *  - takenDB.add({ naam, beschrijving, toegewezenAanId, status, prioriteit, deadline }) → Promise<doc>
 *  - takenDB.update(id, partial) → Promise<doc>
 *  - takenDB.setStatus(id, status) → Promise<doc>
 *  - takenDB.archive(id) / restore(id) → Promise<doc>
 *  - takenDB.delete(id) → Promise<true>
 *  - takenDB.getForMedewerkerSync(medewerkerId) → Array
 *
 * Events: `besa:taken-updated` (window) na elke mutatie/bootstrap.
 */
(function (global) {
  "use strict";

  var TABLE = "taken";
  var CACHE_KEY = "taken_v1";

  var STATUS_VALUES = ["open", "in_progress", "voltooid", "geannuleerd"];
  var PRIORITEIT_VALUES = ["laag", "midden", "hoog"];
  var PRIORITEIT_RANK = { hoog: 0, midden: 1, laag: 2 };

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "t_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      beschrijving: row.beschrijving || "",
      toegewezenAanId: row.toegewezen_aan_id || null,
      aangemaaktDoorId: row.aangemaakt_door_id || null,
      status: row.status || "open",
      prioriteit: row.prioriteit || "midden",
      deadline: row.deadline || null,
      voltooidOp: row.voltooid_op || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var status = STATUS_VALUES.indexOf(safe.status) >= 0 ? safe.status : "open";
    var prioriteit = PRIORITEIT_VALUES.indexOf(safe.prioriteit) >= 0 ? safe.prioriteit : "midden";
    return {
      id: safe.id,
      naam: String(safe.naam || "").trim(),
      beschrijving: String(safe.beschrijving || ""),
      toegewezen_aan_id: safe.toegewezenAanId || null,
      aangemaakt_door_id: safe.aangemaaktDoorId || null,
      status: status,
      prioriteit: prioriteit,
      deadline: safe.deadline || null,
      archived: !!safe.archived,
    };
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      // 1. Open/in_progress voor voltooid/geannuleerd
      var aDone = a.status === "voltooid" || a.status === "geannuleerd" ? 1 : 0;
      var bDone = b.status === "voltooid" || b.status === "geannuleerd" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      // 2. Op deadline (null laatst)
      var ad = a.deadline ? String(a.deadline) : "9999-12-31";
      var bd = b.deadline ? String(b.deadline) : "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      // 3. Op prioriteit (hoog eerst)
      var ap = PRIORITEIT_RANK[a.prioriteit] != null ? PRIORITEIT_RANK[a.prioriteit] : 3;
      var bp = PRIORITEIT_RANK[b.prioriteit] != null ? PRIORITEIT_RANK[b.prioriteit] : 3;
      if (ap !== bp) return ap - bp;
      // 4. Naam alphabetisch
      return String(a.naam || "").localeCompare(String(b.naam || ""));
    });
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:taken-updated", { detail: { source: source || "data" } }));
    } catch (e) { /* */ }
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
        console.error("[takenDB] Bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Taken — bootstrap", err);
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

  async function getCurrentUserId() {
    try {
      if (!global.besaAuth) return null;
      var user = await global.besaAuth.getCurrentUser();
      return user ? user.id : null;
    } catch (e) { return null; }
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {});
    if (!doc.id) doc.id = generateId();
    if (!doc.aangemaaktDoorId) doc.aangemaaktDoorId = await getCurrentUserId();
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

  async function setStatus(id, status) { return update(id, { status: status }); }
  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
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
    return readCache().filter(function (r) { return r && String(r.toegewezenAanId) === s; });
  }

  global.takenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    setStatus: setStatus,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
    STATUS_VALUES: STATUS_VALUES,
    PRIORITEIT_VALUES: PRIORITEIT_VALUES,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
