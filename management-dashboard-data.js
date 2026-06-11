/*
 * management-dashboard-data.js — data-laag voor het ETF Management Dashboard.
 *
 * Eén bron van waarheid: de read-only RPC `management_dashboard_v1(p_month)`,
 * server-side afgeschermd op rol Eigenaar/Directeur via can_view_management().
 * De RPC aggregeert alle domeinen (financiën, HR, planning, incidenten/klachten)
 * + de signaleringsstrip server-side, zodat web én mobiel exact dezelfde cijfers
 * tonen (één code-pad). Nieuwsberichten komen los via window.nieuwsDB.
 */
(function (global) {
  "use strict";

  var _data = null;
  var _bestuur = null;
  var _locaties = null;   // financien_locaties_dashboard-aggregaat (per-locatie sectie)
  var _open = null;       // planning_open_diensten_per_locatie-aggregaat
  var readyPromise = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[managementDashboardDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Management-dashboard — " + action, err);
  }

  async function ensureSupabase() {
    // Cold-load vangrail: wacht tot de sessie gerehydrateerd is (anders leest een
    // anonieme client door de RPC-gate 0 / een fout — les uit cold-load bugs).
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  /** Laad het dashboard-aggregaat. p_month = 'YYYY-MM' of null (=laatste maand met omzet). */
  async function load(month) {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase.rpc("management_dashboard_v1", { p_month: month || null });
      if (res.error) throw res.error;
      _data = res.data || null;
      // Bestuurs-KPI's (G50/G51/G54) los: can_view_management-gated RPC. Mag de
      // hoofd-render nooit breken — bij een fout blijft _bestuur gewoon null.
      try {
        var bk = await global.besaSupabase.rpc("hr_bestuur_kpis");
        if (!bk.error) _bestuur = (bk.data && bk.data[0]) || null;
      } catch (e) { /* bestuurs-KPI's optioneel */ }
      // Per-locatie financiën + open diensten (gegate Eigenaar/Directeur/Finance). Optioneel:
      // bij een fout/geen-toegang blijft de per-locatie sectie gewoon verborgen.
      try {
        var fl = await global.besaSupabase.rpc("financien_locaties_dashboard", { p_start: null, p_end: null });
        _locaties = (!fl.error && fl.data && !fl.data.unauthorized) ? fl.data : null;
      } catch (e) { /* per-locatie optioneel */ }
      try {
        var od = await global.besaSupabase.rpc("planning_open_diensten_per_locatie", { p_locatie: null, p_dagen: 7 });
        _open = (!od.error && od.data && !od.data.unauthorized) ? od.data : null;
      } catch (e) { /* open diensten optioneel */ }
      try {
        global.dispatchEvent(new CustomEvent("besa:management-dashboard-updated", { detail: { source: "load" } }));
      } catch (e) { /* */ }
    } catch (err) {
      reportSilent("laden", err);
    }
    return _data;
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = load(null);
    return readyPromise;
  }

  global.managementDashboardDB = {
    get ready() { return readyPromise || bootstrap(); },
    load: load,
    getData: function () { return _data; },
    getBestuurKpis: function () { return _bestuur; },
    getLocaties: function () { return _locaties; },
    getOpenDiensten: function () { return _open; },
    refresh: function () { return load(null); },
  };

  if (global.besaSupabase) bootstrap();
  else global.addEventListener("besa:supabase-ready", bootstrap, { once: true });
})(window);
