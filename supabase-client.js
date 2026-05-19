/**
 * Centrale Supabase-client voor de Besa Suite.
 *
 * Wat dit bestand doet:
 *  - Initialiseert de Supabase JS client met project URL + anon key.
 *  - Exposeert window.besaSupabase (de client zelf) en window.besaAuth (helpers).
 *
 * Auth-status (AAN per 2026-05-08):
 *  - Login staat AAN (AUTH_ENABLED = true). auth-guard.js redirect ongeauthenticeerde
 *    bezoekers naar login.html?next=<huidige-url>.
 *  - RLS staat aan op alle public-tabellen met `to authenticated`-policies.
 *    Anon-key heeft géén toegang tot data — login is verplicht.
 *  - persistSession volgt AUTH_ENABLED.
 *  - login.html biedt de inlog-UI via besaAuth.signIn(...) onder de motorkap.
 *  - Maak eerste user aan via Supabase Dashboard → Auth → Add user (zie
 *    setup_supabase_mcp.md voor instructies).
 *
 * Vereisten per HTML-page (in deze volgorde):
 *  1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *  2. <script src="supabase-client.js"></script>
 *  3. <script src="besa-sync-reporter.js"></script>
 *  4. <script src="auth-guard.js"></script>   ← skip op login.html
 *  5. ...alle data-layers en page-script(s)
 *
 * Toekomst (Stage 8b/8c):
 *  - profiles-tabel met rollen
 *  - RLS policies op alle tabellen: anon-policies vervangen door
 *    authenticated-policies (zie supabase/schema.sql).
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2N3dm9qY2dna2JkeGhsZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzAyOTMsImV4cCI6MjA5MzU0NjI5M30." +
    "xsQ8ijVmUGOEyDyA26zKbR2-0jfeWVG6xGBZIKY6lnI";

  var AUTH_ENABLED = true;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "[besa-supabase] @supabase/supabase-js is niet geladen. Voeg de CDN-script-tag" +
      " toe vóór dit bestand: <script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>"
    );
    window.besaSupabase = null;
    window.besaAuth = {
      isEnabled: function () { return false; },
      getCurrentUser: function () { return Promise.resolve(null); },
      signIn: function () { return Promise.reject(new Error("Supabase niet geladen")); },
      signOut: function () { return Promise.resolve(); },
    };
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: AUTH_ENABLED,
      autoRefreshToken: AUTH_ENABLED,
      detectSessionInUrl: AUTH_ENABLED,
      // Standaard storageKey is "supabase.auth.token". Hou expliciet zodat
      // we 'm bij logout doelgericht kunnen wissen.
      storageKey: "sb-besa-auth",
    },
  });

  window.besaSupabase = client;

  // ---------------------------------------------------------------------------
  // Sessie-rehydratie-guard (root-cause fix 2026-05-19)
  // ---------------------------------------------------------------------------
  // Bewezen via Chrome-MCP: supabase-js herstelt de PERSISTENTE sessie niet
  // altijd betrouwbaar op page-load. getSession()/getUser() gaven instant
  // "Auth session missing!" (geen lock, geen hang) terwijl
  // localStorage["sb-besa-auth"] een 100% geldige, NIET-verlopen sessie
  // bevatte (JWT role=authenticated, exp ~40min vooruit). Gevolg:
  // élke RLS-query (`to authenticated`) gaf 0 rijen terug → Rollen leeg,
  // rol-detail kaatste terug, "willekeurig uitgelogd"-gevoel. Een enkele
  // client.auth.setSession() met exact die opgeslagen tokens herstelde de
  // sessie volledig (queries gaven daarna meteen 14 rollen).
  //
  // Daarom: vóór auth-guard.js en de data-lagen draaien, één keer de
  // opgeslagen sessie expliciet in de client zetten als de client zelf
  // (nog) geen sessie heeft. window.besaSupabaseReady resolve't ná deze
  // poging zodat consumers er deterministisch op kunnen wachten.
  //
  // Hard verbod (eerdere pijnlijke les #284): NOOIT auth.refreshSession()
  // hier — dat roteert de refresh-token en veroorzaakt "Invalid Refresh
  // Token"-loops. setSession() met een NIET-verlopen access-token doet
  // puur een lokale install (geen netwerk, geen rotatie).
  function besaReadStoredSession() {
    try {
      var raw = window.localStorage.getItem("sb-besa-auth");
      if (!raw) return null;
      var o = JSON.parse(raw);
      var s = (o && (o.currentSession || o.session)) || o;
      if (!s || !s.access_token || !s.refresh_token) return null;
      return s;
    } catch (e) { return null; }
  }
  function besaSessionStillFresh(s) {
    try {
      if (!s.expires_at) return true; // onbekend → laat de client beslissen
      var nowSec = Math.floor(Date.now() / 1000);
      return (Number(s.expires_at) - nowSec) > 30; // ≥30s marge
    } catch (e) { return false; }
  }
  window.besaSupabaseReady = (async function () {
    if (!AUTH_ENABLED) return;
    try {
      var gs = await client.auth.getSession();
      if (gs && gs.data && gs.data.session) return; // client heeft 'm al
    } catch (e) { /* val door naar rehydratie */ }
    var s = besaReadStoredSession();
    if (!s || !besaSessionStillFresh(s)) return; // niets/te oud → niets doen
    try {
      await client.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
    } catch (e) {
      // Stil: geen logout, geen console-spam. Bij een echt ongeldige
      // sessie handelt auth-guard.js de redirect netjes af.
      try { console.warn("[besa-supabase] rehydratie overgeslagen:", e && e.message || e); } catch (e2) { /* */ }
    }
  })();

  window.besaAuth = {
    isEnabled: function () { return AUTH_ENABLED; },
    getCurrentUser: async function () {
      if (!AUTH_ENABLED) return null;
      try {
        var res = await client.auth.getUser();
        return res && res.data ? res.data.user : null;
      } catch (e) {
        return null;
      }
    },
    getSession: async function () {
      if (!AUTH_ENABLED) return null;
      try {
        var res = await client.auth.getSession();
        return res && res.data ? res.data.session : null;
      } catch (e) {
        return null;
      }
    },
    signIn: async function (email, password) {
      if (!AUTH_ENABLED) throw new Error("Auth staat uit.");
      var res = await client.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      return res.data;
    },
    signOut: async function () {
      if (!AUTH_ENABLED) return;
      try { await client.auth.signOut(); } catch (e) { /* ignore */ }
    },
  };
})();
