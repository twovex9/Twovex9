/* global getClientenById, getClientenItems, upsertClienten, ensureClientDetailFields, FASEN_CLIËNT, addBeschikkingVanuitFormulier, showSaveModal */
(function () {
  "use strict";

  var toastEl = document.getElementById("cd-toast");
  var missing = document.getElementById("cd-missing");
  var root = document.getElementById("cd-root");
  var h1 = document.getElementById("cd-h1");
  var form = document.getElementById("cd-form");

  if (typeof getClientenById !== "function" || !form) return;

  function getQueryId() {
    var s = window.location.search;
    if (s && s.length > 1) {
      var p;
      try {
        p = new URLSearchParams(s);
      } catch (e) {
        p = null;
      }
      if (p) {
        var id0 = p.get("id");
        if (id0) return id0.trim();
      }
    }
    var h = String(window.location.hash || "");
    if (h && h.indexOf("id=") !== -1) {
      var m = h.match(/[?#&]id=([^&]+)/) || h.match(/id=([^&]+)/);
      if (m) {
        try {
          return decodeURIComponent(m[1]).trim();
        } catch (e) {
          return m[1].trim();
        }
      }
    }
    return "";
  }

  function showToast(msg) {
    if (!msg || !toastEl) return;
    var backdrop = document.getElementById("app-toast-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "app-toast-backdrop";
      backdrop.className = "app-toast-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      document.body.appendChild(backdrop);
    }
    toastEl.textContent = msg;
    toastEl.className = "app-toast app-toast--clienten app-toast--centered";
    toastEl.removeAttribute("hidden");
    backdrop.classList.remove("is-visible");
    toastEl.classList.remove("is-visible");
    void backdrop.offsetWidth;
    void toastEl.offsetWidth;
    backdrop.classList.add("is-visible");
    toastEl.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      if (toastEl) {
        toastEl.classList.remove("is-visible");
        toastEl.setAttribute("hidden", "");
      }
      if (backdrop) backdrop.classList.remove("is-visible");
    }, 2200);
  }

  var MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

  function formatDateNl(iso) {
    if (!iso || !String(iso).trim()) return "—";
    var d0 = String(iso).slice(0, 10);
    var p = d0.split("-");
    if (p.length !== 3) return "—";
    var y = parseInt(p[0], 10);
    var mo = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    if (!y || mo < 0 || mo > 11 || !d) return "—";
    return d + " " + MONTHS_NL[mo] + " " + y;
  }

  function isoFromDateInput(v) {
    if (!v) return "";
    return String(v).trim();
  }

  function uniqueSorted(values) {
    var s = {};
    (values || []).forEach(function (v) {
      v = (v == null ? "" : String(v)).trim();
      if (v) s[v] = true;
    });
    return Object.keys(s).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  }

  var HR_EMP_KEY = "employeeItems";
  var HR_EMP_EDITS_KEY = "employeeEditsById";
  var HR_EMP_LEGACY_KEY = "employees";

  function readLsArray(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function readLsObject(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return {};
      var p = JSON.parse(raw);
      return p && typeof p === "object" ? p : {};
    } catch (e) {
      return {};
    }
  }

  function hrDisplayName(emp) {
    if (!emp) return "";
    var f = String(emp.voornaam || emp.firstName || "").trim();
    var l = String(emp.achternaam || emp.lastName || "").trim();
    var full = (f + " " + l).trim();
    if (full) return full;
    return String(emp.naam || "").trim();
  }

  function getHrEmployeeRows() {
    var list = readLsArray(HR_EMP_KEY);
    if (!list.length) list = readLsArray(HR_EMP_LEGACY_KEY);
    var edits = readLsObject(HR_EMP_EDITS_KEY);
    var out = [];
    (list || []).forEach(function (raw) {
      if (!raw) return;
      var eid = raw.empId != null && String(raw.empId) !== "" ? String(raw.empId) : raw.id != null && String(raw.id) !== "" ? String(raw.id) : "";
      if (!eid) return;
      var m = Object.assign({}, raw, edits[eid] && typeof edits[eid] === "object" ? edits[eid] : {});
      if (m.archived) return;
      out.push({ id: eid, name: hrDisplayName(m) });
    });
    out.sort(function (a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "nl", { sensitivity: "base" });
    });
    return out;
  }

  function fillSelectWithStrings(sel, list, current, emptyLabel) {
    if (!sel) return;
    var first = emptyLabel
      ? (function () {
        var o = document.createElement("option");
        o.value = "";
        o.textContent = emptyLabel;
        return o;
      })()
      : null;
    sel.innerHTML = "";
    if (first) sel.appendChild(first);
    list.forEach(function (x) {
      var o = document.createElement("option");
      o.value = x;
      o.textContent = x;
      if (x === current) o.selected = true;
      sel.appendChild(o);
    });
    if (current && !list.some(function (x) {
      return x === current;
    })) {
      var o2 = document.createElement("option");
      o2.value = current;
      o2.textContent = current;
      o2.selected = true;
      sel.appendChild(o2);
    } else if (!sel.value && current) {
      sel.value = current;
    }
    if (emptyLabel && (current == null || String(current).trim() === "")) {
      sel.value = "";
    }
  }

  function faseDotClass(f) {
    if (typeof window.besaFaseClientSdotClass === "function") {
      return window.besaFaseClientSdotClass(f);
    }
    var t = String(f || "").toLowerCase();
    if (t === "in zorg") return "client-detail-sdot--fase-in-zorg";
    if (t === "in aanvraag") return "client-detail-sdot--fase-in-aanvraag";
    if (t === "uit zorg") return "client-detail-sdot--fase-uit-zorg";
    return "client-detail-sdot--fase-in-zorg";
  }

  var qid = getQueryId();
  var c0 = getClientenById(qid);
  if (typeof ensureClientDetailFields === "function" && c0) ensureClientDetailFields(c0);

  if (!qid || !c0) {
    // Mogelijk staat de cliënt nog niet in de cache omdat de Supabase-bootstrap
    // niet klaar is. Eén keer wachten op de update-event en dan herladen.
    if (qid && !c0) {
      var clientDetailReloaded = false;
      window.addEventListener("besa:clienten-updated", function onClientenUpdated() {
        if (clientDetailReloaded) return;
        var found = typeof getClientenById === "function" ? getClientenById(qid) : null;
        if (found) {
          clientDetailReloaded = true;
          window.removeEventListener("besa:clienten-updated", onClientenUpdated);
          window.location.reload();
        }
      });
    }
    if (missing) missing.removeAttribute("hidden");
    if (h1) h1.textContent = "Cliëntdossier";
    return;
  }

  var c = c0;
  if (root) root.removeAttribute("hidden");
  if (h1) h1.textContent = (c.voornaam || "—") + " " + (c.achternaam || "").trim();
  if (window.document) {
    var nt = (c.voornaam || "Cliënt").trim() + (c.achternaam ? " " + String(c.achternaam).trim() : "");
    document.title = nt + " | Cliëntdossier — HR";
  }

  var all = (typeof getClientenItems === "function" && getClientenItems()) || [];
  var locs = uniqueSorted(all.map(function (x) {
    return x && x.locatie;
  }));
  var orgs;
  if (typeof getOrganisatieNamenVoorSelectie === "function") {
    orgs = getOrganisatieNamenVoorSelectie();
  } else {
    orgs = uniqueSorted(all.map(function (x) {
      return x && x.organisatie;
    }));
  }
  var gems = uniqueSorted(all.map(function (x) {
    return x && x.gemeente;
  }));

  var gemList = document.getElementById("cd-gem-list");
  if (gemList) {
    gemList.innerHTML = "";
    gems.forEach(function (g) {
      var o = document.createElement("option");
      o.value = g;
      gemList.appendChild(o);
    });
  }

  var locSel = document.getElementById("cd-f-loc");
  var orgSel = document.getElementById("cd-f-org");
  fillSelectWithStrings(locSel, locs, (c.locatie == null ? "" : String(c.locatie)).trim(), "(Leeg — later invullen)");
  fillSelectWithStrings(orgSel, orgs, (c.organisatie == null ? "" : String(c.organisatie)).trim(), "Selecteer Organisatie");

  var heroName = document.getElementById("cd-hero-name");
  var heroNr = document.getElementById("cd-hero-nr");
  var aIn = document.getElementById("cd-aside-inzorg");
  var aOut = document.getElementById("cd-aside-uitzorg");
  if (heroName) heroName.textContent = (c.voornaam || "—") + (c.achternaam ? " " + String(c.achternaam) : "");
  if (heroNr) heroNr.textContent = c.clientnummer != null ? String(c.clientnummer) : "—";
  if (aIn) aIn.textContent = formatDateNl(c.inZorgDatum);
  if (aOut) aOut.textContent = c.uitZorgDatum ? formatDateNl(c.uitZorgDatum) : "—";

  document.getElementById("cd-f-vn").value = c.voornaam != null ? String(c.voornaam) : "";
  document.getElementById("cd-f-an").value = c.achternaam != null ? String(c.achternaam) : "";
  document.getElementById("cd-f-nr").value = c.clientnummer != null ? String(c.clientnummer) : "";
  document.getElementById("cd-f-fase").value = c.fase || "in zorg";
  if (c.inZorgDatum && String(c.inZorgDatum).length >= 10) {
    document.getElementById("cd-f-izd").value = String(c.inZorgDatum).slice(0, 10);
  } else {
    document.getElementById("cd-f-izd").value = "";
  }
  if (c.uitZorgDatum && String(c.uitZorgDatum).length >= 10) {
    document.getElementById("cd-f-ui").value = String(c.uitZorgDatum).slice(0, 10);
  } else {
    document.getElementById("cd-f-ui").value = "";
  }
  document.getElementById("cd-f-gem").value = c.gemeente != null ? String(c.gemeente) : "";
  document.getElementById("cd-f-req").value = c.requiredForms != null ? String(c.requiredForms) : "";
  document.getElementById("cd-srch-gw").value = c.gedragswetenschapperZoek != null ? String(c.gedragswetenschapperZoek) : "";
  var zn = document.getElementById("cd-zij-not");
  if (zn) zn.value = c.zijbalkNotities != null ? String(c.zijbalkNotities) : "";
  var tno = document.getElementById("cd-tabnot");
  if (tno) tno.value = c.tabNotities != null ? String(c.tabNotities) : "";

  var locDot = document.getElementById("cd-f-loc-dot");
  var fasDot = document.getElementById("cd-f-fase-dot");
  var orgDot = document.getElementById("cd-f-org-dot");
  function syncDots() {
    if (locDot) locDot.className = "client-detail-sdot client-detail-sdot--loc";
    if (fasDot) fasDot.className = "client-detail-sdot " + faseDotClass(document.getElementById("cd-f-fase").value);
    if (orgDot) {
      var ov = (orgSel && orgSel.value) || "";
      orgDot.className = "client-detail-sdot " + (ov ? "client-detail-sdot--org" : "client-detail-sdot--neut");
    }
  }
  syncDots();
  document.getElementById("cd-f-fase").addEventListener("change", syncDots);
  if (orgSel) orgSel.addEventListener("change", syncDots);
  if (locSel) locSel.addEventListener("change", syncDots);

  var empHint = document.getElementById("cd-emp-hint");
  var gwHint = document.getElementById("cd-gw-hint");
  var notHint = document.getElementById("cd-zij-not-hint");

  function syncMedewerkerSelect() {
    var sel = document.getElementById("cd-emp");
    if (!sel) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    var savedId = cl && cl.medewerkerEmpId != null ? String(cl.medewerkerEmpId) : "";
    var savedZoek = cl && cl.medewerkerZoek != null ? String(cl.medewerkerZoek).trim() : "";
    var uiPrior = sel.value;
    var rows = getHrEmployeeRows();
    var byId = {};
    rows.forEach(function (r) {
      if (r && r.id) byId[r.id] = r;
    });
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Geen medewerker";
    sel.appendChild(o0);
    rows.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name || "—";
      sel.appendChild(o);
    });
    var pick = "";
    if (uiPrior && byId[uiPrior]) {
      pick = uiPrior;
    } else if (savedId && byId[savedId]) {
      pick = savedId;
    } else if (savedZoek) {
      for (var ri = 0; ri < rows.length; ri++) {
        if (rows[ri].name && rows[ri].name.toLowerCase() === savedZoek.toLowerCase()) {
          pick = rows[ri].id;
          break;
        }
      }
    }
    sel.value = pick;
    sel.removeAttribute("data-orphan");
    sel.removeAttribute("data-orphan-label");
    if (!pick) {
      if (savedId && !byId[savedId]) {
        sel.setAttribute("data-orphan", "1");
        sel.setAttribute("data-orphan-label", savedZoek || ("ID: " + savedId));
      } else if (savedZoek && !savedId) {
        var nameMatch = false;
        for (var j = 0; j < rows.length; j++) {
          if (rows[j].name && rows[j].name.toLowerCase() === savedZoek.toLowerCase()) {
            nameMatch = true;
            break;
          }
        }
        if (!nameMatch) {
          sel.setAttribute("data-orphan", "1");
          sel.setAttribute("data-orphan-label", savedZoek);
        }
      }
    }
  }

  function onHrListMaybeChanged() {
    syncMedewerkerSelect();
    if (typeof updHints === "function") updHints();
  }

  function updHints() {
    if (empHint) {
      var es = document.getElementById("cd-emp");
      if (es) {
        if (es.getAttribute("data-orphan") === "1") {
          var oLab = (es.getAttribute("data-orphan-label") || "").trim();
          empHint.textContent = oLab
            ? "Opgeslagen: " + oLab + ", maar deze staat niet (meer) in HR → Medewerkers. Kies een geldige medewerker."
            : "Eerdere koppeling niet meer gevonden. Kies opnieuw een medewerker in de lijst.";
        } else if (es.value) {
          empHint.textContent = "Gekoppeld met medewerker uit HR. Lijst komt overeen met Medewerkers; open het menu opnieuw om wijzigingen in HR te zien na opslaan daar.";
        } else {
          empHint.textContent = "Kies een medewerker uit de lijst (zelfde bron als HR → Medewerkers).";
        }
      }
    }
    if (gwHint) {
      gwHint.textContent = (document.getElementById("cd-srch-gw").value || "").trim()
        ? "Zoekopdracht opgeslagen. Koppeling gedragswetenschapper volgt wanneer beschikbaar."
        : "Er is nog geen gedragswetenschapper gekoppeld aan deze cliënt.";
    }
    if (notHint) {
      notHint.textContent = (zn && zn.value || "").trim()
        ? "Notities in de zijbalk worden mee opgeslagen bij wijzigingen."
        : "Nog geen notities. Vul hierboven in en sla het dossier op.";
    }
  }
  syncMedewerkerSelect();
  updHints();
  var cdEmp = document.getElementById("cd-emp");
  if (cdEmp) {
    cdEmp.addEventListener("change", updHints);
    cdEmp.addEventListener("focus", onHrListMaybeChanged);
  }
  document.getElementById("cd-srch-gw").addEventListener("input", updHints);
  if (zn) zn.addEventListener("input", updHints);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") onHrListMaybeChanged();
  });
  window.addEventListener("storage", function (e) {
    if (e.key === HR_EMP_KEY || e.key === HR_EMP_EDITS_KEY) onHrListMaybeChanged();
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) onHrListMaybeChanged();
  });

  document.getElementById("cd-f-gem-clear").addEventListener("click", function () {
    var el = document.getElementById("cd-f-gem");
    if (el) el.value = "";
  });

  var pans = {
    d: document.getElementById("cd-pan-d"),
    b: document.getElementById("cd-pan-b"),
    p: document.getElementById("cd-pan-p"),
    c: document.getElementById("cd-pan-c"),
    n: document.getElementById("cd-pan-n"),
    j: document.getElementById("cd-pan-j"),
    r: document.getElementById("cd-pan-r"),
    q: document.getElementById("cd-pan-q"),
    i: document.getElementById("cd-pan-i"),
  };
  var panOrder = "dbpcnjqri";

  function setTab(k) {
    if (!pans[k]) k = "d";
    Object.keys(pans).forEach(function (key) {
      var p = pans[key];
      if (!p) return;
      var isOn = key === k;
      p.classList.toggle("is-active", isOn);
      p.hidden = !isOn;
      p.setAttribute("aria-hidden", isOn ? "false" : "true");
    });
    document.querySelectorAll(".client-detail-tab").forEach(function (btn) {
      var kn = btn.getAttribute("data-cd-panel");
      var on = kn === k;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      if (on) {
        btn.removeAttribute("tabindex");
        btn.setAttribute("tabindex", "0");
      } else {
        btn.setAttribute("tabindex", "-1");
      }
    });
  }
  setTab("d");
  document.querySelectorAll(".client-detail-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setTab(btn.getAttribute("data-cd-panel") || "d");
    });
  });
  var tablist = document.querySelector(".client-detail-tabs");
  if (tablist) {
    tablist.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var a = document.activeElement;
      if (!a || !a.classList || !a.classList.contains("client-detail-tab")) return;
      e.preventDefault();
      var k = a.getAttribute("data-cd-panel");
      if (!k || !panOrder) return;
      var idx = panOrder.indexOf(k);
      if (idx < 0) return;
      var nidx = e.key === "ArrowRight" ? (idx + 1) % panOrder.length : (idx - 1 + panOrder.length) % panOrder.length;
      var next = document.querySelector('.client-detail-tab[data-cd-panel="' + panOrder[nidx] + '"]');
      if (next) {
        setTab(panOrder[nidx]);
        next.focus();
      }
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = c.id;
    if (typeof getClientenById === "function") {
      c = getClientenById(id) || c;
    }
    var next = {
      id: c.id,
      voornaam: (document.getElementById("cd-f-vn").value || "").trim(),
      achternaam: (document.getElementById("cd-f-an").value || "").trim(),
      clientnummer: Math.max(1, parseInt(document.getElementById("cd-f-nr").value, 10) || 1),
      locatie: (locSel && locSel.value) ? locSel.value : "",
      fase: document.getElementById("cd-f-fase").value || "in zorg",
      inZorgDatum: isoFromDateInput(document.getElementById("cd-f-izd").value),
      uitZorgDatum: isoFromDateInput(document.getElementById("cd-f-ui").value),
      gemeente: (document.getElementById("cd-f-gem").value || "").trim(),
      organisatie: (orgSel && orgSel.value) ? orgSel.value : "",
      requiredForms: (document.getElementById("cd-f-req").value || "").trim(),
      medewerkerEmpId: (function () {
        var s = document.getElementById("cd-emp");
        if (!s || !s.value) return "";
        return String(s.value);
      })(),
      medewerkerZoek: (function () {
        var s = document.getElementById("cd-emp");
        if (!s || !s.value) return "";
        var oi = s.selectedIndex;
        if (oi < 0 || !s.options[oi]) return "";
        return String(s.options[oi].textContent || "").trim();
      })(),
      gedragswetenschapperZoek: (document.getElementById("cd-srch-gw").value || "").trim(),
      zijbalkNotities: zn && zn.value != null ? String(zn.value) : "",
      tabNotities: tno && tno.value != null ? String(tno.value) : "",
      archived: c.archived,
      aanmaakdatum: c.aanmaakdatum,
      detailNotities: c.detailNotities,
    };
    if (typeof upsertClienten === "function") {
      upsertClienten(Object.assign({}, c, next));
      var nm = (next.voornaam || "").trim() + (next.achternaam ? " " + String(next.achternaam).trim() : "");
      if (typeof showSaveModal === "function") {
        showSaveModal(nm ? nm + " is opgeslagen." : "Cliënt is opgeslagen.");
      } else {
        showToast(nm ? nm + " is opgeslagen" : "Cliënt is opgeslagen");
      }
      c = (typeof getClientenById === "function" && getClientenById(id)) || Object.assign(c, next);
    }
    if (heroName) heroName.textContent = (c.voornaam || "—") + (c.achternaam ? " " + String(c.achternaam) : "");
    if (h1) h1.textContent = (c.voornaam || "—") + (c.achternaam ? " " + String(c.achternaam) : "");
    if (aIn) aIn.textContent = formatDateNl(c.inZorgDatum);
    if (aOut) aOut.textContent = c.uitZorgDatum ? formatDateNl(c.uitZorgDatum) : "—";
    if (window.document) {
      var nt2 = (c.voornaam || "Cliënt").trim() + (c.achternaam ? " " + String(c.achternaam).trim() : "");
      document.title = nt2 + " | Cliëntdossier — HR";
    }
    var nrEl = document.getElementById("cd-hero-nr");
    if (nrEl && c.clientnummer != null) nrEl.textContent = String(c.clientnummer);
  });

  (function initClientBeschikkingen() {
    var cdbTable = document.getElementById("cdb-table");
    if (!cdbTable) return;
    var cdbTbody = document.getElementById("cdb-tbody");
    var cdbSearch = document.getElementById("cdb-search");
    var cdb60 = document.getElementById("cdb-60d");
    var cdbColBtn = document.getElementById("cdb-columns-btn");
    var cdbColPanel = document.getElementById("cdb-columns-panel");
    var cdbCheckAll = document.getElementById("cdb-check-all");
    var cdbExport = document.getElementById("cdb-export-btn");
    var cdbAdd = document.getElementById("cdb-add-btn");
    var cdbRange = document.getElementById("cdb-pager-range");
    var cdbPageLab = document.getElementById("cdb-pager-page");
    var cdbEmpty = document.getElementById("cdb-filter-empty");
    var bescSortKey = "periode";
    var bescSortDir = "asc";
    var cdbThead = cdbTable.querySelector("thead");

    function bescGetCellSortValue(tr, col) {
      var td = tr.querySelector('td[data-col="' + col + '"]');
      if (!td) return "";
      var raw = (td.textContent || "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
      if (col === "tarief") {
        var t = (td.textContent || "").replace(/[^\d.,-]/g, " ").replace(/\s+/g, " ").trim();
        var m = t.match(/(\d+)[,.](\d{1,2})/);
        if (m) return parseFloat(m[1] + "." + m[2], 10);
        return 0;
      }
      if (raw === "—" || raw === "-") return "";
      return raw.toLowerCase();
    }

    function bescCmp(av, bv) {
      if (typeof av === "number" && typeof bv === "number" && !isNaN(av) && !isNaN(bv)) {
        if (av < bv) return -1;
        if (av > bv) return 1;
        return 0;
      }
      return String(av).localeCompare(String(bv), "nl", { numeric: true, sensitivity: "base" });
    }

    function bescSortDataRows() {
      if (!cdbTbody) return;
      var rows = Array.prototype.slice.call(cdbTbody.querySelectorAll("tr.cdb-data-row"));
      if (!rows.length) return;
      var empty = document.getElementById("cdb-filter-empty");
      rows.sort(function (a, b) {
        var av = bescGetCellSortValue(a, bescSortKey);
        var bv = bescGetCellSortValue(b, bescSortKey);
        var c = bescCmp(av, bv);
        return bescSortDir === "desc" ? -c : c;
      });
      rows.forEach(function (r) {
        cdbTbody.appendChild(r);
      });
      if (empty) cdbTbody.appendChild(empty);
    }

    function bescSyncSortTh() {
      cdbTable.querySelectorAll("thead th.th-sort").forEach(function (th) {
        th.classList.remove("th-sort--asc", "th-sort--desc", "th-sort-open");
        var c = th.getAttribute("data-col");
        if (c && c === bescSortKey) {
          th.classList.add(bescSortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
        }
      });
    }

    function setBescColVisible(colId, vis) {
      cdbTable.querySelectorAll('[data-col="' + colId + '"]').forEach(function (el) {
        el.classList.toggle("col-hidden", !vis);
      });
    }

    function applyBescColumns() {
      if (!cdbColPanel) return;
      cdbColPanel.querySelectorAll(".column-toggle").forEach(function (btn) {
        var colId = btn.getAttribute("data-col");
        if (!colId) return;
        var on = btn.classList.contains("is-checked");
        btn.setAttribute("aria-checked", on ? "true" : "false");
        setBescColVisible(colId, on);
      });
    }

    function updateBescFilterUi() {
      if (!cdbTbody) return;
      var q = cdbSearch && cdbSearch.value ? cdbSearch.value.toLowerCase().trim() : "";
      var only60 = cdb60 && cdb60.checked;
      var nVis = 0;
      cdbTbody.querySelectorAll("tr.cdb-data-row").forEach(function (tr) {
        var t = (tr.getAttribute("data-besc-naam-norm") || tr.textContent || "").toLowerCase();
        var mSearch = !q || t.indexOf(q) !== -1;
        var binnen = tr.getAttribute("data-besc-binnen-60") === "1";
        var m60 = !only60 || binnen;
        var on = mSearch && m60;
        tr.style.display = on ? "" : "none";
        if (on) nVis++;
      });
      if (cdbEmpty) cdbEmpty.style.display = nVis === 0 ? "table-row" : "none";
      if (cdbRange) cdbRange.textContent = nVis === 0 ? "0 van 0" : nVis === 1 ? "1-1 van 1 totaal" : "1-" + nVis + " van " + nVis + " totaal";
      if (cdbPageLab) cdbPageLab.textContent = nVis === 0 ? "Pagina 0 van 0" : "Pagina 1 van 1";
    }

    if (cdbSearch) cdbSearch.addEventListener("input", updateBescFilterUi);
    if (cdb60) cdb60.addEventListener("change", updateBescFilterUi);
    if (cdbCheckAll) {
      cdbCheckAll.addEventListener("change", function () {
        var on = cdbCheckAll.checked;
        cdbTbody.querySelectorAll(".cdb-row-check").forEach(function (c) {
          c.checked = on;
        });
      });
    }
    cdbTbody && cdbTbody.addEventListener("change", function (e) {
      if (e.target && e.target.classList && e.target.classList.contains("cdb-row-check")) {
        if (cdbCheckAll) cdbCheckAll.checked = false;
      }
    });

    function positionCdbColPanel() {
      if (!cdbColBtn || !cdbColPanel) return;
      if (cdbColPanel.hasAttribute("hidden")) return;
      var rect = cdbColBtn.getBoundingClientRect();
      var panelWidth = cdbColPanel.offsetWidth || 252;
      var alignRight = rect.left > window.innerWidth / 2;
      var preferredLeft = alignRight ? rect.right - panelWidth : rect.left;
      var minLeft = 8;
      var maxLeft = window.innerWidth - panelWidth - 8;
      var left = Math.max(minLeft, Math.min(maxLeft, preferredLeft));
      var top = rect.bottom + 8;
      var minTop = 8;
      var maxTop = window.innerHeight - 80;
      cdbColPanel.style.top = Math.max(minTop, Math.min(maxTop, top)) + "px";
      cdbColPanel.style.left = left + "px";
      cdbColPanel.style.right = "auto";
    }
    function closeCdbColPanel() {
      if (!cdbColPanel) return;
      cdbColPanel.setAttribute("hidden", "");
      if (cdbColBtn) cdbColBtn.setAttribute("aria-expanded", "false");
      window.removeEventListener("resize", positionCdbColPanel);
      window.removeEventListener("scroll", positionCdbColPanel, true);
    }
    if (cdbColBtn && cdbColPanel) {
      cdbColBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (cdbColPanel.hasAttribute("hidden")) {
          cdbColPanel.removeAttribute("hidden");
          cdbColBtn.setAttribute("aria-expanded", "true");
          positionCdbColPanel();
          window.addEventListener("resize", positionCdbColPanel);
          window.addEventListener("scroll", positionCdbColPanel, true);
        } else {
          closeCdbColPanel();
        }
      });
      cdbColPanel.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      cdbColPanel.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        applyBescColumns();
      });
    }
    document.addEventListener("click", function () {
      closeCdbColPanel();
    });

    var cdbExportModal = document.getElementById("cdb-export-modal");
    var cdbExportSearch = document.getElementById("cdb-export-search");
    var cdbExportSelAll = document.getElementById("cdb-export-selall");
    var cdbExportClose = document.getElementById("cdb-export-close");
    var cdbExportCancel = document.getElementById("cdb-export-cancel");
    var cdbExportConfirm = document.getElementById("cdb-export-confirm");

    function cdbOpenExportModal() {
      if (!cdbExportModal) return;
      cdbExportModal.removeAttribute("hidden");
      cdbExportModal.setAttribute("aria-hidden", "false");
      if (cdbExportSearch) {
        cdbExportSearch.value = "";
        cdbFilterExportList("");
        setTimeout(function () {
          cdbExportSearch.focus();
        }, 10);
      }
    }

    function cdbCloseExportModal() {
      if (!cdbExportModal) return;
      cdbExportModal.setAttribute("hidden", "");
      cdbExportModal.setAttribute("aria-hidden", "true");
    }

    function cdbFilterExportList(q) {
      var nq = (q || "").toLowerCase().trim();
      cdbExportModal && cdbExportModal.querySelectorAll(".cdb-export-item").forEach(function (li) {
        var f = (li.getAttribute("data-cdb-exp-filter") || "") + " " + (li.textContent || "");
        f = f.toLowerCase();
        if (!nq || f.indexOf(nq) !== -1) {
          li.removeAttribute("hidden");
        } else {
          li.setAttribute("hidden", "");
        }
      });
    }

    function cdbUpdateExportSelAll() {
      if (!cdbExportSelAll) return;
      var cbs = cdbExportModal ? cdbExportModal.querySelectorAll('input[name="cdb_exp_col"]') : [];
      var n = 0;
      var on = 0;
      cbs.forEach(function (c) {
        n++;
        if (c.checked) on++;
      });
      cdbExportSelAll.checked = n > 0 && on === n;
      cdbExportSelAll.indeterminate = on > 0 && on < n;
    }

    var cdbAddModal = document.getElementById("cdb-add-modal");
    var cdbAddForm = document.getElementById("cdb-add-besc-form");
    var cdbAddClose = document.getElementById("cdb-add-close");
    var cdbAddCancel = document.getElementById("cdb-add-cancel");
    var cdbAddName = document.getElementById("cdb-add-client-name");
    var cdbAddFasePill = document.getElementById("cdb-add-client-fase");

    function cdbBescFasePillClass(f) {
      if (typeof window.besaFaseClientPillClass === "function") {
        return window.besaFaseClientPillClass(f);
      }
      var t = String(f || "").toLowerCase();
      if (t === "in zorg") return "cl-fase-pill cl-fase-pill--in-zorg";
      if (t === "in aanvraag") return "cl-fase-pill cl-fase-pill--in-aanvraag";
      if (t === "uit zorg") return "cl-fase-pill cl-fase-pill--uit-zorg";
      return "cl-fase-pill cl-fase-pill--in-zorg";
    }

    function cdbBescFaseLabel(f) {
      var t = String(f || "").toLowerCase();
      if (t === "in zorg") return "In zorg";
      if (t === "in aanvraag") return "In aanvraag";
      if (t === "uit zorg") return "Uit zorg";
      if (f != null && String(f).trim() !== "") return String(f).trim();
      return "—";
    }

    function cdbFillAddBescClientRow() {
      if (!cdbAddName || !cdbAddFasePill) return;
      var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
      if (!cl) {
        cdbAddName.textContent = "—";
        cdbAddFasePill.className = cdbBescFasePillClass("");
        cdbAddFasePill.textContent = "—";
        return;
      }
      var fn = cl.voornaam != null ? String(cl.voornaam).trim() : "";
      var an = cl.achternaam != null ? String(cl.achternaam).trim() : "";
      cdbAddName.textContent = (fn + (fn && an ? " " : "") + an).trim() || "—";
      cdbAddFasePill.className = cdbBescFasePillClass(cl.fase);
      cdbAddFasePill.textContent = cdbBescFaseLabel(cl.fase);
    }

    function cdbOpenAddBescModal() {
      if (!cdbAddModal || !cdbAddForm) return;
      cdbAddForm.reset();
      cdbFillAddBescClientRow();
      cdbAddModal.removeAttribute("hidden");
      cdbAddModal.setAttribute("aria-hidden", "false");
      setTimeout(function () {
        var n = document.getElementById("cdb-add-naam");
        if (n) n.focus();
      }, 10);
    }

    function cdbCloseAddBescModal() {
      if (!cdbAddModal) return;
      cdbAddModal.setAttribute("hidden", "");
      cdbAddModal.setAttribute("aria-hidden", "true");
    }

    if (cdbAddModal) {
      cdbAddModal.addEventListener("click", function (e) {
        if (e.target === cdbAddModal) cdbCloseAddBescModal();
      });
    }
    if (cdbAddForm) {
      cdbAddForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (typeof addBeschikkingVanuitFormulier === "function") {
          var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
          if (cl) {
            var n = document.getElementById("cdb-add-naam");
            var zg = document.getElementById("cdb-add-zorg");
            var fs = document.getElementById("cdb-add-fase");
            var s = document.getElementById("cdb-add-start");
            var ei = document.getElementById("cdb-add-eind");
            var d = document.getElementById("cdb-add-decl");
            var fn = cl.voornaam != null ? String(cl.voornaam).trim() : "";
            var an = cl.achternaam != null ? String(cl.achternaam).trim() : "";
            addBeschikkingVanuitFormulier({
              clientId: cl.id,
              clientLabel: (fn + (fn && an ? " " : "") + an).trim() || "—",
              locatie: cl.locatie == null ? "" : String(cl.locatie).trim(),
              naam: n && n.value ? n.value.trim() : "",
              zorgsoortKey: zg && zg.value ? zg.value : "overig",
              fase: fs && fs.value ? fs.value : "actief",
              startISO: s && s.value ? s.value : "",
              eindISO: ei && ei.value ? ei.value : "",
              declMeth: d && d.value ? d.value : "",
            });
          }
        }
        cdbCloseAddBescModal();
        if (typeof showSaveModal === "function") showSaveModal("Beschikking is opgeslagen.");
        else showToast("Beschikking opgeslagen");
      });
    }
    [cdbAddClose, cdbAddCancel].forEach(function (btn) {
      if (btn) btn.addEventListener("click", function () { cdbCloseAddBescModal(); });
    });

    if (cdbExport) cdbExport.addEventListener("click", function (e) {
      e.preventDefault();
      cdbOpenExportModal();
    });
    if (cdbExportSearch) cdbExportSearch.addEventListener("input", function () {
      cdbFilterExportList(cdbExportSearch.value);
    });
    if (cdbExportSelAll) {
      cdbExportSelAll.addEventListener("change", function () {
        var on = cdbExportSelAll.checked;
        cdbExportModal && cdbExportModal.querySelectorAll('input[name="cdb_exp_col"]').forEach(function (c) {
          c.checked = on;
        });
        cdbExportSelAll.indeterminate = false;
      });
    }
    if (cdbExportModal) {
      cdbExportModal.addEventListener("change", function (e) {
        if (e.target && e.target.name === "cdb_exp_col") cdbUpdateExportSelAll();
      });
      cdbExportModal.addEventListener("click", function (e) {
        if (e.target === cdbExportModal) cdbCloseExportModal();
      });
    }
    [cdbExportClose, cdbExportCancel].forEach(function (btn) {
      if (btn) btn.addEventListener("click", function () { cdbCloseExportModal(); });
    });
    if (cdbExportConfirm) {
      cdbExportConfirm.addEventListener("click", function () {
        cdbCloseExportModal();
        showToast("Export gestart");
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (cdbAddModal && !cdbAddModal.hasAttribute("hidden")) cdbCloseAddBescModal();
      else if (cdbExportModal && !cdbExportModal.hasAttribute("hidden")) cdbCloseExportModal();
    });
    if (cdbAdd) {
      cdbAdd.addEventListener("click", function (e) {
        e.preventDefault();
        cdbOpenAddBescModal();
      });
    }

    if (cdbThead) {
      cdbThead.addEventListener("click", function (e) {
        var th = e.target && e.target.closest && e.target.closest("th.th-sort");
        if (!th || !cdbTable.contains(th)) return;
        if (e.target.closest && e.target.closest(".th-sort-menu")) return;
        e.preventDefault();
        var col = th.getAttribute("data-col");
        if (!col) return;
        if (col === bescSortKey) bescSortDir = bescSortDir === "asc" ? "desc" : "asc";
        else {
          bescSortKey = col;
          bescSortDir = "asc";
        }
        bescSortDataRows();
        bescSyncSortTh();
      });
    }

    bescSyncSortTh();
    updateBescFilterUi();
  })();
})();
