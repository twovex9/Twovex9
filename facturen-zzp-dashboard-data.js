/*
 * facturen-zzp-dashboard-data.js — LIVE data-laag voor het ZZP-maandoverzicht
 * op de pagina "Facturen te beoordelen".
 *
 * Eén bron van waarheid: de read-only RPC's
 *   facturen_zzp_dashboard(p_start, p_end)  → per maand: planning-verwacht +
 *                                             te-beoordelen/goedgekeurd/
 *                                             binnengekomen/nog-te-verwachten +
 *                                             maandreeks + window
 *   facturen_zzp_maand_detail(p_ym)         → drill-down per ZZP'er
 *                                             (verwacht vs gefactureerd)
 *
 * "Verwacht" = wat we o.b.v. de planning aan ZZP'ers moeten betalen
 * (netto-uren × persoonlijk uurtarief). Zie supabase/migrations/
 * facturen_zzp_dashboard_live.sql voor de definitie + koppelingen.
 *
 * Read-only: deze laag muteert NOOIT data (geen DELETE/UPDATE/INSERT).
 */
(function (global) {
  "use strict";

  var _data = null;                 // laatst geladen RPC-resultaat
  var _period = { start: null, end: null };
  var readyPromise = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[facturenZzpDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Facturen ZZP-overzicht — " + action, err);
  }

  async function ensureSupabase() {
    // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest
    // een anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
    if (global.ffSupabaseReady) { try { await global.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
  }

  /** Laad het ZZP-maandaggregaat voor een periode (ISO YYYY-MM-DD of null = laatste factuurmaand). */
  async function load(startISO, endISO) {
    try {
      await ensureSupabase();
      var res = await global.ffSupabase.rpc("facturen_zzp_dashboard", {
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

  /** Drill-down: per ZZP'er in maand `ym` (YYYY-MM) verwacht vs gefactureerd. */
  async function detail(ym) {
    try {
      await ensureSupabase();
      var res = await global.ffSupabase.rpc("facturen_zzp_maand_detail", { p_ym: ym });
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

  global.facturenZzpDB = {
    get ready() { return readyPromise || bootstrap(); },
    load: load,
    detail: detail,
    getData: function () { return _data; },
    getPeriod: function () { return _period; },
    refresh: function () { return load(_period.start, _period.end); },
  };

  if (global.ffSupabase) bootstrap();
  else global.addEventListener("ff:supabase-ready", bootstrap, { once: true });
})(window);
