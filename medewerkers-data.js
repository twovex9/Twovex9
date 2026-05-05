/**
 * Data-laag voor 'medewerkers' (HR — master entity).
 *
 * Bron van waarheid: Supabase tabel public.medewerkers.
 * Cache: localStorage onder TWEE keys:
 *   - "employeeItems"  (huidige key in script.js / medewerker.js)
 *   - "employees"      (legacy key die door andere modules gelezen wordt)
 * Beide caches zijn altijd in sync met elkaar.
 *
 * Schema-mapping:
 *   db row → js object
 *   - id, voornaam, achternaam, email, fase, dienstverband, functie,
 *     archived, aanmaakdatum, laatstGewijzigd komen uit eigen kolommen
 *   - alle overige velden komen uit row.data (jsonb)
 *
 * Public async API:
 *   await window.medewerkersDB.bootstrap()
 *   await window.medewerkersDB.refresh()
 *   await window.medewerkersDB.add(emp)
 *   await window.medewerkersDB.update(id, patch)
 *   await window.medewerkersDB.archive(id)
 *   await window.medewerkersDB.restore(id)
 *   await window.medewerkersDB.delete(id)
 *
 * Sync helpers:
 *   window.medewerkersDB.getAllSync()          → array
 *   window.medewerkersDB.getByIdSync(id)       → object | null
 *   window.medewerkersDB.ready                 → Promise (bootstrap)
 *
 * Events:
 *   "besa:medewerkers-updated" op `window` na elke mutatie of bootstrap.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "employeeItems";
  var LEGACY_CACHE_KEY = "employees";
  var MIGRATION_FLAG_KEY = "besaMedewerkersMigrationDone_v1";
  var TABLE = "medewerkers";
  var EVENT_NAME = "besa:medewerkers-updated";

  // Velden die als eigen kolom in de DB staan (niet in data jsonb).
  var TOP_LEVEL_FIELDS = [
    "voornaam",
    "achternaam",
    "email",
    "fase",
    "dienstverband",
    "functie",
    "archived",
  ];

  function rowToObj(row) {
    if (!row) return null;
    var data = row.data && typeof row.data === "object" ? row.data : {};
    // Top-level kolommen winnen van data-jsonb om consistentie te garanderen.
    var merged = Object.assign({}, data, {
      id: row.id,
      voornaam: row.voornaam || "",
      achternaam: row.achternaam || "",
      email: row.email || "",
      fase: row.fase || "In dienst",
      dienstverband: row.dienstverband || data.dienstverband || "",
      functie: row.functie || data.functie || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    });
    return merged;
  }

  function objToInsertPayload(emp) {
    var src = emp || {};
    var data = {};
    Object.keys(src).forEach(function (k) {
      if (k === "id" || k === "aanmaakdatum" || k === "laatstGewijzigd") return;
      if (TOP_LEVEL_FIELDS.indexOf(k) !== -1) return;
      data[k] = src[k];
    });
    return {
      voornaam: String(src.voornaam || ""),
      achternaam: String(src.achternaam || ""),
      email: src.email != null ? String(src.email) : null,
      fase: src.fase != null ? String(src.fase) : "In dienst",
      dienstverband: src.dienstverband != null ? String(src.dienstverband) : null,
      functie: src.functie != null ? String(src.functie) : null,
      archived: !!src.archived,
      data: data,
    };
  }

  function objToUpdatePayload(patch, currentData) {
    var src = patch || {};
    var dbPatch = {};
    var dataChanged = false;
    var data = Object.assign({}, currentData || {});
    Object.keys(src).forEach(function (k) {
      if (k === "id" || k === "aanmaakdatum" || k === "laatstGewijzigd") return;
      if (TOP_LEVEL_FIELDS.indexOf(k) !== -1) {
        if (k === "archived") dbPatch.archived = !!src[k];
        else if (k === "email") dbPatch.email = src[k] == null ? null : String(src[k]);
        else dbPatch[k] = src[k] == null ? null : String(src[k]);
      } else {
        data[k] = src[k];
        dataChanged = true;
      }
    });
    if (dataChanged) dbPatch.data = data;
    return dbPatch;
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function dispatchUpdated() {
    try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); }
    catch (e) { /* noop */ }
  }

  function writeCache(list) {
    var safe = Array.isArray(list) ? list : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(safe)); }
    catch (e) { /* best effort */ }
    try { localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(safe)); }
    catch (e) { /* best effort */ }
    dispatchUpdated();
  }

  async function fetchAll() {
    if (!window.besaSupabase) {
      console.warn("[medewerkersDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("achternaam", { ascending: true });
    if (res.error) {
      console.error("[medewerkersDB] fetchAll error:", res.error);
      throw res.error;
    }
    var list = (res.data || []).map(rowToObj);
    writeCache(list);
    return list;
  }

  /**
   * Eenmalige migratie: als Supabase leeg is en de gebruiker had al medewerkers
   * in localStorage staan, upload die dan eenmalig naar Supabase. Daarna wordt
   * een vlag gezet zodat dit niet opnieuw gebeurt op andere apparaten.
   */
  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!window.besaSupabase) return false;

      // Lezen van bestaande Supabase-data: alleen migreren als die leeg is.
      var head = await window.besaSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        // Database heeft al data — geen migratie meer nodig op dit apparaat.
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var local = readCache();
      if (!Array.isArray(local) || local.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[medewerkersDB] Eenmalige migratie van " + local.length + " medewerkers naar Supabase…");
      var payload = local.map(function (emp) { return objToInsertPayload(emp); });
      var ins = await window.besaSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[medewerkersDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[medewerkersDB] Migratie geslaagd: " + (ins.data || []).length + " medewerkers geüpload.");
      return true;
    } catch (err) {
      console.error("[medewerkersDB] Migratiefout:", err);
      return false;
    }
  }

  /**
   * Eenmalige migratie van de legacy 'employeeEditsById' overlay (verzuim,
   * notities, documenten, verlofOvergedragen, etc.) naar de medewerkers.data
   * jsonb kolom in Supabase. Daarna wordt de localStorage-overlay gewist.
   *
   * Elke entry uit employeeEditsById wordt alleen gemigreerd als:
   *   - de key (= medewerker-id) overeenkomt met een bestaande medewerker in
   *     de cache (geen 'legacy:...' fallback-keys);
   *   - er minstens één relevant overlay-veld in de entry staat.
   */
  var EDITS_MIGRATION_FLAG = "besaEmpEditsMigrationDone_v1";
  var EDITS_LEGACY_KEY = "employeeEditsById";
  var OVERLAY_FIELDS_TO_MIGRATE = [
    "verzuim",
    "notities",
    "documenten",
    "verlofOvergedragen",
  ];

  async function maybeMigrateEmployeeEditsByIdOnce() {
    try {
      if (localStorage.getItem(EDITS_MIGRATION_FLAG) === "1") return false;
      if (!window.besaSupabase) return false;

      var raw = localStorage.getItem(EDITS_LEGACY_KEY);
      if (!raw) {
        try { localStorage.setItem(EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }
      var edits;
      try { edits = JSON.parse(raw); } catch (e) { edits = null; }
      if (!edits || typeof edits !== "object") {
        try { localStorage.setItem(EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      var byId = {};
      var cache = readCache();
      for (var i = 0; i < cache.length; i++) {
        if (cache[i] && cache[i].id) byId[cache[i].id] = true;
      }

      var migrated = 0;
      var skipped = 0;
      var keys = Object.keys(edits);
      for (var k = 0; k < keys.length; k++) {
        var empId = keys[k];
        if (!empId || typeof empId !== "string") continue;
        if (empId.indexOf("legacy:") === 0) { skipped++; continue; }
        if (!byId[empId]) { skipped++; continue; }

        var entry = edits[empId];
        if (!entry || typeof entry !== "object") continue;

        var patch = {};
        var hasField = false;
        for (var f = 0; f < OVERLAY_FIELDS_TO_MIGRATE.length; f++) {
          var field = OVERLAY_FIELDS_TO_MIGRATE[f];
          if (Object.prototype.hasOwnProperty.call(entry, field)) {
            patch[field] = entry[field];
            hasField = true;
          }
        }
        if (!hasField) continue;

        try {
          await update(empId, patch);
          migrated++;
        } catch (err) {
          console.warn("[medewerkersDB] employeeEditsById migratie van " + empId + " mislukt:", err);
        }
      }

      if (migrated > 0) {
        console.info("[medewerkersDB] employeeEditsById migratie: " + migrated + " medewerker-overlays naar Supabase verplaatst (" + skipped + " overgeslagen).");
      }
      try { localStorage.setItem(EDITS_MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      // localStorage-overlay opruimen (legacy data zit nu in DB).
      try { localStorage.removeItem(EDITS_LEGACY_KEY); } catch (e) { /* */ }
      return migrated > 0;
    } catch (err) {
      console.error("[medewerkersDB] employeeEditsById migratie fout:", err);
      return false;
    }
  }

  var bootstrapPromise = null;
  function bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async function () {
        try {
          await maybeMigrateLocalToSupabase();
          await fetchAll();
          // Pas migratie van overlays uitvoeren NA fetchAll, want we hebben de
          // cache nodig om geldige medewerker-ids te kennen.
          await maybeMigrateEmployeeEditsByIdOnce();
        } catch (e) {
          dispatchUpdated();
        }
      })();
    }
    return bootstrapPromise;
  }

  function refresh() {
    bootstrapPromise = null;
    return bootstrap();
  }

  async function add(emp) {
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var payload = objToInsertPayload(emp);
    var res = await window.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache();
    list.unshift(newItem);
    writeCache(list);
    return newItem;
  }

  async function update(id, patch) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var current = readCache().find(function (e) { return e.id === id; }) || {};
    // Reconstrueer het 'data' deel van de huidige cached medewerker:
    var currentData = {};
    Object.keys(current).forEach(function (k) {
      if (k === "id" || k === "aanmaakdatum" || k === "laatstGewijzigd") return;
      if (TOP_LEVEL_FIELDS.indexOf(k) !== -1) return;
      currentData[k] = current[k];
    });
    var dbPatch = objToUpdatePayload(patch, currentData);
    if (Object.keys(dbPatch).length === 0) return current.id ? current : null;
    var res = await window.besaSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache().map(function (e) { return e.id === id ? newItem : e; });
    writeCache(list);
    return newItem;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var list = readCache().filter(function (e) { return e.id !== id; });
    writeCache(list);
    return true;
  }

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (!id) return null;
    var list = readCache();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  /**
   * Synchrone "fire-and-forget" upsert: gebruikt door medewerker.js wanneer
   * de detailpagina naar localStorage schrijft. Dit synct dezelfde wijziging
   * asynchroon naar Supabase. Niet ideaal voor race-condities maar werkt
   * binnen de huidige UX (gebruiker bewerkt 1 medewerker tegelijk).
   */
  function syncFromLocalUpsert(emp) {
    if (!emp || !window.besaSupabase) return;
    var id = emp.id || emp.empId;
    if (!id) return;
    update(id, emp).catch(function (err) {
      console.error("[medewerkersDB] sync upsert mislukt:", err);
    });
  }

  var api = {
    bootstrap: bootstrap,
    refresh: refresh,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    syncFromLocalUpsert: syncFromLocalUpsert,
  };

  Object.defineProperty(api, "ready", {
    get: function () { return bootstrap(); },
  });

  global.medewerkersDB = api;

  // Auto-bootstrap zodra dit script laadt.
  bootstrap();
})(typeof window !== "undefined" ? window : this);
