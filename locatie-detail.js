/* locatie-detail.js — detailpagina locatie (koppelt aan locaties-data.js) */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var locId = params.get("id");

  if (!locId) {
    window.location.href = "locaties.html";
    return;
  }

  /** Zelfde patroon als medewerker.js showToast: blur + gecentreerde kaart */
  function showToast(message) {
    var backdrop = document.getElementById("app-toast-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "app-toast-backdrop";
      backdrop.className = "app-toast-backdrop";
      document.body.appendChild(backdrop);
    }
    var toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "app-toast app-toast--centered";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    backdrop.classList.remove("is-visible");
    toast.classList.remove("is-visible");
    void backdrop.offsetWidth;
    void toast.offsetWidth;
    backdrop.classList.add("is-visible");
    toast.classList.add("is-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      if (toast) toast.classList.remove("is-visible");
      if (backdrop) backdrop.classList.remove("is-visible");
    }, 2200);
  }

  function countMedewerkersOpLocatie(naam) {
    if (!naam) return 0;
    try {
      var raw = localStorage.getItem("employees");
      if (!raw) return 0;
      var emps = JSON.parse(raw);
      if (!Array.isArray(emps)) return 0;
      var n = naam.trim().toLowerCase();
      return emps.filter(function (e) {
        var tags = (e.locatiesTags || e.locatiesSelected || "").toString().toLowerCase();
        if (tags && tags.indexOf(n) !== -1) return true;
        if (Array.isArray(e.locatiesSelected) && e.locatiesSelected.some(function (x) { return String(x).toLowerCase() === n; })) return true;
        return false;
      }).length;
    } catch (e) {
      return 0;
    }
  }

  function findLocatie() {
    var list = getLocaties();
    return list.filter(function (o) { return o.id === locId; })[0];
  }

  var loc = findLocatie();
  if (!loc) {
    window.location.href = "locaties.html";
    return;
  }

  var naamEl = document.getElementById("loc-hero-name");
  var countEl = document.getElementById("loc-medewerkers-count");
  var naamInput = document.getElementById("loc-detail-naam");
  var postcode = document.getElementById("loc-detail-postcode");
  var huisnummer = document.getElementById("loc-detail-huisnummer");
  var toevoeging = document.getElementById("loc-detail-toevoeging");
  var straat = document.getElementById("loc-detail-straat");
  var plaats = document.getElementById("loc-detail-plaats");

  function hydrate() {
    naamEl.textContent = loc.naam || "—";
    naamInput.value = loc.naam || "";
    postcode.value = loc.postcode || "";
    huisnummer.value = loc.huisnummer || "";
    toevoeging.value = loc.toevoeging || "";
    straat.value = loc.straat || "";
    plaats.value = loc.plaats || "";
    document.title = (loc.naam || "Locatie") + " — HR";
    countEl.textContent = String(countMedewerkersOpLocatie(loc.naam));
  }

  hydrate();

  document.getElementById("loc-detail-qr-btn").addEventListener("click", function () {
    showToast("QR-code wordt gegenereerd…");
  });

  var tabs = document.querySelectorAll(".emp-tab[data-tab]");
  var panels = {
    details: document.getElementById("loc-tab-details"),
    medewerkers: document.getElementById("loc-tab-medewerkers"),
  };

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("is-active"); });
      tab.classList.add("is-active");
      var key = tab.getAttribute("data-tab");
      Object.keys(panels).forEach(function (k) {
        panels[k].style.display = k === key ? "" : "none";
      });
    });
  });

  document.getElementById("loc-detail-save").addEventListener("click", function () {
    var newName = naamInput.value.trim();
    if (!newName) {
      naamInput.focus();
      return;
    }

    var all = getLocaties();
    var idx = all.findIndex(function (o) { return o.id === locId; });
    if (idx === -1) return;

    var row = all[idx];
    row.naam = newName;
    row.postcode = postcode ? postcode.value.trim() : "";
    row.huisnummer = huisnummer ? huisnummer.value.trim() : "";
    row.toevoeging = toevoeging ? toevoeging.value.trim() : "";
    row.straat = straat ? straat.value.trim() : "";
    row.plaats = plaats ? plaats.value.trim() : "";
    row.adres = locComposeAdres(row);
    row.laatstGewijzigd = new Date().toISOString();

    saveLocaties(all);
    loc = row;

    naamEl.textContent = newName;
    document.title = newName + " — HR";
    countEl.textContent = String(countMedewerkersOpLocatie(newName));
    if (typeof showSaveModal === "function") showSaveModal("Adres is opgeslagen.");
    else showToast("adres opgeslagen");
  });
})();
