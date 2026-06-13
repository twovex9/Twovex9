/* global window, document, zzpFacturenDB */
/**
 * zzp-bureau-facturen.js — Detacheringsbureau-portaal.
 * Een bureau-account ziet UITSLUITEND z'n eigen mensen (server-side via RPC
 * zzp_bureau_overzicht + RLS-lockout): per persoon de uren/locatie + proforma vs.
 * ingediend, en accorderen → klaar voor betaling. Reviewers kunnen previewen
 * (bureau-picker) en login-e-mails aan een bureau koppelen.
 */
(function () {
  "use strict";
  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtEur(n) { return "€ " + (Number(n) || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtNum(n) { return (Number(n) || 0).toLocaleString("nl-NL", { maximumFractionDigits: 2 }); }
  function ymLabel(jaar, maand) { return (MAANDEN[maand - 1] ? MAANDEN[maand - 1].charAt(0).toUpperCase() + MAANDEN[maand - 1].slice(1) : maand) + " " + jaar; }

  var state = { jaar: null, maand: null, months: [], busy: false, bureau: null, isReviewer: false, isBureauOnly: false, loadSeq: 0 };

  function populateMonths() {
    var sel = $("zb-maand"); if (!sel) return;
    if (!state.months.length) { sel.innerHTML = '<option>—</option>'; return; }
    sel.innerHTML = state.months.map(function (mm) {
      var on = mm.jaar === state.jaar && mm.maand === state.maand;
      return '<option value="' + mm.jaar + "-" + mm.maand + '"' + (on ? " selected" : "") + ">" + esc(ymLabel(mm.jaar, mm.maand)) + "</option>";
    }).join("");
  }

  function statusPill(f) {
    if (f.geaccordeerd) return '<span class="zb-pill zb-pill--ok">Geaccordeerd</span>';
    if (f.status === "ingediend" || f.status === "in_behandeling") return '<span class="zb-pill zb-pill--in">Ingediend</span>';
    if (f.status === "afgewezen") return '<span class="zb-pill">Afgewezen</span>';
    return '<span class="zb-pill zb-pill--klaar">Klaargezet</span>';
  }
  function flags(f) {
    var s = "";
    if (f.heeft_bedrag_afwijking) s += '<span class="zb-flag zb-flag--rood" title="Bedrag/tarief afwijkend">● tarief</span>';
    if (f.heeft_verwijderde_dienst) s += '<span class="zb-flag zb-flag--oranje" title="Dienst verwijderd">● dienst</span>';
    return s;
  }

  function render(data) {
    if (data && data.error) {
      $("zb-tbody").innerHTML = '<tr><td colspan="7" class="table-empty">' + (data.error === "geen_bureau" ? "Geen bureau gekoppeld aan dit account." : esc(data.error)) + "</td></tr>";
      return;
    }
    state.jaar = data.jaar; state.maand = data.maand; state.months = data.months || [];
    populateMonths();
    var t = data.totaal || {};
    $("zb-lbl").textContent = data.maand ? ("· " + ymLabel(data.jaar, data.maand)) : "";
    $("zb-bureau-naam").textContent = data.bureau || "—";
    $("zb-banner-sub").textContent = data.maand ? ("· " + ymLabel(data.jaar, data.maand) + " · " + (t.facturen || 0) + " personen/diensten") : "";
    $("zb-verwacht").textContent = fmtEur(t.verwacht);
    $("zb-rest").textContent = fmtEur(t.nog_te_verwachten);
    $("zb-ingediend").textContent = fmtEur(t.ingediend);
    $("zb-ingediend-cnt").textContent = t.ingediend_cnt || 0;
    $("zb-goedgekeurd").textContent = fmtEur(t.goedgekeurd);
    $("zb-goedgekeurd-cnt").textContent = t.goedgekeurd_cnt || 0;
    $("zb-uren").textContent = fmtNum(t.uren);
    $("zb-facturen-cnt").textContent = t.facturen || 0;

    // per-locatie strip
    var locs = data.per_locatie || [];
    $("zb-loc-strip").innerHTML = locs.length ? locs.map(function (l) {
      return '<div class="zb-loc-chip"><b>' + esc(l.locatie) + "</b><span>" + fmtNum(l.uren) + " uur · " + fmtEur(l.verwacht) + "</span></div>";
    }).join("") : '<span class="zb-note">Geen diensten deze maand.</span>';

    // facturentabel
    var rows = data.facturen || [];
    var tb = $("zb-tbody");
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="table-empty">Geen facturen voor deze maand.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (f) {
      var ingediend = (f.status === "klaargezet") ? '<span class="zb-num" style="color:var(--text-muted,#64748b)">—</span>' : fmtEur(f.ingediend_bedrag);
      var canAcc = !f.geaccordeerd && f.status !== "afgewezen";
      var actie = canAcc
        ? '<button type="button" class="zb-acc-btn" data-acc="' + esc(f.id) + '" data-naam="' + esc(f.medewerker_naam) + '" data-bedrag="' + (f.te_betalen || 0) + '">Accordeer</button>'
        : (f.geaccordeerd ? '<span class="zb-ok" style="font-size:12px">✓ klaar v. betaling</span>' : "");
      return "<tr>" +
        "<td>" + esc(f.medewerker_naam || "—") + flags(f) + "</td>" +
        "<td>" + esc(f.locatie || "—") + "</td>" +
        '<td class="zb-num">' + fmtNum(f.proforma_uren) + "</td>" +
        '<td class="zb-num">' + fmtEur(f.proforma_bedrag) + "</td>" +
        '<td class="zb-num">' + ingediend + "</td>" +
        "<td>" + statusPill(f) + "</td>" +
        '<td class="zb-num">' + actie + "</td>" +
        "</tr>";
    }).join("");
  }

  async function load(jaar, maand) {
    if (state.busy) return;
    state.busy = true;
    var seq = ++state.loadSeq;
    try {
      var data = await zzpFacturenDB.getBureauOverzicht(jaar, maand, state.bureau);
      if (seq !== state.loadSeq) return; // verouderde load
      render(data);
    } catch (e) {
      if (seq !== state.loadSeq) return;
      $("zb-tbody").innerHTML = '<tr><td colspan="7" class="table-empty">Laden mislukt: ' + esc(e && e.message ? e.message : e) + "</td></tr>";
    } finally { state.busy = false; }
  }

  function stepMonth(delta) {
    var idx = state.months.findIndex(function (mm) { return mm.jaar === state.jaar && mm.maand === state.maand; });
    if (idx < 0) return;
    var ni = idx - delta; // months nieuwste-eerst
    if (ni < 0 || ni >= state.months.length) return;
    var mm = state.months[ni];
    load(mm.jaar, mm.maand);
  }

  async function doAccordeer(id, naam, bedrag) {
    if (!window.confirm("Akkoord op de factuur van " + naam + " (" + fmtEur(bedrag) + ")?\nDeze wordt goedgekeurd en klaargezet voor betaling.")) return;
    try {
      await zzpFacturenDB.bureauAccordeer(id, null);
      load(state.jaar, state.maand);
    } catch (e) {
      alert("Accorderen mislukt: " + (e && e.message ? e.message : e));
    }
  }

  // ── Reviewer-beheer: koppel login-e-mail aan een bureau ──
  async function renderBureauPickerAndMgmt() {
    var bureaus = [];
    try { bureaus = await zzpFacturenDB.listBureaus(); } catch (e) { bureaus = []; }
    // picker
    var pick = $("zb-bureau");
    if (pick && bureaus.length) {
      pick.classList.remove("zb-hide");
      pick.innerHTML = bureaus.map(function (b, i) {
        return '<option value="' + esc(b.naam) + '"' + (i === 0 ? " selected" : "") + ">" + esc(b.naam) + "</option>";
      }).join("");
      state.bureau = bureaus[0].naam;
      pick.addEventListener("change", function () { state.bureau = pick.value; state.months = []; load(null, null); });
    }
    // mgmt panel
    var mgmt = $("zb-mgmt");
    if (mgmt) {
      mgmt.classList.remove("zb-hide");
      var sel = $("zb-link-bureau");
      sel.innerHTML = bureaus.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.naam) + "</option>"; }).join("");
      $("zb-link-btn").addEventListener("click", doLink);
      refreshLinkList();
    }
  }
  async function refreshLinkList() {
    var box = $("zb-link-list"); if (!box) return;
    try {
      var rows = await zzpFacturenDB.listBureauUsers();
      box.innerHTML = rows.length ? rows.map(function (r) {
        var bn = (r.bureaus && r.bureaus.naam) || "?";
        return '<div class="zb-mgmt-item"><span>' + esc(r.user_email) + " → <b>" + esc(bn) + "</b></span>" +
          '<a href="#" data-unlink="' + esc(r.user_email) + '" style="color:#b91c1c">ontkoppelen</a></div>';
      }).join("") : '<div style="padding-top:6px">Nog geen bureau-logins gekoppeld.</div>';
    } catch (e) { box.innerHTML = '<div style="padding-top:6px">Lijst laden mislukt.</div>'; }
  }
  async function doLink() {
    var email = ($("zb-link-email").value || "").trim();
    var bureauId = $("zb-link-bureau").value;
    var msg = $("zb-link-msg");
    if (!email || !bureauId) { msg.textContent = "Vul een e-mailadres en bureau in."; return; }
    msg.textContent = "Bezig…";
    try {
      await zzpFacturenDB.linkBureauUser(email, bureauId);
      msg.textContent = "Gekoppeld ✓";
      $("zb-link-email").value = "";
      refreshLinkList();
    } catch (e) { msg.textContent = "Mislukt: " + (e && e.message ? e.message : e); }
  }

  function wire() {
    var sel = $("zb-maand");
    if (sel) sel.addEventListener("change", function () { var p = sel.value.split("-"); load(parseInt(p[0], 10), parseInt(p[1], 10)); });
    var prev = $("zb-prev"), next = $("zb-next");
    if (prev) prev.addEventListener("click", function () { stepMonth(-1); });
    if (next) next.addEventListener("click", function () { stepMonth(1); });
    // event-delegatie voor accordeer + ontkoppel
    document.addEventListener("click", function (ev) {
      var acc = ev.target.closest && ev.target.closest("[data-acc]");
      if (acc) { doAccordeer(acc.getAttribute("data-acc"), acc.getAttribute("data-naam"), acc.getAttribute("data-bedrag")); return; }
      var un = ev.target.closest && ev.target.closest("[data-unlink]");
      if (un) { ev.preventDefault(); doUnlink(un.getAttribute("data-unlink")); return; }
    });
  }
  async function doUnlink(email) {
    if (!window.confirm("Bureau-login " + email + " ontkoppelen?")) return;
    try { await zzpFacturenDB.unlinkBureauUser(email); refreshLinkList(); }
    catch (e) { alert("Ontkoppelen mislukt: " + (e && e.message ? e.message : e)); }
  }

  async function start() {
    wire();
    if (!window.zzpFacturenDB) return;
    if (window.ffSupabaseReady) { try { await window.ffSupabaseReady; } catch (e) { /* ok */ } }
    var ctx = {};
    try { ctx = await zzpFacturenDB.getBureauContext(); } catch (e) { ctx = {}; }
    state.isReviewer = !!ctx.is_reviewer;
    state.isBureauOnly = !!ctx.is_bureau_only;
    if (ctx.bureau_naam) {
      // Bureau-account: vast eigen bureau, geen picker/beheer.
      state.bureau = null; // RPC pakt server-side het eigen bureau
      $("zb-subtitle").textContent = "De uren die jouw mensen per locatie hebben gemaakt, met de proforma ernaast. Controleer en accordeer voor betaling.";
      load(null, null);
    } else if (state.isReviewer) {
      // Reviewer-preview: bureau-picker + koppelbeheer.
      $("zb-subtitle").textContent = "Preview als kantoor. Kies een bureau; koppel hieronder een login-e-mail aan een bureau.";
      await renderBureauPickerAndMgmt();
      load(null, null);
    } else {
      $("zb-tbody").innerHTML = '<tr><td colspan="7" class="table-empty">Geen bureau aan dit account gekoppeld.</td></tr>';
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
