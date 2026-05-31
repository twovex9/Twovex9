/* global window, document */
/**
 * open-diensten.js — planner-overzicht van alle OPEN diensten en de
 * aanmeldingen daarop, in één oogopslag.
 *
 * Bron:
 *   - planningDB (public.planning) → diensten met open_voor_aanmelding=true
 *     in de toekomst;
 *   - dienstUitnodigingenDB (public.dienst_uitnodigingen) → aanmeldingen,
 *     uitnodigingen en toewijzingen per dienst;
 *   - medewerkersDB (public.medewerkers) → namen van de aanmelders.
 *
 * Acties: een aanmelding accepteren (→ status "toegewezen" + planning.teamlid
 * vullen als die nog leeg is) of afwijzen (→ status "geweigerd").
 */
(function () {
  "use strict";

  var NL_DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  var NL_MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad2(n) { return String(n).padStart(2, "0"); }

  // De planning slaat de lokale wandklok-tijd op met een "+00:00"-suffix; lees de
  // datum/tijd daarom rechtstreeks uit de string (niet omrekenen via Date).
  function startDay(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length < 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function tijdVan(iso) {
    var s = String(iso || "");
    return s.length >= 16 ? s.slice(11, 16) : "";
  }
  function formatDatum(iso) {
    var d = startDay(iso);
    if (!d) return "—";
    return NL_DAG[d.getDay()] + " " + d.getDate() + " " + NL_MND[d.getMonth()] + " " + d.getFullYear();
  }
  function formatTijdvak(start, einde) {
    var a = tijdVan(start), b = tijdVan(einde);
    if (a && b) return a + "–" + b;
    return a || "";
  }
  function mwNaam(mwId) {
    if (!mwId) return "Onbekende medewerker";
    var m = (window.medewerkersDB && window.medewerkersDB.getByIdSync)
      ? window.medewerkersDB.getByIdSync(mwId) : null;
    if (!m) return "Onbekende medewerker";
    return ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "Onbekende medewerker";
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var model = [];               // rij-objecten per open dienst
  var state = {
    search: "",
    actieOnly: false,
    sortKey: "aanmeldingen",     // default: meeste aanmeldingen (= actie) bovenaan
    sortDir: "desc",
    page: 1,
    perPage: 30,
  };
  var phase = "loading";
  var openModalDienstId = null;
  var todayMid = (function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  // ── Model ─────────────────────────────────────────────────────────────────
  function buildModel() {
    var diensten = (window.planningDB && window.planningDB.getAllSync)
      ? window.planningDB.getAllSync() : [];
    model = diensten
      .filter(function (d) {
        if (!d || d.archived) return false;
        if (d.open_voor_aanmelding === false) return false;
        var day = startDay(d.start);
        return day && day >= todayMid;       // alleen vandaag + toekomst
      })
      .map(function (d) {
        var uitn = (window.dienstUitnodigingenDB && window.dienstUitnodigingenDB.getForDienstSync)
          ? window.dienstUitnodigingenDB.getForDienstSync(d.id) : [];
        var aangemeld = uitn.filter(function (u) { return u.status === "aangemeld"; });
        var toegewezen = uitn.filter(function (u) { return u.status === "toegewezen"; });
        var uitgenodigd = uitn.filter(function (u) { return u.status === "uitgenodigd"; });
        var nodig = d.vereist_aantal_medewerkers != null ? Number(d.vereist_aantal_medewerkers) : 1;
        if (!(nodig > 0)) nodig = 1;
        var toegewezenCount = toegewezen.length;
        var legacyTeamlid = (d.teamlid || "").trim();
        if (toegewezenCount === 0 && legacyTeamlid) toegewezenCount = 1; // legacy directe toewijzing
        return {
          id: d.id,
          start: d.start,
          einde: d.einde,
          dayTs: (startDay(d.start) || todayMid).getTime(),
          diensttype: d.diensttype || "Dienst",
          locatie: d.locatie || "",
          client: d.client || "",
          nodig: nodig,
          toegewezenCount: toegewezenCount,
          legacyTeamlid: legacyTeamlid,
          aangemeld: aangemeld,
          toegewezen: toegewezen,
          uitgenodigd: uitgenodigd,
          aanmeldCount: aangemeld.length,
        };
      });
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────
  function filteredSorted() {
    var q = state.search.trim().toLowerCase();
    var out = model.filter(function (r) {
      if (state.actieOnly && r.aanmeldCount === 0) return false;
      if (q) {
        var hay = (r.diensttype + " " + r.locatie + " " + r.client).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var dir = state.sortDir === "asc" ? 1 : -1;
    out.sort(function (a, b) {
      var d = 0;
      switch (state.sortKey) {
        case "diensttype": d = a.diensttype.localeCompare(b.diensttype, "nl", { sensitivity: "base" }); break;
        case "bezetting": d = (a.toegewezenCount - a.nodig) - (b.toegewezenCount - b.nodig); break;
        case "aanmeldingen": d = a.aanmeldCount - b.aanmeldCount; break;
        case "datum":
        default: d = a.dayTs - b.dayTs; break;
      }
      if (d === 0) d = a.dayTs - b.dayTs;          // secundair: chronologisch
      return d * dir;
    });
    return out;
  }

  // ── Render tabel ──────────────────────────────────────────────────────────
  function bezettingHtml(r) {
    var vol = r.toegewezenCount >= r.nodig;
    var cls = vol ? "od-bez--vol" : "od-bez--open";
    return '<span class="od-bez ' + cls + '">' + r.toegewezenCount + " / " + r.nodig + "</span>";
  }
  function aanmeldBadgeHtml(r) {
    if (r.aanmeldCount === 0) return '<span class="od-badge od-badge--leeg">—</span>';
    return '<span class="od-badge od-badge--actie">' + r.aanmeldCount +
      (r.aanmeldCount === 1 ? " aanmelding" : " aanmeldingen") + "</span>";
  }
  function rowHtml(r) {
    return ''
      + '<tr class="od-row" data-id="' + escapeHtml(r.id) + '" tabindex="0" role="button">'
        + '<td data-col="datum"><div class="od-datum">' + escapeHtml(formatDatum(r.start)) + '</div>'
          + '<div class="od-tijd">' + escapeHtml(formatTijdvak(r.start, r.einde)) + '</div></td>'
        + '<td data-col="diensttype">' + escapeHtml(r.diensttype) + '</td>'
        + '<td data-col="locatie">' + escapeHtml(r.locatie || "—") + '</td>'
        + '<td data-col="client">' + escapeHtml(r.client || "—") + '</td>'
        + '<td data-col="bezetting">' + bezettingHtml(r) + '</td>'
        + '<td data-col="aanmeldingen">' + aanmeldBadgeHtml(r) + '</td>'
      + '</tr>';
  }

  function render() {
    var tbody = document.getElementById("od-tbody");
    if (!tbody) return;
    var all = filteredSorted();
    var total = all.length;
    var perPage = state.perPage;
    var pages = Math.max(1, Math.ceil(total / perPage));
    if (state.page > pages) state.page = pages;
    var startIdx = (state.page - 1) * perPage;
    var pageRows = all.slice(startIdx, startIdx + perPage);

    if (total === 0) {
      var msg = phase === "loading"
        ? "Open diensten laden…"
        : (state.actieOnly ? "Geen open diensten met aanmeldingen." : "Geen open diensten gevonden.");
      tbody.innerHTML = '<tr><td colspan="6" class="bz-empty">' + msg + '</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(rowHtml).join("");
    }

    var countEl = document.getElementById("od-pager-count");
    if (countEl) {
      var from = total === 0 ? 0 : startIdx + 1;
      var to = Math.min(startIdx + perPage, total);
      countEl.textContent = from + "–" + to + " van " + total + " open diensten.";
    }
    var pageLbl = document.getElementById("od-pager-page");
    if (pageLbl) pageLbl.textContent = "Page " + state.page + " of " + pages;
    setDisabled("od-pager-first", state.page <= 1);
    setDisabled("od-pager-prev", state.page <= 1);
    setDisabled("od-pager-next", state.page >= pages);
    setDisabled("od-pager-last", state.page >= pages);
    updateSortChevrons();
  }
  function setDisabled(id, disabled) {
    var el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  }
  function updateSortChevrons() {
    document.querySelectorAll("#od-table th.od-th-sort").forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      if (th.getAttribute("data-sort") === state.sortKey) {
        th.classList.add(state.sortDir === "asc" ? "is-sorted-asc" : "is-sorted-desc");
      }
    });
  }

  // ── Modal: aanmelders accepteren / afwijzen ───────────────────────────────
  function personRowHtml(opts) {
    var actie = "";
    if (opts.actie) {
      actie = '<div class="od-person__acties">'
        + '<button type="button" class="btn-primary od-mini" data-action="accept" data-uit="' + escapeHtml(opts.uitId) + '" data-naam="' + escapeHtml(opts.naam) + '">Accepteren</button>'
        + '<button type="button" class="btn-outline od-mini" data-action="reject" data-uit="' + escapeHtml(opts.uitId) + '">Afwijzen</button>'
        + '</div>';
    }
    return '<div class="od-person">'
      + '<span class="od-person__naam">' + escapeHtml(opts.naam) + '</span>'
      + (opts.tag ? '<span class="od-person__tag ' + opts.tagCls + '">' + escapeHtml(opts.tag) + '</span>' : '')
      + actie
      + '</div>';
  }

  function renderModalBody(r) {
    var parts = [];
    parts.push('<div class="od-modal-meta">'
      + '<div class="od-modal-meta__row"><span class="od-modal-meta__lbl">Wanneer</span><span>' + escapeHtml(formatDatum(r.start)) + ' · ' + escapeHtml(formatTijdvak(r.start, r.einde)) + '</span></div>'
      + (r.locatie ? '<div class="od-modal-meta__row"><span class="od-modal-meta__lbl">Locatie</span><span>' + escapeHtml(r.locatie) + '</span></div>' : '')
      + (r.client ? '<div class="od-modal-meta__row"><span class="od-modal-meta__lbl">Cliënt</span><span>' + escapeHtml(r.client) + '</span></div>' : '')
      + '<div class="od-modal-meta__row"><span class="od-modal-meta__lbl">Bezetting</span><span>' + r.toegewezenCount + ' van ' + r.nodig + ' ingevuld</span></div>'
      + '</div>');

    // Aanmeldingen (actie vereist)
    parts.push('<h3 class="od-modal-h3">Aanmeldingen (' + r.aangemeld.length + ')</h3>');
    if (r.aangemeld.length === 0) {
      parts.push('<p class="od-modal-empty">Nog niemand heeft zich aangemeld voor deze dienst.</p>');
    } else {
      parts.push(r.aangemeld.map(function (u) {
        return personRowHtml({ naam: mwNaam(u.medewerker_id), actie: true, uitId: u.id });
      }).join(""));
    }

    // Toegewezen
    var toegewezenNamen = r.toegewezen.map(function (u) { return mwNaam(u.medewerker_id); });
    if (toegewezenNamen.length === 0 && r.legacyTeamlid) toegewezenNamen.push(r.legacyTeamlid);
    if (toegewezenNamen.length) {
      parts.push('<h3 class="od-modal-h3">Toegewezen (' + toegewezenNamen.length + ')</h3>');
      parts.push(toegewezenNamen.map(function (naam) {
        return personRowHtml({ naam: naam, tag: "Toegewezen", tagCls: "od-tag--vol" });
      }).join(""));
    }

    // Uitgenodigd (wacht op reactie)
    if (r.uitgenodigd.length) {
      parts.push('<h3 class="od-modal-h3">Uitgenodigd (' + r.uitgenodigd.length + ')</h3>');
      parts.push(r.uitgenodigd.map(function (u) {
        return personRowHtml({ naam: mwNaam(u.medewerker_id), tag: "Wacht op reactie", tagCls: "od-tag--wacht" });
      }).join(""));
    }

    return parts.join("");
  }

  function openModal(dienstId) {
    var r = model.find(function (x) { return String(x.id) === String(dienstId); });
    if (!r) return;
    openModalDienstId = dienstId;
    var titleEl = document.getElementById("od-modal-title");
    if (titleEl) titleEl.textContent = r.diensttype + (r.locatie ? " · " + r.locatie : "");
    var body = document.getElementById("od-modal-body");
    if (body) body.innerHTML = renderModalBody(r);
    var modal = document.getElementById("od-modal");
    if (modal) { modal.hidden = false; modal.classList.add("is-open"); }
  }
  function closeModal() {
    openModalDienstId = null;
    var modal = document.getElementById("od-modal");
    if (modal) { modal.hidden = true; modal.classList.remove("is-open"); }
  }
  function refreshModal() {
    if (openModalDienstId == null) return;
    var r = model.find(function (x) { return String(x.id) === String(openModalDienstId); });
    if (!r) { closeModal(); return; }
    var body = document.getElementById("od-modal-body");
    if (body) body.innerHTML = renderModalBody(r);
  }

  async function accept(uitId, naam) {
    var dienstId = openModalDienstId;
    if (!dienstId) return;
    try {
      await window.dienstUitnodigingenDB.updateStatus(uitId, "toegewezen", dienstId);
      // Vul planning.teamlid als die nog leeg is, zodat de naam ook in het
      // planning-rooster zichtbaar wordt (BS1 toont teamlid op de dienstkaart).
      var d = window.planningDB.getByIdSync(dienstId);
      if (d && !(d.teamlid || "").trim() && naam) {
        try { await window.planningDB.update(dienstId, { teamlid: naam }); } catch (e) { /* niet kritiek */ }
      }
      buildModel();
      render();
      refreshModal();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Aanmelding geaccepteerd");
    } catch (err) {
      if (window.showError) window.showError("Accepteren mislukt: " + (err && err.message ? err.message : err));
    }
  }
  async function reject(uitId) {
    var dienstId = openModalDienstId;
    if (!dienstId) return;
    try {
      await window.dienstUitnodigingenDB.updateStatus(uitId, "geweigerd", dienstId);
      buildModel();
      render();
      refreshModal();
      if (window.showActionFeedback) window.showActionFeedback("saved", "Aanmelding afgewezen");
    } catch (err) {
      if (window.showError) window.showError("Afwijzen mislukt: " + (err && err.message ? err.message : err));
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    var search = document.getElementById("od-search");
    if (search) search.addEventListener("input", function () { state.search = search.value; state.page = 1; render(); });

    var toggle = document.getElementById("od-actie-toggle");
    if (toggle) toggle.addEventListener("change", function () { state.actieOnly = toggle.checked; state.page = 1; render(); });

    var perPage = document.getElementById("od-rows-per-page");
    if (perPage) perPage.addEventListener("change", function () { state.perPage = parseInt(perPage.value, 10) || 30; state.page = 1; render(); });

    document.querySelectorAll("#od-table th.od-th-sort").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = (key === "aanmeldingen" || key === "bezetting") ? "desc" : "asc";
        }
        state.page = 1;
        render();
      });
    });

    bindPager("od-pager-first", function () { state.page = 1; render(); });
    bindPager("od-pager-prev", function () { state.page = Math.max(1, state.page - 1); render(); });
    bindPager("od-pager-next", function () { state.page = state.page + 1; render(); });
    bindPager("od-pager-last", function () { state.page = 1e9; render(); });

    var refresh = document.getElementById("od-refresh");
    if (refresh) refresh.addEventListener("click", function () { refresh.disabled = true; loadData().then(function () { refresh.disabled = false; }); });

    // Rij-klik → modal
    var tbody = document.getElementById("od-tbody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var tr = e.target.closest && e.target.closest("tr.od-row");
        if (tr && tr.dataset.id) openModal(tr.dataset.id);
      });
      tbody.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var tr = e.target.closest && e.target.closest("tr.od-row");
        if (tr && tr.dataset.id) { e.preventDefault(); openModal(tr.dataset.id); }
      });
    }

    // Modal-acties
    var modal = document.getElementById("od-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target.id === "od-modal") { closeModal(); return; }
        var btn = e.target.closest && e.target.closest("button[data-action]");
        if (!btn) return;
        var act = btn.getAttribute("data-action");
        if (act === "accept") accept(btn.getAttribute("data-uit"), btn.getAttribute("data-naam"));
        else if (act === "reject") reject(btn.getAttribute("data-uit"));
      });
    }
    var closeBtn = document.getElementById("od-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && openModalDienstId != null) closeModal();
    });

    window.addEventListener("besa:planning-updated", function () { buildModel(); render(); refreshModal(); });
    window.addEventListener("besa:dienst-uitnodigingen-updated", function () { buildModel(); render(); refreshModal(); });
    window.addEventListener("besa:medewerkers-updated", function () { render(); refreshModal(); });
  }
  function bindPager(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }

  // ── Data laden ────────────────────────────────────────────────────────────
  async function loadData() {
    // Bepaal de open toekomstige diensten en haal hun uitnodigingen in bulk.
    var diensten = (window.planningDB && window.planningDB.getAllSync)
      ? window.planningDB.getAllSync() : [];
    var openIds = diensten.filter(function (d) {
      if (!d || d.archived || d.open_voor_aanmelding === false) return false;
      var day = startDay(d.start);
      return day && day >= todayMid;
    }).map(function (d) { return d.id; });

    if (window.dienstUitnodigingenDB && window.dienstUitnodigingenDB.fetchForDiensten) {
      await window.dienstUitnodigingenDB.fetchForDiensten(openIds);
    }
    buildModel();
    render();
  }

  async function init() {
    bindEvents();
    render(); // "laden"
    try { if (window.besaSupabaseReady) await window.besaSupabaseReady; } catch (e) { /* doorgaan */ }
    try { if (window.planningDB && window.planningDB.ready) await window.planningDB.ready; } catch (e) { /* doorgaan */ }
    try { if (window.medewerkersDB && window.medewerkersDB.ready) await window.medewerkersDB.ready; } catch (e) { /* doorgaan */ }
    phase = "ready";
    await loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
