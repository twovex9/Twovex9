/* global window */
/**
 * incidenten-analyse-data.js — data-laag voor de Incidentanalyse & kwaliteit-module.
 *
 * Eén dunne laag bovenop de SECURITY DEFINER-RPC's uit
 * supabase/migrations/incident_analyse_module.sql. Geen localStorage-bron-van-
 * waarheid: signalen, risicoscores, analyses en KPI's worden live per periode
 * uit Supabase berekend (net als workforce-data.js / productie-data.js). De
 * "AI" is een deterministische heuristiek-engine — geen LLM.
 *
 * Public API (window.incidentAnalyseDB):
 *   - getContext() → Promise<{niveau, kan_zien, is_directie, is_eigenaar, naam}>
 *   - getContextSync() → laatst geladen context of null
 *   - signalen(dagen) → Promise<Array>      (herhalingsdetectie + adviezen)
 *   - risicoscores(dagen) → Promise<Array>   (dynamische score + kleur)
 *   - top(dagen) → Promise<{clienten, locaties, trends}>
 *   - dimensie(dim, dagen) → Promise<Array>
 *   - positieveKpis(dagen) → Promise<Object>
 *   - directieKpis(dagen) → Promise<Object>
 *   - eigenaarKpis() → Promise<Object>
 *   - maatregelEffect() → Promise<Array>
 *   - beslis(sleutel, type, entiteitType, entiteit, titel, status, notitie) → Promise<Object>
 *
 * Events: `ff:incident-analyse-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var _context = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[incidentAnalyseDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Incidentanalyse — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.ffSupabaseReady) { try { await global.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("ff:incident-analyse-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  // ── Rol-context ─────────────────────────────────────────────────────────────
  async function getContext() {
    try {
      await ensureSupabase();
      var r = await global.ffSupabase.rpc("incident_analyse_context");
      if (r.error) throw r.error;
      _context = r.data || null;
      return _context;
    } catch (err) {
      reportSilent("rol-context", err);
      return _context;
    }
  }
  function getContextSync() { return _context; }

  // ── Read-RPC's ──────────────────────────────────────────────────────────────
  async function callRpc(fn, args, label, fallback) {
    try {
      await ensureSupabase();
      var r = await global.ffSupabase.rpc(fn, args || {});
      if (r.error) throw r.error;
      return r.data == null ? fallback : r.data;
    } catch (err) {
      reportSilent(label, err);
      return fallback;
    }
  }
  function signalen(dagen) { return callRpc("incident_signalen", { p_dagen: dagen || 90 }, "signalen", []); }
  function risicoscores(dagen) { return callRpc("incident_risicoscores", { p_dagen: dagen || 30 }, "risicoscores", []); }
  function top(dagen) { return callRpc("incident_top", { p_dagen: dagen || 90 }, "top-10", { clienten: [], locaties: [], trends: [] }); }
  function dimensie(dim, dagen) { return callRpc("incident_dimensie", { p_dim: dim || "locatie", p_dagen: dagen || 90 }, "dimensie-analyse", []); }
  function positieveKpis(dagen) { return callRpc("incident_positieve_kpis", { p_dagen: dagen || 90 }, "positieve KPI's", {}); }
  function directieKpis(dagen) { return callRpc("incident_directie_kpis", { p_dagen: dagen || 90 }, "directie-KPI's", {}); }
  function eigenaarKpis() { return callRpc("incident_eigenaar_kpis", {}, "eigenaar-KPI's", {}); }
  function maatregelEffect() { return callRpc("incident_maatregel_effect", {}, "maatregel-effect", []); }

  // ── Beslissing op een signaal/advies ─────────────────────────────────────────
  async function beslis(sleutel, type, entiteitType, entiteit, titel, status, notitie) {
    await ensureSupabase();
    var r = await global.ffSupabase.rpc("incident_advies_beslis", {
      p_sleutel: sleutel, p_type: type || null,
      p_entiteit_type: entiteitType || null, p_entiteit: entiteit || null,
      p_titel: titel || null, p_status: status, p_notitie: notitie || null,
    });
    if (r.error) throw r.error;
    dispatchUpdated("advies-beslis");
    return r.data;
  }

  global.incidentAnalyseDB = {
    getContext: getContext,
    getContextSync: getContextSync,
    signalen: signalen,
    risicoscores: risicoscores,
    top: top,
    dimensie: dimensie,
    positieveKpis: positieveKpis,
    directieKpis: directieKpis,
    eigenaarKpis: eigenaarKpis,
    maatregelEffect: maatregelEffect,
    beslis: beslis,
  };
})(typeof window !== "undefined" ? window : this);
