/* global window, localStorage */
/**
 * Client contacten — Supabase data-laag met localStorage als read-cache.
 *
 * Voor de Contacten-tab op client-detail.html (item 14 / 34 in open-items).
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `client_contacten`.
 *  - Cache in localStorage onder "client_contacten_v1" voor snelle initial render.
 *  - Schrijfacties async naar Supabase, daarna cache update + event firen.
 *  - Geen legacy migratie nodig (nieuwe tabel sinds 2026-05-12).
 *
 * Gebruik:
 *   await window.clientContactenDB.ready;
 *   var rows = window.clientContactenDB.getForClientSync("cl_322");
 *   var saved = await window.clientContactenDB.add({
 *     clientId: "cl_322",
 *     naam: "Jan Jansen",
 *     relatie: "Voogd",
 *     telefoon: "06-...",
 *     email: "jan@example.com",
 *     isPrimair: true,
 *   });
 *   await window.clientContactenDB.update(id, { telefoon: "..." });
 *   await window.clientContactenDB.archive(id);
 *   await window.clientContactenDB.restore(id);
 *   await window.clientContactenDB.remove(id);
 *   window.addEventListener("besa:client-contacten-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "client_contacten";
  var CACHE_KEY = "client_contacten_v1";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isoNow() { return new Date().toISOString(); }

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

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:client-contacten-updated", {
        detail: { source: source || "client-contacten-data" }
      }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[clientContactenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Contacten — " + action, err);
    }
  }

  // Frontend = camelCase, DB = snake_case
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      clientId: row.client_id || "",
      naam: row.naam || "",
      relatie: row.relatie || "",
      telefoon: row.telefoon || "",
      email: row.email || "",
      isPrimair: !!row.is_primair,
      notitie: row.notitie || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      client_id: String(safe.clientId || ""),
      naam: String(safe.naam || "").trim(),
      relatie: safe.relatie ? String(safe.relatie).trim() : null,
      telefoon: safe.telefoon ? String(safe.telefoon).trim() : null,
      email: safe.email ? String(safe.email).trim() : null,
      is_primair: !!safe.isPrimair,
      notitie: safe.notitie ? String(safe.notitie) : null,
      archived: !!safe.archived,
    };
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    delete p.client_id; // client_id is immutable
    return p;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("is_primair", { ascending: false })
      .order("aanmaakdatum", { ascending: false });
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
        reportSilent("bootstrap fetchAll", err);
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

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.clientId) throw new Error("clientId verplicht");
    if (!rec.naam || !String(rec.naam).trim()) throw new Error("naam verplicht");
    var payload = objToInsertPayload(rec);
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToUpdatePayload(merged);
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
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

  function getForClientSync(clientId) {
    if (!clientId) return [];
    var s = String(clientId);
    return readCache().filter(function (r) { return r && String(r.clientId) === s; });
  }

  global.clientContactenDB = {
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
    getByIdSync: getByIdSync,
    getForClientSync: getForClientSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
