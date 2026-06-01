/* global window, document */
/**
 * invoice-detail.js — employee-invoice detail (top-bar Facturen module).
 * 1-op-1 BS2 `/api/invoices/{id}`: regels (price×amount=total), totalen
 * VERBATIM, beoordeel-workflow + historie, PDF-weergave naast de data.
 * STRIKT LOS van de Cliënten/disposition facturen.
 */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function formatEur(n) {
    var v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/\.(\d{2})$/, ",$1");
  }
  function formatNum(n) {
    var v = Number(n || 0);
    return (v === Math.floor(v) ? v.toFixed(0) : v.toFixed(2)).replace(".", ",");
  }
  function formatNlDate(v) {
    if (!v) return "—";
    var t = Date.parse(v); if (!isFinite(t)) return "—";
    var d = new Date(t);
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  var STATUS_LABEL = {
    draft: "Concept", submitted: "Ingediend", under_review: "In beoordeling",
    approved: "Goedgekeurd", rejected: "Afgewezen",
  };
  var STATUS_CLR = {
    draft: "yellow", submitted: "blue", under_review: "yellow",
    approved: "green", rejected: "red",
  };

  function getId() {
    try { return new URL(window.location.href).searchParams.get("id"); }
    catch (e) { return null; }
  }
  function naam(inv) {
    return (inv && inv.employee && inv.employee.name) || (inv && inv.organization && inv.organization.name) || "—";
  }
  function lineLabel(b) {
    return b.title || b.naam || b.description || (b.shift && b.shift.description) || "Regel";
  }

  // ---- Controle-helpers: herberekening uit dienst-tijden + overlap ----
  // Dienst-tijden komen als "2026-03-01 08:00:00" (zonder tijdzone) → lokale Date.
  function parseTs(s) {
    if (!s) return null;
    var m = String(s).replace("T", " ").match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var t = Date.parse(s); return isFinite(t) ? new Date(t) : null;
  }
  // Uren = (eind − start) − pauze. Eind heeft de volledige datum, dus diensten
  // over middernacht (bv. 08:00 → volgende dag 00:00 = 16u) tellen correct mee.
  function shiftHours(shift) {
    if (!shift) return null;
    var st = parseTs(shift.start_time), et = parseTs(shift.end_time);
    if (!st || !et) return null;
    var brk = shift.break_minutes != null ? Number(shift.break_minutes) / 60
      : shift.break_hours != null ? Number(shift.break_hours) : 0;
    if (!isFinite(brk)) brk = 0;
    var h = (et - st) / 3600000 - brk;
    return h > 0 ? Math.round(h * 100) / 100 : 0;
  }
  function fmtH(n) {
    var v = Math.round(Number(n || 0) * 100) / 100;
    var s = (v === Math.floor(v)) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return s.replace(".", ",");
  }
  function fmtTime(d) { return d ? ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) : ""; }
  var MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function fmtDayTime(d) { return d ? d.getDate() + " " + MND[d.getMonth()] + " " + fmtTime(d) : ""; }

  var INV_ID = getId();
  var pendingAction = null;
  var ctrlState = null;   // laatst berekende controle-staat (voor Herberekenen-knop)

  function renderActions(inv) {
    var host = $("inv-actions");
    var html = "";
    if (inv.canBeApproved) html += '<button type="button" class="btn-primary" data-act="approve">Goedkeuren</button>';
    if (inv.canBeMarkedUnderReview) html += '<button type="button" class="btn-outline" data-act="review">In beoordeling</button>';
    if (inv.canBeRejected) html += '<button type="button" class="btn-outline inv-btn-reject" data-act="reject">Afwijzen</button>';
    host.innerHTML = html;
    host.querySelectorAll("button[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { openReview(b.getAttribute("data-act")); });
    });
  }

  function renderMeta(inv) {
    var o = inv.organization || {};
    function row(lbl, val) {
      return '<div class="inv-meta-row"><span class="inv-meta-lbl">' + escHtml(lbl) + '</span>'
        + '<span class="inv-meta-val">' + val + '</span></div>';
    }
    var pill = '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + (STATUS_CLR[inv.status] || "yellow")
      + '">' + escHtml(STATUS_LABEL[inv.status] || inv.status) + '</span>';
    $("inv-meta").innerHTML =
      row("Status", pill) +
      row("Factuurnummer", escHtml(inv.number || "—")) +
      row("Periode", escHtml(inv.periodFormatted || "—")) +
      row("Medewerker", escHtml((inv.employee && inv.employee.name) || "—")) +
      row("Organisatie", escHtml(o.name || "—")) +
      row("KvK / BTW", escHtml((o.kvk || "—") + " / " + (o.btw || "—"))) +
      row("Factuurdatum", escHtml(formatNlDate(inv.invoiceDate))) +
      row("Vervaldatum", escHtml(formatNlDate(inv.expirationDate))) +
      row("Ingediend op", escHtml(formatNlDate(inv.submittedAt)));
  }

  function renderLines(inv, lines) {
    var tb = $("inv-lines-tbody");
    if (!lines.length) {
      tb.innerHTML = '<tr><td colspan="5" class="incident-empty">Geen factuurregels</td></tr>';
    } else {
      tb.innerHTML = lines.map(function (b) {
        if (b.isGroup) {
          return '<tr class="inv-line-group"><td colspan="5">' + escHtml(lineLabel(b)) + '</td></tr>';
        }
        if (b.isBlankRow) return '<tr class="inv-line-blank"><td colspan="5">&nbsp;</td></tr>';
        return '<tr>'
          + '<td>' + escHtml(lineLabel(b)).replace(/\n/g, "<br>") + '</td>'
          + '<td>' + escHtml(b.unit || "—") + '</td>'
          + '<td class="td-num">' + formatEur(b.price) + '</td>'
          + '<td class="td-num">' + formatNum(b.amount) + '</td>'
          + '<td class="td-num">' + formatEur(b.total) + '</td>'
          + '</tr>';
      }).join("");
    }
    var btw = (Number(inv.total) || 0) - (Number(inv.totalExclVat) || 0);
    $("inv-lines-foot").innerHTML =
      '<tr class="inv-foot-row"><td colspan="4" class="td-num">Totaal excl. btw</td><td class="td-num">' + formatEur(inv.totalExclVat) + '</td></tr>'
      + '<tr class="inv-foot-row"><td colspan="4" class="td-num">Btw</td><td class="td-num">' + formatEur(btw) + '</td></tr>'
      + '<tr class="inv-foot-row inv-foot-total"><td colspan="4" class="td-num">Totaal</td><td class="td-num">' + formatEur(inv.total) + '</td></tr>';
  }

  function renderWorkflow(list) {
    var el = $("inv-wf-list");
    if (!list.length) { el.innerHTML = '<li class="inv-wf-empty">Nog geen beoordelingshistorie</li>'; return; }
    el.innerHTML = list.map(function (w) {
      return '<li class="inv-wf-item">'
        + '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + (STATUS_CLR[w.status] || "yellow") + '">'
        + escHtml(STATUS_LABEL[w.status] || w.status) + '</span> '
        + '<span class="inv-wf-meta">' + escHtml(formatNlDate(w.created_at)) + ' · ' + escHtml(w.user_name || "—") + '</span>'
        + (w.comment ? '<div class="inv-wf-comment">' + escHtml(w.comment) + '</div>' : '')
        + '</li>';
    }).join("");
  }

  // Berekent de controle-staat: ingediend vs. systeemfactuur, per-regel
  // herberekening uit dienst-tijden, en overlappende diensten.
  function computeControl(inv, lines) {
    var shiftLines = (lines || []).filter(function (b) { return b && !b.isGroup && !b.isBlankRow && b.shift; });
    var subHours = 0, subDiensten = 0;
    shiftLines.forEach(function (b) { subHours += Number(b.amount) || 0; subDiensten += 1; });
    var submittedTotal = Number(inv.total) || 0;

    var sys = inv.systemGeneratedSummary || null;
    var sb = sys && sys.billing_summary ? sys.billing_summary : null;
    var sysTotal = sys && sys.totals && sys.totals.total != null ? Number(sys.totals.total) : null;
    var hasSys = sysTotal != null && isFinite(sysTotal);
    var sysHours = sb && sb.total_hours != null ? Number(sb.total_hours) : null;
    var sysDiensten = sb && sb.shifts_count != null ? Number(sb.shifts_count) : null;
    var sysRate = sb && sb.hourly_rate != null ? Number(sb.hourly_rate) : null;

    // Per-regel herberekening uit dienst-tijden (start→eind − pauze).
    var recalc = shiftLines.map(function (b) {
      var dur = shiftHours(b.shift);
      var billed = Number(b.amount) || 0;
      var delta = (dur == null) ? null : Math.round((billed - dur) * 100) / 100;
      return { label: lineLabel(b), price: Number(b.price) || 0, billed: billed,
        computed: dur, delta: delta, diff: (dur != null && Math.abs(delta) > 0.01) };
    });
    var recalcHours = recalc.reduce(function (s, r) { return s + (r.computed != null ? r.computed : r.billed); }, 0);
    var recalcEur = recalc.reduce(function (s, r) { return s + (r.computed != null ? r.computed : r.billed) * r.price; }, 0);
    var lineDiffs = recalc.filter(function (r) { return r.diff; });

    // Overlap-detectie: paren diensten met overlappende tijd binnen deze factuur.
    var wt = shiftLines.map(function (b) {
      return { st: parseTs(b.shift.start_time), et: parseTs(b.shift.end_time) };
    }).filter(function (x) { return x.st && x.et; });
    var overlaps = [];
    for (var i = 0; i < wt.length; i++) {
      for (var j = i + 1; j < wt.length; j++) {
        if (wt[i].st < wt[j].et && wt[j].st < wt[i].et) overlaps.push([wt[i], wt[j]]);
      }
    }

    var diffEur = hasSys ? Math.round((submittedTotal - sysTotal) * 100) / 100 : null;
    return {
      submittedTotal: submittedTotal, subHours: subHours, subDiensten: subDiensten,
      hasSys: hasSys, sysTotal: sysTotal, sysHours: sysHours, sysDiensten: sysDiensten, sysRate: sysRate,
      diffEur: diffEur,
      diffHours: (hasSys && sysHours != null) ? Math.round((subHours - sysHours) * 100) / 100 : null,
      diffDiensten: (hasSys && sysDiensten != null) ? (subDiensten - sysDiensten) : null,
      match: hasSys && Math.abs(diffEur) < 0.01,
      recalc: recalc, recalcHours: Math.round(recalcHours * 100) / 100, recalcEur: Math.round(recalcEur * 100) / 100,
      lineDiffs: lineDiffs, overlaps: overlaps,
    };
  }

  function renderControl(inv, lines) {
    var host = $("inv-control");
    if (!host) return;
    var c = computeControl(inv, lines);
    ctrlState = c;
    if (!c.hasSys && !c.recalc.length) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;

    var badge = !c.hasSys
      ? '<span class="inv-control-badge inv-control-badge--geel">Geen systeemfactuur</span>'
      : c.match
        ? '<span class="inv-control-badge inv-control-badge--match">✓ Eén-op-één met systeemfactuur</span>'
        : '<span class="inv-control-badge inv-control-badge--mismatch">✗ Niet één-op-één · ' + formatEur(Math.abs(c.diffEur)) + ' verschil</span>';

    var cmp =
      '<div class="inv-control-col"><span class="inv-control-col-lbl">Ingediend</span>'
      + '<span class="inv-control-col-amt">' + formatEur(c.submittedTotal) + '</span>'
      + '<span class="inv-control-col-sub">' + fmtH(c.subHours) + ' u · ' + c.subDiensten + ' diensten</span></div>'
      + '<div class="inv-control-col"><span class="inv-control-col-lbl">Systeemfactuur</span>'
      + '<span class="inv-control-col-amt">' + (c.hasSys ? formatEur(c.sysTotal) : "—") + '</span>'
      + '<span class="inv-control-col-sub">' + (c.hasSys
        ? (fmtH(c.sysHours) + ' u · ' + c.sysDiensten + ' diensten' + (c.sysRate ? ' · ' + formatEur(c.sysRate) + '/u' : ""))
        : "niet beschikbaar") + '</span></div>'
      + '<div class="inv-control-col inv-control-col--diff' + (c.match ? " is-match" : "") + '">'
      + '<span class="inv-control-col-lbl">Verschil</span>'
      + '<span class="inv-control-col-amt">' + (c.hasSys ? formatEur(c.diffEur) : "—") + '</span>'
      + '<span class="inv-control-col-sub">' + (c.hasSys ? (fmtH(c.diffHours || 0) + ' u · ' + (c.diffDiensten || 0) + ' diensten') : "") + '</span></div>';

    var warn = "";
    if (c.overlaps.length) {
      var items = c.overlaps.slice(0, 6).map(function (p) {
        return '<li>' + escHtml(fmtDayTime(p[0].st) + "–" + fmtTime(p[0].et)) + '  ↔  '
          + escHtml(fmtDayTime(p[1].st) + "–" + fmtTime(p[1].et)) + '</li>';
      }).join("");
      var more = c.overlaps.length > 6 ? '<li>… en ' + (c.overlaps.length - 6) + ' meer</li>' : "";
      warn = '<div class="inv-control-warn"><span class="inv-control-warn-ico" aria-hidden="true">⚠</span>'
        + '<div class="inv-control-warn-body"><strong>' + c.overlaps.length + ' overlappende '
        + (c.overlaps.length === 1 ? "dienst" : "diensten") + '</strong> — controleer of dit klopt (een dubbele dienst kan legitiem zijn).'
        + '<ul class="inv-control-warn-list">' + items + more + '</ul></div></div>';
    }

    host.innerHTML =
      '<div class="inv-control-head"><h2 class="inv-section-title">Controle — ingediend vs. systeemfactuur</h2>' + badge + '</div>'
      + '<div class="inv-control-cmp">' + cmp + '</div>'
      + warn
      + '<div class="inv-control-actions"><button type="button" class="btn-outline" id="inv-recalc-btn">Herberekenen</button>'
      + '<span class="inv-control-hint">Herberekent elke regel uit de geplande dienst-tijden — incl. overuren en diensten over middernacht.</span></div>'
      + '<div class="inv-recalc-detail" id="inv-recalc-detail" hidden></div>';

    var rb = $("inv-recalc-btn");
    if (rb) rb.addEventListener("click", toggleRecalc);
  }

  function toggleRecalc() {
    var host = $("inv-recalc-detail");
    if (!host || !ctrlState) return;
    if (!host.hidden) { host.hidden = true; host.innerHTML = ""; return; }
    var c = ctrlState;
    var rows = c.recalc.map(function (r) {
      var cls = r.diff ? ' class="inv-recalc-row--diff"' : "";
      var comp = (r.computed == null) ? "—" : fmtH(r.computed);
      var delta = (r.delta == null || Math.abs(r.delta) < 0.01) ? "" : (r.delta > 0 ? "+" : "") + fmtH(r.delta);
      return '<tr' + cls + '><td>' + escHtml(lineFlat(r.label)) + '</td>'
        + '<td class="td-num">' + fmtH(r.billed) + '</td>'
        + '<td class="td-num">' + comp + '</td>'
        + '<td class="td-num inv-recalc-delta">' + escHtml(delta) + '</td></tr>';
    }).join("");
    var summary = c.lineDiffs.length
      ? '<p class="inv-recalc-note">' + c.lineDiffs.length + ' regel(s) wijken af van de geplande dienst-tijden (roze gemarkeerd).</p>'
      : '<p class="inv-recalc-ok">✓ Alle regels komen overeen met de geplande dienst-tijden.</p>';
    host.innerHTML =
      '<table class="inv-recalc-table"><thead><tr><th>Regel</th><th class="td-num">Gefactureerd</th>'
      + '<th class="td-num">Herberekend</th><th class="td-num">Verschil</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '<tfoot><tr class="inv-recalc-foot"><td>Herberekend totaal (uit dienst-tijden)</td>'
      + '<td class="td-num">' + fmtH(c.subHours) + '</td><td class="td-num">' + fmtH(c.recalcHours) + '</td>'
      + '<td class="td-num">' + formatEur(c.recalcEur) + '</td></tr></tfoot></table>' + summary;
    host.hidden = false;
  }
  function lineFlat(s) { return String(s == null ? "" : s).replace(/\s*\n\s*/g, " — "); }

  function renderPdfSheet(inv, lines) {
    var o = inv.organization || {};
    var rows = lines.filter(function (b) { return !b.isGroup && !b.isBlankRow; }).map(function (b) {
      return '<tr><td>' + escHtml(lineLabel(b)).replace(/\n/g, "<br>") + '</td>'
        + '<td class="td-num">' + escHtml(b.unit || "") + '</td>'
        + '<td class="td-num">' + formatEur(b.price) + '</td>'
        + '<td class="td-num">' + formatNum(b.amount) + '</td>'
        + '<td class="td-num">' + formatEur(b.total) + '</td></tr>';
    }).join("");
    var btw = (Number(inv.total) || 0) - (Number(inv.totalExclVat) || 0);
    $("inv-pdf-sheet").innerHTML =
      '<div class="inv-pdf-doc">'
      + '<div class="inv-pdf-head"><div><div class="inv-pdf-h1">FACTUUR</div>'
      + '<div class="inv-pdf-sub">' + escHtml(inv.number || "") + ' · ' + escHtml(inv.periodFormatted || "") + '</div></div>'
      + '<div class="inv-pdf-org"><strong>' + escHtml(o.name || "") + '</strong><br>'
      + 'KvK ' + escHtml(o.kvk || "—") + '<br>BTW ' + escHtml(o.btw || "—") + '</div></div>'
      + '<div class="inv-pdf-party">Medewerker: <strong>' + escHtml((inv.employee && inv.employee.name) || "—") + '</strong>'
      + ' &nbsp;|&nbsp; Factuurdatum: ' + escHtml(formatNlDate(inv.invoiceDate))
      + ' &nbsp;|&nbsp; Vervaldatum: ' + escHtml(formatNlDate(inv.expirationDate)) + '</div>'
      + '<table class="inv-pdf-table"><thead><tr><th>Omschrijving</th><th class="td-num">Eenheid</th>'
      + '<th class="td-num">Prijs</th><th class="td-num">Aantal</th><th class="td-num">Totaal</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
      + '<div class="inv-pdf-totals">'
      + '<div><span>Totaal excl. btw</span><span>' + formatEur(inv.totalExclVat) + '</span></div>'
      + '<div><span>Btw</span><span>' + formatEur(btw) + '</span></div>'
      + '<div class="inv-pdf-grand"><span>Totaal</span><span>' + formatEur(inv.total) + '</span></div>'
      + '</div></div>';
  }

  // Beoordeel-modal
  function openReview(act) {
    pendingAction = act;
    $("inv-review-title").textContent =
      act === "approve" ? "Factuur goedkeuren" : act === "reject" ? "Factuur afwijzen" : "In beoordeling nemen";
    $("inv-review-comment").value = "";
    var e = $("inv-review-error"); if (e) { e.hidden = true; e.textContent = ""; }
    var m = $("inv-review-modal"); m.hidden = false; m.setAttribute("aria-hidden", "false");
  }
  function closeReview() {
    var m = $("inv-review-modal"); m.hidden = true; m.setAttribute("aria-hidden", "true");
    pendingAction = null;
  }
  async function confirmReview() {
    if (!pendingAction || !INV_ID) return;
    var comment = ($("inv-review-comment").value || "").trim();
    var btn = $("inv-review-confirm"); btn.disabled = true;
    try {
      if (pendingAction === "approve") await window.invoicesDB.approve(INV_ID, comment || undefined);
      else if (pendingAction === "reject") await window.invoicesDB.reject(INV_ID, comment || undefined);
      else await window.invoicesDB.markUnderReview(INV_ID, comment || undefined);
      closeReview();
      if (typeof window.showActionFeedback === "function") window.showActionFeedback("saved", "Factuur");
      await load();
    } catch (err) {
      var e = $("inv-review-error");
      if (e) { e.textContent = "Mislukt: " + (err && err.message ? err.message : err); e.hidden = false; }
    } finally { btn.disabled = false; }
  }

  async function load() {
    if (!INV_ID) { $("inv-title").textContent = "Factuur niet gevonden"; return; }
    var inv = window.invoicesDB && window.invoicesDB.getByIdSync(INV_ID);
    if (!inv) { $("inv-title").textContent = "Factuur niet gevonden"; $("inv-subtitle").textContent = ""; return; }
    $("inv-title").textContent = "Factuur " + (inv.number || "");
    $("inv-subtitle").textContent =
      [(inv.organization && inv.organization.name), (inv.employee && inv.employee.name), inv.periodFormatted]
        .filter(Boolean).join(" · ");
    renderActions(inv);
    renderMeta(inv);
    var lines = [], wf = [];
    try { lines = await window.invoicesDB.getBillingFields(INV_ID); } catch (e) { /* */ }
    try { wf = await window.invoicesDB.getWorkflow(INV_ID); } catch (e) { /* */ }
    renderLines(inv, lines);
    renderControl(inv, lines);
    renderWorkflow(wf);
    renderPdfSheet(inv, lines);
  }

  function wire() {
    $("inv-review-close").addEventListener("click", closeReview);
    $("inv-review-cancel").addEventListener("click", closeReview);
    $("inv-review-confirm").addEventListener("click", confirmReview);
    var pb = $("inv-print-btn");
    if (pb) pb.addEventListener("click", function () { window.print(); });
    window.addEventListener("besa:invoices-updated", function () { load().catch(function () {}); });
  }

  async function init() {
    wire();
    if (window.invoicesDB && window.invoicesDB.ready) {
      try { await window.invoicesDB.ready; } catch (e) { /* events herstellen */ }
    }
    await load().catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
