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

  // 1-op-1 BS2 (/api/tasks) — verbatim status/priority-waarden voor TAKEN.
  var STATUS_VALUES = ["--", "In behandeling", "Voltooid"];
  var PRIORITEIT_VALUES = ["Low", "Medium", "High"];
  var PRIORITEIT_RANK = { High: 0, Medium: 1, Low: 2 };

  // Takenmodule v2 — drie itemtypes met elk hun eigen status-vocabulaire.
  // Voor TAAK blijven de BS2-waarden de opslag ("--"/"In behandeling"/"Voltooid")
  // met vriendelijke labels (Nieuw/Afgerond) + twee extra states. De opslagwaarde
  // van "voltooid" blijft bewust "Voltooid" zodat de bestaande trigger/cron werkt.
  var STATUS_BY_TYPE = {
    taak:        ["--", "In behandeling", "Wacht op reactie", "Voltooid", "Geannuleerd"],
    verzoek:     ["Ingediend", "In beoordeling", "Goedgekeurd", "Afgewezen", "Teruggestuurd"],
    goedkeuring: ["Open", "In behandeling", "Goedgekeurd", "Afgekeurd"],
  };
  var TYPE_VALUES = ["taak", "verzoek", "goedkeuring"];
  // Afdeling-taxonomie — identiek aan public.taken_user_afdelingen() server-side.
  var AFDELINGEN = ["HR", "Facilitair", "Beleid & Kwaliteit", "Financiën",
    "Gedragswetenschap", "Planning & Zorg", "Directie", "Algemeen"];

  function statusValuesFor(type) {
    return STATUS_BY_TYPE[type] || STATUS_BY_TYPE.taak;
  }

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
      // De ECHTE FK-kolommen winnen van de BS2-jsonb-snapshot. toegewezen_aan_id
      // = medewerkers.id (waar RLS/hiërarchie, "Mijn taken" en de toewijs-dropdown
      // op draaien); assignee.id is een legacy BS2-user-id en mag alleen fallback
      // zijn voor de ~52 niet-gekoppelde oude taken. Idem aangemaakt_door_id
      // (= auth.users.id) vóór creator.id.
      toegewezenAanId: row.toegewezen_aan_id || (asg && asg.id) || null,
      toegewezenAanNaam: (asg && asg.name) || "",
      aangemaaktDoorId: row.aangemaakt_door_id || (crt && crt.id) || null,
      aangemaaktDoorNaam: (crt && crt.name) || "",
      collaborators: Array.isArray(row.collaborators) ? row.collaborators : [],
      incident: row.incident || null,
      isPrivate: !!row.is_private,
      // Takenmodule v2 — itemtype + afdeling + verzoek↔taak-koppeling.
      type: TYPE_VALUES.indexOf(row.type) >= 0 ? row.type : "taak",
      afdeling: row.afdeling || null,
      omgezetNaarTaakId: row.omgezet_naar_taak_id || null,
      verzoekVanId: row.verzoek_van_id || null,
      status: row.status_bs2 || row.status || "--",
      prioriteit: row.priority_bs2 || row.prioriteit || "Low",
      deadline: row.due_date || row.deadline || null,
      voltooidOp: row.voltooid_op || null,
      goedgekeurdOp: row.goedgekeurd_op || null,
      goedgekeurdDoor: row.goedgekeurd_door || null,
      archived: !!row.archived,
      aanmaakdatum: row.bs2_created_at || row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.bs2_updated_at || row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var type = TYPE_VALUES.indexOf(safe.type) >= 0 ? safe.type : "taak";
    var allowed = statusValuesFor(type);
    var status = allowed.indexOf(safe.status) >= 0 ? safe.status : allowed[0];
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
      // Takenmodule v2 — itemtype + afdeling + verzoek↔taak-koppeling.
      type: type,
      afdeling: safe.afdeling || null,
      omgezet_naar_taak_id: safe.omgezetNaarTaakId || null,
      verzoek_van_id: safe.verzoekVanId || null,
      status_bs2: status,
      priority_bs2: prioriteit,
      due_date: safe.deadline || null,
      deadline: safe.deadline || null,
      is_private: !!safe.isPrivate,
      assignee: asg,
      // Echte FK-kolom: hierop draaien de hiërarchie-RLS én de meldingen-trigger.
      // toegewezenAanId is een medewerkers.id (uuid) of leeg → null.
      toegewezen_aan_id: safe.toegewezenAanId || null,
      archived: !!safe.archived,
      // Goedkeuring door de aanmaker (NULL = nog niet goedgekeurd). Bij een gewone
      // update worden de geladen waarden ongewijzigd teruggeschreven (idempotent).
      goedgekeurd_op: safe.goedgekeurdOp || null,
      goedgekeurd_door: safe.goedgekeurdDoor || null,
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
    // Maker vastleggen (auth.users.id): nodig voor de voltooid-melding én de
    // INSERT-RLS-policy. Alleen bij aanmaken — update raakt dit nooit aan.
    payload.aangemaakt_door_id = doc.aangemaaktDoorId || null;
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
    // Maker nooit overschrijven bij een update (objToPayload zet 'm niet, maar
    // wees expliciet — zo blijft de voltooi-melding altijd naar de échte maker).
    delete payload.aangemaakt_door_id;
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

  // Goedkeuren door de aanmaker = de voltooide taak afronden: archiveren + de
  // audit-velden zetten. De server-trigger C stuurt dan een melding (+ push)
  // naar de toegewezen medewerker dat zijn taak is goedgekeurd.
  async function approve(id) {
    var uid = await getCurrentUserId();
    return update(id, { archived: true, goedgekeurdOp: isoNow(), goedgekeurdDoor: uid || null });
  }
  // Afkeuren = terug naar "In behandeling" (trigger D meldt de medewerker). De
  // goedkeur-velden worden defensief gereset; een eventuele reden zet de UI als
  // opmerking in de gespreksdraad.
  async function reject(id) {
    return update(id, { status: "In behandeling", goedgekeurdOp: null, goedgekeurdDoor: null });
  }

  // ─── Takenmodule v2: verzoeken & besluitpunten ─────────────────────────────

  // Verzoek indienen (medewerker → afdeling). Type=verzoek, status=Ingediend.
  // De server-trigger meldt de afdeling-managers (branch E).
  async function submitVerzoek(rec) {
    var doc = Object.assign({}, rec || {}, { type: "verzoek", status: "Ingediend", toegewezenAanId: null });
    return add(doc);
  }

  // Besluitpunt aanmaken (management+ → directie/eigenaar). Type=goedkeuring, status=Open.
  async function addBesluit(rec) {
    var doc = Object.assign({}, rec || {}, { type: "goedkeuring", status: "Open" });
    return add(doc);
  }

  // Verzoek beoordelen:
  //  - "goedkeuren": maak een NIEUWE taak (omgezet) + markeer verzoek 'Goedgekeurd'
  //    en koppel beide (omgezet_naar_taak_id ↔ verzoek_van_id). Trigger F meldt de indiener.
  //  - "afwijzen":   status 'Afgewezen'.
  //  - "terugsturen": status 'Teruggestuurd'.
  // Een optionele toelichting wordt door de UI als opmerking in de draad gezet.
  async function beoordeelVerzoek(id, actie, opts) {
    opts = opts || {};
    var verzoek = getByIdSync(id);
    if (!verzoek) throw new Error("Verzoek niet gevonden");
    if (actie === "goedkeuren") {
      var taak = await add({
        type: "taak",
        naam: verzoek.naam,
        beschrijving: verzoek.beschrijving,
        afdeling: verzoek.afdeling || null,
        prioriteit: verzoek.prioriteit || "Low",
        deadline: opts.deadline || verzoek.deadline || null,
        toegewezenAanId: opts.toegewezenAanId || null,
        status: "--",
        verzoekVanId: id,
      });
      await update(id, { status: "Goedgekeurd", omgezetNaarTaakId: taak.id });
      return taak;
    }
    if (actie === "afwijzen")   return update(id, { status: "Afgewezen" });
    if (actie === "terugsturen") return update(id, { status: "Teruggestuurd" });
    throw new Error("Onbekende verzoek-actie: " + actie);
  }

  // Besluit nemen op een besluitpunt (goedkeuring). besluit ∈ Goedgekeurd|Afgekeurd|In behandeling.
  // Bij een definitief besluit leggen we de beslisser + tijd vast; trigger G meldt de maker.
  async function neemBesluit(id, besluit) {
    var allowed = STATUS_BY_TYPE.goedkeuring;
    if (allowed.indexOf(besluit) < 0) throw new Error("Ongeldig besluit: " + besluit);
    var patch = { status: besluit };
    if (besluit === "Goedgekeurd" || besluit === "Afgekeurd") {
      var uid = await getCurrentUserId();
      patch.goedgekeurdOp = isoNow();
      patch.goedgekeurdDoor = uid || null;
    } else {
      patch.goedgekeurdOp = null;
      patch.goedgekeurdDoor = null;
    }
    return update(id, patch);
  }

  // UI-context (niveau, afdelingen, kan_beheren, is_directie) uit de server-RPC.
  var _context = null;
  async function getContext() {
    if (_context) return _context;
    try {
      if (global.besaSupabase) {
        var r = await global.besaSupabase.rpc("taken_mijn_context");
        if (!r.error && r.data) { _context = r.data; return _context; }
      }
    } catch (e) { /* val terug op null → UI gebruikt client-side rol-heuristiek */ }
    return null;
  }
  function getContextSync() { return _context; }

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
    approve: approve,
    reject: reject,
    delete: remove,
    // Takenmodule v2
    submitVerzoek: submitVerzoek,
    addBesluit: addBesluit,
    beoordeelVerzoek: beoordeelVerzoek,
    neemBesluit: neemBesluit,
    getContext: getContext,
    getContextSync: getContextSync,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
    STATUS_VALUES: STATUS_VALUES,
    STATUS_BY_TYPE: STATUS_BY_TYPE,
    TYPE_VALUES: TYPE_VALUES,
    AFDELINGEN: AFDELINGEN,
    PRIORITEIT_VALUES: PRIORITEIT_VALUES,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
