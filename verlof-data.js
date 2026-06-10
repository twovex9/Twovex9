/* global window, localStorage */
/**
 * verlof-data.js — Supabase data-laag voor BS2-port "Verlof aanvragen".
 *
 * Tabel: public.verlof_aanvragen (text PK, FK medewerker_id naar medewerkers.uuid).
 * Aanvraag-flow: concept → ingediend → goedgekeurd / afgewezen.
 *
 * Public API:
 *  - verlofDB.ready / refresh / getAllSync / getByIdSync
 *  - verlofDB.add / update / archive / restore / delete
 *  - verlofDB.indienen(id) / goedkeuren(id, opmerking) / afwijzen(id, opmerking) / annuleren(id)
 *  - verlofDB.getForMedewerkerSync(medewerkerId)
 *
 * Events: besa:verlof-updated
 */
(function (global) {
  "use strict";

  var TABLE = "verlof_aanvragen";
  var CACHE_KEY = "verlof_aanvragen_v1";

  var STATUS_VALUES = ["concept", "ingediend", "goedgekeurd", "afgewezen", "geannuleerd"];
  var TYPE_VALUES = ["wettelijk", "bovenwettelijk", "ouderschap", "calamiteit", "doktersbezoek", "onbetaald", "anders"];

  // PR-B: goedkeuringsroute per verloftype.
  //   - Vakantie (wettelijk/bovenwettelijk) → naar Zorgcoördinator (manager).
  //   - Zorg-/bijzonder verlof → direct HR.
  //   - Onbetaald/anders → HR (conservatief).
  // Voor v1 hardcoded; v2 = beheer-pagina verloftypes.html.
  var ROL_ZORGCOORDINATOR = "Zorgcoördinator";   // = de "teamleider" (bs2-rol-slug 'teamleider')
  var ROL_HR = "HR";
  var ROL_TEAMLEIDER = ROL_ZORGCOORDINATOR;
  // 2-STAPS goedkeuring (user-eis 2026-06-04): ELKE aanvraag eerst naar de
  // teamleider (Zorgcoördinator) → na groen licht naar HR die het verwerkt.
  // routeForType geeft de EERSTE goedkeurder; goedkeuren() schuift door naar HR.
  function routeForType(/* type */) {
    return ROL_TEAMLEIDER;
  }

  function isoNow() { return new Date().toISOString(); }
  function generateId() { return "v_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || null,
      type: row.type || "wettelijk",
      startDatum: row.start_datum || null,
      eindDatum: row.eind_datum || null,
      aantalDagen: row.aantal_dagen != null ? Number(row.aantal_dagen) : 0,
      status: row.status || "concept",
      beschrijving: row.beschrijving || "",
      ingediendOp: row.ingediend_op || null,
      beoordeeldOp: row.beoordeeld_op || null,
      beoordeeldDoor: row.beoordeeld_door || null,
      beoordelingOpmerking: row.beoordeling_opmerking || "",
      huidigeGoedkeurderRol: row.huidige_goedkeurder_rol || routeForType(row.type || "wettelijk"),
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  // G25 — een type is geldig als het in de klassieke lijst staat ÓF als
  // beheerbaar verloftype (verloftypesDB) bestaat. Onbekend → "wettelijk".
  function isKnownType(t) {
    if (TYPE_VALUES.indexOf(t) >= 0) return true;
    try {
      if (global.verloftypesDB && global.verloftypesDB.getAllSync) {
        return global.verloftypesDB.getAllSync().some(function (vt) { return vt && vt.code === t; });
      }
    } catch (e) { /* */ }
    return false;
  }

  function objToPayload(o) {
    var safe = o || {};
    var status = STATUS_VALUES.indexOf(safe.status) >= 0 ? safe.status : "concept";
    var type = isKnownType(safe.type) ? safe.type : "wettelijk";
    var payload = {
      id: safe.id,
      medewerker_id: safe.medewerkerId || null,
      type: type,
      start_datum: safe.startDatum || null,
      eind_datum: safe.eindDatum || null,
      aantal_dagen: safe.aantalDagen != null ? Number(safe.aantalDagen) : 1,
      status: status,
      beschrijving: String(safe.beschrijving || ""),
      beoordeling_opmerking: String(safe.beoordelingOpmerking || ""),
      huidige_goedkeurder_rol: safe.huidigeGoedkeurderRol || routeForType(type),
      archived: !!safe.archived,
    };
    if (safe.beoordeeldDoor) payload.beoordeeld_door = safe.beoordeeldDoor;
    return payload;
  }

  // _mem = in-memory bron-van-waarheid (quota-proof). Bij volle localStorage faalt setItem
  // stil; dan blijven aanvragen via _mem leesbaar — kritiek voor de 2-staps goedkeuring
  // (teamleider -> HR), die anders op een lege getByIdSync zou terugvallen.
  var _mem = null;
  function readCache() {
    if (_mem != null) return _mem;
    try { var raw = localStorage.getItem(CACHE_KEY); _mem = raw ? (JSON.parse(raw) || []) : []; } catch (e) { _mem = []; }
    if (!Array.isArray(_mem)) _mem = [];
    return _mem;
  }
  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(_mem)); } catch (e) { /* */ }
  }

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      // Open (concept/ingediend) eerst, dan goedgekeurd/afgewezen
      var aPending = (a.status === "concept" || a.status === "ingediend") ? 0 : 1;
      var bPending = (b.status === "concept" || b.status === "ingediend") ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      // Op start_datum asc
      var as = a.startDatum ? String(a.startDatum) : "9999-12-31";
      var bs = b.startDatum ? String(b.startDatum) : "9999-12-31";
      if (as !== bs) return as < bs ? -1 : 1;
      // Op aanmaakdatum desc
      return String(b.aanmaakdatum || "").localeCompare(String(a.aanmaakdatum || ""));
    });
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:verlof-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
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
        console.error("[verlofDB] Bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Verlof — bootstrap", err);
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

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var doc = Object.assign({}, rec || {});
    if (!doc.id) doc.id = generateId();
    var payload = objToPayload(doc);
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

  function medewerkerNaam(mid) {
    try {
      var mw = global.medewerkersDB && global.medewerkersDB.getByIdSync && global.medewerkersDB.getByIdSync(mid);
      if (mw) return ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim() || "Een medewerker";
    } catch (e) { /* */ }
    return "Een medewerker";
  }
  function periodeLabel(v) {
    var s = v && v.startDatum ? String(v.startDatum) : "";
    var e = v && v.eindDatum ? String(v.eindDatum) : "";
    return e && e !== s ? (s + " t/m " + e) : s;
  }
  // Best-effort in-app melding naar een rol-groep (zelfde role-lookup-patroon als
  // de planner-conflict-melding). Fail-silent — mag de flow nooit breken.
  async function notifyRolGroep(slugs, title, body, verlofId) {
    try {
      if (!global.besaSupabase) return;
      var rr = await global.besaSupabase.from("bs2_roles").select("id").in("slug", slugs);
      if (rr.error || !rr.data || !rr.data.length) return;
      var roleIds = rr.data.map(function (r) { return r.id; });
      var ru = await global.besaSupabase.from("bs2_role_users").select("user_email").in("role_id", roleIds);
      if (ru.error) return;
      var set = {};
      (ru.data || []).forEach(function (r) { var e = String(r.user_email || "").trim().toLowerCase(); if (e) set[e] = true; });
      var emails = Object.keys(set);
      if (!emails.length) return;
      var pr = await global.besaSupabase.from("profiles").select("id").in("email", emails);
      if (pr.error || !pr.data || !pr.data.length) return;
      var rows = pr.data.map(function (p) {
        return { user_id: p.id, type: "verlof_workflow", title: title, body: body, related_entity_type: "verlof", related_entity_id: verlofId || null };
      });
      await global.besaSupabase.from("notifications").insert(rows);
    } catch (e) { console.warn("[verlofDB] notifyRolGroep mislukt:", e); }
  }

  async function indienen(id) {
    // Stap 1: bij indienen gaat de aanvraag naar de TEAMLEIDER (Zorgcoördinator).
    var res = await update(id, { status: "ingediend", huidigeGoedkeurderRol: ROL_TEAMLEIDER });
    notifyRolGroep(["teamleider"], "Verlofaanvraag ter goedkeuring",
      medewerkerNaam(res.medewerkerId) + " heeft verlof aangevraagd (" + periodeLabel(res) + "). Beoordeel als teamleider.",
      res.id).catch(function () { /* */ });
    return res;
  }

  async function goedkeuren(id, opmerking) {
    var cur = getByIdSync(id) || {};
    var rol = cur.huidigeGoedkeurderRol || ROL_TEAMLEIDER;
    if (rol !== ROL_HR) {
      // Stap 2: teamleider akkoord → door naar HR (status blijft 'ingediend').
      var res1 = await update(id, { huidigeGoedkeurderRol: ROL_HR, beoordelingOpmerking: opmerking || "" });
      notifyRolGroep(["hr", "salarisadministratie"], "Verlof ter verwerking",
        medewerkerNaam(res1.medewerkerId) + " heeft groen licht van de teamleider voor verlof (" + periodeLabel(res1) + "). Verwerk de aanvraag.",
        res1.id).catch(function () { /* */ });
      return res1;
    }
    // Stap 3: HR verwerkt → definitief goedgekeurd + diensten vrijmaken + planners melden.
    var res2 = await update(id, { status: "goedgekeurd", beoordelingOpmerking: opmerking || "" });
    notifyPlanningConflictsAfterApproval(res2).catch(function (err) {
      console.warn("[verlofDB] planning-conflict-notify failed:", err);
    });
    return res2;
  }
  async function afwijzen(id, opmerking) { return update(id, { status: "afgewezen", beoordelingOpmerking: opmerking || "" }); }
  async function annuleren(id) { return update(id, { status: "geannuleerd" }); }

  /**
   * Na goedkeuring: zoek planning-rijen die overlappen met de verlof-periode
   * van de betreffende medewerker (match op `teamlid` = "Voornaam Achternaam").
   * Zet `conflict=true` op die diensten en stuur in-app notificaties naar
   * alle gebruikers met de Planner-rol (bs2_roles.slug='planner').
   *
   * Best-effort, fail-silent — een failure mag de goedkeuring zelf niet
   * verstoren of de UI in een logout-loop trekken.
   */
  async function notifyPlanningConflictsAfterApproval(verlof) {
    if (!global.besaSupabase || !verlof) return;
    var mwDB = global.medewerkersDB;
    if (!mwDB || typeof mwDB.getByIdSync !== "function") return;
    var mw = mwDB.getByIdSync(verlof.medewerkerId);
    if (!mw) return;
    var naam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();
    if (!naam) return;
    if (!verlof.startDatum || !verlof.eindDatum) return;

    var startBoundary = String(verlof.startDatum) + "T00:00:00Z";
    var endBoundary = String(verlof.eindDatum) + "T23:59:59Z";

    var planResp = await global.besaSupabase
      .from("planning")
      .select("id, start_iso, einde_iso, teamlid, diensttype, locatie")
      .eq("teamlid", naam)
      .eq("archived", false)
      .gte("start_iso", startBoundary)
      .lte("start_iso", endBoundary);
    if (planResp.error) {
      console.warn("[verlofDB] planning-conflict query mislukt:", planResp.error);
      return;
    }
    var diensten = planResp.data || [];
    if (diensten.length === 0) return;

    // F5: AUTO-AFHALEN (BS1-only verbetering boven BS2 — user-eis 2026-05-27).
    // Zet teamlid="" zodat de dienst openstaand wordt. conflict=true blijft als
    // markering voor de planner. Alleen toekomstige diensten worden afgehaald —
    // diensten in het verleden zijn al gewerkt en blijven onaangeroerd.
    var nowIso = new Date().toISOString();
    var toekomstDiensten = diensten.filter(function (d) {
      return String(d.start_iso || "") >= nowIso;
    });
    var dienstIds = diensten.map(function (d) { return d.id; });
    var toekomstIds = toekomstDiensten.map(function (d) { return d.id; });

    // Conflict-flag op ALLE overlappende (verleden + toekomst) — historisch nuttig.
    var updResp = await global.besaSupabase.from("planning").update({ conflict: true }).in("id", dienstIds);
    if (updResp.error) {
      console.warn("[verlofDB] planning conflict-flag zetten mislukt:", updResp.error);
    }

    // Auto-afhaal ALLEEN op toekomstige diensten.
    if (toekomstIds.length > 0) {
      var removeResp = await global.besaSupabase
        .from("planning")
        .update({ teamlid: "" })
        .in("id", toekomstIds);
      if (removeResp.error) {
        console.warn("[verlofDB] auto-afhaal mislukt:", removeResp.error);
      }
    }

    // F5: Zoek Planner-rol ÉN Zorgcoördinator-rol (slug 'teamleider'; user-keuze: beide krijgen notif).
    var rolesResp = await global.besaSupabase
      .from("bs2_roles")
      .select("id, slug")
      .in("slug", ["planner", "teamleider"]);
    if (rolesResp.error || !rolesResp.data || rolesResp.data.length === 0) {
      console.warn("[verlofDB] Planner/Zorgcoördinator-rollen niet gevonden — geen notificaties verzonden.");
      return;
    }
    var roleIds = rolesResp.data.map(function (r) { return r.id; });

    // Planner + Zorgcoördinator emails (gecombineerd, gededupliceerd)
    var pruResp = await global.besaSupabase
      .from("bs2_role_users")
      .select("user_email")
      .in("role_id", roleIds);
    if (pruResp.error) {
      console.warn("[verlofDB] bs2_role_users query mislukt:", pruResp.error);
      return;
    }
    var emailSet = {};
    (pruResp.data || []).forEach(function (r) {
      var e = String(r.user_email || "").trim().toLowerCase();
      if (e) emailSet[e] = true;
    });
    var emails = Object.keys(emailSet);
    if (emails.length === 0) return;

    // Profiles match
    var profResp = await global.besaSupabase
      .from("profiles")
      .select("id, email")
      .in("email", emails);
    if (profResp.error) {
      console.warn("[verlofDB] profiles query mislukt:", profResp.error);
      return;
    }
    var userIds = (profResp.data || []).map(function (p) { return p.id; });
    if (userIds.length === 0) return;

    // F5: Bouw rows — 1 notificatie per planner/zorgcoördinator per dienst. Tekst
    // hangt af of de dienst auto-afgehaald is (toekomst) of niet (verleden).
    var toekomstIdSet = {};
    toekomstIds.forEach(function (id) { toekomstIdSet[id] = true; });
    var rows = [];
    diensten.forEach(function (d) {
      var startD = String(d.start_iso || "").slice(0, 10);
      var dienstLabel = (d.diensttype || "Dienst") + (d.locatie ? " (" + d.locatie + ")" : "");
      var auto = !!toekomstIdSet[d.id];
      userIds.forEach(function (uid) {
        rows.push({
          user_id: uid,
          type: "planning_conflict_vervanging",
          title: auto
            ? "Dienst vrijgekomen: " + naam + " op verlof"
            : "Vervanging nodig: " + naam + " heeft verlof",
          body: auto
            ? naam + " is wegens goedgekeurd verlof van dienst '" + dienstLabel +
              "' op " + startD + " afgehaald. Wijs een vervanger toe."
            : naam + " heeft goedgekeurd verlof tijdens dienst '" + dienstLabel + "' op " + startD +
              ". Wijs een vervanger toe of pas de planning aan.",
          related_entity_type: "planning",
          related_entity_id: d.id,
        });
      });
    });
    if (rows.length === 0) return;
    var insResp = await global.besaSupabase.from("notifications").insert(rows);
    if (insResp.error) {
      console.warn("[verlofDB] planner-notifications insert mislukt:", insResp.error);
    }
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(readCache().filter(function (r) { return r && String(r.id) !== String(id); }));
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
    return readCache().filter(function (r) { return r && String(r.medewerkerId) === s; });
  }

  global.verlofDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    add: add, update: update,
    indienen: indienen, goedkeuren: goedkeuren, afwijzen: afwijzen, annuleren: annuleren,
    archive: archive, restore: restore, delete: remove,
    getAllSync: getAllSync, getByIdSync: getByIdSync, getForMedewerkerSync: getForMedewerkerSync,
    routeForType: routeForType,
    STATUS_VALUES: STATUS_VALUES, TYPE_VALUES: TYPE_VALUES,
    ROL_ZORGCOORDINATOR: ROL_ZORGCOORDINATOR, ROL_HR: ROL_HR,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
