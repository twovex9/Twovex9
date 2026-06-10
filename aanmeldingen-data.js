/* global window */
/**
 * aanmeldingen-data.js — data-laag voor de Aanmeldingen-beoordelingsmodule
 * (Cliëntmodule 2.0 fase 1).
 *
 * Dunne laag bovenop de SECURITY DEFINER-RPC's uit de cliëntreis-migratie.
 * Geen localStorage-bron-van-waarheid: lijst en detail worden live uit
 * Supabase geladen. Documenten staan in de PRIVATE bucket
 * "aanmelding-documenten" en zijn alleen leesbaar via signed URLs.
 *
 * Public API (window.aanmeldingenDB):
 *   - getContext() → Promise<{kan_beoordelen, rollen}>   (clientreis_context)
 *   - getContextSync() → laatst geladen context of null
 *   - lijst(status) → Promise<Array>                     (aanmeldingen_lijst)
 *   - detail(id) → Promise<Object>                       (aanmelding_detail, throwt bij fout)
 *   - beoordeel(id, actie, toelichting) → Promise<Object> (aanmelding_beoordeel, throwt bij fout)
 *   - signedUrl(storagePath) → Promise<string|null>      (signed URL, 600s geldig)
 *
 * Events: `besa:aanmeldingen-updated` (window) na elke succesvolle beoordeling.
 */
(function (global) {
  "use strict";

  var BUCKET = "aanmelding-documenten";
  var _context = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[aanmeldingenDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Aanmeldingen — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:aanmeldingen-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  // ── Read-RPC's met fallback (UI breekt nooit) ───────────────────────────────
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

  // ── Rol-context (fail-closed: geen context = niet beoordelen) ───────────────
  async function getContext() {
    var ctx = await callRpc("clientreis_context", {}, "rol-context", { kan_beoordelen: false, rollen: [] });
    if (!ctx || typeof ctx !== "object") ctx = { kan_beoordelen: false, rollen: [] };
    _context = ctx;
    return ctx;
  }
  function getContextSync() { return _context; }

  // ── Lijst (fallback []) ─────────────────────────────────────────────────────
  function lijst(status) {
    return callRpc("aanmeldingen_lijst", { p_status: status || null }, "lijst", []);
  }

  // ── Detail (geen fallback — throwt zodat de modal de fout toont) ────────────
  async function detail(id) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("aanmelding_detail", { p_id: id });
    if (r.error) throw r.error;
    if (r.data == null) throw new Error("Aanmelding niet gevonden");
    return r.data;
  }

  // ── Beoordelen (mutatie — throwt door naar het page-script) ────────────────
  async function beoordeel(id, actie, toelichting) {
    await ensureSupabase();
    var r = await global.besaSupabase.rpc("aanmelding_beoordeel", {
      p_id: id,
      p_actie: actie,
      p_toelichting: toelichting || null,
    });
    if (r.error) throw r.error;
    dispatchUpdated("beoordeel");
    return r.data;
  }

  // ── Signed URL voor een aanmeld-document (600s geldig) ─────────────────────
  async function signedUrl(storagePath) {
    try {
      if (!storagePath) return null;
      await ensureSupabase();
      var r = await global.besaSupabase.storage.from(BUCKET).createSignedUrl(storagePath, 600);
      if (r.error) throw r.error;
      return (r.data && r.data.signedUrl) || null;
    } catch (err) {
      reportSilent("document-url", err);
      return null;
    }
  }

  global.aanmeldingenDB = {
    getContext: getContext,
    getContextSync: getContextSync,
    lijst: lijst,
    detail: detail,
    beoordeel: beoordeel,
    signedUrl: signedUrl,
  };
})(typeof window !== "undefined" ? window : this);
