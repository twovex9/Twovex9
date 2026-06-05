/* zorgsoort-detail.js — toont en bewerkt 1 zorgsoort (?id=...) via Supabase data-laag */
/* global showSaveModal */
(function () {
  "use strict";

  var TARIEF_LABEL = { dag: "Dag", uur: "Uur", week: "Week" };

  var params = new URLSearchParams(window.location.search);
  var zsId = params.get("id");

  if (!zsId || !window.zorgsoortenDB) {
    window.location.href = "zorgsoorten.html";
    return;
  }

  var heroName = document.getElementById("zs-hero-name");
  var naamInput = document.getElementById("zs-detail-naam");
  var tariefSelect = document.getElementById("zs-detail-tarief");
  var tariefBedrag = document.getElementById("zs-detail-tarief-bedrag");
  var kostenBedrag = document.getElementById("zs-detail-kosten-bedrag");
  var eenheidLbl = document.getElementById("zs-detail-eenheid");
  var eenheidLblK = document.getElementById("zs-detail-eenheid-k");
  var saveBtn = document.getElementById("zs-detail-save");

  var EENHEID_TXT = { uur: "per uur", dag: "per dag", week: "per week" };
  function syncEenheidLabels() {
    var t = tariefSelect && tariefSelect.value ? String(tariefSelect.value).toLowerCase() : "uur";
    var txt = EENHEID_TXT[t] || "per uur";
    if (eenheidLbl) eenheidLbl.textContent = txt;
    if (eenheidLblK) eenheidLblK.textContent = txt;
  }
  if (tariefSelect) tariefSelect.addEventListener("change", syncEenheidLabels);

  function findZorgsoortCached() {
    var list = window.zorgsoortenDB.getAllSync() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === zsId) return list[i];
    }
    return null;
  }

  function applyToView(item) {
    if (!item) return;
    if (heroName) heroName.textContent = item.naam || "—";
    if (naamInput) naamInput.value = item.naam || "";
    if (tariefSelect) {
      var t = String(item.tarieftype || "").toLowerCase();
      tariefSelect.value = TARIEF_LABEL[t] ? t : "dag";
    }
    if (tariefBedrag) tariefBedrag.value = (item.tarief != null ? item.tarief : "");
    if (kostenBedrag) kostenBedrag.value = (item.kostenTarief != null ? item.kostenTarief : "");
    syncEenheidLabels();
    document.title = (item.naam || "Zorgsoort") + " — Cliënten";
  }

  function showInlineToast(msg) {
    var t = document.querySelector(".app-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "app-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-visible");
    window.setTimeout(function () {
      t.classList.remove("is-visible");
    }, 2400);
  }

  /* ── Tabs (alleen Details actief, maar zelfde gedrag als andere detailpagina's) ── */
  var tabs = document.querySelectorAll(".emp-tab[data-tab]");
  var panels = {
    details: document.getElementById("zs-tab-details"),
  };
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("is-active"); });
      tab.classList.add("is-active");
      var key = tab.getAttribute("data-tab");
      Object.keys(panels).forEach(function (k) {
        var p = panels[k];
        if (p) p.style.display = k === key ? "" : "none";
      });
    });
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
      var nm = (naamInput && naamInput.value ? naamInput.value : "").trim();
      var tr = tariefSelect && tariefSelect.value ? String(tariefSelect.value).toLowerCase() : "";
      if (!nm) {
        if (naamInput) {
          naamInput.setAttribute("aria-invalid", "true");
          naamInput.focus();
        }
        showInlineToast("Vul een naam in");
        return;
      }
      if (!TARIEF_LABEL[tr]) {
        if (tariefSelect) tariefSelect.setAttribute("aria-invalid", "true");
        showInlineToast("Kies een tarieftype (Dag, Uur of Week)");
        return;
      }
      var tariefVal = tariefBedrag && tariefBedrag.value !== "" ? tariefBedrag.value : null;
      var kostenVal = kostenBedrag && kostenBedrag.value !== "" ? kostenBedrag.value : null;
      var updated;
      try {
        updated = await window.zorgsoortenDB.update(zsId, { naam: nm, tarieftype: tr, tarief: tariefVal, kostenTarief: kostenVal });
      } catch (err) {
        console.error("Zorgsoort opslaan mislukt:", err);
        showInlineToast("Opslaan is niet gelukt");
        return;
      }
      if (!updated) {
        showInlineToast("Opslaan is niet gelukt");
        return;
      }
      if (naamInput) naamInput.removeAttribute("aria-invalid");
      if (tariefSelect) tariefSelect.removeAttribute("aria-invalid");
      applyToView(updated);
      if (typeof showSaveModal === "function") {
        showSaveModal("Wijzigingen zijn opgeslagen.");
      } else {
        showInlineToast("Wijzigingen opgeslagen");
      }
    });
  }

  function tryInitialRender() {
    var item = findZorgsoortCached();
    if (item) {
      applyToView(item);
      return true;
    }
    return false;
  }

  window.addEventListener("besa:zorgsoorten-updated", function () {
    var item = findZorgsoortCached();
    if (!item) {
      window.location.href = "zorgsoorten.html";
      return;
    }
    applyToView(item);
  });

  if (!tryInitialRender()) {
    if (heroName) heroName.textContent = "Laden…";
    Promise.resolve(window.zorgsoortenDB.ready).catch(function () { /* error reeds gelogd */ });
  }
})();
