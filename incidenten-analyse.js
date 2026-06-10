/* global window, document */
/**
 * incidenten-analyse.js — page-script voor /incidenten-analyse.html
 * Incidentanalyse, risico & kwaliteit (Embrace the Future).
 *
 * Zeven rol-gegate weergaven: Signalen & advies / Risico's / Analyses /
 * Kwaliteit & positief / Directie / Eigenaar / Rapportages. Rol-context komt
 * uit incident_analyse_context (niveau / is_directie / is_eigenaar); de
 * SECURITY DEFINER-RPC's zijn de echte poort, de UI verbergt enkel wat niet
 * relevant is. Alle cijfers worden live per periode uit Supabase berekend.
 * De "AI-engine" is een deterministische heuristiek — het systeem signaleert
 * uitsluitend patronen, menselijke beoordeling blijft noodzakelijk.
 */
(function () {
  "use strict";

  var ctx = null; // { niveau, kan_zien, is_directie, is_eigenaar, naam }
  var state = {
    view: "signalen",
    dagen: 90,
    sigRows: [], sigNiveau: "", sigVerberg: false,
    riscRows: [], riscKleur: "", riscSearch: "",
    dim: "locatie", dimRows: [],
    rapType: "maand",
    beslisRow: null,
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(n) { return (Number(n) || 0).toLocaleString("nl-NL"); }
  function fmtDatum(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  }
  function toast(kind, msg) { try { if (window.showActionFeedback) return window.showActionFeedback(kind, msg); } catch (e) { /* */ } }
  function showErr(msg) {
    try { if (window.showError) return window.showError(msg); } catch (e) { /* */ }
    try { if (window.showActionFeedback) window.showActionFeedback("error", msg); } catch (e) { /* */ }
  }

  // ─── Rol-helpers ────────────────────────────────────────────────────────────
  function niveau() { return (ctx && typeof ctx.niveau === "number") ? ctx.niveau : 6; }
  function isDirectie() { return !!(ctx && ctx.is_directie); }
  function isEigenaar() { return !!(ctx && ctx.is_eigenaar); }

  // ─── Badges / kleuren (hergebruikt de prod-/wf-huisstijl tokens) ──────────────
  var BADGE_BASE = "display:inline-block;padding:3px 9px;border-radius:var(--r-pill);font-size:var(--font-ui-badge);font-weight:700;";
  function badge(text, style) { return '<span class="badge" style="' + BADGE_BASE + style + '">' + escapeHtml(text) + '</span>'; }
  var KLEUR_STYLE = {
    rood:   "color:var(--red);background:var(--red-soft);",
    oranje: "color:var(--yellow);background:var(--yellow-soft);",
    groen:  "color:var(--green);background:var(--green-soft);",
  };
  var KLEUR_LABEL = { rood: "Rood", oranje: "Oranje", groen: "Groen" };
  function kleurPill(k) { return badge(KLEUR_LABEL[k] || "—", KLEUR_STYLE[k] || "color:var(--text-muted);background:var(--line);"); }
  var NIVEAU_META = {
    hoog:   { label: "Hoog",   style: "color:var(--red);background:var(--red-soft);" },
    let_op: { label: "Let op", style: "color:var(--yellow);background:var(--yellow-soft);" },
    info:   { label: "Info",   style: "color:var(--blue);background:var(--blue-soft);" },
  };
  var BESLIS_META = {
    opgepakt:  { label: "Opgepakt",  style: "color:var(--green);background:var(--green-soft);" },
    afgewezen: { label: "Afgewezen", style: "color:var(--red);background:var(--red-soft);" },
  };
  var TYPE_LABEL = {
    client_risicoprofiel: "Cliënt", locatie_veiligheidsrisico: "Locatie",
    medewerker_betrokkenheid: "Medewerker", gedragswetenschapper_caseload: "Gedragswetenschapper",
    tijd_patroon: "Tijdstip", categorie_trend: "Trend",
  };
  // Trend-cel: stijging incidenten = ongunstig (rood), daling = gunstig (groen).
  // Extreme percentages (door dunne historische vergelijking) cappen we leesbaar.
  function trendCell(pct, opts) {
    opts = opts || {};
    if (pct == null) return '<span class="prod-muted">' + (opts.nieuwLabel || "—") + '</span>';
    var p = Number(pct);
    var capped = (Math.abs(p) >= 1000) ? ((p > 0 ? "+" : "−") + "999%+") : ((p > 0 ? "+" : "") + p + "%");
    var color = p > 0 ? "var(--red)" : (p < 0 ? "var(--green)" : "var(--text-muted)");
    var arrow = p > 0 ? "▲" : (p < 0 ? "▼" : "■");
    return '<span style="color:' + color + ';font-weight:700">' + arrow + " " + escapeHtml(capped) + '</span>';
  }
  // Voor positieve daling-cellen (afname = groen, getoond als positief getal).
  function afnameCell(n) {
    var v = Number(n) || 0;
    return '<span style="color:var(--green);font-weight:700">−' + num(v) + '</span>';
  }

  // ─── View-switch ─────────────────────────────────────────────────────────────
  var VIEWS = ["signalen", "risico", "analyse", "kwaliteit", "directie", "eigenaar", "rapportage"];
  function setVisible(el, show) { if (el) { el.style.display = show ? "" : "none"; el.hidden = !show; } }
  function applyAccess() {
    var blocked = niveau() > 3;
    setVisible($("ia-no-access"), blocked);
    setVisible(document.querySelector(".prod-viewtabs"), !blocked);
    setVisible(document.querySelector(".prod-period"), !blocked);
    setVisible(document.querySelector(".ia-lead"), !blocked);
    if (blocked) { VIEWS.forEach(function (v) { setVisible($("ia-" + v + "-view"), false); }); return; }
    setVisible($("ia-view-directie"), isDirectie());
    setVisible($("ia-view-eigenaar"), isEigenaar());
    if (state.view === "directie" && !isDirectie()) state.view = "signalen";
    if (state.view === "eigenaar" && !isEigenaar()) state.view = "signalen";
  }
  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = "signalen";
    if (v === "directie" && !isDirectie()) v = "signalen";
    if (v === "eigenaar" && !isEigenaar()) v = "signalen";
    state.view = v;
    document.querySelectorAll(".prod-viewtabs .filter-chip").forEach(function (b) {
      var on = b.getAttribute("data-view") === v;
      b.classList.toggle("filter-chip--active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    VIEWS.forEach(function (name) { setVisible($("ia-" + name + "-view"), name === v); });
    loadActiveView();
  }
  function loadActiveView() {
    if (niveau() > 3) return;
    if (state.view === "signalen") return loadSignalen();
    if (state.view === "risico") return loadRisico();
    if (state.view === "analyse") return loadAnalyse();
    if (state.view === "kwaliteit") return loadKwaliteit();
    if (state.view === "directie") return loadDirectie();
    if (state.view === "eigenaar") return loadEigenaar();
    if (state.view === "rapportage") return loadRapportage();
  }

  // ─── Signalen & advies ─────────────────────────────────────────────────────────
  function loadSignalen() {
    var list = $("ia-sig-list");
    list.innerHTML = '<div class="prod-loading">De analyse-engine speurt naar patronen…</div>';
    window.incidentAnalyseDB.signalen(state.dagen).then(function (rows) {
      state.sigRows = Array.isArray(rows) ? rows : [];
      renderSignalen();
    });
  }
  function sigFiltered() {
    return state.sigRows.filter(function (r) {
      if (state.sigNiveau && r.niveau !== state.sigNiveau) return false;
      if (state.sigVerberg && r.status && r.status !== "open") return false;
      return true;
    });
  }
  function renderSignalen() {
    var rows = sigFiltered();
    var list = $("ia-sig-list");
    // KPI-strip (op de volledige set, niet de filter)
    var hoog = state.sigRows.filter(function (r) { return r.niveau === "hoog"; }).length;
    var letop = state.sigRows.filter(function (r) { return r.niveau === "let_op"; }).length;
    var open = state.sigRows.filter(function (r) { return !r.status || r.status === "open"; }).length;
    var beoordeeld = state.sigRows.length - open;
    $("ia-sig-kpi-hoog").textContent = num(hoog);
    $("ia-sig-kpi-letop").textContent = num(letop);
    $("ia-sig-kpi-open").textContent = num(open);
    $("ia-sig-kpi-beoordeeld").textContent = num(beoordeeld);

    if (!rows.length) {
      list.innerHTML = '<div class="wf-rec-empty"><p class="prod-empty-title">Geen signalen</p>' +
        '<p class="prod-empty-sub">De analyse-engine vond geen patronen die aandacht vragen voor deze periode en filters. Dat is goed nieuws.</p></div>';
      return;
    }
    list.innerHTML = rows.map(function (r) {
      var nm = NIVEAU_META[r.niveau] || NIVEAU_META.info;
      var statusHtml = "", beslisInfo = "";
      if (r.status && r.status !== "open" && BESLIS_META[r.status]) {
        statusHtml = badge(BESLIS_META[r.status].label, BESLIS_META[r.status].style);
        beslisInfo = '<span class="wf-rec-beslis">' + escapeHtml(r.besloten_door_naam || "") +
          (r.besloten_op ? " · " + fmtDatum(r.besloten_op) : "") + '</span>';
      }
      var acties = (Array.isArray(r.acties) ? r.acties : []).map(function (a) {
        return '<span class="ia-actie-chip">' + escapeHtml(a) + '</span>';
      }).join("");
      var btn = (r.status && r.status !== "open")
        ? '<button type="button" class="btn-outline prod-mini-btn" data-action="heropenen" data-sleutel="' + escapeHtml(r.sleutel) + '">Heropenen</button>'
        : '<button type="button" class="btn-outline prod-mini-btn" data-action="beoordelen" data-sleutel="' + escapeHtml(r.sleutel) + '">Beoordelen</button>';
      return '<div class="wf-rec ia-rec--' + escapeHtml(r.niveau || "info") + '">' +
        '<div class="wf-rec-head">' +
          '<div class="wf-rec-tags">' + badge(nm.label, nm.style) +
            '<span class="wf-rec-type">' + escapeHtml(TYPE_LABEL[r.type] || r.type) + '</span>' +
            (r.entiteit ? '<span class="wf-rec-loc">' + escapeHtml(r.entiteit) + '</span>' : '') +
            statusHtml +
          '</div>' +
          '<div class="wf-rec-actions">' + btn + '</div>' +
        '</div>' +
        '<div class="wf-rec-title">' + escapeHtml(r.titel || "") + '</div>' +
        '<div class="wf-rec-body">' + escapeHtml(r.onderbouwing || "") + '</div>' +
        (r.advies ? '<div class="ia-rec-advies"><strong>Advies:</strong> ' + escapeHtml(r.advies) + '</div>' : '') +
        (acties ? '<div class="ia-rec-acties">' + acties + '</div>' : '') +
        (beslisInfo || r.notitie ? '<div class="wf-rec-meta">' + beslisInfo +
          (r.notitie ? '<span class="wf-rec-note">“' + escapeHtml(r.notitie) + '”</span>' : '') + '</div>' : '') +
      '</div>';
    }).join("");
  }

  // ─── Modal: signaal beoordelen ───────────────────────────────────────────────
  function openBeslis(sleutel) {
    var r = state.sigRows.find(function (x) { return String(x.sleutel) === String(sleutel); });
    if (!r) return;
    state.beslisRow = r;
    $("ia-beslis-context").textContent = (TYPE_LABEL[r.type] || r.type) + (r.entiteit ? " — " + r.entiteit : "");
    $("ia-beslis-meta").innerHTML = '<strong>' + escapeHtml(r.titel || "") + '</strong><br>' + escapeHtml(r.onderbouwing || "");
    $("ia-beslis-advies").innerHTML = r.advies ? '<strong>Voorgesteld:</strong> ' + escapeHtml(r.advies) : "";
    $("ia-beslis-notitie").value = r.notitie || "";
    var cur = $("ia-beslis-current");
    if (r.status && r.status !== "open" && BESLIS_META[r.status]) {
      cur.hidden = false;
      cur.innerHTML = "Huidige beslissing: <strong>" + escapeHtml(BESLIS_META[r.status].label) + "</strong>";
    } else { cur.hidden = true; cur.innerHTML = ""; }
    $("ia-beslis-modal").style.display = "flex";
  }
  function closeBeslis() { $("ia-beslis-modal").style.display = "none"; state.beslisRow = null; }
  function submitBeslis(status) {
    var r = state.beslisRow;
    if (!r) return;
    var notitie = $("ia-beslis-notitie").value.trim();
    window.incidentAnalyseDB.beslis(r.sleutel, r.type, r.entiteit_type, r.entiteit, r.titel, status, notitie)
      .then(function () {
        toast("saved", "Signaal " + (status === "opgepakt" ? "opgepakt" : "afgewezen"));
        closeBeslis(); loadSignalen();
      }).catch(function (err) { showErr("Beslissing mislukt: " + (err && err.message || err)); });
  }
  function heropenen(sleutel) {
    var r = state.sigRows.find(function (x) { return String(x.sleutel) === String(sleutel); });
    if (!r) return;
    window.incidentAnalyseDB.beslis(r.sleutel, r.type, r.entiteit_type, r.entiteit, r.titel, "open", null)
      .then(function () { toast("restored", "Signaal heropend"); loadSignalen(); })
      .catch(function (err) { showErr("Heropenen mislukt: " + (err && err.message || err)); });
  }

  // ─── Risico's (Top 10 + risicoscores) ─────────────────────────────────────────
  function loadRisico() {
    $("ia-top-clienten").innerHTML = '<tr><td colspan="4" class="prod-loading">Laden…</td></tr>';
    $("ia-top-locaties").innerHTML = '<tr><td colspan="4" class="prod-loading">Laden…</td></tr>';
    $("ia-top-trends").innerHTML = '<tr><td colspan="4" class="prod-loading">Laden…</td></tr>';
    window.incidentAnalyseDB.top(state.dagen).then(function (t) {
      t = t || {};
      $("ia-top-clienten").innerHTML = (t.clienten && t.clienten.length) ? t.clienten.map(function (c) {
        return '<tr><td>' + escapeHtml(c.naam) + '</td><td>' + escapeHtml(c.locatie || "—") + '</td><td>' + num(c.incidenten) +
          '</td><td>' + (Number(c.kritiek) > 0 ? '<strong style="color:var(--red)">' + num(c.kritiek) + '</strong>' : "0") + '</td></tr>';
      }).join("") : '<tr><td colspan="4" class="prod-empty-cell">Geen cliënten met incidenten.</td></tr>';
      $("ia-top-locaties").innerHTML = (t.locaties && t.locaties.length) ? t.locaties.map(function (l) {
        return '<tr><td>' + escapeHtml(l.locatie) + '</td><td>' + num(l.incidenten) + '</td><td>' + num(l.veiligheid) +
          '</td><td>' + trendCell(l.trend_pct, { nieuwLabel: "—" }) + '</td></tr>';
      }).join("") : '<tr><td colspan="4" class="prod-empty-cell">Geen locaties met incidenten.</td></tr>';
      $("ia-top-trends").innerHTML = (t.trends && t.trends.length) ? t.trends.map(function (tr) {
        return '<tr><td>' + escapeHtml(tr.categorie) + '</td><td>' + num(tr.incidenten) + '</td><td>' + num(tr.vorige_periode) +
          '</td><td>' + trendCell(tr.trend_pct, { nieuwLabel: "nieuw" }) + '</td></tr>';
      }).join("") : '<tr><td colspan="4" class="prod-empty-cell">Geen trends.</td></tr>';
    });
    var tb = $("ia-risc-tbody");
    tb.innerHTML = '<tr><td colspan="8" class="prod-loading">Risicoscores berekenen…</td></tr>';
    window.incidentAnalyseDB.risicoscores(30).then(function (rows) {
      state.riscRows = Array.isArray(rows) ? rows : [];
      renderRisico();
    });
  }
  function riscFiltered() {
    var q = state.riscSearch.trim().toLowerCase();
    return state.riscRows.filter(function (r) {
      if (state.riscKleur && r.kleur !== state.riscKleur) return false;
      if (q && (r.client_naam || "").toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderRisico() {
    var rows = riscFiltered();
    var tb = $("ia-risc-tbody");
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="8" class="prod-empty-cell">Geen cliënten met incidenten in de laatste 30 dagen.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.client_naam || "—") + '</td>' +
          '<td>' + escapeHtml(r.locatie || "—") + '</td>' +
          '<td>' + num(r.incidenten) + '</td>' +
          '<td>' + num(r.agressie) + '</td>' +
          '<td>' + num(r.weglopen) + '</td>' +
          '<td>' + (Number(r.herhaling) > 0 ? '<strong>' + num(r.herhaling) + '×</strong>' : "—") + '</td>' +
          '<td><div class="ia-score-bar"><div class="ia-score-fill ia-score-fill--' + escapeHtml(r.kleur) + '" style="width:' + Math.max(0, Math.min(100, Number(r.score) || 0)) + '%"></div><span class="ia-score-label">' + num(r.score) + '</span></div></td>' +
          '<td>' + kleurPill(r.kleur) + '</td>' +
        '</tr>';
      }).join("");
    }
    $("ia-risc-range").textContent = rows.length + " van " + state.riscRows.length;
  }

  // ─── Analyses (dimensie) ───────────────────────────────────────────────────────
  var DIM_LABEL = {
    locatie: "Locatie / team", client: "Cliënt", medewerker: "Medewerker",
    gedragswetenschapper: "Gedragswetenschapper", tijd: "Tijdstip", categorie: "Categorie",
  };
  var DIM_NOTE = {
    medewerker: "Op basis van de meldende medewerker. Dit is GEEN beoordeling van functioneren — uitsluitend een patroon ter ondersteuning.",
    gedragswetenschapper: "Op basis van de aan de cliënt gekoppelde gedragswetenschapper. Cliënten zonder koppeling tellen mee onder \"Onbekend / niet gekoppeld\".",
    locatie: "Een locatie staat hier gelijk aan een team/woongroep. Incidenten zonder eigen locatie worden afgeleid via de cliënt.",
  };
  function loadAnalyse() {
    $("ia-dim-col").textContent = DIM_LABEL[state.dim] || "Dimensie";
    var note = $("ia-dim-note");
    if (DIM_NOTE[state.dim]) { note.hidden = false; note.textContent = DIM_NOTE[state.dim]; } else { note.hidden = true; }
    var tb = $("ia-dim-tbody");
    tb.innerHTML = '<tr><td colspan="9" class="prod-loading">Laden…</td></tr>';
    window.incidentAnalyseDB.dimensie(state.dim, state.dagen).then(function (rows) {
      state.dimRows = Array.isArray(rows) ? rows : [];
      renderAnalyse();
    });
  }
  function renderAnalyse() {
    var rows = state.dimRows;
    var tb = $("ia-dim-tbody");
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="9" class="prod-empty-cell">Geen gegevens voor deze dimensie en periode.</td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.label || "—") + '</td>' +
          '<td>' + num(r.incidenten) + '</td>' +
          '<td class="prod-muted">' + num(r.vorige) + '</td>' +
          '<td>' + trendCell(r.trend_pct) + '</td>' +
          '<td>' + (r.ernst_gem == null ? "—" : Number(r.ernst_gem).toLocaleString("nl-NL")) + '</td>' +
          '<td>' + num(r.agressie) + '</td>' +
          '<td>' + num(r.weglopen) + '</td>' +
          '<td>' + num(r.veiligheid) + '</td>' +
          '<td>' + num(r.opgelost) + '</td>' +
        '</tr>';
      }).join("");
    }
    $("ia-dim-range").textContent = rows.length + " regel(s)";
  }

  // ─── Kwaliteit & positief ──────────────────────────────────────────────────────
  function loadKwaliteit() {
    window.incidentAnalyseDB.positieveKpis(state.dagen).then(function (k) {
      k = k || {};
      var dz = k.dagen_zonder || [];
      var topDagen = dz.length ? dz[0] : null;
      $("ia-kw-kpi-dagen").textContent = topDagen ? num(topDagen.dagen) : "—";
      $("ia-kw-kpi-dagen-sub").textContent = topDagen ? (topDagen.locatie + " — sinds " + fmtDatum(topDagen.laatste)) : "dagen op één locatie";
      $("ia-kw-kpi-herstel").textContent = (k.hersteltijd_dagen == null) ? "—" : Number(k.hersteltijd_dagen).toLocaleString("nl-NL") + " d";
      $("ia-kw-kpi-herstel-sub").textContent = "op " + num(k.hersteltijd_n || 0) + " opgeloste incidenten";
      $("ia-kw-kpi-dalers").textContent = num((k.dalers || []).length);
      $("ia-kw-kpi-maatregelen").textContent = num(k.maatregelen_afgerond || 0);
      $("ia-kw-kpi-maatregelen-sub").textContent = "lopend: " + num(k.maatregelen_lopend || 0);

      $("ia-kw-dagen").innerHTML = dz.length ? dz.map(function (d) {
        return '<tr><td>' + escapeHtml(d.locatie) + '</td><td><strong style="color:var(--green)">' + num(d.dagen) + '</strong></td><td class="prod-muted">' + fmtDatum(d.laatste) + '</td></tr>';
      }).join("") : '<tr><td colspan="3" class="prod-empty-cell">Geen gegevens.</td></tr>';
      var dl = k.dalers || [];
      $("ia-kw-dalers").innerHTML = dl.length ? dl.map(function (d) {
        return '<tr><td>' + escapeHtml(d.naam) + '</td><td>' + num(d.nu) + '</td><td class="prod-muted">' + num(d.eerder) + '</td><td>' + afnameCell(d.minder) + '</td></tr>';
      }).join("") : '<tr><td colspan="4" class="prod-empty-cell">Geen dalers in deze periode.</td></tr>';
      var tv = k.team_verbetering || [];
      $("ia-kw-teams").innerHTML = tv.length ? tv.map(function (t) {
        return '<tr><td>' + escapeHtml(t.locatie) + '</td><td>' + num(t.nu) + '</td><td class="prod-muted">' + num(t.eerder) + '</td><td>' + afnameCell(t.minder) + (t.pct != null ? ' <span class="prod-muted">(' + num(t.pct) + '%)</span>' : '') + '</td></tr>';
      }).join("") : '<tr><td colspan="4" class="prod-empty-cell">Geen verbeterende teams in deze periode.</td></tr>';
    });
    var mb = $("ia-kw-maatregelen");
    mb.innerHTML = '<tr><td colspan="6" class="prod-loading">Laden…</td></tr>';
    window.incidentAnalyseDB.maatregelEffect().then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      if (!rows.length) {
        mb.innerHTML = '<tr><td colspan="6" class="prod-empty-cell">Nog geen verbetermaatregelen met voldoende meetperiode. Voeg maatregelen toe via <a href="verbeteringsmaatregelen" class="prod-inline-link">Verbeteringsmaatregelen</a>.</td></tr>';
        return;
      }
      var OORDEEL = {
        positief: "color:var(--green);background:var(--green-soft);",
        negatief: "color:var(--red);background:var(--red-soft);",
        "geen aantoonbaar effect": "color:var(--yellow);background:var(--yellow-soft);",
        "onvoldoende data": "color:var(--text-muted);background:var(--line);",
      };
      mb.innerHTML = rows.map(function (m) {
        return '<tr><td>' + escapeHtml(m.titel) + '</td><td class="prod-muted">' + fmtDatum(m.peildatum) + '</td><td>' + num(m.voor) +
          '</td><td>' + num(m.na) + '</td><td>' + (m.effect_pct == null ? "—" : trendCell(m.effect_pct)) +
          '</td><td>' + badge(m.oordeel, OORDEEL[m.oordeel] || OORDEEL["onvoldoende data"]) + '</td></tr>';
      }).join("");
    });
  }

  // ─── Directie ──────────────────────────────────────────────────────────────────
  function loadDirectie() {
    window.incidentAnalyseDB.directieKpis(state.dagen).then(function (k) {
      k = k || {};
      $("ia-dir-kpi-totaal").textContent = num(k.incidenten || 0);
      $("ia-dir-kpi-trend").innerHTML = "trend " + trendCell(k.trend_pct);
      $("ia-dir-kpi-ernstig").textContent = num(k.ernstige || 0);
      $("ia-dir-kpi-inspectie").textContent = "inspectierisico: " + num(k.inspectierisico || 0) + " open & ernstig";
      $("ia-dir-kpi-open").textContent = num(k.open || 0);
      $("ia-dir-kpi-opgelost").textContent = "opgelost: " + (k.opgelost_pct == null ? "—" : num(k.opgelost_pct) + "%");
      $("ia-dir-kpi-doorloop").textContent = (k.doorlooptijd_dagen == null) ? "—" : Number(k.doorlooptijd_dagen).toLocaleString("nl-NL") + " d";
      $("ia-dir-kpi-locaties").textContent = num(k.locaties_risico || 0);
      $("ia-dir-kpi-maatregelen").textContent = num(k.open_maatregelen || 0);
    });
  }

  // ─── Eigenaar ──────────────────────────────────────────────────────────────────
  function loadEigenaar() {
    window.incidentAnalyseDB.eigenaarKpis().then(function (k) {
      k = k || {};
      $("ia-eig-q").textContent = num(k.q_huidig || 0);
      $("ia-eig-q-trend").innerHTML = "t.o.v. vorig kwartaal " + trendCell(k.q_pct);
      $("ia-eig-ernstig").textContent = num(k.ernstig_q || 0);
      $("ia-eig-ernstig-sub").textContent = "vorig kwartaal " + num(k.ernstig_q_vorig || 0);
      $("ia-eig-toploc").textContent = k.top_locatie || "—";
      $("ia-eig-toploc-sub").textContent = num(k.top_locatie_n || 0) + " incidenten dit kwartaal";
      $("ia-eig-compliance").textContent = (k.compliance == null) ? "—" : num(k.compliance) + "%";
      $("ia-eig-doorloop").textContent = (k.doorlooptijd_dagen == null) ? "—" : Number(k.doorlooptijd_dagen).toLocaleString("nl-NL") + " d";
      $("ia-eig-maatregelen").textContent = num(k.open_maatregelen || 0);
      $("ia-eig-qoq").innerHTML = trendCell(k.q_pct);
      $("ia-eig-qoq-sub").textContent = num(k.q_huidig || 0) + " vs. " + num(k.q_vorig || 0) + " incidenten";
      $("ia-eig-yoy").innerHTML = trendCell(k.j_pct);
      $("ia-eig-yoy-sub").textContent = num(k.j_huidig || 0) + " vs. " + num(k.j_vorig || 0) + " incidenten";
    });
  }

  // ─── Rapportages ───────────────────────────────────────────────────────────────
  function loadRapportage() {
    var inner = $("ia-rap-inner");
    inner.innerHTML = '<div class="prod-loading">Rapport samenstellen…</div>';
    Promise.all([
      window.incidentAnalyseDB.directieKpis(state.dagen),
      window.incidentAnalyseDB.top(state.dagen),
      window.incidentAnalyseDB.signalen(state.dagen),
      window.incidentAnalyseDB.positieveKpis(state.dagen),
    ]).then(function (res) {
      renderRapportage(res[0] || {}, res[1] || {}, res[2] || [], res[3] || {});
    });
  }
  function rapTable(title, headers, rows) {
    return '<h3 class="ia-rap-h">' + escapeHtml(title) + '</h3>' +
      '<table class="ia-rap-table"><thead><tr>' + headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join("") + '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join("") + '</tr>'; }).join("") :
        '<tr><td colspan="' + headers.length + '" class="prod-muted">Geen gegevens.</td></tr>') +
      '</tbody></table>';
  }
  function renderRapportage(dir, top, sig, pos) {
    var isKw = state.rapType === "kwartaal";
    var titel = isKw ? "Kwartaalrapportage incidenten, risico &amp; kwaliteit" : "Maandrapportage incidenten, risico &amp; kwaliteit";
    var doel = isKw
      ? "Voor: directie, eigenaren en (indien van toepassing) Raad van Toezicht. Strategische risicoanalyse, kwaliteits- en veiligheidsontwikkeling, organisatiebrede trends en aanbevelingen."
      : "Voor: Beleid &amp; Kwaliteit en directie. Trends, risico's, verbetermaatregelen, openstaande acties en herhalingsincidenten.";
    var nu = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

    var html = '<div class="ia-rap-head">' +
      '<img class="ia-rap-logo" src="assets/etf-logo.png" alt="Embrace the Future" width="160" height="55">' +
      '<div><h2 class="ia-rap-title">' + titel + '</h2>' +
      '<p class="ia-rap-sub">Embrace the Future · gegenereerd op ' + escapeHtml(nu) + ' · periode: laatste ' + state.dagen + ' dagen</p>' +
      '<p class="ia-rap-sub">' + doel + '</p></div></div>';

    // 1. Kerncijfers
    html += rapTable("1. Kerncijfers", ["Indicator", "Waarde"], [
      ["Incidenten in de periode", "<strong>" + num(dir.incidenten || 0) + "</strong>"],
      ["Trend t.o.v. vorige periode", trendCell(dir.trend_pct)],
      ["Ernstige incidenten", num(dir.ernstige || 0)],
      ["Open incidenten", num(dir.open || 0)],
      ["Afgehandeld", (dir.opgelost_pct == null ? "—" : num(dir.opgelost_pct) + "%")],
      ["Gem. doorlooptijd (dagen)", (dir.doorlooptijd_dagen == null ? "—" : Number(dir.doorlooptijd_dagen).toLocaleString("nl-NL"))],
      ["Risicolocaties", num(dir.locaties_risico || 0)],
      ["Inspectierisico (open & ernstig)", num(dir.inspectierisico || 0)],
      ["Open verbetermaatregelen", num(dir.open_maatregelen || 0)],
    ]);

    // 2. Top risicocliënten
    html += rapTable("2. Top risicocliënten", ["Cliënt", "Locatie", "Incidenten", "Ernstig"],
      (top.clienten || []).slice(0, 10).map(function (c) {
        return [escapeHtml(c.naam), escapeHtml(c.locatie || "—"), num(c.incidenten), num(c.kritiek)];
      }));

    // 3. Top risicolocaties
    html += rapTable("3. Top risicolocaties", ["Locatie", "Incidenten", "Veiligheid", "Trend"],
      (top.locaties || []).slice(0, 10).map(function (l) {
        return [escapeHtml(l.locatie), num(l.incidenten), num(l.veiligheid), trendCell(l.trend_pct)];
      }));

    // 4. Trends
    html += rapTable("4. Trendontwikkeling per categorie", ["Categorie", "Nu", "Eerder", "Trend"],
      (top.trends || []).slice(0, 10).map(function (t) {
        return [escapeHtml(t.categorie), num(t.incidenten), num(t.vorige_periode), trendCell(t.trend_pct, { nieuwLabel: "nieuw" })];
      }));

    // 5. Risicosignalen & aanbevelingen
    html += rapTable("5. Risicosignalen & aanbevelingen", ["Niveau", "Signaal", "Onderbouwing", "Advies"],
      (sig || []).slice(0, 20).map(function (s) {
        var nm = NIVEAU_META[s.niveau] || NIVEAU_META.info;
        return [badge(nm.label, nm.style), escapeHtml(s.titel || ""), escapeHtml(s.onderbouwing || ""), escapeHtml(s.advies || "")];
      }));

    // 6. Positieve ontwikkeling
    html += rapTable("6. Positieve ontwikkeling (kwaliteit)", ["Indicator", "Waarde"], [
      ["Langste reeks zonder incident", ((pos.dagen_zonder || [])[0] ? num(pos.dagen_zonder[0].dagen) + " dagen (" + escapeHtml(pos.dagen_zonder[0].locatie) + ")" : "—")],
      ["Cliënten met afnemende incidenten", num((pos.dalers || []).length)],
      ["Teams met verbetering", num((pos.team_verbetering || []).length)],
      ["Gem. tijd tot herstel (dagen)", (pos.hersteltijd_dagen == null ? "—" : Number(pos.hersteltijd_dagen).toLocaleString("nl-NL"))],
      ["Afgeronde verbetermaatregelen", num(pos.maatregelen_afgerond || 0)],
    ]);

    html += '<p class="ia-rap-foot">Dit rapport is automatisch gegenereerd op basis van geregistreerde incidenten. Het systeem signaleert patronen; menselijke beoordeling en duiding blijven noodzakelijk. Vertrouwelijk — uitsluitend voor intern gebruik.</p>';

    $("ia-rap-inner").innerHTML = html;
  }

  // ─── Event-listeners ─────────────────────────────────────────────────────────
  function wire() {
    $("ia-period").addEventListener("change", function () { state.dagen = parseInt(this.value, 10) || 90; loadActiveView(); });
    $("ia-print-btn").addEventListener("click", function () {
      if (state.view !== "rapportage") { setView("rapportage"); setTimeout(function () { window.print(); }, 600); }
      else window.print();
    });
    document.querySelectorAll(".prod-viewtabs .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });

    // Signalen-filters
    wireChips(".ia-sigfilter", "niveau", function (val) { state.sigNiveau = val; renderSignalen(); });
    $("ia-sig-verberg").addEventListener("change", function () { state.sigVerberg = this.checked; renderSignalen(); });
    $("ia-sig-list").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]"); if (!btn) return;
      var a = btn.getAttribute("data-action"), sl = btn.getAttribute("data-sleutel");
      if (a === "beoordelen") openBeslis(sl); else if (a === "heropenen") heropenen(sl);
    });

    // Risico-filters
    wireChips(".ia-riscfilter", "kleur", function (val) { state.riscKleur = val; renderRisico(); });
    $("ia-risc-search").addEventListener("input", function () { state.riscSearch = this.value; renderRisico(); });

    // Analyse-dimensie
    wireChips(".ia-dimfilter", "dim", function (val) { state.dim = val || "locatie"; loadAnalyse(); });

    // Rapportage-type
    wireChips(".ia-rapfilter", "rap", function (val) { state.rapType = val || "maand"; loadRapportage(); });

    // Modal
    $("ia-beslis-close").addEventListener("click", closeBeslis);
    $("ia-beslis-cancel").addEventListener("click", closeBeslis);
    $("ia-beslis-opvolgen").addEventListener("click", function () { submitBeslis("opgepakt"); });
    $("ia-beslis-afwijzen").addEventListener("click", function () { submitBeslis("afgewezen"); });
    var m = $("ia-beslis-modal");
    m.addEventListener("click", function (e) { if (e.target === m) closeBeslis(); });
  }
  function wireChips(sel, attr, cb) {
    document.querySelectorAll(sel + " .filter-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(sel + " .filter-chip").forEach(function (x) { x.classList.remove("filter-chip--active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("filter-chip--active"); b.setAttribute("aria-pressed", "true");
        cb(b.getAttribute("data-" + attr) || "");
      });
    });
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────────
  function boot() {
    wire();
    var done = function () {
      applyAccess();
      if (niveau() > 3) return;
      setView(state.view);
    };
    if (window.incidentAnalyseDB && window.incidentAnalyseDB.getContext) {
      window.incidentAnalyseDB.getContext().then(function (c) { ctx = c || ctx; done(); }).catch(done);
    } else { done(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
