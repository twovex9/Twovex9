/* global FACTUREN_BULK, getClientenItems, getBeschikkingenItems, runTableExport, showSaveModal */
(function () {
  "use strict";

  /** Eerste id-segment, gezet op beschikking-detail: "bdtl-" → element-id's zoals bdtl-fact-tbody */
  var __FP = (typeof window !== "undefined" && window.__FVIEW_PREFIX) ? String(window.__FVIEW_PREFIX) : "";
  function __F(id) {
    return __FP + id;
  }

  var LS_FACT_EXPORT = __FP ? "fact_export_cols_bdtl_v1" : "fact_export_cols_v2";
  var tbody = document.getElementById(__F("fact-tbody"));
  var table = document.getElementById(__F("fact-table"));
  var searchInput = document.getElementById(__F("fact-search"));
  var elStatus = document.getElementById(__F("fact-sel-status"));
  var elDecm = document.getElementById(__F("fact-sel-decm"));
  var elPer = document.getElementById(__F("fact-sel-per"));
  var elBeta = document.getElementById(__F("fact-sel-beta"));
  var elExpiring = document.getElementById(__F("fact-expiring"));
  var elArch = document.getElementById(__F("fact-archived"));
  var elReset = document.getElementById(__F("fact-reset-filters"));
  var delBtn0 = document.getElementById(__F("fact-del-btn"));
  var rangeEl = document.getElementById(__F("fact-pager-range"));
  var pageEl = document.getElementById(__F("fact-pager-page"));
  var rowsSelect = document.getElementById(__F("fact-rows-per-page"));
  var exportBtn = document.getElementById(__F("fact-export-btn"));
  var addBtn = document.getElementById(__F("fact-add-btn"));
  var checkAll = document.getElementById(__F("fact-check-all"));
  var toastEl = document.getElementById(__F("fact-toast"));
  var factColsBtn = document.getElementById(__F("fact-cols-btn"));
  var factColsPanel = document.getElementById(__F("fact-cols-panel"));
  var factColsList = document.getElementById(__F("fact-cols-list"));

  if (!tbody || !table) return;

  var LS_FACT_ARCHIVED = "facturen_archived_v1";
  var LS_FACT_PURGED = "facturen_purged_v1";
  var LS_FACT_HIDDEN = "facturen_hidden_v1";
  var baseFactBulk = typeof FACTUREN_BULK !== "undefined" && Array.isArray(FACTUREN_BULK) ? FACTUREN_BULK : [];
  var raw = baseFactBulk.slice();
  // Stage 7: facturen_supplement_v1 is gemigreerd naar Supabase. De data komt
  // nu binnen via FACTUREN_BULK / besa:facturen-updated. Geen lokale parallel-
  // state meer.

  function loadStrArrLS(lsKey) {
    try {
      var t = localStorage.getItem(lsKey);
      if (!t) return [];
      var a = JSON.parse(t);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  var factArchived = loadStrArrLS(LS_FACT_ARCHIVED);
  var factPurged = loadStrArrLS(LS_FACT_PURGED);

  // Bouw raw + factArchived opnieuw op uit (mogelijk vernieuwde) FACTUREN_BULK.
  // Wordt aangeroepen na "besa:facturen-updated" — als facturen-data.js
  // de Supabase-data in window.FACTUREN_BULK heeft gezet.
  function rebuildFromBulk() {
    var bb = (typeof FACTUREN_BULK !== "undefined" && Array.isArray(FACTUREN_BULK)) ? FACTUREN_BULK : [];
    raw = bb.slice();
    // Sync factArchived uit r.archived (Supabase is bron-van-waarheid).
    factArchived = raw.filter(function (r) { return r && r.archived; }).map(factRowKey);
  }

  (function migrateFactHiddenToArchived() {
    try {
      var o = localStorage.getItem(LS_FACT_HIDDEN);
      if (!o) return;
      var a = JSON.parse(o);
      if (!Array.isArray(a) || a.length === 0) { localStorage.removeItem(LS_FACT_HIDDEN); return; }
      a.forEach(function (x) {
        if (x && factArchived.indexOf(x) === -1) factArchived.push(x);
      });
      localStorage.setItem(LS_FACT_ARCHIVED, JSON.stringify(factArchived));
      localStorage.removeItem(LS_FACT_HIDDEN);
    } catch (e) { /* */ }
  }());

  function saveFactArchived() {
    try { localStorage.setItem(LS_FACT_ARCHIVED, JSON.stringify(factArchived)); } catch (e) { /* */ }
  }
  function saveFactPurged() {
    try { localStorage.setItem(LS_FACT_PURGED, JSON.stringify(factPurged)); } catch (e) { /* */ }
  }

  function factRowKey(r) {
    if (!r) return "";
    if (r.id) return "id:" + String(r.id);
    return "k:" + [r.fn, r.nr, r.client, r.besch, r.per, r.bedr].map(function (x) {
      return x == null ? "" : String(x);
    }).join("\u00a6");
  }

  var currentPage = 0;
  var sortKey = "fn";
  var sortDir = "desc";

  var TOGGLE_COLS = [
    { col: "fn", label: "Factuurnummer" },
    { col: "besch", label: "Beschikking" },
    { col: "client", label: "Cliënt" },
    { col: "nr", label: "Cliëntnummer" },
    { col: "per", label: "Periode" },
    { col: "beta", label: "Betaald" },
    { col: "st", label: "Status" },
    { col: "bedrag", label: "Bedrag" },
    { col: "act", label: "Acties" }
  ];

  /** Zelfde kolomset als beschikkingen-overzicht; alleen aangevinkte → CSV */
  var FACT_EXPORT_COLS = [
    { k: "id", label: "ID" },
    { k: "voornaam", label: "Voornaam" },
    { k: "achternaam", label: "Achternaam" },
    { k: "clientnr", label: "Cliëntnummer" },
    { k: "locatie", label: "Locatie" },
    { k: "gemeente", label: "Gemeente" },
    { k: "organisatie", label: "Organisatie" },
    { k: "verw_naam", label: "Verwijzer naam" },
    { k: "verw_tel", label: "Verwijzer telefoonnummer" },
    { k: "verw_mail", label: "Verwijzer e-mailadres" },
    { k: "datum_in_zorg", label: "Datum in zorg" },
    { k: "fase", label: "Fase" },
    { k: "zorgsoort", label: "Zorgsoort" },
    { k: "naam", label: "Naam" },
    { k: "decl_meth", label: "Declaratiemethode" },
    { k: "start_dt", label: "Startdatum" },
    { k: "eind_dt", label: "Einddatum" },
    { k: "status", label: "Status" },
    { k: "openstaand", label: "Openstaand bedrag" },
    { k: "maandbedrag", label: "Huidig maandbedrag" },
    { k: "amb_uur", label: "Ambulante uren per week" },
    { k: "tarief_dag", label: "Tarief per dag" },
    { k: "tarief_uur", label: "Tarief per uur" }
  ];
  var factExportModalEl = null;
  var factExportUiReady = false;

  function showToast(msg) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.removeAttribute("hidden");
    toastEl.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
      toastEl.setAttribute("hidden", "");
    }, 2400);
  }

  function getPageSize() {
    return Math.max(5, parseInt(rowsSelect && rowsSelect.value ? rowsSelect.value : "25", 10) || 25);
  }

  function rowToFilterStr(r) {
    return [r.fn, r.besch, r.client, r.nr, r.per, r.beta, r.st, r.bedr]
      .map(function (x) { return (x == null ? "" : String(x)).toLowerCase(); })
      .join(" ");
  }

  function isBetaaldRow(r) {
    var l = (r.st == null ? "" : String(r.st)).trim().toLowerCase();
    if (l.indexOf("nog niet") !== -1) return false;
    return l.indexOf("betaald") !== -1;
  }

  function isInBehandelingRow(r) {
    var t = (r.st == null ? "" : String(r.st)).toLowerCase();
    return t.indexOf("behandeling") !== -1 || t.indexOf("gedeclareerd") !== -1;
  }

  function isDashBeta(r) {
    var b = (r.beta == null ? "" : String(r.beta)).trim();
    return b === "" || b === "-" || b === "–" || b === "—";
  }

  function fnSortKey(s) {
    var n = parseInt(String(s || "").replace(/\D/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }

  function amountKey(s) {
    var t = String(s || "")
      .replace(/€/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    var n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }

  function extractYears() {
    var y = {};
    raw.forEach(function (r) {
      var p = (r.per == null ? "" : String(r.per));
      var m;
      var re = /(20\d{2})/g;
      while ((m = re.exec(p)) !== null) {
        y[m[1]] = true;
      }
    });
    return Object.keys(y).sort().reverse();
  }

  function populatePeriodeOptions() {
    if (!elPer) return;
    elPer.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "Alle";
    elPer.appendChild(o0);
    extractYears().forEach(function (year) {
      var o = document.createElement("option");
      o.value = year;
      o.textContent = year;
      elPer.appendChild(o);
    });
  }

  function matchesPeriodeYear(r, year) {
    if (!year) return true;
    return (r.per != null && String(r.per).indexOf(year) !== -1);
  }

  function getFiltered() {
    var items = raw.slice();
    items = items.filter(function (r) {
      return r && factPurged.indexOf(factRowKey(r)) === -1;
    });
    var isArchV = !!(elArch && elArch.checked);
    if (isArchV) {
      items = items.filter(function (r) {
        return r && factArchived.indexOf(factRowKey(r)) !== -1;
      });
    } else {
      items = items.filter(function (r) {
        return r && factArchived.indexOf(factRowKey(r)) === -1;
      });
    }
    var fv = (elStatus && elStatus.value ? elStatus.value : "").trim();
    if (fv === "betaald") {
      items = items.filter(function (r) { return isBetaaldRow(r); });
    } else if (fv === "in_behandeling") {
      items = items.filter(function (r) { return isInBehandelingRow(r) && !isBetaaldRow(r); });
    } else if (fv === "te_declareren") {
      items = items.filter(function (r) { return (r.st || "").toLowerCase().indexOf("te declareren") !== -1; });
    } else if (fv === "nog_niet_betaald") {
      items = items.filter(function (r) { return (r.st || "").toLowerCase().indexOf("nog niet betaald") !== -1; });
    }

    var decVal = (elDecm && elDecm.value ? elDecm.value : "").trim();
    if (decVal) {
      var dl = decVal.toLowerCase();
      items = items.filter(function (r) {
        var b = (r.besch == null ? "" : String(r.besch)).toLowerCase();
        if (dl === "handmatig") return b.indexOf("handmatig") !== -1;
        return b.indexOf(dl) !== -1;
      });
    }

    var perY = (elPer && elPer.value ? elPer.value : "").trim();
    if (perY) {
      items = items.filter(function (r) { return matchesPeriodeYear(r, perY); });
    }

    var betaF = (elBeta && elBeta.value ? elBeta.value : "").trim();
    if (betaF === "met") {
      items = items.filter(function (r) { return !isDashBeta(r); });
    } else if (betaF === "zonder") {
      items = items.filter(function (r) { return isDashBeta(r); });
    }

    if (elExpiring && elExpiring.checked && !(elArch && elArch.checked)) {
      items = items.filter(function (r) { return isInBehandelingRow(r) && !isBetaaldRow(r); });
    }

    var q = (searchInput && searchInput.value ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) { return rowToFilterStr(r).indexOf(q) !== -1; });
    }

    if (typeof window.__FVIEW_ROW_FILTER === "function") {
      items = items.filter(function (r) { return window.__FVIEW_ROW_FILTER(r); });
    }

    items.sort(function (a, b) {
      var av = getSortValue(a, sortKey);
      var bv = getSortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        if (av !== bv) return sortDir === "asc" ? av - bv : bv - av;
        return 0;
      }
      var as = String(av);
      var bs = String(bv);
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }

  function loadFactExportColState() {
    try {
      var raw = localStorage.getItem(LS_FACT_EXPORT);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveFactExportColState(obj) {
    try {
      localStorage.setItem(LS_FACT_EXPORT, JSON.stringify(obj));
    } catch (e) { /* */ }
  }

  function factCsvEsc(t) {
    var s = String(t == null ? "" : t);
    if (s.indexOf(";") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0 || s.indexOf('"') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function n2exp(x) {
    if (x == null || x === "") return 0;
    if (typeof x === "string") {
      var ts = x.trim();
      if (ts === "" || ts === "—" || ts === "-") return 0;
      if (ts.indexOf(",") >= 0) ts = ts.replace(/\./g, "").replace(/,/g, ".");
      x = parseFloat(ts, 10);
    }
    var n = Number(x);
    if (isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function parseYMDLocal(s) {
    if (!s) return null;
    var str = String(s).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str);
    var p = str.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function fmtDLocal(iso) {
    if (!iso) return "—";
    var s = String(iso).trim();
    var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseYMDLocal(s) : new Date(s);
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtEurLocal(n) {
    if (n == null || n === 0) return "—";
    if (n2exp(n) === 0) return "—";
    return "€\u00a0" + n2exp(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtTariefLocal(eur, een) {
    if (eur == null) return "—";
    var a = n2exp(eur);
    if (a === 0) return "€\u00a0" + a.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/" + (een || "uur");
    var u = (een || "uur") === "week" ? "/week" : ((een || "uur") === "dag" ? "/dag" : "/uur");
    return "€\u00a0" + a.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + u;
  }

  function faseTextExportF(f) {
    var s = String(f || "").toLowerCase();
    if (s === "in_aanvraag") return "In aanvraag";
    if (s === "verlopen") return "Verlopen";
    if (s === "in_zorg") return "In zorg";
    if (s === "uit_zorg") return "Uit zorg";
    if (s === "in_dienst") return "In dienst";
    if (s === "uit_dienst") return "Uit dienst";
    if (s === "actief") return "Actief";
    return String(f || "—");
  }

  function statusTextExportFromFactRow(fr) {
    if (isBetaaldRow(fr)) return "Betaald";
    return "Niet betaald";
  }

  function normBescStr(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function findClientForFactRow(fr) {
    if (typeof getClientenItems !== "function") return null;
    var n = parseInt(String(fr.nr == null ? "" : fr.nr).trim(), 10);
    if (isNaN(n)) return null;
    var items = getClientenItems() || [];
    for (var i = 0; i < items.length; i += 1) {
      if (items[i] && Number(items[i].clientnummer) === n) return items[i];
    }
    return null;
  }

  function findBescForFactRow(fr, cl) {
    if (typeof getBeschikkingenItems !== "function" || !cl) return null;
    var all = getBeschikkingenItems() || [];
    var bid = cl.id;
    var cand = [];
    for (var h = 0; h < all.length; h += 1) {
      var b = all[h];
      if (!b || b.gearchiveerd) continue;
      if (String(b.clientId) === String(bid)) cand.push(b);
    }
    if (!cand.length) {
      for (var h2 = 0; h2 < all.length; h2 += 1) {
        if (all[h2] && String(all[h2].clientId) === String(bid)) cand.push(all[h2]);
      }
    }
    if (!cand.length) return null;
    var btxt = normBescStr(fr.besch);
    var best = null;
    var bestScore = 0;
    for (var j = 0; j < cand.length; j += 1) {
      var row = cand[j];
      var nb = normBescStr(row.naam);
      var zb = normBescStr(row.zorgsoortLabel);
      var sc = 0;
      if (btxt && nb) {
        if (btxt === nb) sc = 5;
        else if (nb.indexOf(btxt) >= 0 || btxt.indexOf(nb) >= 0) sc = 3;
      }
      if (btxt && zb && (zb.indexOf(btxt) >= 0 || btxt.indexOf(zb) >= 0)) sc += 1;
      if (sc > bestScore) {
        bestScore = sc;
        best = row;
      }
    }
    return best || cand[0];
  }

  function splitClientLabel(fr) {
    var t = (fr.client == null ? "" : String(fr.client)).trim();
    if (!t) return { v: "", a: "" };
    var u = t.indexOf(" ");
    if (u < 0) return { v: t, a: "" };
    return { v: t.slice(0, u), a: t.slice(u + 1) };
  }

  function factBedrAmount(fr) {
    return amountKey(fr.bedr);
  }

  /** Zelfde mapping als beschikkingen-overzicht `exportCell` wanneer er een beschikking-rij is */
  function exportCellBeschikkingMode(k, r, c) {
    r = r || {};
    c = c || {};
    var loc = (r.locatie && String(r.locatie).trim() && r.locatie !== "—")
      ? String(r.locatie).trim()
      : (c.locatie != null ? String(c.locatie).trim() : "");
    var een = String(r.tariefEenheid || "uur").toLowerCase();
    var verwNaam = c.verwijzerNaam != null && String(c.verwijzerNaam).trim() ? String(c.verwijzerNaam).trim() : "—";
    var verwTel = c.verwijzerTelefoon != null && String(c.verwijzerTelefoon).trim()
      ? String(c.verwijzerTelefoon).trim()
      : (c.verwijzerTel != null && String(c.verwijzerTel).trim() ? String(c.verwijzerTel).trim() : "—");
    var verwMail = c.verwijzerEmail != null && String(c.verwijzerEmail).trim()
      ? String(c.verwijzerEmail).trim()
      : (c.verwijzerMail != null && String(c.verwijzerMail).trim() ? String(c.verwijzerMail).trim() : "—");
    var dz = c.inZorgDatum != null && String(c.inZorgDatum).trim() ? String(c.inZorgDatum).trim() : fmtDLocal(r.startISO);
    switch (k) {
      case "id": return String(r.id || "");
      case "achternaam": return String(c.achternaam || "");
      case "locatie": return loc || "—";
      case "organisatie": return String(c.organisatie || "").trim() || "—";
      case "verw_tel": return verwTel;
      case "datum_in_zorg": return dz;
      case "zorgsoort": return String(r.zorgsoortLabel || "—");
      case "decl_meth": return String(r.declMeth || "—");
      case "eind_dt": return fmtDLocal(r.eindISO);
      case "amb_uur": return "—";
      case "tarief_uur": return een === "uur" ? fmtTariefLocal(r.tariefEur, "uur") : "—";
      case "voornaam": return String(c.voornaam || "");
      case "clientnr": return c.clientnummer != null && c.clientnummer !== "" ? String(c.clientnummer) : "—";
      case "gemeente": return String(c.gemeente || "").trim() || "—";
      case "verw_naam": return verwNaam;
      case "verw_mail": return verwMail;
      case "fase": return faseTextExportF(r.fase);
      case "naam": return String(r.naam || "—");
      case "start_dt": return fmtDLocal(r.startISO);
      case "status": return (String(r.betalingsStatus || "").toLowerCase() === "betaald" ? "Betaald" : "Niet betaald");
      case "openstaand": return fmtEurLocal(r.nogNietGedeclareerd);
      case "maandbedrag": return fmtEurLocal(r.teDeclarerenLM);
      case "tarief_dag": return een === "dag" ? fmtTariefLocal(r.tariefEur, "dag") : "—";
      default: return "—";
    }
  }

  function factExportCell(k, fr, cl, b) {
    if (k === "status") {
      return statusTextExportFromFactRow(fr);
    }
    var c = cl || {};
    if (b) {
      return exportCellBeschikkingMode(k, b, c);
    }
    var sp = splitClientLabel(fr);
    var nrStr = (fr.nr == null ? "" : String(fr.nr)).trim();
    switch (k) {
      case "id": return String(fr.fn || "—");
      case "voornaam": return c.voornaam ? String(c.voornaam) : sp.v;
      case "achternaam": return c.achternaam ? String(c.achternaam) : sp.a;
      case "clientnr": return nrStr || "—";
      case "locatie": return c.locatie != null && String(c.locatie).trim() ? String(c.locatie).trim() : "—";
      case "gemeente": return String(c.gemeente || "").trim() || "—";
      case "organisatie": return String(c.organisatie || "").trim() || "—";
      case "verw_naam": {
        if (c.verwijzerNaam != null && String(c.verwijzerNaam).trim()) return String(c.verwijzerNaam).trim();
        return "—";
      }
      case "verw_tel": {
        if (c.verwijzerTelefoon != null && String(c.verwijzerTelefoon).trim()) return String(c.verwijzerTelefoon).trim();
        if (c.verwijzerTel != null && String(c.verwijzerTel).trim()) return String(c.verwijzerTel).trim();
        return "—";
      }
      case "verw_mail": {
        if (c.verwijzerEmail != null && String(c.verwijzerEmail).trim()) return String(c.verwijzerEmail).trim();
        if (c.verwijzerMail != null && String(c.verwijzerMail).trim()) return String(c.verwijzerMail).trim();
        return "—";
      }
      case "datum_in_zorg": {
        if (c.inZorgDatum != null && String(c.inZorgDatum).trim()) return String(c.inZorgDatum).trim();
        return "—";
      }
      case "fase": return "—";
      case "zorgsoort": return "—";
      case "naam": return String(fr.besch || "—");
      case "decl_meth": {
        if (String(fr.besch == null ? "" : fr.besch).toLowerCase().indexOf("handmatig") >= 0) return "Handmatig";
        return "—";
      }
      case "start_dt": return "—";
      case "eind_dt": return "—";
      case "openstaand": return isBetaaldRow(fr) ? "—" : fmtEurLocal(factBedrAmount(fr));
      case "maandbedrag": return isBetaaldRow(fr) ? fmtEurLocal(factBedrAmount(fr)) : "—";
      case "amb_uur": return "—";
      case "tarief_dag": return "—";
      case "tarief_uur": return "—";
      default: return "—";
    }
  }

  function runFactExportDownload() {
    var keys = [];
    var labels = [];
    for (var i = 0; i < FACT_EXPORT_COLS.length; i += 1) {
      var c = FACT_EXPORT_COLS[i];
      var cb = document.getElementById(__F("fact-ex-cb-" + c.k));
      if (cb && cb.checked) {
        keys.push(c.k);
        labels.push(c.label);
      }
    }
    if (!keys.length) {
      showToast("Selecteer minstens één kolom");
      return;
    }
    var items = getFiltered();
    if (!items.length) {
      showToast("Niets te exporteren.");
      return;
    }
    var dataRows = [];
    for (var r = 0; r < items.length; r += 1) {
      var item = items[r];
      if (!item) continue;
      var cL = findClientForFactRow(item);
      var bE = findBescForFactRow(item, cL);
      var parts = [];
      for (var k = 0; k < keys.length; k += 1) {
        parts.push(String(factExportCell(keys[k], item, cL, bE)));
      }
      dataRows.push(parts);
    }
    var fmtEl = document.getElementById(__F("fact-export-format"));
    var format = fmtEl && fmtEl.value ? fmtEl.value : "xlsx";
    if (typeof runTableExport === "function") {
      var baseName = __FP ? "facturen-beschikking" : "facturen";
      var res = runTableExport({ baseName: baseName, headers: labels, rows: dataRows, format: format });
      if (res && res.ok) {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("exported", baseName + "." + format);
        } else {
          showToast("Export klaar.");
        }
        if (factExportModalEl) {
          factExportModalEl.setAttribute("hidden", "");
          factExportModalEl.setAttribute("aria-hidden", "true");
        }
        return;
      }
      if (res && res.error) {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Export mislukt", res.error);
        } else {
          showToast(res.error);
        }
      }
    }
    var lines = [labels.map(factCsvEsc).join(";")];
    for (var r2 = 0; r2 < items.length; r2 += 1) {
      var it2 = items[r2];
      if (!it2) continue;
      var c2 = findClientForFactRow(it2);
      var b2 = findBescForFactRow(it2, c2);
      var p2 = [];
      for (var k2 = 0; k2 < keys.length; k2 += 1) {
        p2.push(factCsvEsc(factExportCell(keys[k2], it2, c2, b2)));
      }
      lines.push(p2.join(";"));
    }
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "facturen.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("exported", "facturen.csv");
    } else {
      showToast("Export klaar.");
    }
    if (factExportModalEl) {
      factExportModalEl.setAttribute("hidden", "");
      factExportModalEl.setAttribute("aria-hidden", "true");
    }
  }

  function buildFactExportGrid() {
    var grid = document.getElementById(__F("fact-export-grid"));
    if (!grid) return;
    var saved = loadFactExportColState();
    grid.innerHTML = "";
    for (var i = 0; i < FACT_EXPORT_COLS.length; i += 1) {
      var d = FACT_EXPORT_COLS[i];
      var row = document.createElement("div");
      row.className = "fact-export-item";
      row.setAttribute("data-export-label", d.label.toLowerCase());
      var id = __F("fact-ex-cb-" + d.k);
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.id = id;
      inp.className = "fact-ex-cb";
      inp.setAttribute("data-k", d.k);
      if (saved && Object.prototype.hasOwnProperty.call(saved, d.k)) {
        inp.checked = !!saved[d.k];
      } else {
        inp.checked = true;
      }
      var lb = document.createElement("label");
      lb.setAttribute("for", id);
      lb.appendChild(document.createTextNode(d.label));
      row.appendChild(inp);
      row.appendChild(lb);
      grid.appendChild(row);
      inp.addEventListener("change", function () {
        var all = true;
        var cbs = grid.querySelectorAll(".fact-ex-cb");
        var m0 = {};
        for (var t = 0; t < cbs.length; t += 1) {
          var k0 = cbs[t].getAttribute("data-k");
          m0[k0] = cbs[t].checked;
          if (!cbs[t].checked) all = false;
        }
        saveFactExportColState(m0);
        var aEl = document.getElementById(__F("fact-export-all"));
        if (aEl) aEl.checked = all;
      });
    }
    var all0 = document.getElementById(__F("fact-export-all"));
    if (all0) {
      var cbs0 = grid.querySelectorAll(".fact-ex-cb");
      var all1 = true;
      for (var t0 = 0; t0 < cbs0.length; t0 += 1) { if (!cbs0[t0].checked) { all1 = false; break; } }
      all0.checked = all1;
    }
  }

  function filterFactExportColumnList() {
    var sEl = document.getElementById(__F("fact-export-search"));
    var g = document.getElementById(__F("fact-export-grid"));
    if (!sEl || !g) return;
    var q = String(sEl.value || "").toLowerCase().trim();
    var it = g.querySelectorAll(".fact-export-item");
    for (var u = 0; u < it.length; u += 1) {
      var el = it[u];
      var lab = el.getAttribute("data-export-label") || "";
      if (!q || lab.indexOf(q) >= 0) {
        el.classList.remove("is-hidden");
      } else {
        el.classList.add("is-hidden");
      }
    }
  }

  function openFactExportModal() {
    if (!factExportUiReady) return;
    var s = document.getElementById(__F("fact-export-search"));
    if (s) s.value = "";
    filterFactExportColumnList();
    if (factExportModalEl) {
      factExportModalEl.removeAttribute("hidden");
      factExportModalEl.setAttribute("aria-hidden", "false");
    }
    window.setTimeout(function () { if (s) s.focus(); }, 20);
  }

  function initFactExport() {
    factExportModalEl = document.getElementById(__F("fact-export-modal"));
    if (!factExportModalEl) return;
    buildFactExportGrid();
    factExportUiReady = true;
    var s = document.getElementById(__F("fact-export-search"));
    if (s) {
      s.addEventListener("input", function () {
        filterFactExportColumnList();
      });
    }
    var al = document.getElementById(__F("fact-export-all"));
    if (al) {
      al.addEventListener("change", function () {
        var g = document.getElementById(__F("fact-export-grid"));
        if (!g) return;
        var on = al.checked;
        var cbs = g.querySelectorAll(".fact-ex-cb");
        var m0 = {};
        for (var a = 0; a < cbs.length; a += 1) {
          cbs[a].checked = on;
          m0[cbs[a].getAttribute("data-k")] = on;
        }
        saveFactExportColState(m0);
      });
    }
    function closeFactExport() {
      factExportModalEl.setAttribute("hidden", "");
      factExportModalEl.setAttribute("aria-hidden", "true");
    }
    var xb = document.getElementById(__F("fact-export-x"));
    if (xb) xb.addEventListener("click", closeFactExport);
    var cab = document.getElementById(__F("fact-export-cancel"));
    if (cab) cab.addEventListener("click", closeFactExport);
    var cfb = document.getElementById(__F("fact-export-confirm"));
    if (cfb) cfb.addEventListener("click", function () { runFactExportDownload(); });
    factExportModalEl.addEventListener("click", function (e) { if (e.target === factExportModalEl) closeFactExport(); });
  }

  function getSortValue(r, key) {
    if (!r) return "";
    if (key === "fn") return fnSortKey(r.fn);
    if (key === "nr") {
      var n = parseInt(String(r.nr != null ? r.nr : ""), 10);
      return isNaN(n) ? 0 : n;
    }
    if (key === "bedr" || key === "bedrag") return amountKey(r.bedr);
    if (key === "besch") return String(r.besch || "").toLowerCase();
    if (key === "client") return String(r.client || "").toLowerCase();
    if (key === "per") return String(r.per || "").toLowerCase();
    if (key === "beta") return String(r.beta || "").toLowerCase();
    if (key === "st") return String(r.st || "").toLowerCase();
    return "";
  }

  function factStatusPillClass(st) {
    var t = (st == null ? "" : String(st)).trim().toLowerCase();
    if (t.indexOf("nog niet") !== -1) return "fact-status-pill--nog-niet-betaald";
    if (t.indexOf("te declareren") !== -1) return "fact-status-pill--te-declareren";
    if (t.indexOf("betaald") !== -1) return "fact-status-pill--betaald";
    if (t.indexOf("behandeling") !== -1 || t.indexOf("gedeclareerd") !== -1) {
      return "fact-status-pill--in-behandeling";
    }
    return "fact-status-pill--in-behandeling";
  }

  function statusPillHtml(st) {
    var cls = factStatusPillClass(st);
    return '<span class="status-pill fact-status-pill ' + cls + '">' + esc(st) + "</span>";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  var TRASH_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function syncFactHeaderDelBtn() {
    if (!delBtn0) return;
    var inArchH = elArch && elArch.checked;
    if (inArchH) {
      delBtn0.setAttribute("aria-label", "Geselecteerde facturen definitief verwijderen");
      delBtn0.title = "Geselecteerde definitief verwijderen";
    } else {
      delBtn0.setAttribute("aria-label", "Geselecteerde facturen archiveren");
      delBtn0.removeAttribute("title");
    }
  }

  function setColumnVisible(colId, visible) {
    if (!table) return;
    table.querySelectorAll('[data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    if (!factColsList) return;
    factColsList.querySelectorAll(".column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setColumnVisible(colId, isOn);
    });
  }

  function buildColumnsPanel() {
    if (!factColsList) return;
    factColsList.innerHTML = "";
    TOGGLE_COLS.forEach(function (c) {
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "column-toggle is-checked";
      btn.setAttribute("data-col", c.col);
      btn.setAttribute("role", "menuitemcheckbox");
      btn.setAttribute("aria-checked", "true");
      btn.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + esc(c.label);
      li.appendChild(btn);
      factColsList.appendChild(li);
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        var on = btn.getAttribute("aria-checked") === "true";
        btn.setAttribute("aria-checked", on ? "false" : "true");
        btn.classList.toggle("is-checked", !on);
        applyColumnVisibility();
      });
    });
  }

  function syncSortTh() {
    if (!table) return;
    table.querySelectorAll("thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc", "th-sort-open");
      var k = th.getAttribute("data-fact-sort");
      if (k && k === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  function render() {
    var items = getFiltered();
    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var end = Math.min(start + pageSize, total);
    var page = items.slice(start, end);

    var isArchV2 = !!(elArch && elArch.checked);
    tbody.innerHTML = "";
    if (!page.length) {
      var trE = document.createElement("tr");
      var tdE = document.createElement("td");
      tdE.colSpan = 10;
      tdE.className = "cl-empty-cell";
      tdE.textContent = isArchV2 ? "Geen gearchiveerde factuurregels (pas het filter of zoekveld aan)." : "Geen actieve factuurregels voor dit filter.";
      trE.appendChild(tdE);
      tbody.appendChild(trE);
    } else {
      page.forEach(function (r, idx) {
        var rKey = factRowKey(r);
        var tr = document.createElement("tr");
        tr.className = "fact-data-row";
        tr.setAttribute("data-row-ix", String(start + idx));
        tr.setAttribute("data-fact-k", rKey);

        // Rij klikbaar → factuur-detail (BS2-conform). Het echte id wordt op
        // de rij gezet; de navigatie loopt via de gedelegeerde tbody-click
        // handler (overleeft re-renders, één bron van waarheid).
        var __fid = (rKey && rKey.indexOf("id:") === 0) ? rKey.slice(3) : (r && r.id ? String(r.id) : "");
        if (__fid) {
          tr.classList.add("fct-row-click");
          tr.setAttribute("data-fact-id", __fid);
        }

        var td0 = document.createElement("td");
        td0.setAttribute("data-col", "select");
        var rid = __F("fact-chk-") + start + "-" + idx;
        td0.innerHTML = '<input type="checkbox" class="table-checkbox fact-row-check" id="' + rid + '" aria-label="Selecteer regel" />';
        tr.appendChild(td0);

        function addText(col, val, isDash) {
          var td = document.createElement("td");
          td.setAttribute("data-col", col);
          var v = val;
          if (isDash && (v === "-" || v === "–" || (v != null && String(v).trim() === ""))) {
            td.textContent = "—";
          } else {
            td.textContent = v != null && String(v).trim() !== "" ? String(v) : "—";
          }
          tr.appendChild(td);
        }

        // Factuurnummer = echte link naar factuur-detail (native <a> →
        // navigeert altijd, geen JS-handler-afhankelijkheid).
        (function () {
          var td = document.createElement("td");
          td.setAttribute("data-col", "fn");
          var label = (r.fn != null && String(r.fn).trim() !== "") ? String(r.fn) : "—";
          if (__fid) {
            var a = document.createElement("a");
            a.href = "factuur-detail.html?id=" + encodeURIComponent(__fid);
            a.className = "fct-fn-link";
            a.textContent = label;
            td.appendChild(a);
          } else {
            td.textContent = label;
          }
          tr.appendChild(td);
        })();
        addText("besch", r.besch, false);
        addText("client", r.client, false);
        addText("nr", r.nr, false);
        addText("per", r.per, false);
        addText("beta", r.beta, true);

        var tdSt = document.createElement("td");
        tdSt.setAttribute("data-col", "st");
        tdSt.innerHTML = statusPillHtml(r.st);
        tr.appendChild(tdSt);

        var tdB = document.createElement("td");
        tdB.setAttribute("data-col", "bedrag");
        tdB.className = "fact-td-bedrag";
        tdB.textContent = r.bedr != null && String(r.bedr).trim() !== "" ? String(r.bedr) : "—";
        tr.appendChild(tdB);

        var tdAct = document.createElement("td");
        tdAct.setAttribute("data-col", "act");
        tdAct.className = "cl-actions-cell fact-ov-actions-cell";
        if (isArchV2) {
          var w = document.createElement("div");
          w.className = "hr-row-actions";
          var br = document.createElement("button");
          br.type = "button";
          br.className = "btn-outline hr-restore-btn fact-ov-restore-btn";
          br.setAttribute("data-fact-k", rKey);
          br.textContent = "Herstel";
          var pb = document.createElement("button");
          pb.type = "button";
          pb.className = "employee-delete-btn fact-ov-purge-btn";
          pb.setAttribute("data-fact-k", rKey);
          pb.setAttribute("aria-label", "Definitief verwijderen");
          pb.innerHTML = TRASH_SVG;
          w.appendChild(br);
          w.appendChild(pb);
          tdAct.appendChild(w);
        } else {
          var ab = document.createElement("button");
          ab.type = "button";
          ab.className = "employee-delete-btn fact-ov-arch-btn";
          ab.setAttribute("data-fact-k", rKey);
          ab.setAttribute("aria-label", "Archiveren");
          ab.innerHTML = TRASH_SVG;
          tdAct.appendChild(ab);
        }
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();
    syncSortTh();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        rangeEl.textContent = start + 1 + "–" + end + " van " + total + " totaal";
      }
    }
    if (pageEl) {
      pageEl.textContent = total === 0 ? "Pagina 0 van 0" : "Pagina " + (currentPage + 1) + " van " + totalPages;
    }

    var first = document.getElementById(__F("fact-pager-first"));
    var prev = document.getElementById(__F("fact-pager-prev"));
    var next = document.getElementById(__F("fact-pager-next"));
    var last = document.getElementById(__F("fact-pager-last"));
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;

    syncFactHeaderDelBtn();
    if (checkAll) checkAll.checked = false;
  }

  function onFilterChange() {
    currentPage = 0;
    render();
  }

  if (searchInput) searchInput.addEventListener("input", onFilterChange);
  if (elStatus) elStatus.addEventListener("change", onFilterChange);
  if (elDecm) elDecm.addEventListener("change", onFilterChange);
  if (elPer) elPer.addEventListener("change", onFilterChange);
  if (elBeta) elBeta.addEventListener("change", onFilterChange);
  if (elExpiring) elExpiring.addEventListener("change", onFilterChange);
  if (elArch) elArch.addEventListener("change", onFilterChange);
  if (rowsSelect) rowsSelect.addEventListener("change", onFilterChange);

  if (elReset) {
    elReset.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      if (elStatus) elStatus.value = "";
      if (elDecm) elDecm.value = "";
      if (elPer) elPer.value = "";
      if (elBeta) elBeta.value = "";
      if (elExpiring) elExpiring.checked = false;
      if (elArch) elArch.checked = false;
      onFilterChange();
    });
  }

  if (table) {
    table.querySelectorAll(".th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var k = th ? th.getAttribute("data-fact-sort") : "";
        if (!k) return;
        if (sortKey === k) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = k;
          sortDir = k === "fn" || k === "bedr" || k === "nr" ? "desc" : "asc";
        }
        onFilterChange();
      });
    });
  }

  if (checkAll) {
    checkAll.addEventListener("change", function () {
      var on = checkAll.checked;
      tbody.querySelectorAll(".fact-row-check").forEach(function (c) { c.checked = on; });
    });
  }
  if (tbody) {
    tbody.addEventListener("change", function (e) {
      if (e.target && e.target.classList && e.target.classList.contains("fact-row-check") && checkAll) {
        checkAll.checked = false;
      }
    });
    tbody.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var a1 = t.closest("button.fact-ov-arch-btn");
      if (a1) {
        e.preventDefault();
        var k0 = a1.getAttribute("data-fact-k");
        if (k0) { openFactArchModal([k0]); }
        return;
      }
      var r1 = t.closest("button.fact-ov-restore-btn");
      if (r1) {
        e.preventDefault();
        var k1 = r1.getAttribute("data-fact-k");
        if (k1) {
          factRestoreKey(k1);
          if (typeof showSaveModal === "function") showSaveModal("Factuurregel is hersteld.", "Hersteld");
          else showToast("Factuurregel hersteld.");
          currentPage = 0;
          render();
        }
        return;
      }
      var p1 = t.closest("button.fact-ov-purge-btn");
      if (p1) {
        e.preventDefault();
        var k2 = p1.getAttribute("data-fact-k");
        if (k2) { openFactPurgeModal([k2]); }
        return;
      }
      // Rij-klik → factuur-detail (BS2-conform). Niet bij checkbox/knop of
      // de select-/acties-kolom. Gedelegeerd = overleeft re-renders.
      if (t.tagName === "INPUT" || t.tagName === "BUTTON" || t.closest("button") || t.closest("a")) return;
      var cellX = t.closest("td");
      var colX = cellX && cellX.getAttribute("data-col");
      if (colX === "select" || colX === "act") return;
      var trX = t.closest("tr.fact-data-row");
      var fidX = trX && trX.getAttribute("data-fact-id");
      if (fidX) {
        window.location.href = "factuur-detail.html?id=" + encodeURIComponent(fidX);
      }
    });
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById(__F("fact-pager-" + action));
    if (!btn) return;
    btn.addEventListener("click", function () {
      var items = getFiltered();
      var pageSize = getPageSize();
      var tot = items.length;
      var totalPages = Math.max(1, Math.ceil(tot / pageSize));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  if (factColsBtn && factColsPanel) {
    factColsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (factColsPanel.hasAttribute("hidden")) {
        factColsPanel.removeAttribute("hidden");
        factColsBtn.setAttribute("aria-expanded", "true");
      } else {
        factColsPanel.setAttribute("hidden", "");
        factColsBtn.setAttribute("aria-expanded", "false");
      }
    });
    factColsPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  document.addEventListener("click", function () {
    if (factColsPanel) {
      factColsPanel.setAttribute("hidden", "");
      if (factColsBtn) factColsBtn.setAttribute("aria-expanded", "false");
    }
  });

  function resetFactStatusCombo() {
    var hi = document.getElementById(__F("fact-add-st"));
    var tx = document.getElementById(__F("fact-add-st-text"));
    var btn = document.getElementById(__F("fact-add-st-btn"));
    var menu = document.getElementById(__F("fact-add-st-menu"));
    if (hi) hi.value = "";
    if (tx) {
      tx.className = "fact-add-st-trigger-text fact-add-st-trigger-text--placeholder";
      tx.textContent = "Selecteer een status…";
    }
    if (menu) menu.setAttribute("hidden", "");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function initFactStatusCombo() {
    var btn = document.getElementById(__F("fact-add-st-btn"));
    var menu = document.getElementById(__F("fact-add-st-menu"));
    var hi = document.getElementById(__F("fact-add-st"));
    var tx = document.getElementById(__F("fact-add-st-text"));
    var combo = document.getElementById(__F("fact-add-st-combo"));
    if (!btn || !menu) return;
    function closeMenu() {
      menu.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      menu.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    }
    function setValue(val) {
      if (hi) hi.value = val;
      if (tx) {
        var cls = factStatusPillClass(val);
        tx.className = "fact-add-st-trigger-text";
        tx.innerHTML = '<span class="status-pill fact-status-pill ' + cls + '">' + esc(val) + "</span>";
      }
      closeMenu();
    }
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (menu.hasAttribute("hidden")) openMenu();
      else closeMenu();
    });
    menu.querySelectorAll(".fact-add-st-opt").forEach(function (ob) {
      ob.addEventListener("click", function (e) {
        e.preventDefault();
        setValue((ob.getAttribute("data-value") || "").trim());
      });
    });
    document.addEventListener("click", function (ev) {
      if (!combo || !menu) return;
      if (menu.hasAttribute("hidden")) return;
      if (!combo.contains(ev.target)) closeMenu();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (menu && !menu.hasAttribute("hidden")) closeMenu();
    });
  }

  function openFactAddModal() {
    var m = document.getElementById(__F("fact-add-modal"));
    if (!m) return;
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
    var elBesch = document.getElementById(__F("fact-add-besch"));
    if (window.__FVIEW_BESC && elBesch) {
      elBesch.value = String(window.__FVIEW_BESC.naam || "").trim();
      elBesch.disabled = true;
    } else if (elBesch) {
      elBesch.disabled = false;
    }
    var fn0 = document.getElementById(__F("fact-add-fn"));
    window.setTimeout(function () { if (fn0) fn0.focus(); }, 20);
  }

  function closeFactAddModal() {
    var m = document.getElementById(__F("fact-add-modal"));
    if (!m) return;
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
    var f = document.getElementById(__F("fact-add-form"));
    if (f && f.reset) f.reset();
    var elB2 = document.getElementById(__F("fact-add-besch"));
    if (elB2) elB2.disabled = false;
    resetFactStatusCombo();
  }

  function fmtPerFromDates(sIso, eIso) {
    function p(iso) {
      if (!iso) return "—";
      var d = new Date(String(iso) + "T12:00:00");
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    }
    if (!sIso && !eIso) return "—";
    return p(sIso) + " - " + p(eIso);
  }

  async function onFactAddSubmit(e) {
    e.preventDefault();
    var elFn = document.getElementById(__F("fact-add-fn"));
    var elB = document.getElementById(__F("fact-add-besch"));
    var elS = document.getElementById(__F("fact-add-s"));
    var elE = document.getElementById(__F("fact-add-e"));
    var elSt = document.getElementById(__F("fact-add-st"));
    var fnV = elFn && elFn.value ? elFn.value.trim() : "";
    if (!fnV) {
      showToast("Vul een factuurnummer in.");
      return;
    }
    var beschVal = (elB && elB.value) ? elB.value.trim() : "";
    if (window.__FVIEW_BESC && window.__FVIEW_BESC.naam) {
      beschVal = String(window.__FVIEW_BESC.naam).trim();
    }
    if (!beschVal) {
      showToast("Kies een beschikking.");
      return;
    }
    if (!elSt || !elSt.value) {
      showToast("Kies een status.");
      return;
    }
    var stV = elSt.value;
    var isPaid = String(stV).toLowerCase() === "betaald";
    var betaD = isPaid
      ? new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })
      : "-";
    var newRow = {
      id: "fs" + Date.now() + "x" + Math.random().toString(36).slice(2, 10),
      fromSupp: true,
      fn: fnV,
      besch: beschVal,
      client: "—",
      nr: "—",
      per: fmtPerFromDates(elS && elS.value, elE && elE.value),
      beta: betaD,
      st: stV,
      bedr: "€ 0,00"
    };
    if (window.__FVIEW_BESC && window.__FVIEW_BESC.id) {
      newRow.bescId = window.__FVIEW_BESC.id;
    }
    raw.push(newRow);
    // Schrijf de nieuwe factuur door naar Supabase (Supabase = source of truth).
    // Werkpatronen.md regel #0: await + foutmelding zichtbaar maken; geen silent skip / silent catch.
    if (!window.facturenDB || typeof window.facturenDB.add !== "function") {
      showToast("Database niet geladen — herlaad de pagina en probeer opnieuw.");
      return;
    }
    try {
      await window.facturenDB.add(newRow);
    } catch (err) {
      console.error("[facturenDB] add (modal) sync mislukt:", err);
      var msg = (err && err.message) ? err.message : String(err);
      if (typeof window.showError === "function") window.showError("Opslaan in database mislukt: " + msg);
      else if (typeof showSaveModal === "function") showSaveModal("Opslaan in database mislukt: " + msg);
      else showToast("Opslaan mislukt: " + msg);
      return;
    }
    closeFactAddModal();
    if (typeof showSaveModal === "function") showSaveModal("Factuur is toegevoegd.");
    else showToast("Factuur toegevoegd.");
    currentPage = 0;
    render();
  }

  var factPurgeKeyBuf = null;
  var factArchKeyBuf = null;

  function getSelectedFactKeys() {
    var out = [];
    if (!tbody) return out;
    var chks = tbody.querySelectorAll("tr.fact-data-row .fact-row-check:checked");
    for (var c = 0; c < chks.length; c += 1) {
      var tr0 = chks[c].closest && chks[c].closest("tr.fact-data-row");
      if (tr0) {
        var kk = tr0.getAttribute("data-fact-k");
        if (kk) out.push(kk);
      }
    }
    return out;
  }

  // Helper: haal het echte database-id uit een factRowKey ("id:f_0001" → "f_0001").
  function factKeyToId(k) {
    if (!k) return null;
    if (typeof k === "string" && k.indexOf("id:") === 0) return k.slice(3);
    return null;
  }

  function syncFactToDb(method, id) {
    if (!id) return;
    if (!window.facturenDB || typeof window.facturenDB[method] !== "function") return;
    window.facturenDB[method](id).catch(function (err) {
      console.error("[facturenDB] " + method + " sync mislukt:", err);
    });
  }

  function factRestoreKey(k) {
    if (!k) return;
    if (factArchived.indexOf(k) === -1) return;
    factArchived = factArchived.filter(function (x) { return x !== k; });
    saveFactArchived();
    // Update lokale raw record archived flag + sync naar DB
    for (var i = 0; i < raw.length; i += 1) {
      if (raw[i] && factRowKey(raw[i]) === k) { raw[i].archived = false; break; }
    }
    syncFactToDb("restore", factKeyToId(k));
  }

  function performFactArchive(keyList) {
    if (!keyList || !keyList.length) return 0;
    for (var q = 0; q < keyList.length; q += 1) {
      var k0 = keyList[q];
      if (!k0) continue;
      if (factArchived.indexOf(k0) === -1) factArchived.push(k0);
      for (var ri = 0; ri < raw.length; ri += 1) {
        if (raw[ri] && factRowKey(raw[ri]) === k0) { raw[ri].archived = true; break; }
      }
      syncFactToDb("archive", factKeyToId(k0));
    }
    saveFactArchived();
    return keyList.length;
  }

  function performFactPurge(keyList) {
    if (!keyList || !keyList.length) return 0;
    for (var q1 = 0; q1 < keyList.length; q1 += 1) {
      var kTarget = keyList[q1];
      if (!kTarget) continue;
      if (factArchived.indexOf(kTarget) !== -1) {
        factArchived = factArchived.filter(function (x) { return x !== kTarget; });
      }
      var rF = null;
      for (var i = 0; i < raw.length; i += 1) {
        if (raw[i] && factRowKey(raw[i]) === kTarget) { rF = raw[i]; break; }
      }
      if (!rF) continue;
      // Ongeacht supp/base: hard delete in Supabase als het een DB-id heeft.
      var dbId = factKeyToId(kTarget);
      if (dbId) syncFactToDb("delete", dbId);
      if (rF.fromSupp) {
        raw = raw.filter(function (x) { return !x || factRowKey(x) !== kTarget; });
      } else {
        // Lokaal verbergen via factPurged-array (DB-call regelt de
        // permanente verwijdering; bij volgende refresh is de rij weg).
        if (factPurged.indexOf(kTarget) === -1) factPurged.push(kTarget);
      }
    }
    saveFactArchived();
    saveFactPurged();
    return keyList.length;
  }

  function openFactArchModal(keys) {
    factArchKeyBuf = keys && keys.length ? keys.slice() : null;
    var mA = document.getElementById(__F("fact-arch-modal"));
    var pA = document.getElementById(__F("fact-arch-preview"));
    var slA = document.getElementById(__F("fact-arch-slider"));
    var oA = document.getElementById(__F("fact-arch-ok"));
    if (!mA) return;
    if (pA) {
      var nA = factArchKeyBuf ? factArchKeyBuf.length : 0;
      pA.textContent = "Na bevestiging: " + nA + (nA === 1 ? " regel" : " regels") + " in Gearchiveerd zetten.";
    }
    if (slA) { slA.value = "0"; if (oA) oA.disabled = true; }
    mA.removeAttribute("hidden");
    mA.setAttribute("aria-hidden", "false");
  }
  function closeFactArchModal() {
    factArchKeyBuf = null;
    var mAc = document.getElementById(__F("fact-arch-modal"));
    var sAc = document.getElementById(__F("fact-arch-slider"));
    var oAc = document.getElementById(__F("fact-arch-ok"));
    if (mAc) { mAc.setAttribute("hidden", ""); mAc.setAttribute("aria-hidden", "true"); }
    if (sAc) { sAc.value = "0"; if (oAc) oAc.disabled = true; }
  }

  function openFactPurgeModal(keys) {
    factPurgeKeyBuf = keys && keys.length ? keys.slice() : null;
    var m = document.getElementById(__F("fact-purge-modal"));
    var p = document.getElementById(__F("fact-purge-preview"));
    var sl = document.getElementById(__F("fact-purge-slider"));
    var o = document.getElementById(__F("fact-purge-ok"));
    if (!m) return;
    if (p) {
      var c0 = factPurgeKeyBuf ? factPurgeKeyBuf.length : 0;
      p.textContent = "Je gaat " + c0 + (c0 === 1 ? " regel definitief verwijderen (na bevestiging)." : " regels definitief verwijderen (na bevestiging).");
    }
    if (sl) { sl.value = "0"; if (o) o.disabled = true; }
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
  }
  function closeFactPurgeModal() {
    factPurgeKeyBuf = null;
    var m2 = document.getElementById(__F("fact-purge-modal"));
    var sl2 = document.getElementById(__F("fact-purge-slider"));
    var o2 = document.getElementById(__F("fact-purge-ok"));
    if (m2) { m2.setAttribute("hidden", ""); m2.setAttribute("aria-hidden", "true"); }
    if (sl2) { sl2.value = "0"; if (o2) o2.disabled = true; }
  }

  if (exportBtn) exportBtn.addEventListener("click", openFactExportModal);
  if (delBtn0) {
    delBtn0.addEventListener("click", function () {
      var ks0 = getSelectedFactKeys();
      if (!ks0.length) {
        showToast("Selecteer eerst één of meer factuurregels (selectievak).");
        return;
      }
      if (elArch && elArch.checked) {
        openFactPurgeModal(ks0);
      } else {
        openFactArchModal(ks0);
      }
    });
  }
  (function initFactArch() {
    var pSlA = document.getElementById(__F("fact-arch-slider"));
    if (pSlA) {
      pSlA.addEventListener("input", function (e) {
        var c0 = document.getElementById(__F("fact-arch-ok"));
        if (c0) c0.disabled = Number(e.target.value) < 100;
      });
    }
    [ __F("fact-arch-x"), __F("fact-arch-cancel") ].forEach(function (id) {
      var bA = document.getElementById(id);
      if (bA) bA.addEventListener("click", closeFactArchModal);
    });
    var mAx = document.getElementById(__F("fact-arch-modal"));
    if (mAx) mAx.addEventListener("click", function (e) { if (e.target === mAx) closeFactArchModal(); });
    var okA = document.getElementById(__F("fact-arch-ok"));
    if (okA) {
      okA.addEventListener("click", function () {
        var uA = factArchKeyBuf;
        factArchKeyBuf = null;
        if (!uA || !uA.length) { closeFactArchModal(); return; }
        performFactArchive(uA);
        if (checkAll) checkAll.checked = false;
        currentPage = 0;
        render();
        closeFactArchModal();
        if (typeof showSaveModal === "function") {
          showSaveModal(uA.length === 1 ? "1 factuurregel is gearchiveerd." : uA.length + " factuurregels zijn gearchiveerd.", "Gearchiveerd");
        } else {
          showToast(uA.length === 1 ? "Gearchiveerd (1 regel)." : "Gearchiveerd (" + uA.length + " regels).");
        }
      });
    }
  }());
  (function initFactPurge() {
    var pSl = document.getElementById(__F("fact-purge-slider"));
    if (pSl) {
      pSl.addEventListener("input", function (e) {
        var c0 = document.getElementById(__F("fact-purge-ok"));
        if (c0) c0.disabled = Number(e.target.value) < 100;
      });
    }
    [ __F("fact-purge-x"), __F("fact-purge-cancel") ].forEach(function (id) {
      var b0 = document.getElementById(id);
      if (b0) b0.addEventListener("click", closeFactPurgeModal);
    });
    var m3 = document.getElementById(__F("fact-purge-modal"));
    if (m3) {
      m3.addEventListener("click", function (e) { if (e.target === m3) closeFactPurgeModal(); });
    }
    var ok0 = document.getElementById(__F("fact-purge-ok"));
    if (ok0) {
      ok0.addEventListener("click", function () {
        var use = factPurgeKeyBuf;
        factPurgeKeyBuf = null;
        if (!use || !use.length) { closeFactPurgeModal(); return; }
        performFactPurge(use);
        if (checkAll) checkAll.checked = false;
        currentPage = 0;
        render();
        closeFactPurgeModal();
        if (typeof showSaveModal === "function") {
          showSaveModal(use.length === 1 ? "1 regel is definitief verwijderd." : use.length + " regels zijn definitief verwijderd.", "Verwijderd");
        } else {
          showToast(use.length === 1 ? "Definitief verwijderd (1 regel)." : "Definitief verwijderd (" + use.length + " regels).");
        }
      });
    }
  }());
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    var mAr = document.getElementById(__F("fact-arch-modal"));
    if (mAr && !mAr.hasAttribute("hidden")) { ev.preventDefault(); closeFactArchModal(); return; }
    var m4 = document.getElementById(__F("fact-purge-modal"));
    if (m4 && !m4.hasAttribute("hidden")) { ev.preventDefault(); closeFactPurgeModal(); return; }
    // Bug #58 fix: Escape voor add-modal + export-modal
    var mAdd = document.getElementById(__F("fact-add-modal"));
    if (mAdd && !mAdd.hasAttribute("hidden")) { ev.preventDefault(); closeFactAddModal(); return; }
    var mExp = document.getElementById(__F("fact-export-modal"));
    if (mExp && !mExp.hasAttribute("hidden")) { ev.preventDefault(); mExp.setAttribute("hidden", ""); mExp.setAttribute("aria-hidden", "true"); }
  });
  if (addBtn) addBtn.addEventListener("click", openFactAddModal);
  (function initFactAddModal() {
    var f = document.getElementById(__F("fact-add-form"));
    var m = document.getElementById(__F("fact-add-modal"));
    if (f) f.addEventListener("submit", onFactAddSubmit);
    var x = document.getElementById(__F("fact-add-x"));
    var c = document.getElementById(__F("fact-add-cancel"));
    if (x) x.addEventListener("click", function () { closeFactAddModal(); });
    if (c) c.addEventListener("click", function () { closeFactAddModal(); });
    if (m) {
      m.addEventListener("click", function (ev) { if (ev.target === m) closeFactAddModal(); });
    }
    initFactStatusCombo();
  }());

  initFactExport();
  populatePeriodeOptions();
  buildColumnsPanel();
  applyColumnVisibility();

  render();
  if (__FP) {
    window.__bdtlFactRerender = function () { currentPage = 0; render(); };
  }

  // Wanneer facturen-data.js de Supabase-data heeft binnengehaald (of bij een
  // externe wijziging), bouw `raw` opnieuw op uit FACTUREN_BULK en re-render.
  // Dit zorgt dat een nieuwe gebruiker (lege localStorage) toch direct alle
  // 956+ facturen ziet, en dat archive/purge-acties op andere tabs doorkomen.
  window.addEventListener("besa:facturen-updated", function () {
    rebuildFromBulk();
    // factPurged wordt bij refresh gewist: hard-deleted records zijn al weg
    // uit FACTUREN_BULK, dus de purge-flag is overbodig.
    factPurged = [];
    try { localStorage.setItem(LS_FACT_PURGED, "[]"); } catch (e) { /* */ }
    currentPage = 0;
    render();
  });
})();
