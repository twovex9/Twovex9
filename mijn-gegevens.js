/* global window, document, Blob, URL */
/**
 * mijn-gegevens.js — DSR (Data Subject Request) flow.
 * Sprint 14 / v2 master-plan S14 — GDPR Art. 15 (recht op inzage).
 *
 * Toont eigen profile + medewerker-data + counts voor gerelateerde tabellen.
 * Download-knop exporteert volledige JSON via Supabase function gdpr_my_data_export().
 */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function fetchMyData() {
    if (!window.besaSupabase) throw new Error("Supabase niet geladen");
    const res = await window.besaSupabase.rpc("gdpr_my_data_export");
    if (res.error) throw res.error;
    return res.data;
  }

  function renderSummary(data) {
    const grid = document.getElementById("mijn-gegevens-grid");
    if (!grid) return;
    if (!data) {
      grid.innerHTML = '<div class="mijn-gegevens-loading">Geen gegevens beschikbaar.</div>';
      return;
    }
    if (data.error) {
      grid.innerHTML = '<div class="mijn-gegevens-loading">' + escapeHtml(data.error) + '</div>';
      return;
    }
    const profile = data.profile || {};
    const med = data.medewerker || {};
    const fields = [
      { label: "Naam", value: ((profile.voornaam || "") + " " + (profile.achternaam || med.achternaam || "")).trim() || "—" },
      { label: "E-mail", value: profile.email || med.email || "—" },
      { label: "Rollen", value: (Array.isArray(data.rollen) && data.rollen.length) ? data.rollen.join(", ") : (profile.rol || "—") },
      { label: "Medewerker-ID", value: profile.medewerker_id || "(geen koppeling)" },
      { label: "Functie", value: med.functie || "—" },
      { label: "Fase", value: med.fase || "—" },
      { label: "Dienstverband", value: med.dienstverband || "—" },
      { label: "Notities (HR)", value: data.medewerker_notities_count || 0 },
      { label: "Documenten", value: data.medewerker_documenten_count || 0 },
      { label: "Verzuim-perioden", value: data.verzuim_count || 0 },
      { label: "Planning-shifts", value: data.planning_count || 0 },
      { label: "Geëxporteerd op", value: data.exported_at ? new Date(data.exported_at).toLocaleString("nl-NL") : "—" },
    ];
    grid.innerHTML = fields.map(f =>
      '<div class="mijn-gegevens-card">' +
      '  <div class="mijn-gegevens-label">' + escapeHtml(f.label) + '</div>' +
      '  <div class="mijn-gegevens-value">' + escapeHtml(String(f.value)) + '</div>' +
      '</div>'
    ).join("");
  }

  async function refresh() {
    const grid = document.getElementById("mijn-gegevens-grid");
    if (grid) grid.innerHTML = '<div class="mijn-gegevens-loading">Gegevens laden…</div>';
    try {
      const data = await fetchMyData();
      window.__myData = data;
      renderSummary(data);
    } catch (err) {
      if (grid) grid.innerHTML = '<div class="mijn-gegevens-loading" style="color:var(--red)">Fout bij laden: ' + escapeHtml(err.message || String(err)) + '</div>';
    }
  }

  async function downloadData() {
    try {
      const data = window.__myData || await fetchMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = "mijn-gegevens-" + new Date().toISOString().slice(0, 10) + ".json";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) { /* */ }
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 100);
      if (window.showActionFeedback) {
        window.showActionFeedback("exported", filename);
      }
    } catch (err) {
      if (window.showError) window.showError("Download mislukt: " + (err.message || String(err)));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    refresh();
    document.getElementById("mijn-gegevens-download-btn")?.addEventListener("click", downloadData);
    document.getElementById("mijn-gegevens-refresh-btn")?.addEventListener("click", refresh);
  });
})();
