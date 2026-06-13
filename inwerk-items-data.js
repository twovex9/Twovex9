/* global window, localStorage */
/**
 * Inwerk-items — Supabase data-laag.
 *
 * De catalogus van inwerk-onderdelen die HR/Donovan beheert: inwerkvideo's
 * (YouTube/Vimeo embed-link) of document-links, per doelgroep (alle/loondienst/
 * zzp/stagiair/inhuur), met verplicht-vlag + volgorde. De nieuwe medewerker
 * doorloopt ze op de geïsoleerde pagina onboarding-inwerken.html en vinkt
 * "gelezen + akkoord" (bijgehouden in `inwerk_voortgang`).
 *
 * Bron van waarheid: Supabase tabel `inwerk_items`.
 * Cache: localStorage "inwerk_items_v1" + in-memory `_mem` (DATA-SLIM).
 * Event: `ff:inwerk-items-updated`.
 */
(function (global) {
  "use strict";

  var TABLE = "inwerk_items";
  var CACHE_KEY = "inwerk_items_v1";
  var _mem = null;

  function isoNow() { return new Date().toISOString(); }

  function readCache() {
    if (_mem !== null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var p = raw ? JSON.parse(raw) : [];
      _mem = Array.isArray(p) ? p : [];
    } catch (e) { _mem = []; }
    return _mem;
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota — _mem blijft bron */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:inwerk-items-updated", { detail: { source: source || "inwerk-items-data" } }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      titel: row.titel || "",
      type: row.type || "video",
      url: row.url || "",
      beschrijving: row.beschrijving || "",
      doelgroep: row.doelgroep || "alle",
      verplicht: row.verplicht !== false,
      volgorde: typeof row.volgorde === "number" ? row.volgorde : (parseInt(row.volgorde, 10) || 0),
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || null,
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var p = {};
    if (safe.titel !== undefined) p.titel = String(safe.titel || "");
    if (safe.type !== undefined) p.type = String(safe.type || "video");
    if (safe.url !== undefined) p.url = String(safe.url || "");
    if (safe.beschrijving !== undefined) p.beschrijving = safe.beschrijving ? String(safe.beschrijving) : "";
    if (safe.doelgroep !== undefined) p.doelgroep = String(safe.doelgroep || "alle");
    if (safe.verplicht !== undefined) p.verplicht = !!safe.verplicht;
    if (safe.volgorde !== undefined) p.volgorde = parseInt(safe.volgorde, 10) || 0;
    if (safe.archived !== undefined) p.archived = !!safe.archived;
    return p;
  }

  async function ensureSupabaseReady() {
    if (global.ffSupabaseReady && typeof global.ffSupabaseReady.then === "function") {
      try { await global.ffSupabaseReady; } catch (e) { /* */ }
    }
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    await ensureSupabaseReady();
    var res = await global.ffSupabase.from(TABLE).select("*").order("volgorde", { ascending: true });
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
        console.error("[inwerkItemsDB] Bootstrap mislukt:", err);
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

  function upsertLocal(obj) {
    if (!obj) return;
    var cache = readCache().slice();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(obj.id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    cache.sort(function (a, b) { return (a.volgorde || 0) - (b.volgorde || 0); });
    writeCache(cache);
  }

  async function add(item) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToPayload(item);
    if (!payload.titel) throw new Error("Titel is verplicht");
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    upsertLocal(obj);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, patch) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("id verplicht");
    var res = await global.ffSupabase.from(TABLE).update(objToPayload(patch)).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    upsertLocal(obj);
    dispatchUpdated("update");
    return obj;
  }

  function archive(id) { return update(id, { archived: true }); }
  function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache().slice(); }

  function getByIdSync(id) {
    if (!id) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  global.inwerkItemsDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
