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

  // Periodieken state
  var periodiekenRows = [];
  var periodiekenFilter = "alle";

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

    // G53/G54 — Compliance-score (gewogen samenstelling) + beleid% + SKJ.
    var scoreGrid = $("cd-score-grid");
    if (scoreGrid) {
      scoreGrid.innerHTML = [
        metricCell("Compliance-score", pct(k.compliance_score), "gewogen totaalindex", accentForPct(k.compliance_score, true)),
        metricCell("Beleid kennisgenomen", pct(k.beleid_pct), "verplichte documenten ondertekend", accentForPct(k.beleid_pct, true)),
        metricCell("Geldige SKJ-registraties", (k.skj_geldig_aantal != null ? k.skj_geldig_aantal : "—"), "medewerkers met geldige SKJ", ""),
      ].join("");
    }
    var scoreNote = $("cd-score-note");
    if (scoreNote) {
      scoreNote.textContent = "Compliance-score = gewogen samenstelling: 30% geldige VOG · 20% onboarding afgerond · 25% contract getekend · 25% beleid kennisgenomen.";
    }
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

  // De tabel-head zit statisch in de HTML; voeg de "Oplossen"-kolomkop
  // idempotent toe vanuit JS (we mogen alleen dit bestand bewerken).
  function ensureOplossenHeader(tbody) {
    if (!window.besaOplossen) return;
    var table = tbody && tbody.closest ? tbody.closest("table") : null;
    var headRow = table ? table.querySelector("thead tr") : null;
    if (!headRow) return;
    if (headRow.querySelector("th.cd-oplossen-th")) return;
    var th = document.createElement("th");
    th.className = "cd-oplossen-th";
    th.textContent = "Actie";
    headRow.appendChild(th);
  }

  function renderTable() {
    var tbody = $("cd-tbody");
    if (!tbody) return;
    ensureOplossenHeader(tbody);
    var heeftOplossen = !!window.besaOplossen;
    var emptyColspan = heeftOplossen ? 8 : 7;
    var list = visibleRows();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="' + emptyColspan + '" class="cd-empty">Geen medewerkers gevonden.</td></tr>';
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
        + (heeftOplossen ? "<td>" + window.besaOplossen.triggerHtml({ "data-mid": r.medewerker_id }) + "</td>" : "")
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
        var trigger = e.target.closest && e.target.closest(".besa-oplossen-trigger");
        if (trigger && window.besaOplossen) {
          e.stopPropagation();
          window.besaOplossen.openPopover(trigger, {
            uitleg: "Open het dossier om de verlopen/ontbrekende VOG of documenten te uploaden of te verlengen.",
            knopLabel: "Naar dossier",
            onGaNaar: function () { openDossier(trigger.getAttribute("data-mid")); },
          });
          return;
        }
        var tr = e.target.closest && e.target.closest("tr.cd-row");
        if (tr) openDossier(tr.getAttribute("data-mid"));
      });
      tbody.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        // Enter/Spatie op de "Oplossen"-knop activeert die knop, niet de rij-nav.
        if (e.target.closest && e.target.closest(".besa-oplossen-trigger")) return;
        var tr = e.target.closest && e.target.closest("tr.cd-row");
        if (tr) { e.preventDefault(); openDossier(tr.getAttribute("data-mid")); }
      });
    }
    var recertTb = $("cd-recert-tbody");
    if (recertTb) {
      recertTb.addEventListener("click", function (e) {
        var tr = e.target.closest && e.target.closest("tr.cd-row");
        if (tr) openDossier(tr.getAttribute("data-mid"));
      });
    }
    var periodiekenTb = $("cd-periodieken-tbody");
    if (periodiekenTb) {
      periodiekenTb.addEventListener("click", function (e) {
        var tr = e.target.closest && e.target.closest("tr.cd-row");
        if (tr) openDossier(tr.getAttribute("data-mid"));
      });
    }
    var periodiekenFiltersEl = $("cd-periodieken-filters");
    if (periodiekenFiltersEl) {
      periodiekenFiltersEl.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".filter-chip");
        if (!btn) return;
        periodiekenFilter = btn.getAttribute("data-filter") || "alle";
        Array.prototype.forEach.call(periodiekenFiltersEl.querySelectorAll(".filter-chip"), function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        renderPeriodiekenTable();
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

  // Datum-formatter die UTC-datumshift vermijdt (ISO YYYY-MM-DD → DD-MM-YYYY).
  function fmtDate(iso) {
    if (!iso) return "—";
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return m[3] + "-" + m[2] + "-" + m[1];
  }

  // Periodieken — jaarlijkse trede-verhogingen loondienst.
  function renderPeriodiekenTable() {
    var tbody = $("cd-periodieken-tbody");
    if (!tbody) return;
    var list = periodiekenFilter === "alle"
      ? periodiekenRows
      : periodiekenRows.filter(function (r) { return r.status === periodiekenFilter; });
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="cd-empty">'
        + (periodiekenFilter === "alle"
          ? "Geen loondienst-medewerkers met ingevulde salarisschaal gevonden."
          : "Geen medewerkers in deze categorie.")
        + "</td></tr>";
      return;
    }
    var statusBadges = {
      te_laat:    '<span class="cl-fase-pill cd-badge cd-badge--bad">Te laat</span>',
      urgent:     '<span class="cl-fase-pill cd-badge cd-badge--bad">Urgent</span>',
      binnenkort: '<span class="cl-fase-pill cd-badge cd-badge--warn">Binnenkort</span>',
      ok:         '<span class="cl-fase-pill cd-badge cd-badge--ok">Op tijd</span>',
    };
    tbody.innerHTML = list.map(function (r) {
      var d = Number(r.dagen_tot_periodiek);
      var dagenHtml = d < 0
        ? '<span class="cd-num cd-num--bad">' + Math.abs(d) + " d over</span>"
        : '<span class="cd-num' + (d <= 30 ? " cd-num--bad" : (d <= 60 ? " cd-num--warn" : "")) + '">' + d + " d</span>";
      var badge = statusBadges[r.status] || '<span class="cl-fase-pill">' + escHtml(r.status) + "</span>";
      return '<tr class="cd-row" data-mid="' + escHtml(r.medewerker_id) + '" tabindex="0" role="button" aria-label="Open dossier van ' + escHtml(r.naam) + '">'
        + "<td>" + escHtml(r.naam) + "</td>"
        + "<td>" + escHtml(r.schaal || "—") + "</td>"
        + "<td>" + escHtml(r.trede || "—") + "</td>"
        + "<td>" + fmtDate(r.laatste_ingangsdatum) + "</td>"
        + "<td>" + fmtDate(r.volgende_periodiek) + "</td>"
        + "<td>" + dagenHtml + "</td>"
        + "<td>" + badge + "</td>"
        + "</tr>";
    }).join("");
  }

  function renderPeriodieken(list) {
    var kpiBox = $("cd-periodieken-kpis");
    if (kpiBox) {
      var telaat     = list.filter(function (r) { return r.status === "te_laat"; }).length;
      var urgent     = list.filter(function (r) { return r.status === "urgent"; }).length;
      var binnenkort = list.filter(function (r) { return r.status === "binnenkort"; }).length;
      var ok         = list.filter(function (r) { return r.status === "ok"; }).length;
      kpiBox.innerHTML = [
        metricCell("Te laat", String(telaat), "direct actie vereist", telaat > 0 ? "bad" : "ok"),
        metricCell("Urgent (≤ 30 dagen)", String(urgent), "", urgent > 0 ? "warn" : "ok"),
        metricCell("Binnenkort (≤ 60 dagen)", String(binnenkort), "", binnenkort > 0 ? "warn" : "ok"),
        metricCell("Op tijd (> 60 dagen)", String(ok), "", ""),
      ].join("");
    }
    periodiekenRows = list;
    renderPeriodiekenTable();
  }

  // G42 — recertificering & trainingen.
  function renderRecert(list, agressieN, totaal) {
    var kpiBox = $("cd-recert-kpis");
    if (kpiBox) {
      var verlopenN = list.filter(function (r) { return r.dagen_tot_verval < 0; }).length;
      var binnenkortN = list.length - verlopenN;
      kpiBox.innerHTML = [
        metricCell("Verlopen certificaten/VOG's", String(verlopenN), "", verlopenN > 0 ? "bad" : "ok"),
        metricCell("Verloopt binnen 90 dagen", String(binnenkortN), "", binnenkortN > 0 ? "warn" : "ok"),
        metricCell("Agressietraining geldig", String(agressieN), totaal ? "van " + totaal + " medewerkers" : "", ""),
      ].join("");
    }
    var tb = $("cd-recert-tbody");
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="5" class="cd-empty">Geen certificaten die (binnenkort) verlopen. 🎉</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      var dagen = Number(r.dagen_tot_verval);
      var status = dagen < 0
        ? '<span class="cl-fase-pill cd-badge cd-badge--bad">Verlopen</span>'
        : '<span class="cl-fase-pill cd-badge cd-badge--warn">Over ' + dagen + 'd</span>';
      var typeLabel = r.doc_type === "vog" ? "VOG" : (r.doc_type === "education" ? "Opleiding" : r.doc_type);
      return '<tr class="cd-row" data-mid="' + escHtml(r.medewerker_id) + '" tabindex="0" role="button">'
        + "<td>" + escHtml(r.medewerker_naam) + "</td>"
        + "<td>" + escHtml(r.doc_naam || "—") + "</td>"
        + "<td>" + escHtml(typeLabel) + "</td>"
        + "<td>" + escHtml(r.vervaldatum || "—") + "</td>"
        + "<td>" + status + "</td></tr>";
    }).join("");
  }

  async function load(isRefresh) {
    try {
      if (!window.complianceDashboardDB) return;
      var k = await window.complianceDashboardDB.kpis();
      renderKpis(k);
      rows = await window.complianceDashboardDB.overzicht();
      renderTable();
      // G42 — los geladen; een fout hier mag de hoofdtabel niet blokkeren.
      try {
        var recert = await window.complianceDashboardDB.recertificering();
        var agressieN = await window.complianceDashboardDB.agressieAantal();
        renderRecert(recert, agressieN, k && k.totaal);
      } catch (errR) {
        console.error("[compliance-dashboard] recertificering laden mislukt:", errR);
        var tbR = $("cd-recert-tbody");
        if (tbR) tbR.innerHTML = '<tr><td colspan="5" class="cd-empty">Kon de recertificeringsgegevens niet laden.</td></tr>';
      }
      // Periodieken — los geladen zodat fouten de rest niet blokkeren.
      try {
        var periodieken = await window.complianceDashboardDB.periodieken();
        renderPeriodieken(periodieken);
      } catch (errP) {
        console.error("[compliance-dashboard] periodieken laden mislukt:", errP);
        var tbP = $("cd-periodieken-tbody");
        if (tbP) tbP.innerHTML = '<tr><td colspan="7" class="cd-empty">Kon de periodiekengegevens niet laden.</td></tr>';
      }
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
