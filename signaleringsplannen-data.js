/* global window */
/**
 * signaleringsplannen-data.js — data-laag voor signaleringsplannen
 * (Cliëntmodule 2.0 fase 3, spec §10).
 *
 * Dunne laag bovenop tabel `signaleringsplannen` (SELECT via REST; RLS =
 * zorg-toegang tot de cliënt, schrijven = beoordelaars) en de SECURITY
 * DEFINER-RPC `signaleringsplan_activeer` (concept → actief; eerdere actieve
 * plannen worden vervangen).
 *
 * Public API (window.signaleringsplannenDB):
 *   - fetchVoorClient(clientId) → Promise<rows[]> (actief bovenaan)
 *   - opslaan(rec) → Promise<row> (insert zonder id, anders update)
 *   - activeer(id) → Promise (throw bij fout)
 *   - archive(id) / restore(id)
 * Events: `besa:signaleringsplannen-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var TABLE = "signaleringsplannen";

  function reportSilent(action, err) {
    if (global.console) console.error("[signaleringsplannenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Signaleringsplannen — " + action, err);
  }

  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:signaleringsplannen-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function currentUser() {
    try {
      var s = await global.besaSupabase.auth.getSession();
      return (s && s.data && s.data.session && s.data.session.user) || null;
    } catch (e) { return null; }
  }

  function currentNaam() {
    var p = global.profilesDB && typeof global.profilesDB.getCurrentSync === "function"
      ? global.profilesDB.getCurrentSync() : null;
    if (!p) return null;
    var n = ((p.voornaam || "") + " " + (p.achternaam || "")).trim();
    return n || p.email || null;
  }

  async function fetchVoorClient(clientId) {
    try {
      if (!clientId) return [];
      await ensureSupabase();
      var r = await global.besaSupabase
        .from(TABLE)
        .select("*")
        .eq("client_id", clientId)
        .order("aanmaakdatum", { ascending: false });
      if (r.error) throw r.error;
      var rows = Array.isArray(r.data) ? r.data : [];
      var rang = { actief: 0, concept: 1, vervangen: 2 };
      rows.sort(function (a, b) {
        var ra = rang[a.status] != null ? rang[a.status] : 9;
        var rb = rang[b.status] != null ? rang[b.status] : 9;
        if (ra !== rb) return ra - rb;
        return String(b.aanmaakdatum || "") < String(a.aanmaakdatum || "") ? -1 : 1;
      });
      return rows;
    } catch (err) {
      reportSilent("laden", err);
      return [];
    }
  }

  // Insert/update — géén catch: page-script toont showError bij falen.
  async function opslaan(rec) {
    await ensureSupabase();
    var safe = rec || {};
    var payload = {
      triggers: safe.triggers ? String(safe.triggers) : null,
      spanningssignalen: safe.spanningssignalen ? String(safe.spanningssignalen) : null,
      escalatiefases: Array.isArray(safe.escalatiefases) ? safe.escalatiefases : [],
      interventies: safe.interventies ? String(safe.interventies) : null,
      veiligheidsafspraken: safe.veiligheidsafspraken ? String(safe.veiligheidsafspraken) : null,
    };
    var res;
    if (safe.id) {
      res = await global.besaSupabase.from(TABLE).update(payload).eq("id", safe.id).select().single();
    } else {
      payload.client_id = String(safe.clientId || "");
      if (!payload.client_id) throw new Error("clientId verplicht");
      var user = await currentUser();
      payload.created_by = user ? user.id : null;
      payload.created_by_naam = currentNaam();
      res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    }
    if (res.error) throw res.error;
    dispatchUpdated("opslaan");
    return res.data;
  }

  async function activeer(id) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("signaleringsplan_activeer", { p_id: id });
    if (r.error) throw r.error;
    dispatchUpdated("activeer");
    return r.data;
  }

  async function setArchived(id, archived) {
    await ensureSupabase();
    var r = await global.besaSupabase.from(TABLE).update({ archived: !!archived }).eq("id", id).select().single();
    if (r.error) throw r.error;
    dispatchUpdated(archived ? "archive" : "restore");
    return r.data;
  }

  global.signaleringsplannenDB = {
    fetchVoorClient: fetchVoorClient,
    opslaan: opslaan,
    activeer: activeer,
    archive: function (id) { return setArchived(id, true); },
    restore: function (id) { return setArchived(id, false); },
  };
})(typeof window !== "undefined" ? window : this);
