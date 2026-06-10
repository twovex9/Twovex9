/* global getBeschikkingenItems, getClientenItems, getClientenById, getBescZorgsoortLabel, addBeschikkingRij, removeBeschikkingById, setBeschikkingField, SUPPORTED_ZORGSOORT_KEYS_BESC, runTableExport, document, window, localStorage, showSaveModal */
(function () {
  "use strict";

  if (typeof getBeschikkingenItems !== "function") return;

  /** Alleen voor beschikkingen.html (overzicht) — Exporteren-modal; volgorde = exportkolomvolgorde */
  var BESC_EXPORT_COLS = [
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
    { k: "productcode", label: "Productcode" },
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
  var LS_EXPORT = "besc_export_cols_v3";
  var exportModalEl = null;
  var bescExportUiReady = false;

  var toastEl = document.getElementById("besc-toast");
  var tbody = document.getElementById("besc-tbody");
  var searchEl = document.getElementById("besc-search");
  var archEl = document.getElementById("besc-arch");
  var f60 = document.getElementById("besc-f-60");
  var fted = document.getElementById("besc-f-ted");
  var fng = document.getElementById("besc-f-ng");
  var selZ = document.getElementById("besc-sel-zorg");
  var selF = document.getElementById("besc-sel-fase");
  var selP = document.getElementById("besc-sel-pay");
  var selD = document.getElementById("besc-sel-dec");
  var pageSizeEl = document.getElementById("besc-rows-per-page");
  var rangeEl = document.getElementById("besc-pager-range");
  var pageLabel = document.getElementById("besc-pager-page");
  var emptyRow = document.getElementById("besc-empty");
  var addModal = document.getElementById("besc-add-modal");
  var purgeModal = document.getElementById("besc-purge-modal");
  var colsPanel = document.getElementById("besc-cols-panel");
  var colsBtn = document.getElementById("besc-cols-btn");
  var colsList = document.getElementById("besc-cols-list");
  var table = document.getElementById("besc-table");

  var currentPage = 0;
  var purgeId = null;
  var SS_BESC_OV = "besc_ov_ui_v1";

  function bescGetMainScrollEl() {
    return document.querySelector("main.content");
  }
  function bescGetScrollTop() {
    var m = bescGetMainScrollEl();
    if (m) return m.scrollTop;
    return window.scrollY || 0;
  }
  function bescSetScrollTop(y) {
    if (y == null || isNaN(y)) return;
    var m = bescGetMainScrollEl();
    if (m) m.scrollTop = y;
    else window.scrollTo(0, y);
  }
  function bescReadOvSession() {
    try {
      var raw = sessionStorage.getItem(SS_BESC_OV);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  function bescPersistOvSession() {
    try {
      var o = {
        search: searchEl && searchEl.value != null ? searchEl.value : "",
        arch: archEl && !!archEl.checked,
        f60: f60 && !!f60.checked,
        fted: fted && !!fted.checked,
        fng: fng && !!fng.checked,
        selZ: selZ && selZ.value != null ? selZ.value : "",
        selF: selF && selF.value != null ? selF.value : "",
        selP: selP && selP.value != null ? selP.value : "",
        selD: selD && selD.value != null ? selD.value : "",
        currentPage: currentPage,
        pageSize: pageSizeEl && pageSizeEl.value != null ? pageSizeEl.value : "",
        scrollY: bescGetScrollTop(),
      };
      sessionStorage.setItem(SS_BESC_OV, JSON.stringify(o));
    } catch (e) { /* */ }
  }
  function bescApplyOvSession(s) {
    if (!s || typeof s !== "object") return;
    if (searchEl && s.search != null) searchEl.value = s.search;
    if (archEl && typeof s.arch === "boolean") archEl.checked = s.arch;
    if (f60 && typeof s.f60 === "boolean") f60.checked = s.f60;
    if (fted && typeof s.fted === "boolean") fted.checked = s.fted;
    if (fng && typeof s.fng === "boolean") fng.checked = s.fng;
    if (selZ && s.selZ != null) selZ.value = s.selZ;
    if (selF && s.selF != null) selF.value = s.selF;
    if (selP && s.selP != null) selP.value = s.selP;
    if (selD && s.selD != null) selD.value = s.selD;
    if (typeof s.currentPage === "number" && s.currentPage >= 0) currentPage = s.currentPage;
    if (pageSizeEl && s.pageSize != null) pageSizeEl.value = s.pageSize;
  }
  function bescScheduleScrollRestore(y) {
    if (y == null || isNaN(y)) return;
    requestAnimationFrame(function () {
      bescSetScrollTop(y);
      requestAnimationFrame(function () {
        bescSetScrollTop(y);
      });
    });
  }
  var colState = { client: true, naam: true, productcode: false, gemeente: true, zorg: true, fase: true, per: true, tarf: true, ted: true, ng: true, dm: true, st: true, act: true, sel: true };
  var COLS_ORDER = [
    { id: "client", label: "Cliënt" },
    { id: "naam", label: "Naam" },
    { id: "productcode", label: "Productcode" },
    { id: "gemeente", label: "Gemeente" },
    { id: "zorg", label: "Zorgsoort" },
    { id: "fase", label: "Fase" },
    { id: "per", label: "Periode" },
    { id: "tarf", label: "Tarief" },
    { id: "ted", label: "Te declareren LM" },
    { id: "ng", label: "Nog niet gedeclareerd" },
    { id: "dm", label: "Declaratie methode" },
    { id: "st", label: "Status" },
  ];

  var TRASH_SVG = '<svg class="cl-trash-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  function escHtmlOv(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function n2(x) {
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

  function loadColState() {
    try {
      var raw = localStorage.getItem("besc_ov_cols_v1");
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") Object.keys(colState).forEach(function (k) { if (k in p) colState[k] = !!p[k]; });
      }
    } catch (e) { /* */ }
  }

  function saveColState() {
    try {
      localStorage.setItem("besc_ov_cols_v1", JSON.stringify(colState));
    } catch (e) { /* */ }
  }

  function parseYMDLocal(s) {
    if (!s) return null;
    var str = String(s).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str);
    var p = str.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function fmtD(iso) {
    if (!iso) return "—";
    var s = String(iso).trim();
    var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseYMDLocal(s) : new Date(s);
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtEur(n) {
    if (n == null || n === 0) return "—";
    if (n2(n) === 0) return "—";
    return "€\u00a0" + n2(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPeriode(s, e) {
    if (!s && !e) return "—";
    return (fmtD(s) || "—") + " – " + (fmtD(e) || "—");
  }

  function fmtTarief(eur, een) {
    if (eur == null) return "—";
    var a = n2(eur);
    if (a === 0) return "€\u00a0" + a.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/" + (een || "uur");
    var u = (een || "uur") === "week" ? "/week" : ((een || "uur") === "dag" ? "/dag" : "/uur");
    return "€\u00a0" + a.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + u;
  }

  function faseTextExport(f) {
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

  function statusTextExport(b) {
    if (String(b || "").toLowerCase() === "betaald") return "Betaald";
    return "Niet betaald";
  }

  function exportCl(r) {
    if (typeof getClientenById !== "function" || !r || !r.clientId) return null;
    return getClientenById(r.clientId) || null;
  }

  function exportCell(k, r, cl) {
    var c = cl || {};
    var loc = (r.locatie && String(r.locatie).trim() && r.locatie !== "—")
      ? String(r.locatie).trim()
      : (c.locatie != null ? String(c.locatie).trim() : "");
    var een = String(r.tariefEenheid || "uur").toLowerCase();
    var verwNaam = c.verwijzerNaam != null && String(c.verwijzerNaam).trim() ? String(c.verwijzerNaam).trim() : "—";
    var verwTel = c.verwijzerTelefoon != null && String(c.verwijzerTelefoon).trim() ? String(c.verwijzerTelefoon).trim() : (c.verwijzerTel != null && String(c.verwijzerTel).trim() ? String(c.verwijzerTel).trim() : "—");
    var verwMail = c.verwijzerEmail != null && String(c.verwijzerEmail).trim() ? String(c.verwijzerEmail).trim() : (c.verwijzerMail != null && String(c.verwijzerMail).trim() ? String(c.verwijzerMail).trim() : "—");
    var datumInZorg = c.inZorgDatum != null && String(c.inZorgDatum).trim() ? String(c.inZorgDatum).trim() : fmtD(r.startISO);
    switch (k) {
      case "id": return String(r.id || "");
      case "achternaam": return String(c.achternaam || "");
      case "locatie": return loc || "—";
      case "organisatie": return String(c.organisatie || "").trim() || "—";
      case "verw_tel": return verwTel;
      case "datum_in_zorg": return datumInZorg;
      case "zorgsoort": return String(r.zorgsoortLabel || "—");
      case "decl_meth": return String(r.declMeth || "—");
      case "eind_dt": return fmtD(r.eindISO);
      case "amb_uur": return "—";
      case "tarief_uur": return een === "uur" ? fmtTarief(r.tariefEur, "uur") : "—";
      case "voornaam": return String(c.voornaam || "");
      case "clientnr": return c.clientnummer != null && c.clientnummer !== "" ? String(c.clientnummer) : "—";
      case "gemeente": return String(r.gemeente || "").trim() || String(c.gemeente || "").trim() || "—";
      case "productcode": return String(r.productcode || "").trim() || "—";
      case "verw_naam": return verwNaam;
      case "verw_mail": return verwMail;
      case "fase": return faseTextExport(r.fase);
      case "naam": return String(r.naam || "—");
      case "start_dt": return fmtD(r.startISO);
      case "status": return statusTextExport(r.betalingsStatus);
      case "openstaand": return fmtEur(r.nogNietGedeclareerd);
      case "maandbedrag": return fmtEur(r.teDeclarerenLM);
      case "tarief_dag": return een === "dag" ? fmtTarief(r.tariefEur, "dag") : "—";
      default: return "—";
    }
  }

  function loadExportColState() {
    try {
      var raw = localStorage.getItem(LS_EXPORT);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveExportColState(obj) {
    try {
      localStorage.setItem(LS_EXPORT, JSON.stringify(obj));
    } catch (e) { /* */ }
  }

  function csvEsc(t) {
    var s = String(t == null ? "" : t);
    if (s.indexOf(";") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0 || s.indexOf('"') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function runBescExportDownload() {
    var keys = [];
    var labels = [];
    for (var i = 0; i < BESC_EXPORT_COLS.length; i += 1) {
      var c = BESC_EXPORT_COLS[i];
      var cb = document.getElementById("besc-ex-cb-" + c.k);
      if (cb && cb.checked) {
        keys.push(c.k);
        labels.push(c.label);
      }
    }
    if (!keys.length) {
      showToast("Selecteer minstens één kolom");
      return;
    }
    var rowsB = getFiltered();
    var dataRows = [];
    for (var r = 0; r < rowsB.length; r += 1) {
      var item = rowsB[r];
      if (!item) continue;
      var cl = exportCl(item);
      var parts = [];
      for (var k = 0; k < keys.length; k += 1) {
        parts.push(String(exportCell(keys[k], item, cl)));
      }
      dataRows.push(parts);
    }
    var fmtEl = document.getElementById("besc-export-format");
    var format = fmtEl && fmtEl.value ? fmtEl.value : "xlsx";
    if (typeof runTableExport === "function") {
      var res = runTableExport({ baseName: "beschikkingen-export", headers: labels, rows: dataRows, format: format });
      if (res && res.ok) {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("exported", "beschikkingen-export." + format);
        } else {
          showToast("Export klaar");
        }
        if (exportModalEl) {
          exportModalEl.setAttribute("hidden", "");
          exportModalEl.setAttribute("aria-hidden", "true");
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
    var lines = [labels.map(csvEsc).join(";")];
    for (var r2 = 0; r2 < rowsB.length; r2 += 1) {
      var it2 = rowsB[r2];
      if (!it2) continue;
      var cl2 = exportCl(it2);
      var p2 = [];
      for (var k2 = 0; k2 < keys.length; k2 += 1) {
        p2.push(csvEsc(exportCell(keys[k2], it2, cl2)));
      }
      lines.push(p2.join(";"));
    }
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "beschikkingen-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("exported", "beschikkingen-export.csv");
    } else {
      showToast("Export klaar");
    }
    if (exportModalEl) {
      exportModalEl.setAttribute("hidden", "");
      exportModalEl.setAttribute("aria-hidden", "true");
    }
  }

  function buildExportGrid() {
    var grid = document.getElementById("besc-export-grid");
    if (!grid) return;
    var saved = loadExportColState();
    grid.innerHTML = "";
    for (var i = 0; i < BESC_EXPORT_COLS.length; i += 1) {
      var d = BESC_EXPORT_COLS[i];
      var row = document.createElement("div");
      row.className = "besc-export-item";
      row.setAttribute("data-export-label", d.label.toLowerCase());
      var id = "besc-ex-cb-" + d.k;
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.id = id;
      inp.className = "besc-ex-cb";
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
        var cbs = grid.querySelectorAll(".besc-ex-cb");
        var m0 = {};
        for (var t = 0; t < cbs.length; t += 1) {
          var k0 = cbs[t].getAttribute("data-k");
          m0[k0] = cbs[t].checked;
          if (!cbs[t].checked) all = false;
        }
        saveExportColState(m0);
        var aEl = document.getElementById("besc-export-all");
        if (aEl) aEl.checked = all;
      });
    }
    var all0 = document.getElementById("besc-export-all");
    if (all0) {
      var cbs0 = grid.querySelectorAll(".besc-ex-cb");
      var all1 = true;
      for (var t0 = 0; t0 < cbs0.length; t0 += 1) { if (!cbs0[t0].checked) { all1 = false; break; } }
      all0.checked = all1;
    }
  }

  function filterExportColumnList() {
    var sEl = document.getElementById("besc-export-search");
    var g = document.getElementById("besc-export-grid");
    if (!sEl || !g) return;
    var q = String(sEl.value || "").toLowerCase().trim();
    var it = g.querySelectorAll(".besc-export-item");
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

  function openBescExportModal() {
    if (!bescExportUiReady) {
      return;
    }
    var s = document.getElementById("besc-export-search");
    if (s) {
      s.value = "";
    }
    filterExportColumnList();
    if (exportModalEl) {
      exportModalEl.removeAttribute("hidden");
      exportModalEl.setAttribute("aria-hidden", "false");
    }
    window.setTimeout(function () { if (s) s.focus(); }, 20);
  }

  function initBescExport() {
    exportModalEl = document.getElementById("besc-export-modal");
    if (!exportModalEl) {
      return;
    }
    buildExportGrid();
    bescExportUiReady = true;
    var s = document.getElementById("besc-export-search");
    if (s) {
      s.addEventListener("input", function () {
        filterExportColumnList();
      });
    }
    var al = document.getElementById("besc-export-all");
    if (al) {
      al.addEventListener("change", function () {
        var g = document.getElementById("besc-export-grid");
        if (!g) return;
        var on = al.checked;
        var cbs = g.querySelectorAll(".besc-ex-cb");
        var m0 = {};
        for (var a = 0; a < cbs.length; a += 1) {
          cbs[a].checked = on;
          m0[cbs[a].getAttribute("data-k")] = on;
        }
        saveExportColState(m0);
      });
    }
    function closeBescExport() {
      exportModalEl.setAttribute("hidden", "");
      exportModalEl.setAttribute("aria-hidden", "true");
    }
    if (document.getElementById("besc-export-x")) {
      document.getElementById("besc-export-x").addEventListener("click", closeBescExport);
    }
    if (document.getElementById("besc-export-cancel")) {
      document.getElementById("besc-export-cancel").addEventListener("click", closeBescExport);
    }
    if (document.getElementById("besc-export-confirm")) {
      document.getElementById("besc-export-confirm").addEventListener("click", function () { runBescExportDownload(); });
    }
    exportModalEl.addEventListener("click", function (e) { if (e.target === exportModalEl) { closeBescExport(); } });
  }

  function eindBinnen60(r) {
    if (!r || !r.eindISO) return false;
    var t = parseYMDLocal(r.eindISO);
    if (!t || isNaN(t.getTime())) return false;
    var nu = new Date();
    nu.setHours(0, 0, 0, 0);
    var t60 = new Date(nu);
    t60.setDate(t60.getDate() + 60);
    return t.getTime() > nu.getTime() && t.getTime() <= t60.getTime();
  }

  function toetsFilter(r, q) {
    if (!q) return true;
    q = String(q).toLowerCase();
    return (
      String(r.clientLabel || "").toLowerCase().indexOf(q) >= 0 ||
      String(r.naam || "").toLowerCase().indexOf(q) >= 0 ||
      String(r.zorgsoortLabel || "").toLowerCase().indexOf(q) >= 0 ||
      String(r.locatie || "").toLowerCase().indexOf(q) >= 0 ||
      String(r.gemeente || "").toLowerCase().indexOf(q) >= 0 ||
      String(r.productcode || "").toLowerCase().indexOf(q) >= 0
    );
  }

  function getFiltered() {
    var all = getBeschikkingenItems() || [];
    var out = [];
    for (var i = 0; i < all.length; i += 1) {
      var r = all[i];
      if (!r) continue;
      if (archEl && archEl.checked) {
        if (!r.gearchiveerd) continue;
      } else if (r.gearchiveerd) continue;
      if (f60 && f60.checked && !eindBinnen60(r)) continue;
      if (fted && fted.checked && n2(r.teDeclarerenLM) <= 0) continue;
      if (fng && fng.checked && n2(r.nogNietGedeclareerd) <= 0) continue;
      if (selZ && selZ.value) {
        if (String(r.zorgsoortKey) !== String(selZ.value)) continue;
      }
      if (selF && selF.value) {
        if (String((r.fase || "").toLowerCase()) !== String(selF.value).toLowerCase()) continue;
      }
      if (selP && selP.value) {
        if (String(r.betalingsStatus) !== String(selP.value)) continue;
      }
      if (selD && selD.value) {
        if (String(r.declMeth) !== String(selD.value)) continue;
      }
      if (!toetsFilter(r, searchEl ? searchEl.value : "")) continue;
      out.push(r);
    }
    return out;
  }

  function getPageSize() {
    var p = pageSizeEl ? parseInt(String(pageSizeEl.value), 10) : 15;
    if (isNaN(p) || p < 1) p = 15;
    return p;
  }

  function applyColVis() {
    if (!table) return;
    var ids = colState;
    var cells = table.querySelectorAll("[data-besc-colid]");
    for (var i = 0; i < cells.length; i += 1) {
      var c = cells[i].getAttribute("data-besc-colid");
      if (c == null) continue;
      if (c === "sel") {
        cells[i].style.display = colState.sel ? "" : "none";
        continue;
      }
      if (c === "act") {
        cells[i].style.display = colState.act ? "" : "none";
        continue;
      }
      if (c in ids) {
        cells[i].style.display = colState[c] ? "" : "none";
      }
    }
  }

  function buildColToggles2() {
    if (!colsList) return;
    loadColState();
    colsList.innerHTML = "";
    for (var j = 0; j < COLS_ORDER.length; j += 1) {
      var def = COLS_ORDER[j];
      var li = document.createElement("li");
      li.setAttribute("role", "menuitem");
      li.className = "columns-list-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "besc-col-" + def.id;
      cb.checked = !!colState[def.id];
      cb.setAttribute("data-besc-colid", def.id);
      var lb = document.createElement("label");
      lb.setAttribute("for", cb.id);
      lb.appendChild(cb);
      lb.appendChild(document.createTextNode(" " + def.label));
      li.appendChild(lb);
      cb.addEventListener("change", function (e) {
        var id = e.target.getAttribute("data-besc-colid");
        if (id && colState) colState[id] = e.target.checked;
        saveColState();
        applyColVis();
      });
      colsList.appendChild(li);
    }
  }

  function render() {
    if (!tbody) return;
    var items = getFiltered();
    if (emptyRow) emptyRow.hidden = items.length > 0;
    var ps = getPageSize();
    var totalP = Math.max(1, Math.ceil(items.length / ps));
    if (currentPage >= totalP) currentPage = totalP - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * ps;
    var end = Math.min(start + ps, items.length);
    if (rangeEl) {
      if (items.length === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        rangeEl.textContent = (start + 1) + "–" + end + " van " + items.length;
      }
    }
    if (pageLabel) pageLabel.textContent = "Pagina " + (currentPage + 1) + " van " + totalP;

    var f = document.getElementById("besc-pager-first");
    var pr = document.getElementById("besc-pager-prev");
    var n = document.getElementById("besc-pager-next");
    var l = document.getElementById("besc-pager-last");
    if (f) f.disabled = currentPage === 0;
    if (pr) pr.disabled = currentPage === 0;
    if (n) n.disabled = currentPage >= totalP - 1;
    if (l) l.disabled = currentPage >= totalP - 1;

    tbody.innerHTML = "";
    for (var s = start; s < end; s += 1) {
      var r = items[s];
      var tr = document.createElement("tr");
      if (r.gearchiveerd) tr.classList.add("besc-ov--arch");
      tr.setAttribute("data-besc-id", r.id);
      tr.innerHTML = rowHtml(r);
      tbody.appendChild(tr);
    }
    applyColVis();
    bescPersistOvSession();
  }

  function fasePill(f) {
    var s = String(f || "").toLowerCase();
    if (s === "in_aanvraag") {
      return '<span class="cd-besc-fase cd-besc-fase--in-aanvraag">In aanvraag</span>';
    }
    if (s === "verlopen") {
      return '<span class="cd-besc-fase cd-besc-fase--verlopen">Verlopen</span>';
    }
    if (s === "in_zorg") {
      return '<span class="cd-besc-fase cd-besc-fase--in-zorg">In zorg</span>';
    }
    if (s === "uit_zorg") {
      return '<span class="cd-besc-fase cd-besc-fase--uit-zorg">Uit zorg</span>';
    }
    if (s === "in_dienst") {
      return '<span class="cd-besc-fase cd-besc-fase--in-dienst">In dienst</span>';
    }
    if (s === "uit_dienst") {
      return '<span class="cd-besc-fase cd-besc-fase--uit-dienst">Uit dienst</span>';
    }
    return '<span class="cd-besc-fase cd-besc-fase--actief">Actief</span>';
  }

  function statPill(b) {
    if (b === "betaald") {
      return '<span class="cd-besc-stat cd-besc-stat--betaald">Betaald</span>';
    }
    return '<span class="besc-ov-stat besc-ov-stat--out">outstanding</span>';
  }

  function rowHtml(r) {
    var warn = eindBinnen60(r) && !r.gearchiveerd
      ? '<span class="cd-besc-periode-ico" aria-hidden="true" title="Verloopt binnen 60d"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2"><path d="M10.3 3.2L2 20h20L13.7 3.2a1 1 0 0 0-1.8 0z"/></svg></span>'
      : "";
    var tLM = n2(r.teDeclarerenLM);
    var tNG = n2(r.nogNietGedeclareerd);
    var tLMc = tLM > 0 ? " besc-ov-eur besc-ov-eur--tedecl" : "";
    var tNGc = tNG > 0 ? " besc-ov-eur besc-ov-eur--niet" : "";
    var act;
    if (r.gearchiveerd) {
      act = "<div class=\"hr-row-actions besc-ov-hract\">" +
        "<button type=\"button\" class=\"btn-outline besc-ov-restore\" data-besc-restore=\"" + (r.id || "") + "\">Herstel</button>" +
        "<button type=\"button\" class=\"employee-delete-btn besc-ov-purge-btn\" data-besc-purge=\"" + (r.id || "") + "\" aria-label=\"Definitief verwijderen\">" + TRASH_SVG + "</button></div>";
    } else {
      act = "<button type=\"button\" class=\"employee-delete-btn besc-ov-archive-btn\" data-besc-arch=\"" + (r.id || "") + "\" aria-label=\"Archiveren\">" + TRASH_SVG + "</button>";
    }
    return "" +
      "<td data-col=\"sel\" data-besc-colid=\"sel\" class=\"th-check\"><input type=\"checkbox\" class=\"table-checkbox besc-rchk\" data-id=\"" + (r.id || "") + "\" aria-label=\"Selecteer rij\" /></td>" +
      "<td data-besc-colid=\"client\" data-col=\"client\">" + (r.clientLabel || "—") + "</td>" +
      "<td data-besc-colid=\"naam\" data-col=\"naam\">" + (r.naam || "—") + "</td>" +
      "<td data-besc-colid=\"productcode\" data-col=\"productcode\">" + (r.productcode ? escHtmlOv(r.productcode) : "—") + "</td>" +
      "<td data-besc-colid=\"gemeente\" data-col=\"gemeente\">" + (r.gemeente ? escHtmlOv(r.gemeente) : "—") + "</td>" +
      "<td data-besc-colid=\"zorg\" data-col=\"zorg\"><span class=\"cd-besc-zorgtag\">" + (r.zorgsoortLabel || "—") + "</span></td>" +
      "<td data-besc-colid=\"fase\" data-col=\"fase\" data-besc-rawf=\"" + (r.fase || "") + "\">" + fasePill(r.fase) + "</td>" +
      "<td data-besc-colid=\"per\" data-col=\"per\" class=\"besc-ov-per\">" + warn + fmtPeriode(r.startISO, r.eindISO) + "</td>" +
      "<td data-besc-colid=\"tarf\" data-col=\"tarf\">" + fmtTarief(r.tariefEur, r.tariefEenheid) + "</td>" +
      "<td data-besc-colid=\"ted\" data-col=\"ted\" class=\"besc-ov-num" + tLMc + "\">" + (tLM > 0 ? fmtEur(tLM) : "—") + "</td>" +
      "<td data-besc-colid=\"ng\" data-col=\"ng\" class=\"besc-ov-num" + tNGc + "\">" + (tNG > 0 ? fmtEur(tNG) : "—") + "</td>" +
      "<td data-besc-colid=\"dm\" data-col=\"dm\">" + (r.declMeth || "—") + "</td>" +
      "<td data-besc-colid=\"st\" data-col=\"st\" data-besc-rawb=\"" + (r.betalingsStatus || "") + "\">" + statPill(r.betalingsStatus) + "</td>" +
      "<td data-besc-colid=\"act\" data-col=\"acties\" class=\"besc-ov-actions\">" + act + "</td>";
  }

  function zorgsoortZetOpties() {
    if (!selZ) return;
    var items = getBeschikkingenItems() || [];
    var byKey = {};
    var w = 0;
    for (w = 0; w < items.length; w += 1) {
      if (items[w] && items[w].zorgsoortKey) {
        byKey[items[w].zorgsoortKey] = items[w].zorgsoortLabel || items[w].zorgsoortKey;
      }
    }
    if (typeof SUPPORTED_ZORGSOORT_KEYS_BESC === "function" && getBescZorgsoortLabel) {
      var ar = SUPPORTED_ZORGSOORT_KEYS_BESC();
      for (var m2 = 0; m2 < ar.length; m2 += 1) {
        byKey[ar[m2]] = getBescZorgsoortLabel(ar[m2]);
      }
    }
    var cur = selZ.value;
    var opts2 = ['<option value="">Alle zorgsoorten</option>'];
    // Bug #47 fix: dedupe by label (multiple zorgsoortKey UUIDs kunnen dezelfde label hebben)
    var seenLabels = {};
    var uniqueKeys = Object.keys(byKey).filter(function (k) {
      var lbl = String(byKey[k] || "");
      if (seenLabels[lbl]) return false;
      seenLabels[lbl] = true;
      return true;
    });
    uniqueKeys.sort(function (a, b) { return String(byKey[a]).localeCompare(String(byKey[b])); }).forEach(function (key) {
      opts2.push(
        "<option value=\"" + String(key).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + "\">" +
        String(byKey[key]).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</option>"
      );
    });
    selZ.innerHTML = opts2.join("");
    if (cur) {
      for (var j2 = 0; j2 < selZ.options.length; j2 += 1) {
        if (selZ.options[j2].value === cur) {
          selZ.value = cur;
          break;
        }
      }
    }
  }

  var BESC_ADD_ZORG_OPTS = [
    { key: "gecombineerd", label: "Gecombineerd" },
    { key: "vlz", label: "VLZ" },
    { key: "ambulant-extern", label: "Ambulant extern" },
    { key: "fasewonen", label: "Fase wonen" },
    { key: "ambulant-intern", label: "Ambulant intern" },
    { key: "verblijf-behandeling", label: "Verblijf en behandeling" },
    { key: "crisisopvang", label: "Crisisopvang" }
  ];
  var BESC_ADD_FASE_OPTS = [
    { key: "uit_zorg", label: "Uit zorg" },
    { key: "in_aanvraag", label: "In aanvraag" },
    { key: "actief", label: "Actief" },
    { key: "verlopen", label: "Verlopen" },
    { key: "in_dienst", label: "In dienst" },
    { key: "uit_dienst", label: "Uit dienst" },
    { key: "in_zorg", label: "In zorg" }
  ];
  var BESC_ADD_DECL_OPTS = [
    { key: "Handmatig", label: "Handmatig" },
    { key: "ONS", label: "ONS" },
    { key: "WLZ", label: "WLZ" },
    { key: "SVB", label: "SVB" },
    { key: "Overig", label: "Overig" }
  ];

  function vullingForm() {
    var cSel = document.getElementById("besc-add-cl");
    if (cSel && typeof getClientenItems === "function") {
      var clis = (getClientenItems() || []).filter(function (x) { return x && x.id; });
      clis = clis.slice().sort(function (a, b) {
        var na = ((a.voornaam || "") + " " + (a.achternaam || "")).trim().toLowerCase();
        var nb = ((b.voornaam || "") + " " + (b.achternaam || "")).trim().toLowerCase();
        return na.localeCompare(nb, "nl", { sensitivity: "base" });
      });
      cSel.innerHTML = "";
      var cPh = document.createElement("option");
      cPh.value = "";
      cPh.textContent = "Selecteer cliënt";
      cSel.appendChild(cPh);
      for (var c = 0; c < clis.length; c += 1) {
        var o = document.createElement("option");
        o.value = clis[c].id;
        o.textContent = ((clis[c].voornaam || "") + " " + (clis[c].achternaam || "")).trim() + (clis[c].clientnummer != null ? " — nr " + clis[c].clientnummer : "");
        if (clis[c].archived) o.textContent += " (gearchiveerd)";
        cSel.appendChild(o);
      }
    }
    var zS = document.getElementById("besc-add-z");
    if (zS) {
      zS.innerHTML = "";
      var zPh = document.createElement("option");
      zPh.value = "";
      zPh.textContent = "Selecteer zorgsoort";
      zS.appendChild(zPh);
      for (var g = 0; g < BESC_ADD_ZORG_OPTS.length; g += 1) {
        var o2 = document.createElement("option");
        o2.value = BESC_ADD_ZORG_OPTS[g].key;
        o2.textContent = BESC_ADD_ZORG_OPTS[g].label;
        zS.appendChild(o2);
      }
    }
    var fS = document.getElementById("besc-add-fas");
    if (fS) {
      fS.innerHTML = "";
      var fPh = document.createElement("option");
      fPh.value = "";
      fPh.textContent = "Selecteer een fase";
      fS.appendChild(fPh);
      for (var f = 0; f < BESC_ADD_FASE_OPTS.length; f += 1) {
        var fo = document.createElement("option");
        fo.value = BESC_ADD_FASE_OPTS[f].key;
        fo.textContent = BESC_ADD_FASE_OPTS[f].label;
        fS.appendChild(fo);
      }
    }
    var dS = document.getElementById("besc-add-dm");
    if (dS) {
      dS.innerHTML = "";
      var dPh = document.createElement("option");
      dPh.value = "";
      dPh.textContent = "Selecteer declaratie methode";
      dS.appendChild(dPh);
      for (var d = 0; d < BESC_ADD_DECL_OPTS.length; d += 1) {
        var do0 = document.createElement("option");
        do0.value = BESC_ADD_DECL_OPTS[d].key;
        do0.textContent = BESC_ADD_DECL_OPTS[d].label;
        dS.appendChild(do0);
      }
    }
    var na = document.getElementById("besc-add-naam");
    var s0 = document.getElementById("besc-add-s");
    var e0 = document.getElementById("besc-add-e");
    if (na) na.value = "";
    if (s0) s0.value = "";
    if (e0) e0.value = "";
  }

  function handleAdd(e) {
    e.preventDefault();
    var cId = document.getElementById("besc-add-cl");
    var cval = cId && cId.value;
    if (!cval) {
      showToast("Kies een cliënt");
      return;
    }
    var zEl = document.getElementById("besc-add-z");
    var zk = zEl && zEl.value;
    if (!zk) {
      showToast("Selecteer een zorgsoort");
      return;
    }
    var fEl = document.getElementById("besc-add-fas");
    var fas = fEl && fEl.value;
    if (!fas) {
      showToast("Selecteer een fase");
      return;
    }
    var dmEl = document.getElementById("besc-add-dm");
    var dmV = dmEl && dmEl.value;
    if (!dmV) {
      showToast("Selecteer declaratie methode");
      return;
    }
    if (typeof getClientenById !== "function" || !addBeschikkingRij) return;
    var cl = getClientenById(cval) || null;
    var n = (document.getElementById("besc-add-naam") && document.getElementById("besc-add-naam").value) || "";
    if (addModal) { addModal.setAttribute("hidden", ""); addModal.setAttribute("aria-hidden", "true"); }
    var f = String(fas).toLowerCase();
    addBeschikkingRij({
      clientId: cval,
      clientLabel: cl ? (String((cl.voornaam || "")).trim() + " " + String((cl.achternaam || "")).trim()).trim() : "—",
      locatie: cl && cl.locatie != null ? String(cl.locatie) : "—",
      naam: n.trim() || "Beschikking",
      zorgsoortKey: zk,
      fase: f,
      startISO: document.getElementById("besc-add-s") && document.getElementById("besc-add-s").value ? document.getElementById("besc-add-s").value : "",
      eindISO: document.getElementById("besc-add-e") && document.getElementById("besc-add-e").value ? document.getElementById("besc-add-e").value : "",
      teDeclarerenLM: 0,
      nogNietGedeclareerd: 0,
      gedeclGemeenteInBehandeling: 0,
      betaaldCumulatief: 0,
      betalingsStatus: "outstanding",
      declMeth: dmV,
      tariefEur: 0,
      tariefEenheid: "uur",
      gearchiveerd: false,
    });
    if (typeof showSaveModal === "function") showSaveModal("Beschikking is toegevoegd.");
    else showToast("Beschikking toegevoegd");
    zorgsoortZetOpties();
    currentPage = 0;
    render();
  }

  function bindTbodyClicks() {
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var t = e.target;
        if (t && t.closest) {
          var tbtn = t.closest("button");
          if (tbtn) {
            t = tbtn;
            if (t.getAttribute("data-besc-arch") && setBeschikkingField) {
              var id1 = t.getAttribute("data-besc-arch");
              setBeschikkingField(id1, function (row) { row.gearchiveerd = true; });
              if (typeof showSaveModal === "function") showSaveModal("Beschikking is gearchiveerd.", "Gearchiveerd");
              else showToast("Beschikking gearchiveerd");
              zorgsoortZetOpties();
              currentPage = 0;
              render();
            } else if (t.getAttribute("data-besc-restore") && setBeschikkingField) {
              setBeschikkingField(t.getAttribute("data-besc-restore"), function (row) { row.gearchiveerd = false; });
              if (typeof showSaveModal === "function") showSaveModal("Beschikking is hersteld.", "Hersteld");
              else showToast("Beschikking hersteld");
              zorgsoortZetOpties();
              currentPage = 0;
              render();
            } else if (t.getAttribute("data-besc-purge")) {
              purgeId = t.getAttribute("data-besc-purge");
              var p = (function () { var a = (getBeschikkingenItems() || []).filter(function (x) { return x && x.id === purgeId; }); return a[0] || null; })();
              var pvw = document.getElementById("besc-purge-preview");
              if (pvw && p) pvw.textContent = (p.clientLabel || "") + " – " + (p.naam || "");
              if (purgeModal) {
                purgeModal.removeAttribute("hidden");
                purgeModal.setAttribute("aria-hidden", "false");
              }
              var sl = document.getElementById("besc-purge-slider");
              if (sl) sl.value = "0";
              var pc = document.getElementById("besc-purge-confirm");
              if (pc) pc.disabled = true;
            }
            return;
          }
          if (t.closest("input, .th-check, .besc-rchk")) return;
        }
        var tr = t && t.closest && t.closest("tr[data-besc-id]");
        if (tr) {
          var bId = tr.getAttribute("data-besc-id");
          if (bId) {
            bescPersistOvSession();
            window.location.href = "beschikking-detail.html?id=" + encodeURIComponent(bId);
          }
        }
      });
    }
  }


  if (f60) f60.addEventListener("change", function () { currentPage = 0; render(); });
  if (archEl) archEl.addEventListener("change", function () { currentPage = 0; render(); });
  if (fted) fted.addEventListener("change", function () { currentPage = 0; render(); });
  if (fng) fng.addEventListener("change", function () { currentPage = 0; render(); });
  if (searchEl) searchEl.addEventListener("input", function () { currentPage = 0; render(); });
  if (selZ) selZ.addEventListener("change", function () { currentPage = 0; render(); });
  if (selF) selF.addEventListener("change", function () { currentPage = 0; render(); });
  if (selP) selP.addEventListener("change", function () { currentPage = 0; render(); });
  if (selD) selD.addEventListener("change", function () { currentPage = 0; render(); });
  if (pageSizeEl) pageSizeEl.addEventListener("change", function () { currentPage = 0; render(); });

  document.getElementById("besc-reset") && document.getElementById("besc-reset").addEventListener("click", function () {
    if (searchEl) searchEl.value = "";
    if (archEl) archEl.checked = false;
    if (f60) f60.checked = false;
    if (fted) fted.checked = false;
    if (fng) fng.checked = false;
    if (selZ) selZ.value = "";
    if (selF) selF.value = "";
    if (selP) selP.value = "";
    if (selD) selD.value = "";
    currentPage = 0;
    render();
  });

  if (document.getElementById("besc-pager-first")) document.getElementById("besc-pager-first").addEventListener("click", function () { currentPage = 0; render(); });
  if (document.getElementById("besc-pager-prev")) document.getElementById("besc-pager-prev").addEventListener("click", function () { if (currentPage > 0) { currentPage--; render(); } });
  if (document.getElementById("besc-pager-next")) {
    document.getElementById("besc-pager-next").addEventListener("click", function () {
      var it = getFiltered();
      var pss = getPageSize();
      var tpp = Math.max(1, Math.ceil(it.length / pss)) - 1;
      if (currentPage < tpp) { currentPage++; render(); }
    });
  }
  if (document.getElementById("besc-pager-last")) document.getElementById("besc-pager-last").addEventListener("click", function () {
    var it = getFiltered();
    var ps = getPageSize();
    var tp = Math.max(0, Math.ceil(it.length / ps) - 1);
    currentPage = tp;
    render();
  });

  initBescExport();
  document.getElementById("besc-export-btn") && document.getElementById("besc-export-btn").addEventListener("click", function () { openBescExportModal(); });
  document.getElementById("besc-add-open") && document.getElementById("besc-add-open").addEventListener("click", function () {
    vullingForm();
    if (addModal) {
      addModal.removeAttribute("hidden");
      addModal.setAttribute("aria-hidden", "false");
    }
  });
  document.getElementById("besc-add-x") && document.getElementById("besc-add-x").addEventListener("click", function () {
    if (addModal) { addModal.setAttribute("hidden", ""); addModal.setAttribute("aria-hidden", "true"); }
  });
  document.getElementById("besc-add-cancel") && document.getElementById("besc-add-cancel").addEventListener("click", function () {
    if (addModal) { addModal.setAttribute("hidden", ""); addModal.setAttribute("aria-hidden", "true"); }
  });
  if (addModal) {
    addModal.addEventListener("click", function (e) { if (e.target === addModal) { addModal.setAttribute("hidden", ""); addModal.setAttribute("aria-hidden", "true"); } });
  }
  // Bug #44 + #45 fix: Escape close voor add + export + purge modals
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var purgeM = document.getElementById("besc-purge-modal");
    if (purgeM && !purgeM.hasAttribute("hidden")) { purgeM.setAttribute("hidden", ""); purgeM.setAttribute("aria-hidden", "true"); e.stopPropagation(); return; }
    var exportM = document.getElementById("besc-export-modal");
    if (exportM && !exportM.hasAttribute("hidden")) { exportM.setAttribute("hidden", ""); exportM.setAttribute("aria-hidden", "true"); e.stopPropagation(); return; }
    if (addModal && !addModal.hasAttribute("hidden")) { addModal.setAttribute("hidden", ""); addModal.setAttribute("aria-hidden", "true"); e.stopPropagation(); return; }
  });
  document.getElementById("besc-add-form") && document.getElementById("besc-add-form").addEventListener("submit", handleAdd);
  if (document.getElementById("besc-purge-confirm") && removeBeschikkingById) {
    document.getElementById("besc-purge-confirm").addEventListener("click", function () {
      if (purgeId) {
        removeBeschikkingById(purgeId);
        if (typeof showSaveModal === "function") showSaveModal("Beschikking is definitief verwijderd.", "Verwijderd");
        else showToast("Definitief verwijderd");
        purgeId = null;
        if (purgeModal) { purgeModal.setAttribute("hidden", ""); purgeModal.setAttribute("aria-hidden", "true"); }
        zorgsoortZetOpties();
        currentPage = 0;
        render();
      }
    });
  }
  if (document.getElementById("besc-purge-close")) {
    document.getElementById("besc-purge-close").addEventListener("click", function () { if (purgeModal) { purgeModal.setAttribute("hidden", ""); purgeModal.setAttribute("aria-hidden", "true"); } });
  }
  if (document.getElementById("besc-purge-cancel")) {
    document.getElementById("besc-purge-cancel").addEventListener("click", function () { if (purgeModal) { purgeModal.setAttribute("hidden", ""); purgeModal.setAttribute("aria-hidden", "true"); } });
  }
  if (document.getElementById("besc-purge-slider")) {
    document.getElementById("besc-purge-slider").addEventListener("input", function (e) {
      var c = document.getElementById("besc-purge-confirm");
      if (c) c.disabled = Number(e.target.value) < 100;
    });
  }

  if (colsBtn && colsPanel) {
    colsBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var h = colsPanel.hasAttribute("hidden");
      if (h) { colsPanel.removeAttribute("hidden"); } else { colsPanel.setAttribute("hidden", ""); }
    });
  }
  if (colsPanel) {
    colsPanel.addEventListener("click", function (ev) { ev.stopPropagation(); });
  }
  document.addEventListener("click", function () { if (colsPanel) colsPanel.setAttribute("hidden", ""); });

  var _bescOvSess = bescReadOvSession();
  if (_bescOvSess) bescApplyOvSession(_bescOvSess);
  try {
    var _bp = new URLSearchParams(location.search);
    var _hasDrill = _bp.has("fase") || _bp.has("betaling") || _bp.has("dm") ||
      _bp.has("z") || _bp.get("f60") === "1" || _bp.get("fted") === "1" || _bp.get("fng") === "1";
    if (_hasDrill) {
      var _applyDrill = function () {
        if (_bp.has("fase") && selF) selF.value = _bp.get("fase");
        if (_bp.has("betaling") && selP) selP.value = _bp.get("betaling");
        if (_bp.has("dm") && selD) selD.value = _bp.get("dm");
        if (_bp.has("z") && selZ) selZ.value = _bp.get("z");
        if (_bp.get("f60") === "1" && f60) f60.checked = true;
        if (_bp.get("fted") === "1" && fted) fted.checked = true;
        if (_bp.get("fng") === "1" && fng) fng.checked = true;
        currentPage = 0;
        if (typeof render === "function") render();
      };
      _applyDrill();
      // Data laadt async — herhaal tot er rijen zijn (cap ~24 = 12s), zodat
      // de drill-down-filter blijft staan ook na de async cache-load.
      var _tries = 0;
      var _drillIv = setInterval(function () {
        _tries += 1;
        var _items = (typeof getBeschikkingenItems === "function") ? (getBeschikkingenItems() || []) : [];
        if (_items.length > 0) { _applyDrill(); clearInterval(_drillIv); }
        else if (_tries >= 24) { clearInterval(_drillIv); }
      }, 500);
      document.addEventListener("beschikkingen:changed", _applyDrill);
    }
  } catch (_e) { /* drill-down vanaf dashboard is best-effort */ }
  bindTbodyClicks();
  vullingForm();
  zorgsoortZetOpties();
  buildColToggles2();
  render();
  // Vangnet: forceer een re-render zodra de Supabase-bootstrap klaar is, ook
  // als het "beschikkingen:changed"-event gemist wordt (verse/lege cache toonde
  // anders 0 rijen tot een handmatige reload).
  try {
    if (window.beschikkingenDB && window.beschikkingenDB.ready && typeof window.beschikkingenDB.ready.then === "function") {
      window.beschikkingenDB.ready.then(function () { currentPage = 0; render(); });
    }
  } catch (_re) { /* */ }
  (function () {
    var n = 0, last = -1;
    var iv = setInterval(function () {
      n += 1;
      var len = (typeof getBeschikkingenItems === "function") ? (getBeschikkingenItems() || []).length : 0;
      if (len !== last) { last = len; render(); }
      if (len > 0 || n >= 20) clearInterval(iv);
    }, 500);
  })();
  if (_bescOvSess && typeof _bescOvSess.scrollY === "number") {
    bescScheduleScrollRestore(_bescOvSess.scrollY);
  }
  window.addEventListener("pagehide", bescPersistOvSession);
  document.addEventListener("beschikkingen:changed", function () { zorgsoortZetOpties(); render(); });
})();

