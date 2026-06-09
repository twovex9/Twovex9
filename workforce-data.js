/* global window */
/**
 * workforce-data.js — data-laag voor Module 3: Workforce Planning + AI-engine.
 *
 * Eén dunne laag bovenop de SECURITY DEFINER-RPC's uit
 * supabase/migrations/workforce_planning_module.sql. Geen localStorage-bron-van-
 * waarheid: capaciteit, AI-aanbevelingen, skills en forecast worden live per
 * periode uit Supabase berekend (net als productie-data.js / beschikkingen-dashboard).
 *
 * Public API (window.workforceDB):
 *   - getContext() → Promise<{niveau, kan_beheren, is_directie}> (RPC)
 *   - getContextSync() → laatst geladen context of null
 *   - capaciteit(startISO, endISO) → Promise<Array>
 *   - aanbevelingen(startISO, endISO) → Promise<Array>  (AI-engine)
 *   - skillsDekking() → Promise<Array>
 *   - forecast(weken) → Promise<Array>
 *   - kpis(startISO, endISO) → Promise<Object>
 *   - beslis(sleutel, periode, type, locatie, titel, status, notitie, impactUren, impactEur) → Promise<Object>
 *
 * Events: `besa:workforce-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var _context = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[workforceDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Workforce planning — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:workforce-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  // ── Rol-context ─────────────────────────────────────────────────────────────
  async function getContext() {
    try {
      await ensureSupabase();
      var r = await global.besaSupabase.rpc("workforce_mijn_context");
      if (r.error) throw r.error;
      _context = r.data || null;
      return _context;
    } catch (err) {
      reportSilent("rol-context", err);
      return _context;
    }
  }
  function getContextSync() { return _context; }

  // ── Read-RPC's (per periode) ──────────────────────────────────────────────────
  async function callRpc(fn, args, label, fallback) {
    try {
      await ensureSupabase();
      var r = await global.besaSupabase.rpc(fn, args || {});
      if (r.error) throw r.error;
      return r.data == null ? fallback : r.data;
    } catch (err) {
      reportSilent(label, err);
      return fallback;
    }
  }
  function capaciteit(s, e) { return callRpc("workforce_capaciteit", { p_start: s || null, p_end: e || null }, "capaciteit", []); }
  function aanbevelingen(s, e) { return callRpc("workforce_aanbevelingen", { p_start: s || null, p_end: e || null }, "AI-aanbevelingen", []); }
  function skillsDekking() { return callRpc("workforce_skills_dekking", {}, "skills-dekking", []); }
  function forecast(weken) { return callRpc("workforce_forecast", { p_weken: weken || 6 }, "forecast", []); }
  function kpis(s, e) { return callRpc("workforce_kpis", { p_start: s || null, p_end: e || null }, "KPI's", {}); }

  // ── Beslissing op een AI-aanbeveling ────────────────────────────────────────────
  async function beslis(sleutel, periode, type, locatie, titel, status, notitie, impactUren, impactEur) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("workforce_aanbeveling_beslis", {
      p_sleutel: sleutel, p_periode: periode || null, p_type: type || null,
      p_locatie: locatie || null, p_titel: titel || null, p_status: status,
      p_notitie: notitie || null,
      p_impact_uren: impactUren == null ? null : impactUren,
      p_impact_eur: impactEur == null ? null : impactEur,
    });
    if (r.error) throw r.error;
    dispatchUpdated("aanbeveling-beslis");
    return r.data;
  }

  global.workforceDB = {
    getContext: getContext,
    getContextSync: getContextSync,
    capaciteit: capaciteit,
    aanbevelingen: aanbevelingen,
    skillsDekking: skillsDekking,
    forecast: forecast,
    kpis: kpis,
    beslis: beslis,
  };
})(typeof window !== "undefined" ? window : this);
