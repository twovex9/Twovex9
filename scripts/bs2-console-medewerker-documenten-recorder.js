/* ============================================================================
 * BS2 MEDEWERKER-DOCUMENTEN — RECORDER  v1   (STRIKT READ-ONLY)
 *
 * Doel: ontdekken via welke endpoint(s) BS2 de PERSOONLIJKE DOCUMENTEN
 * (PDF's) per medewerker oplevert, zodat we ze 1-op-1 naar BS1 kunnen
 * overzetten en koppelen aan de juiste medewerker.
 *
 * Deze recorder is 100% PASSIEF: hij patcht window.fetch + XMLHttpRequest
 * alleen om élke /api/-call die BS2 ZÉLF doet te LOGGEN terwijl jij
 * rondklikt. Hij stuurt NOOIT eigen requests, wijzigt NIETS en verwijdert
 * NIETS op BS2. Puur observeren — conform de hardcore-regel "op BS2 alleen
 * bekijken".
 *
 * GEBRUIK (productie BS2, jouw eigen sessie):
 *  1. Log normaal in op BESA Suite 2.
 *  2. Ga naar  HR → Medewerkers  (de medewerkerslijst).
 *  3. F12 → tabblad "Console" → plak dit HELE script → Enter.
 *     Je ziet blauw: "[mwdoc] GEWAPEND".
 *  4. Klik nu RUSTIG (bij elke call verschijnt groen "[mwdoc] ✓"):
 *       a. Open een medewerker (klik op de rij/naam).
 *       b. Klik bovenaan op het tabblad **Documenten**.
 *       c. Als er een document/PDF in de lijst staat: klik erop om het
 *          te bekijken/openen (zodat we de download-URL van het bestand
 *          zien). Sluit het weer — niets wijzigen of verwijderen.
 *       d. Ga terug en doe stap a-c voor nog **2 à 3 andere
 *          medewerkers** (liefst eentje met meerdere documenten en
 *          eentje zonder, zodat we beide gevallen zien).
 *  5. Typ in de console:   __mwDocDump()   en Enter.
 *     Het bestand  bs2-medewerker-documenten.json  wordt gedownload.
 *  6. Stuur dat bestand naar Claude.
 *
 * Zie je na een klik GEEN nieuwe groene regel terwijl er wél iets
 * inlaadt? Meld dat — dan haalt BS2 het anders op en passen we het script
 * aan. Niets op BS2 wordt gewijzigd; je klikt alleen om te bekijken.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2MwDocRec) { console.log("[mwdoc] al actief — herlaad de pagina om opnieuw te starten."); return; }
  window.__bs2MwDocRec = true;

  var REC = [];
  var ENDPOINTS = {};
  var _fetch = window.fetch;

  function relevant(url) { return !!url && /\/api\//.test(String(url)); }
  function pathOf(u) {
    try { return new URL(u, location.origin).pathname; }
    catch (e) { return String(u).split("?")[0]; }
  }
  function logRec(e) {
    var qs = e.url.indexOf("?") >= 0 ? e.url.slice(e.url.indexOf("?")) : "";
    console.log("%c[mwdoc] ✓ " + e.method + " " + e.path + qs
      + (e.reqBody ? "  body=" + String(JSON.stringify(e.reqBody)).slice(0, 160) : "")
      + "  → HTTP " + e.status, "color:green");
  }
  function push(method, url, reqBody, status, respText) {
    var e = {
      t: new Date().toISOString(),
      method: String(method || "GET").toUpperCase(),
      url: String(url),
      path: pathOf(url),
      reqBody: reqBody == null ? null : (function () {
        try { return JSON.parse(reqBody); } catch (x) { return String(reqBody).slice(0, 6000); }
      })(),
      status: status,
      resp: (function () {
        try { return JSON.parse(respText); } catch (x) { return String(respText || "").slice(0, 60000); }
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
          res.clone().text().then(function (txt) { push(method, url, body, res.status, txt); })
            .catch(function () {});
        } catch (x) {}
        return res;
      }).catch(function () {});
    }
    return p;
  };

  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__tm = m; this.__tu = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var xhr = this;
    try {
      if (relevant(xhr.__tu)) {
        xhr.addEventListener("load", function () {
          try { push(xhr.__tm, xhr.__tu, b == null ? null : b, xhr.status, xhr.responseText); }
          catch (x) {}
        });
      }
    } catch (x) {}
    return _send.apply(this, arguments);
  };

  window.__mwDocDump = function () {
    if (!REC.length) {
      console.warn("%c[mwdoc] Nog NIETS opgevangen. Open een medewerker en klik het "
        + "Documenten-tabblad; verschijnt er niets, meld dit aan Claude.", "color:#b45309;font-weight:bold");
      return;
    }
    var payload = {
      captured_at: new Date().toISOString(),
      source: "BS2 medewerker-documenten recorder v1",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-medewerker-documenten.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[mwdoc] KLAAR ✓ — " + REC.length + " calls, "
      + Object.keys(ENDPOINTS).length + " unieke endpoints in bs2-medewerker-documenten.json. "
      + "Stuur dat bestand naar Claude.", "color:green;font-weight:bold");
    console.log("[mwdoc] endpoints:", ENDPOINTS);
  };

  console.log("%c[mwdoc] GEWAPEND — read-only recorder actief. Open een paar "
    + "medewerkers → tab Documenten (klik evt. een PDF om te bekijken); "
    + "typ daarna  __mwDocDump()", "color:#2563eb;font-weight:bold");
})();
