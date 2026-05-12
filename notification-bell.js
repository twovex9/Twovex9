/* global window, document */
/**
 * notification-bell.js — Notificatie-bel in topbar met counter.
 *
 * Toont een belicon vóór de auth-badge in de topbar. De counter telt de
 * unread audit-events sinds de gebruiker voor het laatst op de bel klikte
 * (lastSeen-timestamp in localStorage per-user).
 *
 * Bronnen:
 *   - public.audit_log (generic — Block 10/11 triggers)
 *   - public.beschikking_audit_log (legacy — beschikking-specifiek)
 *
 * Klik op de bel:
 *   - markeert alles tot nu als gezien (lastSeen = now)
 *   - navigeert naar audit.html
 *
 * Refresh-strategie:
 *   - bij init
 *   - elke 60s polling
 *   - bij event besa:audit-updated (als auditDB geladen is)
 *   - bij visibilitychange terug naar visible
 *
 * Vereist: supabase-client.js (besaSupabase) + auth-guard.js (topbar populated).
 * Optioneel: audit-data.js voor instant-update via besa:audit-updated event.
 */
(function () {
  "use strict";

  if (!window.besaSupabase) return;
  if (window.besaAuth && typeof window.besaAuth.isEnabled === "function" && !window.besaAuth.isEnabled()) return;

  // Niet draaien op login.html (geen topbar; zou error't crashen)
  var p = (window.location.pathname || "").toLowerCase();
  var idx = p.lastIndexOf("/");
  var file = idx >= 0 ? p.slice(idx + 1) : p;
  if (file === "login.html") return;

  var LAST_SEEN_KEY = "besa:notification-bell:lastSeen";
  var FLOOD_ACK_KEY = "besa:notification-bell:flood-ack-v1";
  var POLL_INTERVAL_MS = 60 * 1000;
  var DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagen als geen lastSeen
  var REFRESH_LOCK_MS = 5000; // throttle dubbele refresh-calls
  var FLOOD_THRESHOLD = 1000; // > 1000 events = systeem-flood (Phase 3/4 import); auto-acknowledge

  var lastFetchAt = 0;
  var currentCount = 0;
  var pollTimer = null;
  var injected = false;

  function isoNow() { return new Date().toISOString(); }

  function getLastSeenIso() {
    try {
      var raw = window.localStorage.getItem(LAST_SEEN_KEY);
      if (raw) return raw;
    } catch (e) { /* */ }
    return new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString();
  }
  function setLastSeen(iso) {
    try { window.localStorage.setItem(LAST_SEEN_KEY, iso); } catch (e) { /* */ }
  }

  async function fetchUnreadCount() {
    if (!window.besaSupabase || !window.besaSupabase.from) return 0;
    var lastSeen = getLastSeenIso();
    var total = 0;
    try {
      var r1 = await window.besaSupabase
        .from("audit_log")
        .select("*", { count: "exact", head: true })
        .gt("aanmaakdatum", lastSeen);
      if (!r1.error && typeof r1.count === "number") total += r1.count;
    } catch (e) { /* zwijg — kan auth-error zijn die auth-guard al afhandelt */ }
    try {
      var r2 = await window.besaSupabase
        .from("beschikking_audit_log")
        .select("*", { count: "exact", head: true })
        .gt("t", lastSeen);
      if (!r2.error && typeof r2.count === "number") total += r2.count;
    } catch (e) { /* */ }
    return total;
  }

  function buildBellSvg() {
    return ''
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>'
      + '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
      + '</svg>';
  }

  function updateBellUi(count) {
    var counter = document.getElementById("besa-notification-counter");
    var bell = document.getElementById("besa-notification-bell");
    if (!counter || !bell) return;
    var n = Math.max(0, Number(count) || 0);
    counter.textContent = n > 99 ? "99+" : String(n);
    counter.style.display = n > 0 ? "inline-flex" : "none";
    bell.style.color = n > 0 ? "var(--blue)" : "var(--text-muted)";
    bell.setAttribute("aria-label", n > 0
      ? "Notificaties — " + n + " nieuw sinds laatst gezien"
      : "Notificaties — geen nieuwe");
  }

  async function refreshCount(force) {
    var now = Date.now();
    if (!force && now - lastFetchAt < REFRESH_LOCK_MS) return;
    lastFetchAt = now;
    try {
      currentCount = await fetchUnreadCount();
      // Flood detection: bij eerste load met > FLOOD_THRESHOLD events
      // (Phase 3/4 bulk imports veroorzaken duizenden audit-events) → auto-acknowledge.
      // User klikt anders nooit alles weg. Werkt eenmalig per browser (flag in localStorage).
      try {
        if (currentCount > FLOOD_THRESHOLD &&
            window.localStorage.getItem(FLOOD_ACK_KEY) !== "1") {
          setLastSeen(isoNow());
          window.localStorage.setItem(FLOOD_ACK_KEY, "1");
          currentCount = 0;
          console.info("[notification-bell] systeem-flood gedetecteerd; auto-acknowledge gedaan.");
        }
      } catch (e) { /* */ }
    } catch (e) {
      currentCount = 0;
    }
    updateBellUi(currentCount);
  }

  function injectBell() {
    if (injected) return;
    var topbar = document.querySelector(".topbar");
    if (!topbar) return;
    injected = true;

    var wrap = document.createElement("a");
    wrap.id = "besa-notification-bell";
    wrap.href = "audit.html";
    wrap.title = "Notificaties (audit-log)";
    wrap.setAttribute("role", "button");
    wrap.style.cssText = [
      "position:relative",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:36px",
      "height:36px",
      "border-radius:var(--r-pill)",
      "color:var(--text-muted)",
      "text-decoration:none",
      "margin-left:auto",
      "transition:background 0.15s ease, color 0.15s ease",
    ].join(";");

    wrap.innerHTML = buildBellSvg()
      + '<span id="besa-notification-counter" style="'
      + 'position:absolute;'
      + 'top:2px;right:0;'
      + 'min-width:18px;'
      + 'height:18px;'
      + 'padding:0 5px;'
      + 'background:var(--blue);'
      + 'color:#fff;'
      + 'font-size:var(--font-ui-badge);'
      + 'font-weight:700;'
      + 'border-radius:var(--r-pill);'
      + 'display:none;'
      + 'align-items:center;'
      + 'justify-content:center;'
      + 'line-height:1;'
      + '"></span>';

    wrap.addEventListener("mouseover", function () {
      wrap.style.background = "var(--blue-soft, rgba(37,99,235,0.08))";
    });
    wrap.addEventListener("mouseout", function () {
      wrap.style.background = "transparent";
    });

    wrap.addEventListener("click", function () {
      setLastSeen(isoNow());
      currentCount = 0;
      updateBellUi(0);
      // navigation gebeurt via href
    });

    // Plaats vóór de auth-badge. Als die er nog niet is, gewoon aan einde.
    var badge = document.getElementById("besa-auth-badge");
    if (badge && badge.parentElement === topbar) {
      // Schuif margin-left:auto naar de bell — auth-badge raakt z'n auto kwijt
      badge.style.marginLeft = "0";
      topbar.insertBefore(wrap, badge);
    } else {
      topbar.appendChild(wrap);
    }

    updateBellUi(currentCount);
    refreshCount(true);

    // Polling
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () { refreshCount(false); }, POLL_INTERVAL_MS);
  }

  function reinjectIfBadgeArrives() {
    // auth-guard injecteert de badge async — observe en re-order indien nodig.
    var observer = new MutationObserver(function () {
      var bell = document.getElementById("besa-notification-bell");
      var badge = document.getElementById("besa-auth-badge");
      if (bell && badge && badge.parentElement === bell.parentElement) {
        // Zorg dat bell vóór badge staat
        if (bell.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_PRECEDING) {
          badge.style.marginLeft = "0";
          badge.parentElement.insertBefore(bell, badge);
        }
        observer.disconnect();
      }
    });
    var topbar = document.querySelector(".topbar");
    if (topbar) observer.observe(topbar, { childList: true, subtree: false });
  }

  function init() {
    injectBell();
    reinjectIfBadgeArrives();

    window.addEventListener("besa:audit-updated", function () { refreshCount(true); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refreshCount(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
