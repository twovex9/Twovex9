/* global window, localStorage */
/**
 * Urendeclaraties — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: `public.urendeclaraties`.
 * - localStorage onder "urendeclaraties_v1" = read-cache.
 * - `pushAll(arr)` bulk-sync (upsert + delete).
 *
 * UI rendert <tr>-rijen dynamisch op basis van getAllSync() of het
 * besa:urendeclaraties-updated event.
 */
(function (global) {
  "use strict";

  var TABLE = "urendeclaraties";
  var CACHE_KEY = "urendeclaraties_v1";

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
  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("besa:urendeclaraties-updated")); } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      client: row.client || "",
      maandLabel: row.maand_label || "",
      beschikking: row.beschikking || "",
      zorgsoort: row.zorgsoort || "",
      jaar: Number(row.jaar) || 0,
      maand: Number(row.maand) || 0,
      uurtarief: Number(row.uurtarief) || 0,
      bedrag: Number(row.bedrag) || 0,
      gedebiteerdeUren: Number(row.gedebiteerde_uren) || 0,
      ingediendeUren: Number(row.ingediende_uren) || 0,
    };
  }
  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      id: safe.id || ("ud_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      client: String(safe.client || ""),
      maand_label: String(safe.maandLabel || ""),
      beschikking: String(safe.beschikking || ""),
      zorgsoort: String(safe.zorgsoort || ""),
      jaar: Number(safe.jaar) || 0,
      maand: Number(safe.maand) || 0,
      uurtarief: Number(safe.uurtarief) || 0,
      bedrag: Number(safe.bedrag) || 0,
      gedebiteerde_uren: Number(safe.gedebiteerdeUren) || 0,
      ingediende_uren: Number(safe.ingediendeUren) || 0,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("jaar", { ascending: false })
      .order("maand", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated();
      } catch (err) {
        console.error("[urendeclaratiesDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  async function pushAll(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      var existingHead = await global.besaSupabase.from(TABLE).select("id");
      if (existingHead.error) {
        console.error("[urendeclaratiesDB] pushAll select mislukt:", existingHead.error);
        return;
      }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var ups = await global.besaSupabase.from(TABLE).upsert(items.map(objToInsertPayload), { onConflict: "id" });
        if (ups.error) console.error("[urendeclaratiesDB] upsert mislukt:", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) console.error("[urendeclaratiesDB] delete mislukt:", del.error);
      }
    } catch (err) {
      console.error("[urendeclaratiesDB] pushAll error:", err);
    }
  }

  global.urendeclaratiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushAll: pushAll,
    getAllSync: function () { return readCache(); },
    refresh: async function () {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
