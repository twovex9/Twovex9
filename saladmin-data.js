/* global window, localStorage */
/**
 * Salarisadministratie — Supabase data-laag voor:
 *   1. Export-historie (saladmin_export_history)
 *   2. ORT-regels per jaar (saladmin_ort, jaar=current year als key)
 *
 * - localStorage onder "saladmin_export_history" en "saladmin_ort_rules" =
 *   read-caches; bestaande logica in salarisadministratie-exporter.js blijft
 *   sync werken.
 * - `pushHistory(arr)` synct de hele exportlijst naar Supabase.
 * - `pushOrt(data)` slaat het ORT-config object op (jaar = huidig jaar).
 */
(function (global) {
  "use strict";

  var TABLE_HISTORY = "saladmin_export_history";
  var TABLE_ORT = "saladmin_ort";
  var CACHE_HISTORY = "saladmin_export_history";
  var CACHE_ORT = "saladmin_ort_rules";
  var MIGRATION_FLAG_KEY = "saladminMigratedToSupabase.v1";
  var ORT_DEFAULT_JAAR = new Date().getFullYear();

  function readCache(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var p = JSON.parse(raw);
      return p === undefined ? fallback : p;
    } catch (e) { return fallback; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* */ }
  }
  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("besa:saladmin-updated")); } catch (e) { /* */ }
  }

  function rowToHistoryObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at || "",
      period: row.period || "",
      employees: Number(row.employees) || 0,
      by: row.by_name || "",
      csv: row.csv || null,
    };
  }
  function historyObjToPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || ("h_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      created_at: safe.createdAt || new Date().toISOString(),
      period: String(safe.period || ""),
      employees: Number(safe.employees) || 0,
      by_name: String(safe.by || ""),
      csv: safe.csv || null,
    };
  }

  // ---------------------------------------------------------------------------
  // Async helpers
  // ---------------------------------------------------------------------------
  async function fetchAllHistory() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE_HISTORY)
      .select("*")
      .order("created_at", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToHistoryObj).filter(Boolean);
  }

  async function fetchOrt(jaar) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var yr = jaar || ORT_DEFAULT_JAAR;
    var res = await global.besaSupabase
      .from(TABLE_ORT)
      .select("data")
      .eq("jaar", yr)
      .maybeSingle();
    if (res.error) {
      console.error("[saladminDB] fetchOrt error:", res.error);
      return null;
    }
    return res.data ? res.data.data : null;
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;
      var head = await global.besaSupabase.from(TABLE_HISTORY).select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }
      var localHistory = readCache(CACHE_HISTORY, []);
      if (Array.isArray(localHistory) && localHistory.length) {
        console.info("[saladminDB] Migratie van " + localHistory.length + " export-rijen…");
        var ins = await global.besaSupabase.from(TABLE_HISTORY).insert(localHistory.map(historyObjToPayload));
        if (ins.error) console.error("[saladminDB] migratie history mislukt:", ins.error);
      }
      var localOrt = readCache(CACHE_ORT, null);
      if (localOrt && typeof localOrt === "object") {
        var ortIns = await global.besaSupabase
          .from(TABLE_ORT)
          .upsert({ jaar: ORT_DEFAULT_JAAR, data: localOrt }, { onConflict: "jaar" });
        if (ortIns.error) console.error("[saladminDB] migratie ort mislukt:", ortIns.error);
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      return true;
    } catch (err) {
      console.error("[saladminDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var history = await fetchAllHistory();
        writeCache(CACHE_HISTORY, history);
        var ort = await fetchOrt(ORT_DEFAULT_JAAR);
        if (ort) writeCache(CACHE_ORT, ort);
        dispatchUpdated();
      } catch (err) {
        console.error("[saladminDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  /** Bulk full-overwrite van historie (upsert + delete missende ID's). */
  async function pushHistory(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      var existingHead = await global.besaSupabase.from(TABLE_HISTORY).select("id");
      if (existingHead.error) {
        console.error("[saladminDB] pushHistory select mislukt:", existingHead.error);
        return;
      }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var payload = items.map(historyObjToPayload);
        var ups = await global.besaSupabase.from(TABLE_HISTORY).upsert(payload, { onConflict: "id" });
        if (ups.error) console.error("[saladminDB] upsert history mislukt:", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE_HISTORY).delete().in("id", toDelete);
        if (del.error) console.error("[saladminDB] delete history mislukt:", del.error);
      }
    } catch (err) {
      console.error("[saladminDB] pushHistory error:", err);
    }
  }

  /** Sla het hele ORT-config object op voor het huidige jaar. */
  async function pushOrt(data, jaar) {
    if (!global.besaSupabase) return;
    if (!data || typeof data !== "object") return;
    var yr = jaar || ORT_DEFAULT_JAAR;
    try {
      var ups = await global.besaSupabase
        .from(TABLE_ORT)
        .upsert({ jaar: yr, data: data }, { onConflict: "jaar" });
      if (ups.error) console.error("[saladminDB] upsert ort mislukt:", ups.error);
    } catch (err) {
      console.error("[saladminDB] pushOrt error:", err);
    }
  }

  global.saladminDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushHistory: pushHistory,
    pushOrt: pushOrt,
    refresh: async function () {
      var history = await fetchAllHistory();
      writeCache(CACHE_HISTORY, history);
      var ort = await fetchOrt(ORT_DEFAULT_JAAR);
      if (ort) writeCache(CACHE_ORT, ort);
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
