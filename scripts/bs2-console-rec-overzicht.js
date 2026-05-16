/* ============================================================================
 * BS2 → BS1 — STAP 1 (endpoints ontdekken) voor BESCHIKKINGEN-OVERZICHT.
 * Plak dit VOLLEDIG in de BS2 F12-console op de overzicht-pagina, DRUK ENTER,
 * klik daarna één beschikking open + door ALLE tabs (Details, Facturen,
 * Tarieven, Notities, Audit) + linker paneel, en typ tot slot:  __bs2dump()
 *
 * Het patcht zowel fetch ALS XMLHttpRequest (BS2 gebruikt XHR) en legt elke
 * /api/-call vast (methode, url, request-body, status, korte response).
 * __bs2dump() downloadt bs2-overzicht-endpoints.json + print een nette
 * lijst unieke endpoint-vormen. NIET gokken — dit is de waarheid.
 * ==========================================================================*/
(function () {
  if (window.__bs2recOn) { console.log("[bs2rec] recorder draait al — klik door de tabs en typ __bs2dump()"); return; }
  window.__bs2recOn = true;
  window.__bs2calls = [];

  function rec(method, url, reqBody, status, respText) {
    try {
      if (!/\/api\//.test(String(url))) return;
      window.__bs2calls.push({
        t: new Date().toISOString(),
        m: (method || "GET").toUpperCase(),
        u: String(url),
        body: reqBody == null ? "" : String(reqBody).slice(0, 2000),
        st: status == null ? "" : status,
        resp: respText == null ? "" : String(respText).slice(0, 1500),
      });
    } catch (e) { /* noop */ }
  }

  // ---- fetch patchen ----
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var method = (init && init.method) || (input && input.method) || "GET";
    var body = (init && init.body) || "";
    return _fetch.apply(this, arguments).then(function (res) {
      try {
        res.clone().text().then(function (txt) { rec(method, url, body, res.status, txt); }).catch(function () { rec(method, url, body, res.status, ""); });
      } catch (e) { rec(method, url, body, res.status, ""); }
      return res;
    });
  };

  // ---- XMLHttpRequest patchen (BS2 = XHR) ----
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__bs2m = m; this.__bs2u = u;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var self = this;
    this.addEventListener("load", function () {
      var rt = "";
      try { rt = (self.responseType === "" || self.responseType === "text") ? self.responseText : "[" + self.responseType + "]"; } catch (e) { rt = ""; }
      rec(self.__bs2m, self.__bs2u, body, self.status, rt);
    });
    return _send.apply(this, arguments);
  };

  window.__bs2dump = function () {
    var calls = window.__bs2calls || [];
    // unieke endpoint-vormen (pad + gesorteerde filter-keys, zonder waarden/paginering)
    function shape(u) {
      try {
        var x = new URL(u, location.origin);
        var keys = [];
        x.searchParams.forEach(function (_v, k) {
          if (!/^(page|limit|sort|offset)$/.test(k)) keys.push(k.replace(/\d+/g, "N"));
        });
        keys = Array.from(new Set(keys)).sort();
        return x.pathname.replace(/\/[0-9a-f-]{16,}/gi, "/{id}") + (keys.length ? "  ?" + keys.join("&") : "");
      } catch (e) { return String(u); }
    }
    var groups = {};
    calls.forEach(function (c) {
      var s = c.m + " " + shape(c.u);
      if (!groups[s]) groups[s] = { n: 0, ex: c.u, body: c.body, st: c.st };
      groups[s].n += 1;
    });
    console.log("%c==== UNIEKE BS2 ENDPOINTS (" + Object.keys(groups).length + ") — " + calls.length + " calls ====", "font-weight:bold");
    Object.keys(groups).sort().forEach(function (s) {
      var g = groups[s];
      console.log("[" + g.n + "x] " + s + "\n   voorbeeld: " + g.ex + (g.body ? "\n   body: " + g.body.slice(0, 200) : ""));
    });
    var blob = new Blob([JSON.stringify(calls, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-overzicht-endpoints.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c→ bs2-overzicht-endpoints.json gedownload (" + calls.length + " calls). Geef dit bestand aan Claude.", "color:green;font-weight:bold");
    return Object.keys(groups).length + " unieke endpoints, " + calls.length + " calls";
  };

  console.log("%c[bs2rec] AAN. Klik nu één beschikking open + door ALLE tabs (Details, Facturen, Tarieven, Notities, Audit) + linker paneel. Typ daarna:  __bs2dump()", "color:#2563eb;font-weight:bold");
})();
