/* bureau-detail.js — detailpagina bureau (Supabase data-laag via window.bureausDB) */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var burId = params.get("id");

  if (!burId || !window.bureausDB) {
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

  function findBureauCached() {
    var list = window.bureausDB.getAllSync() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === burId) return list[i];
    }
    return null;
  }

  var heroName = document.getElementById("bur-hero-name");
  var naamInput = document.getElementById("bur-detail-naam");
  var uurtariefInput = document.getElementById("bur-detail-uurtarief");
  var feeInput = document.getElementById("bur-detail-fee");
  var eigenaarInput = document.getElementById("bur-detail-eigenaar");
  var contactpersoonInput = document.getElementById("bur-detail-contactpersoon");
  var emailInput = document.getElementById("bur-detail-email");
  var telefoonInput = document.getElementById("bur-detail-telefoon");
  var websiteInput = document.getElementById("bur-detail-website");
  var kvkInput = document.getElementById("bur-detail-kvk");
  var adresInput = document.getElementById("bur-detail-adres");
  var notitiesInput = document.getElementById("bur-detail-notities");
  var saveBtn = document.getElementById("bur-detail-save");

  /* ── ••• Meer opties menu (Module 09 Bug #29 fix) ── */
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
      menuEl.className = "bur-detail-menu-popover";
      menuEl.style.cssText = "position:absolute;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:100;min-width:200px;";
      menuEl.innerHTML = '<button type="button" class="bur-menu-archive" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;border-radius:var(--r-sm)">Archiveren</button>' +
                         '<button type="button" class="bur-menu-purge" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--red);border-radius:var(--r-sm)">Definitief verwijderen</button>';
      document.body.appendChild(menuEl);
      var r = menuBtn.getBoundingClientRect();
      menuEl.style.left = r.left + "px";
      menuEl.style.top = (r.bottom + window.scrollY + 4) + "px";
      menuEl.querySelector(".bur-menu-archive").addEventListener("click", async function () {
        closeMenu();
        if (window.showArchiveConfirm) {
          var ok = await window.showArchiveConfirm({ preview: heroName && heroName.textContent || "" });
          if (!ok) return;
        }
        try {
          await window.bureausDB.archive(burId);
          if (window.showActionFeedback) window.showActionFeedback("archived", "Bureau");
          setTimeout(function () { window.location.href = "bureaus.html"; }, 600);
        } catch (err) {
          if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        }
      });
      menuEl.querySelector(".bur-menu-purge").addEventListener("click", async function () {
        closeMenu();
        if (window.showSliderConfirmModal) {
          var ok = await window.showSliderConfirmModal({
            title: "Definitief verwijderen",
            preview: heroName && heroName.textContent || "",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren"
          });
          if (!ok) return;
        }
        try {
          await window.bureausDB.delete(burId);
          if (window.showActionFeedback) window.showActionFeedback("deleted", "Bureau");
          setTimeout(function () { window.location.href = "bureaus.html"; }, 600);
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

  function hydrate(bur) {
    if (!bur) return;
    if (heroName) heroName.textContent = bur.naam || "—";
    document.title = (bur.naam || "Bureau") + " — HR";
    if (naamInput) naamInput.value = bur.naam || "";
    if (uurtariefInput) uurtariefInput.value = toInputNumberValue(bur.standaardUurtarief);
    if (feeInput) feeInput.value = toInputNumberValue(bur.feePerUur);
    if (eigenaarInput) eigenaarInput.value = bur.eigenaar || "";
    if (contactpersoonInput) contactpersoonInput.value = bur.contactpersoonPlanning || "";
    if (emailInput) emailInput.value = bur.email || "";
    if (telefoonInput) telefoonInput.value = bur.telefoon || "";
    if (websiteInput) websiteInput.value = bur.website || "";
    if (kvkInput) kvkInput.value = bur.kvkNummer || "";
    if (adresInput) adresInput.value = bur.adres || "";
    if (notitiesInput) notitiesInput.value = bur.notities || "";
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
      var newName = naamInput ? naamInput.value.trim() : "";
      if (!newName) {
        if (naamInput) naamInput.focus();
        return;
      }
      var patch = {
        naam: newName,
        standaardUurtarief: parseMoneyLike(uurtariefInput ? uurtariefInput.value : ""),
        feePerUur: parseMoneyLike(feeInput ? feeInput.value : ""),
        eigenaar: eigenaarInput ? eigenaarInput.value : "",
        contactpersoonPlanning: contactpersoonInput ? contactpersoonInput.value : "",
        email: emailInput ? emailInput.value : "",
        telefoon: telefoonInput ? telefoonInput.value : "",
        website: websiteInput ? websiteInput.value : "",
        kvkNummer: kvkInput ? kvkInput.value : "",
        adres: adresInput ? adresInput.value : "",
        notities: notitiesInput ? notitiesInput.value : "",
      };
      var updated;
      try {
        updated = await window.bureausDB.update(burId, patch);
      } catch (err) {
        console.error("Bureau opslaan mislukt:", err);
        showToast("Opslaan is niet gelukt");
        return;
      }
      if (!updated) {
        showToast("Opslaan is niet gelukt");
        return;
      }
      hydrate(updated);
      if (typeof showSaveModal === "function") showSaveModal("Bureau is opgeslagen.");
      else showToast("bureau opgeslagen");
    });
  }

  function tryInitialRender() {
    var bur = findBureauCached();
    if (bur) {
      hydrate(bur);
      return true;
    }
    return false;
  }

  window.addEventListener("besa:bureaus-updated", function () {
    var bur = findBureauCached();
    if (!bur) {
      window.location.href = "bureaus.html";
      return;
    }
    hydrate(bur);
  });

  if (!tryInitialRender()) {
    if (heroName) heroName.textContent = "Laden…";
    Promise.resolve(window.bureausDB.ready).catch(function () { /* error reeds gelogd */ });
  }
})();
