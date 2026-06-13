/* global window, document */
/**
 * planning-generator.js — gratis "Genereren" + "Reïntegreren"-motor voor de planning.
 *
 * Vult lege diensten (zonder teamlid) in de zichtbare periode automatisch met
 * geschikte, conflictvrije medewerkers. GEEN AI/LLM — een deterministisch
 * constraint-algoritme.
 *
 * VOLGORDE (wie eerst):
 *   1. Loondienst — binnen hun ROOSTER (welke dagen/tijden, ingevuld bij HR) en
 *      tot aan hun CONTRACTUREN per week (niet meer dan het contract).
 *   2. Kernteam-ZZP van DIE locatie (vinkje bij HR: locatiesCoreMap[locatie]).
 *   3. Losse ZZP die beschikbaarheid hebben opgegeven → SUGGESTIE = UITNODIGEN
 *      (de ZZP'er accepteert zelf; krijgt niet meteen de dienst).
 *   Binnen elke groep: goedkoopste eerst, dan eerlijk verdelen (run-fairness).
 *
 * HARDE uitsluiting: andere locatie, tijd-overlap (incl. wat de motor zelf deze
 *   ronde toewijst), verzuim, goedgekeurd verlof, "niet beschikbaar", buiten
 *   beschikbare tijden (ZZP), buiten rooster (loondienst), contracturen vol.
 *
 * De motor TOONT EERST EEN VOORSTEL (preview-modal) dat de planner bevestigt.
 * Pas daarna wordt het rooster gewijzigd — toewijzen via GERICHTE per-dienst
 * `update().eq('id')`, uitnodigen via de SECURITY DEFINER RPC
 * `dienst_uitnodiging_sturen`. NOOIT writePlanningItems/pushFullCache.
 *
 * Tijd-conventie: de planning-grid toont LOKALE tijd (new Date(iso)). Daarom
 * matchen rooster/beschikbaarheid-tijden hier óók op lokale tijd, zodat het
 * voorstel klopt met wat de planner ziet.
 *
 * Aangeroepen vanuit planning.js:
 *   window.planningGenerator.run({ startIso, eindIso, periodeLabel,
 *     locatieFilter, diensttypeSet, mode })   // mode: 'genereren' | 'reintegreren'
 */
(function (global) {
  "use strict";

  function supa() { return global.ffSupabase; }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoDay(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function dagVan(iso) { return String(iso || "").slice(0, 10); }
  function ms(iso) { var t = new Date(iso).getTime(); return isNaN(t) ? null : t; }
  function localDate(iso) { var t = new Date(iso); return isNaN(t.getTime()) ? null : t; }
  function dagLocal(iso) { var t = localDate(iso); return t ? isoDay(t) : ""; }
  function minOfDay(t) { return t.getHours() * 60 + t.getMinutes(); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function mondayOf(d) { var off = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - off); }
  function mondayKey(d) { return isoDay(mondayOf(d)); }
  function isoWeek(d) {
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - day + 3);
    var firstThu = new Date(t.getFullYear(), 0, 4);
    var fd = (firstThu.getDay() + 6) % 7;
    firstThu.setDate(firstThu.getDate() - fd + 3);
    return 1 + Math.round((t - firstThu) / (7 * 86400000));
  }
  function tmin(s) { var m = String(s == null ? "" : s).match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function normNaam(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function volledigeNaam(mw) { return ((mw.voornaam || "") + " " + (mw.achternaam || "")).trim(); }

  var NL_DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  var NL_MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  var ROOSTER_KEYS = ["zo", "ma", "di", "wo", "do", "vr", "za"]; // index = getDay()
  function formatDatum(iso) {
    var d = localDate(iso); if (!d) return "—";
    return NL_DAG[d.getDay()] + " " + d.getDate() + " " + NL_MND[d.getMonth()];
  }
  function formatTijdvak(s, e) {
    var a = localDate(s), b = localDate(e);
    if (!a) return "";
    var sa = pad2(a.getHours()) + ":" + pad2(a.getMinutes());
    if (!b) return sa;
    return sa + "–" + pad2(b.getHours()) + ":" + pad2(b.getMinutes());
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
  // Tier PER DIENST: 0 loondienst, 1 kernteam-ZZP van deze locatie, 2 losse ZZP, 3 overig.
  function tierVoorDienst(mw, dienst) {
    var g = dienstverbandGroep(mw);
    if (g === 0) return 0;
    if (g === 1) {
      var core = mw.locatiesCoreMap;
      if (dienst.locatie && core && typeof core === "object" && core[dienst.locatie] === true) return 1;
      return 2;
    }
    return 3;
  }
  function tierLabel(t) { return t === 0 ? "Loondienst" : t === 1 ? "Kernteam-ZZP" : t === 2 ? "Losse ZZP" : "Overig"; }
  function isInviteTier(t) { return t === 2; } // losse ZZP → uitnodigen i.p.v. toewijzen

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
  function contracturenVan(mw) {
    var v = parseFloat(String(mw.contracturen == null ? "" : mw.contracturen).replace(",", "."));
    return !isNaN(v) && v > 0 ? v : null;
  }
  // Heeft de medewerker een ECHT ingevuld rooster (minstens 1 dag aan)? Zo niet:
  // geen rooster-beperking (anders zou een leeg/default rooster iedereen blokkeren).
  function heeftActiefRooster(mw) {
    var r = mw.rooster;
    if (!r || typeof r !== "object") return false;
    for (var i = 0; i < ROOSTER_KEYS.length; i++) {
      var rd = r[ROOSTER_KEYS[i]];
      if (rd && rd.enabled) return true;
    }
    return false;
  }

  // ── Context laden (alles direct uit Supabase, per periode) ──────────────────
  // Standaard AI-planregels (gebruikt als planning_settings (nog) niet geladen is).
  var REGELS_DEFAULT = {
    weekendConsistentie: true,   // weekend za+zo zelfde dagdeel (loondienst)
    geenAvondNaarDag: true,      // geen avonddienst → dagdienst de volgende dag (loondienst)
    avondGrensUur: 15,           // dienst start ≥ dit lokale uur = avonddienst
    overlapWaarschuwing: true,
  };

  async function loadContext(startIso, eindIso) {
    var s = supa();
    var ctx = {
      bezetByNaam: {}, naamDisplay: {}, verzuimByMid: {}, verlofByMid: {}, beschikbaarheidByMid: {},
      regels: REGELS_DEFAULT,
    };
    if (!s) return ctx;

    // 0) AI-planregels (singleton planning_settings).
    try {
      var rS = await s.from("planning_settings")
        .select("ai_weekend_consistentie, ai_geen_avond_naar_dag, ai_avond_grens_uur, ai_overlap_waarschuwing")
        .limit(1).maybeSingle();
      if (rS.error) throw rS.error;
      if (rS.data) {
        ctx.regels = {
          weekendConsistentie: rS.data.ai_weekend_consistentie !== false,
          geenAvondNaarDag: rS.data.ai_geen_avond_naar_dag !== false,
          avondGrensUur: (rS.data.ai_avond_grens_uur != null ? +rS.data.ai_avond_grens_uur : 15),
          overlapWaarschuwing: rS.data.ai_overlap_waarschuwing !== false,
        };
      }
    } catch (e) { console.error("[planningGenerator] planregels-query mislukt:", e); }

    var startDag = dagVan(startIso), eindDag = dagVan(eindIso);
    // Voor de contracturen-cap moeten we de VOLLEDIGE ISO-weken rond de periode kennen,
    // niet alleen de zichtbare dagen → vensters tot week-grenzen oprekken.
    var qStart = startDag, qEnd = eindDag;
    try {
      var ps = startDag.split("-"), pe = eindDag.split("-");
      var ds = new Date(+ps[0], +ps[1] - 1, +ps[2]);
      var de = new Date(+pe[0], +pe[1] - 1, +pe[2]);
      qStart = isoDay(mondayOf(ds));
      qEnd = isoDay(addDays(mondayOf(addDays(de, -1)), 7));
    } catch (e) { /* val terug op de zichtbare dagen */ }

    // 1) Gevulde diensten in/rond de periode → bezette tijdvakken per medewerker-naam.
    try {
      var rG = await s.from("planning")
        .select("teamlid, start_iso, einde_iso")
        .eq("archived", false)
        .gte("start_iso", qStart)
        .lt("start_iso", qEnd);
      if (rG.error) throw rG.error;
      (rG.data || []).forEach(function (d) {
        var naam = normNaam(d.teamlid);
        if (!naam) return;
        var a = ms(d.start_iso), b = ms(d.einde_iso);
        if (a == null || b == null) return;
        (ctx.bezetByNaam[naam] = ctx.bezetByNaam[naam] || []).push({ s: a, e: b });
        ctx.naamDisplay[naam] = String(d.teamlid || "").trim();
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

    // 4) Beschikbaarheid in de periode → per medewerker per dag (incl. tijden).
    try {
      var rB = await s.from("medewerker_beschikbaarheid")
        .select("medewerker_id, datum, status, begin_tijd, eind_tijd")
        .gte("datum", startDag)
        .lte("datum", eindDag);
      if (rB.error) throw rB.error;
      (rB.data || []).forEach(function (b) {
        if (!b.medewerker_id) return;
        (ctx.beschikbaarheidByMid[b.medewerker_id] = ctx.beschikbaarheidByMid[b.medewerker_id] || {})[b.datum] = {
          status: b.status, begin: b.begin_tijd, eind: b.eind_tijd,
        };
      });
    } catch (e) { console.error("[planningGenerator] beschikbaarheid-query mislukt:", e); }

    return ctx;
  }

  // ── Lege diensten in de periode ophalen (direct, niet uit stale cache) ───────
  async function fetchLegeDiensten(startIso, eindIso, locatieFilter, diensttypeSet, includeOpen) {
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
      if (String(d.teamlid || "").trim() !== "") return false;       // al bezet
      if (!includeOpen && d.open_voor_aanmelding === true) return false; // al opengezet (alleen overslaan bij genereren)
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
  // Som van reeds-ingeplande uren (bestaand + deze ronde) in de ISO-week van `wkKey`.
  function weekUren(ctx, naam, runAssign, mwId, wkKey) {
    var sum = 0;
    var best = ctx.bezetByNaam[normNaam(naam)] || [];
    best.forEach(function (iv) { if (mondayKey(new Date(iv.s)) === wkKey) sum += (iv.e - iv.s); });
    var run = runAssign[mwId] || [];
    run.forEach(function (iv) { if (mondayKey(new Date(iv.s)) === wkKey) sum += (iv.e - iv.s); });
    return sum / 3600000;
  }

  // Dagdeel van een dienst op basis van de LOKALE starttijd: 'avond' als de dienst
  // op of na het grens-uur start (default 15:00), anders 'dag'. (Grid toont lokale tijd.)
  function dagdeelVanStartMs(msVal, grensUur) {
    var d = new Date(msVal);
    if (isNaN(d.getTime())) return null;
    return d.getHours() >= grensUur ? "avond" : "dag";
  }
  // Dagdelen van alle diensten (bestaand + deze ronde) van een medewerker op
  // kalenderdag `dagIso`. Voor weekend-consistentie en de avond→dag-rustregel.
  function dagdelenOpDag(ctx, runAssign, mw, dagIso, grensUur) {
    var out = [];
    var naam = normNaam(volledigeNaam(mw));
    (ctx.bezetByNaam[naam] || []).forEach(function (iv) {
      if (isoDay(new Date(iv.s)) === dagIso) out.push(dagdeelVanStartMs(iv.s, grensUur));
    });
    (runAssign[mw.id] || []).forEach(function (iv) {
      if (isoDay(new Date(iv.s)) === dagIso) out.push(dagdeelVanStartMs(iv.s, grensUur));
    });
    return out;
  }

  // Medewerkers die in de periode AL dubbel geboekt staan (overlappende diensten).
  // Voor een waarschuwing in het voorstel — de motor maakt zelf geen overlap.
  function bestaandeOverlapNamen(ctx) {
    var out = [];
    var byNaam = ctx.bezetByNaam || {};
    Object.keys(byNaam).forEach(function (naam) {
      var iv = byNaam[naam].slice().sort(function (x, y) { return x.s - y.s; });
      for (var i = 1; i < iv.length; i++) {
        if (iv[i].s < iv[i - 1].e) { out.push(ctx.naamDisplay[naam] || naam); break; }
      }
    });
    return out.sort(function (a, b) { return String(a).localeCompare(String(b), "nl"); });
  }

  // Geeft null als geschikt, anders een korte reden waarom niet.
  function ongeschiktReden(mw, dienst, ctx, runAssign) {
    var st = localDate(dienst.start_iso), et = localDate(dienst.einde_iso);
    if (!st) return "ongeldige dienst";
    var dag = isoDay(st);
    var a = ms(dienst.start_iso), b = ms(dienst.einde_iso);
    var sMin = minOfDay(st);
    var eMin = et ? minOfDay(et) : sMin;
    if (eMin <= sMin) eMin += 1440; // nachtdienst over middernacht

    // Locatie: alleen blokkeren als de medewerker locaties heeft én deze er niet bij zit.
    var locs = Array.isArray(mw.locatiesSelected) ? mw.locatiesSelected : [];
    if (dienst.locatie && locs.length > 0 && locs.indexOf(dienst.locatie) === -1) {
      return "andere locatie";
    }

    // Beschikbaarheid (geldt voor iedereen die het invulde): niet-beschikbaar of buiten tijden.
    var besch = ctx.beschikbaarheidByMid[mw.id];
    var brow = besch && besch[dag];
    if (brow) {
      if (brow.status === "niet_beschikbaar") return "niet beschikbaar";
      if (brow.status === "beschikbaar" && brow.begin && brow.eind) {
        var bS = tmin(brow.begin), bE = tmin(brow.eind);
        if (bE != null && bE <= (bS || 0)) bE += 1440;
        if (bS != null && bE != null && !(sMin < bE && eMin > bS)) return "buiten beschikbare tijd";
      }
    }

    // Verzuim / ziek.
    if (ctx.verzuimByMid[mw.id] && dektDatum(ctx.verzuimByMid[mw.id], dag)) return "ziek/verzuim";
    // Goedgekeurd verlof.
    if (ctx.verlofByMid[mw.id] && dektDatum(ctx.verlofByMid[mw.id], dag)) return "met verlof";

    // Rooster (loondienst e.a. met ingevuld rooster): juiste dag + binnen tijd.
    if (heeftActiefRooster(mw)) {
      var key = ROOSTER_KEYS[st.getDay()];
      var rd = mw.rooster[key];
      if (!rd || !rd.enabled) return "buiten rooster";
      if (key === "za" || key === "zo") {
        var wkmode = (mw.roosterWeekend && mw.roosterWeekend[key]) || "alle";
        if (wkmode === "even" || wkmode === "oneven") {
          var pariteit = (isoWeek(st) % 2 === 0) ? "even" : "oneven";
          if (pariteit !== wkmode) return "rooster (andere week)";
        }
      }
      var rS = tmin(rd.start), rE = tmin(rd.end);
      if (rE != null && rE <= (rS || 0)) rE += 1440;
      if (rS != null && rE != null && !(sMin < rE && eMin > rS)) return "buiten roostertijd";
    }

    // Tijd-overlap met bestaande dienst (op naam) of een zojuist toegewezen dienst (deze ronde).
    if (a != null && b != null) {
      var bezet = ctx.bezetByNaam[normNaam(volledigeNaam(mw))] || [];
      if (overlapt(bezet, a, b)) return "al ingeroosterd";
      var run = runAssign[mw.id] || [];
      if (overlapt(run, a, b)) return "al ingeroosterd (deze generatie)";
    }

    // Contracturen-cap: loondienst niet boven het weekcontract plannen.
    if (dienstverbandGroep(mw) === 0) {
      var cu = contracturenVan(mw);
      if (cu != null && a != null && b != null) {
        var have = weekUren(ctx, volledigeNaam(mw), runAssign, mw.id, mondayKey(st));
        var deze = (b - a) / 3600000;
        if (have + deze > cu + 0.001) return "contracturen vol (" + cu + "u)";
      }
    }

    // ── Weekend- en rustregels ────────────────────────────────────────────────
    var regels = (ctx && ctx.regels) || REGELS_DEFAULT;
    var grens = (regels.avondGrensUur != null ? regels.avondGrensUur : 15);
    var dow = st.getDay();                       // 0=zo … 6=za
    var isWeekend = (dow === 0 || dow === 6);
    var ditDagdeel = dagdeelVanStartMs(st.getTime(), grens); // 'dag' | 'avond'

    // Uitzondering = medewerker-afspraak in het rooster. Geldt ALTIJD en voor
    // iedereen die het aanvinkte (de AI maakt hierop een uitzondering).
    var vk = (mw.weekendVoorkeur && typeof mw.weekendVoorkeur === "object") ? mw.weekendVoorkeur : null;
    if (isWeekend && vk) {
      if (vk.nooitWeekend === true) return "werkt niet in het weekend";
      if (vk.nooitOverdag === true && ditDagdeel === "dag") return "weekend: alleen avonddiensten";
    }

    // De consistentie-/rustregels gelden voor loondienst (vaste medewerkers).
    if (dienstverbandGroep(mw) === 0) {
      // Geen avonddienst → dagdienst de volgende dag (te weinig rust). In beide
      // richtingen checken zodat de toewijsvolgorde niet uitmaakt.
      if (regels.geenAvondNaarDag) {
        if (ditDagdeel === "dag") {
          if (dagdelenOpDag(ctx, runAssign, mw, isoDay(addDays(st, -1)), grens).indexOf("avond") !== -1) {
            return "te vroeg na avonddienst";
          }
        } else if (ditDagdeel === "avond") {
          if (dagdelenOpDag(ctx, runAssign, mw, isoDay(addDays(st, 1)), grens).indexOf("dag") !== -1) {
            return "dagdienst volgt te snel";
          }
        }
      }
      // Weekend-consistentie: za en zo van hetzelfde weekend zelfde dagdeel —
      // of twee dagdiensten of twee avonddiensten.
      if (isWeekend && regels.weekendConsistentie) {
        var andereDag = isoDay(addDays(st, dow === 6 ? 1 : -1)); // za→zo (+1), zo→za (−1)
        var delen = dagdelenOpDag(ctx, runAssign, mw, andereDag, grens);
        for (var wi = 0; wi < delen.length; wi++) {
          if (delen[wi] && delen[wi] !== ditDagdeel) {
            return "weekend: " + (dow === 6 ? "zondag" : "zaterdag") + " is " + delen[wi] + "dienst";
          }
        }
      }
    }

    return null;
  }

  // ── Voorstel berekenen ──────────────────────────────────────────────────────
  function berekenVoorstel(diensten, medewerkers, ctx) {
    var runAssign = {};   // mwId → [{s,e}] toegewezen/uitgenodigd in deze ronde
    var runCount = {};    // mwId → aantal keer ingezet deze ronde
    var items = [];       // {dienst, actie:'assign'|'invite', mw, naam, tier, tarief, alternatieven, opties[]}
    var onvulbaar = [];

    diensten.forEach(function (dienst) {
      var kandidaten = [];
      medewerkers.forEach(function (mw) {
        if (ongeschiktReden(mw, dienst, ctx, runAssign) === null) kandidaten.push(mw);
      });
      if (kandidaten.length === 0) { onvulbaar.push(dienst); return; }

      kandidaten.sort(function (x, y) {
        var tx = tierVoorDienst(x, dienst), ty = tierVoorDienst(y, dienst);
        if (tx !== ty) return tx - ty;                     // loondienst → kernteam-ZZP → losse ZZP
        var rx = uurtarief(x, dienst.diensttype), ry = uurtarief(y, dienst.diensttype);
        var rxv = rx == null ? Infinity : rx, ryv = ry == null ? Infinity : ry;
        if (rxv !== ryv) return rxv - ryv;                 // goedkoopste eerst
        var cx = runCount[x.id] || 0, cy = runCount[y.id] || 0;
        if (cx !== cy) return cx - cy;                     // eerlijk verdelen
        return volledigeNaam(x).localeCompare(volledigeNaam(y), "nl");
      });

      var gekozen = kandidaten[0];
      var tier = tierVoorDienst(gekozen, dienst);
      var actie = isInviteTier(tier) ? "invite" : "assign";
      var a = ms(dienst.start_iso), b = ms(dienst.einde_iso);
      (runAssign[gekozen.id] = runAssign[gekozen.id] || []).push({ s: a, e: b });
      runCount[gekozen.id] = (runCount[gekozen.id] || 0) + 1;

      var opties = [];
      if (actie === "invite") {
        for (var i = 0; i < kandidaten.length && opties.length < 6; i++) {
          if (tierVoorDienst(kandidaten[i], dienst) === 2) {
            opties.push({
              id: kandidaten[i].id,
              naam: volledigeNaam(kandidaten[i]),
              tarief: uurtarief(kandidaten[i], dienst.diensttype),
            });
          }
        }
      }

      items.push({
        dienst: dienst, actie: actie, mw: gekozen, medewerkerId: gekozen.id,
        naam: volledigeNaam(gekozen), tier: tier,
        tarief: uurtarief(gekozen, dienst.diensttype),
        alternatieven: kandidaten.length - 1, opties: opties,
      });
    });

    return { items: items, onvulbaar: onvulbaar };
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

  function whenDienstHtml(d) {
    return '<span class="plgen-row__when"><span class="plgen-row__date">' + escapeHtml(formatDatum(d.start_iso)) + '</span>' +
      '<span class="plgen-row__time">' + escapeHtml(formatTijdvak(d.start_iso, d.einde_iso)) + '</span></span>' +
      '<span class="plgen-row__dienst">' + escapeHtml(d.diensttype || "Dienst") +
        (d.locatie ? ' <span class="plgen-row__loc">' + escapeHtml(d.locatie) + '</span>' : '') + '</span>' +
      '<span class="plgen-row__arrow" aria-hidden="true">→</span>';
  }
  function rowAssign(t, idx) {
    var extra = t.alternatieven > 0 ? (t.alternatieven + " alternatie" + (t.alternatieven === 1 ? "f" : "ven")) : "enige optie";
    return '' +
      '<label class="plgen-row">' +
        '<input type="checkbox" class="plgen-cb" data-kind="assign" data-idx="' + idx + '" checked />' +
        whenDienstHtml(t.dienst) +
        '<span class="plgen-row__mw"><span class="plgen-row__name">' + escapeHtml(t.naam) + '</span>' +
          '<span class="plgen-row__meta"><span class="plgen-chip plgen-chip--t' + t.tier + '">' + escapeHtml(tierLabel(t.tier)) + '</span>' +
          '<span class="plgen-row__rate">' + escapeHtml(formatEuro(t.tarief)) + '</span>' +
          '<span class="plgen-row__alt">' + escapeHtml(extra) + '</span></span></span>' +
      '</label>';
  }
  function rowInvite(t, idx) {
    var opts = t.opties.map(function (o) {
      return '<option value="' + escapeHtml(o.id) + '">' + escapeHtml(o.naam) +
        (o.tarief != null ? " — " + escapeHtml(formatEuro(o.tarief)) : "") + '</option>';
    }).join("");
    return '' +
      '<label class="plgen-row plgen-row--invite">' +
        '<input type="checkbox" class="plgen-cb" data-kind="invite" data-idx="' + idx + '" checked />' +
        whenDienstHtml(t.dienst) +
        '<span class="plgen-row__mw">' +
          '<span class="plgen-row__meta plgen-row__meta--invite"><span class="plgen-chip plgen-chip--t2">Uitnodigen</span>' +
          '<select class="plgen-invite-select" data-idx="' + idx + '" aria-label="Wie uitnodigen">' + opts + '</select></span>' +
          '<span class="plgen-row__alt">ZZP accepteert zelf</span></span>' +
      '</label>';
  }
  function rowOpen(d, idx) {
    return '' +
      '<label class="plgen-row plgen-row--open">' +
        '<input type="checkbox" class="plgen-cb" data-kind="open" data-idx="' + idx + '" checked />' +
        whenDienstHtml(d) +
        '<span class="plgen-row__mw plgen-row__mw--open">Niemand vrij — op <strong>open</strong> zetten</span>' +
      '</label>';
  }

  function renderVoorstel(voorstel, meta) {
    ensureModal();
    var body = document.getElementById("plgen-body");
    var title = document.getElementById("plgen-title");
    title.textContent = (meta.mode === "reintegreren" ? "Reïntegreren — " : "Voorstel planning — ") + meta.periodeLabel;

    var assigns = [], invites = [];
    voorstel.items.forEach(function (t, i) { (t.actie === "invite" ? invites : assigns).push({ t: t, i: i }); });

    var parts = [];
    // Waarschuwing als er AL medewerkers dubbel geboekt staan in de periode.
    var ovNamen = Array.isArray(meta.overlapNamen) ? meta.overlapNamen : [];
    if (ovNamen.length) {
      parts.push('<div class="plgen-warn"><span class="plgen-warn__ico" aria-hidden="true">!</span><span>' +
        '<strong>Let op — ' + ovNamen.length + ' medewerker' + (ovNamen.length === 1 ? '' : 's') +
        ' al dubbel ingeroosterd</strong> in deze periode (overlappende diensten): ' +
        escapeHtml(ovNamen.join(", ")) + '. De motor plant deze persoon niet extra in, maar controleer de bestaande dubbele dienst.</span></div>');
    }
    parts.push('<p class="plgen-intro">' + meta.totaalLeeg + (meta.mode === "reintegreren" ? " open/lege" : " lege") +
      ' dienst' + (meta.totaalLeeg === 1 ? '' : 'en') + ' in deze periode. Vink uit wat je niet wilt; klik dan op Toepassen.</p>');

    if (assigns.length) {
      parts.push('<h3 class="plgen-h3">Toewijzen — loondienst &amp; kernteam (' + assigns.length + ')</h3>');
      parts.push('<div class="plgen-list">' + assigns.map(function (x) { return rowAssign(x.t, x.i); }).join("") + '</div>');
    }
    if (invites.length) {
      parts.push('<h3 class="plgen-h3">Uitnodigen — losse ZZP, goedkoopste eerst (' + invites.length + ')</h3>');
      parts.push('<div class="plgen-list">' + invites.map(function (x) { return rowInvite(x.t, x.i); }).join("") + '</div>');
    }
    if (voorstel.onvulbaar.length) {
      parts.push('<h3 class="plgen-h3">Niemand beschikbaar → op open zetten (' + voorstel.onvulbaar.length + ')</h3>');
      parts.push('<div class="plgen-list">' + voorstel.onvulbaar.map(rowOpen).join("") + '</div>');
    }
    if (!voorstel.items.length && !voorstel.onvulbaar.length) {
      parts.push('<p class="plgen-empty">Geen lege diensten gevonden in deze periode (met de huidige filters).</p>');
    }
    body.innerHTML = parts.join("");

    updateSum();
    var ov = document.getElementById("plgen-modal");
    ov.hidden = false;
    ov.classList.add("is-open");

    body.querySelectorAll(".plgen-cb").forEach(function (cb) {
      cb.addEventListener("change", updateSum);
    });
    var applyBtn = document.getElementById("plgen-apply");
    applyBtn.disabled = false;
    applyBtn.onclick = function () { applyVoorstel(voorstel, applyBtn); };
  }

  function getChecked() {
    var assign = [], invite = [], open = [];
    document.querySelectorAll("#plgen-body .plgen-cb").forEach(function (cb) {
      if (!cb.checked) return;
      var idx = parseInt(cb.getAttribute("data-idx"), 10);
      var kind = cb.getAttribute("data-kind");
      if (kind === "assign") assign.push(idx);
      else if (kind === "invite") invite.push(idx);
      else open.push(idx);
    });
    return { assign: assign, invite: invite, open: open };
  }
  function selectedInvitee(idx, fallback) {
    var sel = document.querySelector('#plgen-body .plgen-invite-select[data-idx="' + idx + '"]');
    return (sel && sel.value) ? sel.value : fallback;
  }
  function updateSum() {
    var sel = getChecked();
    var sum = document.getElementById("plgen-sum");
    if (sum) sum.textContent = sel.assign.length + " toewijzen · " + sel.invite.length + " uitnodigen · " + sel.open.length + " op open";
  }

  // ── Toepassen — toewijzen via gerichte update, uitnodigen via RPC ───────────
  async function applyVoorstel(voorstel, applyBtn) {
    var s = supa();
    if (!s) { if (global.showError) global.showError("Geen verbinding met de database."); return; }
    var sel = getChecked();
    if (!sel.assign.length && !sel.invite.length && !sel.open.length) { closeModal(); return; }

    applyBtn.disabled = true;
    var origLabel = applyBtn.textContent;
    applyBtn.textContent = "Bezig…";
    var okAssign = 0, okInvite = 0, okOpen = 0, fouten = 0;

    for (var i = 0; i < sel.assign.length; i++) {
      var t = voorstel.items[sel.assign[i]];
      if (!t) continue;
      try {
        var r = await s.from("planning").update({ teamlid: t.naam, open_voor_aanmelding: false }).eq("id", t.dienst.id);
        if (r.error) throw r.error; okAssign++;
      } catch (e) { fouten++; console.error("[planningGenerator] toewijzen mislukt:", e); }
    }
    for (var k = 0; k < sel.invite.length; k++) {
      var ti = voorstel.items[sel.invite[k]];
      if (!ti) continue;
      var mwId = selectedInvitee(sel.invite[k], ti.medewerkerId);
      try {
        var ri = await s.rpc("dienst_uitnodiging_sturen", { p_dienst_id: ti.dienst.id, p_medewerker_id: mwId, p_notitie: null });
        if (ri.error) throw ri.error; okInvite++;
      } catch (e) { fouten++; console.error("[planningGenerator] uitnodigen mislukt:", e); }
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
    var parts = [];
    if (okAssign) parts.push(okAssign + " toegewezen");
    if (okInvite) parts.push(okInvite + " uitgenodigd");
    if (okOpen) parts.push(okOpen + " op open gezet");
    if (fouten > 0 && global.showError) {
      global.showError(fouten + " wijziging(en) mislukt. " + (parts.join(", ") || "0 verwerkt") + ".");
    } else if (global.showActionFeedback) {
      global.showActionFeedback("saved", "Planning bijgewerkt", parts.join(", ") || "Geen wijzigingen");
    }
  }

  // ── Publieke API ────────────────────────────────────────────────────────────
  async function run(opts) {
    opts = opts || {};
    var mode = opts.mode === "reintegreren" ? "reintegreren" : "genereren";
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
    document.getElementById("plgen-title").textContent =
      (mode === "reintegreren" ? "Reïntegreren — " : "Voorstel planning — ") + (opts.periodeLabel || "");
    var sum = document.getElementById("plgen-sum"); if (sum) sum.textContent = "";
    var applyBtn = document.getElementById("plgen-apply"); if (applyBtn) applyBtn.disabled = true;
    var ov = document.getElementById("plgen-modal"); ov.hidden = false; ov.classList.add("is-open");

    try {
      try { if (global.medewerkersDB.ready) await global.medewerkersDB.ready; } catch (e) { /* */ }
      // Verberg kantoor/overhead-medewerkers (alleen niet-planbare locaties) net als de planning zelf.
      var zicht = (typeof global.ffMwZichtbaarInPlanning === "function") ? global.ffMwZichtbaarInPlanning : function () { return true; };
      var medewerkers = global.medewerkersDB.getAllSync().filter(function (m) { return m && !m.archived && zicht(m); });
      var diensten = await fetchLegeDiensten(startIso, eindIso, opts.locatieFilter || "", opts.diensttypeSet || null, mode === "reintegreren");
      var ctx = await loadContext(startIso, eindIso);
      var voorstel = berekenVoorstel(diensten, medewerkers, ctx);
      renderVoorstel(voorstel, {
        periodeLabel: opts.periodeLabel || "", totaalLeeg: diensten.length, mode: mode,
        overlapNamen: (ctx.regels.overlapWaarschuwing ? bestaandeOverlapNamen(ctx) : []),
      });
    } catch (err) {
      console.error("[planningGenerator] run mislukt:", err);
      body.innerHTML = '<p class="plgen-empty">Genereren mislukt: ' + escapeHtml(err && err.message ? err.message : String(err)) + '</p>';
    }
  }

  global.planningGenerator = { run: run };
})(window);
