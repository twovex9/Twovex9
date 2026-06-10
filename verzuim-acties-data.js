/* global window, document */
/**
 * verzuim-acties-data.js — sub-data-laag voor re-integratie-acties per
 * verzuimcasus (G35). Tabel: public.verzuim_acties (uuid PK, FK verzuim_id
 * text → verzuim.id). Velden: omschrijving, deadline, voltooid_op,
 * uitgevoerd_door uuid. Office-only RLS.
 *
 * Public API: window.verzuimActiesDB.ready / .refresh() / .getAllSync() /
 *   .getForVerzuimSync(id) / .add(rec) / .update(id, patch) / .delete(id)
 * Event: besa:verzuim-acties-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verzuim_acties";
  var _mem = null;

  function reportSilent(action, err) {
    console.error("[verzuimActiesDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Verzuim-acties — " + action, err);
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      verzuimId: row.verzuim_id || "",
      omschrijving: row.omschrijving || "",
      deadline: row.deadline || null,
      voltooidOp: row.voltooid_op || null,
      uitgevoerdDoor: row.uitgevoerd_door || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function emit() {
    try { global.dispatchEvent(new CustomEvent("besa:verzuim-acties-updated")); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.besaSupabase) return [];
    try {
      var res = await global.besaSupabase.from(TABLE).select("*")
        .order("deadline", { ascending: true, nullsFirst: false });
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
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = {
      verzuim_id: String((rec && rec.verzuimId) || ""),
      omschrijving: String((rec && rec.omschrijving) || "").trim(),
      deadline: (rec && rec.deadline) || null,
      voltooid_op: (rec && rec.voltooidOp) || null,
      uitgevoerd_door: (rec && rec.uitgevoerdDoor) || null,
    };
    if (!payload.verzuim_id) throw new Error("verzuimId is verplicht");
    if (!payload.omschrijving) throw new Error("omschrijving is verplicht");
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    (_mem = _mem || []).push(obj);
    emit();
    return obj;
  }

  async function update(id, patch) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("id is verplicht");
    var upd = { laatst_gewijzigd: new Date().toISOString() };
    if (patch && "omschrijving" in patch) upd.omschrijving = String(patch.omschrijving || "").trim();
    if (patch && "deadline" in patch) upd.deadline = patch.deadline || null;
    if (patch && "voltooidOp" in patch) upd.voltooid_op = patch.voltooidOp || null;
    if (patch && "uitgevoerdDoor" in patch) upd.uitgevoerd_door = patch.uitgevoerdDoor || null;
    var res = await global.besaSupabase.from(TABLE).update(upd).eq("id", id).select().single();
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
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    if (_mem) _mem = _mem.filter(function (r) { return String(r.id) !== String(id); });
    emit();
    return true;
  }

  global.verzuimActiesDB = {
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
