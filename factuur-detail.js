/*
 * factuur-detail.js — toont + bewerkt één factuur (disposition-payment),
 * 1-op-1 zoals BS2 ("Beschikking uitbetaling gegevens").
 *  - Status = bewerkbare dropdown met gekleurde pills.
 *  - "Betaald op"-datumveld verschijnt ALLEEN bij status "Betaald".
 *  - "Wijzigingen opslaan" schrijft naar Supabase (HARDE REGEL #0).
 * Bron: public.bs2_disposition_payments (per id; 100% BS2-data).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function qp(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }

  function eur(v) {
    if (v == null || v === "" || isNaN(Number(v))) return "—";
    var n = Math.round(Number(v) * 100) / 100;
    return "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dNL(v) {
    if (!v) return "—";
    var s = String(v).slice(0, 10), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "-" + m[2] + "-" + m[1]) : s;
  }
  function dLang(v) {
    if (!v) return "—";
    var s = String(v).slice(0, 10), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    var M = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    return parseInt(m[3], 10) + " " + M[parseInt(m[2], 10) - 1] + " " + m[1];
  }
  function ymd(v) { if (!v) return ""; var s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }

  // 4 selecteerbare statussen (BS2-conform). label + pill-kleurklasse.
  var CODES = ["declared_pending", "paid", "to_declare", "not_yet_paid"];
  var LABEL = {
    declared_pending: "Gedeclareerd en in behandeling",
    paid: "Betaald",
    to_declare: "Te declareren",
    not_yet_paid: "Nog niet betaald",
  };
  var PILLCLS = {
    declared_pending: "fdtl-pill--blue",
    paid: "fdtl-pill--green",
    to_declare: "fdtl-pill--amber",
    not_yet_paid: "fdtl-pill--red",
  };
  // BS2 ruwe status → één van de 4 keuzes.
  function toCode(raw) {
    var s = String(raw || "").toLowerCase();
    if (s === "paid") return "paid";
    if (s === "declared_pending") return "declared_pending";
    if (s === "to_declare") return "to_declare";
    if (s === "not_yet_paid") return "not_yet_paid";
    if (s === "outstanding") return "not_yet_paid";
    return "declared_pending";
  }
  var DECLM = { ons: "ONS", manual: "Handmatig", wlz: "WLZ", svb: "SVB" };

  function setText(id, t) { var n = $(id); if (n) n.textContent = (t == null || t === "") ? "—" : String(t); }
  function showError(msg) { var e = $("fdtl-error"); if (e) { e.textContent = msg; e.hidden = false; } }
  function feedback(kind, msg) {
    try {
      if (kind === "ok" && typeof window.showSaveModal === "function") { window.showSaveModal(undefined, msg || "Opgeslagen"); return; }
      if (kind === "ok" && typeof window.showActionFeedback === "function") { window.showActionFeedback("saved", "Factuur"); return; }
    } catch (e) { /* */ }
    if (kind === "err") showError(msg);
    else { var b = $("fdtl-save-btn"); if (b) { var o = b.textContent; b.textContent = "✓ " + (msg || "Opgeslagen"); setTimeout(function () { b.textContent = o; }, 2200); } }
  }

  var ROW = null;       // de geladen factuur-rij
  var curCode = "declared_pending";

  function applyCurrentPill() {
    var p = $("fdtl-status-current");
    if (p) { p.textContent = LABEL[curCode]; p.className = "fdtl-pill " + (PILLCLS[curCode] || "fdtl-pill--blue"); }
    // Status links in de samenvatting óók als massieve gekleurde pill
    // met witte tekst (zelfde als de dropdown).
    var sp = $("fdtl-s-status");
    if (sp) {
      sp.textContent = "";
      var sPill = document.createElement("span");
      sPill.className = "fdtl-pill " + (PILLCLS[curCode] || "fdtl-pill--blue");
      sPill.textContent = LABEL[curCode];
      sp.appendChild(sPill);
    }
    // markeer geselecteerde optie
    var opts = document.querySelectorAll(".fdtl-status-opt");
    for (var i = 0; i < opts.length; i += 1) {
      opts[i].classList.toggle("is-selected", opts[i].getAttribute("data-status") === curCode);
    }
    // "Betaald op" alleen bij paid
    var bf = $("fdtl-betaaldop-field");
    if (bf) bf.hidden = (curCode !== "paid");
  }

  function render(row) {
    if (!row) { showError("Factuur niet gevonden."); return; }
    ROW = row;
    var raw = (row.raw && typeof row.raw === "object") ? row.raw : {};
    var disp = raw.disposition || {};
    var cl = disp.client || {};
    curCode = toCode(row.status || raw.status);
    var clientLabel = row.client_name || cl.name || "—";
    if (cl.client_number || row.client_number) clientLabel += " (#" + (row.client_number || cl.client_number) + ")";
    var beschNaam = row.beschikking_naam || disp.name || "—";
    var inv = row.invoice_number || raw.invoice_number || "";

    setText("fdtl-title", "Factuur " + inv);
    setText("fdtl-hero-naam", beschNaam);
    setText("fdtl-s-factuur", inv);
    setText("fdtl-s-besch", beschNaam);
    setText("fdtl-s-client", clientLabel);
    setText("fdtl-s-datum", dLang(row.ends_at || raw.ends_at));
    setText("fdtl-s-betaald", row.paid_at ? dLang(row.paid_at) : "—");
    setText("fdtl-s-bericht", (row.ons_message || raw.ons_message) || "—");
    setText("fdtl-s-bedrag", eur(row.amount != null ? row.amount : raw.amount));
    setText("fdtl-st-albetaald", eur(row.al_betaald != null ? row.al_betaald : disp.already_paid));
    setText("fdtl-st-nogniet", eur(row.nog_niet_ontvangen != null ? row.nog_niet_ontvangen : disp.out_standing_amount));

    setText("fdtl-f-factuur", inv);
    setText("fdtl-f-besch", beschNaam);
    setText("fdtl-f-start", dNL(row.starts_at || raw.starts_at));
    setText("fdtl-f-eind", dNL(row.ends_at || raw.ends_at));

    var bd = $("fdtl-f-betaaldop");
    if (bd) bd.value = ymd(row.paid_at || raw.paid_at);
    applyCurrentPill();
  }

  function wireDropdown() {
    var btn = $("fdtl-status-btn"), panel = $("fdtl-status-panel");
    if (!btn || !panel) return;
    function open() { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); }
    function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });
    panel.addEventListener("click", function (e) {
      var opt = e.target && e.target.closest ? e.target.closest(".fdtl-status-opt") : null;
      if (!opt) return;
      var code = opt.getAttribute("data-status");
      if (code && CODES.indexOf(code) >= 0) {
        curCode = code;
        applyCurrentPill();
      }
      close();
    });
    document.addEventListener("click", function (e) {
      if (panel.hidden) return;
      if (!e.target.closest || !e.target.closest("#fdtl-status-sel")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) close();
    });
  }

  async function save() {
    if (!ROW) return;
    var btn = $("fdtl-save-btn");
    var id = ROW.id;
    var betaaldOp = curCode === "paid" ? (($("fdtl-f-betaaldop") || {}).value || null) : null;
    if (curCode === "paid" && !betaaldOp) {
      showError("Vul een 'Betaald op'-datum in voordat je opslaat.");
      return;
    }
    var e0 = $("fdtl-error"); if (e0) e0.hidden = true;
    if (btn) { btn.disabled = true; btn.textContent = "Opslaan…"; }
    try {
      var sb = window.besaSupabase;
      if (!sb) throw new Error("Supabase niet beschikbaar");
      var newRaw = Object.assign({}, (ROW.raw && typeof ROW.raw === "object") ? ROW.raw : {});
      newRaw.status = curCode;
      newRaw.paid_at = betaaldOp;
      var up1 = await sb.from("bs2_disposition_payments")
        .update({ status: curCode, paid_at: betaaldOp, raw: newRaw })
        .eq("id", id);
      if (up1.error) throw up1.error;
      // Spiegel naar facturen-tabel zodat het overzicht consistent is.
      try {
        var fr = await sb.from("facturen").select("data").eq("id", id).maybeSingle();
        var fdata = (fr && fr.data && fr.data.data && typeof fr.data.data === "object") ? fr.data.data : {};
        fdata.betaald_op = betaaldOp;
        await sb.from("facturen")
          .update({ status: LABEL[curCode], betaling_text: curCode, data: fdata, laatst_gewijzigd: new Date().toISOString() })
          .eq("id", id);
      } catch (e2) { /* facturen-spiegel is best-effort */ }
      ROW.status = curCode;
      ROW.paid_at = betaaldOp;
      ROW.raw = newRaw;
      applyCurrentPill();
      setText("fdtl-s-betaald", betaaldOp ? dLang(betaaldOp) : "—");
      if (btn) { btn.disabled = false; }
      feedback("ok", "Wijzigingen opgeslagen");
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Wijzigingen opslaan"; }
      showError("Opslaan mislukt: " + (err && err.message ? err.message : err));
    } finally {
      if (btn && btn.textContent === "Opslaan…") btn.textContent = "Wijzigingen opslaan";
    }
  }

  async function waitForSupabase(ms) {
    var t0 = Date.now();
    while (!window.besaSupabase && Date.now() - t0 < (ms || 8000)) {
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    return window.besaSupabase || null;
  }

  async function init() {
    wireDropdown();
    var sb0 = $("fdtl-save-btn");
    if (sb0) sb0.addEventListener("click", save);

    var id = qp("id");
    if (!id) { showError("Geen factuur-id opgegeven."); return; }
    var sb = await waitForSupabase(8000);
    if (!sb) { showError("Supabase niet beschikbaar."); return; }
    try {
      var res = await sb
        .from("bs2_disposition_payments")
        .select("id,invoice_number,amount,status,paid_at,starts_at,ends_at,client_name,client_number,beschikking_naam,al_betaald,nog_niet_ontvangen,ons_message,raw")
        .eq("id", id)
        .maybeSingle();
      if (res.error) { showError("Laden mislukt: " + res.error.message); return; }
      if (!res.data) { showError("Factuur niet gevonden."); return; }
      render(res.data);
    } catch (e) {
      showError("Fout bij laden: " + (e && e.message ? e.message : e));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
