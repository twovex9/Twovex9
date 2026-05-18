/* ============================================================================
 * BS2 AUDIT-LOGS — IN-BROWSER SCRAPE  v3  (robuust, sessie-replay)
 *
 * Waarom v3: het Node-pad (los token uit opslag/header) gaf herhaald
 * HTTP 401 — token te kort geldig / mogelijk cookie-sessie. Dit script
 * draait IN je browser-tab en HERGEBRUIKT exact je al-werkende BS2-sessie
 * (zelfde origin, zelfde cookies, zelfde Authorization als de app zelf
 * gebruikt). Geen los token, geen CORS, geen Node. Read-only: alleen GET
 * /api/audit-logs (precies wat de pagina zelf ook doet) — niets wordt op
 * BS2 gewijzigd.
 *
 * Streamt direct naar een bestand op schijf via de File System Access
 * API (Chrome) → geen geheugen-explosie bij 160k records. Hervatbaar:
 * kan een bestaand half bestand verder aanvullen.
 *
 * GEBRUIK:
 *  1. BS2: https://etf.acceptance.besasuite.nl/audit  (lijst geladen).
 *  2. F12 → Console → plak dit volledig → Enter. Paneel rechtsboven.
 *  3. NIET herladen. Klik in de audit-lijst 1× naar **pagina 2** zodat ik
 *     je werkende /api/audit-logs-call zie (paneel wordt groen).
 *  4. Klik **▶ Start volledige scrape** → kies waar het bestand komt
 *     (bv. Downloads, naam: bs2-audit-logs.ndjson). Laat de tab open;
 *     volg de voortgang in het paneel.
 *  5. Klaar? Het paneel toont "KLAAR — uniek == total". Maak er een
 *     screenshot van en stuur die + zeg dat het bestand klaarstaat.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2AuditScrape) { try { document.getElementById("__bs2as").remove(); } catch (e) {} }
  window.__bs2AuditScrape = true;

  var BASE = null;        // bv. https://api.etf.acceptance.besasuite.nl/api/audit-logs
  var AUTH = null;        // Authorization-header die de app zelf stuurt (indien aanwezig)
  var sawOK = false;      // minstens 1 echte /api/audit-logs → HTTP 200 gezien
  var running = false, paused = false, done = false;
  var seen = new Set();
  var actionTypes = {};
  var total = null, LIMIT = 15, page = 1, wrote = 0;
  var writer = null, t0 = 0, statusMsg = "";

  var box = document.createElement("div");
  box.id = "__bs2as";
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;"
    + "width:380px;font:13px/1.5 system-ui,Segoe UI,Arial;background:#0f172a;"
    + "color:#e2e8f0;border:2px solid #2563eb;border-radius:12px;padding:14px;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); }

  function render() {
    var h = "";
    if (done) {
      h = '<div style="font-weight:800;color:#4ade80;margin-bottom:6px">✓ KLAAR</div>'
        + '<div style="font-size:12px">' + esc(statusMsg) + '</div>';
    } else if (running) {
      var el = (Date.now() - t0) / 1000;
      var rate = wrote > 0 && el > 0 ? wrote / el : 0;
      var remain = total != null ? Math.max(0, total - seen.size) : null;
      var eta = rate > 0 && remain != null ? Math.round(remain / rate / 60) : null;
      h = '<div style="font-weight:800;color:#60a5fa;margin-bottom:6px">'
        + (paused ? "⏸ GEPAUZEERD" : "⏳ Bezig…") + '</div>'
        + '<div style="font-size:12px">pagina ' + page + ' · uniek <b>' + seen.size + "</b>"
        + (total != null ? " / " + total : "") + " · limit " + LIMIT
        + (rate ? " · " + Math.round(rate) + " rec/s" : "")
        + (eta != null ? " · ETA ~" + eta + " min" : "") + '</div>'
        + '<div style="font-size:11px;color:#94a3b8;margin-top:6px">' + esc(statusMsg) + '</div>'
        + (paused ? '<button id="__bs2resume" style="width:100%;margin-top:9px;padding:9px;'
          + 'border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer">'
          + '↻ Hervat (na 1× klikken in BS2)</button>' : "");
    } else if (sawOK) {
      h = '<div style="font-weight:800;color:#4ade80;margin-bottom:6px">✓ Sessie OK</div>'
        + '<div style="font-size:12px;color:#cbd5e1">Werkende /api/audit-logs gezien. '
        + 'Klik hieronder en kies een opslagbestand (laat de tab open tijdens de run).</div>'
        + '<button id="__bs2start" style="width:100%;margin-top:9px;padding:10px;border:0;'
        + 'border-radius:8px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer">'
        + '▶ Start volledige scrape</button>'
        + '<button id="__bs2resumefile" style="width:100%;margin-top:7px;padding:8px;'
        + 'border:1px solid #475569;border-radius:8px;background:transparent;color:#e2e8f0;'
        + 'cursor:pointer">↻ Hervat in bestaand bestand</button>';
    } else {
      h = '<div style="font-weight:800;color:#f59e0b;margin-bottom:6px">⏳ Wachten op je sessie</div>'
        + '<div style="font-size:12px;color:#cbd5e1">⚠️ <b>NIET</b> herladen. Klik in de '
        + 'audit-lijst 1× naar <b>pagina 2</b> (of wissel een filter) — dan zie ik je '
        + 'werkende /api/audit-logs-call.</div>';
    }
    box.innerHTML = h;
    var s = document.getElementById("__bs2start");
    if (s) s.onclick = function () { startScrape(false); };
    var rf = document.getElementById("__bs2resumefile");
    if (rf) rf.onclick = function () { startScrape(true); };
    var rs = document.getElementById("__bs2resume");
    if (rs) rs.onclick = function () { paused = false; render(); loop(); };
  }

  // ---- sessie-replay capture: zie wat de app zelf doet ----
  function noteReq(url, authVal) {
    try {
      if (!/\/api\/audit-logs/.test(String(url))) return;
      var u = new URL(String(url).replace(/\.nl:\//, ".nl/"), location.origin);
      BASE = u.origin + u.pathname;
      if (authVal && /^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+/.test(String(authVal).trim())) AUTH = String(authVal).trim();
    } catch (e) {}
  }
  var _f = window.fetch;
  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var av = null;
    try {
      var hh = (init && init.headers) || (input && input.headers);
      if (hh) av = (typeof hh.get === "function") ? hh.get("Authorization") : (hh.Authorization || hh.authorization);
    } catch (e) {}
    noteReq(url, av);
    var p = _f.apply(this, arguments);
    try {
      if (/\/api\/audit-logs/.test(String(url))) {
        p.then(function (r) { if (r && r.status === 200) { sawOK = true; if (!running) render(); } return r; }).catch(function () {});
      }
    } catch (e) {}
    return p;
  };
  var _o = XMLHttpRequest.prototype.open;
  var _srh = XMLHttpRequest.prototype.setRequestHeader;
  var _snd = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return _o.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (k && String(k).toLowerCase() === "authorization") this.__a = v; } catch (e) {}
    return _srh.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    try {
      if (/\/api\/audit-logs/.test(String(x.__u || ""))) {
        noteReq(x.__u, x.__a);
        x.addEventListener("load", function () { if (x.status === 200) { sawOK = true; if (!running) render(); } });
      }
    } catch (e) {}
    return _snd.apply(this, arguments);
  };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function pageUrl(p, lim) {
    return BASE + "?with%5B%5D=causer&sort=id&page=" + p + "&limit=" + lim;
  }
  async function getJSON(p, lim) {
    var headers = { Accept: "application/json" };
    if (AUTH) headers.Authorization = AUTH;
    for (var attempt = 1; attempt <= 6; attempt++) {
      var r;
      try {
        r = await _f.call(window, pageUrl(p, lim), { method: "GET", headers: headers, credentials: "include" });
      } catch (e) {
        await sleep(Math.min(20000, 600 * Math.pow(2, attempt))); continue;
      }
      if (r.status === 401 || r.status === 403) { var e2 = new Error("AUTH401"); e2.auth = true; throw e2; }
      if (r.status === 429 || r.status >= 500) { await sleep(Math.min(45000, 800 * Math.pow(2, attempt))); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }
    throw new Error("te veel mislukte pogingen op pagina " + p);
  }

  async function pickWriter(resume) {
    if (typeof window.showSaveFilePicker !== "function" && typeof window.showOpenFilePicker !== "function") {
      throw new Error("Deze browser heeft geen File System Access API — gebruik Chrome.");
    }
    var handle;
    if (resume) {
      var arr = await window.showOpenFilePicker({ types: [{ description: "NDJSON", accept: { "application/x-ndjson": [".ndjson"] } }] });
      handle = arr[0];
      var f = await handle.getFile();
      var txt = await f.text();
      txt.split("\n").forEach(function (ln) {
        ln = ln.trim(); if (!ln) return;
        try { var o = JSON.parse(ln); if (o && o.id != null) { seen.add(Number(o.id)); if (o.action_type) actionTypes[o.action_type] = (actionTypes[o.action_type] || 0) + 1; } } catch (e) {}
      });
      writer = await handle.createWritable({ keepExistingData: true });
      await writer.seek(f.size);
      statusMsg = "Hervat: " + seen.size + " records al in bestand.";
    } else {
      handle = await window.showSaveFilePicker({ suggestedName: "bs2-audit-logs.ndjson", types: [{ description: "NDJSON", accept: { "application/x-ndjson": [".ndjson"] } }] });
      writer = await handle.createWritable();
    }
  }

  async function startScrape(resume) {
    if (running) return;
    if (!sawOK || !BASE) { statusMsg = "Nog geen werkende call gezien — klik eerst in BS2 naar pagina 2."; render(); return; }
    try { await pickWriter(!!resume); }
    catch (e) { statusMsg = "Geen bestand gekozen / " + (e && e.message || e); render(); return; }
    running = true; done = false; paused = false; t0 = Date.now();
    // limit-probe
    statusMsg = "Limit-probe…"; render();
    var cands = [1000, 200, 100, 15];
    for (var i = 0; i < cands.length; i++) {
      try {
        var j = await getJSON(1, cands[i]);
        var rows = (j && j.data) || [];
        var pp = j && j.meta && j.meta.per_page;
        if (j && j.meta && typeof j.meta.total === "number") total = j.meta.total;
        if (rows.length > 15 || pp > 15) { LIMIT = Math.max(rows.length, Number(pp) || 0); break; }
        LIMIT = 15;
      } catch (e) { if (e && e.auth) { onAuthFail(); return; } }
      await sleep(120);
    }
    statusMsg = "LIMIT=" + LIMIT + (total != null ? " · total=" + total : "");
    page = resume && seen.size ? Math.floor(seen.size / LIMIT) + 1 : 1;
    render();
    loop();
  }

  function onAuthFail() {
    paused = true;
    statusMsg = "Sessie verlopen (401). Klik 1× in BS2 (bv. naar pagina 1 v/d audit-lijst) "
      + "zodat de app de sessie ververst, en klik dan Hervat. Voortgang is bewaard.";
    render();
  }

  async function loop() {
    if (paused || done) return;
    try {
      while (true) {
        var j = await getJSON(page, LIMIT);
        var rows = (j && j.data) || [];
        if (j && j.meta) {
          if (typeof j.meta.total === "number") total = j.meta.total;
        }
        var addedTxt = "";
        for (var k = 0; k < rows.length; k++) {
          var r = rows[k], id = r && r.id != null ? Number(r.id) : null;
          if (id == null || seen.has(id)) continue;
          seen.add(id);
          if (r.action_type) actionTypes[r.action_type] = (actionTypes[r.action_type] || 0) + 1;
          await writer.write(JSON.stringify(r) + "\n");
          wrote++;
        }
        var reachedAll = total != null && seen.size >= total;
        if (page % 25 === 0 || rows.length < LIMIT) { statusMsg = "…pagina " + page + addedTxt; render(); }
        if (rows.length === 0 || (reachedAll && rows.length < LIMIT)) break;
        page++;
        await sleep(110);
      }
      await writer.close();
      done = true; running = false;
      var ids = Array.from(seen).sort(function (a, b) { return a - b; });
      var gaps = 0;
      for (var g = 1; g < ids.length; g++) if (ids[g] - ids[g - 1] > 1) gaps += (ids[g] - ids[g - 1] - 1);
      statusMsg = "uniek " + seen.size + (total != null ? " / " + total : "")
        + (total != null && seen.size >= total ? "  ✔ COMPLEET" : "  ✖ onvolledig (Hervat in bestaand bestand)")
        + " · id " + (ids[0]) + "…" + (ids[ids.length - 1]) + " · gaten " + gaps
        + " · acties " + JSON.stringify(actionTypes);
      render();
      try {
        var sum = { scraped_at: new Date().toISOString(), endpoint: BASE, effective_limit: LIMIT,
          server_total: total, unique: seen.size, complete: total != null && seen.size >= total,
          id_min: ids[0], id_max: ids[ids.length - 1], id_gap_total: gaps, action_types: actionTypes };
        var bl = new Blob([JSON.stringify(sum, null, 2)], { type: "application/json" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(bl);
        a.download = "bs2-audit-summary.json"; document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {}
      console.log("%c[audit-scrape] KLAAR " + seen.size + "/" + total, "color:#16a34a;font-weight:bold", actionTypes);
    } catch (e) {
      if (e && e.auth) { onAuthFail(); return; }
      paused = true;
      statusMsg = "Fout: " + (e && e.message || e) + " — klik Hervat om door te gaan.";
      render();
    }
  }

  render();
  console.log("%c[audit-scrape] v3 actief — NIET herladen; klik in BS2 naar pagina 2, dan ▶ Start.",
    "color:#2563eb;font-weight:bold");
})();
