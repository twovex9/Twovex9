/* competentie-detail.js */
(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const compId = params.get("id");

  if (!compId) {
    window.location.href = "competenties.html";
    return;
  }

  function getCompetencies() {
    try { return JSON.parse(localStorage.getItem("competenties")) || []; }
    catch { return []; }
  }
  function saveCompetencies(arr) {
    localStorage.setItem("competenties", JSON.stringify(arr));
  }

  const comp = getCompetencies().find(c => c.id === compId);
  if (!comp) {
    window.location.href = "competenties.html";
    return;
  }

  function countMedewerkers() {
    try {
      const emps = JSON.parse(localStorage.getItem("employees")) || [];
      return emps.filter(e =>
        Array.isArray(e.competenties) && e.competenties.includes(compId)
      ).length;
    } catch { return 0; }
  }

  document.getElementById("comp-hero-name").textContent = comp.naam;
  document.getElementById("comp-medewerkers-count").textContent = countMedewerkers();

  const naamInput = document.getElementById("comp-detail-naam");
  naamInput.value = comp.naam;

  document.title = comp.naam + " — Competentie";

  /* ── Tabs ── */
  const tabs = document.querySelectorAll(".emp-tab[data-tab]");
  const panels = {
    details: document.getElementById("comp-tab-details"),
    medewerkers: document.getElementById("comp-tab-medewerkers")
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const key = tab.getAttribute("data-tab");
      Object.entries(panels).forEach(([k, p]) => {
        p.style.display = k === key ? "" : "none";
      });
    });
  });

  /* ── Save ── */
  document.getElementById("comp-detail-save").addEventListener("click", () => {
    const newName = naamInput.value.trim();
    if (!newName) {
      naamInput.focus();
      return;
    }

    const all = getCompetencies();
    const idx = all.findIndex(c => c.id === compId);
    if (idx === -1) return;

    all[idx].naam = newName;
    all[idx].gewijzigd = new Date().toISOString();
    saveCompetencies(all);

    document.getElementById("comp-hero-name").textContent = newName;
    document.title = newName + " — Competentie";

    if (typeof showSaveModal === "function") showSaveModal("Wijzigingen zijn opgeslagen.");
    else showToast("Wijzigingen opgeslagen");
  });

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
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".side-link").forEach(a => {
    const href = a.getAttribute("href") || "";
    a.classList.toggle("is-active", href === "competenties.html");
  });
  document.querySelectorAll(".top-link").forEach(a => {
    const text = (a.textContent || "").trim();
    a.classList.toggle("is-active", text === "HR");
  });
})();
