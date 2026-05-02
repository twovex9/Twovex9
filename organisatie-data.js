/* global window, localStorage */
/**
 * Stamtabel organisaties (Cliënten-module) — gedeeld via localStorage.
 * Wijzigingen synchroniseren naar alle cliënten met dezelfde organisatienaam.
 */
(function () {
  "use strict";

  var HR_ORG_KEY = "hr_organisaties_v1";
  var HR_ORG_SEED = "hr_organisaties_seeded_v1";

  var SEED_ROWS = [
    { id: "org_seed_1", naam: "Planet Young" },
    { id: "org_seed_2", naam: "Diab" },
    { id: "org_seed_3", naam: "Your" },
    { id: "org_seed_4", naam: "Gezozorg" },
  ];

  function readJson() {
    try {
      var raw = localStorage.getItem(HR_ORG_KEY);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function writeJson(arr) {
    localStorage.setItem(HR_ORG_KEY, JSON.stringify(arr));
  }

  function ensureSeeded() {
    if (localStorage.getItem(HR_ORG_SEED) === "1") {
      if (readJson().length) return;
    }
    var cur = readJson();
    if (cur.length) {
      localStorage.setItem(HR_ORG_SEED, "1");
      return;
    }
    var now = new Date().toISOString();
    var init = SEED_ROWS.map(function (r) {
      return {
        id: r.id,
        naam: r.naam,
        archived: false,
        aanmaakdatum: now,
        laatstGewijzigd: now,
      };
    });
    writeJson(init);
    localStorage.setItem(HR_ORG_SEED, "1");
  }

  function normalizeItem(o) {
    if (!o || typeof o !== "object") return null;
    var id = String(o.id || "").trim() || "org_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
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

  function getOrganisatiesItems() {
    ensureSeeded();
    return readJson().map(normalizeItem).filter(Boolean);
  }

  function setOrganisatiesItems(list) {
    if (!Array.isArray(list)) return;
    var out = list.map(normalizeItem).filter(Boolean);
    writeJson(out);
  }

  function getClientenOrgs() {
    if (typeof getClientenItems !== "function") return [];
    return (getClientenItems() || []).map(function (c) {
      return c && c.organisatie;
    });
  }

  function uniqueSortStrings(values) {
    var s = {};
    (values || []).forEach(function (v) {
      v = (v == null ? "" : String(v)).trim();
      if (v) s[v] = true;
    });
    return Object.keys(s).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase(), "nl", { sensitivity: "base" });
    });
  }

  /**
   * Niet-gearchiveerde namen uit stamtabel + alle in gebruik op cliënten (inclusief legacy / archiefstamregels)
   */
  function getOrganisatieNamenVoorSelectie() {
    ensureSeeded();
    var items = getOrganisatiesItems() || [];
    var actieveStam = items
      .filter(function (o) {
        return o && !o.archived;
      })
      .map(function (o) {
        return o.naam;
      });
    var uitClienten = getClientenOrgs();
    return uniqueSortStrings(actieveStam.concat(uitClienten));
  }

  function hasDuplicateNaam(naam, exceptId) {
    var t = (naam == null ? "" : String(naam).trim().toLowerCase());
    if (!t) return false;
    return getOrganisatiesItems().some(function (o) {
      if (!o) return false;
      if (exceptId && o.id === exceptId) return false;
      if (o.archived) return false;
      return String(o.naam || "")
        .trim()
        .toLowerCase() === t;
    });
  }

  function propagateOrganisatieNaamWijziging(oudeNaam, nieuweNaam) {
    var a = (oudeNaam == null ? "" : String(oudeNaam).trim());
    var b = (nieuweNaam == null ? "" : String(nieuweNaam).trim());
    if (a === b) return 0;
    if (typeof getClientenItems !== "function" || typeof setClientenItems !== "function") return 0;
    var items = getClientenItems() || [];
    var n = 0;
    var next = items.map(function (c) {
      if (!c) return c;
      if (String(c.organisatie || "").trim() === a) {
        n += 1;
        return Object.assign({}, c, { organisatie: b, laatstGewijzigd: new Date().toISOString() });
      }
      return c;
    });
    if (n) setClientenItems(next);
    return n;
  }

  function propagateOrganisatieVerwijderd(naam) {
    return propagateOrganisatieNaamWijziging(naam, "");
  }

  function addOrganisatie(naam) {
    var t = (naam == null ? "" : String(naam).trim());
    if (!t) return null;
    if (hasDuplicateNaam(t)) return null;
    var items = getOrganisatiesItems();
    var id = "org_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 7);
    var now = new Date().toISOString();
    var row = { id: id, naam: t, archived: false, aanmaakdatum: now, laatstGewijzigd: now };
    items.push(row);
    setOrganisatiesItems(items);
    return row;
  }

  function updateOrganisatieById(id, newNaam) {
    if (!id) return null;
    var t = (newNaam == null ? "" : String(newNaam).trim());
    if (!t) return null;
    if (hasDuplicateNaam(t, id)) return null;
    var items = getOrganisatiesItems();
    var pos = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) {
        pos = i;
        break;
      }
    }
    if (pos === -1) return null;
    var oud = String(items[pos].naam || "").trim();
    items[pos].naam = t;
    items[pos].laatstGewijzigd = new Date().toISOString();
    setOrganisatiesItems(items);
    if (oud !== t) propagateOrganisatieNaamWijziging(oud, t);
    return items[pos];
  }

  function setOrganisatieArchivedById(id, archived) {
    var items = getOrganisatiesItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) {
        items[i].archived = !!archived;
        items[i].laatstGewijzigd = new Date().toISOString();
        setOrganisatiesItems(items);
        return true;
      }
    }
    return false;
  }

  function deleteOrganisatieById(id) {
    var items = getOrganisatiesItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) {
        var naam = String(items[i].naam || "").trim();
        var rest = items.filter(function (x) {
          return !x || x.id !== id;
        });
        setOrganisatiesItems(rest);
        if (naam) propagateOrganisatieVerwijderd(naam);
        return true;
      }
    }
    return false;
  }

  window.getOrganisatiesItems = getOrganisatiesItems;
  window.setOrganisatiesItems = setOrganisatiesItems;
  window.getOrganisatieNamenVoorSelectie = getOrganisatieNamenVoorSelectie;
  window.addOrganisatie = addOrganisatie;
  window.updateOrganisatieById = updateOrganisatieById;
  window.setOrganisatieArchivedById = setOrganisatieArchivedById;
  window.deleteOrganisatieById = deleteOrganisatieById;
  window._ensureOrganisatieSeeded = ensureSeeded;
})();
