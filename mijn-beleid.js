/**
 * mijn-beleid.js — verplichte beleidskennisname voor de ingelogde medewerker (G26).
 * Toont de 9 vaste beleidsdocumenten (Onboarding Fase 3) + laat de medewerker per
 * document "gelezen & akkoord" geven; legt dit met datum vast in beleid_kennisname.
 * RLS-gescoped: medewerker beheert eigen kennisname.
 */
(function () {
  "use strict";

  // De 9 vaste verplichte beleidsdocumenten (spec §9 Fase 3).
  var DOCS = [
    { slug: "meldcode", titel: "Meldcode Huiselijk Geweld" },
    { slug: "gedragscode", titel: "Gedragscode" },
    { slug: "privacybeleid", titel: "Privacybeleid" },
    { slug: "medicatiebeleid", titel: "Medicatiebeleid" },
    { slug: "incidentenprotocol", titel: "Incidentenprotocol" },
    { slug: "klachtenregeling", titel: "Klachtenregeling" },
    { slug: "veiligheidsbeleid", titel: "Veiligheidsbeleid" },
    { slug: "verzuimbeleid", titel: "Verzuimbeleid" },
    { slug: "personeelshandboek", titel: "Personeelshandboek" },
  ];

  function supa() { if (!window.ffSupabase) throw new Error("Supabase client niet geladen"); return window.ffSupabase; }
  function tbody() { return document.getElementById("mb-tbody"); }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }
  function fmtDatum(iso) {
    if (!iso) return "";
    try { var d = new Date(iso); if (isNaN(d.getTime())) return ""; return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear(); } catch (e) { return ""; }
  }
  function midOf(p) { return p ? (p.medewerkerId || p.medewerker_id || null) : null; }
  function currentMid() {
    try { if (window.profilesDB && window.profilesDB.getCurrentSync) { var m = midOf(window.profilesDB.getCurrentSync()); if (m) return m; } return midOf(window.ffCurrentProfile); } catch (e) { return null; }
  }

  var byslug = {};

  function render() {
    var tb = tbody();
    if (!tb) return;
    tb.innerHTML = DOCS.map(function (d) {
      var k = byslug[d.slug];
      var done = k && k.ondertekend;
      var statusHtml = done
        ? '<span class="cd-badge cd-badge--ok">Gelezen &amp; akkoord' + (k.ondertekend_op ? " — " + esc(fmtDatum(k.ondertekend_op)) : "") + "</span>"
        : '<span class="cd-badge cd-badge--warn">Nog niet</span>';
      var actie = done ? "" : '<button type="button" class="btn-primary mb-akkoord" data-slug="' + esc(d.slug) + '" data-titel="' + esc(d.titel) + '">Gelezen &amp; akkoord</button>';
      return "<tr><td>" + esc(d.titel) + "</td><td>" + statusHtml + "</td><td>" + actie + "</td></tr>";
    }).join("");
  }

  async function load(mid) {
    try {
      var res = await supa().from("beleid_kennisname").select("beleid_slug,gelezen,ondertekend,ondertekend_op").eq("medewerker_id", mid);
      if (res.error) throw res.error;
      byslug = {};
      (res.data || []).forEach(function (r) { byslug[r.beleid_slug] = r; });
      render();
    } catch (err) {
      console.error("[mijn-beleid] laden mislukt:", err);
      if (tbody()) tbody().innerHTML = '<tr><td colspan="3" class="mu-empty">Kon het beleid niet laden.</td></tr>';
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Mijn beleid — laden", err);
    }
  }

  async function akkoord(mid, slug, titel, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Vastleggen…"; }
    try {
      var now = new Date().toISOString();
      var res = await supa().from("beleid_kennisname").upsert({
        medewerker_id: mid, beleid_slug: slug, titel: titel,
        gelezen: true, gelezen_op: now, ondertekend: true, ondertekend_op: now,
      }, { onConflict: "medewerker_id,beleid_slug" }).select().single();
      if (res.error) throw res.error;
      byslug[slug] = res.data;
      if (window.showActionFeedback) window.showActionFeedback("saved", "Beleid akkoord");
      render();
    } catch (err) {
      console.error("[mijn-beleid] akkoord mislukt:", err);
      if (window.showError) window.showError("Akkoord vastleggen mislukt: " + (err && err.message ? err.message : "fout"));
      if (btn) { btn.disabled = false; btn.textContent = "Gelezen & akkoord"; }
    }
  }

  async function start() {
    if (!tbody()) return;
    var mid = currentMid();
    if (!mid) { tbody().innerHTML = '<tr><td colspan="3" class="mu-empty">Je account is nog niet aan een medewerkersdossier gekoppeld.</td></tr>'; return; }
    tbody().addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".mb-akkoord");
      if (b) akkoord(mid, b.getAttribute("data-slug"), b.getAttribute("data-titel"), b);
    });
    await load(mid);
  }
  function boot() { start(); window.addEventListener("ff:profile-updated", start); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
