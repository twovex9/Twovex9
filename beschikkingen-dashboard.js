/* global getBeschikkingenItems, aggBescVerlooptBinnen60, normalizeBeschikkingRij */
(function () {
  "use strict";

  if (typeof getBeschikkingenItems !== "function") return;

  function n2(x) {
    if (x == null || isNaN(x)) return 0;
    return Math.round(Number(x) * 100) / 100;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function monthLabel(ym) {
    if (!ym || ym.length < 7) return "—";
    var m = parseInt(ym.slice(5, 7), 10) - 1;
    var M = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return (M[m] || "") + " " + ym.slice(0, 4);
  }

  function fmtEuro(n) {
    if (n == null || isNaN(n)) n = 0;
    var v = n2(n);
    return "€\u00a0" + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function rollendeMaanden12() {
    var out = [];
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 11);
    for (var i = 0; i < 12; i += 1) {
      out.push(d.getFullYear() + "-" + pad2(d.getMonth() + 1));
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }

  function eindNietVerstreken(b) {
    if (!b || !b.eindISO) return true;
    var t = new Date(b.eindISO);
    if (isNaN(t.getTime())) return true;
    var nu = new Date();
    nu.setHours(0, 0, 0, 0);
    return t.getTime() >= nu.getTime();
  }

  function normR(r) {
    if (typeof normalizeBeschikkingRij === "function") return normalizeBeschikkingRij(r);
    return r;
  }

  function lijstActief(alle) {
    var a = [];
    for (var i = 0; i < alle.length; i += 1) {
      if (!alle[i] || alle[i].gearchiveerd) continue;
      a.push(normR(alle[i]));
    }
    return a;
  }

  function aggregate(items) {
    var tGIB = 0, nGIB = 0, nAchter = 0, tLM = 0, tBeta = 0;
    var act = 0, nOpen = 0;
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it || it.gearchiveerd) continue;
      tGIB += n2(it.gedeclGemeenteInBehandeling);
      if (n2(it.gedeclGemeenteInBehandeling) > 0) nGIB += 1;
      nAchter += n2(it.nogNietGedeclareerd);
      tLM += n2(it.teDeclarerenLM);
      if (it.betalingsStatus === "betaald") tBeta += n2(it.betaaldCumulatief);
      var f = String(it.fase || "").toLowerCase();
      if (f === "in_aanvraag" || f === "aangevraagd") nOpen += 1;
      if ((f === "actief" || f === "in_zorg" || f === "in_dienst") && eindNietVerstreken(it)) act += 1;
    }
    return {
      gedeclInBehand: tGIB,
      nGedeclInbehand: nGIB,
      achterstand: nAchter,
      tedeclMaand: tLM,
      betaald: tBeta,
      actieve: act,
      openAanvra: nOpen,
      verlopen60: typeof aggBescVerlooptBinnen60 === "function" ? aggBescVerlooptBinnen60() : 0,
    };
  }

  function perMaandStapels(items, months) {
    return months.map(function (ym) {
      var g = 0, b = 0, o = 0;
      for (var n = 0; n < items.length; n += 1) {
        var it = items[n];
        if (!it || it.gearchiveerd) continue;
        if ((it.betalingRefMaand || "") !== ym) continue;
        if (it.betalingsStatus === "betaald") g += n2(it.betaaldCumulatief);
        else if (n2(it.gedeclGemeenteInBehandeling) > 0) b += n2(it.gedeclGemeenteInBehandeling);
        else o += n2(it.teDeclarerenLM) + n2(it.nogNietGedeclareerd);
      }
      g = n2(g);
      b = n2(b);
      o = n2(o);
      return { ym: ym, betaald: g, inbeh: b, overig: o, tot: n2(g + b + o) };
    });
  }

  function perKeyCount(items, key) {
    var m = {};
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it || it.gearchiveerd) continue;
      var k = String(it[key] || "").trim() || "—";
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }

  function toSorted(m, max) {
    var a = Object.keys(m).map(function (k) { return { k: k, v: m[k] }; });
    a.sort(function (x, y) { return y.v - x.v; });
    return a.slice(0, max);
  }

  function renderKpis(agg) {
    var e = function (id, t) { var n = document.getElementById(id); if (n) n.textContent = t; };
    e("bd-v-ib", fmtEuro(agg.gedeclInBehand));
    e("bd-s-ib", agg.nGedeclInbehand + (agg.nGedeclInbehand === 1 ? " betaling" : " betalingen") + " te verwerken");
    e("bd-v-achter", fmtEuro(agg.achterstand));
    e("bd-v-tedecl", fmtEuro(agg.tedeclMaand));
    e("bd-v-betaald", fmtEuro(agg.betaald));
    e("bd-v-actief", String(agg.actieve));
    e("bd-v-60", String(agg.verlopen60));
    e("bd-v-open", String(agg.openAanvra));
  }

  function renderMonthly(stapels) {
    var wrap = document.getElementById("bd-monthly-stack");
    var ax = document.getElementById("bd-stack-labels");
    var yL = document.getElementById("bd-y-labels");
    if (!wrap || !ax) return;
    var maxT = 0;
    for (var i = 0; i < stapels.length; i += 1) {
      if (stapels[i].tot > maxT) maxT = stapels[i].tot;
    }
    if (maxT < 1) maxT = 1;
    var tick = [0, 0.25, 0.5, 0.75, 1].map(function (p) {
      return { pct: p, eur: maxT * p };
    });
    wrap.innerHTML = "";
    ax.innerHTML = "";
    if (yL) {
      yL.innerHTML = "";
      for (var t = tick.length - 1; t >= 0; t -= 1) {
        var s = document.createElement("div");
        s.className = "bd-y-tick";
        s.textContent = tick[t].eur >= 1000 ? (tick[t].eur / 1000).toFixed(0) + "k" : "€" + Math.round(tick[t].eur);
        yL.appendChild(s);
      }
    }
    for (var j = 0; j < stapels.length; j += 1) {
      var s0 = stapels[j];
      var hPct = s0.tot <= 0 ? 0 : 100;
      var col = document.createElement("div");
      col.className = "bd-stack-col";
      var bar = document.createElement("div");
      bar.className = "bd-stack-bar";
      if (s0.tot > 0) {
        if (s0.betaald > 0) {
          var d0 = document.createElement("div");
          d0.className = "bd-stack-seg bd-s--g";
          d0.style.flexGrow = String(s0.betaald);
          bar.appendChild(d0);
        }
        if (s0.inbeh > 0) {
          var d1 = document.createElement("div");
          d1.className = "bd-stack-seg bd-s--b";
          d1.style.flexGrow = String(s0.inbeh);
          bar.appendChild(d1);
        }
        if (s0.overig > 0) {
          var d2 = document.createElement("div");
          d2.className = "bd-stack-seg bd-s--o";
          d2.style.flexGrow = String(s0.overig);
          bar.appendChild(d2);
        }
      } else {
        var ph = document.createElement("div");
        ph.className = "bd-stack-seg bd-s--ph";
        ph.style.flexGrow = "1";
        ph.style.minHeight = "0";
        bar.appendChild(ph);
      }
      col.appendChild(bar);
      wrap.appendChild(col);
      var lb = document.createElement("span");
      lb.className = "bd-stack-lbl";
      lb.textContent = monthLabel(s0.ym);
      ax.appendChild(lb);
    }
  }

  function renderHbar(containerId, rows) {
    var c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = "";
    var max = 1;
    for (var r = 0; r < rows.length; r += 1) {
      if (rows[r].v > max) max = rows[r].v;
    }
    for (var i2 = 0; i2 < rows.length; i2 += 1) {
      var row = document.createElement("div");
      row.className = "bd-hrow";
      var l = document.createElement("div");
      l.className = "bd-hrow-l";
      l.textContent = rows[i2].k;
      row.appendChild(l);
      var t = document.createElement("div");
      t.className = "bd-hrow-track";
      var f = document.createElement("div");
      f.className = "bd-hrow-fill";
      f.style.width = (100 * rows[i2].v / max) + "%";
      t.appendChild(f);
      var v = document.createElement("div");
      v.className = "bd-hrow-n";
      v.textContent = String(rows[i2].v);
      row.appendChild(t);
      row.appendChild(v);
      c.appendChild(row);
    }
  }

  function alles() {
    var raw = getBeschikkingenItems() || [];
    var items = lijstActief(raw);
    var a = aggregate(items);
    renderKpis(a);
    var months = rollendeMaanden12();
    var stap = perMaandStapels(items, months);
    renderMonthly(stap);
    var zc = toSorted(perKeyCount(items, "zorgsoortLabel"), 8);
    var lc = toSorted(perKeyCount(items, "locatie"), 8);
    renderHbar("bd-zorg-bars", zc);
    renderHbar("bd-loc-bars", lc);
  }

  alles();
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") alles(); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) alles(); });
  window.addEventListener("focus", alles);
  document.addEventListener("beschikkingen:changed", alles);
  window.addEventListener("storage", function (e) {
    if (e.key === "beschikkingen:changedAt" || e.key === "beschikkingenItemsV2") alles();
  });
})();
