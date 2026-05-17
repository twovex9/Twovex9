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

  var INV_ID = getId();
  var pendingAction = null;

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
