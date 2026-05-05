/* global window, localStorage */
/**
 * Compensatie/diensttypes — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: `public.comp_diensttypes`.
 * - localStorage onder "comp_diensttypes_configs" = read-cache (synchrone reads
 *   in compensatie-diensttypes.js blijven werken).
 * - `pushAll(arr)` synct de hele lokale lijst (bulk diff: upsert + delete) naar
 *   Supabase — wordt aangeroepen vanuit `saveConfigs()`.
 */
(function (global) {
  "use strict";

  var TABLE = "comp_diensttypes";
  var CACHE_KEY = "comp_diensttypes_configs";
  var MIGRATION_FLAG_KEY = "compDiensttypesMigratedToSupabase.v1";

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
    try { global.dispatchEvent(new CustomEvent("besa:comp-diensttypes-updated")); } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    var teams = Array.isArray(row.teams) ? row.teams : [];
    return {
      id: row.id,
      diensttype: row.diensttype || "",
      basis: Number(row.basis) || 0,
      overuren: Number(row.overuren) || 0,
      regels: row.regels || "full_time_only",
      teams: teams,
    };
  }
  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || ("cd_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      diensttype: String(safe.diensttype || ""),
      basis: Number(safe.basis) || 0,
      overuren: Number(safe.overuren) || 0,
      regels: safe.regels || "full_time_only",
      teams: Array.isArray(safe.teams) ? safe.teams : [],
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("aanmaakdatum", { ascending: true });
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
      console.info("[compDiensttypesDB] Migratie van " + local.length + " configs…");
      var ins = await global.besaSupabase.from(TABLE).insert(local.map(objToInsertPayload)).select();
      if (ins.error) {
        console.error("[compDiensttypesDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      return true;
    } catch (err) {
      console.error("[compDiensttypesDB] Migratiefout:", err);
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
        console.error("[compDiensttypesDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  async function pushAll(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      var existingHead = await global.besaSupabase.from(TABLE).select("id");
      if (existingHead.error) {
        console.error("[compDiensttypesDB] pushAll select mislukt:", existingHead.error);
        return;
      }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var payload = items.map(objToInsertPayload);
        var ups = await global.besaSupabase.from(TABLE).upsert(payload, { onConflict: "id" });
        if (ups.error) console.error("[compDiensttypesDB] upsert mislukt:", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) console.error("[compDiensttypesDB] delete mislukt:", del.error);
      }
    } catch (err) {
      console.error("[compDiensttypesDB] pushAll error:", err);
    }
  }

  global.compDiensttypesDB = {
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
