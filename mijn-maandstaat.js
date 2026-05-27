/* global window, document */
/**
 * mijn-maandstaat.js — eigen maandstaat voor de ingelogde medewerker.
 *
 * Werkt op /mijn-gegevens.html in een sectie "Mijn maandstaat":
 *  - maand + jaar selectors (default = vorige volledige maand)
 *  - "Toon maandstaat" knop → renderen visuele tabel met
 *      • ORT-uren per percentage (uit besaOrtEngine)
 *      • Werk-km + woon-werk-km + km-vergoeding
 *      • Vakantieverlof + totaal verlofuren
 *      • Diensttype-uren (Vroege/Late/Geen/Waakdienst)
 *      • Totaal gewerkte uren
 *  - "Print / opslaan als PDF" knop → window.print() met @media print CSS
 *
 * Permissie-gate: zichtbaar wanneer profielen.medewerker_id gekoppeld is
 * EN dienstverband ∈ {loondienst, permanent, vast}. Anders sectie verborgen.
 *
 * Aggregate-functies (km, verlof) zijn lokaal — bewuste duplicatie van
 * salarisadministratie-exporter.js om scope van wijzigingen klein te houden
 * en risico op HR-export-regressie te vermijden.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function nlNum2(v) {
    var n = Number(v || 0);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2).replace(".", ",");
  }
  function fmtMonth(y, m) {
    var nl = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
    return nl[(m - 1) % 12] + " " + y;
  }

  function isLoondienst(emp) {
    if (!emp) return false;
    var dv = String(emp.dienstverband || emp.employment_type || "").toLowerCase();
    return dv === "loondienst" || dv === "permanent" || dv === "vast";
  }

  function aggregateKilometers(medewerkerId, year, month) {
    var out = { werkKm: 0, woonKm: 0, vergoedingEur: 0, total: 0 };
    if (!window.kilometerDeclaratiesDB || !medewerkerId) return out;
    var decls = (window.kilometerDeclaratiesDB.getForMedewerkerSync
      ? window.kilometerDeclaratiesDB.getForMedewerkerSync(medewerkerId)
      : []) || [];
    var decl = decls.filter(function (d) {
      return d && Number(d.jaar) === Number(year) && Number(d.maand) === Number(month);
    })[0];
    if (!decl) return out;
    out.vergoedingEur = Number(decl.totalReimbursement || 0);
    var recs = (window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync
      ? window.kilometerDeclaratiesDB.getRecordsForDeclaratieSync(decl.id)
      : []) || [];
    recs.forEach(function (r) {
      var km = Number(r.kilometers || 0);
      if (r.type === "office") out.woonKm += km;
      else out.werkKm += km;
    });
    out.total = out.werkKm + out.woonKm;
    return out;
  }

  function aggregateVerlof(medewerker, year, month) {
    var out = { vakantieverlofUren: 0, totaalVerlofUren: 0 };
    if (!window.verlofDB || !medewerker) return out;
    var list = (window.verlofDB.getForMedewerkerSync
      ? window.verlofDB.getForMedewerkerSync(medewerker.id)
      : []) || [];
    var contracturen = Number(medewerker.contracturen || 36);
    if (!isFinite(contracturen) || contracturen <= 0) contracturen = 36;
    var urenPerDag = contracturen / 5;
    var monthStart = new Date(year, month - 1, 1);
    var monthEnd = new Date(year, month, 0, 23, 59, 59);
    list.forEach(function (v) {
      if (!v || v.status !== "goedgekeurd") return;
      var s = v.startDatum ? new Date(v.startDatum) : null;
      var e = v.eindDatum ? new Date(v.eindDatum) : null;
      if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return;
      if (e < monthStart || s > monthEnd) return;
      var overlapStart = s < monthStart ? monthStart : s;
      var overlapEnd = e > monthEnd ? monthEnd : e;
      var overlapDagen = Math.max(1, Math.round((overlapEnd - overlapStart) / (24 * 3600 * 1000)) + 1);
      var uren = overlapDagen * urenPerDag;
      out.totaalVerlofUren += uren;
      if (v.type === "wettelijk" || v.type === "bovenwettelijk") {
        out.vakantieverlofUren += uren;
      }
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // State + render
  // ---------------------------------------------------------------------------
  var state = {
    employee: null,
    profile: null,
    year: null,
    month: null,
    eligible: false,
  };

  function initDefaultPeriod() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth(); // 0-based, dus dit is de "vorige maand"
    if (m === 0) { m = 12; y = y - 1; } // januari → december vorig jaar
    state.year = y;
    state.month = m;
  }

  function renderSelectors() {
    var ySel = $("mm-jaar");
    var mSel = $("mm-maand");
    if (!ySel || !mSel) return;
    // jaren: huidig jaar terug tot 2024
    var thisYear = new Date().getFullYear();
    ySel.innerHTML = "";
    for (var y = thisYear; y >= 2024; y--) {
      var opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === state.year) opt.selected = true;
      ySel.appendChild(opt);
    }
    var labels = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
    mSel.innerHTML = "";
    for (var i = 1; i <= 12; i++) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = labels[i - 1];
      if (i === state.month) o.selected = true;
      mSel.appendChild(o);
    }
  }

  function findEmployeeForCurrentUser() {
    if (!window.profilesDB || !window.medewerkersDB) return null;
    var prof = window.profilesDB.getCurrentSync();
    if (!prof || !prof.medewerkerId) {
      state.profile = prof;
      return null;
    }
    state.profile = prof;
    var emp = window.medewerkersDB.getByIdSync(prof.medewerkerId);
    return emp || null;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderResult() {
    var container = $("mm-result");
    if (!container) return;
    var emp = state.employee;
    if (!emp) {
      container.innerHTML = '<p class="mm-empty">Geen gekoppelde medewerker gevonden voor jouw account. Vraag HR om je profiel te koppelen aan een medewerker-record.</p>';
      return;
    }
    if (!isLoondienst(emp)) {
      container.innerHTML = '<p class="mm-empty">Deze maandstaat is alleen beschikbaar voor medewerkers in vast dienstverband (loondienst). Jouw dienstverband: '
        + escapeHtml(emp.dienstverband || emp.employment_type || "onbekend") + '.</p>';
      return;
    }

    var y = state.year, m = state.month;
    var km = aggregateKilometers(emp.id, y, m);
    var verlof = aggregateVerlof(emp, y, m);
    var ort = (window.besaOrtEngine && typeof window.besaOrtEngine.computeOrtForEmployee === "function")
      ? window.besaOrtEngine.computeOrtForEmployee(emp.id, y, m)
      : { ortUren: {}, diensttypeUren: {}, totaalGewerkteUren: 0, cao: null, recordCount: 0 };

    var naam = ((emp.voornaam || "") + " " + (emp.achternaam || "")).trim() || (emp.email || "—");
    var persnr = emp.personeelsnummer != null ? String(emp.personeelsnummer) : "—";
    var caoLbl = ort.cao === "jeugdzorg" ? "CAO Jeugdzorg" : (ort.cao === "vvt" ? "CAO VVT" : "—");

    var pctList = Object.keys(ort.ortUren || {})
      .map(function (p) { return parseInt(p, 10); })
      .filter(function (n) { return isFinite(n) && Number(ort.ortUren[n]) > 0; })
      .sort(function (a, b) { return a - b; });

    var ortRows = "";
    if (pctList.length === 0) {
      ortRows = '<tr><td colspan="2" class="mm-cell-empty">Geen ORT-uren in deze maand.</td></tr>';
    } else {
      pctList.forEach(function (p) {
        ortRows += '<tr><td>' + p + '%</td><td class="mm-num">'
          + nlNum2(ort.ortUren[p]) + ' uur</td></tr>';
      });
    }

    var dt = ort.diensttypeUren || {};
    var diensttypeRows = "";
    ["Vroege dienst", "Late dienst", "Geen ploegendiensttype", "Waakdienst"].forEach(function (k) {
      var v = Number(dt[k] || 0);
      if (v > 0) {
        diensttypeRows += '<tr><td>' + escapeHtml(k) + '</td><td class="mm-num">' + nlNum2(v) + ' uur</td></tr>';
      }
    });
    if (!diensttypeRows) {
      diensttypeRows = '<tr><td colspan="2" class="mm-cell-empty">Geen geregistreerde diensten in deze maand.</td></tr>';
    }

    container.innerHTML =
      '<div class="mm-card">'
      + '  <div class="mm-card-head">'
      + '    <div>'
      + '      <h3>Maandstaat ' + escapeHtml(fmtMonth(y, m)) + '</h3>'
      + '      <p class="mm-sub">' + escapeHtml(naam) + ' · personeelsnr ' + escapeHtml(persnr)
      + '         · ' + escapeHtml(caoLbl) + '</p>'
      + '    </div>'
      + '    <button type="button" class="btn-outline" id="mm-print-btn">'
      + '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
      + '        <path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="9" rx="1"/>'
      + '        <rect x="7" y="14" width="10" height="5"/>'
      + '      </svg>'
      + '      Print / opslaan als PDF'
      + '    </button>'
      + '  </div>'
      + '  <div class="mm-grid">'
      + '    <section class="mm-section">'
      + '      <h4>ORT-uren per percentage</h4>'
      + '      <table class="mm-table"><tbody>' + ortRows + '</tbody></table>'
      + '    </section>'
      + '    <section class="mm-section">'
      + '      <h4>Kilometers</h4>'
      + '      <table class="mm-table"><tbody>'
      + '        <tr><td>Werk-werk km</td><td class="mm-num">' + nlNum2(km.werkKm) + ' km</td></tr>'
      + '        <tr><td>Woon-werk km</td><td class="mm-num">' + nlNum2(km.woonKm) + ' km</td></tr>'
      + '        <tr><td>Vergoeding</td><td class="mm-num">€ ' + nlNum2(km.vergoedingEur) + '</td></tr>'
      + '      </tbody></table>'
      + '    </section>'
      + '    <section class="mm-section">'
      + '      <h4>Verlof opgenomen</h4>'
      + '      <table class="mm-table"><tbody>'
      + '        <tr><td>Vakantieverlof (wet+bovenwet)</td><td class="mm-num">' + nlNum2(verlof.vakantieverlofUren) + ' uur</td></tr>'
      + '        <tr><td>Totaal verlofuren</td><td class="mm-num">' + nlNum2(verlof.totaalVerlofUren) + ' uur</td></tr>'
      + '      </tbody></table>'
      + '    </section>'
      + '    <section class="mm-section">'
      + '      <h4>Diensttype-uren</h4>'
      + '      <table class="mm-table"><tbody>' + diensttypeRows + '</tbody></table>'
      + '    </section>'
      + '  </div>'
      + '  <div class="mm-total">'
      + '    <span>Totaal gewerkte uren</span>'
      + '    <strong>' + nlNum2(ort.totaalGewerkteUren) + ' uur</strong>'
      + '  </div>'
      + '  <p class="mm-disclaimer">Indicatieve weergave op basis van geregistreerde werkuren, ingediende '
      + 'kilometerdeclaratie en goedgekeurde verlofaanvragen. De officiële loonstrook ontvang je via Loket.</p>'
      + '</div>';

    var printBtn = $("mm-print-btn");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  }

  function wire() {
    var btn = $("mm-toon-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        var yVal = parseInt($("mm-jaar").value, 10);
        var mVal = parseInt($("mm-maand").value, 10);
        if (!isFinite(yVal) || !isFinite(mVal)) return;
        state.year = yVal;
        state.month = mVal;
        renderResult();
      });
    }
  }

  function bootstrap() {
    initDefaultPeriod();
    renderSelectors();
    wire();

    var ready = [
      window.profilesDB ? window.profilesDB.ready : Promise.resolve(),
      window.medewerkersDB ? window.medewerkersDB.ready : Promise.resolve(),
      window.kilometerDeclaratiesDB ? window.kilometerDeclaratiesDB.ready : Promise.resolve(),
      window.verlofDB ? window.verlofDB.ready : Promise.resolve(),
      window.werkurenDB ? window.werkurenDB.ready : Promise.resolve(),
    ];

    Promise.all(ready).then(function () {
      state.employee = findEmployeeForCurrentUser();
      state.eligible = state.employee && isLoondienst(state.employee);
      renderResult();
    }).catch(function (err) {
      console.warn("[mijn-maandstaat] data-laden mislukt:", err);
      renderResult();
    });

    // Re-render bij data-updates
    ["besa:profile-updated","besa:medewerkers-updated","besa:kilometer-declaraties-updated","besa:verlof-updated","besa:werkuren-updated"].forEach(function (ev) {
      window.addEventListener(ev, function () {
        state.employee = findEmployeeForCurrentUser();
        if (state.employee) renderResult();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
