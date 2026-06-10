/* global window, document, navigator */
/**
 * km-checkin.js — GPS web-check-in widget (mobiliteitsmodule).
 *
 * Mount: plaats een element met id "km-checkin-mount" op de pagina. Dit script
 * bouwt daar een kaart met een "Inklokken op locatie"-knop. Bij klik:
 *   1) bepaalt de geplande dienst/werklocatie van vandaag (planning, naam-match);
 *   2) geocodeert die werklocatie (PDOK) → verwachte positie;
 *   3) vraagt de browser-GPS-positie (Geolocation API);
 *   4) berekent de afstand tot de werklocatie (Haversine);
 *   5) bepaalt status ok | afwijking | geen_locatie en slaat de check-in op.
 *
 * Vereist: profiles-data.js, medewerkers-data.js, planning-data.js,
 * locaties-data.js, geo-distance.js, km-checkin-data.js, save-feedback.js.
 */
(function (global) {
  "use strict";
  var doc = global.document;
  var DREMPEL_M = 350;        // binnen 350 m van de werklocatie = "ok"

  function todayIso() {
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function haversineM(a, b) {
    if (!a || !b || !isFinite(a.lat) || !isFinite(b.lat)) return null;
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var la1 = a.lat * toR, la2 = b.lat * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
  }

  function currentMedewerker() {
    var prof = null;
    try { prof = global.profilesDB && global.profilesDB.getCurrentSync && global.profilesDB.getCurrentSync(); } catch (e) { /* */ }
    var medId = prof ? (prof.medewerkerId || prof.medewerker_id || null) : null;
    var naam = "", mw = null;
    if (medId && global.medewerkersDB && global.medewerkersDB.getByIdSync) {
      mw = global.medewerkersDB.getByIdSync(medId);
    }
    if (mw) naam = ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim();
    return { profielId: prof ? prof.id : null, medewerkerId: medId, naam: naam };
  }

  // Geplande werklocatie van vandaag (naam-match planning.teamlid).
  function plannedLocatieNaamVandaag(naam) {
    if (!naam || !global.planningDB || !global.planningDB.getAllSync) return null;
    var t = todayIso();
    var rows = global.planningDB.getAllSync() || [];
    var lc = naam.toLowerCase().trim();
    var hit = null;
    rows.forEach(function (p) {
      if (!p || p.archived) return;
      var pl = String(p.teamlid || "").toLowerCase().trim();
      if (pl !== lc) return;
      var d = String(p.start || p.start_iso || "").slice(0, 10);
      if (d !== t) return;
      var loc = (p.locatie || p.vestiging || "").trim();
      if (loc && !hit) hit = loc;
    });
    return hit;
  }

  function findLocatieByNaam(naam) {
    if (!naam || !global.locatiesDB || !global.locatiesDB.getAllSync) return null;
    var lc = naam.toLowerCase().trim();
    var rows = global.locatiesDB.getAllSync() || [];
    return rows.find(function (l) { return l && String(l.naam || "").toLowerCase().trim() === lc; }) || null;
  }

  async function geocodeLocatie(loc) {
    if (!loc || !global.besaGeoDistance) return null;
    try {
      if (loc.postcode || loc.plaats) {
        var g = await global.besaGeoDistance.geocode({
          postcode: loc.postcode || "", huisnummer: loc.huisnummer || "",
          toevoeging: loc.toevoeging || "", plaats: loc.plaats || "",
        });
        if (g) return g;
      }
      var txt = [loc.straat, loc.huisnummer, loc.plaats].filter(Boolean).join(" ").trim() || loc.adres || loc.naam;
      if (txt && global.besaGeoDistance.geocodeText) return await global.besaGeoDistance.geocodeText(txt);
    } catch (e) { /* */ }
    return null;
  }

  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error("Geolocatie wordt niet ondersteund in deze browser.")); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve(pos); },
        function (err) { reject(err); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  function setStatus(elStatus, html, cls) {
    if (!elStatus) return;
    elStatus.innerHTML = html;
    elStatus.className = "km-checkin-status" + (cls ? " " + cls : "");
  }

  async function doCheckin(btn, elStatus) {
    var who = currentMedewerker();
    if (!who.medewerkerId) {
      setStatus(elStatus, "Geen medewerker aan je account gekoppeld — check-in is voor medewerkers met een rooster.", "km-checkin-status--err");
      return;
    }
    btn.disabled = true;
    setStatus(elStatus, "Locatie ophalen…", "km-checkin-status--busy");
    var pos;
    try { pos = await getPosition(); }
    catch (err) {
      var msg = (err && err.code === 1) ? "Toegang tot je locatie geweigerd. Sta locatie toe in de browser om in te klokken."
        : (err && err.code === 3) ? "Locatie ophalen duurde te lang. Probeer opnieuw."
        : "Locatie ophalen mislukt: " + ((err && err.message) || err);
      setStatus(elStatus, esc(msg), "km-checkin-status--err");
      btn.disabled = false;
      return;
    }
    var here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    var accuracy = pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null;

    setStatus(elStatus, "Werklocatie controleren…", "km-checkin-status--busy");
    var locNaam = plannedLocatieNaamVandaag(who.naam);
    var loc = locNaam ? findLocatieByNaam(locNaam) : null;
    var verwacht = loc ? await geocodeLocatie(loc) : null;
    var afstand = (verwacht ? haversineM(here, verwacht) : null);

    var status, melding, cls;
    if (!locNaam) {
      status = "geen_locatie";
      melding = "Geen geplande dienst voor vandaag gevonden — je positie is geregistreerd, maar er kon geen werklocatie worden gecontroleerd.";
      cls = "km-checkin-status--warn";
    } else if (verwacht == null) {
      status = "geen_locatie";
      melding = "Werklocatie <strong>" + esc(locNaam) + "</strong> kon niet op de kaart worden gevonden — controleer het adres in HR → Locaties. Je positie is wel geregistreerd.";
      cls = "km-checkin-status--warn";
    } else if (afstand != null && afstand <= DREMPEL_M) {
      status = "ok";
      melding = "Ingeklokt op <strong>" + esc(locNaam) + "</strong> — je bent op de juiste locatie (±" + afstand + " m).";
      cls = "km-checkin-status--ok";
    } else {
      status = "afwijking";
      melding = "Let op: je bent <strong>" + (afstand != null ? afstand + " m" : "ver") + "</strong> van <strong>" + esc(locNaam) + "</strong>. Je check-in is geregistreerd met een locatie-afwijking.";
      cls = "km-checkin-status--warn";
    }

    try {
      await global.kmCheckinDB.add({
        medewerkerId: who.medewerkerId, profielId: who.profielId, medewerkerNaam: who.naam,
        datum: todayIso(), lat: here.lat, lng: here.lng, accuracyM: accuracy,
        locatieId: loc ? loc.id : null, locatieNaam: locNaam || null,
        verwachtLat: verwacht ? verwacht.lat : null, verwachtLng: verwacht ? verwacht.lng : null,
        afstandTotLocatieM: afstand, status: status, bron: "web",
      });
      setStatus(elStatus, melding, cls);
      if (global.showActionFeedback && status === "ok") global.showActionFeedback("saved", "Check-in");
    } catch (err) {
      setStatus(elStatus, "Opslaan van de check-in mislukt: " + esc((err && err.message) || err), "km-checkin-status--err");
    } finally {
      btn.disabled = false;
    }
  }

  function build(mount) {
    if (!mount || mount.__kmCheckinBuilt) return;
    mount.__kmCheckinBuilt = true;
    var card = doc.createElement("section");
    card.className = "km-checkin-card";
    card.innerHTML =
      '<div class="km-checkin-head">' +
        '<span class="km-checkin-icon" aria-hidden="true">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</span>' +
        '<div class="km-checkin-text">' +
          '<h2 class="km-checkin-title">Inklokken op locatie</h2>' +
          '<p class="km-checkin-sub">Registreer je aanwezigheid met GPS. Het systeem controleert of je op je geplande werklocatie bent.</p>' +
        '</div>' +
        '<button type="button" class="btn-primary km-checkin-btn" id="km-checkin-btn">Inklokken</button>' +
      '</div>' +
      '<p class="km-checkin-status" id="km-checkin-status" role="status" aria-live="polite"></p>';
    mount.appendChild(card);
    var btn = card.querySelector("#km-checkin-btn");
    var st = card.querySelector("#km-checkin-status");
    if (btn) btn.addEventListener("click", function () { doCheckin(btn, st); });
  }

  function init() {
    var mount = doc.getElementById("km-checkin-mount");
    if (mount) build(mount);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();

  global.BesaKmCheckin = { mount: build };
})(window);
