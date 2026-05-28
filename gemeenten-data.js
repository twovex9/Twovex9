/**
 * Data-laag voor 'gemeenten' (Cliënten module — referentiedata).
 *
 * Bron van waarheid: Supabase tabel public.gemeenten.
 * localStorage["hr_gemeenten_v1"] dient als read-cache.
 *
 * Public async API:
 *   await window.gemeentenDB.bootstrap()
 *   await window.gemeentenDB.refresh()
 *   await window.gemeentenDB.add(naam)
 *   await window.gemeentenDB.update(id, patch)   // {naam?, archived?}
 *   await window.gemeentenDB.archive(id)
 *   await window.gemeentenDB.restore(id)
 *   await window.gemeentenDB.delete(id)
 *
 * Sync helpers:
 *   window.gemeentenDB.getAllSync()
 *   window.gemeentenDB.ready  (Promise)
 *
 * Backward-compat globals (sync, lezen uit cache; write-shims dispatchen async):
 *   getGemeentenItems(), addGemeente(naam), updateGemeenteById(id, naam),
 *   setGemeenteArchivedById(id, bool), deleteGemeenteById(id)
 *
 * Events:
 *   "besa:gemeenten-updated" op `window` na elke mutatie of bootstrap.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "hr_gemeenten_v1";
  var TABLE = "gemeenten";
  var EVENT_NAME = "besa:gemeenten-updated";

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  // Stille fire-and-forget fouten zichtbaar maken (werkpatronen §6c-bis):
  // de gebruiker krijgt een toast als een achtergrond-sync naar Supabase faalt.
  function reportSilent(action, err) {
    console.error("[gemeentenDB] " + action + " mislukt:", err);
    if (window.besaReportSyncFailure) window.besaReportSyncFailure("Gemeenten — " + action, err);
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
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); }
    catch (e) { /* best effort */ }
    dispatchUpdated();
  }

  async function fetchAll() {
    if (!window.besaSupabase) {
      console.warn("[gemeentenDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("naam", { ascending: true });
    if (res.error) {
      console.error("[gemeentenDB] fetchAll error:", res.error);
      throw res.error;
    }
    var list = (res.data || []).map(rowToObj);
    writeCache(list);
    return list;
  }

  var bootstrapPromise = null;
  function bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async function () {
        try { await fetchAll(); }
        catch (e) { dispatchUpdated(); }
      })();
    }
    return bootstrapPromise;
  }

  function refresh() {
    bootstrapPromise = null;
    return bootstrap();
  }

  async function add(naam) {
    var t = String(naam == null ? "" : naam).trim();
    if (!t) throw new Error("Naam is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.besaSupabase
      .from(TABLE)
      .insert({ naam: t, archived: false })
      .select()
      .single();
    if (res.error) {
      // Specifieke duplicate-naam-foutafhandeling.
      if (res.error.code === "23505") {
        var err = new Error("Deze gemeentenaam bestaat al.");
        err.code = "duplicate_naam";
        throw err;
      }
      throw res.error;
    }
    var newItem = rowToObj(res.data);
    var list = readCache();
    list.push(newItem);
    list.sort(function (a, b) {
      return String(a.naam || "").toLowerCase().localeCompare(String(b.naam || "").toLowerCase());
    });
    writeCache(list);
    return newItem;
  }

  async function update(id, patch) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var dbPatch = {};
    if (typeof patch.naam === "string") {
      var nm = patch.naam.trim();
      if (!nm) throw new Error("Naam mag niet leeg zijn.");
      dbPatch.naam = nm;
    }
    if (typeof patch.archived === "boolean") dbPatch.archived = patch.archived;
    if (Object.keys(dbPatch).length === 0) {
      var existing = readCache().find(function (g) { return g.id === id; });
      return existing || null;
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) {
      if (res.error.code === "23505") {
        var err = new Error("Deze gemeentenaam bestaat al.");
        err.code = "duplicate_naam";
        throw err;
      }
      throw res.error;
    }
    var newItem = rowToObj(res.data);
    var list = readCache().map(function (g) { return g.id === id ? newItem : g; });
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
    var list = readCache().filter(function (g) { return g.id !== id; });
    writeCache(list);
    return true;
  }

  function getAllSync() { return readCache(); }

  /* ── Backward-compat globals ── */

  function getGemeentenItems() {
    return readCache().map(function (x) { return Object.assign({}, x); });
  }

  function addGemeenteCompat(naam) {
    add(naam).catch(function (err) { reportSilent("toevoegen", err); });
    return null;
  }

  function updateGemeenteByIdCompat(id, naam) {
    update(id, { naam: naam }).catch(function (err) { reportSilent("bijwerken", err); });
    return null;
  }

  function setGemeenteArchivedByIdCompat(id, archived) {
    update(id, { archived: !!archived }).catch(function (err) { reportSilent("archiveren", err); });
    return true;
  }

  function deleteGemeenteByIdCompat(id) {
    remove(id).catch(function (err) { reportSilent("verwijderen", err); });
    return true;
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
  };

  Object.defineProperty(api, "ready", {
    get: function () { return bootstrap(); },
  });

  global.gemeentenDB = api;
  global.getGemeentenItems = getGemeentenItems;
  global.addGemeente = addGemeenteCompat;
  global.updateGemeenteById = updateGemeenteByIdCompat;
  global.setGemeenteArchivedById = setGemeenteArchivedByIdCompat;
  global.deleteGemeenteById = deleteGemeenteByIdCompat;

  // Auto-bootstrap zodra dit script laadt.
  bootstrap();
})(typeof window !== "undefined" ? window : this);
