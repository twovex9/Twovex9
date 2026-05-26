/* global window */
/**
 * ort-engine.js — ORT-rekenmotor (Onregelmatigheidstoeslag) voor de
 * Loket-payroll-export. 1-op-1 met BS2's "Hoe ORT berekening werkt":
 *
 *   - CAO-afhankelijk: percentages bepaald door medewerkers.cao_type
 *     ("CAO VVT" of "CAO Jeugdzorg").
 *   - Automatische splitsing: één werkuren-record dat meerdere
 *     ORT-tijdvensters beslaat, wordt automatisch opgesplitst per minuut.
 *   - Meest gunstige regel: bij overlap wint het hoogste percentage.
 *   - Feestdag-prioriteit: feestdag-regels gaan voor reguliere dag-regels.
 *   - Alleen vast dienstverband: caller is verantwoordelijk voor het filter
 *     (`dienstverband = Loondienst` / `employment_type = permanent`).
 *
 * Werking per werkuren-record:
 *   1. Bouw [startDateTime, eindDateTime] uit datum + starttijd/eindtijd.
 *      Als eind < start → einde valt op volgende dag.
 *   2. Wandel per minuut (efficiënt geïmplementeerd via segment-merging):
 *      voor elk tijdstip bepaal het percentage volgens onderstaande regels.
 *   3. Accumuleer per percentage tot uren (×/60).
 *
 * Regel-resolver per tijdstip (datum, weekdag, uurminuut):
 *   - Bepaal regels die voor deze CAO gelden EN waarvan dag/tijdvenster matcht.
 *   - Filter: als datum een feestdag is, alleen "Feestdag"-regels gebruiken
 *     (feestdag-prioriteit). Anders: alleen niet-feestdag-regels.
 *   - Resultaat: max(percentage) onder de matchende regels, of 100 (basisloon)
 *     als geen regel matcht.
 *
 * Output:
 *   computeOrtForEmployee(medewerkerId, year, month) =>
 *     {
 *       ortUren: { "100": x, "125": y, "130": z, "145": w, ... },
 *       diensttypeUren: { "Vroege dienst": x, "Late dienst": y,
 *                         "Waakdienst": z, "Geen ploegendiensttype": q },
 *       totaalGewerkteUren: x + y + z + w + ...,
 *     }
 *
 * Public:
 *   window.besaOrtEngine = {
 *     computeOrtForEmployee(medewerkerId, year, month),
 *     computeOrtForRecord(record, ortRules, feestdagen),
 *     resolveCaoForEmployee(medewerker),
 *     splitRecordByOrtRules(record, ortRules, feestdagen),  // voor debug/test
 *   };
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  var EN_DASH = "–";
  var DAG_KEYS = {
    "maandag": 1, "dinsdag": 2, "woensdag": 3, "donderdag": 4,
    "vrijdag": 5, "zaterdag": 6, "zondag": 0,
  };

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function parseTimeToMinutes(t) {
    if (typeof t !== "string") return null;
    var m = t.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var h = parseInt(m[1], 10), mn = parseInt(m[2], 10);
    if (!isFinite(h) || !isFinite(mn)) return null;
    return h * 60 + mn;
  }

  function isoDateOnly(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // Normaliseer "Maandag – Vrijdag" / "Maandag - Vrijdag" / etc.
  function normalizeDagLabel(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[-–]/g, "-").trim();
  }

  /**
   * Mapt een dag-label naar de set weekdag-nummers (Sun=0 … Sat=6) die het dekt.
   * Voorbeelden:
   *   "Maandag – Vrijdag" → [1,2,3,4,5]
   *   "Zaterdag" → [6]
   *   "Zondag" → [0]
   *   "Feestdag" → "feestdag" (sentinel)
   *   "Maandag, Woensdag" → [1, 3] (komma-gescheiden)
   */
  function dagLabelToWeekdayList(label) {
    var n = normalizeDagLabel(label);
    if (!n) return [];
    if (n === "feestdag" || n === "feestdagen") return "feestdag";
    // range "X - Y"
    var rangeMatch = n.match(/^([a-z]+)\s*-\s*([a-z]+)$/);
    if (rangeMatch) {
      var a = DAG_KEYS[rangeMatch[1]], b = DAG_KEYS[rangeMatch[2]];
      if (a == null || b == null) return [];
      var out = [];
      // Iso-week loop: ma..zo => 1..7 (zondag=7 conceptueel maar JS Date.getDay=0)
      var aIso = a === 0 ? 7 : a;
      var bIso = b === 0 ? 7 : b;
      if (bIso < aIso) bIso += 7; // wrap (bv. "Vrijdag - Maandag")
      for (var i = aIso; i <= bIso; i++) {
        var d = i % 7;
        if (out.indexOf(d) === -1) out.push(d);
      }
      return out;
    }
    // single of komma-gescheiden
    var parts = n.split(",").map(function (s) { return s.trim(); });
    var result = [];
    parts.forEach(function (p) {
      if (DAG_KEYS[p] != null) result.push(DAG_KEYS[p]);
    });
    return result;
  }

  /**
   * Converteer een ORT-regel naar een snel-te-evalueren genormaliseerde
   * representatie. Een regel die "22:00-06:00" omspant wordt opgesplitst
   * in twee sub-segmenten zodat de evaluator alleen "start <= t < eind"
   * binnen een enkele dag hoeft te checken.
   *
   *   { weekdays: [int]|"feestdag", segments: [{startMin, endMin}], pct }
   *
   * Voor segmenten over middernacht: [{22:00, 24:00}, {0:00, 06:00}].
   * In de praktijk loopt de evaluator OOK over middernacht (eind volgende
   * dag), dus deze splitsing is in de regel-set niet strikt nodig — maar
   * voor uniformiteit doen we het toch.
   */
  function compileRule(rule) {
    if (!rule) return null;
    var weekdays = dagLabelToWeekdayList(rule.dag);
    var s = parseTimeToMinutes(rule.start);
    var e = parseTimeToMinutes(rule.end);
    if (s == null || e == null) return null;
    var pct = Number(rule.percentage);
    if (!isFinite(pct) || pct < 0) return null;
    // Eind 23:59 in BS2 betekent "tot middernacht" — normaliseer naar 24:00.
    if (e === 23 * 60 + 59) e = 24 * 60;
    var segs = [];
    if (e > s) {
      segs.push({ startMin: s, endMin: e });
    } else if (e < s) {
      // wraps over middernacht: [s, 24:00) en [0, e)
      segs.push({ startMin: s, endMin: 24 * 60 });
      segs.push({ startMin: 0, endMin: e, _nextDay: true });
    } else {
      // gelijke tijd = lege regel; negeren
      return null;
    }
    return { weekdays: weekdays, segments: segs, pct: pct, raw: rule };
  }

  // ---------------------------------------------------------------------------
  // Feestdagen — accepteert verschillende vormvarianten in BS1
  // ---------------------------------------------------------------------------
  function feestdagSet(feestdagen) {
    var set = Object.create(null);
    if (!Array.isArray(feestdagen)) return set;
    feestdagen.forEach(function (f) {
      var d = null;
      if (f && f.datumTs) d = new Date(Number(f.datumTs));
      else if (f && f.datum) d = new Date(String(f.datum));
      if (d && !isNaN(d.getTime())) set[isoDateOnly(d)] = true;
    });
    return set;
  }

  // ---------------------------------------------------------------------------
  // Per-minuut percentage-resolver
  // ---------------------------------------------------------------------------
  function pctForMoment(dateObj, weekday, minOfDay, compiledRules, feestdagSet) {
    var isFeestdag = !!feestdagSet[isoDateOnly(dateObj)];
    var best = 100; // basisloon-percentage als geen regel matcht
    for (var i = 0; i < compiledRules.length; i++) {
      var r = compiledRules[i];
      var isFeestdagRule = r.weekdays === "feestdag";
      // Feestdag-prioriteit: op feestdag tellen ALLEEN feestdag-regels;
      // op niet-feestdag tellen ALLEEN niet-feestdag-regels.
      if (isFeestdag !== isFeestdagRule) continue;
      // Weekday-match (alleen voor niet-feestdag-regels)
      if (!isFeestdagRule) {
        if (r.weekdays.indexOf(weekday) === -1) continue;
      }
      // Tijdsvenster
      var inWindow = false;
      for (var j = 0; j < r.segments.length; j++) {
        var seg = r.segments[j];
        if (seg._nextDay) continue; // wrap-helft hoort bij volgende dag — daar evalueren we apart
        if (minOfDay >= seg.startMin && minOfDay < seg.endMin) { inWindow = true; break; }
      }
      if (!inWindow) continue;
      if (r.pct > best) best = r.pct;
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Diensttype-bucket-mapping
  // ---------------------------------------------------------------------------
  var DIENSTTYPE_BUCKETS = {
    "Vroege dienst": "Vroege dienst",
    "Late dienst": "Late dienst",
    "Waakdienst": "Waakdienst",
  };
  function diensttypeBucket(dienstRaw) {
    var s = String(dienstRaw || "").trim();
    if (!s) return "Geen ploegendiensttype";
    if (DIENSTTYPE_BUCKETS[s]) return DIENSTTYPE_BUCKETS[s];
    // Tolerant: case-insensitive match
    var low = s.toLowerCase();
    if (low === "vroege dienst") return "Vroege dienst";
    if (low === "late dienst") return "Late dienst";
    if (low === "waakdienst") return "Waakdienst";
    return "Geen ploegendiensttype";
  }

  // ---------------------------------------------------------------------------
  // CAO-resolver per medewerker
  // ---------------------------------------------------------------------------
  function resolveCaoForEmployee(medewerker) {
    if (!medewerker) return "vvt";
    var raw = medewerker.cao || medewerker.cao_type || medewerker.caoType || "";
    var s = String(raw).toLowerCase();
    if (s.indexOf("jeugd") !== -1) return "jeugdzorg";
    return "vvt";
  }

  // ---------------------------------------------------------------------------
  // Bouw [startDateTime, endDateTime] uit werkuren-record
  // ---------------------------------------------------------------------------
  function buildInterval(rec) {
    if (!rec || !rec.datum) return null;
    var base = new Date(rec.datum + "T00:00:00");
    if (isNaN(base.getTime())) return null;
    var sMin = parseTimeToMinutes(rec.starttijd);
    var eMin = parseTimeToMinutes(rec.eindtijd);
    var dur = Number(rec.duur_minuten || 0);
    // Fallback: als alleen duur_minuten, plak vanaf 00:00 op de dag.
    if (sMin == null) sMin = 0;
    if (eMin == null) {
      if (dur > 0) eMin = sMin + dur;
      else return null;
    }
    // Eind <= start → eind valt op volgende dag (incl. multi-day diensten via duur).
    var totalMinutes = eMin - sMin;
    if (totalMinutes <= 0) {
      // assume volgende dag
      totalMinutes += 24 * 60;
    }
    // Als duur >> 24h (zoals Sumi 48u-test), gebruik duur_minuten als waarheid
    if (dur > 0 && dur > totalMinutes) totalMinutes = dur;
    var start = new Date(base.getTime() + sMin * 60 * 1000);
    var end = new Date(start.getTime() + totalMinutes * 60 * 1000);
    return { start: start, end: end };
  }

  // ---------------------------------------------------------------------------
  // Per-record ORT-splitsing → { pct: minuten, ... }
  // ---------------------------------------------------------------------------
  function computeOrtForRecord(record, compiledRules, fdSet) {
    var out = Object.create(null);
    var iv = buildInterval(record);
    if (!iv) return out;
    var STEP_MIN = 1; // minuten-granulariteit
    // Wandel in stappen van 1 minuut; voor lange diensten (48u test) is dit
    // ~3000 iteraties — geen probleem in JS.
    var cursor = new Date(iv.start.getTime());
    while (cursor < iv.end) {
      var weekday = cursor.getDay();
      var minOfDay = cursor.getHours() * 60 + cursor.getMinutes();
      var pct = pctForMoment(cursor, weekday, minOfDay, compiledRules, fdSet);
      out[pct] = (out[pct] || 0) + STEP_MIN;
      cursor = new Date(cursor.getTime() + STEP_MIN * 60 * 1000);
    }
    return out; // {pct: minuten}
  }

  function splitRecordByOrtRules(record, ortRules, feestdagen) {
    var compiled = (ortRules || []).map(compileRule).filter(Boolean);
    var fdSet = feestdagSet(feestdagen || []);
    return computeOrtForRecord(record, compiled, fdSet);
  }

  // ---------------------------------------------------------------------------
  // Ent-to-end voor één medewerker × maand
  // ---------------------------------------------------------------------------
  function getOrtRulesForCao(cao) {
    try {
      var raw = window.localStorage.getItem("saladmin_ort_rules");
      var data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== "object") return [];
      var key = cao === "jeugdzorg" ? "jeugdzorg" : "vvt";
      return Array.isArray(data[key]) ? data[key] : [];
    } catch (e) { return []; }
  }

  function getFeestdagen() {
    try {
      var raw = window.localStorage.getItem("comp_feestdagen_config_rows");
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  function getWerkurenForEmployeeMonth(medewerkerId, year, month) {
    if (!window.werkurenDB || typeof window.werkurenDB.getForMedewerkerMonthSync !== "function") return [];
    return window.werkurenDB.getForMedewerkerMonthSync(medewerkerId, year, month) || [];
  }

  function getMedewerker(medewerkerId) {
    if (!window.medewerkersDB || typeof window.medewerkersDB.getByIdSync !== "function") return null;
    return window.medewerkersDB.getByIdSync(medewerkerId);
  }

  function computeOrtForEmployee(medewerkerId, year, month) {
    var emp = getMedewerker(medewerkerId);
    var cao = resolveCaoForEmployee(emp);
    var rules = getOrtRulesForCao(cao);
    var compiled = rules.map(compileRule).filter(Boolean);
    var fdSet = feestdagSet(getFeestdagen());
    var records = getWerkurenForEmployeeMonth(medewerkerId, year, month);
    var ortMin = Object.create(null);
    var dienstMin = Object.create(null);
    var totalMin = 0;
    records.forEach(function (rec) {
      var bucket = diensttypeBucket(rec.dienst);
      var perPct = computeOrtForRecord(rec, compiled, fdSet);
      Object.keys(perPct).forEach(function (pct) {
        var min = perPct[pct];
        ortMin[pct] = (ortMin[pct] || 0) + min;
        totalMin += min;
        dienstMin[bucket] = (dienstMin[bucket] || 0) + min;
      });
    });
    function minToHours(m) { return Math.round((m / 60) * 100) / 100; }
    var ortUren = {};
    Object.keys(ortMin).forEach(function (p) { ortUren[p] = minToHours(ortMin[p]); });
    var diensttypeUren = {};
    Object.keys(dienstMin).forEach(function (k) { diensttypeUren[k] = minToHours(dienstMin[k]); });
    return {
      ortUren: ortUren,
      diensttypeUren: diensttypeUren,
      totaalGewerkteUren: minToHours(totalMin),
      cao: cao,
      recordCount: records.length,
    };
  }

  global.besaOrtEngine = {
    computeOrtForEmployee: computeOrtForEmployee,
    computeOrtForRecord: computeOrtForRecord,
    splitRecordByOrtRules: splitRecordByOrtRules,
    resolveCaoForEmployee: resolveCaoForEmployee,
    // Helpers voor tests / inspectie:
    _compileRule: compileRule,
    _dagLabelToWeekdayList: dagLabelToWeekdayList,
    _diensttypeBucket: diensttypeBucket,
    _buildInterval: buildInterval,
  };
})(typeof window !== "undefined" ? window : this);
