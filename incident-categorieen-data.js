/* global window, localStorage */
/**
 * Incident-categorieën — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur volgens werkpatronen.md § 6:
 *  - Source of truth: Supabase tabel `public.incident_categorieen`.
 *  - Bij bootstrap fetcht deze module alle categorieën en cachet ze onder
 *    "incident_categorieen_v1" zodat een tweede page-load instant data heeft.
 *  - Schrijfacties (add/update/archive/restore/delete) gaan async naar Supabase;
 *    de cache wordt geüpdatet en het update-event `besa:incident-categorieen-updated`
 *    wordt gefired voor live re-renders.
 *
 * Categorie-archivering = "deactiveren" in de UI: archived=true betekent
 * dat de categorie niet meer geselecteerd kan worden bij nieuwe incidenten,
 * maar bestaande incidenten met die categorie blijven werken.
 *
 * Public API:
 *   - incidentCategorieenDB.ready
 *   - incidentCategorieenDB.refresh()
 *   - incidentCategorieenDB.getAllSync()
 *   - incidentCategorieenDB.getActiveSync()  → alleen niet-gearchiveerde
 *   - incidentCategorieenDB.getByIdSync(id)
 *   - incidentCategorieenDB.getByNaamSync(naam) → fallback voor legacy data
 *   - incidentCategorieenDB.add({naam, beschrijving})
 *   - incidentCategorieenDB.update(id, {naam?, beschrijving?})
 *   - incidentCategorieenDB.archive(id)   → deactiveren
 *   - incidentCategorieenDB.restore(id)   → activeren
 *   - incidentCategorieenDB.delete(id)
 *
 * Events: "besa:incident-categorieen-updated" op window.
 */
(function (global) {
  "use strict";

  var TABLE = "incident_categorieen";
  var CACHE_KEY = "incident_categorieen_v1";

  function generateId() {
    return "cat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function reportSilent(action, err) {
    try { console.error("[incidentCategorieenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Incident-categorieën — " + action, err);
    }
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
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:incident-categorieen-updated", {
        detail: { source: source || "incident-categorieen-data" },
      }));
    } catch (e) { /* */ }
  }

  // BS2 ordent categorieën op `order`; BS1 spiegelt dat 1-op-1 via `volgorde`.
  // Categorieën zonder volgorde (legacy/BS1-eigen) komen achteraan op naam.
  function catSort(a, b) {
    var av = (a && a.volgorde != null) ? a.volgorde : 9999;
    var bv = (b && b.volgorde != null) ? b.volgorde : 9999;
    if (av !== bv) return av - bv;
    return ((a && a.naam) || "").localeCompare((b && b.naam) || "");
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      beschrijving: row.beschrijving || "",
      volgorde: (row.volgorde == null ? null : Number(row.volgorde)),
      bs2Id: (row.data && row.data.bs2_id) || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      naam: String(safe.naam || "").trim(),
      beschrijving: String(safe.beschrijving || ""),
      archived: !!safe.archived,
    };
    if (safe.volgorde != null && safe.volgorde !== "") payload.volgorde = Number(safe.volgorde);
    payload.id = safe.id || generateId();
    return payload;
  }

  function objToUpdatePayload(o) {
    var safe = o || {};
    var payload = {};
    if (Object.prototype.hasOwnProperty.call(safe, "naam")) payload.naam = String(safe.naam || "").trim();
    if (Object.prototype.hasOwnProperty.call(safe, "beschrijving")) payload.beschrijving = String(safe.beschrijving || "");
    if (Object.prototype.hasOwnProperty.call(safe, "archived")) payload.archived = !!safe.archived;
    if (Object.prototype.hasOwnProperty.call(safe, "volgorde")) {
      payload.volgorde = (safe.volgorde == null || safe.volgorde === "") ? null : Number(safe.volgorde);
    }
    return payload;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("volgorde", { ascending: true, nullsFirst: false })
      .order("naam", { ascending: true });
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
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("Bootstrap", err);
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

  function getAllSync() { return readCache(); }

  function getActiveSync() {
    return readCache().filter(function (c) { return c && !c.archived; });
  }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getByNaamSync(naam) {
    if (!naam) return null;
    var s = String(naam).toLowerCase();
    var found = readCache().find(function (r) { return r && r.naam && r.naam.toLowerCase() === s; });
    return found ? Object.assign({}, found) : null;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.naam) throw new Error("Naam is verplicht");
    var res = await global.besaSupabase
      .from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.push(obj);
    cache.sort(catSort);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var payload = objToUpdatePayload(partial || {});
    var res = await global.besaSupabase
      .from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    cache.sort(catSort);
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
      .from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  global.incidentCategorieenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getActiveSync: getActiveSync,
    getByIdSync: getByIdSync,
    getByNaamSync: getByNaamSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
