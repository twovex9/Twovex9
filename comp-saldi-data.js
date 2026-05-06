/* global window, localStorage */
/**
 * Compensatie/saldi — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: `public.comp_saldi`.
 * - localStorage onder "comp_saldi_v1" = read-cache.
 * - `pushAll(arr)` bulk-sync (upsert + delete) naar Supabase.
 *
 * UI is voorlopig view-only; deze data-laag is "auth-ready" voor wanneer
 * editen/toevoegen later wordt geïmplementeerd.
 */
(function (global) {
  "use strict";

  var TABLE = "comp_saldi";
  var CACHE_KEY = "comp_saldi_v1";
  var MIGRATION_FLAG_KEY = "compSaldiMigratedToSupabase.v1";

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
    try { global.dispatchEvent(new CustomEvent("besa:comp-saldi-updated")); } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerker: row.medewerker || "",
      team: row.team || "",
      verdiend: Number(row.verdiend) || 0,
      gebruikt: Number(row.gebruikt) || 0,
      saldo: Number(row.saldo) || 0,
      geschiktheidLabel: row.geschiktheid_label || "",
    };
  }
  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || ("cs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      medewerker: String(safe.medewerker || ""),
      team: String(safe.team || ""),
      verdiend: Number(safe.verdiend) || 0,
      gebruikt: Number(safe.gebruikt) || 0,
      saldo: Number(safe.saldo) || 0,
      geschiktheid_label: String(safe.geschiktheidLabel || ""),
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("medewerker", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        if (localStorage.getItem(MIGRATION_FLAG_KEY) !== "1") {
          try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        }
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated();
      } catch (err) {
        console.error("[compSaldiDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  function reportSilent(action, err) {
    console.error("[compSaldiDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Compensatie-saldi — " + action, err);
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
        var ups = await global.besaSupabase.from(TABLE).upsert(items.map(objToInsertPayload), { onConflict: "id" });
        if (ups.error) reportSilent("upsert", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) reportSilent("delete", del.error);
      }
    } catch (err) {
      reportSilent("pushAll", err);
    }
  }

  global.compSaldiDB = {
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
