/* ============================================================================
 * BS2 → BS1 — SCRAPE HR-MEDEWERKERS PERSONEELSNUMMERS (/api/employees)  v1
 *
 * Doel: voor Loket-payroll-export hebben we per HR-medewerker (tabel
 * `medewerkers` in BS1) het BS2 `employee_number` / `personeelsnummer` nodig
 * (= het identificatienummer dat in de payroll-export kolom B verschijnt).
 *
 * APART systeem: dit is `/api/employees` (HR — ~102 records), NIET
 * `/api/employees-basic` (top-bar Medewerkers — 100 records, andere tabel
 * `main_employees`). De twee zijn bewust gescheiden gehouden.
 *
 * Endpoint (live bevestigd via recorder):
 *   GET /api/employees?page=N&limit=50&sort=first_name
 *   (paginated, ~102 records totaal → pagineren + dedup op id)
 *
 * GEBRUIK:
 *  1. Log in op BS2 → ga naar HR → Medewerkers (/hr/employees).
 *  2. F12 → Console → plak dit volledig → Enter → je ziet "GEWAPEND".
 *  3. Klik op de tweede pagina-pijl of een filter (zodat BS2 zelf een
 *     /api/employees-call doet → token gekaapt).
 *  4. Wacht op "KLAAR ✓" → bs2-hr-employees-persnr.json wordt gedownload.
 *  5. Laat het bestand in C:\Users\sonck\Downloads staan en zeg "klaar".
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2HrEmpScrapeArmed) { console.log("[hr-emp] al gewapend — klik een paginering-pijl."); return; }
  window.__bs2HrEmpScrapeArmed = true;
  var CAP = null, APIBASE = null, _fetch = window.fetch;

  function originOf(u) { try { var x = new URL(u, location.origin); return x.protocol + "//" + x.host; } catch (e) { return null; } }
  function arm(auth, sampleUrl) {
    if (CAP || !auth) return;
    CAP = { Authorization: auth, Accept: "application/json" };
    APIBASE = originOf(sampleUrl) || "https://api.etf.acceptance.besasuite.nl";
    console.log("%c[hr-emp] token gekaapt ✓ — scrape start…", "color:green;font-weight:bold");
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

  async function api(p) {
    var url = APIBASE + p;
    var r = await _fetch.call(window, url, { method: "GET", headers: CAP, credentials: "omit", mode: "cors" });
    if (!r.ok) throw new Error("HTTP " + r.status + " op " + p);
    return r.json();
  }

  function dlJson(name, obj) {
    try {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    } catch (e) { console.error("download fail:", e); }
  }

  async function run() {
    var all = []; var seen = new Set();
    var page = 1; var maxPages = 30; var per = 50;

    try {
      while (page <= maxPages) {
        var j = await api("/api/employees?page=" + page + "&limit=" + per + "&sort=first_name");
        var items = (j && (j.data || j.items || j.employees)) || (Array.isArray(j) ? j : []);
        if (!Array.isArray(items) || items.length === 0) break;
        var added = 0;
        items.forEach(function (e) {
          var id = e && (e.id || e.uuid || e.employee_id);
          if (id && !seen.has(id)) { seen.add(id); all.push(e); added++; }
        });
        console.log("  page " + page + ": +" + added + " (totaal " + all.length + ")");
        if (items.length < per) break;
        page++;
      }
    } catch (err) {
      console.error("[hr-emp] scrape mislukt:", err);
      return;
    }

    console.log("%c[hr-emp] KLAAR ✓ — " + all.length + " HR-medewerkers", "color:green;font-weight:bold");
    if (all[0]) {
      console.log("Eerste medewerker (alle velden):", all[0]);
      console.log("Veld-namen:", Object.keys(all[0]).sort());
    }

    // Slank uittreksel voor importer (alleen wat we voor persnr nodig hebben + naam-match keys)
    var slim = all.map(function (e) {
      return {
        bs2_id: e.id || e.uuid || null,
        first_name: e.first_name || e.voornaam || null,
        last_name: e.last_name || e.achternaam || null,
        email: e.email || e.email_address || null,
        employee_number: e.employee_number || e.personeelsnummer || e.medewerkersnummer || e.number || null,
        contract_type: e.contract_type || e.dienstverband || (e.employment && e.employment.type) || null,
        cao_type: e.cao_type || e.cao || (e.employment && e.employment.cao) || null,
        status: e.status || (e.in_service != null ? (e.in_service ? "In dienst" : "Uit dienst") : null),
      };
    });

    dlJson("bs2-hr-employees-persnr.json", { source: "/api/employees", count: all.length, slim: slim, raw: all });
    console.log("📄 bs2-hr-employees-persnr.json gedownload (slim + raw).");
    window.__bs2HrEmployeesRaw = all;
    window.__bs2HrEmployeesSlim = slim;
  }
})();
