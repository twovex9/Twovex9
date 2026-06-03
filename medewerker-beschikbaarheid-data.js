/* global window, document */
/**
 * medewerker-beschikbaarheid-data.js — read-laag voor public.medewerker_beschikbaarheid.
 *
 * Bron van waarheid: Supabase tabel public.medewerker_beschikbaarheid. Deze wordt
 * gevuld door de Future Flow mobiele app: medewerkers (m.n. ZZP'ers) geven per dag
 * "beschikbaar" / "niet_beschikbaar" door. Eén rij per (user_id, datum).
 *
 * Deze laag is READ-ONLY voor de PC-site. Het beschikbaarheid-overzicht leest hier
 * alleen uit; schrijven gebeurt uitsluitend door de medewerker zelf via de mobiele app
 * (RLS staat INSERT/UPDATE/DELETE alleen toe op eigen rijen). De SELECT-policy is
 * verruimd zodat kantoor/planners alle rijen kunnen inzien (frontend-gate regelt wie
 * de pagina mag openen).
 *
 * DATA-SLIM: opgehaalde rijen blijven in-memory (_mem), niet in localStorage —
 * over een lange periode kan dit veel rijen worden.
 */
(function (global) {
  "use strict";
  if (!global.besaSupabase) return;
  var supa = global.besaSupabase;
  var TABLE = "medewerker_beschikbaarheid";
  var EVENT_NAME = "besa:beschikbaarheid-updated";

  var _mem = [];                       // laatst opgehaalde rijen
  var _range = { van: null, tot: null };

  function reportSilent(action, err) {
    console.error("[beschikbaarheidDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Beschikbaarheid — " + action, err);
  }

  function emit() {
    try { window.dispatchEvent(new Event(EVENT_NAME)); } catch (e) { /* ok */ }
  }

  /**
   * Haal alle ingevulde beschikbaarheid op in [vanISO, totISO] (yyyy-mm-dd, inclusief).
   * Gepagineerd zodat ook >1000 rijen volledig binnenkomen.
   */
  async function fetchRange(vanISO, totISO) {
    // Cold-load vangrail: wacht tot de Supabase-client echt klaar is, anders
    // levert een anonieme/te-vroege query 0 rijen op (zie data-laag-lessen).
    try { if (global.besaSupabaseReady) await global.besaSupabaseReady; } catch (e) { /* doorgaan */ }
    try {
      var all = [];
      var from = 0;
      var PAGE = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        var r = await supa
          .from(TABLE)
          .select("user_id, medewerker_id, datum, status, begin_tijd, eind_tijd, laatst_gewijzigd")
          .gte("datum", vanISO)
          .lte("datum", totISO)
          .order("datum", { ascending: true })
          .range(from, from + PAGE - 1);
        if (r.error) throw r.error;
        var batch = r.data || [];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
      _mem = all;
      _range = { van: vanISO, tot: totISO };
      emit();
      return _mem;
    } catch (err) {
      reportSilent("fetchRange", err);
      return _mem;
    }
  }

  function getRowsSync() { return _mem.slice(); }
  function getRangeSync() { return { van: _range.van, tot: _range.tot }; }

  /**
   * Office-invoer: planner/HR zet (namens een medewerker) de beschikbaarheid voor
   * één dag, optioneel met begin/eind-tijd. Loopt via de SECURITY DEFINER RPC
   * beschikbaarheid_zet (zelfde tabel als de mobiele ZZP-invoer = één code-pad).
   */
  async function zet(medewerkerId, datum, status, begin, eind) {
    if (!medewerkerId || !datum || !status) throw new Error("medewerker, datum en status zijn verplicht");
    var r = await supa.rpc("beschikbaarheid_zet", {
      p_medewerker_id: medewerkerId,
      p_datum: datum,
      p_status: status,
      p_begin: begin || null,
      p_eind: eind || null,
    });
    if (r.error) throw r.error;
    if (_range.van && _range.tot) await fetchRange(_range.van, _range.tot); // ververs het overzicht
    return r.data;
  }

  global.beschikbaarheidDB = {
    fetchRange: fetchRange,
    getRowsSync: getRowsSync,
    getRangeSync: getRangeSync,
    zet: zet,
  };
})(window);
