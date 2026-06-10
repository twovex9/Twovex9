/**
 * compliance-dashboard-data.js — data-laag voor het HR Compliance-dashboard (G48).
 * Roept de office-only SECURITY DEFINER RPC's hr_compliance_kpis() en
 * hr_compliance_overzicht() aan (zie hr_v4_compliance_rpc.sql). Read-only.
 */
(function (global) {
  "use strict";

  function client() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    return global.besaSupabase;
  }

  async function kpis() {
    var res = await client().rpc("hr_compliance_kpis");
    if (res.error) throw res.error;
    return (res.data && res.data[0]) || null;
  }

  async function overzicht() {
    var res = await client().rpc("hr_compliance_overzicht");
    if (res.error) throw res.error;
    return Array.isArray(res.data) ? res.data : [];
  }

  // G42 — recertificering-overzicht (verlopen/≤90d) + agressietraining-dekking.
  async function recertificering() {
    var res = await client().rpc("hr_recertificering_overzicht");
    if (res.error) throw res.error;
    return Array.isArray(res.data) ? res.data : [];
  }

  async function agressieAantal() {
    var res = await client().rpc("hr_agressie_training_aantal");
    if (res.error) throw res.error;
    return Number(res.data) || 0;
  }

  global.complianceDashboardDB = { kpis: kpis, overzicht: overzicht, recertificering: recertificering, agressieAantal: agressieAantal };
})(typeof window !== "undefined" ? window : globalThis);
