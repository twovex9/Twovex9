/* global window, localStorage */
/**
 * Client vragenlijsten — Supabase data-laag met localStorage als read-cache.
 *
 * Voor de Vragenlijsten-tab op client-detail.html (item 14 / 37 in open-items).
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `client_vragenlijsten`.
 *  - vragen_antwoorden is een JSON-array: [{vraag: "...", antwoord: "..."}, ...]
 *  - v1 ondersteunt vrije Q&A. v2 kan templates + question-types toevoegen.
 *
 * Gebruik:
 *   await window.clientVragenlijstenDB.ready;
 *   var rows = window.clientVragenlijstenDB.getForClientSync("cl_322");
 *   var saved = await window.clientVragenlijstenDB.add({
 *     clientId: "cl_322",
 *     naam: "Intake Q2 2026",
 *     templateNaam: "intake",
 *     status: "openstaand",
 *     vragenAntwoorden: [
 *       { vraag: "Wat is uw zorgvraag?", antwoord: "..." },
 *       { vraag: "Wat zijn uw doelen?", antwoord: "..." }
 *     ]
 *   });
 */
(function (global) {
  "use strict";

  var TABLE = "client_vragenlijsten";
  var CACHE_KEY = "client_vragenlijsten_v1";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isoNow() { return new Date().toISOString(); }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:client-vragenlijsten-updated", {
        detail: { source: source || "client-vragenlijsten-data" }
      }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[clientVragenlijstenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) {
      global.ffReportSyncFailure("Vragenlijsten — " + action, err);
    }
  }

  function rowToObj(row) {
    if (!row) return null;
    var qa = row.vragen_antwoorden;
    if (typeof qa === "string") {
      try { qa = JSON.parse(qa); } catch (e) { qa = []; }
    }
    if (!Array.isArray(qa)) qa = [];
    return {
      id: row.id,
      clientId: row.client_id || "",
      naam: row.naam || "",
      templateNaam: row.template_naam || "",
      status: row.status || "openstaand",
      ingevuldDatum: row.ingevuld_datum || null,
      vragenAntwoorden: qa,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var qa = Array.isArray(safe.vragenAntwoorden) ? safe.vragenAntwoorden : [];
    var payload = {
      client_id: String(safe.clientId || ""),
      naam: String(safe.naam || "").trim(),
      template_naam: safe.templateNaam ? String(safe.templateNaam) : null,
      status: safe.status || "openstaand",
      ingevuld_datum: safe.ingevuldDatum || null,
      vragen_antwoorden: qa,
      archived: !!safe.archived,
    };
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    delete p.client_id;
    return p;
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*")
      .order("ingevuld_datum", { ascending: false, nullsFirst: false })
      .order("aanmaakdatum", { ascending: false });
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
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.clientId) throw new Error("clientId verplicht");
    if (!rec.naam || !String(rec.naam).trim()) throw new Error("naam verplicht");
    var payload = objToInsertPayload(rec);
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToUpdatePayload(merged);
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
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

  // Voorgedefinieerde templates (kunnen later naar DB)
  var TEMPLATES = {
    intake: {
      naam: "Intake vragenlijst",
      vragen: [
        "Wat is uw zorgvraag of hulpbehoefte?",
        "Wat zijn uw doelen voor deze begeleiding?",
        "Welke ondersteuning heeft u eerder ontvangen?",
        "Wat is uw netwerk (gezin, familie, vrienden)?",
        "Wat zijn uw sterke kanten en wat gaat er goed?",
      ],
    },
    evaluatie: {
      naam: "Tussenevaluatie",
      vragen: [
        "Hoe ervaart u de huidige begeleiding?",
        "Welke doelen zijn behaald?",
        "Welke doelen moeten worden bijgesteld?",
        "Wat kan beter in de begeleiding?",
      ],
    },
    afsluiting: {
      naam: "Afsluiting / eindevaluatie",
      vragen: [
        "Welke resultaten zijn behaald?",
        "Hoe ervaart u de afgelopen periode?",
        "Wat neemt u mee voor de toekomst?",
        "Heeft u nog vervolgzorg nodig?",
      ],
    },
  };

  function getTemplateSync(key) {
    return TEMPLATES[key] || null;
  }

  function getTemplateKeysSync() {
    return Object.keys(TEMPLATES);
  }

  global.clientVragenlijstenDB = {
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
    getTemplateSync: getTemplateSync,
    getTemplateKeysSync: getTemplateKeysSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
