/* global window, localStorage */
/**
 * Planning — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: Supabase tabel `planning`.
 * - localStorage onder "planningItems" = read-cache (synchrone reads in
 *   planning.js blijven werken).
 * - Schrijfacties (writePlanningItems) worden door planning.js aangeroepen;
 *   deze data-laag biedt `pushFullCache()` om de hele lijst sync naar
 *   Supabase te zetten (bulk overwrite — pragmatisch voor MVP).
 */
(function (global) {
  "use strict";

  var TABLE = "planning";
  var CACHE_KEY = "planningItems";
  var MIGRATION_FLAG_KEY = "planningMigratedToSupabase.v1";

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
    try { global.dispatchEvent(new CustomEvent("besa:planning-updated")); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Mapping rij ⇄ object
  // ---------------------------------------------------------------------------
  var EXPLICIT_FIELDS = [
    "id", "start", "einde",
    "diensttype", "afdeling", "functie",
    "teamlead", "teamlid", "client",
    "vestiging", "locatie",
    "conflict", "archived",
  ];

  function toIsoOrNull(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function rowToObj(row) {
    if (!row) return null;
    var data = row.data && typeof row.data === "object" ? row.data : {};
    return Object.assign({}, data, {
      id: row.id,
      start: row.start_iso || "",
      einde: row.einde_iso || "",
      diensttype: row.diensttype || "",
      afdeling: row.afdeling || "",
      functie: row.functie || "",
      teamlead: row.teamlead || "",
      teamlid: row.teamlid || "",
      client: row.client || "",
      vestiging: row.vestiging || "",
      locatie: row.locatie || "",
      conflict: !!row.conflict,
      archived: !!row.archived,
    });
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var data = {};
    Object.keys(safe).forEach(function (k) {
      if (EXPLICIT_FIELDS.indexOf(k) >= 0) return;
      data[k] = safe[k];
    });
    return {
      id: safe.id || ("p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8)),
      start_iso: toIsoOrNull(safe.start),
      einde_iso: toIsoOrNull(safe.einde),
      diensttype: safe.diensttype || null,
      afdeling: safe.afdeling || null,
      functie: safe.functie || null,
      teamlead: safe.teamlead || null,
      teamlid: safe.teamlid || null,
      client: safe.client || null,
      vestiging: safe.vestiging || null,
      locatie: safe.locatie || null,
      conflict: !!safe.conflict,
      archived: !!safe.archived,
      data: data,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("start_iso", { ascending: true, nullsFirst: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;

      var head = await global.besaSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var local = readCache();
      if (!Array.isArray(local) || local.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[planningDB] Eenmalige migratie van " + local.length + " planning-items…");
      var payload = local.map(function (r) { return objToInsertPayload(r); });
      var ins = await global.besaSupabase.from(TABLE).insert(payload).select();
      if (ins.error) {
        console.error("[planningDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[planningDB] Migratie geslaagd: " + (ins.data || []).length + " items.");
      return true;
    } catch (err) {
      console.error("[planningDB] Migratiefout:", err);
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
        console.error("[planningDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  /**
   * Bulk full-overwrite: synct de hele lokale cache naar Supabase. Wordt
   * door planning.js aangeroepen na elke writePlanningItems() — pragmatisch
   * voor MVP. Optimalisatie (diff) kan later.
   */
  function reportSilent(action, err) {
    console.error("[planningDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Planning — " + action, err);
  }

  async function pushFullCache(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      // Diff-strategie: upsert alle records (id is primary key) en delete wat
      // niet meer in de lijst staat.
      var existingHead = await global.besaSupabase.from(TABLE).select("id");
      if (existingHead.error) { reportSilent("pushFullCache select", existingHead.error); return; }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var payload = items.map(function (r) { return objToInsertPayload(r); });
        var ups = await global.besaSupabase.from(TABLE).upsert(payload, { onConflict: "id" });
        if (ups.error) reportSilent("upsert", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) reportSilent("delete", del.error);
      }
    } catch (err) {
      reportSilent("pushFullCache", err);
    }
  }

  function getAllSync() { return readCache(); }

  global.planningDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushFullCache: pushFullCache,
    getAllSync: getAllSync,
    refresh: async function () {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
