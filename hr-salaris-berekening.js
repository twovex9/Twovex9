/**
 * hr-salaris-berekening.js — pure salaris-/kostenberekeningen voor de HR-module.
 *
 * Spec §5: Loondienst (Cao/Schaal/Trede/Contracturen -> Bruto, Werkgeverslasten,
 * Uurkostprijs, Indicatief netto) + ZZP (Uurtarief, BTW% -> Kostprijs/uur,
 * kosten/week, kosten/maand).
 *
 * - Brutobron = window.getSalarisschalen() (salarishuis-data.js): bedrag = 36-uur-bruto.
 * - Config (werkgeverslasten%, nettofactor, BTW%) instelbaar via localStorage
 *   "hr_salaris_config_v1"; default 30% / 0,70 / 21%. Settings-UI (Supabase-backed)
 *   volgt in Fase 5; tot dan zijn dit defaults.
 * - Geen externe state; alleen pure functies op window.HRSalaris.
 */
(function (global) {
  "use strict";

  var CONFIG_KEY = "hr_salaris_config_v1";
  var DEFAULTS = { wglPct: 30, nettoFactor: 0.70, zzpBtwPct: 21, urenPerMaandFactor: 4.33 };

  function parseEuro(str) {
    if (str == null) return 0;
    if (typeof str === "number") return isFinite(str) ? str : 0;
    var t = String(str).replace(/€/gi, "").replace(/\s/g, "");
    if (t === "") return 0;
    // NL-notatie: punt = duizendtal, komma = decimaal.
    t = t.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }

  function formatEuro(num) {
    var n = Number(num);
    if (!isFinite(n)) n = 0;
    return "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getConfig() {
    var cfg = Object.assign({}, DEFAULTS);
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === "object") {
          ["wglPct", "nettoFactor", "zzpBtwPct", "urenPerMaandFactor"].forEach(function (k) {
            if (o[k] != null && isFinite(Number(o[k]))) cfg[k] = Number(o[k]);
          });
        }
      }
    } catch (e) { /* defaults */ }
    return cfg;
  }

  function setConfig(patch) {
    var cur = getConfig();
    var next = Object.assign({}, cur, patch || {});
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch (e) { /* */ }
    return next;
  }

  /** 36-uur-bruto (number) voor een schaal-titel + trede uit het salarishuis. */
  function bruto36uurFor(schaalTitle, trede) {
    if (!schaalTitle) return 0;
    try {
      var scales = (typeof global.getSalarisschalen === "function") ? global.getSalarisschalen() : [];
      var s = null;
      for (var i = 0; i < scales.length; i++) {
        if (scales[i] && String(scales[i].title) === String(schaalTitle)) { s = scales[i]; break; }
      }
      if (!s || !Array.isArray(s.rows)) return 0;
      var tre = String(trede == null ? "" : trede).trim();
      var row = null;
      for (var j = 0; j < s.rows.length; j++) {
        if (String(s.rows[j].trede).trim() === tre) { row = s.rows[j]; break; }
      }
      // Lege trede -> val terug op trede "0" als die bestaat.
      if (!row && tre === "") {
        for (var k = 0; k < s.rows.length; k++) {
          if (String(s.rows[k].trede).trim() === "0") { row = s.rows[k]; break; }
        }
      }
      return row ? parseEuro(row.bedrag) : 0;
    } catch (e) { return 0; }
  }

  /**
   * Loondienst-berekening.
   * Bruto = 36-uur-bruto x contracturen/36. Werkgeverslasten = bruto x wgl%.
   * Uurkostprijs = (bruto + wgl) / (contracturen x maandfactor). Netto = bruto x nettofactor.
   */
  function computeLoondienst(opts) {
    opts = opts || {};
    var cfg = getConfig();
    var wglPct = (opts.wglPct != null && isFinite(Number(opts.wglPct))) ? Number(opts.wglPct) : cfg.wglPct;
    var nettoFactor = (opts.nettoFactor != null && isFinite(Number(opts.nettoFactor))) ? Number(opts.nettoFactor) : cfg.nettoFactor;
    var maandFactor = cfg.urenPerMaandFactor || 4.33;
    var bruto36 = (opts.bruto36 != null) ? Number(opts.bruto36) : bruto36uurFor(opts.schaalTitle, opts.trede);
    if (!isFinite(bruto36)) bruto36 = 0;
    var uren = Number(opts.contracturen);
    if (!isFinite(uren) || uren < 0) uren = 0;
    var brutoMaand = uren > 0 ? bruto36 * (uren / 36) : 0;
    var werkgeverslasten = brutoMaand * (wglPct / 100);
    var totaleMaandlast = brutoMaand + werkgeverslasten;
    var maanduren = uren * maandFactor;
    var uurkostprijs = maanduren > 0 ? totaleMaandlast / maanduren : 0;
    var nettoIndicatief = brutoMaand * nettoFactor;
    return {
      bruto36: bruto36,
      brutoMaand: brutoMaand,
      werkgeverslasten: werkgeverslasten,
      totaleMaandlast: totaleMaandlast,
      uurkostprijs: uurkostprijs,
      nettoIndicatief: nettoIndicatief,
      wglPct: wglPct,
    };
  }

  /**
   * ZZP-/inhuur-berekening.
   * Kostprijs/uur = uurtarief x (1 + BTW%). Kosten/week = kostprijs/uur x uren/week.
   * Kosten/maand = kosten/week x maandfactor.
   */
  function computeZzp(opts) {
    opts = opts || {};
    var cfg = getConfig();
    var maandFactor = cfg.urenPerMaandFactor || 4.33;
    var btwPct = (opts.btwPct != null && String(opts.btwPct).trim() !== "" && isFinite(Number(opts.btwPct)))
      ? Number(opts.btwPct) : cfg.zzpBtwPct;
    var tariefEx = (typeof opts.uurtarief === "number") ? opts.uurtarief : parseEuro(opts.uurtarief);
    if (!isFinite(tariefEx)) tariefEx = 0;
    var uren = Number(opts.urenPerWeek);
    if (!isFinite(uren) || uren < 0) uren = 0;
    var kostprijsUur = tariefEx * (1 + (btwPct / 100));
    var kostenWeek = kostprijsUur * uren;
    var kostenMaand = kostenWeek * maandFactor;
    return {
      btwPct: btwPct,
      tariefEx: tariefEx,
      kostprijsUur: kostprijsUur,
      kostenWeek: kostenWeek,
      kostenMaand: kostenMaand,
    };
  }

  global.HRSalaris = {
    parseEuro: parseEuro,
    formatEuro: formatEuro,
    getConfig: getConfig,
    setConfig: setConfig,
    bruto36uurFor: bruto36uurFor,
    computeLoondienst: computeLoondienst,
    computeZzp: computeZzp,
  };
})(typeof window !== "undefined" ? window : globalThis);
