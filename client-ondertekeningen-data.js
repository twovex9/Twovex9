/* global window */
/**
 * client-ondertekeningen-data.js — data-laag digitale ondertekening
 * (Cliëntmodule 2.0 fase 2).
 *
 * Lezen via REST: `client_ondertekeningen` (RLS = clienten-zichtbaarheid) en
 * `ondertekening_verklaringen` (authenticated). Mutaties uitsluitend via de
 * RPC's `ondertekening_maak_verzoek` / `ondertekening_intrekken` (throw bij
 * fout). Aktes staan in de PRIVATE bucket `client-ondertekeningen`; lezen kan
 * alleen via createSignedUrl met de user-JWT (signedUrl()).
 *
 * Public API (window.clientOndertekeningenDB):
 *   - fetchVoorClient(clientId) → Promise<Array>   (order aanmaakdatum desc)
 *   - verklaringen() → Promise<Array>               (gecachet na 1e succes)
 *   - maakVerzoek({clientId, verklaringType, ondertekenaarType, ondertekenaarNaam, intakeId}) → Promise<{ok,id,token}>
 *   - intrekken(id) → Promise<{ok}>
 *   - signedUrl(path) → Promise<string|null>        (600s geldig)
 *
 * Events: `ff:client-ondertekeningen-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var BUCKET = "client-ondertekeningen";
  var _verklaringen = null;

  function reportSilent(action, err) {
    if (global.console) console.error("[clientOndertekeningenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Ondertekeningen — " + action, err);
  }

  // Cold-load vangrail: wacht tot de sessie gerehydrateerd is, anders leest een
  // anonieme client door RLS 0 rijen (les uit eerdere cold-load bugs).
  async function ensureSupabase() {
    if (global.ffSupabaseReady) { try { await global.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("ff:client-ondertekeningen-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function fetchVoorClient(clientId) {
    try {
      if (!clientId) return [];
      await ensureSupabase();
      var r = await global.ffSupabase
        .from("client_ondertekeningen")
        .select("*")
        .eq("client_id", clientId)
        .order("aanmaakdatum", { ascending: false });
      if (r.error) throw r.error;
      return Array.isArray(r.data) ? r.data : [];
    } catch (err) {
      reportSilent("laden", err);
      return [];
    }
  }

  async function verklaringen() {
    if (_verklaringen) return _verklaringen;
    try {
      await ensureSupabase();
      var r = await global.ffSupabase
        .from("ondertekening_verklaringen")
        .select("*")
        .order("type", { ascending: true });
      if (r.error) throw r.error;
      _verklaringen = Array.isArray(r.data) ? r.data : [];
      return _verklaringen;
    } catch (err) {
      reportSilent("verklaringen laden", err);
      return [];
    }
  }

  // ── Mutaties: géén catch — page-script toont showError bij falen ───────────
  async function maakVerzoek(args) {
    await ensureSupabase();
    var a = args || {};
    var r = await global.ffSupabase.rpc("ondertekening_maak_verzoek", {
      p_client_id: a.clientId,
      p_verklaring_type: a.verklaringType,
      p_ondertekenaar_type: a.ondertekenaarType,
      p_ondertekenaar_naam: a.ondertekenaarNaam,
      p_intake_id: a.intakeId || null,
    });
    if (r.error) throw r.error;
    dispatchUpdated("maak-verzoek");
    return r.data;
  }

  async function intrekken(id) {
    await ensureSupabase();
    var r = await global.ffSupabase.rpc("ondertekening_intrekken", { p_id: id });
    if (r.error) throw r.error;
    dispatchUpdated("intrekken");
    return r.data;
  }

  // ── Signed URL voor de PDF-akte (PRIVATE bucket, 600s, user-JWT) ───────────
  async function signedUrl(path) {
    try {
      if (!path) return null;
      await ensureSupabase();
      var r = await global.ffSupabase.storage.from(BUCKET).createSignedUrl(path, 600);
      if (r.error) throw r.error;
      return (r.data && r.data.signedUrl) || null;
    } catch (err) {
      reportSilent("signed URL", err);
      return null;
    }
  }

  global.clientOndertekeningenDB = {
    fetchVoorClient: fetchVoorClient,
    verklaringen: verklaringen,
    maakVerzoek: maakVerzoek,
    intrekken: intrekken,
    signedUrl: signedUrl,
  };
})(typeof window !== "undefined" ? window : this);
