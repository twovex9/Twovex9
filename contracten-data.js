/* global window, localStorage */
/**
 * Contracten — Supabase data-laag (opgestelde contracten per medewerker).
 *
 * Een contract wordt opgesteld vanuit een contractsjabloon (contract_sjablonen):
 * de merge-velden {{...}} worden ingevuld met medewerkergegevens + HR-invoer en
 * de gegenereerde tekst wordt hier bewaard. Ondertekening (release 5) breidt de
 * status uit (opgesteld → wacht_op_ondertekening → getekend).
 *
 * Bron van waarheid: Supabase tabel `contracten`.
 * Cache: localStorage "contracten_v1" + in-memory `_mem` (DATA-SLIM).
 * Event: `besa:contracten-updated`.
 */
(function (global) {
  "use strict";

  var TABLE = "contracten";
  var CACHE_KEY = "contracten_v1";
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
      global.dispatchEvent(new CustomEvent("besa:contracten-updated", { detail: { source: source || "contracten-data" } }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      sjabloonId: row.sjabloon_id || null,
      naam: row.naam || "",
      type: row.type || "",
      variabelen: row.variabelen && typeof row.variabelen === "object" ? row.variabelen : {},
      gegenereerdeTekst: row.gegenereerde_tekst || "",
      status: row.status || "opgesteld",
      pdfStoragePath: row.pdf_storage_path || null,
      aangemaaktDoor: row.aangemaakt_door || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || null,
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var p = {};
    if (safe.medewerkerId !== undefined) p.medewerker_id = String(safe.medewerkerId || "");
    if (safe.sjabloonId !== undefined) p.sjabloon_id = safe.sjabloonId || null;
    if (safe.naam !== undefined) p.naam = String(safe.naam || "");
    if (safe.type !== undefined) p.type = String(safe.type || "");
    if (safe.variabelen !== undefined) p.variabelen = safe.variabelen && typeof safe.variabelen === "object" ? safe.variabelen : {};
    if (safe.gegenereerdeTekst !== undefined) p.gegenereerde_tekst = String(safe.gegenereerdeTekst || "");
    if (safe.status !== undefined) p.status = String(safe.status || "opgesteld");
    if (safe.pdfStoragePath !== undefined) p.pdf_storage_path = safe.pdfStoragePath || null;
    if (safe.aangemaaktDoor !== undefined) p.aangemaakt_door = safe.aangemaaktDoor || null;
    if (safe.archived !== undefined) p.archived = !!safe.archived;
    return p;
  }

  async function ensureSupabaseReady() {
    if (global.besaSupabaseReady && typeof global.besaSupabaseReady.then === "function") {
      try { await global.besaSupabaseReady; } catch (e) { /* */ }
    }
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    await ensureSupabaseReady();
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
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[contractenDB] Bootstrap mislukt:", err);
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
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
  }

  async function add(item) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToPayload(item);
    if (!payload.medewerker_id) throw new Error("medewerkerId verplicht");
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    upsertLocal(obj);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, patch) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("id verplicht");
    var res = await global.besaSupabase.from(TABLE).update(objToPayload(patch)).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    upsertLocal(obj);
    dispatchUpdated("update");
    return obj;
  }

  function archive(id) { return update(id, { archived: true }); }
  function restore(id) { return update(id, { archived: false }); }

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

  function getAllSync() { return readCache().slice(); }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return readCache().filter(function (r) { return r && String(r.medewerkerId) === s && !r.archived; });
  }

  // Het meest recente niet-gearchiveerde contract van een medewerker (of null).
  function getLatestForMedewerkerSync(medewerkerId) {
    var list = getForMedewerkerSync(medewerkerId);
    if (!list.length) return null;
    list.sort(function (a, b) { return String(b.aanmaakdatum || "").localeCompare(String(a.aanmaakdatum || "")); });
    return Object.assign({}, list[0]);
  }

  function getByIdSync(id) {
    if (!id) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  global.contractenDB = {
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
    getForMedewerkerSync: getForMedewerkerSync,
    getLatestForMedewerkerSync: getLatestForMedewerkerSync,
    getByIdSync: getByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
