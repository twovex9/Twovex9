/*
 * financien-locaties-zorgsoorten.js — "Resultaat per zorgsoort"-sectie ONDER de
 * Financiën › Locaties-pagina (op verzoek verplaatst vanuit het losse Zorgsoorten-tabblad).
 *
 * Zelfstandige module met EIGEN element-IDs (fz-*) zodat er geen botsing is met de
 * locatie-IDs op dezelfde pagina. De sectie volgt de periode-keuze van de hoofdpagina
 * via het custom event "ff:fin-periode" (gedispatcht door financien-locaties.js).
 *
 * Cijfers uit dezelfde read-only RPC's als het oude tabblad:
 *   financien_zorgsoorten_dashboard / financien_zorgsoort_detail
 *   (security definer, afgeschermd op Eigenaar/Directeur/Finance via can_view_financien()).
 * Tarief-bewerken loopt via window.zorgsoortenDB.update().
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var n = $(id); if (n) n.textContent = t; }
  function setHTML(id, h) { var n = $(id); if (n) n.innerHTML = h; }
  function clear(elm) { while (elm && elm.firstChild) elm.removeChild(elm.firstChild); }
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
  var MND = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  function ymLabel(ym) {
    if (!ym || ym.length < 7) return "";
    var mi = (parseInt(ym.slice(5, 7), 10) || 1) - 1;
    var nm = MND[mi] || "?"; nm = nm.charAt(0).toUpperCase() + nm.slice(1);
    return nm + " " + ym.slice(0, 4);
  }

  // ─── state ───
  var _data = null;
  var selStart = null, selEnd = null;   // "YYYY-MM" — volgt de hoofdpagina
  var lastKey = null;                   // voorkomt dubbel laden bij ongewijzigde periode
  var _loaded = false;
  var openZs = null;                    // naam van de opengeklapte zorgsoort (drill-down)
  var tariefEditId = null;             // id van de zorgsoort waarvan het tarief bewerkt wordt

  function isoOf(ym) { return ym ? ym + "-01" : null; }
  function periodeLabel() {
    if (!selStart) return "";
    if (selStart === selEnd) return ymLabel(selStart);
    return ymLabel(selStart) + " t/m " + ymLabel(selEnd);
  }

  // ─── data ───
  async function ensureSupabase() {
    if (window.ffSupabaseReady) { try { await window.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!window.ffSupabase) throw new Error("Supabase client niet geladen");
  }
  async function loadData() {
    try {
      await ensureSupabase();
      var res = await window.ffSupabase.rpc("financien_zorgsoorten_dashboard", {
        p_start: isoOf(selStart), p_end: isoOf(selEnd),
      });
      if (res.error) throw res.error;
      _data = res.data || null;
    } catch (err) {
      if (window.console) console.error("[financien-locaties-zorgsoorten] laden mislukt:", err);
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Financiën-locaties — zorgsoorten", err);
    }
    return _data;
  }
  async function loadDetail(zorgsoort) {
    try {
      await ensureSupabase();
      var res = await window.ffSupabase.rpc("financien_zorgsoort_detail", {
        p_zorgsoort: zorgsoort, p_start: isoOf(selStart), p_end: isoOf(selEnd),
      });
      if (res.error) throw res.error;
      return res.data || null;
    } catch (err) {
      if (window.console) console.error("[financien-locaties-zorgsoorten] detail mislukt:", err);
      return null;
    }
  }

  // ─── tabel ───
  function tariefCell(zs) {
    if (zs.tarief == null || !isFinite(Number(zs.tarief))) {
      return el("span", "fin-zs-notarief", "— niet ingesteld");
    }
    return el("span", null, "€ " + Number(zs.tarief).toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " / " + (zs.eenheid || "uur"));
  }

  function renderZsTable(rows) {
    var tb = $("fz-zs-tbody"); if (!tb) return;
    clear(tb);
    var tD = 0, tU = 0, tK = 0, tO = 0;
    if (!rows.length) {
      var trE = el("tr"); var tdE = el("td", "fin-empty", "Geen zorgsoorten met diensten in deze periode."); tdE.colSpan = 9;
      trE.appendChild(tdE); tb.appendChild(trE);
    }
    rows.forEach(function (zs) {
      var res = Number(zs.resultaat) || 0;
      var tr = el("tr", "fin-zs-row");
      var tdN = el("td", "fin-loc-name");
      tdN.appendChild(el("span", "fin-zs-naam", zs.naam));
      tr.appendChild(tdN);
      tr.appendChild((function () { var td = el("td", "fin-num"); td.appendChild(tariefCell(zs)); return td; })());
      tr.appendChild(el("td", "fin-num", fmtInt(zs.diensten)));
      tr.appendChild(el("td", "fin-num", fmtUur(zs.uren)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(zs.kosten)));
      tr.appendChild(el("td", "fin-num fin-eur", fmtEuro(zs.omzet)));
      tr.appendChild(el("td", "fin-num fin-eur " + (res >= 0 ? "fin-pos" : "fin-neg"), fmtEuro(res)));
      tr.appendChild(el("td", "fin-num", zs.omzet > 0 ? fmtPct(zs.marge_pct) : "—"));
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
    setText("fz-foot-diensten", fmtInt(tD));
    setText("fz-foot-uren", fmtUur(tU));
    setText("fz-foot-kosten", fmtEuro(tK));
    setText("fz-foot-omzet", fmtEuro(tO));
    var tRes = tO - tK;
    var foot = $("fz-foot-result");
    if (foot) { foot.textContent = fmtEuro(tRes); foot.className = "fin-num fin-eur bd-td-strong " + (tRes >= 0 ? "fin-pos" : "fin-neg"); }
    setText("fz-foot-marge", tO > 0 ? fmtPct(Math.round((tRes / tO) * 1000) / 10) : "—");
  }

  // ─── modal-helpers (eigen modals, deelt alleen de body-class met andere modals) ───
  function anyModalOpen() {
    var ids = ["bd-modal", "fin-onk-modal", "fin-koppel-modal", "fz-modal", "fz-tarief-modal"];
    for (var i = 0; i < ids.length; i++) { var m = $(ids[i]); if (m && !m.hidden) return true; }
    return false;
  }
  function syncBodyModal() { if (!anyModalOpen()) document.body.classList.remove("bd-modal-open"); }

  // ─── drill-down ───
  function openDetail(naam) {
    openZs = naam;
    var m = $("fz-modal"); if (!m) return;
    setText("fz-modal-title", naam);
    setText("fz-modal-sub", "Laden…");
    var body = $("fz-modal-body"); if (body) clear(body);
    m.hidden = false;
    document.body.classList.add("bd-modal-open");
    loadDetail(naam).then(function (d) {
      if (openZs !== naam) return;
      renderDetail(naam, d);
    });
  }
  function closeModal() {
    openZs = null;
    var m = $("fz-modal"); if (m) m.hidden = true;
    syncBodyModal();
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
    var body = $("fz-modal-body"); if (!body) return;
    clear(body);
    if (!d || d.unauthorized) { setText("fz-modal-sub", "Geen gegevens beschikbaar."); return; }
    var tot = d.totals || {};
    var res = Number(tot.resultaat) || 0;
    var eenheid = d.eenheid || "uur";
    var tariefTxt = (d.tarief != null) ? ("€ " + Number(d.tarief).toLocaleString("nl-NL", { maximumFractionDigits: 2 }) + " / " + eenheid) : "geen tarief ingesteld";
    setHTML("fz-modal-sub", esc(periodeLabel()) + " · tarief " + esc(tariefTxt));

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
    setText("fz-tarief-zs", zs.naam + " — eenheid: per " + (zs.eenheid || "uur"));
    setText("fz-tarief-eenheid", "per " + (zs.eenheid || "uur"));
    var o = $("fz-tarief-opbrengst"); if (o) o.value = (zs.tarief != null ? zs.tarief : "");
    var k = $("fz-tarief-kosten"); if (k) k.value = (zs.kosten_tarief != null ? zs.kosten_tarief : "");
    var err = $("fz-tarief-err"); if (err) err.hidden = true;
    var m = $("fz-tarief-modal"); if (m) m.hidden = false;
    document.body.classList.add("bd-modal-open");
    setTimeout(function () { if (o) o.focus(); }, 60);
  }
  function closeTariefForm() {
    var m = $("fz-tarief-modal"); if (m) m.hidden = true;
    syncBodyModal();
  }
  function saveTarief(e) {
    if (e) e.preventDefault();
    if (!tariefEditId) return;
    var err = $("fz-tarief-err");
    function showErr(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    if (!window.zorgsoortenDB || !window.zorgsoortenDB.update) { showErr("Zorgsoorten-data niet geladen."); return; }
    var oVal = $("fz-tarief-opbrengst").value;
    var kVal = $("fz-tarief-kosten").value;
    var patch = {
      tarief: (oVal === "" ? null : oVal),
      kostenTarief: (kVal === "" ? null : kVal),
    };
    var btn = $("fz-tarief-save"); if (btn) btn.disabled = true;
    window.zorgsoortenDB.update(tariefEditId, patch).then(function () {
      if (btn) btn.disabled = false;
      closeTariefForm();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Tarief");
      reload(true);   // tarief gewijzigd → opnieuw laden (zelfde periode)
    }).catch(function (er) {
      if (btn) btn.disabled = false;
      showErr("Opslaan mislukt: " + (er && er.message ? er.message : er));
    });
  }

  // ─── render ───
  function renderUnavailable(msg) {
    var sec = $("fz-section"); if (!sec) return;
    var tb = $("fz-zs-tbody");
    if (tb) { clear(tb); var tr = el("tr"); var td = el("td", "fin-empty", msg); td.colSpan = 9; tr.appendChild(td); tb.appendChild(tr); }
  }
  function render() {
    var data = _data;
    if (data && data.unauthorized) { renderUnavailable("Geen toegang tot de zorgsoort-cijfers."); return; }
    if (!data) { renderUnavailable("Zorgsoort-cijfers konden niet geladen worden."); return; }
    // periode kan door de RPC zijn ingevuld als we zonder periode startten
    var per = data.period || {};
    if (!selStart && per.start) { selStart = per.start; selEnd = per.end || per.start; lastKey = selStart + "|" + selEnd; }
    renderZsTable(data.zorgsoorten || []);
    var bd = $("fz-modal");
    if (openZs && bd && !bd.hidden) openDetail(openZs);   // ververs open drill-down
  }
  function reload(force) {
    if (force) lastKey = null;
    loadData().then(function () { _loaded = true; render(); });
  }

  // ─── periode-sync met de hoofdpagina ───
  function onPeriode(ev) {
    var d = (ev && ev.detail) || {};
    var ns = d.start || null, ne = d.end || ns;
    var key = ns + "|" + ne;
    if (key === lastKey && _loaded) return;   // niets veranderd
    selStart = ns; selEnd = ne; lastKey = key;
    reload(false);
  }

  function wire() {
    document.addEventListener("ff:fin-periode", onPeriode);

    var x = $("fz-modal-x"); if (x) x.addEventListener("click", closeModal);
    var bd = $("fz-modal-backdrop"); if (bd) bd.addEventListener("click", closeModal);

    var tX = $("fz-tarief-x"); if (tX) tX.addEventListener("click", closeTariefForm);
    var tCancel = $("fz-tarief-cancel"); if (tCancel) tCancel.addEventListener("click", closeTariefForm);
    var tBack = $("fz-tarief-backdrop"); if (tBack) tBack.addEventListener("click", closeTariefForm);
    var tForm = $("fz-tarief-form"); if (tForm) tForm.addEventListener("submit", saveTarief);

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var tm = $("fz-tarief-modal");
      if (tm && !tm.hidden) { closeTariefForm(); return; }
      var m = $("fz-modal"); if (m && !m.hidden) closeModal();
    });
  }

  function init() {
    if (!$("fz-section")) return;   // sectie niet aanwezig → niets doen
    wire();
    // Vangnet: laadt de hoofdpagina (en dus het periode-event) niet binnen 2,5s,
    // dan zelfstandig met de standaard-periode laden zodat de sectie nooit leeg blijft.
    setTimeout(function () { if (!_loaded) reload(false); }, 2500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
