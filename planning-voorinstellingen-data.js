/* global window, localStorage */
/**
 * planning-voorinstellingen-data.js — data-laag voor filter-voorinstellingen
 * op planning.html. Sprint 4 / v2 master-plan S4.
 *
 * Schema:
 *   planning_voorinstellingen
 *     id uuid PK
 *     user_id uuid FK auth.users (RLS: own + admin)
 *     naam text (UNIQUE per user)
 *     filter_state jsonb — snapshot van filterState
 *     aanmaakdatum, laatst_gewijzigd
 *
 * Gebruik:
 *   await window.planningVoorinstellingenDB.ready;
 *   const list = window.planningVoorinstellingenDB.getAllSync();
 *   await window.planningVoorinstellingenDB.add({ naam, filter_state });
 *   await window.planningVoorinstellingenDB.delete(id);
 *
 * Cache: localStorage 'planning_voorinstellingen_v1' (per-device).
 * Event: 'ff:planning-voorinstellingen-updated' op data-mutatie.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "planning_voorinstellingen_v1";
  var TABLE = "planning_voorinstellingen";

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
      global.dispatchEvent(new CustomEvent("ff:planning-voorinstellingen-updated", {
        detail: { source: source || "planning-voorinstellingen-data" }
      }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[planningVoorinstellingenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) {
      global.ffReportSyncFailure("Planning voorinstellingen — " + action, err);
    }
  }

  async function currentUserId() {
    if (!global.ffSupabase) return null;
    try {
      var s = await global.ffSupabase.auth.getSession();
      return s && s.data && s.data.session ? s.data.session.user.id : null;
    } catch (e) { return null; }
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*")
      .order("naam", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
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

  async function add(payload) {
    var uid = await currentUserId();
    if (!uid) throw new Error("Niet ingelogd");
    var naam = String(payload && payload.naam || "").trim();
    if (!naam) throw new Error("Naam is verplicht");
    var filterState = payload && payload.filter_state ? payload.filter_state : {};
    var res = await global.ffSupabase
      .from(TABLE)
      .insert({ user_id: uid, naam: naam, filter_state: filterState })
      .select()
      .single();
    if (res.error) throw res.error;
    var items = readCache();
    items.push(res.data);
    items.sort(function (a, b) { return String(a.naam).localeCompare(String(b.naam)); });
    writeCache(items);
    dispatchUpdated("add");
    return res.data;
  }

  async function update(id, patch) {
    if (!id) throw new Error("id ontbreekt");
    var body = {};
    if (patch.naam != null) body.naam = String(patch.naam).trim();
    if (patch.filter_state != null) body.filter_state = patch.filter_state;
    var res = await global.ffSupabase
      .from(TABLE)
      .update(body)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var items = readCache().map(function (it) { return it.id === id ? res.data : it; });
    items.sort(function (a, b) { return String(a.naam).localeCompare(String(b.naam)); });
    writeCache(items);
    dispatchUpdated("update");
    return res.data;
  }

  async function remove(id) {
    if (!id) throw new Error("id ontbreekt");
    var res = await global.ffSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (res.error) throw res.error;
    var items = readCache().filter(function (it) { return it.id !== id; });
    writeCache(items);
    dispatchUpdated("delete");
    return true;
  }

  function getAllSync() { return readCache(); }
  function getByIdSync(id) {
    if (!id) return null;
    return readCache().find(function (it) { return it.id === id; }) || null;
  }

  global.planningVoorinstellingenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
