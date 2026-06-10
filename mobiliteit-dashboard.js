/* global window, document */
/**
 * mobiliteit-dashboard.js — single-page rol-gegate mobiliteit-dashboard.
 *
 * Views (rol-gegate): Financieel (Finance/Salarisadministratie + admin-tier),
 * Eigenaar (admin-tier), Planning (Planner + admin-tier), HR-controle
 * (HR + admin-tier), AI-signaleringen (HR/Planner/Finance + admin-tier).
 *
 * Aggregaties komen uit SECURITY DEFINER-RPC's (km_dash_*, km_planning_reiskosten,
 * km_hr_controle). De signaleringen-engine (km_genereer_signaleringen) is
 * deterministische heuristiek — geen LLM.
 */
(function (global) {
  "use strict";
  var doc = global.document;
  function $(id) { return doc.getElementById(id); }

  var eurFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  var kmFmt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
  var intFmt = new Intl.NumberFormat("nl-NL");
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmtEur(v) { return eurFmt.format(num(v)); }
  function fmtKm(v) { return kmFmt.format(num(v)) + " km"; }
  function fmtInt(v) { return intFmt.format(Math.round(num(v))); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Lokale yyyy-mm-dd (NIET toISOString → die schuift in UTC een dag terug,
  // waardoor de 1e van de maand als de 31e van de vorige maand zou tellen).
  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  // ── Toegang per rol ────────────────────────────────────────────────────────
  var TAB_ROLES = {
    financieel: ["Finance", "Salarisadministratie"],
    eigenaar: [],                       // alleen admin-tier
    planning: ["Planner"],
    hr: ["HR"],
    signaleringen: ["HR", "Planner", "Finance"],
  };
  var TAB_ORDER = ["financieel", "eigenaar", "planning", "hr", "signaleringen"];
  var visibleTabs = [];
  var activeTab = null;

  function adminTier() { try { return !!(global.besaIsAdminTier && global.besaIsAdminTier()); } catch (e) { return false; } }
  function hasAnyRole(roles) {
    try { return !!(global.besaPermissions && global.besaPermissions.hasAnyRole(roles)); } catch (e) { return false; }
  }
  function canSeeTab(tab) {
    if (adminTier()) return true;
    return hasAnyRole(TAB_ROLES[tab] || []);
  }

  function currentProfileId() {
    try { var p = global.profilesDB && global.profilesDB.getCurrentSync(); return p ? p.id : null; } catch (e) { return null; }
  }

  // ── RPC-helper ──────────────────────────────────────────────────────────────
  async function rpc(name, args) {
    if (!global.besaSupabase) throw new Error("Supabase niet geladen");
    var res = await global.besaSupabase.rpc(name, args || {});
    if (res.error) throw res.error;
    return res.data;
  }

  // ── Periode ──────────────────────────────────────────────────────────────────
  // Default-bereik: 1e van de vorige maand t/m vandaag (toont recente activiteit
  // i.p.v. een lege "deze maand" vroeg in de maand). De vandaag/week/maand-KPI's
  // in de Financieel-view blijven los hiervan altijd actueel.
  function defaultRange() {
    var now = new Date();
    return {
      van: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      tot: isoDate(now),
    };
  }
  function periode() {
    var f = ($("mob-date-from") || {}).value || "";
    var t = ($("mob-date-to") || {}).value || "";
    if (!f || !t) return defaultRange();
    return { van: f, tot: t };
  }

  // ── Renderhelpers ────────────────────────────────────────────────────────────
  function rowsToTbody(tbodyId, rows, cols, emptyText) {
    var tb = $(tbodyId);
    if (!tb) return;
    if (!rows || !rows.length) {
      tb.innerHTML = '<tr><td colspan="' + cols + '" class="mob-td-empty">' + esc(emptyText || "Geen gegevens in deze periode.") + "</td></tr>";
      return;
    }
    tb.innerHTML = rows.join("");
  }

  // ── FINANCIEEL ───────────────────────────────────────────────────────────────
  async function loadFinancieel() {
    var p = periode();
    var now = new Date();
    var vandaag = isoDate(now);
    var weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // maandag
    var maandStart = new Date(now.getFullYear(), now.getMonth(), 1);
    try {
      var resVandaag = await rpc("km_dash_totalen", { p_van: vandaag, p_tot: vandaag });
      var resWeek = await rpc("km_dash_totalen", { p_van: isoDate(weekStart), p_tot: vandaag });
      var resMaand = await rpc("km_dash_totalen", { p_van: isoDate(maandStart), p_tot: vandaag });
      var resPer = await rpc("km_dash_totalen", { p_van: p.van, p_tot: p.tot });
      var rv = (resVandaag && resVandaag[0]) || {}, rw = (resWeek && resWeek[0]) || {};
      var rm = (resMaand && resMaand[0]) || {}, rp = (resPer && resPer[0]) || {};
      $("mob-fin-vandaag").textContent = fmtEur(rv.total_eur);
      $("mob-fin-week").textContent = fmtEur(rw.total_eur);
      $("mob-fin-maand").textContent = fmtEur(rm.total_eur);
      $("mob-fin-periode").textContent = fmtEur(rp.total_eur);
      $("mob-fin-periode-km").textContent = fmtKm(rp.total_km);

      var locs = await rpc("km_dash_per_locatie", { p_van: p.van, p_tot: p.tot });
      rowsToTbody("mob-fin-locatie", (locs || []).slice(0, 25).map(function (r) {
        return "<tr><td>" + esc(r.locatie_naam) + '</td><td class="mob-num">' + fmtKm(r.km) + '</td><td class="mob-num">' + fmtInt(r.ritten) + '</td><td class="mob-num">' + fmtEur(r.eur) + "</td></tr>";
      }), 4);

      var clients = await rpc("km_dash_per_client", { p_van: p.van, p_tot: p.tot });
      rowsToTbody("mob-fin-client", (clients || []).slice(0, 25).map(function (r) {
        return "<tr><td>" + esc(r.client_naam) + '</td><td class="mob-num">' + fmtKm(r.km) + '</td><td class="mob-num">' + fmtInt(r.ritten) + '</td><td class="mob-num">' + fmtEur(r.eur) + "</td></tr>";
      }), 4, "Nog geen zakelijke ritten met cliëntkoppeling in deze periode.");

      var mws = await rpc("km_dash_per_medewerker", { p_van: p.van, p_tot: p.tot });
      rowsToTbody("mob-fin-medewerker", (mws || []).slice(0, 25).map(function (r) {
        return "<tr><td>" + esc(r.medewerker_naam) + '</td><td class="mob-num">' + fmtKm(r.km) + '</td><td class="mob-num">' + fmtInt(r.ritten) + '</td><td class="mob-num">' + fmtEur(r.eur) + "</td></tr>";
      }), 4);
    } catch (err) { reportErr("Financieel", err); }
  }

  // ── EIGENAAR ─────────────────────────────────────────────────────────────────
  async function loadEigenaar() {
    var p = periode();
    try {
      var res = await rpc("km_dash_totalen", { p_van: p.van, p_tot: p.tot });
      var r = (res && res[0]) || {};
      $("mob-eig-totaal").textContent = fmtEur(r.total_eur);
      $("mob-eig-totaal-km").textContent = fmtKm(r.total_km);
      $("mob-eig-woonwerk").textContent = fmtEur(r.woonwerk_eur);
      $("mob-eig-woonwerk-km").textContent = fmtKm(r.woonwerk_km);
      $("mob-eig-zakelijk").textContent = fmtEur(r.zakelijk_eur);
      $("mob-eig-zakelijk-km").textContent = fmtKm(r.zakelijk_km);

      var locs = await rpc("km_dash_per_locatie", { p_van: p.van, p_tot: p.tot });
      locs = locs || [];
      var totEur = locs.reduce(function (a, x) { return a + num(x.eur); }, 0);
      var gem = locs.length ? totEur / locs.length : 0;
      $("mob-eig-gemloc").textContent = fmtEur(gem);
      rowsToTbody("mob-eig-locatie", locs.slice(0, 10).map(function (x) {
        var aandeel = totEur > 0 ? Math.round(num(x.eur) / totEur * 100) : 0;
        return "<tr><td>" + esc(x.locatie_naam) + '</td><td class="mob-num">' + fmtKm(x.km) + '</td><td class="mob-num">' + fmtInt(x.ritten) + '</td><td class="mob-num">' + fmtEur(x.eur) +
          '</td><td><span class="mob-bar"><span class="mob-bar-fill" style="width:' + aandeel + '%"></span></span><span class="mob-bar-label">' + aandeel + "%</span></td></tr>";
      }), 5);
    } catch (err) { reportErr("Eigenaar", err); }
  }

  // ── PLANNING ─────────────────────────────────────────────────────────────────
  async function loadPlanning() {
    var p = periode();
    try {
      var rows = await rpc("km_planning_reiskosten", { p_van: p.van, p_tot: p.tot });
      rows = rows || [];
      var totEur = rows.reduce(function (a, x) { return a + num(x.verwachte_eur); }, 0);
      var totKm = rows.reduce(function (a, x) { return a + num(x.verwachte_km); }, 0);
      var totDagen = rows.reduce(function (a, x) { return a + num(x.dienstdagen); }, 0);
      $("mob-plan-totaal").textContent = fmtEur(totEur);
      $("mob-plan-totaal-km").textContent = fmtKm(totKm);
      $("mob-plan-dagen").textContent = fmtInt(totDagen);
      $("mob-plan-locaties").textContent = fmtInt(rows.length);
      rowsToTbody("mob-plan-locatie", rows.map(function (x) {
        return "<tr><td>" + esc(x.locatie_naam) + '</td><td class="mob-num">' + fmtInt(x.dienstdagen) + '</td><td class="mob-num">' + fmtInt(x.medewerkers) + '</td><td class="mob-num">' + fmtKm(x.verwachte_km) + '</td><td class="mob-num">' + fmtEur(x.verwachte_eur) + "</td></tr>";
      }), 5, "Geen geplande loondienst-diensten met afstandsgegevens in deze periode.");
    } catch (err) { reportErr("Planning", err); }
  }

  // ── HR-CONTROLE ──────────────────────────────────────────────────────────────
  async function loadHR() {
    try {
      var res = await rpc("km_hr_controle", {});
      var r = (res && res[0]) || {};
      $("mob-hr-goedk").textContent = fmtInt(r.open_goedkeuringen);
      $("mob-hr-afgewezen").textContent = fmtInt(r.afgewezen_ritten);
      $("mob-hr-afwijkingen").textContent = fmtInt(r.open_afwijkingen);
      $("mob-hr-afstanden").textContent = fmtInt(r.ontbrekende_afstanden);
      $("mob-hr-signaleringen").textContent = fmtInt(r.open_signaleringen);
      $("mob-hr-signaleringen-hoog").textContent = fmtInt(r.hoge_signaleringen) + " met hoge prioriteit";
      $("mob-hr-checkins").textContent = fmtInt(r.open_check_afwijkingen);
    } catch (err) { reportErr("HR-controle", err); }
    // Check-in-afwijkingen lijst
    try {
      if (global.kmCheckinDB && global.kmCheckinDB.ready) await global.kmCheckinDB.ready;
      var items = (global.kmCheckinDB ? global.kmCheckinDB.getAllSync() : []).filter(function (c) { return c && c.status === "afwijking"; }).slice(0, 30);
      var tb = $("mob-hr-checkin-list"), empty = $("mob-hr-checkin-empty");
      if (!items.length) { if (tb) tb.innerHTML = ""; if (empty) empty.hidden = false; }
      else {
        if (empty) empty.hidden = true;
        if (tb) tb.innerHTML = items.map(function (c) {
          var afst = c.afstandTotLocatieM != null ? fmtInt(c.afstandTotLocatieM) + " m" : "—";
          return "<tr><td>" + esc(c.medewerkerNaam || "—") + "</td><td>" + esc(formatNl(c.datum)) + "</td><td>" + esc(c.locatieNaam || "—") +
            '</td><td class="mob-num">' + afst + '</td><td><span class="mob-pill mob-pill--warn">Afwijking</span></td></tr>';
        }).join("");
      }
    } catch (err) { reportErr("Check-ins", err); }
  }

  // ── AI-SIGNALERINGEN ─────────────────────────────────────────────────────────
  var sigShowDone = false;
  var SIG_TYPE_LABEL = {
    hoge_declaratie: "Hoge declaratie", afwijkende_route: "Afwijkende route",
    dubbele_registratie: "Dubbele registratie", onlogische_reistijd: "Onlogische reistijd",
    hoge_kosten_client: "Hoge kosten per cliënt", hoge_kosten_locatie: "Hoge kosten per locatie",
  };
  function renderSignaleringen() {
    var listEl = $("mob-sig-list"), empty = $("mob-sig-empty");
    if (!listEl) return;
    var all = global.kmSignaleringenDB ? global.kmSignaleringenDB.getAllSync() : [];
    var rows = all.filter(function (s) { return sigShowDone ? true : s.status === "open"; });
    rows.sort(function (a, b) {
      var ord = { hoog: 0, midden: 1, laag: 2 };
      var d = (ord[a.ernst] || 1) - (ord[b.ernst] || 1);
      if (d !== 0) return d;
      return String(b.aanmaakdatum || "").localeCompare(String(a.aanmaakdatum || ""));
    });
    if (!rows.length) { listEl.innerHTML = ""; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    listEl.innerHTML = rows.map(function (s) {
      var meta = [];
      if (s.medewerkerNaam) meta.push(esc(s.medewerkerNaam));
      if (s.clientNaam) meta.push("Cliënt: " + esc(s.clientNaam));
      if (s.locatieNaam) meta.push("Locatie: " + esc(s.locatieNaam));
      if (s.maand && s.jaar) meta.push(s.maand + "-" + s.jaar);
      var done = s.status !== "open";
      var actions = done
        ? '<button type="button" class="btn-outline mob-sig-reopen" data-id="' + esc(s.id) + '">Heropenen</button>'
        : '<button type="button" class="btn-primary mob-sig-done" data-id="' + esc(s.id) + '">Afhandelen</button>' +
          '<button type="button" class="btn-outline mob-sig-ignore" data-id="' + esc(s.id) + '">Negeren</button>';
      return '<article class="mob-sig-item mob-sig-item--' + esc(s.ernst) + (done ? " mob-sig-item--done" : "") + '">' +
        '<div class="mob-sig-main">' +
          '<div class="mob-sig-top"><span class="mob-pill mob-pill--' + esc(s.ernst) + '">' + esc(s.ernst) + '</span>' +
          '<span class="mob-sig-type">' + esc(SIG_TYPE_LABEL[s.signaalType] || s.signaalType) + '</span>' +
          (done ? '<span class="mob-sig-status">' + (s.status === "genegeerd" ? "Genegeerd" : "Afgehandeld") + "</span>" : "") + "</div>" +
          '<h3 class="mob-sig-title">' + esc(s.titel) + "</h3>" +
          '<p class="mob-sig-desc">' + esc(s.omschrijving) + "</p>" +
          (meta.length ? '<p class="mob-sig-meta">' + meta.join(" · ") + "</p>" : "") +
        "</div>" +
        '<div class="mob-sig-actions">' + actions + "</div>" +
      "</article>";
    }).join("");
  }

  async function loadSignaleringen() {
    try {
      if (global.kmSignaleringenDB && global.kmSignaleringenDB.ready) await global.kmSignaleringenDB.ready;
    } catch (e) { /* */ }
    renderSignaleringen();
  }

  function wireSignaleringen() {
    var genBtn = $("mob-sig-genereer");
    if (genBtn) genBtn.addEventListener("click", function () {
      var resEl = $("mob-sig-result");
      genBtn.disabled = true;
      if (resEl) { resEl.textContent = "Analyseren…"; resEl.className = "mob-sig-result mob-sig-result--busy"; }
      global.kmSignaleringenDB.genereer().then(function (sum) {
        var n = sum ? num(sum.totaal_nieuw) : 0;
        if (resEl) {
          resEl.textContent = n > 0 ? (n + " nieuwe signalering" + (n === 1 ? "" : "en") + " gevonden.") : "Geen nieuwe signaleringen — alles up-to-date.";
          resEl.className = "mob-sig-result mob-sig-result--ok";
        }
        renderSignaleringen();
        loadHR();
      }).catch(function (err) {
        if (resEl) { resEl.textContent = "Verversen mislukt: " + ((err && err.message) || err); resEl.className = "mob-sig-result mob-sig-result--err"; }
      }).finally(function () { genBtn.disabled = false; });
    });
    var doneToggle = $("mob-sig-show-done");
    if (doneToggle) doneToggle.addEventListener("change", function () { sigShowDone = doneToggle.checked; renderSignaleringen(); });

    var listEl = $("mob-sig-list");
    if (listEl) listEl.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-id]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var status = btn.classList.contains("mob-sig-done") ? "afgehandeld"
        : btn.classList.contains("mob-sig-ignore") ? "genegeerd"
        : btn.classList.contains("mob-sig-reopen") ? "open" : null;
      if (!status) return;
      btn.disabled = true;
      global.kmSignaleringenDB.setStatus(id, status, currentProfileId()).then(function () {
        renderSignaleringen(); loadHR();
        if (global.showActionFeedback) global.showActionFeedback("saved", "Signalering");
      }).catch(function (err) {
        btn.disabled = false;
        if (global.showError) global.showError("Bijwerken mislukt: " + ((err && err.message) || err));
      });
    });
  }

  // ── Util ─────────────────────────────────────────────────────────────────────
  function formatNl(iso) {
    if (!iso) return "—";
    var m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "-" + m[2] + "-" + m[1]) : iso;
  }
  function reportErr(waar, err) {
    console.error("[mobiliteit] " + waar + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Mobiliteit — " + waar, err);
  }

  // ── Tab-besturing ────────────────────────────────────────────────────────────
  function showView(tab) {
    activeTab = tab;
    TAB_ORDER.forEach(function (t) {
      var view = $("mob-view-" + t), btn = $("mob-tab-" + t);
      if (view) view.hidden = (t !== tab);
      if (btn) {
        btn.classList.toggle("filter-chip--active", t === tab);
        btn.setAttribute("aria-selected", t === tab ? "true" : "false");
      }
    });
    loadView(tab);
  }
  function loadView(tab) {
    if (tab === "financieel") loadFinancieel();
    else if (tab === "eigenaar") loadEigenaar();
    else if (tab === "planning") loadPlanning();
    else if (tab === "hr") loadHR();
    else if (tab === "signaleringen") loadSignaleringen();
  }
  function reloadPeriodViews() {
    // Periode-afhankelijke views opnieuw laden als ze actief zijn.
    if (activeTab === "financieel") loadFinancieel();
    else if (activeTab === "eigenaar") loadEigenaar();
    else if (activeTab === "planning") loadPlanning();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    try { if (global.besaPermissionsReady) await global.besaPermissionsReady; } catch (e) { /* */ }
    try { if (global.profilesDB && global.profilesDB.ready) await global.profilesDB.ready; } catch (e) { /* */ }

    visibleTabs = TAB_ORDER.filter(canSeeTab);
    if (!visibleTabs.length) {
      var na = $("mob-noaccess"); if (na) na.hidden = false;
      var tabs = $("mob-tabs"); if (tabs) tabs.hidden = true;
      var per = $("mob-period-range"); if (per && per.parentNode) per.parentNode.style.display = "none";
      return;
    }
    visibleTabs.forEach(function (t) { var b = $("mob-tab-" + t); if (b) b.hidden = false; });

    // Tab-klik
    TAB_ORDER.forEach(function (t) {
      var b = $("mob-tab-" + t);
      if (b) b.addEventListener("click", function () { showView(t); });
    });

    // Datumrange
    var box = $("mob-period-range"), sEl = $("mob-date-from"), eEl = $("mob-date-to");
    if (box && sEl && eEl) {
      var dr = defaultRange();
      sEl.value = dr.van;
      eEl.value = dr.tot;
      if (global.BesaDateRange) {
        global.BesaDateRange.mount({ container: box, startInput: sEl, endInput: eEl, allowEmpty: false, year: new Date().getFullYear() });
      }
      sEl.addEventListener("change", reloadPeriodViews);
      eEl.addEventListener("change", reloadPeriodViews);
    }

    wireSignaleringen();

    // Live-refresh op data-events
    global.addEventListener("besa:km-signaleringen-updated", function () { if (activeTab === "signaleringen") renderSignaleringen(); });
    global.addEventListener("besa:km-checkins-updated", function () { if (activeTab === "hr") loadHR(); });

    showView(visibleTabs[0]);
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
