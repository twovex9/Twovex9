/* global window, localStorage */
/**
 * Organisaties — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `organisaties`.
 *  - localStorage onder "hr_organisaties_v1" = read-cache.
 *  - Schrijfacties gaan async naar Supabase; cache + event "besa:organisaties-updated".
 *  - Backward-compat globals (sync writes via fire-and-forget shims) zodat
 *    organisatie.js / organisatie-detail.js / clienten.js niets hoeven te
 *    wijzigen op de write-paden.
 *
 * Bijzonderheid: bij een naamswijziging (of verwijdering) wordt de naam ook
 * in alle cliënt-records gepropageerd via setClientenItems(). Dat blijft
 * werken omdat clienten-data.js zelf óók een sync→async shim aanbiedt.
 */
(function (global) {
  "use strict";

  var TABLE = "organisaties";
  var CACHE_KEY = "hr_organisaties_v1";
  var SEED_FLAG = "hr_organisaties_seeded_v1";
  var MIGRATION_FLAG_KEY = "organisatiesMigratedToSupabase.v1";

  function isoNow() { return new Date().toISOString(); }

  function genId() {
    return "org_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---------------------------------------------------------------------------
  // Mapping rij ⇄ object
  // ---------------------------------------------------------------------------
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || genId(),
      naam: String(safe.naam || "").trim(),
      archived: !!safe.archived,
    };
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    return p;
  }

  function normalizeItem(o) {
    if (!o || typeof o !== "object") return null;
    var id = String(o.id || "").trim() || genId();
    var naam = String(o.naam == null ? "" : o.naam).trim();
    if (!naam) return null;
    return {
      id: id,
      naam: naam,
      archived: o.archived === true,
      aanmaakdatum: o.aanmaakdatum != null ? String(o.aanmaakdatum) : isoNow(),
      laatstGewijzigd: o.laatstGewijzigd != null ? String(o.laatstGewijzigd) : isoNow(),
    };
  }

  // ---------------------------------------------------------------------------
  // Cache (localStorage)
  // ---------------------------------------------------------------------------
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) { /* */ }
  }

  function dispatchUpdated() {
    try {
      global.dispatchEvent(new CustomEvent("besa:organisaties-updated"));
    } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Supabase fetch + bootstrap
  // ---------------------------------------------------------------------------
  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("naam", { ascending: true });
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

      console.info("[organisatiesDB] Eenmalige migratie van " + local.length + " organisaties naar Supabase…");
      var payload = local.map(function (o) { return objToInsertPayload(o); });
      var ins = await global.besaSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[organisatiesDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[organisatiesDB] Migratie geslaagd: " + (ins.data || []).length + " organisaties geüpload.");
      return true;
    } catch (err) {
      console.error("[organisatiesDB] Migratiefout:", err);
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
        try { localStorage.setItem(SEED_FLAG, "1"); } catch (e) { /* */ }
        dispatchUpdated();
      } catch (err) {
        console.error("[organisatiesDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    try {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
      return items;
    } catch (err) {
      console.error("[organisatiesDB] Refresh mislukt:", err);
      return readCache();
    }
  }

  // ---------------------------------------------------------------------------
  // Async CRUD
  // ---------------------------------------------------------------------------
  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    var res = await global.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.push(obj);
    writeCache(cache);
    dispatchUpdated();
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    merged.id = id;
    var payload = objToUpdatePayload(merged);
    var res = await global.besaSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (o) { return o && String(o.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(cache);
    dispatchUpdated();
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (o) { return o && String(o.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Sync helpers
  // ---------------------------------------------------------------------------
  function getAllSync() { return readCache().map(normalizeItem).filter(Boolean); }
  function getByIdSync(id) {
    if (!id) return null;
    var found = readCache().find(function (o) { return o && String(o.id) === String(id); });
    return found ? Object.assign({}, found) : null;
  }

  function hasDuplicateNaam(naam, exceptId) {
    var t = (naam == null ? "" : String(naam).trim().toLowerCase());
    if (!t) return false;
    return getAllSync().some(function (o) {
      if (!o) return false;
      if (exceptId && o.id === exceptId) return false;
      if (o.archived) return false;
      return String(o.naam || "").trim().toLowerCase() === t;
    });
  }

  function getClientenOrgs() {
    if (typeof global.getClientenItems !== "function") return [];
    return (global.getClientenItems() || []).map(function (c) { return c && c.organisatie; });
  }

  function uniqueSortStrings(values) {
    var s = {};
    (values || []).forEach(function (v) {
      v = (v == null ? "" : String(v)).trim();
      if (v) s[v] = true;
    });
    return Object.keys(s).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase(), "nl", { sensitivity: "base" });
    });
  }

  // ---------------------------------------------------------------------------
  // Backward-compat globals
  // ---------------------------------------------------------------------------
  function getOrganisatiesItems() {
    var cache = readCache();
    if (!cache.length) bootstrap();
    return cache.map(normalizeItem).filter(Boolean);
  }

  function setOrganisatiesItems(list) {
    if (!Array.isArray(list)) return;
    var oldMap = {};
    readCache().forEach(function (o) { if (o && o.id) oldMap[o.id] = o; });
    var out = list.map(normalizeItem).filter(Boolean);
    writeCache(out);
    dispatchUpdated();
    if (!global.besaSupabase) return;
    out.forEach(function (o) {
      var prev = oldMap[o.id];
      if (!prev) {
        add(o).catch(function (err) { console.error("[organisatiesDB] add via setOrganisatiesItems:", err); });
      } else if (JSON.stringify(prev) !== JSON.stringify(o)) {
        update(o.id, o).catch(function (err) { console.error("[organisatiesDB] update via setOrganisatiesItems:", err); });
      }
      delete oldMap[o.id];
    });
    Object.keys(oldMap).forEach(function (id) {
      remove(id).catch(function (err) { console.error("[organisatiesDB] remove via setOrganisatiesItems:", err); });
    });
  }

  function getOrganisatieNamenVoorSelectie() {
    var items = getOrganisatiesItems() || [];
    var actieveStam = items
      .filter(function (o) { return o && !o.archived; })
      .map(function (o) { return o.naam; });
    var uitClienten = getClientenOrgs();
    return uniqueSortStrings(actieveStam.concat(uitClienten));
  }

  function propagateOrganisatieNaamWijziging(oudeNaam, nieuweNaam) {
    var a = (oudeNaam == null ? "" : String(oudeNaam).trim());
    var b = (nieuweNaam == null ? "" : String(nieuweNaam).trim());
    if (a === b) return 0;
    if (typeof global.getClientenItems !== "function" || typeof global.setClientenItems !== "function") return 0;
    var items = global.getClientenItems() || [];
    var n = 0;
    var next = items.map(function (c) {
      if (!c) return c;
      if (String(c.organisatie || "").trim() === a) {
        n += 1;
        return Object.assign({}, c, { organisatie: b, laatstGewijzigd: isoNow() });
      }
      return c;
    });
    if (n) global.setClientenItems(next);
    return n;
  }

  function propagateOrganisatieVerwijderd(naam) {
    return propagateOrganisatieNaamWijziging(naam, "");
  }

  function addOrganisatie(naam) {
    var t = (naam == null ? "" : String(naam).trim());
    if (!t) return null;
    if (hasDuplicateNaam(t)) return null;
    var id = genId();
    var now = isoNow();
    var row = { id: id, naam: t, archived: false, aanmaakdatum: now, laatstGewijzigd: now };
    // Lokaal alvast tonen, async naar Supabase.
    var cache = readCache();
    cache.push(row);
    writeCache(cache);
    dispatchUpdated();
    if (global.besaSupabase) {
      add(row).catch(function (err) { console.error("[organisatiesDB] addOrganisatie sync mislukt:", err); });
    }
    return row;
  }

  function updateOrganisatieById(id, newNaam) {
    if (!id) return null;
    var t = (newNaam == null ? "" : String(newNaam).trim());
    if (!t) return null;
    if (hasDuplicateNaam(t, id)) return null;
    var cache = readCache();
    var pos = -1;
    for (var i = 0; i < cache.length; i += 1) {
      if (cache[i] && cache[i].id === id) { pos = i; break; }
    }
    if (pos === -1) return null;
    var oud = String(cache[pos].naam || "").trim();
    cache[pos].naam = t;
    cache[pos].laatstGewijzigd = isoNow();
    writeCache(cache);
    dispatchUpdated();
    if (oud !== t) propagateOrganisatieNaamWijziging(oud, t);
    if (global.besaSupabase) {
      update(id, cache[pos]).catch(function (err) { console.error("[organisatiesDB] updateOrganisatieById sync mislukt:", err); });
    }
    return cache[pos];
  }

  function setOrganisatieArchivedById(id, archived) {
    var cache = readCache();
    for (var i = 0; i < cache.length; i += 1) {
      if (cache[i] && cache[i].id === id) {
        cache[i].archived = !!archived;
        cache[i].laatstGewijzigd = isoNow();
        writeCache(cache);
        dispatchUpdated();
        if (global.besaSupabase) {
          update(id, cache[i]).catch(function (err) { console.error("[organisatiesDB] setArchivedById sync mislukt:", err); });
        }
        return true;
      }
    }
    return false;
  }

  function deleteOrganisatieById(id) {
    var cache = readCache();
    for (var i = 0; i < cache.length; i += 1) {
      if (cache[i] && cache[i].id === id) {
        var naam = String(cache[i].naam || "").trim();
        cache = cache.filter(function (x) { return !x || x.id !== id; });
        writeCache(cache);
        dispatchUpdated();
        if (naam) propagateOrganisatieVerwijderd(naam);
        if (global.besaSupabase) {
          remove(id).catch(function (err) { console.error("[organisatiesDB] deleteOrganisatieById sync mislukt:", err); });
        }
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var api = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
  };

  global.organisatiesDB = api;

  // Backward-compat globals
  global.getOrganisatiesItems = getOrganisatiesItems;
  global.setOrganisatiesItems = setOrganisatiesItems;
  global.getOrganisatieNamenVoorSelectie = getOrganisatieNamenVoorSelectie;
  global.addOrganisatie = addOrganisatie;
  global.updateOrganisatieById = updateOrganisatieById;
  global.setOrganisatieArchivedById = setOrganisatieArchivedById;
  global.deleteOrganisatieById = deleteOrganisatieById;
  global._ensureOrganisatieSeeded = function () { /* no-op: SQL seed regelt dit */ };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
