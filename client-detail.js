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
    // Stage 6: bron-van-waarheid is medewerkersDB (Supabase). Edits zitten al
    // in de DB-rows (data jsonb), dus geen aparte localStorage merge meer.
    var dbList = null;
    if (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function") {
      try {
        var fromDb = window.medewerkersDB.getAllSync();
        if (Array.isArray(fromDb) && fromDb.length) dbList = fromDb;
      } catch (e) { /* fall back below */ }
    }

    var out = [];
    if (dbList) {
      dbList.forEach(function (emp) {
        if (!emp || emp.archived) return;
        var eid = emp.empId != null && String(emp.empId) !== "" ? String(emp.empId) : emp.id != null && String(emp.id) !== "" ? String(emp.id) : "";
        if (!eid) return;
        out.push({ id: eid, name: hrDisplayName(emp) });
      });
    } else {
      var list = readLsArray(HR_EMP_KEY);
      if (!list.length) list = readLsArray(HR_EMP_LEGACY_KEY);
      var edits = readLsObject(HR_EMP_EDITS_KEY);
      (list || []).forEach(function (raw) {
        if (!raw) return;
        var eid = raw.empId != null && String(raw.empId) !== "" ? String(raw.empId) : raw.id != null && String(raw.id) !== "" ? String(raw.id) : "";
        if (!eid) return;
        var m = Object.assign({}, raw, edits[eid] && typeof edits[eid] === "object" ? edits[eid] : {});
        if (m.archived) return;
        out.push({ id: eid, name: hrDisplayName(m) });
      });
    }

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
    // Lazy load tab content when activated
    if (k === "p") renderBetalingen();
    if (k === "c") renderContacten();
    if (k === "r") renderRapportages();
  }

  /**
   * Render Betalingen-tab: lijst alle facturen die aan deze cliënt zijn gekoppeld
   * (via facturen.client_id of cliënt-clientnummer match). Toont samenvatting +
   * tabel. Reageert ook op `besa:facturen-updated` event voor live-refresh.
   */
  function renderBetalingen() {
    var tbody = document.getElementById("cd-bet-tbody");
    var empty = document.getElementById("cd-bet-empty");
    var summary = document.getElementById("cd-bet-summary");
    if (!tbody || !empty || !summary) return;

    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var all = (window.facturenDB && typeof window.facturenDB.getAllSync === "function")
      ? window.facturenDB.getAllSync()
      : [];

    // Filter: client_id match óf clientnummer match (BS2-records hebben soms alleen nummer)
    var clNr = cl.clientnummer ? String(cl.clientnummer) : null;
    var rows = all.filter(function (f) {
      if (!f || f.archived) return false;
      if (f.clientId && f.clientId === cl.id) return true;
      if (clNr && f.nr && String(f.nr) === clNr) return true;
      return false;
    });

    // Sorteer op periode descending (nieuwste eerst)
    rows.sort(function (a, b) {
      var pa = String(a.per || "");
      var pb = String(b.per || "");
      return pa < pb ? 1 : pa > pb ? -1 : 0;
    });

    // Tabel render
    tbody.innerHTML = "";
    rows.forEach(function (f) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td data-col="factuurnr">' + escapeHtml(f.fn || "—") + '</td>' +
        '<td data-col="periode">' + escapeHtml(f.per || "—") + '</td>' +
        '<td data-col="beschikking">' + escapeHtml(f.besch || "—") + '</td>' +
        '<td data-col="bedrag">' + escapeHtml(f.bedr || "€ 0,00") + '</td>' +
        '<td data-col="status">' + statusBadge(f.st) + '</td>';
      tbody.appendChild(tr);
    });

    // Empty state
    empty.hidden = rows.length > 0;
    summary.hidden = rows.length === 0;

    // Summary stats
    var totalSum = 0;
    var paidCount = 0;
    var openCount = 0;
    rows.forEach(function (f) {
      totalSum += f.bedragNum || 0;
      var stLow = String(f.st || "").toLowerCase();
      if (stLow.indexOf("betaald") >= 0) paidCount++;
      else openCount++;
    });
    var cnt = document.getElementById("cd-bet-sum-count");
    var tot = document.getElementById("cd-bet-sum-total");
    var pai = document.getElementById("cd-bet-sum-paid");
    var opn = document.getElementById("cd-bet-sum-open");
    if (cnt) cnt.textContent = String(rows.length);
    if (tot) tot.textContent = formatBedragNL(totalSum);
    if (pai) pai.textContent = String(paidCount);
    if (opn) opn.textContent = String(openCount);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function statusBadge(st) {
    var s = String(st || "").trim();
    var low = s.toLowerCase();
    var cls = "cd-besc-stat";
    if (low.indexOf("betaald") >= 0) cls += " cd-besc-stat--betaald";
    else if (low.indexOf("declar") >= 0 || low.indexOf("ingediend") >= 0) cls += " cd-besc-stat--gedeclareerd";
    else if (low.indexOf("concept") >= 0 || low.indexOf("open") >= 0) cls += " cd-besc-stat--concept";
    return '<span class="' + cls + '">' + escapeHtml(s || "—") + '</span>';
  }

  function formatBedragNL(n) {
    var v = Number(n) || 0;
    return "€ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // Live-refresh wanneer facturen-data verandert
  window.addEventListener("besa:facturen-updated", function () {
    // Alleen renderen als de Betalingen-tab actief is (vermijd onnodig werk)
    var panP = document.getElementById("cd-pan-p");
    if (panP && !panP.hidden) renderBetalingen();
  });

  // ============================================================
  // CONTACTEN-tab: render + CRUD via clientContactenDB
  // ============================================================

  function renderContacten() {
    var tbody = document.getElementById("cd-cont-tbody");
    var empty = document.getElementById("cd-cont-empty");
    if (!tbody || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var rows = (window.clientContactenDB && typeof window.clientContactenDB.getForClientSync === "function")
      ? window.clientContactenDB.getForClientSync(cl.id).filter(function (r) { return r && !r.archived; })
      : [];

    // Sort: primair first, dan naam asc
    rows.sort(function (a, b) {
      if (!!a.isPrimair !== !!b.isPrimair) return a.isPrimair ? -1 : 1;
      return String(a.naam || "").localeCompare(String(b.naam || ""), "nl");
    });

    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", r.id);
      var tel = r.telefoon
        ? '<a href="tel:' + escapeAttr(r.telefoon) + '">' + escapeHtml(r.telefoon) + '</a>'
        : "—";
      var em = r.email
        ? '<a href="mailto:' + escapeAttr(r.email) + '">' + escapeHtml(r.email) + '</a>'
        : "—";
      var primairBadge = r.isPrimair
        ? '<span class="cd-cont-primair-badge" title="Primair contact">Primair</span>'
        : "";
      tr.innerHTML =
        '<td data-col="naam">' + escapeHtml(r.naam || "—") + '</td>' +
        '<td data-col="relatie">' + escapeHtml(r.relatie || "—") + '</td>' +
        '<td data-col="telefoon">' + tel + '</td>' +
        '<td data-col="email">' + em + '</td>' +
        '<td data-col="primair" class="cd-cont-primair-cell">' + primairBadge + '</td>' +
        '<td data-col="acties" class="cd-cont-actions-cell">' +
          '<button type="button" class="btn-outline cd-cont-edit-btn" data-id="' + r.id + '" aria-label="Bewerken">Bewerken</button>' +
          '<button type="button" class="employee-delete-btn cd-cont-archive-btn" data-id="' + r.id + '" aria-label="Archiveren">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
            '</svg>' +
          '</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    empty.hidden = rows.length > 0;
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Modal controls
  var contModal = document.getElementById("cd-cont-modal");
  var contForm = document.getElementById("cd-cont-form");
  var contTitle = document.getElementById("cd-cont-modal-title");
  var contFId = document.getElementById("cd-cont-f-id");
  var contFNaam = document.getElementById("cd-cont-f-naam");
  var contFRelatie = document.getElementById("cd-cont-f-relatie");
  var contFTel = document.getElementById("cd-cont-f-tel");
  var contFEmail = document.getElementById("cd-cont-f-email");
  var contFNotitie = document.getElementById("cd-cont-f-notitie");
  var contFPrimair = document.getElementById("cd-cont-f-primair");

  function openContactModal(rec) {
    if (!contModal) return;
    if (rec && rec.id) {
      if (contTitle) contTitle.textContent = "Contact bewerken";
      contFId.value = rec.id;
      contFNaam.value = rec.naam || "";
      contFRelatie.value = rec.relatie || "";
      contFTel.value = rec.telefoon || "";
      contFEmail.value = rec.email || "";
      contFNotitie.value = rec.notitie || "";
      contFPrimair.checked = !!rec.isPrimair;
    } else {
      if (contTitle) contTitle.textContent = "Contact toevoegen";
      contForm.reset();
      contFId.value = "";
    }
    contModal.hidden = false;
    contModal.setAttribute("aria-hidden", "false");
    try { contFNaam.focus(); } catch (e) { /* */ }
  }
  function closeContactModal() {
    if (!contModal) return;
    contModal.hidden = true;
    contModal.setAttribute("aria-hidden", "true");
  }

  async function saveContactFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var naam = (contFNaam.value || "").trim();
    if (!naam) {
      try { contFNaam.focus(); } catch (e) { /* */ }
      return;
    }
    var rec = {
      clientId: cl.id,
      naam: naam,
      relatie: (contFRelatie.value || "").trim(),
      telefoon: (contFTel.value || "").trim(),
      email: (contFEmail.value || "").trim(),
      notitie: (contFNotitie.value || "").trim(),
      isPrimair: !!contFPrimair.checked,
    };
    try {
      var id = contFId.value;
      if (id) {
        await window.clientContactenDB.update(id, rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Contact");
      } else {
        await window.clientContactenDB.add(rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Contact toegevoegd");
      }
      closeContactModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    }
  }

  // Event wiring
  document.getElementById("cd-cont-add-btn")?.addEventListener("click", function () {
    openContactModal(null);
  });
  document.getElementById("cd-cont-modal-close")?.addEventListener("click", closeContactModal);
  document.getElementById("cd-cont-cancel-btn")?.addEventListener("click", closeContactModal);
  document.getElementById("cd-cont-save-btn")?.addEventListener("click", function (e) {
    e.preventDefault();
    saveContactFromForm();
  });
  if (contForm) {
    contForm.addEventListener("submit", function (e) {
      e.preventDefault();
      saveContactFromForm();
    });
  }
  if (contModal) {
    contModal.addEventListener("click", function (e) {
      if (e.target === contModal) closeContactModal();
    });
  }

  // Row-actions (edit / archive) via event delegation op tbody
  document.getElementById("cd-cont-tbody")?.addEventListener("click", async function (e) {
    var editBtn = e.target.closest(".cd-cont-edit-btn");
    var arcBtn = e.target.closest(".cd-cont-archive-btn");
    if (editBtn) {
      var id = editBtn.getAttribute("data-id");
      var rec = window.clientContactenDB && window.clientContactenDB.getByIdSync(id);
      if (rec) openContactModal(rec);
      return;
    }
    if (arcBtn) {
      var aid = arcBtn.getAttribute("data-id");
      var rec2 = window.clientContactenDB && window.clientContactenDB.getByIdSync(aid);
      if (!rec2) return;
      try {
        var ok = await window.showArchiveConfirm({ preview: rec2.naam || "Contact" });
        if (!ok) return;
        await window.clientContactenDB.archive(aid);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Contact");
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });

  // Live-refresh wanneer contacten-data verandert
  window.addEventListener("besa:client-contacten-updated", function () {
    var panC = document.getElementById("cd-pan-c");
    if (panC && !panC.hidden) renderContacten();
  });

  // ============================================================
  // RAPPORTAGES-tab: render + CRUD via clientRapportagesDB
  // ============================================================

  var rapFilterEl = document.getElementById("cd-rap-filter-status");
  var rapStatusFilter = "";

  function statusBadgeRap(status) {
    var s = String(status || "concept").toLowerCase();
    var cls = "cd-rap-status";
    var label = "Concept";
    if (s === "lopend") { cls += " cd-rap-status--lopend"; label = "Lopend"; }
    else if (s === "afgerond") { cls += " cd-rap-status--afgerond"; label = "Afgerond"; }
    else { cls += " cd-rap-status--concept"; }
    return '<span class="' + cls + '">' + escapeHtml(label) + '</span>';
  }

  function formatDateNL(iso) {
    if (!iso) return "—";
    var d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    if (isNaN(d.getTime())) return iso;
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yy = d.getFullYear();
    return dd + "/" + mm + "/" + yy;
  }

  function renderRapportages() {
    var tbody = document.getElementById("cd-rap-tbody");
    var empty = document.getElementById("cd-rap-empty");
    if (!tbody || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var rows = (window.clientRapportagesDB && typeof window.clientRapportagesDB.getForClientSync === "function")
      ? window.clientRapportagesDB.getForClientSync(cl.id).filter(function (r) { return r && !r.archived; })
      : [];

    if (rapStatusFilter) {
      rows = rows.filter(function (r) { return String(r.status || "").toLowerCase() === rapStatusFilter; });
    }

    rows.sort(function (a, b) {
      var da = a.rapportDatum || a.aanmaakdatum || "";
      var db = b.rapportDatum || b.aanmaakdatum || "";
      return da < db ? 1 : da > db ? -1 : 0;
    });

    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", r.id);
      var bijlage = r.fileUrl
        ? '<a href="' + escapeAttr(r.fileUrl) + '" target="_blank" rel="noopener" class="cd-rap-bijlage-link" title="Open bijlage">📎</a>'
        : "—";
      tr.innerHTML =
        '<td data-col="datum">' + escapeHtml(formatDateNL(r.rapportDatum)) + '</td>' +
        '<td data-col="titel">' + escapeHtml(r.titel || "—") + '</td>' +
        '<td data-col="type">' + escapeHtml(r.type || "—") + '</td>' +
        '<td data-col="status">' + statusBadgeRap(r.status) + '</td>' +
        '<td data-col="bijlage" class="cd-rap-bijlage-cell">' + bijlage + '</td>' +
        '<td data-col="acties" class="cd-rap-actions-cell">' +
          '<button type="button" class="btn-outline cd-rap-edit-btn" data-id="' + r.id + '">Bewerken</button>' +
          '<button type="button" class="employee-delete-btn cd-rap-archive-btn" data-id="' + r.id + '" aria-label="Archiveren">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
            '</svg>' +
          '</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    empty.hidden = rows.length > 0;
  }

  // Modal controls
  var rapModal = document.getElementById("cd-rap-modal");
  var rapForm = document.getElementById("cd-rap-form");
  var rapTitle = document.getElementById("cd-rap-modal-title");
  var rapFId = document.getElementById("cd-rap-f-id");
  var rapFTitel = document.getElementById("cd-rap-f-titel");
  var rapFDatum = document.getElementById("cd-rap-f-datum");
  var rapFType = document.getElementById("cd-rap-f-type");
  var rapFStatus = document.getElementById("cd-rap-f-status");
  var rapFInhoud = document.getElementById("cd-rap-f-inhoud");
  var rapFFile = document.getElementById("cd-rap-f-file");
  var rapFFileInfo = document.getElementById("cd-rap-f-file-info");
  var rapPendingFile = null; // dataURL of pending File

  function openRapModal(rec) {
    if (!rapModal) return;
    rapPendingFile = null;
    if (rapFFile) rapFFile.value = "";
    if (rapFFileInfo) { rapFFileInfo.hidden = true; rapFFileInfo.textContent = ""; }

    if (rec && rec.id) {
      if (rapTitle) rapTitle.textContent = "Rapportage bewerken";
      rapFId.value = rec.id;
      rapFTitel.value = rec.titel || "";
      rapFDatum.value = rec.rapportDatum || "";
      rapFType.value = rec.type || "";
      rapFStatus.value = rec.status || "concept";
      rapFInhoud.value = rec.inhoud || "";
      if (rec.fileUrl && rapFFileInfo) {
        rapFFileInfo.hidden = false;
        rapFFileInfo.innerHTML = 'Huidige bijlage: <a href="' + escapeAttr(rec.fileUrl) + '" target="_blank" rel="noopener">openen</a> (upload nieuwe om te vervangen)';
      }
    } else {
      if (rapTitle) rapTitle.textContent = "Rapportage toevoegen";
      rapForm.reset();
      rapFId.value = "";
      rapFStatus.value = "concept";
    }
    rapModal.hidden = false;
    rapModal.setAttribute("aria-hidden", "false");
    try { rapFTitel.focus(); } catch (e) { /* */ }
  }
  function closeRapModal() {
    if (!rapModal) return;
    rapModal.hidden = true;
    rapModal.setAttribute("aria-hidden", "true");
    rapPendingFile = null;
  }

  async function readFileAsDataURL(file) {
    return await new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function saveRapportageFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var titel = (rapFTitel.value || "").trim();
    if (!titel) { try { rapFTitel.focus(); } catch (e) {} return; }

    var rec = {
      clientId: cl.id,
      titel: titel,
      inhoud: (rapFInhoud.value || "").trim(),
      status: rapFStatus.value || "concept",
      type: rapFType.value || "",
      rapportDatum: rapFDatum.value || null,
    };

    if (rapFFile && rapFFile.files && rapFFile.files[0]) {
      try {
        rec.fileData = await readFileAsDataURL(rapFFile.files[0]);
        rec.fileName = rapFFile.files[0].name;
      } catch (err) {
        if (window.showError) window.showError("Bestand inlezen mislukt: " + (err && err.message || err));
        return;
      }
    }

    try {
      var id = rapFId.value;
      if (id) {
        await window.clientRapportagesDB.update(id, rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Rapportage");
      } else {
        await window.clientRapportagesDB.add(rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Rapportage toegevoegd");
      }
      closeRapModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    }
  }

  // Event wiring
  if (rapFilterEl) {
    rapFilterEl.addEventListener("change", function () {
      rapStatusFilter = rapFilterEl.value || "";
      renderRapportages();
    });
  }
  document.getElementById("cd-rap-add-btn")?.addEventListener("click", function () { openRapModal(null); });
  document.getElementById("cd-rap-modal-close")?.addEventListener("click", closeRapModal);
  document.getElementById("cd-rap-cancel-btn")?.addEventListener("click", closeRapModal);
  document.getElementById("cd-rap-save-btn")?.addEventListener("click", function (e) {
    e.preventDefault();
    saveRapportageFromForm();
  });
  if (rapForm) {
    rapForm.addEventListener("submit", function (e) {
      e.preventDefault();
      saveRapportageFromForm();
    });
  }
  if (rapModal) {
    rapModal.addEventListener("click", function (e) {
      if (e.target === rapModal) closeRapModal();
    });
  }

  // Row-actions: edit + archive
  document.getElementById("cd-rap-tbody")?.addEventListener("click", async function (e) {
    var editBtn = e.target.closest(".cd-rap-edit-btn");
    var arcBtn = e.target.closest(".cd-rap-archive-btn");
    if (editBtn) {
      var rec = window.clientRapportagesDB && window.clientRapportagesDB.getByIdSync(editBtn.getAttribute("data-id"));
      if (rec) openRapModal(rec);
      return;
    }
    if (arcBtn) {
      var aid = arcBtn.getAttribute("data-id");
      var rec2 = window.clientRapportagesDB && window.clientRapportagesDB.getByIdSync(aid);
      if (!rec2) return;
      try {
        var ok = await window.showArchiveConfirm({ preview: rec2.titel || "Rapportage" });
        if (!ok) return;
        await window.clientRapportagesDB.archive(aid);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Rapportage");
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });

  // Live-refresh
  window.addEventListener("besa:client-rapportages-updated", function () {
    var panR = document.getElementById("cd-pan-r");
    if (panR && !panR.hidden) renderRapportages();
  });

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

    function closeCdbColPanel() {
      if (!cdbColPanel) return;
      cdbColPanel.setAttribute("hidden", "");
      if (cdbColBtn) cdbColBtn.setAttribute("aria-expanded", "false");
    }
    if (cdbColBtn && cdbColPanel) {
      cdbColBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (cdbColPanel.hasAttribute("hidden")) {
          cdbColPanel.removeAttribute("hidden");
          cdbColBtn.setAttribute("aria-expanded", "true");
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

  initClientDocumentenSection();

  function initClientDocumentenSection() {
    var tbody = document.getElementById("cd-doc-tbody");
    if (!tbody) return;
    if (!window.clientDocsDB) {
      console.warn("client-documenten: clientDocsDB niet beschikbaar — laden de UI niet.");
      return;
    }

    var pillsContainer = document.getElementById("cd-doc-pills");
    var emptyEl = document.getElementById("cd-doc-empty");
    var searchInput = document.getElementById("cd-doc-search");
    var archivedToggle = document.getElementById("cd-doc-archived-toggle");
    var resetBtn = document.getElementById("cd-doc-reset-btn");
    var selectAllCb = document.getElementById("cd-doc-select-all");
    var colBtn = document.getElementById("cd-doc-col-btn");
    var colDropdown = document.getElementById("cd-doc-col-dropdown");
    var uploadBtn = document.getElementById("cd-doc-upload-btn");
    var pageInfoEl = document.getElementById("cd-doc-page-info");
    var pageLabelEl = document.getElementById("cd-doc-page-label");
    var pageSizeSelect = document.getElementById("cd-doc-page-size");

    var modal = document.getElementById("cd-doc-modal");
    var modalClose = document.getElementById("cd-doc-modal-close");
    var modalCancel = document.getElementById("cd-doc-modal-cancel");
    var modalSave = document.getElementById("cd-doc-modal-save");
    var modalTitle = document.getElementById("cd-doc-modal-title");
    var modalNaam = document.getElementById("cd-doc-modal-naam");
    var modalType = document.getElementById("cd-doc-modal-type");
    var modalVerval = document.getElementById("cd-doc-modal-verval");
    var modalFile = document.getElementById("cd-doc-modal-file");

    var sortKey = "";
    var sortDir = "asc";
    var currentPage = 0;
    var activePillType = null;
    var editingDocId = null;

    function getDocs() {
      return window.clientDocsDB.listSync(c.id);
    }

    function reportError(err, fallback) {
      console.error("[client-documenten]", err);
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("error", fallback || "Documenten",
          (err && err.message) ? String(err.message) : "Er ging iets mis bij opslaan in de database.");
      }
    }

    function getPageSize() {
      return parseInt((pageSizeSelect && pageSizeSelect.value) || "50", 10);
    }

    function getVisibleCols() {
      var cols = {};
      if (!colDropdown) return cols;
      colDropdown.querySelectorAll("input[data-cddoccol]").forEach(function (cb) {
        cols[cb.dataset.cddoccol] = cb.checked;
      });
      return cols;
    }

    function applyColumnVisibility() {
      var cols = getVisibleCols();
      var pan = document.getElementById("cd-pan-j");
      if (!pan) return;
      pan.querySelectorAll("[data-cddoccol]").forEach(function (el) {
        if (el.closest && el.closest("#cd-doc-col-dropdown")) return;
        var col = el.getAttribute("data-cddoccol");
        if (col && col in cols) el.style.display = cols[col] ? "" : "none";
      });
    }

    function formatDateTime(iso) {
      if (!iso) return "-";
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      var dd = String(d.getDate()).padStart(2, "0");
      var mm = String(d.getMonth() + 1).padStart(2, "0");
      var yyyy = d.getFullYear();
      var hh = String(d.getHours()).padStart(2, "0");
      var min = String(d.getMinutes()).padStart(2, "0");
      return dd + "-" + mm + "-" + yyyy + " " + hh + ":" + min;
    }

    function formatDate(iso) {
      if (!iso) return "-";
      var parts = String(iso).split("T")[0].split("-");
      if (parts.length !== 3) return String(iso);
      return parts[2] + "-" + parts[1] + "-" + parts[0];
    }

    function buildPills() {
      if (!pillsContainer) return;
      var docs = getDocs();
      var counts = {};
      docs.forEach(function (d) {
        if (d.archived) return;
        var t = d.type || "Overig";
        counts[t] = (counts[t] || 0) + 1;
      });
      pillsContainer.innerHTML = "";
      Object.keys(counts).sort().forEach(function (type) {
        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = "emp-doc-pill emp-doc-pill--" + type;
        if (activePillType === type) pill.classList.add("is-active");
        pill.textContent = type + " (" + counts[type] + ")";
        pill.addEventListener("click", function () {
          activePillType = activePillType === type ? null : type;
          currentPage = 0;
          render();
        });
        pillsContainer.appendChild(pill);
      });
    }

    function getFilteredItems() {
      var docs = getDocs();
      var showArchived = archivedToggle ? archivedToggle.checked : false;
      var items = docs.filter(function (d) {
        if (!showArchived && d.archived) return false;
        if (showArchived && !d.archived) return false;
        return true;
      });
      if (activePillType) {
        items = items.filter(function (d) { return (d.type || "Overig") === activePillType; });
      }
      var q = ((searchInput && searchInput.value) || "").trim().toLowerCase();
      if (q) {
        items = items.filter(function (d) {
          return [d.naam, d.type, d.vervaldatum, d.uploaddatum, d.laatstGewijzigd]
            .map(function (v) { return v == null ? "" : String(v); })
            .join(" ").toLowerCase().indexOf(q) !== -1;
        });
      }
      if (sortKey) {
        items.sort(function (a, b) {
          var va = String(a[sortKey] || "").toLowerCase();
          var vb = String(b[sortKey] || "").toLowerCase();
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }
      return items;
    }

    function openDocFile(doc) {
      if (!doc || !doc.fileData) {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("info", "Geen bestand", "Er is geen bestand beschikbaar voor dit document.");
        } else if (typeof window.showSaveModal === "function") {
          window.showSaveModal("Er is geen bestand beschikbaar voor dit document.", "Geen bestand");
        }
        return;
      }
      var w = window.open("");
      if (!w) return;
      var name = doc.fileName || doc.naam || "document";
      if (doc.fileMime && String(doc.fileMime).indexOf("image/") === 0) {
        w.document.write('<html><head><title>' + name + '</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5"><img src="' + doc.fileData + '" style="max-width:100%;max-height:100vh" /></body></html>');
      } else if (doc.fileMime === "application/pdf") {
        w.document.write('<html><head><title>' + name + '</title></head><body style="margin:0"><iframe src="' + doc.fileData + '" style="width:100%;height:100vh;border:none"></iframe></body></html>');
      } else {
        var a = w.document.createElement("a");
        a.href = doc.fileData;
        a.download = name;
        a.click();
        w.close();
      }
    }

    function render() {
      buildPills();
      var items = getFilteredItems();
      var total = items.length;
      var pageSize = getPageSize();
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (currentPage >= totalPages) currentPage = totalPages - 1;
      if (currentPage < 0) currentPage = 0;
      var start = currentPage * pageSize;
      var pageItems = items.slice(start, start + pageSize);

      tbody.innerHTML = "";
      if (selectAllCb) selectAllCb.checked = false;

      if (!pageItems.length) {
        if (emptyEl) emptyEl.style.display = "";
      } else {
        if (emptyEl) emptyEl.style.display = "none";
        pageItems.forEach(function (doc, idx) {
          var tr = document.createElement("tr");

          var tdCheck = document.createElement("td");
          tdCheck.className = "emp-doc-row-check";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.cdDocIdx = String(start + idx);
          tdCheck.appendChild(cb);
          tr.appendChild(tdCheck);

          var tdAct = document.createElement("td");
          tdAct.className = "emp-doc-col-acties";
          var actWrap = document.createElement("div");
          actWrap.className = "emp-doc-actions-cell";

          var viewBtn = document.createElement("button");
          viewBtn.type = "button";
          viewBtn.className = "emp-doc-action-btn";
          viewBtn.title = "Bekijken";
          viewBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
          viewBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            openDocFile(doc);
          });

          var editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "emp-doc-action-btn";
          editBtn.title = "Bewerken";
          editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
          editBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            openEditModal(doc.id);
          });

          actWrap.appendChild(viewBtn);
          actWrap.appendChild(editBtn);
          if (!doc.archived) {
            var archiveBtn = document.createElement("button");
            archiveBtn.type = "button";
            archiveBtn.className = "emp-doc-action-btn";
            archiveBtn.title = "Archiveren";
            archiveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
            archiveBtn.addEventListener("click", function (e) {
              e.stopPropagation();
              var ask = (typeof window.showArchiveConfirm === "function")
                ? window.showArchiveConfirm({ preview: doc.naam || "" })
                : Promise.resolve(true);
              ask.then(function (ok) {
                if (!ok) return;
                window.clientDocsDB.archive(doc.id).then(function () {
                  if (typeof window.showActionFeedback === "function") {
                    window.showActionFeedback("archived", "Document");
                  }
                }).catch(function (err) { reportError(err, "Archiveren"); });
              });
            });
            actWrap.appendChild(archiveBtn);
          }
          tdAct.appendChild(actWrap);
          tr.appendChild(tdAct);

          var colDefs = [
            { key: "naam", format: function (v) { return v || ""; } },
            { key: "type", format: function (v) { return v || ""; } },
            { key: "vervaldatum", format: function (v) { return formatDate(v); } },
            { key: "uploaddatum", format: function (v) { return formatDateTime(v); } },
            { key: "laatstGewijzigd", format: function (v) { return formatDateTime(v); } },
          ];

          colDefs.forEach(function (col) {
            var td = document.createElement("td");
            td.setAttribute("data-cddoccol", col.key);
            td.textContent = col.format(doc[col.key]);
            if (col.key === "naam" && doc.fileData) {
              td.classList.add("cd-doc-name-clickable");
              td.style.cursor = "pointer";
              td.addEventListener("click", function () { openDocFile(doc); });
            }
            tr.appendChild(td);
          });

          var tdDel = document.createElement("td");
          tdDel.className = "emp-doc-col-delete";
          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "employee-delete-btn";
          delBtn.title = doc.archived ? "Definitief verwijderen" : "Verwijderen";
          delBtn.setAttribute("aria-label", doc.archived ? "Definitief verwijderen" : "Verwijderen");
          delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
          delBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            openDocDeleteModal(doc);
          });
          if (doc.archived) {
            var delWrap = document.createElement("div");
            delWrap.className = "hr-row-actions";
            var restoreBtn = document.createElement("button");
            restoreBtn.type = "button";
            restoreBtn.className = "btn-outline hr-restore-btn cd-doc-restore-btn";
            restoreBtn.textContent = "Herstel";
            restoreBtn.setAttribute("data-cd-doc-id", doc.id);
            restoreBtn.addEventListener("click", function (e) {
              e.stopPropagation();
              window.clientDocsDB.restore(doc.id).then(function () {
                if (typeof window.showActionFeedback === "function") {
                  window.showActionFeedback("restored", "Document");
                }
              }).catch(function (err) { reportError(err, "Herstellen"); });
            });
            delWrap.appendChild(restoreBtn);
            delWrap.appendChild(delBtn);
            tdDel.appendChild(delWrap);
          } else {
            tdDel.appendChild(delBtn);
          }
          tr.appendChild(tdDel);

          tbody.appendChild(tr);
        });
      }

      if (pageInfoEl) pageInfoEl.textContent = pageSize + " of " + total + " total.";
      if (pageLabelEl) pageLabelEl.textContent = "Page " + (currentPage + 1) + " of " + totalPages;

      applyColumnVisibility();
    }

    document.querySelectorAll('#cd-doc-table th[data-cdsort]').forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-cdsort");
        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = "asc";
        }
        render();
      });
    });

    if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });
    if (archivedToggle) archivedToggle.addEventListener("change", function () { currentPage = 0; render(); });

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (searchInput) searchInput.value = "";
        if (archivedToggle) archivedToggle.checked = false;
        activePillType = null;
        sortKey = "";
        sortDir = "asc";
        currentPage = 0;
        if (colDropdown) {
          colDropdown.querySelectorAll("input[data-cddoccol]").forEach(function (cb) { cb.checked = true; });
        }
        render();
      });
    }

    if (selectAllCb) {
      selectAllCb.addEventListener("change", function () {
        tbody.querySelectorAll("input[type='checkbox']").forEach(function (cb) {
          cb.checked = selectAllCb.checked;
        });
      });
    }

    if (pageSizeSelect) pageSizeSelect.addEventListener("change", function () { currentPage = 0; render(); });

    document.querySelectorAll('.emp-doc-page-nav button[data-cddocpage]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var items = getFilteredItems();
        var totalPages = Math.max(1, Math.ceil(items.length / getPageSize()));
        var action = btn.getAttribute("data-cddocpage");
        if (action === "first") currentPage = 0;
        else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
        else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
        else if (action === "last") currentPage = totalPages - 1;
        render();
      });
    });

    if (colBtn) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!colDropdown) return;
        var open = colDropdown.style.display !== "none";
        colDropdown.style.display = open ? "none" : "";
      });
    }
    if (colDropdown) {
      colDropdown.addEventListener("click", function (e) { e.stopPropagation(); });
      colDropdown.querySelectorAll("input[data-cddoccol]").forEach(function (cb) {
        cb.addEventListener("change", function () { applyColumnVisibility(); });
      });
    }
    document.addEventListener("click", function () {
      if (colDropdown) colDropdown.style.display = "none";
    });

    var dropzone = document.getElementById("cd-doc-dropzone");
    var dropzoneFilename = document.getElementById("cd-doc-dropzone-filename");

    function clearDropzone() {
      if (modalFile) modalFile.value = "";
      if (dropzoneFilename) dropzoneFilename.textContent = "";
      if (dropzone) dropzone.classList.remove("is-dragover");
    }

    function showSelectedFile(file) {
      if (file && dropzoneFilename) dropzoneFilename.textContent = file.name;
    }

    if (dropzone && modalFile) {
      dropzone.addEventListener("click", function () { modalFile.click(); });
      modalFile.addEventListener("change", function () {
        if (modalFile.files && modalFile.files[0]) showSelectedFile(modalFile.files[0]);
      });
      dropzone.addEventListener("dragover", function (e) {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", function () {
        dropzone.classList.remove("is-dragover");
      });
      dropzone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          modalFile.files = e.dataTransfer.files;
          showSelectedFile(e.dataTransfer.files[0]);
        }
      });
    }

    function closeModal() {
      if (modal) modal.style.display = "none";
      editingDocId = null;
      clearDropzone();
    }

    if (uploadBtn) {
      uploadBtn.addEventListener("click", function () {
        editingDocId = null;
        if (modalTitle) modalTitle.textContent = "Document uploaden";
        if (modalNaam) modalNaam.value = "";
        if (modalType) modalType.value = "";
        if (modalVerval) modalVerval.value = "";
        clearDropzone();
        if (dropzone) dropzone.style.display = "";
        if (modalSave) modalSave.textContent = "Toevoegen";
        if (modal) modal.style.display = "";
      });
    }

    function openEditModal(docId) {
      var doc = getDocs().find(function (d) { return d && d.id === docId; });
      if (!doc) return;
      editingDocId = docId;
      if (modalTitle) modalTitle.textContent = "Document bewerken";
      if (modalNaam) modalNaam.value = doc.naam || "";
      if (modalType) modalType.value = doc.type || "";
      if (modalVerval) modalVerval.value = doc.vervaldatum ? String(doc.vervaldatum).split("T")[0] : "";
      clearDropzone();
      if (dropzone) dropzone.style.display = "none";
      if (modalSave) modalSave.textContent = "Opslaan";
      if (modal) modal.style.display = "";
    }

    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modalCancel) modalCancel.addEventListener("click", closeModal);
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

    function setSavingState(busy) {
      if (!modalSave) return;
      modalSave.disabled = !!busy;
      modalSave.dataset.busy = busy ? "1" : "";
    }

    function commitDocSave(fileData, fileName, fileMime) {
      var naam = ((modalNaam && modalNaam.value) || "").trim();
      var type = (modalType && modalType.value) || "";
      var verval = (modalVerval && modalVerval.value) || "";
      if (!naam) {
        if (modalNaam) modalNaam.focus();
        return;
      }
      var isEdit = editingDocId != null;
      setSavingState(true);

      var p;
      if (isEdit) {
        var partial = { naam: naam, type: type, vervaldatum: verval };
        if (fileData) {
          partial.fileData = fileData;
          partial.fileName = fileName;
          partial.fileMime = fileMime;
        }
        p = window.clientDocsDB.update(editingDocId, partial);
      } else {
        p = window.clientDocsDB.add({
          clientId: c.id,
          naam: naam,
          type: type,
          vervaldatum: verval,
          archived: false,
          fileData: fileData || "",
          fileName: fileName || "",
          fileMime: fileMime || "",
        });
      }

      p.then(function () {
        closeModal();
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback(isEdit ? "saved" : "added", "Document");
        }
      }).catch(function (err) {
        reportError(err, isEdit ? "Bewerken" : "Uploaden");
      }).then(function () {
        setSavingState(false);
      });
    }

    if (modalSave) {
      modalSave.addEventListener("click", function () {
        var file = modalFile && modalFile.files && modalFile.files[0];
        if (file) {
          var reader = new FileReader();
          reader.onload = function () {
            commitDocSave(reader.result, file.name, file.type);
          };
          reader.onerror = function () {
            if (typeof window.showActionFeedback === "function") {
              window.showActionFeedback("error", "Bestand inlezen", "Het bestand kon niet worden ingelezen.");
            }
          };
          reader.readAsDataURL(file);
        } else {
          commitDocSave("", "", "");
        }
      });
    }

    var delModal = document.getElementById("cd-doc-delete-modal");
    var delSlider = document.getElementById("cd-doc-delete-slider");
    var delConfirmBtn = document.getElementById("cd-doc-delete-confirm");
    var delCancelBtn = document.getElementById("cd-doc-delete-cancel");
    var delCloseBtn = document.getElementById("cd-doc-delete-close");
    var delPreview = document.getElementById("cd-doc-delete-preview");
    var docToDelete = null;

    function syncDelSlider() {
      if (!delSlider) return;
      var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
      delSlider.value = String(v);
      delSlider.style.setProperty("--employee-slider-pct", v + "%");
      delSlider.setAttribute("aria-valuenow", String(v));
      if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
    }

    function resetDelSlider() {
      if (delSlider) {
        delSlider.value = "0";
        syncDelSlider();
      }
    }

    function openDocDeleteModal(doc) {
      docToDelete = doc;
      if (delPreview) delPreview.textContent = doc.naam || "";
      resetDelSlider();
      if (delModal) {
        delModal.removeAttribute("hidden");
        delModal.setAttribute("aria-hidden", "false");
      }
    }

    function closeDocDeleteModal() {
      if (delModal) {
        delModal.setAttribute("hidden", "");
        delModal.setAttribute("aria-hidden", "true");
      }
      docToDelete = null;
      resetDelSlider();
      if (delPreview) delPreview.textContent = "";
    }

    function confirmDocDelete() {
      if (!docToDelete || (delConfirmBtn && delConfirmBtn.disabled)) return;
      var idToDelete = docToDelete.id;
      closeDocDeleteModal();
      window.clientDocsDB.remove(idToDelete).then(function () {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("deleted", "Document");
        }
      }).catch(function (err) {
        reportError(err, "Verwijderen");
      });
    }

    if (delSlider) delSlider.addEventListener("input", syncDelSlider);
    if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmDocDelete);
    if (delCancelBtn) delCancelBtn.addEventListener("click", closeDocDeleteModal);
    if (delCloseBtn) delCloseBtn.addEventListener("click", closeDocDeleteModal);
    if (delModal) delModal.addEventListener("click", function (e) { if (e.target === delModal) closeDocDeleteModal(); });

    var downloadAllBtn = document.getElementById("cd-doc-download-all-btn");
    if (downloadAllBtn) {
      downloadAllBtn.addEventListener("click", function () {
        var docs = getDocs().filter(function (d) { return d.fileData && !d.archived; });
        if (!docs.length) {
          if (typeof window.showSaveModal === "function") {
            window.showSaveModal("Er zijn geen bestanden beschikbaar om te downloaden.", "Geen documenten");
          }
          return;
        }
        showDownloadAllConfirm(docs);
      });
    }

    function performDownloadAll(docs) {
      docs.forEach(function (d) {
        var a = document.createElement("a");
        a.href = d.fileData;
        a.download = d.fileName || d.naam || "document";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
      if (typeof window.showSaveModal === "function") {
        var msg = docs.length === 1
          ? "1 document is gedownload."
          : docs.length + " documenten zijn gedownload.";
        window.showSaveModal(msg, "Gedownload");
      }
    }

    function ensureDownloadConfirmModal() {
      var existing = document.getElementById("cd-doc-download-confirm-modal");
      if (existing) return existing;
      var wrap = document.createElement("div");
      wrap.id = "cd-doc-download-confirm-modal";
      wrap.className = "modal-overlay";
      wrap.setAttribute("hidden", "");
      wrap.setAttribute("aria-hidden", "true");
      wrap.innerHTML =
        '<div class="modal-dialog cl-add-dialog" role="dialog" aria-modal="true" aria-labelledby="cd-doc-download-confirm-title" tabindex="-1">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title" id="cd-doc-download-confirm-title">Alles downloaden</h2>' +
            '<button type="button" class="modal-close" id="cd-doc-download-confirm-close" aria-label="Sluiten"><span aria-hidden="true">&times;</span></button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<p class="app-save-feedback-text" id="cd-doc-download-confirm-msg" role="status"></p>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn-outline" id="cd-doc-download-confirm-cancel">Annuleren</button>' +
            '<button type="button" class="btn-primary" id="cd-doc-download-confirm-ok">Downloaden</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      return wrap;
    }

    function showDownloadAllConfirm(docs) {
      var dlModal = ensureDownloadConfirmModal();
      var msg = document.getElementById("cd-doc-download-confirm-msg");
      var closeBtn = document.getElementById("cd-doc-download-confirm-close");
      var cancelBtn = document.getElementById("cd-doc-download-confirm-cancel");
      var okBtn = document.getElementById("cd-doc-download-confirm-ok");
      if (msg) {
        msg.textContent = docs.length === 1
          ? "Wil je 1 document downloaden?"
          : "Wil je " + docs.length + " documenten downloaden?";
      }

      function close() {
        dlModal.setAttribute("hidden", "");
        dlModal.setAttribute("aria-hidden", "true");
        if (closeBtn) closeBtn.removeEventListener("click", close);
        if (cancelBtn) cancelBtn.removeEventListener("click", close);
        if (okBtn) okBtn.removeEventListener("click", confirm);
        dlModal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
      }
      function confirm() {
        close();
        performDownloadAll(docs);
      }
      function onBackdrop(e) { if (e.target === dlModal) close(); }
      function onKey(e) { if (e.key === "Escape") close(); }

      if (closeBtn) closeBtn.addEventListener("click", close);
      if (cancelBtn) cancelBtn.addEventListener("click", close);
      if (okBtn) okBtn.addEventListener("click", confirm);
      dlModal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);

      dlModal.removeAttribute("hidden");
      dlModal.setAttribute("aria-hidden", "false");
    }

    function refreshFromDb() {
      if (!window.clientDocsDB || !window.clientDocsDB.list) return Promise.resolve();
      return window.clientDocsDB.list(c.id).catch(function (err) {
        console.warn("[client-documenten] kon niet ophalen:", err && err.message);
      });
    }

    window.addEventListener("besa:client-documents-updated", function (ev) {
      var detail = ev && ev.detail;
      if (!detail || String(detail.clientId) === String(c.id)) {
        render();
      }
    });

    render();

    Promise.resolve()
      .then(function () {
        if (window.clientDocsDB && window.clientDocsDB.maybeMigrateFromClient) {
          return window.clientDocsDB.maybeMigrateFromClient(c).then(function (n) {
            if (n > 0 && Array.isArray(c.documenten) && c.documenten.length) {
              c.documenten = [];
              try {
                if (typeof upsertClienten === "function") upsertClienten(c);
              } catch (err) {
                console.warn("[client-documenten] cleanup van legacy c.documenten mislukt:", err);
              }
            }
            return n;
          });
        }
        return 0;
      })
      .then(refreshFromDb)
      .then(render);
  }
})();
