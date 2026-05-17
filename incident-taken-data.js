/* global window, localStorage */
/**
 * Incident-taken — Supabase data-laag met localStorage als read-cache.
 *
 * 1-op-1 met BS2's `POST /api/tasks` (taken zijn in BS2 een aparte entiteit,
 * gekoppeld aan een incident via `incident_id`). BS2-payload:
 *   { title, status, due_date, is_private, assignee, priority,
 *     collaborators[], incident_id, files[] }
 * → BS1-tabel `public.incident_taken`:
 *   titel, status, due_date, is_private, assignee_id, prioriteit,
 *   collaborators jsonb, incident_id, data jsonb (files[] + evt. bs2-raw).
 *
 * Architectuur volgens werkpatronen.md § 6 (sub-data per parent, zoals
 * beschikking-notities): cache als snelle read-laag; schrijfacties zijn async
 * Supabase-calls; daarna cache + event `besa:incident-taken-updated`.
 *
 * Update-semantiek = PATCH: alleen meegegeven velden worden weggeschreven
 * (zoals incident-categorieen-data.js). Daardoor blijft `data` (incl. files)
 * onaangeroerd bij een status-/titel-wijziging die files niet meestuurt.
 *
 * Public API:
 *   - incidentTakenDB.ready
 *   - incidentTakenDB.refresh()
 *   - incidentTakenDB.getAllSync()
 *   - incidentTakenDB.getForIncidentSync(incidentId)  → niet-gearchiveerd, op datum
 *   - incidentTakenDB.getByIdSync(id)
 *   - incidentTakenDB.add({ incidentId, titel, status, prioriteit, dueDate,
 *       isPrivate, assigneeId, collaborators[], beschrijving, files[] })
 *   - incidentTakenDB.update(id, partial)
 *   - incidentTakenDB.archive(id) / restore(id) / delete(id)
 *
 * De exacte BS2 status-/prioriteit-keuzewaarden worden in Stap 4b vastgelegd
 * vanuit een BS2-observatie van een taak-aanmaak; de data-laag bewaart de
 * waarden as-is (geen CHECK in de DB), de page levert de dropdownopties.
 *
 * Events: "besa:incident-taken-updated" op window.
 */
(function (global) {
  "use strict";

  var TABLE = "incident_taken";
  var CACHE_KEY = "incident_taken_v1";

  function reportSilent(action, err) {
    try { console.error("[incidentTakenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Incident-taken — " + action, err);
    }
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function writeCache(items) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:incident-taken-updated", {
        detail: { source: source || "incident-taken-data" },
      }));
    } catch (e) { /* */ }
  }

  function sanitizeArray(arr) {
    return Array.isArray(arr) ? arr : [];
  }

  // Oudste taak eerst (aanmaak-volgorde), zoals een takenlijst per incident.
  function takenSort(a, b) {
    var at = (a && a.aanmaakdatum) ? String(a.aanmaakdatum) : "";
    var bt = (b && b.aanmaakdatum) ? String(b.aanmaakdatum) : "";
    if (at < bt) return -1;
    if (at > bt) return 1;
    return 0;
  }

  function rowToObj(row) {
    if (!row) return null;
    var d = (row && row.data) || {};
    return {
      id: row.id,
      incidentId: row.incident_id || null,
      titel: row.titel || "",
      beschrijving: row.beschrijving || "",
      status: row.status || "--",
      prioriteit: row.prioriteit || null,
      dueDate: row.due_date || null,
      isPrivate: !!row.is_private,
      assigneeId: row.assignee_id || null,
      collaborators: sanitizeArray(row.collaborators),
      files: sanitizeArray(d.files),
      bs2Id: (d && d.bs2_id) || null,
      bs2: (d && d.bs2_scrape) || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  // Bouwt de `data` jsonb uitsluitend als er iets in te zetten valt
  // (files / bs2-raw). Geeft `undefined` terug → kolom niet meeschrijven,
  // zodat een PATCH zonder files het bestaande `data` ongemoeid laat.
  function buildDataJson(safe) {
    var hasFiles = Object.prototype.hasOwnProperty.call(safe, "files");
    var hasBs2 = Object.prototype.hasOwnProperty.call(safe, "bs2")
      || Object.prototype.hasOwnProperty.call(safe, "bs2Id");
    if (!hasFiles && !hasBs2) return undefined;
    var data = {};
    if (hasFiles) data.files = sanitizeArray(safe.files);
    if (Object.prototype.hasOwnProperty.call(safe, "bs2Id") && safe.bs2Id) data.bs2_id = safe.bs2Id;
    if (Object.prototype.hasOwnProperty.call(safe, "bs2") && safe.bs2) data.bs2_scrape = safe.bs2;
    return data;
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      incident_id: safe.incidentId || null,
      titel: String(safe.titel || ""),
      beschrijving: safe.beschrijving == null ? null : String(safe.beschrijving),
      status: safe.status ? String(safe.status) : "--",
      prioriteit: safe.prioriteit ? String(safe.prioriteit) : null,
      is_private: !!safe.isPrivate,
      assignee_id: safe.assigneeId || null,
      collaborators: sanitizeArray(safe.collaborators),
      archived: !!safe.archived,
    };
    if (safe.dueDate) payload.due_date = safe.dueDate;
    var data = buildDataJson(safe);
    if (data !== undefined) payload.data = data; else payload.data = {};
    if (safe.id) payload.id = safe.id;
    return payload;
  }

  // PATCH: alléén de meegegeven velden. `data` blijft staan tenzij files/bs2
  // expliciet zijn meegegeven.
  function objToUpdatePayload(o) {
    var safe = o || {};
    var p = {};
    var has = function (k) { return Object.prototype.hasOwnProperty.call(safe, k); };
    if (has("incidentId")) p.incident_id = safe.incidentId || null;
    if (has("titel")) p.titel = String(safe.titel || "");
    if (has("beschrijving")) p.beschrijving = safe.beschrijving == null ? null : String(safe.beschrijving);
    if (has("status")) p.status = safe.status ? String(safe.status) : "--";
    if (has("prioriteit")) p.prioriteit = safe.prioriteit ? String(safe.prioriteit) : null;
    if (has("dueDate")) p.due_date = safe.dueDate || null;
    if (has("isPrivate")) p.is_private = !!safe.isPrivate;
    if (has("assigneeId")) p.assignee_id = safe.assigneeId || null;
    if (has("collaborators")) p.collaborators = sanitizeArray(safe.collaborators);
    if (has("archived")) p.archived = !!safe.archived;
    var data = buildDataJson(safe);
    if (data !== undefined) p.data = data;
    return p;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: true });
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
        reportSilent("Bootstrap", err);
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

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getForIncidentSync(incidentId) {
    if (incidentId == null) return [];
    var s = String(incidentId);
    return readCache()
      .filter(function (r) { return r && String(r.incidentId) === s && !r.archived; })
      .sort(takenSort);
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    if (!payload.incident_id) throw new Error("incident_id is verplicht voor een taak");
    var res = await global.besaSupabase
      .from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.push(obj);
    cache.sort(takenSort);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var payload = objToUpdatePayload(partial || {});
    var res = await global.besaSupabase
      .from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    cache.sort(takenSort);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase
      .from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  global.incidentTakenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForIncidentSync: getForIncidentSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
