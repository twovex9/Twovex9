/* ============================================================================
 * BS2 DIAGNOSE — alleen AANTALLEN tellen (READ-ONLY, niets gewijzigd/gedownload)
 * Zelfde werkende auth-aanpak als de gelukte scrape (token uit BS2's eigen
 * request + credentials:'omit'; credentials:'include' is door wildcard-CORS
 * geblokkeerd).
 *
 * Doel: ontdekken welke /api/dispositions-query de 155-set van het dashboard
 * geeft (i.p.v. 151), en waar de locatie voor de ~22 lege cliënten vandaan komt.
 *
 * GEBRUIK:
 *  1. BS2 ingelogd → ga naar /dispositions/overview.
 *  2. F12 → Console → plak dit volledig → Enter → je ziet "GEWAPEND".
 *  3. Klik nu één beschikking open (of wissel een filter) — net als bij de
 *     scrape. De diagnose start automatisch zodra de token gekaapt is.
 *  4. Wacht op "=== EINDE ===". Kopieer het hele groene blok naar Claude
 *     (alleen getallen — geen tokens).
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2DiagArmed) { console.log("[diag] al gewapend — klik een beschikking open."); return; }
  window.__bs2DiagArmed = true;
  var CAP = null, APIBASE = null, _fetch = window.fetch;

  function originOf(u) { try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; } }
  function arm(auth, sampleUrl) {
    if (CAP || !auth) return;
    CAP = { Authorization: auth, Accept: "application/json" };
    APIBASE = originOf(sampleUrl) || "https://api.etf.acceptance.besasuite.nl";
    console.log("%c[diag] token gekaapt ✓ — diagnose start…", "color:green;font-weight:bold");
    setTimeout(run, 150);
  }
  window.fetch = function (input, init) {
    try {
      var u = (typeof input === "string") ? input : (input && input.url) || "";
      if (/\/api\//.test(u)) {
        var hh = (init && init.headers) || (input && input.headers), a = null;
        if (hh) { a = (hh instanceof Headers) ? (hh.get("Authorization") || hh.get("authorization")) : (hh.Authorization || hh.authorization); }
        if (a) arm(a, u);
      }
    } catch (e) {}
    return _fetch.apply(this, arguments);
  };
  var _open = XMLHttpRequest.prototype.open, _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (/^authorization$/i.test(k) && !CAP) arm(v, this.__u || ""); } catch (e) {}
    return _set.apply(this, arguments);
  };

  async function tot(qs) {
    try {
      var r = await _fetch(APIBASE + "/api/dispositions?" + qs + "&limit=1", { headers: CAP, credentials: "omit", mode: "cors" });
      if (!r.ok) return "HTTP " + r.status;
      var j = await r.json();
      return (j && j.meta && typeof j.meta.total === "number") ? j.meta.total : (Array.isArray(j) ? j.length : (j && j.data ? j.data.length : "?"));
    } catch (e) { return "ERR " + (e.message || e); }
  }
  var _ran = false;
  async function run() {
    if (_ran || !CAP) return; _ran = true;
    var W = "with%5B%5D=client&with%5B%5D=care_type";
    var variants = {
      "baseline": W,
      "filter[trashed]=only": W + "&filter%5Btrashed%5D=only",
      "filter[trashed]=with": W + "&filter%5Btrashed%5D=with",
      "trashed=only": W + "&trashed=only",
      "trashed=with": W + "&trashed=with",
      "trashed=true": W + "&trashed=true",
      "filter[archived]=only": W + "&filter%5Barchived%5D=only",
      "filter[archived]=with": W + "&filter%5Barchived%5D=with",
      "archived=true": W + "&archived=true",
      "with_trashed=1": W + "&with_trashed=1",
      "filter[status]=archived": W + "&filter%5Bstatus%5D=archived",
    };
    var res = {};
    for (var key in variants) { res[key] = await tot(variants[key]); }

    var locInfo = "n/a";
    try {
      var rr = await _fetch(APIBASE + "/api/dispositions?" + W + "&with%5B%5D=client.location&limit=100&page=1", { headers: CAP, credentials: "omit", mode: "cors" });
      if (rr.ok) {
        var jj = await rr.json();
        var rows = (jj && jj.data) ? jj.data : (Array.isArray(jj) ? jj : []);
        var withLoc = 0, noLoc = 0, sample = null;
        rows.forEach(function (d) {
          var L = d && d.client && d.client.location && d.client.location.name;
          if (L) withLoc++; else { noLoc++; if (!sample) sample = d; }
        });
        locInfo = {
          paginaRows: rows.length, metLocatie: withLoc, zonderLocatie: noLoc,
          voorbeeldZonderLocatie: sample ? {
            dispositionLocatieVelden: Object.keys(sample).filter(function (k) { return /loc|adres|address|plaats|woon|stad|city/i.test(k); }),
            clientLocatieVelden: sample.client ? Object.keys(sample.client).filter(function (k) { return /loc|adres|address|plaats|woon|stad|city/i.test(k); }) : null,
            clientLocationWaarde: sample.client ? sample.client.location : "no-client",
          } : "alle rows hadden locatie",
        };
      } else locInfo = "HTTP " + rr.status;
    } catch (e) { locInfo = "ERR " + (e.message || e); }

    var dashTot = "n/a";
    try {
      var dr = await _fetch(APIBASE + "/api/rpc", {
        method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, CAP),
        credentials: "omit", mode: "cors",
        body: JSON.stringify({ signature: "dispositions:dashboard", body: { filter: { period: { start: "2026-01-01", end: "2026-12-31" } } } }),
      });
      if (dr.ok) { var dj = await dr.json(); dashTot = (dj.care_types || []).reduce(function (a, c) { return a + (c.count || 0); }, 0); }
      else dashTot = "HTTP " + dr.status;
    } catch (e) { dashTot = "ERR " + (e.message || e); }

    console.log("%c=== BS2 DIAGNOSE — kopieer dit hele blok naar Claude ===", "color:green;font-weight:bold");
    console.log("DISPOSITIONS TOTAAL PER QUERY:");
    console.table(res);
    console.log("DASHBOARD care_types totaal (verwacht ~155):", dashTot);
    console.log("LOCATIE-BRON:", JSON.stringify(locInfo, null, 1));
    console.log("%c=== EINDE ===", "color:green;font-weight:bold");
  }
  console.log("%c[diag] GEWAPEND. Klik nu één beschikking open (of wissel een filter) — diagnose start automatisch.", "color:#2563eb;font-weight:bold");
})();
