/*
 * beschikkingen-dashboard.js — BS2-conform Beschikkingen-dashboard.
 * Rendert de volledige BS2 /api/rpc "dispositions:dashboard" response, live
 * berekend uit window.bs2DashboardDB (Supabase: bs2_dispositions +
 * bs2_disposition_payments) met de bewezen formules. Periode-filter werkt
 * 1-op-1 zoals BS2 (filter op payment.ends_at ∈ [start,end]).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function fmtEuro(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) { return String(Math.round(Number(n) || 0)); }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function defaultPeriod() {
    // BS2 dashboard-default = lopend jaar (de gescrapete default-response was
    // 2026-01-01..12-31). Gebruik het jaar van de meest recente payment-ends_at
    // zodat het dashboard ook na een data-refresh het juiste jaar toont.
    var y = new Date().getFullYear();
    try {
      var ps = window.bs2DashboardDB.getPayments();
      var mx = "";
      for (var i = 0; i < ps.length; i += 1) {
        var e = ps[i].ends_at ? String(ps[i].ends_at).slice(0, 10) : "";
        if (e > mx) mx = e;
      }
      if (mx.length >= 4) y = parseInt(mx.slice(0, 4), 10);
    } catch (e) { /* fallback huidig jaar */ }
    return { start: y + "-01-01", end: y + "-12-31", label: "Jaar " + y };
  }

  function currentPeriod() {
    var sel = $("bd-period-preset");
    var v = sel ? sel.value : "year";
    var now = new Date();
    if (v === "custom") {
      var s = $("bd-period-start"), e = $("bd-period-end");
      return {
        start: (s && s.value) || "1970-01-01",
        end: (e && e.value) || "2999-12-31",
      };
    }
    if (v === "thismonth") {
      var ym = now.getFullYear() + "-" + pad2(now.getMonth() + 1);
      var last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return { start: ym + "-01", end: ym + "-" + pad2(last) };
    }
    if (v === "lastmonth") {
      var d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var ym2 = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
      var last2 = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { start: ym2 + "-01", end: ym2 + "-" + pad2(last2) };
    }
    var dp = defaultPeriod();
    return { start: dp.start, end: dp.end };
  }

  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }

  function renderHbar(containerId, rows, nameKey) {
    var c = $(containerId);
    if (!c) return;
    c.innerHTML = "";
    var max = 1, i;
    for (i = 0; i < rows.length; i += 1) if (rows[i].count > max) max = rows[i].count;
    if (!rows.length) {
      var em = document.createElement("div");
      em.className = "bd-hrow-empty";
      em.textContent = "Geen gegevens in deze periode";
      c.appendChild(em);
      return;
    }
    for (i = 0; i < rows.length; i += 1) {
      var row = document.createElement("div");
      row.className = "bd-hrow";
      var l = document.createElement("div");
      l.className = "bd-hrow-l";
      l.textContent = String(rows[i][nameKey] || "Onbekend");
      l.title = l.textContent;
      var t = document.createElement("div");
      t.className = "bd-hrow-track";
      var f = document.createElement("div");
      f.className = "bd-hrow-fill";
      f.style.width = (100 * rows[i].count / max) + "%";
      t.appendChild(f);
      var v = document.createElement("div");
      v.className = "bd-hrow-n";
      v.textContent = fmtInt(rows[i].count);
      row.appendChild(l);
      row.appendChild(t);
      row.appendChild(v);
      c.appendChild(row);
    }
  }

  function renderMonthly(months) {
    var wrap = $("bd-monthly-stack");
    var ax = $("bd-stack-labels");
    var yL = $("bd-y-labels");
    if (!wrap || !ax) return;
    wrap.innerHTML = "";
    ax.innerHTML = "";
    if (yL) yL.innerHTML = "";

    var stapels = months.map(function (m) {
      var tot = (m.paid || 0) + (m.declared_pending || 0);
      return { name: m.name, paid: m.paid || 0, dp: m.declared_pending || 0, tot: tot };
    });
    var maxT = 1;
    stapels.forEach(function (s) { if (s.tot > maxT) maxT = s.tot; });

    if (yL) {
      for (var t = 4; t >= 0; t -= 1) {
        var val = maxT * (t / 4);
        var s0 = document.createElement("div");
        s0.className = "bd-y-tick";
        s0.textContent = val >= 1000 ? Math.round(val / 1000) + "k" : "€" + Math.round(val);
        yL.appendChild(s0);
      }
    }
    if (!stapels.length) {
      wrap.style.gridTemplateColumns = "1fr";
      var ph0 = document.createElement("div");
      ph0.className = "bd-hrow-empty";
      ph0.textContent = "Geen betalingen in deze periode";
      wrap.appendChild(ph0);
      return;
    }
    wrap.style.gridTemplateColumns = "repeat(" + stapels.length + ", minmax(0, 1fr))";
    ax.style.gridTemplateColumns = "repeat(" + stapels.length + ", minmax(0, 1fr))";
    stapels.forEach(function (s) {
      var col = document.createElement("div");
      col.className = "bd-stack-col";
      var bar = document.createElement("div");
      bar.className = "bd-stack-bar";
      if (s.tot > 0) {
        var hp = (s.tot / maxT) * 100;
        var inner = document.createElement("div");
        inner.style.height = hp + "%";
        inner.style.display = "flex";
        inner.style.flexDirection = "column";
        inner.style.justifyContent = "flex-end";
        if (s.paid > 0) {
          var g = document.createElement("div");
          g.className = "bd-stack-seg bd-s--g";
          g.style.flexGrow = String(s.paid);
          g.title = "Betaald: " + fmtEuro(s.paid);
          inner.appendChild(g);
        }
        if (s.dp > 0) {
          var b = document.createElement("div");
          b.className = "bd-stack-seg bd-s--b";
          b.style.flexGrow = String(s.dp);
          b.title = "In behandeling: " + fmtEuro(s.dp);
          inner.appendChild(b);
        }
        bar.appendChild(inner);
      } else {
        var ph = document.createElement("div");
        ph.className = "bd-stack-seg bd-s--ph";
        ph.style.flexGrow = "1";
        bar.appendChild(ph);
      }
      col.appendChild(bar);
      wrap.appendChild(col);
      var lb = document.createElement("span");
      lb.className = "bd-stack-lbl";
      lb.textContent = s.name;
      ax.appendChild(lb);
    });
  }

  function render() {
    if (!window.bs2DashboardDB || typeof window.bs2DashboardDB.computeKpis !== "function") return;
    var per = currentPeriod();
    var k = window.bs2DashboardDB.computeKpis(per.start, per.end);

    // KPI-cards (BS2 rpc 1-op-1)
    setText("bd-v-betaald", fmtEuro(k.paid_amount.amount));
    setText("bd-s-betaald", k.paid_amount.paid_invoices + (k.paid_amount.paid_invoices === 1 ? " factuur" : " facturen"));
    setText("bd-v-ib", fmtEuro(k.declared_pending_amount.amount));
    setText("bd-s-ib", k.declared_pending_amount.pending_invoices + (k.declared_pending_amount.pending_invoices === 1 ? " betaling te verwerken" : " betalingen te verwerken"));
    setText("bd-v-achter", fmtEuro(k.not_yet_declared_amount.amount));
    setText("bd-v-tedecl", fmtEuro(k.to_be_declared_current_month.amount));
    setText("bd-v-out", fmtEuro(k.outstanding_to_declare.amount));
    setText("bd-v-nietbetaald", fmtEuro(k.not_yet_paid_amount.amount));
    setText("bd-v-nogtedecl", fmtEuro(k.to_declare_amount.amount));

    setText("bd-v-actief", fmtInt(k.active_dispositions.count));
    setText("bd-v-open", fmtInt(k.pending_dispositions.count));
    setText("bd-v-60", fmtInt(k.overdue_60d.count));

    renderMonthly(k.monthly_payments);
    renderHbar("bd-zorg-bars", k.care_types, "name");
    renderHbar("bd-loc-bars", k.locations, "name");
    renderHbar("bd-decl-bars", k.payment_methods, "declaration_method");
    renderHbar("bd-proc-bars", k.processing_time, "time_range");

    var pl = $("bd-period-label");
    if (pl) pl.textContent = per.start + " t/m " + per.end;
  }

  function wirePeriod() {
    var sel = $("bd-period-preset");
    var cw = $("bd-period-custom");
    function syncCustom() {
      if (!sel || !cw) return;
      cw.style.display = sel.value === "custom" ? "" : "none";
    }
    if (sel) sel.addEventListener("change", function () { syncCustom(); render(); });
    var s = $("bd-period-start"), e = $("bd-period-end");
    if (s) s.addEventListener("change", render);
    if (e) e.addEventListener("change", render);
    syncCustom();
  }

  async function init() {
    wirePeriod();
    try {
      if (window.bs2DashboardDB && window.bs2DashboardDB.ready) await window.bs2DashboardDB.ready;
    } catch (e) { /* reporter heeft al gemeld */ }
    // default-jaar instellen in custom-velden zodat "Aangepast" zinvol begint
    var dp = defaultPeriod();
    var s = $("bd-period-start"), e = $("bd-period-end");
    if (s && !s.value) s.value = dp.start;
    if (e && !e.value) e.value = dp.end;
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
