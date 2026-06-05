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
 * HARDENING (PR #360) — voor max robuustheid op publieke OSRM-demo:
 *   - Caching: PDOK 30 dagen, OSRM 7 dagen in localStorage
 *   - Retry: 1× opnieuw na 2s bij 429 (rate-limit) of 5xx (server-error)
 *   - Foutmeldingen onderscheiden tussen: PDOK-faal / OSRM-faal / netwerk
 *
 * Public API:
 *   await window.besaGeoDistance.geocode({postcode, huisnummer, plaats})
 *     → {lat, lng, label} of null bij geen match
 *   await window.besaGeoDistance.routeKm(fromLatLng, toLatLng)
 *     → km (number) of null bij fout
 *   await window.besaGeoDistance.calculateEnkeleReis(home, location)
 *     → {km, home, location} of {error: "..."}
 *   window.besaGeoDistance.clearCache()
 *     → wist localStorage geocode + route cache (debug)
 */
(function () {
  "use strict";

  var PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
  var OSRM = "https://router.project-osrm.org/route/v1/driving";
  var CACHE_KEY_GEO = "besa_geo_pdok_cache_v1";
  var CACHE_KEY_OSRM = "besa_geo_osrm_cache_v1";
  var TTL_GEO_MS = 30 * 24 * 3600 * 1000;  // 30 dagen
  var TTL_OSRM_MS = 7 * 24 * 3600 * 1000;  // 7 dagen
  var RETRY_DELAY_MS = 2000;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function pickStr(o, key) {
    if (!o) return "";
    var v = o[key];
    return v == null ? "" : String(v).trim();
  }

  function parseCentroide(point) {
    if (!point) return null;
    var m = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(String(point));
    if (!m) return null;
    var lng = Number(m[1]), lat = Number(m[2]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }

  function readCache(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeCache(key, cache) {
    try { window.localStorage.setItem(key, JSON.stringify(cache || {})); } catch (e) { /* quota */ }
  }
  function cacheGet(key, cacheKey, ttlMs) {
    var cache = readCache(cacheKey);
    var entry = cache[key];
    if (!entry || !entry.t || !entry.v) return null;
    if (Date.now() - entry.t > ttlMs) return null;
    return entry.v;
  }
  function cacheSet(key, cacheKey, value) {
    var cache = readCache(cacheKey);
    cache[key] = { t: Date.now(), v: value };
    // Cap cache-grootte op 500 entries (LRU-achtig: drop oudste)
    var keys = Object.keys(cache);
    if (keys.length > 500) {
      keys.sort(function (a, b) { return (cache[a].t || 0) - (cache[b].t || 0); });
      for (var i = 0; i < keys.length - 500; i++) delete cache[keys[i]];
    }
    writeCache(cacheKey, cache);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Fetch met retry: 1× opnieuw bij 429 of 5xx na RETRY_DELAY_MS.
   * Netwerk-errors retry'en ook 1×. 4xx (behalve 429) faalt direct.
   */
  async function fetchWithRetry(url, label) {
    var attempt = 0;
    var lastErr = null;
    while (attempt < 2) {
      attempt++;
      try {
        var res = await fetch(url, { method: "GET" });
        if (res.ok) return res;
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(label + " HTTP " + res.status + " (poging " + attempt + ")");
          if (attempt < 2) { await sleep(RETRY_DELAY_MS); continue; }
          throw lastErr;
        }
        // 4xx (niet 429) = fatale fout, niet retryen
        throw new Error(label + " HTTP " + res.status);
      } catch (err) {
        lastErr = err;
        // Netwerk-error (fetch reject) — ook 1× retry
        var msg = (err && err.message) || String(err);
        if (attempt < 2 && /Failed to fetch|NetworkError|TypeError/.test(msg)) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error(label + " onbekende fout");
  }

  // ---------------------------------------------------------------------------
  // Public: geocode
  // ---------------------------------------------------------------------------
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
    var cacheKey = q.toLowerCase();
    var cached = cacheGet(cacheKey, CACHE_KEY_GEO, TTL_GEO_MS);
    if (cached) return cached;

    var url = PDOK + "?q=" + encodeURIComponent(q) + "&fq=type:adres&rows=1";
    var res = await fetchWithRetry(url, "PDOK");
    var data = await res.json();
    var doc = data && data.response && Array.isArray(data.response.docs) ? data.response.docs[0] : null;
    if (!doc) return null;
    var ll = parseCentroide(doc.centroide_ll);
    if (!ll) return null;
    var value = { lat: ll.lat, lng: ll.lng, label: doc.weergavenaam || q };
    cacheSet(cacheKey, CACHE_KEY_GEO, value);
    return value;
  }

  // ---------------------------------------------------------------------------
  // Public: routeKm
  // ---------------------------------------------------------------------------
  async function routeKm(from, to) {
    if (!from || !to || !isFinite(from.lat) || !isFinite(to.lat)) return null;
    // Cache-key op 5 decimals (~1m precisie — voldoende voor routing)
    var ck = from.lat.toFixed(5) + "," + from.lng.toFixed(5) + ";" + to.lat.toFixed(5) + "," + to.lng.toFixed(5);
    var cached = cacheGet(ck, CACHE_KEY_OSRM, TTL_OSRM_MS);
    if (cached != null) return cached;

    var url = OSRM + "/" + from.lng + "," + from.lat + ";" + to.lng + "," + to.lat + "?overview=false";
    var res = await fetchWithRetry(url, "OSRM");
    var data = await res.json();
    if (!data || !Array.isArray(data.routes) || !data.routes[0]) return null;
    var meters = Number(data.routes[0].distance);
    if (!isFinite(meters) || meters < 0) return null;
    var km = Math.round(meters / 100) / 10;
    cacheSet(ck, CACHE_KEY_OSRM, km);
    return km;
  }

  // ---------------------------------------------------------------------------
  // High-level: bereken enkele reis met onderscheidende foutmeldingen
  // ---------------------------------------------------------------------------
  async function calculateEnkeleReis(home, location) {
    var h;
    try {
      h = await geocode(home);
    } catch (err) {
      return {
        error: "Thuisadres opzoeken mislukt (PDOK): " + ((err && err.message) || err)
          + ". Probeer over een minuut opnieuw, of vul handmatig in."
      };
    }
    if (!h) return { error: "Thuisadres niet gevonden in PDOK (controleer postcode + huisnummer)." };

    var l;
    try {
      l = await geocode(location);
    } catch (err) {
      return {
        error: "Locatie-adres opzoeken mislukt (PDOK): " + ((err && err.message) || err)
          + ". Probeer over een minuut opnieuw, of vul handmatig in."
      };
    }
    if (!l) return { error: "Locatie-adres niet gevonden in PDOK (controleer postcode + huisnummer in HR → Locaties)." };

    var km;
    try {
      km = await routeKm(h, l);
    } catch (err) {
      return {
        error: "Route-berekening mislukt (OSRM publieke server): " + ((err && err.message) || err)
          + ". Server is mogelijk tijdelijk overbelast. Probeer over een minuut opnieuw, of vul handmatig in."
      };
    }
    if (km == null) return { error: "Route kon niet berekend worden tussen deze 2 adressen." };
    return { km: km, home: h, location: l };
  }

  // ---------------------------------------------------------------------------
  // Public: lookupAdres — postcode + huisnummer → straat + woonplaats
  // Voor automatisch invullen van adresformulieren (straat/plaats). Hergebruikt
  // dezelfde PDOK-cache + retry als geocode(). Geeft ook lat/lng/label terug.
  // ---------------------------------------------------------------------------
  async function lookupAdres(adres) {
    var postcode = pickStr(adres, "postcode").replace(/\s+/g, "").toUpperCase();
    var huisnr = pickStr(adres, "huisnummer");
    if (!postcode || !huisnr) return null;
    var q = postcode + " " + huisnr;
    var cacheKey = "adr:" + q.toLowerCase();
    var cached = cacheGet(cacheKey, CACHE_KEY_GEO, TTL_GEO_MS);
    if (cached) return cached;

    var url = PDOK + "?q=" + encodeURIComponent(q) + "&fq=type:adres&rows=1";
    var res = await fetchWithRetry(url, "PDOK");
    var data = await res.json();
    var doc = data && data.response && Array.isArray(data.response.docs) ? data.response.docs[0] : null;
    if (!doc) return null;
    // PDOK free-text matcht fuzzy: een onzin-postcode levert tóch het "beste"
    // adres. Accepteer alleen als de gevonden postcode exact die van de invoer is.
    var gevondenPc = pickStr(doc, "postcode").replace(/\s+/g, "").toUpperCase();
    if (gevondenPc !== postcode) return null;
    var straat = pickStr(doc, "straatnaam");
    var plaats = pickStr(doc, "woonplaatsnaam");
    if (!straat && !plaats) return null;
    var ll = parseCentroide(doc.centroide_ll);
    var value = {
      straat: straat,
      plaats: plaats,
      postcode: pickStr(doc, "postcode"),
      huisnummer: pickStr(doc, "huisnummer"),
      gemeente: pickStr(doc, "gemeentenaam"),
      label: pickStr(doc, "weergavenaam") || q,
      lat: ll ? ll.lat : null,
      lng: ll ? ll.lng : null,
    };
    cacheSet(cacheKey, CACHE_KEY_GEO, value);
    return value;
  }

  function clearCache() {
    try { window.localStorage.removeItem(CACHE_KEY_GEO); } catch (e) {}
    try { window.localStorage.removeItem(CACHE_KEY_OSRM); } catch (e) {}
  }

  window.besaGeoDistance = {
    geocode: geocode,
    lookupAdres: lookupAdres,
    routeKm: routeKm,
    calculateEnkeleReis: calculateEnkeleReis,
    clearCache: clearCache,
  };
})();
