/* global window, document */
/**
 * aanmeldingen.js — interne beoordelingsmodule voor cliënt-aanmeldingen
 * (Cliëntmodule 2.0 fase 1).
 *
 * Leest via window.aanmeldingenDB (RPC's clientreis_context /
 * aanmeldingen_lijst / aanmelding_detail) en beoordeelt via
 * aanmelding_beoordeel. Alleen zichtbaar voor rollen met kan_beoordelen
 * (server-side gehandhaafd in de RPC's — de UI is cosmetisch).
 * Geen archiveer-/verwijder-acties: aanmeldingen zijn een register.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function escMulti(s) { return escapeHtml(s).replace(/\r?\n/g, "<br>"); }

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

  function fmtSize(n) {
    n = Number(n);
    if (!isFinite(n) || n <= 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1048576) return Math.round(n / 1024) + " kB";
    return (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  }

  var STATUS_LABEL = {
    nieuw: "Nieuw",
    in_beoordeling: "In beoordeling",
    meer_info_nodig: "Meer info nodig",
    wachtlijst: "Wachtlijst",
    goedgekeurd: "Goedgekeurd",
    afgewezen: "Afgewezen",
  };
  var STATUS_PILL = {
    nieuw: "anm-pill--blauw",
    in_beoordeling: "anm-pill--blauw",
    meer_info_nodig: "anm-pill--geel",
    wachtlijst: "anm-pill--geel",
    goedgekeurd: "anm-pill--groen",
    afgewezen: "anm-pill--rood",
  };
  var URG_LABEL = { spoed: "Spoed", hoog: "Hoog", middel: "Middel", laag: "Laag" };
  var URG_CLS = { spoed: "anm-urg--rood", hoog: "anm-urg--rood", middel: "anm-urg--geel", laag: "anm-urg--muted" };

  var ACTIE_CONFIRM = {
    goedkeuren: "Weet je zeker dat je deze aanmelding wilt goedkeuren? De cliënt gaat door naar de intakefase.",
    wachtlijst: "Weet je zeker dat je deze aanmelding op de wachtlijst wilt zetten?",
    meer_info: "Weet je zeker dat je meer informatie wilt opvragen bij de verwijzer?",
    afwijzen: "Weet je zeker dat je deze aanmelding wilt afwijzen?",
  };

  var FINAL_STATUSES = { goedgekeurd: true, afgewezen: true };

  var state = {
    rows: [],
    search: "",
    status: "",
    detailId: null,
    detail: null,
    pendingActie: null,
    busy: false,
    loadedOnce: false,
  };

  function statusPill(status) {
    var lbl = STATUS_LABEL[status] || (status || "—");
    var cls = STATUS_PILL[status] || "anm-pill--muted";
    return '<span class="anm-pill ' + cls + '">' + escapeHtml(lbl) + "</span>";
  }
  function urgBadge(urgentie) {
    if (!urgentie) return '<span class="anm-urg anm-urg--muted">—</span>';
    var lbl = URG_LABEL[urgentie] || urgentie;
    var cls = URG_CLS[urgentie] || "anm-urg--muted";
    return '<span class="anm-urg ' + cls + '">' + escapeHtml(lbl) + "</span>";
  }

  // ─── Lijst ─────────────────────────────────────────────────────────────────
  async function load() {
    var tbody = $("anm-tbody");
    if (!state.loadedOnce && tbody) {
      tbody.innerHTML = '<tr><td colspan="10" class="anm-loading-cell">Aanmeldingen laden…</td></tr>';
    }
    var rows = await window.aanmeldingenDB.lijst(null);
    state.rows = Array.isArray(rows) ? rows : [];
    state.loadedOnce = true;
    renderStats();
    renderTable();
  }

  function renderStats() {
    var byStatus = {};
    state.rows.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
    $("anm-stat-nieuw").textContent = byStatus.nieuw || 0;
    $("anm-stat-beoordeling").textContent = byStatus.in_beoordeling || 0;
    $("anm-stat-meerinfo").textContent = byStatus.meer_info_nodig || 0;
    $("anm-stat-wachtlijst").textContent = byStatus.wachtlijst || 0;
    $("anm-stat-afgerond").textContent = (byStatus.goedgekeurd || 0) + (byStatus.afgewezen || 0);
  }

  function rowsToShow() {
    var q = state.search.trim().toLowerCase();
    // RPC sorteert al op aanmaakdatum desc (nieuwste eerst); spoed/hoog worden
    // gemarkeerd met een rode urgentie-badge in de rij.
    return state.rows.filter(function (r) {
      if (state.status && r.status !== state.status) return false;
      if (q) {
        var hay = [
          r.referentie, r.voornaam, r.achternaam, r.gemeente,
          r.verwijzer_naam, r.verwijzer_organisatie, r.gewenste_zorgvorm,
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function verwijzerHtml(r) {
    var naam = (r.verwijzer_naam || "").trim();
    var org = (r.verwijzer_organisatie || "").trim();
    if (!naam && !org) return "—";
    var html = '<span class="anm-verw">';
    html += '<span class="anm-verw-naam">' + escapeHtml(naam || "—") + "</span>";
    if (org) html += '<span class="anm-verw-org">' + escapeHtml(org) + "</span>";
    html += "</span>";
    return html;
  }

  function renderTable() {
    var tbody = $("anm-tbody");
    var rows = rowsToShow();
    var empty = $("anm-empty");
    if (!rows.length) {
      tbody.innerHTML = "";
      setVisible(empty, true);
      return;
    }
    setVisible(empty, false);
    tbody.innerHTML = rows.map(function (r) {
      var naam = ((r.voornaam || "") + " " + (r.achternaam || "")).trim() || "—";
      return '<tr class="anm-row" data-id="' + escapeHtml(r.id) + '" tabindex="0" aria-label="Aanmelding ' + escapeHtml(r.referentie || "") + ' openen">'
        + '<td class="anm-cell-ref">' + escapeHtml(r.referentie || "—") + "</td>"
        + '<td class="anm-cell-client">' + escapeHtml(naam) + "</td>"
        + "<td>" + escapeHtml(r.gemeente || "—") + "</td>"
        + "<td>" + urgBadge(r.urgentie) + "</td>"
        + "<td>" + escapeHtml(r.gewenste_zorgvorm || "—") + "</td>"
        + "<td>" + escapeHtml(fmtDate(r.gewenste_startdatum)) + "</td>"
        + "<td>" + verwijzerHtml(r) + "</td>"
        + "<td>" + statusPill(r.status) + "</td>"
        + "<td>" + escapeHtml(fmtDate(r.aanmaakdatum)) + "</td>"
        + "<td>" + escapeHtml(r.beoordeeld_door_naam || "—") + "</td>"
        + "</tr>";
    }).join("");
  }

  // ─── Detail-modal ──────────────────────────────────────────────────────────
  function openModalShell(titel) {
    $("anm-modal-title").textContent = titel || "Aanmelding";
    var m = $("anm-modal");
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    var m = $("anm-modal");
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
    state.detailId = null;
    state.detail = null;
    state.pendingActie = null;
  }

  async function openDetail(id) {
    state.detailId = id;
    state.pendingActie = null;
    openModalShell("Aanmelding");
    var body = $("anm-modal-body");
    body.innerHTML = '<div class="anm-loading">Aanmelding laden…</div>';
    try {
      var det = await window.aanmeldingenDB.detail(id);
      var docs = Array.isArray(det.documenten) ? det.documenten : [];
      var urls = await Promise.all(docs.map(function (d) {
        return window.aanmeldingenDB.signedUrl(d && d.storage_path);
      }));
      state.detail = det;
      $("anm-modal-title").textContent = "Aanmelding " + (det.referentie || "");
      body.innerHTML = detailHtml(det, urls);
    } catch (ex) {
      body.innerHTML = '<p class="anm-modal-err">' + escapeHtml((ex && ex.message) || "Aanmelding laden mislukt.") + "</p>";
    }
  }

  function dlRow(label, valueHtml, wide) {
    return '<div class="anm-dl-row' + (wide ? " anm-dl-row--wide" : "") + '"><dt>' + escapeHtml(label) + "</dt><dd>"
      + (valueHtml || "—") + "</dd></div>";
  }
  function txt(v) { return v == null || String(v).trim() === "" ? "—" : escapeHtml(v); }
  function multi(v) { return v == null || String(v).trim() === "" ? "—" : escMulti(v); }

  function isJa(v) {
    return v === true || v === 1 || v === "ja" || v === "true" || v === "Ja";
  }

  function clientSectionHtml(d) {
    var naam = ((d.voornaam || "") + " " + (d.achternaam || "")).trim() || "—";
    var adresParts = [];
    if (d.adres) adresParts.push(String(d.adres).trim());
    var pw = ((d.postcode || "") + " " + (d.woonplaats || "")).trim();
    if (pw) adresParts.push(pw);
    return '<section class="anm-section"><h3 class="anm-section-title">Cliëntgegevens</h3><dl class="anm-dl">'
      + dlRow("Naam", escapeHtml(naam))
      + dlRow("BSN", txt(d.bsn))
      + dlRow("Geboortedatum", escapeHtml(fmtDate(d.geboortedatum)))
      + dlRow("Geslacht", txt(d.geslacht))
      + dlRow("Adres", adresParts.length ? escapeHtml(adresParts.join(", ")) : "—")
      + dlRow("Gemeente", txt(d.gemeente))
      + dlRow("Nationaliteit", txt(d.nationaliteit))
      + "</dl></section>";
  }

  function verwijzerSectionHtml(d) {
    return '<section class="anm-section"><h3 class="anm-section-title">Verwijzer</h3><dl class="anm-dl">'
      + dlRow("Organisatie", txt(d.verwijzer_organisatie))
      + dlRow("Naam", txt(d.verwijzer_naam))
      + dlRow("Functie", txt(d.verwijzer_functie))
      + dlRow("Telefoon", txt(d.verwijzer_telefoon))
      + dlRow("E-mail", txt(d.verwijzer_email))
      + "</dl></section>";
  }

  function contactenSectionHtml(d) {
    var list = Array.isArray(d.contactpersonen) ? d.contactpersonen : [];
    var inner;
    if (!list.length) {
      inner = '<p class="anm-section-empty">Geen contactpersonen opgegeven.</p>';
    } else {
      inner = '<div class="anm-contact-wrap"><table class="anm-contact-table"><thead><tr>'
        + "<th>Naam</th><th>Relatie</th><th>Rol</th><th>Gezaghebbend</th><th>Telefoon</th><th>E-mail</th>"
        + "</tr></thead><tbody>"
        + list.map(function (c) {
          c = c || {};
          return "<tr>"
            + "<td>" + txt(c.naam) + "</td>"
            + "<td>" + txt(c.relatie) + "</td>"
            + "<td>" + txt(c.contact_rol) + "</td>"
            + '<td class="anm-gezag-cell">' + (isJa(c.gezaghebbend) ? '<span class="anm-gezag" aria-label="Gezaghebbend">✓</span>' : "—") + "</td>"
            + "<td>" + txt(c.telefoon) + "</td>"
            + "<td>" + txt(c.email) + "</td>"
            + "</tr>";
        }).join("")
        + "</tbody></table></div>";
    }
    return '<section class="anm-section"><h3 class="anm-section-title">Contactpersonen</h3>' + inner + "</section>";
  }

  function aanmeldinfoSectionHtml(d) {
    return '<section class="anm-section"><h3 class="anm-section-title">Aanmeldinformatie</h3><dl class="anm-dl">'
      + dlRow("Urgentie", urgBadge(d.urgentie))
      + dlRow("Gewenste zorgvorm", txt(d.gewenste_zorgvorm))
      + dlRow("Gewenste startdatum", escapeHtml(fmtDate(d.gewenste_startdatum)))
      + dlRow("Aangemeld op", escapeHtml(fmtDate(d.aanmaakdatum)))
      + dlRow("Reden aanmelding", multi(d.reden_aanmelding), true)
      + dlRow("Hulpvraag", multi(d.hulpvraag), true)
      + dlRow("Veiligheidsrisico's", multi(d.veiligheidsrisicos), true)
      + dlRow("Diagnoses", multi(d.diagnoses), true)
      + dlRow("Huidige hulpverlening", multi(d.huidige_hulpverlening), true)
      + dlRow("School / dagbesteding", multi(d.school_dagbesteding), true)
      + "</dl></section>";
  }

  function documentenSectionHtml(d, urls) {
    var docs = Array.isArray(d.documenten) ? d.documenten : [];
    var inner;
    if (!docs.length) {
      inner = '<p class="anm-section-empty">Geen documenten.</p>';
    } else {
      inner = '<ul class="anm-doc-list">'
        + docs.map(function (doc, i) {
          doc = doc || {};
          var meta = [doc.type, fmtSize(doc.size)].filter(Boolean).join(" · ");
          var url = urls && urls[i];
          var actie = url
            ? '<a class="anm-doc-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Bekijken</a>'
            : '<span class="anm-doc-unavailable">Niet beschikbaar</span>';
          return '<li class="anm-doc"><span class="anm-doc-info"><span class="anm-doc-name">' + txt(doc.naam) + "</span>"
            + (meta ? '<span class="anm-doc-meta">' + escapeHtml(meta) + "</span>" : "")
            + "</span>" + actie + "</li>";
        }).join("")
        + "</ul>";
    }
    return '<section class="anm-section"><h3 class="anm-section-title">Documenten</h3>' + inner + "</section>";
  }

  function beoordelingSectionHtml(d) {
    var rows = dlRow("Huidige status", statusPill(d.status));
    if (d.beoordeeld_door_naam || d.beoordeeld_op) {
      rows += dlRow("Beoordeeld door", txt(d.beoordeeld_door_naam));
      rows += dlRow("Beoordeeld op", escapeHtml(fmtDate(d.beoordeeld_op)));
    }
    if (d.beoordeling_toelichting) rows += dlRow("Toelichting beoordeling", multi(d.beoordeling_toelichting), true);
    if (d.meer_info_verzoek) rows += dlRow("Meer-informatie-verzoek", multi(d.meer_info_verzoek), true);
    if (d.wachtlijst_reden) rows += dlRow("Wachtlijst-reden", multi(d.wachtlijst_reden), true);
    return '<section class="anm-section"><h3 class="anm-section-title">Beoordeling</h3><dl class="anm-dl">' + rows + "</dl></section>";
  }

  function reviewSectionHtml(d) {
    if (FINAL_STATUSES[d.status]) return "";
    return '<section class="anm-section anm-review" id="anm-review">'
      + '<h3 class="anm-section-title">Beoordelen</h3>'
      + '<label class="anm-review-label" for="anm-toelichting">Toelichting (optioneel, verplicht bij Meer info)</label>'
      + '<textarea id="anm-toelichting" class="anm-textarea" rows="3" maxlength="2000"></textarea>'
      + '<p class="anm-modal-err" id="anm-review-err" hidden></p>'
      + '<div class="anm-review-actions">'
      + '<button type="button" class="btn-primary" data-actie="goedkeuren">Goedkeuren</button>'
      + '<button type="button" class="btn-outline" data-actie="wachtlijst">Op wachtlijst</button>'
      + '<button type="button" class="btn-outline" data-actie="meer_info">Meer info opvragen</button>'
      + '<button type="button" class="btn-outline anm-btn-danger" data-actie="afwijzen">Afwijzen</button>'
      + "</div>"
      + '<div class="anm-confirm" id="anm-confirm" hidden>'
      + '<span class="anm-confirm-text" id="anm-confirm-text"></span>'
      + '<div class="anm-confirm-actions">'
      + '<button type="button" class="btn-primary" id="anm-confirm-ok">Bevestigen</button>'
      + '<button type="button" class="btn-outline" id="anm-confirm-cancel">Annuleren</button>'
      + "</div></div></section>";
  }

  function detailHtml(d, urls) {
    var dossier = d.client_id
      ? '<div class="anm-footer-actions"><a class="btn-outline anm-dossier-link" href="client-detail.html?id=' + encodeURIComponent(d.client_id) + '">Dossier openen</a></div>'
      : "";
    return clientSectionHtml(d)
      + verwijzerSectionHtml(d)
      + contactenSectionHtml(d)
      + aanmeldinfoSectionHtml(d)
      + documentenSectionHtml(d, urls)
      + beoordelingSectionHtml(d)
      + dossier
      + reviewSectionHtml(d);
  }

  // ─── Beoordelen ────────────────────────────────────────────────────────────
  function showReviewErr(msg) {
    var err = $("anm-review-err");
    if (!err) return;
    err.textContent = msg;
    setVisible(err, true);
  }
  function hideReviewErr() {
    var err = $("anm-review-err");
    if (!err) return;
    err.textContent = "";
    setVisible(err, false);
  }

  function onActieClick(btn) {
    var actie = btn.getAttribute("data-actie");
    if (!actie || !ACTIE_CONFIRM[actie]) return;
    hideReviewErr();
    var toel = $("anm-toelichting") ? $("anm-toelichting").value.trim() : "";
    if (actie === "meer_info" && !toel) {
      showReviewErr("Een toelichting is verplicht bij 'Meer info opvragen' — beschrijf welke informatie je nodig hebt.");
      try { $("anm-toelichting").focus(); } catch (e) { /* */ }
      return;
    }
    state.pendingActie = actie;
    var txtEl = $("anm-confirm-text");
    if (txtEl) txtEl.textContent = ACTIE_CONFIRM[actie];
    setVisible($("anm-confirm"), true);
  }

  async function doBeoordeel() {
    if (state.busy || !state.detailId || !state.pendingActie) return;
    var toel = $("anm-toelichting") ? $("anm-toelichting").value.trim() : "";
    var okBtn = $("anm-confirm-ok");
    state.busy = true;
    if (okBtn) okBtn.disabled = true;
    try {
      await window.aanmeldingenDB.beoordeel(state.detailId, state.pendingActie, toel || null);
      // De data-laag dispatcht besa:aanmeldingen-updated → lijst ververst zichzelf.
      closeModal();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Beoordeling");
    } catch (ex) {
      setVisible($("anm-confirm"), false);
      state.pendingActie = null;
      showReviewErr((ex && ex.message) || "Beoordelen mislukt. Probeer het opnieuw.");
    } finally {
      state.busy = false;
      if (okBtn) okBtn.disabled = false;
    }
  }

  function onModalBodyClick(e) {
    var actieBtn = e.target.closest("button[data-actie]");
    if (actieBtn) { onActieClick(actieBtn); return; }
    if (e.target.closest("#anm-confirm-ok")) { doBeoordeel(); return; }
    if (e.target.closest("#anm-confirm-cancel")) {
      state.pendingActie = null;
      setVisible($("anm-confirm"), false);
      return;
    }
  }

  // ─── Wiring + boot ─────────────────────────────────────────────────────────
  function wireChips() {
    var wrap = $("anm-status-chips");
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var chip = e.target.closest(".filter-chip");
      if (!chip) return;
      wrap.querySelectorAll(".filter-chip").forEach(function (c) {
        c.classList.remove("filter-chip--active");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("filter-chip--active");
      chip.setAttribute("aria-pressed", "true");
      state.status = chip.getAttribute("data-status") || "";
      renderTable();
    });
  }

  function wireStatic() {
    $("anm-search").addEventListener("input", function (e) { state.search = e.target.value; renderTable(); });
    wireChips();

    var tbody = $("anm-tbody");
    tbody.addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]");
      if (tr) openDetail(tr.getAttribute("data-id"));
    });
    tbody.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var tr = e.target.closest("tr[data-id]");
      if (tr) openDetail(tr.getAttribute("data-id"));
    });

    $("anm-modal-close").addEventListener("click", closeModal);
    $("anm-modal").addEventListener("click", function (e) { if (e.target === $("anm-modal")) closeModal(); });
    $("anm-modal-body").addEventListener("click", onModalBodyClick);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("anm-modal").hasAttribute("hidden")) closeModal();
    });

    window.addEventListener("besa:aanmeldingen-updated", function () { load(); });
  }

  async function boot() {
    wireStatic();
    var ctx = null;
    try { ctx = await window.aanmeldingenDB.getContext(); } catch (e) { ctx = null; }
    // Fail-closed: geen context of kan_beoordelen ≠ true ⇒ geen toegang.
    var ok = !!(ctx && ctx.kan_beoordelen === true);
    setVisible($("anm-loading"), false);
    setVisible($("anm-no-access"), !ok);
    setVisible($("anm-content"), ok);
    if (!ok) return;
    await load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
