/* ============================================================================
 * BS2 TAKEN — RECORDER  v1
 *
 * Doel: de hele Taken-module (top-bar Taken, /tasks/list) 1-op-1 van BS2
 * naar BS1 overnemen — productie-klaar (werkt vóór én achter de schermen).
 * Deze recorder vangt PASSIEF élke /api/-call op die BS2 zélf doet
 * terwijl jij door Taken klikt — incl. de lijst, tabs, filters, en de
 * volledige CREATE/EDIT/VOLTOOIEN/ARCHIVEREN/VERWIJDEREN-payloads
 * (POST/PATCH/PUT/DELETE). Zo leren we de exacte endpoints + gedrag +
 * berekeningen. Niets wordt buiten jouw eigen klikken om naar BS2
 * geschreven; puur observeren (STAP 1+2 van de overname-methodiek).
 *
 * GEBRUIK:
 *  1. BS2: klik bovenaan op **Taken** (je staat op /tasks/list).
 *  2. F12 → Console → plak dit volledig → Enter → "[taken] GEWAPEND".
 *  3. Klik nu RUSTIG door ALLES (bij elke call zie je groen "[taken] ✓"):
 *       a. Tabs **Mijn taken** én **Alle taken**.
 *       b. Élk filter: Selecteer een teamlid, Gearchiveerd-toggle,
 *          Status, Prioriteit, Sorteren op, Kies een deadline, Kies een
 *          aanmaakdatum, Reset. En "Voltooide taken verbergen" aan/uit.
 *       c. Het zoekveld (typ iets), en de kalender- + persoon-icoontjes
 *          rechtsboven (andere weergaven).
 *       d. **+ Taak toevoegen** → vul een TEST-taak volledig in
 *          (naam, toegewezen aan, deadline, prioriteit, status,
 *          beschrijving, eventueel subtaken/bijlagen) → opslaan.
 *       e. Open die taak (detail) → bewerk 'm → wijzig status +
 *          prioriteit + deadline + toegewezene → voltooi 'm →
 *          archiveer + herstel → verwijder de TEST-taak weer.
 *       f. Doe stap d-e voor 2 verschillende taken (incl. subtaken/
 *          opmerkingen als die er zijn) zodat we alle payloads zien.
 *  4. Typ:  __takenDump()  → bs2-taken.json wordt gedownload.
 *     Stuur dat bestand naar Claude.
 *
 * Zie je na een klik GEEN nieuwe groene regel terwijl er wél iets
 * inlaadt? Meld dat aan Claude — dan rekent/rendert BS2 het anders.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2TakenRec) { console.log("[taken] al actief — herlaad de pagina om opnieuw te starten."); return; }
  window.__bs2TakenRec = true;

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
    console.log("%c[taken] ✓ " + e.method + " " + e.path + qs
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

  window.__takenDump = function () {
    if (!REC.length) {
      console.warn("%c[taken] Nog NIETS opgevangen. Klik door de Taken-module; "
        + "verschijnt er niets, meld dit aan Claude.", "color:#b45309;font-weight:bold");
      return;
    }
    var payload = {
      captured_at: new Date().toISOString(),
      source: "BS2 taken recorder v1",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-taken.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[taken] KLAAR ✓ — " + REC.length + " calls, "
      + Object.keys(ENDPOINTS).length + " unieke endpoints in bs2-taken.json. "
      + "Stuur dat bestand naar Claude.", "color:green;font-weight:bold");
    console.log("[taken] endpoints:", ENDPOINTS);
  };

  console.log("%c[taken] GEWAPEND — recorder actief. Klik nu rustig door Taken "
    + "(Mijn/Alle taken + alle filters + taak toevoegen/bewerken/voltooien/"
    + "archiveren/verwijderen); typ daarna  __takenDump()", "color:#2563eb;font-weight:bold");
})();
