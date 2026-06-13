/* global window */
/**
 * client-intake-data.js — data-laag voor de intake-fase (Cliëntmodule 2.0 fase 2).
 *
 * Dunne laag bovenop tabellen `client_intakes` + `client_intake_onderdelen`
 * (SELECT via REST; RLS = wie de cliënt mag zien) en de SECURITY DEFINER-RPC's
 * `clientreis_context`, `intake_onderdeel_opslaan`, `intake_afronden` en
 * `clientreis_zet_status` (gooien een exception zonder rechten).
 *
 * Public API (window.clientIntakeDB):
 *   - getContext() → Promise<{kan_beoordelen, rollen}>   (fallback fail-closed)
 *   - getContextSync() → laatst geladen context of null
 *   - fetchVoorClient(clientId) → Promise<{intake, onderdelen}>
 *   - onderdeelOpslaan(id, inhoud, afgerond) → Promise (throw bij fout)
 *   - afronden(intakeId) → Promise (throw bij fout)
 *   - zetStatus(clientId, status, toelichting) → Promise (throw bij fout)
 *
 * Events: `ff:client-intake-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var _context = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[clientIntakeDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Cliënt-intake — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.ffSupabaseReady) { try { await global.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("ff:client-intake-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  // ── Rol-context (fail-closed: geen context = niet beoordelen) ──────────────
  async function getContext() {
    try {
      await ensureSupabase();
      var r = await global.ffSupabase.rpc("clientreis_context");
      if (r.error) throw r.error;
      _context = r.data || { kan_beoordelen: false, rollen: [] };
      return _context;
    } catch (err) {
      reportSilent("rol-context", err);
      return _context || { kan_beoordelen: false, rollen: [] };
    }
  }
  function getContextSync() { return _context; }

  // ── Lezen: nieuwste intake (lopend eerst) + onderdelen op volgorde ─────────
  async function fetchVoorClient(clientId) {
    try {
      if (!clientId) return { intake: null, onderdelen: [] };
      await ensureSupabase();
      // status desc sorteert "lopend" vóór "afgerond"; daarbinnen nieuwste eerst.
      var ri = await global.ffSupabase
        .from("client_intakes")
        .select("*")
        .eq("client_id", clientId)
        .order("status", { ascending: false })
        .order("gestart_op", { ascending: false })
        .limit(1);
      if (ri.error) throw ri.error;
      var intake = Array.isArray(ri.data) && ri.data.length ? ri.data[0] : null;
      if (!intake) return { intake: null, onderdelen: [] };
      var ro = await global.ffSupabase
        .from("client_intake_onderdelen")
        .select("*")
        .eq("intake_id", intake.id)
        .order("volgorde", { ascending: true });
      if (ro.error) throw ro.error;
      return { intake: intake, onderdelen: Array.isArray(ro.data) ? ro.data : [] };
    } catch (err) {
      reportSilent("laden", err);
      return { intake: null, onderdelen: [] };
    }
  }

  // ── Mutaties: géén catch — page-script toont showError bij falen ───────────
  async function onderdeelOpslaan(id, inhoud, afgerond) {
    await ensureSupabase();
    var r = await global.ffSupabase.rpc("intake_onderdeel_opslaan", {
      p_id: id,
      p_inhoud: inhoud == null ? "" : String(inhoud),
      p_afgerond: !!afgerond,
    });
    if (r.error) throw r.error;
    dispatchUpdated("onderdeel-opslaan");
    return r.data;
  }

  async function afronden(intakeId) {
    await ensureSupabase();
    var r = await global.ffSupabase.rpc("intake_afronden", { p_intake_id: intakeId });
    if (r.error) throw r.error;
    dispatchUpdated("afronden");
    return r.data;
  }

  async function zetStatus(clientId, status, toelichting) {
    await ensureSupabase();
    var t = toelichting == null ? "" : String(toelichting).trim();
    var r = await global.ffSupabase.rpc("clientreis_zet_status", {
      p_client_id: clientId,
      p_status: status,
      p_toelichting: t ? t : null,
    });
    if (r.error) throw r.error;
    dispatchUpdated("zet-status");
    return r.data;
  }

  global.clientIntakeDB = {
    getContext: getContext,
    getContextSync: getContextSync,
    fetchVoorClient: fetchVoorClient,
    onderdeelOpslaan: onderdeelOpslaan,
    afronden: afronden,
    zetStatus: zetStatus,
  };
})(typeof window !== "undefined" ? window : this);
