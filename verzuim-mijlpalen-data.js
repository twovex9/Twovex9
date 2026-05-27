/* global window, document */
/**
 * verzuim-mijlpalen-data.js — sub-data-laag voor Wet-Poortwachter-mijlpalen.
 *
 * Tabel: public.verzuim_mijlpalen (uuid PK, FK verzuim_id text → verzuim.id).
 * Fields: mijlpaal_type, deadline_datum, voltooid_op, data jsonb.
 *
 * Public API:
 *   window.verzuimMijlpalenDB.ready                       → Promise
 *   window.verzuimMijlpalenDB.refresh()                   → Promise (refetch)
 *   window.verzuimMijlpalenDB.getAllSync()                → array
 *   window.verzuimMijlpalenDB.getForVerzuimSync(verzuimId)→ array
 *   window.verzuimMijlpalenDB.getVolgendeDeadlineSync(verzuimId) → {datum, dagen, status} | null
 *   window.verzuimMijlpalenDB.add(rec)                    → Promise
 *   window.verzuimMijlpalenDB.update(id, patch)           → Promise
 *   window.verzuimMijlpalenDB.markVoltooid(id, datum)     → Promise
 *   window.verzuimMijlpalenDB.delete(id)                  → Promise
 *
 * Event: besa:verzuim-mijlpalen-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verzuim_mijlpalen";
  var _mem = null;

  function reportSilent(action, err) {
    console.error("[verzuimMijlpalenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Verzuim-mijlpalen — " + action, err);
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      verzuimId: row.verzuim_id || "",
      mijlpaalType: row.mijlpaal_type || "",
      deadlineDatum: row.deadline_datum || null,
      voltooidOp: row.voltooid_op || null,
      data: row.data || {},
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    return {
      verzuim_id: String(safe.verzuimId || ""),
      mijlpaal_type: String(safe.mijlpaalType || ""),
      deadline_datum: safe.deadlineDatum || null,
      voltooid_op: safe.voltooidOp || null,
      data: safe.data || {},
    };
  }

  function emit() {
    try { global.dispatchEvent(new CustomEvent("besa:verzuim-mijlpalen-updated")); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.besaSupabase) return [];
    try {
      var res = await global.besaSupabase
        .from(TABLE)
        .select("*")
        .order("deadline_datum", { ascending: true, nullsFirst: false });
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
      // Wacht op auth-sessie via supabase-client zonder hard te falen
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

  /**
   * Volgende openstaande deadline voor een verzuim-rij.
   *   - null als geen openstaande mijlpaal
   *   - { datum, dagen, status: 'overdue' | 'warn' | 'ok' } anders
   *     overdue: deadline < vandaag
   *     warn: 0 ≤ deadline - vandaag ≤ 30 dagen
   *     ok: > 30 dagen vooruit
   */
  function getVolgendeDeadlineSync(verzuimId) {
    var items = getForVerzuimSync(verzuimId).filter(function (r) { return r && !r.voltooidOp && r.deadlineDatum; });
    if (items.length === 0) return null;
    items.sort(function (a, b) { return String(a.deadlineDatum).localeCompare(String(b.deadlineDatum)); });
    var earliest = items[0];
    var today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    var deadline = new Date(earliest.deadlineDatum + "T00:00:00Z");
    if (!isFinite(deadline.getTime())) return null;
    var dagen = Math.floor((deadline - today) / (1000 * 60 * 60 * 24));
    var status = "ok";
    if (dagen < 0) status = "overdue";
    else if (dagen <= 30) status = "warn";
    return { datum: earliest.deadlineDatum, dagen: dagen, status: status, mijlpaalType: earliest.mijlpaalType };
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.verzuim_id) throw new Error("verzuimId is verplicht");
    if (!payload.mijlpaal_type) throw new Error("mijlpaalType is verplicht");
    if (!payload.deadline_datum) throw new Error("deadlineDatum is verplicht");
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
    var upd = {};
    if (patch && "mijlpaalType" in patch) upd.mijlpaal_type = String(patch.mijlpaalType || "");
    if (patch && "deadlineDatum" in patch) upd.deadline_datum = patch.deadlineDatum || null;
    if (patch && "voltooidOp" in patch) upd.voltooid_op = patch.voltooidOp || null;
    if (patch && "data" in patch) upd.data = patch.data || {};
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

  async function markVoltooid(id, datum) {
    var iso = datum || new Date().toISOString().slice(0, 10);
    return update(id, { voltooidOp: iso });
  }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    if (_mem) _mem = _mem.filter(function (r) { return String(r.id) !== String(id); });
    emit();
    return true;
  }

  global.verzuimMijlpalenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: fetchAll,
    getAllSync: getAllSync,
    getForVerzuimSync: getForVerzuimSync,
    getVolgendeDeadlineSync: getVolgendeDeadlineSync,
    add: add,
    update: update,
    markVoltooid: markVoltooid,
    delete: remove,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})(typeof window !== "undefined" ? window : this);
