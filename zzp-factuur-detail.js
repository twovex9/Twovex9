/* global window, document, zzpFacturenDB */
/**
 * zzp-factuur-detail.js — detail / bewerken / BEOORDELEN van een FF-native ZZP-proforma.
 * - View: proforma; zodra de ZZP heeft ingediend/bewerkt → SIDE-BY-SIDE proforma ↔ ingediend
 *   (per regel + totaal onderaan) met 🔴 (tarief/bedrag) / 🟠 (verwijderd).
 * - Edit (eigenaar-ZZP óf reviewer, mits niet goedgekeurd): factuurnummer, logo, diensten, indienen.
 * - Beoordelen (reviewer, status ingediend): Goedkeuren / Afwijzen (reden verplicht).
 */
(function () {
  "use strict";

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  var STATUS_LABEL = {
    klaargezet: "Klaargezet", ingediend: "Ingediend", in_behandeling: "In behandeling",
    goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen", klaar_voor_betaling: "Klaar voor betaling",
  };
  var NIET_BEWERKBAAR = { goedgekeurd: 1, klaar_voor_betaling: 1 };

  var THEAD_SIMPLE =
    '<tr><th>Dag</th><th>Datum</th><th>Tijd</th><th class="zd-num">Pauze</th>' +
    '<th class="zd-num">Uren</th><th class="zd-num">Tarief</th><th class="zd-num">Bedrag</th></tr>';
  var THEAD_EDIT =
    '<tr><th>Dag</th><th>Datum</th><th>Tijd</th><th class="zd-num">Pauze</th>' +
    '<th class="zd-num">Uren</th><th class="zd-num">Tarief</th><th class="zd-num">Bedrag</th>' +
    '<th class="zd-num">Actie</th></tr>';
  var THEAD_CMP =
    '<tr><th rowspan="2">Dag</th><th rowspan="2">Datum</th>' +
    '<th colspan="3" class="zd-grp zd-grp--pf">Proforma (gepland)</th>' +
    '<th colspan="3" class="zd-grp zd-grp--ing">Ingediend (ZZP)</th><th rowspan="2"></th></tr>' +
    '<tr><th class="zd-num">Uren</th><th class="zd-num">Tarief</th><th class="zd-num">Bedrag</th>' +
    '<th class="zd-num">Uren</th><th class="zd-num">Tarief</th><th class="zd-num">Bedrag</th></tr>';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtEur(n) { return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtUren(n) { return (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function fmtTarief(n) { return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function ymLabel(jaar, maand) {
    if (jaar == null || maand == null) return "";
    return (MAANDEN[maand - 1] ? MAANDEN[maand - 1].charAt(0).toUpperCase() + MAANDEN[maand - 1].slice(1) : maand) + " " + jaar;
  }
  function fmtDate(d) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : d; }
  function fmtTime(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }); }
    catch (e) { return ""; }
  }
  function getParam(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function toast(msg) {
    var t = $("zd-toast"); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(t._h);
    t._h = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function setFoot(html) { var f = $("zd-foot"); if (f) f.innerHTML = html; }

  var state = { id: null, factuur: null, regels: [], mode: "view", work: [], logoFile: null };

  function isReviewer() { return !!(zzpFacturenDB.isReviewer && zzpFacturenDB.isReviewer()); }
  function isOwner(f) {
    var mijn = zzpFacturenDB.currentMedewerkerId && zzpFacturenDB.currentMedewerkerId();
    return !!(f && f.medewerkerId && mijn && String(f.medewerkerId) === String(mijn));
  }
  function canEdit(f) {
    if (!f || NIET_BEWERKBAAR[f.status]) return false;
    return isOwner(f) || isReviewer();
  }
  function curUren(r) { return r.ingediendUren != null ? r.ingediendUren : r.proformaUren; }
  function curTarief(r) { return r.ingediendTarief != null ? r.ingediendTarief : r.proformaTarief; }
  function curBedrag(r) { return r.ingediendBedrag != null ? r.ingediendBedrag : r.proformaBedrag; }
  function isChanged(r) {
    return Math.round(curUren(r) * 100) !== Math.round(r.proformaUren * 100) ||
      Math.round(curTarief(r) * 100) !== Math.round(r.proformaTarief * 100);
  }
  function isVergelijking() {
    var f = state.factuur;
    return !!f && (f.status !== "klaargezet" || f.heeftBedragAfwijking || f.heeftVerwijderdeDienst);
  }

  // ── Header + acties ──
  function renderHeader() {
    var f = state.factuur;
    $("zd-titel").textContent = f.medewerkerNaam || "Proforma-factuur";
    var bits = [];
    bits.push("<span><strong>" + esc(f.locatie || "—") + "</strong> · locatie</span>");
    bits.push("<span><strong>" + esc(ymLabel(f.jaar, f.maand)) + "</strong> · werk-maand</span>");
    bits.push(f.bureau ? "<span>via bureau <strong>" + esc(f.bureau) + "</strong></span>" : "<span>directe ZZP'er</span>");
    if (f.eigenFactuurnummer && state.mode === "view") bits.push("<span>factuurnr. <strong>" + esc(f.eigenFactuurnummer) + "</strong></span>");
    $("zd-meta").innerHTML = bits.join("");
    var statusHtml = '<span class="zf-pill zf-pill--' + esc(f.status) + '">' + esc(STATUS_LABEL[f.status] || f.status) + "</span>";

    var act = $("zd-actions");
    if (state.mode === "edit") {
      act.innerHTML = statusHtml +
        '<button type="button" class="btn-outline" id="zd-annuleer">Annuleren</button>' +
        '<button type="button" class="btn-outline" id="zd-opslaan">Concept opslaan</button>' +
        '<button type="button" class="btn-primary" id="zd-indienen">Indienen</button>';
      $("zd-annuleer").addEventListener("click", function () { setMode("view"); });
      $("zd-opslaan").addEventListener("click", function () { save(false); });
      $("zd-indienen").addEventListener("click", function () { save(true); });
      return;
    }
    var btns = "";
    if (canEdit(f)) btns += '<button type="button" class="btn-outline" id="zd-bewerk">' + (isOwner(f) ? "Bewerken & indienen" : "Bewerken") + "</button>";
    if (isReviewer() && (f.status === "ingediend" || f.status === "in_behandeling")) {
      btns += '<button type="button" class="btn-outline" id="zd-afwijzen">Afwijzen</button>';
      btns += '<button type="button" class="btn-primary" id="zd-goedkeuren">Goedkeuren</button>';
    }
    act.innerHTML = statusHtml + btns;
    if (canEdit(f) && $("zd-bewerk")) $("zd-bewerk").addEventListener("click", function () { setMode("edit"); });
    if ($("zd-goedkeuren")) $("zd-goedkeuren").addEventListener("click", doGoedkeuren);
    if ($("zd-afwijzen")) $("zd-afwijzen").addEventListener("click", startAfwijzen);
  }

  function renderBanner() {
    var f = state.factuur, b = $("zd-banner"); if (!b) return;
    if (f.status === "afgewezen" && f.afwijzingReden) {
      b.innerHTML = '<div class="zd-banner zd-banner--afgewezen"><strong>Afgewezen.</strong> ' + esc(f.afwijzingReden) + " — de ZZP'er kan aanpassen en opnieuw indienen.</div>";
    } else if (f.status === "goedgekeurd" || f.status === "klaar_voor_betaling") {
      b.innerHTML = '<div class="zd-banner zd-banner--goedgekeurd"><strong>Goedgekeurd</strong> — klaargezet voor betaling.</div>';
    } else if (f.status === "ingediend" && isReviewer()) {
      b.innerHTML = '<div class="zd-banner zd-banner--ingediend">Ingediend door de ZZP\'er. Vergelijk hieronder de proforma met de ingediende factuur en keur goed of wijs af.</div>';
    } else { b.innerHTML = ""; }
  }

  function renderKpis() {
    var f = state.factuur;
    $("zd-totaal").textContent = fmtEur(f.proformaBedrag);
    $("zd-uren").textContent = fmtUren(f.proformaUren);
    $("zd-tarief").textContent = fmtTarief(f.proformaTarief);
    $("zd-diensten").textContent = f.proformaDiensten;
  }

  // ── View ──
  function renderZzpReadonly() {
    var f = state.factuur;
    $("zd-nummer").hidden = true; $("zd-nummer-ro").hidden = false;
    $("zd-nummer-ro").textContent = f.eigenFactuurnummer || "—";
    $("zd-logo").hidden = true;
    if (f.logoUrl) { $("zd-logo-prev").hidden = false; $("zd-logo-prev").src = f.logoUrl; } else { $("zd-logo-prev").hidden = true; }
    $("zd-extra").hidden = true; $("zd-extra-ro").hidden = false;
    $("zd-extra-ro").textContent = (f.extraGegevens && (f.extraGegevens.tekst || f.extraGegevens.opmerking)) || "—";
    $("zd-edit-hint").hidden = true;
  }

  function renderViewRegels() {
    var f = state.factuur, regels = state.regels;
    var hasZzpInfo = f.eigenFactuurnummer || f.logoUrl || (f.extraGegevens && f.extraGegevens.tekst);
    $("zd-zzpcard").hidden = !hasZzpInfo;
    if (hasZzpInfo) renderZzpReadonly();
    if (isVergelijking()) renderCmpRows(regels); else renderSimpleRows(regels);
  }

  function renderSimpleRows(regels) {
    $("zd-thead").innerHTML = THEAD_SIMPLE;
    var tb = $("zd-regels");
    if (!regels.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty">Geen diensten.</td></tr>'; }
    else {
      tb.innerHTML = regels.map(function (r) {
        var tijd = (fmtTime(r.startIso) && fmtTime(r.eindeIso)) ? (fmtTime(r.startIso) + "–" + fmtTime(r.eindeIso)) : "—";
        return "<tr><td>" + esc(r.dag || "") + "</td><td>" + esc(fmtDate(r.datum)) + "</td><td>" + tijd + "</td>" +
          '<td class="zd-num">' + (r.pauzeUren ? fmtUren(r.pauzeUren) : "—") + "</td>" +
          '<td class="zd-num">' + fmtUren(r.proformaUren) + "</td>" +
          '<td class="zd-num">' + fmtTarief(r.proformaTarief) + "</td>" +
          '<td class="zd-num"><strong>' + fmtEur(r.proformaBedrag) + "</strong></td></tr>";
      }).join("");
    }
    setFoot('<span><span class="zd-foot-lbl">Totaal uren:</span> ' + fmtUren(state.factuur.proformaUren) +
      '</span> <span><span class="zd-foot-lbl">Totaal bedrag:</span> ' + fmtEur(state.factuur.proformaBedrag) + "</span>");
  }

  function renderCmpRows(regels) {
    $("zd-thead").innerHTML = THEAD_CMP;
    var tb = $("zd-regels");
    tb.innerHTML = regels.map(function (r) {
      var verwijderd = r.verwijderd, gewijzigd = !verwijderd && isChanged(r);
      var cls = verwijderd ? "zd-removed" : (gewijzigd ? "zd-changed" : "");
      var sig = verwijderd ? '<span class="zd-sig zd-sig--oranje" title="verwijderd"></span>'
        : (gewijzigd ? '<span class="zd-sig zd-sig--rood" title="gewijzigd"></span>' : "");
      var ingCls = function (changed) { return "zd-num zd-ing" + (changed ? " zd-chg" : ""); };
      var uChg = Math.round(curUren(r) * 100) !== Math.round(r.proformaUren * 100);
      var tChg = Math.round(curTarief(r) * 100) !== Math.round(r.proformaTarief * 100);
      return '<tr class="' + cls + '">' +
        '<td class="zd-omschrijving">' + esc(r.dag || "") + "</td><td>" + esc(fmtDate(r.datum)) + "</td>" +
        '<td class="zd-num">' + fmtUren(r.proformaUren) + "</td>" +
        '<td class="zd-num">' + fmtTarief(r.proformaTarief) + "</td>" +
        '<td class="zd-num">' + fmtEur(r.proformaBedrag) + "</td>" +
        '<td class="' + ingCls(uChg) + '">' + (verwijderd ? "—" : fmtUren(curUren(r))) + "</td>" +
        '<td class="' + ingCls(tChg) + '">' + (verwijderd ? "—" : fmtTarief(curTarief(r))) + "</td>" +
        '<td class="' + ingCls(uChg || tChg) + '"><strong>' + fmtEur(verwijderd ? 0 : curBedrag(r)) + "</strong></td>" +
        '<td class="zd-num">' + sig + "</td></tr>";
    }).join("");
    var ingUren = regels.reduce(function (s, r) { return s + (r.verwijderd ? 0 : curUren(r)); }, 0);
    var ingBedrag = regels.reduce(function (s, r) { return s + (r.verwijderd ? 0 : curBedrag(r)); }, 0);
    var diff = ingBedrag - state.factuur.proformaBedrag;
    setFoot(
      '<span><span class="zd-foot-lbl">Proforma:</span> ' + fmtEur(state.factuur.proformaBedrag) + "</span>" +
      '<span><span class="zd-foot-lbl">Ingediend:</span> ' + fmtEur(ingBedrag) + " (" + fmtUren(ingUren) + " u)</span>" +
      (Math.round(diff * 100) !== 0 ? '<span class="zd-afw">Δ ' + fmtEur(diff) + "</span>" :
        '<span class="zd-foot-lbl">bedragen gelijk ✓</span>'));
  }

  // ── Edit ──
  function setMode(m) {
    state.mode = m;
    if (m === "edit") {
      state.work = state.regels.map(function (r) {
        return { id: r.id, dag: r.dag, datum: r.datum, startIso: r.startIso, eindeIso: r.eindeIso, pauzeUren: r.pauzeUren,
          proformaUren: r.proformaUren, proformaTarief: r.proformaTarief, proformaBedrag: r.proformaBedrag,
          uren: curUren(r), tarief: curTarief(r), verwijderd: !!r.verwijderd };
      });
      state.logoFile = null;
    }
    renderHeader();
    if (m === "edit") renderEdit(); else { renderBanner(); renderViewRegels(); }
  }

  function renderEdit() {
    var f = state.factuur;
    $("zd-banner").innerHTML = "";
    $("zd-zzpcard").hidden = false;
    $("zd-nummer").hidden = false; $("zd-nummer-ro").hidden = true; $("zd-nummer").value = f.eigenFactuurnummer || "";
    $("zd-logo").hidden = false;
    if (f.logoUrl) { $("zd-logo-prev").hidden = false; $("zd-logo-prev").src = f.logoUrl; } else { $("zd-logo-prev").hidden = true; }
    $("zd-extra").hidden = false; $("zd-extra-ro").hidden = true;
    $("zd-extra").value = (f.extraGegevens && (f.extraGegevens.tekst || f.extraGegevens.opmerking)) || "";
    $("zd-edit-hint").hidden = false;
    $("zd-logo").onchange = function (e) {
      var file = e.target.files && e.target.files[0]; state.logoFile = file || null;
      if (file) { var rd = new FileReader(); rd.onload = function (ev) { $("zd-logo-prev").hidden = false; $("zd-logo-prev").src = ev.target.result; }; rd.readAsDataURL(file); }
    };
    $("zd-thead").innerHTML = THEAD_EDIT;
    var tb = $("zd-regels");
    tb.innerHTML = state.work.map(function (r, i) {
      var tijd = (fmtTime(r.startIso) && fmtTime(r.eindeIso)) ? (fmtTime(r.startIso) + "–" + fmtTime(r.eindeIso)) : "—";
      return '<tr data-i="' + i + '"' + (r.verwijderd ? ' class="zd-removed"' : "") + ">" +
        '<td class="zd-omschrijving">' + esc(r.dag || "") + "</td><td>" + esc(fmtDate(r.datum)) + "</td><td>" + tijd + "</td>" +
        '<td class="zd-num">' + (r.pauzeUren ? fmtUren(r.pauzeUren) : "—") + "</td>" +
        '<td class="zd-num"><input class="zd-inp" data-field="uren" data-i="' + i + '" type="number" step="0.25" min="0" value="' + r.uren + '"' + (r.verwijderd ? " disabled" : "") + " /></td>" +
        '<td class="zd-num"><input class="zd-inp" data-field="tarief" data-i="' + i + '" type="number" step="0.01" min="0" value="' + r.tarief + '"' + (r.verwijderd ? " disabled" : "") + " /></td>" +
        '<td class="zd-num zd-bedrag" data-i="' + i + '"><strong>' + fmtEur(r.verwijderd ? 0 : r.uren * r.tarief) + "</strong></td>" +
        '<td class="zd-num"><button type="button" class="zd-del-btn' + (r.verwijderd ? " is-removed" : "") + '" data-i="' + i + '">' + (r.verwijderd ? "Terugzetten" : "Verwijderen") + "</button></td></tr>";
    }).join("");
    tb.oninput = function (e) {
      var inp = e.target.closest(".zd-inp"); if (!inp) return;
      var i = +inp.getAttribute("data-i"), fld = inp.getAttribute("data-field");
      state.work[i][fld] = parseFloat(inp.value) || 0;
      var cell = tb.querySelector('.zd-bedrag[data-i="' + i + '"]');
      if (cell) cell.innerHTML = "<strong>" + fmtEur(state.work[i].verwijderd ? 0 : state.work[i].uren * state.work[i].tarief) + "</strong>";
      recomputeFoot();
    };
    tb.onclick = function (e) {
      var btn = e.target.closest(".zd-del-btn"); if (!btn) return;
      var i = +btn.getAttribute("data-i"); state.work[i].verwijderd = !state.work[i].verwijderd; renderEdit();
    };
    recomputeFoot();
  }

  function recomputeFoot() {
    var totUren = state.work.reduce(function (s, r) { return s + (r.verwijderd ? 0 : (r.uren || 0)); }, 0);
    var totBedrag = state.work.reduce(function (s, r) { return s + (r.verwijderd ? 0 : (r.uren || 0) * (r.tarief || 0)); }, 0);
    var rood = state.work.some(function (r) { return !r.verwijderd && (Math.round(r.uren * 100) !== Math.round(r.proformaUren * 100) || Math.round(r.tarief * 100) !== Math.round(r.proformaTarief * 100)); });
    var oranje = state.work.some(function (r) { return r.verwijderd; });
    var diff = totBedrag - state.factuur.proformaBedrag;
    var parts = [];
    if (rood) parts.push('<span class="zd-sig zd-sig--rood"></span>tarief/bedrag gewijzigd');
    if (oranje) parts.push('<span class="zd-sig zd-sig--oranje"></span>dienst verwijderd');
    setFoot('<span><span class="zd-foot-lbl">Totaal uren:</span> ' + fmtUren(totUren) + "</span>" +
      '<span><span class="zd-foot-lbl">Totaal bedrag:</span> ' + fmtEur(totBedrag) + "</span>" +
      '<span class="zd-sig-note">' + (Math.round(diff * 100) !== 0 ? '<span class="zd-afw">Δ proforma: ' + fmtEur(diff) + "</span>  " : "") + parts.join("  ") + "</span>");
  }

  async function save(indienen) {
    var f = state.factuur;
    if ($("zd-opslaan")) $("zd-opslaan").disabled = true;
    if ($("zd-indienen")) $("zd-indienen").disabled = true;
    try {
      var logoUrl = null;
      if (state.logoFile) logoUrl = await zzpFacturenDB.uploadLogo(f.id, state.logoFile);
      var regels = state.work.map(function (r) { return { id: r.id, ingediend_uren: r.uren, ingediend_tarief: r.tarief, verwijderd: !!r.verwijderd }; });
      var extraTxt = ($("zd-extra").value || "").trim();
      await zzpFacturenDB.opslaan(f.id, {
        eigenFactuurnummer: ($("zd-nummer").value || "").trim(), logoUrl: logoUrl,
        extra: extraTxt ? { tekst: extraTxt } : null, regels: regels, indienen: !!indienen,
      });
      toast(indienen ? "Factuur ingediend." : "Concept opgeslagen.");
      await reload(); setMode("view");
    } catch (e) {
      toast("Opslaan mislukt: " + (e && e.message ? e.message : e));
      if ($("zd-opslaan")) $("zd-opslaan").disabled = false;
      if ($("zd-indienen")) $("zd-indienen").disabled = false;
    }
  }

  // ── Beoordelen (reviewer) ──
  async function doGoedkeuren() {
    var btn = $("zd-goedkeuren"); if (btn) btn.disabled = true;
    try {
      await zzpFacturenDB.beoordelen(state.id, "goedkeuren", null);
      toast("Factuur goedgekeurd — klaar voor betaling.");
      await reload(); renderAll();
    } catch (e) { toast("Goedkeuren mislukt: " + (e && e.message ? e.message : e)); if (btn) btn.disabled = false; }
  }
  function startAfwijzen() {
    var b = $("zd-banner");
    b.innerHTML = '<div class="zd-banner zd-banner--afgewezen"><strong>Afwijzen</strong> — geef een reden (de ZZP\'er ziet deze):' +
      '<div class="zd-reden"><textarea id="zd-reden-txt" placeholder="bv. tarief klopt niet met de afspraak / dienst X is ten onrechte verwijderd"></textarea>' +
      '<div class="zd-reden-row"><button type="button" class="btn-outline" id="zd-reden-annuleer">Annuleren</button>' +
      '<button type="button" class="btn-primary" id="zd-reden-bevestig">Afwijzen bevestigen</button></div></div></div>';
    $("zd-reden-txt").focus();
    $("zd-reden-annuleer").addEventListener("click", function () { renderBanner(); });
    $("zd-reden-bevestig").addEventListener("click", function () { doAfwijzen(($("zd-reden-txt").value || "").trim()); });
  }
  async function doAfwijzen(reden) {
    if (!reden) { toast("Geef een reden op."); return; }
    var btn = $("zd-reden-bevestig"); if (btn) btn.disabled = true;
    try {
      await zzpFacturenDB.beoordelen(state.id, "afwijzen", reden);
      toast("Factuur afgewezen.");
      await reload(); renderAll();
    } catch (e) { toast("Afwijzen mislukt: " + (e && e.message ? e.message : e)); if (btn) btn.disabled = false; }
  }

  async function reload() {
    var detail = await zzpFacturenDB.getDetail(state.id);
    if (detail && detail.factuur) { state.factuur = detail.factuur; state.regels = detail.regels || []; }
  }

  function renderAll() {
    if (!state.factuur) {
      $("zd-titel").textContent = "Proforma-factuur niet gevonden";
      $("zd-meta").innerHTML = "<span>Deze factuur bestaat niet of je hebt er geen toegang toe.</span>";
      return;
    }
    state.mode = "view";
    renderHeader(); renderBanner(); renderKpis(); renderViewRegels();
  }

  async function start() {
    state.id = getParam("id");
    if (!state.id || !window.zzpFacturenDB) { renderAll(); return; }
    try {
      if (window.profilesDB && window.profilesDB.ready) { try { await window.profilesDB.ready; } catch (e) { /* */ } }
      await reload();
    } catch (e) { /* */ }
    renderAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
