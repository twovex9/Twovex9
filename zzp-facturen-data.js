/* global window, localStorage */
/**
 * zzp-facturen-data.js — Supabase data-laag voor de Future Flow-native
 * ZZP/inhuur proforma-facturatie (public.zzp_facturen + _regels + _transitions).
 *
 * Bron-van-waarheid = FF's EIGEN planning (RPC genereer_zzp_proforma). STRIKT LOS
 * van invoices-data.js (BS2-historie) en facturen-data.js (disposition→gemeente).
 *
 * Per (medewerker × locatie × werk-maand) staat een proforma-factuur klaar.
 * "ZZP" = alle inhuur (direct ZZP + via bureau).
 *
 * DATA-SLIM: alleen lichte factuurvelden in de localStorage-cache; zware
 * regels/transitions + logo/extra worden on-demand per factuur opgehaald.
 * _mem = in-memory bron zodat de pagina ook werkt bij volle localStorage-quota.
 *
 * Public API:
 *   zzpFacturenDB.ready / .refresh()
 *   zzpFacturenDB.getAllSync()                → facturen (licht)
 *   zzpFacturenDB.getByIdSync(id)
 *   zzpFacturenDB.getRegels(id)               → Promise<regels[]>
 *   zzpFacturenDB.getTransitions(id)          → Promise<transitions[]>
 *   zzpFacturenDB.getDetail(id)               → Promise<{factuur, regels, transitions}>
 *   zzpFacturenDB.genereer(jaar, maand)       → Promise<{aangemaakt,...}>
 *
 * Event: "besa:zzp-facturen-updated" op window.
 */
(function (global) {
  "use strict";

  var T_FAC = "zzp_facturen";
  var T_REG = "zzp_factuur_regels";
  var T_TR  = "zzp_factuur_transitions";
  var CACHE = "zzp_facturen_v1";

  function reportSilent(action, err) {
    try { console.error("[zzpFacturenDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("ZZP-facturen — " + action, err);
  }
  function readCache() {
    try { var p = JSON.parse(localStorage.getItem(CACHE) || "[]"); return Array.isArray(p) ? p : []; }
    catch (e) { return []; }
  }
  function writeCache(items) {
    try { localStorage.setItem(CACHE, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* quota — _mem is de bron */ }
  }
  function dispatchUpdated(src) {
    try { global.dispatchEvent(new CustomEvent("besa:zzp-facturen-updated", { detail: { source: src || "zzp-facturen-data" } })); }
    catch (e) { /* */ }
  }

  var _fac = null;     // in-memory lichte facturen
  var _reg = {};       // facId → regels[] (on-demand)
  var _tr  = {};       // facId → transitions[] (on-demand)
  function setFac(items) { _fac = Array.isArray(items) ? items : []; writeCache(_fac); }
  function facList() { return (_fac !== null) ? _fac : readCache(); }

  function num(v) { return v == null ? 0 : Number(v); }

  function facRowToObj(r) {
    if (!r) return null;
    return {
      id: r.id,
      medewerkerId: r.medewerker_id || null,
      medewerkerNaam: r.medewerker_naam || "",
      bs2Id: r.bs2_id || null,
      bureau: r.bureau || null,                  // null = direct ZZP
      locatie: r.locatie || "",
      jaar: r.jaar, maand: r.maand,
      ym: (r.jaar != null && r.maand != null) ? (r.jaar + "-" + String(r.maand).padStart(2, "0")) : "",
      proformaTarief: num(r.proforma_tarief),
      proformaUren: num(r.proforma_uren),
      proformaBedrag: num(r.proforma_bedrag),
      proformaDiensten: r.proforma_diensten == null ? 0 : Number(r.proforma_diensten),
      proformaGegenereerdOp: r.proforma_gegenereerd_op || null,
      eigenFactuurnummer: r.eigen_factuurnummer || "",
      ingediendUren: r.ingediend_uren == null ? null : num(r.ingediend_uren),
      ingediendBedrag: r.ingediend_bedrag == null ? null : num(r.ingediend_bedrag),
      status: r.status || "klaargezet",
      heeftBedragAfwijking: !!r.heeft_bedrag_afwijking,        // 🔴
      heeftVerwijderdeDienst: !!r.heeft_verwijderde_dienst,    // 🟠
      afwijkingBedrag: num(r.afwijking_bedrag),
      submittedAt: r.submitted_at || null,
      approvedAt: r.approved_at || null,
      rejectedAt: r.rejected_at || null,
      afwijzingReden: r.afwijzing_reden || "",
      bureauGeaccordeerdOp: r.bureau_geaccordeerd_op || null,
      bureauGeaccordeerdDoor: r.bureau_geaccordeerd_door || "",
      betalingKlaarOp: r.betaling_klaar_op || null,
      archived: !!r.archived,
      aanmaakdatum: r.aanmaakdatum, laatstGewijzigd: r.laatst_gewijzigd,
    };
  }
  function regRowToObj(r) {
    if (!r) return null;
    return {
      id: r.id, factuurId: r.factuur_id,
      planningDienstId: r.planning_dienst_id || null,
      datum: r.datum || null, dag: r.dag || "",
      startIso: r.start_iso || null, eindeIso: r.einde_iso || null,
      pauzeUren: num(r.pauze_uren),
      proformaUren: num(r.proforma_uren), proformaTarief: num(r.proforma_tarief), proformaBedrag: num(r.proforma_bedrag),
      omschrijving: r.omschrijving || "",
      ingediendUren: r.ingediend_uren == null ? null : num(r.ingediend_uren),
      ingediendTarief: r.ingediend_tarief == null ? null : num(r.ingediend_tarief),
      ingediendBedrag: r.ingediend_bedrag == null ? null : num(r.ingediend_bedrag),
      verwijderd: !!r.verwijderd, gewijzigd: !!r.gewijzigd,
      overurenStatus: r.overuren_status || null,
      overurenOudeEinde: r.overuren_oude_einde || null,
      overurenNieuweEinde: r.overuren_nieuwe_einde || null,
      overurenReden: r.overuren_reden || "",
      overurenTeamleider: r.overuren_teamleider || "",
      overurenBehandeldOp: r.overuren_behandeld_op || null,
      sortOrder: r.sort_order == null ? 0 : Number(r.sort_order),
    };
  }

  // Lichte kolom-set (geen logo_url/extra_gegevens — die zijn zwaar, on-demand).
  var FAC_COLS =
    "id,medewerker_id,medewerker_naam,bs2_id,bureau,locatie,jaar,maand," +
    "proforma_tarief,proforma_uren,proforma_bedrag,proforma_diensten,proforma_gegenereerd_op," +
    "eigen_factuurnummer,ingediend_uren,ingediend_bedrag,status," +
    "heeft_bedrag_afwijking,heeft_verwijderde_dienst,afwijking_bedrag," +
    "submitted_at,approved_at,rejected_at,afwijzing_reden,bureau_geaccordeerd_op," +
    "bureau_geaccordeerd_door,betaling_klaar_op,archived,aanmaakdatum,laatst_gewijzigd";

  // PostgREST cap't 1000 rijen/request → pagineren (groeit ~71/maand).
  async function fetchAllRows() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var all = [], from = 0, size = 1000;
    for (;;) {
      var res = await global.besaSupabase
        .from(T_FAC).select(FAC_COLS)
        .order("jaar", { ascending: false }).order("maand", { ascending: false })
        .order("proforma_bedrag", { ascending: false })
        .range(from, from + size - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < size) break;
      from += size;
    }
    return all.map(facRowToObj).filter(Boolean);
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readCache().length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        if (global.besaSupabaseReady) await global.besaSupabaseReady;
        setFac(await fetchAllRows());
        dispatchUpdated("bootstrap");
      } catch (err) { reportSilent("Bootstrap", err); }
    })();
    return readyPromise;
  }
  async function refresh() {
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    _reg = {}; _tr = {};
    setFac(await fetchAllRows());
    dispatchUpdated("refresh");
    return facList();
  }

  function getAllSync() { return facList(); }
  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id), f = facList().find(function (r) { return r && String(r.id) === s; });
    return f ? Object.assign({}, f) : null;
  }

  async function getRegels(facId) {
    if (facId == null) return [];
    var s = String(facId);
    if (_reg[s]) return _reg[s];
    if (!global.besaSupabase) return [];
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    var res = await global.besaSupabase.from(T_REG)
      .select("id,factuur_id,planning_dienst_id,datum,dag,start_iso,einde_iso,pauze_uren," +
              "proforma_uren,proforma_tarief,proforma_bedrag,omschrijving," +
              "ingediend_uren,ingediend_tarief,ingediend_bedrag,verwijderd,gewijzigd," +
              "overuren_status,overuren_oude_einde,overuren_nieuwe_einde,overuren_reden," +
              "overuren_teamleider,overuren_behandeld_op,sort_order")
      .eq("factuur_id", facId)
      .order("sort_order", { ascending: true });
    if (res.error) { reportSilent("Regels laden", res.error); return []; }
    _reg[s] = (res.data || []).map(regRowToObj).filter(Boolean);
    return _reg[s];
  }
  async function getTransitions(facId) {
    if (facId == null) return [];
    var s = String(facId);
    if (_tr[s]) return _tr[s];
    if (!global.besaSupabase) return [];
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    var res = await global.besaSupabase.from(T_TR)
      .select("id,factuur_id,status,actor_email,actor_naam,actor_type,comment,data,created_at")
      .eq("factuur_id", facId)
      .order("created_at", { ascending: true });
    if (res.error) { reportSilent("Verloop laden", res.error); return []; }
    _tr[s] = res.data || [];
    return _tr[s];
  }

  // Volledige detail incl. logo_url + extra_gegevens (zwaar — niet in lijst-cache).
  async function getDetail(facId) {
    if (facId == null) return null;
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    var res = await global.besaSupabase.from(T_FAC)
      .select(FAC_COLS + ",logo_url,extra_gegevens").eq("id", facId).single();
    if (res.error) { reportSilent("Detail laden", res.error); return null; }
    var f = facRowToObj(res.data);
    if (f) { f.logoUrl = res.data.logo_url || ""; f.extraGegevens = res.data.extra_gegevens || null; }
    var regels = await getRegels(facId);
    var transitions = await getTransitions(facId);
    return { factuur: f, regels: regels, transitions: transitions };
  }

  // Proforma genereren voor een werk-maand (idempotent, niet-destructief).
  async function genereer(jaar, maand) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    var res = await global.besaSupabase.rpc("genereer_zzp_proforma", { p_jaar: jaar, p_maand: maand });
    if (res.error) throw res.error;
    await refresh();
    return res.data;
  }

  // medewerker_id van de ingelogde gebruiker (voor eigenaar-detectie ZZP-editor).
  function currentMedewerkerId() {
    try {
      var p = global.profilesDB && global.profilesDB.getCurrentSync && global.profilesDB.getCurrentSync();
      return p ? (p.medewerkerId || p.medewerker_id || null) : null;
    } catch (e) { return null; }
  }

  // Logo uploaden naar Storage → publieke URL (publieke bucket zzp-factuur-logos).
  async function uploadLogo(factuurId, file) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    var ext = (String(file.name || "").match(/\.([a-z0-9]+)$/i) || [, "png"])[1].toLowerCase();
    var path = String(factuurId) + "/logo-" + Date.now() + "." + ext;
    var up = await global.besaSupabase.storage.from("zzp-factuur-logos")
      .upload(path, file, { upsert: true, contentType: file.type || ("image/" + ext) });
    if (up.error) throw up.error;
    var pub = global.besaSupabase.storage.from("zzp-factuur-logos").getPublicUrl(path);
    return (pub && pub.data && pub.data.publicUrl) || "";
  }

  // Opslaan/indienen via de DB-RPC (één code-pad; change-detectie 🔴/🟠 + herbereken
  // gebeuren server-side). opts = {eigenFactuurnummer, logoUrl, extra, regels[], indienen}.
  async function opslaan(factuurId, opts) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (global.besaSupabaseReady) await global.besaSupabaseReady;
    opts = opts || {};
    var res = await global.besaSupabase.rpc("zzp_factuur_opslaan", {
      p_factuur_id: factuurId,
      p_eigen_factuurnummer: opts.eigenFactuurnummer != null ? opts.eigenFactuurnummer : null,
      p_logo_url: opts.logoUrl != null ? opts.logoUrl : null,
      p_extra: opts.extra != null ? opts.extra : null,
      p_regels: opts.regels != null ? opts.regels : null,
      p_indienen: !!opts.indienen,
    });
    if (res.error) throw res.error;
    if (res.data && res.data.error) throw new Error(res.data.error);
    delete _reg[String(factuurId)];
    delete _tr[String(factuurId)];
    await refresh();
    return res.data;
  }

  global.zzpFacturenDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getRegels: getRegels,
    getTransitions: getTransitions,
    getDetail: getDetail,
    genereer: genereer,
    currentMedewerkerId: currentMedewerkerId,
    uploadLogo: uploadLogo,
    opslaan: opslaan,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
