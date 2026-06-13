/* global window, localStorage */
/**
 * Medewerker verzuim-perioden — Supabase data-laag.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `medewerker_verzuim_perioden`.
 *  - Bij bootstrap fetcht deze module ALLE rijen (over alle medewerkers)
 *    en cachet ze onder "medewerker_verzuim_perioden_v1".
 *  - Schrijfacties (add/update/remove) gaan async naar Supabase; de cache
 *    wordt geüpdatet en `ff:medewerker-verzuim-updated` event firet voor
 *    live re-render.
 *  - Eénmalige migratie van legacy localStorage["employeeEditsById"] →
 *    elke `[empId].verzuim.kort[]` en `[empId].verzuim.lang[]` worden 1×
 *    ingelezen en geüpload als rijen met type='kort' / 'lang'.
 *
 * Datavorm in cache (camelCase, frontend-conventie):
 *   { id, medewerkerId, type: "kort"|"lang", eerstZiektedag, verwachteTerug,
 *     werkelijkeTerug, beschrijving, status }
 *
 * Gebruik:
 *   await window.medewerkerVerzuimDB.ready;
 *   var rows = window.medewerkerVerzuimDB.getForMedewerkerSync(empId);
 *   //   → array, sorteer/filter zelf op type indien nodig
 *   var filtered = window.medewerkerVerzuimDB.getForMedewerkerSync(empId, "kort");
 *   await window.medewerkerVerzuimDB.add({
 *     medewerkerId: emp.empId, type: "kort", eerstZiektedag: "2026-04-15",
 *     beschrijving: "<p>Griep</p>", status: "Actief"
 *   });
 *   await window.medewerkerVerzuimDB.remove(id);
 *   window.addEventListener("ff:medewerker-verzuim-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "medewerker_verzuim_perioden";
  var CACHE_KEY = "medewerker_verzuim_perioden_v1";
  var LEGACY_KEY = "employeeEditsById";
  var MIGRATION_FLAG = "medewerkerVerzuimMigratedToSupabase.v1";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var ALLOWED_TYPES = ["kort", "lang"];
  var ALLOWED_STATUS = ["Actief", "Hersteld"];

  function isoNow() { return new Date().toISOString(); }

  // In-memory bron-van-waarheid voor sync-reads. Bij volle localStorage-quota
  // faalt setItem stil; zonder _mem zouden sync-getters dan een lege lijst
  // teruggeven terwijl de data wél in Supabase staat. _mem voorkomt dat.
  var _mem = null;

  function readCache() {
    if (_mem != null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) { _mem = []; return _mem; }
      var p = JSON.parse(raw);
      _mem = Array.isArray(p) ? p : [];
      return _mem;
    } catch (e) { _mem = []; return _mem; }
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:medewerker-verzuim-updated", { detail: { source: source || "medewerker-verzuim-data" } }));
    } catch (e) { /* */ }
  }

  // Maak een ISO-date veilig: accepteer "yyyy-mm-dd" en "dd-mm-yyyy",
  // negeer rest. Geeft "" terug bij niet-parseerbaar.
  function normalizeIsoDate(v) {
    if (!v || typeof v !== "string") return "";
    var s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return "";
  }

  // Frontend-conventie blijft camelCase. DB-kolommen zijn snake_case.
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      type: ALLOWED_TYPES.indexOf(row.type) >= 0 ? row.type : "kort",
      eerstZiektedag: row.eerst_ziektedag || "",
      verwachteTerug: row.verwachte_terug || "",
      werkelijkeTerug: row.werkelijke_terug || "",
      beschrijving: row.beschrijving || "",
      status: ALLOWED_STATUS.indexOf(row.status) >= 0 ? row.status : "Actief",
      createdAt: row.aanmaakdatum || isoNow(),
      updatedAt: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var type = String(safe.type || "kort").toLowerCase();
    if (ALLOWED_TYPES.indexOf(type) === -1) type = "kort";
    var status = String(safe.status || "Actief");
    if (ALLOWED_STATUS.indexOf(status) === -1) status = "Actief";
    var eerst = normalizeIsoDate(safe.eerstZiektedag);
    var payload = {
      medewerker_id: String(safe.medewerkerId || ""),
      type: type,
      eerst_ziektedag: eerst || null,
      verwachte_terug: normalizeIsoDate(safe.verwachteTerug) || null,
      werkelijke_terug: normalizeIsoDate(safe.werkelijkeTerug) || null,
      beschrijving: safe.beschrijving ? String(safe.beschrijving) : null,
      status: status,
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
      .order("eerst_ziektedag", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
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

      var rows = [];
      Object.keys(legacy).forEach(function (empId) {
        var bucket = legacy[empId];
        if (!bucket || typeof bucket !== "object") return;
        var verzuim = bucket.verzuim;
        if (!verzuim || typeof verzuim !== "object") return;
        ALLOWED_TYPES.forEach(function (t) {
          var arr = Array.isArray(verzuim[t]) ? verzuim[t] : [];
          arr.forEach(function (it) {
            if (!it || typeof it !== "object") return;
            // eerstZiektedag is verplicht; sla over als leeg.
            if (!normalizeIsoDate(it.eerstZiektedag)) return;
            rows.push(objToInsertPayload({
              medewerkerId: empId,
              type: t,
              eerstZiektedag: it.eerstZiektedag,
              verwachteTerug: it.verwachteTerug,
              werkelijkeTerug: it.werkelijkeTerug,
              beschrijving: it.beschrijving,
              status: it.status,
            }));
          });
        });
      });

      if (rows.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[medewerkerVerzuimDB] Eenmalige migratie van " + rows.length + " verzuim-perioden naar Supabase…");
      var ins = await global.ffSupabase
        .from(TABLE)
        .insert(rows)
        .select();
      if (ins.error) {
        console.error("[medewerkerVerzuimDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      console.info("[medewerkerVerzuimDB] Migratie geslaagd: " + (ins.data || []).length + " rijen naar Supabase.");
      return true;
    } catch (err) {
      console.error("[medewerkerVerzuimDB] Migratiefout:", err);
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
        console.error("[medewerkerVerzuimDB] Bootstrap mislukt:", err);
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
    if (!rec || !rec.medewerkerId) throw new Error("medewerkerId verplicht");
    if (!normalizeIsoDate(rec.eerstZiektedag)) throw new Error("eerstZiektedag verplicht");
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

  // type is optioneel: indien gegeven, alleen rijen met dat type. Sortering
  // is op eerstZiektedag descending zodat nieuwste verzuim bovenaan staat.
  function getForMedewerkerSync(medewerkerId, type) {
    if (!medewerkerId) return [];
    var sId = String(medewerkerId);
    var sType = type ? String(type).toLowerCase() : null;
    return readCache()
      .filter(function (r) {
        if (!r || String(r.medewerkerId) !== sId) return false;
        if (sType && String(r.type) !== sType) return false;
        return true;
      })
      .slice()
      .sort(function (a, b) {
        var da = a.eerstZiektedag || "";
        var db = b.eerstZiektedag || "";
        return db.localeCompare(da);
      });
  }

  global.medewerkerVerzuimDB = {
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
