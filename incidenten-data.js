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
  // Categorieën zijn nu beheerbaar via public.incident_categorieen (Stage 9g).
  // De hardcoded set is vervangen door een runtime-check tegen de actieve
  // categorieën uit incidentCategorieenDB. De DB-CHECK constraint is gedropt.
  function isAllowedCategorie(naam) {
    if (!naam) return false;
    if (global.incidentCategorieenDB && typeof global.incidentCategorieenDB.getByNaamSync === "function") {
      return !!global.incidentCategorieenDB.getByNaamSync(naam);
    }
    // Geen data-laag geladen: alles toestaan en op de DB vertrouwen.
    return true;
  }
  // Strikt 1-op-1 BS2: time_of_day-enum verbatim (geen lossy BS1-vertaling in
  // opslag; Nederlandse labels zitten alleen in de UI-laag TIJDSTIPPEN).
  var ALLOWED_TIJDSTIP = {
    morning: 1, afternoon: 1, midday: 1, evening: 1, night: 1,
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

  function sanitizeUuidArray(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i += 1) {
      var v = arr[i];
      if (v == null) continue;
      var s = String(v).trim();
      if (s) out.push(s);
    }
    return out;
  }

  function sanitizeNullableBool(v) {
    if (v === true || v === "true" || v === 1 || v === "ja" || v === "yes") return true;
    if (v === false || v === "false" || v === 0 || v === "nee" || v === "no") return false;
    return null;
  }

  function strOrNull(v) {
    if (v == null) return null;
    var s = String(v);
    return s.trim() === "" ? null : s;
  }

  function hasOwn(o, k) {
    return Object.prototype.hasOwnProperty.call(o || {}, k);
  }

  // BS2-afhandel-/extra-velden. Worden alléén in de payload geschreven als ze
  // expliciet op het object staan, zodat een gewone create ze op de DB-default
  // (null) laat — exact zoals BS2's server bij `POST /api/incidents`. Bij
  // "afhandelen" (PATCH) zet incident-melden ze wél → worden dan meegeschreven.
  function applyBs2AfhandelFields(payload, safe) {
    if (hasOwn(safe, "categorieToelichting")) payload.categorie_toelichting = strOrNull(safe.categorieToelichting);
    if (hasOwn(safe, "vereisteToelichting")) payload.vereiste_toelichting = strOrNull(safe.vereisteToelichting);
    if (hasOwn(safe, "oudersNietReden")) payload.ouders_niet_reden = strOrNull(safe.oudersNietReden);
    if (hasOwn(safe, "beoordeling")) payload.beoordeling = strOrNull(safe.beoordeling);
    if (hasOwn(safe, "afgehandeldOp")) payload.afgehandeld_op = safe.afgehandeldOp || null;
    if (hasOwn(safe, "pastClientprofiel")) payload.past_clientprofiel = sanitizeNullableBool(safe.pastClientprofiel);
    if (hasOwn(safe, "pastClientprofielToelichting")) payload.past_clientprofiel_toelichting = strOrNull(safe.pastClientprofielToelichting);
    if (hasOwn(safe, "zorgplanUpdateNodig")) payload.zorgplan_update_nodig = sanitizeNullableBool(safe.zorgplanUpdateNodig);
    if (hasOwn(safe, "zorgplanUpdateOmschrijving")) payload.zorgplan_update_omschrijving = strOrNull(safe.zorgplanUpdateOmschrijving);
    if (hasOwn(safe, "adviesRichtlijnen")) payload.advies_richtlijnen = strOrNull(safe.adviesRichtlijnen);
  }

  // Leidt de 1-op-1 BS2-relaties af uit data.bs2_scrape. De BS1-FK's voor
  // reporter/locatie staan bewust op null (de BS2-id's mappen niet 1-op-1 op
  // BS1-tabellen); de volledige BS2-objecten blijven 100% bewaard in
  // data.bs2_scrape en worden hier read-only ontsloten zodat de UI exact
  // toont wat BS2 toont ("Gemeld door", locatie, cliënten, categorie, ...).
  function deriveBs2(row) {
    var d = (row && row.data) || null;
    var s = (d && d.bs2_scrape) || null;
    return {
      bs2Id: (d && (d.bs2_id || (s && s.id))) || null,
      bs2: s || null,
      reporter: (s && s.reporter) || null,
      locatieBs2: (s && s.location) || null,
      clientsBs2: (s && Array.isArray(s.clients)) ? s.clients : [],
      categoryBs2: (s && s.category) || null,
      otherParties: (s && Array.isArray(s.other_parties)) ? s.other_parties : [],
      bestanden: (s && Array.isArray(s.files)) ? s.files : [],
      employeesBs2: (s && Array.isArray(s.employees)) ? s.employees : [],
      tasksBs2: (s && Array.isArray(s.tasks)) ? s.tasks : [],
    };
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
    var o = {
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
      oudersGeinformeerd: sanitizeNullableBool(row.ouders_geinformeerd),
      wilGebeldWorden: !!row.wil_gebeld_worden,
      impactOpZorgverlener: row.impact_op_zorgverlener || "",
      notificeerTeam: !!row.notificeer_team,
      notificeerMedewerkerIds: sanitizeUuidArray(row.notificeer_medewerker_ids),
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
      archived: !!row.archived,
      // BS2 afhandel-/extra velden (Stap 4a — 1-op-1 BS2)
      categorieToelichting: row.categorie_toelichting || "",
      vereisteToelichting: row.vereiste_toelichting || "",
      oudersNietReden: row.ouders_niet_reden || "",
      beoordeling: row.beoordeling || "",
      afgehandeldOp: row.afgehandeld_op || null,
      pastClientprofiel: sanitizeNullableBool(row.past_clientprofiel),
      pastClientprofielToelichting: row.past_clientprofiel_toelichting || "",
      zorgplanUpdateNodig: sanitizeNullableBool(row.zorgplan_update_nodig),
      zorgplanUpdateOmschrijving: row.zorgplan_update_omschrijving || "",
      adviesRichtlijnen: row.advies_richtlijnen || "",
    };
    var b = deriveBs2(row);
    for (var k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k]; }
    return o;
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var categorie = isAllowedCategorie(safe.categorie) ? safe.categorie : (safe.categorie || "Overig");
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
      ouders_geinformeerd: sanitizeNullableBool(safe.oudersGeinformeerd),
      wil_gebeld_worden: !!safe.wilGebeldWorden,
      impact_op_zorgverlener: String(safe.impactOpZorgverlener || ""),
      notificeer_team: !!safe.notificeerTeam,
      notificeer_medewerker_ids: sanitizeUuidArray(safe.notificeerMedewerkerIds),
      archived: !!safe.archived,
    };
    applyBs2AfhandelFields(payload, safe);
    // 1-op-1 BS2: bij overgang naar 'opgelost' (completed) wordt resolved_at /
    // afgehandeld_op gevuld (voedt avg_resolution_time op het dashboard).
    // BS2 doet dit server-side; BS1 heeft geen server dus de data-laag borgt
    // het voor élke caller (overzicht-statuswissel én afhandelen-flow).
    // Bestaande afhandel-datum blijft staan; niet-opgelost wist 'm niet
    // (BS2 behoudt resolved_at ook; voorkomt avg-resolution-corruptie).
    if (status === "opgelost" && !payload.afgehandeld_op) {
      payload.afgehandeld_op = safe.afgehandeldOp || new Date().toISOString();
    }
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

  // Dynamic CATEGORIES: leest uit incidentCategorieenDB als die geladen is
  // (Stage 9g — beheerbare categorieën). Fallback op een lege array zodat
  // pagina's nooit crashen als de andere data-laag (nog) niet bootstrapped is.
  // De legacy hardcoded lijst is vervangen door deze dynamische getter; oude
  // hardcoded waarden zijn als seed naar public.incident_categorieen gemigreerd.
  function getDynamicCategories() {
    if (global.incidentCategorieenDB && typeof global.incidentCategorieenDB.getActiveSync === "function") {
      var cats = global.incidentCategorieenDB.getActiveSync() || [];
      return cats.map(function (c) { return c && c.naam ? c.naam : ""; }).filter(Boolean);
    }
    return [];
  }

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
    get CATEGORIES() { return getDynamicCategories(); },
    STATUSES: [
      { value: "in_afwachting", label: "In afwachting", className: "incident-status--afwachting" },
      { value: "in_behandeling", label: "In behandeling", className: "incident-status--behandeling" },
      { value: "opgelost", label: "Opgelost", className: "incident-status--opgelost" },
    ],
    // 1-op-1 BS2 time_of_day (5 waarden, chronologisch). Waarde = BS2 verbatim;
    // label = NL-huisstijl. Exacte BS2-labeltekst wordt in Stap 5 visueel
    // tegen BS2 geverifieerd en zo nodig bijgesteld.
    TIJDSTIPPEN: [
      { value: "morning", label: "Ochtend" },
      { value: "midday", label: "Middag" },
      { value: "afternoon", label: "Namiddag" },
      { value: "evening", label: "Avond" },
      { value: "night", label: "Nacht" },
    ],
    // 1-op-1 BS2 incident_actors — exact de 4 waarden die BS2 gebruikt
    // (geen medewerker_naar_client; die komt in BS2 niet voor).
    ACTOR_TYPES: [
      { value: "alleen_client", label: "Alleen cliënt", desc: "Het incident betreft één cliënt zonder betrokken anderen" },
      { value: "client_naar_client", label: "Cliënt naar cliënt", desc: "Tussen twee of meer cliënten onderling" },
      { value: "client_naar_medewerker", label: "Cliënt naar medewerker", desc: "Een cliënt richting een medewerker" },
      { value: "client_naar_overige", label: "Cliënt naar overige betrokkene", desc: "Een cliënt richting een externe betrokkene" },
    ],
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
