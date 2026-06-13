/**
 * mijn-jaaropgaven.js — self-service jaaropgaven voor de ingelogde medewerker (G20).
 * Eigen jaaropgaven (RLS: is_eigen_medewerker OR is_hr), download via signed URL uit
 * de private bucket "jaaropgaven". Read-only; HR uploadt.
 */
(function () {
  "use strict";

  function supa() { if (!window.ffSupabase) throw new Error("Supabase client niet geladen"); return window.ffSupabase; }
  function tbody() { return document.getElementById("mjo-tbody"); }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }
  function fmtDatum(iso) {
    if (!iso) return "—";
    try { var d = new Date(iso); if (isNaN(d.getTime())) return "—";
      return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
    } catch (e) { return "—"; }
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
    if (!rows || !rows.length) { tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Er staan nog geen jaaropgaven voor je klaar.</td></tr>'; return; }
    tb.innerHTML = rows.map(function (r) {
      return "<tr><td>" + esc(r.jaar) + "</td><td>" + esc(r.bestandsnaam || ("Jaaropgave " + r.jaar + ".pdf")) + "</td><td>"
        + fmtDatum(r.geupload_op) + '</td><td><button type="button" class="btn-outline mjo-view" data-path="' + esc(r.bestandspad) + '">Bekijken</button></td></tr>';
    }).join("");
  }

  async function openItem(path, btn) {
    if (!path) return;
    var old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Openen…"; }
    try {
      var res = await supa().storage.from("jaaropgaven").createSignedUrl(path, 3600);
      if (res.error) throw res.error;
      var url = res.data && res.data.signedUrl;
      if (url) window.open(url, "_blank", "noopener"); else throw new Error("Geen download-URL");
    } catch (err) {
      console.error("[mijn-jaaropgaven] openen mislukt:", err);
      if (window.showError) window.showError("Jaaropgave openen mislukt: " + (err && err.message ? err.message : "fout"));
    } finally { if (btn) { btn.disabled = false; btn.textContent = old || "Bekijken"; } }
  }

  async function load() {
    var tb = tbody();
    if (!tb) return;
    var mid = currentMid();
    if (!mid) { tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Je account is nog niet aan een medewerkersdossier gekoppeld.</td></tr>'; return; }
    try {
      var res = await supa().from("jaaropgaven")
        .select("id,medewerker_id,jaar,bestandspad,bestandsnaam,geupload_op,archived")
        .eq("medewerker_id", mid).order("jaar", { ascending: false });
      if (res.error) throw res.error;
      render((res.data || []).filter(function (r) { return !r.archived; }));
    } catch (err) {
      console.error("[mijn-jaaropgaven] laden mislukt:", err);
      tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Kon de jaaropgaven niet laden.</td></tr>';
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Mijn jaaropgaven — laden", err);
    }
  }

  function wire() {
    var tb = tbody();
    if (tb) tb.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".mjo-view");
      if (b) openItem(b.getAttribute("data-path"), b);
    });
    window.addEventListener("ff:profile-updated", load);
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
