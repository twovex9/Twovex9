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
  function euTick(v) {
    if (v >= 1000) return "€ " + Math.round(v / 1000) + "k";
    return "€ " + Math.round(v);
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
      if (r.href) { col.href = r.href; col.title = r.label + " — bekijk in overzicht"; }
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
          seg.title = s.name + ": " + fmtEuro(s.v);
          bar.appendChild(seg);
        });
      } else {
        var seg2 = document.createElement("div");
        seg2.className = "bd-vbar-seg bd-vbar-seg--blue";
        seg2.style.height = "100%";
        seg2.title = r.label + ": " + fmtInt(r.value);
        bar.appendChild(seg2);
      }
      col.appendChild(bar);
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
      var tt = document.createElementNS("http://www.w3.org/2000/svg", "title");
      tt.textContent = r.name + ": " + r.count;
      c.appendChild(tt);
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
})();
