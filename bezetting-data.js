/* global window */
/**
 * bezetting-data.js — data-laag voor Bezetting & kamerbeheer.
 *
 * Eén bron van waarheid: de SECURITY DEFINER-RPC's (server-side rol-gegate):
 *   bezetting_overzicht()                              → totalen + per locatie + per kamer + toewijsbare cliënten + locaties
 *   bezetting_kamer_upsert(...)                        → kamer toevoegen/bewerken
 *   bezetting_kamers_bulk(...)                         → meerdere kamers ineens
 *   bezetting_kamer_archiveren(id) / _herstellen(id)   → archiveren/herstellen
 *   bezetting_zet_status(kamer, status, notitie)       → housekeeping/facilitair-status
 *   bezetting_wijs_toe(kamer, client, datum, notitie)  → cliënt koppelen/verplaatsen
 *   bezetting_ontkoppel(client)                        → cliënt van kamer ontkoppelen
 *
 * Bezetting (vol/deels/vrij) wordt server-side afgeleid uit actieve toewijzingen;
 * schoonmaak_status is een handmatige operationele vlag. Real-time multi-user via
 * realtime-sync.js op de tabellen kamers + kamer_toewijzingen.
 */
(function (global) {
  "use strict";

  var _data = null;
  var readyPromise = null;
  var _subscribed = false;

  function reportSilent(action, err) {
    if (global.console) console.error("[bezettingDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Bezetting — " + action, err);
  }

  async function ensureSupabase() {
    // Cold-load vangrail: wacht tot de sessie gerehydrateerd is (anders leest een
    // anonieme client door RLS/gate 0 rijen).
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatch(reason) {
    try { global.dispatchEvent(new CustomEvent("besa:bezetting-updated", { detail: { reason: reason } })); }
    catch (e) { /* */ }
  }

  /** Het hele bezettingsoverzicht in één RPC-call laden. */
  async function load() {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase.rpc("bezetting_overzicht", {});
      if (res.error) throw res.error;
      _data = res.data || null;
    } catch (err) {
      reportSilent("laden", err);
    }
    dispatch("load");
    return _data;
  }

  /** Gearchiveerde kamers (alleen voor de Kamerbeheer-weergave). */
  async function listArchived() {
    try {
      await ensureSupabase();
      var res = await global.besaSupabase
        .from("kamers")
        .select("id, locatie_naam, nummer, verdieping, capaciteit, schoonmaak_status, notitie, volgorde")
        .eq("archived", true)
        .order("locatie_naam", { ascending: true })
        .order("volgorde", { ascending: true });
      if (res.error) throw res.error;
      return res.data || [];
    } catch (err) {
      reportSilent("gearchiveerde kamers", err);
      return [];
    }
  }

  // ── Mutatie-helper: roept een RPC aan en gooit een nette fout bij unauthorized/ok=false ──
  async function callRpc(name, args) {
    await ensureSupabase();
    var res = await global.besaSupabase.rpc(name, args || {});
    if (res.error) throw res.error;
    var d = res.data;
    if (d && d.unauthorized) throw new Error("Je hebt geen rechten voor deze actie.");
    if (d && d.ok === false) throw new Error(d.error || "Actie mislukt.");
    return d;
  }

  async function kamerUpsert(p) {
    var d = await callRpc("bezetting_kamer_upsert", {
      p_id: p.id || null,
      p_locatie: p.locatie,
      p_nummer: p.nummer,
      p_verdieping: p.verdieping || null,
      p_capaciteit: (p.capaciteit == null || p.capaciteit === "") ? 1 : Math.round(Number(p.capaciteit)),
      p_volgorde: (p.volgorde == null || p.volgorde === "") ? 0 : Math.round(Number(p.volgorde)),
      p_notitie: p.notitie || null,
    });
    await load();
    return d;
  }

  async function kamersBulk(p) {
    var d = await callRpc("bezetting_kamers_bulk", {
      p_locatie: p.locatie,
      p_aantal: Math.round(Number(p.aantal)),
      p_start: (p.start == null || p.start === "") ? 1 : Math.round(Number(p.start)),
      p_prefix: (p.prefix == null) ? "Kamer " : p.prefix,
      p_capaciteit: (p.capaciteit == null || p.capaciteit === "") ? 1 : Math.round(Number(p.capaciteit)),
    });
    await load();
    return d;
  }

  async function kamerArchiveren(id) { var d = await callRpc("bezetting_kamer_archiveren", { p_id: id }); await load(); return d; }
  async function kamerHerstellen(id) { var d = await callRpc("bezetting_kamer_herstellen", { p_id: id }); await load(); return d; }

  async function zetStatus(kamerId, status, notitie) {
    var d = await callRpc("bezetting_zet_status", { p_kamer_id: kamerId, p_status: status, p_notitie: notitie || null });
    await load();
    return d;
  }

  async function wijsToe(kamerId, clientId, ingangsdatum, notitie) {
    var d = await callRpc("bezetting_wijs_toe", {
      p_kamer_id: kamerId, p_client_id: clientId,
      p_ingangsdatum: ingangsdatum || null, p_notitie: notitie || null,
    });
    await load();
    return d;
  }

  async function ontkoppel(clientId) {
    var d = await callRpc("bezetting_ontkoppel", { p_client_id: clientId });
    await load();
    return d;
  }

  function subscribeRealtime() {
    if (_subscribed || !global.besaRealtime || !global.besaRealtime.subscribe) return;
    _subscribed = true;
    try {
      global.besaRealtime.subscribe("kamers", function () { load(); });
      global.besaRealtime.subscribe("kamer_toewijzingen", function () { load(); });
    } catch (e) { reportSilent("realtime", e); }
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      await load();
      subscribeRealtime();
      return _data;
    })();
    return readyPromise;
  }

  global.bezettingDB = {
    get ready() { return readyPromise || bootstrap(); },
    load: load,
    refresh: load,
    getData: function () { return _data; },
    listArchived: listArchived,
    kamerUpsert: kamerUpsert,
    kamersBulk: kamersBulk,
    kamerArchiveren: kamerArchiveren,
    kamerHerstellen: kamerHerstellen,
    zetStatus: zetStatus,
    wijsToe: wijsToe,
    ontkoppel: ontkoppel,
    subscribeRealtime: subscribeRealtime,
  };

  if (global.besaSupabase) bootstrap();
  else global.addEventListener("besa:supabase-ready", bootstrap, { once: true });
})(window);
