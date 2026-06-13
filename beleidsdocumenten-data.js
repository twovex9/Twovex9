/* global window, localStorage */
/**
 * beleidsdocumenten-data.js — Supabase data-laag voor BS2-port "Beleid".
 *
 * Tabel `public.beleidsdocumenten` houdt metadata van beleidsstukken /
 * protocollen. Bestanden gaan naar Supabase Storage bucket
 * `beleidsdocumenten` (public) onder pad `<id>-<safe_file_name>`.
 *
 * Patroon: zelfde als `medewerker-documenten-data.js` maar globaal (geen
 * parent-id) en met integer-volgnummer voor handmatige sortering.
 *
 * Public API:
 *  - beleidsdocumentenDB.ready (Promise — wacht op bootstrap)
 *  - beleidsdocumentenDB.refresh() → Promise<Array>
 *  - beleidsdocumentenDB.getAllSync() → Array (gesorteerd op volgnummer asc)
 *  - beleidsdocumentenDB.getByIdSync(id) → Object|null
 *  - beleidsdocumentenDB.add({ naam, volgnummer, type, fileData?, fileName?, fileMime? }) → Promise<doc>
 *  - beleidsdocumentenDB.update(id, partial) → Promise<doc>
 *  - beleidsdocumentenDB.archive(id) / restore(id) → Promise<doc>
 *  - beleidsdocumentenDB.delete(id) → Promise<true>  -- ook bestand uit Storage
 *
 * Events: `ff:beleidsdocumenten-updated` (window) na elke mutatie/bootstrap.
 */
(function (global) {
  "use strict";

  var TABLE = "beleidsdocumenten";
  var BUCKET = "beleidsdocumenten";
  var CACHE_KEY = "beleidsdocumenten_v1";

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "bd_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  function safeFileName(name) {
    var s = String(name || "bestand").trim();
    s = s.replace(/[^A-Za-z0-9._-]+/g, "_");
    if (!s) s = "bestand";
    if (s.length > 120) s = s.slice(0, 120);
    return s;
  }

  function buildStoragePath(docId, fileName) {
    return String(docId) + "-" + safeFileName(fileName);
  }

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== "string") return null;
    var m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    try {
      var bin = atob(m[2]);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return { blob: new Blob([bytes], { type: m[1] }), mime: m[1] };
    } catch (e) { return null; }
  }

  function getPublicUrl(storagePath) {
    if (!storagePath || !global.ffSupabase) return "";
    try {
      var res = global.ffSupabase.storage.from(BUCKET).getPublicUrl(storagePath);
      if (res && res.data && res.data.publicUrl) return res.data.publicUrl;
    } catch (e) { /* */ }
    return "";
  }

  function uploadToStorage(path, blob, mime) {
    if (!global.ffSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.ffSupabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mime || "application/octet-stream",
      upsert: true,
    }).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  function deleteFromStorage(path) {
    if (!path || !global.ffSupabase) return Promise.resolve();
    return global.ffSupabase.storage.from(BUCKET).remove([path]).then(function (res) {
      if (res.error) console.warn("[beleidsdocumentenDB] storage remove warning:", res.error);
    });
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      volgnummer: row.volgnummer != null ? Number(row.volgnummer) : null,
      naam: row.naam || "",
      type: row.type || "",
      uploaddatum: row.uploaddatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.uploaddatum || isoNow(),
      archived: !!row.archived,
      fileName: row.file_name || "",
      fileMime: row.file_mime || "",
      fileSize: row.file_size || 0,
      storagePath: row.storage_path || "",
      fileUrl: row.storage_path ? getPublicUrl(row.storage_path) : "",
    };
  }

  function metadataPayload(d) {
    return {
      id: d.id,
      volgnummer: d.volgnummer != null ? Number(d.volgnummer) : null,
      naam: String(d.naam || "").trim(),
      type: String(d.type || ""),
      archived: !!d.archived,
      file_name: String(d.fileName || ""),
      file_mime: String(d.fileMime || ""),
      file_size: Number(d.fileSize || 0),
      storage_path: d.storagePath ? String(d.storagePath) : null,
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

  function sortedByVolgnummer(items) {
    return items.slice().sort(function (a, b) {
      var av = a && a.volgnummer != null ? Number(a.volgnummer) : 9999;
      var bv = b && b.volgnummer != null ? Number(b.volgnummer) : 9999;
      if (av !== bv) return av - bv;
      return String(a && a.naam || "").localeCompare(String(b && b.naam || ""));
    });
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:beleidsdocumenten-updated", { detail: { source: source || "data" } }));
    } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*")
      .order("volgnummer", { ascending: true });
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
        writeCache(sortedByVolgnummer(items));
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[beleidsdocumentenDB] Bootstrap mislukt:", err);
        if (global.ffReportSyncFailure) global.ffReportSyncFailure("Beleidsdocumenten — bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(sortedByVolgnummer(items));
    dispatchUpdated("refresh");
    return items;
  }

  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {});
    if (!doc.id) doc.id = generateId();
    doc.archived = !!doc.archived;

    if (doc.fileData) {
      var parsed = dataUrlToBlob(doc.fileData);
      if (!parsed) throw new Error("Ongeldig bestandsformaat (data-URL verwacht)");
      var path = buildStoragePath(doc.id, doc.fileName || "bestand");
      await uploadToStorage(path, parsed.blob, parsed.mime);
      doc.storagePath = path;
      doc.fileMime = parsed.mime;
      doc.fileSize = parsed.blob.size;
    }

    var payload = metadataPayload(doc);
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = sortedByVolgnummer(readCache().concat([obj]));
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});

    if (merged.fileData && typeof merged.fileData === "string" && merged.fileData.indexOf("data:") === 0) {
      var parsed = dataUrlToBlob(merged.fileData);
      if (!parsed) throw new Error("Ongeldig bestandsformaat (data-URL verwacht)");
      var path = buildStoragePath(merged.id, merged.fileName || existing.fileName || "bestand");
      await uploadToStorage(path, parsed.blob, parsed.mime);
      merged.storagePath = path;
      merged.fileMime = parsed.mime;
      merged.fileSize = parsed.blob.size;
    }

    var payload = metadataPayload(merged);
    delete payload.id;
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(sortedByVolgnummer(cache));
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var existing = getByIdSync(id);
    if (existing && existing.storagePath) {
      await deleteFromStorage(existing.storagePath);
    }
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
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

  global.beleidsdocumentenDB = {
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
