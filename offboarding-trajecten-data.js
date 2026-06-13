/* global window, localStorage */
/**
 * Offboarding-trajecten — Supabase data-laag (1-op-1 met medewerker).
 *
 * "Uit dienst melden" start een traject met de geplande laatste werkdag; de
 * medewerker blijft In dienst/zichtbaar tot HR de checklist afrondt. De checklist
 * (eigendommen / bevestigingsmail / salarisadministratie / accounts opheffen)
 * wordt in `data` jsonb bijgehouden. Bij afronden zet de Onboarding/Uit-dienst-tab
 * de medewerker op fase "Uit dienst" (→ gearchiveerd).
 *
 * Bron van waarheid: Supabase tabel `offboarding_trajecten`.
 * Cache: localStorage "offboarding_trajecten_v1" + in-memory `_mem` (DATA-SLIM).
 * Event: `ff:offboarding-updated`.
 */
(function (global) {
  "use strict";

  var TABLE = "offboarding_trajecten";
  var CACHE_KEY = "offboarding_trajecten_v1";
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
      global.dispatchEvent(new CustomEvent("ff:offboarding-updated", { detail: { source: source || "offboarding-trajecten-data" } }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      status: row.status || "lopend",
      einddatum: row.einddatum || null,
      gestartOp: row.gestart_op || row.aanmaakdatum || null,
      afgerondOp: row.afgerond_op || null,
      aangemaaktDoor: row.aangemaakt_door || null,
      data: row.data && typeof row.data === "object" ? row.data : {},
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  async function ensureSupabaseReady() {
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
        console.error("[offboardingDB] Bootstrap mislukt:", err);
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

  // Start (of haal bestaand) offboarding-traject voor een medewerker.
  async function start(medewerkerId, opts) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!medewerkerId) throw new Error("medewerkerId verplicht");
    var existing = getForMedewerkerSync(medewerkerId);
    if (existing) return existing;
    var safe = opts || {};
    var payload = { medewerker_id: String(medewerkerId), status: "lopend", data: {} };
    if (safe.einddatum) payload.einddatum = safe.einddatum;
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

  // Merge een patch in de `data` jsonb (checklist) zonder andere keys te wissen.
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

  global.offboardingDB = {
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
