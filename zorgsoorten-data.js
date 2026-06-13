/**
 * Data-laag voor 'zorgsoorten' (Cliënten module — referentiedata).
 *
 * Bron van waarheid: Supabase tabel public.zorgsoorten.
 * localStorage["zorgsoorten"] dient als read-cache zodat synchrone lezers
 * onveranderd kunnen blijven werken.
 *
 * Public async API:
 *   await window.zorgsoortenDB.bootstrap()
 *   await window.zorgsoortenDB.refresh()
 *   await window.zorgsoortenDB.add({naam, tarieftype})
 *   await window.zorgsoortenDB.update(id, patch)   // {naam?, tarieftype?, archived?}
 *   await window.zorgsoortenDB.archive(id)
 *   await window.zorgsoortenDB.restore(id)
 *   await window.zorgsoortenDB.delete(id)
 *
 * Sync helpers:
 *   window.zorgsoortenDB.getAllSync()
 *   window.zorgsoortenDB.ready  (Promise)
 *
 * Backward-compat globals (sync, lezen uit cache):
 *   getZorgsoortItems(), getZorgsoortById(id)
 *
 * Events:
 *   "ff:zorgsoorten-updated" op `window` na elke mutatie of bootstrap.
 *
 * Cache-formaat:
 *   { id, naam, tarieftype, archived, aanmaakdatum, laatstGewijzigd }
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "zorgsoorten";
  var TABLE = "zorgsoorten";
  var EVENT_NAME = "ff:zorgsoorten-updated";

  function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam,
      tarieftype: row.tarieftype,
      // tarief = opbrengst per eenheid (eenheid = tarieftype); kostenTarief = kosten-norm
      // voor open diensten (zonder toegewezen medewerker). Beide mogen leeg zijn.
      tarief: row.tarief != null ? Number(row.tarief) : null,
      kostenTarief: row.kosten_tarief != null ? Number(row.kosten_tarief) : null,
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
    if (!window.ffSupabase) {
      console.warn("[zorgsoortenDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.ffSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: true });
    if (res.error) {
      console.error("[zorgsoortenDB] fetchAll error:", res.error);
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

  function validTarief(t) {
    var s = String(t || "").toLowerCase();
    return s === "dag" || s === "uur" || s === "week";
  }

  async function add(input) {
    var src = input || {};
    var naam = String(src.naam || "").trim();
    if (!naam) throw new Error("Naam is verplicht.");
    if (!validTarief(src.tarieftype)) throw new Error("Tarieftype moet 'dag', 'uur' of 'week' zijn.");
    if (!window.ffSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.ffSupabase
      .from(TABLE)
      .insert({
        naam: naam,
        tarieftype: String(src.tarieftype).toLowerCase(),
        tarief: numOrNull(src.tarief),
        kosten_tarief: numOrNull(src.kostenTarief),
        archived: false,
      })
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
    if (!window.ffSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var dbPatch = {};
    if (typeof patch.naam === "string") dbPatch.naam = patch.naam.trim();
    if (typeof patch.tarieftype === "string") {
      if (!validTarief(patch.tarieftype)) throw new Error("Ongeldig tarieftype.");
      dbPatch.tarieftype = String(patch.tarieftype).toLowerCase();
    }
    if (typeof patch.archived === "boolean") dbPatch.archived = patch.archived;
    if (patch.tarief !== undefined) dbPatch.tarief = numOrNull(patch.tarief);
    if (patch.kostenTarief !== undefined) dbPatch.kosten_tarief = numOrNull(patch.kostenTarief);
    if (Object.keys(dbPatch).length === 0) {
      var existing = readCache().find(function (z) { return z.id === id; });
      return existing || null;
    }
    var res = await window.ffSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache().map(function (z) { return z.id === id ? newItem : z; });
    writeCache(list);
    return newItem;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.ffSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.ffSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var list = readCache().filter(function (z) { return z.id !== id; });
    writeCache(list);
    return true;
  }

  function getAllSync() { return readCache(); }

  function getZorgsoortItems() {
    return readCache().map(function (x) { return Object.assign({}, x); });
  }

  function getZorgsoortById(id) {
    var item = readCache().find(function (x) { return x.id === id; });
    return item ? Object.assign({}, item) : null;
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

  global.zorgsoortenDB = api;
  global.getZorgsoortItems = getZorgsoortItems;
  global.getZorgsoortById = getZorgsoortById;

  // Auto-bootstrap zodra dit script laadt.
  bootstrap();
})(typeof window !== "undefined" ? window : this);
