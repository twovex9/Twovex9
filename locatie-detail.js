/* locatie-detail.js — detailpagina locatie (Supabase data-laag via window.locatiesDB) */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var locId = params.get("id");

  if (!locId || !window.locatiesDB) {
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

  function findLocatieCached() {
    var list = window.locatiesDB.getAllSync() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === locId) return list[i];
    }
    return null;
  }

  var naamEl = document.getElementById("loc-hero-name");
  var countEl = document.getElementById("loc-medewerkers-count");
  var naamInput = document.getElementById("loc-detail-naam");
  var postcode = document.getElementById("loc-detail-postcode");
  var huisnummer = document.getElementById("loc-detail-huisnummer");
  var toevoeging = document.getElementById("loc-detail-toevoeging");
  var straat = document.getElementById("loc-detail-straat");
  var plaats = document.getElementById("loc-detail-plaats");

  function hydrate(loc) {
    if (!loc) return;
    if (naamEl) naamEl.textContent = loc.naam || "—";
    if (naamInput) naamInput.value = loc.naam || "";
    if (postcode) postcode.value = loc.postcode || "";
    if (huisnummer) huisnummer.value = loc.huisnummer || "";
    if (toevoeging) toevoeging.value = loc.toevoeging || "";
    if (straat) straat.value = loc.straat || "";
    if (plaats) plaats.value = loc.plaats || "";
    document.title = (loc.naam || "Locatie") + " — HR";
    if (countEl) countEl.textContent = String(countMedewerkersOpLocatie(loc.naam));
  }

  var qrBtn = document.getElementById("loc-detail-qr-btn");
  if (qrBtn) {
    qrBtn.addEventListener("click", function () {
      showToast("QR-code wordt gegenereerd…");
    });
  }

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
        if (panels[k]) panels[k].style.display = k === key ? "" : "none";
      });
    });
  });

  var saveBtn = document.getElementById("loc-detail-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
      var newName = naamInput ? naamInput.value.trim() : "";
      if (!newName) {
        if (naamInput) naamInput.focus();
        return;
      }
      var patch = {
        naam: newName,
        postcode: postcode ? postcode.value.trim() : "",
        huisnummer: huisnummer ? huisnummer.value.trim() : "",
        toevoeging: toevoeging ? toevoeging.value.trim() : "",
        straat: straat ? straat.value.trim() : "",
        plaats: plaats ? plaats.value.trim() : "",
      };
      var updated;
      try {
        updated = await window.locatiesDB.update(locId, patch);
      } catch (err) {
        console.error("Locatie opslaan mislukt:", err);
        showToast("Opslaan is niet gelukt");
        return;
      }
      if (!updated) {
        showToast("Opslaan is niet gelukt");
        return;
      }
      hydrate(updated);
      if (typeof showSaveModal === "function") showSaveModal("Adres is opgeslagen.");
      else showToast("adres opgeslagen");
    });
  }

  function tryInitialRender() {
    var loc = findLocatieCached();
    if (loc) {
      hydrate(loc);
      return true;
    }
    return false;
  }

  window.addEventListener("besa:locaties-updated", function () {
    var loc = findLocatieCached();
    if (!loc) {
      window.location.href = "locaties.html";
      return;
    }
    hydrate(loc);
  });

  if (!tryInitialRender()) {
    if (naamEl) naamEl.textContent = "Laden…";
    Promise.resolve(window.locatiesDB.ready).catch(function () { /* error reeds gelogd */ });
  }
})();
