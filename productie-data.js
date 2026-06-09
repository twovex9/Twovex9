/* global window */
/**
 * productie-data.js — data-laag voor Module 2: Productie & Urenregistratie.
 *
 * Eén dunne laag bovenop de SECURITY DEFINER-RPC's uit
 * supabase/migrations/productie_module.sql + directe reads op de twee
 * status-tabellen. Geen localStorage-bron-van-waarheid: de cijfers worden
 * live per periode uit Supabase berekend (net als beschikkingen-dashboard).
 *
 * Public API (window.productieDB):
 *   - getContext() → Promise<{niveau, kan_beheren, is_directie}> (RPC)
 *   - getContextSync() → laatst geladen context of null
 *   - bewaking(startISO, endISO) → Promise<Array>  (RPC productie_beschikking_bewaking)
 *   - kostenZzp(startISO, endISO) → Promise<Array>
 *   - kostenLoondienst(startISO, endISO) → Promise<Array>
 *   - kpis(startISO, endISO) → Promise<Object>
 *   - maandStatusAll() → Promise<Array>  (alle productie_maandafsluiting-rijen)
 *   - maandAfsluiten(jaar, maand, notitie) → Promise<Object> (RPC)
 *   - maandHeropenen(jaar, maand) → Promise<Object> (RPC)
 *   - overschrijdingen() → Promise<Array> (alle goedkeuring-rijen)
 *   - overschrijdingBeslis(beschikkingId, jaar, maand, status, reden, verbruik, toegekend) → Promise<Object>
 *   - setToegekend(beschikkingId, uren, eenheid) → Promise<Object>
 *
 * Events: `besa:productie-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var _context = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[productieDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Productie — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:productie-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  // ── Rol-context ─────────────────────────────────────────────────────────────
  async function getContext() {
    try {
      await ensureSupabase();
      var r = await global.besaSupabase.rpc("productie_mijn_context");
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
  async function callRpc(fn, startISO, endISO, label, fallback) {
    try {
      await ensureSupabase();
      var r = await global.besaSupabase.rpc(fn, { p_start: startISO || null, p_end: endISO || null });
      if (r.error) throw r.error;
      return r.data == null ? fallback : r.data;
    } catch (err) {
      reportSilent(label, err);
      return fallback;
    }
  }
  function bewaking(s, e) { return callRpc("productie_beschikking_bewaking", s, e, "beschikkingsbewaking", []); }
  function kostenZzp(s, e) { return callRpc("productie_kosten_zzp", s, e, "ZZP-kosten", []); }
  function kostenLoondienst(s, e) { return callRpc("productie_kosten_loondienst", s, e, "loondienst-kosten", []); }
  function kpis(s, e) { return callRpc("productie_kpis", s, e, "KPI's", {}); }

  // ── Maandafsluiting ──────────────────────────────────────────────────────────
  async function maandStatusAll() {
    try {
      await ensureSupabase();
      var r = await global.besaSupabase.from("productie_maandafsluiting").select("*").order("jaar", { ascending: false }).order("maand", { ascending: false });
      if (r.error) throw r.error;
      return Array.isArray(r.data) ? r.data : [];
    } catch (err) { reportSilent("maandstatus", err); return []; }
  }

  async function maandAfsluiten(jaar, maand, notitie) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("productie_maand_afsluiten", { p_jaar: jaar, p_maand: maand, p_notitie: notitie || null });
    if (r.error) throw r.error;
    dispatchUpdated("maand-afsluiten");
    return r.data;
  }

  async function maandHeropenen(jaar, maand) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("productie_maand_heropenen", { p_jaar: jaar, p_maand: maand });
    if (r.error) throw r.error;
    dispatchUpdated("maand-heropenen");
    return r.data;
  }

  // ── Overschrijding-goedkeuring ────────────────────────────────────────────────
  async function overschrijdingen() {
    try {
      await ensureSupabase();
      var r = await global.besaSupabase.from("productie_overschrijding_goedkeuring").select("*").order("laatst_gewijzigd", { ascending: false });
      if (r.error) throw r.error;
      return Array.isArray(r.data) ? r.data : [];
    } catch (err) { reportSilent("overschrijdingen", err); return []; }
  }

  async function overschrijdingBeslis(beschikkingId, jaar, maand, status, reden, verbruik, toegekend) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("productie_overschrijding_beslis", {
      p_beschikking_id: beschikkingId, p_jaar: jaar, p_maand: maand, p_status: status,
      p_reden: reden || null, p_verbruik: verbruik == null ? null : verbruik, p_toegekend: toegekend == null ? null : toegekend,
    });
    if (r.error) throw r.error;
    dispatchUpdated("overschrijding-beslis");
    return r.data;
  }

  // ── Toegekende omvang bijwerken ────────────────────────────────────────────────
  async function setToegekend(beschikkingId, uren, eenheid) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("productie_set_toegekend", {
      p_beschikking_id: beschikkingId, p_uren: uren == null ? null : uren, p_eenheid: eenheid || null,
    });
    if (r.error) throw r.error;
    dispatchUpdated("set-toegekend");
    return r.data;
  }

  global.productieDB = {
    getContext: getContext,
    getContextSync: getContextSync,
    bewaking: bewaking,
    kostenZzp: kostenZzp,
    kostenLoondienst: kostenLoondienst,
    kpis: kpis,
    maandStatusAll: maandStatusAll,
    maandAfsluiten: maandAfsluiten,
    maandHeropenen: maandHeropenen,
    overschrijdingen: overschrijdingen,
    overschrijdingBeslis: overschrijdingBeslis,
    setToegekend: setToegekend,
  };
})(typeof window !== "undefined" ? window : this);
