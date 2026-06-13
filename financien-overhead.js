/*
 * financien-overhead.js — Financiën › Overhead / kantoor.
 *
 * Beheer van de handmatige overheadkosten die NIET via de ZZP-planning lopen:
 *   • Overheadpersoneel (gedragswetenschappers, zorgcoördinator, HR, facilitair, …)
 *     — loondienst (bruto + werkgeverslasten → werkgeverskosten) of ZZP (maandbedrag).
 *   • Kantoorkosten / faciliteiten (huur, gas/water/licht, …) via financien_locatie_onkosten.
 *
 * Per geselecteerde maand/periode: totale overheadkosten, uitgesplitst naar personeel
 * en faciliteiten, met een maandgrafiek. CRUD via window.financienLocatiesDB.
 * Dezelfde kosten verschijnen op het tabblad Locaties bij de gekozen locatie.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function fmtEuro(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  var MND_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  var MND_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  function ymLabel(ym, long) {
    if (!ym || ym.length < 7) return "—";
    var y = ym.slice(0, 4), mi = parseInt(ym.slice(5, 7), 10) - 1;
    var nm = (long ? MND_LANG : MND_KORT)[mi] || "?";
    nm = nm.charAt(0).toUpperCase() + nm.slice(1);
    return nm + " " + y;
  }
  function ymShort(ym) {
    if (!ym || ym.length < 7) return "?";
    return (MND_KORT[parseInt(ym.slice(5, 7), 10) - 1] || "?") + " " + ym.slice(2, 4);
  }
  function ymIdx(ym) { return parseInt(ym.slice(0, 4), 10) * 12 + (parseInt(ym.slice(5, 7), 10) - 1); }
  function idxYm(i) { var y = Math.floor(i / 12), m = (i % 12) + 1; return y + "-" + (m < 10 ? "0" + m : String(m)); }
  function addMonthsYm(ym, n) { return idxYm(ymIdx(ym) + n); }
  function monthsBetween(minYm, maxYm) {
    var out = [];
    if (!minYm || !maxYm) return out;
    for (var i = ymIdx(minYm), e = ymIdx(maxYm); i <= e && out.length < 600; i++) out.push(idxYm(i));
    return out;
  }
  /** Aantal maanden dat een record [van..coalesce(tot,∞)] overlapt met periode [s..e]. */
  function maandenInPeriode(van, tot, s, e) {
    if (!van) return 0;
    var lo = Math.max(ymIdx(van), ymIdx(s));
    var hi = Math.min(tot ? ymIdx(tot) : ymIdx(e), ymIdx(e));
    return Math.max(0, hi - lo + 1);
  }
  /** Is het record actief in maand m? */
  function actiefInMaand(van, tot, m) {
    if (!van) return false;
    return ymIdx(van) <= ymIdx(m) && ymIdx(m) <= (tot ? ymIdx(tot) : ymIdx(m));
  }

  function nowYm() {
    var d = new Date();
    var m = d.getMonth() + 1;
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : String(m));
  }

  /* ---- state ---- */
  var mode = "maand";
  var selStart = null, selEnd = null;
  var winMin = null, winMax = null;
  var persRows = [];          // overhead-personeel
  var facRows = [];           // kantoorkosten (onkosten)
  var locNames = ["Kantoor"];
  var persEditId = null, facEditId = null;

  var DB = window.financienLocatiesDB;

  function periodeLabel() {
    if (!selStart) return "";
    if (selStart === selEnd) return ymLabel(selStart, true);
    return ymLabel(selStart, false) + " – " + ymLabel(selEnd, false);
  }

  function db() { return window.financienLocatiesDB; }

  /* ---- venster bepalen uit data + huidige maand ---- */
  function computeWindow() {
    var cur = nowYm();
    var lo = ymIdx(addMonthsYm(cur, -6)), hi = ymIdx(addMonthsYm(cur, 6));
    function consider(ym) { if (ym && ym.length >= 7) { lo = Math.min(lo, ymIdx(ym)); hi = Math.max(hi, ymIdx(ym)); } }
    persRows.concat(facRows).forEach(function (r) { consider(r.van_ym); consider(r.tot_ym); });
    winMin = idxYm(lo); winMax = idxYm(hi);
    if (!selStart) { selStart = selEnd = cur; }
  }

  /* ---- data laden ---- */
  function loadAll() {
    return Promise.all([db().listPersoneel(), db().listOnkosten(), db().locatieNamen()])
      .then(function (res) {
        persRows = res[0] || [];
        facRows = res[1] || [];
        var names = res[2] || [];
        // "Kantoor" altijd als (overhead-)keuze bovenaan
        var set = ["Kantoor"];
        names.forEach(function (n) { if (n && set.indexOf(n) < 0) set.push(n); });
        locNames = set;
        computeWindow();
      })
      .catch(function (e) { if (window.console) console.error("[overhead] laden mislukt", e); });
  }

  /* ---- periode-selector ---- */
  function fillMonthSelect(sel, months, selectedYm) {
    if (!sel) return; clear(sel);
    months.forEach(function (ym) {
      var o = el("option", null, ymLabel(ym, true)); o.value = ym;
      if (ym === selectedYm) o.selected = true;
      sel.appendChild(o);
    });
  }
  function syncControls() {
    var months = monthsBetween(winMin, winMax);
    if (!months.length) return;
    fillMonthSelect($("fin-maand"), months, selStart);
    fillMonthSelect($("fin-van"), months, selStart);
    fillMonthSelect($("fin-tot"), months, selEnd);
    var bm = $("fin-mode-maand"), bp = $("fin-mode-periode");
    if (bm && bp) {
      bm.classList.toggle("is-active", mode === "maand"); bm.setAttribute("aria-selected", mode === "maand");
      bp.classList.toggle("is-active", mode === "periode"); bp.setAttribute("aria-selected", mode === "periode");
    }
    var pm = $("fin-pick-maand"), pp = $("fin-pick-periode");
    if (pm) pm.hidden = mode !== "maand";
    if (pp) pp.hidden = mode !== "periode";
    var idx = months.indexOf(selStart);
    var prev = $("fin-prev"), next = $("fin-next");
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= months.length - 1;
  }

  /* ---- maandgrafiek ---- */
  function monthOverheadKosten(m) {
    var p = 0, f = 0;
    persRows.forEach(function (r) { if (actiefInMaand(r.van_ym, r.tot_ym, m)) p += Number(r.maandkost) || db().maandkostVan(r); });
    facRows.forEach(function (r) { if (actiefInMaand(r.van_ym, r.tot_ym, m)) f += Number(r.bedrag) || 0; });
    return { personeel: p, fac: f, totaal: p + f };
  }
  var tipEl = null;
  function ensureTip() { if (tipEl) return tipEl; tipEl = el("div", "bd-tip"); tipEl.hidden = true; document.body.appendChild(tipEl); return tipEl; }
  function showTip(html, x, y) {
    var t = ensureTip();
    if (html != null) t.innerHTML = html;
    t.hidden = false;
    var pad = 14, mrg = 8, w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var dx = x + pad, dy = y + pad;
    if (dx + w > vw - mrg) dx = x - w - pad; if (dx < mrg) dx = mrg;
    if (dy + h > vh - mrg) dy = y - h - pad; if (dy < mrg) dy = mrg;
    t.style.left = dx + "px"; t.style.top = dy + "px";
    // Zoom-correctie (html{zoom:1.1}): meet waar de tip echt landde en corrigeer
    // het verschil, zodat hij recht onder de muis blijft en niet buiten beeld
    // schuift. Zelfde patroon als beschikkingen-dashboard.js / financien-locaties.js.
    var rr = t.getBoundingClientRect();
    t.style.left = Math.round((parseFloat(t.style.left) || 0) + (dx - rr.left)) + "px";
    t.style.top = Math.round((parseFloat(t.style.top) || 0) + (dy - rr.top)) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function renderMonthChart() {
    var wrap = $("fin-mchart"); if (!wrap) return;
    clear(wrap);
    var months = monthsBetween(winMin, winMax).map(function (ym) {
      var k = monthOverheadKosten(ym); return { ym: ym, personeel: k.personeel, fac: k.fac, totaal: k.totaal };
    }).filter(function (mm) { return mm.totaal > 0 || mm.ym === selStart; });
    if (!months.length) { wrap.appendChild(el("div", "bd-hrow-empty", "Nog geen overheadkosten ingevoerd")); return; }
    var maxV = 0; months.forEach(function (m) { maxV = Math.max(maxV, m.totaal); });
    if (maxV <= 0) maxV = 1;
    months.forEach(function (m) {
      var col = el("button", "fin-mcol"); col.type = "button";
      if (selStart === selEnd && m.ym === selStart) col.classList.add("is-active");
      var bars = el("div", "fin-mcol-bars");
      var bk = el("div", "fin-mbar fin-mbar--kosten"); bk.style.height = (m.totaal / maxV * 100) + "%";
      bars.appendChild(bk); col.appendChild(bars);
      col.appendChild(el("div", "fin-mcol-lbl", ymShort(m.ym)));
      col.appendChild(el("div", "fin-mcol-res fin-neg", "− " + (m.totaal >= 1000 ? "€ " + Math.round(m.totaal / 1000) + "k" : "€ " + Math.round(m.totaal))));
      (function (md) {
        var html = '<div class="bd-tip-title">' + escapeHtml(ymLabel(md.ym, true)) + "</div>"
          + '<div class="bd-tip-row"><span class="bd-tip-nm">Personeel</span><span class="bd-tip-val">' + fmtEuro(md.personeel) + "</span></div>"
          + '<div class="bd-tip-row"><span class="bd-tip-nm">Kantoorkosten</span><span class="bd-tip-val">' + fmtEuro(md.fac) + "</span></div>"
          + '<div class="bd-tip-div"></div>'
          + '<div class="bd-tip-row bd-tip-row--total"><span class="bd-tip-nm">Totaal</span><span class="bd-tip-val">' + fmtEuro(md.totaal) + "</span></div>";
        col.addEventListener("mouseenter", function (ev) { showTip(html, ev.clientX, ev.clientY); });
        col.addEventListener("mousemove", function (ev) { showTip(null, ev.clientX, ev.clientY); });
        col.addEventListener("mouseleave", hideTip);
        col.addEventListener("click", function () { hideTip(); mode = "maand"; selStart = selEnd = md.ym; render(); });
      })(m);
      wrap.appendChild(col);
    });
  }

  /* ---- typelabel ---- */
  function typeLabel(t) { return t === "zzp" ? "ZZP" : "Loondienst"; }
  function recPeriodeLabel(r) {
    if (!r.tot_ym) return "vanaf " + ymShort(r.van_ym) + " (doorlopend)";
    if (r.tot_ym === r.van_ym) return ymLabel(r.van_ym, false);
    return ymShort(r.van_ym) + " – " + ymShort(r.tot_ym);
  }

  /* ---- personeel-tabel ---- */
  function renderPersTable() {
    var tb = $("fin-pers-tbody"); if (!tb) return;
    clear(tb);
    var sMaand = 0, sPer = 0;
    if (!persRows.length) {
      var tr0 = el("tr"); var td0 = el("td", "fin-empty"); td0.colSpan = 8;
      td0.textContent = "Nog geen overheadpersoneel ingevoerd. Klik op “+ Medewerker toevoegen”.";
      tr0.appendChild(td0); tb.appendChild(tr0);
      setText("fin-pers-foot-maand", ""); setText("fin-pers-foot-periode", "");
      return;
    }
    persRows.forEach(function (r) {
      var maand = Number(r.maandkost) || db().maandkostVan(r);
      var maanden = maandenInPeriode(r.van_ym, r.tot_ym, selStart, selEnd);
      var inPer = maand * maanden;
      sMaand += maand; sPer += inPer;
      var tr = el("tr", "fin-loc-row"); tr.tabIndex = 0; tr.setAttribute("role", "button");
      tr.appendChild(el("td", "bd-td-strong", r.naam || "—"));
      tr.appendChild(el("td", null, r.functie || "—"));
      tr.appendChild(el("td", null, typeLabel(r.dienstverband)));
      tr.appendChild(el("td", null, r.locatie || "Kantoor"));
      tr.appendChild(el("td", null, recPeriodeLabel(r)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(maand)));
      var tdP = el("td", "fin-num fin-eur" + (maanden ? "" : " fin-muted"), maanden ? fmtEuro(inPer) : "—");
      if (!maanden) tdP.title = "Valt buiten de geselecteerde periode";
      tr.appendChild(tdP);
      var tdA = el("td", "fin-onk-acties");
      var eb = el("button", "fin-icon-btn", "Bewerk"); eb.type = "button";
      eb.addEventListener("click", function (ev) { ev.stopPropagation(); openPersForm({ mode: "edit", row: r }); });
      var dbn = el("button", "fin-icon-btn fin-icon-btn--danger", "Verwijder"); dbn.type = "button";
      dbn.addEventListener("click", function (ev) { ev.stopPropagation(); confirmDeletePers(tdA, r); });
      tdA.appendChild(eb); tdA.appendChild(dbn); tr.appendChild(tdA);
      tr.addEventListener("click", function () { openPersForm({ mode: "edit", row: r }); });
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); openPersForm({ mode: "edit", row: r }); } });
      tb.appendChild(tr);
    });
    setText("fin-pers-foot-maand", fmtEuro(sMaand));
    setText("fin-pers-foot-periode", fmtEuro(sPer));
  }
  function confirmDeletePers(tdA, r) {
    clear(tdA);
    tdA.appendChild(el("span", "fin-onk-confirm", "Verwijderen?"));
    var yes = el("button", "fin-icon-btn fin-icon-btn--danger", "Ja"); yes.type = "button";
    var no = el("button", "fin-icon-btn", "Nee"); no.type = "button";
    yes.addEventListener("click", function (ev) { ev.stopPropagation(); doDeletePers(r); });
    no.addEventListener("click", function (ev) { ev.stopPropagation(); renderPersTable(); });
    tdA.appendChild(yes); tdA.appendChild(no);
  }
  function doDeletePers(r) {
    db().archivePersoneel(r.id).then(function () {
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Medewerker");
      reloadAndRender();
    }).catch(function (err) { if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message ? err.message : err)); });
  }

  /* ---- kantoorkosten-tabel ---- */
  function renderFacTable() {
    var tb = $("fin-fac-tbody"); if (!tb) return;
    clear(tb);
    var sMaand = 0, sPer = 0;
    if (!facRows.length) {
      var tr0 = el("tr"); var td0 = el("td", "fin-empty"); td0.colSpan = 7;
      td0.textContent = "Nog geen kantoorkosten ingevoerd. Klik op “+ Kostenpost toevoegen”.";
      tr0.appendChild(td0); tb.appendChild(tr0);
      setText("fin-fac-foot-maand", ""); setText("fin-fac-foot-periode", "");
      return;
    }
    facRows.forEach(function (r) {
      var maand = Number(r.bedrag) || 0;
      var maanden = maandenInPeriode(r.van_ym, r.tot_ym, selStart, selEnd);
      var inPer = maand * maanden;
      sMaand += maand; sPer += inPer;
      var tr = el("tr", "fin-loc-row"); tr.tabIndex = 0; tr.setAttribute("role", "button");
      tr.appendChild(el("td", null, r.locatie || "—"));
      tr.appendChild(el("td", "bd-td-strong", r.categorie || "—"));
      tr.appendChild(el("td", null, r.omschrijving || "—"));
      tr.appendChild(el("td", null, recPeriodeLabel(r)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(maand)));
      var tdP = el("td", "fin-num fin-eur" + (maanden ? "" : " fin-muted"), maanden ? fmtEuro(inPer) : "—");
      if (!maanden) tdP.title = "Valt buiten de geselecteerde periode";
      tr.appendChild(tdP);
      var tdA = el("td", "fin-onk-acties");
      var eb = el("button", "fin-icon-btn", "Bewerk"); eb.type = "button";
      eb.addEventListener("click", function (ev) { ev.stopPropagation(); openFacForm({ mode: "edit", row: r }); });
      var dbn = el("button", "fin-icon-btn fin-icon-btn--danger", "Verwijder"); dbn.type = "button";
      dbn.addEventListener("click", function (ev) { ev.stopPropagation(); confirmDeleteFac(tdA, r); });
      tdA.appendChild(eb); tdA.appendChild(dbn); tr.appendChild(tdA);
      tr.addEventListener("click", function () { openFacForm({ mode: "edit", row: r }); });
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); openFacForm({ mode: "edit", row: r }); } });
      tb.appendChild(tr);
    });
    setText("fin-fac-foot-maand", fmtEuro(sMaand));
    setText("fin-fac-foot-periode", fmtEuro(sPer));
  }
  function confirmDeleteFac(tdA, r) {
    clear(tdA);
    tdA.appendChild(el("span", "fin-onk-confirm", "Verwijderen?"));
    var yes = el("button", "fin-icon-btn fin-icon-btn--danger", "Ja"); yes.type = "button";
    var no = el("button", "fin-icon-btn", "Nee"); no.type = "button";
    yes.addEventListener("click", function (ev) { ev.stopPropagation(); doDeleteFac(r); });
    no.addEventListener("click", function (ev) { ev.stopPropagation(); renderFacTable(); });
    tdA.appendChild(yes); tdA.appendChild(no);
  }
  function doDeleteFac(r) {
    db().archiveOnkost(r.id).then(function () {
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Kostenpost");
      reloadAndRender();
    }).catch(function (err) { if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message ? err.message : err)); });
  }

  /* ---- KPI's ---- */
  function renderKpis() {
    var p = 0, f = 0;
    persRows.forEach(function (r) {
      var maand = Number(r.maandkost) || db().maandkostVan(r);
      p += maand * maandenInPeriode(r.van_ym, r.tot_ym, selStart, selEnd);
    });
    facRows.forEach(function (r) {
      f += (Number(r.bedrag) || 0) * maandenInPeriode(r.van_ym, r.tot_ym, selStart, selEnd);
    });
    setText("fin-period-lbl", periodeLabel());
    setText("fin-v-totaal", fmtEuro(p + f));
    setText("fin-totaal-sub", "Personeel " + fmtEuro(p) + " · Kantoor " + fmtEuro(f));
    setText("fin-v-pers", fmtEuro(p));
    setText("fin-pers-sub", persRows.length + " medewerker" + (persRows.length === 1 ? "" : "s"));
    setText("fin-v-fac", fmtEuro(f));
    setText("fin-fac-sub", facRows.length + " kostenpost" + (facRows.length === 1 ? "" : "en"));
  }

  /* ---- maand-selects in formulieren ---- */
  function fillFormMonths(vanSel, totSel, vanYm, totYm) {
    var months = monthsBetween(winMin, addMonthsYm(winMax, 1));
    fillMonthSelect(vanSel, months, vanYm || selStart);
    fillMonthSelect(totSel, months, totYm || vanYm || selStart);
  }

  /* ---- personeel-formulier ---- */
  function fillLocSelect(sel, selected) {
    if (!sel) return; clear(sel);
    locNames.forEach(function (n) { var o = el("option", null, n); o.value = n; if (n === selected) o.selected = true; sel.appendChild(o); });
  }
  function persTypeToggle() {
    var t = $("fin-pers-type").value;
    var ld = $("fin-pers-loondienst"), zz = $("fin-pers-zzp");
    if (ld) ld.hidden = (t === "zzp");
    if (zz) zz.hidden = (t !== "zzp");
    updatePersCost();
  }
  function updatePersCost() {
    var t = $("fin-pers-type").value;
    var maand, sub = "";
    if (t === "zzp") {
      maand = parseFloat($("fin-pers-zzpbedrag").value) || 0;
      sub = "ZZP-maandbedrag";
    } else {
      var bruto = parseFloat($("fin-pers-bruto").value) || 0;
      var wgl = parseFloat($("fin-pers-wgl").value) || 0;
      maand = bruto * (1 + wgl / 100);
      var netto = parseFloat($("fin-pers-netto").value);
      sub = "Bruto " + fmtEuro(bruto) + " + " + (Math.round(wgl * 10) / 10) + "% werkgeverslasten";
      if (!isNaN(netto) && netto > 0) sub += " · netto ~ " + fmtEuro(netto);
    }
    setText("fin-pers-cost-val", fmtEuro(maand));
    setText("fin-pers-cost-sub", sub);
  }
  function openPersForm(opts) {
    opts = opts || {};
    var row = opts.row || {};
    persEditId = (opts.mode === "edit" && row.id) ? row.id : null;
    setText("fin-pers-title", persEditId ? "Medewerker bewerken" : "Medewerker toevoegen");
    var err = $("fin-pers-err"); if (err) err.hidden = true;
    $("fin-pers-naam").value = row.naam || "";
    $("fin-pers-functie").value = row.functie || "";
    $("fin-pers-type").value = row.dienstverband || "loondienst";
    fillLocSelect($("fin-pers-loc"), row.locatie || "Kantoor");
    $("fin-pers-bruto").value = (row.bruto_maand != null && Number(row.bruto_maand)) ? row.bruto_maand : "";
    $("fin-pers-wgl").value = (row.werkgeverslasten_pct != null) ? row.werkgeverslasten_pct : 30;
    $("fin-pers-netto").value = (row.netto_maand != null) ? row.netto_maand : "";
    $("fin-pers-zzpbedrag").value = (row.zzp_maand != null && Number(row.zzp_maand)) ? row.zzp_maand : "";
    $("fin-pers-doorlopend").checked = persEditId ? (row.tot_ym == null) : true;
    fillFormMonths($("fin-pers-van"), $("fin-pers-tot"), row.van_ym || selStart, row.tot_ym || row.van_ym || selStart);
    persTypeToggle();
    applyPersDoorlopend();
    var m = $("fin-pers-modal"); if (m) m.hidden = false;
    document.body.classList.add("bd-modal-open");
    setTimeout(function () { var n = $("fin-pers-naam"); if (n) n.focus(); }, 60);
  }
  function applyPersDoorlopend() {
    var d = $("fin-pers-doorlopend") && $("fin-pers-doorlopend").checked;
    var tot = $("fin-pers-tot"), wrap = $("fin-pers-totwrap");
    if (tot) tot.disabled = !!d;
    if (wrap) wrap.style.opacity = d ? "0.45" : "";
  }
  function closePersForm() {
    var m = $("fin-pers-modal"); if (m) m.hidden = true;
    var f = $("fin-fac-modal");
    if (!f || f.hidden) document.body.classList.remove("bd-modal-open");
  }
  function savePers(e) {
    if (e) e.preventDefault();
    var err = $("fin-pers-err");
    function showErr(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    var naam = ($("fin-pers-naam").value || "").trim();
    var type = $("fin-pers-type").value;
    var loc = $("fin-pers-loc").value || "Kantoor";
    var doorl = $("fin-pers-doorlopend").checked;
    var van = $("fin-pers-van").value;
    var tot = doorl ? null : $("fin-pers-tot").value;
    if (!naam) return showErr("Vul een naam in.");
    if (!van) return showErr("Kies een 'vanaf'-maand.");
    if (tot && tot < van) return showErr("'T/m'-maand mag niet vóór de 'vanaf'-maand liggen.");
    var bruto = parseFloat($("fin-pers-bruto").value) || 0;
    var wgl = parseFloat($("fin-pers-wgl").value);
    var netto = parseFloat($("fin-pers-netto").value);
    var zzp = parseFloat($("fin-pers-zzpbedrag").value) || 0;
    if (type === "zzp") { if (!(zzp > 0)) return showErr("Vul een ZZP-maandbedrag groter dan € 0 in."); }
    else { if (!(bruto > 0)) return showErr("Vul een bruto maandsalaris groter dan € 0 in."); }
    var payload = {
      naam: naam, functie: ($("fin-pers-functie").value || "").trim() || null, dienstverband: type, locatie: loc,
      bruto_maand: type === "zzp" ? 0 : bruto,
      werkgeverslasten_pct: isNaN(wgl) ? 30 : wgl,
      netto_maand: (type === "zzp" || isNaN(netto)) ? null : netto,
      zzp_maand: type === "zzp" ? zzp : 0,
      van_ym: van, tot_ym: tot,
    };
    var btn = $("fin-pers-save"); if (btn) btn.disabled = true;
    var p = persEditId ? db().updatePersoneel(persEditId, payload) : db().addPersoneel(payload);
    p.then(function () {
      if (btn) btn.disabled = false;
      closePersForm();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Medewerker");
      reloadAndRender();
    }).catch(function (er) {
      if (btn) btn.disabled = false;
      showErr("Opslaan mislukt: " + (er && er.message ? er.message : er));
    });
  }

  /* ---- kantoorkosten-formulier ---- */
  function openFacForm(opts) {
    opts = opts || {};
    var row = opts.row || {};
    facEditId = (opts.mode === "edit" && row.id) ? row.id : null;
    setText("fin-fac-title", facEditId ? "Kostenpost bewerken" : "Kostenpost toevoegen");
    var err = $("fin-fac-err"); if (err) err.hidden = true;
    fillLocSelect($("fin-fac-loc"), row.locatie || "Kantoor");
    $("fin-fac-cat").value = row.categorie || "Huur";
    $("fin-fac-oms").value = row.omschrijving || "";
    $("fin-fac-bedrag").value = (row.bedrag != null && Number(row.bedrag)) ? row.bedrag : "";
    $("fin-fac-doorlopend").checked = facEditId ? (row.tot_ym == null) : true;
    fillFormMonths($("fin-fac-van"), $("fin-fac-tot"), row.van_ym || selStart, row.tot_ym || row.van_ym || selStart);
    applyFacDoorlopend();
    var m = $("fin-fac-modal"); if (m) m.hidden = false;
    document.body.classList.add("bd-modal-open");
    setTimeout(function () { var b = $("fin-fac-bedrag"); if (b) b.focus(); }, 60);
  }
  function applyFacDoorlopend() {
    var d = $("fin-fac-doorlopend") && $("fin-fac-doorlopend").checked;
    var tot = $("fin-fac-tot"), wrap = $("fin-fac-totwrap");
    if (tot) tot.disabled = !!d;
    if (wrap) wrap.style.opacity = d ? "0.45" : "";
  }
  function closeFacForm() {
    var m = $("fin-fac-modal"); if (m) m.hidden = true;
    var p = $("fin-pers-modal");
    if (!p || p.hidden) document.body.classList.remove("bd-modal-open");
  }
  function saveFac(e) {
    if (e) e.preventDefault();
    var err = $("fin-fac-err");
    function showErr(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    var loc = $("fin-fac-loc").value || "Kantoor";
    var cat = $("fin-fac-cat").value;
    var oms = ($("fin-fac-oms").value || "").trim();
    var bedrag = parseFloat($("fin-fac-bedrag").value);
    var doorl = $("fin-fac-doorlopend").checked;
    var van = $("fin-fac-van").value;
    var tot = doorl ? null : $("fin-fac-tot").value;
    if (!loc) return showErr("Kies een locatie.");
    if (!(bedrag > 0)) return showErr("Vul een bedrag groter dan € 0 in.");
    if (!van) return showErr("Kies een 'vanaf'-maand.");
    if (tot && tot < van) return showErr("'T/m'-maand mag niet vóór de 'vanaf'-maand liggen.");
    var payload = { locatie: loc, categorie: cat, omschrijving: oms || null, bedrag: bedrag, van_ym: van, tot_ym: tot };
    var btn = $("fin-fac-save"); if (btn) btn.disabled = true;
    var p = facEditId ? db().updateOnkost(facEditId, payload) : db().addOnkost(payload);
    p.then(function () {
      if (btn) btn.disabled = false;
      closeFacForm();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Kostenpost");
      reloadAndRender();
    }).catch(function (er) {
      if (btn) btn.disabled = false;
      showErr("Opslaan mislukt: " + (er && er.message ? er.message : er));
    });
  }

  /* ---- render ---- */
  function render() {
    syncControls();
    renderKpis();
    renderMonthChart();
    renderPersTable();
    renderFacTable();
  }
  function reloadAndRender() { return loadAll().then(render); }

  /* ---- wiring ---- */
  function wire() {
    var bm = $("fin-mode-maand"), bp = $("fin-mode-periode");
    if (bm) bm.addEventListener("click", function () { mode = "maand"; selEnd = selStart; render(); });
    if (bp) bp.addEventListener("click", function () { mode = "periode"; syncControls(); });
    var maand = $("fin-maand");
    if (maand) maand.addEventListener("change", function () { selStart = selEnd = maand.value; render(); });
    function step(delta) {
      var months = monthsBetween(winMin, winMax);
      var idx = months.indexOf(selStart);
      if (idx < 0) return;
      var ni = idx + delta; if (ni < 0 || ni >= months.length) return;
      selStart = selEnd = months[ni]; render();
    }
    var prev = $("fin-prev"), next = $("fin-next");
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
    var van = $("fin-van"), tot = $("fin-tot");
    function rangeChange() {
      var a = van.value, b = tot.value; if (a > b) { var t = a; a = b; b = t; }
      selStart = a; selEnd = b; render();
    }
    if (van) van.addEventListener("change", rangeChange);
    if (tot) tot.addEventListener("change", rangeChange);

    // personeel
    var addP = $("fin-add-pers"); if (addP) addP.addEventListener("click", function () { openPersForm({ mode: "add" }); });
    var pX = $("fin-pers-x"); if (pX) pX.addEventListener("click", closePersForm);
    var pC = $("fin-pers-cancel"); if (pC) pC.addEventListener("click", closePersForm);
    var pB = $("fin-pers-backdrop"); if (pB) pB.addEventListener("click", closePersForm);
    var pF = $("fin-pers-form"); if (pF) pF.addEventListener("submit", savePers);
    var pT = $("fin-pers-type"); if (pT) pT.addEventListener("change", persTypeToggle);
    ["fin-pers-bruto", "fin-pers-wgl", "fin-pers-netto", "fin-pers-zzpbedrag"].forEach(function (id) {
      var n = $(id); if (n) n.addEventListener("input", updatePersCost);
    });
    var pD = $("fin-pers-doorlopend"); if (pD) pD.addEventListener("change", applyPersDoorlopend);

    // kantoorkosten
    var addF = $("fin-add-fac"); if (addF) addF.addEventListener("click", function () { openFacForm({ mode: "add" }); });
    var fX = $("fin-fac-x"); if (fX) fX.addEventListener("click", closeFacForm);
    var fC = $("fin-fac-cancel"); if (fC) fC.addEventListener("click", closeFacForm);
    var fB = $("fin-fac-backdrop"); if (fB) fB.addEventListener("click", closeFacForm);
    var fF = $("fin-fac-form"); if (fF) fF.addEventListener("submit", saveFac);
    var fD = $("fin-fac-doorlopend"); if (fD) fD.addEventListener("change", applyFacDoorlopend);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var pm = $("fin-pers-modal"); if (pm && !pm.hidden) { closePersForm(); return; }
      var fm = $("fin-fac-modal"); if (fm && !fm.hidden) { closeFacForm(); return; }
    });
  }

  function renderNoAccess() {
    var main = $("fin-body"); if (!main) return;
    clear(main);
    var box = el("div", "fin-note");
    box.appendChild(el("strong", null, "Geen toegang. "));
    box.appendChild(document.createTextNode("Financiën is alleen beschikbaar voor Eigenaar, Directeur en Finance."));
    main.appendChild(box);
  }

  async function init() {
    if (!window.financienLocatiesDB) { renderNoAccess(); return; }
    wire();
    try { if (window.ffSupabaseReady) await window.ffSupabaseReady; } catch (e) { /* doorgaan */ }
    await loadAll();
    // Toegangscheck: een niet-bevoegde user krijgt door RLS 0 rijen + de RPC weigert.
    // We doen een lichte dashboard-check om "geen toegang" netjes te tonen.
    try {
      var d = await window.financienLocatiesDB.load(null, null);
      if (d && d.unauthorized) { renderNoAccess(); return; }
    } catch (e) { /* val terug op gewone render */ }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
