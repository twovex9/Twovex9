/*
 * financien-zorgsoorten.js — Financiën › Zorgsoorten.
 *
 * Kosten & opbrengst per zorgsoort op basis van de PLANNING:
 *   - Opbrengst = ingeplande uren/dagen × zorgsoort.tarief (instelbaar per zorgsoort).
 *   - Kosten    = ZZP-uurtarief × uren + loondienst geschat (salaris+wgl/contracturen) × uren
 *                 + open diensten × zorgsoort.kosten_tarief.
 *
 * Bron: read-only RPC's financien_zorgsoorten_dashboard / financien_zorgsoort_detail
 * (security definer, server-side afgeschermd op rol Eigenaar/Directeur/Finance via
 * can_view_financien()). Tarief-bewerken loopt via window.zorgsoortenDB.update().
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
    var v = Number(n) || 0;
    return "€ " + v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(n) { return (Math.round(Number(n) || 0)).toLocaleString("nl-NL"); }
  function fmtUur(n) {
    var v = Number(n) || 0;
    return v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }
  function fmtPct(n) { return (n == null) ? "—" : (Math.round(Number(n) * 10) / 10).toLocaleString("nl-NL") + "%"; }
  function euTickSigned(v) {
    var n = Number(v) || 0;
    var a = Math.abs(n);
    var s = a >= 1000 ? "€ " + Math.round(a / 1000) + "k" : "€ " + Math.round(a);
    return (n < 0 ? "−" : "") + s;
  }
  var MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function ymLabel(ym, long) {
    if (!ym) return "";
    var p = String(ym).split("-"); var mi = (parseInt(p[1], 10) || 1) - 1;
    return (MND[mi] || "?") + (long ? " " + p[0] : " '" + String(p[0]).slice(2));
  }
  function ymShort(ym) {
    if (!ym) return "";
    var p = String(ym).split("-"); var mi = (parseInt(p[1], 10) || 1) - 1;
    return (MND[mi] || "?");
  }
  function monthsBetween(minYm, maxYm) {
    var out = [];
    if (!minYm || !maxYm) return out;
    var a = minYm.split("-"), b = maxYm.split("-");
    var y = parseInt(a[0], 10), m = parseInt(a[1], 10);
    var ey = parseInt(b[0], 10), em = parseInt(b[1], 10);
    var guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 600) {
      out.push(y + "-" + String(m).padStart(2, "0"));
      m++; if (m > 12) { m = 1; y++; }
      guard++;
    }
    return out;
  }

  // ─── state ───
  var _data = null;
  var winMin = null, winMax = null;
  var mode = "maand";
  var selStart = null, selEnd = null;
  var openZs = null;       // naam van de opengeklapte zorgsoort (drill-down)
  var tariefEditId = null; // id van de zorgsoort waarvan het tarief bewerkt wordt

  // ─── data ───
  async function ensureSupabase() {
    if (window.besaSupabaseReady) { try { await window.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!window.besaSupabase) throw new Error("Supabase client niet geladen");
  }
  async function loadData(startISO, endISO) {
    try {
      await ensureSupabase();
      var res = await window.besaSupabase.rpc("financien_zorgsoorten_dashboard", {
        p_start: startISO || null, p_end: endISO || null,
      });
      if (res.error) throw res.error;
      _data = res.data || null;
    } catch (err) {
      if (window.console) console.error("[financien-zorgsoorten] laden mislukt:", err);
      if (window.besaReportSyncFailure) window.besaReportSyncFailure("Financiën-zorgsoorten — laden", err);
    }
    return _data;
  }
  async function loadDetail(zorgsoort, startISO, endISO) {
    try {
      await ensureSupabase();
      var res = await window.besaSupabase.rpc("financien_zorgsoort_detail", {
        p_zorgsoort: zorgsoort, p_start: startISO || null, p_end: endISO || null,
      });
      if (res.error) throw res.error;
      return res.data || null;
    } catch (err) {
      if (window.console) console.error("[financien-zorgsoorten] detail mislukt:", err);
      return null;
    }
  }

  function curData() { return _data; }
  function periodeLabel() {
    if (mode === "maand" || selStart === selEnd) return "· " + ymLabel(selStart, true);
    return "· " + ymLabel(selStart, true) + " t/m " + ymLabel(selEnd, true);
  }

  // ─── tooltip (maandgrafiek) ───
  var tipEl = null;
  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = el("div", "bd-tip"); tipEl.hidden = true; document.body.appendChild(tipEl); return tipEl;
  }
  function showTip(html, x, y) {
    var t = ensureTip();
    if (html != null) t.innerHTML = html;
    t.hidden = false;
    t.style.left = (x + 14) + "px";
    t.style.top = (y + 14) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }
  function monthTip(m) {
    var res = Number(m.resultaat) || 0;
    return '<div class="bd-tip-h">' + esc(ymLabel(m.ym, true)) + "</div>"
      + '<div class="bd-tip-row"><span class="bd-tip-sw" style="background:var(--green)"></span><span class="bd-tip-nm">Opbrengst</span><span class="bd-tip-val">' + fmtEuro(m.omzet) + "</span></div>"
      + '<div class="bd-tip-row"><span class="bd-tip-sw" style="background:var(--red)"></span><span class="bd-tip-nm">Kosten</span><span class="bd-tip-val">' + fmtEuro(m.kosten) + "</span></div>"
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

  function tariefCell(zs) {
    if (zs.tarief == null || !isFinite(Number(zs.tarief))) {
      return el("span", "fin-zs-notarief", "— niet ingesteld");
    }
    return el("span", null, "€ " + Number(zs.tarief).toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " / " + (zs.eenheid || "uur"));
  }

  function renderZsTable(rows) {
    var tb = $("fin-zs-tbody"); if (!tb) return;
    clear(tb);
    var tD = 0, tU = 0, tK = 0, tO = 0;
    if (!rows.length) {
      var trE = el("tr"); var tdE = el("td", "bd-hrow-empty", "Geen zorgsoorten in deze periode"); tdE.colSpan = 9;
      trE.appendChild(tdE); tb.appendChild(trE);
    }
    rows.forEach(function (zs) {
      var res = Number(zs.resultaat) || 0;
      var tr = el("tr", "fin-zs-row");
      // Naam + eenheid-badge
      var tdN = el("td", "fin-loc-name");
      tdN.appendChild(el("span", "fin-zs-naam", zs.naam));
      tdN.appendChild(el("span", "fin-zs-eenheid", "per " + (zs.eenheid || "uur")));
      tr.appendChild(tdN);
      tr.appendChild((function () { var td = el("td", "fin-num"); td.appendChild(tariefCell(zs)); return td; })());
      tr.appendChild(el("td", "fin-num", fmtInt(zs.diensten)));
      tr.appendChild(el("td", "fin-num", fmtUur(zs.uren)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(zs.kosten)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(zs.omzet)));
      tr.appendChild(el("td", "fin-num fin-eur " + (res >= 0 ? "fin-pos" : "fin-neg"), fmtEuro(res)));
      tr.appendChild(el("td", "fin-num", zs.omzet > 0 ? fmtPct(zs.marge_pct) : "—"));
      // Acties: tarief bewerken
      var tdA = el("td", "fin-num");
      var pen = el("button", "fin-zs-edit", "✎");
      pen.type = "button";
      pen.title = "Tarief bewerken";
      pen.setAttribute("aria-label", "Tarief bewerken voor " + zs.naam);
      (function (z) { pen.addEventListener("click", function (e) { e.stopPropagation(); openTariefForm(z); }); })(zs);
      tdA.appendChild(pen);
      tr.appendChild(tdA);

      (function (z) { tr.addEventListener("click", function () { openDetail(z.naam); }); })(zs);
      tb.appendChild(tr);

      tD += Number(zs.diensten) || 0; tU += Number(zs.uren) || 0;
      tK += Number(zs.kosten) || 0; tO += Number(zs.omzet) || 0;
    });
    setText("fin-foot-diensten", fmtInt(tD));
    setText("fin-foot-uren", fmtUur(tU));
    setText("fin-foot-kosten", fmtEuro(tK));
    setText("fin-foot-omzet", fmtEuro(tO));
    var tRes = tO - tK;
    var foot = $("fin-foot-result");
    if (foot) { foot.textContent = fmtEuro(tRes); foot.className = "fin-num fin-eur bd-td-strong " + (tRes >= 0 ? "fin-pos" : "fin-neg"); }
    setText("fin-foot-marge", tO > 0 ? fmtPct(Math.round((tRes / tO) * 1000) / 10) : "—");
  }

  // ─── drill-down ───
  function openDetail(naam) {
    openZs = naam;
    var m = $("bd-modal"); if (!m) return;
    setText("bd-modal-title", naam);
    setText("bd-modal-sub", "Laden…");
    var body = $("bd-modal-body"); if (body) clear(body);
    m.hidden = false;
    document.body.classList.add("bd-modal-open");
    loadDetail(naam, selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null).then(function (d) {
      if (openZs !== naam) return; // ondertussen iets anders geopend
      renderDetail(naam, d);
    });
  }
  function closeModal() {
    openZs = null;
    var m = $("bd-modal"); if (m) m.hidden = true;
    var tm = $("fin-tarief-modal");
    if (!tm || tm.hidden) document.body.classList.remove("bd-modal-open");
  }
  function detailTable(title, head, rows) {
    var sec = el("div");
    sec.appendChild(el("h3", "fin-sec-h", title));
    if (!rows.length) { sec.appendChild(el("p", "bd-modal-sub", "Geen gegevens.")); return sec; }
    var wrap = el("div", "fin-table-wrap");
    var t = el("table", "fin-table");
    var thead = el("thead"); var htr = el("tr");
    head.forEach(function (h) { var th = el("th", h.num ? "fin-num" : null, h.label); htr.appendChild(th); });
    thead.appendChild(htr); t.appendChild(thead);
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      r.forEach(function (c) { tr.appendChild(el("td", c.cls || null, c.txt)); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); sec.appendChild(wrap);
    return sec;
  }
  function renderDetail(naam, d) {
    var body = $("bd-modal-body"); if (!body) return;
    clear(body);
    if (!d || d.unauthorized) { setText("bd-modal-sub", "Geen gegevens beschikbaar."); return; }
    var tot = d.totals || {};
    var res = Number(tot.resultaat) || 0;
    var eenheid = d.eenheid || "uur";
    var tariefTxt = (d.tarief != null) ? ("€ " + Number(d.tarief).toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " / " + eenheid) : "geen tarief ingesteld";
    setHTML("bd-modal-sub", esc(periodeLabel().replace(/^· /, "")) + " · tarief " + esc(tariefTxt));

    // Samenvatting (hergebruikt de bestaande dark-safe .fin-sum-stijl)
    var sum = el("div", "fin-sum fin-sum--zs");
    function sCard(lbl, val, cls) {
      var c = el("div", "fin-sum-item");
      c.appendChild(el("span", "fin-sum-lbl", lbl));
      c.appendChild(el("span", "fin-sum-val " + (cls || ""), val));
      return c;
    }
    sum.appendChild(sCard("Uren", fmtUur(tot.uren) + " u"));
    sum.appendChild(sCard("Diensten", fmtInt(tot.diensten)));
    sum.appendChild(sCard("Opbrengst", fmtEuro(tot.omzet)));
    sum.appendChild(sCard("Kosten", fmtEuro(tot.kosten)));
    sum.appendChild(sCard("Resultaat", fmtEuro(res), res >= 0 ? "fin-pos" : "fin-neg"));
    body.appendChild(sum);

    // Cliënten
    var cRows = (d.clienten || []).map(function (c) {
      var r = Number(c.resultaat) || 0;
      return [
        { txt: c.client },
        { txt: fmtUur(c.uren) + " u", cls: "fin-num" },
        { txt: fmtInt(c.diensten), cls: "fin-num" },
        { txt: fmtEuro(c.omzet), cls: "fin-num fin-eur" },
        { txt: fmtEuro(c.kosten), cls: "fin-num fin-eur" },
        { txt: fmtEuro(r), cls: "fin-num fin-eur " + (r >= 0 ? "fin-pos" : "fin-neg") },
      ];
    });
    body.appendChild(detailTable("Cliënten", [
      { label: "Cliënt" }, { label: "Uren", num: true }, { label: "Diensten", num: true },
      { label: "Opbrengst", num: true }, { label: "Kosten", num: true }, { label: "Resultaat", num: true },
    ], cRows));

    // Medewerkers
    var SOORT = { zzp: "ZZP", loondienst: "Loondienst", open: "Open dienst" };
    var mRows = (d.medewerkers || []).map(function (m) {
      return [
        { txt: m.teamlid },
        { txt: SOORT[m.soort] || m.soort || "—" },
        { txt: fmtUur(m.uren) + " u", cls: "fin-num" },
        { txt: fmtInt(m.diensten), cls: "fin-num" },
        { txt: m.uurkosten != null ? fmtEuro(m.uurkosten) : "—", cls: "fin-num fin-eur" },
        { txt: fmtEuro(m.kosten), cls: "fin-num fin-eur" },
      ];
    });
    body.appendChild(detailTable("Medewerkers", [
      { label: "Teamlid" }, { label: "Type" }, { label: "Uren", num: true }, { label: "Diensten", num: true },
      { label: "€ / uur", num: true }, { label: "Kosten", num: true },
    ], mRows));
  }

  // ─── tarief bewerken ───
  function openTariefForm(zs) {
    tariefEditId = zs.id || null;
    setText("fin-tarief-zs", zs.naam + " — eenheid: per " + (zs.eenheid || "uur"));
    setText("fin-tarief-eenheid", "per " + (zs.eenheid || "uur"));
    var o = $("fin-tarief-opbrengst"); if (o) o.value = (zs.tarief != null ? zs.tarief : "");
    var k = $("fin-tarief-kosten"); if (k) k.value = (zs.kosten_tarief != null ? zs.kosten_tarief : "");
    var err = $("fin-tarief-err"); if (err) err.hidden = true;
    var m = $("fin-tarief-modal"); if (m) m.hidden = false;
    document.body.classList.add("bd-modal-open");
    setTimeout(function () { if (o) o.focus(); }, 60);
  }
  function closeTariefForm() {
    var m = $("fin-tarief-modal"); if (m) m.hidden = true;
    var bd = $("bd-modal");
    if (!bd || bd.hidden) document.body.classList.remove("bd-modal-open");
  }
  function saveTarief(e) {
    if (e) e.preventDefault();
    if (!tariefEditId) return;
    var err = $("fin-tarief-err");
    function showErr(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    if (!window.zorgsoortenDB || !window.zorgsoortenDB.update) { showErr("Zorgsoorten-data niet geladen."); return; }
    var oVal = $("fin-tarief-opbrengst").value;
    var kVal = $("fin-tarief-kosten").value;
    var patch = {
      tarief: (oVal === "" ? null : oVal),
      kostenTarief: (kVal === "" ? null : kVal),
    };
    var btn = $("fin-tarief-save"); if (btn) btn.disabled = true;
    window.zorgsoortenDB.update(tariefEditId, patch).then(function () {
      if (btn) btn.disabled = false;
      closeTariefForm();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Tarief");
      reload();
    }).catch(function (er) {
      if (btn) btn.disabled = false;
      showErr("Opslaan mislukt: " + (er && er.message ? er.message : er));
    });
  }

  // ─── periode-selector ───
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
    loadData(selStart ? selStart + "-01" : null, selEnd ? selEnd + "-01" : null).then(render);
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

    var tX = $("fin-tarief-x"); if (tX) tX.addEventListener("click", closeTariefForm);
    var tCancel = $("fin-tarief-cancel"); if (tCancel) tCancel.addEventListener("click", closeTariefForm);
    var tBack = $("fin-tarief-backdrop"); if (tBack) tBack.addEventListener("click", closeTariefForm);
    var tForm = $("fin-tarief-form"); if (tForm) tForm.addEventListener("submit", saveTarief);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var tm = $("fin-tarief-modal");
      if (tm && !tm.hidden) { closeTariefForm(); return; }
      var m = $("bd-modal"); if (m && !m.hidden) closeModal();
    });
  }

  function renderNoAccess() {
    var main = $("fin-body");
    if (!main) return;
    clear(main);
    var box = el("div", "fin-note");
    box.appendChild(el("strong", null, "Geen toegang. "));
    box.appendChild(document.createTextNode("Financiën is alleen beschikbaar voor Eigenaar, Directeur en Finance."));
    main.appendChild(box);
  }

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
    setText("fin-period-lbl", periodeLabel());

    setText("fin-v-omzet", fmtEuro(t.omzet));
    setHTML("fin-omzet-sub", esc(fmtInt(t.diensten)) + " diensten · " + esc(fmtUur(t.uren)) + " u ingepland");

    setText("fin-v-kosten", fmtEuro(t.kosten));
    setHTML("fin-kosten-sub", "ZZP " + esc(fmtEuro(t.kosten_zzp)) + " · Loondienst " + esc(fmtEuro(t.kosten_loondienst)) + " · Open " + esc(fmtEuro(t.kosten_open)));

    setText("fin-v-result", fmtEuro(t.resultaat));
    var pos = (Number(t.resultaat) || 0) >= 0;
    var card = $("fin-card-result");
    if (card) { card.classList.toggle("bd-money--green", pos); card.classList.toggle("bd-money--red", !pos); }
    setText("fin-result-sub", (pos ? "Winst" : "Verlies") + (t.marge_pct != null ? " · marge " + fmtPct(t.marge_pct) : ""));

    renderZsTable(data.zorgsoorten || []);
    renderMonthChart(data.months || []);

    // Drill-down opnieuw vullen als die open staat (na tarief-wijziging / herladen).
    var bd = $("bd-modal");
    if (openZs && bd && !bd.hidden) openDetail(openZs);
  }

  async function init() {
    wireControls();
    await loadData(null, null);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
