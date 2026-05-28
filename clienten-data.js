/* global window */
/**
 * Cliënten — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur (zie ook competenties-data.js / medewerkers-data.js):
 *  - Source of truth: Supabase tabel `clienten`.
 *  - localStorage onder key "clientenItems" = read-cache. Synchrone reads vanuit
 *    bestaande paginacode blijven werken zolang de cache geladen is.
 *  - Schrijfacties gaan async naar Supabase; bij succes wordt de cache geüpdatet
 *    en wordt het event "besa:clienten-updated" gedispatched.
 *  - Backward-compat globals (`getClientenItems`, `upsertClienten`,
 *    `setClientenItems`, `deleteClientenById`, `getClientenById`, etc.) blijven
 *    bestaan zodat alle 9 HTML-pagina's die clienten-data.js laden niets hoeven
 *    te wijzigen. Schrijf-globals doen "fire-and-forget" calls naar Supabase.
 *
 * Toekomst (auth): zie commented-out RLS policies in supabase/schema.sql. De
 * data-laag zelf hoeft daarvoor niet te wijzigen.
 */
(function (global) {
  "use strict";

  var TABLE = "clienten";
  var CACHE_KEY = "clientenItems";
  var SEED_FLAG = "clientenSeededFromBulk.v2";
  var MIGRATION_FLAG_KEY = "clientenMigratedToSupabase.v1";

  var FASES = ["in zorg", "in aanvraag", "uit zorg"];

  function isoNow() {
    return new Date().toISOString();
  }

  function generateClientenId() {
    return "cl_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  // ---------------------------------------------------------------------------
  // Mapping tussen Supabase-rij en frontend-object
  // ---------------------------------------------------------------------------
  // Een aantal velden zijn expliciete kolommen (zoekbaar/sorteerbaar in DB).
  // Alle andere velden gaan in `data jsonb` zodat we zonder schemamigraties
  // kunnen blijven uitbreiden.

  var EXPLICIT_FIELDS = [
    "id",
    "voornaam",
    "achternaam",
    "clientnummer",
    "locatie",
    "fase",
    "gemeente",
    "organisatie",
    "hoofdaannemer",
    "archived",
  ];

  function rowToObj(row) {
    if (!row) return null;
    var data = row.data && typeof row.data === "object" ? row.data : {};
    var obj = Object.assign({}, data, {
      id: row.id,
      voornaam: row.voornaam || "",
      achternaam: row.achternaam || "",
      clientnummer: row.clientnummer == null ? "" : Number(row.clientnummer),
      locatie: row.locatie || "",
      fase: row.fase || "in zorg",
      gemeente: row.gemeente || "",
      organisatie: row.organisatie || "",
      hoofdaannemer: row.hoofdaannemer || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || isoNow(),
    });
    return ensureClientDetailFields(obj);
  }

  function objToInsertPayload(c) {
    var safe = c || {};
    var data = {};
    Object.keys(safe).forEach(function (k) {
      if (EXPLICIT_FIELDS.indexOf(k) >= 0) return;
      if (k === "aanmaakdatum" || k === "laatstGewijzigd" || k === "laatst_gewijzigd") return;
      data[k] = safe[k];
    });
    var nr = parseInt(safe.clientnummer, 10);
    return {
      id: safe.id || generateClientenId(),
      voornaam: String(safe.voornaam || "").trim(),
      achternaam: String(safe.achternaam || "").trim(),
      clientnummer: Number.isFinite(nr) ? nr : null,
      locatie: safe.locatie == null ? null : String(safe.locatie),
      fase: safe.fase || "in zorg",
      gemeente: safe.gemeente == null ? null : String(safe.gemeente),
      organisatie: safe.organisatie == null ? null : String(safe.organisatie),
      hoofdaannemer: safe.hoofdaannemer == null || safe.hoofdaannemer === "" ? null : String(safe.hoofdaannemer),
      archived: !!safe.archived,
      data: data,
    };
  }

  function objToUpdatePayload(c) {
    var p = objToInsertPayload(c);
    delete p.id;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Detailvelden — zorgt dat de UI nooit op `undefined` crasht
  // ---------------------------------------------------------------------------
  function ensureClientDetailFields(c) {
    if (!c || typeof c !== "object") return c;
    if (c.requiredForms == null) c.requiredForms = "";
    if (c.uitZorgDatum == null) c.uitZorgDatum = "";
    if (c.inZorgDatum == null) c.inZorgDatum = "";
    if (c.medewerkerZoek == null) c.medewerkerZoek = "";
    if (c.medewerkerEmpId == null) c.medewerkerEmpId = "";
    if (c.gedragswetenschapperZoek == null) c.gedragswetenschapperZoek = "";
    if (!Array.isArray(c.detailNotities)) c.detailNotities = [];
    if (c.zijbalkNotities == null) c.zijbalkNotities = "";
    if (c.tabNotities == null) c.tabNotities = "";
    return c;
  }

  // ---------------------------------------------------------------------------
  // Cache (localStorage)
  // ---------------------------------------------------------------------------
  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function writeCache(items) {
    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify(Array.isArray(items) ? items : [])
      );
    } catch (e) {
      /* localStorage kan vol zijn (gedeelde quota) — _mem is de bron */
    }
  }

  // In-memory bron-van-waarheid binnen de sessie. De gedeelde browser-quota
  // (~5 MB) wordt door zware module-caches volgemaakt; zodra writeCache
  // faalt zou getAllSync()/getClientenItems() anders [] teruggeven en de
  // hele cliëntenlijst "verdwijnen" terwijl de data veilig in Supabase
  // staat. _mem houdt de volledige set in RAM (geen quota) zodat de UI
  // ALTIJD alles toont; localStorage blijft een best-effort sneller-laden-
  // cache. Niets wordt gestript — alle clientvelden blijven 100% behouden.
  var _mem = null;
  function setData(items) {
    _mem = Array.isArray(items) ? items : [];
    writeCache(_mem);
  }
  function currentList() {
    return (_mem !== null) ? _mem : readCache();
  }

  function dispatchUpdated() {
    try {
      window.dispatchEvent(new CustomEvent("besa:clienten-updated"));
    } catch (e) {
      /* */
    }
  }

  // ---------------------------------------------------------------------------
  // Supabase fetch + bootstrap
  // ---------------------------------------------------------------------------
  async function fetchAll() {
    if (!window.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("achternaam", { ascending: true })
      .order("voornaam", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  /**
   * Eenmalige migratie: als Supabase leeg is en de gebruiker had al cliënten
   * in localStorage staan, upload die dan eenmalig naar Supabase.
   */
  async function maybeMigrateLocalToSupabase() {
    try {
      if (window.localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!window.besaSupabase) return false;

      var head = await window.besaSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { window.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var local = readCache();
      if (!Array.isArray(local) || local.length === 0) {
        try { window.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[clientenDB] Eenmalige migratie van " + local.length + " cliënten naar Supabase…");
      var payload = local.map(function (c) { return objToInsertPayload(c); });
      var ins = await window.besaSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[clientenDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { window.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[clientenDB] Migratie geslaagd: " + (ins.data || []).length + " cliënten geüpload.");
      return true;
    } catch (err) {
      console.error("[clientenDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;

  var realtimeSubscribedCl = false;
  function trySubscribeRealtimeCl(attempt) {
    // Bug #73 fix: defensieve retry-pattern voor non-defer script-load scenarios
    if (realtimeSubscribedCl) return;
    if (window.besaRealtime && typeof window.besaRealtime.subscribe === "function") {
      window.besaRealtime.subscribe("clienten", function () { refresh(); });
      realtimeSubscribedCl = true;
      return;
    }
    if ((attempt || 0) < 10) {
      setTimeout(function () { trySubscribeRealtimeCl((attempt || 0) + 1); }, 300);
    }
  }
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        setData(items);
        try { window.localStorage.setItem(SEED_FLAG, "1"); } catch (e) { /* */ }
        dispatchUpdated();
        // Fase E.7 — subscribe to Realtime changes voor live multi-user sync
        trySubscribeRealtimeCl();
      } catch (err) {
        console.error("[clientenDB] Bootstrap mislukt:", err);
        // Cache blijft staan zodat de UI toch iets toont.
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    try {
      var items = await fetchAll();
      setData(items);
      dispatchUpdated();
      return items;
    } catch (err) {
      console.error("[clientenDB] Refresh mislukt:", err);
      return currentList();
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------
  async function add(client) {
    if (!window.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(client);
    var res = await window.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = currentList().slice();
    // Dedupe-bescherming: als het id al in de cache staat (bv. door een
    // optimistic write elders) vervang het record i.p.v. push (anders 2x
    // dezelfde rij). Smoke-test 2026-05-08 toonde dit gedrag bij +Cliënt
    // toevoegen-modal: cache had na save 2x hetzelfde id.
    var existingIdx = cache.findIndex(function (c) { return c && String(c.id) === String(obj.id); });
    if (existingIdx >= 0) cache[existingIdx] = obj; else cache.push(obj);
    setData(cache);
    dispatchUpdated();
    return obj;
  }

  async function update(id, partial) {
    if (!window.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    // Fase E.11 — optimistic-locking check: voorkomt overwrite van wijzigingen door andere user
    var existing = getByIdSync(id) || {};
    if (window.besaOptimisticLock && existing.laatstGewijzigd) {
      var safe = await window.besaOptimisticLock.check("clienten", id, existing.laatstGewijzigd);
      if (!safe) {
        var answer = await window.besaOptimisticLock.showConflictModal({
          recordName: (existing.voornaam || "") + " " + (existing.achternaam || ""),
        });
        if (answer !== "reload") {
          throw new Error("Cliënt-wijziging geannuleerd — record was inmiddels gewijzigd door iemand anders");
        }
        return existing; // user kiest reload → modal triggert window.location.reload()
      }
    }
    // We doen een READ -> MERGE -> UPDATE zodat we het volledige object naar de
    // jsonb-kolom kunnen schrijven. Dat is robuust tegen race-condities binnen
    // dezelfde gebruiker (1 cliënt tegelijk).
    var merged = Object.assign({}, existing, partial || {});
    merged.id = id;
    var payload = objToUpdatePayload(merged);
    var res = await window.besaSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = currentList().slice();
    var idx = cache.findIndex(function (c) { return c && String(c.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    setData(cache);
    dispatchUpdated();
    return obj;
  }

  async function archive(id) {
    return update(id, { archived: true });
  }

  async function restore(id) {
    return update(id, { archived: false });
  }

  async function remove(id) {
    if (!window.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var res = await window.besaSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (res.error) throw res.error;
    var cache = currentList().filter(function (c) { return c && String(c.id) !== String(id); });
    setData(cache);
    dispatchUpdated();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Synchrone helpers (vanuit _mem / cache) — backward compat
  // ---------------------------------------------------------------------------
  function getAllSync() {
    return currentList().map(ensureClientDetailFields);
  }

  function getByIdSync(id) {
    if (!id) return null;
    var items = currentList();
    var found = items.find(function (c) { return c && String(c.id) === String(id); });
    return found ? ensureClientDetailFields(Object.assign({}, found)) : null;
  }

  // ---------------------------------------------------------------------------
  // Backward-compat globals
  // ---------------------------------------------------------------------------

  /**
   * Synchrone read voor bestaande paginacode. Triggert async bootstrap als de
   * cache nog leeg is, maar geeft direct de huidige cache terug.
   */
  function getClientenItems() {
    var cache = currentList();
    if (!cache.length) {
      // Triggert bootstrap (no-op als al gestart). Geeft tussentijds [] terug,
      // re-render gebeurt via "besa:clienten-updated" (bootstrap vult _mem,
      // ook als de localStorage-cache niet geschreven kon worden).
      bootstrap();
    }
    return cache.map(ensureClientDetailFields);
  }

  /**
   * Gebruikt door bulk-acties (archiveren/herstellen). We nemen de diff met de
   * cache en vertalen die in async update/delete-calls. Niet ideaal, maar in
   * de huidige UX wordt setClientenItems alleen aangeroepen na 1 wijziging
   * tegelijk (archive of restore).
   */
  function setClientenItems(items) {
    if (!Array.isArray(items)) return;
    var oldMap = {};
    currentList().forEach(function (c) { if (c && c.id) oldMap[c.id] = c; });
    setData(items);
    items.forEach(function (c) {
      if (!c || !c.id) return;
      var prev = oldMap[c.id];
      if (!prev) {
        if (window.clientenDB) {
          add(c).catch(function (err) { console.error("[clientenDB] add via setClientenItems mislukt:", err); });
        }
        return;
      }
      // Vergelijk relevante velden
      var changed = false;
      var keys = Object.keys(c);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === "laatstGewijzigd") continue;
        if (JSON.stringify(c[k]) !== JSON.stringify(prev[k])) { changed = true; break; }
      }
      if (changed) {
        update(c.id, c).catch(function (err) { console.error("[clientenDB] update via setClientenItems mislukt:", err); });
      }
    });
  }

  /**
   * Upsert vanuit oudere code paths (bv. client-detail.js save). Bij een
   * bestaand id voert dit een async update uit, anders een async add.
   */
  function upsertClienten(client) {
    if (!client) return false;
    if (!client.id) client.id = generateClientenId();
    // Eerst lokaal in _mem/cache zetten zodat sync reads de wijziging zien.
    var cache = currentList().slice();
    var idx = cache.findIndex(function (c) { return c && String(c.id) === String(client.id); });
    var merged;
    if (idx >= 0) {
      merged = Object.assign({}, cache[idx], client, { laatstGewijzigd: isoNow() });
      cache[idx] = merged;
    } else {
      merged = Object.assign({ aanmaakdatum: isoNow(), laatstGewijzigd: isoNow() }, client);
      cache.push(merged);
    }
    setData(cache);
    dispatchUpdated();

    // En vervolgens fire-and-forget naar Supabase synchroniseren.
    if (window.besaSupabase) {
      var p = idx >= 0
        ? update(client.id, merged)
        : add(merged);
      p.catch(function (err) {
        console.error("[clientenDB] upsertClienten sync mislukt:", err);
      });
    }
    return true;
  }

  function deleteClientenById(id) {
    if (!id) return false;
    var cache = currentList().filter(function (c) { return c && String(c.id) !== String(id); });
    setData(cache);
    dispatchUpdated();
    if (window.besaSupabase) {
      remove(id).catch(function (err) { console.error("[clientenDB] delete sync mislukt:", err); });
    }
    return true;
  }

  function getClientenById(id) {
    return getByIdSync(id);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var api = {
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
  };

  global.clientenDB = api;

  // Backward-compat globals (gebruikt door clienten.js, client-detail.js,
  // beschikkingen.js, beschikking-detail.js, organisatie.js, facturen.js, …).
  global.getClientenItems = getClientenItems;
  global.setClientenItems = setClientenItems;
  global.generateClientenId = generateClientenId;
  global.upsertClienten = upsertClienten;
  global.deleteClientenById = deleteClientenById;
  global.getClientenById = getClientenById;
  global.ensureClientDetailFields = ensureClientDetailFields;
  global.FASEN_CLIËNT = FASES;

  bootstrap();
})(typeof window !== "undefined" ? window : this);
