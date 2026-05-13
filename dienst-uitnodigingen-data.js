/* global window, document */
/**
 * dienst-uitnodigingen-data.js — data-laag voor public.dienst_uitnodigingen.
 *
 * BS2-equivalent: per dienst toont detail-modal Toegewezen (status=toegewezen) +
 * Uitgenodigd (status=uitgenodigd) + Aanmeldingen (status=aangemeld) lists.
 */
(function (global) {
  "use strict";
  if (!global.besaSupabase) return;
  var supa = global.besaSupabase;
  var cacheByDienst = {};

  function reportSilent(action, err) {
    console.error("[dienstUitnodigingenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Uitnodigingen — " + action, err);
  }

  function emit(dienstId) {
    try { window.dispatchEvent(new CustomEvent("besa:dienst-uitnodigingen-updated", { detail: { dienstId: dienstId } })); } catch (e) { /* */ }
  }

  async function fetchForDienst(dienstId) {
    if (!dienstId) return [];
    try {
      var r = await supa
        .from("dienst_uitnodigingen")
        .select("id, dienst_id, medewerker_id, status, uitgenodigd_door, notitie, created_at, updated_at")
        .eq("dienst_id", dienstId)
        .order("created_at", { ascending: false });
      if (r.error) throw r.error;
      cacheByDienst[dienstId] = r.data || [];
      emit(dienstId);
      return cacheByDienst[dienstId];
    } catch (err) {
      reportSilent("fetchForDienst", err);
      return cacheByDienst[dienstId] || [];
    }
  }

  function getForDienstSync(dienstId) {
    return cacheByDienst[dienstId] || [];
  }

  async function add(payload) {
    if (!payload || !payload.dienst_id || !payload.medewerker_id) {
      throw new Error("dienst_id + medewerker_id verplicht");
    }
    var uid = null;
    try { var r = await supa.auth.getUser(); uid = r && r.data && r.data.user ? r.data.user.id : null; } catch (e) {}
    var row = {
      dienst_id: payload.dienst_id,
      medewerker_id: payload.medewerker_id,
      status: payload.status || "uitgenodigd",
      uitgenodigd_door: uid,
      notitie: payload.notitie || null,
    };
    var resp = await supa.from("dienst_uitnodigingen").insert(row).select().single();
    if (resp.error) throw resp.error;
    cacheByDienst[payload.dienst_id] = (cacheByDienst[payload.dienst_id] || []).concat([resp.data]);
    emit(payload.dienst_id);
    return resp.data;
  }

  async function updateStatus(id, status, dienstId) {
    var resp = await supa.from("dienst_uitnodigingen").update({ status: status }).eq("id", id).select().single();
    if (resp.error) throw resp.error;
    if (dienstId) await fetchForDienst(dienstId);
    return resp.data;
  }

  async function remove(id, dienstId) {
    var resp = await supa.from("dienst_uitnodigingen").delete().eq("id", id);
    if (resp.error) throw resp.error;
    if (dienstId) await fetchForDienst(dienstId);
  }

  global.dienstUitnodigingenDB = {
    fetchForDienst: fetchForDienst,
    getForDienstSync: getForDienstSync,
    add: add,
    updateStatus: updateStatus,
    remove: remove,
  };
})(window);
