/* global window, localStorage */
/**
 * Werkuren-data — Supabase data-laag voor:
 *   - public.werkuren (geregistreerde werkuren per medewerker per dag)
 *   - public.werkuren_vergrendeld (maand-vergrendeling per medewerker)
 *   - public.werkuren_labels (label-keuzes voor de uren-modal)
 *
 * Public API:
 *   werkurenDB
 *     .ready / .refresh / .fetchAll
 *     .getAllSync() / .getByIdSync(id)
 *     .getForMonthSync(year, month)
 *     .getForMedewerkerMonthSync(medewerkerId, year, month)
 *     .add({medewerker_id, datum, starttijd, eindtijd, duur_minuten, client_id, client_label, dienst, label, beschrijving})
 *     .update(id, partial)
 *     .delete(id)
 *
 *   werkurenLabelsDB
 *     .ready / .refresh / .getAllSync()
 *     .add({naam}) / .delete(id)
 *
 *   werkurenVergrendeldDB
 *     .ready / .refresh / .getAllSync()
 *     .isLockedSync(medewerkerId, year, month)
 *     .lock(medewerkerId, year, month)  → vergrendelt
 *     .unlock(medewerkerId, year, month) → ontgrendelt
 *
 * Events: "ff:werkuren-updated" / "ff:werkuren-labels-updated" /
 *         "ff:werkuren-vergrendeld-updated" op window.
 */
(function (global) {
  "use strict";

  function reportSilent(domain, action, err) {
    try { console.error("[" + domain + "] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.ffReportSyncFailure) global.ffReportSyncFailure(domain + " — " + action, err);
  }
  function readCache(key) {
    try { var raw = localStorage.getItem(key); if (!raw) return []; var p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }
  function writeCache(key, items) {
    try { localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }
  function dispatchEvt(name, source) {
    try { global.dispatchEvent(new CustomEvent(name, { detail: { source: source || "werkuren-data" } })); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // werkurenDB
  // ---------------------------------------------------------------------------
  (function () {
    var TABLE = "werkuren";
    var CACHE_KEY = "werkuren_v1";
    // In-memory canonieke cache. localStorage is op deze suite vaak vol
    // (clientenItems ~3,4MB) → writeCache van de ~4000+ werkuren faalt stil.
    // _mem is dan de enige betrouwbare bron (quota-proof). Zie HR-doc-fix #421.
    var _mem = null;

    function generateId() { return "wu_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }

    function rowToObj(row) {
      if (!row) return null;
      return {
        id: row.id,
        medewerker_id: row.medewerker_id,
        datum: row.datum,
        starttijd: row.starttijd,
        eindtijd: row.eindtijd,
        duur_minuten: Number(row.duur_minuten || 0),
        client_id: row.client_id,
        client_label: row.client_label || "",
        dienst: row.dienst || "",
        label: row.label || "",
        begeleidingstype: row.begeleidingstype || "",
        beschrijving: row.beschrijving || "",
        vergrendeld: !!row.vergrendeld,
        aanmaakdatum: row.aanmaakdatum,
        laatstGewijzigd: row.laatst_gewijzigd,
      };
    }
    function objToInsertPayload(o) {
      var safe = o || {};
      var p = {
        medewerker_id: safe.medewerker_id || null,
        datum: safe.datum,
        starttijd: safe.starttijd || null,
        eindtijd: safe.eindtijd || null,
        duur_minuten: Number(safe.duur_minuten || 0),
        client_id: safe.client_id || null,
        client_label: String(safe.client_label || ""),
        dienst: String(safe.dienst || ""),
        label: String(safe.label || ""),
        begeleidingstype: String(safe.begeleidingstype || ""),
        beschrijving: String(safe.beschrijving || ""),
        vergrendeld: !!safe.vergrendeld,
      };
      p.id = safe.id || generateId();
      return p;
    }
    function objToUpdatePayload(o) {
      var safe = o || {};
      var p = {};
      ["medewerker_id", "datum", "starttijd", "eindtijd", "client_id"].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(safe, k)) p[k] = safe[k] || null;
      });
      ["client_label", "dienst", "label", "begeleidingstype", "beschrijving"].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(safe, k)) p[k] = String(safe[k] || "");
      });
      if (Object.prototype.hasOwnProperty.call(safe, "duur_minuten")) p.duur_minuten = Number(safe.duur_minuten || 0);
      if (Object.prototype.hasOwnProperty.call(safe, "vergrendeld")) p.vergrendeld = !!safe.vergrendeld;
      return p;
    }

    async function fetchAll() {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      // PostgREST cap't elke request op max 1000 rijen — pagineer om ALLE
      // werkuren op te halen (4000+), anders missen oudere maanden data.
      var PAGE = 1000, from = 0, all = [];
      for (;;) {
        var res = await global.ffSupabase.from(TABLE).select("*").order("datum", { ascending: false }).range(from, from + PAGE - 1);
        if (res.error) throw res.error;
        var batch = res.data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
        if (from > 100000) break; // veiligheidsstop tegen oneindige lus
      }
      return all.map(rowToObj).filter(Boolean);
    }
    var readyPromise = null;
    function bootstrap() {
      if (readyPromise) return readyPromise;
      var c = readCache(CACHE_KEY);
      if (c.length) dispatchEvt("ff:werkuren-updated", "cache");
      readyPromise = (async function () {
        try { var items = await fetchAll(); _mem = items; writeCache(CACHE_KEY, items); dispatchEvt("ff:werkuren-updated", "bootstrap"); }
        catch (err) { reportSilent("werkurenDB", "Bootstrap", err); }
      })();
      return readyPromise;
    }
    async function refresh() { var items = await fetchAll(); _mem = items; writeCache(CACHE_KEY, items); dispatchEvt("ff:werkuren-updated", "refresh"); return items; }
    function getAllSync() { return _mem != null ? _mem : readCache(CACHE_KEY); }
    function getByIdSync(id) { var s = String(id == null ? "" : id); return getAllSync().find(function (r) { return r && String(r.id) === s; }) || null; }
    function getForMonthSync(year, month) {
      return getAllSync().filter(function (r) {
        if (!r || !r.datum) return false;
        var d = new Date(r.datum);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === Number(year) && (d.getMonth() + 1) === Number(month);
      });
    }
    function getForMedewerkerMonthSync(medewerkerId, year, month) {
      return getForMonthSync(year, month).filter(function (r) { return r && String(r.medewerker_id) === String(medewerkerId); });
    }

    async function add(rec) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      var payload = objToInsertPayload(rec);
      if (!payload.datum) throw new Error("Datum is verplicht");
      var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
      if (res.error) throw res.error;
      var obj = rowToObj(res.data);
      var cache = getAllSync().slice();
      var idx = cache.findIndex(function (r) { return r && String(r.id) === String(obj.id); });
      if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
      _mem = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-updated", "add");
      return obj;
    }
    async function update(id, partial) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      if (!id) throw new Error("Geen id");
      var payload = objToUpdatePayload(partial || {});
      var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
      if (res.error) throw res.error;
      var obj = rowToObj(res.data);
      var cache = getAllSync().slice();
      var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
      if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
      _mem = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-updated", "update");
      return obj;
    }
    async function remove(id) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      if (!id) return false;
      var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
      if (res.error) throw res.error;
      var cache = getAllSync().filter(function (r) { return r && String(r.id) !== String(id); });
      _mem = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-updated", "remove");
      return true;
    }

    global.werkurenDB = {
      get ready() { return readyPromise || bootstrap(); },
      refresh: refresh, fetchAll: fetchAll,
      getAllSync: getAllSync, getByIdSync: getByIdSync,
      getForMonthSync: getForMonthSync, getForMedewerkerMonthSync: getForMedewerkerMonthSync,
      add: add, update: update, delete: remove,
    };
    bootstrap();
  })();

  // ---------------------------------------------------------------------------
  // werkurenLabelsDB
  // ---------------------------------------------------------------------------
  (function () {
    var TABLE = "werkuren_labels";
    var CACHE_KEY = "werkuren_labels_v1";
    // In-memory canonieke cache (quota-proof). localStorage is op deze suite
    // vaak vol → writeCache faalt stil; _mem is dan de enige betrouwbare bron.
    var _memLabels = null;
    function generateId() { return "lbl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
    function rowToObj(row) {
      if (!row) return null;
      return {
        id: row.id,
        naam: row.naam || "",
        beschrijving: row.beschrijving || "",
        archived: !!row.archived,
        aanmaakdatum: row.aanmaakdatum,
        laatstGewijzigd: row.laatst_gewijzigd,
      };
    }
    async function fetchAll() {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      var res = await global.ffSupabase.from(TABLE).select("*").order("naam", { ascending: true });
      if (res.error) throw res.error;
      return (res.data || []).map(rowToObj).filter(Boolean);
    }
    var readyPromise = null;
    function bootstrap() {
      if (readyPromise) return readyPromise;
      var c = readCache(CACHE_KEY);
      if (c.length) dispatchEvt("ff:werkuren-labels-updated", "cache");
      readyPromise = (async function () {
        try { var items = await fetchAll(); _memLabels = items; writeCache(CACHE_KEY, items); dispatchEvt("ff:werkuren-labels-updated", "bootstrap"); }
        catch (err) { reportSilent("werkurenLabelsDB", "Bootstrap", err); }
      })();
      return readyPromise;
    }
    async function refresh() { var items = await fetchAll(); _memLabels = items; writeCache(CACHE_KEY, items); dispatchEvt("ff:werkuren-labels-updated", "refresh"); return items; }
    function getAllSync() { return _memLabels != null ? _memLabels : readCache(CACHE_KEY); }
    function getByIdSync(id) { var s = String(id == null ? "" : id); return getAllSync().find(function (r) { return r && String(r.id) === s; }) || null; }
    async function add(rec) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      if (!rec || !rec.naam) throw new Error("Naam vereist");
      var payload = {
        id: rec.id || generateId(),
        naam: String(rec.naam).trim(),
        beschrijving: String(rec.beschrijving || ""),
      };
      var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
      if (res.error) throw res.error;
      var obj = rowToObj(res.data);
      var cache = getAllSync().slice(); cache.push(obj);
      cache.sort(function (a, b) { return (a.naam || "").localeCompare(b.naam || "", "nl"); });
      _memLabels = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-labels-updated", "add");
      return obj;
    }
    async function update(id, partial) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      if (!id) throw new Error("Geen id");
      var payload = {};
      if (Object.prototype.hasOwnProperty.call(partial || {}, "naam")) payload.naam = String(partial.naam || "").trim();
      if (Object.prototype.hasOwnProperty.call(partial || {}, "beschrijving")) payload.beschrijving = String(partial.beschrijving || "");
      if (Object.prototype.hasOwnProperty.call(partial || {}, "archived")) payload.archived = !!partial.archived;
      var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
      if (res.error) throw res.error;
      var obj = rowToObj(res.data);
      var cache = getAllSync().slice();
      var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
      if (idx >= 0) cache[idx] = obj; else cache.push(obj);
      cache.sort(function (a, b) { return (a.naam || "").localeCompare(b.naam || "", "nl"); });
      _memLabels = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-labels-updated", "update");
      return obj;
    }
    async function archive(id) { return update(id, { archived: true }); }
    async function restore(id) { return update(id, { archived: false }); }
    async function remove(id) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
      if (res.error) throw res.error;
      var cache = getAllSync().filter(function (r) { return r && String(r.id) !== String(id); });
      _memLabels = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-labels-updated", "remove");
      return true;
    }
    global.werkurenLabelsDB = {
      get ready() { return readyPromise || bootstrap(); },
      refresh: refresh, getAllSync: getAllSync, getByIdSync: getByIdSync,
      add: add, update: update, archive: archive, restore: restore, delete: remove,
    };
    bootstrap();
  })();

  // ---------------------------------------------------------------------------
  // werkurenVergrendeldDB
  // ---------------------------------------------------------------------------
  (function () {
    var TABLE = "werkuren_vergrendeld";
    var CACHE_KEY = "werkuren_vergrendeld_v1";
    // In-memory canonieke cache (quota-proof). Cruciaal hier: bij volle
    // localStorage zou isLockedSync uit een lege readCache onterecht false
    // geven → een vergrendelde maand lijkt bewerkbaar. _mem voorkomt dat.
    var _memLock = null;
    function generateId() { return "lk_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
    function rowToObj(row) {
      return row ? {
        id: row.id, medewerker_id: row.medewerker_id, jaar: row.jaar, maand: row.maand,
        vergrendeld_op: row.vergrendeld_op, vergrendeld_door: row.vergrendeld_door,
      } : null;
    }
    async function fetchAll() {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      var res = await global.ffSupabase.from(TABLE).select("*");
      if (res.error) throw res.error;
      return (res.data || []).map(rowToObj).filter(Boolean);
    }
    var readyPromise = null;
    function bootstrap() {
      if (readyPromise) return readyPromise;
      var c = readCache(CACHE_KEY);
      if (c.length) dispatchEvt("ff:werkuren-vergrendeld-updated", "cache");
      readyPromise = (async function () {
        try { var items = await fetchAll(); _memLock = items; writeCache(CACHE_KEY, items); dispatchEvt("ff:werkuren-vergrendeld-updated", "bootstrap"); }
        catch (err) { reportSilent("werkurenVergrendeldDB", "Bootstrap", err); }
      })();
      return readyPromise;
    }
    async function refresh() { var items = await fetchAll(); _memLock = items; writeCache(CACHE_KEY, items); dispatchEvt("ff:werkuren-vergrendeld-updated", "refresh"); return items; }
    function getAllSync() { return _memLock != null ? _memLock : readCache(CACHE_KEY); }
    function isLockedSync(medewerkerId, year, month) {
      return getAllSync().some(function (r) {
        return r && String(r.medewerker_id) === String(medewerkerId)
          && Number(r.jaar) === Number(year) && Number(r.maand) === Number(month);
      });
    }
    async function lock(medewerkerId, year, month) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      if (!medewerkerId || !year || !month) throw new Error("medewerkerId + jaar + maand vereist");
      if (isLockedSync(medewerkerId, year, month)) return null;
      var profile = global.ffCurrentProfile || (global.profilesDB && global.profilesDB.getCurrentSync ? global.profilesDB.getCurrentSync() : null);
      var byId = profile ? (profile.id || null) : null;
      var payload = {
        id: generateId(), medewerker_id: medewerkerId, jaar: Number(year), maand: Number(month),
        vergrendeld_door: byId,
      };
      var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
      if (res.error) throw res.error;
      var cache = getAllSync().slice(); cache.push(rowToObj(res.data));
      _memLock = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-vergrendeld-updated", "lock");
      return rowToObj(res.data);
    }
    async function unlock(medewerkerId, year, month) {
      if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
      var res = await global.ffSupabase.from(TABLE).delete()
        .eq("medewerker_id", medewerkerId).eq("jaar", year).eq("maand", month);
      if (res.error) throw res.error;
      var cache = getAllSync().filter(function (r) {
        return !(r && String(r.medewerker_id) === String(medewerkerId)
          && Number(r.jaar) === Number(year) && Number(r.maand) === Number(month));
      });
      _memLock = cache; writeCache(CACHE_KEY, cache);
      dispatchEvt("ff:werkuren-vergrendeld-updated", "unlock");
      return true;
    }
    global.werkurenVergrendeldDB = {
      get ready() { return readyPromise || bootstrap(); },
      refresh: refresh, getAllSync: getAllSync,
      isLockedSync: isLockedSync, lock: lock, unlock: unlock,
    };
    bootstrap();
  })();
})(typeof window !== "undefined" ? window : this);
