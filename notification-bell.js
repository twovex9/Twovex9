/* global window, document */
/**
 * notification-bell.js — Notificatie-bel in topbar met dropdown + tabs (BS2-parity).
 *
 * Bron: public.notifications + public.notification_reads (via window.notificationsDB).
 *
 * UI:
 *   - Bel-icoon in topbar (vóór auth-badge) met count-badge (ongelezen-count)
 *   - Klik op bel → opent dropdown met 2 tabs: Ongelezen / Gelezen
 *   - Per notification: titel + time-ago
 *   - Footer: "{N} notificatie(s)" + "Alles bekijken" link → notifications.html
 *   - Klik op een ongelezen notification → markeer als gelezen + open detail
 *
 * BS2-equivalent: floating dropdown rechtsboven (zie docs/bs2-scrape/01-home/structure.md)
 *
 * Refresh: bij init, bij besa:notifications-updated event, bij visibilitychange,
 *          bij polling elke 60s.
 */
(function () {
  "use strict";

  if (!window.besaSupabase) return;
  if (window.besaAuth && typeof window.besaAuth.isEnabled === "function" && !window.besaAuth.isEnabled()) return;

  // Niet draaien op login.html
  var p = (window.location.pathname || "").toLowerCase();
  var idx = p.lastIndexOf("/");
  var file = idx >= 0 ? p.slice(idx + 1) : p;
  if (file === "login.html") return;

  var POLL_INTERVAL_MS = 60 * 1000;

  var pollTimer = null;
  var injected = false;
  var dropdownOpen = false;

  function buildBellSvg() {
    return ''
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>'
      + '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
      + '</svg>';
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var diffMs = Date.now() - d.getTime();
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Nu";
    if (diffMin < 60) return diffMin + " min geleden";
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH + " uur geleden";
    var diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Gisteren";
    if (diffD < 7) return diffD + " dagen geleden";
    if (diffD < 14) return "Vorige week";
    // Format als "dd mmm" Dutch
    var maanden = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return d.getDate() + " " + maanden[d.getMonth()];
  }

  function escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateCounter() {
    var counter = document.getElementById("besa-notification-counter");
    var bell = document.getElementById("besa-notification-bell");
    if (!counter || !bell) return;
    var n = window.notificationsDB ? window.notificationsDB.countUnreadSync() : 0;
    counter.textContent = n > 99 ? "99+" : String(n);
    counter.style.display = n > 0 ? "inline-flex" : "none";
    bell.style.color = n > 0 ? "var(--blue)" : "var(--text-muted)";
    bell.setAttribute("aria-label", n > 0
      ? "Notificaties — " + n + " ongelezen"
      : "Notificaties — geen ongelezen");
  }

  function buildDropdown() {
    var existing = document.getElementById("besa-notification-dropdown");
    if (existing) existing.remove();

    var dd = document.createElement("div");
    dd.id = "besa-notification-dropdown";
    dd.setAttribute("role", "menu");
    dd.setAttribute("aria-label", "Notificaties");
    dd.style.cssText = [
      "position:absolute",
      "top:calc(100% + 8px)",
      "right:0",
      "min-width:360px",
      "max-width:420px",
      "max-height:480px",
      "background:var(--surface,#fff)",
      "border:1px solid var(--line)",
      "border-radius:var(--r-lg)",
      "box-shadow:0 8px 24px rgba(0,0,0,0.12)",
      "z-index:1000",
      "display:flex",
      "flex-direction:column",
      "overflow:hidden",
    ].join(";");

    // Klikken binnen de dropdown niet laten doorbubbelen naar de bel-knop:
    // de dropdown is een child van <button id="besa-notification-bell">, dus
    // zonder dit sluit elke klik (bv. op de tab "Gelezen") de dropdown meteen.
    dd.addEventListener("click", function (e) { e.stopPropagation(); });

    var items = window.notificationsDB ? window.notificationsDB.listSync() : [];
    var unread = items.filter(function (n) { return !n.is_read; });
    var read = items.filter(function (n) { return n.is_read; });

    var header = document.createElement("div");
    header.style.cssText = "padding:14px 16px 0 16px;font-weight:600;font-size:var(--font-h2,15px);color:var(--text)";
    header.textContent = "Notificaties";
    dd.appendChild(header);

    var tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:0;border-bottom:1px solid var(--line);padding:8px 16px 0 16px";
    var tabOngelezen = document.createElement("button");
    tabOngelezen.type = "button";
    tabOngelezen.className = "besa-notif-tab is-active";
    tabOngelezen.dataset.tab = "ongelezen";
    tabOngelezen.innerHTML = 'Ongelezen <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;padding:0 5px;background:var(--blue);color:#fff;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;margin-left:6px">' + unread.length + '</span>';
    var tabGelezen = document.createElement("button");
    tabGelezen.type = "button";
    tabGelezen.className = "besa-notif-tab";
    tabGelezen.dataset.tab = "gelezen";
    tabGelezen.textContent = "Gelezen";
    [tabOngelezen, tabGelezen].forEach(function (t) {
      t.style.cssText = "padding:8px 12px;border:0;background:transparent;cursor:pointer;font-size:13px;color:var(--text-secondary);border-bottom:2px solid transparent;margin-bottom:-1px";
      if (t.classList.contains("is-active")) {
        t.style.color = "var(--text)";
        t.style.borderBottomColor = "var(--blue)";
        t.style.fontWeight = "600";
      }
      tabs.appendChild(t);
    });
    dd.appendChild(tabs);

    var list = document.createElement("div");
    list.id = "besa-notif-list";
    list.style.cssText = "flex:1;overflow-y:auto;padding:4px 0";
    dd.appendChild(list);

    function renderList(tab) {
      list.innerHTML = "";
      var data = tab === "ongelezen" ? unread.slice(0, 8) : read.slice(0, 8);
      if (data.length === 0) {
        var empty = document.createElement("div");
        empty.style.cssText = "padding:24px 16px;text-align:center;color:var(--text-muted);font-size:13px";
        empty.textContent = tab === "ongelezen" ? "Geen ongelezen notificaties" : "Geen gelezen notificaties";
        list.appendChild(empty);
        return;
      }
      data.forEach(function (n) {
        var row = document.createElement("a");
        row.href = "notifications.html#notif-" + n.id;
        row.dataset.notifId = n.id;
        row.style.cssText = "display:flex;flex-direction:column;gap:2px;padding:10px 16px;border-bottom:1px solid var(--line);cursor:pointer;text-decoration:none;color:var(--text);transition:background 0.15s ease";
        if (!n.is_read) {
          row.style.background = "var(--blue-soft,rgba(37,99,235,0.05))";
        }
        row.innerHTML = '<div style="font-size:13px;font-weight:500;line-height:1.4">' + escapeHtml(n.title) + '</div>'
          + '<div style="font-size:11px;color:var(--text-muted)">' + escapeHtml(formatTimeAgo(n.created_at)) + '</div>';
        row.addEventListener("mouseover", function () {
          row.style.background = n.is_read ? "var(--surface-alt,#f7f8fa)" : "var(--blue-soft,rgba(37,99,235,0.08))";
        });
        row.addEventListener("mouseout", function () {
          row.style.background = n.is_read ? "transparent" : "var(--blue-soft,rgba(37,99,235,0.05))";
        });
        row.addEventListener("click", function (e) {
          // Markeer als gelezen voor navigation, maar laat href doorgaan
          if (!n.is_read && window.notificationsDB && window.notificationsDB.markRead) {
            window.notificationsDB.markRead(n.id);
          }
        });
        list.appendChild(row);
      });
    }

    renderList("ongelezen");

    tabs.addEventListener("click", function (e) {
      var t = e.target.closest(".besa-notif-tab");
      if (!t) return;
      [tabOngelezen, tabGelezen].forEach(function (tab) {
        tab.classList.remove("is-active");
        tab.style.color = "var(--text-secondary)";
        tab.style.borderBottomColor = "transparent";
        tab.style.fontWeight = "normal";
      });
      t.classList.add("is-active");
      t.style.color = "var(--text)";
      t.style.borderBottomColor = "var(--blue)";
      t.style.fontWeight = "600";
      renderList(t.dataset.tab);
    });

    var footer = document.createElement("div");
    footer.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--line);background:var(--surface-alt,#fafbfc)";
    var countTxt = document.createElement("span");
    countTxt.style.cssText = "font-size:12px;color:var(--text-muted)";
    countTxt.textContent = items.length + " notificatie" + (items.length === 1 ? "" : "s");
    var alleBtn = document.createElement("a");
    alleBtn.href = "notifications.html";
    alleBtn.className = "btn-outline";
    alleBtn.style.cssText = "padding:6px 12px;font-size:12px;text-decoration:none";
    alleBtn.textContent = "Alles bekijken";
    footer.appendChild(countTxt);
    footer.appendChild(alleBtn);
    dd.appendChild(footer);

    return dd;
  }

  function closeDropdown() {
    var dd = document.getElementById("besa-notification-dropdown");
    if (dd) dd.remove();
    dropdownOpen = false;
  }

  function openDropdown() {
    var bell = document.getElementById("besa-notification-bell");
    if (!bell) return;
    closeDropdown();
    var dd = buildDropdown();
    bell.appendChild(dd);
    dropdownOpen = true;
    // Markeer alle ongelezen als gelezen? BS2 doet dit niet automatisch — bell-klik
    // toont alleen overzicht. Markering gebeurt per-notification-klik.
    setTimeout(function () {
      document.addEventListener("click", outsideClickHandler, { once: true });
    }, 0);
  }

  function outsideClickHandler(e) {
    var bell = document.getElementById("besa-notification-bell");
    if (bell && !bell.contains(e.target)) {
      closeDropdown();
    } else {
      document.addEventListener("click", outsideClickHandler, { once: true });
    }
  }

  function injectBell() {
    if (injected) return;
    var topbar = document.querySelector(".topbar");
    if (!topbar) return;
    injected = true;

    var wrap = document.createElement("button");
    wrap.id = "besa-notification-bell";
    wrap.type = "button";
    wrap.title = "Notificaties";
    wrap.setAttribute("aria-label", "Notificaties");
    wrap.setAttribute("aria-haspopup", "menu");
    wrap.setAttribute("aria-expanded", "false");
    wrap.style.cssText = [
      "position:relative",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:36px",
      "height:36px",
      "border:0",
      "border-radius:var(--r-pill)",
      "background:transparent",
      "color:var(--text-muted)",
      "cursor:pointer",
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

    wrap.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (dropdownOpen) {
        closeDropdown();
        wrap.setAttribute("aria-expanded", "false");
      } else {
        openDropdown();
        wrap.setAttribute("aria-expanded", "true");
      }
    });

    var badge = document.getElementById("besa-auth-badge");
    if (badge && badge.parentElement === topbar) {
      badge.style.marginLeft = "0";
      topbar.insertBefore(wrap, badge);
    } else {
      topbar.appendChild(wrap);
    }

    updateCounter();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (window.notificationsDB) window.notificationsDB.refresh().then(updateCounter);
    }, POLL_INTERVAL_MS);
  }

  function reinjectIfBadgeArrives() {
    var observer = new MutationObserver(function () {
      var bell = document.getElementById("besa-notification-bell");
      var badge = document.getElementById("besa-auth-badge");
      if (bell && badge && badge.parentElement === bell.parentElement) {
        // De bel houdt margin-left:auto en duwt het paar naar rechts.
        // De badge MOET margin-left:0 krijgen — anders verdelen twee
        // auto-marges de vrije ruimte en valt er een gat tussen de bel
        // en de avatar. Altijd doen, ook als de volgorde al klopt.
        badge.style.marginLeft = "0";
        if (bell.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_PRECEDING) {
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

    window.addEventListener("besa:notifications-updated", updateCounter);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && window.notificationsDB) {
        window.notificationsDB.refresh().then(updateCounter);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
