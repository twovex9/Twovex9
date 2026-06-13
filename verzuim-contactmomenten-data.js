/* global window, document */
/**
 * verzuim-contactmomenten-data.js — sub-data-laag voor verzuim-contactmomenten.
 *
 * Tabel: public.verzuim_contactmomenten (uuid PK, FK verzuim_id text → verzuim.id).
 * Fields: datum, type (contactmoment/PVA/1e_jaars_evaluatie/eindevaluatie/arbo/anders),
 *         notitie, uitgevoerd_door uuid, data jsonb.
 *
 * Public API:
 *   window.verzuimContactmomentenDB.ready
 *   .refresh() / .getAllSync() / .getForVerzuimSync(id)
 *   .add(rec) / .update(id, patch) / .delete(id)
 *
 * Event: ff:verzuim-contactmomenten-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verzuim_contactmomenten";
  var _mem = null;

  function reportSilent(action, err) {
    console.error("[verzuimContactmomentenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Verzuim-contactmomenten — " + action, err);
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      verzuimId: row.verzuim_id || "",
      datum: row.datum || null,
      type: row.type || "",
      notitie: row.notitie || "",
      uitgevoerdDoor: row.uitgevoerd_door || null,
      data: row.data || {},
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      verzuim_id: String(safe.verzuimId || ""),
      datum: safe.datum || null,
      type: String(safe.type || ""),
      notitie: String(safe.notitie || ""),
      uitgevoerd_door: safe.uitgevoerdDoor || null,
      data: safe.data || {},
    };
  }

  function emit() {
    try { global.dispatchEvent(new CustomEvent("ff:verzuim-contactmomenten-updated")); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.ffSupabase) return [];
    try {
      var res = await global.ffSupabase
        .from(TABLE)
        .select("*")
        .order("datum", { ascending: false, nullsFirst: false });
      if (res.error) { reportSilent("fetchAll", res.error); return _mem || []; }
      _mem = (res.data || []).map(rowToObj).filter(Boolean);
      emit();
      return _mem;
    } catch (err) {
      reportSilent("fetchAll", err);
      return _mem || [];
    }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try { await fetchAll(); } catch (e) { reportSilent("bootstrap", e); }
    })();
    return readyPromise;
  }

  function getAllSync() { return _mem || []; }

  function getForVerzuimSync(verzuimId) {
    if (!verzuimId) return [];
    var s = String(verzuimId);
    return (_mem || []).filter(function (r) { return r && String(r.verzuimId) === s; });
  }

  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.verzuim_id) throw new Error("verzuimId is verplicht");
    if (!payload.datum) throw new Error("datum is verplicht");
    if (!payload.type) throw new Error("type is verplicht");
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    (_mem = _mem || []).unshift(obj);
    emit();
    return obj;
  }

  async function update(id, patch) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("id is verplicht");
    var upd = {};
    if (patch && "datum" in patch) upd.datum = patch.datum || null;
    if (patch && "type" in patch) upd.type = String(patch.type || "");
    if (patch && "notitie" in patch) upd.notitie = String(patch.notitie || "");
    if (patch && "data" in patch) upd.data = patch.data || {};
    var res = await global.ffSupabase.from(TABLE).update(upd).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    if (_mem) {
      for (var i = 0; i < _mem.length; i++) {
        if (String(_mem[i].id) === String(id)) { _mem[i] = obj; break; }
      }
    }
    emit();
    return obj;
  }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    if (_mem) _mem = _mem.filter(function (r) { return String(r.id) !== String(id); });
    emit();
    return true;
  }

  global.verzuimContactmomentenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: fetchAll,
    getAllSync: getAllSync,
    getForVerzuimSync: getForVerzuimSync,
    add: add,
    update: update,
    delete: remove,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})(typeof window !== "undefined" ? window : this);
