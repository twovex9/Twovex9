/* global window, document */
/**
 * notifications-data.js — data-laag voor `public.notifications` + `public.notification_reads`.
 *
 * BS2-parity: notification-bell met Ongelezen/Gelezen tabs + count-badge.
 *
 * window.notificationsDB:
 *   - ready: Promise (resolves na bootstrap)
 *   - fetchAll(): laadt alle notifications + reads voor huidige user
 *   - listSync(): synchrone read uit cache
 *   - countUnreadSync(): aantal ongelezen
 *   - markRead(notificationId): markeer als gelezen
 *   - markAllRead(): markeer ALLE als gelezen
 *   - refresh(): herlaad
 *
 * Event: `besa:notifications-updated` op window bij elke wijziging.
 */
(function (global) {
  "use strict";

  if (!global.besaSupabase) {
    console.warn("[notificationsDB] besaSupabase ontbreekt — notifications zijn niet beschikbaar");
    return;
  }

  var supa = global.besaSupabase;
  var cache = [];
  var readsCache = {}; // notification_id → read_at iso
  var currentUserId = null;
  var readyPromise = null;

  function reportSilent(action, err) {
    console.error("[notificationsDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Notificaties — " + action, err);
  }

  function emit() {
    try {
      window.dispatchEvent(new Event("besa:notifications-updated"));
    } catch (e) { /* */ }
  }

  async function getCurrentUserId() {
    if (currentUserId) return currentUserId;
    if (global.besaCurrentProfile && global.besaCurrentProfile.id) {
      currentUserId = global.besaCurrentProfile.id;
      return currentUserId;
    }
    if (!supa.auth) return null;
    var r = await supa.auth.getUser();
    currentUserId = r && r.data && r.data.user ? r.data.user.id : null;
    return currentUserId;
  }

  async function fetchAll() {
    var uid = await getCurrentUserId();
    if (!uid) {
      cache = [];
      readsCache = {};
      return cache;
    }
    try {
      var notifResp = await supa
        .from("notifications")
        .select("id, user_id, type, title, body, related_entity_type, related_entity_id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(200);
      if (notifResp.error) throw notifResp.error;
      cache = notifResp.data || [];

      var readsResp = await supa
        .from("notification_reads")
        .select("notification_id, read_at")
        .eq("user_id", uid);
      if (readsResp.error) throw readsResp.error;
      readsCache = {};
      (readsResp.data || []).forEach(function (r) {
        readsCache[r.notification_id] = r.read_at;
      });
      emit();
      return cache;
    } catch (err) {
      reportSilent("fetchAll", err);
      return cache;
    }
  }

  function listSync() {
    return cache.map(function (n) {
      return Object.assign({}, n, {
        is_read: !!readsCache[n.id],
        read_at: readsCache[n.id] || null,
      });
    });
  }

  function countUnreadSync() {
    var n = 0;
    for (var i = 0; i < cache.length; i++) {
      if (!readsCache[cache[i].id]) n++;
    }
    return n;
  }

  async function markRead(notificationId) {
    var uid = await getCurrentUserId();
    if (!uid || !notificationId) return;
    if (readsCache[notificationId]) return; // already read
    try {
      var resp = await supa
        .from("notification_reads")
        .insert({ notification_id: notificationId, user_id: uid });
      if (resp.error) throw resp.error;
      readsCache[notificationId] = new Date().toISOString();
      emit();
    } catch (err) {
      reportSilent("markRead", err);
    }
  }

  async function markAllRead() {
    var uid = await getCurrentUserId();
    if (!uid) return;
    var unreadIds = cache.filter(function (n) { return !readsCache[n.id]; }).map(function (n) { return n.id; });
    if (unreadIds.length === 0) return;
    try {
      var rows = unreadIds.map(function (id) { return { notification_id: id, user_id: uid }; });
      var resp = await supa.from("notification_reads").insert(rows);
      if (resp.error) throw resp.error;
      var nowIso = new Date().toISOString();
      unreadIds.forEach(function (id) { readsCache[id] = nowIso; });
      emit();
    } catch (err) {
      reportSilent("markAllRead", err);
    }
  }

  async function refresh() {
    return fetchAll();
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = fetchAll().catch(function (e) { reportSilent("bootstrap", e); return []; });
    return readyPromise;
  }

  global.notificationsDB = {
    get ready() { return readyPromise || bootstrap(); },
    fetchAll: fetchAll,
    listSync: listSync,
    countUnreadSync: countUnreadSync,
    markRead: markRead,
    markAllRead: markAllRead,
    refresh: refresh,
  };

  // Auto-bootstrap zodra profielen geladen zijn
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

  // Hervat bij profielwijziging (na login)
  window.addEventListener("besa:profile-updated", function () {
    currentUserId = null;
    readyPromise = null;
    bootstrap();
  });
})(window);
