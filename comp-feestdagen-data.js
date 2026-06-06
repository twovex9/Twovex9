/* global window, localStorage */
/**
 * Compensatie/feestdagen — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: `public.comp_feestdagen`.
 * - localStorage onder "comp_feestdagen_config_rows" = read-cache.
 * - `pushAll(arr)` bulk-syncs naar Supabase (upsert + delete).
 */
(function (global) {
  "use strict";

  var TABLE = "comp_feestdagen";
  var CACHE_KEY = "comp_feestdagen_config_rows";
  var MIGRATION_FLAG_KEY = "compFeestdagenMigratedToSupabase.v1";

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
    try { global.dispatchEvent(new CustomEvent("besa:comp-feestdagen-updated")); } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      datumTs: Number(row.datum_ts) || 0,
      tarief: Number(row.tarief) || 1,
    };
  }
  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || ("cf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      naam: String(safe.naam || ""),
      datum_ts: Number(safe.datumTs) || 0,
      tarief: Number(safe.tarief) || 1,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("datum_ts", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;
      var head = await global.besaSupabase.from(TABLE).select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }
      var local = readCache();
      if (!local.length) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }
      console.info("[compFeestdagenDB] Migratie van " + local.length + " feestdagen…");
      var ins = await global.besaSupabase.from(TABLE).insert(local.map(objToInsertPayload)).select();
      if (ins.error) {
        console.error("[compFeestdagenDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      return true;
    } catch (err) {
      console.error("[compFeestdagenDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated();
      } catch (err) {
        console.error("[compFeestdagenDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  function reportSilent(action, err) {
    console.error("[compFeestdagenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Feestdagen — " + action, err);
  }

  async function pushAll(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      var existingHead = await global.besaSupabase.from(TABLE).select("id");
      if (existingHead.error) { reportSilent("pushAll select", existingHead.error); return; }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var payload = items.map(objToInsertPayload);
        var ups = await global.besaSupabase.from(TABLE).upsert(payload, { onConflict: "id" });
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
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) reportSilent("delete", del.error);
      }
    } catch (err) {
      reportSilent("pushAll", err);
    }
  }

  global.compFeestdagenDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushAll: pushAll,
    refresh: async function () {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
