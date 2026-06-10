/* global window, localStorage */
/**
 * Verbeteringsmaatregelen — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur volgt werkpatronen.md § 6:
 *  - Source of truth: Supabase tabel `public.verbeteringsmaatregelen`.
 *  - Bootstrap fetcht alle items en cachet ze onder "verbeteringsmaatregelen_v1"
 *    voor instant render bij volgende page-load.
 *  - Schrijfacties (add/update/archive/restore/delete) zijn async naar Supabase;
 *    cache wordt geüpdatet en `besa:verbeteringsmaatregelen-updated` event vuurt
 *    voor live re-renders.
 *
 * Public API:
 *   verbeteringsmaatregelenDB.ready
 *   verbeteringsmaatregelenDB.refresh()
 *   verbeteringsmaatregelenDB.getAllSync()
 *   verbeteringsmaatregelenDB.getActiveSync()       → niet-gearchiveerd
 *   verbeteringsmaatregelenDB.getByIdSync(id)
 *   verbeteringsmaatregelenDB.add({titel, beschrijving, vervaldatum, afgerond, clientId})
 *   verbeteringsmaatregelenDB.update(id, partial)
 *   verbeteringsmaatregelenDB.archive(id)
 *   verbeteringsmaatregelenDB.restore(id)
 *   verbeteringsmaatregelenDB.delete(id)
 *
 * Events: "besa:verbeteringsmaatregelen-updated" op window.
 */
(function (global) {
  "use strict";

  var TABLE = "verbeteringsmaatregelen";
  var CACHE_KEY = "verbeteringsmaatregelen_v1";

  function generateId() {
    return "vm_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function reportSilent(action, err) {
    try { console.error("[verbeteringsmaatregelenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Verbeteringsmaatregelen — " + action, err);
    }
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
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:verbeteringsmaatregelen-updated", {
        detail: { source: source || "verbeteringsmaatregelen-data" },
      }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      titel: row.titel || "",
      beschrijving: row.beschrijving || "",
      vervaldatum: row.vervaldatum || null,
      afgerond: !!row.afgerond,
      clientId: row.client_id || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      titel: String(safe.titel || "").trim(),
      beschrijving: String(safe.beschrijving || ""),
      vervaldatum: safe.vervaldatum ? String(safe.vervaldatum) : null,
      afgerond: !!safe.afgerond,
      client_id: safe.clientId ? String(safe.clientId) : null,
      archived: !!safe.archived,
    };
    payload.id = safe.id || generateId();
    return payload;
  }

  function objToUpdatePayload(o) {
    var safe = o || {};
    var payload = {};
    if (Object.prototype.hasOwnProperty.call(safe, "titel")) payload.titel = String(safe.titel || "").trim();
    if (Object.prototype.hasOwnProperty.call(safe, "beschrijving")) payload.beschrijving = String(safe.beschrijving || "");
    if (Object.prototype.hasOwnProperty.call(safe, "vervaldatum")) payload.vervaldatum = safe.vervaldatum ? String(safe.vervaldatum) : null;
    if (Object.prototype.hasOwnProperty.call(safe, "afgerond")) payload.afgerond = !!safe.afgerond;
    if (Object.prototype.hasOwnProperty.call(safe, "clientId")) payload.client_id = safe.clientId ? String(safe.clientId) : null;
    if (Object.prototype.hasOwnProperty.call(safe, "archived")) payload.archived = !!safe.archived;
    return payload;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: false });
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
        reportSilent("Bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(items);
    dispatchUpdated("refresh");
    return items;
  }

  function getAllSync() { return readCache(); }

  function getActiveSync() {
    return readCache().filter(function (r) { return r && !r.archived; });
  }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.titel) throw new Error("Titel is verplicht");
    var res = await global.besaSupabase
      .from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var payload = objToUpdatePayload(partial || {});
    var res = await global.besaSupabase
      .from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase
      .from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  global.verbeteringsmaatregelenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getActiveSync: getActiveSync,
    getByIdSync: getByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
