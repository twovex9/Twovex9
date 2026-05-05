/**
 * Data-laag voor 'bureaus' (HR module — referentiedata).
 *
 * Bron van waarheid: Supabase tabel public.bureaus.
 * localStorage["hr_bureaus"] dient als read-cache.
 *
 * Public async API:
 *   await window.bureausDB.bootstrap()
 *   await window.bureausDB.refresh()
 *   await window.bureausDB.add({naam, standaardUurtarief?, feePerUur?})
 *   await window.bureausDB.update(id, patch)
 *     // patch: {naam?, standaardUurtarief?, feePerUur?, archived?}
 *   await window.bureausDB.archive(id)
 *   await window.bureausDB.restore(id)
 *   await window.bureausDB.delete(id)
 *
 * Sync helpers:
 *   window.bureausDB.getAllSync()
 *   window.bureausDB.ready  (Promise)
 *
 * Backward-compat globals:
 *   getBureaus()  → leest uit cache (was: localStorage)
 *
 * Events:
 *   "besa:bureaus-updated" op `window` na elke mutatie of bootstrap.
 *
 * Cache-formaat:
 *   { id, naam, standaardUurtarief, feePerUur, archived, aanmaakdatum, laatstGewijzigd }
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "hr_bureaus";
  var TABLE = "bureaus";
  var EVENT_NAME = "besa:bureaus-updated";

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam,
      standaardUurtarief: row.standaard_uurtarief !== null && row.standaard_uurtarief !== undefined
        ? Number(row.standaard_uurtarief)
        : null,
      feePerUur: row.fee_per_uur !== null && row.fee_per_uur !== undefined
        ? Number(row.fee_per_uur)
        : null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function dispatchUpdated() {
    try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); }
    catch (e) { /* noop */ }
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); }
    catch (e) { /* best effort */ }
    dispatchUpdated();
  }

  async function fetchAll() {
    if (!window.besaSupabase) {
      console.warn("[bureausDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: true });
    if (res.error) {
      console.error("[bureausDB] fetchAll error:", res.error);
      throw res.error;
    }
    var list = (res.data || []).map(rowToObj);
    writeCache(list);
    return list;
  }

  var bootstrapPromise = null;
  function bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async function () {
        try { await fetchAll(); }
        catch (e) { dispatchUpdated(); }
      })();
    }
    return bootstrapPromise;
  }

  function refresh() {
    bootstrapPromise = null;
    return bootstrap();
  }

  function toMoneyOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    if (n < 0) n = 0;
    return Math.round(n * 100) / 100;
  }

  async function add(input) {
    var src = input || {};
    var naam = String(src.naam || "").trim();
    if (!naam) throw new Error("Naam is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var payload = {
      naam: naam,
      standaard_uurtarief: toMoneyOrNull(src.standaardUurtarief),
      fee_per_uur: toMoneyOrNull(src.feePerUur),
      archived: false,
    };
    var res = await window.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache();
    list.push(newItem);
    writeCache(list);
    return newItem;
  }

  async function update(id, patch) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var dbPatch = {};
    if (typeof patch.naam === "string") dbPatch.naam = patch.naam.trim();
    if (Object.prototype.hasOwnProperty.call(patch, "standaardUurtarief")) {
      dbPatch.standaard_uurtarief = toMoneyOrNull(patch.standaardUurtarief);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "feePerUur")) {
      dbPatch.fee_per_uur = toMoneyOrNull(patch.feePerUur);
    }
    if (typeof patch.archived === "boolean") dbPatch.archived = patch.archived;
    if (Object.keys(dbPatch).length === 0) {
      var existing = readCache().find(function (b) { return b.id === id; });
      return existing || null;
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache().map(function (b) { return b.id === id ? newItem : b; });
    writeCache(list);
    return newItem;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var list = readCache().filter(function (b) { return b.id !== id; });
    writeCache(list);
    return true;
  }

  function getAllSync() { return readCache(); }

  function getBureausCompat() {
    return readCache().map(function (b) { return Object.assign({}, b); });
  }

  var api = {
    bootstrap: bootstrap,
    refresh: refresh,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
  };

  Object.defineProperty(api, "ready", {
    get: function () { return bootstrap(); },
  });

  global.bureausDB = api;
  global.getBureaus = getBureausCompat;

  // Auto-bootstrap zodra dit script laadt.
  bootstrap();
})(typeof window !== "undefined" ? window : this);
