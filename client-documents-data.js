/* global window */
/**
 * client-documents-data.js — Supabase data-laag voor cliëntdocumenten
 *
 * Eigen tabel `client_documents` (zie supabase/schema.sql):
 *  - één rij per document (geen jsonb-blob op het cliënt-record)
 *  - file_data houdt het bestand als base64 data-URL
 *  - per-cliënt query via een index op client_id
 *
 * Architectuur (zelfde patroon als clienten-data.js):
 *  - Source of truth: Supabase tabel `client_documents`
 *  - localStorage onder key "clientDocuments" = read-cache (alle docs van alle
 *    cliënten samen, gegroepeerd per client_id bij read)
 *  - Schrijfacties: schrijven eerst lokaal in cache zodat de UI direct
 *    reageert, en daarna fire-and-forget naar Supabase. Bij succes wordt de
 *    cache verfijnd met de DB-respons.
 *  - Backwards-compat migratie: documenten die nog op `c.documenten` staan
 *    worden eenmalig per cliënt gemigreerd naar de nieuwe tabel zodra de
 *    Documenten-tab van die cliënt wordt geopend.
 *
 * Public API:
 *  - clientDocsDB.list(clientId) → Promise<Array>            (force refresh from DB)
 *  - clientDocsDB.listSync(clientId) → Array                  (uit cache)
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
  var CACHE_KEY = "clientDocuments";
  var MIGRATION_FLAG_PREFIX = "clientDocsMigratedV1.";

  function isoNow() {
    return new Date().toISOString();
  }

  function generateId() {
    return "cd_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------
  function rowToObj(row) {
    if (!row) return null;
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
      fileData: row.file_data || "",
    };
  }

  function objToInsertPayload(d) {
    return {
      id: d.id || generateId(),
      client_id: d.clientId,
      naam: String(d.naam || "").trim(),
      type: String(d.type || ""),
      vervaldatum: String(d.vervaldatum || ""),
      archived: !!d.archived,
      file_name: String(d.fileName || ""),
      file_mime: String(d.fileMime || ""),
      file_data: String(d.fileData || ""),
    };
  }

  function objToUpdatePayload(d) {
    var p = objToInsertPayload(d);
    delete p.id;
    delete p.client_id;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------
  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeCache(items) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) {
      // localStorage vol of bestand te groot; we behouden in-memory state
      console.warn("[clientDocsDB] cache write mislukt:", e && e.message);
    }
  }

  function dispatchUpdated(clientId) {
    try {
      window.dispatchEvent(new CustomEvent("besa:client-documents-updated", {
        detail: { clientId: clientId || null },
      }));
    } catch (e) {
      /* */
    }
  }

  // ---------------------------------------------------------------------------
  // Supabase calls
  // ---------------------------------------------------------------------------
  function fetchByClientId(clientId) {
    if (!window.besaSupabase) {
      return Promise.reject(new Error("Supabase client niet geladen"));
    }
    return window.besaSupabase
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
    if (!window.besaSupabase) {
      return Promise.reject(new Error("Supabase client niet geladen"));
    }
    return window.besaSupabase
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
    if (!window.besaSupabase) {
      return Promise.reject(new Error("Supabase client niet geladen"));
    }
    return window.besaSupabase
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
    if (!window.besaSupabase) {
      return Promise.reject(new Error("Supabase client niet geladen"));
    }
    return window.besaSupabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      });
  }

  // ---------------------------------------------------------------------------
  // Cache mutations
  // ---------------------------------------------------------------------------
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
    if (idx >= 0) all[idx] = doc;
    else all.push(doc);
    writeCache(all);
  }

  function cacheRemoveOne(id) {
    var all = readCache().filter(function (d) {
      return d && String(d.id) !== String(id);
    });
    writeCache(all);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function listSync(clientId) {
    return readCache().filter(function (d) {
      return d && String(d.clientId) === String(clientId);
    });
  }

  function list(clientId) {
    return fetchByClientId(clientId).then(function (docs) {
      cacheReplaceForClient(clientId, docs);
      dispatchUpdated(clientId);
      return docs;
    });
  }

  function add(doc) {
    var localDoc = {
      id: doc.id || generateId(),
      clientId: doc.clientId,
      naam: doc.naam || "",
      type: doc.type || "",
      vervaldatum: doc.vervaldatum || "",
      uploaddatum: doc.uploaddatum || isoNow(),
      laatstGewijzigd: isoNow(),
      archived: !!doc.archived,
      fileName: doc.fileName || "",
      fileMime: doc.fileMime || "",
      fileData: doc.fileData || "",
    };
    cacheUpsertOne(localDoc);
    dispatchUpdated(localDoc.clientId);

    var payload = objToInsertPayload(localDoc);
    return insertRow(payload).then(function (saved) {
      cacheUpsertOne(saved);
      dispatchUpdated(saved.clientId);
      return saved;
    }).catch(function (err) {
      console.error("[clientDocsDB] add sync mislukt:", err);
      // Lokaal blijft staan; bij volgende list() wordt het overschreven door DB.
      throw err;
    });
  }

  function update(id, partial) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    var merged = Object.assign({}, existing || {}, partial || {}, {
      id: id,
      laatstGewijzigd: isoNow(),
    });
    cacheUpsertOne(merged);
    dispatchUpdated(merged.clientId);

    var payload = objToUpdatePayload(merged);
    return updateRow(id, payload).then(function (saved) {
      cacheUpsertOne(saved);
      dispatchUpdated(saved.clientId);
      return saved;
    }).catch(function (err) {
      console.error("[clientDocsDB] update sync mislukt:", err);
      throw err;
    });
  }

  function archive(id) {
    return update(id, { archived: true });
  }

  function restore(id) {
    return update(id, { archived: false });
  }

  function remove(id) {
    if (!id) return Promise.reject(new Error("Geen id"));
    var existing = readCache().find(function (d) { return d && String(d.id) === String(id); });
    var clientId = existing ? existing.clientId : null;
    cacheRemoveOne(id);
    dispatchUpdated(clientId);
    return deleteRow(id).catch(function (err) {
      console.error("[clientDocsDB] delete sync mislukt:", err);
      throw err;
    });
  }

  // ---------------------------------------------------------------------------
  // Migratie van legacy c.documenten naar de eigen tabel
  // ---------------------------------------------------------------------------
  function maybeMigrateFromClient(client) {
    if (!client || !client.id) return Promise.resolve(0);
    if (!Array.isArray(client.documenten) || client.documenten.length === 0) {
      return Promise.resolve(0);
    }
    var flag = MIGRATION_FLAG_PREFIX + client.id;
    try {
      if (window.localStorage.getItem(flag) === "1") return Promise.resolve(0);
    } catch (e) { /* */ }

    if (!window.besaSupabase) {
      // Zonder Supabase kan migratie niet veilig; later proberen.
      return Promise.resolve(0);
    }

    return fetchByClientId(client.id).then(function (existing) {
      // Als er al docs in de tabel staan, gaan we niet meer migreren.
      if (existing && existing.length) {
        try { window.localStorage.setItem(flag, "1"); } catch (e) { /* */ }
        cacheReplaceForClient(client.id, existing);
        dispatchUpdated(client.id);
        return 0;
      }

      var inserts = client.documenten.map(function (d) {
        return objToInsertPayload({
          id: generateId(),
          clientId: client.id,
          naam: d.naam || "",
          type: d.type || "",
          vervaldatum: d.vervaldatum || "",
          archived: !!d.archived,
          fileName: d.fileName || "",
          fileMime: d.fileMime || "",
          fileData: d.fileData || "",
        });
      });

      return window.besaSupabase
        .from(TABLE)
        .insert(inserts)
        .select()
        .then(function (res) {
          if (res.error) throw res.error;
          var saved = (res.data || []).map(rowToObj).filter(Boolean);
          cacheReplaceForClient(client.id, saved);
          try { window.localStorage.setItem(flag, "1"); } catch (e) { /* */ }
          dispatchUpdated(client.id);
          return saved.length;
        });
    }).catch(function (err) {
      console.error("[clientDocsDB] migratie mislukt voor cliënt " + client.id + ":", err);
      return 0;
    });
  }

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
