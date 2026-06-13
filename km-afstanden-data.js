/* global window, localStorage */
/**
 * Woon-werk afstandsmatrix — Supabase data-laag (medewerker x locatie).
 *
 * Tabel: public.medewerker_locatie_afstanden
 *   km_enkel = enkele reis woonadres -> werklocatie in km.
 *   bron     = 'auto' (berekend via geo-distance.js: PDOK + OSRM)
 *            | 'handmatig' (HR-correctie). Een handmatige waarde wordt NOOIT
 *              door een auto-herberekening overschreven.
 *
 * DATA-SLIM + _mem (bindende les): in-memory bron-van-waarheid zodat de pagina
 * ook bij een volle localStorage-quota blijft werken; localStorage = read-cache.
 *
 * Public API (window.kmAfstandenDB):
 *   .ready                         -> bootstrap-promise
 *   .refresh()                     -> herlaad uit Supabase
 *   .getAllSync()                  -> alle cellen
 *   .getForMedewerkerSync(mwId)    -> cellen van die medewerker
 *   .getCell(mwId, locId)          -> een cel of null
 *   .upsert({medewerkerId, locatieId, kmEnkel, bron}) -> insert/update
 *   .remove(mwId, locId)           -> cel verwijderen
 *
 * Event: "ff:km-afstanden-updated" op window (na elke mutatie + bootstrap).
 */
(function (global) {
  "use strict";

  var TABLE = "medewerker_locatie_afstanden";
  var CACHE = "km_afstanden_v1";

  function reportSilent(action, err) {
    try { console.error("[kmAfstandenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.ffReportSyncFailure) {
      global.ffReportSyncFailure("Woon-werk afstanden — " + action, err);
    }
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* quota vol — _mem is de bron */ }
  }
  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:km-afstanden-updated", {
        detail: { source: source || "km-afstanden-data" },
      }));
    } catch (e) { /* */ }
  }

  // In-memory bron-van-waarheid (sessie); localStorage best-effort.
  var _mem = null;
  function setList(items) { _mem = Array.isArray(items) ? items : []; writeCache(_mem); }
  function list() { return (_mem !== null) ? _mem : readCache(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || null,
      locatieId: row.locatie_id || null,
      kmEnkel: row.km_enkel == null ? null : Number(row.km_enkel),
      bron: row.bron || "auto",
      laatstBerekend: row.laatst_berekend || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("id,medewerker_id,locatie_id,km_enkel,bron,laatst_berekend,aanmaakdatum,laatst_gewijzigd");
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readCache().length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        // Cold direct-load: wacht op auth/Supabase-sessie vóór de eerste query
        // (anders levert anonieme RLS 0 rijen — lesson #13).
        if (global.ffSupabaseReady && typeof global.ffSupabaseReady.then === "function") {
          try { await global.ffSupabaseReady; } catch (e) { /* */ }
        }
        var rows = await fetchAll();
        setList(rows);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("Bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var rows = await fetchAll();
    setList(rows);
    dispatchUpdated("refresh");
    return rows;
  }

  function getAllSync() { return list().slice(); }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return list().filter(function (r) { return r && String(r.medewerkerId) === s; });
  }

  function getCell(mwId, locId) {
    if (!mwId || !locId) return null;
    var a = String(mwId), b = String(locId);
    return list().find(function (r) {
      return r && String(r.medewerkerId) === a && String(r.locatieId) === b;
    }) || null;
  }

  /**
   * Insert of update van één cel (onConflict op medewerker_id + locatie_id).
   * bron='auto' respecteert een bestaande 'handmatig'-waarde: die wordt NIET
   * overschreven (HR-correctie blijft staan bij her-berekenen).
   */
  async function upsert(p) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!p || !p.medewerkerId || !p.locatieId) throw new Error("medewerkerId + locatieId vereist");
    var bron = p.bron === "handmatig" ? "handmatig" : "auto";
    if (bron === "auto") {
      var bestaand = getCell(p.medewerkerId, p.locatieId);
      if (bestaand && bestaand.bron === "handmatig") return bestaand; // niet overschrijven
    }
    var nowIso = new Date().toISOString();
    var row = {
      medewerker_id: p.medewerkerId,
      locatie_id: p.locatieId,
      km_enkel: (p.kmEnkel == null || p.kmEnkel === "") ? null : Number(p.kmEnkel),
      bron: bron,
      laatst_berekend: nowIso,
      laatst_gewijzigd: nowIso,
    };
    var res = await global.ffSupabase
      .from(TABLE)
      .upsert(row, { onConflict: "medewerker_id,locatie_id" })
      .select().single();
    if (res.error) throw res.error;
    var cell = rowToObj(res.data);
    var arr = list().filter(function (r) {
      return !(r && String(r.medewerkerId) === String(p.medewerkerId)
        && String(r.locatieId) === String(p.locatieId));
    });
    arr.push(cell);
    setList(arr);
    dispatchUpdated("upsert");
    return cell;
  }

  async function remove(mwId, locId) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!mwId || !locId) throw new Error("medewerkerId + locatieId vereist");
    var res = await global.ffSupabase
      .from(TABLE).delete()
      .eq("medewerker_id", mwId).eq("locatie_id", locId);
    if (res.error) throw res.error;
    setList(list().filter(function (r) {
      return !(r && String(r.medewerkerId) === String(mwId) && String(r.locatieId) === String(locId));
    }));
    dispatchUpdated("remove");
  }

  global.kmAfstandenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getForMedewerkerSync: getForMedewerkerSync,
    getCell: getCell,
    upsert: upsert,
    remove: remove,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
