/* ============================================================================
 * BS2 → BS1 — SCRAPE GEMEENTEN (municipalities)  v1
 * Zelfde bewezen auth als de overzicht-scrape: kaapt BS2's eigen
 * Authorization-token uit zijn eigen request en repliceert de call
 * token-only met credentials:'omit' (wildcard-CORS, dus GEEN cookies).
 *
 * Endpoint (live bevestigd): GET /api/municipalities  (meta.total=316,
 * per_page=50). We paginren met limit=100.
 *
 * GEBRUIK:
 *  1. BS2 ingelogd → ga naar  /clients/municipalities
 *  2. F12 → Console → plak dit volledig → Enter → je ziet "GEWAPEND".
 *  3. Klik nu één keer op een paginering-pijl of wissel "rijen per pagina"
 *     (zodat BS2 zelf een /api/municipalities-call doet → token gekaapt).
 *  4. Wacht op "KLAAR ✓" → bs2-gemeenten-full.json wordt gedownload.
 *  5. Laat het bestand in C:\Users\sonck\Downloads staan en zeg "klaar".
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2GemArmed) { console.log("[gem] al gewapend — klik een paginering-pijl."); return; }
  window.__bs2GemArmed = true;
  var CAP = null, APIBASE = null, _fetch = window.fetch;

  function originOf(u) { try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; } }
  function arm(auth, sampleUrl) {
    if (CAP || !auth) return;
    CAP = { Authorization: auth, Accept: "application/json" };
    APIBASE = originOf(sampleUrl) || "https://api.etf.acceptance.besasuite.nl";
    console.log("%c[gem] token gekaapt ✓ — scrape start…", "color:green;font-weight:bold");
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

  var FAILS = 0, FIRSTFAIL = null;
  async function api(p) {
    var url = p.indexOf("http") === 0 ? p : (APIBASE + p);
    try {
      var r = await _fetch(url, { headers: CAP, credentials: "omit", mode: "cors" });
      if (!r.ok) {
        FAILS += 1;
        if (!FIRSTFAIL) { FIRSTFAIL = { url: url, status: r.status }; try { FIRSTFAIL.body = (await r.text()).slice(0, 250); } catch (e) {} console.warn("[gem] 1e fail HTTP " + r.status + "\n" + (FIRSTFAIL.body || "")); }
        return null;
      }
      return await r.json();
    } catch (e) {
      FAILS += 1;
      if (!FIRSTFAIL) { FIRSTFAIL = { url: url, err: e.message }; console.warn("[gem] 1e fail ERR " + e.message); }
      return null;
    }
  }
  var _ran = false;
  async function run() {
    if (_ran || !CAP) return; _ran = true;
    var byId = {}, uniq = [], total = null, diag = [];
    function take(j, tag) {
      if (!j) { diag.push(tag + ":FAIL"); return 0; }
      if (j.meta && typeof j.meta.total === "number") total = j.meta.total;
      var rows = Array.isArray(j) ? j : (j.data || []);
      var add = 0;
      rows.forEach(function (r) {
        var k = r && r.id != null ? String(r.id) : null;
        if (k && !byId[k]) { byId[k] = 1; uniq.push(r); add += 1; }
      });
      diag.push(tag + ":l" + rows.length + "+" + add + "(" + uniq.length + "/" + (total == null ? "?" : total) + ")");
      return rows.length;
    }

    // BS2 negeert per_page (hardcap ~15/pagina) en de DEFAULT-sortering is
    // instabiel → naïef pagina-incrementen mist rijen. Oplossing: pagineren
    // met een EXPLICIETE STABIELE sortering (Spatie query-builder: ?sort=).
    // Meerdere sorteer-strategieën + globale dedup → samen alle rijen.
    async function paginateSorted(sortParam, tagPrefix) {
      for (var p = 1; p <= 60; p += 1) {
        if (total != null && uniq.length >= total) return true;
        var qs = "/api/municipalities?page=" + p + "&per_page=100" + (sortParam ? "&sort=" + encodeURIComponent(sortParam) : "");
        var j = await api(qs);
        var len = take(j, tagPrefix + p);
        if (!j) break;
        var lp = (j.meta && j.meta.last_page) ? j.meta.last_page : Math.ceil((total || 316) / 15);
        if (len === 0 || p > lp + 1) break;
        await new Promise(function (r) { setTimeout(r, 55); });
      }
      return total != null && uniq.length >= total;
    }

    console.log("[gem] strategie 1: sort=name…");
    var done = await paginateSorted("name", "N");
    if (!done) { console.log("[gem] strategie 2: sort=id…"); done = await paginateSorted("id", "I"); }
    if (!done) { console.log("[gem] strategie 3: sort=-name…"); done = await paginateSorted("-name", "n"); }
    if (!done) { console.log("[gem] strategie 4: sort=created_at…"); done = await paginateSorted("created_at", "C"); }
    if (!done) { console.log("[gem] strategie 5: geen sort (instabiel, herhaald samplen)…"); done = await paginateSorted("", "P"); }

    if (!uniq.length) {
      console.error("%c[gem] GEEN data — auth/CORS. Eerste fail: " + JSON.stringify(FIRSTFAIL), "color:red;font-weight:bold");
      window.__bs2GemArmed = false; _ran = false; return;
    }
    var compleet = (total == null) || (uniq.length >= total);
    var payload = {
      scraped_at: new Date().toISOString(),
      source: "BS2 /api/municipalities",
      counts: { total: uniq.length, bs2_meta_total: total, compleet: compleet, http_fails: FAILS },
      diag: diag,
      municipalities: uniq,
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "bs2-gemeenten-full.json";
    document.body.appendChild(a); a.click(); a.remove();
    if (!compleet) console.warn("%c[gem] ONVOLLEDIG: " + uniq.length + "/" + total + ". Stuur het JSON-bestand tóch — het 'diag'-veld toont per pagina het gedrag zodat Claude de paginatie kan fixen.", "color:#b45309;font-weight:bold");
    console.log("%c[gem] KLAAR " + (compleet ? "✓" : "⚠") + " gemeenten=" + uniq.length + " / BS2-meta=" + (total == null ? "?" : total) + " (compleet=" + compleet + ", fails " + FAILS + ")", compleet ? "color:green;font-weight:bold" : "color:#b45309;font-weight:bold");
    console.log("[gem] diag:", diag.join(" | "));
    console.log("%c→ bs2-gemeenten-full.json gedownload. Zeg 'klaar' tegen Claude.", "color:green;font-weight:bold");
  }

  console.log("%c[gem] GEWAPEND. Klik nu een paginering-pijl of wissel 'rijen per pagina' — scrape start automatisch.", "color:#2563eb;font-weight:bold");
})();
