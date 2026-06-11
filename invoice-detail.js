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
  var curLines = [];      // geladen factuurregels (voor de afwijs-dienst-picker)
  var rejectOpts = [];    // regels in de afwijs-picker (index → regel)
  var roosterLines = [];  // bewerkbare rooster-regels (dienst → geplande uren) voor herberekenen
  var lastInv = null;     // laatst geladen factuur (voor recompute + gate)

  function currentUserName() {
    try {
      var p = window.profilesDB && window.profilesDB.getCurrentSync && window.profilesDB.getCurrentSync();
      if (p) return ((p.voornaam || "") + " " + (p.achternaam || "")).trim() || p.email || "Onbekend";
    } catch (e) { /* */ }
    return "Onbekend";
  }

  // Vergelijkt de ingediende factuur (inv.total) met de systeemfactuur
  // (systemGeneratedSummary.totals.total) — uitsluitend op basis van `inv`,
  // zodat de goedkeuren-gate al klopt vóór de regels asynchroon geladen zijn.
  function matchState(inv) {
    var submittedTotal = Number(inv.total) || 0;
    var sys = inv.systemGeneratedSummary || null;
    var sysTotal = sys && sys.totals && sys.totals.total != null ? Number(sys.totals.total) : null;
    var hasSys = sysTotal != null && isFinite(sysTotal);
    var diff = hasSys ? Math.round((submittedTotal - sysTotal) * 100) / 100 : null;
    return { submittedTotal: submittedTotal, sysTotal: sysTotal, hasSys: hasSys, diff: diff, match: hasSys && Math.abs(diff) < 0.01 };
  }

  function renderActions(inv) {
    var host = $("inv-actions");
    var ms = matchState(inv);
    // Goedkeuren mag pas als de systeemfactuur 1-op-1 is met de ingediende
    // factuur. Wijkt het af → knop geblokkeerd tot het rooster herberekend is.
    var approveBlocked = ms.hasSys && !ms.match;
    var html = "";
    if (inv.canBeApproved) {
      if (approveBlocked) {
        html += '<button type="button" class="btn-primary" data-act="approve" disabled'
          + ' title="Systeemfactuur wijkt af van de ingediende factuur — pas het rooster aan en klik Herberekenen tot beide overeenkomen.">Goedkeuren</button>';
      } else {
        html += '<button type="button" class="btn-primary" data-act="approve">Goedkeuren</button>';
      }
    }
    if (inv.canBeMarkedUnderReview) html += '<button type="button" class="btn-outline" data-act="review">In beoordeling</button>';
    if (inv.canBeRejected) html += '<button type="button" class="btn-outline inv-btn-reject" data-act="reject">Afwijzen</button>';
    host.innerHTML = html;
    host.querySelectorAll("button[data-act]:not([disabled])").forEach(function (b) {
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
        + (w.data && w.data.diensten && w.data.diensten.length
          ? '<div class="inv-wf-diensten">Betreft: ' + w.data.diensten.map(function (d) { return escHtml(lineFlat(d)); }).join("; ") + '</div>'
          : "")
        + '</li>';
    }).join("");
  }

  // Rode banner met de laatste afwijzingsreden — direct zichtbaar voor
  // controleur én planner (die het rooster moet aanpassen).
  function renderRejectBanner(inv, wf) {
    var host = $("inv-reject-banner");
    if (!host) return;
    if (inv.status !== "rejected") { host.hidden = true; host.innerHTML = ""; return; }
    var last = null;
    (wf || []).forEach(function (w) { if (w.status === "rejected") last = w; });
    var reason = last && last.comment ? last.comment : "Geen reden vastgelegd.";
    var diensten = last && last.data && last.data.diensten ? last.data.diensten : [];
    host.hidden = false;
    host.innerHTML = '<div class="inv-reject-card">'
      + '<strong class="inv-reject-title">Afgewezen — reden voor de planner</strong>'
      + '<div class="inv-reject-reason">' + escHtml(reason) + '</div>'
      + (diensten.length
        ? '<div class="inv-reject-diensten">Betreft: ' + diensten.map(function (d) { return escHtml(lineFlat(d)); }).join("; ") + '</div>'
        : "")
      + '</div>';
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
    lastInv = inv;
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
      + (c.hasSys && !c.match
          ? '<div class="inv-control-gate"><span class="inv-control-gate-ico" aria-hidden="true">⛔</span>'
            + '<div>Goedkeuren is geblokkeerd zolang de systeemfactuur afwijkt van de ingediende factuur. '
            + 'Pas hieronder het rooster aan (geplande uren per dienst) en klik <strong>Herberekenen</strong> tot beide overeenkomen.</div></div>'
          : "")
      + warn
      + '<div class="inv-control-actions"><button type="button" class="btn-outline" id="inv-rooster-toggle">Rooster aanpassen &amp; herberekenen</button>'
      + '<span class="inv-control-hint">Pas de geplande uren per dienst aan en herbereken de systeemfactuur — incl. overuren en diensten over middernacht.</span></div>'
      + '<div class="inv-rooster" id="inv-rooster" hidden></div>';

    var tg = $("inv-rooster-toggle");
    if (tg) tg.addEventListener("click", toggleRooster);
  }

  // ---- Rooster-bewerker: geplande uren per dienst aanpassen → herberekenen ----
  // De diensten op deze factuur vormen het rooster. Default-uren = geplande
  // dienst-tijden (start→eind − pauze); valt terug op een eerder opgeslagen
  // herberekening of de gefactureerde uren. De controleur corrigeert de uren,
  // klikt Herberekenen → systeemfactuur = Σ(uren × tarief) wordt opgeslagen.
  function fmtNumInput(n) {
    var v = Math.round(Number(n || 0) * 100) / 100;
    return String(v);
  }
  function buildRoosterLines(inv, lines) {
    var sys = inv && inv.systemGeneratedSummary ? inv.systemGeneratedSummary : null;
    var saved = sys && sys.metadata && sys.metadata.recalc && Array.isArray(sys.metadata.recalc.lines)
      ? sys.metadata.recalc.lines : [];
    var savedById = {};
    saved.forEach(function (s) { if (s && s.id != null) savedById[String(s.id)] = Number(s.hours); });
    var real = (lines || []).filter(function (b) { return b && !b.isGroup && !b.isBlankRow; });
    var shiftLines = real.filter(function (b) { return b.shift; });
    var src = shiftLines.length ? shiftLines : real;
    return src.map(function (b) {
      var shiftH = shiftHours(b.shift);
      var billed = Number(b.amount) || 0;
      var base = shiftH != null ? shiftH : billed;
      var saveH = savedById[String(b.id)];
      var hours = (saveH != null && isFinite(saveH)) ? saveH : base;
      return { id: b.id, label: lineLabel(b), price: Number(b.price) || 0, billed: billed, shiftH: shiftH, base: base, hours: hours };
    });
  }

  function toggleRooster() {
    var host = $("inv-rooster");
    if (!host || !lastInv) return;
    if (!host.hidden) { host.hidden = true; host.innerHTML = ""; return; }
    roosterLines = buildRoosterLines(lastInv, curLines);
    renderRooster();
    host.hidden = false;
  }

  function renderRooster() {
    var host = $("inv-rooster");
    if (!host) return;
    if (!roosterLines.length) {
      host.innerHTML = '<p class="inv-recalc-note">Geen dienst-regels beschikbaar om te herberekenen.</p>';
      return;
    }
    var rows = roosterLines.map(function (l, i) {
      var ref = l.shiftH != null ? fmtH(l.shiftH) + " u" : "—";
      return '<tr><td>' + escHtml(lineFlat(l.label)) + '</td>'
        + '<td class="td-num">' + formatEur(l.price) + '</td>'
        + '<td class="td-num"><input class="inv-rooster-input" type="number" min="0" step="0.25" '
        + 'inputmode="decimal" data-idx="' + i + '" value="' + fmtNumInput(l.hours) + '" aria-label="Geplande uren"></td>'
        + '<td class="td-num inv-rooster-ref">' + ref + '</td>'
        + '<td class="td-num inv-rooster-line-total" data-idx="' + i + '">' + formatEur(l.hours * l.price) + '</td></tr>';
    }).join("");
    host.innerHTML =
      '<table class="inv-rooster-table"><thead><tr><th>Dienst</th><th class="td-num">Tarief</th>'
      + '<th class="td-num">Geplande uren</th><th class="td-num">Dienst-tijden</th><th class="td-num">Regel-totaal</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '<tfoot>'
      + '<tr class="inv-rooster-foot"><td>Systeemfactuur (herberekend)</td><td></td>'
      + '<td class="td-num" id="inv-rooster-hours"></td><td></td><td class="td-num" id="inv-rooster-total"></td></tr>'
      + '<tr><td>Ingediend door medewerker</td><td></td><td class="td-num"></td><td></td>'
      + '<td class="td-num">' + formatEur(Number(lastInv.total) || 0) + '</td></tr>'
      + '<tr><td>Verschil</td><td></td><td class="td-num"></td><td></td>'
      + '<td class="td-num"><span id="inv-rooster-diff" class="inv-rooster-diff-badge"></span></td></tr>'
      + '</tfoot></table>'
      + '<div class="inv-rooster-actions">'
      + '<button type="button" class="btn-outline" id="inv-rooster-reset">Herstel naar dienst-tijden</button>'
      + '<button type="button" class="btn-primary" id="inv-rooster-recalc">Herberekenen</button>'
      + '</div>';
    host.querySelectorAll(".inv-rooster-input").forEach(function (inp) {
      inp.addEventListener("input", onRoosterInput);
    });
    var rs = $("inv-rooster-reset"); if (rs) rs.addEventListener("click", resetRooster);
    var rc = $("inv-rooster-recalc"); if (rc) rc.addEventListener("click", doRecalc);
    refreshRoosterTotals();
  }

  function onRoosterInput(e) {
    var idx = parseInt(e.target.getAttribute("data-idx"), 10);
    if (isNaN(idx) || !roosterLines[idx]) return;
    var v = parseFloat(String(e.target.value).replace(",", "."));
    roosterLines[idx].hours = (isFinite(v) && v >= 0) ? v : 0;
    var cell = document.querySelector('.inv-rooster-line-total[data-idx="' + idx + '"]');
    if (cell) cell.textContent = formatEur(roosterLines[idx].hours * roosterLines[idx].price);
    refreshRoosterTotals();
  }

  function roosterTotals() {
    var hours = 0, total = 0;
    roosterLines.forEach(function (l) { hours += l.hours; total += l.hours * l.price; });
    return { hours: Math.round(hours * 100) / 100, total: Math.round(total * 100) / 100 };
  }

  function refreshRoosterTotals() {
    var t = roosterTotals();
    var submitted = Number(lastInv.total) || 0;
    var diff = Math.round((submitted - t.total) * 100) / 100;
    var match = Math.abs(diff) < 0.01;
    var hEl = $("inv-rooster-hours"); if (hEl) hEl.textContent = fmtH(t.hours) + " u";
    var tEl = $("inv-rooster-total"); if (tEl) tEl.textContent = formatEur(t.total);
    var dEl = $("inv-rooster-diff");
    if (dEl) {
      dEl.textContent = match ? "✓ Komt overeen" : (formatEur(diff) + " verschil");
      dEl.className = "inv-rooster-diff-badge " + (match ? "inv-rooster-diff-badge--match" : "inv-rooster-diff-badge--mismatch");
    }
  }

  function resetRooster() {
    roosterLines.forEach(function (l) { l.hours = l.base; });
    renderRooster();
  }

  function buildSummary(inv, t) {
    var prev = inv.systemGeneratedSummary || {};
    var rate = t.hours > 0 ? Math.round((t.total / t.hours) * 100) / 100 : (roosterLines[0] ? roosterLines[0].price : 0);
    var summary = Object.assign({}, prev);
    summary.totals = Object.assign({}, prev.totals || {}, { total: t.total, total_excl_vat: t.total });
    summary.billing_summary = Object.assign({}, prev.billing_summary || {}, {
      total_hours: t.hours, shifts_count: roosterLines.length, hourly_rate: rate,
    });
    summary.metadata = Object.assign({}, prev.metadata || {}, {
      recalc: {
        lines: roosterLines.map(function (l) { return { id: l.id, hours: l.hours }; }),
        by: currentUserName(), at: new Date().toISOString(),
      },
    });
    summary.mode = prev.mode || "recalculated";
    summary.generated_at = new Date().toISOString();
    return summary;
  }

  async function doRecalc() {
    if (!lastInv || !INV_ID) return;
    var btn = $("inv-rooster-recalc");
    if (btn) btn.disabled = true;
    try {
      var t = roosterTotals();
      var summary = buildSummary(lastInv, t);
      await window.invoicesDB.recomputeSystem(INV_ID, summary);
      if (typeof window.showActionFeedback === "function") window.showActionFeedback("saved", "Systeemfactuur");
      await load();
      // rooster open houden met de zojuist opgeslagen waarden
      var host = $("inv-rooster");
      if (host) { roosterLines = buildRoosterLines(lastInv, curLines); renderRooster(); host.hidden = false; }
    } catch (err) {
      if (typeof window.showError === "function") window.showError("Herberekenen mislukt: " + (err && err.message ? err.message : err));
    } finally {
      if (btn) btn.disabled = false;
    }
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
    var isReject = act === "reject";
    $("inv-review-title").textContent =
      act === "approve" ? "Factuur goedkeuren" : isReject ? "Factuur afwijzen" : "In beoordeling nemen";
    var ta = $("inv-review-comment"); ta.value = "";
    var lbl = $("inv-review-comment-label");
    if (lbl) lbl.innerHTML = isReject ? 'Reden van afwijzing <span class="inv-req">*</span>' : "Opmerking";
    ta.placeholder = isReject
      ? "Welke regel/dienst klopt niet en waarom? (verplicht — de planner past hierop het rooster aan)"
      : "Optionele opmerking bij deze beoordeling";
    var lf = $("inv-review-lines-field");
    if (lf) lf.hidden = !isReject;
    if (isReject) populateRejectLines();
    var e = $("inv-review-error"); if (e) { e.hidden = true; e.textContent = ""; }
    var m = $("inv-review-modal"); m.hidden = false; m.setAttribute("aria-hidden", "false");
    setTimeout(function () { try { ta.focus(); } catch (e2) { /* */ } }, 30);
  }
  // Vult de "welke dienst(en)"-picker met de factuurregels.
  function populateRejectLines() {
    var host = $("inv-review-lines");
    if (!host) return;
    rejectOpts = (curLines || []).filter(function (b) { return b && !b.isGroup && !b.isBlankRow; });
    if (!rejectOpts.length) { host.innerHTML = '<span class="inv-review-lines-empty">Geen factuurregels beschikbaar</span>'; return; }
    host.innerHTML = rejectOpts.map(function (b, i) {
      return '<label class="inv-review-line"><input type="checkbox" class="inv-review-line-cb" value="' + i + '" />'
        + '<span>' + escHtml(lineFlat(lineLabel(b))) + '</span></label>';
    }).join("");
  }
  // Bouwt de gestructureerde afwijs-payload (gekozen dienst(en)) voor workflow.data.
  function buildRejectMeta() {
    var picked = [];
    document.querySelectorAll("#inv-review-lines .inv-review-line-cb:checked").forEach(function (cb) {
      var i = parseInt(cb.value, 10);
      if (rejectOpts[i]) picked.push(lineFlat(lineLabel(rejectOpts[i])));
    });
    return picked.length ? { diensten: picked } : null;
  }
  function closeReview() {
    var m = $("inv-review-modal"); m.hidden = true; m.setAttribute("aria-hidden", "true");
    pendingAction = null;
  }
  async function confirmReview() {
    if (!pendingAction || !INV_ID) return;
    var comment = ($("inv-review-comment").value || "").trim();
    var errEl = $("inv-review-error");
    // Afwijzingsreden is VERPLICHT (anders is achteraf niet terug te vinden
    // waarom iets is afgekeurd — kernpunt uit het facturatie-document).
    if (pendingAction === "reject" && !comment) {
      if (errEl) {
        errEl.textContent = "Geef een reden van afwijzing op — verplicht, zodat de planner weet wat er aangepast moet worden.";
        errEl.hidden = false;
      }
      var taf = $("inv-review-comment"); if (taf) { try { taf.focus(); } catch (e3) { /* */ } }
      return;
    }
    var btn = $("inv-review-confirm"); btn.disabled = true;
    try {
      if (pendingAction === "approve") await window.invoicesDB.approve(INV_ID, comment || undefined);
      else if (pendingAction === "reject") await window.invoicesDB.reject(INV_ID, comment, buildRejectMeta());
      else await window.invoicesDB.markUnderReview(INV_ID, comment || undefined);
      closeReview();
      if (typeof window.showActionFeedback === "function") window.showActionFeedback("saved", "Factuur");
      await load();
    } catch (err) {
      if (errEl) { errEl.textContent = "Mislukt: " + (err && err.message ? err.message : err); errEl.hidden = false; }
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
    curLines = lines || [];
    renderLines(inv, lines);
    renderControl(inv, lines);
    renderRejectBanner(inv, wf);
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
