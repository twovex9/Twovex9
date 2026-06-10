/* global window, document, FileReader */
/**
 * mijn-documenten.js — self-service "Mijn documenten" op de Mijn gegevens-pagina.
 *
 * Video-feedback eigenaar 2026-06-07 (spraakmemo): elke medewerker moet zijn EIGEN
 * dossier kunnen INZIEN en zelf documenten kunnen TOEVOEGEN (bv. een vernieuwde
 * ID-kaart of VOG) — maar NIET kunnen verwijderen. Verwijderen blijft HR-only.
 *
 * Bron-van-waarheid: window.medewerkerDocsDB (tabel medewerker_documenten + Storage
 * bucket medewerker-documenten). Gescoped op het eigen profiel (profiles.medewerker_id).
 */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDatumNL(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "-" + p(d.getMonth() + 1) + "-" + d.getFullYear();
  }

  function meId() {
    try {
      var p = (window.profilesDB && window.profilesDB.getCurrentSync) ? window.profilesDB.getCurrentSync() : window.besaCurrentProfile;
      return p ? (p.medewerkerId || p.medewerker_id || null) : null;
    } catch (e) { return null; }
  }

  function ownDocs() {
    var id = meId();
    if (!id || !window.medewerkerDocsDB || !window.medewerkerDocsDB.listSync) return [];
    return (window.medewerkerDocsDB.listSync(id) || []).filter(function (d) { return d && !d.archived; });
  }

  function render() {
    var tb = $("md-tbody");
    if (!tb) return;
    var addBtn = $("md-add-btn");
    var id = meId();
    if (!id) {
      if (addBtn) addBtn.hidden = true;
      tb.innerHTML = '<tr><td colspan="5" class="mu-empty">Je account is nog niet aan een medewerker gekoppeld. Vraag HR of de planner om je te koppelen, dan zie je hier je eigen dossier.</td></tr>';
      return;
    }
    if (addBtn) addBtn.hidden = false;

    var docs = ownDocs().slice().sort(function (a, b) {
      return String(b.uploaddatum || "").localeCompare(String(a.uploaddatum || ""));
    });
    if (!docs.length) {
      tb.innerHTML = '<tr><td colspan="5" class="mu-empty">Nog geen documenten in je dossier. Klik op "+ Document toevoegen" om er een toe te voegen.</td></tr>';
      return;
    }
    tb.innerHTML = docs.map(function (d) {
      // De bucket is PRIVATE: de gecachte signed URL kan verlopen zijn (TTL 1u).
      // Daarom geen statische href, maar een link die bij de klik een VERSE
      // signed URL mint (zie openOwnDoc).
      var bestand = (d.storagePath || d.fileData)
        ? '<a href="#" class="md-open-link" data-doc-id="' + esc(d.id) + '">' + esc(d.fileName || "Bekijk") + "</a>"
        : "—";
      return "<tr>" +
        "<td>" + esc(d.naam || "—") + "</td>" +
        "<td>" + esc(d.type || "—") + "</td>" +
        "<td>" + esc(d.vervaldatum ? fmtDatumNL(d.vervaldatum) : "—") + "</td>" +
        "<td>" + esc(fmtDatumNL(d.uploaddatum)) + "</td>" +
        "<td>" + bestand + "</td>" +
        "</tr>";
    }).join("");
  }

  function openUrlInNewTab(url) {
    var a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Opent een eigen document. Mint bij élke klik een VERSE signed URL (de
  // gecachte fileData heeft TTL 1u → kan verlopen zijn). Popup-veilig: tabblad
  // synchroon openen binnen de klik, daarna redirecten.
  function openOwnDoc(docId) {
    var doc = ownDocs().find(function (d) { return String(d.id) === String(docId); });
    if (!doc || (!doc.storagePath && !doc.fileData)) return;
    if (!doc.storagePath || !window.medewerkerDocsDB || typeof window.medewerkerDocsDB.getSignedUrl !== "function") {
      if (doc.fileData) openUrlInNewTab(doc.fileData);
      return;
    }
    var win = null;
    try { win = window.open("", "_blank"); } catch (e) { win = null; }
    if (!win) {
      if (doc.fileData) openUrlInNewTab(doc.fileData);
      return;
    }
    try { win.opener = null; } catch (e) { /* */ }
    window.medewerkerDocsDB.getSignedUrl(doc.storagePath).then(function (freshUrl) {
      var target = freshUrl || doc.fileData || "";
      if (!target) { try { win.close(); } catch (e) { /* */ } return; }
      try { win.location.replace(target); } catch (e) { win.location.href = target; }
    }).catch(function () {
      if (doc.fileData) { try { win.location.replace(doc.fileData); } catch (e) { /* */ } }
      else { try { win.close(); } catch (e) { /* */ } }
    });
  }

  // --- Modal -------------------------------------------------------------------
  function showModal() {
    var m = $("md-modal"); if (!m) return;
    $("md-naam").value = ""; $("md-type").value = ""; $("md-vervaldatum").value = ""; $("md-file").value = "";
    var err = $("md-error"); if (err) { err.hidden = true; err.textContent = ""; }
    m.hidden = false; m.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    try { $("md-naam").focus(); } catch (e) {}
  }
  function hideModal() {
    var m = $("md-modal"); if (!m) return;
    m.hidden = true; m.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Kon bestand niet lezen.")); };
      fr.readAsDataURL(file);
    });
  }

  async function submit(ev) {
    ev.preventDefault();
    var id = meId();
    var err = $("md-error");
    if (err) { err.hidden = true; err.textContent = ""; }
    function fail(msg) { if (err) { err.hidden = false; err.textContent = msg; } }
    if (!id) { fail("Je account is niet aan een medewerker gekoppeld."); return; }
    var naam = ($("md-naam").value || "").trim();
    var type = $("md-type").value || "";
    var vervaldatum = $("md-vervaldatum").value || "";
    var fileEl = $("md-file");
    var file = fileEl && fileEl.files ? fileEl.files[0] : null;
    if (!naam) { fail("Geef het document een naam."); return; }
    if (!file) { fail("Kies een bestand om te uploaden."); return; }
    if (file.size > 20 * 1024 * 1024) { fail("Bestand is te groot (max 20 MB)."); return; }

    var btn = $("md-submit"); var orig = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Bezig…"; }
    try {
      var dataUrl = await readFileAsDataUrl(file);
      await window.medewerkerDocsDB.add({
        medewerkerId: id,
        naam: naam,
        type: type,
        vervaldatum: vervaldatum,
        fileData: dataUrl,
        fileName: file.name || naam,
        fileMime: file.type || "",
      });
      if (window.showActionFeedback) window.showActionFeedback("saved", "Document");
      hideModal();
      render();
    } catch (e) {
      fail("Toevoegen mislukt: " + (e && e.message ? e.message : String(e)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  }

  function wire() {
    var addBtn = $("md-add-btn");
    if (addBtn) addBtn.addEventListener("click", showModal);
    // Gedelegeerd op de (persistente) tbody — overleeft elke render().
    var tb = $("md-tbody");
    if (tb) tb.addEventListener("click", function (e) {
      var link = e.target && e.target.closest ? e.target.closest(".md-open-link") : null;
      if (!link) return;
      e.preventDefault();
      openOwnDoc(link.getAttribute("data-doc-id"));
    });
    var form = $("md-form");
    if (form) form.addEventListener("submit", submit);
    var close = $("md-close"); if (close) close.addEventListener("click", hideModal);
    var cancel = $("md-cancel"); if (cancel) cancel.addEventListener("click", hideModal);
    var modal = $("md-modal");
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) hideModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && !modal.hidden) hideModal();
    });
    window.addEventListener("besa:profile-updated", render);
    window.addEventListener("besa:medewerker-documenten-updated", render);
  }

  function start() {
    if (!$("md-tbody")) return;
    wire();
    render();
    // Verse server-fetch zodra profiel + data-laag klaar zijn.
    var waits = [];
    if (window.profilesDB && window.profilesDB.ready) waits.push(Promise.resolve(window.profilesDB.ready).catch(function () {}));
    Promise.all(waits).then(function () {
      render();
      var id = meId();
      if (id && window.medewerkerDocsDB && window.medewerkerDocsDB.list) {
        window.medewerkerDocsDB.list(id).then(render).catch(function () {});
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
