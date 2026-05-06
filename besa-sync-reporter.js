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
 *     - Re-throwt de fout zodat optionele extra .catch() blijft werken.
 *
 *   window.besaReportSyncFailure(domain, err)
 *     - Lege variant zonder Promise: voor handmatige meldingen.
 *
 * Gebruik in page-scripts:
 *   var p = window.someDB.pushAll(rows);
 *   window.besaFireAndForget(p, "Compensatie-feestdagen");
 *
 * Gebruik in data-layers:
 *   - Push-functies (pushAll, pushType, pushHistory, syncFromLocalUpsert,
 *     setCell, ...) MOETEN een Promise returnen die rejected bij Supabase-
 *     fout, niet zelf swallowen. Page-scripts wrappen die Promise in
 *     besaFireAndForget().
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

  function showFailureToast(domain, err) {
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
    // Laatste redmiddel — minder fraai, maar voorkomt stille fouten.
    try { console.warn("[besa:sync] " + titel + ": " + body); } catch (e) { /* */ }
  }

  function fireAndForget(promise, domain) {
    if (!promise || typeof promise.then !== "function") return promise;
    return promise.catch(function (err) {
      try { console.error("[besa:sync] " + (domain || "?") + " mislukt:", err); }
      catch (e) { /* */ }
      showFailureToast(domain || "Synchronisatie", err);
      // Niet re-throwen: page-scripts behandelen dit nu als opgevangen.
      // Wie expliciet wil weten of het lukte gebruikt rechtstreeks await.
      return null;
    });
  }

  global.besaFireAndForget = fireAndForget;
  global.besaReportSyncFailure = function (domain, err) {
    try { console.error("[besa:sync] " + (domain || "?") + " mislukt:", err); }
    catch (e) { /* */ }
    showFailureToast(domain || "Synchronisatie", err);
  };
})(typeof window !== "undefined" ? window : this);
