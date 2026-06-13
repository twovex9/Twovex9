/* global window, document */
/**
 * workforce.js — page-script voor /workforce-planning.html
 * Module 3: Workforce Planning + AI-engine (Embrace the Future).
 *
 * Vier rol-gegate weergaven (Capaciteit & tekorten / AI-aanbevelingen /
 * Skills & dekking / Forecast & directie). Rol-context komt uit de RPC
 * public.workforce_mijn_context (niveau / kan_beheren / is_directie); de
 * SECURITY DEFINER-RPC's zijn de echte poort (harde niveau<=3-check), de UI
 * verbergt enkel wat niet relevant is. Alle cijfers worden live per periode
 * uit Supabase berekend. De "AI-engine" is een deterministische heuristiek
 * (consistent met de bestaande planning-generator).
 */
(function () {
  "use strict";

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  var ctx = null; // { niveau, kan_beheren, is_directie }

  var now = new Date();
  var state = {
    view: "capaciteit",        // capaciteit | aanbevelingen | skills | forecast
    jaar: now.getFullYear(),
    maand: now.getMonth() + 1, // 1-12
    capStatusFilter: "",
    capSearch: "",
    capRows: [],
    aanbPrio: "",
    aanbVerbergAfgehandeld: false,
    aanbRows: [],
    skillsRows: [],
    forecastRows: [],
    beslisSleutel: null,
    beslisRow: null,
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtEur(n) {
    var v = Number(n) || 0;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtUren(n) {
    var v = Number(n) || 0;
    return v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }
  function fmtPct(n) { return (n == null) ? "—" : (fmtUren(n) + "%"); }
  function fmtDatum(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  }
  function maandLabel(j, m) { return MAANDEN[(m || 1) - 1] + " " + j; }
  function pad2(n) { return ("0" + n).slice(-2); }
  function periodStart() { return state.jaar + "-" + pad2(state.maand) + "-01"; }
  function periodEnd() {
    var d = new Date(state.jaar, state.maand, 0); // laatste dag van de maand
    return state.jaar + "-" + pad2(state.maand) + "-" + pad2(d.getDate());
  }
  function periodKey() { return state.jaar + "-" + pad2(state.maand); }
  function toast(kind, msg) {
    try { if (window.showActionFeedback) return window.showActionFeedback(kind, msg); } catch (e) { /* */ }
  }
  function showErr(msg) {
    try { if (window.showError) return window.showError(msg); } catch (e) { /* */ }
    try { if (window.showActionFeedback) window.showActionFeedback("error", msg); } catch (e) { /* */ }
  }

  // ─── Rol-helpers ─────────────────────────────────────────────────────────────
  function niveau() { return (ctx && typeof ctx.niveau === "number") ? ctx.niveau : 6; }
  function isDirectie() { return !!(ctx && ctx.is_directie); }

  // ─── Status-pill / dot / bar (hergebruikt de prod-* huisstijl) ───────────────────
  var STATUS_META = {
    rood:     { label: "Rood",     dot: "prod-dot--rood",   style: "color:var(--red);background:var(--red-soft);" },
    oranje:   { label: "Oranje",   dot: "prod-dot--oranje", style: "color:var(--yellow);background:var(--yellow-soft);" },
    groen:    { label: "Groen",    dot: "prod-dot--groen",  style: "color:var(--green);background:var(--green-soft);" },
    onbekend: { label: "Onbekend", dot: "prod-dot--grijs",  style: "color:var(--text-muted);background:var(--line);" },
  };
  var BADGE_BASE = "display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;";
  function badge(text, style) { return '<span class="badge" style="' + BADGE_BASE + style + '">' + escapeHtml(text) + '</span>'; }
  function statusPill(s) {
    var m = STATUS_META[s] || STATUS_META.onbekend;
    return '<span class="prod-status-pill"><span class="prod-dot ' + m.dot + '"></span>' + badge(m.label, m.style) + '</span>';
  }
  function dekkingBar(pct, status) {
    if (pct == null) return '<span class="prod-muted">—</span>';
    var m = STATUS_META[status] || STATUS_META.onbekend;
    var w = Math.max(0, Math.min(100, pct));
    return '<div class="prod-bar" title="' + fmtUren(pct) + '%">' +
      '<div class="prod-bar-fill ' + m.dot + '" style="width:' + w + '%"></div>' +
      '<span class="prod-bar-label">' + fmtUren(pct) + '%</span>' +
      '</div>';
  }

  var PRIO_META = {
    hoog:   { label: "Hoog",   style: "color:var(--red);background:var(--red-soft);" },
    midden: { label: "Midden", style: "color:var(--yellow);background:var(--yellow-soft);" },
    laag:   { label: "Laag",   style: "color:var(--blue);background:var(--blue-soft);" },
  };
  var TYPE_LABEL = {
    tekort: "Personeelstekort", inzet: "Capaciteit benutten", overbezetting: "Onderbenutting",
    skill_gap: "Skill-risico", forecast: "Forecast",
  };
  var BESLIS_META = {
    opgepakt:  { label: "Opgevolgd", style: "color:var(--green);background:var(--green-soft);" },
    afgewezen: { label: "Afgewezen", style: "color:var(--red);background:var(--red-soft);" },
  };

  // ─── Periode-UI ────────────────────────────────────────────────────────────────
  function initPeriod() {
    var mSel = $("wf-period-maand"), jSel = $("wf-period-jaar");
    if (mSel && !mSel.options.length) {
      MAANDEN.forEach(function (nm, i) {
        var o = document.createElement("option"); o.value = String(i + 1);
        o.textContent = nm.charAt(0).toUpperCase() + nm.slice(1); mSel.appendChild(o);
      });
    }
    if (jSel && !jSel.options.length) {
      var y0 = now.getFullYear();
      for (var y = y0 + 1; y >= y0 - 3; y--) {
        var o = document.createElement("option"); o.value = String(y); o.textContent = String(y); jSel.appendChild(o);
      }
    }
    syncPeriodUI();
  }
  function syncPeriodUI() {
    if ($("wf-period-maand")) $("wf-period-maand").value = String(state.maand);
    if ($("wf-period-jaar")) $("wf-period-jaar").value = String(state.jaar);
  }
  function stepMonth(delta) {
    var d = new Date(state.jaar, state.maand - 1 + delta, 1);
    state.jaar = d.getFullYear(); state.maand = d.getMonth() + 1;
    syncPeriodUI(); loadActiveView();
  }

  // ─── View-switch ─────────────────────────────────────────────────────────────
  var VIEWS = ["capaciteit", "aanbevelingen", "skills", "forecast"];
  // Het HTML `hidden`-attribuut wordt overschreven door class-display
  // (.table-card / .filter-chip zetten display) → toggle via style.display.
  function setVisible(el, show) { if (el) { el.style.display = show ? "" : "none"; el.hidden = !show; } }
  function applyAccess() {
    var blocked = niveau() > 3;
    setVisible($("wf-no-access"), blocked);
    setVisible(document.querySelector(".prod-viewtabs"), !blocked);
    setVisible(document.querySelector(".prod-period"), !blocked);
    if (blocked) { VIEWS.forEach(function (v) { setVisible($("wf-" + v + "-view"), false); }); return; }
    // Forecast & directie enkel voor niveau <= 2.
    setVisible($("wf-view-forecast"), isDirectie());
    if (state.view === "forecast" && !isDirectie()) state.view = "capaciteit";
  }
  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = "capaciteit";
    if (v === "forecast" && !isDirectie()) v = "capaciteit";
    state.view = v;
    document.querySelectorAll(".prod-viewtabs .filter-chip").forEach(function (b) {
      var on = b.getAttribute("data-view") === v;
      b.classList.toggle("filter-chip--active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    VIEWS.forEach(function (name) { setVisible($("wf-" + name + "-view"), name === v); });
    loadActiveView();
  }
  function loadActiveView() {
    if (niveau() > 3) return;
    if (state.view === "capaciteit") return loadCapaciteit();
    if (state.view === "aanbevelingen") return loadAanbevelingen();
    if (state.view === "skills") return loadSkills();
    if (state.view === "forecast") return loadForecast();
  }

  // ─── Capaciteit & tekorten ─────────────────────────────────────────────────────
  function loadCapaciteit() {
    var tb = $("wf-cap-tbody");
    tb.innerHTML = '<tr><td colspan="9" class="prod-loading">Laden…</td></tr>';
    window.workforceDB.capaciteit(periodStart(), periodEnd()).then(function (rows) {
      state.capRows = Array.isArray(rows) ? rows : [];
      renderCapaciteit();
    });
  }
  function capFiltered() {
    var q = state.capSearch.trim().toLowerCase();
    return state.capRows.filter(function (r) {
      if (state.capStatusFilter && r.status !== state.capStatusFilter) return false;
      if (q && (r.locatie || "").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  // Voeg (eenmalig) de "Oplossen"-kolomkop toe in de statische thead, zodat de
  // extra actie-kolom uitgelijnd blijft met de rij-cellen die we hieronder
  // injecteren. De thead staat in workforce-planning.html; we mogen hier alleen
  // workforce.js bewerken, dus de <th> komt via JS.
  function ensureCapOplossenHead() {
    if (!window.ffOplossen) return;
    var table = $("wf-cap-table");
    var headRow = table ? table.querySelector("thead tr") : null;
    if (!headRow || headRow.querySelector('[data-col="oplossen"]')) return;
    var th = document.createElement("th");
    th.setAttribute("data-col", "oplossen");
    th.innerHTML = '<span class="th-label">Actie</span>';
    headRow.appendChild(th);
  }
  function renderCapaciteit() {
    var rows = capFiltered();
    var tb = $("wf-cap-tbody");
    var heeftOplos = !!window.ffOplossen;
    if (heeftOplos) ensureCapOplossenHead();
    var colspan = heeftOplos ? 9 : 8;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="' + colspan + '" class="prod-empty-cell">Geen locaties met diensten in deze periode.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r) {
        // Bij een tekort (status rood/oranje, open_uren > 0): knop naar de
        // planning om de openstaande diensten van deze locatie in te vullen.
        var oplosCel = "";
        if (heeftOplos) {
          var btn = (Number(r.open_uren) > 0 && (r.status === "rood" || r.status === "oranje"))
            ? window.ffOplossen.navBtn("planning", "Naar planning", "Vul de openstaande diensten van deze locatie in.")
            : "";
          oplosCel = '<td data-col="oplossen">' + btn + '</td>';
        }
        return '<tr>' +
          '<td>' + escapeHtml(r.locatie || "—") + '</td>' +
          '<td>' + (r.open_diensten || 0) + ' <span class="prod-muted">/ ' + (r.diensten_totaal || 0) + '</span></td>' +
          '<td>' + fmtUren(r.vraag_uren) + ' u</td>' +
          '<td>' + fmtUren(r.gevuld_uren) + ' u</td>' +
          '<td>' + (Number(r.open_uren) > 0 ? '<strong style="color:var(--red)">' + fmtUren(r.open_uren) + ' u</strong>' : fmtUren(r.open_uren) + ' u') + '</td>' +
          '<td>' + fmtUren(r.loondienst_voorkeur_uren) + ' u</td>' +
          '<td style="min-width:140px">' + dekkingBar(r.dekkingsgraad, r.status) + '</td>' +
          '<td>' + statusPill(r.status) + '</td>' +
          oplosCel +
        '</tr>';
      }).join("");
    }
    if (heeftOplos) window.ffOplossen.bindSignals(tb);
    $("wf-cap-range").textContent = rows.length + " van " + state.capRows.length;

    // KPI-strip
    var open = state.capRows.reduce(function (s, r) { return s + (Number(r.open_diensten) || 0); }, 0);
    var openUren = state.capRows.reduce(function (s, r) { return s + (Number(r.open_uren) || 0); }, 0);
    var roodN = state.capRows.filter(function (r) { return r.status === "rood"; }).length;
    $("wf-cap-kpi-open").textContent = String(open);
    $("wf-cap-kpi-open-sub").textContent = roodN + " locatie(s) in tekort";
    $("wf-cap-kpi-uren").textContent = fmtUren(openUren) + " u";
    $("wf-cap-kpi-eur").textContent = fmtEur(openUren * gemZzpTarief());
  }
  // Gemiddeld ZZP-tarief grof afgeleid uit de KPI's; fallback 48.
  var _gz = 48;
  function gemZzpTarief() { return _gz; }

  // ─── AI-aanbevelingen ─────────────────────────────────────────────────────────
  function loadAanbevelingen() {
    var list = $("wf-aanb-list");
    list.innerHTML = '<div class="prod-loading">AI-engine analyseert vraag vs. aanbod…</div>';
    window.workforceDB.aanbevelingen(periodStart(), periodEnd()).then(function (rows) {
      state.aanbRows = Array.isArray(rows) ? rows : [];
      renderAanbevelingen();
    });
  }
  function aanbFiltered() {
    return state.aanbRows.filter(function (r) {
      if (state.aanbPrio && r.prioriteit !== state.aanbPrio) return false;
      if (state.aanbVerbergAfgehandeld && r.status && r.status !== "open") return false;
      return true;
    });
  }
  function renderAanbevelingen() {
    var rows = aanbFiltered();
    var list = $("wf-aanb-list");
    if (!rows.length) {
      list.innerHTML = '<div class="wf-rec-empty"><p class="prod-empty-title">Geen aanbevelingen</p>' +
        '<p class="prod-empty-sub">De AI-engine vond geen knelpunten voor deze periode en filters. Vraag en aanbod zijn in balans.</p></div>';
      return;
    }
    list.innerHTML = rows.map(function (r) {
      var prio = PRIO_META[r.prioriteit] || PRIO_META.laag;
      var typeLabel = TYPE_LABEL[r.type] || r.type;
      var impactParts = [];
      if (Number(r.impact_uren) > 0) impactParts.push(fmtUren(r.impact_uren) + " u");
      if (Number(r.impact_eur) > 0) impactParts.push("~" + fmtEur(r.impact_eur));
      var impact = impactParts.length ? '<span class="wf-rec-impact">Impact: ' + impactParts.join(" · ") + '</span>' : "";
      var statusHtml = "";
      var beslisInfo = "";
      if (r.status && r.status !== "open" && BESLIS_META[r.status]) {
        statusHtml = badge(BESLIS_META[r.status].label, BESLIS_META[r.status].style);
        beslisInfo = '<span class="wf-rec-beslis">' + escapeHtml(r.besloten_door_naam || "") +
          (r.besloten_op ? " · " + fmtDatum(r.besloten_op) : "") + '</span>';
      }
      var acties = (r.status && r.status !== "open")
        ? '<button type="button" class="btn-outline prod-mini-btn" data-action="heropenen" data-sleutel="' + escapeHtml(r.sleutel) + '">Heropenen</button>'
        : '<button type="button" class="btn-outline prod-mini-btn" data-action="beoordelen" data-sleutel="' + escapeHtml(r.sleutel) + '">Beoordelen</button>';
      return '<div class="wf-rec wf-rec--' + escapeHtml(r.prioriteit || "laag") + '">' +
        '<div class="wf-rec-head">' +
          '<div class="wf-rec-tags">' + badge(prio.label, prio.style) +
            '<span class="wf-rec-type">' + escapeHtml(typeLabel) + '</span>' +
            (r.locatie ? '<span class="wf-rec-loc">' + escapeHtml(r.locatie) + '</span>' : '') +
            statusHtml +
          '</div>' +
          '<div class="wf-rec-actions">' + acties + '</div>' +
        '</div>' +
        '<div class="wf-rec-title">' + escapeHtml(r.titel || "") + '</div>' +
        '<div class="wf-rec-body">' + escapeHtml(r.onderbouwing || "") + '</div>' +
        '<div class="wf-rec-meta">' + impact + beslisInfo +
          (r.notitie ? '<span class="wf-rec-note">“' + escapeHtml(r.notitie) + '”</span>' : '') +
        '</div>' +
      '</div>';
    }).join("");
  }

  // ─── Skills & dekking ──────────────────────────────────────────────────────────
  function loadSkills() {
    var tb = $("wf-skills-tbody");
    tb.innerHTML = '<tr><td colspan="8" class="prod-loading">Laden…</td></tr>';
    window.workforceDB.skillsDekking().then(function (rows) {
      state.skillsRows = Array.isArray(rows) ? rows : [];
      renderSkills();
    });
  }
  function renderSkills() {
    var rows = state.skillsRows;
    var tb = $("wf-skills-tbody");
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="8" class="prod-empty-cell">Geen teamgegevens beschikbaar.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.locatie || "—") + '</td>' +
          '<td>' + (r.team_aantal || 0) + '</td>' +
          '<td>' + (r.loondienst_aantal || 0) + '</td>' +
          '<td>' + (r.zzp_aantal || 0) + '</td>' +
          '<td>' + (r.kernteam_aantal || 0) + '</td>' +
          '<td>' + (r.bhv_aantal || 0) + '</td>' +
          '<td>' + (r.medicatie_aantal || 0) + '</td>' +
          '<td>' + statusPill(r.risico) + '</td>' +
        '</tr>';
      }).join("");
    }
    $("wf-skills-range").textContent = rows.length + " locatie(s)";
  }

  // ─── Forecast & directie ─────────────────────────────────────────────────────────
  // Date-only ISO ("2026-06-08") veilig naar een LOKALE-middernacht-Date — voorkomt de
  // UTC-parse-valkuil van new Date("yyyy-mm-dd") (zou in UTC-negatieve tijdzones een dag
  // terugvallen en het weeknummer/label doen verschuiven).
  function ymdToLocalDate(s) {
    var p = String(s).slice(0, 10).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function isoWeek(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    var firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    var diff = (date - firstThursday) / 86400000;
    return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  }
  function loadForecast() {
    if (!isDirectie()) return;
    loadDirectieKpis();
    var head = $("wf-forecast-head"), tb = $("wf-forecast-tbody");
    head.innerHTML = '<th><span class="th-label">Locatie</span></th>';
    tb.innerHTML = '<tr><td class="prod-loading">Forecast laden…</td></tr>';
    window.workforceDB.forecast(6).then(function (rows) {
      state.forecastRows = Array.isArray(rows) ? rows : [];
      renderForecast();
    });
  }
  function renderForecast() {
    var rows = state.forecastRows;
    var head = $("wf-forecast-head"), tb = $("wf-forecast-tbody");
    if (!rows.length) {
      head.innerHTML = '<th><span class="th-label">Locatie</span></th>';
      tb.innerHTML = '<tr><td class="prod-empty-cell">Geen forecast-data beschikbaar.</td></tr>';
      return;
    }
    // Unieke weken (gesorteerd) + locaties (gesorteerd)
    var weken = [], wkSet = {}, locs = [], locSet = {}, cell = {};
    rows.forEach(function (r) {
      if (!wkSet[r.week_start]) { wkSet[r.week_start] = 1; weken.push(r.week_start); }
      if (!locSet[r.locatie]) { locSet[r.locatie] = 1; locs.push(r.locatie); }
      cell[r.locatie + "|" + r.week_start] = r;
    });
    weken.sort();
    locs.sort();
    head.innerHTML = '<th><span class="th-label">Locatie</span></th>' + weken.map(function (w) {
      var d = ymdToLocalDate(w);
      return '<th style="text-align:center"><span class="th-label">wk ' + isoWeek(d) + '</span><br><span class="prod-muted" style="font-weight:400">' +
        escapeHtml(d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })) + '</span></th>';
    }).join("");
    tb.innerHTML = locs.map(function (loc) {
      return '<tr><td>' + escapeHtml(loc) + '</td>' + weken.map(function (w) {
        var r = cell[loc + "|" + w];
        if (!r || r.dekkingsgraad == null) return '<td style="text-align:center" class="prod-muted">—</td>';
        var m = STATUS_META[r.status] || STATUS_META.onbekend;
        var title = "Vraag " + fmtUren(r.vraag_uren) + " u · open " + fmtUren(r.open_uren) + " u";
        return '<td style="text-align:center"><span class="wf-fc-cell" title="' + escapeHtml(title) + '" style="' + m.style + '">' +
          fmtUren(r.dekkingsgraad) + '%</span></td>';
      }).join("") + '</tr>';
    }).join("");
  }
  function loadDirectieKpis() {
    window.workforceDB.kpis(periodStart(), periodEnd()).then(function (k) {
      k = k || {};
      $("wf-kpi-dekking").textContent = (k.dekkingsgraad == null) ? "—" : fmtUren(k.dekkingsgraad) + "%";
      $("wf-kpi-open").textContent = fmtUren(k.open_uren || 0) + " u";
      $("wf-kpi-open-sub").textContent = (k.open_diensten || 0) + " open diensten · " + (k.locaties_rood || 0) + " locatie(s) rood";
      $("wf-kpi-eur").textContent = fmtEur(k.inhuur_impact_eur || 0);
      $("wf-kpi-onbenut").textContent = fmtUren(k.loondienst_onbenut_uren || 0);
      $("wf-kpi-benut-sub").textContent = "uur · gem. benutting " + (k.loondienst_benutting == null ? "—" : fmtUren(k.loondienst_benutting) + "%");
    });
  }

  // ─── Modal: aanbeveling beoordelen ───────────────────────────────────────────────
  function openBeslis(sleutel) {
    var r = state.aanbRows.find(function (x) { return String(x.sleutel) === String(sleutel); });
    if (!r) return;
    state.beslisSleutel = sleutel;
    state.beslisRow = r;
    $("wf-beslis-context").textContent = (TYPE_LABEL[r.type] || r.type) + (r.locatie ? " — " + r.locatie : "");
    var meta = [];
    if (Number(r.impact_uren) > 0) meta.push("Impact: <strong>" + fmtUren(r.impact_uren) + " u</strong>");
    if (Number(r.impact_eur) > 0) meta.push("~<strong>" + fmtEur(r.impact_eur) + "</strong>");
    $("wf-beslis-meta").innerHTML = escapeHtml(r.titel || "") + (meta.length ? '<br>' + meta.join(" · ") : "");
    $("wf-beslis-notitie").value = r.notitie || "";
    var cur = $("wf-beslis-current");
    if (r.status && r.status !== "open" && BESLIS_META[r.status]) {
      cur.hidden = false;
      cur.innerHTML = "Huidige beslissing: <strong>" + escapeHtml(BESLIS_META[r.status].label) + "</strong>";
    } else { cur.hidden = true; cur.innerHTML = ""; }
    $("wf-beslis-modal").style.display = "flex";
  }
  function closeBeslis() { $("wf-beslis-modal").style.display = "none"; state.beslisSleutel = null; state.beslisRow = null; }
  function submitBeslis(status) {
    var r = state.beslisRow;
    if (!r) return;
    var notitie = $("wf-beslis-notitie").value.trim();
    window.workforceDB.beslis(r.sleutel, periodKey(), r.type, r.locatie, r.titel, status, notitie, r.impact_uren, r.impact_eur)
      .then(function () {
        toast("saved", "Advies " + (status === "opgepakt" ? "opgevolgd" : "afgewezen"));
        closeBeslis();
        loadAanbevelingen();
      }).catch(function (err) { showErr("Beslissing mislukt: " + (err && err.message || err)); });
  }
  function heropenen(sleutel) {
    var r = state.aanbRows.find(function (x) { return String(x.sleutel) === String(sleutel); });
    if (!r) return;
    window.workforceDB.beslis(r.sleutel, periodKey(), r.type, r.locatie, r.titel, "open", null, r.impact_uren, r.impact_eur)
      .then(function () { toast("restored", "Advies heropend"); loadAanbevelingen(); })
      .catch(function (err) { showErr("Heropenen mislukt: " + (err && err.message || err)); });
  }

  // ─── Event-listeners ─────────────────────────────────────────────────────────
  function wire() {
    // Periode
    $("wf-period-prev").addEventListener("click", function () { stepMonth(-1); });
    $("wf-period-next").addEventListener("click", function () { stepMonth(1); });
    $("wf-period-maand").addEventListener("change", function () { state.maand = parseInt(this.value, 10); loadActiveView(); });
    $("wf-period-jaar").addEventListener("change", function () { state.jaar = parseInt(this.value, 10); loadActiveView(); });

    // View-tabs
    document.querySelectorAll(".prod-viewtabs .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });

    // Capaciteit-filters
    document.querySelectorAll(".wf-statusfilter .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".wf-statusfilter .filter-chip").forEach(function (x) { x.classList.remove("filter-chip--active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("filter-chip--active"); b.setAttribute("aria-pressed", "true");
        state.capStatusFilter = b.getAttribute("data-status") || ""; renderCapaciteit();
      });
    });
    $("wf-cap-search").addEventListener("input", function () { state.capSearch = this.value; renderCapaciteit(); });

    // Aanbevelingen-filters
    document.querySelectorAll(".wf-priofilter .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".wf-priofilter .filter-chip").forEach(function (x) { x.classList.remove("filter-chip--active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("filter-chip--active"); b.setAttribute("aria-pressed", "true");
        state.aanbPrio = b.getAttribute("data-prio") || ""; renderAanbevelingen();
      });
    });
    $("wf-aanb-verberg-afgehandeld").addEventListener("change", function () { state.aanbVerbergAfgehandeld = this.checked; renderAanbevelingen(); });
    $("wf-aanb-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]"); if (!btn) return;
      var a = btn.getAttribute("data-action"), sl = btn.getAttribute("data-sleutel");
      if (a === "beoordelen") openBeslis(sl);
      else if (a === "heropenen") heropenen(sl);
    });

    // Modal
    $("wf-beslis-close").addEventListener("click", closeBeslis);
    $("wf-beslis-cancel").addEventListener("click", closeBeslis);
    $("wf-beslis-opvolgen").addEventListener("click", function () { submitBeslis("opgepakt"); });
    $("wf-beslis-afwijzen").addEventListener("click", function () { submitBeslis("afgewezen"); });
    var m = $("wf-beslis-modal");
    m.addEventListener("click", function (e) { if (e.target === m) closeBeslis(); });
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────────
  function boot() {
    initPeriod();
    wire();
    var done = function () {
      applyAccess();
      if (niveau() > 3) return;
      // Gemiddeld ZZP-tarief ophalen voor de capaciteit-KPI (eenmalig via KPI-RPC).
      window.workforceDB.kpis(periodStart(), periodEnd()).then(function (k) {
        if (k && k.open_uren > 0 && k.inhuur_impact_eur > 0) _gz = k.inhuur_impact_eur / k.open_uren;
        if (state.view === "capaciteit") renderCapaciteit();
      });
      setView(state.view);
    };
    if (window.workforceDB && window.workforceDB.getContext) {
      window.workforceDB.getContext().then(function (c) { ctx = c || ctx; done(); }).catch(done);
    } else { done(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
