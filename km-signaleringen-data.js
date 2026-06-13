/* global window */
/**
 * km-signaleringen-data.js — data-laag voor de AI-signaleringen
 * (mobiliteitsmodule). Tabel public.km_signaleringen + RPC
 * km_genereer_signaleringen() (deterministische heuristiek, geen LLM).
 */
(function (global) {
  "use strict";
  var T = "km_signaleringen";
  var CACHE = "ff_km_signaleringen_v1";

  function reportSilent(action, err) {
    console.error("[kmSignaleringenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Signaleringen — " + action, err);
  }
  function readCache() {
    try { var r = JSON.parse(global.localStorage.getItem(CACHE) || "[]"); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }
  function writeCache(items) { try { global.localStorage.setItem(CACHE, JSON.stringify(items || [])); } catch (e) {} }
  var _items = null;
  function setItems(items) { _items = Array.isArray(items) ? items : []; writeCache(_items); }
  function list() { return _items !== null ? _items : readCache(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      signaalType: row.signaal_type,
      ernst: row.ernst || "midden",
      medewerkerId: row.medewerker_id || null,
      medewerkerNaam: row.medewerker_naam || "",
      clientId: row.client_id || null,
      clientNaam: row.client_naam || "",
      locatieId: row.locatie_id || null,
      locatieNaam: row.locatie_naam || "",
      recordId: row.record_id || null,
      declaratieId: row.declaratie_id || null,
      jaar: row.jaar, maand: row.maand,
      titel: row.titel || "",
      omschrijving: row.omschrijving || "",
      waarde: row.waarde == null ? null : Number(row.waarde),
      drempel: row.drempel == null ? null : Number(row.drempel),
      status: row.status || "open",
      behandeldDoor: row.behandeld_door || null,
      behandeldOp: row.behandeld_op || null,
      aanmaakdatum: row.aanmaakdatum,
    };
  }
  function dispatchUpdated(reason) {
    try { global.dispatchEvent(new CustomEvent("ff:km-signaleringen-updated", { detail: { reason: reason } })); } catch (e) {}
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(T)
      .select("id,signaal_type,ernst,medewerker_id,medewerker_naam,client_id,client_naam,locatie_id,locatie_naam,record_id,declaratie_id,jaar,maand,titel,omschrijving,waarde,drempel,status,behandeld_door,behandeld_op,aanmaakdatum")
      .order("aanmaakdatum", { ascending: false })
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

  // Roep de server-side heuristiek-engine aan en herlaad daarna de lijst.
  async function genereer() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.rpc("km_genereer_signaleringen", { p_dry_run: false });
    if (res.error) throw res.error;
    await refresh();
    return (res.data && res.data[0]) || res.data || null;
  }

  async function setStatus(id, status, profielId) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (id == null) throw new Error("id vereist");
    var upd = { status: status, laatst_gewijzigd: new Date().toISOString() };
    if (status === "open") { upd.behandeld_door = null; upd.behandeld_op = null; }
    else { upd.behandeld_door = profielId || null; upd.behandeld_op = new Date().toISOString(); }
    var res = await global.ffSupabase.from(T).update(upd).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var l = list();
    for (var i = 0; i < l.length; i++) { if (l[i] && String(l[i].id) === String(id)) { l[i] = obj; break; } }
    setItems(l);
    dispatchUpdated("setStatus");
    return obj;
  }

  function getAllSync() { return list(); }
  function getOpenSync() { return list().filter(function (r) { return r && r.status === "open"; }); }

  global.kmSignaleringenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh, fetchAll: fetchAll, genereer: genereer,
    setStatus: setStatus, getAllSync: getAllSync, getOpenSync: getOpenSync,
  };
  bootstrap();
})(window);
