/* global window */
/**
 * realtime-sync.js — Fase E.7 — Supabase Realtime channels voor live multi-user sync
 *
 * Per user-keuze #15: BS1 spiegelt BS2 WebSocket gedrag via Supabase Realtime channels.
 * Wanneer user A een record wijzigt, ziet user B die wijziging real-time zonder refresh.
 *
 * Werking:
 *   1. Per data-laag: roep ffRealtime.subscribe(tableName, onChangeCallback) aan
 *   2. Supabase Realtime stuurt postgres_changes events naar alle subscribers
 *   3. Data-laag refresht cache + fired existing ff:<naam>-updated event
 *   4. UI re-rendert automatisch
 *
 * Vereist: Supabase Realtime moet enabled zijn op de relevante tabellen
 * (Supabase Studio → Database → Replication).
 *
 * Gebruik (vanuit data-laag):
 *   window.ffRealtime.subscribe("clienten", function() {
 *     refresh();  // re-fetch + dispatch event
 *   });
 *
 * Cleanup automatisch on `beforeunload`.
 */
(function (global) {
  "use strict";

  var subscriptions = {};
  var DEBOUNCE_MS = 1500;  // batch multiple changes binnen 1.5s
  var debounceTimers = {};

  function subscribe(tableName, onChange) {
    if (!global.ffSupabase || !global.ffSupabase.channel) {
      console.warn("[realtime-sync] Supabase Realtime not available, skip subscribe for", tableName);
      return null;
    }
    if (subscriptions[tableName]) {
      // Already subscribed — replace callback
      subscriptions[tableName].onChange = onChange;
      return subscriptions[tableName].channel;
    }

    var channelName = "realtime-" + tableName + "-" + Math.random().toString(36).slice(2, 8);
    try {
      var channel = global.ffSupabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: tableName },
          function (_payload) {
            // Debounce — multiple rapid changes (bulk-update) → 1 callback
            if (debounceTimers[tableName]) clearTimeout(debounceTimers[tableName]);
            debounceTimers[tableName] = setTimeout(function () {
              try {
                if (subscriptions[tableName] && typeof subscriptions[tableName].onChange === "function") {
                  subscriptions[tableName].onChange();
                }
              } catch (e) {
                console.error("[realtime-sync] handler error for " + tableName + ":", e);
              }
            }, DEBOUNCE_MS);
          }
        )
        .subscribe(function (status) {
          if (status === "SUBSCRIBED") {
            console.info("[realtime-sync] subscribed to " + tableName);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[realtime-sync] " + tableName + " status: " + status);
          }
        });

      subscriptions[tableName] = { channel: channel, onChange: onChange };
      return channel;
    } catch (err) {
      console.error("[realtime-sync] subscribe failed for " + tableName + ":", err);
      return null;
    }
  }

  function unsubscribe(tableName) {
    if (!subscriptions[tableName]) return;
    try {
      global.ffSupabase.removeChannel(subscriptions[tableName].channel);
    } catch (e) { /* */ }
    delete subscriptions[tableName];
    if (debounceTimers[tableName]) {
      clearTimeout(debounceTimers[tableName]);
      delete debounceTimers[tableName];
    }
  }

  function unsubscribeAll() {
    Object.keys(subscriptions).forEach(function (table) {
      unsubscribe(table);
    });
  }

  // Auto-cleanup on page-unload
  global.addEventListener("beforeunload", unsubscribeAll);

  global.ffRealtime = {
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    unsubscribeAll: unsubscribeAll,
    getActiveSubscriptions: function () {
      return Object.keys(subscriptions);
    },
  };
})(typeof window !== "undefined" ? window : this);
