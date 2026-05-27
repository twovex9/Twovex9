/* global window, document */
/**
 * planning-settings-data.js — singleton config voor public.planning_settings.
 * BS2-equivalent: /planning/management/settings (Compensatie-uren Drempelwaarden)
 */
(function (global) {
  "use strict";
  if (!global.besaSupabase) return;
  var supa = global.besaSupabase;
  var cache = null;

  function reportSilent(action, err) {
    console.error("[planningSettingsDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Planning instellingen — " + action, err);
  }

  function emit() {
    try { window.dispatchEvent(new Event("besa:planning-settings-updated")); } catch (e) {}
  }

  async function fetch() {
    try {
      var r = await supa.from("planning_settings").select("*").maybeSingle();
      if (r.error) throw r.error;
      cache = r.data || { min_compensatie_uren: -20, max_compensatie_uren: 20, km_tarief: 0.23 };
      // Backfill: oude rijen zonder km_tarief defaulten op 0.23 voor UI
      if (cache.km_tarief == null) cache.km_tarief = 0.23;
      emit();
      return cache;
    } catch (err) {
      reportSilent("fetch", err);
      return cache;
    }
  }

  async function update(patch) {
    if (!cache || !cache.id) await fetch();
    var resp = await supa.from("planning_settings").update(patch).eq("id", cache.id).select().single();
    if (resp.error) throw resp.error;
    cache = resp.data;
    emit();
    return cache;
  }

  function getSync() { return cache; }

  global.planningSettingsDB = { fetch: fetch, update: update, getSync: getSync };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetch);
  } else { fetch(); }
})(window);
