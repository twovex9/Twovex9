/**
 * mijn-salarishistorie.js — self-service salarisontwikkeling voor de ingelogde
 * medewerker (G21). Leest eigen rijen uit medewerker_salaris_historie
 * (RLS: is_eigen_medewerker OR office). Read-only; de historie wordt automatisch
 * gevuld door de dossier-trigger (msh_log_salaris_wijziging).
 */
(function () {
  "use strict";

  function supa() { if (!window.ffSupabase) throw new Error("Supabase client niet geladen"); return window.ffSupabase; }
  function tbody() { return document.getElementById("msh-tbody"); }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }
  function fmtDatum(iso) {
    if (!iso) return "—";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? (m[3] + "-" + m[2] + "-" + m[1]) : esc(iso);
  }
  function fmtBruto(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s || !/[1-9]/.test(s)) return "—";
    var n = parseFloat(s.replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (!isFinite(n) || n <= 0) return esc(s);
    return "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function midOf(p) { return p ? (p.medewerkerId || p.medewerker_id || null) : null; }
  function currentMid() {
    try {
      if (window.profilesDB && window.profilesDB.getCurrentSync) { var m = midOf(window.profilesDB.getCurrentSync()); if (m) return m; }
      return midOf(window.ffCurrentProfile);
    } catch (e) { return null; }
  }

  function render(rows) {
    var tb = tbody();
    if (!tb) return;
    if (!rows || !rows.length) {
      tb.innerHTML = '<tr><td colspan="5" class="mu-empty">Er is nog geen salarishistorie vastgelegd in je dossier.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (r) {
      return "<tr><td>" + fmtDatum(r.ingangsdatum) + "</td><td>" + esc(r.schaal || "—") + "</td><td>"
        + esc(r.trede || "—") + "</td><td>" + esc(r.contracturen || "—") + "</td><td>" + fmtBruto(r.bruto_maand) + "</td></tr>";
    }).join("");
  }

  async function load() {
    var tb = tbody();
    if (!tb) return;
    var mid = currentMid();
    if (!mid) {
      tb.innerHTML = '<tr><td colspan="5" class="mu-empty">Je account is nog niet aan een medewerkersdossier gekoppeld.</td></tr>';
      return;
    }
    try {
      var res = await supa().from("medewerker_salaris_historie")
        .select("ingangsdatum,schaal,trede,contracturen,bruto_maand")
        .eq("medewerker_id", String(mid))
        .order("ingangsdatum", { ascending: false })
        .order("aanmaakdatum", { ascending: false });
      if (res.error) throw res.error;
      render(res.data || []);
    } catch (err) {
      console.error("[mijn-salarishistorie] laden mislukt:", err);
      tb.innerHTML = '<tr><td colspan="5" class="mu-empty">Kon de salarishistorie niet laden.</td></tr>';
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Mijn salarishistorie — laden", err);
    }
  }

  function boot() { load(); window.addEventListener("ff:profile-updated", load); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
