/*
 * financien-locaties-data.js — data-laag voor Financiën › Locaties.
 *
 * Eén bron van waarheid: de read-only RPC's (server-side afgeschermd op rol
 * Eigenaar/Directeur via can_view_financien(); zie supabase-migratie
 * financien_locaties_dashboard):
 *   financien_locaties_dashboard(p_start, p_end)            → totalen + per locatie + maandreeks
 *   financien_locatie_maand_detail(p_location, p_start, p_end) → ZZP'ers + cliënten per locatie
 *
 * Kosten  = ingehuurde ZZP-diensten uit de planning (netto-uren × uurtarief).
 * Opbrengst = beschikkingen-omzet (betaald + gedeclareerd-open + nog-te-declareren),
 *             identiek aan het beschikkingen-dashboard, gekoppeld via beschikking.locatie.
 */
(function (global) {
  "use strict";

  var _data = null;                       // laatst geladen dashboard-aggregaat
  var _period = { start: null, end: null };
  var readyPromise = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[financienLocatiesDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Financiën-locaties — " + action, err);
  }

  async function ensureSupabase() {
    // Cold-load vangrail: wacht tot de sessie gerehydrateerd is (anders leest een
    // anonieme client door RLS/gate 0 rijen — les uit eerdere cold-load bugs).
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  /** Laad het dashboard-aggregaat voor een periode (ISO YYYY-MM-DD of null = default-maand). */
  async function load(startISO, endISO) {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase.rpc("financien_locaties_dashboard", {
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

  /** Drill-down voor één locatie over de geselecteerde periode. */
  async function detail(location, startISO, endISO) {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase.rpc("financien_locatie_maand_detail", {
        p_location: location,
        p_start: startISO || null,
        p_end: endISO || null,
      });
      if (res.error) throw res.error;
      return res.data || null;
    } catch (err) {
      reportSilent("locatiedetail", err);
      return null;
    }
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = load(null, null);
    return readyPromise;
  }

  global.financienLocatiesDB = {
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
