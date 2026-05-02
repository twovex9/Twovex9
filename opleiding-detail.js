/* opleiding-detail.js — detail HR-opleiding (localStorage: opleidingen) */
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

  function mergedEmployees() {
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

  function findOpleiding() {
    var list = typeof getOpleidingen === "function" ? getOpleidingen() : [];
    return list.filter(function (o) { return o.id === oplId; })[0];
  }

  var opl = findOpleiding();
  if (!opl) {
    window.location.href = "opleidingen.html";
    return;
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

  function hydrate() {
    var naam = opl.naam || "—";
    naamEl.textContent = naam;
    naamInput.value = opl.naam || "";
    skjInput.checked = Boolean(opl.skj);
    document.title = (opl.naam || "Opleiding") + " — HR";
    countEl.textContent = String(linkedEmployees(opl.naam).length);
    renderMedewerkersList(opl.naam);
  }

  hydrate();

  var tabs = document.querySelectorAll(".emp-tab[data-tab]");
  var panels = {
    details: document.getElementById("opl-tab-details"),
    medewerkers: document.getElementById("opl-tab-medewerkers")
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

  document.getElementById("opl-detail-save").addEventListener("click", function () {
    var newName = naamInput.value.trim();
    if (!newName) {
      naamInput.focus();
      return;
    }

    var all = typeof getOpleidingen === "function" ? getOpleidingen() : [];
    var idx = all.findIndex(function (o) { return o.id === oplId; });
    if (idx === -1) return;

    var row = all[idx];
    row.naam = newName;
    row.skj = Boolean(skjInput.checked);
    row.laatstGewijzigd = new Date().toISOString();

    if (typeof saveOpleidingen === "function") saveOpleidingen(all);
    opl = row;

    naamEl.textContent = newName;
    document.title = newName + " — HR";
    countEl.textContent = String(linkedEmployees(newName).length);
    renderMedewerkersList(newName);
    if (typeof showSaveModal === "function") showSaveModal("Opleiding is opgeslagen.");
    else showToast("Opleiding opgeslagen");
  });
})();
