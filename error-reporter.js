/* global window, document */
/**
 * error-reporter.js — eigen client-side JS-error monitoring voor BS1
 *
 * Vervangt externe error-tracking diensten (Sentry, LogRocket, Datadog).
 * Alle errors gaan naar de eigen `public.client_errors` Supabase-tabel,
 * binnen onze infra-regel "alleen GitHub + Vercel + Supabase".
 *
 * Wat het doet:
 *   - Vangt `window.onerror` events (synchronous JS-errors)
 *   - Vangt `unhandledrejection` events (Promise rejections)
 *   - Stuurt naar `public.client_errors` tabel via Supabase JS-client
 *   - Throttled: dezelfde error-message wordt max 1× per 5 sec gestuurd
 *   - Buffert errors als Supabase-client of sessie nog niet beschikbaar
 *     is (bv. tijdens page-load); flush zodra mogelijk
 *   - Skipt anonymous (= geen sessie) — die kunnen niet schrijven door RLS
 *
 * Laad direct na supabase-client.js, vóór ff-sync-reporter.js.
 *
 * Admin-pagina `errors.html` toont de gelogde errors voor admin-tier
 * (eigenaar/admin/directeur).
 */
(function (global) {
  "use strict";

  if (global.__ffErrorReporterInstalled) return;
  global.__ffErrorReporterInstalled = true;

  var THROTTLE_MS = 5000;
  var MAX_STACK_LEN = 4000;
  var MAX_MESSAGE_LEN = 1000;
  var BUFFER_MAX = 50;

  var lastSent = Object.create(null);
  var buffer = [];

  function nowTs() { return new Date().toISOString(); }

  function truncate(value, max) {
    if (!value) return null;
    var str = typeof value === "string" ? value : String(value);
    if (str.length <= max) return str;
    return str.slice(0, max) + "…";
  }

  function getSupabase() {
    // window.ffSupabase = geconfigureerde client (BS1 conventie, zie supabase-client.js)
    // Fallback naar window.supabase voor edge cases (= globale van CDN, normaal niet bruikbaar)
    if (global.ffSupabase) return global.ffSupabase;
    return null;
  }

  function getCurrentUserId() {
    try {
      if (global.ffCurrentProfile && global.ffCurrentProfile.id) {
        return global.ffCurrentProfile.id;
      }
    } catch (e) { /* */ }
    return null;
  }

  function shouldThrottle(key) {
    var now = Date.now();
    var prev = lastSent[key] || 0;
    if (now - prev < THROTTLE_MS) return true;
    lastSent[key] = now;
    return false;
  }

  function sendOne(payload) {
    var client = getSupabase();
    if (!client || typeof client.from !== "function") {
      buffer.push(payload);
      if (buffer.length > BUFFER_MAX) buffer.shift();
      return;
    }
    try {
      client.from("client_errors").insert(payload).then(function (res) {
        if (res && res.error) {
          // RLS-fail (geen sessie) of netwerk — niet escaleren, alleen console
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[error-reporter] insert mislukt:", res.error.message || res.error);
          }
        }
      }).catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[error-reporter] insert exception:", err && err.message ? err.message : err);
        }
      });
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[error-reporter] send exception:", err);
      }
    }
  }

  function flushBuffer() {
    if (!buffer.length) return;
    var client = getSupabase();
    if (!client) return;
    var batch = buffer.splice(0, buffer.length);
    batch.forEach(sendOne);
  }

  function report(opts) {
    var message = truncate(opts.message || "Onbekende fout", MAX_MESSAGE_LEN);
    var key = (opts.severity || "error") + "|" + message;
    if (shouldThrottle(key)) return;

    var payload = {
      ts: nowTs(),
      user_id: getCurrentUserId(),
      url: typeof location !== "undefined" ? truncate(location.href, 500) : null,
      message: message,
      stack: truncate(opts.stack || null, MAX_STACK_LEN),
      user_agent: typeof navigator !== "undefined" ? truncate(navigator.userAgent, 500) : null,
      severity: opts.severity || "error",
      handled: false
    };

    sendOne(payload);
  }

  function onError(message, source, lineno, colno, error) {
    var stack = error && error.stack ? error.stack : (source + ":" + lineno + ":" + colno);
    report({
      message: message ? String(message) : "window.onerror",
      stack: stack,
      severity: "error"
    });
    return false; // niet de default error-handling voorkomen
  }

  function onUnhandledRejection(event) {
    var reason = event && event.reason;
    var message = "Unhandled promise rejection";
    var stack = null;
    if (reason) {
      if (typeof reason === "string") {
        message = reason;
      } else if (reason.message) {
        message = reason.message;
        stack = reason.stack || null;
      } else {
        try { message = JSON.stringify(reason); } catch (e) { message = String(reason); }
      }
    }
    report({
      message: "Promise rejection: " + message,
      stack: stack,
      severity: "error"
    });
  }

  if (typeof global.addEventListener === "function") {
    global.addEventListener("error", function (event) {
      onError(
        event.message,
        event.filename,
        event.lineno,
        event.colno,
        event.error
      );
    });
    global.addEventListener("unhandledrejection", onUnhandledRejection);
  } else if (typeof global.onerror !== "undefined") {
    global.onerror = onError;
  }

  // Bij profile-update of auth-state-change: flush buffer
  if (typeof global.addEventListener === "function") {
    global.addEventListener("ff:profile-updated", flushBuffer);
    // Probeer ook periodiek te flushen voor pre-auth buffered errors
    var flushInterval = setInterval(function () {
      if (getSupabase() && getCurrentUserId()) {
        flushBuffer();
      }
    }, 3000);
    // Stop flushing after 60s — daarna is sessie er wel of niet
    setTimeout(function () { clearInterval(flushInterval); }, 60000);
  }

  // Publieke API voor handmatig loggen vanuit page-scripts
  global.ffReportError = function (message, opts) {
    opts = opts || {};
    report({
      message: message,
      stack: opts.stack || (new Error()).stack,
      severity: opts.severity || "error"
    });
  };

  global.ffReportWarning = function (message, opts) {
    opts = opts || {};
    report({
      message: message,
      stack: opts.stack || null,
      severity: "warning"
    });
  };
})(typeof window !== "undefined" ? window : this);
