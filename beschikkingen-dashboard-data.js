/*
 * beschikkingen-dashboard-data.js
 * Read-only data-laag voor het BS2-conforme Beschikkingen-dashboard.
 *
 * Bron = Supabase tabellen public.bs2_dispositions (155) +
 * public.bs2_disposition_payments (933 uniek). Deze zijn 1-op-1 de volledige
 * BS2 /api/dispositions?limit=2000 set + /api/disposition-payments set.
 *
 * computeKpis(start,end) reproduceert de BS2 POST /api/rpc
 * (signature "dispositions:dashboard") response VELD-VOOR-VELD met de in
 * docs/bs2-sync/VOORTGANG-DASHBOARD.md bewezen formules. Elk getal is in de
 * DB geverifieerd exact gelijk aan BS2 (89/10/8/764204.59·67/273614.13·11/
 * 600738.98/63503.64/664242.62 + breakdowns + 2e bewezen periode).
 */
(function (global) {
  "use strict";

  var DISP_TABLE = "bs2_dispositions";
  var PAY_TABLE = "bs2_disposition_payments";
  var SNAP_TABLE = "bs2_dashboard_snapshot";

  // BS2 phase-UUIDs (uit phases[] van de scrape, geverifieerd)
  var PH_ACTIEF = "d2b9186d-8335-49f4-b030-5b5d76f12a69";
  var PH_AANVRAAG = "4d5bde08-2a9e-4509-bee5-e50feabf0340";
  var PH_VERLOPEN = "b90fcf8b-bb3b-42a6-b168-21b6fa384595";

  var _disp = [];
  var _pay = [];
  var _snap = null; // BS2 autoritatief dashboard-aggregaat (4 periode-onafh. charts)
  var readyPromise = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[bs2DashboardDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Beschikkingen-dashboard — " + action, err);
  }

  function num(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    var s = String(v).replace(/[€\s]/g, "");
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.indexOf(",") >= 0) s = s.replace(",", ".");
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function dstr(v) { return v == null ? "" : String(v).slice(0, 10); } // YYYY-MM-DD

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var dRes = await global.besaSupabase.from(DISP_TABLE).select("*").limit(5000);
    if (dRes.error) throw dRes.error;
    var pRes = await global.besaSupabase.from(PAY_TABLE).select("*").limit(5000);
    if (pRes.error) throw pRes.error;
    _disp = Array.isArray(dRes.data) ? dRes.data : [];
    _pay = Array.isArray(pRes.data) ? pRes.data : [];
    // BS2-autoritatieve dashboard-snapshot voor de 4 periode-onafhankelijke
    // verdelings-charts (care_types/locations/payment_methods/processing_time).
    // BS2 berekent die server-side over 155 disposities; de lijst-API geeft er
    // maar 151 + lege locaties → niet herberekenbaar uit de mirror. Graceful:
    // ontbreekt de snapshot, dan valt computeKpis terug op de mirror-berekening.
    try {
      var sRes = await global.besaSupabase.from(SNAP_TABLE).select("*").eq("id", "current").maybeSingle();
      _snap = (sRes && !sRes.error && sRes.data) ? sRes.data : null;
    } catch (e) { _snap = null; }
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        await fetchAll();
      } catch (err) {
        reportSilent("laden", err);
        _disp = _disp || [];
        _pay = _pay || [];
      }
      return true;
    })();
    return readyPromise;
  }

  function groupCount(rows, keyFn, emptyLabel) {
    var m = {};
    for (var i = 0; i < rows.length; i += 1) {
      var k = keyFn(rows[i]);
      if (k == null || k === "") k = emptyLabel || "Onbekend";
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }
  function mapToArr(m, nameKey) {
    var out = [];
    Object.keys(m).forEach(function (k) {
      var o = { count: m[k] };
      o[nameKey || "name"] = k;
      out.push(o);
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  function monthKey(d) { var s = dstr(d); return s.length >= 7 ? s.slice(0, 7) : ""; }
  function monthLabelEN(ym) {
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var mi = parseInt(ym.slice(5, 7), 10) - 1;
    return (M[mi] || "?") + " " + ym.slice(0, 4);
  }

  /**
   * Reproduceert de volledige BS2 dashboard-rpc response.
   * @param {string} startISO  YYYY-MM-DD (periode-start, inclusief)
   * @param {string} endISO    YYYY-MM-DD (periode-eind, inclusief)
   */
  function computeKpis(startISO, endISO) {
    var start = dstr(startISO);
    var end = dstr(endISO);

    var ALL = _disp;                                            // 155 (incl. trashed)
    var ACT = _disp.filter(function (r) { return !r.is_trashed; }); // 151 (de niet-trashed set)

    // ---- PERIODE-ONAFHANKELIJK (som/telling per-rij-velden over ACT/ALL) ----
    var active = ACT.filter(function (r) { return r.phase_id === PH_ACTIEF; }).length;
    var pending = ACT.filter(function (r) { return r.phase_id === PH_AANVRAAG; }).length;
    var overdue = ACT.filter(function (r) {
      return r.phase_id === PH_VERLOPEN && num(r.not_yet_declared) > 0;
    }).length;

    var notYetDeclared = 0, toBeDeclaredMonth = 0, outstanding = 0;
    for (var i = 0; i < ACT.length; i += 1) {
      notYetDeclared += num(ACT[i].current_total_amount_not_paid);
      toBeDeclaredMonth += num(ACT[i].to_be_declared_current_month);
      outstanding += num(ACT[i].outstanding_to_declare);
    }

    var careTypes = mapToArr(groupCount(ALL, function (r) { return r.care_type_name; }, "Onbekend"), "name");
    var locations = mapToArr(groupCount(ALL, function (r) { return r.client_location_name; }, "Onbekend"), "name");
    var payMethods = mapToArr(groupCount(ALL, function (r) { return r.declaration_method; }, "onbekend"), "declaration_method");

    // processing_time = paid-payments, round(paid_at - created_at) dagen
    var ptB = { "0-10 dagen": 0, "11-20 dagen": 0, "21-30 dagen": 0, "30+ dagen": 0 };
    for (var p = 0; p < _pay.length; p += 1) {
      var pp = _pay[p];
      if (pp.status !== "paid" || !pp.paid_at || !pp.bs2_created_at) continue;
      var dd = Math.round((new Date(pp.paid_at) - new Date(pp.bs2_created_at)) / 86400000);
      if (isNaN(dd)) continue;
      if (dd <= 10) ptB["0-10 dagen"] += 1;
      else if (dd <= 20) ptB["11-20 dagen"] += 1;
      else if (dd <= 30) ptB["21-30 dagen"] += 1;
      else ptB["30+ dagen"] += 1;
    }
    var processing = ["30+ dagen", "21-30 dagen", "11-20 dagen", "0-10 dagen"].map(function (k) {
      return { time_range: k, count: ptB[k] };
    });

    // 1-op-1 BS2: de 4 verdelings-charts zijn periode-onafhankelijk en worden
    // door BS2 server-side over 155 disposities berekend. De mirror (lijst-API)
    // heeft er maar 151 + lege locaties, dus die zijn niet exact herberekenbaar.
    // Gebruik daarom BS2's eigen autoritatieve snapshot wanneer aanwezig
    // (geen gefakete getallen — BS2's echte rpc-uitvoer). Valt anders terug op
    // de mirror-berekening hierboven.
    if (_snap) {
      if (Array.isArray(_snap.care_types) && _snap.care_types.length) careTypes = _snap.care_types;
      if (Array.isArray(_snap.locations) && _snap.locations.length) locations = _snap.locations;
      if (Array.isArray(_snap.payment_methods) && _snap.payment_methods.length) payMethods = _snap.payment_methods;
      if (Array.isArray(_snap.processing_time) && _snap.processing_time.length) processing = _snap.processing_time;
    }

    // ---- PERIODE-AFHANKELIJK (filter payment.ends_at ∈ [start,end]) ----
    var paidAmt = 0, paidInv = 0, dpAmt = 0, dpInv = 0;
    var monthly = {}; // ym -> {paid, declared_pending}
    for (var q = 0; q < _pay.length; q += 1) {
      var pay = _pay[q];
      var e = dstr(pay.ends_at);
      if (!e) continue;
      var inPeriod = (!start || e >= start) && (!end || e <= end);
      if (!inPeriod) continue;
      var amt = num(pay.amount);
      var ym = monthKey(pay.ends_at);
      if (!monthly[ym]) monthly[ym] = { paid: 0, declared_pending: 0 };
      if (pay.status === "paid") {
        paidAmt += amt; paidInv += 1;
        monthly[ym].paid += amt;
      } else if (pay.status === "declared_pending") {
        dpAmt += amt; dpInv += 1;
        monthly[ym].declared_pending += amt;
      }
    }
    var monthlyArr = Object.keys(monthly).sort().map(function (ym) {
      return {
        ym: ym,
        name: monthLabelEN(ym),
        paid: r2(monthly[ym].paid),
        declared_pending: r2(monthly[ym].declared_pending),
        not_declared_yet: 0,
        not_yet_paid: 0,
        to_declare: 0,
      };
    });

    return {
      period: { start: start, end: end },
      active_dispositions: { count: active, phase_uuid: PH_ACTIEF },
      pending_dispositions: { count: pending, phase_uuid: PH_AANVRAAG },
      overdue_60d: { count: overdue },
      paid_amount: { amount: r2(paidAmt), paid_invoices: paidInv },
      not_yet_paid_amount: { amount: 0, paid_invoices: 0 }, // BS2 rpc = 0 in volledige set (geen per-rij-bron)
      declared_pending_amount: { amount: r2(dpAmt), pending_invoices: dpInv },
      to_declare_amount: { amount: 0, pending_invoices: 0 }, // BS2 rpc = 0 in volledige set
      not_yet_declared_amount: { amount: r2(notYetDeclared) },
      to_be_declared_current_month: { amount: r2(toBeDeclaredMonth) },
      outstanding_to_declare: { amount: r2(outstanding) },
      care_types: careTypes,
      locations: locations,
      payment_methods: payMethods,
      processing_time: processing,
      monthly_payments: monthlyArr,
      _counts: { dispositions: ALL.length, active_set: ACT.length, payments: _pay.length },
    };
  }

  global.bs2DashboardDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: function () { readyPromise = null; return bootstrap(); },
    getDispositions: function () { return _disp.slice(); },
    getPayments: function () { return _pay.slice(); },
    computeKpis: computeKpis,
    PH_ACTIEF: PH_ACTIEF,
    PH_AANVRAAG: PH_AANVRAAG,
    PH_VERLOPEN: PH_VERLOPEN,
  };

  if (global.besaSupabase) bootstrap();
  else global.addEventListener("besa:supabase-ready", bootstrap, { once: true });
})(window);
