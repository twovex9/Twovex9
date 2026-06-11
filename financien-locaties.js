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
  var koppelLoc = null;        // locatie waarvoor de koppel-modal openstaat
  var koppelCache = null;      // gecachte lijst in-zorg cliënten (voor de keuzelijst)

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

  /* ---- overhead-detectie: een locatie zonder omzet én zonder ZZP-kosten is een
     pure kostenpost (kantoor/overhead). Zorggroepen hebben omzet en/of ZZP-inzet. ---- */
  function isOverhead(l) {
    return (Number(l.omzet) || 0) === 0 && (Number(l.kosten_zzp) || 0) === 0
      && ((Number(l.personeel) || 0) > 0 || (Number(l.onkosten) || 0) > 0 || (Number(l.loondienst) || 0) > 0);
  }

  /* ---- bezetting-cellen ---- */
  function bezetText(l) {
    var bezet = Number(l.bezet) || 0, kamers = Number(l.kamers) || 0;
    return fmtInt(bezet) + " / " + (kamers > 0 ? fmtInt(kamers) : "—");
  }
  function makeVrijBadge(kamers, bezet) {
    kamers = Number(kamers) || 0; bezet = Number(bezet) || 0;
    if (kamers <= 0) { var b0 = el("span", "fin-vrij-badge fin-vrij-badge--none", "—"); b0.title = "Aantal kamers nog niet ingesteld"; return b0; }
    var vrij = kamers - bezet;
    if (vrij > 0) return el("span", "fin-vrij-badge fin-vrij-badge--free", fmtInt(vrij) + (vrij === 1 ? " plek" : " plekken"));
    if (vrij === 0) return el("span", "fin-vrij-badge fin-vrij-badge--full", "vol");
    return el("span", "fin-vrij-badge fin-vrij-badge--over", fmtInt(-vrij) + " over");
  }

  /* ---- per-locatie tabel ---- */
  function renderLocTable(locations) {
    var tb = $("fin-loc-tbody"); if (!tb) return;
    clear(tb);
    if (!locations.length) {
      var tr0 = el("tr"); var td0 = el("td", "fin-empty"); td0.colSpan = 7;
      td0.textContent = "Geen kosten of opbrengst in deze periode."; tr0.appendChild(td0); tb.appendChild(tr0);
      ["fin-foot-kosten", "fin-foot-omzet", "fin-foot-result", "fin-foot-bezet"].forEach(function (id) { setText(id, ""); });
      return;
    }
    var tOmzet = 0, tKosten = 0, tZzp = 0, tLoon = 0, tPers = 0, tOnk = 0, tKamers = 0, tBezet = 0, tVrij = 0;
    // zorggroepen eerst, overhead-regels onderaan
    var sorted = locations.slice().sort(function (a, b) {
      var ao = isOverhead(a) ? 1 : 0, bo = isOverhead(b) ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return (Number(b.omzet) || 0) - (Number(a.omzet) || 0);
    });
    sorted.forEach(function (l) {
      tOmzet += Number(l.omzet) || 0; tKosten += Number(l.kosten) || 0;
      tZzp += Number(l.kosten_zzp) || 0; tLoon += Number(l.loondienst) || 0; tPers += Number(l.personeel) || 0; tOnk += Number(l.onkosten) || 0;
      tKamers += Number(l.kamers) || 0; tBezet += Number(l.bezet) || 0;
      if ((Number(l.kamers) || 0) > 0) tVrij += Math.max((Number(l.kamers) || 0) - (Number(l.bezet) || 0), 0);
      var res = Number(l.resultaat) || 0;
      var ovh = isOverhead(l);
      var tr = el("tr", "fin-loc-row" + (ovh ? " fin-loc-row--overhead" : "")); tr.tabIndex = 0; tr.setAttribute("role", "button");
      tr.setAttribute("aria-label", l.name + " — details");

      var tdN = el("td", "fin-loc-name");
      var dot = el("span", "fin-loc-dot"); dot.style.background = l.kleur || "var(--blue)";
      tdN.appendChild(dot); tdN.appendChild(el("span", null, l.name));
      if (ovh) tdN.appendChild(el("span", "fin-ovh-badge", "overhead"));
      tr.appendChild(tdN);

      tr.appendChild(el("td", "fin-num", fmtInt(l.zzpers)));
      // Kosten (totaal) — uitsplitsing ZZP/Personeel/Onkosten in tooltip; losse kolommen weg voor leesbaarheid
      var tdK = el("td", "fin-num fin-eur", fmtEuro(l.kosten));
      tdK.title = "ZZP " + fmtEuro(l.kosten_zzp) + " · Loondienst " + fmtEuro(l.loondienst) + " · Personeel " + fmtEuro(l.personeel) + " · Onkosten " + fmtEuro(l.onkosten);
      tr.appendChild(tdK);
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(l.omzet)));
      tr.appendChild(el("td", "fin-num fin-eur " + (res >= 0 ? "fin-pos" : "fin-neg"), fmtEuro(res)));
      tr.appendChild(el("td", "fin-num " + (res >= 0 ? "fin-pos" : "fin-neg"), fmtPct(l.marge_pct)));

      // Bezetting + vrije plekken samengevoegd in één kolom (badge alleen bij bekende kamers)
      var tdBez = el("td", "fin-num fin-loc-bez");
      tdBez.appendChild(el("span", "fin-loc-bez-cnt", bezetText(l)));
      if ((Number(l.kamers) || 0) > 0) tdBez.appendChild(makeVrijBadge(l.kamers, l.bezet));
      tr.appendChild(tdBez);

      (function (naam) {
        tr.addEventListener("click", function () { openDetail(naam); });
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(naam); } });
      })(l.name);
      tb.appendChild(tr);
    });
    var footK = $("fin-foot-kosten");
    if (footK) { footK.textContent = fmtEuro(tKosten); footK.title = "ZZP " + fmtEuro(tZzp) + " · Loondienst " + fmtEuro(tLoon) + " · Personeel " + fmtEuro(tPers) + " · Onkosten " + fmtEuro(tOnk); }
    setText("fin-foot-omzet", fmtEuro(tOmzet));
    var tRes = tOmzet - tKosten;
    var foot = $("fin-foot-result");
    if (foot) { foot.textContent = fmtEuro(tRes); foot.className = "fin-num fin-eur " + (tRes >= 0 ? "fin-pos" : "fin-neg"); }
    var footBez = $("fin-foot-bezet");
    if (footBez) {
      clear(footBez);
      footBez.appendChild(el("span", "fin-loc-bez-cnt", fmtInt(tBezet) + " / " + (tKamers > 0 ? fmtInt(tKamers) : "—")));
      if (tKamers > 0) footBez.appendChild(makeVrijBadge(tKamers, tKamers - tVrij));
    }
  }

  /* ---- locatie- vs overheadkosten-splitsing onder de KPI's ---- */
  function renderSplit(locations) {
    var locK = 0, ovhK = 0;
    (locations || []).forEach(function (l) {
      if (isOverhead(l)) ovhK += Number(l.kosten) || 0;
      else locK += Number(l.kosten) || 0;
    });
    setText("fin-split-loc", fmtEuro(locK));
    setText("fin-split-overhead", fmtEuro(ovhK));
  }

  /* ---- bezetting-strip (totalen alle locaties) ---- */
  function renderBezetting(totals) {
    var t = totals || {};
    var kamers = Number(t.kamers) || 0, bezet = Number(t.bezet) || 0, vrij = Number(t.vrij) || 0, zonder = Number(t.zonder_locatie) || 0;
    setText("fin-bz-kamers", kamers > 0 ? fmtInt(kamers) : "—");
    setText("fin-bz-bezet", fmtInt(bezet));
    var vrijEl = $("fin-bz-vrij");
    if (vrijEl) { vrijEl.textContent = kamers > 0 ? fmtInt(vrij) : "—"; vrijEl.className = "fin-bz-val " + (kamers > 0 && vrij > 0 ? "fin-pos" : ""); }
    var zEl = $("fin-bz-zonder");
    if (zEl) { zEl.textContent = fmtInt(zonder); zEl.className = "fin-bz-val " + (zonder > 0 ? "fin-warn" : ""); }
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
      "ZZP " + fmtEuro(loc.kosten_zzp) + " · Loondienst " + fmtEuro(loc.loondienst) + " · Personeel " + fmtEuro(loc.personeel) + " · Onkosten " + fmtEuro(loc.onkosten)));
    sum.appendChild(stat("Resultaat", fmtEuro(res0), (res0 >= 0 ? "fin-pos" : "fin-neg"),
      (res0 >= 0 ? "Winst" : "Verlies") + (loc.marge_pct != null ? " · marge " + fmtPct(loc.marge_pct) : "")));
    body.appendChild(sum);

    body.appendChild(el("p", "bd-mrow-loading", "Laden…"));

    window.financienLocatiesDB.detail(loc.name, selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null).then(function (d) {
      // verwijder loader (laatste element)
      if (body.lastChild) body.removeChild(body.lastChild);
      if (!d || d.unauthorized) { emptyRow(body, "Geen toegang tot deze gegevens."); return; }

      // Kamers & bezetting + gekoppelde jongeren (bovenaan, prominent)
      renderKamersBezetting(body, loc.name, d);
      renderJongeren(body, loc.name, d.jongeren || []);

      // Loondienst-medewerkers (automatisch o.b.v. salaris × locatiekoppeling)
      renderLoondienstSection(body, d.loondienst || []);

      // Overhead-personeel (read-only; beheer via de Overhead-tab)
      renderPersSection(body, loc.name, d.personeel || []);

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

      // Openstaande diensten op deze locatie (toekomst)
      renderOpenDienstenDetail(body, d.open_diensten || [], d.open_diensten_totaal || 0);
    });
  }

  /* ---- loondienst-medewerkers (drill-down, read-only) ---- */
  function renderLoondienstSection(body, rows) {
    if (!rows || !rows.length) return;
    body.appendChild(el("h3", "fin-sec-h", "Loondienst-medewerkers"));
    var t = buildTable([{ label: "Naam" }, { label: "Functie" }, { label: "€/maand", num: true }, { label: "Mnd", num: true }, { label: "In periode", num: true }]);
    var sum = 0;
    rows.forEach(function (p) {
      sum += Number(p.kost_periode) || 0;
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", p.naam || "—"));
      tr.appendChild(el("td", null, p.functie || "—"));
      tr.appendChild(el("td", "fin-num", fmtEuro(p.maandkost)));
      tr.appendChild(el("td", "fin-num", fmtInt(p.maanden)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(p.kost_periode)));
      t.tb.appendChild(tr);
    });
    var tf = el("tfoot"), trf = el("tr");
    trf.appendChild(el("td", "bd-td-strong", "Totaal loondienst (" + rows.length + ")"));
    trf.appendChild(el("td", null, "")); trf.appendChild(el("td", null, "")); trf.appendChild(el("td", null, ""));
    trf.appendChild(el("td", "fin-num fin-eur bd-td-strong", fmtEuro(sum)));
    tf.appendChild(trf); t.tbl.appendChild(tf);
    body.appendChild(t.tbl);
    body.appendChild(el("p", "bd-mrow-note", "Loondienstkosten = bruto-maandsalaris × 1,30 (werkgeverslasten), gelijk verdeeld over de gekoppelde locaties van de medewerker (HR → locatiekeuze)."));
  }

  /* ---- openstaande diensten (drill-down) ---- */
  function urgentieBadge(u) {
    var cls = u === "hoog" ? "fin-urg fin-urg--hoog" : u === "midden" ? "fin-urg fin-urg--midden" : "fin-urg fin-urg--laag";
    var lbl = u === "hoog" ? "Hoog" : u === "midden" ? "Midden" : "Laag";
    return el("span", cls, lbl);
  }
  function dagLabel(datum) {
    if (!datum) return "—";
    var p = String(datum).split("-");
    if (p.length < 3) return datum;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    try { return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return datum; }
  }
  function renderOpenDienstenDetail(body, rows, totaal) {
    var head = el("div", "fin-sec-head");
    head.appendChild(el("h3", "fin-sec-h", "Openstaande diensten (" + fmtInt(totaal) + ")"));
    body.appendChild(head);
    if (!rows.length) { emptyRow(body, "Geen openstaande toekomstige diensten op deze locatie."); return; }
    var t = buildTable([{ label: "Datum" }, { label: "Tijd" }, { label: "Functie / diensttype" }, { label: "Urgentie" }]);
    rows.forEach(function (o) {
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", dagLabel(o.datum)));
      tr.appendChild(el("td", null, (o.start || "—") + (o.eind ? "–" + o.eind : "")));
      tr.appendChild(el("td", null, o.functie || o.diensttype || "Dienst"));
      var tdU = el("td"); tdU.appendChild(urgentieBadge(o.urgentie)); tr.appendChild(tdU);
      t.tb.appendChild(tr);
    });
    body.appendChild(t.tbl);
    if (totaal > rows.length) body.appendChild(el("p", "bd-mrow-note", "Eerste " + rows.length + " van " + fmtInt(totaal) + " getoond (oplopend op datum). Volledige lijst via Planning → Open diensten."));
    else body.appendChild(el("p", "bd-mrow-note", "Urgentie: Hoog = binnen 2 dagen · Midden = binnen een week · Laag = later."));
  }

  /* ---- kamers & bezetting (drill-down) ---- */
  function renderKamersBezetting(body, locName, d) {
    body.appendChild(el("h3", "fin-sec-h", "Kamers & bezetting"));
    var kamers = Number(d.kamers) || 0, bezet = Number(d.bezet) || 0;
    var grid = el("div", "fin-kb-grid");

    // Kamers — bewerkbaar
    var cK = el("div", "fin-kb-card");
    cK.appendChild(el("span", "fin-kb-lbl", "Kamers"));
    var kRow = el("div", "fin-kb-edit");
    var inp = el("input", "fin-input fin-kb-input"); inp.type = "number"; inp.min = "0"; inp.step = "1";
    inp.value = kamers > 0 ? String(kamers) : ""; inp.placeholder = "—";
    inp.setAttribute("aria-label", "Aantal kamers op " + locName);
    var save = el("button", "btn-outline fin-kb-save", "Opslaan"); save.type = "button";
    var errK = el("span", "fin-kb-err"); errK.hidden = true;
    function doSaveKamers() {
      save.disabled = true; errK.hidden = true;
      window.financienLocatiesDB.zetKamers(locName, inp.value).then(function () {
        if (window.showActionFeedback) window.showActionFeedback("saved", "Kamers");
        afterOnkChange();
      }).catch(function (err) {
        save.disabled = false; errK.hidden = false; errK.textContent = (err && err.message) ? err.message : "Opslaan mislukt";
      });
    }
    save.addEventListener("click", doSaveKamers);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSaveKamers(); } });
    kRow.appendChild(inp); kRow.appendChild(save);
    cK.appendChild(kRow); cK.appendChild(errK);
    grid.appendChild(cK);

    // Bezet
    var cB = el("div", "fin-kb-card");
    cB.appendChild(el("span", "fin-kb-lbl", "Bezet"));
    cB.appendChild(el("span", "fin-kb-val", fmtInt(bezet)));
    grid.appendChild(cB);

    // Vrij
    var cV = el("div", "fin-kb-card");
    cV.appendChild(el("span", "fin-kb-lbl", "Vrije plekken"));
    var vWrap = el("span", "fin-kb-val"); vWrap.appendChild(makeVrijBadge(kamers, bezet));
    cV.appendChild(vWrap);
    grid.appendChild(cV);

    body.appendChild(grid);
  }

  /* ---- gekoppelde jongeren (drill-down) ---- */
  function renderJongeren(body, locName, jongeren) {
    var head = el("div", "fin-sec-head");
    head.appendChild(el("h3", "fin-sec-h", "Jongeren op deze locatie (" + jongeren.length + ")"));
    var addBtn = el("button", "btn-outline fin-sec-add", "+ Jongere koppelen"); addBtn.type = "button";
    addBtn.addEventListener("click", function () { openKoppel(locName); });
    head.appendChild(addBtn);
    body.appendChild(head);
    if (!jongeren.length) { emptyRow(body, "Nog geen jongeren aan deze locatie gekoppeld."); return; }
    var list = el("div", "fin-jong-list");
    jongeren.forEach(function (j) {
      var row = el("div", "fin-jong-item");
      row.appendChild(el("span", "fin-jong-naam", j.naam || "—"));
      if (j.clientnummer != null && j.clientnummer !== "") row.appendChild(el("span", "fin-jong-nr", "#" + j.clientnummer));
      row.appendChild(el("span", "fin-jong-spacer"));
      var unb = el("button", "fin-icon-btn fin-icon-btn--danger", "Ontkoppelen"); unb.type = "button";
      unb.addEventListener("click", function () {
        clear(row);
        row.appendChild(el("span", "fin-jong-naam", j.naam || "—"));
        row.appendChild(el("span", "fin-jong-spacer"));
        row.appendChild(el("span", "fin-onk-confirm", "Ontkoppelen?"));
        var yes = el("button", "fin-icon-btn fin-icon-btn--danger", "Ja"); yes.type = "button";
        var no = el("button", "fin-icon-btn", "Nee"); no.type = "button";
        yes.addEventListener("click", function () { doOntkoppel(j); });
        no.addEventListener("click", function () { if (openLoc) openDetail(openLoc); });
        row.appendChild(yes); row.appendChild(no);
      });
      row.appendChild(unb);
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  /* ---- koppel-modal: kies een in-zorg cliënt om aan de locatie te koppelen ---- */
  function openKoppel(locName) {
    koppelLoc = locName;
    setText("fin-koppel-title", "Jongere koppelen");
    setText("fin-koppel-sub", "Aan locatie: " + locName);
    var err = $("fin-koppel-err"); if (err) err.hidden = true;
    var zoek = $("fin-koppel-zoek"); if (zoek) zoek.value = "";
    var list = $("fin-koppel-list");
    if (list) { clear(list); list.appendChild(el("p", "bd-mrow-loading", "Laden…")); }
    var m = $("fin-koppel-modal"); if (m) m.hidden = false;
    document.body.classList.add("bd-modal-open");
    var p = koppelCache ? Promise.resolve(koppelCache) : window.financienLocatiesDB.koppelbareClienten();
    p.then(function (rows) {
      koppelCache = rows || [];
      renderKoppelList("");
    }).catch(function (e) {
      if (list) { clear(list); list.appendChild(el("p", "bd-modal-empty", "Laden mislukt: " + ((e && e.message) || e))); }
    });
    setTimeout(function () { if (zoek) zoek.focus(); }, 60);
  }
  function renderKoppelList(filter) {
    var list = $("fin-koppel-list"); if (!list) return;
    clear(list);
    var f = (filter || "").trim().toLowerCase();
    var rows = (koppelCache || []).filter(function (c) {
      if (c.locatie === koppelLoc) return false;   // staat al op deze locatie
      if (!f) return true;
      return (c.naam || "").toLowerCase().indexOf(f) >= 0 || String(c.clientnummer == null ? "" : c.clientnummer).indexOf(f) >= 0;
    });
    if (!rows.length) {
      list.appendChild(el("p", "bd-modal-empty", f ? "Geen cliënten gevonden." : "Alle in-zorg cliënten staan al op deze locatie."));
      return;
    }
    rows.forEach(function (c) {
      var item = el("button", "fin-koppel-item"); item.type = "button";
      item.appendChild(el("span", "fin-koppel-item-nm", c.naam || "—"));
      if (c.clientnummer != null) item.appendChild(el("span", "fin-koppel-item-nr", "#" + c.clientnummer));
      item.appendChild(el("span", "fin-koppel-item-spacer"));
      var loc = el("span", "fin-koppel-item-loc", c.locatie ? ("nu: " + c.locatie) : "geen locatie");
      if (!c.locatie) loc.classList.add("fin-warn");
      item.appendChild(loc);
      item.addEventListener("click", function () { doKoppel(c); });
      list.appendChild(item);
    });
  }
  function doKoppel(c) {
    var err = $("fin-koppel-err");
    window.financienLocatiesDB.koppelClient(c.id, koppelLoc).then(function () {
      if (window.showActionFeedback) window.showActionFeedback("saved", "Gekoppeld");
      koppelCache = null;   // locatie van deze cliënt is gewijzigd → cache verlopen
      closeKoppel();
      afterOnkChange();
    }).catch(function (e) {
      if (err) { err.hidden = false; err.textContent = (e && e.message) ? e.message : "Koppelen mislukt"; }
    });
  }
  function doOntkoppel(j) {
    window.financienLocatiesDB.koppelClient(j.id, "").then(function () {
      if (window.showActionFeedback) window.showActionFeedback("saved", "Ontkoppeld");
      koppelCache = null;
      afterOnkChange();
    }).catch(function (e) {
      if (window.showError) window.showError("Ontkoppelen mislukt: " + ((e && e.message) || e));
      else if (openLoc) openDetail(openLoc);
    });
  }
  function closeKoppel() {
    var m = $("fin-koppel-modal"); if (m) m.hidden = true;
    koppelLoc = null;
    var bd = $("bd-modal");
    if (!bd || bd.hidden) document.body.classList.remove("bd-modal-open");
  }

  /* ---- overhead-personeel (read-only weergave; beheer op de Overhead-tab) ---- */
  function renderPersSection(body, locName, rows) {
    if (!rows || !rows.length) return;   // alleen tonen als er handmatig personeel is
    var head = el("div", "fin-sec-head");
    head.appendChild(el("h3", "fin-sec-h", "Personeel (handmatig ingevoerd)"));
    var mng = el("a", "btn-outline fin-sec-add", "Beheren →"); mng.href = "financien-overhead";
    head.appendChild(mng);
    body.appendChild(head);
    var t = buildTable([{ label: "Naam" }, { label: "Functie" }, { label: "Type" }, { label: "€/maand", num: true }, { label: "In periode", num: true }]);
    var sum = 0;
    rows.forEach(function (p) {
      sum += Number(p.kost_periode) || 0;
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", p.naam || "—"));
      tr.appendChild(el("td", null, p.functie || "—"));
      tr.appendChild(el("td", null, p.dienstverband === "zzp" ? "ZZP" : "Loondienst"));
      tr.appendChild(el("td", "fin-num", fmtEuro(p.maandkost)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(p.kost_periode)));
      t.tb.appendChild(tr);
    });
    var tf = el("tfoot"), trf = el("tr");
    trf.appendChild(el("td", "bd-td-strong", "Totaal personeel"));
    trf.appendChild(el("td", null, "")); trf.appendChild(el("td", null, "")); trf.appendChild(el("td", null, ""));
    trf.appendChild(el("td", "fin-num fin-eur bd-td-strong", fmtEuro(sum)));
    tf.appendChild(trf); t.tbl.appendChild(tf);
    body.appendChild(t.tbl);
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
    if (bm) bm.addEventListener("click", function () { mode = "maand"; selEnd = selStart; markPreset(null); syncControls(); reload(); });
    if (bp) bp.addEventListener("click", function () { mode = "periode"; markPreset(null); syncControls(); });

    // Periode-presets: maand / kwartaal / jaar
    var pmd = $("fin-preset-maand"); if (pmd) pmd.addEventListener("click", function () { setPreset("maand"); });
    var pkw = $("fin-preset-kwartaal"); if (pkw) pkw.addEventListener("click", function () { setPreset("kwartaal"); });
    var pjr = $("fin-preset-jaar"); if (pjr) pjr.addEventListener("click", function () { setPreset("jaar"); });

    // Open diensten: horizon-filter
    var odh = $("fin-od-horizon");
    if (odh) odh.addEventListener("change", function () { odHorizon = parseInt(odh.value, 10) || 30; odLoad(); });
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

    // Koppel-modal: jongere aan locatie koppelen
    var kX = $("fin-koppel-x"); if (kX) kX.addEventListener("click", closeKoppel);
    var kBack = $("fin-koppel-backdrop"); if (kBack) kBack.addEventListener("click", closeKoppel);
    var kZoek = $("fin-koppel-zoek"); if (kZoek) kZoek.addEventListener("input", function () { renderKoppelList(kZoek.value); });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var kM = $("fin-koppel-modal");
      if (kM && !kM.hidden) { closeKoppel(); return; }        // sluit eerst de koppel-modal
      var onkM = $("fin-onk-modal");
      if (onkM && !onkM.hidden) { closeOnkForm(); return; }   // dan het onkosten-formulier
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

  /* ---- signaleringsstrip: verliesgevende locaties + veel open diensten ---- */
  var OPEN_WEEK_DREMPEL = 5;
  function renderSignals(data) {
    var box = $("fin-signals");
    if (!box) return;
    clear(box);
    var locs = (data && data.locations) || [];
    var sigs = [];
    locs.forEach(function (l) {
      var res = Number(l.resultaat) || 0;
      var omzet = Number(l.omzet) || 0;
      // Verlies alleen melden bij een echte zorggroep (heeft omzet of ZZP-inzet), niet bij pure overhead-regels.
      if (res < 0 && !isOverhead(l) && (omzet > 0 || (Number(l.kosten_zzp) || 0) > 0)) {
        sigs.push({ ernst: "rood", dom: l.name, tekst: "Verliesgevend — resultaat " + fmtEuro(res) + (l.marge_pct != null ? " (marge " + fmtPct(l.marge_pct) + ")" : "") });
      }
      var ow = Number(l.open_diensten_week) || 0;
      if (ow >= OPEN_WEEK_DREMPEL) {
        sigs.push({ ernst: "oranje", dom: l.name, tekst: ow + " open diensten in de komende 7 dagen" });
      }
    });
    sigs.sort(function (a, b) { return (a.ernst === "rood" ? 0 : 1) - (b.ernst === "rood" ? 0 : 1); });
    if (!sigs.length) {
      box.innerHTML = '<div class="fin-signal fin-signal--ok"><span class="fin-signal-ico" aria-hidden="true">✓</span>'
        + '<span class="fin-signal-txt"><strong>Geen signalen.</strong> Alle locaties zijn winstgevend en zonder grote planningsgaten.</span></div>';
      return;
    }
    sigs.forEach(function (s) {
      var d = el("div", "fin-signal " + (s.ernst === "rood" ? "fin-signal--rood" : "fin-signal--oranje"));
      d.appendChild(el("span", "fin-signal-dom", s.dom));
      d.appendChild(el("span", "fin-signal-txt", s.tekst));
      box.appendChild(d);
    });
  }

  /* ---- open diensten per locatie (page-sectie, operationeel) ---- */
  var _odData = null;
  var odHorizon = 30;
  function odLoad() {
    var tb = $("fin-od-tbody");
    if (tb) { clear(tb); var trL = el("tr"); var tdL = el("td", "fin-empty"); tdL.colSpan = 6; tdL.textContent = "Laden…"; trL.appendChild(tdL); tb.appendChild(trL); }
    return window.financienLocatiesDB.openDiensten(null, odHorizon).then(function (d) {
      _odData = d || null;
      renderOdTable();
    });
  }
  function renderOdTable() {
    var tb = $("fin-od-tbody"); if (!tb) return;
    clear(tb);
    var rows = (_odData && _odData.per_locatie) || [];
    setText("fin-od-totaal", _odData ? fmtInt(_odData.totaal) : "—");
    if (!rows.length) {
      var tr0 = el("tr"); var td0 = el("td", "fin-empty"); td0.colSpan = 6;
      td0.textContent = "Geen openstaande toekomstige diensten."; tr0.appendChild(td0); tb.appendChild(tr0);
      return;
    }
    rows.forEach(function (r) {
      var tr = el("tr", "fin-loc-row"); tr.tabIndex = 0; tr.setAttribute("role", "button");
      tr.setAttribute("aria-label", r.loc + " — openstaande diensten");
      tr.appendChild(el("td", "fin-loc-name", r.loc));
      tr.appendChild(el("td", "fin-num bd-td-strong", fmtInt(r.aantal)));
      var tdW = el("td", "fin-num" + ((Number(r.week) || 0) >= OPEN_WEEK_DREMPEL ? " fin-neg" : "")); tdW.textContent = fmtInt(r.week); tr.appendChild(tdW);
      tr.appendChild(el("td", "fin-num", fmtInt(r.maand)));
      var tdU = el("td", "fin-od-urg");
      if (Number(r.hoog) > 0) { var bh = urgentieBadge("hoog"); bh.textContent = "Hoog " + fmtInt(r.hoog); tdU.appendChild(bh); }
      if (Number(r.midden) > 0) { var bm = urgentieBadge("midden"); bm.textContent = "Midden " + fmtInt(r.midden); tdU.appendChild(bm); }
      tr.appendChild(tdU);
      var tdA = el("td", "fin-num");
      var b = el("button", "fin-icon-btn", "Bekijken"); b.type = "button";
      tdA.appendChild(b); tr.appendChild(tdA);
      (function (loc) {
        function open() { openDetail(loc); }
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      })(r.loc);
      tb.appendChild(tr);
    });
  }

  /* ---- periode-presets: maand / kwartaal / jaar ---- */
  function clampYm(ym) {
    if (!ym) return ym;
    if (winMin && ym < winMin) return winMin;
    if (winMax && ym > winMax) return winMax;
    return ym;
  }
  function setPreset(kind) {
    var anchor = selEnd || selStart || winMax;
    if (!anchor) return;
    if (kind === "maand") { mode = "maand"; selStart = selEnd = anchor; }
    else if (kind === "kwartaal") { mode = "periode"; selEnd = anchor; selStart = clampYm(addMonthsYm(anchor, -2)); }
    else if (kind === "jaar") { mode = "periode"; var y = anchor.slice(0, 4); selStart = clampYm(y + "-01"); selEnd = clampYm(y + "-12"); }
    syncControls(); markPreset(kind); reload();
  }
  function markPreset(kind) {
    [["fin-preset-maand", "maand"], ["fin-preset-kwartaal", "kwartaal"], ["fin-preset-jaar", "jaar"]].forEach(function (p) {
      var b = $(p[0]); if (b) { b.classList.toggle("is-active", p[1] === kind); b.setAttribute("aria-selected", p[1] === kind); }
    });
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
    setText("fin-kosten-sub", "ZZP " + fmtEuro(t.kosten_zzp) + " · Loondienst " + fmtEuro(t.loondienst) + " · Personeel " + fmtEuro(t.personeel) + " · Onkosten " + fmtEuro(t.onkosten));

    setText("fin-v-result", fmtEuro(t.resultaat));
    var pos = (Number(t.resultaat) || 0) >= 0;
    var card = $("fin-card-result");
    if (card) { card.classList.toggle("bd-money--green", pos); card.classList.toggle("bd-money--red", !pos); }
    var marge = (Number(t.omzet) > 0) ? (Math.round((t.resultaat / t.omzet) * 1000) / 10) : null;
    setText("fin-result-sub", (pos ? "Winst" : "Verlies") + (marge != null ? " · marge " + fmtPct(marge) : ""));

    renderSignals(data);
    renderLocTable(data.locations || []);
    renderSplit(data.locations || []);
    renderBezetting(t);
    renderMonthChart(data.months || []);

    // Laat de zorgsoort-sectie (apart script) dezelfde periode volgen.
    try {
      document.dispatchEvent(new CustomEvent("besa:fin-periode", { detail: { start: selStart, end: selEnd } }));
    } catch (e) { /* CustomEvent niet beschikbaar — zorgsoort-sectie valt terug op eigen default */ }
  }

  async function init() {
    wireControls();
    try {
      if (window.financienLocatiesDB && window.financienLocatiesDB.ready) await window.financienLocatiesDB.ready;
    } catch (e) { /* reporter meldde al */ }
    render();
    odLoad();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
