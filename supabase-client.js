/**
 * Centrale Supabase-client voor de Besa Suite.
 *
 * Wat dit bestand doet:
 *  - Initialiseert de Supabase JS client met project URL + anon key.
 *  - Exposeert window.besaSupabase (de client zelf) en window.besaAuth (helpers).
 *
 * Auth-status:
 *  - Login staat momenteel UIT (AUTH_ENABLED = false).
 *  - De helpers in window.besaAuth zijn al beschikbaar zodat data-modules
 *    ze kunnen aanroepen zonder later hun signatuur aan te passen.
 *
 * Login activeren in de toekomst (drie stappen):
 *  1. Zet AUTH_ENABLED hieronder op `true`.
 *  2. Draai het auth-policy-blok onderaan supabase/schema.sql in de
 *     Supabase SQL editor (drop anon-policies, maak authenticated-policies).
 *  3. Voeg login-UI toe aan de app (bv. login.html + besaAuth.signIn helpers).
 *
 * Belangrijk: vóór dit bestand moet @supabase/supabase-js geladen zijn,
 * via de jsDelivr CDN-tag in elke HTML-pagina die data nodig heeft.
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2N3dm9qY2dna2JkeGhsZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NzAyOTMsImV4cCI6MjA5MzU0NjI5M30." +
    "xsQ8ijVmUGOEyDyA26zKbR2-0jfeWVG6xGBZIKY6lnI";

  var AUTH_ENABLED = false;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "[besa-supabase] @supabase/supabase-js is niet geladen. Voeg de CDN-script-tag" +
      " toe vóór dit bestand: <script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>"
    );
    window.besaSupabase = null;
    window.besaAuth = {
      isEnabled: function () { return false; },
      getCurrentUser: function () { return Promise.resolve(null); },
      signOut: function () { return Promise.resolve(); },
    };
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: AUTH_ENABLED,
      autoRefreshToken: AUTH_ENABLED,
      detectSessionInUrl: AUTH_ENABLED,
    },
  });

  window.besaSupabase = client;

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
    signOut: async function () {
      if (!AUTH_ENABLED) return;
      try { await client.auth.signOut(); } catch (e) { /* ignore */ }
    },
  };
})();
