/* ============================================================================
 * BS2 → BS1 — SCRAPE MEDEWERKERS (top-bar /main-employee/employees)  v1
 *
 * APART systeem, los van HR-medewerkers. Zelfde bewezen auth als de andere
 * scrapes: kaapt BS2's eigen Authorization-token uit zijn eigen request en
 * repliceert de call token-only met credentials:'omit' (wildcard-CORS).
 *
 * Endpoints (live bevestigd via recorder):
 *   - lijst:   GET /api/employees-basic?filter[search]=&page=N&limit=15&sort=first_name
 *              (meta.total=100, per_page hardcap 15 → pagineren + dedup)
 *   - detail:  GET /api/employees-basic/{id}  (zelfde 14 velden)
 *
 * Doet 2 fasen:
 *   FASE A — paginatie: alle ~100 employees-basic verzamelen (globale dedup
 *            op id, meerdere stabiele sort-strategieën als vangnet).
 *   FASE B — per medewerker GET /api/employees-basic/{id} → .detail
 *            (100% ruw behoud, bevestigt of detail extra velden heeft).
 *
 * GEBRUIK:
 *  1. BS2 ingelogd → ga naar top-bar **Medewerkers** (/main-employee/employees)
 *  2. F12 → Console → plak dit volledig → Enter → je ziet "GEWAPEND".
 *  3. Klik nu één keer op een paginering-pijl of herlaad de lijst
 *     (zodat BS2 zelf een /api/employees-basic-call doet → token gekaapt).
 *  4. Wacht op "KLAAR ✓" → bs2-medewerkers-full.json wordt gedownload.
 *  5. Laat het bestand in C:\Users\sonck\Downloads staan en zeg "klaar".
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2MwScrapeArmed) { console.log("[mw] al gewapend — klik een paginering-pijl."); return; }
  window.__bs2MwScrapeArmed = true;
  var CAP = null, APIBASE = null, _fetch = window.fetch;

  function originOf(u) { try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; } }
  function arm(auth, sampleUrl) {
    if (CAP || !auth) return;
    CAP = { Authorization: auth, Accept: "application/json" };
    APIBASE = originOf(sampleUrl) || "https://api.etf.acceptance.besasuite.nl";
    console.log("%c[mw] token gekaapt ✓ — scrape start…", "color:green;font-weight:bold");
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
        if (!FIRSTFAIL) { FIRSTFAIL = { url: url, status: r.status }; try { FIRSTFAIL.body = (await r.text()).slice(0, 250); } catch (e) {} console.warn("[mw] 1e fail HTTP " + r.status + "\n" + (FIRSTFAIL.body || "")); }
        return null;
      }
      return await r.json();
    } catch (e) {
      FAILS += 1;
      if (!FIRSTFAIL) { FIRSTFAIL = { url: url, err: e.message }; console.warn("[mw] 1e fail ERR " + e.message); }
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

    // BS2 negeert limit (hardcap ~15/pagina). Pagineren met EXPLICIETE
    // STABIELE sortering + globale dedup op id. De UI gebruikt sort=first_name;
    // overige strategieën als vangnet zodat samen alle rijen binnenkomen.
    async function paginateSorted(sortParam, tagPrefix) {
      for (var p = 1; p <= 60; p += 1) {
        if (total != null && uniq.length >= total) return true;
        var qs = "/api/employees-basic?filter%5Bsearch%5D=&page=" + p + "&limit=100"
          + (sortParam ? "&sort=" + encodeURIComponent(sortParam) : "");
        var j = await api(qs);
        var len = take(j, tagPrefix + p);
        if (!j) break;
        var lp = (j.meta && j.meta.last_page) ? j.meta.last_page : Math.ceil((total || 100) / 15);
        if (len === 0 || p > lp + 1) break;
        await new Promise(function (r) { setTimeout(r, 55); });
      }
      return total != null && uniq.length >= total;
    }

    console.log("[mw] FASE A — strategie 1: sort=first_name…");
    var done = await paginateSorted("first_name", "F");
    if (!done) { console.log("[mw] strategie 2: sort=id…"); done = await paginateSorted("id", "I"); }
    if (!done) { console.log("[mw] strategie 3: sort=-first_name…"); done = await paginateSorted("-first_name", "f"); }
    if (!done) { console.log("[mw] strategie 4: sort=last_name…"); done = await paginateSorted("last_name", "L"); }
    if (!done) { console.log("[mw] strategie 5: sort=created_at…"); done = await paginateSorted("created_at", "C"); }
    if (!done) { console.log("[mw] strategie 6: geen sort (instabiel, herhaald samplen)…"); done = await paginateSorted("", "P"); }

    if (!uniq.length) {
      console.error("%c[mw] GEEN data — auth/CORS. Eerste fail: " + JSON.stringify(FIRSTFAIL), "color:red;font-weight:bold");
      window.__bs2MwScrapeArmed = false; _ran = false; return;
    }

    // FASE B — per medewerker het detail-endpoint (100% ruw behoud).
    console.log("%c[mw] FASE B — detail per medewerker (" + uniq.length + ")…", "color:#2563eb;font-weight:bold");
    var detOk = 0, detFail = 0;
    for (var i = 0; i < uniq.length; i += 1) {
      var emp = uniq[i];
      var d = await api("/api/employees-basic/" + encodeURIComponent(emp.id));
      if (d && (d.id || d.data)) { emp.detail = (d.data || d); detOk += 1; }
      else { emp.detail = null; detFail += 1; }
      if ((i + 1) % 20 === 0 || i + 1 === uniq.length) {
        console.log("[mw]   detail " + (i + 1) + "/" + uniq.length + " (ok=" + detOk + " fail=" + detFail + ")");
      }
      await new Promise(function (r) { setTimeout(r, 40); });
    }

    var compleet = (total == null) || (uniq.length >= total);
    var payload = {
      scraped_at: new Date().toISOString(),
      source: "BS2 /api/employees-basic (top-bar Medewerkers /main-employee/employees)",
      counts: {
        total: uniq.length,
        bs2_meta_total: total,
        compleet: compleet,
        http_fails: FAILS,
        detail_ok: detOk,
        detail_fail: detFail,
      },
      diag: diag,
      employees: uniq,
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "bs2-medewerkers-full.json";
    document.body.appendChild(a); a.click(); a.remove();
    if (!compleet) console.warn("%c[mw] ONVOLLEDIG: " + uniq.length + "/" + total + ". Stuur het JSON-bestand tóch — 'diag' toont per pagina het gedrag zodat Claude de paginatie kan fixen.", "color:#b45309;font-weight:bold");
    console.log("%c[mw] KLAAR " + (compleet ? "✓" : "⚠") + " medewerkers=" + uniq.length + " / BS2-meta=" + (total == null ? "?" : total) + " (compleet=" + compleet + ", detail ok=" + detOk + "/fail=" + detFail + ", fails " + FAILS + ")", compleet ? "color:green;font-weight:bold" : "color:#b45309;font-weight:bold");
    console.log("[mw] diag:", diag.join(" | "));
    console.log("%c→ bs2-medewerkers-full.json gedownload. Zeg 'klaar' tegen Claude.", "color:green;font-weight:bold");
  }

  console.log("%c[mw] GEWAPEND. Klik nu een paginering-pijl of herlaad de Medewerkers-lijst — scrape start automatisch.", "color:#2563eb;font-weight:bold");
})();
