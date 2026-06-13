/* global window */
/**
 * km-checkin-data.js — data-laag voor GPS web-check-in (mobiliteitsmodule).
 *
 * Tabel public.km_checkins. Eén rij per inklok-moment: datum/tijd/positie +
 * de verwachte werklocatie en de afstand daartoe (status ok | afwijking |
 * geen_locatie). Supabase is bron van waarheid; localStorage = read-cache.
 */
(function (global) {
  "use strict";
  var T = "km_checkins";
  var CACHE = "ff_km_checkins_v1";

  function reportSilent(action, err) {
    console.error("[kmCheckinDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Check-in — " + action, err);
  }
  function readCache() {
    try { var r = JSON.parse(global.localStorage.getItem(CACHE) || "[]"); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }
  function writeCache(items) {
    try { global.localStorage.setItem(CACHE, JSON.stringify(items || [])); } catch (e) { /* quota */ }
  }
  var _items = null;
  function setItems(items) { _items = Array.isArray(items) ? items : []; writeCache(_items); }
  function list() { return _items !== null ? _items : readCache(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || null,
      profielId: row.profiel_id || null,
      medewerkerNaam: row.medewerker_naam || "",
      datum: row.datum || null,
      tijd: row.tijd || null,
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      accuracyM: row.accuracy_m == null ? null : Number(row.accuracy_m),
      locatieId: row.locatie_id || null,
      locatieNaam: row.locatie_naam || "",
      verwachtLat: row.verwacht_lat == null ? null : Number(row.verwacht_lat),
      verwachtLng: row.verwacht_lng == null ? null : Number(row.verwacht_lng),
      afstandTotLocatieM: row.afstand_tot_locatie_m == null ? null : Number(row.afstand_tot_locatie_m),
      status: row.status || "ok",
      bron: row.bron || "web",
      aanmaakdatum: row.aanmaakdatum,
    };
  }

  function dispatchUpdated(reason) {
    try { global.dispatchEvent(new CustomEvent("ff:km-checkins-updated", { detail: { reason: reason } })); } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(T)
      .select("id,medewerker_id,profiel_id,medewerker_naam,datum,tijd,lat,lng,accuracy_m,locatie_id,locatie_naam,verwacht_lat,verwacht_lng,afstand_tot_locatie_m,status,bron,aanmaakdatum")
      .order("tijd", { ascending: false })
      .limit(2000);
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readCache().length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try { setItems(await fetchAll()); dispatchUpdated("bootstrap"); }
      catch (err) { reportSilent("Bootstrap", err); }
    })();
    return readyPromise;
  }

  async function refresh() { setItems(await fetchAll()); dispatchUpdated("refresh"); return list(); }

  async function add(p) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    p = p || {};
    var nowIso = new Date().toISOString();
    var row = {
      medewerker_id: p.medewerkerId || null,
      profiel_id: p.profielId || null,
      medewerker_naam: p.medewerkerNaam || null,
      datum: p.datum || nowIso.slice(0, 10),
      tijd: p.tijd || nowIso,
      lat: p.lat == null ? null : Number(p.lat),
      lng: p.lng == null ? null : Number(p.lng),
      accuracy_m: p.accuracyM == null ? null : Number(p.accuracyM),
      locatie_id: p.locatieId || null,
      locatie_naam: p.locatieNaam || null,
      verwacht_lat: p.verwachtLat == null ? null : Number(p.verwachtLat),
      verwacht_lng: p.verwachtLng == null ? null : Number(p.verwachtLng),
      afstand_tot_locatie_m: p.afstandTotLocatieM == null ? null : Number(p.afstandTotLocatieM),
      status: p.status || "ok",
      bron: p.bron || "web",
      data: p.data || {},
    };
    var res = await global.ffSupabase.from(T).insert(row).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data || row);
    var l = list(); l.unshift(obj); setItems(l);
    dispatchUpdated("add");
    return obj;
  }

  function getAllSync() { return list(); }
  function listForMedewerkerSync(medId) {
    if (!medId) return [];
    var s = String(medId);
    return list().filter(function (r) { return r && String(r.medewerkerId) === s; });
  }

  global.kmCheckinDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh, fetchAll: fetchAll,
    add: add, getAllSync: getAllSync, listForMedewerkerSync: listForMedewerkerSync,
  };
  bootstrap();
})(window);
