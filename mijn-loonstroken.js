/**
 * mijn-loonstroken.js — self-service loonstroken-view voor de ingelogde medewerker
 * (spec §8 Medewerkersportaal — Mijn Salaris). G19.
 * Toont de eigen loonstroken (RLS: is_eigen_medewerker OR is_hr) met download via
 * signed URL uit de private bucket "loonstroken". Read-only; HR uploadt.
 */
(function () {
  "use strict";

  var MAANDEN = ["", "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"];

  function supa() {
    if (!window.besaSupabase) throw new Error("Supabase client niet geladen");
    return window.besaSupabase;
  }
  function tbody() { return document.getElementById("mls-tbody"); }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }
  function fmtDatum(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
    } catch (e) { return "—"; }
  }
  function periode(r) {
    var mnd = (r.maand >= 1 && r.maand <= 12) ? MAANDEN[r.maand] : ("maand " + r.maand);
    return (mnd.charAt(0).toUpperCase() + mnd.slice(1)) + " " + r.jaar;
  }

  function midOf(p) {
    // profilesDB normaliseert naar camelCase medewerkerId; val terug op snake_case.
    return p ? (p.medewerkerId || p.medewerker_id || null) : null;
  }
  function currentMedewerkerId() {
    try {
      if (window.profilesDB && typeof window.profilesDB.getCurrentSync === "function") {
        var mid = midOf(window.profilesDB.getCurrentSync());
        if (mid) return mid;
      }
      return midOf(window.besaCurrentProfile);
    } catch (e) { return null; }
  }

  function render(rows) {
    var tb = tbody();
    if (!tb) return;
    if (!rows || !rows.length) {
      tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Er staan nog geen loonstroken voor je klaar.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (r) {
      return "<tr>"
        + "<td>" + esc(periode(r)) + "</td>"
        + "<td>" + esc(r.bestandsnaam || "loonstrook.pdf") + "</td>"
        + "<td>" + fmtDatum(r.geupload_op) + "</td>"
        + '<td><button type="button" class="btn-outline mls-view" data-path="' + esc(r.bestandspad) + '">Bekijken</button></td>'
        + "</tr>";
    }).join("");
  }

  async function openLoonstrook(path, btn) {
    if (!path) return;
    var oldText = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Openen…"; }
    try {
      var res = await supa().storage.from("loonstroken").createSignedUrl(path, 3600);
      if (res.error) throw res.error;
      var url = res.data && res.data.signedUrl;
      if (url) window.open(url, "_blank", "noopener");
      else throw new Error("Geen download-URL ontvangen");
    } catch (err) {
      console.error("[mijn-loonstroken] openen mislukt:", err);
      if (window.showError) window.showError("Loonstrook openen mislukt: " + (err && err.message ? err.message : "onbekende fout"));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText || "Bekijken"; }
    }
  }

  async function load() {
    var tb = tbody();
    if (!tb) return;
    var mid = currentMedewerkerId();
    if (!mid) {
      tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Je account is nog niet aan een medewerkersdossier gekoppeld. Neem contact op met HR.</td></tr>';
      return;
    }
    try {
      var res = await supa()
        .from("loonstroken")
        .select("id,medewerker_id,jaar,maand,bestandspad,bestandsnaam,geupload_op,archived")
        .eq("medewerker_id", mid)
        .order("jaar", { ascending: false })
        .order("maand", { ascending: false });
      if (res.error) throw res.error;
      render((res.data || []).filter(function (r) { return !r.archived; }));
    } catch (err) {
      console.error("[mijn-loonstroken] laden mislukt:", err);
      tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Kon de loonstroken niet laden.</td></tr>';
      if (window.besaReportSyncFailure) window.besaReportSyncFailure("Mijn loonstroken — laden", err);
    }
  }

  function wire() {
    var tb = tbody();
    if (tb) {
      tb.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".mls-view");
        if (btn) openLoonstrook(btn.getAttribute("data-path"), btn);
      });
    }
    // Profiel kan asynchroon laden → herlaad zodra het profiel binnen is.
    window.addEventListener("besa:profile-updated", function () { load(); });
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
