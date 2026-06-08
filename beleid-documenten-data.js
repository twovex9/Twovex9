/* global window, localStorage */
/**
 * beleid-documenten-data.js — Supabase data-laag voor de TOP-BAR "Beleid"
 * (BS2 PRODUCTIE /documents → /api/documents policy).
 *
 * APART systeem, los van de bestaande `beleidsdocumenten`/`beleid.html`
 * (die blijven onaangeroerd). Tabel `public.beleid_documenten` (uuid PK =
 * BS2 document-id), Storage-bucket `beleid-documenten` (publiek).
 * Source-of-truth = Supabase. Cache in localStorage["beleid_documenten_v1"].
 *
 * Public API (window.beleidDocumentenDB):
 *  - ready / refresh() / getAllSync() / getByIdSync(id)
 *  - getRawBs2(id) → Promise (on-demand volledige BS2-raw)
 *  - getFileUrl(id) → Promise<string|null> (publieke URL)
 *  - add / update / archive / restore / delete
 * Event: `besa:beleid-documenten-updated`. DATA-SLIM `_mem`.
 */
(function (global) {
  "use strict";

  var TABLE = "beleid_documenten";
  var BUCKET = "beleid-documenten";
  var CACHE_KEY = "beleid_documenten_v1";
  var SLIM_COLS = "id,name,type,expiration_date,contract_type,is_flexible," +
    "flexible_type,flexible_min,flexible_max,contract_end_date,bs2_created_at," +
    "bs2_updated_at,bs2_deleted_at,file_id,file_name,file_extension,file_path," +
    "file_size,storage_path,archived,aanmaakdatum,laatst_gewijzigd";

  function isoNow() { return new Date().toISOString(); }
  function genId() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name || "",
      type: row.type || null,
      uploaddatum: row.bs2_created_at || row.aanmaakdatum || null,
      laatstGewijzigd: row.bs2_updated_at || row.laatst_gewijzigd || null,
      fileName: row.file_name || "",
      fileExtension: row.file_extension || "",
      fileSize: row.file_size == null ? null : row.file_size,
      storagePath: row.storage_path || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var s = o || {}, p = {};
    if (s.name !== undefined) p.name = String(s.name || "");
    if (s.type !== undefined) p.type = s.type || null;
    if (s.archived !== undefined) p.archived = !!s.archived;
    if (s.storagePath !== undefined) p.storage_path = s.storagePath || null;
    if (s.fileName !== undefined) p.file_name = s.fileName || null;
    if (s.fileExtension !== undefined) p.file_extension = s.fileExtension || null;
    if (s.fileSize !== undefined) p.file_size = s.fileSize == null ? null : +s.fileSize;
    return p;
  }

  // DATA-SLIM: in-memory bron; localStorage = best-effort cache.
  var _mem = null;
  function readCache() {
    if (_mem !== null) return _mem;
    try { var raw = localStorage.getItem(CACHE_KEY); if (!raw) return []; var p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch (e) { return []; }
  }
  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota — _mem is bron */ }
  }

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      var an = String(a.name || "").toLowerCase(), bn = String(b.name || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  }

  function dispatchUpdated(src) {
    try { global.dispatchEvent(new CustomEvent("besa:beleid-documenten-updated", { detail: { source: src || "data" } })); } catch (e) {}
  }
  function reportSilent(action, err) {
    console.error("[beleidDocumentenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Beleid — " + action, err);
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select(SLIM_COLS);
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try { writeCache(sortItems(await fetchAll())); dispatchUpdated("bootstrap"); }
      catch (err) { reportSilent("bootstrap", err); }
    })();
    return readyPromise;
  }
  async function refresh() { var items = await fetchAll(); writeCache(sortItems(items)); dispatchUpdated("refresh"); return items; }
  function getAllSync() { return readCache(); }
  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id), f = readCache().find(function (r) { return r && String(r.id) === s; });
    return f ? Object.assign({}, f) : null;
  }

  async function getRawBs2(id) {
    if (!global.besaSupabase || id == null) return null;
    try {
      var res = await global.besaSupabase.from(TABLE).select("data").eq("id", id).single();
      if (res.error) throw res.error;
      var d = res.data && res.data.data;
      return (d && (d.bs2_scrape || d)) || null;
    } catch (err) { reportSilent("getRawBs2", err); return null; }
  }

  // Publieke bucket → publieke URL voor bekijken/downloaden.
  // De bucket 'beleid-documenten' staat public=true (net als client-documents /
  // medewerker-documenten). getPublicUrl heeft geen RLS-leesrecht of sessie
  // nodig; createSignedUrl zou dat wél vereisen en faalde met "Object not
  // found" omdat er geen storage-SELECT-policy voor deze bucket was.
  async function getFileUrl(id) {
    if (!global.besaSupabase || id == null) return null;
    var row = getByIdSync(id);
    if (!row || !row.storagePath) return null;
    try {
      var res = global.besaSupabase.storage.from(BUCKET).getPublicUrl(row.storagePath);
      return (res && res.data && res.data.publicUrl) || null;
    } catch (err) { reportSilent("getFileUrl", err); return null; }
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {}), payload = objToPayload(doc);
    payload.id = doc.id || genId();
    payload.archived = !!doc.archived;
    var res = await global.besaSupabase.from(TABLE).insert(payload).select(SLIM_COLS).single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(sortItems(readCache().concat([obj]))); dispatchUpdated("add");
    return obj;
  }
  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var payload = objToPayload(partial || {}); delete payload.id;
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select(SLIM_COLS).single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data), cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(sortItems(cache)); dispatchUpdated("update");
    return obj;
  }
  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }
  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var row = getByIdSync(id);
    if (row && row.storagePath) {
      try { await global.besaSupabase.storage.from(BUCKET).remove([row.storagePath]); } catch (e) { /* best-effort */ }
    }
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(readCache().filter(function (r) { return r && String(r.id) !== String(id); }));
    dispatchUpdated("remove");
    return true;
  }

  global.beleidDocumentenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh, fetchAll: fetchAll,
    getAllSync: getAllSync, getByIdSync: getByIdSync,
    getRawBs2: getRawBs2, getFileUrl: getFileUrl,
    add: add, update: update, archive: archive, restore: restore, delete: remove,
  };
  bootstrap();
})(typeof window !== "undefined" ? window : this);
