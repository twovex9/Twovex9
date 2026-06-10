/* global window, localStorage */
/**
 * Kilometer-declaraties — Supabase data-laag, 1-op-1 BS2.
 *
 * BS2-model (mileage-declarations): één DECLARATIE = 1 medewerker × 1 maand
 * (status, total_kilometers, total_reimbursement, submitted_at,
 * submission_status, …) met per-dag RECORDS als losse rijen.
 * Bron-van-waarheid: public.kilometer_declaraties + public.kilometer_records.
 * Totalen/vergoeding komen VERBATIM uit BS2 (niet herrekenen).
 *
 * DATA-SLIM + _mem (bindende les): zware BS2-raw niet in de localStorage-
 * cache; in-memory bron zodat de pagina ook bij volle quota werkt.
 *
 * Public API:
 *   kilometerDeclaratiesDB.ready
 *   kilometerDeclaratiesDB.refresh()
 *   kilometerDeclaratiesDB.getAllSync()                  → declaraties
 *   kilometerDeclaratiesDB.getByIdSync(id)
 *   kilometerDeclaratiesDB.getForMedewerkerSync(mwId)    → declaraties v/d mw
 *   kilometerDeclaratiesDB.getRecordsForDeclaratieSync(declId) → per-dag
 *   kilometerDeclaratiesDB.getRawBs2(id)  → volledige BS2-declaratie (on-demand)
 *
 * Events: "besa:kilometer-declaraties-updated" op window.
 */
(function (global) {
  "use strict";

  var T_DECL = "kilometer_declaraties";
  var T_REC = "kilometer_records";
  var CACHE_DECL = "km_decl_v2";
  var CACHE_REC = "km_rec_v2";

  function reportSilent(action, err) {
    try { console.error("[kilometerDeclaratiesDB] " + action + " mislukt:", err); } catch (e) { /* */ }
    if (global.besaReportSyncFailure) {
      global.besaReportSyncFailure("Kilometer-declaraties — " + action, err);
    }
  }

  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function writeCache(key, items) {
    try { localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : [])); }
    catch (e) { /* quota vol — _mem is de bron */ }
  }
  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("besa:kilometer-declaraties-updated", {
        detail: { source: source || "kilometer-declaraties-data" },
      }));
    } catch (e) { /* */ }
  }

  // In-memory bron-van-waarheid (sessie); localStorage best-effort.
  var _decl = null, _rec = null;
  function setDecl(items) { _decl = Array.isArray(items) ? items : []; writeCache(CACHE_DECL, _decl); }
  function setRec(items) { _rec = Array.isArray(items) ? items : []; writeCache(CACHE_REC, _rec); }
  function declList() { return (_decl !== null) ? _decl : readCache(CACHE_DECL); }
  function recList() { return (_rec !== null) ? _rec : readCache(CACHE_REC); }

  function declRowToObj(row) {
    if (!row) return null;
    var d = (row.data && typeof row.data === "object") ? row.data : {};
    return {
      id: row.id,
      medewerkerId: row.medewerker_id || null,
      jaar: row.jaar,
      maand: row.maand,
      monthDisplay: d.bs2_month_display || null,
      status: row.status || "draft",
      totalKilometers: row.total_kilometers == null ? 0 : Number(row.total_kilometers),
      totalReimbursement: row.total_reimbursement == null ? 0 : Number(row.total_reimbursement),
      submittedAt: row.submitted_at || null,
      submissionStatus: row.submission_status || null,
      isEditable: !!row.is_editable,
      canBeSubmitted: !!row.can_be_submitted,
      isDeadlinePassed: !!row.is_deadline_passed,
      bs2Id: d.bs2_id || null,
      bs2Employee: d.bs2_employee || null,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }
  function recRowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      declaratieId: row.declaratie_id || null,
      datum: row.datum || null,
      beschrijving: row.beschrijving || "",
      kilometers: row.kilometers == null ? 0 : Number(row.kilometers),
      type: row.type || null,
      typeDisplay: row.type_display
        || (row.type === "office" ? "Naar kantoor"
          : row.type === "werkwerk" ? "Werk-werk"
          : row.type || ""),
      isAutomatic: !!row.is_automatic,
      isWerkwerk: row.type === "werkwerk",
      locatieNaam: row.locatie_naam || "",
      locatieBs2Id: row.locatie_bs2_id || null,
      // Zakelijke-rit-velden (mobiliteitsmodule 2026-06-10)
      clientId: row.client_id || null,
      clientNaam: row.client_naam || "",
      locatieId: row.locatie_id || null,
      trajectType: row.traject_type || null,
      vertrekadres: row.vertrekadres || "",
      bestemmingsadres: row.bestemmingsadres || "",
      reden: row.reden || "",
      kmBerekend: row.km_berekend == null ? null : Number(row.km_berekend),
      // PR-C: rit met cliënten → inzittendenverzekering-marker (data jsonb)
      metClienten: !!(row.data && row.data.met_clienten),
      // Werk-werk goedkeuring (zorgcoördinator). NULL = n.v.t. (woon-werk
      // e.d.); voor werk-werk: pending | approved | rejected.
      approvalStatus: row.approval_status || null,
      approvedBy: row.approved_by || null,
      approvedByNaam: row.approved_by_naam || "",
      approvedAt: row.approved_at || null,
      rejectionReason: row.rejection_reason || "",
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  async function fetchAll() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    var dRes = await global.besaSupabase
      .from(T_DECL)
      .select("id,medewerker_id,jaar,maand,status,total_kilometers,total_reimbursement,submitted_at,submission_status,is_editable,can_be_submitted,is_deadline_passed,data,aanmaakdatum,laatst_gewijzigd")
      .order("jaar", { ascending: false })
      .order("maand", { ascending: false });
    if (dRes.error) throw dRes.error;
    var rRes = await global.besaSupabase
      .from(T_REC)
      .select("id,declaratie_id,datum,beschrijving,kilometers,type,type_display,is_automatic,locatie_naam,locatie_bs2_id,client_id,client_naam,locatie_id,traject_type,vertrekadres,bestemmingsadres,reden,km_berekend,data,approval_status,approved_by,approved_by_naam,approved_at,rejection_reason,aanmaakdatum,laatst_gewijzigd")
      .order("datum", { ascending: true });
    if (rRes.error) throw rRes.error;
    return {
      decl: (dRes.data || []).map(declRowToObj).filter(Boolean),
      rec: (rRes.data || []).map(recRowToObj).filter(Boolean),
    };
  }

  var readyPromise = null;
  function bootstrap() {
    if (readyPromise) return readyPromise;
    if (readCache(CACHE_DECL).length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var r = await fetchAll();
        setDecl(r.decl);
        setRec(r.rec);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("Bootstrap", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var r = await fetchAll();
    setDecl(r.decl);
    setRec(r.rec);
    dispatchUpdated("refresh");
    return r.decl;
  }

  function getAllSync() { return declList(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var f = declList().find(function (r) { return r && String(r.id) === s; });
    return f ? Object.assign({}, f) : null;
  }

  function getForMedewerkerSync(medewerkerId) {
    if (!medewerkerId) return [];
    var s = String(medewerkerId);
    return declList().filter(function (r) { return r && String(r.medewerkerId) === s; });
  }

  function getRecordsForDeclaratieSync(declId) {
    if (declId == null) return [];
    var s = String(declId);
    return recList()
      .filter(function (r) { return r && String(r.declaratieId) === s; })
      .sort(function (a, b) {
        return String(a.datum || "").localeCompare(String(b.datum || ""));
      });
  }

  // Volledige BS2-raw on-demand (NIET gecachet — DATA-SLIM).
  async function getRawBs2(id) {
    if (!global.besaSupabase || id == null) return null;
    var res = await global.besaSupabase
      .from(T_DECL).select("data").eq("id", id).single();
    if (res.error) throw res.error;
    var d = res.data && res.data.data;
    return (d && d.bs2_scrape) || null;
  }

  // ---------------------------------------------------------------------------
  // Vergoeding-rekenmotor (1-op-1 BS2, bewezen 100% tegen alle 16 declaraties
  // incl. cap-gevallen): per RIT cap op 100 km, daarna × €0,39, som → 2 dec.
  //   total_kilometers   = Σ rit.kilometers
  //   total_reimbursement = round( Σ min(rit.kilometers, 100) × 0,39 , 2 )
  // Alleen voor bewerkbare (draft) declaraties; ingediende/vergrendelde
  // blijven de VERBATIM BS2-waarde houden (worden nooit gemuteerd).
  // ---------------------------------------------------------------------------
  var KM_RATE = 0.39, KM_RIT_CAP = 100;
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  // Telt deze rit mee in maandtotaal + vergoeding? Werk-werk dat nog op
  // goedkeuring wacht (pending) of is afgewezen (rejected) telt NIET mee —
  // pas na goedkeuring (approved) wel. Woon-werk e.d. (approval_status NULL)
  // telt altijd mee.
  function recCountsTowardTotal(r) {
    if (!r) return false;
    var st = r.approvalStatus != null ? r.approvalStatus : (r.approval_status || null);
    return st !== "pending" && st !== "rejected";
  }
  function computeTotals(recs) {
    var km = 0, eur = 0;
    (recs || []).forEach(function (r) {
      if (!recCountsTowardTotal(r)) return;
      var k = Number(r && r.kilometers) || 0;
      km += k;
      eur += Math.min(k, KM_RIT_CAP) * KM_RATE;
    });
    return { km: round2(km), eur: round2(eur) };
  }
  function genRecId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return global.crypto.randomUUID();
      }
    } catch (e) { /* */ }
    return "kmr-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10);
  }

  async function persistDeclTotals(declId) {
    var s = String(declId);
    // Ingediende/vergrendelde declaraties houden hun VERBATIM totalen (BS2 of
    // ingediend) — nooit herrekenen. Alleen drafts worden bijgewerkt.
    var dCur = getByIdSync(declId);
    if (dCur && (dCur.status === "submitted" || dCur.status === "locked")) return null;
    var recs = recList().filter(function (r) { return r && String(r.declaratieId) === s; });
    var t = computeTotals(recs);
    var arr = declList();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === s) {
        arr[i] = Object.assign({}, arr[i], {
          totalKilometers: t.km, totalReimbursement: t.eur,
        });
        break;
      }
    }
    setDecl(arr);
    if (global.besaSupabase) {
      var res = await global.besaSupabase.from(T_DECL).update({
        total_kilometers: t.km,
        total_reimbursement: t.eur,
        laatst_gewijzigd: new Date().toISOString(),
      }).eq("id", declId);
      if (res.error) throw res.error;
    }
    return t;
  }

  async function addRecord(p) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!p || !p.declaratieId) throw new Error("declaratieId vereist");
    var nowIso = new Date().toISOString();
    var isWerk = p.type === "werkwerk";
    var row = {
      id: genRecId(),
      declaratie_id: p.declaratieId,
      datum: p.datum || null,
      beschrijving: p.beschrijving || "",
      kilometers: Number(p.kilometers) || 0,
      type: p.type || "manual",
      type_display: p.typeDisplay
        || (isWerk ? "Werk-werk" : p.type === "office" ? "Naar kantoor" : "Handmatig"),
      is_automatic: false,
      locatie_naam: p.locatieNaam || "",
      locatie_bs2_id: p.locatieBs2Id || null,
      // Zakelijke-rit-velden (mobiliteitsmodule)
      client_id: p.clientId || null,
      client_naam: p.clientNaam || null,
      locatie_id: p.locatieId || null,
      traject_type: p.trajectType || null,
      vertrekadres: p.vertrekadres || null,
      bestemmingsadres: p.bestemmingsadres || null,
      reden: p.reden || null,
      km_berekend: (p.kmBerekend == null || p.kmBerekend === "") ? null : Number(p.kmBerekend),
      // Werk-werk start altijd als 'pending' → wacht op goedkeuring door de
      // zorgcoördinator. Overige rit-types hebben geen goedkeuring (NULL).
      approval_status: isWerk ? "pending" : null,
      // PR-C: met_clienten in data jsonb (geen schema-wijziging)
      data: p.metClienten ? { met_clienten: true } : {},
      aanmaakdatum: nowIso,
      laatst_gewijzigd: nowIso,
    };
    var res = await global.besaSupabase.from(T_REC).insert(row).select().single();
    if (res.error) throw res.error;
    var rec = recRowToObj(res.data || row);
    var rl = recList(); rl.push(rec); setRec(rl);
    await persistDeclTotals(p.declaratieId);
    dispatchUpdated("addRecord");
    return rec;
  }

  async function updateRecord(id, patch) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (id == null) throw new Error("record-id vereist");
    var upd = { laatst_gewijzigd: new Date().toISOString() };
    if (patch && "datum" in patch) upd.datum = patch.datum || null;
    if (patch && "beschrijving" in patch) upd.beschrijving = patch.beschrijving || "";
    if (patch && "kilometers" in patch) upd.kilometers = Number(patch.kilometers) || 0;
    if (patch && "locatieNaam" in patch) upd.locatie_naam = patch.locatieNaam || "";
    if (patch && "locatieBs2Id" in patch) upd.locatie_bs2_id = patch.locatieBs2Id || null;
    // Zakelijke-rit-velden (mobiliteitsmodule)
    if (patch && "clientId" in patch) upd.client_id = patch.clientId || null;
    if (patch && "clientNaam" in patch) upd.client_naam = patch.clientNaam || null;
    if (patch && "locatieId" in patch) upd.locatie_id = patch.locatieId || null;
    if (patch && "trajectType" in patch) upd.traject_type = patch.trajectType || null;
    if (patch && "vertrekadres" in patch) upd.vertrekadres = patch.vertrekadres || null;
    if (patch && "bestemmingsadres" in patch) upd.bestemmingsadres = patch.bestemmingsadres || null;
    if (patch && "reden" in patch) upd.reden = patch.reden || null;
    if (patch && "kmBerekend" in patch) upd.km_berekend = (patch.kmBerekend == null || patch.kmBerekend === "") ? null : Number(patch.kmBerekend);
    // PR-C: met_clienten in data jsonb (merge zodat andere data-keys blijven)
    if (patch && "metClienten" in patch) {
      // Fetch huidige data zodat we niet andere keys overschrijven
      try {
        var cur = await global.besaSupabase.from(T_REC).select("data").eq("id", id).maybeSingle();
        var existing = (cur && cur.data && cur.data.data) || {};
        upd.data = Object.assign({}, existing, { met_clienten: !!patch.metClienten });
      } catch (e) {
        upd.data = { met_clienten: !!patch.metClienten };
      }
    }
    // Werk-werk: een inhoudelijke wijziging vereist herbeoordeling → approval
    // terug naar 'pending'. Zo kan een al goedgekeurde rit niet stilletjes
    // worden opgehoogd zonder dat de zorgcoördinator er opnieuw naar kijkt.
    var curRec = recList().find(function (r) { return r && String(r.id) === String(id); });
    if (curRec && curRec.type === "werkwerk") {
      upd.approval_status = "pending";
      upd.approved_by = null;
      upd.approved_by_naam = null;
      upd.approved_at = null;
      upd.rejection_reason = null;
    }
    var res = await global.besaSupabase.from(T_REC).update(upd).eq("id", id).select().single();
    if (res.error) throw res.error;
    var rec = recRowToObj(res.data);
    var rl = recList();
    for (var i = 0; i < rl.length; i++) {
      if (rl[i] && String(rl[i].id) === String(id)) { rl[i] = rec; break; }
    }
    setRec(rl);
    if (rec && rec.declaratieId) await persistDeclTotals(rec.declaratieId);
    dispatchUpdated("updateRecord");
    return rec;
  }

  async function deleteRecord(id) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (id == null) throw new Error("record-id vereist");
    var rl = recList();
    var found = rl.find(function (r) { return r && String(r.id) === String(id); });
    var declId = found ? found.declaratieId : null;
    var res = await global.besaSupabase.from(T_REC).delete().eq("id", id);
    if (res.error) throw res.error;
    setRec(rl.filter(function (r) { return r && String(r.id) !== String(id); }));
    if (declId) await persistDeclTotals(declId);
    dispatchUpdated("deleteRecord");
  }

  // ---------------------------------------------------------------------------
  // Werk-werk goedkeuring (zorgcoördinator). Zet approval_status op approved
  // of rejected (+ wie/wanneer/reden) en herrekent de declaratie-totalen:
  // approved telt voortaan mee, rejected/pending niet. Idempotent qua cache.
  // ---------------------------------------------------------------------------
  async function setApproval(recId, p) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (recId == null) throw new Error("record-id vereist");
    var status = p && p.status;
    if (status !== "approved" && status !== "rejected") {
      throw new Error("Ongeldige goedkeur-status: " + status);
    }
    var nowIso = new Date().toISOString();
    var upd = {
      approval_status: status,
      approved_by: (p && p.approverId) || null,
      approved_by_naam: (p && p.approverNaam) || null,
      approved_at: nowIso,
      rejection_reason: status === "rejected" ? ((p && p.reason) || "") : null,
      laatst_gewijzigd: nowIso,
    };
    var res = await global.besaSupabase.from(T_REC).update(upd).eq("id", recId).select().single();
    if (res.error) throw res.error;
    var rec = recRowToObj(res.data);
    var rl = recList();
    for (var i = 0; i < rl.length; i++) {
      if (rl[i] && String(rl[i].id) === String(recId)) { rl[i] = rec; break; }
    }
    setRec(rl);
    if (rec && rec.declaratieId) await persistDeclTotals(rec.declaratieId);
    dispatchUpdated("setApproval");
    return rec;
  }

  // ---------------------------------------------------------------------------
  // Deadline-logica: indienen kan tot en met de 10e van de volgende maand.
  // Vanaf de 11e van de volgende maand is de declaratie HARD gelockt (user-eis
  // 2026-05-26: "te laat is te laat, geen ontgrendeling"). De client checkt de
  // deadline en blokkeert; server-side wordt status pas op "locked" gezet wanneer
  // submit-attempts buiten window komen.
  // ---------------------------------------------------------------------------
  function getDeadlineFor(year, month) {
    var y = Number(year), m = Number(month);
    if (!isFinite(y) || !isFinite(m)) return null;
    // 10e van volgende maand, 23:59:59 lokaal
    var nextMonth = m === 12 ? 1 : m + 1;
    var nextYear = m === 12 ? y + 1 : y;
    return new Date(nextYear, nextMonth - 1, 10, 23, 59, 59);
  }
  function isDeadlinePassed(year, month, now) {
    var dl = getDeadlineFor(year, month);
    if (!dl) return false;
    return (now || new Date()) > dl;
  }
  function isSubmittable(decl, now) {
    if (!decl) return false;
    if (decl.status === "submitted" || decl.status === "locked") return false;
    if (isDeadlinePassed(decl.jaar, decl.maand, now)) return false;
    return true;
  }

  async function submitDecl(declId) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (declId == null) throw new Error("declaratie-id vereist");
    var d = getByIdSync(declId);
    if (!d) throw new Error("Declaratie niet gevonden");
    if (!isSubmittable(d)) {
      var dl = getDeadlineFor(d.jaar, d.maand);
      if (dl && new Date() > dl) {
        throw new Error("Deadline verstreken (10e van " + (d.maand === 12 ? "januari" : ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"][d.maand]) + " " + (d.maand === 12 ? d.jaar + 1 : d.jaar) + "). Te laat is te laat.");
      }
      throw new Error("Declaratie kan niet meer ingediend worden (status: " + d.status + ").");
    }
    var nowIso = new Date().toISOString();
    var submissionStatus = {
      status: "submitted",
      message: "Ingediend",
      color: "green",
      icon: "checkmark",
    };
    var res = await global.besaSupabase.from(T_DECL).update({
      status: "submitted",
      submitted_at: nowIso,
      submission_status: submissionStatus,
      is_editable: false,
      can_be_submitted: false,
      laatst_gewijzigd: nowIso,
    }).eq("id", declId).select().single();
    if (res.error) throw res.error;
    // Update in-memory
    var arr = declList();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === String(declId)) {
        arr[i] = Object.assign({}, arr[i], {
          status: "submitted",
          submittedAt: nowIso,
          submissionStatus: submissionStatus,
          isEditable: false,
          canBeSubmitted: false,
        });
        break;
      }
    }
    setDecl(arr);
    dispatchUpdated("submitDecl");
    return arr.find(function (x) { return String(x.id) === String(declId); });
  }

  /**
   * Maak (of fetch) een DRAFT-declaratie voor medewerker × jaar × maand.
   * Wordt gebruikt door de dag-aanvink-UI: als een medewerker voor een maand
   * nog geen declaratie heeft, maakt deze functie er een aan zodat records
   * kunnen worden toegevoegd. Idempotent: bestaande declaratie wordt
   * teruggegeven.
   */
  async function ensureDraftFor(medewerkerId, year, month) {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    if (!medewerkerId) throw new Error("medewerker-id vereist");
    var y = Number(year), m = Number(month);
    if (!isFinite(y) || !isFinite(m)) throw new Error("Ongeldige periode");
    // Check eerst lokaal
    var existing = declList().find(function (d) {
      return d && String(d.medewerkerId) === String(medewerkerId)
        && Number(d.jaar) === y && Number(d.maand) === m;
    });
    if (existing) return existing;
    // Anders: query Supabase voor het geval cache stale is
    var q = await global.besaSupabase.from(T_DECL).select("*")
      .eq("medewerker_id", medewerkerId).eq("jaar", y).eq("maand", m).maybeSingle();
    if (q.error) throw q.error;
    if (q.data) {
      var obj = declRowToObj(q.data);
      var arr = declList(); arr.push(obj); setDecl(arr);
      return obj;
    }
    // Maak nieuwe draft aan
    function genDeclId() {
      try {
        if (global.crypto && typeof global.crypto.randomUUID === "function") return "kmd-" + global.crypto.randomUUID();
      } catch (e) { /* */ }
      return "kmd-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10);
    }
    var nowIso = new Date().toISOString();
    var deadlinePassed = isDeadlinePassed(y, m);
    var row = {
      id: genDeclId(),
      medewerker_id: medewerkerId,
      jaar: y,
      maand: m,
      status: "draft",
      total_kilometers: 0,
      total_reimbursement: 0,
      is_editable: !deadlinePassed,
      can_be_submitted: !deadlinePassed,
      is_deadline_passed: deadlinePassed,
      submission_status: {
        status: "draft",
        message: deadlinePassed ? "Vergrendeld (deadline verstreken)" : "Nog niet ingediend",
        color: deadlinePassed ? "red" : "yellow",
        icon: deadlinePassed ? "lock" : "warning",
      },
      data: {},
      aanmaakdatum: nowIso,
      laatst_gewijzigd: nowIso,
    };
    var res = await global.besaSupabase.from(T_DECL).insert(row).select().single();
    if (res.error) throw res.error;
    var obj2 = declRowToObj(res.data);
    var arr2 = declList(); arr2.push(obj2); setDecl(arr2);
    dispatchUpdated("ensureDraftFor");
    return obj2;
  }

  global.kilometerDeclaratiesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForMedewerkerSync: getForMedewerkerSync,
    getRecordsForDeclaratieSync: getRecordsForDeclaratieSync,
    getRawBs2: getRawBs2,
    computeTotals: computeTotals,
    addRecord: addRecord,
    updateRecord: updateRecord,
    deleteRecord: deleteRecord,
    setApproval: setApproval,
    // Submit-flow + deadline (Fase 1)
    submitDecl: submitDecl,
    ensureDraftFor: ensureDraftFor,
    getDeadlineFor: getDeadlineFor,
    isDeadlinePassed: isDeadlinePassed,
    isSubmittable: isSubmittable,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
