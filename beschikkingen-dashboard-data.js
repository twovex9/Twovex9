/*
 * beschikkingen-dashboard-data.js — LIVE data-laag voor het Beschikkingen-dashboard.
 *
 * Eén bron van waarheid: de read-only RPC's
 *   beschikkingen_dashboard_v2(p_start, p_end)  → alle KPI's + maand-reeks + lijsten
 *   beschikkingen_maand_detail(p_ym, p_kind)    → drill-down per maand
 *
 * Vervangt de oude BS2-momentopname-aggregatie (bs2DashboardDB) die jaartotalen
 * toonde en deels op de lege urendeclaraties-tabel rekende. De RPC berekent live
 * op facturen + beschikkingen + clienten (zie supabase/migrations/
 * beschikkingen_dashboard_v2_live.sql voor de definitie + koppelingen).
 */
(function (global) {
  "use strict";

  var _data = null;                 // laatst geladen RPC-resultaat
  var _period = { start: null, end: null };
  var readyPromise = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[besaDashboardDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Beschikkingen-dashboard — " + action, err);
  }

  async function ensureSupabase() {
    // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest
    // een anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  /** Laad het dashboard-aggregaat voor een periode (ISO YYYY-MM-DD of null = lopende maand). */
  async function load(startISO, endISO) {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase.rpc("beschikkingen_dashboard_v2", {
        p_start: startISO || null,
        p_end: endISO || null,
      });
      if (res.error) throw res.error;
      _data = res.data || null;
      _period = { start: startISO || null, end: endISO || null };
    } catch (err) {
      reportSilent("laden", err);
    }
    return _data;
  }

  /** Drill-down: welke cliënten/beschikkingen in maand `ym` voor `kind`
   *  ('to_declare' | 'pending' | 'paid'). */
  async function detail(ym, kind) {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase.rpc("beschikkingen_maand_detail", { p_ym: ym, p_kind: kind });
      if (res.error) throw res.error;
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      reportSilent("maanddetail", err);
      return [];
    }
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = load(null, null);
    return readyPromise;
  }

  global.besaDashboardDB = {
    get ready() { return readyPromise || bootstrap(); },
    load: load,
    detail: detail,
    getData: function () { return _data; },
    getPeriod: function () { return _period; },
    refresh: function () { return load(_period.start, _period.end); },
  };

  if (global.besaSupabase) bootstrap();
  else global.addEventListener("besa:supabase-ready", bootstrap, { once: true });
})(window);
