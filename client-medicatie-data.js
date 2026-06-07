/* global window, localStorage */
/**
 * Client medicatie + aftekenlijst — Supabase data-laag met localStorage als
 * read-cache (zelfde patroon als client-rapportages-data.js).
 *
 * Twee entiteiten:
 *  - Medicatie-definities (tabel `client_medicatie`): wat een cliënt gebruikt,
 *    op welke dagdelen (ochtend/middag/avond) er afgetekend moet worden.
 *  - Aftekeningen (tabel `client_medicatie_aftekening`): per dag/dagdeel of de
 *    medicatie gegeven is. Een gemist dagdeel wordt server-side automatisch een
 *    incident (cron `medicatie_dagdeel_run`).
 *
 * De definities worden in `_mem` gecachet (bron-van-waarheid binnen de sessie,
 * quota-proof). Aftekeningen worden per cliënt/datum on-demand uit Supabase
 * gehaald (veranderen per dag — niet zinvol om volledig te cachen). Aftekenen
 * loopt via de SECURITY DEFINER RPC `medicatie_afteken` zodat ook de werkvloer
 * (zonder directe write-policy) kan aftekenen.
 *
 * Gebruik:
 *   await window.clientMedicatieDB.ready;
 *   var meds = window.clientMedicatieDB.getForClientSync("cl_322");
 *   await window.clientMedicatieDB.add({ clientId:"cl_322", naam:"Ritalin",
 *     dosering:"10mg", dagdelen:["ochtend","middag"], aftekenen:true });
 *   var afts = await window.clientMedicatieDB.fetchAftekeningen("cl_322", "2026-06-07");
 *   await window.clientMedicatieDB.afteken(medId, "2026-06-07", "ochtend", "gegeven");
 *   window.addEventListener("besa:client-medicatie-updated", rerender);
 *   window.addEventListener("besa:client-medicatie-aftekening-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "client_medicatie";
  var AFT_TABLE = "client_medicatie_aftekening";
  var CACHE_KEY = "client_medicatie_v1";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Constanten voor de UI.
  var DAGDELEN = [
    { value: "ochtend", label: "Ochtend" },
    { value: "middag", label: "Middag" },
    { value: "avond", label: "Avond" },
  ];
  var WEEKDAGEN = [
    { value: 1, label: "Ma" },
    { value: 2, label: "Di" },
    { value: 3, label: "Wo" },
    { value: 4, label: "Do" },
    { value: 5, label: "Vr" },
    { value: 6, label: "Za" },
    { value: 7, label: "Zo" },
  ];

  function isoNow() { return new Date().toISOString(); }

  // In-memory cache = canonieke bron na bootstrap (quota-proof, zoals de andere
  // data-lagen). localStorage is enkel een snelle-boot-kopie.
  var _mem = null;

  function readCache() {
    if (_mem != null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) { _mem = []; return _mem; }
      var p = JSON.parse(raw);
      _mem = Array.isArray(p) ? p : [];
      return _mem;
    } catch (e) { _mem = []; return _mem; }
  }
  function writeCache(items) {
    var safe = Array.isArray(items) ? items : [];
    _mem = safe;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(safe)); } catch (e) { /* quota — _mem blijft canoniek */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:client-medicatie-updated", {
        detail: { source: source || "client-medicatie-data" },
      }));
    } catch (e) { /* */ }
  }
  function dispatchAftUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:client-medicatie-aftekening-updated", {
        detail: { source: source || "client-medicatie-data" },
      }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    try { console.error("[clientMedicatieDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Medicatie — " + action, err);
  }

  function toStrArray(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return String(x); }).filter(Boolean);
  }
  function toIntArray(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    for (var i = 0; i < v.length; i += 1) {
      var n = parseInt(v[i], 10);
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      clientId: row.client_id || "",
      naam: row.naam || "",
      dosering: row.dosering || "",
      vorm: row.vorm || "",
      instructie: row.instructie || "",
      dagdelen: toStrArray(row.dagdelen),
      weekdagen: toIntArray(row.weekdagen),
      aftekenen: row.aftekenen !== false,
      startdatum: row.startdatum || null,
      einddatum: row.einddatum || null,
      actief: row.actief !== false,
      notitie: row.notitie || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      client_id: String(safe.clientId || ""),
      naam: String(safe.naam || "").trim(),
      dosering: safe.dosering ? String(safe.dosering) : null,
      vorm: safe.vorm ? String(safe.vorm) : null,
      instructie: safe.instructie ? String(safe.instructie) : null,
      dagdelen: toStrArray(safe.dagdelen).filter(function (d) {
        return d === "ochtend" || d === "middag" || d === "avond";
      }),
      weekdagen: (function () {
        var w = toIntArray(safe.weekdagen).filter(function (n) { return n >= 1 && n <= 7; });
        return w.length ? w : [1, 2, 3, 4, 5, 6, 7];
      })(),
      aftekenen: safe.aftekenen !== false,
      startdatum: safe.startdatum || null,
      einddatum: safe.einddatum || null,
      actief: safe.actief !== false,
      notitie: safe.notitie ? String(safe.notitie) : null,
      archived: !!safe.archived,
    };
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    delete p.client_id; // immutable
    return p;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("naam", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("bootstrap fetchAll", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(items);
    dispatchUpdated("refresh");
    return items;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.clientId) throw new Error("clientId verplicht");
    if (!rec.naam || !String(rec.naam).trim()) throw new Error("naam verplicht");
    var payload = objToInsertPayload(rec);
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache().slice();
    cache.push(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToUpdatePayload(merged);
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache().slice();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getForClientSync(clientId) {
    if (!clientId) return [];
    var s = String(clientId);
    return readCache().filter(function (r) { return r && String(r.clientId) === s; });
  }

  // ---- Aftekeningen (on-demand uit Supabase) --------------------------------

  function aftRowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medicatieId: row.medicatie_id,
      clientId: row.client_id || "",
      datum: row.datum || null,
      dagdeel: row.dagdeel || "",
      status: row.status || "gegeven",
      medewerkerId: row.medewerker_id || null,
      afgetekendDoor: row.afgetekend_door || "",
      afgetekendOp: row.afgetekend_op || null,
      reden: row.reden || "",
      notitie: row.notitie || "",
      incidentId: row.incident_id || null,
    };
  }

  /**
   * Aftekeningen van een cliënt voor één datum (of een [van,tot] bereik, beide
   * "yyyy-mm-dd"; tot is inclusief). Wordt direct uit Supabase gehaald.
   */
  async function fetchAftekeningen(clientId, vanDatum, totDatum) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!clientId) return [];
    var q = global.besaSupabase.from(AFT_TABLE).select("*").eq("client_id", String(clientId));
    if (vanDatum) q = q.gte("datum", vanDatum);
    if (totDatum) q = q.lte("datum", totDatum);
    else if (vanDatum) q = q.lte("datum", vanDatum);
    var res = await q.order("datum", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(aftRowToObj).filter(Boolean);
  }

  /**
   * Tekent een medicatiemoment af via de RPC. status = 'gegeven' | 'niet_gegeven'.
   * De medewerker wordt server-side uit auth.uid() bepaald.
   */
  async function afteken(medicatieId, datum, dagdeel, status, reden, notitie) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!medicatieId) throw new Error("medicatieId verplicht");
    if (!datum) throw new Error("datum verplicht");
    if (["ochtend", "middag", "avond"].indexOf(dagdeel) < 0) throw new Error("Ongeldig dagdeel");
    var res = await global.besaSupabase.rpc("medicatie_afteken", {
      p_medicatie_id: medicatieId,
      p_datum: datum,
      p_dagdeel: dagdeel,
      p_status: status || "gegeven",
      p_reden: reden || null,
      p_notitie: notitie || null,
    });
    if (res.error) throw res.error;
    dispatchAftUpdated("afteken");
    return res.data;
  }

  global.clientMedicatieDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForClientSync: getForClientSync,
    fetchAftekeningen: fetchAftekeningen,
    afteken: afteken,
    DAGDELEN: DAGDELEN,
    WEEKDAGEN: WEEKDAGEN,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
