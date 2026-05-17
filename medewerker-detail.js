/* global window, document */
/**
 * medewerker-detail.js — page-script voor /medewerker-detail.html.
 *
 * TOP-BAR Medewerkers (BS2 /main-employee/employee-details/{id}).
 * APART van HR-medewerker.js. Profielkaart + Verzuim-tab, 1-op-1 BS2.
 */
(function () {
  "use strict";

  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]+)").exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function fmtNlDate(iso) {
    if (!iso) return "";
    var s = String(iso);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return Number(m[3]) + "-" + Number(m[2]) + "-" + m[1];
    var t = Date.parse(s);
    if (!isFinite(t)) return "";
    var d = new Date(t);
    return d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear();
  }

  // Verjaardag-countdown (BS2: "X Dagen" / "Y Uren"). Diff van nu tot de
  // eerstvolgende verjaardag (om middernacht). Live geverifieerd vs BS2.
  function birthdayCountdown(dobIso) {
    if (!dobIso) return { days: null, hours: 0 };
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dobIso));
    if (!m) return { days: null, hours: 0 };
    var now = new Date();
    var month = Number(m[2]) - 1;
    var day = Number(m[3]);
    var year = now.getFullYear();
    var next = new Date(year, month, day, 0, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next = new Date(year + 1, month, day, 0, 0, 0, 0);
    var diff = next.getTime() - now.getTime();
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    return { days: days, hours: hours };
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function renderSickPanel(emp) {
    var panel = document.getElementById("me-verzuim-panel");
    if (!panel) return;
    if (emp.isSick) {
      panel.innerHTML =
        '<div class="me-sick-active">Actief ziekteverzuim — eerste ziektedag: <strong>' +
        (fmtNlDate(emp.sicknessStartDate) || "onbekend") + "</strong></div>" +
        '<p>Beëindig het verzuim wanneer de medewerker hersteld is.</p>' +
        '<button type="button" class="btn-primary" id="me-verzuim-end-btn">Verzuim beëindigen</button>';
      var endBtn = document.getElementById("me-verzuim-end-btn");
      if (endBtn) endBtn.addEventListener("click", function () { endSick(emp.id); });
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
    if (!emp) {
      setText("me-name", "Medewerker niet gevonden");
      return;
    }
    current = emp;
    document.title = emp.fullName + " — Medewerker";
    setText("me-name", emp.fullName || "—");
    setText("me-email-sub", emp.email || "");
    setText("me-phone", emp.phone || "—");
    setText("me-email", emp.email || "—");
    setText("me-number", emp.employeeNumber == null ? "—" : "#" + emp.employeeNumber);
    setText("me-end-date", emp.employmentEndDate ? fmtNlDate(emp.employmentEndDate) : "-");
    setText("me-bday", emp.dateOfBirth ? fmtNlDate(emp.dateOfBirth) : "—");
    var cd = birthdayCountdown(emp.dateOfBirth);
    setText("me-bday-days", (cd.days == null ? "—" : cd.days) + " Dagen");
    setText("me-bday-hours", cd.hours + " Uren");
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

  async function endSick(id) {
    try {
      var updated = await window.mainEmployeesDB.endSickness(id);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Verzuim beëindigd");
      renderEmployee(updated || window.mainEmployeesDB.getByIdSync(id));
    } catch (err) {
      if (window.showError) window.showError("Verzuim beëindigen mislukt: " + (err && err.message || err));
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
