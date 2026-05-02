/* global window, localStorage, GEMEENTEN_STAM_NAMEN */
/**
 * Stamtabel gemeenten (Cliënten-module) — localStorage.
 * Seed: unieke namen uit gebruikerslijst (zie gemeenten-bulk.js).
 */
(function () {
  "use strict";

  var HR_GEM_KEY = "hr_gemeenten_v1";
  var HR_GEM_SEED = "hr_gemeenten_seeded_v1";

  function readJson() {
    try {
      var raw = localStorage.getItem(HR_GEM_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function writeJson(arr) {
    localStorage.setItem(HR_GEM_KEY, JSON.stringify(arr));
  }

  function seedNamen() {
    var g = typeof window !== "undefined" ? window.GEMEENTEN_STAM_NAMEN : null;
    if (Array.isArray(g) && g.length) return g.map(String);
    return [];
  }

  function ensureSeeded() {
    if (localStorage.getItem(HR_GEM_SEED) === "1") {
      if (readJson().length) return;
    }
    var cur = readJson();
    if (cur.length) {
      localStorage.setItem(HR_GEM_SEED, "1");
      return;
    }
    var namen = seedNamen();
    var now = new Date().toISOString();
    var init = namen.map(function (naam, i) {
      return {
        id: "gem_seed_" + String(i + 1),
        naam: naam,
        archived: false,
        aanmaakdatum: now,
        laatstGewijzigd: now,
      };
    });
    writeJson(init);
    localStorage.setItem(HR_GEM_SEED, "1");
  }

  function normalizeItem(o) {
    if (!o || typeof o !== "object") return null;
    var id = String(o.id || "").trim() || "gem_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
    var naam = String(o.naam == null ? "" : o.naam).trim();
    if (!naam) return null;
    return {
      id: id,
      naam: naam,
      archived: o.archived === true,
      aanmaakdatum: o.aanmaakdatum != null ? String(o.aanmaakdatum) : new Date().toISOString(),
      laatstGewijzigd: o.laatstGewijzigd != null ? String(o.laatstGewijzigd) : new Date().toISOString(),
    };
  }

  function getGemeentenItems() {
    ensureSeeded();
    return readJson().map(normalizeItem).filter(Boolean);
  }

  function setGemeentenItems(list) {
    if (!Array.isArray(list)) return;
    var out = list.map(normalizeItem).filter(Boolean);
    writeJson(out);
  }

  function hasDuplicateNaam(naam, exceptId) {
    var t = (naam == null ? "" : String(naam).trim().toLowerCase());
    if (!t) return false;
    return getGemeentenItems().some(function (o) {
      if (!o) return false;
      if (exceptId && o.id === exceptId) return false;
      if (o.archived) return false;
      return String(o.naam || "")
        .trim()
        .toLowerCase() === t;
    });
  }

  function addGemeente(naam) {
    var t = (naam == null ? "" : String(naam).trim());
    if (!t) return null;
    if (hasDuplicateNaam(t)) return null;
    var items = getGemeentenItems();
    var id = "gem_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 7);
    var now = new Date().toISOString();
    var row = { id: id, naam: t, archived: false, aanmaakdatum: now, laatstGewijzigd: now };
    items.push(row);
    setGemeentenItems(items);
    return row;
  }

  function updateGemeenteById(id, newNaam) {
    if (!id) return null;
    var t = (newNaam == null ? "" : String(newNaam).trim());
    if (!t) return null;
    if (hasDuplicateNaam(t, id)) return null;
    var items = getGemeentenItems();
    var pos = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) {
        pos = i;
        break;
      }
    }
    if (pos === -1) return null;
    items[pos].naam = t;
    items[pos].laatstGewijzigd = new Date().toISOString();
    setGemeentenItems(items);
    return items[pos];
  }

  function setGemeenteArchivedById(id, archived) {
    var items = getGemeentenItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) {
        items[i].archived = !!archived;
        items[i].laatstGewijzigd = new Date().toISOString();
        setGemeentenItems(items);
        return true;
      }
    }
    return false;
  }

  function deleteGemeenteById(id) {
    var items = getGemeentenItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) {
        var rest = items.filter(function (x) {
          return !x || x.id !== id;
        });
        setGemeentenItems(rest);
        return true;
      }
    }
    return false;
  }

  window.getGemeentenItems = getGemeentenItems;
  window.setGemeentenItems = setGemeentenItems;
  window.addGemeente = addGemeente;
  window.updateGemeenteById = updateGemeenteById;
  window.setGemeenteArchivedById = setGemeenteArchivedById;
  window.deleteGemeenteById = deleteGemeenteById;
  window._ensureGemeentenSeeded = ensureSeeded;
})();
