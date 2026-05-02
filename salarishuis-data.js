/**
 * Salarisschalen — seed + localStorage (hr_salarisschalen_v1)
 * Rij: { trede: string (kolom Salaristrede), bedrag: string met € }
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "hr_salarisschalen_v2";
  var HISTORY_KEY = "hr_salarishuis_wijzigingen_v1";
  var MAX_HISTORY_ENTRIES = 500;

  function euro(amount) {
    return "€ " + amount;
  }

  function rowsFromNumPairs(pairs) {
    return pairs.map(function (p) {
      return { trede: String(p[0]), bedrag: euro(p[1]) };
    });
  }

  function salDefaultScales() {
    return [
      { id: "schaal-4", title: "Schaal 4", rows: rowsFromNumPairs([
        [0, "2.454,54"], [1, "2.454,54"], [2, "2.509,64"], [3, "2.588,84"], [4, "2.670,38"],
        [5, "2.754,21"], [6, "2.841,09"], [7, "2.930,26"], [8, "3.023,29"], [9, "3.118,51"], [10, "3.216,05"]
      ]) },
      { id: "schaal-5", title: "Schaal 5", rows: rowsFromNumPairs([
        [0, "2.454,54"], [1, "2.520,27"], [2, "2.600,30"], [3, "2.684,12"], [4, "2.769,51"],
        [5, "2.858,62"], [6, "2.950,10"], [7, "3.043,85"], [8, "3.141,40"], [9, "3.241,97"],
        [10, "3.345,66"], [11, "3.453,06"]
      ]) },
      { id: "schaal-6", title: "Schaal 6", rows: rowsFromNumPairs([
        [0, "2.618,60"], [1, "2.703,91"], [2, "2.791,59"], [3, "2.882,29"], [4, "2.976,00"],
        [5, "3.072,76"], [6, "3.172,64"], [7, "3.275,51"], [8, "3.382,21"], [9, "3.491,92"],
        [10, "3.605,49"], [11, "3.722,88"]
      ]) },
      { id: "schaal-7", title: "Schaal 7", rows: rowsFromNumPairs([
        [0, "2.818,26"], [1, "2.911,23"], [2, "3.007,25"], [3, "3.106,34"], [4, "3.209,22"],
        [5, "3.315,13"], [6, "3.424,11"], [7, "3.537,68"], [8, "3.654,29"], [9, "3.774,69"],
        [10, "3.898,93"], [11, "4.027,70"]
      ]) },
      { id: "schaal-8", title: "Schaal 8", rows: rowsFromNumPairs([
        [0, "2.946,27"], [1, "3.045,34"], [2, "3.146,69"], [3, "3.252,63"], [4, "3.361,64"],
        [5, "3.473,65"], [6, "3.590,26"], [7, "3.710,67"], [8, "3.834,90"], [9, "3.963,67"],
        [10, "4.096,31"], [11, "4.233,47"], [12, "4.375,20"]
      ]) },
      { id: "schaal-9", title: "Schaal 9", rows: rowsFromNumPairs([
        [0, "3.191,69"], [1, "3.299,91"], [2, "3.412,73"], [3, "3.528,53"], [4, "3.648,19"],
        [5, "3.772,40"], [6, "3.900,42"], [7, "4.033,05"], [8, "4.170,21"], [9, "4.311,95"],
        [10, "4.459,04"], [11, "4.610,72"], [12, "4.766,96"]
      ]) },
      { id: "schaal-10", title: "Schaal 10", rows: rowsFromNumPairs([
        [0, "3.472,90"], [1, "3.592,54"], [2, "3.716,79"], [3, "3.844,80"], [4, "3.977,44"],
        [5, "4.114,59"], [6, "4.256,32"], [7, "4.403,42"], [8, "4.555,85"], [9, "4.712,83"],
        [10, "4.875,16"], [11, "5.043,59"], [12, "5.217,35"]
      ]) },
      { id: "schaal-11", title: "Schaal 11", rows: rowsFromNumPairs([
        [0, "3.972,06"], [1, "4.111,55"], [2, "4.255,60"], [3, "4.404,19"], [4, "4.558,15"],
        [5, "4.718,16"], [6, "4.882,77"], [7, "5.053,50"], [8, "5.231,05"], [9, "5.413,97"],
        [10, "5.602,97"], [11, "5.598,06"], [12, "6.002,30"]
      ]) },
      {
        id: "schaal-12",
        title: "Schaal 12",
        rows: rowsFromNumPairs([
          [0, "4.375,20"], [1, "4.530,68"], [2, "4.691,50"], [3, "4.857,61"], [4, "5.030,63"],
          [5, "5.208,98"], [6, "5.394,16"], [7, "5.585,48"], [8, "5.783,60"], [9, "5.988,60"],
          [10, "6.201,23"], [11, "6.421,44"], [12, "6.649,31"], [13, "6.885,58"]
        ]).concat([
          { trede: "Omvangperiodiek 1", bedrag: euro("7.130,22") },
          { trede: "Omvangperiodiek 2", bedrag: euro("7.383,22") }
        ])
      },
      {
        id: "stagevergoeding",
        title: "stagevergoeding",
        rows: [{ trede: "Stagevergoeding", bedrag: euro("450,00") }]
      },
      { id: "schaal-13", title: "Schaal 13", rows: rowsFromNumPairs([
        [0, "4.987,95"], [1, "5.167,82"], [2, "5.353,78"], [3, "5.546,58"], [4, "5.746,23"],
        [5, "5.952,77"], [6, "6.166,91"], [7, "6.389,46"], [8, "6.618,85"], [9, "6.857,39"],
        [10, "7.104,33"], [11, "7.360,37"], [12, "7.624,85"]
      ]) },
      { id: "schaal-14", title: "Schaal 14", rows: rowsFromNumPairs([
        [0, "6.250,00"], [1, "6.477,84"], [2, "6.714,89"], [3, "6.959,49"], [4, "7.214,04"]
      ]) }
    ];
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function logSalarishuisWijziging(actie, detail) {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var list = [];
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
      list.unshift({
        ts: Date.now(),
        actie: String(actie || ""),
        detail: detail != null ? String(detail) : ""
      });
      if (list.length > MAX_HISTORY_ENTRIES) list = list.slice(0, MAX_HISTORY_ENTRIES);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (err) {
      console.error("logSalarishuisWijziging", err);
    }
  }

  function getSalarishuisWijzigingen() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /** Ruwe check: is dit bedrag effectief nul? (voorkomt dat alles per ongeluk € 0 blijft). */
  function bedragIsEffectivelyZero(b) {
    var t = String(b == null ? "" : b)
      .replace(/€/gi, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    var n = parseFloat(t);
    return !isFinite(n) || n === 0;
  }

  function allBedragenInListAreZero(list) {
    var any = false;
    for (var i = 0; i < list.length; i++) {
      var rows = list[i].rows;
      if (!rows || !rows.length) continue;
      for (var j = 0; j < rows.length; j++) {
        any = true;
        if (!bedragIsEffectivelyZero(rows[j].bedrag)) return false;
      }
    }
    return any;
  }

  function getSalarisschalen() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var defaults = salDefaultScales();
      var defaultsById = {};
      defaults.forEach(function (d) {
        defaultsById[d.id] = d;
      });

      if (!raw) {
        var initial = deepClone(defaults);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return deepClone(defaults);

      var fixed = false;
      var out = parsed
        .map(function (s) {
          if (!s || typeof s !== "object" || !s.id) return null;
          var id = String(s.id);
          var def = defaultsById[id];
          var title = s.title != null ? String(s.title) : def && def.title ? def.title : "";
          var rows = Array.isArray(s.rows) ? s.rows : [];
          if (!rows.length && def && Array.isArray(def.rows) && def.rows.length) {
            rows = deepClone(def.rows);
            fixed = true;
          }
          return { id: id, title: title, rows: rows };
        })
        .filter(Boolean);

      if (!out.length) return deepClone(defaults);
      if (allBedragenInListAreZero(out)) {
        logSalarishuisWijziging(
          "Salarisschalen automatisch hersteld",
          "Alle opgeslagen bedragen waren € 0; standaard schalen teruggezet."
        );
        out = deepClone(defaults);
        saveSalarisschalen(out);
        return out;
      }
      if (fixed) {
        logSalarishuisWijziging(
          "Salarisschalen aangevuld",
          "Ontbrekende rijen bij een of meer schalen zijn uit de standaard gevuld."
        );
        saveSalarisschalen(out);
      }
      return out;
    } catch (e) {
      return deepClone(salDefaultScales());
    }
  }

  function saveSalarisschalen(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.error("saveSalarisschalen", err);
    }
  }

  function resetSalarisschalenToSeed() {
    logSalarishuisWijziging(
      "Salarisschalen handmatig teruggezet",
      "Standaard schalen opnieuw geladen (bijv. via console)."
    );
    var initial = deepClone(salDefaultScales());
    saveSalarisschalen(initial);
    return initial;
  }

  global.getSalarisschalen = getSalarisschalen;
  global.saveSalarisschalen = saveSalarisschalen;
  global.resetSalarisschalenToSeed = resetSalarisschalenToSeed;
  global.salDefaultScales = salDefaultScales;
  global.logSalarishuisWijziging = logSalarishuisWijziging;
  global.getSalarishuisWijzigingen = getSalarishuisWijzigingen;
})(typeof window !== "undefined" ? window : globalThis);
