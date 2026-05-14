/**
 * Competentie-detailpagina (HR module).
 *
 * Reads en writes lopen via window.competentiesDB. Bij eerste laden
 * proberen we de cache te gebruiken; als die nog leeg is wachten we tot de
 * bootstrap (Supabase fetch) klaar is en proberen we het opnieuw.
 *
 * De Medewerkers-tab wordt door de gedeelde module
 * window.besaDetailMedewerkersTab.init geleverd (zelfde UI als HR > Medewerkers,
 * gefilterd op deze competentie).
 */
(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const compId = params.get("id");

  if (!compId) {
    window.location.href = "competenties.html";
    return;
  }

  function getCompetenciesCached() {
    if (window.competentiesDB && typeof window.competentiesDB.getAllSync === "function") {
      return window.competentiesDB.getAllSync();
    }
    try {
      const raw = localStorage.getItem("competenties");
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  function findComp() {
    return getCompetenciesCached().find((c) => c.id === compId);
  }

  let medewerkersTab = null;
  let cachedCount = 0;

  function setCount(n) {
    cachedCount = n;
    const el = document.getElementById("comp-medewerkers-count");
    if (el) el.textContent = String(n);
  }

  function renderHero(comp) {
    document.getElementById("comp-hero-name").textContent = comp.naam;
    const naamInput = document.getElementById("comp-detail-naam");
    if (naamInput) naamInput.value = comp.naam;
    document.title = comp.naam + " — Competentie";
    if (medewerkersTab && typeof medewerkersTab.refresh === "function") medewerkersTab.refresh();
  }

  function ensureMedewerkersTab(comp) {
    if (medewerkersTab) return;
    if (!window.besaDetailMedewerkersTab || typeof window.besaDetailMedewerkersTab.init !== "function") return;
    const container = document.getElementById("comp-medewerkers-list");
    if (!container) return;
    medewerkersTab = window.besaDetailMedewerkersTab.init({
      container: container,
      entityType: "competentie",
      entityId: compId,
      getEntity: function () { return findComp() || comp; },
      onCount: setCount,
      exportFilename: "competentie-" + (comp.naam || "medewerkers").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      exportTitle: (comp.naam || "Competentie") + " — Medewerkers",
    });
  }

  /* ── Tabs ── */
  const tabs = document.querySelectorAll(".emp-tab[data-tab]");
  const panels = {
    details: document.getElementById("comp-tab-details"),
    medewerkers: document.getElementById("comp-tab-medewerkers"),
  };
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const key = tab.getAttribute("data-tab");
      Object.entries(panels).forEach(([k, p]) => {
        if (p) p.style.display = k === key ? "" : "none";
      });
      if (key === "medewerkers" && medewerkersTab && typeof medewerkersTab.refresh === "function") {
        medewerkersTab.refresh();
      }
    });
  });

  /* ── Save ── */
  const saveBtn = document.getElementById("comp-detail-save");
  const naamInput = document.getElementById("comp-detail-naam");

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const newName = naamInput?.value?.trim();
      if (!newName) {
        naamInput?.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        const updated = await window.competentiesDB.update(compId, { naam: newName });
        if (updated) {
          document.getElementById("comp-hero-name").textContent = updated.naam;
          document.title = updated.naam + " — Competentie";
        }
        if (typeof showSaveModal === "function") showSaveModal("Wijzigingen zijn opgeslagen.");
        else showToast("Wijzigingen opgeslagen");
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

  /* ── ••• Meer opties menu (Module 05 Bug #20 fix) ── */
  const menuBtn = document.querySelector(".comp-detail-menu");
  if (menuBtn) {
    let menuEl = null;
    function closeMenu() {
      if (menuEl) { menuEl.remove(); menuEl = null; }
      document.removeEventListener("click", outsideClick, true);
    }
    function outsideClick(e) {
      if (menuEl && !menuEl.contains(e.target) && e.target !== menuBtn) closeMenu();
    }
    menuBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (menuEl) { closeMenu(); return; }
      menuEl = document.createElement("div");
      menuEl.className = "comp-detail-menu-popover";
      menuEl.style.cssText = "position:absolute;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:100;min-width:200px;";
      menuEl.innerHTML = '<button type="button" class="comp-menu-archive" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;border-radius:var(--r-sm)">Archiveren</button>' +
                         '<button type="button" class="comp-menu-purge" style="display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--red);border-radius:var(--r-sm)">Definitief verwijderen</button>';
      document.body.appendChild(menuEl);
      const r = menuBtn.getBoundingClientRect();
      menuEl.style.left = (r.left) + "px";
      menuEl.style.top = (r.bottom + window.scrollY + 4) + "px";
      menuEl.querySelector(".comp-menu-archive").addEventListener("click", async () => {
        closeMenu();
        if (window.showArchiveConfirm) {
          const ok = await window.showArchiveConfirm({ preview: document.getElementById("comp-hero-name")?.textContent || "" });
          if (!ok) return;
        }
        try {
          await window.competentiesDB.archive(compId);
          if (window.showActionFeedback) window.showActionFeedback("archived", "Competentie");
          setTimeout(() => { window.location.href = "competenties.html"; }, 600);
        } catch (err) {
          if (window.showError) window.showError("Archiveren mislukt: " + err.message);
        }
      });
      menuEl.querySelector(".comp-menu-purge").addEventListener("click", async () => {
        closeMenu();
        if (window.showSliderConfirmModal) {
          const ok = await window.showSliderConfirmModal({
            title: "Definitief verwijderen",
            preview: document.getElementById("comp-hero-name")?.textContent || "",
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren"
          });
          if (!ok) return;
        }
        try {
          await window.competentiesDB.delete(compId);
          if (window.showActionFeedback) window.showActionFeedback("deleted", "Competentie");
          setTimeout(() => { window.location.href = "competenties.html"; }, 600);
        } catch (err) {
          if (window.showError) window.showError("Verwijderen mislukt: " + err.message);
        }
      });
      setTimeout(() => document.addEventListener("click", outsideClick, true), 0);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menuEl) closeMenu();
    });
  }

  /* ── Toast ── */
  function showToast(msg) {
    let t = document.querySelector(".app-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "app-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-visible");
    setTimeout(() => t.classList.remove("is-visible"), 2400);
  }

  /* ── Sidebar / topbar active states ── */
  document.querySelectorAll(".side-link").forEach((a) => {
    const href = a.getAttribute("href") || "";
    a.classList.toggle("is-active", href === "competenties.html");
  });
  document.querySelectorAll(".top-link").forEach((a) => {
    const text = (a.textContent || "").trim();
    a.classList.toggle("is-active", text === "HR");
  });

  /* ── Initial render ──
   * Probeer eerst direct uit cache. Als de competentie er nog niet in zit
   * (eerste page-load, cache nog leeg), wachten we op het update-event dat
   * door competenties-data.js gedispatcht wordt zodra Supabase-data binnen
   * is. Pas daarna sturen we eventueel door naar de lijstpagina. */
  function tryInitialRender() {
    const comp = findComp();
    if (comp) {
      renderHero(comp);
      ensureMedewerkersTab(comp);
      return true;
    }
    return false;
  }

  if (!tryInitialRender()) {
    let resolved = false;
    function onUpdate() {
      if (resolved) return;
      const comp = findComp();
      if (comp) {
        resolved = true;
        window.removeEventListener("besa:competenties-updated", onUpdate);
        renderHero(comp);
        ensureMedewerkersTab(comp);
      }
    }
    window.addEventListener("besa:competenties-updated", onUpdate);

    // Vangnet: na bootstrap nog steeds geen match? Ga terug naar de lijst.
    if (window.competentiesDB && window.competentiesDB.ready) {
      window.competentiesDB.ready.then(() => {
        if (!resolved && !findComp()) {
          window.location.href = "competenties.html";
        }
      });
    }
  } else {
    // Cache had de comp al; toch nog luisteren voor eventuele live-updates
    // (bv. naam veranderd in een andere tab).
    window.addEventListener("besa:competenties-updated", () => {
      const comp = findComp();
      if (comp) renderHero(comp);
    });
  }
})();
