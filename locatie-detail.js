/* locatie-detail.js — detailpagina locatie (Supabase data-laag via window.locatiesDB).
 *
 * De Medewerkers-tab wordt door de gedeelde module
 * window.besaDetailMedewerkersTab.init geleverd (zelfde UI als HR > Medewerkers,
 * gefilterd op deze locatie).
 */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var locId = params.get("id");

  if (!locId || !window.locatiesDB) {
    window.location.href = "locaties.html";
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

  var medewerkersTab = null;

  function setCount(n) {
    if (countEl) countEl.textContent = String(n);
  }

  function ensureMedewerkersTab(loc) {
    if (medewerkersTab) return;
    if (!window.besaDetailMedewerkersTab || typeof window.besaDetailMedewerkersTab.init !== "function") return;
    var container = document.getElementById("loc-medewerkers-list");
    if (!container) return;
    medewerkersTab = window.besaDetailMedewerkersTab.init({
      container: container,
      entityType: "locatie",
      entityId: locId,
      getEntity: function () { return findLocatieCached() || loc; },
      onCount: setCount,
      exportFilename: "locatie-" + (loc.naam || "medewerkers").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      exportTitle: (loc.naam || "Locatie") + " — Medewerkers",
    });
  }

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
    ensureMedewerkersTab(loc);
    if (medewerkersTab && typeof medewerkersTab.refresh === "function") medewerkersTab.refresh();
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
      if (key === "medewerkers" && medewerkersTab && typeof medewerkersTab.refresh === "function") {
        medewerkersTab.refresh();
      }
    });
  });

  /* ── ••• Meer opties menu (Module 07 Bug #24 fix) ── */
  var menuBtn = document.querySelector(".comp-detail-menu");
  if (menuBtn) {
    var menuEl = null;
    function closeMenu() {
      if (menuEl) { menuEl.remove(); menuEl = null; }
      document.removeEventListener("click", outsideClick, true);
    }
    function outsideClick(e) {
      if (menuEl && !menuEl.contains(e.target) && e.target !== menuBtn) closeMenu();
    }
    menuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuEl) { closeMenu(); return; }
      menuEl = document.createElement("div");
      menuEl.className = "loc-detail-menu-popover";
      menuEl.style.cssText = "position:absolute;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:100;min-width:200px;";
      menuEl.innerHTML = '<button type="button" class="loc-menu-archive" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;border-radius:var(--r-sm)">Archiveren</button>' +
                         '<button type="button" class="loc-menu-purge" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--red);border-radius:var(--r-sm)">Definitief verwijderen</button>';
      document.body.appendChild(menuEl);
      var r = menuBtn.getBoundingClientRect();
      menuEl.style.left = (r.left) + "px";
      menuEl.style.top = (r.bottom + window.scrollY + 4) + "px";
      menuEl.querySelector(".loc-menu-archive").addEventListener("click", async function () {
        closeMenu();
        if (window.showArchiveConfirm) {
          var ok = await window.showArchiveConfirm({ preview: document.getElementById("loc-hero-name") && document.getElementById("loc-hero-name").textContent || "" });
          if (!ok) return;
        }
        try {
          await window.locatiesDB.archive(locId);
          if (window.showActionFeedback) window.showActionFeedback("archived", "Locatie");
          setTimeout(function () { window.location.href = "locaties.html"; }, 600);
        } catch (err) {
          if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        }
      });
      menuEl.querySelector(".loc-menu-purge").addEventListener("click", async function () {
        closeMenu();
        if (window.showSliderConfirmModal) {
          var ok = await window.showSliderConfirmModal({
            title: "Definitief verwijderen",
            preview: document.getElementById("loc-hero-name") && document.getElementById("loc-hero-name").textContent || "",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren"
          });
          if (!ok) return;
        }
        try {
          await window.locatiesDB.delete(locId);
          if (window.showActionFeedback) window.showActionFeedback("deleted", "Locatie");
          setTimeout(function () { window.location.href = "locaties.html"; }, 600);
        } catch (err) {
          if (window.showError) window.showError("Verwijderen mislukt: " + err.message);
        }
      });
      setTimeout(function () { document.addEventListener("click", outsideClick, true); }, 0);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuEl) closeMenu();
    });
  }

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
