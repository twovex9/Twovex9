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
      // PR #6 — Pauline override velden (alleen Ambulant Intern)
      overrideUren: row.override_uren == null ? null : Number(row.override_uren),
      overrideReden: row.override_reden || "",
      overrideBy: row.override_by || null,
      overrideByNaam: row.override_by_naam || "",
      overrideAt: row.override_at || null,
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

  function reportSilent(action, err) {
    console.error("[urendeclaratiesDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Urendeclaraties — " + action, err);
  }

  async function pushAll(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    try {
      var existingHead = await global.besaSupabase.from(TABLE).select("id");
      if (existingHead.error) { reportSilent("pushAll select", existingHead.error); return; }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      if (items.length) {
        var ups = await global.besaSupabase.from(TABLE).upsert(items.map(objToInsertPayload), { onConflict: "id" });
        if (ups.error) reportSilent("upsert", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) reportSilent("delete", del.error);
      }
    } catch (err) {
      reportSilent("pushAll", err);
    }
  }

  /**
   * PR #6 — Pauline override op (Ambulant Intern) urendeclaratie.
   *   setOverride(id, uren, reden)  → uren=null + reden="" wist override
   * Reden is verplicht wanneer uren wordt gezet.
   */
  async function setOverride(id, uren, reden) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var clearOverride = (uren == null || uren === "");
    if (!clearOverride && (!reden || !String(reden).trim())) {
      throw new Error("Reden is verplicht bij override");
    }
    var profile = global.besaCurrentProfile || (global.profilesDB && global.profilesDB.getCurrentSync ? global.profilesDB.getCurrentSync() : null);
    var byId = profile ? (profile.id || null) : null;
    var byName = "";
    if (profile) {
      byName = ((profile.voornaam || "") + " " + (profile.achternaam || "")).trim();
      if (!byName && profile.email) byName = profile.email;
    }
    var payload;
    if (clearOverride) {
      payload = { override_uren: null, override_reden: null, override_by: null, override_by_naam: "", override_at: null };
    } else {
      payload = {
        override_uren: Number(uren),
        override_reden: String(reden).trim(),
        override_by: byId,
        override_by_naam: byName,
        override_at: new Date().toISOString(),
      };
    }
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated();
    return obj;
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
    setOverride: setOverride,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
