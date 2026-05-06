/* global window, localStorage */
/**
 * Incidenten — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur volgens werkpatronen.md § 6:
 *  - Source of truth: Supabase tabel `public.incidenten`.
 *  - Bij bootstrap fetcht deze module alle incidenten en cachet ze onder
 *    "incidenten_v1" zodat een tweede page-load instant data heeft.
 *  - Schrijfacties (add/update/archive/restore/delete) gaan async naar Supabase;
 *    de cache wordt geüpdatet en het update-event `besa:incidenten-updated`
 *    wordt gefired voor live re-renders.
 *  - Geen legacy-migratie nodig (incidenten is nieuw vanaf Stage 9c).
 *
 * Gebruik:
 *   await window.incidentenDB.ready;
 *   var items = window.incidentenDB.getAllSync();
 *   var saved = await window.incidentenDB.add({
 *     clientId: "...", categorie: "Val", status: "in_afwachting",
 *     beoordelaarId: "...", melderId: "...", locatieId: "...",
 *     incidentDatum: "2026-05-06T18:00:00Z",
 *     omschrijving: "...", genomenMaatregelen: "...",
 *   });
 *   await window.incidentenDB.archive(id);
 *   window.addEventListener("besa:incidenten-updated", function () { rerender(); });
 */
(function (global) {
  "use strict";

  var TABLE = "incidenten";
  var CACHE_KEY = "incidenten_v1";

  var ALLOWED_STATUS = { in_afwachting: 1, in_behandeling: 1, opgelost: 1 };
  var ALLOWED_CATEGORIE = {
    "Val": 1, "Medicatie": 1, "Agressie": 1, "Vermissing": 1,
    "Materiele schade": 1, "Privacy/AVG": 1, "Overig": 1,
  };
  var ALLOWED_TIJDSTIP = {
    vroege_ochtend: 1, ochtend: 1, middag: 1, late_middag: 1, avond: 1, nacht: 1,
  };
  var ALLOWED_ACTOR = {
    alleen_client: 1, client_naar_client: 1, client_naar_medewerker: 1,
    medewerker_naar_client: 1, client_naar_overige: 1,
  };

  function sanitizeBetrokken(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(function (b) { return b && (b.type === "client" || b.type === "medewerker") && b.id; })
      .map(function (b) { return { type: b.type, id: String(b.id) }; });
  }

  function reportSilent(action, err) {
    try { console.error("[incidentenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Incidenten — " + action, err);
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
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:incidenten-updated", {
        detail: { source: source || "incidenten-data" },
      }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      clientId: row.client_id || null,
      categorie: row.categorie || "Overig",
      status: row.status || "in_afwachting",
      beoordelaarId: row.beoordelaar_id || null,
      melderId: row.melder_id || null,
      locatieId: row.locatie_id || null,
      incidentDatum: row.incident_datum || null,
      omschrijving: row.omschrijving || "",
      genomenMaatregelen: row.genomen_maatregelen || "",
      tijdstipVanDag: row.tijdstip_van_dag || null,
      isBuiten: !!row.is_buiten,
      actorType: row.actor_type || null,
      betrokkenPartijen: sanitizeBetrokken(row.betrokken_partijen),
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
      archived: !!row.archived,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var categorie = ALLOWED_CATEGORIE[safe.categorie] ? safe.categorie : "Overig";
    var status = ALLOWED_STATUS[safe.status] ? safe.status : "in_afwachting";
    var tijdstip = ALLOWED_TIJDSTIP[safe.tijdstipVanDag] ? safe.tijdstipVanDag : null;
    var actor = ALLOWED_ACTOR[safe.actorType] ? safe.actorType : null;
    var payload = {
      client_id: safe.clientId || null,
      categorie: categorie,
      status: status,
      beoordelaar_id: safe.beoordelaarId || null,
      melder_id: safe.melderId || null,
      locatie_id: safe.locatieId || null,
      omschrijving: String(safe.omschrijving || ""),
      genomen_maatregelen: String(safe.genomenMaatregelen || ""),
      tijdstip_van_dag: tijdstip,
      is_buiten: !!safe.isBuiten,
      actor_type: actor,
      betrokken_partijen: sanitizeBetrokken(safe.betrokkenPartijen),
      archived: !!safe.archived,
    };
    if (safe.incidentDatum) payload.incident_datum = safe.incidentDatum;
    if (safe.id) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    return p;
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("incident_datum", { ascending: false });
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

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(rec);
    var res = await global.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.unshift(obj);
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
    var res = await global.besaSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
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
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }

  global.incidentenDB = {
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
    // Constants voor UI dropdowns:
    CATEGORIES: ["Val", "Medicatie", "Agressie", "Vermissing", "Materiele schade", "Privacy/AVG", "Overig"],
    STATUSES: [
      { value: "in_afwachting", label: "In afwachting", className: "incident-status--afwachting" },
      { value: "in_behandeling", label: "In behandeling", className: "incident-status--behandeling" },
      { value: "opgelost", label: "Opgelost", className: "incident-status--opgelost" },
    ],
    TIJDSTIPPEN: [
      { value: "vroege_ochtend", label: "Vroege ochtend (06:00 - 09:00)" },
      { value: "ochtend", label: "Ochtend (09:00 - 12:00)" },
      { value: "middag", label: "Middag (12:00 - 15:00)" },
      { value: "late_middag", label: "Late middag (15:00 - 18:00)" },
      { value: "avond", label: "Avond (18:00 - 22:00)" },
      { value: "nacht", label: "Nacht (22:00 - 06:00)" },
    ],
    ACTOR_TYPES: [
      { value: "alleen_client", label: "Alleen cliënt", desc: "Het incident betreft één cliënt zonder betrokken anderen" },
      { value: "client_naar_client", label: "Cliënt naar cliënt", desc: "Tussen twee of meer cliënten onderling" },
      { value: "client_naar_medewerker", label: "Cliënt naar medewerker", desc: "Een cliënt richting een medewerker" },
      { value: "medewerker_naar_client", label: "Medewerker naar cliënt", desc: "Een medewerker richting een cliënt" },
      { value: "client_naar_overige", label: "Cliënt naar overige betrokkene", desc: "Een cliënt richting een externe betrokkene" },
    ],
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
