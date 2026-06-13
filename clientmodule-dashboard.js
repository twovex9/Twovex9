/* global window, document */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
  function eurFmt(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  }
  function reisLabel(slug) {
    if (window.ffClientreis && typeof window.ffClientreis.label === "function") return window.ffClientreis.label(slug);
    return slug || "—";
  }
  function clientLink(id, label) {
    return '<a href="client-detail?id=' + encodeURIComponent(id || "") + '" class="client-detail-inline-a">' + esc(label) + "</a>";
  }
  function ensureOplossenHeader(tbodyId, label) {
    var tbody = $(tbodyId);
    if (!tbody) return;
    var table = tbody.closest ? tbody.closest("table") : null;
    if (!table) return;
    var headRow = table.querySelector("thead tr");
    if (!headRow || headRow.querySelector("th[data-col='oplossen']")) return;
    var th = document.createElement("th");
    th.setAttribute("data-col", "oplossen");
    th.textContent = label || "";
    headRow.appendChild(th);
  }
  function oplossenCel(clientId) {
    if (!window.ffOplossen) return "<td></td>";
    return "<td>" + window.ffOplossen.navBtn(
      "client-detail?id=" + encodeURIComponent(clientId || ""),
      "Naar dossier",
      "Open het cliëntdossier om de openstaande issues (zorgplan/beschikking/signalering) op te lossen."
    ) + "</td>";
  }
  function kpiTile(label, value, klasse) {
    return '<div class="cmd-kpi-tile' + (klasse ? " " + klasse : "") + '"><div class="cmd-kpi-value">' + esc(value) + '</div><div class="cmd-kpi-label">' + esc(label) + "</div></div>";
  }

  var VIEW_LABELS = {
    caseload_gw: "Caseload GW",
    zorgcoordinator: "Zorgcoördinator",
    directeur: "Directeur",
    eigenaar: "Eigenaar",
    kpi: "KPI's",
  };

  var ctx = { rollen: [], admin_tier: false, views: [], tarieven_zichtbaar: false };
  var actief = null;

  async function fetchCtx() {
    if (window.ffSupabaseReady) { try { await window.ffSupabaseReady; } catch (e) { /* */ } }
    var r = await window.ffSupabase.rpc("clientdash_context");
    if (r.error) throw r.error;
    return r.data || ctx;
  }

  function renderChips() {
    var wrap = $("cmd-viewchips");
    if (!wrap) return;
    wrap.innerHTML = (ctx.views || []).map(function (v) {
      return '<button type="button" class="filter-chip" data-view="' + esc(v) + '">' + esc(VIEW_LABELS[v] || v) + "</button>";
    }).join("");
    Array.prototype.forEach.call(wrap.querySelectorAll(".filter-chip"), function (btn) {
      btn.addEventListener("click", function () { setView(btn.getAttribute("data-view")); });
    });
  }

  function setView(name) {
    actief = name;
    Array.prototype.forEach.call(document.querySelectorAll(".filter-chip"), function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".cmd-view"), function (sec) {
      var on = sec.id === "cmd-view-" + name;
      sec.hidden = !on;
      sec.style.display = on ? "" : "none";
    });
    loadView(name);
  }

  async function loadView(name) {
    if (name === "caseload_gw") return loadGw();
    if (name === "zorgcoordinator") return loadZc();
    if (name === "directeur") return loadDir();
    if (name === "eigenaar") return loadEig();
    if (name === "kpi") return loadKpi();
  }

  async function loadGw() {
    var r = await window.ffSupabase.rpc("clientdash_caseload_gw");
    if (r.error) { if (window.showError) window.showError("Caseload GW: " + r.error.message); return; }
    var d = r.data || {};
    var k = d.kpi || {};
    $("cmd-gw-kpis").innerHTML =
      kpiTile("Caseload", k.totaal_caseload || 0) +
      kpiTile("Evaluatie binnen 30d", k.evaluaties_30d || 0, "cmd-kpi--oranje") +
      kpiTile("Zonder actief zorgplan", k.zonder_zorgplan || 0, "cmd-kpi--rood") +
      kpiTile("Open dossier-issues", k.open_issues_totaal || 0);
    ensureOplossenHeader("cmd-gw-tbody", "Oplossen");
    var rows = (d.clienten || []).map(function (c) {
      var dagen = c.dagen_tot_evaluatie;
      var evalCel = c.evaluatiemoment
        ? esc(c.evaluatiemoment) + (dagen != null ? ' <span class="cmd-mut">(' + (dagen < 0 ? "verlopen" : dagen + "d") + ")</span>" : "")
        : "—";
      return "<tr>" +
        "<td>" + clientLink(c.client_id, c.naam || "—") + "</td>" +
        "<td>" + esc(c.locatie || "—") + "</td>" +
        "<td>" + esc(reisLabel(c.reis_status)) + "</td>" +
        "<td>" + (c.zorgplan_titel ? esc(c.zorgplan_titel) : '<span class="cmd-mut">geen</span>') + "</td>" +
        "<td>" + evalCel + "</td>" +
        "<td>" + (c.signaleringsplan_actief ? "✓" : '<span class="cmd-mut">—</span>') + "</td>" +
        "<td>" + (Number(c.open_issues) > 0 ? '<span class="cmd-pill cmd-pill--rood">' + esc(c.open_issues) + "</span>" : "0") + "</td>" +
        (Number(c.open_issues) > 0 ? oplossenCel(c.client_id) : "<td></td>") +
      "</tr>";
    }).join("");
    var gwTbody = $("cmd-gw-tbody");
    gwTbody.innerHTML = rows || '<tr><td colspan="8" class="client-detail-placeholder">Geen cliënten in uw caseload.</td></tr>';
    if (window.ffOplossen) window.ffOplossen.bindSignals(gwTbody);
  }

  async function loadZc() {
    var r = await window.ffSupabase.rpc("clientdash_zorgcoordinator");
    if (r.error) { if (window.showError) window.showError("Zorgcoörd: " + r.error.message); return; }
    var d = r.data || {};
    $("cmd-zc-loc-tbody").innerHTML = (d.per_locatie || []).map(function (x) {
      return "<tr><td>" + esc(x.locatie) + "</td><td>" + esc(x.totaal) + "</td><td>" + esc(x.actief) +
        "</td><td>" + esc(x.gepauzeerd) + "</td><td>" + esc(x.wachtlijst) + "</td><td>" + esc(x.intake_gepland) + "</td></tr>";
    }).join("") || '<tr><td colspan="6" class="client-detail-placeholder">—</td></tr>';
    ensureOplossenHeader("cmd-zc-issues-tbody", "Oplossen");
    var zcIssuesTbody = $("cmd-zc-issues-tbody");
    zcIssuesTbody.innerHTML = (d.top_open_issues || []).map(function (i) {
      return "<tr><td>" + clientLink(i.client_id, i.naam || "—") + "</td>" +
        '<td><span class="cmd-pill cmd-pill--rood">' + esc(i.rood) + "</span></td>" +
        '<td><span class="cmd-pill cmd-pill--oranje">' + esc(i.oranje) + "</span></td>" +
        "<td>" + esc(i.aantal_issues) + "</td>" +
        oplossenCel(i.client_id) + "</tr>";
    }).join("") || '<tr><td colspan="5" class="client-detail-placeholder">Geen openstaande issues.</td></tr>';
    if (window.ffOplossen) window.ffOplossen.bindSignals(zcIssuesTbody);
  }

  async function loadDir() {
    var r = await window.ffSupabase.rpc("clientdash_directeur");
    if (r.error) { if (window.showError) window.showError("Directeur: " + r.error.message); return; }
    var d = r.data || {};
    var k = d.kpi || {};
    $("cmd-dir-kpis").innerHTML =
      kpiTile("Actieve cliënten", k.actief || 0) +
      kpiTile("Wachtlijst", k.wachtlijst || 0) +
      kpiTile("Aanmeldingen 30d", k.aanmeldingen_30d || 0) +
      kpiTile("Uitstroom 90d", k.uitstroom_90d || 0) +
      kpiTile("Beschikking ≤60d", k.beschikkingen_verlopen_60d || 0, "cmd-kpi--oranje") +
      kpiTile("Open dossier-issues", k.open_dossier_issues || 0, "cmd-kpi--rood");
    $("cmd-dir-funnel-tbody").innerHTML = (d.funnel || []).map(function (x) {
      return "<tr><td>" + esc(reisLabel(x.status)) + "</td><td>" + esc(x.aantal) + "</td></tr>";
    }).join("");
    if (Array.isArray(d.omzet_per_gemeente) && d.omzet_per_gemeente.length) {
      $("cmd-dir-omzet-h").hidden = false;
      $("cmd-dir-omzet-card").hidden = false;
      $("cmd-dir-omzet-card").style.display = "";
      $("cmd-dir-omzet-tbody").innerHTML = d.omzet_per_gemeente.map(function (g) {
        return "<tr><td>" + esc(g.gemeente) + "</td><td>" + esc(g.aantal_facturen) + "</td><td>" + esc(eurFmt(g.omzet)) + "</td></tr>";
      }).join("");
    } else {
      $("cmd-dir-omzet-h").hidden = true;
      $("cmd-dir-omzet-card").hidden = true;
      $("cmd-dir-omzet-card").style.display = "none";
    }
  }

  async function loadEig() {
    var r = await window.ffSupabase.rpc("clientdash_eigenaar");
    if (r.error) { if (window.showError) window.showError("Eigenaar: " + r.error.message); return; }
    var d = r.data || {};
    var demo = d.demografie || {};
    $("cmd-eig-demo").innerHTML =
      kpiTile("Actief totaal", demo.totaal || 0) +
      kpiTile("Jongens", demo.jongens || 0) +
      kpiTile("Meisjes", demo.meisjes || 0) +
      kpiTile("Gem. leeftijd", demo.leeftijd_gem == null ? "—" : demo.leeftijd_gem);
    $("cmd-eig-maand-tbody").innerHTML = (d.aanmeldingen_per_maand || []).map(function (m) {
      return "<tr><td>" + esc(m.maand) + "</td><td>" + esc(m.aantal) + "</td></tr>";
    }).join("") || '<tr><td colspan="2" class="client-detail-placeholder">Geen aanmeldingen.</td></tr>';
    $("cmd-eig-prod-tbody").innerHTML = (d.producten || []).map(function (p) {
      return "<tr><td>" + esc(p.product) + "</td><td>" + esc(p.aantal) + "</td></tr>";
    }).join("") || '<tr><td colspan="2" class="client-detail-placeholder">Geen producten.</td></tr>';
  }

  async function loadKpi() {
    var r = await window.ffSupabase.rpc("clientdash_kpi");
    if (r.error) { if (window.showError) window.showError("KPI: " + r.error.message); return; }
    var d = r.data || {};
    var k = d.kpi || {};
    var trechter = k.aanmeldtrechter || {};
    $("cmd-kpi-kpis").innerHTML =
      kpiTile("Aanmeldingen 90d", trechter.aanmeldingen_90d || 0) +
      kpiTile("Goedgekeurd 90d", trechter.goedgekeurd_90d || 0) +
      kpiTile("Afgewezen 90d", trechter.afgewezen_90d || 0) +
      kpiTile("Actieve cliënten", k.actieve_clienten || 0) +
      kpiTile("Verblijfsduur mediaan (dagen)", k.verblijfsduur_dagen_med == null ? "—" : k.verblijfsduur_dagen_med) +
      kpiTile("% actief met zorgplan", (k.pct_actief_met_actief_zorgplan == null ? "—" : k.pct_actief_met_actief_zorgplan + "%")) +
      kpiTile("% actief met signaleringsplan", (k.pct_actief_met_signaleringsplan == null ? "—" : k.pct_actief_met_signaleringsplan + "%"));
    $("cmd-kpi-funnel-tbody").innerHTML = (d.funnel || []).map(function (x) {
      return "<tr><td>" + esc(reisLabel(x.status)) + "</td><td>" + esc(x.aantal) + "</td></tr>";
    }).join("");
  }

  (async function init() {
    try {
      ctx = await fetchCtx();
    } catch (e) {
      ctx = { rollen: [], admin_tier: false, views: [], tarieven_zichtbaar: false };
    }
    var loading = $("cmd-loading"); if (loading) loading.hidden = true;
    if (!ctx.views || !ctx.views.length) {
      var gt = $("cmd-geen-toegang"); if (gt) gt.hidden = false;
      return;
    }
    renderChips();
    setView(ctx.views[0]);
  })();
})();
