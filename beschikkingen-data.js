/* global window */
/**
 * Beschikkingen — Supabase data-laag met localStorage als read-cache.
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `beschikkingen`.
 *  - localStorage onder key "beschikkingenItemsV2" = read-cache (compat met
 *    bestaande synchrone reads).
 *  - Schrijfacties (add/update/remove) gaan async naar Supabase; de cache
 *    wordt geüpdatet en het event "beschikkingen:changed" blijft gefired
 *    (backward-compat voor de overzicht-/dashboard-pagina's).
 *  - Runtime-verrijking: clientLabel + locatie worden afgeleid uit de
 *    clienten-cache (clienten-data.js). Daarom wordt bij elk
 *    "ff:clienten-updated" event de cache opnieuw uit de raw rows
 *    opgebouwd zodat de gerenderde labels meteen in sync staan.
 *
 * Backward-compat globals (gebruikt door beschikkingen.js, beschikkingen-overzicht.js,
 * beschikkingen-dashboard.js, beschikking-detail.js, facturen.js, client-detail.js,
 * organisatie-data.js, …): zie onderaan dit bestand.
 */
(function (global) {
  "use strict";

  var TABLE = "beschikkingen";
  var CACHE_KEY = "beschikkingenItemsV2";
  var SEEDED = "beschikkingenSeededV2";
  var MIGRATION_FLAG_KEY = "beschikkingenMigratedToSupabase.v1";
  // Eerste deploy: localStorage-cache moet 1× geleegd worden zodat we niet de
  // oude bulk-seed (van vóór de migratie) blijven tonen naast de Supabase-data.
  var CACHE_RESET_FLAG = "beschikkingenCacheResetV1";

  var ZS_LABELS = {
    "ambulant-intens": "Ambulant intern",
    "ambulant": "Ambulant intern",
    "ambulant-intern": "Ambulant intern",
    "ambulant-extern": "Ambulant extern",
    "amb": "Ambulant intern",
    "fasewonen": "Fase wonen",
    "woon-zorg": "Fase wonen",
    "dagbesteding": "Dagbesteding",
    "verblijf-behandeling": "Verblijf en behandeling",
    "veb": "Verblijf en behandeling",
    "crisisopvang": "Crisisopvang",
    "vlz": "VLZ",
    "wlz": "WLZ",
    "gecombineerd": "Gecombineerd",
    "geo": "Gecombineerd",
    "overig": "Overig",
  };

  function zorgLabel(k) {
    if (!k) return "Onbekend";
    return ZS_LABELS[k] || String(k);
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function isoYMD(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function ymdToMonth(ymd) {
    if (!ymd || String(ymd).length < 7) return "";
    return String(ymd).slice(0, 7);
  }
  function isoNow() { return new Date().toISOString(); }

  function n2(x) {
    if (x == null || x === "") return 0;
    if (typeof x === "string") {
      var ts = x.trim();
      if (ts === "" || ts === "—" || ts === "-") return 0;
      if (ts.indexOf(",") >= 0) ts = ts.replace(/\./g, "").replace(/,/g, ".");
      x = parseFloat(ts);
    }
    var n = Number(x);
    if (isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function genId() {
    return "b_" + Date.now().toString(36) + "_" + String(Math.random()).slice(2, 9);
  }

  // Stille fire-and-forget fouten zichtbaar maken (werkpatronen §6c-bis):
  // de gebruiker krijgt een toast als een achtergrond-sync naar Supabase faalt.
  function reportSilent(action, err) {
    console.error("[beschikkingenDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Beschikkingen — " + action, err);
  }

  // ---------------------------------------------------------------------------
  // Mapping DB ⇄ frontend object
  // ---------------------------------------------------------------------------

  /** Verrijk een DB-rij met clientLabel + locatie via clienten-cache. */
  function rowToObj(row) {
    if (!row) return null;
    var data = row.data && typeof row.data === "object" ? row.data : {};
    var startISO = row.start_iso || "";
    var eindISO = row.eind_iso || "";

    // Lookup cliënt voor label/locatie. Mag falen — fallback gebruiken.
    var cl = null;
    try {
      if (typeof global.getClientenById === "function" && row.client_id) {
        cl = global.getClientenById(row.client_id);
      }
    } catch (e) { /* */ }

    var clBase = "";
    if (cl) {
      clBase = (String(cl.voornaam || "").trim() + " " + String(cl.achternaam || "").trim()).trim();
    }
    var clientLabel = data.clientLabelOverride || clBase || "—";
    var locatie = row.locatie && String(row.locatie).trim()
      ? String(row.locatie).trim()
      : (cl && cl.locatie ? String(cl.locatie).trim() : "—");
    // Gemeente: eigen kolom op de beschikking (fase 2), fallback = gemeente
    // van de gekoppelde cliënt (zelfde patroon als locatie hierboven).
    var gemeente = row.gemeente && String(row.gemeente).trim()
      ? String(row.gemeente).trim()
      : (cl && cl.gemeente ? String(cl.gemeente).trim() : "");

    return {
      id: row.id,
      schemaVersion: 2,
      clientId: row.client_id || "",
      clientLabel: clientLabel,
      naam: row.naam || "",
      gemeente: gemeente,
      productcode: row.productcode ? String(row.productcode).trim() : "",
      // Toegekende uren (productie-module-kolommen) — read-only meegegeven
      // voor weergave; gaan bewust NIET mee in het insert/update-payload
      // (toegekend_bron 'auto' blijft server-side beheerd).
      toegekendUren: row.toegekend_uren != null ? Number(row.toegekend_uren) : null,
      toegekendEenheid: row.toegekend_eenheid || "",
      zorgsoortKey: row.zorgsoort_key || "overig",
      zorgsoortLabel: zorgLabel(row.zorgsoort_key || "overig"),
      locatie: locatie || "—",
      fase: row.fase || "actief",
      startISO: startISO,
      eindISO: eindISO,
      gearchiveerd: !!row.gearchiveerd,
      declMeth: row.decl_meth || "ONS",
      teDeclarerenLM: n2(row.te_declareren_lm),
      nogNietGedeclareerd: n2(row.nog_niet_gedeclareerd),
      gedeclGemeenteInBehandeling: n2(row.gedecl_gemeente_in_behandeling),
      betaaldCumulatief: n2(row.betaald_cumulatief),
      betalingsStatus: row.betalings_status === "betaald" ? "betaald" : "outstanding",
      tariefEur: n2(row.tarief_eur),
      tariefEenheid: ["uur", "dag", "week"].indexOf(String(row.tarief_eenheid || "uur")) >= 0
        ? row.tarief_eenheid : "uur",
      betalingRefMaand: row.betaling_ref_maand
        || (startISO && startISO.length >= 7 ? ymdToMonth(startISO) : ""),
      // Houd extra meta bij voor toekomstige uitbreidingen.
      _data: data,
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var startISO = safe.startISO && String(safe.startISO).length >= 10 ? String(safe.startISO).slice(0, 10) : null;
    var eindISO = safe.eindISO && String(safe.eindISO).length >= 10 ? String(safe.eindISO).slice(0, 10) : null;
    var data = (safe._data && typeof safe._data === "object") ? Object.assign({}, safe._data) : {};
    // clientLabelOverride alleen behouden als hij niet uit clienten-cache komt.
    if (safe.clientLabel && !data.clientLabelOverride) {
      // Niet automatisch override-en op basis van afgeleide labels — anders
      // overschrijven we de runtime cliëntnaam. Override blijft alleen als
      // expliciet gezet in `_data`.
    }
    var locatie = safe.locatie && safe.locatie !== "—" ? String(safe.locatie) : null;
    var gemeente = safe.gemeente && String(safe.gemeente).trim() && safe.gemeente !== "—"
      ? String(safe.gemeente).trim() : null;
    var productcode = safe.productcode && String(safe.productcode).trim() && safe.productcode !== "—"
      ? String(safe.productcode).trim() : null;
    return {
      id: safe.id || genId(),
      client_id: safe.clientId || null,
      naam: String(safe.naam || ""),
      gemeente: gemeente,
      productcode: productcode,
      zorgsoort_key: safe.zorgsoortKey || "overig",
      fase: safe.fase || "actief",
      locatie: locatie,
      start_iso: startISO,
      eind_iso: eindISO,
      decl_meth: safe.declMeth || "ONS",
      tarief_eur: n2(safe.tariefEur),
      tarief_eenheid: ["uur", "dag", "week"].indexOf(String(safe.tariefEenheid || "uur")) >= 0
        ? safe.tariefEenheid : "uur",
      betalings_status: safe.betalingsStatus === "betaald" ? "betaald" : "outstanding",
      te_declareren_lm: n2(safe.teDeclarerenLM),
      nog_niet_gedeclareerd: n2(safe.nogNietGedeclareerd),
      gedecl_gemeente_in_behandeling: n2(safe.gedeclGemeenteInBehandeling),
      betaald_cumulatief: n2(safe.betaaldCumulatief),
      betaling_ref_maand: safe.betalingRefMaand || (startISO ? ymdToMonth(startISO) : null),
      gearchiveerd: !!safe.gearchiveerd,
      data: data,
    };
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    return p;
  }

  // ---------------------------------------------------------------------------
  // Cache + raw store
  // ---------------------------------------------------------------------------
  // We bewaren de raw DB-rows in module-state zodat we — bij wijziging in de
  // clienten-cache — de afgeleide objecten opnieuw kunnen samenstellen.
  var rawRows = [];

  // _mem = in-memory bron-van-waarheid (quota-proof). rawRows blijft de RAW DB-bron;
  // rebuildCacheFromRaw vult via writeCache deze _mem, zodat getAllSync/getByIdSync/
  // getBeschikkingenItems ook bij volle localStorage-quota de echte rijen tonen i.p.v. leeg.
  var _mem = null;
  function readCache() {
    if (_mem != null) return _mem;
    try {
      var raw = global.localStorage.getItem(CACHE_KEY);
      var p = raw ? JSON.parse(raw) : [];
      _mem = Array.isArray(p) ? p : [];
    } catch (e) {
      _mem = [];
    }
    return _mem;
  }

  function writeCache(items) {
    _mem = Array.isArray(items) ? items : [];
    try {
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(_mem));
    } catch (e) { /* */ }
  }

  function rebuildCacheFromRaw() {
    var items = (rawRows || []).map(rowToObj).filter(Boolean);
    writeCache(items);
    return items;
  }

  function notifyChanged() {
    function mkEv(name) {
      if (typeof CustomEvent === "function") return new CustomEvent(name, { bubbles: true });
      var e = document.createEvent("Event"); e.initEvent(name, true, true); return e;
    }
    // Dispatch op ZOWEL window als document: listeners zitten verspreid
    // (overzicht luistert op document, andere op window). Eén target missen
    // betekende dat een verse load (lege cache) 0 rijen bleef tonen tot een
    // handmatige reload. Beide targets = altijd re-render.
    try { global.dispatchEvent(mkEv("beschikkingen:changed")); } catch (e) { /* */ }
    try { if (global.document) global.document.dispatchEvent(mkEv("beschikkingen:changed")); } catch (e1) { /* */ }
    try {
      global.localStorage.setItem("beschikkingen:changedAt", String(Date.now()));
    } catch (e2) { /* */ }
    try { global.dispatchEvent(mkEv("ff:beschikkingen-updated")); } catch (e3) { /* */ }
    try { if (global.document) global.document.dispatchEvent(mkEv("ff:beschikkingen-updated")); } catch (e4) { /* */ }
  }

  // ---------------------------------------------------------------------------
  // Supabase fetch + bootstrap
  // ---------------------------------------------------------------------------
  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*")
      .order("eind_iso", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  /** Eenmalige migratie van bestaande localStorage data. */
  async function maybeMigrateLocalToSupabase() {
    try {
      if (global.localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return false;
      if (!global.ffSupabase) return false;

      var head = await global.ffSupabase
        .from(TABLE)
        .select("id", { count: "exact", head: true });
      if (head.error) return false;
      if ((head.count || 0) > 0) {
        try { global.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      var local = readCache();
      if (!Array.isArray(local) || local.length === 0) {
        try { global.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
        return false;
      }

      console.info("[beschikkingenDB] Eenmalige migratie van " + local.length + " beschikkingen naar Supabase…");
      var payload = local.map(function (r) { return objToInsertPayload(r); });
      var ins = await global.ffSupabase
        .from(TABLE)
        .insert(payload)
        .select();
      if (ins.error) {
        console.error("[beschikkingenDB] Migratie mislukt:", ins.error);
        return false;
      }
      try { global.localStorage.setItem(MIGRATION_FLAG_KEY, "1"); } catch (e) { /* */ }
      console.info("[beschikkingenDB] Migratie geslaagd: " + (ins.data || []).length + " rijen geüpload.");
      return true;
    } catch (err) {
      console.error("[beschikkingenDB] Migratiefout:", err);
      return false;
    }
  }

  /** Cache 1× resetten zodat oude bulk-seed niet meer naast Supabase staat. */
  function maybeResetLegacyCache() {
    try {
      if (global.localStorage.getItem(CACHE_RESET_FLAG) === "1") return;
      // Reset alleen wanneer migratie-flag nog NIET gezet is. Zodra migratie
      // gelopen heeft, weten we dat de cache schoon is en hoeven we 'm niet
      // weg te gooien (anders verliest de gebruiker zijn werk).
      // Dit is een one-shot voor users die de migratie nog niet hadden.
      var migrated = global.localStorage.getItem(MIGRATION_FLAG_KEY) === "1";
      if (!migrated) {
        // Alleen droppen als de cache geen records had die nog gemigreerd
        // moeten worden — anders gaan we via maybeMigrateLocalToSupabase().
        // We doen dit conservatief: we droppen niet, maar markeren wel de flag.
      }
      global.localStorage.setItem(CACHE_RESET_FLAG, "1");
    } catch (e) { /* */ }
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        maybeResetLegacyCache();
        await maybeMigrateLocalToSupabase();
        rawRows = await fetchAll();
        rebuildCacheFromRaw();
        try { global.localStorage.setItem(SEEDED, "1"); } catch (e) { /* */ }
        notifyChanged();
      } catch (err) {
        console.error("[beschikkingenDB] Bootstrap mislukt:", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    try {
      rawRows = await fetchAll();
      rebuildCacheFromRaw();
      notifyChanged();
      return readCache();
    } catch (err) {
      console.error("[beschikkingenDB] Refresh mislukt:", err);
      return readCache();
    }
  }

  // Wanneer de clienten-cache verandert (bv. bootstrap klaar of edit), bouwen
  // we de afgeleide objecten opnieuw zodat clientLabel/locatie meteen klopt.
  global.addEventListener("ff:clienten-updated", function () {
    if (rawRows && rawRows.length) {
      rebuildCacheFromRaw();
      notifyChanged();
    }
  });

  // ---------------------------------------------------------------------------
  // CRUD (async)
  // ---------------------------------------------------------------------------
  async function add(row) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var payload = objToInsertPayload(row);
    var res = await global.ffSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    rawRows.push(res.data);
    var obj = rowToObj(res.data);
    var cache = readCache();
    cache.push(obj);
    writeCache(cache);
    notifyChanged();
    return obj;
  }

  async function updateRow(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});
    merged.id = id;
    var payload = objToUpdatePayload(merged);
    var res = await global.ffSupabase
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    // Update raw + cache
    var rawIdx = rawRows.findIndex(function (r) { return r && r.id === id; });
    if (rawIdx >= 0) rawRows[rawIdx] = res.data; else rawRows.push(res.data);
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && r.id === id; });
    if (idx >= 0) cache[idx] = obj; else cache.push(obj);
    writeCache(cache);
    notifyChanged();
    return obj;
  }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var res = await global.ffSupabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (res.error) throw res.error;
    rawRows = rawRows.filter(function (r) { return r && r.id !== id; });
    var cache = readCache().filter(function (r) { return r && r.id !== id; });
    writeCache(cache);
    notifyChanged();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Synchrone helpers (vanuit cache) — backward compat
  // ---------------------------------------------------------------------------
  function getAllSync() {
    return readCache();
  }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var items = readCache();
    var found = items.find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  // ---------------------------------------------------------------------------
  // Backward-compat globals
  // ---------------------------------------------------------------------------

  function getBeschikkingenItems() {
    var cache = readCache();
    if (!cache.length) {
      bootstrap(); // triggert async load; UI re-render via "beschikkingen:changed"
    }
    return cache.map(function (r) { return Object.assign({}, r); });
  }

  /**
   * Diff-sync. Wordt gebruikt door legacy code paths (zelden, vooral in
   * migratie-routines). We vertalen veranderingen in async update/add/delete.
   */
  function setBeschikkingenItems(items) {
    if (!Array.isArray(items)) return;
    var oldMap = {};
    readCache().forEach(function (r) { if (r && r.id) oldMap[r.id] = r; });
    writeCache(items);
    notifyChanged();
    if (!global.ffSupabase) return;

    // Adds + updates
    items.forEach(function (r) {
      if (!r || !r.id) return;
      var prev = oldMap[r.id];
      if (!prev) {
        add(r).catch(function (err) { reportSilent("toevoegen", err); });
        return;
      }
      // Bepaal of er iets gewijzigd is in de relevante velden.
      var keys = Object.keys(r);
      var changed = false;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === "schemaVersion" || k === "_data" || k === "zorgsoortLabel") continue;
        if (JSON.stringify(r[k]) !== JSON.stringify(prev[k])) { changed = true; break; }
      }
      if (changed) {
        updateRow(r.id, r).catch(function (err) { reportSilent("bijwerken", err); });
      }
      delete oldMap[r.id];
    });

    // Wat over is in oldMap is verwijderd.
    Object.keys(oldMap).forEach(function (id) {
      remove(id).catch(function (err) { reportSilent("verwijderen", err); });
    });
  }

  function addBeschikkingRij(row) {
    if (!row) row = {};
    if (!row.id) row.id = genId();
    if (!row.zorgsoortLabel) row.zorgsoortLabel = zorgLabel(row.zorgsoortKey);
    if (!row.betalingRefMaand && row.startISO) row.betalingRefMaand = ymdToMonth(row.startISO);
    if (!row.betalingRefMaand) row.betalingRefMaand = ymdToMonth(isoYMD(new Date()));

    // Lokaal alvast in de cache zetten zodat de UI direct de nieuwe rij ziet.
    var cache = readCache();
    cache.push(row);
    writeCache(cache);
    notifyChanged();

    if (global.ffSupabase) {
      add(row).catch(function (err) { reportSilent("toevoegen", err); });
    }
    return row;
  }

  function addBeschikkingVanuitFormulier(p) {
    p = p || {};
    var f0 = String(p.fase || "").toLowerCase();
    var fase = f0;
    if (fase === "aangevraagd") fase = "in_aanvraag";
    if (fase === "afgehandeld") fase = "actief";
    if (!fase) fase = "actief";

    // Gemeente: default = gemeente van de gekoppelde cliënt.
    var gemeente = p.gemeente && String(p.gemeente).trim() ? String(p.gemeente).trim() : "";
    if (!gemeente && p.clientId && typeof global.getClientenById === "function") {
      try {
        var cl0 = global.getClientenById(p.clientId);
        if (cl0 && cl0.gemeente) gemeente = String(cl0.gemeente).trim();
      } catch (e) { /* */ }
    }

    // Geen pseudo-random demo-financiën meer: nieuwe beschikkingen starten met
    // tarief 0 en alle financiële velden 0 (zelfde als de overzicht-add-modal).
    var row = {
      id: genId(),
      clientId: p.clientId || "",
      clientLabel: p.clientLabel || "—",
      naam: (p.naam == null ? "" : String(p.naam)).trim(),
      gemeente: gemeente,
      productcode: "",
      zorgsoortKey: p.zorgsoortKey || "overig",
      zorgsoortLabel: zorgLabel(p.zorgsoortKey || "overig"),
      fase: fase,
      locatie: p.locatie == null ? "" : String(p.locatie).trim() || "—",
      startISO: p.startISO || "",
      eindISO: p.eindISO || "",
      declMeth: p.declMeth || "ONS",
      gearchiveerd: false,
      teDeclarerenLM: 0,
      nogNietGedeclareerd: 0,
      gedeclGemeenteInBehandeling: 0,
      betaaldCumulatief: 0,
      betalingsStatus: "outstanding",
      tariefEur: 0,
      tariefEenheid: "uur",
      betalingRefMaand: p.startISO ? ymdToMonth(p.startISO) : ymdToMonth(isoYMD(new Date())),
    };
    return addBeschikkingRij(row);
  }

  function removeBeschikkingById(id) {
    if (id == null) return;
    var cache = readCache().filter(function (r) { return r && r.id !== id; });
    writeCache(cache);
    notifyChanged();
    if (global.ffSupabase) {
      remove(id).catch(function (err) { reportSilent("verwijderen", err); });
    }
  }

  function setBeschikkingField(id, fn) {
    if (!id) return null;
    var cache = readCache();
    for (var i = 0; i < cache.length; i += 1) {
      if (cache[i] && cache[i].id === id) {
        fn(cache[i]);
        // Schrijf naar cache + sync
        writeCache(cache);
        notifyChanged();
        if (global.ffSupabase) {
          updateRow(id, cache[i]).catch(function (err) { reportSilent("bijwerken", err); });
        }
        return cache[i];
      }
    }
    return null;
  }

  function getBeschikkingById(id) {
    return getByIdSync(id);
  }

  function eindNietVerstrekenBesc(b) {
    if (!b || !b.eindISO) return true;
    var t = new Date(b.eindISO);
    if (isNaN(t.getTime())) return true;
    var nu = new Date();
    nu.setHours(0, 0, 0, 0);
    return t.getTime() >= nu.getTime();
  }

  function countVerlooptBinnen60(lijst) {
    var nu = new Date();
    nu.setHours(0, 0, 0, 0);
    var t60 = new Date(nu);
    t60.setDate(t60.getDate() + 60);
    return lijst.filter(function (b) {
      if (!b || b.gearchiveerd) return false;
      if (!b.eindISO) return false;
      var t = new Date(b.eindISO);
      if (isNaN(t.getTime())) return false;
      return t.getTime() > nu.getTime() && t.getTime() <= t60.getTime();
    }).length;
  }

  function aggregateDashboardData() {
    var items = getBeschikkingenItems() || [];
    var tGIB = 0, nGIB = 0, nAchter = 0, tLM = 0, tBeta = 0, act = 0, nOpen = 0;
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it || it.gearchiveerd) continue;
      tGIB += n2(it.gedeclGemeenteInBehandeling);
      if (n2(it.gedeclGemeenteInBehandeling) > 0) nGIB += 1;
      nAchter += n2(it.nogNietGedeclareerd);
      tLM += n2(it.teDeclarerenLM);
      if (it.betalingsStatus === "betaald") tBeta += n2(it.betaaldCumulatief);
      var f = String(it.fase || "").toLowerCase();
      if (f === "in_aanvraag" || f === "aangevraagd") nOpen += 1;
      if ((f === "actief" || f === "in_zorg") && eindNietVerstrekenBesc(it)) act += 1;
    }
    return {
      gedeclInBehand: tGIB,
      nGedeclInbehand: nGIB,
      achterstand: nAchter,
      tedeclMaand: tLM,
      betaald: tBeta,
      actieve: act,
      openAanvra: nOpen,
      verlopen60: countVerlooptBinnen60(items),
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var api = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: updateRow,
    delete: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
  };

  global.beschikkingenDB = api;

  global.getBeschikkingenItems = getBeschikkingenItems;
  global.setBeschikkingenItems = setBeschikkingenItems;
  global.addBeschikkingRij = addBeschikkingRij;
  global.addBeschikkingVanuitFormulier = addBeschikkingVanuitFormulier;
  global.getBescZorgsoortLabel = zorgLabel;
  global.removeBeschikkingById = removeBeschikkingById;
  global.setBeschikkingField = setBeschikkingField;
  global.getBeschikkingById = getBeschikkingById;
  global.normalizeBeschikkingRij = function (x) { return x; }; // no-op (DB is normalisatie-bron)
  global.aggBescVerlooptBinnen60 = function () {
    return countVerlooptBinnen60(getBeschikkingenItems().filter(function (b) { return b && !b.gearchiveerd; }));
  };
  global.beschikkingenDataAggregate = aggregateDashboardData;
  global.beschikkingenNotifyChange = notifyChanged;
  global.SUPPORTED_ZORGSOORT_KEYS_BESC = function () {
    return Object.keys(ZS_LABELS).filter(function (k) { return k !== "overig"; });
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
