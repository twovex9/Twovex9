/* ============================================================================
 * BS2 INCIDENTEN — VOLLEDIG: lijst + PER-INCIDENT DETAIL/AFHANDELEN/TAKEN
 *                   + GEDRAG-RECORDER   v2
 *
 * Het lijst-endpoint geeft alleen oppervlak-data. De échte inhoud zit op de
 * detail-/afhandel-pagina per incident (Cliëntprofiel-beoordeling, Zorgplan-
 * beoordeling, Advies en richtlijnen, Status-workflow, "Taken voor dit
 * incident"). v2 leert de exacte detail-endpoints uit BS2's EIGEN calls
 * (jij opent 1 incident) en haalt dan voor ALLE incidenten de volledige
 * detail + taken op. De recorder legt vast wat BS2 server-side doet bij
 * aanmaken / afhandelen / status wijzigen.
 *
 * Auth = bewezen patroon (token uit BS2's eigen request, omit-cookies).
 *
 * GEBRUIK (volg de console-aanwijzingen, stap voor stap):
 *  1. BS2 → /clients/manage-incidents → tab "Alle incidenten".
 *  2. F12 → Console → plak dit volledig → Enter → "[inc] GEWAPEND".
 *  3. Klik één paginering-pijl → token gekaapt, LIJST-scrape (144) + recorder aan.
 *  4. Wacht op "[inc] LIJST KLAAR". Console vraagt nu: OPEN 1 willekeurig
 *     incident (klik op een rij in "Alle incidenten"). Zo leer ik de exacte
 *     detail/taken-endpoints.
 *  5. Terug op de lijst → typ:  __incDetails()
 *     → haalt voor ALLE incidenten de volledige detail + taken op
 *       (kan ~1 min duren). Wacht op "[inc] DETAILS KLAAR".
 *  6. Test BS2 functioneel (recorder vangt alles):
 *       a. "Incident melden" → nieuw incident; zet in OMSCHRIJVING exact
 *          ZZZ-CLAUDE-TEST-2026-05-17 ; vul de rest realistisch; opslaan.
 *       b. Open dat incident → vul rechts "Incident afhandelen" in
 *          (Cliëntprofiel-/Zorgplan-beoordeling, Advies, Status →
 *          In behandeling, opslaan; daarna → Opgelost, opslaan).
 *       c. (optioneel) Taak toevoegen aan dit incident; archiveer/verwijder.
 *  7. Typ:  __incDump()  → bs2-incidenten-full.json download → stuur naar Claude.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__incArmed) { console.log("[inc] al gewapend — herlaad de pagina om opnieuw te starten."); return; }
  window.__incArmed = true;
  var CAP = null, APIBASE = null, _fetch = window.fetch;
  var REC = [], ENDPOINTS = {};
  var SCRAPE = null, DETAILS = {}, TASKS = {};
  var FIRST_INC_URL = null, DETAIL_TPL = null, TASKS_TPL = null;

  function originOf(u) { try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; } }
  function pathOnly(u) { try { return String(u).split("?")[0].replace(originOf(u) || "", ""); } catch (e) { return String(u); } }

  function record(method, url, reqBody, status, respText) {
    if (!/\/api\//.test(url)) return;
    var path = pathOnly(url);
    if (!/incident|note|audit|notif|categor|improvement|measure|task|assessment|beoordel/i.test(path)) return;
    ENDPOINTS[method + " " + path] = true;
    if (method === "GET" && /\/api\/incidents(\?|$)/.test(url) && !reqBody) return;
    var e = { t: new Date().toISOString(), method: method, path: path, status: status };
    if (reqBody) { try { e.req = JSON.parse(reqBody); } catch (x) { e.req = String(reqBody).slice(0, 2000); } }
    if (respText) { try { var j = JSON.parse(respText); e.resp = (j && j.data) ? j.data : j; } catch (x) { e.resp = String(respText).slice(0, 2000); } }
    if (e.resp && typeof e.resp === "object") { var s = JSON.stringify(e.resp); if (s.length > 5000) e.resp = s.slice(0, 5000) + "…(trunc)"; }
    REC.push(e);
    // leer detail/taken-template uit BS2's eigen GET's op een enkel incident
    try {
      var m = url.match(/\/api\/incidents\/([0-9a-f-]{6,})(\/[a-z-]+)?(\?|$)/i);
      if (m && method === "GET") {
        if (m[2] && /task|taak/i.test(m[2]) && !TASKS_TPL) TASKS_TPL = url.replace(m[1], "{id}");
        else if (!m[2] && !DETAIL_TPL) DETAIL_TPL = url.replace(m[1], "{id}");
      }
    } catch (x) {}
  }

  function arm(auth, sampleUrl) {
    if (CAP || !auth) return;
    CAP = { Authorization: auth, Accept: "application/json" };
    APIBASE = originOf(sampleUrl) || "https://api.etf.acceptance.besasuite.nl";
    console.log("%c[inc] token gekaapt ✓ — LIJST-scrape start, recorder AAN…", "color:green;font-weight:bold");
    setTimeout(runList, 150);
  }

  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    var body = init && init.body ? init.body : null;
    try {
      if (/\/api\//.test(url)) {
        var hh = (init && init.headers) || (input && input.headers), a = null;
        if (hh) { a = (hh instanceof Headers) ? (hh.get("Authorization") || hh.get("authorization")) : (hh.Authorization || hh.authorization); }
        if (a) arm(a, url);
        if (!FIRST_INC_URL && /\/api\/incidents(\?|$)/.test(url) && method === "GET") FIRST_INC_URL = url;
      }
    } catch (e) {}
    return _fetch.apply(this, arguments).then(function (r) {
      try { var c = r.clone(); c.text().then(function (t) { record(method, url, body, r.status, t); }); } catch (e) {}
      return r;
    });
  };
  var _o = XMLHttpRequest.prototype.open, _s = XMLHttpRequest.prototype.setRequestHeader, _se = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = (m || "GET").toUpperCase(); this.__u = u; return _o.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { if (/^authorization$/i.test(k) && !CAP) arm(v, this.__u || ""); } catch (e) {} return _s.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var x = this;
    try { if (!FIRST_INC_URL && x.__u && /\/api\/incidents(\?|$)/.test(String(x.__u)) && x.__m === "GET") FIRST_INC_URL = String(x.__u); } catch (e) {}
    x.addEventListener("load", function () { try { record(x.__m, String(x.__u), b, x.status, x.responseText); } catch (e) {} });
    return _se.apply(this, arguments);
  };

  async function api(u) {
    var url = u.indexOf("http") === 0 ? u : (APIBASE + u);
    try { var r = await _fetch(url, { headers: CAP, credentials: "omit", mode: "cors" }); if (!r.ok) return { __err: r.status }; return await r.json(); }
    catch (e) { return { __err: e.message }; }
  }

  function baseListQuery() {
    var u = FIRST_INC_URL || (APIBASE + "/api/incidents?with%5B%5D=client&with%5B%5D=category&with%5B%5D=reporter");
    var qi = u.indexOf("?");
    var params = qi >= 0 ? u.slice(qi + 1).split("&") : [];
    params = params.filter(function (p) { return !/^page=|^sort=|^per_page=|^status=|^limit=/i.test(p); });
    return "/api/incidents?" + params.concat(["per_page=100"]).join("&");
  }

  async function paginate(sortP, tag) {
    var seen = {}, q = baseListQuery(), total = null;
    for (var p = 1; p <= 60; p += 1) {
      if (total != null && SCRAPE.length >= total) return true;
      var j = await api(q + "&page=" + p + (sortP ? "&sort=" + encodeURIComponent(sortP) : ""));
      if (!j || j.__err) { console.warn("[inc] " + tag + p + " fail " + (j && j.__err)); break; }
      if (j.meta && typeof j.meta.total === "number") total = j.meta.total;
      var rows = Array.isArray(j) ? j : (j.data || []);
      var add = 0; rows.forEach(function (r) { var k = r && r.id != null ? String(r.id) : null; if (k && !seen[k]) { seen[k] = 1; SCRAPE.push(r); add += 1; } });
      var lp = (j.meta && j.meta.last_page) ? j.meta.last_page : Math.ceil((total || 144) / 15);
      console.log("[inc] " + tag + p + ": +" + add + " (" + SCRAPE.length + "/" + (total == null ? "?" : total) + ")");
      if (rows.length === 0 || p > lp + 1) break;
      await new Promise(function (r) { setTimeout(r, 55); });
    }
    SCRAPE.__total = total;
    return total != null && SCRAPE.length >= total;
  }

  var _ranL = false;
  async function runList() {
    if (_ranL || !CAP) return; _ranL = true;
    SCRAPE = [];
    console.log("[inc] LIJST scrape… basis=" + baseListQuery());
    var ok = await paginate("id", "id");
    if (!ok) ok = await paginate("created_at", "cr");
    if (!ok) ok = await paginate("-created_at", "cr-");
    if (!ok) ok = await paginate("", "ns");
    console.log("%c[inc] LIJST KLAAR — " + SCRAPE.length + "/" + (SCRAPE.__total == null ? "?" : SCRAPE.__total) + (ok ? " ✓" : " ⚠") + ".  NU: open in BS2 één willekeurig incident (klik een rij), ga terug naar de lijst, en typ daarna  __incDetails()", ok ? "color:green;font-weight:bold" : "color:#b45309;font-weight:bold");
  }

  window.__incDetails = async function () {
    if (!CAP || !SCRAPE) { console.warn("[inc] eerst lijst-scrape afwachten."); return "wacht"; }
    if (!DETAIL_TPL) {
      console.warn("%c[inc] Ik heb het detail-endpoint nog niet geleerd. Open EERST 1 incident in BS2 (klik een rij), wacht tot het detail laadt, ga terug, en roep __incDetails() opnieuw aan.", "color:#b45309;font-weight:bold");
      return "open-eerst-1-incident";
    }
    console.log("[inc] detail-template = " + DETAIL_TPL + (TASKS_TPL ? " | taken = " + TASKS_TPL : " | (taken-endpoint nog onbekend; open evt. een incident met taken)"));
    var ids = SCRAPE.map(function (r) { return String(r.id); }), done = 0;
    for (var i = 0; i < ids.length; i += 1) {
      var id = ids[i];
      var d = await api(DETAIL_TPL.replace("{id}", id));
      if (d && !d.__err) DETAILS[id] = (d && d.data) ? d.data : d;
      if (TASKS_TPL) { var tk = await api(TASKS_TPL.replace("{id}", id)); if (tk && !tk.__err) TASKS[id] = Array.isArray(tk) ? tk : (tk.data || tk); }
      done += 1;
      if (done % 15 === 0 || done === ids.length) console.log("[inc] details " + done + "/" + ids.length);
      await new Promise(function (r) { setTimeout(r, 45); });
    }
    console.log("%c[inc] DETAILS KLAAR — " + Object.keys(DETAILS).length + " details, " + Object.keys(TASKS).length + " met taken. Doe nu de functionele test (ZZZ-CLAUDE-TEST incident aanmaken + afhandelen + status), daarna __incDump().", "color:green;font-weight:bold");
    return "details-ok";
  };

  window.__incDump = function () {
    var payload = {
      scraped_at: new Date().toISOString(),
      source: "BS2 incidenten v2 — lijst + detail/afhandelen/taken + gedrag",
      counts: { incidenten: SCRAPE ? SCRAPE.length : 0, bs2_meta_total: SCRAPE ? (SCRAPE.__total || null) : null, details: Object.keys(DETAILS).length, met_taken: Object.keys(TASKS).length, recorded_calls: REC.length },
      list_query_used: baseListQuery(),
      detail_template: DETAIL_TPL, tasks_template: TASKS_TPL,
      endpoints: Object.keys(ENDPOINTS),
      recorded_behavior: REC,
      incidenten_lijst: SCRAPE || [],
      incidenten_detail: DETAILS,
      incidenten_taken: TASKS,
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "bs2-incidenten-full.json";
    document.body.appendChild(a); a.click(); a.remove();
    console.log("%c[inc] → bs2-incidenten-full.json (lijst=" + (SCRAPE ? SCRAPE.length : 0) + ", detail=" + Object.keys(DETAILS).length + ", gedrag=" + REC.length + "). Stuur naar Claude.", "color:green;font-weight:bold");
    return "dump-ok";
  };

  console.log("%c[inc] GEWAPEND. Klik een paginering-pijl → lijst-scrape + recorder. Volg daarna de console: open 1 incident → __incDetails() → test → __incDump().", "color:#2563eb;font-weight:bold");
})();
