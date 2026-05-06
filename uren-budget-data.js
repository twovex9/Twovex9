/* global window, localStorage */
/**
 * Uren budget — Supabase data-laag met localStorage als read-cache.
 *
 * Datastructuur in cache: { [clientId]: { [jaar]: { [week]: uren } } }.
 * Per cel een rij in `public.uren_budget`.
 *
 * Schrijfacties zijn cell-level (upsert/delete) en gebeuren async via
 * `setCell(clientId, jaar, week, uren)` — geroepen door uren-budgettering.js
 * direct na de localStorage-write.
 */
(function (global) {
  "use strict";

  var TABLE = "uren_budget";
  var CACHE_KEY = "besaUrenBudgetV1";
  var MIGRATION_FLAG_KEY = "urenBudgetMigratedToSupabase.v1";

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var p = raw ? JSON.parse(raw) : {};
      return (p && typeof p === "object") ? p : {};
    } catch (e) { return {}; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj || {})); } catch (e) { /* */ }
  }
  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("besa:uren-budget-updated")); } catch (e) { /* */ }
  }

  function rowsToObj(rows) {
    var out = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.client_id) return;
      if (!out[r.client_id]) out[r.client_id] = {};
      if (!out[r.client_id][r.jaar]) out[r.client_id][r.jaar] = {};
      out[r.client_id][r.jaar][String(r.week)] = Number(r.uren) || 0;
    });
    return out;
  }

  function objToRows(obj) {
    var rows = [];
    Object.keys(obj || {}).forEach(function (cid) {
      var byYear = obj[cid] || {};
      Object.keys(byYear).forEach(function (yr) {
        var byWeek = byYear[yr] || {};
        Object.keys(byWeek).forEach(function (wk) {
          var u = Number(byWeek[wk]);
          if (!isFinite(u) || u === 0) return;
          rows.push({
            client_id: cid,
            jaar: parseInt(yr, 10),
            week: parseInt(wk, 10),
            uren: u,
          });
        });
      });
    });
    return rows;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*");
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;

      var head = await global.besaSupabase
        .from(TABLE)
        .select("client_id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var local = readCache();
      var rows = objToRows(local);
      if (!rows.length) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[urenBudgetDB] Eenmalige migratie van " + rows.length + " budget-cellen…");
      var ins = await global.besaSupabase.from(TABLE).insert(rows).select();
      if (ins.error) {
        console.error("[urenBudgetDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[urenBudgetDB] Migratie geslaagd: " + (ins.data || []).length + " cellen.");
      return true;
    } catch (err) {
      console.error("[urenBudgetDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var rows = await fetchAll();
        var obj = rowsToObj(rows);
        writeCache(obj);
        dispatchUpdated();
      } catch (err) {
        console.error("[urenBudgetDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  function reportSilent(action, err) {
    console.error("[urenBudgetDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Uren-budget — " + action, err);
  }

  /** Async cell-level upsert (of delete als uren=0). */
  async function setCell(clientId, jaar, week, uren) {
    if (!clientId) return;
    if (!global.besaSupabase) return;
    var jr = parseInt(jaar, 10);
    var wk = parseInt(week, 10);
    var u = Number(uren);
    try {
      if (!isFinite(u) || u === 0) {
        var del = await global.besaSupabase
          .from(TABLE)
          .delete()
          .eq("client_id", clientId)
          .eq("jaar", jr)
          .eq("week", wk);
        if (del.error) reportSilent("delete", del.error);
        return;
      }
      var ups = await global.besaSupabase
        .from(TABLE)
        .upsert({ client_id: clientId, jaar: jr, week: wk, uren: u }, { onConflict: "client_id,jaar,week" });
      if (ups.error) reportSilent("upsert", ups.error);
    } catch (err) {
      reportSilent("setCell", err);
    }
  }

  function getStoreSync() { return readCache(); }

  global.urenBudgetDB = {
    get ready() { return readyPromise || bootstrap(); },
    setCell: setCell,
    getStoreSync: getStoreSync,
    refresh: async function () {
      var rows = await fetchAll();
      writeCache(rowsToObj(rows));
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
