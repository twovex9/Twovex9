/* global window */
/**
 * verzuim-documenten-data.js — Supabase data-laag voor verzuim-bijlagen.
 *
 * Tabel `public.verzuim_documenten` houdt alleen metadata + een `storage_path`
 * naar de PRIVATE Storage-bucket "verzuim-documenten". Verzuimdocumenten bevatten
 * gezondheidsgegevens (AVG art. 9), dus:
 *   - de bucket is NIET publiek;
 *   - de UI haalt een tijdelijke signed URL op via getFileUrl(id) (10 min geldig);
 *   - SELECT op tabel én bucket is afgeschermd tot kantoorpersoneel (is_office_staff()).
 *
 * Bestanden gaan onder pad:  <verzuim_id>/<doc_id>-<safe_file_name>
 *
 * Spiegelt het patroon van incident-documenten-data.js, maar privé i.p.v.
 * publiek en met een in-memory bron-van-waarheid (_mem) zodat een volle
 * localStorage-quota de lijst niet leegmaakt terwijl de data wél in Supabase staat.
 *
 * Public API:
 *  - verzuimDocsDB.list(verzuimId) → Promise<Array>   (refetch + cache + event)
 *  - verzuimDocsDB.listSync(verzuimId) → Array
 *  - verzuimDocsDB.getAllSync() → Array
 *  - verzuimDocsDB.countSync(verzuimId) → number       (niet-gearchiveerd)
 *  - verzuimDocsDB.add({verzuimId, fileData, fileName, fileMime, fileSize, naam})
 *  - verzuimDocsDB.archive(id) / restore(id) → Promise<doc>
 *  - verzuimDocsDB.remove(id) → Promise<true>
 *  - verzuimDocsDB.getFileUrl(id) → Promise<signedUrl|null>
 *  - verzuimDocsDB.generateId() → "vzd_..."
 *
 * Events: "ff:verzuim-documenten-updated" met { verzuimId } in detail.
 */
(function (global) {
  "use strict";

  var TABLE = "verzuim_documenten";
  var BUCKET = "verzuim-documenten";
  var CACHE_KEY = "verzuimDocumenten";
  var SIGNED_TTL = 600; // seconden

  // In-memory bron-van-waarheid (DIEHARD): bij volle localStorage faalt setItem
  // stil; zonder _mem zouden sync-getters dan een lege lijst geven.
  var _mem = null;

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "vzd_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  function reportSilent(action, err) {
    try { console.error("[verzuimDocsDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Verzuim-documenten — " + action, err);
  }

  // ---------------------------------------------------------------------------
  // File / Storage helpers
  // ---------------------------------------------------------------------------
  function safeFileName(name) {
    var s = String(name || "bestand").trim();
    s = s.replace(/[^A-Za-z0-9._-]+/g, "_");
    if (!s) s = "bestand";
    if (s.length > 120) s = s.slice(0, 120);
    return s;
  }

  function buildStoragePath(verzuimId, docId, fileName) {
    return String(verzuimId) + "/" + String(docId) + "-" + safeFileName(fileName);
  }

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== "string") return null;
    var m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    var mime = m[1];
    var b64 = m[2];
    try {
      var bin = atob(b64);
      var len = bin.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
      return { blob: new Blob([bytes], { type: mime }), mime: mime };
    } catch (e) { return null; }
  }

  function uploadToStorage(path, blob, mime) {
    if (!global.ffSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.ffSupabase
      .storage.from(BUCKET)
      .upload(path, blob, { contentType: mime || "application/octet-stream", upsert: true })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  function deleteFromStorage(path) {
    if (!path || !global.ffSupabase) return Promise.resolve();
    return global.ffSupabase.storage.from(BUCKET).remove([path]).then(function (res) {
      if (res.error) console.warn("[verzuimDocsDB] storage remove warning:", res.error);
    });
  }

  function signedUrlForPath(path) {
    if (!path || !global.ffSupabase) return Promise.resolve(null);
    return global.ffSupabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data && (res.data.signedUrl || res.data.signedURL)) || null;
      })
      .catch(function (err) { reportSilent("getFileUrl", err); return null; });
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      verzuimId: row.verzuim_id,
      naam: row.naam || "",
      uploaddatum: row.uploaddatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || isoNow(),
      archived: !!row.archived,
      fileName: row.file_name || "",
      fileMime: row.file_mime || "",
      fileSize: row.file_size || 0,
      storagePath: row.storage_path || "",
    };
  }

  function metadataPayload(d) {
    return {
      id: d.id,
      verzuim_id: d.verzuimId,
      naam: String(d.naam || "").trim(),
      archived: !!d.archived,
      file_name: String(d.fileName || ""),
      file_mime: String(d.fileMime || ""),
      file_size: Number(d.fileSize || 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Cache (_mem primair, localStorage secundair)
  // ---------------------------------------------------------------------------
  function readCache() {
    if (_mem != null) return _mem;
    try {
      var raw = global.localStorage.getItem(CACHE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      _mem = Array.isArray(parsed) ? parsed : [];
    } catch (e) { _mem = []; }
    return _mem;
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota: _mem blijft bron */ }
  }

  function dispatchUpdated(verzuimId) {
    try {
      global.dispatchEvent(new CustomEvent("ff:verzuim-documenten-updated", {
        detail: { verzuimId: verzuimId || null },
      }));
    } catch (e) { /* */ }
  }

  function cacheReplaceForVerzuim(verzuimId, docs) {
    var all = readCache().filter(function (d) { return d && String(d.verzuimId) !== String(verzuimId); });
    Array.prototype.push.apply(all, docs);
    writeCache(all);
  }

  function cacheUpsertOne(doc) {
    if (!doc || !doc.id) return;
    var all = readCache();
    var idx = all.findIndex(function (d) { return d && String(d.id) === String(doc.id); });
    if (idx >= 0) all[idx] = doc; else all.push(doc);
    writeCache(all);
  }

  function cacheRemoveOne(id) {
    writeCache(readCache().filter(function (d) { return d && String(d.id) !== String(id); }));
  }

  // ---------------------------------------------------------------------------
  // Supabase calls
  // ---------------------------------------------------------------------------
  function fetchByVerzuimId(verzuimId) {
    if (!global.ffSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.ffSupabase
      .from(TABLE).select("*")
      .eq("verzuim_id", verzuimId)
      .order("uploaddatum", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(rowToObj).filter(Boolean);
      });
  }

  // Haal ALLE documenten op (over alle verzuimtrajecten) zodat het dashboard
  // per casus een documenttelling kan tonen zonder per casus te fetchen.
  function refreshAll() {
    if (!global.ffSupabase) return Promise.resolve(readCache());
    return global.ffSupabase
      .from(TABLE).select("*")
      .order("uploaddatum", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        var docs = (res.data || []).map(rowToObj).filter(Boolean);
        writeCache(docs);
        dispatchUpdated(null);
        return docs;
      })
      .catch(function (err) { reportSilent("refreshAll", err); return readCache(); });
  }

  function insertRow(payload) {
    return global.ffSupabase.from(TABLE).insert(payload).select().single()
      .then(function (res) { if (res.error) throw res.error; return rowToObj(res.data); });
  }

  function updateRow(id, payload) {
    return global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single()
      .then(function (res) { if (res.error) throw res.error; return rowToObj(res.data); });
  }

  function deleteRow(id) {
    return global.ffSupabase.from(TABLE).delete().eq("id", id)
      .then(function (res) { if (res.error) throw res.error; return true; });
  }

  // ---------------------------------------------------------------------------
  // High-level
  // ---------------------------------------------------------------------------
  function maybeUploadFile(verzuimId, docId, fileDataUrl, fileName, fileMime) {
    if (!fileDataUrl || typeof fileDataUrl !== "string") return Promise.resolve({ storagePath: "" });
    if (fileDataUrl.indexOf("data:") !== 0) return Promise.resolve({ storagePath: "" });
    var parsed = dataUrlToBlob(fileDataUrl);
    if (!parsed) return Promise.resolve({ storagePath: "" });
    var path = buildStoragePath(verzuimId, docId, fileName);
    return uploadToStorage(path, parsed.blob, fileMime || parsed.mime).then(function () {
      return { storagePath: path, mime: fileMime || parsed.mime };
    });
  }

  function docsContentEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    function sig(d) {
      return [d.id, d.naam, d.uploaddatum, d.laatstGewijzigd,
        d.archived ? 1 : 0, d.fileName, d.fileMime, d.storagePath].join("|");
    }
    var sa = a.map(sig).sort(), sb = b.map(sig).sort();
    for (var i = 0; i < sa.length; i++) { if (sa[i] !== sb[i]) return false; }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function getAllSync() { return readCache(); }

  function listSync(verzuimId) {
    return readCache().filter(function (d) { return d && String(d.verzuimId) === String(verzuimId); });
  }

  function countSync(verzuimId) {
    return listSync(verzuimId).filter(function (d) { return d && !d.archived; }).length;
  }

  function list(verzuimId) {
    return fetchByVerzuimId(verzuimId).then(function (docs) {
      // Dispatch ALLEEN bij echte wijziging (bron-guard, mirror #481): voorkomt
      // een onnodige refetch/re-render-loop bij elke read.
      var changed = !docsContentEqual(listSync(verzuimId), docs);
      cacheReplaceForVerzuim(verzuimId, docs);
      if (changed) dispatchUpdated(verzuimId);
      return docs;
    });
  }

  function add(doc) {
    if (!doc || !doc.verzuimId) return Promise.reject(new Error("verzuimId verplicht"));
    if (!global.ffSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    var docId = doc.id || generateId();
    var fileDataUrl = doc.fileData || "";
    var fileName = doc.fileName || "";
    var fileMime = doc.fileMime || "";
    var fileSize = Number(doc.fileSize || 0);

    var uploadedPath = "";
    return maybeUploadFile(doc.verzuimId, docId, fileDataUrl, fileName, fileMime)
      .then(function (uploadRes) {
        uploadedPath = uploadRes.storagePath || "";
        var payload = metadataPayload({
          id: docId,
          verzuimId: doc.verzuimId,
          naam: doc.naam || fileName,
          archived: !!doc.archived,
          fileName: fileName,
          fileMime: fileMime,
          fileSize: fileSize,
        });
        payload.storage_path = uploadedPath || null;
        return insertRow(payload);
      })
      .then(function (saved) {
        cacheUpsertOne(saved);
        dispatchUpdated(saved.verzuimId);
        return saved;
      })
      .catch(function (err) {
        // Metadata-insert faalde ná een geslaagde upload → ruim het weesbestand op.
        if (uploadedPath) { try { deleteFromStorage(uploadedPath); } catch (e) { /* */ } }
        reportSilent("toevoegen", err);
        throw err;
      });
  }

  function update(id, partial) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    if (!existing) return Promise.reject(new Error("Document niet gevonden in cache"));
    var merged = Object.assign({}, existing, partial || {}, { id: id, laatstGewijzigd: isoNow() });
    cacheUpsertOne(merged);
    dispatchUpdated(merged.verzuimId);
    if (!global.ffSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    var payload = metadataPayload(merged);
    delete payload.id; delete payload.verzuim_id;
    payload.storage_path = existing.storagePath || null;
    payload.laatst_gewijzigd = merged.laatstGewijzigd; // cache en DB gelijk houden
    return updateRow(id, payload).then(function (saved) {
      cacheUpsertOne(saved);
      dispatchUpdated(saved.verzuimId);
      return saved;
    }).catch(function (err) { reportSilent("bewerken", err); throw err; });
  }

  function archive(id) { return update(id, { archived: true }); }
  function restore(id) { return update(id, { archived: false }); }

  function remove(id) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    var verzuimId = existing ? existing.verzuimId : null;
    var storagePath = existing ? existing.storagePath : "";
    cacheRemoveOne(id);
    dispatchUpdated(verzuimId);
    // Verwijder eerst de DB-metadata; pas daarna het bestand. Faalt de DB-delete
    // (RLS/netwerk), dan blijven rij én bestand bestaan → geen "dode" verwijzing
    // naar een al verwijderd bestand.
    return deleteRow(id).then(function () {
      return storagePath ? deleteFromStorage(storagePath) : Promise.resolve();
    }).catch(function (err) { reportSilent("verwijderen", err); throw err; });
  }

  function getFileUrl(id) {
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    if (!existing || !existing.storagePath) return Promise.resolve(null);
    return signedUrlForPath(existing.storagePath);
  }

  global.verzuimDocsDB = {
    list: list,
    listSync: listSync,
    refreshAll: refreshAll,
    getAllSync: getAllSync,
    countSync: countSync,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    remove: remove,
    getFileUrl: getFileUrl,
    generateId: generateId,
  };
})(typeof window !== "undefined" ? window : this);
