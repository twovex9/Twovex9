/**
 * Opleiding-detailpagina (HR module).
 *
 * Reads en writes lopen via window.opleidingenDB. Bij eerste laden proberen
 * we de cache te gebruiken; als die nog leeg is wachten we op het update-
 * event dat de data-laag dispatched zodra Supabase-data binnen is.
 *
 * De Medewerkers-tab wordt door de gedeelde module
 * window.ffDetailMedewerkersTab.init geleverd (zelfde UI als HR > Medewerkers,
 * gefilterd op deze opleiding).
 */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var oplId = params.get("id");

  if (!oplId) {
    window.location.href = "opleidingen.html";
    return;
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

  var medewerkersTab = null;

  function setCount(n) {
    if (countEl) countEl.textContent = String(n);
  }

  function ensureMedewerkersTab(opl) {
    if (medewerkersTab) return;
    if (!window.ffDetailMedewerkersTab || typeof window.ffDetailMedewerkersTab.init !== "function") return;
    var container = document.getElementById("opl-medewerkers-list");
    if (!container) return;
    medewerkersTab = window.ffDetailMedewerkersTab.init({
      container: container,
      entityType: "opleiding",
      entityId: oplId,
      getEntity: function () { return findOpleiding() || opl; },
      onCount: setCount,
      exportFilename: "opleiding-" + (opl.naam || "medewerkers").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      exportTitle: (opl.naam || "Opleiding") + " — Medewerkers",
    });
  }

  function hydrate(opl) {
    if (!opl) return;
    var naam = opl.naam || "—";
    if (naamEl) naamEl.textContent = naam;
    if (naamInput) naamInput.value = opl.naam || "";
    if (skjInput) skjInput.checked = Boolean(opl.skj);
    document.title = (opl.naam || "Opleiding") + " — HR";
    ensureMedewerkersTab(opl);
    if (medewerkersTab && typeof medewerkersTab.refresh === "function") medewerkersTab.refresh();
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
      if (key === "medewerkers" && medewerkersTab && typeof medewerkersTab.refresh === "function") {
        medewerkersTab.refresh();
      }
    });
  });

  /* ── ••• Meer opties menu (Module 06 Bug #22 fix) ── */
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
      menuEl.className = "opl-detail-menu-popover";
      menuEl.style.cssText = "position:absolute;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:100;min-width:200px;";
      menuEl.innerHTML = '<button type="button" class="opl-menu-archive" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;border-radius:var(--r-sm)">Archiveren</button>' +
                         '<button type="button" class="opl-menu-purge" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--red);border-radius:var(--r-sm)">Definitief verwijderen</button>';
      document.body.appendChild(menuEl);
      var r = menuBtn.getBoundingClientRect();
      menuEl.style.left = (r.left) + "px";
      menuEl.style.top = (r.bottom + window.scrollY + 4) + "px";
      menuEl.querySelector(".opl-menu-archive").addEventListener("click", async function () {
        closeMenu();
        if (window.showArchiveConfirm) {
          var ok = await window.showArchiveConfirm({ preview: document.getElementById("opl-hero-name") && document.getElementById("opl-hero-name").textContent || "" });
          if (!ok) return;
        }
        try {
          await window.opleidingenDB.archive(oplId);
          if (window.showActionFeedback) window.showActionFeedback("archived", "Opleiding");
          setTimeout(function () { window.location.href = "opleidingen.html"; }, 600);
        } catch (err) {
          if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        }
      });
      menuEl.querySelector(".opl-menu-purge").addEventListener("click", async function () {
        closeMenu();
        if (window.showSliderConfirmModal) {
          var ok = await window.showSliderConfirmModal({
            title: "Definitief verwijderen",
            preview: document.getElementById("opl-hero-name") && document.getElementById("opl-hero-name").textContent || "",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren"
          });
          if (!ok) return;
        }
        try {
          await window.opleidingenDB.delete(oplId);
          if (window.showActionFeedback) window.showActionFeedback("deleted", "Opleiding");
          setTimeout(function () { window.location.href = "opleidingen.html"; }, 600);
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
  // op ff:opleidingen-updated event (dat na bootstrap automatisch komt).
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
        window.removeEventListener("ff:opleidingen-updated", onUpdate);
        hydrate(opl);
      }
    }
    window.addEventListener("ff:opleidingen-updated", onUpdate);

    if (window.opleidingenDB && window.opleidingenDB.ready) {
      window.opleidingenDB.ready.then(function () {
        if (!resolved && !findOpleiding()) {
          window.location.href = "opleidingen.html";
        }
      });
    }
  } else {
    // Cache had de opleiding al; toch nog luisteren voor live-updates.
    window.addEventListener("ff:opleidingen-updated", function () {
      var opl = findOpleiding();
      if (opl) hydrate(opl);
    });
  }
})();
