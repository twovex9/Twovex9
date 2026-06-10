/* global window */
/**
 * zorgplannen-data.js — data-laag voor zorgplannen (Cliëntmodule 2.0 fase 3, spec §9).
 *
 * Dunne laag bovenop tabel `zorgplannen` (SELECT via REST; RLS = zorg-toegang
 * tot de cliënt, schrijven = beoordelaars) en de SECURITY DEFINER-RPC's voor de
 * workflow concept → gw_akkoord → ter_ondertekening → actief → geevalueerd /
 * vervangen: `zorgplan_gw_akkoord`, `zorgplan_ter_ondertekening`,
 * `zorgplan_activeer`, `zorgplan_evalueer` (gooien exception zonder rechten).
 *
 * Public API (window.zorgplannenDB):
 *   - fetchVoorClient(clientId) → Promise<rows[]> (nieuwste eerst, actief bovenaan)
 *   - opslaan(rec) → Promise<row> (insert zonder id, anders update; alleen concept bewerken)
 *   - gwAkkoord(id) / terOndertekening(id, ondType, ondNaam) / activeer(id) / evalueer(id, verslag)
 *   - archive(id) / restore(id)
 * Events: `besa:zorgplannen-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var TABLE = "zorgplannen";

  function reportSilent(action, err) {
    if (global.console) console.error("[zorgplannenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Zorgplannen — " + action, err);
  }

  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:zorgplannen-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
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
      // Actief plan bovenaan, daarna lopende workflow, daarna historie.
      var rang = { actief: 0, ter_ondertekening: 1, gw_akkoord: 2, concept: 3, geevalueerd: 4, vervangen: 5 };
      rows.sort(function (a, b) {
        var ra = rang[a.status] != null ? rang[a.status] : 9;
        var rb = rang[b.status] != null ? rang[b.status] : 9;
        if (ra !== rb) return ra - rb;
        return String(b.aanmaakdatum || "") < String(a.aanmaakdatum || "") ? -1 : 1;
      });
      // Open ondertekening-verzoeken erbij (token voor de deel-link in de UI).
      try {
        var ro = await global.besaSupabase
          .from("client_ondertekeningen")
          .select("id, token, status, zorgplan_id, storage_path_pdf")
          .eq("client_id", clientId)
          .not("zorgplan_id", "is", null);
        if (!ro.error && Array.isArray(ro.data)) {
          var perPlan = {};
          ro.data.forEach(function (o) {
            if (!o || !o.zorgplan_id) return;
            // Open verzoek wint; anders de nieuwste ondertekende als referentie.
            if (!perPlan[o.zorgplan_id] || o.status === "open") perPlan[o.zorgplan_id] = o;
          });
          rows.forEach(function (p) { p.__ondertekening = perPlan[p.id] || null; });
        }
      } catch (e) { /* deel-link is nice-to-have */ }
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
      titel: String(safe.titel || "Zorgplan").trim() || "Zorgplan",
      hulpvraag: safe.hulpvraag ? String(safe.hulpvraag) : null,
      doelen: Array.isArray(safe.doelen) ? safe.doelen : [],
      acties: safe.acties ? String(safe.acties) : null,
      risicoanalyse: safe.risicoanalyse ? String(safe.risicoanalyse) : null,
      signalering: safe.signalering ? String(safe.signalering) : null,
      evaluatiemoment: safe.evaluatiemoment || null,
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

  async function rpc(fn, args, source) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc(fn, args);
    if (r.error) throw r.error;
    dispatchUpdated(source);
    return r.data;
  }

  async function gwAkkoord(id) { return rpc("zorgplan_gw_akkoord", { p_id: id }, "gw-akkoord"); }
  async function terOndertekening(id, ondType, ondNaam) {
    return rpc("zorgplan_ter_ondertekening", {
      p_id: id,
      p_ondertekenaar_type: ondType,
      p_ondertekenaar_naam: ondNaam,
    }, "ter-ondertekening");
  }
  async function activeer(id) { return rpc("zorgplan_activeer", { p_id: id }, "activeer"); }
  async function evalueer(id, verslag) {
    return rpc("zorgplan_evalueer", { p_id: id, p_verslag: verslag || null }, "evalueer");
  }

  async function setArchived(id, archived) {
    await ensureSupabase();
    var r = await global.besaSupabase.from(TABLE).update({ archived: !!archived }).eq("id", id).select().single();
    if (r.error) throw r.error;
    dispatchUpdated(archived ? "archive" : "restore");
    return r.data;
  }

  global.zorgplannenDB = {
    fetchVoorClient: fetchVoorClient,
    opslaan: opslaan,
    gwAkkoord: gwAkkoord,
    terOndertekening: terOndertekening,
    activeer: activeer,
    evalueer: evalueer,
    archive: function (id) { return setArchived(id, true); },
    restore: function (id) { return setArchived(id, false); },
  };
})(typeof window !== "undefined" ? window : this);
