/* global window, document */
/**
 * client-doc-status.js — zet een gekleurd "puntje" vóór de voornaam van een
 * cliënt op het cliënten-overzicht (clienten.html) zodra het dossier van die
 * cliënt openstaande aandachtspunten heeft. Conform eis eigenaar (spraakmemo
 * 2026-06-11 16:30): net als bij de medewerkers wil je in één oogopslag op de
 * voorpagina zien dat er iets niet klopt / dat de documentatie niet compleet
 * is, zónder eerst het dossier te hoeven openen. Moet ook voor de rol
 * medewerker zichtbaar zijn.
 *
 *   ROOD   = minimaal één rode issue (beschikking/zorgplan/handtekening ontbreekt
 *            of is verlopen) → "documentatie niet compleet"
 *   ORANJE = alleen oranje/info-issues (bv. signaleringsplan of identiteitsbewijs
 *            ontbreekt) → aandacht nodig, minder urgent
 *   (geen puntje = dossier compleet, geen openstaande issues)
 *
 * Bron = RPC public.client_dossier_status_overzicht() → exact dezelfde
 * client_dossier_issues die je in het dossier zelf ziet (zelfde
 * client_zorg_toegang-gating). Office-rollen/HR/admin zien alle cliënten;
 * een medewerker ziet de puntjes van de cliënten van zijn locatie(s) +
 * gekoppelde cliënten — exact de set die ook op het overzicht zichtbaar is.
 *
 * Dit script raakt de bestaande lijst-render (clienten.js) niet aan: het haalt
 * de status éénmalig op, cachet die, en kleurt het bestaande voornaam-cel-puntje
 * bij elke (her)render (paginering/filter/sortering) via een MutationObserver.
 *
 * Vereist op de pagina (vóór dit script): supabase-client.js, clienten-data.js,
 * clienten.js.
 */
(function (global) {
  "use strict";

  var statusMap = null;        // { clientId: { open_count, heeft_rood } } | null tot geladen
  var fetchInFlight = false;

  function getSupabase() {
    return (global.besaSupabase
      || (global.supabaseClient)
      || (global.besaAuth && global.besaAuth.client)
      || null);
  }

  function statusFor(clientId) {
    if (!statusMap || !clientId) return null;
    var s = statusMap[clientId];
    if (!s) return null;
    return s.heeft_rood ? "red" : "orange";
  }

  function buildTitle(clientId) {
    var s = statusMap && statusMap[clientId];
    var n = s ? s.open_count : 0;
    var punten = n === 1 ? "aandachtspunt" : "aandachtspunten";
    if (s && s.heeft_rood) {
      return "Dossier niet compleet — " + n + " openstaand " + punten + ". Open de cliënt voor details.";
    }
    return "Dossier vraagt aandacht — " + n + " openstaand " + punten + ". Open de cliënt voor details.";
  }

  function paintRow(tr) {
    if (!tr) return;
    var clientId = tr.getAttribute && tr.getAttribute("data-id");
    if (!clientId) return;
    var cell = tr.querySelector('td[data-col="voornaam"]');
    if (!cell) return;

    var status = statusFor(clientId);
    var dot = cell.querySelector(".cl-doc-dot");

    if (!status) {
      // Dossier compleet → eventueel bestaand puntje weghalen.
      if (dot && dot.parentNode) dot.parentNode.removeChild(dot);
      return;
    }

    if (!dot) {
      dot = document.createElement("span");
      dot.className = "cl-doc-dot";
      dot.setAttribute("aria-hidden", "false");
      cell.insertBefore(dot, cell.firstChild);
    }
    dot.classList.remove("cl-doc-dot--red", "cl-doc-dot--orange");
    dot.classList.add("cl-doc-dot--" + status);
    dot.setAttribute("title", buildTitle(clientId));
    dot.setAttribute("aria-label", status === "red"
      ? "Dossier niet compleet"
      : "Dossier vraagt aandacht");
  }

  function paintAll() {
    if (!statusMap) return;
    var rows = document.querySelectorAll('#cl-tbody tr[data-id]');
    for (var i = 0; i < rows.length; i++) paintRow(rows[i]);
  }

  // Debounce: snelle opeenvolgende mutaties (paginering, kolomkiezer) niet 100×.
  var paintPending = false;
  function schedulePaint() {
    if (paintPending) return;
    paintPending = true;
    setTimeout(function () {
      paintPending = false;
      paintAll();
    }, 0);
  }

  function loadStatus() {
    if (fetchInFlight) return;
    var sb = getSupabase();
    if (!sb || typeof sb.rpc !== "function") return;
    fetchInFlight = true;
    sb.rpc("client_dossier_status_overzicht").then(function (res) {
      fetchInFlight = false;
      if (res && res.error) {
        console.warn("[client-doc-status] RPC-fout:", res.error.message || res.error);
        return;
      }
      var map = {};
      var rows = (res && res.data) || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || !r.client_id) continue;
        map[r.client_id] = {
          open_count: r.open_count != null ? r.open_count : 0,
          heeft_rood: !!r.heeft_rood,
        };
      }
      statusMap = map;
      schedulePaint();
    }).catch(function (err) {
      fetchInFlight = false;
      console.warn("[client-doc-status] kon dossier-status niet laden:", err);
    });
  }

  function observeTable() {
    var tbody = document.getElementById("cl-tbody");
    if (!tbody || !global.MutationObserver) return;
    var mo = new global.MutationObserver(function () { schedulePaint(); });
    mo.observe(tbody, { childList: true });
  }

  function init() {
    observeTable();
    // Wacht op een actieve sessie (anders weigert RLS de issues) en haal dan op.
    if (global.besaSupabaseReady && typeof global.besaSupabaseReady.then === "function") {
      global.besaSupabaseReady.then(function () { loadStatus(); }).catch(function () { loadStatus(); });
    } else {
      loadStatus();
    }
    // Re-render-triggers van de pagina → opnieuw verven met de gecachte status.
    global.addEventListener("besa:clienten-updated", function () {
      // Cliëntenlijst gewijzigd: status kan ook veranderd zijn → opnieuw ophalen.
      loadStatus();
      schedulePaint();
    });
    // Als de Supabase-client iets later pas klaar is, nog een poging.
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (statusMap || tries > 20) { clearInterval(iv); return; }
      loadStatus();
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
