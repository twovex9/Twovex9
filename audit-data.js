/* global window, localStorage */
/**
 * audit-data.js — read-only access tot audit-logs.
 *
 * Bestaand: public.beschikking_audit_log (domain-specifiek).
 * v1: alleen viewer. v2 zou een unified public.audit_log kunnen toevoegen
 * met triggers op meerdere tabellen.
 */
(function (global) {
  "use strict";

  var TABLE = "beschikking_audit_log";
  var CACHE_KEY = "audit_log_v1";

  function isoNow() { return new Date().toISOString(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      bron: "beschikking",
      resourceType: row.resource || "Beschikking",
      resourceId: row.beschikking_id || "",
      tijdstip: row.t || row.aanmaakdatum || isoNow(),
      actieType: row.act || "",
      gebruiker: row.gebruiker || "Onbekend",
      details: row.details || "",
      status: row.status || "succes",
      ipAdres: row.ip || "",
      userAgent: row.user_agent || "",
    };
  }

  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) || []) : []; } catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:audit-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("t", { ascending: false }).limit(500);
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
        console.error("[auditDB] Bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Audit — bootstrap", err);
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

  global.auditDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
