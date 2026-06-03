/*
 * financien-locaties.js — Financiën › Locaties (winst/verlies per locatie per maand).
 *
 * Toont per GESELECTEERDE maand (of periode), per locatie:
 *   • Kosten   = ingehuurde ZZP-diensten uit de planning (netto-uren × uurtarief).
 *   • Opbrengst = beschikkingen-omzet (betaald + gedeclareerd-open + nog-te-declareren).
 *   • Resultaat = opbrengst − kosten, met marge%.
 * Alle cijfers uit window.financienLocatiesDB (RPC financien_locaties_dashboard).
 * Klik op een locatie → drill-down met de ingezette ZZP'ers en de cliënten/beschikkingen.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }
  function setHTML(id, h) { var n = $(id); if (n) n.innerHTML = h; }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function fmtEuro(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) { return (Math.round(Number(n) || 0)).toLocaleString("nl-NL"); }
  function fmtUur(n) {
    var v = Math.round((Number(n) || 0) * 10) / 10;
    return v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }
  function fmtPct(n) { return (n == null) ? "—" : (Math.round(Number(n) * 10) / 10).toLocaleString("nl-NL") + "%"; }
  function euTickSigned(v) {
    v = Number(v) || 0; var sign = v < 0 ? "−" : "+"; var a = Math.abs(v);
    var t = a >= 1000 ? "€ " + Math.round(a / 1000) + "k" : "€ " + Math.round(a);
    return sign + " " + t;
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
  function monthsBetween(minYm, maxYm) {
    var out = [];
    if (!minYm || !maxYm) return out;
    var y = parseInt(minYm.slice(0, 4), 10), m = parseInt(minYm.slice(5, 7), 10);
    var ey = parseInt(maxYm.slice(0, 4), 10), em = parseInt(maxYm.slice(5, 7), 10);
    var guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 600) {
      out.push(y + "-" + (m < 10 ? "0" + m : String(m)));
      m += 1; if (m > 12) { m = 1; y += 1; } guard += 1;
    }
    return out;
  }

  function addMonthsYm(ym, n) {
    if (!ym || ym.length < 7) return ym;
    var y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + (m + 1 < 10 ? "0" + (m + 1) : String(m + 1));
  }

  /* ---- state ---- */
  var mode = "maand";
  var selStart = null, selEnd = null;
  var winMin = null, winMax = null;
  var openLoc = null;          // naam van de locatie waarvan de drill-down open is (voor refresh)
  var onkEditId = null;        // id van de onkost die bewerkt wordt (null = nieuwe)

  function curData() { return (window.financienLocatiesDB && window.financienLocatiesDB.getData()) || null; }
  function periodeLabel() {
    if (!selStart) return "";
    if (selStart === selEnd) return ymLabel(selStart, true);
    return ymLabel(selStart, false) + " – " + ymLabel(selEnd, false);
  }

  /* ---- hover-tooltip ---- */
  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = el("div", "bd-tip"); tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(html, x, y) {
    var t = ensureTip();
    if (html != null) t.innerHTML = html;
    t.hidden = false;
    var pad = 14, m = 8, w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var dx = x + pad, dy = y + pad;
    if (dx + w > vw - m) dx = x - w - pad;
    if (dx < m) dx = m;
    if (dy + h > vh - m) dy = y - h - pad;
    if (dy < m) dy = m;
    t.style.left = dx + "px"; t.style.top = dy + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  /* ---- maandgrafiek: opbrengst vs kosten + resultaat ---- */
  function monthTip(m) {
    var res = Number(m.resultaat) || 0;
    return '<div class="bd-tip-title">' + esc(ymLabel(m.ym, true)) + "</div>"
      + '<div class="bd-tip-row"><span class="bd-tip-sw" style="background:var(--green)"></span><span class="bd-tip-nm">Opbrengst</span><span class="bd-tip-val">' + fmtEuro(m.omzet) + "</span></div>"
      + '<div class="bd-tip-row"><span class="bd-tip-sw" style="background:var(--red)"></span><span class="bd-tip-nm">Kosten (ZZP)</span><span class="bd-tip-val">' + fmtEuro(m.kosten) + "</span></div>"
      + '<div class="bd-tip-div"></div>'
      + '<div class="bd-tip-row bd-tip-row--total"><span class="bd-tip-sw" style="background:transparent"></span><span class="bd-tip-nm">' + (res >= 0 ? "Winst" : "Verlies") + '</span><span class="bd-tip-val">' + fmtEuro(res) + "</span></div>";
  }
  function renderMonthChart(months) {
    var wrap = $("fin-mchart"); if (!wrap) return;
    clear(wrap);
    if (!months.length) { wrap.appendChild(el("div", "bd-hrow-empty", "Geen gegevens in deze periode")); return; }
    var maxV = 0;
    months.forEach(function (m) { maxV = Math.max(maxV, Math.abs(m.omzet || 0), Math.abs(m.kosten || 0)); });
    if (maxV <= 0) maxV = 1;
    months.forEach(function (m) {
      var col = el("button", "fin-mcol"); col.type = "button";
      if (selStart === selEnd && m.ym === selStart) col.classList.add("is-active");
      var bars = el("div", "fin-mcol-bars");
      var bo = el("div", "fin-mbar fin-mbar--omzet"); bo.style.height = (Math.max(0, m.omzet || 0) / maxV * 100) + "%";
      var bk = el("div", "fin-mbar fin-mbar--kosten"); bk.style.height = (Math.max(0, m.kosten || 0) / maxV * 100) + "%";
      bars.appendChild(bo); bars.appendChild(bk);
      col.appendChild(bars);
      col.appendChild(el("div", "fin-mcol-lbl", ymShort(m.ym)));
      var res = Number(m.resultaat) || 0;
      col.appendChild(el("div", "fin-mcol-res " + (res >= 0 ? "fin-pos" : "fin-neg"), euTickSigned(res)));
      (function (md) {
        col.addEventListener("mouseenter", function (ev) { showTip(monthTip(md), ev.clientX, ev.clientY); });
        col.addEventListener("mousemove", function (ev) { showTip(null, ev.clientX, ev.clientY); });
        col.addEventListener("mouseleave", hideTip);
        col.addEventListener("click", function () { hideTip(); mode = "maand"; selStart = selEnd = md.ym; reload(); });
      })(m);
      wrap.appendChild(col);
    });
  }

  /* ---- per-locatie tabel ---- */
  function renderLocTable(locations) {
    var tb = $("fin-loc-tbody"); if (!tb) return;
    clear(tb);
    if (!locations.length) {
      var tr0 = el("tr"); var td0 = el("td", "fin-empty"); td0.colSpan = 8;
      td0.textContent = "Geen kosten of opbrengst in deze periode."; tr0.appendChild(td0); tb.appendChild(tr0);
      ["fin-foot-zzp", "fin-foot-onk", "fin-foot-kosten", "fin-foot-omzet", "fin-foot-result"].forEach(function (id) { setText(id, ""); });
      return;
    }
    var tOmzet = 0, tKosten = 0, tZzp = 0, tOnk = 0;
    locations.forEach(function (l) {
      tOmzet += Number(l.omzet) || 0; tKosten += Number(l.kosten) || 0;
      tZzp += Number(l.kosten_zzp) || 0; tOnk += Number(l.onkosten) || 0;
      var res = Number(l.resultaat) || 0;
      var tr = el("tr", "fin-loc-row"); tr.tabIndex = 0; tr.setAttribute("role", "button");
      tr.setAttribute("aria-label", l.name + " — details");

      var tdN = el("td", "fin-loc-name");
      var dot = el("span", "fin-loc-dot"); dot.style.background = l.kleur || "var(--blue)";
      tdN.appendChild(dot); tdN.appendChild(el("span", null, l.name));
      tr.appendChild(tdN);

      tr.appendChild(el("td", "fin-num", fmtInt(l.zzpers)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(l.kosten_zzp)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(l.onkosten)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(l.kosten)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(l.omzet)));
      tr.appendChild(el("td", "fin-num fin-eur " + (res >= 0 ? "fin-pos" : "fin-neg"), fmtEuro(res)));
      tr.appendChild(el("td", "fin-num " + (res >= 0 ? "fin-pos" : "fin-neg"), fmtPct(l.marge_pct)));

      (function (naam) {
        tr.addEventListener("click", function () { openDetail(naam); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(naam); } });
      })(l.name);
      tb.appendChild(tr);
    });
    setText("fin-foot-zzp", fmtEuro(tZzp));
    setText("fin-foot-onk", fmtEuro(tOnk));
    setText("fin-foot-kosten", fmtEuro(tKosten));
    setText("fin-foot-omzet", fmtEuro(tOmzet));
    var tRes = tOmzet - tKosten;
    var foot = $("fin-foot-result");
    if (foot) { foot.textContent = fmtEuro(tRes); foot.className = "fin-num fin-eur " + (tRes >= 0 ? "fin-pos" : "fin-neg"); }
  }

  function curLoc(name) {
    var d = curData();
    if (!d || !d.locations) return null;
    for (var i = 0; i < d.locations.length; i++) if (d.locations[i].name === name) return d.locations[i];
    return null;
  }

  /* ---- modal ---- */
  function openModal(title, sub) {
    var m = $("bd-modal"); if (!m) return null;
    setText("bd-modal-title", title || "Details");
    setText("bd-modal-sub", sub || "");
    var body = $("bd-modal-body"); clear(body);
    m.hidden = false; document.body.classList.add("bd-modal-open");
    return body;
  }
  function closeModal() {
    var m = $("bd-modal"); if (m) m.hidden = true;
    openLoc = null;
    document.body.classList.remove("bd-modal-open");
  }
  function emptyRow(body, txt) { body.appendChild(el("p", "bd-modal-empty", txt || "Geen gegevens.")); }
  function buildTable(headers) {
    var tbl = el("table", "bd-modal-tbl");
    var thead = el("thead"), tr = el("tr");
    headers.forEach(function (h) { var th = el("th", null, h.label); if (h.num) th.className = "fin-num"; tr.appendChild(th); });
    thead.appendChild(tr); tbl.appendChild(thead);
    var tb = el("tbody"); tbl.appendChild(tb);
    return { tbl: tbl, tb: tb };
  }
  function tariefLabel(c) {
    var v = Number(c.tarief_eur) || 0;
    if (!v) return "—";
    return fmtEuro(v) + " /" + (c.tarief_eenheid || "?");
  }

  function openDetail(locName) {
    var loc = curLoc(locName);
    if (!loc) return;
    openLoc = locName;
    var res0 = Number(loc.resultaat) || 0;
    var body = openModal(loc.name, periodeLabel());
    if (!body) return;

    // Samenvatting-strip (uit de reeds geladen dashboard-cijfers)
    var sum = el("div", "fin-sum");
    function stat(label, value, cls, sub) {
      var b = el("div", "fin-sum-item");
      b.appendChild(el("span", "fin-sum-lbl", label));
      b.appendChild(el("span", "fin-sum-val " + (cls || ""), value));
      if (sub) b.appendChild(el("span", "fin-sum-sub", sub));
      return b;
    }
    sum.appendChild(stat("Opbrengst", fmtEuro(loc.omzet), "",
      "Betaald " + fmtEuro(loc.paid) + " · Open " + fmtEuro(loc.pending) + " · Nog te declareren " + fmtEuro(loc.to_declare)));
    sum.appendChild(stat("Kosten", fmtEuro(loc.kosten), "",
      "ZZP " + fmtEuro(loc.kosten_zzp) + " · Onkosten " + fmtEuro(loc.onkosten) + " · " + fmtInt(loc.zzpers) + " ZZP'ers · " + fmtUur(loc.uren) + " uur"));
    sum.appendChild(stat("Resultaat", fmtEuro(res0), (res0 >= 0 ? "fin-pos" : "fin-neg"),
      (res0 >= 0 ? "Winst" : "Verlies") + (loc.marge_pct != null ? " · marge " + fmtPct(loc.marge_pct) : "")));
    body.appendChild(sum);

    body.appendChild(el("p", "bd-mrow-loading", "Laden…"));

    window.financienLocatiesDB.detail(loc.name, selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null).then(function (d) {
      // verwijder loader (laatste element)
      if (body.lastChild) body.removeChild(body.lastChild);
      if (!d || d.unauthorized) { emptyRow(body, "Geen toegang tot deze gegevens."); return; }

      // Overige onkosten (bewerkbaar)
      renderOnkSection(body, loc.name, d.onkosten || []);

      // ZZP'ers
      body.appendChild(el("h3", "fin-sec-h", "Ingezette ZZP'ers"));
      var zz = d.zzpers || [];
      if (!zz.length) { emptyRow(body, "Geen ZZP-diensten in deze periode."); }
      else {
        var tz = buildTable([{ label: "ZZP'er" }, { label: "Uren", num: true }, { label: "Uurtarief", num: true }, { label: "Kosten", num: true }]);
        var sumK = 0;
        zz.forEach(function (z) {
          sumK += Number(z.kosten) || 0;
          var tr = el("tr");
          tr.appendChild(el("td", "bd-td-strong", z.naam || "—"));
          tr.appendChild(el("td", "fin-num", fmtUur(z.uren)));
          tr.appendChild(el("td", "fin-num", fmtEuro(z.tarief)));
          tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(z.kosten)));
          tz.tb.appendChild(tr);
        });
        var tf = el("tfoot"), trf = el("tr");
        trf.appendChild(el("td", "bd-td-strong", "Totaal (" + zz.length + ")"));
        trf.appendChild(el("td", null, ""));
        trf.appendChild(el("td", null, ""));
        trf.appendChild(el("td", "fin-num fin-eur bd-td-strong", fmtEuro(sumK)));
        tf.appendChild(trf); tz.tbl.appendChild(tf);
        body.appendChild(tz.tbl);
      }

      // Cliënten / beschikkingen
      body.appendChild(el("h3", "fin-sec-h", "Cliënten & beschikkingen"));
      var cl = d.clienten || [];
      if (!cl.length) { emptyRow(body, "Geen beschikkingen-omzet in deze periode."); }
      else {
        var tc = buildTable([{ label: "Cliënt" }, { label: "Beschikking" }, { label: "Zorgsoort" }, { label: "Tarief", num: true }, { label: "Opbrengst", num: true }]);
        var sumO = 0;
        cl.forEach(function (c) {
          sumO += Number(c.omzet) || 0;
          var tr = el("tr");
          tr.appendChild(el("td", "bd-td-strong", c.client || "—"));
          tr.appendChild(el("td", null, c.beschikking || "—"));
          tr.appendChild(el("td", null, c.zorgsoort || "—"));
          tr.appendChild(el("td", "fin-num", tariefLabel(c)));
          var tdO = el("td", "fin-num fin-eur", fmtEuro(c.omzet));
          tdO.title = "Betaald " + fmtEuro(c.paid) + " · Open " + fmtEuro(c.pending) + " · Nog te declareren " + fmtEuro(c.to_declare);
          tr.appendChild(tdO);
          tc.tb.appendChild(tr);
        });
        var tf2 = el("tfoot"), trf2 = el("tr");
        trf2.appendChild(el("td", "bd-td-strong", "Totaal (" + cl.length + ")"));
        trf2.appendChild(el("td", null, "")); trf2.appendChild(el("td", null, "")); trf2.appendChild(el("td", null, ""));
        trf2.appendChild(el("td", "fin-num fin-eur bd-td-strong", fmtEuro(sumO)));
        tf2.appendChild(trf2); tc.tbl.appendChild(tf2);
        body.appendChild(tc.tbl);
        body.appendChild(el("p", "bd-mrow-note", "Opbrengst = betaald + gedeclareerd-open + nog-te-declareren (schatting o.b.v. eigen factuurhistorie van de beschikking). Beweeg over een bedrag voor de uitsplitsing."));
      }
    });
  }

  /* ---- overige onkosten ---- */
  function onkPeriodeLabel(o) {
    if (!o.tot_ym) return "vanaf " + ymShort(o.van_ym) + " (doorlopend)";
    if (o.tot_ym === o.van_ym) return ymLabel(o.van_ym, false);
    return ymShort(o.van_ym) + " – " + ymShort(o.tot_ym);
  }
  function renderOnkSection(body, locName, rows) {
    var head = el("div", "fin-sec-head");
    head.appendChild(el("h3", "fin-sec-h", "Overige onkosten"));
    var addBtn = el("button", "btn-outline fin-sec-add", "+ Toevoegen"); addBtn.type = "button";
    addBtn.addEventListener("click", function () { openOnkForm({ mode: "add", loc: locName }); });
    head.appendChild(addBtn);
    body.appendChild(head);
    if (!rows.length) { emptyRow(body, "Nog geen onkosten voor deze locatie in deze periode."); return; }
    var t = buildTable([{ label: "Categorie" }, { label: "Omschrijving" }, { label: "Periode" }, { label: "€/maand", num: true }, { label: "In periode", num: true }, { label: "" }]);
    var sum = 0;
    rows.forEach(function (o) {
      sum += Number(o.bedrag_periode) || 0;
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", o.categorie || "—"));
      tr.appendChild(el("td", null, o.omschrijving || "—"));
      tr.appendChild(el("td", null, onkPeriodeLabel(o)));
      tr.appendChild(el("td", "fin-num", fmtEuro(o.bedrag)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(o.bedrag_periode)));
      var tdA = el("td", "fin-onk-acties");
      var eb = el("button", "fin-icon-btn", "Bewerk"); eb.type = "button";
      eb.addEventListener("click", function () { openOnkForm({ mode: "edit", loc: locName, row: o }); });
      var db = el("button", "fin-icon-btn fin-icon-btn--danger", "Verwijder"); db.type = "button";
      db.addEventListener("click", function () {
        clear(tdA);
        tdA.appendChild(el("span", "fin-onk-confirm", "Verwijderen?"));
        var yes = el("button", "fin-icon-btn fin-icon-btn--danger", "Ja"); yes.type = "button";
        var no = el("button", "fin-icon-btn", "Nee"); no.type = "button";
        yes.addEventListener("click", function () { doDeleteOnk(o); });
        no.addEventListener("click", function () { if (openLoc) openDetail(openLoc); });
        tdA.appendChild(yes); tdA.appendChild(no);
      });
      tdA.appendChild(eb); tdA.appendChild(db); tr.appendChild(tdA);
      t.tb.appendChild(tr);
    });
    var tf = el("tfoot"), trf = el("tr");
    trf.appendChild(el("td", "bd-td-strong", "Totaal onkosten"));
    trf.appendChild(el("td", null, "")); trf.appendChild(el("td", null, "")); trf.appendChild(el("td", null, ""));
    trf.appendChild(el("td", "fin-num fin-eur bd-td-strong", fmtEuro(sum)));
    trf.appendChild(el("td", null, ""));
    tf.appendChild(trf); t.tbl.appendChild(tf);
    body.appendChild(t.tbl);
  }

  function fillSelectOptions(sel, arr, selectedVal) {
    if (!sel) return; clear(sel);
    arr.forEach(function (v) { var o = el("option", null, v); o.value = v; if (v === selectedVal) o.selected = true; sel.appendChild(o); });
  }
  function fillOnkMonthSelects(selVan, selTot) {
    var maxYm = winMax ? addMonthsYm(winMax, 12) : (selStart || selVan);
    var months = monthsBetween(winMin || selVan, maxYm);
    fillMonthSelect($("fin-onk-van"), months, selVan || selStart);
    fillMonthSelect($("fin-onk-tot"), months, selTot || selStart);
  }
  function applyDoorlopend() {
    var doorl = $("fin-onk-doorlopend") && $("fin-onk-doorlopend").checked;
    var tot = $("fin-onk-tot"), totWrap = $("fin-onk-totwrap");
    if (tot) tot.disabled = !!doorl;
    if (totWrap) totWrap.style.opacity = doorl ? "0.45" : "";
  }
  function openOnkForm(opts) {
    opts = opts || {};
    var row = opts.row || {};
    onkEditId = (opts.mode === "edit" && row.id) ? row.id : null;
    setText("fin-onk-title", onkEditId ? "Onkost bewerken" : "Onkost toevoegen");
    var errEl = $("fin-onk-err"); if (errEl) errEl.hidden = true;
    var locSel = $("fin-onk-loc"), locWrap = $("fin-onk-locwrap");
    if (opts.loc) {
      clear(locSel); var o = el("option", null, opts.loc); o.value = opts.loc; o.selected = true; locSel.appendChild(o);
      if (locWrap) locWrap.style.display = "none";
    } else {
      if (locWrap) locWrap.style.display = "";
      window.financienLocatiesDB.locatieNamen().then(function (names) { fillSelectOptions(locSel, names, names[0]); });
    }
    $("fin-onk-cat").value = row.categorie || "Huur";
    $("fin-onk-oms").value = row.omschrijving || "";
    $("fin-onk-bedrag").value = (row.bedrag != null) ? row.bedrag : "";
    $("fin-onk-doorlopend").checked = onkEditId ? (row.tot_ym == null) : false;
    fillOnkMonthSelects(row.van_ym || selStart, row.tot_ym || row.van_ym || selStart);
    applyDoorlopend();
    var m = $("fin-onk-modal"); if (m) m.hidden = false;
    document.body.classList.add("bd-modal-open");
    setTimeout(function () { var b = $("fin-onk-bedrag"); if (b) b.focus(); }, 60);
  }
  function closeOnkForm() {
    var m = $("fin-onk-modal"); if (m) m.hidden = true;
    var bd = $("bd-modal");
    if (!bd || bd.hidden) document.body.classList.remove("bd-modal-open");
  }
  function afterOnkChange() {
    window.financienLocatiesDB.load(selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null).then(function () {
      render();
      var bd = $("bd-modal");
      if (openLoc && bd && !bd.hidden) openDetail(openLoc);
    });
  }
  function saveOnk(e) {
    if (e) e.preventDefault();
    var errEl = $("fin-onk-err");
    function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } }
    var loc = $("fin-onk-loc").value;
    var cat = $("fin-onk-cat").value;
    var oms = ($("fin-onk-oms").value || "").trim();
    var bedrag = parseFloat($("fin-onk-bedrag").value);
    var van = $("fin-onk-van").value;
    var doorl = $("fin-onk-doorlopend").checked;
    var tot = doorl ? null : $("fin-onk-tot").value;
    if (!loc) return showErr("Kies een locatie.");
    if (!(bedrag > 0)) return showErr("Vul een bedrag groter dan € 0 in.");
    if (!van) return showErr("Kies een 'vanaf'-maand.");
    if (tot && tot < van) return showErr("'T/m'-maand mag niet vóór de 'vanaf'-maand liggen.");
    var payload = { locatie: loc, categorie: cat, omschrijving: oms || null, bedrag: bedrag, van_ym: van, tot_ym: tot };
    var saveBtn = $("fin-onk-save"); if (saveBtn) saveBtn.disabled = true;
    var p = onkEditId ? window.financienLocatiesDB.updateOnkost(onkEditId, payload) : window.financienLocatiesDB.addOnkost(payload);
    p.then(function () {
      if (saveBtn) saveBtn.disabled = false;
      closeOnkForm();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Onkost");
      afterOnkChange();
    }).catch(function (err) {
      if (saveBtn) saveBtn.disabled = false;
      showErr("Opslaan mislukt: " + (err && err.message ? err.message : err));
    });
  }
  function doDeleteOnk(o) {
    window.financienLocatiesDB.archiveOnkost(o.id).then(function () {
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Onkost");
      afterOnkChange();
    }).catch(function (err) { if (window.showError) window.showError("Verwijderen mislukt: " + (err && err.message ? err.message : err)); });
  }

  /* ---- periode-selector ---- */
  function fillMonthSelect(sel, months, selectedYm) {
    if (!sel) return;
    clear(sel);
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
  function reload() {
    var p = window.financienLocatiesDB.load(selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null);
    p.then(render);
  }

  function wireControls() {
    var bm = $("fin-mode-maand"), bp = $("fin-mode-periode");
    if (bm) bm.addEventListener("click", function () { mode = "maand"; selEnd = selStart; syncControls(); reload(); });
    if (bp) bp.addEventListener("click", function () { mode = "periode"; syncControls(); });
    var maand = $("fin-maand");
    if (maand) maand.addEventListener("change", function () { selStart = selEnd = maand.value; reload(); });
    function step(delta) {
      var months = monthsBetween(winMin, winMax);
      var idx = months.indexOf(selStart);
      if (idx < 0) return;
      var ni = idx + delta;
      if (ni < 0 || ni >= months.length) return;
      selStart = selEnd = months[ni]; reload();
    }
    var prev = $("fin-prev"), next = $("fin-next");
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
    var van = $("fin-van"), tot = $("fin-tot");
    function rangeChange() {
      var a = van.value, b = tot.value;
      if (a > b) { var t = a; a = b; b = t; }
      selStart = a; selEnd = b; reload();
    }
    if (van) van.addEventListener("change", rangeChange);
    if (tot) tot.addEventListener("change", rangeChange);

    var x = $("bd-modal-x"); if (x) x.addEventListener("click", closeModal);
    var bd = $("bd-modal-backdrop"); if (bd) bd.addEventListener("click", closeModal);

    // Onkosten: toevoegen op paginaniveau + formulier-acties
    var addBtn = $("fin-add-onk");
    if (addBtn) addBtn.addEventListener("click", function () { openOnkForm({ mode: "add", loc: null }); });
    var onkX = $("fin-onk-x"); if (onkX) onkX.addEventListener("click", closeOnkForm);
    var onkCancel = $("fin-onk-cancel"); if (onkCancel) onkCancel.addEventListener("click", closeOnkForm);
    var onkBack = $("fin-onk-backdrop"); if (onkBack) onkBack.addEventListener("click", closeOnkForm);
    var onkForm = $("fin-onk-form"); if (onkForm) onkForm.addEventListener("submit", saveOnk);
    var onkDoorl = $("fin-onk-doorlopend"); if (onkDoorl) onkDoorl.addEventListener("change", applyDoorlopend);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var onkM = $("fin-onk-modal");
      if (onkM && !onkM.hidden) { closeOnkForm(); return; }   // sluit eerst het formulier
      var m = $("bd-modal"); if (m && !m.hidden) closeModal();
    });
  }

  function renderNoAccess() {
    var main = $("fin-body");
    if (!main) return;
    clear(main);
    var box = el("div", "fin-note");
    box.appendChild(el("strong", null, "Geen toegang. "));
    box.appendChild(document.createTextNode("Financiën is alleen beschikbaar voor Eigenaar en Directeur."));
    main.appendChild(box);
  }

  /* ---- render ---- */
  function render() {
    var data = curData();
    if (data && data.unauthorized) { renderNoAccess(); return; }
    if (!data) return;
    var win = data.window || {};
    winMin = win.min || winMin; winMax = win.max || winMax;
    var per = data.period || {};
    selStart = per.start || selStart; selEnd = per.end || selEnd;
    syncControls();

    var t = data.totals || {};
    var lbl = periodeLabel();
    setText("fin-period-lbl", lbl);

    setText("fin-v-omzet", fmtEuro(t.omzet));
    setHTML("fin-omzet-sub", "Betaald " + esc(fmtEuro(t.paid)) + " · Open " + esc(fmtEuro(t.pending)) + " · Nog te declareren " + esc(fmtEuro(t.to_declare)));

    setText("fin-v-kosten", fmtEuro(t.kosten));
    setText("fin-kosten-sub", "ZZP " + fmtEuro(t.kosten_zzp) + " · Onkosten " + fmtEuro(t.onkosten) + " · " + fmtInt(t.zzpers) + " ZZP'ers");

    setText("fin-v-result", fmtEuro(t.resultaat));
    var pos = (Number(t.resultaat) || 0) >= 0;
    var card = $("fin-card-result");
    if (card) { card.classList.toggle("bd-money--green", pos); card.classList.toggle("bd-money--red", !pos); }
    var marge = (Number(t.omzet) > 0) ? (Math.round((t.resultaat / t.omzet) * 1000) / 10) : null;
    setText("fin-result-sub", (pos ? "Winst" : "Verlies") + (marge != null ? " · marge " + fmtPct(marge) : ""));

    renderLocTable(data.locations || []);
    renderMonthChart(data.months || []);
  }

  async function init() {
    wireControls();
    try {
      if (window.financienLocatiesDB && window.financienLocatiesDB.ready) await window.financienLocatiesDB.ready;
    } catch (e) { /* reporter meldde al */ }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
