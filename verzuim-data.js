/* global window, localStorage */
/**
 * Verzuim — Supabase data-laag met in-memory bron-van-waarheid (_mem).
 *
 * - Source of truth: `public.verzuim` (1 tabel, kolom `type` = 'lang' | 'kort').
 * - `_mem` is de in-memory lijst; localStorage ("hr_verzuim_rows") is alleen
 *   een secundaire cache zodat een volle quota de lijst niet leegmaakt (DIEHARD).
 * - Schrijfacties zijn PER RIJ (add/update/delete) — geen full-overwrite/bulk-delete
 *   meer. De vroegere pushType() deed upsert + delete-van-missende-ids, wat bij een
 *   stale cache de hele tabel kon proberen te wissen; dat is hier verwijderd.
 *
 * Datavorm (camelCase frontend-conventie):
 *   { id, type:"lang"|"kort", medewerker, eerstZiektedag, verwachteTerug,
 *     werkelijkeTerug, beschrijving, status }
 *
 * Public API:
 *   window.verzuimDB.ready                  → Promise (bootstrap klaar)
 *   window.verzuimDB.refresh()              → Promise (refetch)
 *   window.verzuimDB.getAllSync()           → array (alle rijen)
 *   window.verzuimDB.getByIdSync(id)        → object | null
 *   window.verzuimDB.add(obj)               → Promise<obj>
 *   window.verzuimDB.update(id, patch)      → Promise<obj>
 *   window.verzuimDB.delete(id)             → Promise<true>
 *
 * Event: ff:verzuim-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verzuim";
  var CACHE_KEY = "hr_verzuim_rows";
  // Legacy split-caches (alleen nog ingelezen voor eenmalige migratie-detectie)
  var LEGACY_LANG = "hr_verzuim_lang_rows";
  var LEGACY_KORT = "hr_verzuim_kort_rows";
  var ALLOWED_TYPES = ["lang", "kort"];

  var _mem = null;

  function readCache() {
    if (_mem != null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var p = raw ? JSON.parse(raw) : [];
      _mem = Array.isArray(p) ? p : [];
    } catch (e) { _mem = []; }
    return _mem;
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota: _mem blijft bron */ }
  }

  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("ff:verzuim-updated")); } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[verzuimDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Verzuim — " + action, err);
  }

  function normType(t) {
    var s = String(t || "lang").toLowerCase();
    return ALLOWED_TYPES.indexOf(s) >= 0 ? s : "lang";
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      type: normType(row.type),
      medewerker: row.medewerker || "",
      eerstZiektedag: row.eerst_ziektedag || "",
      verwachteTerug: row.verwachte_terug || "",
      werkelijkeTerug: row.werkelijke_terug || "",
      beschrijving: row.beschrijving || "",
      status: row.status || "Actief",
    };
  }

  function genId(type) {
    return "vz_" + (normType(type) === "kort" ? "k_" : "l_") + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var type = normType(safe.type);
    return {
      id: safe.id || genId(type),
      type: type,
      medewerker: String(safe.medewerker || ""),
      eerst_ziektedag: safe.eerstZiektedag || null,
      verwachte_terug: safe.verwachteTerug || null,
      werkelijke_terug: safe.werkelijkeTerug || null,
      beschrijving: safe.beschrijving == null ? "" : String(safe.beschrijving),
      status: safe.status || "Actief",
    };
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).select("*")
      .order("eerst_ziektedag", { ascending: false, nullsFirst: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  // Eenmalige migratie van de oude gesplitste localStorage-caches → Supabase.
  // Draait alleen als de tabel leeg is (count 0) én er legacy-rijen staan. Bij
  // een gevulde tabel (de normale situatie) doet dit niets.
  async function maybeMigrateLegacy() {
    try {
      if (!global.ffSupabase) return;
      var head = await global.ffSupabase.from(TABLE).select("id", { count: "exact", head: true });
      if (head.error || (head.count || 0) > 0) return;
      function readLegacy(key, type) {
        try {
          var raw = localStorage.getItem(key);
          var arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr.map(function (o) {
            var p = objToInsertPayload(Object.assign({}, o, { type: type }));
            return p;
          }) : [];
        } catch (e) { return []; }
      }
      var payload = readLegacy(LEGACY_LANG, "lang").concat(readLegacy(LEGACY_KORT, "kort"));
      if (!payload.length) return;
      console.info("[verzuimDB] Eenmalige migratie van " + payload.length + " verzuim-records…");
      var ins = await global.ffSupabase.from(TABLE).insert(payload);
      if (ins.error) reportSilent("migratie", ins.error);
    } catch (err) { reportSilent("migratie", err); }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readCache();
    readyPromise = (async function () {
      try {
        await maybeMigrateLegacy();
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated();
      } catch (err) { reportSilent("bootstrap", err); }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(items);
    dispatchUpdated();
    return items;
  }

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  async function add(obj) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(obj);
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var saved = rowToObj(res.data);
    var cache = readCache().slice();
    cache.unshift(saved);
    writeCache(cache);
    dispatchUpdated();
    return saved;
  }

  async function update(id, patch) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("id verplicht");
    var upd = {};
    if (patch && "type" in patch) upd.type = normType(patch.type);
    if (patch && "medewerker" in patch) upd.medewerker = String(patch.medewerker || "");
    if (patch && "eerstZiektedag" in patch) upd.eerst_ziektedag = patch.eerstZiektedag || null;
    if (patch && "verwachteTerug" in patch) upd.verwachte_terug = patch.verwachteTerug || null;
    if (patch && "werkelijkeTerug" in patch) upd.werkelijke_terug = patch.werkelijkeTerug || null;
    if (patch && "beschrijving" in patch) upd.beschrijving = patch.beschrijving == null ? "" : String(patch.beschrijving);
    if (patch && "status" in patch) upd.status = patch.status || "Actief";
    var res = await global.ffSupabase.from(TABLE).update(upd).eq("id", id).select().single();
    if (res.error) throw res.error;
    var saved = rowToObj(res.data);
    var cache = readCache().slice();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = saved; else cache.unshift(saved);
    writeCache(cache);
    dispatchUpdated();
    return saved;
  }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(readCache().filter(function (r) { return r && String(r.id) !== String(id); }));
    dispatchUpdated();
    return true;
  }

  global.verzuimDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    add: add,
    update: update,
    delete: remove,
    remove: remove,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
