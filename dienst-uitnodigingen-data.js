/* global window, document */
/**
 * dienst-uitnodigingen-data.js — data-laag voor public.dienst_uitnodigingen.
 *
 * BS2-equivalent: per dienst toont detail-modal Toegewezen (status=toegewezen) +
 * Uitgenodigd (status=uitgenodigd) + Aanmeldingen (status=aangemeld) lists.
 */
(function (global) {
  "use strict";
  if (!global.ffSupabase) return;
  var supa = global.ffSupabase;
  var cacheByDienst = {};

  function reportSilent(action, err) {
    console.error("[dienstUitnodigingenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Uitnodigingen — " + action, err);
  }

  function emit(dienstId) {
    try { window.dispatchEvent(new CustomEvent("ff:dienst-uitnodigingen-updated", { detail: { dienstId: dienstId } })); } catch (e) { /* */ }
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

  // Bulk-variant voor het Open-diensten-overzicht: haalt de uitnodigingen voor
  // een set diensten in één keer op en vult de per-dienst cache (incl. lege
  // lijsten, zodat getForDienstSync ook "0 aanmeldingen" correct teruggeeft).
  async function fetchForDiensten(dienstIds) {
    if (!dienstIds || !dienstIds.length) return [];
    try {
      var all = [];
      var CH = 200; // PostgREST .in() niet te lang maken
      for (var i = 0; i < dienstIds.length; i += CH) {
        var chunk = dienstIds.slice(i, i + CH);
        var r = await supa
          .from("dienst_uitnodigingen")
          .select("id, dienst_id, medewerker_id, status, uitgenodigd_door, notitie, created_at, updated_at")
          .in("dienst_id", chunk);
        if (r.error) throw r.error;
        all = all.concat(r.data || []);
      }
      dienstIds.forEach(function (id) { cacheByDienst[id] = []; });
      all.forEach(function (row) {
        (cacheByDienst[row.dienst_id] = cacheByDienst[row.dienst_id] || []).push(row);
      });
      return all;
    } catch (err) {
      reportSilent("fetchForDiensten", err);
      return [];
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

  // Eigen uitnodigingen van een medewerker (ZZP self-service "Mijn uitnodigingen").
  async function fetchVoorMedewerker(mwId, statussen) {
    if (!mwId) return [];
    try {
      var q = supa
        .from("dienst_uitnodigingen")
        .select("id, dienst_id, medewerker_id, status, uitgenodigd_door, notitie, created_at, updated_at")
        .eq("medewerker_id", mwId)
        .order("created_at", { ascending: false });
      if (statussen && statussen.length) q = q.in("status", statussen);
      var r = await q;
      if (r.error) throw r.error;
      return r.data || [];
    } catch (err) {
      reportSilent("fetchVoorMedewerker", err);
      return [];
    }
  }

  // Planner/HR nodigt een ZZP'er uit (SECURITY DEFINER RPC: meldt de ZZP'er ook in-app).
  async function stuur(dienstId, medewerkerId, notitie) {
    var r = await supa.rpc("dienst_uitnodiging_sturen", {
      p_dienst_id: dienstId, p_medewerker_id: medewerkerId, p_notitie: notitie || null,
    });
    if (r.error) throw r.error;
    if (dienstId) await fetchForDienst(dienstId);
    return r.data;
  }

  // ZZP'er accepteert ('toegewezen') of weigert ('geweigerd') een eigen uitnodiging.
  async function antwoord(dienstId, keuze) {
    var r = await supa.rpc("dienst_uitnodiging_antwoord", { p_dienst_id: dienstId, p_antwoord: keuze });
    if (r.error) throw r.error;
    return r.data;
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
    fetchForDiensten: fetchForDiensten,
    getForDienstSync: getForDienstSync,
    fetchVoorMedewerker: fetchVoorMedewerker,
    stuur: stuur,
    antwoord: antwoord,
    add: add,
    updateStatus: updateStatus,
    remove: remove,
  };
})(window);
