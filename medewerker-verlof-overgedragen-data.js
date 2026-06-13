/* global window, localStorage */
/**
 * Medewerker verlof-overgedragen — Supabase data-laag (1-op-1 met medewerker).
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `medewerker_verlof_overgedragen`.
 *  - Bij bootstrap fetcht deze module ALLE rijen (1 per medewerker met
 *    overdracht) en cachet ze onder "medewerker_verlof_overgedragen_v1".
 *  - Schrijfactie `save(empId, state)` doet een UPSERT op (medewerker_id);
 *    de cache wordt geüpdatet en `ff:medewerker-verlof-overgedragen-updated`
 *    event firet voor live re-render.
 *  - Eénmalige migratie van legacy localStorage["employeeEditsById"] →
 *    elke `[empId].verlofOvergedragen` object wordt 1× UPSERTed.
 *
 * Gebruik:
 *   await window.medewerkerVerlofOvergedragenDB.ready;
 *   var st = window.medewerkerVerlofOvergedragenDB.getForMedewerkerSync(empId);
 *   //   → null indien geen overdracht, anders { wetTotaal, wetGebruikt, ... }
 *   await window.medewerkerVerlofOvergedragenDB.save(empId, {
 *     wetTotaal: 80, wetGebruikt: 12, wetBeschikbaar: 68,
 *     bovenwetTotaal: 40, bovenwetGebruikt: 0, bovenwetBeschikbaar: 40,
 *     reden: "Overdracht 2025 → 2026",
 *   });
 *   window.addEventListener("ff:medewerker-verlof-overgedragen-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "medewerker_verlof_overgedragen";
  var CACHE_KEY = "medewerker_verlof_overgedragen_v1";
  var LEGACY_KEY = "employeeEditsById";
  var MIGRATION_FLAG = "medewerkerVerlofOvergedragenMigratedToSupabase.v1";

  function isoNow() { return new Date().toISOString(); }

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

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:medewerker-verlof-overgedragen-updated", { detail: { source: source || "medewerker-verlof-overgedragen-data" } }));
    } catch (e) { /* */ }
  }

  function toNumber(v) {
    if (v == null || v === "") return 0;
    var n = Number(String(v).replace(",", "."));
    return isFinite(n) ? n : 0;
  }

  // Frontend conventie blijft camelCase (wetTotaal, etc.); DB-kolommen
  // zijn snake_case. Hier mappen.
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      wetTotaal: toNumber(row.wet_totaal),
      wetGebruikt: toNumber(row.wet_gebruikt),
      wetBeschikbaar: toNumber(row.wet_beschikbaar),
      bovenwetTotaal: toNumber(row.bovenwet_totaal),
      bovenwetGebruikt: toNumber(row.bovenwet_gebruikt),
      bovenwetBeschikbaar: toNumber(row.bovenwet_beschikbaar),
      reden: row.reden || "",
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToUpsertPayload(empId, o) {
    var safe = o || {};
    return {
      medewerker_id: String(empId || ""),
      wet_totaal: toNumber(safe.wetTotaal),
      wet_gebruikt: toNumber(safe.wetGebruikt),
      wet_beschikbaar: toNumber(safe.wetBeschikbaar),
      bovenwet_totaal: toNumber(safe.bovenwetTotaal),
      bovenwet_gebruikt: toNumber(safe.bovenwetGebruikt),
      bovenwet_beschikbaar: toNumber(safe.bovenwetBeschikbaar),
      reden: safe.reden ? String(safe.reden) : null,
    };
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*");
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG) === "1") return false;
      if (!global.ffSupabase) return false;

      var head = await global.ffSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      var legacyRaw = "{}";
      try { legacyRaw = localStorage.getItem(LEGACY_KEY) || "{}"; } catch (e) { /* */ }
      var legacy = {};
      try { legacy = JSON.parse(legacyRaw) || {}; } catch (e) { legacy = {}; }
      if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      var rows = [];
      Object.keys(legacy).forEach(function (empId) {
        var bucket = legacy[empId];
        if (!bucket || typeof bucket !== "object") return;
        var st = bucket.verlofOvergedragen;
        if (!st || typeof st !== "object") return;
        // Alleen migreren als er minstens één veld een non-zero waarde heeft;
        // anders is het een lege defaultset die we niet hoeven op te slaan.
        var hasData = ["wetTotaal", "wetGebruikt", "wetBeschikbaar", "bovenwetTotaal", "bovenwetGebruikt", "bovenwetBeschikbaar"]
          .some(function (k) { return toNumber(st[k]) > 0; });
        if (!hasData && !(st.reden && String(st.reden).trim())) return;
        rows.push(objToUpsertPayload(empId, st));
      });

      if (rows.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[medewerkerVerlofOvergedragenDB] Eenmalige migratie van " + rows.length + " verlof-overdracht-records naar Supabase…");
      var ins = await global.ffSupabase
        .from(TABLE)
        .upsert(rows, { onConflict: "medewerker_id" })
        .select();
      if (ins.error) {
        console.error("[medewerkerVerlofOvergedragenDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      console.info("[medewerkerVerlofOvergedragenDB] Migratie geslaagd: " + (ins.data || []).length + " records naar Supabase.");
      return true;
    } catch (err) {
      console.error("[medewerkerVerlofOvergedragenDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[medewerkerVerlofOvergedragenDB] Bootstrap mislukt:", err);
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

  // save() = upsert. Eén rij per medewerker (UNIQUE constraint op
  // medewerker_id). Geeft het opgeslagen object terug.
  async function save(medewerkerId, state) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!medewerkerId) throw new Error("medewerkerId verplicht");
    var payload = objToUpsertPayload(medewerkerId, state);
    var res = await global.ffSupabase
      .from(TABLE)
      .upsert(payload, { onConflict: "medewerker_id" })
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.medewerkerId) === String(medewerkerId); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("save");
    return obj;
  }

  async function remove(medewerkerId) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!medewerkerId) return false;
    var res = await global.ffSupabase
      .from(TABLE)
      .delete()
      .eq("medewerker_id", medewerkerId);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.medewerkerId) !== String(medewerkerId); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return null;
    var s = String(medewerkerId);
    var found = readCache().find(function (r) { return r && String(r.medewerkerId) === s; });
    return found ? Object.assign({}, found) : null;
  }

  global.medewerkerVerlofOvergedragenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    save: save,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getForMedewerkerSync: getForMedewerkerSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
