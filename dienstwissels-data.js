/* global window, document */
/**
 * dienstwissels-data.js — data-laag voor public.dienstwissels.
 * BS2-equivalent: /planning/management/switch-shifts (Diensten wisselen)
 */
(function (global) {
  "use strict";
  if (!global.ffSupabase) return;
  var supa = global.ffSupabase;
  var cache = [];

  function reportSilent(action, err) {
    console.error("[dienstwisselsDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Dienstwissels — " + action, err);
  }

  function emit() {
    try { window.dispatchEvent(new Event("ff:dienstwissels-updated")); } catch (e) {}
  }

  async function fetchAll() {
    try {
      var r = await supa.from("dienstwissels").select("*").order("created_at", { ascending: false });
      if (r.error) throw r.error;
      cache = r.data || [];
      emit();
      return cache;
    } catch (err) {
      reportSilent("fetchAll", err);
      return cache;
    }
  }

  async function add(row) {
    var resp = await supa.from("dienstwissels").insert(row).select().single();
    if (resp.error) throw resp.error;
    await fetchAll();
    return resp.data;
  }

  async function updateStatus(id, status) {
    var resp = await supa.from("dienstwissels").update({ status: status }).eq("id", id).select().single();
    if (resp.error) throw resp.error;
    await fetchAll();
    return resp.data;
  }

  function getAllSync() { return cache.slice(); }

  global.dienstwisselsDB = {
    fetchAll: fetchAll, getAllSync: getAllSync, add: add, updateStatus: updateStatus,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchAll);
  } else { fetchAll(); }
})(window);
