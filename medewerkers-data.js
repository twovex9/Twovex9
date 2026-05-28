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
    "personeelsnummer",
    "location_distance",
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
      personeelsnummer: row.personeelsnummer != null ? row.personeelsnummer : (data.personeelsnummer != null ? data.personeelsnummer : null),
      location_distance: row.location_distance != null ? Number(row.location_distance) : (data.location_distance != null ? Number(data.location_distance) : null),
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
      personeelsnummer: src.personeelsnummer != null && src.personeelsnummer !== "" ? (Number.isFinite(+src.personeelsnummer) ? +src.personeelsnummer : null) : null,
      location_distance: src.location_distance != null && src.location_distance !== "" ? (Number.isFinite(+src.location_distance) ? +src.location_distance : null) : null,
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
        else if (k === "personeelsnummer") {
          if (src[k] == null || src[k] === "") dbPatch.personeelsnummer = null;
          else dbPatch.personeelsnummer = Number.isFinite(+src[k]) ? +src[k] : null;
        }
        else if (k === "location_distance") {
          if (src[k] == null || src[k] === "") dbPatch.location_distance = null;
          else dbPatch.location_distance = Number.isFinite(+src[k]) ? +src[k] : null;
        }
        else dbPatch[k] = src[k] == null ? null : String(src[k]);
      } else {
        // DIEHARD-vangnet tegen stille dataverlies: een lege waarde ("" / null /
        // undefined) mag een bestaande NIET-lege opgeslagen string NOOIT
        // overschrijven. Zo blijft data behouden als een veld door een form-bug
        // (bv. datum-formaat of legacy select-waarde) niet correct geladen werd.
        // Bewust legen is zeldzaam en minder erg dan onbedoeld wissen.
        var newVal = src[k];
        var oldVal = data[k];
        var newEmpty = (newVal === undefined || newVal === null || newVal === "");
        if (newEmpty && typeof oldVal === "string" && oldVal !== "") {
          return; // behoud bestaande waarde
        }
        data[k] = newVal;
        dataChanged = true;
      }
    });
    if (dataChanged) dbPatch.data = data;
    return dbPatch;
  }

  // DATA-SLIM patroon (bindende memory-les 2026-05-26 — 4e module met deze bug):
  // - `_mem` in-memory cache is ALTIJD de canonieke bron na bootstrap (volledige data
  //   incl. zware bs2_* velden).
  // - localStorage is alleen een snelle eerste-render-cache (slim — zware bs2_* velden
  //   gestript zodat 103 medewerkers ruim binnen het ~5MB quota passen).
  // - writeCache mag NOOIT throwen als localStorage vol is (QuotaExceededError werd
  //   eerder geslikt → fetchAll faalde stil → readCache viel terug op stale legacy data).
  var _mem = null;

  function isHeavyBs2Key(k) {
    return typeof k === "string" && /^bs2_/.test(k);
  }

  function slimRowForLocalStorage(emp) {
    if (!emp || typeof emp !== "object") return emp;
    var copy = {};
    Object.keys(emp).forEach(function (k) {
      if (isHeavyBs2Key(k)) return; // zware blobs eruit
      if (k === "data" && emp.data && typeof emp.data === "object") {
        // data jsonb behouden, maar zonder bs2_scrape / andere zware sub-keys
        var dataCopy = {};
        Object.keys(emp.data).forEach(function (dk) {
          if (isHeavyBs2Key(dk)) return;
          if (dk === "bs2_scrape" || dk === "bs2_raw") return;
          dataCopy[dk] = emp.data[dk];
        });
        copy.data = dataCopy;
        return;
      }
      copy[k] = emp[k];
    });
    return copy;
  }

  function readCache() {
    // _mem wint altijd — heeft de volledige data (incl. bs2_*)
    if (_mem !== null) return _mem;
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
    // 1) IN-MEMORY: altijd volledig (geen quota-risico)
    _mem = safe;
    // 2) localStorage: stripped versie (zonder bs2_* zware velden) voor snelle volgende boot
    var slim = safe.map(slimRowForLocalStorage);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(slim)); }
    catch (e) { /* quota vol — _mem blijft canoniek, geen probleem */ }
    try { localStorage.setItem(LEGACY_CACHE_KEY, JSON.stringify(slim)); }
    catch (e) { /* quota vol — idem */ }
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

  var bootstrapPromise = null;
  var realtimeSubscribed = false;
  function trySubscribeRealtime(attempt) {
    // Bug #73 fix: medewerkers-data.js loads zonder defer, dus besaRealtime
    // is mogelijk nog niet beschikbaar bij bootstrap. Retry tot 5×.
    if (realtimeSubscribed) return;
    if (global.besaRealtime && typeof global.besaRealtime.subscribe === "function") {
      global.besaRealtime.subscribe("medewerkers", function () { refresh(); });
      realtimeSubscribed = true;
      return;
    }
    if ((attempt || 0) < 10) {
      setTimeout(function () { trySubscribeRealtime((attempt || 0) + 1); }, 300);
    }
  }
  function bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async function () {
        try {
          await maybeMigrateLocalToSupabase();
          await fetchAll();
          // Fase E.7 — subscribe to Realtime changes voor live multi-user sync
          trySubscribeRealtime();
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
    // Fase E.11 — optimistic-locking check
    if (global.besaOptimisticLock && current.laatstGewijzigd) {
      var safe = await global.besaOptimisticLock.check("medewerkers", id, current.laatstGewijzigd);
      if (!safe) {
        var answer = await global.besaOptimisticLock.showConflictModal({
          recordName: ((current.voornaam || "") + " " + (current.achternaam || "")).trim() || id,
        });
        if (answer !== "reload") {
          throw new Error("Medewerker-wijziging geannuleerd — record was inmiddels gewijzigd door iemand anders");
        }
        return current;
      }
    }
    // Reconstrueer het 'data' deel van de huidige cached medewerker:
    var currentData = {};
    Object.keys(current).forEach(function (k) {
      if (k === "id" || k === "aanmaakdatum" || k === "laatstGewijzigd") return;
      if (TOP_LEVEL_FIELDS.indexOf(k) !== -1) return;
      currentData[k] = current[k];
    });
    var dbPatch = objToUpdatePayload(patch, currentData);
    if (Object.keys(dbPatch).length === 0) return current.id ? current : null;
    var res = await global.besaSupabase
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

  // Defensive: garandeer dat consumers ALTIJD de data-jsonb top-level gespread krijgen.
  // Idempotent — als de cache al unwrapped is (rowToObj heeft gedraaid) dan geeft dit
  // hetzelfde resultaat. Als de cache uit een oudere session-store komt zonder unwrap,
  // dan worden velden als straat/bsn/postcode/plaats hier alsnog top-level gemaakt.
  function unwrapDataJsonb(row) {
    if (!row || typeof row !== "object") return row;
    var data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : null;
    if (!data) return row;
    // Spread data eerst (laag), row daarna (hoog: id/voornaam/email/archived overschrijven)
    return Object.assign({}, data, row);
  }

  function getAllSync() {
    var list = readCache();
    if (!Array.isArray(list)) return [];
    return list.map(unwrapDataJsonb);
  }

  function getByIdSync(id) {
    if (!id) return null;
    var list = readCache();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return unwrapDataJsonb(list[i]);
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
      if (typeof window.besaReportSyncFailure === "function") {
        window.besaReportSyncFailure("Medewerker opslaan", err);
      }
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
