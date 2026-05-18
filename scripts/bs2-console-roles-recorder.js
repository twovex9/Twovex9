/* ============================================================================
 * BS2 ROLLEN — RECORDER  v1   (PRODUCTIE, STRIKT READ-ONLY)
 *
 * Doel: top-bar Organisatie → Rollen 1-op-1 van BS2 naar BS1 overnemen —
 * WIE heeft welke rol, WELKE machtigingen elke rol heeft, en WAARAAN die
 * gekoppeld zijn.
 *
 * ⚠️ PRODUCTIE: https://etf.besasuite.nl/organization/roles — ALLEEN
 *    BEKIJKEN. Deze recorder is volledig PASSIEF: hij doet ZELF geen
 *    enkele request en wijzigt niets op BS2. Hij leest enkel mee met de
 *    /api/-calls die de pagina zélf doet terwijl jij rondklikt.
 *    Klik NERGENS op opslaan / bewerken / verwijderen / toevoegen —
 *    alleen openen en bekijken.
 *
 * On-page paneel (rechtsboven) i.p.v. console-logs, zodat een
 * console-filter de status nooit verbergt (les uit eerdere sessie).
 *
 * GEBRUIK:
 *  1. BS2: ga naar  https://etf.besasuite.nl/organization/roles
 *  2. F12 → tab Console → plak dit volledig → Enter. Paneel verschijnt.
 *  3. Klik nu RUSTIG door ALLES (alleen BEKIJKEN), de teller in het
 *     paneel loopt op:
 *       a. De rollen-lijst (alle rollen).
 *       b. Open ELKE rol → bekijk de machtigingen/permissies van die rol.
 *       c. Bekijk per rol WIE die rol heeft (toegewezen gebruikers/leden).
 *       d. Eventuele tabs/secties (permissies-overzicht, secties/niveaus,
 *          koppelingen) — alles aanklikken om te bekijken.
 *       e. Paginatie volledig doorklikken als er meerdere pagina's zijn.
 *  4. Klik in het paneel op **⬇ bs2-roles.json** → stuur dat bestand
 *     naar Claude. (Backup: typ  __rolesDump()  in de console.)
 *
 * Zie je na een klik GEEN nieuwe call in het paneel terwijl er wél iets
 * inlaadt? Meld dat aan Claude — dan haalt BS2 het anders op.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2RolesRec) { try { document.getElementById("__bs2rr").remove(); } catch (e) {} }
  window.__bs2RolesRec = true;

  var REC = [];
  var ENDPOINTS = {};
  var _fetch = window.fetch;

  var box = document.createElement("div");
  box.id = "__bs2rr";
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;"
    + "width:340px;font:13px/1.5 system-ui,Segoe UI,Arial;background:#0f172a;"
    + "color:#e2e8f0;border:2px solid #2563eb;border-radius:12px;padding:14px;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);

  function render() {
    var eps = Object.keys(ENDPOINTS);
    box.innerHTML =
      '<div style="font-weight:800;color:#4ade80;margin-bottom:6px">● ROLLEN-RECORDER actief</div>'
      + '<div style="font-size:12px;color:#cbd5e1">PRODUCTIE — alleen bekijken. Klik door '
      + 'de rollen-lijst, elke rol, machtigingen en wie welke rol heeft.</div>'
      + '<div style="margin:10px 0;font-size:13px">Calls opgevangen: <b>' + REC.length + '</b>'
      + ' · endpoints: <b>' + eps.length + '</b></div>'
      + '<button id="__bs2rrdl" ' + (REC.length ? "" : "disabled ")
      + 'style="width:100%;padding:10px;border:0;border-radius:8px;background:'
      + (REC.length ? "#2563eb" : "#334155") + ';color:#fff;font-weight:800;cursor:'
      + (REC.length ? "pointer" : "not-allowed") + '">⬇ bs2-roles.json</button>'
      + '<div style="margin-top:8px;font-size:11px;color:#94a3b8">Klik NERGENS op '
      + 'opslaan/bewerken/verwijderen. Backup: typ <code>__rolesDump()</code></div>';
    var b = document.getElementById("__bs2rrdl");
    if (b && REC.length) b.onclick = dump;
  }

  function relevant(url) { return !!url && /\/api\//.test(String(url)); }
  function pathOf(u) {
    try { return new URL(u, location.origin).pathname; }
    catch (e) { return String(u).split("?")[0]; }
  }
  function push(method, url, reqBody, status, respText) {
    var e = {
      t: new Date().toISOString(),
      method: String(method || "GET").toUpperCase(),
      url: String(url),
      path: pathOf(url),
      reqBody: reqBody == null ? null : (function () {
        try { return JSON.parse(reqBody); } catch (x) { return String(reqBody).slice(0, 4000); }
      })(),
      status: status,
      resp: (function () {
        try { return JSON.parse(respText); } catch (x) { return String(respText || "").slice(0, 60000); }
      })(),
    };
    REC.push(e);
    ENDPOINTS[e.method + " " + e.path] = (ENDPOINTS[e.method + " " + e.path] || 0) + 1;
    render();
  }

  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var method = (init && init.method) || (input && input.method) || "GET";
    var body = (init && init.body) || null;
    var p = _fetch.apply(this, arguments);
    if (relevant(url)) {
      p.then(function (res) {
        try {
          res.clone().text().then(function (txt) { push(method, url, body, res.status, txt); })
            .catch(function () {});
        } catch (x) {}
        return res;
      }).catch(function () {});
    }
    return p;
  };

  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__rm = m; this.__ru = u; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var xhr = this;
    try {
      if (relevant(xhr.__ru)) {
        xhr.addEventListener("load", function () {
          try { push(xhr.__rm, xhr.__ru, b == null ? null : b, xhr.status, xhr.responseText); }
          catch (x) {}
        });
      }
    } catch (x) {}
    return _send.apply(this, arguments);
  };

  function dump() {
    if (!REC.length) return;
    var payload = {
      captured_at: new Date().toISOString(),
      source: "BS2 PRODUCTIE roles recorder v1 (read-only)",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-roles.json";
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.__rolesDump = dump;

  render();
})();
