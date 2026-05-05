/**
 * Data-laag voor 'competenties' (HR module).
 *
 * - Bron van waarheid: Supabase (tabel public.competenties).
 * - localStorage["competenties"] dient als read-cache zodat synchrone lezers
 *   (medewerker.js, script.js, planning.js) onveranderd kunnen blijven werken.
 * - Schrijf-acties gaan altijd via dit bestand; cache wordt bijgewerkt na succes.
 *
 * Public API (alle async behalve getAllSync):
 *   await window.competentiesDB.bootstrap()
 *     - Idempotent. Haalt rijen op uit Supabase en update de cache.
 *     - Wordt automatisch ééns aangeroepen wanneer dit script laadt.
 *   await window.competentiesDB.refresh()
 *     - Forceer een nieuwe fetch (bijv. na een externe wijziging).
 *   await window.competentiesDB.add(naam)
 *     - Voegt een nieuwe rij toe. Geeft het toegevoegde object terug.
 *   await window.competentiesDB.update(id, patch)
 *     - Patcht naam en/of archived. Geeft het bijgewerkte object terug.
 *   await window.competentiesDB.archive(id)   // shortcut: archived = true
 *   await window.competentiesDB.restore(id)   // shortcut: archived = false
 *   await window.competentiesDB.delete(id)    // hard delete uit DB
 *   window.competentiesDB.getAllSync()
 *     - Synchrone read uit cache, voor legacy code die geen await kan doen.
 *   window.competentiesDB.ready
 *     - Promise die resolved zodra de eerste bootstrap klaar is.
 *
 * Events:
 *   "besa:competenties-updated" wordt op `window` gedispatcht zodra de cache
 *   verandert (na bootstrap, add, update, delete). Pickers en lijsten kunnen
 *   hierop luisteren om live te herrenderen.
 *
 * Dataformaat in cache (gelijk aan oude localStorage-formaat):
 *   { id, naam, archived, aanmaakdatum, laatstGewijzigd }
 */
(function () {
  "use strict";

  var CACHE_KEY = "competenties";
  var TABLE = "competenties";
  var EVENT_NAME = "besa:competenties-updated";

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

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); }
    catch (e) { /* quota of disabled storage; cache is best-effort */ }
    try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); }
    catch (e) { /* IE-CustomEvent fallback niet nodig in moderne browsers */ }
  }

  async function fetchAll() {
    if (!window.besaSupabase) {
      console.warn("[competentiesDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: true });
    if (res.error) {
      console.error("[competentiesDB] fetchAll error:", res.error);
      throw res.error;
    }
    var list = (res.data || []).map(rowToObj);
    writeCache(list);
    return list;
  }

  function dispatchUpdated() {
    try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); }
    catch (e) { /* IE-CustomEvent fallback niet nodig in moderne browsers */ }
  }

  var bootstrapPromise = null;
  function bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async function () {
        try { await fetchAll(); }
        catch (e) { /* al gelogd in fetchAll */ }
        // Altijd dispatchen — ook na een mislukking — zodat de UI uit
        // een 'Laden…'-toestand kan switchen naar een lege of foutstate.
        dispatchUpdated();
      })();
    }
    return bootstrapPromise;
  }

  function refresh() {
    bootstrapPromise = null;
    return bootstrap();
  }

  async function add(naam) {
    var trimmed = String(naam || "").trim();
    if (!trimmed) throw new Error("Naam is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.besaSupabase
      .from(TABLE)
      .insert({ naam: trimmed, archived: false })
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache();
    list.push(newItem);
    writeCache(list);
    return newItem;
  }

  async function update(id, patch) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var dbPatch = {};
    if (typeof patch.naam === "string") dbPatch.naam = patch.naam.trim();
    if (typeof patch.archived === "boolean") dbPatch.archived = patch.archived;
    if (Object.keys(dbPatch).length === 0) {
      var existing = readCache().find(function (c) { return c.id === id; });
      return existing || null;
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache().map(function (c) { return c.id === id ? newItem : c; });
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
    var list = readCache().filter(function (c) { return c.id !== id; });
    writeCache(list);
    return true;
  }

  function getAllSync() { return readCache(); }

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

  window.competentiesDB = api;

  // Auto-bootstrap zodra dit script laadt, zodat synchrone lezers
  // (legacy code die direct uit localStorage leest) zo snel mogelijk
  // een gevulde cache zien. De promise wordt ook gebruikt door pagina's
  // die expliciet willen wachten via `await competentiesDB.ready`.
  bootstrap();
})();
