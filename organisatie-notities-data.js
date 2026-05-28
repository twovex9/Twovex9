/* global window, localStorage */
/**
 * Organisatie-notities (verwijzer-notities) — Supabase data-laag.
 *
 * Architectuur (volgt beschikking-notities-data.js + clienten-data.js):
 *  - Source of truth: Supabase tabel `organisatie_notities`.
 *  - In-memory `_mem` = harde bron binnen de sessie (overleeft localStorage-
 *    quota-fouten). localStorage = best-effort snelle read-cache.
 *  - Schrijfacties async naar Supabase; daarna cache + event
 *    `besa:organisatie-notities-updated` voor live re-render.
 *
 * Gebruik:
 *   await window.organisatieNotitiesDB.ready;
 *   var rows = window.organisatieNotitiesDB.getForOrganisatieSync(orgId);
 *   await window.organisatieNotitiesDB.add({ organisatieId, tekst, auteur });
 *   await window.organisatieNotitiesDB.remove(id);
 *   window.addEventListener("besa:organisatie-notities-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "organisatie_notities";
  var CACHE_KEY = "organisatie_notities_v1";
  var EVENT_NAME = "besa:organisatie-notities-updated";

  function isoNow() { return new Date().toISOString(); }

  function reportSilent(action, err) {
    if (global.console) console.error("[organisatieNotitiesDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Verwijzer-notities — " + action, err);
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      organisatieId: row.organisatie_id || "",
      tekst: row.tekst || "",
      auteur: row.auteur || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      organisatie_id: String(safe.organisatieId || ""),
      tekst: String(safe.tekst == null ? "" : safe.tekst),
      auteur: safe.auteur == null || safe.auteur === "" ? null : String(safe.auteur),
      archived: !!safe.archived,
    };
  }

  // ---------------------------------------------------------------------------
  // Cache — _mem is bron binnen de sessie (zie feedback_besa_v3_module_lessons #1)
  // ---------------------------------------------------------------------------
  var _mem = null;

  function readCacheRaw() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota — _mem is bron */ }
  }

  function currentList() {
    return (_mem !== null) ? _mem : readCacheRaw();
  }

  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent(EVENT_NAME)); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Supabase fetch + bootstrap
  // ---------------------------------------------------------------------------
  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated();
      } catch (err) {
        reportSilent("laden", err);
      }
      return true;
    })();
    return readyPromise;
  }

  async function refresh() {
    try {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
      return items;
    } catch (err) {
      reportSilent("verversen", err);
      return currentList();
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------
  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.organisatie_id) throw new Error("organisatieId ontbreekt");
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = currentList().slice();
    cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated();
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var dbPatch = {};
    if (partial && partial.tekst != null) dbPatch.tekst = String(partial.tekst);
    if (partial && partial.auteur != null) dbPatch.auteur = String(partial.auteur);
    if (partial && typeof partial.archived === "boolean") dbPatch.archived = partial.archived;
    var res = await global.besaSupabase.from(TABLE).update(dbPatch).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = currentList().slice();
    var idx = cache.findIndex(function (n) { return n && String(n.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated();
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = currentList().filter(function (n) { return n && String(n.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Synchrone helpers
  // ---------------------------------------------------------------------------
  function getAllSync() { return currentList().slice(); }

  function getForOrganisatieSync(orgId, includeArchived) {
    if (!orgId) return [];
    var s = String(orgId);
    return currentList().filter(function (n) {
      if (!n || String(n.organisatieId) !== s) return false;
      if (!includeArchived && n.archived) return false;
      return true;
    });
  }

  global.organisatieNotitiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getForOrganisatieSync: getForOrganisatieSync,
  };

  if (global.besaSupabase) bootstrap();
  else global.addEventListener("besa:supabase-ready", bootstrap, { once: true });
})(typeof window !== "undefined" ? window : this);
