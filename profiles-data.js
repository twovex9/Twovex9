/* global window */
/**
 * profiles-data.js — Stage 8b: data-laag voor public.profiles.
 *
 * Bron-van-waarheid: Supabase tabel public.profiles. Elke rij hoort 1-op-1 bij
 * een auth.users record. Een database-trigger maakt 'm automatisch aan zodra
 * via het Supabase Dashboard een nieuwe gebruiker wordt aangemaakt.
 *
 * Wat deze module exposeert:
 *   - window.profilesDB.bootstrap()       → fetcht de huidige user + hun profiel
 *                                           én alle profielen in cache.
 *   - window.profilesDB.refresh()         → idem, geforceerd opnieuw fetchen.
 *   - window.profilesDB.getCurrentSync()  → het profiel van de ingelogde user.
 *   - window.profilesDB.getAllSync()      → alle profielen (voor user-pickers).
 *   - window.profilesDB.getByIdSync(id)   → één profiel.
 *   - window.profilesDB.update(id, patch) → wijzigt voornaam/achternaam etc.
 *                                           (rol-wijziging vereist admin via RLS)
 *   - window.profilesDB.isAdmin()         → boolean shortcut op huidig profiel.
 *
 * Ook beschikbaar:
 *   - window.besaCurrentProfile           → reactief object, gevuld na bootstrap.
 *
 * Events:
 *   - "besa:profile-updated" op window na elke mutatie of bootstrap.
 */
(function (global) {
  "use strict";

  var TABLE = "profiles";
  var CACHE_KEY = "besaProfilesV1";
  var CURRENT_KEY = "besaCurrentProfileV1";

  function reportSilent(action, err) {
    console.error("[profilesDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Profielen — " + action, err);
  }

  function readCache() {
    try {
      var raw = global.localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(items) {
    try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* */ }
  }

  function readCurrent() {
    try {
      var raw = global.localStorage.getItem(CURRENT_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return p && typeof p === "object" ? p : null;
    } catch (e) { return null; }
  }
  function writeCurrent(profile) {
    try {
      if (profile) global.localStorage.setItem(CURRENT_KEY, JSON.stringify(profile));
      else global.localStorage.removeItem(CURRENT_KEY);
    } catch (e) { /* */ }
  }

  function dispatchUpdated() {
    try { global.dispatchEvent(new CustomEvent("besa:profile-updated")); }
    catch (e) { /* */ }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      email: row.email || "",
      voornaam: row.voornaam || "",
      achternaam: row.achternaam || "",
      rol: row.rol || "medewerker",
      medewerkerId: row.medewerker_id || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function objToUpdatePayload(patch) {
    var p = patch || {};
    var out = {};
    if (p.email !== undefined) out.email = String(p.email || "");
    if (p.voornaam !== undefined) out.voornaam = String(p.voornaam || "");
    if (p.achternaam !== undefined) out.achternaam = String(p.achternaam || "");
    if (p.rol !== undefined) out.rol = String(p.rol || "medewerker");
    if (p.medewerkerId !== undefined) out.medewerker_id = p.medewerkerId || null;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Display-name helper (voor topbar-badge en andere UI)
  // ---------------------------------------------------------------------------
  function displayName(profile) {
    if (!profile) return "";
    var f = String(profile.voornaam || "").trim();
    var l = String(profile.achternaam || "").trim();
    var full = (f + " " + l).trim();
    if (full) return full;
    return String(profile.email || "").trim();
  }

  // ---------------------------------------------------------------------------
  // Supabase fetch + bootstrap
  // ---------------------------------------------------------------------------
  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .order("achternaam", { ascending: true })
      .order("voornaam", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  // Dienstverband van de aan dit profiel gekoppelde medewerker (Loondienst / Stagiair /
  // Inhuur / …). Bepaalt of de ZZP-self-service-tabs (Mijn facturen / Mijn beschikbaarheid)
  // relevant zijn: loondienst/stagiair worden via het rooster ingepland en hebben die
  // tabs niet nodig (video-feedback eigenaar 2026-06-07). Leeg = onbekend/niet gekoppeld.
  async function fetchDienstverband(medewerkerId) {
    if (!medewerkerId || !global.besaSupabase) return "";
    try {
      var r = await global.besaSupabase
        .from("medewerkers")
        .select("dienstverband")
        .eq("id", medewerkerId)
        .maybeSingle();
      return (r && r.data && r.data.dienstverband) ? String(r.data.dienstverband) : "";
    } catch (e) { return ""; }
  }

  async function fetchCurrent() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var sess = await global.besaSupabase.auth.getSession();
    var user = sess && sess.data && sess.data.session ? sess.data.session.user : null;
    if (!user) return null;
    var res = await global.besaSupabase
      .from(TABLE)
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (res.error) throw res.error;
    var profile = rowToObj(res.data);
    if (profile) profile.dienstverband = await fetchDienstverband(profile.medewerkerId);
    return profile;
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        var current = await fetchCurrent();
        if (current) {
          writeCurrent(current);
          global.besaCurrentProfile = current;
          global.besaCurrentDienstverband = current.dienstverband || "";
        }
        var all = await fetchAll();
        writeCache(all);
        dispatchUpdated();
        return current;
      } catch (err) {
        reportSilent("Bootstrap", err);
        return null;
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    readyPromise = null;
    return bootstrap();
  }

  async function update(id, patch) {
    if (!id) throw new Error("id is verplicht.");
    if (!global.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var dbPatch = objToUpdatePayload(patch);
    if (Object.keys(dbPatch).length === 0) {
      var existing = readCache().find(function (p) { return p && p.id === id; });
      return existing || null;
    }
    var res = await global.besaSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var updated = rowToObj(res.data);
    var list = readCache().map(function (p) { return p && p.id === id ? updated : p; });
    writeCache(list);
    if (global.besaCurrentProfile && global.besaCurrentProfile.id === id) {
      // Dienstverband zit niet op de profiles-rij; behoud de eerder opgehaalde waarde.
      updated.dienstverband = global.besaCurrentProfile.dienstverband || "";
      global.besaCurrentProfile = updated;
      writeCurrent(updated);
    }
    dispatchUpdated();
    return updated;
  }

  function getAllSync() { return readCache(); }
  function getByIdSync(id) {
    if (!id) return null;
    var list = readCache();
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }
  function getCurrentSync() {
    return global.besaCurrentProfile || readCurrent();
  }
  function isAdmin() {
    var p = getCurrentSync();
    return !!(p && p.rol === "admin");
  }

  function getDienstverbandSync() {
    if (global.besaCurrentDienstverband) return global.besaCurrentDienstverband;
    var p = getCurrentSync();
    return (p && p.dienstverband) || "";
  }

  // Initiele cache uit localStorage zodat sync-getters meteen iets hebben.
  global.besaCurrentProfile = readCurrent();
  global.besaCurrentDienstverband = (global.besaCurrentProfile && global.besaCurrentProfile.dienstverband) || "";

  global.profilesDB = {
    get ready() { return readyPromise || bootstrap(); },
    bootstrap: bootstrap,
    refresh: refresh,
    update: update,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getCurrentSync: getCurrentSync,
    getDienstverbandSync: getDienstverbandSync,
    isAdmin: isAdmin,
    displayName: displayName,
  };

  // Direct bootstrappen — auth-guard heeft de sessie al gegarandeerd.
  bootstrap();
})(typeof window !== "undefined" ? window : this);
