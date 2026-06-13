/* global window, document */
/**
 * dashboard-shared.js — gedeelde data- & reken-laag voor de stuur-dashboards
 * (Eigenaar/Directie, HR, Planner) + het verkeerslicht-overzicht.
 *
 * Eén bron van waarheid voor:
 *  - fetch-wrappers op de productie-Supabase (RPC + REST via window.ffSupabase);
 *  - classificatie van medewerkers (loondienst/zzp/stage) en hun locatie(s)
 *    via medewerkers.data.locatiesSelected (de canonieke koppeling, identiek aan
 *    financien_locaties_dashboard.sql);
 *  - afleiding van de incident-locatie (betrokken_partijen.clients[].location.name
 *    met fallback op locatie_id → locaties.naam);
 *  - de verkeerslicht-drempels (groen/oranje/rood) uit de directie-spec.
 *
 * Alles zonder framework, alleen design-tokens in de CSS (var(--green/--red/...)),
 * zodat dark mode automatisch klopt. Geen schrijf-acties: puur read + reken.
 */
(function (global) {
  "use strict";

  // ─── Supabase toegang ──────────────────────────────────────────────────────
  async function ensureSupabase() {
    if (global.ffSupabaseReady) { try { await global.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    return global.ffSupabase;
  }

  /** RPC-aanroep. Geeft data terug of gooit. */
  async function rpc(name, args) {
    var sb = await ensureSupabase();
    var res = await sb.rpc(name, args || {});
    if (res.error) throw res.error;
    return res.data;
  }

  /**
   * REST-select via de supabase-js query builder.
   * opts: { select, filters:[[col,op,val]], order, limit }.
   */
  async function select(table, opts) {
    var sb = await ensureSupabase();
    opts = opts || {};
    var q = sb.from(table).select(opts.select || "*");
    (opts.filters || []).forEach(function (f) {
      var col = f[0], op = f[1], val = f[2];
      if (typeof q[op] === "function") q = q[op](col, val);
    });
    if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] !== false });
    if (opts.limit) q = q.limit(opts.limit);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  }

  // ─── Formatters ──────────────────────────────────────────────────────────────
  function num(n) { return Number(n) || 0; }
  function eur(n) { return "€ " + Math.round(num(n)).toLocaleString("nl-NL"); }
  function eur1(n) {
    return "€ " + num(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function intl(n) { return num(n).toLocaleString("nl-NL"); }
  function pct(n, d) { return num(n).toLocaleString("nl-NL", { maximumFractionDigits: d == null ? 0 : d }) + "%"; }
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ─── Medewerker-classificatie ────────────────────────────────────────────────
  function mwData(mw) { return (mw && (mw.data || mw)) || {}; }
  function mwNaam(mw) {
    if (!mw) return "";
    var d = mwData(mw);
    var v = mw.voornaam || d.voornaam || "";
    var a = mw.achternaam || d.achternaam || "";
    var full = (v + " " + a).trim();
    return full || d.bs2_full_name || "";
  }
  /**
   * 'loondienst' | 'zzp' | 'stage'. Uitgelijnd op de server-RPC (hr_bestuur_kpis /
   * management_dashboard_v1): stage uitsluitend o.b.v. dienstverband (een leerling in
   * loondienst telt als loondienst), zzp = inhuur/hiring.
   */
  function classifyDienstverband(mw) {
    var d = mwData(mw);
    var dv = String(mw && mw.dienstverband != null ? mw.dienstverband : (d.dienstverband || "")).toLowerCase();
    var et = String(d.bs2_employment_type || "").toLowerCase();
    if (/stage|stagiair/.test(dv)) return "stage";
    if (/inhuur|zzp|hiring|agency|freelance|detach/.test(dv) || et === "hiring" || d.bs2_hiring_type) return "zzp";
    return "loondienst";
  }
  /** Array van master-locatienamen waar de medewerker aan hangt (data.locatiesSelected). */
  function mwLocaties(mw) {
    var d = mwData(mw);
    var ls = d.locatiesSelected;
    if (!Array.isArray(ls)) return [];
    return ls.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
  }
  function mwActief(mw) {
    return mw && mw.archived !== true && String(mw.fase || mwData(mw).fase || "").toLowerCase().indexOf("uit dienst") === -1;
  }

  // ─── Incident-locatie afleiden ───────────────────────────────────────────────
  function incLocatie(inc, locById) {
    if (!inc) return null;
    try {
      var c = inc.betrokken_partijen && inc.betrokken_partijen.clients;
      if (Array.isArray(c)) {
        for (var i = 0; i < c.length; i++) {
          if (c[i] && c[i].location && c[i].location.name) return String(c[i].location.name).trim();
        }
      }
    } catch (e) { /* */ }
    if (inc.locatie_id && locById && locById[inc.locatie_id]) return locById[inc.locatie_id];
    return null;
  }

  // ─── Diensttijd / open-dienst helpers ────────────────────────────────────────
  function dienstLocatie(p) {
    return String((p && (p.vestiging || p.locatie)) || "").trim() || "Onbekende locatie";
  }
  function dienstIsOpen(p) {
    if (!p) return false;
    // Waarheid = geen teamlid toegewezen. (data.is_open uit de BS2-import is stale:
    // 48 van 60 echt-open diensten hadden is_open=false — niet op vertrouwen.)
    return !(p.teamlid && String(p.teamlid).trim());
  }

  // ─── Verkeerslicht-drempels (directie-spec) ──────────────────────────────────
  // Open diensten: 0–2 groen · 3–5 oranje · >5 rood
  function vlOpenDiensten(n) { n = num(n); return n <= 2 ? "groen" : n <= 5 ? "oranje" : "rood"; }
  // Personeelsbezetting (%): >=95 voldoende · 85–95 krap · <85 onvoldoende
  function vlBezetting(p) { p = num(p); return p >= 95 ? "groen" : p >= 85 ? "oranje" : "rood"; }
  // Verzuim (%): <5 laag · 5–8 gemiddeld · >8 hoog
  function vlVerzuim(p) { p = num(p); return p < 5 ? "groen" : p <= 8 ? "oranje" : "rood"; }
  // Resultaat locatie (€): >drempel positief · rond break-even · negatief
  function vlResultaat(bedrag, omzet) {
    bedrag = num(bedrag);
    var marge = Math.max(2000, Math.abs(num(omzet)) * 0.03); // break-even-band
    if (bedrag > marge) return "groen";
    if (bedrag < -marge) return "rood";
    return "oranje";
  }
  // Incidenten: t.o.v. een verwachte norm (nieuw in periode). 0 groen · t/m norm oranje · daarboven rood.
  function vlIncidenten(nieuwAantal, norm) {
    nieuwAantal = num(nieuwAantal); norm = num(norm) || 3;
    if (nieuwAantal === 0) return "groen";
    return nieuwAantal <= norm ? "oranje" : "rood";
  }

  function statusRank(s) { return s === "rood" ? 0 : s === "oranje" ? 1 : 2; }
  /** Slechtste (meest urgente) status uit een lijst. */
  function worstStatus(list) {
    var worst = "groen";
    (list || []).forEach(function (s) { if (s && statusRank(s) < statusRank(worst)) worst = s; });
    return worst;
  }
  function statusClass(s) { return s === "rood" ? "md--rood" : s === "oranje" ? "md--oranje" : "md--groen"; }
  function statusLabel(s) { return s === "rood" ? "Rood" : s === "oranje" ? "Oranje" : "Groen"; }

  // ─── Datum-helpers ───────────────────────────────────────────────────────────
  /** Parse 'yyyy-mm-dd', 'dd-mm-yyyy', of ISO-datetime → Date, of null. */
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = String(v).trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      var p = s.split("-");
      var d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
      return isNaN(d.getTime()) ? null : d;
    }
    var t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }
  function daysFromNow(v) { var d = parseDate(v); return d ? Math.round((d.getTime() - Date.now()) / 86400000) : null; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function isoWeekKey(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    var wk = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return t.getUTCFullYear() + "-W" + String(wk).padStart(2, "0");
  }
  function monthKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }

  global.ffDash = {
    ensureSupabase: ensureSupabase,
    rpc: rpc,
    select: select,
    // formatters
    num: num, eur: eur, eur1: eur1, intl: intl, pct: pct, escHtml: escHtml,
    // medewerker
    mwData: mwData, mwNaam: mwNaam, classifyDienstverband: classifyDienstverband,
    mwLocaties: mwLocaties, mwActief: mwActief,
    // incident / planning
    incLocatie: incLocatie, dienstLocatie: dienstLocatie, dienstIsOpen: dienstIsOpen,
    // verkeerslicht
    vlOpenDiensten: vlOpenDiensten, vlBezetting: vlBezetting, vlVerzuim: vlVerzuim,
    vlResultaat: vlResultaat, vlIncidenten: vlIncidenten,
    statusRank: statusRank, worstStatus: worstStatus, statusClass: statusClass, statusLabel: statusLabel,
    // datum
    parseDate: parseDate, daysFromNow: daysFromNow, startOfDay: startOfDay, isoWeekKey: isoWeekKey, monthKey: monthKey,
  };
})(window);
