/* global window, document */
/**
 * notifications.js — page-script voor notifications.html (full-page overzicht).
 *
 * BS2-parity: /notifications full-page with Ongelezen / Gelezen tabs.
 *
 * Vereist: notifications-data.js (window.notificationsDB) + auth-guard.js + profiles-data.js.
 */
(function () {
  "use strict";

  var currentTab = "ongelezen";

  function escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    var maanden = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return d.getDate() + " " + maanden[d.getMonth()] + " " + d.getFullYear();
  }

  function render() {
    var list = document.getElementById("notif-list");
    var empty = document.getElementById("notif-empty");
    if (!list) return;
    list.innerHTML = "";

    if (!window.notificationsDB) {
      empty.hidden = false;
      empty.textContent = "Notificaties laden mislukt — herlaad de pagina";
      return;
    }

    var items = window.notificationsDB.listSync();
    var filtered = items.filter(function (n) {
      return currentTab === "ongelezen" ? !n.is_read : n.is_read;
    });

    var unreadCount = items.filter(function (n) { return !n.is_read; }).length;
    var unreadBadge = document.getElementById("notif-tab-unread-count");
    if (unreadBadge) unreadBadge.textContent = String(unreadCount);

    if (filtered.length === 0) {
      empty.hidden = false;
      empty.textContent = currentTab === "ongelezen"
        ? "Geen ongelezen notificaties"
        : "Geen gelezen notificaties";
      return;
    }
    empty.hidden = true;

    filtered.forEach(function (n) {
      var row = document.createElement("article");
      row.className = "notif-row" + (n.is_read ? "" : " is-unread");
      row.dataset.notifId = n.id;
      row.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "gap:4px",
        "padding:14px 18px",
        "border-bottom:1px solid var(--line)",
        "cursor:pointer",
        "transition:background 0.15s ease",
      ].join(";");
      if (!n.is_read) {
        row.style.background = "var(--blue-soft, rgba(37,99,235,0.04))";
      }
      var unreadDot = n.is_read ? "" :
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--blue);margin-right:8px;vertical-align:middle"></span>';
      row.innerHTML = '<div style="font-size:14px;font-weight:500;line-height:1.4;color:var(--text)">'
        + unreadDot + escapeHtml(n.title) + '</div>'
        + (n.body ? '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">' + escapeHtml(n.body) + '</div>' : '')
        + '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + escapeHtml(formatTimeAgo(n.created_at)) + '</div>';

      row.addEventListener("mouseover", function () {
        row.style.background = n.is_read
          ? "var(--surface-alt, #f7f8fa)"
          : "var(--blue-soft, rgba(37,99,235,0.08))";
      });
      row.addEventListener("mouseout", function () {
        row.style.background = n.is_read
          ? "transparent"
          : "var(--blue-soft, rgba(37,99,235,0.04))";
      });
      row.addEventListener("click", function () {
        if (!n.is_read && window.notificationsDB && window.notificationsDB.markRead) {
          window.notificationsDB.markRead(n.id);
        }
        // Navigeer naar gerelateerd item indien beschikbaar
        if (n.related_entity_type === "nieuws" && n.related_entity_id) {
          window.location.href = "home.html?nieuws=" + encodeURIComponent(n.related_entity_id);
        }
      });
      list.appendChild(row);
    });
  }

  function attachTabs() {
    var tabs = document.querySelectorAll("#notif-tabs .filter-chip");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (tt) {
          tt.classList.remove("is-active");
          tt.setAttribute("aria-selected", "false");
        });
        t.classList.add("is-active");
        t.setAttribute("aria-selected", "true");
        currentTab = t.dataset.tab;
        render();
      });
    });
  }

  function attachMarkAll() {
    var btn = document.getElementById("notif-mark-all-read");
    if (!btn) return;
    btn.addEventListener("click", async function () {
      if (!window.notificationsDB) return;
      btn.disabled = true;
      try {
        await window.notificationsDB.markAllRead();
        if (window.showActionFeedback) window.showActionFeedback("saved", "Notificaties");
        render();
      } catch (e) {
        if (window.showError) window.showError("Markeren mislukt: " + e.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function handleHashJump() {
    var hash = window.location.hash || "";
    var m = hash.match(/^#notif-([\w-]+)$/);
    if (!m) return;
    var id = m[1];
    setTimeout(function () {
      var row = document.querySelector('.notif-row[data-notif-id="' + id + '"]');
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.style.outline = "2px solid var(--blue)";
        setTimeout(function () { row.style.outline = ""; }, 1500);
      }
    }, 200);
  }

  async function init() {
    attachTabs();
    attachMarkAll();
    if (window.notificationsDB) {
      try {
        await window.notificationsDB.ready;
      } catch (e) { /* */ }
      render();
      window.addEventListener("besa:notifications-updated", render);
      handleHashJump();
    } else {
      var empty = document.getElementById("notif-empty");
      if (empty) {
        empty.hidden = false;
        empty.textContent = "Notificaties-module niet geladen";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
