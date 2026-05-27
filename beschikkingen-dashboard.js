/*
 * beschikkingen-dashboard.js — BS2-conform Beschikkingen-dashboard.
 * Layout/labels/kleuren/charts 1-op-1 met BS2 (/dispositions/dashboard),
 * in BS1-huisstijl. Rekent live uit window.bs2DashboardDB (bewezen formules).
 * KPI-kaarten zijn klikbaar → gefilterde beschikkingen-overzicht (drill-down,
 * net als BS2).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function fmtEuro(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) { return String(Math.round(Number(n) || 0)); }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

  /**
   * PR #5 — Som van urendeclaraties.bedrag opgesplitst in Achterstand
   * (vorige maanden, jaar+maand < huidige) en Lopende maand (jaar+maand
   * = huidige). public.urendeclaraties.maand is 0-indexed (jan=0).
   */
  function computeAchterstandLopendTotaal() {
    var out = { achterstand: 0, lopend: 0 };
    if (!window.urendeclaratiesDB || typeof window.urendeclaratiesDB.getAllSync !== "function") return out;
    var items = window.urendeclaratiesDB.getAllSync() || [];
    if (!items.length) return out;
    var now = new Date();
    var nowYear = now.getFullYear();
    var nowMonth = now.getMonth(); // 0-indexed
    items.forEach(function (u) {
      if (!u) return;
      var y = Number(u.jaar) || 0;
      var m = Number(u.maand); // 0-indexed
      var bedrag = Number(u.bedrag) || 0;
      if (!bedrag) return;
      if (y < nowYear || (y === nowYear && m < nowMonth)) out.achterstand += bedrag;
      else if (y === nowYear && m === nowMonth) out.lopend += bedrag;
    });
    return out;
  }
  function euTick(v) {
    if (v >= 1000) return "€ " + Math.round(v / 1000) + "k";
    return "€ " + Math.round(v);
  }

  /* ---- rijke hover-tooltip (1-op-1 BS2 /dispositions/dashboard) ---- */
  function escTip(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  function clsColor(cls) {
    var c = String(cls || "");
    if (/--g(\s|$)/.test(c)) return "var(--green)";
    if (/--o(\s|$)/.test(c)) return "var(--yellow)";
    return "var(--blue)";
  }
  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "bd-tip";
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(html, x, y) {
    var t = ensureTip();
    if (html != null) t.innerHTML = html;
    t.hidden = false;
    var pad = 14;
    var m = 8;
    var w = t.offsetWidth;
    var h = t.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // Gewenste viewport-positie pal naast de cursor; flip bij schermrand.
    var dx = x + pad;
    var dy = y + pad;
    if (dx + w > vw - m) dx = x - w - pad;
    if (dx < m) dx = m;
    if (dy + h > vh - m) dy = y - h - pad;
    if (dy < m) dy = m;
    t.style.left = dx + "px";
    t.style.top = dy + "px";
    // Zelfcorrectie: een eventuele containing-block-offset (transform/contain
    // op een voorouder) zou de fixed-positie verschuiven. Meet de echte rect
    // en corrigeer zodat de tooltip exact naast de muis staat (en in beeld).
    var rr = t.getBoundingClientRect();
    var cl = parseFloat(t.style.left) || 0;
    var ct = parseFloat(t.style.top) || 0;
    t.style.left = Math.round(cl + (dx - rr.left)) + "px";
    t.style.top = Math.round(ct + (dy - rr.top)) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function buildTipHtml(opt, r) {
    var h = '<div class="bd-tip-title">' + escTip(r.label) + "</div>";
    if (opt.stacked) {
      var tot = 0;
      (r.segs || []).forEach(function (s) {
        tot += (Number(s.v) || 0);
        h += '<div class="bd-tip-row">'
          + '<span class="bd-tip-sw" style="background:' + clsColor(s.cls) + '"></span>'
          + '<span class="bd-tip-nm">' + escTip(s.name) + "</span>"
          + '<span class="bd-tip-val">' + (opt.euro ? fmtEuro(s.v) : fmtInt(s.v)) + "</span>"
          + "</div>";
      });
      h += '<div class="bd-tip-div"></div>';
      h += '<div class="bd-tip-row bd-tip-row--total">'
        + '<span class="bd-tip-sw" style="background:transparent"></span>'
        + '<span class="bd-tip-nm">Totaal</span>'
        + '<span class="bd-tip-val">' + (opt.euro ? fmtEuro(tot) : fmtInt(tot)) + "</span>"
        + "</div>";
    } else {
      h += '<div class="bd-tip-row">'
        + '<span class="bd-tip-sw" style="background:var(--blue)"></span>'
        + '<span class="bd-tip-nm">Aantal</span>'
        + '<span class="bd-tip-val">' + fmtInt(r.value) + "</span>"
        + "</div>";
    }
    return h;
  }
  function donutTipHtml(name, count, color) {
    return '<div class="bd-tip-title">' + escTip(name) + "</div>"
      + '<div class="bd-tip-row">'
      + '<span class="bd-tip-sw" style="background:' + color + '"></span>'
      + '<span class="bd-tip-nm">Aantal</span>'
      + '<span class="bd-tip-val">' + fmtInt(count) + "</span>"
      + "</div>";
  }

  function defaultYear() {
    var y = new Date().getFullYear();
    try {
      var ps = window.bs2DashboardDB.getPayments();
      var mx = "";
      for (var i = 0; i < ps.length; i += 1) {
        var e = ps[i].ends_at ? String(ps[i].ends_at).slice(0, 10) : "";
        if (e > mx) mx = e;
      }
      if (mx.length >= 4) y = parseInt(mx.slice(0, 4), 10);
    } catch (e) { /* huidig jaar */ }
    return y;
  }
  function currentPeriod() {
    var s = $("bd-period-start"), e = $("bd-period-end");
    var sv = s && s.value ? s.value : "";
    var ev = e && e.value ? e.value : "";
    if (!sv || !ev) {
      var y = defaultYear();
      sv = sv || y + "-01-01";
      ev = ev || y + "-12-31";
    }
    return { start: sv, end: ev };
  }

  /* ---- verticale staafgrafiek ---- */
  function renderVBars(opt) {
    // opt: {barsId, axisId, yId, rows:[{label,value,href?}], stacked?, max?}
    var bars = $(opt.barsId), axis = $(opt.axisId), yEl = $(opt.yId);
    if (!bars) return;
    clear(bars); if (axis) clear(axis); if (yEl) clear(yEl);
    var rows = opt.rows || [];
    if (!rows.length) {
      var em = document.createElement("div");
      em.className = "bd-hrow-empty";
      em.textContent = "Geen gegevens in deze periode";
      bars.appendChild(em);
      return;
    }
    var max = opt.max || 0;
    if (!max) {
      rows.forEach(function (r) {
        var tot = opt.stacked ? (r.segs || []).reduce(function (a, s) { return a + s.v; }, 0) : r.value;
        if (tot > max) max = tot;
      });
    }
    if (max <= 0) max = 1;
    // mooie ronde top
    var step = Math.pow(10, Math.floor(Math.log10(max)));
    var niceMax = Math.ceil(max / step) * step;
    if (niceMax < max) niceMax = max;
    if (yEl) {
      for (var t = 4; t >= 0; t -= 1) {
        var d = document.createElement("div");
        var val = niceMax * (t / 4);
        d.textContent = opt.euro ? euTick(val) : String(Math.round(val));
        yEl.appendChild(d);
      }
    }
    rows.forEach(function (r) {
      var col = document.createElement(r.href ? "a" : "div");
      col.className = "bd-vbar-col";
      if (r.href) { col.href = r.href; }
      var bar = document.createElement("div");
      bar.className = "bd-vbar";
      var tot = opt.stacked ? (r.segs || []).reduce(function (a, s) { return a + s.v; }, 0) : r.value;
      bar.style.height = (Math.max(0, tot) / niceMax * 100) + "%";
      if (opt.stacked) {
        (r.segs || []).forEach(function (s) {
          if (s.v <= 0) return;
          var seg = document.createElement("div");
          seg.className = "bd-vbar-seg " + s.cls;
          seg.style.height = (s.v / tot * 100) + "%";
          bar.appendChild(seg);
        });
      } else {
        var seg2 = document.createElement("div");
        seg2.className = "bd-vbar-seg bd-vbar-seg--blue";
        seg2.style.height = "100%";
        bar.appendChild(seg2);
      }
      col.appendChild(bar);
      (function (rowData) {
        var html = null;
        col.addEventListener("mouseenter", function (ev) {
          html = buildTipHtml(opt, rowData);
          showTip(html, ev.clientX, ev.clientY);
        });
        col.addEventListener("mousemove", function (ev) {
          if (!html) html = buildTipHtml(opt, rowData);
          showTip(html, ev.clientX, ev.clientY);
        });
        col.addEventListener("mouseleave", hideTip);
      })(r);
      bars.appendChild(col);
      if (axis) {
        var lb = document.createElement("span");
        lb.textContent = r.label;
        lb.title = r.label;
        axis.appendChild(lb);
      }
    });
  }

  /* ---- donut (Declaratie Methode) ---- */
  function renderDonut(rows) {
    var svg = $("bd-decl-donut"), leg = $("bd-decl-legend");
    if (!svg) return;
    clear(svg); if (leg) clear(leg);
    var total = rows.reduce(function (a, r) { return a + r.count; }, 0);
    var palette = ["var(--blue)", "var(--yellow)", "var(--green)", "var(--red)", "var(--text-muted)"];
    var R = 15.915, CX = 21, CY = 21, SW = 7;
    var ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", CX); ring.setAttribute("cy", CY); ring.setAttribute("r", R);
    ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "var(--line)"); ring.setAttribute("stroke-width", SW);
    svg.appendChild(ring);
    var off = 25; // start bovenaan
    rows.forEach(function (r, i) {
      if (!total || r.count <= 0) return;
      var pct = r.count / total * 100;
      var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", CX); c.setAttribute("cy", CY); c.setAttribute("r", R);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", palette[i % palette.length]);
      c.setAttribute("stroke-width", SW);
      c.setAttribute("stroke-dasharray", pct + " " + (100 - pct));
      c.setAttribute("stroke-dashoffset", off);
      c.setAttribute("transform", "rotate(-90 " + CX + " " + CY + ")");
      c.style.cursor = "pointer";
      (function (nm, cnt, color) {
        var html = donutTipHtml(nm, cnt, color);
        c.addEventListener("mouseenter", function (ev) { showTip(html, ev.clientX, ev.clientY); });
        c.addEventListener("mousemove", function (ev) { showTip(html, ev.clientX, ev.clientY); });
        c.addEventListener("mouseleave", hideTip);
      })(r.name, r.count, palette[i % palette.length]);
      svg.appendChild(c);
      off -= pct;
    });
    var txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", CX); txt.setAttribute("y", CY + 2.4);
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("class", "bd-donut-hole-txt");
    txt.textContent = String(total);
    svg.appendChild(txt);
    if (leg) {
      rows.forEach(function (r, i) {
        var row = document.createElement("div");
        row.className = "bd-donut-leg";
        var sw = document.createElement("span");
        sw.className = "bd-donut-leg-s";
        sw.style.background = palette[i % palette.length];
        var nm = document.createElement("span");
        nm.textContent = r.name;
        var nn = document.createElement("span");
        nn.className = "bd-donut-leg-n";
        nn.textContent = String(r.count);
        row.appendChild(sw); row.appendChild(nm); row.appendChild(nn);
        (function (nme, cnt, color) {
          var html = donutTipHtml(nme, cnt, color);
          row.addEventListener("mouseenter", function (ev) { showTip(html, ev.clientX, ev.clientY); });
          row.addEventListener("mousemove", function (ev) { showTip(html, ev.clientX, ev.clientY); });
          row.addEventListener("mouseleave", hideTip);
        })(r.name, r.count, palette[i % palette.length]);
        leg.appendChild(row);
      });
    }
  }

  var DM_LABEL = { ons: "ONS", manual: "Handmatig", wlz: "WLZ", svb: "SVB" };

  function render() {
    if (!window.bs2DashboardDB || typeof window.bs2DashboardDB.computeKpis !== "function") return;
    var per = currentPeriod();
    var k = window.bs2DashboardDB.computeKpis(per.start, per.end);

    setText("bd-v-ib", fmtEuro(k.declared_pending_amount.amount));
    setText("bd-s-ib", k.declared_pending_amount.pending_invoices + (k.declared_pending_amount.pending_invoices === 1 ? " betaling te verwerken" : " betalingen te verwerken"));
    setText("bd-v-out", fmtEuro(k.outstanding_to_declare.amount));
    // PR #5 — split "Te declareren totaal" in Achterstand (vorige maanden)
    // vs Lopende maand, op basis van urendeclaraties (clientside-aggregatie).
    var split = computeAchterstandLopendTotaal();
    setText("bd-v-achterstand", fmtEuro(split.achterstand));
    setText("bd-v-lopend", fmtEuro(split.lopend));
    setText("bd-v-betaald", fmtEuro(k.paid_amount.amount));
    setText("bd-s-betaald", k.paid_amount.paid_invoices + (k.paid_amount.paid_invoices === 1 ? " factuur" : " facturen"));
    setText("bd-v-actief", fmtInt(k.active_dispositions.count));
    setText("bd-v-60", fmtInt(k.overdue_60d.count));
    setText("bd-v-open", fmtInt(k.pending_dispositions.count));

    // Maandelijkse Betalingen — gestapeld groen (betaald) + oranje (wacht op betaling)
    renderVBars({
      barsId: "bd-monthly-stack", axisId: "bd-stack-labels", yId: "bd-y-labels",
      euro: true, stacked: true,
      rows: (k.monthly_payments || []).map(function (m) {
        return { label: m.name, segs: [
          { name: "Betaald", v: m.paid || 0, cls: "bd-vbar-seg--g" },
          { name: "Wacht op betaling", v: m.declared_pending || 0, cls: "bd-vbar-seg--o" },
        ] };
      }),
    });

    renderVBars({
      barsId: "bd-zorg-bars", axisId: "bd-zorg-axis", yId: "bd-zorg-y",
      rows: (k.care_types || []).map(function (c) {
        return { label: c.name, value: c.count };
      }),
    });
    renderVBars({
      barsId: "bd-loc-bars", axisId: "bd-loc-axis", yId: "bd-loc-y",
      rows: (k.locations || []).map(function (c) {
        return { label: c.name, value: c.count };
      }),
    });
    renderVBars({
      barsId: "bd-proc-bars", axisId: "bd-proc-axis", yId: "bd-proc-y",
      rows: (k.processing_time || []).map(function (c) {
        return { label: c.time_range, value: c.count };
      }),
    });
    renderDonut((k.payment_methods || []).map(function (p) {
      return { name: DM_LABEL[p.declaration_method] || p.declaration_method, count: p.count };
    }));
  }

  function wirePeriod() {
    var s = $("bd-period-start"), e = $("bd-period-end");
    if (s) s.addEventListener("change", render);
    if (e) e.addEventListener("change", render);
    var pill = $("bd-daterange");
    if (pill && s) {
      pill.addEventListener("click", function (ev) {
        if (ev.target === pill || (ev.target.classList && ev.target.classList.contains("bd-daterange-ico"))) {
          if (s.showPicker) { try { s.showPicker(); } catch (_e) { s.focus(); } } else s.focus();
        }
      });
    }
  }

  async function init() {
    wirePeriod();
    try {
      if (window.bs2DashboardDB && window.bs2DashboardDB.ready) await window.bs2DashboardDB.ready;
    } catch (e) { /* reporter meldde al */ }
    var y = defaultYear();
    var s = $("bd-period-start"), e = $("bd-period-end");
    if (s && !s.value) s.value = y + "-01-01";
    if (e && !e.value) e.value = y + "-12-31";
    var box = $("bd-period-range");
    if (box && s && e && window.BesaDateRange) {
      window.BesaDateRange.mount({
        container: box,
        startInput: s,
        endInput: e,
        allowEmpty: false,
        emptyLabel: "Periode",
        year: y
      });
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") render();
  });
  window.addEventListener("focus", render);
  // PR #5: re-render zodra urendeclaraties geladen of gemuteerd zijn
  window.addEventListener("besa:urendeclaraties-updated", render);
})();
