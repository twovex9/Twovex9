/* global window, document */
/**
 * loonstroken.js — salarisadministratie/HR uploadt loonstrook-PDF's per
 * loondienstmedewerker per maand. De medewerker bekijkt ze in de mobiele app.
 *
 * Opslag: private bucket "loonstroken", pad <medewerker_id>/<jaar>-<mm>.pdf.
 * Metadata: tabel public.loonstroken (RLS: is_hr() schrijft, eigen medewerker leest).
 * Verwijderen = soft-delete (archived=true) — conform de DIEHARD-regel dat we
 * persoonsdata nooit hard wissen.
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function supa() { return window.ffSupabase; }

  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  function maandLabel(j, m) { return MAANDEN[(m - 1 + 12) % 12] + " " + j; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var mwNaam = {}; // medewerker_id -> "Voornaam Achternaam"

  function msg(text, ok) {
    var el = $("ls-msg");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.color = ok ? "#16a34a" : "#dc2626";
    el.style.fontWeight = "600";
    el.style.marginTop = "10px";
  }

  async function laadMedewerkers() {
    var sel = $("ls-mw");
    if (!sel) return;
    var res = await supa()
      .from("medewerkers")
      .select("id,voornaam,achternaam,personeelsnummer")
      .eq("archived", false)
      .eq("dienstverband", "Loondienst")
      .order("achternaam", { ascending: true });
    if (res.error) { console.warn("[loonstroken] medewerkers:", res.error); return; }
    var rows = res.data || [];
    sel.innerHTML = '<option value="" disabled selected hidden>Kies medewerker</option>';
    rows.forEach(function (r) {
      var naam = ((r.voornaam || "") + " " + (r.achternaam || "")).trim() || "Onbekend";
      mwNaam[r.id] = naam;
      var o = document.createElement("option");
      o.value = r.id;
      o.textContent = naam + (r.personeelsnummer ? " (#" + r.personeelsnummer + ")" : "");
      sel.appendChild(o);
    });
  }

  function vulPerioden() {
    var jaarSel = $("ls-jaar");
    var maandSel = $("ls-maand");
    if (!jaarSel || !maandSel) return;
    var nu = new Date();
    var jaar = nu.getFullYear();
    for (var y = jaar + 1; y >= jaar - 3; y -= 1) {
      var o = document.createElement("option");
      o.value = y; o.textContent = y;
      if (y === jaar) o.selected = true;
      jaarSel.appendChild(o);
    }
    for (var m = 1; m <= 12; m += 1) {
      var o2 = document.createElement("option");
      o2.value = m; o2.textContent = cap(MAANDEN[m - 1]);
      maandSel.appendChild(o2);
    }
    // Default = vorige volledige maand.
    var pm = nu.getMonth(); // 0-based huidige = 1-based vorige
    maandSel.value = String(pm === 0 ? 12 : pm);
  }

  async function laadLijst() {
    var tb = $("ls-tbody");
    if (!tb) return;
    var res = await supa()
      .from("loonstroken")
      .select("id,medewerker_id,jaar,maand,bestandspad,bestandsnaam,geupload_op")
      .eq("archived", false)
      .order("jaar", { ascending: false })
      .order("maand", { ascending: false })
      .limit(1000);
    if (res.error) { tb.innerHTML = '<tr><td colspan="5">Laden mislukt.</td></tr>'; return; }
    var rows = res.data || [];
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="5">Nog geen loonstroken geüpload.</td></tr>'; return; }
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var dt = r.geupload_op ? new Date(r.geupload_op).toLocaleDateString("nl-NL") : "";
      var tdNaam = document.createElement("td");
      tdNaam.textContent = mwNaam[r.medewerker_id] || "(onbekend)";
      var tdPer = document.createElement("td");
      tdPer.textContent = maandLabel(r.jaar, r.maand);
      var tdBestand = document.createElement("td");
      var bekijk = document.createElement("button");
      bekijk.type = "button";
      bekijk.className = "btn-outline";
      bekijk.textContent = "Bekijken";
      bekijk.addEventListener("click", async function () {
        var s = await supa().storage.from("loonstroken").createSignedUrl(r.bestandspad, 3600);
        if (s.data && s.data.signedUrl) window.open(s.data.signedUrl, "_blank", "noopener");
        else alert("Kon het bestand niet openen.");
      });
      tdBestand.appendChild(bekijk);
      var tdUp = document.createElement("td");
      tdUp.textContent = dt;
      var tdAct = document.createElement("td");
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn-outline";
      del.textContent = "Verwijderen";
      del.addEventListener("click", async function () {
        if (!window.confirm("Deze loonstrook verwijderen? De medewerker ziet 'm dan niet meer.")) return;
        var up = await supa().from("loonstroken").update({ archived: true }).eq("id", r.id);
        if (up.error) { alert("Verwijderen mislukt."); return; }
        laadLijst();
      });
      tdAct.appendChild(del);
      tr.appendChild(tdNaam);
      tr.appendChild(tdPer);
      tr.appendChild(tdBestand);
      tr.appendChild(tdUp);
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    });
  }

  async function upload() {
    var mw = $("ls-mw").value;
    var jaar = parseInt($("ls-jaar").value, 10);
    var maand = parseInt($("ls-maand").value, 10);
    var file = $("ls-file").files[0];
    if (!mw) { msg("Kies eerst een medewerker.", false); return; }
    if (!file) { msg("Kies een PDF-bestand.", false); return; }
    if (file.type && file.type !== "application/pdf") { msg("Alleen PDF-bestanden zijn toegestaan.", false); return; }
    var btn = $("ls-upload-btn");
    btn.disabled = true;
    msg("Bezig met uploaden…", true);
    try {
      var path = mw + "/" + jaar + "-" + String(maand).padStart(2, "0") + ".pdf";
      var up = await supa().storage.from("loonstroken").upload(path, file, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up.error) throw up.error;
      var uid = null;
      try { var u = await supa().auth.getUser(); uid = u.data && u.data.user ? u.data.user.id : null; } catch (e) { /* */ }
      var ins = await supa().from("loonstroken").upsert(
        {
          medewerker_id: mw,
          jaar: jaar,
          maand: maand,
          bestandspad: path,
          bestandsnaam: file.name,
          mime_type: "application/pdf",
          grootte_bytes: file.size,
          geupload_door: uid,
          archived: false,
        },
        { onConflict: "medewerker_id,jaar,maand" }
      );
      if (ins.error) throw ins.error;
      msg("Loonstrook geüpload voor " + (mwNaam[mw] || "medewerker") + " — " + maandLabel(jaar, maand) + ".", true);
      $("ls-file").value = "";
      laadLijst();
    } catch (e) {
      console.error("[loonstroken] upload:", e);
      msg("Uploaden mislukt: " + (e && e.message ? e.message : e), false);
    } finally {
      btn.disabled = false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // G20 — Jaaropgaven (zelfde flow: private bucket "jaaropgaven",
  // pad <medewerker_id>/<jaar>.pdf, upsert op (medewerker_id, jaar)).
  // ────────────────────────────────────────────────────────────────────────
  function joMsg(text, ok) {
    var el = $("jo-msg");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.color = ok ? "var(--green)" : "var(--red)";
    el.style.fontWeight = "600";
    el.style.marginTop = "10px";
  }

  function vulJoVelden() {
    var mwSel = $("jo-mw"), jaarSel = $("jo-jaar");
    if (!mwSel || !jaarSel) return;
    // medewerkers hergebruiken uit de loonstroken-select (zelfde doelgroep)
    mwSel.innerHTML = '<option value="" disabled selected hidden>Kies medewerker</option>';
    Object.keys(mwNaam).forEach(function (id) {
      var o = document.createElement("option");
      o.value = id; o.textContent = mwNaam[id];
      mwSel.appendChild(o);
    });
    var nu = new Date();
    jaarSel.innerHTML = "";
    for (var y = nu.getFullYear(); y >= nu.getFullYear() - 5; y -= 1) {
      var o2 = document.createElement("option");
      o2.value = y; o2.textContent = y;
      if (y === nu.getFullYear() - 1) o2.selected = true; // default: vorig jaar
      jaarSel.appendChild(o2);
    }
  }

  async function laadJoLijst() {
    var tb = $("jo-tbody");
    if (!tb) return;
    var res = await supa()
      .from("jaaropgaven")
      .select("id,medewerker_id,jaar,bestandspad,bestandsnaam,geupload_op")
      .eq("archived", false)
      .order("jaar", { ascending: false })
      .limit(1000);
    if (res.error) { tb.innerHTML = '<tr><td colspan="5">Laden mislukt.</td></tr>'; return; }
    var rows = res.data || [];
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="5">Nog geen jaaropgaven geüpload.</td></tr>'; return; }
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var dt = r.geupload_op ? new Date(r.geupload_op).toLocaleDateString("nl-NL") : "";
      var tdNaam = document.createElement("td");
      tdNaam.textContent = mwNaam[r.medewerker_id] || "(onbekend)";
      var tdJaar = document.createElement("td");
      tdJaar.textContent = r.jaar;
      var tdBestand = document.createElement("td");
      var bekijk = document.createElement("button");
      bekijk.type = "button";
      bekijk.className = "btn-outline";
      bekijk.textContent = "Bekijken";
      bekijk.addEventListener("click", async function () {
        var s = await supa().storage.from("jaaropgaven").createSignedUrl(r.bestandspad, 3600);
        if (s.data && s.data.signedUrl) window.open(s.data.signedUrl, "_blank", "noopener");
        else if (window.showError) window.showError("Kon het bestand niet openen.");
      });
      tdBestand.appendChild(bekijk);
      var tdUp = document.createElement("td");
      tdUp.textContent = dt;
      var tdAct = document.createElement("td");
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn-outline";
      del.textContent = "Verwijderen";
      del.addEventListener("click", async function () {
        var ok = true;
        if (typeof window.showSliderConfirmModal === "function") {
          ok = await window.showSliderConfirmModal({
            title: "Bent u zeker dat dit verwijderd wordt?",
            preview: "Jaaropgave " + r.jaar + " — " + (mwNaam[r.medewerker_id] || ""),
            okLabel: "Verwijderen", cancelLabel: "Annuleren",
          });
        }
        if (!ok) return;
        var up = await supa().from("jaaropgaven").update({ archived: true }).eq("id", r.id);
        if (up.error) { if (window.showError) window.showError("Verwijderen mislukt."); return; }
        if (window.showActionFeedback) window.showActionFeedback("deleted", "Jaaropgave");
        laadJoLijst();
      });
      tdAct.appendChild(del);
      tr.appendChild(tdNaam);
      tr.appendChild(tdJaar);
      tr.appendChild(tdBestand);
      tr.appendChild(tdUp);
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    });
  }

  async function joUpload() {
    var mw = $("jo-mw").value;
    var jaar = parseInt($("jo-jaar").value, 10);
    var file = $("jo-file").files[0];
    if (!mw) { joMsg("Kies eerst een medewerker.", false); return; }
    if (!file) { joMsg("Kies een PDF-bestand.", false); return; }
    if (file.type && file.type !== "application/pdf") { joMsg("Alleen PDF-bestanden zijn toegestaan.", false); return; }
    var btn = $("jo-upload-btn");
    btn.disabled = true;
    joMsg("Bezig met uploaden…", true);
    try {
      var path = mw + "/" + jaar + ".pdf";
      var up = await supa().storage.from("jaaropgaven").upload(path, file, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (up.error) throw up.error;
      var uid = null;
      try { var u = await supa().auth.getUser(); uid = u.data && u.data.user ? u.data.user.id : null; } catch (e) { /* */ }
      var ins = await supa().from("jaaropgaven").upsert(
        {
          medewerker_id: mw,
          jaar: jaar,
          bestandspad: path,
          bestandsnaam: file.name,
          mime_type: "application/pdf",
          grootte_bytes: file.size,
          geupload_door: uid,
          archived: false,
        },
        { onConflict: "medewerker_id,jaar" }
      );
      if (ins.error) throw ins.error;
      joMsg("Jaaropgave " + jaar + " geüpload voor " + (mwNaam[mw] || "medewerker") + ".", true);
      $("jo-file").value = "";
      laadJoLijst();
    } catch (e) {
      console.error("[jaaropgaven] upload:", e);
      joMsg("Uploaden mislukt: " + (e && e.message ? e.message : e), false);
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    if (!supa()) { setTimeout(init, 150); return; }
    vulPerioden();
    laadMedewerkers().then(function () {
      vulJoVelden();
      laadLijst();
      laadJoLijst();
    });
    var btn = $("ls-upload-btn");
    if (btn) btn.addEventListener("click", upload);
    var joBtn = $("jo-upload-btn");
    if (joBtn) joBtn.addEventListener("click", joUpload);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
