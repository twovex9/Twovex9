/* global window, document */
/**
 * medewerker-detail.js — page-script voor /medewerker-detail.html.
 *
 * TOP-BAR Medewerkers (BS2 /main-employee/employee-details/{id}/sickness).
 * 1-op-1 BS2: profielkaart + Verzuim-tab.
 *  - Verjaardag-countdown: 3 pills "X Maanden" (alleen als >0) · "Y Dagen" ·
 *    "Z Uren" — midnight→midnight tot eerstvolgende verjaardag (BS2 toont
 *    consequent 0 Uren). Live geverifieerd vs BS2 (Adriana = 1/14/0).
 *  - Verzuim niet-ziek: "Registreer een nieuw ziekteverzuim…" + "+ Verzuim
 *    toevoegen". Ziek: rode knop "Medewerker is ziek" + "Verzuim begonnen op
 *    DD-MM-YYYY" (Europe/Amsterdam).
 */
(function () {
  "use strict";

  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]+)").exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  // Verjaardag: BS2 toont de EERSTVOLGENDE verjaardag-datum (dag-maand van
  // geboortedatum + jaar van de eerstvolgende verjaardag), formaat d-m-jjjj
  // zonder voorloopnullen, bv. dob 1997-07-01 → "1-7-2026".
  function fmtBday(iso) {
    if (!iso) return "—";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return "—";
    var month = Number(m[2]) - 1;
    var day = Number(m[3]);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var next = new Date(today.getFullYear(), month, day);
    if (next.getTime() <= today.getTime()) next = new Date(today.getFullYear() + 1, month, day);
    return next.getDate() + "-" + (next.getMonth() + 1) + "-" + next.getFullYear();
  }

  // Verzuim-startdatum: BS2 toont DD-MM-JJJJ in Europe/Amsterdam
  // (raw "2025-02-18T23:00:00Z" → "19-02-2025").
  function fmtVerzuimDate(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (!isFinite(t)) {
      var mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
      return mm ? mm[3] + "-" + mm[2] + "-" + mm[1] : "";
    }
    try {
      var parts = new Intl.DateTimeFormat("nl-NL", {
        timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric",
      }).formatToParts(new Date(t));
      var g = {};
      parts.forEach(function (p) { g[p.type] = p.value; });
      return g.day + "-" + g.month + "-" + g.year;
    } catch (e) {
      var d = new Date(t);
      var pad = function (n) { return String(n).padStart(2, "0"); };
      return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear();
    }
  }

  // Countdown tot eerstvolgende verjaardag — BS2-formule, afgeleid uit live
  // datapunten (Adriana 1997-07-01): maanden+dagen op DATUM-ONLY vanaf
  // VANDAAG → kalender-maanden dan resterende dagen; uren = hele uren tot
  // de EERSTVOLGENDE lokale middernacht (los van de verjaardag).
  //   2026-05-17 23:xx → 1 Maanden/14 Dagen/0 Uren
  //   2026-05-18 ~11u  → 1 Maanden/13 Dagen/13 Uren  (beide geverifieerd)
  function birthdayCountdown(dobIso) {
    if (!dobIso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dobIso));
    if (!m) return null;
    var now = new Date();
    var month = Number(m[2]) - 1;
    var day = Number(m[3]);
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var next = new Date(today.getFullYear(), month, day);
    if (next.getTime() <= today.getTime()) next = new Date(today.getFullYear() + 1, month, day);
    var months = 0;
    var cur = new Date(today.getTime());
    while (true) {
      var step = new Date(cur.getTime());
      step.setMonth(step.getMonth() + 1);
      if (step.getTime() <= next.getTime()) { cur = step; months += 1; } else break;
    }
    var days = Math.round((next.getTime() - cur.getTime()) / 86400000);
    var nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    var hours = Math.floor((nextMidnight.getTime() - now.getTime()) / 3600000);
    if (hours < 0) hours = 0;
    if (hours > 23) hours = 23;
    return { months: months, days: days, hours: hours };
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function renderBdayPills(emp) {
    var box = document.getElementById("me-bday-pills");
    if (!box) return;
    var cd = birthdayCountdown(emp.dateOfBirth);
    if (!cd) { box.innerHTML = ""; return; }
    var pills = [];
    if (cd.months > 0) pills.push(cd.months + " Maanden");
    pills.push(cd.days + " Dagen");
    pills.push(cd.hours + " Uren");
    box.innerHTML = pills.map(function (p) { return '<span class="me-pill">' + p + "</span>"; }).join("");
  }

  function renderSickPanel(emp) {
    var panel = document.getElementById("me-verzuim-panel");
    if (!panel) return;
    if (emp.isSick) {
      panel.innerHTML =
        "<h2>Verzuim</h2>" +
        '<button type="button" class="me-sick-btn">Medewerker is ziek</button>' +
        "<p>Verzuim begonnen op " + (fmtVerzuimDate(emp.sicknessStartDate) || "onbekend") + "</p>";
    } else {
      panel.innerHTML =
        "<h2>Verzuim</h2>" +
        "<p>Registreer een nieuw ziekteverzuim voor deze medewerker.</p>" +
        '<button type="button" class="btn-primary" id="me-verzuim-add-btn">+ Verzuim toevoegen</button>';
      var addBtn = document.getElementById("me-verzuim-add-btn");
      if (addBtn) addBtn.addEventListener("click", openSickModal);
    }
  }

  var current = null;

  function renderEmployee(emp) {
    if (!emp) { setText("me-name", "Medewerker niet gevonden"); return; }
    current = emp;
    document.title = emp.fullName + " — Medewerker";
    setText("me-name", emp.fullName || "—");
    setText("me-email-sub", emp.email || "");
    setText("me-phone", emp.phone || "—");
    setText("me-email", emp.email || "—");
    setText("me-number", emp.employeeNumber == null ? "—" : "#" + emp.employeeNumber);
    setText("me-end-date", emp.employmentEndDate ? fmtVerzuimDate(emp.employmentEndDate) : "-");
    setText("me-bday", emp.dateOfBirth ? fmtBday(emp.dateOfBirth) : "—");
    renderBdayPills(emp);
    renderSickPanel(emp);
  }

  function load() {
    var id = qs("id");
    if (!id) { setText("me-name", "Geen medewerker geselecteerd"); return; }
    var emp = window.mainEmployeesDB && window.mainEmployeesDB.getByIdSync(id);
    if (emp) renderEmployee(emp);
    if (window.mainEmployeesDB) {
      window.mainEmployeesDB.ready.then(function () {
        var e2 = window.mainEmployeesDB.getByIdSync(id);
        if (e2) renderEmployee(e2);
        else if (!emp) setText("me-name", "Medewerker niet gevonden");
      });
    }
  }

  function openSickModal() {
    var modal = document.getElementById("me-sick-modal");
    if (!modal) return;
    var inp = document.getElementById("me-sick-date");
    if (inp) {
      var d = new Date();
      inp.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    modal.removeAttribute("hidden"); modal.setAttribute("aria-hidden", "false");
  }
  function closeSickModal() {
    var modal = document.getElementById("me-sick-modal");
    if (modal) { modal.setAttribute("hidden", ""); modal.setAttribute("aria-hidden", "true"); }
  }

  async function confirmSick() {
    if (!current) return;
    var inp = document.getElementById("me-sick-date");
    var iso = inp && inp.value ? inp.value : null;
    try {
      var updated = await window.mainEmployeesDB.registerSickness(current.id, iso);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Verzuim geregistreerd");
      closeSickModal();
      renderEmployee(updated || window.mainEmployeesDB.getByIdSync(current.id));
    } catch (err) {
      if (window.showError) window.showError("Verzuim opslaan mislukt: " + (err && err.message || err));
    }
  }

  function wire() {
    var back = document.getElementById("me-back-btn");
    if (back) back.addEventListener("click", function () { window.location.href = "medewerkers-overzicht.html"; });
    var addBtn = document.getElementById("me-verzuim-add-btn");
    if (addBtn) addBtn.addEventListener("click", openSickModal);
    var sc = document.getElementById("me-sick-close-btn");
    if (sc) sc.addEventListener("click", closeSickModal);
    var sx = document.getElementById("me-sick-cancel-btn");
    if (sx) sx.addEventListener("click", closeSickModal);
    var sok = document.getElementById("me-sick-confirm-btn");
    if (sok) sok.addEventListener("click", confirmSick);
    var modal = document.getElementById("me-sick-modal");
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeSickModal(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && modal && !modal.hasAttribute("hidden")) { ev.stopPropagation(); closeSickModal(); }
    });
    window.addEventListener("besa:main-employees-updated", function () {
      var id = qs("id");
      var e = window.mainEmployeesDB && window.mainEmployeesDB.getByIdSync(id);
      if (e) renderEmployee(e);
    });
  }

  function init() {
    if (!window.mainEmployeesDB) { console.error("[medewerker-detail] mainEmployeesDB niet geladen"); return; }
    wire();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
