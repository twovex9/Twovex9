/* global window, document */
/**
 * mijn-beschikbaarheid-data.js — self-service schrijf/lees-laag voor de
 * INGELOGDE medewerker op de PC-site (pagina: mijn-beschikbaarheid).
 *
 * Eén canonieke tabel: public.medewerker_beschikbaarheid — exact dezelfde tabel
 * en hetzelfde gedrag als de Future Flow mobiele app. De medewerker schrijft
 * uitsluitend zijn EIGEN rijen (RLS: insert/update/delete waar user_id =
 * auth.uid()). Dit is bewust NIET de planner-RPC `beschikbaarheid_zet` — die is
 * server-side afgeschermd voor planners/HR. Self-service loopt dus, net als
 * mobiel, via een directe upsert op (user_id, datum).
 *
 * DIEHARD: alle schrijfacties zijn gericht op precies één eigen rij
 * (.eq user_id + datum). Geen bulk-overschrijving, geen full-cache-push.
 */
(function (global) {
  "use strict";
  if (!global.ffSupabase) return;
  var supa = global.ffSupabase;
  var TABLE = "medewerker_beschikbaarheid";
  var EVENT_NAME = "ff:mijn-beschikbaarheid-updated";

  var _map = {};               // datum(yyyy-mm-dd) → { status, begin, eind }
  var _range = { van: null, tot: null };

  function reportSilent(action, err) {
    console.error("[mijnBeschikbaarheidDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Mijn beschikbaarheid — " + action, err);
  }
  function emit() {
    try { window.dispatchEvent(new Event(EVENT_NAME)); } catch (e) { /* ok */ }
  }
  function hhmm(t) {
    if (!t) return null;
    var m = String(t).match(/^(\d{2}):(\d{2})/);
    return m ? (m[1] + ":" + m[2]) : null;
  }

  /** Eigen beschikbaarheid in [vanISO, totISO] (inclusief) → map per datum. */
  async function fetchMaand(userId, vanISO, totISO) {
    if (!userId) { _map = {}; emit(); return _map; }
    try { if (global.ffSupabaseReady) await global.ffSupabaseReady; } catch (e) { /* doorgaan */ }
    try {
      var r = await supa
        .from(TABLE)
        .select("datum, status, begin_tijd, eind_tijd")
        .eq("user_id", userId)
        .gte("datum", vanISO)
        .lte("datum", totISO);
      if (r.error) throw r.error;
      var map = {};
      (r.data || []).forEach(function (row) {
        map[row.datum] = { status: row.status, begin: hhmm(row.begin_tijd), eind: hhmm(row.eind_tijd) };
      });
      _map = map;
      _range = { van: vanISO, tot: totISO };
      emit();
      return _map;
    } catch (err) {
      reportSilent("laden", err);
      return _map;
    }
  }

  function getMapSync() { return _map; }
  function getDagSync(datum) { return _map[datum] || null; }

  /**
   * Zet/overschrijf één eigen dag (upsert op user_id + datum). Tijden gelden
   * alleen bij "beschikbaar"; bij "niet_beschikbaar" worden ze leeggemaakt.
   */
  async function zet(userId, medewerkerId, datum, status, begin, eind) {
    if (!userId) throw new Error("Niet ingelogd.");
    if (!datum || !status) throw new Error("Datum en status zijn verplicht.");
    if (status !== "beschikbaar" && status !== "niet_beschikbaar") throw new Error("Ongeldige status.");
    var isBesch = status === "beschikbaar";
    var payload = {
      user_id: userId,
      medewerker_id: medewerkerId || null,
      datum: datum,
      status: status,
      begin_tijd: isBesch ? (begin || null) : null,
      eind_tijd: isBesch ? (eind || null) : null,
      laatst_gewijzigd: new Date().toISOString(),
    };
    var r = await supa.from(TABLE).upsert(payload, { onConflict: "user_id,datum" });
    if (r.error) throw r.error;
    _map[datum] = { status: status, begin: isBesch ? (begin || null) : null, eind: isBesch ? (eind || null) : null };
    emit();
    return true;
  }

  /** Maak één eigen dag leeg ("niet ingevuld") — verwijdert exact die ene rij. */
  async function wis(userId, datum) {
    if (!userId || !datum) throw new Error("Niet ingelogd of geen datum.");
    var r = await supa.from(TABLE).delete().eq("user_id", userId).eq("datum", datum);
    if (r.error) throw r.error;
    delete _map[datum];
    emit();
    return true;
  }

  global.mijnBeschikbaarheidDB = {
    fetchMaand: fetchMaand,
    getMapSync: getMapSync,
    getDagSync: getDagSync,
    zet: zet,
    wis: wis,
  };
})(window);
