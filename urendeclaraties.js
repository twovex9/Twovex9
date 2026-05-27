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

  function isAmbulantIntern(zorgsoort) {
    return String(zorgsoort || "").toLowerCase().indexOf("ambulant intern") !== -1;
  }

  function renderRows() {
    if (!tbody) return;
    var items = [];
    if (window.urendeclaratiesDB && typeof window.urendeclaratiesDB.getAllSync === "function") {
      items = window.urendeclaratiesDB.getAllSync() || [];
    }
    var EDIT_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    var DOWNLOAD_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    var html = items.map(function (r) {
      var canOverride = isAmbulantIntern(r.zorgsoort);
      var hasOverride = (r.overrideUren != null);
      var overrideCellHtml;
      if (canOverride) {
        var btnClass = hasOverride ? "ud-override-btn ud-override-btn--active" : "ud-override-btn";
        var btnTitle = hasOverride
          ? ("Override actief: " + r.overrideUren + " uur — klik om aan te passen")
          : "Aantal uren overschrijven";
        var btnLabel = hasOverride
          ? ('<span class="ud-override-badge">' + fmtUren(r.overrideUren) + ' u</span>')
          : ('<span class="ud-override-btn-lbl">' + EDIT_SVG + '</span>');
        overrideCellHtml = '<button type="button" class="' + btnClass + '" data-ud-id="' + escapeHtml(String(r.id || "")) + '" title="' + escapeHtml(btnTitle) + '" aria-label="' + escapeHtml(btnTitle) + '">' + btnLabel + '</button>';
      } else {
        overrideCellHtml = '<span class="ud-override-na" title="Alleen voor Ambulant intern beschikkingen">—</span>';
      }
      return (
        '<tr' +
        ' data-ud-client="' + escapeHtml(r.client) + '"' +
        ' data-ud-zorg="' + escapeHtml(r.zorgsoort) + '"' +
        ' data-ud-jaar="' + escapeHtml(String(r.jaar)) + '"' +
        ' data-ud-maand="' + escapeHtml(String(r.maand)) + '"' +
        ' data-ud-id="' + escapeHtml(String(r.id || "")) + '"' +
        '>' +
        '<td data-col="sel"><input type="checkbox" class="table-checkbox" aria-label="Selecteer rij" /></td>' +
        '<td data-col="client">' + escapeHtml(r.client) + '</td>' +
        '<td data-col="maand">' + escapeHtml(r.maandLabel) + '</td>' +
        '<td data-col="besc">' + escapeHtml(r.beschikking) + '</td>' +
        '<td data-col="zorg">' + escapeHtml(r.zorgsoort) + '</td>' +
        '<td data-col="tarif" class="cl-ud-td-money">' + fmtEuro(r.uurtarief) + '</td>' +
        '<td data-col="bedrag" class="cl-ud-td-money">' + fmtEuro(r.bedrag) + '</td>' +
        '<td data-col="deb" class="cl-num">' + fmtUren(r.gedebiteerdeUren) + '</td>' +
        '<td data-col="ing" class="cl-num">' + fmtUren(r.ingediendeUren) + (hasOverride ? ' <span class="ud-override-hint-row">(→ ' + fmtUren(r.overrideUren) + ')</span>' : '') + '</td>' +
        '<td data-col="spec" class="cl-ud-td-actions">' +
          '<button type="button" class="ud-spec-btn btn-outline btn-icon" data-ud-id="' + escapeHtml(String(r.id || "")) + '" title="Specificatie downloaden (Excel)" aria-label="Specificatie downloaden voor ' + escapeHtml(r.client) + '">' + DOWNLOAD_SVG + '</button>' +
        '</td>' +
        '<td data-col="override" class="cl-ud-td-actions">' + overrideCellHtml + '</td>' +
        '</tr>'
      );
    }).join("");
    tbody.innerHTML = html;
    wireSpecButtons();
    wireOverrideButtons();
  }

  function wireSpecButtons() {
    if (!tbody) return;
    var btns = tbody.querySelectorAll(".ud-spec-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", onSpecClick);
    }
  }

  function onSpecClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var id = btn.getAttribute("data-ud-id");
    if (!id || !window.urendeclaratiesDB) return;
    var items = window.urendeclaratiesDB.getAllSync() || [];
    var row = null;
    for (var i = 0; i < items.length; i++) { if (items[i] && String(items[i].id) === String(id)) { row = items[i]; break; } }
    if (!row) { showToast("Rij niet gevonden"); return; }
    if (!window.urendecSpecExport) { showToast("Export-laag niet geladen"); return; }
    btn.disabled = true;
    var res = window.urendecSpecExport.download(row);
    btn.disabled = false;
    if (res && res.ok) {
      if (window.showActionFeedback) window.showActionFeedback("exported", "Specificatie");
      else showToast("Specificatie geëxporteerd (" + res.rows + " werkuren)");
    } else {
      var msg = (res && res.error) ? res.error : "Export mislukt";
      if (window.showError) window.showError(msg);
      else showToast(msg);
    }
  }

  // ============================================================
  // PR #6 — Pauline Override modal (Ambulant Intern only)
  // ============================================================
  function wireOverrideButtons() {
    if (!tbody) return;
    var btns = tbody.querySelectorAll(".ud-override-btn");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", onOverrideClick);
  }
  function onOverrideClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var id = btn.getAttribute("data-ud-id");
    if (!id || !window.urendeclaratiesDB) return;
    var items = window.urendeclaratiesDB.getAllSync() || [];
    var row = null;
    for (var i = 0; i < items.length; i++) { if (items[i] && String(items[i].id) === String(id)) { row = items[i]; break; } }
    if (!row) { showToast("Rij niet gevonden"); return; }
    openOverrideModal(row);
  }
  function openOverrideModal(row) {
    var m = document.getElementById("ud-override-modal");
    if (!m) return;
    document.getElementById("ud-override-id").value = row.id;
    document.getElementById("ud-override-info-client").textContent = row.client || "—";
    document.getElementById("ud-override-info-periode").textContent = row.maandLabel || "—";
    document.getElementById("ud-override-info-besc").textContent = row.beschikking || "—";
    document.getElementById("ud-override-orig").value = fmtUren(row.ingediendeUren);
    document.getElementById("ud-override-uren").value = (row.overrideUren == null ? "" : String(row.overrideUren));
    document.getElementById("ud-override-reden").value = row.overrideReden || "";
    var meta = document.getElementById("ud-override-meta");
    if (row.overrideUren != null) {
      document.getElementById("ud-override-meta-uren").textContent = fmtUren(row.overrideUren) + " uur";
      document.getElementById("ud-override-meta-by").textContent = row.overrideByNaam || "(onbekend)";
      var at = row.overrideAt ? new Date(row.overrideAt) : null;
      document.getElementById("ud-override-meta-at").textContent = at && !isNaN(at.getTime())
        ? (at.toLocaleDateString("nl-NL") + " " + at.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }))
        : "—";
      meta.hidden = false;
      document.getElementById("ud-override-clear").hidden = false;
    } else {
      meta.hidden = true;
      document.getElementById("ud-override-clear").hidden = true;
    }
    var err = document.getElementById("ud-override-error");
    err.hidden = true; err.textContent = "";
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
    setTimeout(function () { try { document.getElementById("ud-override-uren").focus(); } catch (e) { /* */ } }, 10);
  }
  function closeOverrideModal() {
    var m = document.getElementById("ud-override-modal");
    if (m) { m.setAttribute("hidden", ""); m.setAttribute("aria-hidden", "true"); }
  }
  async function submitOverride(clearOnly) {
    var id = document.getElementById("ud-override-id").value;
    if (!id) return;
    var saveBtn = document.getElementById("ud-override-save");
    var clearBtn = document.getElementById("ud-override-clear");
    var err = document.getElementById("ud-override-error");
    var urenInput = document.getElementById("ud-override-uren");
    var redenInput = document.getElementById("ud-override-reden");
    var newUren = clearOnly ? null : (urenInput.value === "" ? null : parseFloat(String(urenInput.value).replace(",", ".")));
    var newReden = clearOnly ? "" : (redenInput.value || "").trim();
    if (!clearOnly && newUren != null && (!isFinite(newUren) || newUren < 0)) {
      err.hidden = false; err.textContent = "Geef een geldig aantal uren ≥ 0 op.";
      return;
    }
    if (!clearOnly && newUren != null && !newReden) {
      err.hidden = false; err.textContent = "Reden is verplicht bij override.";
      return;
    }
    saveBtn.disabled = true; if (clearBtn) clearBtn.disabled = true;
    var origLbl = saveBtn.textContent; saveBtn.textContent = "Bezig…";
    try {
      await window.urendeclaratiesDB.setOverride(id, newUren, newReden);
      if (window.showActionFeedback) window.showActionFeedback(clearOnly || newUren == null ? "restored" : "saved", "Override");
      else showToast(clearOnly || newUren == null ? "Override weggehaald" : "Override opgeslagen");
      closeOverrideModal();
      renderRows();
      filterRows();
    } catch (e) {
      err.hidden = false; err.textContent = "Opslaan mislukt: " + (e && e.message ? e.message : String(e));
    } finally {
      saveBtn.disabled = false; if (clearBtn) clearBtn.disabled = false;
      saveBtn.textContent = origLbl;
    }
  }

  // Modal-events (een keer wireen)
  (function wireOverrideModalEvents() {
    var m = document.getElementById("ud-override-modal");
    if (!m) return;
    var close = document.getElementById("ud-override-close");
    var cancel = document.getElementById("ud-override-cancel");
    var save = document.getElementById("ud-override-save");
    var clear = document.getElementById("ud-override-clear");
    if (close) close.addEventListener("click", closeOverrideModal);
    if (cancel) cancel.addEventListener("click", closeOverrideModal);
    if (save) save.addEventListener("click", function () { submitOverride(false); });
    if (clear) clear.addEventListener("click", function () { submitOverride(true); });
    m.addEventListener("click", function (e) { if (e.target === m) closeOverrideModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !m.hasAttribute("hidden")) { closeOverrideModal(); }
    });
  })();

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
