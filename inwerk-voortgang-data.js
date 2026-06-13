/* global window */
/**
 * Inwerk-voortgang — Supabase data-laag (read-on-demand per medewerker).
 *
 * Houdt per medewerker per inwerk-item de "gelezen + akkoord"-status bij. De
 * SCHRIJF-kant verloopt via de edge function `onboarding-inwerken` (de nieuwe
 * medewerker is niet ingelogd; token-gevalideerd, met IP-audit). Deze data-laag
 * is voor de HR-kant (Onboarding-tab) om de voortgang te TONEN.
 *
 * Bron van waarheid: Supabase tabel `inwerk_voortgang`.
 * Cache: in-memory per medewerker (`_byMw`) — read-on-demand, geen localStorage.
 * Event: `ff:inwerk-voortgang-updated`.
 *
 * Gebruik:
 *   await window.inwerkVoortgangDB.listForMedewerker(empId);
 *   var rows = window.inwerkVoortgangDB.getForMedewerkerSync(empId); // [{inwerkItemId, gelezenAkkoord, akkoordOp, ...}]
 */
(function (global) {
  "use strict";

  var TABLE = "inwerk_voortgang";
  var _byMw = {};       // empId -> rows[]
  var _busy = {};       // empId -> bool (re-entrancy-guard)

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:inwerk-voortgang-updated", { detail: { source: source || "inwerk-voortgang-data" } }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || "",
      inwerkItemId: row.inwerk_item_id || "",
      gelezenAkkoord: !!row.gelezen_akkoord,
      akkoordNaam: row.akkoord_naam || "",
      akkoordOp: row.akkoord_op || null,
    };
  }

  async function ensureSupabaseReady() {
    if (global.ffSupabaseReady && typeof global.ffSupabaseReady.then === "function") {
      try { await global.ffSupabaseReady; } catch (e) { /* */ }
    }
  }

  async function listForMedewerker(medewerkerId, force) {
    if (!medewerkerId) return [];
    var key = String(medewerkerId);
    if (_busy[key]) return _byMw[key] || [];
    if (_byMw[key] && !force) return _byMw[key];
    if (!global.ffSupabase) return _byMw[key] || [];
    _busy[key] = true;
    try {
      await ensureSupabaseReady();
      var res = await global.ffSupabase.from(TABLE).select("*").eq("medewerker_id", key);
      if (res.error) throw res.error;
      _byMw[key] = (res.data || []).map(rowToObj).filter(Boolean);
      dispatchUpdated("list");
    } catch (err) {
      // READ-fout: laat cache leeg, geen logout-escalatie.
      console.error("[inwerkVoortgangDB] listForMedewerker mislukt:", err);
      if (!_byMw[key]) _byMw[key] = [];
    } finally {
      _busy[key] = false;
    }
    return _byMw[key];
  }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var key = String(medewerkerId);
    return (_byMw[key] || []).slice();
  }

  // Set van item-ids die akkoord zijn voor deze medewerker.
  function akkoordItemIdsSync(medewerkerId) {
    return getForMedewerkerSync(medewerkerId)
      .filter(function (r) { return r && r.gelezenAkkoord; })
      .map(function (r) { return String(r.inwerkItemId); });
  }

  global.inwerkVoortgangDB = {
    listForMedewerker: listForMedewerker,
    getForMedewerkerSync: getForMedewerkerSync,
    akkoordItemIdsSync: akkoordItemIdsSync,
  };
})(typeof window !== "undefined" ? window : this);
