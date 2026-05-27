/* global window */
/**
 * geo-distance.js — woon-werk afstand auto-berekening via PDOK + OSRM.
 *
 * Beide diensten zijn gratis en vereisen geen API-key:
 *   - PDOK Locatieserver (Kadaster/BZK): postcode + huisnummer → coördinaten
 *     https://api.pdok.nl/bzk/locatieserver/search/v3_1/free
 *   - OSRM publiek demo: 2 coördinaten → reisafstand in km
 *     https://router.project-osrm.org/route/v1/driving/...
 *
 * Beide zijn rate-limited (~1 req/s op OSRM-demo). Voor productie met >50
 * gelijktijdige berekeningen is een eigen OSRM-server aanbevolen. Voor de
 * ETF use-case (HR vult per medewerker handmatig de knop in) ruim genoeg.
 *
 * Public API:
 *   await window.besaGeoDistance.geocode({postcode, huisnummer, plaats})
 *     → {lat, lng, label} of null bij geen match
 *   await window.besaGeoDistance.routeKm(fromLatLng, toLatLng)
 *     → km (number) of null bij fout
 *   await window.besaGeoDistance.calculateEnkeleReis(home, location)
 *     → km (afgerond op 0.1) of {error: "..."}
 */
(function () {
  "use strict";

  var PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
  var OSRM = "https://router.project-osrm.org/route/v1/driving";

  function pickStr(o, key) {
    if (!o) return "";
    var v = o[key];
    return v == null ? "" : String(v).trim();
  }

  function parseCentroide(point) {
    // PDOK levert "POINT(4.9041 52.3676)" — lng eerst, dan lat
    if (!point) return null;
    var m = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(String(point));
    if (!m) return null;
    var lng = Number(m[1]), lat = Number(m[2]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }

  async function geocode(adres) {
    var postcode = pickStr(adres, "postcode").replace(/\s+/g, "").toUpperCase();
    var huisnr = pickStr(adres, "huisnummer");
    var toevoeging = pickStr(adres, "toevoeging");
    var plaats = pickStr(adres, "plaats");
    if (!postcode && !plaats) return null;
    var qParts = [];
    if (postcode) qParts.push(postcode);
    if (huisnr) qParts.push(huisnr + (toevoeging ? toevoeging : ""));
    if (plaats) qParts.push(plaats);
    var q = qParts.join(" ").trim();
    if (!q) return null;
    var url = PDOK + "?q=" + encodeURIComponent(q) + "&fq=type:adres&rows=1";
    var res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("PDOK HTTP " + res.status);
    var data = await res.json();
    var doc = data && data.response && Array.isArray(data.response.docs) ? data.response.docs[0] : null;
    if (!doc) return null;
    var ll = parseCentroide(doc.centroide_ll);
    if (!ll) return null;
    return { lat: ll.lat, lng: ll.lng, label: doc.weergavenaam || q };
  }

  async function routeKm(from, to) {
    if (!from || !to || !isFinite(from.lat) || !isFinite(to.lat)) return null;
    var url = OSRM + "/" + from.lng + "," + from.lat + ";" + to.lng + "," + to.lat + "?overview=false";
    var res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("OSRM HTTP " + res.status);
    var data = await res.json();
    if (!data || !Array.isArray(data.routes) || !data.routes[0]) return null;
    var meters = Number(data.routes[0].distance);
    if (!isFinite(meters) || meters < 0) return null;
    return Math.round(meters / 100) / 10; // 1 decimal km
  }

  /**
   * High-level: bereken enkele reis-afstand tussen medewerker-thuisadres en
   * locatie-adres. Beide moeten {postcode, huisnummer, plaats} hebben (extra
   * velden toevoeging/straat optioneel).
   */
  async function calculateEnkeleReis(home, location) {
    try {
      var h = await geocode(home);
      if (!h) return { error: "Thuisadres niet gevonden (controleer postcode + huisnummer)" };
      var l = await geocode(location);
      if (!l) return { error: "Locatie-adres niet gevonden in PDOK" };
      var km = await routeKm(h, l);
      if (km == null) return { error: "Route kon niet berekend worden" };
      return { km: km, home: h, location: l };
    } catch (err) {
      return { error: (err && err.message) || String(err) };
    }
  }

  window.besaGeoDistance = {
    geocode: geocode,
    routeKm: routeKm,
    calculateEnkeleReis: calculateEnkeleReis,
  };
})();
