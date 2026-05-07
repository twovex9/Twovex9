/* Salarisadministratie — export + ORT (localStorage; zelfde keys als vorige versie) */
(function () {
  "use strict";

  var HISTORY_KEY = "saladmin_export_history";
  var ORT_KEY = "saladmin_ort_rules";

  function showToast(message) {
    var backdrop = document.getElementById("app-toast-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "app-toast-backdrop";
      backdrop.className = "app-toast-backdrop";
      document.body.appendChild(backdrop);
    }
    var toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "app-toast app-toast--centered";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    backdrop.classList.remove("is-visible");
    toast.classList.remove("is-visible");
    void backdrop.offsetWidth;
    void toast.offsetWidth;
    backdrop.classList.add("is-visible");
    toast.classList.add("is-visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      if (toast) toast.classList.remove("is-visible");
      if (backdrop) backdrop.classList.remove("is-visible");
    }, 2200);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function fmtPeriod(month, year) {
    var m = parseInt(month, 10) || 1;
    var y = parseInt(year, 10) || new Date().getFullYear();
    var names = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
    return (names[m - 1] || "Maand") + " " + y;
  }

  function safeJsonParse(raw, fallback) {
    try {
      var v = JSON.parse(raw);
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function getEmployees() {
    try {
      var raw = localStorage.getItem("employees");
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function employeeDisplayName(e) {
    var v = (e && (e.voornaam || e.firstName) ? String(e.voornaam || e.firstName) : "").trim();
    var a = (e && (e.achternaam || e.lastName) ? String(e.achternaam || e.lastName) : "").trim();
    var full = (v + " " + a).trim();
    return full || (e && e.naam ? String(e.naam) : "") || "Medewerker";
  }

  function getValidationIssuesForEmployee(e) {
    var issues = [];
    if (!e) return issues;
    var iban = String(e.iban || e.IBAN || e.profIban || e.bankrekening || "").trim();
    var email = String(e.email || e.profEmail || "").trim();
    var start = String(e.startdatum || "").trim();
    if (!email) issues.push("E-mailadres ontbreekt");
    if (!iban) issues.push("IBAN ontbreekt");
    if (!start) issues.push("Startdatum ontbreekt");
    return issues;
  }

  function computeValidationList() {
    var emps = getEmployees();
    if (!emps.length) {
      return [
        { name: "Aniek Nieuwenhuis (9)", issues: ["Kilometerdeclaratie niet ingediend"] },
        { name: "Justin van Loenen (25)", issues: ["Kilometerdeclaratie niet ingediend"] },
        { name: "Naomi Buis (32)", issues: ["Kilometerdeclaratie niet ingediend"] },
      ];
    }
    return emps
      .map(function (e) {
        return { name: employeeDisplayName(e), issues: getValidationIssuesForEmployee(e) };
      })
      .filter(function (x) {
        return x.issues.length > 0;
      })
      .slice(0, 40);
  }

  function readHistory() {
    var raw = localStorage.getItem(HISTORY_KEY);
    var list = raw ? safeJsonParse(raw, []) : [];
    if (!Array.isArray(list) || !list.length) {
      var seed = [
        { id: "seed_1", createdAt: "2026-03-11T10:10:00", period: "Maart 2026", employees: 31, by: "Vennie Küster", csv: null },
        { id: "seed_2", createdAt: "2026-03-18T10:10:00", period: "Februari 2026", employees: 31, by: "Vennie Küster", csv: null },
        { id: "seed_3", createdAt: "2026-02-15T10:10:00", period: "Januari 2026", employees: 33, by: "Artem Fetchoj", csv: null },
      ];
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(seed));
      } catch {}
      return seed;
    }
    return list;
  }

  function writeHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list || []));
    } catch {}
    if (window.saladminDB && typeof window.saladminDB.pushHistory === "function") {
      try { window.saladminDB.pushHistory(list || []); } catch (e) { /* */ }
    }
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 500);
  }

  function toCsvRow(cells) {
    return cells
      .map(function (c) {
        var s = c === null || c === undefined ? "" : String(c);
        if (/[\",\n;]/.test(s)) s = "\"" + s.replace(/\"/g, "\"\"") + "\"";
        return s;
      })
      .join(";");
  }

  function buildCsvForPeriod(period) {
    var emps = getEmployees();
    var rows = [];
    rows.push(toCsvRow(["Periode", period]));
    rows.push(toCsvRow(["Aangemaakt op", new Date().toISOString()]));
    rows.push("");
    rows.push(toCsvRow(["Medewerker", "E-mail", "IBAN", "Startdatum"]));
    if (!emps.length) {
      rows.push(toCsvRow(["Demo medewerker", "", "", ""]));
      return rows.join("\n");
    }
    emps.forEach(function (e) {
      rows.push(
        toCsvRow([
          employeeDisplayName(e),
          e.email || e.profEmail || "",
          e.iban || e.IBAN || e.profIban || e.bankrekening || "",
          e.startdatum || "",
        ])
      );
    });
    return rows.join("\n");
  }

  /* ── Hoofdtabs ───────────────────────────────────────── */
  var mainTabs = document.querySelectorAll("#sa-main-tabs [data-sa-tab]");
  var panelExport = document.getElementById("sa-panel-export");
  var panelOrt = document.getElementById("sa-panel-ort");

  function setMainTab(key) {
    var isOrt = key === "ort";
    mainTabs.forEach(function (t) {
      var on = t.getAttribute("data-sa-tab") === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (panelExport) panelExport.classList.toggle("is-active", !isOrt);
    if (panelOrt) panelOrt.classList.toggle("is-active", isOrt);
    try {
      if (isOrt && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + "#ort");
      } else if (!isOrt && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (e) {}
    if (isOrt && typeof window.__saOrtRender === "function") window.__saOrtRender();
  }

  mainTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setMainTab(tab.getAttribute("data-sa-tab") || "export");
    });
  });

  /* ── Export-tab ──────────────────────────────────────── */
  var monthSel = document.getElementById("sa-month");
  var yearSel = document.getElementById("sa-year");
  var listEl = document.getElementById("sa-validation-list");
  var sumEl = document.getElementById("sa-validation-summary");
  var chipEl = document.getElementById("sa-alert-chip");
  var genBtn = document.getElementById("sa-generate-btn");
  var nowDl = document.getElementById("sa-download-now");
  var historyBody = document.getElementById("sa-history-tbody");

  function renderValidation() {
    if (!listEl) return;
    var rows = computeValidationList();
    listEl.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "sa-val-empty";
      empty.textContent = "Geen onvolledige gegevens gevonden.";
      listEl.appendChild(empty);
    } else {
      rows.forEach(function (r) {
        var item = document.createElement("div");
        item.className = "sa-val-item";
        var top = document.createElement("div");
        top.className = "sa-val-top";
        var dot = document.createElement("span");
        dot.className = "sa-val-dot";
        dot.setAttribute("aria-hidden", "true");
        top.appendChild(dot);
        var name = document.createElement("div");
        name.className = "sa-val-name";
        name.textContent = r.name;
        top.appendChild(name);
        item.appendChild(top);
        r.issues.forEach(function (iss) {
          var sub = document.createElement("div");
          sub.className = "sa-val-issue";
          sub.textContent = iss;
          item.appendChild(sub);
        });
        listEl.appendChild(item);
      });
    }
    var count = rows.length;
    if (sumEl) sumEl.textContent = count + " medewerkers met onvolledige gegevens";
    if (chipEl) chipEl.hidden = count === 0;
  }

  function renderHistory() {
    if (!historyBody) return;
    var list = readHistory();
    historyBody.innerHTML = "";
    var dlSvg =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/></svg>';

    list.forEach(function (x) {
      var tr = document.createElement("tr");

      function td(text, col) {
        var t = document.createElement("td");
        t.textContent = text;
        if (col) t.setAttribute("data-col", col);
        return t;
      }

      tr.appendChild(td(fmtDateTime(x.createdAt), "datum"));
      tr.appendChild(td(x.period || "", "periode"));
      tr.appendChild(td(String(x.employees || 0), "medewerkers"));
      tr.appendChild(td(x.by || "—", "exporteur"));

      var tdDl = document.createElement("td");
      tdDl.className = "sa-td-dl";
      tdDl.setAttribute("data-col", "download");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sa-dl-btn";
      btn.setAttribute("aria-label", "Download export");
      btn.innerHTML = dlSvg;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var csv = x.csv || buildCsvForPeriod(x.period || "");
        var fname = "salarisadministratie_export_" + (x.period || "periode").replace(/\s+/g, "_") + ".csv";
        downloadText(fname, csv, "text/csv;charset=utf-8");
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("downloaded", fname);
        }
      });
      tdDl.appendChild(btn);
      tr.appendChild(tdDl);
      historyBody.appendChild(tr);
    });
    applySaColumnVisibility();
  }

  // ----- Kolommen-knop (Exportgeschiedenis tabel) -----
  var SA_COLUMN_CONFIG = [
    { id: "datum", label: "Datum", defaultOn: true },
    { id: "periode", label: "Periode", defaultOn: true },
    { id: "medewerkers", label: "Medewerkers", defaultOn: true },
    { id: "exporteur", label: "Geëxporteerd door", defaultOn: true },
    { id: "download", label: "Downloaden", defaultOn: true, skipToggle: true },
  ];
  function setSaColumnVisible(colId, visible) {
    document.querySelectorAll('#sa-history-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applySaColumnVisibility() {
    document.querySelectorAll("#sa-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setSaColumnVisible(colId, isOn);
    });
  }
  function buildSaColumnsPanel() {
    var list = document.getElementById("sa-columns-list");
    if (!list) return;
    list.innerHTML = "";
    SA_COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle" + (c.defaultOn ? " is-checked" : "");
      b.setAttribute("data-col", c.id);
      b.setAttribute("role", "menuitemcheckbox");
      b.setAttribute("aria-checked", c.defaultOn ? "true" : "false");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }
  function wireSaColumnsPanel() {
    var colBtn = document.getElementById("sa-columns-menu-btn");
    var colPanel = document.getElementById("sa-columns-panel");
    var colList = document.getElementById("sa-columns-list");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var hidden = colPanel.hasAttribute("hidden");
        if (hidden) {
          colPanel.removeAttribute("hidden");
          colBtn.setAttribute("aria-expanded", "true");
        } else {
          colPanel.setAttribute("hidden", "");
          colBtn.setAttribute("aria-expanded", "false");
        }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    if (colList) {
      colList.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        applySaColumnVisibility();
      });
    }
    document.addEventListener("click", function () {
      if (colPanel) {
        colPanel.setAttribute("hidden", "");
        if (colBtn) colBtn.setAttribute("aria-expanded", "false");
      }
    });
  }
  buildSaColumnsPanel();
  wireSaColumnsPanel();

  function generateExport() {
    var period = fmtPeriod(monthSel ? monthSel.value : "", yearSel ? yearSel.value : "");
    var csv = buildCsvForPeriod(period);
    var emps = getEmployees();
    var hist = readHistory();
    var entry = {
      id: "exp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      period: period,
      employees: emps.length || 31,
      by: "Vennie Küster",
      csv: csv,
    };
    hist.unshift(entry);
    writeHistory(hist.slice(0, 50));
    renderHistory();
    var willDownloadNow = !!(nowDl && nowDl.checked);
    if (willDownloadNow) {
      var genFname = "salarisadministratie_export_" + period.replace(/\s+/g, "_") + ".csv";
      downloadText(genFname, csv, "text/csv;charset=utf-8");
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Export klaar", "“" + period + "” is opgeslagen en " + genFname + " is gedownload.");
      } else if (typeof showSaveModal === "function") {
        showSaveModal("Export is opgeslagen en gedownload.");
      }
    } else if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("saved", "Export “" + period + "”");
    } else if (typeof showSaveModal === "function") {
      showSaveModal("Export is opgeslagen.");
    }
  }

  if (monthSel) monthSel.addEventListener("change", renderValidation);
  if (yearSel) yearSel.addEventListener("change", renderValidation);
  if (genBtn) genBtn.addEventListener("click", generateExport);

  /* ── ORT ─────────────────────────────────────────────── */
  (function ortModule() {
    var ortTbody = document.getElementById("sa-ort-tbody");
    var ortCaoTabs = document.querySelectorAll("#sa-ort-cao-tabs [data-sa-cao]");
    var ortAddBtn = document.getElementById("sa-ort-add-btn");
    var ortModal = document.getElementById("sa-ort-modal");
    var ortForm = document.getElementById("sa-ort-form");
    var ortModalTitle = document.getElementById("sa-ort-modal-title");
    var ortClose = document.getElementById("sa-ort-modal-close");
    var ortCancel = document.getElementById("sa-ort-cancel");
    var ortDag = document.getElementById("sa-ort-dag");
    var ortStart = document.getElementById("sa-ort-start");
    var ortEnd = document.getElementById("sa-ort-end");
    var ortPct = document.getElementById("sa-ort-pct");

    if (!ortTbody || !ortModal || !ortForm) return;

    var currentCao = "vvt";
    var editingId = null;

    function ortClearCustomDagOption() {
      if (!ortDag) return;
      var ex = document.getElementById("sa-ort-dag-opt-custom");
      if (ex) ex.remove();
    }

    /** Zet preset-teksten (ascii/en-dash) om naar de waarde in het select-element. */
    function ortCanonicalDagForSelect(saved) {
      var s = String(saved || "").trim();
      if (!s) return "";
      if (/^maandag\s*[-\u2013]\s*vrijdag$/i.test(s)) return "Maandag – Vrijdag";
      return s;
    }

    function ortSetDagSelect(saved) {
      if (!ortDag) return;
      ortClearCustomDagOption();
      var want = ortCanonicalDagForSelect(saved);
      ortDag.value = want;
      if (want && ortDag.value !== want) {
        var raw = String(saved).trim();
        var opt = document.createElement("option");
        opt.id = "sa-ort-dag-opt-custom";
        opt.value = raw;
        opt.textContent = raw;
        ortDag.appendChild(opt);
        ortDag.value = raw;
      }
      if (!want) ortDag.value = "";
    }

    var ICO_EDIT =
      '<svg class="sa-ort-act-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var ICO_DEL =
      '<svg class="sa-ort-act-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    function ortGenId() {
      return "ort_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    function ortDefaultVvtRules() {
      return [
        { id: "ort_vvt_feestdag", dag: "Feestdag", start: "00:00", end: "23:59", percentage: 200 },
        { id: "ort_vvt_zat_avond", dag: "Zaterdag", start: "18:00", end: "23:59", percentage: 140 },
        { id: "ort_vvt_zat_dag", dag: "Zaterdag", start: "06:00", end: "18:00", percentage: 120 },
        { id: "ort_vvt_zat_nacht", dag: "Zaterdag", start: "00:00", end: "06:00", percentage: 140 },
        { id: "ort_vvt_zon", dag: "Zondag", start: "00:00", end: "23:59", percentage: 160 },
        { id: "ort_vvt_mdv_nacht", dag: "Maandag - Vrijdag", start: "22:00", end: "06:00", percentage: 140 },
        { id: "ort_vvt_mdv_avond", dag: "Maandag - Vrijdag", start: "20:00", end: "22:00", percentage: 122 },
      ];
    }

    var MDV = "Maandag \u2013 Vrijdag";

    function ortDefaultJeugdzorgRules() {
      return [
        { id: "ort_jz_zat_nacht", dag: "Zaterdag", start: "22:00", end: "06:00", percentage: 145 },
        { id: "ort_jz_mdv_nacht", dag: MDV, start: "22:00", end: "06:00", percentage: 145 },
        { id: "ort_jz_zon_nacht", dag: "Zondag", start: "22:00", end: "06:00", percentage: 145 },
        { id: "ort_jz_zat_lang", dag: "Zaterdag", start: "20:00", end: "06:00", percentage: 145 },
        { id: "ort_jz_feestdag", dag: "Feestdag", start: "00:00", end: "23:59", percentage: 145 },
        { id: "ort_jz_zat_dag", dag: "Zaterdag", start: "06:00", end: "22:00", percentage: 130 },
        { id: "ort_jz_zon_vol", dag: "Zondag", start: "00:00", end: "23:59", percentage: 145 },
        { id: "ort_jz_mdv_vroeg", dag: MDV, start: "06:00", end: "07:00", percentage: 125 },
        { id: "ort_jz_mdv_dag", dag: MDV, start: "07:00", end: "19:00", percentage: 100 },
        { id: "ort_jz_mdv_avond", dag: MDV, start: "19:00", end: "22:00", percentage: 125 },
      ];
    }

    function ortDefaultRules() {
      return {
        _vvtPresetVersion: 2,
        _jeugdzorgPresetVersion: 2,
        vvt: ortDefaultVvtRules(),
        jeugdzorg: ortDefaultJeugdzorgRules(),
      };
    }

    function ortRead() {
      try {
        var raw = localStorage.getItem(ORT_KEY);
        var data = raw ? safeJsonParse(raw, null) : null;
        if (!data || typeof data !== "object") {
          data = ortDefaultRules();
          localStorage.setItem(ORT_KEY, JSON.stringify(data));
          return data;
        }
        var def = ortDefaultRules();
        var changed = false;
        if (!Array.isArray(data.vvt)) {
          data.vvt = def.vvt.slice();
          changed = true;
        }
        if (!Array.isArray(data.jeugdzorg)) {
          data.jeugdzorg = def.jeugdzorg.slice();
          changed = true;
        }
        if (!data._vvtPresetVersion || data._vvtPresetVersion < 2) {
          data.vvt = ortDefaultVvtRules();
          data._vvtPresetVersion = 2;
          changed = true;
        }
        if (!data._jeugdzorgPresetVersion || data._jeugdzorgPresetVersion < 2) {
          data.jeugdzorg = ortDefaultJeugdzorgRules();
          data._jeugdzorgPresetVersion = 2;
          changed = true;
        }
        if (changed) localStorage.setItem(ORT_KEY, JSON.stringify(data));
        return data;
      } catch (e) {
        var d = ortDefaultRules();
        try {
          localStorage.setItem(ORT_KEY, JSON.stringify(d));
        } catch (e3) {}
        return d;
      }
    }

    function ortWrite(data) {
      try {
        localStorage.setItem(ORT_KEY, JSON.stringify(data));
      } catch (e) {}
      if (window.saladminDB && typeof window.saladminDB.pushOrt === "function") {
        try { window.saladminDB.pushOrt(data); } catch (e) { /* */ }
      }
    }

    function ortTijdLabel(start, end) {
      var enDash = "\u2013";
      return (start || "00:00") + " " + enDash + " " + (end || "00:00");
    }

    function ortRender() {
      var data = ortRead();
      var rules = data[currentCao] || [];
      ortTbody.innerHTML = "";
      rules.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.dataset.ortId = r.id;

        var tdDag = document.createElement("td");
        tdDag.textContent = r.dag || "";
        tr.appendChild(tdDag);

        var tdTijd = document.createElement("td");
        tdTijd.textContent = ortTijdLabel(r.start, r.end);
        tr.appendChild(tdTijd);

        var tdPct = document.createElement("td");
        var spanPct = document.createElement("span");
        spanPct.className = "sa-ort-pct";
        spanPct.textContent = String(r.percentage != null ? r.percentage : "") + "%";
        tdPct.appendChild(spanPct);
        tr.appendChild(tdPct);

        var tdAct = document.createElement("td");
        tdAct.className = "sa-ort-td-act";
        var wrap = document.createElement("div");
        wrap.className = "sa-ort-act-wrap";

        var btnEd = document.createElement("button");
        btnEd.type = "button";
        btnEd.className = "sa-ort-icon-btn";
        btnEd.setAttribute("aria-label", "Regel bewerken");
        btnEd.innerHTML = ICO_EDIT;
        btnEd.addEventListener("click", function (e) {
          e.preventDefault();
          ortOpenEdit(r.id);
        });

        var btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "sa-ort-icon-btn";
        btnDel.setAttribute("aria-label", "Regel verwijderen");
        btnDel.innerHTML = ICO_DEL;
        btnDel.addEventListener("click", function (e) {
          e.preventDefault();
          var ortPreview = "";
          try {
            ortPreview = [r.diensttype, r.dag, r.vanaf || r.tot ? (r.vanaf || "") + (r.tot ? "–" + r.tot : "") : ""]
              .filter(Boolean).join(" — ");
          } catch (_e) { /* noop */ }
          var ortConfirm;
          if (typeof window.showSliderConfirmModal === "function") {
            ortConfirm = window.showSliderConfirmModal({
              title: "ORT-regel verwijderen",
              message: "Weet je zeker dat je deze ORT-regel wilt verwijderen?",
              preview: ortPreview,
              okLabel: "Verwijderen",
            });
          } else {
            console.warn("[salaris-export] showSliderConfirmModal niet beschikbaar — actie geannuleerd.");
            ortConfirm = Promise.resolve(false);
          }
          ortConfirm.then(function (ok) {
            if (!ok) return;
            ortDeleteRule(r.id);
            if (typeof window.showActionFeedback === "function") {
              window.showActionFeedback("deleted", "ORT-regel");
            }
          });
        });

        wrap.appendChild(btnEd);
        wrap.appendChild(btnDel);
        tdAct.appendChild(wrap);
        tr.appendChild(tdAct);
        ortTbody.appendChild(tr);
      });
    }

    window.__saOrtRender = ortRender;

    function ortSetCao(cao) {
      currentCao = cao === "jeugdzorg" ? "jeugdzorg" : "vvt";
      ortCaoTabs.forEach(function (btn) {
        var on = btn.getAttribute("data-sa-cao") === currentCao;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      ortRender();
    }

    ortCaoTabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        ortSetCao(btn.getAttribute("data-sa-cao") || "vvt");
      });
    });

    function ortOpenModal(isEdit) {
      ortModal.style.display = "";
      ortModal.setAttribute("aria-hidden", "false");
      if (ortModalTitle) ortModalTitle.textContent = isEdit ? "Regel bewerken" : "Regel toevoegen";
    }

    function ortCloseModal() {
      ortModal.style.display = "none";
      ortModal.setAttribute("aria-hidden", "true");
      editingId = null;
      ortClearCustomDagOption();
      ortForm.reset();
    }

    function ortOpenAdd() {
      editingId = null;
      ortClearCustomDagOption();
      ortForm.reset();
      ortOpenModal(false);
    }

    function ortOpenEdit(id) {
      var data = ortRead();
      var rules = data[currentCao] || [];
      var r = rules.filter(function (x) {
        return x.id === id;
      })[0];
      if (!r) return;
      editingId = id;
      ortSetDagSelect(r.dag || "");
      if (ortStart) ortStart.value = r.start || "00:00";
      if (ortEnd) ortEnd.value = r.end || "00:00";
      if (ortPct) ortPct.value = String(r.percentage != null ? r.percentage : "");
      ortOpenModal(true);
    }

    function ortDeleteRule(id) {
      var data = ortRead();
      var rules = data[currentCao] || [];
      data[currentCao] = rules.filter(function (x) {
        return x.id !== id;
      });
      ortWrite(data);
      ortRender();
      if (typeof showSaveModal === "function") showSaveModal("Regel is verwijderd.", "Verwijderd");
      else showToast("Regel verwijderd");
    }

    if (ortAddBtn) ortAddBtn.addEventListener("click", ortOpenAdd);
    if (ortClose) ortClose.addEventListener("click", ortCloseModal);
    if (ortCancel) ortCancel.addEventListener("click", ortCloseModal);
    ortModal.addEventListener("click", function (e) {
      if (e.target === ortModal) ortCloseModal();
    });

    ortForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var dag = ortDag ? String(ortDag.value).trim() : "";
      var start = ortStart ? ortStart.value : "";
      var end = ortEnd ? ortEnd.value : "";
      var pctRaw = ortPct ? ortPct.value : "";
      var pct = parseInt(pctRaw, 10);
      if (!dag) {
        if (ortDag) ortDag.focus();
        return;
      }
      if (!start || !end) return;
      if (!isFinite(pct) || pct < 0) {
        if (ortPct) ortPct.focus();
        return;
      }

      var data = ortRead();
      var rules = (data[currentCao] || []).slice();
      var neu = {
        id: editingId || ortGenId(),
        dag: dag,
        start: start,
        end: end,
        percentage: pct,
      };
      if (editingId) {
        var idx = rules.findIndex(function (x) {
          return x.id === editingId;
        });
        if (idx >= 0) rules[idx] = neu;
      } else {
        rules.push(neu);
      }
      data[currentCao] = rules;
      ortWrite(data);
      ortCloseModal();
      ortRender();
      if (typeof showSaveModal === "function") showSaveModal("ORT-regel is opgeslagen.");
      else showToast("ORT-regel opgeslagen");
    });

    ortSetCao("vvt");
  })();

  setMainTab(window.location.hash === "#ort" ? "ort" : "export");
  renderValidation();
  renderHistory();

  // Re-render zodra de Supabase-bootstrap de cache heeft gevuld (eerste page-
  // load op een nieuwe browser).
  window.addEventListener("besa:saladmin-updated", function () {
    try { renderHistory(); } catch (e) { /* */ }
  });
})();
