/* home-beza.js — Beza Design System: niet-destructieve verrijking van de
 * homepagina. Vult uitsluitend NIEUWE, lege containers:
 *   1. het datum-label boven de begroeting (vandaag, NL, lowercase)
 *   2. de sectie "acties vereist" op basis van ECHTE signalen
 *      (ontbrekende voornaam in profiel + ongelezen notificaties)
 *
 * Voegt niets hardcoded toe en verwijdert/wijzigt geen bestaande inhoud.
 * Volledig defensief: faalt stil (alleen console.warn), nooit een throw.
 * Eén `git revert` van de commit verwijdert dit bestand weer volledig.
 */
(function () {
  "use strict";

  function safe(fn) {
    try { return fn(); } catch (e) { return undefined; }
  }

  function setGreetingDate() {
    var el = document.getElementById("beza-greet-date");
    if (!el) return;
    var txt = safe(function () {
      return new Date().toLocaleDateString("nl-NL", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      });
    });
    if (txt) el.textContent = String(txt).toLowerCase();
  }

  function getMissingFirstName() {
    // Echt signaal: ingelogd profiel zonder voornaam (zelfde bron als home.js).
    var db = window.profilesDB;
    if (!db || typeof db.getCurrentSync !== "function") return false;
    var prof = safe(function () { return db.getCurrentSync(); });
    if (!prof) return false;
    var first = String(prof.voornaam || "").trim();
    return first.length === 0;
  }

  function getUnreadCount() {
    // Echt signaal: ongelezen notificaties (zelfde bron als de bel).
    var db = window.notificationsDB;
    if (!db || typeof db.countUnreadSync !== "function") return 0;
    var n = safe(function () { return db.countUnreadSync(); });
    n = Number(n);
    return isFinite(n) && n > 0 ? n : 0;
  }

  var ICON_USER = '<svg class="beza-ic-sm" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/></svg>';
  var ICON_BELL = '<svg class="beza-ic-sm" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function buildActions() {
    var actions = [];
    if (getMissingFirstName()) {
      actions.push({
        variant: "info",
        icon: ICON_USER,
        text: "Vul je voornaam in via Instellingen voor een persoonlijke begroeting",
        href: "instellingen.html"
      });
    }
    var unread = getUnreadCount();
    if (unread > 0) {
      actions.push({
        variant: "info",
        icon: ICON_BELL,
        text: unread === 1
          ? "Je hebt 1 ongelezen notificatie"
          : "Je hebt " + unread + " ongelezen notificaties",
        href: "notifications.html"
      });
    }
    return actions;
  }

  function renderActions() {
    var section = document.getElementById("beza-acties-section");
    var list = document.getElementById("beza-acties-list");
    var meta = document.getElementById("beza-acties-meta");
    if (!section || !list) return;

    var actions = buildActions();
    if (actions.length === 0) {
      // Eerlijk: geen openstaande acties → sectie verbergen (niets verzinnen).
      section.setAttribute("hidden", "");
      list.innerHTML = "";
      if (meta) meta.textContent = "";
      return;
    }

    list.innerHTML = "";
    actions.forEach(function (a) {
      var el = document.createElement("a");
      el.className = "beza-action-item beza-action-item--" + a.variant;
      el.setAttribute("href", a.href);
      el.innerHTML =
        a.icon +
        '<span class="beza-action-text"></span>' +
        '<span class="beza-action-arrow" aria-hidden="true">→</span>';
      el.querySelector(".beza-action-text").textContent = a.text;
      list.appendChild(el);
    });
    if (meta) {
      meta.textContent = actions.length === 1 ? "1 item" : actions.length + " items";
    }
    section.removeAttribute("hidden");
  }

  function refresh() {
    safe(setGreetingDate);
    safe(renderActions);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }

  // Async data-lagen (profiles/notifications) bootstrappen later — opnieuw
  // renderen zodra hun events binnenkomen, plus enkele vangnet-timers.
  ["besa:profile-updated", "besa:notifications-updated",
   "besa:notificaties-updated", "besa:nieuws-updated"].forEach(function (evt) {
    window.addEventListener(evt, refresh);
  });
  setTimeout(refresh, 800);
  setTimeout(refresh, 2500);
})();
