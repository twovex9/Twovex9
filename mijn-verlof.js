/**
 * mijn-verlof.js — self-service verlof voor de ingelogde medewerker (G22 + G23).
 * Toont eigen verlofsaldo (medewerker_verlof_overgedragen) + eigen verlofaanvragen,
 * en laat de medewerker een aanvraag indienen (verlofDB.add -> indienen: route naar
 * teamleider, daarna HR). RLS-gescoped client-side op eigen medewerker_id.
 */
(function () {
  "use strict";

  var STATUS_LABEL = {
    concept: "Concept", ingediend: "In behandeling", goedgekeurd: "Goedgekeurd",
    afgewezen: "Afgewezen", geannuleerd: "Geannuleerd",
  };
  var TYPE_LABEL = {
    wettelijk: "Wettelijk", bovenwettelijk: "Bovenwettelijk", ouderschap: "Ouderschap",
    calamiteit: "Calamiteit", doktersbezoek: "Doktersbezoek", onbetaald: "Onbetaald", anders: "Anders",
  };

  function supa() { if (!window.ffSupabase) throw new Error("Supabase client niet geladen"); return window.ffSupabase; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { var t = document.createElement("div"); t.textContent = s == null ? "" : String(s); return t.innerHTML; }
  function fmtDate(d) { if (!d) return "—"; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); return m ? (m[3] + "-" + m[2] + "-" + m[1]) : esc(d); }
  function midOf(p) { return p ? (p.medewerkerId || p.medewerker_id || null) : null; }
  function currentMid() {
    try {
      if (window.profilesDB && window.profilesDB.getCurrentSync) { var m = midOf(window.profilesDB.getCurrentSync()); if (m) return m; }
      return midOf(window.ffCurrentProfile);
    } catch (e) { return null; }
  }
  function fmtNum(n) { if (n == null || isNaN(Number(n))) return "—"; var v = Number(n); return (Math.round(v * 10) / 10).toString().replace(".", ","); }

  async function loadSaldo(mid) {
    try {
      var res = await supa().from("medewerker_verlof_overgedragen")
        .select("wet_beschikbaar,bovenwet_beschikbaar").eq("medewerker_id", mid).maybeSingle();
      var r = res.data || {};
      if ($("mv-saldo-wet")) $("mv-saldo-wet").textContent = r.wet_beschikbaar != null ? fmtNum(r.wet_beschikbaar) : "0";
      if ($("mv-saldo-bovenwet")) $("mv-saldo-bovenwet").textContent = r.bovenwet_beschikbaar != null ? fmtNum(r.bovenwet_beschikbaar) : "0";
    } catch (e) { console.error("[mijn-verlof] saldo:", e); }
  }

  function periode(a) {
    if (a.startDatum && a.eindDatum) return fmtDate(a.startDatum) + " t/m " + fmtDate(a.eindDatum);
    return fmtDate(a.startDatum || a.eindDatum);
  }

  function renderAanvragen(rows) {
    var tb = $("mv-tbody");
    if (!tb) return;
    if (!rows || !rows.length) { tb.innerHTML = '<tr><td colspan="4" class="mu-empty">Je hebt nog geen verlofaanvragen.</td></tr>'; return; }
    tb.innerHTML = rows.map(function (a) {
      return "<tr><td>" + esc(TYPE_LABEL[a.type] || a.type) + "</td><td>" + periode(a) + "</td><td>"
        + esc(a.aantalDagen != null ? fmtNum(a.aantalDagen) : "—") + "</td><td>" + esc(STATUS_LABEL[a.status] || a.status) + "</td></tr>";
    }).join("");
  }

  async function loadAanvragen(mid) {
    try {
      if (window.verlofDB && window.verlofDB.ready) {
        await window.verlofDB.ready;
        var list = window.verlofDB.getForMedewerkerSync ? window.verlofDB.getForMedewerkerSync(mid) : [];
        renderAanvragen(list);
        return;
      }
      // fallback: directe query
      var res = await supa().from("verlof_aanvragen").select("*").eq("medewerker_id", mid).order("start_datum", { ascending: false });
      renderAanvragen((res.data || []).map(function (r) {
        return { type: r.type, startDatum: r.start_datum, eindDatum: r.eind_datum, aantalDagen: r.aantal_dagen, status: r.status };
      }));
    } catch (e) {
      console.error("[mijn-verlof] aanvragen:", e);
      if ($("mv-tbody")) $("mv-tbody").innerHTML = '<tr><td colspan="4" class="mu-empty">Kon de aanvragen niet laden.</td></tr>';
    }
  }

  function diffDagen(van, tot) {
    try {
      var a = new Date(van + "T00:00:00"), b = new Date(tot + "T00:00:00");
      if (isNaN(a) || isNaN(b) || b < a) return null;
      return Math.round((b - a) / 86400000) + 1;
    } catch (e) { return null; }
  }

  async function submit(mid) {
    var errEl = $("mv-err");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    var type = $("mv-type") ? $("mv-type").value : "wettelijk";
    var van = $("mv-van") ? $("mv-van").value : "";
    var tot = $("mv-tot") ? $("mv-tot").value : "";
    var dagenRaw = $("mv-dagen") ? String($("mv-dagen").value).trim() : "";
    var reden = $("mv-reden") ? $("mv-reden").value : "";
    if (!van || !tot) { if (errEl) { errEl.textContent = "Vul een begin- en einddatum in."; errEl.hidden = false; } return; }
    if (new Date(tot) < new Date(van)) { if (errEl) { errEl.textContent = "De einddatum ligt vóór de begindatum."; errEl.hidden = false; } return; }
    var dagen = dagenRaw !== "" ? Number(dagenRaw) : diffDagen(van, tot);
    if (!dagen || dagen <= 0) { if (errEl) { errEl.textContent = "Vul een geldig aantal dagen in."; errEl.hidden = false; } return; }
    var btn = $("mv-submit");
    if (btn) { btn.disabled = true; btn.textContent = "Indienen…"; }
    try {
      if (!window.verlofDB) throw new Error("Verlofmodule niet geladen");
      var obj = await window.verlofDB.add({ medewerkerId: mid, type: type, startDatum: van, eindDatum: tot, aantalDagen: dagen, beschrijving: reden, status: "concept" });
      await window.verlofDB.indienen(obj.id);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Verlofaanvraag");
      // reset + verberg form
      if ($("mv-van")) $("mv-van").value = ""; if ($("mv-tot")) $("mv-tot").value = "";
      if ($("mv-dagen")) $("mv-dagen").value = ""; if ($("mv-reden")) $("mv-reden").value = "";
      if ($("mv-form")) $("mv-form").hidden = true;
      await loadAanvragen(mid);
    } catch (err) {
      console.error("[mijn-verlof] indienen mislukt:", err);
      if (errEl) { errEl.textContent = "Indienen mislukt: " + (err && err.message ? err.message : "onbekende fout"); errEl.hidden = false; }
      if (window.ffReportSyncFailure) window.ffReportSyncFailure("Mijn verlof — indienen", err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Aanvraag indienen"; }
    }
  }

  // G25 — vul de type-select met de beheerbare verloftypes (actief, op volgorde).
  // De hardcoded opties in de HTML blijven de fallback als de tabel leeg/onbereikbaar is.
  function fillTypes() {
    var sel = $("mv-type");
    if (!sel || !window.verloftypesDB || !window.verloftypesDB.getActiveSync) return;
    var actief = window.verloftypesDB.getActiveSync();
    if (!actief || !actief.length) return;
    var huidige = sel.value;
    sel.innerHTML = actief.map(function (t) {
      return '<option value="' + esc(t.code) + '">' + esc(t.label) + "</option>";
    }).join("");
    if (huidige && actief.some(function (t) { return t.code === huidige; })) sel.value = huidige;
  }

  function wire(mid) {
    if ($("mv-add-btn")) $("mv-add-btn").addEventListener("click", function () { if ($("mv-form")) $("mv-form").hidden = !$("mv-form").hidden; });
    fillTypes();
    window.addEventListener("ff:verloftypes-updated", fillTypes);
    if ($("mv-cancel")) $("mv-cancel").addEventListener("click", function () { if ($("mv-form")) $("mv-form").hidden = true; });
    if ($("mv-submit")) $("mv-submit").addEventListener("click", function () { submit(mid); });
    window.addEventListener("ff:verlof-updated", function () { loadAanvragen(mid); });
  }

  async function start() {
    if (!$("mv-tbody")) return;
    var mid = currentMid();
    if (!mid) {
      if ($("mv-tbody")) $("mv-tbody").innerHTML = '<tr><td colspan="4" class="mu-empty">Je account is nog niet aan een medewerkersdossier gekoppeld. Neem contact op met HR.</td></tr>';
      if ($("mv-add-btn")) $("mv-add-btn").disabled = true;
      return;
    }
    wire(mid);
    await Promise.all([loadSaldo(mid), loadAanvragen(mid)]);
  }

  function boot() { start(); window.addEventListener("ff:profile-updated", start); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
