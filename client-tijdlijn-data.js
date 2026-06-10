/**
 * Cliënt-tijdlijn — dunne read-only data-laag op tabel `client_tijdlijn`.
 *
 * RLS: SELECT voor wie de cliënt mag zien; INSERT/UPDATE/DELETE zijn geweigerd
 * (events worden uitsluitend server-side geschreven door triggers/RPC's).
 * Deze laag biedt daarom alleen fetchVoorClient(clientId) — geen cache, geen
 * mutaties. Fouten gaan via reportSilent (werkpatronen §6c-bis) en geven een
 * lege array terug zodat de UI nooit breekt.
 */
(function (global) {
  "use strict";

  var TABLE = "client_tijdlijn";

  function reportSilent(action, err) {
    console.error("[clientTijdlijnDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Cliënt-tijdlijn — " + action, err);
  }

  async function fetchVoorClient(clientId) {
    try {
      if (!clientId) return [];
      // Wacht op sessie-rehydratie vóór de eerste query (cold-load vangrail:
      // anonieme SELECT geeft door RLS 0 rijen ZONDER error).
      if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* */ } }
      if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
      var res = await global.besaSupabase
        .from(TABLE)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      reportSilent("laden", err);
      return [];
    }
  }

  global.clientTijdlijnDB = {
    fetchVoorClient: fetchVoorClient,
  };
})(typeof window !== "undefined" ? window : this);
