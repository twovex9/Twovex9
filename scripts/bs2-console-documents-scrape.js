/* ============================================================================
 * BS2 BELEID/DOCUMENTEN — STRIKT READ-ONLY SCRAPE  v1
 *
 * ⚠️ PRODUCTIE: https://etf.besasuite.nl/documents — GEEN sandbox.
 * Deze code WIJZIGT NIETS. Harde garanties:
 *  - Elke eigen call is HARD method:"GET" + credentials:"omit". NOOIT
 *    POST/PATCH/PUT/DELETE. Geen DOM-acties, geen klikken, geen uploads.
 *  - We patchen fetch/XHR ALLEEN om PASSIEF de Authorization-token + de
 *    echte documenten-API-URL te LEZEN uit BS2's eigen GET. Het eigen
 *    verkeer van de pagina wordt ongemoeid doorgelaten.
 *  - Endpoint wordt NIET gegokt — afgeleid uit de call die de pagina zelf
 *    doet (HARDCORE METHODIEK STAP 1).
 *  - Zelf-bevattende store-only ZIP: geen externe library/CDN op productie.
 *
 * GEBRUIK:
 *  1. Open https://etf.besasuite.nl/documents (ingelogd, jouw sessie).
 *  2. F12 → Console → plak dit volledig → Enter → "[doc] GEWAPEND".
 *  3. Klik 1× op een paginering-pijl OF herlaad de lijst (zodat BS2 zelf
 *     zijn /api/...documents GET doet → token + endpoint gelezen).
 *  4. (Aanbevolen) klik op het OOG-icoon (= Bekijken, read-only) van ÉÉN
 *     document — dan leert de scraper de exacte bestands-download-URL.
 *  5. Wacht op "[doc] KLAAR ✓". Er worden 2 bestanden gedownload:
 *       bs2-documents.json  +  bs2-beleid-documenten.zip
 *     (typ desnoods  __docDump()  om handmatig te forceren.)
 *  6. Laat beide in C:\Users\sonck\Downloads staan en zeg "klaar".
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2DocRO) { console.log("[doc] al actief — herlaad de pagina om opnieuw te starten."); return; }
  window.__bs2DocRO = true;

  var TOKEN = null, APIBASE = null, LISTURL = null, FILEURL = null, _fetch = window.fetch;
  var REC = [], byId = {}, total = null, diag = [], FAILS = 0, _ran = false, _done = false;

  function originOf(u) { try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; } }
  function isDocApi(u) { return /\/api\/[^?]*document/i.test(String(u || "")); }
  function looksLikeFileGet(u) { return /\/(documents?|files?|media|download|storage)\//i.test(String(u || "")) && !/\/api\/documents(\?|$)/i.test(String(u || "")); }

  function observe(auth, url, method) {
    if (method !== "GET") return;            // alleen GET observeren
    if (auth && !TOKEN) TOKEN = auth;
    if (url && !APIBASE && /\/api\//.test(url)) APIBASE = originOf(url);
    if (url && !LISTURL && isDocApi(url)) LISTURL = url;
    if (url && !FILEURL && looksLikeFileGet(url) && /\/api\//.test(url)) FILEURL = url;
  }

  // PASSIEF: lees headers, laat de call ongemoeid door.
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === "string") ? input : (input && input.url) || "";
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var hh = (init && init.headers) || (input && input.headers), a = null;
      if (hh) { a = (hh instanceof Headers) ? (hh.get("authorization") || hh.get("Authorization")) : (hh.Authorization || hh.authorization); }
      observe(a, url, method);
      if (TOKEN && LISTURL && !_ran) setTimeout(run, 400);
    } catch (e) {}
    return _fetch.apply(this, arguments);   // ongemoeid
  };
  var _open = XMLHttpRequest.prototype.open, _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = String(m || "GET").toUpperCase(); this.__u = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try {
      if (this.__m === "GET") {
        if (/^authorization$/i.test(k)) observe(v, this.__u || "", "GET");
        if (this.__u) observe(null, this.__u, "GET");
        if (TOKEN && LISTURL && !_ran) setTimeout(run, 400);
      }
    } catch (e) {}
    return _set.apply(this, arguments);
  };

  // ---- GET-only fetch helper ----
  async function GET(u, asBlob) {
    var url = String(u).indexOf("http") === 0 ? u : (APIBASE + u);
    var r = await _fetch(url, {
      method: "GET",
      headers: { Authorization: TOKEN, Accept: asBlob ? "*/*" : "application/json" },
      credentials: "omit", mode: "cors",
    });
    if (!r.ok) { FAILS += 1; throw new Error("HTTP " + r.status + " " + url); }
    return asBlob ? await r.blob() : await r.json();
  }

  // ---- store-only ZIP (zelf-bevattend, geen externe code) ----
  var CRCT = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function strBytes(s) { return new TextEncoder().encode(s); }
  function zipStore(files) { // files: [{name, data:Uint8Array}]
    var chunks = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var nameB = strBytes(f.name), crc = crc32(f.data), sz = f.data.length;
      var lh = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0));
      chunks.push(new Uint8Array(lh)); chunks.push(nameB); chunks.push(f.data);
      var ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset));
      central.push(new Uint8Array(ch)); central.push(nameB);
      offset += lh.length + nameB.length + sz;
    });
    var cStart = offset, cSize = 0;
    central.forEach(function (c) { cSize += c.length; });
    var eo = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cSize), u32(cStart), u16(0));
    var all = chunks.concat(central, [new Uint8Array(eo)]);
    return new Blob(all, { type: "application/zip" });
  }

  function dl(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function safeName(s, fb) {
    s = String(s || fb || "bestand").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
    return s || fb || "bestand";
  }

  // Diep-scan een record naar een bruikbare bestands-URL (absoluut http(s)).
  function findFileUrl(rec) {
    var hit = null;
    (function walk(o, depth) {
      if (hit || o == null || depth > 6) return;
      if (typeof o === "string") {
        if (/^https?:\/\/.+\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|zip)(\?|#|$)/i.test(o)) hit = o;
        return;
      }
      if (typeof o === "object") {
        var pref = ["original_url", "download_url", "file_url", "url", "path"];
        for (var i = 0; i < pref.length; i++) {
          var v = o[pref[i]];
          if (typeof v === "string" && /^https?:\/\//i.test(v) && /\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|zip)(\?|#|$)/i.test(v)) { hit = v; return; }
        }
        for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) walk(o[k], depth + 1); }
      }
    })(rec, 0);
    // Als de pagina zelf een file-GET deed, gebruik dat patroon met dit id.
    if (!hit && FILEURL && rec && rec.id != null) {
      try { hit = String(FILEURL).replace(/(\/)(\d+|[0-9a-f-]{8,})(\/?)(download|view|preview)?(\?|#|$)/i, "$1" + rec.id + "$3$4$5"); } catch (e) {}
    }
    return hit;
  }

  function take(j, tag) {
    if (!j) { diag.push(tag + ":FAIL"); return 0; }
    if (j.meta && typeof j.meta.total === "number") total = j.meta.total;
    var rows = Array.isArray(j) ? j : (j.data || []);
    var add = 0;
    rows.forEach(function (r) {
      var k = r && r.id != null ? String(r.id) : JSON.stringify(r).slice(0, 60);
      if (!byId[k]) { byId[k] = 1; REC.push(r); add += 1; }
    });
    diag.push(tag + ":l" + rows.length + "+" + add + "(" + REC.length + "/" + (total == null ? "?" : total) + ")");
    return rows.length;
  }

  function listBase() {
    // basis-pad uit de geObserveerde lijst-URL (endpoint NIET gokken).
    try {
      var u = new URL(LISTURL, location.origin);
      return u.origin + u.pathname;
    } catch (e) { return (APIBASE || "") + "/api/documents"; }
  }

  async function paginate(sortParam, tagPrefix) {
    var base = listBase();
    for (var p = 1; p <= 80; p += 1) {
      if (total != null && REC.length >= total) return true;
      var qs = base + "?page=" + p + "&per_page=100" + (sortParam ? "&sort=" + encodeURIComponent(sortParam) : "");
      var j = null;
      try { j = await GET(qs, false); } catch (e) { diag.push(tagPrefix + p + ":ERR"); break; }
      var len = take(j, tagPrefix + p);
      var lp = (j && j.meta && j.meta.last_page) ? j.meta.last_page : null;
      if (len === 0 || (lp && p > lp + 1)) break;
      await new Promise(function (r) { setTimeout(r, 120); }); // zacht voor productie
    }
    return total != null && REC.length >= total;
  }

  async function run() {
    if (_ran || !TOKEN || !LISTURL) return; _ran = true;
    console.log("%c[doc] scrape gestart (READ-ONLY, GET-only)…", "color:green;font-weight:bold");
    try {
      var done = await paginate("", "P");
      if (!done) done = await paginate("name", "N");
      if (!done) done = await paginate("created_at", "C");
      if (!done) done = await paginate("id", "I");
    } catch (e) { console.warn("[doc] paginatie-fout:", e.message); }

    if (!REC.length) {
      console.error("%c[doc] GEEN documenten — token/CORS of endpoint nog niet gezien. Klik een paginering-pijl of herlaad.", "color:red;font-weight:bold");
      _ran = false; return;
    }
    console.log("%c[doc] " + REC.length + " documenten — bestanden ophalen (GET)…", "color:#2563eb;font-weight:bold");

    var files = [], fOk = 0, fSkip = 0, used = {};
    for (var i = 0; i < REC.length; i += 1) {
      var rec = REC[i];
      var url = findFileUrl(rec);
      if (!url) { fSkip += 1; rec.__file = { resolved: false }; continue; }
      try {
        var blob = await GET(url, true);
        var ext = (String(url).match(/\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpe?g|zip)(\?|#|$)/i) || [, "pdf"])[1];
        var base = safeName(rec.name || rec.title || rec.naam || ("document-" + (rec.id != null ? rec.id : i)), "document-" + i);
        var fn = base.toLowerCase().endsWith("." + ext) ? base : base + "." + ext;
        if (used[fn]) fn = base + "-" + (rec.id != null ? rec.id : i) + "." + ext;
        used[fn] = 1;
        var ab = await blob.arrayBuffer();
        files.push({ name: fn, data: new Uint8Array(ab) });
        rec.__file = { resolved: true, url: url, zipName: fn, bytes: ab.byteLength };
        fOk += 1;
      } catch (e) {
        fSkip += 1; rec.__file = { resolved: false, url: url, error: e.message };
      }
      if ((i + 1) % 5 === 0 || i + 1 === REC.length) console.log("[doc]   bestand " + (i + 1) + "/" + REC.length + " (ok=" + fOk + " skip=" + fSkip + ")");
      await new Promise(function (r) { setTimeout(r, 150); }); // zacht voor productie
    }

    var payload = {
      scraped_at: new Date().toISOString(),
      source: "BS2 PRODUCTIE /documents (read-only)",
      origin: location.origin,
      list_endpoint: listBase(),
      file_pattern_observed: FILEURL || null,
      counts: { documents: REC.length, bs2_meta_total: total, files_ok: fOk, files_skipped: fSkip, http_fails: FAILS },
      diag: diag,
      documents: REC,
    };
    dl(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "bs2-documents.json");
    if (files.length) dl(zipStore(files), "bs2-beleid-documenten.zip");
    _done = true;

    var compleet = (total == null) || (REC.length >= total);
    console.log("%c[doc] KLAAR " + (compleet ? "✓" : "⚠") + " documenten=" + REC.length + "/" + (total == null ? "?" : total)
      + " · bestanden ok=" + fOk + " skip=" + fSkip + " · fails=" + FAILS, compleet ? "color:green;font-weight:bold" : "color:#b45309;font-weight:bold");
    if (fSkip) console.warn("%c[doc] " + fSkip + " bestand(en) niet opgehaald — metadata staat wél in bs2-documents.json. Klik 1× op het OOG-icoon van een document (read-only) en typ __docDump() om opnieuw te proberen.", "color:#b45309;font-weight:bold");
    console.log("[doc] diag:", diag.join(" | "));
    console.log("%c→ bs2-documents.json" + (files.length ? " + bs2-beleid-documenten.zip" : "") + " gedownload. Zeg 'klaar' tegen Claude.", "color:green;font-weight:bold");
  }

  window.__docDump = function () { _ran = false; run(); };

  console.log("%c[doc] GEWAPEND — READ-ONLY. Klik een paginering-pijl of herlaad de lijst; "
    + "klik (optioneel) 1× op een OOG-icoon (Bekijken) zodat de bestands-URL geleerd wordt. "
    + "Daarna typ je desnoods __docDump()", "color:#2563eb;font-weight:bold");
})();
