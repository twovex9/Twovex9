/* global getClientenById, getClientenItems, upsertClienten, ensureClientDetailFields, FASEN_CLIËNT, addBeschikkingVanuitFormulier, showSaveModal */
(async function () {
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
  // Cold-load robuust: de cliënten-cache kan nog leeg zijn (de Supabase-bootstrap
  // is async) en bij een volle localStorage-quota persisteert hij niet over een
  // reload. Wacht daarom kort op de bootstrap-update vóór we oordelen dat de
  // cliënt niet bestaat. Zo rendert de pagina IN-PLACE uit de in-memory cache
  // (_mem) — zonder afhankelijk te zijn van window.location.reload() en dus van
  // localStorage-persistentie. Vervangt de oude reload-vangrail die bij een
  // volle quota faalde en de melding "Cliënt niet gevonden" liet hangen.
  if (qid && !getClientenById(qid)) {
    try { if (typeof getClientenItems === "function") getClientenItems(); } catch (e) { /* triggert bootstrap */ }
    if (!getClientenById(qid)) {
      await new Promise(function (resolve) {
        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          window.removeEventListener("besa:clienten-updated", onClientenUpdated);
          resolve();
        }
        function onClientenUpdated() { if (getClientenById(qid)) finish(); }
        window.addEventListener("besa:clienten-updated", onClientenUpdated);
        window.setTimeout(finish, 6000);
      });
    }
  }
  var c0 = getClientenById(qid);
  if (typeof ensureClientDetailFields === "function" && c0) ensureClientDetailFields(c0);

  if (!qid || !c0) {
    // Na de wachttijd hierboven is de cliënt nog steeds onbekend: hij bestaat
    // echt niet (of de data kon niet laden). Toon de herstelbare melding.
    if (missing) missing.removeAttribute("hidden");
    if (h1) h1.textContent = "Cliëntdossier";
    return;
  }
  // Succesvol geladen → reset de cold-reload-vlag zodat een latere koude load
  // van dezelfde cliënt opnieuw één reload mag doen.
  try { window.sessionStorage.removeItem("cd_cold_reload_" + qid); } catch (e) { /* */ }

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
  var haSel = document.getElementById("cd-f-ha");
  fillSelectWithStrings(locSel, locs, (c.locatie == null ? "" : String(c.locatie)).trim(), "(Leeg — later invullen)");
  fillSelectWithStrings(orgSel, orgs, (c.organisatie == null ? "" : String(c.organisatie)).trim(), "Selecteer Organisatie");
  // Hoofdaannemer kiest uit dezelfde verwijzer-/organisatie-lijst (optioneel).
  fillSelectWithStrings(haSel, orgs, (c.hoofdaannemer == null ? "" : String(c.hoofdaannemer)).trim(), "Geen hoofdaannemer");

  var heroName = document.getElementById("cd-hero-name");
  var heroNr = document.getElementById("cd-hero-nr");
  var aIn = document.getElementById("cd-aside-inzorg");
  var aOut = document.getElementById("cd-aside-uitzorg");
  if (heroName) heroName.textContent = (c.voornaam || "—") + (c.achternaam ? " " + String(c.achternaam) : "");
  if (heroNr) heroNr.textContent = c.clientnummer != null ? String(c.clientnummer) : "—";
  if (aIn) aIn.textContent = formatDateNl(c.inZorgDatum);
  if (aOut) aOut.textContent = c.uitZorgDatum ? formatDateNl(c.uitZorgDatum) : "—";

  // Cliëntreis-pill in de vcard (read-only; kolom clienten.reis_status wordt
  // server-side beheerd door de fase-sync-trigger). Re-sync op
  // besa:clienten-updated zodat een koude load met verouderde cache (zonder
  // reisStatus) na de bootstrap-fetch alsnog de juiste status toont.
  var reisPill = document.getElementById("cd-reis-pill");
  function syncReisPill() {
    if (!reisPill) return;
    var cur = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    var slug = cur && cur.reisStatus ? String(cur.reisStatus) : "";
    if (slug && window.besaClientreis && typeof window.besaClientreis.label === "function") {
      reisPill.textContent = window.besaClientreis.label(slug);
      reisPill.className = window.besaClientreis.pillClass(slug);
    } else {
      reisPill.textContent = "—";
      reisPill.className = "cr-pill cr-pill--onbekend";
    }
  }
  syncReisPill();
  window.addEventListener("besa:clienten-updated", syncReisPill);

  // ── Cliëntreis-acties (fase 2): volgende-stap-knoppen in de vcard.
  // Alleen zichtbaar voor beoordelaars (rpc clientreis_context); de echte
  // poort is de allowlist in de SECURITY DEFINER-RPC clientreis_zet_status.
  var reisActies = document.getElementById("cd-reis-acties");
  var craCtxPromise = null;
  // Context 1× per page-load laden; gedeeld met de Intake-tab (renderIntake).
  function ensureReisContext() {
    if (!craCtxPromise) {
      craCtxPromise = (window.clientIntakeDB && typeof window.clientIntakeDB.getContext === "function")
        ? window.clientIntakeDB.getContext()
        : Promise.resolve({ kan_beoordelen: false });
    }
    return craCtxPromise;
  }
  // Knoppenset per huidige reis_status → p_status (allowlist-overgangen).
  var CRA_KNOPPEN = {
    intake_afgerond: [
      { label: "Plaatsing plannen", status: "plaatsing_gepland" },
      { label: "Op wachtlijst", status: "wachtlijst" },
    ],
    wachtlijst: [{ label: "Plaatsing plannen", status: "plaatsing_gepland" }],
    plaatsing_gepland: [
      { label: "Plaatsing starten", status: "actief" },
      { label: "Op wachtlijst", status: "wachtlijst" },
    ],
    actief: [{ label: "Tijdelijk pauzeren", status: "tijdelijk_gepauzeerd" }],
    tijdelijk_gepauzeerd: [{ label: "Hervatten", status: "actief" }],
  };
  // [hidden]-valkuil: classes met expliciete display overschrijven het
  // UA-stylesheet [hidden]{display:none} — zet daarom altijd beide.
  function craSetVisible(el, show) {
    if (!el) return;
    el.style.display = show ? "" : "none";
    el.hidden = !show;
  }
  async function syncReisActies() {
    if (!reisActies) return;
    var ctx = null;
    try { ctx = await ensureReisContext(); } catch (e) { ctx = null; }
    if (!ctx || !ctx.kan_beoordelen) {
      reisActies.innerHTML = "";
      craSetVisible(reisActies, false);
      return;
    }
    var cur = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    var slug = cur && cur.reisStatus ? String(cur.reisStatus) : "";
    var knoppen = CRA_KNOPPEN[slug] || [];
    if (!knoppen.length) {
      reisActies.innerHTML = "";
      craSetVisible(reisActies, false);
      return;
    }
    reisActies.innerHTML = knoppen.map(function (kn) {
      return '<button type="button" class="btn-outline cra-btn" data-cra-status="' + escapeAttr(kn.status) + '" data-cra-label="' + escapeAttr(kn.label) + '">' + escapeHtml(kn.label) + '</button>';
    }).join("");
    craSetVisible(reisActies, true);
  }
  // Inline bevestig-strookje in de vcard (geen modal) met optionele toelichting.
  function craRenderConfirm(status, label) {
    var statusLabel = (window.besaClientreis && typeof window.besaClientreis.label === "function")
      ? window.besaClientreis.label(status)
      : status;
    reisActies.innerHTML =
      '<div class="cra-confirm">' +
        '<p class="cra-confirm-titel">' + escapeHtml(label) + ' — status wordt "' + escapeHtml(statusLabel) + '". Doorgaan?</p>' +
        '<label class="visually-hidden" for="cra-toelichting">Toelichting (optioneel)</label>' +
        '<input class="modal-input cra-toelichting" id="cra-toelichting" type="text" placeholder="Toelichting (optioneel)" autocomplete="off" />' +
        '<div class="cra-confirm-knoppen">' +
          '<button type="button" class="btn-primary cra-btn" data-cra-bevestig="' + escapeAttr(status) + '">Bevestigen</button>' +
          '<button type="button" class="btn-outline cra-btn" data-cra-annuleer="1">Annuleren</button>' +
        '</div>' +
      '</div>';
  }
  if (reisActies) {
    reisActies.addEventListener("click", async function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-cra-status],[data-cra-bevestig],[data-cra-annuleer]") : null;
      if (!btn) return;
      if (btn.hasAttribute("data-cra-annuleer")) { syncReisActies(); return; }
      if (btn.hasAttribute("data-cra-status")) {
        craRenderConfirm(btn.getAttribute("data-cra-status"), btn.getAttribute("data-cra-label") || "");
        return;
      }
      // Bevestigen → RPC (allowlist server-side), daarna pill/knoppen/tijdlijn verversen.
      var status = btn.getAttribute("data-cra-bevestig");
      var toelichtingEl = document.getElementById("cra-toelichting");
      var cur = (typeof getClientenById === "function" && getClientenById(qid)) || c;
      btn.disabled = true;
      try {
        await window.clientIntakeDB.zetStatus(cur.id, status, toelichtingEl ? toelichtingEl.value : "");
        if (window.showActionFeedback) window.showActionFeedback("saved", "Cliëntreis-status");
        if (window.clientenDB && typeof window.clientenDB.refresh === "function") await window.clientenDB.refresh();
        syncReisPill();
        syncReisActies();
        renderAiKaart();
        if (pans.t && !pans.t.hidden) renderTijdlijn();
        if (pans.k && !pans.k.hidden) renderIntake();
      } catch (err) {
        if (window.showError) window.showError("Status wijzigen mislukt: " + (err && err.message || err));
        syncReisActies();
      }
    });
  }
  syncReisActies();
  window.addEventListener("besa:clienten-updated", syncReisActies);

  document.getElementById("cd-f-vn").value = c.voornaam != null ? String(c.voornaam) : "";
  document.getElementById("cd-f-an").value = c.achternaam != null ? String(c.achternaam) : "";
  document.getElementById("cd-f-nr").value = c.clientnummer != null ? String(c.clientnummer) : "";
  // De fase-dropdown heeft lowercase option-values ("in zorg"/"in aanvraag"/
  // "uit zorg"), terwijl de opgeslagen data gemengde casing kan hebben
  // ("Uit zorg"/"In zorg"). Zonder normalisatie matcht de waarde niet, valt de
  // select terug op leeg en zou een save de fase per ongeluk wijzigen. We lezen
  // case-insensitief in (de opgeslagen data zelf wordt niet aangetast).
  document.getElementById("cd-f-fase").value = String(c.fase || "in zorg").trim().toLowerCase();
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
  /* cd-srch-gw is een keuzelijst (gedragswetenschapper); wordt gevuld + geselecteerd door syncGwSelect() */
  var zn = document.getElementById("cd-zij-not");
  if (zn) zn.value = c.zijbalkNotities != null ? String(c.zijbalkNotities) : "";
  var tno = document.getElementById("cd-tabnot");
  if (tno) tno.value = c.tabNotities != null ? String(c.tabNotities) : "";

  var locDot = document.getElementById("cd-f-loc-dot");
  var fasDot = document.getElementById("cd-f-fase-dot");
  var orgDot = document.getElementById("cd-f-org-dot");
  var haDot = document.getElementById("cd-f-ha-dot");
  function syncDots() {
    if (locDot) locDot.className = "client-detail-sdot client-detail-sdot--loc";
    if (fasDot) fasDot.className = "client-detail-sdot " + faseDotClass(document.getElementById("cd-f-fase").value);
    if (orgDot) {
      var ov = (orgSel && orgSel.value) || "";
      orgDot.className = "client-detail-sdot " + (ov ? "client-detail-sdot--org" : "client-detail-sdot--neut");
    }
    if (haDot) {
      var hv = (haSel && haSel.value) || "";
      haDot.className = "client-detail-sdot " + (hv ? "client-detail-sdot--org" : "client-detail-sdot--neut");
    }
  }
  syncDots();
  document.getElementById("cd-f-fase").addEventListener("change", syncDots);
  if (orgSel) orgSel.addEventListener("change", syncDots);
  if (locSel) locSel.addEventListener("change", syncDots);
  if (haSel) haSel.addEventListener("change", syncDots);

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

  // Gedragswetenschapper-keuzelijst — gevuld uit bs2_role_users (rol 'gedragswetenschapper').
  var _gwListCache = null;
  async function fetchGwList() {
    if (_gwListCache) return _gwListCache;
    try {
      var sb = window.besaSupabase;
      if (!sb) return [];
      var roleRes = await sb.from("bs2_roles").select("id").eq("slug", "gedragswetenschapper").limit(1);
      if (roleRes.error || !roleRes.data || !roleRes.data.length) return [];
      var roleId = roleRes.data[0].id;
      var usrRes = await sb.from("bs2_role_users").select("user_email,user_name").eq("role_id", roleId);
      if (usrRes.error || !usrRes.data) return [];
      _gwListCache = usrRes.data
        .filter(function (u) { return u && u.user_email; })
        .map(function (u) { return { email: String(u.user_email), naam: String(u.user_name || u.user_email) }; })
        .sort(function (a, b) { return a.naam.localeCompare(b.naam); });
      return _gwListCache;
    } catch (e) { return []; }
  }

  async function syncGwSelect() {
    var sel = document.getElementById("cd-srch-gw");
    if (!sel) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    var savedEmail = cl && cl.gedragswetenschapper_email != null ? String(cl.gedragswetenschapper_email).trim() : "";
    var savedNaam = cl && cl.gedragswetenschapper_naam != null ? String(cl.gedragswetenschapper_naam).trim() : "";
    var list = await fetchGwList();
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "— Geen gedragswetenschapper";
    sel.appendChild(o0);
    list.forEach(function (g) {
      var o = document.createElement("option");
      o.value = g.email;
      o.textContent = g.naam;
      sel.appendChild(o);
    });
    var lc = savedEmail.toLowerCase();
    var found = list.some(function (g) { return g.email.toLowerCase() === lc; });
    if (savedEmail && !found) {
      var ox = document.createElement("option");
      ox.value = savedEmail;
      ox.textContent = (savedNaam || savedEmail) + " (niet meer in lijst)";
      sel.appendChild(ox);
    }
    sel.value = "";
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value.toLowerCase() === lc) { sel.selectedIndex = i; break; }
    }
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
      var gsel = document.getElementById("cd-srch-gw");
      var gtxt = (gsel && gsel.value && gsel.options[gsel.selectedIndex]) ? gsel.options[gsel.selectedIndex].textContent : "";
      gwHint.textContent = gtxt
        ? "Gekoppeld aan " + gtxt + ". Deze gedragswetenschapper krijgt automatisch een melding wanneer een beschikking van deze cliënt (bijna) verloopt."
        : "Er is nog geen gedragswetenschapper gekoppeld aan deze cliënt.";
    }
    if (notHint) {
      notHint.textContent = (zn && zn.value || "").trim()
        ? "Notities in de zijbalk worden mee opgeslagen bij wijzigingen."
        : "Nog geen notities. Vul hierboven in en sla het dossier op.";
    }
  }
  syncMedewerkerSelect();
  syncGwSelect();
  updHints();
  var cdEmp = document.getElementById("cd-emp");
  if (cdEmp) {
    cdEmp.addEventListener("change", updHints);
    cdEmp.addEventListener("focus", onHrListMaybeChanged);
  }
  var cdGw = document.getElementById("cd-srch-gw");
  if (cdGw) cdGw.addEventListener("change", updHints);
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
    z: document.getElementById("cd-pan-z"),
    s: document.getElementById("cd-pan-s"),
    g: document.getElementById("cd-pan-g"),
    m: document.getElementById("cd-pan-m"),
    q: document.getElementById("cd-pan-q"),
    i: document.getElementById("cd-pan-i"),
    t: document.getElementById("cd-pan-t"),
    k: document.getElementById("cd-pan-k"),
  };
  var panOrder = "dbpcnjrzsgmqitk";

  // Wordt gezet door initClientBeschikkingen (verderop) — render-hook voor de
  // Beschikkingen-tab zodat tab-activatie altijd verse data toont.
  var renderClientBeschikkingenTab = null;

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
    if (k === "z") renderZorgplannen();
    if (k === "s") renderSignaleringsplannen();
    if (k === "g") renderContactlog();
    if (k === "i") renderKwaliteit();
    if (k === "m") renderMedicatie();
    if (k === "q") renderVragenlijsten();
    if (k === "t") renderTijdlijn();
    if (k === "k") renderIntake();
    if (k === "b" && typeof renderClientBeschikkingenTab === "function") renderClientBeschikkingenTab();
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
  // TIJDLIJN-tab: verticale read-only tijdlijn uit client_tijdlijn
  // (events worden uitsluitend server-side geschreven)
  // ============================================================

  // [hidden]-valkuil: classes met expliciete display overschrijven het
  // UA-stylesheet [hidden]{display:none} — zet daarom altijd beide.
  function cdtSetVisible(el, show) {
    if (!el) return;
    el.style.display = show ? "" : "none";
    el.hidden = !show;
  }

  // DD-MM-YYYY HH:MM in LOKALE tijd (nooit toISOString — UTC-datumshift).
  function cdtFormatDatumTijd(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    return dd + "-" + mm + "-" + d.getFullYear() + " " + hh + ":" + mi;
  }

  // Race-guard: alleen het resultaat van de laatste fetch wordt gerenderd
  // (snelle tab-wissels kunnen anders een oudere respons overschrijven).
  var cdtRenderSeq = 0;
  async function renderTijdlijn() {
    var list = document.getElementById("cd-tijdlijn-list");
    var empty = document.getElementById("cd-tijdlijn-empty");
    if (!list || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var seq = ++cdtRenderSeq;
    cdtSetVisible(empty, false);
    list.innerHTML = '<div class="cdt-loading">Tijdlijn laden…</div>';

    var events = (window.clientTijdlijnDB && typeof window.clientTijdlijnDB.fetchVoorClient === "function")
      ? await window.clientTijdlijnDB.fetchVoorClient(cl.id)
      : [];
    if (seq !== cdtRenderSeq) return; // verouderd resultaat — nieuwere render onderweg

    if (!events.length) {
      list.innerHTML = "";
      cdtSetVisible(empty, true);
      return;
    }

    // Chronologisch nieuwste boven (data-laag sorteert al desc), geen groepering.
    list.innerHTML = events.map(function (ev) {
      if (!ev) return "";
      var icoon = (window.besaClientreis && typeof window.besaClientreis.icoon === "function")
        ? window.besaClientreis.icoon(ev.event_type)
        : "";
      var meta = [];
      if (ev.created_by_naam) meta.push("door " + escapeHtml(ev.created_by_naam));
      meta.push(escapeHtml(cdtFormatDatumTijd(ev.created_at)));
      return (
        '<div class="cdt-item">' +
          '<span class="cdt-dot" aria-hidden="true">' + icoon + '</span>' +
          '<div class="cdt-card">' +
            '<p class="cdt-titel">' + escapeHtml(ev.titel || "—") + '</p>' +
            (ev.omschrijving ? '<p class="cdt-omschrijving">' + escapeHtml(ev.omschrijving) + '</p>' : "") +
            '<p class="cdt-meta">' + meta.join(" · ") + '</p>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  // ============================================================
  // INTAKE-tab (fase 2): 7 onderdelen-editor + intake afronden +
  // digitale ondertekening (clientIntakeDB / clientOndertekeningenDB)
  // ============================================================

  var CDI_ONDERDEEL_LABELS = {
    intakegesprek: "Intakegesprek",
    veiligheidsanalyse: "Veiligheidsanalyse",
    risicoanalyse: "Risicoanalyse",
    gezinsanalyse: "Gezinsanalyse",
    onderwijsanalyse: "Onderwijsanalyse",
    netwerkanalyse: "Netwerkanalyse",
    hulpvraaganalyse: "Hulpvraaganalyse",
  };
  var CDO_TYPE_LABELS = { client: "Cliënt", ouder: "Ouder", gezaghebbende: "Gezaghebbende", voogd: "Voogd" };
  var CDO_STATUS_LABELS = { open: "Open", ondertekend: "Ondertekend", verlopen: "Verlopen", ingetrokken: "Ingetrokken" };

  // DD-MM-YYYY in LOKALE tijd (nooit toISOString — UTC-datumshift).
  function cdiFormatDatum(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
  }

  function cdiOnderdeelLabel(slug) {
    var s = String(slug == null ? "" : slug).trim().toLowerCase();
    if (CDI_ONDERDEEL_LABELS[s]) return CDI_ONDERDEEL_LABELS[s];
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
  }

  function cdiDeelLink(token) {
    return window.location.origin + "/onderteken?token=" + encodeURIComponent(String(token == null ? "" : token));
  }

  async function cdiKopieerLink(token) {
    var link = cdiDeelLink(token);
    try {
      await navigator.clipboard.writeText(link);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Link gekopieerd");
    } catch (err) {
      if (window.showError) window.showError("Kopiëren mislukt — kopieer handmatig: " + link);
    }
  }

  // Race-guard: alleen het resultaat van de laatste fetch wordt gerenderd
  // (snelle tab-wissels kunnen anders een oudere respons overschrijven).
  var cdiRenderSeq = 0;
  var cdiIntake = null; // laatst geladen intake (voor afronden + modal-koppeling)

  async function renderIntake() {
    var rootEl = document.getElementById("cd-intake-root");
    if (!rootEl) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var seq = ++cdiRenderSeq;
    rootEl.innerHTML = '<div class="cdi-loading">Intake laden…</div>';

    var ctx = null;
    try { ctx = await ensureReisContext(); } catch (e) { ctx = null; }
    var kanBeoordelen = !!(ctx && ctx.kan_beoordelen);
    var data = (window.clientIntakeDB && typeof window.clientIntakeDB.fetchVoorClient === "function")
      ? await window.clientIntakeDB.fetchVoorClient(cl.id)
      : { intake: null, onderdelen: [] };
    var onds = (window.clientOndertekeningenDB && typeof window.clientOndertekeningenDB.fetchVoorClient === "function")
      ? await window.clientOndertekeningenDB.fetchVoorClient(cl.id)
      : [];
    var verkl = (window.clientOndertekeningenDB && typeof window.clientOndertekeningenDB.verklaringen === "function")
      ? await window.clientOndertekeningenDB.verklaringen()
      : [];
    if (seq !== cdiRenderSeq) return; // verouderd resultaat — nieuwere render onderweg

    cdiIntake = data.intake || null;
    var html = "";

    if (!data.intake) {
      html += '<div class="cdi-leeg">' +
        '<p class="cdi-leeg-titel">Nog geen intake gestart</p>' +
        '<p class="cdi-leeg-uitleg">De intake wordt automatisch aangemaakt zodra de aanmelding van deze cliënt is goedgekeurd.</p>' +
        '</div>';
    } else {
      var onderdelen = data.onderdelen || [];
      var klaar = onderdelen.filter(function (o) { return o && o.afgerond; }).length;
      var totaal = onderdelen.length || 7;
      var intakeAfgerond = String(data.intake.status || "") === "afgerond";
      var locked = !kanBeoordelen || intakeAfgerond;
      var badge = intakeAfgerond
        ? '<span class="cdi-badge cdi-badge--afgerond">Afgerond' +
          (data.intake.afgerond_door_naam ? " door " + escapeHtml(data.intake.afgerond_door_naam) : "") +
          (data.intake.afgerond_op ? " op " + escapeHtml(cdiFormatDatum(data.intake.afgerond_op)) : "") + "</span>"
        : '<span class="cdi-badge cdi-badge--lopend">Lopend</span>';
      html += '<div class="cdi-kop"><p class="cdi-voortgang">' + klaar + " van " + totaal + " onderdelen afgerond</p>" + badge + "</div>";

      html += onderdelen.map(function (o) {
        if (!o) return "";
        var label = cdiOnderdeelLabel(o.onderdeel);
        var meta = o.ingevuld_door_naam
          ? '<p class="cdi-meta">Laatst ingevuld door ' + escapeHtml(o.ingevuld_door_naam) +
            (o.laatst_gewijzigd ? " op " + escapeHtml(cdiFormatDatum(o.laatst_gewijzigd)) : "") + "</p>"
          : "";
        return '<div class="cdi-kaart" data-cdi-id="' + escapeAttr(o.id) + '">' +
          '<div class="cdi-kaart-kop"><h4 class="cdi-kaart-titel">' + escapeHtml(label) + "</h4>" +
            (o.afgerond ? '<span class="cdi-badge cdi-badge--afgerond">Afgerond</span>' : "") + "</div>" +
          '<label class="visually-hidden" for="cdi-inhoud-' + escapeAttr(o.id) + '">' + escapeHtml(label) + "</label>" +
          '<textarea class="cdi-inhoud" id="cdi-inhoud-' + escapeAttr(o.id) + '" rows="4" placeholder="Nog niet ingevuld…"' + (locked ? " disabled" : "") + ">" + escapeHtml(o.inhoud || "") + "</textarea>" +
          '<div class="cdi-kaart-voet">' +
            '<label class="cdi-afgerond-lab"><input type="checkbox" class="cdi-afgerond"' + (o.afgerond ? " checked" : "") + (locked ? " disabled" : "") + ' /><span>Afgerond</span></label>' +
            (locked ? "" : '<button type="button" class="btn-outline" data-cdi-act="opslaan">Opslaan</button>') +
          "</div>" + meta +
          "</div>";
      }).join("");

      if (kanBeoordelen && !intakeAfgerond) {
        var compleet = klaar >= 7;
        html += '<div class="cdi-afronden-wrap" id="cdi-afronden-wrap">' +
          '<button type="button" class="btn-primary" data-cdi-act="afronden"' +
          (compleet ? "" : ' disabled title="Alle 7 onderdelen moeten afgerond zijn voordat de intake kan worden afgerond."') +
          ">Intake afronden</button></div>";
      }
    }

    // ── Ondertekeningen-subsectie (ondertekenen mag ook na afronding) ────────
    var titelByType = {};
    (verkl || []).forEach(function (v) { if (v && v.type) titelByType[v.type] = v.titel || v.type; });
    html += '<div class="cdo-sectie">' +
      '<div class="cdo-kop"><h4 class="cdo-titel">Digitale ondertekening</h4>' +
      (kanBeoordelen ? '<button type="button" class="btn-primary" data-cdo-act="nieuw">+ Ondertekening aanvragen</button>' : "") +
      "</div>";
    if (!onds.length) {
      html += '<p class="client-detail-placeholder">Nog geen ondertekeningsverzoeken.</p>';
    } else {
      html += '<div class="table-wrapper cdo-tabelwrap"><table class="employees-table cdo-tabel"><thead><tr>' +
        "<th>Verklaring</th><th>Ondertekenaar</th><th>Status</th><th>Aangevraagd op</th><th>Ondertekend op</th><th>Acties</th>" +
        "</tr></thead><tbody>" +
        onds.map(function (o) {
          if (!o) return "";
          var st = String(o.status || "open");
          var acties = "";
          if (st === "open") {
            acties += '<button type="button" class="btn-outline cdo-knopje" data-cdo-act="copy" data-cdo-token="' + escapeAttr(o.token || "") + '">Link kopiëren</button>';
            if (kanBeoordelen) {
              acties += '<button type="button" class="btn-outline cdo-knopje" data-cdo-act="intrek" data-cdo-id="' + escapeAttr(o.id) + '">Intrekken</button>';
            }
          } else if (st === "ondertekend" && o.storage_path_pdf) {
            acties += '<button type="button" class="btn-outline cdo-knopje" data-cdo-act="pdf" data-cdo-path="' + escapeAttr(o.storage_path_pdf) + '">Akte (PDF)</button>';
          }
          return "<tr>" +
            '<td data-col="verklaring">' + escapeHtml(titelByType[o.verklaring_type] || o.verklaring_type || "—") + "</td>" +
            '<td data-col="ondertekenaar">' + escapeHtml(o.ondertekenaar_naam || "—") + ' <span class="cdo-ondtype">(' + escapeHtml(CDO_TYPE_LABELS[o.ondertekenaar_type] || o.ondertekenaar_type || "—") + ")</span></td>" +
            '<td data-col="status"><span class="cdo-pill cdo-pill--' + escapeAttr(st) + '">' + escapeHtml(CDO_STATUS_LABELS[st] || st) + "</span></td>" +
            '<td data-col="aangevraagd">' + escapeHtml(cdiFormatDatum(o.aanmaakdatum)) + "</td>" +
            '<td data-col="ondertekend">' + (o.ondertekend_op ? escapeHtml(cdiFormatDatum(o.ondertekend_op)) : "—") + "</td>" +
            '<td data-col="acties" class="cdo-acties">' + (acties || "—") + "</td>" +
            "</tr>";
        }).join("") +
        "</tbody></table></div>";
    }
    html += "</div>";

    rootEl.innerHTML = html;
  }

  // Klik-afhandeling via delegatie: #cd-intake-root blijft bestaan over
  // renders heen, dus de listener hoeft maar één keer gekoppeld te worden.
  var cdiRoot = document.getElementById("cd-intake-root");
  if (cdiRoot) {
    cdiRoot.addEventListener("click", async function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-cdi-act],[data-cdo-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-cdi-act") || "";
      var oact = btn.getAttribute("data-cdo-act") || "";

      if (act === "opslaan") {
        var kaart = btn.closest("[data-cdi-id]");
        if (!kaart) return;
        var ta = kaart.querySelector(".cdi-inhoud");
        var cb = kaart.querySelector(".cdi-afgerond");
        btn.disabled = true;
        try {
          await window.clientIntakeDB.onderdeelOpslaan(kaart.getAttribute("data-cdi-id"), ta ? ta.value : "", !!(cb && cb.checked));
          if (window.showActionFeedback) window.showActionFeedback("saved", "Intake-onderdeel");
          // her-render volgt via besa:client-intake-updated
        } catch (err) {
          if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
          btn.disabled = false;
        }
        return;
      }

      if (act === "afronden") {
        // Inline bevestig-strook (geen modal).
        var wrap = document.getElementById("cdi-afronden-wrap");
        if (!wrap) return;
        wrap.innerHTML = '<div class="cdi-confirm">' +
          '<p class="cdi-confirm-titel">Intake afronden? De onderdelen worden vergrendeld en de cliëntreis-status gaat naar "Intake afgerond".</p>' +
          '<div class="cdi-confirm-knoppen">' +
            '<button type="button" class="btn-primary" data-cdi-act="afronden-bevestig">Ja, afronden</button>' +
            '<button type="button" class="btn-outline" data-cdi-act="afronden-annuleer">Annuleren</button>' +
          "</div></div>";
        return;
      }
      if (act === "afronden-annuleer") { renderIntake(); return; }
      if (act === "afronden-bevestig") {
        if (!cdiIntake) return;
        btn.disabled = true;
        try {
          await window.clientIntakeDB.afronden(cdiIntake.id);
          if (window.showActionFeedback) window.showActionFeedback("saved", "Intake afgerond");
          // reis_status is server-side gewijzigd → cache + pill + acties verversen
          // (zelfde patroon als syncReisPill na de Details-save).
          if (window.clientenDB && typeof window.clientenDB.refresh === "function") await window.clientenDB.refresh();
          syncReisPill();
          syncReisActies();
          renderIntake();
          if (pans.t && !pans.t.hidden) renderTijdlijn();
        } catch (err) {
          if (window.showError) window.showError("Afronden mislukt: " + (err && err.message || err));
          renderIntake();
        }
        return;
      }

      if (oact === "copy") { cdiKopieerLink(btn.getAttribute("data-cdo-token") || ""); return; }
      if (oact === "intrek") {
        // Inline confirm in de acties-cel.
        var cel = btn.closest("td");
        if (!cel) return;
        cel.innerHTML = '<span class="cdo-confirm-txt">Intrekken?</span>' +
          '<button type="button" class="btn-outline cdo-knopje" data-cdo-act="intrek-bevestig" data-cdo-id="' + escapeAttr(btn.getAttribute("data-cdo-id") || "") + '">Ja, intrekken</button>' +
          '<button type="button" class="btn-outline cdo-knopje" data-cdo-act="intrek-annuleer">Annuleren</button>';
        return;
      }
      if (oact === "intrek-annuleer") { renderIntake(); return; }
      if (oact === "intrek-bevestig") {
        btn.disabled = true;
        try {
          await window.clientOndertekeningenDB.intrekken(btn.getAttribute("data-cdo-id"));
          if (window.showActionFeedback) window.showActionFeedback("saved", "Ondertekening ingetrokken");
          // her-render volgt via besa:client-ondertekeningen-updated
        } catch (err) {
          if (window.showError) window.showError("Intrekken mislukt: " + (err && err.message || err));
          renderIntake();
        }
        return;
      }
      if (oact === "pdf") {
        // Lazy signed URL (PRIVATE bucket): pas ophalen bij klik, daarna openen.
        btn.disabled = true;
        var url = await window.clientOndertekeningenDB.signedUrl(btn.getAttribute("data-cdo-path"));
        btn.disabled = false;
        if (url) window.open(url, "_blank", "noopener");
        else if (window.showError) window.showError("De akte kon niet geopend worden (geen toegang of bestand ontbreekt).");
        return;
      }
      if (oact === "nieuw") { openOndModal(); return; }
    });
  }

  // ── Modal "+ Ondertekening aanvragen" (kopie .modal-overlay-patroon) ───────
  var ondModal = document.getElementById("cd-ond-modal");
  var ondForm = document.getElementById("cd-ond-form");
  var ondVerk = document.getElementById("cd-ond-f-verklaring");
  var ondType = document.getElementById("cd-ond-f-ondtype");
  var ondNaam = document.getElementById("cd-ond-f-naam");
  var ondNaamList = document.getElementById("cd-ond-naam-list");
  var ondResult = document.getElementById("cd-ond-result");
  var ondResultLink = document.getElementById("cd-ond-result-link");
  var ondSaveBtn = document.getElementById("cd-ond-save-btn");
  var ondCancelBtn = document.getElementById("cd-ond-cancel-btn");

  async function openOndModal() {
    if (!ondModal) return;
    // Verklaring-select vullen uit ondertekening_verklaringen.
    var verkl = (window.clientOndertekeningenDB && typeof window.clientOndertekeningenDB.verklaringen === "function")
      ? await window.clientOndertekeningenDB.verklaringen()
      : [];
    if (ondVerk) {
      ondVerk.innerHTML = "";
      verkl.forEach(function (v) {
        if (!v || !v.type) return;
        // 'zorgplan' loopt via de Zorgplannen-tab (eigen RPC met plan-inhoud).
        if (v.type === "zorgplan") return;
        var o = document.createElement("option");
        o.value = v.type;
        o.textContent = v.titel || v.type;
        ondVerk.appendChild(o);
      });
    }
    // Datalist met contactnamen (indien beschikbaar).
    if (ondNaamList) {
      ondNaamList.innerHTML = "";
      var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
      var contacten = (cl && window.clientContactenDB && typeof window.clientContactenDB.getForClientSync === "function")
        ? window.clientContactenDB.getForClientSync(cl.id)
        : [];
      contacten.forEach(function (r) {
        if (!r || r.archived || !r.naam) return;
        var o = document.createElement("option");
        o.value = String(r.naam);
        ondNaamList.appendChild(o);
      });
    }
    if (ondForm) ondForm.reset();
    if (ondType) ondType.value = "client";
    cdtSetVisible(ondForm, true);
    cdtSetVisible(ondResult, false);
    cdtSetVisible(ondSaveBtn, true);
    if (ondCancelBtn) ondCancelBtn.textContent = "Annuleren";
    ondModal.hidden = false;
    ondModal.setAttribute("aria-hidden", "false");
    try { if (ondNaam) ondNaam.focus(); } catch (e) { /* */ }
  }
  function closeOndModal() {
    if (!ondModal) return;
    ondModal.hidden = true;
    ondModal.setAttribute("aria-hidden", "true");
  }
  if (ondSaveBtn) {
    ondSaveBtn.addEventListener("click", async function () {
      var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
      if (!cl) return;
      var naam = ((ondNaam && ondNaam.value) || "").trim();
      if (!naam) { try { ondNaam.focus(); } catch (e) { /* */ } return; }
      ondSaveBtn.disabled = true;
      try {
        var res = await window.clientOndertekeningenDB.maakVerzoek({
          clientId: cl.id,
          verklaringType: ondVerk ? ondVerk.value : "",
          ondertekenaarType: ondType ? ondType.value : "client",
          ondertekenaarNaam: naam,
          intakeId: cdiIntake ? cdiIntake.id : null,
        });
        if (window.showActionFeedback) window.showActionFeedback("added", "Ondertekeningsverzoek");
        // Toon direct de deel-link met kopieer-knop in de modal.
        if (ondResultLink) ondResultLink.value = cdiDeelLink(res && res.token ? res.token : "");
        cdtSetVisible(ondForm, false);
        cdtSetVisible(ondSaveBtn, false);
        cdtSetVisible(ondResult, true);
        if (ondCancelBtn) ondCancelBtn.textContent = "Sluiten";
        // tabel her-rendert via besa:client-ondertekeningen-updated
      } catch (err) {
        if (window.showError) window.showError("Aanvragen mislukt: " + (err && err.message || err));
      } finally {
        ondSaveBtn.disabled = false;
      }
    });
  }
  var ondResultCopy = document.getElementById("cd-ond-result-copy");
  if (ondResultCopy) {
    ondResultCopy.addEventListener("click", async function () {
      var link = ondResultLink ? ondResultLink.value : "";
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Link gekopieerd");
      } catch (err) {
        if (window.showError) window.showError("Kopiëren mislukt — kopieer handmatig uit het tekstveld.");
      }
    });
  }
  if (ondCancelBtn) ondCancelBtn.addEventListener("click", closeOndModal);
  var ondCloseBtn = document.getElementById("cd-ond-modal-close");
  if (ondCloseBtn) ondCloseBtn.addEventListener("click", closeOndModal);
  if (ondModal) {
    ondModal.addEventListener("click", function (e) { if (e.target === ondModal) closeOndModal(); });
  }
  if (ondForm) {
    ondForm.addEventListener("submit", function (e) { e.preventDefault(); if (ondSaveBtn) ondSaveBtn.click(); });
  }

  // Live-refresh (alleen renderen als de Intake-tab actief is)
  window.addEventListener("besa:client-intake-updated", function () {
    var panK = document.getElementById("cd-pan-k");
    if (panK && !panK.hidden) renderIntake();
  });
  window.addEventListener("besa:client-ondertekeningen-updated", function () {
    var panK = document.getElementById("cd-pan-k");
    if (panK && !panK.hidden) renderIntake();
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
    var rapFTijd = document.getElementById("cd-rap-f-tijd");

    if (rec && rec.id) {
      if (rapTitle) rapTitle.textContent = "Rapportage bewerken";
      rapFId.value = rec.id;
      rapFTitel.value = rec.titel || "";
      rapFDatum.value = rec.rapportDatum || "";
      if (rapFTijd) rapFTijd.value = rec.tijd || "";
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
      if (rapFTijd) rapFTijd.value = "";
    }
    rapVulDoelenKoppeling(rec && Array.isArray(rec.doelIds) ? rec.doelIds : []);
    rapModal.hidden = false;
    rapModal.setAttribute("aria-hidden", "false");
    try { rapFTitel.focus(); } catch (e) { /* */ }
  }

  // Doelen-koppeling (§8): checkbox-lijst van de doelen uit het actieve zorgplan.
  async function rapVulDoelenKoppeling(geselecteerd) {
    var wrap = document.getElementById("cd-rap-f-doelen-wrap");
    var lijst = document.getElementById("cd-rap-f-doelen");
    if (!wrap || !lijst) return;
    wrap.hidden = true;
    lijst.innerHTML = "";
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl || !window.zorgplannenDB) return;
    try {
      var plannen = await window.zorgplannenDB.fetchVoorClient(cl.id);
      var actief = plannen.find(function (p) { return p && p.status === "actief" && !p.archived; });
      var doelen = actief && Array.isArray(actief.doelen) ? actief.doelen : [];
      if (!doelen.length) return;
      var sel = (geselecteerd || []).map(String);
      lijst.innerHTML = doelen.map(function (d) {
        var did = String((d && d.id) || "");
        if (!did) return "";
        var checked = sel.indexOf(did) >= 0 ? " checked" : "";
        return '<label class="cd-med-check"><input type="checkbox" value="' + escapeAttr(did) + '"' + checked + ' /> <span>' + escapeHtml((d && d.titel) || "—") + '</span></label>';
      }).join("");
      wrap.hidden = false;
    } catch (e) { /* doelen-koppeling is optioneel */ }
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

    var rapFTijd = document.getElementById("cd-rap-f-tijd");
    var doelChecks = document.querySelectorAll("#cd-rap-f-doelen input[type=checkbox]:checked");
    var rec = {
      clientId: cl.id,
      titel: titel,
      inhoud: (rapFInhoud.value || "").trim(),
      status: rapFStatus.value || "concept",
      type: rapFType.value || "",
      rapportDatum: rapFDatum.value || null,
      tijd: rapFTijd && rapFTijd.value ? rapFTijd.value : null,
      doelIds: Array.prototype.map.call(doelChecks, function (ch) { return ch.value; }),
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

  // ============================================================
  // FASE 3 — gedeelde helpers (huidige user + GW-akkoord-zicht)
  // ============================================================

  var f3UserIdPromise = null;
  function f3CurrentUserId() {
    if (!f3UserIdPromise) {
      f3UserIdPromise = (async function () {
        try {
          var s = await window.besaSupabase.auth.getSession();
          return (s && s.data && s.data.session && s.data.session.user && s.data.session.user.id) || null;
        } catch (e) { return null; }
      })();
    }
    return f3UserIdPromise;
  }

  // Cosmetische check; de harde poort is zorgplan_kan_gw_akkoord() in SQL.
  // Let op: clientreis_context() geeft rol-NAMEN terug ("Gedragswetenschapper"),
  // geen slugs — daarom lowercase-vergelijking.
  function f3KanGwAkkoord(ctx) {
    if (window.profilesDB && typeof window.profilesDB.isAdmin === "function" && window.profilesDB.isAdmin()) return true;
    var rollen = ((ctx && Array.isArray(ctx.rollen)) ? ctx.rollen : []).map(function (r) {
      return String(r || "").toLowerCase();
    });
    return rollen.indexOf("gedragswetenschapper") >= 0 || rollen.indexOf("admin") >= 0 || rollen.indexOf("eigenaar") >= 0;
  }

  function f3OndertekenLink(token) {
    return window.location.origin + "/onderteken?token=" + encodeURIComponent(String(token == null ? "" : token));
  }

  async function f3KopieerNaarKlembord(tekst) {
    try { await navigator.clipboard.writeText(tekst); return true; } catch (e) { return false; }
  }

  // ============================================================
  // ZORGPLANNEN-tab (fase 3, §9) — workflow concept → gw_akkoord
  // → ter_ondertekening → actief → geevalueerd / vervangen
  // ============================================================

  var ZP_STATUS_LABEL = {
    concept: "Concept",
    gw_akkoord: "GW-akkoord",
    ter_ondertekening: "Ter ondertekening",
    actief: "Actief",
    geevalueerd: "Geëvalueerd",
    vervangen: "Vervangen",
  };
  var zpCache = [];

  function zpStatusPill(status) {
    var s = String(status || "concept");
    return '<span class="cd-zp-status cd-zp-status--' + escapeAttr(s) + '">' + escapeHtml(ZP_STATUS_LABEL[s] || s) + '</span>';
  }

  function zpDoelStatusLabel(s) {
    return s === "behaald" ? "Behaald" : s === "gestopt" ? "Gestopt" : "Open";
  }

  async function renderZorgplannen() {
    var list = document.getElementById("cd-zp-list");
    var empty = document.getElementById("cd-zp-empty");
    var addBtn = document.getElementById("cd-zp-add-btn");
    if (!list || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var ctx = null;
    try { ctx = await ensureReisContext(); } catch (e) { ctx = null; }
    var kanBeoordelen = !!(ctx && ctx.kan_beoordelen);
    if (addBtn) craSetVisible(addBtn, kanBeoordelen);

    var rows = await window.zorgplannenDB.fetchVoorClient(cl.id);
    zpCache = rows;
    var zichtbaar = rows.filter(function (p) { return p && !p.archived; });

    list.innerHTML = zichtbaar.map(function (p) {
      var doelen = Array.isArray(p.doelen) ? p.doelen : [];
      var doelenHtml = doelen.length
        ? '<ul class="cd-zp-doelen">' + doelen.map(function (d) {
            var ds = String((d && d.status) || "open");
            return '<li class="cd-zp-doel"><span class="cd-zp-doel-status cd-zp-doel-status--' + escapeAttr(ds) + '">' + escapeHtml(zpDoelStatusLabel(ds)) + '</span> ' +
              escapeHtml((d && d.titel) || "—") +
              ((d && d.streefdatum) ? ' <span class="cd-zp-doel-datum">(streefdatum ' + escapeHtml(formatDateNL(d.streefdatum)) + ')</span>' : '') +
            '</li>';
          }).join("") + '</ul>'
        : '<p class="client-detail-hint">Nog geen doelen vastgelegd.</p>';

      var acties = [];
      if (kanBeoordelen && p.status === "concept") {
        acties.push('<button type="button" class="btn-outline cd-zp-act" data-act="bewerken" data-id="' + escapeAttr(p.id) + '">Bewerken</button>');
      }
      if (p.status === "concept" && f3KanGwAkkoord(ctx)) {
        acties.push('<button type="button" class="btn-primary cd-zp-act" data-act="gw-akkoord" data-id="' + escapeAttr(p.id) + '">GW-akkoord geven</button>');
      }
      if (kanBeoordelen && p.status === "gw_akkoord") {
        acties.push('<button type="button" class="btn-primary cd-zp-act" data-act="ter-ondertekening" data-id="' + escapeAttr(p.id) + '">Ter ondertekening</button>');
        acties.push('<button type="button" class="btn-outline cd-zp-act" data-act="activeer" data-id="' + escapeAttr(p.id) + '">Direct activeren</button>');
      }
      if (kanBeoordelen && p.status === "ter_ondertekening") {
        if (p.__ondertekening && p.__ondertekening.status === "open") {
          acties.push('<button type="button" class="btn-outline cd-zp-act" data-act="link" data-id="' + escapeAttr(p.id) + '">Onderteken-link kopiëren</button>');
        }
        acties.push('<button type="button" class="btn-outline cd-zp-act" data-act="activeer" data-id="' + escapeAttr(p.id) + '">Activeren zonder digitale ondertekening</button>');
      }
      if (kanBeoordelen && p.status === "actief") {
        acties.push('<button type="button" class="btn-primary cd-zp-act" data-act="evalueer" data-id="' + escapeAttr(p.id) + '">Evalueren</button>');
      }
      if (kanBeoordelen && (p.status === "geevalueerd" || p.status === "vervangen")) {
        acties.push('<button type="button" class="employee-delete-btn cd-zp-act" data-act="archiveer" data-id="' + escapeAttr(p.id) + '" aria-label="Archiveren">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>');
      }

      var meta = [];
      if (p.gw_akkoord_op) meta.push("GW-akkoord: " + escapeHtml(p.gw_akkoord_door_naam || "—") + " (" + escapeHtml(formatDateNL(String(p.gw_akkoord_op).slice(0, 10))) + ")");
      if (p.actief_sinds) meta.push("Actief sinds " + escapeHtml(formatDateNL(String(p.actief_sinds).slice(0, 10))));
      if (p.geevalueerd_op) meta.push("Geëvalueerd op " + escapeHtml(formatDateNL(String(p.geevalueerd_op).slice(0, 10))));
      if (p.evaluatiemoment) meta.push("Evaluatiemoment: " + escapeHtml(formatDateNL(p.evaluatiemoment)));
      if (p.__ondertekening && p.__ondertekening.status === "ondertekend") meta.push("Digitaal ondertekend");

      return '<article class="cd-zp-kaart">' +
        '<div class="cd-zp-kaart-head">' +
          '<h4 class="cd-zp-kaart-titel">' + escapeHtml(p.titel || "Zorgplan") + '</h4>' +
          zpStatusPill(p.status) +
        '</div>' +
        (p.hulpvraag ? '<p class="cd-zp-veld"><strong>Hulpvraag:</strong> ' + escapeHtml(p.hulpvraag) + '</p>' : '') +
        doelenHtml +
        (p.acties ? '<p class="cd-zp-veld"><strong>Acties:</strong> ' + escapeHtml(p.acties) + '</p>' : '') +
        (p.risicoanalyse ? '<p class="cd-zp-veld"><strong>Risicoanalyse:</strong> ' + escapeHtml(p.risicoanalyse) + '</p>' : '') +
        (p.signalering ? '<p class="cd-zp-veld"><strong>Signalering:</strong> ' + escapeHtml(p.signalering) + '</p>' : '') +
        (p.evaluatie_verslag ? '<p class="cd-zp-veld"><strong>Evaluatieverslag:</strong> ' + escapeHtml(p.evaluatie_verslag) + '</p>' : '') +
        (meta.length ? '<p class="cd-zp-meta">' + meta.join(" · ") + '</p>' : '') +
        (acties.length ? '<div class="cd-zp-acties">' + acties.join("") + '</div>' : '') +
      '</article>';
    }).join("");
    craSetVisible(empty, zichtbaar.length === 0);
  }

  // --- Zorgplan-modal (nieuw/bewerken, alleen status concept) ---
  var zpModal = document.getElementById("cd-zp-modal");
  var zpDoelenList = document.getElementById("cd-zp-f-doelen");
  var zpDoelSeq = 0;

  function zpNieuwDoelId() {
    zpDoelSeq += 1;
    return "doel-" + Date.now().toString(36) + "-" + zpDoelSeq;
  }

  function zpDoelRijHtml(d) {
    var doel = d || {};
    return '<div class="cd-zp-doel-rij" data-doel-id="' + escapeAttr(doel.id || zpNieuwDoelId()) + '">' +
      '<input class="modal-input cd-zp-doel-titel" type="text" placeholder="Doel *" value="' + escapeAttr(doel.titel || "") + '" />' +
      '<input class="modal-input cd-zp-doel-omschrijving" type="text" placeholder="Omschrijving (optioneel)" value="' + escapeAttr(doel.omschrijving || "") + '" />' +
      '<select class="modal-input cd-zp-doel-statussel">' +
        '<option value="open"' + (doel.status === "behaald" || doel.status === "gestopt" ? "" : " selected") + '>Open</option>' +
        '<option value="behaald"' + (doel.status === "behaald" ? " selected" : "") + '>Behaald</option>' +
        '<option value="gestopt"' + (doel.status === "gestopt" ? " selected" : "") + '>Gestopt</option>' +
      '</select>' +
      '<input class="modal-input cd-zp-doel-streefdatum" type="date" value="' + escapeAttr(doel.streefdatum || "") + '" aria-label="Streefdatum" />' +
      '<button type="button" class="modal-close cd-zp-doel-del" aria-label="Doel verwijderen"><span aria-hidden="true">&times;</span></button>' +
    '</div>';
  }

  function zpLeesDoelenUitForm() {
    if (!zpDoelenList) return [];
    return Array.prototype.map.call(zpDoelenList.querySelectorAll(".cd-zp-doel-rij"), function (rij) {
      var titel = (rij.querySelector(".cd-zp-doel-titel") || {}).value || "";
      if (!titel.trim()) return null;
      return {
        id: rij.getAttribute("data-doel-id") || zpNieuwDoelId(),
        titel: titel.trim(),
        omschrijving: ((rij.querySelector(".cd-zp-doel-omschrijving") || {}).value || "").trim(),
        status: (rij.querySelector(".cd-zp-doel-statussel") || {}).value || "open",
        streefdatum: (rij.querySelector(".cd-zp-doel-streefdatum") || {}).value || null,
      };
    }).filter(Boolean);
  }

  function openZpModal(rec) {
    if (!zpModal) return;
    var titelEl = document.getElementById("cd-zp-modal-title");
    document.getElementById("cd-zp-f-id").value = rec && rec.id ? rec.id : "";
    document.getElementById("cd-zp-f-titel").value = rec ? (rec.titel || "Zorgplan") : "Zorgplan";
    document.getElementById("cd-zp-f-hulpvraag").value = rec ? (rec.hulpvraag || "") : "";
    document.getElementById("cd-zp-f-acties").value = rec ? (rec.acties || "") : "";
    document.getElementById("cd-zp-f-risico").value = rec ? (rec.risicoanalyse || "") : "";
    document.getElementById("cd-zp-f-signalering").value = rec ? (rec.signalering || "") : "";
    document.getElementById("cd-zp-f-evaluatie").value = rec && rec.evaluatiemoment ? rec.evaluatiemoment : "";
    if (titelEl) titelEl.textContent = rec && rec.id ? "Zorgplan bewerken" : "Zorgplan toevoegen";
    if (zpDoelenList) {
      var doelen = rec && Array.isArray(rec.doelen) ? rec.doelen : [];
      zpDoelenList.innerHTML = doelen.length ? doelen.map(zpDoelRijHtml).join("") : zpDoelRijHtml(null);
    }
    zpModal.hidden = false;
    zpModal.setAttribute("aria-hidden", "false");
    try { document.getElementById("cd-zp-f-titel").focus(); } catch (e) { /* */ }
  }
  function closeZpModal() {
    if (!zpModal) return;
    zpModal.hidden = true;
    zpModal.setAttribute("aria-hidden", "true");
  }

  async function saveZorgplanFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var titelEl = document.getElementById("cd-zp-f-titel");
    var titel = (titelEl.value || "").trim();
    if (!titel) { try { titelEl.focus(); } catch (e) {} return; }
    var rec = {
      id: document.getElementById("cd-zp-f-id").value || null,
      clientId: cl.id,
      titel: titel,
      hulpvraag: (document.getElementById("cd-zp-f-hulpvraag").value || "").trim(),
      doelen: zpLeesDoelenUitForm(),
      acties: (document.getElementById("cd-zp-f-acties").value || "").trim(),
      risicoanalyse: (document.getElementById("cd-zp-f-risico").value || "").trim(),
      signalering: (document.getElementById("cd-zp-f-signalering").value || "").trim(),
      evaluatiemoment: document.getElementById("cd-zp-f-evaluatie").value || null,
    };
    try {
      await window.zorgplannenDB.opslaan(rec);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Zorgplan");
      closeZpModal();
    } catch (err) {
      if (window.showError) window.showError("Zorgplan opslaan mislukt: " + (err && err.message || err));
    }
  }

  document.getElementById("cd-zp-add-btn")?.addEventListener("click", function () { openZpModal(null); });
  document.getElementById("cd-zp-modal-close")?.addEventListener("click", closeZpModal);
  document.getElementById("cd-zp-cancel-btn")?.addEventListener("click", closeZpModal);
  document.getElementById("cd-zp-save-btn")?.addEventListener("click", function (e) { e.preventDefault(); saveZorgplanFromForm(); });
  document.getElementById("cd-zp-form")?.addEventListener("submit", function (e) { e.preventDefault(); saveZorgplanFromForm(); });
  if (zpModal) zpModal.addEventListener("click", function (e) { if (e.target === zpModal) closeZpModal(); });
  document.getElementById("cd-zp-f-doel-add")?.addEventListener("click", function () {
    if (zpDoelenList) zpDoelenList.insertAdjacentHTML("beforeend", zpDoelRijHtml(null));
  });
  if (zpDoelenList) {
    zpDoelenList.addEventListener("click", function (e) {
      var del = e.target && e.target.closest ? e.target.closest(".cd-zp-doel-del") : null;
      if (del) { var rij = del.closest(".cd-zp-doel-rij"); if (rij) rij.remove(); }
    });
  }

  // --- Zorgplan ter ondertekening (modal) ---
  var zpOndModal = document.getElementById("cd-zp-ond-modal");
  function openZpOndModal(planId) {
    if (!zpOndModal) return;
    document.getElementById("cd-zp-ond-id").value = planId;
    document.getElementById("cd-zp-ond-naam").value = "";
    var result = document.getElementById("cd-zp-ond-result");
    if (result) { result.hidden = true; }
    var form = document.getElementById("cd-zp-ond-form");
    if (form) form.hidden = false;
    var saveBtn = document.getElementById("cd-zp-ond-save");
    if (saveBtn) { saveBtn.disabled = false; craSetVisible(saveBtn, true); }
    zpOndModal.hidden = false;
    zpOndModal.setAttribute("aria-hidden", "false");
  }
  function closeZpOndModal() {
    if (!zpOndModal) return;
    zpOndModal.hidden = true;
    zpOndModal.setAttribute("aria-hidden", "true");
  }
  document.getElementById("cd-zp-ond-close")?.addEventListener("click", closeZpOndModal);
  document.getElementById("cd-zp-ond-cancel")?.addEventListener("click", closeZpOndModal);
  if (zpOndModal) zpOndModal.addEventListener("click", function (e) { if (e.target === zpOndModal) closeZpOndModal(); });
  document.getElementById("cd-zp-ond-save")?.addEventListener("click", async function () {
    var planId = document.getElementById("cd-zp-ond-id").value;
    var ondType = document.getElementById("cd-zp-ond-type").value;
    var naamEl = document.getElementById("cd-zp-ond-naam");
    var naam = (naamEl.value || "").trim();
    if (!naam) { try { naamEl.focus(); } catch (e) {} return; }
    var btn = this;
    btn.disabled = true;
    try {
      var res = await window.zorgplannenDB.terOndertekening(planId, ondType, naam);
      var form = document.getElementById("cd-zp-ond-form");
      if (form) form.hidden = true;
      var result = document.getElementById("cd-zp-ond-result");
      var linkEl = document.getElementById("cd-zp-ond-link");
      if (linkEl) linkEl.value = f3OndertekenLink(res && res.token);
      if (result) result.hidden = false;
      craSetVisible(btn, false);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Ondertekening aangevraagd");
      renderZorgplannen();
    } catch (err) {
      btn.disabled = false;
      if (window.showError) window.showError("Ter ondertekening aanbieden mislukt: " + (err && err.message || err));
    }
  });
  document.getElementById("cd-zp-ond-copy")?.addEventListener("click", async function () {
    var linkEl = document.getElementById("cd-zp-ond-link");
    if (!linkEl) return;
    var ok = await f3KopieerNaarKlembord(linkEl.value);
    if (window.showActionFeedback) window.showActionFeedback(ok ? "saved" : "error", ok ? "Link gekopieerd" : "Kopiëren mislukt");
  });

  // --- Zorgplan evalueren (modal) ---
  var zpEvalModal = document.getElementById("cd-zp-eval-modal");
  function openZpEvalModal(planId) {
    if (!zpEvalModal) return;
    document.getElementById("cd-zp-eval-id").value = planId;
    document.getElementById("cd-zp-eval-verslag").value = "";
    zpEvalModal.hidden = false;
    zpEvalModal.setAttribute("aria-hidden", "false");
    try { document.getElementById("cd-zp-eval-verslag").focus(); } catch (e) { /* */ }
  }
  function closeZpEvalModal() {
    if (!zpEvalModal) return;
    zpEvalModal.hidden = true;
    zpEvalModal.setAttribute("aria-hidden", "true");
  }
  document.getElementById("cd-zp-eval-close")?.addEventListener("click", closeZpEvalModal);
  document.getElementById("cd-zp-eval-cancel")?.addEventListener("click", closeZpEvalModal);
  if (zpEvalModal) zpEvalModal.addEventListener("click", function (e) { if (e.target === zpEvalModal) closeZpEvalModal(); });
  document.getElementById("cd-zp-eval-save")?.addEventListener("click", async function () {
    var planId = document.getElementById("cd-zp-eval-id").value;
    var verslag = (document.getElementById("cd-zp-eval-verslag").value || "").trim();
    this.disabled = true;
    try {
      await window.zorgplannenDB.evalueer(planId, verslag || null);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Zorgplan geëvalueerd");
      closeZpEvalModal();
      renderZorgplannen();
      renderAiKaart();
    } catch (err) {
      if (window.showError) window.showError("Evalueren mislukt: " + (err && err.message || err));
    }
    this.disabled = false;
  });

  // --- Zorgplan-kaart-acties ---
  document.getElementById("cd-zp-list")?.addEventListener("click", async function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".cd-zp-act") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var id = btn.getAttribute("data-id");
    var plan = zpCache.find(function (p) { return p && String(p.id) === String(id); });
    if (!plan) return;

    if (act === "bewerken") { openZpModal(plan); return; }
    if (act === "ter-ondertekening") { openZpOndModal(id); return; }
    if (act === "evalueer") { openZpEvalModal(id); return; }
    if (act === "link") {
      var token = plan.__ondertekening && plan.__ondertekening.token;
      var ok = await f3KopieerNaarKlembord(f3OndertekenLink(token));
      if (window.showActionFeedback) window.showActionFeedback(ok ? "saved" : "error", ok ? "Link gekopieerd" : "Kopiëren mislukt");
      return;
    }
    if (act === "gw-akkoord") {
      var okGw = await window.showSliderConfirmModal({
        title: "GW-akkoord geven op dit zorgplan?",
        preview: plan.titel || "Zorgplan",
        okLabel: "Akkoord geven",
        cancelLabel: "Annuleren",
      });
      if (!okGw) return;
      try {
        await window.zorgplannenDB.gwAkkoord(id);
        if (window.showActionFeedback) window.showActionFeedback("saved", "GW-akkoord");
        renderZorgplannen();
      } catch (err) {
        if (window.showError) window.showError("GW-akkoord mislukt: " + (err && err.message || err));
      }
      return;
    }
    if (act === "activeer") {
      var okAct = await window.showSliderConfirmModal({
        title: "Zorgplan activeren? Een eerder actief plan wordt vervangen.",
        preview: plan.titel || "Zorgplan",
        okLabel: "Activeren",
        cancelLabel: "Annuleren",
      });
      if (!okAct) return;
      try {
        await window.zorgplannenDB.activeer(id);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Zorgplan actief");
        renderZorgplannen();
        renderAiKaart();
      } catch (err) {
        if (window.showError) window.showError("Activeren mislukt: " + (err && err.message || err));
      }
      return;
    }
    if (act === "archiveer") {
      var okArc = await window.showArchiveConfirm({ preview: plan.titel || "Zorgplan" });
      if (!okArc) return;
      try {
        await window.zorgplannenDB.archive(id);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Zorgplan");
        renderZorgplannen();
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });
  window.addEventListener("besa:zorgplannen-updated", function () {
    if (pans.z && !pans.z.hidden) renderZorgplannen();
  });

  // ============================================================
  // SIGNALERINGSPLANNEN-tab (fase 3, §10)
  // ============================================================

  var SP_STATUS_LABEL = { concept: "Concept", actief: "Actief", vervangen: "Vervangen" };
  var SP_FASE_KLEUREN = ["groen", "oranje", "rood"];
  var SP_FASE_LABELS = { groen: "Fase groen — ontspannen", oranje: "Fase oranje — spanning loopt op", rood: "Fase rood — escalatie" };
  var spCache = [];

  async function renderSignaleringsplannen() {
    var list = document.getElementById("cd-sp-list");
    var empty = document.getElementById("cd-sp-empty");
    var addBtn = document.getElementById("cd-sp-add-btn");
    if (!list || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var ctx = null;
    try { ctx = await ensureReisContext(); } catch (e) { ctx = null; }
    var kanBeoordelen = !!(ctx && ctx.kan_beoordelen);
    if (addBtn) craSetVisible(addBtn, kanBeoordelen);

    var rows = await window.signaleringsplannenDB.fetchVoorClient(cl.id);
    spCache = rows;
    var zichtbaar = rows.filter(function (p) { return p && !p.archived; });

    list.innerHTML = zichtbaar.map(function (p) {
      var fases = Array.isArray(p.escalatiefases) ? p.escalatiefases : [];
      var fasesHtml = fases.map(function (f) {
        var kleur = SP_FASE_KLEUREN.indexOf(String((f && f.fase) || "")) >= 0 ? String(f.fase) : "groen";
        return '<div class="cd-sp-fase cd-sp-fase--' + kleur + '">' +
          '<p class="cd-sp-fase-titel">' + escapeHtml(SP_FASE_LABELS[kleur] || kleur) + '</p>' +
          ((f && f.signalen) ? '<p class="cd-zp-veld"><strong>Signalen:</strong> ' + escapeHtml(f.signalen) + '</p>' : '') +
          ((f && f.interventies) ? '<p class="cd-zp-veld"><strong>Interventies:</strong> ' + escapeHtml(f.interventies) + '</p>' : '') +
        '</div>';
      }).join("");

      var acties = [];
      if (kanBeoordelen && p.status === "concept") {
        acties.push('<button type="button" class="btn-outline cd-sp-act" data-act="bewerken" data-id="' + escapeAttr(p.id) + '">Bewerken</button>');
        acties.push('<button type="button" class="btn-primary cd-sp-act" data-act="activeer" data-id="' + escapeAttr(p.id) + '">Activeren</button>');
      }
      if (kanBeoordelen && p.status === "vervangen") {
        acties.push('<button type="button" class="employee-delete-btn cd-sp-act" data-act="archiveer" data-id="' + escapeAttr(p.id) + '" aria-label="Archiveren">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>');
      }

      return '<article class="cd-zp-kaart">' +
        '<div class="cd-zp-kaart-head">' +
          '<h4 class="cd-zp-kaart-titel">Signaleringsplan</h4>' +
          '<span class="cd-zp-status cd-zp-status--' + escapeAttr(p.status) + '">' + escapeHtml(SP_STATUS_LABEL[p.status] || p.status) + '</span>' +
        '</div>' +
        (p.triggers ? '<p class="cd-zp-veld"><strong>Triggers:</strong> ' + escapeHtml(p.triggers) + '</p>' : '') +
        (p.spanningssignalen ? '<p class="cd-zp-veld"><strong>Spanningssignalen:</strong> ' + escapeHtml(p.spanningssignalen) + '</p>' : '') +
        (fasesHtml ? '<div class="cd-sp-fases">' + fasesHtml + '</div>' : '') +
        (p.interventies ? '<p class="cd-zp-veld"><strong>Algemene interventies:</strong> ' + escapeHtml(p.interventies) + '</p>' : '') +
        (p.veiligheidsafspraken ? '<p class="cd-zp-veld"><strong>Veiligheidsafspraken:</strong> ' + escapeHtml(p.veiligheidsafspraken) + '</p>' : '') +
        (p.actief_sinds ? '<p class="cd-zp-meta">Actief sinds ' + escapeHtml(formatDateNL(String(p.actief_sinds).slice(0, 10))) + '</p>' : '') +
        (acties.length ? '<div class="cd-zp-acties">' + acties.join("") + '</div>' : '') +
      '</article>';
    }).join("");
    craSetVisible(empty, zichtbaar.length === 0);
  }

  var spModal = document.getElementById("cd-sp-modal");
  function spFaseVeld(kleur, soort) {
    return document.getElementById("cd-sp-f-" + kleur + "-" + soort);
  }
  function openSpModal(rec) {
    if (!spModal) return;
    var titelEl = document.getElementById("cd-sp-modal-title");
    document.getElementById("cd-sp-f-id").value = rec && rec.id ? rec.id : "";
    document.getElementById("cd-sp-f-triggers").value = rec ? (rec.triggers || "") : "";
    document.getElementById("cd-sp-f-signalen").value = rec ? (rec.spanningssignalen || "") : "";
    document.getElementById("cd-sp-f-interventies").value = rec ? (rec.interventies || "") : "";
    document.getElementById("cd-sp-f-veiligheid").value = rec ? (rec.veiligheidsafspraken || "") : "";
    var fases = rec && Array.isArray(rec.escalatiefases) ? rec.escalatiefases : [];
    SP_FASE_KLEUREN.forEach(function (kleur) {
      var f = fases.find(function (x) { return x && x.fase === kleur; }) || {};
      var sEl = spFaseVeld(kleur, "signalen");
      var iEl = spFaseVeld(kleur, "interventies");
      if (sEl) sEl.value = f.signalen || "";
      if (iEl) iEl.value = f.interventies || "";
    });
    if (titelEl) titelEl.textContent = rec && rec.id ? "Signaleringsplan bewerken" : "Signaleringsplan toevoegen";
    spModal.hidden = false;
    spModal.setAttribute("aria-hidden", "false");
    try { document.getElementById("cd-sp-f-triggers").focus(); } catch (e) { /* */ }
  }
  function closeSpModal() {
    if (!spModal) return;
    spModal.hidden = true;
    spModal.setAttribute("aria-hidden", "true");
  }
  async function saveSignaleringsplanFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var fases = SP_FASE_KLEUREN.map(function (kleur) {
      var signalen = ((spFaseVeld(kleur, "signalen") || {}).value || "").trim();
      var interventies = ((spFaseVeld(kleur, "interventies") || {}).value || "").trim();
      if (!signalen && !interventies) return null;
      return { fase: kleur, signalen: signalen, interventies: interventies };
    }).filter(Boolean);
    var rec = {
      id: document.getElementById("cd-sp-f-id").value || null,
      clientId: cl.id,
      triggers: (document.getElementById("cd-sp-f-triggers").value || "").trim(),
      spanningssignalen: (document.getElementById("cd-sp-f-signalen").value || "").trim(),
      escalatiefases: fases,
      interventies: (document.getElementById("cd-sp-f-interventies").value || "").trim(),
      veiligheidsafspraken: (document.getElementById("cd-sp-f-veiligheid").value || "").trim(),
    };
    try {
      await window.signaleringsplannenDB.opslaan(rec);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Signaleringsplan");
      closeSpModal();
    } catch (err) {
      if (window.showError) window.showError("Signaleringsplan opslaan mislukt: " + (err && err.message || err));
    }
  }
  document.getElementById("cd-sp-add-btn")?.addEventListener("click", function () { openSpModal(null); });
  document.getElementById("cd-sp-modal-close")?.addEventListener("click", closeSpModal);
  document.getElementById("cd-sp-cancel-btn")?.addEventListener("click", closeSpModal);
  document.getElementById("cd-sp-save-btn")?.addEventListener("click", function (e) { e.preventDefault(); saveSignaleringsplanFromForm(); });
  document.getElementById("cd-sp-form")?.addEventListener("submit", function (e) { e.preventDefault(); saveSignaleringsplanFromForm(); });
  if (spModal) spModal.addEventListener("click", function (e) { if (e.target === spModal) closeSpModal(); });

  document.getElementById("cd-sp-list")?.addEventListener("click", async function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".cd-sp-act") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var id = btn.getAttribute("data-id");
    var plan = spCache.find(function (p) { return p && String(p.id) === String(id); });
    if (!plan) return;
    if (act === "bewerken") { openSpModal(plan); return; }
    if (act === "activeer") {
      var ok = await window.showSliderConfirmModal({
        title: "Signaleringsplan activeren? Een eerder actief plan wordt vervangen.",
        preview: "Signaleringsplan",
        okLabel: "Activeren",
        cancelLabel: "Annuleren",
      });
      if (!ok) return;
      try {
        await window.signaleringsplannenDB.activeer(id);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Signaleringsplan actief");
        renderSignaleringsplannen();
        renderAiKaart();
      } catch (err) {
        if (window.showError) window.showError("Activeren mislukt: " + (err && err.message || err));
      }
      return;
    }
    if (act === "archiveer") {
      var okArc = await window.showArchiveConfirm({ preview: "Signaleringsplan" });
      if (!okArc) return;
      try {
        await window.signaleringsplannenDB.archive(id);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Signaleringsplan");
        renderSignaleringsplannen();
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });
  window.addEventListener("besa:signaleringsplannen-updated", function () {
    if (pans.s && !pans.s.hidden) renderSignaleringsplannen();
  });

  // ============================================================
  // CONTACTLOGBOEK-tab (fase 3, §14)
  // ============================================================

  var clCache = [];
  var clTypeFilter = "";

  async function renderContactlog() {
    var tbody = document.getElementById("cd-cl-tbody");
    var empty = document.getElementById("cd-cl-empty");
    if (!tbody || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var rows = await window.clientContactlogDB.fetchVoorClient(cl.id);
    clCache = rows;
    var userId = await f3CurrentUserId();
    var ctx = null;
    try { ctx = await ensureReisContext(); } catch (e) { ctx = null; }
    var kanBeoordelen = !!(ctx && ctx.kan_beoordelen);

    var zichtbaar = rows.filter(function (r) {
      if (!r || r.archived) return false;
      if (clTypeFilter && String(r.type || "") !== clTypeFilter) return false;
      return true;
    });

    tbody.innerHTML = zichtbaar.map(function (r) {
      var magBewerken = kanBeoordelen || (userId && r.created_by === userId);
      var acties = magBewerken
        ? '<button type="button" class="btn-outline cd-cl-edit-btn" data-id="' + escapeAttr(r.id) + '">Bewerken</button>' +
          '<button type="button" class="employee-delete-btn cd-cl-archive-btn" data-id="' + escapeAttr(r.id) + '" aria-label="Archiveren">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'
        : "";
      var datumTekst = escapeHtml(formatDateNL(r.datum)) + (r.tijd ? " " + escapeHtml(String(r.tijd).slice(0, 5)) : "");
      return '<tr data-id="' + escapeAttr(r.id) + '">' +
        '<td data-col="datum">' + datumTekst + '</td>' +
        '<td data-col="type">' + escapeHtml(window.clientContactlogDB.typeLabel(r.type)) + '</td>' +
        '<td data-col="metwie">' + escapeHtml(r.met_wie || "—") + '</td>' +
        '<td data-col="onderwerp">' + escapeHtml(r.onderwerp || "—") + '</td>' +
        '<td data-col="door">' + escapeHtml(r.created_by_naam || "—") + '</td>' +
        '<td data-col="acties" class="cd-rap-actions-cell">' + acties + '</td>' +
      '</tr>';
    }).join("");
    empty.hidden = zichtbaar.length > 0;
  }

  var clModal = document.getElementById("cd-cl-modal");
  function openClModal(rec) {
    if (!clModal) return;
    var titelEl = document.getElementById("cd-cl-modal-title");
    document.getElementById("cd-cl-f-id").value = rec && rec.id ? rec.id : "";
    document.getElementById("cd-cl-f-type").value = rec ? (rec.type || "oudergesprek") : "oudergesprek";
    document.getElementById("cd-cl-f-datum").value = rec && rec.datum ? rec.datum : localTodayIso();
    document.getElementById("cd-cl-f-tijd").value = rec && rec.tijd ? String(rec.tijd).slice(0, 5) : "";
    document.getElementById("cd-cl-f-metwie").value = rec ? (rec.met_wie || "") : "";
    document.getElementById("cd-cl-f-onderwerp").value = rec ? (rec.onderwerp || "") : "";
    document.getElementById("cd-cl-f-verslag").value = rec ? (rec.verslag || "") : "";
    document.getElementById("cd-cl-f-vervolg").value = rec ? (rec.vervolgacties || "") : "";
    if (titelEl) titelEl.textContent = rec && rec.id ? "Contactmoment bewerken" : "Contactmoment toevoegen";
    clModal.hidden = false;
    clModal.setAttribute("aria-hidden", "false");
    try { document.getElementById("cd-cl-f-onderwerp").focus(); } catch (e) { /* */ }
  }
  function closeClModal() {
    if (!clModal) return;
    clModal.hidden = true;
    clModal.setAttribute("aria-hidden", "true");
  }
  // Lokale vandaag-datum (toISOString geeft UTC-datumshift — bekende valkuil).
  function localTodayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  async function saveContactlogFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var onderwerpEl = document.getElementById("cd-cl-f-onderwerp");
    var onderwerp = (onderwerpEl.value || "").trim();
    if (!onderwerp) { try { onderwerpEl.focus(); } catch (e) {} return; }
    var rec = {
      clientId: cl.id,
      type: document.getElementById("cd-cl-f-type").value || "overig",
      datum: document.getElementById("cd-cl-f-datum").value || null,
      tijd: document.getElementById("cd-cl-f-tijd").value || null,
      metWie: (document.getElementById("cd-cl-f-metwie").value || "").trim(),
      onderwerp: onderwerp,
      verslag: (document.getElementById("cd-cl-f-verslag").value || "").trim(),
      vervolgacties: (document.getElementById("cd-cl-f-vervolg").value || "").trim(),
    };
    try {
      var id = document.getElementById("cd-cl-f-id").value;
      if (id) {
        await window.clientContactlogDB.update(id, rec);
      } else {
        await window.clientContactlogDB.add(rec);
      }
      if (window.showActionFeedback) window.showActionFeedback("saved", "Contactmoment");
      closeClModal();
    } catch (err) {
      if (window.showError) window.showError("Contactmoment opslaan mislukt: " + (err && err.message || err));
    }
  }
  document.getElementById("cd-cl-add-btn")?.addEventListener("click", function () { openClModal(null); });
  document.getElementById("cd-cl-modal-close")?.addEventListener("click", closeClModal);
  document.getElementById("cd-cl-cancel-btn")?.addEventListener("click", closeClModal);
  document.getElementById("cd-cl-save-btn")?.addEventListener("click", function (e) { e.preventDefault(); saveContactlogFromForm(); });
  document.getElementById("cd-cl-form")?.addEventListener("submit", function (e) { e.preventDefault(); saveContactlogFromForm(); });
  if (clModal) clModal.addEventListener("click", function (e) { if (e.target === clModal) closeClModal(); });
  document.getElementById("cd-cl-filter-type")?.addEventListener("change", function () {
    clTypeFilter = this.value || "";
    renderContactlog();
  });
  document.getElementById("cd-cl-tbody")?.addEventListener("click", async function (e) {
    var editBtn = e.target.closest(".cd-cl-edit-btn");
    var arcBtn = e.target.closest(".cd-cl-archive-btn");
    if (editBtn) {
      var rec = clCache.find(function (r) { return r && String(r.id) === String(editBtn.getAttribute("data-id")); });
      if (rec) openClModal(rec);
      return;
    }
    if (arcBtn) {
      var aid = arcBtn.getAttribute("data-id");
      var rec2 = clCache.find(function (r) { return r && String(r.id) === String(aid); });
      if (!rec2) return;
      try {
        var ok = await window.showArchiveConfirm({ preview: rec2.onderwerp || "Contactmoment" });
        if (!ok) return;
        await window.clientContactlogDB.archive(aid);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Contactmoment");
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });
  window.addEventListener("besa:client-contactlog-updated", function () {
    if (pans.g && !pans.g.hidden) renderContactlog();
  });

  // ============================================================
  // INCIDENTEN & KWALITEIT-tab (fase 3, §6): echte cliënt-lijsten
  // ============================================================

  var INC_STATUS_LABEL = { in_afwachting: "In afwachting", in_behandeling: "In behandeling", opgelost: "Opgelost" };
  var KLA_STATUS_LABEL = { nieuw: "Nieuw", in_behandeling: "In behandeling", afgehandeld: "Afgehandeld" };

  function renderKwaliteit() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    // Incidenten (RLS bepaalt wat de ingelogde rol mag zien)
    var incTbody = document.getElementById("cd-inc-tbody");
    var incEmpty = document.getElementById("cd-inc-empty");
    if (incTbody && incEmpty) {
      var incidenten = (window.incidentenDB && typeof window.incidentenDB.getAllSync === "function")
        ? window.incidentenDB.getAllSync() : [];
      var incRows = incidenten.filter(function (i) {
        return i && !i.archived && String(i.clientId || "") === String(cl.id);
      });
      incRows.sort(function (a, b) {
        return String(b.incidentDatum || b.aanmaakdatum || "") < String(a.incidentDatum || a.aanmaakdatum || "") ? -1 : 1;
      });
      incTbody.innerHTML = incRows.map(function (i) {
        var datum = i.incidentDatum || i.aanmaakdatum || null;
        var oms = String(i.omschrijving || "");
        if (oms.length > 120) oms = oms.slice(0, 117) + "…";
        return '<tr>' +
          '<td data-col="datum">' + escapeHtml(datum ? formatDateNL(String(datum).slice(0, 10)) : "—") + '</td>' +
          '<td data-col="categorie">' + escapeHtml(i.categorie || "—") + '</td>' +
          '<td data-col="status">' + escapeHtml(INC_STATUS_LABEL[String(i.status || "")] || i.status || "—") + '</td>' +
          '<td data-col="omschrijving">' + escapeHtml(oms || "—") + '</td>' +
        '</tr>';
      }).join("");
      incEmpty.hidden = incRows.length > 0;
    }

    // Klachten gekoppeld aan deze cliënt
    var klaTbody = document.getElementById("cd-kla-tbody");
    var klaEmpty = document.getElementById("cd-kla-empty");
    if (klaTbody && klaEmpty) {
      var klachten = (window.klachtenDB && typeof window.klachtenDB.getAllSync === "function")
        ? window.klachtenDB.getAllSync() : [];
      var klaRows = klachten.filter(function (k) {
        return k && !k.archived && String(k.clientId || "") === String(cl.id);
      });
      klaTbody.innerHTML = klaRows.map(function (k) {
        return '<tr>' +
          '<td data-col="ontvangen">' + escapeHtml(k.ontvangenOp ? formatDateNL(String(k.ontvangenOp).slice(0, 10)) : "—") + '</td>' +
          '<td data-col="onderwerp">' + escapeHtml(k.onderwerp || "—") + '</td>' +
          '<td data-col="status">' + escapeHtml(KLA_STATUS_LABEL[String(k.status || "")] || k.status || "—") + '</td>' +
          '<td data-col="prioriteit">' + escapeHtml(k.prioriteit || "—") + '</td>' +
        '</tr>';
      }).join("");
      klaEmpty.hidden = klaRows.length > 0;
    }

    // Verbetermaatregelen gekoppeld aan deze cliënt
    var vmTbody = document.getElementById("cd-vm-tbody");
    var vmEmpty = document.getElementById("cd-vm-empty");
    if (vmTbody && vmEmpty) {
      var maatregelen = (window.verbeteringsmaatregelenDB && typeof window.verbeteringsmaatregelenDB.getAllSync === "function")
        ? window.verbeteringsmaatregelenDB.getAllSync() : [];
      var vmRows = maatregelen.filter(function (m) {
        return m && !m.archived && String(m.clientId || "") === String(cl.id);
      });
      vmTbody.innerHTML = vmRows.map(function (m) {
        return '<tr>' +
          '<td data-col="titel">' + escapeHtml(m.titel || "—") + '</td>' +
          '<td data-col="vervaldatum">' + escapeHtml(m.vervaldatum ? formatDateNL(String(m.vervaldatum).slice(0, 10)) : "—") + '</td>' +
          '<td data-col="status">' + escapeHtml(m.afgerond ? "Afgerond" : "Open") + '</td>' +
        '</tr>';
      }).join("");
      vmEmpty.hidden = vmRows.length > 0;
    }
  }
  ["besa:incidenten-updated", "besa:klachten-updated", "besa:verbeteringsmaatregelen-updated"].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (pans.i && !pans.i.hidden) renderKwaliteit();
    });
  });

  // ============================================================
  // AI-CLIËNTSAMENVATTING (fase 3, §7) — deterministische RPC
  // ============================================================

  async function renderAiKaart() {
    var kaart = document.getElementById("cd-ai-kaart");
    var body = document.getElementById("cd-ai-body");
    if (!kaart || !body) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    try {
      if (window.besaSupabaseReady) { try { await window.besaSupabaseReady; } catch (e) { /* */ } }
      var r = await window.besaSupabase.rpc("client_ai_samenvatting", { p_client_id: cl.id });
      if (r.error) throw r.error;
      var d = r.data || {};
      if (!d.ok) { craSetVisible(kaart, false); return; }

      var punten = Array.isArray(d.aandachtspunten) ? d.aandachtspunten : [];
      var puntenHtml = punten.length
        ? '<ul class="cd-ai-punten">' + punten.map(function (p) {
            var ernst = p && (p.ernst === "rood" || p.ernst === "oranje") ? p.ernst : "info";
            return '<li class="cd-ai-punt cd-ai-punt--' + ernst + '">' + escapeHtml((p && p.tekst) || "") + '</li>';
          }).join("") + '</ul>'
        : '<p class="cd-ai-ok">Geen aandachtspunten — het dossier is op orde.</p>';

      var feiten = [];
      if (d.zorgplan) {
        feiten.push('<span class="cd-ai-feit"><strong>Zorgplan:</strong> ' + escapeHtml(d.zorgplan.titel || "actief") +
          ' (' + Number(d.zorgplan.doelen_behaald || 0) + '/' + Number(d.zorgplan.doelen_totaal || 0) + ' doelen behaald)</span>');
        if (d.zorgplan.hulpvraag) {
          var hv = String(d.zorgplan.hulpvraag);
          if (hv.length > 160) hv = hv.slice(0, 157) + "…";
          feiten.push('<span class="cd-ai-feit"><strong>Hulpvraag:</strong> ' + escapeHtml(hv) + '</span>');
        }
      } else {
        feiten.push('<span class="cd-ai-feit"><strong>Zorgplan:</strong> geen actief plan</span>');
      }
      feiten.push('<span class="cd-ai-feit"><strong>Signaleringsplan:</strong> ' + (d.signaleringsplan_actief ? "actief" : "geen") + '</span>');
      if (d.beschikking) {
        feiten.push('<span class="cd-ai-feit"><strong>Beschikking:</strong> nog ' + Number(d.beschikking.dagen_resterend) + ' dagen</span>');
      }
      var inc = d.incidenten || {};
      feiten.push('<span class="cd-ai-feit"><strong>Incidenten (30d):</strong> ' + Number(inc.laatste_30d || 0) + '</span>');
      if (d.laatste_rapportage) {
        feiten.push('<span class="cd-ai-feit"><strong>Laatste rapportage:</strong> ' + escapeHtml(formatDateNL(d.laatste_rapportage.datum)) + '</span>');
      }
      if (d.laatste_contact) {
        feiten.push('<span class="cd-ai-feit"><strong>Laatste contactmoment:</strong> ' + escapeHtml(formatDateNL(d.laatste_contact)) + '</span>');
      }

      body.innerHTML = puntenHtml + '<div class="cd-ai-feiten">' + feiten.join("") + '</div>';
      craSetVisible(kaart, true);
    } catch (err) {
      // Geen rechten of fout → kaart stil verbergen (samenvatting is een extraatje).
      craSetVisible(kaart, false);
    }
  }
  document.getElementById("cd-ai-refresh")?.addEventListener("click", function () {
    var body = document.getElementById("cd-ai-body");
    if (body) body.innerHTML = '<p class="client-detail-hint">Samenvatting laden…</p>';
    renderAiKaart();
  });
  renderAiKaart();

  // ============================================================
  // DOSSIER-ISSUES-kaart (fase 4, §12) — uit client_dossier_controle cron
  // ============================================================

  async function renderIssuesKaart() {
    var kaart = document.getElementById("cd-issues-kaart");
    var lijst = document.getElementById("cd-issues-lijst");
    if (!kaart || !lijst) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    try {
      if (window.besaSupabaseReady) { try { await window.besaSupabaseReady; } catch (e) { /* */ } }
      var r = await window.besaSupabase.rpc("client_dossier_issues_voor_client", { p_client_id: cl.id });
      if (r.error) { craSetVisible(kaart, false); return; }
      var rows = Array.isArray(r.data) ? r.data : [];
      if (!rows.length) { craSetVisible(kaart, false); return; }
      lijst.innerHTML = rows.map(function (i) {
        var ernst = i.ernst === "rood" || i.ernst === "oranje" ? i.ernst : "info";
        return '<li class="cd-ai-punt cd-ai-punt--' + ernst + '">' + escapeHtml(i.tekst || "") + '</li>';
      }).join("");
      craSetVisible(kaart, true);
    } catch (e) {
      craSetVisible(kaart, false);
    }
  }
  renderIssuesKaart();

  // ============================================================
  // TEAM-blok in de vcard (fase 3, client_medewerkers)
  // ============================================================

  var teamCache = [];

  async function renderTeam() {
    var lijst = document.getElementById("cd-team-list");
    var hint = document.getElementById("cd-team-hint");
    var addBtn = document.getElementById("cd-team-add-btn");
    if (!lijst || !hint) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var ctx = null;
    try { ctx = await ensureReisContext(); } catch (e) { ctx = null; }
    var kanBeoordelen = !!(ctx && ctx.kan_beoordelen);
    if (addBtn) craSetVisible(addBtn, kanBeoordelen);

    var rows = await window.clientMedewerkersDB.fetchVoorClient(cl.id);
    teamCache = rows;
    lijst.innerHTML = rows.map(function (t) {
      var del = kanBeoordelen
        ? '<button type="button" class="modal-close cd-team-del" data-id="' + escapeAttr(t.id) + '" aria-label="Koppeling verwijderen"><span aria-hidden="true">&times;</span></button>'
        : "";
      return '<li class="cd-team-item">' +
        '<span class="cd-team-naam">' + escapeHtml(t.naam) + '</span>' +
        '<span class="cd-team-rol">' + escapeHtml(window.clientMedewerkersDB.rolLabel(t.rol)) + '</span>' +
        del +
      '</li>';
    }).join("");
    craSetVisible(hint, rows.length === 0);
  }

  var teamModal = document.getElementById("cd-team-modal");
  function openTeamModal() {
    if (!teamModal) return;
    var sel = document.getElementById("cd-team-f-mw");
    if (sel) {
      var medewerkers = (window.medewerkersDB && typeof window.medewerkersDB.getAllSync === "function")
        ? window.medewerkersDB.getAllSync() : [];
      var actief = medewerkers.filter(function (m) { return m && !m.archived; });
      actief.sort(function (a, b) {
        var an = ((a.achternaam || "") + " " + (a.voornaam || "")).toLowerCase();
        var bn = ((b.achternaam || "") + " " + (b.voornaam || "")).toLowerCase();
        return an.localeCompare(bn, "nl");
      });
      sel.innerHTML = "";
      var ph = document.createElement("option");
      ph.value = "";
      ph.textContent = "— Kies een medewerker —";
      sel.appendChild(ph);
      actief.forEach(function (m) {
        var o = document.createElement("option");
        o.value = m.id;
        o.textContent = ((m.achternaam || "") + ", " + (m.voornaam || "")).replace(/^, /, "") + (m.functie ? " — " + m.functie : "");
        sel.appendChild(o);
      });
    }
    document.getElementById("cd-team-f-rol").value = "begeleider";
    teamModal.hidden = false;
    teamModal.setAttribute("aria-hidden", "false");
  }
  function closeTeamModal() {
    if (!teamModal) return;
    teamModal.hidden = true;
    teamModal.setAttribute("aria-hidden", "true");
  }
  document.getElementById("cd-team-add-btn")?.addEventListener("click", openTeamModal);
  document.getElementById("cd-team-modal-close")?.addEventListener("click", closeTeamModal);
  document.getElementById("cd-team-cancel-btn")?.addEventListener("click", closeTeamModal);
  if (teamModal) teamModal.addEventListener("click", function (e) { if (e.target === teamModal) closeTeamModal(); });
  document.getElementById("cd-team-save-btn")?.addEventListener("click", async function () {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var mwId = document.getElementById("cd-team-f-mw").value;
    var rol = document.getElementById("cd-team-f-rol").value;
    if (!mwId) { try { document.getElementById("cd-team-f-mw").focus(); } catch (e) {} return; }
    this.disabled = true;
    try {
      await window.clientMedewerkersDB.add({ clientId: cl.id, medewerkerId: mwId, rol: rol });
      if (window.showActionFeedback) window.showActionFeedback("saved", "Teamlid gekoppeld");
      closeTeamModal();
      renderTeam();
    } catch (err) {
      if (window.showError) window.showError("Koppelen mislukt: " + (err && err.message || err));
    }
    this.disabled = false;
  });
  document.getElementById("cd-team-list")?.addEventListener("click", async function (e) {
    var del = e.target && e.target.closest ? e.target.closest(".cd-team-del") : null;
    if (!del) return;
    var id = del.getAttribute("data-id");
    var t = teamCache.find(function (x) { return x && String(x.id) === String(id); });
    if (!t) return;
    var ok = await window.showSliderConfirmModal({
      title: "Teamlid ontkoppelen van deze cliënt?",
      preview: t.naam + " (" + window.clientMedewerkersDB.rolLabel(t.rol) + ")",
      okLabel: "Ontkoppelen",
      cancelLabel: "Annuleren",
    });
    if (!ok) return;
    try {
      await window.clientMedewerkersDB.remove(id);
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Teamkoppeling");
      renderTeam();
    } catch (err) {
      if (window.showError) window.showError("Ontkoppelen mislukt: " + (err && err.message || err));
    }
  });
  renderTeam();

  // ============================================================
  // MEDICATIE-tab: medicatielijst + aftekenlijst (clientMedicatieDB)
  // ============================================================

  var MED_DAGDEEL_LABEL = { ochtend: "Ochtend", middag: "Middag", avond: "Avond" };
  var MED_DAGDEEL_ORDER = ["ochtend", "middag", "avond"];
  var MED_WEEKDAG_LABEL = { 1: "Ma", 2: "Di", 3: "Wo", 4: "Do", 5: "Vr", 6: "Za", 7: "Zo" };
  var medSelectedDate = medTodayISO();
  var medAftSeq = 0;

  function medTodayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function medAddDays(iso, n) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function medIsoWeekday(iso) {
    var d = new Date(iso + "T00:00:00");
    var wd = d.getDay(); // 0=zo..6=za
    return wd === 0 ? 7 : wd;
  }
  function medTimeHM(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function medSortedDagdelen(arr) {
    var set = {};
    (arr || []).forEach(function (x) { set[x] = 1; });
    return MED_DAGDEEL_ORDER.filter(function (d) { return set[d]; });
  }
  function medDagenLabel(weekdagen) {
    var w = (weekdagen || []).slice().sort(function (a, b) { return a - b; });
    if (w.length === 0 || w.length === 7) return "Elke dag";
    return w.map(function (n) { return MED_WEEKDAG_LABEL[n] || n; }).join(", ");
  }
  function medActiefOpDatum(med, iso) {
    if (!med || !med.actief || med.archived) return false;
    if (med.startdatum && iso < med.startdatum) return false;
    if (med.einddatum && iso > med.einddatum) return false;
    if (Array.isArray(med.weekdagen) && med.weekdagen.length) {
      if (med.weekdagen.indexOf(medIsoWeekday(iso)) < 0) return false;
    }
    return true;
  }

  function medGetForClient(cl) {
    if (!cl) return [];
    if (!(window.clientMedicatieDB && typeof window.clientMedicatieDB.getForClientSync === "function")) return [];
    return window.clientMedicatieDB.getForClientSync(cl.id).filter(function (r) { return r && !r.archived; });
  }

  function renderMedicatie() {
    var tbody = document.getElementById("cd-med-tbody");
    var empty = document.getElementById("cd-med-empty");
    if (!tbody || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var rows = medGetForClient(cl).sort(function (a, b) {
      return String(a.naam || "").localeCompare(String(b.naam || ""), "nl");
    });

    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var dagdelen = medSortedDagdelen(r.dagdelen);
      var dagdeelChips = dagdelen.length
        ? dagdelen.map(function (d) { return '<span class="cd-med-chip">' + escapeHtml(MED_DAGDEEL_LABEL[d] || d) + "</span>"; }).join(" ")
        : '<span class="cd-med-muted">—</span>';
      var periode = (r.startdatum || r.einddatum)
        ? escapeHtml((r.startdatum ? formatDateNL(r.startdatum) : "…") + " – " + (r.einddatum ? formatDateNL(r.einddatum) : "…"))
        : "—";
      var aftekenenBadge = r.aftekenen
        ? '<span class="cd-med-pill cd-med-pill--on">Ja</span>'
        : '<span class="cd-med-pill cd-med-pill--off">Nee</span>';
      var actiefMark = r.actief ? "" : ' <span class="cd-med-pill cd-med-pill--off">Inactief</span>';
      var sub = [];
      if (r.vorm) sub.push(escapeHtml(r.vorm));
      if (r.instructie) sub.push(escapeHtml(r.instructie));
      var naamCell = "<strong>" + escapeHtml(r.naam || "—") + "</strong>" + actiefMark +
        (sub.length ? '<div class="cd-med-rowsub">' + sub.join(" · ") + "</div>" : "");
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", r.id);
      tr.innerHTML =
        '<td data-col="naam">' + naamCell + "</td>" +
        '<td data-col="dosering">' + escapeHtml(r.dosering || "—") + "</td>" +
        '<td data-col="dagdelen">' + dagdeelChips + "</td>" +
        '<td data-col="dagen">' + escapeHtml(medDagenLabel(r.weekdagen)) + "</td>" +
        '<td data-col="periode">' + periode + "</td>" +
        '<td data-col="aftekenen">' + aftekenenBadge + "</td>" +
        '<td data-col="acties" class="cd-med-actions-cell">' +
          '<button type="button" class="btn-outline cd-med-edit-btn" data-id="' + r.id + '">Bewerken</button>' +
          '<button type="button" class="employee-delete-btn cd-med-archive-btn" data-id="' + r.id + '" aria-label="Archiveren">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
            "</svg>" +
          "</button>" +
        "</td>";
      tbody.appendChild(tr);
    });
    empty.hidden = rows.length > 0;

    var dateEl = document.getElementById("cd-med-date");
    if (dateEl && dateEl.value !== medSelectedDate) dateEl.value = medSelectedDate;
    renderMedAftekenlijst();
  }

  function medAftStatusCell(med, dagdeel, aft) {
    var btnGeg = '<button type="button" class="cd-med-aft-btn cd-med-aft-btn--geg' +
      (aft && aft.status === "gegeven" ? " is-active" : "") + '" data-med="' + med.id +
      '" data-dagdeel="' + dagdeel + '" data-act="gegeven">Gegeven</button>';
    var btnNg = '<button type="button" class="cd-med-aft-btn cd-med-aft-btn--ng' +
      (aft && aft.status === "niet_gegeven" ? " is-active" : "") + '" data-med="' + med.id +
      '" data-dagdeel="' + dagdeel + '" data-act="niet_gegeven">Niet gegeven</button>';

    var info = "";
    if (aft && aft.status === "gegeven") {
      info = '<span class="cd-med-aft-badge cd-med-aft-badge--geg">✓ Gegeven</span>' +
        '<span class="cd-med-aft-meta">' +
        (aft.afgetekendDoor ? escapeHtml(aft.afgetekendDoor) : "") +
        (aft.afgetekendOp ? (aft.afgetekendDoor ? " · " : "") + medTimeHM(aft.afgetekendOp) : "") + "</span>";
    } else if (aft && aft.status === "niet_gegeven") {
      info = '<span class="cd-med-aft-badge cd-med-aft-badge--ng">Niet gegeven</span>' +
        (aft.reden ? '<span class="cd-med-aft-meta">' + escapeHtml(aft.reden) + "</span>" : "");
    } else if (aft && aft.status === "gemist") {
      info = '<span class="cd-med-aft-badge cd-med-aft-badge--gemist">Gemist</span>' +
        '<span class="cd-med-aft-meta"><a href="incidenten.html" class="cd-med-aft-incident">Incident aangemaakt</a></span>';
    } else {
      info = '<span class="cd-med-aft-badge cd-med-aft-badge--open">Open</span>';
    }

    return '<div class="cd-med-aft-cell">' +
      '<div class="cd-med-aft-dagdeel">' + escapeHtml(MED_DAGDEEL_LABEL[dagdeel] || dagdeel) + "</div>" +
      '<div class="cd-med-aft-status">' + info + "</div>" +
      '<div class="cd-med-aft-acts">' + btnGeg + btnNg + "</div>" +
      "</div>";
  }

  async function renderMedAftekenlijst() {
    var listEl = document.getElementById("cd-med-aft-list");
    var emptyEl = document.getElementById("cd-med-aft-empty");
    if (!listEl || !emptyEl) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var iso = medSelectedDate;
    var meds = medGetForClient(cl).filter(function (m) {
      return m.aftekenen && medSortedDagdelen(m.dagdelen).length > 0 && medActiefOpDatum(m, iso);
    });

    if (meds.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    listEl.innerHTML = '<p class="cd-med-muted">Laden…</p>';

    var seq = ++medAftSeq;
    var afts = [];
    try {
      afts = await window.clientMedicatieDB.fetchAftekeningen(cl.id, iso);
    } catch (err) {
      if (seq !== medAftSeq) return;
      listEl.innerHTML = '<p class="cd-med-muted">Aftekeningen laden mislukt.</p>';
      return;
    }
    if (seq !== medAftSeq) return; // datum is inmiddels gewijzigd

    var byKey = {};
    afts.forEach(function (a) { byKey[a.medicatieId + "|" + a.dagdeel] = a; });

    listEl.innerHTML = meds.map(function (m) {
      var cells = medSortedDagdelen(m.dagdelen).map(function (d) {
        return medAftStatusCell(m, d, byKey[m.id + "|" + d]);
      }).join("");
      var subtitle = [];
      if (m.dosering) subtitle.push(escapeHtml(m.dosering));
      if (m.instructie) subtitle.push(escapeHtml(m.instructie));
      return '<div class="cd-med-aft-card">' +
        '<div class="cd-med-aft-cardhead">' +
          '<span class="cd-med-aft-naam">' + escapeHtml(m.naam || "—") + "</span>" +
          (subtitle.length ? '<span class="cd-med-aft-cardsub">' + subtitle.join(" · ") + "</span>" : "") +
        "</div>" +
        '<div class="cd-med-aft-cells">' + cells + "</div>" +
        "</div>";
    }).join("");
  }

  // ---- Medicatie modal -------------------------------------------------------
  var medModal = document.getElementById("cd-med-modal");
  var medForm = document.getElementById("cd-med-form");
  var medTitle = document.getElementById("cd-med-modal-title");
  var medFId = document.getElementById("cd-med-f-id");
  var medFNaam = document.getElementById("cd-med-f-naam");
  var medFDosering = document.getElementById("cd-med-f-dosering");
  var medFVorm = document.getElementById("cd-med-f-vorm");
  var medFInstructie = document.getElementById("cd-med-f-instructie");
  var medFNotitie = document.getElementById("cd-med-f-notitie");
  var medFStart = document.getElementById("cd-med-f-start");
  var medFEind = document.getElementById("cd-med-f-eind");
  var medFAftekenen = document.getElementById("cd-med-f-aftekenen");
  var medFActief = document.getElementById("cd-med-f-actief");

  function medSetChecks(containerId, values) {
    var cont = document.getElementById(containerId);
    if (!cont) return;
    var want = (values || []).map(String);
    cont.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.checked = want.indexOf(cb.value) >= 0;
    });
  }
  function medGetChecks(containerId) {
    var cont = document.getElementById(containerId);
    if (!cont) return [];
    var out = [];
    cont.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked) out.push(cb.value);
    });
    return out;
  }

  function openMedModal(rec) {
    if (!medModal) return;
    if (rec && rec.id) {
      if (medTitle) medTitle.textContent = "Medicatie bewerken";
      medFId.value = rec.id;
      medFNaam.value = rec.naam || "";
      medFDosering.value = rec.dosering || "";
      medFVorm.value = rec.vorm || "";
      medFInstructie.value = rec.instructie || "";
      medFNotitie.value = rec.notitie || "";
      medFStart.value = rec.startdatum || "";
      medFEind.value = rec.einddatum || "";
      medFAftekenen.checked = rec.aftekenen !== false;
      medFActief.checked = rec.actief !== false;
      medSetChecks("cd-med-f-dagdelen", medSortedDagdelen(rec.dagdelen));
      medSetChecks("cd-med-f-weekdagen", (rec.weekdagen && rec.weekdagen.length ? rec.weekdagen : [1, 2, 3, 4, 5, 6, 7]).map(String));
    } else {
      if (medTitle) medTitle.textContent = "Medicatie toevoegen";
      if (medForm) medForm.reset();
      medFId.value = "";
      medFAftekenen.checked = true;
      medFActief.checked = true;
      medSetChecks("cd-med-f-dagdelen", []);
      medSetChecks("cd-med-f-weekdagen", ["1", "2", "3", "4", "5", "6", "7"]);
    }
    medModal.hidden = false;
    medModal.setAttribute("aria-hidden", "false");
    try { medFNaam.focus(); } catch (e) { /* */ }
  }
  function closeMedModal() {
    if (!medModal) return;
    medModal.hidden = true;
    medModal.setAttribute("aria-hidden", "true");
  }

  async function saveMedFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var naam = (medFNaam.value || "").trim();
    if (!naam) { try { medFNaam.focus(); } catch (e) {} return; }
    var dagdelen = medGetChecks("cd-med-f-dagdelen");
    var weekdagen = medGetChecks("cd-med-f-weekdagen").map(function (x) { return parseInt(x, 10); });
    if (medFAftekenen.checked && dagdelen.length === 0) {
      if (window.showError) window.showError("Kies minstens één dagdeel waarop afgetekend moet worden.");
      return;
    }
    var rec = {
      clientId: cl.id,
      naam: naam,
      dosering: (medFDosering.value || "").trim(),
      vorm: (medFVorm.value || "").trim(),
      instructie: (medFInstructie.value || "").trim(),
      notitie: (medFNotitie.value || "").trim(),
      dagdelen: dagdelen,
      weekdagen: weekdagen,
      startdatum: medFStart.value || null,
      einddatum: medFEind.value || null,
      aftekenen: !!medFAftekenen.checked,
      actief: !!medFActief.checked,
    };
    try {
      var id = medFId.value;
      if (id) {
        await window.clientMedicatieDB.update(id, rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Medicatie");
      } else {
        await window.clientMedicatieDB.add(rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Medicatie toegevoegd");
      }
      closeMedModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    }
  }

  // ---- Niet-gegeven modal ----------------------------------------------------
  var medNgModal = document.getElementById("cd-med-ng-modal");
  function openMedNgModal(medId, dagdeel) {
    if (!medNgModal) return;
    var med = window.clientMedicatieDB && window.clientMedicatieDB.getByIdSync(medId);
    document.getElementById("cd-med-ng-medid").value = medId;
    document.getElementById("cd-med-ng-datum").value = medSelectedDate;
    document.getElementById("cd-med-ng-dagdeel").value = dagdeel;
    document.getElementById("cd-med-ng-reden").value = "";
    var info = document.getElementById("cd-med-ng-info");
    if (info) {
      info.textContent = (med ? med.naam : "Medicatie") + " — " + (MED_DAGDEEL_LABEL[dagdeel] || dagdeel) +
        " · " + formatDateNL(medSelectedDate);
    }
    medNgModal.hidden = false;
    medNgModal.setAttribute("aria-hidden", "false");
    try { document.getElementById("cd-med-ng-reden").focus(); } catch (e) { /* */ }
  }
  function closeMedNgModal() {
    if (!medNgModal) return;
    medNgModal.hidden = true;
    medNgModal.setAttribute("aria-hidden", "true");
  }
  async function saveMedNg() {
    var medId = document.getElementById("cd-med-ng-medid").value;
    var datum = document.getElementById("cd-med-ng-datum").value;
    var dagdeel = document.getElementById("cd-med-ng-dagdeel").value;
    var reden = (document.getElementById("cd-med-ng-reden").value || "").trim();
    try {
      await window.clientMedicatieDB.afteken(medId, datum, dagdeel, "niet_gegeven", reden || null, null);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Vastgelegd");
      closeMedNgModal();
      renderMedAftekenlijst();
    } catch (err) {
      if (window.showError) window.showError("Vastleggen mislukt: " + (err && err.message || err));
    }
  }

  async function medAftekenGegeven(medId, dagdeel) {
    try {
      await window.clientMedicatieDB.afteken(medId, medSelectedDate, dagdeel, "gegeven", null, null);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Afgetekend");
      renderMedAftekenlijst();
    } catch (err) {
      if (window.showError) window.showError("Aftekenen mislukt: " + (err && err.message || err));
    }
  }

  // ---- Wiring ----------------------------------------------------------------
  document.getElementById("cd-med-add-btn")?.addEventListener("click", function () { openMedModal(null); });
  document.getElementById("cd-med-modal-close")?.addEventListener("click", closeMedModal);
  document.getElementById("cd-med-cancel-btn")?.addEventListener("click", closeMedModal);
  document.getElementById("cd-med-save-btn")?.addEventListener("click", function (e) { e.preventDefault(); saveMedFromForm(); });
  if (medForm) medForm.addEventListener("submit", function (e) { e.preventDefault(); saveMedFromForm(); });
  if (medModal) medModal.addEventListener("click", function (e) { if (e.target === medModal) closeMedModal(); });

  document.getElementById("cd-med-ng-close")?.addEventListener("click", closeMedNgModal);
  document.getElementById("cd-med-ng-cancel")?.addEventListener("click", closeMedNgModal);
  document.getElementById("cd-med-ng-save")?.addEventListener("click", function (e) { e.preventDefault(); saveMedNg(); });
  if (medNgModal) medNgModal.addEventListener("click", function (e) { if (e.target === medNgModal) closeMedNgModal(); });

  // Medicatielijst row-acties
  document.getElementById("cd-med-tbody")?.addEventListener("click", async function (e) {
    var editBtn = e.target.closest(".cd-med-edit-btn");
    var arcBtn = e.target.closest(".cd-med-archive-btn");
    if (editBtn) {
      var rec = window.clientMedicatieDB && window.clientMedicatieDB.getByIdSync(editBtn.getAttribute("data-id"));
      if (rec) openMedModal(rec);
      return;
    }
    if (arcBtn) {
      var aid = arcBtn.getAttribute("data-id");
      var rec2 = window.clientMedicatieDB && window.clientMedicatieDB.getByIdSync(aid);
      if (!rec2) return;
      try {
        var ok = await window.showArchiveConfirm({ preview: rec2.naam || "Medicatie" });
        if (!ok) return;
        await window.clientMedicatieDB.archive(aid);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Medicatie");
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });

  // Aftekenlijst-acties (Gegeven / Niet gegeven)
  document.getElementById("cd-med-aft-list")?.addEventListener("click", function (e) {
    var btn = e.target.closest(".cd-med-aft-btn");
    if (!btn) return;
    var medId = btn.getAttribute("data-med");
    var dagdeel = btn.getAttribute("data-dagdeel");
    var act = btn.getAttribute("data-act");
    if (act === "gegeven") medAftekenGegeven(medId, dagdeel);
    else if (act === "niet_gegeven") openMedNgModal(medId, dagdeel);
  });

  // Datum-navigatie aftekenlijst
  document.getElementById("cd-med-prev")?.addEventListener("click", function () {
    medSelectedDate = medAddDays(medSelectedDate, -1);
    var d = document.getElementById("cd-med-date"); if (d) d.value = medSelectedDate;
    renderMedAftekenlijst();
  });
  document.getElementById("cd-med-next")?.addEventListener("click", function () {
    medSelectedDate = medAddDays(medSelectedDate, 1);
    var d = document.getElementById("cd-med-date"); if (d) d.value = medSelectedDate;
    renderMedAftekenlijst();
  });
  document.getElementById("cd-med-today")?.addEventListener("click", function () {
    medSelectedDate = medTodayISO();
    var d = document.getElementById("cd-med-date"); if (d) d.value = medSelectedDate;
    renderMedAftekenlijst();
  });
  document.getElementById("cd-med-date")?.addEventListener("change", function (e) {
    var v = e.target.value;
    if (v) { medSelectedDate = v; renderMedAftekenlijst(); }
  });

  // Live-refresh
  window.addEventListener("besa:client-medicatie-updated", function () {
    var panM = document.getElementById("cd-pan-m");
    if (panM && !panM.hidden) renderMedicatie();
  });
  window.addEventListener("besa:client-medicatie-aftekening-updated", function () {
    var panM = document.getElementById("cd-pan-m");
    if (panM && !panM.hidden) renderMedAftekenlijst();
  });

  // ============================================================
  // VRAGENLIJSTEN-tab: render + CRUD via clientVragenlijstenDB
  // ============================================================

  function statusBadgeVrl(status) {
    var s = String(status || "openstaand").toLowerCase();
    var cls = "cd-vrl-status";
    var label = "Openstaand";
    if (s === "ingevuld") { cls += " cd-vrl-status--ingevuld"; label = "Ingevuld"; }
    else { cls += " cd-vrl-status--openstaand"; }
    return '<span class="' + cls + '">' + escapeHtml(label) + '</span>';
  }

  function renderVragenlijsten() {
    var tbody = document.getElementById("cd-vrl-tbody");
    var empty = document.getElementById("cd-vrl-empty");
    if (!tbody || !empty) return;
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;

    var rows = (window.clientVragenlijstenDB && typeof window.clientVragenlijstenDB.getForClientSync === "function")
      ? window.clientVragenlijstenDB.getForClientSync(cl.id).filter(function (r) { return r && !r.archived; })
      : [];

    rows.sort(function (a, b) {
      var da = a.ingevuldDatum || a.aanmaakdatum || "";
      var db = b.ingevuldDatum || b.aanmaakdatum || "";
      return da < db ? 1 : da > db ? -1 : 0;
    });

    tbody.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", r.id);
      var qaCount = Array.isArray(r.vragenAntwoorden) ? r.vragenAntwoorden.length : 0;
      var beantwoord = Array.isArray(r.vragenAntwoorden)
        ? r.vragenAntwoorden.filter(function (qa) { return qa && qa.antwoord && String(qa.antwoord).trim(); }).length
        : 0;
      var tmplLabel = r.templateNaam ? (r.templateNaam.charAt(0).toUpperCase() + r.templateNaam.slice(1)) : "Eigen";
      tr.innerHTML =
        '<td data-col="naam">' + escapeHtml(r.naam || "—") + '</td>' +
        '<td data-col="template">' + escapeHtml(tmplLabel) + '</td>' +
        '<td data-col="status">' + statusBadgeVrl(r.status) + '</td>' +
        '<td data-col="ingevuld">' + escapeHtml(formatDateNL(r.ingevuldDatum)) + '</td>' +
        '<td data-col="vragen">' + beantwoord + ' / ' + qaCount + '</td>' +
        '<td data-col="acties" class="cd-vrl-actions-cell">' +
          '<button type="button" class="btn-outline cd-vrl-edit-btn" data-id="' + r.id + '">Bewerken</button>' +
          '<button type="button" class="employee-delete-btn cd-vrl-archive-btn" data-id="' + r.id + '" aria-label="Archiveren">' +
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
  var vrlModal = document.getElementById("cd-vrl-modal");
  var vrlForm = document.getElementById("cd-vrl-form");
  var vrlTitle = document.getElementById("cd-vrl-modal-title");
  var vrlFId = document.getElementById("cd-vrl-f-id");
  var vrlFNaam = document.getElementById("cd-vrl-f-naam");
  var vrlFTemplate = document.getElementById("cd-vrl-f-template");
  var vrlFStatus = document.getElementById("cd-vrl-f-status");
  var vrlFDatum = document.getElementById("cd-vrl-f-datum");
  var vrlQaList = document.getElementById("cd-vrl-qa-list");

  function renderQaList(qa) {
    if (!vrlQaList) return;
    vrlQaList.innerHTML = "";
    qa.forEach(function (item, idx) {
      var div = document.createElement("div");
      div.className = "cd-vrl-qa-item";
      div.innerHTML =
        '<div class="cd-vrl-qa-head">' +
          '<input type="text" class="modal-input cd-vrl-qa-vraag" placeholder="Vraag" data-idx="' + idx + '" data-field="vraag" value="' + escapeAttr(item.vraag || "") + '" />' +
          '<button type="button" class="cd-vrl-qa-remove" data-idx="' + idx + '" aria-label="Verwijderen">&times;</button>' +
        '</div>' +
        '<textarea class="modal-input cd-vrl-qa-antwoord" placeholder="Antwoord" rows="2" data-idx="' + idx + '" data-field="antwoord">' + escapeHtml(item.antwoord || "") + '</textarea>';
      vrlQaList.appendChild(div);
    });
  }

  function readQaFromForm() {
    if (!vrlQaList) return [];
    var items = vrlQaList.querySelectorAll(".cd-vrl-qa-item");
    var out = [];
    items.forEach(function (div) {
      var v = div.querySelector(".cd-vrl-qa-vraag");
      var a = div.querySelector(".cd-vrl-qa-antwoord");
      out.push({
        vraag: v ? String(v.value || "").trim() : "",
        antwoord: a ? String(a.value || "").trim() : "",
      });
    });
    return out;
  }

  function openVrlModal(rec) {
    if (!vrlModal) return;
    if (rec && rec.id) {
      if (vrlTitle) vrlTitle.textContent = "Vragenlijst bewerken";
      vrlFId.value = rec.id;
      vrlFNaam.value = rec.naam || "";
      vrlFTemplate.value = rec.templateNaam || "";
      vrlFStatus.value = rec.status || "openstaand";
      vrlFDatum.value = rec.ingevuldDatum || "";
      renderQaList(Array.isArray(rec.vragenAntwoorden) ? rec.vragenAntwoorden : []);
    } else {
      if (vrlTitle) vrlTitle.textContent = "Vragenlijst toevoegen";
      vrlForm.reset();
      vrlFId.value = "";
      vrlFStatus.value = "openstaand";
      renderQaList([]);
    }
    vrlModal.hidden = false;
    vrlModal.setAttribute("aria-hidden", "false");
    try { vrlFNaam.focus(); } catch (e) { /* */ }
  }
  function closeVrlModal() {
    if (!vrlModal) return;
    vrlModal.hidden = true;
    vrlModal.setAttribute("aria-hidden", "true");
  }

  async function saveVragenlijstFromForm() {
    var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
    if (!cl) return;
    var naam = (vrlFNaam.value || "").trim();
    if (!naam) { try { vrlFNaam.focus(); } catch (e) {} return; }

    var qa = readQaFromForm().filter(function (item) { return item.vraag || item.antwoord; });

    var rec = {
      clientId: cl.id,
      naam: naam,
      templateNaam: vrlFTemplate.value || null,
      status: vrlFStatus.value || "openstaand",
      ingevuldDatum: vrlFDatum.value || null,
      vragenAntwoorden: qa,
    };

    try {
      var id = vrlFId.value;
      if (id) {
        await window.clientVragenlijstenDB.update(id, rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Vragenlijst");
      } else {
        await window.clientVragenlijstenDB.add(rec);
        if (window.showActionFeedback) window.showActionFeedback("saved", "Vragenlijst toegevoegd");
      }
      closeVrlModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    }
  }

  // Template-change: pre-fill vragen
  if (vrlFTemplate) {
    vrlFTemplate.addEventListener("change", function () {
      var key = vrlFTemplate.value;
      if (!key || !window.clientVragenlijstenDB) return;
      var tmpl = window.clientVragenlijstenDB.getTemplateSync(key);
      if (!tmpl) return;
      // Vraag voor confirmatie als er al vragen waren (slider-modal, geen browser-popup)
      var currentQa = readQaFromForm();
      var hasContent = currentQa.some(function (q) { return q.vraag || q.antwoord; });
      if (hasContent) {
        (async function () {
          var go = await window.showSliderConfirmModal({
            title: "Vragen vervangen?",
            preview: tmpl.naam + " — " + tmpl.vragen.length + " vragen",
            okLabel: "Ja, vervangen",
            cancelLabel: "Behoud huidig",
          });
          if (!go) return;
          // Vervang met template
          if (!vrlFNaam.value.trim()) vrlFNaam.value = tmpl.naam;
          renderQaList(tmpl.vragen.map(function (v) { return { vraag: v, antwoord: "" }; }));
        })();
      } else {
        if (!vrlFNaam.value.trim()) vrlFNaam.value = tmpl.naam;
        renderQaList(tmpl.vragen.map(function (v) { return { vraag: v, antwoord: "" }; }));
      }
    });
  }

  // QA list: add + remove buttons
  document.getElementById("cd-vrl-qa-add")?.addEventListener("click", function () {
    var current = readQaFromForm();
    current.push({ vraag: "", antwoord: "" });
    renderQaList(current);
    // Focus op het nieuwe vraag-veld
    setTimeout(function () {
      var inputs = vrlQaList.querySelectorAll(".cd-vrl-qa-vraag");
      if (inputs.length) {
        try { inputs[inputs.length - 1].focus(); } catch (e) { /* */ }
      }
    }, 0);
  });

  if (vrlQaList) {
    vrlQaList.addEventListener("click", function (e) {
      var rm = e.target.closest(".cd-vrl-qa-remove");
      if (!rm) return;
      var idx = parseInt(rm.getAttribute("data-idx"), 10);
      if (isNaN(idx)) return;
      var current = readQaFromForm();
      current.splice(idx, 1);
      renderQaList(current);
    });
  }

  // Event wiring
  document.getElementById("cd-vrl-add-btn")?.addEventListener("click", function () { openVrlModal(null); });
  document.getElementById("cd-vrl-modal-close")?.addEventListener("click", closeVrlModal);
  document.getElementById("cd-vrl-cancel-btn")?.addEventListener("click", closeVrlModal);
  document.getElementById("cd-vrl-save-btn")?.addEventListener("click", function (e) {
    e.preventDefault();
    saveVragenlijstFromForm();
  });
  if (vrlForm) {
    vrlForm.addEventListener("submit", function (e) {
      e.preventDefault();
      saveVragenlijstFromForm();
    });
  }
  if (vrlModal) {
    vrlModal.addEventListener("click", function (e) {
      if (e.target === vrlModal) closeVrlModal();
    });
  }

  // Row-actions: edit + archive
  document.getElementById("cd-vrl-tbody")?.addEventListener("click", async function (e) {
    var editBtn = e.target.closest(".cd-vrl-edit-btn");
    var arcBtn = e.target.closest(".cd-vrl-archive-btn");
    if (editBtn) {
      var rec = window.clientVragenlijstenDB && window.clientVragenlijstenDB.getByIdSync(editBtn.getAttribute("data-id"));
      if (rec) openVrlModal(rec);
      return;
    }
    if (arcBtn) {
      var aid = arcBtn.getAttribute("data-id");
      var rec2 = window.clientVragenlijstenDB && window.clientVragenlijstenDB.getByIdSync(aid);
      if (!rec2) return;
      try {
        var ok = await window.showArchiveConfirm({ preview: rec2.naam || "Vragenlijst" });
        if (!ok) return;
        await window.clientVragenlijstenDB.archive(aid);
        if (window.showActionFeedback) window.showActionFeedback("archived", "Vragenlijst");
      } catch (err) {
        if (window.showError) window.showError("Archiveren mislukt: " + (err && err.message || err));
      }
    }
  });

  // Live-refresh
  window.addEventListener("besa:client-vragenlijsten-updated", function () {
    var panQ = document.getElementById("cd-pan-q");
    if (panQ && !panQ.hidden) renderVragenlijsten();
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
    var faseVal = document.getElementById("cd-f-fase").value || "in zorg";
    var uitZorgVal = isoFromDateInput(document.getElementById("cd-f-ui").value);
    // Uitplaatsing: fase "uit zorg" zonder ingevulde datum → automatisch vandaag.
    // Dit mag ook terwijl een beschikking nog loopt (geen blokkade).
    if (faseVal === "uit zorg" && !uitZorgVal) {
      uitZorgVal = isoFromDateInput(new Date().toISOString().slice(0, 10));
    }
    var next = {
      id: c.id,
      voornaam: (document.getElementById("cd-f-vn").value || "").trim(),
      achternaam: (document.getElementById("cd-f-an").value || "").trim(),
      clientnummer: Math.max(1, parseInt(document.getElementById("cd-f-nr").value, 10) || 1),
      locatie: (locSel && locSel.value) ? locSel.value : "",
      fase: faseVal,
      inZorgDatum: isoFromDateInput(document.getElementById("cd-f-izd").value),
      uitZorgDatum: uitZorgVal,
      gemeente: (document.getElementById("cd-f-gem").value || "").trim(),
      organisatie: (orgSel && orgSel.value) ? orgSel.value : "",
      hoofdaannemer: (haSel && haSel.value) ? haSel.value : "",
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
      gedragswetenschapper_email: (function () {
        var s = document.getElementById("cd-srch-gw");
        return (s && s.value) ? String(s.value) : "";
      })(),
      gedragswetenschapper_naam: (function () {
        var s = document.getElementById("cd-srch-gw");
        if (!s || !s.value) return "";
        var o = s.options[s.selectedIndex];
        return o ? String(o.textContent || "").replace(/\s*\(niet meer in lijst\)\s*$/, "").trim() : "";
      })(),
      gedragswetenschapperZoek: (function () {
        var s = document.getElementById("cd-srch-gw");
        if (!s || !s.value) return "";
        var o = s.options[s.selectedIndex];
        return o ? String(o.textContent || "").replace(/\s*\(niet meer in lijst\)\s*$/, "").trim() : "";
      })(),
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
    // reis_status kan server-side gewijzigd zijn door de fase-sync-trigger;
    // re-render de pill uit de actuele cache (update() ververst die na de save).
    syncReisPill();
  });

  (function initClientBeschikkingen() {
    var cdbTable = document.getElementById("cdb-table");
    if (!cdbTable) return;
    var cdbTbody = document.getElementById("cdb-tbody");
    var cdbSearch = document.getElementById("cdb-search");
    var cdb60 = document.getElementById("cdb-60d");
    var cdbColBtn = document.getElementById("cdb-columns-btn");
    var cdbColPanel = document.getElementById("cdb-columns-panel");
    var cdbExport = document.getElementById("cdb-export-btn");
    var cdbAdd = document.getElementById("cdb-add-btn");
    var cdbRange = document.getElementById("cdb-pager-range");
    var cdbEmpty = document.getElementById("cdb-filter-empty");
    var cdbThead = cdbTable.querySelector("thead");
    var bescSortKey = "periode";
    var bescSortDir = "asc";

    // Tarief-kolom is rol-gegate (Finance/Cliëntbeheer/admin-tier).
    // Fail-closed: tot besaPermissionsReady besloten heeft renderen we niets,
    // daarna wordt de kolom (incl. header + kolomkiezer-item) definitief
    // verwijderd wanneer de gebruiker hem niet mag zien.
    var cdbKanTariefZien = false;
    var cdbTariefBeslist = false;

    var CDB_FASE_LABELS = {
      in_aanvraag: "In aanvraag",
      verlopen: "Verlopen",
      in_zorg: "In zorg",
      uit_zorg: "Uit zorg",
      in_dienst: "In dienst",
      uit_dienst: "Uit dienst",
      actief: "Actief",
    };

    function cdbFaseLabel(f) {
      var s = String(f || "").toLowerCase();
      return CDB_FASE_LABELS[s] || (f != null && String(f).trim() !== "" ? String(f).trim() : "—");
    }

    function cdbFaseDotClass(f) {
      return (typeof window.besaFaseBescDotClass === "function")
        ? window.besaFaseBescDotClass(f)
        : "bdtl-fase-dot bdtl-fase-dot--fase-onbekend";
    }

    // Lokale yyyy-mm-dd — bewust geen toISOString (UTC-datumshift-valkuil).
    function cdbIsoLocal(d) {
      var m = d.getMonth() + 1;
      var dd = d.getDate();
      return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (dd < 10 ? "0" + dd : dd);
    }

    function cdbFmtDateNl(iso) {
      if (!iso) return "—";
      var s = String(iso).slice(0, 10);
      var p = s.split("-");
      if (p.length !== 3) return s;
      return p[2] + "-" + p[1] + "-" + p[0];
    }

    function cdbFmtPeriode(b) {
      if (!b.startISO && !b.eindISO) return "—";
      return cdbFmtDateNl(b.startISO) + " – " + cdbFmtDateNl(b.eindISO);
    }

    // Verloop-badge: verlopen of <=30 dagen rood, <=60 oranje, <=90 geel,
    // anders geen badge. Vergelijking op lokale iso-strings/dag-delta.
    function cdbVerloop(eindISO) {
      if (!eindISO) return null;
      var eind = String(eindISO).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eind)) return null;
      var vandaag = cdbIsoLocal(new Date());
      if (eind < vandaag) return { cls: "cdb2-verloop--rood", label: "Verlopen", dagen: -1 };
      var pe = eind.split("-");
      var pv = vandaag.split("-");
      var de = new Date(parseInt(pe[0], 10), parseInt(pe[1], 10) - 1, parseInt(pe[2], 10));
      var dv = new Date(parseInt(pv[0], 10), parseInt(pv[1], 10) - 1, parseInt(pv[2], 10));
      var diff = Math.round((de.getTime() - dv.getTime()) / 86400000);
      if (diff <= 30) return { cls: "cdb2-verloop--rood", label: "≤ 30 d", dagen: diff };
      if (diff <= 60) return { cls: "cdb2-verloop--oranje", label: "≤ 60 d", dagen: diff };
      if (diff <= 90) return { cls: "cdb2-verloop--geel", label: "≤ 90 d", dagen: diff };
      return null;
    }

    function cdbEindBinnen60(eindISO) {
      var v = cdbVerloop(eindISO);
      return !!(v && v.dagen >= 0 && v.dagen <= 60);
    }

    function cdbFmtUren(b) {
      var u = b.toegekendUren;
      if (u == null || isNaN(Number(u))) return "—";
      var n = Math.round(Number(u) * 100) / 100;
      var s = String(n).replace(".", ",");
      var een = String(b.toegekendEenheid || "").toLowerCase();
      var suffix = een === "week" ? "p/w" : een === "maand" ? "p/mnd" : een === "totaal" ? "totaal" : "";
      return s + " u" + (suffix ? " " + suffix : "");
    }

    function cdbFmtTarief(b) {
      var t = Number(b.tariefEur || 0);
      if (!t || isNaN(t)) return "—";
      var u = b.tariefEenheid || "uur";
      return "€ " + t.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " /" + u;
    }

    function cdbZoekNorm(b) {
      return ((b.naam || "") + " " + (b.productcode || "") + " " + (b.gemeente || "") + " " +
        (b.zorgsoortLabel || "") + " " + (b.declMeth || "")).toLowerCase();
    }

    // Beschikkingen van deze cliënt: match op clienten.id én (voor
    // BS2-geïmporteerde rijen) op de bs2-uuid die plat op het cliënt-object
    // staat (clienten-data.js spreidt data-jsonb top-level → cl.bs2_id).
    function cdbGetRows() {
      var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
      if (!cl) return [];
      var bs2 = cl.bs2_id ? String(cl.bs2_id) : (cl.data && cl.data.bs2_id ? String(cl.data.bs2_id) : "");
      var all = (window.beschikkingenDB && typeof window.beschikkingenDB.getAllSync === "function")
        ? window.beschikkingenDB.getAllSync()
        : (typeof getBeschikkingenItems === "function" ? getBeschikkingenItems() : []);
      return (all || []).filter(function (b) {
        if (!b || b.gearchiveerd) return false;
        var cid = String(b.clientId || "");
        if (!cid) return false;
        return cid === String(cl.id) || (bs2 && cid === bs2);
      });
    }

    function cdbGefilterd() {
      var q = cdbSearch && cdbSearch.value ? cdbSearch.value.toLowerCase().trim() : "";
      var only60 = cdb60 && cdb60.checked;
      return cdbGetRows().filter(function (b) {
        if (q && cdbZoekNorm(b).indexOf(q) === -1) return false;
        if (only60 && !cdbEindBinnen60(b.eindISO)) return false;
        return true;
      });
    }

    // --- Sorteren (op de gerenderde rijen) ------------------------------------
    function bescGetCellSortValue(tr, col) {
      if (col === "periode") return tr.getAttribute("data-besc-start") || "";
      var td = tr.querySelector('td[data-col="' + col + '"]');
      if (!td) return "";
      var raw = (td.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
      if (col === "tarief" || col === "uren") {
        var m = raw.replace(/\./g, "").match(/(\d+)(?:,(\d+))?/);
        if (m) return parseFloat(m[1] + "." + (m[2] || "0"));
        return -1;
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
      rows.sort(function (a, b) {
        var av = bescGetCellSortValue(a, bescSortKey);
        var bv = bescGetCellSortValue(b, bescSortKey);
        var cv = bescCmp(av, bv);
        return bescSortDir === "desc" ? -cv : cv;
      });
      rows.forEach(function (r) { cdbTbody.appendChild(r); });
      if (cdbEmpty) cdbTbody.appendChild(cdbEmpty);
    }

    function bescSyncSortTh() {
      cdbTable.querySelectorAll("thead th.th-sort").forEach(function (th) {
        th.classList.remove("th-sort--asc", "th-sort--desc", "th-sort-open");
        var cn = th.getAttribute("data-col");
        if (cn && cn === bescSortKey) {
          th.classList.add(bescSortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
        }
      });
    }

    // --- Kolomkiezer ----------------------------------------------------------
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

    // --- Zoeken + 60d-toggle (filtert de gerenderde rijen client-side) -------
    function updateBescFilterUi() {
      if (!cdbTbody) return;
      var q = cdbSearch && cdbSearch.value ? cdbSearch.value.toLowerCase().trim() : "";
      var only60 = cdb60 && cdb60.checked;
      var nVis = 0;
      var nTot = 0;
      cdbTbody.querySelectorAll("tr.cdb-data-row").forEach(function (tr) {
        nTot += 1;
        var t = (tr.getAttribute("data-besc-naam-norm") || tr.textContent || "").toLowerCase();
        var mSearch = !q || t.indexOf(q) !== -1;
        var binnen = tr.getAttribute("data-besc-binnen-60") === "1";
        var m60 = !only60 || binnen;
        var on = mSearch && m60;
        tr.style.display = on ? "" : "none";
        if (on) nVis += 1;
      });
      if (cdbEmpty) cdbEmpty.style.display = nVis === 0 ? "table-row" : "none";
      if (cdbRange) cdbRange.textContent = nVis + " van " + nTot + " totaal";
    }

    // --- Render (live uit beschikkingenDB) ------------------------------------
    function cdbRender() {
      if (!cdbTbody) return;
      cdbTbody.querySelectorAll("tr.cdb-data-row").forEach(function (tr) { tr.remove(); });
      var rows = cdbGetRows();
      rows.forEach(function (b) {
        var tr = document.createElement("tr");
        tr.className = "cdb-data-row cdb2-row";
        tr.setAttribute("data-besc-id", b.id || "");
        tr.setAttribute("data-besc-start", b.startISO || "");
        tr.setAttribute("data-besc-binnen-60", cdbEindBinnen60(b.eindISO) ? "1" : "0");
        tr.setAttribute("data-besc-naam-norm", cdbZoekNorm(b));
        tr.setAttribute("tabindex", "0");
        var verloop = cdbVerloop(b.eindISO);
        var html =
          '<td data-col="naam">' + escapeHtml(b.naam || "—") + "</td>" +
          '<td data-col="productcode">' + escapeHtml(b.productcode || "—") + "</td>" +
          '<td data-col="gemeente">' + escapeHtml(b.gemeente || "—") + "</td>" +
          '<td data-col="periode">' + escapeHtml(cdbFmtPeriode(b)) + "</td>" +
          '<td data-col="uren">' + escapeHtml(cdbFmtUren(b)) + "</td>" +
          '<td data-col="status"><span class="cdb2-fase"><span class="' + escapeHtml(cdbFaseDotClass(b.fase)) + '" aria-hidden="true"></span>' + escapeHtml(cdbFaseLabel(b.fase)) + "</span></td>" +
          '<td data-col="verloop">' + (verloop ? '<span class="cdb2-verloop ' + verloop.cls + '">' + escapeHtml(verloop.label) + "</span>" : "") + "</td>";
        if (cdbKanTariefZien) {
          html += '<td data-col="tarief">' + escapeHtml(cdbFmtTarief(b)) + "</td>";
        }
        tr.innerHTML = html;
        cdbTbody.insertBefore(tr, cdbEmpty || null);
      });
      bescSortDataRows();
      applyBescColumns();
      updateBescFilterUi();
    }

    renderClientBeschikkingenTab = function () {
      if (cdbTariefBeslist) cdbRender();
    };

    // --- Tarief-gate (na besaPermissionsReady; fail-closed) -------------------
    function cdbApplyTariefGate() {
      if (cdbKanTariefZien) return;
      var th = document.getElementById("cdb-th-tarief");
      if (th) th.remove();
      var li = document.getElementById("cdb-coltoggle-tarief");
      if (li) li.remove();
      var td = cdbEmpty && cdbEmpty.querySelector("td");
      if (td) td.setAttribute("colspan", "7");
    }

    (function cdbInitTariefGate() {
      var ready = (window.besaPermissionsReady && typeof window.besaPermissionsReady.then === "function")
        ? window.besaPermissionsReady
        : Promise.resolve();
      ready.then(function () {
        cdbKanTariefZien = !!(
          (typeof window.besaIsAdminTier === "function" && window.besaIsAdminTier()) ||
          (window.besaPermissions && typeof window.besaPermissions.hasAnyRole === "function" &&
            window.besaPermissions.hasAnyRole(["Finance", "Cliëntbeheer"]))
        );
      }).catch(function () {
        cdbKanTariefZien = false;
      }).then(function () {
        cdbTariefBeslist = true;
        cdbApplyTariefGate();
        cdbRender();
      });
    })();

    // Live verversen wanneer de beschikkingen-data wijzigt (alleen als de tab
    // zichtbaar is; bij tab-activatie rendert setTab sowieso opnieuw).
    window.addEventListener("besa:beschikkingen-updated", function () {
      if (!cdbTariefBeslist) return;
      var pan = document.getElementById("cd-pan-b");
      if (pan && !pan.hidden) cdbRender();
    });

    if (cdbSearch) cdbSearch.addEventListener("input", updateBescFilterUi);
    if (cdb60) cdb60.addEventListener("change", updateBescFilterUi);

    // Rij-klik → beschikking-detail
    if (cdbTbody) {
      cdbTbody.addEventListener("click", function (e) {
        var t = e.target;
        if (t && t.closest && t.closest("button, input, a")) return;
        var tr = t && t.closest && t.closest("tr.cdb-data-row");
        if (!tr) return;
        var id = tr.getAttribute("data-besc-id");
        if (id) window.location.href = "beschikking-detail.html?id=" + encodeURIComponent(id);
      });
      cdbTbody.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var tr = e.target && e.target.closest && e.target.closest("tr.cdb-data-row");
        if (!tr) return;
        var id = tr.getAttribute("data-besc-id");
        if (id) window.location.href = "beschikking-detail.html?id=" + encodeURIComponent(id);
      });
    }

    // --- Kolomkiezer-panel open/dicht -----------------------------------------
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

    // --- Export (echt, via window.besaExport) ---------------------------------
    var CDB_EXPORT_COLS = [
      { col: "naam", label: "Naam / product", get: function (b) { return b.naam || ""; } },
      { col: "productcode", label: "Productcode", get: function (b) { return b.productcode || ""; } },
      { col: "gemeente", label: "Gemeente", get: function (b) { return b.gemeente || ""; } },
      { col: "periode", label: "Periode", get: function (b) { return cdbFmtPeriode(b); } },
      { col: "uren", label: "Uren", get: function (b) { return cdbFmtUren(b); } },
      { col: "status", label: "Status", get: function (b) { return cdbFaseLabel(b.fase); } },
      { col: "verloop", label: "Verloop", get: function (b) { var v = cdbVerloop(b.eindISO); return v ? v.label : ""; } },
      { col: "tarief", label: "Tarief", get: function (b) { return cdbFmtTarief(b); } },
    ];

    function cdbDoExport() {
      if (typeof window.besaExport !== "function") {
        if (typeof window.showActionFeedback === "function") {
          window.showActionFeedback("error", "Export", "Export-module is niet geladen.");
        }
        return;
      }
      var cols = CDB_EXPORT_COLS.filter(function (cdef) {
        return cdef.col !== "tarief" || cdbKanTariefZien;
      });
      var rows = cdbGefilterd();
      var cl = (typeof getClientenById === "function" && getClientenById(qid)) || c;
      var nm = cl ? ((cl.voornaam || "") + " " + (cl.achternaam || "")).trim() : "";
      var data = rows.map(function (b) {
        var o = {};
        cols.forEach(function (cdef) { o[cdef.label] = cdef.get(b); });
        return o;
      });
      window.besaExport({
        filename: "beschikkingen" + (nm ? "-" + nm.toLowerCase().replace(/\s+/g, "-") : ""),
        title: "Beschikkingen" + (nm ? " — " + nm : ""),
        data: data,
        columns: cols.map(function (cdef) { return cdef.label; }),
      });
    }
    if (cdbExport) {
      cdbExport.addEventListener("click", function (e) {
        e.preventDefault();
        cdbDoExport();
      });
    }

    // --- "+ Beschikking toevoegen"-modal (bestaand gedrag) ---------------------
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
            if (cdbTariefBeslist) cdbRender();
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
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (cdbAddModal && !cdbAddModal.hasAttribute("hidden")) cdbCloseAddBescModal();
    });
    if (cdbAdd) {
      cdbAdd.addEventListener("click", function (e) {
        e.preventDefault();
        cdbOpenAddBescModal();
      });
    }

    // --- Sorteren via header-klik ----------------------------------------------
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
