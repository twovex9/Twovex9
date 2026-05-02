var BUREAU_STORAGE_KEY = "hr_bureaus";

var _bureauIdCounter = 0;
function bureauGenId() {
  _bureauIdCounter++;
  return "bur_" + Date.now().toString(36) + "_" + _bureauIdCounter + "_" + Math.random().toString(36).slice(2, 8);
}

function bureauDefaultSeed() {
  var t = "2026-04-10T10:00:00";
  return [
    { id: "bur_seed_zorgkracht", naam: "Zorgkracht Direct", standaardUurtarief: 47, feePerUur: null, aanmaakdatum: t, laatstGewijzigd: t, archived: false },
    { id: "bur_seed_blnd", naam: "BLND", standaardUurtarief: null, feePerUur: null, aanmaakdatum: t, laatstGewijzigd: t, archived: false },
    { id: "bur_seed_optimum", naam: "Optimum Flex", standaardUurtarief: null, feePerUur: null, aanmaakdatum: t, laatstGewijzigd: t, archived: false },
    { id: "bur_seed_levelup", naam: "Level Up", standaardUurtarief: null, feePerUur: null, aanmaakdatum: t, laatstGewijzigd: t, archived: false },
  ];
}

function bureauNormalizeRecord(o) {
  var dirty = false;
  if (o.archived === undefined) {
    o.archived = false;
    dirty = true;
  }
  if (o.standaardUurtarief === undefined) {
    o.standaardUurtarief = null;
    dirty = true;
  }
  if (o.feePerUur === undefined) {
    o.feePerUur = null;
    dirty = true;
  }
  return dirty;
}

function getBureaus() {
  try {
    var raw = localStorage.getItem(BUREAU_STORAGE_KEY);
    if (!raw) {
      var seed = bureauDefaultSeed();
      localStorage.setItem(BUREAU_STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    var list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      var fallback = bureauDefaultSeed();
      localStorage.setItem(BUREAU_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    var changed = false;
    list.forEach(function (o) {
      if (!o.id) {
        o.id = bureauGenId();
        changed = true;
      }
      if (bureauNormalizeRecord(o)) changed = true;
    });
    if (changed) localStorage.setItem(BUREAU_STORAGE_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    var s = bureauDefaultSeed();
    try {
      localStorage.setItem(BUREAU_STORAGE_KEY, JSON.stringify(s));
    } catch (e2) {}
    return s;
  }
}

function saveBureaus(list) {
  try {
    localStorage.setItem(BUREAU_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("saveBureaus fout:", e);
  }
}

function deleteBureau(id) {
  if (!id) return false;
  var list = getBureaus().filter(function (o) { return o.id !== id; });
  saveBureaus(list);
  return true;
}
