/* ============================================================================
 * BS2 HR + PLANNING — MASTER RECORDER  v2  (SANDBOX)
 *
 * Verschil met v1: KLEIN paneel (50×50 floating bubble), uitklapbaar, sleepbaar,
 * volledig te verbergen. Specifieke checklist met WAT / WAAR / WAAROM per item.
 * Focust enkel op de GATEN uit v1.
 *
 * GEBRUIK:
 *  1. Open https://etf.acceptance.besasuite.nl/home (sandbox, ingelogd).
 *  2. F12 → Console → plak dit volledig → Enter.
 *  3. Rechtsboven verschijnt een KLEIN bolletje (●). Klik erop → checklist
 *     klapt uit; klik nogmaals → klapt in. Sleep aan de "≡"-greep om te
 *     verplaatsen. Klik op "✕" om volledig te verbergen
 *     (typ __hrp2Show() in console om terug te halen).
 *  4. Werk de checklist af (zie onder). Voor sommige stappen MOET je echt
 *     iets aanmaken/wijzigen in BS2 (sandbox → mag).
 *  5. Klik op "⬇ JSON" → bestand bs2-hr-planning-v2.json downloadt → stuur
 *     dat naar Claude. Voor stap "Maanduitdraai": de XLSX/PDF die je
 *     downloadt apart in de chat plakken.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bs2HRP2) {
    try { document.getElementById("__bs2hrp2").remove(); } catch (e) {}
  }
  window.__bs2HRP2 = true;

  // ---------------------------------------------------------------------------
  // CHECKLIST — alleen GATEN uit v1. Per item: title + wat + waar + waarom.
  // ---------------------------------------------------------------------------
  var TASKS = [
    {
      id: "verzuim-events-dropdown",
      title: "Verzuim — volledige event-type-lijst",
      what: "Open een ziekmelding (HR → Verzuim → ziekmelding A. Malovan of vergelijkbaar). Klik op \"+ Event toevoegen\" / \"+ Contactmoment\". OPEN het type-dropdown maar kies er niets — kijk welke opties er staan. Daarna kies er één → vul wat in → opslaan. Herhaal voor 2 OF 3 verschillende types die je nog niet eerder hebt gekozen (bv. \"Contactmoment\", \"Bedrijfsarts\", \"Probleemanalyse\", \"Mijlpaal\", iets met re-integratie).",
      why: "We kennen tot nu toe alleen `contact_moment` en `company_doctor_feedback`. Ik wil zien welke type-keys BS2 in totaal kent (bv. probleem_analyse, reintegratie, ziekmelding, etc.) en welke NL-labels erbij horen. Plus de exacte POST-payload per type.",
      auto: [{ method: "POST", path: "/employee-absence-sicknesses", path2: "/events" }],
    },
    {
      id: "verzuim-milestone-add",
      title: "Verzuim — mijlpaal handmatig toevoegen",
      what: "Op dezelfde ziekmelding: zoek of er een knop is voor \"+ Mijlpaal toevoegen\" / \"+ Statutory milestone\" / een edit-knop op een bestaande mijlpaal (Ziekmelding / Probleemanalyse / WIA-aanvraag). Klik 'm aan en bewerk 1 mijlpaal (bv. datum, notes, completed_date) → opslaan.",
      why: "De 5 statutory milestones (notification/action_plan/evaluation/report/assessment) lijken auto-gegenereerd uit `first_day_of_sickness`. Ik wil weten of HR ze zelf kan toevoegen/verwijderen of alleen invullen. Bepaalt of BS1 een \"+ Mijlpaal\"-knop nodig heeft.",
      auto: [{ method: "PUT", path: "milestone" }, { method: "POST", path: "milestone" }],
    },
    {
      id: "diensttype-edit",
      title: "Instellingen — diensttype WIJZIGEN (pauze-veld)",
      what: "Top-bar → Instellingen → Diensttypen → klik 1 diensttype open (bv. \"Late dienst\"). Wijzig op een locatie het veld \"pauze\"/\"break\" naar een ander getal (bv. 0,5h naar 1h) → opslaan. Daarna terug naar het oude getal en opnieuw opslaan.",
      why: "We weten dat pauze in `shift_type.location_defaults[].break_hours` zit (per locatie binnen een type). Maar we hebben de PATCH/PUT-payload niet → onbekend of BS2 dit per location_default of in een sub-endpoint opslaat. Bepaalt of we 1 \"pauze per diensttype\"-veld bouwen of \"pauze per diensttype × locatie\".",
      auto: [{ method: "PATCH", path: "/shift-types" }, { method: "PUT", path: "/shift-types" }],
    },
    {
      id: "instellingen-kilometers",
      title: "Instellingen — Kilometers (vergoeding, inzittenden)",
      what: "Top-bar → Instellingen → zoek een sectie \"Kilometers\" / \"Mileage\" / \"Reiskosten\" / \"Vergoeding\". Klik erin en bekijk ALLE velden (vergoeding per km, max-limiet, drempel). Wijzig 1 waarde (bv. €0,39 → €0,40) → opslaan → en weer terug. Als er een veld is over \"inzittendenverzekering\" / \"passagiers\" → CRUCIAAL: meld in je antwoord wat je daar ziet.",
      why: "BS2's mileage POST heeft GEEN `client_id` of `with_client`-veld. Dus inzittendenverzekering-warning bestaat niet als data. Maar misschien staat in instellingen wel een toggle \"Toon waarschuwing bij cliënt-ritten\". Verder: mileage_rate = 0 in een freelancer-cost-breakdown → er is een org-instelling die default 0 staat → ik wil dat veld zien.",
      auto: [{ method: "PATCH", path: "settings" }, { method: "PUT", path: "settings" }],
    },
    {
      id: "instellingen-compensatie-drempel",
      title: "Instellingen — Compensatie / Drempelwaarde",
      what: "Probeer in deze volgorde: (a) Top-bar → Instellingen → \"Compensatie\" / \"Tijd voor tijd\" / \"Plus-minuren\". (b) Top-bar → Instellingen → Algemeen / Planning → scroll volledig door. (c) Top-bar → Organisatie → Instellingen. (d) Open de Rol \"Planner\" (Org → Rollen → Planner) → check of er een instelling \"drempelwaarde\" bij staat. (e) Maak 1 \"compensation rule\" aan als BS2 die knop heeft (we vingen GET /api/compensation-rules = leeg, dus we willen weten welke velden BS2's create-form heeft).",
      why: "User-eis: planners moeten waarschuwing krijgen als medewerker te veel/weinig compensatie-uren heeft, met instelbare min/max-drempelwaarde. We vonden NIETS in v1. Dit kan betekenen dat BS2 geen drempelwaarde heeft (dan = ETF-eigen feature) OF dat we het verstopt in een instellingen-sectie missen. Klik HEEL GRONDIG.",
      auto: [{ method: "GET", path: "settings" }, { method: "POST", path: "/compensation-rules" }, { method: "GET", path: "/compensation-rules" }],
    },
    {
      id: "maanduitdraai-download",
      title: "Maanduitdraai per medewerker (vast dienstverband) — DOWNLOADEN",
      what: "Top-bar → HR → Salarisadministratie OF rechtstreeks via medewerker-detail → \"Maandstaat\" / \"Loonstrook\" / \"Salarisexport\". Kies een medewerker met `employment_type=permanent` (= vast dienstverband; geen ZZP/hiring) en een maand. Klik op \"Download\" / \"Exporteren\" / \"Genereer\". HET BESTAND moet daadwerkelijk naar je downloads. Daarna bestand in chat sturen aan Claude.",
      why: "Je antwoord op vraag 4 was: \"Je zult dit downloaden, deel het met mij\". De JSON vangt het GET-endpoint (welke route levert het bestand?), het bestand zelf (XLSX of PDF) moet ik visueel hebben om kolommen + format te zien. Onze huidige Loket-XLSX (16 kolommen voor HR) is hier vermoedelijk anders: één maandstaat voor de medewerker zelf, niet de geaggregeerde HR-uitdraai.",
      auto: [{ method: "GET", path: "payroll" }, { method: "GET", path: "salary" }, { method: "GET", path: "maandstaat" }, { method: "GET", path: "ort" }],
    },
    {
      id: "verlof-uitdienst-echte-berekening",
      title: "Verlof bij uitdiensttreding — ECHTE berekening",
      what: "HR → kies 1 medewerker (bv. \"Sumi Bosman\" of een ander testaccount). Op het detail: zet een `employment_end_date` (bv. 30-06-2026) → opslaan. Open DAARNA de \"Uit dienst\"-/\"Eindafrekening\"-pagina / -tab. BS2 levert dan een echte berekening i.p.v. \"Cannot calculate\". Daarna mag je de end_date weer leeghalen (zelfde scherm) zodat de medewerker niet écht uit dienst is.",
      why: "In v1 vingen we de endpoint maar `employment_end_date` was null → resp `{can_calculate: false}`. We willen de VOLLE berekening zien: hoe BS2 de pro-rata opbouw, FIFO-verbruik, overdracht-saldo en eind-stand combineert. Daarna kunnen we BS1's `verlof-uitdienst.js` 1-op-1 spiegelen.",
      auto: [{ method: "GET", path: "departure-leave-calculation" }, { method: "PATCH", path: "/employees/" }],
    },
    {
      id: "zzp-uurtarief-bron",
      title: "ZZP-uurtarief — waar staat de bron",
      what: "Open een medewerker met `employment_type=hiring` (ZZP, bv. \"Samra Akaazoun\" of \"Hamza Essaoui\" — die zagen we in shift-suggestions met €42/uur). Bekijk hun detail: zoek waar `hourly_rate` ingevuld wordt (Salaris/Contract/Tarief tab). Wijzig dat tarief naar bv. €43 → opslaan → en weer terug naar €42.",
      why: "Voor ZZP-kosten in planning: ik wil weten of `hourly_rate` per medewerker is (één getal) of per medewerker × diensttype × bureau (gelaagd). De edit-endpoint geeft uitsluitsel.",
      auto: [{ method: "PATCH", path: "/employees/" }, { method: "PUT", path: "/employees/" }],
    },
    {
      id: "planning-locatie-filter-totalen",
      title: "Planning — filter op locatie + totalen-blok",
      what: "Open de Planning. Bovenaan staan blokken \"ZZP Kosten\", \"Geplande uren\", \"Openstaande uren\", \"Kilometerkosten\", \"Gem. tarief\". Filter de planning op ÉÉN locatie via de \"Selecteer Locatie\"-dropdown. Controleer of de blokken meeschalen naar enkel die locatie.",
      why: "Je screenshot toont die blokken al → BS2 doet de aggregatie. Ik wil de endpoint + response-veld zien dat die totalen levert (komt uit `/api/events` met `with[]=shift.cost` of een aparte `/summary`-call?). Bepaalt of BS1 client-side optelt of een view-RPC bouwt.",
      auto: [{ method: "GET", path: "summary" }, { method: "GET", path: "stats" }, { method: "GET", path: "filter[location]" }],
    },
    {
      id: "diensttype-overname-pauze",
      title: "Dienst aanmaken — diensttype wisselen, pauze observeren",
      what: "Planning → \"+ Dienst toevoegen\" of klik op een lege cel → nieuw dienst-formulier. Kies een LOCATIE eerst, daarna wissel het diensttype 3× (bv. Vroege dienst → Late dienst → Slaapdienst). Kijk of het pauze-veld auto-fills met de location_default.break_hours. Geef dan zelf een andere pauze in → opslaan.",
      why: "We weten dat `shift_type.location_defaults[].break_hours` bestaat. Ik wil verifiëren dat BS2 dit auto-fills bij selectie en dat de planner het kan overschrijven. Plus: de POST-payload van een nieuwe dienst (met pauze) bevestigen.",
      auto: [{ method: "POST", path: "/shifts" }, { method: "POST", path: "/api/events" }],
    },
  ];
  var DONE = {};
  TASKS.forEach(function (t) { DONE[t.id] = false; });

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  var REC = [];
  var ENDPOINTS = {};
  var _fetch = window.fetch;
  var collapsed = true;  // start ingeklapt
  var hidden = false;

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  var ROOT_ID = "__bs2hrp2";
  var ROOT_CSS = "position:fixed;z-index:2147483647;font:13px/1.4 system-ui,Segoe UI,Arial;"
    + "background:#0f172a;color:#e2e8f0;border:2px solid #2563eb;border-radius:14px;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.45);";
  var COMPACT_W = "56px", COMPACT_H = "56px";
  var EXPANDED_W = "440px", EXPANDED_MAX_H = "78vh";

  var box = document.createElement("div");
  box.id = ROOT_ID;
  box.style.cssText = ROOT_CSS;
  box.style.top = "12px";
  box.style.right = "12px";
  document.body.appendChild(box);

  function setSize() {
    if (hidden) { box.style.display = "none"; return; }
    box.style.display = "block";
    if (collapsed) {
      box.style.width = COMPACT_W;
      box.style.height = COMPACT_H;
      box.style.maxHeight = "none";
      box.style.overflow = "hidden";
      box.style.padding = "0";
    } else {
      box.style.width = EXPANDED_W;
      box.style.height = "auto";
      box.style.maxHeight = EXPANDED_MAX_H;
      box.style.overflow = "auto";
      box.style.padding = "12px";
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function render() {
    if (hidden) { box.style.display = "none"; return; }
    setSize();
    if (collapsed) {
      var allDone = TASKS.every(function (t) { return DONE[t.id]; });
      box.innerHTML =
        '<div id="__bs2hrp2c" style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;'
        + 'cursor:pointer;color:' + (allDone ? "#4ade80" : "#fef08a") + ';font-weight:800;font-size:18px"'
        + ' title="Recorder — klik om uit te klappen (' + REC.length + ' calls)">'
        + (allDone ? "✓" : "●") + '<span style="font-size:10px;margin-left:4px;color:#cbd5e1">'
        + REC.length + '</span></div>';
      box.querySelector("#__bs2hrp2c").onclick = function () { collapsed = false; render(); };
      return;
    }

    var taskHtml = TASKS.map(function (t) {
      var ok = DONE[t.id];
      return ''
        + '<div style="border:1px solid #334155;border-radius:8px;padding:8px 10px;margin-bottom:8px;'
        + 'background:' + (ok ? "#052e1a" : "#1e293b") + '">'
        + '  <div style="display:flex;align-items:center;gap:6px">'
        + '    <span style="font-size:14px;color:' + (ok ? "#4ade80" : "#cbd5e1") + '">'
        + (ok ? "☑" : "☐") + '</span>'
        + '    <span style="font-weight:700;color:#f1f5f9;flex:1">' + escapeHtml(t.title) + '</span>'
        + '    <button data-tid="' + t.id + '" class="__hrp2-toggle" style="background:#334155;color:#fff;'
        + '    border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px">'
        + (ok ? "Reset" : "Done") + '</button>'
        + '  </div>'
        + '  <div style="margin-top:6px;font-size:12px;color:#cbd5e1"><b style="color:#fef08a">Wat:</b> '
        + escapeHtml(t.what) + '</div>'
        + '  <div style="margin-top:4px;font-size:12px;color:#cbd5e1"><b style="color:#fda4af">Waarom:</b> '
        + escapeHtml(t.why) + '</div>'
        + '</div>';
    }).join("");

    box.innerHTML =
      '<div id="__hrp2-head" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:move">'
      + '  <span style="font-size:16px;color:#64748b">≡</span>'
      + '  <span style="font-weight:800;color:#4ade80">RECORDER v2</span>'
      + '  <span style="font-size:11px;color:#94a3b8;flex:1">'
      + REC.length + ' calls · ' + Object.keys(ENDPOINTS).length + ' eps</span>'
      + '  <button id="__hrp2-min" title="Inklappen" style="background:transparent;color:#cbd5e1;'
      + 'border:1px solid #475569;border-radius:6px;width:24px;height:24px;cursor:pointer">—</button>'
      + '  <button id="__hrp2-x" title="Verbergen (terug via __hrp2Show())" style="background:transparent;'
      + 'color:#cbd5e1;border:1px solid #475569;border-radius:6px;width:24px;height:24px;cursor:pointer">✕</button>'
      + '</div>'
      + '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px">SANDBOX — muteren mag. '
      + 'Sleep aan ≡, klik — om in te klappen, ✕ om volledig te verbergen.</div>'
      + taskHtml
      + '<button id="__hrp2-dl" ' + (REC.length ? "" : "disabled ")
      + 'style="margin-top:8px;width:100%;padding:10px;border:0;border-radius:8px;background:'
      + (REC.length ? "#2563eb" : "#334155") + ';color:#fff;font-weight:800;cursor:'
      + (REC.length ? "pointer" : "not-allowed") + '">⬇ bs2-hr-planning-v2.json</button>'
      + '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Backup-cmds: '
      + '<code>__hrp2Dump()</code> · <code>__hrp2Hide()</code> · <code>__hrp2Show()</code> · '
      + '<code>__hrp2Step("id")</code></div>';

    box.querySelector("#__hrp2-min").onclick = function () { collapsed = true; render(); };
    box.querySelector("#__hrp2-x").onclick = function () { hidden = true; render(); console.info("Recorder verborgen. Typ __hrp2Show() om terug te halen."); };
    box.querySelector("#__hrp2-dl").onclick = dump;
    [].forEach.call(box.querySelectorAll(".__hrp2-toggle"), function (b) {
      b.onclick = function () { DONE[b.getAttribute("data-tid")] = !DONE[b.getAttribute("data-tid")]; render(); };
    });

    // Drag-handle
    var head = box.querySelector("#__hrp2-head");
    var drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    head.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;
      drag = true;
      sx = e.clientX; sy = e.clientY;
      var r = box.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      var x = ox + (e.clientX - sx), y = oy + (e.clientY - sy);
      box.style.left = Math.max(0, Math.min(window.innerWidth - 60, x)) + "px";
      box.style.top = Math.max(0, Math.min(window.innerHeight - 60, y)) + "px";
      box.style.right = "auto";
    });
    document.addEventListener("mouseup", function () { drag = false; });
  }

  // ---------------------------------------------------------------------------
  // CAPTURE
  // ---------------------------------------------------------------------------
  function relevant(url) { return !!url && /\/api\//.test(String(url)); }
  function pathOf(u) {
    try { return new URL(u, location.origin).pathname; }
    catch (e) { return String(u).split("?")[0]; }
  }
  function autoMark(method, path) {
    TASKS.forEach(function (t) {
      if (DONE[t.id] || !t.auto) return;
      var hit = t.auto.some(function (a) {
        var mOk = !a.method || a.method === method;
        var pOk = !a.path || path.indexOf(a.path) >= 0;
        var p2Ok = !a.path2 || path.indexOf(a.path2) >= 0;
        return mOk && pOk && p2Ok;
      });
      if (hit) DONE[t.id] = true;
    });
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
    autoMark(e.method, path);
    if (!collapsed) render();
    else {
      // Update alleen de teller in compact mode
      var c = box.querySelector("#__bs2hrp2c span");
      if (c) c.textContent = REC.length;
    }
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
      source: "BS2 SANDBOX HR+Planning master recorder v2 (gap-focused)",
      origin: location.origin,
      count: REC.length,
      endpoints: ENDPOINTS,
      checklist: DONE,
      task_titles: TASKS.reduce(function (a, t) { a[t.id] = t.title; return a; }, {}),
      records: REC,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bs2-hr-planning-v2.json";
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.__hrp2Dump = dump;
  window.__hrp2Hide = function () { hidden = true; render(); };
  window.__hrp2Show = function () { hidden = false; render(); };
  window.__hrp2Step = function (id) {
    if (Object.prototype.hasOwnProperty.call(DONE, id)) { DONE[id] = !DONE[id]; render(); }
    else { console.warn("Onbekende task id:", id, "— beschikbaar:", Object.keys(DONE)); }
  };

  render();
  console.info("Recorder v2 actief. Klik op het bolletje rechtsboven, of typ __hrp2Show().");
})();
