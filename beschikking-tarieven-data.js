/* global window, localStorage */
/**
 * Beschikking tarieven — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `beschikking_tarieven`.
 *  - Bij bootstrap fetcht deze module ALLE tarief-rijen (over alle
 *    beschikkingen) en cachet ze onder "beschikking_tarieven_v1". Voor de
 *    detailpagina is dat goedkoop: het zijn enkele rijen per beschikking en
 *    we draaien ze enkel op /beschikking-detail.html.
 *  - Schrijfacties (add/update/remove) gaan async naar Supabase; de cache
 *    wordt geüpdatet en het update-event `besa:beschikking-tarieven-updated`
 *    wordt gefired voor live re-renders.
 *  - Eénmalige migratie van legacy localStorage["beschikking_tarieven_supp_v1"]
 *    naar Supabase bij eerste bootstrap na deploy.
 *
 * Gebruik:
 *   await window.beschikkingTarievenDB.ready;
 *   var rows = window.beschikkingTarievenDB.getForBescSync(bescId);
 *   var saved = await window.beschikkingTarievenDB.add({
 *     bescId: "b_besc_001", geldigVan: "2026-05-01", weektarief: 250.50, reden: "Indexatie"
 *   });
 *   await window.beschikkingTarievenDB.remove(id);
 *   window.addEventListener("besa:beschikking-tarieven-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "beschikking_tarieven";
  var CACHE_KEY = "beschikking_tarieven_v1";
  var LEGACY_KEY = "beschikking_tarieven_supp_v1";
  var MIGRATION_FLAG = "beschikkingTarievenMigratedToSupabase.v1";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isoNow() { return new Date().toISOString(); }

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

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:beschikking-tarieven-updated", { detail: { source: source || "beschikking-tarieven-data" } }));
    } catch (e) { /* */ }
  }

  function toNumber(v) {
    if (v == null || v === "") return 0;
    var n = Number(String(v).replace(",", "."));
    return isFinite(n) ? n : 0;
  }

  // Frontend-conventie blijft camelCase (bescId, geldigVan, weektarief,
  // reden, aangemaakt). DB-kolommen zijn snake_case. Hier mappen.
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      bescId: row.beschikking_id || "",
      geldigVan: row.geldig_van || "",
      weektarief: toNumber(row.weektarief),
      reden: row.reden || "",
      aangemaakt: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      beschikking_id: String(safe.bescId || ""),
      geldig_van: safe.geldigVan ? String(safe.geldigVan).slice(0, 10) : null,
      weektarief: toNumber(safe.weektarief),
      reden: (safe.reden && String(safe.reden).trim()) ? String(safe.reden) : null,
    };
    if (safe.aangemaakt && typeof safe.aangemaakt === "string") {
      payload.aanmaakdatum = safe.aangemaakt;
    }
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    return p;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("geldig_van", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG) === "1") return false;
      if (!global.besaSupabase) return false;

      var head = await global.besaSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      var legacyRaw = "[]";
      try { legacyRaw = localStorage.getItem(LEGACY_KEY) || "[]"; } catch (e) { /* */ }
      var legacy = [];
      try { legacy = JSON.parse(legacyRaw) || []; } catch (e) { legacy = []; }
      if (!Array.isArray(legacy) || legacy.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[beschikkingTarievenDB] Eenmalige migratie van " + legacy.length + " tarief-rijen naar Supabase…");
      var payload = legacy
        .filter(function (r) { return r && r.bescId && r.geldigVan; })
        .map(function (r) { return objToInsertPayload(r); });
      if (payload.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }
      var ins = await global.besaSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[beschikkingTarievenDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      console.info("[beschikkingTarievenDB] Migratie geslaagd: " + (ins.data || []).length + " items naar Supabase.");
      return true;
    } catch (err) {
      console.error("[beschikkingTarievenDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[beschikkingTarievenDB] Bootstrap mislukt:", err);
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

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.bescId) throw new Error("bescId verplicht");
    if (!rec.geldigVan) throw new Error("geldigVan verplicht");
    var payload = objToInsertPayload(rec);
    var res = await global.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
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
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToUpdatePayload(merged);
    var res = await global.besaSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
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

  function getForBescSync(bescId) {
    if (!bescId) return [];
    var s = String(bescId);
    return readCache().filter(function (r) { return r && String(r.bescId) === s; });
  }

  global.beschikkingTarievenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForBescSync: getForBescSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
