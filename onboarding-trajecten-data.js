/* global window, localStorage */
/**
 * Onboarding-trajecten — Supabase data-laag (1-op-1 met medewerker).
 *
 * Eén traject per medewerker (UNIQUE op medewerker_id). Houdt de overkoepelende
 * onboarding-status bij; de afzonderlijke stappen (documenten, contract, tekenen,
 * inwerken, toegang, vrijgeven) worden in eigen tabellen/vlaggen bijgehouden en
 * door de Onboarding-tab afgeleid — dit traject is de "container" + status.
 *
 * Bron van waarheid: Supabase tabel `onboarding_trajecten`.
 * Cache: localStorage "onboarding_trajecten_v1" + in-memory `_mem` (DATA-SLIM).
 * Event: `ff:onboarding-updated` voor live re-render.
 *
 * Gebruik:
 *   await window.onboardingDB.ready;
 *   var t = window.onboardingDB.getForMedewerkerSync(empId); // null of object
 *   await window.onboardingDB.start(empId, { dienstverbandType: "Loondienst" });
 *   await window.onboardingDB.markAfgerond(t.id);
 */
(function (global) {
  "use strict";

  var TABLE = "onboarding_trajecten";
  var CACHE_KEY = "onboarding_trajecten_v1";
  var _mem = null;

  function isoNow() { return new Date().toISOString(); }

  function readCache() {
    if (_mem !== null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var p = raw ? JSON.parse(raw) : [];
      _mem = Array.isArray(p) ? p : [];
    } catch (e) { _mem = []; }
    return _mem;
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota — _mem blijft bron */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:onboarding-updated", { detail: { source: source || "onboarding-trajecten-data" } }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      status: row.status || "lopend",
      gestartOp: row.gestart_op || row.aanmaakdatum || null,
      afgerondOp: row.afgerond_op || null,
      aangemaaktDoor: row.aangemaakt_door || null,
      uploadToken: row.upload_token || "",
      data: row.data && typeof row.data === "object" ? row.data : {},
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  async function ensureSupabaseReady() {
    // Cold-load vangrail (les #13): wacht op sessie-rehydratie vóór de eerste
    // query, anders draait de RLS anoniem en komen er 0 rijen terug.
    if (global.ffSupabaseReady && typeof global.ffSupabaseReady.then === "function") {
      try { await global.ffSupabaseReady; } catch (e) { /* */ }
    }
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    await ensureSupabaseReady();
    var res = await global.ffSupabase.from(TABLE).select("*");
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
        // READ-fout mag NOOIT ffReportSyncFailure aanroepen (zou auth-logout
        // escaleren). Alleen loggen.
        console.error("[onboardingDB] Bootstrap mislukt:", err);
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

  function upsertLocal(obj) {
    if (!obj) return;
    var cache = readCache().slice();
    var idx = cache.findIndex(function (r) { return r && String(r.medewerkerId) === String(obj.medewerkerId); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
  }

  // Start (of haal bestaand) onboarding-traject voor een medewerker.
  async function start(medewerkerId, opts) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!medewerkerId) throw new Error("medewerkerId verplicht");
    var existing = getForMedewerkerSync(medewerkerId);
    if (existing) return existing;
    var safe = opts || {};
    var payload = {
      medewerker_id: String(medewerkerId),
      status: "lopend",
      data: safe.dienstverbandType ? { dienstverband_type: String(safe.dienstverbandType) } : {},
    };
    if (safe.aangemaaktDoor) payload.aangemaakt_door = safe.aangemaaktDoor;
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    upsertLocal(obj);
    dispatchUpdated("start");
    return obj;
  }

  async function update(id, patch) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("id verplicht");
    var res = await global.ffSupabase.from(TABLE).update(patch || {}).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    upsertLocal(obj);
    dispatchUpdated("update");
    return obj;
  }

  // Merge een patch in de `data` jsonb zonder andere keys te overschrijven
  // (gebruikt voor de toegang-checklist + vrijgave-vlag in release 7).
  async function updateData(id, patch) {
    if (!id) throw new Error("id verplicht");
    var existing = readCache().find(function (r) { return r && String(r.id) === String(id); });
    var curData = (existing && existing.data && typeof existing.data === "object") ? existing.data : {};
    var merged = Object.assign({}, curData, patch || {});
    return update(id, { data: merged });
  }

  async function markAfgerond(id) {
    return update(id, { status: "afgerond", afgerond_op: isoNow() });
  }

  async function markLopend(id) {
    return update(id, { status: "lopend", afgerond_op: null });
  }

  function getAllSync() { return readCache().slice(); }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return null;
    var s = String(medewerkerId);
    var found = readCache().find(function (r) { return r && String(r.medewerkerId) === s; });
    return found ? Object.assign({}, found) : null;
  }

  global.onboardingDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    start: start,
    update: update,
    updateData: updateData,
    markAfgerond: markAfgerond,
    markLopend: markLopend,
    getAllSync: getAllSync,
    getForMedewerkerSync: getForMedewerkerSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
