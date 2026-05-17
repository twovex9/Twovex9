/* global window, localStorage */
/**
 * taken-data.js — Supabase data-laag voor BS2-port "Taken".
 *
 * Tabel `public.taken` (id text PK, FK toegewezen_aan_id naar medewerkers.uuid).
 * Source-of-truth = Supabase. Cache in localStorage["taken_v1"].
 *
 * Public API:
 *  - takenDB.ready (Promise — wacht op bootstrap)
 *  - takenDB.refresh() → Promise<Array>
 *  - takenDB.getAllSync() → Array (gesorteerd op deadline asc, daarna prioriteit desc, naam)
 *  - takenDB.getByIdSync(id) → Object|null
 *  - takenDB.add({ naam, beschrijving, toegewezenAanId, status, prioriteit, deadline }) → Promise<doc>
 *  - takenDB.update(id, partial) → Promise<doc>
 *  - takenDB.setStatus(id, status) → Promise<doc>
 *  - takenDB.archive(id) / restore(id) → Promise<doc>
 *  - takenDB.delete(id) → Promise<true>
 *  - takenDB.getForMedewerkerSync(medewerkerId) → Array
 *
 * Events: `besa:taken-updated` (window) na elke mutatie/bootstrap.
 */
(function (global) {
  "use strict";

  var TABLE = "taken";
  var CACHE_KEY = "taken_v2";

  // 1-op-1 BS2 (/api/tasks) — verbatim status/priority-waarden.
  var STATUS_VALUES = ["--", "In behandeling", "Voltooid"];
  var PRIORITEIT_VALUES = ["Low", "Medium", "High"];
  var PRIORITEIT_RANK = { High: 0, Medium: 1, Low: 2 };

  function stripHtml(s) {
    return String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ").trim();
  }

  function isoNow() { return new Date().toISOString(); }

  function generateId() {
    return "t_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  function rowToObj(row) {
    if (!row) return null;
    var asg = row.assignee && typeof row.assignee === "object" ? row.assignee : null;
    var crt = row.creator && typeof row.creator === "object" ? row.creator : null;
    var html = row.description != null ? row.description : (row.beschrijving || "");
    return {
      id: row.id,
      bs2Id: row.bs2_id || null,
      naam: row.title || row.naam || "",
      beschrijving: stripHtml(html),
      beschrijvingHtml: html || "",
      toegewezenAanId: (asg && asg.id) || row.toegewezen_aan_id || null,
      toegewezenAanNaam: (asg && asg.name) || "",
      aangemaaktDoorId: (crt && crt.id) || row.aangemaakt_door_id || null,
      aangemaaktDoorNaam: (crt && crt.name) || "",
      collaborators: Array.isArray(row.collaborators) ? row.collaborators : [],
      incident: row.incident || null,
      isPrivate: !!row.is_private,
      status: row.status_bs2 || row.status || "--",
      prioriteit: row.priority_bs2 || row.prioriteit || "Low",
      deadline: row.due_date || row.deadline || null,
      voltooidOp: row.voltooid_op || null,
      archived: !!row.archived,
      aanmaakdatum: row.bs2_created_at || row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.bs2_updated_at || row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var status = STATUS_VALUES.indexOf(safe.status) >= 0 ? safe.status : "--";
    var prioriteit = PRIORITEIT_VALUES.indexOf(safe.prioriteit) >= 0 ? safe.prioriteit : "Low";
    var title = String(safe.naam || "").trim();
    var descr = String(safe.beschrijving || "");
    var asg = (safe.toegewezenAanId)
      ? { id: safe.toegewezenAanId, name: safe.toegewezenAanNaam || "" }
      : (safe.assignee || null);
    return {
      id: safe.id,
      title: title,
      naam: title,
      description: descr,
      beschrijving: descr,
      status_bs2: status,
      priority_bs2: prioriteit,
      due_date: safe.deadline || null,
      deadline: safe.deadline || null,
      is_private: !!safe.isPrivate,
      assignee: asg,
      archived: !!safe.archived,
    };
  }

  // DATA-SLIM (bindende les): in-memory bron-van-waarheid zodat de pagina
  // ook werkt bij volle localStorage-quota; localStorage = best-effort cache.
  var _mem = null;
  function readCache() {
    if (_mem !== null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* quota vol — _mem is de bron */ }
  }

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      // 1. Niet-voltooid vóór voltooid
      var aDone = a.status === "Voltooid" ? 1 : 0;
      var bDone = b.status === "Voltooid" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      // 2. Op deadline (null laatst)
      var ad = a.deadline ? String(a.deadline) : "9999-12-31";
      var bd = b.deadline ? String(b.deadline) : "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      // 3. Op prioriteit (hoog eerst)
      var ap = PRIORITEIT_RANK[a.prioriteit] != null ? PRIORITEIT_RANK[a.prioriteit] : 3;
      var bp = PRIORITEIT_RANK[b.prioriteit] != null ? PRIORITEIT_RANK[b.prioriteit] : 3;
      if (ap !== bp) return ap - bp;
      // 4. Naam alphabetisch
      return String(a.naam || "").localeCompare(String(b.naam || ""));
    });
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:taken-updated", { detail: { source: source || "data" } }));
    } catch (e) { /* */ }
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*");
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
        writeCache(sortItems(items));
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[takenDB] Bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Taken — bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(sortItems(items));
    dispatchUpdated("refresh");
    return items;
  }

  async function getCurrentUserId() {
    try {
      if (!global.besaAuth) return null;
      var user = await global.besaAuth.getCurrentUser();
      return user ? user.id : null;
    } catch (e) { return null; }
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {});
    if (!doc.id) doc.id = generateId();
    if (!doc.aangemaaktDoorId) doc.aangemaaktDoorId = await getCurrentUserId();
    var payload = objToPayload(doc);
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(sortItems(readCache().concat([obj])));
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToPayload(merged);
    delete payload.id;
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(sortItems(cache));
    dispatchUpdated("update");
    return obj;
  }

  async function setStatus(id, status) { return update(id, { status: status }); }
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

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return readCache().filter(function (r) { return r && String(r.toegewezenAanId) === s; });
  }

  global.takenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    setStatus: setStatus,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
    STATUS_VALUES: STATUS_VALUES,
    PRIORITEIT_VALUES: PRIORITEIT_VALUES,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
