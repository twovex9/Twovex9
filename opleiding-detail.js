/**
 * Opleiding-detailpagina (HR module).
 *
 * Reads en writes lopen via window.opleidingenDB. Bij eerste laden proberen
 * we de cache te gebruiken; als die nog leeg is wachten we op het update-
 * event dat de data-laag dispatched zodra Supabase-data binnen is.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var oplId = params.get("id");

  if (!oplId) {
    window.location.href = "opleidingen.html";
    return;
  }

  var ITEMS_KEY = "employeeItems";
  var EDITS_KEY = "employeeEditsById";

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function getOpleidingenCached() {
    if (window.opleidingenDB && typeof window.opleidingenDB.getAllSync === "function") {
      return window.opleidingenDB.getAllSync();
    }
    try {
      var raw = localStorage.getItem("opleidingen");
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function findOpleiding() {
    return getOpleidingenCached().filter(function (o) { return o.id === oplId; })[0];
  }

  function mergedEmployees() {
    // Stage 6: bron-van-waarheid is medewerkersDB (Supabase). Daar zitten
    // edits al in de row.data jsonb. Lokale items+edits-merge is alleen
    // nog een fallback voor pre-migratie clients.
    if (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function") {
      try {
        var fromDb = window.medewerkersDB.getAllSync();
        if (Array.isArray(fromDb) && fromDb.length) return fromDb;
      } catch (e) { /* fall back to localStorage */ }
    }
    var items = readJson(ITEMS_KEY, []);
    if (!Array.isArray(items)) items = [];
    var edits = readJson(EDITS_KEY, {});
    if (!edits || typeof edits !== "object") edits = {};
    return items.map(function (item) {
      var id = item.id || item.empId;
      var e = edits[id];
      return e ? Object.assign({}, item, e) : item;
    });
  }

  function normNaam(s) {
    return String(s || "").trim().toLowerCase();
  }

  function employeeHasOpleidingNaam(emp, naamNorm) {
    function inItems(arr) {
      if (!Array.isArray(arr)) return false;
      return arr.some(function (x) {
        var n = x && typeof x === "object" ? x.naam : x;
        return normNaam(n) === naamNorm;
      });
    }
    if (inItems(emp.opleidingItemsSkj)) return true;
    if (inItems(emp.opleidingItemsTraining)) return true;
    if (inItems(emp.opleidingItems)) return true;
    if (normNaam(emp.opleiding) === naamNorm) return true;
    return false;
  }

  function linkedEmployees(naam) {
    var n = normNaam(naam);
    if (!n) return [];
    return mergedEmployees().filter(function (e) {
      return employeeHasOpleidingNaam(e, n);
    });
  }

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

  var naamEl = document.getElementById("opl-hero-name");
  var countEl = document.getElementById("opl-medewerkers-count");
  var naamInput = document.getElementById("opl-detail-naam");
  var skjInput = document.getElementById("opl-detail-skj");
  var listEl = document.getElementById("opl-medewerkers-list");

  function renderMedewerkersList(naam) {
    if (!listEl) return;
    var linked = linkedEmployees(naam);
    listEl.innerHTML = "";
    if (!linked.length) {
      var p = document.createElement("p");
      p.style.color = "#9ca3af";
      p.style.fontSize = "14px";
      p.textContent = "Geen medewerkers gekoppeld aan deze opleiding.";
      listEl.appendChild(p);
      return;
    }
    var ul = document.createElement("ul");
    ul.className = "opl-medewerkers-ul";
    linked.forEach(function (emp) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "opl-medewerker-link";
      a.href = "medewerker.html";
      a.textContent = [emp.voornaam, emp.achternaam].filter(Boolean).join(" ") || "Medewerker";
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var id = emp.id || emp.empId || "";
        var payload = {
          empId: id,
          voornaam: emp.voornaam || "",
          achternaam: emp.achternaam || "",
          email: emp.email || "",
          tel: emp.tel || "",
          fase: emp.fase || "In dienst",
          dienstverband: emp.dienstverband || "",
          functie: emp.functie || "",
          opleiding: emp.opleiding || "",
          startdatum: emp.startdatum || "",
          verjaardag: emp.verjaardag || "",
          overigeInfo: emp.overigeInfo || ""
        };
        window.sessionStorage.setItem("selectedEmployee", JSON.stringify(payload));
        window.location.href = "medewerker.html";
      });
      li.appendChild(a);
      ul.appendChild(li);
    });
    listEl.appendChild(ul);
  }

  function hydrate(opl) {
    if (!opl) return;
    var naam = opl.naam || "—";
    if (naamEl) naamEl.textContent = naam;
    if (naamInput) naamInput.value = opl.naam || "";
    if (skjInput) skjInput.checked = Boolean(opl.skj);
    document.title = (opl.naam || "Opleiding") + " — HR";
    if (countEl) countEl.textContent = String(linkedEmployees(opl.naam).length);
    renderMedewerkersList(opl.naam);
  }

  // Tabs
  var tabs = document.querySelectorAll(".emp-tab[data-tab]");
  var panels = {
    details: document.getElementById("opl-tab-details"),
    medewerkers: document.getElementById("opl-tab-medewerkers"),
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

  var saveBtn = document.getElementById("opl-detail-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
      var newName = naamInput ? naamInput.value.trim() : "";
      if (!newName) {
        if (naamInput) naamInput.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        var updated = await window.opleidingenDB.update(oplId, {
          naam: newName,
          skj: skjInput ? Boolean(skjInput.checked) : false,
        });
        if (updated) hydrate(updated);
        if (typeof showSaveModal === "function") showSaveModal("Opleiding is opgeslagen.");
        else showToast("Opleiding opgeslagen");
      } catch (err) {
        console.error("Opslaan mislukt:", err);
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Opslaan mislukt", err && err.message ? err.message : "Onbekende fout.");
        }
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  // Initial render: probeer cache. Als opleiding er nog niet in zit, wachten
  // op besa:opleidingen-updated event (dat na bootstrap automatisch komt).
  function tryInitialRender() {
    var opl = findOpleiding();
    if (opl) { hydrate(opl); return true; }
    return false;
  }

  if (!tryInitialRender()) {
    var resolved = false;
    function onUpdate() {
      if (resolved) return;
      var opl = findOpleiding();
      if (opl) {
        resolved = true;
        window.removeEventListener("besa:opleidingen-updated", onUpdate);
        hydrate(opl);
      }
    }
    window.addEventListener("besa:opleidingen-updated", onUpdate);

    if (window.opleidingenDB && window.opleidingenDB.ready) {
      window.opleidingenDB.ready.then(function () {
        if (!resolved && !findOpleiding()) {
          window.location.href = "opleidingen.html";
        }
      });
    }
  } else {
    // Cache had de opleiding al; toch nog luisteren voor live-updates.
    window.addEventListener("besa:opleidingen-updated", function () {
      var opl = findOpleiding();
      if (opl) hydrate(opl);
    });
  }
})();
