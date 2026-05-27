/* global window, localStorage */
/**
 * locked-months-data.js — globale maand-vergrendelingen voor Tijdregistratie.
 *
 * BS2-parity: één lock per (jaar, maand). Geen per-medewerker (dat is
 * werkurenVergrendeldDB, blijft naast bestaan voor backwards compat).
 *
 * Public API:
 *   window.lockedMonthsDB
 *     .ready              — bootstrap-promise
 *     .refresh()          — fetch + dispatch event
 *     .getAllSync()       — alle vergrendelingen uit cache
 *     .isLockedSync(year, month)  — boolean
 *     .getLockSync(year, month)   — rij of null
 *     .lock(year, month)  — async insert (failt bij dubbele)
 *     .unlock(year, month) — async delete
 *
 * Events op window: "besa:locked-months-updated"
 *
 * DATA-SLIM-pattern (les v3-modules): _mem fallback wanneer localStorage faalt.
 */
(function (global) {
  "use strict";

  var TABLE = "locked_months";
  var CACHE_KEY = "besa_locked_months_v1";

  var _mem = null;

  function reportSilent(action, err) {
    try { console.error("[lockedMonthsDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Maand-vergrendeling — " + action, err);
  }

  function readCache() {
    if (_mem !== null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var p = raw ? JSON.parse(raw) : [];
      _mem = Array.isArray(p) ? p : [];
      return _mem;
    } catch (e) {
      _mem = [];
      return _mem;
    }
  }
  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* */ }
  }
  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:locked-months-updated", { detail: { source: source } })); }
    catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      jaar: Number(row.jaar),
      maand: Number(row.maand),
      vergrendeldDoor: row.vergrendeld_door || null,
      vergrendeldDoorNaam: row.vergrendeld_door_naam || "",
      vergrendeldOp: row.vergrendeld_op,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("jaar", { ascending: false }).order("maand", { ascending: false });
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

  function getAllSync() { return readCache().slice(); }
  function isLockedSync(year, month) {
    var y = Number(year), m = Number(month);
    return readCache().some(function (r) { return r && r.jaar === y && r.maand === m; });
  }
  function getLockSync(year, month) {
    var y = Number(year), m = Number(month);
    return readCache().find(function (r) { return r && r.jaar === y && r.maand === m; }) || null;
  }

  async function lock(year, month) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var y = parseInt(year, 10);
    var m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) throw new Error("Ongeldig jaar/maand");
    if (isLockedSync(y, m)) return getLockSync(y, m);

    var profile = global.besaCurrentProfile || (global.profilesDB && global.profilesDB.getCurrentSync ? global.profilesDB.getCurrentSync() : null);
    var byId = profile ? (profile.id || null) : null;
    var byName = profile ? ((profile.voornaam || "") + " " + (profile.achternaam || "")).trim() : "";
    if (!byName && profile && profile.email) byName = profile.email;

    var payload = { jaar: y, maand: m, vergrendeld_door: byId, vergrendeld_door_naam: byName };
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache(); cache.push(obj);
    writeCache(cache);
    dispatchUpdated("lock");
    return obj;
  }

  async function unlock(year, month) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var y = parseInt(year, 10);
    var m = parseInt(month, 10);
    if (!y || !m) throw new Error("Ongeldig jaar/maand");
    var res = await global.besaSupabase.from(TABLE).delete().eq("jaar", y).eq("maand", m);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return !(r && r.jaar === y && r.maand === m); });
    writeCache(cache);
    dispatchUpdated("unlock");
    return true;
  }

  global.lockedMonthsDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    getAllSync: getAllSync,
    isLockedSync: isLockedSync,
    getLockSync: getLockSync,
    lock: lock,
    unlock: unlock,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
