/* global window */
/**
 * besa-sync-reporter.js — centrale foutafhandeling voor "fire-and-forget"
 * Supabase synchronisaties.
 *
 * Veel page-scripts (planning, compensatie, salarisadministratie,
 * uren-budgettering, medewerker-form, etc.) schrijven eerst naar
 * localStorage en pushen daarna asynchroon naar de Supabase data-laag.
 * Voorheen werd de fout in zo'n call alleen in console.error gelogd; de
 * gebruiker kreeg geen melding. Bij netwerkproblemen kon dat leiden tot
 * stille data-divergentie tussen apparaten.
 *
 * Deze module biedt één gestandaardiseerd opvangpunt:
 *
 *   window.besaFireAndForget(promise, domain)
 *     - Slikt de error niet op: hij wordt gelogd én getoond aan de
 *       gebruiker via toast (of save-modal als fallback).
 *     - Throttled per "domain": dezelfde domain laat maximaal 1 toast per
 *       5 seconden zien zodat een herhaald-falende sync de UI niet
 *       overspoelt.
 *
 *   window.besaReportSyncFailure(domain, err)
 *     - Variant zonder Promise: voor handmatige meldingen.
 *
 * Sinds Stage 8d:
 *   - Auth-fouten (PGRST301 / 401 / 403 / "JWT expired" etc.) worden
 *     gedetecteerd en NIET als rode "sync mislukt" toast getoond.
 *     In plaats daarvan wordt window.besaHandleAuthFailure(err) aangeroepen
 *     (door auth-guard.js geleverd) die netjes uitlogt + naar login.html
 *     redirect met ?next=<huidige-url>.
 *   - Een minimale fallback-handler staat hier voor het geval auth-guard
 *     niet geladen is (bv. tijdens lokaal testen met AUTH_ENABLED=false).
 */
(function (global) {
  "use strict";

  var THROTTLE_MS = 5000;
  var lastShown = Object.create(null);

  function shortMsg(err) {
    if (!err) return "Onbekende fout";
    if (typeof err === "string") return err;
    if (err.message) return String(err.message);
    try { return JSON.stringify(err); } catch (e) { return String(err); }
  }

  // ---------------------------------------------------------------------------
  // Stage 8d: auth-error detectie
  // ---------------------------------------------------------------------------
  // PostgREST geeft bij verlopen of ontbrekend JWT typisch:
  //   - code "PGRST301"  (jwt expired)
  //   - code "PGRST302"  (jwt invalid)
  //   - status 401 / 403
  //   - message bevat "JWT", "expired", "permission denied", "Invalid Refresh Token"
  // Supabase Storage geeft een vergelijkbare statusCode 401/403.
  function isAuthError(err) {
    if (!err) return false;
    var code = String(err.code || err.statusCode || "").toUpperCase();
    if (code === "PGRST301" || code === "PGRST302") return true;
    var status = Number(err.status || err.statusCode || 0);
    if (status === 401 || status === 403) return true;
    var msg = String(err.message || err.msg || err.error || "").toLowerCase();
    if (!msg) return false;
    if (msg.indexOf("jwt") !== -1 && (msg.indexOf("expir") !== -1 || msg.indexOf("invalid") !== -1)) return true;
    if (msg.indexOf("invalid refresh token") !== -1) return true;
    if (msg.indexOf("not authenticated") !== -1) return true;
    if (msg.indexOf("auth session missing") !== -1) return true;
    return false;
  }

  // Idempotent fallback wanneer auth-guard.js niet geladen is. Pakt sowieso
  // de meest cruciale stap: weg uit deze pagina, naar login.
  var fallbackTriggered = false;
  function fallbackAuthFailure() {
    if (fallbackTriggered) return;
    fallbackTriggered = true;
    try {
      var here = global.location.pathname + global.location.search + global.location.hash;
      var url = "login.html?next=" + encodeURIComponent(here);
      global.location.replace(url);
    } catch (e) { /* */ }
  }

  function dispatchAuthFailure(err) {
    try { console.warn("[besa:sync] auth-fout gedetecteerd, redirect naar login:", err); }
    catch (e) { /* */ }
    if (typeof global.besaHandleAuthFailure === "function") {
      try { global.besaHandleAuthFailure(err); return; }
      catch (e) { /* val terug op de fallback */ }
    }
    fallbackAuthFailure();
  }

  function showFailureToast(domain, err) {
    // Stage 8d: auth-fouten gaan niet als generieke sync-toast — die zijn
    // verwarrend. Ze triggeren een nette redirect naar login.
    if (isAuthError(err)) {
      dispatchAuthFailure(err);
      return;
    }

    var key = String(domain || "default");
    var now = Date.now();
    if (lastShown[key] && now - lastShown[key] < THROTTLE_MS) return;
    lastShown[key] = now;

    var msg = shortMsg(err);
    var titel = (domain ? domain : "Synchronisatie") + " — niet opgeslagen";
    var body = "Wijziging is lokaal bewaard maar niet in de database opgeslagen. "
      + "Controleer je internetverbinding en probeer opnieuw. (" + msg + ")";

    if (typeof global.showActionFeedback === "function") {
      try { global.showActionFeedback("error", titel, body); return; } catch (e) { /* fall through */ }
    }
    if (typeof global.showSaveModal === "function") {
      try { global.showSaveModal(body, titel); return; } catch (e) { /* fall through */ }
    }
    try { console.warn("[besa:sync] " + titel + ": " + body); } catch (e) { /* */ }
  }

  function fireAndForget(promise, domain) {
    if (!promise || typeof promise.then !== "function") return promise;
    return promise.catch(function (err) {
      try { console.error("[besa:sync] " + (domain || "?") + " mislukt:", err); }
      catch (e) { /* */ }
      showFailureToast(domain || "Synchronisatie", err);
      return null;
    });
  }

  global.besaFireAndForget = fireAndForget;
  global.besaReportSyncFailure = function (domain, err) {
    try { console.error("[besa:sync] " + (domain || "?") + " mislukt:", err); }
    catch (e) { /* */ }
    showFailureToast(domain || "Synchronisatie", err);
  };
  global.besaIsAuthError = isAuthError;
})(typeof window !== "undefined" ? window : this);
