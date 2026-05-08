(function () {
  var tbody = document.getElementById("cs-tbody");
  var searchInput = document.getElementById("cs-search");
  var rangeEl = document.getElementById("cs-pager-range");
  var pageEl = document.getElementById("cs-pager-page");
  var rowsSelect = document.getElementById("cs-rows-per-page");
  var table = document.getElementById("cs-table");

  if (!tbody || !table) return;

  var FIRST = [
    "Adriana", "Nick", "Marieke", "Thomas", "Sophie", "Lars", "Emma", "Daan", "Lisa", "Noah",
    "Julia", "Finn", "Eva", "Sam", "Iris", "Bas", "Nina", "Tim", "Lotte", "Ruben",
    "Anna", "Jesse", "Mila", "Luuk", "Fleur", "Max", "Sanne", "Koen", "Roos", "Stijn"
  ];
  var LAST = [
    "Malovan", "van Harskamp", "Jansen", "de Vries", "Bakker", "Visser", "Smit", "Mulder", "de Boer", "Kok",
    "Dijkstra", "Janssen", "van Dijk", "Berg", "Hendriks", "van den Berg", "Scholten", "Meijer", "van Leeuwen", "Willems",
    "Postma", "Kramer", "van der Laan", "Hoekstra", "Blom", "Peeters", "de Graaf", "Verhoeven", "Martens", "Jacobs"
  ];
  var TEAMS = [
    "Voorburggracht", "Centrum", "Noord", "Zuid", "Oost", "West", "Zorgteam A", "Zorgteam B"
  ];

  function hash01(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /**
   * Bouwt de demo-data op basis van een deterministische hash. Wordt alleen
   * gebruikt als fallback wanneer de Supabase-cache nog leeg is (eerste
   * page-load op een nieuwe browser, vóór de bootstrap is voltooid).
   */
  function buildSeedRows() {
    var rows = [];
    var i;
    for (i = 0; i < 81; i++) {
      var fn = FIRST[i % FIRST.length];
      var ln = LAST[Math.floor(i / 3) % LAST.length];
      var name = fn + " " + ln + (i > 29 ? " " + (i + 1) : "");
      var h1 = hash01(i);
      var h2 = hash01(i + 17);
      var h3 = hash01(i + 31);
      var verdiend = Math.round((20 + h1 * 120 + (i % 7) * 3) * 100) / 100;
      var gebruikt = Math.round((h2 * verdiend * 0.85 + (i % 5)) * 100) / 100;
      var saldo = Math.round((verdiend - gebruikt + (h3 - 0.5) * 16) * 100) / 100;
      var ontvangt = i % 4 !== 0;
      var team = TEAMS[i % TEAMS.length];
      rows.push({
        id: "cs_" + i,
        medewerker: name,
        saldo: saldo,
        verdiend: verdiend,
        gebruikt: gebruikt,
        geschiktheidLabel: ontvangt ? "Ontvangt compensatie uren" : "",
        team: team
      });
    }
    return rows;
  }

  function loadRows() {
    if (window.compSaldiDB && typeof window.compSaldiDB.getAllSync === "function") {
      var fromDb = window.compSaldiDB.getAllSync();
      if (fromDb && fromDb.length) return fromDb;
    }
    return buildSeedRows();
  }

  var allRows = loadRows();

  function fmtNum(n) {
    var v = Math.round(Number(n) * 100) / 100;
    if (Object.is(v, -0)) v = 0;
    if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
    var s = v.toFixed(2);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "15", 10) || 15;
  }

  function getVal(row, key) {
    if (key === "medewerker") return row.medewerker || "";
    if (key === "saldo") return row.saldo;
    if (key === "verdiend") return row.verdiend;
    if (key === "gebruikt") return row.gebruikt;
    if (key === "geschiktheid") return row.geschiktheidLabel || "";
    if (key === "team") return row.team || "";
    return "";
  }

  function getFiltered() {
    var items = allRows.slice();
    var q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        return (
          (r.medewerker || "").toLowerCase().includes(q) ||
          (r.team || "").toLowerCase().includes(q) ||
          (r.geschiktheidLabel || "").toLowerCase().includes(q) ||
          fmtNum(r.saldo).includes(q) ||
          fmtNum(r.verdiend).includes(q) ||
          fmtNum(r.gebruikt).includes(q)
        );
      });
    }

    if (sortKey) {
      var sk = sortKey;
      var numCol = sk === "saldo" || sk === "verdiend" || sk === "gebruikt";
      items.sort(function (a, b) {
        var av = getVal(a, sk);
        var bv = getVal(b, sk);
        if (numCol) {
          av = Number(av);
          bv = Number(bv);
        } else {
          av = String(av).toLowerCase();
          bv = String(bv).toLowerCase();
        }
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  function setColumnVisible(colId, visible) {
    document.querySelectorAll('#cs-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#cs-columns-panel .column-toggle").forEach(function (btn) {
      var colId = btn.dataset.col;
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  function syncSortHeaders() {
    document.querySelectorAll("#cs-table thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc");
      if (sortKey && th.dataset.col === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  function render() {
    var items = getFiltered();
    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    var start = currentPage * pageSize;
    var page = items.slice(start, start + pageSize);

    tbody.innerHTML = "";
    if (!page.length) {
      var tr0 = document.createElement("tr");
      var td0 = document.createElement("td");
      td0.colSpan = 7;
      td0.textContent = "Geen resultaten";
      td0.style.textAlign = "center";
      td0.style.padding = "24px";
      td0.style.color = "var(--text-muted)";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    } else {
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.dataset.csId = r.id;

        var tdN = document.createElement("td");
        tdN.dataset.col = "medewerker";
        tdN.textContent = r.medewerker;
        tr.appendChild(tdN);

        var tdS = document.createElement("td");
        tdS.dataset.col = "saldo";
        tdS.textContent = fmtNum(r.saldo);
        tr.appendChild(tdS);

        var tdV = document.createElement("td");
        tdV.dataset.col = "verdiend";
        tdV.textContent = fmtNum(r.verdiend);
        tr.appendChild(tdV);

        var tdG = document.createElement("td");
        tdG.dataset.col = "gebruikt";
        tdG.textContent = fmtNum(r.gebruikt);
        tr.appendChild(tdG);

        var tdGh = document.createElement("td");
        tdGh.dataset.col = "geschiktheid";
        if (r.geschiktheidLabel) {
          var pill = document.createElement("span");
          pill.className = "comp-saldi-pill";
          pill.textContent = r.geschiktheidLabel;
          tdGh.appendChild(pill);
        } else {
          tdGh.textContent = "—";
          tdGh.style.color = "var(--text-muted)";
        }
        tr.appendChild(tdGh);

        var tdT = document.createElement("td");
        tdT.dataset.col = "team";
        tdT.textContent = r.team;
        tr.appendChild(tdT);

        var tdA = document.createElement("td");
        tdA.dataset.col = "acties";
        tdA.className = "cs-td-acties";
        var viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "cs-view-btn";
        viewBtn.setAttribute("aria-label", "Bekijk " + r.medewerker);
        viewBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        tdA.appendChild(viewBtn);
        tr.appendChild(tdA);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();
    syncSortHeaders();

    if (rangeEl) {
      if (total === 0) {
        rangeEl.textContent = "0 van 0";
      } else {
        rangeEl.textContent = page.length + " van " + total;
      }
    }
    if (pageEl) pageEl.textContent = "Pagina " + (currentPage + 1) + " van " + totalPages;

    var first = document.getElementById("cs-pager-first");
    var prev = document.getElementById("cs-pager-prev");
    var next = document.getElementById("cs-pager-next");
    var last = document.getElementById("cs-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("cs-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var filtered = getFiltered();
      var pageSize = getPageSize();
      var total = filtered.length;
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  if (rowsSelect) rowsSelect.addEventListener("change", function () { currentPage = 0; render(); });
  if (searchInput) searchInput.addEventListener("input", function () { currentPage = 0; render(); });

  var columnsBtn = document.getElementById("cs-columns-menu-btn");
  var columnsPanel = document.getElementById("cs-columns-panel");

  document.querySelectorAll("#cs-columns-panel .column-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      btn.classList.toggle("is-checked");
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(btn.dataset.col, visible);
    });
  });

  if (columnsBtn && columnsPanel) {
    columnsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !columnsPanel.hidden;
      columnsPanel.hidden = open;
      columnsBtn.setAttribute("aria-expanded", !open);
    });
    columnsPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  document.addEventListener("click", function () {
    if (columnsPanel) {
      columnsPanel.hidden = true;
      if (columnsBtn) columnsBtn.setAttribute("aria-expanded", "false");
    }
    document.querySelectorAll("#cs-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    document.querySelectorAll("#cs-table thead th.th-sort").forEach(function (th) { th.classList.remove("th-sort-open"); });
  });

  document.querySelectorAll("#cs-table .th-sort-trigger").forEach(function (trigger) {
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var th = trigger.closest("th");
      var menu = th ? th.querySelector(".th-sort-menu") : null;
      if (!menu) return;
      var wasHidden = menu.hasAttribute("hidden");
      document.querySelectorAll("#cs-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll("#cs-table thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
      if (wasHidden) {
        menu.removeAttribute("hidden");
        if (th) th.classList.add("th-sort-open");
      }
    });
  });

  document.querySelectorAll("#cs-table .th-sort-opt").forEach(function (opt) {
    opt.addEventListener("click", function (e) {
      e.stopPropagation();
      var action = opt.dataset.action;
      var th = opt.closest("th");
      var colId = th ? th.dataset.col : null;
      if (!colId) return;

      if (action === "hide") {
        var toggle = document.querySelector('#cs-columns-panel .column-toggle[data-col="' + colId + '"]');
        if (toggle) {
          toggle.classList.remove("is-checked");
          toggle.setAttribute("aria-checked", "false");
        }
        setColumnVisible(colId, false);
      } else {
        sortKey = colId;
        sortDir = action;
        currentPage = 0;
        render();
      }
      document.querySelectorAll("#cs-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll("#cs-table thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
    });
  });

  tbody.addEventListener("click", function (e) {
    if (e.target.closest(".cs-view-btn")) {
      e.stopPropagation();
      return;
    }
  });

  render();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de cache
  // ververst (eerste page-load op een nieuwe browser).
  window.addEventListener("besa:comp-saldi-updated", function () {
    try {
      allRows = loadRows();
      render();
    } catch (e) { /* */ }
  });
})();
