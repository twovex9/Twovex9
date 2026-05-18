/* ============================================================================
 * BS2 — TOKEN-STEAL  v2  (read-only, on-page paneel)   STAP 2-hulp
 *
 * Pakt JOUW eigen, ACTUELE sessie-JWT (Bearer) zodat het Node-scrape-script
 * (scripts/scrape-bs2-audit-logs.mjs) server-side ~160.000 audit-records
 * kan ophalen (Node heeft geen CORS).
 *
 * v2-fix: v1 grendelde de EERSTE vondst en scande localStorage als eerste —
 * dat pakte een verouderde/refresh-token → de scrape kreeg HTTP 401. v2
 * geeft ALTIJD voorrang aan de LIVE Authorization-header van een echte
 * /api/-call (en updatet naar de NIEUWSTE — de app ververst tokens, de
 * laatste is de verste). Opslag = enkel laatste redmiddel, duidelijk
 * gemarkeerd als "kan verlopen zijn". Puur observerend: dit snippet doet
 * ZELF geen request en wijzigt niets op BS2.
 *
 * GEBRUIK:
 *  1. BS2: ga naar  https://etf.acceptance.besasuite.nl/audit
 *  2. F12 → Console → plak dit volledig → Enter.
 *  3. Druk 1× Ctrl+R; klik daarna evt. nog 1 keer naar pagina 2 in de
 *     audit-lijst zodat er zeker een verse /api/audit-logs-call gebeurt.
 *  4. Paneel toont bron "live netwerk-header" + groen → klik
 *     **⬇ bs2-token.txt**. Draai dan METEEN (geen tussenstappen):
 *       node scripts/scrape-bs2-audit-logs.mjs
 *     (de token is kort geldig; hoe sneller je scrapet, hoe beter — het
 *      script hervat sowieso bij HTTP 401, dan token verversen + opnieuw).
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2TokGrab) { try { document.getElementById("__bs2tok").remove(); } catch (e) {} }
  window.__bs2TokGrab = true;

  var headerTok = null;   // uit een echte /api/-Authorization-header (voorkeur, nieuwste wint)
  var storeTok = null;    // uit localStorage/sessionStorage (laatste redmiddel — kan verlopen zijn)
  var headerSeen = 0;

  var box = document.createElement("div");
  box.id = "__bs2tok";
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;"
    + "width:360px;font:13px/1.45 system-ui,Segoe UI,Arial;background:#0f172a;"
    + "color:#e2e8f0;border:2px solid #2563eb;border-radius:12px;padding:14px;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);

  function looksJwt(v) {
    return typeof v === "string" && /^(Bearer\s+)?[\w-]+\.[\w-]+\.[\w-]+$/.test(v.trim());
  }
  function clean(v) { return String(v || "").replace(/^Bearer\s+/i, "").trim(); }
  function current() { return headerTok || storeTok; }
  function srcLabel() {
    if (headerTok) return { t: "live netwerk-header (" + headerSeen + " calls)", c: "#4ade80" };
    if (storeTok) return { t: "opslag — KAN VERLOPEN ZIJN, doe Ctrl+R", c: "#f59e0b" };
    return { t: "nog niets", c: "#94a3b8" };
  }

  function render() {
    var tok = current(), s = srcLabel();
    if (tok) {
      var masked = tok.slice(0, 12) + "…" + tok.slice(-8) + " (" + tok.length + " tekens)";
      box.innerHTML =
        '<div style="font-weight:800;color:' + s.c + ';margin-bottom:4px">'
        + (headerTok ? "✓ TOKEN (live)" : "⚠ TOKEN (opslag)") + '</div>'
        + '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px">bron: ' + s.t + '</div>'
        + '<div style="font-family:monospace;font-size:11px;word-break:break-all;'
        + 'background:#1e293b;padding:8px;border-radius:8px;margin-bottom:10px">' + masked + '</div>'
        + '<button id="__bs2dl" style="width:100%;padding:9px;border:0;border-radius:8px;'
        + 'background:#2563eb;color:#fff;font-weight:800;cursor:pointer">⬇ bs2-token.txt</button>'
        + '<button id="__bs2cp" style="width:100%;margin-top:7px;padding:8px;border:1px solid #475569;'
        + 'border-radius:8px;background:transparent;color:#e2e8f0;cursor:pointer">📋 Kopieer</button>'
        + '<div style="margin-top:9px;font-size:11px;color:#94a3b8">'
        + (headerTok ? 'Goed — draai nu METEEN <code>node scripts/scrape-bs2-audit-logs.mjs</code>'
                     : 'Druk <b>Ctrl+R</b> + klik naar pagina 2 v/d audit-lijst voor een verse live-token.')
        + '</div>';
      document.getElementById("__bs2dl").onclick = function () {
        var b = new Blob([current()], { type: "text/plain" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = "bs2-token.txt";
        document.body.appendChild(a); a.click(); a.remove();
      };
      document.getElementById("__bs2cp").onclick = function () {
        try { navigator.clipboard.writeText(current()); this.textContent = "✓ Gekopieerd"; } catch (e) {}
      };
    } else {
      box.innerHTML =
        '<div style="font-weight:800;color:#60a5fa;margin-bottom:6px">⏳ Wachten op live token…</div>'
        + '<div style="font-size:12px;color:#cbd5e1">Druk nu <b>Ctrl+R</b> (pagina herladen). '
        + 'Het token wordt uit de Authorization-header van de eerste /api/-call gelezen.</div>';
    }
  }

  function setHeader(v) {
    var c = clean(v);
    if (c && c.split(".").length === 3) { headerTok = c; headerSeen++; render(); }
  }
  function setStore(v) {
    var c = clean(v);
    if (!storeTok && c && c.split(".").length === 3) { storeTok = c; render(); }
  }
  render();

  // (1) VOORKEUR: live Authorization-header van echte /api/-requests (nieuwste wint).
  var _f = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === "string") ? input : (input && input.url) || "";
      if (/\/api\//.test(String(url))) {
        var h = (init && init.headers) || (input && input.headers);
        if (h) {
          var a = (typeof h.get === "function") ? h.get("Authorization") : (h.Authorization || h.authorization);
          if (a) setHeader(a);
        }
      }
    } catch (e) {}
    return _f.apply(this, arguments);
  };
  var _open = XMLHttpRequest.prototype.open;
  var _srh = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__au = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try {
      if (k && String(k).toLowerCase() === "authorization" && /\/api\//.test(String(this.__au || ""))) setHeader(v);
    } catch (e) {}
    return _srh.apply(this, arguments);
  };

  // (2) LAATSTE REDMIDDEL: opslag-scan (vult alleen storeTok; nooit voorrang).
  try {
    [localStorage, sessionStorage].forEach(function (st) {
      for (var i = 0; i < st.length; i++) {
        var v = st.getItem(st.key(i));
        if (looksJwt(v)) setStore(v);
        else if (v && v[0] === "{") {
          try {
            var o = JSON.parse(v);
            ["token", "access_token", "accessToken", "jwt", "authToken"].forEach(function (p) {
              if (o && looksJwt(o[p])) setStore(o[p]);
            });
          } catch (e) {}
        }
      }
    });
  } catch (e) {}

  console.log("%c[token] v2 — paneel rechtsboven. Druk Ctrl+R; pak de 'live netwerk-header'-token.",
    "color:#2563eb;font-weight:bold");
})();
