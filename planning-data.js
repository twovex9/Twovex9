/* global window, localStorage */
/**
 * Planning — Supabase data-laag met localStorage als read-cache.
 *
 * - Source of truth: Supabase tabel `planning`.
 * - localStorage onder "planningItems" = read-cache (synchrone reads in
 *   planning.js blijven werken).
 * - Schrijfacties (writePlanningItems) worden door planning.js aangeroepen;
 *   deze data-laag biedt `pushFullCache()` om de hele lijst sync naar
 *   Supabase te zetten (bulk overwrite — pragmatisch voor MVP).
 */
(function (global) {
  "use strict";

  var TABLE = "planning";
  var CACHE_KEY = "planningItems";
  var MIGRATION_FLAG_KEY = "planningMigratedToSupabase.v1";

  // In-memory bron-van-waarheid voor synchrone reads. De planning-dataset
  // (duizenden diensten) is te groot voor localStorage (quota ~5MB) → _mem houdt
  // de volledige lijst in RAM, en de localStorage-cache is slechts een best-effort
  // warm-start die mág falen. Zelfde patroon als medewerkers-/clienten-/werkuren-
  // data.js. Voorkomt dat een verse load op een lege/stale cache de UI leeg laat.
  var _mem = null;

  // Alleen UI-velden in de localStorage-cache bewaren (de zware bs2-import-velden
  // in `data` — freelancer_cost_breakdown e.d. — blazen de cache op tot >5MB).
  function slimForCache(items) {
    var FIELDS = EXPLICIT_FIELDS.concat(["leer", "sterren", "herhaal", "herhaalFrequentie", "competenties", "zorgsoort"]);
    return (Array.isArray(items) ? items : []).map(function (o) {
      var s = {};
      for (var i = 0; i < FIELDS.length; i++) { var k = FIELDS[i]; if (o && o[k] !== undefined) s[k] = o[k]; }
      return s;
    });
  }

  function readCache() {
    if (Array.isArray(_mem)) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];   // RAM = bron van waarheid (geen quota-limiet)
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(slimForCache(_mem)));   // best-effort warm-start
    } catch (e) {
      // Quota overschreden: verwijder de (mogelijk stale) warm-start cache zodat een
      // verse load niet op verouderde data terugvalt. _mem blijft de bron van waarheid.
      try { localStorage.removeItem(CACHE_KEY); } catch (e2) { /* */ }
    }
  }
  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("besa:planning-updated")); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Mapping rij ⇄ object
  // ---------------------------------------------------------------------------
  var EXPLICIT_FIELDS = [
    "id", "start", "einde",
    "diensttype", "afdeling", "functie",
    "teamlead", "teamlid", "client",
    "vestiging", "locatie",
    "conflict", "archived",
    "open_voor_aanmelding", "pauze_uren", "vereist_aantal_medewerkers",
    "beschrijving", "parent_dienst_id",
    "kilometers",
  ];

  function toIsoOrNull(s) {
    if (!s) return null;
    var str = String(s);
    // Wandklok-zonder-tijdzone (bv. "2026-05-01T07:00" uit planning.js combineDateTimeToLocalIso)
    // opslaan als FAKE-UTC: de wandklok-componenten letterlijk als UTC (+00:00). Zo zijn
    // app-diensten consistent met de BS2-import (start_iso "...:00+00") en met hoe planning.js
    // / open-diensten.js / de mobiele app de tijd LEZEN (wandklok via slice/parseStartDate).
    // De oude new Date(str).toISOString() interpreteerde de wandklok als LOKALE tijd en
    // verschoof app-diensten +1/+2u t.o.v. de BS2-mirror.
    // Trailing offset/Z bewust negeren: élke ISO-achtige dienst-tijd wordt als wandklok
    // (fake-UTC) opgeslagen, consistent met de BS2-mirror en de lees-kant (parseStartDate/slice).
    var m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + (m[6] || "00") + "+00:00";
    }
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function rowToObj(row) {
    if (!row) return null;
    // BS2-import legacy: row.data kan een bs2_full bevatten (~3KB per record).
    // Voor 4461 records = ~13MB → overschrijdt localStorage limiet (~5-10MB).
    // Strip bs2_full + andere bs2_-prefixed legacy-velden uit cache. Backend
    // behoudt data jsonb intact; UI heeft alleen top-level kolommen nodig.
    var data = {};
    if (row.data && typeof row.data === "object") {
      Object.keys(row.data).forEach(function (k) {
        if (k === "bs2_full" || k.indexOf("bs2_") === 0) return;
        data[k] = row.data[k];
      });
    }
    return Object.assign({}, data, {
      id: row.id,
      start: row.start_iso || "",
      einde: row.einde_iso || "",
      diensttype: row.diensttype || "",
      afdeling: row.afdeling || "",
      functie: row.functie || "",
      teamlead: row.teamlead || "",
      teamlid: row.teamlid || "",
      client: row.client || "",
      vestiging: row.vestiging || "",
      locatie: row.locatie || "",
      conflict: !!row.conflict,
      archived: !!row.archived,
      pauze_uren: row.pauze_uren != null ? Number(row.pauze_uren) : 0,
      vereist_aantal_medewerkers: row.vereist_aantal_medewerkers != null ? Number(row.vereist_aantal_medewerkers) : 1,
      kilometers: row.kilometers != null ? Number(row.kilometers) : 0,
      beschrijving: row.beschrijving || "",
      open_voor_aanmelding: row.open_voor_aanmelding !== false,
      parent_dienst_id: row.parent_dienst_id || null,
    });
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var data = {};
    Object.keys(safe).forEach(function (k) {
      if (EXPLICIT_FIELDS.indexOf(k) >= 0) return;
      data[k] = safe[k];
    });
    return {
      id: safe.id || ("p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8)),
      start_iso: toIsoOrNull(safe.start),
      einde_iso: toIsoOrNull(safe.einde),
      diensttype: safe.diensttype || null,
      afdeling: safe.afdeling || null,
      functie: safe.functie || null,
      teamlead: safe.teamlead || null,
      teamlid: safe.teamlid || null,
      client: safe.client || null,
      vestiging: safe.vestiging || null,
      locatie: safe.locatie || null,
      conflict: !!safe.conflict,
      archived: !!safe.archived,
      open_voor_aanmelding: safe.open_voor_aanmelding !== false,
      pauze_uren: safe.pauze_uren != null ? Number(safe.pauze_uren) : 0,
      vereist_aantal_medewerkers: safe.vereist_aantal_medewerkers != null ? Number(safe.vereist_aantal_medewerkers) : 1,
      kilometers: safe.kilometers != null ? Number(safe.kilometers) : 0,
      beschrijving: safe.beschrijving || null,
      parent_dienst_id: safe.parent_dienst_id || null,
      data: data,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    // Chunked fetch: PostgREST geeft max 1000 rijen per query. De planning kan
    // duizenden records hebben. Voorheen werden de chunks STRIKT SEQUENTIEEL
    // opgehaald (elke chunk wachtte op de vorige) → bij 4000+ rijen ~5 round-
    // trips ná elkaar. Nu halen we de eerste chunk mét exacte telling op en
    // daarna alle resterende chunks PARALLEL. Identieke data én volgorde
    // (zelfde ORDER BY + aaneengesloten .range()-vensters), maar ~5 seriële
    // round-trips → ~2. Valt terug op sequentieel als de telling ontbreekt.
    var chunkSize = 1000;
    function page(withCount, offset) {
      var sel = withCount
        ? global.besaSupabase.from(TABLE).select("*", { count: "exact" })
        : global.besaSupabase.from(TABLE).select("*");
      return sel
        .order("start_iso", { ascending: true, nullsFirst: false })
        .range(offset, offset + chunkSize - 1);
    }
    var first = await page(true, 0);
    if (first.error) throw first.error;
    var all = first.data || [];
    var total = (typeof first.count === "number") ? first.count : null;

    if (total === null) {
      // Telling onbekend → sequentieel verder, exact zoals voorheen.
      if (all.length >= chunkSize) {
        var offset = chunkSize;
        while (true) {
          var res = await page(false, offset);
          if (res.error) throw res.error;
          var batch = res.data || [];
          all = all.concat(batch);
          if (batch.length < chunkSize) break;
          offset += chunkSize;
          if (offset > 50000) break; // safety
        }
      }
    } else if (total > all.length) {
      // Resterende chunks parallel ophalen.
      var promises = [];
      for (var off = chunkSize; off < total && off <= 50000; off += chunkSize) {
        promises.push(page(false, off));
      }
      var rest = await Promise.all(promises);
      for (var i = 0; i < rest.length; i += 1) {
        if (rest[i].error) throw rest[i].error;
        all = all.concat(rest[i].data || []);
      }
    }
    return all.map(rowToObj).filter(Boolean);
  }

  async function maybeMigrateLocalToSupabase() {
    try {
      if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.besaSupabase) return false;

      var head = await global.besaSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var local = readCache();
      if (!Array.isArray(local) || local.length === 0) {
        try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[planningDB] Eenmalige migratie van " + local.length + " planning-items…");
      var payload = local.map(function (r) { return objToInsertPayload(r); });
      var ins = await global.besaSupabase.from(TABLE).insert(payload).select();
      if (ins.error) {
        console.error("[planningDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[planningDB] Migratie geslaagd: " + (ins.data || []).length + " items.");
      return true;
    } catch (err) {
      console.error("[planningDB] Migratiefout:", err);
      return false;
    }
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await maybeMigrateLocalToSupabase();
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated();
      } catch (err) {
        console.error("[planningDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  /**
   * Bulk full-overwrite: synct de hele lokale cache naar Supabase. Wordt
   * door planning.js aangeroepen na elke writePlanningItems() — pragmatisch
   * voor MVP. Optimalisatie (diff) kan later.
   */
  function reportSilent(action, err) {
    console.error("[planningDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Planning — " + action, err);
  }

  async function pushFullCache(items) {
    if (!global.besaSupabase) return;
    if (!Array.isArray(items)) return;
    writeCache(items);   // _mem (+ best-effort localStorage) direct bijwerken zodat de UI de mutatie meteen ziet
    try {
      // Diff-strategie: upsert alle records (id is primary key) en delete wat
      // niet meer in de lijst staat.
      var existingHead = await global.besaSupabase.from(TABLE).select("id");
      if (existingHead.error) { reportSilent("pushFullCache select", existingHead.error); return; }
      var existingIds = (existingHead.data || []).map(function (r) { return r.id; });
      var localIds = items.map(function (r) { return r && r.id; }).filter(Boolean);
      var toDelete = existingIds.filter(function (id) { return localIds.indexOf(id) === -1; });

      // 🔴 DIEHARD-veiligheidsklep: een NIET-lege lijst die toch een groot deel van de
      // bestaande diensten zou verwijderen, duidt vrijwel zeker op een stale/partiële
      // cache (bv. een oude demo-seed met 13 items naast 7000+ echte diensten). Nooit
      // zwijgend duizenden echte diensten wissen. Een expliciete "wis alles" geeft
      // items=[] en valt hier bewust NIET onder.
      if (items.length > 0 && toDelete.length > 50 && toDelete.length > existingIds.length * 0.5) {
        reportSilent("pushFullCache delete-guard",
          new Error("Geweigerd: zou " + toDelete.length + " van " + existingIds.length +
                    " diensten verwijderen op basis van " + items.length + " cache-items (stale cache?)"));
        toDelete = [];
      }

      if (items.length) {
        var payload = items.map(function (r) { return objToInsertPayload(r); });
        var ups = await global.besaSupabase.from(TABLE).upsert(payload, { onConflict: "id" });
        if (ups.error) reportSilent("upsert", ups.error);
      }
      if (toDelete.length) {
        var del = await global.besaSupabase.from(TABLE).delete().in("id", toDelete);
        if (del.error) reportSilent("delete", del.error);
      }
    } catch (err) {
      reportSilent("pushFullCache", err);
    }
  }

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    return readCache().find(function (r) { return String(r.id) === String(id); }) || null;
  }

  /**
   * Update een enkele planningrij in Supabase + cache + dispatch event.
   * Patch wordt gemerged in `data` jsonb (alle niet-EXPLICIT_FIELDS) +
   * top-level kolommen worden direct ge-overwrite.
   */
  async function update(id, patch) {
    if (!global.besaSupabase) throw new Error("Supabase niet geladen");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, patch || {});
    var payload = objToInsertPayload(merged);
    delete payload.id;
    // 🔴 DIEHARD: laat het `data` jsonb in Supabase ongemoeid bij een puur top-level
    // patch (de normale planning-mutatie). Anders zou een patch op basis van een slanke
    // cache (zonder de bs2-velden) het bestaande data jsonb leeg overschrijven.
    var patchHasDataField = Object.keys(patch || {}).some(function (k) { return EXPLICIT_FIELDS.indexOf(k) === -1; });
    if (!patchHasDataField) delete payload.data;
    var res = await global.besaSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var row = rowToObj(res.data);
    var cur = readCache().map(function (r) { return String(r.id) === String(id) ? row : r; });
    writeCache(cur);
    dispatchUpdated();
    return row;
  }

  async function add(obj) {
    if (!global.besaSupabase) throw new Error("Supabase niet geladen");
    var payload = objToInsertPayload(obj);
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var row = rowToObj(res.data);
    var cur = readCache();
    cur.unshift(row);
    writeCache(cur);
    dispatchUpdated();
    return row;
  }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase niet geladen");
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cur = readCache().filter(function (r) { return String(r.id) !== String(id); });
    writeCache(cur);
    dispatchUpdated();
    return true;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  global.planningDB = {
    get ready() { return readyPromise || bootstrap(); },
    pushFullCache: pushFullCache,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    refresh: async function () {
      var items = await fetchAll();
      writeCache(items);
      dispatchUpdated();
    },
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
