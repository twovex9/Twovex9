/* global window, document, zzpFacturenDB */
/**
 * zzp-factuur-detail.js — detail + BEWERKEN van één FF-native ZZP-proforma.
 * View-modus: proforma + diensten + (na bewerking) 🔴/🟠-markeringen + totaal-vergelijking.
 * Edit-modus (eigenaar-ZZP óf reviewer, mits niet goedgekeurd): eigen factuurnummer,
 * logo-upload, extra gegevens, diensten aanpassen/verwijderen, opslaan + indienen.
 * Change-detectie + herbereken gebeuren server-side (zzp_factuur_opslaan).
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
    t._h = setTimeout(function () { t.hidden = true; }, 3400);
  }

  var state = { id: null, factuur: null, regels: [], mode: "view", work: [], logoFile: null };

  function canEdit(f) {
    if (!f || NIET_BEWERKBAAR[f.status]) return false;
    var mijn = zzpFacturenDB.currentMedewerkerId && zzpFacturenDB.currentMedewerkerId();
    var isOwner = f.medewerkerId && mijn && String(f.medewerkerId) === String(mijn);
    var isReviewer = (window.besaIsAdminTier && window.besaIsAdminTier()) ||
      (window.besaCan && window.besaCan("view", "invoices"));
    return !!(isOwner || isReviewer);
  }
  function isOwner(f) {
    var mijn = zzpFacturenDB.currentMedewerkerId && zzpFacturenDB.currentMedewerkerId();
    return !!(f && f.medewerkerId && mijn && String(f.medewerkerId) === String(mijn));
  }

  // huidige (ingediende) waarden van een regel; vallen terug op proforma.
  function curUren(r) { return r.ingediendUren != null ? r.ingediendUren : r.proformaUren; }
  function curTarief(r) { return r.ingediendTarief != null ? r.ingediendTarief : r.proformaTarief; }
  function curBedrag(r) { return r.ingediendBedrag != null ? r.ingediendBedrag : r.proformaBedrag; }
  function isChanged(r) {
    return Math.round(curUren(r) * 100) !== Math.round(r.proformaUren * 100) ||
      Math.round(curTarief(r) * 100) !== Math.round(r.proformaTarief * 100);
  }

  function renderHeader() {
    var f = state.factuur;
    $("zd-titel").textContent = f.medewerkerNaam || "Proforma-factuur";
    var bits = [];
    bits.push("<span><strong>" + esc(f.locatie || "—") + "</strong> · locatie</span>");
    bits.push("<span><strong>" + esc(ymLabel(f.jaar, f.maand)) + "</strong> · werk-maand</span>");
    bits.push(f.bureau ? "<span>via bureau <strong>" + esc(f.bureau) + "</strong></span>" : "<span>directe ZZP'er</span>");
    if (f.eigenFactuurnummer && state.mode === "view") bits.push("<span>factuurnr. <strong>" + esc(f.eigenFactuurnummer) + "</strong></span>");
    $("zd-meta").innerHTML = bits.join("");
    var lbl = STATUS_LABEL[f.status] || f.status;
    var statusHtml = '<span class="zf-pill zf-pill--' + esc(f.status) + '">' + esc(lbl) + "</span>";

    var act = $("zd-actions");
    if (state.mode === "edit") {
      act.innerHTML = statusHtml +
        '<button type="button" class="btn-outline" id="zd-annuleer">Annuleren</button>' +
        '<button type="button" class="btn-outline" id="zd-opslaan">Concept opslaan</button>' +
        '<button type="button" class="btn-primary" id="zd-indienen">Indienen</button>';
      $("zd-annuleer").addEventListener("click", function () { setMode("view"); });
      $("zd-opslaan").addEventListener("click", function () { save(false); });
      $("zd-indienen").addEventListener("click", function () { save(true); });
    } else {
      var btn = canEdit(f)
        ? '<button type="button" class="btn-primary" id="zd-bewerk">' + (isOwner(f) ? "Bewerken & indienen" : "Bewerken") + "</button>"
        : "";
      act.innerHTML = statusHtml + btn;
      if (canEdit(f)) $("zd-bewerk").addEventListener("click", function () { setMode("edit"); });
    }
  }

  function renderKpis() {
    var f = state.factuur;
    $("zd-totaal").textContent = fmtEur(f.proformaBedrag);
    $("zd-uren").textContent = fmtUren(f.proformaUren);
    $("zd-tarief").textContent = fmtTarief(f.proformaTarief);
    $("zd-diensten").textContent = f.proformaDiensten;
  }

  // ── VIEW ──
  function renderViewRegels() {
    $("zd-th-actie").hidden = true;
    $("zd-zzpcard").hidden = !(state.factuur.eigenFactuurnummer || state.factuur.extraGegevens || state.factuur.logoUrl);
    if (!$("zd-zzpcard").hidden) renderZzpReadonly();
    var tb = $("zd-regels");
    var regels = state.regels;
    if (!regels.length) { tb.innerHTML = '<tr><td colspan="7" class="table-empty">Geen diensten.</td></tr>'; return; }
    tb.innerHTML = regels.map(function (r) {
      var tijd = (fmtTime(r.startIso) && fmtTime(r.eindeIso)) ? (fmtTime(r.startIso) + "–" + fmtTime(r.eindeIso)) : "—";
      var cls = r.verwijderd ? "zd-removed" : (isChanged(r) ? "zd-changed" : "");
      var mark = r.verwijderd ? ' <span class="zd-sig zd-sig--oranje" title="verwijderd"></span>'
        : (isChanged(r) ? ' <span class="zd-sig zd-sig--rood" title="gewijzigd"></span>' : "");
      return '<tr class="' + cls + '">' +
        '<td class="zd-omschrijving">' + esc(r.dag || "") + "</td>" +
        "<td>" + esc(fmtDate(r.datum)) + "</td>" +
        "<td>" + tijd + "</td>" +
        '<td class="zd-num">' + (r.pauzeUren ? fmtUren(r.pauzeUren) : "—") + "</td>" +
        '<td class="zd-num">' + fmtUren(curUren(r)) + "</td>" +
        '<td class="zd-num">' + fmtTarief(curTarief(r)) + "</td>" +
        '<td class="zd-num"><strong>' + fmtEur(r.verwijderd ? 0 : curBedrag(r)) + "</strong>" + mark + "</td>" +
        "</tr>";
    }).join("");
    var totUren = regels.reduce(function (s, r) { return s + (r.verwijderd ? 0 : curUren(r)); }, 0);
    var totBedrag = regels.reduce(function (s, r) { return s + (r.verwijderd ? 0 : curBedrag(r)); }, 0);
    $("zd-foot-uren").textContent = fmtUren(totUren);
    $("zd-foot-bedrag").textContent = fmtEur(totBedrag);
    var afw = $("zd-foot-afw");
    if (Math.round(totBedrag * 100) !== Math.round(state.factuur.proformaBedrag * 100)) {
      afw.hidden = false;
      afw.className = "zd-afw";
      afw.innerHTML = "Afwijking t.o.v. proforma: <strong>" + fmtEur(totBedrag - state.factuur.proformaBedrag) + "</strong>";
    } else { afw.hidden = true; }
  }

  function renderZzpReadonly() {
    var f = state.factuur;
    $("zd-nummer").hidden = true; $("zd-nummer-ro").hidden = false;
    $("zd-nummer-ro").textContent = f.eigenFactuurnummer || "—";
    $("zd-logo").hidden = true;
    if (f.logoUrl) { $("zd-logo-prev").hidden = false; $("zd-logo-prev").src = f.logoUrl; } else { $("zd-logo-prev").hidden = true; }
    $("zd-extra").hidden = true; $("zd-extra-ro").hidden = false;
    var extra = f.extraGegevens && (f.extraGegevens.tekst || f.extraGegevens.opmerking);
    $("zd-extra-ro").textContent = extra || "—";
    $("zd-edit-hint").hidden = true;
  }

  // ── EDIT ──
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
    if (m === "edit") renderEdit(); else renderViewRegels();
  }

  function renderEdit() {
    var f = state.factuur;
    var card = $("zd-zzpcard"); card.hidden = false;
    $("zd-nummer").hidden = false; $("zd-nummer-ro").hidden = true;
    $("zd-nummer").value = f.eigenFactuurnummer || "";
    $("zd-logo").hidden = false;
    if (f.logoUrl) { $("zd-logo-prev").hidden = false; $("zd-logo-prev").src = f.logoUrl; } else { $("zd-logo-prev").hidden = true; }
    $("zd-extra").hidden = false; $("zd-extra-ro").hidden = true;
    $("zd-extra").value = (f.extraGegevens && (f.extraGegevens.tekst || f.extraGegevens.opmerking)) || "";
    $("zd-edit-hint").hidden = false;
    $("zd-th-actie").hidden = false;

    $("zd-logo").onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      state.logoFile = file || null;
      if (file) { var rd = new FileReader(); rd.onload = function (ev) { $("zd-logo-prev").hidden = false; $("zd-logo-prev").src = ev.target.result; }; rd.readAsDataURL(file); }
    };

    var tb = $("zd-regels");
    tb.innerHTML = state.work.map(function (r, i) {
      var tijd = (fmtTime(r.startIso) && fmtTime(r.eindeIso)) ? (fmtTime(r.startIso) + "–" + fmtTime(r.eindeIso)) : "—";
      return '<tr data-i="' + i + '"' + (r.verwijderd ? ' class="zd-removed"' : "") + ">" +
        '<td class="zd-omschrijving">' + esc(r.dag || "") + "</td>" +
        "<td>" + esc(fmtDate(r.datum)) + "</td>" +
        "<td>" + tijd + "</td>" +
        '<td class="zd-num">' + (r.pauzeUren ? fmtUren(r.pauzeUren) : "—") + "</td>" +
        '<td class="zd-num"><input class="zd-inp" data-field="uren" data-i="' + i + '" type="number" step="0.25" min="0" value="' + r.uren + '"' + (r.verwijderd ? " disabled" : "") + " /></td>" +
        '<td class="zd-num"><input class="zd-inp" data-field="tarief" data-i="' + i + '" type="number" step="0.01" min="0" value="' + r.tarief + '"' + (r.verwijderd ? " disabled" : "") + " /></td>" +
        '<td class="zd-num zd-bedrag" data-i="' + i + '"><strong>' + fmtEur(r.verwijderd ? 0 : r.uren * r.tarief) + "</strong></td>" +
        '<td class="zd-num"><button type="button" class="zd-del-btn' + (r.verwijderd ? " is-removed" : "") + '" data-i="' + i + '">' + (r.verwijderd ? "Terugzetten" : "Verwijderen") + "</button></td>" +
        "</tr>";
    }).join("");

    tb.oninput = function (e) {
      var inp = e.target.closest(".zd-inp"); if (!inp) return;
      var i = +inp.getAttribute("data-i"); var f2 = inp.getAttribute("data-field");
      state.work[i][f2] = parseFloat(inp.value) || 0;
      var cell = tb.querySelector('.zd-bedrag[data-i="' + i + '"]');
      if (cell) cell.innerHTML = "<strong>" + fmtEur(state.work[i].verwijderd ? 0 : state.work[i].uren * state.work[i].tarief) + "</strong>";
      recomputeFoot();
    };
    tb.onclick = function (e) {
      var btn = e.target.closest(".zd-del-btn"); if (!btn) return;
      var i = +btn.getAttribute("data-i");
      state.work[i].verwijderd = !state.work[i].verwijderd;
      renderEdit();
    };
    recomputeFoot();
  }

  function recomputeFoot() {
    var totUren = state.work.reduce(function (s, r) { return s + (r.verwijderd ? 0 : (r.uren || 0)); }, 0);
    var totBedrag = state.work.reduce(function (s, r) { return s + (r.verwijderd ? 0 : (r.uren || 0) * (r.tarief || 0)); }, 0);
    $("zd-foot-uren").textContent = fmtUren(totUren);
    $("zd-foot-bedrag").textContent = fmtEur(totBedrag);
    var rood = state.work.some(function (r) { return !r.verwijderd && (Math.round(r.uren * 100) !== Math.round(r.proformaUren * 100) || Math.round(r.tarief * 100) !== Math.round(r.proformaTarief * 100)); });
    var oranje = state.work.some(function (r) { return r.verwijderd; });
    var afw = $("zd-foot-afw"); afw.hidden = false; afw.className = "zd-sig-note";
    var diff = totBedrag - state.factuur.proformaBedrag;
    var parts = [];
    if (rood) parts.push('<span class="zd-sig zd-sig--rood"></span>tarief/bedrag gewijzigd');
    if (oranje) parts.push('<span class="zd-sig zd-sig--oranje"></span>dienst verwijderd');
    afw.innerHTML = (Math.round(diff * 100) !== 0 ? '<span class="zd-afw">Δ proforma: ' + fmtEur(diff) + "</span>  " : "") + parts.join("  ");
    if (!parts.length && Math.round(diff * 100) === 0) afw.hidden = true;
  }

  async function save(indienen) {
    var f = state.factuur;
    var opslaanBtn = $("zd-opslaan"), indienBtn = $("zd-indienen");
    if (opslaanBtn) opslaanBtn.disabled = true;
    if (indienBtn) indienBtn.disabled = true;
    try {
      var logoUrl = null;
      if (state.logoFile) logoUrl = await zzpFacturenDB.uploadLogo(f.id, state.logoFile);
      var regels = state.work.map(function (r) {
        return { id: r.id, ingediend_uren: r.uren, ingediend_tarief: r.tarief, verwijderd: !!r.verwijderd };
      });
      var extraTxt = ($("zd-extra").value || "").trim();
      await zzpFacturenDB.opslaan(f.id, {
        eigenFactuurnummer: ($("zd-nummer").value || "").trim(),
        logoUrl: logoUrl,
        extra: extraTxt ? { tekst: extraTxt } : null,
        regels: regels,
        indienen: !!indienen,
      });
      toast(indienen ? "Factuur ingediend." : "Concept opgeslagen.");
      await reload();
      setMode("view");
    } catch (e) {
      toast("Opslaan mislukt: " + (e && e.message ? e.message : e));
      if (opslaanBtn) opslaanBtn.disabled = false;
      if (indienBtn) indienBtn.disabled = false;
    }
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
    renderHeader(); renderKpis();
    if (state.mode === "edit") renderEdit(); else renderViewRegels();
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
