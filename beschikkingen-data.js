/* global getClientenItems */
/**
 * Eén bron voor Beschikkingen-overzicht + dashboard (localStorage V2).
 * Wijzigingen lopen via setBeschikkingenItems / addBeschikking* — daarna 'beschikkingen:changed'.
 */
(function (global) {
  "use strict";

  var KEY = "beschikkingenItemsV2";
  var KEY_V1 = "beschikkingenItemsV1";
  var SEEDED = "beschikkingenSeededV2";
  /** Eenmalige correctie: oude plakholdernaam "Beschikking" vervangen door referentie-uit screenshot */
  var NAAM_SCREENFIX_FLAG = "beschikkingenNaamScreenfixV2";
  /** Legacy: 99-rij snapshot (BESA_RIGI99) */
  var RIGI99_FLAG = "BESC_RIGI99_V3";
  /** Opvolger: 100+ rijen uit BESA_BESC (pipe → beschikkingen-besc-bulk.js) @see BESC_BULK_DATA_VER */
  var BESC_BULK_DATA_VER_ST = "BESC_BULK_DATA_VER_ST";

  /**
   * "Naam"-waarden overgenomen uit de RIGI-/Beschikkingen-screens (kolom Naam, niet zorgsoort).
   * Geen generieke "Beschikking" + cijfer — uitsluitend onderstaande of door gebruiker ingetypt.
   */
  var BESC_NAMEN_REFERENTIE = [
    "Gecombineerd",
    "gecombineerd",
    "Verblijf en behandeling",
    "verblijf en behandeling",
    "verblijf",
    "Ambulant",
    "ambulant",
    "ambulant 10 u / dag",
    "WLZ",
    "WLZ 7.5 u / week",
    "WLZ 14 u week",
    "fasewonen",
    "Fasewonen",
  ];

  var ZS_LABELS = {
    "ambulant-intens": "Ambulant intern",
    ambulant: "Ambulant intern",
    "ambulant-intern": "Ambulant intern",
    "ambulant-extern": "Ambulant extern",
    fasewonen: "Fase wonen",
    "woon-zorg": "Fase wonen",
    dagbesteding: "Dagbesteding",
    "verblijf-behandeling": "Verblijf en behandeling",
    vlz: "VLZ",
    wlz: "WLZ",
    gecombineerd: "Gecombineerd",
    overig: "Overig",
  };

  function zorgLabel(k) {
    if (!k) return "Onbekend";
    return ZS_LABELS[k] || String(k);
  }

  function simpleHash(s) {
    s = String(s == null ? "" : s);
    var h = 0;
    for (var i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function isoYMD(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function ymdToMonth(ymd) {
    if (!ymd || String(ymd).length < 7) return "";
    return String(ymd).slice(0, 7);
  }

  function readKey(k) {
    try {
      var raw = global.localStorage.getItem(k);
      if (!raw) return null;
      var a = JSON.parse(raw);
      return Array.isArray(a) ? a : null;
    } catch (e) {
      return null;
    }
  }

  function read() {
    return readKey(KEY);
  }

  function readV1() {
    return readKey(KEY_V1);
  }

  function writeRaw(list) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) { /* */ }
  }

  function genId() {
    return "b_" + Date.now().toString(36) + "_" + String(Math.random()).slice(2, 9);
  }

  function n2(x) {
    if (x == null || x === "") return 0;
    if (typeof x === "string") {
      var ts = x.trim();
      if (ts === "" || ts === "—" || ts === "-") return 0;
      if (ts.indexOf(",") >= 0) ts = ts.replace(/\./g, "").replace(/,/g, ".");
      x = parseFloat(ts, 10);
    }
    var n = Number(x);
    if (isNaN(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function notifyBeschikkingenChanged() {
    try {
      var ev;
      if (typeof CustomEvent === "function") {
        ev = new CustomEvent("beschikkingen:changed", { bubbles: true });
      } else {
        ev = document.createEvent("Event");
        ev.initEvent("beschikkingen:changed", true, true);
      }
      global.dispatchEvent(ev);
    } catch (e) { /* */ }
    try {
      global.localStorage.setItem("beschikkingen:changedAt", String(Date.now()));
    } catch (e2) { /* */ }
  }

  function bedragUitId(id) {
    var b = 800 + (simpleHash("€" + id) % 420000) / 100;
    return Math.round(b * 100) / 100;
  }

  function isPlatshouderNaam(n) {
    if (n == null) return true;
    var s = String(n).trim();
    if (s === "") return true;
    if (/^beschikking(\s+[\d.,\s]+)?$/i.test(s)) return true;
    return false;
  }

  function kiesNaamUitReferentie(id, clientId, salt) {
    var h = simpleHash(String(id) + "|" + String(clientId) + "|naam|" + String(salt == null ? 0 : salt));
    var L = BESC_NAMEN_REFERENTIE.length;
    if (L < 1) return "Gecombineerd";
    return BESC_NAMEN_REFERENTIE[h % L];
  }

  function applyNaamScreenfixIfNeeded() {
    try {
      if (global.localStorage.getItem(NAAM_SCREENFIX_FLAG) === "1") return;
      var v2 = read();
      if (!v2 || !v2.length) {
        return;
      }
      var wijzig = false;
      var v = [];
      for (var t = 0; t < v2.length; t += 1) {
        var r0 = v2[t];
        if (!r0) { v.push(r0); continue; }
        if (!isPlatshouderNaam(r0.naam)) {
          v.push(r0);
          continue;
        }
        wijzig = true;
        var c = Object.assign({}, r0);
        c.naam = kiesNaamUitReferentie(c.id, c.clientId, t);
        v.push(c);
      }
      if (wijzig) {
        setBeschikkingenItemsRaw(
          v.map(function (x) { return normalizeRow(x); }),
          true
        );
        try {
          global.localStorage.setItem(NAAM_SCREENFIX_FLAG, "1");
        } catch (e3) { /* */ }
        return;
      }
      try {
        global.localStorage.setItem(NAAM_SCREENFIX_FLAG, "1");
      } catch (e4) { /* */ }
    } catch (e) { /* */ }
  }

  function migrateV1Rij(r) {
    if (!r || r.schemaVersion === 2) return normalizeRow(r);
    var st = String(r.status || "");
    var fase = (r.fase || "actief").toLowerCase();
    if (fase === "aangevraagd" || fase === "aangevraag") fase = "in_aanvraag";
    if (st === "open_aanvraag") fase = "in_aanvraag";
    var bedr = n2(r.bedrag);
    var bPay = (st === "betaald" ? "betaald" : "outstanding");
    var naMig = r.naam;
    if (isPlatshouderNaam(naMig)) {
      naMig = kiesNaamUitReferentie(r.id, r.clientId, 0);
    }
    return normalizeRow({
      id: r.id,
      clientId: r.clientId,
      clientLabel: r.clientLabel,
      naam: naMig,
      zorgsoortKey: r.zorgsoortKey,
      zorgsoortLabel: r.zorgsoortLabel,
      locatie: r.locatie,
      fase: fase,
      startISO: r.startISO,
      eindISO: r.eindISO,
      gearchiveerd: !!r.gearchiveerd,
      declMeth: r.declMeth || "ONS",
      teDeclarerenLM: st === "te_declareren" ? bedr : 0,
      nogNietGedeclareerd: st === "achterstand" ? bedr : n2((st !== "open_aanvraag" && st !== "betaald" ? bedr * 0.3 : 0) + 0.01 * simpleHash("n" + r.id)),
      gedeclGemeenteInBehandeling: st === "in_behandeling" ? bedr : 0,
      betaaldCumulatief: st === "betaald" ? bedr : 0,
      betalingsStatus: bPay,
      tariefEur: 80 + (simpleHash("f" + r.id) % 20000) / 100,
      tariefEenheid: (simpleHash("u" + r.id) % 3 === 0 ? "week" : (simpleHash("u" + r.id) % 2 ? "uur" : "dag")),
      betalingRefMaand: r.betalingMaand || (r.startISO ? ymdToMonth(r.startISO) : ymdToMonth(isoYMD(new Date()))),
    });
  }

  function normalizeRow(x) {
    if (!x || typeof x !== "object") return x;
    var f = String(x.fase || "actief").toLowerCase().replace(/\s+/g, "_");
    if (f === "aangevraagd") f = "in_aanvraag";
    if (f === "in_zorg" || f === "inzorg") f = "in_zorg";
    if (f === "uit_zorg" || f === "uitzorg") f = "uit_zorg";
    if (f === "in_dienst" || f === "indienst") f = "in_dienst";
    if (f === "uit_dienst" || f === "uitdienst") f = "uit_dienst";
    var faseNorm = "actief";
    if (f === "in_aanvraag") faseNorm = "in_aanvraag";
    else if (f === "verlopen" || f === "afgehandeld") faseNorm = f;
    else if (f === "in_zorg") faseNorm = "in_zorg";
    else if (f === "uit_zorg") faseNorm = "uit_zorg";
    else if (f === "in_dienst") faseNorm = "in_dienst";
    else if (f === "uit_dienst") faseNorm = "uit_dienst";
    var bStat = (x.betalingsStatus || "").toLowerCase() === "betaald" ? "betaald" : "outstanding";
    var o = {
      id: x.id || genId(),
      schemaVersion: 2,
      clientId: x.clientId,
      clientLabel: x.clientLabel == null ? "" : String(x.clientLabel),
      naam: x.naam == null ? "" : String(x.naam),
      zorgsoortKey: x.zorgsoortKey || "overig",
      zorgsoortLabel: x.zorgsoortLabel || zorgLabel(x.zorgsoortKey),
      locatie: x.locatie == null ? "" : String(x.locatie).trim() || "—",
      fase: faseNorm,
      startISO: x.startISO == null ? "" : String(x.startISO),
      eindISO: x.eindISO == null ? "" : String(x.eindISO),
      gearchiveerd: !!x.gearchiveerd,
      declMeth: x.declMeth == null ? "ONS" : String(x.declMeth),
      teDeclarerenLM: n2(x.teDeclarerenLM),
      nogNietGedeclareerd: n2(x.nogNietGedeclareerd),
      gedeclGemeenteInBehandeling: n2(x.gedeclGemeenteInBehandeling),
      betaaldCumulatief: n2(x.betaaldCumulatief),
      betalingsStatus: bStat,
      tariefEur: n2(x.tariefEur != null ? x.tariefEur : 0),
      tariefEenheid: ["uur", "dag", "week"].indexOf(String(x.tariefEenheid || "uur").toLowerCase()) >= 0
        ? String(x.tariefEenheid).toLowerCase() : "uur",
      betalingRefMaand: (function () {
        if (x.betalingRefMaand && x.betalingRefMaand.length === 7) return x.betalingRefMaand;
        if (x.betalingMaand && x.betalingMaand.length === 7) return x.betalingMaand;
        if (x.startISO && x.startISO.length >= 7) return ymdToMonth(x.startISO);
        return ymdToMonth(isoYMD(new Date()));
      })(),
    };
    o.zorgsoortLabel = zorgLabel(o.zorgsoortKey);
    if (o.tariefEur < 0.01 && o.fase === "in_aanvraag") o.tariefEur = 0;
    return o;
  }

  function zorgKeyBijReferentieNaam(na) {
    var s = String(na || "").toLowerCase();
    if (s.indexOf("wlz") >= 0) return "wlz";
    if (s.indexOf("gecombineerd") >= 0) return "gecombineerd";
    if (s.indexOf("verblijf en behandeling") >= 0) return "verblijf-behandeling";
    if (s.indexOf("verblijf") >= 0) return "verblijf-behandeling";
    if (s.indexOf("ambulant") >= 0 && s.indexOf("extern") >= 0) return "ambulant-extern";
    if (s.indexOf("ambulant") >= 0) return "ambulant";
    if (s.indexOf("fasewonen") >= 0) return "woon-zorg";
    return null;
  }

  function buildSeedRijV2(cl, i) {
    if (!cl) return null;
    var h = simpleHash(String(cl.id) + "|b2|" + i);
    var zks = Object.keys(ZS_LABELS);
    var naamVal = kiesNaamUitReferentie("s" + String(i), cl.id, h);
    var zkA = zorgKeyBijReferentieNaam(naamVal);
    var zk = zkA != null ? zkA : zks[h % zks.length];
    var faseR = h % 5 === 0 ? "in_aanvraag" : "actief";
    if (faseR === "in_aanvraag" && h % 9 === 0) faseR = "actief";
    var payB = h % 4 === 0 ? "betaald" : "outstanding";
    if (faseR === "in_aanvraag") payB = "outstanding";
    var base = bedragUitId(cl.id + "-b" + i);
    var tLM = faseR === "in_aanvraag" || payB === "betaald" ? 0 : n2((h % 7) * 123.45 + base * 0.1);
    var nNG = faseR === "in_aanvraag" || payB === "betaald" ? 0 : n2((h % 9) * 2000.12 + base * 0.25);
    var gIB = (payB === "outstanding" && faseR === "actief" && h % 3 === 0) ? n2(5000 + h * 10) : 0;
    var bCum = payB === "betaald" ? n2(20000 + base * 2) : 0;
    if (faseR === "in_aanvraag") tLM = nNG = gIB = bCum = 0;

    var d0 = new Date();
    d0.setMonth(d0.getMonth() - (h % 12));
    var dE = new Date();
    dE.setDate(dE.getDate() + (h % 20 === 0 ? 20 : 120) + (h % 40));

    var tEen = h % 3;
    return normalizeRow({
      id: genId(),
      clientId: cl.id,
      clientLabel: (String(cl.voornaam || "").trim() + " " + String(cl.achternaam || "").trim()).trim() || "—",
      naam: naamVal,
      zorgsoortKey: zk,
      zorgsoortLabel: zorgLabel(zk),
      locatie: String(cl.locatie || "").trim() || "—",
      fase: faseR,
      startISO: isoYMD(d0),
      eindISO: h % 5 === 0 || h % 13 === 0 ? isoYMD(dE) : (h % 4 === 0 ? (function () {
        var t = new Date();
        t.setDate(t.getDate() + 45 + (h % 20));
        return isoYMD(t);
      })() : ""),
      gearchiveerd: h % 37 === 0,
      declMeth: h % 3 ? "ONS" : (h % 5 ? "Handmatig" : "WLZ"),
      teDeclarerenLM: tLM,
      nogNietGedeclareerd: nNG,
      gedeclGemeenteInBehandeling: gIB,
      betaaldCumulatief: bCum,
      betalingsStatus: payB,
      tariefEur: 60 + (h % 200) * 0.2 + tEen,
      tariefEenheid: tEen === 0 ? "uur" : (tEen === 1 ? "dag" : "week"),
      betalingRefMaand: d0.getFullYear() + "-" + pad2(d0.getMonth() + 1),
    });
  }

  function seedUitClienten() {
    if (typeof getClientenItems !== "function") return [];
    var clients = getClientenItems() || [];
    if (!clients.length) return [];
    var act = clients.filter(function (c) { return c && !c.archived; });
    if (!act.length) act = clients;
    var out = [];
    for (var i = 0; i < 99; i += 1) {
      var cl = act[i % act.length];
      var row = buildSeedRijV2(cl, i);
      if (row) out.push(row);
    }
    return out;
  }

  function rigiClientFromNum(n) {
    var num = typeof n === "number" && !isNaN(n) ? n : parseInt(String(n == null ? "" : n), 10);
    if (isNaN(num)) num = 0;
    if (typeof getClientenItems !== "function") {
      return { id: "cl_" + n, voornaam: "", achternaam: "", locatie: "—" };
    }
    var items = getClientenItems() || [];
    if (num === 99999) {
      return { id: "cl_99999", voornaam: "Test", achternaam: "Cliënt", locatie: "—" };
    }
    if (num === 99901) {
      return { id: "cl_99901", voornaam: "Yassir", achternaam: "Maalin", locatie: "—" };
    }
    if (num === 99820) {
      return { id: "cl_99820", voornaam: "Jimmy", achternaam: "Toemen", locatie: "—" };
    }
    if (num === 99821) {
      return { id: "cl_99821", voornaam: "Santi", achternaam: "Veenendaal Sepulveda", locatie: "—" };
    }
    var j;
    for (j = 0; j < items.length; j += 1) {
      if (items[j] && String(items[j].id) === "cl_" + num) return items[j];
    }
    for (j = 0; j < items.length; j += 1) {
      if (!items[j]) continue;
      if (items[j].clientnummer != null && !isNaN(items[j].clientnummer) && Number(items[j].clientnummer) === Number(num)) {
        return items[j];
      }
    }
    return { id: "cl_" + num, voornaam: "Onbekend", achternaam: "(" + num + ")", locatie: "—" };
  }

  function rigiStableId(idx) {
    var n = idx + 1;
    if (n < 10) return "b_rigi_00" + n;
    if (n < 100) return "b_rigi_0" + n;
    return "b_rigi_" + n;
  }

  function bescStableId(idx) {
    var n = String(idx + 1);
    while (n.length < 3) n = "0" + n;
    return "b_besc_" + n;
  }

  function faseFromBulkLetter(fc) {
    if (fc === "i" || fc === "in") return "in_aanvraag";
    if (fc === "v") return "verlopen";
    if (fc === "z") return "in_zorg";
    return "actief";
  }

  function expandBulkTupToRow(t, idx, idOverride) {
    var cl = rigiClientFromNum(t.n);
    var zmap = { geo: "gecombineerd", veb: "verblijf-behandeling", amb: "ambulant", wlz: "wlz" };
    var zk = zmap[t.zk] || "gecombineerd";
    var fase = faseFromBulkLetter(String(t.f == null ? "a" : t.f).toLowerCase());
    var pay = t.p === "b" ? "betaald" : "outstanding";
    var clBase = (String(cl.voornaam || "").trim() + " " + String(cl.achternaam || "").trim()).trim() || "—";
    var label = t.lbl != null && String(t.lbl).trim() !== "" ? String(t.lbl).trim() : clBase;
    var idUse = idOverride != null && idOverride !== "" ? idOverride : bescStableId(idx);
    return normalizeRow({
      id: idUse,
      clientId: cl.id,
      clientLabel: label,
      naam: t.nm,
      zorgsoortKey: zk,
      locatie: String(cl.locatie || "").trim() || "—",
      fase: fase,
      startISO: t.s || "",
      eindISO: t.e || "",
      gearchiveerd: false,
      declMeth: t.dm || "ONS",
      teDeclarerenLM: n2(t.tlm),
      nogNietGedeclareerd: n2(t.nng),
      gedeclGemeenteInBehandeling: 0,
      betaaldCumulatief: 0,
      betalingsStatus: pay,
      tariefEur: n2(t.t),
      tariefEenheid: t.u || "uur",
      betalingRefMaand: t.s && t.s.length >= 7 ? ymdToMonth(t.s) : ymdToMonth(isoYMD(new Date())),
    });
  }

  function tryInstallBescBulkSnapshot() {
    try {
      if (!global.BESA_BESC || !Array.isArray(global.BESA_BESC) || global.BESA_BESC.length < 1) return;
      if (typeof getClientenItems !== "function") return;
      var fileVer = String(global.BESC_BULK_DATA_VER != null ? global.BESC_BULK_DATA_VER : "1");
      var st = null;
      try {
        st = global.localStorage.getItem(BESC_BULK_DATA_VER_ST);
      } catch (e0) { /* */ }
      if (st === fileVer) return;
      var rows = [];
      for (var b = 0; b < global.BESA_BESC.length; b += 1) {
        rows.push(expandBulkTupToRow(global.BESA_BESC[b], b));
      }
      setBeschikkingenItemsRaw(rows, true);
      try {
        global.localStorage.setItem(BESC_BULK_DATA_VER_ST, fileVer);
        global.localStorage.setItem(RIGI99_FLAG, "1");
        global.localStorage.setItem(SEEDED, "1");
      } catch (e) { /* */ }
      notifyBeschikkingenChanged();
    } catch (e2) { /* */ }
  }

  function tryInstallRigi99Snapshot() {
    try {
      if (global.localStorage.getItem(RIGI99_FLAG) === "1") return;
      if (global.BESA_BESC && Array.isArray(global.BESA_BESC) && global.BESA_BESC.length) return;
      if (!global.BESA_RIGI99 || !Array.isArray(global.BESA_RIGI99) || global.BESA_RIGI99.length !== 99) return;
      if (typeof getClientenItems !== "function") return;
      var rows = [];
      for (var r = 0; r < 99; r += 1) {
        var tupR = Object.assign({}, global.BESA_RIGI99[r]);
        if (tupR.f === "in" || !tupR.f) tupR.f = "i";
        rows.push(expandBulkTupToRow(tupR, r, rigiStableId(r)));
      }
      setBeschikkingenItemsRaw(rows, true);
      try {
        global.localStorage.setItem(RIGI99_FLAG, "1");
        global.localStorage.setItem(SEEDED, "1");
      } catch (e) { /* */ }
      notifyBeschikkingenChanged();
    } catch (e2) { /* */ }
  }

  function getBeschikkingenItems() {
    tryInstallBescBulkSnapshot();
    tryInstallRigi99Snapshot();
    var v2 = read();
    if (v2 && v2.length) {
      applyNaamScreenfixIfNeeded();
      v2 = read();
      return (v2 || []).map(function (r) { return Object.assign({}, normalizeRow(migrateV1Rij(r))); });
    }
    if (Array.isArray(v2) && v2.length === 0 && global.localStorage.getItem(SEEDED) === "1")
      return [];

    var v1 = readV1();
    if (v1 && v1.length) {
      var mig = v1.map(function (r) { return migrateV1Rij(r); });
      setBeschikkingenItemsRaw(mig, true);
      try {
        global.localStorage.removeItem(KEY_V1);
      } catch (e) { /* */ }
      return mig.map(function (r) { return Object.assign({}, r); });
    }

    var seed = seedUitClienten();
    if (!seed || !seed.length) {
      seed = [
        normalizeRow({
          id: genId(),
          clientId: "cl_177",
          clientLabel: "Demo cliënt",
          naam: "Gecombineerd",
          zorgsoortKey: "gecombineerd",
          zorgsoortLabel: "Gecombineerd",
          locatie: "satelliet woning",
          fase: "actief",
          startISO: "2024-01-15",
          eindISO: "",
          teDeclarerenLM: 2000,
          nogNietGedeclareerd: 5000,
          gedeclGemeenteInBehandeling: 0,
          betaaldCumulatief: 0,
          betalingsStatus: "outstanding",
          tariefEur: 86.4,
          tariefEenheid: "uur",
          betalingRefMaand: ymdToMonth("2024-01-15"),
        }),
      ];
    }
    setBeschikkingenItemsRaw(seed, true);
    try {
      global.localStorage.setItem(SEEDED, "1");
    } catch (e) { /* */ }
    return (read() || []).map(function (r) { return Object.assign({}, normalizeRow(r)); });
  }

  function setBeschikkingenItemsRaw(list, skipNotify) {
    var norm = (Array.isArray(list) ? list : []).map(function (r) { return normalizeRow(r); });
    writeRaw(norm);
    if (!skipNotify) notifyBeschikkingenChanged();
  }

  function setBeschikkingenItems(items) {
    setBeschikkingenItemsRaw(items, false);
  }

  function addBeschikkingRij(row) {
    row = normalizeRow(row);
    if (!row.id) row.id = genId();
    if (isPlatshouderNaam(row.naam)) {
      row.naam = kiesNaamUitReferentie(row.id, row.clientId, simpleHash(String(row.startISO) + "x"));
    }
    row = normalizeRow(row);
    if (!row.betalingRefMaand && row.startISO) row.betalingRefMaand = ymdToMonth(row.startISO);
    if (!row.betalingRefMaand) row.betalingRefMaand = ymdToMonth(isoYMD(new Date()));
    if (!row.zorgsoortLabel) row.zorgsoortLabel = zorgLabel(row.zorgsoortKey);
    var all = getBeschikkingenItems();
    all.push(row);
    setBeschikkingenItems(all);
    return row;
  }

  function addBeschikkingVanuitFormulier(p) {
    p = p || {};
    var f0 = String(p.fase || "").toLowerCase();
    var fase = f0;
    if (fase === "aangevraagd") fase = "in_aanvraag";
    if (!fase) fase = "actief";
    var bStat = "outstanding";
    var tLM = 0;
    var nNG = 0;
    var gIB = 0;
    var bC = 0;
    var base = bedragUitId((p.clientId || "") + "|" + (p.naam || "x")) % 80000;
    base = n2(base);
    if (fase === "in_aanvraag" || fase === "aangevraagd") {
      bStat = "outstanding";
    } else if (f0 === "afgehandeld") {
      fase = "actief";
      bStat = "betaald";
      bC = base + 1000;
    } else if (f0 === "verlopen") {
      tLM = 0;
      nNG = n2(base * 0.5);
    } else {
      tLM = n2(base * 0.2);
      nNG = n2(base * 0.6);
    }
    var row = {
      id: genId(),
      clientId: p.clientId || "",
      clientLabel: p.clientLabel || "—",
      naam: (p.naam == null ? "" : String(p.naam)).trim(),
      zorgsoortKey: p.zorgsoortKey || "overig",
      fase: fase,
      locatie: p.locatie == null ? "" : String(p.locatie).trim() || "—",
      startISO: p.startISO || "",
      eindISO: p.eindISO || "",
      declMeth: p.declMeth || "ONS",
      gearchiveerd: false,
      teDeclarerenLM: tLM,
      nogNietGedeclareerd: fase === "in_aanvraag" ? 0 : nNG,
      gedeclGemeenteInBehandeling: 0,
      betaaldCumulatief: bC,
      betalingsStatus: bStat,
      tariefEur: 86 + (simpleHash(p.clientId + p.naam) % 200),
      tariefEenheid: "uur",
      betalingRefMaand: p.startISO ? ymdToMonth(p.startISO) : ymdToMonth(isoYMD(new Date())),
    };
    return addBeschikkingRij(row);
  }

  function removeBeschikkingById(id) {
    if (id == null) return;
    var all = getBeschikkingenItems();
    var next = all.filter(function (r) { return r && r.id !== id; });
    if (next.length === all.length) return;
    setBeschikkingenItems(next);
  }

  function setBeschikkingField(id, fn) {
    if (!id) return;
    var all = getBeschikkingenItems();
    for (var i = 0; i < all.length; i += 1) {
      if (all[i] && all[i].id === id) {
        fn(all[i]);
        all[i] = normalizeRow(all[i]);
        setBeschikkingenItems(all);
        return all[i];
      }
    }
    return null;
  }

  function getBeschikkingById(id) {
    if (id == null) return null;
    var s = String(id);
    var all = getBeschikkingenItems() || [];
    for (var i = 0; i < all.length; i += 1) {
      if (all[i] && String(all[i].id) === s) return Object.assign({}, all[i]);
    }
    return null;
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

  function eindNietVerstrekenBesc(b) {
    if (!b || !b.eindISO) return true;
    var t = new Date(b.eindISO);
    if (isNaN(t.getTime())) return true;
    var nu = new Date();
    nu.setHours(0, 0, 0, 0);
    return t.getTime() >= nu.getTime();
  }

  function aggregateDashboardData() {
    var items = (typeof getBeschikkingenItems === "function" ? getBeschikkingenItems() : []) || [];
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

  global.getBeschikkingenItems = getBeschikkingenItems;
  global.setBeschikkingenItems = setBeschikkingenItems;
  global.addBeschikkingRij = addBeschikkingRij;
  global.addBeschikkingVanuitFormulier = addBeschikkingVanuitFormulier;
  global.getBescZorgsoortLabel = zorgLabel;
  global.removeBeschikkingById = removeBeschikkingById;
  global.setBeschikkingField = setBeschikkingField;
  global.getBeschikkingById = getBeschikkingById;
  global.normalizeBeschikkingRij = normalizeRow;
  global.aggBescVerlooptBinnen60 = function () {
    return countVerlooptBinnen60(getBeschikkingenItems().filter(function (b) { return b && !b.gearchiveerd; }));
  };
  global.beschikkingenDataAggregate = aggregateDashboardData;
  global.beschikkingenNotifyChange = notifyBeschikkingenChanged;
  global.SUPPORTED_ZORGSOORT_KEYS_BESC = function () { return Object.keys(ZS_LABELS).filter(function (k) { return k !== "overig"; }); };
})(typeof window !== "undefined" ? window : this);
