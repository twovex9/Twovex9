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
        '<td class="sal-hist-cell-datetime">' +
        '<span class="sal-hist-date">' +
        escapeHtml(dt.dateStr) +
        "</span>" +
        '<span class="sal-hist-time">' +
        escapeHtml(dt.timeStr) +
        "</span></td>" +
        '<td class="sal-hist-cell-actie">' +
        escapeHtml(actie) +
        "</td>" +
        '<td class="sal-hist-cell-detail">' +
        escapeHtml(detail) +
        "</td>";
      tbody.appendChild(tr);
    });
  }

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
