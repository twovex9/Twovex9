/**
 * Standaardcatalogus competenties (HR). Geladen vóór competenties.js, competentie-detail.js,
 * medewerker.js en script.js zodat elke pagina dezelfde basisset competenties ziet.
 */
(function () {
  var raw = [
    "Stressbestendig",
  ];
  window.COMPETENTIES_DEFAULT_NAMEN = [...new Set(raw)].sort(function (a, b) {
    return a.localeCompare(b, "nl", { sensitivity: "base" });
  });
})();

(function mergeCompetentiesCatalogIntoLocalStorage() {
  try {
    var KEY = "competenties";
    var catalog = window.COMPETENTIES_DEFAULT_NAMEN;
    if (!catalog || !catalog.length) return;
    var raw = localStorage.getItem(KEY);
    var existing = [];
    if (raw) {
      try {
        existing = JSON.parse(raw);
      } catch (e) {
        existing = [];
      }
    }
    if (!Array.isArray(existing)) existing = [];
    var seen = Object.create(null);
    existing.forEach(function (c) {
      var n = (c && c.naam ? String(c.naam) : "").trim().toLowerCase();
      if (n) seen[n] = true;
    });
    var merged = existing.slice();
    var idx = merged.length;
    function genId() {
      return "comp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    }
    catalog.forEach(function (naam) {
      var key = String(naam).trim().toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      var created = new Date(2025, Math.floor(idx / 3), 1 + (idx % 28) * 2, 10 + (idx % 14), (idx * 7) % 60);
      merged.push({
        id: genId(),
        naam: naam,
        aanmaakdatum: created.toISOString(),
        laatstGewijzigd: created.toISOString(),
        archived: false,
      });
      idx++;
    });
    if (merged.length !== existing.length) {
      localStorage.setItem(KEY, JSON.stringify(merged));
    }
  } catch (e) {
    console.error("mergeCompetentiesCatalogIntoLocalStorage:", e);
  }
})();
