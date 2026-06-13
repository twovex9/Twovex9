/* global window, localStorage */
/**
 * klachten-data.js — Supabase data-laag voor het klachtenregister.
 *
 * Architectuur volgens werkpatronen.md § 6 (zelfde patroon als incidenten-data.js):
 *  - Bron van waarheid: Supabase tabel `public.klachten`.
 *  - In-memory `_mem` is de sync-bron binnen de sessie; localStorage = best-effort
 *    read-cache (de gedeelde browserquota kan vol zitten, dus niet enkel daarop leunen).
 *  - Schrijfacties (add/update/archive/restore) gaan async naar Supabase; daarna
 *    wordt `ff:klachten-updated` gefired voor live re-renders.
 *  - DIEHARD: er is GEEN hard-delete. De tabel heeft bewust geen DELETE-policy;
 *    "verwijderen" = archiveren (archived=true). Geen remove()/delete() in de API.
 *
 * Gebruik:
 *   await window.klachtenDB.ready;
 *   var items = window.klachtenDB.getAllSync();
 *   var saved = await window.klachtenDB.add({ onderwerp:"...", omschrijving:"...",
 *     status:"nieuw", prioriteit:"middel", melderNaam:"...", melderType:"client" });
 *   await window.klachtenDB.update(id, { status:"in_behandeling" });
 *   await window.klachtenDB.archive(id);
 *   window.addEventListener("ff:klachten-updated", function () { rerender(); });
 */
(function (global) {
  "use strict";

  var TABLE = "klachten";
  var CACHE_KEY = "klachten_v1";

  var ALLOWED_STATUS = { nieuw: 1, in_behandeling: 1, afgehandeld: 1 };
  var ALLOWED_PRIORITEIT = { laag: 1, middel: 1, hoog: 1 };

  function reportSilent(action, err) {
    try { console.error("[klachtenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Klachten — " + action, err);
  }

  function strOrNull(v) {
    if (v == null) return null;
    var s = String(v);
    return s.trim() === "" ? null : s.trim();
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
    catch (e) { /* quota vol — _mem is de bron */ }
  }

  var _mem = null;
  function setData(items) { _mem = Array.isArray(items) ? items : []; writeCache(_mem); }
  function currentList() { return (_mem !== null) ? _mem : readCache(); }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:klachten-updated", { detail: { source: source || "klachten-data" } }));
    } catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      onderwerp: row.onderwerp || "",
      omschrijving: row.omschrijving || "",
      status: ALLOWED_STATUS[row.status] ? row.status : "nieuw",
      prioriteit: ALLOWED_PRIORITEIT[row.prioriteit] ? row.prioriteit : "middel",
      melderNaam: row.melder_naam || "",
      melderType: row.melder_type || "",
      clientId: row.client_id || null,
      behandelaarId: row.behandelaar_id || null,
      behandelaarNaam: row.behandelaar_naam || "",
      ontvangenOp: row.ontvangen_op || null,
      afgehandeldOp: row.afgehandeld_op || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || null,
      laatstGewijzigd: row.laatst_gewijzigd || null,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var status = ALLOWED_STATUS[safe.status] ? safe.status : "nieuw";
    var prioriteit = ALLOWED_PRIORITEIT[safe.prioriteit] ? safe.prioriteit : "middel";
    var payload = {
      onderwerp: String(safe.onderwerp || "").trim(),
      omschrijving: strOrNull(safe.omschrijving),
      status: status,
      prioriteit: prioriteit,
      melder_naam: strOrNull(safe.melderNaam),
      melder_type: strOrNull(safe.melderType),
      client_id: strOrNull(safe.clientId),
      behandelaar_id: strOrNull(safe.behandelaarId),
      behandelaar_naam: strOrNull(safe.behandelaarNaam),
      archived: !!safe.archived,
    };
    if (safe.ontvangenOp) payload.ontvangen_op = safe.ontvangenOp;
    // Status 'afgehandeld' vult afgehandeld_op (consistent met incidenten 'opgelost').
    if (status === "afgehandeld") {
      payload.afgehandeld_op = safe.afgehandeldOp || new Date().toISOString();
    } else if (Object.prototype.hasOwnProperty.call(safe, "afgehandeldOp")) {
      payload.afgehandeld_op = safe.afgehandeldOp || null;
    }
    return payload;
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).select("*").order("ontvangen_op", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try { setData(await fetchAll()); dispatchUpdated("bootstrap"); }
      catch (err) { reportSilent("Bootstrap", err); }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    setData(items);
    dispatchUpdated("refresh");
    return items;
  }

  function getAllSync() { return currentList(); }
  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var f = currentList().find(function (r) { return r && String(r.id) === s; });
    return f ? Object.assign({}, f) : null;
  }

  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).insert(objToInsertPayload(rec)).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var list = currentList().slice(); list.unshift(obj);
    setData(list); dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    var payload = objToInsertPayload(merged);
    delete payload.id;
    payload.laatst_gewijzigd = new Date().toISOString();
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var list = currentList().slice();
    var idx = list.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) list[idx] = obj; else list.unshift(obj);
    setData(list); dispatchUpdated("update");
    return obj;
  }

  // DIEHARD: alleen soft-archive. Géén hard delete (de tabel heeft geen DELETE-policy).
  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  global.klachtenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    STATUSES: [
      { value: "nieuw", label: "Nieuw", className: "kl-status--nieuw" },
      { value: "in_behandeling", label: "In behandeling", className: "kl-status--behandeling" },
      { value: "afgehandeld", label: "Afgehandeld", className: "kl-status--afgehandeld" },
    ],
    PRIORITEITEN: [
      { value: "laag", label: "Laag" },
      { value: "middel", label: "Middel" },
      { value: "hoog", label: "Hoog" },
    ],
    MELDER_TYPES: [
      { value: "client", label: "Cliënt" },
      { value: "familie", label: "Familie / naaste" },
      { value: "medewerker", label: "Medewerker" },
      { value: "extern", label: "Externe partij" },
      { value: "anoniem", label: "Anoniem" },
    ],
  };

  if (global.ffSupabase) bootstrap();
  else global.addEventListener("ff:supabase-ready", bootstrap, { once: true });
})(typeof window !== "undefined" ? window : this);
