/* ============================================================================
 * BS2 → BS1 — STAP 2 (volledige scrape) BESCHIKKINGEN-OVERZICHT  v3
 * Kaapt BS2's échte Authorization-header ÉN de exacte API-origin uit BS2's
 * eigen request, en repliceert de call EXACT zoals BS2 (token-only, GEEN
 * cookies — credentials:'omit', anders blokkeert de browser de wildcard-CORS).
 * Diagnostiek: logt status + body van de 1e mislukking.
 *
 * GEBRUIK:
 *  1. Sta op BS2 /dispositions/overview.
 *  2. F12 → Console → plak dit volledig → ENTER ("GEWAPEND").
 *  3. Klik één beschikking open (of wissel filter/pagina). Scrape start auto.
 *  4. Wacht op "KLAAR ✓" → bs2-overzicht-full.json wordt gedownload.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2ScrapeArmed) { console.log("[bs2scrape] al gewapend — klik een beschikking open."); return; }
  window.__bs2ScrapeArmed = true;
  var CAP = null;       // { Authorization, Accept }
  var APIBASE = null;   // bv. https://api.etf.acceptance.besasuite.nl

  function originOf(u) {
    try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; }
  }
  function arm(auth, sampleUrl) {
    if (CAP) return;
    if (!auth) return;
    CAP = { Authorization: auth, Accept: "application/json" };
    APIBASE = originOf(sampleUrl) || "https://api.etf.acceptance.besasuite.nl";
    console.log("%c[bs2scrape] auth gekaapt ✓  API=" + APIBASE + " — scrape start…", "color:green;font-weight:bold");
    setTimeout(runScrape, 200);
  }

  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var u = (typeof input === "string") ? input : (input && input.url) || "";
      if (/\/api\//.test(u)) {
        var hh = (init && init.headers) || (input && input.headers);
        var auth = null;
        if (hh) {
          if (hh instanceof Headers) auth = hh.get("Authorization") || hh.get("authorization");
          else auth = hh.Authorization || hh.authorization;
        }
        if (auth) arm(auth, u);
      }
    } catch (e) {}
    return _fetch.apply(this, arguments);
  };
  var _open = XMLHttpRequest.prototype.open;
  var _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (/^authorization$/i.test(k) && !CAP) arm(v, this.__u || ""); } catch (e) {}
    return _set.apply(this, arguments);
  };

  // Voorkeur: BS2's eigen axios (zelfde baseURL + auth-interceptor = gegarandeerd
  // identiek aan BS2). Anders: gekaapte-header fetch (token-only, geen cookies).
  function findAxios() {
    var c = [window.axios, window.$http, window.http];
    for (var i = 0; i < c.length; i += 1) {
      if (c[i] && typeof c[i].get === "function") return c[i];
    }
    return null;
  }
  var AX = findAxios();

  var FAILS = 0, FIRSTFAIL = null;
  async function api(p) {
    var url = p.indexOf("http") === 0 ? p : (APIBASE + p);
    if (AX) {
      try {
        var ar = await AX.get(p);
        return ar && ar.data;
      } catch (e) {
        FAILS += 1;
        if (!FIRSTFAIL) { FIRSTFAIL = { url: p, axios: (e && e.response && e.response.status) || e.message }; console.warn("[bs2scrape] axios 1e fail " + JSON.stringify(FIRSTFAIL)); }
        return null;
      }
    }
    try {
      var r = await _fetch(url, { headers: CAP, credentials: "omit", mode: "cors" });
      if (!r.ok) {
        FAILS += 1;
        if (!FIRSTFAIL) { FIRSTFAIL = { url: url, status: r.status }; try { FIRSTFAIL.body = (await r.text()).slice(0, 300); } catch (e) {} console.warn("[bs2scrape] 1e fail HTTP " + r.status + " " + url + "\n" + (FIRSTFAIL.body || "")); }
        return null;
      }
      return await r.json();
    } catch (e) {
      FAILS += 1;
      if (!FIRSTFAIL) { FIRSTFAIL = { url: url, err: e.message }; console.warn("[bs2scrape] 1e fail ERR " + url + " :: " + e.message); }
      return null;
    }
  }
  async function apiAll(b) {
    var o = [], p = 1, last = 1;
    do {
      var j = await api(b(p));
      if (!j) break;
      var rows = Array.isArray(j) ? j : (j.data || []);
      o = o.concat(rows);
      last = (j && j.meta && j.meta.last_page) ? j.meta.last_page : p;
      p += 1;
      await new Promise(function (r) { setTimeout(r, 70); });
    } while (p <= last && p <= 80);
    return o;
  }

  var _run = false;
  async function runScrape() {
    if (_run || !CAP) return;
    _run = true;
    console.log("[bs2scrape] lookups…");
    var ct = (await api("/api/care-types?filter%5Bsearch%5D=&limit=200")) || {}; ct = ct.data || [];
    var ph = (await api("/api/phases?filter%5Bentity_target%5D%5Btype%5D=disposition&filter%5Bsearch%5D=&limit=200")) || {}; ph = ph.data || [];
    console.log("[bs2scrape] beschikkingen-lijst (normaal + trashed)…");
    var ln = await apiAll(function (p) { return "/api/dispositions?with%5B%5D=client&with%5B%5D=care_type&limit=100&page=" + p; });
    var lt = await apiAll(function (p) { return "/api/dispositions?with%5B%5D=client&with%5B%5D=care_type&filter%5Btrashed%5D=only&limit=100&page=" + p; });
    if (!ln.length && !lt.length) {
      console.error("%c[bs2scrape] GEEN data — auth/CORS probleem. Eerste fail: " + JSON.stringify(FIRSTFAIL), "color:red;font-weight:bold");
      _run = false; return;
    }
    var map = new Map();
    ln.forEach(function (d) { if (d && d.id) { d.__trashed = false; map.set(d.id, d); } });
    lt.forEach(function (d) { if (d && d.id && !map.has(d.id)) { d.__trashed = true; map.set(d.id, d); } });
    var disp = Array.from(map.values());
    console.log("[bs2scrape] " + disp.length + " beschikkingen (" + ln.length + " + " + lt.length + " trashed). Detail-tabs…");
    var done = 0;
    for (var i = 0; i < disp.length; i += 1) {
      var d = disp[i], id = d.id;
      d.payments = await apiAll(function (p) { return "/api/disposition-payments?with%5B%5D=disposition&filter%5Bdisposition%5D=" + id + "&limit=100&page=" + p; });
      d.rates = await apiAll(function (p) { return "/api/dispositions/" + id + "/rates?limit=100&page=" + p; });
      d.notes = await apiAll(function (p) { return "/api/notes?with%5B%5D=user&filter%5Btarget%5D%5Btype%5D=disposition&filter%5Btarget%5D%5Bid%5D=" + id + "&limit=100&page=" + p; });
      d.audit = await apiAll(function (p) { return "/api/audit-logs?with%5B%5D=causer&filter%5Bresource%5D%5Btype%5D=disposition&filter%5Bresource%5D%5Bid%5D=" + id + "&limit=100&page=" + p; });
      done += 1;
      if (done % 10 === 0 || done === disp.length) console.log("  … " + done + "/" + disp.length);
    }
    var sum = function (f) { return disp.reduce(function (a, d) { return a + ((d[f] && d[f].length) || 0); }, 0); };
    var payload = {
      scraped_at: new Date().toISOString(), source: "BS2 overzicht STAP2 v3",
      counts: { dispositions: disp.length, trashed: lt.length, payments: sum("payments"), rates: sum("rates"), notes: sum("notes"), audit: sum("audit"), http_fails: FAILS },
      care_types: ct, phases: ph, dispositions: disp,
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "bs2-overzicht-full.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[bs2scrape] KLAAR ✓ beschikkingen=" + disp.length + " facturen=" + sum("payments") + " tarieven=" + sum("rates") + " notities=" + sum("notes") + " audit=" + sum("audit") + " fails=" + FAILS, "color:green;font-weight:bold");
    console.log("%c→ bs2-overzicht-full.json gedownload — geef aan Claude.", "color:green;font-weight:bold");
  }

  console.log("%c[bs2scrape] GEWAPEND. Klik nu een beschikking open (of wissel filter/pagina) — scrape start automatisch.", "color:#2563eb;font-weight:bold");
})();
