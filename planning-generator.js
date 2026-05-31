/* global window, document */
/**
 * planning-generator.js — gratis "Genereren"-motor voor de planning.
 *
 * Vult lege diensten (zonder teamlid) in de zichtbare periode automatisch met
 * geschikte, conflictvrije medewerkers. GEEN AI/LLM — een deterministisch
 * algoritme dat matcht op:
 *   HARD (sluit uit): andere locatie, tijd-overlap (incl. wat de motor zelf in
 *     deze ronde toewijst), verzuim, goedgekeurd verlof, "niet beschikbaar"
 *     (mobiele app).
 *   VOORKEUR (sortering): vaste medewerkers (loondienst/permanent) eerst, dan
 *     ZZP; binnen elke groep de goedkoopste; bij gelijkspel wie de motor deze
 *     ronde het minst heeft ingezet (eerlijk verdelen).
 *
 * De motor TOONT EERST EEN VOORSTEL (preview-modal) dat de planner bevestigt.
 * Pas daarna wordt het rooster gewijzigd — via GERICHTE per-dienst-updates,
 * NOOIT via writePlanningItems/pushFullCache (die zou bij een stale cache de
 * hele planning kunnen wissen).
 *
 * Aangeroepen vanuit planning.js: window.planningGenerator.run({ start, eind,
 * locatieFilter, diensttypeFilter }).
 */
(function (global) {
  "use strict";

  function supa() { return global.besaSupabase; }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoDay(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function dagVan(iso) { return String(iso || "").slice(0, 10); }
  function tijdVan(iso) { var s = String(iso || ""); return s.length >= 16 ? s.slice(11, 16) : ""; }
  function ms(iso) { var t = new Date(iso).getTime(); return isNaN(t) ? null : t; }
  function normNaam(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function volledigeNaam(mw) { return ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim(); }

  var NL_DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  var NL_MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function startDay(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function formatDatum(iso) {
    var d = startDay(iso);
    if (!d) return "—";
    return NL_DAG[d.getDay()] + " " + d.getDate() + " " + NL_MND[d.getMonth()];
  }
  function formatTijdvak(s, e) {
    var a = tijdVan(s), b = tijdVan(e);
    return a && b ? a + "–" + b : (a || "");
  }
  function formatEuro(n) {
    if (n == null || isNaN(n)) return "—";
    return "€ " + Number(n).toFixed(2).replace(".", ",");
  }

  // ── Medewerker-classificatie ────────────────────────────────────────────────
  // Velden staan TOP-LEVEL op een medewerkersDB-object (rowToObj spreidt `data`).
  function dienstverbandGroep(mw) {
    var dv = String(mw.dienstverband || "").toLowerCase();
    if (/inhuur|zzp|freelanc/.test(dv)) return 1;            // ZZP
    if (/loondienst|permanent|vast|onbepaald|bepaald/.test(dv)) return 0; // vaste medewerker
    return 2;                                                // overig (stagiair, leeg, ...)
  }
  function groepLabel(g) { return g === 0 ? "Loondienst" : (g === 1 ? "ZZP" : "Overig"); }

  function uurtarief(mw, diensttype) {
    var rates = mw.shift_type_rates;
    if (rates && typeof rates === "object" && !Array.isArray(rates)) {
      if (diensttype && rates[diensttype] != null && rates[diensttype] !== "") {
        var n = parseFloat(rates[diensttype]);
        if (!isNaN(n)) return n;
      }
      var keys = Object.keys(rates);
      if (keys.length === 1) {
        var solo = parseFloat(rates[keys[0]]);
        if (!isNaN(solo)) return solo;
      }
    }
    var t = mw.uurTarief;
    if (t != null && t !== "") { var lt = parseFloat(t); if (!isNaN(lt)) return lt; }
    return null;
  }

  // ── Context laden (alles direct uit Supabase, per periode) ──────────────────
  async function loadContext(startIso, eindIso) {
    var s = supa();
    var ctx = { bezetByNaam: {}, verzuimByMid: {}, verlofByMid: {}, beschikbaarheidByMid: {} };
    if (!s) return ctx;

    var startMin = dagVan(startIso);                 // ruim venster voor overlap (incl. nachtdiensten ervoor)
    var eindMax = eindIso;
    var startDag = dagVan(startIso), eindDag = dagVan(eindIso);

    // 1) Gevulde diensten in/rond de periode → bezette tijdvakken per medewerker-naam.
    try {
      var rG = await s.from("planning")
        .select("teamlid, start_iso, einde_iso")
        .eq("archived", false)
        .gte("start_iso", startMin)
        .lt("start_iso", eindMax);
      if (rG.error) throw rG.error;
      (rG.data || []).forEach(function (d) {
        var naam = normNaam(d.teamlid);
        if (!naam) return;
        var a = ms(d.start_iso), b = ms(d.einde_iso);
        if (a == null || b == null) return;
        (ctx.bezetByNaam[naam] = ctx.bezetByNaam[naam] || []).push({ s: a, e: b });
      });
    } catch (e) { console.error("[planningGenerator] gevulde-diensten-query mislukt:", e); }

    // 2) Verzuim-perioden die de periode raken.
    try {
      var rV = await s.from("medewerker_verzuim_perioden")
        .select("medewerker_id, type, eerst_ziektedag, werkelijke_terug, verwachte_terug")
        .lte("eerst_ziektedag", eindDag);
      if (rV.error) throw rV.error;
      (rV.data || []).forEach(function (v) {
        var terug = v.werkelijke_terug || v.verwachte_terug; // null = nog niet terug
        (ctx.verzuimByMid[v.medewerker_id] = ctx.verzuimByMid[v.medewerker_id] || []).push({
          van: v.eerst_ziektedag, tot: terug,
        });
      });
    } catch (e) { console.error("[planningGenerator] verzuim-query mislukt:", e); }

    // 3) Goedgekeurd verlof dat de periode raakt.
    try {
      var rL = await s.from("verlof_aanvragen")
        .select("medewerker_id, start_datum, eind_datum, status")
        .eq("status", "goedgekeurd")
        .lte("start_datum", eindDag)
        .gte("eind_datum", startDag);
      if (rL.error) throw rL.error;
      (rL.data || []).forEach(function (v) {
        (ctx.verlofByMid[v.medewerker_id] = ctx.verlofByMid[v.medewerker_id] || []).push({
          van: v.start_datum, tot: v.eind_datum,
        });
      });
    } catch (e) { console.error("[planningGenerator] verlof-query mislukt:", e); }

    // 4) Mobiele beschikbaarheid in de periode → per medewerker per dag.
    try {
      var rB = await s.from("medewerker_beschikbaarheid")
        .select("medewerker_id, datum, status")
        .gte("datum", startDag)
        .lt("datum", eindDag);
      if (rB.error) throw rB.error;
      (rB.data || []).forEach(function (b) {
        if (!b.medewerker_id) return;
        (ctx.beschikbaarheidByMid[b.medewerker_id] = ctx.beschikbaarheidByMid[b.medewerker_id] || {})[b.datum] = b.status;
      });
    } catch (e) { console.error("[planningGenerator] beschikbaarheid-query mislukt:", e); }

    return ctx;
  }

  // ── Lege diensten in de periode ophalen (direct, niet uit stale cache) ───────
  async function fetchLegeDiensten(startIso, eindIso, locatieFilter, diensttypeSet) {
    var s = supa();
    if (!s) return [];
    var r = await s.from("planning")
      .select("id, start_iso, einde_iso, diensttype, locatie, client, vereist_aantal_medewerkers, teamlid, open_voor_aanmelding, archived")
      .eq("archived", false)
      .gte("start_iso", startIso)
      .lt("start_iso", eindIso)
      .order("start_iso", { ascending: true });
    if (r.error) throw r.error;
    return (r.data || []).filter(function (d) {
      if (String(d.teamlid || "").trim() !== "") return false;     // al bezet
      if (d.open_voor_aanmelding === true) return false;           // al opengezet
      if (locatieFilter && d.locatie !== locatieFilter) return false;
      if (diensttypeSet && diensttypeSet.size > 0 && !diensttypeSet.has(d.diensttype)) return false;
      return true;
    });
  }

  // ── Geschiktheid (harde checks) ─────────────────────────────────────────────
  function overlapt(intervallen, a, b) {
    for (var i = 0; i < intervallen.length; i++) {
      if (intervallen[i].s < b && intervallen[i].e > a) return true;
    }
    return false;
  }
  function dektDatum(perioden, dag) {
    for (var i = 0; i < perioden.length; i++) {
      var van = perioden[i].van, tot = perioden[i].tot;
      if (van && dag < van) continue;
      if (tot && dag > tot) continue;
      return true; // tot==null = open einde (nog niet terug)
    }
    return false;
  }

  // Geeft null als geschikt, anders een korte reden waarom niet.
  function ongeschiktReden(mw, dienst, ctx, runAssign) {
    var dag = dagVan(dienst.start_iso);
    var a = ms(dienst.start_iso), b = ms(dienst.einde_iso);

    // Locatie: alleen blokkeren als de medewerker locaties heeft én deze er niet bij zit.
    var locs = Array.isArray(mw.locatiesSelected) ? mw.locatiesSelected : [];
    if (dienst.locatie && locs.length > 0 && locs.indexOf(dienst.locatie) === -1) {
      return "andere locatie";
    }
    // Mobiele beschikbaarheid: expliciet "niet beschikbaar" op die dag.
    var besch = ctx.beschikbaarheidByMid[mw.id];
    if (besch && besch[dag] === "niet_beschikbaar") return "niet beschikbaar";
    // Verzuim / ziek.
    if (ctx.verzuimByMid[mw.id] && dektDatum(ctx.verzuimByMid[mw.id], dag)) return "ziek/verzuim";
    // Goedgekeurd verlof.
    if (ctx.verlofByMid[mw.id] && dektDatum(ctx.verlofByMid[mw.id], dag)) return "met verlof";
    // Tijd-overlap met bestaande dienst (op naam) of een zojuist toegewezen dienst (deze ronde).
    if (a != null && b != null) {
      var bezet = ctx.bezetByNaam[normNaam(volledigeNaam(mw))] || [];
      if (overlapt(bezet, a, b)) return "al ingeroosterd";
      var run = runAssign[mw.id] || [];
      if (overlapt(run, a, b)) return "al ingeroosterd (deze generatie)";
    }
    return null;
  }

  // ── Voorstel berekenen ──────────────────────────────────────────────────────
  function berekenVoorstel(diensten, medewerkers, ctx) {
    var runAssign = {};   // mwId → [{s,e}] toegewezen in deze ronde
    var runCount = {};    // mwId → aantal toewijzingen deze ronde
    var toewijzingen = [];
    var onvulbaar = [];

    diensten.forEach(function (dienst) {
      var kandidaten = [];
      medewerkers.forEach(function (mw) {
        if (ongeschiktReden(mw, dienst, ctx, runAssign) === null) {
          kandidaten.push(mw);
        }
      });
      if (kandidaten.length === 0) { onvulbaar.push(dienst); return; }

      kandidaten.sort(function (x, y) {
        var gx = dienstverbandGroep(x), gy = dienstverbandGroep(y);
        if (gx !== gy) return gx - gy;                     // vaste medewerkers eerst
        var tx = uurtarief(x, dienst.diensttype), ty = uurtarief(y, dienst.diensttype);
        var txv = tx == null ? Infinity : tx, tyv = ty == null ? Infinity : ty;
        if (txv !== tyv) return txv - tyv;                 // goedkoopste eerst
        var cx = runCount[x.id] || 0, cy = runCount[y.id] || 0;
        if (cx !== cy) return cx - cy;                     // eerlijk verdelen
        return volledigeNaam(x).localeCompare(volledigeNaam(y), "nl");
      });

      var gekozen = kandidaten[0];
      var a = ms(dienst.start_iso), b = ms(dienst.einde_iso);
      (runAssign[gekozen.id] = runAssign[gekozen.id] || []).push({ s: a, e: b });
      runCount[gekozen.id] = (runCount[gekozen.id] || 0) + 1;
      toewijzingen.push({
        dienst: dienst,
        mw: gekozen,
        naam: volledigeNaam(gekozen),
        groep: dienstverbandGroep(gekozen),
        tarief: uurtarief(gekozen, dienst.diensttype),
        alternatieven: kandidaten.length - 1,
      });
    });

    return { toewijzingen: toewijzingen, onvulbaar: onvulbaar };
  }

  // ── Preview-modal ───────────────────────────────────────────────────────────
  function ensureModal() {
    var ov = document.getElementById("plgen-modal");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.id = "plgen-modal";
    ov.hidden = true;
    ov.innerHTML =
      '<div class="modal-card plgen-card">' +
        '<div class="modal-header">' +
          '<h2 id="plgen-title">Voorstel planning</h2>' +
          '<button type="button" class="modal-close" id="plgen-close" aria-label="Sluiten"><span aria-hidden="true">&times;</span></button>' +
        '</div>' +
        '<div class="modal-body" id="plgen-body"></div>' +
        '<div class="plgen-foot">' +
          '<div class="plgen-foot__sum" id="plgen-sum"></div>' +
          '<div class="plgen-foot__btns">' +
            '<button type="button" class="btn-outline" id="plgen-cancel">Annuleren</button>' +
            '<button type="button" class="btn-primary" id="plgen-apply">Toepassen</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target.id === "plgen-modal") closeModal(); });
    ov.querySelector("#plgen-close").addEventListener("click", closeModal);
    ov.querySelector("#plgen-cancel").addEventListener("click", closeModal);
    return ov;
  }
  function closeModal() {
    var ov = document.getElementById("plgen-modal");
    if (ov) { ov.hidden = true; ov.classList.remove("is-open"); }
  }

  function rowToewijzing(t, idx) {
    var d = t.dienst;
    var extra = t.alternatieven > 0 ? (t.alternatieven + " alternatie" + (t.alternatieven === 1 ? "f" : "ven")) : "enige optie";
    return '' +
      '<label class="plgen-row">' +
        '<input type="checkbox" class="plgen-cb" data-kind="assign" data-idx="' + idx + '" checked />' +
        '<span class="plgen-row__when"><span class="plgen-row__date">' + escapeHtml(formatDatum(d.start_iso)) + '</span>' +
          '<span class="plgen-row__time">' + escapeHtml(formatTijdvak(d.start_iso, d.einde_iso)) + '</span></span>' +
        '<span class="plgen-row__dienst">' + escapeHtml(d.diensttype || "Dienst") +
          (d.locatie ? ' <span class="plgen-row__loc">' + escapeHtml(d.locatie) + '</span>' : '') + '</span>' +
        '<span class="plgen-row__arrow" aria-hidden="true">→</span>' +
        '<span class="plgen-row__mw"><span class="plgen-row__name">' + escapeHtml(t.naam) + '</span>' +
          '<span class="plgen-row__meta"><span class="plgen-chip plgen-chip--g' + t.groep + '">' + escapeHtml(groepLabel(t.groep)) + '</span>' +
          '<span class="plgen-row__rate">' + escapeHtml(formatEuro(t.tarief)) + '</span>' +
          '<span class="plgen-row__alt">' + escapeHtml(extra) + '</span></span></span>' +
      '</label>';
  }
  function rowOnvulbaar(d, idx) {
    return '' +
      '<label class="plgen-row plgen-row--open">' +
        '<input type="checkbox" class="plgen-cb" data-kind="open" data-idx="' + idx + '" checked />' +
        '<span class="plgen-row__when"><span class="plgen-row__date">' + escapeHtml(formatDatum(d.start_iso)) + '</span>' +
          '<span class="plgen-row__time">' + escapeHtml(formatTijdvak(d.start_iso, d.einde_iso)) + '</span></span>' +
        '<span class="plgen-row__dienst">' + escapeHtml(d.diensttype || "Dienst") +
          (d.locatie ? ' <span class="plgen-row__loc">' + escapeHtml(d.locatie) + '</span>' : '') + '</span>' +
        '<span class="plgen-row__arrow" aria-hidden="true">→</span>' +
        '<span class="plgen-row__mw plgen-row__mw--open">Niemand vrij — op <strong>open</strong> zetten</span>' +
      '</label>';
  }

  function renderVoorstel(voorstel, meta) {
    ensureModal();
    var body = document.getElementById("plgen-body");
    var title = document.getElementById("plgen-title");
    title.textContent = "Voorstel planning — " + meta.periodeLabel;

    var parts = [];
    parts.push('<p class="plgen-intro">' + meta.totaalLeeg + ' lege dienst' + (meta.totaalLeeg === 1 ? '' : 'en') +
      ' in deze periode. Vink uit wat je niet wilt; klik dan op Toepassen.</p>');

    if (voorstel.toewijzingen.length) {
      parts.push('<h3 class="plgen-h3">Toewijzen (' + voorstel.toewijzingen.length + ')</h3>');
      parts.push('<div class="plgen-list">' + voorstel.toewijzingen.map(rowToewijzing).join("") + '</div>');
    }
    if (voorstel.onvulbaar.length) {
      parts.push('<h3 class="plgen-h3">Niemand beschikbaar → op open zetten (' + voorstel.onvulbaar.length + ')</h3>');
      parts.push('<div class="plgen-list">' + voorstel.onvulbaar.map(rowOnvulbaar).join("") + '</div>');
    }
    if (!voorstel.toewijzingen.length && !voorstel.onvulbaar.length) {
      parts.push('<p class="plgen-empty">Geen lege diensten gevonden in deze periode (met de huidige filters).</p>');
    }
    body.innerHTML = parts.join("");

    updateSum(voorstel);
    var ov = document.getElementById("plgen-modal");
    ov.hidden = false;
    ov.classList.add("is-open");

    body.querySelectorAll(".plgen-cb").forEach(function (cb) {
      cb.addEventListener("change", function () { updateSum(voorstel); });
    });
    var applyBtn = document.getElementById("plgen-apply");
    applyBtn.disabled = false;
    applyBtn.onclick = function () { applyVoorstel(voorstel, applyBtn); };
  }

  function getChecked() {
    var assign = [], open = [];
    document.querySelectorAll("#plgen-body .plgen-cb").forEach(function (cb) {
      if (!cb.checked) return;
      var idx = parseInt(cb.getAttribute("data-idx"), 10);
      if (cb.getAttribute("data-kind") === "assign") assign.push(idx); else open.push(idx);
    });
    return { assign: assign, open: open };
  }
  function updateSum(voorstel) {
    var sel = getChecked();
    var sum = document.getElementById("plgen-sum");
    if (sum) sum.textContent = sel.assign.length + " toewijzen · " + sel.open.length + " op open";
  }

  // ── Toepassen — GERICHTE per-dienst-updates (nooit pushFullCache) ───────────
  async function applyVoorstel(voorstel, applyBtn) {
    var s = supa();
    if (!s) { if (global.showError) global.showError("Geen verbinding met de database."); return; }
    var sel = getChecked();
    if (sel.assign.length === 0 && sel.open.length === 0) { closeModal(); return; }

    applyBtn.disabled = true;
    var origLabel = applyBtn.textContent;
    applyBtn.textContent = "Bezig…";
    var okAssign = 0, okOpen = 0, fouten = 0;

    for (var i = 0; i < sel.assign.length; i++) {
      var t = voorstel.toewijzingen[sel.assign[i]];
      if (!t) continue;
      try {
        var r = await s.from("planning").update({ teamlid: t.naam }).eq("id", t.dienst.id);
        if (r.error) throw r.error; okAssign++;
      } catch (e) { fouten++; console.error("[planningGenerator] toewijzen mislukt:", e); }
    }
    for (var j = 0; j < sel.open.length; j++) {
      var d = voorstel.onvulbaar[sel.open[j]];
      if (!d) continue;
      try {
        var r2 = await s.from("planning").update({ open_voor_aanmelding: true }).eq("id", d.id);
        if (r2.error) throw r2.error; okOpen++;
      } catch (e) { fouten++; console.error("[planningGenerator] open zetten mislukt:", e); }
    }

    // Cache verversen zodat het rooster de wijzigingen toont (best-effort).
    try { if (global.planningDB && global.planningDB.refresh) await global.planningDB.refresh(); } catch (e) { /* */ }

    applyBtn.textContent = origLabel;
    closeModal();
    if (fouten > 0 && global.showError) {
      global.showError(fouten + " wijziging(en) mislukt. " + okAssign + " toegewezen, " + okOpen + " op open gezet.");
    } else if (global.showActionFeedback) {
      global.showActionFeedback("saved", "Planning bijgewerkt",
        okAssign + " dienst" + (okAssign === 1 ? "" : "en") + " toegewezen" +
        (okOpen ? ", " + okOpen + " op open gezet" : ""));
    }
  }

  // ── Publieke API ────────────────────────────────────────────────────────────
  async function run(opts) {
    opts = opts || {};
    var startIso = opts.startIso, eindIso = opts.eindIso;
    if (!startIso || !eindIso) { if (global.showError) global.showError("Geen periode bekend om te genereren."); return; }
    if (!supa()) { if (global.showError) global.showError("Geen verbinding met de database."); return; }
    if (!global.medewerkersDB || !global.medewerkersDB.getAllSync) {
      if (global.showError) global.showError("Medewerkers nog niet geladen — probeer zo nog eens.");
      return;
    }

    ensureModal();
    var body = document.getElementById("plgen-body");
    body.innerHTML = '<p class="plgen-loading">Geschikte medewerkers zoeken…</p>';
    document.getElementById("plgen-title").textContent = "Voorstel planning — " + (opts.periodeLabel || "");
    var sum = document.getElementById("plgen-sum"); if (sum) sum.textContent = "";
    var applyBtn = document.getElementById("plgen-apply"); if (applyBtn) applyBtn.disabled = true;
    var ov = document.getElementById("plgen-modal"); ov.hidden = false; ov.classList.add("is-open");

    try {
      try { if (global.medewerkersDB.ready) await global.medewerkersDB.ready; } catch (e) { /* */ }
      var medewerkers = global.medewerkersDB.getAllSync().filter(function (m) { return m && !m.archived; });
      var diensten = await fetchLegeDiensten(startIso, eindIso, opts.locatieFilter || "", opts.diensttypeSet || null);
      var ctx = await loadContext(startIso, eindIso);
      var voorstel = berekenVoorstel(diensten, medewerkers, ctx);
      renderVoorstel(voorstel, { periodeLabel: opts.periodeLabel || "", totaalLeeg: diensten.length });
    } catch (err) {
      console.error("[planningGenerator] run mislukt:", err);
      body.innerHTML = '<p class="plgen-empty">Genereren mislukt: ' + escapeHtml(err && err.message ? err.message : String(err)) + '</p>';
    }
  }

  global.planningGenerator = { run: run };
})(window);
