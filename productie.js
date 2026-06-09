/* global window, document */
/**
 * productie.js — page-script voor /productie-urenregistratie.html
 * Module 2: Productie & Urenregistratie (Embrace the Future).
 *
 * Vier rol-gegate weergaven (Beschikkingsbewaking / Kosten & inhuur /
 * Maandafsluiting / Directie-KPI's). Rol-context komt uit de RPC
 * public.productie_mijn_context (niveau / kan_beheren / is_directie); de RLS +
 * SECURITY DEFINER-RPC's zijn de echte poort, de UI verbergt enkel wat niet
 * relevant is. Alle cijfers worden live per periode uit Supabase berekend.
 */
(function () {
  "use strict";

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  var ctx = null; // { niveau, kan_beheren, is_directie }

  var now = new Date();
  var state = {
    view: "bewaking",          // bewaking | kosten | maand | kpi
    jaar: now.getFullYear(),
    maand: now.getMonth() + 1, // 1-12
    statusFilter: "",
    search: "",
    zorgsoort: "",
    kostenTab: "zzp",
    kostenSearch: "",
    bewakingRows: [],
    kostenRows: [],
    maandRows: [],
    toegekendId: null,
    overschId: null,
    overschRow: null,
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
  function maandLabel(j, m) { return MAANDEN[(m || 1) - 1] + " " + j; }
  function pad2(n) { return ("0" + n).slice(-2); }
  function periodStart() { return state.jaar + "-" + pad2(state.maand) + "-01"; }
  function periodEnd() {
    var d = new Date(state.jaar, state.maand, 0); // laatste dag van de maand
    return state.jaar + "-" + pad2(state.maand) + "-" + pad2(d.getDate());
  }
  function toast(kind, msg) {
    try { if (window.showActionFeedback) return window.showActionFeedback(kind, msg); } catch (e) { /* */ }
  }
  function showErr(msg) {
    try { if (window.showError) return window.showError(msg); } catch (e) { /* */ }
    try { if (window.showActionFeedback) window.showActionFeedback("error", msg); } catch (e) { /* */ }
  }

  // ─── Rol-helpers ─────────────────────────────────────────────────────────────
  function niveau() { return (ctx && typeof ctx.niveau === "number") ? ctx.niveau : 6; }
  function kanBeheren() { return !!(ctx && ctx.kan_beheren); }
  function isDirectie() { return !!(ctx && ctx.is_directie); }

  // ─── Status-pill / dot ─────────────────────────────────────────────────────────
  var STATUS_META = {
    rood:     { label: "Rood",     dot: "prod-dot--rood",   style: "color:var(--red);background:var(--red-soft);" },
    oranje:   { label: "Oranje",   dot: "prod-dot--oranje", style: "color:var(--yellow);background:var(--yellow-soft);" },
    groen:    { label: "Groen",    dot: "prod-dot--groen",  style: "color:var(--green);background:var(--green-soft);" },
    onbekend: { label: "Onbekend", dot: "prod-dot--grijs",  style: "color:var(--text-muted);background:var(--line);" },
  };
  function statusPill(s) {
    var m = STATUS_META[s] || STATUS_META.onbekend;
    return '<span class="prod-status-pill"><span class="prod-dot ' + m.dot + '"></span>' +
      '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;' + m.style + '">' + m.label + '</span></span>';
  }
  function benuttingBar(pct, status) {
    if (pct == null) return '<span class="prod-muted">—</span>';
    var m = STATUS_META[status] || STATUS_META.onbekend;
    var w = Math.max(0, Math.min(100, pct));
    var over = pct > 100;
    return '<div class="prod-bar" title="' + fmtUren(pct) + '%">' +
      '<div class="prod-bar-fill ' + m.dot + '" style="width:' + w + '%"></div>' +
      (over ? '<span class="prod-bar-over">' + fmtUren(pct) + '%</span>' : '<span class="prod-bar-label">' + fmtUren(pct) + '%</span>') +
      '</div>';
  }
  function eenheidLabel(e) { return e === "maand" ? "/ maand" : e === "totaal" ? "/ looptijd" : "/ week"; }

  // ─── Periode-UI ────────────────────────────────────────────────────────────────
  function initPeriod() {
    var mSel = $("prod-period-maand"), jSel = $("prod-period-jaar");
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
    if ($("prod-period-maand")) $("prod-period-maand").value = String(state.maand);
    if ($("prod-period-jaar")) $("prod-period-jaar").value = String(state.jaar);
  }
  function stepMonth(delta) {
    var d = new Date(state.jaar, state.maand - 1 + delta, 1);
    state.jaar = d.getFullYear(); state.maand = d.getMonth() + 1;
    syncPeriodUI(); loadActiveView();
  }

  // ─── View-switch ─────────────────────────────────────────────────────────────
  var VIEWS = ["bewaking", "kosten", "maand", "kpi"];
  // Het HTML `hidden`-attribuut wordt overschreven door class-display
  // (.table-card / .filter-chip zetten display) → toggle via style.display.
  function setVisible(el, show) { if (el) { el.style.display = show ? "" : "none"; el.hidden = !show; } }
  function applyAccess() {
    // Medewerker (niveau > 3): geen toegang tot enige beheer-view.
    var blocked = niveau() > 3;
    setVisible($("prod-no-access"), blocked);
    setVisible(document.querySelector(".prod-viewtabs"), !blocked);
    setVisible(document.querySelector(".prod-period"), !blocked);
    if (blocked) { VIEWS.forEach(function (v) { setVisible($("prod-" + v + "-view"), false); }); return; }
    // Directie-KPI's enkel voor niveau <= 2.
    setVisible($("prod-view-kpi"), isDirectie());
    if (state.view === "kpi" && !isDirectie()) state.view = "bewaking";
  }
  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = "bewaking";
    if (v === "kpi" && !isDirectie()) v = "bewaking";
    state.view = v;
    document.querySelectorAll(".prod-viewtabs .filter-chip").forEach(function (b) {
      var on = b.getAttribute("data-view") === v;
      b.classList.toggle("filter-chip--active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    VIEWS.forEach(function (name) { setVisible($("prod-" + name + "-view"), name === v); });
    loadActiveView();
  }

  function loadActiveView() {
    if (niveau() > 3) return;
    if (state.view === "bewaking") return loadBewaking();
    if (state.view === "kosten") return loadKosten();
    if (state.view === "maand") return loadMaand();
    if (state.view === "kpi") return loadKpi();
  }

  // ─── Beschikkingsbewaking ──────────────────────────────────────────────────────
  function loadBewaking() {
    var tb = $("prod-bewaking-tbody");
    tb.innerHTML = '<tr><td colspan="10" class="prod-loading">Laden…</td></tr>';
    window.productieDB.bewaking(periodStart(), periodEnd()).then(function (rows) {
      state.bewakingRows = Array.isArray(rows) ? rows : [];
      fillZorgsoortFilter();
      renderBewaking();
    });
  }
  function fillZorgsoortFilter() {
    var sel = $("prod-bewaking-zorgsoort");
    var cur = sel.value;
    var zs = {};
    state.bewakingRows.forEach(function (r) { if (r.zorgsoort) zs[r.zorgsoort] = 1; });
    sel.innerHTML = '<option value="">Alle zorgsoorten</option>' +
      Object.keys(zs).sort().map(function (z) { return '<option value="' + escapeHtml(z) + '">' + escapeHtml(z) + '</option>'; }).join("");
    sel.value = cur;
  }
  function bewakingFiltered() {
    var q = state.search.trim().toLowerCase();
    return state.bewakingRows.filter(function (r) {
      if (state.statusFilter && r.status !== state.statusFilter) return false;
      if (state.zorgsoort && r.zorgsoort !== state.zorgsoort) return false;
      if (q) {
        var hay = (r.client_label || "") + " " + (r.naam || "") + " " + (r.zorgsoort || "") + " " + (r.locatie || "");
        if (hay.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function goedkeuringBadge(s) {
    if (!s) return "";
    if (s === "goedgekeurd") return '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;color:var(--green);background:var(--green-soft);">Goedgekeurd</span>';
    if (s === "afgewezen") return '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;color:var(--red);background:var(--red-soft);">Afgewezen</span>';
    return '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;color:var(--yellow);background:var(--yellow-soft);">Open</span>';
  }
  function renderBewaking() {
    var rows = bewakingFiltered();
    var tb = $("prod-bewaking-tbody");
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="10" class="prod-empty-cell">Geen beschikkingen in deze periode.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r) {
        var toeg = (r.toegekend_uren != null)
          ? fmtUren(r.toegekend_uren) + ' u <span class="prod-muted">' + eenheidLabel(r.toegekend_eenheid) + '</span>'
          : '<span class="prod-muted">niet ingesteld</span>';
        var verbr = fmtUren(r.verbruik_uren) + " u" + (r.toegekend_periode != null ? ' <span class="prod-muted">/ ' + fmtUren(r.toegekend_periode) + '</span>' : "");
        var acties = '<button type="button" class="btn-outline prod-mini-btn" data-action="toegekend" data-id="' + escapeHtml(r.beschikking_id) + '">Toegekend</button>';
        if (r.status === "rood") {
          acties += ' <button type="button" class="btn-outline prod-mini-btn prod-mini-btn--warn" data-action="oversch" data-id="' + escapeHtml(r.beschikking_id) + '">Overschrijding</button>';
        }
        return '<tr>' +
          '<td>' + escapeHtml(r.client_label || "—") + '</td>' +
          '<td>' + escapeHtml(r.naam || "—") + '</td>' +
          '<td>' + escapeHtml(r.zorgsoort || "—") + '</td>' +
          '<td>' + escapeHtml(r.locatie || "—") + '</td>' +
          '<td>' + toeg + '</td>' +
          '<td>' + verbr + '</td>' +
          '<td style="min-width:140px">' + benuttingBar(r.verbruik_pct, r.status) + '</td>' +
          '<td>' + statusPill(r.status) + '</td>' +
          '<td>' + goedkeuringBadge(r.goedkeuring_status) + '</td>' +
          '<td class="prod-acties-cell">' + acties + '</td>' +
        '</tr>';
      }).join("");
    }
    $("prod-bewaking-range").textContent = rows.length + " van " + state.bewakingRows.length;
  }

  // ─── Kosten & inhuur ─────────────────────────────────────────────────────────
  function loadKosten() {
    var tb = $("prod-kosten-tbody");
    tb.innerHTML = '<tr><td colspan="6" class="prod-loading">Laden…</td></tr>';
    var fn = state.kostenTab === "loondienst" ? window.productieDB.kostenLoondienst : window.productieDB.kostenZzp;
    fn(periodStart(), periodEnd()).then(function (rows) {
      state.kostenRows = Array.isArray(rows) ? rows : [];
      renderKosten();
    });
  }
  function kostenFiltered() {
    var q = state.kostenSearch.trim().toLowerCase();
    if (!q) return state.kostenRows;
    return state.kostenRows.filter(function (r) { return (r.naam || "").toLowerCase().indexOf(q) >= 0; });
  }
  function renderKosten() {
    var isLoon = state.kostenTab === "loondienst";
    var rows = kostenFiltered();
    var thead = $("prod-kosten-thead");
    var tb = $("prod-kosten-tbody");

    if (isLoon) {
      thead.innerHTML = '<tr><th><span class="th-label">Medewerker</span></th><th><span class="th-label">Contracturen</span></th><th><span class="th-label">Maandsalaris</span></th><th><span class="th-label">Gewerkte uren</span></th><th><span class="th-label">Benutting</span></th><th><span class="th-label">Kosten periode</span></th></tr>';
      tb.innerHTML = rows.length ? rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.naam || "—") + '</td>' +
          '<td>' + (r.contracturen != null ? fmtUren(r.contracturen) + " u/wk" : '<span class="prod-muted">—</span>') + '</td>' +
          '<td>' + (r.maandsalaris != null ? fmtEur(r.maandsalaris) : '<span class="prod-muted">—</span>') + '</td>' +
          '<td>' + fmtUren(r.gewerkte_uren) + " u</td>" +
          '<td style="min-width:140px">' + benuttingBarLoon(r.benutting_pct) + '</td>' +
          '<td>' + fmtEur(r.kosten) + '</td>' +
        '</tr>';
      }).join("") : '<tr><td colspan="6" class="prod-empty-cell">Geen loondienst-medewerkers.</td></tr>';
    } else {
      thead.innerHTML = '<tr><th><span class="th-label">Medewerker</span></th><th><span class="th-label">Uurtarief</span></th><th><span class="th-label">Gewerkte uren</span></th><th><span class="th-label">Kosten periode</span></th></tr>';
      tb.innerHTML = rows.length ? rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.naam || "—") + '</td>' +
          '<td>' + (r.uurtarief != null ? fmtEur(r.uurtarief) + " /u" : '<span class="prod-muted">—</span>') + '</td>' +
          '<td>' + fmtUren(r.verbruik_uren) + " u</td>" +
          '<td>' + fmtEur(r.kosten) + '</td>' +
        '</tr>';
      }).join("") : '<tr><td colspan="4" class="prod-empty-cell">Geen ZZP/inhuur met productie in deze periode.</td></tr>';
    }

    // KPI-strip
    var totKosten = rows.reduce(function (s, r) { return s + (Number(r.kosten) || 0); }, 0);
    var totUren = rows.reduce(function (s, r) { return s + (Number(isLoon ? r.gewerkte_uren : r.verbruik_uren) || 0); }, 0);
    $("prod-kosten-kpi1-label").textContent = isLoon ? "Totale loonkosten" : "Totale inhuurkosten";
    $("prod-kosten-kpi1").textContent = fmtEur(totKosten);
    $("prod-kosten-kpi2").textContent = fmtUren(totUren);
    $("prod-kosten-kpi3-label").textContent = isLoon ? "Loondienst-medewerkers" : "ZZP'ers met productie";
    $("prod-kosten-kpi3").textContent = String(rows.length);
    if (isLoon) {
      var benutVals = rows.map(function (r) { return r.benutting_pct; }).filter(function (v) { return v != null; });
      var gem = benutVals.length ? benutVals.reduce(function (a, b) { return a + Number(b); }, 0) / benutVals.length : null;
      $("prod-kosten-kpi3-label").textContent = "Gem. benuttingsgraad";
      $("prod-kosten-kpi3").textContent = gem == null ? "—" : fmtUren(gem) + "%";
    }
    $("prod-kosten-range").textContent = rows.length + " van " + state.kostenRows.length;
  }
  function benuttingBarLoon(pct) {
    if (pct == null) return '<span class="prod-muted">—</span>';
    var status = pct >= 85 ? "groen" : pct >= 50 ? "oranje" : "rood";
    return benuttingBar(pct, status);
  }

  // ─── Maandafsluiting ───────────────────────────────────────────────────────────
  function loadMaand() {
    var tb = $("prod-maand-tbody");
    tb.innerHTML = '<tr><td colspan="7" class="prod-loading">Laden…</td></tr>';
    window.productieDB.maandStatusAll().then(function (rows) {
      state.maandRows = Array.isArray(rows) ? rows : [];
      renderMaand();
    });
    var btn = $("prod-maand-afsluit-btn");
    if (btn) btn.textContent = maandLabel(state.jaar, state.maand).charAt(0).toUpperCase() + maandLabel(state.jaar, state.maand).slice(1) + " afsluiten";
  }
  function renderMaand() {
    var tb = $("prod-maand-tbody");
    var rows = state.maandRows;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="prod-empty-cell">Nog geen maanden afgesloten. Sluit de huidige maand af om te beginnen.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (r) {
      var snap = r.snapshot || {};
      var st = r.status === "afgesloten"
        ? '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;color:var(--green);background:var(--green-soft);">Afgesloten</span>'
        : '<span class="badge" style="display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;color:var(--blue);background:var(--blue-soft);">Open</span>';
      var actie = "";
      if (r.status === "afgesloten" && isDirectie()) {
        actie = '<button type="button" class="btn-outline prod-mini-btn" data-action="heropenen" data-jaar="' + r.jaar + '" data-maand="' + r.maand + '">Heropenen</button>';
      }
      return '<tr>' +
        '<td>' + escapeHtml(maandLabel(r.jaar, r.maand)) + '</td>' +
        '<td>' + st + '</td>' +
        '<td>' + (snap.productie_uren != null ? fmtUren(snap.productie_uren) + " u" : "—") + '</td>' +
        '<td>' + (snap.zzp_kosten != null ? fmtEur(snap.zzp_kosten) : "—") + '</td>' +
        '<td>' + (snap.rood != null ? snap.rood : "—") + '</td>' +
        '<td>' + escapeHtml(r.afgesloten_door_naam || "—") + (r.heropend_door_naam ? ' <span class="prod-muted">(heropend: ' + escapeHtml(r.heropend_door_naam) + ')</span>' : "") + '</td>' +
        '<td class="prod-acties-cell">' + actie + '</td>' +
      '</tr>';
    }).join("");
  }

  // ─── Directie-KPI's ────────────────────────────────────────────────────────────
  function loadKpi() {
    window.productieDB.kpis(periodStart(), periodEnd()).then(function (k) {
      k = k || {};
      $("prod-kpi-uren").textContent = fmtUren(k.productie_uren || 0);
      $("prod-kpi-rood").textContent = String(k.rood || 0);
      $("prod-kpi-rood-sub").textContent = (k.rood || 0) + " van " + (k.gemonitord || 0) + " gemonitord · " + (k.overschrijding_pct || 0) + "%";
      $("prod-kpi-zzp").textContent = fmtEur(k.zzp_kosten || 0);
      $("prod-kpi-benutting").textContent = (k.loondienst_benutting == null) ? "—" : fmtUren(k.loondienst_benutting) + "%";
      renderVerdeling(k);
    });
  }
  function renderVerdeling(k) {
    var el = $("prod-kpi-verdeling");
    var items = [
      { key: "groen", label: "Groen (binnen budget)", n: k.groen || 0, cls: "prod-dot--groen" },
      { key: "oranje", label: "Oranje (85-100%)", n: k.oranje || 0, cls: "prod-dot--oranje" },
      { key: "rood", label: "Rood (overschreden)", n: k.rood || 0, cls: "prod-dot--rood" },
      { key: "onbekend", label: "Onbekend (geen omvang)", n: k.onbekend || 0, cls: "prod-dot--grijs" },
    ];
    var totaal = items.reduce(function (s, i) { return s + i.n; }, 0) || 1;
    el.innerHTML = items.map(function (i) {
      var pct = Math.round(i.n / totaal * 100);
      return '<div class="prod-verdeling-row">' +
        '<span class="prod-verdeling-label"><span class="prod-dot ' + i.cls + '"></span>' + i.label + '</span>' +
        '<div class="prod-bar"><div class="prod-bar-fill ' + i.cls + '" style="width:' + pct + '%"></div></div>' +
        '<span class="prod-verdeling-n">' + i.n + '</span>' +
      '</div>';
    }).join("");
  }

  // ─── Modal: toegekende omvang ────────────────────────────────────────────────
  function openToegekend(beschId) {
    var r = state.bewakingRows.find(function (x) { return String(x.beschikking_id) === String(beschId); });
    if (!r) return;
    state.toegekendId = beschId;
    $("prod-toegekend-context").textContent = (r.client_label || "") + " — " + (r.naam || "");
    $("prod-toegekend-uren").value = r.toegekend_uren != null ? r.toegekend_uren : "";
    $("prod-toegekend-eenheid").value = r.toegekend_eenheid || "week";
    $("prod-toegekend-modal").style.display = "flex";
  }
  function closeToegekend() { $("prod-toegekend-modal").style.display = "none"; state.toegekendId = null; }
  function saveToegekend() {
    var id = state.toegekendId;
    if (!id) return;
    var raw = String($("prod-toegekend-uren").value || "").replace(",", ".").trim();
    var uren = raw === "" ? null : Number(raw);
    if (uren != null && (!isFinite(uren) || uren < 0)) { showErr("Ongeldig aantal uren."); return; }
    var eenheid = $("prod-toegekend-eenheid").value || "week";
    window.productieDB.setToegekend(id, uren, eenheid).then(function () {
      toast("saved", "Toegekende omvang");
      closeToegekend();
      loadBewaking();
    }).catch(function (err) { showErr("Opslaan mislukt: " + (err && err.message || err)); });
  }

  // ─── Modal: overschrijding behandelen ──────────────────────────────────────────
  function openOversch(beschId) {
    var r = state.bewakingRows.find(function (x) { return String(x.beschikking_id) === String(beschId); });
    if (!r) return;
    state.overschId = beschId;
    state.overschRow = r;
    $("prod-oversch-context").textContent = (r.client_label || "") + " — " + (r.naam || "");
    $("prod-oversch-meta").innerHTML =
      'Verbruik: <strong>' + fmtUren(r.verbruik_uren) + ' u</strong> · Toegekend (periode): <strong>' + fmtUren(r.toegekend_periode) + ' u</strong> · Benutting: <strong>' + fmtPct(r.verbruik_pct) + '</strong>';
    $("prod-oversch-reden").value = "";
    var cur = $("prod-oversch-current");
    if (r.goedkeuring_status) {
      cur.hidden = false;
      cur.innerHTML = 'Huidige beslissing: <strong>' + escapeHtml(r.goedkeuring_status) + '</strong>';
    } else { cur.hidden = true; cur.innerHTML = ""; }
    $("prod-oversch-modal").style.display = "flex";
  }
  function closeOversch() { $("prod-oversch-modal").style.display = "none"; state.overschId = null; state.overschRow = null; }
  function beslisOversch(status) {
    var r = state.overschRow;
    if (!r) return;
    var reden = $("prod-oversch-reden").value.trim();
    window.productieDB.overschrijdingBeslis(state.overschId, state.jaar, state.maand, status, reden, r.verbruik_uren, r.toegekend_periode)
      .then(function () {
        toast(status === "goedgekeurd" ? "saved" : "saved", "Overschrijding " + status);
        closeOversch();
        loadBewaking();
      }).catch(function (err) { showErr("Beslissing mislukt: " + (err && err.message || err)); });
  }

  // ─── Modal: maand afsluiten ────────────────────────────────────────────────────
  function openAfsluit() {
    $("prod-afsluit-title").textContent = maandLabel(state.jaar, state.maand).charAt(0).toUpperCase() + maandLabel(state.jaar, state.maand).slice(1) + " afsluiten";
    $("prod-afsluit-context").textContent = "De productie- en kostencijfers van " + maandLabel(state.jaar, state.maand) + " worden vastgelegd (snapshot + audit).";
    $("prod-afsluit-notitie").value = "";
    $("prod-afsluit-modal").style.display = "flex";
  }
  function closeAfsluit() { $("prod-afsluit-modal").style.display = "none"; }
  function confirmAfsluit() {
    var notitie = $("prod-afsluit-notitie").value.trim();
    window.productieDB.maandAfsluiten(state.jaar, state.maand, notitie).then(function () {
      toast("saved", "Maand afgesloten");
      closeAfsluit();
      loadMaand();
    }).catch(function (err) { showErr("Afsluiten mislukt: " + (err && err.message || err)); });
  }
  function heropenen(jaar, maand) {
    window.showSliderConfirmModal({
      title: "Maand heropenen?",
      preview: maandLabel(jaar, maand),
      okLabel: "Heropenen", cancelLabel: "Annuleren",
    }).then(function (ok) {
      if (!ok) return;
      window.productieDB.maandHeropenen(jaar, maand).then(function () {
        toast("restored", "Maand heropend");
        loadMaand();
      }).catch(function (err) { showErr("Heropenen mislukt: " + (err && err.message || err)); });
    });
  }

  // ─── Event-listeners ─────────────────────────────────────────────────────────
  function wire() {
    // Periode
    $("prod-period-prev").addEventListener("click", function () { stepMonth(-1); });
    $("prod-period-next").addEventListener("click", function () { stepMonth(1); });
    $("prod-period-maand").addEventListener("change", function () { state.maand = parseInt(this.value, 10); loadActiveView(); });
    $("prod-period-jaar").addEventListener("change", function () { state.jaar = parseInt(this.value, 10); loadActiveView(); });

    // View-tabs
    document.querySelectorAll(".prod-viewtabs .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });

    // Bewaking-filters
    document.querySelectorAll(".prod-statusfilter .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".prod-statusfilter .filter-chip").forEach(function (x) { x.classList.remove("filter-chip--active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("filter-chip--active"); b.setAttribute("aria-pressed", "true");
        state.statusFilter = b.getAttribute("data-status") || ""; renderBewaking();
      });
    });
    $("prod-bewaking-search").addEventListener("input", function () { state.search = this.value; renderBewaking(); });
    $("prod-bewaking-zorgsoort").addEventListener("change", function () { state.zorgsoort = this.value; renderBewaking(); });
    $("prod-bewaking-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]"); if (!btn) return;
      var a = btn.getAttribute("data-action"), id = btn.getAttribute("data-id");
      if (a === "toegekend") openToegekend(id);
      else if (a === "oversch") openOversch(id);
    });

    // Kosten
    document.querySelectorAll(".prod-kostentab .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".prod-kostentab .filter-chip").forEach(function (x) { x.classList.remove("filter-chip--active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("filter-chip--active"); b.setAttribute("aria-pressed", "true");
        state.kostenTab = b.getAttribute("data-kosten"); loadKosten();
      });
    });
    $("prod-kosten-search").addEventListener("input", function () { state.kostenSearch = this.value; renderKosten(); });

    // Maand
    $("prod-maand-afsluit-btn").addEventListener("click", openAfsluit);
    $("prod-maand-tbody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action='heropenen']"); if (!btn) return;
      heropenen(parseInt(btn.getAttribute("data-jaar"), 10), parseInt(btn.getAttribute("data-maand"), 10));
    });

    // Modals
    $("prod-toegekend-close").addEventListener("click", closeToegekend);
    $("prod-toegekend-cancel").addEventListener("click", closeToegekend);
    $("prod-toegekend-save").addEventListener("click", saveToegekend);
    $("prod-oversch-close").addEventListener("click", closeOversch);
    $("prod-oversch-cancel").addEventListener("click", closeOversch);
    $("prod-oversch-goedkeuren").addEventListener("click", function () { beslisOversch("goedgekeurd"); });
    $("prod-oversch-afwijzen").addEventListener("click", function () { beslisOversch("afgewezen"); });
    $("prod-afsluit-close").addEventListener("click", closeAfsluit);
    $("prod-afsluit-cancel").addEventListener("click", closeAfsluit);
    $("prod-afsluit-confirm").addEventListener("click", confirmAfsluit);

    // Overlay-klik sluit modals
    ["prod-toegekend-modal", "prod-oversch-modal", "prod-afsluit-modal"].forEach(function (mid) {
      var m = $(mid);
      m.addEventListener("click", function (e) { if (e.target === m) m.style.display = "none"; });
    });
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────────
  function boot() {
    initPeriod();
    wire();
    var done = function () {
      applyAccess();
      if (niveau() > 3) return;
      setView(state.view);
    };
    if (window.productieDB && window.productieDB.getContext) {
      window.productieDB.getContext().then(function (c) { ctx = c || ctx; done(); }).catch(done);
    } else { done(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
