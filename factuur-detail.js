/*
 * factuur-detail.js — toont één factuur (disposition-payment) 1-op-1 zoals BS2
 * ("Beschikking uitbetaling gegevens"): Factuurnummer, Beschikking, Cliënt,
 * Datum, Betaald, Status, Ons bericht, Bedrag, Start/Einddatum, Declaratie-
 * methode + Statistieken (Al betaald / Nog niet ontvangen).
 * Bron: Supabase public.bs2_disposition_payments (per id, 100% BS2-data).
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
    var s = String(v).slice(0, 10);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[3] + "-" + m[2] + "-" + m[1]) : s;
  }
  function dLang(v) {
    if (!v) return "—";
    var s = String(v).slice(0, 10);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    var M = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    return parseInt(m[3], 10) + " " + M[parseInt(m[2], 10) - 1] + " " + m[1];
  }
  var STATUS = {
    paid: "Betaald",
    declared_pending: "Gedeclareerd en in behandeling",
    outstanding: "Nog niet betaald",
    to_declare: "Te declareren",
    not_yet_paid: "Nog niet betaald",
  };
  var STATUS_CLS = {
    paid: "fdtl-pill--green",
    declared_pending: "fdtl-pill--blue",
    outstanding: "fdtl-pill--red",
    to_declare: "fdtl-pill--amber",
    not_yet_paid: "fdtl-pill--red",
  };
  var DECLM = { ons: "ONS", manual: "Handmatig", wlz: "WLZ", svb: "SVB" };

  function setText(id, t) { var n = $(id); if (n) n.textContent = (t == null || t === "") ? "—" : String(t); }

  function showError(msg) {
    var e = $("fdtl-error");
    if (e) { e.textContent = msg; e.hidden = false; }
  }

  function render(row) {
    if (!row) { showError("Factuur niet gevonden."); return; }
    var raw = (row.raw && typeof row.raw === "object") ? row.raw : {};
    var disp = raw.disposition || {};
    var cl = disp.client || {};
    var st = String(row.status || raw.status || "").toLowerCase();
    var statusLabel = STATUS[st] || (st || "—");
    var clientLabel = row.client_name || cl.name || "—";
    if (cl.client_number || row.client_number) clientLabel += " (#" + (row.client_number || cl.client_number) + ")";
    var beschNaam = row.beschikking_naam || disp.name || "—";

    setText("fdtl-title", "Factuur " + (row.invoice_number || raw.invoice_number || ""));
    setText("fdtl-hero-naam", beschNaam);
    setText("fdtl-s-factuur", row.invoice_number || raw.invoice_number);
    setText("fdtl-s-besch", beschNaam);
    setText("fdtl-s-client", clientLabel);
    setText("fdtl-s-datum", dLang(row.ends_at || raw.ends_at));
    setText("fdtl-s-betaald", row.paid_at ? dLang(row.paid_at) : "—");
    setText("fdtl-s-status", statusLabel);
    setText("fdtl-s-bericht", (row.ons_message || raw.ons_message) || "—");
    setText("fdtl-s-bedrag", eur(row.amount != null ? row.amount : raw.amount));
    setText("fdtl-st-albetaald", eur(row.al_betaald != null ? row.al_betaald : disp.already_paid));
    setText("fdtl-st-nogniet", eur(row.nog_niet_ontvangen != null ? row.nog_niet_ontvangen : disp.out_standing_amount));

    setText("fdtl-f-factuur", row.invoice_number || raw.invoice_number);
    setText("fdtl-f-besch", beschNaam);
    setText("fdtl-f-start", dNL(row.starts_at || raw.starts_at));
    setText("fdtl-f-eind", dNL(row.ends_at || raw.ends_at));
    setText("fdtl-f-declm", DECLM[String(disp.declaration_method || "").toLowerCase()] || disp.declaration_method || "—");

    var pill = $("fdtl-f-status");
    if (pill) {
      pill.textContent = statusLabel;
      pill.className = "fdtl-pill " + (STATUS_CLS[st] || "fdtl-pill--blue");
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
      if (!res.data) {
        // fallback: facturen-tabel (zelfde id)
        var f2 = await sb.from("facturen").select("*").eq("id", id).maybeSingle();
        if (f2 && f2.data) {
          render({
            invoice_number: f2.data.factuurnummer, amount: f2.data.bedrag,
            status: (f2.data.betaling_text || f2.data.status || "").toLowerCase(),
            beschikking_naam: f2.data.beschikking_label, client_name: f2.data.client_label,
            client_number: f2.data.clientnummer, raw: (f2.data.data || {}).bs2_scrape || {},
          });
          return;
        }
        showError("Factuur niet gevonden.");
        return;
      }
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
