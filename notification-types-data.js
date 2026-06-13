/* global window, localStorage */
/**
 * notification-types-data.js — Supabase data-laag voor notification_types.
 *
 * Public API: notificationTypesDB.{ready, refresh, getAllSync, getByIdSync,
 *   add, update, archive, restore, delete}
 * Events: ff:notification-types-updated
 */
(function (global) {
  "use strict";

  var TABLE = "notification_types";
  var CACHE_KEY = "notification_types_v1";

  function isoNow() { return new Date().toISOString(); }
  function generateId() { return "nt_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 6); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      beschrijving: row.beschrijving || "",
      defaultAan: !!row.default_aan,
      kanaal: row.kanaal || "in_app",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }
  function objToPayload(o) {
    var safe = o || {};
    var kanaal = ["in_app", "email", "sms", "push"].indexOf(safe.kanaal) >= 0 ? safe.kanaal : "in_app";
    return {
      id: safe.id,
      naam: String(safe.naam || "").trim(),
      beschrijving: String(safe.beschrijving || ""),
      default_aan: !!safe.defaultAan,
      kanaal: kanaal,
      archived: !!safe.archived,
    };
  }
  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) || []) : []; } catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }
  function dispatchUpdated(s) {
    try { global.dispatchEvent(new CustomEvent("ff:notification-types-updated", { detail: { source: s || "data" } })); } catch (e) { /* */ }
  }
  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).select("*").order("naam", { ascending: true });
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
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[notificationTypesDB] Bootstrap mislukt:", err);
        if (global.ffReportSyncFailure) global.ffReportSyncFailure("Notification types — bootstrap", err);
      }
    })();
    return readyPromise;
  }
  async function refresh() { var items = await fetchAll(); writeCache(items); dispatchUpdated("refresh"); return items; }
  async function add(rec) {
    var doc = Object.assign({}, rec || {});
    if (!doc.id) doc.id = generateId();
    var res = await global.ffSupabase.from(TABLE).insert(objToPayload(doc)).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(readCache().concat([obj]));
    dispatchUpdated("add");
    return obj;
  }
  async function update(id, partial) {
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToPayload(merged);
    delete payload.id;
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }
  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }
  async function remove(id) {
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
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

  global.notificationTypesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh, add: add, update: update,
    archive: archive, restore: restore, delete: remove,
    getAllSync: getAllSync, getByIdSync: getByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
