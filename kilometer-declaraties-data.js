/* global window, localStorage */
/**
 * Kilometer-declaraties — Supabase data-laag.
 *
 * Bron-van-waarheid: tabel public.kilometer_declaraties.
 * Vergoeding-regel: 0,39 EUR/km, gecapt op 100 km per rit. Berekening
 * gebeurt client-side via window.kilometerDeclaratiesDB.calcVergoeding().
 *
 * Public API:
 *   kilometerDeclaratiesDB.ready
 *   kilometerDeclaratiesDB.refresh()
 *   kilometerDeclaratiesDB.getAllSync()
 *   kilometerDeclaratiesDB.getByIdSync(id)
 *   kilometerDeclaratiesDB.getForMedewerkerSync(medewerkerId, year?, month?)
 *   kilometerDeclaratiesDB.getMonthlyAggregatesSync()  → array per medewerker+maand
 *   kilometerDeclaratiesDB.add({medewerker_id, datum, type, beschrijving, locatie, dienst, kilometers, ingediend?})
 *   kilometerDeclaratiesDB.update(id, partial)
 *   kilometerDeclaratiesDB.markIngediend(medewerkerId, year, month)
 *   kilometerDeclaratiesDB.delete(id)
 *   kilometerDeclaratiesDB.calcVergoeding(km)  → number EUR
 *
 * Events: "besa:kilometer-declaraties-updated" op window.
 */
(function (global) {
  "use strict";

  var TABLE = "kilometer_declaraties";
  var CACHE_KEY = "kilometer_declaraties_v1";
  var EUR_PER_KM = 0.39;
  var MAX_KM_PER_RIT = 100;

  function generateId() {
    return "km_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function reportSilent(action, err) {
    try { console.error("[kilometerDeclaratiesDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Kilometer-declaraties — " + action, err);
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
      global.dispatchEvent(new CustomEvent("besa:kilometer-declaraties-updated", {
        detail: { source: source || "kilometer-declaraties-data" },
      }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerker_id: row.medewerker_id,
      datum: row.datum,
      type: row.type || "handmatig",
      beschrijving: row.beschrijving || "",
      locatie: row.locatie || "",
      dienst: row.dienst || "",
      kilometers: Number(row.kilometers || 0),
      ingediend: !!row.ingediend,
      ingediend_op: row.ingediend_op,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      medewerker_id: safe.medewerker_id || null,
      datum: safe.datum,
      type: safe.type === "kantoor" ? "kantoor" : "handmatig",
      beschrijving: String(safe.beschrijving || ""),
      locatie: String(safe.locatie || ""),
      dienst: String(safe.dienst || ""),
      kilometers: Number(safe.kilometers || 0),
      ingediend: !!safe.ingediend,
      ingediend_op: safe.ingediend_op || null,
    };
    payload.id = safe.id || generateId();
    return payload;
  }

  function objToUpdatePayload(o) {
    var safe = o || {};
    var payload = {};
    if (Object.prototype.hasOwnProperty.call(safe, "medewerker_id")) payload.medewerker_id = safe.medewerker_id || null;
    if (Object.prototype.hasOwnProperty.call(safe, "datum")) payload.datum = safe.datum;
    if (Object.prototype.hasOwnProperty.call(safe, "type")) payload.type = safe.type === "kantoor" ? "kantoor" : "handmatig";
    if (Object.prototype.hasOwnProperty.call(safe, "beschrijving")) payload.beschrijving = String(safe.beschrijving || "");
    if (Object.prototype.hasOwnProperty.call(safe, "locatie")) payload.locatie = String(safe.locatie || "");
    if (Object.prototype.hasOwnProperty.call(safe, "dienst")) payload.dienst = String(safe.dienst || "");
    if (Object.prototype.hasOwnProperty.call(safe, "kilometers")) payload.kilometers = Number(safe.kilometers || 0);
    if (Object.prototype.hasOwnProperty.call(safe, "ingediend")) payload.ingediend = !!safe.ingediend;
    if (Object.prototype.hasOwnProperty.call(safe, "ingediend_op")) payload.ingediend_op = safe.ingediend_op || null;
    return payload;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("datum", { ascending: false });
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

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getForMedewerkerSync(medewerkerId, year, month) {
    if (!medewerkerId) return [];
    var all = readCache();
    return all.filter(function (r) {
      if (!r || String(r.medewerker_id) !== String(medewerkerId)) return false;
      if (year != null || month != null) {
        if (!r.datum) return false;
        var d = new Date(r.datum);
        if (isNaN(d.getTime())) return false;
        if (year != null && d.getFullYear() !== Number(year)) return false;
        if (month != null && (d.getMonth() + 1) !== Number(month)) return false;
      }
      return true;
    });
  }

  /**
   * Aggregeer per (medewerker_id, year, month). Eén rij per maand.
   * Returns: [{medewerker_id, year, month, declaratiesCount, totaleKm, totaleVergoeding,
   *           ingediend (bool — alle ritten ingediend?), ingediend_op (laatste timestamp)}]
   */
  function getMonthlyAggregatesSync() {
    var all = readCache();
    var groups = new Map();
    all.forEach(function (r) {
      if (!r || !r.datum) return;
      var d = new Date(r.datum);
      if (isNaN(d.getTime())) return;
      var year = d.getFullYear();
      var month = d.getMonth() + 1;
      var key = (r.medewerker_id || "—") + "|" + year + "|" + month;
      if (!groups.has(key)) {
        groups.set(key, {
          medewerker_id: r.medewerker_id || null,
          year: year,
          month: month,
          declaratiesCount: 0,
          totaleKm: 0,
          totaleVergoeding: 0,
          ingediend: true,            // wordt false als één rit niet ingediend is
          ingediend_op: null,         // max van alle ingediend_op timestamps
        });
      }
      var g = groups.get(key);
      g.declaratiesCount += 1;
      g.totaleKm += Number(r.kilometers || 0);
      g.totaleVergoeding += calcVergoeding(Number(r.kilometers || 0));
      if (!r.ingediend) g.ingediend = false;
      if (r.ingediend_op) {
        if (!g.ingediend_op || new Date(r.ingediend_op) > new Date(g.ingediend_op)) {
          g.ingediend_op = r.ingediend_op;
        }
      }
    });
    return Array.from(groups.values()).sort(function (a, b) {
      // Nieuwste maand eerst, daarna alfabetisch op medewerker (later via JOIN op naam in UI).
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return 0;
    });
  }

  function calcVergoeding(km) {
    var n = Math.max(0, Math.min(Number(km || 0), MAX_KM_PER_RIT));
    return Math.round(n * EUR_PER_KM * 100) / 100;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.datum) throw new Error("Datum is verplicht");
    var res = await global.besaSupabase
      .from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(obj.id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var payload = objToUpdatePayload(partial || {});
    var res = await global.besaSupabase
      .from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function markIngediend(medewerkerId, year, month) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!medewerkerId) throw new Error("medewerkerId vereist");
    var rows = getForMedewerkerSync(medewerkerId, year, month).filter(function (r) { return !r.ingediend; });
    var now = new Date().toISOString();
    var updated = [];
    for (var i = 0; i < rows.length; i += 1) {
      var u = await update(rows[i].id, { ingediend: true, ingediend_op: now });
      updated.push(u);
    }
    return updated;
  }

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

  global.kilometerDeclaratiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    markIngediend: markIngediend,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
    getMonthlyAggregatesSync: getMonthlyAggregatesSync,
    calcVergoeding: calcVergoeding,
    constants: {
      EUR_PER_KM: EUR_PER_KM,
      MAX_KM_PER_RIT: MAX_KM_PER_RIT,
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
