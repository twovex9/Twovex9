/* ============================================================================
 * BS2 → BS1 — STAP 2 (volledige scrape) BESCHIKKINGEN-OVERZICHT  v2
 * AUTH-ROBUUST: kaapt de échte Authorization-header van BS2's eigen request
 * (Laravel-Sanctum token, GEEN JWT) i.p.v. te gokken.
 *
 * GEBRUIK:
 *  1. Sta op de BS2 overzicht-pagina (/dispositions/overview).
 *  2. Plak dit volledig in F12-console, ENTER.
 *  3. Doe één BS2-actie die een /api/-call triggert (klik een beschikking
 *     open, of wissel een filter/pagina). Zodra de auth-header gekaapt is
 *     start de volledige scrape AUTOMATISCH.
 *  4. Wacht op "KLAAR ✓" → bs2-overzicht-full.json wordt gedownload.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2ScrapeArmed) { console.log("[bs2scrape] al gewapend — doe een BS2-actie (klik een beschikking)."); return; }
  window.__bs2ScrapeArmed = true;
  var API = "https://api.etf.acceptance.besasuite.nl";
  var CAP = null; // gekaapte headers

  function tryHeaders(h) {
    if (CAP || !h) return;
    var auth = null;
    try {
      if (typeof h.get === "function") auth = h.get("Authorization") || h.get("authorization");
      else if (h.Authorization || h.authorization) auth = h.Authorization || h.authorization;
    } catch (e) {}
    if (auth) {
      CAP = { Authorization: auth, Accept: "application/json" };
      console.log("%c[bs2scrape] auth-header gekaapt ✓ — scrape start…", "color:green;font-weight:bold");
      setTimeout(runScrape, 200);
    }
  }

  // -- fetch patchen --
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var u = (typeof input === "string") ? input : (input && input.url) || "";
      if (/\/api\//.test(u)) {
        var hh = (init && init.headers) || (input && input.headers);
        if (hh) {
          if (hh instanceof Headers) tryHeaders(hh);
          else { var o = {}; Object.keys(hh).forEach(function (k) { o[k] = hh[k]; }); tryHeaders(o); }
        }
      }
    } catch (e) {}
    return _fetch.apply(this, arguments);
  };
  // -- XHR patchen (BS2 = XHR) --
  var _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (/^authorization$/i.test(k) && !CAP) tryHeaders({ Authorization: v }); } catch (e) {}
    return _set.apply(this, arguments);
  };

  var FAILS = 0;
  async function api(p) {
    var url = p.indexOf("http") === 0 ? p : (API + p);
    try {
      var r = await _fetch(url, { headers: CAP, credentials: "include" });
      if (!r.ok) { FAILS += 1; if (FAILS <= 5) console.warn("HTTP " + r.status + " " + url); return null; }
      return await r.json();
    } catch (e) { FAILS += 1; if (FAILS <= 5) console.warn("ERR " + url + " :: " + e.message); return null; }
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

  var _running = false;
  async function runScrape() {
    if (_running || !CAP) return;
    _running = true;
    try {
      console.log("[bs2scrape] lookups…");
      var ct = (await api("/api/care-types?filter%5Bsearch%5D=&limit=200")) || {}; ct = ct.data || [];
      var ph = (await api("/api/phases?filter%5Bentity_target%5D%5Btype%5D=disposition&filter%5Bsearch%5D=&limit=200")) || {}; ph = ph.data || [];
      console.log("[bs2scrape] beschikkingen-lijst (normaal + trashed)…");
      var ln = await apiAll(function (p) { return "/api/dispositions?with%5B%5D=client&with%5B%5D=care_type&limit=100&page=" + p; });
      var lt = await apiAll(function (p) { return "/api/dispositions?with%5B%5D=client&with%5B%5D=care_type&filter%5Btrashed%5D=only&limit=100&page=" + p; });
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
        scraped_at: new Date().toISOString(),
        source: "BS2 /dispositions/overview STAP2 v2",
        counts: { dispositions: disp.length, trashed: lt.length, payments: sum("payments"), rates: sum("rates"), notes: sum("notes"), audit: sum("audit"), http_fails: FAILS },
        care_types: ct, phases: ph, dispositions: disp,
      };
      var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "bs2-overzicht-full.json";
      document.body.appendChild(a); a.click(); a.remove();
      console.log("%c[bs2scrape] KLAAR ✓ beschikkingen=" + disp.length + " facturen=" + sum("payments") + " tarieven=" + sum("rates") + " notities=" + sum("notes") + " audit=" + sum("audit") + " fails=" + FAILS, "color:green;font-weight:bold");
      console.log("%c→ bs2-overzicht-full.json gedownload — geef aan Claude voor STAP 3.", "color:green;font-weight:bold");
    } catch (e) {
      console.error("[bs2scrape] fout: " + e.message);
    }
  }

  console.log("%c[bs2scrape] GEWAPEND. Klik nu een beschikking open (of wissel filter/pagina) — de scrape start automatisch zodra je auth-header gekaapt is.", "color:#2563eb;font-weight:bold");
})();
