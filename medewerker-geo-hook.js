/* global window, document */
/**
 * medewerker-geo-hook.js — koppelt de "Auto-bereken"-knop op het
 * medewerker-detail aan window.besaGeoDistance.
 *
 * Flow bij klik op #emp-geo-calc-btn:
 *   1. Lees thuisadres uit emp-postcode / emp-huisnummer / emp-toevoeging / emp-plaats
 *   2. Lees eerste geselecteerde Loondienst-locatie uit chips in
 *      #emp-loondienst-locaties-chips (DOM, voor MVP — chip-tekst = naam)
 *   3. Match naam tegen window.locatiesDB.getAllSync() → vind postcode +
 *      huisnummer + plaats van de locatie
 *   4. Roep window.besaGeoDistance.calculateEnkeleReis(home, loc)
 *   5. Vul emp-location-distance.value met de berekende km en toon
 *      status-bericht in #emp-geo-status (success groen / error rood)
 *
 * Niet auto-trigger: gebruiker initieert via knop. Veilig + spaart
 * OSRM-rate-limit.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function getHomeAdres() {
    return {
      postcode: ($("emp-postcode") && $("emp-postcode").value || "").trim(),
      huisnummer: ($("emp-huisnummer") && $("emp-huisnummer").value || "").trim(),
      toevoeging: ($("emp-toevoeging") && $("emp-toevoeging").value || "").trim(),
      plaats: ($("emp-plaats") && $("emp-plaats").value || "").trim(),
    };
  }

  function getFirstSelectedLocationName() {
    var chipsContainer = $("emp-loondienst-locaties-chips");
    if (chipsContainer) {
      var chips = chipsContainer.querySelectorAll(".emp-loc-chip");
      for (var i = 0; i < chips.length; i++) {
        var label = chips[i].cloneNode(true);
        // Verwijder × close-button uit text
        var btn = label.querySelector(".emp-loc-chip-remove");
        if (btn) btn.remove();
        var name = label.textContent.trim();
        if (name) return name;
      }
    }
    // Fallback: emp-locaties-chips (algemene locaties-veld)
    var alt = $("emp-locaties-chips");
    if (alt) {
      var chipsAlt = alt.querySelectorAll(".emp-loc-chip");
      for (var j = 0; j < chipsAlt.length; j++) {
        var lab = chipsAlt[j].cloneNode(true);
        var b = lab.querySelector(".emp-loc-chip-remove");
        if (b) b.remove();
        var n = lab.textContent.trim();
        if (n) return n;
      }
    }
    return null;
  }

  function findLocatieByName(name) {
    if (!name || !window.locatiesDB) return null;
    var all = (typeof window.locatiesDB.getAllSync === "function")
      ? window.locatiesDB.getAllSync() || []
      : [];
    var norm = String(name).toLowerCase().trim();
    return all.find(function (l) {
      return l && (String(l.naam || "").toLowerCase().trim() === norm);
    }) || null;
  }

  function showStatus(msg, kind) {
    var el = $("emp-geo-status");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("emp-geo-status--ok", "emp-geo-status--err", "emp-geo-status--info");
    if (kind === "ok") el.classList.add("emp-geo-status--ok");
    else if (kind === "err") el.classList.add("emp-geo-status--err");
    else el.classList.add("emp-geo-status--info");
    el.hidden = false;
  }

  async function onCalc() {
    var btn = $("emp-geo-calc-btn");
    if (!btn || !window.besaGeoDistance) return;
    var home = getHomeAdres();
    if (!home.postcode || !home.huisnummer) {
      showStatus("Vul eerst postcode en huisnummer in bij Thuisadres.", "err");
      return;
    }
    var locName = getFirstSelectedLocationName();
    if (!locName) {
      showStatus("Selecteer eerst een Loondienst-locatie waarvoor je de afstand wilt berekenen.", "err");
      return;
    }
    var locatie = findLocatieByName(locName);
    if (!locatie) {
      showStatus("Locatie '" + locName + "' niet gevonden in de locatie-database.", "err");
      return;
    }
    if (!locatie.postcode || !locatie.huisnummer) {
      showStatus("Locatie '" + locName + "' mist postcode of huisnummer — vul die eerst in via HR → Locaties.", "err");
      return;
    }

    btn.disabled = true;
    var oldLabel = btn.textContent;
    showStatus("Bezig met opzoeken (PDOK + OSRM)…", "info");

    var result = await window.besaGeoDistance.calculateEnkeleReis(
      home,
      {
        postcode: locatie.postcode,
        huisnummer: locatie.huisnummer,
        toevoeging: locatie.toevoeging || "",
        plaats: locatie.plaats || "",
      }
    );

    btn.disabled = false;
    btn.textContent = oldLabel;

    if (result && result.error) {
      showStatus(result.error, "err");
      return;
    }
    if (!result || !isFinite(result.km)) {
      showStatus("Berekening mislukt — controleer postcode + huisnummer.", "err");
      return;
    }
    var input = $("emp-location-distance");
    if (input) {
      input.value = String(result.km).replace(".", ",");
      // Trigger change-event zodat de save-section het oppakt
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    showStatus("Berekend: " + result.km + " km (enkele reis, " + (locatie.naam || locName) + "). Klik 'Wijzigingen opslaan' om te bevestigen.", "ok");
  }

  function wire() {
    var btn = $("emp-geo-calc-btn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      onCalc().catch(function (err) {
        showStatus("Onverwachte fout: " + (err && err.message || err), "err");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
