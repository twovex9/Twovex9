/* global window */
/**
 * Facturen — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `facturen`.
 *  - Bij bootstrap fetcht deze module alle facturen en overschrijft
 *    `window.FACTUREN_BULK` met de DB-records. Elk record bevat een vast
 *    `id` (bv. "f_0001") en een `archived` boolean. De UI (facturen.js)
 *    luistert naar `besa:facturen-updated` om opnieuw te renderen.
 *  - localStorage onder "facturenItemsV1" = read-cache zodat een tweede
 *    page-load instant data heeft, ook vóór de Supabase-fetch klaar is.
 *  - Schrijfacties (add/archive/restore/delete) gaan async naar Supabase;
 *    de cache wordt geüpdatet en het update-event wordt gefired.
 *
 * Toekomst (auth): RLS-policies in supabase/schema.sql kunnen activated
 * worden zonder hier iets te wijzigen.
 */
(function (global) {
  "use strict";

  var TABLE = "facturen";
  var CACHE_KEY = "facturenItemsV1";
  var MIGRATION_FLAG_KEY = "facturenMigratedToSupabase.v1";

  function isoNow() { return new Date().toISOString(); }

  function genId() {
    return "f_" + Date.now().toString(36) + "_" + String(Math.random()).slice(2, 8);
  }

  // ---------------------------------------------------------------------------
  // Bedrag formatting (NL): numeric ⇄ "€ 13.373,00"
  // ---------------------------------------------------------------------------
  function formatBedragNL(num) {
    var n = Number(num);
    if (!isFinite(n)) n = 0;
    var neg = n < 0;
    n = Math.abs(n);
    var whole = Math.floor(n);
    var cents = Math.round((n - whole) * 100);
    var s = String(whole);
    var withDots = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var centsStr = (cents < 10 ? "0" : "") + cents;
    return (neg ? "-" : "") + "€ " + withDots + "," + centsStr;
  }

  function parseBedragNL(s) {
    if (s == null) return 0;
    if (typeof s === "number") return Math.round(s * 100) / 100;
    var t = String(s).replace(/€/g, "").replace(/\s/g, "");
    if (t === "" || t === "-" || t === "—" || t === "–") return 0;
    if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(t);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  // ---------------------------------------------------------------------------
  // Mapping rij ⇄ frontend object (met de shape uit FACTUREN_BULK)
  // ---------------------------------------------------------------------------
  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      fn: row.factuurnummer || "",
      besch: row.beschikking_label || "",
      client: row.client_label || "",
      nr: row.clientnummer || "",
      clientId: row.client_id || "",
      per: row.periode || "",
      beta: row.betaling_text || "",
      st: row.status || "",
      bedr: formatBedragNL(row.bedrag),
      bedragNum: Number(row.bedrag) || 0,
      archived: !!row.gearchiveerd,
      aanmaakdatum: row.aanmaakdatum || null,
      laatstGewijzigd: row.laatst_gewijzigd || null,
      _data: row.data || {},
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var bedrag = safe.bedragNum != null
      ? parseBedragNL(safe.bedragNum)
      : parseBedragNL(safe.bedr);
    return {
      id: safe.id || genId(),
      factuurnummer: String(safe.fn || ""),
      beschikking_label: String(safe.besch || ""),
      client_label: String(safe.client || ""),
      client_id: safe.clientId || null,
      clientnummer: safe.nr == null ? null : String(safe.nr),
      periode: String(safe.per || ""),
      betaling_text: String(safe.beta || ""),
      status: String(safe.st || ""),
      bedrag: bedrag,
      gearchiveerd: !!safe.archived,
      data: (safe._data && typeof safe._data === "object") ? safe._data : {},
    };
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Cache (localStorage)
  // ---------------------------------------------------------------------------
  function readCache() {
    try {
      var raw = global.localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    try {
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) { /* */ }
  }

  function dispatchUpdated() {
    try {
      global.dispatchEvent(new CustomEvent("besa:facturen-updated"));
    } catch (e) { /* */ }
  }

  /** Vult window.FACTUREN_BULK met de DB-data zodat facturen.js + andere
   *  consumers (zoals beschikking-detail) de records direct kunnen lezen. */
  function pushToGlobalBulk(items) {
    try {
      global.FACTUREN_BULK = (Array.isArray(items) ? items : []).slice();
    } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Supabase fetch + bootstrap
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Server-side paginatie (facturen-overzicht): laad ALLEEN de huidige pagina.
  // De facturen-overzichtspagina (facturen.html) mag NIET alle ~956 records in
  // één keer ophalen. Andere consumers (beschikking-detail, client-detail,
  // facturen-te-beoordelen) blijven de volledige bulk gebruiken — voor die
  // pagina's verandert er niets.
  // ---------------------------------------------------------------------------
  function isFacturenOverviewPage() {
    try {
      var p = String((global.location && global.location.pathname) || "").toLowerCase();
      return /(^|\/)facturen\.html$/.test(p);
    } catch (e) { return false; }
  }

  /** Eén pagina facturen + exacte totaal-count, server-side gesorteerd op
   *  factuurnummer (aflopend) — identiek aan de default-volgorde van het
   *  overzicht. `archived === true` → enkel gearchiveerde rijen, `false` →
   *  enkel actieve rijen, `undefined` → alles. */
  async function fetchPage(opts) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var o = opts || {};
    var offset = Math.max(0, parseInt(o.offset, 10) || 0);
    var limit = Math.max(1, parseInt(o.limit, 10) || 25);
    var q = global.besaSupabase
      .from(TABLE)
      .select("*", { count: "exact" })
      .order("factuurnummer", { ascending: false })
      .order("id", { ascending: true });
    if (o.archived === true) q = q.eq("gearchiveerd", true);
    else if (o.archived === false) q = q.eq("gearchiveerd", false);
    var res = await q.range(offset, offset + limit - 1);
    if (res.error) throw res.error;
    return {
      rows: (res.data || []).map(rowToObj).filter(Boolean),
      total: (res.count == null ? null : res.count),
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    // Chunked fetch: PostgREST default limit is 1000 per query.
    // Voor facturen (990+ records) preventief paginatie zodat we niet
    // bij groei door 1000-grens vallen.
    var chunkSize = 1000;
    var all = [];
    var offset = 0;
    while (true) {
      var res = await global.besaSupabase
        .from(TABLE)
        .select("*")
        .order("factuurnummer", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + chunkSize - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < chunkSize) break;
      offset += chunkSize;
      if (offset > 50000) break;
    }
    return all.map(rowToObj).filter(Boolean);
  }

  /** Eenmalige migratie van bestaande facturen-supplementen (door gebruiker
   *  toegevoegde rijen in localStorage) naar Supabase. */
  async function maybeMigrateLocalToSupabase() {
    try {
      if (global.localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;

      var head = await global.besaSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { global.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var supRaw = "[]";
      try { supRaw = global.localStorage.getItem("facturen_supplement_v1") || "[]"; } catch (e) { /* */ }
      var sup = [];
      try { sup = JSON.parse(supRaw) || []; } catch (e) { sup = []; }
      if (!Array.isArray(sup) || sup.length === 0) {
        try { global.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[facturenDB] Eenmalige migratie van " + sup.length + " supplement-facturen naar Supabase…");
      var payload = sup.map(function (r) { return objToInsertPayload(r); });
      var ins = await global.besaSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[facturenDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { global.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      // Stage 7: opruimen van legacy localStorage-key na succesvolle migratie.
      try { global.localStorage.removeItem("facturen_supplement_v1"); } catch (e) { /* */ }
      console.info("[facturenDB] Migratie geslaagd: " + (ins.data || []).length + " supplement-facturen geüpload.");
      return true;
    } catch (err) {
      console.error("[facturenDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    // Initialiseer global bulk vanuit cache zodat de eerste render snel is.
    var cached = readCache();
    if (cached.length) pushToGlobalBulk(cached);

    // Op het facturen-overzicht (facturen.html) NIET alle records eager
    // ophalen. facturen.js doet daar server-side paginatie via fetchPage()
    // en valt enkel terug op een volledige load wanneer er een filter/zoek/
    // sortering actief is. Vlag zodat facturen.js weet dat lazy-modus geldt.
    var lazyOverview = isFacturenOverviewPage();
    if (lazyOverview) {
      try { global.__FACT_LAZY_OVERVIEW = true; } catch (e) { /* */ }
      readyPromise = (async function () {
        try { await maybeMigrateLocalToSupabase(); } catch (err) {
          console.error("[facturenDB] Bootstrap (lazy) mislukt:", err);
        }
      })();
      return readyPromise;
    }

    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        writeCache(items);
        pushToGlobalBulk(items);
        dispatchUpdated();
      } catch (err) {
        console.error("[facturenDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    try {
      var items = await fetchAll();
      writeCache(items);
      pushToGlobalBulk(items);
      dispatchUpdated();
      return items;
    } catch (err) {
      console.error("[facturenDB] Refresh mislukt:", err);
      return readCache();
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
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
    pushToGlobalBulk(cache);
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
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(cache);
    pushToGlobalBulk(cache);
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
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    pushToGlobalBulk(cache);
    dispatchUpdated();
    return true;
  }

  /** Verwijder alle facturen die geïmporteerd zijn via een specifieke
   *  importJob (uit `data.importJobId` jsonb-veld). Wordt aangeroepen door
   *  facturen-importeren.js wanneer een import-job uit de history-lijst
   *  wordt verwijderd, zodat de bijbehorende facturen ook in Supabase weg
   *  zijn (anders bleven ze bij volgende refresh terugkomen). */
  async function removeByImportJobId(jobId) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!jobId) return 0;
    // Filter via JSONB-pad — Supabase ondersteunt eq op data->>importJobId.
    var res = await global.besaSupabase
      .from(TABLE)
      .delete()
      .filter("data->>importJobId", "eq", String(jobId));
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) {
      var d = r && r._data;
      return !d || String(d.importJobId || "") !== String(jobId);
    });
    writeCache(cache);
    pushToGlobalBulk(cache);
    dispatchUpdated();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Synchrone helpers
  // ---------------------------------------------------------------------------
  function getAllSync() { return readCache(); }
  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var api = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    fetchPage: fetchPage,
    isLazyOverview: function () { return !!global.__FACT_LAZY_OVERVIEW; },
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    removeByImportJobId: removeByImportJobId,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    formatBedragNL: formatBedragNL,
    parseBedragNL: parseBedragNL,
  };

  global.facturenDB = api;
  bootstrap();
})(typeof window !== "undefined" ? window : this);
