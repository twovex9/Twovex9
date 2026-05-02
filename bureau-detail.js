/* bureau-detail.js — detailpagina bureau (koppelt aan bureaus-data.js) */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var burId = params.get("id");

  if (!burId) {
    window.location.href = "bureaus.html";
    return;
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

  function findBureau() {
    var list = getBureaus();
    return list.filter(function (o) { return o.id === burId; })[0];
  }

  var bur = findBureau();
  if (!bur) {
    window.location.href = "bureaus.html";
    return;
  }

  var heroName = document.getElementById("bur-hero-name");
  var naamInput = document.getElementById("bur-detail-naam");
  var uurtariefInput = document.getElementById("bur-detail-uurtarief");
  var feeInput = document.getElementById("bur-detail-fee");
  var saveBtn = document.getElementById("bur-detail-save");

  function toInputNumberValue(v) {
    if (v === null || v === undefined || v === "") return "";
    var n = Number(v);
    if (!isFinite(n)) return "";
    return String(n);
  }

  function parseMoneyLike(str) {
    var s = (str || "").toString().trim();
    if (!s) return null;
    s = s.replace(",", ".");
    var n = Number(s);
    if (!isFinite(n)) return null;
    if (n < 0) n = 0;
    return Math.round(n * 100) / 100;
  }

  function hydrate() {
    heroName.textContent = bur.naam || "—";
    document.title = (bur.naam || "Bureau") + " — HR";
    if (naamInput) naamInput.value = bur.naam || "";
    if (uurtariefInput) uurtariefInput.value = toInputNumberValue(bur.standaardUurtarief);
    if (feeInput) feeInput.value = toInputNumberValue(bur.feePerUur);
  }

  hydrate();

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      var newName = naamInput ? naamInput.value.trim() : "";
      if (!newName) {
        if (naamInput) naamInput.focus();
        return;
      }

      var all = getBureaus();
      var idx = all.findIndex(function (o) { return o.id === burId; });
      if (idx === -1) return;

      var row = all[idx];
      row.naam = newName;
      row.standaardUurtarief = parseMoneyLike(uurtariefInput ? uurtariefInput.value : "");
      row.feePerUur = parseMoneyLike(feeInput ? feeInput.value : "");
      row.laatstGewijzigd = new Date().toISOString();

      saveBureaus(all);
      bur = row;
      hydrate();
      if (typeof showSaveModal === "function") showSaveModal("Bureau is opgeslagen.");
      else showToast("bureau opgeslagen");
    });
  }
})();

