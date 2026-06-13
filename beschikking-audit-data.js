/* global window, localStorage */
/**
 * Beschikking audit-log — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `beschikking_audit_log`.
 *  - Bij bootstrap fetcht deze module ALLE audit-rijen (over alle
 *    beschikkingen) en cachet ze onder "beschikking_audit_log_v1". Dat blijft
 *    handelbaar omdat audit-rijen klein zijn en er niet veel per beschikking
 *    zijn (paar tientallen).
 *  - Schrijfactie `add` is async naar Supabase; cache wordt geüpdatet en
 *    `ff:beschikking-audit-updated` event firet voor live re-render.
 *  - Eénmalige migratie van legacy localStorage["ff_besc_audit_v1"]
 *    (object met bescId-keys → array[]) bij eerste boot na deploy.
 *
 * Gebruik:
 *   await window.beschikkingAuditDB.ready;
 *   var rows = window.beschikkingAuditDB.getForBescSync(bescId);
 *   await window.beschikkingAuditDB.add({
 *     bescId: "b_besc_001",
 *     act: "bewerken",
 *     gebruiker: "Jason Sonck",
 *     details: "Beschikking opgeslagen",
 *   });
 *   window.addEventListener("ff:beschikking-audit-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "beschikking_audit_log";
  var CACHE_KEY = "beschikking_audit_log_v1";
  var LEGACY_KEY = "ff_besc_audit_v1";
  var MIGRATION_FLAG = "beschikkingAuditMigratedToSupabase.v1";

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var ALLOWED_ACTS = ["aanmaken", "bekijken", "bewerken"];

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
    var d = { detail: { source: source || "beschikking-audit-data" } };
    try { global.dispatchEvent(new CustomEvent("ff:beschikking-audit-updated", d)); } catch (e) { /* */ }
    try { if (global.document) global.document.dispatchEvent(new CustomEvent("ff:beschikking-audit-updated", d)); } catch (e2) { /* */ }
  }

  // Frontend-conventie blijft camelCase + korte keys (t/act/user/details/
  // res/ip/ua/st), DB-kolommen zijn snake_case. Hier mappen.
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      bescId: row.beschikking_id || "",
      t: row.t || isoNow(),
      act: row.act || "bekijken",
      user: row.gebruiker || "Onbekend",
      details: row.details || "",
      res: row.resource || "Beschikking",
      ip: row.ip || "",
      ua: row.user_agent || "",
      st: row.status || "succes",
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var act = String(safe.act || "bekijken").toLowerCase();
    if (ALLOWED_ACTS.indexOf(act) === -1) act = "bekijken";
    var payload = {
      beschikking_id: String(safe.bescId || ""),
      t: safe.t && typeof safe.t === "string" ? safe.t : isoNow(),
      act: act,
      gebruiker: safe.user ? String(safe.user) : "Onbekend",
      details: safe.details ? String(safe.details) : null,
      resource: safe.res ? String(safe.res) : "Beschikking",
      ip: safe.ip ? String(safe.ip) : null,
      user_agent: safe.ua ? String(safe.ua) : null,
      status: safe.st ? String(safe.st) : "succes",
    };
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    // PostgREST capt standaard op 1000 rijen. De audit-tabel is na de
    // BS2-reconciliatie >1000 (1181+), dus pagineer met .range() tot alles
    // binnen is — anders missen oudere BS2-audit-rijen (bv. per beschikking).
    var all = [], from = 0, PAGE = 1000;
    for (;;) {
      var res = await global.ffSupabase
        .from(TABLE)
        .select("*")
        .order("t", { ascending: false })
        .range(from, from + PAGE - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < PAGE) break;
      from += PAGE;
      if (from > 200000) break; // veiligheidscap
    }
    return all.map(rowToObj).filter(Boolean);
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

      // Legacy-formaat: { "<bescId>": [ row, row, ... ], "<bescId2>": [ ... ] }
      var rows = [];
      Object.keys(legacy).forEach(function (bescId) {
        var arr = legacy[bescId];
        if (!Array.isArray(arr)) return;
        arr.forEach(function (r) {
          if (!r || typeof r !== "object") return;
          rows.push(objToInsertPayload({
            bescId: bescId,
            t: r.t,
            act: r.act,
            user: r.user,
            details: r.details,
            res: r.res,
            ip: r.ip,
            ua: r.ua,
            st: r.st,
          }));
        });
      });
      if (rows.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[beschikkingAuditDB] Eenmalige migratie van " + rows.length + " audit-rijen naar Supabase…");
      var ins = await global.ffSupabase
        .from(TABLE)
        .insert(rows)
        .select();
      if (ins.error) {
        console.error("[beschikkingAuditDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch (e) { /* */ }
      // Stage 7: opruimen van legacy localStorage-key na succesvolle migratie.
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* */ }
      console.info("[beschikkingAuditDB] Migratie geslaagd: " + (ins.data || []).length + " rijen naar Supabase.");
      return true;
    } catch (err) {
      console.error("[beschikkingAuditDB] Migratiefout:", err);
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
        console.error("[beschikkingAuditDB] Bootstrap mislukt:", err);
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

  // add() is fire-and-forget veilig: we voegen optimistisch toe aan de cache
  // met een tijdelijke client-side id zodat de UI direct ververst, en wachten
  // op het Supabase-antwoord om de echte UUID + timestamp te krijgen.
  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.bescId) throw new Error("bescId verplicht");
    var payload = objToInsertPayload(rec);
    // Optimistic insert in cache (met tijdelijke id) zodat audit-tabel direct
    // de actie laat zien — handig voor "Beschikking opgeslagen" feedback.
    var tempId = "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    var optimistic = rowToObj({
      id: tempId,
      beschikking_id: payload.beschikking_id,
      t: payload.t,
      act: payload.act,
      gebruiker: payload.gebruiker,
      details: payload.details,
      resource: payload.resource,
      ip: payload.ip,
      user_agent: payload.user_agent,
      status: payload.status,
    });
    var cache = readCache();
    cache.unshift(optimistic);
    writeCache(cache);
    dispatchUpdated("add-optimistic");

    var res = await global.ffSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) {
      // Rol de optimistic-rij terug.
      var rollback = readCache().filter(function (r) { return r && String(r.id) !== tempId; });
      writeCache(rollback);
      dispatchUpdated("add-rollback");
      throw res.error;
    }
    var obj = rowToObj(res.data);
    var cache2 = readCache();
    var idx = cache2.findIndex(function (r) { return r && String(r.id) === tempId; });
    if (idx >= 0) cache2[idx] = obj; else cache2.unshift(obj);
    writeCache(cache2);
    dispatchUpdated("add");
    return obj;
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
    return readCache()
      .filter(function (r) { return r && String(r.bescId) === s; })
      .slice()
      .sort(function (a, b) {
        var ta = a.t || "";
        var tb = b.t || "";
        return tb.localeCompare(ta);
      });
  }

  global.beschikkingAuditDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForBescSync: getForBescSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
