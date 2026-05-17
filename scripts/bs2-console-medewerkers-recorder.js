/* ============================================================================
 * BS2 MEDEWERKERS (top-bar) — RECORDER  v1
 *
 * Doel: de hele top-bar **Medewerkers**-module (BS2-pagina
 * /main-employee/employees) 1-op-1 van BS2 naar BS1 overnemen —
 * productie-klaar (werkt vóór én achter de schermen). Dit is een APART
 * systeem naast HR → Medewerkers; de bestaande HR-medewerkers blijven
 * ongemoeid.
 *
 * Deze recorder vangt PASSIEF élke /api/-call op die BS2 zélf doet
 * terwijl jij door Medewerkers klikt — incl. de lijst, paginatie, tabs,
 * filters, en de volledige CREATE/EDIT/ARCHIVEREN/HERSTELLEN/VERWIJDEREN-
 * payloads (POST/PATCH/PUT/DELETE). Zo leren we de exacte endpoints +
 * gedrag + berekeningen. Niets wordt buiten jouw eigen klikken om naar
 * BS2 geschreven; puur observeren (STAP 1+2 van de overname-methodiek).
 *
 * GEBRUIK:
 *  1. BS2: klik bovenaan in de top-bar op **Medewerkers**
 *     (je staat op /main-employee/employees).
 *  2. F12 → Console → plak dit volledig → Enter → "[mw] GEWAPEND".
 *  3. Klik nu RUSTIG door ALLES (bij elke call zie je groen "[mw] ✓"):
 *       a. De volledige lijst — klik door ÉLKE paginatie-pagina
 *          (volgende → volgende → … tot de laatste), zodat we alle
 *          medewerkers vangen. Wissel ook de "aantal per pagina" als die
 *          er is.
 *       b. Élk filter / tab / zoekveld / sorteer-optie / gearchiveerd-
 *          toggle / kolomkiezer / elke dropdown — zet ze één voor één
 *          aan én weer uit (ook "Reset"/"Filters wissen").
 *       c. Open een medewerker (detail) → klik door ÁLLE detail-tabs en
 *          secties (gegevens, professioneel, opleiding, notities,
 *          documenten, verzuim, verlof, en wat er verder is).
 *       d. **+ Medewerker toevoegen** → maak een TEST-medewerker volledig
 *          aan met de naam/voornaam **ZZZ-CLAUDE-TEST-2026-05-17** →
 *          opslaan.
 *       e. Open die test-medewerker → bewerk 'm (wijzig een paar velden)
 *          → archiveer + herstel → verwijder de TEST-medewerker weer.
 *       f. Doe stap c voor 2 verschillende medewerkers (zodat we alle
 *          tab-payloads zien).
 *  4. Typ:  __mwDump()  → bs2-medewerkers.json wordt gedownload.
 *     Stuur dat bestand naar Claude.
 *
 * Zie je na een klik GEEN nieuwe groene regel terwijl er wél iets
 * inlaadt? Meld dat aan Claude — dan rekent/rendert BS2 het anders.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2MwRec) { console.log("[mw] al actief — herlaad de pagina om opnieuw te starten."); return; }
  window.__bs2MwRec = true;

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
    console.log("%c[mw] ✓ " + e.method + " " + e.path + qs
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

  window.__mwDump = function () {
    if (!REC.length) {
      console.warn("%c[mw] Nog NIETS opgevangen. Klik door de Medewerkers-module; "
        + "verschijnt er niets, meld dit aan Claude.", "color:#b45309;font-weight:bold");
      return;
    }
    var payload = {
      captured_at: new Date().toISOString(),
      source: "BS2 medewerkers (top-bar /main-employee/employees) recorder v1",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-medewerkers.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[mw] KLAAR ✓ — " + REC.length + " calls, "
      + Object.keys(ENDPOINTS).length + " unieke endpoints in bs2-medewerkers.json. "
      + "Stuur dat bestand naar Claude.", "color:green;font-weight:bold");
    console.log("[mw] endpoints:", ENDPOINTS);
  };

  console.log("%c[mw] GEWAPEND — recorder actief. Klik nu rustig door Medewerkers "
    + "(alle paginatie-pagina's + alle filters/tabs + medewerker openen/toevoegen/"
    + "bewerken/archiveren/herstellen/verwijderen); typ daarna  __mwDump()", "color:#2563eb;font-weight:bold");
})();
