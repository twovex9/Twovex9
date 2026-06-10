/* global window, localStorage */
/**
 * verloftypes-data.js — Supabase data-laag voor beheerbare verloftypes (G25).
 *
 * Tabel: public.verloftypes (uuid PK, code unique, label, actief, volgorde).
 * RLS: lezen = authenticated; schrijven = HR. De aanvraag-formulieren (desktop
 * mijn-verlof) lezen de actieve typen hieruit, met de klassieke 7 als fallback.
 *
 * Events: besa:verloftypes-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verloftypes";
  var CACHE_KEY = "verloftypes_v1";

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      code: row.code || "",
      label: row.label || "",
      actief: row.actief !== false,
      volgorde: Number(row.volgorde) || 0,
      aanmaakdatum: row.aanmaakdatum || null,
    };
  }

  var _mem = null;
  function readCache() {
    if (_mem != null) return _mem;
    try { var raw = localStorage.getItem(CACHE_KEY); _mem = raw ? (JSON.parse(raw) || []) : []; } catch (e) { _mem = []; }
    if (!Array.isArray(_mem)) _mem = [];
    return _mem;
  }
  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* */ }
  }
  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      if (a.volgorde !== b.volgorde) return a.volgorde - b.volgorde;
      return String(a.label).localeCompare(String(b.label));
    });
  }
  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:verloftypes-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*");
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        writeCache(sortItems(await fetchAll()));
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[verloftypesDB] bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Verloftypes — laden", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    writeCache(sortItems(await fetchAll()));
    dispatchUpdated("refresh");
    return readCache();
  }

  function slugify(label) {
    return String(label || "").toLowerCase().trim()
      .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
      .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "type";
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = {
      code: (rec && rec.code) || slugify(rec && rec.label),
      label: String((rec && rec.label) || "").trim(),
      actief: rec && rec.actief !== false,
      volgorde: Number(rec && rec.volgorde) || 0,
    };
    if (!payload.label) throw new Error("Label is verplicht");
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    writeCache(sortItems(readCache().concat([rowToObj(res.data)])));
    dispatchUpdated("add");
    return rowToObj(res.data);
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = {};
    if (partial && partial.label != null) payload.label = String(partial.label).trim();
    if (partial && partial.actief != null) payload.actief = !!partial.actief;
    if (partial && partial.volgorde != null) payload.volgorde = Number(partial.volgorde) || 0;
    payload.laatst_gewijzigd = new Date().toISOString();
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(sortItems(readCache().map(function (r) { return r.id === id ? obj : r; })));
    dispatchUpdated("update");
    return obj;
  }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(readCache().filter(function (r) { return r.id !== id; }));
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }
  function getActiveSync() { return readCache().filter(function (r) { return r.actief; }); }

  global.verloftypesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    add: add, update: update, delete: remove,
    getAllSync: getAllSync, getActiveSync: getActiveSync,
    slugify: slugify,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
