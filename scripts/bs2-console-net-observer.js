/* ============================================================================
 * BS2 — PURE READ-ONLY NETWORK OBSERVER  v1
 *
 * ⚠️ PRODUCTIE-VEILIG: doet ZELF NUL requests. Patcht fetch/XHR enkel om te
 * LOGGEN wat de pagina zélf doet (method, URL, of er een Authorization-header
 * is, status, en — alleen voor JSON — een afgekapte respons). Wijzigt niets,
 * blokkeert niets, repliceert niets. Diagnostisch: hiermee zien we het echte
 * documenten-endpoint + auth-mechanisme zonder te gokken (METHODIEK STAP 1).
 *
 * GEBRUIK:
 *  1. https://etf.besasuite.nl/documents (jouw sessie). F12 → Console.
 *  2. Plak dit → Enter → je ziet groot "[net] AAN".
 *  3. Doe read-only acties: klik een PAGINERING-pijl, typ een letter in
 *     Zoeken, klik een kolom-sortering, of open een doc via het OOG-icoon.
 *     Voor elke call verschijnt een [net]-regel.
 *  4. Typ:  __net()  → bs2-net.json wordt gedownload. Stuur dat naar Claude
 *     (of plak gewoon alle [net]-regels in de chat).
 * ==========================================================================*/
(function () {
  "use strict";
  var W = window;
  if (!W.__bs2NetOrig) {
    W.__bs2NetOrig = {
      fetch: W.fetch.bind(W),
      open: XMLHttpRequest.prototype.open,
      send: XMLHttpRequest.prototype.send,
      srh: XMLHttpRequest.prototype.setRequestHeader,
    };
  }
  var O = W.__bs2NetOrig;
  var REC = (W.__bs2NetREC = W.__bs2NetREC || []);
  function rel(u) { u = String(u || ""); return /\/api\//i.test(u) || /document|file|media|download|storage|polic|beleid/i.test(u); }
  function note(method, url, auth, status, bodyText) {
    var e = { t: new Date().toISOString(), method: String(method || "GET").toUpperCase(), url: String(url), auth: !!auth, status: status || null };
    if (bodyText != null) { try { e.resp = JSON.parse(bodyText); } catch (x) { e.resp = String(bodyText).slice(0, 4000); } }
    REC.push(e);
    console.log("%c[net] " + e.method + " " + e.url + "  auth=" + (e.auth ? "JA" : "nee") + (status ? ("  -> " + status) : ""),
      "color:" + (e.auth ? "green" : "#2563eb"));
  }
  W.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var method = (init && init.method) || (input && input.method) || "GET";
    var a = null;
    try {
      var hh = (init && init.headers) || (input && input.headers);
      if (hh) a = (hh instanceof Headers) ? (hh.get("authorization") || hh.get("Authorization")) : (hh.Authorization || hh.authorization);
    } catch (e) {}
    var p = O.fetch.apply(W, arguments);
    if (rel(url)) {
      p.then(function (res) {
        try {
          var ct = (res.headers && res.headers.get("content-type")) || "";
          if (/json/i.test(ct)) res.clone().text().then(function (t) { note(method, url, a, res.status, t); }).catch(function () { note(method, url, a, res.status); });
          else note(method, url, a, res.status);
        } catch (x) { note(method, url, a); }
        return res;
      }).catch(function () {});
    }
    return p;
  };
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; this.__auth = false; return O.open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { if (/^authorization$/i.test(k)) this.__auth = true; } catch (e) {} return O.srh.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var x = this;
    try {
      x.addEventListener("load", function () {
        try {
          var ct = (x.getResponseHeader && x.getResponseHeader("content-type")) || "";
          var bt = /json/i.test(ct) ? String(x.responseText || "") : null;
          if (rel(x.__u)) note(x.__m, x.__u, x.__auth, x.status, bt);
        } catch (e) {}
      });
    } catch (e) {}
    return O.send.apply(this, arguments);
  };
  W.__net = function () {
    var payload = { captured_at: new Date().toISOString(), origin: location.origin, count: REC.length, calls: REC };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "bs2-net.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[net] " + REC.length + " calls -> bs2-net.json gedownload. Stuur naar Claude.", "color:green;font-weight:bold");
  };
  console.log("%c[net] AAN — READ-ONLY observer (doet zelf 0 requests). Klik nu onderaan een "
    + "PAGINERING-pijl, typ een letter in Zoeken, of open een document via het OOG-icoon. "
    + "Elke /api/-call verschijnt hieronder. Typ daarna  __net()",
    "color:#2563eb;font-weight:bold;font-size:13px");
})();
