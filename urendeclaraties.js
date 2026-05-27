/* Urendeclaraties — overzicht (Supabase-data via urendeclaraties-data.js, filters, kolommen) */
(function () {
  "use strict";

  var toastEl = document.getElementById("ud-toast");
  var searchInput = document.getElementById("ud-search");
  var tbody = document.getElementById("ud-tbody");
  var selJaar = document.getElementById("ud-sel-jaar");
  var selMaand = document.getElementById("ud-sel-maand");
  var selZorg = document.getElementById("ud-sel-zorg");
  var resetBtn = document.getElementById("ud-reset");
  var lockBtn = document.getElementById("ud-lock-btn");
  var checkAll = document.getElementById("ud-check-all");
  var colsBtn = document.getElementById("ud-cols-btn");
  var colsPanel = document.getElementById("ud-cols-panel");
  var table = document.getElementById("ud-table");

  function fmtEuro(num) {
    var n = Number(num);
    if (!isFinite(n)) n = 0;
    var neg = n < 0;
    n = Math.abs(n);
    var whole = Math.floor(n);
    var cents = Math.round((n - whole) * 100);
    var s = String(whole);
    var withDots = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var centsStr = (cents < 10 ? "0" : "") + cents;
    return (neg ? "-" : "") + "€\u00a0" + withDots + "," + centsStr;
  }

  function fmtUren(n) {
    var v = Number(n);
    if (!isFinite(v)) return "0";
    if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
    return String(v).replace(".", ",");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderRows() {
    if (!tbody) return;
    var items = [];
    if (window.urendeclaratiesDB && typeof window.urendeclaratiesDB.getAllSync === "function") {
      items = window.urendeclaratiesDB.getAllSync() || [];
    }
    var html = items.map(function (r) {
      return (
        '<tr' +
        ' data-ud-client="' + escapeHtml(r.client) + '"' +
        ' data-ud-zorg="' + escapeHtml(r.zorgsoort) + '"' +
        ' data-ud-jaar="' + escapeHtml(String(r.jaar)) + '"' +
        ' data-ud-maand="' + escapeHtml(String(r.maand)) + '"' +
        '>' +
        '<td data-col="sel"><input type="checkbox" class="table-checkbox" aria-label="Selecteer rij" /></td>' +
        '<td data-col="client">' + escapeHtml(r.client) + '</td>' +
        '<td data-col="maand">' + escapeHtml(r.maandLabel) + '</td>' +
        '<td data-col="besc">' + escapeHtml(r.beschikking) + '</td>' +
        '<td data-col="zorg">' + escapeHtml(r.zorgsoort) + '</td>' +
        '<td data-col="tarif" class="cl-ud-td-money">' + fmtEuro(r.uurtarief) + '</td>' +
        '<td data-col="bedrag" class="cl-ud-td-money">' + fmtEuro(r.bedrag) + '</td>' +
        '<td data-col="deb" class="cl-num">' + fmtUren(r.gedebiteerdeUren) + '</td>' +
        '<td data-col="ing" class="cl-num">' + fmtUren(r.ingediendeUren) + '</td>' +
        '</tr>'
      );
    }).join("");
    tbody.innerHTML = html;
  }

  function showToast(msg) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.removeAttribute("hidden");
    toastEl.classList.add("is-visible");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
      toastEl.setAttribute("hidden", "");
    }, 2200);
  }

  function setColVisible(col, visible) {
    var display = visible ? "" : "none";
    var cells = table.querySelectorAll('[data-col="' + col + '"]');
    for (var i = 0; i < cells.length; i++) {
      cells[i].style.display = display;
    }
  }

  function applyColumnToggles() {
    var toggles = document.querySelectorAll("#ud-cols-list .column-toggle");
    for (var i = 0; i < toggles.length; i++) {
      var btn = toggles[i];
      var col = btn.getAttribute("data-col");
      if (!col) continue;
      var on = btn.classList.contains("is-checked");
      setColVisible(col, on);
    }
  }

  function filterRows() {
    if (!tbody) return;
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : "";
    var zf = selZorg ? String(selZorg.value) : "";
    var yf = selJaar ? String(selJaar.value) : "";
    var mf = selMaand ? String(selMaand.value) : "";
    var rows = tbody.querySelectorAll("tr");
    var n = 0;
    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      var client = (tr.getAttribute("data-ud-client") || "").toLowerCase();
      var z = tr.getAttribute("data-ud-zorg") || "";
      var rj = tr.getAttribute("data-ud-jaar");
      var rm = tr.getAttribute("data-ud-maand");
      var show = true;
      if (q && client.indexOf(q) === -1) {
        var rowText = tr.textContent || "";
        if (rowText.toLowerCase().indexOf(q) === -1) show = false;
      }
      if (show && yf && rj !== yf) show = false;
      if (show && mf !== "" && (rm == null || String(rm) !== mf)) show = false;
      if (show && zf && z !== zf) show = false;
      tr.style.display = show ? "" : "none";
      if (show) n++;
    }
    var range = document.getElementById("ud-pager-range");
    if (range) {
      if (n === 0) range.textContent = "0 van 0";
      else range.textContent = "1–" + n + " van " + n;
    }
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      if (selJaar) selJaar.value = "2026";
      if (selMaand) selMaand.value = "";
      if (selZorg) selZorg.value = "";
      filterRows();
      showToast("Filters gereset");
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", filterRows);
  }
  if (selZorg) {
    selZorg.addEventListener("change", filterRows);
  }
  if (selJaar) {
    selJaar.addEventListener("change", filterRows);
  }
  if (selMaand) {
    selMaand.addEventListener("change", filterRows);
  }

  var lockLbl = document.getElementById("ud-lock-lbl");
  var icoOpen = document.querySelector("#ud-lock-btn .ud-lock-svg--open");
  var icoClosed = document.querySelector("#ud-lock-btn .ud-lock-svg--closed");

  // NL-maand-labels voor confirm-modal
  var MAAND_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

  function currentYearMonth() {
    var y = selJaar ? parseInt(selJaar.value, 10) : (new Date().getFullYear());
    var m = selMaand && selMaand.value !== "" ? (parseInt(selMaand.value, 10) + 1) : (new Date().getMonth() + 1);
    if (!y) y = new Date().getFullYear();
    if (!m || m < 1 || m > 12) m = new Date().getMonth() + 1;
    return { year: y, month: m };
  }
  function maandLabel(y, m) {
    var mn = MAAND_NL[m - 1] || ("maand " + m);
    return mn.charAt(0).toUpperCase() + mn.slice(1) + " " + y;
  }

  function setLockUi(locked) {
    if (!lockBtn) return;
    lockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
    lockBtn.classList.toggle("btn-primary", locked);
    lockBtn.classList.toggle("btn-outline", !locked);
    if (lockLbl) {
      var ym = currentYearMonth();
      var mn = MAAND_NL[ym.month - 1] || "maand";
      var monthCap = mn.charAt(0).toUpperCase() + mn.slice(1);
      lockLbl.textContent = locked ? (monthCap + " ontgrendelen") : (monthCap + " vergrendelen");
    }
    if (icoOpen) {
      if (locked) icoOpen.setAttribute("hidden", "");
      else icoOpen.removeAttribute("hidden");
    }
    if (icoClosed) {
      if (locked) icoClosed.removeAttribute("hidden");
      else icoClosed.setAttribute("hidden", "");
    }
    lockBtn.setAttribute(
      "aria-label",
      locked
        ? "Maand is vergrendeld, klik om te ontgrendelen"
        : "Maand is niet vergrendeld, klik om te vergrendelen"
    );
  }

  function refreshLockUiFromDb() {
    if (!window.lockedMonthsDB) return;
    var ym = currentYearMonth();
    var isLocked = window.lockedMonthsDB.isLockedSync(ym.year, ym.month);
    setLockUi(isLocked);
  }

  // Bij filterwissel jaar/maand: lock-status opnieuw uitlezen
  if (selJaar) selJaar.addEventListener("change", refreshLockUiFromDb);
  if (selMaand) selMaand.addEventListener("change", refreshLockUiFromDb);

  // Live-refresh wanneer een andere tab een (un)lock doet
  window.addEventListener("besa:locked-months-updated", refreshLockUiFromDb);

  if (lockBtn) {
    lockBtn.addEventListener("click", async function () {
      if (!window.lockedMonthsDB) {
        if (window.showError) window.showError("Maand-vergrendeling-laag niet geladen");
        return;
      }
      var ym = currentYearMonth();
      var label = maandLabel(ym.year, ym.month);
      var wasLocked = window.lockedMonthsDB.isLockedSync(ym.year, ym.month);

      var ok;
      if (wasLocked) {
        ok = await window.showSliderConfirmModal({
          title: "Maand ontgrendelen?",
          preview: label,
          okLabel: "Ontgrendelen",
          cancelLabel: "Annuleren",
          message: "Na ontgrendelen kunnen werkuren in deze maand weer worden gewijzigd."
        });
      } else {
        ok = await window.showSliderConfirmModal({
          title: "Maand vergrendelen?",
          preview: label,
          okLabel: "Vergrendelen",
          cancelLabel: "Annuleren",
          message: "Na vergrendelen kunnen werkuren in deze maand NIET meer worden gewijzigd, toegevoegd of verwijderd. Pas weer mogelijk na ontgrendelen."
        });
      }
      if (!ok) return;

      try {
        if (wasLocked) {
          await window.lockedMonthsDB.unlock(ym.year, ym.month);
          if (window.showActionFeedback) window.showActionFeedback("restored", "Maand");
          else showToast(label + " ontgrendeld");
        } else {
          await window.lockedMonthsDB.lock(ym.year, ym.month);
          if (window.showActionFeedback) window.showActionFeedback("saved", "Maand vergrendeld");
          else showToast(label + " vergrendeld");
        }
        refreshLockUiFromDb();
      } catch (err) {
        console.error("[urendecl] lock toggle mislukt:", err);
        if (window.showError) window.showError("Vergrendelen mislukt: " + (err && err.message ? err.message : String(err)));
        else showToast("Vergrendelen mislukt");
      }
    });
  }

  // Initiële UI-status na bootstrap
  if (window.lockedMonthsDB && window.lockedMonthsDB.ready) {
    window.lockedMonthsDB.ready.then(refreshLockUiFromDb).catch(function () { /* */ });
  }

  if (checkAll && tbody) {
    checkAll.addEventListener("change", function () {
      var on = checkAll.checked;
      var boxes = tbody.querySelectorAll('input.table-checkbox');
      for (var i = 0; i < boxes.length; i++) {
        var row = boxes[i].closest("tr");
        if (row && row.style.display === "none") continue;
        boxes[i].checked = on;
      }
    });
  }

  if (colsBtn && colsPanel) {
    colsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = colsPanel.hasAttribute("hidden");
      if (open) {
        colsPanel.removeAttribute("hidden");
        colsBtn.setAttribute("aria-expanded", "true");
      } else {
        colsPanel.setAttribute("hidden", "");
        colsBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("click", function () {
      colsPanel.setAttribute("hidden", "");
      colsBtn.setAttribute("aria-expanded", "false");
    });
    colsPanel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  var colList = document.getElementById("ud-cols-list");
  if (colList) {
    colList.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest(".column-toggle");
      if (!btn) return;
      e.preventDefault();
      btn.classList.toggle("is-checked");
      var on = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", on ? "true" : "false");
      var col = btn.getAttribute("data-col");
      if (col) setColVisible(col, on);
    });
  }

  renderRows();
  applyColumnToggles();
  filterRows();

  // Re-render zodra de Supabase-bootstrap of een externe wijziging de cache
  // ververst (eerste page-load op een nieuwe browser).
  window.addEventListener("besa:urendeclaraties-updated", function () {
    try {
      renderRows();
      applyColumnToggles();
      filterRows();
    } catch (e) { /* */ }
  });
})();
