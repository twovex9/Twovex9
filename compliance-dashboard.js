/**
 * compliance-dashboard.js — HR Compliance-dashboard (G48 / spec §11, §15).
 * KPI-tegels + per-medewerker compliance-tabel met drill-down naar het dossier.
 * Data uit complianceDashboardDB (hr_compliance_kpis / hr_compliance_overzicht).
 */
(function () {
  "use strict";

  var rows = [];
  var filter = "alle";
  var query = "";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    var t = document.createElement("div");
    t.textContent = s == null ? "" : String(s);
    return t.innerHTML;
  }
  function pct(n) { return (n == null || isNaN(Number(n))) ? "—" : (Number(n) + "%"); }
  function accentForPct(n, goodHigh) {
    if (n == null || isNaN(Number(n))) return "";
    var v = Number(n);
    if (goodHigh) return v >= 90 ? "ok" : (v >= 70 ? "warn" : "bad");
    return v <= 5 ? "ok" : (v <= 20 ? "warn" : "bad");
  }
  function metricCell(label, value, sub, accent) {
    return '<div class="md-metric' + (accent ? " md-metric--" + accent : "") + '">'
      + '<span class="md-metric-lbl">' + escHtml(label) + "</span>"
      + '<span class="md-metric-val">' + value + "</span>"
      + (sub ? '<span class="md-metric-sub">' + escHtml(sub) + "</span>" : "")
      + "</div>";
  }

  function renderKpis(k) {
    if (!k) return;
    $("cd-qs-vog").textContent = pct(k.vog_geldig_pct);
    $("cd-qs-verlopen").textContent = (k.verlopen_docs_totaal != null ? k.verlopen_docs_totaal : "—");
    $("cd-qs-onboarding").textContent = pct(k.onboarding_afgerond_pct);
    $("cd-qs-zzp").textContent = pct(k.zzp_pct);

    $("cd-compliance-grid").innerHTML = [
      metricCell("Geldige VOG", pct(k.vog_geldig_pct), k.totaal ? "van " + k.totaal + " medewerkers" : "", accentForPct(k.vog_geldig_pct, true)),
      metricCell("VOG aanwezig", pct(k.vog_aanwezig_pct), "", accentForPct(k.vog_aanwezig_pct, true)),
      metricCell("Verlopen documenten", (k.verlopen_docs_totaal != null ? k.verlopen_docs_totaal : "—"), (k.medewerkers_met_verlopen || 0) + " medewerkers", k.verlopen_docs_totaal > 0 ? "bad" : "ok"),
      metricCell("Binnenkort vervallend (≤90d)", (k.binnenkort_docs_totaal != null ? k.binnenkort_docs_totaal : "—"), "", k.binnenkort_docs_totaal > 0 ? "warn" : "ok"),
    ].join("");

    $("cd-onboarding-grid").innerHTML = [
      metricCell("Onboarding voltooid", pct(k.onboarding_afgerond_pct), "", accentForPct(k.onboarding_afgerond_pct, true)),
      metricCell("Contract getekend", pct(k.contract_getekend_pct), "", accentForPct(k.contract_getekend_pct, true)),
      metricCell("Medewerkers (totaal)", (k.totaal != null ? k.totaal : "—"), (k.loondienst || 0) + " loondienst · " + (k.zzp || 0) + " ZZP", ""),
      metricCell("ZZP-aandeel", pct(k.zzp_pct), "", ""),
    ].join("");
  }

  function vogBadge(r) {
    if (r.vog_geldig) {
      var sub = r.vog_vervaldatum ? "" : "";
      return '<span class="cl-fase-pill cd-badge cd-badge--ok">Geldig</span>';
    }
    if (r.vog_aanwezig) return '<span class="cl-fase-pill cd-badge cd-badge--bad">Verlopen</span>';
    return '<span class="cl-fase-pill cd-badge cd-badge--warn">Ontbreekt</span>';
  }
  function jaNee(b) {
    return b ? '<span class="cd-check cd-check--ok">✓</span>' : '<span class="cd-check cd-check--no">—</span>';
  }
  function numCell(n, badWhenPositive) {
    var v = n || 0;
    if (v === 0) return '<span class="cd-num">0</span>';
    return '<span class="cd-num ' + (badWhenPositive ? "cd-num--bad" : "cd-num--warn") + '">' + v + "</span>";
  }

  function visibleRows() {
    var q = query.trim().toLowerCase();
    return rows.filter(function (r) {
      if (filter === "verlopen" && !(r.verlopen_docs > 0)) return false;
      if (filter === "geen-vog" && r.vog_geldig) return false;
      if (q && String(r.naam || "").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderTable() {
    var tbody = $("cd-tbody");
    if (!tbody) return;
    var list = visibleRows();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="cd-empty">Geen medewerkers gevonden.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (r) {
      return '<tr class="cd-row" data-mid="' + escHtml(r.medewerker_id) + '" tabindex="0" role="button" aria-label="Open dossier van ' + escHtml(r.naam) + '">'
        + "<td>" + escHtml(r.naam) + "</td>"
        + "<td>" + escHtml(r.dienstverband || "—") + "</td>"
        + "<td>" + vogBadge(r) + "</td>"
        + "<td>" + numCell(r.verlopen_docs, true) + "</td>"
        + "<td>" + numCell(r.binnenkort_docs, false) + "</td>"
        + "<td>" + jaNee(r.onboarding_afgerond) + "</td>"
        + "<td>" + jaNee(r.contract_getekend) + "</td>"
        + "</tr>";
    }).join("");
  }

  function openDossier(mid) {
    if (!mid) return;
    try { window.sessionStorage.setItem("selectedEmployee", JSON.stringify({ empId: mid })); } catch (e) { /* */ }
    window.location.href = "medewerker";
  }

  function wireInteractions() {
    var tbody = $("cd-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var tr = e.target.closest && e.target.closest("tr.cd-row");
        if (tr) openDossier(tr.getAttribute("data-mid"));
      });
      tbody.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var tr = e.target.closest && e.target.closest("tr.cd-row");
        if (tr) { e.preventDefault(); openDossier(tr.getAttribute("data-mid")); }
      });
    }
    var search = $("cd-search");
    if (search) search.addEventListener("input", function () { query = search.value || ""; renderTable(); });
    var filters = $("cd-filters");
    if (filters) {
      filters.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".filter-chip");
        if (!btn) return;
        filter = btn.getAttribute("data-filter") || "alle";
        Array.prototype.forEach.call(filters.querySelectorAll(".filter-chip"), function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        renderTable();
      });
    }
    var refresh = $("cd-refresh");
    if (refresh) refresh.addEventListener("click", function () { load(true); });
  }

  async function load(isRefresh) {
    try {
      if (!window.complianceDashboardDB) return;
      var k = await window.complianceDashboardDB.kpis();
      renderKpis(k);
      rows = await window.complianceDashboardDB.overzicht();
      renderTable();
      var upd = $("cd-updated");
      if (upd) {
        var d = new Date();
        upd.textContent = "Bijgewerkt " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      }
      if (isRefresh && window.showActionFeedback) window.showActionFeedback("refreshed", "Compliance");
    } catch (err) {
      console.error("[compliance-dashboard] laden mislukt:", err);
      var tbody = $("cd-tbody");
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="cd-empty">Kon de compliance-gegevens niet laden (' + escHtml(err && err.message ? err.message : "onbekende fout") + ").</td></tr>";
      if (window.besaReportSyncFailure) window.besaReportSyncFailure("Compliance-dashboard — laden", err);
    }
  }

  function start() { wireInteractions(); load(false); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
