/* global window, document, URL, Blob */
/**
 * dsr-flow.js — Fase E.14 — DSR-flow voor client-detail pagina
 *
 * Per user-keuze #28b: per cliënt 'GDPR-export' (Art. 20) + 'Vergeet deze cliënt'
 * (Art. 17 anonymiseren). Alleen zichtbaar voor admin-tier.
 *
 * Server-side functies (zie supabase/migrations/v3_fase_e14_dsr_flow.sql):
 *   - public.export_client_data(client_id) → JSONB bundel
 *   - public.anonymize_client(client_id) → ANON-token + audit-trail
 *
 * UI-elementen in client-detail.html:
 *   - #cd-dsr-section (hidden tot admin-check passes)
 *   - #cd-dsr-export-btn → trigger export
 *   - #cd-dsr-anon-btn → trigger anonymize (slider-confirm)
 */
(function () {
  "use strict";

  function getClientIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  function isAdminTier() {
    if (!window.profilesDB || typeof window.profilesDB.isAdmin !== "function") return false;
    return window.profilesDB.isAdmin();
  }

  function showSection() {
    var section = document.getElementById("cd-dsr-section");
    if (section) section.hidden = false;
  }

  function init() {
    // Reveal section only voor admin-tier
    if (isAdminTier()) {
      showSection();
    } else {
      // Re-check op profile-update (bootstrap async)
      window.addEventListener("besa:profile-updated", function () {
        if (isAdminTier()) showSection();
      });
    }

    var exportBtn = document.getElementById("cd-dsr-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", handleExport);

    var anonBtn = document.getElementById("cd-dsr-anon-btn");
    if (anonBtn) anonBtn.addEventListener("click", handleAnonymize);
  }

  async function handleExport() {
    var clientId = getClientIdFromUrl();
    if (!clientId) {
      if (window.showError) window.showError("Geen cliënt-ID in URL");
      return;
    }
    var btn = document.getElementById("cd-dsr-export-btn");
    btn.disabled = true;
    var originalText = btn.innerHTML;
    btn.innerHTML = "Exporteren…";

    try {
      var res = await window.besaSupabase.rpc("export_client_data", { p_client_id: clientId });
      if (res.error) throw res.error;
      var jsonText = JSON.stringify(res.data, null, 2);
      var blob = new Blob([jsonText], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      var safeName = (res.data && res.data.client && res.data.client.naam ? String(res.data.client.naam).replace(/[^a-zA-Z0-9-]/g, "_") : clientId);
      var a = document.createElement("a");
      a.href = url;
      a.download = "gdpr-export-" + safeName + "-" + dt + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (window.showSaveModal) window.showSaveModal({ title: "GDPR-export voltooid", message: "JSON-bestand gedownload (AVG Art. 20)." });
    } catch (err) {
      console.error("[dsr-flow] export failed:", err);
      if (window.showError) window.showError("GDPR-export mislukt: " + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  async function handleAnonymize() {
    var clientId = getClientIdFromUrl();
    if (!clientId) return;

    // Slider-confirm (huisstijl-conform)
    var ok = false;
    if (typeof window.showSliderConfirmModal === "function") {
      ok = await window.showSliderConfirmModal({
        title: "Vergeet deze cliënt — GDPR Art. 17",
        preview: "Naam, BSN, adres worden geanonymiseerd. Financiële records blijven 7 jaar bewaard. Dit kan NIET ongedaan worden gemaakt.",
        okLabel: "Anonymiseer",
        cancelLabel: "Annuleren",
      });
    } else {
      ok = window.confirm("Vergeet deze cliënt? Naam/BSN/adres worden geanonymiseerd. Niet omkeerbaar.");
    }
    if (!ok) return;

    var btn = document.getElementById("cd-dsr-anon-btn");
    btn.disabled = true;
    var originalText = btn.innerHTML;
    btn.innerHTML = "Anonymiseren…";

    try {
      var res = await window.besaSupabase.rpc("anonymize_client", { p_client_id: clientId });
      if (res.error) throw res.error;
      if (window.showActionFeedback) window.showActionFeedback("deleted", "Cliënt geanonymiseerd");
      // Reload zodat UI nieuwe ANON-token toont
      setTimeout(function () { window.location.reload(); }, 800);
    } catch (err) {
      console.error("[dsr-flow] anonymize failed:", err);
      if (window.showError) window.showError("Anonymiseren mislukt: " + (err.message || err));
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
