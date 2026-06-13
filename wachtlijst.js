/* global window, document */
/**
 * wachtlijst.js — Wachtlijst-pagina (Cliëntmodule 2.0 fase 2).
 *
 * Leest via window.wachtlijstDB (RPC's clientreis_context / wachtlijst_overzicht)
 * en plant plaatsingen via clientreis_zet_status → plaatsing_gepland.
 * Alleen zichtbaar voor rollen met kan_beoordelen (server-side gehandhaafd in
 * de RPC's — de UI is cosmetisch). Rij-klik opent het cliëntdossier;
 * "Plaatsing plannen" bevestigt inline in de rij (geen browser-popups).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // [hidden]-valkuil: classes met expliciete display overschrijven het
  // UA-stylesheet — daarom ALTIJD beide zetten.
  function setVisible(el, show) {
    if (!el) return;
    el.style.display = show ? "" : "none";
    el.hidden = !show;
  }

  // Datums: date-kolommen (yyyy-mm-dd) via regex — nooit new Date()/toISOString()
  // (UTC-shift-valkuil). Timestamps via lokale Date-componenten.
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtDate(s) {
    if (!s) return "—";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (m) return m[3] + "-" + m[2] + "-" + m[1];
    return fmtTimestamp(s);
  }
  function fmtTimestamp(s) {
    if (!s) return "—";
    var t = Date.parse(s);
    if (!isFinite(t)) return "—";
    var d = new Date(t);
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  // Gemiddelden: NL-notatie, max 1 decimaal (43 / 43,5).
  function fmtGem(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    var r = Math.round(v * 10) / 10;
    return String(r).replace(".", ",");
  }
  function fmtInt(n) {
    var v = Number(n);
    if (!isFinite(v)) return "0";
    return String(Math.round(v));
  }

  var URG_LABEL = { spoed: "Spoed", hoog: "Hoog", middel: "Middel", laag: "Laag" };
  var URG_CLS = { spoed: "wl-pill--rood", hoog: "wl-pill--rood", middel: "wl-pill--geel", laag: "wl-pill--muted" };

  var state = {
    canBeoordelen: false,
    kpis: null,
    rows: [],
    search: "",
    confirmId: null,   // client_id waarvoor de inline bevestig-strook open staat
    busy: false,
    loadedOnce: false,
  };

  function urgBadge(urgentie) {
    if (!urgentie) return '<span class="wl-pill wl-pill--muted">—</span>';
    var lbl = URG_LABEL[urgentie] || urgentie;
    var cls = URG_CLS[urgentie] || "wl-pill--muted";
    return '<span class="wl-pill ' + cls + '">' + escapeHtml(lbl) + "</span>";
  }

  // Dagen wachtend: >60 rood, >30 oranje (geel-token), anders muted.
  function dagenBadge(n) {
    var v = Number(n);
    if (!isFinite(v)) return '<span class="wl-pill wl-pill--muted">—</span>';
    var cls = v > 60 ? "wl-pill--rood" : (v > 30 ? "wl-pill--geel" : "wl-pill--muted");
    return '<span class="wl-pill ' + cls + '">' + escapeHtml(fmtInt(v)) + "</span>";
  }

  // ─── Laden ─────────────────────────────────────────────────────────────────
  async function load() {
    var tbody = $("wl-tbody");
    if (!state.loadedOnce && tbody) {
      tbody.innerHTML = '<tr><td colspan="10" class="wl-loading-cell">Wachtlijst laden…</td></tr>';
    }
    var data;
    try {
      data = await window.wachtlijstDB.overzicht();
    } catch (ex) {
      // Nette foutkaart i.p.v. een lege/half gevulde pagina.
      var msg = (ex && ex.message) || "Onbekende fout bij het laden van de wachtlijst.";
      $("wl-error-msg").textContent = msg;
      setVisible($("wl-content"), false);
      setVisible($("wl-error"), true);
      return;
    }
    setVisible($("wl-error"), false);
    setVisible($("wl-content"), true);
    state.kpis = (data && data.kpis) || {};
    state.rows = (data && Array.isArray(data.rijen)) ? data.rijen : [];
    state.loadedOnce = true;
    // Bevestig-strook sluiten als de rij niet meer op de lijst staat.
    if (state.confirmId && !state.rows.some(function (r) { return r.client_id === state.confirmId; })) {
      state.confirmId = null;
    }
    renderKpis();
    renderTable();
  }

  // ─── KPI's + wachttijd-kaarten ─────────────────────────────────────────────
  function renderKpis() {
    var k = state.kpis || {};
    $("wl-kpi-aantal").textContent = fmtInt(k.aantal || 0);
    $("wl-kpi-wachttijd").textContent = fmtGem(k.gem_wachttijd_dagen || 0);
    renderBreakdown($("wl-per-gemeente"), k.per_gemeente, "gemeente", "Gemeente");
    renderBreakdown($("wl-per-product"), k.per_product, "product", "Product");
  }

  function renderBreakdown(el, list, key, kop) {
    if (!el) return;
    var rows = Array.isArray(list) ? list : [];
    if (!rows.length) {
      el.innerHTML = '<p class="wl-card-empty">Geen wachtenden.</p>';
      return;
    }
    el.innerHTML = '<table class="wl-mini-table"><thead><tr>'
      + "<th>" + escapeHtml(kop) + '</th><th class="wl-num">Aantal</th><th class="wl-num">Gem. dagen</th>'
      + "</tr></thead><tbody>"
      + rows.map(function (r) {
        r = r || {};
        return "<tr>"
          + "<td>" + escapeHtml(r[key] || "—") + "</td>"
          + '<td class="wl-num">' + escapeHtml(fmtInt(r.aantal || 0)) + "</td>"
          + '<td class="wl-num">' + escapeHtml(fmtGem(r.gem_dagen || 0)) + "</td>"
          + "</tr>";
      }).join("")
      + "</tbody></table>";
  }

  // ─── Tabel ─────────────────────────────────────────────────────────────────
  function rowsToShow() {
    var q = state.search.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter(function (r) {
      var hay = [r.naam, r.gemeente, r.product, r.referentie].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function actiesHtml(r) {
    if (!state.canBeoordelen) return '<span class="wl-geen-actie">—</span>';
    var cid = escapeHtml(r.client_id || "");
    if (state.confirmId && state.confirmId === r.client_id) {
      return '<div class="wl-confirm">'
        + '<span class="wl-confirm-text">Plaatsing plannen?</span>'
        + '<button type="button" class="btn-primary wl-confirm-ok" data-client="' + cid + '">Bevestigen</button>'
        + '<button type="button" class="btn-outline wl-confirm-cancel">Annuleren</button>'
        + "</div>";
    }
    return '<button type="button" class="btn-outline wl-plan-btn" data-client="' + cid + '">Plaatsing plannen</button>';
  }

  function renderTable() {
    var tbody = $("wl-tbody");
    var empty = $("wl-empty");
    var rows = rowsToShow();
    if (!rows.length) {
      tbody.innerHTML = "";
      empty.textContent = state.rows.length
        ? "Geen cliënten gevonden voor deze zoekopdracht."
        : "Geen cliënten op de wachtlijst.";
      setVisible(empty, true);
      return;
    }
    setVisible(empty, false);
    tbody.innerHTML = rows.map(function (r) {
      return '<tr class="wl-row" data-id="' + escapeHtml(r.client_id || "") + '" tabindex="0" aria-label="Dossier van ' + escapeHtml(r.naam || "cliënt") + ' openen">'
        + '<td class="wl-cell-client">' + escapeHtml(r.naam || "—") + "</td>"
        + "<td>" + escapeHtml(r.gemeente || "—") + "</td>"
        + "<td>" + escapeHtml(r.product || "—") + "</td>"
        + "<td>" + urgBadge(r.urgentie) + "</td>"
        + "<td>" + escapeHtml(fmtDate(r.verwachte_startdatum)) + "</td>"
        + "<td>" + escapeHtml(fmtDate(r.wachtlijst_sinds)) + "</td>"
        + "<td>" + dagenBadge(r.dagen_wachtend) + "</td>"
        + '<td class="wl-cell-reden">' + escapeHtml(r.reden || "—") + "</td>"
        + '<td class="wl-cell-ref">' + escapeHtml(r.referentie || "—") + "</td>"
        + '<td class="wl-actions-cell">' + actiesHtml(r) + "</td>"
        + "</tr>";
    }).join("");
  }

  // ─── Plaatsing plannen ─────────────────────────────────────────────────────
  async function doPlaatsen(clientId, okBtn) {
    if (state.busy || !clientId) return;
    state.busy = true;
    if (okBtn) okBtn.disabled = true;
    try {
      await window.wachtlijstDB.plaatsen(clientId);
      state.confirmId = null;
      // De data-laag dispatcht ff:wachtlijst-updated → overzicht ververst zichzelf.
      if (window.showActionFeedback) window.showActionFeedback("saved", "Plaatsing gepland");
    } catch (ex) {
      var msg = (ex && ex.message) || "Plaatsing plannen mislukt. Probeer het opnieuw.";
      if (window.showError) window.showError(msg);
      else if (window.ffReportSyncFailure) window.ffReportSyncFailure("Wachtlijst — plaatsen", ex);
    } finally {
      state.busy = false;
      if (okBtn) okBtn.disabled = false;
    }
  }

  function openDossier(clientId) {
    if (!clientId) return;
    window.location.href = "client-detail.html?id=" + encodeURIComponent(clientId);
  }

  // ─── Wiring + boot ─────────────────────────────────────────────────────────
  function onTbodyClick(e) {
    var planBtn = e.target.closest(".wl-plan-btn");
    if (planBtn) {
      state.confirmId = planBtn.getAttribute("data-client") || null;
      renderTable();
      return;
    }
    var okBtn = e.target.closest(".wl-confirm-ok");
    if (okBtn) {
      doPlaatsen(okBtn.getAttribute("data-client"), okBtn);
      return;
    }
    if (e.target.closest(".wl-confirm-cancel")) {
      state.confirmId = null;
      renderTable();
      return;
    }
    var tr = e.target.closest("tr[data-id]");
    if (tr) openDossier(tr.getAttribute("data-id"));
  }

  function wireStatic() {
    $("wl-search").addEventListener("input", function (e) {
      state.search = e.target.value;
      renderTable();
    });

    var tbody = $("wl-tbody");
    tbody.addEventListener("click", onTbodyClick);
    tbody.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      if (e.target.closest("button")) return; // knoppen handelen Enter zelf af
      var tr = e.target.closest("tr[data-id]");
      if (tr) openDossier(tr.getAttribute("data-id"));
    });

    window.addEventListener("ff:wachtlijst-updated", function () { load(); });
  }

  async function boot() {
    wireStatic();
    var ctx = null;
    try { ctx = await window.wachtlijstDB.getContext(); } catch (e) { ctx = null; }
    // Fail-closed: geen context of kan_beoordelen ≠ true ⇒ geen toegang.
    var ok = !!(ctx && ctx.kan_beoordelen === true);
    state.canBeoordelen = ok;
    setVisible($("wl-loading"), false);
    setVisible($("wl-no-access"), !ok);
    setVisible($("wl-content"), ok);
    if (!ok) return;
    await load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
