/* global window */
/**
 * medewerker-documenten-data.js — Supabase data-laag voor medewerker-bijlagen
 *
 * Tabel `public.medewerker_documenten` (zie supabase/schema.sql) houdt
 * alleen metadata + een `storage_path` naar de Supabase Storage bucket
 * "medewerker-documenten". Bestanden gaan naar Storage onder pad:
 *
 *   <medewerker_id>/<doc_id>-<safe_file_name>
 *
 * In de cache (en dus voor de UI) zit `fileData` als publieke Storage-URL.
 * Voor backwards-compat blijft het `file_data`-veld in de tabel bestaan:
 * bestaande rijen met base64 worden bij eerste sync naar Storage geüpload.
 *
 * Dit module spiegelt het patroon van client-documents-data.js — voor
 * details, zie de toelichting daar.
 *
 * Public API:
 *  - medewerkerDocsDB.list(medewerkerId) → Promise<Array>
 *  - medewerkerDocsDB.listSync(medewerkerId) → Array
 *  - medewerkerDocsDB.add(doc) → Promise<doc>
 *  - medewerkerDocsDB.update(id, partial) → Promise<doc>
 *  - medewerkerDocsDB.archive(id) / restore(id) → Promise<doc>
 *  - medewerkerDocsDB.remove(id) → Promise<true>
 *  - medewerkerDocsDB.maybeMigrateFromEmployee(emp) → Promise<number>
 *
 * Events: "besa:medewerker-documenten-updated" met { medewerkerId } in detail.
 */
(function (global) {
  "use strict";

  var TABLE = "medewerker_documenten";
  var BUCKET = "medewerker-documenten";
  var CACHE_KEY = "medewerkerDocumenten";
  var MIGRATION_FLAG_PREFIX = "medewerkerDocsMigratedV1.";
  var STORAGE_MIGRATION_FLAG = "medewerkerDocsMigratedToStorage.v1";

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "md_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
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

  function buildStoragePath(medewerkerId, docId, fileName) {
    return String(medewerkerId) + "/" + String(docId) + "-" + safeFileName(fileName);
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
    } catch (e) {
      return null;
    }
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
      .storage
      .from(BUCKET)
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
    return global.besaSupabase
      .storage
      .from(BUCKET)
      .remove([path])
      .then(function (res) {
        if (res.error) {
          console.warn("[medewerkerDocsDB] storage remove warning:", res.error);
        }
      });
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  function rowToObj(row) {
    if (!row) return null;
    var fileUrl = "";
    if (row.storage_path) {
      fileUrl = getPublicUrl(row.storage_path);
    } else if (row.file_data) {
      fileUrl = row.file_data;
    }
    return {
      id: row.id,
      medewerkerId: row.medewerker_id,
      naam: row.naam || "",
      type: row.type || "",
      vervaldatum: row.vervaldatum || "",
      uploaddatum: row.uploaddatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || isoNow(),
      archived: !!row.archived,
      fileName: row.file_name || "",
      fileMime: row.file_mime || "",
      fileData: fileUrl,
      storagePath: row.storage_path || "",
      _legacyBase64: row.file_data && !row.storage_path ? true : false,
    };
  }

  function metadataPayload(d) {
    return {
      id: d.id,
      medewerker_id: d.medewerkerId,
      naam: String(d.naam || "").trim(),
      type: String(d.type || ""),
      vervaldatum: String(d.vervaldatum || ""),
      archived: !!d.archived,
      file_name: String(d.fileName || ""),
      file_mime: String(d.fileMime || ""),
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
      console.warn("[medewerkerDocsDB] cache write mislukt:", e && e.message);
    }
  }

  function dispatchUpdated(medewerkerId) {
    try {
      global.dispatchEvent(new CustomEvent("besa:medewerker-documenten-updated", {
        detail: { medewerkerId: medewerkerId || null },
      }));
    } catch (e) { /* */ }
  }

  function cacheReplaceForEmployee(medewerkerId, docs) {
    var all = readCache().filter(function (d) {
      return d && String(d.medewerkerId) !== String(medewerkerId);
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

  function fetchByEmployeeId(medewerkerId) {
    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.besaSupabase
      .from(TABLE)
      .select("*")
      .eq("medewerker_id", medewerkerId)
      .order("uploaddatum", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(rowToObj).filter(Boolean);
      });
  }

  function insertRow(payload) {
    return global.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        return rowToObj(res.data);
      });
  }

  function updateRow(id, payload) {
    return global.besaSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        return rowToObj(res.data);
      });
  }

  function deleteRow(id) {
    return global.besaSupabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      });
  }

  // ---------------------------------------------------------------------------
  // High-level
  // ---------------------------------------------------------------------------

  function maybeUploadFile(medewerkerId, docId, fileDataUrl, fileName, fileMime) {
    if (!fileDataUrl || typeof fileDataUrl !== "string") return Promise.resolve({ storagePath: "" });
    if (fileDataUrl.indexOf("data:") !== 0) {
      return Promise.resolve({ storagePath: "" });
    }
    var parsed = dataUrlToBlob(fileDataUrl);
    if (!parsed) return Promise.resolve({ storagePath: "" });
    var path = buildStoragePath(medewerkerId, docId, fileName);
    return uploadToStorage(path, parsed.blob, fileMime || parsed.mime).then(function () {
      return { storagePath: path, mime: fileMime || parsed.mime };
    });
  }

  function migrateRowToStorageIfNeeded(row) {
    if (!row || !row.id) return Promise.resolve(false);
    if (!row._legacyBase64) return Promise.resolve(false);
    if (!row.fileData || row.fileData.indexOf("data:") !== 0) return Promise.resolve(false);

    return maybeUploadFile(row.medewerkerId, row.id, row.fileData, row.fileName, row.fileMime)
      .then(function (uploadRes) {
        if (!uploadRes.storagePath) return false;
        return global.besaSupabase
          .from(TABLE)
          .update({ storage_path: uploadRes.storagePath, file_data: "" })
          .eq("id", row.id)
          .select()
          .single()
          .then(function (res) {
            if (res.error) throw res.error;
            var updated = rowToObj(res.data);
            cacheUpsertOne(updated);
            dispatchUpdated(updated.medewerkerId);
            return true;
          });
      })
      .catch(function (err) {
        console.error("[medewerkerDocsDB] migrateRowToStorageIfNeeded mislukt voor " + row.id + ":", err);
        return false;
      });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function listSync(medewerkerId) {
    return readCache().filter(function (d) {
      return d && String(d.medewerkerId) === String(medewerkerId);
    });
  }

  function list(medewerkerId) {
    return fetchByEmployeeId(medewerkerId).then(function (docs) {
      cacheReplaceForEmployee(medewerkerId, docs);
      dispatchUpdated(medewerkerId);
      docs.forEach(function (d) {
        if (d._legacyBase64) {
          migrateRowToStorageIfNeeded(d);
        }
      });
      return docs;
    });
  }

  function add(doc) {
    if (!doc || !doc.medewerkerId) return Promise.reject(new Error("medewerkerId verplicht"));
    var docId = doc.id || generateId();
    var fileDataUrl = doc.fileData || "";
    var fileName = doc.fileName || "";
    var fileMime = doc.fileMime || "";

    var localDoc = {
      id: docId,
      medewerkerId: doc.medewerkerId,
      naam: doc.naam || "",
      type: doc.type || "",
      vervaldatum: doc.vervaldatum || "",
      uploaddatum: doc.uploaddatum || isoNow(),
      laatstGewijzigd: isoNow(),
      archived: !!doc.archived,
      fileName: fileName,
      fileMime: fileMime,
      fileData: fileDataUrl,
      storagePath: "",
      _legacyBase64: false,
    };
    cacheUpsertOne(localDoc);
    dispatchUpdated(localDoc.medewerkerId);

    if (!global.besaSupabase) {
      return Promise.reject(new Error("Supabase client niet geladen"));
    }

    return maybeUploadFile(doc.medewerkerId, docId, fileDataUrl, fileName, fileMime)
      .then(function (uploadRes) {
        var payload = metadataPayload(localDoc);
        payload.storage_path = uploadRes.storagePath || null;
        payload.file_data = "";
        return insertRow(payload);
      })
      .then(function (saved) {
        cacheUpsertOne(saved);
        dispatchUpdated(saved.medewerkerId);
        return saved;
      })
      .catch(function (err) {
        console.error("[medewerkerDocsDB] add sync mislukt:", err);
        cacheRemoveOne(docId);
        dispatchUpdated(localDoc.medewerkerId);
        throw err;
      });
  }

  function update(id, partial) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    if (!existing) return Promise.reject(new Error("Document niet gevonden in cache"));

    var newFileDataUrl = (partial && typeof partial.fileData === "string" && partial.fileData.indexOf("data:") === 0) ? partial.fileData : "";
    var merged = Object.assign({}, existing, partial || {}, {
      id: id,
      laatstGewijzigd: isoNow(),
    });
    cacheUpsertOne(merged);
    dispatchUpdated(merged.medewerkerId);

    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));

    var fileName = merged.fileName || (partial && partial.fileName) || existing.fileName || "";
    var fileMime = merged.fileMime || (partial && partial.fileMime) || existing.fileMime || "";

    var uploadStep;
    if (newFileDataUrl) {
      uploadStep = maybeUploadFile(merged.medewerkerId, id, newFileDataUrl, fileName, fileMime)
        .then(function (uploadRes) {
          if (uploadRes.storagePath && existing.storagePath && existing.storagePath !== uploadRes.storagePath) {
            return deleteFromStorage(existing.storagePath).then(function () { return uploadRes; });
          }
          return uploadRes;
        });
    } else {
      uploadStep = Promise.resolve({ storagePath: existing.storagePath || "" });
    }

    return uploadStep.then(function (uploadRes) {
      var payload = metadataPayload(merged);
      delete payload.id;
      delete payload.medewerker_id;
      payload.storage_path = uploadRes.storagePath || null;
      if (newFileDataUrl) payload.file_data = "";
      return updateRow(id, payload);
    }).then(function (saved) {
      cacheUpsertOne(saved);
      dispatchUpdated(saved.medewerkerId);
      return saved;
    }).catch(function (err) {
      console.error("[medewerkerDocsDB] update sync mislukt:", err);
      throw err;
    });
  }

  function archive(id) { return update(id, { archived: true }); }
  function restore(id) { return update(id, { archived: false }); }

  function remove(id) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    var medewerkerId = existing ? existing.medewerkerId : null;
    var storagePath = existing ? existing.storagePath : "";
    cacheRemoveOne(id);
    dispatchUpdated(medewerkerId);

    var deleteStorageStep = storagePath ? deleteFromStorage(storagePath) : Promise.resolve();
    return deleteStorageStep.then(function () {
      return deleteRow(id);
    }).catch(function (err) {
      console.error("[medewerkerDocsDB] delete sync mislukt:", err);
      throw err;
    });
  }

  // ---------------------------------------------------------------------------
  // Migratie van legacy emp.documenten / employeeEditsById[id].documenten
  // ---------------------------------------------------------------------------

  function maybeMigrateFromEmployee(emp) {
    if (!emp) return Promise.resolve(0);
    var empId = emp.empId || emp.id || emp.naam;
    if (!empId) return Promise.resolve(0);

    // Leg ook docs uit employeeEditsById samen met emp.documenten.
    var legacyDocs = [];
    if (Array.isArray(emp.documenten)) {
      legacyDocs = legacyDocs.concat(emp.documenten);
    } else {
      try {
        var allEdits = JSON.parse(global.localStorage.getItem("employeeEditsById") || "{}");
        var rec = allEdits[empId];
        if (rec && Array.isArray(rec.documenten)) {
          legacyDocs = legacyDocs.concat(rec.documenten);
        }
      } catch (e) { /* */ }
    }

    if (!legacyDocs.length) return Promise.resolve(0);

    var flag = MIGRATION_FLAG_PREFIX + empId;
    try {
      if (global.localStorage.getItem(flag) === "1") return Promise.resolve(0);
    } catch (e) { /* */ }

    if (!global.besaSupabase) return Promise.resolve(0);

    return fetchByEmployeeId(empId).then(function (existing) {
      if (existing && existing.length) {
        try { global.localStorage.setItem(flag, "1"); } catch (e) { /* */ }
        cacheReplaceForEmployee(empId, existing);
        dispatchUpdated(empId);
        return 0;
      }

      var promise = Promise.resolve();
      var migrated = 0;
      legacyDocs.forEach(function (d) {
        promise = promise.then(function () {
          return add({
            id: generateId(),
            medewerkerId: empId,
            naam: d.naam || "",
            type: d.type || "",
            vervaldatum: d.vervaldatum || "",
            uploaddatum: d.uploaddatum || "",
            archived: !!d.archived,
            fileName: d.fileName || "",
            fileMime: d.fileMime || "",
            fileData: d.fileData || "",
          }).then(function () {
            migrated += 1;
          }).catch(function (err) {
            console.warn("[medewerkerDocsDB] migratie skipped voor doc:", err);
          });
        });
      });

      return promise.then(function () {
        try { global.localStorage.setItem(flag, "1"); } catch (e) { /* */ }
        return migrated;
      });
    }).catch(function (err) {
      console.error("[medewerkerDocsDB] migratie mislukt voor medewerker " + empId + ":", err);
      return 0;
    });
  }

  function maybeMigrateCacheToStorage() {
    try {
      if (global.localStorage.getItem(STORAGE_MIGRATION_FLAG) === "1") return;
      global.localStorage.setItem(STORAGE_MIGRATION_FLAG, "1");
    } catch (e) { /* */ }
  }

  maybeMigrateCacheToStorage();

  global.medewerkerDocsDB = {
    list: list,
    listSync: listSync,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    remove: remove,
    maybeMigrateFromEmployee: maybeMigrateFromEmployee,
    generateId: generateId,
  };
})(typeof window !== "undefined" ? window : this);
