/* global window */
/**
 * wachtlijst-data.js — data-laag voor de Wachtlijst-pagina
 * (Cliëntmodule 2.0 fase 2).
 *
 * Dunne laag bovenop de SECURITY DEFINER-RPC's uit de fase-2-migratie.
 * Geen localStorage-bron-van-waarheid: het overzicht wordt live uit
 * Supabase geladen via wachtlijst_overzicht().
 *
 * Public API (window.wachtlijstDB):
 *   - getContext() → Promise<{kan_beoordelen, rollen}>  (clientreis_context, fail-closed)
 *   - getContextSync() → laatst geladen context of null
 *   - overzicht() → Promise<{kpis, rijen}>              (wachtlijst_overzicht — throwt bij
 *       fout zodat de pagina een nette foutkaart toont; géén stille fallback)
 *   - plaatsen(clientId) → Promise<Object>              (clientreis_zet_status →
 *       plaatsing_gepland — throwt door naar het page-script)
 *
 * Events: `besa:wachtlijst-updated` (window) na elke succesvolle plaatsing.
 */
(function (global) {
  "use strict";

  var _context = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[wachtlijstDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Wachtlijst — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:wachtlijst-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  // ── Read-RPC met fallback (alleen voor de rol-context) ─────────────────────
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

  // ── Rol-context (fail-closed: geen context = geen toegang) ──────────────────
  async function getContext() {
    var ctx = await callRpc("clientreis_context", {}, "rol-context", { kan_beoordelen: false, rollen: [] });
    if (!ctx || typeof ctx !== "object") ctx = { kan_beoordelen: false, rollen: [] };
    _context = ctx;
    return ctx;
  }
  function getContextSync() { return _context; }

  // ── Overzicht (geen fallback — throwt zodat de pagina de fout toont) ────────
  async function overzicht() {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("wachtlijst_overzicht", {});
    if (r.error) throw r.error;
    if (r.data == null) throw new Error("Wachtlijst-overzicht leverde geen data");
    return r.data;
  }

  // ── Plaatsing plannen (mutatie — throwt door naar het page-script) ──────────
  async function plaatsen(clientId) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("clientreis_zet_status", {
      p_client_id: clientId,
      p_status: "plaatsing_gepland",
      p_toelichting: null,
    });
    if (r.error) throw r.error;
    dispatchUpdated("plaatsen");
    return r.data;
  }

  global.wachtlijstDB = {
    getContext: getContext,
    getContextSync: getContextSync,
    overzicht: overzicht,
    plaatsen: plaatsen,
  };
})(typeof window !== "undefined" ? window : this);
