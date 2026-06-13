/* Uren budgettering — weken 1–52/53 (ISO, afh. van jaar), cliënten, localStorage, bulk, sorteren */
(function () {
  "use strict";

  var STORAGE = "ffUrenBudgetV1";
  // ISO-weken per jaar: 52 of 53. 28 december valt altijd in de laatste
  // ISO-week, dus de week van 28-dec geeft het aantal weken. Voorheen stond dit
  // hard op 52 → in 53-weken-jaren (bv. 2026, 2020, 2032) was week 53 niet te
  // budgetteren.
  function isoWeeksInYear(year) {
    var y = parseInt(String(year), 10);
    if (!isFinite(y)) return 52;
    var d = new Date(y, 11, 28);
    var day = (d.getDay() + 6) % 7;
    var thu = new Date(d); thu.setDate(d.getDate() - day + 3);
    var ft = new Date(thu.getFullYear(), 0, 4);
    var fday = (ft.getDay() + 6) % 7; ft.setDate(ft.getDate() - fday + 3);
    return 1 + Math.round((thu - ft) / (7 * 24 * 3600 * 1000));
  }
  var tbody = document.getElementById("ub-tbody");
  var selClient = document.getElementById("ub-sel-client");
  var selYear = document.getElementById("ub-sel-year");
  var pickWarn = document.getElementById("ub-pick-warn");
  var bulkInfo = document.getElementById("ub-bulk-info");
  var bulkStart = document.getElementById("ub-bulk-start");
  var bulkExit = document.getElementById("ub-bulk-exit");
  var thChk = document.getElementById("ub-th-chk");
  var sortWk = document.getElementById("ub-sort-wk");
  var sortUren = document.getElementById("ub-sort-uren");
  var table = document.getElementById("ub-table");

  var sortMode = "week-asc";
  var bulkOpen = false;
  var lastRangeWeek = -1;
  var weekMetas = [];

  function getStore() {
    try {
      var s = window.localStorage.getItem(STORAGE);
      var p = s ? JSON.parse(s) : {};
      return typeof p === "object" && p !== null ? p : {};
    } catch (e) {
      return {};
    }
  }

  function setStore(obj) {
    try {
      window.localStorage.setItem(STORAGE, JSON.stringify(obj));
    } catch (e) {
      /* ignore */
    }
  }

  function getHoursMap(clientId, year) {
    if (!clientId) return null;
    var g = getStore();
    if (!g[clientId] || !g[clientId][year]) return {};
    return g[clientId][year] || {};
  }

  function setHour(clientId, year, week, n) {
    if (!clientId) return;
    var g = getStore();
    if (!g[clientId]) g[clientId] = {};
    if (!g[clientId][year]) g[clientId][year] = {};
    var stored;
    if (n === 0 || n === "" || n === null || n === "0" || (typeof n === "number" && isNaN(n))) {
      delete g[clientId][year][String(week)];
      stored = 0;
    } else {
      stored = Number(n);
      g[clientId][year][String(week)] = stored;
    }
    setStore(g);
    // Fire-and-forget naar Supabase via data-laag.
    if (window.urenBudgetDB && typeof window.urenBudgetDB.setCell === "function") {
      try { window.urenBudgetDB.setCell(clientId, year, week, stored); } catch (e) { /* */ }
    }
  }

  function mondayOfIsoWeek1(year) {
    var jan4 = new Date(year, 0, 4);
    var d = jan4.getDay() || 7;
    var mon = new Date(jan4);
    mon.setDate(jan4.getDate() - (d - 1));
    return mon;
  }

  function addDays(date, n) {
    var x = new Date(date);
    x.setDate(date.getDate() + n);
    return x;
  }

  function mondayOfIsoWeek(year, week) {
    return addDays(mondayOfIsoWeek1(year), (week - 1) * 7);
  }

  function formatRangeEn(mon) {
    var sun = addDays(mon, 6);
    var fmt = function (d) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    };
    return fmt(mon) + " - " + fmt(sun);
  }

  function buildWeekMetas(year) {
    var y = parseInt(String(year), 10);
    var list = [];
    var maxWeek = isoWeeksInYear(y);
    for (var w = 1; w <= maxWeek; w++) {
      var mon = mondayOfIsoWeek(y, w);
      list.push({ week: w, monday: mon, rangeText: formatRangeEn(mon) });
    }
    weekMetas = list;
    return list;
  }

  function clientName(c) {
    if (!c) return "";
    return String(c.voornaam || "").trim() + " " + String(c.achternaam || "").trim();
  }

  function fillClientSelect() {
    if (!selClient) return;
    var v = selClient.value;
    var items = (typeof getClientenItems === "function" && getClientenItems()) || [];
    var act = items.filter(function (c) {
      return c && !c.archived;
    });
    act.sort(function (a, b) {
      return clientName(a).localeCompare(clientName(b), "nl", { sensitivity: "base" });
    });
    selClient.innerHTML = '<option value="">Selecteer cliënt</option>';
    for (var i = 0; i < act.length; i++) {
      var c = act[i];
      if (!c || !c.id) continue;
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = clientName(c).trim() || "Cliënt " + c.id;
      selClient.appendChild(o);
    }
    if (v) selClient.value = v;
  }

  function renderTbody() {
    if (!tbody) return;
    var year = selYear ? String(selYear.value) : "2026";
    buildWeekMetas(year);
    var cid = selClient ? String(selClient.value) : "";
    var hours = cid ? getHoursMap(cid, year) : null;

    tbody.textContent = "";
    for (var i = 0; i < weekMetas.length; i++) {
      var wm = weekMetas[i];
      var w = wm.week;
      var tr = document.createElement("tr");
      tr.className = "ub-row";
      tr.setAttribute("data-ub-week", String(w));

      var td0 = document.createElement("td");
      td0.className = "th-check ub-td-chk";
      td0.setAttribute("data-col", "select");
      if (!bulkOpen) {
        td0.setAttribute("hidden", "");
      } else {
        td0.removeAttribute("hidden");
      }
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "table-checkbox ub-cb";
      cb.setAttribute("aria-label", "Selecteer week " + w);
      td0.appendChild(cb);

      var td1 = document.createElement("td");
      td1.setAttribute("data-col", "week");
      var line = document.createElement("span");
      line.className = "ub-wk-lbl";
      var b = document.createElement("strong");
      b.textContent = "Week " + w;
      var spanM = document.createElement("span");
      spanM.className = "ub-wk-dates";
      spanM.textContent = " - (" + wm.rangeText + ")";
      line.appendChild(b);
      line.appendChild(spanM);
      td1.appendChild(line);

      var td2 = document.createElement("td");
      td2.setAttribute("data-col", "uren");
      td2.className = "ub-uren-cell";
      if (cid) {
        var h = hours && hours[String(w)] != null ? Number(hours[String(w)]) : 0;
        tr.setAttribute("data-ub-hours", String(h));
        var wrap = document.createElement("div");
        wrap.className = "ub-uren-wrap";
        if (h > 0) {
          var dotU = document.createElement("span");
          dotU.className = "ub-dot ub-dot--upd";
          dotU.setAttribute("title", "Opgeslagen");
          wrap.appendChild(dotU);
        }
        var inp = document.createElement("input");
        inp.type = "number";
        inp.className = "modal-input ub-hour-input";
        inp.min = "0";
        inp.max = "168";
        inp.step = "0.5";
        inp.setAttribute("inputmode", "decimal");
        inp.setAttribute("aria-label", "Standaard uren week " + w);
        inp.value = h > 0 ? String(h) : "0";
        wrap.appendChild(inp);
        td2.appendChild(wrap);
        (function (week) {
          inp.addEventListener("change", function () {
            var val = parseFloat(String(inp.value).replace(",", "."));
            if (isNaN(val) || val < 0) {
              val = 0;
              inp.value = "0";
            }
            setHour(cid, year, week, val);
            tr.setAttribute("data-ub-hours", String(val));
            var dots = wrap.querySelectorAll(".ub-dot");
            for (var di = 0; di < dots.length; di++) {
              dots[di].remove();
            }
            if (val > 0) {
              var d2 = document.createElement("span");
              d2.className = "ub-dot ub-dot--upd";
              d2.setAttribute("title", "Opgeslagen");
              wrap.insertBefore(d2, wrap.firstChild);
            }
          });
        })(w);
      } else {
        tr.setAttribute("data-ub-hours", "0");
        td2.classList.add("ub-uren--empty");
        var em = document.createElement("em");
        em.className = "ub-empty-dash";
        em.setAttribute("aria-hidden", "true");
        em.textContent = "—";
        td2.appendChild(em);
      }
      tr.appendChild(td0);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
    }
    applySort();
  }

  function getRowsArray() {
    if (!tbody) return [];
    return [].slice.call(tbody.querySelectorAll("tr.ub-row"));
  }

  function applySort() {
    var rows = getRowsArray();
    if (rows.length === 0) return;
    if (sortMode === "week-asc") {
      rows.sort(function (a, b) {
        var aw = parseInt(a.getAttribute("data-ub-week"), 10);
        var bw = parseInt(b.getAttribute("data-ub-week"), 10);
        return aw - bw;
      });
    } else if (sortMode === "hours-asc" || sortMode === "hours-desc") {
      rows.sort(function (a, b) {
        var ha = parseFloat(a.getAttribute("data-ub-hours") || "0");
        var hb = parseFloat(b.getAttribute("data-ub-hours") || "0");
        if (ha !== hb) return sortMode === "hours-asc" ? ha - hb : hb - ha;
        return parseInt(a.getAttribute("data-ub-week"), 10) - parseInt(b.getAttribute("data-ub-week"), 10);
      });
    }
    for (var i = 0; i < rows.length; i++) {
      tbody.appendChild(rows[i]);
    }
  }

  function setSortButtonStates() {
    var wOn = sortMode === "week-asc";
    var hOn = sortMode === "hours-asc" || sortMode === "hours-desc";
    if (sortWk) {
      sortWk.classList.toggle("ub-sort--on", wOn);
      sortWk.setAttribute("aria-pressed", wOn ? "true" : "false");
    }
    if (sortUren) {
      sortUren.classList.toggle("ub-sort--on", hOn);
      sortUren.setAttribute("aria-pressed", hOn ? "true" : "false");
    }
  }

  function setElHidden(el, on) {
    if (!el) return;
    if (on) {
      el.setAttribute("hidden", "");
      el.classList.add("is-hidden");
    } else {
      el.removeAttribute("hidden");
      el.classList.remove("is-hidden");
    }
  }

  function syncUi() {
    var cid = selClient && selClient.value;
    if (pickWarn) {
      if (cid) {
        pickWarn.setAttribute("hidden", "");
        pickWarn.classList.add("is-hidden");
      } else {
        pickWarn.removeAttribute("hidden");
        pickWarn.classList.remove("is-hidden");
      }
    }
    setElHidden(bulkStart, !cid || bulkOpen);
    setElHidden(bulkExit, !cid || !bulkOpen);
    setElHidden(bulkInfo, !cid || !bulkOpen);
    setElHidden(thChk, !bulkOpen || !cid);
    if (table) {
      table.classList.toggle("ub-table--bulk", Boolean(bulkOpen && cid));
    }
  }

  if (selClient) {
    selClient.addEventListener("change", function () {
      lastRangeWeek = -1;
      bulkOpen = false;
      renderTbody();
      setSortButtonStates();
      syncUi();
    });
  }

  if (selYear) {
    selYear.addEventListener("change", function () {
      lastRangeWeek = -1;
      renderTbody();
      setSortButtonStates();
      syncUi();
    });
  }

  if (bulkStart) {
    bulkStart.addEventListener("click", function () {
      if (!selClient || !selClient.value) return;
      lastRangeWeek = -1;
      bulkOpen = true;
      renderTbody();
      setSortButtonStates();
      syncUi();
    });
  }

  if (bulkExit) {
    bulkExit.addEventListener("click", function () {
      lastRangeWeek = -1;
      bulkOpen = false;
      renderTbody();
      setSortButtonStates();
      syncUi();
    });
  }

  if (sortWk) {
    sortWk.addEventListener("click", function () {
      sortMode = "week-asc";
      setSortButtonStates();
      applySort();
    });
  }

  if (sortUren) {
    sortUren.addEventListener("click", function () {
      if (sortMode === "hours-asc") {
        sortMode = "hours-desc";
      } else {
        sortMode = "hours-asc";
      }
      setSortButtonStates();
      applySort();
    });
  }

  if (tbody) {
    tbody.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || t.type !== "checkbox" || !t.classList || !t.classList.contains("ub-cb")) return;
      e.stopPropagation();
    });
    tbody.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || t.type !== "checkbox" || !t.classList || !t.classList.contains("ub-cb")) return;
      var tr = t.closest("tr.ub-row");
      if (!tr) return;
      var wk = parseInt(tr.getAttribute("data-ub-week") || "0", 10);
      if (e.shiftKey && lastRangeWeek > 0) {
        var a = Math.min(lastRangeWeek, wk);
        var b = Math.max(lastRangeWeek, wk);
        tbody.querySelectorAll("tr.ub-row").forEach(function (row) {
          var w = parseInt(row.getAttribute("data-ub-week") || "0", 10);
          if (w >= a && w <= b) {
            var c = row.querySelector("input.ub-cb");
            if (c) c.checked = true;
          }
        });
      }
      lastRangeWeek = wk;
    });
  }

  // ----- Kolommen-knop -----
  var UB_COLUMN_CONFIG = [
    { id: "select", label: "Selectie", defaultOn: true, skipToggle: true },
    { id: "week", label: "Weken", defaultOn: true },
    { id: "uren", label: "Standaard uren", defaultOn: true },
  ];
  function setUbColumnVisible(colId, visible) {
    document.querySelectorAll('.ub-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyUbColumnVisibility() {
    document.querySelectorAll("#ub-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setUbColumnVisible(colId, isOn);
    });
  }
  function buildUbColumnsPanel() {
    var list = document.getElementById("ub-columns-list");
    if (!list) return;
    list.innerHTML = "";
    UB_COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "column-toggle" + (c.defaultOn ? " is-checked" : "");
      b.setAttribute("data-col", c.id);
      b.setAttribute("role", "menuitemcheckbox");
      b.setAttribute("aria-checked", c.defaultOn ? "true" : "false");
      b.innerHTML = '<span class="column-check" aria-hidden="true">✓</span> ' + c.label;
      li.appendChild(b);
      list.appendChild(li);
    });
  }
  function wireUbColumnsPanel() {
    var colBtn = document.getElementById("ub-columns-menu-btn");
    var colPanel = document.getElementById("ub-columns-panel");
    var colList = document.getElementById("ub-columns-list");
    if (colBtn && colPanel) {
      colBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var hidden = colPanel.hasAttribute("hidden");
        if (hidden) {
          colPanel.removeAttribute("hidden");
          colBtn.setAttribute("aria-expanded", "true");
        } else {
          colPanel.setAttribute("hidden", "");
          colBtn.setAttribute("aria-expanded", "false");
        }
      });
      colPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    }
    if (colList) {
      colList.addEventListener("click", function (e) {
        var t = e.target && e.target.closest && e.target.closest(".column-toggle");
        if (!t) return;
        t.classList.toggle("is-checked");
        var on = t.classList.contains("is-checked");
        t.setAttribute("aria-checked", on ? "true" : "false");
        applyUbColumnVisibility();
      });
    }
    document.addEventListener("click", function () {
      if (colPanel) {
        colPanel.setAttribute("hidden", "");
        if (colBtn) colBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Wrap bestaande renderTbody zodat na elk render de kolom-zichtbaarheid
  // opnieuw wordt toegepast (anders verdwijnen verborgen kolommen na re-render).
  var _ubOriginalRenderTbody = renderTbody;
  renderTbody = function () {
    _ubOriginalRenderTbody.apply(this, arguments);
    applyUbColumnVisibility();
  };

  buildUbColumnsPanel();
  wireUbColumnsPanel();
  fillClientSelect();
  renderTbody();
  setSortButtonStates();
  syncUi();

  // Wanneer de Supabase-bootstrap of een externe wijziging de cache vernieuwt
  // (bv. eerste page-load op een nieuwe browser), opnieuw de tabel vullen
  // zodat de uren meteen zichtbaar zijn.
  window.addEventListener("ff:uren-budget-updated", function () {
    try { renderTbody(); } catch (e) { /* */ }
  });
})();
