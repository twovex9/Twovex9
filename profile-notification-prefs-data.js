/* global window, localStorage */
/**
 * profile-notification-prefs-data.js — Supabase data-laag voor M2M tabel
 * `public.profile_notification_preferences`.
 *
 * Public API:
 *   profileNotificationPrefsDB = {
 *     ready, refresh,
 *     getForProfile(profileId),  // returns array van { notificationTypeId, enabled }
 *     getEffective(profileId, typeId, defaultAan), // effective enabled-state
 *     setEnabled(profileId, typeId, enabled),  // upsert
 *     remove(profileId, typeId),  // expliciete delete (terug naar default)
 *     getAllSync, refresh,
 *   };
 *
 * Events: ff:notification-prefs-updated
 */
(function (global) {
  "use strict";

  var TABLE = "profile_notification_preferences";
  var CACHE_KEY = "profile_notification_preferences_v1";

  function isoNow() { return new Date().toISOString(); }

  function rowToObj(row) {
    if (!row) return null;
    return {
      profileId: row.profile_id,
      notificationTypeId: row.notification_type_id,
      enabled: !!row.enabled,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); return raw ? (JSON.parse(raw) || []) : []; }
    catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* */ }
  }
  function dispatchUpdated(s) {
    try { global.dispatchEvent(new CustomEvent("ff:notification-prefs-updated", { detail: { source: s || "data" } })); }
    catch (e) { /* */ }
  }
  function reportSilent(action, err) {
    console.error("[profileNotificationPrefsDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Notificatie-voorkeuren — " + action, err);
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase.from(TABLE).select("*");
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
        reportSilent("bootstrap", err);
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

  function getAllSync() { return readCache(); }

  function getForProfile(profileId) {
    if (!profileId) return [];
    var s = String(profileId);
    return readCache().filter(function (r) { return r && String(r.profileId) === s; });
  }

  function getEffective(profileId, typeId, defaultAan) {
    if (!profileId || !typeId) return !!defaultAan;
    var s = String(profileId);
    var t = String(typeId);
    var match = readCache().find(function (r) {
      return r && String(r.profileId) === s && String(r.notificationTypeId) === t;
    });
    if (match) return !!match.enabled;
    return !!defaultAan;
  }

  async function setEnabled(profileId, typeId, enabled) {
    if (!profileId || !typeId) throw new Error("profileId + notificationTypeId vereist");
    var payload = {
      profile_id: profileId,
      notification_type_id: typeId,
      enabled: !!enabled,
    };
    var res = await global.ffSupabase
      .from(TABLE)
      .upsert(payload, { onConflict: "profile_id,notification_type_id" })
      .select()
      .single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) {
      return r
        && String(r.profileId) === String(profileId)
        && String(r.notificationTypeId) === String(typeId);
    });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(cache);
    dispatchUpdated("setEnabled");
    return obj;
  }

  async function remove(profileId, typeId) {
    if (!profileId || !typeId) throw new Error("profileId + notificationTypeId vereist");
    var res = await global.ffSupabase
      .from(TABLE)
      .delete()
      .eq("profile_id", profileId)
      .eq("notification_type_id", typeId);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) {
      return !(r
        && String(r.profileId) === String(profileId)
        && String(r.notificationTypeId) === String(typeId));
    });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  global.profileNotificationPrefsDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getForProfile: getForProfile,
    getEffective: getEffective,
    setEnabled: setEnabled,
    remove: remove,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
