/* global window, document, requestAnimationFrame */
/**
 * home-dashboard.js — "Totaaloverzicht" op de Home-pagina.
 *
 * Een cockpit met klikbare KPI-tegels die inline uitklappen ("inzoomen"):
 *   tegel → groep-niveau (locatie/gemeente/medewerker) → detail-niveau
 *   (diensten/cliënten/traject). Alles op één scherm, scrollbaar.
 *
 * Bron van waarheid = de bestaande Supabase data-lagen (window.*DB). We lezen
 * synchroon uit hun localStorage-cache (getAllSync) en her-renderen zodra een
 * `besa:<x>-updated` event binnenkomt of de bijbehorende `ready`-promise klaar
 * is. Open diensten halen we — net als open-diensten.js — met een directe,
 * gerichte Supabase-fetch op (de planning-cache is op een verse tab vaak leeg/
 * stale omdat planning duizenden rijen telt).
 *
 * Geen schrijfacties: dit is puur read/aggregatie. Geen eigen styling inline —
 * alle opmaak via .hdash-* classes in styles.css (huisstijl-tokens).
 */
(function () {
  "use strict";

  // ── kleine helpers ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtEuro(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtNlDate(value) {
    if (!value) return "—";
    var t = Date.parse(String(value));
    if (!isFinite(t)) {
      var m = /^(\d{2})-(\d{2})-(\d{4})/.exec(String(value).trim());
      if (m) return m[1] + "-" + m[2] + "-" + m[3];
      return "—";
    }
    var d = new Date(t);
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function fmtNlDateTime(value) {
    if (!value) return "—";
    var t = Date.parse(String(value));
    if (!isFinite(t)) return fmtNlDate(value);
    var d = new Date(t);
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear()
      + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function plural(n, een, meer) { return n + " " + (n === 1 ? een : meer); }

  // ── data-accessors (defensief: cache kan leeg/niet-geladen zijn) ────────────
  function safeAll(db) {
    try { return (db && typeof db.getAllSync === "function" && db.getAllSync()) || []; }
    catch (e) { return []; }
  }
  function clientsAll() { return safeAll(window.clientenDB); }
  function mwAll() { return safeAll(window.medewerkersDB); }
  function locatiesAll() { return safeAll(window.locatiesDB); }

  // O(1)-indexen op id — één keer per render herbouwd (rebuildIndexes in
  // buildTiles). Voorkomt herhaalde O(n) Array.find + clone over honderden
  // facturen/beschikkingen/incidenten.
  var _clientIdx = {}, _numIdx = {}, _nameIdx = {}, _mwIdx = {}, _locIdx = {};
  function rebuildIndexes() {
    _clientIdx = {}; _numIdx = {}; _nameIdx = {};
    clientsAll().forEach(function (c) {
      if (!c) return;
      _clientIdx[String(c.id)] = c;
      if (c.clientnummer != null && String(c.clientnummer).trim()) _numIdx[String(c.clientnummer).trim()] = c;
      var nm = ((c.voornaam || "") + " " + (c.achternaam || "")).trim().toLowerCase();
      if (nm) _nameIdx[nm] = c;
    });
    _mwIdx = {}; mwAll().forEach(function (m) { if (m) _mwIdx[String(m.id)] = m; });
    _locIdx = {}; locatiesAll().forEach(function (l) { if (l) _locIdx[String(l.id)] = l; });
  }
  function clientById(id) { return id ? (_clientIdx[String(id)] || null) : null; }
  // Facturen/beschikkingen verwijzen vaak met een BS2-UUID die NIET in clienten
  // staat; val dan terug op clientnummer of naam (matcht ~95% i.p.v. ~4%).
  function clientResolve(id, nummer, naam) {
    if (id && _clientIdx[String(id)]) return _clientIdx[String(id)];
    if (nummer != null && String(nummer).trim() && _numIdx[String(nummer).trim()]) return _numIdx[String(nummer).trim()];
    if (naam) { var k = String(naam).trim().toLowerCase(); if (k && _nameIdx[k]) return _nameIdx[k]; }
    return null;
  }
  function mwById(id) { return id ? (_mwIdx[String(id)] || null) : null; }
  function locatieNaamById(id) {
    if (!id) return "";
    var l = _locIdx[String(id)];
    return l && l.naam ? l.naam : "";
  }
  function clientLabel(c) {
    if (!c) return "Onbekende cliënt";
    var nm = ((c.voornaam || "") + " " + (c.achternaam || "")).trim();
    if (c.clientnummer) nm += " (" + c.clientnummer + ")";
    return nm || "Onbekende cliënt";
  }
  function clientGemeente(c) {
    return (c && c.gemeente && String(c.gemeente).trim()) || "Onbekende gemeente";
  }
  function mwLabel(m) {
    if (!m) return "Onbekende medewerker";
    return (((m.voornaam || "") + " " + (m.achternaam || "")).trim()) || "Onbekende medewerker";
  }

  // Canonieke factuur-classificatie — exact zoals facturen.js (consistentie).
  function factIsBetaald(r) {
    var l = (r && r.st == null ? "" : String(r.st)).trim().toLowerCase();
    if (l.indexOf("nog niet") !== -1) return false;
    return l.indexOf("betaald") !== -1;
  }
  function factIsInBehandeling(r) {
    var t = (r && r.st == null ? "" : String(r.st)).toLowerCase();
    return t.indexOf("behandeling") !== -1 || t.indexOf("gedeclareerd") !== -1;
  }
  // "Gedeclareerd" op het dashboard is betaald-inclusief (betaald telt óók als
  // gedeclareerd); "Niet gedeclareerd" is daarvan het strikte complement.
  function factIsGedeclareerd(r) { return factIsBetaald(r) || factIsInBehandeling(r); }

  function normFase(f) { return String(f || "").toLowerCase().replace(/\s+/g, "_"); }

  // ── groeperen ───────────────────────────────────────────────────────────────
  // Bouwt een geordende lijst groepen uit een platte array. keyFn → groepslabel.
  function groupBy(rows, keyFn) {
    var map = {};
    var order = [];
    rows.forEach(function (r) {
      var k = keyFn(r) || "Onbekend";
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(r);
    });
    return order.map(function (k) { return { key: k, rows: map[k] }; });
  }
  function byCountDesc(a, b) { return (b.count || 0) - (a.count || 0); }

  // ── verzuim-traject (Wet verbetering Poortwachter, indicatief) ──────────────
  function weeksSince(iso) {
    var t = Date.parse(String(iso || ""));
    if (!isFinite(t)) return null;
    var diff = Date.now() - t;
    if (diff < 0) return 0;
    return Math.floor(diff / (7 * 24 * 3600 * 1000));
  }
  function verzuimFaseLabel(rec) {
    if (!rec) return "—";
    if (rec.type === "kort") return "Kort verzuim";
    var w = weeksSince(rec.eerstZiektedag);
    if (w == null) return "Lang verzuim";
    if (w < 6) return "Week " + w + " · Probleemanalyse";
    if (w < 8) return "Week " + w + " · Plan van Aanpak (uiterlijk wk 8)";
    if (w < 42) return "Week " + w + " · Uitvoering Plan van Aanpak";
    if (w < 52) return "Week " + w + " · 42e-weeks UWV-melding gedaan";
    if (w < 87) return "Week " + w + " · Eerstejaarsevaluatie";
    if (w < 104) return "Week " + w + " · Richting WIA-aanvraag (wk 87+)";
    return "Week " + w + " · Langdurig (104+)";
  }

  // ── open diensten: directe, gerichte fetch (zoals open-diensten.js) ─────────
  var openDienstenRaw = [];
  var openDienstenLoaded = false;
  // Lokale kalenderdatum yyyy-mm-dd — identiek aan open-diensten.js todayStr().
  // start_iso bevat naïeve lokale wandklok-tijd; géén .toISOString() gebruiken
  // (dat zou in CET de grens naar de vorige dag schuiven).
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  async function fetchOpenDiensten() {
    if (!window.besaSupabase) return [];
    // Gepagineerde fetch in chunks van 1000 — PostgREST kapt anders stil af op
    // 1000 rijen (productie heeft >2000 open diensten), waardoor de telling +
    // het aantal locaties te laag zou zijn.
    var all = [];
    var chunk = 1000;
    var offset = 0;
    while (true) {
      var r = await window.besaSupabase
        .from("planning")
        .select("id, start_iso, diensttype, locatie, client")
        .eq("open_voor_aanmelding", true)
        .eq("archived", false)
        .gte("start_iso", todayStr())
        .order("start_iso", { ascending: true })
        .range(offset, offset + chunk - 1);
      if (r.error) throw r.error;
      var batch = r.data || [];
      all = all.concat(batch);
      if (batch.length < chunk) break;
      offset += chunk;
      if (offset > 50000) break; // veiligheidsgrens
    }
    return all;
  }

  // ── iconen (compact, currentColor) ──────────────────────────────────────────
  var ICONS = {
    shift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    euro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 21a8 8 0 1 1 0-16"/><path d="M4 11h12M4 15h10"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    health: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  };

  // ── tegel-definities (counts + drill-down) ──────────────────────────────────
  // Elke tegel: { key, label, accent, value, sub, icon, drill }
  // drill: { emptyText, groups:[{ id, label, meta, items:[{label, meta}]|null }] }
  function buildTiles() {
    rebuildIndexes();
    var tiles = [];

    // 1) OPEN DIENSTEN ─ per locatie → de diensten daar
    (function () {
      var rows = openDienstenRaw.slice();
      var groups = groupBy(rows, function (d) {
        return (d.locatie && String(d.locatie).trim()) || "Onbekende locatie";
      }).map(function (g) {
        return {
          id: "od:" + g.key,
          label: g.key,
          meta: plural(g.rows.length, "dienst", "diensten"),
          count: g.rows.length,
          items: g.rows.map(function (d) {
            return {
              label: fmtNlDateTime(d.start_iso) + " · " + (d.diensttype || "Dienst"),
              meta: (d.client && String(d.client).trim()) || "—",
            };
          }),
        };
      }).sort(byCountDesc);
      tiles.push({
        key: "open-diensten",
        label: "Open diensten",
        accent: "blue",
        icon: ICONS.shift,
        value: rows.length,
        sub: openDienstenLoaded
          ? (rows.length ? "op " + plural(groups.length, "locatie", "locaties") : "geen openstaande diensten")
          : "laden…",
        drill: { emptyText: "Geen openstaande diensten.", groups: groups },
      });
    })();

    // 2) INCIDENTEN ─ per locatie → welke cliënt/jongere (met aantal)
    (function () {
      var rows = safeAll(window.incidentenDB).filter(function (i) { return i && !i.archived; });
      var locGroups = groupBy(rows, function (i) {
        return (i.locatieBs2 && i.locatieBs2.name && String(i.locatieBs2.name).trim())
          || locatieNaamById(i.locatieId)
          || "Onbekende locatie";
      }).map(function (g) {
        // Binnen elke locatie: groepeer op de hoofd-cliënt van het incident
        // (i.clientId). NB: betrokkenPartijen/actorType kunnen een andere
        // werkelijke betrokkene aangeven; clientId is de hoofd-cliënt.
        var perClient = groupBy(g.rows, function (i) { return i.clientId || "_onbekend"; })
          .map(function (cg) {
            var c = cg.key === "_onbekend" ? null : clientById(cg.key);
            return {
              label: c ? clientLabel(c) : "Onbekende cliënt",
              meta: plural(cg.rows.length, "incident", "incidenten"),
              count: cg.rows.length,
            };
          }).sort(byCountDesc);
        return {
          id: "inc:" + g.key,
          label: g.key,
          meta: plural(g.rows.length, "incident", "incidenten"),
          count: g.rows.length,
          items: perClient,
        };
      }).sort(byCountDesc);
      tiles.push({
        key: "incidenten",
        label: "Incidenten",
        accent: "red",
        icon: ICONS.alert,
        value: rows.length,
        sub: rows.length ? "op " + plural(locGroups.length, "locatie", "locaties") : "geen incidenten",
        drill: { emptyText: "Geen incidenten geregistreerd.", groups: locGroups },
      });
    })();

    // 3) NIET GEDECLAREERD ─ platte lijst facturen
    (function () {
      var rows = safeAll(window.facturenDB).filter(function (r) {
        return r && !r.archived && !factIsGedeclareerd(r);
      });
      var totaal = rows.reduce(function (a, r) { return a + (Number(r.bedragNum) || 0); }, 0);
      var groups = rows.slice().sort(function (a, b) {
        return (Number(b.bedragNum) || 0) - (Number(a.bedragNum) || 0);
      }).map(function (r, idx) {
        return {
          id: "ng:" + (r.id || idx),
          label: (r.client && String(r.client).trim()) || r.fn || "Factuur",
          meta: ((r.per && String(r.per).trim()) || "—") + " · " + fmtEuro(r.bedragNum),
          items: null,
        };
      });
      tiles.push({
        key: "niet-gedeclareerd",
        label: "Niet gedeclareerd",
        accent: "yellow",
        icon: ICONS.euro,
        value: rows.length,
        sub: rows.length ? fmtEuro(totaal) : "alles gedeclareerd",
        drill: { emptyText: "Alle facturen zijn gedeclareerd.", groups: groups },
      });
    })();

    // 4) WEL GEDECLAREERD ─ per gemeente → facturen
    (function () {
      var rows = safeAll(window.facturenDB).filter(function (r) {
        return r && !r.archived && factIsGedeclareerd(r);
      });
      var totaal = rows.reduce(function (a, r) { return a + (Number(r.bedragNum) || 0); }, 0);
      var groups = groupBy(rows, function (r) {
        return clientGemeente(clientResolve(r.clientId, r.nr, r.client));
      }).map(function (g) {
        var som = g.rows.reduce(function (a, r) { return a + (Number(r.bedragNum) || 0); }, 0);
        var betaald = g.rows.filter(factIsBetaald).length;
        return {
          id: "wg:" + g.key,
          label: g.key,
          meta: fmtEuro(som) + " · " + betaald + "/" + g.rows.length + " betaald",
          count: g.rows.length,
          items: g.rows.slice().sort(function (a, b) {
            return (Number(b.bedragNum) || 0) - (Number(a.bedragNum) || 0);
          }).map(function (r) {
            return {
              label: (r.client && String(r.client).trim()) || r.fn || "Factuur",
              meta: (factIsBetaald(r) ? "Betaald" : "Gedeclareerd") + " · " + fmtEuro(r.bedragNum),
            };
          }),
        };
      }).sort(byCountDesc);
      tiles.push({
        key: "wel-gedeclareerd",
        label: "Wel gedeclareerd",
        accent: "green",
        icon: ICONS.check,
        value: rows.length,
        sub: rows.length ? fmtEuro(totaal) : "nog niets gedeclareerd",
        drill: { emptyText: "Nog geen gedeclareerde facturen.", groups: groups },
      });
    })();

    // 5) IN AFWACHTING ─ beschikkingen (fase in_aanvraag) per gemeente → cliënten
    (function () {
      var rows = safeAll(window.beschikkingenDB).filter(function (b) {
        if (!b) return false;
        if (b.archived || b.gearchiveerd) return false;
        return normFase(b.fase) === "in_aanvraag";
      });
      var groups = groupBy(rows, function (b) {
        return clientGemeente(clientResolve(b.clientId, b.clientnummer, b.clientLabel || b.naam));
      }).map(function (g) {
        return {
          id: "aw:" + g.key,
          label: g.key,
          meta: plural(g.rows.length, "beschikking", "beschikkingen"),
          count: g.rows.length,
          items: g.rows.map(function (b) {
            var c = clientResolve(b.clientId, b.clientnummer, b.clientLabel || b.naam);
            return {
              label: c ? clientLabel(c) : (b.clientLabel || b.naam || "Onbekende cliënt"),
              meta: (b.zorgsoortLabel && String(b.zorgsoortLabel).trim()) || "Beschikking in aanvraag",
            };
          }),
        };
      }).sort(byCountDesc);
      tiles.push({
        key: "in-afwachting",
        label: "In afwachting",
        accent: "yellow",
        icon: ICONS.clock,
        value: rows.length,
        sub: rows.length ? "op " + plural(groups.length, "gemeente", "gemeentes") : "alles goedgekeurd",
        drill: { emptyText: "Geen beschikkingen in afwachting.", groups: groups },
      });
    })();

    // 6) ACTIEVE MEDEWERKERS ─ scrollbare lijst
    (function () {
      var rows = mwAll().filter(function (m) { return m && !m.archived; })
        .slice().sort(function (a, b) {
          return String(a.achternaam || "").localeCompare(String(b.achternaam || ""), "nl");
        });
      var groups = rows.map(function (m) {
        return {
          id: "am:" + m.id,
          label: mwLabel(m),
          meta: (m.functie && String(m.functie).trim())
            || (m.dienstverband && String(m.dienstverband).trim()) || "—",
          items: null,
        };
      });
      tiles.push({
        key: "actieve-medewerkers",
        label: "Actieve medewerkers",
        accent: "blue",
        icon: ICONS.users,
        value: rows.length,
        sub: rows.length ? "actief in dienst" : "geen actieve medewerkers",
        drill: { emptyText: "Geen actieve medewerkers.", groups: groups },
      });
    })();

    // 7) VERZUIM ─ medewerkers met lopend verzuim → traject/fase
    (function () {
      var actief = safeAll(window.medewerkerVerzuimDB).filter(function (v) {
        return v && v.status === "Actief";
      });
      // Per medewerker: meest recente actieve periode is leidend voor het label.
      var perMw = groupBy(actief, function (v) { return v.medewerkerId || "_onbekend"; })
        .map(function (g) {
          var recent = g.rows.slice().sort(function (a, b) {
            return Date.parse(b.eerstZiektedag || 0) - Date.parse(a.eerstZiektedag || 0);
          })[0];
          var m = g.key === "_onbekend" ? null : mwById(g.key);
          return {
            id: "vz:" + g.key,
            label: m ? mwLabel(m) : "Onbekende medewerker",
            meta: recent && recent.type === "lang" ? "Lang verzuim" : "Kort verzuim",
            count: g.rows.length,
            items: g.rows.slice().sort(function (a, b) {
              return Date.parse(b.eerstZiektedag || 0) - Date.parse(a.eerstZiektedag || 0);
            }).map(function (v) {
              var bits = [];
              bits.push("Eerste ziektedag: " + fmtNlDate(v.eerstZiektedag));
              if (v.verwachteTerug) bits.push("verwachte terugkeer: " + fmtNlDate(v.verwachteTerug));
              return { label: verzuimFaseLabel(v), meta: bits.join(" · ") };
            }),
          };
        }).sort(byCountDesc);
      tiles.push({
        key: "verzuim",
        label: "Verzuim",
        accent: "orange",
        icon: ICONS.health,
        value: perMw.length,
        sub: perMw.length ? "medewerker(s) in verzuim" : "niemand in verzuim",
        drill: { emptyText: "Niemand in verzuim.", groups: perMw },
      });
    })();

    return tiles;
  }

  // ── state ────────────────────────────────────────────────────────────────────
  var activeTile = null;        // key van de uitgeklapte tegel (of null)
  var expandedGroups = {};      // { "tileKey|groupId": true }

  // ── render: tegelgrid ─────────────────────────────────────────────────────────
  function render() {
    var grid = $("hdash-grid");
    if (!grid) return;
    var tiles = buildTiles();

    grid.innerHTML = tiles.map(function (t) {
      var isActive = activeTile === t.key;
      return ''
        + '<button type="button" class="hdash-tile hdash-tile--' + t.accent
        + (isActive ? ' is-active' : '') + '" data-key="' + esc(t.key)
        + '" aria-expanded="' + (isActive ? "true" : "false") + '">'
        + '<span class="hdash-tile-ico" aria-hidden="true">' + t.icon + '</span>'
        + '<span class="hdash-tile-body">'
        + '<span class="hdash-tile-val">' + esc(String(t.value)) + '</span>'
        + '<span class="hdash-tile-lbl">' + esc(t.label) + '</span>'
        + '<span class="hdash-tile-sub">' + esc(t.sub) + '</span>'
        + '</span>'
        + '<span class="hdash-tile-chev" aria-hidden="true"></span>'
        + '</button>';
    }).join("");

    renderDrill(tiles);
  }

  // ── render: uitklap-paneel onder het grid ──────────────────────────────────
  function renderDrill(tiles) {
    var panel = $("hdash-drill");
    if (!panel) return;
    if (!activeTile) { panel.hidden = true; panel.innerHTML = ""; return; }

    var tile = (tiles || buildTiles()).filter(function (t) { return t.key === activeTile; })[0];
    if (!tile) { panel.hidden = true; panel.innerHTML = ""; return; }

    var groups = (tile.drill && tile.drill.groups) || [];
    var body;
    if (!groups.length) {
      body = '<div class="hdash-drill-empty">' + esc(tile.drill.emptyText || "Geen gegevens.") + '</div>';
    } else {
      body = '<div class="hdash-drill-list">' + groups.map(function (g) {
        var hasItems = Array.isArray(g.items) && g.items.length > 0;
        var openKey = activeTile + "|" + g.id;
        var isOpen = !!expandedGroups[openKey];
        var rowCls = "hdash-grow" + (hasItems ? "" : " hdash-grow--flat") + (isOpen ? " is-open" : "");
        var head = ''
          + '<' + (hasItems ? 'button type="button"' : 'div') + ' class="' + rowCls + '"'
          + (hasItems ? ' data-gid="' + esc(g.id) + '" aria-expanded="' + (isOpen ? "true" : "false") + '"' : '')
          + '>'
          + '<span class="hdash-grow-lbl">' + esc(g.label) + '</span>'
          + '<span class="hdash-grow-meta">' + esc(g.meta || "") + '</span>'
          + (hasItems ? '<span class="hdash-grow-chev" aria-hidden="true"></span>' : '')
          + '</' + (hasItems ? 'button' : 'div') + '>';
        var sub = "";
        if (hasItems) {
          sub = '<div class="hdash-gsub"' + (isOpen ? "" : " hidden") + '>'
            + g.items.map(function (it) {
              return '<div class="hdash-item">'
                + '<span class="hdash-item-lbl">' + esc(it.label) + '</span>'
                + '<span class="hdash-item-meta">' + esc(it.meta || "") + '</span>'
                + '</div>';
            }).join("")
            + '</div>';
        }
        return '<div class="hdash-gwrap">' + head + sub + '</div>';
      }).join("") + '</div>';
    }

    panel.innerHTML = ''
      + '<div class="hdash-drill-head">'
      + '<span class="hdash-drill-title">' + esc(tile.label) + '</span>'
      + '<button type="button" class="hdash-drill-close" id="hdash-drill-close" aria-label="Sluiten">&times;</button>'
      + '</div>'
      + body;
    panel.hidden = false;
  }

  // Coalesce data-gedreven re-renders: tijdens bootstrap vuren ~7 data-lagen
  // hun besa:*-updated event + ready-promise vrijwel tegelijk. Eén render per
  // tick i.p.v. 8-12 volledige herbouwen (geen flikkering). Bewust setTimeout
  // i.p.v. requestAnimationFrame: rAF wordt gepauzeerd op een achtergrond-tab,
  // waardoor een dashboard dat onzichtbaar laadt anders nooit zou bijwerken.
  var _renderTimer = null;
  function scheduleRender() {
    if (_renderTimer) return;
    _renderTimer = setTimeout(function () { _renderTimer = null; render(); }, 16);
  }

  // ── interactie ────────────────────────────────────────────────────────────────
  function onGridClick(ev) {
    var btn = ev.target.closest && ev.target.closest(".hdash-tile");
    if (!btn) return;
    var key = btn.getAttribute("data-key");
    activeTile = (activeTile === key) ? null : key;
    render(); // directe respons op klik
    if (activeTile) {
      var panel = $("hdash-drill");
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function onDrillClick(ev) {
    var close = ev.target.closest && ev.target.closest("#hdash-drill-close");
    if (close) { activeTile = null; render(); return; }

    var grow = ev.target.closest && ev.target.closest(".hdash-grow[data-gid]");
    if (!grow) return;
    var gid = grow.getAttribute("data-gid");
    var openKey = activeTile + "|" + gid;
    var nowOpen = !expandedGroups[openKey];
    if (nowOpen) expandedGroups[openKey] = true; else delete expandedGroups[openKey];

    // Lichtgewicht toggle (geen volledige re-render → scrollpositie blijft staan).
    grow.classList.toggle("is-open", nowOpen);
    grow.setAttribute("aria-expanded", nowOpen ? "true" : "false");
    var sub = grow.parentNode && grow.parentNode.querySelector(".hdash-gsub");
    if (sub) sub.hidden = !nowOpen;
  }

  // ── boot ──────────────────────────────────────────────────────────────────────
  function bindEvents() {
    var grid = $("hdash-grid");
    var panel = $("hdash-drill");
    if (grid) grid.addEventListener("click", onGridClick);
    if (panel) panel.addEventListener("click", onDrillClick);

    [
      "besa:incidenten-updated", "besa:facturen-updated", "besa:beschikkingen-updated",
      "besa:clienten-updated", "besa:medewerkers-updated", "besa:medewerker-verzuim-updated",
      "besa:locaties-updated",
    ].forEach(function (evt) { window.addEventListener(evt, scheduleRender); });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refreshOpenDiensten();
    });
  }

  async function refreshOpenDiensten() {
    try {
      if (window.besaSupabaseReady) { try { await window.besaSupabaseReady; } catch (e) { /* */ } }
      openDienstenRaw = await fetchOpenDiensten();
    } catch (err) {
      openDienstenRaw = [];
      if (window.besaReportSyncFailure) window.besaReportSyncFailure("Dashboard — open diensten", err);
    }
    openDienstenLoaded = true;
    scheduleRender();
  }

  function awaitDataLayers() {
    // Best-effort: wacht op de ready-promises zodat de eerste render gevuld is.
    var dbs = [
      window.incidentenDB, window.facturenDB, window.beschikkingenDB,
      window.clientenDB, window.medewerkersDB, window.medewerkerVerzuimDB,
      window.locatiesDB,
    ];
    dbs.forEach(function (db) {
      try {
        if (db && db.ready && typeof db.ready.then === "function") {
          db.ready.then(scheduleRender).catch(function () { /* reporter meldde al */ });
        }
      } catch (e) { /* */ }
    });
  }

  function init() {
    if (!$("hdash-grid")) return; // dashboard niet op deze pagina
    bindEvents();
    render();            // direct uit cache (kan deels leeg zijn)
    awaitDataLayers();   // vul aan zodra de data-lagen klaar zijn
    refreshOpenDiensten();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
