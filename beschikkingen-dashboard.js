/*
 * beschikkingen-dashboard.js — LIVE beschikkingen-dashboard.
 *
 * Toont per GESELECTEERDE maand (of een zelfgekozen periode) drie geldstromen:
 *   GROEN  betaald · ORANJE gedeclareerd-wacht-op-betaling · ROOD nog te declareren.
 * De rode kaart heeft twee sub-bedragen over de EERDERE maanden: achterstand
 * (nog te declareren, rood) en onbetaald (gedeclareerd maar niet betaald, oranje).
 * Alle cijfers komen uit window.besaDashboardDB (RPC beschikkingen_dashboard_v2).
 * KPI's/sub-bedragen/maandstaven zijn klikbaar → drill-down modal.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function fmtEuro(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) { return String(Math.round(Number(n) || 0)); }
  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function euTick(v) {
    if (Math.abs(v) >= 1000) return "€ " + Math.round(v / 1000) + "k";
    return "€ " + Math.round(v);
  }

  var MND_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  var MND_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  function ymLabel(ym, long) {
    if (!ym || ym.length < 7) return "—";
    var y = ym.slice(0, 4), mi = parseInt(ym.slice(5, 7), 10) - 1;
    var arr = long ? MND_LANG : MND_KORT;
    var nm = arr[mi] || "?";
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

  /* ---- state ---- */
  var mode = "maand";       // "maand" | "periode"
  var selStart = null;       // ym
  var selEnd = null;         // ym
  var winMin = null, winMax = null;

  function curData() { return (window.besaDashboardDB && window.besaDashboardDB.getData()) || null; }
  function periodeLabel() {
    if (!selStart) return "";
    if (selStart === selEnd) return ymLabel(selStart, true);
    return ymLabel(selStart, false) + " – " + ymLabel(selEnd, false);
  }

  /* ---- hover-tooltip voor de staven ---- */
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
    var rr = t.getBoundingClientRect();
    t.style.left = Math.round((parseFloat(t.style.left) || 0) + (dx - rr.left)) + "px";
    t.style.top = Math.round((parseFloat(t.style.top) || 0) + (dy - rr.top)) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  /* ---- verticale (gestapelde) staafgrafiek ---- */
  function renderVBars(opt) {
    var bars = $(opt.barsId), axis = $(opt.axisId), yEl = $(opt.yId);
    if (!bars) return;
    clear(bars); if (axis) clear(axis); if (yEl) clear(yEl);
    var rows = opt.rows || [];
    if (!rows.length) {
      bars.appendChild(el("div", "bd-hrow-empty", "Geen gegevens in deze periode"));
      return;
    }
    var max = 0;
    rows.forEach(function (r) {
      var tot = opt.stacked ? (r.segs || []).reduce(function (a, s) { return a + (s.v || 0); }, 0) : r.value;
      if (tot > max) max = tot;
    });
    if (max <= 0) max = 1;
    var step = Math.pow(10, Math.floor(Math.log10(max)));
    var niceMax = Math.ceil(max / step) * step;
    if (niceMax < max) niceMax = max;
    if (yEl) {
      for (var t = 4; t >= 0; t -= 1) {
        var val = niceMax * (t / 4);
        yEl.appendChild(el("div", null, opt.euro ? euTick(val) : String(Math.round(val))));
      }
    }
    rows.forEach(function (r) {
      var col = el(opt.onPick ? "button" : "div", "bd-vbar-col");
      if (opt.onPick) { col.type = "button"; }
      if (opt.activeKey != null && r.key === opt.activeKey) col.className += " bd-vbar-col--active";
      var bar = el("div", "bd-vbar");
      var tot = opt.stacked ? (r.segs || []).reduce(function (a, s) { return a + (s.v || 0); }, 0) : r.value;
      bar.style.height = (Math.max(0, tot) / niceMax * 100) + "%";
      if (opt.stacked) {
        (r.segs || []).forEach(function (s) {
          if (!s.v || s.v <= 0) return;
          var seg = el("div", "bd-vbar-seg " + s.cls);
          seg.style.height = (s.v / tot * 100) + "%";
          bar.appendChild(seg);
        });
      } else {
        var seg2 = el("div", "bd-vbar-seg bd-vbar-seg--blue");
        seg2.style.height = "100%";
        bar.appendChild(seg2);
      }
      col.appendChild(bar);
      (function (rowData) {
        function tip() {
          var h = '<div class="bd-tip-title">' + esc(rowData.label) + "</div>";
          if (opt.stacked) {
            var tt = 0;
            (rowData.segs || []).forEach(function (s) {
              tt += (s.v || 0);
              h += '<div class="bd-tip-row"><span class="bd-tip-sw" style="background:' + s.color + '"></span><span class="bd-tip-nm">' + esc(s.name) + '</span><span class="bd-tip-val">' + fmtEuro(s.v) + '</span></div>';
            });
            h += '<div class="bd-tip-div"></div><div class="bd-tip-row bd-tip-row--total"><span class="bd-tip-sw" style="background:transparent"></span><span class="bd-tip-nm">Totaal</span><span class="bd-tip-val">' + fmtEuro(tt) + '</span></div>';
          } else {
            h += '<div class="bd-tip-row"><span class="bd-tip-sw" style="background:var(--blue)"></span><span class="bd-tip-nm">Aantal</span><span class="bd-tip-val">' + fmtInt(rowData.value) + '</span></div>';
          }
          return h;
        }
        col.addEventListener("mouseenter", function (ev) { showTip(tip(), ev.clientX, ev.clientY); });
        col.addEventListener("mousemove", function (ev) { showTip(null, ev.clientX, ev.clientY); });
        col.addEventListener("mouseleave", hideTip);
        if (opt.onPick) col.addEventListener("click", function () { hideTip(); opt.onPick(rowData.key); });
      })(r);
      bars.appendChild(col);
      if (axis) {
        var lb = el("span", null, r.label);
        lb.title = r.label;
        axis.appendChild(lb);
      }
    });
  }

  /* ---- modal ---- */
  function openModal(title, sub) {
    var m = $("bd-modal"); if (!m) return null;
    setText("bd-modal-title", title || "Details");
    setText("bd-modal-sub", sub || "");
    var body = $("bd-modal-body"); clear(body);
    m.hidden = false;
    document.body.classList.add("bd-modal-open");
    return body;
  }
  function closeModal() {
    var m = $("bd-modal"); if (m) m.hidden = true;
    document.body.classList.remove("bd-modal-open");
  }
  function emptyRow(body, txt) {
    body.appendChild(el("p", "bd-modal-empty", txt || "Geen gegevens."));
  }

  // Lijst-modal voor 60d / aanvragen.
  function buildTable(headers) {
    var tbl = el("table", "bd-modal-tbl");
    var thead = el("thead"), tr = el("tr");
    headers.forEach(function (h) { tr.appendChild(el("th", null, h)); });
    thead.appendChild(tr); tbl.appendChild(thead);
    var tb = el("tbody"); tbl.appendChild(tb);
    return { tbl: tbl, tb: tb };
  }

  function showOverdueModal() {
    var data = curData(); if (!data) return;
    var rows = data.overdue_60d || [];
    var body = openModal("Verloopt binnen 60 dagen", rows.length + (rows.length === 1 ? " beschikking" : " beschikkingen"));
    if (!body) return;
    if (!rows.length) { emptyRow(body, "Geen beschikkingen die binnen 60 dagen verlopen."); return; }
    var hasOplos = !!window.besaOplossen;
    var t = buildTable(hasOplos
      ? ["Cliënt", "Beschikking", "Zorgsoort", "Einddatum", "Resteert", ""]
      : ["Cliënt", "Beschikking", "Zorgsoort", "Einddatum", "Resteert"]);
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", r.client || "—"));
      tr.appendChild(el("td", null, r.naam || "—"));
      tr.appendChild(el("td", null, r.zorgsoort || "—"));
      tr.appendChild(el("td", null, dateNL(r.eind)));
      var d = Number(r.dagen);
      var td = el("td"); var pill = el("span", "bd-pill " + (d <= 14 ? "bd-pill--red" : "bd-pill--orange"), d + (d === 1 ? " dag" : " dagen"));
      td.appendChild(pill); tr.appendChild(td);
      if (hasOplos) {
        var actTd = el("td", "bd-td-act");
        var url = r.id ? "beschikking-detail?id=" + encodeURIComponent(r.id) : "beschikkingen";
        actTd.innerHTML = window.besaOplossen.navBtn(url, "Naar beschikking", "Verleng of werk de aflopende beschikking bij.");
        tr.appendChild(actTd);
      }
      t.tb.appendChild(tr);
    });
    body.appendChild(t.tbl);
    if (window.besaOplossen) window.besaOplossen.bindSignals(body);
  }

  function showPendingReqModal() {
    var data = curData(); if (!data) return;
    var rows = data.pending_requests || [];
    var body = openModal("Openstaande aanvragen", rows.length + (rows.length === 1 ? " aanvraag" : " aanvragen") + " — nog niet lopend, dus (nog) niet te declareren");
    if (!body) return;
    if (!rows.length) { emptyRow(body, "Geen openstaande aanvragen."); return; }
    var t = buildTable(["Cliënt", "Beschikking", "Zorgsoort", "Aangevraagd vanaf"]);
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", r.client || "—"));
      tr.appendChild(el("td", null, r.naam || "—"));
      tr.appendChild(el("td", null, r.zorgsoort || "—"));
      tr.appendChild(el("td", null, dateNL(r.start)));
      t.tb.appendChild(tr);
    });
    body.appendChild(t.tbl);
  }

  function showActiveModal() {
    var data = curData(); if (!data) return;
    var rows = data.active_list || [];
    var body = openModal("Actieve beschikkingen", rows.length + (rows.length === 1 ? " beschikking" : " beschikkingen") + " — cliënt in zorg én beschikking loopt nog");
    if (!body) return;
    if (!rows.length) { emptyRow(body, "Geen actieve beschikkingen."); return; }
    var t = buildTable(["Cliënt", "Beschikking", "Zorgsoort", "Einddatum"]);
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "bd-td-strong", r.client || "—"));
      tr.appendChild(el("td", null, r.naam || "—"));
      tr.appendChild(el("td", null, r.zorgsoort || "—"));
      tr.appendChild(el("td", null, r.eind ? dateNL(r.eind) : "doorlopend"));
      t.tb.appendChild(tr);
    });
    body.appendChild(t.tbl);
  }

  function dateNL(iso) {
    if (!iso || String(iso).length < 10) return "—";
    var s = String(iso).slice(0, 10);
    return s.slice(8, 10) + "-" + s.slice(5, 7) + "-" + s.slice(0, 4);
  }

  // Maand-breakdown modal met inline accordion (welke cliënten per maand).
  function showMonthsModal(title, sub, items, kind, euro) {
    var body = openModal(title, sub);
    if (!body) return;
    var list = (items || []).filter(function (i) { return (i.amount || 0) > 0 || (i.count || 0) > 0; });
    if (!list.length) { emptyRow(body, "Niets gevonden in deze categorie."); return; }
    list.forEach(function (it) {
      var row = el("div", "bd-mrow");
      var head = el("button", "bd-mrow-head"); head.type = "button";
      var lbl = el("span", "bd-mrow-lbl", ymLabel(it.ym, true));
      var meta = el("span", "bd-mrow-meta");
      if (it.count != null) meta.appendChild(el("span", "bd-mrow-cnt", it.count + (it.count === 1 ? " beschikking" : " beschikkingen")));
      meta.appendChild(el("span", "bd-mrow-amt", fmtEuro(it.amount)));
      var chev = el("span", "bd-mrow-chev", "▸");
      head.appendChild(lbl); head.appendChild(meta); head.appendChild(chev);
      var panel = el("div", "bd-mrow-panel"); panel.hidden = true;
      var loaded = false;
      head.addEventListener("click", function () {
        var open = panel.hidden === false;
        if (open) { panel.hidden = true; head.classList.remove("is-open"); return; }
        head.classList.add("is-open"); panel.hidden = false;
        if (loaded) return;
        loaded = true;
        panel.appendChild(el("p", "bd-mrow-loading", "Laden…"));
        window.besaDashboardDB.detail(it.ym, kind).then(function (det) {
          clear(panel);
          if (!det || !det.length) { panel.appendChild(el("p", "bd-modal-empty", "Geen details.")); return; }
          var hasOplos = !!window.besaOplossen;
          var heads = kind === "to_declare"
            ? ["Cliënt", "Beschikking", "Geschat bedrag"]
            : ["Cliënt", "Beschikking", "Factuur", "Bedrag"];
          if (hasOplos) heads = heads.concat([""]);
          var t = buildTable(heads);
          det.forEach(function (d) {
            var tr = el("tr");
            tr.appendChild(el("td", "bd-td-strong", d.client || "—"));
            tr.appendChild(el("td", null, d.naam || "—"));
            if (kind === "to_declare") {
              tr.appendChild(el("td", "bd-td-eur", fmtEuro(d.bedrag)));
            } else {
              tr.appendChild(el("td", null, d.factuurnummer || "—"));
              tr.appendChild(el("td", "bd-td-eur", fmtEuro(d.bedrag)));
            }
            if (hasOplos) {
              var actTd = el("td", "bd-td-act");
              // to_declare: d.id is de beschikking-id → naar de beschikking om te
              // declareren. pending: d.id is de factuur-id (geen beschikking-id),
              // dus stuur naar de declaratie-/facturenflow.
              var url, knop, uitleg;
              if (kind === "to_declare") {
                url = d.id ? "beschikking-detail?id=" + encodeURIComponent(d.id) : "beschikkingen";
                knop = "Naar beschikking";
                uitleg = "Maak de declaratie voor deze beschikking aan.";
              } else {
                url = "facturen-te-beoordelen";
                knop = "Naar facturen";
                uitleg = "Volg de declaratie op in de facturen-flow.";
              }
              actTd.innerHTML = window.besaOplossen.navBtn(url, knop, uitleg);
              tr.appendChild(actTd);
            }
            t.tb.appendChild(tr);
          });
          panel.appendChild(t.tbl);
          if (window.besaOplossen) window.besaOplossen.bindSignals(panel);
          if (kind === "to_declare") {
            panel.appendChild(el("p", "bd-mrow-note", "Bedrag is een schatting op basis van het gemiddelde maandbedrag uit de eigen factuurhistorie van de beschikking."));
          }
        });
      });
      row.appendChild(head); row.appendChild(panel);
      body.appendChild(row);
    });
  }

  // Klik op een grote geldkaart → detail voor de geselecteerde maand/periode.
  function showCardDetail(kind) {
    var data = curData(); if (!data) return;
    var titles = { to_declare: "Nog te declareren", pending: "Gedeclareerd – wacht op betaling", paid: "Betaald" };
    var months = (data.months || []).filter(function (m) { return m.ym >= selStart && m.ym <= selEnd; });
    var items = months.map(function (m) {
      var amt = kind === "to_declare" ? m.to_declare : (kind === "pending" ? m.declared_pending : m.paid);
      return { ym: m.ym, amount: amt };
    });
    showMonthsModal(titles[kind] + " — " + periodeLabel(), "Klik op een maand voor de cliënten/beschikkingen", items, kind, true);
  }

  /* ---- render ---- */
  function render() {
    var data = curData();
    if (!data) return;
    var win = data.window || {};
    winMin = win.min || winMin; winMax = win.max || winMax;
    var per = data.period || {};
    selStart = per.start || selStart; selEnd = per.end || selEnd;
    syncControls();

    var sel = data.selected || {};
    var ach = data.achterstand || {};
    var lbl = periodeLabel();

    // ROOD — nog te declareren (geselecteerde maand/periode)
    setText("bd-v-todecl", fmtEuro(sel.to_declare));
    setText("bd-todecl-cnt", fmtInt(sel.to_declare_cnt) + (Number(sel.to_declare_cnt) === 1 ? " beschikking zonder declaratie" : " beschikkingen zonder declaratie"));
    setText("bd-lbl-todecl", lbl);
    setText("bd-v-achter", fmtEuro(ach.to_declare_total));
    setText("bd-v-voor", fmtEuro(ach.declared_pending_total));

    // ORANJE — gedeclareerd, wacht op betaling
    setText("bd-v-pending", fmtEuro(sel.declared_pending));
    setText("bd-pending-cnt", fmtInt(sel.pending_cnt) + (Number(sel.pending_cnt) === 1 ? " factuur" : " facturen"));
    setText("bd-lbl-pending", lbl);

    // GROEN — betaald
    setText("bd-v-paid", fmtEuro(sel.paid));
    setText("bd-paid-cnt", fmtInt(sel.paid_cnt) + (Number(sel.paid_cnt) === 1 ? " factuur" : " facturen"));
    setText("bd-lbl-paid", lbl);

    // Tellers
    setText("bd-v-actief", fmtInt(data.active_count));
    setText("bd-v-60", fmtInt((data.overdue_60d || []).length));
    setText("bd-v-open", fmtInt((data.pending_requests || []).length));

    // Maandgrafiek (groen/oranje/rood), klikbaar → maand selecteren
    renderVBars({
      barsId: "bd-monthly-stack", axisId: "bd-stack-labels", yId: "bd-y-labels",
      euro: true, stacked: true,
      activeKey: (selStart === selEnd ? selStart : null),
      onPick: function (ym) { setMode("maand"); selStart = selEnd = ym; reload(); },
      rows: (data.months || []).map(function (m) {
        return {
          key: m.ym, label: ymShort(m.ym),
          segs: [
            { name: "Betaald", v: m.paid || 0, cls: "bd-vbar-seg--g", color: "var(--green)" },
            { name: "Wacht op betaling", v: m.declared_pending || 0, cls: "bd-vbar-seg--o", color: "var(--yellow)" },
            { name: "Nog te declareren", v: m.to_declare || 0, cls: "bd-vbar-seg--r", color: "var(--red)" },
          ],
        };
      }),
    });

    // Onderste charts
    renderVBars({
      barsId: "bd-zorg-bars", axisId: "bd-zorg-axis", yId: "bd-zorg-y",
      rows: (data.care_types || []).map(function (c) { return { label: c.name, value: c.count }; }),
    });
    renderVBars({
      barsId: "bd-loc-bars", axisId: "bd-loc-axis", yId: "bd-loc-y",
      rows: (data.locations || []).map(function (c) { return { label: c.name, value: c.count }; }),
    });
    renderVBars({
      barsId: "bd-proc-bars", axisId: "bd-proc-axis", yId: "bd-proc-y",
      rows: (data.processing_time || []).map(function (c) { return { label: c.time_range, value: c.count }; }),
    });
  }

  /* ---- periode-selector ---- */
  function fillMonthSelect(sel, months, selectedYm) {
    if (!sel) return;
    clear(sel);
    months.forEach(function (ym) {
      var o = el("option", null, ymLabel(ym, true));
      o.value = ym;
      if (ym === selectedYm) o.selected = true;
      sel.appendChild(o);
    });
  }
  function syncControls() {
    var months = monthsBetween(winMin, winMax);
    if (!months.length) return;
    fillMonthSelect($("bd-maand"), months, selStart);
    fillMonthSelect($("bd-van"), months, selStart);
    fillMonthSelect($("bd-tot"), months, selEnd);
    // mode-knoppen
    var bm = $("bd-mode-maand"), bp = $("bd-mode-periode");
    if (bm && bp) {
      bm.classList.toggle("is-active", mode === "maand"); bm.setAttribute("aria-selected", mode === "maand");
      bp.classList.toggle("is-active", mode === "periode"); bp.setAttribute("aria-selected", mode === "periode");
    }
    var pm = $("bd-pick-maand"), pp = $("bd-pick-periode");
    if (pm) pm.hidden = mode !== "maand";
    if (pp) pp.hidden = mode !== "periode";
    // pijl-knoppen aan/uit
    var idx = months.indexOf(selStart);
    var prev = $("bd-prev"), next = $("bd-next");
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= months.length - 1;
  }
  function setMode(m) { mode = m; }
  function reload() {
    var p = window.besaDashboardDB.load(selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null);
    p.then(render);
  }

  function wireControls() {
    var bm = $("bd-mode-maand"), bp = $("bd-mode-periode");
    if (bm) bm.addEventListener("click", function () {
      mode = "maand"; selEnd = selStart; syncControls(); reload();
    });
    if (bp) bp.addEventListener("click", function () {
      mode = "periode"; syncControls();
    });
    var maand = $("bd-maand");
    if (maand) maand.addEventListener("change", function () { selStart = selEnd = maand.value; reload(); });
    var prev = $("bd-prev"), next = $("bd-next");
    function step(delta) {
      var months = monthsBetween(winMin, winMax);
      var idx = months.indexOf(selStart);
      if (idx < 0) return;
      var ni = idx + delta;
      if (ni < 0 || ni >= months.length) return;
      selStart = selEnd = months[ni]; reload();
    }
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
    var van = $("bd-van"), tot = $("bd-tot");
    function rangeChange() {
      var a = van.value, b = tot.value;
      if (a > b) { var t = a; a = b; b = t; }
      selStart = a; selEnd = b; reload();
    }
    if (van) van.addEventListener("change", rangeChange);
    if (tot) tot.addEventListener("change", rangeChange);

    // KPI-kaarten (div role=button) → drill-down voor de geselecteerde periode.
    function wireCard(id, fn) {
      var n = $(id); if (!n) return;
      n.addEventListener("click", function (e) { if (e.target.closest(".bd-split")) return; fn(); });
      n.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".bd-split")) { e.preventDefault(); fn(); }
      });
    }
    wireCard("bd-card-todecl", function () { showCardDetail("to_declare"); });
    wireCard("bd-card-pending", function () { showCardDetail("pending"); });
    wireCard("bd-card-paid", function () { showCardDetail("paid"); });
    // Sub-bedragen (echte buttons) → achterstand-modals per maand.
    var sA = $("bd-split-achter");
    if (sA) sA.addEventListener("click", function (e) {
      e.stopPropagation();
      var d = curData() || {};
      showMonthsModal("Achterstand — nog te declareren in eerdere maanden", "Eerdere maanden t.o.v. " + periodeLabel() + " · klik op een maand voor de beschikkingen", ((d.achterstand || {}).to_declare_by_month) || [], "to_declare", true);
    });
    var sV = $("bd-split-voor");
    if (sV) sV.addEventListener("click", function (e) {
      e.stopPropagation();
      var d = curData() || {};
      showMonthsModal("Lopende voorafgaande maanden", "Gedeclareerd maar nog niet betaald, vóór " + periodeLabel() + " · klik op een maand voor de facturen", ((d.achterstand || {}).declared_pending_by_month) || [], "pending", true);
    });
    var cAct = $("bd-card-actief"); if (cAct) cAct.addEventListener("click", showActiveModal);
    var c60 = $("bd-card-60"); if (c60) c60.addEventListener("click", showOverdueModal);
    var cOpen = $("bd-card-open"); if (cOpen) cOpen.addEventListener("click", showPendingReqModal);

    // modal sluiten
    var x = $("bd-modal-x"); if (x) x.addEventListener("click", closeModal);
    var bd = $("bd-modal-backdrop"); if (bd) bd.addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { var m = $("bd-modal"); if (m && !m.hidden) closeModal(); }
    });
  }

  async function init() {
    wireControls();
    try {
      if (window.besaDashboardDB && window.besaDashboardDB.ready) await window.besaDashboardDB.ready;
    } catch (e) { /* reporter meldde al */ }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
