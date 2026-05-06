/* global window */
/**
 * incident-documenten-data.js — Supabase data-laag voor incident-bijlagen
 *
 * Tabel `public.incident_documenten` (zie supabase/schema.sql) houdt alleen
 * metadata + een `storage_path` naar de Storage bucket "incident-documenten".
 * Bestanden gaan onder pad:
 *
 *   <incident_id>/<doc_id>-<safe_file_name>
 *
 * In de cache zit `fileData` als publieke Storage-URL voor de UI.
 *
 * Spiegelt het patroon van medewerker-documenten-data.js. Gebruikt voor
 * het uitgebreide meldingsformulier (incident-melden.html), waar bijlagen
 * tijdens het invullen geüpload kunnen worden naar Storage. De koppeling
 * naar het uiteindelijke incident gaat via incident_id (uuid).
 *
 * Voor "nieuw incident in opbouw"-bijlagen (er is nog geen incident_id):
 *  - Bijlagen worden lokaal in geheugen bijgehouden tot de submit;
 *  - Pas bij submit wordt eerst het incident geschreven, dan elke bijlage
 *    met de echte incident_id.
 *
 * Public API:
 *  - incidentDocsDB.list(incidentId) → Promise<Array>
 *  - incidentDocsDB.listSync(incidentId) → Array
 *  - incidentDocsDB.add({incidentId, fileData, fileName, fileMime, naam})
 *  - incidentDocsDB.update(id, partial) → Promise<doc>
 *  - incidentDocsDB.archive(id) / restore(id) → Promise<doc>
 *  - incidentDocsDB.remove(id) → Promise<true>
 *  - incidentDocsDB.generateId() → "id_..."
 *
 * Events: "besa:incident-documenten-updated" met { incidentId } in detail.
 */
(function (global) {
  "use strict";

  var TABLE = "incident_documenten";
  var BUCKET = "incident-documenten";
  var CACHE_KEY = "incidentDocumenten";

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "id_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  function reportSilent(action, err) {
    try { console.error("[incidentDocsDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Incident-documenten — " + action, err);
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

  function buildStoragePath(incidentId, docId, fileName) {
    return String(incidentId) + "/" + String(docId) + "-" + safeFileName(fileName);
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

  function getPublicUrl(storagePath) {
    if (!storagePath || !global.besaSupabase) return "";
    try {
      var res = global.besaSupabase.storage.from(BUCKET).getPublicUrl(storagePath);
      if (res && res.data && res.data.publicUrl) return res.data.publicUrl;
    } catch (e) { /* */ }
    return "";
  }

  function uploadToStorage(path, blob, mime) {
    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.besaSupabase
      .storage.from(BUCKET)
      .upload(path, blob, {
        contentType: mime || "application/octet-stream",
        upsert: true,
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  function deleteFromStorage(path) {
    if (!path || !global.besaSupabase) return Promise.resolve();
    return global.besaSupabase.storage.from(BUCKET).remove([path]).then(function (res) {
      if (res.error) console.warn("[incidentDocsDB] storage remove warning:", res.error);
    });
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  function rowToObj(row) {
    if (!row) return null;
    var fileUrl = row.storage_path ? getPublicUrl(row.storage_path) : "";
    return {
      id: row.id,
      incidentId: row.incident_id,
      naam: row.naam || "",
      uploaddatum: row.uploaddatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || isoNow(),
      archived: !!row.archived,
      fileName: row.file_name || "",
      fileMime: row.file_mime || "",
      fileSize: row.file_size || 0,
      fileData: fileUrl,
      storagePath: row.storage_path || "",
    };
  }

  function metadataPayload(d) {
    return {
      id: d.id,
      incident_id: d.incidentId,
      naam: String(d.naam || "").trim(),
      archived: !!d.archived,
      file_name: String(d.fileName || ""),
      file_mime: String(d.fileMime || ""),
      file_size: Number(d.fileSize || 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------

  function readCache() {
    try {
      var raw = global.localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    try {
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) {
      console.warn("[incidentDocsDB] cache write mislukt:", e && e.message);
    }
  }

  function dispatchUpdated(incidentId) {
    try {
      global.dispatchEvent(new CustomEvent("besa:incident-documenten-updated", {
        detail: { incidentId: incidentId || null },
      }));
    } catch (e) { /* */ }
  }

  function cacheReplaceForIncident(incidentId, docs) {
    var all = readCache().filter(function (d) {
      return d && String(d.incidentId) !== String(incidentId);
    });
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
    var all = readCache().filter(function (d) {
      return d && String(d.id) !== String(id);
    });
    writeCache(all);
  }

  // ---------------------------------------------------------------------------
  // Supabase calls — tabel
  // ---------------------------------------------------------------------------

  function fetchByIncidentId(incidentId) {
    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.besaSupabase
      .from(TABLE).select("*")
      .eq("incident_id", incidentId)
      .order("uploaddatum", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(rowToObj).filter(Boolean);
      });
  }

  function insertRow(payload) {
    return global.besaSupabase
      .from(TABLE).insert(payload).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        return rowToObj(res.data);
      });
  }

  function updateRow(id, payload) {
    return global.besaSupabase
      .from(TABLE).update(payload).eq("id", id).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        return rowToObj(res.data);
      });
  }

  function deleteRow(id) {
    return global.besaSupabase
      .from(TABLE).delete().eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      });
  }

  // ---------------------------------------------------------------------------
  // High-level
  // ---------------------------------------------------------------------------

  function maybeUploadFile(incidentId, docId, fileDataUrl, fileName, fileMime) {
    if (!fileDataUrl || typeof fileDataUrl !== "string") return Promise.resolve({ storagePath: "" });
    if (fileDataUrl.indexOf("data:") !== 0) return Promise.resolve({ storagePath: "" });
    var parsed = dataUrlToBlob(fileDataUrl);
    if (!parsed) return Promise.resolve({ storagePath: "" });
    var path = buildStoragePath(incidentId, docId, fileName);
    return uploadToStorage(path, parsed.blob, fileMime || parsed.mime).then(function () {
      return { storagePath: path, mime: fileMime || parsed.mime };
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function listSync(incidentId) {
    return readCache().filter(function (d) {
      return d && String(d.incidentId) === String(incidentId);
    });
  }

  function list(incidentId) {
    return fetchByIncidentId(incidentId).then(function (docs) {
      cacheReplaceForIncident(incidentId, docs);
      dispatchUpdated(incidentId);
      return docs;
    });
  }

  function add(doc) {
    if (!doc || !doc.incidentId) return Promise.reject(new Error("incidentId verplicht"));
    var docId = doc.id || generateId();
    var fileDataUrl = doc.fileData || "";
    var fileName = doc.fileName || "";
    var fileMime = doc.fileMime || "";
    var fileSize = Number(doc.fileSize || 0);

    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));

    return maybeUploadFile(doc.incidentId, docId, fileDataUrl, fileName, fileMime)
      .then(function (uploadRes) {
        var payload = metadataPayload({
          id: docId,
          incidentId: doc.incidentId,
          naam: doc.naam || fileName,
          archived: !!doc.archived,
          fileName: fileName,
          fileMime: fileMime,
          fileSize: fileSize,
        });
        payload.storage_path = uploadRes.storagePath || null;
        return insertRow(payload);
      })
      .then(function (saved) {
        cacheUpsertOne(saved);
        dispatchUpdated(saved.incidentId);
        return saved;
      })
      .catch(function (err) {
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
    dispatchUpdated(merged.incidentId);

    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));

    var payload = metadataPayload(merged);
    delete payload.id; delete payload.incident_id;
    payload.storage_path = existing.storagePath || null;

    return updateRow(id, payload).then(function (saved) {
      cacheUpsertOne(saved);
      dispatchUpdated(saved.incidentId);
      return saved;
    }).catch(function (err) {
      reportSilent("bewerken", err);
      throw err;
    });
  }

  function archive(id) { return update(id, { archived: true }); }
  function restore(id) { return update(id, { archived: false }); }

  function remove(id) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    var incidentId = existing ? existing.incidentId : null;
    var storagePath = existing ? existing.storagePath : "";
    cacheRemoveOne(id);
    dispatchUpdated(incidentId);

    var deleteStorageStep = storagePath ? deleteFromStorage(storagePath) : Promise.resolve();
    return deleteStorageStep.then(function () {
      return deleteRow(id);
    }).catch(function (err) {
      reportSilent("verwijderen", err);
      throw err;
    });
  }

  global.incidentDocsDB = {
    list: list,
    listSync: listSync,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    remove: remove,
    generateId: generateId,
  };
})(typeof window !== "undefined" ? window : this);
