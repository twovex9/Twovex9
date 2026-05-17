/* ============================================================================
 * BS2 FACTUREN — RECORDER  v1
 *
 * Doel: de hele Facturen-module 1-op-1 van BS2 naar BS1 verifiëren/overnemen.
 * In BS2 kun je facturen bereiken via **Cliënten → Facturen**, maar ook
 * rechtstreeks bovenaan via **Facturen** — daar zitten de tabs
 * **Te beoordelen** en **Alle facturen**. Deze recorder vangt PASSIEF élke
 * /api/-call op die BS2 zélf doet terwijl jij door de Facturen-module klikt
 * — inclusief de lijst, de tabs, het doorklikken op een factuur, het
 * beoordelen/afkeuren, en de berekeningen/totalen. Zo leren we de exacte
 * endpoints + krijgen we de volledige data + de echte rekenlogica.
 * Niets wordt naar BS2 geschreven; puur observeren (STAP 1+2 van de
 * overname-methodiek).
 *
 * GEBRUIK:
 *  1. BS2: klik bovenaan op **Facturen** (de directe topbar-knop, niet via
 *     Cliënten). Je ziet de tabs **Te beoordelen** en **Alle facturen**.
 *  2. F12 → Console → plak dit volledig → Enter → "[fac] GEWAPEND".
 *  3. Klik nu RUSTIG door ALLES (bij elke call zie je een groene
 *     "[fac] ✓"-regel):
 *       a. Tab **Te beoordelen**: hele lijst, wissel 'rijen per pagina',
 *          blader álle pagina's, gebruik élk filter/zoekveld/sortering
 *          bovenaan.
 *       b. Tab **Alle facturen**: idem — hele lijst, paginatie, filters,
 *          sortering, zoeken, status-filters.
 *       c. Klik op een FACTUUR → open het detail; bekijk élke sectie/tab
 *          (regels, bedragen, btw/totaal-berekening, status, historie,
 *          bijlagen, beschikking-koppeling). Doe dit voor 3-4
 *          verschillende facturen met VERSCHILLENDE status.
 *       d. Doorloop de **beoordelen**-flow op een te-beoordelen factuur
 *          (goedkeuren/afkeuren/opmerking) zodat we die call + payload
 *          zien — kies een TEST-factuur; je kunt het daarna terugzetten.
 *       e. Open ook 1-2 facturen via **Cliënten → (cliënt) → Facturen**
 *          zodat we zien dat het dezelfde endpoints zijn.
 *  4. Typ:  __facDump()  → bs2-facturen.json wordt gedownload.
 *     Stuur dat bestand naar Claude.
 *
 * Zie je na een klik GEEN nieuwe groene regel terwijl er wél iets inlaadt?
 * Zeg dat tegen Claude — dan rekent/rendert BS2 het anders en passen we
 * de aanpak aan.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2FacRec) { console.log("[fac] al actief — herlaad de pagina om opnieuw te starten."); return; }
  window.__bs2FacRec = true;

  var REC = [];
  var ENDPOINTS = {};
  var _fetch = window.fetch;

  function relevant(url) {
    return !!url && /\/api\//.test(String(url));
  }
  function pathOf(u) {
    try { var x = new URL(u, location.origin); return x.pathname; }
    catch (e) { return String(u).split("?")[0]; }
  }
  function logRec(e) {
    var qs = e.url.indexOf("?") >= 0 ? e.url.slice(e.url.indexOf("?")) : "";
    console.log("%c[fac] ✓ " + e.method + " " + e.path + qs
      + (e.reqBody ? "  body=" + String(JSON.stringify(e.reqBody)).slice(0, 140) : "")
      + "  → HTTP " + e.status, "color:green");
  }
  function push(method, url, reqBody, status, respText) {
    var e = {
      t: new Date().toISOString(),
      method: String(method || "GET").toUpperCase(),
      url: String(url),
      path: pathOf(url),
      reqBody: reqBody == null ? null : (function () {
        try { return JSON.parse(reqBody); } catch (x) { return String(reqBody).slice(0, 4000); }
      })(),
      status: status,
      resp: (function () {
        try { return JSON.parse(respText); } catch (x) { return String(respText || "").slice(0, 40000); }
      })(),
    };
    REC.push(e);
    ENDPOINTS[e.method + " " + e.path] = (ENDPOINTS[e.method + " " + e.path] || 0) + 1;
    logRec(e);
  }

  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var method = (init && init.method) || (input && input.method) || "GET";
    var body = (init && init.body) || null;
    var p = _fetch.apply(this, arguments);
    if (relevant(url)) {
      p.then(function (res) {
        try {
          res.clone().text().then(function (txt) {
            push(method, url, body, res.status, txt);
          }).catch(function () {});
        } catch (x) {}
        return res;
      }).catch(function () {});
    }
    return p;
  };

  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__fm = m; this.__fu = u;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (b) {
    var xhr = this;
    try {
      if (relevant(xhr.__fu)) {
        xhr.addEventListener("load", function () {
          try { push(xhr.__fm, xhr.__fu, b == null ? null : b, xhr.status, xhr.responseText); }
          catch (x) {}
        });
      }
    } catch (x) {}
    return _send.apply(this, arguments);
  };

  window.__facDump = function () {
    if (!REC.length) {
      console.warn("%c[fac] Nog NIETS opgevangen. Klik door de Facturen-module; "
        + "verschijnt er niets, meld dit aan Claude.", "color:#b45309;font-weight:bold");
      return;
    }
    var payload = {
      captured_at: new Date().toISOString(),
      source: "BS2 facturen recorder v1",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-facturen.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[fac] KLAAR ✓ — " + REC.length + " calls, "
      + Object.keys(ENDPOINTS).length + " unieke endpoints in bs2-facturen.json. "
      + "Stuur dat bestand naar Claude.", "color:green;font-weight:bold");
    console.log("[fac] endpoints:", ENDPOINTS);
  };

  console.log("%c[fac] GEWAPEND — recorder actief. Klik nu rustig door Facturen "
    + "(Te beoordelen + Alle facturen + factuur-detail + beoordelen-flow); "
    + "typ daarna  __facDump()", "color:#2563eb;font-weight:bold");
})();
