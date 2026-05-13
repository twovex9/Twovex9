/* global window, document */
/**
 * beschikbaarheidstypes-data.js — data-laag voor public.beschikbaarheidstypes.
 * BS2-equivalent: /planning/management/availability-types
 */
(function (global) {
  "use strict";
  if (!global.besaSupabase) return;
  var supa = global.besaSupabase;
  var cache = [];

  function reportSilent(action, err) {
    console.error("[beschikbaarheidstypesDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Beschikbaarheidstypes — " + action, err);
  }

  function emit() {
    try { window.dispatchEvent(new Event("besa:beschikbaarheidstypes-updated")); } catch (e) {}
  }

  async function fetchAll() {
    try {
      var r = await supa.from("beschikbaarheidstypes").select("*").order("naam");
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
    var resp = await supa.from("beschikbaarheidstypes").insert(row).select().single();
    if (resp.error) throw resp.error;
    await fetchAll();
    return resp.data;
  }

  async function update(id, patch) {
    var resp = await supa.from("beschikbaarheidstypes").update(patch).eq("id", id).select().single();
    if (resp.error) throw resp.error;
    await fetchAll();
    return resp.data;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }
  async function remove(id) {
    var resp = await supa.from("beschikbaarheidstypes").delete().eq("id", id);
    if (resp.error) throw resp.error;
    await fetchAll();
  }

  function getAllSync() { return cache.slice(); }

  global.beschikbaarheidstypesDB = {
    fetchAll: fetchAll, getAllSync: getAllSync, add: add, update: update,
    archive: archive, restore: restore, delete: remove,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchAll);
  } else { fetchAll(); }
})(window);
