/* global window, document */
/**
 * facturen-indiening.js — top-bar Facturen → "Indiening per maand".
 * Twee doelen uit het facturatie-document:
 *   4. Reconciliatie per maand: ingediende facturen vs. systeemfactuur, met
 *      zichtbaar verschil.
 *   5. Indiening-checklist per ZZP'er per maand: wie heeft wel/niet ingediend
 *      (ontbrekenden zichtbaar).
 *
 * Bronnen (betrouwbaar): public.invoices (employee.id = BS2-id, total,
 * systemGeneratedSummary) + public.medewerkers (inhuur-ZZP'ers, gekoppeld via
 * data.bs2_id). De kolom "Verwacht (planning)" komt uit de read-only RPC
 * facturen_zzp_dashboard (window.facturenZzpDB): per maand de som van de
 * geplande ZZP-diensten × persoonlijk uurtarief = wat aan facturen binnen
 * zou moeten komen. De reconciliatie zet verwacht/ingediend/systeemfactuur
 * naast elkaar.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escAttr(s) { return escHtml(s); }
  function formatEur(n) {
    var v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/\.(\d{2})$/, ",$1");
  }
  var MAAND = ["", "Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];
  var MAAND_KORT = ["", "jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function maandLabel(j, m) { return (MAAND[m] || ("M" + m)) + " " + j; }
  function maandKort(j, m) { return (MAAND_KORT[m] || m) + " '" + String(j).slice(2); }

  var state = { search: "", onlyGap: false };
  var planByYm = {};   // "YYYY-MM" → verwacht ZZP-bedrag o.b.v. planning (uit RPC)
  function ymKey(jaar, maand) { return jaar + "-" + ("0" + maand).slice(-2); }

  function getInvoices() {
    try {
      return ((window.invoicesDB && window.invoicesDB.getAllSync()) || [])
        .filter(function (r) { return r && !r.gearchiveerd; });
    } catch (e) { return []; }
  }
  function getMedewerkers() {
    try { return (window.medewerkersDB && window.medewerkersDB.getAllSync()) || []; }
    catch (e) { return []; }
  }

  function sysTotalOf(inv) {
    var s = inv && inv.systemGeneratedSummary;
    var t = s && s.totals && s.totals.total != null ? Number(s.totals.total) : null;
    return (t != null && isFinite(t)) ? t : null;
  }

  // ---- Maanden + reconciliatie ----
  function buildMonths(invs) {
    var set = {};
    invs.forEach(function (r) {
      if (r.jaar != null && r.maand != null) set[r.jaar * 100 + r.maand] = { jaar: r.jaar, maand: r.maand };
    });
    return Object.keys(set).map(function (k) { return set[k]; })
      .sort(function (a, b) { return (a.jaar * 100 + a.maand) - (b.jaar * 100 + b.maand); });
  }

  function renderRecon(invs, months) {
    var tb = $("fi-recon-tbody");
    if (!tb) return;
    if (!months.length) { tb.innerHTML = '<tr><td colspan="7" class="incident-empty">Nog geen facturen</td></tr>'; return; }
    var rows = months.slice().reverse().map(function (m) {
      var ms = invs.filter(function (r) { return r.jaar === m.jaar && r.maand === m.maand; });
      var ingediend = ms.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
      var systeem = 0, hasSys = false;
      ms.forEach(function (r) { var st = sysTotalOf(r); if (st != null) { systeem += st; hasSys = true; } });
      var verschil = hasSys ? Math.round((ingediend - systeem) * 100) / 100 : null;
      var zzp = {}; ms.forEach(function (r) { if (r.employee && r.employee.id) zzp[r.employee.id] = 1; });
      var vCls = (verschil != null && Math.abs(verschil) >= 0.01) ? "fi-diff-bad" : "fi-diff-ok";
      // Verwacht o.b.v. planning (roostertarieven) + "nog te verwachten" t.o.v. ingediend.
      var verw = planByYm[ymKey(m.jaar, m.maand)];
      var heeftVerw = verw != null;
      var nogTe = heeftVerw ? Math.round((verw - ingediend) * 100) / 100 : null;
      var verwTitle = heeftVerw
        ? ("Volgens rooster te betalen: " + formatEur(verw)
           + (nogTe > 0 ? " · nog ~" + formatEur(nogTe) + " te factureren" : " · volledig gefactureerd"))
        : "Geen planning gevonden voor deze maand";
      return '<tr>'
        + '<td>' + escHtml(maandLabel(m.jaar, m.maand)) + '</td>'
        + '<td class="td-num fi-verw" title="' + escAttr(verwTitle) + '">' + (heeftVerw ? formatEur(verw) : "—") + '</td>'
        + '<td class="td-num">' + ms.length + '</td>'
        + '<td class="td-num">' + formatEur(ingediend) + '</td>'
        + '<td class="td-num">' + (hasSys ? formatEur(systeem) : "—") + '</td>'
        + '<td class="td-num ' + vCls + '">' + (verschil != null ? formatEur(verschil) : "—") + '</td>'
        + '<td class="td-num">' + Object.keys(zzp).length + '</td>'
        + '</tr>';
    }).join("");
    tb.innerHTML = rows;
  }

  // ---- Indiening-matrix per ZZP'er ----
  function controlOfCell(cell) {
    var sysSum = 0, hasSys = false, allSys = true;
    cell.invs.forEach(function (r) { var st = sysTotalOf(r); if (st != null) { sysSum += st; } else { allSys = false; } if (st != null) hasSys = true; });
    if (!hasSys || !allSys) return { clr: "yellow", title: "Geen (volledige) systeemfactuur" };
    var d = Math.round((cell.total - sysSum) * 100) / 100;
    if (Math.abs(d) >= 0.01) return { clr: "pink", title: "Wijkt af van systeemfactuur: " + formatEur(d) };
    return { clr: "blue", title: "Eén-op-één met systeemfactuur" };
  }

  function buildZzpRows(invs, months) {
    var monthKeys = months.map(function (m) { return m.jaar * 100 + m.maand; });
    var by = {};
    invs.forEach(function (r) {
      var id = r.employee && r.employee.id;
      if (!id || r.jaar == null || r.maand == null) return;
      if (!by[id]) by[id] = { id: id, name: (r.employee && r.employee.name) || "—", byKey: {} };
      var k = r.jaar * 100 + r.maand;
      if (!by[id].byKey[k]) by[id].byKey[k] = { total: 0, invs: [] };
      by[id].byKey[k].total += Number(r.total) || 0;
      by[id].byKey[k].invs.push(r);
    });
    return Object.keys(by).map(function (id) {
      var z = by[id];
      var present = monthKeys.filter(function (k) { return z.byKey[k]; });
      var first = present.length ? Math.min.apply(null, present) : null;
      z.gaps = monthKeys.filter(function (k) { return first != null && k >= first && !z.byKey[k]; });
      z.hasGap = z.gaps.length > 0;
      return z;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "nl"); });
  }

  function renderMatrix(invs, months) {
    var head = $("fi-matrix-head"), body = $("fi-matrix-tbody");
    if (!head || !body) return;
    var monthKeys = months.map(function (m) { return m.jaar * 100 + m.maand; });
    head.innerHTML = '<tr><th data-col="zzp">ZZP\'er</th>'
      + months.map(function (m) { return '<th class="th-num">' + escHtml(maandKort(m.jaar, m.maand)) + '</th>'; }).join("")
      + '</tr>';

    var rows = buildZzpRows(invs, months);
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function (z) { return z.name.toLowerCase().indexOf(q) >= 0; });
    }
    if (state.onlyGap) rows = rows.filter(function (z) { return z.hasGap; });

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="' + (months.length + 1) + '" class="incident-empty">Geen ZZP\'ers gevonden</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (z) {
      var cells = months.map(function (m, i) {
        var k = monthKeys[i];
        var cell = z.byKey[k];
        if (cell) {
          var c = controlOfCell(cell);
          var inner = '<span class="fact-status-pill fact-status-pill--' + c.clr + '" title="' + escAttr(c.title) + '">' + formatEur(cell.total) + '</span>';
          if (cell.invs.length === 1) {
            inner = '<a class="fi-cell-link" href="invoice-detail?id=' + escAttr(cell.invs[0].id) + '">' + inner + '</a>';
          }
          return '<td class="td-num">' + inner + '</td>';
        }
        if (z.gaps.indexOf(k) >= 0) return '<td class="td-num"><span class="fi-cell-gap">ontbreekt</span></td>';
        return '<td class="td-num"><span class="fi-cell-none">—</span></td>';
      }).join("");
      return '<tr><td data-col="zzp">' + escHtml(z.name) + (z.hasGap ? ' <span class="fi-gap-dot" title="Heeft een hiaat — mogelijk ontbrekende factuur" aria-hidden="true"></span>' : "") + '</td>' + cells + '</tr>';
    }).join("");
  }

  function renderNone(invs) {
    var host = $("fi-none-list"), cnt = $("fi-none-count");
    if (!host) return;
    var have = {};
    invs.forEach(function (r) { if (r.employee && r.employee.id) have[r.employee.id] = 1; });
    var zzp = getMedewerkers().filter(function (m) {
      return m && !m.archived && /inhuur/i.test(String(m.dienstverband || ""));
    });
    var none = zzp.filter(function (m) { return !have[m.bs2_id]; })
      .map(function (m) { return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || m.email || m.id; })
      .sort(function (a, b) { return a.localeCompare(b, "nl"); });
    if (cnt) cnt.textContent = "(" + none.length + ")";
    host.innerHTML = none.length
      ? none.map(function (n) { return '<span class="fi-none-chip">' + escHtml(n) + '</span>'; }).join("")
      : '<span class="fi-note">Alle actieve inhuur-ZZP\'ers hebben ten minste één factuur ingediend.</span>';
  }

  function render() {
    var invs = getInvoices();
    var months = buildMonths(invs);
    renderRecon(invs, months);
    renderMatrix(invs, months);
    renderNone(invs);
  }

  function wire() {
    var s = $("fi-search");
    if (s) s.addEventListener("input", function () { state.search = this.value || ""; render(); });
    var g = $("fi-only-gap");
    if (g) g.addEventListener("change", function () { state.onlyGap = this.checked; render(); });
    window.addEventListener("ff:invoices-updated", render);
    window.addEventListener("ff:medewerkers-updated", render);
  }

  // Planning-verwacht per maand uit de read-only RPC (window.facturenZzpDB).
  function loadPlanning() {
    if (!window.facturenZzpDB) return;
    function apply(data) {
      if (!data || !Array.isArray(data.months)) return;
      planByYm = {};
      data.months.forEach(function (mo) {
        if (mo && mo.ym != null) planByYm[mo.ym] = Number(mo.planning_verwacht) || 0;
      });
      render();
    }
    try { apply(window.facturenZzpDB.getData && window.facturenZzpDB.getData()); } catch (e) { /* */ }
    try {
      if (window.facturenZzpDB.ready) {
        window.facturenZzpDB.ready.then(function () { apply(window.facturenZzpDB.getData()); }).catch(function () {});
      }
    } catch (e) { /* ready kan getter zijn */ }
  }

  function init() {
    render();
    wire();
    loadPlanning();
    if (window.invoicesDB && window.invoicesDB.ready) window.invoicesDB.ready.then(render).catch(function () {});
    if (window.medewerkersDB && window.medewerkersDB.ready) {
      try { window.medewerkersDB.ready.then(render).catch(function () {}); }
      catch (e) { /* ready kan getter zijn */ }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
