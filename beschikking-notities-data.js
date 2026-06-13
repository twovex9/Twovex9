/* global window, localStorage */
/**
 * Beschikking notities — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `beschikking_notities`.
 *  - Bij bootstrap fetcht deze module ALLE notities (over alle beschikkingen)
 *    en cachet ze onder "beschikking_notities_v1". Dat is goedkoop: er zijn
 *    weinig notities per beschikking en de pagina laadt enkel op
 *    /beschikking-detail.html.
 *  - Schrijfacties (add/update/remove) gaan async naar Supabase; de cache
 *    wordt geüpdatet en het update-event `ff:beschikking-notities-updated`
 *    wordt gefired voor live re-renders.
 *  - Eénmalige migratie van legacy localStorage["beschikking_notities_v1"]
 *    (ZELFDE key als de cache — we lezen het oude formaat 1× via
 *    LEGACY_KEY_OLD om te voorkomen dat we onze eigen cache als legacy zien).
 *
 * Gebruik:
 *   await window.beschikkingNotitiesDB.ready;
 *   var rows = window.beschikkingNotitiesDB.getForBescSync(bescId);
 *   var saved = await window.beschikkingNotitiesDB.add({
 *     bescId: "b_besc_001", bodyHtml: "<p>Tekst</p>"
 *   });
 *   await window.beschikkingNotitiesDB.update(id, { bodyHtml: "<p>Nieuw</p>" });
 *   await window.beschikkingNotitiesDB.remove(id);
 *   window.addEventListener("ff:beschikking-notities-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "beschikking_notities";
  var CACHE_KEY = "beschikking_notities_v1";
  // Legacy localStorage-only data zat onder dezelfde key. We lezen het 1×
  // via een tijdelijke kopie en checken of de rijen 'createdAt' bevatten —
  // dat is het signaal dat het nog legacy data is i.p.v. cache.
  var LEGACY_KEY = "beschikking_notities_legacy_v1";
  var MIGRATION_FLAG = "beschikkingNotitiesMigratedToSupabase.v1";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isoNow() { return new Date().toISOString(); }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      if (!Array.isArray(p)) return [];
      // Legacy-rijen hebben 'createdAt' (niet 'aangemaakt' / ISO-string +
      // 'bescId' camelCase) — die zijn nog niet door fetchAll gezet.
      // Filter ze er hier níét uit, want we behandelen migratie elders.
      return p;
    } catch (e) { return []; }
  }

  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:beschikking-notities-updated", { detail: { source: source || "beschikking-notities-data" } }));
    } catch (e) { /* */ }
  }

  // Frontend-conventie blijft camelCase (bescId, bodyHtml, createdAt,
  // updatedAt). DB-kolommen zijn snake_case. Hier mappen.
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      bescId: row.beschikking_id || "",
      bodyHtml: row.body_html || "",
      createdAt: row.aanmaakdatum || isoNow(),
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      beschikking_id: String(safe.bescId || ""),
      body_html: String(safe.bodyHtml || ""),
    };
    if (safe.createdAt && typeof safe.createdAt === "string") {
      payload.aanmaakdatum = safe.createdAt;
    }
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    return p;
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  // Legacy-formaat in localStorage["beschikking_notities_v1"] gebruikte
  // dezelfde key als onze huidige cache. Daarom bij eerste boot:
  //   1. Kopieer huidige inhoud (als die er is) naar LEGACY_KEY.
  //   2. Detecteer of het rijen zijn met 'createdAt' / 'bescId' camelCase
  //      (dat is legacy) en migreer.
  //   3. Zet flag, leeg LEGACY_KEY.
  function snapshotLegacy() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG) === "1") return;
      if (localStorage.getItem(LEGACY_KEY) != null) return;
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      var arr = [];
      try { arr = JSON.parse(raw) || []; } catch (e) { arr = []; }
      if (!Array.isArray(arr) || arr.length === 0) return;
      // Detecteer legacy-vorm: object met 'createdAt' EN 'bescId' (niet
      // 'beschikking_id' of 'aanmaakdatum').
      var looksLegacy = arr.some(function (r) {
        return r && (r.createdAt || r.bescId) && !r.aanmaakdatum;
      });
      if (!looksLegacy) return;
      localStorage.setItem(LEGACY_KEY, raw);
    } catch (e) { /* */ }
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
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* */ }
        return false;
      }

      var legacyRaw = "[]";
      try { legacyRaw = localStorage.getItem(LEGACY_KEY) || "[]"; } catch (e) { /* */ }
      var legacy = [];
      try { legacy = JSON.parse(legacyRaw) || []; } catch (e) { legacy = []; }
      if (!Array.isArray(legacy) || legacy.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[beschikkingNotitiesDB] Eenmalige migratie van " + legacy.length + " notities naar Supabase…");
      var payload = legacy
        .filter(function (r) { return r && r.bescId && r.bodyHtml; })
        .map(function (r) { return objToInsertPayload(r); });
      if (payload.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* */ }
        return false;
      }
      var ins = await global.ffSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[beschikkingNotitiesDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* */ }
      console.info("[beschikkingNotitiesDB] Migratie geslaagd: " + (ins.data || []).length + " items naar Supabase.");
      return true;
    } catch (err) {
      console.error("[beschikkingNotitiesDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    snapshotLegacy();
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[beschikkingNotitiesDB] Bootstrap mislukt:", err);
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

  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.bescId) throw new Error("bescId verplicht");
    if (!rec.bodyHtml) throw new Error("bodyHtml verplicht");
    var payload = objToInsertPayload(rec);
    var res = await global.ffSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToUpdatePayload(merged);
    var res = await global.ffSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.ffSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getForBescSync(bescId) {
    if (!bescId) return [];
    var s = String(bescId);
    return readCache().filter(function (r) { return r && String(r.bescId) === s; });
  }

  global.beschikkingNotitiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForBescSync: getForBescSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
