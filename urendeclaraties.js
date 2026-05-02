/* Urendeclaraties — overzicht (demo-data, filters, kolommen) */
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

  function setLockUi(locked) {
    if (!lockBtn) return;
    lockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
    lockBtn.classList.toggle("btn-primary", locked);
    lockBtn.classList.toggle("btn-outline", !locked);
    if (lockLbl) {
      lockLbl.textContent = locked ? "Maand ontgrendelen" : "Maand vergrendelen";
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

  if (lockBtn) {
    lockBtn.addEventListener("click", function () {
      var wasLocked = lockBtn.getAttribute("aria-pressed") === "true";
      setLockUi(!wasLocked);
    });
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

  applyColumnToggles();
  filterRows();
})();
