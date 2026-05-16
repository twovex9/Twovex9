/* ============================================================================
 * BS2 → BS1 — STAP 2 (volledige scrape) BESCHIKKINGEN-OVERZICHT.
 * Plak VOLLEDIG in BS2 F12-console (op een BS2-pagina waar je ingelogd bent),
 * druk ENTER. Het haalt ÁLLE beschikkingen op + per beschikking ALLE 5 tabs:
 *   - Details  (volledige disposition + client + care_type)
 *   - Facturen (disposition-payments, gepagineerd)
 *   - Tarieven (rates, gepagineerd)
 *   - Notities (notes, gepagineerd)
 *   - Audit    (audit-logs, gepagineerd)
 * + lookups (care-types, phases). Inclusief trashed. Download =
 * bs2-overzicht-full.json. Niets gokken — 100% uit de BS2-API.
 *
 * Voortgang verschijnt in de console. Duurt ~2-4 min (≈155 beschikkingen).
 * ==========================================================================*/
(async function () {
  "use strict";
  var API = "https://api.etf.acceptance.besasuite.nl";

  // ---- auth-token vinden (JWT in storage: 3 delen, len>200) ----
  function findToken() {
    var stores = [localStorage, sessionStorage];
    for (var s = 0; s < stores.length; s += 1) {
      for (var i = 0; i < stores[s].length; i += 1) {
        var k = stores[s].key(i);
        var v = stores[s].getItem(k);
        if (!v) continue;
        var cand = v;
        try { var j = JSON.parse(v); cand = (j && (j.access_token || j.token || j.accessToken)) || v; } catch (e) {}
        if (typeof cand === "string" && cand.split(".").length === 3 && cand.length > 200) return cand;
      }
    }
    return null;
  }
  var TOK = findToken();
  console.log("%c[bs2scrape] token " + (TOK ? "gevonden ✓" : "NIET gevonden — val terug op cookies") , "color:#2563eb;font-weight:bold");

  var H = { Accept: "application/json" };
  if (TOK) H.Authorization = "Bearer " + TOK;

  var FAILS = 0;
  async function api(path) {
    var url = path.indexOf("http") === 0 ? path : (API + path);
    try {
      var r = await fetch(url, { headers: H, credentials: "include" });
      if (!r.ok) { FAILS += 1; console.warn("HTTP " + r.status + " " + url); return null; }
      return await r.json();
    } catch (e) { FAILS += 1; console.warn("ERR " + url + " :: " + e.message); return null; }
  }
  // gepagineerd ophalen (Laravel meta.last_page of <perPage stop), cap 60 pagina's
  async function apiAll(buildUrl) {
    var out = [], page = 1, last = 1;
    do {
      var j = await api(buildUrl(page));
      if (!j) break;
      var rows = Array.isArray(j) ? j : (j.data || []);
      out = out.concat(rows);
      last = (j && j.meta && j.meta.last_page) ? j.meta.last_page : page;
      page += 1;
      await new Promise(function (r) { setTimeout(r, 70); });
    } while (page <= last && page <= 60);
    return out;
  }

  console.log("[bs2scrape] lookups ophalen…");
  var careTypes = (await api("/api/care-types?filter%5Bsearch%5D=&limit=200")) || {};
  careTypes = careTypes.data || [];
  var phases = (await api("/api/phases?filter%5Bentity_target%5D%5Btype%5D=disposition&filter%5Bsearch%5D=&limit=200")) || {};
  phases = phases.data || [];

  // ---- alle beschikkingen (lijst = ook 'Details', client+care_type embedded) ----
  console.log("[bs2scrape] beschikkingen-lijst ophalen (normaal + trashed)…");
  var listNormal = await apiAll(function (p) {
    return "/api/dispositions?with%5B%5D=client&with%5B%5D=care_type&limit=100&page=" + p;
  });
  var listTrashed = await apiAll(function (p) {
    return "/api/dispositions?with%5B%5D=client&with%5B%5D=care_type&filter%5Btrashed%5D=only&limit=100&page=" + p;
  });
  // dedup op id; markeer trashed
  var map = new Map();
  listNormal.forEach(function (d) { if (d && d.id) { d.__trashed = false; map.set(d.id, d); } });
  listTrashed.forEach(function (d) { if (d && d.id && !map.has(d.id)) { d.__trashed = true; map.set(d.id, d); } });
  var disp = Array.from(map.values());
  console.log("[bs2scrape] " + disp.length + " beschikkingen (" + listNormal.length + " normaal + " + listTrashed.length + " trashed). Detail-tabs ophalen…");

  // ---- per beschikking de 5 tabs ----
  var done = 0;
  for (var i = 0; i < disp.length; i += 1) {
    var d = disp[i];
    var id = d.id;
    d.payments = await apiAll(function (p) {
      return "/api/disposition-payments?with%5B%5D=disposition&filter%5Bdisposition%5D=" + id + "&limit=100&page=" + p;
    });
    d.rates = await apiAll(function (p) {
      return "/api/dispositions/" + id + "/rates?limit=100&page=" + p;
    });
    d.notes = await apiAll(function (p) {
      return "/api/notes?with%5B%5D=user&filter%5Btarget%5D%5Btype%5D=disposition&filter%5Btarget%5D%5Bid%5D=" + id + "&limit=100&page=" + p;
    });
    d.audit = await apiAll(function (p) {
      return "/api/audit-logs?with%5B%5D=causer&filter%5Bresource%5D%5Btype%5D=disposition&filter%5Bresource%5D%5Bid%5D=" + id + "&limit=100&page=" + p;
    });
    done += 1;
    if (done % 10 === 0 || done === disp.length) console.log("  … " + done + "/" + disp.length + " beschikkingen compleet");
  }

  var payTot = disp.reduce(function (a, d) { return a + (d.payments ? d.payments.length : 0); }, 0);
  var rateTot = disp.reduce(function (a, d) { return a + (d.rates ? d.rates.length : 0); }, 0);
  var noteTot = disp.reduce(function (a, d) { return a + (d.notes ? d.notes.length : 0); }, 0);
  var audTot = disp.reduce(function (a, d) { return a + (d.audit ? d.audit.length : 0); }, 0);

  var payload = {
    scraped_at: new Date().toISOString(),
    source: "BS2 /dispositions/overview — STAP 2 volledige scrape",
    counts: { dispositions: disp.length, trashed: listTrashed.length, payments: payTot, rates: rateTot, notes: noteTot, audit: audTot, http_fails: FAILS },
    care_types: careTypes,
    phases: phases,
    dispositions: disp,
  };
  var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bs2-overzicht-full.json";
  document.body.appendChild(a); a.click(); a.remove();

  console.log("%c[bs2scrape] KLAAR ✓  beschikkingen=" + disp.length + " (trashed " + listTrashed.length + ")  facturen=" + payTot + "  tarieven=" + rateTot + "  notities=" + noteTot + "  audit=" + audTot + "  http_fails=" + FAILS, "color:green;font-weight:bold");
  console.log("%c→ bs2-overzicht-full.json gedownload. Geef dit bestand aan Claude voor STAP 3 (inspect).", "color:green;font-weight:bold");
})();
