/* ============================================================================
 * BS2 FEATURES RECORDER — 2026-05-27 (SANDBOX)
 *
 * Doel: per feature uit de user-tekst (10 features) de BS2-bron 1-op-1
 * vangen — exacte UI-flow + alle /api/-payloads + responses + DOM-error-
 * states + sorteervolgorde. Voor BS1-port: zero-gokken.
 *
 * GEBRUIK:
 *  1. Open https://etf.acceptance.besasuite.nl/home (sandbox, ingelogd).
 *     (Sandbox = muteren mag; productie NIET gebruiken voor dit script.)
 *  2. F12 → Console → plak DIT bestand → Enter.
 *  3. Rechtsboven verschijnt een KLEIN bolletje (●). Klik → checklist klapt
 *     uit. Sleep aan "≡" om te verplaatsen, "✕" om volledig te verbergen
 *     (typ __bsfShow() in console om terug te halen).
 *  4. Werk de 9 items af. Per item: doe wat in "WAT" staat → klik "✓ Klaar"
 *     → eventueel typ NOTITIE (alleen iets opvallends; mag leeg).
 *  5. Klik "⬇ JSON" onderaan → bestand
 *     bs2-features-2026-05-27.json downloadt → stuur naar Claude.
 *
 * Veiligheid:
 *  - Script PATCHt fetch + XMLHttpRequest. Pure observatie: niets wordt
 *    geblokkeerd, niets wordt zelf naar de server gestuurd.
 *  - Alleen calls naar api.etf.acceptance.besasuite.nl worden gelogd.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__bsf2026) {
    try { document.getElementById("__bsf2026").remove(); } catch (e) {}
  }
  window.__bsf2026 = true;

  // ---------------------------------------------------------------------------
  // CHECKLIST — 9 items (F10 = web-only-vraag, niet via BS2 te checken)
  // ---------------------------------------------------------------------------
  var TASKS = [
    {
      id: "f1-incident-validatie",
      title: "F1 · Incident melden — validatie (rood + scroll)",
      what: "Top-bar → Cliënten → Incidenten → '+ Incident melden' (of vergelijkbare CTA). Druk DIRECT op de Opslaan/Verstuur-knop ZONDER iets in te vullen. Kijk: (a) welke velden worden rood gemarkeerd; (b) scrollt de pagina naar het eerste rode veld; (c) staat er ook een error-tekst onder elk veld of alleen één banner bovenaan. DAARNA: vul Cliënt + Datum + Tijdstip + Actor + Categorie + Beschrijving in, kies bij 'Ouders geïnformeerd' = NEE en druk opslaan ZONDER de 'leg uit waarom'-tekst → kijk of dat veld rood wordt en of de pagina ernaartoe scrollt.",
      why: "Eis 1: BS1 moet exact dezelfde error-styling + auto-scroll-gedrag krijgen. Onbekend: CSS-class-naam, scroll-smooth/instant, focus na scroll, sticky-header-offset.",
      auto: [{ method: "POST", path: "/incidents" }],
    },
    {
      id: "f2-verlofstanden-export",
      title: "F2 · Verlofstanden — export op peildatum",
      what: "Top-bar → HR → Verlof → Verlofstanden (of 'Leave balances'). Zoek een Export/Download-knop. KLIK 'M AAN. Als er een modal opent met peildatum-keuze: kies een datum (bv. 1 juni 2026), kies eventueel format/kolommen, druk export. Het bestand downloadt → stuur dat APART in de chat (xlsx/csv/pdf). HERHAAL nog 1× met een ANDERE peildatum (bv. vandaag) zodat we het verschil zien.",
      why: "Eis 2: ontdek exact welk endpoint, welk format, welke kolommen, hoe peildatum doorwerkt op saldi-berekening (re-calc of snapshot).",
      auto: [{ method: "GET", path: "/leave-balances/export" }, { method: "POST", path: "/leave-balances/export" }, { method: "GET", path: "export" }],
    },
    {
      id: "f3-doctype-planbaar",
      title: "F3 · Documenttypes + planbaar-status (Loondienst)",
      what: "HR → Medewerkers → klik een LOONDIENST-medewerker open (employment_type=permanent, bv. Adriana #3). Zoek het tabje 'Documenten' of 'Bestanden'. Lijst alle DOCUMENTTYPES op die je ziet (Contract, ID, VOG, Diploma, etc.) — het script vangt de API-respons al, maar in NOTITIE typ: welke types zijn 'verplicht' of geven een waarschuwing als ze ontbreken. ZOEK een rood driehoekje ⚠ ergens op de medewerkerkaart of in de medewerker-overzichtslijst → klik erop, lees de tooltip → typ tooltip-tekst in NOTITIE.",
      why: "Eis 3: contract niet meer verplicht voor planbaar. Onbekend: welke types ÉN waren tot nu toe verplicht, en hoe ziet 'het rode driehoekje' eruit + tooltip.",
      auto: [{ method: "GET", path: "/employee-documents" }, { method: "GET", path: "/document-types" }, { method: "GET", path: "/employees/" }],
    },
    {
      id: "f4-planbaar-toggle",
      title: "F4 · Handmatig Planbaar/Niet-planbaar zetten",
      what: "Op DEZELFDE medewerker: zoek een knop/toggle/dropdown met label 'Planbaar' / 'Schedulable' / 'Beschikbaar voor planning'. Wijzig 1× naar 'Niet planbaar' → opslaan. Wijzig DAARNA terug naar 'Planbaar' → opslaan. Kijk: is het een 2-state toggle of 3-state (Auto / Planbaar / Niet planbaar)? Komt er een bevestiging?",
      why: "Eis 4: handmatige override. Onbekend: veld-naam, persistentie (kolom op employee of aparte tabel), of de override 'auto'-status overschrijft.",
      auto: [{ method: "PATCH", path: "/employees/" }, { method: "PUT", path: "/employees/" }, { method: "POST", path: "schedulable" }],
    },
    {
      id: "f5-verlof-goedkeur-impact",
      title: "F5 · Verlof goedkeuren → diensten afhalen + indicator",
      what: "STAP A: HR → Planning → maak een TEST-dienst aan voor een medewerker op een toekomstige datum (bv. 2026-06-15, dienst 09:00-17:00). STAP B: Verlofaanvraag indienen voor diezelfde medewerker over diezelfde datum (Type=Vakantie, 2026-06-14 t/m 2026-06-16). STAP C: Goedkeuren als HR/Manager. KIJK direct daarna in Planning op 2026-06-15: is de medewerker daar nog toegewezen of niet? Open een lege/openstaande dienst diezelfde dag en probeer die medewerker ALSNOG toe te wijzen → kijk welke rode tekst/indicator verschijnt + verbatim formulering + datum-formaat ('Op verlof tijdens deze dienst Van DD-MM-JJJJ tot DD-MM-JJJJ' of anders).",
      why: "Eis 5: 'medewerker wordt van toegewezen diensten afgehaald' + 'rode indicator bij toewijzen'. Endpoints + veld-formaat onbekend.",
      auto: [{ method: "POST", path: "/leave-requests" }, { method: "PATCH", path: "/leave-requests" }, { method: "POST", path: "approve" }, { method: "DELETE", path: "/shifts" }, { method: "PATCH", path: "/shifts" }, { method: "POST", path: "/shifts" }],
    },
    {
      id: "f6-verlof-dag-iconen",
      title: "F6 · Verlof-icoontje in dag-overzicht",
      what: "In Planning → schakel naar DAG-view → ga naar 2026-06-15 (de dag waarop de net-goedgekeurde verlofaanvraag valt). Kijk waar het VERLOF-icoontje verschijnt: naast de medewerkernaam? bovenaan de kolom? in een aparte strip? Klik op het icoontje → wat opent het? Typ de TOOLTIP-tekst in NOTITIE. Maak ook screenshots (Snipping Tool / Win+Shift+S) van dag-view en plaats die in de chat.",
      why: "Eis 6: 'icoontje per dag voor goedgekeurd verlof'. Onbekend: positie, icoon-vorm (palm/koffer/V/etc.), kleur, tooltip-tekst, scope (alle verlof-medewerkers of alleen die normaal gepland zouden zijn).",
      auto: [{ method: "GET", path: "/planning" }, { method: "GET", path: "/leave-requests" }, { method: "GET", path: "/shifts" }],
    },
    {
      id: "f8-uurtarief-zzp",
      title: "F8 · Gemiddeld uurtarief — alleen ZZP, alg + per locatie",
      what: "In Planning (dag of week-view, doet er niet toe): zoek de 'Gemiddeld uurtarief' KPI of strip. Kijk: (a) algemeen-gemiddelde bovenaan; (b) per LOCATIE — bestaat per-locatie-KPI? Per-locatie-kaart met eigen gem. tarief? In NOTITIE: typ de gevonden bedragen + waar ze staan (header / locatie-kop / footer). Maak SCREENSHOT van de hele planning + één van een specifieke locatie-strip.",
      why: "Eis 8: alleen ZZP-uren tellen, alg + per locatie. Onbekend: of BS2 dit als KPI bovenaan toont of per-locatie-kaart, formule (zzp_kosten/zzp_uren of bureaus.default_hourly_rate aggregatie).",
      auto: [{ method: "GET", path: "/planning" }, { method: "GET", path: "/scheduler" }, { method: "GET", path: "metrics" }, { method: "GET", path: "summary" }],
    },
    {
      id: "f9-diensten-sortering",
      title: "F9 · Diensten sortering — vaste volgorde",
      what: "In Planning → DAG-view → kijk per locatie WELKE volgorde de diensten staan. Verwacht (volgens user): Vroege → Late → Waakdienst → Achterwacht → 1-op-1-diensten (per cliënt gegroepeerd). Verifieer: klopt het? Waar staan Tussendienst/Slaapdienst/MDO/Training/Boventallig/Vergadering? In NOTITIE: TYP de exacte volgorde zoals je 'm ziet (top-naar-bottom). Maak SCREENSHOT van een locatie-kolom met ≥5 diensten in dag-view. Herhaal voor WEEK-view → dezelfde sortering of anders?",
      why: "Eis 9: vaste volgorde + 1-op-1-groepering per cliënt. Onbekend: of dit ook in week-view geldt, en waar de 5 NIET-genoemde types staan.",
      auto: [{ method: "GET", path: "/planning" }, { method: "GET", path: "/shifts" }],
    },
    {
      id: "f-extra-meta",
      title: "Extra · Algemene BS2-flow-screenshots",
      what: "Maak 3 screenshots: (1) Een willekeurig WAARSCHUWINGS-icoontje (rood/oranje/geel driehoekje) ergens in BS2 — zodat ik exact die kleur/vorm zie. (2) Een ZZP-kosten-KPI / uurtarief-KPI in planning. (3) De Dag-view-header met een DAG waarop iemand verlof heeft. Plak ze in de chat.",
      why: "Visuele bewijs voor exacte huisstijl-pariteit (kleur-tokens, icon-shape).",
      auto: [],
    },
  ];

  // ---------------------------------------------------------------------------
  // Network hook — vangt elke /api/-call (XHR + fetch). Pure observatie.
  // ---------------------------------------------------------------------------
  var API_HOST = "api.etf.acceptance.besasuite.nl";
  var calls = []; // {ts, method, url, status, reqBody, resBody, taskHint}

  function inferTask(method, url) {
    var hits = [];
    TASKS.forEach(function (t) {
      (t.auto || []).forEach(function (a) {
        if (a.method && method !== a.method) return;
        if (a.path && url.indexOf(a.path) < 0) return;
        if (a.path2 && url.indexOf(a.path2) < 0) return;
        hits.push(t.id);
      });
    });
    return hits;
  }

  function logCall(call) {
    call.taskHint = inferTask(call.method, call.url);
    calls.push(call);
    paintCounters();
  }

  // Patch fetch
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = (init && init.method) || (typeof input === "object" && input.method) || "GET";
    var reqBody = init && init.body ? safeStringify(init.body) : null;
    if (url.indexOf(API_HOST) < 0) return origFetch.apply(this, arguments);
    var t0 = Date.now();
    return origFetch.apply(this, arguments).then(function (res) {
      var clone = null;
      try { clone = res.clone(); } catch (e) {}
      var done = function (resBody) {
        logCall({
          ts: new Date().toISOString(),
          method: method.toUpperCase(),
          url: url,
          status: res.status,
          durationMs: Date.now() - t0,
          reqBody: reqBody,
          resBody: resBody,
        });
      };
      if (clone) {
        clone.text().then(function (txt) { done(truncate(txt, 60000)); }).catch(function () { done(null); });
      } else { done(null); }
      return res;
    });
  };

  // Patch XHR
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__bsfMethod = method;
    this.__bsfUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this;
    var url = xhr.__bsfUrl || "";
    if (url.indexOf(API_HOST) >= 0) {
      var t0 = Date.now();
      var reqBody = body ? safeStringify(body) : null;
      xhr.addEventListener("loadend", function () {
        var resBody = null;
        try { resBody = xhr.responseText; } catch (e) {}
        logCall({
          ts: new Date().toISOString(),
          method: (xhr.__bsfMethod || "GET").toUpperCase(),
          url: url,
          status: xhr.status,
          durationMs: Date.now() - t0,
          reqBody: reqBody,
          resBody: truncate(resBody, 60000),
        });
      });
    }
    return origSend.apply(this, arguments);
  };

  function safeStringify(v) {
    try {
      if (typeof v === "string") return truncate(v, 20000);
      if (v instanceof FormData) {
        var out = {};
        v.forEach(function (val, k) { out[k] = String(val).slice(0, 500); });
        return JSON.stringify(out);
      }
      return JSON.stringify(v);
    } catch (e) { return null; }
  }
  function truncate(s, n) {
    if (s == null) return null;
    var t = String(s);
    if (t.length <= n) return t;
    return t.slice(0, n) + "…[+" + (t.length - n) + " chars]";
  }

  // ---------------------------------------------------------------------------
  // Floating UI
  // ---------------------------------------------------------------------------
  var state = {};
  TASKS.forEach(function (t) { state[t.id] = { done: false, note: "" }; });

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "style") n.setAttribute("style", attrs[k]);
      else if (k.indexOf("on") === 0) n[k] = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  var root = el("div", { id: "__bsf2026" });
  root.setAttribute("style",
    "position:fixed;top:80px;right:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#111;");

  // Bubble (collapsed)
  var bubble = el("button", { type: "button", title: "BS2 Features Recorder — klik om uit te klappen",
    style: "width:46px;height:46px;border-radius:50%;border:2px solid #2563eb;background:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;" }, ["●"]);

  // Panel (expanded) — created lazy
  var panel = null;
  function buildPanel() {
    var p = el("div", { style:
      "width:380px;max-height:75vh;display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.22);overflow:hidden;" });

    // Header
    var header = el("div", { style:
      "display:flex;align-items:center;gap:6px;padding:8px 10px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none;" });
    var grip = el("span", { title:"Sleep om te verplaatsen", style:"font-size:14px;color:#6b7280;" }, ["≡"]);
    var title = el("strong", { style:"flex:1;font-size:13px;" }, ["BS2 Features 2026-05-27"]);
    var counter = el("span", { id:"__bsfCnt", style:"font-size:11px;color:#6b7280;font-variant-numeric:tabular-nums;" }, ["0 calls"]);
    var minBtn = el("button", { type:"button", title:"Inklappen",
      style:"background:none;border:0;cursor:pointer;font-size:14px;color:#6b7280;" }, ["–"]);
    minBtn.onclick = function () { panel.remove(); root.appendChild(bubble); };
    var hideBtn = el("button", { type:"button", title:"Verbergen (typ __bsfShow() om terug)",
      style:"background:none;border:0;cursor:pointer;font-size:14px;color:#6b7280;" }, ["✕"]);
    hideBtn.onclick = function () { root.remove(); };
    header.appendChild(grip);
    header.appendChild(title);
    header.appendChild(counter);
    header.appendChild(minBtn);
    header.appendChild(hideBtn);
    enableDrag(header, root);

    var list = el("div", { style:"flex:1;overflow:auto;padding:8px;" });

    TASKS.forEach(function (t, i) {
      var item = el("div", { id:"__bsf-" + t.id, style:
        "border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fff;" });
      var head = el("div", { style:"display:flex;gap:6px;align-items:flex-start;" });
      var idx = el("span", { style:"flex:0 0 22px;font-weight:700;color:#2563eb;" }, [String(i + 1) + "."]);
      var ttl = el("div", { style:"flex:1;font-weight:600;" }, [t.title]);
      var dot = el("span", { id:"__bsfDot-" + t.id, title:"Auto-gevangen calls",
        style:"flex:0 0 22px;text-align:right;font-size:11px;color:#6b7280;font-variant-numeric:tabular-nums;" }, ["0"]);
      head.appendChild(idx); head.appendChild(ttl); head.appendChild(dot);

      var what = el("div", { style:"margin-top:4px;color:#374151;font-size:12px;line-height:1.45;" }, [t.what]);
      var why = el("div", { style:"margin-top:4px;color:#9ca3af;font-size:11px;line-height:1.4;font-style:italic;" }, ["⚑ " + t.why]);

      var notes = el("textarea", { id:"__bsfNote-" + t.id, placeholder:"Optionele notitie (alleen iets opvallends)",
        style:"width:100%;margin-top:6px;min-height:38px;font:inherit;font-size:11px;padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;box-sizing:border-box;resize:vertical;" });
      notes.oninput = function () { state[t.id].note = notes.value; };

      var actions = el("div", { style:"margin-top:6px;display:flex;gap:6px;justify-content:flex-end;" });
      var doneBtn = el("button", { type:"button", id:"__bsfDone-" + t.id, style:
        "padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-size:11px;" }, ["✓ Klaar"]);
      doneBtn.onclick = function () {
        state[t.id].done = !state[t.id].done;
        doneBtn.style.background = state[t.id].done ? "#10b981" : "#fff";
        doneBtn.style.color = state[t.id].done ? "#fff" : "#111";
        doneBtn.style.borderColor = state[t.id].done ? "#10b981" : "#d1d5db";
        doneBtn.textContent = state[t.id].done ? "✓ Klaar" : "Klaar?";
      };
      actions.appendChild(doneBtn);

      item.appendChild(head);
      item.appendChild(what);
      item.appendChild(why);
      item.appendChild(notes);
      item.appendChild(actions);
      list.appendChild(item);
    });

    // Footer
    var footer = el("div", { style:
      "padding:8px 10px;border-top:1px solid #e5e7eb;background:#f9fafb;display:flex;gap:6px;align-items:center;" });
    var info = el("span", { style:"flex:1;font-size:11px;color:#6b7280;" }, ["Sandbox-only — productie NIET gebruiken"]);
    var dlBtn = el("button", { type:"button", style:
      "padding:6px 12px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer;font-size:12px;font-weight:600;" }, ["⬇ JSON"]);
    dlBtn.onclick = downloadJson;
    footer.appendChild(info);
    footer.appendChild(dlBtn);

    p.appendChild(header);
    p.appendChild(list);
    p.appendChild(footer);
    return p;
  }

  function paintCounters() {
    var cEl = document.getElementById("__bsfCnt");
    if (cEl) cEl.textContent = calls.length + " calls";
    TASKS.forEach(function (t) {
      var dotEl = document.getElementById("__bsfDot-" + t.id);
      if (!dotEl) return;
      var n = calls.filter(function (c) { return (c.taskHint || []).indexOf(t.id) >= 0; }).length;
      dotEl.textContent = String(n);
      dotEl.style.color = n > 0 ? "#10b981" : "#6b7280";
      dotEl.style.fontWeight = n > 0 ? "700" : "400";
    });
  }

  function downloadJson() {
    var dump = {
      source: "bs2-features-2026-05-27-recorder",
      version: 1,
      generatedAt: new Date().toISOString(),
      origin: location.origin,
      userAgent: navigator.userAgent,
      tasks: TASKS.map(function (t) {
        return {
          id: t.id,
          title: t.title,
          what: t.what,
          why: t.why,
          done: !!state[t.id].done,
          note: state[t.id].note || "",
          autoCallCount: calls.filter(function (c) { return (c.taskHint || []).indexOf(t.id) >= 0; }).length,
        };
      }),
      calls: calls,
      summary: {
        total: calls.length,
        byMethod: groupCount(calls, function (c) { return c.method; }),
        byStatus: groupCount(calls, function (c) { return String(c.status); }),
        tasksDone: Object.keys(state).filter(function (k) { return state[k].done; }).length,
        tasksTotal: TASKS.length,
      },
    };
    var json = JSON.stringify(dump, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "bs2-features-2026-05-27.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    console.log("[BSF] Download: bs2-features-2026-05-27.json (" + calls.length + " calls, " +
      dump.summary.tasksDone + "/" + TASKS.length + " items done)");
  }

  function groupCount(arr, fn) {
    var out = {};
    arr.forEach(function (x) {
      var k = fn(x); out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  function enableDrag(handle, target) {
    var dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    handle.addEventListener("mousedown", function (e) {
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var r = target.getBoundingClientRect();
      sl = r.left; st = r.top;
      target.style.right = "auto";
      target.style.left = sl + "px";
      target.style.top = st + "px";
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      target.style.left = (sl + (e.clientX - sx)) + "px";
      target.style.top  = (st + (e.clientY - sy)) + "px";
    });
    document.addEventListener("mouseup", function () { dragging = false; });
  }

  // ---------------------------------------------------------------------------
  // Bubble toggles panel
  // ---------------------------------------------------------------------------
  bubble.onclick = function () {
    bubble.remove();
    if (!panel) panel = buildPanel();
    root.appendChild(panel);
    paintCounters();
  };

  root.appendChild(bubble);
  document.body.appendChild(root);

  // Show helper
  window.__bsfShow = function () {
    if (!document.body.contains(root)) document.body.appendChild(root);
    if (!root.contains(bubble) && (!panel || !root.contains(panel))) root.appendChild(bubble);
  };
  window.__bsfDump = function () { downloadJson(); return calls.length; };

  console.log("[BSF] BS2 Features Recorder geladen. Klik op het bolletje rechtsboven om de checklist te openen.");
  console.log("[BSF] " + TASKS.length + " items. Calls worden auto-gevangen voor api.etf.acceptance.besasuite.nl.");
  console.log("[BSF] Helpers: __bsfShow() — paneel terughalen na ✕  ·  __bsfDump() — JSON nu downloaden");
})();
