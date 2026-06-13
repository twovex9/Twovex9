(function () {
  var tbody = document.getElementById("cb-tbody");
  var searchInput = document.getElementById("cb-search");
  var rangeEl = document.getElementById("cb-pager-range");
  var pageEl = document.getElementById("cb-pager-page");
  var rowsSelect = document.getElementById("cb-rows-per-page");
  var table = document.getElementById("cb-table");

  if (!tbody || !table) return;

  var NAMES = [
    "Tanja Koster", "Adriana Malovan", "Nick van Harskamp", "Marieke Jansen", "Thomas de Vries",
    "Sophie Bakker", "Lars Visser", "Emma Smit", "Daan Mulder", "Lisa de Boer",
    "Noah Kok", "Julia Dijkstra", "Finn Janssen", "Eva van Dijk", "Sam Berg"
  ];

  function hash01(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function fmtDatum(ts) {
    var d = new Date(ts);
    return d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function fmtUrenU(u) {
    return Math.round(Number(u)) + "u";
  }

  function fmtCompUren(totalMin) {
    var neg = totalMin < 0;
    var t = Math.abs(Math.round(totalMin));
    var h = Math.floor(t / 60);
    var m = t % 60;
    var s = h + "u " + m + "m";
    return neg ? "-" + s : s;
  }

  /**
   * Bouwt de demo-data op basis van een deterministische hash. Fallback voor
   * wanneer de Supabase-cache nog leeg is (vóór bootstrap).
   */
  function buildSeedRows() {
    var rows = [];
    var base = new Date(2025, 0, 1).getTime();
    var i;
    for (i = 0; i < 52; i++) {
      var dayOff = Math.floor(i / 2) * 86400000;
      var ts = base + dayOff + (i % 3) * 3600000;
      var h1 = hash01(i);
      var h2 = hash01(i + 11);
      var contract = [24, 32, 36][i % 3];
      var gepland = i % 5 === 0 ? 0 : Math.min(contract, Math.round(h1 * contract));
      var compensatieMin = Math.round((h2 - 0.45) * 8000 + (i % 7) * 37 - 200);
      rows.push({
        id: "cb_" + i,
        datumTs: ts,
        medewerker: NAMES[i % NAMES.length],
        contractU: contract,
        geplandU: gepland,
        compensatieMin: compensatieMin
      });
    }
    return rows;
  }

  function loadRows() {
    if (window.compBerekeningenDB && typeof window.compBerekeningenDB.getAllSync === "function") {
      var fromDb = window.compBerekeningenDB.getAllSync();
      if (fromDb && fromDb.length) return fromDb;
    }
    return buildSeedRows();
  }

  var allRows = loadRows();

  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "15", 10) || 15;
  }

  function getVal(row, key) {
    if (key === "datum") return row.datumTs;
    if (key === "medewerker") return row.medewerker || "";
    if (key === "contract") return row.contractU;
    if (key === "gepland") return row.geplandU;
    if (key === "compensatie") return row.compensatieMin;
    return "";
  }

  function getFiltered() {
    var items = allRows.slice();
    var q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    if (q) {
      items = items.filter(function (r) {
        return (
          (r.medewerker || "").toLowerCase().includes(q) ||
          fmtDatum(r.datumTs).toLowerCase().includes(q) ||
          fmtUrenU(r.contractU).toLowerCase().includes(q) ||
          fmtUrenU(r.geplandU).toLowerCase().includes(q) ||
          fmtCompUren(r.compensatieMin).toLowerCase().includes(q)
        );
      });
    }

    if (sortKey) {
      var sk = sortKey;
      var numCol = sk !== "medewerker";
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
    document.querySelectorAll('#cb-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll("#cb-columns-panel .column-toggle").forEach(function (btn) {
      var colId = btn.dataset.col;
      var visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  function syncSortHeaders() {
    document.querySelectorAll("#cb-table thead th.th-sort").forEach(function (th) {
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
      td0.colSpan = 5;
      td0.textContent = "Geen resultaten";
      td0.style.textAlign = "center";
      td0.style.padding = "24px";
      td0.style.color = "var(--text-muted)";
      tr0.appendChild(td0);
      tbody.appendChild(tr0);
    } else {
      page.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.dataset.cbId = r.id;

        var tdD = document.createElement("td");
        tdD.dataset.col = "datum";
        tdD.textContent = fmtDatum(r.datumTs);
        tr.appendChild(tdD);

        var tdN = document.createElement("td");
        tdN.dataset.col = "medewerker";
        tdN.textContent = r.medewerker;
        tr.appendChild(tdN);

        var tdC = document.createElement("td");
        tdC.dataset.col = "contract";
        tdC.textContent = fmtUrenU(r.contractU);
        tr.appendChild(tdC);

        var tdG = document.createElement("td");
        tdG.dataset.col = "gepland";
        tdG.textContent = fmtUrenU(r.geplandU);
        tr.appendChild(tdG);

        var tdComp = document.createElement("td");
        tdComp.dataset.col = "compensatie";
        var link = document.createElement("a");
        link.href = "#";
        link.className = "comp-berekeningen-uren-link";
        link.textContent = fmtCompUren(r.compensatieMin);
        link.setAttribute("aria-label", "Compensatie uren " + fmtCompUren(r.compensatieMin));
        tdComp.appendChild(link);
        tr.appendChild(tdComp);

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

    var first = document.getElementById("cb-pager-first");
    var prev = document.getElementById("cb-pager-prev");
    var next = document.getElementById("cb-pager-next");
    var last = document.getElementById("cb-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("cb-pager-" + action);
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

  var columnsBtn = document.getElementById("cb-columns-menu-btn");
  var columnsPanel = document.getElementById("cb-columns-panel");

  document.querySelectorAll("#cb-columns-panel .column-toggle").forEach(function (btn) {
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
    document.querySelectorAll("#cb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
    document.querySelectorAll("#cb-table thead th.th-sort").forEach(function (th) { th.classList.remove("th-sort-open"); });
  });

  document.querySelectorAll("#cb-table .th-sort-trigger").forEach(function (trigger) {
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var th = trigger.closest("th");
      var menu = th ? th.querySelector(".th-sort-menu") : null;
      if (!menu) return;
      var wasHidden = menu.hasAttribute("hidden");
      document.querySelectorAll("#cb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll("#cb-table thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
      if (wasHidden) {
        menu.removeAttribute("hidden");
        if (th) th.classList.add("th-sort-open");
      }
    });
  });

  document.querySelectorAll("#cb-table .th-sort-opt").forEach(function (opt) {
    opt.addEventListener("click", function (e) {
      e.stopPropagation();
      var action = opt.dataset.action;
      var th = opt.closest("th");
      var colId = th ? th.dataset.col : null;
      if (!colId) return;

      if (action === "hide") {
        var toggle = document.querySelector('#cb-columns-panel .column-toggle[data-col="' + colId + '"]');
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
      document.querySelectorAll("#cb-table .th-sort-menu").forEach(function (m) { m.setAttribute("hidden", ""); });
      document.querySelectorAll("#cb-table thead th.th-sort").forEach(function (h) { h.classList.remove("th-sort-open"); });
    });
  });

  tbody.addEventListener("click", function (e) {
    var a = e.target.closest(".comp-berekeningen-uren-link");
    if (a) {
      e.preventDefault();
    }
  });

  render();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de cache
  // ververst.
  window.addEventListener("ff:comp-berekeningen-updated", function () {
    try {
      allRows = loadRows();
      render();
    } catch (e) { /* */ }
  });
})();
