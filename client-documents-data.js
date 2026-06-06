/* global window */
/**
 * client-documents-data.js — Supabase data-laag voor cliëntdocumenten
 *
 * Tabel `public.client_documents` (zie supabase/schema.sql) houdt alleen
 * metadata + een `storage_path` naar de Supabase Storage bucket
 * "client-documents". Bestanden worden in Storage opgeslagen onder pad:
 *
 *   <client_id>/<doc_id>-<safe_file_name>
 *
 * In de cache (en dus voor de UI) zit `fileData` als publieke Storage-URL —
 * de UI gebruikt die URL gewoon als <img src="..."> of <a href="..."> en
 * hoeft niets te weten van Storage. Voor backwards-compat blijft het
 * `file_data`-veld in de tabel bestaan: bestaande rijen met base64 in
 * file_data worden bij eerste sync naar Storage geüpload en file_data
 * wordt daarna gewist.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel + Storage bucket samen.
 *  - localStorage onder "clientDocuments" = read-cache (alle docs van alle
 *    cliënten samen, gegroepeerd per client_id bij read).
 *  - Schrijfacties: schrijven optimistisch in cache zodat de UI direct
 *    reageert, daarna fire-and-forget naar Supabase. Bij succes wordt de
 *    cache verfijnd met de DB-respons (incl. echte Storage-URL).
 *  - Backwards-compat migratie: documenten die nog op `c.documenten`
 *    (legacy localStorage) staan worden eenmalig per cliënt gemigreerd
 *    naar Storage + tabel zodra de Documenten-tab van die cliënt opent.
 *
 * Public API (ongewijzigd t.o.v. de oude versie):
 *  - clientDocsDB.list(clientId) → Promise<Array>      (force refresh from DB)
 *  - clientDocsDB.listSync(clientId) → Array            (uit cache)
 *  - clientDocsDB.add(doc) → Promise<doc>
 *  - clientDocsDB.update(id, partial) → Promise<doc>
 *  - clientDocsDB.archive(id) / restore(id) → Promise<doc>
 *  - clientDocsDB.remove(id) → Promise<true>
 *  - clientDocsDB.maybeMigrateFromClient(client) → Promise<number>
 *
 * Events: "besa:client-documents-updated" met { clientId } in detail.
 */
(function (global) {
  "use strict";

  var TABLE = "client_documents";
  var BUCKET = "client-documents";
  var CACHE_KEY = "clientDocuments";
  var MIGRATION_FLAG_PREFIX = "clientDocsMigratedV1.";
  var STORAGE_MIGRATION_FLAG = "clientDocsMigratedToStorage.v1";

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "cd_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  // ---------------------------------------------------------------------------
  // File / Storage helpers
  // ---------------------------------------------------------------------------

  // Maak een bestandsnaam veilig voor Storage-paden: alleen alphanumeric,
  // dot, hyphen en underscore. Spaties en exotische tekens worden _.
  function safeFileName(name) {
    var s = String(name || "bestand").trim();
    s = s.replace(/[^A-Za-z0-9._-]+/g, "_");
    if (!s) s = "bestand";
    if (s.length > 120) s = s.slice(0, 120);
    return s;
  }

  function buildStoragePath(clientId, docId, fileName) {
    return String(clientId) + "/" + String(docId) + "-" + safeFileName(fileName);
  }

  // Decodeer "data:<mime>;base64,<payload>" naar { blob, mime }.
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
      // De client geeft { data: { publicUrl } } terug.
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
          // Geen fatale fout — bestand kan al weg zijn. Log en ga door.
          console.warn("[clientDocsDB] storage remove warning:", res.error);
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
      // Nog niet gemigreerde rij: gebruik base64 fallback. Wordt bij eerste
      // gelegenheid via migrateRowToStorageIfNeeded geüpload.
      fileUrl = row.file_data;
    }
    return {
      id: row.id,
      clientId: row.client_id,
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
      // Voor migratie: of er nog base64 in DB staat (alleen voor interne
      // logica, niet voor de UI).
      _legacyBase64: row.file_data && !row.storage_path ? true : false,
    };
  }

  // metadata-only payload (zonder file_data of storage_path).
  function metadataPayload(d) {
    return {
      id: d.id,
      client_id: d.clientId,
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

  // In-memory cache is ALTIJD de canonieke bron na bootstrap (volledige data,
  // incl. eventuele legacy base64 fileData). localStorage is enkel een
  // snelle-boot-kopie en kan stil falen bij volle quota — dan blijft `_mem`
  // de betrouwbare bron (quota-proof). Zie quota-fix medewerkers/werkuren.
  var _mem = null;

  // Strip zware legacy base64-payloads ALLEEN uit de localStorage-kopie
  // (niet uit `_mem` en niet uit de DB-payload): elke `fileData` of waarde
  // die begint met "data:" wordt geleegd zodat de quota niet onnodig
  // volloopt. `_mem` houdt het volledige object.
  function isDataUrl(v) {
    return typeof v === "string" && v.indexOf("data:") === 0;
  }
  function slimForCache(items) {
    return (Array.isArray(items) ? items : []).map(function (r) {
      if (!r || typeof r !== "object") return r;
      var c = Object.assign({}, r);
      if (isDataUrl(c.fileData)) c.fileData = "";
      return c;
    });
  }

  function readCache() {
    // _mem wint altijd — heeft de volledige data (incl. legacy base64)
    if (_mem != null) return _mem;
    try {
      var raw = global.localStorage.getItem(CACHE_KEY);
      if (!raw) { _mem = []; return _mem; }
      var parsed = JSON.parse(raw);
      _mem = Array.isArray(parsed) ? parsed : [];
      return _mem;
    } catch (e) { _mem = []; return _mem; }
  }

  function writeCache(items) {
    var safe = Array.isArray(items) ? items : [];
    // 1) IN-MEMORY: altijd volledig (geen quota-risico)
    _mem = safe;
    // 2) localStorage: geslankte kopie (zonder base64 data: URLs) voor snelle boot
    try {
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(slimForCache(safe)));
    } catch (e) {
      console.warn("[clientDocsDB] cache write mislukt:", e && e.message);
    }
  }

  function dispatchUpdated(clientId) {
    try {
      global.dispatchEvent(new CustomEvent("besa:client-documents-updated", {
        detail: { clientId: clientId || null },
      }));
    } catch (e) { /* */ }
  }

  function cacheReplaceForClient(clientId, docs) {
    var all = readCache().filter(function (d) {
      return d && String(d.clientId) !== String(clientId);
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

  function fetchByClientId(clientId) {
    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));
    return global.besaSupabase
      .from(TABLE)
      .select("*")
      .eq("client_id", clientId)
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
  // High-level: row + bestand opslaan
  // ---------------------------------------------------------------------------

  // Als fileDataUrl een data: URL is, upload het naar Storage, en geef
  // { storagePath, mime } terug. Anders { storagePath: "" }.
  function maybeUploadFile(clientId, docId, fileDataUrl, fileName, fileMime) {
    if (!fileDataUrl || typeof fileDataUrl !== "string") return Promise.resolve({ storagePath: "" });
    if (fileDataUrl.indexOf("data:") !== 0) {
      // Het is al een URL (bijv. cache-fallback) — niet opnieuw uploaden.
      return Promise.resolve({ storagePath: "" });
    }
    var parsed = dataUrlToBlob(fileDataUrl);
    if (!parsed) return Promise.resolve({ storagePath: "" });
    var path = buildStoragePath(clientId, docId, fileName);
    return uploadToStorage(path, parsed.blob, fileMime || parsed.mime).then(function () {
      return { storagePath: path, mime: fileMime || parsed.mime };
    });
  }

  // ---------------------------------------------------------------------------
  // Migratie van losse rijen die nog file_data hebben (base64) → Storage.
  // ---------------------------------------------------------------------------

  function migrateRowToStorageIfNeeded(row) {
    if (!row || !row.id) return Promise.resolve(false);
    if (!row._legacyBase64) return Promise.resolve(false);
    if (!row.fileData || row.fileData.indexOf("data:") !== 0) return Promise.resolve(false);

    return maybeUploadFile(row.clientId, row.id, row.fileData, row.fileName, row.fileMime)
      .then(function (uploadRes) {
        if (!uploadRes.storagePath) return false;
        // Update DB: zet storage_path en wis file_data.
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
            dispatchUpdated(updated.clientId);
            return true;
          });
      })
      .catch(function (err) {
        console.error("[clientDocsDB] migrateRowToStorageIfNeeded mislukt voor " + row.id + ":", err);
        return false;
      });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function listSync(clientId) {
    return readCache().filter(function (d) {
      return d && String(d.clientId) === String(clientId);
    });
  }

  function docsContentEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    function sig(d) {
      return [d.id, d.naam, d.type, d.vervaldatum, d.uploaddatum, d.laatstGewijzigd,
        d.archived ? 1 : 0, d.fileName, d.fileMime, d.storagePath, d.storage_path].join("|");
    }
    var sa = a.map(sig).sort(), sb = b.map(sig).sort();
    for (var i = 0; i < sa.length; i++) { if (sa[i] !== sb[i]) return false; }
    return true;
  }

  function list(clientId) {
    return fetchByClientId(clientId).then(function (docs) {
      // Dispatch ALLEEN bij een echte wijziging (bron-guard, mirror van #481): een
      // onvoorwaardelijke dispatch bij élke read voedt refetch/re-render-loops bij een
      // consument die op dit event opnieuw list()/rendert (scroll-jump-anti-patroon).
      var changed = !docsContentEqual(listSync(clientId), docs);
      cacheReplaceForClient(clientId, docs);
      if (changed) dispatchUpdated(clientId);
      // Migreer eventuele legacy base64-rijen op de achtergrond. Dit is
      // best-effort en blokkeert de UI niet.
      docs.forEach(function (d) {
        if (d._legacyBase64) {
          migrateRowToStorageIfNeeded(d);
        }
      });
      return docs;
    });
  }

  function add(doc) {
    if (!doc || !doc.clientId) return Promise.reject(new Error("clientId verplicht"));
    var docId = doc.id || generateId();
    var fileDataUrl = doc.fileData || "";
    var fileName = doc.fileName || "";
    var fileMime = doc.fileMime || "";

    // Optimistic insert in cache (met data URL als fileData zodat de UI
    // direct kan tonen).
    var localDoc = {
      id: docId,
      clientId: doc.clientId,
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
    dispatchUpdated(localDoc.clientId);

    if (!global.besaSupabase) {
      return Promise.reject(new Error("Supabase client niet geladen"));
    }

    // 1) Upload bestand (als er een is) → 2) INSERT row met storage_path.
    return maybeUploadFile(doc.clientId, docId, fileDataUrl, fileName, fileMime)
      .then(function (uploadRes) {
        var payload = metadataPayload(localDoc);
        payload.storage_path = uploadRes.storagePath || null;
        // Geen file_data meer in DB voor nieuwe rijen.
        payload.file_data = "";
        return insertRow(payload);
      })
      .then(function (saved) {
        cacheUpsertOne(saved);
        dispatchUpdated(saved.clientId);
        return saved;
      })
      .catch(function (err) {
        console.error("[clientDocsDB] add sync mislukt:", err);
        // Lokaal blijft staan; bij volgende list() wordt het overschreven
        // door DB. Roll back de optimistic insert om weeshuis-state te
        // voorkomen.
        cacheRemoveOne(docId);
        dispatchUpdated(localDoc.clientId);
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
    dispatchUpdated(merged.clientId);

    if (!global.besaSupabase) return Promise.reject(new Error("Supabase client niet geladen"));

    var fileName = merged.fileName || (partial && partial.fileName) || existing.fileName || "";
    var fileMime = merged.fileMime || (partial && partial.fileMime) || existing.fileMime || "";

    var uploadStep;
    if (newFileDataUrl) {
      // Nieuwe file → upload, oude verwijderen.
      uploadStep = maybeUploadFile(merged.clientId, id, newFileDataUrl, fileName, fileMime)
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
      delete payload.client_id;
      payload.storage_path = uploadRes.storagePath || null;
      // Bij nieuwe upload wissen we file_data; bij metadata-only update
      // laten we het ongemoeid (geen field in payload = geen update).
      if (newFileDataUrl) payload.file_data = "";
      return updateRow(id, payload);
    }).then(function (saved) {
      cacheUpsertOne(saved);
      dispatchUpdated(saved.clientId);
      return saved;
    }).catch(function (err) {
      console.error("[clientDocsDB] update sync mislukt:", err);
      throw err;
    });
  }

  function archive(id) { return update(id, { archived: true }); }
  function restore(id) { return update(id, { archived: false }); }

  function remove(id) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    var clientId = existing ? existing.clientId : null;
    var storagePath = existing ? existing.storagePath : "";
    cacheRemoveOne(id);
    dispatchUpdated(clientId);

    var deleteStorageStep = storagePath ? deleteFromStorage(storagePath) : Promise.resolve();
    return deleteStorageStep.then(function () {
      return deleteRow(id);
    }).catch(function (err) {
      console.error("[clientDocsDB] delete sync mislukt:", err);
      throw err;
    });
  }

  // ---------------------------------------------------------------------------
  // Migratie van legacy c.documenten (op het cliënt-record) naar de tabel +
  // Storage. add() doet automatisch de Storage-upload, dus we hergebruiken
  // het reguliere add()-pad.
  // ---------------------------------------------------------------------------

  function maybeMigrateFromClient(client) {
    if (!client || !client.id) return Promise.resolve(0);
    if (!Array.isArray(client.documenten) || client.documenten.length === 0) {
      return Promise.resolve(0);
    }
    var flag = MIGRATION_FLAG_PREFIX + client.id;
    try {
      if (global.localStorage.getItem(flag) === "1") return Promise.resolve(0);
    } catch (e) { /* */ }

    if (!global.besaSupabase) return Promise.resolve(0);

    return fetchByClientId(client.id).then(function (existing) {
      // Als er al docs in de tabel staan, gaan we niet meer migreren.
      if (existing && existing.length) {
        try { global.localStorage.setItem(flag, "1"); } catch (e) { /* */ }
        cacheReplaceForClient(client.id, existing);
        dispatchUpdated(client.id);
        return 0;
      }

      // Sequentieel migreren via add() zodat elke file netjes naar Storage
      // gaat. We doen ze in serie i.p.v. parallel om de browser/Storage
      // niet te overbelasten bij grote document-sets.
      var promise = Promise.resolve();
      var migrated = 0;
      client.documenten.forEach(function (d) {
        promise = promise.then(function () {
          return add({
            id: generateId(),
            clientId: client.id,
            naam: d.naam || "",
            type: d.type || "",
            vervaldatum: d.vervaldatum || "",
            archived: !!d.archived,
            fileName: d.fileName || "",
            fileMime: d.fileMime || "",
            fileData: d.fileData || "",
          }).then(function () {
            migrated += 1;
          }).catch(function (err) {
            console.warn("[clientDocsDB] migratie skipped voor doc:", err);
          });
        });
      });

      return promise.then(function () {
        try { global.localStorage.setItem(flag, "1"); } catch (e) { /* */ }
        return migrated;
      });
    }).catch(function (err) {
      console.error("[clientDocsDB] migratie mislukt voor cliënt " + client.id + ":", err);
      return 0;
    });
  }

  // ---------------------------------------------------------------------------
  // Cache-only legacy migratie: als er nog rijen in localStorage["clientDocuments"]
  // zitten met fileData = data: URL, betekent dit dat een vorige sessie
  // base64 in de cache had voordat Storage er was. Bij eerste DB-fetch
  // zullen ze worden vervangen, maar voor pages die nooit list() doen
  // (theoretisch), draaien we hier een eenmalige sweep.
  // ---------------------------------------------------------------------------

  function maybeMigrateCacheToStorage() {
    try {
      if (global.localStorage.getItem(STORAGE_MIGRATION_FLAG) === "1") return;
    } catch (e) { /* */ }
    var stale = readCache().filter(function (d) {
      return d && d.fileData && typeof d.fileData === "string" && d.fileData.indexOf("data:") === 0 && !d.storagePath;
    });
    if (!stale.length) {
      try { global.localStorage.setItem(STORAGE_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      return;
    }
    // Echte migratie gebeurt vanzelf via add() / list() voor data die in
    // de DB komt. Voor cache-only data zonder DB-rij doen we niets — die
    // worden bij volgende add() opnieuw opgeslagen.
    try { global.localStorage.setItem(STORAGE_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
  }

  maybeMigrateCacheToStorage();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  global.clientDocsDB = {
    list: list,
    listSync: listSync,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    remove: remove,
    maybeMigrateFromClient: maybeMigrateFromClient,
    generateId: generateId,
  };
})(typeof window !== "undefined" ? window : this);
