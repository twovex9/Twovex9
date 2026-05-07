/* Wijzigingsgeschiedenis Salarishuis — leest localStorage via salarishuis-data.js */
(function () {
  "use strict";

  var tbody = document.getElementById("sal-hist-tbody");
  var emptyEl = document.getElementById("sal-hist-empty");
  var card = document.querySelector(".sal-hist-card");
  if (!tbody || typeof getSalarishuisWijzigingen !== "function") return;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNlDateTime(ts) {
    var d = new Date(ts);
    if (!isFinite(d.getTime())) return "—";
    try {
      var dateStr = d.toLocaleDateString("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
      var timeStr = d.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      return { dateStr: dateStr, timeStr: timeStr };
    } catch (e) {
      return { dateStr: d.toISOString().slice(0, 10), timeStr: d.toISOString().slice(11, 19) };
    }
  }

  function render() {
    var list = getSalarishuisWijzigingen();
    tbody.innerHTML = "";
    if (!list.length) {
      if (card) card.classList.add("sal-hist-card--empty");
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (card) card.classList.remove("sal-hist-card--empty");
    if (emptyEl) emptyEl.hidden = true;
    list.forEach(function (entry) {
      var ts = entry && entry.ts != null ? entry.ts : 0;
      var actie = entry && entry.actie != null ? entry.actie : "";
      var detail = entry && entry.detail != null ? entry.detail : "";
      var dt = formatNlDateTime(ts);
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="sal-hist-cell-datetime" data-col="datetime">' +
        '<span class="sal-hist-date">' +
        escapeHtml(dt.dateStr) +
        "</span>" +
        '<span class="sal-hist-time">' +
        escapeHtml(dt.timeStr) +
        "</span></td>" +
        '<td class="sal-hist-cell-actie" data-col="actie">' +
        escapeHtml(actie) +
        "</td>" +
        '<td class="sal-hist-cell-detail" data-col="detail">' +
        escapeHtml(detail) +
        "</td>";
      tbody.appendChild(tr);
    });
    applyShColumnVisibility();
  }

  // ----- Kolommen-knop -----
  var SH_COLUMN_CONFIG = [
    { id: "datetime", label: "Datum & tijd", defaultOn: true },
    { id: "actie", label: "Gebeurtenis", defaultOn: true },
    { id: "detail", label: "Details", defaultOn: true },
  ];
  function setShColumnVisible(colId, visible) {
    document.querySelectorAll('.sal-hist-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyShColumnVisibility() {
    document.querySelectorAll("#sh-columns-list .column-toggle").forEach(function (btn) {
      var colId = btn.getAttribute("data-col");
      var isOn = btn.getAttribute("aria-checked") === "true";
      setShColumnVisible(colId, isOn);
    });
  }
  function buildShColumnsPanel() {
    var list = document.getElementById("sh-columns-list");
    if (!list) return;
    list.innerHTML = "";
    SH_COLUMN_CONFIG.forEach(function (c) {
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
  function wireShColumnsPanel() {
    var colBtn = document.getElementById("sh-columns-menu-btn");
    var colPanel = document.getElementById("sh-columns-panel");
    var colList = document.getElementById("sh-columns-list");
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
        applyShColumnVisibility();
      });
    }
    document.addEventListener("click", function () {
      if (colPanel) {
        colPanel.setAttribute("hidden", "");
        if (colBtn) colBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  buildShColumnsPanel();
  wireShColumnsPanel();
  render();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") render();
  });

  window.addEventListener("storage", function (e) {
    if (e.key === "hr_salarishuis_wijzigingen_v1") render();
  });

  // Re-render zodra de Supabase-bootstrap of een log-actie de cache ververst.
  window.addEventListener("besa:salarishuis-updated", render);
})();
