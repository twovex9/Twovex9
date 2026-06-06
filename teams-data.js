/* global window, localStorage */
/**
 * teams-data.js — Supabase data-laag voor BS2-port "Teams".
 *
 * Tabel `public.teams` (uuid PK) + M2M `public.medewerker_teams`.
 *
 * Public API:
 *  - teamsDB.ready / refresh / getAllSync / getByIdSync
 *  - teamsDB.add / update / archive / restore / delete
 *  - teamsDB.getMembersSync(teamId) → Array<{medewerker_id, rol_in_team}>
 *  - teamsDB.addMember(teamId, medewerkerId, rol?) → Promise
 *  - teamsDB.removeMember(teamId, medewerkerId) → Promise
 *  - teamsDB.setMemberRole(teamId, medewerkerId, rol) → Promise
 */
(function (global) {
  "use strict";

  var TABLE = "teams";
  var MEMBERS_TABLE = "medewerker_teams";
  var CACHE_KEY = "teams_v1";
  var MEMBERS_CACHE_KEY = "medewerker_teams_v1";

  function isoNow() { return new Date().toISOString(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      beschrijving: row.beschrijving || "",
      teamLeiderId: row.team_leider_id || null,
      locatieId: row.locatie_id || null,
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function memberToObj(row) {
    if (!row) return null;
    return {
      medewerker_id: row.medewerker_id,
      team_id: row.team_id,
      rol_in_team: row.rol_in_team || "lid",
      aanmaakdatum: row.aanmaakdatum,
      bron: "handmatig",
    };
  }

  function objToPayload(o) {
    var safe = o || {};
    var payload = {
      naam: String(safe.naam || "").trim(),
      beschrijving: String(safe.beschrijving || ""),
      team_leider_id: safe.teamLeiderId || null,
      locatie_id: safe.locatieId || null,
      archived: !!safe.archived,
    };
    if (safe.id) payload.id = safe.id;
    return payload;
  }

  function readCache(key) {
    try { var raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) || []) : []; } catch (e) { return []; }
  }
  function writeCache(key, items) {
    try { localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : [])); } catch (e) { /* */ }
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:teams-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function fetchAllTeams() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(TABLE).select("*").order("naam", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  async function fetchAllMembers() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(MEMBERS_TABLE).select("*");
    if (res.error) throw res.error;
    return (res.data || []).map(memberToObj).filter(Boolean);
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var teamsCache = readCache(CACHE_KEY);
    if (teamsCache.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var teams = await fetchAllTeams();
        writeCache(CACHE_KEY, teams);
        var members = await fetchAllMembers();
        writeCache(MEMBERS_CACHE_KEY, members);
        dispatchUpdated("bootstrap");
      } catch (err) {
        console.error("[teamsDB] Bootstrap mislukt:", err);
        if (global.besaReportSyncFailure) global.besaReportSyncFailure("Teams — bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var teams = await fetchAllTeams();
    writeCache(CACHE_KEY, teams);
    var members = await fetchAllMembers();
    writeCache(MEMBERS_CACHE_KEY, members);
    dispatchUpdated("refresh");
    return teams;
  }

  async function add(rec) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToPayload(rec);
    delete payload.id;
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    writeCache(CACHE_KEY, readCache(CACHE_KEY).concat([obj]));
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
    var cache = readCache(CACHE_KEY);
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(CACHE_KEY, cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    writeCache(CACHE_KEY, readCache(CACHE_KEY).filter(function (r) { return r && String(r.id) !== String(id); }));
    writeCache(MEMBERS_CACHE_KEY, readCache(MEMBERS_CACHE_KEY).filter(function (m) { return m && String(m.team_id) !== String(id); }));
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(CACHE_KEY); }
  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache(CACHE_KEY).find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  // ── Leden afgeleid uit locatie ───────────────────────────────────────────
  // Bron-van-waarheid: een team met een locatie krijgt zijn leden automatisch
  // uit de medewerkers die deze locatie in hun `locatiesSelected` hebben staan
  // (= de HR-locatiekoppeling). Zo blijft de teamledenlijst altijd in sync met
  // HR zonder dubbele data. Teams zonder locatie (bv. Ambulant Extern, WLZ)
  // gebruiken alleen handmatige lidmaatschappen uit `medewerker_teams`.
  // locatiesDB heeft géén getByIdSync → naam opzoeken via getAllSync.
  function locatieNaamById(locatieId) {
    if (!locatieId || !global.locatiesDB || !global.locatiesDB.getAllSync) return null;
    var s = String(locatieId);
    var hit = (global.locatiesDB.getAllSync() || []).find(function (l) { return l && String(l.id) === s; });
    return hit && hit.naam ? hit.naam : null;
  }

  function deriveLocationMemberIds(team) {
    if (!team || !team.locatieId) return [];
    var naam = locatieNaamById(team.locatieId);
    if (!naam) return [];
    if (!global.medewerkersDB || !global.medewerkersDB.getAllSync) return [];
    var target = String(naam).trim().toLowerCase();
    var ids = [];
    (global.medewerkersDB.getAllSync() || []).forEach(function (m) {
      if (!m || m.archived) return;
      var sel = Array.isArray(m.locatiesSelected) ? m.locatiesSelected : null;
      if (!sel) return;
      var match = sel.some(function (x) { return String(x || "").trim().toLowerCase() === target; });
      if (match) ids.push(m.id);
    });
    return ids;
  }

  function getMembersSync(teamId) {
    if (!teamId) return [];
    var s = String(teamId);
    var team = getByIdSync(teamId);
    var result = [];
    var seen = {};
    // 1) Afgeleid uit locatie (automatisch, read-only in de UI).
    deriveLocationMemberIds(team).forEach(function (mid) {
      if (seen[mid]) return;
      seen[mid] = true;
      result.push({ medewerker_id: mid, team_id: s, rol_in_team: "lid", bron: "locatie" });
    });
    // 2) Handmatig toegevoegde leden uit medewerker_teams (extra of niet-locatie-teams).
    readCache(MEMBERS_CACHE_KEY).forEach(function (m) {
      if (!m || String(m.team_id) !== s) return;
      if (seen[m.medewerker_id]) return; // al via locatie → niet dubbel tellen
      seen[m.medewerker_id] = true;
      result.push(Object.assign({}, m, { bron: "handmatig" }));
    });
    return result;
  }

  function getTeamsForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return readCache(CACHE_KEY).filter(function (t) {
      return t && getMembersSync(t.id).some(function (m) { return String(m.medewerker_id) === s; });
    });
  }

  async function addMember(teamId, medewerkerId, rol) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var safeRol = ["lid", "leider", "assistent"].indexOf(rol) >= 0 ? rol : "lid";
    var res = await global.besaSupabase.from(MEMBERS_TABLE).insert({
      team_id: teamId, medewerker_id: medewerkerId, rol_in_team: safeRol,
    }).select().single();
    if (res.error) throw res.error;
    var obj = memberToObj(res.data);
    var cache = readCache(MEMBERS_CACHE_KEY);
    cache.push(obj);
    writeCache(MEMBERS_CACHE_KEY, cache);
    dispatchUpdated("addMember");
    return obj;
  }

  async function removeMember(teamId, medewerkerId) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase.from(MEMBERS_TABLE)
      .delete().eq("team_id", teamId).eq("medewerker_id", medewerkerId);
    if (res.error) throw res.error;
    writeCache(MEMBERS_CACHE_KEY, readCache(MEMBERS_CACHE_KEY).filter(function (m) {
      return !(m && String(m.team_id) === String(teamId) && String(m.medewerker_id) === String(medewerkerId));
    }));
    dispatchUpdated("removeMember");
    return true;
  }

  async function setMemberRole(teamId, medewerkerId, rol) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var safeRol = ["lid", "leider", "assistent"].indexOf(rol) >= 0 ? rol : "lid";
    var res = await global.besaSupabase.from(MEMBERS_TABLE)
      .update({ rol_in_team: safeRol }).eq("team_id", teamId).eq("medewerker_id", medewerkerId).select().single();
    if (res.error) throw res.error;
    var obj = memberToObj(res.data);
    var cache = readCache(MEMBERS_CACHE_KEY);
    var idx = cache.findIndex(function (m) {
      return m && String(m.team_id) === String(teamId) && String(m.medewerker_id) === String(medewerkerId);
    });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(MEMBERS_CACHE_KEY, cache);
    dispatchUpdated("setMemberRole");
    return obj;
  }

  global.teamsDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    add: add, update: update, archive: archive, restore: restore, delete: remove,
    getAllSync: getAllSync, getByIdSync: getByIdSync,
    getMembersSync: getMembersSync,
    getTeamsForMedewerkerSync: getTeamsForMedewerkerSync,
    addMember: addMember, removeMember: removeMember, setMemberRole: setMemberRole,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
