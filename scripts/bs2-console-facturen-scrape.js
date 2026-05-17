/* ============================================================================
 * BS2 FACTUREN — VOLLEDIGE SCRAPE  v1   (data-export, niet alleen gedrag)
 *
 * De recorder ving het GEDRAG. Deze snippet haalt de VOLLEDIGE DATA op van
 * BEIDE losse endpoints:
 *  - "Alle facturen" → /api/invoices (alle status, alle pagina's, prullenbak)
 *    + per factuur /api/invoices/{id} (billing_fields, workflow_transitions,
 *      system_generated, organisatie/medewerker/shift-koppeling)
 *  - "Te beoordelen" → /api/invoices-to-review (eigen endpoint, eigen params)
 * Zo kunnen we Facturen 1-op-1 BS2 zetten incl. alle berekeningen en de
 * getallen per datumbereik. De twee tabs zijn in BS2 zelf al gescheiden.
 *
 * Werking: BS2's API-subdomein gebruikt wildcard-CORS + een Bearer-token in
 * BS2's eigen requests. Deze snippet KAAPT die token uit BS2's eigen call
 * (puur lezen, niets geschreven) en herhaalt daarmee de GET-calls
 * (`credentials:'omit'`), loopt alle paginatie af en downloadt één JSON.
 *
 * GEBRUIK:
 *  1. BS2: blijf op de **Facturen**-module (top-bar Facturen).
 *  2. F12 → Console → plak dit volledig → Enter.
 *  3. Klik 1× ergens in Facturen (bv. ververs de lijst of open een tab) zodat
 *     BS2 een API-call doet → je ziet "[fac-scrape] TOKEN ✓".
 *  4. Typ:  __facScrapeStart()
 *     → de scrape loopt automatisch ALLE facturen + details af. Voortgang
 *       verschijnt in de console ("pagina x/y", "detail i/n"). Even geduld
 *       (kan 1-3 min duren bij honderden facturen).
 *  5. Bij "[fac-scrape] KLAAR ✓" wordt **bs2-facturen-full.json** gedownload.
 *     Stuur dat bestand naar Claude.
 *
 * Veilig: alleen GET-calls (lezen). Er wordt NIETS in BS2 gewijzigd.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__facScrapeArmed) { console.log("[fac-scrape] al actief — herlaad de pagina om opnieuw te starten."); return; }
  window.__facScrapeArmed = true;

  var TOKEN = null;
  var API = null; // bv. https://api.etf.acceptance.besasuite.nl/api
  var _fetch = window.fetch;

  function deriveApi(u) {
    try {
      var x = new URL(u, location.origin);
      var i = x.pathname.indexOf("/api/");
      if (i >= 0) return x.origin + x.pathname.slice(0, i + 4);
    } catch (e) { /* */ }
    return null;
  }
  function grab(headers, url) {
    try {
      var auth = null;
      if (headers && typeof headers.get === "function") auth = headers.get("Authorization");
      else if (headers && typeof headers === "object") {
        Object.keys(headers).forEach(function (k) { if (k.toLowerCase() === "authorization") auth = headers[k]; });
      }
      if (auth && /bearer/i.test(auth) && !TOKEN) {
        TOKEN = auth;
        API = API || deriveApi(url);
        console.log("%c[fac-scrape] TOKEN ✓  API=" + API + "  — typ nu  __facScrapeStart()", "color:green;font-weight:bold");
      }
    } catch (e) { /* */ }
  }

  window.fetch = function (input, init) {
    try {
      var url = (typeof input === "string") ? input : (input && input.url) || "";
      if (/\/api\//.test(String(url))) {
        if (init && init.headers) grab(init.headers, url);
        else if (input && input.headers) grab(input.headers, url);
      }
    } catch (e) { /* */ }
    return _fetch.apply(this, arguments);
  };
  var _open = XMLHttpRequest.prototype.open;
  var _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (String(k).toLowerCase() === "authorization" && /bearer/i.test(v) && !TOKEN) { TOKEN = v; API = API || deriveApi(this.__u); console.log("%c[fac-scrape] TOKEN ✓  API=" + API + "  — typ nu  __facScrapeStart()", "color:green;font-weight:bold"); } } catch (e) { /* */ }
    return _set.apply(this, arguments);
  };

  function api(pathAndQs) {
    return _fetch.call(window, API + pathAndQs, {
      method: "GET",
      headers: { "Authorization": TOKEN, "Accept": "application/json" },
      credentials: "omit",
      mode: "cors",
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " op " + pathAndQs);
      return r.json();
    });
  }
  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  async function listAll(trashed) {
    var out = [], page = 1, last = 1;
    do {
      var qs = "/invoices?with[]=organization&filter[trashed]=" + (trashed ? "true" : "false")
        + "&page=" + page + "&limit=100";
      var j = await api(qs);
      var rows = (j && j.data) || [];
      out = out.concat(rows);
      last = (j && j.meta && j.meta.last_page) || 1;
      console.log("[fac-scrape] lijst trashed=" + trashed + " pagina " + page + "/" + last + " (+" + rows.length + ", totaal " + out.length + ")");
      page++;
      await sleep(120);
    } while (page <= last);
    return out;
  }

  // "Te beoordelen" = EIGEN BS2-endpoint /api/invoices-to-review met andere
  // params (status, period[start|end], per_page) — los van /api/invoices.
  // Shape onbekend → raw opslaan (data + meta) zodat we 'm exact kunnen
  // naspelen. Twee passes: zoals BS2 (status=submitted) + zonder filter.
  async function reviewAll() {
    var result = { meta0: null, sample_keys: null, queries: [], passes: {} };
    async function pass(label, qsBase) {
      var page = 1, last = 1, rows = [];
      do {
        var qs = qsBase + (qsBase.indexOf("?") >= 0 ? "&" : "?") + "page=" + page + "&per_page=100";
        var j;
        try { j = await api(qs); }
        catch (e) { result.queries.push({ pass: label, error: String(e && e.message || e) }); return rows; }
        var data = (j && j.data) || [];
        rows = rows.concat(data);
        if (!result.meta0) {
          result.meta0 = (j && j.meta) || null;
          result.sample_keys = (data[0] && Object.keys(data[0])) || (j ? Object.keys(j) : null);
        }
        last = (j && j.meta && j.meta.last_page) || 1;
        console.log("[fac-scrape] te-beoordelen(" + label + ") pagina " + page + "/" + last + " (+" + data.length + ", tot " + rows.length + ")");
        page++;
        await sleep(120);
      } while (page <= last && page <= 80);
      result.queries.push({ pass: label, count: rows.length });
      return rows;
    }
    result.passes.submitted = await pass("submitted",
      "/invoices-to-review?status=submitted&period[start]=2000-01-01&period[end]=2100-12-31");
    result.passes.bare = await pass("bare",
      "/invoices-to-review?period[start]=2000-01-01&period[end]=2100-12-31");
    return result;
  }

  window.__facScrapeStart = async function () {
    if (!TOKEN || !API) {
      console.warn("%c[fac-scrape] Nog GEEN token. Klik 1× in Facturen (ververs/tab) en probeer opnieuw.", "color:#b45309;font-weight:bold");
      return;
    }
    try {
      console.log("%c[fac-scrape] start — lijst ophalen…", "color:#2563eb;font-weight:bold");
      var active = await listAll(false);
      var trashed = await listAll(true);
      var seen = {}, list = [];
      active.concat(trashed).forEach(function (r) { if (r && r.id && !seen[r.id]) { seen[r.id] = 1; list.push(r); } });
      console.log("[fac-scrape] " + list.length + " unieke facturen — nu details…");
      var detail = {};
      for (var i = 0; i < list.length; i++) {
        try {
          var d = await api("/invoices/" + list[i].id);
          detail[list[i].id] = (d && d.data) || d;
        } catch (e) {
          detail[list[i].id] = { __error: String(e && e.message || e) };
        }
        if ((i + 1) % 10 === 0 || i + 1 === list.length) {
          console.log("[fac-scrape] detail " + (i + 1) + "/" + list.length);
        }
        await sleep(70);
      }
      var toReview = null;
      try {
        console.log("%c[fac-scrape] Te beoordelen-endpoint (/api/invoices-to-review)…", "color:#2563eb;font-weight:bold");
        toReview = await reviewAll();
      } catch (e) {
        toReview = { __error: String(e && e.message || e) };
      }
      var payload = {
        captured_at: new Date().toISOString(),
        source: "BS2 facturen full-scrape v2",
        api: API,
        count_list: list.length,
        invoices_list: list,
        invoices_detail: detail,
        invoices_to_review: toReview,
      };
      var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bs2-facturen-full.json";
      document.body.appendChild(a); a.click(); a.remove();
      console.log("%c[fac-scrape] KLAAR ✓ — " + list.length + " facturen + details + Te-beoordelen-endpoint in bs2-facturen-full.json. Stuur dat naar Claude.", "color:green;font-weight:bold");
    } catch (err) {
      console.error("%c[fac-scrape] FOUT: " + (err && err.message || err) + " — meld dit aan Claude.", "color:#b91c1c;font-weight:bold");
    }
  };

  console.log("%c[fac-scrape] GEWAPEND — klik 1× in Facturen zodat BS2 een API-call doet (token), typ daarna  __facScrapeStart()", "color:#2563eb;font-weight:bold");
})();
