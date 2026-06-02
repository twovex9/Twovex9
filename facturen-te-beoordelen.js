/* global window, document */
/**
 * facturen-te-beoordelen.js — top-bar Facturen → "Te beoordelen".
 * Employee-invoice model (invoicesDB / public.invoices), 1-op-1 BS2
 * `/api/invoices?filter[status][0]=submitted`. STRIKT LOS van de
 * Cliënten→Beschikkingen→Facturen disposition-facturen (facturen.html).
 *
 * ZZP-MAANDOVERZICHT (2026-06-02): per WERK-maand toont de pagina wat we
 * o.b.v. de planning aan ZZP'ers moeten betalen ("Verwacht"), en hoeveel
 * daarvan al is binnengekomen / goedgekeurd / nog moet komen. Bron = de
 * read-only RPC facturen_zzp_dashboard (zie facturen-zzp-dashboard-data.js).
 * De maand-selector stuurt zowel het overzicht als de facturentabel.
 *
 * "Te beoordelen"-tabel = facturen met status `submitted`. Bedragen
 * VERBATIM uit BS2 (total = Σ regels price×amount). Geen herrekening.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escAttr(s) { return escHtml(s); }

  var STATUS_LABEL = {
    draft: "Concept", submitted: "Ingediend", under_review: "In beoordeling",
    approved: "Goedgekeurd", rejected: "Afgewezen",
  };
  var STATUS_CLR = {
    draft: "yellow", submitted: "blue", under_review: "yellow",
    approved: "green", rejected: "red",
  };
  // "Te beoordelen" = status submitted (BS2: filter[status][0]=submitted).
  var TODO = ["submitted"];
  var MND = ["januari", "februari", "maart", "april", "mei", "juni", "juli",
    "augustus", "september", "oktober", "november", "december"];
  var MND_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  function formatNlDate(v) {
    if (!v) return "—";
    var t = Date.parse(v); if (!isFinite(t)) return "—";
    var d = new Date(t);
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  function formatEur(n) {
    var v = Number(n || 0);
    return "€ " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".").replace(/\.(\d{2})$/, ",$1");
  }
  function invNaam(r) {
    return (r && r.employee && r.employee.name) || (r && r.organization && r.organization.name) || "—";
  }
  // "2026-04" → "April 2026"
  function ymLabel(ym) {
    if (!ym || ym.length < 7) return ym || "";
    var y = ym.slice(0, 4), m = parseInt(ym.slice(5, 7), 10);
    return (MND[m - 1] ? MND[m - 1][0].toUpperCase() + MND[m - 1].slice(1) : ym) + " " + y;
  }
  // "2026-04" → "apr '26"
  function ymShort(ym) {
    if (!ym || ym.length < 7) return ym || "";
    var m = parseInt(ym.slice(5, 7), 10);
    return (MND_KORT[m - 1] || ym) + " '" + ym.slice(2, 4);
  }
  function ymToISO(ym) { return ym ? (ym + "-01") : null; }
  function monthRange(minYm, maxYm) {
    var out = [];
    if (!minYm || !maxYm) return out;
    var y = parseInt(minYm.slice(0, 4), 10), m = parseInt(minYm.slice(5, 7), 10);
    var ey = parseInt(maxYm.slice(0, 4), 10), em = parseInt(maxYm.slice(5, 7), 10);
    var guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 240) {
      out.push(y + "-" + ("0" + m).slice(-2));
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  var state = {
    search: "", showArchived: false,
    page: 1, pageSize: 50, sortKey: "datum", sortDir: "desc",
    mode: "maand",                 // 'maand' | 'periode'
    startYm: null, endYm: null,    // huidige selectie (werk-maand-range)
    windowMin: null, windowMax: null,
    months: [],                    // RPC months[] voor de grafiek
    loading: false,
  };

  function getAll() {
    try { return (window.invoicesDB && window.invoicesDB.getAllSync()) || []; }
    catch (e) { return []; }
  }
  function invYm(r) {
    if (!r || !r.jaar || !r.maand) return null;
    return r.jaar + "-" + ("0" + r.maand).slice(-2);
  }
  function inSelected(r) {
    var ym = invYm(r);
    if (!ym) return false;
    if (!state.startYm || !state.endYm) return true;
    return ym >= state.startYm && ym <= state.endYm;
  }

  function filtered() {
    var rows = getAll().filter(function (r) { return r && TODO.indexOf(r.status) >= 0; });
    rows = rows.filter(function (r) { return state.showArchived ? r.gearchiveerd : !r.gearchiveerd; });
    rows = rows.filter(inSelected);
    if (state.search) {
      var q = state.search.toLowerCase();
      rows = rows.filter(function (r) {
        return (r.number || "").toLowerCase().indexOf(q) >= 0
          || invNaam(r).toLowerCase().indexOf(q) >= 0
          || (r.periodFormatted || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    var dir = state.sortDir === "desc" ? -1 : 1;
    rows.sort(function (a, b) {
      var k = state.sortKey, av, bv;
      if (k === "bedrag") { av = a.total; bv = b.total; return (av - bv) * dir; }
      if (k === "factuurnr") { av = a.number || ""; bv = b.number || ""; return av.localeCompare(bv, "nl") * dir; }
      if (k === "status") { av = controlRank(a); bv = controlRank(b); return (av - bv) * dir; }
      if (k === "maand") { av = (a.jaar || 0) * 100 + (a.maand || 0); bv = (b.jaar || 0) * 100 + (b.maand || 0); return (av - bv) * dir; }
      av = a.submittedAt || a.aanmaakdatum || ""; bv = b.submittedAt || b.aanmaakdatum || "";
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }

  // ---- ZZP-overzicht (kaarten + progressie) uit de RPC -------------------
  function renderOverview(sel) {
    sel = sel || {};
    var verwacht = Number(sel.planning_verwacht || 0);
    var binnen = Number(sel.binnengekomen || 0);
    var todo = Number(sel.te_beoordelen || 0);
    var ok = Number(sel.goedgekeurd || 0);
    var rest = Number(sel.nog_te_verwachten || 0);
    var periodLbl = state.startYm === state.endYm ? ymLabel(state.startYm)
      : (ymLabel(state.startYm) + " – " + ymLabel(state.endYm));

    if ($("fzz-lbl-verwacht")) $("fzz-lbl-verwacht").textContent = periodLbl;
    if ($("fzz-v-verwacht")) $("fzz-v-verwacht").textContent = formatEur(verwacht);
    var uren = Number(sel.planning_uren || 0), zzpers = Number(sel.zzpers_gepland || 0);
    if ($("fzz-sub-verwacht")) {
      $("fzz-sub-verwacht").textContent = "te betalen aan ZZP'ers · "
        + zzpers + " ZZP'ers · " + uren.toLocaleString("nl-NL") + " u gepland";
    }
    // Progressie: binnengekomen t.o.v. verwacht
    var pct = verwacht > 0 ? Math.min(100, Math.round((binnen / verwacht) * 100)) : 0;
    if ($("fzz-prog-fill")) $("fzz-prog-fill").style.width = pct + "%";
    if ($("fzz-prog-lbl")) {
      $("fzz-prog-lbl").textContent = formatEur(binnen) + " binnengekomen ("
        + pct + "% van verwacht)";
    }

    if ($("fzz-v-todo")) $("fzz-v-todo").textContent = formatEur(todo);
    if ($("fzz-c-todo")) $("fzz-c-todo").textContent = Number(sel.te_beoordelen_cnt || 0);
    if ($("fzz-v-ok")) $("fzz-v-ok").textContent = formatEur(ok);
    if ($("fzz-c-ok")) $("fzz-c-ok").textContent = Number(sel.goedgekeurd_cnt || 0);
    if ($("fzz-v-rest")) $("fzz-v-rest").textContent = formatEur(rest);
    if ($("fzz-sub-rest")) {
      $("fzz-sub-rest").textContent = binnen > verwacht
        ? "volledig gefactureerd"
        : "moet nog gefactureerd worden";
    }
  }

  // ---- Maandgrafiek: verwacht vs binnengekomen (goedgekeurd + te beoordelen)
  function renderChart(months) {
    var bars = $("fzz-bars"), yLab = $("fzz-y-labels"), xLab = $("fzz-bar-labels");
    if (!bars) return;
    var list = (months || []).slice(-12);   // laatste 12 maanden
    if (!list.length) {
      bars.innerHTML = '<div class="fzz-chart-empty">Geen gegevens</div>';
      if (yLab) yLab.innerHTML = ""; if (xLab) xLab.innerHTML = "";
      return;
    }
    var maxVal = 0;
    list.forEach(function (m) {
      maxVal = Math.max(maxVal, Number(m.planning_verwacht || 0), Number(m.binnengekomen || 0));
    });
    if (maxVal <= 0) maxVal = 1;
    function pct(v) { return Math.max(0, Math.min(100, (Number(v || 0) / maxVal) * 100)); }
    function kEur(v) {
      var n = Number(v || 0);
      if (n >= 1000) return "€" + Math.round(n / 1000) + "k";
      return "€" + Math.round(n);
    }
    bars.innerHTML = list.map(function (m) {
      var active = (m.ym === state.startYm && state.startYm === state.endYm) ? " fzz-col--active" : "";
      var ok = Number(m.goedgekeurd || 0), tb = Number(m.te_beoordelen || 0);
      var binnen = ok + tb;
      var inH = pct(binnen).toFixed(1);                                  // staafhoogte t.o.v. max
      var okRel = binnen > 0 ? (ok / binnen * 100).toFixed(1) : "0";     // segment binnen de staaf
      var inRel = binnen > 0 ? (tb / binnen * 100).toFixed(1) : "0";
      var title = ymLabel(m.ym) + " — verwacht " + formatEur(m.planning_verwacht)
        + ", binnengekomen " + formatEur(m.binnengekomen);
      return '<button type="button" class="fzz-col' + active + '" data-ym="' + escAttr(m.ym)
        + '" title="' + escAttr(title) + '" aria-label="' + escAttr(title) + '">'
        + '<span class="fzz-pair">'
        + '<span class="fzz-stick fzz-stick--exp" style="height:' + pct(m.planning_verwacht).toFixed(1) + '%"></span>'
        + '<span class="fzz-stick fzz-stick--in" style="height:' + inH + '%">'
        + '<span class="fzz-seg fzz-seg--in" style="height:' + inRel + '%"></span>'
        + '<span class="fzz-seg fzz-seg--ok" style="height:' + okRel + '%"></span>'
        + '</span>'
        + '</span>'
        + '</button>';
    }).join("");
    if (yLab) {
      yLab.innerHTML = '<span>' + kEur(maxVal) + '</span><span>' + kEur(maxVal / 2) + '</span><span>€0</span>';
    }
    if (xLab) {
      xLab.innerHTML = list.map(function (m) { return '<span>' + escHtml(ymShort(m.ym)) + '</span>'; }).join("");
    }
  }

  function statusPill(st) {
    return '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + (STATUS_CLR[st] || "yellow") + '">'
      + escHtml(STATUS_LABEL[st] || st) + '</span>';
  }
  function pill(clr, label, title) {
    return '<span class="cl-fase-pill fact-status-pill fact-status-pill--' + clr + '"'
      + (title ? ' title="' + escAttr(title) + '"' : "") + '>' + escHtml(label) + '</span>';
  }
  function sysTotalOf(r) {
    var s = r && r.systemGeneratedSummary;
    var t = s && s.totals && s.totals.total != null ? Number(s.totals.total) : null;
    return (t != null && isFinite(t)) ? t : null;
  }
  function controlPill(r) {
    if (r.status && r.status !== "submitted") return statusPill(r.status);
    var sysTotal = sysTotalOf(r);
    if (sysTotal == null) return pill("yellow", "Niet in systeem", "Geen systeemfactuur aanwezig");
    var diff = Math.round(((Number(r.total) || 0) - sysTotal) * 100) / 100;
    if (Math.abs(diff) >= 0.01) return pill("pink", "Wijkt af", "Verschil met systeemfactuur: " + formatEur(diff));
    return pill("blue", "Ingediend", "Eén-op-één met systeemfactuur");
  }
  function controlRank(r) {
    if (r.status && r.status !== "submitted") return 3;
    var sysTotal = sysTotalOf(r);
    if (sysTotal == null) return 0;
    return (Math.abs((Number(r.total) || 0) - sysTotal) >= 0.01) ? 1 : 2;
  }

  function render() {
    var rows = filtered();
    var ps = state.pageSize, total = rows.length;
    var maxPage = Math.max(1, Math.ceil(total / ps));
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * ps;
    var pageRows = rows.slice(start, start + ps);
    var tb = $("fact-tb-tbody");
    if (!pageRows.length) {
      tb.innerHTML = '<tr><td colspan="7" class="incident-empty">Geen facturen te beoordelen in deze periode</td></tr>';
    } else {
      tb.innerHTML = pageRows.map(function (r) {
        return '<tr class="fact-tb-row" data-id="' + escAttr(r.id) + '" tabindex="0" role="link">'
          + '<td data-col="select"><input type="checkbox" class="table-checkbox fact-tb-rowcheck" data-id="' + escAttr(r.id) + '" aria-label="Selecteer" /></td>'
          + '<td data-col="maand">' + escHtml(r.periodFormatted || "—") + '</td>'
          + '<td data-col="medewerker">' + escHtml(invNaam(r)) + '</td>'
          + '<td data-col="factuurnr">' + escHtml(r.number || "—") + '</td>'
          + '<td data-col="status">' + controlPill(r) + '</td>'
          + '<td data-col="datum">' + escHtml(formatNlDate(r.submittedAt || r.aanmaakdatum)) + '</td>'
          + '<td data-col="bedrag" class="td-num">' + formatEur(r.total) + '</td>'
          + '</tr>';
      }).join("");
    }
    $("fact-tb-range").textContent = total === 0 ? "0 van 0"
      : (start + 1) + "–" + Math.min(start + ps, total) + " van " + total;
    $("fact-tb-page").textContent = "Pagina " + state.page + " van " + maxPage;
    $("fact-tb-pager-first").disabled = state.page <= 1;
    $("fact-tb-pager-prev").disabled = state.page <= 1;
    $("fact-tb-pager-next").disabled = state.page >= maxPage;
    $("fact-tb-pager-last").disabled = state.page >= maxPage;
    var hint = $("fzz-table-hint");
    if (hint) {
      var lbl = state.startYm === state.endYm ? ymLabel(state.startYm)
        : (ymLabel(state.startYm) + " – " + ymLabel(state.endYm));
      hint.textContent = state.startYm ? ("Te beoordelen in " + lbl) : "";
    }
    applyColumnVisibility();
  }

  // Kolomkiezer
  var COLUMNS = [
    { id: "maand", label: "Maand" },
    { id: "medewerker", label: "Medewerker" },
    { id: "factuurnr", label: "Factuurnummer" },
    { id: "status", label: "Status" },
    { id: "datum", label: "Aanmaakdatum" },
    { id: "bedrag", label: "Bedrag" },
  ];
  function buildColumnsPanel() {
    var list = $("fact-tb-columns-list");
    if (!list) return;
    list.innerHTML = "";
    COLUMNS.forEach(function (c) {
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle is-checked";
      b.setAttribute("data-col", c.id);
      b.setAttribute("role", "menuitemcheckbox");
      b.setAttribute("aria-checked", "true");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }
  function applyColumnVisibility() {
    document.querySelectorAll("#fact-tb-columns-list .column-toggle").forEach(function (btn) {
      var visible = btn.getAttribute("aria-checked") === "true";
      document.querySelectorAll('#fact-tb-table [data-col="' + btn.getAttribute("data-col") + '"]')
        .forEach(function (cell) { cell.classList.toggle("col-hidden", !visible); });
    });
  }

  function openDetail(id) {
    if (id) window.location.href = "invoice-detail.html?id=" + encodeURIComponent(id);
  }

  // ---- Maand-selector ----------------------------------------------------
  function buildMonthSelects() {
    var months = monthRange(state.windowMin, state.windowMax);
    var optsHtml = months.map(function (ym) {
      return '<option value="' + escAttr(ym) + '">' + escHtml(ymLabel(ym)) + '</option>';
    }).join("");
    ["fzz-maand", "fzz-van", "fzz-tot"].forEach(function (id) {
      var sel = $(id); if (sel) sel.innerHTML = optsHtml;
    });
  }
  function syncSelectorUI() {
    if ($("fzz-maand")) $("fzz-maand").value = state.startYm || "";
    if ($("fzz-van")) $("fzz-van").value = state.startYm || "";
    if ($("fzz-tot")) $("fzz-tot").value = state.endYm || "";
    var maandPick = $("fzz-pick-maand"), perPick = $("fzz-pick-periode");
    if (maandPick) maandPick.hidden = state.mode !== "maand";
    if (perPick) perPick.hidden = state.mode !== "periode";
    var mB = $("fzz-mode-maand"), pB = $("fzz-mode-periode");
    if (mB) { mB.classList.toggle("is-active", state.mode === "maand"); mB.setAttribute("aria-selected", state.mode === "maand"); }
    if (pB) { pB.classList.toggle("is-active", state.mode === "periode"); pB.setAttribute("aria-selected", state.mode === "periode"); }
    var months = monthRange(state.windowMin, state.windowMax);
    if ($("fzz-prev")) $("fzz-prev").disabled = !months.length || state.startYm <= months[0];
    if ($("fzz-next")) $("fzz-next").disabled = !months.length || state.endYm >= months[months.length - 1];
  }

  // Laad RPC voor de huidige selectie + render kaarten/grafiek; tabel direct.
  // loadSeq voorkomt dat een trager binnenkomende, oudere RPC-respons een
  // nieuwere overschrijft (race bij snel door maanden bladeren).
  var loadSeq = 0;
  function loadAndRender() {
    syncSelectorUI();
    state.page = 1;
    render();                       // tabel is lokaal → meteen
    if (!window.facturenZzpDB) return;
    var mySeq = ++loadSeq;
    state.loading = true;
    window.facturenZzpDB.load(ymToISO(state.startYm), ymToISO(state.endYm)).then(function (data) {
      if (mySeq !== loadSeq) return;   // nieuwere selectie geladen → negeer verouderde respons
      state.loading = false;
      if (!data) return;
      if (data.months) state.months = data.months;
      renderOverview(data.selected);
      renderChart(state.months);
    }).catch(function () { if (mySeq === loadSeq) state.loading = false; });
  }

  function selectMonth(ym) {
    if (!ym) return;
    state.mode = "maand";
    state.startYm = ym; state.endYm = ym;
    loadAndRender();
  }
  function shiftMonth(delta) {
    var months = monthRange(state.windowMin, state.windowMax);
    var idx = months.indexOf(state.startYm);
    if (idx < 0) return;
    var ni = idx + delta;
    if (ni < 0 || ni >= months.length) return;
    selectMonth(months[ni]);
  }

  // ---- Drill-down modal (per ZZP'er: verwacht vs gefactureerd) -----------
  function openModal() {
    var m = $("fzz-modal"); if (!m) return;
    m.hidden = false; document.body.classList.add("bd-modal-open");
  }
  function closeModal() {
    var m = $("fzz-modal"); if (!m) return;
    m.hidden = true; document.body.classList.remove("bd-modal-open");
  }
  function zzpStatusPill(verwacht, gefactureerd) {
    var v = Number(verwacht || 0), g = Number(gefactureerd || 0);
    if (g <= 0) return pill("red", "Niets gefactureerd");
    if (g + 0.01 >= v) return pill("green", "Volledig");
    return pill("yellow", "Deels");
  }
  function openDrill(focusRest) {
    if (state.startYm !== state.endYm) {
      // In periode-modus geen per-ZZP'er-detail (RPC werkt per maand).
      showToast("Kies één maand voor de uitsplitsing per ZZP'er");
      return;
    }
    var ym = state.startYm;
    if (!ym || !window.facturenZzpDB) return;
    $("fzz-modal-title").textContent = focusRest ? "Nog te factureren door ZZP'ers" : "Verwacht per ZZP'er";
    $("fzz-modal-sub").textContent = ymLabel(ym) + " — o.b.v. de planning (netto-uren × persoonlijk uurtarief)";
    $("fzz-modal-body").innerHTML = '<p class="bd-modal-empty">Laden…</p>';
    openModal();
    window.facturenZzpDB.detail(ym).then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      if (focusRest) rows = rows.filter(function (r) { return Number(r.gefactureerd || 0) + 0.01 < Number(r.verwacht || 0); });
      if (!rows.length) {
        $("fzz-modal-body").innerHTML = '<p class="bd-modal-empty">Geen ZZP-diensten gepland in deze maand.</p>';
        return;
      }
      var totV = 0, totG = 0;
      var body = rows.map(function (r) {
        totV += Number(r.verwacht || 0); totG += Number(r.gefactureerd || 0);
        return '<tr>'
          + '<td class="bd-td-strong">' + escHtml(r.naam || "—") + '</td>'
          + '<td class="bd-td-eur">' + Number(r.uren || 0).toLocaleString("nl-NL") + " u" + '</td>'
          + '<td class="bd-td-eur">' + formatEur(r.verwacht) + '</td>'
          + '<td class="bd-td-eur">' + formatEur(r.gefactureerd) + '</td>'
          + '<td>' + zzpStatusPill(r.verwacht, r.gefactureerd) + '</td>'
          + '</tr>';
      }).join("");
      var foot = '<tr class="fzz-modal-foot"><td class="bd-td-strong">Totaal (' + rows.length + ')</td>'
        + '<td></td><td class="bd-td-eur bd-td-strong">' + formatEur(totV) + '</td>'
        + '<td class="bd-td-eur bd-td-strong">' + formatEur(totG) + '</td><td></td></tr>';
      $("fzz-modal-body").innerHTML =
        '<table class="bd-modal-tbl"><thead><tr>'
        + '<th>ZZP\'er</th><th class="bd-td-eur">Uren</th><th class="bd-td-eur">Verwacht</th>'
        + '<th class="bd-td-eur">Gefactureerd</th><th>Status</th>'
        + '</tr></thead><tbody>' + body + foot + '</tbody></table>';
    });
  }

  function showToast(msg) {
    var t = $("fact-tb-toast"); if (!t) return;
    t.textContent = msg; t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 2600);
  }
  function scrollToTable() {
    var el = $("fact-tb-table");
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function wire() {
    var s = $("fact-tb-search");
    if (s) s.addEventListener("input", function () { state.search = this.value || ""; state.page = 1; render(); });
    var arch = $("fact-tb-archived");
    if (arch) arch.addEventListener("change", function () { state.showArchived = this.checked; state.page = 1; render(); });
    $("fact-tb-page-size").addEventListener("change", function () { state.pageSize = parseInt(this.value, 10) || 50; state.page = 1; render(); });
    $("fact-tb-pager-first").addEventListener("click", function () { state.page = 1; render(); });
    $("fact-tb-pager-prev").addEventListener("click", function () { if (state.page > 1) { state.page--; render(); } });
    $("fact-tb-pager-next").addEventListener("click", function () { state.page++; render(); });
    $("fact-tb-pager-last").addEventListener("click", function () { state.page = 99999; render(); });
    var tb = $("fact-tb-tbody");
    tb.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".fact-tb-rowcheck")) return;
      var row = e.target && e.target.closest && e.target.closest("tr.fact-tb-row");
      if (row) openDetail(row.getAttribute("data-id"));
    });
    tb.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var row = e.target && e.target.closest && e.target.closest("tr.fact-tb-row");
      if (row) { e.preventDefault(); openDetail(row.getAttribute("data-id")); }
    });
    // Sorteer-menus
    document.querySelectorAll("#fact-tb-table .th-sort-trigger").forEach(function (t) {
      t.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = t.closest("th"), menu = th && th.querySelector(".th-sort-menu");
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
        if (wasHidden) menu.removeAttribute("hidden");
      });
    });
    document.querySelectorAll("#fact-tb-table .th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = opt.closest("th"), col = th && th.getAttribute("data-col");
        if (col) { state.sortKey = col; state.sortDir = opt.getAttribute("data-action") === "asc" ? "asc" : "desc"; state.page = 1; render(); }
        document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      });
    });
    document.addEventListener("click", function () {
      document.querySelectorAll("#fact-tb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    });

    // Maand-selector
    var mB = $("fzz-mode-maand"), pB = $("fzz-mode-periode");
    if (mB) mB.addEventListener("click", function () {
      // Altijd terug naar een consistente één-maand-staat (ook als de selectie
      // ooit een range zou bevatten terwijl de modus al "maand" is).
      if (state.mode === "maand" && state.startYm === state.endYm) return;
      state.mode = "maand"; state.endYm = state.startYm; loadAndRender();
    });
    if (pB) pB.addEventListener("click", function () {
      if (state.mode === "periode") return;
      state.mode = "periode"; loadAndRender();
    });
    if ($("fzz-maand")) $("fzz-maand").addEventListener("change", function () { selectMonth(this.value); });
    if ($("fzz-prev")) $("fzz-prev").addEventListener("click", function () { shiftMonth(-1); });
    if ($("fzz-next")) $("fzz-next").addEventListener("click", function () { shiftMonth(1); });
    if ($("fzz-van")) $("fzz-van").addEventListener("change", function () {
      state.mode = "periode";   // van/tot horen bij de periode-modus → houd state consistent
      state.startYm = this.value;
      if (state.endYm < state.startYm) { var t = state.startYm; state.startYm = state.endYm; state.endYm = t; }
      loadAndRender();
    });
    if ($("fzz-tot")) $("fzz-tot").addEventListener("change", function () {
      state.mode = "periode";
      state.endYm = this.value;
      if (state.endYm < state.startYm) { var t = state.startYm; state.startYm = state.endYm; state.endYm = t; }
      loadAndRender();
    });

    // Grafiek: klik op een maand
    var bars = $("fzz-bars");
    if (bars) bars.addEventListener("click", function (e) {
      var col = e.target && e.target.closest && e.target.closest(".fzz-col");
      if (col) selectMonth(col.getAttribute("data-ym"));
    });

    // Kaart-acties
    var cVerwacht = $("fzz-card-verwacht"), cRest = $("fzz-card-rest"),
      cTodo = $("fzz-card-todo"), cOk = $("fzz-card-ok");
    function cardKey(el, fn) {
      if (!el) return;
      el.addEventListener("click", fn);
      el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
    }
    cardKey(cVerwacht, function () { openDrill(false); });
    cardKey(cRest, function () { openDrill(true); });
    cardKey(cTodo, function () { scrollToTable(); });
    cardKey(cOk, function () { openDrill(false); });

    // Modal sluiten
    if ($("fzz-modal-x")) $("fzz-modal-x").addEventListener("click", closeModal);
    if ($("fzz-modal-backdrop")) $("fzz-modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { var m = $("fzz-modal"); if (m && !m.hidden) closeModal(); }
    });

    // Kolomkiezer
    var colBtn = $("fact-tb-columns-menu-btn"), colPanel = $("fact-tb-columns-panel");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (colPanel.hasAttribute("hidden")) { colPanel.removeAttribute("hidden"); colBtn.setAttribute("aria-expanded", "true"); }
        else { colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false"); }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
      var colList = $("fact-tb-columns-list");
      if (colList) colList.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        var on = t.getAttribute("aria-checked") !== "true";
        t.setAttribute("aria-checked", on ? "true" : "false");
        t.classList.toggle("is-checked", on);
        applyColumnVisibility();
      });
      document.addEventListener("click", function () {
        colPanel.setAttribute("hidden", ""); colBtn.setAttribute("aria-expanded", "false");
      });
    }
    window.addEventListener("besa:invoices-updated", render);
  }

  // Eerste RPC-resultaat → bouw selector + render alles.
  function applyInitial(data) {
    if (!data) { render(); return; }
    var win = data.window || {}, per = data.period || {};
    state.windowMin = win.min || per.start || null;
    state.windowMax = win.max || per.end || null;
    state.startYm = per.start || state.windowMax;
    state.endYm = per.end || state.windowMax;
    state.mode = (state.startYm === state.endYm) ? "maand" : "periode";
    state.months = data.months || [];
    buildMonthSelects();
    syncSelectorUI();
    renderOverview(data.selected);
    renderChart(state.months);
    render();
  }

  function init() {
    buildColumnsPanel();
    render();
    wire();
    if (window.facturenZzpDB && window.facturenZzpDB.ready) {
      window.facturenZzpDB.ready.then(function () {
        applyInitial(window.facturenZzpDB.getData());
      }).catch(function () {});
    }
    if (window.invoicesDB && window.invoicesDB.ready) window.invoicesDB.ready.then(render).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
