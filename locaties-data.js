var LOC_STORAGE_KEY = "hr_locaties";

var _locIdCounter = 0;
function locGenId() {
  _locIdCounter++;
  return "loc_" + Date.now().toString(36) + "_" + _locIdCounter + "_" + Math.random().toString(36).slice(2, 8);
}

function locComposeAdres(o) {
  var straat = (o.straat || "").trim();
  var hn = (o.huisnummer || "").trim();
  var tv = (o.toevoeging || "").trim();
  var pc = (o.postcode || "").replace(/\s+/g, "").trim();
  var pl = (o.plaats || "").trim();
  if (!straat && !pl) return (o.adres && String(o.adres).trim()) || "N/A";
  var left = straat;
  if (hn) left += (left ? " " : "") + hn;
  if (tv) left += (left ? " " : "") + tv;
  left = left.trim();
  if (pc && pl) return left + ", " + pc + " " + pl;
  if (pl) return left + ", " + pl;
  if (pc) return left + ", " + pc;
  return left || "N/A";
}

function locParseAdresInto(o) {
  var adres = (o.adres || "").trim();
  if (!adres || adres === "N/A") return false;
  var parts = adres.split(",").map(function (s) { return s.trim(); });
  if (parts.length < 2) return false;
  var right = parts[parts.length - 1];
  var left = parts.slice(0, -1).join(", ");
  var mPc = right.match(/^(\d{4}[A-Z]{2})\s+(.+)$/i);
  if (mPc) {
    o.postcode = mPc[1].toUpperCase();
    o.plaats = mPc[2].trim();
  } else {
    o.plaats = right;
  }
  var mLeft = left.match(/^(.+?)\s+(\d+[a-zA-Z\-]*)\s*(.*)$/);
  if (mLeft) {
    o.straat = mLeft[1].trim();
    o.huisnummer = mLeft[2].trim();
    o.toevoeging = (mLeft[3] || "").trim();
  } else {
    o.straat = left;
  }
  return true;
}

function locNormalizeRecord(o) {
  var dirty = false;
  if (!o.kleur) {
    o.kleur = "#64748b";
    dirty = true;
  }
  ["postcode", "huisnummer", "toevoeging", "straat", "plaats"].forEach(function (k) {
    if (o[k] === undefined) {
      o[k] = "";
      dirty = true;
    }
  });
  if (!(o.straat || "").trim() && o.adres && o.adres !== "N/A") {
    if (locParseAdresInto(o)) dirty = true;
  }
  return dirty;
}

function locDefaultSeed() {
  return [
    {
      id: "loc_seed_kantoor_magdalenenstraat",
      naam: "Kantoor Magdalenenstraat",
      adres: "Magdalenenstraat 17, Alkmaar",
      kleur: "#ab94ff",
      postcode: "",
      huisnummer: "17",
      toevoeging: "",
      straat: "Magdalenenstraat",
      plaats: "Alkmaar",
      aanmaakdatum: "2026-04-09T12:32:00",
      laatstGewijzigd: "2026-04-09T12:32:00",
      archived: false,
    },
    {
      id: "loc_seed_zijperstraat",
      naam: "Zijperstraat",
      adres: "Zijperstraat 35, 1823CX Alkmaar",
      kleur: "#60a5fa",
      postcode: "1823CX",
      huisnummer: "35",
      toevoeging: "",
      straat: "Zijperstraat",
      plaats: "Alkmaar",
      aanmaakdatum: "2026-03-16T20:37:00",
      laatstGewijzigd: "2026-03-16T20:37:00",
      archived: false,
    },
    {
      id: "loc_seed_leonard_bramerstraat",
      naam: "Leonard Bramerstraat",
      adres: "Leonard Bramerstraat 7, 1816TR Alkmaar",
      kleur: "#34d399",
      postcode: "1816TR",
      huisnummer: "7",
      toevoeging: "",
      straat: "Leonard Bramerstraat",
      plaats: "Alkmaar",
      aanmaakdatum: "2026-03-10T14:15:00",
      laatstGewijzigd: "2026-03-10T14:15:00",
      archived: false,
    },
    {
      id: "loc_seed_breedstraat",
      naam: "Breedstraat",
      adres: "Breedstraat 38, 1811DE Alkmaar",
      kleur: "#fbbf24",
      postcode: "1811DE",
      huisnummer: "38",
      toevoeging: "",
      straat: "Breedstraat",
      plaats: "Alkmaar",
      aanmaakdatum: "2026-02-01T09:00:00",
      laatstGewijzigd: "2026-03-28T11:22:00",
      archived: false,
    },
    {
      id: "loc_seed_magdalenenstraat",
      naam: "Magdalenenstraat",
      adres: "Magdalenenstraat 22, 1811EG Alkmaar",
      kleur: "#f472b6",
      postcode: "1811EG",
      huisnummer: "22",
      toevoeging: "",
      straat: "Magdalenenstraat",
      plaats: "Alkmaar",
      aanmaakdatum: "2025-11-05T10:30:00",
      laatstGewijzigd: "2026-03-03T16:40:00",
      archived: false,
    },
    {
      id: "loc_seed_varnebroek",
      naam: "Varnebroek",
      adres: "Varnebroekerweg 10, 1724MP Heerhugowaard",
      kleur: "#a78bfa",
      postcode: "1724MP",
      huisnummer: "10",
      toevoeging: "",
      straat: "Varnebroekerweg",
      plaats: "Heerhugowaard",
      aanmaakdatum: "2025-08-14T08:45:00",
      laatstGewijzigd: "2026-01-01T12:00:00",
      archived: false,
    },
    {
      id: "loc_seed_voorburggracht",
      naam: "Voorburggracht",
      adres: "Voorburggracht 5, 1811JK Alkmaar",
      kleur: "#38bdf8",
      postcode: "1811JK",
      huisnummer: "5",
      toevoeging: "",
      straat: "Voorburggracht",
      plaats: "Alkmaar",
      aanmaakdatum: "2025-09-19T13:20:00",
      laatstGewijzigd: "2025-08-20T09:15:00",
      archived: false,
    },
    {
      id: "loc_seed_achterwacht",
      naam: "Achterwacht",
      adres: "Achterwacht 3, 1811LM Alkmaar",
      kleur: "#fb923c",
      postcode: "1811LM",
      huisnummer: "3",
      toevoeging: "",
      straat: "Achterwacht",
      plaats: "Alkmaar",
      aanmaakdatum: "2025-07-11T15:00:00",
      laatstGewijzigd: "2026-02-07T14:08:00",
      archived: false,
    },
    {
      id: "loc_seed_satelliet_1",
      naam: "satelliet woning",
      adres: "N/A",
      kleur: "#94a3b8",
      postcode: "",
      huisnummer: "",
      toevoeging: "",
      straat: "",
      plaats: "",
      aanmaakdatum: "2026-04-01T08:00:00",
      laatstGewijzigd: "2026-04-01T08:00:00",
      archived: false,
    },
    {
      id: "loc_seed_satelliet_2",
      naam: "satelliet woning",
      adres: "N/A",
      kleur: "#94a3b8",
      postcode: "",
      huisnummer: "",
      toevoeging: "",
      straat: "",
      plaats: "",
      aanmaakdatum: "2026-04-01T08:05:00",
      laatstGewijzigd: "2026-04-01T08:05:00",
      archived: false,
    },
    {
      id: "loc_seed_satelliet_3",
      naam: "satelliet woning",
      adres: "N/A",
      kleur: "#94a3b8",
      postcode: "",
      huisnummer: "",
      toevoeging: "",
      straat: "",
      plaats: "",
      aanmaakdatum: "2026-04-01T08:10:00",
      laatstGewijzigd: "2026-04-01T08:10:00",
      archived: false,
    },
  ];
}

function getLocaties() {
  try {
    var raw = localStorage.getItem(LOC_STORAGE_KEY);
    if (!raw) {
      var seed = locDefaultSeed();
      localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    var list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      var fallback = locDefaultSeed();
      localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    var changed = false;
    list.forEach(function (o) {
      if (!o.id) {
        o.id = locGenId();
        changed = true;
      }
      if (locNormalizeRecord(o)) changed = true;
    });
    if (changed) localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    var s = locDefaultSeed();
    try {
      localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(s));
    } catch (e2) {}
    return s;
  }
}

function saveLocaties(list) {
  try {
    localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("saveLocaties fout:", e);
  }
}

function deleteLocatie(id) {
  if (!id) return false;
  var list = getLocaties().filter(function (o) { return o.id !== id; });
  saveLocaties(list);
  return true;
}

function locFmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  var dd = String(d.getDate()).padStart(2, "0");
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var yy = d.getFullYear();
  var hh = String(d.getHours()).padStart(2, "0");
  var mi = String(d.getMinutes()).padStart(2, "0");
  return dd + "-" + mm + "-" + yy + " " + hh + ":" + mi;
}
