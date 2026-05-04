/* zorgsoort-detail.js — toont en bewerkt 1 zorgsoort (?id=zs-...) */
/* global getZorgsoortById, updateZorgsoortById, showSaveModal */
(function () {
  "use strict";

  var TARIEF_LABEL = { dag: "Dag", uur: "Uur", week: "Week" };

  var params = new URLSearchParams(window.location.search);
  var zsId = params.get("id");

  if (!zsId || typeof getZorgsoortById !== "function") {
    window.location.href = "zorgsoorten.html";
    return;
  }

  var zs = getZorgsoortById(zsId);
  if (!zs) {
    window.location.href = "zorgsoorten.html";
    return;
  }

  var heroName = document.getElementById("zs-hero-name");
  var naamInput = document.getElementById("zs-detail-naam");
  var tariefSelect = document.getElementById("zs-detail-tarief");
  var saveBtn = document.getElementById("zs-detail-save");

  function applyToView(item) {
    if (heroName) heroName.textContent = item.naam || "—";
    if (naamInput) naamInput.value = item.naam || "";
    if (tariefSelect) {
      var t = String(item.tarieftype || "").toLowerCase();
      tariefSelect.value = TARIEF_LABEL[t] ? t : "dag";
    }
    document.title = (item.naam || "Zorgsoort") + " — Cliënten";
  }

  applyToView(zs);

  /* ── Tabs (alleen Details actief, maar zelfde gedrag als andere detailpagina's) ── */
  var tabs = document.querySelectorAll(".emp-tab[data-tab]");
  var panels = {
    details: document.getElementById("zs-tab-details")
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

  /* ── Save ── */
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

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
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

      var updated = typeof updateZorgsoortById === "function"
        ? updateZorgsoortById(zsId, { naam: nm, tarieftype: tr })
        : null;

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
})();
