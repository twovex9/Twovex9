/* global window, localStorage */
/**
 * Compensatie/berekeningen — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: `public.comp_berekeningen`.
 * - localStorage onder "comp_berekeningen_v1" = read-cache.
 * - `pushAll(arr)` bulk-sync (upsert + delete).
 *
 * UI is view-only; data-laag biedt CRUD-API voor toekomstige uitbreiding.
 */
(function (global) {
  "use strict";

  var TABLE = "comp_berekeningen";
  var CACHE_KEY = "comp_berekeningen_v1";

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
  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("ff:comp-berekeningen-updated")); } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      datumTs: Number(row.datum_ts) || 0,
      medewerker: row.medewerker || "",
      contractU: Number(row.contract_u) || 0,
      geplandU: Number(row.gepland_u) || 0,
      compensatieMin: Number(row.compensatie_min) || 0,
    };
  }
  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || ("cb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      datum_ts: Number(safe.datumTs) || 0,
      medewerker: String(safe.medewerker || ""),
      contract_u: Number(safe.contractU) || 0,
      gepland_u: Number(safe.geplandU) || 0,
      compensatie_min: Number(safe.compensatieMin) || 0,
    };
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).select("*").order("datum_ts", { ascending: true });
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
        console.error("[compBerekeningenDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  function reportSilent(action, err) {
    console.error("[compBerekeningenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Compensatie-berekeningen — " + action, err);
  }

  async function pushAll(items) {
    if (!global.ffSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      var existingHead = await global.ffSupabase.from(TABLE).select("id");
      if (existingHead.error) { reportSilent("pushAll select", existingHead.error); return; }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var ups = await global.ffSupabase.from(TABLE).upsert(items.map(objToInsertPayload), { onConflict: "id" });
        if (ups.error) reportSilent("upsert", ups.error);
      }
      // DIEHARD delete-guard (zelfde patroon als urendeclaraties-data.js / planning-data.js):
      // een lege/id-loze bron mag nooit de hele tabel wissen — dat duidt op een stale/mislukte
      // load (bv. save vóór de async-bootstrap), niet op een echte verwijdering.
      if (toDelete.length && localIds.length === 0 && existingIds.length > 0) {
        reportSilent("pushAll delete-guard", new Error("Totale wipe geweigerd: 0 geldige lokale id's tegen " + existingIds.length + " in DB"));
        toDelete = [];
      }
      if (toDelete.length) {
        var del = await global.ffSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) reportSilent("delete", del.error);
      }
    } catch (err) {
      reportSilent("pushAll", err);
    }
  }

  global.compBerekeningenDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushAll: pushAll,
    getAllSync: function () { return readCache(); },
    refresh: async function () {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
