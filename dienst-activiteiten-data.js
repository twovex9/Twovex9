/* global window, document */
/**
 * dienst-activiteiten-data.js — data-laag voor public.dienst_activiteiten.
 *
 * BS2-equivalent: Activiteit-feed in dienst-detail modal toont:
 *   - audit-events ("Heeft de dienst aangemaakt", "Heeft de dienst opengesteld", ...)
 *   - comments (vrije tekst van users, type='comment')
 *
 * Voor audit-events: insert via trigger log_dienst_activity() (DB-zijde, automatic).
 * Voor comments: insert via addComment(dienstId, body).
 */
(function (global) {
  "use strict";
  if (!global.ffSupabase) return;
  var supa = global.ffSupabase;
  var cacheByDienst = {};

  function reportSilent(action, err) {
    console.error("[dienstActiviteitenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Activiteit — " + action, err);
  }

  function emit(dienstId) {
    try { window.dispatchEvent(new CustomEvent("ff:dienst-activiteiten-updated", { detail: { dienstId: dienstId } })); } catch (e) { /* */ }
  }

  async function fetchForDienst(dienstId) {
    if (!dienstId) return [];
    try {
      var r = await supa
        .from("dienst_activiteiten")
        .select("id, dienst_id, actor_profile_id, type, action, body, created_at")
        .eq("dienst_id", dienstId)
        .order("created_at", { ascending: true });
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

  async function addComment(dienstId, body) {
    if (!dienstId || !body || !body.trim()) throw new Error("dienst_id + body verplicht");
    var uid = null;
    try { var r = await supa.auth.getUser(); uid = r && r.data && r.data.user ? r.data.user.id : null; } catch (e) {}
    var row = {
      dienst_id: dienstId,
      actor_profile_id: uid,
      type: "comment",
      body: body.trim(),
    };
    var resp = await supa.from("dienst_activiteiten").insert(row).select().single();
    if (resp.error) throw resp.error;
    cacheByDienst[dienstId] = (cacheByDienst[dienstId] || []).concat([resp.data]);
    emit(dienstId);
    return resp.data;
  }

  global.dienstActiviteitenDB = {
    fetchForDienst: fetchForDienst,
    getForDienstSync: getForDienstSync,
    addComment: addComment,
  };
})(window);
