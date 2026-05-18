/* ============================================================================
 * BS2 BELEID/DOCUMENTEN — STRIKT READ-ONLY SCRAPE  v2 (productie, on-page UI)
 *
 * ⚠️ PRODUCTIE: https://etf.besasuite.nl/documents — GEEN sandbox.
 * Endpoint live bevestigd (niet gegokt, uit bs2-net.json):
 *   GET https://api.etf.besasuite.nl/api/documents
 *       ?filter[target][type]=policy&filter[target][id]=policy&page=N&limit=15
 *   (Bearer-auth, meta.total=25, per_page=15). Elk record heeft
 *   file{ name, extension, url(=pre-signed S3, 10 min), path, size }.
 *
 * HARDE READ-ONLY GARANTIES:
 *  - Uitsluitend method:"GET". NOOIT POST/PATCH/PUT/DELETE. Geen klikken,
 *    geen DOM-mutatie van BS2 (alleen een lokaal debug-paneel in jouw tab,
 *    weg bij herladen). Geen datamutatie.
 *  - Lijst-API: Bearer-token (uit localStorage/sessionStorage of passief uit
 *    een eigen GET). S3-bestand: GEEN Authorization-header (zou de presigned
 *    signature breken), credentials:"omit".
 *  - Zelf-bevattende store-only ZIP — geen externe CDN op productie.
 *  - Console-filter maakt niet uit: alles + knoppen staan in een paneel.
 *
 * GEBRUIK:
 *  1. https://etf.besasuite.nl/documents (ingelogd). F12 → Console →
 *     plak dit → Enter. Rechtsboven verschijnt het paneel.
 *  2. Het start automatisch (token uit storage). Zo niet: klik 1× een
 *     paginering-pijl (zodat BS2 zelf zijn GET doet) en klik "▶ Start".
 *  3. Wacht tot "KLAAR ✓". Klik "⬇ JSON" en "⬇ ZIP" in het paneel.
 *     Stuur bs2-documents.json (+ bs2-beleid-documenten.zip) naar Claude.
 * ==========================================================================*/
(function () {
  "use strict";
  var W = window, D = document;
  if (W.__bs2DOC) { try { W.__bs2DOC.show(); } catch (e) {} return; }

  var APIBASE = "https://api.etf.besasuite.nl";
  var LISTPATH = "/api/documents";
  var FILTER = "filter%5Btarget%5D%5Btype%5D=policy&filter%5Btarget%5D%5Bid%5D=policy";
  var _origFetch = W.fetch.bind(W);
  var S = { rec: [], files: [], token: null, running: false, done: false };
  W.__bs2DOC = S;

  // ---- token: probeer storage (JWT), val terug op passieve header-capture ----
  function isJwt(v) { return typeof v === "string" && v.split(".").length === 3 && v.length > 200; }
  function findToken() {
    try {
      for (var st = 0; st < 2; st++) {
        var store = st === 0 ? localStorage : sessionStorage;
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i), v = store.getItem(k);
          if (isJwt(v)) return "Bearer " + v;
          try {
            var j = JSON.parse(v);
            var cand = j && (j.access_token || j.token || (j.currentSession && j.currentSession.access_token) || (j.user && j.user.token));
            if (isJwt(cand)) return "Bearer " + cand;
          } catch (e) {}
        }
      }
    } catch (e) {}
    return null;
  }
  // passieve fallback: lees Authorization uit een eigen GET (niet wijzigen)
  W.fetch = function (input, init) {
    try {
      if (!S.token) {
        var hh = (init && init.headers) || (input && input.headers), a = null;
        if (hh) a = (hh instanceof Headers) ? (hh.get("authorization") || hh.get("Authorization")) : (hh.Authorization || hh.authorization);
        if (a && String(a).length > 40) { S.token = a; setStatus("token opgevangen — start…"); maybeAuto(); }
      }
    } catch (e) {}
    return _origFetch.apply(W, arguments);
  };
  var _xo = XMLHttpRequest.prototype.open, _xs = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; return _xo.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (!S.token && /^authorization$/i.test(k) && String(v).length > 40) { S.token = v; setStatus("token opgevangen — start…"); maybeAuto(); } } catch (e) {}
    return _xs.apply(this, arguments);
  };

  // ---- GET-only helpers ----
  async function apiGET(qs) {
    var r = await _origFetch(APIBASE + LISTPATH + "?" + qs, {
      method: "GET", headers: { Authorization: S.token, Accept: "application/json" },
      credentials: "omit", mode: "cors",
    });
    if (!r.ok) throw new Error("API HTTP " + r.status);
    return r.json();
  }
  async function fileGET(url) { // S3 presigned: GEEN auth-header
    var r = await _origFetch(url, { method: "GET", credentials: "omit", mode: "cors" });
    if (!r.ok) throw new Error("S3 HTTP " + r.status);
    return new Uint8Array(await (await r.blob()).arrayBuffer());
  }

  // ---- store-only ZIP (zelf-bevattend) ----
  var CRCT = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {
    var chunks = [], central = [], offset = 0, enc = new TextEncoder();
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var nb = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      var lh = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nb.length), u16(0));
      chunks.push(new Uint8Array(lh), nb, f.data);
      var ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(ch), nb);
      offset += lh.length + nb.length + sz;
    });
    var cs = offset, csz = 0; central.forEach(function (c) { csz += c.length; });
    var eo = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(csz), u32(cs), u16(0));
    return new Blob(chunks.concat(central, [new Uint8Array(eo)]), { type: "application/zip" });
  }
  function dl(blob, name) { var a = D.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; D.body.appendChild(a); a.click(); a.remove(); }
  function safe(s, fb) { s = String(s == null ? "" : s).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim(); return s || fb; }

  // ---- paneel ----
  var box = D.createElement("div");
  box.setAttribute("style", "position:fixed;top:12px;right:12px;z-index:2147483647;width:430px;background:#0b1020;color:#e6edf3;font:12px/1.5 monospace;border:2px solid #2563eb;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);padding:10px 12px;");
  box.innerHTML = '<div style="position:absolute;top:6px;right:10px;cursor:pointer;color:#94a3b8;font-size:16px;" id="__dX">×</div>'
    + '<b style="color:#7dd3fc;font-size:13px;">[doc] READ-ONLY scrape — Beleid</b>'
    + '<div id="__dStatus" style="color:#fbbf24;margin:8px 0;">init…</div>'
    + '<div style="color:#cbd5e1;margin:4px 0 6px;">PDF-bytes lukken niet in de browser (S3-CORS). '
    + 'Download de <b>token</b> hieronder en draai daarna het Node-script (geen CORS in Node).</div>'
    + '<div style="display:flex;gap:6px;margin:6px 0;">'
    + '<button id="__dTok" style="flex:1.4;padding:8px;border:0;border-radius:6px;background:#dc2626;color:#fff;font:bold 12px monospace;cursor:pointer;">⬇ Token</button>'
    + '<button id="__dStart" style="flex:1;padding:8px;border:0;border-radius:6px;background:#475569;color:#fff;font:bold 12px monospace;cursor:pointer;">▶ Start</button>'
    + '<button id="__dJson" style="flex:1;padding:8px;border:0;border-radius:6px;background:#2563eb;color:#fff;font:bold 12px monospace;cursor:pointer;">⬇ JSON</button>'
    + '</div>';
  (D.body || D.documentElement).appendChild(box);
  D.getElementById("__dX").onclick = function () { box.style.display = "none"; };
  S.show = function () { box.style.display = ""; };
  function setStatus(t) { var e = D.getElementById("__dStatus"); if (e) e.textContent = t; }

  function buildPayload() {
    return { scraped_at: new Date().toISOString(), source: "BS2 PRODUCTIE /api/documents (policy, read-only)", origin: location.origin, endpoint: APIBASE + LISTPATH, counts: { documents: S.rec.length, files_ok: S.files.length }, documents: S.rec };
  }
  function rawJwt() { return String(S.token || "").replace(/^Bearer\s+/i, "").trim(); }
  D.getElementById("__dTok").onclick = function () {
    if (!S.token) S.token = findToken();
    var jwt = rawJwt();
    if (!jwt) { setStatus("GEEN token — klik 1× een paginering-pijl onderaan, dan opnieuw ⬇ Token."); return; }
    dl(new Blob([jwt], { type: "text/plain" }), "bs2-token.txt");
    setStatus("token gedownload → bs2-token.txt. Geef dit aan Claude / draai het Node-script.");
  };
  D.getElementById("__dJson").onclick = function () { dl(new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" }), "bs2-documents.json"); };
  D.getElementById("__dStart").onclick = function () { run(); };

  function maybeAuto() { if (!S.running && !S.done && S.token) run(); }

  async function run() {
    if (S.running || S.done) return;
    if (!S.token) S.token = findToken();
    if (!S.token) { setStatus("GEEN token gevonden — klik 1× een paginering-pijl, dan ▶ Start."); return; }
    S.running = true;
    try {
      setStatus("documentenlijst ophalen (GET)…");
      var page = 1, total = null, byId = {};
      while (page <= 50) {
        var j = await apiGET(FILTER + "&page=" + page + "&limit=15");
        if (j && j.meta && typeof j.meta.total === "number") total = j.meta.total;
        var rows = (j && j.data) || [];
        rows.forEach(function (r) { var k = r && r.id != null ? String(r.id) : JSON.stringify(r); if (!byId[k]) { byId[k] = 1; S.rec.push(r); } });
        setStatus("lijst… " + S.rec.length + (total != null ? "/" + total : "") + " (pagina " + page + ")");
        var lp = (j && j.meta && j.meta.last_page) ? j.meta.last_page : null;
        if (!rows.length || (total != null && S.rec.length >= total) || (lp && page >= lp)) break;
        page++; await new Promise(function (r) { setTimeout(r, 150); });
      }
      if (!S.rec.length) { setStatus("0 documenten — token ongeldig? klik paginering-pijl + ▶ Start."); S.running = false; return; }

      var ok = 0, fail = 0, used = {};
      for (var i = 0; i < S.rec.length; i++) {
        var rec = S.rec[i], f = rec && rec.file;
        if (!f || !f.url) { fail++; rec.__file = { ok: false, reason: "geen file.url" }; continue; }
        try {
          var data = await fileGET(f.url);
          var ext = (f.extension || (String(f.name).match(/\.([a-z0-9]+)$/i) || [, "pdf"])[1] || "pdf").toLowerCase();
          var bn = safe(f.name || rec.name || ("document-" + i), "document-" + i);
          if (!bn.toLowerCase().endsWith("." + ext)) bn += "." + ext;
          if (used[bn]) bn = bn.replace(/(\.[a-z0-9]+)$/i, "-" + (rec.id || i) + "$1");
          used[bn] = 1;
          S.files.push({ name: bn, data: data });
          rec.__file = { ok: true, zip: bn, bytes: data.length, path: f.path };
          ok++;
        } catch (e) { fail++; rec.__file = { ok: false, reason: e.message, path: f.path, url_sample: String(f.url).slice(0, 120) }; }
        setStatus("bestanden… " + (i + 1) + "/" + S.rec.length + " (ok=" + ok + " fail=" + fail + ")");
        await new Promise(function (r) { setTimeout(r, 150); });
      }
      S.done = true; S.running = false;
      dl(new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" }), "bs2-documents.json");
      if (S.files.length) dl(zipStore(S.files), "bs2-beleid-documenten.zip");
      setStatus("KLAAR ✓  documenten=" + S.rec.length + " · bestanden ok=" + ok + " fail=" + fail + ". (downloads gestart; knoppen voor herhaling)");
    } catch (e) {
      S.running = false;
      setStatus("FOUT: " + e.message + " — klik 1× een paginering-pijl, dan ▶ Start.");
    }
  }

  setStatus("paneel actief. Token zoeken…");
  S.token = findToken();
  if (S.token) { setStatus("token gevonden — scrape start…"); run(); }
  else setStatus("nog geen token — klik 1× een paginering-pijl onderaan de lijst, dan ▶ Start.");
})();
