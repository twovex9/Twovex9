/* global window, localStorage */
/**
 * sharepoint-data.js — data-laag voor de interne "SharePoint" documentbibliotheek.
 *
 * Centrale, mappen-gebaseerde documentopslag (vergaderingen, locaties, beleid,
 * directie, management, …). APART van de bestaande platte "Beleid"-tab
 * (beleid_documenten) en van client/medewerker/incident-documenten.
 *
 * Twee tabellen + één privé Storage-bucket:
 *   - public.sharepoint_mappen     (hiërarchisch via parent_id; toegestane_rollen jsonb)
 *   - public.sharepoint_bestanden  (map_id → map; storage_path → bucket)
 *   - storage bucket "sharepoint"  (privé → signed URL, 10 min)
 *
 * Toegang (RLS): alleen kantoor (is_office_staff); per map verder te beperken
 * tot bepaalde rollen. Zie sp_folder_visible() in de DB.
 *
 * Source-of-truth = Supabase. _mem = in-memory bron; localStorage = best-effort
 * cache (DATA-SLIM). Géén full-overwrite push → geen DIEHARD delete-risico:
 * alle mutaties zijn gericht (add/update/delete op één rij).
 *
 * Public API (window.sharepointDB):
 *   ready / refresh()
 *   Mappen:    getMappenSync() · getMapByIdSync(id) · getChildMappenSync(parentId)
 *              addMap(rec) · updateMap(id, partial) · archiveMap(id) · deleteMap(id)
 *   Bestanden: getBestandenSync(mapId) · getBestandByIdSync(id)
 *              uploadBestand(file, mapId) · updateBestand(id, partial)
 *              replaceFile(id, file) · deleteBestand(id) · getFileUrl(id)
 * Event: `ff:sharepoint-updated`.
 */
(function (global) {
  "use strict";

  var T_MAP = "sharepoint_mappen";
  var T_FILE = "sharepoint_bestanden";
  var BUCKET = "sharepoint";
  var CACHE_MAP = "sharepoint_mappen_v1";
  var CACHE_FILE = "sharepoint_bestanden_v1";
  var PAGE = 1000; // PostgREST cap per request → pagineren

  function isoNow() { return new Date().toISOString(); }
  function genId() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function safeName(n) { return String(n || "bestand").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim() || "bestand"; }
  function extOf(n) { return (String(n || "").match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase(); }

  // ---- mappers -------------------------------------------------------------
  function mapRowToObj(row) {
    if (!row) return null;
    var roles = row.toegestane_rollen;
    if (!Array.isArray(roles)) { try { roles = JSON.parse(roles); } catch (e) { roles = []; } }
    if (!Array.isArray(roles)) roles = [];
    return {
      id: row.id,
      parentId: row.parent_id || null,
      naam: row.naam || "",
      beschrijving: row.beschrijving || "",
      icon: row.icon || "",
      kleur: row.kleur || "",
      toegestaneRollen: roles,
      sort: row.sort == null ? 0 : +row.sort,
      archived: !!row.archived,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
  }
  function mapObjToPayload(o) {
    var s = o || {}, p = {};
    if (s.parentId !== undefined) p.parent_id = s.parentId || null;
    if (s.naam !== undefined) p.naam = String(s.naam || "").trim();
    if (s.beschrijving !== undefined) p.beschrijving = s.beschrijving || null;
    if (s.icon !== undefined) p.icon = s.icon || null;
    if (s.kleur !== undefined) p.kleur = s.kleur || null;
    if (s.toegestaneRollen !== undefined) p.toegestane_rollen = Array.isArray(s.toegestaneRollen) ? s.toegestaneRollen : [];
    if (s.sort !== undefined) p.sort = s.sort == null ? 0 : +s.sort;
    if (s.archived !== undefined) p.archived = !!s.archived;
    return p;
  }
  function fileRowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      mapId: row.map_id || null,
      naam: row.naam || "",
      beschrijving: row.beschrijving || "",
      storagePath: row.storage_path || null,
      fileName: row.file_name || "",
      fileExtension: row.file_extension || "",
      fileSize: row.file_size == null ? null : +row.file_size,
      mimeType: row.mime_type || "",
      archived: !!row.archived,
      uploadedBy: row.uploaded_by || "",
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
  }
  function fileObjToPayload(o) {
    var s = o || {}, p = {};
    if (s.mapId !== undefined) p.map_id = s.mapId || null;
    if (s.naam !== undefined) p.naam = String(s.naam || "").trim();
    if (s.beschrijving !== undefined) p.beschrijving = s.beschrijving || null;
    if (s.storagePath !== undefined) p.storage_path = s.storagePath || null;
    if (s.fileName !== undefined) p.file_name = s.fileName || null;
    if (s.fileExtension !== undefined) p.file_extension = s.fileExtension || null;
    if (s.fileSize !== undefined) p.file_size = s.fileSize == null ? null : +s.fileSize;
    if (s.mimeType !== undefined) p.mime_type = s.mimeType || null;
    if (s.archived !== undefined) p.archived = !!s.archived;
    if (s.uploadedBy !== undefined) p.uploaded_by = s.uploadedBy || null;
    return p;
  }

  // ---- cache (DATA-SLIM: _mem is bron, localStorage best-effort) ----------
  var _mapMem = null, _fileMem = null;
  function readMem(which) {
    var mem = which === "map" ? _mapMem : _fileMem;
    if (mem !== null) return mem;
    try {
      var raw = localStorage.getItem(which === "map" ? CACHE_MAP : CACHE_FILE);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeMem(which, items) {
    items = Array.isArray(items) ? items : [];
    if (which === "map") _mapMem = items; else _fileMem = items;
    try { localStorage.setItem(which === "map" ? CACHE_MAP : CACHE_FILE, JSON.stringify(items)); } catch (e) { /* quota — _mem is bron */ }
  }

  function dispatchUpdated(src) {
    try { global.dispatchEvent(new CustomEvent("ff:sharepoint-updated", { detail: { source: src || "data" } })); } catch (e) {}
  }
  function reportSilent(action, err) {
    console.error("[sharepointDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("SharePoint — " + action, err);
  }

  function client() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    return global.ffSupabase;
  }

  async function fetchAllPaged(table, cols, orderCol) {
    var sb = client(), out = [], from = 0;
    for (;;) {
      var q = sb.from(table).select(cols).range(from, from + PAGE - 1);
      if (orderCol) q = q.order(orderCol, { ascending: true });
      var res = await q;
      if (res.error) throw res.error;
      var batch = res.data || [];
      out = out.concat(batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  // ---- bootstrap / refresh -------------------------------------------------
  function sortMaps(arr) {
    return arr.slice().sort(function (a, b) {
      if ((a.sort || 0) !== (b.sort || 0)) return (a.sort || 0) - (b.sort || 0);
      var an = String(a.naam || "").toLowerCase(), bn = String(b.naam || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  }
  async function refresh() {
    var maps = (await fetchAllPaged(T_MAP, "id,parent_id,naam,beschrijving,icon,kleur,toegestane_rollen,sort,archived,created_at,updated_at", "sort")).map(mapRowToObj).filter(Boolean);
    var files = (await fetchAllPaged(T_FILE, "id,map_id,naam,beschrijving,storage_path,file_name,file_extension,file_size,mime_type,archived,uploaded_by,created_at,updated_at", "created_at")).map(fileRowToObj).filter(Boolean);
    writeMem("map", sortMaps(maps));
    writeMem("file", files);
    dispatchUpdated("refresh");
    return { maps: maps, files: files };
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readMem("map").length || readMem("file").length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try { await refresh(); }
      catch (err) { reportSilent("bootstrap", err); }
    })();
    return readyPromise;
  }

  // ---- mappen accessors ----------------------------------------------------
  function getMappenSync() { return readMem("map").filter(function (m) { return m && !m.archived; }); }
  function getMapByIdSync(id) {
    if (id == null) return null;
    var s = String(id), f = readMem("map").find(function (m) { return m && String(m.id) === s; });
    return f ? Object.assign({}, f) : null;
  }
  function getChildMappenSync(parentId) {
    var pid = parentId == null ? null : String(parentId);
    return getMappenSync().filter(function (m) { return (m.parentId == null ? null : String(m.parentId)) === pid; });
  }

  // ---- bestanden accessors -------------------------------------------------
  function getBestandenSync(mapId) {
    var mid = mapId == null ? null : String(mapId);
    return readMem("file").filter(function (f) {
      return f && !f.archived && (f.mapId == null ? null : String(f.mapId)) === mid;
    });
  }
  function getBestandByIdSync(id) {
    if (id == null) return null;
    var s = String(id), f = readMem("file").find(function (r) { return r && String(r.id) === s; });
    return f ? Object.assign({}, f) : null;
  }

  // ---- mappen mutaties -----------------------------------------------------
  async function addMap(rec) {
    var sb = client();
    var payload = mapObjToPayload(rec || {});
    payload.id = (rec && rec.id) || genId();
    if (!payload.naam) throw new Error("Mapnaam is verplicht");
    if (payload.toegestane_rollen === undefined) payload.toegestane_rollen = [];
    if (payload.sort === undefined) payload.sort = 0;
    payload.archived = false;
    try { var u = await sb.auth.getUser(); payload.created_by = u && u.data && u.data.user && u.data.user.email || null; } catch (e) {}
    var res = await sb.from(T_MAP).insert(payload).select("*").single();
    if (res.error) throw res.error;
    var obj = mapRowToObj(res.data);
    writeMem("map", sortMaps(readMem("map").concat([obj])));
    dispatchUpdated("addMap");
    return obj;
  }
  async function updateMap(id, partial) {
    var sb = client();
    if (!id) throw new Error("Geen map-id");
    var payload = mapObjToPayload(partial || {}); delete payload.id; delete payload.created_by;
    var res = await sb.from(T_MAP).update(payload).eq("id", id).select("*").single();
    if (res.error) throw res.error;
    var obj = mapRowToObj(res.data), cache = readMem("map");
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeMem("map", sortMaps(cache));
    dispatchUpdated("updateMap");
    return obj;
  }
  async function archiveMap(id) { return updateMap(id, { archived: true }); }

  // Harde verwijdering van een map — alleen toegestaan als 'm leeg is
  // (geen submappen, geen niet-gearchiveerde bestanden). DIEHARD: voorkomt
  // dat verwijderen van een map onbedoeld documenten meesleurt.
  async function deleteMap(id) {
    var sb = client();
    if (!id) return false;
    var childMaps = getChildMappenSync(id);
    var childFiles = getBestandenSync(id);
    if (childMaps.length || childFiles.length) {
      throw new Error("Map is niet leeg — verplaats of verwijder eerst de inhoud.");
    }
    var res = await sb.from(T_MAP).delete().eq("id", id);
    if (res.error) throw res.error;
    writeMem("map", readMem("map").filter(function (r) { return r && String(r.id) !== String(id); }));
    dispatchUpdated("deleteMap");
    return true;
  }

  // ---- bestanden mutaties --------------------------------------------------
  async function getFileUrl(id) {
    var sb = client();
    var row = getBestandByIdSync(id);
    if (!row || !row.storagePath) return null;
    try {
      var res = await sb.storage.from(BUCKET).createSignedUrl(row.storagePath, 600);
      if (res.error) throw res.error;
      return (res.data && (res.data.signedUrl || res.data.signedURL)) || null;
    } catch (err) { reportSilent("getFileUrl", err); return null; }
  }

  async function uploadToBucket(file, fileId) {
    var sb = client();
    var sp = fileId + "/" + safeName(file.name);
    var ab = await file.arrayBuffer();
    var upl = await sb.storage.from(BUCKET).upload(
      sp, new Blob([ab], { type: file.type || "application/octet-stream" }),
      { upsert: true, contentType: file.type || "application/octet-stream" }
    );
    if (upl.error) throw upl.error;
    return sp;
  }

  // Upload een nieuw bestand naar een map (mapId == null → root).
  async function uploadBestand(file, mapId, meta) {
    var sb = client();
    if (!file) throw new Error("Geen bestand");
    var id = genId();
    var sp = await uploadToBucket(file, id);
    var rec = {
      id: id,
      mapId: mapId || null,
      naam: (meta && meta.naam) || file.name.replace(/\.[a-z0-9]+$/i, ""),
      beschrijving: (meta && meta.beschrijving) || "",
      storagePath: sp,
      fileName: file.name,
      fileExtension: extOf(file.name),
      fileSize: file.size,
      mimeType: file.type || "",
      archived: false,
    };
    var payload = fileObjToPayload(rec); payload.id = id;
    try { var u = await sb.auth.getUser(); payload.uploaded_by = u && u.data && u.data.user && u.data.user.email || null; } catch (e) {}
    var res = await sb.from(T_FILE).insert(payload).select("*").single();
    if (res.error) {
      try { await sb.storage.from(BUCKET).remove([sp]); } catch (e) {}
      throw res.error;
    }
    var obj = fileRowToObj(res.data);
    writeMem("file", readMem("file").concat([obj]));
    dispatchUpdated("uploadBestand");
    return obj;
  }

  async function updateBestand(id, partial) {
    var sb = client();
    if (!id) throw new Error("Geen bestand-id");
    var payload = fileObjToPayload(partial || {}); delete payload.id;
    var res = await sb.from(T_FILE).update(payload).eq("id", id).select("*").single();
    if (res.error) throw res.error;
    var obj = fileRowToObj(res.data), cache = readMem("file");
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeMem("file", cache);
    dispatchUpdated("updateBestand");
    return obj;
  }

  // Vervang het fysieke bestand van een bestaande rij.
  async function replaceFile(id, file) {
    var sb = client();
    var row = getBestandByIdSync(id);
    if (!row) throw new Error("Bestand niet gevonden");
    var sp = await uploadToBucket(file, id);
    if (row.storagePath && row.storagePath !== sp) {
      try { await sb.storage.from(BUCKET).remove([row.storagePath]); } catch (e) {}
    }
    return updateBestand(id, {
      storagePath: sp, fileName: file.name, fileExtension: extOf(file.name),
      fileSize: file.size, mimeType: file.type || "",
    });
  }

  // Harde verwijdering van één bestand (storage + rij) — user-geïnitieerd met
  // slider-bevestiging in de UI. Eén rij tegelijk; geen bulk-overwrite.
  async function deleteBestand(id) {
    var sb = client();
    if (!id) return false;
    var row = getBestandByIdSync(id);
    if (row && row.storagePath) {
      try { await sb.storage.from(BUCKET).remove([row.storagePath]); } catch (e) { /* best-effort */ }
    }
    var res = await sb.from(T_FILE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeMem("file", readMem("file").filter(function (r) { return r && String(r.id) !== String(id); }));
    dispatchUpdated("deleteBestand");
    return true;
  }

  global.sharepointDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    // mappen
    getMappenSync: getMappenSync, getMapByIdSync: getMapByIdSync, getChildMappenSync: getChildMappenSync,
    addMap: addMap, updateMap: updateMap, archiveMap: archiveMap, deleteMap: deleteMap,
    // bestanden
    getBestandenSync: getBestandenSync, getBestandByIdSync: getBestandByIdSync,
    uploadBestand: uploadBestand, updateBestand: updateBestand, replaceFile: replaceFile,
    deleteBestand: deleteBestand, getFileUrl: getFileUrl,
  };
  bootstrap();
})(typeof window !== "undefined" ? window : this);
