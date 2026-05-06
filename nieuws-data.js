/* global window, localStorage */
/**
 * Nieuws — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `nieuws`.
 *  - Bij bootstrap fetcht deze module alle nieuws-items en cachet ze onder
 *    "nieuws_v1" zodat een tweede page-load instant data heeft.
 *  - Schrijfacties (add/update/archive/restore/delete) gaan async naar Supabase;
 *    de cache wordt geüpdatet en het update-event `besa:nieuws-updated`
 *    wordt gefired voor live re-renders.
 *  - Eénmalige migratie van legacy localStorage["newsItems"] naar Supabase
 *    bij eerste bootstrap na deploy.
 *
 * Gebruik:
 *   await window.nieuwsDB.ready;          // wacht op bootstrap
 *   var items = window.nieuwsDB.getAllSync();
 *   var saved = await window.nieuwsDB.add({ titel: "Test", inhoud: "<p>...</p>" });
 *   await window.nieuwsDB.archive(id);
 *   window.addEventListener("besa:nieuws-updated", function () { rerender(); });
 */
(function (global) {
  "use strict";

  var TABLE = "nieuws";
  var CACHE_KEY = "nieuws_v1";
  var LEGACY_KEY = "newsItems";
  var MIGRATION_FLAG = "nieuwsMigratedToSupabase.v1";

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
      global.dispatchEvent(new CustomEvent("besa:nieuws-updated", { detail: { source: source || "nieuws-data" } }));
    } catch (e) { /* */ }
  }

  // Legacy aanmaakdatum komt uit localStorage als "dd-mm-yyyy hh:mm"; converteer
  // naar ISO zodat Supabase het als timestamptz accepteert.
  function parseLegacyDateTime(str) {
    if (!str || typeof str !== "string") return null;
    var m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(str.trim());
    if (!m) return null;
    var d = new Date(
      Number(m[3]), Number(m[2]) - 1, Number(m[1]),
      Number(m[4]), Number(m[5])
    );
    return isFinite(d.getTime()) ? d.toISOString() : null;
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      titel: row.titel || "",
      status: row.status || "Published",
      auteur: row.auteur || "HR team",
      inhoud: row.inhoud || "",
      image: row.image || "",
      image2: row.image2 || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var aanmaak = safe.aanmaakdatum;
    if (typeof aanmaak === "string") {
      var parsed = parseLegacyDateTime(aanmaak);
      if (parsed) aanmaak = parsed;
    }
    var payload = {
      titel: String(safe.titel || ""),
      status: String(safe.status || "Published"),
      auteur: String(safe.auteur || "HR team"),
      inhoud: String(safe.inhoud || ""),
      image: safe.image ? String(safe.image) : null,
      image2: safe.image2 ? String(safe.image2) : null,
      archived: !!safe.archived,
    };
    if (aanmaak && typeof aanmaak === "string") payload.aanmaakdatum = aanmaak;
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
      .order("aanmaakdatum", { ascending: false });
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

      console.info("[nieuwsDB] Eenmalige migratie van " + legacy.length + " nieuwsberichten naar Supabase…");
      var payload = legacy.map(function (r) { return objToInsertPayload(r); });
      var ins = await global.besaSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[nieuwsDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      console.info("[nieuwsDB] Migratie geslaagd: " + (ins.data || []).length + " items naar Supabase.");
      return true;
    } catch (err) {
      console.error("[nieuwsDB] Migratiefout:", err);
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
        console.error("[nieuwsDB] Bootstrap mislukt:", err);
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

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

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

  global.nieuwsDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
