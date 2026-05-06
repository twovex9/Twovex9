/**
 * Competentie-detailpagina (HR module).
 *
 * Reads en writes lopen via window.competentiesDB. Bij eerste laden
 * proberen we de cache te gebruiken; als die nog leeg is wachten we tot de
 * bootstrap (Supabase fetch) klaar is en proberen we het opnieuw.
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

  function countMedewerkers() {
    try {
      const emps = JSON.parse(localStorage.getItem("employees")) || [];
      return emps.filter((e) =>
        Array.isArray(e.competenties) && e.competenties.includes(compId)
      ).length;
    } catch { return 0; }
  }

  function renderHero(comp) {
    document.getElementById("comp-hero-name").textContent = comp.naam;
    document.getElementById("comp-medewerkers-count").textContent = countMedewerkers();
    const naamInput = document.getElementById("comp-detail-naam");
    if (naamInput) naamInput.value = comp.naam;
    document.title = comp.naam + " — Competentie";
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
