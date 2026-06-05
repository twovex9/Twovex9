/* global window, document */
/**
 * besa-adres-autofill.js — postcode + huisnummer → straat + plaats automatisch.
 *
 * Bij invoer van een geldige NL-postcode (1234 AB) + huisnummer wordt via de
 * PDOK Locatieserver (Kadaster/BZK — gratis, geen API-key) de straatnaam en
 * woonplaats opgehaald en in de straat/plaats-velden gezet. Hergebruikt de
 * cache/retry-infrastructuur van geo-distance.js
 * (window.besaGeoDistance.lookupAdres). Geen aparte data-laag.
 *
 * Werkt declaratief op een vaste registry van bekende adres-veldsets. Triggert
 * ALLEEN op echte gebruikersinvoer (input/blur). Programmatic .value (hydrate
 * van een bestaand record) vuurt geen input-event en wordt dus nooit
 * overschreven. Bij geen-match of fout blijven bestaande waarden onaangeroerd.
 *
 * Public API:
 *   window.besaAdresAutofill.attach({postcode, huisnummer, straat, plaats})
 *     — element-id's; wired één veldset (idempotent, no-op bij ontbrekende velden)
 *   window.besaAdresAutofill.init() — (her)scan de registry op de pagina
 */
(function () {
  "use strict";

  // NL-postcode: 4 cijfers (niet met 0 beginnend) + 2 letters, spatie optioneel.
  var POSTCODE_RE = /^[1-9][0-9]{3}\s*[A-Za-z]{2}$/;
  var DEBOUNCE_MS = 550;
  var STYLE_ID = "besa-adres-autofill-style";

  // Bekende adres-veldsets in de besa-suite (statische HTML). Een set wordt
  // alleen gewired als al z'n velden op de pagina aanwezig zijn.
  var REGISTRY = [
    // medewerker.html — thuisadres
    { postcode: "emp-postcode",          huisnummer: "emp-huisnummer",          straat: "emp-straat",          plaats: "emp-plaats" },
    // medewerker.html — inhuuradres
    { postcode: "emp-inhuur-postcode",   huisnummer: "emp-inhuur-huisnummer",   straat: "emp-inhuur-straat",   plaats: "emp-inhuur-stad" },
    // hr.html — medewerker toevoegen (modal)
    { postcode: "employee-add-postcode", huisnummer: "employee-add-huisnummer", straat: "employee-add-straat", plaats: "employee-add-plaats" },
    // locatie-detail.html — locatie-adres
    { postcode: "loc-detail-postcode",   huisnummer: "loc-detail-huisnummer",   straat: "loc-detail-straat",   plaats: "loc-detail-plaats" },
    // locaties.html — locatie toevoegen (modal)
    { postcode: "loc-add-postcode",      huisnummer: "loc-add-huisnummer",      straat: "loc-add-straat",      plaats: "loc-add-plaats" }
  ];

  function $(id) { return document.getElementById(id); }
  function norm(v) { return (v == null ? "" : String(v)).trim(); }
  function normPostcode(v) { return norm(v).replace(/\s+/g, "").toUpperCase(); }
  function validPostcode(v) { return POSTCODE_RE.test(norm(v)); }

  function buildLabel(r) {
    var s = norm(r.straat), p = norm(r.plaats);
    if (s && p) return s + ", " + p;
    return s || p;
  }

  // PDOK-lookup via geo-distance.js (cache + retry). Geen fallback-dataPad:
  // geo-distance.js is een lokaal script dat naast deze module geladen wordt.
  async function lookup(postcode, huisnummer) {
    if (window.besaGeoDistance && typeof window.besaGeoDistance.lookupAdres === "function") {
      return window.besaGeoDistance.lookupAdres({ postcode: postcode, huisnummer: huisnummer });
    }
    throw new Error("besaGeoDistance.lookupAdres niet beschikbaar (geo-distance.js niet geladen)");
  }

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".besa-adres-status{display:block;margin:6px 2px 0;font-size:12px;line-height:1.45;" +
        "color:var(--text-muted,#737373);min-height:1em;}" +
      ".besa-adres-status:empty{display:none;}" +
      ".besa-adres-status.is-ok{color:var(--bas-ok,#15803d);}" +
      ".besa-adres-status.is-err{color:var(--bas-err,#b45309);}" +
      ".besa-adres-status .bas-spin{display:inline-block;width:11px;height:11px;" +
        "margin-right:6px;vertical-align:-1px;border:2px solid currentColor;" +
        "border-right-color:transparent;border-radius:50%;animation:bas-spin .7s linear infinite;}" +
      "@keyframes bas-spin{to{transform:rotate(360deg)}}" +
      ":root{--bas-ok:#15803d;--bas-err:#b45309;}" +
      "[data-theme=\"dark\"]{--bas-ok:#4ade80;--bas-err:#fbbf24;}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function setStatus(el, kind, text, withSpinner) {
    if (!el) return;
    el.className = "besa-adres-status" + (kind ? " is-" + kind : "");
    el.textContent = "";
    if (withSpinner) {
      var sp = document.createElement("span");
      sp.className = "bas-spin";
      el.appendChild(sp);
    }
    if (text) el.appendChild(document.createTextNode(text));
  }

  // Status-regel net ná de adres-rij/-veld plaatsen (full-width onder het blok).
  function makeStatusEl(plaatsEl) {
    var status = document.createElement("div");
    status.className = "besa-adres-status";
    status.setAttribute("aria-live", "polite");
    var anchor =
      plaatsEl.closest(".emp-address-grid,.loc-addr-grid") ||
      plaatsEl.closest(".modal-field,.emp-verzuim-modal-field") ||
      plaatsEl.closest("label,.emp-field") ||
      plaatsEl;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(status, anchor.nextSibling);
    } else if (plaatsEl.parentNode) {
      plaatsEl.parentNode.appendChild(status);
    }
    return status;
  }

  function setVal(el, value) {
    if (!el) return;
    if (norm(el.value) === norm(value)) return;
    el.value = value;
    // Laat pagina-logica (dirty-tracking/validatie) de wijziging oppikken.
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { /* */ }
    try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { /* */ }
  }

  function attach(cfg) {
    var pc = $(cfg.postcode), hn = $(cfg.huisnummer), st = $(cfg.straat), pl = $(cfg.plaats);
    if (!pc || !hn || !st || !pl) return false;          // formulier niet (volledig) aanwezig
    if (pc.getAttribute("data-bas-wired") === "1") return true;  // idempotent
    pc.setAttribute("data-bas-wired", "1");

    injectStyleOnce();
    var status = makeStatusEl(pl);

    var timer = null;
    var lastQuery = "";

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    }
    function runNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      run();
    }

    async function run() {
      var pcv = norm(pc.value), hnv = norm(hn.value);
      if (!validPostcode(pcv) || !hnv) {
        setStatus(status, "", "");   // onvolledig — geen melding
        lastQuery = "";
        return;
      }
      var key = normPostcode(pcv) + "|" + hnv.toLowerCase();
      if (key === lastQuery) return; // al opgehaald voor deze combinatie
      lastQuery = key;
      setStatus(status, "", "Adres opzoeken…", true);

      var result = null, errored = false;
      try {
        result = await lookup(pcv, hnv);
      } catch (e) {
        errored = true;
      }
      if (key !== lastQuery) return; // gebruiker typte intussen verder — verwerp

      if (errored) {
        lastQuery = ""; // transient — sta nieuwe poging toe
        setStatus(status, "err", "Adres opzoeken mislukt — controleer je verbinding of vul handmatig in.");
        return;
      }
      if (result && (result.straat || result.plaats)) {
        if (result.straat) setVal(st, result.straat);
        if (result.plaats) setVal(pl, result.plaats);
        setStatus(status, "ok", "✓ " + buildLabel(result));
      } else {
        setStatus(status, "err", "Geen adres gevonden — vul straat en plaats handmatig in.");
      }
    }

    pc.addEventListener("input", schedule);
    hn.addEventListener("input", schedule);
    pc.addEventListener("blur", runNow);
    hn.addEventListener("blur", runNow);
    return true;
  }

  function init() {
    injectStyleOnce();
    for (var i = 0; i < REGISTRY.length; i++) {
      try { attach(REGISTRY[i]); } catch (e) { /* per-set isolatie */ }
    }
  }

  window.besaAdresAutofill = { attach: attach, init: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
