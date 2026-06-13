/* global window, localStorage */
/**
 * Kilometer-afwijkingen — Supabase data-laag.
 *
 * Log van wijzigingen/verwijderingen op AUTOMATISCH berekende ritten. Een
 * DB-trigger (km_afwijking_notify) maakt bij elke insert een HR-melding aan.
 * Tabel: public.kilometer_afwijkingen.
 *
 * DATA-SLIM + _mem: in-memory bron-van-waarheid; localStorage = read-cache.
 *
 * Public API (window.kmAfwijkingenDB):
 *   .ready / .refresh()
 *   .getAllSync()                  -> alle afwijkingen (nieuwste eerst)
 *   .getOpenSync()                 -> alleen status 'open'
 *   .add({recordId, declaratieId, medewerkerId, datum, locatie, actie,
 *         kmBerekend, kmNieuw, reden})           -> insert (triggert HR-melding)
 *   .markAfgehandeld(id, behandeldDoor)          -> status 'afgehandeld'
 * Event: "ff:km-afwijkingen-updated" op window.
 */
(function (global) {
  "use strict";

  var TABLE = "kilometer_afwijkingen";
  var CACHE = "km_afwijkingen_v1";

  function reportSilent(action, err) {
    try { console.error("[kmAfwijkingenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.ffReportSyncFailure) {
      global.ffReportSyncFailure("Kilometer-afwijkingen — " + action, err);
    }
  }

  function readCache() {
    try { var raw = localStorage.getItem(CACHE); var p = raw ? JSON.parse(raw) : []; return Array.isArray(p) ? p : []; }
    catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }
  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("ff:km-afwijkingen-updated", { detail: { source: source || "km-afwijkingen-data" } })); }
    catch (e) { /* */ }
  }

  var _mem = null;
  function setList(items) { _mem = Array.isArray(items) ? items : []; writeCache(_mem); }
  function list() { return (_mem !== null) ? _mem : readCache(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      recordId: row.record_id || null,
      declaratieId: row.declaratie_id || null,
      medewerkerId: row.medewerker_id || null,
      datum: row.datum || null,
      locatie: row.locatie || "",
      actie: row.actie || "gewijzigd",
      kmBerekend: row.km_berekend == null ? null : Number(row.km_berekend),
      kmNieuw: row.km_nieuw == null ? null : Number(row.km_nieuw),
      reden: row.reden || "",
      status: row.status || "open",
      behandeldDoor: row.behandeld_door || null,
      behandeldOp: row.behandeld_op || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function sortNewest(arr) {
    return arr.sort(function (a, b) {
      return String(b.aanmaakdatum || "").localeCompare(String(a.aanmaakdatum || ""));
    });
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("id,record_id,declaratie_id,medewerker_id,datum,locatie,actie,km_berekend,km_nieuw,reden,status,behandeld_door,behandeld_op,aanmaakdatum,laatst_gewijzigd")
      .order("aanmaakdatum", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readCache().length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        if (global.ffSupabaseReady && typeof global.ffSupabaseReady.then === "function") {
          try { await global.ffSupabaseReady; } catch (e) { /* */ }
        }
        setList(await fetchAll());
        dispatchUpdated("bootstrap");
      } catch (err) { reportSilent("Bootstrap", err); }
    })();
    return readyPromise;
  }

  async function refresh() { setList(await fetchAll()); dispatchUpdated("refresh"); return list(); }

  function getAllSync() { return sortNewest(list().slice()); }
  function getOpenSync() { return sortNewest(list().filter(function (r) { return r && r.status === "open"; })); }

  async function add(p) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!p || !p.medewerkerId) throw new Error("medewerkerId vereist");
    var row = {
      record_id: p.recordId || null,
      declaratie_id: p.declaratieId || null,
      medewerker_id: p.medewerkerId,
      datum: p.datum || null,
      locatie: p.locatie || "",
      actie: p.actie === "verwijderd" ? "verwijderd" : "gewijzigd",
      km_berekend: (p.kmBerekend == null || p.kmBerekend === "") ? null : Number(p.kmBerekend),
      km_nieuw: (p.kmNieuw == null || p.kmNieuw === "") ? null : Number(p.kmNieuw),
      reden: p.reden || "",
      status: "open",
    };
    var res = await global.ffSupabase.from(TABLE).insert(row).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var arr = list(); arr.push(obj); setList(arr);
    dispatchUpdated("add");
    return obj;
  }

  async function markAfgehandeld(id, behandeldDoor) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (id == null) throw new Error("id vereist");
    var upd = {
      status: "afgehandeld",
      behandeld_door: behandeldDoor || null,
      behandeld_op: new Date().toISOString(),
      laatst_gewijzigd: new Date().toISOString(),
    };
    var res = await global.ffSupabase.from(TABLE).update(upd).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var arr = list();
    for (var i = 0; i < arr.length; i++) { if (arr[i] && String(arr[i].id) === String(id)) { arr[i] = obj; break; } }
    setList(arr);
    dispatchUpdated("markAfgehandeld");
    return obj;
  }

  global.kmAfwijkingenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getOpenSync: getOpenSync,
    add: add,
    markAfgehandeld: markAfgehandeld,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
