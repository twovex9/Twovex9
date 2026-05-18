/* ============================================================================
 * BS2 — TOKEN-STEAL  (read-only, on-page paneel)   STAP 2-hulp
 *
 * Pakt JOUW eigen sessie-JWT (Bearer) zodat het Node-scrape-script
 * (scripts/scrape-bs2-audit-logs.mjs) server-side ~160.000 audit-records
 * kan ophalen (Node heeft geen CORS). Puur OBSERVEREND: dit snippet doet
 * ZELF geen enkele request en wijzigt niets op BS2 — het leest alleen de
 * Authorization-header van een request die de pagina tóch al doet, plus
 * een snelle scan van localStorage/sessionStorage.
 *
 * On-page paneel (rechtsboven) i.p.v. console-logs, zodat een console-
 * filter de melding nooit verbergt.
 *
 * GEBRUIK:
 *  1. BS2: ga naar  https://etf.acceptance.besasuite.nl/audit
 *  2. F12 → Console → plak dit volledig → Enter.
 *  3. Druk 1× Ctrl+R (pagina herlaadt → doet zelf een /api/-call).
 *  4. Het paneel toont "TOKEN GEVONDEN" → klik **⬇ bs2-token.txt**
 *     (komt in je Downloads). Stuur dat NIET naar de chat — het script
 *     leest het lokaal. Daarna:  node scripts/scrape-bs2-audit-logs.mjs
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2TokGrab) { try { document.getElementById("__bs2tok").remove(); } catch (e) {} }
  window.__bs2TokGrab = true;

  var found = null;

  var box = document.createElement("div");
  box.id = "__bs2tok";
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;"
    + "width:340px;font:13px/1.45 system-ui,Segoe UI,Arial;background:#0f172a;"
    + "color:#e2e8f0;border:2px solid #2563eb;border-radius:12px;padding:14px;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);

  function looksJwt(v) {
    return typeof v === "string" && /^(Bearer\s+)?[\w-]+\.[\w-]+\.[\w-]+$/.test(v.trim());
  }
  function clean(v) { return String(v || "").replace(/^Bearer\s+/i, "").trim(); }

  function render() {
    if (found) {
      var masked = found.slice(0, 12) + "…" + found.slice(-8) + " (" + found.length + " tekens)";
      box.innerHTML =
        '<div style="font-weight:800;color:#4ade80;margin-bottom:6px">✓ TOKEN GEVONDEN</div>'
        + '<div style="font-family:monospace;font-size:11px;word-break:break-all;'
        + 'background:#1e293b;padding:8px;border-radius:8px;margin-bottom:10px">' + masked + '</div>'
        + '<button id="__bs2dl" style="width:100%;padding:9px;border:0;border-radius:8px;'
        + 'background:#2563eb;color:#fff;font-weight:800;cursor:pointer">⬇ bs2-token.txt</button>'
        + '<button id="__bs2cp" style="width:100%;margin-top:7px;padding:8px;border:1px solid #475569;'
        + 'border-radius:8px;background:transparent;color:#e2e8f0;cursor:pointer">📋 Kopieer</button>'
        + '<div style="margin-top:9px;font-size:11px;color:#94a3b8">Daarna lokaal:'
        + ' <code>node scripts/scrape-bs2-audit-logs.mjs</code></div>';
      document.getElementById("__bs2dl").onclick = function () {
        var b = new Blob([found], { type: "text/plain" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = "bs2-token.txt";
        document.body.appendChild(a); a.click(); a.remove();
      };
      document.getElementById("__bs2cp").onclick = function () {
        try { navigator.clipboard.writeText(found); this.textContent = "✓ Gekopieerd"; } catch (e) {}
      };
    } else {
      box.innerHTML =
        '<div style="font-weight:800;color:#60a5fa;margin-bottom:6px">⏳ Wachten op token…</div>'
        + '<div style="font-size:12px;color:#cbd5e1">Druk nu <b>Ctrl+R</b> (pagina herladen). '
        + 'Het token wordt gelezen uit de eerste /api/-call die de pagina zelf doet.</div>';
    }
  }
  function set(tok) {
    var c = clean(tok);
    if (!found && c && c.split(".").length === 3) { found = c; render(); }
  }
  render();

  // (a) snelle scan van storage
  try {
    [localStorage, sessionStorage].forEach(function (st) {
      for (var i = 0; i < st.length && !found; i++) {
        var k = st.key(i), v = st.getItem(k);
        if (looksJwt(v)) set(v);
        else if (v && v[0] === "{") {
          try { var o = JSON.parse(v); ["token", "access_token", "accessToken", "jwt", "authToken"].forEach(function (p) { if (o && looksJwt(o[p])) set(o[p]); }); } catch (e) {}
        }
      }
    });
  } catch (e) {}

  // (b) observeer de Authorization-header van de eigen requests v/d pagina
  var _f = window.fetch;
  window.fetch = function (input, init) {
    try {
      var h = (init && init.headers) || (input && input.headers);
      if (h) {
        var a = (typeof h.get === "function") ? h.get("Authorization") : (h.Authorization || h.authorization);
        if (a) set(a);
      }
    } catch (e) {}
    return _f.apply(this, arguments);
  };
  var _srh = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (k && String(k).toLowerCase() === "authorization") set(v); } catch (e) {}
    return _srh.apply(this, arguments);
  };

  console.log("%c[token] paneel rechtsboven actief — druk Ctrl+R", "color:#2563eb;font-weight:bold");
})();
