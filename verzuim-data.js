/* global window, localStorage */
/**
 * Verzuim — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: `public.verzuim` (1 tabel, kolom `type` = 'lang' | 'kort').
 * - Twee localStorage caches: "hr_verzuim_lang_rows" en "hr_verzuim_kort_rows".
 * - `pushType('lang' | 'kort', arr)` synct die ene categorie naar Supabase.
 */
(function (global) {
  "use strict";

  var TABLE = "verzuim";
  var CACHE_KEYS = {
    lang: "hr_verzuim_lang_rows",
    kort: "hr_verzuim_kort_rows",
  };
  var MIGRATION_FLAG_KEY = "verzuimMigratedToSupabase.v1";

  function readCache(type) {
    try {
      var raw = localStorage.getItem(CACHE_KEYS[type]);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(type, items) {
    try { localStorage.setItem(CACHE_KEYS[type], JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }
  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("besa:verzuim-updated")); } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      medewerker: row.medewerker || "",
      eerstZiektedag: row.eerst_ziektedag || "",
      verwachteTerug: row.verwachte_terug || "",
      werkelijkeTerug: row.werkelijke_terug || "",
      beschrijving: row.beschrijving || "",
      status: row.status || "Actief",
    };
  }
  function objToInsertPayload(o, type) {
    var safe = o || {};
    return {
      id: safe.id || ("vz_" + (type === "kort" ? "k_" : "l_") + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      type: type,
      medewerker: String(safe.medewerker || ""),
      eerst_ziektedag: safe.eerstZiektedag || null,
      verwachte_terug: safe.verwachteTerug || null,
      werkelijke_terug: safe.werkelijkeTerug || null,
      beschrijving: String(safe.beschrijving || ""),
      status: safe.status || "Actief",
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("eerst_ziektedag", { ascending: false, nullsFirst: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;
      var head = await global.besaSupabase.from(TABLE).select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }
      var langRows = readCache("lang");
      var kortRows = readCache("kort");
      var payload = []
        .concat(langRows.map(function (o) { return objToInsertPayload(o, "lang"); }))
        .concat(kortRows.map(function (o) { return objToInsertPayload(o, "kort"); }));
      if (!payload.length) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }
      console.info("[verzuimDB] Migratie van " + payload.length + " verzuim-records…");
      var ins = await global.besaSupabase.from(TABLE).insert(payload).select();
      if (ins.error) {
        console.error("[verzuimDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      return true;
    } catch (err) {
      console.error("[verzuimDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        var langItems = items.filter(function (i) { return i.type === "lang"; });
        var kortItems = items.filter(function (i) { return i.type === "kort"; });
        writeCache("lang", langItems);
        writeCache("kort", kortItems);
        dispatchUpdated();
      } catch (err) {
        console.error("[verzuimDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  /** Bulk full-overwrite voor één type (lang of kort): upsert + delete. */
  async function pushType(type, items) {
    if (!global.besaSupabase) return;
    if (!type || !Array.isArray(items)) return;
    if (type !== "lang" && type !== "kort") return;
    try {
      var existingHead = await global.besaSupabase.from(TABLE).select("id").eq("type", type);
      if (existingHead.error) {
        console.error("[verzuimDB] pushType select mislukt:", existingHead.error);
        return;
      }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var payload = items.map(function (o) { return objToInsertPayload(o, type); });
        var ups = await global.besaSupabase.from(TABLE).upsert(payload, { onConflict: "id" });
        if (ups.error) console.error("[verzuimDB] upsert mislukt:", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) console.error("[verzuimDB] delete mislukt:", del.error);
      }
    } catch (err) {
      console.error("[verzuimDB] pushType error:", err);
    }
  }

  global.verzuimDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushType: pushType,
    refresh: async function () {
      var items = await fetchAll();
      writeCache("lang", items.filter(function (i) { return i.type === "lang"; }));
      writeCache("kort", items.filter(function (i) { return i.type === "kort"; }));
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
