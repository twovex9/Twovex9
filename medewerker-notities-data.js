/* global window, localStorage */
/**
 * Medewerker notities — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `medewerker_notities`.
 *  - Bij bootstrap fetcht deze module ALLE notities (over alle medewerkers)
 *    en cachet ze onder "medewerker_notities_v1". Aantallen blijven
 *    handelbaar (paar per medewerker) en de pagina laadt enkel op
 *    /medewerker.html.
 *  - Schrijfacties (add/update/remove) gaan async naar Supabase; de cache
 *    wordt geüpdatet en het update-event `besa:medewerker-notities-updated`
 *    wordt gefired voor live re-render.
 *  - Eénmalige migratie van legacy localStorage["employeeEditsById"] →
 *    elke `[empId].notities` array wordt 1× ingelezen en geüpload.
 *    Het legacy-formaat had per notitie: { html: "<p>...</p>", date: "dd-mm-yyyy hh:mm" }.
 *
 * Gebruik:
 *   await window.medewerkerNotitiesDB.ready;
 *   var rows = window.medewerkerNotitiesDB.getForMedewerkerSync(empId);
 *   var saved = await window.medewerkerNotitiesDB.add({
 *     medewerkerId: emp.empId, bodyHtml: "<p>Tekst</p>"
 *   });
 *   await window.medewerkerNotitiesDB.remove(id);
 *   window.addEventListener("besa:medewerker-notities-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "medewerker_notities";
  var CACHE_KEY = "medewerker_notities_v1";
  var LEGACY_KEY = "employeeEditsById";
  var MIGRATION_FLAG = "medewerkerNotitiesMigratedToSupabase.v1";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      global.dispatchEvent(new CustomEvent("besa:medewerker-notities-updated", { detail: { source: source || "medewerker-notities-data" } }));
    } catch (e) { /* */ }
  }

  // Legacy date is "dd-mm-yyyy hh:mm". Parse naar ISO voor Supabase.
  function parseLegacyDateTime(str) {
    if (!str || typeof str !== "string") return null;
    var m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(str.trim());
    if (!m) return null;
    var d = new Date(
      Number(m[3]), Number(m[2]) - 1, Number(m[1]),
      Number(m[4]), Number(m[5])
    );
    return isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // Frontend-conventie: { id, medewerkerId, bodyHtml, createdAt, updatedAt }
  // DB-kolommen: { id, medewerker_id, body_html, aanmaakdatum, laatst_gewijzigd }
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      bodyHtml: row.body_html || "",
      createdAt: row.aanmaakdatum || isoNow(),
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      medewerker_id: String(safe.medewerkerId || ""),
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
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG) === "1") return false;
      if (!global.besaSupabase) return false;

      var head = await global.besaSupabase
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

      // Per medewerker een notities-array. Dit is wat we migreren.
      var rows = [];
      Object.keys(legacy).forEach(function (empId) {
        var bucket = legacy[empId];
        if (!bucket || typeof bucket !== "object") return;
        var notes = Array.isArray(bucket.notities) ? bucket.notities : [];
        notes.forEach(function (n) {
          if (!n || typeof n !== "object") return;
          var html = String(n.html || "");
          if (!html.trim()) return;
          var iso = parseLegacyDateTime(n.date) || isoNow();
          rows.push(objToInsertPayload({
            medewerkerId: empId,
            bodyHtml: html,
            createdAt: iso,
          }));
        });
      });
      if (rows.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[medewerkerNotitiesDB] Eenmalige migratie van " + rows.length + " medewerker-notities naar Supabase…");
      var ins = await global.besaSupabase
        .from(TABLE)
        .insert(rows)
        .select();
      if (ins.error) {
        console.error("[medewerkerNotitiesDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      console.info("[medewerkerNotitiesDB] Migratie geslaagd: " + (ins.data || []).length + " items naar Supabase.");
      return true;
    } catch (err) {
      console.error("[medewerkerNotitiesDB] Migratiefout:", err);
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
        console.error("[medewerkerNotitiesDB] Bootstrap mislukt:", err);
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
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.medewerkerId) throw new Error("medewerkerId verplicht");
    if (!rec.bodyHtml) throw new Error("bodyHtml verplicht");
    var payload = objToInsertPayload(rec);
    var res = await global.besaSupabase
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
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
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
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase
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

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return readCache()
      .filter(function (r) { return r && String(r.medewerkerId) === s; })
      .slice()
      .sort(function (a, b) {
        var ta = a.createdAt || "";
        var tb = b.createdAt || "";
        return tb.localeCompare(ta);
      });
  }

  global.medewerkerNotitiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
