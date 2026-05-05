/**
 * Data-laag voor 'opleidingen' (HR module).
 *
 * Zelfde patroon als competenties-data.js. Bron van waarheid: Supabase tabel
 * public.opleidingen. localStorage["opleidingen"] dient als read-cache zodat
 * synchrone lezers (medewerker.js, script.js) onveranderd blijven werken.
 *
 * Public API (alle async behalve getAllSync):
 *   await window.opleidingenDB.bootstrap()
 *   await window.opleidingenDB.refresh()
 *   await window.opleidingenDB.add({naam, skj})
 *   await window.opleidingenDB.update(id, patch)   // patch: {naam?, skj?, archived?}
 *   await window.opleidingenDB.archive(id)
 *   await window.opleidingenDB.restore(id)
 *   await window.opleidingenDB.delete(id)
 *   window.opleidingenDB.getAllSync()
 *   window.opleidingenDB.ready  (Promise)
 *
 * Events:
 *   "besa:opleidingen-updated" wordt op `window` gedispatcht na elke
 *   succesvolle wijziging of bootstrap-completion.
 *
 * Cache-formaat (gelijk aan oude localStorage-shape):
 *   { id, naam, skj, archived, aanmaakdatum, laatstGewijzigd }
 */
(function () {
  "use strict";

  var CACHE_KEY = "opleidingen";
  var TABLE = "opleidingen";
  var EVENT_NAME = "besa:opleidingen-updated";

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam,
      skj: !!row.skj,
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

  function dispatchUpdated() {
    try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); }
    catch (e) { /* moderne browsers ondersteunen CustomEvent */ }
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); }
    catch (e) { /* quota of disabled storage; cache is best-effort */ }
    dispatchUpdated();
  }

  async function fetchAll() {
    if (!window.besaSupabase) {
      console.warn("[opleidingenDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: true });
    if (res.error) {
      console.error("[opleidingenDB] fetchAll error:", res.error);
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
        try {
          await fetchAll();
        } catch (e) {
          // fetchAll heeft al gelogd. Toch event sturen zodat UI uit de
          // 'Laden...'-toestand kan switchen ook bij een mislukte fetch.
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

  async function add(input) {
    var src = input || {};
    var naam = String(src.naam || "").trim();
    if (!naam) throw new Error("Naam is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.besaSupabase
      .from(TABLE)
      .insert({ naam: naam, skj: !!src.skj, archived: false })
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
    if (typeof patch.skj === "boolean") dbPatch.skj = patch.skj;
    if (typeof patch.archived === "boolean") dbPatch.archived = patch.archived;
    if (Object.keys(dbPatch).length === 0) {
      var existing = readCache().find(function (o) { return o.id === id; });
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
    var list = readCache().map(function (o) { return o.id === id ? newItem : o; });
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
    var list = readCache().filter(function (o) { return o.id !== id; });
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

  window.opleidingenDB = api;

  // Auto-bootstrap zodra dit script laadt.
  bootstrap();
})();
