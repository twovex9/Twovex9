/* ============================================================================
 * BS2 HR + PLANNING — MASTER RECORDER  v1   (SANDBOX, lezen + muteren mag)
 *
 * Doel: 1 sessie waarin de user door ALLES klikt wat met
 *   - Verlof (aanvragen / saldi / overdracht / uitdienst)
 *   - Verzuim (mijlpalen / contactmomenten / Wet-Poortwachter)
 *   - Kilometers (cliëntrit-warning / inzittendenverzekering)
 *   - Planning (diensttype-modal / pauze / ZZP-uurtarief / kostenindicatie / km)
 *   - Compensatie (saldi / drempelwaarde-instellingen)
 *   - Maanduitdraai medewerker (ORT)
 * te maken heeft. Recorder vangt élke /api/-call (incl. POST/PATCH/DELETE-
 * payloads) en levert 1 JSON-download.
 *
 * Sandbox: muteren MAG hier — graag 1 aanvraag/mijlpaal/dienst aanmaken om de
 * write-payloads te vangen. Daarna zelf weer verwijderen of laten staan; ik
 * gebruik alleen de payload-structuur.
 *
 * GEBRUIK:
 *  1. Open https://etf.acceptance.besasuite.nl/home  (ingelogd).
 *  2. F12 → Console → plak dit volledig → Enter. Paneel rechtsboven verschijnt.
 *  3. Klik nu in DEZE volgorde door BS2 (zie BS2_NAV_CHECKLIST.md onderaan
 *     dit bestand voor de exacte route — ook in het paneel):
 *
 *       VERLOF
 *       (a) Hoofdmenu → Verlofbeheer → de **lijst** openen (alle aanvragen).
 *       (b) Open 1 bestaande verlofaanvraag → bekijk alle tabs.
 *       (c) Klik "+ Verlof aanvragen" en VUL het formulier (Zorgverlof én Vakantie
 *           apart proberen) → opslaan. Zo vangen we de POST + de TYPE-enum.
 *       (d) Goedkeuren / Afwijzen 1 aanvraag → vangt de PATCH.
 *       (e) Open een medewerker (HR-detail) → tab Verlof → bekijk SALDI en
 *           OVERDRACHT (split wettelijk/bovenwettelijk).
 *       (f) Bestaat er "Uit dienst"-knop op een medewerker? Probeer 'm en laat
 *           BS2 het saldering-scherm openen.
 *
 *       VERZUIM
 *       (g) HR → Verzuim/Ziekteverzuim. Open een ziekmelding (lange duur).
 *       (h) Bekijk de mijlpalen-tijdlijn / Wet-Poortwachter-stappen + driehoekjes.
 *       (i) Voeg een contactmoment toe (datum + type) → vangt de TYPE-enum.
 *       (j) Voeg een mijlpaal toe (PVA / 1e-jaars / etc.) → vangt POST.
 *
 *       KILOMETERS
 *       (k) Medewerker-kant: open jouw eigen kilometerdeclaratie. Voeg een rit
 *           toe waarbij je een cliënt selecteert (als BS2 dat veld heeft) → kijk
 *           of er een verzekering-waarschuwing verschijnt. Maak ook een woon-
 *           werk-rit. Probeer ook indienen na 10e (mag falen).
 *
 *       PLANNING
 *       (l) Planning openen → klik op een dienst → bekijk alle velden incl.
 *           pauze_uren, kilometers, kostenindicatie.
 *       (m) Maak een nieuwe dienst aan met diensttype-selectie → kijk of pauze
 *           auto-fill't. Wissel diensttype → herhaal.
 *       (n) Stel een dienst in met ZZP'er (extern bureau) als teamlid →
 *           verschijnt ergens uurtarief × uren / kostenindicatie / totaal?
 *       (o) Filter planning op locatie → toont BS2 een totalen-blok?
 *
 *       INSTELLINGEN
 *       (p) Instellingen → Diensttypes: open 1 diensttype, bekijk alle velden
 *           (pauze-uren?), wijzig pauze-uren → opslaan.
 *       (q) Instellingen → Compensatie / Plus-minuren: bestaat een
 *           min/max-drempelwaarde-instelling? Bekijk + wijzig 1 waarde.
 *       (r) Instellingen → Kilometers: bestaat een instelling voor
 *           inzittendenverzekering-waarschuwing? Vergoeding-per-km?
 *
 *       MAANDUITDRAAI
 *       (s) HR → Maanduitdraai / Salarisadministratie: maand kiezen + 1 vast-
 *           dienstverband-medewerker → download / bekijk.
 *
 *  4. Klik in het paneel op **⬇ bs2-hr-planning.json** → stuur naar Claude.
 *     (Backup: typ  __hrpDump()  in de console.)
 *
 * Zie je na een klik geen nieuwe call? Vinkje in paneel-checklist niet aan —
 * laat me weten welke stap. Dan haalt BS2 het anders op (websocket / SSR).
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2HRPRec) {
    try { document.getElementById("__bs2hrp").remove(); } catch (e) {}
  }
  window.__bs2HRPRec = true;

  var REC = [];
  var ENDPOINTS = {};
  var STEPS = [
    "Verlofbeheer lijst",
    "Verlofaanvraag detail",
    "Nieuwe verlofaanvraag (zorg+vakantie)",
    "Goedkeuren/afwijzen aanvraag",
    "Medewerker → tab Verlof (saldi)",
    "Verlof uit dienst",
    "Verzuim lijst + detail",
    "Mijlpalen / Wet-Poortwachter",
    "Contactmoment toevoegen",
    "Mijlpaal toevoegen",
    "Kilometerdeclaratie (cliënt-rit + woon-werk)",
    "Planning dienst-modal",
    "Diensttype wisselen → pauze",
    "ZZP-dienst + kostenindicatie",
    "Planning filter op locatie",
    "Instellingen → Diensttypes",
    "Instellingen → Compensatie/drempelwaarde",
    "Instellingen → Kilometers",
    "Maanduitdraai (vast dienstverband)",
  ];
  var DONE = {};
  STEPS.forEach(function (s) { DONE[s] = false; });

  var _fetch = window.fetch;

  var box = document.createElement("div");
  box.id = "__bs2hrp";
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;"
    + "width:380px;max-height:90vh;overflow:auto;font:13px/1.5 system-ui,Segoe UI,Arial;"
    + "background:#0f172a;color:#e2e8f0;border:2px solid #2563eb;border-radius:12px;"
    + "padding:14px;box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);

  function render() {
    var eps = Object.keys(ENDPOINTS);
    var checklist = STEPS.map(function (s) {
      var ok = DONE[s];
      return '<div style="font-size:12px;color:' + (ok ? "#4ade80" : "#cbd5e1") + '">'
        + (ok ? "☑ " : "☐ ") + s + '</div>';
    }).join("");
    box.innerHTML =
      '<div style="font-weight:800;color:#4ade80;margin-bottom:6px">● HR+PLANNING RECORDER</div>'
      + '<div style="font-size:12px;color:#cbd5e1">SANDBOX — muteren mag (1 aanvraag/mijlpaal/dienst).</div>'
      + '<div style="margin:10px 0;font-size:13px">Calls: <b>' + REC.length + '</b>'
      + ' · endpoints: <b>' + eps.length + '</b></div>'
      + '<div style="margin:8px 0 6px;font-weight:700;color:#fef08a">Checklist</div>'
      + checklist
      + '<button id="__bs2hrpdl" ' + (REC.length ? "" : "disabled ")
      + 'style="margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:'
      + (REC.length ? "#2563eb" : "#334155") + ';color:#fff;font-weight:800;cursor:'
      + (REC.length ? "pointer" : "not-allowed") + '">⬇ bs2-hr-planning.json</button>'
      + '<div style="margin-top:8px;font-size:11px;color:#94a3b8">Tip: typ '
      + '<code>__hrpStep("Verlofbeheer lijst")</code> om handmatig een vinkje te zetten.</div>';
    var b = document.getElementById("__bs2hrpdl");
    if (b && REC.length) b.onclick = dump;
  }

  function relevant(url) { return !!url && /\/api\//.test(String(url)); }
  function pathOf(u) {
    try { return new URL(u, location.origin).pathname; }
    catch (e) { return String(u).split("?")[0]; }
  }

  function autoMarkStep(path, method) {
    // Heuristisch: vink stappen aan op basis van pad-fragmenten.
    if (/\/leave|\/verlof|\/absences/i.test(path)) DONE["Verlofbeheer lijst"] = true;
    if (/\/leave\/[^/]+/i.test(path)) DONE["Verlofaanvraag detail"] = true;
    if (method === "POST" && /\/leave|\/absences/i.test(path)) DONE["Nieuwe verlofaanvraag (zorg+vakantie)"] = true;
    if (method === "PATCH" && /\/leave|\/absences/i.test(path)) DONE["Goedkeuren/afwijzen aanvraag"] = true;
    if (/employee.*leave|leave.*balance|verlof.*saldo/i.test(path)) DONE["Medewerker → tab Verlof (saldi)"] = true;
    if (/sickness|verzuim|absence-sickness/i.test(path)) DONE["Verzuim lijst + detail"] = true;
    if (/milestone|mijlpaal|statutory/i.test(path)) DONE["Mijlpalen / Wet-Poortwachter"] = true;
    if (method === "POST" && /contact|interaction/i.test(path)) DONE["Contactmoment toevoegen"] = true;
    if (method === "POST" && /milestone|mijlpaal/i.test(path)) DONE["Mijlpaal toevoegen"] = true;
    if (/mileage|kilometer/i.test(path)) DONE["Kilometerdeclaratie (cliënt-rit + woon-werk)"] = true;
    if (/shift|planning|dienst|duty/i.test(path)) DONE["Planning dienst-modal"] = true;
    if (/duty-type|diensttype|shift-type/i.test(path)) DONE["Diensttype wisselen → pauze"] = true;
    if (/freelancer|zzp|external-employee|bureau/i.test(path)) DONE["ZZP-dienst + kostenindicatie"] = true;
    if (/settings.*duty|duty-types/i.test(path)) DONE["Instellingen → Diensttypes"] = true;
    if (/compensation|comp_saldi|plus-minus/i.test(path)) DONE["Instellingen → Compensatie/drempelwaarde"] = true;
    if (/payroll|salary|maandstaat/i.test(path)) DONE["Maanduitdraai (vast dienstverband)"] = true;
  }

  function push(method, url, reqBody, status, respText) {
    var path = pathOf(url);
    var e = {
      t: new Date().toISOString(),
      method: String(method || "GET").toUpperCase(),
      url: String(url),
      path: path,
      reqBody: reqBody == null ? null : (function () {
        try { return JSON.parse(reqBody); } catch (x) { return String(reqBody).slice(0, 8000); }
      })(),
      status: status,
      resp: (function () {
        try { return JSON.parse(respText); } catch (x) { return String(respText || "").slice(0, 80000); }
      })(),
    };
    REC.push(e);
    ENDPOINTS[e.method + " " + path] = (ENDPOINTS[e.method + " " + path] || 0) + 1;
    autoMarkStep(path, e.method);
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
      source: "BS2 SANDBOX HR+Planning master recorder v1",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      checklist: DONE,
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-hr-planning.json";
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.__hrpDump = dump;
  window.__hrpStep = function (name) {
    if (Object.prototype.hasOwnProperty.call(DONE, name)) { DONE[name] = true; render(); }
    else { console.warn("Onbekende stap:", name); }
  };

  render();
})();
