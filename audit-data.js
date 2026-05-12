/* global window, localStorage, Promise */
/**
 * audit-data.js — read-only access tot audit-logs.
 *
 * Bronnen (gemerged in één view):
 *  1. public.beschikking_audit_log (legacy, domain-specifiek — voor Beschikkingen)
 *  2. public.audit_log (generic — auto-populated door triggers op Taken, Verlof,
 *     Beleidsdocumenten, Teams, NotificatieTypes sinds Block 10)
 *
 * Beide tabellen worden parallel gefetched, genormaliseerd naar dezelfde shape
 * en gemerged + gesorteerd op tijdstip descending.
 */
(function (global) {
  "use strict";

  var TABLE_BESCH = "beschikking_audit_log";
  var TABLE_GENERIC = "audit_log";
  var CACHE_KEY = "audit_log_v2";  // bump om oude cache te invalideren
  var MAX_PER_SOURCE = 500;

  function isoNow() { return new Date().toISOString(); }

  // Normaliseer beschikking_audit_log row naar gemeenschappelijke shape
  function beschRowToObj(row) {
    if (!row) return null;
    return {
      id: "besch_" + row.id,
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

  // Normaliseer audit_log row naar gemeenschappelijke shape
  function genericRowToObj(row) {
    if (!row) return null;
    return {
      id: "gen_" + row.id,
      bron: "generic",
      resourceType: row.resource || "",
      resourceId: row.resource_id || "",
      tijdstip: row.aanmaakdatum || isoNow(),
      actieType: row.actie || "",
      gebruiker: row.gebruiker_label || "Systeem",
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

  function mergeSorted(items) {
    return items.slice().sort(function (a, b) {
      var at = a && a.tijdstip ? String(a.tijdstip) : "";
      var bt = b && b.tijdstip ? String(b.tijdstip) : "";
      if (at === bt) return 0;
      return at < bt ? 1 : -1;  // desc
    });
  }

  async function fetchBesch() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE_BESCH).select("*")
      .order("t", { ascending: false })
      .limit(MAX_PER_SOURCE);
    if (res.error) {
      console.warn("[auditDB] beschikking_audit_log fetch warning:", res.error);
      return [];
    }
    return (res.data || []).map(beschRowToObj).filter(Boolean);
  }

  async function fetchGeneric() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE_GENERIC).select("*")
      .order("aanmaakdatum", { ascending: false })
      .limit(MAX_PER_SOURCE);
    if (res.error) {
      console.warn("[auditDB] audit_log fetch warning:", res.error);
      return [];
    }
    return (res.data || []).map(genericRowToObj).filter(Boolean);
  }

  async function fetchAll() {
    var pair = await Promise.all([fetchBesch(), fetchGeneric()]);
    var merged = pair[0].concat(pair[1]);
    return mergeSorted(merged);
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

  function getDistinctResources() {
    var set = {};
    readCache().forEach(function (a) { if (a && a.resourceType) set[a.resourceType] = true; });
    return Object.keys(set).sort();
  }

  global.auditDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getDistinctResources: getDistinctResources,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
