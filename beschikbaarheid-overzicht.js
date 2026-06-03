/* global window, document */
/**
 * beschikbaarheid-overzicht.js — PC-overzicht: welke ZZP'ers houden hun
 * beschikbaarheid bij in de Future Flow-app?
 *
 * Bron: medewerkersDB (HR-medewerkers, voor de ZZP-filter op dienstverband)
 *       + beschikbaarheidDB (public.medewerker_beschikbaarheid, per dag een status).
 *
 * Per medewerker tonen we:
 *   - stoplicht-status o.b.v. de KOMENDE 4 weken (groen/oranje/rood);
 *   - hoeveel dagen er voor de komende 4 weken zijn doorgegeven;
 *   - wanneer voor het laatst iets is doorgegeven;
 *   - een patroon-strookje per week (6 weken terug — 6 weken vooruit).
 */
(function () {
  "use strict";

  // ── Constantes ──────────────────────────────────────────────────────────
  var WEKEN_TERUG = 6;          // patroon-strip: weken vóór de huidige week
  var WEKEN_VOORUIT = 5;        // patroon-strip: weken ná de huidige week (+ huidige = 12)
  var KOMEND_DAGEN = 28;        // venster voor de stoplicht-status (4 weken)
  var DREMPEL_GROEN = 14;       // >= zoveel doorgegeven dagen in komende 4 weken = groen
  var ZZP_DIENSTVERBAND = "Inhuur";
  var NL_MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  // ── Datum-helpers (lokale tijd; de app slaat datums lokaal op) ───────────
  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoLocal(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function atMidnight(d) { var c = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return c; }
  function addDays(d, n) { var c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return c; }
  function parseISO(s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split("-");
    if (p.length < 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function startOfWeek(d) {
    // Maandag-start, consistent met de mobiele kalender.
    var c = atMidnight(d);
    var wd = (c.getDay() + 6) % 7; // 0 = maandag
    return addDays(c, -wd);
  }
  function formatNlDate(d) {
    if (!d) return "—";
    return pad2(d.getDate()) + "-" + pad2(d.getMonth() + 1) + "-" + d.getFullYear();
  }
  function formatWeekLabel(d) { return d.getDate() + " " + NL_MND[d.getMonth()]; }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ── State ───────────────────────────────────────────────────────────────
  var rowsModel = [];                 // afgeleide rij-objecten per medewerker
  var weekStarts = [];                // 12 Date-objecten (begin van elke week)
  var state = {
    search: "",
    actieOnly: false,
    sortKey: "status",
    sortDir: "asc",                   // asc = "meeste actie nodig" eerst
    page: 1,
    perPage: 30,
  };
  var todayMid = atMidnight(new Date());
  var phase = "loading";              // "loading" tot medewerkers binnen zijn, dan "ready"

  function getInitials(m) {
    var f = (m.voornaam || "").trim();
    var l = (m.achternaam || "").trim();
    if (f && l) return (f[0] + l[0]).toUpperCase();
    if (f) return f.slice(0, 2).toUpperCase();
    if (l) return l.slice(0, 2).toUpperCase();
    return "??";
  }

  function isZzp(m) {
    return m && !m.archived && (m.dienstverband || "") === ZZP_DIENSTVERBAND;
  }

  // ── Venster bepalen ─────────────────────────────────────────────────────
  function computeWindow() {
    var huidigeWeek = startOfWeek(todayMid);
    var start = addDays(huidigeWeek, -WEKEN_TERUG * 7);
    weekStarts = [];
    var totaalWeken = WEKEN_TERUG + 1 + WEKEN_VOORUIT;
    for (var i = 0; i < totaalWeken; i++) weekStarts.push(addDays(start, i * 7));
    var eind = addDays(weekStarts[weekStarts.length - 1], 6); // zondag van laatste week
    return { vanISO: isoLocal(start), totISO: isoLocal(eind) };
  }

  // ── Profiel-koppeling (user_id → medewerker_id) als fallback ────────────
  function buildProfileMap() {
    var map = {};
    try {
      if (window.profilesDB && typeof window.profilesDB.getAllSync === "function") {
        window.profilesDB.getAllSync().forEach(function (p) {
          if (p && p.medewerker_id) {
            var uid = p.user_id || p.id;
            if (uid) map[uid] = p.medewerker_id;
          }
        });
      }
    } catch (e) { /* profielen niet beschikbaar — alleen op medewerker_id koppelen */ }
    return map;
  }

  // ── Model bouwen ────────────────────────────────────────────────────────
  function buildModel() {
    var medewerkers = (window.medewerkersDB && window.medewerkersDB.getAllSync)
      ? window.medewerkersDB.getAllSync().filter(isZzp) : [];
    var rows = (window.beschikbaarheidDB && window.beschikbaarheidDB.getRowsSync)
      ? window.beschikbaarheidDB.getRowsSync() : [];
    var profMap = buildProfileMap();

    // Groepeer beschikbaarheid-rijen per medewerker_id.
    var byMid = {};
    rows.forEach(function (r) {
      var mid = r.medewerker_id || profMap[r.user_id];
      if (!mid) return;
      (byMid[mid] = byMid[mid] || []).push(r);
    });

    var komendStartISO = isoLocal(todayMid);
    var komendEindISO = isoLocal(addDays(todayMid, KOMEND_DAGEN - 1));

    rowsModel = medewerkers.map(function (m) {
      var rs = byMid[m.id] || [];
      // Per-week tellingen voor de patroon-strip.
      var weekCounts = weekStarts.map(function () { return { totaal: 0, beschikbaar: 0 }; });
      var ingevuldKomend = 0;
      var beschikbaarKomend = 0;
      var laatstTs = 0;

      rs.forEach(function (r) {
        var d = parseISO(r.datum);
        if (!d) return;
        // Week-bucket
        for (var w = 0; w < weekStarts.length; w++) {
          var ws = weekStarts[w];
          var we = addDays(ws, 7);
          if (d >= ws && d < we) {
            weekCounts[w].totaal++;
            if (r.status === "beschikbaar") weekCounts[w].beschikbaar++;
            break;
          }
        }
        // Komende 4 weken
        if (r.datum >= komendStartISO && r.datum <= komendEindISO) {
          ingevuldKomend++;
          if (r.status === "beschikbaar") beschikbaarKomend++;
        }
        // Laatst doorgegeven (meest recente wijziging)
        if (r.laatst_gewijzigd) {
          var t = Date.parse(r.laatst_gewijzigd);
          if (!isNaN(t) && t > laatstTs) laatstTs = t;
        }
      });

      var statusRank = ingevuldKomend === 0 ? 0 : (ingevuldKomend < DREMPEL_GROEN ? 1 : 2);

      return {
        id: m.id,
        voornaam: m.voornaam || "",
        achternaam: m.achternaam || "",
        naam: ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "Onbekend",
        sub: m.inhuurtype || "Inhuur",
        initialen: getInitials(m),
        statusRank: statusRank,
        ingevuldKomend: ingevuldKomend,
        beschikbaarKomend: beschikbaarKomend,
        laatstTs: laatstTs,
        weekCounts: weekCounts,
        totaalVenster: rs.length,
      };
    });
  }

  // ── Filter + sort ───────────────────────────────────────────────────────
  function filteredSorted() {
    var q = state.search.trim().toLowerCase();
    var out = rowsModel.filter(function (r) {
      if (state.actieOnly && r.statusRank === 2) return false;
      if (q && r.naam.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var dir = state.sortDir === "asc" ? 1 : -1;
    out.sort(function (a, b) {
      var d = 0;
      switch (state.sortKey) {
        case "naam":
          d = a.achternaam.localeCompare(b.achternaam, "nl", { sensitivity: "base" })
            || a.voornaam.localeCompare(b.voornaam, "nl", { sensitivity: "base" });
          return d * (state.sortDir === "asc" ? 1 : -1);
        case "komend": d = a.ingevuldKomend - b.ingevuldKomend; break;
        case "laatst": d = a.laatstTs - b.laatstTs; break;
        case "status":
        default: d = a.statusRank - b.statusRank; break;
      }
      if (d === 0) {
        // Stabiele secundaire sortering op achternaam.
        return a.achternaam.localeCompare(b.achternaam, "nl", { sensitivity: "base" });
      }
      return d * dir;
    });
    return out;
  }

  // ── Render ──────────────────────────────────────────────────────────────
  var STATUS_META = {
    0: { cls: "red", label: "Niets doorgegeven" },
    1: { cls: "orange", label: "Deels" },
    2: { cls: "green", label: "Bijgewerkt" },
  };

  function stripHtml(r) {
    var cells = r.weekCounts.map(function (wc, i) {
      var n = wc.totaal;
      var lvl = n === 0 ? 0 : (n <= 2 ? 1 : (n <= 5 ? 2 : 3));
      var isNow = weekStarts[i].getTime() === startOfWeek(todayMid).getTime();
      var cls = "bz-cell bz-cell--l" + lvl + (isNow ? " bz-cell--now" : "");
      var wkLabel = formatWeekLabel(weekStarts[i]);
      var tip = n === 0
        ? ("Week van " + wkLabel + ": niets doorgegeven")
        : ("Week van " + wkLabel + ": " + n + " dag" + (n === 1 ? "" : "en") + " doorgegeven (" + wc.beschikbaar + " beschikbaar)");
      return '<span class="' + cls + '" title="' + escapeHtml(tip) + '"></span>';
    }).join("");
    return '<div class="bz-strip" role="img" aria-label="Beschikbaarheid-patroon per week">' + cells + '</div>';
  }

  function rowHtml(r) {
    var sm = STATUS_META[r.statusRank];
    var pct = Math.max(0, Math.min(100, Math.round((r.ingevuldKomend / KOMEND_DAGEN) * 100)));
    var laatst = r.laatstTs ? formatNlDate(new Date(r.laatstTs)) : "Nog nooit";
    var komendCls = r.ingevuldKomend === 0 ? " bz-komend__num--zero" : "";
    return ''
      + '<tr class="bz-row" data-mid="' + escapeHtml(r.id) + '" title="Klik om beschikbaarheid in te voeren">'
        + '<td data-col="avatar">'
          + '<span class="me-avatar bz-avatar"><span class="bz-avatar__init">' + escapeHtml(r.initialen) + '</span>'
          + '<span class="bz-dot bz-dot--' + sm.cls + '" aria-hidden="true"></span></span>'
        + '</td>'
        + '<td data-col="naam"><div class="bz-name">' + escapeHtml(r.naam) + '</div>'
          + '<div class="bz-name__sub">' + escapeHtml(r.sub) + '</div></td>'
        + '<td data-col="status"><span class="status-pill bz-pill bz-pill--' + sm.cls + '">' + escapeHtml(sm.label) + '</span></td>'
        + '<td data-col="komend">'
          + '<div class="bz-komend"><span class="bz-komend__num' + komendCls + '">' + r.ingevuldKomend + '</span>'
          + '<span class="bz-komend__lbl">/ ' + KOMEND_DAGEN + ' dagen</span></div>'
          + '<div class="bz-bar"><span class="bz-bar__fill bz-bar__fill--' + sm.cls + '" style="width:' + pct + '%"></span></div>'
        + '</td>'
        + '<td data-col="laatst">' + escapeHtml(laatst) + '</td>'
        + '<td data-col="patroon">' + stripHtml(r) + '</td>'
      + '</tr>';
  }

  function render() {
    var tbody = document.getElementById("bz-tbody");
    if (!tbody) return;
    var all = filteredSorted();
    var total = all.length;
    var perPage = state.perPage;
    var pages = Math.max(1, Math.ceil(total / perPage));
    if (state.page > pages) state.page = pages;
    var startIdx = (state.page - 1) * perPage;
    var pageRows = all.slice(startIdx, startIdx + perPage);

    if (total === 0) {
      var emptyMsg = phase === "loading"
        ? "Beschikbaarheid laden…"
        : "Geen ZZP\'ers gevonden voor deze weergave.";
      tbody.innerHTML = '<tr><td colspan="6" class="bz-empty">' + emptyMsg + '</td></tr>';
    } else {
      tbody.innerHTML = pageRows.map(rowHtml).join("");
    }

    // Footer
    var countEl = document.getElementById("bz-pager-count");
    if (countEl) {
      var from = total === 0 ? 0 : startIdx + 1;
      var to = Math.min(startIdx + perPage, total);
      countEl.textContent = from + "–" + to + " van " + total + " ZZP'ers.";
    }
    var pageLbl = document.getElementById("bz-pager-page");
    if (pageLbl) pageLbl.textContent = "Page " + state.page + " of " + pages;
    setDisabled("bz-pager-first", state.page <= 1);
    setDisabled("bz-pager-prev", state.page <= 1);
    setDisabled("bz-pager-next", state.page >= pages);
    setDisabled("bz-pager-last", state.page >= pages);

    updateSortChevrons();
  }

  function setDisabled(id, disabled) {
    var el = document.getElementById(id);
    if (el) el.disabled = !!disabled;
  }

  function updateSortChevrons() {
    var ths = document.querySelectorAll("#bz-table th.bz-th-sort");
    ths.forEach(function (th) {
      th.classList.remove("is-sorted-asc", "is-sorted-desc");
      if (th.getAttribute("data-sort") === state.sortKey) {
        th.classList.add(state.sortDir === "asc" ? "is-sorted-asc" : "is-sorted-desc");
      }
    });
  }

  // ── Office-invoer modal (planner zet beschikbaarheid + tijden namens ZZP) ─
  function populateMwSelect(prefillMid) {
    var sel = document.getElementById("bz-invoer-mw");
    if (!sel) return;
    var list = (window.medewerkersDB && window.medewerkersDB.getAllSync)
      ? window.medewerkersDB.getAllSync().filter(isZzp) : [];
    list.sort(function (a, b) { return (a.achternaam || "").localeCompare(b.achternaam || "", "nl", { sensitivity: "base" }); });
    sel.innerHTML = list.map(function (m) {
      var naam = ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "Onbekend";
      return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(naam) + "</option>";
    }).join("");
    if (prefillMid) sel.value = prefillMid;
  }
  function syncTijdenVisibility() {
    var st = (document.querySelector('input[name="bz-invoer-status"]:checked') || {}).value;
    var t = document.getElementById("bz-invoer-tijden");
    if (t) t.style.display = st === "niet_beschikbaar" ? "none" : "";
  }
  function prefillFromExisting() {
    var mid = (document.getElementById("bz-invoer-mw") || {}).value;
    var datum = (document.getElementById("bz-invoer-datum") || {}).value;
    var begin = document.getElementById("bz-invoer-begin");
    var eind = document.getElementById("bz-invoer-eind");
    var rBesch = document.querySelector('input[name="bz-invoer-status"][value="beschikbaar"]');
    var rNiet = document.querySelector('input[name="bz-invoer-status"][value="niet_beschikbaar"]');
    var match = null;
    if (mid && datum && window.beschikbaarheidDB && window.beschikbaarheidDB.getRowsSync) {
      var rows = window.beschikbaarheidDB.getRowsSync();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].datum === datum && rows[i].medewerker_id === mid) { match = rows[i]; break; }
      }
    }
    if (match) {
      if (match.status === "niet_beschikbaar") { if (rNiet) rNiet.checked = true; }
      else if (rBesch) rBesch.checked = true;
      if (begin) begin.value = match.begin_tijd ? String(match.begin_tijd).slice(0, 5) : "";
      if (eind) eind.value = match.eind_tijd ? String(match.eind_tijd).slice(0, 5) : "";
    } else {
      if (rBesch) rBesch.checked = true;
      if (begin) begin.value = "";
      if (eind) eind.value = "";
    }
    syncTijdenVisibility();
  }
  function openInvoer(prefillMid) {
    populateMwSelect(prefillMid);
    var datum = document.getElementById("bz-invoer-datum");
    if (datum && !datum.value) datum.value = isoLocal(todayMid);
    prefillFromExisting();
    var ov = document.getElementById("bz-invoer-modal");
    if (ov) ov.hidden = false;
  }
  function closeInvoer() {
    var ov = document.getElementById("bz-invoer-modal");
    if (ov) ov.hidden = true;
  }
  async function saveInvoer() {
    var mid = (document.getElementById("bz-invoer-mw") || {}).value;
    var datum = (document.getElementById("bz-invoer-datum") || {}).value;
    var status = (document.querySelector('input[name="bz-invoer-status"]:checked') || {}).value;
    var begin = (document.getElementById("bz-invoer-begin") || {}).value || null;
    var eind = (document.getElementById("bz-invoer-eind") || {}).value || null;
    if (!mid || !datum || !status) { if (window.showError) window.showError("Kies medewerker, datum en status."); return; }
    if (status === "beschikbaar" && begin && eind && eind <= begin) {
      if (window.showError) window.showError("De eindtijd moet ná de begintijd liggen.");
      return;
    }
    var btn = document.getElementById("bz-invoer-save");
    if (btn) { btn.disabled = true; btn.textContent = "Opslaan…"; }
    try {
      await window.beschikbaarheidDB.zet(mid, datum, status,
        status === "beschikbaar" ? begin : null, status === "beschikbaar" ? eind : null);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Beschikbaarheid opgeslagen", "");
      closeInvoer();
    } catch (e) {
      if (window.showError) window.showError("Opslaan mislukt: " + (e && e.message ? e.message : e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Opslaan"; }
    }
  }

  // ── Events ──────────────────────────────────────────────────────────────
  function bindEvents() {
    var search = document.getElementById("bz-search");
    if (search) search.addEventListener("input", function () { state.search = search.value; state.page = 1; render(); });

    var toggle = document.getElementById("bz-actie-toggle");
    if (toggle) toggle.addEventListener("change", function () { state.actieOnly = toggle.checked; state.page = 1; render(); });

    var perPage = document.getElementById("bz-rows-per-page");
    if (perPage) perPage.addEventListener("change", function () { state.perPage = parseInt(perPage.value, 10) || 30; state.page = 1; render(); });

    document.querySelectorAll("#bz-table th.bz-th-sort").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = "asc";
        }
        state.page = 1;
        render();
      });
    });

    bindPager("bz-pager-first", function () { state.page = 1; render(); });
    bindPager("bz-pager-prev", function () { state.page = Math.max(1, state.page - 1); render(); });
    bindPager("bz-pager-next", function () { state.page = state.page + 1; render(); });
    bindPager("bz-pager-last", function () { state.page = 1e9; render(); });

    var refresh = document.getElementById("bz-refresh");
    if (refresh) refresh.addEventListener("click", function () { refresh.disabled = true; loadData().then(function () { refresh.disabled = false; }); });

    // Office-invoer modal
    var invoerBtn = document.getElementById("bz-invoer-btn");
    if (invoerBtn) invoerBtn.addEventListener("click", function () { openInvoer(null); });
    var ic = document.getElementById("bz-invoer-close");
    if (ic) ic.addEventListener("click", closeInvoer);
    var icc = document.getElementById("bz-invoer-cancel");
    if (icc) icc.addEventListener("click", closeInvoer);
    var iov = document.getElementById("bz-invoer-modal");
    if (iov) iov.addEventListener("click", function (e) { if (e.target === iov) closeInvoer(); });
    document.querySelectorAll('input[name="bz-invoer-status"]').forEach(function (r) { r.addEventListener("change", syncTijdenVisibility); });
    var mwSel = document.getElementById("bz-invoer-mw");
    if (mwSel) mwSel.addEventListener("change", prefillFromExisting);
    var datumInp = document.getElementById("bz-invoer-datum");
    if (datumInp) datumInp.addEventListener("change", prefillFromExisting);
    var isave = document.getElementById("bz-invoer-save");
    if (isave) isave.addEventListener("click", saveInvoer);
    var tbodyEl = document.getElementById("bz-tbody");
    if (tbodyEl) tbodyEl.addEventListener("click", function (e) {
      var tr = e.target.closest(".bz-row");
      if (tr && tr.getAttribute("data-mid")) openInvoer(tr.getAttribute("data-mid"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { var m = document.getElementById("bz-invoer-modal"); if (m && !m.hidden) closeInvoer(); }
    });

    window.addEventListener("besa:medewerkers-updated", function () { phase = "ready"; buildModel(); render(); });
    window.addEventListener("besa:beschikbaarheid-updated", function () { buildModel(); render(); });
  }

  function bindPager(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }

  // ── Data laden ──────────────────────────────────────────────────────────
  async function loadData() {
    var win = computeWindow();
    if (window.beschikbaarheidDB && window.beschikbaarheidDB.fetchRange) {
      await window.beschikbaarheidDB.fetchRange(win.vanISO, win.totISO);
    }
    buildModel();
    render();
  }

  async function init() {
    bindEvents();
    render(); // lege staat / "laden"
    try { if (window.besaSupabaseReady) await window.besaSupabaseReady; } catch (e) { /* doorgaan */ }
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
