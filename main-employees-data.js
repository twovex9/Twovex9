/* global window, localStorage */
/**
 * main-employees-data.js — Supabase data-laag voor de TOP-BAR "Medewerkers"
 * (BS2 /main-employee/employees → /api/employees-basic).
 *
 * APART systeem, los van HR-medewerkers (`medewerkers`/`medewerkersDB`).
 * Tabel `public.main_employees` (id uuid PK = BS2 employee-id).
 * Source-of-truth = Supabase. Cache in localStorage["main_employees_v1"].
 *
 * Public API (window.mainEmployeesDB):
 *  - ready (Promise — wacht op bootstrap)
 *  - refresh() → Promise<Array>
 *  - getAllSync() → Array (gesorteerd op first_name asc — BS2-default)
 *  - getByIdSync(id) → Object|null
 *  - getRawBs2(id) → Promise<Object|null>  (on-demand volledige BS2-raw)
 *  - add(obj) / update(id, partial) → Promise<doc>
 *  - archive(id) / restore(id) → Promise<doc>
 *  - registerSickness(id, firstDayIso) / endSickness(id) → Promise<doc>
 *  - delete(id) → Promise<true>
 *
 * Events: `ff:main-employees-updated` (window) na elke mutatie/bootstrap.
 * DATA-SLIM (bindende les): zware data.bs2_scrape NOOIT in de cache —
 * on-demand via getRawBs2().
 */
(function (global) {
  "use strict";

  var TABLE = "main_employees";
  var CACHE_KEY = "main_employees_v1";
  // Slank kolom-stel (zonder de zware `data`-jsonb) voor lijst + detail.
  var SLIM_COLS = "id,first_name,last_name,is_plannable,email,phone," +
    "employee_number,employment_end_date,date_of_birth,notes,employment_type," +
    "avatar,is_sick,sickness_start_date,archived,aanmaakdatum,laatst_gewijzigd";

  function isoNow() { return new Date().toISOString(); }

  function genId() {
    try {
      if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    } catch (e) { /* */ }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function rowToObj(row) {
    if (!row) return null;
    var fn = row.first_name == null ? "" : String(row.first_name);
    var ln = row.last_name == null ? "" : String(row.last_name);
    return {
      id: row.id,
      firstName: fn,
      lastName: ln,
      fullName: (fn + " " + ln).trim(),
      isPlannable: !!row.is_plannable,
      email: row.email || "",
      phone: row.phone || "",
      employeeNumber: row.employee_number == null ? null : row.employee_number,
      employmentEndDate: row.employment_end_date || null,
      dateOfBirth: row.date_of_birth || null,
      notes: row.notes || "",
      employmentType: row.employment_type || "", // verbatim BS2 (hiring/permanent/intern)
      avatar: row.avatar || null,
      isSick: !!row.is_sick,
      sicknessStartDate: row.sickness_start_date || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var s = o || {};
    var p = {};
    if (s.firstName !== undefined) p.first_name = String(s.firstName || "");
    if (s.lastName !== undefined) p.last_name = String(s.lastName || "");
    if (s.isPlannable !== undefined) p.is_plannable = !!s.isPlannable;
    if (s.email !== undefined) p.email = s.email || null;
    if (s.phone !== undefined) p.phone = s.phone || null;
    if (s.employeeNumber !== undefined) p.employee_number = (s.employeeNumber === "" || s.employeeNumber == null) ? null : +s.employeeNumber;
    if (s.employmentEndDate !== undefined) p.employment_end_date = s.employmentEndDate || null;
    if (s.dateOfBirth !== undefined) p.date_of_birth = s.dateOfBirth || null;
    if (s.notes !== undefined) p.notes = s.notes || null;
    if (s.employmentType !== undefined) p.employment_type = s.employmentType || null;
    if (s.avatar !== undefined) p.avatar = s.avatar || null;
    if (s.isSick !== undefined) p.is_sick = !!s.isSick;
    if (s.sicknessStartDate !== undefined) p.sickness_start_date = s.sicknessStartDate || null;
    if (s.archived !== undefined) p.archived = !!s.archived;
    return p;
  }

  // DATA-SLIM: in-memory bron-van-waarheid; localStorage = best-effort cache.
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
      var af = String(a.firstName || "").toLowerCase();
      var bf = String(b.firstName || "").toLowerCase();
      if (af !== bf) return af < bf ? -1 : 1;
      var al = String(a.lastName || "").toLowerCase();
      var bl = String(b.lastName || "").toLowerCase();
      if (al !== bl) return al < bl ? -1 : 1;
      return (a.employeeNumber || 0) - (b.employeeNumber || 0);
    });
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:main-employees-updated", { detail: { source: source || "data" } }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[mainEmployeesDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Medewerkers — " + action, err);
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).select(SLIM_COLS);
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
        reportSilent("bootstrap", err);
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

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  // On-demand: volledige BS2-raw (data.bs2_scrape) — bewust NIET in de cache.
  async function getRawBs2(id) {
    if (!global.ffSupabase || id == null) return null;
    try {
      var res = await global.ffSupabase.from(TABLE).select("data").eq("id", id).single();
      if (res.error) throw res.error;
      var d = res.data && res.data.data;
      return (d && (d.bs2_scrape || d)) || null;
    } catch (err) {
      reportSilent("getRawBs2", err);
      return null;
    }
  }

  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {});
    var payload = objToPayload(doc);
    payload.id = doc.id || genId();
    payload.archived = !!doc.archived;
    var res = await global.ffSupabase.from(TABLE).insert(payload).select(SLIM_COLS).single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(sortItems(readCache().concat([obj])));
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var payload = objToPayload(partial || {});
    delete payload.id;
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select(SLIM_COLS).single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(sortItems(cache));
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function registerSickness(id, firstDayIso) {
    return update(id, { isSick: true, sicknessStartDate: firstDayIso || isoNow() });
  }
  async function endSickness(id) {
    return update(id, { isSick: false, sicknessStartDate: null });
  }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(readCache().filter(function (r) { return r && String(r.id) !== String(id); }));
    dispatchUpdated("remove");
    return true;
  }

  global.mainEmployeesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getRawBs2: getRawBs2,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    registerSickness: registerSickness,
    endSickness: endSickness,
    delete: remove,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
